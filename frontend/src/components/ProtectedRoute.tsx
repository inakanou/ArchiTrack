import { ReactElement } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

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
 * - Requirement 16: セッション有効期限切れ時のリダイレクトURL保存機能
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
}: ProtectedRouteProps): ReactElement {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  // requireAuth=true: 認証が必要なルート
  if (requireAuth) {
    // 認証状態の読み込み中はローディングインジケーターを表示（ちらつき防止）
    if (isLoading) {
      return (
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center" role="status" aria-label="認証状態を確認中">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 mx-auto" />
            <p className="mt-4 text-gray-600">認証状態を確認中...</p>
          </div>
        </div>
      );
    }

    if (!isAuthenticated) {
      // 未認証の場合、現在のパスをstateに保存してリダイレクト
      // ログイン後にこのパスに戻れるようにする（Requirement 16）
      return (
        <Navigate to={redirectTo} state={{ from: location.pathname + location.search }} replace />
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
    const from = (location.state as { from?: string })?.from || redirectTo;
    return <Navigate to={from} replace />;
  }

  // 未認証の場合、公開コンテンツを表示
  // isLoadingに関わらず常にchildrenを返す（状態を保持するため）
  return children;
}
