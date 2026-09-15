/**
 * PDF 取り込みの Claude Vision 経路で、ページの画像化から送信までを通して確かめる検証
 *
 * `pdf-ocr-extractor.test.ts` は共有部品 `pdf-text-extractor` と API クライアント
 * `api/claude-vision` をモジュールごと差し替えているため、画像化と送信を一つの検証で
 * つなげられない。本ファイルは差し替えを最下層の境界（pdfjs-dist の `getDocument`、
 * Canvas の `toDataURL`、HTTP 層の `apiClient.post`）だけに留め、`extractPdfData` から
 * `renderPdfPagesToBase64` と `extractWithClaudeVisionForQuantityTable` を実物のまま通す
 * （Task 97.5、2026-09-15 の利用者裁定「両側を一つの検証にまとめる」）。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { mockGetDocument } = vi.hoisted(() => ({
  mockGetDocument: vi.fn(),
}));

// pdfjs-dist（PDF の読み込みとページの描画）
vi.mock('pdfjs-dist', () => ({
  getDocument: mockGetDocument,
}));

// pdfjs-dist の worker 設定（副作用 import）
vi.mock('../estimate-requests/pdf-worker-config', () => ({}));

// HTTP 層だけを差し替える（ApiError などは実物を使う）
vi.mock('../../api/client', async () => {
  const actual = await vi.importActual<typeof import('../../api/client')>('../../api/client');
  return {
    ...actual,
    apiClient: {
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
      patch: vi.fn(),
      delete: vi.fn(),
    },
  };
});

import { apiClient } from '../../api/client';
import { extractPdfData } from './pdf-ocr-extractor';

/** ページ番号ごとに異なる Base64 文字列（描画したページが何であったかを送信側で識別する） */
function base64ForPage(pageNum: number): string {
  return btoa(`rendered-page-${pageNum}`);
}

/**
 * `numPages` ページの PDF を読み込ませる。各ページの `render` が Canvas に「どのページを
 * 描いたか」を書き込み、`toDataURL` はその内容を JPEG の data URL として返す。
 */
function arrangePdf(numPages: number): { getPage: ReturnType<typeof vi.fn> } {
  const canvas = {
    width: 0,
    height: 0,
    drawnPage: 0,
    getContext: vi.fn(() => ({})),
    toDataURL: vi.fn(function (this: { drawnPage: number }) {
      return `data:image/jpeg;base64,${base64ForPage(this.drawnPage)}`;
    }),
  };
  vi.spyOn(document, 'createElement').mockReturnValue(canvas as unknown as HTMLElement);

  const getPage = vi.fn(async (pageNum: number) => ({
    getViewport: () => ({ width: 800, height: 1200 }),
    render: ({ canvas: target }: { canvas: { drawnPage: number } }) => {
      target.drawnPage = pageNum;
      return { promise: Promise.resolve() };
    },
  }));
  mockGetDocument.mockReturnValue({ promise: Promise.resolve({ numPages, getPage }) });

  return { getPage };
}

function createPdfFile(): File {
  const file = new File(['%PDF-1.4'], 'quantity.pdf', { type: 'application/pdf' });
  file.arrayBuffer = vi.fn().mockResolvedValue(new ArrayBuffer(8));
  return file;
}

describe('PDF取り込みのClaude Vision経路（画像化から送信まで）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * PDF の全ページを描画して得た Base64 画像データ（data URL の接頭辞を除いたもの）が、
   * ページの順に、バックエンドの Claude Vision API エンドポイント
   * `/api/claude-vision/extract` へ数量表モードで送られることを、取り込み経路の入口
   * `extractPdfData` から HTTP 層の呼び出しまでを通して確かめる。
   *
   * @requirement quantity-table-generation/REQ-30.2
   */
  it('PDFの各ページを描画したBase64画像データをClaude Vision APIエンドポイントへ送信する', async () => {
    const { getPage } = arrangePdf(3);
    vi.mocked(apiClient.post).mockResolvedValueOnce({ lineItems: [], pageCount: 3 });

    const result = await extractPdfData(createPdfFile());

    expect(getPage.mock.calls.map(([pageNum]) => pageNum)).toEqual([1, 2, 3]);
    expect(apiClient.post).toHaveBeenCalledTimes(1);
    expect(apiClient.post).toHaveBeenCalledWith(
      '/api/claude-vision/extract',
      {
        images: [
          { base64Data: base64ForPage(1), mediaType: 'image/jpeg' },
          { base64Data: base64ForPage(2), mediaType: 'image/jpeg' },
          { base64Data: base64ForPage(3), mediaType: 'image/jpeg' },
        ],
        mode: 'quantity-table',
      },
      expect.any(Object)
    );
    expect(result.extractionType).toBe('pdf-claude-vision');
  });
});
