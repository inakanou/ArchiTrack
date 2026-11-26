/**
 * ApiClient の CSRF トークン付きの公開の送信手段のテスト（user-authentication タスク78.1）
 *
 * 同意の API（タスク74.3）と接続の取り消しの API（タスク77.1）は、状態を変える要求に既存の CSRF の検証
 * （`X-CSRF-Token` と Cookie `csrf-token` の一致）を掛ける。画面はメモリの CSRF トークンを付けて送り、
 * 不一致・欠落（403 `CSRF_TOKEN_INVALID`・`CSRF_TOKEN_MISSING`）のときだけ一度取り直して一度だけ送り直す。
 * 78.2・78.3 もこの手段を使う。
 *
 * @requirement user-authentication/REQ-47.11
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ApiError, apiClient } from '../../api/client';

vi.mock('../../utils/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), exception: vi.fn() },
  default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), exception: vi.fn() },
}));

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function headersOf(fetchMock: ReturnType<typeof vi.fn>, index: number): Record<string, string> {
  const init = fetchMock.mock.calls[index]?.[1] as RequestInit;
  return init.headers as Record<string, string>;
}

describe('ApiClient.sendWithCsrf（CSRF トークン付きの状態を変える要求）', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    apiClient.clearCredentials();
    apiClient.setTokenRefreshCallback(null);
    apiClient.setSessionExpiredCallback(null);
    apiClient.setAccessToken('access-token');
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    apiClient.clearCredentials();
    vi.clearAllMocks();
  });

  it('CSRF トークンが無ければ取得してから、本文・Bearer・X-CSRF-Token を付けて送る', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, { csrfToken: 'csrf-1' }))
      .mockResolvedValueOnce(jsonResponse(200, { redirectTo: 'https://issuer.example/resume' }));
    globalThis.fetch = fetchMock as typeof globalThis.fetch;

    const result = await apiClient.sendWithCsrf<{ redirectTo: string }>(
      'POST',
      '/oauth/interaction/x/approve',
      { scopes: ['read'] }
    );

    expect(result).toEqual({ redirectTo: 'https://issuer.example/resume' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('http://localhost:3000/csrf-token');
    const [url, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(url).toBe('http://localhost:3000/oauth/interaction/x/approve');
    expect(init.method).toBe('POST');
    expect(init.body).toBe(JSON.stringify({ scopes: ['read'] }));
    expect(init.credentials).toBe('include');
    expect(headersOf(fetchMock, 1)['X-CSRF-Token']).toBe('csrf-1');
    expect(headersOf(fetchMock, 1)['Authorization']).toBe('Bearer access-token');
  });

  it('メモリに CSRF トークンがあれば取り直さずに使う', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, { csrfToken: 'csrf-kept' }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    globalThis.fetch = fetchMock as typeof globalThis.fetch;
    await apiClient.fetchCsrfToken();

    await apiClient.sendWithCsrf('DELETE', '/api/v1/external-app-connections/c-1');

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const init = fetchMock.mock.calls[1]?.[1] as RequestInit;
    expect(init.method).toBe('DELETE');
    expect(init.body).toBeUndefined();
    expect(headersOf(fetchMock, 1)['X-CSRF-Token']).toBe('csrf-kept');
  });

  it.each(['CSRF_TOKEN_INVALID', 'CSRF_TOKEN_MISSING'])(
    '403 %s では一度だけ取り直して、新しいトークンで一度だけ送り直す',
    async (code) => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(jsonResponse(200, { csrfToken: 'stale' }))
        .mockResolvedValueOnce(jsonResponse(403, { error: 'csrf', code }))
        .mockResolvedValueOnce(jsonResponse(200, { csrfToken: 'fresh' }))
        .mockResolvedValueOnce(jsonResponse(200, { redirectTo: 'https://issuer.example/r' }));
      globalThis.fetch = fetchMock as typeof globalThis.fetch;

      const result = await apiClient.sendWithCsrf('POST', '/oauth/interaction/x/deny');

      expect(result).toEqual({ redirectTo: 'https://issuer.example/r' });
      expect(fetchMock).toHaveBeenCalledTimes(4);
      expect(fetchMock.mock.calls[2]?.[0]).toBe('http://localhost:3000/csrf-token');
      expect(headersOf(fetchMock, 1)['X-CSRF-Token']).toBe('stale');
      expect(headersOf(fetchMock, 3)['X-CSRF-Token']).toBe('fresh');
    }
  );

  it('送り直しでも不一致なら、それ以上は取り直さずに ApiError を投げる', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, { csrfToken: 'a' }))
      .mockResolvedValueOnce(jsonResponse(403, { code: 'CSRF_TOKEN_INVALID' }))
      .mockResolvedValueOnce(jsonResponse(200, { csrfToken: 'b' }))
      .mockResolvedValueOnce(jsonResponse(403, { code: 'CSRF_TOKEN_INVALID' }));
    globalThis.fetch = fetchMock as typeof globalThis.fetch;

    const request = apiClient.sendWithCsrf('POST', '/oauth/interaction/x/deny');

    await expect(request).rejects.toBeInstanceOf(ApiError);
    await expect(request).rejects.toMatchObject({ statusCode: 403 });
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it.each([
    [403, 'CSRF_ORIGIN_MISMATCH'],
    [403, 'PERMISSION_REQUIRED'],
    [400, 'SECOND_FACTOR_FAILED'],
  ])('%i %s は取り直さず送り直さない', async (status, code) => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, { csrfToken: 'csrf-1' }))
      .mockResolvedValueOnce(jsonResponse(status, { code }));
    globalThis.fetch = fetchMock as typeof globalThis.fetch;

    await expect(
      apiClient.sendWithCsrf('POST', '/oauth/interaction/x/approve')
    ).rejects.toMatchObject({ statusCode: status });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('5xx を自動で送り直さない（同意や取り消しを二重に送らない）', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, { csrfToken: 'csrf-1' }))
      .mockResolvedValue(jsonResponse(503, { code: 'SERVICE_UNAVAILABLE' }));
    globalThis.fetch = fetchMock as typeof globalThis.fetch;

    await expect(
      apiClient.sendWithCsrf('POST', '/oauth/interaction/x/approve')
    ).rejects.toMatchObject({ statusCode: 503 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('アクセストークンの期限切れ（401）では更新してから、その時点の CSRF トークンで送り直す', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, { csrfToken: 'csrf-before' }))
      .mockResolvedValueOnce(jsonResponse(401, { error: 'Unauthorized' }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    globalThis.fetch = fetchMock as typeof globalThis.fetch;
    apiClient.setTokenRefreshCallback(async () => {
      // リフレッシュは CSRF トークンを取り直す（Cookie の csrf-token が置き換わる）
      apiClient['csrfToken'] = 'csrf-after';
      return 'renewed-access-token';
    });

    await apiClient.sendWithCsrf('POST', '/oauth/interaction/x/second-factor', {
      type: 'totp',
      code: '123456',
    });

    expect(headersOf(fetchMock, 2)['X-CSRF-Token']).toBe('csrf-after');
    expect(headersOf(fetchMock, 2)['Authorization']).toBe('Bearer renewed-access-token');
    apiClient.setTokenRefreshCallback(null);
  });
});
