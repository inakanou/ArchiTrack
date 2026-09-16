/**
 * @fileoverview 取り込み経路の OCR を、ファイルの差し替え（`reset`）とダイアログを閉じたとき
 * （アンマウント）に中断することの単体テスト
 *
 * Task 98.4: 進行中の OCR は時間切れ（30秒）まで Tesseract のワーカーを抱えたままで、
 * 差し替え後の処理と2つ同時に走りうる（利用者の裁定 2026-09-16「中断の仕組みを足す」）。
 * 要件の受入基準は資源の扱いに触れていないため、本ファイルは受入基準の番号を名乗らない。
 *
 * 抽出の経路は `useImportDataExtractor` → `pdf-ocr-extractor` → 共有部品 `pdf-text-extractor`
 * まで実物を通し、外界（pdfjs-dist / tesseract.js / Claude Vision API）だけを模擬する。
 * 中断の主張は「ワーカーが終了する（`worker.terminate()` が呼ばれる）」ことに置く。
 *
 * @module components/quantity-table-import/useImportDataExtractor.abort.test
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, renderHook, act, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { QuantityGroupDetail } from '../../types/quantity-table.types';

const {
  mockGetDocument,
  mockGetPage,
  mockGetViewport,
  mockRender,
  mockGetTextContent,
  mockCreateWorker,
  mockRecognize,
  mockTerminate,
  mockCallVision,
} = vi.hoisted(() => ({
  mockGetDocument: vi.fn(),
  mockGetPage: vi.fn(),
  mockGetViewport: vi.fn(),
  mockRender: vi.fn(),
  mockGetTextContent: vi.fn(),
  mockCreateWorker: vi.fn(),
  mockRecognize: vi.fn(),
  mockTerminate: vi.fn(),
  mockCallVision: vi.fn(),
}));

vi.mock('pdfjs-dist', () => ({ getDocument: mockGetDocument }));
vi.mock('../estimate-requests/pdf-worker-config', () => ({}));
vi.mock('tesseract.js', () => ({ createWorker: mockCreateWorker }));
vi.mock('../../api/claude-vision', () => ({
  extractWithClaudeVisionForQuantityTable: mockCallVision,
}));

// インラインプレビュー（ダイアログ経由の検証で描かれる）
vi.mock('react-pdf', () => ({
  Document: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="pdf-document">{children}</div>
  ),
  Page: ({ pageNumber }: { pageNumber: number }) => <div data-testid="pdf-page">{pageNumber}</div>,
  pdfjs: { GlobalWorkerOptions: { workerSrc: '' } },
}));

import { useImportDataExtractor } from './useImportDataExtractor';
import { ImportDialog } from './ImportDialog';

const groups: QuantityGroupDetail[] = [
  {
    id: 'group-1',
    quantityTableId: 'table-1',
    name: 'グループA',
    surveyImageId: null,
    surveyImage: null,
    displayOrder: 1,
    itemCount: 0,
    items: [],
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
  },
];

function pdfFile(name = '数量表.pdf'): File {
  return new File(['%PDF-1.4'], name, { type: 'application/pdf' });
}

/**
 * スキャン PDF（テキストがほとんど無く OCR へ落ちる）として pdfjs / tesseract を整える。
 *
 * Claude Vision 経路は API の呼び出しが失敗し、フォールバックの OCR へ進む。
 */
function setupScanPdf(numPages: number): void {
  const mockContext = {
    getImageData: vi.fn().mockReturnValue({
      data: new Uint8ClampedArray(16),
      width: 2,
      height: 2,
    }),
    putImageData: vi.fn(),
  };
  const mockCanvas = {
    width: 0,
    height: 0,
    getContext: vi.fn().mockReturnValue(mockContext),
    toBlob: vi.fn().mockImplementation((cb: (b: Blob | null) => void) => {
      cb(new Blob(['fake-image'], { type: 'image/png' }));
    }),
    toDataURL: vi.fn().mockReturnValue('data:image/jpeg;base64,dGVzdA=='),
  };
  const realCreateElement = document.createElement.bind(document);
  vi.spyOn(document, 'createElement').mockImplementation(((
    tagName: string,
    options?: ElementCreationOptions
  ) =>
    tagName === 'canvas'
      ? (mockCanvas as unknown as HTMLElement)
      : realCreateElement(tagName, options)) as typeof document.createElement);

  const pageTexts: string[][] = Array.from({ length: numPages }, () => ['ab']);
  mockGetTextContent.mockImplementation(() =>
    Promise.resolve({ items: (pageTexts.shift() ?? []).map((str) => ({ str })) })
  );
  mockGetPage.mockImplementation(() =>
    Promise.resolve({
      getViewport: mockGetViewport,
      render: mockRender,
      getTextContent: mockGetTextContent,
    })
  );
  mockGetDocument.mockReturnValue({
    promise: Promise.resolve({ numPages, getPage: mockGetPage }),
  });
  mockGetViewport.mockReturnValue({ width: 800, height: 1200 });
  mockRender.mockReturnValue({ promise: Promise.resolve() });
  mockTerminate.mockResolvedValue(undefined);
  mockCreateWorker.mockResolvedValue({ recognize: mockRecognize, terminate: mockTerminate });
  // Claude Vision は利用不可（REQ-30.5 のフォールバックへ進ませる）
  mockCallVision.mockRejectedValue(new Error('Claude Vision API 利用不可'));
}

