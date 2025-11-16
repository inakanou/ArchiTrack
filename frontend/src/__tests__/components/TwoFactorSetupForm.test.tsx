import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TwoFactorSetupForm from '../../components/TwoFactorSetupForm';
import type {
  TwoFactorSetupData,
  TwoFactorEnabledData,
  TwoFactorSetupResult,
  TwoFactorEnableResult,
} from '../../types/two-factor.types';

describe('TwoFactorSetupForm', () => {
  const mockSetupData: TwoFactorSetupData = {
    secret: 'JBSWY3DPEHPK3PXP',
    qrCodeDataUrl:
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  };

  const mockBackupCodes = [
    'ABCD1234',
    'EFGH5678',
    'IJKL9012',
    'MNOP3456',
    'QRST7890',
    'UVWX1234',
    'YZAB5678',
    'CDEF9012',
    'GHIJ3456',
    'KLMN7890',
  ];

  const mockEnabledData: TwoFactorEnabledData = {
    backupCodes: mockBackupCodes,
  };

  const mockOnSetupStart = vi.fn<() => Promise<TwoFactorSetupResult>>();
  const mockOnEnable = vi.fn<(totpCode: string) => Promise<TwoFactorEnableResult>>();
  const mockOnComplete = vi.fn<() => void>();
  const mockOnCancel = vi.fn<() => void>();

  beforeEach(() => {
    vi.clearAllMocks();
    mockOnSetupStart.mockResolvedValue({ success: true, data: mockSetupData });
    mockOnEnable.mockResolvedValue({ success: true, data: mockEnabledData });
  });

  describe('Step 1: QRコード表示', () => {
    it('QRコードと秘密鍵を表示する', async () => {
      render(
        <TwoFactorSetupForm
          onSetupStart={mockOnSetupStart}
          onEnable={mockOnEnable}
          onComplete={mockOnComplete}
          onCancel={mockOnCancel}
        />
      );

      // セットアップ開始APIが呼ばれる
      await waitFor(() => {
        expect(mockOnSetupStart).toHaveBeenCalled();
      });

      // QRコードが表示される
      const qrImage = screen.getByRole('img', { name: /QRコード/i });
      expect(qrImage).toHaveAttribute('src', mockSetupData.qrCodeDataUrl);

      // 秘密鍵が表示される
      expect(screen.getByText(mockSetupData.secret)).toBeInTheDocument();

      // 検証ボタンが表示される
      expect(screen.getByRole('button', { name: /検証/i })).toBeInTheDocument();
    });

    it('プログレスバーが「1/3」を表示する', async () => {
      render(
        <TwoFactorSetupForm
          onSetupStart={mockOnSetupStart}
          onEnable={mockOnEnable}
          onComplete={mockOnComplete}
          onCancel={mockOnCancel}
        />
      );

      await waitFor(() => {
        expect(screen.getByText(/ステップ 1\/3/i)).toBeInTheDocument();
      });
    });

    it('キャンセルボタンをクリックするとonCancelが呼ばれる', async () => {
      const user = userEvent.setup();
      render(
        <TwoFactorSetupForm
          onSetupStart={mockOnSetupStart}
          onEnable={mockOnEnable}
          onComplete={mockOnComplete}
          onCancel={mockOnCancel}
        />
      );

      await waitFor(() => {
        expect(mockOnSetupStart).toHaveBeenCalled();
      });

      const cancelButton = screen.getByRole('button', { name: /キャンセル/i });
      await user.click(cancelButton);

      expect(mockOnCancel).toHaveBeenCalled();
    });

    it('セットアップ開始APIエラー時にエラーメッセージを表示する', async () => {
      mockOnSetupStart.mockResolvedValue({
        success: false,
        error: 'セットアップに失敗しました',
      });

      render(
        <TwoFactorSetupForm
          onSetupStart={mockOnSetupStart}
          onEnable={mockOnEnable}
          onComplete={mockOnComplete}
          onCancel={mockOnCancel}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('セットアップに失敗しました')).toBeInTheDocument();
      });
    });
  });

  describe('Step 2: TOTP検証', () => {
    it('6桁のTOTPコード入力フィールドを表示する', async () => {
      const user = userEvent.setup();
      render(
        <TwoFactorSetupForm
          onSetupStart={mockOnSetupStart}
          onEnable={mockOnEnable}
          onComplete={mockOnComplete}
          onCancel={mockOnCancel}
        />
      );

      await waitFor(() => {
        expect(mockOnSetupStart).toHaveBeenCalled();
      });

      // 検証ボタンをクリック
      const nextButton = screen.getByRole('button', { name: /検証/i });
      await user.click(nextButton);

      // 6桁入力フィールドが表示される
      const inputs = screen.getAllByRole('textbox');
      expect(inputs).toHaveLength(6);
    });

    it('6桁入力時に自動でフォーカスが移動する', async () => {
      const user = userEvent.setup();
      render(
        <TwoFactorSetupForm
          onSetupStart={mockOnSetupStart}
          onEnable={mockOnEnable}
          onComplete={mockOnComplete}
          onCancel={mockOnCancel}
        />
      );

      await waitFor(() => {
        expect(mockOnSetupStart).toHaveBeenCalled();
      });

      const nextButton = screen.getByRole('button', { name: /検証/i });
      await user.click(nextButton);

      const inputs = screen.getAllByRole('textbox') as HTMLInputElement[];

      // 1桁目に入力
      await user.type(inputs[0]!, '1');
      expect(inputs[1]).toHaveFocus();

      // 2桁目に入力
      await user.type(inputs[1]!, '2');
      expect(inputs[2]).toHaveFocus();
    });

    it('6桁入力完了後に検証ボタンが有効化される', async () => {
      const user = userEvent.setup();
      render(
        <TwoFactorSetupForm
          onSetupStart={mockOnSetupStart}
          onEnable={mockOnEnable}
          onComplete={mockOnComplete}
          onCancel={mockOnCancel}
        />
      );

      await waitFor(() => {
        expect(mockOnSetupStart).toHaveBeenCalled();
      });

      const nextButton = screen.getByRole('button', { name: /検証/i });
      await user.click(nextButton);

      const inputs = screen.getAllByRole('textbox') as HTMLInputElement[];

      // 6桁入力
      for (let i = 0; i < 6; i++) {
        await user.type(inputs[i]!, String(i));
      }

      // 検証ボタンが有効化される
      const verifyButton = screen.getByRole('button', { name: /検証/i });
      expect(verifyButton).not.toBeDisabled();
    });

    it('TOTP検証成功時にステップ3へ進む', async () => {
      const user = userEvent.setup();
      render(
        <TwoFactorSetupForm
          onSetupStart={mockOnSetupStart}
          onEnable={mockOnEnable}
          onComplete={mockOnComplete}
          onCancel={mockOnCancel}
        />
      );

      await waitFor(() => {
        expect(mockOnSetupStart).toHaveBeenCalled();
      });

      // ステップ2へ進む
      const nextButton = screen.getByRole('button', { name: /検証/i });
      await user.click(nextButton);

      const inputs = screen.getAllByRole('textbox') as HTMLInputElement[];
      for (let i = 0; i < 6; i++) {
        await user.type(inputs[i]!, String(i));
      }

      const verifyButton = screen.getByRole('button', { name: /検証/i });
      await user.click(verifyButton);

      await waitFor(() => {
        expect(mockOnEnable).toHaveBeenCalledWith('012345');
      });

      // ステップ3のバックアップコードが表示される
      await waitFor(() => {
        expect(
          screen.getByRole('heading', { name: /バックアップコードを保存/i })
        ).toBeInTheDocument();
      });
    });

    it('TOTP検証失敗時にエラーメッセージを表示する', async () => {
      const user = userEvent.setup();
      mockOnEnable.mockResolvedValue({
        success: false,
        error: '認証コードが正しくありません',
      });

      render(
        <TwoFactorSetupForm
          onSetupStart={mockOnSetupStart}
          onEnable={mockOnEnable}
          onComplete={mockOnComplete}
          onCancel={mockOnCancel}
        />
      );

      await waitFor(() => {
        expect(mockOnSetupStart).toHaveBeenCalled();
      });

      const nextButton = screen.getByRole('button', { name: /検証/i });
      await user.click(nextButton);

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
  });

  describe('Step 3: バックアップコード表示', () => {
    it('10個のバックアップコードを表示する', async () => {
      const user = userEvent.setup();
      render(
        <TwoFactorSetupForm
          onSetupStart={mockOnSetupStart}
          onEnable={mockOnEnable}
          onComplete={mockOnComplete}
          onCancel={mockOnCancel}
        />
      );

      await waitFor(() => {
        expect(mockOnSetupStart).toHaveBeenCalled();
      });

      // ステップ2へ
      const nextButton = screen.getByRole('button', { name: /検証/i });
      await user.click(nextButton);

      const inputs = screen.getAllByRole('textbox') as HTMLInputElement[];
      for (let i = 0; i < 6; i++) {
        await user.type(inputs[i]!, String(i));
      }

      const verifyButton = screen.getByRole('button', { name: /検証/i });
      await user.click(verifyButton);

      // ステップ3でバックアップコードが表示される
      await waitFor(() => {
        mockBackupCodes.forEach((code) => {
          expect(screen.getByText(code)).toBeInTheDocument();
        });
      });
    });

    it('保存確認チェックボックスがオフの場合、完了ボタンが無効化される', async () => {
      const user = userEvent.setup();
      render(
        <TwoFactorSetupForm
          onSetupStart={mockOnSetupStart}
          onEnable={mockOnEnable}
          onComplete={mockOnComplete}
          onCancel={mockOnCancel}
        />
      );

      await waitFor(() => {
        expect(mockOnSetupStart).toHaveBeenCalled();
      });

      // ステップ3へ進む
      const nextButton = screen.getByRole('button', { name: /検証/i });
      await user.click(nextButton);

      const inputs = screen.getAllByRole('textbox') as HTMLInputElement[];
      for (let i = 0; i < 6; i++) {
        await user.type(inputs[i]!, String(i));
      }

      const verifyButton = screen.getByRole('button', { name: /検証/i });
      await user.click(verifyButton);

      await waitFor(() => {
        const completeButton = screen.getByRole('button', { name: /完了/i });
        expect(completeButton).toBeDisabled();
      });
    });

    it('保存確認チェックボックスをオンにすると完了ボタンが有効化される', async () => {
      const user = userEvent.setup();
      render(
        <TwoFactorSetupForm
          onSetupStart={mockOnSetupStart}
          onEnable={mockOnEnable}
          onComplete={mockOnComplete}
          onCancel={mockOnCancel}
        />
      );

      await waitFor(() => {
        expect(mockOnSetupStart).toHaveBeenCalled();
      });

      // ステップ3へ進む
      const nextButton = screen.getByRole('button', { name: /検証/i });
      await user.click(nextButton);

      const inputs = screen.getAllByRole('textbox') as HTMLInputElement[];
      for (let i = 0; i < 6; i++) {
        await user.type(inputs[i]!, String(i));
      }

      const verifyButton = screen.getByRole('button', { name: /検証/i });
      await user.click(verifyButton);

      await waitFor(() => {
        expect(
          screen.getByRole('heading', { name: /バックアップコードを保存/i })
        ).toBeInTheDocument();
      });

      // チェックボックスをオンにする
      const checkbox = screen.getByRole('checkbox');
      await user.click(checkbox);

      const completeButton = screen.getByRole('button', { name: /完了/i });
      expect(completeButton).not.toBeDisabled();
    });

    it('完了ボタンをクリックするとonCompleteが呼ばれる', async () => {
      const user = userEvent.setup();
      render(
        <TwoFactorSetupForm
          onSetupStart={mockOnSetupStart}
          onEnable={mockOnEnable}
          onComplete={mockOnComplete}
          onCancel={mockOnCancel}
        />
      );

      await waitFor(() => {
        expect(mockOnSetupStart).toHaveBeenCalled();
      });

      // ステップ3へ進む
      const nextButton = screen.getByRole('button', { name: /検証/i });
      await user.click(nextButton);

      const inputs = screen.getAllByRole('textbox') as HTMLInputElement[];
      for (let i = 0; i < 6; i++) {
        await user.type(inputs[i]!, String(i));
      }

      const verifyButton = screen.getByRole('button', { name: /検証/i });
      await user.click(verifyButton);

      await waitFor(() => {
        expect(
          screen.getByRole('heading', { name: /バックアップコードを保存/i })
        ).toBeInTheDocument();
      });

      const checkbox = screen.getByRole('checkbox');
      await user.click(checkbox);

      const completeButton = screen.getByRole('button', { name: /完了/i });
      await user.click(completeButton);

      expect(mockOnComplete).toHaveBeenCalled();
    });

    it('ダウンロードボタンをクリックするとバックアップコードがダウンロードされる', async () => {
      const user = userEvent.setup();
      render(
        <TwoFactorSetupForm
          onSetupStart={mockOnSetupStart}
          onEnable={mockOnEnable}
          onComplete={mockOnComplete}
          onCancel={mockOnCancel}
        />
      );

      await waitFor(() => {
        expect(mockOnSetupStart).toHaveBeenCalled();
      });

      // ステップ3へ進む
      const nextButton = screen.getByRole('button', { name: /検証/i });
      await user.click(nextButton);

      const inputs = screen.getAllByRole('textbox') as HTMLInputElement[];
      for (let i = 0; i < 6; i++) {
        await user.type(inputs[i]!, String(i));
      }

      const verifyButton = screen.getByRole('button', { name: /検証/i });
      await user.click(verifyButton);

      await waitFor(() => {
        expect(
          screen.getByRole('heading', { name: /バックアップコードを保存/i })
        ).toBeInTheDocument();
      });

      // ダウンロードボタンが表示される
      const downloadButton = screen.getByRole('button', { name: /ダウンロード/i });
      expect(downloadButton).toBeInTheDocument();
    });

    it('コピーボタンをクリックするとバックアップコードがクリップボードにコピーされる', async () => {
      const user = userEvent.setup();
      // クリップボードAPIのモック
      const writeTextMock = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, 'clipboard', {
        value: {
          writeText: writeTextMock,
        },
        writable: true,
        configurable: true,
      });

      render(
        <TwoFactorSetupForm
          onSetupStart={mockOnSetupStart}
          onEnable={mockOnEnable}
          onComplete={mockOnComplete}
          onCancel={mockOnCancel}
        />
      );

      await waitFor(() => {
        expect(mockOnSetupStart).toHaveBeenCalled();
      });

      // ステップ3へ進む
      const nextButton = screen.getByRole('button', { name: /検証/i });
      await user.click(nextButton);

      const inputs = screen.getAllByRole('textbox') as HTMLInputElement[];
      for (let i = 0; i < 6; i++) {
        await user.type(inputs[i]!, String(i));
      }

      const verifyButton = screen.getByRole('button', { name: /検証/i });
      await user.click(verifyButton);

      await waitFor(() => {
        expect(
          screen.getByRole('heading', { name: /バックアップコードを保存/i })
        ).toBeInTheDocument();
      });

      // コピーボタンをクリック
      const copyButton = screen.getByRole('button', { name: /コピー/i });
      await user.click(copyButton);

      expect(writeTextMock).toHaveBeenCalledWith(mockBackupCodes.join('\n'));
    });
  });

  describe('アクセシビリティ', () => {
    it('QRコードにalt属性が設定されている', async () => {
      render(
        <TwoFactorSetupForm
          onSetupStart={mockOnSetupStart}
          onEnable={mockOnEnable}
          onComplete={mockOnComplete}
          onCancel={mockOnCancel}
        />
      );

      await waitFor(() => {
        const qrImage = screen.getByRole('img', { name: /QRコード/i });
        expect(qrImage).toHaveAttribute('alt');
      });
    });

    it('TOTP入力フィールドにaria-label属性が設定されている', async () => {
      const user = userEvent.setup();
      render(
        <TwoFactorSetupForm
          onSetupStart={mockOnSetupStart}
          onEnable={mockOnEnable}
          onComplete={mockOnComplete}
          onCancel={mockOnCancel}
        />
      );

      await waitFor(() => {
        expect(mockOnSetupStart).toHaveBeenCalled();
      });

      const nextButton = screen.getByRole('button', { name: /検証/i });
      await user.click(nextButton);

      const inputs = screen.getAllByRole('textbox');
      inputs.forEach((input, index) => {
        expect(input).toHaveAttribute('aria-label', `認証コード ${index + 1}桁目`);
      });
    });
  });
});
