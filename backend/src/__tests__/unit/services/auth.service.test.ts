/**
 * @fileoverview 認証サービスの単体テスト
 *
 * Requirements:
 * - 2.1-2.12: ユーザー登録機能（招待経由、トランザクション管理）
 * - 4.1-4.7: ログイン機能（連続失敗検知、アカウントロック）
 * - 8.1-8.5: セッション管理
 * - 9.1-9.5: ユーザー情報取得
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AuthService } from '../../../services/auth.service';
import { InvitationService } from '../../../services/invitation.service';
import { PasswordService } from '../../../services/password.service';
import { TokenService } from '../../../services/token.service';
import type { PrismaClient, User, Invitation } from '@prisma/client';
import { Ok } from '../../../types/result';

// Prisma Clientのモック
const mockPrismaClient = {
  user: {
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  invitation: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  role: {
    findUnique: vi.fn(),
  },
  userRole: {
    create: vi.fn(),
  },
  $transaction: vi.fn(),
} as unknown as PrismaClient;

// 依存サービスのモック
const mockInvitationService = {
  validateInvitation: vi.fn(),
} as unknown as InvitationService;

const mockPasswordService = {
  validatePasswordStrength: vi.fn(),
  hashPassword: vi.fn(),
  verifyPassword: vi.fn(),
} as unknown as PasswordService;

const mockTokenService = {
  generateAccessToken: vi.fn(),
  generateRefreshToken: vi.fn(),
} as unknown as TokenService;

describe('AuthService', () => {
  let authService: AuthService;

  beforeEach(() => {
    vi.clearAllMocks();
    authService = new AuthService(
      mockPrismaClient,
      mockInvitationService,
      mockPasswordService,
      mockTokenService
    );
  });

  describe('register()', () => {
    it('有効な招待トークンでユーザー登録に成功する', async () => {
      // Arrange: モックの設定
      const invitationToken = 'valid-invitation-token-123';
      const registerData = {
        displayName: 'New User',
        password: 'SecurePass123!@#',
      };

      const mockInvitation: Invitation = {
        id: 'invitation-1',
        email: 'newuser@example.com',
        token: invitationToken,
        inviterId: 'admin-user-id',
        status: 'pending',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        createdAt: new Date(),
        usedAt: null,
        userId: null,
      };

      const mockUser: User & { userRoles: Array<{ role: { name: string } }> } = {
        id: 'user-123',
        email: 'newuser@example.com',
        displayName: 'New User',
        passwordHash: 'hashed-password',
        twoFactorEnabled: false,
        twoFactorSecret: null,
        isLocked: false,
        lockedUntil: null,
        loginFailures: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        userRoles: [{ role: { name: 'user' } }],
      };

      // InvitationService.validateInvitation() のモック
      (mockInvitationService.validateInvitation as ReturnType<typeof vi.fn>).mockResolvedValue(
        Ok(mockInvitation)
      );

      // PasswordService.validatePasswordStrength() のモック
      (mockPasswordService.validatePasswordStrength as ReturnType<typeof vi.fn>).mockResolvedValue(
        Ok(undefined)
      );

      // PasswordService.hashPassword() のモック
      (mockPasswordService.hashPassword as ReturnType<typeof vi.fn>).mockResolvedValue(
        'hashed-password'
      );

      // Prisma.$transaction() のモック
      (mockPrismaClient.$transaction as ReturnType<typeof vi.fn>).mockResolvedValue(mockUser);

      // TokenService.generateAccessToken() のモック
      (mockTokenService.generateAccessToken as ReturnType<typeof vi.fn>).mockResolvedValue(
        'access-token-123'
      );

      // TokenService.generateRefreshToken() のモック
      (mockTokenService.generateRefreshToken as ReturnType<typeof vi.fn>).mockResolvedValue(
        'refresh-token-456'
      );

      // Act: ユーザー登録
      const result = await authService.register(invitationToken, registerData);

      // Assert: 登録成功
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.accessToken).toBe('access-token-123');
        expect(result.value.refreshToken).toBe('refresh-token-456');
        expect(result.value.user.email).toBe('newuser@example.com');
        expect(result.value.user.displayName).toBe('New User');
        expect(result.value.user.roles).toContain('user');
      }

      // モックが正しく呼ばれたか検証
      expect(mockInvitationService.validateInvitation).toHaveBeenCalledWith(invitationToken);
      expect(mockPasswordService.validatePasswordStrength).toHaveBeenCalledWith(
        registerData.password,
        ['newuser@example.com', registerData.displayName]
      );
      expect(mockPasswordService.hashPassword).toHaveBeenCalledWith(registerData.password);
    });
  });

  describe('login()', () => {
    it('有効な認証情報でログインに成功する（2FA無効）', async () => {
      // Arrange: モックの設定
      const email = 'user@example.com';
      const password = 'SecurePass123!@#';

      const mockUser: User & { userRoles: Array<{ role: { name: string } }> } = {
        id: 'user-123',
        email,
        displayName: 'Test User',
        passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$testSalt$testHash',
        twoFactorEnabled: false,
        twoFactorSecret: null,
        isLocked: false,
        lockedUntil: null,
        loginFailures: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        userRoles: [{ role: { name: 'user' } }],
      };

      // Prisma.user.findUnique() のモック
      (mockPrismaClient.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(mockUser);

      // PasswordService.verifyPassword() のモック
      (mockPasswordService.verifyPassword as ReturnType<typeof vi.fn>).mockResolvedValue(true);

      // Prisma.user.update() のモック（loginFailuresリセット用）
      (mockPrismaClient.user.update as ReturnType<typeof vi.fn>).mockResolvedValue(mockUser);

      // TokenService.generateAccessToken() のモック
      (mockTokenService.generateAccessToken as ReturnType<typeof vi.fn>).mockResolvedValue(
        'access-token-123'
      );

      // TokenService.generateRefreshToken() のモック
      (mockTokenService.generateRefreshToken as ReturnType<typeof vi.fn>).mockResolvedValue(
        'refresh-token-456'
      );

      // Act: ログイン
      const result = await authService.login(email, password);

      // Assert: ログイン成功
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.type).toBe('SUCCESS');
        expect(result.value.accessToken).toBe('access-token-123');
        expect(result.value.refreshToken).toBe('refresh-token-456');
        expect(result.value.user?.email).toBe(email);
      }

      // モックが正しく呼ばれたか検証
      expect(mockPasswordService.verifyPassword).toHaveBeenCalledWith(
        password,
        mockUser.passwordHash
      );
    });
  });

  describe('getCurrentUser()', () => {
    it('ユーザー情報を正常に取得する', async () => {
      // Arrange: モックの設定
      const userId = 'user-456';

      const mockUser: User & { userRoles: Array<{ role: { name: string } }> } = {
        id: userId,
        email: 'user2@example.com',
        displayName: 'User Two',
        passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$testSalt$testHash',
        twoFactorEnabled: false,
        twoFactorSecret: null,
        isLocked: false,
        lockedUntil: null,
        loginFailures: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        userRoles: [{ role: { name: 'user' } }],
      };

      // Prisma.user.findUnique() のモック
      (mockPrismaClient.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(mockUser);

      // Act: ユーザー情報取得
      const result = await authService.getCurrentUser(userId);

      // Assert: 情報取得成功
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.id).toBe(userId);
        expect(result.value.email).toBe('user2@example.com');
        expect(result.value.displayName).toBe('User Two');
        expect(result.value.roles).toContain('user');
        expect(result.value.twoFactorEnabled).toBe(false);
      }
    });

    it('存在しないユーザーIDでUSER_NOT_FOUNDエラーを返す', async () => {
      // Arrange: モックの設定
      (mockPrismaClient.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      // Act: 存在しないユーザー
      const result = await authService.getCurrentUser('non-existent-id');

      // Assert: エラー
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe('USER_NOT_FOUND');
      }
    });
  });
});
