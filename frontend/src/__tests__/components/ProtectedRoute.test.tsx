import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ProtectedRoute } from '../../components/ProtectedRoute';
import { AuthContext, AuthContextValue } from '../../contexts/AuthContext';

// テスト用コンポーネント
function ProtectedContent() {
  return <div data-testid="protected-content">Protected Content</div>;
}

function LoginPage() {
  return <div data-testid="login-page">Login Page</div>;
}

// AuthContextのモック値を作成するヘルパー関数
function createMockAuthContextValue(overrides: Partial<AuthContextValue> = {}): AuthContextValue {
  return {
    isAuthenticated: false,
    user: null,
    isLoading: false,
    isInitialized: true,
    sessionExpired: false,
    twoFactorState: null,
    login: vi.fn(),
    logout: vi.fn(),
    refreshToken: vi.fn(),
    clearSessionExpired: vi.fn(),
    verify2FA: vi.fn(),
    verifyBackupCode: vi.fn(),
    cancel2FA: vi.fn(),
    ...overrides,
  };
}

describe('ProtectedRoute - Requirement 16A: UIチラつき防止', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * 要件16A.7: isLoading=trueの間、ローディングインジケーターが表示されること
   *
   * WHEN ローディング状態が有効である
   * THEN システムはローディングインジケーターを表示しなければならない
   */
  it('should display loading indicator when isLoading=true', () => {
    const mockAuthValue = createMockAuthContextValue({
      isLoading: true,
      isAuthenticated: false,
    });

    render(
      <AuthContext.Provider value={mockAuthValue}>
        <MemoryRouter initialEntries={['/dashboard']}>
          <Routes>
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <ProtectedContent />
                </ProtectedRoute>
              }
            />
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>
    );

    // ローディングインジケーターが表示されていることを確認
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByText('認証状態を確認中...')).toBeInTheDocument();

    // 保護されたコンテンツは表示されないことを確認
    expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
  });

  /**
   * 要件16A.8: ローディングインジケーターにWCAG 2.1 AA準拠の属性が設定されていること
   *
   * WHEN ローディングインジケーターが表示される
   * THEN システムはアクセシビリティ属性（aria-label, role="status", aria-live="polite"）を設定しなければならない
   */
  it('should have WCAG 2.1 AA compliant attributes on loading indicator', () => {
    const mockAuthValue = createMockAuthContextValue({
      isLoading: true,
      isAuthenticated: false,
    });

    render(
      <AuthContext.Provider value={mockAuthValue}>
        <MemoryRouter initialEntries={['/dashboard']}>
          <Routes>
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <ProtectedContent />
                </ProtectedRoute>
              }
            />
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>
    );

    const loadingIndicator = screen.getByRole('status');

    // WCAG 2.1 AA準拠の属性が設定されていることを確認
    expect(loadingIndicator).toHaveAttribute('role', 'status');
    expect(loadingIndicator).toHaveAttribute('aria-label', '認証状態を確認中');
    expect(loadingIndicator).toHaveAttribute('aria-live', 'polite');
  });

  /**
   * 要件16A.9: isLoading=falseかつ認証済みの場合、保護されたコンテンツが表示されること
   *
   * WHEN ローディング状態が終了する AND 認証状態に基づいて
   * THEN システムは認証済みの場合、保護されたコンテンツを表示しなければならない
   */
  it('should display protected content when isLoading=false and authenticated', () => {
    const mockAuthValue = createMockAuthContextValue({
      isLoading: false,
      isAuthenticated: true,
      user: {
        id: '123',
        email: 'test@example.com',
        displayName: 'Test User',
      },
    });

    render(
      <AuthContext.Provider value={mockAuthValue}>
        <MemoryRouter initialEntries={['/dashboard']}>
          <Routes>
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <ProtectedContent />
                </ProtectedRoute>
              }
            />
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>
    );

    // 保護されたコンテンツが表示されていることを確認
    expect(screen.getByTestId('protected-content')).toBeInTheDocument();
    expect(screen.getByText('Protected Content')).toBeInTheDocument();

    // ローディングインジケーターは表示されないことを確認
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  /**
   * 要件16A.10: isLoading=falseかつ未認証の場合、ログイン画面にリダイレクトされること
   *
   * WHEN ローディング状態が終了する AND 認証状態に基づいて
   * THEN システムは未認証の場合、ログイン画面にリダイレクトしなければならない
   */
  it('should redirect to login page when isLoading=false and not authenticated', () => {
    const mockAuthValue = createMockAuthContextValue({
      isLoading: false,
      isAuthenticated: false,
      user: null,
    });

    render(
      <AuthContext.Provider value={mockAuthValue}>
        <MemoryRouter initialEntries={['/dashboard']}>
          <Routes>
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <ProtectedContent />
                </ProtectedRoute>
              }
            />
            <Route path="/login" element={<LoginPage />} />
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>
    );

    // ログインページにリダイレクトされていることを確認
    expect(screen.getByTestId('login-page')).toBeInTheDocument();
    expect(screen.getByText('Login Page')).toBeInTheDocument();

    // 保護されたコンテンツは表示されないことを確認
    expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();

    // ローディングインジケーターは表示されないことを確認
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  /**
   * 要件16A.11: isLoading=trueの間、リダイレクトが実行されないこと
   *
   * WHILE ローディング状態が有効である
   * THE システムは認証保護されたページへのリダイレクトを実行してはならない
   */
  it('should not execute redirect while isLoading=true', () => {
    const mockAuthValue = createMockAuthContextValue({
      isLoading: true,
      isAuthenticated: false,
      user: null,
    });

    render(
      <AuthContext.Provider value={mockAuthValue}>
        <MemoryRouter initialEntries={['/dashboard']}>
          <Routes>
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <ProtectedContent />
                </ProtectedRoute>
              }
            />
            <Route path="/login" element={<LoginPage />} />
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>
    );

    // ローディングインジケーターが表示されていることを確認
    expect(screen.getByRole('status')).toBeInTheDocument();

    // ログインページにリダイレクトされていないことを確認
    expect(screen.queryByTestId('login-page')).not.toBeInTheDocument();

    // 保護されたコンテンツも表示されていないことを確認
    expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
  });

  /**
   * 追加テスト: isLoading=trueからfalseへの遷移時の動作確認
   *
   * ローディング状態から認証済み状態への遷移をテスト
   */
  it('should transition from loading to authenticated state correctly', () => {
    const mockAuthValue = createMockAuthContextValue({
      isLoading: false,
      isAuthenticated: true,
      user: {
        id: '123',
        email: 'test@example.com',
        displayName: 'Test User',
      },
    });

    const { rerender } = render(
      <AuthContext.Provider
        value={createMockAuthContextValue({
          isLoading: true,
          isAuthenticated: false,
        })}
      >
        <MemoryRouter initialEntries={['/dashboard']}>
          <Routes>
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <ProtectedContent />
                </ProtectedRoute>
              }
            />
            <Route path="/login" element={<LoginPage />} />
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>
    );

    // 初期状態: ローディング中
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();

    // 状態更新: 認証完了
    rerender(
      <AuthContext.Provider value={mockAuthValue}>
        <MemoryRouter initialEntries={['/dashboard']}>
          <Routes>
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <ProtectedContent />
                </ProtectedRoute>
              }
            />
            <Route path="/login" element={<LoginPage />} />
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>
    );

    // 最終状態: 保護されたコンテンツが表示される
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.getByTestId('protected-content')).toBeInTheDocument();
  });

  /**
   * 要件16A: isInitialized=falseの間、ローディングインジケーターが表示されること
   */
  it('should display loading indicator when isInitialized=false', () => {
    const mockAuthValue = createMockAuthContextValue({
      isInitialized: false,
      isLoading: false,
      isAuthenticated: false,
    });

    render(
      <AuthContext.Provider value={mockAuthValue}>
        <MemoryRouter initialEntries={['/dashboard']}>
          <Routes>
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <ProtectedContent />
                </ProtectedRoute>
              }
            />
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>
    );

    // ローディングインジケーターが表示されていることを確認
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByText('認証状態を確認中...')).toBeInTheDocument();
  });

  /**
   * ロールチェック: requiredRoleが指定されていて、ユーザーがそのロールを持っていない場合
   */
  it('should show access denied when user does not have required role', () => {
    const mockAuthValue = createMockAuthContextValue({
      isLoading: false,
      isAuthenticated: true,
      isInitialized: true,
      user: {
        id: '123',
        email: 'test@example.com',
        displayName: 'Test User',
        roles: ['user'],
      },
    });

    render(
      <AuthContext.Provider value={mockAuthValue}>
        <MemoryRouter initialEntries={['/admin']}>
          <Routes>
            <Route
              path="/admin"
              element={
                <ProtectedRoute requiredRole="admin">
                  <ProtectedContent />
                </ProtectedRoute>
              }
            />
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>
    );

    // アクセス権限エラーが表示されることを確認
    expect(screen.getByText('アクセス権限がありません')).toBeInTheDocument();
    expect(screen.getByText('ホームに戻る')).toBeInTheDocument();
    expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
  });

  /**
   * ロールチェック: requiredRoleが指定されていて、ユーザーがそのロールを持っている場合
   */
  it('should show protected content when user has required role', () => {
    const mockAuthValue = createMockAuthContextValue({
      isLoading: false,
      isAuthenticated: true,
      isInitialized: true,
      user: {
        id: '123',
        email: 'admin@example.com',
        displayName: 'Admin User',
        roles: ['admin', 'user'],
      },
    });

    render(
      <AuthContext.Provider value={mockAuthValue}>
        <MemoryRouter initialEntries={['/admin']}>
          <Routes>
            <Route
              path="/admin"
              element={
                <ProtectedRoute requiredRole="admin">
                  <ProtectedContent />
                </ProtectedRoute>
              }
            />
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>
    );

    // 保護されたコンテンツが表示されることを確認
    expect(screen.getByTestId('protected-content')).toBeInTheDocument();
  });
});

