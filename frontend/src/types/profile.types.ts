/**
 * プロフィール管理関連の型定義
 */

/**
 * ユーザー情報
 */
export interface UserProfile {
  id: string;
  email: string;
  displayName: string;
  roles: string[];
  createdAt: string;
  twoFactorEnabled: boolean;
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
  confirmPassword: string;
}

/**
 * プロフィール更新結果
 */
export interface UpdateProfileResult {
  success: boolean;
  message: string;
  user?: UserProfile;
}

/**
 * パスワード変更結果
 */
export interface ChangePasswordResult {
  success: boolean;
  message: string;
}

/**
 * パスワード変更確認ダイアログのプロパティ
 */
export interface PasswordChangeConfirmationProps {
  isOpen: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}
