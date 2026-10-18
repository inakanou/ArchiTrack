import * as jose from 'jose';
import type { CryptoKey } from 'jose';
import { randomUUID } from 'crypto';
import { Result, Ok, Err } from '../types/result.js';
import logger from '../utils/logger.js';
import { DEFAULT_JWT_AUDIENCE, DEFAULT_JWT_ISSUER } from '../config/jwt-claims.js';

/**
 * JWTトークンのペイロード情報
 */
export interface TokenPayload {
  userId: string;
  email: string;
  roles: string[];
  permissions?: string[];
}

/**
 * トークンの種別（クレーム token_use の値）
 */
export type TokenKind = 'access' | 'refresh';

/**
 * アクセストークンの JOSE ヘッダーの typ（RFC 9068）
 */
const ACCESS_TOKEN_TYP = 'at+jwt';

/**
 * トークン関連のエラー型
 */
export type TokenError = { type: 'TOKEN_EXPIRED' } | { type: 'TOKEN_INVALID' };

/**
 * TokenService
 *
 * JWT生成、検証、リフレッシュ機能を提供します。
 * EdDSA (Ed25519) 署名アルゴリズムを使用します。
 *
 * 責任と境界:
 * - 主要責任: JWT生成、検証、リフレッシュ（EdDSA署名）
 * - ドメイン境界: トークンドメイン
 * - データ所有権: なし（ステートレス）
 * - トランザクション境界: なし
 *
 * 依存関係:
 * - インバウンド: AuthService, authenticate middleware
 * - アウトバウンド: SessionService
 * - 外部: jose v6
 */
export class TokenService {
  private publicKey!: CryptoKey;
  private privateKey!: CryptoKey;
  private accessTokenExpiry: string;
  private refreshTokenExpiry: string;
  private keysInitialized: Promise<void>;

  constructor() {
    this.accessTokenExpiry = process.env.ACCESS_TOKEN_EXPIRY || '15m';
    this.refreshTokenExpiry = process.env.REFRESH_TOKEN_EXPIRY || '7d';

    // 鍵の初期化（非同期）
    this.keysInitialized = this.initializeKeys().catch((err) => {
      logger.error(
        {
          // c8 ignore next - 防御的コード: jose/Node.js標準ライブラリは常にErrorをthrow
          error: err instanceof Error ? err.message : String(err),
        },
        'Failed to initialize JWT keys'
      );
      throw err;
    });
  }

  /**
   * トークンの発行者（iss）。未設定なら既定値（起動時の検証で空・前後の空白は拒否済み）
   */
  private get issuer(): string {
    return process.env.JWT_ISSUER || DEFAULT_JWT_ISSUER;
  }

  /**
   * トークンの想定利用者（aud）
   */
  private get audience(): string {
    return process.env.JWT_AUDIENCE || DEFAULT_JWT_AUDIENCE;
  }

  /**
   * 種別・発行者・想定利用者のクレームを載せた署名前の JWT を作る（要件33.1〜33.3）
   */
  private buildToken(
    subject: string,
    claims: jose.JWTPayload,
    kind: TokenKind,
    expiry: string
  ): jose.SignJWT {
    return new jose.SignJWT({ ...claims, token_use: kind })
      .setProtectedHeader(
        kind === 'access' ? { alg: 'EdDSA', typ: ACCESS_TOKEN_TYP } : { alg: 'EdDSA' }
      )
      .setSubject(subject)
      .setIssuer(this.issuer)
      .setAudience(this.audience)
      .setJti(randomUUID()) // 一意なトークンIDを設定（重複防止）
      .setIssuedAt()
      .setExpirationTime(expiry);
  }

