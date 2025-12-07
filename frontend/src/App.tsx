import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { ToastProvider } from './hooks/useToast';
import ErrorBoundary from './components/ErrorBoundary';
import ToastContainer from './components/ToastContainer';
import { routes } from './routes';
import './App.css';

/**
 * React Router v7のルーター作成
 *
 * createBrowserRouterを使用してルーターを作成します。
 * これにより、React Router v7の新しいデータルーティング機能と
 * 改善されたナビゲーション処理を利用できます。
 */
const router = createBrowserRouter(routes);

/**
 * Appコンポーネント
 *
 * アプリケーションのルートコンポーネントです。
 * 以下の機能を提供します：
 * - エラーバウンダリによるエラーハンドリング
 * - 認証コンテキストの提供
 * - React Router v7によるルーティング（createBrowserRouter + RouterProvider）
 *
 * ## アーキテクチャ
 * ```
 * App
 * ├─ ErrorBoundary （エラーキャッチ）
 * │  └─ AuthProvider （認証状態管理）
 * │     └─ ToastProvider （トースト通知管理）
 * │        ├─ ToastContainer （トースト表示）
 * │        └─ RouterProvider （React Router v7ルーター）
 * ```
 *
 * ## Note
 * React Router v7では、createBrowserRouter + RouterProviderパターンが推奨されます。
 * このパターンにより、状態更新とナビゲーションの競合を避けることができます。
 */
function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <ToastProvider>
          <ToastContainer />
          <RouterProvider router={router} />
        </ToastProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}

export default App;
