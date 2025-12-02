import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TwoFactorVerificationForm from '../../components/TwoFactorVerificationForm';
import type { VerifyTOTPResult, VerifyBackupCodeResult } from '../../types/two-factor.types';

describe('TwoFactorVerificationForm', () => {
  const mockOnVerifyTOTP = vi.fn<(totpCode: string) => Promise<VerifyTOTPResult>>();
  const mockOnVerifyBackupCode = vi.fn<(backupCode: string) => Promise<VerifyBackupCodeResult>>();
  const mockOnCancel = vi.fn<() => void>();

  beforeEach(() => {
    vi.clearAllMocks();
    mockOnVerifyTOTP.mockResolvedValue({ success: true });
    mockOnVerifyBackupCode.mockResolvedValue({ success: true });
  });

  describe('TOTPモード', () => {
    it('6桁のTOTP入力フィールドを表示する', () => {
      render(
        <TwoFactorVerificationForm
          onVerifyTOTP={mockOnVerifyTOTP}
          onVerifyBackupCode={mockOnVerifyBackupCode}
          onCancel={mockOnCancel}
          disableTimer={true}
        />
      );

      const inputs = screen.getAllByRole('textbox');
      expect(inputs).toHaveLength(6);
    });

    it('6桁入力時に自動でフォーカスが移動する', async () => {
      const user = userEvent.setup({ delay: null });
      render(
        <TwoFactorVerificationForm
          onVerifyTOTP={mockOnVerifyTOTP}
          onVerifyBackupCode={mockOnVerifyBackupCode}
          onCancel={mockOnCancel}
          disableTimer={true}
        />
      );

      const inputs = screen.getAllByRole('textbox') as HTMLInputElement[];

      // 1桁目に入力
      await user.type(inputs[0]!, '1');
      await waitFor(() => {
        expect(inputs[1]).toHaveFocus();
      });

      // 2桁目に入力
      await user.type(inputs[1]!, '2');
      await waitFor(() => {
        expect(inputs[2]).toHaveFocus();
      });
    });

    it('6桁入力完了後に検証ボタンが有効化される', async () => {
      const user = userEvent.setup({ delay: null });
      render(
        <TwoFactorVerificationForm
          onVerifyTOTP={mockOnVerifyTOTP}
          onVerifyBackupCode={mockOnVerifyBackupCode}
          onCancel={mockOnCancel}
          disableTimer={true}
        />
      );

      const inputs = screen.getAllByRole('textbox') as HTMLInputElement[];

      // 6桁入力
      for (let i = 0; i < 6; i++) {
        await user.type(inputs[i]!, String(i));
      }

      await waitFor(() => {
        const verifyButton = screen.getByRole('button', { name: /検証/i });
        expect(verifyButton).not.toBeDisabled();
      });
    });

    it('TOTP検証成功時にonVerifyTOTPが呼ばれる', async () => {
      const user = userEvent.setup({ delay: null });
      render(
        <TwoFactorVerificationForm
          onVerifyTOTP={mockOnVerifyTOTP}
          onVerifyBackupCode={mockOnVerifyBackupCode}
          onCancel={mockOnCancel}
          disableTimer={true}
        />
      );

      const inputs = screen.getAllByRole('textbox') as HTMLInputElement[];
      for (let i = 0; i < 6; i++) {
        await user.type(inputs[i]!, String(i));
      }

      const verifyButton = screen.getByRole('button', { name: /検証/i });
      await user.click(verifyButton);

      await waitFor(() => {
        expect(mockOnVerifyTOTP).toHaveBeenCalledWith('012345');
      });
    });

    it('TOTP検証失敗時にエラーメッセージを表示する', async () => {
      const user = userEvent.setup({ delay: null });
      mockOnVerifyTOTP.mockResolvedValue({
        success: false,
        error: '認証コードが正しくありません',
      });

      render(
        <TwoFactorVerificationForm
          onVerifyTOTP={mockOnVerifyTOTP}
          onVerifyBackupCode={mockOnVerifyBackupCode}
          onCancel={mockOnCancel}
          disableTimer={true}
        />
      );

      const inputs = screen.getAllByRole('textbox') as HTMLInputElement[];
      for (let i = 0; i < 6; i++) {
        await user.type(inputs[i]!, String(i));
      }

      const verifyButton = screen.getByRole('button', { name: /検証/i });
      await user.click(verifyButton);

      await waitFor(() => {
        expect(screen.getByText('認証コードが正しくありません')).toBeInTheDocument();
      });
    });

    it('30秒カウントダウンタイマーを表示する', () => {
      render(
        <TwoFactorVerificationForm
          onVerifyTOTP={mockOnVerifyTOTP}
          onVerifyBackupCode={mockOnVerifyBackupCode}
          onCancel={mockOnCancel}
        />
      );

      // 初期状態で30秒表示
      expect(screen.getByText(/30秒/i)).toBeInTheDocument();
      // プログレスバーが表示されている
      const progressBars = screen
        .getByText(/30秒/i)
        .parentElement?.querySelectorAll('div[style*="height: 4px"]');
      expect(progressBars).toBeTruthy();
    });
  });

  describe('バックアップコードモード', () => {
    it('「バックアップコードを使用する」リンクをクリックするとモードが切り替わる', async () => {
      const user = userEvent.setup({ delay: null });
      render(
        <TwoFactorVerificationForm
          onVerifyTOTP={mockOnVerifyTOTP}
          onVerifyBackupCode={mockOnVerifyBackupCode}
          onCancel={mockOnCancel}
          disableTimer={true}
        />
      );

      const switchLink = screen.getByText(/バックアップコードを使用する/i);
      await user.click(switchLink);

      // バックアップコード入力フィールドが表示される
      await waitFor(() => {
        expect(screen.getByLabelText(/バックアップコード/i)).toBeInTheDocument();
      });
    });

    it('バックアップコード入力フィールドを表示する', async () => {
      const user = userEvent.setup({ delay: null });
      render(
        <TwoFactorVerificationForm
          onVerifyTOTP={mockOnVerifyTOTP}
          onVerifyBackupCode={mockOnVerifyBackupCode}
          onCancel={mockOnCancel}
          disableTimer={true}
        />
      );

      const switchLink = screen.getByText(/バックアップコードを使用する/i);
      await user.click(switchLink);

      await waitFor(() => {
        const backupCodeInput = screen.getByLabelText(/バックアップコード/i);
        expect(backupCodeInput).toBeInTheDocument();
      });
    });

    it('バックアップコード検証成功時にonVerifyBackupCodeが呼ばれる', async () => {
      const user = userEvent.setup({ delay: null });
      render(
        <TwoFactorVerificationForm
          onVerifyTOTP={mockOnVerifyTOTP}
          onVerifyBackupCode={mockOnVerifyBackupCode}
          onCancel={mockOnCancel}
          disableTimer={true}
        />
      );

      const switchLink = screen.getByText(/バックアップコードを使用する/i);
      await user.click(switchLink);

      await waitFor(() => {
        expect(screen.getByLabelText(/バックアップコード/i)).toBeInTheDocument();
      });

      const backupCodeInput = screen.getByLabelText(/バックアップコード/i);
      await user.type(backupCodeInput, 'ABCD1234');

      const verifyButton = screen.getByRole('button', { name: /検証/i });
      await user.click(verifyButton);

      await waitFor(() => {
        expect(mockOnVerifyBackupCode).toHaveBeenCalledWith('ABCD1234');
      });
    });

    it('バックアップコード検証失敗時にエラーメッセージを表示する', async () => {
      const user = userEvent.setup({ delay: null });
      mockOnVerifyBackupCode.mockResolvedValue({
        success: false,
        error: 'バックアップコードが正しくありません',
      });

      render(
        <TwoFactorVerificationForm
          onVerifyTOTP={mockOnVerifyTOTP}
          onVerifyBackupCode={mockOnVerifyBackupCode}
          onCancel={mockOnCancel}
          disableTimer={true}
        />
      );

      const switchLink = screen.getByText(/バックアップコードを使用する/i);
      await user.click(switchLink);

      await waitFor(() => {
        expect(screen.getByLabelText(/バックアップコード/i)).toBeInTheDocument();
      });

      const backupCodeInput = screen.getByLabelText(/バックアップコード/i);
      await user.type(backupCodeInput, 'INVALID1');

      const verifyButton = screen.getByRole('button', { name: /検証/i });
      await user.click(verifyButton);

      await waitFor(() => {
        expect(screen.getByText('バックアップコードが正しくありません')).toBeInTheDocument();
      });
    });

    it('「認証コードを使用する」リンクをクリックするとTOTPモードに戻る', async () => {
      const user = userEvent.setup({ delay: null });
      render(
        <TwoFactorVerificationForm
          onVerifyTOTP={mockOnVerifyTOTP}
          onVerifyBackupCode={mockOnVerifyBackupCode}
          onCancel={mockOnCancel}
          disableTimer={true}
        />
      );

      // バックアップコードモードに切り替え
      const switchLink = screen.getByText(/バックアップコードを使用する/i);
      await user.click(switchLink);

      await waitFor(() => {
        expect(screen.getByLabelText(/バックアップコード/i)).toBeInTheDocument();
      });

      // TOTPモードに戻る
      const backLink = screen.getByText(/認証コードを使用する/i);
      await user.click(backLink);

      // 6桁入力フィールドが表示される
      await waitFor(() => {
        const inputs = screen.getAllByRole('textbox');
        expect(inputs).toHaveLength(6);
      });
    });
  });

  describe('アクセシビリティ', () => {
    it('TOTP入力フィールドにaria-label属性が設定されている', () => {
      render(
        <TwoFactorVerificationForm
          onVerifyTOTP={mockOnVerifyTOTP}
          onVerifyBackupCode={mockOnVerifyBackupCode}
          onCancel={mockOnCancel}
          disableTimer={true}
        />
      );

      const inputs = screen.getAllByRole('textbox');
      inputs.forEach((input, index) => {
        expect(input).toHaveAttribute('aria-label', `認証コード ${index + 1}桁目`);
      });
    });

    it('エラーメッセージにaria-live属性が設定されている', async () => {
      const user = userEvent.setup({ delay: null });
      mockOnVerifyTOTP.mockResolvedValue({
        success: false,
        error: '認証コードが正しくありません',
      });

      render(
        <TwoFactorVerificationForm
          onVerifyTOTP={mockOnVerifyTOTP}
          onVerifyBackupCode={mockOnVerifyBackupCode}
          onCancel={mockOnCancel}
          disableTimer={true}
        />
      );

      const inputs = screen.getAllByRole('textbox') as HTMLInputElement[];
      for (let i = 0; i < 6; i++) {
        await user.type(inputs[i]!, String(i));
      }

      await waitFor(() => {
        const verifyButton = screen.getByRole('button', { name: /検証/i });
        expect(verifyButton).not.toBeDisabled();
      });

      const verifyButton = screen.getByRole('button', { name: /検証/i });
      await user.click(verifyButton);

      await waitFor(() => {
        const errorDiv = screen.getByRole('alert');
        expect(errorDiv).toHaveAttribute('aria-live', 'polite');
      });
    });
  });

  describe('バリデーション', () => {
    it('TOTP未入力で検証ボタンをクリックするとエラーメッセージが表示される', async () => {
      const user = userEvent.setup({ delay: null });
      render(
        <TwoFactorVerificationForm
          onVerifyTOTP={mockOnVerifyTOTP}
          onVerifyBackupCode={mockOnVerifyBackupCode}
          onCancel={mockOnCancel}
          disableTimer={true}
        />
      );

      const inputs = screen.getAllByRole('textbox') as HTMLInputElement[];
      // 3桁のみ入力（6桁未満）
      for (let i = 0; i < 3; i++) {
        await user.type(inputs[i]!, String(i));
      }

      // ボタンは無効化されているはず
      const verifyButton = screen.getByRole('button', { name: /検証/i });
      expect(verifyButton).toBeDisabled();
    });

    it('TOTP未入力でフォームをsubmitするとバリデーションエラーが表示される', async () => {
      const { container } = render(
        <TwoFactorVerificationForm
          onVerifyTOTP={mockOnVerifyTOTP}
          onVerifyBackupCode={mockOnVerifyBackupCode}
          onCancel={mockOnCancel}
          disableTimer={true}
        />
      );

      const form = container.querySelector('form');
      fireEvent.submit(form!);

      await waitFor(() => {
        expect(screen.getByText('6桁の認証コードを入力してください')).toBeInTheDocument();
      });
    });

    it('バックアップコード未入力でフォームをsubmitするとバリデーションエラーが表示される', async () => {
      const user = userEvent.setup({ delay: null });
      const { container } = render(
        <TwoFactorVerificationForm
          onVerifyTOTP={mockOnVerifyTOTP}
          onVerifyBackupCode={mockOnVerifyBackupCode}
          onCancel={mockOnCancel}
          disableTimer={true}
        />
      );

      const switchLink = screen.getByText(/バックアップコードを使用する/i);
      await user.click(switchLink);

      await waitFor(() => {
        expect(screen.getByLabelText(/バックアップコード/i)).toBeInTheDocument();
      });

      const form = container.querySelector('form');
      fireEvent.submit(form!);

      await waitFor(() => {
        expect(screen.getByText('バックアップコードを入力してください')).toBeInTheDocument();
      });
    });

    it('バックアップコード未入力で検証ボタンをクリックするとエラーメッセージが表示される', async () => {
      const user = userEvent.setup({ delay: null });
      render(
        <TwoFactorVerificationForm
          onVerifyTOTP={mockOnVerifyTOTP}
          onVerifyBackupCode={mockOnVerifyBackupCode}
          onCancel={mockOnCancel}
          disableTimer={true}
        />
      );

      const switchLink = screen.getByText(/バックアップコードを使用する/i);
      await user.click(switchLink);

      await waitFor(() => {
        expect(screen.getByLabelText(/バックアップコード/i)).toBeInTheDocument();
      });

      // バックアップコードを入力せずに検証ボタンをクリックしようとする
      const verifyButton = screen.getByRole('button', { name: /検証/i });
      expect(verifyButton).toBeDisabled();
    });

    it('TOTP検証中に予期しないエラーが発生した場合にエラーメッセージを表示する', async () => {
      const user = userEvent.setup({ delay: null });
      mockOnVerifyTOTP.mockRejectedValue(new Error('Network error'));

      render(
        <TwoFactorVerificationForm
          onVerifyTOTP={mockOnVerifyTOTP}
          onVerifyBackupCode={mockOnVerifyBackupCode}
          onCancel={mockOnCancel}
          disableTimer={true}
        />
      );

      const inputs = screen.getAllByRole('textbox') as HTMLInputElement[];
      for (let i = 0; i < 6; i++) {
        await user.type(inputs[i]!, String(i));
      }

      const verifyButton = screen.getByRole('button', { name: /検証/i });
      await user.click(verifyButton);

      await waitFor(() => {
        expect(screen.getByText('検証に失敗しました')).toBeInTheDocument();
      });
    });

    it('バックアップコード検証中に予期しないエラーが発生した場合にエラーメッセージを表示する', async () => {
      const user = userEvent.setup({ delay: null });
      mockOnVerifyBackupCode.mockRejectedValue(new Error('Network error'));

      render(
        <TwoFactorVerificationForm
          onVerifyTOTP={mockOnVerifyTOTP}
          onVerifyBackupCode={mockOnVerifyBackupCode}
          onCancel={mockOnCancel}
          disableTimer={true}
        />
      );

      const switchLink = screen.getByText(/バックアップコードを使用する/i);
      await user.click(switchLink);

      await waitFor(() => {
        expect(screen.getByLabelText(/バックアップコード/i)).toBeInTheDocument();
      });

      const backupCodeInput = screen.getByLabelText(/バックアップコード/i);
      await user.type(backupCodeInput, 'ABCD1234');

      const verifyButton = screen.getByRole('button', { name: /検証/i });
      await user.click(verifyButton);

      await waitFor(() => {
        expect(screen.getByText('検証に失敗しました')).toBeInTheDocument();
      });
    });
  });

  describe('キャンセル', () => {
    it('キャンセルボタンをクリックするとonCancelが呼ばれる', async () => {
      const user = userEvent.setup({ delay: null });
      render(
        <TwoFactorVerificationForm
          onVerifyTOTP={mockOnVerifyTOTP}
          onVerifyBackupCode={mockOnVerifyBackupCode}
          onCancel={mockOnCancel}
          disableTimer={true}
        />
      );

      const cancelButton = screen.getByRole('button', { name: /キャンセル/i });
      await user.click(cancelButton);

      await waitFor(() => {
        expect(mockOnCancel).toHaveBeenCalled();
      });
    });
  });
});
