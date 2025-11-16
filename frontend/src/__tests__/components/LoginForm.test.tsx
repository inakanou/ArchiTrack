import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LoginForm from '../../components/LoginForm';
import type { LoginResult } from '../../types/auth.types';
import { ApiError } from '../../api/client';

describe('LoginForm', () => {
  const mockOnLogin = vi.fn();
  const mockOnForgotPassword = vi.fn();

  beforeEach(() => {
    mockOnLogin.mockReset();
    mockOnForgotPassword.mockReset();
  });

  describe('フォーム要素の表示', () => {
    it('メールアドレス入力フィールドが表示されること', () => {
      render(<LoginForm onLogin={mockOnLogin} />);

      const emailInput = screen.getByLabelText(/メールアドレス/i);
      expect(emailInput).toBeInTheDocument();
      expect(emailInput).toHaveAttribute('type', 'email');
    });

    it('パスワード入力フィールドが表示されること', () => {
      render(<LoginForm onLogin={mockOnLogin} />);

      const passwordInput = screen.getByLabelText(/^パスワード$/i);
      expect(passwordInput).toBeInTheDocument();
      expect(passwordInput).toHaveAttribute('type', 'password');
    });

    it('ログインボタンが表示されること', () => {
      render(<LoginForm onLogin={mockOnLogin} />);

      const loginButton = screen.getByRole('button', { name: /ログイン/i });
      expect(loginButton).toBeInTheDocument();
    });

    it('パスワード表示/非表示切り替えボタンが表示されること', () => {
      render(<LoginForm onLogin={mockOnLogin} />);

      const toggleButton = screen.getByRole('button', { name: /パスワードを表示/i });
      expect(toggleButton).toBeInTheDocument();
    });

    it('「パスワードを忘れた」リンクが表示されること', () => {
      render(<LoginForm onLogin={mockOnLogin} onForgotPassword={mockOnForgotPassword} />);

      const forgotPasswordLink = screen.getByRole('link', {
        name: /パスワードを忘れた/i,
      });
      expect(forgotPasswordLink).toBeInTheDocument();
    });

    it('メールアドレスフィールドに自動フォーカスされること', () => {
      render(<LoginForm onLogin={mockOnLogin} />);

      const emailInput = screen.getByLabelText(/メールアドレス/i);
      expect(emailInput).toHaveFocus();
    });
  });

  describe('パスワード表示/非表示切り替え', () => {
    it('切り替えボタンをクリックするとパスワードが表示されること', async () => {
      const user = userEvent.setup();
      render(<LoginForm onLogin={mockOnLogin} />);

      const passwordInput = screen.getByLabelText(/^パスワード$/i);
      const toggleButton = screen.getByRole('button', { name: /パスワードを表示/i });

      // 初期状態: type="password"
      expect(passwordInput).toHaveAttribute('type', 'password');

      // クリック後: type="text"
      await user.click(toggleButton);
      expect(passwordInput).toHaveAttribute('type', 'text');
      expect(screen.getByRole('button', { name: /パスワードを非表示/i })).toBeInTheDocument();

      // 再度クリック: type="password"
      await user.click(toggleButton);
      expect(passwordInput).toHaveAttribute('type', 'password');
      expect(screen.getByRole('button', { name: /パスワードを表示/i })).toBeInTheDocument();
    });
  });

  describe('バリデーション', () => {
    it('メールアドレス形式が無効な場合、リアルタイムエラーが表示されること', async () => {
      const user = userEvent.setup();
      render(<LoginForm onLogin={mockOnLogin} />);

      const emailInput = screen.getByLabelText(/メールアドレス/i);

      // 無効なメールアドレスを入力
      await user.type(emailInput, 'invalid-email');
      await user.tab(); // フォーカスを外す

      // エラーメッセージが表示される
      await waitFor(() => {
        expect(screen.getByText(/有効なメールアドレスを入力してください/i)).toBeInTheDocument();
      });
    });

    it('フォームが未入力の場合、必須フィールドエラーが表示されること', async () => {
      const user = userEvent.setup();
      render(<LoginForm onLogin={mockOnLogin} />);

      const loginButton = screen.getByRole('button', { name: /ログイン/i });

      // ログインボタンをクリック
      await user.click(loginButton);

      // エラーメッセージが表示される
      await waitFor(() => {
        expect(screen.getByText(/メールアドレスは必須/i)).toBeInTheDocument();
        expect(screen.getByText(/パスワードは必須/i)).toBeInTheDocument();
      });

      // onLoginが呼ばれない
      expect(mockOnLogin).not.toHaveBeenCalled();
    });

    it('有効な入力の場合、バリデーションエラーが表示されないこと', async () => {
      const user = userEvent.setup();
      render(<LoginForm onLogin={mockOnLogin} />);

      const emailInput = screen.getByLabelText(/メールアドレス/i);
      await user.type(emailInput, 'test@example.com');
      await user.tab();

      // エラーメッセージが表示されない
      expect(screen.queryByText(/有効なメールアドレスを入力してください/i)).not.toBeInTheDocument();
    });
  });

  describe('ログイン処理', () => {
    it('有効な入力でログインボタンをクリックすると、onLoginが呼ばれること', async () => {
      const user = userEvent.setup();
      mockOnLogin.mockResolvedValue({ type: 'SUCCESS' } as LoginResult);

      render(<LoginForm onLogin={mockOnLogin} />);

      const emailInput = screen.getByLabelText(/メールアドレス/i);
      const passwordInput = screen.getByLabelText(/^パスワード$/i);
      const loginButton = screen.getByRole('button', { name: /ログイン/i });

      await user.type(emailInput, 'test@example.com');
      await user.type(passwordInput, 'Password123!');
      await user.click(loginButton);

      await waitFor(() => {
        expect(mockOnLogin).toHaveBeenCalledWith({
          email: 'test@example.com',
          password: 'Password123!',
        });
      });
    });

    it('ログイン処理中、ローディングスピナーとボタンの無効化が表示されること', async () => {
      const user = userEvent.setup();
      let resolveLogin: (value: LoginResult) => void;
      const loginPromise = new Promise<LoginResult>((resolve) => {
        resolveLogin = resolve;
      });
      mockOnLogin.mockReturnValue(loginPromise);

      render(<LoginForm onLogin={mockOnLogin} />);

      const emailInput = screen.getByLabelText(/メールアドレス/i);
      const passwordInput = screen.getByLabelText(/^パスワード$/i);
      const loginButton = screen.getByRole('button', { name: /ログイン/i });

      await user.type(emailInput, 'test@example.com');
      await user.type(passwordInput, 'Password123!');
      await user.click(loginButton);

      // ローディング中
      expect(screen.getByRole('status')).toBeInTheDocument(); // ローディングスピナー
      expect(loginButton).toBeDisabled();

      // ログイン完了
      resolveLogin!({ type: 'SUCCESS' });
      await waitFor(() => {
        expect(screen.queryByRole('status')).not.toBeInTheDocument();
        expect(loginButton).not.toBeDisabled();
      });
    });

    it('ログイン失敗時、汎用エラーメッセージが表示されること', async () => {
      const user = userEvent.setup();
      mockOnLogin.mockRejectedValue(
        new ApiError(401, 'Unauthorized', {
          error: 'Invalid credentials',
          code: 'INVALID_CREDENTIALS',
        })
      );

      render(<LoginForm onLogin={mockOnLogin} />);

      const emailInput = screen.getByLabelText(/メールアドレス/i);
      const passwordInput = screen.getByLabelText(/^パスワード$/i);
      const loginButton = screen.getByRole('button', { name: /ログイン/i });

      await user.type(emailInput, 'test@example.com');
      await user.type(passwordInput, 'wrongpassword');
      await user.click(loginButton);

      await waitFor(() => {
        expect(
          screen.getByText(/メールアドレスまたはパスワードが正しくありません/i)
        ).toBeInTheDocument();
      });
    });

    it('アカウントロック時、ロック解除までの残り時間が表示されること', async () => {
      const user = userEvent.setup();
      const unlockAt = new Date(Date.now() + 5 * 60 * 1000).toISOString(); // 5分後
      const lockedError = new ApiError(403, 'Forbidden', {
        error: 'Account is locked due to too many failed login attempts',
        code: 'ACCOUNT_LOCKED',
        unlockAt,
      });
      mockOnLogin.mockRejectedValue(lockedError);

      render(<LoginForm onLogin={mockOnLogin} />);

      const emailInput = screen.getByLabelText(/メールアドレス/i);
      const passwordInput = screen.getByLabelText(/^パスワード$/i);
      const loginButton = screen.getByRole('button', { name: /ログイン/i });

      await user.type(emailInput, 'test@example.com');
      await user.type(passwordInput, 'password');
      await user.click(loginButton);

      await waitFor(() => {
        expect(screen.getByText(/アカウントがロックされています/i)).toBeInTheDocument();
        expect(screen.getByText(/分後に再試行できます/i)).toBeInTheDocument();
      });
    });
  });

  describe('アクセシビリティ', () => {
    it('全ての入力フィールドにlabel要素が関連付けられていること', () => {
      render(<LoginForm onLogin={mockOnLogin} />);

      const emailInput = screen.getByLabelText(/メールアドレス/i);
      const passwordInput = screen.getByLabelText(/^パスワード$/i);

      expect(emailInput).toHaveAccessibleName();
      expect(passwordInput).toHaveAccessibleName();
    });

    it('エラーメッセージがaria-liveで通知されること', async () => {
      const user = userEvent.setup();
      mockOnLogin.mockRejectedValue(
        new ApiError(401, 'Unauthorized', {
          error: 'Invalid credentials',
          code: 'INVALID_CREDENTIALS',
        })
      );

      render(<LoginForm onLogin={mockOnLogin} />);

      const emailInput = screen.getByLabelText(/メールアドレス/i);
      const passwordInput = screen.getByLabelText(/^パスワード$/i);
      const loginButton = screen.getByRole('button', { name: /ログイン/i });

      await user.type(emailInput, 'test@example.com');
      await user.type(passwordInput, 'wrongpassword');
      await user.click(loginButton);

      await waitFor(() => {
        const errorContainer = screen.getByRole('alert');
        expect(errorContainer).toBeInTheDocument();
        expect(errorContainer).toHaveAttribute('aria-live', 'polite');
      });
    });
  });
});
