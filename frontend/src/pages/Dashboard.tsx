import { ReactElement } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

/**
 * ダッシュボードコンポーネント
 *
 * アプリケーションのメインダッシュボードページ。
 * 認証済みユーザー向けの主要機能へのクイックアクセスリンクを提供します。
 *
 * ## 機能
 * - プロジェクト管理へのリンク（クイックアクセスセクション先頭）
 * - 取引先管理へのリンク（プロジェクト管理の次に配置）
 * - プロフィールへのリンク
 * - セッション管理へのリンク
 * - 2FA設定へのリンク
 * - 管理者向け機能へのリンク（管理者のみ表示）
 *
 * ## 要件
 * - REQ-21.5: ダッシュボードにプロジェクト管理へのクイックアクセスカードが表示されている
 * - REQ-21.6: プロジェクト管理カードをクリックするとプロジェクト一覧ページに遷移する
 * - REQ-21.7: プロジェクト管理カードには「工事案件の作成・管理」という説明が表示される
 * - REQ-21.8: プロジェクト管理カードはクイックアクセスセクションの先頭に配置される
 * - REQ-12.5: ダッシュボードのクイックアクセスセクションに「取引先管理」カードを表示する
 * - REQ-12.6: 取引先管理カードをクリックすると取引先一覧ページ（/trading-partners）に遷移する
 * - REQ-12.7: 取引先管理カードには「顧客・協力業者の登録・管理」という説明を表示する
 * - REQ-12.8: 取引先管理カードを「プロジェクト管理」カードの次に配置する
 * - REQ-28.26: ダッシュボード画面は主要機能へのクイックアクセスリンクを提供する
 * - REQ-28.27: プロフィールリンククリック → プロフィール画面遷移
 */
export function Dashboard(): ReactElement {
  const { user } = useAuth();
  const isAdmin = user?.roles?.includes('admin') ?? false;

  return (
    <div data-testid="dashboard" className="space-y-8">
      {/* ウェルカムセクション */}
      <section>
        <h1 className="text-3xl font-bold text-gray-900">
          ようこそ、{user?.displayName ?? 'ユーザー'}さん
        </h1>
        <p className="mt-2 text-gray-600">ArchiTrack - アーキテクチャ決定記録管理システム</p>
      </section>

      {/* クイックアクセスセクション */}
      <section>
        <h2 className="text-xl font-semibold text-gray-800 mb-4">クイックアクセス</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* プロジェクト管理 - REQ 21.5, 21.6, 21.7, 21.8: セクション先頭に配置 */}
          <Link
            to="/projects"
            className="block p-6 bg-white rounded-lg shadow hover:shadow-md transition-shadow"
            data-testid="quick-link-projects"
          >
            <h3 className="text-lg font-medium text-gray-900">プロジェクト管理</h3>
            <p className="mt-2 text-gray-600">工事案件の作成・管理</p>
          </Link>

          {/* 取引先管理 - REQ 12.5, 12.6, 12.7, 12.8: プロジェクト管理の次に配置 */}
          <Link
            to="/trading-partners"
            className="block p-6 bg-white rounded-lg shadow hover:shadow-md transition-shadow"
            data-testid="quick-link-trading-partners"
          >
            <h3 className="text-lg font-medium text-gray-900">取引先管理</h3>
            <p className="mt-2 text-gray-600">顧客・協力業者の登録・管理</p>
          </Link>

          {/* プロフィール */}
          <Link
            to="/profile"
            className="block p-6 bg-white rounded-lg shadow hover:shadow-md transition-shadow"
            data-testid="quick-link-profile"
          >
            <h3 className="text-lg font-medium text-gray-900">プロフィール</h3>
            <p className="mt-2 text-gray-600">アカウント情報の確認と編集</p>
          </Link>

          {/* セッション管理 */}
          <Link
            to="/sessions"
            className="block p-6 bg-white rounded-lg shadow hover:shadow-md transition-shadow"
            data-testid="quick-link-sessions"
          >
            <h3 className="text-lg font-medium text-gray-900">セッション管理</h3>
            <p className="mt-2 text-gray-600">アクティブなセッションの管理</p>
          </Link>

          {/* 2FA設定 */}
          <Link
            to="/profile/2fa-setup"
            className="block p-6 bg-white rounded-lg shadow hover:shadow-md transition-shadow"
            data-testid="quick-link-2fa"
          >
            <h3 className="text-lg font-medium text-gray-900">2FA設定</h3>
            <p className="mt-2 text-gray-600">二要素認証の設定</p>
          </Link>
        </div>
      </section>

      {/* 管理者セクション（管理者のみ表示） */}
      {isAdmin && (
        <section>
          <h2 className="text-xl font-semibold text-gray-800 mb-4">管理機能</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* ユーザー管理 */}
            <Link
              to="/admin/users"
              className="block p-6 bg-blue-50 rounded-lg shadow hover:shadow-md transition-shadow border border-blue-100"
              data-testid="quick-link-admin-users"
            >
              <h3 className="text-lg font-medium text-blue-900">ユーザー管理</h3>
              <p className="mt-2 text-blue-700">ユーザーアカウントの管理</p>
            </Link>

            {/* 招待管理 */}
            <Link
              to="/admin/invitations"
              className="block p-6 bg-blue-50 rounded-lg shadow hover:shadow-md transition-shadow border border-blue-100"
              data-testid="quick-link-admin-invitations"
            >
              <h3 className="text-lg font-medium text-blue-900">招待管理</h3>
              <p className="mt-2 text-blue-700">ユーザー招待の管理</p>
            </Link>

            {/* 監査ログ */}
            <Link
              to="/admin/audit-logs"
              className="block p-6 bg-blue-50 rounded-lg shadow hover:shadow-md transition-shadow border border-blue-100"
              data-testid="quick-link-admin-audit"
            >
              <h3 className="text-lg font-medium text-blue-900">監査ログ</h3>
              <p className="mt-2 text-blue-700">システム操作ログの確認</p>
            </Link>
          </div>
        </section>
      )}
    </div>
  );
}
