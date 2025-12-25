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

describe('AuthContext - 2FA機能', () => {
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

  describe('login with 2FA required', () => {
    it('2FAが必要な場合、twoFactorStateが設定されること', async () => {
      // ログインAPIが2FA必要を返す
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

      // 最初のログインは2FA要求
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

      // ログイン（2FA要求）
      await act(async () => {
        await result.current.login('test@example.com', 'password123');
      });

      expect(result.current.twoFactorState).not.toBeNull();

      // 2FA検証成功レスポンス
      globalThis.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          accessToken: 'new-access-token',
          refreshToken: 'new-refresh-token',
          user: mockUser,
          expiresIn: 900000,
        }),
      });

      // 2FA検証
      await act(async () => {
        await result.current.verify2FA('123456');
      });

      await waitFor(() => {
        expect(result.current.isAuthenticated).toBe(true);
        expect(result.current.user).toEqual(mockUser);
        expect(result.current.twoFactorState).toBeNull();
      });

      // localStorageにトークンが保存されていることを確認
      expect(localStorage.getItem('refreshToken')).toBe('new-refresh-token');
      expect(localStorage.getItem('accessToken')).toBe('new-access-token');
    });

    it('2FA状態がない場合はエラーをスローすること', async () => {
      const { result } = renderHook(() => useAuth(), {
        wrapper: AuthProvider,
      });

      // 2FA状態がない状態で検証を試みる
      await expect(
        act(async () => {
          await result.current.verify2FA('123456');
        })
      ).rejects.toThrow('2FA state not available');
    });

    it('2FA検証失敗時にエラーをスローすること', async () => {
      // 最初のログインは2FA要求
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

      // 2FA検証失敗レスポンス
      globalThis.fetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ error: 'Invalid 2FA code' }),
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

      // 最初のログインは2FA要求
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

      // ログイン（2FA要求）
      await act(async () => {
        await result.current.login('test@example.com', 'password123');
      });

      expect(result.current.twoFactorState).not.toBeNull();

      // バックアップコード検証成功レスポンス
      globalThis.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          accessToken: 'backup-access-token',
          refreshToken: 'backup-refresh-token',
          user: mockUser,
          expiresIn: 900000,
        }),
      });

      // バックアップコード検証
      await act(async () => {
        await result.current.verifyBackupCode('BACKUP-CODE-123');
      });

      await waitFor(() => {
        expect(result.current.isAuthenticated).toBe(true);
        expect(result.current.user).toEqual(mockUser);
        expect(result.current.twoFactorState).toBeNull();
      });

      // localStorageにトークンが保存されていることを確認
      expect(localStorage.getItem('refreshToken')).toBe('backup-refresh-token');
      expect(localStorage.getItem('accessToken')).toBe('backup-access-token');
    });

    it('2FA状態がない場合はエラーをスローすること', async () => {
      const { result } = renderHook(() => useAuth(), {
        wrapper: AuthProvider,
      });

      // 2FA状態がない状態で検証を試みる
      await expect(
        act(async () => {
          await result.current.verifyBackupCode('BACKUP-CODE');
        })
      ).rejects.toThrow('2FA state not available');
    });
  });

  describe('cancel2FA', () => {
    it('2FA認証をキャンセルするとtwoFactorStateがnullになること', async () => {
      // 最初のログインは2FA要求
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
      // セッション復元失敗をシミュレート
      localStorage.setItem('refreshToken', 'invalid-token');

      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Invalid refresh token'));

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
      // ログイン成功だがレスポンスが不完全
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          // user, accessToken, refreshTokenがすべて欠けている
          // requires2FAもない
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
  });

  describe('ログアウトエラーハンドリング', () => {
    it('ログアウトAPI失敗時もローカルトークンをクリアすること', async () => {
      const mockUser = {
        id: '1',
        email: 'test@example.com',
        displayName: 'Test User',
      };

      // ログイン成功
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

      expect(result.current.isAuthenticated).toBe(true);

      // ログアウトAPI失敗
      globalThis.fetch = vi.fn().mockRejectedValueOnce(new Error('Network error'));

      await act(async () => {
        await result.current.logout();
      });

      // API失敗してもローカル状態はクリアされる
      await waitFor(() => {
        expect(result.current.isAuthenticated).toBe(false);
        expect(result.current.user).toBeNull();
      });

      expect(localStorage.getItem('refreshToken')).toBeNull();
      expect(localStorage.getItem('accessToken')).toBeNull();
    });
  });
});
