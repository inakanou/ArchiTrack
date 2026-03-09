/**
 * PDF OCR処理機能の単体テスト
 *
 * Task 44.2 + 44.3 + 48.2 + 48.3: PDF OCR処理とClaude Vision API連携
 *
 * Requirements:
 * - 29.1-29.4: pdfjs-distテキスト抽出とOCRフォールバック
 * - 30.1-30.7: Claude Vision API連携
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock pdf-text-extractor
vi.mock('../estimate-requests/pdf-text-extractor', () => ({
  extractPdfHybrid: vi.fn(),
  renderPdfPagesToBase64: vi.fn(),
}));

// Mock claude-vision API
vi.mock('../../api/claude-vision', () => ({
  extractWithClaudeVisionForQuantityTable: vi.fn(),
}));

import { extractPdfData } from './pdf-ocr-extractor';

describe('extractPdfData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('Claude Vision APIが利用可能な場合は優先使用する', async () => {
    // Arrange
    const { renderPdfPagesToBase64 } = await import('../estimate-requests/pdf-text-extractor');
    const { extractWithClaudeVisionForQuantityTable } = await import('../../api/claude-vision');

    vi.mocked(renderPdfPagesToBase64).mockResolvedValue([
      { base64Data: 'dGVzdA==', mediaType: 'image/jpeg' },
    ]);

    vi.mocked(extractWithClaudeVisionForQuantityTable).mockResolvedValue({
      lineItems: [
        {
          majorCategory: '土工',
          middleCategory: null,
          minorCategory: null,
          customCategory: null,
          workType: '土工',
          name: '掘削工',
          specification: 'バックホウ',
          quantity: 150,
          unit: 'm3',
          remarks: null,
        },
      ],
      pageCount: 1,
    });

    const file = new File(['test'], 'test.pdf', { type: 'application/pdf' });

    // Act
    const result = await extractPdfData(file);

    // Assert
    expect(result.extractionType).toBe('pdf-claude-vision');
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.columns[5]).toBe('掘削工'); // name
    expect(result.rows[0]?.columns[7]).toBe('150'); // quantity
    expect(extractWithClaudeVisionForQuantityTable).toHaveBeenCalled();
  });

  it('Claude Vision API使用時も同一のプレビューテーブル形式で表示する（ヘッダーに数量表フィールドを含む）', async () => {
    const { renderPdfPagesToBase64 } = await import('../estimate-requests/pdf-text-extractor');
    const { extractWithClaudeVisionForQuantityTable } = await import('../../api/claude-vision');

    vi.mocked(renderPdfPagesToBase64).mockResolvedValue([]);
    vi.mocked(extractWithClaudeVisionForQuantityTable).mockResolvedValue({
      lineItems: [],
      pageCount: 0,
    });

    const file = new File(['test'], 'test.pdf');

    const result = await extractPdfData(file);

    expect(result.headers).toEqual([
      '大項目',
      '中項目',
      '小項目',
      '任意分類',
      '工種',
      '名称',
      '規格',
      '数量',
      '単位',
      '備考',
    ]);
  });

  it('Claude Vision APIが利用不可の場合はpdfjs-dist + Tesseract.jsフォールバックを実行する', async () => {
    const { renderPdfPagesToBase64, extractPdfHybrid } =
      await import('../estimate-requests/pdf-text-extractor');
    const { extractWithClaudeVisionForQuantityTable } = await import('../../api/claude-vision');

    // Claude Vision API失敗をシミュレート
    vi.mocked(renderPdfPagesToBase64).mockRejectedValue(new Error('API unavailable'));
    vi.mocked(extractWithClaudeVisionForQuantityTable).mockRejectedValue(
      new Error('API unavailable')
    );

    // フォールバック結果
    vi.mocked(extractPdfHybrid).mockResolvedValue({
      text: '土工\t掘削工\t150\tm3',
      isTextPdf: true,
      numPages: 1,
    });

    const file = new File(['test'], 'test.pdf');

    const result = await extractPdfData(file);

    expect(result.extractionType).toBe('pdf-text');
    expect(extractPdfHybrid).toHaveBeenCalled();
  });

  it('APIタイムアウト時もフォールバックを実行する', async () => {
    const { renderPdfPagesToBase64, extractPdfHybrid } =
      await import('../estimate-requests/pdf-text-extractor');
    const { extractWithClaudeVisionForQuantityTable } = await import('../../api/claude-vision');

    // タイムアウトエラーをシミュレート
    vi.mocked(renderPdfPagesToBase64).mockResolvedValue([
      { base64Data: 'test', mediaType: 'image/jpeg' },
    ]);
    vi.mocked(extractWithClaudeVisionForQuantityTable).mockRejectedValue(new Error('Timeout'));

    vi.mocked(extractPdfHybrid).mockResolvedValue({
      text: '仮設\t仮設工\t1\t式',
      isTextPdf: false,
      numPages: 1,
    });

    const file = new File(['test'], 'test.pdf');

    const result = await extractPdfData(file);

    expect(result.extractionType).toBe('pdf-ocr');
    expect(extractPdfHybrid).toHaveBeenCalled();
  });

  it('Claude Vision APIレスポンスからの数量項目フィールドマッピングが正しい', async () => {
    const { renderPdfPagesToBase64 } = await import('../estimate-requests/pdf-text-extractor');
    const { extractWithClaudeVisionForQuantityTable } = await import('../../api/claude-vision');

    vi.mocked(renderPdfPagesToBase64).mockResolvedValue([
      { base64Data: 'test', mediaType: 'image/jpeg' },
    ]);

    vi.mocked(extractWithClaudeVisionForQuantityTable).mockResolvedValue({
      lineItems: [
        {
          majorCategory: '大',
          middleCategory: '中',
          minorCategory: '小',
          customCategory: '分類',
          workType: '工種',
          name: '名称',
          specification: '規格',
          quantity: 99.5,
          unit: 'm',
          remarks: '備考',
        },
      ],
      pageCount: 1,
    });

    const file = new File(['test'], 'test.pdf');

    const result = await extractPdfData(file);

    expect(result.rows[0]?.columns).toEqual([
      '大',
      '中',
      '小',
      '分類',
      '工種',
      '名称',
      '規格',
      '99.5',
      'm',
      '備考',
    ]);
  });
});
