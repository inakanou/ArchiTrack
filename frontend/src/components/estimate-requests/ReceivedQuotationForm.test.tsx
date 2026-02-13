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
  FileInlinePreview: ({
    file,
    existingPreviewUrl,
    fileMimeType,
  }: {
    file: File | null;
    existingPreviewUrl?: string;
    fileMimeType?: string;
  }) =>
    file ? (
      <div data-testid="file-inline-preview">{file.name} のプレビュー</div>
    ) : existingPreviewUrl ? (
      <div
        data-testid="file-inline-preview"
        data-preview-url={existingPreviewUrl}
        data-mime-type={fileMimeType}
      >
        既存ファイルのプレビュー
      </div>
    ) : null,
  default: ({
    file,
    existingPreviewUrl,
    fileMimeType,
  }: {
    file: File | null;
    existingPreviewUrl?: string;
    fileMimeType?: string;
  }) =>
    file ? (
      <div data-testid="file-inline-preview">{file.name} のプレビュー</div>
    ) : existingPreviewUrl ? (
      <div
        data-testid="file-inline-preview"
        data-preview-url={existingPreviewUrl}
        data-mime-type={fileMimeType}
      >
        既存ファイルのプレビュー
      </div>
    ) : null,
}));

vi.mock('./OcrDataExtractor', () => ({
  OcrDataExtractor: ({
    file,
    fileUrl,
    fileMimeType,
    autoStart,
    onImportLineItems,
  }: {
    file: File | null;
    fileUrl?: string | null;
    fileMimeType?: string | null;
    autoStart?: boolean;
    onImportLineItems: (items: unknown[]) => void;
  }) => {
    const shouldRender = file || fileUrl;
    if (!shouldRender) return null;
    return (
      <div
        data-testid="ocr-data-extractor"
        data-file-url={fileUrl ?? undefined}
        data-file-mime-type={fileMimeType ?? undefined}
        data-auto-start={String(autoStart ?? true)}
      >
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
    );
  },
  default: ({
    file,
    fileUrl,
    fileMimeType,
    autoStart,
    onImportLineItems,
  }: {
    file: File | null;
    fileUrl?: string | null;
    fileMimeType?: string | null;
    autoStart?: boolean;
    onImportLineItems: (items: unknown[]) => void;
  }) => {
    const shouldRender = file || fileUrl;
    if (!shouldRender) return null;
    return (
      <div
        data-testid="ocr-data-extractor"
        data-file-url={fileUrl ?? undefined}
        data-file-mime-type={fileMimeType ?? undefined}
        data-auto-start={String(autoStart ?? true)}
      >
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
    );
  },
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
            customCategory: null,
            workType: null,
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

  // ==========================================================================
  // Task 36.3: 一括転記機能のテスト (Requirements: 15.1-15.11)
  // ==========================================================================
  describe('一括転記機能 (Task 36.3)', () => {
    const mockSelectedItems = [
      {
        customCategory: '躯体工事',
        workType: '鉄筋工事',
        name: '鉄筋D10',
        specification: 'SD295A',
        unit: 'kg',
        quantity: 1500,
        remarks: '基礎部分',
      },
      {
        customCategory: '躯体工事',
        workType: 'コンクリート工事',
        name: 'コンクリート',
        specification: '21-8-20',
        unit: 'm3',
        quantity: 50,
        remarks: '',
      },
    ];

    it('selectedItemsが提供されている場合、「項目選択から転記」ボタンが表示される (Requirements: 15.1)', () => {
      render(
        <ReceivedQuotationForm
          mode="create"
          estimateRequestId={estimateRequestId}
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
          selectedItems={mockSelectedItems}
        />
      );

      expect(screen.getByRole('button', { name: /項目選択から転記/ })).toBeInTheDocument();
    });

    it('selectedItemsが提供されていない場合、転記ボタンが表示されない', () => {
      render(
        <ReceivedQuotationForm
          mode="create"
          estimateRequestId={estimateRequestId}
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
        />
      );

      expect(screen.queryByRole('button', { name: /項目選択から転記/ })).not.toBeInTheDocument();
    });

    it('選択済み項目が0件の場合、エラーメッセージを表示する (Requirements: 15.4)', async () => {
      render(
        <ReceivedQuotationForm
          mode="create"
          estimateRequestId={estimateRequestId}
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
          selectedItems={[]}
        />
      );

      const transcribeButton = screen.getByRole('button', { name: /項目選択から転記/ });
      await userEvent.click(transcribeButton);

      await waitFor(() => {
        expect(screen.getByText(/選択された項目がありません/)).toBeInTheDocument();
      });
    });

    it('転記実行後に明細行データが反映される (Requirements: 15.6, 15.7)', async () => {
      render(
        <ReceivedQuotationForm
          mode="create"
          estimateRequestId={estimateRequestId}
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
          selectedItems={mockSelectedItems}
        />
      );

      const transcribeButton = screen.getByRole('button', { name: /項目選択から転記/ });
      await userEvent.click(transcribeButton);

      // 転記データが明細行に反映される
      await waitFor(() => {
        const nameInputs = screen.getAllByPlaceholderText(/名称/) as HTMLInputElement[];
        expect(nameInputs.some((input) => input.value === '鉄筋D10')).toBe(true);
      });
    });

    it('転記時に単価フィールドが空欄になる (Requirements: 15.8)', async () => {
      render(
        <ReceivedQuotationForm
          mode="create"
          estimateRequestId={estimateRequestId}
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
          selectedItems={mockSelectedItems}
        />
      );

      const transcribeButton = screen.getByRole('button', { name: /項目選択から転記/ });
      await userEvent.click(transcribeButton);

      // 単価が空であることを確認
      await waitFor(() => {
        const unitPriceInputs = screen.getAllByPlaceholderText(/単価/) as HTMLInputElement[];
        unitPriceInputs.forEach((input) => {
          expect(input.value).toBe('');
        });
      });
    });

    it('転記完了メッセージが表示される (Requirements: 15.9)', async () => {
      render(
        <ReceivedQuotationForm
          mode="create"
          estimateRequestId={estimateRequestId}
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
          selectedItems={mockSelectedItems}
        />
      );

      const transcribeButton = screen.getByRole('button', { name: /項目選択から転記/ });
      await userEvent.click(transcribeButton);

      await waitFor(() => {
        expect(screen.getByText(/2件.*転記/)).toBeInTheDocument();
      });
    });

    it('既存明細行がある場合、確認ダイアログを表示する (Requirements: 15.5)', async () => {
      /* test code below */
      const initialDataWithLineItems = {
        id: 'rq-existing',
        estimateRequestId,
        name: '既存見積書',
        submittedAt: new Date('2025-01-15'),
        fileName: null,
        fileMimeType: null,
        fileSize: null,
        lineItems: [
          {
            id: 'li-existing',
            receivedQuotationId: 'rq-existing',
            sortOrder: 0,
            customCategory: null,
            workType: null,
            name: '既存データ',
            specification: null,
            unit: '式',
            quantity: 1,
            unitPrice: 10000,
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
          initialData={initialDataWithLineItems}
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
          selectedItems={mockSelectedItems}
        />
      );

      // 転記ボタンをクリック
      const transcribeButton = screen.getByRole('button', { name: /項目選択から転記/ });
      await userEvent.click(transcribeButton);

      // 確認ダイアログが表示される
      await waitFor(() => {
        expect(screen.getByText('明細行の上書き確認')).toBeInTheDocument();
      });
    });
    // --------------------------------------------------------------------------
    // Task 43.4: 項目選択一括転記時の数量フォーマット適用テスト (18.11)
    // --------------------------------------------------------------------------

    it('転記後の数量が小数2桁表示であること (Requirements: 18.11)', async () => {
      const selectedItemsWithDecimal = [
        {
          customCategory: '躯体工事',
          workType: '鉄筋工事',
          name: '鉄筋D10',
          specification: 'SD295A',
          unit: 'kg',
          quantity: 1500,
          remarks: '基礎部分',
        },
        {
          customCategory: '躯体工事',
          workType: 'コンクリート工事',
          name: 'コンクリート',
          specification: '21-8-20',
          unit: 'm3',
          quantity: 2.5,
          remarks: '',
        },
      ];

      render(
        <ReceivedQuotationForm
          mode="create"
          estimateRequestId={estimateRequestId}
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
          selectedItems={selectedItemsWithDecimal}
        />
      );

      const transcribeButton = screen.getByRole('button', { name: /項目選択から転記/ });
      await userEvent.click(transcribeButton);

      // 転記完了を待機
      await waitFor(() => {
        expect(screen.getByText(/2件.*転記/)).toBeInTheDocument();
      });

      // 数量フィールドを取得
      const quantityInputs = screen.getAllByLabelText(/数量/);
      // 1500 -> '1500.00'
      expect(quantityInputs[0]).toHaveValue('1500.00');
      // 2.5 -> '2.50'
      expect(quantityInputs[1]).toHaveValue('2.50');
    });
  });

  // ==========================================================================
  // Task 43.5: 編集画面の既存データ読み込み時のフォーマット適用テスト (42.7)
  //
  // Requirements:
  // - 18.1, 18.2: 数量を小数2桁常時表示
  // - 18.3, 18.4: 単価を整数表示（小数第1位で四捨五入）
  // - 18.5, 18.6: 金額を整数表示
  // ==========================================================================

  describe('編集画面の既存データ数値フォーマット (Task 42.7 / 43.5)', () => {
    it('編集画面で既存データの数量が小数2桁表示、単価が整数表示であること', () => {
      const initialDataWithDecimals = {
        id: 'rq-format-test',
        estimateRequestId,
        name: 'フォーマットテスト見積書',
        submittedAt: new Date('2025-01-15'),
        fileName: null,
        fileMimeType: null,
        fileSize: null,
        lineItems: [
          {
            id: 'li-fmt-1',
            receivedQuotationId: 'rq-format-test',
            sortOrder: 0,
            customCategory: null,
            workType: null,
            name: 'テスト品目A',
            specification: null,
            unit: '個',
            quantity: 5,
            unitPrice: 2000,
            amount: 10000,
            remarks: null,
          },
          {
            id: 'li-fmt-2',
            receivedQuotationId: 'rq-format-test',
            sortOrder: 1,
            customCategory: null,
            workType: null,
            name: 'テスト品目B',
            specification: null,
            unit: 'm',
            quantity: 2.5,
            unitPrice: 1234.6,
            amount: 3087,
            remarks: null,
          },
        ],
        totalAmount: 13087,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      render(
        <ReceivedQuotationForm
          mode="edit"
          estimateRequestId={estimateRequestId}
          initialData={initialDataWithDecimals}
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
        />
      );

      // 数量フィールド: 整数5 -> '5.00', 小数2.5 -> '2.50'
      const quantityInputs = screen.getAllByLabelText(/数量/);
      expect(quantityInputs[0]).toHaveValue('5.00');
      expect(quantityInputs[1]).toHaveValue('2.50');

      // 単価フィールド: 整数2000 -> '2000', 小数1234.6 -> '1235'
      const unitPriceInputs = screen.getAllByLabelText(/単価/);
      expect(unitPriceInputs[0]).toHaveValue('2000');
      expect(unitPriceInputs[1]).toHaveValue('1235');
    });

    it('編集画面で既存データの金額が整数表示であること', () => {
      const initialDataWithDecimalAmount = {
        id: 'rq-amount-test',
        estimateRequestId,
        name: '金額フォーマットテスト',
        submittedAt: new Date('2025-01-15'),
        fileName: null,
        fileMimeType: null,
        fileSize: null,
        lineItems: [
          {
            id: 'li-amt-1',
            receivedQuotationId: 'rq-amount-test',
            sortOrder: 0,
            customCategory: null,
            workType: null,
            name: '金額テスト品目',
            specification: null,
            unit: '式',
            quantity: 3,
            unitPrice: 1500,
            amount: 4500,
            remarks: null,
          },
        ],
        totalAmount: 4500,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      render(
        <ReceivedQuotationForm
          mode="edit"
          estimateRequestId={estimateRequestId}
          initialData={initialDataWithDecimalAmount}
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
        />
      );

      // 数量が小数2桁表示: 3 -> '3.00'
      const quantityInputs = screen.getAllByLabelText(/数量/);
      expect(quantityInputs[0]).toHaveValue('3.00');

      // 単価が整数表示: 1500 -> '1500'
      const unitPriceInputs = screen.getAllByLabelText(/単価/);
      expect(unitPriceInputs[0]).toHaveValue('1500');

      // 金額が整数で表示されること（小数点を含まない）
      const amountDisplays = screen.getAllByText('4,500');
      expect(amountDisplays.length).toBeGreaterThanOrEqual(1);
      amountDisplays.forEach((el) => {
        expect(el.textContent).not.toContain('.');
      });
    });
  });

  // ==========================================================================
  // Task 39.2: ReceivedQuotationFormの改訂テスト（OCR再実行対応）
  //
  // Requirements:
  // - 16.1: 編集画面でPDF/画像の場合に「OCR実行」ボタンを表示
  // - 16.2: ボタンクリックで既存ファイルに対してOCR処理を開始
  // - 16.9: OCR失敗時もファイルアップロードのみで保存可能
  // - 16.12: 編集画面での既存ファイルプレビュー表示
  // ==========================================================================

  describe('編集画面OCR/プレビュー対応 (Task 39.2)', () => {
    const initialDataWithFile = {
      id: 'rq-existing',
      estimateRequestId: 'er-123',
      name: 'テスト見積書',
      submittedAt: new Date('2025-01-15'),
      fileName: 'existing.pdf',
      fileMimeType: 'application/pdf',
      fileSize: 1024,
      lineItems: [] as {
        id: string;
        receivedQuotationId: string;
        sortOrder: number;
        customCategory: string | null;
        workType: string | null;
        name: string;
        specification: string | null;
        unit: string | null;
        quantity: number | null;
        unitPrice: number | null;
        amount: number | null;
        remarks: string | null;
      }[],
      totalAmount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('編集画面で既存ファイルがある場合にOcrDataExtractorが表示される (16.1)', () => {
      render(
        <ReceivedQuotationForm
          mode="edit"
          estimateRequestId={estimateRequestId}
          initialData={initialDataWithFile}
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
          existingFilePreviewUrl="https://example.com/preview.pdf"
        />
      );

      expect(screen.getByTestId('ocr-data-extractor')).toBeInTheDocument();
    });

    it('existingFilePreviewUrlがOcrDataExtractorのfileUrlに渡される (16.2)', () => {
      render(
        <ReceivedQuotationForm
          mode="edit"
          estimateRequestId={estimateRequestId}
          initialData={initialDataWithFile}
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
          existingFilePreviewUrl="https://example.com/preview.pdf"
        />
      );

      const ocrExtractor = screen.getByTestId('ocr-data-extractor');
      expect(ocrExtractor.getAttribute('data-file-url')).toBe('https://example.com/preview.pdf');
    });

    it('編集画面の既存ファイルでautoStart=falseがOcrDataExtractorに渡される (16.1)', () => {
      render(
        <ReceivedQuotationForm
          mode="edit"
          estimateRequestId={estimateRequestId}
          initialData={initialDataWithFile}
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
          existingFilePreviewUrl="https://example.com/preview.pdf"
        />
      );

      const ocrExtractor = screen.getByTestId('ocr-data-extractor');
      expect(ocrExtractor.getAttribute('data-auto-start')).toBe('false');
    });

    it('新規アップロード時は従来通りautoStart=trueで動作する', async () => {
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

      const ocrExtractor = await screen.findByTestId('ocr-data-extractor');
      // 新規アップロード時はautoStartがtrue（デフォルト）
      expect(ocrExtractor.getAttribute('data-auto-start')).toBe('true');
    });

    it('編集画面で既存ファイルがある場合にFileInlinePreviewが表示される (16.12)', () => {
      render(
        <ReceivedQuotationForm
          mode="edit"
          estimateRequestId={estimateRequestId}
          initialData={initialDataWithFile}
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
          existingFilePreviewUrl="https://example.com/preview.pdf"
        />
      );

      const preview = screen.getByTestId('file-inline-preview');
      expect(preview).toBeInTheDocument();
      expect(preview.getAttribute('data-preview-url')).toBe('https://example.com/preview.pdf');
    });

    it('existingFilePreviewUrlがnullの場合はOcrDataExtractorが表示されない', () => {
      render(
        <ReceivedQuotationForm
          mode="edit"
          estimateRequestId={estimateRequestId}
          initialData={initialDataWithFile}
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
          existingFilePreviewUrl={null}
        />
      );

      expect(screen.queryByTestId('ocr-data-extractor')).not.toBeInTheDocument();
    });

    it('ファイル削除後は既存ファイルのOcrDataExtractor/Previewが非表示になる', async () => {
      render(
        <ReceivedQuotationForm
          mode="edit"
          estimateRequestId={estimateRequestId}
          initialData={initialDataWithFile}
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
          existingFilePreviewUrl="https://example.com/preview.pdf"
        />
      );

      // 既存ファイルのOcrDataExtractorが表示されている
      expect(screen.getByTestId('ocr-data-extractor')).toBeInTheDocument();

      // ファイル名の横にある削除ボタンをクリック
      const fileNameElement = screen.getByText('existing.pdf');
      // ファイル情報のコンテナを上にたどり、同一コンテナ内の削除ボタンを探す
      const fileContainer = fileNameElement.closest('div')!.parentElement!.parentElement!;
      const removeButton = fileContainer.querySelector('button')!;
      expect(removeButton.textContent).toBe('削除');
      await userEvent.click(removeButton);

      // OcrDataExtractorが非表示になる
      expect(screen.queryByTestId('ocr-data-extractor')).not.toBeInTheDocument();
    });
  });
});
