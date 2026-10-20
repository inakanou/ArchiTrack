/**
 * @fileoverview AuthContext 2FA機能テスト
 *
 * 未カバーの2FA関連機能をテスト:
 * - verify2FA: TOTPコード検証
 * - verifyBackupCode: バックアップコード検証
 * - cancel2FA: 2FA認証キャンセル
 * - login with requires2FA: 2FA要求時のログインフロー
 */

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

const REQUIRES_2FA_ROUTES: Routes = {
  ...NO_COOKIE_ROUTES,
  'POST /api/v1/auth/login': {
    status: 200,
    body: { requires2FA: true, challengeToken: 'challenge-abc', expiresIn: 300 },
  },
};

/** 送った要求のうち、メソッドとパスが一致する最後のものの本文 */
function lastRequestBody(method: string, path: string): unknown {
  const calls = (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls as Array<
    [RequestInfo | URL, RequestInit | undefined]
  >;
  const matched = calls.filter(
    ([input, init]) =>
      (init?.method ?? 'GET') === method && new URL(String(input)).pathname === path
  );
  const last = matched[matched.length - 1];
  if (!last) {
    throw new Error(`no request: ${method} ${path}`);
  }
  return JSON.parse(String(last[1]?.body));
}

/** fetch をメソッドとパスで応答を返す代替に差し替える */
function mockFetch(routes: Routes): void {
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const key = `${init?.method ?? 'GET'} ${url.pathname}`;
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
}

async function renderInitialized() {
  const rendered = renderHook(() => useAuth(), { wrapper: AuthProvider });
  await waitFor(() => expect(rendered.result.current.isInitialized).toBe(true));
  return rendered;
}

describe('AuthContext - 2FA機能', () => {
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

  describe('login with 2FA required', () => {
    it('2FAが必要な場合、twoFactorStateが設定されること', async () => {
      mockFetch(REQUIRES_2FA_ROUTES);
      const { result } = await renderInitialized();

      await act(async () => {
        await result.current.login('test@example.com', 'password123');
      });

      await waitFor(() => {
        expect(result.current.twoFactorState).toEqual({
          required: true,
          challengeToken: 'challenge-abc',
        });
        expect(result.current.isAuthenticated).toBe(false);
        expect(result.current.isLoading).toBe(false);
      });
    });
  });

  describe('verify2FA', () => {
    it('2FA検証成功後に認証状態になること', async () => {
      const mockUser = {
        id: '1',
        email: 'test@example.com',
        displayName: 'Test User',
        twoFactorEnabled: true,
      };
      mockFetch({
        ...REQUIRES_2FA_ROUTES,
        'POST /api/v1/auth/verify-2fa': {
          status: 200,
          body: {
            accessToken: 'new-access-token',
            refreshToken: 'new-refresh-token',
            user: mockUser,
            expiresIn: 900000,
          },
        },
      });
      const { result } = await renderInitialized();

      // ログイン（2FA要求）
      await act(async () => {
        await result.current.login('test@example.com', 'password123');
      });

      expect(result.current.twoFactorState).not.toBeNull();

      // 2FA検証
      await act(async () => {
        await result.current.verify2FA('123456');
      });

      // ログインの応答の 2FA 待ちの資格を送り、メールアドレスを送らない（要件32.1, 32.2）
      expect(lastRequestBody('POST', '/api/v1/auth/verify-2fa')).toEqual({
        challengeToken: 'challenge-abc',
        code: '123456',
      });

      await waitFor(() => {
        expect(result.current.isAuthenticated).toBe(true);
        expect(result.current.user).toEqual(mockUser);
        expect(result.current.twoFactorState).toBeNull();
      });

      // アクセストークンはメモリだけにあり、永続ストレージにトークンが書かれない（要件33.8, 33.10）
      expect(apiClient.getAccessToken()).toBe('new-access-token');
      expect(localStorage.getItem('refreshToken')).toBeNull();
      expect(localStorage.getItem('accessToken')).toBeNull();
      expect(localStorage.length).toBe(0);
    });

    it('2FA状態がない場合はエラーをスローすること', async () => {
      const { result } = await renderInitialized();

      // 2FA状態がない状態で検証を試みる
      await expect(
        act(async () => {
          await result.current.verify2FA('123456');
        })
      ).rejects.toThrow('2FA state not available');
    });

    it('2FA検証失敗時にエラーをスローすること', async () => {
      mockFetch({
        ...REQUIRES_2FA_ROUTES,
        'POST /api/v1/auth/verify-2fa': { status: 401, body: { error: 'Invalid 2FA code' } },
      });
      const { result } = await renderInitialized();

      await act(async () => {
        await result.current.login('test@example.com', 'password123');
      });

      await expect(
        act(async () => {
          await result.current.verify2FA('000000');
        })
      ).rejects.toThrow();

      // 2FA状態は維持される
      expect(result.current.twoFactorState).not.toBeNull();
    });
  });

  describe('verifyBackupCode', () => {
    it('バックアップコード検証成功後に認証状態になること', async () => {
      const mockUser = {
        id: '1',
        email: 'test@example.com',
        displayName: 'Test User',
        twoFactorEnabled: true,
      };
      mockFetch({
        ...REQUIRES_2FA_ROUTES,
        'POST /api/v1/auth/verify-2fa/backup': {
          status: 200,
          body: {
            accessToken: 'backup-access-token',
            refreshToken: 'backup-refresh-token',
            user: mockUser,
            expiresIn: 900000,
          },
        },
      });
      const { result } = await renderInitialized();

      // ログイン（2FA要求）
      await act(async () => {
        await result.current.login('test@example.com', 'password123');
      });

      expect(result.current.twoFactorState).not.toBeNull();

      // バックアップコード検証
      await act(async () => {
        await result.current.verifyBackupCode('BACKUP-CODE-123');
      });

      // バックアップコードも同じ資格を送り、メールアドレスを送らない（要件32.6）
      expect(lastRequestBody('POST', '/api/v1/auth/verify-2fa/backup')).toEqual({
        challengeToken: 'challenge-abc',
        backupCode: 'BACKUP-CODE-123',
      });

      await waitFor(() => {
        expect(result.current.isAuthenticated).toBe(true);
        expect(result.current.user).toEqual(mockUser);
        expect(result.current.twoFactorState).toBeNull();
      });

      // アクセストークンはメモリだけにあり、永続ストレージにトークンが書かれない（要件33.8, 33.10）
      expect(apiClient.getAccessToken()).toBe('backup-access-token');
      expect(localStorage.length).toBe(0);
    });

    it('2FA状態がない場合はエラーをスローすること', async () => {
      const { result } = await renderInitialized();

      // 2FA状態がない状態で検証を試みる
      await expect(
        act(async () => {
          await result.current.verifyBackupCode('BACKUP-CODE');
        })
      ).rejects.toThrow('2FA state not available');
    });

    it('バックアップコード検証失敗時にエラーをスローすること', async () => {
      mockFetch({
        ...REQUIRES_2FA_ROUTES,
        'POST /api/v1/auth/verify-2fa/backup': {
          status: 401,
          body: { error: 'Invalid backup code' },
        },
      });
      const { result } = await renderInitialized();

      await act(async () => {
        await result.current.login('test@example.com', 'password123');
      });

      await expect(
        act(async () => {
          await result.current.verifyBackupCode('INVALID-CODE');
        })
      ).rejects.toThrow();

      // 2FA状態は維持される
      expect(result.current.twoFactorState).not.toBeNull();
    });
  });

  describe('cancel2FA', () => {
    it('2FA認証をキャンセルするとtwoFactorStateがnullになること', async () => {
      mockFetch(REQUIRES_2FA_ROUTES);
      const { result } = await renderInitialized();

      // ログイン（2FA要求）
      await act(async () => {
        await result.current.login('test@example.com', 'password123');
      });

      expect(result.current.twoFactorState).not.toBeNull();

      // 2FAをキャンセル
      act(() => {
        result.current.cancel2FA();
      });

      expect(result.current.twoFactorState).toBeNull();
      expect(result.current.isAuthenticated).toBe(false);
    });
  });

  describe('clearSessionExpired', () => {
    it('sessionExpiredフラグをクリアできること', async () => {
      // セッション復元失敗（Cookie が拒否された）をシミュレート
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

      // セッション復元失敗後にsessionExpired=trueになる
      await waitFor(() => {
        expect(result.current.sessionExpired).toBe(true);
      });

      // clearSessionExpiredを呼び出す
      act(() => {
        result.current.clearSessionExpired();
      });

      expect(result.current.sessionExpired).toBe(false);
    });
  });

  describe('ログインレスポンスのバリデーション', () => {
    it('不正なログインレスポンス形式の場合エラーをスローすること', async () => {
      // ログイン成功だがレスポンスが不完全（user, accessToken, requires2FA がない）
      mockFetch({
        ...NO_COOKIE_ROUTES,
        'POST /api/v1/auth/login': { status: 200, body: {} },
      });
      const { result } = await renderInitialized();

      await expect(
        act(async () => {
          await result.current.login('test@example.com', 'password123');
        })
      ).rejects.toThrow('Invalid login response format');
    });
  });

  describe('ログアウトエラーハンドリング', () => {
    it('ログアウトAPI失敗時もローカルトークンをクリアすること', async () => {
      const mockUser = {
        id: '1',
        email: 'test@example.com',
        displayName: 'Test User',
      };
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
          throw new Error('Network error');
        },
      });
      const { result } = await renderInitialized();

      await act(async () => {
        await result.current.login('test@example.com', 'password123');
      });

      expect(result.current.isAuthenticated).toBe(true);

      await act(async () => {
        await result.current.logout();
      });

      // API失敗してもローカル状態はクリアされる
      await waitFor(() => {
        expect(result.current.isAuthenticated).toBe(false);
        expect(result.current.user).toBeNull();
      });

      expect(apiClient.getAccessToken()).toBeNull();
      expect(localStorage.length).toBe(0);
    });
  });
});
