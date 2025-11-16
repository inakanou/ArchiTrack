import { describe, it, expect, beforeAll } from 'vitest';
import * as jose from 'jose';
import { TokenService } from '../../../services/token.service';
import type { TokenPayload } from '../../../services/token.service';

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
});
