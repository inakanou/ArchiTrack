import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { waitFor } from '@testing-library/react';
import { renderHook, act } from '@testing-library/react';
import { AuthProvider } from '../../contexts/AuthContext';
import { useAuth } from '../../hooks/useAuth';

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

  describe('トークンリフレッシュ', () => {
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
  });
});
