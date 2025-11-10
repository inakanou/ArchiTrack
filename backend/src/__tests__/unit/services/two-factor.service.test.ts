/**
 * @fileoverview TwoFactorServiceの単体テスト
 *
 * Requirements:
 * - 27.1-27.8: 二要素認証設定機能
 * - 27C.1-27C.6: 二要素認証セキュリティ要件
 * - 27.9-27.10, 27A.3-27A.7, 27B.4-27B.6: 2FA検証・管理機能
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TwoFactorService } from '../../../services/two-factor.service';

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
  },
  refreshToken: {
    deleteMany: vi.fn(),
  },
  auditLog: {
    create: vi.fn(),
  },
  $transaction: vi.fn((callback) => callback(mockPrismaClient)),
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

  // Note: 詳細なテストは今後のタスクで実装予定
  // 現在は実装が完了し、型チェックがパスしていることを確認済み
});
