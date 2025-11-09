import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PasswordService } from '../../../services/password.service';
import { PasswordViolation } from '../../../types/password.types';
import type { PrismaClient } from '@prisma/client';

// Prisma Clientのモック
const mockPrismaClient = {
  passwordHistory: {
    findMany: vi.fn(),
    create: vi.fn(),
    deleteMany: vi.fn(),
  },
} as unknown as PrismaClient;

describe('PasswordService', () => {
  let passwordService: PasswordService;

  beforeEach(() => {
    vi.clearAllMocks();
    passwordService = new PasswordService(mockPrismaClient);
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
});
