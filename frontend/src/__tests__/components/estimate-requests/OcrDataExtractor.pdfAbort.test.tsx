/**
 * @fileoverview OcrDataExtractor の PDF 経路の中断（Task 96.1）
 *
 * PDF 経路（`processPdfHybrid`）の Tesseract.js フォールバックが、時間切れ（30秒）と
 * アンマウントのときに `extractPdfHybrid` へ渡した中断のシグナルを中断し、
 * `extractPdfWithOcrFallback` の中で作られたワーカーが終了されることを確かめる。
 *
 * `extractPdfHybrid` は本物を使い（呼び出しの観測のため包むだけ）、pdfjs-dist と
 * tesseract.js をモックする。Claude Vision の経路は失敗させてフォールバックへ進める。
 *
 * Requirements:
 * - 17.8: PDFテキスト抽出のタイムアウトを既存OCRと同じ30秒とする
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// ============================================================================
// モック設定
// ============================================================================

const {
  mockGetDocument,
  mockGetPage,
  mockCreateWorker,
  mockRecognize,
  mockTerminate,
  mockExtractWithClaudeVision,
  extractPdfHybridSpy,
} = vi.hoisted(() => ({
  mockGetDocument: vi.fn(),
  mockGetPage: vi.fn(),
  mockCreateWorker: vi.fn(),
  mockRecognize: vi.fn(),
  mockTerminate: vi.fn(),
  mockExtractWithClaudeVision: vi.fn(),
  extractPdfHybridSpy: vi.fn(),
}));

vi.mock('pdfjs-dist', () => ({
  getDocument: mockGetDocument,
}));

vi.mock('../../../components/estimate-requests/pdf-worker-config', () => ({}));

vi.mock('tesseract.js', () => ({
  createWorker: mockCreateWorker,
}));

// extractPdfHybrid は本物を呼び、渡された引数（中断のシグナル）を観測する。
// Claude Vision 用の画像化は失敗させ、Tesseract.js のフォールバックへ進める
vi.mock('../../../components/estimate-requests/pdf-text-extractor', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('../../../components/estimate-requests/pdf-text-extractor')
    >();
  extractPdfHybridSpy.mockImplementation(actual.extractPdfHybrid);
  return {
    ...actual,
    extractPdfHybrid: extractPdfHybridSpy,
    renderPdfPagesToBase64: vi.fn().mockRejectedValue(new Error('mock: base64 変換失敗')),
  };
});

vi.mock('../../../api/claude-vision', () => ({
  extractWithClaudeVision: mockExtractWithClaudeVision,
  ClaudeVisionApiError: class ClaudeVisionApiError extends Error {},
  isClaudeVisionApiError: () => false,
}));

vi.mock('xlsx', () => ({
  read: vi.fn(),
  utils: { sheet_to_json: vi.fn() },
}));

vi.mock('../../../hooks/useAuth', () => ({
  useAuth: () => ({
    sessionExpiredDuringOperation: false,
    sessionExpired: false,
  }),
}));

import { OcrDataExtractor } from '../../../components/estimate-requests/OcrDataExtractor';

// ============================================================================
// テストヘルパー
// ============================================================================

/** File.arrayBuffer() を備えたスキャン PDF のモックファイル */
function createPdfFile(): File {
  const file = new File(['%PDF-1.4'], 'scan.pdf', { type: 'application/pdf' });
  file.arrayBuffer = vi.fn().mockResolvedValue(new ArrayBuffer(8));
  return file;
}

/**
 * スキャン PDF（テキストが閾値未満）として振る舞う pdfjs-dist と、
 * 認識が永久に終わらない Tesseract.js のワーカーを用意する。
 * 本物の tesseract.js の terminate は認識中の Promise を settle させないため、それを模す。
 */
