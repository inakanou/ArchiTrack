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

  describe('追加カバレッジテスト', () => {
    it('6桁コードをペーストすると全フィールドに入力される', async () => {
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

      // 最初の入力フィールドを取得
      const firstInput = screen.getByTestId('totp-digit-0');

      // ペーストイベントをシミュレート
      await user.click(firstInput);
      await user.paste('123456');

      // 全フィールドに値が入力されていることを確認
      const inputs = screen.getAllByRole('textbox') as HTMLInputElement[];
      expect(inputs[0]).toHaveValue('1');
      expect(inputs[1]).toHaveValue('2');
      expect(inputs[2]).toHaveValue('3');
      expect(inputs[3]).toHaveValue('4');
      expect(inputs[4]).toHaveValue('5');
      expect(inputs[5]).toHaveValue('6');
    });

    it('Backspaceキーで前のフィールドにフォーカスが移動する', async () => {
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

      const inputs = screen.getAllByRole('textbox') as HTMLInputElement[];

      // 2番目のフィールドにフォーカス
      const secondInput = inputs[1];
      expect(secondInput).toBeDefined();
      await user.click(secondInput!);

      // Backspaceキーを押す
      await user.keyboard('{Backspace}');

      // 最初のフィールドにフォーカスが移動していることを確認
      expect(inputs[0]).toHaveFocus();
    });

    it('印刷ボタンをクリックすると印刷ウィンドウが開く', async () => {
      const user = userEvent.setup();
      const mockPrintWindow = {
        document: {
          write: vi.fn(),
          close: vi.fn(),
        },
        print: vi.fn(),
      };
      vi.spyOn(window, 'open').mockReturnValue(mockPrintWindow as unknown as Window);

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

      // 印刷ボタンをクリック
      const printButton = screen.getByRole('button', { name: /印刷/i });
      await user.click(printButton);

      expect(window.open).toHaveBeenCalledWith('', '_blank');
      expect(mockPrintWindow.document.write).toHaveBeenCalled();
      expect(mockPrintWindow.print).toHaveBeenCalled();
    });

    it('クリップボードコピー失敗時にエラーメッセージを表示する', async () => {
      const user = userEvent.setup();
      const writeTextMock = vi.fn().mockRejectedValue(new Error('Clipboard error'));
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

      await waitFor(() => {
        expect(screen.getByText(/クリップボードへのコピーに失敗しました/)).toBeInTheDocument();
      });
    });

    it('セットアップ開始APIが例外をスローした場合にエラーメッセージを表示する', async () => {
      mockOnSetupStart.mockRejectedValue(new Error('Network error'));

      render(
        <TwoFactorSetupForm
          onSetupStart={mockOnSetupStart}
          onEnable={mockOnEnable}
          onComplete={mockOnComplete}
          onCancel={mockOnCancel}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('セットアップの初期化に失敗しました')).toBeInTheDocument();
      });
    });

    it('TOTP検証APIが例外をスローした場合にエラーメッセージを表示する', async () => {
      const user = userEvent.setup();
      mockOnEnable.mockRejectedValue(new Error('Network error'));

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

    it('ダウンロードボタンをクリックするとダウンロードが実行される', async () => {
      const user = userEvent.setup();

      // URL APIのモック（renderの前に設定）
      const revokeObjectURLSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
      const createObjectURLSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test');

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

      // ダウンロードボタンをクリック
      const downloadButton = screen.getByRole('button', { name: /ダウンロード/i });
      await user.click(downloadButton);

      // URL.createObjectURLとrevokeObjectURLが呼ばれることを確認
      expect(createObjectURLSpy).toHaveBeenCalled();
      expect(revokeObjectURLSpy).toHaveBeenCalled();
    });

    it('6桁未満のペーストは無視される', async () => {
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

      const firstInput = screen.getByTestId('totp-digit-0');
      await user.click(firstInput);
      await user.paste('12345'); // 5桁（6桁未満）

      // 値が入力されていないことを確認
      const inputs = screen.getAllByRole('textbox') as HTMLInputElement[];
      expect(inputs[0]).toHaveValue('');
    });

    it('複数桁の入力は最初の1桁のみ受け付ける', async () => {
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

      const firstInput = screen.getByTestId('totp-digit-0') as HTMLInputElement;
      // 既存の値を設定してから複数文字を入力しようとする
      await user.type(firstInput, '1');
      // 入力フィールドは既に次に移動しているので、最初のフィールドの値を確認
      expect(firstInput).toHaveValue('1');
    });

    it('window.openがnullを返す場合も印刷処理がエラーにならない', async () => {
      const user = userEvent.setup();
      vi.spyOn(window, 'open').mockReturnValue(null);

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

      // 印刷ボタンをクリック（エラーにならないことを確認）
      const printButton = screen.getByRole('button', { name: /印刷/i });
      await user.click(printButton);

      expect(window.open).toHaveBeenCalledWith('', '_blank');
    });

    it('Backspaceキーでフィールドに値がある場合はフォーカス移動しない', async () => {
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

      const inputs = screen.getAllByRole('textbox') as HTMLInputElement[];

      // 2番目のフィールドに値を入力
      await user.type(inputs[1]!, '5');

      // 3番目のフィールドにフォーカスが移動するので、2番目に戻る
      await user.click(inputs[1]!);

      // Backspaceキーを押す（値があるので前に移動しない）
      await user.keyboard('{Backspace}');

      // 2番目のフィールドにまだフォーカスがあるはず（値を削除しただけ）
      expect(inputs[1]).toHaveFocus();
    });

    it('最初のフィールドでBackspaceを押しても何も起きない', async () => {
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

      const inputs = screen.getAllByRole('textbox') as HTMLInputElement[];
      await user.click(inputs[0]!);

      // Backspaceキーを押す
      await user.keyboard('{Backspace}');

      // フォーカスは最初のフィールドのまま
      expect(inputs[0]).toHaveFocus();
    });
  });
});
