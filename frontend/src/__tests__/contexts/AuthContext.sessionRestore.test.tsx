import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { AuthProvider, AuthContext } from '../../contexts/AuthContext';
import { useContext } from 'react';
import { apiClient } from '../../api/client';

// loggerをモック（テスト出力をクリーンに保つため）
vi.mock('../../utils/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    exception: vi.fn(),
  },
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    exception: vi.fn(),
  },
}));

// apiClientをモック化
vi.mock('../../api/client', () => ({
  apiClient: {
    post: vi.fn(),
    get: vi.fn(),
    setAccessToken: vi.fn(),
    setTokenRefreshCallback: vi.fn(),
  },
}));

// TokenRefreshManagerをモック化（Vitest 4.x対応: クラスとしてモック）
vi.mock('../../services/TokenRefreshManager', () => ({
  TokenRefreshManager: class MockTokenRefreshManager {
    refreshToken: () => Promise<string>;
    scheduleAutoRefresh = vi.fn();
    onTokenRefreshed = vi.fn();
    cleanup = vi.fn();

    constructor(refreshFn: () => Promise<string>) {
      this.refreshToken = refreshFn;
    }
  },
}));

// テスト用コンポーネント: AuthContextの値を表示
function TestComponent() {
  const context = useContext(AuthContext);
  if (!context) {
    return <div>Context not available</div>;
  }
  return (
    <div>
      <div data-testid="is-loading">{context.isLoading ? 'loading' : 'not-loading'}</div>
      <div data-testid="is-authenticated">
        {context.isAuthenticated ? 'authenticated' : 'not-authenticated'}
      </div>
      <div data-testid="user">{context.user ? context.user.email : 'no-user'}</div>
    </div>
  );
}

