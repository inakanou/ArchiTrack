import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import App from '../App';

// AuthContext のモック
vi.mock('../contexts/AuthContext', () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="auth-provider">{children}</div>
  ),
  useAuth: () => ({
    user: null,
    isAuthenticated: false,
    isLoading: false,
    login: vi.fn(),
    logout: vi.fn(),
    register: vi.fn(),
  }),
}));

// ProtectedRoute のモック
vi.mock('../components/ProtectedRoute', () => ({
  ProtectedRoute: ({
    children,
    requireAuth = true,
  }: {
    children: React.ReactNode;
    requireAuth?: boolean;
  }) => {
    // 認証不要、または認証が必要で認証済みの場合のみ子要素をレンダリング
    if (!requireAuth) {
      return <div data-testid="protected-route">{children}</div>;
    }
    // 認証が必要で未認証の場合はログインページにリダイレクト（実際のロジックは簡略化）
    return <div data-testid="protected-route-redirect">Redirecting to login...</div>;
  },
}));

describe('App Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('ErrorBoundary でラップされてレンダリングされる', () => {
    render(<App />);
    // ErrorBoundary は正常時には子要素をそのまま表示するため、
    // AuthProvider がレンダリングされていることを確認
    expect(screen.getByTestId('auth-provider')).toBeInTheDocument();
  });

  it('AuthProvider が正しく統合されている', () => {
    render(<App />);
    expect(screen.getByTestId('auth-provider')).toBeInTheDocument();
  });

  it('BrowserRouter によるルーティングが動作する', async () => {
    render(<App />);

    // ルートパス（/）は ProtectedRoute で保護されているため、
    // 未認証の場合はリダイレクトメッセージが表示される
    await waitFor(() => {
      expect(screen.getByTestId('protected-route-redirect')).toBeInTheDocument();
    });
  });

  it('コンポーネントが正常にマウントされる', () => {
    const { container } = render(<App />);
    expect(container.firstChild).toBeInTheDocument();
  });
});
