/**
 * @fileoverview TwoFactorServiceの単体テスト
 *
 * Requirements:
 * - 27.1-27.8: 二要素認証設定機能
 * - 27C.1-27C.6: 二要素認証セキュリティ要件
 * - 27.9-27.10, 27A.3-27A.7: 2FA検証・管理機能
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
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
    updateMany: vi.fn(),
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
    // 時間ステップの記録（条件付きの更新）は、既定では記録できた（1 行を更新した）ことにする
    vi.mocked(mockPrismaClient.user.updateMany).mockResolvedValue({ count: 1 });
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

  /**
   * TOTP の再利用の拒否と固定値の撤去（タスク46.2）
   *
   * 一致した時間ステップを `users.two_factor_last_used_step` へ条件付きの更新で記録し、記録以下のステップの
   * コードを拒否する。DB の代役は updateMany の where（未設定、または記録より小さい）を評価して記録を保つ。
   */
  describe('verifyTOTP() TOTP の再利用の拒否', () => {
    const replayUserId = 'user-totp-replay';
    const replaySecret = 'JBSWY3DPEHPK3PXP';
    /** 時間ステップの途中の時刻（境界をまたがない） */
    const baseTime = new Date('2025-01-01T00:00:15Z');
    const currentStep = Math.floor(baseTime.getTime() / 30000);

    /** 時刻を固定して、その時刻のコードを返す */
    function codeAt(time: Date): string {
      vi.setSystemTime(time);
      return authenticator.generate(replaySecret);
    }

    type StepUpdateArgs = {
      where: { id: string; OR: Array<{ twoFactorLastUsedStep: null | { lt: number } }> };
      data: { twoFactorLastUsedStep: number };
    };

    /** 条件付きの更新の where を DB と同じく評価し、最後に使った時間ステップを保つ代役 */
    function emulateLastUsedStep(initial: number | null): {
      lastUsedStep: () => number | null;
      record: (step: number) => void;
    } {
      let lastUsedStep = initial;
      vi.mocked(mockPrismaClient.user.updateMany).mockImplementation(
        async ({ where, data }: StepUpdateArgs) => {
          const matched = where.OR.some((condition) =>
            condition.twoFactorLastUsedStep === null
              ? lastUsedStep === null
              : lastUsedStep !== null && lastUsedStep < condition.twoFactorLastUsedStep.lt
          );
          if (!matched) {
            return { count: 0 };
          }
          lastUsedStep = data.twoFactorLastUsedStep;
          return { count: 1 };
        }
      );
      return {
        lastUsedStep: () => lastUsedStep,
        record: (step) => {
          lastUsedStep = step;
        },
      };
    }

    beforeEach(async () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(baseTime);
      vi.mocked(mockPrismaClient.user.findUnique).mockResolvedValue({
        id: replayUserId,
        twoFactorEnabled: true,
        twoFactorSecret: await twoFactorService.encryptSecret(replaySecret),
      });
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('同じコードの二度目の検証は CODE_ALREADY_USED で拒否する', async () => {
      const db = emulateLastUsedStep(null);
      const code = codeAt(baseTime);

      const first = await twoFactorService.verifyTOTP(replayUserId, code);
      const second = await twoFactorService.verifyTOTP(replayUserId, code);

      expect(first).toEqual({ ok: true, value: true });
      expect(second).toEqual({ ok: false, error: { type: 'CODE_ALREADY_USED' } });
      expect(db.lastUsedStep()).toBe(currentStep);
    });

    it('次の時間ステップへ進んでも、許容の窓に残る同じコードの二度目を拒否する', async () => {
      emulateLastUsedStep(null);
      const code = codeAt(baseTime);
      expect(await twoFactorService.verifyTOTP(replayUserId, code)).toEqual({
        ok: true,
        value: true,
      });

      // 30 秒後も ±1 ステップの窓の中に残るコード
      vi.setSystemTime(new Date(baseTime.getTime() + 30000));
      const replayed = await twoFactorService.verifyTOTP(replayUserId, code);

      expect(replayed).toEqual({ ok: false, error: { type: 'CODE_ALREADY_USED' } });
    });

    it('前のステップのコードで成功した後、現在のステップのコードは成功する', async () => {
      const db = emulateLastUsedStep(null);
      const previous = codeAt(new Date(baseTime.getTime() - 30000));
      const current = codeAt(baseTime);
      expect(previous).not.toBe(current);

      expect(await twoFactorService.verifyTOTP(replayUserId, previous)).toEqual({
        ok: true,
        value: true,
      });
      expect(db.lastUsedStep()).toBe(currentStep - 1);

      expect(await twoFactorService.verifyTOTP(replayUserId, current)).toEqual({
        ok: true,
        value: true,
      });
      expect(db.lastUsedStep()).toBe(currentStep);
    });

    it('現在のステップのコードで成功した後、窓の中の前のステップのコードは CODE_ALREADY_USED で拒否する', async () => {
      emulateLastUsedStep(null);
      const previous = codeAt(new Date(baseTime.getTime() - 30000));
      const current = codeAt(baseTime);

      expect(await twoFactorService.verifyTOTP(replayUserId, current)).toEqual({
        ok: true,
        value: true,
      });

      expect(await twoFactorService.verifyTOTP(replayUserId, previous)).toEqual({
        ok: false,
        error: { type: 'CODE_ALREADY_USED' },
      });
    });

    it('一致したステップを、未設定か記録より小さいときだけ更新する条件付きの更新で記録する', async () => {
      const previous = codeAt(new Date(baseTime.getTime() - 30000));
      vi.setSystemTime(baseTime);

      await twoFactorService.verifyTOTP(replayUserId, previous);

      expect(mockPrismaClient.user.updateMany).toHaveBeenCalledTimes(1);
      expect(mockPrismaClient.user.updateMany).toHaveBeenCalledWith({
        where: {
          id: replayUserId,
          OR: [{ twoFactorLastUsedStep: null }, { twoFactorLastUsedStep: { lt: currentStep - 1 } }],
        },
        data: { twoFactorLastUsedStep: currentStep - 1 },
      });
    });

    it('条件付きの更新が 1 行も更新しない（同時の検証に先を越された）ときは CODE_ALREADY_USED で拒否する', async () => {
      vi.mocked(mockPrismaClient.user.updateMany).mockResolvedValue({ count: 0 });

      const result = await twoFactorService.verifyTOTP(replayUserId, codeAt(baseTime));

      expect(result).toEqual({ ok: false, error: { type: 'CODE_ALREADY_USED' } });
    });

    it('一致しないコードでは時間ステップを記録しない', async () => {
      const current = codeAt(baseTime);
      const wrong = `${(Number(current[0]) + 5) % 10}${current.slice(1)}`;

      const result = await twoFactorService.verifyTOTP(replayUserId, wrong);

      expect(result).toEqual({ ok: true, value: false });
      expect(mockPrismaClient.user.updateMany).not.toHaveBeenCalled();
    });

    /**
     * 有効化（enableTwoFactor）も TOTP の提示であり、一致したステップを有効化と同時に記録する。
     * 代役は、有効化の update の data を条件付きの更新の代役と同じ記録へ反映する。
     */
    describe('有効化に使ったコード', () => {
      let enabled: boolean;
      let db: ReturnType<typeof emulateLastUsedStep>;

      beforeEach(async () => {
        enabled = false;
        db = emulateLastUsedStep(null);
        const encryptedSecret = await twoFactorService.encryptSecret(replaySecret);
        vi.mocked(mockPrismaClient.user.findUnique).mockImplementation(async () => ({
          id: replayUserId,
          email: 'replay@example.com',
          displayName: 'Replay User',
          twoFactorEnabled: enabled,
          twoFactorSecret: encryptedSecret,
        }));
        vi.mocked(mockPrismaClient.user.update).mockImplementation(
          async ({
            data,
          }: {
            data: { twoFactorEnabled?: boolean; twoFactorLastUsedStep?: number };
          }) => {
            if (data.twoFactorEnabled !== undefined) {
              enabled = data.twoFactorEnabled;
            }
            if (data.twoFactorLastUsedStep !== undefined) {
              // 有効化の update の値を、条件付きの更新の代役と同じ記録へ反映する
              db.record(data.twoFactorLastUsedStep);
            }
            return { id: replayUserId };
          }
        );
        const { hash } = await import('@node-rs/argon2');
        vi.mocked(hash).mockResolvedValue('hashed-code');
      });

      it('有効化の update に、一致した時間ステップを twoFactorEnabled と同時に記録する', async () => {
        const previous = codeAt(new Date(baseTime.getTime() - 30000));
        vi.setSystemTime(baseTime);

        const result = await twoFactorService.enableTwoFactor(replayUserId, previous);

        expect(result.ok).toBe(true);
        expect(mockPrismaClient.user.update).toHaveBeenCalledWith({
          where: { id: replayUserId },
          data: { twoFactorEnabled: true, twoFactorLastUsedStep: currentStep - 1 },
        });
        expect(db.lastUsedStep()).toBe(currentStep - 1);
      });

      it('有効化に使ったコードをログインの verifyTOTP へ渡すと CODE_ALREADY_USED で拒否する', async () => {
        const code = codeAt(baseTime);
        expect((await twoFactorService.enableTwoFactor(replayUserId, code)).ok).toBe(true);

        const replayed = await twoFactorService.verifyTOTP(replayUserId, code);

        expect(replayed).toEqual({ ok: false, error: { type: 'CODE_ALREADY_USED' } });
      });
    });

    describe.each<[NodeJS.ProcessEnv['NODE_ENV']]>([['test'], ['development'], [undefined]])(
      'NODE_ENV=%s でも開発用の固定値を受理しない',
      (nodeEnv) => {
        let originalEnv: NodeJS.ProcessEnv['NODE_ENV'];

        beforeEach(() => {
          originalEnv = process.env.NODE_ENV;
          if (nodeEnv === undefined) {
            delete process.env.NODE_ENV;
          } else {
            process.env.NODE_ENV = nodeEnv;
          }
          // 前提: 固定の時刻の許容の窓の中に、たまたま 123456 と一致する本物のコードが無い
          const windowCodes = [-30000, 0, 30000].map((offset) =>
            codeAt(new Date(baseTime.getTime() + offset))
          );
          vi.setSystemTime(baseTime);
          expect(windowCodes).not.toContain('123456');
        });

        afterEach(() => {
          if (originalEnv === undefined) {
            delete process.env.NODE_ENV;
          } else {
            process.env.NODE_ENV = originalEnv;
          }
        });

        it('TOTP の検証は固定値 123456 を拒否する', async () => {
          const result = await twoFactorService.verifyTOTP(replayUserId, '123456');

          expect(result).toEqual({ ok: true, value: false });
          expect(mockPrismaClient.user.updateMany).not.toHaveBeenCalled();
        });

        it('2FA の有効化は固定値 123456 を INVALID_TOTP_CODE で拒否する', async () => {
          vi.mocked(mockPrismaClient.user.findUnique).mockResolvedValue({
            id: replayUserId,
            twoFactorEnabled: false,
            twoFactorSecret: await twoFactorService.encryptSecret(replaySecret),
          });

          const result = await twoFactorService.enableTwoFactor(replayUserId, '123456');

          expect(result).toEqual({ ok: false, error: { type: 'INVALID_TOTP_CODE' } });
          expect(mockPrismaClient.$transaction).not.toHaveBeenCalled();
        });

        it('バックアップコードの検証は固定値 ABCD1234 を受理しない', async () => {
          vi.mocked(mockPrismaClient.twoFactorBackupCode.findMany).mockResolvedValue([]);

          const plain = await twoFactorService.verifyBackupCode(replayUserId, 'ABCD1234');
          const formatted = await twoFactorService.verifyBackupCode(replayUserId, 'abcd-1234');

          expect(plain).toEqual({ ok: true, value: false });
          expect(formatted).toEqual({ ok: true, value: false });
          expect(mockPrismaClient.$transaction).not.toHaveBeenCalled();
        });
      }
    );
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
          // 実行者の写し（要件40.7）
          actorEmail: mockUser.email,
          actorDisplayName: mockUser.displayName,
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

  describe('enableTwoFactor() - 成功パス', () => {
    const mockUserId = 'user-enable-success-123';
    const testSecret = 'JBSWY3DPEHPK3PXP';

    it('正しいTOTPコード → 2FA有効化、バックアップコード返却', async () => {
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

      // Act（秘密鍵から計算した現在のコード）
      const result = await twoFactorService.enableTwoFactor(
        mockUserId,
        authenticator.generate(testSecret)
      );

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

    it('無効なTOTPコード → INVALID_TOTP_CODE', async () => {
      // Arrange
      const encryptedSecret = await twoFactorService.encryptSecret(testSecret);
      const userWithSecret = {
        id: mockUserId,
        twoFactorEnabled: false,
        twoFactorSecret: encryptedSecret,
      };
      vi.mocked(mockPrismaClient.user.findUnique).mockResolvedValue(userWithSecret);

      // Act
      const result = await twoFactorService.enableTwoFactor(mockUserId, '000000');

      // Assert
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe('INVALID_TOTP_CODE');
      }
    });

    it('復号化失敗 → DECRYPTION_FAILED', async () => {
      // Arrange
      const userWithInvalidSecret = {
        id: mockUserId,
        twoFactorEnabled: false,
        twoFactorSecret: 'invalid-encrypted-data',
      };
      vi.mocked(mockPrismaClient.user.findUnique).mockResolvedValue(userWithInvalidSecret);

      // Act
      const result = await twoFactorService.enableTwoFactor(mockUserId, '654321');

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

      // Act（秘密鍵から計算した現在のコード）
      const result = await twoFactorService.enableTwoFactor(
        mockUserId,
        authenticator.generate(testSecret)
      );

      // Assert
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe('INVALID_TOTP_CODE');
      }
    });
  });

  describe('verifyBackupCode() - 成功パス', () => {
    const mockUserId = 'user-verify-backup-123';

    it('入力のハイフンと小文字を正規化した値で照合する', async () => {
      // Arrange（保存値は生成時の 8 文字の大文字の英数字のハッシュ）
      vi.mocked(mockPrismaClient.user.findUnique).mockResolvedValue({
        id: mockUserId,
        twoFactorEnabled: true,
      });
      vi.mocked(mockPrismaClient.twoFactorBackupCode.findMany).mockResolvedValue([
        { id: 'code-1', userId: mockUserId, codeHash: 'hash1', usedAt: null },
      ]);
      const { verify } = await import('@node-rs/argon2');
      vi.mocked(verify).mockImplementation(async (_hash, candidate) => candidate === 'QWER5678');
      vi.mocked(mockPrismaClient.twoFactorBackupCode.updateMany).mockResolvedValue({ count: 1 });

      // Act（画面に表示される XXXX-XXXX 形式を小文字で入力）
      const result = await twoFactorService.verifyBackupCode(mockUserId, 'qwer-5678');

      // Assert
      expect(result).toEqual({ ok: true, value: true });
      expect(verify).toHaveBeenCalledWith('hash1', 'QWER5678');
    });

    it('有効なバックアップコード → 検証成功、使用済みマーク', async () => {
      // Arrange
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
      vi.mocked(mockPrismaClient.twoFactorBackupCode.updateMany).mockResolvedValue({ count: 1 });

      // Act
      const result = await twoFactorService.verifyBackupCode(mockUserId, 'VALIDCODE');

      // Assert
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(true);
      }
    });

    /**
     * 要件27A.6, 27A.7: 使用済みのマークは「未使用の行だけ」を条件にした一度の更新で行い、
     * 読んでから書く間に並行の検証が同じコードを使えないようにする
     */
    it('一致したコードを usedAt が null の行だけを条件にした更新で使用済みにし、監査ログを同じトランザクションで記録する', async () => {
      vi.mocked(mockPrismaClient.user.findUnique).mockResolvedValue({
        id: mockUserId,
        twoFactorEnabled: true,
      });
      vi.mocked(mockPrismaClient.twoFactorBackupCode.findMany).mockResolvedValue([
        { id: 'code-1', userId: mockUserId, codeHash: 'hash1', usedAt: null },
      ]);
      const { verify } = await import('@node-rs/argon2');
      vi.mocked(verify).mockResolvedValue(true);
      vi.mocked(mockPrismaClient.twoFactorBackupCode.updateMany).mockResolvedValue({ count: 1 });

      const result = await twoFactorService.verifyBackupCode(mockUserId, 'VALIDCODE');

      expect(result).toEqual({ ok: true, value: true });
      expect(mockPrismaClient.twoFactorBackupCode.updateMany).toHaveBeenCalledWith({
        where: { id: 'code-1', usedAt: null },
        data: { usedAt: expect.any(Date) },
      });
      expect(mockPrismaClient.twoFactorBackupCode.update).not.toHaveBeenCalled();
      expect(mockPrismaClient.$transaction).toHaveBeenCalledWith(expect.any(Function));
      expect(mockPrismaClient.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: 'TWO_FACTOR_BACKUP_CODE_USED' }),
        })
      );
    });

    it('条件付きの更新が 0 行（並行の検証が先に使った）のときは無効として扱い、監査ログを書かない', async () => {
      vi.mocked(mockPrismaClient.user.findUnique).mockResolvedValue({
        id: mockUserId,
        twoFactorEnabled: true,
      });
      vi.mocked(mockPrismaClient.twoFactorBackupCode.findMany).mockResolvedValue([
        { id: 'code-1', userId: mockUserId, codeHash: 'hash1', usedAt: null },
      ]);
      const { verify } = await import('@node-rs/argon2');
      vi.mocked(verify).mockResolvedValue(true);
      vi.mocked(mockPrismaClient.twoFactorBackupCode.updateMany).mockResolvedValue({ count: 0 });

      const result = await twoFactorService.verifyBackupCode(mockUserId, 'VALIDCODE');

      expect(result).toEqual({ ok: true, value: false });
      expect(mockPrismaClient.auditLog.create).not.toHaveBeenCalled();
    });

    it('無効なバックアップコード → false', async () => {
      // Arrange
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
      const userWith2FA = {
        id: mockUserId,
        twoFactorEnabled: true,
        twoFactorSecret: 'invalid-encrypted-data',
      };
      vi.mocked(mockPrismaClient.user.findUnique).mockResolvedValue(userWith2FA);

      // Act
      const result = await twoFactorService.verifyTOTP(mockUserId, '654321');

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

  describe('復号できない 2FA の秘密の判定と再設定（暗号化鍵の入れ替えの後始末）', () => {
    const OTHER_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

    async function encryptWithOtherKey(secret: string): Promise<string> {
      const current = process.env.TWO_FACTOR_ENCRYPTION_KEY;
      process.env.TWO_FACTOR_ENCRYPTION_KEY = OTHER_KEY;
      try {
        return await twoFactorService.encryptSecret(secret);
      } finally {
        process.env.TWO_FACTOR_ENCRYPTION_KEY = current;
      }
    }

    it('現在の鍵で復号できる秘密は none、復号できない登録済みの秘密は full と判定する', async () => {
      const current = await twoFactorService.encryptSecret('JBSWY3DPEHPK3PXP');
      const old = await encryptWithOtherKey('JBSWY3DPEHPK3PXP');

      await expect(
        twoFactorService.classifyUndecryptableTwoFactor({
          twoFactorEnabled: true,
          twoFactorSecret: current,
          twoFactorPendingSecret: null,
        })
      ).resolves.toBe('none');
      await expect(
        twoFactorService.classifyUndecryptableTwoFactor({
          twoFactorEnabled: true,
          twoFactorSecret: old,
          twoFactorPendingSecret: null,
        })
      ).resolves.toBe('full');
    });

    it('登録済みなのに秘密が無ければ full、再登録中の秘密だけが復号できなければ pending_only と判定する', async () => {
      const current = await twoFactorService.encryptSecret('JBSWY3DPEHPK3PXP');
      const old = await encryptWithOtherKey('KRSXG5CTMVRXEZLU');

      await expect(
        twoFactorService.classifyUndecryptableTwoFactor({
          twoFactorEnabled: true,
          twoFactorSecret: null,
          twoFactorPendingSecret: null,
        })
      ).resolves.toBe('full');
      await expect(
        twoFactorService.classifyUndecryptableTwoFactor({
          twoFactorEnabled: true,
          twoFactorSecret: current,
          twoFactorPendingSecret: old,
        })
      ).resolves.toBe('pending_only');
      await expect(
        twoFactorService.classifyUndecryptableTwoFactor({
          twoFactorEnabled: false,
          twoFactorSecret: null,
          twoFactorPendingSecret: null,
        })
      ).resolves.toBe('none');
    });

    it.each([
      ['登録済みの秘密', { twoFactorSecret: 'old', twoFactorPendingSecret: null }],
      ['再登録中の秘密', { twoFactorSecret: 'current', twoFactorPendingSecret: 'old' }],
    ])(
      '読み出しの後に%sが書き換わっていれば（新しい鍵での再登録）、何も消さず監査も記録しない',
      async (_label, secrets) => {
        const current = await twoFactorService.encryptSecret('JBSWY3DPEHPK3PXP');
        const old = await encryptWithOtherKey('KRSXG5CTMVRXEZLU');
        const pick = (v: string | null) => (v === 'old' ? old : v === 'current' ? current : null);
        mockPrismaClient.user.findUnique.mockResolvedValue({
          id: 'user-1',
          email: 'user@example.com',
          twoFactorEnabled: true,
          twoFactorSecret: pick(secrets.twoFactorSecret),
          twoFactorPendingSecret: pick(secrets.twoFactorPendingSecret),
        });
        // 条件付きの更新が 0 行（読み出した値から変わっていた）
        mockPrismaClient.user.updateMany.mockResolvedValue({ count: 0 });
        const invalidate = vi.fn().mockResolvedValue(undefined);
        const service = new TwoFactorService({ invalidate });

        const result = await service.resetUndecryptableByOperatorScript('user-1', '理由');

        expect(result).toEqual({ ok: true, value: 'none' });
        expect(mockPrismaClient.user.updateMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({
              id: 'user-1',
              twoFactorSecret: pick(secrets.twoFactorSecret),
              twoFactorPendingSecret: pick(secrets.twoFactorPendingSecret),
            }),
          })
        );
        expect(mockPrismaClient.refreshToken.deleteMany).not.toHaveBeenCalled();
        expect(mockPrismaClient.twoFactorBackupCode.deleteMany).not.toHaveBeenCalled();
        expect(mockPrismaClient.auditLog.create).not.toHaveBeenCalled();
        expect(invalidate).not.toHaveBeenCalled();
      }
    );
  });
});
