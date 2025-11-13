import { RouteObject } from 'react-router-dom';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Profile } from './pages/Profile';
import { Sessions } from './pages/Sessions';

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
 * - LoginForm, RegisterForm等の認証コンポーネントは後でコンテナページを作成予定
 * - 現在は基本的なルーティング統合のみ実装
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

  // 認証関連の公開ルート（TODO: コンテナページを作成）
  {
    path: '/login',
    element: (
      <ProtectedRoute requireAuth={false} redirectTo="/">
        <div>
          <h1>ログイン</h1>
          <p>ログインページ（実装予定）</p>
        </div>
      </ProtectedRoute>
    ),
  },
  {
    path: '/register',
    element: (
      <ProtectedRoute requireAuth={false} redirectTo="/">
        <div>
          <h1>ユーザー登録</h1>
          <p>登録ページ（実装予定）</p>
        </div>
      </ProtectedRoute>
    ),
  },
  {
    path: '/password-reset',
    element: (
      <ProtectedRoute requireAuth={false} redirectTo="/">
        <div>
          <h1>パスワードリセット</h1>
          <p>パスワードリセットページ（実装予定）</p>
        </div>
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
