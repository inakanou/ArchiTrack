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

// Task 79.3: ReceivedQuotationForm が useAuth() を直接購読するため、
// AuthProvider を含まない単体テスト環境向けに最小限のモックを提供する。
// Task 81.3: テスト毎に sessionExpiredDuringOperation / sessionExpired を切替えるため、
// 可変オブジェクトを参照する形に拡張する（既存テストはデフォルト値=false で同等挙動を維持）。
const mockAuthState = {
  sessionExpiredDuringOperation: false,
  sessionExpired: false,
};
vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({
    sessionExpiredDuringOperation: mockAuthState.sessionExpiredDuringOperation,
    sessionExpired: mockAuthState.sessionExpired,
  }),
}));

import { ReceivedQuotationForm } from './ReceivedQuotationForm';
// Task 81.3: 401/409 系のリトライ・楽観的競合フローテストで ApiError をスローするため import
import { ApiError } from '../../api/client';

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
                sortOrder: 0,
                customCategory: '',
                workType: '',
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
                sortOrder: 0,
                customCategory: '',
                workType: '',
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
    // Task 81.3: 各テスト毎に mockAuthState をデフォルト（未認証エラー無し）に戻す
    mockAuthState.sessionExpiredDuringOperation = false;
    mockAuthState.sessionExpired = false;
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
      expect(screen.getByText(/^金額$/)).toBeInTheDocument();

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
        netAmount: null,
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
        netAmount: null,
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
  // Task 63.1: ReceivedQuotationFormにNET金額入力フィールドを追加
  // ==========================================================================

  describe('NET金額フィールド (Task 63.1)', () => {
    it('NET金額入力フィールドが明細行テーブルの下に表示される', () => {
      render(
        <ReceivedQuotationForm
          mode="create"
          estimateRequestId={estimateRequestId}
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
        />
      );

      const netAmountInput = screen.getByLabelText('NET金額');
      expect(netAmountInput).toBeInTheDocument();
    });

    it('NET金額フィールドに値を入力できる', async () => {
      render(
        <ReceivedQuotationForm
          mode="create"
          estimateRequestId={estimateRequestId}
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
        />
      );

      const netAmountInput = screen.getByLabelText('NET金額');
      await userEvent.type(netAmountInput, '50000');
      expect(netAmountInput).toHaveValue('50000');
    });

    it('NET金額フィールドのフォーカスアウト時に整数フォーマットが適用される', async () => {
      render(
        <ReceivedQuotationForm
          mode="create"
          estimateRequestId={estimateRequestId}
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
        />
      );

      const netAmountInput = screen.getByLabelText('NET金額');
      await userEvent.type(netAmountInput, '12345.6');
      fireEvent.blur(netAmountInput);

      expect(netAmountInput).toHaveValue('12346');
    });

    it('NET金額フィールドのデフォルト値が空文字列である', () => {
      render(
        <ReceivedQuotationForm
          mode="create"
          estimateRequestId={estimateRequestId}
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
        />
      );

      const netAmountInput = screen.getByLabelText('NET金額');
      expect(netAmountInput).toHaveValue('');
    });
  });

  // ==========================================================================
  // Task 63.2: submit処理でnetAmountを送信
  // ==========================================================================

  describe('NET金額submit処理 (Task 63.2)', () => {
    it('NET金額入力時にsubmitデータにnetAmountが含まれる', async () => {
      mockOnSubmit.mockResolvedValueOnce(undefined);

      render(
        <ReceivedQuotationForm
          mode="create"
          estimateRequestId={estimateRequestId}
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
        />
      );

      // 明細行に名称を入力（バリデーション通過のため）
      const nameInputs = screen.getAllByPlaceholderText(/名称/);
      await userEvent.type(nameInputs[0]!, 'テスト品目');

      // NET金額を入力
      const netAmountInput = screen.getByLabelText('NET金額');
      await userEvent.type(netAmountInput, '50000');

      const submitButton = screen.getByRole('button', { name: /登録/ });
      await userEvent.click(submitButton);

      await waitFor(() => {
        expect(mockOnSubmit).toHaveBeenCalledWith(
          expect.objectContaining({
            netAmount: 50000,
          })
        );
      });
    });

    it('NET金額が空文字列の場合はnullが送信される', async () => {
      mockOnSubmit.mockResolvedValueOnce(undefined);

      render(
        <ReceivedQuotationForm
          mode="create"
          estimateRequestId={estimateRequestId}
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
        />
      );

      // ファイルをアップロード（バリデーション通過のため）
      const validFile = new File(['content'], 'test.pdf', { type: 'application/pdf' });
      const fileInput = screen.getByTestId('file-input') as HTMLInputElement;
      Object.defineProperty(fileInput, 'files', {
        value: [validFile],
        writable: false,
      });
      fireEvent.change(fileInput);

      // NET金額は入力しない
      const submitButton = screen.getByRole('button', { name: /登録/ });
      await userEvent.click(submitButton);

      await waitFor(() => {
        expect(mockOnSubmit).toHaveBeenCalledWith(
          expect.objectContaining({
            netAmount: null,
          })
        );
      });
    });
  });

  // ==========================================================================
  // Task 63.3: 編集画面で既存netAmountデータを表示
  // ==========================================================================

  describe('NET金額編集画面表示 (Task 63.3)', () => {
    it('編集画面で既存netAmountデータがフォーマットされて表示される', () => {
      const initialData = {
        id: 'rq-net-test',
        estimateRequestId,
        name: 'NETテスト見積書',
        submittedAt: new Date('2025-01-15'),
        fileName: null,
        fileMimeType: null,
        fileSize: null,
        lineItems: [
          {
            id: 'li-net-1',
            receivedQuotationId: 'rq-net-test',
            sortOrder: 0,
            customCategory: null,
            workType: null,
            name: 'テスト品目',
            specification: null,
            unit: '式',
            quantity: 1,
            unitPrice: 10000,
            amount: 10000,
            remarks: null,
          },
        ],
        totalAmount: 10000,
        netAmount: 8500,
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

      const netAmountInput = screen.getByLabelText('NET金額');
      expect(netAmountInput).toHaveValue('8500');
    });

    it('編集画面で既存netAmountがnullの場合は空欄で表示される', () => {
      const initialData = {
        id: 'rq-net-null',
        estimateRequestId,
        name: 'NETなし見積書',
        submittedAt: new Date('2025-01-15'),
        fileName: null,
        fileMimeType: null,
        fileSize: null,
        lineItems: [
          {
            id: 'li-net-null',
            receivedQuotationId: 'rq-net-null',
            sortOrder: 0,
            customCategory: null,
            workType: null,
            name: 'テスト品目',
            specification: null,
            unit: '式',
            quantity: 1,
            unitPrice: 10000,
            amount: 10000,
            remarks: null,
          },
        ],
        totalAmount: 10000,
        netAmount: null,
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

      const netAmountInput = screen.getByLabelText('NET金額');
      expect(netAmountInput).toHaveValue('');
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
        netAmount: null,
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
        netAmount: null,
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
      netAmount: null as number | null,
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

    // ================================================================
    // Task 65.3: ReceivedQuotationFormのNET金額テスト（受領見積書レベル）
    // Requirements: 28.1, 28.2, 28.3, 28.6, 28.8, 28.9, 28.10, 28.11
    // ================================================================
    // NOTE: 基本的なNET金額テストはTask 63.1-63.3で実装済み。
    // Task 65.3では受領見積書レベルでのNET金額配置の観点を追加テスト。

    it('NET金額フィールドが明細行テーブル（LineItemEditor）の外に配置されていること (Task 65.3, Requirements: 28.3)', () => {
      render(
        <ReceivedQuotationForm
          mode="create"
          estimateRequestId={estimateRequestId}
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
        />
      );

      // NET金額は明細行テーブル（table要素）の外に配置されるべき
      const netAmountInput = screen.getByLabelText('NET金額');
      expect(netAmountInput).toBeInTheDocument();

      // NET金額入力フィールドの最も近いtable祖先がないことを確認
      // (LineItemEditor内のテーブルに含まれていないこと)
      const closestTable = netAmountInput.closest('table');
      expect(closestTable).toBeNull();
    });

    it('NET金額は受領見積書フォームレベルで1つだけ存在すること (Task 65.3, Requirements: 28.1)', () => {
      render(
        <ReceivedQuotationForm
          mode="create"
          estimateRequestId={estimateRequestId}
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
        />
      );

      // NET金額のaria-labelを持つ入力フィールドが正確に1つだけ存在すること
      const netAmountInputs = screen.getAllByLabelText('NET金額');
      expect(netAmountInputs).toHaveLength(1);
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

  // ==========================================================================
  // Task 73.3: NET金額自動入力のユニットテスト (Requirements: 34.1-34.7)
  // ==========================================================================
  describe('NET金額自動入力 (Task 73.3)', () => {
    it('OCR一括取り込み時にNET金額欄が空の場合に合計金額が自動入力される (Requirements: 34.1, 34.2)', async () => {
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

      // OcrDataExtractorが表示されるのを待つ
      await waitFor(() => {
        expect(screen.getByTestId('ocr-data-extractor')).toBeInTheDocument();
      });

      // NET金額欄が空であることを確認
      const netAmountInput = screen.getByLabelText('NET金額') as HTMLInputElement;
      expect(netAmountInput.value).toBe('');

      // OCRインポートボタンをクリック（mock: amount=10000の1件を取り込み）
      const importButton = screen.getByTestId('mock-import-button');
      await userEvent.click(importButton);

      // NET金額欄に合計金額（10000）が自動入力される
      await waitFor(() => {
        expect(netAmountInput.value).toBe('10000');
      });
    });

    it('NET金額欄に既存値がある場合はOCR一括取り込みで変更されない (Requirements: 34.3)', async () => {
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

      // OcrDataExtractorが表示されるのを待つ
      await waitFor(() => {
        expect(screen.getByTestId('ocr-data-extractor')).toBeInTheDocument();
      });

      // NET金額欄に既存値を入力
      const netAmountInput = screen.getByLabelText('NET金額') as HTMLInputElement;
      await userEvent.type(netAmountInput, '50000');
      expect(netAmountInput.value).toBe('50000');

      // OCRインポートボタンをクリック
      const importButton = screen.getByTestId('mock-import-button');
      await userEvent.click(importButton);

      // NET金額欄の値が変更されないことを確認
      expect(netAmountInput.value).toBe('50000');
    });

    it('自動入力されたNET金額が整数フォーマットである (Requirements: 34.4, 34.5)', async () => {
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

      await waitFor(() => {
        expect(screen.getByTestId('ocr-data-extractor')).toBeInTheDocument();
      });

      // OCRインポートボタンをクリック
      const importButton = screen.getByTestId('mock-import-button');
      await userEvent.click(importButton);

      // NET金額が整数フォーマットで入力されている（小数なし）
      const netAmountInput = screen.getByLabelText('NET金額') as HTMLInputElement;
      await waitFor(() => {
        expect(netAmountInput.value).toBe('10000');
      });
      // 小数点が含まれていないことを確認
      expect(netAmountInput.value).not.toContain('.');
    });

    it('項目選択転記時にNET金額自動入力が動作する（合計が0の場合は自動入力されない）(Requirements: 34.6)', async () => {
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
      ];

      render(
        <ReceivedQuotationForm
          mode="create"
          estimateRequestId={estimateRequestId}
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
          selectedItems={mockSelectedItems}
        />
      );

      // NET金額欄が空であることを確認
      const netAmountInput = screen.getByLabelText('NET金額') as HTMLInputElement;
      expect(netAmountInput.value).toBe('');

      // 転記ボタンをクリック（転記時は単価が空欄、amountはnull → 合計金額は0）
      const transcribeButton = screen.getByRole('button', { name: /項目選択から転記/ });
      await userEvent.click(transcribeButton);

      // 転記完了を待機
      await waitFor(() => {
        expect(screen.getByText(/1件.*転記/)).toBeInTheDocument();
      });

      // 合計金額が0のため、NET金額は自動入力されない
      expect(netAmountInput.value).toBe('');
    });

    it('自動入力後にNET金額フィールドが編集可能である (Requirements: 34.7)', async () => {
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

      await waitFor(() => {
        expect(screen.getByTestId('ocr-data-extractor')).toBeInTheDocument();
      });

      // OCRインポートボタンをクリック
      const importButton = screen.getByTestId('mock-import-button');
      await userEvent.click(importButton);

      // NET金額が自動入力されるのを待つ
      const netAmountInput = screen.getByLabelText('NET金額') as HTMLInputElement;
      await waitFor(() => {
        expect(netAmountInput.value).toBe('10000');
      });

      // 自動入力後も編集可能であることを確認（disabled属性がない）
      expect(netAmountInput).not.toBeDisabled();

      // 手動で値を変更できることを確認
      await userEvent.clear(netAmountInput);
      await userEvent.type(netAmountInput, '25000');
      expect(netAmountInput.value).toBe('25000');
    });
  });

  // ==========================================================================
  // Task 81.3: セッション保護・未保存変更ガード・並び順送信のロックインテスト
  //
  // Requirements:
  // - 36.13: ダイアログ高さの上限制約維持（本テストでは UI 操作経路のみ確認、
  //           リサイズ機能自体は FileInlinePreview のテストでカバー）
  // - 37.13: 保存時に lineItems の sortOrder を index ベース 0,1,2,... で送信
  // - 37.14: 一括取り込み・項目選択転記時に reassignSortOrder を適用
  // - 38.1, 38.4, 38.5, 38.6, 38.7, 38.10, 38.12, 38.13:
  //   セッション切れ時の編集状態保護・自動リトライ・楽観的競合・未保存変更ガード
  // ==========================================================================
  describe('Task 81.3: セッション保護・未保存変更ガード・並び順送信', () => {
    /**
     * 編集モード用の初期データ（sortOrder 非連続）
     */
    const initialDataWithGappedSortOrders = {
      id: 'rq-sort',
      estimateRequestId,
      name: 'ソート順テスト',
      submittedAt: new Date('2026-04-01'),
      fileName: null as string | null,
      fileMimeType: null as string | null,
      fileSize: null as number | null,
      lineItems: [
        {
          id: 'li-a',
          receivedQuotationId: 'rq-sort',
          sortOrder: 0,
          customCategory: null,
          workType: null,
          name: 'A',
          specification: null,
          unit: '個',
          quantity: 1,
          unitPrice: 100,
          amount: 100,
          remarks: null,
        },
        {
          id: 'li-b',
          receivedQuotationId: 'rq-sort',
          sortOrder: 5,
          customCategory: null,
          workType: null,
          name: 'B',
          specification: null,
          unit: '個',
          quantity: 2,
          unitPrice: 200,
          amount: 400,
          remarks: null,
        },
        {
          id: 'li-c',
          receivedQuotationId: 'rq-sort',
          sortOrder: 100,
          customCategory: null,
          workType: null,
          name: 'C',
          specification: null,
          unit: '個',
          quantity: 3,
          unitPrice: 300,
          amount: 900,
          remarks: null,
        },
      ],
      totalAmount: 1400,
      netAmount: null as number | null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // ------------------------------------------------------------------------
    // (1) 保存時の sortOrder index ベース連続採番 (Requirements: 37.13)
    // ------------------------------------------------------------------------
    it('保存時に lineItems の sortOrder が index ベース 0,1,2,... で送信される (Requirements: 37.13)', async () => {
      mockOnSubmit.mockResolvedValueOnce(undefined);

      render(
        <ReceivedQuotationForm
          mode="edit"
          estimateRequestId={estimateRequestId}
          initialData={initialDataWithGappedSortOrders}
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
        />
      );

      const submitButton = screen.getByRole('button', { name: /更新/ });
      await userEvent.click(submitButton);

      await waitFor(() => {
        expect(mockOnSubmit).toHaveBeenCalled();
      });

      const submittedData = mockOnSubmit.mock.calls[0]![0] as {
        lineItems: { name: string; sortOrder: number }[];
      };
      expect(submittedData.lineItems).toBeDefined();
      // 送信時は index ベースで 0,1,2,... に再採番される
      const sortOrders = submittedData.lineItems.map((it) => it.sortOrder);
      expect(sortOrders).toEqual([0, 1, 2]);
      // 表示順 = 入力順 = sortOrder 順 を担保
      const names = submittedData.lineItems.map((it) => it.name);
      expect(names).toEqual(['A', 'B', 'C']);
    });

    // ------------------------------------------------------------------------
    // (2) 401 受信時に pendingSaveOperation を維持し、再認証成功で自動再実行
    //     (Requirements: 38.1, 38.6)
    // ------------------------------------------------------------------------
    it('401 受信時に保存状態を維持し、再認証成功時に保存処理が自動再実行される (Requirements: 38.1, 38.6)', async () => {
      // 1回目: 401 で reject, 2回目: 成功
      mockOnSubmit
        .mockRejectedValueOnce(new ApiError(401, 'Unauthorized'))
        .mockResolvedValueOnce(undefined);

      const { rerender } = render(
        <ReceivedQuotationForm
          mode="create"
          estimateRequestId={estimateRequestId}
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
        />
      );

      // 明細行に最低1行のデータを入力（バリデーション通過）
      const nameInputs = screen.getAllByPlaceholderText(/名称/);
      await userEvent.type(nameInputs[0]!, 'リトライ品目');

      // 1 回目の保存（401）
      const submitButton = screen.getByRole('button', { name: /登録/ });
      await userEvent.click(submitButton);

      await waitFor(() => {
        expect(mockOnSubmit).toHaveBeenCalledTimes(1);
      });

      // 楽観的競合エラーは表示されない（401 は別系統）
      expect(screen.queryByTestId('optimistic-conflict-error')).not.toBeInTheDocument();
      // 一般保存エラーも表示されない（401 はグローバルモーダル側で処理）
      expect(screen.queryByTestId('save-error')).not.toBeInTheDocument();

      // 再認証中フラグ ON
      mockAuthState.sessionExpiredDuringOperation = true;
      rerender(
        <ReceivedQuotationForm
          mode="create"
          estimateRequestId={estimateRequestId}
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
        />
      );

      // 再認証成功（true → false 遷移、sessionExpired は false のまま）
      mockAuthState.sessionExpiredDuringOperation = false;
      mockAuthState.sessionExpired = false;
      rerender(
        <ReceivedQuotationForm
          mode="create"
          estimateRequestId={estimateRequestId}
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
        />
      );

      // pending save が自動再実行され、onSubmit が 2 回目に呼ばれる
      await waitFor(() => {
        expect(mockOnSubmit).toHaveBeenCalledTimes(2);
      });
    });

    // ------------------------------------------------------------------------
    // (3) 409 競合時の楽観的排他制御エラーフロー（再認証フローと独立）
    //     (Requirements: 38.10)
    // ------------------------------------------------------------------------
    it('409 競合時に optimistic-conflict-error が表示され、再認証リトライは発火しない (Requirements: 38.10)', async () => {
      mockOnSubmit.mockRejectedValueOnce(new ApiError(409, 'Conflict'));

      const { rerender } = render(
        <ReceivedQuotationForm
          mode="create"
          estimateRequestId={estimateRequestId}
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
        />
      );

      const nameInputs = screen.getAllByPlaceholderText(/名称/);
      await userEvent.type(nameInputs[0]!, '競合品目');

      const submitButton = screen.getByRole('button', { name: /登録/ });
      await userEvent.click(submitButton);

      // 楽観的排他制御エラー表示（Req 38.10）
      expect(await screen.findByTestId('optimistic-conflict-error')).toBeInTheDocument();

      const callCountAfter409 = mockOnSubmit.mock.calls.length;
      expect(callCountAfter409).toBe(1);

      // 再認証中→成功遷移を発生させても、409 では pending がクリア済みのためリトライしない
      mockAuthState.sessionExpiredDuringOperation = true;
      rerender(
        <ReceivedQuotationForm
          mode="create"
          estimateRequestId={estimateRequestId}
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
        />
      );
      mockAuthState.sessionExpiredDuringOperation = false;
      rerender(
        <ReceivedQuotationForm
          mode="create"
          estimateRequestId={estimateRequestId}
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
        />
      );

      await Promise.resolve();
      // onSubmit の呼び出し回数は 1 回のまま
      expect(mockOnSubmit).toHaveBeenCalledTimes(1);
    });

    // ------------------------------------------------------------------------
    // (4) 再認証中の操作ボタン非活性化 (Requirements: 38.4, 38.5)
    // ------------------------------------------------------------------------
    it('sessionExpiredDuringOperation=true の間、保存・ファイル UP・項目選択・明細行操作が disabled になる (Requirements: 38.4)', () => {
      mockAuthState.sessionExpiredDuringOperation = true;

      render(
        <ReceivedQuotationForm
          mode="create"
          estimateRequestId={estimateRequestId}
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
          selectedItems={[
            {
              customCategory: '躯体',
              workType: '鉄筋',
              name: '鉄筋D10',
              specification: 'SD295A',
              unit: 'kg',
              quantity: 100,
              remarks: '',
            },
          ]}
        />
      );

      // 保存ボタンが disabled
      const submitButton = screen.getByRole('button', { name: /登録/ });
      expect(submitButton).toBeDisabled();

      // ファイル input が disabled
      const fileInput = screen.getByTestId('file-input') as HTMLInputElement;
      expect(fileInput).toBeDisabled();

      // 項目選択から転記ボタン（selectedItems あり）も disabled
      const transcribeButton = screen.getByTestId('transcription-button');
      expect(transcribeButton).toBeDisabled();

      // 受領見積書名・提出日も非活性
      expect(screen.getByLabelText(/受領見積書名/)).toBeDisabled();
      expect(screen.getByLabelText(/提出日/)).toBeDisabled();

      // キャンセルボタンは isSubmitting ベース（再認証フラグでは無効化されない）
      const cancelButton = screen.getByRole('button', { name: /キャンセル/ });
      expect(cancelButton).not.toBeDisabled();
    });

    // ------------------------------------------------------------------------
    // (5) OCR 一括取り込み時の reassignSortOrder 適用 (Requirements: 37.14)
    // ------------------------------------------------------------------------
    it('OCR 一括取り込み後に保存すると lineItems の sortOrder が連続採番される (Requirements: 37.14)', async () => {
      mockOnSubmit.mockResolvedValueOnce(undefined);

      render(
        <ReceivedQuotationForm
          mode="create"
          estimateRequestId={estimateRequestId}
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
        />
      );

      // ファイルアップロード → OcrDataExtractor 表示
      const validFile = new File(['content'], 'test.pdf', { type: 'application/pdf' });
      const fileInput = screen.getByTestId('file-input') as HTMLInputElement;
      Object.defineProperty(fileInput, 'files', {
        value: [validFile],
        writable: false,
      });
      fireEvent.change(fileInput);

      // モック OCR 取り込みボタンを起動（1 件取り込み）
      await waitFor(() => {
        expect(screen.getByTestId('ocr-data-extractor')).toBeInTheDocument();
      });
      const importButton = screen.getByTestId('mock-import-button');
      await userEvent.click(importButton);

      // 取り込み後に保存
      const submitButton = screen.getByRole('button', { name: /登録/ });
      await userEvent.click(submitButton);

      await waitFor(() => {
        expect(mockOnSubmit).toHaveBeenCalled();
      });

      const submittedData = mockOnSubmit.mock.calls[0]![0] as {
        lineItems?: { sortOrder: number; name: string }[];
      };
      expect(submittedData.lineItems).toBeDefined();
      // OCR 取り込み 1 件 → sortOrder は [0]（連続採番）
      const sortOrders = submittedData.lineItems!.map((it) => it.sortOrder);
      expect(sortOrders).toEqual([0]);
      expect(submittedData.lineItems![0]!.name).toBe('テスト品目');
    });

    // ------------------------------------------------------------------------
    // (6) 項目選択転記時の reassignSortOrder 適用 (Requirements: 37.14)
    // ------------------------------------------------------------------------
    it('項目選択転記後に保存すると lineItems の sortOrder が連続採番される (Requirements: 37.14)', async () => {
      mockOnSubmit.mockResolvedValueOnce(undefined);

      const selectedItems = [
        {
          customCategory: '躯体',
          workType: '鉄筋',
          name: '鉄筋A',
          specification: 'SD295',
          unit: 'kg',
          quantity: 100,
          remarks: '',
        },
        {
          customCategory: '躯体',
          workType: '鉄筋',
          name: '鉄筋B',
          specification: 'SD345',
          unit: 'kg',
          quantity: 200,
          remarks: '',
        },
        {
          customCategory: '躯体',
          workType: 'コンクリート',
          name: 'コンクリ',
          specification: '21-8-20',
          unit: 'm3',
          quantity: 5,
          remarks: '',
        },
      ];

      render(
        <ReceivedQuotationForm
          mode="create"
          estimateRequestId={estimateRequestId}
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
          selectedItems={selectedItems}
        />
      );

      const transcribeButton = screen.getByRole('button', { name: /項目選択から転記/ });
      await userEvent.click(transcribeButton);

      await waitFor(() => {
        expect(screen.getByText(/3件.*転記/)).toBeInTheDocument();
      });

      // 単価が空だと convertToLineItemInput を通っても name が空でない限り送信対象
      // しかし unitPrice 空でも name があれば lineItems に含まれる
      const submitButton = screen.getByRole('button', { name: /登録/ });
      await userEvent.click(submitButton);

      await waitFor(() => {
        expect(mockOnSubmit).toHaveBeenCalled();
      });

      const submittedData = mockOnSubmit.mock.calls[0]![0] as {
        lineItems?: { sortOrder: number; name: string }[];
      };
      expect(submittedData.lineItems).toBeDefined();
      // 3 件 → sortOrder は [0, 1, 2]
      const sortOrders = submittedData.lineItems!.map((it) => it.sortOrder);
      expect(sortOrders).toEqual([0, 1, 2]);
      const names = submittedData.lineItems!.map((it) => it.name);
      expect(names).toEqual(['鉄筋A', '鉄筋B', 'コンクリ']);
    });

    // ------------------------------------------------------------------------
    // (7) 保存成功時の snapshot 更新と isDirty=false 復帰
    //     (Requirements: 38.12, design.md 4911)
    // ------------------------------------------------------------------------
    it('保存成功後はキャンセル時に未保存変更ガードが発火しない（snapshot が最新化される） (Requirements: 38.12)', async () => {
      mockOnSubmit.mockResolvedValueOnce(undefined);
      const confirmSpy = vi.spyOn(window, 'confirm');

      try {
        render(
          <ReceivedQuotationForm
            mode="create"
            estimateRequestId={estimateRequestId}
            onSubmit={mockOnSubmit}
            onCancel={mockOnCancel}
          />
        );

        // 明細行に入力（dirty 状態を作る）
        const nameInputs = screen.getAllByPlaceholderText(/名称/);
        await userEvent.type(nameInputs[0]!, 'スナップショット品目');

        // 保存実行 → 成功
        const submitButton = screen.getByRole('button', { name: /登録/ });
        await userEvent.click(submitButton);

        await waitFor(() => {
          expect(mockOnSubmit).toHaveBeenCalledTimes(1);
        });

        // 保存成功後にキャンセルボタンをクリック
        // snapshot が最新化されているため isDirty=false → window.confirm は呼ばれない
        const cancelButton = screen.getByRole('button', { name: /キャンセル/ });
        await userEvent.click(cancelButton);

        expect(confirmSpy).not.toHaveBeenCalled();
        expect(mockOnCancel).toHaveBeenCalled();
      } finally {
        confirmSpy.mockRestore();
      }
    });

    // ------------------------------------------------------------------------
    // (補) 未保存変更がある状態でキャンセル時に確認ダイアログが表示される
    //     (Requirements: 38.12)
    // ------------------------------------------------------------------------
    it('未保存変更がある状態でキャンセル時に window.confirm が呼ばれる (Requirements: 38.12)', async () => {
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

      try {
        render(
          <ReceivedQuotationForm
            mode="create"
            estimateRequestId={estimateRequestId}
            onSubmit={mockOnSubmit}
            onCancel={mockOnCancel}
          />
        );

        const nameInputs = screen.getAllByPlaceholderText(/名称/);
        await userEvent.type(nameInputs[0]!, '未保存品目');

        const cancelButton = screen.getByRole('button', { name: /キャンセル/ });
        await userEvent.click(cancelButton);

        // 未保存変更ガード（Req 38.12）が発火
        expect(confirmSpy).toHaveBeenCalledWith(
          '変更が保存されていません。閉じてもよろしいですか？'
        );
        expect(mockOnCancel).toHaveBeenCalled(); // confirm が true なのでキャンセル続行
      } finally {
        confirmSpy.mockRestore();
      }
    });
  });

  // ==========================================================================
  // OCRセクション折りたたみ機能のテスト（Task 86.2）
  //
  // Requirements:
  // - 40.1, 40.2: 登録/編集の両ダイアログでセクションヘッダ表示
  // - 40.4, 40.5: ヘッダクリックで OCR セクション本体をトグル（展開↔折りたたみ）
  // - 40.6, 40.7: キーボード（Enter / Space）でトグル発火
  // - 40.8, 40.9: ダイアログ初期表示時は展開状態（aria-expanded="true"）
  // - 40.10: 永続化なし。unmount → remount でデフォルト展開状態に戻る
  // - 40.11, 40.12: 折りたたみ中も OcrDataExtractor は unmount されず DOM に保持
  // - 40.13: aria-expanded / aria-controls を付与
  // - 40.14: 表示条件未成立時はヘッダを描画しない
  // - 40.16: フォーカス時の視覚的明示（outline / boxShadow）
  // ==========================================================================
  describe('OCRセクション折りたたみ機能 (Req 40 / Task 86.2)', () => {
    /** create モードでファイルアップロード済みの状態を作るヘルパー */
    const renderWithUploadedFile = async () => {
      const utils = render(
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

      // ファイルがアップロードされ OCR セクションが描画されるまで待機
      await screen.findByTestId('ocr-section-header');
      return utils;
    };

    /** 編集モードで既存ファイルがある状態を作るヘルパー */
    const renderEditModeWithExistingFile = () => {
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
        netAmount: null as number | null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      return render(
        <ReceivedQuotationForm
          mode="edit"
          estimateRequestId={estimateRequestId}
          initialData={initialDataWithFile}
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
          existingFilePreviewUrl="https://example.com/preview.pdf"
        />
      );
    };

    // (1) 初期展開: ダイアログを開いた直後、OCR セクション本体が表示され
    //              aria-expanded="true" であること（Req 40.8, 40.9, 40.13）
    it('初期表示時に OCR セクション本体が表示され aria-expanded="true" である (Req 40.8/40.9/40.13)', async () => {
      await renderWithUploadedFile();

      const header = screen.getByTestId('ocr-section-header');
      expect(header).toHaveAttribute('aria-expanded', 'true');
      expect(header).toHaveAttribute('aria-controls', 'received-quotation-ocr-section-body');

      const body = document.getElementById('received-quotation-ocr-section-body');
      expect(body).not.toBeNull();
      // hidden 属性が外れている（初期は展開状態）
      expect(body!.hasAttribute('hidden')).toBe(false);
      // OcrDataExtractor が body の子として描画されている
      expect(screen.getByTestId('ocr-data-extractor')).toBeInTheDocument();
    });

    // (2) クリックで折りたたみ: ヘッダクリックで本体が hidden 属性を持ち
    //                          aria-expanded="false" になること（Req 40.4）
    it('ヘッダクリックで本体が hidden になり aria-expanded="false" になる (Req 40.4)', async () => {
      await renderWithUploadedFile();

      const header = screen.getByTestId('ocr-section-header');
      fireEvent.click(header);

      expect(header).toHaveAttribute('aria-expanded', 'false');
      const body = document.getElementById('received-quotation-ocr-section-body');
      expect(body).not.toBeNull();
      expect(body!.hasAttribute('hidden')).toBe(true);
    });

    // (3) 再クリックで再展開: 折りたたみ後にもう一度クリックし、hidden が外れて
    //                       aria-expanded="true" に戻ること（Req 40.5）
    it('折りたたみ後の再クリックで展開状態に戻る (Req 40.5)', async () => {
      await renderWithUploadedFile();

      const header = screen.getByTestId('ocr-section-header');
      fireEvent.click(header); // 折りたたみ
      fireEvent.click(header); // 再展開

      expect(header).toHaveAttribute('aria-expanded', 'true');
      const body = document.getElementById('received-quotation-ocr-section-body');
      expect(body).not.toBeNull();
      expect(body!.hasAttribute('hidden')).toBe(false);
    });

    // (4) Enter キーでトグル: ヘッダにフォーカスして Enter を押下し、
    //                        トグルが発火すること（Req 40.6）
    it('Enter キーでトグルが発火する (Req 40.6)', async () => {
      const user = userEvent.setup();
      await renderWithUploadedFile();

      const header = screen.getByTestId('ocr-section-header');
      header.focus();
      expect(header).toHaveAttribute('aria-expanded', 'true');

      await user.keyboard('{Enter}');
      expect(header).toHaveAttribute('aria-expanded', 'false');

      await user.keyboard('{Enter}');
      expect(header).toHaveAttribute('aria-expanded', 'true');
    });

    // (5) Space キーでトグル: ヘッダにフォーカスして Space を押下し、
    //                        トグルが発火すること（Req 40.7）
    it('Space キーでトグルが発火する (Req 40.7)', async () => {
      const user = userEvent.setup();
      await renderWithUploadedFile();

      const header = screen.getByTestId('ocr-section-header');
      header.focus();
      expect(header).toHaveAttribute('aria-expanded', 'true');

      await user.keyboard(' ');
      expect(header).toHaveAttribute('aria-expanded', 'false');

      await user.keyboard(' ');
      expect(header).toHaveAttribute('aria-expanded', 'true');
    });

    // (6) OCRセクションのDOM保持: 折りたたみ状態でも OcrDataExtractor の
    //                             DOM ノードが残っていること（unmount されない、Req 40.11/40.12）
    it('折りたたみ状態でも OcrDataExtractor の DOM が残存する (Req 40.11/40.12)', async () => {
      await renderWithUploadedFile();

      // 展開状態で OcrDataExtractor が存在
      expect(screen.getByTestId('ocr-data-extractor')).toBeInTheDocument();

      const header = screen.getByTestId('ocr-section-header');
      fireEvent.click(header); // 折りたたむ

      // 折りたたみ後も DOM ノードが残る（hidden 属性付きで保持）
      const ocrExtractor = screen.getByTestId('ocr-data-extractor');
      expect(ocrExtractor).toBeInTheDocument();

      // 親 body には hidden が付与されている
      const body = document.getElementById('received-quotation-ocr-section-body');
      expect(body).not.toBeNull();
      expect(body!.hasAttribute('hidden')).toBe(true);
      expect(body!.contains(ocrExtractor)).toBe(true);
    });

    // (7) 登録/編集両モードでヘッダ表示: mode="create" と mode="edit" の両方で
    //                                    ヘッダ要素が描画されること（Req 40.1/40.2）
    it('mode="create" でファイルアップロード後にヘッダが描画される (Req 40.1)', async () => {
      await renderWithUploadedFile();
      expect(screen.getByTestId('ocr-section-header')).toBeInTheDocument();
    });

    it('mode="edit" で既存ファイルがある場合にヘッダが描画される (Req 40.2)', () => {
      renderEditModeWithExistingFile();
      expect(screen.getByTestId('ocr-section-header')).toBeInTheDocument();
    });

    // (8) ファイル未存在時はヘッダ非表示: selectedFile === null かつ
    //                                    existingFileName === null のとき、
    //                                    ヘッダ要素が DOM に存在しないこと（Req 40.14）
    it('ファイル未存在時（create モードで未アップロード）はヘッダが描画されない (Req 40.14)', () => {
      render(
        <ReceivedQuotationForm
          mode="create"
          estimateRequestId={estimateRequestId}
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
        />
      );

      expect(screen.queryByTestId('ocr-section-header')).not.toBeInTheDocument();
    });

    // (9) 再オープン時に展開状態に戻る: unmount → remount でデフォルト展開状態に
    //                                  戻ること（Req 40.10、永続化なし）
    it('unmount → remount でデフォルトの展開状態（aria-expanded="true"）に戻る (Req 40.10)', async () => {
      const { unmount } = await renderWithUploadedFile();

      // 折りたたみ操作
      const header = screen.getByTestId('ocr-section-header');
      fireEvent.click(header);
      expect(header).toHaveAttribute('aria-expanded', 'false');

      // unmount
      unmount();
      expect(screen.queryByTestId('ocr-section-header')).not.toBeInTheDocument();

      // remount（新たに render）→ 同条件でファイルアップロード
      await renderWithUploadedFile();
      const newHeader = screen.getByTestId('ocr-section-header');
      // デフォルトの展開状態に戻る
      expect(newHeader).toHaveAttribute('aria-expanded', 'true');
      const body = document.getElementById('received-quotation-ocr-section-body');
      expect(body).not.toBeNull();
      expect(body!.hasAttribute('hidden')).toBe(false);
    });

    // (10) フォーカス時の視覚的明示: ヘッダに focus() 発火後、style.outline に
    //      styles.ocrSectionHeaderFocus のスタイル値が反映されること、
    //      blur() 後に解除されること（Req 40.16、design review Critical Issue 1）
    it('focus 時に outline / boxShadow が付与され、blur 時に解除される (Req 40.16)', async () => {
      await renderWithUploadedFile();

      const header = screen.getByTestId('ocr-section-header') as HTMLButtonElement;

      // 初期状態（未フォーカス）: focus スタイルは未適用
      expect(header.style.outline).not.toContain('2px solid');

      // focus 発火 → outline / outlineOffset / boxShadow が適用される
      fireEvent.focus(header);
      expect(header.style.outline).toBe('2px solid #2563eb');
      expect(header.style.outlineOffset).toBe('2px');
      expect(header.style.boxShadow).toBe('0 0 0 4px rgba(37, 99, 235, 0.2)');

      // blur 発火 → focus スタイルが解除される
      fireEvent.blur(header);
      expect(header.style.outline).not.toContain('2px solid');
      expect(header.style.boxShadow).not.toContain('rgba(37, 99, 235, 0.2)');
    });
  });
});
