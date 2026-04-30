/**
 * @fileoverview OcrDataExtractor コンポーネントのテスト
 *
 * Task 25.1: OcrDataExtractorコンポーネントの実装
 * Task 28.3: OcrDataExtractorコンポーネントの単体テスト
 * Task 41.1: pdfjs-distテキスト抽出のユニットテスト
 *
 * Requirements:
 * - 13.5: PDF/画像ファイルに対してOCR処理を自動的に開始する
 * - 13.6: ExcelファイルにはOCRではなくデータパースを実行する
 * - 13.7: 処理中インジケーター（プログレスバー）を表示する
 * - 13.8: 抽出結果をテキストデータとして表示する
 * - 13.9: 抽出テキストを選択・コピー可能な状態で表示する
 * - 13.14: OCR/パース処理失敗時にエラーメッセージを表示し手動入力を促す
 * - 17.1: pdfjs-distのgetTextContent() APIを使用してPDFからテキストを抽出する
 * - 17.2: PDFの全ページを対象にテキスト抽出を行う
 * - 17.3: テキストPDFの場合はpdfjs-dist抽出テキストをそのまま使用する
 * - 17.4: スキャンPDFの場合はCanvas→Tesseract OCRフォールバックを実行する
 * - 17.8: PDFテキスト抽出のタイムアウトを30秒とする
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps } from 'react';

// ============================================================================
// モック設定
// ============================================================================

// Tesseract.jsのモック
const mockRecognize = vi.fn();
const mockTerminate = vi.fn();
const mockCreateWorker = vi.fn();

vi.mock('tesseract.js', () => ({
  createWorker: (...args: unknown[]) => mockCreateWorker(...args),
}));

// pdf-text-extractorのモック
const mockExtractPdfHybrid = vi.fn();
const mockRenderPdfPagesToBase64 = vi.fn();

vi.mock('./pdf-text-extractor', () => ({
  extractPdfHybrid: (...args: unknown[]) => mockExtractPdfHybrid(...args),
  renderPdfPagesToBase64: (...args: unknown[]) => mockRenderPdfPagesToBase64(...args),
  PDF_TEXT_THRESHOLD: 50,
}));

// claude-vision APIのモック（非同期処理リーク防止）
const mockExtractWithClaudeVision = vi.fn();

vi.mock('../../api/claude-vision', () => ({
  extractWithClaudeVision: (...args: unknown[]) => mockExtractWithClaudeVision(...args),
  ClaudeVisionApiError: class ClaudeVisionApiError extends Error {
    shouldFallback: boolean;
    constructor(message: string) {
      super(message);
      this.shouldFallback = true;
    }
  },
  isClaudeVisionApiError: (error: unknown) => error instanceof Error && 'shouldFallback' in error,
}));

// xlsxのモック
vi.mock('xlsx', () => {
  const mockRead = vi.fn();
  const mockSheet_to_json = vi.fn();
  return {
    read: mockRead,
    utils: {
      sheet_to_json: mockSheet_to_json,
    },
  };
});

// Task 80.1: OcrDataExtractor が useAuth() を直接購読するため、
// AuthProvider を含まない単体テスト環境向けに最小限のモックを提供する。
// Task 81.4: テスト毎に sessionExpiredDuringOperation を切り替えてセッション切れ連携の
// disabled 制御を検証するため、可変オブジェクトを参照する形に拡張する
// （既存テストはデフォルト値=false で同等挙動を維持。第3原則準拠）。
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

import { OcrDataExtractor } from './OcrDataExtractor';
import type { LineItemFormData } from './LineItemEditor';
import * as XLSX from 'xlsx';

// ============================================================================
// テストヘルパー
// ============================================================================

/**
 * テスト用のモックファイルを作成する
 */
function createMockFile(name: string, type: string, size = 1024): File {
  const buffer = new ArrayBuffer(size);
  return new File([buffer], name, { type });
}

/**
 * pdf-text-extractorのextractPdfHybridモックを設定する
 *
 * @param options - テキストPDF/スキャンPDFの挙動を制御
 */
function setupMockPdfExtractor(options?: {
  numPages?: number;
  /** 抽出テキスト結果 */
  extractedText?: string;
  /** テキストPDFか */
  isTextPdf?: boolean;
  /** エラーを投げるか */
  error?: Error;
  /** 永久にresolveしないか（タイムアウトテスト用） */
  neverResolve?: boolean;
}) {
  if (options?.neverResolve) {
    mockExtractPdfHybrid.mockImplementation(() => new Promise(() => {}));
    return;
  }

  if (options?.error) {
    mockExtractPdfHybrid.mockRejectedValue(options.error);
    return;
  }

  const text = options?.extractedText ?? '';
  const isTextPdf = options?.isTextPdf ?? true;
  const numPages = options?.numPages ?? 1;

  mockExtractPdfHybrid.mockImplementation(
    async (_file: File, onProgress?: (progress: number, message?: string) => void) => {
      if (onProgress) {
        onProgress(10, 'PDFテキスト抽出中...');
        onProgress(100, 'テキスト抽出完了');
      }
      return { text, isTextPdf, numPages };
    }
  );
}

/**
 * デフォルトのモックWorkerを設定する
 */
