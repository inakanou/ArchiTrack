/**
 * @fileoverview 認証サービスの単体テスト
 *
 * Requirements (user-authentication):
 * - REQ-2.1-REQ-2.12: ユーザー登録機能（招待経由、トランザクション管理）
 * - REQ-4.1-REQ-4.7: ログイン機能（連続失敗検知、アカウントロック）
 * - REQ-8.1-REQ-8.5: セッション管理
 * - REQ-9.1-REQ-9.5: ユーザー情報取得
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as jose from 'jose';
import { AuthService } from '../../../services/auth.service.js';
import { InvitationService } from '../../../services/invitation.service.js';
import { PasswordService } from '../../../services/password.service.js';
import { TokenService } from '../../../services/token.service.js';
import { TwoFactorService } from '../../../services/two-factor.service.js';
import { SessionService } from '../../../services/session.service.js';
import type { TwoFactorChallengeService } from '../../../services/two-factor-challenge.service.js';
import type { PrismaClient, User, Invitation } from '../../../generated/prisma/client.js';
import { Ok, Err } from '../../../types/result.js';
import * as timingModule from '../../../utils/timing.js';

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
  auditLog: {
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
  verifyToken: vi.fn(),
} as unknown as TokenService;

const mockTwoFactorService = {
  verifyTOTP: vi.fn(),
  verifyBackupCode: vi.fn(),
} as unknown as TwoFactorService;

const mockSessionService = {
  createSession: vi.fn(),
  rotate: vi.fn(),
  revokeByToken: vi.fn(),
  revokeAllForUser: vi.fn(),
  revokeSessionById: vi.fn(),
  listSessions: vi.fn(),
} as unknown as SessionService;

const mockTwoFactorChallengeService = {
  issue: vi.fn(),
  peek: vi.fn(),
  consume: vi.fn(),
} as unknown as TwoFactorChallengeService;

/** ログインで発行された（ことにする）2FA 待ちの資格 */
const CHALLENGE_TOKEN = 'challenge-token-1';

