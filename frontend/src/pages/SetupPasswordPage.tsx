/**
 * 初回のパスワード変更の画面（`/setup/password`）
 *
 * user-authentication 要件37.7、タスク47.6。初回のパスワード変更を要する利用者（初期管理者）は、
 * 変更を完了するまでこの画面だけを開ける（ProtectedRoute が他の経路をこの画面へ置き換える）。
 * `/profile` のパスワード変更の区画だけを表示し、パスワード変更とログアウト以外の API を呼ばない
 * （制限中は他の API が 403 `PASSWORD_CHANGE_REQUIRED` になる）。
 *
 * 変更の完了で全てのリフレッシュトークンが失効する（要件7.5）ため、ログアウトしてログイン画面へ戻す。
 * 再びログインした後は 2FA 未登録として 2FA 設定の画面へ進む（要件34.1）。
 */

import { useAuth } from '../hooks/useAuth';
import { apiClient } from '../api/client';
import { PasswordChangeSection } from '../components/PasswordChangeSection';

/** 変更の完了の後にログイン画面に出す案内 */
const PASSWORD_CHANGED_MESSAGE =
  'パスワードを変更しました。新しいパスワードでログインしてください。';

export function SetupPasswordPage() {
  const { user, logout } = useAuth();

  const handlePasswordChanged = async (): Promise<void> => {
    // ログアウトで利用者が消えると ProtectedRoute がログイン画面へ移す（この画面は遷移先として保存しない）。
    // 案内はログアウトの案内と同じくログイン画面が表示の時点で読む（要件28.42 と同じ受け渡し）
    sessionStorage.setItem('logoutMessage', PASSWORD_CHANGED_MESSAGE);
    // 変更でサーバー側のリフレッシュトークンは失効しているため、リフレッシュを試みずにログアウトする
    apiClient.setTokenRefreshCallback(null);
    await logout();
  };

  return (
    <div
      style={{
        maxWidth: '640px',
        margin: '0 auto',
        padding: '1rem',
        // 長い一語の名前（メールアドレスなど）で 375px 幅をはみ出さない
        overflowWrap: 'anywhere',
      }}
    >
      <h1 style={{ fontSize: '1.75rem', fontWeight: 'bold', marginBottom: '0.75rem' }}>
        初回のパスワード変更
      </h1>
      <p style={{ marginBottom: '1.5rem', color: '#374151', lineHeight: 1.6 }}>
        {user?.email ? `${user.email} さん、` : ''}
        利用を始める前に、初期のパスワードを新しいパスワードへ変更してください。変更の後は、新しいパスワードで再びログインし、二要素認証を設定します。
      </p>
      <PasswordChangeSection onPasswordChanged={handlePasswordChanged} />
    </div>
  );
}