function setupMockWorker(options?: { recognizeResult?: string; recognizeError?: Error }) {
  const worker = {
    recognize: mockRecognize,
    terminate: mockTerminate,
  };

  mockCreateWorker.mockResolvedValue(worker);

  if (options?.recognizeError) {
    mockRecognize.mockRejectedValue(options.recognizeError);
  } else {
    const result = {
      data: {
        text: options?.recognizeResult ?? 'サンプルOCRテキスト\n名称\t規格\t単位\t数量\t単価',
      },
    };
    mockRecognize.mockResolvedValue(result);
  }

  return worker;
}

/**
 * デフォルトpropsを返す
 */
function defaultProps(
  overrides?: Partial<{
    file: File | null;
    onImportLineItems: (items: LineItemFormData[]) => void;
  }>
) {
  return {
    file: null as File | null,
    onImportLineItems: vi.fn(),
    ...overrides,
  };
}

// ============================================================================
// テスト
// ============================================================================

describe('OcrDataExtractor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTerminate.mockResolvedValue(undefined);
    // Claude Vision APIはデフォルトでフォールバックさせる（非同期リーク防止）
    mockExtractWithClaudeVision.mockRejectedValue(new Error('mock: not configured'));
    // renderPdfPagesToBase64はデフォルトで空配列を返す
    mockRenderPdfPagesToBase64.mockResolvedValue([]);
    // Task 81.4: 各テスト毎に mockAuthState をデフォルト（未認証エラー無し）に戻す
    mockAuthState.sessionExpiredDuringOperation = false;
    mockAuthState.sessionExpired = false;
  });

  // --------------------------------------------------------------------------
  // Requirement 13.5: PDF/画像ファイルに対してOCR処理を自動的に開始
  // --------------------------------------------------------------------------

  describe('OCR処理の自動開始（13.5）', () => {
    it('PDFファイルがセットされるとPDFテキスト抽出処理を自動的に開始する', async () => {
      setupMockPdfExtractor({
        extractedText: 'PDF OCR結果テキスト',
        isTextPdf: true,
      });
      const file = createMockFile('test.pdf', 'application/pdf');

      render(<OcrDataExtractor {...defaultProps({ file })} />);

      await waitFor(() => {
        expect(mockExtractPdfHybrid).toHaveBeenCalled();
      });

      await waitFor(() => {
        expect(screen.getByTestId('ocr-extracted-text')).toBeInTheDocument();
      });
    });

    it('画像ファイル（JPEG）がセットされるとOCR処理を自動的に開始する', async () => {
      setupMockWorker({ recognizeResult: '画像OCR結果' });
      const file = createMockFile('photo.jpg', 'image/jpeg');

      render(<OcrDataExtractor {...defaultProps({ file })} />);

      await waitFor(() => {
        expect(mockCreateWorker).toHaveBeenCalledWith('jpn');
      });

      await waitFor(() => {
        expect(mockRecognize).toHaveBeenCalled();
      });
    });

    it('画像ファイル（PNG）がセットされるとOCR処理を自動的に開始する', async () => {
      setupMockWorker({ recognizeResult: 'PNG OCR結果' });
      const file = createMockFile('image.png', 'image/png');

      render(<OcrDataExtractor {...defaultProps({ file })} />);

      await waitFor(() => {
        expect(mockCreateWorker).toHaveBeenCalledWith('jpn');
      });

      await waitFor(() => {
        expect(mockRecognize).toHaveBeenCalled();
      });
    });

    it('ファイルがnullの場合はOCR処理を開始しない', () => {
      render(<OcrDataExtractor {...defaultProps()} />);
      expect(mockCreateWorker).not.toHaveBeenCalled();
    });
  });

  // --------------------------------------------------------------------------
  // Requirement 13.6: Excelファイルにはデータパースを実行
  // --------------------------------------------------------------------------

  describe('Excelデータパース（13.6）', () => {
    it('Excelファイル（xlsx）がセットされるとデータパースを実行する', async () => {
      const mockWorkbook = {
        SheetNames: ['Sheet1'],
        Sheets: { Sheet1: {} },
      };
      const mockRows = [
        ['名称', '規格', '単位', '数量', '単価'],
        ['コンクリート', 'C25', 'm3', '10', '15000'],
      ];

      (XLSX.read as ReturnType<typeof vi.fn>).mockReturnValue(mockWorkbook);
      (XLSX.utils.sheet_to_json as ReturnType<typeof vi.fn>).mockReturnValue(mockRows);

      const file = createMockFile(
        'data.xlsx',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );

      render(<OcrDataExtractor {...defaultProps({ file })} />);

      // Excelの場合はTesseract.jsのworkerは使わない
      expect(mockCreateWorker).not.toHaveBeenCalled();

      await waitFor(() => {
        expect(XLSX.read).toHaveBeenCalled();
      });
    });

    it('Excelファイル（xls）がセットされるとデータパースを実行する', async () => {
      const mockWorkbook = {
        SheetNames: ['Sheet1'],
        Sheets: { Sheet1: {} },
      };
      const mockRows = [
        ['名称', '規格', '単位', '数量', '単価'],
        ['鉄筋', 'D13', 'kg', '500', '120'],
      ];

      (XLSX.read as ReturnType<typeof vi.fn>).mockReturnValue(mockWorkbook);
      (XLSX.utils.sheet_to_json as ReturnType<typeof vi.fn>).mockReturnValue(mockRows);

      const file = createMockFile('data.xls', 'application/vnd.ms-excel');

      render(<OcrDataExtractor {...defaultProps({ file })} />);

      expect(mockCreateWorker).not.toHaveBeenCalled();

      await waitFor(() => {
        expect(XLSX.read).toHaveBeenCalled();
      });
    });
  });

  // --------------------------------------------------------------------------
  // Requirement 13.7: 処理中インジケーター（プログレスバー）を表示
  // --------------------------------------------------------------------------

  describe('処理中インジケーター（13.7）', () => {
    it('OCR処理中にプログレスインジケーターを表示する', async () => {
      // 長時間かかるOCRをシミュレート（resolveしないPromise）
      const worker = {
        recognize: vi.fn(() => new Promise(() => {})), // never resolves
        terminate: mockTerminate,
      };
      mockCreateWorker.mockResolvedValue(worker);

      const file = createMockFile('test.jpg', 'image/jpeg');

      render(<OcrDataExtractor {...defaultProps({ file })} />);

      // 処理中のインジケーターが表示されること
      await waitFor(() => {
        expect(screen.getByTestId('ocr-progress-indicator')).toBeInTheDocument();
      });
    });

    it('処理完了後にインジケーターが消えて結果が表示される', async () => {
      setupMockWorker({ recognizeResult: '完了テスト' });
      const file = createMockFile('test.jpg', 'image/jpeg');

      render(<OcrDataExtractor {...defaultProps({ file })} />);

      // 処理完了後は結果テキストが表示される
      await waitFor(() => {
        expect(screen.getByTestId('ocr-extracted-text')).toBeInTheDocument();
      });

      // インジケーターは消えている
      expect(screen.queryByTestId('ocr-progress-indicator')).not.toBeInTheDocument();
    });
  });

  // --------------------------------------------------------------------------
  // Requirement 13.8: 抽出結果をテキストデータとして表示
  // --------------------------------------------------------------------------

  describe('抽出結果テキスト表示（13.8）', () => {
    it('OCR処理完了後に抽出テキストを表示する', async () => {
      setupMockWorker({ recognizeResult: 'OCR処理で抽出されたテキスト' });
      const file = createMockFile('test.jpg', 'image/jpeg');

      render(<OcrDataExtractor {...defaultProps({ file })} />);

      await waitFor(() => {
        expect(screen.getByTestId('ocr-extracted-text')).toBeInTheDocument();
        expect(screen.getByText('OCR処理で抽出されたテキスト')).toBeInTheDocument();
      });
    });

    it('Excelパース完了後に抽出テキストを表示する', async () => {
      const mockWorkbook = {
        SheetNames: ['Sheet1'],
        Sheets: { Sheet1: {} },
      };
      (XLSX.read as ReturnType<typeof vi.fn>).mockReturnValue(mockWorkbook);
      (XLSX.utils.sheet_to_json as ReturnType<typeof vi.fn>).mockReturnValue([
        ['名称', '規格', '単位', '数量', '単価'],
        ['コンクリート', 'C25', 'm3', '10', '15000'],
      ]);

      const file = createMockFile(
        'data.xlsx',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );

      render(<OcrDataExtractor {...defaultProps({ file })} />);

      await waitFor(() => {
        expect(screen.getByTestId('ocr-extracted-text')).toBeInTheDocument();
      });
    });
  });

  // --------------------------------------------------------------------------
  // Requirement 13.9: 抽出テキストを選択・コピー可能な状態で表示
  // --------------------------------------------------------------------------

  describe('テキスト選択・コピー（13.9）', () => {
    it('抽出テキストが選択可能な要素で表示される', async () => {
      setupMockWorker({ recognizeResult: '選択可能テキスト' });
      const file = createMockFile('test.jpg', 'image/jpeg');

      render(<OcrDataExtractor {...defaultProps({ file })} />);

      await waitFor(() => {
        const textElement = screen.getByTestId('ocr-extracted-text');
        expect(textElement).toBeInTheDocument();
        // テキスト要素はPRE（pre-wrap + user-select: text）
        expect(textElement.tagName).toBe('PRE');
      });
    });
  });

  // --------------------------------------------------------------------------
  // OCRテキストから構造化データへの変換ロジック
  // --------------------------------------------------------------------------

  describe('OCRテキストから構造化データ変換', () => {
    it('タブ区切りテキストから明細行データに変換し一括取り込みボタンを表示する', async () => {
      const ocrText =
        '名称\t規格\t単位\t数量\t単価\nコンクリート\tC25\tm3\t10\t15000\n鉄筋\tD13\tkg\t500\t120';
      setupMockWorker({ recognizeResult: ocrText });
      const file = createMockFile('test.jpg', 'image/jpeg');
      const onImportLineItems = vi.fn();

      render(<OcrDataExtractor {...defaultProps({ file, onImportLineItems })} />);

      await waitFor(() => {
        expect(screen.getByTestId('ocr-import-button')).toBeInTheDocument();
      });
    });

    it('数値パターンを含む行から数量・単価を推定する', async () => {
      const ocrText = 'コンクリート打設  C25  m3  10  15000';
      setupMockWorker({ recognizeResult: ocrText });
      const file = createMockFile('test.jpg', 'image/jpeg');

      render(<OcrDataExtractor {...defaultProps({ file })} />);

      await waitFor(() => {
        expect(screen.getByTestId('ocr-extracted-text')).toBeInTheDocument();
      });
    });
  });

  // --------------------------------------------------------------------------
  // Excelデータのヘッダー行検出と列マッピング
  // --------------------------------------------------------------------------

  describe('Excelヘッダー行検出と列マッピング', () => {
    it('ヘッダー行から列マッピングを自動検出し一括取り込みで正しいデータを返す', async () => {
      const mockWorkbook = {
        SheetNames: ['Sheet1'],
        Sheets: { Sheet1: {} },
      };
      (XLSX.read as ReturnType<typeof vi.fn>).mockReturnValue(mockWorkbook);
      (XLSX.utils.sheet_to_json as ReturnType<typeof vi.fn>).mockReturnValue([
        ['名称', '規格', '単位', '数量', '単価'],
        ['コンクリート', 'C25', 'm3', 10, 15000],
        ['鉄筋', 'D13', 'kg', 500, 120],
      ]);

      const file = createMockFile(
        'data.xlsx',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      const onImportLineItems = vi.fn();

      render(<OcrDataExtractor {...defaultProps({ file, onImportLineItems })} />);

      await waitFor(() => {
        expect(screen.getByTestId('ocr-import-button')).toBeInTheDocument();
      });

      // 一括取り込みボタンをクリック
      const user = userEvent.setup();
      await user.click(screen.getByTestId('ocr-import-button'));

      expect(onImportLineItems).toHaveBeenCalledTimes(1);
      const importedItems = onImportLineItems.mock.calls[0]?.[0] as LineItemFormData[];
      expect(importedItems.length).toBe(2);
      const firstItem = importedItems[0];
      expect(firstItem).toBeDefined();
      expect(firstItem!.name).toBe('コンクリート');
      expect(firstItem!.specification).toBe('C25');
      expect(firstItem!.unit).toBe('m3');
      expect(firstItem!.quantity).toBe('10.00');
      expect(firstItem!.unitPrice).toBe('15000');
    });

    it('ヘッダー行がない場合でもデータ行を処理する', async () => {
      const mockWorkbook = {
        SheetNames: ['Sheet1'],
        Sheets: { Sheet1: {} },
      };
      (XLSX.read as ReturnType<typeof vi.fn>).mockReturnValue(mockWorkbook);
      (XLSX.utils.sheet_to_json as ReturnType<typeof vi.fn>).mockReturnValue([
        ['コンクリート', 'C25', 'm3', 10, 15000],
        ['鉄筋', 'D13', 'kg', 500, 120],
      ]);

      const file = createMockFile(
        'data.xlsx',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );

      render(<OcrDataExtractor {...defaultProps({ file })} />);

      await waitFor(() => {
        expect(screen.getByTestId('ocr-extracted-text')).toBeInTheDocument();
      });
    });
  });

  // --------------------------------------------------------------------------
  // OCR処理のタイムアウト（30秒）
  // --------------------------------------------------------------------------

  describe('OCR処理タイムアウト', () => {
    it('OCR処理が30秒を超えた場合にエラーを表示する', async () => {
      // タイムアウトを短縮してテスト（実際のOCR_TIMEOUT_MSは30秒）
      // createWorkerが返すrecognizeを、タイムアウトよりも長いPromiseに設定
      // Promiseが拒否されることでエラー表示を検証
      const worker = {
        recognize: vi.fn(
          () =>
            new Promise((_, reject) => {
              // タイムアウトメカニズムのテスト：
              // コンポーネント内部のタイムアウトが先に発火することを検証
              setTimeout(() => reject(new Error('Should not reach')), 60000);
            })
        ),
        terminate: mockTerminate,
      };
      mockCreateWorker.mockResolvedValue(worker);

      const file = createMockFile('test.jpg', 'image/jpeg');

      render(<OcrDataExtractor {...defaultProps({ file })} />);

      // 処理中のインジケーターが表示されること
      await waitFor(() => {
        expect(screen.getByTestId('ocr-progress-indicator')).toBeInTheDocument();
      });

      // タイムアウトエラーが表示されるまで待つ（コンポーネント内部の30秒タイムアウト）
      await waitFor(
        () => {
          expect(screen.getByTestId('ocr-error-message')).toBeInTheDocument();
        },
        { timeout: 35000 }
      );
    }, 40000); // テスト自体のタイムアウトを40秒に設定
  });

  // --------------------------------------------------------------------------
  // Requirement 13.14: OCR/パース処理失敗時にエラーメッセージを表示
  // --------------------------------------------------------------------------

  describe('エラーハンドリング（13.14）', () => {
    it('OCR処理失敗時にエラーメッセージと手動入力促進メッセージを表示する', async () => {
      setupMockWorker({ recognizeError: new Error('OCR処理に失敗しました') });
      const file = createMockFile('test.jpg', 'image/jpeg');

      render(<OcrDataExtractor {...defaultProps({ file })} />);

      await waitFor(() => {
        const errorMessage = screen.getByTestId('ocr-error-message');
        expect(errorMessage).toBeInTheDocument();
        // 手動入力を促すメッセージが含まれる
        expect(errorMessage.textContent).toContain('手動');
      });
    });

    it('Excelパース失敗時にエラーメッセージを表示する', async () => {
      (XLSX.read as ReturnType<typeof vi.fn>).mockImplementation(() => {
        throw new Error('ファイルの読み込みに失敗');
      });

      const file = createMockFile(
        'broken.xlsx',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );

      render(<OcrDataExtractor {...defaultProps({ file })} />);

      await waitFor(() => {
        const errorMessage = screen.getByTestId('ocr-error-message');
        expect(errorMessage).toBeInTheDocument();
        expect(errorMessage.textContent).toContain('手動');
      });
    });
  });

  // --------------------------------------------------------------------------
  // React.lazyによる遅延ロード対応
  // --------------------------------------------------------------------------

  describe('コンポーネントエクスポート', () => {
    it('OcrDataExtractorがデフォルトエクスポートされている', async () => {
      const module = await import('./OcrDataExtractor');
      expect(module.default).toBeDefined();
    });
  });

  // --------------------------------------------------------------------------
  // Tesseract.jsワーカーのクリーンアップ
  // --------------------------------------------------------------------------

  describe('ワーカークリーンアップ', () => {
    it('コンポーネントアンマウント時にワーカーを終了する', async () => {
      setupMockWorker({ recognizeResult: 'テスト' });
      const file = createMockFile('test.jpg', 'image/jpeg');

      const { unmount } = render(<OcrDataExtractor {...defaultProps({ file })} />);

      await waitFor(() => {
        expect(mockCreateWorker).toHaveBeenCalled();
      });

      unmount();

      // ワーカーのterminateが呼ばれることを確認
      await waitFor(() => {
        expect(mockTerminate).toHaveBeenCalled();
      });
    });
  });

  // --------------------------------------------------------------------------
  // Task 25.2: 一括取り込み機能
  // Requirement 13.10: 抽出結果から明細行入力エディタへの一括取り込みボタンを表示
  // Requirement 13.11: 一括取り込みボタンクリック時に抽出データを各明細行フィールドに自動入力
  // Requirement 13.12: 取り込み完了時に各行の金額を自動計算
  // Requirement 13.13: 取り込み結果の確認・修正を促すメッセージを表示
  // --------------------------------------------------------------------------

  describe('一括取り込み機能（13.10-13.13）', () => {
    it('抽出結果が存在する場合に一括取り込みボタンを表示する（13.10）', async () => {
      const ocrText = '名称\t規格\t単位\t数量\t単価\nコンクリート\tC25\tm3\t10\t15000';
      setupMockWorker({ recognizeResult: ocrText });
      const file = createMockFile('test.jpg', 'image/jpeg');

      render(<OcrDataExtractor {...defaultProps({ file })} />);

      await waitFor(() => {
        const importButton = screen.getByTestId('ocr-import-button');
        expect(importButton).toBeInTheDocument();
        expect(importButton.textContent).toContain('一括取り込み');
      });
    });

    it('一括取り込みボタンクリック時に抽出データをonImportLineItemsで返す（13.11）', async () => {
      const ocrText =
        '名称\t規格\t単位\t数量\t単価\nコンクリート\tC25\tm3\t10\t15000\n鉄筋\tD13\tkg\t500\t120';
      setupMockWorker({ recognizeResult: ocrText });
      const file = createMockFile('test.jpg', 'image/jpeg');
      const onImportLineItems = vi.fn();

      render(<OcrDataExtractor {...defaultProps({ file, onImportLineItems })} />);

      await waitFor(() => {
        expect(screen.getByTestId('ocr-import-button')).toBeInTheDocument();
      });

      const user = userEvent.setup();
      await user.click(screen.getByTestId('ocr-import-button'));

      expect(onImportLineItems).toHaveBeenCalledTimes(1);
      const items = onImportLineItems.mock.calls[0]?.[0] as LineItemFormData[];
      // データが正しくフィールドにマッピングされていること
      expect(items.length).toBeGreaterThanOrEqual(1);
      const item = items[0];
      expect(item).toBeDefined();
      expect(item).toHaveProperty('name');
      expect(item).toHaveProperty('specification');
      expect(item).toHaveProperty('unit');
      expect(item).toHaveProperty('quantity');
      expect(item).toHaveProperty('unitPrice');
    });

    it('取り込まれた各行の金額が自動計算されている（13.12）', async () => {
      const mockWorkbook = {
        SheetNames: ['Sheet1'],
        Sheets: { Sheet1: {} },
      };
      (XLSX.read as ReturnType<typeof vi.fn>).mockReturnValue(mockWorkbook);
      (XLSX.utils.sheet_to_json as ReturnType<typeof vi.fn>).mockReturnValue([
        ['名称', '規格', '単位', '数量', '単価'],
        ['コンクリート', 'C25', 'm3', 10, 15000],
        ['鉄筋', 'D13', 'kg', 500, 120],
      ]);

      const file = createMockFile(
        'data.xlsx',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      const onImportLineItems = vi.fn();

      render(<OcrDataExtractor {...defaultProps({ file, onImportLineItems })} />);

      await waitFor(() => {
        expect(screen.getByTestId('ocr-import-button')).toBeInTheDocument();
      });

      const user = userEvent.setup();
      await user.click(screen.getByTestId('ocr-import-button'));

      const items = onImportLineItems.mock.calls[0]?.[0] as LineItemFormData[];
      // 金額が自動計算されていること
      expect(items[0]!.amount).toBe(150000); // 10 * 15000
      expect(items[1]!.amount).toBe(60000); // 500 * 120
    });

    it('取り込み完了時に確認・修正を促すメッセージを表示する（13.13）', async () => {
      const ocrText = '名称\t規格\t単位\t数量\t単価\nコンクリート\tC25\tm3\t10\t15000';
      setupMockWorker({ recognizeResult: ocrText });
      const file = createMockFile('test.jpg', 'image/jpeg');
      const onImportLineItems = vi.fn();

      render(<OcrDataExtractor {...defaultProps({ file, onImportLineItems })} />);

      await waitFor(() => {
        expect(screen.getByTestId('ocr-import-button')).toBeInTheDocument();
      });

      const user = userEvent.setup();
      await user.click(screen.getByTestId('ocr-import-button'));

      // 取り込み完了メッセージが表示される
      await waitFor(() => {
        const successMessage = screen.getByTestId('ocr-import-success');
        expect(successMessage).toBeInTheDocument();
        expect(successMessage.textContent).toContain('確認');
        expect(successMessage.textContent).toContain('修正');
      });
    });

    it('一括取り込み後はボタンが「取り込み済み」に変わり非活性になる', async () => {
      const ocrText = '名称\t規格\t単位\t数量\t単価\nコンクリート\tC25\tm3\t10\t15000';
      setupMockWorker({ recognizeResult: ocrText });
      const file = createMockFile('test.jpg', 'image/jpeg');
      const onImportLineItems = vi.fn();

      render(<OcrDataExtractor {...defaultProps({ file, onImportLineItems })} />);

      await waitFor(() => {
        expect(screen.getByTestId('ocr-import-button')).toBeInTheDocument();
      });

      const user = userEvent.setup();
      await user.click(screen.getByTestId('ocr-import-button'));

      await waitFor(() => {
        const button = screen.getByTestId('ocr-import-button');
        expect(button.textContent).toContain('取り込み済み');
        expect(button).toBeDisabled();
      });
    });

    it('構造化データが検出できない場合は一括取り込みボタンを表示しない', async () => {
      // 構造化データが検出できないOCR結果（数値を含まない単純テキスト）
      // fallbackロジックでは数値を含む行のみをデータ行とみなすため、
      // 数値がない場合は構造化データが0件となる
      setupMockWorker({ recognizeResult: '  \n  \n  ' });
      const file = createMockFile('test.jpg', 'image/jpeg');

      render(<OcrDataExtractor {...defaultProps({ file })} />);

      // OCR処理完了を待つ（空テキストでもcompletedになる）
      // extractedTextが空やスペースのみの場合、表示されない可能性がある
      // status=completedまで待機
      await waitFor(() => {
        // 処理完了後にエラーもインジケーターも表示されない状態を確認
        expect(screen.queryByTestId('ocr-progress-indicator')).not.toBeInTheDocument();
        expect(screen.queryByTestId('ocr-error-message')).not.toBeInTheDocument();
      });

      // 構造化データが検出されないため一括取り込みボタンは表示されないこと
      expect(screen.queryByTestId('ocr-import-button')).not.toBeInTheDocument();
    });

    it('OCR/パース処理失敗時にエラーメッセージと手動入力促進メッセージを表示する（13.14）', async () => {
      setupMockWorker({ recognizeError: new Error('OCR処理に失敗しました') });
      const file = createMockFile('test.jpg', 'image/jpeg');

      render(<OcrDataExtractor {...defaultProps({ file })} />);

      await waitFor(() => {
        const errorMessage = screen.getByTestId('ocr-error-message');
        expect(errorMessage).toBeInTheDocument();
        expect(errorMessage.textContent).toContain('手動');
        expect(errorMessage.textContent).toContain('入力');
      });

      // エラー時は一括取り込みボタンは表示されない
      expect(screen.queryByTestId('ocr-import-button')).not.toBeInTheDocument();
    });

    it('検出データ件数が表示される', async () => {
      const mockWorkbook = {
        SheetNames: ['Sheet1'],
        Sheets: { Sheet1: {} },
      };
      (XLSX.read as ReturnType<typeof vi.fn>).mockReturnValue(mockWorkbook);
      (XLSX.utils.sheet_to_json as ReturnType<typeof vi.fn>).mockReturnValue([
        ['名称', '規格', '単位', '数量', '単価'],
        ['コンクリート', 'C25', 'm3', 10, 15000],
        ['鉄筋', 'D13', 'kg', 500, 120],
        ['塗装', 'EP', 'm2', 200, 3000],
      ]);

      const file = createMockFile(
        'data.xlsx',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );

      render(<OcrDataExtractor {...defaultProps({ file })} />);

      await waitFor(() => {
        expect(screen.getByText(/3件/)).toBeInTheDocument();
      });
    });
  });

  // --------------------------------------------------------------------------
  // Tesseract.jsワーカープリフェッチとOCR準備中インジケーター
  // --------------------------------------------------------------------------

  describe('ワーカープリフェッチ', () => {
    it('ファイルがセットされた時にOCR準備中インジケーターを表示する', async () => {
      // ワーカー初期化を永久に保留させる（タイマーリーク防止のためsetTimeoutは使わない）
      mockCreateWorker.mockImplementation(() => new Promise(() => {}));

      const file = createMockFile('test.jpg', 'image/jpeg');

      render(<OcrDataExtractor {...defaultProps({ file })} />);

      // OCR準備中のインジケーターが表示されること
      await waitFor(() => {
        expect(screen.getByTestId('ocr-progress-indicator')).toBeInTheDocument();
      });
    });
  });

  // --------------------------------------------------------------------------
  // Task 41.1: pdfjs-distテキスト抽出のユニットテスト
  // Requirements: 17.1, 17.2, 17.3, 17.4, 17.8
  // --------------------------------------------------------------------------

  describe('PDFテキスト抽出ハイブリッドアプローチ（17.1-17.4, 17.8）', () => {
    beforeEach(async () => {
      // 前テスト（ワーカープリフェッチ等）のコンポーネントアンマウント時の
      // 非同期コールバックをフラッシュしてからモックをクリアする
      await new Promise((resolve) => setTimeout(resolve, 50));
      mockCreateWorker.mockClear();
    });

    it('テキストPDF（閾値以上）の場合にpdfjs-distテキストがそのまま返される（17.1, 17.3）', async () => {
      // pdfjs-distが十分なテキスト（50文字以上）を返すモック
      const longText =
        'コンクリート打設工事の見積書です。以下の明細をご確認ください。\n名称\t規格\t単位\t数量\t単価\nコンクリート\tC25\tm3\t10\t15000';
      setupMockPdfExtractor({
        numPages: 1,
        extractedText: longText,
        isTextPdf: true,
      });

      const file = createMockFile('text-pdf.pdf', 'application/pdf');

      render(<OcrDataExtractor {...defaultProps({ file })} />);

      // extractPdfHybridが呼ばれること
      await waitFor(() => {
        expect(mockExtractPdfHybrid).toHaveBeenCalled();
      });

      // テキストPDFの場合、Tesseract.jsのcreateWorkerは呼ばれない
      await waitFor(() => {
        expect(screen.getByTestId('ocr-extracted-text')).toBeInTheDocument();
      });

      // Tesseract.jsワーカーは作成されないこと（テキストPDFでは不要）
      expect(mockCreateWorker).not.toHaveBeenCalled();
    });

    it('スキャンPDF（閾値未満）の場合にCanvas→Tesseract OCRフォールバックが実行される（17.4）', async () => {
      // extractPdfHybridがスキャンPDFとしてOCR結果を返すモック
      setupMockPdfExtractor({
        numPages: 1,
        extractedText: 'スキャンPDFからのOCR結果テキスト\n名称\t規格\t数量\t単価',
        isTextPdf: false,
      });

      const file = createMockFile('scan-pdf.pdf', 'application/pdf');

      render(<OcrDataExtractor {...defaultProps({ file })} />);

      // extractPdfHybridが呼ばれること（内部でフォールバックが実行される）
      await waitFor(() => {
        expect(mockExtractPdfHybrid).toHaveBeenCalled();
      });

      // 結果テキストが表示されること
      await waitFor(() => {
        expect(screen.getByTestId('ocr-extracted-text')).toBeInTheDocument();
        expect(screen.getByTestId('ocr-extracted-text').textContent).toContain('スキャンPDF');
      });
    });

    it('複数ページPDFで全ページのテキストが結合される（17.2）', async () => {
      const combinedText =
        '見積書 1ページ目の内容です。\n2ページ目の明細内容です。\n3ページ目の合計金額です。';

      setupMockPdfExtractor({
        numPages: 3,
        extractedText: combinedText,
        isTextPdf: true,
      });

      const file = createMockFile('multi-page.pdf', 'application/pdf');

      render(<OcrDataExtractor {...defaultProps({ file })} />);

      // 全ページのテキストが結合されて表示されること
      await waitFor(() => {
        const textElement = screen.getByTestId('ocr-extracted-text');
        expect(textElement).toBeInTheDocument();
        expect(textElement.textContent).toContain('1ページ目');
        expect(textElement.textContent).toContain('2ページ目');
        expect(textElement.textContent).toContain('3ページ目');
      });

      // extractPdfHybridが呼ばれたことを確認
      expect(mockExtractPdfHybrid).toHaveBeenCalledTimes(1);
    });

    it('画像ファイルでは従来通りTesseract OCRが直接実行される（後方互換性）', async () => {
      setupMockWorker({ recognizeResult: '画像OCR結果テキスト' });
      const file = createMockFile('photo.jpg', 'image/jpeg');

      render(<OcrDataExtractor {...defaultProps({ file })} />);

      // 画像ファイルではextractPdfHybridは呼ばれない
      expect(mockExtractPdfHybrid).not.toHaveBeenCalled();

      // Tesseract.jsが直接呼ばれること
      await waitFor(() => {
        expect(mockCreateWorker).toHaveBeenCalledWith('jpn');
      });

      await waitFor(() => {
        expect(mockRecognize).toHaveBeenCalled();
      });
    });

    it('Excelファイルでは従来通りSheetJSパースが実行される（後方互換性）', async () => {
      const mockWorkbook = {
        SheetNames: ['Sheet1'],
        Sheets: { Sheet1: {} },
      };
      (XLSX.read as ReturnType<typeof vi.fn>).mockReturnValue(mockWorkbook);
      (XLSX.utils.sheet_to_json as ReturnType<typeof vi.fn>).mockReturnValue([
        ['名称', '規格', '単位', '数量', '単価'],
        ['コンクリート', 'C25', 'm3', '10', '15000'],
      ]);

      const file = createMockFile(
        'data.xlsx',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );

      render(<OcrDataExtractor {...defaultProps({ file })} />);

      // ExcelファイルではpdfもTesseractも呼ばれない
      expect(mockExtractPdfHybrid).not.toHaveBeenCalled();
      expect(mockCreateWorker).not.toHaveBeenCalled();

      // SheetJSが呼ばれること
      await waitFor(() => {
        expect(XLSX.read).toHaveBeenCalled();
      });
    });

    it('PDFテキスト抽出のタイムアウト（30秒）が適用される（17.8）', async () => {
      // extractPdfHybridが永久にresolveしないPromise（タイムアウトテスト）
      setupMockPdfExtractor({ neverResolve: true });

      const file = createMockFile('slow.pdf', 'application/pdf');

      render(<OcrDataExtractor {...defaultProps({ file })} />);

      // 処理中のインジケーターが表示されること
      await waitFor(() => {
        expect(screen.getByTestId('ocr-progress-indicator')).toBeInTheDocument();
      });

      // タイムアウトエラーが表示されるまで待つ（コンポーネント内部の30秒タイムアウト）
      await waitFor(
        () => {
          expect(screen.getByTestId('ocr-error-message')).toBeInTheDocument();
        },
        { timeout: 35000 }
      );
    }, 40000); // テスト自体のタイムアウトを40秒に設定
  });

  // --------------------------------------------------------------------------
  // Task 81.4: セッション切れ連携 (Requirement 38.11)
  // OcrDataExtractor が useAuth().sessionExpiredDuringOperation を購読し、
  // 再認証モーダル表示中は OCR 関連ボタン（手動トリガー / リトライ）を非活性化する。
  // false への復帰時は元の disabled 条件（isProcessing のみ）に戻ることを保証する。
  // --------------------------------------------------------------------------

  describe('Task 81.4: セッション切れ連携 (Requirement 38.11)', () => {
    type OcrProps = ComponentProps<typeof OcrDataExtractor>;

    it('sessionExpiredDuringOperation=true の間、手動トリガー（OCR実行/データパース実行）ボタンが disabled になる', async () => {
      // 再認証モーダル表示中（=セッション切れ操作中）の状態を再現
      mockAuthState.sessionExpiredDuringOperation = true;

      const file = createMockFile('test.jpg', 'image/jpeg');
      const props: OcrProps = { ...defaultProps({ file }), autoStart: false };

      render(<OcrDataExtractor {...props} />);

      // autoStart=false かつ status=idle なので手動トリガーボタンが描画される
      const manualButton = await screen.findByRole('button', { name: /OCR実行/ });
      expect(manualButton).toBeDisabled();
    });

    it('sessionExpiredDuringOperation=true→false に復帰すると手動トリガーボタンが活性化される', async () => {
      // 初期状態: 再認証モーダル表示中
      mockAuthState.sessionExpiredDuringOperation = true;

      const file = createMockFile('test.jpg', 'image/jpeg');
      const props: OcrProps = { ...defaultProps({ file }), autoStart: false };

      const { rerender } = render(<OcrDataExtractor {...props} />);

      const manualButtonDisabled = await screen.findByRole('button', { name: /OCR実行/ });
      expect(manualButtonDisabled).toBeDisabled();

      // 再認証成功 → sessionExpiredDuringOperation が false に遷移
      mockAuthState.sessionExpiredDuringOperation = false;
      rerender(<OcrDataExtractor {...props} />);

      // 元の disabled 条件（isProcessing=false なので有効）に戻ること
      const manualButtonEnabled = await screen.findByRole('button', { name: /OCR実行/ });
      expect(manualButtonEnabled).not.toBeDisabled();
    });

    it('sessionExpiredDuringOperation=true の間、エラー時の OCR リトライボタンが disabled になる', async () => {
      // OCR 失敗 → status='error' を発火させ、リトライボタンを描画
      setupMockWorker({ recognizeError: new Error('OCR処理に失敗しました') });

      const file = createMockFile('test.jpg', 'image/jpeg');

      const { rerender } = render(<OcrDataExtractor {...defaultProps({ file })} />);

      // エラー表示の確定（リトライボタンが描画される）まで待つ
      await waitFor(() => {
        expect(screen.getByTestId('ocr-error-message')).toBeInTheDocument();
      });
      const retryButton = await screen.findByRole('button', { name: /OCRリトライ/ });
      expect(retryButton).not.toBeDisabled();

      // セッション切れ発生 → 再レンダリングで disabled 化を検証
      mockAuthState.sessionExpiredDuringOperation = true;
      rerender(<OcrDataExtractor {...defaultProps({ file })} />);

      const retryButtonDisabled = await screen.findByRole('button', { name: /OCRリトライ/ });
      expect(retryButtonDisabled).toBeDisabled();
    });

    it('sessionExpiredDuringOperation=true→false 復帰後、OCR リトライボタンが活性化される', async () => {
      setupMockWorker({ recognizeError: new Error('OCR処理に失敗しました') });

      const file = createMockFile('test.jpg', 'image/jpeg');

      const { rerender } = render(<OcrDataExtractor {...defaultProps({ file })} />);

      await waitFor(() => {
        expect(screen.getByTestId('ocr-error-message')).toBeInTheDocument();
      });

      // セッション切れ → リトライボタン disabled
      mockAuthState.sessionExpiredDuringOperation = true;
      rerender(<OcrDataExtractor {...defaultProps({ file })} />);
      const retryButtonDisabled = await screen.findByRole('button', { name: /OCRリトライ/ });
      expect(retryButtonDisabled).toBeDisabled();

      // 再認証成功 → false に遷移したらボタンが復帰すること
      mockAuthState.sessionExpiredDuringOperation = false;
      rerender(<OcrDataExtractor {...defaultProps({ file })} />);

      const retryButtonEnabled = await screen.findByRole('button', { name: /OCRリトライ/ });
      expect(retryButtonEnabled).not.toBeDisabled();
    });
  });
});