describe('AuthService', () => {
  let authService: AuthService;

  /**
   * 利用者 userId に結び付いた資格を照会できる状態にして、TOTP による 2FA の検証を完了させる
   */
  function verifyTotpWithChallenge(userId: string, code: string, deviceInfo?: string) {
    (mockTwoFactorChallengeService.peek as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      Ok({ userId })
    );
    return authService.completeTwoFactorLogin(CHALLENGE_TOKEN, { kind: 'totp', code }, deviceInfo);
  }

  /**
   * 利用者 userId に結び付いた資格を照会できる状態にして、バックアップコードによる 2FA の検証を完了させる
   */
  function verifyBackupWithChallenge(userId: string, backupCode: string, deviceInfo?: string) {
    (mockTwoFactorChallengeService.peek as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      Ok({ userId })
    );
    return authService.completeTwoFactorLogin(
      CHALLENGE_TOKEN,
      { kind: 'backup', backupCode },
      deviceInfo
    );
  }

  beforeEach(() => {
    vi.clearAllMocks();
    authService = new AuthService(
      mockPrismaClient,
      mockInvitationService,
      mockPasswordService,
      mockTokenService,
      mockTwoFactorService,
      mockSessionService,
      mockTwoFactorChallengeService
    );
    (mockTwoFactorChallengeService.consume as ReturnType<typeof vi.fn>).mockResolvedValue(
      Ok(undefined)
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
        isActive: true,
        deactivatedAt: null,
        deactivationReason: null,
        lastLoginAt: null,
        mustChangePassword: false,
        twoFactorLastUsedStep: null,
        twoFactorPendingSecret: null,
        invitedById: null,
        accessTokenGeneration: 0,
        reactivatedAt: null,
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
      // SessionService.createSession() のモック（新しい系列のリフレッシュトークンを発行する）
      (mockSessionService.createSession as ReturnType<typeof vi.fn>).mockResolvedValue({
        refreshToken: 'refresh-token-456',
        familyId: 'family-1',
      });

      // Act: ユーザー登録
      const result = await authService.register(invitationToken, registerData);

      // Assert: 登録成功
      expect(result.ok).toBe(true);
      // 発行時の利用者の世代（新規の利用者は 0）をアクセストークンに載せる（要件34.7）
      expect(mockTokenService.generateAccessToken).toHaveBeenCalledWith({
        userId: 'user-123',
        email: 'newuser@example.com',
        roles: ['user'],
        accessTokenGeneration: 0,
      });
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
        isActive: true,
        deactivatedAt: null,
        deactivationReason: null,
        lastLoginAt: null,
        mustChangePassword: false,
        twoFactorLastUsedStep: null,
        twoFactorPendingSecret: null,
        invitedById: null,
        accessTokenGeneration: 4,
        reactivatedAt: null,
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
      // SessionService.createSession() のモック（新しい系列のリフレッシュトークンを発行する）
      (mockSessionService.createSession as ReturnType<typeof vi.fn>).mockResolvedValue({
        refreshToken: 'refresh-token-456',
        familyId: 'family-1',
      });

      // Act: ログイン
      const result = await authService.login(email, password);

      // Assert: ログイン成功
      expect(result.ok).toBe(true);
      // 発行時の利用者の世代をアクセストークンに載せる（要件34.7）
      expect(mockTokenService.generateAccessToken).toHaveBeenCalledWith(
        expect.objectContaining({ accessTokenGeneration: 4 })
      );
      if (result.ok && result.value.type === 'SUCCESS') {
        expect(result.value.accessToken).toBe('access-token-123');
        expect(result.value.refreshToken).toBe('refresh-token-456');
        expect(result.value.user.email).toBe(email);
      } else {
        expect.fail(`expected SUCCESS: ${JSON.stringify(result)}`);
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
        isActive: true,
        deactivatedAt: null,
        deactivationReason: null,
        lastLoginAt: null,
        mustChangePassword: false,
        twoFactorLastUsedStep: null,
        twoFactorPendingSecret: null,
        invitedById: null,
        accessTokenGeneration: 0,
        reactivatedAt: null,
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
        isActive: true,
        deactivatedAt: null,
        deactivationReason: null,
        lastLoginAt: null,
        mustChangePassword: false,
        twoFactorLastUsedStep: null,
        twoFactorPendingSecret: null,
        invitedById: null,
        accessTokenGeneration: 0,
        reactivatedAt: null,
        userRoles: [{ role: { name: 'user' } }],
      };

      (mockPrismaClient.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(mockUser);
      (mockPasswordService.verifyPassword as ReturnType<typeof vi.fn>).mockResolvedValue(false);
      (mockPrismaClient.user.update as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...mockUser,
        loginFailures: 1,
      });

      const delaySpy = vi.spyOn(timingModule, 'addTimingAttackDelay').mockResolvedValue();

      // Act
      const result = await authService.login(email, password);

      // Assert: タイミング攻撃対策の遅延関数が呼び出されたことを確認
      expect(result.ok).toBe(false);
      expect(delaySpy).toHaveBeenCalled();

      delaySpy.mockRestore();
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
        isActive: true,
        deactivatedAt: null,
        deactivationReason: null,
        lastLoginAt: null,
        mustChangePassword: false,
        twoFactorLastUsedStep: null,
        twoFactorPendingSecret: null,
        invitedById: null,
        accessTokenGeneration: 0,
        reactivatedAt: null,
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
        isActive: true,
        deactivatedAt: null,
        deactivationReason: null,
        lastLoginAt: null,
        mustChangePassword: false,
        twoFactorLastUsedStep: null,
        twoFactorPendingSecret: null,
        invitedById: null,
        accessTokenGeneration: 0,
        reactivatedAt: null,
        userRoles: [{ role: { name: 'user' } }],
      };

      (mockPrismaClient.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(mockUser);
      (mockPasswordService.verifyPassword as ReturnType<typeof vi.fn>).mockResolvedValue(true);
      (mockPrismaClient.user.update as ReturnType<typeof vi.fn>).mockResolvedValue(mockUser);
      (mockTokenService.generateAccessToken as ReturnType<typeof vi.fn>).mockResolvedValue(
        'access-token-123'
      );
      (mockSessionService.createSession as ReturnType<typeof vi.fn>).mockResolvedValue({
        refreshToken: 'refresh-token-456',
        familyId: 'family-1',
      });

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
        isActive: true,
        deactivatedAt: null,
        deactivationReason: null,
        lastLoginAt: null,
        mustChangePassword: false,
        twoFactorLastUsedStep: null,
        twoFactorPendingSecret: null,
        invitedById: null,
        accessTokenGeneration: 0,
        reactivatedAt: null,
        userRoles: [{ role: { name: 'user' } }],
      };

      (mockPrismaClient.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(mockUser);
      (mockPasswordService.verifyPassword as ReturnType<typeof vi.fn>).mockResolvedValue(false);
      (mockPrismaClient.user.update as ReturnType<typeof vi.fn>).mockResolvedValue(mockUser);

      // Act
      const result = await authService.login(email, password);

      // Assert
      // 5回目の失敗時にアカウントロックを設定し、即座にACCOUNT_LOCKEDを返す
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
        isActive: true,
        deactivatedAt: null,
        deactivationReason: null,
        lastLoginAt: null,
        mustChangePassword: false,
        twoFactorLastUsedStep: null,
        twoFactorPendingSecret: null,
        invitedById: null,
        accessTokenGeneration: 0,
        reactivatedAt: null,
        userRoles: [{ role: { name: 'user' } }],
      };

      (mockPrismaClient.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(mockUser);
      (mockPasswordService.verifyPassword as ReturnType<typeof vi.fn>).mockResolvedValue(true);
      (mockPrismaClient.user.update as ReturnType<typeof vi.fn>).mockResolvedValue(mockUser);
      (mockTwoFactorChallengeService.issue as ReturnType<typeof vi.fn>).mockResolvedValue(
        Ok({ challengeToken: CHALLENGE_TOKEN, expiresIn: 300 })
      );

      // Act
      const result = await authService.login(email, password);

      // Assert
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toEqual({
          type: '2FA_REQUIRED',
          challengeToken: CHALLENGE_TOKEN,
          expiresIn: 300,
        });
      }
      expect(mockTwoFactorChallengeService.issue).toHaveBeenCalledWith('user-2fa-123');
    });
  });

  describe('login()（2FA 待ちの資格）', () => {
    const email = 'user-2fa@example.com';
    const password = 'SecurePass123!@#';

    function arrangeTwoFactorUser(passwordValid: boolean): void {
      (mockPrismaClient.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'user-2fa-123',
        email,
        displayName: 'User with 2FA',
        passwordHash: 'hash',
        twoFactorEnabled: true,
        isLocked: false,
        lockedUntil: null,
        loginFailures: 0,
        createdAt: new Date(),
        userRoles: [{ role: { name: 'user' } }],
      });
      (mockPasswordService.verifyPassword as ReturnType<typeof vi.fn>).mockResolvedValue(
        passwordValid
      );
      (mockPrismaClient.user.update as ReturnType<typeof vi.fn>).mockResolvedValue({});
      vi.spyOn(timingModule, 'addTimingAttackDelay').mockResolvedValue(undefined);
    }

    /**
     * @requirement user-authentication/REQ-32.1
     * @requirement user-authentication/REQ-42.7
     */
    it('パスワードの成功で発行した資格だけを返し、利用者 ID を応答に含めない', async () => {
      arrangeTwoFactorUser(true);
      (mockTwoFactorChallengeService.issue as ReturnType<typeof vi.fn>).mockResolvedValue(
        Ok({ challengeToken: CHALLENGE_TOKEN, expiresIn: 300 })
      );

      const result = await authService.login(email, password);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).not.toHaveProperty('userId');
      expect(JSON.stringify(result.value)).not.toContain('user-2fa-123');
      expect(mockTokenService.generateAccessToken).not.toHaveBeenCalled();
      expect(mockSessionService.createSession).not.toHaveBeenCalled();
    });

    /**
     * @requirement user-authentication/REQ-32.1
     */
    it('パスワードが誤りのときは資格を発行しない', async () => {
      arrangeTwoFactorUser(false);

      const result = await authService.login(email, password);

      expect(result).toEqual({ ok: false, error: { type: 'INVALID_CREDENTIALS' } });
      expect(mockTwoFactorChallengeService.issue).not.toHaveBeenCalled();
    });

    it('資格の保存先が使えないときは SERVICE_UNAVAILABLE を返し、トークンを発行しない', async () => {
      arrangeTwoFactorUser(true);
      (mockTwoFactorChallengeService.issue as ReturnType<typeof vi.fn>).mockResolvedValue(
        Err({ type: 'CHALLENGE_STORE_UNAVAILABLE' })
      );

      const result = await authService.login(email, password);

      expect(result).toEqual({ ok: false, error: { type: 'SERVICE_UNAVAILABLE' } });
      expect(mockTokenService.generateAccessToken).not.toHaveBeenCalled();
      expect(mockSessionService.createSession).not.toHaveBeenCalled();
    });
  });

  describe('completeTwoFactorLogin()（資格の照会と消費）', () => {
    const userId = 'user-123';

    function arrangeVerifiedUser(): void {
      (mockPrismaClient.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: userId,
        email: 'user@example.com',
        displayName: 'Test User',
        createdAt: new Date(),
        twoFactorEnabled: true,
        twoFactorFailures: 0,
        twoFactorLockedUntil: null,
        userRoles: [{ role: { name: 'user' } }],
      });
      (mockTwoFactorService.verifyTOTP as ReturnType<typeof vi.fn>).mockResolvedValue(Ok(true));
      (mockTwoFactorService.verifyBackupCode as ReturnType<typeof vi.fn>).mockResolvedValue(
        Ok(true)
      );
      (mockPrismaClient.user.update as ReturnType<typeof vi.fn>).mockResolvedValue({});
      (mockTokenService.generateAccessToken as ReturnType<typeof vi.fn>).mockResolvedValue(
        'access-token'
      );
      (mockSessionService.createSession as ReturnType<typeof vi.fn>).mockResolvedValue({
        refreshToken: 'refresh-token',
        familyId: 'family-1',
      });
    }

    /**
     * @requirement user-authentication/REQ-32.2
     * @requirement user-authentication/REQ-32.3
     * @requirement user-authentication/REQ-32.6
     */
    it.each([
      ['TOTP', { kind: 'totp', code: '123456' } as const],
      ['バックアップコード', { kind: 'backup', backupCode: 'ABCD1234' } as const],
    ])(
      '%s: 資格が照会できない（不在・期限切れ・消費済み）ときは CHALLENGE_INVALID で、コードを検証せずトークンを発行しない',
      async (_, proof) => {
        arrangeVerifiedUser();
        (mockTwoFactorChallengeService.peek as ReturnType<typeof vi.fn>).mockResolvedValue(
          Err({ type: 'CHALLENGE_INVALID' })
        );

        const result = await authService.completeTwoFactorLogin('unknown', proof);

        expect(result).toEqual({ ok: false, error: { type: 'CHALLENGE_INVALID' } });
        expect(mockTwoFactorService.verifyTOTP).not.toHaveBeenCalled();
        expect(mockTwoFactorService.verifyBackupCode).not.toHaveBeenCalled();
        expect(mockTokenService.generateAccessToken).not.toHaveBeenCalled();
        expect(mockSessionService.createSession).not.toHaveBeenCalled();
      }
    );

    it('資格の保存先が使えないときは SERVICE_UNAVAILABLE で、コードを検証しない', async () => {
      arrangeVerifiedUser();
      (mockTwoFactorChallengeService.peek as ReturnType<typeof vi.fn>).mockResolvedValue(
        Err({ type: 'CHALLENGE_STORE_UNAVAILABLE' })
      );

      const result = await authService.completeTwoFactorLogin(CHALLENGE_TOKEN, {
        kind: 'totp',
        code: '123456',
      });

      expect(result).toEqual({ ok: false, error: { type: 'SERVICE_UNAVAILABLE' } });
      expect(mockTwoFactorService.verifyTOTP).not.toHaveBeenCalled();
    });

    /**
     * @requirement user-authentication/REQ-32.1
     */
    it('資格に結び付いた利用者のコードを検証し、成功で資格を消費してからトークンを発行する', async () => {
      arrangeVerifiedUser();
      const order: string[] = [];
      (mockTwoFactorChallengeService.consume as ReturnType<typeof vi.fn>).mockImplementation(
        async () => {
          order.push('consume');
          return Ok(undefined);
        }
      );
      (mockSessionService.createSession as ReturnType<typeof vi.fn>).mockImplementation(
        async () => {
          order.push('createSession');
          return { refreshToken: 'refresh-token', familyId: 'family-1' };
        }
      );

      const result = await verifyTotpWithChallenge(userId, '654321');

      expect(result.ok).toBe(true);
      expect(mockTwoFactorChallengeService.peek).toHaveBeenCalledWith(CHALLENGE_TOKEN);
      expect(mockTwoFactorService.verifyTOTP).toHaveBeenCalledWith(userId, '654321');
      expect(mockTwoFactorChallengeService.consume).toHaveBeenCalledWith(CHALLENGE_TOKEN);
      expect(order).toEqual(['consume', 'createSession']);
    });

    /**
     * @requirement user-authentication/REQ-32.4
     */
    it.each([
      ['TOTP', { kind: 'totp', code: '123456' } as const],
      ['バックアップコード', { kind: 'backup', backupCode: 'ABCD1234' } as const],
    ])(
      '%s: コードが正しくても資格の消費に失敗した（同時の二重成功）ときは CHALLENGE_INVALID で、トークンを発行しない',
      async (_, proof) => {
        arrangeVerifiedUser();
        (mockTwoFactorChallengeService.peek as ReturnType<typeof vi.fn>).mockResolvedValue(
          Ok({ userId })
        );
        (mockTwoFactorChallengeService.consume as ReturnType<typeof vi.fn>).mockResolvedValue(
          Err({ type: 'CHALLENGE_INVALID' })
        );

        const result = await authService.completeTwoFactorLogin(CHALLENGE_TOKEN, proof);

        expect(result).toEqual({ ok: false, error: { type: 'CHALLENGE_INVALID' } });
        expect(mockTokenService.generateAccessToken).not.toHaveBeenCalled();
        expect(mockSessionService.createSession).not.toHaveBeenCalled();
      }
    );

    it('資格の消費で保存先が使えないときは SERVICE_UNAVAILABLE で、トークンを発行しない', async () => {
      arrangeVerifiedUser();
      (mockTwoFactorChallengeService.consume as ReturnType<typeof vi.fn>).mockResolvedValue(
        Err({ type: 'CHALLENGE_STORE_UNAVAILABLE' })
      );

      const result = await verifyTotpWithChallenge(userId, '123456');

      expect(result).toEqual({ ok: false, error: { type: 'SERVICE_UNAVAILABLE' } });
      expect(mockSessionService.createSession).not.toHaveBeenCalled();
    });

    /**
     * @requirement user-authentication/REQ-32.6
     */
    it('バックアップコードも資格に結び付いた利用者で検証し、成功で資格を消費する', async () => {
      arrangeVerifiedUser();

      const result = await verifyBackupWithChallenge(userId, 'ABCD1234');

      expect(result.ok).toBe(true);
      expect(mockTwoFactorService.verifyBackupCode).toHaveBeenCalledWith(userId, 'ABCD1234');
      expect(mockTwoFactorChallengeService.consume).toHaveBeenCalledWith(CHALLENGE_TOKEN);
    });

    it('コードが誤りのときは資格を消費しない（期限内の再試行を認める）', async () => {
      arrangeVerifiedUser();
      (mockTwoFactorService.verifyTOTP as ReturnType<typeof vi.fn>).mockResolvedValue(Ok(false));

      const result = await verifyTotpWithChallenge(userId, '000000');

      expect(result).toEqual({ ok: false, error: { type: 'INVALID_2FA_CODE' } });
      expect(mockTwoFactorChallengeService.consume).not.toHaveBeenCalled();
    });

    /**
     * @requirement user-authentication/REQ-32.7
     */
    it('TOTP の再利用（CODE_ALREADY_USED）は通常の誤りと同じ INVALID_2FA_CODE で、資格を消費せずトークンを発行しない', async () => {
      arrangeVerifiedUser();
      (mockTwoFactorService.verifyTOTP as ReturnType<typeof vi.fn>).mockResolvedValue(
        Err({ type: 'CODE_ALREADY_USED' })
      );

      const result = await verifyTotpWithChallenge(userId, '654321');

      expect(result).toEqual({ ok: false, error: { type: 'INVALID_2FA_CODE' } });
      expect(mockTwoFactorChallengeService.consume).not.toHaveBeenCalled();
      expect(mockTokenService.generateAccessToken).not.toHaveBeenCalled();
      expect(mockSessionService.createSession).not.toHaveBeenCalled();
    });
  });

  describe('getCurrentUser()', () => {
    it('ユーザー情報を正常に取得する', async () => {
      // Arrange: モックの設定
      const userId = 'user-456';

      const mockUser: User & {
        userRoles: Array<{
          role: {
            name: string;
            rolePermissions: Array<{
              permission: { resource: string; action: string };
            }>;
          };
        }>;
      } = {
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
        isActive: true,
        deactivatedAt: null,
        deactivationReason: null,
        lastLoginAt: null,
        mustChangePassword: false,
        twoFactorLastUsedStep: null,
        twoFactorPendingSecret: null,
        invitedById: null,
        accessTokenGeneration: 0,
        reactivatedAt: null,
        userRoles: [
          {
            role: {
              name: 'user',
              rolePermissions: [
                { permission: { resource: 'contract', action: 'read' } },
                { permission: { resource: 'contract', action: 'create' } },
              ],
            },
          },
        ],
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
        // permissions フィールドの検証
        expect(result.value.permissions).toBeDefined();
        expect(result.value.permissions).toContain('contract:read');
        expect(result.value.permissions).toContain('contract:create');
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

  describe('completeTwoFactorLogin()（TOTP）', () => {
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
        isActive: true,
        deactivatedAt: null,
        deactivationReason: null,
        lastLoginAt: null,
        mustChangePassword: false,
        twoFactorLastUsedStep: null,
        twoFactorPendingSecret: null,
        invitedById: null,
        accessTokenGeneration: 5,
        reactivatedAt: null,
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
      // SessionService.createSession() のモック（新しい系列のリフレッシュトークンを発行する）
      (mockSessionService.createSession as ReturnType<typeof vi.fn>).mockResolvedValue({
        refreshToken: 'refresh-token-456',
        familyId: 'family-1',
      });

      // Act: 2FA検証
      const result = await verifyTotpWithChallenge(userId, totpCode);

      // Assert: 認証成功
      expect(result.ok).toBe(true);
      // 発行時の利用者の世代をアクセストークンに載せる（要件34.7）
      expect(mockTokenService.generateAccessToken).toHaveBeenCalledWith(
        expect.objectContaining({ userId, accessTokenGeneration: 5 })
      );
      if (result.ok) {
        expect(result.value.accessToken).toBe('access-token-123');
        expect(result.value.refreshToken).toBe('refresh-token-456');
        expect(result.value.user.email).toBe('user@example.com');
      }

      // モックが正しく呼ばれたか検証
      expect(mockTwoFactorService.verifyTOTP).toHaveBeenCalledWith(userId, totpCode);
      // 失敗カウンターのリセットと同じ書き込みで最終ログイン日時を記録する（要件36.7）
      expect(mockPrismaClient.user.update).toHaveBeenCalledWith({
        where: { id: userId },
        data: {
          twoFactorFailures: 0,
          twoFactorLockedUntil: null,
          lastLoginAt: expect.any(Date),
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
      const result = await verifyTotpWithChallenge(userId, totpCode);

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
        isActive: true,
        deactivatedAt: null,
        deactivationReason: null,
        lastLoginAt: null,
        mustChangePassword: false,
        twoFactorLastUsedStep: null,
        twoFactorPendingSecret: null,
        invitedById: null,
        accessTokenGeneration: 0,
        reactivatedAt: null,
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
      const result = await verifyTotpWithChallenge(userId, totpCode);

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
        isActive: true,
        deactivatedAt: null,
        deactivationReason: null,
        lastLoginAt: null,
        mustChangePassword: false,
        twoFactorLastUsedStep: null,
        twoFactorPendingSecret: null,
        invitedById: null,
        accessTokenGeneration: 0,
        reactivatedAt: null,
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
      const result = await verifyTotpWithChallenge(userId, totpCode);

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
        isActive: true,
        deactivatedAt: null,
        deactivationReason: null,
        lastLoginAt: null,
        mustChangePassword: false,
        twoFactorLastUsedStep: null,
        twoFactorPendingSecret: null,
        invitedById: null,
        accessTokenGeneration: 0,
        reactivatedAt: null,
        userRoles: [{ role: { name: 'user' } }],
      };

      // Prisma.user.findUnique() のモック
      (mockPrismaClient.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(mockUser);

      // Act: ロック中のログイン試行
      const result = await verifyTotpWithChallenge(userId, totpCode);

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
        isActive: true,
        deactivatedAt: null,
        deactivationReason: null,
        lastLoginAt: null,
        mustChangePassword: false,
        twoFactorLastUsedStep: null,
        twoFactorPendingSecret: null,
        invitedById: null,
        accessTokenGeneration: 0,
        reactivatedAt: null,
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
      // SessionService.createSession() のモック（新しい系列のリフレッシュトークンを発行する）
      (mockSessionService.createSession as ReturnType<typeof vi.fn>).mockResolvedValue({
        refreshToken: 'refresh-token-456',
        familyId: 'family-1',
      });

      // Act: ロック期限切れ後のログイン
      const result = await verifyTotpWithChallenge(userId, totpCode);

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
      const result = await verifyTotpWithChallenge(userId, totpCode);

      // Assert: エラー
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe('USER_NOT_FOUND');
      }
    });
  });

  describe('logout()', () => {
    it('提示したリフレッシュトークンの系列を失効させてログアウトできる', async () => {
      (mockSessionService.revokeByToken as ReturnType<typeof vi.fn>).mockResolvedValue(2);

      const result = await authService.logout('user-123', 'refresh-token-abc');

      expect(result.ok).toBe(true);
      expect(mockSessionService.revokeByToken).toHaveBeenCalledWith(
        'refresh-token-abc',
        'user-123'
      );
    });

    it('データベースエラー時にDATABASE_ERRORを返す', async () => {
      (mockSessionService.revokeByToken as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Database error')
      );

      const result = await authService.logout('user-123', 'refresh-token-abc');

      expect(result).toEqual({
        ok: false,
        error: { type: 'DATABASE_ERROR', message: 'Database error' },
      });
    });
  });

  describe('logoutAll()', () => {
    it('ユーザーの全リフレッシュトークンを失効させてログアウトできる', async () => {
      (mockSessionService.revokeAllForUser as ReturnType<typeof vi.fn>).mockResolvedValue(3);

      const result = await authService.logoutAll('user-456');

      expect(result.ok).toBe(true);
      expect(mockSessionService.revokeAllForUser).toHaveBeenCalledWith('user-456');
    });

    it('データベースエラー時にDATABASE_ERRORを返す', async () => {
      (mockSessionService.revokeAllForUser as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Database connection failed')
      );

      const result = await authService.logoutAll('user-456');

      expect(result).toEqual({
        ok: false,
        error: { type: 'DATABASE_ERROR', message: 'Database connection failed' },
      });
    });
  });

  describe('refreshToken', () => {
    const userId = 'user-123';
    const storedUser = {
      id: userId,
      email: 'test@example.com',
      displayName: 'Test User',
      passwordHash: 'hashed',
      twoFactorEnabled: false,
      createdAt: new Date(),
      updatedAt: new Date(),
      accessTokenGeneration: 2,
      userRoles: [{ role: { name: 'user' } }],
    };

    beforeEach(() => {
      (mockTokenService.verifyToken as ReturnType<typeof vi.fn>).mockResolvedValue(
        Ok({ userId, email: undefined, roles: undefined })
      );
      (mockPrismaClient.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(storedUser);
      (mockTokenService.generateAccessToken as ReturnType<typeof vi.fn>).mockResolvedValue(
        'new-access-token'
      );
    });

    it('ローテーションの後継と新しいアクセストークンを返す', async () => {
      (mockSessionService.rotate as ReturnType<typeof vi.fn>).mockResolvedValue(
        Ok({ userId, familyId: 'family-1', refreshToken: 'new-refresh-token' })
      );

      const result = await authService.refreshToken('refresh-token-valid');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.accessToken).toBe('new-access-token');
        expect(result.value.refreshToken).toBe('new-refresh-token');
        expect(result.value.user.id).toBe(userId);
        expect(result.value.user.email).toBe('test@example.com');
      }
      expect(mockTokenService.verifyToken).toHaveBeenCalledWith('refresh-token-valid', 'refresh');
      expect(mockSessionService.rotate).toHaveBeenCalledWith('refresh-token-valid');
      // 発行時の利用者の世代をアクセストークンに載せる（要件34.7）
      expect(mockTokenService.generateAccessToken).toHaveBeenCalledWith({
        userId,
        email: 'test@example.com',
        roles: ['user'],
        accessTokenGeneration: 2,
      });
      expect(mockTokenService.generateRefreshToken).not.toHaveBeenCalled();
    });

    it('無効なリフレッシュトークンの場合、INVALID_REFRESH_TOKENエラーを返し、ローテーションしない', async () => {
      (mockTokenService.verifyToken as ReturnType<typeof vi.fn>).mockResolvedValue(
        Err({ type: 'TOKEN_INVALID' })
      );

      const result = await authService.refreshToken('invalid-refresh-token');

      expect(result).toEqual({ ok: false, error: { type: 'INVALID_REFRESH_TOKEN' } });
      expect(mockSessionService.rotate).not.toHaveBeenCalled();
    });

    it('保存の無いリフレッシュトークン（NOT_FOUND）は INVALID_REFRESH_TOKEN', async () => {
      (mockSessionService.rotate as ReturnType<typeof vi.fn>).mockResolvedValue(
        Err({ type: 'NOT_FOUND' })
      );

      const result = await authService.refreshToken('nonexistent-refresh-token');

      expect(result).toEqual({ ok: false, error: { type: 'INVALID_REFRESH_TOKEN' } });
    });

    it('期限切れ（EXPIRED）は REFRESH_TOKEN_EXPIRED', async () => {
      (mockSessionService.rotate as ReturnType<typeof vi.fn>).mockResolvedValue(
        Err({ type: 'EXPIRED' })
      );

      const result = await authService.refreshToken('expired-refresh-token');

      expect(result).toEqual({ ok: false, error: { type: 'REFRESH_TOKEN_EXPIRED' } });
    });

    it('置き換え済みのトークンの再提示（REUSE_DETECTED）は TOKEN_REUSE_DETECTED を返し、監査を記録する', async () => {
      (mockSessionService.rotate as ReturnType<typeof vi.fn>).mockResolvedValue(
        Err({ type: 'REUSE_DETECTED', userId, familyId: 'family-1' })
      );
      (mockPrismaClient.auditLog.create as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'audit-1',
        action: 'REFRESH_TOKEN_REUSE_DETECTED',
        actorId: userId,
        actorEmail: 'test@example.com',
        actorDisplayName: 'Test User',
        targetType: 'User',
        targetId: userId,
        before: null,
        after: null,
        metadata: {},
        createdAt: new Date(),
      });

      const result = await authService.refreshToken('replaced-refresh-token', {
        ipAddress: '203.0.113.7',
        userAgent: 'Test Agent',
      });

      expect(result).toEqual({ ok: false, error: { type: 'TOKEN_REUSE_DETECTED' } });
      expect(mockPrismaClient.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'REFRESH_TOKEN_REUSE_DETECTED',
            actorId: userId,
            actorEmail: 'test@example.com',
            targetType: 'User',
            targetId: userId,
            metadata: { familyId: 'family-1', ipAddress: '203.0.113.7', userAgent: 'Test Agent' },
          }),
        })
      );
      expect(mockTokenService.generateAccessToken).not.toHaveBeenCalled();
    });

    it('再利用の監査の記録の失敗は結果（TOKEN_REUSE_DETECTED）を変えない', async () => {
      (mockSessionService.rotate as ReturnType<typeof vi.fn>).mockResolvedValue(
        Err({ type: 'REUSE_DETECTED', userId, familyId: 'family-1' })
      );
      (mockPrismaClient.auditLog.create as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('audit insert failed')
      );

      const result = await authService.refreshToken('replaced-refresh-token');

      expect(result).toEqual({ ok: false, error: { type: 'TOKEN_REUSE_DETECTED' } });
    });

    it('利用者が存在しないときは INVALID_REFRESH_TOKEN', async () => {
      (mockPrismaClient.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      (mockSessionService.rotate as ReturnType<typeof vi.fn>).mockResolvedValue(
        Err({ type: 'NOT_FOUND' })
      );

      const result = await authService.refreshToken('orphan-refresh-token');

      expect(result).toEqual({ ok: false, error: { type: 'INVALID_REFRESH_TOKEN' } });
    });

    it('データベースエラー時にDATABASE_ERRORを返す', async () => {
      (mockSessionService.rotate as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Database connection failed')
      );

      const result = await authService.refreshToken('refresh-token-abc');

      expect(result).toEqual({
        ok: false,
        error: { type: 'DATABASE_ERROR', message: 'Database connection failed' },
      });
    });
  });

  describe('refreshToken（トークンの種別の検証。実際の TokenService）', () => {
    /**
     * 実際の TokenService で発行したトークンをリフレッシュへ渡す。ローテーションは成功する形にして、
     * 種別の検証だけで拒否されることを確かめる
     */
    async function createRealTokenAuthService(): Promise<{
      service: AuthService;
      tokenService: TokenService;
    }> {
      const keyPair = await jose.generateKeyPair('EdDSA', { extractable: true });
      process.env.JWT_PUBLIC_KEY = Buffer.from(
        JSON.stringify(await jose.exportJWK(keyPair.publicKey))
      ).toString('base64');
      process.env.JWT_PRIVATE_KEY = Buffer.from(
        JSON.stringify(await jose.exportJWK(keyPair.privateKey))
      ).toString('base64');
      const tokenService = new TokenService();
      const service = new AuthService(
        mockPrismaClient,
        mockInvitationService,
        mockPasswordService,
        tokenService,
        mockTwoFactorService,
        mockSessionService
      );
      return { service, tokenService };
    }

    const user = { userId: 'user-kind-1', email: 'kind@example.com', roles: ['user'] };

    beforeEach(() => {
      (mockPrismaClient.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: user.userId,
        email: user.email,
        displayName: 'Kind User',
        twoFactorEnabled: false,
        createdAt: new Date(),
        userRoles: [{ role: { name: 'user' } }],
      });
    });

    /**
     * @requirement user-authentication/REQ-33.2: アクセストークンを提示したリフレッシュを拒否する
     */
    it('アクセストークンでのリフレッシュは INVALID_REFRESH_TOKEN で拒否し、新しいトークンを発行しない', async () => {
      const { service, tokenService } = await createRealTokenAuthService();
      const accessToken = await tokenService.generateAccessToken({
        ...user,
        accessTokenGeneration: 0,
      });

      const result = await service.refreshToken(accessToken);

      expect(result).toEqual({ ok: false, error: { type: 'INVALID_REFRESH_TOKEN' } });
      expect(mockSessionService.rotate).not.toHaveBeenCalled();
    });

    it('リフレッシュトークンでのリフレッシュは成功する（対照）', async () => {
      const { service, tokenService } = await createRealTokenAuthService();
      const refreshToken = await tokenService.generateRefreshToken(user.userId, 'family-kind');
      const successor = await tokenService.generateRefreshToken(user.userId, 'family-kind');
      (mockSessionService.rotate as ReturnType<typeof vi.fn>).mockResolvedValue(
        Ok({ userId: user.userId, familyId: 'family-kind', refreshToken: successor })
      );

      const result = await service.refreshToken(refreshToken);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(jose.decodeJwt(result.value.accessToken).token_use).toBe('access');
        expect(jose.decodeJwt(result.value.refreshToken).token_use).toBe('refresh');
      }
    });
  });

  describe('completeTwoFactorLogin()（バックアップコード）', () => {
    it('バックアップコード検証成功でトークンを発行する', async () => {
      // Arrange
      const userId = 'user-123';
      const backupCode = 'BACKUP-CODE-1';
      const deviceInfo = 'Test Device';

      const mockUser = {
        id: userId,
        email: 'test@example.com',
        displayName: 'Test User',
        createdAt: new Date(),
        twoFactorEnabled: true,
        twoFactorFailures: 0,
        twoFactorLockedUntil: null,
        userRoles: [{ role: { name: 'user' } }],
      };

      (mockPrismaClient.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(mockUser);
      (mockTwoFactorService.verifyBackupCode as ReturnType<typeof vi.fn>).mockResolvedValue(
        Ok(true)
      );
      (mockPrismaClient.user.update as ReturnType<typeof vi.fn>).mockResolvedValue(mockUser);
      (mockTokenService.generateAccessToken as ReturnType<typeof vi.fn>).mockResolvedValue(
        'access-token'
      );
      (mockSessionService.createSession as ReturnType<typeof vi.fn>).mockResolvedValue({
        refreshToken: 'refresh-token',
        familyId: 'family-1',
      });

      // Act
      const result = await verifyBackupWithChallenge(userId, backupCode, deviceInfo);

      // Assert
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.accessToken).toBe('access-token');
        expect(result.value.refreshToken).toBe('refresh-token');
        expect(result.value.user.id).toBe(userId);
      }
    });

    it('ユーザーが存在しない場合USER_NOT_FOUNDを返す', async () => {
      // Arrange
      (mockPrismaClient.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      // Act
      const result = await verifyBackupWithChallenge('non-existent-user', 'BACKUP-CODE');

      // Assert
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe('USER_NOT_FOUND');
      }
    });

    it('アカウントがロックされている場合ACCOUNT_LOCKEDを返す', async () => {
      // Arrange
      const userId = 'user-123';
      const futureDate = new Date(Date.now() + 60000); // 1分後

      const mockUser = {
        id: userId,
        email: 'test@example.com',
        displayName: 'Test User',
        createdAt: new Date(),
        twoFactorEnabled: true,
        twoFactorFailures: 5,
        twoFactorLockedUntil: futureDate,
        userRoles: [{ role: { name: 'user' } }],
      };

      (mockPrismaClient.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(mockUser);

      // Act
      const result = await verifyBackupWithChallenge(userId, 'BACKUP-CODE');

      // Assert
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe('ACCOUNT_LOCKED');
      }
    });

    it('ロック期限切れの場合はロックをリセットして処理を続行する', async () => {
      // Arrange
      const userId = 'user-123';
      const pastDate = new Date(Date.now() - 60000); // 1分前

      const mockUser = {
        id: userId,
        email: 'test@example.com',
        displayName: 'Test User',
        createdAt: new Date(),
        twoFactorEnabled: true,
        twoFactorFailures: 5,
        twoFactorLockedUntil: pastDate,
        userRoles: [{ role: { name: 'user' } }],
      };

      (mockPrismaClient.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(mockUser);
      (mockPrismaClient.user.update as ReturnType<typeof vi.fn>).mockResolvedValue(mockUser);
      (mockTwoFactorService.verifyBackupCode as ReturnType<typeof vi.fn>).mockResolvedValue(
        Ok(true)
      );
      (mockTokenService.generateAccessToken as ReturnType<typeof vi.fn>).mockResolvedValue(
        'access-token'
      );
      (mockSessionService.createSession as ReturnType<typeof vi.fn>).mockResolvedValue({
        refreshToken: 'refresh-token',
        familyId: 'family-1',
      });

      // Act
      const result = await verifyBackupWithChallenge(userId, 'BACKUP-CODE');

      // Assert
      expect(result.ok).toBe(true);
      // ロックリセットのためのupdate呼び出しを確認
      expect(mockPrismaClient.user.update).toHaveBeenCalledWith({
        where: { id: userId },
        data: {
          twoFactorFailures: 0,
          twoFactorLockedUntil: null,
        },
      });
    });

    it('バックアップコード検証失敗でINVALID_BACKUP_CODEを返す', async () => {
      // Arrange
      const userId = 'user-123';

      const mockUser = {
        id: userId,
        email: 'test@example.com',
        displayName: 'Test User',
        createdAt: new Date(),
        twoFactorEnabled: true,
        twoFactorFailures: 0,
        twoFactorLockedUntil: null,
        userRoles: [{ role: { name: 'user' } }],
      };

      (mockPrismaClient.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(mockUser);
      (mockTwoFactorService.verifyBackupCode as ReturnType<typeof vi.fn>).mockResolvedValue(
        Ok(false)
      );
      (mockPrismaClient.user.update as ReturnType<typeof vi.fn>).mockResolvedValue(mockUser);

      // Act
      const result = await verifyBackupWithChallenge(userId, 'INVALID-BACKUP-CODE');

      // Assert
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe('INVALID_BACKUP_CODE');
      }
    });

    it('バックアップコード検証失敗が上限に達した場合ACCOUNT_LOCKEDを返す', async () => {
      // Arrange
      const userId = 'user-123';

      const mockUser = {
        id: userId,
        email: 'test@example.com',
        displayName: 'Test User',
        createdAt: new Date(),
        twoFactorEnabled: true,
        twoFactorFailures: 4, // 次の失敗で5回目（ロック）
        twoFactorLockedUntil: null,
        userRoles: [{ role: { name: 'user' } }],
      };

      (mockPrismaClient.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(mockUser);
      (mockTwoFactorService.verifyBackupCode as ReturnType<typeof vi.fn>).mockResolvedValue(
        Ok(false)
      );
      (mockPrismaClient.user.update as ReturnType<typeof vi.fn>).mockResolvedValue(mockUser);

      // Act
      const result = await verifyBackupWithChallenge(userId, 'INVALID-BACKUP-CODE');

      // Assert
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe('ACCOUNT_LOCKED');
      }
    });

    it('データベースエラー時にDATABASE_ERRORを返す', async () => {
      // Arrange
      (mockPrismaClient.user.findUnique as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Database connection failed')
      );

      // Act
      const result = await verifyBackupWithChallenge('user-123', 'BACKUP-CODE');

      // Assert
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe('DATABASE_ERROR');
      }
    });
  });
});
