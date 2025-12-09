/**
 * プロフィール画面
 *
 * 要件14: プロフィール画面のUI/UX
 * 要件27B: 二要素認証（2FA）管理機能
 */

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../hooks/useAuth';
import { apiClient } from '../api/client';
import PasswordStrengthIndicator from '../components/PasswordStrengthIndicator';
import type {
  UpdateProfileFormData,
  ChangePasswordFormData,
  PasswordStrengthResult,
  PasswordRequirements,
  UserProfile,
} from '../types/auth.types';
import type { BackupCodeInfo } from '../types/two-factor.types';

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

  // 2FA管理
  const [showBackupCodes, setShowBackupCodes] = useState(false);
  const [backupCodes, setBackupCodes] = useState<BackupCodeInfo[]>([]);
  const [backupCodesLoading, setBackupCodesLoading] = useState(false);
  const [remainingBackupCodesCount, setRemainingBackupCodesCount] = useState<number | null>(null);
  const [showRegenerateDialog, setShowRegenerateDialog] = useState(false);
  const [regenerateLoading, setRegenerateLoading] = useState(false);
  const [regenerateMessage, setRegenerateMessage] = useState('');

  // 2FA無効化（要件27B.4-6）
  const [showDisableDialog, setShowDisableDialog] = useState(false);
  const [showDisableConfirmDialog, setShowDisableConfirmDialog] = useState(false);
  const [disablePassword, setDisablePassword] = useState('');
  const [disableLoading, setDisableLoading] = useState(false);
  const [disableMessage, setDisableMessage] = useState('');
  const [disableError, setDisableError] = useState('');

  // ユーザー情報が更新されたときにdisplayNameを同期
  // displayNameのみを監視して不要な再レンダリングを防止
  useEffect(() => {
    if (user?.displayName) {
      setDisplayName(user.displayName);
    }
  }, [user?.displayName]);

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

  // Escキーでダイアログを閉じる（WCAG 2.1 AA要件: キーボードアクセシビリティ）
  useEffect(() => {
    const handleEscKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (showPasswordDialog) {
          setShowPasswordDialog(false);
        }
        if (showDisableDialog) {
          setShowDisableDialog(false);
          setDisablePassword('');
          setDisableError('');
        }
        if (showDisableConfirmDialog) {
          setShowDisableConfirmDialog(false);
        }
      }
    };

    if (showPasswordDialog || showDisableDialog || showDisableConfirmDialog) {
      document.addEventListener('keydown', handleEscKey);
    }

    return () => {
      document.removeEventListener('keydown', handleEscKey);
    };
  }, [showPasswordDialog, showDisableDialog, showDisableConfirmDialog]);

  // プロフィールメッセージの自動非表示（5秒後）
  useEffect(() => {
    if (profileMessage) {
      const timer = setTimeout(() => {
        setProfileMessage('');
      }, 5000);

      return () => clearTimeout(timer);
    }
    return undefined;
  }, [profileMessage]);

  /**
   * プロフィール保存
   */
  const handleSaveProfile = async () => {
    setProfileLoading(true);
    setProfileMessage('');

    try {
      const response = await apiClient.patch<UserProfile>('/api/v1/auth/me', {
        displayName,
      } as UpdateProfileFormData);

      // ベストプラクティス: レスポンスから最新のユーザー情報を取得してローカルstateを同期
      // これにより、ページリロード時に正しく表示される
      if (response && response.displayName) {
        setDisplayName(response.displayName);
      }

      setProfileMessage('プロフィールを更新しました');
      setIsProfileChanged(false);
    } catch {
      setProfileMessage('プロフィールの更新に失敗しました');
    } finally {
      setProfileLoading(false);
    }
  };

  /**
   * バックアップコードを取得
   */
  const fetchBackupCodes = useCallback(async () => {
    setBackupCodesLoading(true);
    try {
      const response = await apiClient.get<{
        backupCodes: BackupCodeInfo[];
        remainingCount: number;
      }>('/api/v1/auth/2fa/backup-codes');
      setBackupCodes(response.backupCodes);
      setRemainingBackupCodesCount(response.remainingCount);
    } catch {
      console.error('Failed to fetch backup codes');
    } finally {
      setBackupCodesLoading(false);
    }
  }, []);

  /**
   * バックアップコードを表示
   */
  const handleShowBackupCodes = async () => {
    if (!showBackupCodes && backupCodes.length === 0) {
      await fetchBackupCodes();
    }
    setShowBackupCodes(!showBackupCodes);
  };

  /**
   * バックアップコード再生成
   */
  const handleRegenerateBackupCodes = async () => {
    setRegenerateLoading(true);
    setRegenerateMessage('');
    setShowRegenerateDialog(false);
    try {
      const response = await apiClient.post<{
        backupCodes: BackupCodeInfo[];
        remainingCount: number;
      }>('/api/v1/auth/2fa/backup-codes/regenerate');
      setBackupCodes(response.backupCodes);
      setRemainingBackupCodesCount(response.remainingCount);
      setRegenerateMessage('バックアップコードを再生成しました');
    } catch {
      setRegenerateMessage('バックアップコードの再生成に失敗しました');
    } finally {
      setRegenerateLoading(false);
    }
  };

  /**
   * パスワードの複雑性要件をチェックし、エラーメッセージを返す
   */
  const validatePasswordComplexity = (password: string): string | null => {
    // 12文字以上
    if (password.length < 12) {
      return 'パスワードは12文字以上である必要があります';
    }
    // 大文字を含む
    if (!/[A-Z]/.test(password)) {
      return 'パスワードは大文字を1文字以上含む必要があります';
    }
    // 小文字を含む
    if (!/[a-z]/.test(password)) {
      return 'パスワードは小文字を1文字以上含む必要があります';
    }
    // 数字を含む
    if (!/[0-9]/.test(password)) {
      return 'パスワードは数字を1文字以上含む必要があります';
    }
    // 記号を含む
    if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
      return 'パスワードは記号を1文字以上含む必要があります';
    }
    // 連続した同一文字のチェック（3文字以上）
    if (/(.)\1\1/.test(password)) {
      return 'パスワードに3文字以上の連続した同一文字を含めることはできません';
    }
    return null;
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

    // パスワードの複雑性要件をチェック
    const complexityError = validatePasswordComplexity(newPassword);
    if (complexityError) {
      setPasswordMessage(complexityError);
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
      // パスワード変更後はサーバー側でセッションが無効化されているため、
      // トークンリフレッシュを無効化してから即座にログアウト
      setTimeout(() => {
        apiClient.setTokenRefreshCallback(null);
        logout();
      }, 2000);
    } catch (error) {
      console.error('Password change error:', error);
      // エラーレスポンスから詳細メッセージを取得
      const err = error as {
        response?: {
          detail?: string;
          details?: Array<{ path: string; message: string }>;
          error?: string;
        };
      };

      // RFC 7807 Problem Details形式のエラー処理
      if (err?.response?.details && err.response.details.length > 0) {
        const passwordError = err.response.details.find(
          (d) => d.path === 'newPassword' || d.path.includes('password')
        );
        if (passwordError) {
          setPasswordMessage(passwordError.message);
        } else {
          const firstError = err.response.details[0];
          if (firstError) {
            setPasswordMessage(firstError.message);
          }
        }
      } else if (err?.response?.detail) {
        setPasswordMessage(err.response.detail);
      } else if (err?.response?.error) {
        setPasswordMessage(err.response.error);
      } else {
        setPasswordMessage('パスワード変更に失敗しました');
      }
    } finally {
      setPasswordLoading(false);
    }
  };

  /**
   * 2FA無効化ダイアログを開く（要件27B.4）
   */
  const handleOpenDisableDialog = () => {
    setShowDisableDialog(true);
    setDisablePassword('');
    setDisableError('');
  };

  /**
   * パスワード確認後、ログアウト警告ダイアログを表示（要件27B.4）
   */
  const handleDisablePasswordSubmit = async () => {
    if (!disablePassword) {
      setDisableError('パスワードを入力してください');
      return;
    }

    // パスワードダイアログを閉じて、ログアウト警告ダイアログを表示
    setShowDisableDialog(false);
    setShowDisableConfirmDialog(true);
  };

  /**
   * 2FA無効化を実行（要件27B.5-6）
   */
  const handleConfirmDisable = async () => {
    setDisableLoading(true);
    setDisableError('');

    try {
      await apiClient.post('/api/v1/auth/2fa/disable', {
        password: disablePassword,
      });

      setShowDisableConfirmDialog(false);
      setDisableMessage('二要素認証を無効化しました');

      // 要件27B.6: 全デバイスからログアウト
      // 2FA無効化後はサーバー側でセッションが無効化されているため、
      // トークンリフレッシュを無効化してから即座にログアウト
      setTimeout(() => {
        apiClient.setTokenRefreshCallback(null);
        logout();
      }, 2000);
    } catch (error) {
      console.error('2FA disable error:', error);
      setShowDisableConfirmDialog(false);
      setShowDisableDialog(true);

      const err = error as {
        response?: {
          detail?: string;
          error?: string;
        };
      };

      if (err?.response?.detail) {
        setDisableError(err.response.detail);
      } else if (err?.response?.error) {
        setDisableError(err.response.error);
      } else {
        setDisableError('2FAの無効化に失敗しました');
      }
    } finally {
      setDisableLoading(false);
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
        <div
          style={{
            marginBottom: '2rem',
            padding: '1rem',
            backgroundColor: '#eff6ff',
            borderRadius: '0.5rem',
          }}
        >
          <h3
            style={{
              fontSize: '1rem',
              fontWeight: 600,
              marginBottom: '0.75rem',
              color: '#1e40af',
            }}
          >
            管理者メニュー
          </h3>
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
            <a
              href="/admin/audit-logs"
              style={{
                color: '#3b82f6',
                textDecoration: 'underline',
                fontWeight: 500,
              }}
            >
              監査ログ
            </a>
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
            <div style={{ fontSize: '0.875rem', color: '#4b5563' }}>
              {user?.roles?.join(', ') || '-'}
            </div>
          </div>

          {/* 作成日時表示 */}
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>
              アカウント作成日時
            </label>
            <div style={{ fontSize: '0.875rem', color: '#4b5563' }}>
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
              backgroundColor: isProfileChanged ? '#2563eb' : '#d1d5db',
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
                backgroundColor: profileMessage.includes('失敗') ? '#fee2e2' : '#d1fae5',
                color: profileMessage.includes('失敗') ? '#991b1b' : '#065f46',
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
              <PasswordStrengthIndicator
                result={passwordStrength.result}
                requirements={passwordStrength.requirements}
              />
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
                backgroundColor: passwordMessage.includes('失敗') ? '#fee2e2' : '#d1fae5',
                color: passwordMessage.includes('失敗') ? '#991b1b' : '#065f46',
              }}
            >
              {passwordMessage}
            </div>
          )}
        </div>
      </section>

      {/* セキュリティ設定セクション - 要件28.28, 28.31 */}
      <section style={{ marginTop: '2rem' }}>
        <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '1rem' }}>
          セキュリティ設定
        </h2>

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '1rem',
            padding: '1rem',
            backgroundColor: '#f9fafb',
            borderRadius: '0.5rem',
          }}
        >
          {/* 2FA設定リンク - 要件28.28 */}
          <a
            href="/settings/security"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              color: '#2563eb',
              textDecoration: 'underline',
              fontWeight: 500,
            }}
          >
            二要素認証設定
          </a>

          {/* セッション管理リンク - 要件28.31 */}
          <a
            href="/sessions"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              color: '#2563eb',
              textDecoration: 'underline',
              fontWeight: 500,
            }}
          >
            セッション管理
          </a>
        </div>
      </section>

      {/* 二要素認証（2FA）管理セクション - 2FA有効時のみ表示 */}
      {user?.twoFactorEnabled && (
        <section style={{ marginTop: '2rem' }}>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '1rem' }}>
            二要素認証
          </h2>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div
              style={{
                display: 'inline-block',
                padding: '0.5rem 1rem',
                backgroundColor: '#d1fae5',
                color: '#065f46',
                borderRadius: '0.375rem',
                fontSize: '0.875rem',
                width: 'fit-content',
              }}
            >
              2FAが有効です
            </div>

            {/* バックアップコード表示ボタン */}
            <button
              type="button"
              onClick={handleShowBackupCodes}
              disabled={backupCodesLoading}
              style={{
                padding: '0.5rem 1rem',
                backgroundColor: '#3b82f6',
                color: 'white',
                borderRadius: '0.375rem',
                border: 'none',
                cursor: backupCodesLoading ? 'wait' : 'pointer',
                fontWeight: 500,
                width: 'fit-content',
              }}
            >
              {backupCodesLoading
                ? '読み込み中...'
                : showBackupCodes
                  ? 'バックアップコードを隠す'
                  : 'バックアップコードを表示'}
            </button>

            {/* バックアップコード一覧 */}
            {showBackupCodes && backupCodes.length > 0 && (
              <div
                style={{
                  padding: '1rem',
                  backgroundColor: '#f9fafb',
                  borderRadius: '0.375rem',
                  border: '1px solid #e5e7eb',
                }}
              >
                <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.75rem' }}>
                  バックアップコード（残り{remainingBackupCodesCount}個）
                </h3>

                {/* 残り3個以下の警告 */}
                {remainingBackupCodesCount !== null && remainingBackupCodesCount <= 3 && (
                  <div
                    role="alert"
                    style={{
                      padding: '0.75rem',
                      marginBottom: '1rem',
                      backgroundColor: '#fef3c7',
                      color: '#92400e',
                      borderRadius: '0.375rem',
                      fontSize: '0.875rem',
                    }}
                  >
                    バックアップコードの残りが少なくなっています。
                    <a
                      href="#regenerate-backup-codes"
                      onClick={(e) => {
                        e.preventDefault();
                        // TODO: 再生成機能の実装
                      }}
                      style={{
                        marginLeft: '0.5rem',
                        color: '#b45309',
                        textDecoration: 'underline',
                        fontWeight: 500,
                      }}
                    >
                      再生成
                    </a>
                  </div>
                )}

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(2, 1fr)',
                    gap: '0.5rem',
                    fontFamily: 'monospace',
                    fontSize: '0.875rem',
                  }}
                >
                  {backupCodes.map((code, index) => (
                    <div
                      key={index}
                      data-testid="backup-code-item"
                      className={code.isUsed ? 'used disabled' : ''}
                      style={{
                        padding: '0.5rem',
                        backgroundColor: code.isUsed ? '#f3f4f6' : 'white',
                        borderRadius: '0.25rem',
                        textDecoration: code.isUsed ? 'line-through' : 'none',
                        color: code.isUsed ? '#9ca3af' : '#374151',
                        opacity: code.isUsed ? 0.5 : 1,
                      }}
                      aria-label={code.isUsed ? '使用済み' : undefined}
                    >
                      {code.code}
                    </div>
                  ))}
                </div>

                <div style={{ marginTop: '1rem', fontSize: '0.75rem', color: '#6b7280' }}>
                  ※ セキュリティのため、コードはマスク表示されています。
                </div>

                {/* 再生成ボタン */}
                <button
                  type="button"
                  onClick={() => setShowRegenerateDialog(true)}
                  disabled={regenerateLoading}
                  style={{
                    marginTop: '1rem',
                    padding: '0.5rem 1rem',
                    backgroundColor: '#f59e0b',
                    color: 'white',
                    borderRadius: '0.375rem',
                    border: 'none',
                    cursor: regenerateLoading ? 'wait' : 'pointer',
                    fontWeight: 500,
                  }}
                >
                  {regenerateLoading ? '再生成中...' : '再生成'}
                </button>

                {/* 再生成メッセージ */}
                {regenerateMessage && (
                  <div
                    role="alert"
                    aria-live="polite"
                    style={{
                      marginTop: '0.75rem',
                      padding: '0.75rem',
                      borderRadius: '0.375rem',
                      backgroundColor: regenerateMessage.includes('失敗') ? '#fee2e2' : '#d1fae5',
                      color: regenerateMessage.includes('失敗') ? '#991b1b' : '#065f46',
                      fontSize: '0.875rem',
                    }}
                  >
                    {regenerateMessage}
                  </div>
                )}
              </div>
            )}

            {/* 2FA無効化セクション（要件27B.4-6） */}
            <div
              style={{
                marginTop: '1.5rem',
                paddingTop: '1.5rem',
                borderTop: '1px solid #e5e7eb',
              }}
            >
              <h3
                style={{
                  fontSize: '1rem',
                  fontWeight: 600,
                  marginBottom: '0.5rem',
                  color: '#dc2626',
                }}
              >
                二要素認証を無効化
              </h3>
              <p style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '1rem' }}>
                無効化すると、すべてのデバイスからログアウトされます。
              </p>
              <button
                type="button"
                onClick={handleOpenDisableDialog}
                disabled={disableLoading}
                style={{
                  padding: '0.5rem 1rem',
                  backgroundColor: '#dc2626',
                  color: 'white',
                  borderRadius: '0.375rem',
                  border: 'none',
                  cursor: disableLoading ? 'wait' : 'pointer',
                  fontWeight: 500,
                }}
              >
                {disableLoading ? '無効化中...' : '無効化'}
              </button>

              {/* 2FA無効化成功メッセージ */}
              {disableMessage && (
                <div
                  role="alert"
                  aria-live="polite"
                  style={{
                    marginTop: '0.75rem',
                    padding: '0.75rem',
                    borderRadius: '0.375rem',
                    backgroundColor: '#d1fae5',
                    color: '#065f46',
                    fontSize: '0.875rem',
                  }}
                >
                  {disableMessage}
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {/* バックアップコード再生成確認ダイアログ */}
      {showRegenerateDialog && (
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
            aria-labelledby="regenerate-dialog-title"
            style={{
              backgroundColor: 'white',
              borderRadius: '0.5rem',
              padding: '2rem',
              maxWidth: '500px',
              width: '100%',
            }}
          >
            <h3
              id="regenerate-dialog-title"
              style={{
                fontSize: '1.25rem',
                fontWeight: 'bold',
                marginBottom: '1rem',
              }}
            >
              バックアップコードの再生成
            </h3>
            <p style={{ marginBottom: '1.5rem', color: '#4b5563' }}>
              既存のバックアップコードは無効になります。本当に再生成しますか？
            </p>

            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowRegenerateDialog(false)}
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
                onClick={handleRegenerateBackupCodes}
                style={{
                  padding: '0.5rem 1rem',
                  backgroundColor: '#f59e0b',
                  color: 'white',
                  borderRadius: '0.375rem',
                  border: 'none',
                  cursor: 'pointer',
                  fontWeight: 500,
                }}
              >
                はい、再生成
              </button>
            </div>
          </div>
        </div>
      )}

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
            <p style={{ marginBottom: '1.5rem', color: '#4b5563' }}>
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

      {/* 2FA無効化パスワード確認ダイアログ（要件27B.4） */}
      {showDisableDialog && (
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
            aria-labelledby="disable-dialog-title"
            style={{
              backgroundColor: 'white',
              borderRadius: '0.5rem',
              padding: '2rem',
              maxWidth: '500px',
              width: '100%',
            }}
          >
            <h3
              id="disable-dialog-title"
              style={{
                fontSize: '1.25rem',
                fontWeight: 'bold',
                marginBottom: '1rem',
              }}
            >
              二要素認証の無効化
            </h3>
            <p style={{ marginBottom: '1rem', color: '#4b5563' }}>パスワードを入力してください</p>

            {/* エラーメッセージ */}
            {disableError && (
              <div
                role="alert"
                aria-live="polite"
                style={{
                  padding: '0.75rem',
                  marginBottom: '1rem',
                  backgroundColor: '#fee2e2',
                  color: '#991b1b',
                  borderRadius: '0.375rem',
                  fontSize: '0.875rem',
                }}
              >
                {disableError}
              </div>
            )}

            <div style={{ marginBottom: '1.5rem' }}>
              <label
                htmlFor="disable-password"
                style={{
                  display: 'block',
                  fontSize: '0.875rem',
                  fontWeight: 500,
                  marginBottom: '0.5rem',
                  color: '#374151',
                }}
              >
                パスワード
              </label>
              <input
                id="disable-password"
                type="password"
                value={disablePassword}
                onChange={(e) => setDisablePassword(e.target.value)}
                autoComplete="current-password"
                style={{
                  width: '100%',
                  padding: '0.5rem 0.75rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '0.375rem',
                  fontSize: '1rem',
                }}
              />
            </div>

            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
              <button
                onClick={() => {
                  setShowDisableDialog(false);
                  setDisablePassword('');
                  setDisableError('');
                }}
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
                onClick={handleDisablePasswordSubmit}
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
                確認
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2FA無効化ログアウト警告ダイアログ（要件27B.6） */}
      {showDisableConfirmDialog && (
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
            aria-labelledby="disable-confirm-dialog-title"
            style={{
              backgroundColor: 'white',
              borderRadius: '0.5rem',
              padding: '2rem',
              maxWidth: '500px',
              width: '100%',
            }}
          >
            <h3
              id="disable-confirm-dialog-title"
              style={{
                fontSize: '1.25rem',
                fontWeight: 'bold',
                marginBottom: '1rem',
              }}
            >
              二要素認証の無効化確認
            </h3>
            <p style={{ marginBottom: '1.5rem', color: '#dc2626', fontWeight: 500 }}>
              全デバイスからログアウトされます
            </p>
            <p style={{ marginBottom: '1.5rem', color: '#4b5563' }}>
              二要素認証を無効化すると、セキュリティレベルが低下します。続行しますか？
            </p>

            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowDisableConfirmDialog(false)}
                disabled={disableLoading}
                style={{
                  padding: '0.5rem 1rem',
                  backgroundColor: '#f3f4f6',
                  color: '#374151',
                  borderRadius: '0.375rem',
                  border: 'none',
                  cursor: disableLoading ? 'wait' : 'pointer',
                  fontWeight: 500,
                }}
              >
                キャンセル
              </button>
              <button
                onClick={handleConfirmDisable}
                disabled={disableLoading}
                style={{
                  padding: '0.5rem 1rem',
                  backgroundColor: '#dc2626',
                  color: 'white',
                  borderRadius: '0.375rem',
                  border: 'none',
                  cursor: disableLoading ? 'wait' : 'pointer',
                  fontWeight: 500,
                }}
              >
                {disableLoading ? '無効化中...' : 'はい、無効化する'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
