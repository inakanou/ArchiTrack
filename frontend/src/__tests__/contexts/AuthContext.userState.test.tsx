/**
 * AuthContext の利用者の状態の取り扱い（user-authentication タスク47.6）
 *
 * 実物の ApiClient と TokenRefreshManager を使い、通信（fetch）だけを差し替えて確かめる。
 *
 * - 制限中の利用者（2FA 未登録・初回のパスワード変更中）は `/me` も 403 になるため、再読み込みの
 *   初期化はリフレッシュの応答の利用者で復元し、`/me` を呼ばない
 * - API の 403（`TWO_FACTOR_SETUP_REQUIRED`・`PASSWORD_CHANGE_REQUIRED`）を受けたら利用者の状態を更新する
 *   （ProtectedRoute の制限に委ねる。design.md「Error Handling」）
 * - 招待経由の登録の応答でセッションを始める（`establishSession`。要件34.5）
 * - 2FA の有効化の応答の利用者で状態を更新する（`updateUser`。要件34.4）
 *
 * @requirement user-authentication/REQ-34.1
 * @requirement user-authentication/REQ-34.5
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { useContext } from 'react';
import { AuthProvider, AuthContext, type AuthContextValue } from '../../contexts/AuthContext';
import { apiClient } from '../../api/client';

vi.mock('../../utils/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), exception: vi.fn() },
  default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), exception: vi.fn() },
}));

const ACTIVE_USER = {
  id: 'user-1',
  email: 'user@example.com',
  displayName: 'User',
  roles: ['user'],
  twoFactorEnabled: true,
  mustChangePassword: false,
};

interface RecordedRequest {
  path: string;
  method: string;
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function installFetch(
  routes: Record<string, () => { status: number; body: unknown }>
): RecordedRequest[] {
  const recorded: RecordedRequest[] = [];
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const request = { path: url.pathname, method: init?.method ?? 'GET' };
    recorded.push(request);
    const handler = routes[`${request.method} ${request.path}`];
    if (!handler) {
      return jsonResponse(404, { error: `unexpected ${request.method} ${request.path}` });
    }
    const { status, body } = handler();
    return jsonResponse(status, body);
  }) as typeof globalThis.fetch;
  return recorded;
}

let latestContext: AuthContextValue | undefined;

function Probe() {
  const context = useContext(AuthContext);
  latestContext = context;
  if (!context) {
    return null;
  }
  return (
    <div>
      <div data-testid="initialized">{context.isInitialized ? 'yes' : 'no'}</div>
      <div data-testid="user">{context.user ? JSON.stringify(context.user) : 'no-user'}</div>
    </div>
  );
}

function renderProvider(): void {
  render(
    <AuthProvider>
      <Probe />
    </AuthProvider>
  );
}

function currentUser(): Record<string, unknown> | null {
  const text = screen.getByTestId('user').textContent ?? '';
  return text === 'no-user' ? null : (JSON.parse(text) as Record<string, unknown>);
}

describe('AuthContext - 利用者の状態（タスク47.6）', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    apiClient.setAccessToken(null);
    apiClient.setTokenRefreshCallback(null);
    apiClient.setSessionExpiredCallback(null);
    latestContext = undefined;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    apiClient.setAccessToken(null);
    apiClient.setTokenRefreshCallback(null);
    apiClient.setSessionExpiredCallback(null);
    vi.restoreAllMocks();
  });

  it.each([
    ['2FA 未登録', { twoFactorEnabled: false, mustChangePassword: false }],
    ['初回のパスワード変更中', { twoFactorEnabled: false, mustChangePassword: true }],
  ])(
    '%s の利用者の再読み込みはリフレッシュの応答で復元し、/me を呼ばない',
    async (_label, flags) => {
      const refreshedUser = { ...ACTIVE_USER, ...flags };
      const recorded = installFetch({
        'GET /csrf-token': () => ({ status: 200, body: { csrfToken: 'csrf' } }),
        'POST /api/v1/auth/refresh': () => ({
          status: 200,
          body: { accessToken: 'access', user: refreshedUser },
        }),
        'GET /api/v1/auth/me': () => ({ status: 403, body: { code: 'TWO_FACTOR_SETUP_REQUIRED' } }),
      });

      renderProvider();

      await waitFor(() => expect(screen.getByTestId('initialized')).toHaveTextContent('yes'));
      expect(currentUser()).toEqual(refreshedUser);
      expect(recorded.some((r) => r.path === '/api/v1/auth/me')).toBe(false);
    }
  );

  it('制限の無い利用者の再読み込みは従来どおり /me で権限を補う', async () => {
    const recorded = installFetch({
      'GET /csrf-token': () => ({ status: 200, body: { csrfToken: 'csrf' } }),
      'POST /api/v1/auth/refresh': () => ({
        status: 200,
        body: { accessToken: 'access', user: ACTIVE_USER },
      }),
      'GET /api/v1/auth/me': () => ({
        status: 200,
        body: { ...ACTIVE_USER, permissions: ['project:read'] },
      }),
    });

    renderProvider();

    await waitFor(() => expect(screen.getByTestId('initialized')).toHaveTextContent('yes'));
    expect(recorded.some((r) => r.path === '/api/v1/auth/me')).toBe(true);
    expect(currentUser()).toMatchObject({ permissions: ['project:read'] });
  });

  it.each([
    ['TWO_FACTOR_SETUP_REQUIRED', { twoFactorEnabled: false, mustChangePassword: false }],
    ['PASSWORD_CHANGE_REQUIRED', { twoFactorEnabled: true, mustChangePassword: true }],
  ])('API の 403 %s を受けたら利用者の状態を更新する', async (code, expected) => {
    installFetch({
      'GET /csrf-token': () => ({ status: 200, body: { csrfToken: 'csrf' } }),
      'POST /api/v1/auth/refresh': () => ({
        status: 200,
        body: { accessToken: 'access', user: ACTIVE_USER },
      }),
      'GET /api/v1/auth/me': () => ({ status: 200, body: ACTIVE_USER }),
      'GET /api/projects': () => ({ status: 403, body: { code } }),
    });
    renderProvider();
    await waitFor(() => expect(currentUser()).toMatchObject({ twoFactorEnabled: true }));

    await act(async () => {
      await expect(apiClient.get('/api/projects')).rejects.toMatchObject({ statusCode: 403 });
    });

    await waitFor(() => expect(currentUser()).toMatchObject(expected));
  });

  it('establishSession は登録の応答の利用者とアクセストークンでセッションを始める', async () => {
    installFetch({
      'GET /csrf-token': () => ({ status: 200, body: { csrfToken: 'csrf' } }),
      'POST /api/v1/auth/refresh': () => ({ status: 400, body: { code: 'MISSING_REFRESH_TOKEN' } }),
    });
    renderProvider();
    await waitFor(() => expect(screen.getByTestId('initialized')).toHaveTextContent('yes'));
    const registered = { ...ACTIVE_USER, twoFactorEnabled: false };

    act(() => {
      latestContext!.establishSession({ user: registered, accessToken: 'registered-access' });
    });

    expect(currentUser()).toEqual(registered);
    expect(apiClient.getAccessToken()).toBe('registered-access');
  });

  it('updateUser は利用者の状態を部分的に更新し、未ログインでは何もしない', async () => {
    installFetch({
      'GET /csrf-token': () => ({ status: 200, body: { csrfToken: 'csrf' } }),
      'POST /api/v1/auth/refresh': () => ({ status: 400, body: { code: 'MISSING_REFRESH_TOKEN' } }),
    });
    renderProvider();
    await waitFor(() => expect(screen.getByTestId('initialized')).toHaveTextContent('yes'));

    act(() => {
      latestContext!.updateUser({ twoFactorEnabled: true });
    });
    expect(currentUser()).toBeNull();

    act(() => {
      latestContext!.establishSession({
        user: { ...ACTIVE_USER, twoFactorEnabled: false },
        accessToken: 'a',
      });
    });
    act(() => {
      latestContext!.updateUser({ twoFactorEnabled: true });
    });

    expect(currentUser()).toEqual({ ...ACTIVE_USER, twoFactorEnabled: true });
  });
});