describe('AuthContext - セッション復元とUIチラつき防止', () => {
  beforeEach(() => {
    // localStorageをクリア
    localStorage.clear();

    // モックをリセット
    vi.clearAllMocks();
    vi.restoreAllMocks();

    // 新しいspyを作成
    vi.spyOn(Storage.prototype, 'getItem');
    vi.spyOn(Storage.prototype, 'setItem');
    vi.spyOn(Storage.prototype, 'removeItem');
  });

  afterEach(() => {
    // クリーンアップ
    localStorage.clear();
    vi.restoreAllMocks();
  });

  /**
   * 要件16A.1: isLoadingの初期値がtrueであること
   *
   * WHEN システムがページをロードする
   * THEN システムは認証状態を確認するまでローディング状態を維持しなければならない
   */
  it('should initialize with isLoading=true', () => {
    // localStorage.getItemが何も返さないようにモック
    vi.mocked(Storage.prototype.getItem).mockReturnValue(null);

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );

    // 初期状態でisLoading=trueであることを確認
    expect(screen.getByTestId('is-loading')).toHaveTextContent('loading');
  });

  /**
   * 要件16A.2: localStorageにトークンが存在する場合、セッション復元処理が開始されること
   *
   * WHEN 保存された認証情報が存在する
   * THEN システムはセッション復元処理を開始しなければならない（タイムアウト: 5秒）
   */
  it('should start session restoration when refreshToken exists in localStorage', async () => {
    // localStorageにリフレッシュトークンが存在する状態をモック
    vi.mocked(Storage.prototype.getItem).mockReturnValue('mock-refresh-token');

    // APIクライアントのモック応答を設定
    vi.mocked(apiClient.post).mockResolvedValueOnce({
      accessToken: 'new-access-token',
      refreshToken: 'new-refresh-token',
    });

    // /api/v1/auth/me は直接ユーザーオブジェクトを返す
    vi.mocked(apiClient.get).mockResolvedValueOnce({
      id: '123',
      email: 'test@example.com',
      displayName: 'Test User',
    });

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );

    // セッション復元処理が開始されることを確認
    await waitFor(() => {
      // /api/v1/auth/refreshが呼ばれたことを確認
      expect(apiClient.post).toHaveBeenCalledWith('/api/v1/auth/refresh', {
        refreshToken: 'mock-refresh-token',
      });
    });

    // ユーザー情報取得APIが呼ばれたことを確認
    await waitFor(() => {
      expect(apiClient.get).toHaveBeenCalledWith('/api/v1/auth/me');
    });
  });

  /**
   * 要件16A.4: セッション復元完了後、isLoadingがfalseになること
   *
   * WHEN 認証状態確認が完了する
   * THEN システムはローディング状態を終了しなければならない
   */
  it('should set isLoading=false after session restoration completes successfully', async () => {
    // localStorageにリフレッシュトークンが存在する状態をモック
    vi.mocked(Storage.prototype.getItem).mockReturnValue('mock-refresh-token');

    // APIクライアントのモック応答を設定
    vi.mocked(apiClient.post).mockResolvedValueOnce({
      accessToken: 'new-access-token',
      refreshToken: 'new-refresh-token',
    });

    // /api/v1/auth/me は直接ユーザーオブジェクトを返す
    vi.mocked(apiClient.get).mockResolvedValueOnce({
      id: '123',
      email: 'test@example.com',
      displayName: 'Test User',
    });

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );

    // 初期状態でisLoading=trueを確認
    expect(screen.getByTestId('is-loading')).toHaveTextContent('loading');

    // セッション復元完了後、isLoading=falseになることを確認
    await waitFor(() => {
      expect(screen.getByTestId('is-loading')).toHaveTextContent('not-loading');
    });

    // ユーザー情報が設定されていることを確認
    expect(screen.getByTestId('is-authenticated')).toHaveTextContent('authenticated');
    expect(screen.getByTestId('user')).toHaveTextContent('test@example.com');
  });

  /**
   * 要件16A.5: 保存された認証情報が存在しない場合、即座にローディング状態を終了
   *
   * IF 保存された認証情報が存在しない
   * THEN システムは即座にローディング状態を終了しなければならない
   */
  it('should immediately set isLoading=false when no refreshToken exists', async () => {
    // localStorage.getItemがnullを返すようにモック
    vi.mocked(Storage.prototype.getItem).mockReturnValue(null);

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );

    // 即座にisLoading=falseになることを確認
    await waitFor(() => {
      expect(screen.getByTestId('is-loading')).toHaveTextContent('not-loading');
    });

    // 未認証状態であることを確認
    expect(screen.getByTestId('is-authenticated')).toHaveTextContent('not-authenticated');
    expect(screen.getByTestId('user')).toHaveTextContent('no-user');
  });

  /**
   * 要件16A.6: セッション復元失敗時、認証情報を破棄しisLoadingをfalseにする
   *
   * WHEN 認証状態確認が失敗する
   * THEN システムは認証情報を破棄し、ローディング状態を終了しなければならない
   */
  it('should clear auth info and set isLoading=false when session restoration fails', async () => {
    // localStorageにリフレッシュトークンとアクセストークンが存在する状態をモック
    vi.mocked(Storage.prototype.getItem).mockImplementation((key: string) => {
      if (key === 'refreshToken') return 'invalid-refresh-token';
      if (key === 'accessToken') return 'invalid-access-token';
      return null;
    });

    // APIクライアントのモック応答を設定（認証エラーでリフレッシュ失敗）
    // 「Invalid」を含むエラーは認証エラーとして扱われ、フォールバックは試行されない
    vi.mocked(apiClient.post).mockRejectedValueOnce(new Error('Invalid refresh token'));

    // 注: 認証エラー（エラーメッセージに'Invalid'を含む）の場合、
    // フォールバックは試行されないため、apiClient.getのモックは不要

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );

    // 初期状態でisLoading=trueを確認
    expect(screen.getByTestId('is-loading')).toHaveTextContent('loading');

    // セッション復元失敗後、isLoading=falseになることを確認
    await waitFor(() => {
      expect(screen.getByTestId('is-loading')).toHaveTextContent('not-loading');
    });

    // 未認証状態であることを確認
    expect(screen.getByTestId('is-authenticated')).toHaveTextContent('not-authenticated');
    expect(screen.getByTestId('user')).toHaveTextContent('no-user');

    // localStorageからrefreshTokenとaccessTokenが削除されていることを確認
    expect(localStorage.removeItem).toHaveBeenCalledWith('refreshToken');
    expect(localStorage.removeItem).toHaveBeenCalledWith('accessToken');
  });

  /**
   * 要件16A.7: リフレッシュ失敗時でも既存トークンで認証を試みる（CI安定性向上）
   *
   * WHEN リフレッシュAPIが失敗する
   * AND 既存のアクセストークンがlocalStorageに存在する
   * AND 既存トークンでユーザー情報取得が成功する
   * THEN システムは認証状態を維持しなければならない
   */
  it('should restore session with existing token when refresh fails but token is still valid', async () => {
    // localStorageにリフレッシュトークンとアクセストークンが存在する状態をモック
    vi.mocked(Storage.prototype.getItem).mockImplementation((key: string) => {
      if (key === 'refreshToken') return 'valid-refresh-token';
      if (key === 'accessToken') return 'still-valid-access-token';
      return null;
    });

    // リフレッシュAPIは失敗（CI環境での遅延・タイムアウトをシミュレート）
    vi.mocked(apiClient.post).mockRejectedValueOnce(new Error('Refresh timeout'));

    // 既存トークンでのユーザー情報取得は成功（トークンがまだ有効）
    vi.mocked(apiClient.get).mockResolvedValueOnce({
      id: '456',
      email: 'fallback@example.com',
      displayName: 'Fallback User',
    });

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );

    // 初期状態でisLoading=trueを確認
    expect(screen.getByTestId('is-loading')).toHaveTextContent('loading');

    // セッション復元完了後、isLoading=falseになることを確認
    await waitFor(() => {
      expect(screen.getByTestId('is-loading')).toHaveTextContent('not-loading');
    });

    // 認証状態が維持されていることを確認
    expect(screen.getByTestId('is-authenticated')).toHaveTextContent('authenticated');
    expect(screen.getByTestId('user')).toHaveTextContent('fallback@example.com');

    // 既存トークンでsetAccessTokenが呼ばれたことを確認
    expect(apiClient.setAccessToken).toHaveBeenCalledWith('still-valid-access-token');
  });

  /**
   * Note: タイムアウト機能（5秒）は要件16A.2で定義されていますが、
   * 現在の実装では未実装です。この機能は将来のタスクとして
   * tasks.mdに追加されています。
   */
});
