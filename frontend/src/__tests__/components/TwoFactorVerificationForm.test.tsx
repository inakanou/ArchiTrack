import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
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
      expect(inputs[1]).toHaveFocus();

      // 2桁目に入力
      await user.type(inputs[1]!, '2');
      expect(inputs[2]).toHaveFocus();
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

      const verifyButton = screen.getByRole('button', { name: /検証/i });
      expect(verifyButton).not.toBeDisabled();
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

      expect(mockOnVerifyTOTP).toHaveBeenCalledWith('012345');
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
      expect(screen.getByLabelText(/バックアップコード/i)).toBeInTheDocument();
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

      const backupCodeInput = screen.getByLabelText(/バックアップコード/i);
      expect(backupCodeInput).toBeInTheDocument();
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

      const backupCodeInput = screen.getByLabelText(/バックアップコード/i);
      await user.type(backupCodeInput, 'ABCD1234');

      const verifyButton = screen.getByRole('button', { name: /検証/i });
      await user.click(verifyButton);

      expect(mockOnVerifyBackupCode).toHaveBeenCalledWith('ABCD1234');
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

      // TOTPモードに戻る
      const backLink = screen.getByText(/認証コードを使用する/i);
      await user.click(backLink);

      // 6桁入力フィールドが表示される
      const inputs = screen.getAllByRole('textbox');
      expect(inputs).toHaveLength(6);
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

      const verifyButton = screen.getByRole('button', { name: /検証/i });
      await user.click(verifyButton);

      await waitFor(() => {
        const errorDiv = screen.getByRole('alert');
        expect(errorDiv).toHaveAttribute('aria-live', 'polite');
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

      expect(mockOnCancel).toHaveBeenCalled();
    });
  });
});
