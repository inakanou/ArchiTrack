/**
 * @fileoverview OcrDataExtractorコンポーネントの単体テスト
 *
 * Task 28.3: OcrDataExtractorコンポーネントの単体テスト
 *
 * Requirements:
 * - 13.5: PDF/画像ファイルに対してTesseract.jsによるOCR処理を自動的に開始する
 * - 13.6: ExcelファイルにはSheetJS（xlsx）によるデータパース（直接データ読み取り）を実行する
 * - 13.7: 処理中インジケーター（プログレスバー）を表示する
 * - 13.8: 抽出結果をテキストデータとして表示する
 * - 13.9: 抽出テキストを選択・コピー可能な状態で表示する
 * - 13.10: 一括取り込みボタンを表示する
 * - 13.11: 一括取り込みボタンクリック時に抽出データを各明細行フィールドに自動入力する
 * - 13.12: 取り込み完了時に各行の金額を自動計算する
 * - 13.13: 取り込み結果の確認・修正を促すメッセージを表示する
 * - 13.14: OCR/パース処理失敗時にエラーメッセージを表示し手動入力を促す
 *
 * @module __tests__/components/estimate-requests/OcrDataExtractor
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// モック関数（vi.mock外でアクセス可能にするためvi.hoistedを使用）
const { mockCreateWorker, mockXlsxRead, mockSheetToJson } = vi.hoisted(() => ({
  mockCreateWorker: vi.fn(),
  mockXlsxRead: vi.fn(),
  mockSheetToJson: vi.fn(),
}));

// tesseract.jsをモック（軽量版）
vi.mock('tesseract.js', () => ({
  createWorker: mockCreateWorker,
}));

// xlsxをモック（軽量版）
vi.mock('xlsx', () => ({
  read: mockXlsxRead,
  utils: {
    sheet_to_json: mockSheetToJson,
  },
}));

import { OcrDataExtractor } from '../../../components/estimate-requests/OcrDataExtractor';

describe('OcrDataExtractor', () => {
  const mockOnImportLineItems = vi.fn();
  let mockWorker: { recognize: ReturnType<typeof vi.fn>; terminate: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();

    // xlsxモックのデフォルト実装
    mockXlsxRead.mockReturnValue({
      SheetNames: ['Sheet1'],
      Sheets: { Sheet1: {} },
    });
    mockSheetToJson.mockReturnValue([
      ['名称', '規格', '単位', '数量', '単価', '金額', '備考'],
      ['外壁塗装工事', 'シリコン系', 'm2', '150', '3500', '525000', '足場込み'],
      ['防水工事', 'ウレタン防水', 'm2', '50', '8000', '400000', ''],
    ]);

    // Tesseract.jsワーカーのモック
    mockWorker = {
      recognize: vi.fn().mockResolvedValue({
        data: {
          text: '外壁塗装工事\tシリコン系\tm2\t150\t3500\n防水工事\tウレタン防水\tm2\t50\t8000',
        },
      }),
      terminate: vi.fn().mockResolvedValue(undefined),
    };
    mockCreateWorker.mockResolvedValue(mockWorker);
  });

  afterEach(() => {
    cleanup();
    // global.fetchのモックをクリーンアップ
    if ('fetch' in global && vi.isMockFunction(global.fetch)) {
      (global.fetch as ReturnType<typeof vi.fn>).mockRestore?.();
    }
  });

  describe('ファイルがnullの場合', () => {
    it('何も表示しない', () => {
      const { container } = render(
        <OcrDataExtractor file={null} onImportLineItems={mockOnImportLineItems} />
      );

      expect(container).toBeEmptyDOMElement();
    });
  });

  describe('OCR処理実行と処理中インジケーター表示のテスト（Requirements: 13.5, 13.7）', () => {
    it('PDF/画像ファイルに対してOCR処理を自動的に開始する', async () => {
      const imageFile = new File(['image-data'], 'quotation.jpg', { type: 'image/jpeg' });

      render(<OcrDataExtractor file={imageFile} onImportLineItems={mockOnImportLineItems} />);

      // OCR処理が開始される
      await waitFor(() => {
        expect(mockCreateWorker).toHaveBeenCalledWith('jpn');
      });
    });

    it('処理中インジケーター（プログレスバー）を表示する', async () => {
      // ワーカーのrecognizeを遅延させる
      mockWorker.recognize.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve({ data: { text: 'test' } }), 100))
      );

      const imageFile = new File(['image-data'], 'quotation.jpg', { type: 'image/jpeg' });

      render(<OcrDataExtractor file={imageFile} onImportLineItems={mockOnImportLineItems} />);

      // 処理中インジケーターが表示される
      await waitFor(() => {
        expect(screen.getByTestId('ocr-progress-indicator')).toBeInTheDocument();
      });
    });

    it('PDFファイルに対してもOCR処理を実行する', async () => {
      const pdfFile = new File(['%PDF-1.4'], 'quotation.pdf', { type: 'application/pdf' });

      render(<OcrDataExtractor file={pdfFile} onImportLineItems={mockOnImportLineItems} />);

      await waitFor(() => {
        expect(mockCreateWorker).toHaveBeenCalledWith('jpn');
      });
    });
  });

  describe('Excelデータパースと構造化データ変換のテスト（Requirements: 13.6）', () => {
    it('ExcelファイルにはSheetJSによるデータパースを実行する', async () => {
      const xlsxFile = new File(['excel-data'], 'quotation.xlsx', {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });

      render(<OcrDataExtractor file={xlsxFile} onImportLineItems={mockOnImportLineItems} />);

      // Excelパースが完了するまで待機
      await waitFor(() => {
        expect(screen.getByTestId('ocr-extracted-text')).toBeInTheDocument();
      });

      // 抽出結果が表示される
      expect(screen.getByText(/外壁塗装工事/)).toBeInTheDocument();
    });

    it('Excelデータから構造化データへ変換する（ヘッダー検出）', async () => {
      const xlsxFile = new File(['excel-data'], 'quotation.xlsx', {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });

      render(<OcrDataExtractor file={xlsxFile} onImportLineItems={mockOnImportLineItems} />);

      // 一括取り込みボタンが表示される
      await waitFor(() => {
        expect(screen.getByTestId('ocr-import-button')).toBeInTheDocument();
      });

      // 検出されたデータ件数が表示される
      expect(screen.getByText(/2件のデータが検出されました/)).toBeInTheDocument();
    });
  });

  describe('一括取り込みボタンクリック時のコールバック呼び出しテスト（Requirements: 13.10, 13.11）', () => {
    it('一括取り込みボタンをクリックするとonImportLineItemsが呼ばれる', async () => {
      const user = userEvent.setup();
      const xlsxFile = new File(['excel-data'], 'quotation.xlsx', {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });

      render(<OcrDataExtractor file={xlsxFile} onImportLineItems={mockOnImportLineItems} />);

      // 一括取り込みボタンが表示されるまで待機
      await waitFor(() => {
        expect(screen.getByTestId('ocr-import-button')).toBeInTheDocument();
      });

      // 一括取り込みボタンをクリック
      const importButton = screen.getByTestId('ocr-import-button');
      await user.click(importButton);

      // コールバックが呼ばれる
      expect(mockOnImportLineItems).toHaveBeenCalledTimes(1);
      expect(mockOnImportLineItems).toHaveBeenCalledWith(
        expect.arrayContaining([expect.objectContaining({ name: '外壁塗装工事' })])
      );
    });

    it('取り込み完了後に確認・修正を促すメッセージを表示する（Requirements: 13.13）', async () => {
      const user = userEvent.setup();
      const xlsxFile = new File(['excel-data'], 'quotation.xlsx', {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });

      render(<OcrDataExtractor file={xlsxFile} onImportLineItems={mockOnImportLineItems} />);

      await waitFor(() => {
        expect(screen.getByTestId('ocr-import-button')).toBeInTheDocument();
      });

      await user.click(screen.getByTestId('ocr-import-button'));

      // 確認・修正を促すメッセージが表示される
      await waitFor(() => {
        expect(screen.getByTestId('ocr-import-success')).toBeInTheDocument();
        expect(
          screen.getByText(
            /データを明細行に取り込みました。内容を確認し、必要に応じて修正してください/
          )
        ).toBeInTheDocument();
      });
    });

    it('取り込み完了後はボタンが「取り込み済み」になりdisabledになる', async () => {
      const user = userEvent.setup();
      const xlsxFile = new File(['excel-data'], 'quotation.xlsx', {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });

      render(<OcrDataExtractor file={xlsxFile} onImportLineItems={mockOnImportLineItems} />);

      await waitFor(() => {
        expect(screen.getByTestId('ocr-import-button')).toBeInTheDocument();
      });

      await user.click(screen.getByTestId('ocr-import-button'));

      await waitFor(() => {
        const importButton = screen.getByTestId('ocr-import-button');
        expect(importButton).toHaveTextContent('取り込み済み');
        expect(importButton).toBeDisabled();
      });
    });
  });

  describe('OCR処理エラー時のエラーメッセージ表示テスト（Requirements: 13.14）', () => {
    it('OCR処理が失敗した場合はエラーメッセージを表示する', async () => {
      // ワーカーのrecognizeをエラーを投げるようにモック
      mockWorker.recognize.mockRejectedValue(new Error('OCR処理に失敗しました'));

      const imageFile = new File(['image-data'], 'quotation.jpg', { type: 'image/jpeg' });

      render(<OcrDataExtractor file={imageFile} onImportLineItems={mockOnImportLineItems} />);

      await waitFor(() => {
        expect(screen.getByTestId('ocr-error-message')).toBeInTheDocument();
      });

      expect(screen.getByText(/OCR処理に失敗しました/)).toBeInTheDocument();
    });

    it('エラー時に手動入力を促すメッセージを表示する', async () => {
      mockWorker.recognize.mockRejectedValue(new Error('OCR処理に失敗しました'));

      const imageFile = new File(['image-data'], 'quotation.jpg', { type: 'image/jpeg' });

      render(<OcrDataExtractor file={imageFile} onImportLineItems={mockOnImportLineItems} />);

      await waitFor(() => {
        expect(screen.getByText(/手動で明細行にデータを入力してください/)).toBeInTheDocument();
      });
    });

    it('OCRタイムアウト（30秒）の場合にエラーメッセージを表示する', async () => {
      // タイムアウトエラーを直接シミュレート（AbortErrorを投げる）
      const timeoutMockWorker = {
        recognize: vi
          .fn()
          .mockRejectedValue(new DOMException('タイムアウトしました', 'AbortError')),
        terminate: vi.fn().mockResolvedValue(undefined),
      };
      mockCreateWorker.mockResolvedValue(timeoutMockWorker);

      const imageFile = new File(['image-data'], 'quotation.jpg', { type: 'image/jpeg' });

      render(<OcrDataExtractor file={imageFile} onImportLineItems={mockOnImportLineItems} />);

      await waitFor(() => {
        expect(screen.getByTestId('ocr-error-message')).toBeInTheDocument();
      });

      // タイムアウトまたはエラーメッセージが表示される
      expect(screen.getByText(/タイムアウト|処理に失敗しました/)).toBeInTheDocument();
    });

    it('Excelパースが失敗した場合はエラーメッセージを表示する', async () => {
      // xlsxのreadをエラーを投げるようにモック（mockImplementationで確実に上書き）
      mockXlsxRead.mockImplementation(() => {
        throw new Error('Excelデータの解析に失敗しました');
      });

      const xlsxFile = new File(['invalid-data'], 'invalid.xlsx', {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });

      render(<OcrDataExtractor file={xlsxFile} onImportLineItems={mockOnImportLineItems} />);

      await waitFor(() => {
        expect(screen.getByTestId('ocr-error-message')).toBeInTheDocument();
      });

      expect(screen.getByText(/Excelデータの解析に失敗しました/)).toBeInTheDocument();
    });
  });

  describe('抽出結果テキスト表示のテスト（Requirements: 13.8, 13.9）', () => {
    it('抽出結果をテキストデータとして表示する', async () => {
      const xlsxFile = new File(['excel-data'], 'quotation.xlsx', {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });

      render(<OcrDataExtractor file={xlsxFile} onImportLineItems={mockOnImportLineItems} />);

      await waitFor(() => {
        const extractedText = screen.getByTestId('ocr-extracted-text');
        expect(extractedText).toBeInTheDocument();
      });
    });

    it('抽出テキストを選択・コピー可能な状態で表示する', async () => {
      const xlsxFile = new File(['excel-data'], 'quotation.xlsx', {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });

      render(<OcrDataExtractor file={xlsxFile} onImportLineItems={mockOnImportLineItems} />);

      await waitFor(() => {
        const extractedText = screen.getByTestId('ocr-extracted-text');
        // テキスト選択可能なスタイルが適用されている
        expect(extractedText).toHaveStyle({ userSelect: 'text' });
      });
    });
  });

  describe('ファイル変更時のリセットテスト', () => {
    it('ファイルが変更されたとき状態がリセットされる', async () => {
      const xlsxFile1 = new File(['excel-data-1'], 'quotation1.xlsx', {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const xlsxFile2 = new File(['excel-data-2'], 'quotation2.xlsx', {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });

      const { rerender } = render(
        <OcrDataExtractor file={xlsxFile1} onImportLineItems={mockOnImportLineItems} />
      );

      // 最初のファイルの処理完了を待機
      await waitFor(() => {
        expect(screen.getByTestId('ocr-extracted-text')).toBeInTheDocument();
      });

      // ファイルを変更
      rerender(<OcrDataExtractor file={xlsxFile2} onImportLineItems={mockOnImportLineItems} />);

      // 状態がリセットされ、新しいファイルの処理が開始される
      await waitFor(() => {
        expect(screen.getByTestId('ocr-extracted-text')).toBeInTheDocument();
      });
    });
  });

  // ==========================================================================
  // Task 39.1: OcrDataExtractorの改訂テスト（OCR再実行・リトライ機能）
  //
  // Requirements:
  // - 16.1: 編集画面でPDF/画像の場合に「OCR実行」ボタンを表示
  // - 16.2: ボタンクリックで既存ファイルに対してOCR処理を開始
  // - 16.3: OCR処理中にインジケーターを表示
  // - 16.4: OCR完了後に結果と一括取り込みボタンを表示
  // - 16.5: OCR失敗時に「OCRリトライ」ボタンを表示
  // - 16.6: リトライボタンでOCR再実行
  // - 16.7: Excelの場合に「データパース実行」ボタンを表示
  // - 16.8: データパース実行ボタンでデータパースを開始
  // - 16.10: OCR結果から一括取り込み
  // - 16.11: 処理中にボタンを非活性
  // ==========================================================================

  describe('autoStart=false時のOCR/パース処理（16.1-16.11）', () => {
    it('autoStart=false時にOCR/パース処理が自動実行されないこと', async () => {
      const imageFile = new File(['image-data'], 'quotation.jpg', { type: 'image/jpeg' });

      render(
        <OcrDataExtractor
          file={imageFile}
          onImportLineItems={mockOnImportLineItems}
          autoStart={false}
          fileUrl="https://example.com/file.jpg"
          fileMimeType="image/jpeg"
        />
      );

      // ワーカーが作成されないこと（自動実行されない）
      await new Promise((r) => setTimeout(r, 100));
      expect(mockCreateWorker).not.toHaveBeenCalled();
    });

    it('PDF/画像ファイル時に「OCR実行」ボタンを表示する（16.1）', async () => {
      render(
        <OcrDataExtractor
          file={null}
          onImportLineItems={mockOnImportLineItems}
          autoStart={false}
          fileUrl="https://example.com/file.pdf"
          fileMimeType="application/pdf"
        />
      );

      expect(screen.getByRole('button', { name: /OCR実行/ })).toBeInTheDocument();
    });

    it('画像ファイル時に「OCR実行」ボタンを表示する（16.1）', async () => {
      render(
        <OcrDataExtractor
          file={null}
          onImportLineItems={mockOnImportLineItems}
          autoStart={false}
          fileUrl="https://example.com/file.jpg"
          fileMimeType="image/jpeg"
        />
      );

      expect(screen.getByRole('button', { name: /OCR実行/ })).toBeInTheDocument();
    });

    it('Excelファイル時に「データパース実行」ボタンを表示する（16.7）', async () => {
      render(
        <OcrDataExtractor
          file={null}
          onImportLineItems={mockOnImportLineItems}
          autoStart={false}
          fileUrl="https://example.com/file.xlsx"
          fileMimeType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        />
      );

      expect(screen.getByRole('button', { name: /データパース実行/ })).toBeInTheDocument();
    });

    it('OCR実行ボタンクリック時にfileUrlからファイルを取得しOCR処理を実行する（16.2）', async () => {
      const user = userEvent.setup();
      const mockBlob = new Blob(['pdf-content'], { type: 'application/pdf' });
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        blob: () => Promise.resolve(mockBlob),
      });

      render(
        <OcrDataExtractor
          file={null}
          onImportLineItems={mockOnImportLineItems}
          autoStart={false}
          fileUrl="https://example.com/file.pdf"
          fileMimeType="application/pdf"
        />
      );

      await user.click(screen.getByRole('button', { name: /OCR実行/ }));

      // fetchが呼ばれてファイルが取得される
      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith('https://example.com/file.pdf');
      });

      // OCRワーカーが作成されて処理が実行される
      await waitFor(() => {
        expect(mockCreateWorker).toHaveBeenCalledWith('jpn');
      });
    });

    it('データパース実行ボタンクリック時にfileUrlからExcelデータをパースする（16.8）', async () => {
      const user = userEvent.setup();
      const mockBlob = new Blob(['excel-content'], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        blob: () => Promise.resolve(mockBlob),
      });

      render(
        <OcrDataExtractor
          file={null}
          onImportLineItems={mockOnImportLineItems}
          autoStart={false}
          fileUrl="https://example.com/file.xlsx"
          fileMimeType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        />
      );

      await user.click(screen.getByRole('button', { name: /データパース実行/ }));

      // fetchが呼ばれてファイルが取得される
      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith('https://example.com/file.xlsx');
      });
    });

    it('処理中にすべてのアクションボタンを非活性にする（16.11）', async () => {
      const user = userEvent.setup();
      // OCR処理が長時間かかるようシミュレート
      mockWorker.recognize.mockImplementation(() => new Promise(() => {})); // never resolves
      const mockBlob = new Blob(['pdf-content'], { type: 'application/pdf' });
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        blob: () => Promise.resolve(mockBlob),
      });

      render(
        <OcrDataExtractor
          file={null}
          onImportLineItems={mockOnImportLineItems}
          autoStart={false}
          fileUrl="https://example.com/file.pdf"
          fileMimeType="application/pdf"
        />
      );

      await user.click(screen.getByRole('button', { name: /OCR実行/ }));

      // 処理中にボタンが非活性になる
      await waitFor(() => {
        expect(screen.getByTestId('ocr-progress-indicator')).toBeInTheDocument();
      });

      // ボタンが非活性であること
      const buttons = screen.queryAllByRole('button');
      buttons.forEach((button) => {
        if (button.textContent?.includes('OCR実行') || button.textContent?.includes('リトライ')) {
          expect(button).toBeDisabled();
        }
      });
    });
  });

  describe('OCR失敗時のリトライ機能（16.5, 16.6）', () => {
    it('OCR処理が失敗した場合に「OCRリトライ」ボタンを表示する（16.5）', async () => {
      const user = userEvent.setup();
      mockWorker.recognize.mockRejectedValue(new Error('OCR処理に失敗しました'));
      const mockBlob = new Blob(['pdf-content'], { type: 'application/pdf' });
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        blob: () => Promise.resolve(mockBlob),
      });

      render(
        <OcrDataExtractor
          file={null}
          onImportLineItems={mockOnImportLineItems}
          autoStart={false}
          fileUrl="https://example.com/file.pdf"
          fileMimeType="application/pdf"
        />
      );

      await user.click(screen.getByRole('button', { name: /OCR実行/ }));

      // エラー表示とリトライボタンが表示される
      await waitFor(() => {
        expect(screen.getByTestId('ocr-error-message')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /OCRリトライ/ })).toBeInTheDocument();
      });
    });

    it('新規アップロード時にOCR失敗で「OCRリトライ」ボタンを表示する（16.5）', async () => {
      mockWorker.recognize.mockRejectedValue(new Error('OCR処理に失敗しました'));
      const imageFile = new File(['image-data'], 'quotation.jpg', { type: 'image/jpeg' });

      render(<OcrDataExtractor file={imageFile} onImportLineItems={mockOnImportLineItems} />);

      // エラー表示とリトライボタンが表示される
      await waitFor(() => {
        expect(screen.getByTestId('ocr-error-message')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /OCRリトライ/ })).toBeInTheDocument();
      });
    });

    it('リトライボタンクリック時にOCR処理を再実行する（16.6）', async () => {
      const user = userEvent.setup();
      // 最初は失敗、リトライ時は成功
      mockWorker.recognize
        .mockRejectedValueOnce(new Error('OCR処理に失敗しました'))
        .mockResolvedValueOnce({
          data: { text: '名称\t規格\t単位\t数量\t単価\nコンクリート\tC25\tm3\t10\t15000' },
        });

      const mockBlob = new Blob(['pdf-content'], { type: 'application/pdf' });
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        blob: () => Promise.resolve(mockBlob),
      });

      render(
        <OcrDataExtractor
          file={null}
          onImportLineItems={mockOnImportLineItems}
          autoStart={false}
          fileUrl="https://example.com/file.pdf"
          fileMimeType="application/pdf"
        />
      );

      // 最初のOCR実行
      await user.click(screen.getByRole('button', { name: /OCR実行/ }));

      // エラーとリトライボタンが表示される
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /OCRリトライ/ })).toBeInTheDocument();
      });

      // 2回目のcreateworkerを設定（リトライ用）
      const retryWorker = {
        recognize: vi.fn().mockResolvedValue({
          data: { text: '名称\t規格\t単位\t数量\t単価\nコンクリート\tC25\tm3\t10\t15000' },
        }),
        terminate: vi.fn().mockResolvedValue(undefined),
      };
      mockCreateWorker.mockResolvedValue(retryWorker);

      // リトライボタンをクリック
      await user.click(screen.getByRole('button', { name: /OCRリトライ/ }));

      // OCR処理が再実行されて結果が表示される
      await waitFor(() => {
        expect(screen.getByTestId('ocr-extracted-text')).toBeInTheDocument();
      });
    });
  });

  describe('file + autoStart=true（従来動作：後方互換性）テスト', () => {
    it('fileプロパティ + autoStart=trueで従来通り自動実行する', async () => {
      const imageFile = new File(['image-data'], 'quotation.jpg', { type: 'image/jpeg' });

      render(
        <OcrDataExtractor
          file={imageFile}
          onImportLineItems={mockOnImportLineItems}
          autoStart={true}
        />
      );

      // OCR処理が自動実行される
      await waitFor(() => {
        expect(mockCreateWorker).toHaveBeenCalledWith('jpn');
      });
    });

    it('autoStartを省略した場合もデフォルトtrueとして自動実行する（後方互換性）', async () => {
      const imageFile = new File(['image-data'], 'quotation.jpg', { type: 'image/jpeg' });

      render(<OcrDataExtractor file={imageFile} onImportLineItems={mockOnImportLineItems} />);

      // OCR処理が自動実行される（従来の動作と同じ）
      await waitFor(() => {
        expect(mockCreateWorker).toHaveBeenCalledWith('jpn');
      });
    });
  });

  // --------------------------------------------------------------------------
  // 一括取り込み時の数値フォーマット適用テスト (Task 43.3)
  // --------------------------------------------------------------------------

  describe('一括取り込み時の数値フォーマット適用 (18.10)', () => {
    it('一括取り込み後の数量が小数2桁表示、単価が整数表示、金額が正しく計算される', async () => {
      // Excelファイルモック（パース結果に数値データを含む）
      const excelFile = new File(['excel-data'], 'quotation.xlsx', {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });

      mockXlsxRead.mockReturnValue({
        SheetNames: ['Sheet1'],
        Sheets: {
          Sheet1: {},
        },
      });

      // ヘッダー行 + データ行を返すモック
      mockSheetToJson.mockReturnValue([
        ['名称', '規格', '単位', '数量', '単価'],
        ['テスト項目', 'A-100', '式', '2.5', '1234.6'],
      ]);

      render(<OcrDataExtractor file={excelFile} onImportLineItems={mockOnImportLineItems} />);

      // Excel処理完了を待機
      await waitFor(
        () => {
          expect(screen.getByTestId('ocr-import-button')).toBeInTheDocument();
        },
        { timeout: 5000 }
      );

      // 一括取り込みボタンをクリック
      await userEvent.click(screen.getByTestId('ocr-import-button'));

      // onImportLineItemsが呼ばれたことを確認
      expect(mockOnImportLineItems).toHaveBeenCalledTimes(1);

      // 取り込まれたデータのフォーマットを確認
      const importedItems = mockOnImportLineItems.mock.calls[0]?.[0];
      expect(importedItems).toBeDefined();
      expect(importedItems.length).toBeGreaterThan(0);

      const firstItem = importedItems[0];
      // 数量: 小数2桁表示 (2.5 -> 2.50)
      expect(firstItem.quantity).toBe('2.50');
      // 単価: 整数表示 (1234.6 -> 1235)
      expect(firstItem.unitPrice).toBe('1235');
      // 金額: 再計算 (2.50 * 1235 = 3087.5 -> 3088)
      expect(firstItem.amount).toBe(3088);
    });
  });
});