describe('ProtectedRoute - requireAuth=false', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * requireAuth=false: 認証済みユーザーはリダイレクトされること
   */
  it('should redirect authenticated user when requireAuth=false', () => {
    const mockAuthValue = createMockAuthContextValue({
      isLoading: false,
      isAuthenticated: true,
      isInitialized: true,
      user: {
        id: '123',
        email: 'test@example.com',
        displayName: 'Test User',
      },
    });

    render(
      <AuthContext.Provider value={mockAuthValue}>
        <MemoryRouter initialEntries={['/login']}>
          <Routes>
            <Route
              path="/login"
              element={
                <ProtectedRoute requireAuth={false} redirectTo="/dashboard">
                  <LoginPage />
                </ProtectedRoute>
              }
            />
            <Route path="/dashboard" element={<ProtectedContent />} />
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>
    );

    // ダッシュボードにリダイレクトされることを確認
    expect(screen.getByTestId('protected-content')).toBeInTheDocument();
    expect(screen.queryByTestId('login-page')).not.toBeInTheDocument();
  });

  /**
   * requireAuth=false: 未認証ユーザーはログインページを表示すること
   */
  it('should show login page for unauthenticated user when requireAuth=false', () => {
    const mockAuthValue = createMockAuthContextValue({
      isLoading: false,
      isAuthenticated: false,
      isInitialized: true,
    });

    render(
      <AuthContext.Provider value={mockAuthValue}>
        <MemoryRouter initialEntries={['/login']}>
          <Routes>
            <Route
              path="/login"
              element={
                <ProtectedRoute requireAuth={false} redirectTo="/dashboard">
                  <LoginPage />
                </ProtectedRoute>
              }
            />
            <Route path="/dashboard" element={<ProtectedContent />} />
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>
    );

    // ログインページが表示されることを確認
    expect(screen.getByTestId('login-page')).toBeInTheDocument();
    expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
  });

  /**
   * requireAuth=false: stateにfromがある場合、そのパスにリダイレクトすること
   */
  it('should redirect to from path when state contains from', () => {
    const mockAuthValue = createMockAuthContextValue({
      isLoading: false,
      isAuthenticated: true,
      isInitialized: true,
      user: {
        id: '123',
        email: 'test@example.com',
        displayName: 'Test User',
      },
    });

    render(
      <AuthContext.Provider value={mockAuthValue}>
        <MemoryRouter initialEntries={[{ pathname: '/login', state: { from: '/profile' } }]}>
          <Routes>
            <Route
              path="/login"
              element={
                <ProtectedRoute requireAuth={false} redirectTo="/dashboard">
                  <LoginPage />
                </ProtectedRoute>
              }
            />
            <Route path="/dashboard" element={<div>Dashboard</div>} />
            <Route path="/profile" element={<div data-testid="profile-page">Profile</div>} />
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>
    );

    // stateのfromパス（/profile）にリダイレクトされることを確認
    expect(screen.getByTestId('profile-page')).toBeInTheDocument();
  });
});
