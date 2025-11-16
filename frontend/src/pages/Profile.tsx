/**
 * プロフィール画面
 *
 * 要件14: プロフィール画面のUI/UX
 */

import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { apiClient } from '../api/client';
import PasswordStrengthIndicator from '../components/PasswordStrengthIndicator';
import type {
  UpdateProfileFormData,
  ChangePasswordFormData,
  PasswordStrengthResult,
  PasswordRequirements,
  UserProfile,
} from '../types/auth.types';

/**
 * パスワード強度を評価する関数
 */
function evaluatePasswordStrength(password: string): {
  result: PasswordStrengthResult;
  requirements: PasswordRequirements;
} {
  const requirements: PasswordRequirements = {
    minLength: password.length >= 12,
    hasUppercase: /[A-Z]/.test(password),
    hasLowercase: /[a-z]/.test(password),
    hasNumber: /[0-9]/.test(password),
    hasSpecialChar: /[!@#$%^&*(),.?":{}|<>]/.test(password),
    complexity: false,
  };

  // 複雑性: 3種類以上の文字種を含む
  const complexityCount =
    (requirements.hasUppercase ? 1 : 0) +
    (requirements.hasLowercase ? 1 : 0) +
    (requirements.hasNumber ? 1 : 0) +
    (requirements.hasSpecialChar ? 1 : 0);
  requirements.complexity = complexityCount >= 3;

  // スコア計算（0-4）
  let score = 0;
  if (requirements.minLength) score++;
  if (requirements.complexity) score += 2;
  if (password.length >= 16) score++;

  // 強度レベル判定
  let strength: PasswordStrengthResult['strength'] = 'weak';
  if (score >= 4) strength = 'very-strong';
  else if (score >= 3) strength = 'strong';
  else if (score >= 2) strength = 'good';
  else if (score >= 1) strength = 'fair';

  // フィードバック生成
  const feedback: string[] = [];
  if (!requirements.minLength) feedback.push('12文字以上にしてください');
  if (!requirements.complexity)
    feedback.push('大文字、小文字、数字、特殊文字のうち3種類以上を含めてください');
  if (password.length < 16) feedback.push('16文字以上にするとより強固になります');

  return {
    result: {
      strength,
      score,
      feedback,
    },
    requirements,
  };
}

export function Profile() {
  const { user: authUser, logout } = useAuth();

  // UserProfileにキャスト（テスト用）
  const user = authUser as unknown as UserProfile;

  // ユーザー情報編集
  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [isProfileChanged, setIsProfileChanged] = useState(false);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileMessage, setProfileMessage] = useState('');

  // パスワード変更
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newPasswordConfirm, setNewPasswordConfirm] = useState('');
  const [passwordStrength, setPasswordStrength] = useState<{
    result: PasswordStrengthResult;
    requirements: PasswordRequirements;
  } | null>(null);
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState('');

  // モバイル判定
  const isMobile = window.innerWidth < 768;

  // 表示名変更検知
  useEffect(() => {
    setIsProfileChanged(displayName !== user?.displayName);
  }, [displayName, user?.displayName]);

  // 新しいパスワードの強度評価
  useEffect(() => {
    if (newPassword) {
      setPasswordStrength(evaluatePasswordStrength(newPassword));
    } else {
      setPasswordStrength(null);
    }
  }, [newPassword]);

  /**
   * プロフィール保存
   */
  const handleSaveProfile = async () => {
    setProfileLoading(true);
    setProfileMessage('');

    try {
      await apiClient.patch<UserProfile>('/api/v1/auth/me', {
        displayName,
      } as UpdateProfileFormData);

      setProfileMessage('プロフィールを更新しました');
      setIsProfileChanged(false);
    } catch {
      setProfileMessage('プロフィールの更新に失敗しました');
    } finally {
      setProfileLoading(false);
    }
  };

  /**
   * パスワード変更確認ダイアログを表示
   */
  const handleChangePasswordClick = () => {
    if (!currentPassword || !newPassword || !newPasswordConfirm) {
      setPasswordMessage('全てのフィールドを入力してください');
      return;
    }

    if (newPassword !== newPasswordConfirm) {
      setPasswordMessage('新しいパスワードが一致しません');
      return;
    }

    setShowPasswordDialog(true);
  };

  /**
   * パスワード変更を実行
   */
  const handleConfirmPasswordChange = async () => {
    setPasswordLoading(true);
    setPasswordMessage('');
    setShowPasswordDialog(false);

    try {
      await apiClient.post('/api/v1/auth/password/change', {
        currentPassword,
        newPassword,
        newPasswordConfirm,
      } as ChangePasswordFormData);

      setPasswordMessage('パスワードを変更しました');

      // 全デバイスからログアウト
      setTimeout(() => {
        logout();
      }, 2000);
    } catch (error) {
      console.error('Password change error:', error);
      setPasswordMessage('パスワード変更に失敗しました');
    } finally {
      setPasswordLoading(false);
    }
  };

  return (
    <div
      data-testid="profile-container"
      className={isMobile ? 'mobile-optimized' : ''}
      style={{
        maxWidth: '800px',
        margin: '0 auto',
        padding: isMobile ? '1rem' : '2rem',
      }}
    >
      <h1 style={{ fontSize: '2rem', fontWeight: 'bold', marginBottom: '2rem' }}>プロフィール</h1>

      {/* 管理者向けリンク */}
      {user?.roles?.includes('admin') && (
        <div style={{ marginBottom: '2rem' }}>
          <a
            href="/admin/users"
            style={{
              color: '#3b82f6',
              textDecoration: 'underline',
              fontWeight: 500,
            }}
          >
            ユーザー管理
          </a>
        </div>
      )}

      {/* ユーザー情報セクション */}
      <section style={{ marginBottom: '3rem' }}>
        <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '1rem' }}>
          ユーザー情報
        </h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* メールアドレス（読み取り専用） */}
          <div>
            <label
              htmlFor="email"
              style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}
            >
              メールアドレス
            </label>
            <input
              type="email"
              id="email"
              aria-label="メールアドレス"
              value={user?.email || ''}
              readOnly
              style={{
                width: '100%',
                padding: '0.5rem',
                border: '1px solid #d1d5db',
                borderRadius: '0.375rem',
                backgroundColor: '#f9fafb',
              }}
            />
          </div>

          {/* 表示名（編集可能） */}
          <div>
            <label
              htmlFor="displayName"
              style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}
            >
              表示名
            </label>
            <input
              type="text"
              id="displayName"
              aria-label="表示名"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              style={{
                width: '100%',
                padding: '0.5rem',
                border: '1px solid #d1d5db',
                borderRadius: '0.375rem',
              }}
            />
          </div>

          {/* ロール表示 */}
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>
              ロール
            </label>
            <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
              {user?.roles?.join(', ') || '-'}
            </div>
          </div>

          {/* 作成日時表示 */}
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>
              アカウント作成日時
            </label>
            <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
              {user?.createdAt ? new Date(user.createdAt).toLocaleDateString('ja-JP') : ''}
            </div>
          </div>

          {/* 保存ボタン */}
          <button
            onClick={handleSaveProfile}
            disabled={!isProfileChanged || profileLoading}
            aria-label="保存"
            style={{
              padding: '0.5rem 1rem',
              backgroundColor: isProfileChanged ? '#3b82f6' : '#d1d5db',
              color: 'white',
              borderRadius: '0.375rem',
              border: 'none',
              cursor: isProfileChanged ? 'pointer' : 'not-allowed',
              fontWeight: 500,
            }}
          >
            {profileLoading ? '保存中...' : '保存'}
          </button>

          {/* プロフィール更新メッセージ */}
          {profileMessage && (
            <div
              role="alert"
              aria-live="polite"
              style={{
                padding: '0.75rem',
                borderRadius: '0.375rem',
                backgroundColor: profileMessage.includes('成功') ? '#d1fae5' : '#fee2e2',
                color: profileMessage.includes('成功') ? '#065f46' : '#991b1b',
              }}
            >
              {profileMessage}
            </div>
          )}
        </div>
      </section>

      {/* パスワード変更セクション */}
      <section>
        <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '1rem' }}>
          パスワード変更
        </h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* 現在のパスワード */}
          <div>
            <label
              htmlFor="currentPassword"
              style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}
            >
              現在のパスワード
            </label>
            <input
              type="password"
              id="currentPassword"
              aria-label="現在のパスワード"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              style={{
                width: '100%',
                padding: '0.5rem',
                border: '1px solid #d1d5db',
                borderRadius: '0.375rem',
              }}
            />
          </div>

          {/* 新しいパスワード */}
          <div>
            <label
              htmlFor="newPassword"
              style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}
            >
              新しいパスワード
            </label>
            <input
              type="password"
              id="newPassword"
              aria-label="新しいパスワード"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              style={{
                width: '100%',
                padding: '0.5rem',
                border: '1px solid #d1d5db',
                borderRadius: '0.375rem',
              }}
            />

            {/* パスワード強度インジケーター */}
            {passwordStrength && (
              <div data-testid="password-strength-indicator">
                <PasswordStrengthIndicator
                  result={passwordStrength.result}
                  requirements={passwordStrength.requirements}
                />
              </div>
            )}
          </div>

          {/* パスワード確認 */}
          <div>
            <label
              htmlFor="confirmPassword"
              style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}
            >
              新しいパスワード（確認）
            </label>
            <input
              type="password"
              id="confirmPassword"
              aria-label="パスワード確認"
              value={newPasswordConfirm}
              onChange={(e) => setNewPasswordConfirm(e.target.value)}
              style={{
                width: '100%',
                padding: '0.5rem',
                border: '1px solid #d1d5db',
                borderRadius: '0.375rem',
              }}
            />
          </div>

          {/* パスワード変更ボタン */}
          <button
            onClick={handleChangePasswordClick}
            disabled={passwordLoading}
            aria-label="パスワードを変更"
            style={{
              padding: '0.5rem 1rem',
              backgroundColor: '#dc2626',
              color: 'white',
              borderRadius: '0.375rem',
              border: 'none',
              cursor: 'pointer',
              fontWeight: 500,
            }}
          >
            {passwordLoading ? 'パスワード変更中...' : 'パスワードを変更'}
          </button>

          {/* パスワード変更メッセージ */}
          {passwordMessage && (
            <div
              role="alert"
              aria-live="polite"
              style={{
                padding: '0.75rem',
                borderRadius: '0.375rem',
                backgroundColor: passwordMessage.includes('成功') ? '#d1fae5' : '#fee2e2',
                color: passwordMessage.includes('成功') ? '#065f46' : '#991b1b',
              }}
            >
              {passwordMessage}
            </div>
          )}
        </div>
      </section>

      {/* パスワード変更確認ダイアログ */}
      {showPasswordDialog && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
            zIndex: 50,
          }}
        >
          <div
            role="dialog"
            aria-labelledby="password-dialog-title"
            style={{
              backgroundColor: 'white',
              borderRadius: '0.5rem',
              padding: '2rem',
              maxWidth: '500px',
              width: '100%',
            }}
          >
            <h3
              id="password-dialog-title"
              style={{
                fontSize: '1.25rem',
                fontWeight: 'bold',
                marginBottom: '1rem',
              }}
            >
              パスワード変更の確認
            </h3>
            <p style={{ marginBottom: '1.5rem', color: '#6b7280' }}>
              パスワードを変更すると、全デバイスからログアウトされます。続行しますか？
            </p>

            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowPasswordDialog(false)}
                style={{
                  padding: '0.5rem 1rem',
                  backgroundColor: '#f3f4f6',
                  color: '#374151',
                  borderRadius: '0.375rem',
                  border: 'none',
                  cursor: 'pointer',
                  fontWeight: 500,
                }}
              >
                キャンセル
              </button>
              <button
                onClick={handleConfirmPasswordChange}
                aria-label="はい、変更する"
                style={{
                  padding: '0.5rem 1rem',
                  backgroundColor: '#dc2626',
                  color: 'white',
                  borderRadius: '0.375rem',
                  border: 'none',
                  cursor: 'pointer',
                  fontWeight: 500,
                }}
              >
                はい、変更する
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
