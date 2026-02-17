/**
 * @fileoverview extractPdfText / extractPdfHybrid / extractPdfWithOcrFallback のユニットテスト
 *
 * Requirements:
 * - 17.1: pdfjs-distのgetTextContent() APIを使用してPDFからテキストを抽出する
 * - 17.2: PDFの全ページを対象にテキスト抽出を行う
 * - 17.3: テキストPDFの場合は抽出テキストをそのまま使用する
 * - 17.4: スキャンPDFの場合はCanvas→Tesseract OCRフォールバックを実行する
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Hoisted mocks
const {
  mockGetDocument,
  mockGetPage,
  mockGetViewport,
  mockRender,
  mockGetTextContent,
  mockCreateWorker,
  mockRecognize,
  mockTerminate,
} = vi.hoisted(() => ({
  mockGetDocument: vi.fn(),
  mockGetPage: vi.fn(),
  mockGetViewport: vi.fn(),
  mockRender: vi.fn(),
  mockGetTextContent: vi.fn(),
  mockCreateWorker: vi.fn(),
  mockRecognize: vi.fn(),
  mockTerminate: vi.fn(),
}));

// Mock pdfjs-dist
vi.mock('pdfjs-dist', () => ({
  getDocument: mockGetDocument,
}));

// Mock pdf-worker-config (side-effect import)
vi.mock('../../../components/estimate-requests/pdf-worker-config', () => ({}));

// Mock tesseract.js
vi.mock('tesseract.js', () => ({
  createWorker: mockCreateWorker,
}));

import {
  extractPdfText,
  extractPdfHybrid,
  extractPdfWithOcrFallback,
  PDF_TEXT_THRESHOLD,
} from '../../../components/estimate-requests/pdf-text-extractor';

/**
 * File.arrayBuffer()がjsdom環境で未対応のため、モック付きFileを生成する
 */
function createMockFile(name: string): File {
  const file = new File(['%PDF-1.4'], name, { type: 'application/pdf' });
  file.arrayBuffer = vi.fn().mockResolvedValue(new ArrayBuffer(8));
  return file;
}

/**
 * pdfjs-dist の mockGetDocument を設定するヘルパー
 */
function setupPdfMock(opts: { numPages: number; pageTexts: string[][] }) {
  mockGetTextContent.mockImplementation(() =>
    Promise.resolve({
      items: (opts.pageTexts.shift() ?? []).map((str) => ({ str })),
    })
  );

  mockGetPage.mockImplementation(() =>
    Promise.resolve({
      getViewport: mockGetViewport,
      render: mockRender,
      getTextContent: mockGetTextContent,
    })
  );

  mockGetDocument.mockReturnValue({
    promise: Promise.resolve({
      numPages: opts.numPages,
      getPage: mockGetPage,
    }),
  });
}

describe('extractPdfText', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('1ページPDFからテキストを抽出する', async () => {
    setupPdfMock({
      numPages: 1,
      pageTexts: [['Hello', 'World']],
    });

    const file = createMockFile('test.pdf');
    const result = await extractPdfText(file);

    expect(result).toBe('Hello World');
    expect(mockGetPage).toHaveBeenCalledWith(1);
  });

  it('複数ページPDFから全ページのテキストを抽出する', async () => {
    setupPdfMock({
      numPages: 3,
      pageTexts: [['Page 1 text'], ['Page 2 text'], ['Page 3 text']],
    });

    const file = createMockFile('test.pdf');
    const result = await extractPdfText(file);

    expect(result).toBe('Page 1 text\nPage 2 text\nPage 3 text');
    expect(mockGetPage).toHaveBeenCalledTimes(3);
  });

  it('空テキストのPDFでも空文字列を返す', async () => {
    setupPdfMock({
      numPages: 1,
      pageTexts: [[]],
    });

    const file = createMockFile('empty.pdf');
    const result = await extractPdfText(file);

    expect(result).toBe('');
  });
});

describe('extractPdfHybrid', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('テキスト量が閾値以上の場合はテキストPDFと判定し、テキストをそのまま返す', async () => {
    // 閾値以上のテキストを返す
    const longText = 'あ'.repeat(PDF_TEXT_THRESHOLD + 10);
    setupPdfMock({
      numPages: 1,
      pageTexts: [[longText]],
    });

    const file = createMockFile('text.pdf');
    const onProgress = vi.fn();

    const result = await extractPdfHybrid(file, onProgress);

    expect(result.isTextPdf).toBe(true);
    expect(result.text).toBe(longText);
    expect(result.numPages).toBe(1);
    expect(onProgress).toHaveBeenCalledWith(10, 'PDFテキスト抽出中...');
    expect(onProgress).toHaveBeenCalledWith(100, 'テキスト抽出完了');
  });

  it('テキスト量が閾値未満の場合はスキャンPDFと判定し、OCRフォールバックを実行する', async () => {
    // 閾値未満のテキスト
    const shortText = 'ab';
    setupPdfMock({
      numPages: 1,
      pageTexts: [[shortText]],
    });

    // OCRフォールバックのモック
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
    };
    vi.spyOn(document, 'createElement').mockReturnValue(mockCanvas as unknown as HTMLElement);

    mockGetViewport.mockReturnValue({ width: 800, height: 1200 });
    mockRender.mockReturnValue({ promise: Promise.resolve() });

    mockRecognize.mockResolvedValue({ data: { text: 'OCR結果テキスト' } });
    mockTerminate.mockResolvedValue(undefined);
    mockCreateWorker.mockResolvedValue({
      recognize: mockRecognize,
      terminate: mockTerminate,
    });

    const file = createMockFile('scan.pdf');
    const onProgress = vi.fn();

    const result = await extractPdfHybrid(file, onProgress);

    expect(result.isTextPdf).toBe(false);
    expect(result.text).toBe('OCR結果テキスト');
    expect(result.numPages).toBe(1);
    expect(onProgress).toHaveBeenCalledWith(25, 'スキャンPDF検出、OCR処理を開始...');
  });

  it('onProgressがundefinedでも正常に動作する', async () => {
    const longText = 'あ'.repeat(PDF_TEXT_THRESHOLD + 10);
    setupPdfMock({
      numPages: 1,
      pageTexts: [[longText]],
    });

    const file = createMockFile('text.pdf');
    const result = await extractPdfHybrid(file);

    expect(result.isTextPdf).toBe(true);
    expect(result.text).toBe(longText);
  });
});

