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
import { ApiError, apiClient } from '../api/client';
import { TokenRefreshManager } from '../services/TokenRefreshManager';
import { logger } from '../utils/logger';
import { applyUserRestriction, getUserRestriction } from '../utils/user-restriction';

/**
 * ユーザー情報の型定義
 */
export interface User {
  id: string;
  email: string;
  displayName: string;
  roles?: string[];
  permissions?: string[];
  createdAt?: string;
  emailVerified?: boolean;
  /** 2FA 登録済みか（偽なら 2FA 設定の画面だけを開ける。要件34.3） */
  twoFactorEnabled?: boolean;
  /** 初回のパスワード変更を要するか（真なら初回のパスワード変更の画面だけを開ける。要件37.7） */
  mustChangePassword?: boolean;
}

/**
 * 2FA認証の状態
 */
export interface TwoFactorState {
  required: boolean;
  /** ログインの応答の 2FA 待ちの資格（2FA の検証で送る。要件32.1） */
  challengeToken: string;
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
  /** 要件30.14: 操作中のセッション切れ（モーダル表示用） */
  sessionExpiredDuringOperation: boolean;
  twoFactorState: TwoFactorState | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshToken: () => Promise<string>;
  clearSessionExpired: () => void;
  /**
   * 要件30.9, 30.15: 再認証成功時のハンドラー
   *
   * セッション切れモーダルの再認証（パスワードだけ・2FA のどちらも）の応答で、ログイン・2FA の検証と
   * 同じセッションの開始の経路（アクセストークンの更新と TokenRefreshManager の再初期化）を通る
   */
  handleReauthSuccess: (session: ReauthSession) => void;
  /** 要件30.15: ログイン画面遷移ハンドラー */
  navigateToLogin: () => void;
  verify2FA: (code: string) => Promise<void>;
  verifyBackupCode: (code: string) => Promise<void>;
  cancel2FA: () => void;
  /**
   * 応答の利用者とアクセストークンでセッションを始める（招待経由の登録の直後。要件34.5）
   */
  establishSession: (response: SessionStartResponse) => void;
  /**
   * ログイン中の利用者を部分的に更新する（2FA の有効化の応答の状態など。要件34.4）。未ログインでは何もしない
   */
  updateUser: (changes: Partial<User>) => void;
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
 * ログイン・2FA の検証の応答（成功時）
 *
 * 応答本文の `refreshToken` は読まない。リフレッシュトークンは HttpOnly Cookie だけで受け渡す（要件33.8）。
 */
export interface SessionStartResponse {
  user: User;
  accessToken: string;
  expiresIn?: number;
}

/**
 * セッション切れモーダルの再認証の成功の応答（要件30.9）
 *
 * 利用者が応答に無いときは、ログイン中の利用者をそのまま保つ（再認証は同じメールアドレスで行う）。
 */
export interface ReauthSession {
  accessToken: string;
  user?: User;
  expiresIn?: number;
}

/**
 * Cookie のリフレッシュトークンでアクセストークンを更新する TokenRefreshManager を作る
 *
 * アクセストークンは ApiClient のメモリだけに持ち、永続ストレージへ書かない（要件33.10）。
 * リフレッシュはタブ間で直列化され（Web Locks）、他のタブが配ったトークンも ApiClient へ反映する。
 *
 * @param onRefreshedUser リフレッシュの応答の利用者を受け取る（再読み込みの復元に使う。要件33.11）
 */
function createSessionRefreshManager(
  onRefreshedUser?: (user: User | null) => void
): TokenRefreshManager {
  /* v8 ignore next 5 -- @preserve: TokenRefreshManagerのコールバック */
  const manager = new TokenRefreshManager(async () => {
    const response = await apiClient.refreshSession<User>();
    onRefreshedUser?.(response.user ?? null);
    return response.accessToken;
  });
  // 他のタブからのトークン更新を監視
  manager.onTokenRefreshed((newAccessToken) => {
    apiClient.setAccessToken(newAccessToken);
  });
  return manager;
}

/**
 * 初期化のリフレッシュの失敗が「Cookie が無い」ことによるか（未ログインの訪問）
 */
function isMissingRefreshCookie(error: unknown): boolean {
  return error instanceof ApiError && error.statusCode === 400;
}

/**
 * 認証コンテキストプロバイダー
 */
export function AuthProvider({ children }: AuthProviderProps): ReactElement {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isInitialized, setIsInitialized] = useState<boolean>(false);
  const [sessionExpired, setSessionExpired] = useState<boolean>(false);
  /**
   * 現在のセッションの TokenRefreshManager
   *
   * 置き換えるときとアンマウントのときに前のものを片付ける（Broadcast Channel を閉じ、
   * 他のタブの配布で ApiClient のトークンを書き換えないようにする）
   */
  const tokenRefreshManagerRef = useRef<TokenRefreshManager | null>(null);
  const replaceTokenRefreshManager = useCallback((next: TokenRefreshManager | null): void => {
    const previous = tokenRefreshManagerRef.current;
    if (previous && previous !== next) {
      previous.cleanup();
    }
    tokenRefreshManagerRef.current = next;
  }, []);
  const [twoFactorState, setTwoFactorState] = useState<TwoFactorState | null>(null);
  /** 要件30.14: 操作中にセッションが切れた場合のモーダル表示フラグ */
  const [sessionExpiredDuringOperation, setSessionExpiredDuringOperation] =
    useState<boolean>(false);

