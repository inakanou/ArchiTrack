import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { apiClient } from '../../api/client';
import {
  register,
  login,
  verify2FA,
  logout,
  logoutAll,
  refreshToken,
  getCurrentUser,
  updateProfile,
} from '../../api/auth';

describe('認証API', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.clearAllMocks();
  });

  describe('register', () => {
    it('招待トークンとユーザー情報でユーザー登録できること', async () => {
      const invitationToken = 'test-invitation-token';
      const registerData = {
        displayName: 'Test User',
        password: 'StrongPassword123!',
      };

      const mockResponse = {
        accessToken: 'mock-access-token',
        user: {
          id: 'user-1',
          email: 'test@example.com',
          displayName: 'Test User',
        },
      };

      const postSpy = vi.spyOn(apiClient, 'post').mockResolvedValue(mockResponse);

      const result = await register(invitationToken, registerData);

      expect(postSpy).toHaveBeenCalledWith('/api/v1/auth/register', {
        invitationToken,
        ...registerData,
      });
      expect(result).toEqual(mockResponse);
    });

    it('登録時にエラーが発生した場合、エラーをスローすること', async () => {
      const postSpy = vi
        .spyOn(apiClient, 'post')
        .mockRejectedValue(new Error('Registration failed'));

      await expect(
        register('invalid-token', { displayName: 'Test', password: 'password' })
      ).rejects.toThrow('Registration failed');

      expect(postSpy).toHaveBeenCalled();
    });
  });

  describe('login', () => {
    it('メールアドレスとパスワードでログインできること', async () => {
      const credentials = {
        email: 'test@example.com',
        password: 'password123',
      };

      const mockResponse = {
        type: 'SUCCESS',
        accessToken: 'mock-access-token',
        user: {
          id: 'user-1',
          email: 'test@example.com',
          displayName: 'Test User',
        },
      };

      const postSpy = vi.spyOn(apiClient, 'post').mockResolvedValue(mockResponse);

      const result = await login(credentials.email, credentials.password);

      expect(postSpy).toHaveBeenCalledWith('/api/v1/auth/login', credentials);
      expect(result).toEqual(mockResponse);
    });

    it('2FAが必要な場合、2FA_REQUIREDを返すこと', async () => {
      const mockResponse = {
        type: '2FA_REQUIRED',
        userId: 'user-1',
      };

      const postSpy = vi.spyOn(apiClient, 'post').mockResolvedValue(mockResponse);

      const result = await login('test@example.com', 'password123');

      expect(postSpy).toHaveBeenCalled();
      expect(result).toEqual(mockResponse);
      expect(result.type).toBe('2FA_REQUIRED');
    });

    it('ログイン失敗時にエラーをスローすること', async () => {
      const postSpy = vi
        .spyOn(apiClient, 'post')
        .mockRejectedValue(new Error('Invalid credentials'));

      await expect(login('test@example.com', 'wrong-password')).rejects.toThrow(
        'Invalid credentials'
      );

      expect(postSpy).toHaveBeenCalled();
    });
  });

  describe('verify2FA', () => {
    it('ユーザーIDとTOTPコードで2FA検証できること', async () => {
      const userId = 'user-1';
      const totpCode = '123456';

      const mockResponse = {
        accessToken: 'mock-access-token',
        user: {
          id: 'user-1',
          email: 'test@example.com',
          displayName: 'Test User',
        },
      };

      const postSpy = vi.spyOn(apiClient, 'post').mockResolvedValue(mockResponse);

      const result = await verify2FA(userId, totpCode);

      expect(postSpy).toHaveBeenCalledWith('/api/v1/auth/verify-2fa', {
        userId,
        totpCode,
      });
      expect(result).toEqual(mockResponse);
    });

    it('無効なTOTPコードでエラーをスローすること', async () => {
      const postSpy = vi.spyOn(apiClient, 'post').mockRejectedValue(new Error('Invalid TOTP code'));

      await expect(verify2FA('user-1', 'invalid')).rejects.toThrow('Invalid TOTP code');

      expect(postSpy).toHaveBeenCalled();
    });
  });

  describe('logout', () => {
    it('ログアウトできること', async () => {
      const postSpy = vi.spyOn(apiClient, 'post').mockResolvedValue(undefined);

      await logout();

      expect(postSpy).toHaveBeenCalledWith('/api/v1/auth/logout');
    });

    it('ログアウト時のエラーをスローすること', async () => {
      const postSpy = vi.spyOn(apiClient, 'post').mockRejectedValue(new Error('Logout failed'));

      await expect(logout()).rejects.toThrow('Logout failed');

      expect(postSpy).toHaveBeenCalled();
    });
  });

  describe('logoutAll', () => {
    it('全デバイスからログアウトできること', async () => {
      const postSpy = vi.spyOn(apiClient, 'post').mockResolvedValue(undefined);

      await logoutAll();

      expect(postSpy).toHaveBeenCalledWith('/api/v1/auth/logout-all');
    });

    it('全デバイスログアウト時のエラーをスローすること', async () => {
      const postSpy = vi.spyOn(apiClient, 'post').mockRejectedValue(new Error('Logout all failed'));

      await expect(logoutAll()).rejects.toThrow('Logout all failed');

      expect(postSpy).toHaveBeenCalled();
    });
  });

  describe('refreshToken', () => {
    it('トークンをリフレッシュできること', async () => {
      const mockResponse = {
        accessToken: 'new-access-token',
        user: {
          id: 'user-1',
          email: 'test@example.com',
          displayName: 'Test User',
        },
      };

      const postSpy = vi.spyOn(apiClient, 'post').mockResolvedValue(mockResponse);

      const result = await refreshToken();

      expect(postSpy).toHaveBeenCalledWith('/api/v1/auth/refresh');
      expect(result).toEqual(mockResponse);
    });

    it('トークンリフレッシュ失敗時にエラーをスローすること', async () => {
      const postSpy = vi.spyOn(apiClient, 'post').mockRejectedValue(new Error('Refresh failed'));

      await expect(refreshToken()).rejects.toThrow('Refresh failed');

      expect(postSpy).toHaveBeenCalled();
    });
  });

  describe('getCurrentUser', () => {
    it('現在のユーザー情報を取得できること', async () => {
      const mockUser = {
        id: 'user-1',
        email: 'test@example.com',
        displayName: 'Test User',
        emailVerified: true,
        twoFactorEnabled: false,
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z',
        roles: ['user'],
      };

      const getSpy = vi.spyOn(apiClient, 'get').mockResolvedValue(mockUser);

      const result = await getCurrentUser();

      expect(getSpy).toHaveBeenCalledWith('/api/v1/users/me');
      expect(result).toEqual(mockUser);
    });

    it('ユーザー情報取得失敗時にエラーをスローすること', async () => {
      const getSpy = vi.spyOn(apiClient, 'get').mockRejectedValue(new Error('Unauthorized'));

      await expect(getCurrentUser()).rejects.toThrow('Unauthorized');

      expect(getSpy).toHaveBeenCalled();
    });
  });

  describe('updateProfile', () => {
    it('プロフィールを更新できること', async () => {
      const updateData = {
        displayName: 'Updated Name',
      };

      const mockResponse = {
        id: 'user-1',
        email: 'test@example.com',
        displayName: 'Updated Name',
        emailVerified: true,
        twoFactorEnabled: false,
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T01:00:00Z',
        roles: ['user'],
      };

      const patchSpy = vi.spyOn(apiClient, 'patch').mockResolvedValue(mockResponse);

      const result = await updateProfile(updateData);

      expect(patchSpy).toHaveBeenCalledWith('/api/v1/users/me', updateData);
      expect(result).toEqual(mockResponse);
    });

    it('プロフィール更新失敗時にエラーをスローすること', async () => {
      const patchSpy = vi.spyOn(apiClient, 'patch').mockRejectedValue(new Error('Update failed'));

      await expect(updateProfile({ displayName: 'New Name' })).rejects.toThrow('Update failed');

      expect(patchSpy).toHaveBeenCalled();
    });
  });
});
