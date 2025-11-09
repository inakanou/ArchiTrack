import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { EnvValidator } from '../../../utils/env-validator';

/**
 * 環境変数バリデーション機能の単体テスト
 *
 * 要件トレーサビリティ:
 * - 要件2.7: パスワード複雑性要件、禁止パスワードリスト
 * - 要件3.1: 初期管理者アカウント情報
 * - 要件5.9, 5.10: トークン有効期限の環境変数
 * - 要件27C.4, 27C.5: 2FA暗号化鍵
 */

describe('EnvValidator', () => {
  // モック用のJWK鍵（Base64エンコード）
  const mockPublicKeyJWK = {
    kty: 'OKP',
    crv: 'Ed25519',
    x: 'mock_public_key_base64',
    kid: 'mock-key-id',
  };

  const mockPrivateKeyJWK = {
    kty: 'OKP',
    crv: 'Ed25519',
    x: 'mock_public_key_base64',
    d: 'mock_private_key_base64',
    kid: 'mock-key-id',
  };

  const mockPublicKeyBase64 = Buffer.from(JSON.stringify(mockPublicKeyJWK)).toString('base64');
  const mockPrivateKeyBase64 = Buffer.from(JSON.stringify(mockPrivateKeyJWK)).toString('base64');

  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    // 各テストの前に環境変数を保存
    originalEnv = { ...process.env };
    vi.resetModules();
  });

  afterEach(() => {
    // 各テストの後に環境変数を復元
    process.env = originalEnv;
  });

  describe('validateAuthEnvVars', () => {
    it('全ての必須環境変数が設定されている場合、validationが成功する', () => {
      // 環境変数を設定
      process.env.JWT_PUBLIC_KEY = mockPublicKeyBase64;
      process.env.JWT_PRIVATE_KEY = mockPrivateKeyBase64;
      process.env.ACCESS_TOKEN_EXPIRY = '15m';
      process.env.REFRESH_TOKEN_EXPIRY = '7d';

      const validator = new EnvValidator();
      const result = validator.validateAuthEnvVars();

      expect(result.valid).toBe(true);
    });

    it('JWT_PUBLIC_KEYが未設定の場合、バリデーションエラーを返す', () => {
      // JWT_PUBLIC_KEYのみ未設定
      delete process.env.JWT_PUBLIC_KEY;
      process.env.JWT_PRIVATE_KEY = mockPrivateKeyBase64;

      const validator = new EnvValidator();
      const result = validator.validateAuthEnvVars();

      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.errors).toContain('JWT_PUBLIC_KEY is required');
      }
    });

    it('JWT_PRIVATE_KEYが未設定の場合、バリデーションエラーを返す', () => {
      // JWT_PRIVATE_KEYのみ未設定
      process.env.JWT_PUBLIC_KEY = mockPublicKeyBase64;
      delete process.env.JWT_PRIVATE_KEY;

      const validator = new EnvValidator();
      const result = validator.validateAuthEnvVars();

      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.errors).toContain('JWT_PRIVATE_KEY is required');
      }
    });
  });

  describe('validateJwtKeys', () => {
    it('JWT_PUBLIC_KEYが有効なBase64形式の場合、検証に成功する', () => {
      process.env.JWT_PUBLIC_KEY = mockPublicKeyBase64;
      process.env.JWT_PRIVATE_KEY = mockPrivateKeyBase64;

      const validator = new EnvValidator();
      const result = validator.validateJwtKeys();

      expect(result.valid).toBe(true);
    });

    it('JWT_PRIVATE_KEYが有効なBase64形式の場合、検証に成功する', () => {
      process.env.JWT_PUBLIC_KEY = mockPublicKeyBase64;
      process.env.JWT_PRIVATE_KEY = mockPrivateKeyBase64;

      const validator = new EnvValidator();
      const result = validator.validateJwtKeys();

      expect(result.valid).toBe(true);
    });

    it('JWT_PUBLIC_KEYが無効なBase64形式の場合、バリデーションエラーを返す', () => {
      process.env.JWT_PUBLIC_KEY = 'invalid_base64!!!';
      process.env.JWT_PRIVATE_KEY = mockPrivateKeyBase64;

      const validator = new EnvValidator();
      const result = validator.validateJwtKeys();

      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.errors).toContain('JWT_PUBLIC_KEY is not valid Base64');
      }
    });
  });

  describe('validateTwoFactorKeys', () => {
    it('TWO_FACTOR_ENCRYPTION_KEYが256ビット（64文字16進数）の場合、検証に成功する', () => {
      // 64文字の16進数文字列を生成
      process.env.TWO_FACTOR_ENCRYPTION_KEY =
        '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

      const validator = new EnvValidator();
      const result = validator.validateTwoFactorKeys();

      expect(result.valid).toBe(true);
    });

    it('TWO_FACTOR_ENCRYPTION_KEYが64文字未満の場合、バリデーションエラーを返す', () => {
      process.env.TWO_FACTOR_ENCRYPTION_KEY = '0123456789abcdef'; // 16文字のみ

      const validator = new EnvValidator();
      const result = validator.validateTwoFactorKeys();

      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.errors).toContain('TWO_FACTOR_ENCRYPTION_KEY must be 64 hex characters');
      }
    });

    it('TWO_FACTOR_ENCRYPTION_KEYに16進数以外の文字が含まれる場合、バリデーションエラーを返す', () => {
      process.env.TWO_FACTOR_ENCRYPTION_KEY =
        '0123456789abcdefGHIJKLMNOPQRSTUVWXYZ0123456789abcdef0123456789ab'; // 64文字だが非16進数文字を含む

      const validator = new EnvValidator();
      const result = validator.validateTwoFactorKeys();

      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.errors).toContain(
          'TWO_FACTOR_ENCRYPTION_KEY must contain only hex characters'
        );
      }
    });
  });

  describe('validateTokenExpiry', () => {
    it('ACCESS_TOKEN_EXPIRYが有効な時間文字列の場合、検証に成功する', () => {
      process.env.ACCESS_TOKEN_EXPIRY = '15m';
      process.env.REFRESH_TOKEN_EXPIRY = '7d';

      const validator = new EnvValidator();
      const result = validator.validateTokenExpiry();

      expect(result.valid).toBe(true);
    });

    it('REFRESH_TOKEN_EXPIRYが有効な時間文字列の場合、検証に成功する', () => {
      process.env.ACCESS_TOKEN_EXPIRY = '1h';
      process.env.REFRESH_TOKEN_EXPIRY = '30d';

      const validator = new EnvValidator();
      const result = validator.validateTokenExpiry();

      expect(result.valid).toBe(true);
    });

    it('ACCESS_TOKEN_EXPIRYが未設定の場合、デフォルト値を使用する', () => {
      // ACCESS_TOKEN_EXPIRYを未設定にする
      delete process.env.ACCESS_TOKEN_EXPIRY;
      process.env.REFRESH_TOKEN_EXPIRY = '7d';

      const validator = new EnvValidator();
      const result = validator.validateTokenExpiry();

      // デフォルト値 '15m' が使用されるため、検証は成功する
      expect(result.valid).toBe(true);
    });

    it('REFRESH_TOKEN_EXPIRYが未設定の場合、デフォルト値を使用する', () => {
      // REFRESH_TOKEN_EXPIRYを未設定にする
      process.env.ACCESS_TOKEN_EXPIRY = '15m';
      delete process.env.REFRESH_TOKEN_EXPIRY;

      const validator = new EnvValidator();
      const result = validator.validateTokenExpiry();

      // デフォルト値 '7d' が使用されるため、検証は成功する
      expect(result.valid).toBe(true);
    });

    it('ACCESS_TOKEN_EXPIRYが無効な形式の場合、バリデーションエラーを返す', () => {
      process.env.ACCESS_TOKEN_EXPIRY = 'invalid_time';
      process.env.REFRESH_TOKEN_EXPIRY = '7d';

      const validator = new EnvValidator();
      const result = validator.validateTokenExpiry();

      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.errors).toContain('ACCESS_TOKEN_EXPIRY must be a valid time string');
      }
    });
  });
});