  // React 18 StrictModeでの重複実行を防ぐためのフラグ
  const initializeStartedRef = useRef<boolean>(false);

  /**
   * ログイン・2FA の検証・セッション切れモーダルの再認証の成功で、トークンの経路を張る
   *
   * アクセストークンは ApiClient のメモリだけに持つ（要件33.10）。リフレッシュトークンは
   * 応答の Set-Cookie で HttpOnly Cookie に置かれ、画面のスクリプトでは扱わない（要件33.8）。
   * 前の TokenRefreshManager は片付けて作り直す（要件30.9）。
   */
  const startTokenSession = useCallback(
    (response: Omit<SessionStartResponse, 'user'>): void => {
      apiClient.setAccessToken(response.accessToken);

      const manager = createSessionRefreshManager();
      replaceTokenRefreshManager(manager);

      // APIクライアントのトークンリフレッシュコールバックを設定
      apiClient.setTokenRefreshCallback(() => manager.refreshToken());

      // 要件30.13: セッション切れコールバックを設定
      apiClient.setSessionExpiredCallback(() => {
        setSessionExpiredDuringOperation(true);
      });

      // 自動リフレッシュをスケジュール（expiresInが提供されている場合）
      /* v8 ignore next 3 */
      if (response.expiresIn) {
        manager.scheduleAutoRefresh(response.expiresIn);
      }
    },
    [replaceTokenRefreshManager]
  );

  /**
   * ログイン・2FA の検証の成功でセッションを始める（利用者を置き、トークンの経路を張る）
   */
  const startSession = useCallback(
    (response: SessionStartResponse): void => {
      setUser(response.user);
      startTokenSession(response);
    },
    [startTokenSession]
  );

  /**
   * ログイン中の利用者を部分的に更新する（未ログインでは何もしない）
   */
  const updateUser = useCallback((changes: Partial<User>): void => {
    setUser((current) => (current ? { ...current, ...changes } : current));
  }, []);

  // 利用者の状態による 403 を受けたら状態を更新し、ProtectedRoute の制限に委ねる（要件34.2・37.7）。
  // 制限中は /me も 403 になるため取り直さず、エラーコードが示す状態を反映する
  useEffect(() => {
    apiClient.setUserStateRestrictionCallback((code) => {
      setUser((current) => (current ? applyUserRestriction(current, code) : current));
    });
    return () => {
      apiClient.setUserStateRestrictionCallback(null);
    };
  }, []);

