import { RouteObject } from 'react-router-dom';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Profile } from './pages/Profile';
import { Sessions } from './pages/Sessions';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { PasswordResetPage } from './pages/PasswordResetPage';
import { TwoFactorSetupPage } from './pages/TwoFactorSetupPage';

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
  // ルートパス - ダッシュボードまたはステータスページ
  {
    path: '/',
    element: (
      <ProtectedRoute>
        <div>
          <h1>ArchiTrack Dashboard</h1>
          <p>アーキテクチャ決定記録管理システム</p>
          <p>
            <a href="/profile">プロフィール</a> | <a href="/sessions">セッション管理</a>
          </p>
        </div>
      </ProtectedRoute>
    ),
  },

  // 認証関連の公開ルート
  {
    path: '/login',
    element: (
      <ProtectedRoute requireAuth={false} redirectTo="/">
        <LoginPage />
      </ProtectedRoute>
    ),
  },
  {
    path: '/register',
    element: (
      <ProtectedRoute requireAuth={false} redirectTo="/">
        <RegisterPage />
      </ProtectedRoute>
    ),
  },
  {
    path: '/password-reset',
    element: (
      <ProtectedRoute requireAuth={false} redirectTo="/">
        <PasswordResetPage />
      </ProtectedRoute>
    ),
  },

  // ユーザープロフィールとセッション管理
  {
    path: '/profile',
    element: (
      <ProtectedRoute>
        <Profile />
      </ProtectedRoute>
    ),
  },
  {
    path: '/sessions',
    element: (
      <ProtectedRoute>
        <Sessions />
      </ProtectedRoute>
    ),
  },
  {
    path: '/profile/2fa-setup',
    element: (
      <ProtectedRoute>
        <TwoFactorSetupPage />
      </ProtectedRoute>
    ),
  },

  // 404 Not Found
  {
    path: '*',
    element: (
      <div>
        <h1>404 - ページが見つかりません</h1>
        <p>お探しのページは存在しません。</p>
        <p>
          <a href="/">ホームに戻る</a>
        </p>
      </div>
    ),
  },
];
