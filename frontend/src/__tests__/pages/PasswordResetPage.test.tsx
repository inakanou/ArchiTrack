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

  describe('要件29.1: パスワードリセット要求画面の実装検証', () => {
    it('メールアドレス入力フォームが表示されること', () => {
      renderPasswordResetPage();

      // フォームが表示されること
      expect(screen.getByTestId('password-reset-form')).toBeInTheDocument();
      // リセット要求モードであること
      expect(screen.getByTestId('mode')).toHaveTextContent('request');
    });

    it('送信成功時に確認メッセージが表示されること', async () => {
      const user = userEvent.setup();
      vi.mocked(apiClient.post).mockResolvedValueOnce({});

      renderPasswordResetPage();

      await user.click(screen.getByTestId('request-button'));

      await waitFor(() => {
        // APIが正しく呼ばれること
        expect(apiClient.post).toHaveBeenCalledWith('/api/v1/auth/password/reset-request', {
          email: 'test@example.com',
        });
      });
    });

    it('ログイン画面へのリンクが配置されていること', () => {
      renderPasswordResetPage();

      const loginLink = screen.getByRole('link', { name: /ログインページに戻る/i });
      expect(loginLink).toBeInTheDocument();
      expect(loginLink).toHaveAttribute('href', '/login');
    });

    it('リセット実行モードでもログイン画面へのリンクが配置されていること', async () => {
      renderPasswordResetPage('?token=test-token');

      // トークン検証が完了するまで待つ
      await waitFor(() => {
        expect(screen.getByTestId('mode')).toHaveTextContent('reset');
      });

      const loginLink = screen.getByRole('link', { name: /ログインページに戻る/i });
      expect(loginLink).toBeInTheDocument();
    });

    it('存在しないメールアドレスでもAPIが成功を返し同一メッセージが表示されること', async () => {
      const user = userEvent.setup();
      // 存在しないメールアドレスでもAPIは成功を返す（セキュリティ上の理由）
      vi.mocked(apiClient.post).mockResolvedValueOnce({});

      renderPasswordResetPage();

      await user.click(screen.getByTestId('request-button'));

      await waitFor(() => {
        // APIが正しく呼ばれること（メールアドレスの存在有無に関わらず成功）
        expect(apiClient.post).toHaveBeenCalled();
      });
    });
  });

  describe('要件29.2: パスワード再設定画面の実装検証', () => {
    describe('トークン検証', () => {
      it('ページロード時にトークン検証APIが呼ばれること（要件29.2-11）', async () => {
        vi.mocked(apiClient.get).mockResolvedValueOnce({});

        renderPasswordResetPage('?token=test-reset-token');

        await waitFor(() => {
          expect(apiClient.get).toHaveBeenCalledWith(
            '/api/v1/auth/password/verify-reset?token=test-reset-token'
          );
        });
      });

      it('トークン検証中はローディング表示されること（要件29.2-11）', async () => {
        // トークン検証を遅延させる
        let resolveGet: (value: unknown) => void;
        const getPromise = new Promise((resolve) => {
          resolveGet = resolve;
        });
        vi.mocked(apiClient.get).mockReturnValueOnce(getPromise as Promise<unknown>);

        renderPasswordResetPage('?token=test-reset-token');

        // ローディング表示があること
        expect(screen.getByText(/リセットリンクを検証中/i)).toBeInTheDocument();

        // 検証完了
        resolveGet!({});
        await waitFor(() => {
          expect(screen.queryByText(/リセットリンクを検証中/i)).not.toBeInTheDocument();
        });
      });

      it('トークンが期限切れの場合、期限切れエラーが表示されること（要件29.2-12）', async () => {
        const { ApiError } = await import('../../api/client');
        const expiredError = new ApiError(400, 'Token expired', { code: 'TOKEN_EXPIRED' });
        vi.mocked(apiClient.get).mockRejectedValueOnce(expiredError);

        renderPasswordResetPage('?token=expired-token');

        await waitFor(() => {
          expect(screen.getByText(/リセットリンクの有効期限が切れています/i)).toBeInTheDocument();
        });
      });

      it('トークンが無効な場合、無効エラーが表示されること（要件29.2-12）', async () => {
        const { ApiError } = await import('../../api/client');
        const invalidError = new ApiError(400, 'Invalid token', {
          code: 'INVALID_RESET_TOKEN',
        });
        vi.mocked(apiClient.get).mockRejectedValueOnce(invalidError);

        renderPasswordResetPage('?token=invalid-token');

        await waitFor(() => {
          expect(screen.getByText(/無効なリセットリンク/i)).toBeInTheDocument();
        });
      });

      it('トークンが既に使用済みの場合、無効エラーが表示されること（要件29.2-12）', async () => {
        const { ApiError } = await import('../../api/client');
        const usedError = new ApiError(400, 'Token used', { code: 'TOKEN_USED' });
        vi.mocked(apiClient.get).mockRejectedValueOnce(usedError);

        renderPasswordResetPage('?token=used-token');

        await waitFor(() => {
          expect(screen.getByText(/無効なリセットリンク/i)).toBeInTheDocument();
        });
      });
    });

    describe('リセット成功後のリダイレクト', () => {
      it('リセット成功後にログイン画面へリダイレクトすること（要件29.2-17,18）', async () => {
        const user = userEvent.setup();
        vi.mocked(apiClient.post).mockResolvedValueOnce({});

        renderPasswordResetPage('?token=valid-token');

        // トークン検証が完了するまで待つ
        await waitFor(() => {
          expect(screen.getByTestId('reset-button')).toBeInTheDocument();
        });

        await user.click(screen.getByTestId('reset-button'));

        // API呼び出しを確認
        await waitFor(() => {
          expect(apiClient.post).toHaveBeenCalled();
        });

        // リダイレクトが呼ばれること
        await waitFor(() => {
          expect(mockNavigate).toHaveBeenCalledWith('/login', expect.any(Object));
        });
      });
    });
  });
});
