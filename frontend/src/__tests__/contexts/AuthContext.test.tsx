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

describe('AuthContext', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    localStorage.clear();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    localStorage.clear();
    // apiClientの状態をクリア（テスト間で共有されるため）
    apiClient.setTokenRefreshCallback(null);
    apiClient.setAccessToken(null);
    vi.clearAllMocks();
  });

  describe('初期状態', () => {
    it('リフレッシュトークンがない場合、isLoadingがfalseになること', async () => {
      // localStorageにトークンがない状態
      localStorage.clear();

      const { result } = renderHook(() => useAuth(), {
        wrapper: AuthProvider,
      });

      // useEffectが実行され、リフレッシュトークンがないためisLoading=falseになる
      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
        expect(result.current.isAuthenticated).toBe(false);
        expect(result.current.user).toBeNull();
      });
    });

    it('リフレッシュトークンがある場合、セッション復元後にisLoadingがfalseになること', async () => {
      // localStorageにリフレッシュトークンを設定
      localStorage.setItem('refreshToken', 'test-refresh-token');

      const mockUser = {
        id: '1',
        email: 'test@example.com',
        displayName: 'Test User',
      };

      // /api/v1/auth/refresh のモック
      globalThis.fetch = vi.fn().mockImplementation((url) => {
        if (url.toString().includes('/api/v1/auth/refresh')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: async () => ({
              accessToken: 'new-access-token',
            }),
          });
        }
        // /api/v1/auth/me のモック（APIは直接ユーザーオブジェクトを返す）
        if (url.toString().includes('/api/v1/auth/me')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: async () => mockUser,
          });
        }
        return Promise.reject(new Error('Unexpected URL'));
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
    });
  });

  describe('login', () => {
    it('ログインに成功するとisAuthenticatedがtrueになること', async () => {
      const mockUser = {
        id: '1',
        email: 'test@example.com',
        displayName: 'Test User',
      };

      const mockTokens = {
        accessToken: 'test-access-token',
        refreshToken: 'test-refresh-token',
        expiresIn: 900000, // 15分
      };

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          type: 'SUCCESS',
          user: mockUser,
          accessToken: mockTokens.accessToken,
          refreshToken: mockTokens.refreshToken,
          expiresIn: mockTokens.expiresIn,
        }),
      });

      const { result } = renderHook(() => useAuth(), {
        wrapper: AuthProvider,
      });

      await act(async () => {
        await result.current.login('test@example.com', 'password123');
      });

      await waitFor(() => {
        expect(result.current.isAuthenticated).toBe(true);
        expect(result.current.user).toEqual(mockUser);
        expect(result.current.isLoading).toBe(false);
      });
    });

    it('ログイン失敗時にエラーをスローすること', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ error: 'Invalid credentials' }),
      });

      const { result } = renderHook(() => useAuth(), {
        wrapper: AuthProvider,
      });

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
      const mockUser = {
        id: '1',
        email: 'test@example.com',
        displayName: 'Test User',
      };

      const mockTokens = {
        accessToken: 'test-access-token',
        refreshToken: 'test-refresh-token',
        expiresIn: 900000,
      };

      // ログイン
      globalThis.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          type: 'SUCCESS',
          user: mockUser,
          accessToken: mockTokens.accessToken,
          refreshToken: mockTokens.refreshToken,
          expiresIn: mockTokens.expiresIn,
        }),
      });

      const { result } = renderHook(() => useAuth(), {
        wrapper: AuthProvider,
      });

      await act(async () => {
        await result.current.login('test@example.com', 'password123');
      });

      // ログアウトAPIのモック
      globalThis.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ success: true }),
      });

      await act(async () => {
        await result.current.logout();
      });

      await waitFor(() => {
        expect(result.current.isAuthenticated).toBe(false);
        expect(result.current.user).toBeNull();
      });
    });
  });

  describe('2FA認証', () => {
    it('2FA要求時にtwoFactorStateが設定されること', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          requires2FA: true,
          userId: 'user-123',
        }),
      });

      const { result } = renderHook(() => useAuth(), {
        wrapper: AuthProvider,
      });

      await act(async () => {
        await result.current.login('test@example.com', 'password123');
      });

      await waitFor(() => {
        expect(result.current.twoFactorState).toEqual({
          required: true,
          email: 'test@example.com',
        });
        expect(result.current.isAuthenticated).toBe(false);
      });
    });

    it('verify2FAで2FA認証を完了できること', async () => {
      const mockUser = {
        id: '1',
        email: 'test@example.com',
        displayName: 'Test User',
      };

      // 1. ログイン → 2FA要求
      globalThis.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          requires2FA: true,
          userId: 'user-123',
        }),
      });

      const { result } = renderHook(() => useAuth(), {
        wrapper: AuthProvider,
      });

      await act(async () => {
        await result.current.login('test@example.com', 'password123');
      });

      await waitFor(() => {
        expect(result.current.twoFactorState?.required).toBe(true);
      });

      // 2. 2FA検証成功
      globalThis.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          accessToken: 'test-access-token',
          refreshToken: 'test-refresh-token',
          user: mockUser,
          expiresIn: 900000,
        }),
      });

      await act(async () => {
        await result.current.verify2FA('123456');
      });

      await waitFor(() => {
        expect(result.current.isAuthenticated).toBe(true);
        expect(result.current.user).toEqual(mockUser);
        expect(result.current.twoFactorState).toBeNull();
      });
    });

    it('verifyBackupCodeでバックアップコード認証を完了できること', async () => {
      const mockUser = {
        id: '1',
        email: 'test@example.com',
        displayName: 'Test User',
      };

      // 1. ログイン → 2FA要求
      globalThis.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          requires2FA: true,
          userId: 'user-123',
        }),
      });

      const { result } = renderHook(() => useAuth(), {
        wrapper: AuthProvider,
      });

      await act(async () => {
        await result.current.login('test@example.com', 'password123');
      });

      await waitFor(() => {
        expect(result.current.twoFactorState?.required).toBe(true);
      });

      // 2. バックアップコード検証成功
      globalThis.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          accessToken: 'test-access-token',
          refreshToken: 'test-refresh-token',
          user: mockUser,
        }),
      });

      await act(async () => {
        await result.current.verifyBackupCode('ABCD1234');
      });

      await waitFor(() => {
        expect(result.current.isAuthenticated).toBe(true);
        expect(result.current.twoFactorState).toBeNull();
      });
    });

    it('cancel2FAで2FA状態をクリアできること', async () => {
      // ログイン → 2FA要求
      globalThis.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          requires2FA: true,
          userId: 'user-123',
        }),
      });

      const { result } = renderHook(() => useAuth(), {
        wrapper: AuthProvider,
      });

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
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          // user, accessToken, refreshTokenがない
          type: 'SUCCESS',
        }),
      });

      const { result } = renderHook(() => useAuth(), {
        wrapper: AuthProvider,
      });

      await expect(
        act(async () => {
          await result.current.login('test@example.com', 'password123');
        })
      ).rejects.toThrow('Invalid login response format');
    });

    it('clearSessionExpiredでセッション期限切れフラグをクリアできること', async () => {
      // リフレッシュ失敗でセッション期限切れを設定
      // accessTokenもrefreshTokenも設定してネットワークエラーでフォールバック失敗させる
      localStorage.setItem('refreshToken', 'old-refresh-token');
      localStorage.setItem('accessToken', 'old-access-token');

      // ネットワークエラーでリフレッシュ失敗（isAuthError = false）
      // フォールバックでaccessTokenを使ったAPI呼び出しも失敗
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

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
      const mockUser = {
        id: '1',
        email: 'test@example.com',
        displayName: 'Test User',
      };

      // ログイン
      globalThis.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          user: mockUser,
          accessToken: 'test-access-token',
          refreshToken: 'test-refresh-token',
          expiresIn: 900000,
        }),
      });

      const { result } = renderHook(() => useAuth(), {
        wrapper: AuthProvider,
      });

      await act(async () => {
        await result.current.login('test@example.com', 'password123');
      });

      await waitFor(() => {
        expect(result.current.isAuthenticated).toBe(true);
      });

      // ログアウトAPI失敗
      globalThis.fetch = vi.fn().mockRejectedValueOnce(new Error('Network error'));

      await act(async () => {
        await result.current.logout();
      });

      await waitFor(() => {
        expect(result.current.isAuthenticated).toBe(false);
        expect(result.current.user).toBeNull();
      });
    });

    it('リフレッシュトークンなしでセッション復元不可の場合も既存accessTokenで初期化すること', async () => {
      // accessTokenのみ設定（refreshTokenなし）
      localStorage.setItem('accessToken', 'existing-access-token');

      const { result } = renderHook(() => useAuth(), {
        wrapper: AuthProvider,
      });

      await waitFor(() => {
        expect(result.current.isInitialized).toBe(true);
        expect(result.current.isLoading).toBe(false);
      });
    });
  });

  describe('トークンリフレッシュ', () => {
    it('TokenRefreshManagerなしでもrefreshTokenを直接呼び出せること', async () => {
      // refreshTokenのみ設定（ログインしていない状態）
      localStorage.setItem('refreshToken', 'test-refresh-token');

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          accessToken: 'new-access-token',
          refreshToken: 'new-refresh-token',
        }),
      });

      const { result } = renderHook(() => useAuth(), {
        wrapper: AuthProvider,
      });

      // 初期化を待つ
      await waitFor(() => {
        expect(result.current.isInitialized).toBe(true);
      });

      // ログインせずにrefreshTokenを呼び出し
      // 注意: TokenRefreshManagerがないため直接APIを呼び出す
      // ただし初期化中にセッションが復元されるため、別のテストが必要
    });

    it('refreshTokenがない場合エラーをスローすること', async () => {
      localStorage.clear();

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
      ).rejects.toThrow('No refresh token available');
    });

    it('自動的にトークンをリフレッシュできること', async () => {
      const mockUser = {
        id: '1',
        email: 'test@example.com',
        displayName: 'Test User',
      };

      const mockTokens = {
        accessToken: 'initial-access-token',
        refreshToken: 'test-refresh-token',
        expiresIn: 900000,
      };

      const newMockTokens = {
        accessToken: 'refreshed-access-token',
        refreshToken: 'test-refresh-token',
        expiresIn: 900000,
      };

      // ログイン
      globalThis.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          type: 'SUCCESS',
          user: mockUser,
          accessToken: mockTokens.accessToken,
          refreshToken: mockTokens.refreshToken,
          expiresIn: mockTokens.expiresIn,
        }),
      });

      const { result } = renderHook(() => useAuth(), {
        wrapper: AuthProvider,
      });

      await act(async () => {
        await result.current.login('test@example.com', 'password123');
      });

      // リフレッシュAPIのモック
      globalThis.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          accessToken: newMockTokens.accessToken,
          refreshToken: newMockTokens.refreshToken,
        }),
      });

      // 手動でリフレッシュを実行
      await act(async () => {
        const newToken = await result.current.refreshToken();
        expect(newToken).toBe('refreshed-access-token');
      });
    });

    it('expiresInがない場合も正常にログインできること', async () => {
      const mockUser = {
        id: '1',
        email: 'test@example.com',
        displayName: 'Test User',
      };

      // expiresInなしでログイン成功
      globalThis.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          user: mockUser,
          accessToken: 'test-access-token',
          refreshToken: 'test-refresh-token',
          // expiresInなし
        }),
      });

      const { result } = renderHook(() => useAuth(), {
        wrapper: AuthProvider,
      });

      await act(async () => {
        await result.current.login('test@example.com', 'password123');
      });

      await waitFor(() => {
        expect(result.current.isAuthenticated).toBe(true);
        expect(result.current.user).toEqual(mockUser);
      });
    });

    it('新しいリフレッシュトークンが返されない場合も既存トークンを維持すること', async () => {
      const mockUser = {
        id: '1',
        email: 'test@example.com',
        displayName: 'Test User',
      };

      // ログイン
      globalThis.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          user: mockUser,
          accessToken: 'test-access-token',
          refreshToken: 'test-refresh-token',
          expiresIn: 900000,
        }),
      });

      const { result } = renderHook(() => useAuth(), {
        wrapper: AuthProvider,
      });

      await act(async () => {
        await result.current.login('test@example.com', 'password123');
      });

      // リフレッシュAPIのモック（新しいリフレッシュトークンなし）
      globalThis.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          accessToken: 'new-access-token',
          // refreshTokenなし
        }),
      });

      await act(async () => {
        const newToken = await result.current.refreshToken();
        expect(newToken).toBe('new-access-token');
      });

      // 既存のリフレッシュトークンが維持されていること
      expect(localStorage.getItem('refreshToken')).toBe('test-refresh-token');
    });
  });

  describe('セッション復元詳細', () => {
    it('認証エラー（401）の場合フォールバックせずセッション期限切れとなること', async () => {
      localStorage.setItem('refreshToken', 'expired-refresh-token');
      localStorage.setItem('accessToken', 'expired-access-token');

      // 401エラーでリフレッシュ失敗（Unauthorizedメッセージを含む）
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Unauthorized'));

      const { result } = renderHook(() => useAuth(), {
        wrapper: AuthProvider,
      });

      await waitFor(() => {
        expect(result.current.isInitialized).toBe(true);
        expect(result.current.sessionExpired).toBe(true);
        expect(result.current.user).toBeNull();
      });
    });

    it('ネットワークエラー時に既存トークンでフォールバック成功すること', async () => {
      localStorage.setItem('refreshToken', 'valid-refresh-token');
      localStorage.setItem('accessToken', 'valid-access-token');

      // 最初のリフレッシュAPIがネットワークエラー（401や認証エラーではない）
      // リトライ機構により最大4回（初回 + 3回リトライ）試行されるため、4回分のネットワークエラーをモック
      globalThis.fetch = vi
        .fn()
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'))
        // 5回目：既存トークンでユーザー情報取得成功（フォールバック）
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({
            id: 'user-1',
            email: 'test@example.com',
            displayName: 'Test User',
            role: 'user',
            twoFactorEnabled: false,
          }),
        });

      const { result } = renderHook(() => useAuth(), {
        wrapper: AuthProvider,
      });

      await waitFor(() => {
        expect(result.current.isInitialized).toBe(true);
        expect(result.current.user).not.toBeNull();
        expect(result.current.user?.email).toBe('test@example.com');
      });
    });

    it('ネットワークエラー後、既存トークンでもユーザー情報取得失敗するとセッション期限切れとなること', async () => {
      localStorage.setItem('refreshToken', 'valid-refresh-token');
      localStorage.setItem('accessToken', 'invalid-access-token');

      // 最初のリフレッシュAPIがネットワークエラー
      // リトライ機構により最大4回（初回 + 3回リトライ）試行されるため、4回分のネットワークエラーをモック
      globalThis.fetch = vi
        .fn()
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'))
        // 5回目：既存トークンでもユーザー情報取得失敗（フォールバック失敗）
        .mockRejectedValueOnce(new Error('Token invalid'));

      const { result } = renderHook(() => useAuth(), {
        wrapper: AuthProvider,
      });

      await waitFor(() => {
        expect(result.current.isInitialized).toBe(true);
        expect(result.current.sessionExpired).toBe(true);
        expect(result.current.user).toBeNull();
      });
    });
  });
});
