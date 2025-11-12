/**
 * 認証関連の型定義
 *
 * このファイルは、フロントエンド認証機能で使用される型定義を提供します。
 */

/**
 * ユーザープロフィール情報
 */
export interface UserProfile {
  id: string;
  email: string;
  displayName: string;
  roles: string[];
  emailVerified: boolean;
  twoFactorEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * ログインフォームデータ
 */
export interface LoginFormData {
  email: string;
  password: string;
}

/**
 * ログイン結果
 */
export interface LoginResult {
  type: 'SUCCESS' | '2FA_REQUIRED';
  userId?: string;
  user?: UserProfile;
  accessToken?: string;
}

/**
 * ユーザー登録フォームデータ
 */
export interface RegisterFormData {
  invitationToken: string;
  displayName: string;
  password: string;
  passwordConfirm: string;
  agreedToTerms: boolean;
}

/**
 * パスワードリセット要求フォームデータ
 */
export interface PasswordResetRequestFormData {
  email: string;
}

/**
 * パスワードリセット実行フォームデータ
 */
export interface PasswordResetFormData {
  resetToken: string;
  password: string;
  passwordConfirm: string;
}

/**
 * フォームバリデーションエラー
 */
export interface FormValidationError {
  field: string;
  message: string;
}

/**
 * パスワード強度レベル
 */
export type PasswordStrength = 'weak' | 'fair' | 'good' | 'strong' | 'very-strong';

/**
 * パスワード強度評価結果
 */
export interface PasswordStrengthResult {
  strength: PasswordStrength;
  score: number; // 0-4
  feedback: string[];
}

/**
 * パスワード要件チェック結果
 */
export interface PasswordRequirements {
  minLength: boolean; // 12文字以上
  hasUppercase: boolean; // 大文字を含む
  hasLowercase: boolean; // 小文字を含む
  hasNumber: boolean; // 数字を含む
  hasSpecialChar: boolean; // 特殊文字を含む
  complexity: boolean; // 3種類以上
}

/**
 * 招待トークン検証結果
 */
export interface InvitationVerificationResult {
  valid: boolean;
  email?: string;
  error?: string;
}

/**
 * API エラーレスポンス
 */
export interface ApiErrorResponse {
  error: string;
  message: string;
  statusCode: number;
  details?: FormValidationError[];
}

/**
 * プロフィール更新フォームデータ
 */
export interface UpdateProfileFormData {
  displayName: string;
}

/**
 * パスワード変更フォームデータ
 */
export interface ChangePasswordFormData {
  currentPassword: string;
  newPassword: string;
  newPasswordConfirm: string;
}

/**
 * セッション情報
 */
export interface SessionInfo {
  id: string;
  userId: string;
  deviceInfo?: string;
  expiresAt: string;
  createdAt: string;
}

/**
 * ユーザー登録データ（API用）
 */
export interface RegisterData {
  displayName: string;
  password: string;
}

/**
 * 認証レスポンス（登録、2FA検証、トークンリフレッシュ）
 */
export interface AuthResponse {
  accessToken: string;
  user: UserProfile;
}

/**
 * プロフィール更新データ（API用）
 */
export interface UpdateProfileData {
  displayName?: string;
}

/**
 * ログインレスポンス
 */
export interface LoginResponse {
  type: 'SUCCESS' | '2FA_REQUIRED';
  accessToken?: string;
  userId?: string;
  user?: UserProfile;
}
