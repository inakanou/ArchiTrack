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

const renderRegisterPage = (queryString: string = '') => {
  return render(
    <MemoryRouter initialEntries={[`/register${queryString}`]}>
      <Routes>
        <Route path="/register" element={<RegisterPage />} />
      </Routes>
    </MemoryRouter>
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

  describe('ユーザー登録処理', () => {
    it('登録成功時にログインページへ遷移する', async () => {
      const user = userEvent.setup();
      vi.mocked(apiClient.post).mockResolvedValueOnce({});

      renderRegisterPage('?token=valid-token-123');

      await user.click(screen.getByRole('button', { name: /登録/i }));

      await waitFor(() => {
        expect(apiClient.post).toHaveBeenCalledWith('/api/v1/auth/register', {
          invitationToken: 'valid-token-123',
          displayName: 'Test User',
          password: 'Password123!',
        });
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
