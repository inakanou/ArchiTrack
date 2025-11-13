import { BrowserRouter, useRoutes } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import ErrorBoundary from './components/ErrorBoundary';
import { routes } from './routes';
import './App.css';

/**
 * ルートレンダラーコンポーネント
 *
 * React Router v6のuseRoutes()フックを使用してルートをレンダリングします。
 * BrowserRouter内で使用する必要があります。
 */
function AppRoutes() {
  const element = useRoutes(routes);
  return element;
}

/**
 * Appコンポーネント
 *
 * アプリケーションのルートコンポーネントです。
 * 以下の機能を提供します：
 * - エラーバウンダリによるエラーハンドリング
 * - 認証コンテキストの提供
 * - React Router v6によるルーティング
 *
 * ## アーキテクチャ
 * ```
 * App
 * ├─ ErrorBoundary （エラーキャッチ）
 * │  └─ AuthProvider （認証状態管理）
 * │     └─ BrowserRouter （ルーティング）
 * │        └─ AppRoutes （ルートレンダリング）
 * ```
 */
function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </AuthProvider>
    </ErrorBoundary>
  );
}

export default App;
