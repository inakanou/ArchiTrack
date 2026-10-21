/**
 * ユーザー登録ページのテスト
 *
 * 要件11: 招待経由のユーザー登録
 * 要件12: パスワード強度要件
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { RegisterPage } from '../../pages/RegisterPage';
import { AuthContext, type AuthContextValue } from '../../contexts/AuthContext';

// API clientをモック
vi.mock('../../api/client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

import { apiClient } from '../../api/client';

// react-router-domのuseNavigateをモック
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// RegisterForm が受け取った招待の検証の関数（描画ごとに記録する）
const renderedVerifyHandlers: unknown[] = [];

// RegisterFormコンポーネントをモック
vi.mock('../../components/RegisterForm', () => ({
  default: ({
    invitationToken,
    onRegister,
    onVerifyInvitation,
  }: {
    invitationToken: string;
    onRegister: (data: {
      invitationToken: string;
      displayName: string;
      password: string;
    }) => Promise<void>;
    onVerifyInvitation: (token: string) => Promise<{ valid: boolean; email?: string }>;
  }) => {
    renderedVerifyHandlers.push(onVerifyInvitation);
    const handleVerify = async () => {
      await onVerifyInvitation(invitationToken);
    };

    const handleRegister = async () => {
      try {
        await onRegister({
          invitationToken,
          displayName: 'Test User',
          password: 'Password123!',
        });
      } catch {
        // エラーはRegisterFormがハンドリング
      }
    };

    return (
      <div data-testid="register-form">
        <span data-testid="invitation-token">{invitationToken}</span>
        <button onClick={handleVerify}>検証</button>
        <button onClick={handleRegister}>登録</button>
      </div>
    );
  },
}));

// 登録の応答でセッションを始める AuthContext の操作（要件34.5: 登録の直後に 2FA の設定へ進める）
const mockEstablishSession = vi.fn();

const authValue = {
  isAuthenticated: false,
  user: null,
  isLoading: false,
  isInitialized: true,
  sessionExpired: false,
  sessionExpiredDuringOperation: false,
  twoFactorState: null,
  login: vi.fn(),
  logout: vi.fn(),
  refreshToken: vi.fn(),
  clearSessionExpired: vi.fn(),
  handleReauthSuccess: vi.fn(),
  navigateToLogin: vi.fn(),
  verify2FA: vi.fn(),
  verifyBackupCode: vi.fn(),
  cancel2FA: vi.fn(),
  establishSession: mockEstablishSession,
  updateUser: vi.fn(),
} satisfies AuthContextValue;

const renderRegisterPage = (queryString: string = '') => {
  return render(
    <AuthContext.Provider value={authValue}>
      <MemoryRouter initialEntries={[`/register${queryString}`]}>
        <Routes>
          <Route path="/register" element={<RegisterPage />} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>
  );
};

describe('RegisterPage Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('招待トークンなしの場合', () => {
    it('招待トークンが必要なメッセージを表示する', () => {
      renderRegisterPage();

      expect(screen.getByRole('heading', { name: /招待トークンが必要です/i })).toBeInTheDocument();
      expect(screen.getByText(/ユーザー登録には有効な招待URLが必要です/i)).toBeInTheDocument();
    });

    it('ログインページへ戻るボタンを表示する', () => {
      renderRegisterPage();

      expect(screen.getByRole('button', { name: /ログインページへ戻る/i })).toBeInTheDocument();
    });

    it('ログインページへ戻るボタンをクリックするとログインページへ遷移する', async () => {
      const user = userEvent.setup();
      renderRegisterPage();

      await user.click(screen.getByRole('button', { name: /ログインページへ戻る/i }));

      expect(mockNavigate).toHaveBeenCalledWith('/login');
    });
  });

  describe('招待トークンありの場合', () => {
    it('RegisterFormコンポーネントを表示する', () => {
      renderRegisterPage('?token=valid-token-123');

      expect(screen.getByTestId('register-form')).toBeInTheDocument();
      expect(screen.getByTestId('invitation-token')).toHaveTextContent('valid-token-123');
    });

    it('ユーザー登録のタイトルと説明を表示する', () => {
      renderRegisterPage('?token=valid-token-123');

      expect(screen.getByRole('heading', { name: /ユーザー登録/i })).toBeInTheDocument();
      expect(screen.getByText(/ArchiTrackへようこそ/i)).toBeInTheDocument();
    });

    it('ログインリンクを表示する', () => {
      renderRegisterPage('?token=valid-token-123');

      expect(screen.getByText(/既にアカウントをお持ちの場合は/i)).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /ログイン/i })).toBeInTheDocument();
    });
  });

  describe('招待トークン検証', () => {
    it('有効な招待トークンの場合、メールアドレスを返す', async () => {
      const user = userEvent.setup();
      vi.mocked(apiClient.get).mockResolvedValueOnce({ email: 'invited@example.com' });

      renderRegisterPage('?token=valid-token-123');

      await user.click(screen.getByRole('button', { name: /検証/i }));

      await waitFor(() => {
        expect(apiClient.get).toHaveBeenCalledWith(
          '/api/v1/invitations/verify?token=valid-token-123'
        );
      });
    });

    it('無効な招待トークンの場合、エラーを返す', async () => {
      const user = userEvent.setup();
      vi.mocked(apiClient.get).mockRejectedValueOnce(new Error('Invalid token'));

      renderRegisterPage('?token=invalid-token');

      await user.click(screen.getByRole('button', { name: /検証/i }));

      await waitFor(() => {
        expect(apiClient.get).toHaveBeenCalled();
      });
    });
  });

  /**
   * 登録フォームは招待の検証の関数の参照が変わると検証をやり直し、入力中のフォーカスを失う。
   * 画面は認証の状態の変化（初期化の完了など）で再描画されるため、参照を固定する（タスク47.6）
   */
  it('認証の状態の変化で再描画されても、登録フォームへ同じ招待の検証の関数を渡す', () => {
    renderedVerifyHandlers.length = 0;
    const { rerender } = renderRegisterPage('?token=valid-token-123');

    rerender(
      <AuthContext.Provider value={{ ...authValue, isLoading: true }}>
        <MemoryRouter initialEntries={['/register?token=valid-token-123']}>
          <Routes>
            <Route path="/register" element={<RegisterPage />} />
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>
    );

    expect(renderedVerifyHandlers.length).toBeGreaterThan(1);
    expect(new Set(renderedVerifyHandlers).size).toBe(1);
  });

  describe('ユーザー登録処理', () => {
    /**
     * 招待経由の登録の直後は、登録の応答でセッションを始めてダッシュボードへ進める。2FA 未登録の
     * 利用者のため ProtectedRoute が 2FA 設定の画面へ置き換え、設定の完了後にダッシュボードへ戻る
     * （要件34.5、12.9・28.19 のダッシュボードへの遷移は設定の後になる）
     * @requirement user-authentication/REQ-34.5
     */
    it('登録成功時に応答でセッションを始め、完了の案内を残してダッシュボードへ遷移する', async () => {
      sessionStorage.clear();
      const user = userEvent.setup();
      const registeredUser = {
        id: 'new-user',
        email: 'new@example.com',
        displayName: 'Test User',
        roles: ['user'],
        twoFactorEnabled: false,
        mustChangePassword: false,
      };
      vi.mocked(apiClient.post).mockResolvedValueOnce({
        accessToken: 'access-token',
        expiresIn: 900,
        user: registeredUser,
      });

      renderRegisterPage('?token=valid-token-123');

      await user.click(screen.getByRole('button', { name: /登録/i }));

      await waitFor(() => {
        expect(apiClient.post).toHaveBeenCalledWith('/api/v1/auth/register', {
          invitationToken: 'valid-token-123',
          displayName: 'Test User',
          password: 'Password123!',
        });
        expect(mockEstablishSession).toHaveBeenCalledWith({
          accessToken: 'access-token',
          expiresIn: 900,
          user: registeredUser,
        });
        expect(mockNavigate).toHaveBeenCalledWith('/dashboard', { replace: true });
      });
      // 完了の案内は 2FA 設定の画面が表示の時点で読む
      expect(sessionStorage.getItem('twoFactorSetupNotice')).toBe(
        'ユーザー登録が完了しました。二要素認証を設定してください。'
      );
    });

    it('登録の応答にアクセストークンが無いときはログインページへ遷移する', async () => {
      const user = userEvent.setup();
      vi.mocked(apiClient.post).mockResolvedValueOnce({});

      renderRegisterPage('?token=valid-token-123');

      await user.click(screen.getByRole('button', { name: /登録/i }));

      await waitFor(() => {
        expect(mockEstablishSession).not.toHaveBeenCalled();
        expect(mockNavigate).toHaveBeenCalledWith('/login', {
          state: { message: 'ユーザー登録が完了しました。ログインしてください。' },
        });
      });
    });

    it('登録失敗時にAPIが呼ばれることを確認する', async () => {
      const user = userEvent.setup();
      const error = new Error('Registration failed');
      vi.mocked(apiClient.post).mockRejectedValueOnce(error);

      renderRegisterPage('?token=valid-token-123');

      await user.click(screen.getByRole('button', { name: /登録/i }));

      await waitFor(() => {
        expect(apiClient.post).toHaveBeenCalled();
      });
    });
  });

  describe('ナビゲーション', () => {
    it('ログインリンクをクリックするとログインページへ遷移する', async () => {
      const user = userEvent.setup();
      renderRegisterPage('?token=valid-token-123');

      const loginLink = screen.getByRole('link', { name: /ログイン/i });
      await user.click(loginLink);

      expect(mockNavigate).toHaveBeenCalledWith('/login');
    });
  });
});
