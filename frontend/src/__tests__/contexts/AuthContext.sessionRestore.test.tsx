import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { AuthProvider, AuthContext } from '../../contexts/AuthContext';
import { useContext } from 'react';
import { ApiError, apiClient } from '../../api/client';

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

// apiClientをモック化（ApiError は実物を使う）
vi.mock('../../api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/client')>();
  return {
    ApiError: actual.ApiError,
    apiClient: {
      post: vi.fn(),
      get: vi.fn(),
      refreshSession: vi.fn(),
      logoutSession: vi.fn(),
      setAccessToken: vi.fn(),
      clearCredentials: vi.fn(),
      setTokenRefreshCallback: vi.fn(),
      setSessionExpiredCallback: vi.fn(),
    },
  };
});

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
    localStorage.clear();
    vi.resetAllMocks();
    vi.restoreAllMocks();
    vi.spyOn(Storage.prototype, 'getItem');
    vi.spyOn(Storage.prototype, 'setItem');
  });

  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  /**
   * 要件16A.1: isLoadingの初期値がtrueであること
   */
  it('should initialize with isLoading=true', () => {
    vi.mocked(apiClient.refreshSession).mockReturnValue(new Promise(() => {}));

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );

    expect(screen.getByTestId('is-loading')).toHaveTextContent('loading');
  });

  /**
   * 要件16A.2・要件33.11: 再読み込みの初期化で Cookie によるリフレッシュを始めること
   *
   * トークンを永続ストレージから読まない（Cookie は HttpOnly でスクリプトから有無を知れない）
   */
  it('should start session restoration with the refresh cookie without reading storage', async () => {
    vi.mocked(apiClient.refreshSession).mockResolvedValueOnce({
      accessToken: 'new-access-token',
      user: { id: '123', email: 'test@example.com', displayName: 'Test User' },
    });
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

    await waitFor(() => {
      expect(apiClient.refreshSession).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(apiClient.get).toHaveBeenCalledWith('/api/v1/auth/me');
    });
    // 本文によるリフレッシュを送らない
    expect(apiClient.post).not.toHaveBeenCalledWith('/api/v1/auth/refresh', expect.anything());
    expect(localStorage.getItem).not.toHaveBeenCalled();
    expect(localStorage.setItem).not.toHaveBeenCalled();
  });

  /**
   * 要件16A.4: セッション復元完了後、isLoadingがfalseになること
   */
  it('should set isLoading=false after session restoration completes successfully', async () => {
    vi.mocked(apiClient.refreshSession).mockResolvedValueOnce({
      accessToken: 'new-access-token',
      user: { id: '123', email: 'test@example.com', displayName: 'Test User' },
    });
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

    expect(screen.getByTestId('is-loading')).toHaveTextContent('loading');

    await waitFor(() => {
      expect(screen.getByTestId('is-loading')).toHaveTextContent('not-loading');
    });

    expect(screen.getByTestId('is-authenticated')).toHaveTextContent('authenticated');
    expect(screen.getByTestId('user')).toHaveTextContent('test@example.com');
    expect(apiClient.setAccessToken).toHaveBeenCalledWith('new-access-token');
  });

  /**
   * 要件16A.5: 保存された認証情報（Cookie）が存在しない場合、ローディング状態を終了
   */
  it('should set isLoading=false when no refresh cookie exists', async () => {
    vi.mocked(apiClient.refreshSession).mockRejectedValueOnce(
      new ApiError(400, 'Refresh token is required')
    );

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('is-loading')).toHaveTextContent('not-loading');
    });

    expect(screen.getByTestId('is-authenticated')).toHaveTextContent('not-authenticated');
    expect(screen.getByTestId('user')).toHaveTextContent('no-user');
    expect(apiClient.get).not.toHaveBeenCalled();
  });

  /**
   * 要件16A.6: セッション復元失敗時、認証情報を破棄しisLoadingをfalseにする
   */
  it('should clear auth info and set isLoading=false when session restoration fails', async () => {
    vi.mocked(apiClient.refreshSession).mockRejectedValue(
      new ApiError(401, 'Invalid refresh token')
    );

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );

    expect(screen.getByTestId('is-loading')).toHaveTextContent('loading');

    await waitFor(() => {
      expect(screen.getByTestId('is-loading')).toHaveTextContent('not-loading');
    });

    expect(screen.getByTestId('is-authenticated')).toHaveTextContent('not-authenticated');
    expect(screen.getByTestId('user')).toHaveTextContent('no-user');
    // メモリの認証情報を消す
    expect(apiClient.clearCredentials).toHaveBeenCalled();
    expect(apiClient.get).not.toHaveBeenCalled();
  });

  /**
   * 要件33.11: 利用者の情報の取得が失敗してもリフレッシュの応答の利用者で復元する
   */
  it('should restore session with the refresh response user when loading the profile fails', async () => {
    vi.mocked(apiClient.refreshSession).mockResolvedValueOnce({
      accessToken: 'new-access-token',
      user: { id: '456', email: 'refreshed@example.com', displayName: 'Refreshed User' },
    });
    vi.mocked(apiClient.get).mockRejectedValueOnce(new Error('Profile unavailable'));

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('is-loading')).toHaveTextContent('not-loading');
    });

    expect(screen.getByTestId('is-authenticated')).toHaveTextContent('authenticated');
    expect(screen.getByTestId('user')).toHaveTextContent('refreshed@example.com');
  });

  /**
   * リフレッシュの応答に利用者が無く、利用者の情報も取れないときはセッションをクリアする
   */
  it('should clear session when the refresh response has no user and the profile also fails', async () => {
    vi.mocked(apiClient.refreshSession).mockResolvedValueOnce({
      accessToken: 'new-access-token',
    });
    vi.mocked(apiClient.get).mockRejectedValueOnce(new Error('401 Unauthorized'));

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('is-loading')).toHaveTextContent('not-loading');
    });

    expect(screen.getByTestId('is-authenticated')).toHaveTextContent('not-authenticated');
    expect(screen.getByTestId('user')).toHaveTextContent('no-user');
    expect(apiClient.clearCredentials).toHaveBeenCalled();
  });

  /**
   * コンポーネントのアンマウント時にクリーンアップが呼ばれることをテスト
   */
  it('should cleanup on unmount', async () => {
    vi.mocked(apiClient.refreshSession).mockRejectedValueOnce(
      new ApiError(400, 'Refresh token is required')
    );

    const { unmount } = render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('is-loading')).toHaveTextContent('not-loading');
    });

    unmount();
  });
});
