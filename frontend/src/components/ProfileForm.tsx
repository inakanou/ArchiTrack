import { useState, FormEvent } from 'react';
import type {
  UserProfile,
  UpdateProfileFormData,
  ChangePasswordFormData,
  PasswordStrengthResult,
  PasswordRequirements,
} from '../types/auth.types';
import PasswordStrengthIndicator from './PasswordStrengthIndicator';

interface ProfileFormProps {
  user: UserProfile;
  onUpdateProfile: (data: UpdateProfileFormData) => Promise<void>;
  onChangePassword: (data: ChangePasswordFormData) => Promise<void>;
}

/**
 * プロフィールフォーム
 *
 * ユーザーがプロフィール情報を編集し、パスワードを変更するためのフォームです。
 *
 * 要件14: プロフィール画面のUI/UX
 */
function ProfileForm({ user, onUpdateProfile, onChangePassword }: ProfileFormProps) {
  // プロフィール編集状態
  const [displayName, setDisplayName] = useState(user.displayName);
  const [isProfileModified, setIsProfileModified] = useState(false);
  const [isProfileLoading, setIsProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [profileSuccess, setProfileSuccess] = useState('');

  // パスワード変更状態
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newPasswordConfirm, setNewPasswordConfirm] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showNewPasswordConfirm, setShowNewPasswordConfirm] = useState(false);
  const [passwordErrors, setPasswordErrors] = useState<Record<string, string>>({});
  const [isPasswordLoading, setIsPasswordLoading] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [showPasswordConfirmDialog, setShowPasswordConfirmDialog] = useState(false);

  // パスワード要件チェック
  const checkPasswordRequirements = (pwd: string): PasswordRequirements => {
    return {
      minLength: pwd.length >= 12,
      hasUppercase: /[A-Z]/.test(pwd),
      hasLowercase: /[a-z]/.test(pwd),
      hasNumber: /\d/.test(pwd),
      hasSpecialChar: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(pwd),
      complexity:
        [
          /[A-Z]/.test(pwd),
          /[a-z]/.test(pwd),
          /\d/.test(pwd),
          /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(pwd),
        ].filter(Boolean).length >= 3,
    };
  };

  // パスワード強度評価（簡易実装）
  const evaluatePasswordStrength = (pwd: string): PasswordStrengthResult => {
    if (!pwd) {
      return { strength: 'weak', score: 0, feedback: [] };
    }

    const requirements = checkPasswordRequirements(pwd);
    const feedback: string[] = [];

    if (!requirements.minLength) {
      feedback.push('パスワードは12文字以上にしてください');
    }
    if (!requirements.hasUppercase) {
      feedback.push('大文字を含めてください');
    }
    if (!requirements.hasLowercase) {
      feedback.push('小文字を含めてください');
    }
    if (!requirements.hasNumber) {
      feedback.push('数字を含めてください');
    }
    if (!requirements.hasSpecialChar) {
      feedback.push('特殊文字を含めてください');
    }
    if (!requirements.complexity) {
      feedback.push('3種類以上の文字種を含めてください');
    }

    // スコア計算
    let score = 0;
    if (requirements.minLength) score += 1;
    if (requirements.complexity) score += 1;
    if (requirements.hasUppercase && requirements.hasLowercase) score += 1;
    if (requirements.hasNumber && requirements.hasSpecialChar) score += 1;

    // 強度レベル判定
    let strength: PasswordStrengthResult['strength'] = 'weak';
    if (score === 4) strength = 'very-strong';
    else if (score === 3) strength = 'strong';
    else if (score === 2) strength = 'good';
    else if (score === 1) strength = 'fair';

    return { strength, score, feedback };
  };

  const newPasswordStrengthResult = evaluatePasswordStrength(newPassword);
  const newPasswordRequirements = checkPasswordRequirements(newPassword);

  // 表示名変更ハンドラ
  const handleDisplayNameChange = (value: string) => {
    setDisplayName(value);
    setIsProfileModified(value !== user.displayName);
  };

  // プロフィール保存
  const handleSaveProfile = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!displayName.trim()) {
      setProfileError('表示名は必須です');
      return;
    }

    setProfileError('');
    setProfileSuccess('');
    setIsProfileLoading(true);

    try {
      await onUpdateProfile({ displayName: displayName.trim() });
      setProfileSuccess('プロフィールを更新しました');
      setIsProfileModified(false);

      // 成功メッセージを3秒後に非表示
      setTimeout(() => setProfileSuccess(''), 3000);
    } catch (error) {
      setProfileError(error instanceof Error ? error.message : 'プロフィールの更新に失敗しました');
    } finally {
      setIsProfileLoading(false);
    }
  };

  // パスワードバリデーション
  const validatePasswords = (): boolean => {
    const errors: Record<string, string> = {};

    if (!currentPassword) {
      errors.currentPassword = '現在のパスワードは必須です';
    }

    if (!newPassword) {
      errors.newPassword = '新しいパスワードは必須です';
    } else if (newPassword.length < 12) {
      errors.newPassword = 'パスワードは12文字以上である必要があります';
    }

    if (!newPasswordConfirm) {
      errors.newPasswordConfirm = 'パスワード確認は必須です';
    } else if (newPassword !== newPasswordConfirm) {
      errors.newPasswordConfirm = 'パスワードが一致しません';
    }

    setPasswordErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // パスワード変更ボタンクリック
  const handlePasswordChangeClick = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!validatePasswords()) {
      return;
    }

    // 確認ダイアログを表示
    setShowPasswordConfirmDialog(true);
  };

  // パスワード変更確定
  const handlePasswordChangeConfirm = async () => {
    setShowPasswordConfirmDialog(false);
    setPasswordError('');
    setIsPasswordLoading(true);

    try {
      await onChangePassword({
        currentPassword,
        newPassword,
        newPasswordConfirm,
      });
      // パスワード変更成功後、親コンポーネントがログイン画面へリダイレクト
    } catch (error) {
      setPasswordError(error instanceof Error ? error.message : 'パスワードの変更に失敗しました');
    } finally {
      setIsPasswordLoading(false);
    }
  };

  // パスワード変更キャンセル
  const handlePasswordChangeCancel = () => {
    setShowPasswordConfirmDialog(false);
  };

  return (
    <div style={{ maxWidth: '768px', margin: '0 auto', padding: '20px' }}>
      <h1 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '24px' }}>
        プロフィール設定
      </h1>

      {/* ユーザー情報セクション */}
      <section
        style={{
          backgroundColor: '#ffffff',
          border: '1px solid #e5e7eb',
          borderRadius: '8px',
          padding: '24px',
          marginBottom: '24px',
        }}
      >
        <h2 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '16px' }}>ユーザー情報</h2>

        <form onSubmit={handleSaveProfile}>
          {/* メールアドレス（読み取り専用） */}
          <div style={{ marginBottom: '16px' }}>
            <label
              htmlFor="email"
              style={{ display: 'block', marginBottom: '8px', fontWeight: '500' }}
            >
              メールアドレス
            </label>
            <input
              type="email"
              id="email"
              value={user.email}
              readOnly
              style={{
                width: '100%',
                padding: '8px 12px',
                border: '1px solid #d1d5db',
                borderRadius: '4px',
                backgroundColor: '#f9fafb',
                color: '#6b7280',
                cursor: 'not-allowed',
              }}
              aria-label="メールアドレス（読み取り専用）"
            />
          </div>

          {/* 表示名（編集可能） */}
          <div style={{ marginBottom: '16px' }}>
            <label
              htmlFor="displayName"
              style={{ display: 'block', marginBottom: '8px', fontWeight: '500' }}
            >
              表示名
            </label>
            <input
              type="text"
              id="displayName"
              value={displayName}
              onChange={(e) => handleDisplayNameChange(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px',
                border: '1px solid #d1d5db',
                borderRadius: '4px',
              }}
              aria-label="表示名"
            />
          </div>

          {/* ロール表示 */}
          <div style={{ marginBottom: '16px' }}>
            <label
              htmlFor="roles"
              style={{ display: 'block', marginBottom: '8px', fontWeight: '500' }}
            >
              ロール
            </label>
            <input
              type="text"
              id="roles"
              value={user.roles.join(', ')}
              readOnly
              style={{
                width: '100%',
                padding: '8px 12px',
                border: '1px solid #d1d5db',
                borderRadius: '4px',
                backgroundColor: '#f9fafb',
                color: '#6b7280',
                cursor: 'not-allowed',
              }}
              aria-label="ロール（読み取り専用）"
            />
          </div>

          {/* 作成日時表示 */}
          <div style={{ marginBottom: '16px' }}>
            <label
              htmlFor="createdAt"
              style={{ display: 'block', marginBottom: '8px', fontWeight: '500' }}
            >
              作成日時
            </label>
            <input
              type="text"
              id="createdAt"
              value={new Date(user.createdAt).toLocaleString('ja-JP')}
              readOnly
              style={{
                width: '100%',
                padding: '8px 12px',
                border: '1px solid #d1d5db',
                borderRadius: '4px',
                backgroundColor: '#f9fafb',
                color: '#6b7280',
                cursor: 'not-allowed',
              }}
              aria-label="作成日時（読み取り専用）"
            />
          </div>

          {/* エラー・成功メッセージ */}
          {profileError && (
            <div
              role="alert"
              aria-live="polite"
              style={{
                padding: '12px',
                marginBottom: '16px',
                backgroundColor: '#fef2f2',
                color: '#991b1b',
                borderRadius: '4px',
                border: '1px solid #fecaca',
              }}
            >
              {profileError}
            </div>
          )}

          {profileSuccess && (
            <div
              role="status"
              aria-live="polite"
              style={{
                padding: '12px',
                marginBottom: '16px',
                backgroundColor: '#f0fdf4',
                color: '#166534',
                borderRadius: '4px',
                border: '1px solid #bbf7d0',
              }}
            >
              {profileSuccess}
            </div>
          )}

          {/* 保存ボタン */}
          <button
            type="submit"
            disabled={!isProfileModified || isProfileLoading}
            style={{
              width: '100%',
              padding: '10px',
              backgroundColor: isProfileModified && !isProfileLoading ? '#2563eb' : '#9ca3af',
              color: '#ffffff',
              border: 'none',
              borderRadius: '4px',
              fontSize: '16px',
              fontWeight: '500',
              cursor: isProfileModified && !isProfileLoading ? 'pointer' : 'not-allowed',
              opacity: isProfileLoading ? 0.7 : 1,
            }}
            aria-label={isProfileLoading ? '保存中...' : '保存'}
          >
            {isProfileLoading ? '保存中...' : '保存'}
          </button>
        </form>
      </section>

      {/* パスワード変更セクション */}
      <section
        style={{
          backgroundColor: '#ffffff',
          border: '1px solid #e5e7eb',
          borderRadius: '8px',
          padding: '24px',
        }}
      >
        <h2 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '16px' }}>
          パスワード変更
        </h2>

        <form onSubmit={handlePasswordChangeClick}>
          {/* 現在のパスワード */}
          <div style={{ marginBottom: '16px' }}>
            <label
              htmlFor="currentPassword"
              style={{ display: 'block', marginBottom: '8px', fontWeight: '500' }}
            >
              現在のパスワード
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type={showCurrentPassword ? 'text' : 'password'}
                id="currentPassword"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 40px 8px 12px',
                  border: `1px solid ${passwordErrors.currentPassword ? '#ef4444' : '#d1d5db'}`,
                  borderRadius: '4px',
                }}
                aria-invalid={!!passwordErrors.currentPassword}
                aria-describedby={
                  passwordErrors.currentPassword ? 'currentPassword-error' : undefined
                }
              />
              <button
                type="button"
                onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                style={{
                  position: 'absolute',
                  right: '8px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '4px',
                }}
                aria-label={showCurrentPassword ? 'パスワードを非表示' : 'パスワードを表示'}
              >
                {showCurrentPassword ? '👁️' : '👁️‍🗨️'}
              </button>
            </div>
            {passwordErrors.currentPassword && (
              <p
                id="currentPassword-error"
                style={{ marginTop: '4px', fontSize: '14px', color: '#ef4444' }}
              >
                {passwordErrors.currentPassword}
              </p>
            )}
          </div>

          {/* 新しいパスワード */}
          <div style={{ marginBottom: '16px' }}>
            <label
              htmlFor="newPassword"
              style={{ display: 'block', marginBottom: '8px', fontWeight: '500' }}
            >
              新しいパスワード
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type={showNewPassword ? 'text' : 'password'}
                id="newPassword"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 40px 8px 12px',
                  border: `1px solid ${passwordErrors.newPassword ? '#ef4444' : '#d1d5db'}`,
                  borderRadius: '4px',
                }}
                aria-invalid={!!passwordErrors.newPassword}
                aria-describedby={passwordErrors.newPassword ? 'newPassword-error' : undefined}
              />
              <button
                type="button"
                onClick={() => setShowNewPassword(!showNewPassword)}
                style={{
                  position: 'absolute',
                  right: '8px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '4px',
                }}
                aria-label={showNewPassword ? 'パスワードを非表示' : 'パスワードを表示'}
              >
                {showNewPassword ? '👁️' : '👁️‍🗨️'}
              </button>
            </div>
            {passwordErrors.newPassword && (
              <p
                id="newPassword-error"
                style={{ marginTop: '4px', fontSize: '14px', color: '#ef4444' }}
              >
                {passwordErrors.newPassword}
              </p>
            )}

            {/* パスワード強度インジケーター */}
            {newPassword && (
              <div style={{ marginTop: '8px' }}>
                <PasswordStrengthIndicator
                  result={newPasswordStrengthResult}
                  requirements={newPasswordRequirements}
                />
              </div>
            )}
          </div>

          {/* パスワード確認 */}
          <div style={{ marginBottom: '16px' }}>
            <label
              htmlFor="newPasswordConfirm"
              style={{ display: 'block', marginBottom: '8px', fontWeight: '500' }}
            >
              新しいパスワード（確認）
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type={showNewPasswordConfirm ? 'text' : 'password'}
                id="newPasswordConfirm"
                value={newPasswordConfirm}
                onChange={(e) => setNewPasswordConfirm(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 40px 8px 12px',
                  border: `1px solid ${passwordErrors.newPasswordConfirm ? '#ef4444' : '#d1d5db'}`,
                  borderRadius: '4px',
                }}
                aria-invalid={!!passwordErrors.newPasswordConfirm}
                aria-describedby={
                  passwordErrors.newPasswordConfirm ? 'newPasswordConfirm-error' : undefined
                }
              />
              <button
                type="button"
                onClick={() => setShowNewPasswordConfirm(!showNewPasswordConfirm)}
                style={{
                  position: 'absolute',
                  right: '8px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '4px',
                }}
                aria-label={showNewPasswordConfirm ? 'パスワードを非表示' : 'パスワードを表示'}
              >
                {showNewPasswordConfirm ? '👁️' : '👁️‍🗨️'}
              </button>
            </div>
            {passwordErrors.newPasswordConfirm && (
              <p
                id="newPasswordConfirm-error"
                style={{ marginTop: '4px', fontSize: '14px', color: '#ef4444' }}
              >
                {passwordErrors.newPasswordConfirm}
              </p>
            )}
          </div>

          {/* エラーメッセージ */}
          {passwordError && (
            <div
              role="alert"
              aria-live="polite"
              style={{
                padding: '12px',
                marginBottom: '16px',
                backgroundColor: '#fef2f2',
                color: '#991b1b',
                borderRadius: '4px',
                border: '1px solid #fecaca',
              }}
            >
              {passwordError}
            </div>
          )}

          {/* パスワード変更ボタン */}
          <button
            type="submit"
            disabled={isPasswordLoading}
            style={{
              width: '100%',
              padding: '10px',
              backgroundColor: isPasswordLoading ? '#9ca3af' : '#dc2626',
              color: '#ffffff',
              border: 'none',
              borderRadius: '4px',
              fontSize: '16px',
              fontWeight: '500',
              cursor: isPasswordLoading ? 'not-allowed' : 'pointer',
              opacity: isPasswordLoading ? 0.7 : 1,
            }}
            aria-label={isPasswordLoading ? 'パスワード変更中...' : 'パスワードを変更'}
          >
            {isPasswordLoading ? 'パスワード変更中...' : 'パスワードを変更'}
          </button>
        </form>
      </section>

      {/* パスワード変更確認ダイアログ */}
      {showPasswordConfirmDialog && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="password-change-dialog-title"
        >
          <div
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '8px',
              padding: '24px',
              maxWidth: '400px',
              width: '90%',
            }}
          >
            <h3
              id="password-change-dialog-title"
              style={{ fontSize: '18px', fontWeight: '600', marginBottom: '16px' }}
            >
              パスワード変更の確認
            </h3>
            <p style={{ marginBottom: '16px', color: '#4b5563' }}>
              パスワードを変更すると、全てのデバイスからログアウトされます。
              続行してもよろしいですか？
            </p>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                onClick={handlePasswordChangeCancel}
                style={{
                  flex: 1,
                  padding: '10px',
                  backgroundColor: '#f3f4f6',
                  color: '#374151',
                  border: '1px solid #d1d5db',
                  borderRadius: '4px',
                  fontSize: '16px',
                  fontWeight: '500',
                  cursor: 'pointer',
                }}
              >
                キャンセル
              </button>
              <button
                onClick={handlePasswordChangeConfirm}
                style={{
                  flex: 1,
                  padding: '10px',
                  backgroundColor: '#dc2626',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '4px',
                  fontSize: '16px',
                  fontWeight: '500',
                  cursor: 'pointer',
                }}
              >
                変更する
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ProfileForm;
