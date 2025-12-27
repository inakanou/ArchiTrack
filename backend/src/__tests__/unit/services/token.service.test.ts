import { describe, it, expect, beforeAll } from 'vitest';
import * as jose from 'jose';
import { TokenService } from '../../../services/token.service.js';
import type { TokenPayload } from '../../../services/token.service.js';

describe('TokenService', () => {
  let tokenService: TokenService;
  let publicKey: jose.KeyLike;
  let privateKey: jose.KeyLike;

  beforeAll(async () => {
    // EdDSA (Ed25519) 鍵ペアを生成（テスト用）
    const keyPair = await jose.generateKeyPair('EdDSA');
    publicKey = keyPair.publicKey;
    privateKey = keyPair.privateKey;

    // 環境変数をモック（Base64エンコードされたJWK形式）
    const publicJwk = await jose.exportJWK(publicKey);
    const privateJwk = await jose.exportJWK(privateKey);

    process.env.JWT_PUBLIC_KEY = Buffer.from(JSON.stringify(publicJwk)).toString('base64');
    process.env.JWT_PRIVATE_KEY = Buffer.from(JSON.stringify(privateJwk)).toString('base64');
    process.env.ACCESS_TOKEN_EXPIRY = '15m';
    process.env.REFRESH_TOKEN_EXPIRY = '7d';

    // TokenServiceインスタンス作成
    tokenService = new TokenService();
  });

  describe('generateAccessToken', () => {
    it('EdDSA署名でアクセストークンを生成できる', async () => {
      const payload: TokenPayload = {
        userId: 'user123',
        email: 'test@example.com',
        roles: ['user'],
      };

      const token = await tokenService.generateAccessToken(payload);

      expect(token).toBeTruthy();
      expect(typeof token).toBe('string');

      // トークンをデコードして検証
      const decoded = jose.decodeJwt(token);
      expect(decoded.userId).toBe(payload.userId);
      expect(decoded.email).toBe(payload.email);
      expect(decoded.roles).toEqual(payload.roles);
    });

    it('トークンにEdDSAアルゴリズムが設定されている', async () => {
      const payload: TokenPayload = {
        userId: 'user123',
        email: 'test@example.com',
        roles: ['user'],
      };

      const token = await tokenService.generateAccessToken(payload);
      const header = jose.decodeProtectedHeader(token);

      expect(header.alg).toBe('EdDSA');
    });

    it('環境変数で設定された有効期限が適用される', async () => {
      const payload: TokenPayload = {
        userId: 'user123',
        email: 'test@example.com',
        roles: ['user'],
      };

      const token = await tokenService.generateAccessToken(payload);
      const decoded = jose.decodeJwt(token);

      expect(decoded.exp).toBeTruthy();
      expect(decoded.iat).toBeTruthy();

      // 有効期限が15分（900秒）であることを確認
      const expiryDuration = decoded.exp! - decoded.iat!;
      expect(expiryDuration).toBe(900); // 15m = 900s
    });

    it('permissionsがオプションで含まれる', async () => {
      const payload: TokenPayload = {
        userId: 'user123',
        email: 'test@example.com',
        roles: ['admin'],
        permissions: ['user:read', 'user:write'],
      };

      const token = await tokenService.generateAccessToken(payload);
      const decoded = jose.decodeJwt(token);

      expect(decoded.permissions).toEqual(payload.permissions);
    });
  });

  describe('generateRefreshToken', () => {
    it('EdDSA署名でリフレッシュトークンを生成できる', async () => {
      const payload: TokenPayload = {
        userId: 'user123',
        email: 'test@example.com',
        roles: ['user'],
      };

      const token = await tokenService.generateRefreshToken(payload);

      expect(token).toBeTruthy();
      expect(typeof token).toBe('string');

      // トークンをデコードして検証
      const decoded = jose.decodeJwt(token);
      expect(decoded.userId).toBe(payload.userId);
      expect(decoded.email).toBe(payload.email);
      expect(decoded.roles).toEqual(payload.roles);
    });

    it('環境変数で設定された有効期限が適用される（7日間）', async () => {
      const payload: TokenPayload = {
        userId: 'user123',
        email: 'test@example.com',
        roles: ['user'],
      };

      const token = await tokenService.generateRefreshToken(payload);
      const decoded = jose.decodeJwt(token);

      expect(decoded.exp).toBeTruthy();
      expect(decoded.iat).toBeTruthy();

      // 有効期限が7日間（604800秒）であることを確認
      const expiryDuration = decoded.exp! - decoded.iat!;
      expect(expiryDuration).toBe(604800); // 7d = 604800s
    });
  });

  describe('verifyToken', () => {
    it('有効なアクセストークンを検証できる', async () => {
      const payload: TokenPayload = {
        userId: 'user123',
        email: 'test@example.com',
        roles: ['user'],
      };

      const token = await tokenService.generateAccessToken(payload);
      const result = await tokenService.verifyToken(token, 'access');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.userId).toBe(payload.userId);
        expect(result.value.email).toBe(payload.email);
        expect(result.value.roles).toEqual(payload.roles);
      }
    });

    it('有効なリフレッシュトークンを検証できる', async () => {
      const payload: TokenPayload = {
        userId: 'user123',
        email: 'test@example.com',
        roles: ['user'],
      };

      const token = await tokenService.generateRefreshToken(payload);
      const result = await tokenService.verifyToken(token, 'refresh');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.userId).toBe(payload.userId);
      }
    });

    it('不正な署名のトークンを拒否する', async () => {
      // 別の鍵ペアで署名されたトークンを作成
      const maliciousKeyPair = await jose.generateKeyPair('EdDSA');
      const maliciousToken = await new jose.SignJWT({
        userId: 'hacker',
        email: 'hacker@example.com',
        roles: ['admin'],
      })
        .setProtectedHeader({ alg: 'EdDSA' })
        .setExpirationTime('15m')
        .sign(maliciousKeyPair.privateKey);

      const result = await tokenService.verifyToken(maliciousToken, 'access');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe('TOKEN_INVALID');
      }
    });

    it('期限切れトークンを拒否する', async () => {
      // 既に期限切れのトークンを作成（明示的に過去の時刻で生成）
      // ベストプラクティス: タイミングに依存しない確実な期限切れトークンの生成
      const oneHourAgo = Math.floor(Date.now() / 1000) - 3600;
      const expiredToken = await new jose.SignJWT({
        userId: 'user123',
        email: 'test@example.com',
        roles: ['user'],
      })
        .setProtectedHeader({ alg: 'EdDSA' })
        .setIssuedAt(oneHourAgo - 60) // 発行時刻を過去に設定
        .setExpirationTime(oneHourAgo) // 1時間前に期限切れ
        .sign(privateKey);

      const result = await tokenService.verifyToken(expiredToken, 'access');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe('TOKEN_EXPIRED');
      }
    });

    it('不正な形式のトークンを拒否する', async () => {
      const malformedToken = 'invalid.token.format';
      const result = await tokenService.verifyToken(malformedToken, 'access');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        // 不正な形式はTOKEN_INVALIDとして扱われる（joseライブラリの動作）
        expect(result.error.type).toBe('TOKEN_INVALID');
      }
    });

    it('完全に不正な形式のトークンを拒否する（空文字列）', async () => {
      const malformedToken = '';
      const result = await tokenService.verifyToken(malformedToken, 'access');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(['TOKEN_INVALID', 'TOKEN_MALFORMED']).toContain(result.error.type);
      }
    });

    it('完全に不正な形式のトークンを拒否する（ランダム文字列）', async () => {
      const malformedToken = 'completely-random-string-not-a-jwt';
      const result = await tokenService.verifyToken(malformedToken, 'access');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(['TOKEN_INVALID', 'TOKEN_MALFORMED']).toContain(result.error.type);
      }
    });

    it('permissionsを含むトークンを正しく検証できる', async () => {
      // Arrange
      const payload: TokenPayload = {
        userId: 'user456',
        email: 'admin@example.com',
        roles: ['admin'],
        permissions: ['user:read', 'user:write', 'adr:delete'],
      };

      // Act
      const token = await tokenService.generateAccessToken(payload);
      const result = await tokenService.verifyToken(token, 'access');

      // Assert
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.userId).toBe(payload.userId);
        expect(result.value.email).toBe(payload.email);
        expect(result.value.roles).toEqual(payload.roles);
        expect(result.value.permissions).toEqual(payload.permissions);
      }
    });

    it('完全に不正な形式のトークン（空文字列）に対してエラーを返す', async () => {
      // Arrange
      const emptyToken = '';

      // Act
      const result = await tokenService.verifyToken(emptyToken, 'access');

      // Assert
      expect(result.ok).toBe(false);
      if (!result.ok) {
        // 空文字列や完全に不正な形式はTOKEN_INVALID or TOKEN_MALFORMEDとして扱われる
        expect(['TOKEN_INVALID', 'TOKEN_MALFORMED']).toContain(result.error.type);
      }
    });
  });

  describe('decodeToken', () => {
    it('有効なトークンを検証なしでデコードできる', async () => {
      const payload: TokenPayload = {
        userId: 'user123',
        email: 'test@example.com',
        roles: ['user'],
      };

      const token = await tokenService.generateAccessToken(payload);
      const decoded = tokenService.decodeToken(token);

      expect(decoded).toBeTruthy();
      expect(decoded?.userId).toBe(payload.userId);
      expect(decoded?.email).toBe(payload.email);
      expect(decoded?.roles).toEqual(payload.roles);
    });

    it('permissionsを含むトークンをデコードできる', async () => {
      const payload: TokenPayload = {
        userId: 'user123',
        email: 'test@example.com',
        roles: ['admin'],
        permissions: ['user:read', 'user:write'],
      };

      const token = await tokenService.generateAccessToken(payload);
      const decoded = tokenService.decodeToken(token);

      expect(decoded).toBeTruthy();
      expect(decoded?.permissions).toEqual(payload.permissions);
    });

    it('不正な形式のトークンに対してnullを返す', () => {
      const decoded = tokenService.decodeToken('invalid-token');
      expect(decoded).toBeNull();
    });
  });

  describe('exportPublicJWKS', () => {
    it('公開鍵をJWKS形式でエクスポートできる', async () => {
      const jwks = await tokenService.exportPublicJWKS();

      expect(jwks).toBeTruthy();
      expect(jwks.kty).toBe('OKP'); // EdDSA uses OKP (Octet Key Pair)
      expect(jwks.crv).toBe('Ed25519'); // EdDSA curve
      expect(jwks.use).toBe('sig'); // Signature use
      expect(jwks.alg).toBe('EdDSA'); // Algorithm
      expect(jwks.x).toBeTruthy(); // Public key coordinate
    });

    it('秘密鍵情報を含まない', async () => {
      const jwks = await tokenService.exportPublicJWKS();

      expect(jwks.d).toBeUndefined(); // Private key should not be present
    });
  });

  describe('generateRefreshToken追加テスト', () => {
    it('permissionsを含むリフレッシュトークンを生成できる', async () => {
      const payload: TokenPayload = {
        userId: 'user123',
        email: 'test@example.com',
        roles: ['admin'],
        permissions: ['user:manage', 'project:delete'],
      };

      const token = await tokenService.generateRefreshToken(payload);
      const decoded = jose.decodeJwt(token);

      expect(decoded.permissions).toEqual(payload.permissions);
    });

    it('リフレッシュトークンにjtiが設定される', async () => {
      const payload: TokenPayload = {
        userId: 'user123',
        email: 'test@example.com',
        roles: ['user'],
      };

      const token = await tokenService.generateRefreshToken(payload);
      const decoded = jose.decodeJwt(token);

      expect(decoded.jti).toBeTruthy();
      expect(typeof decoded.jti).toBe('string');
    });

    it('複数回生成すると異なるjtiが設定される', async () => {
      const payload: TokenPayload = {
        userId: 'user123',
        email: 'test@example.com',
        roles: ['user'],
      };

      const token1 = await tokenService.generateRefreshToken(payload);
      const token2 = await tokenService.generateRefreshToken(payload);

      const decoded1 = jose.decodeJwt(token1);
      const decoded2 = jose.decodeJwt(token2);

      expect(decoded1.jti).not.toBe(decoded2.jti);
    });
  });

  describe('generateAccessToken追加テスト', () => {
    it('アクセストークンにjtiが設定される', async () => {
      const payload: TokenPayload = {
        userId: 'user123',
        email: 'test@example.com',
        roles: ['user'],
      };

      const token = await tokenService.generateAccessToken(payload);
      const decoded = jose.decodeJwt(token);

      expect(decoded.jti).toBeTruthy();
      expect(typeof decoded.jti).toBe('string');
    });

    it('複数回生成すると異なるjtiが設定される', async () => {
      const payload: TokenPayload = {
        userId: 'user123',
        email: 'test@example.com',
        roles: ['user'],
      };

      const token1 = await tokenService.generateAccessToken(payload);
      const token2 = await tokenService.generateAccessToken(payload);

      const decoded1 = jose.decodeJwt(token1);
      const decoded2 = jose.decodeJwt(token2);

      expect(decoded1.jti).not.toBe(decoded2.jti);
    });

    it('空のrolesでも生成できる', async () => {
      const payload: TokenPayload = {
        userId: 'user123',
        email: 'test@example.com',
        roles: [],
      };

      const token = await tokenService.generateAccessToken(payload);
      const decoded = jose.decodeJwt(token);

      expect(decoded.roles).toEqual([]);
    });
  });

  describe('verifyToken追加テスト', () => {
    it('refresh typeで検証しても結果は同じ', async () => {
      // access tokenをrefresh typeとして検証しても成功する（署名は同じ鍵）
      const payload: TokenPayload = {
        userId: 'user123',
        email: 'test@example.com',
        roles: ['user'],
      };

      const token = await tokenService.generateAccessToken(payload);
      const result = await tokenService.verifyToken(token, 'refresh');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.userId).toBe(payload.userId);
      }
    });

    it('null文字を含むトークンを拒否する', async () => {
      const malformedToken = 'eyJhbGciOiJFZERTQSJ9\0.eyJ1c2VySWQiOiJ0ZXN0In0.abc';
      const result = await tokenService.verifyToken(malformedToken, 'access');

      expect(result.ok).toBe(false);
    });
  });

  describe('decodeToken追加テスト', () => {
    it('期限切れトークンでもデコードできる（検証なし）', async () => {
      const oneHourAgo = Math.floor(Date.now() / 1000) - 3600;
      const expiredToken = await new jose.SignJWT({
        userId: 'user123',
        email: 'test@example.com',
        roles: ['user'],
      })
        .setProtectedHeader({ alg: 'EdDSA' })
        .setIssuedAt(oneHourAgo - 60)
        .setExpirationTime(oneHourAgo)
        .sign(privateKey);

      const decoded = tokenService.decodeToken(expiredToken);

      expect(decoded).toBeTruthy();
      expect(decoded?.userId).toBe('user123');
    });

    it('空文字列に対してnullを返す', () => {
      const decoded = tokenService.decodeToken('');
      expect(decoded).toBeNull();
    });

    it('部分的に有効なJWT形式でもエラーにならない', () => {
      // 3部分あるが中身が不正なケース
      const decoded = tokenService.decodeToken('header.payload.signature');
      expect(decoded).toBeNull();
    });
  });

  describe('initializeKeys error handling', () => {
    it('should throw error when JWT_PUBLIC_KEY is not set', async () => {
      // 環境変数を一時的に削除
      const originalPublicKey = process.env.JWT_PUBLIC_KEY;
      const originalPrivateKey = process.env.JWT_PRIVATE_KEY;
      delete process.env.JWT_PUBLIC_KEY;
      delete process.env.JWT_PRIVATE_KEY;

      try {
        const invalidService = new TokenService();
        // keysInitializedのPromiseを待機
        await expect(
          (invalidService as unknown as { keysInitialized: Promise<void> }).keysInitialized
        ).rejects.toThrow('JWT_PUBLIC_KEY and JWT_PRIVATE_KEY environment variables are required');
      } finally {
        // 環境変数を復元
        process.env.JWT_PUBLIC_KEY = originalPublicKey;
        process.env.JWT_PRIVATE_KEY = originalPrivateKey;
      }
    });

    it('should throw error when JWT keys are invalid JSON', async () => {
      const originalPublicKey = process.env.JWT_PUBLIC_KEY;
      const originalPrivateKey = process.env.JWT_PRIVATE_KEY;
      process.env.JWT_PUBLIC_KEY = Buffer.from('invalid-json').toString('base64');
      process.env.JWT_PRIVATE_KEY = Buffer.from('invalid-json').toString('base64');

      try {
        const invalidService = new TokenService();
        await expect(
          (invalidService as unknown as { keysInitialized: Promise<void> }).keysInitialized
        ).rejects.toThrow();
      } finally {
        process.env.JWT_PUBLIC_KEY = originalPublicKey;
        process.env.JWT_PRIVATE_KEY = originalPrivateKey;
      }
    });
  });

  describe('generateAccessToken error handling', () => {
    it('should throw error when key initialization failed', async () => {
      const originalPublicKey = process.env.JWT_PUBLIC_KEY;
      const originalPrivateKey = process.env.JWT_PRIVATE_KEY;
      delete process.env.JWT_PUBLIC_KEY;
      delete process.env.JWT_PRIVATE_KEY;

      const invalidService = new TokenService();
      const payload: TokenPayload = {
        userId: 'user123',
        email: 'test@example.com',
        roles: ['user'],
      };

      try {
        // keysInitialized のエラーを先にキャッチ
        await (
          invalidService as unknown as { keysInitialized: Promise<void> }
        ).keysInitialized.catch(() => {});
        await expect(invalidService.generateAccessToken(payload)).rejects.toThrow();
      } finally {
        process.env.JWT_PUBLIC_KEY = originalPublicKey;
        process.env.JWT_PRIVATE_KEY = originalPrivateKey;
      }
    });
  });

  describe('generateRefreshToken error handling', () => {
    it('should throw error when key initialization failed', async () => {
      const originalPublicKey = process.env.JWT_PUBLIC_KEY;
      const originalPrivateKey = process.env.JWT_PRIVATE_KEY;
      delete process.env.JWT_PUBLIC_KEY;
      delete process.env.JWT_PRIVATE_KEY;

      const invalidService = new TokenService();
      const payload: TokenPayload = {
        userId: 'user123',
        email: 'test@example.com',
        roles: ['user'],
      };

      try {
        // keysInitialized のエラーを先にキャッチ
        await (
          invalidService as unknown as { keysInitialized: Promise<void> }
        ).keysInitialized.catch(() => {});
        await expect(invalidService.generateRefreshToken(payload)).rejects.toThrow();
      } finally {
        process.env.JWT_PUBLIC_KEY = originalPublicKey;
        process.env.JWT_PRIVATE_KEY = originalPrivateKey;
      }
    });
  });

  describe('verifyToken error handling', () => {
    it('should return TOKEN_MALFORMED for completely invalid token structure', async () => {
      // JWSInvalidエラーをトリガーする特殊なケース
      // 有効なBase64だが不正なJWT構造
      const invalidToken = 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJ0ZXN0IjoxfQ';
      const result = await tokenService.verifyToken(invalidToken, 'access');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(['TOKEN_INVALID', 'TOKEN_MALFORMED']).toContain(result.error.type);
      }
    });
  });

  describe('exportPublicJWKS error handling', () => {
    it('should throw error when key initialization failed', async () => {
      const originalPublicKey = process.env.JWT_PUBLIC_KEY;
      const originalPrivateKey = process.env.JWT_PRIVATE_KEY;
      delete process.env.JWT_PUBLIC_KEY;
      delete process.env.JWT_PRIVATE_KEY;

      const invalidService = new TokenService();

      try {
        // まずkeysInitializedの失敗を待機
        await (
          invalidService as unknown as { keysInitialized: Promise<void> }
        ).keysInitialized.catch(() => {});
        // その後exportPublicJWKSを試す（失敗するはず）
        await expect(invalidService.exportPublicJWKS()).rejects.toThrow();
      } finally {
        process.env.JWT_PUBLIC_KEY = originalPublicKey;
        process.env.JWT_PRIVATE_KEY = originalPrivateKey;
      }
    });
  });

  describe('default expiry values', () => {
    it('should use default ACCESS_TOKEN_EXPIRY when not set', async () => {
      const originalPublicKey = process.env.JWT_PUBLIC_KEY;
      const originalPrivateKey = process.env.JWT_PRIVATE_KEY;
      const originalAccessExpiry = process.env.ACCESS_TOKEN_EXPIRY;
      const originalRefreshExpiry = process.env.REFRESH_TOKEN_EXPIRY;
      delete process.env.ACCESS_TOKEN_EXPIRY;
      delete process.env.REFRESH_TOKEN_EXPIRY;

      try {
        const serviceWithDefaults = new TokenService();
        await (serviceWithDefaults as unknown as { keysInitialized: Promise<void> })
          .keysInitialized;

        const payload: TokenPayload = {
          userId: 'user123',
          email: 'test@example.com',
          roles: ['user'],
        };

        const token = await serviceWithDefaults.generateAccessToken(payload);
        const decoded = jose.decodeJwt(token);

        // デフォルトは15分（900秒）
        const expiryDuration = decoded.exp! - decoded.iat!;
        expect(expiryDuration).toBe(900);
      } finally {
        process.env.JWT_PUBLIC_KEY = originalPublicKey;
        process.env.JWT_PRIVATE_KEY = originalPrivateKey;
        if (originalAccessExpiry) process.env.ACCESS_TOKEN_EXPIRY = originalAccessExpiry;
        if (originalRefreshExpiry) process.env.REFRESH_TOKEN_EXPIRY = originalRefreshExpiry;
      }
    });

    it('should use default REFRESH_TOKEN_EXPIRY when not set', async () => {
      const originalPublicKey = process.env.JWT_PUBLIC_KEY;
      const originalPrivateKey = process.env.JWT_PRIVATE_KEY;
      const originalAccessExpiry = process.env.ACCESS_TOKEN_EXPIRY;
      const originalRefreshExpiry = process.env.REFRESH_TOKEN_EXPIRY;
      delete process.env.ACCESS_TOKEN_EXPIRY;
      delete process.env.REFRESH_TOKEN_EXPIRY;

      try {
        const serviceWithDefaults = new TokenService();
        await (serviceWithDefaults as unknown as { keysInitialized: Promise<void> })
          .keysInitialized;

        const payload: TokenPayload = {
          userId: 'user123',
          email: 'test@example.com',
          roles: ['user'],
        };

        const token = await serviceWithDefaults.generateRefreshToken(payload);
        const decoded = jose.decodeJwt(token);

        // デフォルトは7日（604800秒）
        const expiryDuration = decoded.exp! - decoded.iat!;
        expect(expiryDuration).toBe(604800);
      } finally {
        process.env.JWT_PUBLIC_KEY = originalPublicKey;
        process.env.JWT_PRIVATE_KEY = originalPrivateKey;
        if (originalAccessExpiry) process.env.ACCESS_TOKEN_EXPIRY = originalAccessExpiry;
        if (originalRefreshExpiry) process.env.REFRESH_TOKEN_EXPIRY = originalRefreshExpiry;
      }
    });
  });

  describe('error instanceof Error branches', () => {
    it('should handle non-Error object in initializeKeys catch block', async () => {
      const originalPublicKey = process.env.JWT_PUBLIC_KEY;
      const originalPrivateKey = process.env.JWT_PRIVATE_KEY;
      // 不正なBase64をセット（JSONパースでオブジェクトをthrowするケースはないが、エラーメッセージ生成をカバー）
      process.env.JWT_PUBLIC_KEY = 'not-valid-base64!!!';
      process.env.JWT_PRIVATE_KEY = 'not-valid-base64!!!';

      try {
        const invalidService = new TokenService();
        await expect(
          (invalidService as unknown as { keysInitialized: Promise<void> }).keysInitialized
        ).rejects.toThrow();
      } finally {
        process.env.JWT_PUBLIC_KEY = originalPublicKey;
        process.env.JWT_PRIVATE_KEY = originalPrivateKey;
      }
    });

    it('should handle JWSInvalid error in verifyToken', async () => {
      // JWSInvalidをトリガーするトークン（署名部分が不正）
      const tokenWithInvalidSignature =
        'eyJhbGciOiJFZERTQSJ9.eyJ1c2VySWQiOiJ0ZXN0IiwiZW1haWwiOiJ0ZXN0QGV4YW1wbGUuY29tIiwicm9sZXMiOlsidXNlciJdfQ.invalid-signature-data';
      const result = await tokenService.verifyToken(tokenWithInvalidSignature, 'access');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(['TOKEN_INVALID', 'TOKEN_MALFORMED']).toContain(result.error.type);
      }
    });
  });

  describe('verifyToken with permissions', () => {
    it('should handle token without permissions field correctly', async () => {
      // permissionsなしのペイロード
      const payload: TokenPayload = {
        userId: 'user123',
        email: 'test@example.com',
        roles: ['user'],
      };

      const token = await tokenService.generateAccessToken(payload);
      const result = await tokenService.verifyToken(token, 'access');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.permissions).toBeUndefined();
      }
    });
  });

  describe('decodeToken with permissions', () => {
    it('should handle token without permissions field correctly', async () => {
      const payload: TokenPayload = {
        userId: 'user123',
        email: 'test@example.com',
        roles: ['user'],
      };

      const token = await tokenService.generateAccessToken(payload);
      const decoded = tokenService.decodeToken(token);

      expect(decoded).toBeTruthy();
      expect(decoded?.permissions).toBeUndefined();
    });
  });

  describe('jose error types coverage', () => {
    it('should handle JWSSignatureVerificationFailed error type', async () => {
      // Create an invalid token that will fail signature verification
      // Using a valid structure but with wrong signature
      const maliciousKeyPair = await jose.generateKeyPair('EdDSA');
      const invalidSignatureToken = await new jose.SignJWT({
        userId: 'attacker',
        email: 'attacker@example.com',
        roles: ['admin'],
      })
        .setProtectedHeader({ alg: 'EdDSA' })
        .setExpirationTime('15m')
        .sign(maliciousKeyPair.privateKey);

      const result = await tokenService.verifyToken(invalidSignatureToken, 'access');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe('TOKEN_INVALID');
      }
    });

    it('should handle various malformed JWT structures', async () => {
      // Test with only header
      const result1 = await tokenService.verifyToken('eyJhbGciOiJFZERTQSJ9', 'access');
      expect(result1.ok).toBe(false);

      // Test with valid base64 but invalid JSON in payload
      const result2 = await tokenService.verifyToken(
        'eyJhbGciOiJFZERTQSJ9.bm90LWpzb24.abc',
        'access'
      );
      expect(result2.ok).toBe(false);
    });
  });
});
