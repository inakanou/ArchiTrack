/**
 * @fileoverview SessionServiceの単体テスト
 *
 * Requirements:
 * - 8.1-8.5: セッション管理（マルチデバイス対応、有効期限延長）
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SessionService } from '../../../services/session.service';
import type { PrismaClient, RefreshToken } from '@prisma/client';

// Prisma Clientのモック
const mockPrismaClient = {
  refreshToken: {
    create: vi.fn(),
    findUnique: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
  },
} as unknown as PrismaClient;

describe('SessionService', () => {
  let sessionService: SessionService;

  beforeEach(() => {
    vi.clearAllMocks();
    sessionService = new SessionService(mockPrismaClient);
  });

  describe('createSession()', () => {
    it('デバイス情報付きでセッションを作成できる', async () => {
      // Arrange
      const userId = 'user-123';
      const refreshToken = 'refresh-token-abc';
      const deviceInfo = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)';

      const mockRefreshToken: RefreshToken = {
        id: 'session-1',
        userId,
        token: refreshToken,
        deviceInfo,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7日後
        createdAt: new Date(),
      };

      (mockPrismaClient.refreshToken.create as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockRefreshToken
      );

      // Act
      await sessionService.createSession(userId, refreshToken, deviceInfo);

      // Assert
      expect(mockPrismaClient.refreshToken.create).toHaveBeenCalledWith({
        data: {
          userId,
          token: refreshToken,
          deviceInfo,
          expiresAt: expect.any(Date),
        },
      });
    });

    it('デバイス情報なしでセッションを作成できる', async () => {
      // Arrange
      const userId = 'user-456';
      const refreshToken = 'refresh-token-xyz';

      const mockRefreshToken: RefreshToken = {
        id: 'session-2',
        userId,
        token: refreshToken,
        deviceInfo: null,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        createdAt: new Date(),
      };

      (mockPrismaClient.refreshToken.create as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockRefreshToken
      );

      // Act
      await sessionService.createSession(userId, refreshToken);

      // Assert
      expect(mockPrismaClient.refreshToken.create).toHaveBeenCalledWith({
        data: {
          userId,
          token: refreshToken,
          deviceInfo: undefined,
          expiresAt: expect.any(Date),
        },
      });
    });
  });

  describe('deleteSession()', () => {
    it('セッションを削除できる', async () => {
      // Arrange
      const refreshToken = 'refresh-token-delete';

      const mockRefreshToken: RefreshToken = {
        id: 'session-3',
        userId: 'user-789',
        token: refreshToken,
        deviceInfo: null,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        createdAt: new Date(),
      };

      (mockPrismaClient.refreshToken.delete as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockRefreshToken
      );

      // Act
      const result = await sessionService.deleteSession(refreshToken);

      // Assert
      expect(result.ok).toBe(true);
      expect(mockPrismaClient.refreshToken.delete).toHaveBeenCalledWith({
        where: { token: refreshToken },
      });
    });

    it('存在しないトークンでSESSION_NOT_FOUNDエラーを返す', async () => {
      // Arrange
      const refreshToken = 'non-existent-token';

      (mockPrismaClient.refreshToken.delete as ReturnType<typeof vi.fn>).mockRejectedValue({
        code: 'P2025', // Prisma "Record not found" error
      });

      // Act
      const result = await sessionService.deleteSession(refreshToken);

      // Assert
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe('SESSION_NOT_FOUND');
      }
    });
  });

  describe('deleteAllSessions()', () => {
    it('ユーザーの全セッションを削除できる', async () => {
      // Arrange
      const userId = 'user-all-sessions';

      (mockPrismaClient.refreshToken.deleteMany as ReturnType<typeof vi.fn>).mockResolvedValue({
        count: 3,
      });

      // Act
      await sessionService.deleteAllSessions(userId);

      // Assert
      expect(mockPrismaClient.refreshToken.deleteMany).toHaveBeenCalledWith({
        where: { userId },
      });
    });
  });

  describe('verifySession()', () => {
    it('有効なセッションで検証に成功する', async () => {
      // Arrange
      const refreshToken = 'valid-refresh-token';
      const mockRefreshToken: RefreshToken = {
        id: 'session-verify-1',
        userId: 'user-verify',
        token: refreshToken,
        deviceInfo: 'Chrome on macOS',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 未来の日時
        createdAt: new Date(),
      };

      (mockPrismaClient.refreshToken.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockRefreshToken
      );

      // Act
      const result = await sessionService.verifySession(refreshToken);

      // Assert
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.id).toBe('session-verify-1');
        expect(result.value.userId).toBe('user-verify');
        expect(result.value.deviceInfo).toBe('Chrome on macOS');
        expect(result.value.expiresAt).toBeInstanceOf(Date);
        expect(result.value.createdAt).toBeInstanceOf(Date);
      }
    });

    it('存在しないトークンでSESSION_NOT_FOUNDエラーを返す', async () => {
      // Arrange
      const refreshToken = 'non-existent-token';

      (mockPrismaClient.refreshToken.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
        null
      );

      // Act
      const result = await sessionService.verifySession(refreshToken);

      // Assert
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe('SESSION_NOT_FOUND');
      }
    });

    it('期限切れトークンでSESSION_EXPIREDエラーを返す', async () => {
      // Arrange
      const refreshToken = 'expired-token';
      const mockRefreshToken: RefreshToken = {
        id: 'session-expired',
        userId: 'user-expired',
        token: refreshToken,
        deviceInfo: null,
        expiresAt: new Date(Date.now() - 1000), // 過去の日時
        createdAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000),
      };

      (mockPrismaClient.refreshToken.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockRefreshToken
      );

      // Act
      const result = await sessionService.verifySession(refreshToken);

      // Assert
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe('SESSION_EXPIRED');
      }
    });
  });

  describe('listSessions()', () => {
    it('ユーザーのセッション一覧を取得できる（複数デバイス）', async () => {
      // Arrange
      const userId = 'user-multi-device';
      const mockSessions: RefreshToken[] = [
        {
          id: 'session-device-1',
          userId,
          token: 'token-1',
          deviceInfo: 'Chrome on Windows',
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
        },
        {
          id: 'session-device-2',
          userId,
          token: 'token-2',
          deviceInfo: 'Safari on iPhone',
          expiresAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
          createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
        },
        {
          id: 'session-device-3',
          userId,
          token: 'token-3',
          deviceInfo: null,
          expiresAt: new Date(Date.now() + 6 * 24 * 60 * 60 * 1000),
          createdAt: new Date(),
        },
      ];

      (mockPrismaClient.refreshToken.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockSessions
      );

      // Act
      const sessions = await sessionService.listSessions(userId);

      // Assert
      expect(sessions).toHaveLength(3);
      expect(sessions[0]!.deviceInfo).toBe('Chrome on Windows');
      expect(sessions[1]!.deviceInfo).toBe('Safari on iPhone');
      expect(sessions[2]!.deviceInfo).toBeUndefined();
      expect(mockPrismaClient.refreshToken.findMany).toHaveBeenCalledWith({
        where: { userId },
        orderBy: { createdAt: 'desc' },
      });
    });

    it('セッションが存在しない場合は空配列を返す', async () => {
      // Arrange
      const userId = 'user-no-sessions';

      (mockPrismaClient.refreshToken.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      // Act
      const sessions = await sessionService.listSessions(userId);

      // Assert
      expect(sessions).toHaveLength(0);
    });
  });

  describe('extendSession()', () => {
    it('セッションの有効期限を延長できる', async () => {
      // Arrange
      const refreshToken = 'token-to-extend';
      const mockRefreshToken: RefreshToken = {
        id: 'session-extend',
        userId: 'user-extend',
        token: refreshToken,
        deviceInfo: 'Firefox on Linux',
        expiresAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000), // 残り2日
        createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
      };

      (mockPrismaClient.refreshToken.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockRefreshToken
      );
      (mockPrismaClient.refreshToken.update as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...mockRefreshToken,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      });

      // Act
      const result = await sessionService.extendSession(refreshToken);

      // Assert
      expect(result.ok).toBe(true);
      expect(mockPrismaClient.refreshToken.update).toHaveBeenCalledWith({
        where: { token: refreshToken },
        data: {
          expiresAt: expect.any(Date),
        },
      });
    });

    it('存在しないトークンでSESSION_NOT_FOUNDエラーを返す', async () => {
      // Arrange
      const refreshToken = 'non-existent-token';

      (mockPrismaClient.refreshToken.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
        null
      );

      // Act
      const result = await sessionService.extendSession(refreshToken);

      // Assert
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe('SESSION_NOT_FOUND');
      }
    });

    it('期限切れトークンでSESSION_EXPIREDエラーを返す', async () => {
      // Arrange
      const refreshToken = 'expired-token-extend';
      const mockRefreshToken: RefreshToken = {
        id: 'session-expired-extend',
        userId: 'user-expired-extend',
        token: refreshToken,
        deviceInfo: null,
        expiresAt: new Date(Date.now() - 1000), // 過去の日時
        createdAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000),
      };

      (mockPrismaClient.refreshToken.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockRefreshToken
      );

      // Act
      const result = await sessionService.extendSession(refreshToken);

      // Assert
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe('SESSION_EXPIRED');
      }
    });
  });
});