function setupScanPdfWithHangingOcr(): void {
  const page = {
    getTextContent: vi.fn().mockResolvedValue({ items: [{ str: 'ab' }] }),
    getViewport: vi.fn().mockReturnValue({ width: 800, height: 1200 }),
    render: vi.fn().mockReturnValue({ promise: Promise.resolve() }),
  };
  mockGetPage.mockResolvedValue(page);
  mockGetDocument.mockImplementation(() => ({
    promise: Promise.resolve({ numPages: 3, getPage: mockGetPage }),
  }));

  // jsdom の canvas は 2D コンテキストを返さないため、canvas の作成だけを差し替える
  const originalCreateElement = document.createElement.bind(document);
  vi.spyOn(document, 'createElement').mockImplementation(
    (tagName: string, options?: ElementCreationOptions) => {
      if (tagName === 'canvas') {
        return {
          width: 0,
          height: 0,
          getContext: () => ({
            getImageData: () => ({ data: new Uint8ClampedArray(16), width: 2, height: 2 }),
            putImageData: vi.fn(),
          }),
          toBlob: (cb: (b: Blob | null) => void) => cb(new Blob(['img'], { type: 'image/png' })),
        } as unknown as HTMLElement;
      }
      return originalCreateElement(tagName, options);
    }
  );

  mockRecognize.mockImplementation(() => new Promise(() => {}));
  mockTerminate.mockResolvedValue(undefined);
  mockCreateWorker.mockResolvedValue({ recognize: mockRecognize, terminate: mockTerminate });
}

/** extractPdfHybrid の第 3 引数で渡された中断のシグナル */
function passedSignal(): AbortSignal | undefined {
  const options = extractPdfHybridSpy.mock.calls[0]?.[2] as { signal?: AbortSignal } | undefined;
  return options?.signal;
}

// ============================================================================
// テスト
// ============================================================================

describe('OcrDataExtractor の PDF 経路の中断（Task 96.1, 17.8）', () => {
  beforeEach(() => {
    extractPdfHybridSpy.mockClear();
    mockGetDocument.mockReset();
    mockGetPage.mockReset();
    mockCreateWorker.mockReset();
    mockRecognize.mockReset();
    mockTerminate.mockReset();
    mockExtractWithClaudeVision.mockReset();
    mockExtractWithClaudeVision.mockRejectedValue(new Error('mock: not configured'));
    setupScanPdfWithHangingOcr();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('30秒の時間切れでシグナルを中断し、OCRのワーカーを終了してエラーを表示する', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });

    render(<OcrDataExtractor file={createPdfFile()} onImportLineItems={vi.fn()} />);

    await waitFor(() => expect(mockRecognize).toHaveBeenCalledTimes(1));
    const signal = passedSignal();
    expect(signal).toBeInstanceOf(AbortSignal);
    expect(signal?.aborted).toBe(false);
    expect(mockTerminate).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(30000);

    await waitFor(() => expect(screen.getByTestId('ocr-error-message')).toBeInTheDocument());
    expect(signal?.aborted).toBe(true);
    await waitFor(() => expect(mockTerminate).toHaveBeenCalledTimes(1));
    // 中断の後に残りのページの認識へ進まない
    expect(mockRecognize).toHaveBeenCalledTimes(1);
  });

  it('時間切れの前にアンマウントするとシグナルを中断し、OCRのワーカーを終了する', async () => {
    const { unmount } = render(
      <OcrDataExtractor file={createPdfFile()} onImportLineItems={vi.fn()} />
    );

    await waitFor(() => expect(mockRecognize).toHaveBeenCalledTimes(1));
    const signal = passedSignal();
    expect(signal?.aborted).toBe(false);

    unmount();

    expect(signal?.aborted).toBe(true);
    await waitFor(() => expect(mockTerminate).toHaveBeenCalledTimes(1));
    expect(mockRecognize).toHaveBeenCalledTimes(1);
  });

  it('手動トリガー（autoStart=false）で始めた処理も、アンマウントでシグナルを中断しワーカーを終了する', async () => {
    const user = userEvent.setup();
    const { unmount } = render(
      <OcrDataExtractor file={createPdfFile()} onImportLineItems={vi.fn()} autoStart={false} />
    );

    await user.click(screen.getByRole('button', { name: 'OCR実行' }));

    await waitFor(() => expect(mockRecognize).toHaveBeenCalledTimes(1));
    const signal = passedSignal();
    expect(signal?.aborted).toBe(false);

    unmount();

    expect(signal?.aborted).toBe(true);
    await waitFor(() => expect(mockTerminate).toHaveBeenCalledTimes(1));
  });
});
