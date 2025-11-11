// 二要素認証関連の型定義

/**
 * 2FA設定開始レスポンス
 */
export interface TwoFactorSetupData {
  secret: string; // Base32エンコード済みTOTP秘密鍵
  qrCodeDataUrl: string; // QRコード画像のData URL
  backupCodes?: string[]; // 初回設定時は未生成
}

/**
 * 2FA有効化レスポンス
 */
export interface TwoFactorEnabledData {
  backupCodes: string[]; // 10個のバックアップコード
}

/**
 * TOTP検証リクエスト
 */
export interface VerifyTOTPRequest {
  totpCode: string; // 6桁のTOTPコード
}

/**
 * バックアップコード検証リクエスト
 */
export interface VerifyBackupCodeRequest {
  backupCode: string; // 8文字英数字のバックアップコード
}

/**
 * 2FA無効化リクエスト
 */
export interface DisableTwoFactorRequest {
  password: string; // 現在のパスワード
}

/**
 * バックアップコード情報
 */
export interface BackupCodeInfo {
  code: string; // バックアップコード（マスク表示用）
  usedAt: string | null; // 使用日時（ISO 8601形式）
  isUsed: boolean; // 使用済みフラグ
}

/**
 * バックアップコード一覧レスポンス
 */
export interface BackupCodesListResult {
  backupCodes: BackupCodeInfo[];
  remainingCount: number; // 未使用コード数
}

/**
 * バックアップコード再生成レスポンス
 */
export interface RegenerateBackupCodesResult {
  backupCodes: string[]; // 新しい10個のバックアップコード
}

/**
 * 2FA設定フォームデータ
 */
export interface TwoFactorSetupFormData {
  totpCode: string; // TOTP検証用の6桁コード
  backupCodesSaved: boolean; // バックアップコード保存確認
}

/**
 * 2FAログインフォームデータ
 */
export interface TwoFactorVerificationFormData {
  code: string; // TOTPコードまたはバックアップコード
  useBackupCode: boolean; // バックアップコード使用フラグ
}

/**
 * 2FA設定ステップ
 */
export type TwoFactorSetupStep = 'qr-code' | 'verify-totp' | 'backup-codes';

/**
 * API エラーレスポンス
 */
export interface ApiErrorResponse {
  error: string;
  message: string;
}

/**
 * 2FA設定結果
 */
export type TwoFactorSetupResult =
  | { success: true; data: TwoFactorSetupData }
  | { success: false; error: string };

/**
 * 2FA有効化結果
 */
export type TwoFactorEnableResult =
  | { success: true; data: TwoFactorEnabledData }
  | { success: false; error: string };

/**
 * TOTP検証結果
 */
export type VerifyTOTPResult = { success: true } | { success: false; error: string };

/**
 * バックアップコード検証結果
 */
export type VerifyBackupCodeResult = { success: true } | { success: false; error: string };

/**
 * 2FA無効化結果
 */
export type DisableTwoFactorResult = { success: true } | { success: false; error: string };

/**
 * バックアップコード再生成結果
 */
export type RegenerateBackupCodesResultType =
  | { success: true; data: RegenerateBackupCodesResult }
  | { success: false; error: string };
