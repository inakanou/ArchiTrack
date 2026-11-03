/**
 * ApiClient の、利用者の状態による 403 の通知のテスト（user-authentication タスク47.6）
 *
 * backend は 2FA 未登録・初回のパスワード変更中の利用者の要求を 403（`TWO_FACTOR_SETUP_REQUIRED`・
 * `PASSWORD_CHANGE_REQUIRED`）で拒否する。API クライアントはそのコードを受けたら利用者の状態の更新を
 * AuthContext へ知らせ、画面の遷移の制限（ProtectedRoute）に委ねる（design.md「Error Handling」）。
 *
 * @requirement user-authentication/REQ-34.2
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ApiError, apiClient } from '../../api/client';

vi.mock('../../utils/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), exception: vi.fn() },
  default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), exception: vi.fn() },
}));

function respond(status: number, body: unknown): void {
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    statusText: 'Forbidden',
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => body,
  });
}

describe('ApiClient（利用者の状態による 403 の通知）', () => {
  let originalFetch: typeof globalThis.fetch;
  let onRestricted: ReturnType<typeof vi.fn<(code: string) => void>>;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    onRestricted = vi.fn<(code: string) => void>();
    apiClient.setUserStateRestrictionCallback(onRestricted);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    apiClient.setUserStateRestrictionCallback(null);
  });

  it.each(['TWO_FACTOR_SETUP_REQUIRED', 'PASSWORD_CHANGE_REQUIRED'])(
    '403 %s を受けたら、コードを添えて通知し ApiError を投げる',
    async (code) => {
      respond(403, { status: 403, code, detail: 'restricted' });

      const request = apiClient.get('/api/projects');

      await expect(request).rejects.toBeInstanceOf(ApiError);
      await expect(request).rejects.toMatchObject({ statusCode: 403 });
      expect(onRestricted).toHaveBeenCalledWith(code);
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    }
  );

  it('状態と関係の無い 403（権限の不足）では通知しない', async () => {
    respond(403, { status: 403, code: 'PERMISSION_DENIED' });

    await expect(apiClient.get('/api/projects')).rejects.toMatchObject({ statusCode: 403 });

    expect(onRestricted).not.toHaveBeenCalled();
  });

  it('403 以外の応答では状態のコードでも通知しない', async () => {
    respond(400, { code: 'TWO_FACTOR_SETUP_REQUIRED' });

    await expect(apiClient.get('/api/projects')).rejects.toMatchObject({ statusCode: 400 });

    expect(onRestricted).not.toHaveBeenCalled();
  });

  it('通知の先が無いときも ApiError を投げる', async () => {
    apiClient.setUserStateRestrictionCallback(null);
    respond(403, { code: 'TWO_FACTOR_SETUP_REQUIRED' });

    await expect(apiClient.get('/api/v1/auth/me')).rejects.toMatchObject({ statusCode: 403 });
  });
});
