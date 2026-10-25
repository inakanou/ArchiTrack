import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { waitFor } from '@testing-library/react';
import { renderHook, act } from '@testing-library/react';
import { AuthProvider } from '../../contexts/AuthContext';
import { useAuth } from '../../hooks/useAuth';
import { apiClient } from '../../api/client';

// loggerをモック（テスト出力をクリーンに保つため）
vi.mock('../../utils/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    exception: vi.fn(),
  },
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    exception: vi.fn(),
  },
}));

/**
 * パスごとの応答
 *
 * 値が関数のときは呼び出しごとに評価する。Error を投げると通信の失敗になる。
 */
type RouteReply = { status: number; body: unknown } | (() => { status: number; body: unknown });

type Routes = Record<string, RouteReply>;

/** 初期化の既定の応答: CSRF トークンは取れ、リフレッシュの Cookie は無い（400） */
const NO_COOKIE_ROUTES: Routes = {
  'GET /csrf-token': { status: 200, body: { csrfToken: 'csrf-token' } },
  'POST /api/v1/auth/refresh': {
    status: 400,
    body: { error: 'Refresh token is required', code: 'VALIDATION_ERROR' },
  },
};

/**
 * fetch をメソッドとパスで応答を返す代替に差し替える（記録した要求を返す）
 */
function mockFetch(routes: Routes): Array<{ key: string; init?: RequestInit }> {
  const calls: Array<{ key: string; init?: RequestInit }> = [];
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const key = `${init?.method ?? 'GET'} ${url.pathname}`;
    calls.push({ key, init });
    const reply = routes[key];
    if (!reply) {
      throw new Error(`Unexpected URL: ${key}`);
    }
    const { status, body } = typeof reply === 'function' ? reply() : reply;
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof globalThis.fetch;
  return calls;
}

const mockUser = {
  id: '1',
  email: 'test@example.com',
  displayName: 'Test User',
};

