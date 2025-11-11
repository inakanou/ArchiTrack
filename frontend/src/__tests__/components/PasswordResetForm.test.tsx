import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PasswordResetForm from '../../components/PasswordResetForm';

describe('PasswordResetForm', () => {
  const mockOnRequestReset = vi.fn();
  const mockOnResetPassword = vi.fn();

  beforeEach(() => {
    mockOnRequestReset.mockReset();
    mockOnResetPassword.mockReset();
  });

  describe('パスワードリセット要求モード', () => {
    it('メールアドレス入力フィールドが表示されること', () => {
      render(<PasswordResetForm onRequestReset={mockOnRequestReset} />);

      const emailInput = screen.getByLabelText(/メールアドレス/i);
      expect(emailInput).toBeInTheDocument();
      expect(emailInput).toHaveAttribute('type', 'email');
    });

    it('リセット要求ボタンが表示されること', () => {
      render(<PasswordResetForm onRequestReset={mockOnRequestReset} />);

      const resetButton = screen.getByRole('button', {
        name: /リセットリンクを送信/i,
      });
      expect(resetButton).toBeInTheDocument();
    });

    it('メールアドレス形式が無効な場合、エラーが表示されること', async () => {
      const user = userEvent.setup();
      render(<PasswordResetForm onRequestReset={mockOnRequestReset} />);

      const emailInput = screen.getByLabelText(/メールアドレス/i);
      await user.type(emailInput, 'invalid-email');
      await user.tab();

      await waitFor(() => {
        expect(screen.getByText(/有効なメールアドレスを入力してください/i)).toBeInTheDocument();
      });
    });

    it('有効なメールアドレスでリクエストすると、onRequestResetが呼ばれること', async () => {
      const user = userEvent.setup();
      mockOnRequestReset.mockResolvedValue(undefined);

      render(<PasswordResetForm onRequestReset={mockOnRequestReset} />);

      const emailInput = screen.getByLabelText(/メールアドレス/i);
      const resetButton = screen.getByRole('button', {
        name: /リセットリンクを送信/i,
      });

      await user.type(emailInput, 'test@example.com');
      await user.click(resetButton);

      await waitFor(() => {
        expect(mockOnRequestReset).toHaveBeenCalledWith({
          email: 'test@example.com',
        });
      });
    });

    it('リクエスト成功時、成功メッセージが表示されること', async () => {
      const user = userEvent.setup();
      mockOnRequestReset.mockResolvedValue(undefined);

      render(<PasswordResetForm onRequestReset={mockOnRequestReset} />);

      const emailInput = screen.getByLabelText(/メールアドレス/i);
      const resetButton = screen.getByRole('button', {
        name: /リセットリンクを送信/i,
      });

      await user.type(emailInput, 'test@example.com');
      await user.click(resetButton);

      await waitFor(() => {
        expect(screen.getByText(/パスワードリセットリンクを送信しました/i)).toBeInTheDocument();
      });
    });

    it('リクエスト処理中、ローディングスピナーとボタンの無効化が表示されること', async () => {
      const user = userEvent.setup();
      let resolveRequest: () => void;
      const requestPromise = new Promise<void>((resolve) => {
        resolveRequest = resolve;
      });
      mockOnRequestReset.mockReturnValue(requestPromise);

      render(<PasswordResetForm onRequestReset={mockOnRequestReset} />);

      const emailInput = screen.getByLabelText(/メールアドレス/i);
      const resetButton = screen.getByRole('button', {
        name: /リセットリンクを送信/i,
      });

      await user.type(emailInput, 'test@example.com');
      await user.click(resetButton);

      // ローディング中
      expect(screen.getByRole('status')).toBeInTheDocument();
      expect(resetButton).toBeDisabled();

      // リクエスト完了
      resolveRequest!();
      await waitFor(() => {
        expect(screen.queryByRole('status')).not.toBeInTheDocument();
        expect(resetButton).not.toBeDisabled();
      });
    });
  });

  describe('パスワードリセット実行モード', () => {
    it('新パスワード入力フィールドが表示されること', () => {
      render(<PasswordResetForm resetToken="valid-token" onResetPassword={mockOnResetPassword} />);

      const passwordInput = screen.getByLabelText(/^新しいパスワード$/i);
      expect(passwordInput).toBeInTheDocument();
      expect(passwordInput).toHaveAttribute('type', 'password');
    });

    it('パスワード確認フィールドが表示されること', () => {
      render(<PasswordResetForm resetToken="valid-token" onResetPassword={mockOnResetPassword} />);

      const passwordConfirmInput = screen.getByLabelText(/パスワード \(確認\)/i);
      expect(passwordConfirmInput).toBeInTheDocument();
      expect(passwordConfirmInput).toHaveAttribute('type', 'password');
    });

    it('パスワードリセットボタンが表示されること', () => {
      render(<PasswordResetForm resetToken="valid-token" onResetPassword={mockOnResetPassword} />);

      const resetButton = screen.getByRole('button', {
        name: /パスワードをリセット/i,
      });
      expect(resetButton).toBeInTheDocument();
    });

    it('パスワードとパスワード確認が一致しない場合、エラーが表示されること', async () => {
      const user = userEvent.setup();
      render(<PasswordResetForm resetToken="valid-token" onResetPassword={mockOnResetPassword} />);

      const passwordInput = screen.getByLabelText(/^新しいパスワード$/i);
      const passwordConfirmInput = screen.getByLabelText(/パスワード \(確認\)/i);

      await user.type(passwordInput, 'Password123!');
      await user.type(passwordConfirmInput, 'Different123!');
      await user.tab();

      await waitFor(() => {
        expect(screen.getByText(/パスワードが一致しません/i)).toBeInTheDocument();
      });
    });

    it('有効な入力でリセットすると、onResetPasswordが呼ばれること', async () => {
      const user = userEvent.setup();
      mockOnResetPassword.mockResolvedValue(undefined);

      render(<PasswordResetForm resetToken="valid-token" onResetPassword={mockOnResetPassword} />);

      const passwordInput = screen.getByLabelText(/^新しいパスワード$/i);
      const passwordConfirmInput = screen.getByLabelText(/パスワード \(確認\)/i);
      const resetButton = screen.getByRole('button', {
        name: /パスワードをリセット/i,
      });

      await user.type(passwordInput, 'Password123!');
      await user.type(passwordConfirmInput, 'Password123!');
      await user.click(resetButton);

      await waitFor(() => {
        expect(mockOnResetPassword).toHaveBeenCalledWith({
          resetToken: 'valid-token',
          password: 'Password123!',
          passwordConfirm: 'Password123!',
        });
      });
    });

    it('リセット成功時、成功メッセージが表示されること', async () => {
      const user = userEvent.setup();
      mockOnResetPassword.mockResolvedValue(undefined);

      render(<PasswordResetForm resetToken="valid-token" onResetPassword={mockOnResetPassword} />);

      const passwordInput = screen.getByLabelText(/^新しいパスワード$/i);
      const passwordConfirmInput = screen.getByLabelText(/パスワード \(確認\)/i);
      const resetButton = screen.getByRole('button', {
        name: /パスワードをリセット/i,
      });

      await user.type(passwordInput, 'Password123!');
      await user.type(passwordConfirmInput, 'Password123!');
      await user.click(resetButton);

      await waitFor(() => {
        expect(screen.getByText(/パスワードをリセットしました/i)).toBeInTheDocument();
      });
    });

    it('リセット処理中、ローディングスピナーとボタンの無効化が表示されること', async () => {
      const user = userEvent.setup();
      let resolveReset: () => void;
      const resetPromise = new Promise<void>((resolve) => {
        resolveReset = resolve;
      });
      mockOnResetPassword.mockReturnValue(resetPromise);

      render(<PasswordResetForm resetToken="valid-token" onResetPassword={mockOnResetPassword} />);

      const passwordInput = screen.getByLabelText(/^新しいパスワード$/i);
      const passwordConfirmInput = screen.getByLabelText(/パスワード \(確認\)/i);
      const resetButton = screen.getByRole('button', {
        name: /パスワードをリセット/i,
      });

      await user.type(passwordInput, 'Password123!');
      await user.type(passwordConfirmInput, 'Password123!');
      await user.click(resetButton);

      // ローディング中
      expect(screen.getByRole('status')).toBeInTheDocument();
      expect(resetButton).toBeDisabled();

      // リセット完了
      resolveReset!();
      await waitFor(() => {
        expect(screen.queryByRole('status')).not.toBeInTheDocument();
        expect(resetButton).not.toBeDisabled();
      });
    });
  });

  describe('アクセシビリティ', () => {
    it('リセット要求モード: 全ての入力フィールドにlabel要素が関連付けられていること', () => {
      render(<PasswordResetForm onRequestReset={mockOnRequestReset} />);

      const emailInput = screen.getByLabelText(/メールアドレス/i);
      expect(emailInput).toHaveAccessibleName();
    });

    it('リセット実行モード: 全ての入力フィールドにlabel要素が関連付けられていること', () => {
      render(<PasswordResetForm resetToken="valid-token" onResetPassword={mockOnResetPassword} />);

      const passwordInput = screen.getByLabelText(/^新しいパスワード$/i);
      const passwordConfirmInput = screen.getByLabelText(/パスワード \(確認\)/i);

      expect(passwordInput).toHaveAccessibleName();
      expect(passwordConfirmInput).toHaveAccessibleName();
    });

    it('エラーメッセージがaria-liveで通知されること', async () => {
      const user = userEvent.setup();
      render(<PasswordResetForm resetToken="valid-token" onResetPassword={mockOnResetPassword} />);

      const passwordInput = screen.getByLabelText(/^新しいパスワード$/i);
      const passwordConfirmInput = screen.getByLabelText(/パスワード \(確認\)/i);

      await user.type(passwordInput, 'Password123!');
      await user.type(passwordConfirmInput, 'Different123!');
      await user.tab();

      await waitFor(() => {
        const errorContainer = screen.getByRole('alert');
        expect(errorContainer).toBeInTheDocument();
        expect(errorContainer).toHaveAttribute('aria-live', 'polite');
      });
    });
  });
});
