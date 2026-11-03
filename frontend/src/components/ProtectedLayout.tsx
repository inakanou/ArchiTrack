import { ReactElement } from 'react';
import { Outlet } from 'react-router-dom';
import { AppHeader } from './Navigation/AppHeader';
import { SessionExpiredModal } from './SessionExpiredModal';
import { useAuth } from '../hooks/useAuth';
import { getUserRestriction } from '../utils/user-restriction';
import { TAP_TARGET_MIN_PX } from '../utils/tap-target';

/**
 * 利用者の状態による制限中のヘッダー（ナビゲーションを出さず、ログアウトだけを置く）
 *
 * 制限中（2FA 未登録・初回のパスワード変更中）は他の画面へ遷移できず、API も設定・変更とログアウト
 * 以外は 403 になるため、共通のヘッダーのナビゲーションやメニューを出さない
 * （design.md「AuthContext・ProtectedRoute（変更）」、user-authentication タスク47.6）。
 * 背景は白とし、共通のフォーカス表示（index.css の :focus-visible の青い輪）がそのまま見えるようにする。
 */
function RestrictedHeader({ onLogout }: { onLogout: () => void }): ReactElement {
  return (
    <header
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '1rem',
        padding: '0.5rem 1rem',
        backgroundColor: '#ffffff',
        borderBottom: '1px solid #e5e7eb',
      }}
    >
      <span style={{ fontWeight: 700, fontSize: '1.125rem', color: '#111827' }}>ArchiTrack</span>
      <button
        type="button"
        onClick={onLogout}
        style={{
          minHeight: `${TAP_TARGET_MIN_PX}px`,
          minWidth: `${TAP_TARGET_MIN_PX}px`,
          padding: '0.5rem 1rem',
          fontSize: '1rem',
          backgroundColor: '#ffffff',
          color: '#374151',
          border: '1px solid #d1d5db',
          borderRadius: '0.375rem',
          cursor: 'pointer',
        }}
      >
        ログアウト
      </button>
    </header>
  );
}

/**
 * ProtectedLayoutコンポーネント
 *
 * 保護されたルート用のレイアウトコンポーネント。
 * 共通ヘッダーナビゲーション（AppHeader）を含みます。
 *
 * ## 機能
 * - AppHeaderを全ての保護されたページに表示
 * - ダッシュボード、プロフィール、ログアウトへのリンク
 * - 管理者ユーザーには管理メニューを表示
 *
 * ## 要件
 * - REQ-28.21: 認証済みユーザーが保護された画面にアクセスすると共通ヘッダーナビゲーションが表示される
 * - REQ-28.22: ダッシュボードへのリンク、プロフィールへのリンク、ログアウトボタンを含む
 * - REQ-28.23: ログイン中のユーザー表示名を表示
 * - REQ-28.24: 管理者ユーザーには「管理メニュー」ドロップダウンを追加表示
 * - REQ-28.25: 管理メニューにはユーザー管理、招待管理、監査ログへのリンクを含む
 *
 * @example
 * // routes.tsxでのレイアウトルートとしての使用
 * {
 *   element: <ProtectedLayout />,
 *   children: [
 *     { path: '/dashboard', element: <Dashboard /> },
 *     { path: '/profile', element: <Profile /> },
 *   ],
 * }
 */
export function ProtectedLayout(): ReactElement {
  const { sessionExpiredDuringOperation, user, handleReauthSuccess, navigateToLogin, logout } =
    useAuth();
  const restricted = getUserRestriction(user) !== null;

  // 共通のヘッダーのログアウト（要件28.42）と同じく、ログイン画面に「ログアウトしました」を出す
  const handleRestrictedLogout = (): void => {
    sessionStorage.setItem('logoutMessage', 'ログアウトしました');
    void logout();
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {restricted ? <RestrictedHeader onLogout={handleRestrictedLogout} /> : <AppHeader />}
      <main className="py-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <Outlet />
        </div>
      </main>
      {/* 要件30.1, 30.2, 30.3: セッション切れモーダル再認証 */}
      <SessionExpiredModal
        isOpen={sessionExpiredDuringOperation}
        userEmail={user?.email ?? ''}
        onReauthSuccess={handleReauthSuccess}
        onNavigateToLogin={navigateToLogin}
      />
    </div>
  );
}
