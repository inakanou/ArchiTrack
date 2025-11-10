/**
 * @fileoverview 二要素認証（2FA/TOTP）関連の型定義
 *
 * Requirements:
 * - 27.1-27.8: 二要素認証設定機能
 * - 27C.1-27C.6: 二要素認証セキュリティ要件
 * - 27.9-27.10, 27A.3-27A.7, 27B.4-27B.6: 2FA検証・管理機能
 */

/**
 * Result型: 成功（Ok）または失敗（Err）を表現
 * @template T 成功時の値の型
 * @template E 失敗時のエラーの型
 */
export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

/**
 * 成功結果を生成
 */
export function Ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

/**
 * 失敗結果を生成
 */
export function Err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}

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

  /**
   * TOTP検証
   *
   * 30秒ウィンドウ、±1ステップ許容（合計90秒）で検証する。
   *
   * @param userId - ユーザーID
   * @param totpCode - 6桁のTOTPコード
   * @returns 検証成功ならtrue、失敗ならfalse
   */
  verifyTOTP(userId: string, totpCode: string): Promise<Result<boolean, TwoFactorError>>;

  /**
   * バックアップコード検証
   *
   * 未使用のバックアップコードを検証し、使用済みとしてマークする。
   *
   * @param userId - ユーザーID
   * @param backupCode - 8文字のバックアップコード
   * @returns 検証成功ならtrue、失敗ならfalse
   */
  verifyBackupCode(userId: string, backupCode: string): Promise<Result<boolean, TwoFactorError>>;

  /**
   * 2FA有効化
   *
   * TOTP検証後にtwoFactorEnabledをtrueに設定する。
   *
   * @param userId - ユーザーID
   * @param totpCode - 6桁のTOTPコード
   * @returns 2FA有効化データ（バックアップコード）
   */
  enableTwoFactor(
    userId: string,
    totpCode: string
  ): Promise<Result<TwoFactorEnabledData, TwoFactorError>>;

  /**
   * 2FA無効化
   *
   * パスワード確認後、秘密鍵とバックアップコードを削除し、全セッションを無効化する。
   *
   * @param userId - ユーザーID
   * @param password - パスワード（確認用）
   * @returns void
   */
  disableTwoFactor(userId: string, password: string): Promise<Result<void, TwoFactorError>>;

  /**
   * バックアップコード再生成
   *
   * 既存のバックアップコードを全て削除し、新しく10個のバックアップコードを生成する。
   *
   * @param userId - ユーザーID
   * @returns 10個の平文バックアップコード配列（最後の表示機会）
   */
  regenerateBackupCodes(userId: string): Promise<Result<string[], TwoFactorError>>;
}

/**
 * 2FA有効化時のレスポンスデータ
 */
export interface TwoFactorEnabledData {
  backupCodes: string[]; // 平文バックアップコード（最後の表示機会）
}

/**
 * TwoFactorエラー型
 */
export type TwoFactorError =
  | { type: 'ENCRYPTION_KEY_NOT_SET' }
  | { type: 'ENCRYPTION_FAILED'; message: string }
  | { type: 'DECRYPTION_FAILED'; message: string }
  | { type: 'QR_CODE_GENERATION_FAILED'; message: string }
  | { type: 'INVALID_SECRET_FORMAT' }
  | { type: 'USER_NOT_FOUND' }
  | { type: 'TWO_FACTOR_NOT_ENABLED' }
  | { type: 'TWO_FACTOR_ALREADY_ENABLED' }
  | { type: 'INVALID_TOTP_CODE' }
  | { type: 'INVALID_BACKUP_CODE' }
  | { type: 'BACKUP_CODE_ALREADY_USED' }
  | { type: 'INVALID_PASSWORD' };
