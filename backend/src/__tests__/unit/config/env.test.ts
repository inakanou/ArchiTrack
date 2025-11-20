import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * env.ts のユニットテスト
 *
 * 環境変数検証システムの動作を検証
 */

describe('env module', () => {
  let originalEnv: NodeJS.ProcessEnv;

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
  const mock2FAKey = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

  beforeEach(() => {
    // 各テストの前に環境変数を保存
    originalEnv = { ...process.env };
    vi.resetModules();
  });

  afterEach(() => {
    // 各テストの後に環境変数を復元
    process.env = originalEnv;
  });

  describe('validateEnv', () => {
    it('全ての必須環境変数が正しい場合、検証に成功する', async () => {
      // 環境変数を設定
      process.env.JWT_PUBLIC_KEY = mockPublicKeyBase64;
      process.env.JWT_PRIVATE_KEY = mockPrivateKeyBase64;
      process.env.TWO_FACTOR_ENCRYPTION_KEY = mock2FAKey;

      // モジュールを動的にインポート
      const { validateEnv } = await import('../../../config/env.js');

      const result = validateEnv();

      expect(result).toBeDefined();
      // テスト環境ではNODE_ENVが'test'に設定される
      expect(result.NODE_ENV).toBe('test');
      // .env.testで3001が設定されている
      expect(result.PORT).toBe(3001);
    });

    it('JWT_PUBLIC_KEYが未設定の場合、エラーを投げる', async () => {
      // JWT_PUBLIC_KEYのみ未設定
      delete process.env.JWT_PUBLIC_KEY;
      process.env.JWT_PRIVATE_KEY = mockPrivateKeyBase64;
      process.env.TWO_FACTOR_ENCRYPTION_KEY = mock2FAKey;

      const { validateEnv } = await import('../../../config/env.js');

      expect(() => validateEnv()).toThrow('Failed to validate environment variables');
    });

    it('JWT_PRIVATE_KEYが未設定の場合、エラーを投げる', async () => {
      process.env.JWT_PUBLIC_KEY = mockPublicKeyBase64;
      delete process.env.JWT_PRIVATE_KEY;
      process.env.TWO_FACTOR_ENCRYPTION_KEY = mock2FAKey;

      const { validateEnv } = await import('../../../config/env.js');

      expect(() => validateEnv()).toThrow('Failed to validate environment variables');
    });

    it('TWO_FACTOR_ENCRYPTION_KEYが未設定の場合、エラーを投げる', async () => {
      process.env.JWT_PUBLIC_KEY = mockPublicKeyBase64;
      process.env.JWT_PRIVATE_KEY = mockPrivateKeyBase64;
      delete process.env.TWO_FACTOR_ENCRYPTION_KEY;

      const { validateEnv } = await import('../../../config/env.js');

      expect(() => validateEnv()).toThrow('Failed to validate environment variables');
    });

    it('JWT_PUBLIC_KEYが無効なBase64形式の場合、エラーを投げる', async () => {
      process.env.JWT_PUBLIC_KEY = 'invalid_base64!!!';
      process.env.JWT_PRIVATE_KEY = mockPrivateKeyBase64;
      process.env.TWO_FACTOR_ENCRYPTION_KEY = mock2FAKey;

      const { validateEnv } = await import('../../../config/env.js');

      expect(() => validateEnv()).toThrow('Failed to validate environment variables');
    });

    it('JWT_PUBLIC_KEYが正しいBase64だがJWK形式でない場合、エラーを投げる', async () => {
      const invalidJWK = Buffer.from(JSON.stringify({ invalid: 'jwk' })).toString('base64');
      process.env.JWT_PUBLIC_KEY = invalidJWK;
      process.env.JWT_PRIVATE_KEY = mockPrivateKeyBase64;
      process.env.TWO_FACTOR_ENCRYPTION_KEY = mock2FAKey;

      const { validateEnv } = await import('../../../config/env.js');

      expect(() => validateEnv()).toThrow('Failed to validate environment variables');
    });

    it('JWT_PRIVATE_KEYに秘密鍵(d)が含まれていない場合、エラーを投げる', async () => {
      // 秘密鍵の'd'フィールドがないJWK
      const publicOnlyJWK = {
        kty: 'OKP',
        crv: 'Ed25519',
        x: 'mock_public_key_base64',
        kid: 'mock-key-id',
      };
      const publicOnlyBase64 = Buffer.from(JSON.stringify(publicOnlyJWK)).toString('base64');

      process.env.JWT_PUBLIC_KEY = mockPublicKeyBase64;
      process.env.JWT_PRIVATE_KEY = publicOnlyBase64;
      process.env.TWO_FACTOR_ENCRYPTION_KEY = mock2FAKey;

      const { validateEnv } = await import('../../../config/env.js');

      expect(() => validateEnv()).toThrow('Failed to validate environment variables');
    });

    it('TWO_FACTOR_ENCRYPTION_KEYが64文字でない場合、エラーを投げる', async () => {
      process.env.JWT_PUBLIC_KEY = mockPublicKeyBase64;
      process.env.JWT_PRIVATE_KEY = mockPrivateKeyBase64;
      process.env.TWO_FACTOR_ENCRYPTION_KEY = '0123456789abcdef'; // 16文字のみ

      const { validateEnv } = await import('../../../config/env.js');

      expect(() => validateEnv()).toThrow('Failed to validate environment variables');
    });

    it('TWO_FACTOR_ENCRYPTION_KEYに16進数以外の文字が含まれる場合、エラーを投げる', async () => {
      process.env.JWT_PUBLIC_KEY = mockPublicKeyBase64;
      process.env.JWT_PRIVATE_KEY = mockPrivateKeyBase64;
      process.env.TWO_FACTOR_ENCRYPTION_KEY =
        '0123456789abcdefGHIJKLMNOPQRSTUVWXYZ0123456789abcdef0123456789ab'; // 64文字だが非16進数

      const { validateEnv } = await import('../../../config/env.js');

      expect(() => validateEnv()).toThrow('Failed to validate environment variables');
    });

    it('PORTが範囲外の場合、エラーを投げる', async () => {
      process.env.JWT_PUBLIC_KEY = mockPublicKeyBase64;
      process.env.JWT_PRIVATE_KEY = mockPrivateKeyBase64;
      process.env.TWO_FACTOR_ENCRYPTION_KEY = mock2FAKey;
      process.env.PORT = '99999'; // 範囲外

      const { validateEnv } = await import('../../../config/env.js');

      expect(() => validateEnv()).toThrow('Failed to validate environment variables');
    });

    it('NODE_ENVが不正な値の場合、エラーを投げる', async () => {
      process.env.JWT_PUBLIC_KEY = mockPublicKeyBase64;
      process.env.JWT_PRIVATE_KEY = mockPrivateKeyBase64;
      process.env.TWO_FACTOR_ENCRYPTION_KEY = mock2FAKey;
      // @ts-expect-error - Testing invalid NODE_ENV value
      process.env.NODE_ENV = 'invalid_env';

      const { validateEnv } = await import('../../../config/env.js');

      expect(() => validateEnv()).toThrow('Failed to validate environment variables');
    });

    it('シングルトンパターンが正しく動作する（2回目の呼び出しはキャッシュを返す）', async () => {
      process.env.JWT_PUBLIC_KEY = mockPublicKeyBase64;
      process.env.JWT_PRIVATE_KEY = mockPrivateKeyBase64;
      process.env.TWO_FACTOR_ENCRYPTION_KEY = mock2FAKey;

      const { validateEnv } = await import('../../../config/env.js');

      const result1 = validateEnv();
      const result2 = validateEnv();

      // 同じオブジェクトが返される
      expect(result1).toBe(result2);
    });

    it('production環境でDATABASE_URLが未設定の場合、エラーを投げる', async () => {
      process.env.JWT_PUBLIC_KEY = mockPublicKeyBase64;
      process.env.JWT_PRIVATE_KEY = mockPrivateKeyBase64;
      process.env.TWO_FACTOR_ENCRYPTION_KEY = mock2FAKey;
      process.env.NODE_ENV = 'production';
      delete process.env.DATABASE_URL;
      delete process.env.REDIS_URL;

      const { validateEnv } = await import('../../../config/env.js');

      expect(() => validateEnv()).toThrow('Failed to validate environment variables');
    });

    it('production環境でREDIS_URLが未設定の場合、エラーを投げる', async () => {
      process.env.JWT_PUBLIC_KEY = mockPublicKeyBase64;
      process.env.JWT_PRIVATE_KEY = mockPrivateKeyBase64;
      process.env.TWO_FACTOR_ENCRYPTION_KEY = mock2FAKey;
      process.env.NODE_ENV = 'production';
      process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/db';
      delete process.env.REDIS_URL;

      const { validateEnv } = await import('../../../config/env.js');

      expect(() => validateEnv()).toThrow('Failed to validate environment variables');
    });

    it('production環境でDATABASE_URLとREDIS_URLが設定されている場合、検証に成功する', async () => {
      process.env.JWT_PUBLIC_KEY = mockPublicKeyBase64;
      process.env.JWT_PRIVATE_KEY = mockPrivateKeyBase64;
      process.env.TWO_FACTOR_ENCRYPTION_KEY = mock2FAKey;
      process.env.NODE_ENV = 'production';
      process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/db';
      process.env.REDIS_URL = 'redis://localhost:6379';

      const { validateEnv } = await import('../../../config/env.js');

      const result = validateEnv();

      expect(result).toBeDefined();
      expect(result.NODE_ENV).toBe('production');
      expect(result.DATABASE_URL).toBe('postgresql://user:pass@localhost:5432/db');
      expect(result.REDIS_URL).toBe('redis://localhost:6379');
    });

    it('test環境でDATABASE_URLとREDIS_URLが未設定でも検証に成功する', async () => {
      process.env.JWT_PUBLIC_KEY = mockPublicKeyBase64;
      process.env.JWT_PRIVATE_KEY = mockPrivateKeyBase64;
      process.env.TWO_FACTOR_ENCRYPTION_KEY = mock2FAKey;
      process.env.NODE_ENV = 'test';
      delete process.env.DATABASE_URL;
      delete process.env.REDIS_URL;

      const { validateEnv } = await import('../../../config/env.js');

      const result = validateEnv();

      expect(result).toBeDefined();
      expect(result.NODE_ENV).toBe('test');
    });

    it('development環境でDATABASE_URLとREDIS_URLが未設定でも検証に成功する', async () => {
      process.env.JWT_PUBLIC_KEY = mockPublicKeyBase64;
      process.env.JWT_PRIVATE_KEY = mockPrivateKeyBase64;
      process.env.TWO_FACTOR_ENCRYPTION_KEY = mock2FAKey;
      process.env.NODE_ENV = 'development';
      delete process.env.DATABASE_URL;
      delete process.env.REDIS_URL;

      const { validateEnv } = await import('../../../config/env.js');

      const result = validateEnv();

      expect(result).toBeDefined();
      expect(result.NODE_ENV).toBe('development');
    });

    it('JWT_PUBLIC_KEY_OLDが未設定でも検証に成功する（オプショナル）', async () => {
      process.env.JWT_PUBLIC_KEY = mockPublicKeyBase64;
      process.env.JWT_PRIVATE_KEY = mockPrivateKeyBase64;
      process.env.TWO_FACTOR_ENCRYPTION_KEY = mock2FAKey;
      delete process.env.JWT_PUBLIC_KEY_OLD;

      const { validateEnv } = await import('../../../config/env.js');

      const result = validateEnv();

      expect(result).toBeDefined();
      expect(result.JWT_PUBLIC_KEY_OLD).toBeUndefined();
    });

    it('JWT_PUBLIC_KEY_OLDが有効なBase64エンコードされたEd25519 JWKの場合、検証に成功する', async () => {
      process.env.JWT_PUBLIC_KEY = mockPublicKeyBase64;
      process.env.JWT_PRIVATE_KEY = mockPrivateKeyBase64;
      process.env.TWO_FACTOR_ENCRYPTION_KEY = mock2FAKey;
      process.env.JWT_PUBLIC_KEY_OLD = mockPublicKeyBase64;

      const { validateEnv } = await import('../../../config/env.js');

      const result = validateEnv();

      expect(result).toBeDefined();
      expect(result.JWT_PUBLIC_KEY_OLD).toBe(mockPublicKeyBase64);
    });

    it('JWT_PUBLIC_KEY_OLDが無効なBase64形式の場合、エラーを投げる', async () => {
      process.env.JWT_PUBLIC_KEY = mockPublicKeyBase64;
      process.env.JWT_PRIVATE_KEY = mockPrivateKeyBase64;
      process.env.TWO_FACTOR_ENCRYPTION_KEY = mock2FAKey;
      process.env.JWT_PUBLIC_KEY_OLD = 'invalid_base64!!!';

      const { validateEnv } = await import('../../../config/env.js');

      expect(() => validateEnv()).toThrow('Failed to validate environment variables');
    });

    it('JWT_PUBLIC_KEY_OLDが正しいBase64だがJWK形式でない場合、エラーを投げる', async () => {
      const invalidJWK = Buffer.from(JSON.stringify({ invalid: 'jwk' })).toString('base64');
      process.env.JWT_PUBLIC_KEY = mockPublicKeyBase64;
      process.env.JWT_PRIVATE_KEY = mockPrivateKeyBase64;
      process.env.TWO_FACTOR_ENCRYPTION_KEY = mock2FAKey;
      process.env.JWT_PUBLIC_KEY_OLD = invalidJWK;

      const { validateEnv } = await import('../../../config/env.js');

      expect(() => validateEnv()).toThrow('Failed to validate environment variables');
    });
  });

  describe('getEnv', () => {
    it('validateEnv()が呼ばれた後、正しく環境変数を返す', async () => {
      process.env.JWT_PUBLIC_KEY = mockPublicKeyBase64;
      process.env.JWT_PRIVATE_KEY = mockPrivateKeyBase64;
      process.env.TWO_FACTOR_ENCRYPTION_KEY = mock2FAKey;
      process.env.PORT = '4000';

      const { validateEnv, getEnv } = await import('../../../config/env.js');

      validateEnv();
      const result = getEnv();

      expect(result).toBeDefined();
      expect(result.PORT).toBe(4000);
    });

    it('validateEnv()が呼ばれていない場合、エラーを投げる', async () => {
      // 新しいモジュールインスタンスを取得
      vi.resetModules();
      const { getEnv } = await import('../../../config/env.js');

      expect(() => getEnv()).toThrow('Environment not validated. Call validateEnv() first.');
    });
  });

  describe('デフォルト値', () => {
    it('PORTが未設定の場合、デフォルト3000が使用される', async () => {
      process.env.JWT_PUBLIC_KEY = mockPublicKeyBase64;
      process.env.JWT_PRIVATE_KEY = mockPrivateKeyBase64;
      process.env.TWO_FACTOR_ENCRYPTION_KEY = mock2FAKey;
      delete process.env.PORT;

      const { validateEnv } = await import('../../../config/env.js');

      const result = validateEnv();

      expect(result.PORT).toBe(3000);
    });

    it('NODE_ENVが未設定の場合、デフォルトdevelopmentが使用される', async () => {
      process.env.JWT_PUBLIC_KEY = mockPublicKeyBase64;
      process.env.JWT_PRIVATE_KEY = mockPrivateKeyBase64;
      process.env.TWO_FACTOR_ENCRYPTION_KEY = mock2FAKey;
      delete process.env.NODE_ENV;

      const { validateEnv } = await import('../../../config/env.js');

      const result = validateEnv();

      expect(result.NODE_ENV).toBe('development');
    });

    it('FRONTEND_URLが未設定の場合、デフォルトhttp://localhost:5173が使用される', async () => {
      process.env.JWT_PUBLIC_KEY = mockPublicKeyBase64;
      process.env.JWT_PRIVATE_KEY = mockPrivateKeyBase64;
      process.env.TWO_FACTOR_ENCRYPTION_KEY = mock2FAKey;
      delete process.env.FRONTEND_URL;

      const { validateEnv } = await import('../../../config/env.js');

      const result = validateEnv();

      expect(result.FRONTEND_URL).toBe('http://localhost:5173');
    });

    it('LOG_LEVELが未設定の場合、デフォルトinfoが使用される', async () => {
      process.env.JWT_PUBLIC_KEY = mockPublicKeyBase64;
      process.env.JWT_PRIVATE_KEY = mockPrivateKeyBase64;
      process.env.TWO_FACTOR_ENCRYPTION_KEY = mock2FAKey;
      delete process.env.LOG_LEVEL;

      const { validateEnv } = await import('../../../config/env.js');

      const result = validateEnv();

      expect(result.LOG_LEVEL).toBe('info');
    });
  });
});