  /**
   * ログイン関数
   */
  const login = useCallback(
    async (email: string, password: string): Promise<void> => {
      setIsLoading(true);
      // ログイン試行時にセッション期限切れをクリア
      setSessionExpired(false);

      try {
        // ログインAPIを呼び出し
        // バックエンドは成功時: { user, accessToken }（リフレッシュトークンは HttpOnly Cookie だけで渡る）
        // 2FA要求時: { requires2FA: true, challengeToken, expiresIn }（利用者 ID は返らない）
        const response = await apiClient.post<{
          requires2FA?: boolean;
          user?: User;
          accessToken?: string;
          challengeToken?: string;
          expiresIn?: number;
        }>('/api/v1/auth/login', {
          email,
          password,
        });

        // 2FA有効ユーザーの場合は2FA検証画面へ
        if (response.requires2FA) {
          setTwoFactorState({
            required: true,
            challengeToken: response.challengeToken ?? '',
          });
          setIsLoading(false);
          return;
        }

        // 通常ログイン成功時の処理
        if (!response.user || !response.accessToken) {
          throw new Error('Invalid login response format');
        }

        startSession({
          user: response.user,
          accessToken: response.accessToken,
          expiresIn: response.expiresIn,
        });
      } catch (error) {
        // エラーをそのままスロー
        throw error;
      } finally {
        setIsLoading(false);
      }
    },
    [startSession]
  );

  /**
   * ログアウト関数
   */
  const logout = useCallback(async (): Promise<void> => {
    setIsLoading(true);

    try {
      // ログアウトAPIを呼び出し（本文なし・Cookie と X-CSRF-Token。要件33.4, 33.12）
      // リフレッシュトークンの Cookie は応答で backend が消す（HttpOnly のため画面からは消せない）
      await apiClient.logoutSession();
    } catch (error) {
      // ログアウトAPIが失敗してもローカルのトークンは削除
      logger.error('Logout API failed', { error });
    } finally {
      // ユーザー情報をクリア
      setUser(null);

      // メモリのアクセストークンと CSRF トークンをクリア
      apiClient.clearCredentials();

      // TokenRefreshManagerをクリーンアップ
      replaceTokenRefreshManager(null);

      // APIクライアントのトークンリフレッシュコールバックをクリア
      apiClient.setTokenRefreshCallback(null);

      // 要件16.14: 明示的なログアウトではsessionExpiredをfalseに設定
      setSessionExpired(false);

      setIsLoading(false);
    }
  }, [replaceTokenRefreshManager]);

