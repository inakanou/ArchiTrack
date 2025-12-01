/**
 * パスワードリセットページのテスト
 *
 * 要件7: パスワードリセット機能
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { PasswordResetPage } from '../../pages/PasswordResetPage';

// API clientをモック（importOriginalを使用してApiErrorを保持）
vi.mock('../../api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/client')>();
  return {
    ...actual,
    apiClient: {
      get: vi.fn(),
      post: vi.fn(),
    },
  };
});

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

// PasswordResetFormコンポーネントをモック
vi.mock('../../components/PasswordResetForm', () => ({
  default: ({
    resetToken,
    onRequestReset,
    onResetPassword,
  }: {
    resetToken?: string;
    onRequestReset: (data: { email: string }) => Promise<void>;
    onResetPassword: (data: { resetToken: string; password: string }) => Promise<void>;
  }) => {
    const handleRequest = async () => {
      try {
        await onRequestReset({ email: 'test@example.com' });
      } catch {
        // エラーはPasswordResetFormがハンドリング
      }
    };

    const handleReset = async () => {
      try {
        await onResetPassword({ resetToken: resetToken!, password: 'NewPassword123!' });
      } catch {
        // エラーはPasswordResetFormがハンドリング
      }
    };

    return (
      <div data-testid="password-reset-form">
        {resetToken ? (
          <>
            <span data-testid="mode">reset</span>
            <button onClick={handleReset} data-testid="reset-button">
              リセット実行
            </button>
          </>
        ) : (
          <>
            <span data-testid="mode">request</span>
            <button onClick={handleRequest} data-testid="request-button">
              リセット要求
            </button>
          </>
        )}
      </div>
    );
  },
}));

const renderPasswordResetPage = (queryString: string = '') => {
  return render(
    <MemoryRouter initialEntries={[`/password-reset${queryString}`]}>
      <Routes>
        <Route path="/password-reset" element={<PasswordResetPage />} />
      </Routes>
    </MemoryRouter>
  );
};

describe('PasswordResetPage Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // トークン検証のデフォルトモック（成功）
    vi.mocked(apiClient.get).mockResolvedValue({});
  });

  describe('リセット要求モード（トークンなし）', () => {
    it('パスワードリセット要求のタイトルを表示する', () => {
      renderPasswordResetPage();

      expect(screen.getByRole('heading', { name: /パスワードリセット要求/i })).toBeInTheDocument();
      expect(
        screen.getByText(/パスワードリセット用のリンクをメールで送信します/i)
      ).toBeInTheDocument();
    });

    it('リセット要求モードのフォームを表示する', () => {
      renderPasswordResetPage();

      expect(screen.getByTestId('mode')).toHaveTextContent('request');
    });

    it('ログインページへのリンクを表示する', () => {
      renderPasswordResetPage();

      expect(screen.getByRole('link', { name: /ログインページに戻る/i })).toBeInTheDocument();
    });
  });

  describe('リセット実行モード（トークンあり）', () => {
    it('パスワードリセットのタイトルを表示する', () => {
      renderPasswordResetPage('?token=reset-token-123');

      expect(screen.getByRole('heading', { name: /パスワードリセット$/i })).toBeInTheDocument();
      expect(screen.getByText(/新しいパスワードを入力してください/i)).toBeInTheDocument();
    });

    it('リセット実行モードのフォームを表示する', async () => {
      renderPasswordResetPage('?token=reset-token-123');

      // トークン検証が完了するまで待つ
      await waitFor(() => {
        expect(screen.getByTestId('mode')).toHaveTextContent('reset');
      });
    });
  });

  describe('リセット要求処理', () => {
    it('リセット要求が成功する場合', async () => {
      const user = userEvent.setup();
      vi.mocked(apiClient.post).mockResolvedValueOnce({});

      renderPasswordResetPage();

      await user.click(screen.getByTestId('request-button'));

      await waitFor(() => {
        expect(apiClient.post).toHaveBeenCalledWith('/api/v1/auth/password/reset-request', {
          email: 'test@example.com',
        });
      });
    });

    it('リセット要求が失敗した場合にAPIが呼ばれることを確認する', async () => {
      const user = userEvent.setup();
      const error = new Error('Request failed');
      vi.mocked(apiClient.post).mockRejectedValueOnce(error);

      renderPasswordResetPage();

      await user.click(screen.getByTestId('request-button'));

      await waitFor(() => {
        expect(apiClient.post).toHaveBeenCalled();
      });
    });
  });

  describe('リセット実行処理', () => {
    it('リセット成功時にログインページへ遷移する', async () => {
      const user = userEvent.setup();
      vi.mocked(apiClient.post).mockResolvedValueOnce({});

      renderPasswordResetPage('?token=reset-token-123');

      // トークン検証が完了するまで待つ
      await waitFor(() => {
        expect(screen.getByTestId('reset-button')).toBeInTheDocument();
      });

      await user.click(screen.getByTestId('reset-button'));

      await waitFor(() => {
        expect(apiClient.post).toHaveBeenCalledWith('/api/v1/auth/password/reset', {
          token: 'reset-token-123',
          newPassword: 'NewPassword123!',
        });
        expect(mockNavigate).toHaveBeenCalledWith('/login', {
          state: {
            message: 'パスワードがリセットされました。新しいパスワードでログインしてください。',
          },
        });
      });
    });

    it('リセット失敗時にAPIが呼ばれることを確認する', async () => {
      const user = userEvent.setup();
      const error = new Error('Reset failed');
      vi.mocked(apiClient.post).mockRejectedValueOnce(error);

      renderPasswordResetPage('?token=reset-token-123');

      // トークン検証が完了するまで待つ
      await waitFor(() => {
        expect(screen.getByTestId('reset-button')).toBeInTheDocument();
      });

      await user.click(screen.getByTestId('reset-button'));

      await waitFor(() => {
        expect(apiClient.post).toHaveBeenCalled();
      });
    });
  });

  describe('ナビゲーション', () => {
    it('ログインページへのリンクをクリックするとログインページへ遷移する', async () => {
      const user = userEvent.setup();
      renderPasswordResetPage();

      const loginLink = screen.getByRole('link', { name: /ログインページに戻る/i });
      await user.click(loginLink);

      expect(mockNavigate).toHaveBeenCalledWith('/login');
    });
  });
});