  /**
   * JWT鍵ペアを初期化
   * 環境変数からBase64エンコードされたJWKを読み込みます
   */
  private async initializeKeys(): Promise<void> {
    try {
      const publicKeyBase64 = process.env.JWT_PUBLIC_KEY;
      const privateKeyBase64 = process.env.JWT_PRIVATE_KEY;

      if (!publicKeyBase64 || !privateKeyBase64) {
        throw new Error('JWT_PUBLIC_KEY and JWT_PRIVATE_KEY environment variables are required');
      }

      // Base64デコードしてJWKを取得
      const publicJwk = JSON.parse(Buffer.from(publicKeyBase64, 'base64').toString('utf-8'));
      const privateJwk = JSON.parse(Buffer.from(privateKeyBase64, 'base64').toString('utf-8'));

      // JWKからCryptoKeyオブジェクトに変換
      this.publicKey = (await jose.importJWK(publicJwk, 'EdDSA')) as CryptoKey;
      this.privateKey = (await jose.importJWK(privateJwk, 'EdDSA')) as CryptoKey;

      logger.info('JWT keys initialized successfully');
    } catch (error) {
      logger.error(
        {
          // c8 ignore next - 防御的コード: jose/Node.js標準ライブラリは常にErrorをthrow
          error: error instanceof Error ? error.message : String(error),
        },
        'Failed to initialize JWT keys'
      );
      throw error;
    }
  }

  /**
   * アクセストークンを生成
   *
   * @param payload トークンペイロード
   * @returns EdDSA署名されたJWTアクセストークン
   *
   * @example
   * ```typescript
   * const token = await tokenService.generateAccessToken({
   *   userId: 'user123',
   *   email: 'test@example.com',
   *   roles: ['user'],
   * });
   * ```
   */
  async generateAccessToken(payload: TokenPayload): Promise<string> {
    // キーの初期化を待つ
    await this.keysInitialized;

    try {
      const token = await this.buildToken(
        payload.userId,
        {
          userId: payload.userId,
          email: payload.email,
          roles: payload.roles,
          ...(payload.permissions && { permissions: payload.permissions }),
        },
        'access',
        this.accessTokenExpiry
      ).sign(this.privateKey);

      return token;
    } catch (error) {
      logger.error(
        {
          // c8 ignore next - 防御的コード: jose/Node.js標準ライブラリは常にErrorをthrow
          error: error instanceof Error ? error.message : String(error),
          userId: payload.userId,
        },
        'Failed to generate access token'
      );
      throw error;
    }
  }

  /**
   * リフレッシュトークンを生成
   *
   * 利用者 ID（sub）と系列 ID（fam）だけを載せ、メールアドレスとロールは載せない。
   * 系列 ID はログインで作り、ローテーションの後継へ引き継ぐ（SessionService が DB の行と結び付ける）。
   *
   * @param userId 利用者 ID
   * @param familyId 系列 ID
   * @returns EdDSA署名されたJWTリフレッシュトークン
   *
   * @example
   * ```typescript
   * const refreshToken = await tokenService.generateRefreshToken('user123', familyId);
   * ```
   */
  async generateRefreshToken(userId: string, familyId: string): Promise<string> {
    // キーの初期化を待つ
    await this.keysInitialized;

    try {
      const token = await this.buildToken(
        userId,
        { fam: familyId },
        'refresh',
        this.refreshTokenExpiry
      ).sign(this.privateKey);

      return token;
    } catch (error) {
      logger.error(
        {
          // c8 ignore next - 防御的コード: jose/Node.js標準ライブラリは常にErrorをthrow
          error: error instanceof Error ? error.message : String(error),
          userId,
        },
        'Failed to generate refresh token'
      );
      throw error;
    }
  }

