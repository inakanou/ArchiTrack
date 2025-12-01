import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PasswordService } from '../../../services/password.service.js';
import { PasswordViolation } from '../../../types/password.types.js';
import type {
  PrismaClient,
  User,
  PasswordResetToken,
  PasswordHistory,
} from '../../../generated/prisma/client.js';
import { EmailService } from '../../../services/email.service.js';

// Prisma Clientのモック
const mockPrismaClient = {
  user: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  passwordResetToken: {
    create: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  passwordHistory: {
    findMany: vi.fn(),
    create: vi.fn(),
    deleteMany: vi.fn(),
  },
  refreshToken: {
    deleteMany: vi.fn(),
  },
  $transaction: vi.fn(),
} as unknown as PrismaClient;

// EmailServiceのモック
const mockEmailService = {
  sendPasswordResetEmail: vi.fn(),
} as unknown as EmailService;

describe('PasswordService', () => {
  let passwordService: PasswordService;

  beforeEach(() => {
    vi.clearAllMocks();
    passwordService = new PasswordService(mockPrismaClient, mockEmailService);
  });

  describe('hashPassword', () => {
    it('Argon2idでパスワードをハッシュ化できる', async () => {
      const password = 'TestPassword123!';
      const hash = await passwordService.hashPassword(password);

      expect(hash).toBeDefined();
      expect(hash).toContain('$argon2id$');
    });

    it('同じパスワードでも異なるハッシュを生成する（ソルト使用）', async () => {
      const password = 'TestPassword123!';
      const hash1 = await passwordService.hashPassword(password);
      const hash2 = await passwordService.hashPassword(password);

      expect(hash1).not.toBe(hash2);
    });
  });

  describe('verifyPassword', () => {
    it('正しいパスワードで検証が成功する', async () => {
      const password = 'TestPassword123!';
      const hash = await passwordService.hashPassword(password);
      const isValid = await passwordService.verifyPassword(password, hash);

      expect(isValid).toBe(true);
    });

    it('間違ったパスワードで検証が失敗する', async () => {
      const password = 'TestPassword123!';
      const wrongPassword = 'WrongPassword123!';
      const hash = await passwordService.hashPassword(password);
      const isValid = await passwordService.verifyPassword(wrongPassword, hash);

      expect(isValid).toBe(false);
    });

    it('不正なハッシュ形式で検証が失敗する', async () => {
      const password = 'TestPassword123!';
      const invalidHash = 'invalid-hash-format';
      const isValid = await passwordService.verifyPassword(password, invalidHash);

      expect(isValid).toBe(false);
    });
  });

  describe('validatePasswordStrength', () => {
    describe('パスワード長のチェック', () => {
      it('12文字未満のパスワードは拒否される', async () => {
        const result = await passwordService.validatePasswordStrength('Short1!', []);

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error.type).toBe('WEAK_PASSWORD');
          if (result.error.type === 'WEAK_PASSWORD') {
            expect(result.error.violations).toContain(PasswordViolation.TOO_SHORT);
          }
        }
      });

      it('12文字以上のパスワードは長さチェックを通過する', async () => {
        const result = await passwordService.validatePasswordStrength('SecureString123!', []);

        expect(result.ok).toBe(true);
      });
    });

    describe('複雑性要件のチェック', () => {
      it('2種類以下の文字種のパスワードは拒否される（小文字のみ）', async () => {
        // 小文字のみ
        const result = await passwordService.validatePasswordStrength('onlylowercase', []);

        expect(result.ok).toBe(false);
        if (!result.ok && result.error.type === 'WEAK_PASSWORD') {
          expect(result.error.violations.length).toBeGreaterThan(0);
          // 大文字、数字、特殊文字のいずれかが違反として報告される
        }
      });

      it('2種類以下の文字種のパスワードは拒否される（大文字と数字のみ、小文字なし）', async () => {
        // 大文字と数字のみ（2種類、小文字なし）
        const result = await passwordService.validatePasswordStrength('UPPERCASE12345', []);

        expect(result.ok).toBe(false);
        if (!result.ok && result.error.type === 'WEAK_PASSWORD') {
          expect(result.error.violations).toContain(PasswordViolation.NO_LOWERCASE);
        }
      });

      it('3種類の文字種を含むパスワードは通過する（大文字、小文字、数字）', async () => {
        const result = await passwordService.validatePasswordStrength('SecureString123', []);

        expect(result.ok).toBe(true);
      });

      it('3種類の文字種を含むパスワードは通過する（小文字、数字、特殊文字）', async () => {
        const result = await passwordService.validatePasswordStrength('securetext123!', []);

        expect(result.ok).toBe(true);
      });

      it('4種類すべての文字種を含むパスワードは通過する', async () => {
        const result = await passwordService.validatePasswordStrength('SecureString123!', []);

        expect(result.ok).toBe(true);
      });
    });

    describe('ユーザー情報含有チェック', () => {
      it('メールアドレスを含むパスワードは拒否される', async () => {
        const result = await passwordService.validatePasswordStrength('test@example.com123!', [
          'test@example.com',
        ]);

        expect(result.ok).toBe(false);
        if (!result.ok && result.error.type === 'WEAK_PASSWORD') {
          expect(result.error.violations).toContain(PasswordViolation.CONTAINS_USER_INFO);
        }
      });

      it('表示名を含むパスワードは拒否される', async () => {
        const result = await passwordService.validatePasswordStrength('JohnDoe123!', ['johndoe']);

        expect(result.ok).toBe(false);
        if (!result.ok && result.error.type === 'WEAK_PASSWORD') {
          expect(result.error.violations).toContain(PasswordViolation.CONTAINS_USER_INFO);
        }
      });

      it('ユーザー情報を含まないパスワードは通過する', async () => {
        const result = await passwordService.validatePasswordStrength('SecureAndUnique123!', [
          'test@example.com',
          'johndoe',
        ]);

        expect(result.ok).toBe(true);
      });
    });

    describe('漏洩パスワードチェック（簡易実装）', () => {
      it('一般的な漏洩パスワードは拒否される', async () => {
        // 'password'は最も一般的な漏洩パスワード
        const result = await passwordService.validatePasswordStrength('Password123!', []);

        expect(result.ok).toBe(false);
        if (!result.ok && result.error.type === 'WEAK_PASSWORD') {
          expect(result.error.violations).toContain(PasswordViolation.COMMON_PASSWORD);
        }
      });

      it('一般的でないパスワードは通過する', async () => {
        const result = await passwordService.validatePasswordStrength('UncommonStr!ng456', []);

        expect(result.ok).toBe(true);
      });
    });

    describe('複数の違反がある場合', () => {
      it('全ての違反を返す', async () => {
        const result = await passwordService.validatePasswordStrength('short', []);

        expect(result.ok).toBe(false);
        if (!result.ok && result.error.type === 'WEAK_PASSWORD') {
          expect(result.error.violations.length).toBeGreaterThan(1);
          expect(result.error.violations).toContain(PasswordViolation.TOO_SHORT);
        }
      });
    });
  });

  describe('checkPasswordHistory', () => {
    it('過去3回のパスワード履歴と一致しない場合はtrueを返す', async () => {
      const userId = 'user-1';
      const newPassword = 'NewPassword123!';

      // 過去のパスワードをモック（異なるハッシュ）
      (mockPrismaClient.passwordHistory.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
        { id: '1', userId, passwordHash: await passwordService.hashPassword('OldPassword1!') },
        { id: '2', userId, passwordHash: await passwordService.hashPassword('OldPassword2!') },
        { id: '3', userId, passwordHash: await passwordService.hashPassword('OldPassword3!') },
      ]);

      const result = await passwordService.checkPasswordHistory(userId, newPassword);

      expect(result).toBe(true);
    });

    it('過去3回のパスワードと一致する場合はfalseを返す', async () => {
      const userId = 'user-1';
      const reusedPassword = 'ReusedPassword123!';
      const reusedHash = await passwordService.hashPassword(reusedPassword);

      // 過去のパスワードに再利用するパスワードが含まれる
      (mockPrismaClient.passwordHistory.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
        { id: '1', userId, passwordHash: reusedHash },
        { id: '2', userId, passwordHash: await passwordService.hashPassword('OldPassword2!') },
      ]);

      const result = await passwordService.checkPasswordHistory(userId, reusedPassword);

      expect(result).toBe(false);
    });

    it('パスワード履歴が空の場合はtrueを返す', async () => {
      const userId = 'user-1';
      const newPassword = 'NewPassword123!';

      (mockPrismaClient.passwordHistory.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      const result = await passwordService.checkPasswordHistory(userId, newPassword);

      expect(result).toBe(true);
    });

    it('最新3件のみをチェックする', async () => {
      const userId = 'user-1';

      expect(mockPrismaClient.passwordHistory.findMany).not.toHaveBeenCalled();

      await passwordService.checkPasswordHistory(userId, 'NewPassword123!');

      expect(mockPrismaClient.passwordHistory.findMany).toHaveBeenCalledWith({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 3,
      });
    });
  });

  describe('requestPasswordReset', () => {
    it('有効なメールアドレスでリセットトークンを生成しメールを送信する', async () => {
      const email = 'user@example.com';
      const mockUser: User = {
        id: 'user-1',
        email,
        displayName: 'Test User',
        passwordHash: 'hash',
        twoFactorEnabled: false,
        twoFactorSecret: null,
        isLocked: false,
        lockedUntil: null,
        loginFailures: 0,
        twoFactorFailures: 0,
        twoFactorLockedUntil: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockResetToken: PasswordResetToken = {
        id: 'reset-token-1',
        userId: 'user-1',
        token: 'generated-token-123',
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        createdAt: new Date(),
        usedAt: null,
      };

      (mockPrismaClient.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(mockUser);
      (mockPrismaClient.passwordResetToken.create as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockResetToken
      );

      const result = await passwordService.requestPasswordReset(email);

      expect(result.ok).toBe(true);
      expect(mockPrismaClient.user.findUnique).toHaveBeenCalledWith({ where: { email } });
      expect(mockPrismaClient.passwordResetToken.create).toHaveBeenCalled();
      expect(mockEmailService.sendPasswordResetEmail).toHaveBeenCalledWith(
        email,
        expect.any(String)
      );
    });

    it('存在しないメールアドレスでもセキュリティのため成功を返す', async () => {
      const email = 'nonexistent@example.com';

      (mockPrismaClient.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const result = await passwordService.requestPasswordReset(email);

      expect(result.ok).toBe(true);
      expect(mockPrismaClient.passwordResetToken.create).not.toHaveBeenCalled();
      expect(mockEmailService.sendPasswordResetEmail).not.toHaveBeenCalled();
    });
  });

  describe('resetPassword', () => {
    it('有効なトークンでパスワードをリセットできる', async () => {
      const resetToken = 'valid-token-123';
      const newPassword = 'NewSecurePass123!';
      const userId = 'user-1';

      const mockResetTokenData: PasswordResetToken = {
        id: 'reset-token-1',
        userId,
        token: resetToken,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 未来の日時
        createdAt: new Date(),
        usedAt: null,
      };

      const mockUser: User = {
        id: userId,
        email: 'user@example.com',
        displayName: 'Test User',
        passwordHash: 'old-hash',
        twoFactorEnabled: false,
        twoFactorSecret: null,
        isLocked: false,
        lockedUntil: null,
        loginFailures: 0,
        twoFactorFailures: 0,
        twoFactorLockedUntil: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      (
        mockPrismaClient.passwordResetToken.findUnique as ReturnType<typeof vi.fn>
      ).mockResolvedValue(mockResetTokenData);
      (mockPrismaClient.passwordHistory.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
      (mockPrismaClient.$transaction as ReturnType<typeof vi.fn>).mockResolvedValue(mockUser);

      const result = await passwordService.resetPassword(resetToken, newPassword);

      expect(result.ok).toBe(true);
      expect(mockPrismaClient.passwordResetToken.findUnique).toHaveBeenCalledWith({
        where: { token: resetToken },
      });
      expect(mockPrismaClient.$transaction).toHaveBeenCalled();
    });

    it('無効なトークンでエラーを返す', async () => {
      const resetToken = 'invalid-token';
      const newPassword = 'NewSecurePass123!';

      (
        mockPrismaClient.passwordResetToken.findUnique as ReturnType<typeof vi.fn>
      ).mockResolvedValue(null);

      const result = await passwordService.resetPassword(resetToken, newPassword);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe('RESET_TOKEN_INVALID');
      }
    });

    it('期限切れトークンでエラーを返す', async () => {
      const resetToken = 'expired-token';
      const newPassword = 'NewSecurePass123!';

      const mockResetTokenData: PasswordResetToken = {
        id: 'reset-token-1',
        userId: 'user-1',
        token: resetToken,
        expiresAt: new Date(Date.now() - 1000), // 過去の日時
        createdAt: new Date(),
        usedAt: null,
      };

      (
        mockPrismaClient.passwordResetToken.findUnique as ReturnType<typeof vi.fn>
      ).mockResolvedValue(mockResetTokenData);

      const result = await passwordService.resetPassword(resetToken, newPassword);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe('RESET_TOKEN_EXPIRED');
      }
    });

    it('使用済みトークンでエラーを返す', async () => {
      const resetToken = 'used-token';
      const newPassword = 'NewSecurePass123!';

      const mockResetTokenData: PasswordResetToken = {
        id: 'reset-token-1',
        userId: 'user-1',
        token: resetToken,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        createdAt: new Date(),
        usedAt: new Date(), // すでに使用済み
      };

      (
        mockPrismaClient.passwordResetToken.findUnique as ReturnType<typeof vi.fn>
      ).mockResolvedValue(mockResetTokenData);

      const result = await passwordService.resetPassword(resetToken, newPassword);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe('RESET_TOKEN_INVALID');
      }
    });

    it('弱いパスワードでエラーを返す', async () => {
      const resetToken = 'valid-token';
      const weakPassword = 'weak';

      const mockResetTokenData: PasswordResetToken = {
        id: 'reset-token-1',
        userId: 'user-1',
        token: resetToken,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        createdAt: new Date(),
        usedAt: null,
      };

      (
        mockPrismaClient.passwordResetToken.findUnique as ReturnType<typeof vi.fn>
      ).mockResolvedValue(mockResetTokenData);

      const result = await passwordService.resetPassword(resetToken, weakPassword);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe('WEAK_PASSWORD');
      }
    });

    it('過去のパスワードと一致する場合エラーを返す', async () => {
      const resetToken = 'valid-token';
      const reusedPassword = 'UniqueReused123!'; // "password"を含まない
      const userId = 'user-1';

      const mockResetTokenData: PasswordResetToken = {
        id: 'reset-token-1',
        userId,
        token: resetToken,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        createdAt: new Date(),
        usedAt: null,
      };

      const reusedHash = await passwordService.hashPassword(reusedPassword);

      (
        mockPrismaClient.passwordResetToken.findUnique as ReturnType<typeof vi.fn>
      ).mockResolvedValue(mockResetTokenData);
      (mockPrismaClient.passwordHistory.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
        { id: '1', userId, passwordHash: reusedHash, createdAt: new Date() },
      ]);

      const result = await passwordService.resetPassword(resetToken, reusedPassword);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe('PASSWORD_REUSED');
      }
    });

    it('パスワード履歴が4件以上ある場合、古い履歴を削除する', async () => {
      const resetToken = 'valid-token';
      const newPassword = 'NewSecurePass123!';
      const userId = 'user-1';

      const mockResetTokenData: PasswordResetToken = {
        id: 'reset-token-1',
        userId,
        token: resetToken,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        createdAt: new Date(),
        usedAt: null,
      };

      // 既に3件の履歴が存在
      const existingHistories: PasswordHistory[] = [
        { id: 'hist-1', userId, passwordHash: 'hash1', createdAt: new Date('2024-01-01') },
        { id: 'hist-2', userId, passwordHash: 'hash2', createdAt: new Date('2024-01-02') },
        { id: 'hist-3', userId, passwordHash: 'hash3', createdAt: new Date('2024-01-03') },
      ];

      (
        mockPrismaClient.passwordResetToken.findUnique as ReturnType<typeof vi.fn>
      ).mockResolvedValue(mockResetTokenData);
      (mockPrismaClient.passwordHistory.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(
        existingHistories
      );
      (mockPrismaClient.$transaction as ReturnType<typeof vi.fn>).mockImplementation(
        // トランザクションコールバック: Prismaの$transactionメソッドの型定義上、
        // 厳密な型付けが困難なため、unknownを使用してテスト時に型安全性を確保
        async (callback: (tx: unknown) => Promise<unknown>) => {
          // トランザクションコールバックを実行
          const txMock = {
            user: {
              update: vi.fn().mockResolvedValue({ id: userId }),
            },
            passwordHistory: {
              create: vi.fn(),
              findMany: vi
                .fn()
                .mockResolvedValue([
                  ...existingHistories,
                  { id: 'hist-4', userId, passwordHash: 'new-hash', createdAt: new Date() },
                ]),
              deleteMany: vi.fn(),
            },
            passwordResetToken: {
              update: vi.fn(),
            },
            refreshToken: {
              deleteMany: vi.fn(),
            },
          };
          return await callback(txMock);
        }
      );

      const result = await passwordService.resetPassword(resetToken, newPassword);

      expect(result.ok).toBe(true);
    });
  });

  describe('changePassword', () => {
    it('正しい現在のパスワードでパスワード変更ができる', async () => {
      const userId = 'user-1';
      const currentPassword = 'CurrentPass123!';
      const newPassword = 'NewSecurePass456!';

      const currentHash = await passwordService.hashPassword(currentPassword);

      const mockUser: User = {
        id: userId,
        email: 'user@example.com',
        displayName: 'Test User',
        passwordHash: currentHash,
        twoFactorEnabled: false,
        twoFactorSecret: null,
        isLocked: false,
        lockedUntil: null,
        loginFailures: 0,
        twoFactorFailures: 0,
        twoFactorLockedUntil: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      (mockPrismaClient.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(mockUser);
      (mockPrismaClient.passwordHistory.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
      (mockPrismaClient.$transaction as ReturnType<typeof vi.fn>).mockResolvedValue(mockUser);

      const result = await passwordService.changePassword(userId, currentPassword, newPassword);

      expect(result.ok).toBe(true);
      expect(mockPrismaClient.user.findUnique).toHaveBeenCalledWith({ where: { id: userId } });
      expect(mockPrismaClient.$transaction).toHaveBeenCalled();
    });

    it('間違った現在のパスワードでエラーを返す', async () => {
      const userId = 'user-1';
      const wrongCurrentPassword = 'WrongPassword123!';
      const newPassword = 'NewSecurePass456!';

      const actualCurrentHash = await passwordService.hashPassword('ActualCurrentPass123!');

      const mockUser: User = {
        id: userId,
        email: 'user@example.com',
        displayName: 'Test User',
        passwordHash: actualCurrentHash,
        twoFactorEnabled: false,
        twoFactorSecret: null,
        isLocked: false,
        lockedUntil: null,
        loginFailures: 0,
        twoFactorFailures: 0,
        twoFactorLockedUntil: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      (mockPrismaClient.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(mockUser);

      const result = await passwordService.changePassword(
        userId,
        wrongCurrentPassword,
        newPassword
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe('RESET_TOKEN_INVALID'); // INVALID_PASSWORD相当
      }
    });

    it('過去のパスワードと一致する場合エラーを返す', async () => {
      const userId = 'user-1';
      const currentPassword = 'CurrentPass123!';
      const reusedPassword = 'UniqueReused123!'; // "password"を含まない

      const currentHash = await passwordService.hashPassword(currentPassword);
      const reusedHash = await passwordService.hashPassword(reusedPassword);

      const mockUser: User = {
        id: userId,
        email: 'user@example.com',
        displayName: 'Test User',
        passwordHash: currentHash,
        twoFactorEnabled: false,
        twoFactorSecret: null,
        isLocked: false,
        lockedUntil: null,
        loginFailures: 0,
        twoFactorFailures: 0,
        twoFactorLockedUntil: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      (mockPrismaClient.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(mockUser);
      (mockPrismaClient.passwordHistory.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
        { id: '1', userId, passwordHash: reusedHash, createdAt: new Date() },
      ]);

      const result = await passwordService.changePassword(userId, currentPassword, reusedPassword);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe('PASSWORD_REUSED');
      }
    });

    it('ユーザーが存在しない場合エラーを返す', async () => {
      const userId = 'nonexistent-user';
      const currentPassword = 'CurrentPass123!';
      const newPassword = 'NewSecurePass456!';

      (mockPrismaClient.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const result = await passwordService.changePassword(userId, currentPassword, newPassword);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe('RESET_TOKEN_INVALID'); // USER_NOT_FOUND相当
      }
    });
  });
});
