/**
 * @fileoverview 二要素認証（2FA/TOTP）関連の型定義
 *
 * Requirements:
 * - 27.1-27.8: 二要素認証設定機能
 * - 27C.1-27C.6: 二要素認証セキュリティ要件
 */

/**
 * TwoFactorServiceのインターフェース
 */
export interface ITwoFactorService {
  /**
   * TOTP秘密鍵を生成
   *
   * RFC 6238準拠の32バイト暗号学的乱数を生成し、Base32エンコードして返す。
   *
   * @returns Base32エンコードされたTOTP秘密鍵
   */
  generateTOTPSecret(): string;

  /**
   * TOTP秘密鍵を暗号化
   *
   * AES-256-GCM暗号化を適用してデータベース保存用の暗号化済み文字列を返す。
   *
   * @param secret - Base32エンコードされたTOTP秘密鍵
   * @returns 暗号化済み秘密鍵（Base64エンコード）
   */
  encryptSecret(secret: string): Promise<string>;

  /**
   * TOTP秘密鍵を復号化
   *
   * AES-256-GCM暗号化された秘密鍵を復号化してBase32エンコード文字列を返す。
   *
   * @param encryptedSecret - 暗号化済み秘密鍵（Base64エンコード）
   * @returns Base32エンコードされたTOTP秘密鍵
   */
  decryptSecret(encryptedSecret: string): Promise<string>;

  /**
   * QRコードを生成
   *
   * Google Authenticator互換のotpauth URI形式でQRコードを生成する。
   *
   * @param email - ユーザーのメールアドレス
   * @param secret - Base32エンコードされたTOTP秘密鍵
   * @returns QRコードのData URL（data:image/png;base64,...）
   */
  generateQRCode(email: string, secret: string): Promise<string>;

  /**
   * バックアップコードを生成
   *
   * 10個の8文字英数字ランダムコードを生成する。
   *
   * @returns 10個のバックアップコード配列
   */
  generateBackupCodes(): string[];
}

/**
 * TwoFactorエラー型
 */
export type TwoFactorError =
  | { type: 'ENCRYPTION_KEY_NOT_SET' }
  | { type: 'ENCRYPTION_FAILED'; message: string }
  | { type: 'DECRYPTION_FAILED'; message: string }
  | { type: 'QR_CODE_GENERATION_FAILED'; message: string }
  | { type: 'INVALID_SECRET_FORMAT' };
