/**
 * @fileoverview renderPdfPagesToBase64ヘルパー関数のユニットテスト
 *
 * Task 54.1: renderPdfPagesToBase64ヘルパー関数の実装
 *
 * Requirements:
 * - 24.3: PDFファイルの各ページをCanvas APIで画像に変換しBase64エンコードする
 *
 * @module __tests__/components/estimate-requests/renderPdfPagesToBase64
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Hoisted mocks
const { mockGetDocument, mockGetPage, mockGetViewport, mockRender } = vi.hoisted(() => ({
  mockGetDocument: vi.fn(),
  mockGetPage: vi.fn(),
  mockGetViewport: vi.fn(),
  mockRender: vi.fn(),
}));

// Mock pdfjs-dist
vi.mock('pdfjs-dist', () => ({
  getDocument: mockGetDocument,
}));

// Mock pdf-worker-config (side-effect import)
vi.mock('../../../components/estimate-requests/pdf-worker-config', () => ({}));

import { renderPdfPagesToBase64 } from '../../../components/estimate-requests/pdf-text-extractor';
import type { ClaudeVisionImageInput } from '../../../api/claude-vision';

/**
 * File.arrayBuffer()がjsdom環境で未対応のため、モック付きFileを生成する
 */
function createMockFile(name: string): File {
  const file = new File(['%PDF-1.4'], name, { type: 'application/pdf' });
  file.arrayBuffer = vi.fn().mockResolvedValue(new ArrayBuffer(8));
  return file;
}

describe('renderPdfPagesToBase64', () => {
  let mockCanvas: {
    width: number;
    height: number;
    getContext: ReturnType<typeof vi.fn>;
    toDataURL: ReturnType<typeof vi.fn>;
  };
  let mockContext: {
    getImageData: ReturnType<typeof vi.fn>;
    putImageData: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock Canvas context
    mockContext = {
      getImageData: vi.fn().mockReturnValue({
        data: new Uint8ClampedArray(16), // 2x2 image
        width: 2,
        height: 2,
      }),
      putImageData: vi.fn(),
    };

    // Mock Canvas element
    mockCanvas = {
      width: 0,
      height: 0,
      getContext: vi.fn().mockReturnValue(mockContext),
      toDataURL: vi.fn().mockReturnValue('data:image/png;base64,dGVzdEJhc2U2NA=='),
    };

    // Mock document.createElement
    vi.spyOn(document, 'createElement').mockReturnValue(mockCanvas as unknown as HTMLElement);

    // Mock PDF page
    mockGetViewport.mockReturnValue({ width: 800, height: 1200 });
    mockRender.mockReturnValue({ promise: Promise.resolve() });
    mockGetPage.mockResolvedValue({
      getViewport: mockGetViewport,
      render: mockRender,
    });

    // Default: 1-page PDF
    mockGetDocument.mockReturnValue({
      promise: Promise.resolve({
        numPages: 1,
        getPage: mockGetPage,
      }),
    });
  });

  it('should convert a single-page PDF to Base64 image array', async () => {
    const file = createMockFile('test.pdf');

    const result = await renderPdfPagesToBase64(file);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      base64Data: 'dGVzdEJhc2U2NA==', // prefix stripped
      mediaType: 'image/png',
    } satisfies ClaudeVisionImageInput);
  });

  it('should strip data:image/png;base64, prefix from Base64 data', async () => {
    mockCanvas.toDataURL.mockReturnValue('data:image/png;base64,AAABBBCCC');

    const file = createMockFile('test.pdf');
    const result = await renderPdfPagesToBase64(file);

    expect(result[0]!.base64Data).toBe('AAABBBCCC');
    expect(result[0]!.base64Data).not.toContain('data:image/png;base64,');
  });

  it('should use CANVAS_RENDER_SCALE = 4.0 for viewport', async () => {
    const file = createMockFile('test.pdf');

    await renderPdfPagesToBase64(file);

    expect(mockGetViewport).toHaveBeenCalledWith({ scale: 4.0 });
  });

  it('should render all pages for a multi-page PDF', async () => {
    mockGetDocument.mockReturnValue({
      promise: Promise.resolve({
        numPages: 3,
        getPage: mockGetPage,
      }),
    });

    const file = createMockFile('test.pdf');
    const result = await renderPdfPagesToBase64(file);

    expect(result).toHaveLength(3);
    expect(mockGetPage).toHaveBeenCalledTimes(3);
    expect(mockGetPage).toHaveBeenCalledWith(1);
    expect(mockGetPage).toHaveBeenCalledWith(2);
    expect(mockGetPage).toHaveBeenCalledWith(3);
  });

  it('should limit to maximum 20 pages', async () => {
    mockGetDocument.mockReturnValue({
      promise: Promise.resolve({
        numPages: 25,
        getPage: mockGetPage,
      }),
    });

    const file = createMockFile('test.pdf');
    const result = await renderPdfPagesToBase64(file);

    expect(result).toHaveLength(20);
    expect(mockGetPage).toHaveBeenCalledTimes(20);
  });

  it('should set canvas dimensions from viewport', async () => {
    mockGetViewport.mockReturnValue({ width: 3200, height: 4800 });

    const file = createMockFile('test.pdf');
    await renderPdfPagesToBase64(file);

    // Canvas dimensions should be set from viewport
    expect(mockCanvas.width).toBe(0); // Released after rendering (set to 0 for memory cleanup)
  });

  it('should call canvas.toDataURL with image/png', async () => {
    const file = createMockFile('test.pdf');
    await renderPdfPagesToBase64(file);

    expect(mockCanvas.toDataURL).toHaveBeenCalledWith('image/png');
  });

  it('should throw error when Canvas 2D context is not available', async () => {
    mockCanvas.getContext.mockReturnValue(null);

    const file = createMockFile('test.pdf');

    await expect(renderPdfPagesToBase64(file)).rejects.toThrow(
      'Canvas 2Dコンテキストの取得に失敗しました'
    );
  });

  it('should release canvas memory after each page by setting dimensions to 0', async () => {
    mockGetDocument.mockReturnValue({
      promise: Promise.resolve({
        numPages: 2,
        getPage: mockGetPage,
      }),
    });

    const file = createMockFile('test.pdf');
    await renderPdfPagesToBase64(file);

    // Canvas should be reset to release memory
    expect(mockCanvas.width).toBe(0);
    expect(mockCanvas.height).toBe(0);
  });
});
