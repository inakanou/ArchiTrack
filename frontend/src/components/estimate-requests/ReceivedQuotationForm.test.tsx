/**
 * @fileoverview ReceivedQuotationForm コンポーネントのテスト
 *
 * Task 14.1: ReceivedQuotationFormの実装
 * Task 26.1: ReceivedQuotationFormの改訂統合
 *
 * Requirements:
 * - 11.1: 受領見積書登録ボタン表示
 * - 11.2: 受領見積書登録フォーム
 * - 11.3: 受領見積書名（必須）
 * - 11.4: 提出日（必須）
 * - 11.5: ファイルアップロードフィールド表示
 * - 11.6: ドラッグ&ドロップによるファイル選択のサポート
 * - 11.7: ファイル形式制限（PDF、Excel、画像）
 * - 11.8: ファイルサイズ上限10MB
 * - 11.9: 構造化データ入力エリア表示
 * - 11.14: フォーム初期表示時に1行の空明細行表示
 * - 11.22: ファイルまたは明細行データのいずれか入力で保存可能
 * - 11.23: 必須項目バリデーション
 * - 11.24: ファイル未アップロード・全明細行空の場合のエラー表示
 * - 11.25: 受領見積書の編集機能
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReceivedQuotationForm } from './ReceivedQuotationForm';

// FileInlinePreviewとOcrDataExtractorをモック
vi.mock('./FileInlinePreview', () => ({
  FileInlinePreview: ({ file }: { file: File | null }) =>
    file ? <div data-testid="file-inline-preview">{file.name} のプレビュー</div> : null,
  default: ({ file }: { file: File | null }) =>
    file ? <div data-testid="file-inline-preview">{file.name} のプレビュー</div> : null,
}));

vi.mock('./OcrDataExtractor', () => ({
  OcrDataExtractor: ({
    file,
    onImportLineItems,
  }: {
    file: File | null;
    onImportLineItems: (items: unknown[]) => void;
  }) =>
    file ? (
      <div data-testid="ocr-data-extractor">
        <button
          type="button"
          data-testid="mock-import-button"
          onClick={() =>
            onImportLineItems([
              {
                id: 'mock-1',
                name: 'テスト品目',
                specification: 'テスト規格',
                unit: '個',
                quantity: '10',
                unitPrice: '1000',
                amount: 10000,
                remarks: '',
              },
            ])
          }
        >
          OCRインポート
        </button>
      </div>
    ) : null,
  default: ({
    file,
    onImportLineItems,
  }: {
    file: File | null;
    onImportLineItems: (items: unknown[]) => void;
  }) =>
    file ? (
      <div data-testid="ocr-data-extractor">
        <button
          type="button"
          data-testid="mock-import-button"
          onClick={() =>
            onImportLineItems([
              {
                id: 'mock-1',
                name: 'テスト品目',
                specification: 'テスト規格',
                unit: '個',
                quantity: '10',
                unitPrice: '1000',
                amount: 10000,
                remarks: '',
              },
            ])
          }
        >
          OCRインポート
        </button>
      </div>
    ) : null,
}));

describe('ReceivedQuotationForm', () => {
  const mockOnSubmit = vi.fn();
  const mockOnCancel = vi.fn();
  const estimateRequestId = 'er-123';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('基本レンダリング (Task 26.1)', () => {
    it('ファイルアップロードエリアと明細行エディタが両方表示される', () => {
      render(
        <ReceivedQuotationForm
          mode="create"
          estimateRequestId={estimateRequestId}
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
        />
      );

      // 受領見積書名と提出日
      expect(screen.getByLabelText(/受領見積書名/)).toBeInTheDocument();
      expect(screen.getByLabelText(/提出日/)).toBeInTheDocument();

      // ファイルアップロードエリア（テキスト/ファイル排他選択UIは廃止）
      expect(screen.getByText(/ファイルを選択/)).toBeInTheDocument();

      // 明細行エディタ（LineItemEditor）が表示される
      expect(screen.getByText(/名称/)).toBeInTheDocument();
      expect(screen.getByText(/規格/)).toBeInTheDocument();
      expect(screen.getByText(/単位/)).toBeInTheDocument();
      expect(screen.getByText(/数量/)).toBeInTheDocument();
      expect(screen.getByText(/単価/)).toBeInTheDocument();
      expect(screen.getByText(/金額/)).toBeInTheDocument();

      // ボタン
      expect(screen.getByRole('button', { name: /登録/ })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /キャンセル/ })).toBeInTheDocument();
    });

    it('テキスト/ファイル排他選択UIが表示されない（廃止）', () => {
      render(
        <ReceivedQuotationForm
          mode="create"
          estimateRequestId={estimateRequestId}
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
        />
      );

      // ラジオボタンは表示されない
      expect(screen.queryByRole('radio', { name: /テキスト/ })).not.toBeInTheDocument();
      expect(screen.queryByRole('radio', { name: /ファイル/ })).not.toBeInTheDocument();
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

      const today = new Date();
      const year = today.getFullYear();
      const month = String(today.getMonth() + 1).padStart(2, '0');
      const day = String(today.getDate()).padStart(2, '0');
      const expectedDate = `${year}-${month}-${day}`;

      expect(screen.getByLabelText(/提出日/)).toHaveValue(expectedDate);
    });

    it('フォーム初期表示時に1行の空明細行が表示される (11.14)', () => {
      render(
        <ReceivedQuotationForm
          mode="create"
          estimateRequestId={estimateRequestId}
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
        />
      );

      // LineItemEditorの最初の行が存在する
      const nameInputs = screen.getAllByPlaceholderText(/名称/);
      expect(nameInputs.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('ファイルアップロード (11.5, 11.6, 11.7, 11.8)', () => {
    it('ファイルをアップロードするとFileInlinePreviewが表示される', async () => {
      render(
        <ReceivedQuotationForm
          mode="create"
          estimateRequestId={estimateRequestId}
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
        />
      );

      const validFile = new File(['content'], 'test.pdf', { type: 'application/pdf' });
      const fileInput = screen.getByTestId('file-input') as HTMLInputElement;
      Object.defineProperty(fileInput, 'files', {
        value: [validFile],
        writable: false,
      });
      fireEvent.change(fileInput);

      // FileInlinePreviewが表示される
      expect(await screen.findByTestId('file-inline-preview')).toBeInTheDocument();
    });

    it('ファイルをアップロードするとOcrDataExtractorが表示される', async () => {
      render(
        <ReceivedQuotationForm
          mode="create"
          estimateRequestId={estimateRequestId}
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
        />
      );

      const validFile = new File(['content'], 'test.pdf', { type: 'application/pdf' });
      const fileInput = screen.getByTestId('file-input') as HTMLInputElement;
      Object.defineProperty(fileInput, 'files', {
        value: [validFile],
        writable: false,
      });
      fireEvent.change(fileInput);

      // OcrDataExtractorが表示される
      expect(await screen.findByTestId('ocr-data-extractor')).toBeInTheDocument();
    });

    it('許可されていないファイル形式の場合エラーが表示される', async () => {
      render(
        <ReceivedQuotationForm
          mode="create"
          estimateRequestId={estimateRequestId}
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
        />
      );

      const invalidFile = new File(['content'], 'test.txt', { type: 'text/plain' });
      const fileInput = screen.getByTestId('file-input') as HTMLInputElement;
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

    it('ドラッグ&ドロップでファイルを選択できる (11.6)', async () => {
      render(
        <ReceivedQuotationForm
          mode="create"
          estimateRequestId={estimateRequestId}
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
        />
      );

      const dropZone = screen.getByText(/ファイルを選択/).closest('div');
      expect(dropZone).toBeInTheDocument();

      const validFile = new File(['content'], 'dropped.pdf', { type: 'application/pdf' });
      const dataTransfer = {
        files: [validFile],
        items: [
          {
            kind: 'file',
            type: validFile.type,
            getAsFile: () => validFile,
          },
        ],
        types: ['Files'],
      };

      fireEvent.dragOver(dropZone!, { dataTransfer });
      fireEvent.drop(dropZone!, { dataTransfer });

      // ドロップしたファイルが処理されることを確認
      expect(await screen.findByTestId('file-inline-preview')).toBeInTheDocument();
    });
  });

  describe('バリデーション (11.22, 11.23, 11.24)', () => {
    it('受領見積書名が未入力の場合エラーが表示される', async () => {
      render(
        <ReceivedQuotationForm
          mode="create"
          estimateRequestId={estimateRequestId}
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
        />
      );

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

      const dateInput = screen.getByLabelText(/提出日/);
      fireEvent.change(dateInput, { target: { value: '' } });

      const submitButton = screen.getByRole('button', { name: /登録/ });
      await userEvent.click(submitButton);

      expect(await screen.findByText(/提出日を入力してください/)).toBeInTheDocument();
      expect(mockOnSubmit).not.toHaveBeenCalled();
    });

    it('ファイル未アップロード・全明細行空の場合エラーが表示される (11.24)', async () => {
      render(
        <ReceivedQuotationForm
          mode="create"
          estimateRequestId={estimateRequestId}
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
        />
      );

      // ファイルを選択しない、明細行も空のまま
      const submitButton = screen.getByRole('button', { name: /登録/ });
      await userEvent.click(submitButton);

      expect(
        await screen.findByText(/ファイルのアップロードまたは明細行データの入力が必要です/)
      ).toBeInTheDocument();
      expect(mockOnSubmit).not.toHaveBeenCalled();
    });

    it('ファイルのみアップロードされている場合は保存可能 (11.22)', async () => {
      mockOnSubmit.mockResolvedValueOnce(undefined);

      render(
        <ReceivedQuotationForm
          mode="create"
          estimateRequestId={estimateRequestId}
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
        />
      );

      // ファイルをアップロード
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
        expect(mockOnSubmit).toHaveBeenCalled();
      });
    });

    it('明細行データのみ入力されている場合は保存可能 (11.22)', async () => {
      mockOnSubmit.mockResolvedValueOnce(undefined);

      render(
        <ReceivedQuotationForm
          mode="create"
          estimateRequestId={estimateRequestId}
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
        />
      );

      // 明細行に名称を入力
      const nameInputs = screen.getAllByPlaceholderText(/名称/);
      await userEvent.type(nameInputs[0]!, 'テスト品目');

      const submitButton = screen.getByRole('button', { name: /登録/ });
      await userEvent.click(submitButton);

      await waitFor(() => {
        expect(mockOnSubmit).toHaveBeenCalled();
      });
    });

    it('ファイルと明細行の両方が入力されている場合は保存可能', async () => {
      mockOnSubmit.mockResolvedValueOnce(undefined);

      render(
        <ReceivedQuotationForm
          mode="create"
          estimateRequestId={estimateRequestId}
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
        />
      );

      // ファイルをアップロード
      const validFile = new File(['content'], 'test.pdf', { type: 'application/pdf' });
      const fileInput = screen.getByTestId('file-input') as HTMLInputElement;
      Object.defineProperty(fileInput, 'files', {
        value: [validFile],
        writable: false,
      });
      fireEvent.change(fileInput);

      // 明細行に名称を入力
      const nameInputs2 = screen.getAllByPlaceholderText(/名称/);
      await userEvent.type(nameInputs2[0]!, 'テスト品目');

      const submitButton = screen.getByRole('button', { name: /登録/ });
      await userEvent.click(submitButton);

      await waitFor(() => {
        expect(mockOnSubmit).toHaveBeenCalled();
      });
    });
  });

  describe('OCR一括取り込み', () => {
    it('OCR結果を一括取り込みすると明細行に反映される', async () => {
      render(
        <ReceivedQuotationForm
          mode="create"
          estimateRequestId={estimateRequestId}
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
        />
      );

      // ファイルをアップロード
      const validFile = new File(['content'], 'test.pdf', { type: 'application/pdf' });
      const fileInput = screen.getByTestId('file-input') as HTMLInputElement;
      Object.defineProperty(fileInput, 'files', {
        value: [validFile],
        writable: false,
      });
      fireEvent.change(fileInput);

      // OcrDataExtractorが表示される
      expect(await screen.findByTestId('ocr-data-extractor')).toBeInTheDocument();

      // モックの一括取り込みボタンをクリック
      const importButton = screen.getByTestId('mock-import-button');
      await userEvent.click(importButton);

      // 明細行にデータが反映される（名称フィールドに「テスト品目」が入力される）
      await waitFor(() => {
        const nameInputs = screen.getAllByPlaceholderText(/名称/) as HTMLInputElement[];
        expect(nameInputs.some((input) => input.value === 'テスト品目')).toBe(true);
      });
    });
  });

  describe('編集モード (11.25)', () => {
    it('編集モードで初期データが表示される', () => {
      const initialData = {
        id: 'rq-123',
        estimateRequestId,
        name: 'テスト見積書',
        submittedAt: new Date('2025-01-15'),
        fileName: 'existing.pdf',
        fileMimeType: 'application/pdf',
        fileSize: 1024,
        lineItems: [
          {
            id: 'li-1',
            receivedQuotationId: 'rq-123',
            sortOrder: 0,
            name: '既存品目',
            specification: '既存規格',
            unit: '個',
            quantity: 5,
            unitPrice: 2000,
            amount: 10000,
            remarks: null,
          },
        ],
        totalAmount: 10000,
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

      // 基本情報
      expect(screen.getByLabelText(/受領見積書名/)).toHaveValue('テスト見積書');

      // 既存ファイル名が表示される
      expect(screen.getByText('existing.pdf')).toBeInTheDocument();

      // 明細行のデータが表示される
      const nameInputs = screen.getAllByPlaceholderText(/名称/) as HTMLInputElement[];
      expect(nameInputs.some((input) => input.value === '既存品目')).toBe(true);

      // 更新ボタン
      expect(screen.getByRole('button', { name: /更新/ })).toBeInTheDocument();
    });
  });

  describe('フォーム送信', () => {
    it('送信データにファイルと明細行が含まれる', async () => {
      mockOnSubmit.mockResolvedValueOnce(undefined);

      render(
        <ReceivedQuotationForm
          mode="create"
          estimateRequestId={estimateRequestId}
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
        />
      );

      // ファイルをアップロード
      const validFile = new File(['content'], 'test.pdf', { type: 'application/pdf' });
      const fileInput = screen.getByTestId('file-input') as HTMLInputElement;
      Object.defineProperty(fileInput, 'files', {
        value: [validFile],
        writable: false,
      });
      fireEvent.change(fileInput);

      // 明細行に入力
      const nameInputs3 = screen.getAllByPlaceholderText(/名称/);
      await userEvent.type(nameInputs3[0]!, 'テスト品目');

      const quantityInputs = screen.getAllByPlaceholderText(/数量/);
      await userEvent.type(quantityInputs[0]!, '10');

      const unitPriceInputs = screen.getAllByPlaceholderText(/単価/);
      await userEvent.type(unitPriceInputs[0]!, '1000');

      const submitButton = screen.getByRole('button', { name: /登録/ });
      await userEvent.click(submitButton);

      await waitFor(() => {
        expect(mockOnSubmit).toHaveBeenCalledWith(
          expect.objectContaining({
            name: '見積書',
            file: expect.any(File),
            lineItems: expect.arrayContaining([
              expect.objectContaining({
                name: 'テスト品目',
              }),
            ]),
          })
        );
      });
    });

    it('送信中はボタンが無効化される', () => {
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
