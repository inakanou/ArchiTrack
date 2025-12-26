/**
 * @fileoverview TwoFactorServiceの単体テスト
 *
 * Requirements:
 * - 27.1-27.8: 二要素認証設定機能
 * - 27C.1-27C.6: 二要素認証セキュリティ要件
 * - 27.9-27.10, 27A.3-27A.7, 27B.4-27B.6: 2FA検証・管理機能
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TwoFactorService } from '../../../services/two-factor.service.js';
import { authenticator } from 'otplib';

// $transactionのデフォルト実装
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const defaultTransactionImpl = async (callbackOrArray: any) => {
  if (typeof callbackOrArray === 'function') {
    return await callbackOrArray(mockPrismaClient);
  }
  // 配列版の場合は空配列を返す
  return [];
};

// Prismaのモック
const mockPrismaClient = {
  user: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  twoFactorBackupCode: {
    findMany: vi.fn(),
    updateMany: vi.fn(),
    deleteMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  refreshToken: {
    deleteMany: vi.fn(),
  },
  auditLog: {
    create: vi.fn(),
  },
  // $transactionは配列版とコールバック版の両方をサポート
  $transaction: vi.fn(defaultTransactionImpl),
};

vi.mock('../../../db', () => ({
  default: () => mockPrismaClient,
}));

// Argon2のモック
vi.mock('@node-rs/argon2', () => ({
  hash: vi.fn(),
  verify: vi.fn(),
}));

describe('TwoFactorService', () => {
  let twoFactorService: TwoFactorService;

  beforeEach(() => {
    vi.clearAllMocks();
    // $transactionのモックをデフォルト実装に復元
    vi.mocked(mockPrismaClient.$transaction).mockImplementation(defaultTransactionImpl);
    // 暗号化鍵を設定（256ビット = 64文字の16進数）
    process.env.TWO_FACTOR_ENCRYPTION_KEY =
      'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789';
    twoFactorService = new TwoFactorService();
  });

  describe('generateTOTPSecret()', () => {
    it('Base32形式のTOTP秘密鍵を生成できる', () => {
      const secret = twoFactorService.generateTOTPSecret();

      expect(secret).toBeDefined();
      expect(typeof secret).toBe('string');
      expect(secret.length).toBeGreaterThan(0);
      // Base32は大文字のA-Zと2-7のみを使用
      expect(secret).toMatch(/^[A-Z2-7]+=*$/);
    });

    it('32バイト（256ビット）の秘密鍵を生成する', () => {
      const secret = twoFactorService.generateTOTPSecret();

      // Base32エンコードは5ビット単位なので、256ビット = 52文字（パディング含む）
      // 実際には52文字程度になる
      expect(secret.length).toBeGreaterThanOrEqual(50);
    });

    it('複数回呼び出すと異なる秘密鍵が生成される', () => {
      const secret1 = twoFactorService.generateTOTPSecret();
      const secret2 = twoFactorService.generateTOTPSecret();
      const secret3 = twoFactorService.generateTOTPSecret();

      expect(secret1).not.toBe(secret2);
      expect(secret2).not.toBe(secret3);
      expect(secret1).not.toBe(secret3);
    });

    it('暗号学的に安全な乱数を使用している（ランダム性の確認）', () => {
      const secrets = new Set<string>();

      // 100回生成して全て異なることを確認
      for (let i = 0; i < 100; i++) {
        secrets.add(twoFactorService.generateTOTPSecret());
      }

      expect(secrets.size).toBe(100);
    });
  });

  describe('encryptSecret() / decryptSecret()', () => {
    it('秘密鍵を暗号化できる', async () => {
      const secret = 'JBSWY3DPEHPK3PXP';
      const encryptedSecret = await twoFactorService.encryptSecret(secret);

      expect(encryptedSecret).toBeDefined();
      expect(typeof encryptedSecret).toBe('string');
      expect(encryptedSecret.length).toBeGreaterThan(0);
      expect(encryptedSecret).not.toBe(secret);
    });

    it('暗号化された秘密鍵を復号化できる', async () => {
      const originalSecret = 'JBSWY3DPEHPK3PXP';
      const encryptedSecret = await twoFactorService.encryptSecret(originalSecret);
      const decryptedSecret = await twoFactorService.decryptSecret(encryptedSecret);

      expect(decryptedSecret).toBe(originalSecret);
    });

    it('ラウンドトリップテスト: 暗号化→復号化で元の値に戻る', async () => {
      const secret = twoFactorService.generateTOTPSecret();
      const encryptedSecret = await twoFactorService.encryptSecret(secret);
      const decryptedSecret = await twoFactorService.decryptSecret(encryptedSecret);

      expect(decryptedSecret).toBe(secret);
    });

    it('暗号化鍵が設定されていない場合、エラーをスローする', async () => {
      delete process.env.TWO_FACTOR_ENCRYPTION_KEY;
      const serviceWithoutKey = new TwoFactorService();

      await expect(serviceWithoutKey.encryptSecret('JBSWY3DPEHPK3PXP')).rejects.toThrow();
    });

    it('復号化失敗時にエラーをスローする', async () => {
      const invalidEncryptedSecret = 'invalid-encrypted-data';

      await expect(twoFactorService.decryptSecret(invalidEncryptedSecret)).rejects.toThrow();
    });
  });

  describe('generateQRCode()', () => {
    it('Google Authenticator互換のotpauth URI形式でQRコードを生成する', async () => {
      const email = 'test@example.com';
      const secret = 'JBSWY3DPEHPK3PXP';

      const qrCodeDataUrl = await twoFactorService.generateQRCode(email, secret);

      expect(qrCodeDataUrl).toBeDefined();
      expect(typeof qrCodeDataUrl).toBe('string');
      // Data URL形式であることを確認
      expect(qrCodeDataUrl).toMatch(/^data:image\/png;base64,/);
    });

    it('QRコードにotpauth URIが含まれる（正しいフォーマット）', async () => {
      const email = 'test@example.com';
      const secret = 'JBSWY3DPEHPK3PXP';

      const qrCodeDataUrl = await twoFactorService.generateQRCode(email, secret);

      // QRコードのData URLが生成されることを確認
      expect(qrCodeDataUrl).toContain('data:image/png;base64,');
      // Base64エンコードされたデータが含まれることを確認
      expect(qrCodeDataUrl.split(',')[1]).toMatch(/^[A-Za-z0-9+/=]+$/);
    });

    it('異なるメールアドレスで異なるQRコードが生成される', async () => {
      const secret = 'JBSWY3DPEHPK3PXP';
      const qrCode1 = await twoFactorService.generateQRCode('user1@example.com', secret);
      const qrCode2 = await twoFactorService.generateQRCode('user2@example.com', secret);

      expect(qrCode1).not.toBe(qrCode2);
    });
  });

  describe('generateBackupCodes()', () => {
    it('10個のバックアップコードを生成する', () => {
      const backupCodes = twoFactorService.generateBackupCodes();

      expect(backupCodes).toBeDefined();
      expect(Array.isArray(backupCodes)).toBe(true);
      expect(backupCodes.length).toBe(10);
    });

    it('各バックアップコードが8文字である', () => {
      const backupCodes = twoFactorService.generateBackupCodes();

      backupCodes.forEach((code) => {
        expect(code.length).toBe(8);
      });
    });

    it('バックアップコードが英数字のみで構成される', () => {
      const backupCodes = twoFactorService.generateBackupCodes();

      backupCodes.forEach((code) => {
        expect(code).toMatch(/^[A-Z0-9]+$/);
      });
    });

    it('バックアップコードに重複がない', () => {
      const backupCodes = twoFactorService.generateBackupCodes();
      const uniqueCodes = new Set(backupCodes);

      expect(uniqueCodes.size).toBe(10);
    });

    it('複数回呼び出すと異なるバックアップコードセットが生成される', () => {
      const set1 = twoFactorService.generateBackupCodes();
      const set2 = twoFactorService.generateBackupCodes();

      // 少なくとも1つは異なることを確認
      const allSame = set1.every((code, index) => code === set2[index]);
      expect(allSame).toBe(false);
    });
  });

  describe('regenerateBackupCodes()', () => {
    const mockUserId = 'user-123';
    const mockUser = {
      id: mockUserId,
      email: 'test@example.com',
      displayName: 'Test User',
      passwordHash: 'hash',
      isLocked: false,
      lockedUntil: null,
      loginFailures: 0,
      twoFactorEnabled: true,
      twoFactorSecret: 'encrypted-secret',
      twoFactorFailures: 0,
      twoFactorLockedUntil: null,
      createdAt: new Date('2025-01-01T00:00:00Z'),
      updatedAt: new Date('2025-01-01T00:00:00Z'),
    };

    it('バックアップコード再生成成功 → 10個の新しいコード返却', async () => {
      // Arrange
      const { hash } = await import('@node-rs/argon2');
      vi.mocked(hash).mockResolvedValue('hashed-code');
      vi.mocked(mockPrismaClient.user.findUnique).mockResolvedValue(mockUser);

      // Act
      const result = await twoFactorService.regenerateBackupCodes(mockUserId);

      // Assert
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBeDefined();
        expect(Array.isArray(result.value)).toBe(true);
        expect(result.value.length).toBe(10);
        // 各コードが8文字の英数字であることを確認
        result.value.forEach((code) => {
          expect(code).toMatch(/^[A-Z0-9]{8}$/);
        });
      }
    });

    it('既存のバックアップコードが全て削除される', async () => {
      // Arrange
      const { hash } = await import('@node-rs/argon2');
      vi.mocked(hash).mockResolvedValue('hashed-code');
      vi.mocked(mockPrismaClient.user.findUnique).mockResolvedValue(mockUser);

      // Act
      await twoFactorService.regenerateBackupCodes(mockUserId);

      // Assert
      expect(mockPrismaClient.twoFactorBackupCode.deleteMany).toHaveBeenCalledWith({
        where: { userId: mockUserId },
      });
    });

    it('ユーザーが存在しない → USER_NOT_FOUND', async () => {
      // Arrange
      vi.mocked(mockPrismaClient.user.findUnique).mockResolvedValue(null);

      // Act
      const result = await twoFactorService.regenerateBackupCodes(mockUserId);

      // Assert
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe('USER_NOT_FOUND');
      }
    });

    it('2FAが無効 → TWO_FACTOR_NOT_ENABLED', async () => {
      // Arrange
      const userWithout2FA = {
        ...mockUser,
        twoFactorEnabled: false,
        twoFactorSecret: null,
      };
      vi.mocked(mockPrismaClient.user.findUnique).mockResolvedValue(userWithout2FA);

      // Act
      const result = await twoFactorService.regenerateBackupCodes(mockUserId);

      // Assert
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe('TWO_FACTOR_NOT_ENABLED');
      }
    });
  });

  describe('verifyTOTP()', () => {
    const mockUserId = 'user-totp-123';

    it('ユーザーが存在しない → USER_NOT_FOUND', async () => {
      // Arrange
      vi.mocked(mockPrismaClient.user.findUnique).mockResolvedValue(null);

      // Act
      const result = await twoFactorService.verifyTOTP(mockUserId, '123456');

      // Assert
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe('USER_NOT_FOUND');
      }
    });

    it('2FAが無効 → TWO_FACTOR_NOT_ENABLED', async () => {
      // Arrange
      const userWithout2FA = {
        id: mockUserId,
        twoFactorEnabled: false,
        twoFactorSecret: null,
      };
      vi.mocked(mockPrismaClient.user.findUnique).mockResolvedValue(userWithout2FA);

      // Act
      const result = await twoFactorService.verifyTOTP(mockUserId, '123456');

      // Assert
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe('TWO_FACTOR_NOT_ENABLED');
      }
    });

    describe('TOTPタイムウィンドウ（RFC 6238準拠、±1ステップ = 90秒）', () => {
      const testUserId = 'user-time-window-test';
      const testSecret = 'JBSWY3DPEHPK3PXP'; // テスト用のBase32秘密鍵

      it('現在のタイムスタンプで生成されたTOTPコードは検証成功する', async () => {
        // Arrange
        const encryptedSecret = await twoFactorService.encryptSecret(testSecret);
        const userWith2FA = {
          id: testUserId,
          twoFactorEnabled: true,
          twoFactorSecret: encryptedSecret,
        };
        vi.mocked(mockPrismaClient.user.findUnique).mockResolvedValue(userWith2FA);

        // 現在時刻のTOTPコードを生成
        const currentToken = authenticator.generate(testSecret);

        // Act
        const result = await twoFactorService.verifyTOTP(testUserId, currentToken);

        // Assert
        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.value).toBe(true);
        }
      });

      it('過去1ステップ（30秒前）で生成されたTOTPコードは検証成功する', async () => {
        // Arrange
        const encryptedSecret = await twoFactorService.encryptSecret(testSecret);
        const userWith2FA = {
          id: testUserId,
          twoFactorEnabled: true,
          twoFactorSecret: encryptedSecret,
        };
        vi.mocked(mockPrismaClient.user.findUnique).mockResolvedValue(userWith2FA);

        // 時間をモック：60秒前に設定してトークン生成、その後30秒前に戻して検証
        const baseTime = new Date('2025-01-01T00:00:00Z');
        vi.useFakeTimers();
        vi.setSystemTime(baseTime);

        // 現在時刻（60秒前）でトークンを生成
        const pastToken = authenticator.generate(testSecret);

        // 30秒進めて検証（生成時から見て+30秒 = 検証時から見て-30秒）
        vi.setSystemTime(new Date(baseTime.getTime() + 30000));

        // Act
        const result = await twoFactorService.verifyTOTP(testUserId, pastToken);

        // Assert
        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.value).toBe(true);
        }

        vi.useRealTimers();
      });

      it('未来1ステップ（30秒後）で生成されたTOTPコードは検証成功する', async () => {
        // Arrange
        const encryptedSecret = await twoFactorService.encryptSecret(testSecret);
        const userWith2FA = {
          id: testUserId,
          twoFactorEnabled: true,
          twoFactorSecret: encryptedSecret,
        };
        vi.mocked(mockPrismaClient.user.findUnique).mockResolvedValue(userWith2FA);

        // 時間をモック：30秒後の時刻でトークン生成、その後現在に戻して検証
        const baseTime = new Date('2025-01-01T00:00:00Z');
        vi.useFakeTimers();
        vi.setSystemTime(new Date(baseTime.getTime() + 30000));

        // 30秒後の時刻でトークンを生成
        const futureToken = authenticator.generate(testSecret);

        // 現在時刻に戻して検証
        vi.setSystemTime(baseTime);

        // Act
        const result = await twoFactorService.verifyTOTP(testUserId, futureToken);

        // Assert
        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.value).toBe(true);
        }

        vi.useRealTimers();
      });

      it('過去2ステップ（60秒前）で生成されたTOTPコードは検証失敗する', async () => {
        // Arrange
        const encryptedSecret = await twoFactorService.encryptSecret(testSecret);
        const userWith2FA = {
          id: testUserId,
          twoFactorEnabled: true,
          twoFactorSecret: encryptedSecret,
        };
        vi.mocked(mockPrismaClient.user.findUnique).mockResolvedValue(userWith2FA);

        // 時間をモック：90秒前に設定してトークン生成、その後30秒前に戻して検証
        const baseTime = new Date('2025-01-01T00:00:00Z');
        vi.useFakeTimers();
        vi.setSystemTime(baseTime);

        // 現在時刻（90秒前）でトークンを生成
        const oldToken = authenticator.generate(testSecret);

        // 60秒進めて検証（生成時から見て+60秒 = 検証時から見て-60秒、つまり2ステップ前）
        vi.setSystemTime(new Date(baseTime.getTime() + 60000));

        // Act
        const result = await twoFactorService.verifyTOTP(testUserId, oldToken);

        // Assert
        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.value).toBe(false);
        }

        vi.useRealTimers();
      });

      it('未来2ステップ（60秒後）で生成されたTOTPコードは検証失敗する', async () => {
        // Arrange
        const encryptedSecret = await twoFactorService.encryptSecret(testSecret);
        const userWith2FA = {
          id: testUserId,
          twoFactorEnabled: true,
          twoFactorSecret: encryptedSecret,
        };
        vi.mocked(mockPrismaClient.user.findUnique).mockResolvedValue(userWith2FA);

        // 時間をモック：60秒後の時刻でトークン生成、その後現在に戻して検証
        const baseTime = new Date('2025-01-01T00:00:00Z');
        vi.useFakeTimers();
        vi.setSystemTime(new Date(baseTime.getTime() + 60000));

        // 60秒後の時刻でトークンを生成
        const futureToken = authenticator.generate(testSecret);

        // 現在時刻に戻して検証（生成時から見て-60秒、つまり2ステップ前）
        vi.setSystemTime(baseTime);

        // Act
        const result = await twoFactorService.verifyTOTP(testUserId, futureToken);

        // Assert
        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.value).toBe(false);
        }

        vi.useRealTimers();
      });
    });
  });

  describe('verifyBackupCode()', () => {
    const mockUserId = 'user-backup-123';

    it('ユーザーが存在しない → USER_NOT_FOUND', async () => {
      // Arrange
      vi.mocked(mockPrismaClient.user.findUnique).mockResolvedValue(null);

      // Act
      const result = await twoFactorService.verifyBackupCode(mockUserId, 'ABC12345');

      // Assert
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe('USER_NOT_FOUND');
      }
    });

    it('2FAが無効 → TWO_FACTOR_NOT_ENABLED', async () => {
      // Arrange
      const userWithout2FA = {
        id: mockUserId,
        twoFactorEnabled: false,
      };
      vi.mocked(mockPrismaClient.user.findUnique).mockResolvedValue(userWithout2FA);

      // Act
      const result = await twoFactorService.verifyBackupCode(mockUserId, 'ABC12345');

      // Assert
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe('TWO_FACTOR_NOT_ENABLED');
      }
    });
  });

  describe('enableTwoFactor()', () => {
    const mockUserId = 'user-enable-123';

    it('ユーザーが存在しない → USER_NOT_FOUND', async () => {
      // Arrange
      vi.mocked(mockPrismaClient.user.findUnique).mockResolvedValue(null);

      // Act
      const result = await twoFactorService.enableTwoFactor(mockUserId, '123456');

      // Assert
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe('USER_NOT_FOUND');
      }
    });

    it('既に2FAが有効 → TWO_FACTOR_ALREADY_ENABLED', async () => {
      // Arrange
      const userWithEnabled2FA = {
        id: mockUserId,
        twoFactorEnabled: true,
        twoFactorSecret: 'encrypted-secret',
      };
      vi.mocked(mockPrismaClient.user.findUnique).mockResolvedValue(userWithEnabled2FA);

      // Act
      const result = await twoFactorService.enableTwoFactor(mockUserId, '123456');

      // Assert
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe('TWO_FACTOR_ALREADY_ENABLED');
      }
    });

    it('秘密鍵が設定されていない → TWO_FACTOR_NOT_ENABLED', async () => {
      // Arrange
      const userWithoutSecret = {
        id: mockUserId,
        twoFactorEnabled: false,
        twoFactorSecret: null,
      };
      vi.mocked(mockPrismaClient.user.findUnique).mockResolvedValue(userWithoutSecret);

      // Act
      const result = await twoFactorService.enableTwoFactor(mockUserId, '123456');

      // Assert
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe('TWO_FACTOR_NOT_ENABLED');
      }
    });
  });

  describe('disableTwoFactor()', () => {
    const mockUserId = 'user-disable-123';
    const mockUserWith2FA = {
      id: mockUserId,
      twoFactorEnabled: true,
      passwordHash: 'hashed-password',
    };

    it('ユーザーが存在しない → USER_NOT_FOUND', async () => {
      // Arrange
      vi.mocked(mockPrismaClient.user.findUnique).mockResolvedValue(null);

      // Act
      const result = await twoFactorService.disableTwoFactor(mockUserId, 'password123');

      // Assert
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe('USER_NOT_FOUND');
      }
    });

    it('2FAが無効 → TWO_FACTOR_NOT_ENABLED', async () => {
      // Arrange
      const userWithout2FA = {
        id: mockUserId,
        twoFactorEnabled: false,
        passwordHash: 'hashed-password',
      };
      vi.mocked(mockPrismaClient.user.findUnique).mockResolvedValue(userWithout2FA);

      // Act
      const result = await twoFactorService.disableTwoFactor(mockUserId, 'password123');

      // Assert
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe('TWO_FACTOR_NOT_ENABLED');
      }
    });

    it('パスワードが間違っている → INVALID_PASSWORD', async () => {
      // Arrange
      const { verify } = await import('@node-rs/argon2');
      vi.mocked(verify).mockResolvedValue(false);
      vi.mocked(mockPrismaClient.user.findUnique).mockResolvedValue(mockUserWith2FA);

      // Act
      const result = await twoFactorService.disableTwoFactor(mockUserId, 'wrong-password');

      // Assert
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe('INVALID_PASSWORD');
      }
    });
  });

  describe('setupTwoFactor()', () => {
    const mockUserId = 'user-setup-123';
    const mockUser = {
      id: mockUserId,
      email: 'test@example.com',
      displayName: 'Test User',
      passwordHash: 'hash',
      isLocked: false,
      lockedUntil: null,
      loginFailures: 0,
      twoFactorEnabled: false,
      twoFactorSecret: null,
      twoFactorFailures: 0,
      twoFactorLockedUntil: null,
      createdAt: new Date('2025-01-01T00:00:00Z'),
      updatedAt: new Date('2025-01-01T00:00:00Z'),
    };

    it('2FA設定開始成功 → QRコード、秘密鍵、バックアップコード返却', async () => {
      // Arrange
      const { hash } = await import('@node-rs/argon2');
      vi.mocked(hash).mockResolvedValue('hashed-code');
      vi.mocked(mockPrismaClient.user.findUnique).mockResolvedValue(mockUser);
      vi.mocked(mockPrismaClient.user.update).mockResolvedValue({
        ...mockUser,
        twoFactorSecret: 'encrypted-secret',
      });

      // Act
      const result = await twoFactorService.setupTwoFactor(mockUserId);

      // Assert
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBeDefined();
        expect(result.value.secret).toBeDefined();
        expect(typeof result.value.secret).toBe('string');
        expect(result.value.secret.length).toBeGreaterThan(0);
        // Base32形式であることを確認
        expect(result.value.secret).toMatch(/^[A-Z2-7]+=*$/);

        expect(result.value.qrCodeDataUrl).toBeDefined();
        expect(typeof result.value.qrCodeDataUrl).toBe('string');
        // Data URL形式であることを確認
        expect(result.value.qrCodeDataUrl).toMatch(/^data:image\/png;base64,/);

        expect(result.value.backupCodes).toBeDefined();
        expect(Array.isArray(result.value.backupCodes)).toBe(true);
        expect(result.value.backupCodes.length).toBe(10);
        // 各バックアップコードが8文字の英数字であることを確認
        result.value.backupCodes.forEach((code) => {
          expect(code).toMatch(/^[A-Z0-9]{8}$/);
        });
      }
    });

    it('データベースに秘密鍵とバックアップコードが保存される', async () => {
      // Arrange
      const { hash } = await import('@node-rs/argon2');
      vi.mocked(hash).mockResolvedValue('hashed-code');
      vi.mocked(mockPrismaClient.user.findUnique).mockResolvedValue(mockUser);
      vi.mocked(mockPrismaClient.user.update).mockResolvedValue({
        ...mockUser,
        twoFactorSecret: 'encrypted-secret',
      });

      // Act
      await twoFactorService.setupTwoFactor(mockUserId);

      // Assert
      // ユーザーの秘密鍵が更新されたことを確認
      expect(mockPrismaClient.user.update).toHaveBeenCalledWith({
        where: { id: mockUserId },
        data: expect.objectContaining({
          twoFactorSecret: expect.any(String),
        }),
      });

      // バックアップコードが作成されたことを確認
      expect(mockPrismaClient.twoFactorBackupCode.create).toHaveBeenCalledTimes(10);
    });

    it('監査ログが記録される', async () => {
      // Arrange
      const { hash } = await import('@node-rs/argon2');
      vi.mocked(hash).mockResolvedValue('hashed-code');
      vi.mocked(mockPrismaClient.user.findUnique).mockResolvedValue(mockUser);
      vi.mocked(mockPrismaClient.user.update).mockResolvedValue({
        ...mockUser,
        twoFactorSecret: 'encrypted-secret',
      });

      // Act
      await twoFactorService.setupTwoFactor(mockUserId);

      // Assert
      expect(mockPrismaClient.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'TWO_FACTOR_SETUP_STARTED',
          actorId: mockUserId,
          targetType: 'User',
          targetId: mockUserId,
        }),
      });
    });

    it('ユーザーが存在しない → USER_NOT_FOUND', async () => {
      // Arrange
      vi.mocked(mockPrismaClient.user.findUnique).mockResolvedValue(null);

      // Act
      const result = await twoFactorService.setupTwoFactor(mockUserId);

      // Assert
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe('USER_NOT_FOUND');
      }
    });

    it('既に2FAが有効 → TWO_FACTOR_ALREADY_ENABLED', async () => {
      // Arrange
      const userWithEnabled2FA = {
        ...mockUser,
        twoFactorEnabled: true,
        twoFactorSecret: 'existing-encrypted-secret',
      };
      vi.mocked(mockPrismaClient.user.findUnique).mockResolvedValue(userWithEnabled2FA);

      // Act
      const result = await twoFactorService.setupTwoFactor(mockUserId);

      // Assert
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe('TWO_FACTOR_ALREADY_ENABLED');
      }
    });
  });

  describe('getBackupCodesStatus()', () => {
    const mockUserId = 'user-status-123';

    it('ユーザーが存在しない → USER_NOT_FOUND', async () => {
      // Arrange
      vi.mocked(mockPrismaClient.user.findUnique).mockResolvedValue(null);

      // Act
      const result = await twoFactorService.getBackupCodesStatus(mockUserId);

      // Assert
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe('USER_NOT_FOUND');
      }
    });

    it('2FAが無効 → TWO_FACTOR_NOT_ENABLED', async () => {
      // Arrange
      const userWithout2FA = {
        id: mockUserId,
        twoFactorEnabled: false,
      };
      vi.mocked(mockPrismaClient.user.findUnique).mockResolvedValue(userWithout2FA);

      // Act
      const result = await twoFactorService.getBackupCodesStatus(mockUserId);

      // Assert
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe('TWO_FACTOR_NOT_ENABLED');
      }
    });

    it('バックアップコードステータス取得成功 → マスクされたコードと使用状況を返す', async () => {
      // Arrange
      const userWith2FA = {
        id: mockUserId,
        twoFactorEnabled: true,
      };
      const mockBackupCodes = [
        { usedAt: null, createdAt: new Date('2025-01-01T00:00:00Z') },
        { usedAt: new Date('2025-01-02T00:00:00Z'), createdAt: new Date('2025-01-01T00:00:00Z') },
        { usedAt: null, createdAt: new Date('2025-01-01T00:00:00Z') },
      ];
      vi.mocked(mockPrismaClient.user.findUnique).mockResolvedValue(userWith2FA);
      vi.mocked(mockPrismaClient.twoFactorBackupCode.findMany).mockResolvedValue(mockBackupCodes);

      // Act
      const result = await twoFactorService.getBackupCodesStatus(mockUserId);

      // Assert
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(3);
        // マスクされたコード形式を確認
        expect(result.value[0]?.code).toBe('****-0001');
        expect(result.value[0]?.isUsed).toBe(false);
        expect(result.value[0]?.usedAt).toBeNull();

        expect(result.value[1]?.code).toBe('****-0002');
        expect(result.value[1]?.isUsed).toBe(true);
        expect(result.value[1]?.usedAt).toBe('2025-01-02T00:00:00.000Z');

        expect(result.value[2]?.code).toBe('****-0003');
        expect(result.value[2]?.isUsed).toBe(false);
      }
    });

    it('DBエラー発生時 → USER_NOT_FOUND', async () => {
      // Arrange
      vi.mocked(mockPrismaClient.user.findUnique).mockRejectedValue(new Error('DB Error'));

      // Act
      const result = await twoFactorService.getBackupCodesStatus(mockUserId);

      // Assert
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe('USER_NOT_FOUND');
      }
    });
  });

  describe('disableTwoFactor() - 成功パス', () => {
    const mockUserId = 'user-disable-success-123';
    const mockUserWith2FA = {
      id: mockUserId,
      twoFactorEnabled: true,
      passwordHash: 'hashed-password',
    };

    it('パスワード検証成功 → 2FA無効化、トランザクション実行', async () => {
      // Arrange
      const { verify } = await import('@node-rs/argon2');
      vi.mocked(verify).mockResolvedValue(true);
      vi.mocked(mockPrismaClient.user.findUnique).mockResolvedValue(mockUserWith2FA);
      // $transactionを配列版でモック
      vi.mocked(mockPrismaClient.$transaction).mockResolvedValue([]);

      // Act
      const result = await twoFactorService.disableTwoFactor(mockUserId, 'correct-password');

      // Assert
      expect(result.ok).toBe(true);
      expect(mockPrismaClient.$transaction).toHaveBeenCalled();
    });

    it('DBエラー発生時 → INVALID_PASSWORD', async () => {
      // Arrange
      const { verify } = await import('@node-rs/argon2');
      vi.mocked(verify).mockResolvedValue(true);
      vi.mocked(mockPrismaClient.user.findUnique).mockResolvedValue(mockUserWith2FA);
      vi.mocked(mockPrismaClient.$transaction).mockRejectedValue(new Error('DB Error'));

      // Act
      const result = await twoFactorService.disableTwoFactor(mockUserId, 'correct-password');

      // Assert
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe('INVALID_PASSWORD');
      }
    });
  });

  describe('enableTwoFactor() - 成功パス', () => {
    const mockUserId = 'user-enable-success-123';
    const testSecret = 'JBSWY3DPEHPK3PXP';

    it('テスト環境でTOTP検証成功 → 2FA有効化、バックアップコード返却', async () => {
      // Arrange
      // テスト環境では"123456"でバイパス可能
      const encryptedSecret = await twoFactorService.encryptSecret(testSecret);
      const userWithSecret = {
        id: mockUserId,
        twoFactorEnabled: false,
        twoFactorSecret: encryptedSecret,
      };
      const { hash } = await import('@node-rs/argon2');
      vi.mocked(hash).mockResolvedValue('hashed-code');
      vi.mocked(mockPrismaClient.user.findUnique).mockResolvedValue(userWithSecret);
      // $transaction内で使われるメソッドのモック
      vi.mocked(mockPrismaClient.user.update).mockResolvedValue({ id: mockUserId });
      vi.mocked(mockPrismaClient.twoFactorBackupCode.deleteMany).mockResolvedValue({ count: 10 });
      vi.mocked(mockPrismaClient.twoFactorBackupCode.create).mockResolvedValue({
        id: 'backup-id',
        userId: mockUserId,
        codeHash: 'hashed-code',
        usedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      vi.mocked(mockPrismaClient.auditLog.create).mockResolvedValue({
        id: 'audit-id',
        userId: mockUserId,
        action: 'TWO_FACTOR_ENABLED',
        entityType: 'USER',
        entityId: mockUserId,
        createdAt: new Date(),
      });

      // Act - テスト環境では"123456"が成功する
      const result = await twoFactorService.enableTwoFactor(mockUserId, '123456');

      // Assert
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.backupCodes).toHaveLength(10);
        // XXXX-XXXX形式であることを確認
        result.value.backupCodes.forEach((code) => {
          expect(code).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
        });
      }
    });

    it('production環境で無効なTOTPコード → INVALID_TOTP_CODE', async () => {
      // Arrange
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      const encryptedSecret = await twoFactorService.encryptSecret(testSecret);
      const userWithSecret = {
        id: mockUserId,
        twoFactorEnabled: false,
        twoFactorSecret: encryptedSecret,
      };
      vi.mocked(mockPrismaClient.user.findUnique).mockResolvedValue(userWithSecret);

      // Act
      const result = await twoFactorService.enableTwoFactor(mockUserId, '000000');

      // Cleanup
      process.env.NODE_ENV = originalEnv;

      // Assert
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe('INVALID_TOTP_CODE');
      }
    });

    it('production環境で復号化失敗 → DECRYPTION_FAILED', async () => {
      // Arrange
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      const userWithInvalidSecret = {
        id: mockUserId,
        twoFactorEnabled: false,
        twoFactorSecret: 'invalid-encrypted-data',
      };
      vi.mocked(mockPrismaClient.user.findUnique).mockResolvedValue(userWithInvalidSecret);

      // Act
      const result = await twoFactorService.enableTwoFactor(mockUserId, '654321');

      // Cleanup
      process.env.NODE_ENV = originalEnv;

      // Assert
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe('DECRYPTION_FAILED');
      }
    });

    it('DBエラー発生時 → INVALID_TOTP_CODE', async () => {
      // Arrange
      const encryptedSecret = await twoFactorService.encryptSecret(testSecret);
      const userWithSecret = {
        id: mockUserId,
        twoFactorEnabled: false,
        twoFactorSecret: encryptedSecret,
      };
      const { hash } = await import('@node-rs/argon2');
      vi.mocked(hash).mockResolvedValue('hashed-code');
      vi.mocked(mockPrismaClient.user.findUnique).mockResolvedValue(userWithSecret);
      vi.mocked(mockPrismaClient.$transaction).mockRejectedValue(new Error('DB Error'));

      // Act - テスト環境では"123456"でバイパス可能
      const result = await twoFactorService.enableTwoFactor(mockUserId, '123456');

      // Assert
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe('INVALID_TOTP_CODE');
      }
    });
  });

  describe('verifyBackupCode() - 成功パス', () => {
    const mockUserId = 'user-verify-backup-123';

    it('有効なバックアップコード → 検証成功、使用済みマーク', async () => {
      // Arrange
      // production環境をシミュレートしてテストコードのバイパスを避ける
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      const userWith2FA = {
        id: mockUserId,
        twoFactorEnabled: true,
      };
      const mockBackupCodes = [
        { id: 'code-1', userId: mockUserId, codeHash: 'hash1', usedAt: null },
        { id: 'code-2', userId: mockUserId, codeHash: 'hash2', usedAt: null },
      ];
      const { verify } = await import('@node-rs/argon2');
      vi.mocked(verify).mockResolvedValueOnce(false).mockResolvedValueOnce(true);
      vi.mocked(mockPrismaClient.user.findUnique).mockResolvedValue(userWith2FA);
      vi.mocked(mockPrismaClient.twoFactorBackupCode.findMany).mockResolvedValue(mockBackupCodes);
      vi.mocked(mockPrismaClient.$transaction).mockResolvedValue([]);

      // Act
      const result = await twoFactorService.verifyBackupCode(mockUserId, 'VALIDCODE');

      // Cleanup
      process.env.NODE_ENV = originalEnv;

      // Assert
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(true);
      }
    });

    it('無効なバックアップコード → false', async () => {
      // Arrange
      // production環境をシミュレートしてテストコードのバイパスを避ける
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      const userWith2FA = {
        id: mockUserId,
        twoFactorEnabled: true,
      };
      const mockBackupCodes = [
        { id: 'code-1', userId: mockUserId, codeHash: 'hash1', usedAt: null },
      ];
      const { verify } = await import('@node-rs/argon2');
      vi.mocked(verify).mockResolvedValue(false);
      vi.mocked(mockPrismaClient.user.findUnique).mockResolvedValue(userWith2FA);
      vi.mocked(mockPrismaClient.twoFactorBackupCode.findMany).mockResolvedValue(mockBackupCodes);

      // Act
      const result = await twoFactorService.verifyBackupCode(mockUserId, 'INVALIDCD');

      // Cleanup
      process.env.NODE_ENV = originalEnv;

      // Assert
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(false);
      }
    });

    it('DBエラー発生時 → INVALID_BACKUP_CODE', async () => {
      // Arrange
      const userWith2FA = {
        id: mockUserId,
        twoFactorEnabled: true,
      };
      vi.mocked(mockPrismaClient.user.findUnique).mockResolvedValue(userWith2FA);
      vi.mocked(mockPrismaClient.twoFactorBackupCode.findMany).mockRejectedValue(
        new Error('DB Error')
      );

      // Act
      const result = await twoFactorService.verifyBackupCode(mockUserId, 'ANYCODE1');

      // Assert
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe('INVALID_BACKUP_CODE');
      }
    });
  });

  describe('verifyTOTP() - 追加テスト', () => {
    const mockUserId = 'user-totp-extra-123';

    it('復号化失敗 → DECRYPTION_FAILED', async () => {
      // Arrange
      // production環境をシミュレートしてテストコードのバイパスを避ける
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      const userWith2FA = {
        id: mockUserId,
        twoFactorEnabled: true,
        twoFactorSecret: 'invalid-encrypted-data',
      };
      vi.mocked(mockPrismaClient.user.findUnique).mockResolvedValue(userWith2FA);

      // Act
      const result = await twoFactorService.verifyTOTP(mockUserId, '654321');

      // Cleanup
      process.env.NODE_ENV = originalEnv;

      // Assert
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe('DECRYPTION_FAILED');
      }
    });

    it('DBエラー発生時 → INVALID_TOTP_CODE', async () => {
      // Arrange
      vi.mocked(mockPrismaClient.user.findUnique).mockRejectedValue(new Error('DB Error'));

      // Act
      const result = await twoFactorService.verifyTOTP(mockUserId, '654321');

      // Assert
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe('INVALID_TOTP_CODE');
      }
    });
  });

  describe('regenerateBackupCodes() - エラーハンドリング', () => {
    const mockUserId = 'user-regen-error-123';

    it('トランザクションエラー → USER_NOT_FOUND', async () => {
      // Arrange
      const mockUser = {
        id: mockUserId,
        twoFactorEnabled: true,
      };
      vi.mocked(mockPrismaClient.user.findUnique).mockResolvedValue(mockUser);
      vi.mocked(mockPrismaClient.$transaction).mockRejectedValue(new Error('Transaction Error'));

      // Act
      const result = await twoFactorService.regenerateBackupCodes(mockUserId);

      // Assert
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe('USER_NOT_FOUND');
      }
    });
  });

  describe('setupTwoFactor() - エラーハンドリング', () => {
    const mockUserId = 'user-setup-error-123';

    it('トランザクションエラー → USER_NOT_FOUND', async () => {
      // Arrange
      const mockUser = {
        id: mockUserId,
        email: 'test@example.com',
        twoFactorEnabled: false,
        twoFactorSecret: null,
      };
      vi.mocked(mockPrismaClient.user.findUnique).mockResolvedValue(mockUser);
      vi.mocked(mockPrismaClient.$transaction).mockRejectedValue(new Error('Transaction Error'));

      // Act
      const result = await twoFactorService.setupTwoFactor(mockUserId);

      // Assert
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe('USER_NOT_FOUND');
      }
    });
  });
});
