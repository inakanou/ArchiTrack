/**
 * @fileoverview ReceivedQuotationForm コンポーネントのテスト
 *
 * Task 14.1: ReceivedQuotationFormの実装
 *
 * Requirements:
 * - 11.2: 受領見積書登録フォーム
 * - 11.3: 受領見積書名（必須）
 * - 11.4: 提出日（必須）
 * - 11.5: テキスト入力フィールド
 * - 11.6: ファイルアップロード
 * - 11.7: テキストとファイルの排他的選択
 * - 11.8: ファイル形式制限（PDF、Excel、画像）
 * - 11.10: バリデーションエラー表示
 * - 11.15: 受領見積書編集
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReceivedQuotationForm } from './ReceivedQuotationForm';

describe('ReceivedQuotationForm', () => {
  const mockOnSubmit = vi.fn();
  const mockOnCancel = vi.fn();
  const estimateRequestId = 'er-123';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('レンダリング', () => {
    it('新規作成モードでフォームが正しくレンダリングされる', () => {
      render(
        <ReceivedQuotationForm
          mode="create"
          estimateRequestId={estimateRequestId}
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
        />
      );

      expect(screen.getByLabelText(/受領見積書名/)).toBeInTheDocument();
      expect(screen.getByLabelText(/提出日/)).toBeInTheDocument();
      expect(screen.getByRole('radio', { name: /テキスト/ })).toBeInTheDocument();
      expect(screen.getByRole('radio', { name: /ファイル/ })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /登録/ })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /キャンセル/ })).toBeInTheDocument();
    });

    it('新規作成モードで受領見積書名のデフォルト値が「見積書」になる (11.3.1)', () => {
      render(
        <ReceivedQuotationForm
          mode="create"
          estimateRequestId={estimateRequestId}
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
        />
      );

      expect(screen.getByLabelText(/受領見積書名/)).toHaveValue('見積書');
    });

    it('新規作成モードで提出日のデフォルト値が今日の日付になる (11.4.1)', () => {
      render(
        <ReceivedQuotationForm
          mode="create"
          estimateRequestId={estimateRequestId}
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
        />
      );

      // 今日の日付をyyyy-MM-dd形式で取得
      const today = new Date();
      const year = today.getFullYear();
      const month = String(today.getMonth() + 1).padStart(2, '0');
      const day = String(today.getDate()).padStart(2, '0');
      const expectedDate = `${year}-${month}-${day}`;

      expect(screen.getByLabelText(/提出日/)).toHaveValue(expectedDate);
    });

    it('編集モードで初期データが表示される', () => {
      const initialData = {
        id: 'rq-123',
        estimateRequestId,
        name: 'テスト見積書',
        submittedAt: new Date('2025-01-15'),
        contentType: 'TEXT' as const,
        textContent: 'テスト内容',
        fileName: null,
        fileMimeType: null,
        fileSize: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      render(
        <ReceivedQuotationForm
          mode="edit"
          estimateRequestId={estimateRequestId}
          initialData={initialData}
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
        />
      );

      expect(screen.getByLabelText(/受領見積書名/)).toHaveValue('テスト見積書');
      expect(screen.getByRole('radio', { name: /テキスト/ })).toBeChecked();
      expect(screen.getByRole('button', { name: /更新/ })).toBeInTheDocument();
    });
  });

  describe('テキストとファイルの排他選択 (11.7)', () => {
    it('テキストラジオ選択時にテキスト入力フィールドが表示される', async () => {
      render(
        <ReceivedQuotationForm
          mode="create"
          estimateRequestId={estimateRequestId}
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
        />
      );

      const textRadio = screen.getByRole('radio', { name: /テキスト/ });
      await userEvent.click(textRadio);

      expect(screen.getByPlaceholderText(/見積内容を入力/)).toBeInTheDocument();
    });

    it('ファイルラジオ選択時にファイルアップロード領域が表示される', async () => {
      render(
        <ReceivedQuotationForm
          mode="create"
          estimateRequestId={estimateRequestId}
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
        />
      );

      const fileRadio = screen.getByRole('radio', { name: /ファイル/ });
      await userEvent.click(fileRadio);

      expect(screen.getByText(/ファイルを選択/)).toBeInTheDocument();
    });

    it('テキストからファイルに切り替えるとテキスト入力がクリアされる', async () => {
      render(
        <ReceivedQuotationForm
          mode="create"
          estimateRequestId={estimateRequestId}
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
        />
      );

      // テキストを入力
      const textRadio = screen.getByRole('radio', { name: /テキスト/ });
      await userEvent.click(textRadio);
      const textInput = screen.getByPlaceholderText(/見積内容を入力/);
      await userEvent.type(textInput, 'テスト内容');

      // ファイルに切り替え
      const fileRadio = screen.getByRole('radio', { name: /ファイル/ });
      await userEvent.click(fileRadio);

      // テキストに戻す
      await userEvent.click(textRadio);
      const newTextInput = screen.getByPlaceholderText(/見積内容を入力/);
      expect(newTextInput).toHaveValue('');
    });
  });

  describe('バリデーション (11.10)', () => {
    it('受領見積書名が未入力の場合エラーが表示される', async () => {
      render(
        <ReceivedQuotationForm
          mode="create"
          estimateRequestId={estimateRequestId}
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
        />
      );

      // デフォルト値「見積書」をクリアして空にする
      const nameInput = screen.getByLabelText(/受領見積書名/);
      await userEvent.clear(nameInput);

      const submitButton = screen.getByRole('button', { name: /登録/ });
      await userEvent.click(submitButton);

      expect(await screen.findByText(/受領見積書名を入力してください/)).toBeInTheDocument();
      expect(mockOnSubmit).not.toHaveBeenCalled();
    });

    it('提出日が未入力の場合エラーが表示される', async () => {
      render(
        <ReceivedQuotationForm
          mode="create"
          estimateRequestId={estimateRequestId}
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
        />
      );

      // デフォルト値（今日の日付）をクリアして空にする
      const dateInput = screen.getByLabelText(/提出日/);
      fireEvent.change(dateInput, { target: { value: '' } });

      const submitButton = screen.getByRole('button', { name: /登録/ });
      await userEvent.click(submitButton);

      expect(await screen.findByText(/提出日を入力してください/)).toBeInTheDocument();
      expect(mockOnSubmit).not.toHaveBeenCalled();
    });

    it('テキスト選択時にテキストが未入力の場合エラーが表示される', async () => {
      render(
        <ReceivedQuotationForm
          mode="create"
          estimateRequestId={estimateRequestId}
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
        />
      );

      // 名前と日付を入力
      await userEvent.type(screen.getByLabelText(/受領見積書名/), 'テスト見積書');
      const dateInput = screen.getByLabelText(/提出日/);
      fireEvent.change(dateInput, { target: { value: '2025-01-15' } });

      // テキストを選択（デフォルト）
      const textRadio = screen.getByRole('radio', { name: /テキスト/ });
      await userEvent.click(textRadio);

      const submitButton = screen.getByRole('button', { name: /登録/ });
      await userEvent.click(submitButton);

      expect(await screen.findByText(/テキスト内容を入力してください/)).toBeInTheDocument();
      expect(mockOnSubmit).not.toHaveBeenCalled();
    });

    it('ファイル選択時にファイルが未選択の場合エラーが表示される', async () => {
      render(
        <ReceivedQuotationForm
          mode="create"
          estimateRequestId={estimateRequestId}
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
        />
      );

      // 名前と日付を入力
      await userEvent.type(screen.getByLabelText(/受領見積書名/), 'テスト見積書');
      const dateInput = screen.getByLabelText(/提出日/);
      fireEvent.change(dateInput, { target: { value: '2025-01-15' } });

      // ファイルを選択
      const fileRadio = screen.getByRole('radio', { name: /ファイル/ });
      await userEvent.click(fileRadio);

      const submitButton = screen.getByRole('button', { name: /登録/ });
      await userEvent.click(submitButton);

      expect(await screen.findByText(/ファイルを選択してください/)).toBeInTheDocument();
      expect(mockOnSubmit).not.toHaveBeenCalled();
    });
  });

  describe('ファイルバリデーション (11.8)', () => {
    it('許可されていないファイル形式の場合エラーが表示される', async () => {
      render(
        <ReceivedQuotationForm
          mode="create"
          estimateRequestId={estimateRequestId}
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
        />
      );

      // ファイルモードに切り替え
      const fileRadio = screen.getByRole('radio', { name: /ファイル/ });
      await userEvent.click(fileRadio);

      // 許可されていない形式のファイルを選択
      const invalidFile = new File(['content'], 'test.txt', { type: 'text/plain' });
      const fileInput = screen.getByTestId('file-input') as HTMLInputElement;

      // fireEventを使用してファイルを設定
      Object.defineProperty(fileInput, 'files', {
        value: [invalidFile],
        writable: false,
      });
      fireEvent.change(fileInput);

      expect(
        await screen.findByText(/PDF、Excel、画像ファイルのみ対応しています/)
      ).toBeInTheDocument();
    });

    it('ファイルサイズが10MBを超える場合エラーが表示される', async () => {
      render(
        <ReceivedQuotationForm
          mode="create"
          estimateRequestId={estimateRequestId}
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
        />
      );

      // ファイルモードに切り替え
      const fileRadio = screen.getByRole('radio', { name: /ファイル/ });
      await userEvent.click(fileRadio);

      // 10MBを超えるファイルを模擬（実際のサイズはモック）
      const largeFile = new File(['content'], 'large.pdf', { type: 'application/pdf' });
      Object.defineProperty(largeFile, 'size', { value: 11 * 1024 * 1024, writable: false });

      const fileInput = screen.getByTestId('file-input') as HTMLInputElement;
      Object.defineProperty(fileInput, 'files', {
        value: [largeFile],
        writable: false,
      });
      fireEvent.change(fileInput);

      expect(await screen.findByText(/ファイルサイズは10MB以下にしてください/)).toBeInTheDocument();
    });

    it('PDFファイルは許可される', async () => {
      render(
        <ReceivedQuotationForm
          mode="create"
          estimateRequestId={estimateRequestId}
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
        />
      );

      // ファイルモードに切り替え
      const fileRadio = screen.getByRole('radio', { name: /ファイル/ });
      await userEvent.click(fileRadio);

      const validFile = new File(['content'], 'test.pdf', { type: 'application/pdf' });
      const fileInput = screen.getByTestId('file-input') as HTMLInputElement;
      Object.defineProperty(fileInput, 'files', {
        value: [validFile],
        writable: false,
      });
      fireEvent.change(fileInput);

      // ファイル名が表示されることを確認
      expect(await screen.findByText('test.pdf')).toBeInTheDocument();
    });

    it('Excelファイル(.xlsx)は許可される', async () => {
      render(
        <ReceivedQuotationForm
          mode="create"
          estimateRequestId={estimateRequestId}
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
        />
      );

      const fileRadio = screen.getByRole('radio', { name: /ファイル/ });
      await userEvent.click(fileRadio);

      const validFile = new File(['content'], 'test.xlsx', {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const fileInput = screen.getByTestId('file-input') as HTMLInputElement;
      Object.defineProperty(fileInput, 'files', {
        value: [validFile],
        writable: false,
      });
      fireEvent.change(fileInput);

      expect(await screen.findByText('test.xlsx')).toBeInTheDocument();
    });

    it('画像ファイル(JPEG)は許可される', async () => {
      render(
        <ReceivedQuotationForm
          mode="create"
          estimateRequestId={estimateRequestId}
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
        />
      );

      const fileRadio = screen.getByRole('radio', { name: /ファイル/ });
      await userEvent.click(fileRadio);

      const validFile = new File(['content'], 'test.jpg', { type: 'image/jpeg' });
      const fileInput = screen.getByTestId('file-input') as HTMLInputElement;
      Object.defineProperty(fileInput, 'files', {
        value: [validFile],
        writable: false,
      });
      fireEvent.change(fileInput);

      expect(await screen.findByText('test.jpg')).toBeInTheDocument();
    });
  });

  describe('ファイルプレビュー', () => {
    it('ファイル選択時にファイル名とサイズが表示される', async () => {
      render(
        <ReceivedQuotationForm
          mode="create"
          estimateRequestId={estimateRequestId}
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
        />
      );

      const fileRadio = screen.getByRole('radio', { name: /ファイル/ });
      await userEvent.click(fileRadio);

      // 500KBのファイル（サイズをモック）
      const file = new File(['content'], 'document.pdf', { type: 'application/pdf' });
      Object.defineProperty(file, 'size', { value: 500 * 1024, writable: false });

      const fileInput = screen.getByTestId('file-input') as HTMLInputElement;
      Object.defineProperty(fileInput, 'files', {
        value: [file],
        writable: false,
      });
      fireEvent.change(fileInput);

      expect(await screen.findByText('document.pdf')).toBeInTheDocument();
      expect(screen.getByText(/500/)).toBeInTheDocument(); // ファイルサイズ
    });
  });

  describe('フォーム送信', () => {
    it('テキスト入力で正常に送信できる', async () => {
      mockOnSubmit.mockResolvedValueOnce(undefined);

      render(
        <ReceivedQuotationForm
          mode="create"
          estimateRequestId={estimateRequestId}
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
        />
      );

      // フォーム入力（デフォルト値をクリアしてから入力）
      const nameInput = screen.getByLabelText(/受領見積書名/);
      await userEvent.clear(nameInput);
      await userEvent.type(nameInput, 'テスト見積書');
      const dateInput = screen.getByLabelText(/提出日/);
      fireEvent.change(dateInput, { target: { value: '2025-01-15' } });
      const textRadio = screen.getByRole('radio', { name: /テキスト/ });
      await userEvent.click(textRadio);
      await userEvent.type(screen.getByPlaceholderText(/見積内容を入力/), 'テスト内容');

      const submitButton = screen.getByRole('button', { name: /登録/ });
      await userEvent.click(submitButton);

      await waitFor(() => {
        expect(mockOnSubmit).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'テスト見積書',
            contentType: 'TEXT',
            textContent: 'テスト内容',
          })
        );
      });
    });

    it('ファイルアップロードで正常に送信できる', async () => {
      mockOnSubmit.mockResolvedValueOnce(undefined);

      render(
        <ReceivedQuotationForm
          mode="create"
          estimateRequestId={estimateRequestId}
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
        />
      );

      // フォーム入力（デフォルト値をクリアしてから入力）
      const nameInput = screen.getByLabelText(/受領見積書名/);
      await userEvent.clear(nameInput);
      await userEvent.type(nameInput, 'テスト見積書');
      const dateInput = screen.getByLabelText(/提出日/);
      fireEvent.change(dateInput, { target: { value: '2025-01-15' } });

      // ファイルモードに切り替え
      const fileRadio = screen.getByRole('radio', { name: /ファイル/ });
      await userEvent.click(fileRadio);

      // ファイル選択
      const validFile = new File(['content'], 'test.pdf', { type: 'application/pdf' });
      const fileInput = screen.getByTestId('file-input') as HTMLInputElement;
      Object.defineProperty(fileInput, 'files', {
        value: [validFile],
        writable: false,
      });
      fireEvent.change(fileInput);

      const submitButton = screen.getByRole('button', { name: /登録/ });
      await userEvent.click(submitButton);

      await waitFor(() => {
        expect(mockOnSubmit).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'テスト見積書',
            contentType: 'FILE',
            file: expect.any(File),
          })
        );
      });
    });

    it('送信中はボタンが無効化される', async () => {
      render(
        <ReceivedQuotationForm
          mode="create"
          estimateRequestId={estimateRequestId}
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
          isSubmitting={true}
        />
      );

      const submitButton = screen.getByRole('button', { name: /登録中/ });
      expect(submitButton).toBeDisabled();
      expect(screen.getByRole('button', { name: /キャンセル/ })).toBeDisabled();
    });
  });

  describe('キャンセル', () => {
    it('キャンセルボタンクリックでonCancelが呼ばれる', async () => {
      render(
        <ReceivedQuotationForm
          mode="create"
          estimateRequestId={estimateRequestId}
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
        />
      );

      const cancelButton = screen.getByRole('button', { name: /キャンセル/ });
      await userEvent.click(cancelButton);

      expect(mockOnCancel).toHaveBeenCalled();
    });
  });
});
