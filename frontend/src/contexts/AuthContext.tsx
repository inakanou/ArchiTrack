import {
  createContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  ReactNode,
  ReactElement,
} from 'react';
import { apiClient } from '../api/client';
import { TokenRefreshManager } from '../services/TokenRefreshManager';

/**
 * ユーザー情報の型定義
 */
export interface User {
  id: string;
  email: string;
  displayName: string;
  roles?: string[];
  createdAt?: string;
  emailVerified?: boolean;
  twoFactorEnabled?: boolean;
}

/**
 * トークン情報の型定義
 */
export interface Tokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number; // ミリ秒
}

/**
 * 認証コンテキストの型定義
 */
export interface AuthContextValue {
  isAuthenticated: boolean;
  user: User | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshToken: () => Promise<string>;
}

/**
 * 認証コンテキスト
 *
 * useAuthフックを通じて使用することを推奨します。
 * 直接useContextで使用する場合は、undefined チェックを忘れないでください。
 *
 * Note: AuthContextはuseAuthフック（src/hooks/useAuth.ts）で使用するためエクスポートしています。
 * React Fast Refreshの警告は、このコンテキストエクスポートが必要なため抑制しています。
 */
// eslint-disable-next-line react-refresh/only-export-components
export const AuthContext = createContext<AuthContextValue | undefined>(undefined);

/**
 * 認証コンテキストプロバイダーのプロパティ
 */
export interface AuthProviderProps {
  children: ReactNode;
}

/**
 * 認証コンテキストプロバイダー
 */
export function AuthProvider({ children }: AuthProviderProps): ReactElement {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [tokenRefreshManager, setTokenRefreshManager] = useState<TokenRefreshManager | null>(null);

  /**
   * ログイン関数
   */
  const login = useCallback(async (email: string, password: string): Promise<void> => {
    setIsLoading(true);

    try {
      // ログインAPIを呼び出し
      const response = await apiClient.post<{
        user: User;
        accessToken: string;
        refreshToken: string;
        expiresIn?: number;
      }>('/api/v1/auth/login', {
        email,
        password,
      });

      // ユーザー情報を保存
      setUser(response.user);

      // アクセストークンをAPIクライアントに設定
      apiClient.setAccessToken(response.accessToken);

      // リフレッシュトークンをlocalStorageに保存
      localStorage.setItem('refreshToken', response.refreshToken);

      // TokenRefreshManagerを初期化
      // リフレッシュ関数をインラインで定義（循環参照を避けるため）
      const manager = new TokenRefreshManager(async () => {
        const storedRefreshToken = localStorage.getItem('refreshToken');
        if (!storedRefreshToken) {
          throw new Error('No refresh token available');
        }

        // リフレッシュAPIを呼び出し
        const refreshResponse = await apiClient.post<{
          accessToken: string;
          refreshToken?: string;
        }>('/api/v1/auth/refresh', {
          refreshToken: storedRefreshToken,
        });

        // アクセストークンを更新
        apiClient.setAccessToken(refreshResponse.accessToken);

        // リフレッシュトークンを更新（新しいリフレッシュトークンが発行される場合）
        if (refreshResponse.refreshToken) {
          localStorage.setItem('refreshToken', refreshResponse.refreshToken);
        }

        return refreshResponse.accessToken;
      });
      setTokenRefreshManager(manager);

      // APIクライアントのトークンリフレッシュコールバックを設定
      apiClient.setTokenRefreshCallback(() => manager.refreshToken());

      // 自動リフレッシュをスケジュール（expiresInが提供されている場合）
      if (response.expiresIn) {
        manager.scheduleAutoRefresh(response.expiresIn);
      }

      // 他のタブからのトークン更新を監視
      manager.onTokenRefreshed((newAccessToken) => {
        apiClient.setAccessToken(newAccessToken);
      });
    } catch (error) {
      // エラーをそのままスロー
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * ログアウト関数
   */
  const logout = useCallback(async (): Promise<void> => {
    setIsLoading(true);

    try {
      // ログアウトAPIを呼び出し
      await apiClient.post('/api/v1/auth/logout');
    } catch (error) {
      // ログアウトAPIが失敗してもローカルのトークンは削除
      console.error('Logout API failed:', error);
    } finally {
      // ユーザー情報をクリア
      setUser(null);

      // アクセストークンをクリア
      apiClient.setAccessToken(null);

      // リフレッシュトークンをクリア
      localStorage.removeItem('refreshToken');

      // TokenRefreshManagerをクリーンアップ
      if (tokenRefreshManager) {
        tokenRefreshManager.cleanup();
        setTokenRefreshManager(null);
      }

      // APIクライアントのトークンリフレッシュコールバックをクリア
      apiClient.setTokenRefreshCallback(null);

      setIsLoading(false);
    }
  }, [tokenRefreshManager]);

  /**
   * トークンリフレッシュ関数
   */
  const refreshToken = useCallback(async (): Promise<string> => {
    // TokenRefreshManagerが初期化されている場合はそれを使用
    if (tokenRefreshManager) {
      const newAccessToken = await tokenRefreshManager.refreshToken();
      return newAccessToken;
    }

    // TokenRefreshManagerがない場合は直接APIを呼び出し（初期化時など）
    const storedRefreshToken = localStorage.getItem('refreshToken');

    if (!storedRefreshToken) {
      throw new Error('No refresh token available');
    }

    // リフレッシュAPIを呼び出し
    const response = await apiClient.post<{
      accessToken: string;
      refreshToken?: string;
    }>('/api/v1/auth/refresh', {
      refreshToken: storedRefreshToken,
    });

    // アクセストークンを更新
    apiClient.setAccessToken(response.accessToken);

    // リフレッシュトークンを更新（新しいリフレッシュトークンが発行される場合）
    if (response.refreshToken) {
      localStorage.setItem('refreshToken', response.refreshToken);
    }

    return response.accessToken;
  }, [tokenRefreshManager]);

  /**
   * コンポーネントマウント時の初期化処理
   */
  useEffect(() => {
    // ページロード時にlocalStorageからリフレッシュトークンを取得し、セッションを復元
    const storedRefreshToken = localStorage.getItem('refreshToken');

    if (storedRefreshToken) {
      // セッション復元中はローディング状態にする
      setIsLoading(true);

      // トークンリフレッシュを実行してセッションを復元
      refreshToken()
        .then(async () => {
          // リフレッシュ成功後、ユーザー情報を取得
          const response = await apiClient.get<{ user: User }>('/api/v1/auth/me');
          setUser(response.user);
        })
        .catch(() => {
          // リフレッシュ失敗時はlocalStorageをクリア
          localStorage.removeItem('refreshToken');
        })
        .finally(() => {
          // ローディング状態を解除
          setIsLoading(false);
        });
    }

    // クリーンアップ関数
    return () => {
      if (tokenRefreshManager) {
        tokenRefreshManager.cleanup();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // 初回マウント時のみ実行（refreshToken は意図的に依存配列から除外）

  const value: AuthContextValue = useMemo(
    () => ({
      isAuthenticated: user !== null,
      user,
      isLoading,
      login,
      logout,
      refreshToken,
    }),
    [user, isLoading, login, logout, refreshToken]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * useAuthフックは src/hooks/useAuth.ts に移動しました。
 * React Fast Refreshの最適化のため、フックとコンポーネントを分離しています。
 *
 * 使用方法:
 * import { useAuth } from '../hooks/useAuth';
 */
