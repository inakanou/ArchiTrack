import {
  createContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
  ReactNode,
  ReactElement,
} from 'react';
import { apiClient } from '../api/client';
import { TokenRefreshManager } from '../services/TokenRefreshManager';
import { logger } from '../utils/logger';

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
 * 2FA認証の状態
 */
export interface TwoFactorState {
  required: boolean;
  email: string;
}

/**
 * 認証コンテキストの型定義
 */
export interface AuthContextValue {
  isAuthenticated: boolean;
  user: User | null;
  isLoading: boolean;
  isInitialized: boolean;
  sessionExpired: boolean;
  twoFactorState: TwoFactorState | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshToken: () => Promise<string>;
  clearSessionExpired: () => void;
  verify2FA: (code: string) => Promise<void>;
  verifyBackupCode: (code: string) => Promise<void>;
  cancel2FA: () => void;
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
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isInitialized, setIsInitialized] = useState<boolean>(false);
  const [sessionExpired, setSessionExpired] = useState<boolean>(false);
  const [tokenRefreshManager, setTokenRefreshManager] = useState<TokenRefreshManager | null>(null);
  const [twoFactorState, setTwoFactorState] = useState<TwoFactorState | null>(null);

  // React 18 StrictModeでの重複実行を防ぐためのフラグ
  const initializeStartedRef = useRef<boolean>(false);

  /**
   * ログイン関数
   */
  const login = useCallback(async (email: string, password: string): Promise<void> => {
    setIsLoading(true);
    // ログイン試行時にセッション期限切れをクリア
    setSessionExpired(false);

    try {
      // ログインAPIを呼び出し
      // バックエンドは成功時: { user, accessToken, refreshToken }
      // 2FA要求時: { requires2FA: true, userId }
      const response = await apiClient.post<{
        requires2FA?: boolean;
        user?: User;
        accessToken?: string;
        refreshToken?: string;
        userId?: string;
        expiresIn?: number;
      }>('/api/v1/auth/login', {
        email,
        password,
      });

      // 2FA有効ユーザーの場合は2FA検証画面へ
      if (response.requires2FA) {
        setTwoFactorState({
          required: true,
          email: email,
        });
        setIsLoading(false);
        return;
      }

      // 通常ログイン成功時の処理
      if (!response.user || !response.accessToken || !response.refreshToken) {
        throw new Error('Invalid login response format');
      }

      // ユーザー情報を保存
      setUser(response.user);

      // アクセストークンをAPIクライアントに設定
      apiClient.setAccessToken(response.accessToken);

      // アクセストークンをlocalStorageにも保存（E2Eテストでの認証状態確認用）
      localStorage.setItem('accessToken', response.accessToken);

      // リフレッシュトークンをlocalStorageに保存
      localStorage.setItem('refreshToken', response.refreshToken);

      // TokenRefreshManagerを初期化
      // リフレッシュ関数をインラインで定義（循環参照を避けるため）
      /* v8 ignore next 27 -- @preserve: TokenRefreshManagerのコールバック */
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

        // アクセストークンをlocalStorageにも保存
        localStorage.setItem('accessToken', refreshResponse.accessToken);

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
      /* v8 ignore next 3 */
      if (response.expiresIn) {
        manager.scheduleAutoRefresh(response.expiresIn);
      }

      // 他のタブからのトークン更新を監視
      /* v8 ignore next 4 */
      manager.onTokenRefreshed((newAccessToken) => {
        apiClient.setAccessToken(newAccessToken);
        localStorage.setItem('accessToken', newAccessToken);
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
      logger.error('Logout API failed', { error });
    } finally {
      // ユーザー情報をクリア
      setUser(null);

      // アクセストークンをクリア
      apiClient.setAccessToken(null);

      // localStorageからトークンをクリア
      localStorage.removeItem('refreshToken');
      localStorage.removeItem('accessToken');

      // TokenRefreshManagerをクリーンアップ
      if (tokenRefreshManager) {
        tokenRefreshManager.cleanup();
        setTokenRefreshManager(null);
      }

      // APIクライアントのトークンリフレッシュコールバックをクリア
      apiClient.setTokenRefreshCallback(null);

      // 要件16.14: 明示的なログアウトではsessionExpiredをfalseに設定
      setSessionExpired(false);

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
    // アクセストークンをlocalStorageにも保存
    localStorage.setItem('accessToken', response.accessToken);

    // リフレッシュトークンを更新（新しいリフレッシュトークンが発行される場合）
    if (response.refreshToken) {
      localStorage.setItem('refreshToken', response.refreshToken);
    }

    return response.accessToken;
  }, [tokenRefreshManager]);

  /**
   * セッション期限切れフラグをクリア
   */
  const clearSessionExpired = useCallback(() => {
    setSessionExpired(false);
  }, []);

  /**
   * 2FA TOTPコード検証
   */
  const verify2FA = useCallback(
    async (code: string): Promise<void> => {
      if (!twoFactorState) {
        throw new Error('2FA state not available');
      }

      setIsLoading(true);

      try {
        const response = await apiClient.post<{
          accessToken: string;
          refreshToken: string;
          user: User;
          expiresIn?: number;
        }>('/api/v1/auth/verify-2fa', {
          token: code,
          email: twoFactorState.email,
        });

        // 2FA成功: 状態をクリアしてログイン完了処理
        setTwoFactorState(null);
        setUser(response.user);
        apiClient.setAccessToken(response.accessToken);
        localStorage.setItem('refreshToken', response.refreshToken);
        // アクセストークンをlocalStorageにも保存（E2Eテストでの認証状態確認用）
        localStorage.setItem('accessToken', response.accessToken);

        // TokenRefreshManagerを初期化
        /* v8 ignore next 24 -- @preserve: TokenRefreshManagerのコールバック */
        const manager = new TokenRefreshManager(async () => {
          const storedRefreshToken = localStorage.getItem('refreshToken');
          if (!storedRefreshToken) {
            throw new Error('No refresh token available');
          }

          const refreshResponse = await apiClient.post<{
            accessToken: string;
            refreshToken?: string;
          }>('/api/v1/auth/refresh', {
            refreshToken: storedRefreshToken,
          });

          apiClient.setAccessToken(refreshResponse.accessToken);
          // アクセストークンをlocalStorageにも保存
          localStorage.setItem('accessToken', refreshResponse.accessToken);

          if (refreshResponse.refreshToken) {
            localStorage.setItem('refreshToken', refreshResponse.refreshToken);
          }

          return refreshResponse.accessToken;
        });
        setTokenRefreshManager(manager);
        apiClient.setTokenRefreshCallback(() => manager.refreshToken());

        /* v8 ignore next 3 */
        if (response.expiresIn) {
          manager.scheduleAutoRefresh(response.expiresIn);
        }

        /* v8 ignore next 4 */
        manager.onTokenRefreshed((newAccessToken) => {
          apiClient.setAccessToken(newAccessToken);
          localStorage.setItem('accessToken', newAccessToken);
        });
        /* v8 ignore next */
      } catch (error) {
        throw error;
      } finally {
        setIsLoading(false);
      }
    },
    [twoFactorState]
  );

  /**
   * 2FAバックアップコード検証
   */
  const verifyBackupCode = useCallback(
    async (code: string): Promise<void> => {
      if (!twoFactorState) {
        throw new Error('2FA state not available');
      }

      setIsLoading(true);

      try {
        // バックアップコード専用のエンドポイントで検証
        const response = await apiClient.post<{
          accessToken: string;
          refreshToken: string;
          user: User;
          expiresIn?: number;
        }>('/api/v1/auth/verify-2fa/backup', {
          backupCode: code,
          email: twoFactorState.email,
        });

        // 2FA成功: 状態をクリアしてログイン完了処理
        setTwoFactorState(null);
        setUser(response.user);
        apiClient.setAccessToken(response.accessToken);
        localStorage.setItem('refreshToken', response.refreshToken);
        // アクセストークンをlocalStorageにも保存（E2Eテストでの認証状態確認用）
        localStorage.setItem('accessToken', response.accessToken);

        // TokenRefreshManagerを初期化
        const manager = new TokenRefreshManager(async () => {
          const storedRefreshToken = localStorage.getItem('refreshToken');
          if (!storedRefreshToken) {
            throw new Error('No refresh token available');
          }

          const refreshResponse = await apiClient.post<{
            accessToken: string;
            refreshToken?: string;
          }>('/api/v1/auth/refresh', {
            refreshToken: storedRefreshToken,
          });

          apiClient.setAccessToken(refreshResponse.accessToken);
          // アクセストークンをlocalStorageにも保存
          localStorage.setItem('accessToken', refreshResponse.accessToken);

          if (refreshResponse.refreshToken) {
            localStorage.setItem('refreshToken', refreshResponse.refreshToken);
          }

          return refreshResponse.accessToken;
        });
        setTokenRefreshManager(manager);
        apiClient.setTokenRefreshCallback(() => manager.refreshToken());

        /* v8 ignore next 3 */
        if (response.expiresIn) {
          manager.scheduleAutoRefresh(response.expiresIn);
        }

        manager.onTokenRefreshed((newAccessToken) => {
          apiClient.setAccessToken(newAccessToken);
          localStorage.setItem('accessToken', newAccessToken);
        });
      } catch (error) {
        /* v8 ignore next */
        throw error;
      } finally {
        setIsLoading(false);
      }
    },
    [twoFactorState]
  );

  /**
   * 2FA認証をキャンセル
   */
  const cancel2FA = useCallback(() => {
    setTwoFactorState(null);
  }, []);

  /**
   * コンポーネントマウント時の初期化処理
   */
  useEffect(() => {
    const initializeAuth = async () => {
      // React 18 StrictModeでの重複実行を防ぐ
      // トークンローテーションにより、2回目のリフレッシュが古いトークンで失敗するのを防止
      /* v8 ignore next 4 */
      if (initializeStartedRef.current) {
        logger.debug('initializeAuth already started, skipping duplicate execution');
        return;
      }
      initializeStartedRef.current = true;

      // ページロード時にlocalStorageからリフレッシュトークンを取得し、セッションを復元
      const storedRefreshToken = localStorage.getItem('refreshToken');
      const storedAccessToken = localStorage.getItem('accessToken');

      if (!storedRefreshToken) {
        // リフレッシュトークンが存在しない場合も初期化完了
        // 既存のaccessTokenがあれば設定（リフレッシュ不要のケース）
        if (storedAccessToken) {
          apiClient.setAccessToken(storedAccessToken);
        }
        setIsLoading(false);
        setIsInitialized(true);
        return;
      }

      try {
        // 要件16.21: 開発環境ではトークン有効期限切れをコンソールにログ出力
        logger.debug('Access token expired or missing, refreshing session...');

        // リフレッシュAPIを呼び出し
        // 注意: リフレッシュAPIは認証不要なので、accessTokenをクリアしてから呼び出す
        // 古いaccessTokenがAuthorizationヘッダーに付加されると401が返される可能性がある
        apiClient.setAccessToken(null);

        // リフレッシュAPIを呼び出し（APIクライアントがリトライを自動処理）
        const refreshResponse = await apiClient.post<{
          accessToken: string;
          refreshToken?: string;
        }>('/api/v1/auth/refresh', {
          refreshToken: storedRefreshToken,
        });

        // アクセストークンを更新
        apiClient.setAccessToken(refreshResponse.accessToken);

        // アクセストークンをlocalStorageにも保存
        localStorage.setItem('accessToken', refreshResponse.accessToken);

        // リフレッシュトークンを更新（新しいリフレッシュトークンが発行される場合）
        if (refreshResponse.refreshToken) {
          localStorage.setItem('refreshToken', refreshResponse.refreshToken);
        }

        // ユーザー情報を取得（APIクライアントがリトライを自動処理）
        const userResponse = await apiClient.get<User>('/api/v1/auth/me');
        setUser(userResponse);

        // TokenRefreshManagerを初期化
        /* v8 ignore next 24 -- @preserve */
        const manager = new TokenRefreshManager(async () => {
          const currentRefreshToken = localStorage.getItem('refreshToken');
          if (!currentRefreshToken) {
            throw new Error('No refresh token available');
          }

          const response = await apiClient.post<{
            accessToken: string;
            refreshToken?: string;
          }>('/api/v1/auth/refresh', {
            refreshToken: currentRefreshToken,
          });

          apiClient.setAccessToken(response.accessToken);

          // アクセストークンをlocalStorageにも保存
          localStorage.setItem('accessToken', response.accessToken);

          if (response.refreshToken) {
            localStorage.setItem('refreshToken', response.refreshToken);
          }

          return response.accessToken;
        });
        setTokenRefreshManager(manager);

        // APIクライアントのトークンリフレッシュコールバックを設定
        apiClient.setTokenRefreshCallback(() => manager.refreshToken());

        // 他のタブからのトークン更新を監視
        manager.onTokenRefreshed((newAccessToken) => {
          apiClient.setAccessToken(newAccessToken);
          localStorage.setItem('accessToken', newAccessToken);
        });
      } catch (error) {
        // エラーの種類を判定
        // 401エラー（認証失敗）の場合はフォールバックしない（セキュリティ上の理由でセッションが無効化された可能性）
        // ネットワークエラーやタイムアウトの場合のみフォールバックを試みる
        const isAuthError =
          error instanceof Error &&
          (error.message.includes('401') ||
            error.message.includes('Unauthorized') ||
            error.message.includes('Invalid') ||
            error.message.includes('expired'));

        // リフレッシュ失敗時でも、既存のaccessTokenでユーザー情報取得を試みる
        // ただし、認証エラー（401）の場合はフォールバックしない（セッション無効化を尊重）
        // CI環境などでリフレッシュAPIが遅延・タイムアウトした場合のみフォールバック
        if (storedAccessToken && !isAuthError) {
          try {
            logger.debug('Refresh failed (network error), trying with existing access token...');
            apiClient.setAccessToken(storedAccessToken);
            const userResponse = await apiClient.get<User>('/api/v1/auth/me');
            setUser(userResponse);
            // 既存トークンで成功した場合は認証状態を維持
            logger.debug('Session restored with existing access token');
            setIsLoading(false);
            setIsInitialized(true);
            return;
          } catch (userError) {
            // 既存トークンでも失敗した場合は本当にセッション切れ
            logger.error('Session restoration failed with existing token', { error: userError });
          }
        }

        // 完全に失敗した場合のみlocalStorageをクリア
        logger.error('Session restoration failed', { error });
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('accessToken');
        apiClient.setAccessToken(null);
        setUser(null);
        // 要件16.19: Cookieからもリフレッシュトークンを削除
        document.cookie = 'refreshToken=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
        // セッション復元に失敗 = セッション期限切れとみなす（要件16.8）
        setSessionExpired(true);
      } finally {
        // 初期化完了
        setIsLoading(false);
        setIsInitialized(true);
      }
    };

    initializeAuth();

    // クリーンアップ関数
    /* v8 ignore next 5 -- @preserve */
    return () => {
      if (tokenRefreshManager) {
        tokenRefreshManager.cleanup();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // 初回マウント時のみ実行

  const value: AuthContextValue = useMemo(
    () => ({
      isAuthenticated: user !== null,
      user,
      isLoading,
      isInitialized,
      sessionExpired,
      twoFactorState,
      login,
      logout,
      refreshToken,
      clearSessionExpired,
      verify2FA,
      verifyBackupCode,
      cancel2FA,
    }),
    [
      user,
      isLoading,
      isInitialized,
      sessionExpired,
      twoFactorState,
      login,
      logout,
      refreshToken,
      clearSessionExpired,
      verify2FA,
      verifyBackupCode,
      cancel2FA,
    ]
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
