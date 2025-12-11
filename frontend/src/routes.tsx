import { RouteObject, Navigate } from 'react-router-dom';
import { ProtectedRoute } from './components/ProtectedRoute';
import { ProtectedLayout } from './components/ProtectedLayout';
import { Profile } from './pages/Profile';
import { Sessions } from './pages/Sessions';
import { AuditLogs } from './pages/AuditLogs';
import { UserManagement } from './pages/UserManagement';
import { InvitationsPage } from './pages/InvitationsPage';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { PasswordResetPage } from './pages/PasswordResetPage';
import { TwoFactorSetupPage } from './pages/TwoFactorSetupPage';
import { Dashboard } from './pages/Dashboard';
import { RoleManagement } from './pages/RoleManagement';
import { PermissionManagement } from './pages/PermissionManagement';
import ProjectListPage from './pages/ProjectListPage';
import ProjectDetailPage from './pages/ProjectDetailPage';
import ProjectCreatePage from './pages/ProjectCreatePage';
import TradingPartnerListPage from './pages/TradingPartnerListPage';
import TradingPartnerDetailPage from './pages/TradingPartnerDetailPage';
import TradingPartnerCreatePage from './pages/TradingPartnerCreatePage';

/**
 * アプリケーションのルート設定
 *
 * ## ルート構造
 * - 公開ルート: ログイン、登録、パスワードリセット
 * - 保護されたルート: プロフィール、セッション管理、2FA設定、管理機能
 *
 * ## 認証フロー
 * 1. 未認証ユーザーが保護されたルートにアクセス → ログインページへリダイレクト
 * 2. ログイン後、元のページ（リダイレクト元）に戻る
 * 3. 認証済みユーザーがログインページにアクセス → ダッシュボードへリダイレクト
 *
 * ## Note
 * - LoginForm, RegisterForm等の認証コンポーネントはコンテナページに統合済み
 * - LoginPage, RegisterPage, PasswordResetPageがAPIと統合
 */
export const routes: RouteObject[] = [
  // ルートパス - ダッシュボードへリダイレクト
  {
    path: '/',
    element: <Navigate to="/dashboard" replace />,
  },

  // 認証関連の公開ルート（AppHeaderなし）
  {
    path: '/login',
    element: (
      <ProtectedRoute requireAuth={false} redirectTo="/dashboard">
        <LoginPage />
      </ProtectedRoute>
    ),
  },
  {
    path: '/register',
    element: (
      <ProtectedRoute requireAuth={false} redirectTo="/dashboard">
        <RegisterPage />
      </ProtectedRoute>
    ),
  },
  {
    path: '/password-reset',
    element: (
      <ProtectedRoute requireAuth={false} redirectTo="/dashboard">
        <PasswordResetPage />
      </ProtectedRoute>
    ),
  },

  // 保護されたルート（AppHeader付きレイアウト）
  // REQ-28.21: 認証済みユーザーが保護された画面にアクセスすると共通ヘッダーナビゲーションが表示される
  {
    element: (
      <ProtectedRoute>
        <ProtectedLayout />
      </ProtectedRoute>
    ),
    children: [
      // ダッシュボード
      {
        path: '/dashboard',
        element: <Dashboard />,
      },
      // ユーザープロフィール
      {
        path: '/profile',
        element: <Profile />,
      },
      // セッション管理
      {
        path: '/sessions',
        element: <Sessions />,
      },
      // 2FA設定
      {
        path: '/profile/2fa-setup',
        element: <TwoFactorSetupPage />,
      },
      // プロジェクト一覧
      // REQ-21.2: ヘッダーの「プロジェクト」リンクからプロジェクト一覧画面に遷移
      // REQ-21.6: ダッシュボードの「プロジェクト管理」カードからプロジェクト一覧画面に遷移
      {
        path: '/projects',
        element: <ProjectListPage />,
      },
      // プロジェクト新規作成（/projects/:id より先に定義する必要あり）
      // REQ-1.1: 「新規作成」ボタンでプロジェクト作成フォームを表示
      {
        path: '/projects/new',
        element: <ProjectCreatePage />,
      },
      // プロジェクト詳細
      // REQ-7.1, 7.2, 7.3: プロジェクト詳細表示
      {
        path: '/projects/:id',
        element: <ProjectDetailPage />,
      },

      // 取引先一覧
      // REQ-12.9: /trading-partners のURLで提供
      // REQ-12.2: ヘッダーの「取引先」リンクから取引先一覧画面に遷移
      // REQ-12.6: ダッシュボードの「取引先管理」カードから取引先一覧画面に遷移
      {
        path: '/trading-partners',
        element: <TradingPartnerListPage />,
      },
      // 取引先新規作成（/trading-partners/:id より先に定義する必要あり）
      // REQ-12.10: /trading-partners/new のURLで提供
      // REQ-12.16: パンくず: ダッシュボード > 取引先 > 新規作成
      {
        path: '/trading-partners/new',
        element: <TradingPartnerCreatePage />,
      },
      // 取引先詳細
      // REQ-12.11: /trading-partners/:id のURLで提供
      // REQ-12.15: パンくず: ダッシュボード > 取引先 > [取引先名]
      {
        path: '/trading-partners/:id',
        element: <TradingPartnerDetailPage />,
      },
    ],
  },

  // 管理者専用ルート（AppHeader付きレイアウト）
  {
    element: (
      <ProtectedRoute requiredRole="admin">
        <ProtectedLayout />
      </ProtectedRoute>
    ),
    children: [
      // 監査ログ
      {
        path: '/admin/audit-logs',
        element: <AuditLogs />,
      },
      // ユーザー管理
      {
        path: '/admin/users',
        element: <UserManagement />,
      },
      // 招待管理
      {
        path: '/admin/invitations',
        element: <InvitationsPage />,
      },
      // ロール管理
      {
        path: '/admin/roles',
        element: <RoleManagement />,
      },
      // 権限管理
      {
        path: '/admin/permissions',
        element: <PermissionManagement />,
      },
    ],
  },

  // 404 Not Found
  {
    path: '*',
    element: (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900">404 - ページが見つかりません</h1>
          <p className="mt-2 text-gray-600">お探しのページは存在しません。</p>
          <p className="mt-4">
            <a href="/" className="text-blue-600 hover:text-blue-800 underline">
              ホームに戻る
            </a>
          </p>
        </div>
      </div>
    ),
  },
];