  /**
   * トークンリフレッシュ関数
   */
  const refreshToken = useCallback(async (): Promise<string> => {
    // TokenRefreshManagerが初期化されている場合はそれを使用
    const currentManager = tokenRefreshManagerRef.current;
    if (currentManager) {
      return currentManager.refreshToken();
    }

    // TokenRefreshManagerがない場合（初期化の前など）も、タブ間の直列化を通して Cookie でリフレッシュする
    const temporaryManager = createSessionRefreshManager();
    try {
      return await temporaryManager.refreshToken();
    } finally {
      temporaryManager.cleanup();
    }
  }, []);

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
          user: User;
          expiresIn?: number;
        }>('/api/v1/auth/verify-2fa', {
          challengeToken: twoFactorState.challengeToken,
          code,
        });

        // 2FA成功: 状態をクリアしてログイン完了処理
        setTwoFactorState(null);
        startSession({
          user: response.user,
          accessToken: response.accessToken,
          expiresIn: response.expiresIn,
        });
        /* v8 ignore next */
      } catch (error) {
        throw error;
      } finally {
        setIsLoading(false);
      }
    },
    [twoFactorState, startSession]
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
          user: User;
          expiresIn?: number;
        }>('/api/v1/auth/verify-2fa/backup', {
          challengeToken: twoFactorState.challengeToken,
          backupCode: code,
        });

        // 2FA成功: 状態をクリアしてログイン完了処理
        setTwoFactorState(null);
        startSession({
          user: response.user,
          accessToken: response.accessToken,
          expiresIn: response.expiresIn,
        });
      } catch (error) {
        /* v8 ignore next */
        throw error;
      } finally {
        setIsLoading(false);
      }
    },
    [twoFactorState, startSession]
  );

  /**
   * 2FA認証をキャンセル
   */
  const cancel2FA = useCallback(() => {
    setTwoFactorState(null);
  }, []);

  /**
   * 要件30.9, 30.15: 再認証成功時のハンドラー
   * モーダルでの再認証（パスワードだけ・2FA）の応答でアクセストークンを更新し、TokenRefreshManager を
   * 再初期化してから sessionExpiredDuringOperation をリセットする
   */
  const handleReauthSuccess = useCallback(
    (session: ReauthSession) => {
      if (session.user) {
        setUser(session.user);
      }
      startTokenSession(session);
      setSessionExpiredDuringOperation(false);
    },
    [startTokenSession]
  );

  /**
   * 要件30.15: ログイン画面遷移ハンドラー
   * セッション切れモーダルから「ログイン画面へ移動」を選択した場合
   */
  const navigateToLogin = useCallback(() => {
    // メモリのトークンをクリア
    apiClient.clearCredentials();
    apiClient.setTokenRefreshCallback(null);
    apiClient.setSessionExpiredCallback(null);

    // TokenRefreshManagerをクリーンアップ
    replaceTokenRefreshManager(null);

    // 状態をリセット
    setUser(null);
    setSessionExpiredDuringOperation(false);
    setSessionExpired(true);
  }, [replaceTokenRefreshManager]);

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

      // 再読み込みの初期化: CSRF トークンの取得 → Cookie によるリフレッシュの順で行い、
      // リフレッシュの応答の利用者で復元する（要件33.11）。トークンを永続ストレージから読まない。
      // Cookie は HttpOnly でスクリプトから有無を知れないため、常にリフレッシュを試みる
      // （Cookie が無ければ backend は 400 を返す）。
      let refreshedUser: User | null = null;
      const manager = createSessionRefreshManager((user) => {
        refreshedUser = user;
      });

      try {
        // 期限切れのアクセストークンを Authorization に載せない（リフレッシュは認証を要しない）
        apiClient.setAccessToken(null);

        // CSRF トークンの取得と Cookie によるリフレッシュ（タブ間で直列化される）
        const accessToken = await manager.refreshToken();
        apiClient.setAccessToken(accessToken);

        // 権限（permissions）はリフレッシュの応答に無いため、利用者の情報を取り直して補う。
        // 取り直せないときはリフレッシュの応答の利用者で復元する。
        // 制限中の利用者（2FA 未登録・初回のパスワード変更中）は /me も 403 になるため取り直さない（要件34.2）
        let restoredUser: User | null = refreshedUser;
        if (!getUserRestriction(refreshedUser)) {
          try {
            restoredUser = await apiClient.get<User>('/api/v1/auth/me');
          } catch (meError) {
            if (!restoredUser) {
              throw meError;
            }
            logger.warn('Failed to load user profile, restoring with the refresh response', {
              error: meError,
            });
          }
        }
        setUser(restoredUser);

        replaceTokenRefreshManager(manager);

        // APIクライアントのトークンリフレッシュコールバックを設定
        apiClient.setTokenRefreshCallback(() => manager.refreshToken());

        // 要件30.13: セッション切れコールバックを設定（セッション復元後）
        apiClient.setSessionExpiredCallback(() => {
          setSessionExpiredDuringOperation(true);
        });
      } catch (error) {
        manager.cleanup();
        apiClient.clearCredentials();
        setUser(null);

        if (isMissingRefreshCookie(error)) {
          // Cookie が無い（ログインしていない訪問）。セッション切れとしては扱わない
          logger.debug('No refresh cookie, not authenticated');
        } else {
          logger.error('Session restoration failed', { error });
          // セッション復元に失敗 = セッション期限切れとみなす（要件16.8）
          // Cookie が拒否されたとき（401）は backend が応答で Cookie を消している
          setSessionExpired(true);
        }
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
      replaceTokenRefreshManager(null);
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
      sessionExpiredDuringOperation,
      twoFactorState,
      login,
      logout,
      refreshToken,
      clearSessionExpired,
      handleReauthSuccess,
      navigateToLogin,
      verify2FA,
      verifyBackupCode,
      cancel2FA,
      establishSession: startSession,
      updateUser,
    }),
    [
      user,
      isLoading,
      isInitialized,
      sessionExpired,
      sessionExpiredDuringOperation,
      twoFactorState,
      login,
      logout,
      refreshToken,
      clearSessionExpired,
      handleReauthSuccess,
      navigateToLogin,
      verify2FA,
      verifyBackupCode,
      cancel2FA,
      startSession,
      updateUser,
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
