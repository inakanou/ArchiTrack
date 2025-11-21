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
import { AuthService } from '../../../services/auth.service.js';
import { InvitationService } from '../../../services/invitation.service.js';
import { PasswordService } from '../../../services/password.service.js';
import { TokenService } from '../../../services/token.service.js';
import { TwoFactorService } from '../../../services/two-factor.service.js';
import { SessionService } from '../../../services/session.service.js';
import type { PrismaClient, User, Invitation } from '@prisma/client';
import { Ok, Err } from '../../../types/result.js';

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
  refreshToken: {
    deleteMany: vi.fn(),
    findUnique: vi.fn(),
    delete: vi.fn(),
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
  verifyToken: vi.fn(),
} as unknown as TokenService;

const mockTwoFactorService = {
  verifyTOTP: vi.fn(),
  verifyBackupCode: vi.fn(),
} as unknown as TwoFactorService;

const mockSessionService = {
  createSession: vi.fn(),
  deleteSession: vi.fn(),
  deleteAllSessions: vi.fn(),
  verifySession: vi.fn(),
  listSessions: vi.fn(),
  extendSession: vi.fn(),
} as unknown as SessionService;

describe('AuthService', () => {
  let authService: AuthService;

  beforeEach(() => {
    vi.clearAllMocks();
    authService = new AuthService(
      mockPrismaClient,
      mockInvitationService,
      mockPasswordService,
      mockTokenService,
      mockTwoFactorService,
      mockSessionService
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
        twoFactorFailures: 0,
        twoFactorLockedUntil: null,
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

      // SessionService.createSession() のモック
      (mockSessionService.createSession as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

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

    it('無効な招待トークンでINVITATION_INVALIDエラーを返す', async () => {
      // Arrange
      const invitationToken = 'invalid-token';
      const registerData = {
        displayName: 'New User',
        password: 'SecurePass123!@#',
      };

      const { Err: ErrImport } = await import('../../../types/result.js');
      (mockInvitationService.validateInvitation as ReturnType<typeof vi.fn>).mockResolvedValue(
        ErrImport({ type: 'INVALID_TOKEN' })
      );

      // Act
      const result = await authService.register(invitationToken, registerData);

      // Assert
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe('INVITATION_INVALID');
      }
    });

    it('期限切れ招待トークンでINVITATION_EXPIREDエラーを返す', async () => {
      // Arrange
      const invitationToken = 'expired-token';
      const registerData = {
        displayName: 'New User',
        password: 'SecurePass123!@#',
      };

      const { Err: ErrImport } = await import('../../../types/result.js');
      (mockInvitationService.validateInvitation as ReturnType<typeof vi.fn>).mockResolvedValue(
        ErrImport({ type: 'EXPIRED_TOKEN' })
      );

      // Act
      const result = await authService.register(invitationToken, registerData);

      // Assert
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe('INVITATION_EXPIRED');
      }
    });

    it('使用済み招待トークンでINVITATION_ALREADY_USEDエラーを返す', async () => {
      // Arrange
      const invitationToken = 'used-token';
      const registerData = {
        displayName: 'New User',
        password: 'SecurePass123!@#',
      };

      const { Err: ErrImport } = await import('../../../types/result.js');
      (mockInvitationService.validateInvitation as ReturnType<typeof vi.fn>).mockResolvedValue(
        ErrImport({ type: 'USED_TOKEN' })
      );

      // Act
      const result = await authService.register(invitationToken, registerData);

      // Assert
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe('INVITATION_ALREADY_USED');
      }
    });

    it('弱いパスワードでWEAK_PASSWORDエラーを返す', async () => {
      // Arrange
      const invitationToken = 'valid-token';
      const registerData = {
        displayName: 'New User',
        password: '123', // 弱いパスワード
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

      (mockInvitationService.validateInvitation as ReturnType<typeof vi.fn>).mockResolvedValue(
        Ok(mockInvitation)
      );

      const { Err: ErrImport } = await import('../../../types/result.js');
      (mockPasswordService.validatePasswordStrength as ReturnType<typeof vi.fn>).mockResolvedValue(
        ErrImport({
          type: 'WEAK_PASSWORD',
          violations: ['too short', 'no uppercase'],
        })
      );

      // Act
      const result = await authService.register(invitationToken, registerData);

      // Assert
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe('WEAK_PASSWORD');
        if (result.error.type === 'WEAK_PASSWORD') {
          expect(result.error.violations).toEqual(['too short', 'no uppercase']);
        }
      }
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
        twoFactorFailures: 0,
        twoFactorLockedUntil: null,
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

      // SessionService.createSession() のモック
      (mockSessionService.createSession as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

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

    it('ユーザーが存在しない場合はINVALID_CREDENTIALSエラーを返す', async () => {
      // Arrange
      const email = 'nonexistent@example.com';
      const password = 'SecurePass123!@#';

      (mockPrismaClient.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      // Act
      const result = await authService.login(email, password);

      // Assert
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe('INVALID_CREDENTIALS');
      }
    });

    it('パスワードが正しくない場合もINVALID_CREDENTIALSエラーを返す（要件10.1: エラーメッセージの汎用化）', async () => {
      // Arrange: メールアドレスの存在有無を知られないよう、同じエラーメッセージを返す
      const email = 'existing@example.com';
      const password = 'WrongPassword123';

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
        twoFactorFailures: 0,
        twoFactorLockedUntil: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        userRoles: [{ role: { name: 'user' } }],
      };

      (mockPrismaClient.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(mockUser);
      (mockPasswordService.verifyPassword as ReturnType<typeof vi.fn>).mockResolvedValue(false);
      (mockPrismaClient.user.update as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...mockUser,
        loginFailures: 1,
      });

      // Act
      const result = await authService.login(email, password);

      // Assert: ユーザー不在時と同じINVALID_CREDENTIALSエラーを返す
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe('INVALID_CREDENTIALS');
      }

      // ログイン失敗回数がインクリメントされたことを確認
      expect(mockPrismaClient.user.update).toHaveBeenCalledWith({
        where: { id: 'user-123' },
        data: {
          loginFailures: 1,
          isLocked: false,
          lockedUntil: null,
        },
      });
    });

    it('ログイン失敗時にタイミング攻撃対策の遅延が挿入される（要件26.9）', async () => {
      // Arrange
      const email = 'user@example.com';
      const password = 'WrongPassword123';

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
        twoFactorFailures: 0,
        twoFactorLockedUntil: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        userRoles: [{ role: { name: 'user' } }],
      };

      (mockPrismaClient.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(mockUser);
      (mockPasswordService.verifyPassword as ReturnType<typeof vi.fn>).mockResolvedValue(false);
      (mockPrismaClient.user.update as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...mockUser,
        loginFailures: 1,
      });

      // Act: ログイン実行時間を測定
      const startTime = Date.now();
      const result = await authService.login(email, password);
      const endTime = Date.now();
      const elapsedTime = endTime - startTime;

      // Assert: 最低100ms以上の遅延が挿入されたことを確認
      expect(result.ok).toBe(false);
      expect(elapsedTime).toBeGreaterThanOrEqual(100);
      expect(elapsedTime).toBeLessThan(500); // 最大500ms以内（テストの安定性のため）
    });

    it('アカウントがロックされている場合はACCOUNT_LOCKEDエラーを返す', async () => {
      // Arrange
      const email = 'locked@example.com';
      const password = 'SecurePass123!@#';
      const lockedUntil = new Date(Date.now() + 10 * 60 * 1000); // 10分後

      const mockLockedUser: User & { userRoles: Array<{ role: { name: string } }> } = {
        id: 'user-locked',
        email,
        displayName: 'Locked User',
        passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$testSalt$testHash',
        twoFactorEnabled: false,
        twoFactorSecret: null,
        isLocked: true,
        lockedUntil,
        loginFailures: 5,
        twoFactorFailures: 0,
        twoFactorLockedUntil: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        userRoles: [{ role: { name: 'user' } }],
      };

      (mockPrismaClient.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockLockedUser
      );

      // Act
      const result = await authService.login(email, password);

      // Assert
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe('ACCOUNT_LOCKED');
        if (result.error.type === 'ACCOUNT_LOCKED') {
          expect(result.error.unlockAt).toEqual(lockedUntil);
        }
      }
    });

    it('ロック期限切れの場合はロック解除してログイン処理を継続する', async () => {
      // Arrange
      const email = 'expired-lock@example.com';
      const password = 'SecurePass123!@#';
      const expiredLockUntil = new Date(Date.now() - 1000); // 1秒前（期限切れ）

      const mockUser: User & { userRoles: Array<{ role: { name: string } }> } = {
        id: 'user-expired-lock',
        email,
        displayName: 'Expired Lock User',
        passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$testSalt$testHash',
        twoFactorEnabled: false,
        twoFactorSecret: null,
        isLocked: true,
        lockedUntil: expiredLockUntil,
        loginFailures: 5,
        twoFactorFailures: 0,
        twoFactorLockedUntil: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        userRoles: [{ role: { name: 'user' } }],
      };

      (mockPrismaClient.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(mockUser);
      (mockPasswordService.verifyPassword as ReturnType<typeof vi.fn>).mockResolvedValue(true);
      (mockPrismaClient.user.update as ReturnType<typeof vi.fn>).mockResolvedValue(mockUser);
      (mockTokenService.generateAccessToken as ReturnType<typeof vi.fn>).mockResolvedValue(
        'access-token-123'
      );
      (mockTokenService.generateRefreshToken as ReturnType<typeof vi.fn>).mockResolvedValue(
        'refresh-token-456'
      );
      (mockSessionService.createSession as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      // Act
      const result = await authService.login(email, password);

      // Assert
      expect(result.ok).toBe(true);
      // ロック解除が実行されたことを確認
      expect(mockPrismaClient.user.update).toHaveBeenCalledWith({
        where: { id: 'user-expired-lock' },
        data: {
          isLocked: false,
          lockedUntil: null,
          loginFailures: 0,
        },
      });
    });

    it('パスワード不正で5回連続失敗するとアカウントロックされる', async () => {
      // Arrange
      const email = 'user@example.com';
      const password = 'WrongPassword123';

      const mockUser: User & { userRoles: Array<{ role: { name: string } }> } = {
        id: 'user-123',
        email,
        displayName: 'Test User',
        passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$testSalt$testHash',
        twoFactorEnabled: false,
        twoFactorSecret: null,
        isLocked: false,
        lockedUntil: null,
        loginFailures: 4, // 4回失敗済み（次で5回目）
        twoFactorFailures: 0,
        twoFactorLockedUntil: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        userRoles: [{ role: { name: 'user' } }],
      };

      (mockPrismaClient.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(mockUser);
      (mockPasswordService.verifyPassword as ReturnType<typeof vi.fn>).mockResolvedValue(false);
      (mockPrismaClient.user.update as ReturnType<typeof vi.fn>).mockResolvedValue(mockUser);

      // Act
      const result = await authService.login(email, password);

      // Assert
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe('ACCOUNT_LOCKED');
        if (result.error.type === 'ACCOUNT_LOCKED') {
          expect(result.error.unlockAt).toBeInstanceOf(Date);
        }
      }

      // アカウントロックが実行されたことを確認
      expect(mockPrismaClient.user.update).toHaveBeenCalledWith({
        where: { id: 'user-123' },
        data: {
          loginFailures: 5,
          isLocked: true,
          lockedUntil: expect.any(Date),
        },
      });
    });

    it('2FA有効の場合は2FA_REQUIREDを返す', async () => {
      // Arrange
      const email = 'user-2fa@example.com';
      const password = 'SecurePass123!@#';

      const mockUser: User & { userRoles: Array<{ role: { name: string } }> } = {
        id: 'user-2fa-123',
        email,
        displayName: 'User with 2FA',
        passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$testSalt$testHash',
        twoFactorEnabled: true,
        twoFactorSecret: 'encrypted-totp-secret',
        isLocked: false,
        lockedUntil: null,
        loginFailures: 0,
        twoFactorFailures: 0,
        twoFactorLockedUntil: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        userRoles: [{ role: { name: 'user' } }],
      };

      (mockPrismaClient.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(mockUser);
      (mockPasswordService.verifyPassword as ReturnType<typeof vi.fn>).mockResolvedValue(true);
      (mockPrismaClient.user.update as ReturnType<typeof vi.fn>).mockResolvedValue(mockUser);

      // Act
      const result = await authService.login(email, password);

      // Assert
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.type).toBe('2FA_REQUIRED');
        expect(result.value.userId).toBe('user-2fa-123');
        expect(result.value.accessToken).toBeUndefined();
        expect(result.value.refreshToken).toBeUndefined();
      }
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
        twoFactorFailures: 0,
        twoFactorLockedUntil: null,
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

  describe('verify2FA()', () => {
    it('TOTP検証成功でJWTトークンを発行する', async () => {
      // Arrange: モックの設定
      const userId = 'user-123';
      const totpCode = '123456';

      const mockUser: User & { userRoles: Array<{ role: { name: string } }> } = {
        id: userId,
        email: 'user@example.com',
        displayName: 'Test User',
        passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$testSalt$testHash',
        twoFactorEnabled: true,
        twoFactorSecret: 'encrypted-totp-secret',
        isLocked: false,
        lockedUntil: null,
        loginFailures: 0,
        twoFactorFailures: 0,
        twoFactorLockedUntil: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        userRoles: [{ role: { name: 'user' } }],
      };

      // Prisma.user.findUnique() のモック
      (mockPrismaClient.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(mockUser);

      // TwoFactorService.verifyTOTP() のモック（成功）
      (mockTwoFactorService.verifyTOTP as ReturnType<typeof vi.fn>).mockResolvedValue(Ok(true));

      // Prisma.user.update() のモック（失敗カウンターリセット用）
      (mockPrismaClient.user.update as ReturnType<typeof vi.fn>).mockResolvedValue(mockUser);

      // TokenService.generateAccessToken() のモック
      (mockTokenService.generateAccessToken as ReturnType<typeof vi.fn>).mockResolvedValue(
        'access-token-123'
      );

      // TokenService.generateRefreshToken() のモック
      (mockTokenService.generateRefreshToken as ReturnType<typeof vi.fn>).mockResolvedValue(
        'refresh-token-456'
      );

      // SessionService.createSession() のモック
      (mockSessionService.createSession as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      // Act: 2FA検証
      const result = await authService.verify2FA(userId, totpCode);

      // Assert: 認証成功
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.accessToken).toBe('access-token-123');
        expect(result.value.refreshToken).toBe('refresh-token-456');
        expect(result.value.user.email).toBe('user@example.com');
      }

      // モックが正しく呼ばれたか検証
      expect(mockTwoFactorService.verifyTOTP).toHaveBeenCalledWith(userId, totpCode);
      expect(mockPrismaClient.user.update).toHaveBeenCalledWith({
        where: { id: userId },
        data: {
          twoFactorFailures: 0,
          twoFactorLockedUntil: null,
        },
      });
    });

    it('verify2FAでデータベースエラーが発生した場合はDATABASE_ERRORを返す', async () => {
      // Arrange
      const userId = 'user-123';
      const totpCode = '123456';

      (mockPrismaClient.user.findUnique as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Database connection failed')
      );

      // Act
      const result = await authService.verify2FA(userId, totpCode);

      // Assert
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe('DATABASE_ERROR');
        if (result.error.type === 'DATABASE_ERROR') {
          expect(result.error.message).toBe('Database connection failed');
        }
      }
    });

    it('TOTP検証失敗でINVALID_2FA_CODEエラーを返す', async () => {
      // Arrange: モックの設定
      const userId = 'user-123';
      const totpCode = '000000';

      const mockUser: User & { userRoles: Array<{ role: { name: string } }> } = {
        id: userId,
        email: 'user@example.com',
        displayName: 'Test User',
        passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$testSalt$testHash',
        twoFactorEnabled: true,
        twoFactorSecret: 'encrypted-totp-secret',
        isLocked: false,
        lockedUntil: null,
        loginFailures: 0,
        twoFactorFailures: 2,
        twoFactorLockedUntil: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        userRoles: [{ role: { name: 'user' } }],
      };

      // Prisma.user.findUnique() のモック
      (mockPrismaClient.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(mockUser);

      // TwoFactorService.verifyTOTP() のモック（失敗）
      (mockTwoFactorService.verifyTOTP as ReturnType<typeof vi.fn>).mockResolvedValue(Ok(false));

      // Prisma.user.update() のモック（失敗カウンターインクリメント用）
      (mockPrismaClient.user.update as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...mockUser,
        twoFactorFailures: 3,
      });

      // Act: 2FA検証失敗
      const result = await authService.verify2FA(userId, totpCode);

      // Assert: エラー
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe('INVALID_2FA_CODE');
      }

      // 失敗カウンターが増加したことを確認
      expect(mockPrismaClient.user.update).toHaveBeenCalledWith({
        where: { id: userId },
        data: {
          twoFactorFailures: 3,
        },
      });
    });

    it('5回連続失敗でアカウントロック（5分間）', async () => {
      // Arrange: モックの設定
      const userId = 'user-123';
      const totpCode = '000000';

      const mockUser: User & { userRoles: Array<{ role: { name: string } }> } = {
        id: userId,
        email: 'user@example.com',
        displayName: 'Test User',
        passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$testSalt$testHash',
        twoFactorEnabled: true,
        twoFactorSecret: 'encrypted-totp-secret',
        isLocked: false,
        lockedUntil: null,
        loginFailures: 0,
        twoFactorFailures: 4, // 次の失敗で5回目
        twoFactorLockedUntil: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        userRoles: [{ role: { name: 'user' } }],
      };

      const lockUntil = new Date(Date.now() + 5 * 60 * 1000); // 5分後

      // Prisma.user.findUnique() のモック
      (mockPrismaClient.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(mockUser);

      // TwoFactorService.verifyTOTP() のモック（失敗）
      (mockTwoFactorService.verifyTOTP as ReturnType<typeof vi.fn>).mockResolvedValue(Ok(false));

      // Prisma.user.update() のモック（アカウントロック用）
      (mockPrismaClient.user.update as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...mockUser,
        twoFactorFailures: 5,
        twoFactorLockedUntil: lockUntil,
      });

      // Act: 5回目の失敗
      const result = await authService.verify2FA(userId, totpCode);

      // Assert: アカウントロック
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe('ACCOUNT_LOCKED');
        if (result.error.type === 'ACCOUNT_LOCKED') {
          expect(result.error.unlockAt).toBeInstanceOf(Date);
        }
      }

      // アカウントがロックされたことを確認
      expect(mockPrismaClient.user.update).toHaveBeenCalledWith({
        where: { id: userId },
        data: {
          twoFactorFailures: 5,
          twoFactorLockedUntil: expect.any(Date),
        },
      });
    });

    it('2FAアカウントロック中はACCOUNT_LOCKEDエラーを返す', async () => {
      // Arrange: モックの設定
      const userId = 'user-123';
      const totpCode = '123456';
      const lockUntil = new Date(Date.now() + 3 * 60 * 1000); // 3分後まで

      const mockUser: User & { userRoles: Array<{ role: { name: string } }> } = {
        id: userId,
        email: 'user@example.com',
        displayName: 'Test User',
        passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$testSalt$testHash',
        twoFactorEnabled: true,
        twoFactorSecret: 'encrypted-totp-secret',
        isLocked: false,
        lockedUntil: null,
        loginFailures: 0,
        twoFactorFailures: 5,
        twoFactorLockedUntil: lockUntil,
        createdAt: new Date(),
        updatedAt: new Date(),
        userRoles: [{ role: { name: 'user' } }],
      };

      // Prisma.user.findUnique() のモック
      (mockPrismaClient.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(mockUser);

      // Act: ロック中のログイン試行
      const result = await authService.verify2FA(userId, totpCode);

      // Assert: アカウントロック
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe('ACCOUNT_LOCKED');
        if (result.error.type === 'ACCOUNT_LOCKED') {
          expect(result.error.unlockAt).toEqual(lockUntil);
        }
      }
    });

    it('2FAロック期限切れの場合はロック解除してTOTP検証を実行', async () => {
      // Arrange: モックの設定
      const userId = 'user-123';
      const totpCode = '123456';
      const expiredLockUntil = new Date(Date.now() - 1000); // 1秒前（期限切れ）

      const mockUser: User & { userRoles: Array<{ role: { name: string } }> } = {
        id: userId,
        email: 'user@example.com',
        displayName: 'Test User',
        passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$testSalt$testHash',
        twoFactorEnabled: true,
        twoFactorSecret: 'encrypted-totp-secret',
        isLocked: false,
        lockedUntil: null,
        loginFailures: 0,
        twoFactorFailures: 5,
        twoFactorLockedUntil: expiredLockUntil,
        createdAt: new Date(),
        updatedAt: new Date(),
        userRoles: [{ role: { name: 'user' } }],
      };

      const unlockedUser = { ...mockUser, twoFactorFailures: 0, twoFactorLockedUntil: null };

      // Prisma.user.findUnique() のモック
      (mockPrismaClient.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(mockUser);

      // Prisma.user.update() のモック（ロック解除用）
      (mockPrismaClient.user.update as ReturnType<typeof vi.fn>).mockResolvedValue(unlockedUser);

      // TwoFactorService.verifyTOTP() のモック（成功）
      (mockTwoFactorService.verifyTOTP as ReturnType<typeof vi.fn>).mockResolvedValue(Ok(true));

      // TokenService.generateAccessToken() のモック
      (mockTokenService.generateAccessToken as ReturnType<typeof vi.fn>).mockResolvedValue(
        'access-token-123'
      );

      // TokenService.generateRefreshToken() のモック
      (mockTokenService.generateRefreshToken as ReturnType<typeof vi.fn>).mockResolvedValue(
        'refresh-token-456'
      );

      // SessionService.createSession() のモック
      (mockSessionService.createSession as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      // Act: ロック期限切れ後のログイン
      const result = await authService.verify2FA(userId, totpCode);

      // Assert: ロック解除されて認証成功
      expect(result.ok).toBe(true);

      // ロック解除が実行されたことを確認
      expect(mockPrismaClient.user.update).toHaveBeenCalledWith({
        where: { id: userId },
        data: {
          twoFactorFailures: 0,
          twoFactorLockedUntil: null,
        },
      });
    });

    it('ユーザーが存在しない場合はUSER_NOT_FOUNDエラーを返す', async () => {
      // Arrange: モックの設定
      const userId = 'non-existent-user';
      const totpCode = '123456';

      // Prisma.user.findUnique() のモック（ユーザーが存在しない）
      (mockPrismaClient.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      // Act: 存在しないユーザー
      const result = await authService.verify2FA(userId, totpCode);

      // Assert: エラー
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe('USER_NOT_FOUND');
      }
    });
  });

  describe('logout()', () => {
    it('リフレッシュトークンを削除してログアウトできる', async () => {
      // Arrange
      const userId = 'user-123';
      const refreshToken = 'refresh-token-abc';

      (mockPrismaClient.refreshToken.deleteMany as ReturnType<typeof vi.fn>).mockResolvedValue({
        count: 1,
      });

      // Act
      const result = await authService.logout(userId, refreshToken);

      // Assert
      expect(result.ok).toBe(true);
      expect(mockPrismaClient.refreshToken.deleteMany).toHaveBeenCalledWith({
        where: {
          userId,
          token: refreshToken,
        },
      });
    });

    it('データベースエラー時にDATABASE_ERRORを返す', async () => {
      // Arrange
      const userId = 'user-123';
      const refreshToken = 'refresh-token-abc';

      (mockPrismaClient.refreshToken.deleteMany as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Database error')
      );

      // Act
      const result = await authService.logout(userId, refreshToken);

      // Assert
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe('DATABASE_ERROR');
        if (result.error.type === 'DATABASE_ERROR') {
          expect(result.error.message).toBe('Database error');
        }
      }
    });
  });

  describe('logoutAll()', () => {
    it('ユーザーの全リフレッシュトークンを削除してログアウトできる', async () => {
      // Arrange
      const userId = 'user-456';

      (mockPrismaClient.refreshToken.deleteMany as ReturnType<typeof vi.fn>).mockResolvedValue({
        count: 3,
      });

      // Act
      const result = await authService.logoutAll(userId);

      // Assert
      expect(result.ok).toBe(true);
      expect(mockPrismaClient.refreshToken.deleteMany).toHaveBeenCalledWith({
        where: {
          userId,
        },
      });
    });

    it('データベースエラー時にDATABASE_ERRORを返す', async () => {
      // Arrange
      const userId = 'user-456';

      (mockPrismaClient.refreshToken.deleteMany as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Database connection failed')
      );

      // Act
      const result = await authService.logoutAll(userId);

      // Assert
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe('DATABASE_ERROR');
        if (result.error.type === 'DATABASE_ERROR') {
          expect(result.error.message).toBe('Database connection failed');
        }
      }
    });
  });

  describe('refreshToken', () => {
    it('正常にリフレッシュトークンを使って新しいトークンを発行', async () => {
      // Arrange
      const refreshToken = 'refresh-token-valid';
      const userId = 'user-123';
      const email = 'test@example.com';
      const displayName = 'Test User';
      const createdAt = new Date();

      // TokenService.verifyToken をモック（成功）
      (mockTokenService.verifyToken as ReturnType<typeof vi.fn>).mockResolvedValue(
        Ok({ userId, email, roles: ['user'] })
      );

      // Prisma.refreshToken.findUnique をモック
      (mockPrismaClient.refreshToken.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'token-id-123',
        token: refreshToken,
        userId,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7日後
        deviceInfo: 'Chrome/Windows',
        createdAt,
        user: {
          id: userId,
          email,
          displayName,
          passwordHash: 'hashed',
          twoFactorEnabled: false,
          createdAt,
          updatedAt: createdAt,
          userRoles: [
            {
              role: { name: 'user' },
            },
          ],
        },
      });

      // TokenService.generateAccessToken と generateRefreshToken をモック
      (mockTokenService.generateAccessToken as ReturnType<typeof vi.fn>).mockResolvedValue(
        'new-access-token'
      );
      (mockTokenService.generateRefreshToken as ReturnType<typeof vi.fn>).mockResolvedValue(
        'new-refresh-token'
      );

      // Prisma.refreshToken.delete をモック
      (mockPrismaClient.refreshToken.delete as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'token-id-123',
      });

      // SessionService.createSession をモック
      (mockSessionService.createSession as ReturnType<typeof vi.fn>).mockResolvedValue(
        Ok(undefined)
      );

      // Act
      const result = await authService.refreshToken(refreshToken);

      // Assert
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.accessToken).toBe('new-access-token');
        expect(result.value.refreshToken).toBe('new-refresh-token');
        expect(result.value.user.id).toBe(userId);
        expect(result.value.user.email).toBe(email);
      }
      expect(mockTokenService.verifyToken).toHaveBeenCalledWith(refreshToken, 'refresh');
      expect(mockPrismaClient.refreshToken.findUnique).toHaveBeenCalled();
      expect(mockPrismaClient.refreshToken.delete).toHaveBeenCalled();
      expect(mockSessionService.createSession).toHaveBeenCalled();
    });

    it('無効なリフレッシュトークンの場合、INVALID_REFRESH_TOKENエラーを返す', async () => {
      // Arrange
      const refreshToken = 'invalid-refresh-token';

      // TokenService.verifyToken をモック（失敗）
      (mockTokenService.verifyToken as ReturnType<typeof vi.fn>).mockResolvedValue(
        Err({ type: 'INVALID_TOKEN', message: 'Invalid token' })
      );

      // Act
      const result = await authService.refreshToken(refreshToken);

      // Assert
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe('INVALID_REFRESH_TOKEN');
      }
    });

    it('リフレッシュトークンがデータベースに存在しない場合、INVALID_REFRESH_TOKENエラーを返す', async () => {
      // Arrange
      const refreshToken = 'nonexistent-refresh-token';

      // TokenService.verifyToken をモック（成功）
      (mockTokenService.verifyToken as ReturnType<typeof vi.fn>).mockResolvedValue(
        Ok({ userId: 'user-123', email: 'test@example.com', roles: ['user'] })
      );

      // Prisma.refreshToken.findUnique をモック（null を返す）
      (mockPrismaClient.refreshToken.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
        null
      );

      // Act
      const result = await authService.refreshToken(refreshToken);

      // Assert
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe('INVALID_REFRESH_TOKEN');
      }
    });

    it('リフレッシュトークンが期限切れの場合、REFRESH_TOKEN_EXPIREDエラーを返す', async () => {
      // Arrange
      const refreshToken = 'expired-refresh-token';
      const userId = 'user-123';

      // TokenService.verifyToken をモック（成功）
      (mockTokenService.verifyToken as ReturnType<typeof vi.fn>).mockResolvedValue(
        Ok({ userId, email: 'test@example.com', roles: ['user'] })
      );

      // Prisma.refreshToken.findUnique をモック（期限切れ）
      (mockPrismaClient.refreshToken.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'token-id-123',
        token: refreshToken,
        userId,
        expiresAt: new Date(Date.now() - 1000), // 過去の日時
        deviceInfo: 'Chrome/Windows',
        createdAt: new Date(),
        user: {
          id: userId,
          email: 'test@example.com',
          displayName: 'Test User',
          createdAt: new Date(),
          userRoles: [],
        },
      });

      // Act
      const result = await authService.refreshToken(refreshToken);

      // Assert
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe('REFRESH_TOKEN_EXPIRED');
      }
    });

    it('データベースエラー時にDATABASE_ERRORを返す', async () => {
      // Arrange
      const refreshToken = 'refresh-token-abc';

      // TokenService.verifyToken をモック（成功）
      (mockTokenService.verifyToken as ReturnType<typeof vi.fn>).mockResolvedValue(
        Ok({ userId: 'user-123', email: 'test@example.com', roles: ['user'] })
      );

      // Prisma.refreshToken.findUnique をモック（データベースエラー）
      (mockPrismaClient.refreshToken.findUnique as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Database connection failed')
      );

      // Act
      const result = await authService.refreshToken(refreshToken);

      // Assert
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe('DATABASE_ERROR');
        if (result.error.type === 'DATABASE_ERROR') {
          expect(result.error.message).toBe('Database connection failed');
        }
      }
    });
  });
});
