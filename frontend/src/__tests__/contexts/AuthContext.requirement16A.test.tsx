import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { AuthProvider, AuthContext } from '../../contexts/AuthContext';
import { useContext } from 'react';
import { apiClient } from '../../api/client';

// apiClientをモック化
vi.mock('../../api/client', () => ({
  apiClient: {
    post: vi.fn(),
    get: vi.fn(),
    setAccessToken: vi.fn(),
    setTokenRefreshCallback: vi.fn(),
  },
}));

// TokenRefreshManagerをモック化
vi.mock('../../services/TokenRefreshManager', () => ({
  TokenRefreshManager: vi.fn().mockImplementation((refreshFn: () => Promise<string>) => ({
    refreshToken: refreshFn,
    scheduleAutoRefresh: vi.fn(),
    onTokenRefreshed: vi.fn(),
    cleanup: vi.fn(),
  })),
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

describe('AuthContext - Requirement 16A: UIチラつき防止', () => {
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

    vi.mocked(apiClient.get).mockResolvedValueOnce({
      user: {
        id: '123',
        email: 'test@example.com',
        displayName: 'Test User',
      },
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

    vi.mocked(apiClient.get).mockResolvedValueOnce({
      user: {
        id: '123',
        email: 'test@example.com',
        displayName: 'Test User',
      },
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
    // localStorageにリフレッシュトークンが存在する状態をモック
    vi.mocked(Storage.prototype.getItem).mockReturnValue('invalid-refresh-token');

    // APIクライアントのモック応答を設定（エラー）
    vi.mocked(apiClient.post).mockRejectedValueOnce(new Error('Invalid refresh token'));

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

    // localStorageからrefreshTokenが削除されていることを確認
    expect(localStorage.removeItem).toHaveBeenCalledWith('refreshToken');
  });

  /**
   * Note: タイムアウト機能（5秒）は要件16A.2で定義されていますが、
   * 現在の実装では未実装です。この機能は将来のタスクとして
   * tasks.mdに追加されています。
   */
});
