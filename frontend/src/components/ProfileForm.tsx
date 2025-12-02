import React, { useState, useEffect } from 'react';
import type {
  UserProfile,
  UpdateProfileFormData,
  ChangePasswordFormData,
  UpdateProfileResult,
  ChangePasswordResult,
} from '../types/profile.types';

interface ProfileFormProps {
  user: UserProfile;
  onUpdateProfile: (data: UpdateProfileFormData) => Promise<UpdateProfileResult>;
  onChangePassword: (data: ChangePasswordFormData) => Promise<ChangePasswordResult>;
  onNavigateToUserManagement?: () => void;
}

const ProfileForm: React.FC<ProfileFormProps> = ({
  user,
  onUpdateProfile,
  onChangePassword,
  onNavigateToUserManagement,
}) => {
  const [displayName, setDisplayName] = useState(user.displayName);
  const [isProfileChanged, setIsProfileChanged] = useState(false);
  const [isProfileLoading, setIsProfileLoading] = useState(false);
  const [profileMessage, setProfileMessage] = useState('');

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  const isAdmin = user.roles.includes('admin');

  useEffect(() => {
    setIsProfileChanged(displayName !== user.displayName);
  }, [displayName, user.displayName]);

  useEffect(() => {
    if (newPassword && confirmPassword && newPassword !== confirmPassword) {
      setPasswordError('パスワードが一致しません');
    } else {
      setPasswordError('');
    }
  }, [newPassword, confirmPassword]);

  const handleSaveProfile = async () => {
    setIsProfileLoading(true);
    setProfileMessage('');

    try {
      const result = await onUpdateProfile({ displayName });
      setProfileMessage(result.message);
    } catch (error) {
      setProfileMessage(error instanceof Error ? error.message : 'プロフィール更新に失敗しました');
    } finally {
      setIsProfileLoading(false);
    }
  };

  const handleChangePasswordClick = () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      return;
    }
    if (newPassword !== confirmPassword) {
      return;
    }
    setShowConfirmDialog(true);
  };

  const handleConfirmPasswordChange = async () => {
    setShowConfirmDialog(false);

    try {
      await onChangePassword({
        currentPassword,
        newPassword,
        confirmPassword,
      });
    } catch (error) {
      console.error('Password change failed:', error);
    }
  };

  const handleCancelPasswordChange = () => {
    setShowConfirmDialog(false);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toISOString().split('T')[0];
  };

  return (
    <div style={{ maxWidth: '600px', margin: '0 auto', padding: '20px' }}>
      <form
        role="form"
        style={{ maxWidth: '600px' }}
        onSubmit={(e) => {
          e.preventDefault();
        }}
      >
        <h2>プロフィール</h2>

        {/* ユーザー情報セクション */}
        <div style={{ marginBottom: '30px' }}>
          <div style={{ marginBottom: '15px' }}>
            <label htmlFor="email" style={{ display: 'block', marginBottom: '5px' }}>
              メールアドレス
            </label>
            <input
              type="email"
              id="email"
              aria-label="メールアドレス"
              value={user.email}
              readOnly
              style={{
                width: '100%',
                padding: '10px',
                backgroundColor: '#f5f5f5',
                border: '1px solid #ddd',
                borderRadius: '4px',
              }}
            />
          </div>

          <div style={{ marginBottom: '15px' }}>
            <label htmlFor="displayName" style={{ display: 'block', marginBottom: '5px' }}>
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
                padding: '10px',
                border: '1px solid #ddd',
                borderRadius: '4px',
              }}
            />
          </div>

          <div style={{ marginBottom: '15px' }}>
            <label style={{ display: 'block', marginBottom: '5px' }}>ロール</label>
            <div style={{ padding: '10px', backgroundColor: '#f5f5f5', borderRadius: '4px' }}>
              {user.roles.join(', ')}
            </div>
          </div>

          <div style={{ marginBottom: '15px' }}>
            <label style={{ display: 'block', marginBottom: '5px' }}>作成日時</label>
            <div style={{ padding: '10px', backgroundColor: '#f5f5f5', borderRadius: '4px' }}>
              {formatDate(user.createdAt)}
            </div>
          </div>

          {user.twoFactorEnabled && (
            <div style={{ marginBottom: '15px' }}>
              <span
                style={{
                  display: 'inline-block',
                  padding: '5px 10px',
                  backgroundColor: '#4caf50',
                  color: 'white',
                  borderRadius: '4px',
                  fontSize: '14px',
                }}
              >
                2FA有効
              </span>
            </div>
          )}

          <button
            type="button"
            aria-label="プロフィールを保存"
            onClick={handleSaveProfile}
            disabled={!isProfileChanged || isProfileLoading}
            style={{
              padding: '10px 20px',
              backgroundColor: isProfileChanged && !isProfileLoading ? '#2196f3' : '#ccc',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: isProfileChanged && !isProfileLoading ? 'pointer' : 'not-allowed',
            }}
          >
            {isProfileLoading ? <span aria-label="保存中">保存中...</span> : '保存'}
          </button>

          {profileMessage && (
            <div
              role="alert"
              aria-live="polite"
              style={{
                marginTop: '15px',
                padding: '10px',
                backgroundColor: profileMessage.includes('失敗') ? '#f44336' : '#4caf50',
                color: 'white',
                borderRadius: '4px',
              }}
            >
              {profileMessage}
            </div>
          )}

          {isAdmin && onNavigateToUserManagement && (
            <div style={{ marginTop: '20px' }}>
              <a
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  onNavigateToUserManagement();
                }}
                style={{
                  color: '#2196f3',
                  textDecoration: 'none',
                }}
              >
                ユーザー管理
              </a>
            </div>
          )}
        </div>

        {/* パスワード変更セクション */}
        <h3>パスワード変更</h3>

        <div style={{ marginBottom: '30px' }}>
          <div style={{ marginBottom: '15px' }}>
            <label htmlFor="currentPassword" style={{ display: 'block', marginBottom: '5px' }}>
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
                padding: '10px',
                border: '1px solid #ddd',
                borderRadius: '4px',
              }}
            />
          </div>

          <div style={{ marginBottom: '15px' }}>
            <label htmlFor="newPassword" style={{ display: 'block', marginBottom: '5px' }}>
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
                padding: '10px',
                border: '1px solid #ddd',
                borderRadius: '4px',
              }}
            />
          </div>

          <div style={{ marginBottom: '15px' }}>
            <label htmlFor="confirmPassword" style={{ display: 'block', marginBottom: '5px' }}>
              パスワード確認
            </label>
            <input
              type="password"
              id="confirmPassword"
              aria-label="パスワード確認"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              style={{
                width: '100%',
                padding: '10px',
                border: '1px solid #ddd',
                borderRadius: '4px',
              }}
            />
            {passwordError && (
              <div
                role="alert"
                aria-live="polite"
                style={{ marginTop: '5px', color: '#f44336', fontSize: '14px' }}
              >
                {passwordError}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={handleChangePasswordClick}
            disabled={
              !currentPassword ||
              !newPassword ||
              !confirmPassword ||
              newPassword !== confirmPassword
            }
            style={{
              padding: '10px 20px',
              backgroundColor:
                currentPassword && newPassword && confirmPassword && newPassword === confirmPassword
                  ? '#f44336'
                  : '#ccc',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor:
                currentPassword && newPassword && confirmPassword && newPassword === confirmPassword
                  ? 'pointer'
                  : 'not-allowed',
            }}
          >
            パスワード変更
          </button>
        </div>

        {/* パスワード変更確認ダイアログ */}
        {showConfirmDialog && (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="dialog-title"
            style={{
              position: 'fixed',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              backgroundColor: 'white',
              padding: '30px',
              borderRadius: '8px',
              boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
              zIndex: 1000,
            }}
          >
            <h3 id="dialog-title">パスワード変更の確認</h3>
            <p>パスワードを変更すると、全デバイスからログアウトされます。続行しますか？</p>
            <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
              <button
                onClick={handleConfirmPasswordChange}
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#f44336',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                }}
              >
                確認
              </button>
              <button
                onClick={handleCancelPasswordChange}
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#9e9e9e',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                }}
              >
                キャンセル
              </button>
            </div>
          </div>
        )}

        {/* モーダル背景 */}
        {showConfirmDialog && (
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.5)',
              zIndex: 999,
            }}
            onClick={handleCancelPasswordChange}
          />
        )}
      </form>
    </div>
  );
};

export default ProfileForm;
