/**
 * ログインページのテスト
 *
 * 要件16: セッション有効期限切れ時のリダイレクトURL保存機能
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { LoginPage } from '../../pages/LoginPage';
import { ApiError } from '../../api/client';

// useAuthフックをモック
const mockLogin = vi.fn();
let mockIsAuthenticated = false;
vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({
    login: async (...args: unknown[]) => {
      await mockLogin(...args);
      mockIsAuthenticated = true;
    },
    isAuthenticated: mockIsAuthenticated,
    twoFactorState: null,
    verify2FA: vi.fn(),
    verifyBackupCode: vi.fn(),
    cancel2FA: vi.fn(),
  }),
}));

// react-router-domのuseNavigateをモック
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// LoginFormコンポーネントをモック
vi.mock('../../components/LoginForm', () => ({
  default: ({
    onLogin,
    error,
  }: {
    onLogin: (data: { email: string; password: string }) => Promise<{ type: string }>;
    error: Error | null;
  }) => (
    <form
      data-testid="login-form"
      onSubmit={async (e) => {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);
        await onLogin({
          email: formData.get('email') as string,
          password: formData.get('password') as string,
        });
      }}
    >
      <input name="email" placeholder="メールアドレス" defaultValue="test@example.com" />
      <input name="password" type="password" placeholder="パスワード" defaultValue="password123" />
      <button type="submit">ログイン</button>
      {error && <div role="alert">{error.message}</div>}
    </form>
  ),
}));

const renderLoginPage = (initialEntries: string[] = ['/login']) => {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
      </Routes>
    </MemoryRouter>
  );
};

describe('LoginPage Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsAuthenticated = false;
  });

  describe('初期表示', () => {
    it('ログインページのタイトルと説明を表示する', () => {
      renderLoginPage();

      expect(screen.getByRole('heading', { name: /ログイン/i })).toBeInTheDocument();
      expect(screen.getByText(/ArchiTrackへようこそ/i)).toBeInTheDocument();
    });

    it('LoginFormコンポーネントを表示する', () => {
      renderLoginPage();

      expect(screen.getByTestId('login-form')).toBeInTheDocument();
    });

    it('アカウント登録案内メッセージを表示する', () => {
      renderLoginPage();

      expect(screen.getByText(/アカウントをお持ちでない場合は/i)).toBeInTheDocument();
    });
  });

  describe('成功メッセージ表示', () => {
    it('location.stateから成功メッセージを表示する', () => {
      render(
        <MemoryRouter
          initialEntries={[
            {
              pathname: '/login',
              state: { message: 'ユーザー登録が完了しました。' },
            },
          ]}
        >
          <Routes>
            <Route path="/login" element={<LoginPage />} />
          </Routes>
        </MemoryRouter>
      );

      expect(screen.getByRole('alert')).toHaveTextContent('ユーザー登録が完了しました。');
    });
  });

  describe('ログイン処理', () => {
    it('ログイン成功時にログイン関数が正しく呼び出される（要件16）', async () => {
      const user = userEvent.setup();
      mockLogin.mockResolvedValueOnce(undefined);

      render(
        <MemoryRouter
          initialEntries={[
            {
              pathname: '/login',
              state: { from: '/dashboard' },
            },
          ]}
        >
          <Routes>
            <Route path="/login" element={<LoginPage />} />
          </Routes>
        </MemoryRouter>
      );

      await user.click(screen.getByRole('button', { name: /ログイン/i }));

      await waitFor(() => {
        expect(mockLogin).toHaveBeenCalledWith('test@example.com', 'password123');
      });
    });

    it('ログイン成功時にログイン関数が呼び出される', async () => {
      const user = userEvent.setup();
      mockLogin.mockResolvedValueOnce(undefined);

      renderLoginPage();

      await user.click(screen.getByRole('button', { name: /ログイン/i }));

      await waitFor(() => {
        expect(mockLogin).toHaveBeenCalledWith('test@example.com', 'password123');
      });
    });

    it('ログイン失敗時にエラーを返す', async () => {
      const user = userEvent.setup();
      const apiError = new ApiError(401, '認証に失敗しました');
      mockLogin.mockRejectedValueOnce(apiError);

      renderLoginPage();

      await user.click(screen.getByRole('button', { name: /ログイン/i }));

      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent('認証に失敗しました');
      });
    });

    it('ログイン失敗時にApiError以外のエラーも処理する', async () => {
      const user = userEvent.setup();
      mockLogin.mockRejectedValueOnce(new Error('Network error'));

      renderLoginPage();

      await user.click(screen.getByRole('button', { name: /ログイン/i }));

      await waitFor(() => {
        expect(mockLogin).toHaveBeenCalled();
      });
    });
  });

  describe('セッション期限切れ表示', () => {
    it('location.stateにsessionExpiredがある場合、メッセージを表示する', () => {
      render(
        <MemoryRouter
          initialEntries={[
            {
              pathname: '/login',
              state: { sessionExpired: true },
            },
          ]}
        >
          <Routes>
            <Route path="/login" element={<LoginPage />} />
          </Routes>
        </MemoryRouter>
      );

      expect(screen.getByRole('alert')).toHaveTextContent(
        'セッションの有効期限が切れました。再度ログインしてください。'
      );
    });
  });
});
