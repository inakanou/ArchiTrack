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

  describe('セキュリティ要件', () => {
    it('存在しないメールアドレスでも成功メッセージが表示されること（要件29.1）', async () => {
      const user = userEvent.setup();
      // APIは成功を返す（存在しないメールアドレスでもセキュリティ上の理由で成功を返す）
      mockOnRequestReset.mockResolvedValue(undefined);

      render(<PasswordResetForm onRequestReset={mockOnRequestReset} />);

      const emailInput = screen.getByLabelText(/メールアドレス/i);
      const resetButton = screen.getByRole('button', {
        name: /リセットリンクを送信/i,
      });

      // 存在しないメールアドレスを入力
      await user.type(emailInput, 'nonexistent@example.com');
      await user.click(resetButton);

      // 成功メッセージが表示されることを確認（セキュリティ上の理由でメールアドレスの存在有無を示さない）
      await waitFor(() => {
        expect(screen.getByText(/パスワードリセットリンクを送信しました/i)).toBeInTheDocument();
      });
    });

    it('成功メッセージがメールアドレスの存在を示唆しないこと（要件29.1）', async () => {
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
        const successMessage = screen.getByText(/パスワードリセットリンクを送信しました/i);
        expect(successMessage).toBeInTheDocument();
        // メールアドレスの存在を示唆する表現が含まれていないことを確認
        expect(successMessage.textContent).not.toMatch(/が見つかりました/i);
        expect(successMessage.textContent).not.toMatch(/登録されて/i);
      });
    });
  });

  describe('エラーハンドリング', () => {
    it('リクエスト失敗時、汎用エラーが表示されること', async () => {
      const user = userEvent.setup();
      mockOnRequestReset.mockRejectedValue(new Error('Network Error'));

      render(<PasswordResetForm onRequestReset={mockOnRequestReset} />);

      const emailInput = screen.getByLabelText(/メールアドレス/i);
      const resetButton = screen.getByRole('button', {
        name: /リセットリンクを送信/i,
      });

      await user.type(emailInput, 'test@example.com');
      await user.click(resetButton);

      await waitFor(() => {
        expect(screen.getByText(/リセットリンクの送信に失敗しました/i)).toBeInTheDocument();
      });
    });

    it('RFC 7807 details形式のパスワードエラーが表示されること', async () => {
      const user = userEvent.setup();
      mockOnResetPassword.mockRejectedValue({
        response: {
          details: [{ path: 'newPassword', message: 'パスワードは12文字以上である必要があります' }],
        },
      });

      render(<PasswordResetForm resetToken="valid-token" onResetPassword={mockOnResetPassword} />);

      const passwordInput = screen.getByLabelText(/^新しいパスワード$/i);
      const passwordConfirmInput = screen.getByLabelText(/パスワード \(確認\)/i);
      const resetButton = screen.getByRole('button', {
        name: /パスワードをリセット/i,
      });

      await user.type(passwordInput, 'short');
      await user.type(passwordConfirmInput, 'short');
      await user.click(resetButton);

      await waitFor(() => {
        expect(screen.getByText(/パスワードは12文字以上である必要があります/i)).toBeInTheDocument();
      });
    });

    it('RFC 7807 details形式の汎用エラーが表示されること', async () => {
      const user = userEvent.setup();
      mockOnResetPassword.mockRejectedValue({
        response: {
          details: [{ path: 'other', message: 'その他のエラー' }],
        },
      });

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
        expect(screen.getByText(/その他のエラー/i)).toBeInTheDocument();
      });
    });

    it('TOKEN_EXPIREDエラーコードで期限切れメッセージが表示されること', async () => {
      const user = userEvent.setup();
      mockOnResetPassword.mockRejectedValue({
        response: {
          code: 'TOKEN_EXPIRED',
        },
      });

      render(
        <PasswordResetForm resetToken="expired-token" onResetPassword={mockOnResetPassword} />
      );

      const passwordInput = screen.getByLabelText(/^新しいパスワード$/i);
      const passwordConfirmInput = screen.getByLabelText(/パスワード \(確認\)/i);
      const resetButton = screen.getByRole('button', {
        name: /パスワードをリセット/i,
      });

      await user.type(passwordInput, 'Password123!');
      await user.type(passwordConfirmInput, 'Password123!');
      await user.click(resetButton);

      await waitFor(() => {
        expect(screen.getByText(/リセットリンクの有効期限が切れています/i)).toBeInTheDocument();
      });
    });

    it('INVALID_TOKENエラーコードで無効トークンメッセージが表示されること', async () => {
      const user = userEvent.setup();
      mockOnResetPassword.mockRejectedValue({
        response: {
          code: 'INVALID_TOKEN',
        },
      });

      render(
        <PasswordResetForm resetToken="invalid-token" onResetPassword={mockOnResetPassword} />
      );

      const passwordInput = screen.getByLabelText(/^新しいパスワード$/i);
      const passwordConfirmInput = screen.getByLabelText(/パスワード \(確認\)/i);
      const resetButton = screen.getByRole('button', {
        name: /パスワードをリセット/i,
      });

      await user.type(passwordInput, 'Password123!');
      await user.type(passwordConfirmInput, 'Password123!');
      await user.click(resetButton);

      await waitFor(() => {
        expect(screen.getByText(/リセットリンクが無効です/i)).toBeInTheDocument();
      });
    });

    it('detail付きエラーレスポンスでメッセージが表示されること', async () => {
      const user = userEvent.setup();
      mockOnResetPassword.mockRejectedValue({
        response: {
          detail: 'カスタムエラーメッセージ',
        },
      });

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
        expect(screen.getByText(/カスタムエラーメッセージ/i)).toBeInTheDocument();
      });
    });

    it('エラーレスポンスがない場合、デフォルトエラーが表示されること', async () => {
      const user = userEvent.setup();
      mockOnResetPassword.mockRejectedValue(new Error('Network Error'));

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
        expect(screen.getByText(/パスワードのリセットに失敗しました/i)).toBeInTheDocument();
      });
    });

    it('パスワード未入力時にバリデーションエラーが表示されること', async () => {
      const user = userEvent.setup();

      render(<PasswordResetForm resetToken="valid-token" onResetPassword={mockOnResetPassword} />);

      const resetButton = screen.getByRole('button', {
        name: /パスワードをリセット/i,
      });

      await user.click(resetButton);

      await waitFor(() => {
        expect(screen.getByText(/パスワードは必須です/i)).toBeInTheDocument();
      });
      expect(mockOnResetPassword).not.toHaveBeenCalled();
    });

    it('パスワード確認未入力時にバリデーションエラーが表示されること', async () => {
      const user = userEvent.setup();

      render(<PasswordResetForm resetToken="valid-token" onResetPassword={mockOnResetPassword} />);

      const passwordInput = screen.getByLabelText(/^新しいパスワード$/i);
      const resetButton = screen.getByRole('button', {
        name: /パスワードをリセット/i,
      });

      await user.type(passwordInput, 'Password123!');
      await user.click(resetButton);

      // Note: 実装では空のパスワード確認も「パスワードが一致しません」として処理される
      await waitFor(() => {
        expect(screen.getByText(/パスワードが一致しません/i)).toBeInTheDocument();
      });
      expect(mockOnResetPassword).not.toHaveBeenCalled();
    });

    it('メールアドレス未入力時にバリデーションエラーが表示されること', async () => {
      const user = userEvent.setup();

      render(<PasswordResetForm onRequestReset={mockOnRequestReset} />);

      const resetButton = screen.getByRole('button', {
        name: /リセットリンクを送信/i,
      });

      await user.click(resetButton);

      await waitFor(() => {
        expect(screen.getByText(/メールアドレスは必須です/i)).toBeInTheDocument();
      });
      expect(mockOnRequestReset).not.toHaveBeenCalled();
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