/** 本物の tesseract.js（7.0.0）の terminate は認識中の Promise を settle させない */
function hangRecognition(): void {
  mockRecognize.mockImplementation(() => new Promise(() => {}));
}

describe('進行中の OCR の中断（Task 98.4）', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.restoreAllMocks();
    Object.defineProperty(File.prototype, 'arrayBuffer', {
      value: () => Promise.resolve(new ArrayBuffer(8)),
      configurable: true,
      writable: true,
    });
    global.URL.createObjectURL = vi.fn(() => 'blob:import-preview');
    global.URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    cleanup();
  });

  it('処理中にファイルを差し替えると、先の OCR のワーカーを終了してから次の処理を始める', async () => {
    setupScanPdf(3);
    hangRecognition();
    const { result } = renderHook(() => useImportDataExtractor());

    act(() => {
      result.current.startExtraction(pdfFile('前.pdf'));
    });
    // 前提: 1ページ目の認識が始まっており、ワーカーはまだ生きている
    await waitFor(() => expect(mockRecognize).toHaveBeenCalledTimes(1));
    expect(mockCreateWorker).toHaveBeenCalledTimes(1);
    expect(mockTerminate).not.toHaveBeenCalled();

    // ダイアログのファイル差し替えと同じ順（reset → startExtraction）
    act(() => {
      result.current.reset();
      result.current.startExtraction(pdfFile('後.pdf'));
    });

    await waitFor(() => expect(mockTerminate).toHaveBeenCalledTimes(1));
    // 先の処理は残りのページへ進まない（2つ同時に走らない）
    await waitFor(() => expect(mockCreateWorker).toHaveBeenCalledTimes(2));
    expect(mockRecognize).toHaveBeenCalledTimes(2);
  });

  it('処理中にアンマウントされると、進行中の OCR のワーカーを終了する', async () => {
    setupScanPdf(3);
    hangRecognition();
    const { result, unmount } = renderHook(() => useImportDataExtractor());

    act(() => {
      result.current.startExtraction(pdfFile());
    });
    await waitFor(() => expect(mockRecognize).toHaveBeenCalledTimes(1));
    expect(mockTerminate).not.toHaveBeenCalled();

    unmount();

    await waitFor(() => expect(mockTerminate).toHaveBeenCalledTimes(1));
    expect(mockRecognize).toHaveBeenCalledTimes(1);
  });

  it('処理中に取り込みダイアログを閉じると、進行中の OCR のワーカーを終了する', async () => {
    setupScanPdf(3);
    hangRecognition();
    const props = { onClose: vi.fn(), onImport: vi.fn(), groups };
    const { rerender } = render(<ImportDialog {...props} isOpen />);

    await userEvent.upload(screen.getByLabelText('ファイルを選択'), pdfFile());
    // 前提: ダイアログが開いたまま OCR が走っている
    await waitFor(() => expect(mockRecognize).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(mockTerminate).not.toHaveBeenCalled();

    rerender(<ImportDialog {...props} isOpen={false} />);

    await waitFor(() => expect(mockTerminate).toHaveBeenCalledTimes(1));
    expect(mockRecognize).toHaveBeenCalledTimes(1);
  });

  it('中断しなければ、OCR は最後まで走って結果を返し、ワーカーの終了は完了時の1回だけである', async () => {
    setupScanPdf(2);
    mockRecognize
      .mockResolvedValueOnce({ data: { text: '工種\t名称\t数量\t単位' } })
      .mockResolvedValueOnce({ data: { text: '土工\t掘削工\t150\tm3' } });
    const { result } = renderHook(() => useImportDataExtractor());

    act(() => {
      result.current.startExtraction(pdfFile());
    });

    await waitFor(() => expect(result.current.status).toBe('completed'));
    expect(result.current.result?.extractionType).toBe('pdf-ocr');
    expect(result.current.result?.rows).toHaveLength(1);
    expect(mockRecognize).toHaveBeenCalledTimes(2);
    expect(mockTerminate).toHaveBeenCalledTimes(1);
  });
});
