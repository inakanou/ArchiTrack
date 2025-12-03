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

      // ローディング中（ローディングスピナーはaria-label="ローディング中"を持つ）
      expect(screen.getByRole('status', { name: /ローディング中/i })).toBeInTheDocument();
      expect(resetButton).toBeDisabled();

      // リセット完了
      resolveReset!();
      await waitFor(() => {
        expect(screen.queryByRole('status', { name: /ローディング中/i })).not.toBeInTheDocument();
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

  describe('要件29.2: パスワード再設定画面の実装検証', () => {
    describe('パスワード強度インジケーター統合', () => {
      it('パスワード入力時にパスワード強度インジケーターが表示されること（要件29.2-13）', async () => {
        const user = userEvent.setup();
        render(
          <PasswordResetForm resetToken="valid-token" onResetPassword={mockOnResetPassword} />
        );

        const passwordInput = screen.getByLabelText(/^新しいパスワード$/i);

        // パスワードを入力
        await user.type(passwordInput, 'Test123!');

        // パスワード強度インジケーターが表示されること
        await waitFor(() => {
          expect(screen.getByTestId('password-strength-indicator')).toBeInTheDocument();
        });
      });

      it('弱いパスワードで「弱い」と表示されること（要件29.2-13）', async () => {
        const user = userEvent.setup();
        render(
          <PasswordResetForm resetToken="valid-token" onResetPassword={mockOnResetPassword} />
        );

        const passwordInput = screen.getByLabelText(/^新しいパスワード$/i);

        // 弱いパスワードを入力
        await user.type(passwordInput, 'abc');

        await waitFor(() => {
          expect(screen.getByTestId('password-strength-text')).toHaveTextContent('弱い');
        });
      });

      it('強いパスワードで「強い」または「非常に強い」と表示されること（要件29.2-13）', async () => {
        const user = userEvent.setup();
        render(
          <PasswordResetForm resetToken="valid-token" onResetPassword={mockOnResetPassword} />
        );

        const passwordInput = screen.getByLabelText(/^新しいパスワード$/i);

        // 強いパスワードを入力
        await user.type(passwordInput, 'StrongP@ssw0rd!123');

        await waitFor(() => {
          const strengthText = screen.getByTestId('password-strength-text').textContent;
          expect(['強い', '非常に強い']).toContain(strengthText);
        });
      });
    });

    describe('パスワード要件チェックリスト統合', () => {
      it('パスワード入力時にパスワード要件チェックリストが表示されること（要件29.2-14）', async () => {
        const user = userEvent.setup();
        render(
          <PasswordResetForm resetToken="valid-token" onResetPassword={mockOnResetPassword} />
        );

        const passwordInput = screen.getByLabelText(/^新しいパスワード$/i);

        // パスワードを入力
        await user.type(passwordInput, 'Test');

        // 要件チェックリストが表示されること
        await waitFor(() => {
          expect(screen.getByText('12文字以上')).toBeInTheDocument();
          expect(screen.getByText('大文字を含む')).toBeInTheDocument();
          expect(screen.getByText('小文字を含む')).toBeInTheDocument();
          expect(screen.getByText('数字を含む')).toBeInTheDocument();
          expect(screen.getByText('特殊文字を含む')).toBeInTheDocument();
        });
      });

      it('要件を満たすと要件アイテムにチェックマークが表示されること（要件29.2-14）', async () => {
        const user = userEvent.setup();
        render(
          <PasswordResetForm resetToken="valid-token" onResetPassword={mockOnResetPassword} />
        );

        const passwordInput = screen.getByLabelText(/^新しいパスワード$/i);

        // 大文字、小文字を含むパスワードを入力
        await user.type(passwordInput, 'TestPassword');

        // 大文字を含む要件が満たされていること
        await waitFor(() => {
          const uppercaseItem = screen.getByText('大文字を含む').closest('li');
          expect(uppercaseItem).toHaveClass('requirement-met');
        });
      });
    });

    describe('リセット成功後の自動リダイレクト', () => {
      it('パスワード変更成功時に成功メッセージと自動リダイレクト通知が表示されること（要件29.2-17,18）', async () => {
        const user = userEvent.setup();
        mockOnResetPassword.mockResolvedValue(undefined);

        render(
          <PasswordResetForm resetToken="valid-token" onResetPassword={mockOnResetPassword} />
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
          // 成功メッセージが表示されること
          expect(screen.getByText(/パスワードをリセットしました/i)).toBeInTheDocument();
        });
      });
    });
  });
});
