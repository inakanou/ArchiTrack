import { ReactElement } from 'react';
import { Outlet } from 'react-router-dom';
import { AppHeader } from './Navigation/AppHeader';

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
  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader />
      <main className="py-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
