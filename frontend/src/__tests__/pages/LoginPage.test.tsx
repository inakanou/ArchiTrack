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
const mockVerify2FA = vi.fn();
const mockVerifyBackupCode = vi.fn();
const mockCancel2FA = vi.fn();
let mockIsAuthenticated = false;
let mockTwoFactorState: { required: boolean } | null = null;

// useAuthフックのモックを関数として定義（re-render時に値を取得できるように）
const useAuthMock = vi.fn(() => ({
  login: async (...args: unknown[]) => {
    await mockLogin(...args);
    mockIsAuthenticated = true;
  },
  isAuthenticated: mockIsAuthenticated,
  twoFactorState: mockTwoFactorState,
  verify2FA: mockVerify2FA,
  verifyBackupCode: mockVerifyBackupCode,
  cancel2FA: mockCancel2FA,
}));

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => useAuthMock(),
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
    mockTwoFactorState = null;
  });

  /**
   * タスク23.3: 401エラー受信時のログイン画面リダイレクト処理の検証
   * 要件16.1, 16.2, 28.1
   *
   * redirectUrlクエリパラメータを使用したリダイレクト処理のテスト
   */
  describe('要件16: redirectUrlクエリパラメータによるリダイレクト', () => {
    /**
     * 要件16.2: redirectUrlクエリパラメータからリダイレクト先を取得し、
     * ログイン成功後にそのURLへ遷移する
     */
    it('URLのredirectUrlクエリパラメータからリダイレクト先を取得してログイン後に遷移する', () => {
      // 認証済み状態でモックを設定
      mockIsAuthenticated = true;

      render(
        <MemoryRouter
          initialEntries={[
            {
              pathname: '/login',
              search: '?redirectUrl=%2Fadmin%2Fusers%3Fpage%3D2',
            },
          ]}
        >
          <Routes>
            <Route path="/login" element={<LoginPage />} />
          </Routes>
        </MemoryRouter>
      );

      // redirectUrlクエリパラメータからデコードされたパスにリダイレクトされることを確認
      expect(mockNavigate).toHaveBeenCalledWith('/admin/users?page=2', { replace: true });
    });

    /**
     * 要件16.2: redirectUrlクエリパラメータが存在する場合、state.fromより優先される
     */
    it('redirectUrlクエリパラメータはstate.fromよりも優先される', () => {
      // 認証済み状態でモックを設定
      mockIsAuthenticated = true;

      render(
        <MemoryRouter
          initialEntries={[
            {
              pathname: '/login',
              search: '?redirectUrl=%2Fprofile',
              state: { from: '/dashboard' },
            },
          ]}
        >
          <Routes>
            <Route path="/login" element={<LoginPage />} />
          </Routes>
        </MemoryRouter>
      );

      // redirectUrlクエリパラメータのパスにリダイレクトされることを確認（state.fromではない）
      expect(mockNavigate).toHaveBeenCalledWith('/profile', { replace: true });
    });

    /**
     * 要件16.2: redirectUrlクエリパラメータが存在しない場合、state.fromを使用する
     */
    it('redirectUrlクエリパラメータがない場合はstate.fromを使用する', () => {
      // 認証済み状態でモックを設定
      mockIsAuthenticated = true;

      render(
        <MemoryRouter
          initialEntries={[
            {
              pathname: '/login',
              state: { from: '/settings' },
            },
          ]}
        >
          <Routes>
            <Route path="/login" element={<LoginPage />} />
          </Routes>
        </MemoryRouter>
      );

      // state.fromのパスにリダイレクトされることを確認
      expect(mockNavigate).toHaveBeenCalledWith('/settings', { replace: true });
    });

    /**
     * 要件28.1: セキュリティ対策 - 外部URLへのリダイレクトを防止する
     */
    it('外部URLへのリダイレクトを防止し、デフォルトの/dashboardへ遷移する', () => {
      // 認証済み状態でモックを設定
      mockIsAuthenticated = true;

      render(
        <MemoryRouter
          initialEntries={[
            {
              pathname: '/login',
              search: '?redirectUrl=https%3A%2F%2Fmalicious.com%2Fphishing',
            },
          ]}
        >
          <Routes>
            <Route path="/login" element={<LoginPage />} />
          </Routes>
        </MemoryRouter>
      );

      // 外部URLではなく、デフォルトの/dashboardにリダイレクトされることを確認
      expect(mockNavigate).toHaveBeenCalledWith('/dashboard', { replace: true });
    });

    /**
     * 要件28.1: セキュリティ対策 - //で始まるプロトコル相対URLを防止する
     */
    it('プロトコル相対URL（//）へのリダイレクトを防止する', () => {
      // 認証済み状態でモックを設定
      mockIsAuthenticated = true;

      render(
        <MemoryRouter
          initialEntries={[
            {
              pathname: '/login',
              search: '?redirectUrl=%2F%2Fmalicious.com%2Fphishing',
            },
          ]}
        >
          <Routes>
            <Route path="/login" element={<LoginPage />} />
          </Routes>
        </MemoryRouter>
      );

      // プロトコル相対URLではなく、デフォルトの/dashboardにリダイレクトされることを確認
      expect(mockNavigate).toHaveBeenCalledWith('/dashboard', { replace: true });
    });
  });

  /**
   * タスク23.1: ProtectedRouteの遷移先state保存の検証と強化
   * 要件28.1, 28.3
   */
  describe('要件28: 画面遷移とナビゲーション - リダイレクト処理', () => {
    /**
     * 要件28.5: ログインが成功する AND redirectUrlパラメータが存在する場合、
     * 保存されたURLへリダイレクトする
     *
     * このテストでは、認証済み状態でコンポーネントがマウントされた時の
     * useEffectの動作を確認します（ログイン成功後のリダイレクト）
     */
    it('認証済み状態でマウント時、state.fromのパスへリダイレクトする', () => {
      // 認証済み状態でモックを設定
      mockIsAuthenticated = true;

      render(
        <MemoryRouter
          initialEntries={[
            {
              pathname: '/login',
              state: { from: '/admin/users?page=2' },
            },
          ]}
        >
          <Routes>
            <Route path="/login" element={<LoginPage />} />
          </Routes>
        </MemoryRouter>
      );

      // 認証済み状態の場合、state.fromのパスにリダイレクトされることを確認
      expect(mockNavigate).toHaveBeenCalledWith('/admin/users?page=2', { replace: true });
    });

    /**
     * 要件28.6: ログインが成功する AND redirectUrlパラメータが存在しない場合、
     * ダッシュボード画面へリダイレクトする（デフォルト: /dashboard）
     */
    it('認証済み状態でマウント時、state.fromが存在しない場合はデフォルトで/dashboardへリダイレクトする', () => {
      // 認証済み状態でモックを設定
      mockIsAuthenticated = true;

      render(
        <MemoryRouter
          initialEntries={[
            {
              pathname: '/login',
              state: {},
            },
          ]}
        >
          <Routes>
            <Route path="/login" element={<LoginPage />} />
          </Routes>
        </MemoryRouter>
      );

      // state.fromがない場合、/dashboardにリダイレクトされることを確認
      expect(mockNavigate).toHaveBeenCalledWith('/dashboard', { replace: true });
    });

    /**
     * 要件28.6: state自体が存在しない場合でも、/dashboardへリダイレクトする
     */
    it('認証済み状態でマウント時、stateが存在しない場合はデフォルトで/dashboardへリダイレクトする', () => {
      // 認証済み状態でモックを設定
      mockIsAuthenticated = true;

      renderLoginPage();

      // stateが存在しない場合、/dashboardにリダイレクトされることを確認
      expect(mockNavigate).toHaveBeenCalledWith('/dashboard', { replace: true });
    });

    /**
     * 要件28.1: 元のパスにクエリパラメータが含まれている場合も正しく保存される
     */
    it('認証済み状態でマウント時、クエリパラメータ付きのパスへも正しくリダイレクトする', () => {
      // 認証済み状態でモックを設定
      mockIsAuthenticated = true;

      render(
        <MemoryRouter
          initialEntries={[
            {
              pathname: '/login',
              state: { from: '/profile?tab=security&highlight=2fa' },
            },
          ]}
        >
          <Routes>
            <Route path="/login" element={<LoginPage />} />
          </Routes>
        </MemoryRouter>
      );

      // クエリパラメータを含むパスに正しくリダイレクトされることを確認
      expect(mockNavigate).toHaveBeenCalledWith('/profile?tab=security&highlight=2fa', {
        replace: true,
      });
    });
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

  describe('2FA認証フロー', () => {
    // TwoFactorVerificationFormコンポーネントをモック
    beforeEach(() => {
      vi.mock('../../components/TwoFactorVerificationForm', () => ({
        default: ({
          onVerifyTOTP,
          onVerifyBackupCode,
          onCancel,
        }: {
          onVerifyTOTP: (code: string) => Promise<{ success: boolean; error?: string }>;
          onVerifyBackupCode: (code: string) => Promise<{ success: boolean; error?: string }>;
          onCancel: () => void;
        }) => (
          <div data-testid="two-factor-form">
            <button
              data-testid="verify-totp-btn"
              onClick={async () => {
                await onVerifyTOTP('123456');
              }}
            >
              TOTP検証
            </button>
            <button
              data-testid="verify-backup-btn"
              onClick={async () => {
                await onVerifyBackupCode('BACKUP123');
              }}
            >
              バックアップコード検証
            </button>
            <button data-testid="cancel-2fa-btn" onClick={onCancel}>
              キャンセル
            </button>
          </div>
        ),
      }));
    });

    it('2FA要求時にTwoFactorVerificationFormを表示する', async () => {
      mockTwoFactorState = { required: true };

      renderLoginPage();

      // 2FAフォームが表示されることを確認
      expect(screen.getByTestId('two-factor-form')).toBeInTheDocument();
    });

    it('TOTP検証成功時にverify2FAが呼び出される', async () => {
      const user = userEvent.setup();
      mockTwoFactorState = { required: true };
      mockVerify2FA.mockResolvedValueOnce(undefined);

      renderLoginPage();

      await user.click(screen.getByTestId('verify-totp-btn'));

      expect(mockVerify2FA).toHaveBeenCalledWith('123456');
    });

    it('TOTP検証失敗時にエラーを返す', async () => {
      const user = userEvent.setup();
      mockTwoFactorState = { required: true };
      const apiError = new ApiError(401, '認証コードが無効です');
      mockVerify2FA.mockRejectedValueOnce(apiError);

      renderLoginPage();

      await user.click(screen.getByTestId('verify-totp-btn'));

      expect(mockVerify2FA).toHaveBeenCalledWith('123456');
    });

    it('バックアップコード検証成功時にverifyBackupCodeが呼び出される', async () => {
      const user = userEvent.setup();
      mockTwoFactorState = { required: true };
      mockVerifyBackupCode.mockResolvedValueOnce(undefined);

      renderLoginPage();

      await user.click(screen.getByTestId('verify-backup-btn'));

      expect(mockVerifyBackupCode).toHaveBeenCalledWith('BACKUP123');
    });

    it('バックアップコード検証失敗時にエラーを返す', async () => {
      const user = userEvent.setup();
      mockTwoFactorState = { required: true };
      const apiError = new ApiError(401, 'バックアップコードが無効です');
      mockVerifyBackupCode.mockRejectedValueOnce(apiError);

      renderLoginPage();

      await user.click(screen.getByTestId('verify-backup-btn'));

      expect(mockVerifyBackupCode).toHaveBeenCalledWith('BACKUP123');
    });

    it('キャンセルボタンをクリックするとcancel2FAが呼び出される', async () => {
      const user = userEvent.setup();
      mockTwoFactorState = { required: true };

      renderLoginPage();

      await user.click(screen.getByTestId('cancel-2fa-btn'));

      expect(mockCancel2FA).toHaveBeenCalled();
    });
  });
});