describe('AuthContext', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    localStorage.clear();
    mockFetch(NO_COOKIE_ROUTES);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    localStorage.clear();
    // apiClientの状態をクリア（テスト間で共有されるため）
    apiClient.setTokenRefreshCallback(null);
    apiClient.setSessionExpiredCallback(null);
    apiClient.clearCredentials();
    vi.clearAllMocks();
  });

  describe('初期状態', () => {
    it('リフレッシュの Cookie がない場合、isLoadingがfalseになること', async () => {
      const { result } = renderHook(() => useAuth(), {
        wrapper: AuthProvider,
      });

      // Cookie が無いリフレッシュは 400 になり、未認証で初期化を終える
      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
        expect(result.current.isAuthenticated).toBe(false);
        expect(result.current.user).toBeNull();
        expect(result.current.sessionExpired).toBe(false);
      });
    });

    it('リフレッシュの Cookie がある場合、セッション復元後にisLoadingがfalseになること', async () => {
      mockFetch({
        ...NO_COOKIE_ROUTES,
        'POST /api/v1/auth/refresh': {
          status: 200,
          body: { accessToken: 'new-access-token', user: mockUser },
        },
        // /api/v1/auth/me のモック（APIは直接ユーザーオブジェクトを返す）
        'GET /api/v1/auth/me': { status: 200, body: mockUser },
      });

      const { result } = renderHook(() => useAuth(), {
        wrapper: AuthProvider,
      });

      // 初期状態ではisLoading=true
      expect(result.current.isLoading).toBe(true);

      // セッション復元完了後、isLoading=falseになる
      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
        expect(result.current.isAuthenticated).toBe(true);
        expect(result.current.user).toEqual(mockUser);
      });
      expect(apiClient.getAccessToken()).toBe('new-access-token');
    });
  });

  describe('login', () => {
    it('ログインに成功するとisAuthenticatedがtrueになること', async () => {
      mockFetch({
        ...NO_COOKIE_ROUTES,
        'POST /api/v1/auth/login': {
          status: 200,
          body: {
            type: 'SUCCESS',
            user: mockUser,
            accessToken: 'test-access-token',
            refreshToken: 'test-refresh-token',
            expiresIn: 900000, // 15分
          },
        },
      });

      const { result } = renderHook(() => useAuth(), {
        wrapper: AuthProvider,
      });
      await waitFor(() => expect(result.current.isInitialized).toBe(true));

      await act(async () => {
        await result.current.login('test@example.com', 'password123');
      });

      await waitFor(() => {
        expect(result.current.isAuthenticated).toBe(true);
        expect(result.current.user).toEqual(mockUser);
        expect(result.current.isLoading).toBe(false);
      });
      expect(apiClient.getAccessToken()).toBe('test-access-token');
      // トークンを永続ストレージに書かない（要件33.8, 33.10）
      expect(localStorage.length).toBe(0);
    });

    it('ログイン失敗時にエラーをスローすること', async () => {
      mockFetch({
        ...NO_COOKIE_ROUTES,
        'POST /api/v1/auth/login': { status: 401, body: { error: 'Invalid credentials' } },
      });

      const { result } = renderHook(() => useAuth(), {
        wrapper: AuthProvider,
      });
      await waitFor(() => expect(result.current.isInitialized).toBe(true));

      await expect(
        act(async () => {
          await result.current.login('test@example.com', 'wrong-password');
        })
      ).rejects.toThrow();

      expect(result.current.isAuthenticated).toBe(false);
      expect(result.current.user).toBeNull();
    });
  });

  describe('logout', () => {
    it('ログアウト後は未認証状態になること', async () => {
      const calls = mockFetch({
        ...NO_COOKIE_ROUTES,
        'POST /api/v1/auth/login': {
          status: 200,
          body: {
            type: 'SUCCESS',
            user: mockUser,
            accessToken: 'test-access-token',
            refreshToken: 'test-refresh-token',
            expiresIn: 900000,
          },
        },
        'POST /api/v1/auth/logout': { status: 200, body: { success: true } },
      });

      const { result } = renderHook(() => useAuth(), {
        wrapper: AuthProvider,
      });
      await waitFor(() => expect(result.current.isInitialized).toBe(true));

      await act(async () => {
        await result.current.login('test@example.com', 'password123');
      });

      await act(async () => {
        await result.current.logout();
      });

      await waitFor(() => {
        expect(result.current.isAuthenticated).toBe(false);
        expect(result.current.user).toBeNull();
      });
      expect(apiClient.getAccessToken()).toBeNull();
      const logoutCall = calls.find((c) => c.key === 'POST /api/v1/auth/logout');
      expect(logoutCall?.init?.body).toBeUndefined();
      expect((logoutCall?.init?.headers as Record<string, string>)['X-CSRF-Token']).toBe(
        'csrf-token'
      );
    });
  });

  describe('2FA認証', () => {
    const requires2FARoutes: Routes = {
      ...NO_COOKIE_ROUTES,
      'POST /api/v1/auth/login': {
        status: 200,
        body: { requires2FA: true, challengeToken: 'challenge-abc', expiresIn: 300 },
      },
    };

    it('2FA要求時にtwoFactorStateが設定されること', async () => {
      mockFetch(requires2FARoutes);

      const { result } = renderHook(() => useAuth(), {
        wrapper: AuthProvider,
      });
      await waitFor(() => expect(result.current.isInitialized).toBe(true));

      await act(async () => {
        await result.current.login('test@example.com', 'password123');
      });

      await waitFor(() => {
        expect(result.current.twoFactorState).toEqual({
          required: true,
          challengeToken: 'challenge-abc',
        });
        expect(result.current.isAuthenticated).toBe(false);
      });
    });

    it('verify2FAで2FA認証を完了できること', async () => {
      mockFetch({
        ...requires2FARoutes,
        'POST /api/v1/auth/verify-2fa': {
          status: 200,
          body: {
            accessToken: 'test-access-token',
            refreshToken: 'test-refresh-token',
            user: mockUser,
            expiresIn: 900000,
          },
        },
      });

      const { result } = renderHook(() => useAuth(), {
        wrapper: AuthProvider,
      });
      await waitFor(() => expect(result.current.isInitialized).toBe(true));

      await act(async () => {
        await result.current.login('test@example.com', 'password123');
      });

      await waitFor(() => {
        expect(result.current.twoFactorState?.required).toBe(true);
      });

      await act(async () => {
        await result.current.verify2FA('123456');
      });

      await waitFor(() => {
        expect(result.current.isAuthenticated).toBe(true);
        expect(result.current.user).toEqual(mockUser);
        expect(result.current.twoFactorState).toBeNull();
      });
      expect(apiClient.getAccessToken()).toBe('test-access-token');
      expect(localStorage.length).toBe(0);
    });

    it('verifyBackupCodeでバックアップコード認証を完了できること', async () => {
      mockFetch({
        ...requires2FARoutes,
        'POST /api/v1/auth/verify-2fa/backup': {
          status: 200,
          body: {
            accessToken: 'test-access-token',
            refreshToken: 'test-refresh-token',
            user: mockUser,
          },
        },
      });

      const { result } = renderHook(() => useAuth(), {
        wrapper: AuthProvider,
      });
      await waitFor(() => expect(result.current.isInitialized).toBe(true));

      await act(async () => {
        await result.current.login('test@example.com', 'password123');
      });

      await waitFor(() => {
        expect(result.current.twoFactorState?.required).toBe(true);
      });

      await act(async () => {
        await result.current.verifyBackupCode('ABCD1234');
      });

      await waitFor(() => {
        expect(result.current.isAuthenticated).toBe(true);
        expect(result.current.twoFactorState).toBeNull();
      });
      expect(localStorage.length).toBe(0);
    });

    it('cancel2FAで2FA状態をクリアできること', async () => {
      mockFetch(requires2FARoutes);

      const { result } = renderHook(() => useAuth(), {
        wrapper: AuthProvider,
      });
      await waitFor(() => expect(result.current.isInitialized).toBe(true));

      await act(async () => {
        await result.current.login('test@example.com', 'password123');
      });

      await waitFor(() => {
        expect(result.current.twoFactorState?.required).toBe(true);
      });

      // キャンセル
      act(() => {
        result.current.cancel2FA();
      });

      expect(result.current.twoFactorState).toBeNull();
    });

    it('verify2FAがtwoFactorState未設定時にエラーをスローすること', async () => {
      const { result } = renderHook(() => useAuth(), {
        wrapper: AuthProvider,
      });

      await waitFor(() => {
        expect(result.current.isInitialized).toBe(true);
      });

      await expect(
        act(async () => {
          await result.current.verify2FA('123456');
        })
      ).rejects.toThrow('2FA state not available');
    });

    it('verifyBackupCodeがtwoFactorState未設定時にエラーをスローすること', async () => {
      const { result } = renderHook(() => useAuth(), {
        wrapper: AuthProvider,
      });

      await waitFor(() => {
        expect(result.current.isInitialized).toBe(true);
      });

      await expect(
        act(async () => {
          await result.current.verifyBackupCode('ABCD1234');
        })
      ).rejects.toThrow('2FA state not available');
    });
  });

  describe('セッション管理', () => {
    it('ログインレスポンスが不正な形式の場合エラーをスローすること', async () => {
      mockFetch({
        ...NO_COOKIE_ROUTES,
        // user, accessTokenがない
        'POST /api/v1/auth/login': { status: 200, body: { type: 'SUCCESS' } },
      });

      const { result } = renderHook(() => useAuth(), {
        wrapper: AuthProvider,
      });
      await waitFor(() => expect(result.current.isInitialized).toBe(true));

      await expect(
        act(async () => {
          await result.current.login('test@example.com', 'password123');
        })
      ).rejects.toThrow('Invalid login response format');
    });

    it('clearSessionExpiredでセッション期限切れフラグをクリアできること', async () => {
      // Cookie が拒否されたリフレッシュでセッション期限切れを設定
      mockFetch({
        ...NO_COOKIE_ROUTES,
        'POST /api/v1/auth/refresh': {
          status: 401,
          body: { error: 'Invalid refresh token', code: 'INVALID_REFRESH_TOKEN' },
        },
      });

      const { result } = renderHook(() => useAuth(), {
        wrapper: AuthProvider,
      });

      await waitFor(() => {
        expect(result.current.sessionExpired).toBe(true);
      });

      // クリア
      act(() => {
        result.current.clearSessionExpired();
      });

      expect(result.current.sessionExpired).toBe(false);
    });

    it('ログアウトAPI失敗時もローカル状態がクリアされること', async () => {
      let logoutFails = false;
      mockFetch({
        ...NO_COOKIE_ROUTES,
        'POST /api/v1/auth/login': {
          status: 200,
          body: {
            user: mockUser,
            accessToken: 'test-access-token',
            refreshToken: 'test-refresh-token',
            expiresIn: 900000,
          },
        },
        'POST /api/v1/auth/logout': () => {
          logoutFails = true;
          throw new Error('Network error');
        },
      });

      const { result } = renderHook(() => useAuth(), {
        wrapper: AuthProvider,
      });
      await waitFor(() => expect(result.current.isInitialized).toBe(true));

      await act(async () => {
        await result.current.login('test@example.com', 'password123');
      });

      await waitFor(() => {
        expect(result.current.isAuthenticated).toBe(true);
      });

      await act(async () => {
        await result.current.logout();
      });

      expect(logoutFails).toBe(true);
      await waitFor(() => {
        expect(result.current.isAuthenticated).toBe(false);
        expect(result.current.user).toBeNull();
      });
      expect(apiClient.getAccessToken()).toBeNull();
    });
  });

  describe('トークンリフレッシュ', () => {
    it('Cookie が無い状態で refreshToken を呼ぶとエラーをスローすること', async () => {
      const { result } = renderHook(() => useAuth(), {
        wrapper: AuthProvider,
      });

      await waitFor(() => {
        expect(result.current.isInitialized).toBe(true);
      });

      await expect(
        act(async () => {
          await result.current.refreshToken();
        })
      ).rejects.toThrow('Refresh token is required');
    });

    it('ログイン後に Cookie でトークンをリフレッシュできること', async () => {
      const calls = mockFetch({
        ...NO_COOKIE_ROUTES,
        'POST /api/v1/auth/login': {
          status: 200,
          body: {
            type: 'SUCCESS',
            user: mockUser,
            accessToken: 'initial-access-token',
            refreshToken: 'test-refresh-token',
            expiresIn: 900000,
          },
        },
      });

      const { result } = renderHook(() => useAuth(), {
        wrapper: AuthProvider,
      });
      await waitFor(() => expect(result.current.isInitialized).toBe(true));

      await act(async () => {
        await result.current.login('test@example.com', 'password123');
      });

      // ログイン後は Cookie がある
      mockFetch({
        ...NO_COOKIE_ROUTES,
        'POST /api/v1/auth/refresh': {
          status: 200,
          body: { accessToken: 'refreshed-access-token', user: mockUser },
        },
      });
      expect(calls.length).toBeGreaterThan(0);

      // 手動でリフレッシュを実行
      await act(async () => {
        const newToken = await result.current.refreshToken();
        expect(newToken).toBe('refreshed-access-token');
      });
      expect(apiClient.getAccessToken()).toBe('refreshed-access-token');
      expect(localStorage.length).toBe(0);
    });

    it('expiresInがない場合も正常にログインできること', async () => {
      mockFetch({
        ...NO_COOKIE_ROUTES,
        'POST /api/v1/auth/login': {
          status: 200,
          body: {
            user: mockUser,
            accessToken: 'test-access-token',
            // expiresInなし
          },
        },
      });

      const { result } = renderHook(() => useAuth(), {
        wrapper: AuthProvider,
      });
      await waitFor(() => expect(result.current.isInitialized).toBe(true));

      await act(async () => {
        await result.current.login('test@example.com', 'password123');
      });

      await waitFor(() => {
        expect(result.current.isAuthenticated).toBe(true);
        expect(result.current.user).toEqual(mockUser);
      });
    });
  });

  describe('セッション復元詳細', () => {
    it('認証エラー（401）の場合セッション期限切れとなること', async () => {
      mockFetch({
        ...NO_COOKIE_ROUTES,
        'POST /api/v1/auth/refresh': {
          status: 401,
          body: { error: 'Invalid refresh token', code: 'INVALID_REFRESH_TOKEN' },
        },
      });

      const { result } = renderHook(() => useAuth(), {
        wrapper: AuthProvider,
      });

      await waitFor(() => {
        expect(result.current.isInitialized).toBe(true);
        expect(result.current.sessionExpired).toBe(true);
        expect(result.current.user).toBeNull();
      });
    });

    it('ネットワークエラーでリフレッシュできない場合はセッション期限切れとなること', async () => {
      mockFetch({
        ...NO_COOKIE_ROUTES,
        'POST /api/v1/auth/refresh': () => {
          throw new Error('Network error');
        },
      });

      const { result } = renderHook(() => useAuth(), {
        wrapper: AuthProvider,
      });

      await waitFor(() => {
        expect(result.current.isInitialized).toBe(true);
        expect(result.current.sessionExpired).toBe(true);
        expect(result.current.user).toBeNull();
      });
    });

    it('利用者の情報の取得に失敗してもリフレッシュの応答の利用者で復元すること', async () => {
      mockFetch({
        ...NO_COOKIE_ROUTES,
        'POST /api/v1/auth/refresh': {
          status: 200,
          body: { accessToken: 'new-access-token', user: mockUser },
        },
        'GET /api/v1/auth/me': { status: 404, body: { error: 'User not found' } },
      });

      const { result } = renderHook(() => useAuth(), {
        wrapper: AuthProvider,
      });

      await waitFor(() => {
        expect(result.current.isInitialized).toBe(true);
        expect(result.current.user).toEqual(mockUser);
      });
    });

    it('リフレッシュの応答に利用者が無く、利用者の情報も取れないときは未認証になること', async () => {
      mockFetch({
        ...NO_COOKIE_ROUTES,
        'POST /api/v1/auth/refresh': {
          status: 200,
          body: { accessToken: 'new-access-token' },
        },
        'GET /api/v1/auth/me': { status: 404, body: { error: 'User not found' } },
      });

      const { result } = renderHook(() => useAuth(), {
        wrapper: AuthProvider,
      });

      await waitFor(() => {
        expect(result.current.isInitialized).toBe(true);
        expect(result.current.sessionExpired).toBe(true);
        expect(result.current.user).toBeNull();
      });
      expect(apiClient.getAccessToken()).toBeNull();
    });
  });

  /**
   * 要件30.14, 30.15: sessionExpiredDuringOperation状態管理
   * AuthContextがonSessionExpiredコールバックを受信した場合の状態遷移をテスト
   */
  describe('sessionExpiredDuringOperation（操作中セッション切れ）', () => {
    it('初期状態でsessionExpiredDuringOperationがfalseであること', async () => {
      const { result } = renderHook(() => useAuth(), {
        wrapper: AuthProvider,
      });

      await waitFor(() => {
        expect(result.current.isInitialized).toBe(true);
      });

      expect(result.current.sessionExpiredDuringOperation).toBe(false);
    });

    it('handleReauthSuccess関数が公開されていること', async () => {
      const { result } = renderHook(() => useAuth(), {
        wrapper: AuthProvider,
      });

      await waitFor(() => {
        expect(result.current.isInitialized).toBe(true);
      });

      expect(typeof result.current.handleReauthSuccess).toBe('function');
    });

    /**
     * 要件30.9: 再認証の成功で、アクセストークンを更新し TokenRefreshManager を再初期化する
     * （ログイン・2FA の検証と同じセッションの開始の経路を通る）
     */
    it('handleReauthSuccessは再認証の応答でアクセストークンを更新し、リフレッシュとセッション切れの経路を張り直すこと', async () => {
      const setRefreshSpy = vi.spyOn(apiClient, 'setTokenRefreshCallback');
      const setExpiredSpy = vi.spyOn(apiClient, 'setSessionExpiredCallback');
      const { result } = renderHook(() => useAuth(), {
        wrapper: AuthProvider,
      });

      await waitFor(() => {
        expect(result.current.isInitialized).toBe(true);
      });
      setRefreshSpy.mockClear();
      setExpiredSpy.mockClear();

      act(() => {
        result.current.handleReauthSuccess({ accessToken: 'reauth-token', user: mockUser });
      });

      expect(apiClient.getAccessToken()).toBe('reauth-token');
      expect(result.current.user).toEqual(mockUser);
      expect(result.current.sessionExpiredDuringOperation).toBe(false);
      expect(setRefreshSpy).toHaveBeenCalledWith(expect.any(Function));
      expect(setExpiredSpy).toHaveBeenCalledWith(expect.any(Function));
      setRefreshSpy.mockRestore();
      setExpiredSpy.mockRestore();
    });

    it('navigateToLogin関数が公開されていること', async () => {
      const { result } = renderHook(() => useAuth(), {
        wrapper: AuthProvider,
      });

      await waitFor(() => {
        expect(result.current.isInitialized).toBe(true);
      });

      expect(typeof result.current.navigateToLogin).toBe('function');
    });
  });
});
