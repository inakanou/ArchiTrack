import { ReactElement } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import {
  PASSWORD_SETUP_PATH,
  getUserRestriction,
  isReturnablePath,
  restrictedPathFor,
} from '../utils/user-restriction';
import { toSafeInternalPath } from '../utils/safe-redirect';

/**
 * ProtectedRouteコンポーネントのプロパティ
 */
export interface ProtectedRouteProps {
  /**
   * 保護されたコンテンツ
   */
  children: ReactElement;

  /**
   * リダイレクト先のパス（デフォルト: /login）
   */
  redirectTo?: string;

  /**
   * 認証が必要かどうか（デフォルト: true）
   * falseの場合、認証済みユーザーのみをリダイレクト（例: ログインページ）
   */
  requireAuth?: boolean;

  /**
   * 必要なロール（指定した場合、そのロールを持つユーザーのみアクセス可能）
   */
  requiredRole?: 'admin' | 'user';
}

/**
 * ProtectedRouteコンポーネント
 *
 * 認証状態に基づいてルートへのアクセスを制御します。
 *
 * ## 機能
 * - 未認証ユーザーを指定されたページ（デフォルト: ログインページ）にリダイレクト
 * - リダイレクト元のURLを保存し、ログイン後に元のページに戻れるようにする
 * - 認証済みユーザーのみをリダイレクトするオプション（例: ログインページ→ダッシュボード）
 *
 * ## 要件
 * @requirement user-authentication/REQ-16: セッション有効期限切れ時のリダイレクトURL保存機能
 * - 要件34.1・34.3・34.5・34.8: 2FA 未登録の利用者は 2FA 設定の画面だけを開ける
 * - 要件37.7: 初回のパスワード変更を要する利用者は初回のパスワード変更の画面だけを開ける
 *   （制限中の他の経路は制限の画面へ置き換え、元の遷移先を `state.from` に保存する。要件34.4）
 *
 * @example
 * // 保護されたルート（認証が必要）
 * <Route path="/dashboard" element={
 *   <ProtectedRoute>
 *     <Dashboard />
 *   </ProtectedRoute>
 * } />
 *
 * @example
 * // 公開ルート（認証済みユーザーはダッシュボードへリダイレクト）
 * <Route path="/login" element={
 *   <ProtectedRoute requireAuth={false} redirectTo="/dashboard">
 *     <LoginPage />
 *   </ProtectedRoute>
 * } />
 */
export function ProtectedRoute({
  children,
  redirectTo = '/login',
  requireAuth = true,
  requiredRole,
}: ProtectedRouteProps): ReactElement {
  const {
    isAuthenticated,
    isLoading,
    isInitialized,
    user,
    sessionExpired,
    sessionExpiredDuringOperation,
  } = useAuth();
  const location = useLocation();

  // requireAuth=true: 認証が必要なルート
  if (requireAuth) {
    // 初期化が完了していない、またはローディング中はローディングインジケーターを表示（ちらつき防止）
    if (!isInitialized || isLoading) {
      return (
        <div className="flex items-center justify-center min-h-screen">
          <div
            className="text-center"
            role="status"
            aria-label="認証状態を確認中"
            aria-live="polite"
          >
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 mx-auto" />
            <p className="mt-4 text-gray-600">認証状態を確認中...</p>
          </div>
        </div>
      );
    }

    // 要件30.2, 30.3: 操作中のセッション切れ時はリダイレクトを抑制し、childrenを表示し続ける
    // モーダルがオーバーレイ表示され、フォームデータが保持される
    if (!isAuthenticated && sessionExpiredDuringOperation) {
      return children;
    }

    // 初回のパスワード変更の画面は遷移先として保存しない（変更の完了のログアウトでここへ来る。
    // 再ログインの後は利用者の状態に応じた画面へ進む。user-authentication タスク47.6）
    if (!isAuthenticated && location.pathname === PASSWORD_SETUP_PATH) {
      return <Navigate to={redirectTo} state={{ sessionExpired }} replace />;
    }

    if (!isAuthenticated) {
      // 未認証の場合、現在のパスをstateとクエリパラメータの両方に保存してリダイレクト
      // ログイン後にこのパスに戻れるようにする
      // @requirement user-authentication/REQ-16: リダイレクトURL保存
      // @requirement user-authentication/REQ-16.8: セッション期限切れフラグ
      // @requirement user-authentication/REQ-16.7: redirectUrlクエリパラメータとして現在のURLを保存
      const currentPath = location.pathname + location.search;
      const redirectUrlParam = encodeURIComponent(currentPath);
      const redirectPath = `${redirectTo}?redirectUrl=${redirectUrlParam}`;

      return (
        <Navigate
          to={redirectPath}
          state={{
            from: currentPath,
            sessionExpired,
          }}
          replace
        />
      );
    }

    // 利用者の状態による遷移の制限（user-authentication タスク47.6）。ロールの確認より前に行う
    const restriction = getUserRestriction(user);
    if (restriction) {
      const allowedPath = restrictedPathFor(restriction);
      if (location.pathname !== allowedPath) {
        const currentPath = location.pathname + location.search;
        return (
          <Navigate
            to={allowedPath}
            state={{
              from: isReturnablePath(currentPath) ? currentPath : undefined,
            }}
            replace
          />
        );
      }
    } else if (location.pathname === PASSWORD_SETUP_PATH) {
      // 初回のパスワード変更を要しない利用者は、プロフィール画面のパスワード変更を使う
      return <Navigate to="/profile" replace />;
    }

    // ロールチェック
    if (requiredRole && user && !user.roles?.includes(requiredRole)) {
      // 必要なロールがない場合、アクセス権限エラーページを表示
      return (
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center max-w-md px-4">
            <h1 className="text-2xl font-bold text-gray-900 mb-4">アクセス権限がありません</h1>
            <p className="text-gray-600 mb-6">このページにアクセスする権限がありません。</p>
            <a href="/" className="text-blue-600 hover:text-blue-800 underline">
              ホームに戻る
            </a>
          </div>
        </div>
      );
    }

    // 認証済みの場合、保護されたコンテンツを表示
    return children;
  }

  // requireAuth=false: 認証済みユーザーをリダイレクトするルート（例: ログインページ）
  // ログイン処理中（isLoading=true）でもchildrenを表示し続ける（アンマウントを防ぐ）
  if (isAuthenticated) {
    // 認証済みの場合、指定されたパスにリダイレクト
    // stateにfromがあれば、そのパスにリダイレクト（ログイン後に元のページに戻る）
    // state.from は画面内の安全なパスに限る（別のオリジンへの遷移を防ぐ。是正計画 D13）
    const from = toSafeInternalPath((location.state as { from?: unknown })?.from) ?? redirectTo;
    return <Navigate to={from} replace />;
  }

  // 未認証の場合、公開コンテンツを表示
  // isLoadingに関わらず常にchildrenを返す（状態を保持するため）
  return children;
}
