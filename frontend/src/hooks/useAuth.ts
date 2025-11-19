import { useContext } from 'react';
import { AuthContext, type AuthContextValue } from '../contexts/AuthContext';

/**
 * 認証コンテキストを使用するカスタムフック
 *
 * AuthProviderでラップされたコンポーネント内で使用する必要があります。
 * 認証状態、ユーザー情報、認証関連の操作関数へのアクセスを提供します。
 *
 * @throws {Error} AuthProvider外で使用した場合にエラーをスローします
 * @returns {AuthContextValue} 認証コンテキストの値
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { user, login, logout } = useAuth();
 *
 *   if (!user) {
 *     return <div>Not logged in</div>;
 *   }
 *
 *   return (
 *     <div>
 *       <p>Welcome, {user.email}</p>
 *       <button onClick={logout}>Logout</button>
 *     </div>
 *   );
 * }
 * ```
 */
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);

  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }

  return context;
}