describe('extractPdfWithOcrFallback', () => {
  let mockContext: {
    getImageData: ReturnType<typeof vi.fn>;
    putImageData: ReturnType<typeof vi.fn>;
  };
  let mockCanvas: {
    width: number;
    height: number;
    getContext: ReturnType<typeof vi.fn>;
    toBlob: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockContext = {
      getImageData: vi.fn().mockReturnValue({
        data: new Uint8ClampedArray(16),
        width: 2,
        height: 2,
      }),
      putImageData: vi.fn(),
    };

    mockCanvas = {
      width: 0,
      height: 0,
      getContext: vi.fn().mockReturnValue(mockContext),
      toBlob: vi.fn().mockImplementation((cb: (b: Blob | null) => void) => {
        cb(new Blob(['fake-image'], { type: 'image/png' }));
      }),
    };

    vi.spyOn(document, 'createElement').mockReturnValue(mockCanvas as unknown as HTMLElement);

    mockGetViewport.mockReturnValue({ width: 800, height: 1200 });
    mockRender.mockReturnValue({ promise: Promise.resolve() });

    mockRecognize.mockResolvedValue({ data: { text: 'OCRテキスト' } });
    mockTerminate.mockResolvedValue(undefined);
    mockCreateWorker.mockResolvedValue({
      recognize: mockRecognize,
      terminate: mockTerminate,
    });

    mockGetPage.mockResolvedValue({
      getViewport: mockGetViewport,
      render: mockRender,
    });

    mockGetDocument.mockReturnValue({
      promise: Promise.resolve({
        numPages: 1,
        getPage: mockGetPage,
      }),
    });
  });

  it('PDFをCanvas描画→Tesseract OCRで処理する', async () => {
    const file = createMockFile('scan.pdf');
    const result = await extractPdfWithOcrFallback(file);

    expect(result).toBe('OCRテキスト');
    expect(mockCreateWorker).toHaveBeenCalledWith('jpn');
    expect(mockRecognize).toHaveBeenCalled();
    expect(mockTerminate).toHaveBeenCalled();
  });

  it('進捗コールバックが呼ばれる', async () => {
    const file = createMockFile('scan.pdf');
    const onProgress = vi.fn();

    await extractPdfWithOcrFallback(file, onProgress);

    expect(onProgress).toHaveBeenCalledWith(90, '1/1ページ処理中...');
  });

  it('複数ページでページごとにOCR処理を実行する', async () => {
    mockGetDocument.mockReturnValue({
      promise: Promise.resolve({
        numPages: 2,
        getPage: mockGetPage,
      }),
    });

    mockRecognize
      .mockResolvedValueOnce({ data: { text: 'Page1' } })
      .mockResolvedValueOnce({ data: { text: 'Page2' } });

    const file = createMockFile('scan.pdf');
    const result = await extractPdfWithOcrFallback(file);

    expect(result).toBe('Page1\nPage2');
    expect(mockRecognize).toHaveBeenCalledTimes(2);
  });

  it('Canvas 2Dコンテキスト取得失敗時にエラーをスローする', async () => {
    mockCanvas.getContext.mockReturnValue(null);

    const file = createMockFile('scan.pdf');

    await expect(extractPdfWithOcrFallback(file)).rejects.toThrow(
      'Canvas 2Dコンテキストの取得に失敗しました'
    );
    // finallyでworker.terminateが呼ばれる
    expect(mockTerminate).toHaveBeenCalled();
  });

  it('canvas.toBlobがnullを返した場合にエラーをスローする', async () => {
    mockCanvas.toBlob.mockImplementation((cb: (b: Blob | null) => void) => {
      cb(null);
    });

    const file = createMockFile('scan.pdf');

    await expect(extractPdfWithOcrFallback(file)).rejects.toThrow('Canvas画像変換に失敗しました');
    expect(mockTerminate).toHaveBeenCalled();
  });

  it('処理後にワーカーが確実に終了される', async () => {
    const file = createMockFile('scan.pdf');
    await extractPdfWithOcrFallback(file);

    expect(mockTerminate).toHaveBeenCalledTimes(1);
  });

  it('Canvas描画後にメモリ解放のためcanvasのサイズを0にリセットする', async () => {
    const file = createMockFile('scan.pdf');
    await extractPdfWithOcrFallback(file);

    expect(mockCanvas.width).toBe(0);
    expect(mockCanvas.height).toBe(0);
  });

  it('CANVAS_RENDER_SCALE=4.0でviewportを取得する', async () => {
    const file = createMockFile('scan.pdf');
    await extractPdfWithOcrFallback(file);

    expect(mockGetViewport).toHaveBeenCalledWith({ scale: 4.0 });
  });

  it('画像前処理パイプラインが適用される', async () => {
    const file = createMockFile('scan.pdf');
    await extractPdfWithOcrFallback(file);

    // getImageDataとputImageDataが呼ばれる（前処理パイプライン適用の証拠）
    expect(mockContext.getImageData).toHaveBeenCalled();
    expect(mockContext.putImageData).toHaveBeenCalled();
  });
});
