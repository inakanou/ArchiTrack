/**
 * 環境変数バリデーションユーティリティ
 *
 * 要件トレーサビリティ:
 * - 要件2.7: パスワード複雑性要件、禁止パスワードリスト
 * - 要件3.1: 初期管理者アカウント情報
 * - 要件5.9, 5.10: トークン有効期限の環境変数
 * - 要件27C.4, 27C.5: 2FA暗号化鍵
 *
 * @module utils/env-validator
 */

/**
 * バリデーション結果型
 */
export type ValidationResult = { valid: true } | { valid: false; errors: string[] };

/**
 * 環境変数バリデータークラス
 */
export class EnvValidator {
  private errors: string[] = [];

  /**
   * 全ての認証関連環境変数を検証
   */
  validateAuthEnvVars(): ValidationResult {
    this.errors = [];

    // JWT鍵の検証
    this.validateJwtKeys();

    // トークン有効期限の検証
    this.validateTokenExpiry();

    // 2FA暗号化鍵の検証（オプション）
    this.validateTwoFactorKeys();

    return this.errors.length === 0 ? { valid: true } : { valid: false, errors: this.errors };
  }

  /**
   * JWT鍵の検証
   */
  validateJwtKeys(): ValidationResult {
    const jwtErrors: string[] = [];

    // JWT_PUBLIC_KEYの検証
    if (!process.env.JWT_PUBLIC_KEY) {
      jwtErrors.push('JWT_PUBLIC_KEY is required');
    } else {
      // Base64形式の検証
      try {
        const decoded = Buffer.from(process.env.JWT_PUBLIC_KEY, 'base64').toString('utf-8');
        JSON.parse(decoded); // JWK形式の検証
      } catch {
        jwtErrors.push('JWT_PUBLIC_KEY is not valid Base64');
      }
    }

    // JWT_PRIVATE_KEYの検証
    if (!process.env.JWT_PRIVATE_KEY) {
      jwtErrors.push('JWT_PRIVATE_KEY is required');
    } else {
      // Base64形式の検証
      try {
        const decoded = Buffer.from(process.env.JWT_PRIVATE_KEY, 'base64').toString('utf-8');
        JSON.parse(decoded); // JWK形式の検証
      } catch {
        jwtErrors.push('JWT_PRIVATE_KEY is not valid Base64');
      }
    }

    this.errors.push(...jwtErrors);

    return jwtErrors.length === 0 ? { valid: true } : { valid: false, errors: jwtErrors };
  }

  /**
   * 2FA暗号化鍵の検証
   */
  validateTwoFactorKeys(): ValidationResult {
    const twoFactorErrors: string[] = [];

    const key = process.env.TWO_FACTOR_ENCRYPTION_KEY;

    if (!key) {
      // 2FA暗号化鍵はオプション（2FA機能を使用する場合のみ必須）
      return { valid: true };
    }

    // 256ビット（64文字16進数）の検証
    if (key.length !== 64) {
      twoFactorErrors.push('TWO_FACTOR_ENCRYPTION_KEY must be 64 hex characters');
    }

    // 16進数文字のみかチェック
    const hexRegex = /^[0-9a-fA-F]+$/;
    if (!hexRegex.test(key)) {
      twoFactorErrors.push('TWO_FACTOR_ENCRYPTION_KEY must contain only hex characters');
    }

    this.errors.push(...twoFactorErrors);

    return twoFactorErrors.length === 0
      ? { valid: true }
      : { valid: false, errors: twoFactorErrors };
  }

  /**
   * トークン有効期限の検証
   */
  validateTokenExpiry(): ValidationResult {
    const expiryErrors: string[] = [];

    // ACCESS_TOKEN_EXPIRYの検証（デフォルト: 15m）
    const accessExpiry = process.env.ACCESS_TOKEN_EXPIRY || '15m';
    if (!this.isValidTimeString(accessExpiry)) {
      expiryErrors.push('ACCESS_TOKEN_EXPIRY must be a valid time string');
    }

    // REFRESH_TOKEN_EXPIRYの検証（デフォルト: 7d）
    const refreshExpiry = process.env.REFRESH_TOKEN_EXPIRY || '7d';
    if (!this.isValidTimeString(refreshExpiry)) {
      expiryErrors.push('REFRESH_TOKEN_EXPIRY must be a valid time string');
    }

    this.errors.push(...expiryErrors);

    return expiryErrors.length === 0 ? { valid: true } : { valid: false, errors: expiryErrors };
  }

  /**
   * 時間文字列の形式を検証
   * @param timeString - 時間文字列（例: '15m', '1h', '7d'）
   * @returns 有効な時間文字列の場合true
   */
  private isValidTimeString(timeString: string): boolean {
    const timeRegex = /^(\d+)(s|m|h|d|w)$/;
    return timeRegex.test(timeString);
  }
}

/**
 * 環境変数バリデータインスタンスをエクスポート
 */
export const envValidator = new EnvValidator();