  /**
   * トークンを検証
   *
   * EdDSA署名と有効期限に加えて、種別（token_use）が期待する種別と一致すること、
   * 発行者（iss）と想定利用者（aud）が本システムであることを確かめる。
   * 種別を持たないトークン（種別の導入より前に発行されたもの）も拒否する（再ログインになる）。
   * 保護 API は 'access'、リフレッシュは 'refresh' で検証する（要件33.1〜33.3）。
   *
   * @param token 検証するJWT
   * @param type 期待するトークンの種別（access or refresh）
   * @returns 検証結果（成功時はペイロード、失敗時はエラー）
   *
   * @example
   * ```typescript
   * const result = await tokenService.verifyToken(token, 'access');
   * if (result.ok) {
   *   const payload = result.value;
   *   console.log('User ID:', payload.userId);
   * } else {
   *   console.error('Token verification failed:', result.error.type);
   * }
   * ```
   */
  async verifyToken(token: string, type: TokenKind): Promise<Result<TokenPayload, TokenError>> {
    // キーの初期化を待つ
    await this.keysInitialized;

    try {
      const { payload } = await jose.jwtVerify(token, this.publicKey, {
        algorithms: ['EdDSA'],
        issuer: this.issuer,
        audience: this.audience,
        ...(type === 'access' && { typ: ACCESS_TOKEN_TYP }),
      });

      // 種別が期待と一致しないトークン（種別を持たないものを含む）は拒否する
      if (payload.token_use !== type) {
        logger.warn({ type }, 'Token type mismatch');
        return Err({ type: 'TOKEN_INVALID' });
      }

      // ペイロードを TokenPayload 型に変換（利用者 ID は sub。リフレッシュトークンはメールアドレスとロールを持たない）
      const tokenPayload: TokenPayload = {
        userId: payload.sub as string,
        email: payload.email as string,
        roles: payload.roles as string[],
      };

      if (payload.permissions) {
        tokenPayload.permissions = payload.permissions as string[];
      }

      return Ok(tokenPayload);
    } catch (error) {
      // エラーの種類を判定
      if (error instanceof jose.errors.JWTExpired) {
        logger.debug({ type }, 'Token expired');
        return Err({ type: 'TOKEN_EXPIRED' });
      }

      if (
        error instanceof jose.errors.JWSSignatureVerificationFailed ||
        error instanceof jose.errors.JWSInvalid
      ) {
        logger.warn({ type }, 'Token signature verification failed');
        return Err({ type: 'TOKEN_INVALID' });
      }

      // 発行者・想定利用者・ヘッダーの typ の不一致（期限切れは上で判定済み）
      if (error instanceof jose.errors.JWTClaimValidationFailed) {
        logger.warn({ type, claim: error.claim }, 'Token claim validation failed');
        return Err({ type: 'TOKEN_INVALID' });
      }

      logger.warn(
        {
          type,
          // c8 ignore next - 防御的コード: jose/Node.js標準ライブラリは常にErrorをthrow
          error: error instanceof Error ? error.message : String(error),
        },
        'Token malformed'
      );
      return Err({ type: 'TOKEN_INVALID' });
    }
  }

  /**
   * トークンをデコード（検証なし）
   *
   * 署名検証や有効期限チェックを行わず、トークンをデコードします。
   * デバッグやロギング目的で使用します。
   *
   * @param token デコードするJWT
   * @returns デコードされたペイロード、または不正な形式の場合はnull
   *
   * @example
   * ```typescript
   * const payload = tokenService.decodeToken(token);
   * if (payload) {
   *   console.log('Token payload:', payload);
   * }
   * ```
   */
  decodeToken(token: string): TokenPayload | null {
    try {
      const decoded = jose.decodeJwt(token);

      const tokenPayload: TokenPayload = {
        userId: (decoded.sub ?? decoded.userId) as string,
        email: decoded.email as string,
        roles: decoded.roles as string[],
      };

      if (decoded.permissions) {
        tokenPayload.permissions = decoded.permissions as string[];
      }

      return tokenPayload;
    } catch (error) {
      logger.debug(
        {
          // c8 ignore next - 防御的コード: jose/Node.js標準ライブラリは常にErrorをthrow
          error: error instanceof Error ? error.message : String(error),
        },
        'Failed to decode token'
      );
      return null;
    }
  }

  /**
   * 公開鍵をJWKS形式でエクスポート
   *
   * /.well-known/jwks.jsonエンドポイントで公開するために使用します。
   *
   * @returns JWKS形式の公開鍵
   *
   * @example
   * ```typescript
   * const jwks = await tokenService.exportPublicJWKS();
   * res.json({ keys: [jwks] });
   * ```
   */
  async exportPublicJWKS(): Promise<jose.JWK> {
    try {
      const jwk = await jose.exportJWK(this.publicKey);

      // JWKSに必要なメタデータを追加
      return {
        ...jwk,
        use: 'sig', // Signature use
        alg: 'EdDSA', // Algorithm
      };
    } catch (error) {
      logger.error(
        {
          // c8 ignore next - 防御的コード: jose/Node.js標準ライブラリは常にErrorをthrow
          error: error instanceof Error ? error.message : String(error),
        },
        'Failed to export public JWKS'
      );
      throw error;
    }
  }
}

// シングルトンインスタンスをエクスポート
const tokenServiceInstance = new TokenService();
export default tokenServiceInstance;
