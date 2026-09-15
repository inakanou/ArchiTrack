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

  /**
   * Claude Vision API が利用可能なとき、pdfjs-dist + Tesseract.js ではなく
   * Claude Vision API が優先的に呼ばれることをこの検証が確かめる。
   *
   * @requirement quantity-table-generation/REQ-30.1
   */
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

  /**
   * この検証には `@requirement` を付けていない。理由を現地に残す（115.176 の作法）。
   *
   * 受入基準 30.7 は「Claude Vision API使用時もpdfjs-dist + Tesseract.js使用時も、
   * 同一のプレビューテーブル形式で抽出結果を表示する」であり、二つの経路の同一性を
   * 主張する条文である。本検証が固定するのは Claude Vision 経路のヘッダーだけで、
   * フォールバック経路と突き合わせていない。片側だけを見る本検証が名乗れば偽の被覆になる。
   * 両経路を突き合わせる検証は下の `describe('プレビューテーブル形式の二経路一致')` が担う
   * （Task 96.1、2026-09-15 の裁定で `列1`…`列N` を廃し10欄へ揃えた）。
   */
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

  /**
   * Claude Vision API が利用できないとき、pdfjs-dist + Tesseract.js による OCR 処理へ
   * フォールバックすることをこの検証が確かめる。
   *
   * @requirement quantity-table-generation/REQ-30.5
   */
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

  /**
   * Claude Vision API のリクエストがタイムアウトまたはエラーとなったとき、
   * pdfjs-dist + Tesseract.js による OCR 処理へフォールバックすることを確かめる。
   *
   * @requirement quantity-table-generation/REQ-30.6
   */
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

  /**
   * Claude API のレスポンスから取り出した表データが、大項目・中項目・小項目・
   * 任意分類・工種・名称・規格・数量・単位・備考の各欄へ順に対応づけられることを
   * この検証が確かめる（フロント側の対応づけ）。バックエンド側の対応づけは
   * `backend/src/__tests__/unit/services/claude-vision-quantity.service.test.ts` が
   * 確かめる。
   *
   * @requirement quantity-table-generation/REQ-30.4
   */
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

/** Claude Vision 経路が組み立てる10欄の名前付きヘッダー（プレビューテーブル形式の基準） */
const PREVIEW_HEADERS = [
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
];

/**
 * Claude Vision API を失敗させ、フォールバック経路へ与える抽出テキストを差し込む。
 */
async function arrangeFallback(text: string): Promise<void> {
  const { renderPdfPagesToBase64, extractPdfHybrid } =
    await import('../estimate-requests/pdf-text-extractor');
  vi.mocked(renderPdfPagesToBase64).mockRejectedValue(new Error('API unavailable'));
  vi.mocked(extractPdfHybrid).mockResolvedValue({ text, isTextPdf: true, numPages: 1 });
}

describe('プレビューテーブル形式の二経路一致', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * Claude Vision 経路とフォールバック経路が、同じ10欄の名前付きヘッダーと、
   * ヘッダーと同じ幅（10列）の行を返すことを両経路の実行結果の突き合わせで確かめる。
   * プレビューテーブル（`ImportPreviewTable`）は `headers` と各行の `columns` を
   * そのまま描画し、列の割り当て（`autoDetectFieldMapping`）も `headers` から推定するため、
   * この二つが一致すれば表示の形式（見出し・列数・各列のマッピング先）は同一になる。
   * 割り当ての一致も併せて主張する。
   *
   * @requirement quantity-table-generation/REQ-30.7
   */
  it('Claude Vision経路とフォールバック経路が同一のヘッダー・列幅・列の割り当てを返す', async () => {
    const { renderPdfPagesToBase64 } = await import('../estimate-requests/pdf-text-extractor');
    const { extractWithClaudeVisionForQuantityTable } = await import('../../api/claude-vision');
    const { autoDetectFieldMapping } = await import('./field-mapping');

    // Claude Vision 経路
    vi.mocked(renderPdfPagesToBase64).mockResolvedValue([
      { base64Data: 'dGVzdA==', mediaType: 'image/jpeg' },
    ]);
    vi.mocked(extractWithClaudeVisionForQuantityTable).mockResolvedValue({
      lineItems: [
        {
          majorCategory: null,
          middleCategory: null,
          minorCategory: null,
          customCategory: null,
          workType: '土工',
          name: '掘削工',
          specification: null,
          quantity: 150,
          unit: 'm3',
          remarks: null,
        },
      ],
      pageCount: 1,
    });
    const vision = await extractPdfData(new File(['test'], 'test.pdf'));

    // フォールバック経路（同じ内容の表をテキストとして得た場合）
    await arrangeFallback('工種\t名称\t数量\t単位\n土工\t掘削工\t150\tm3');
    const fallback = await extractPdfData(new File(['test'], 'test.pdf'));

    expect(vision.extractionType).toBe('pdf-claude-vision');
    expect(fallback.extractionType).toBe('pdf-text');
    expect(fallback.headers).toEqual(vision.headers);
    expect(fallback.headers).toEqual(PREVIEW_HEADERS);
    expect(fallback.rows.map((r) => r.columns)).toEqual(vision.rows.map((r) => r.columns));
    for (const row of fallback.rows) {
      expect(row.columns).toHaveLength(fallback.headers.length);
    }
    expect(autoDetectFieldMapping(fallback.headers, fallback.rows)).toEqual(
      autoDetectFieldMapping(vision.headers, vision.rows)
    );
  });

  /**
   * 1行目の見出し語が異なる2欄以上に当たれば見出し行とみなし、キーワードで決めた欄へ各列を並べ替え、
   * 見出し行そのものはデータから外すことを確かめる。元の行番号は保つ。
   */
  it('見出し行があれば見出し語で10欄へ並べ替え、見出し行をデータから外す', async () => {
    await arrangeFallback('名称\t単位\t数量\t大分類\n掘削工\tm3\t150\t土工\n埋戻し\tm3\t80\t土工');

    const result = await extractPdfData(new File(['test'], 'test.pdf'));

    expect(result.headers).toEqual(PREVIEW_HEADERS);
    expect(result.rows).toEqual([
      { columns: ['土工', '', '', '', '', '掘削工', '', '150', 'm3', ''], sourceRowIndex: 1 },
      { columns: ['土工', '', '', '', '', '埋戻し', '', '80', 'm3', ''], sourceRowIndex: 2 },
    ]);
  });

  /**
   * 見出し行でどの欄にも当たらない列（例: 「番号」）は捨てることを確かめる（裁定 B-2）。
   */
  it('見出し語に当たらない列は捨てる', async () => {
    await arrangeFallback('番号\t工種\t名称\t単位\n1\t土工\t掘削工\tm3');

    const result = await extractPdfData(new File(['test'], 'test.pdf'));

    expect(result.rows.map((r) => r.columns)).toEqual([
      ['', '', '', '', '土工', '掘削工', '', '', 'm3', ''],
    ]);
  });

  /**
   * 同じ欄に2列が当たった場合は、左側（先に現れた列）を採り、後の列は捨てることを確かめる。
   * 「名称」と「品名」はいずれも名称欄の見出し語である。
   */
  it('同じ欄に2列が当たった場合は左側の列を採り、後の列を捨てる', async () => {
    await arrangeFallback('名称\t品名\t単位\n掘削工\tバックホウ掘削\tm3');

    const result = await extractPdfData(new File(['test'], 'test.pdf'));

    expect(result.rows.map((r) => r.columns)).toEqual([
      ['', '', '', '', '', '掘削工', '', '', 'm3', ''],
    ]);
  });

  /**
   * 1行目のどの列も見出し語に当たらなければ見出し行が無いとみなし、第1列を大項目…と
   * 位置で当て、1行目もデータとして扱い、不足は空欄で埋めることを確かめる（裁定 B-1）。
   */
  it('見出し行が無ければ位置で当て、1行目もデータとして扱い不足は空欄で埋める', async () => {
    await arrangeFallback('土工\t掘削工\t150\tm3\n仮設\t仮設工\t1\t式');

    const result = await extractPdfData(new File(['test'], 'test.pdf'));

    expect(result.headers).toEqual(PREVIEW_HEADERS);
    expect(result.rows).toEqual([
      { columns: ['土工', '掘削工', '150', 'm3', '', '', '', '', '', ''], sourceRowIndex: 0 },
      { columns: ['仮設', '仮設工', '1', '式', '', '', '', '', '', ''], sourceRowIndex: 1 },
    ]);
  });

  /**
   * 位置で当てる場合、10列を超える列は切り詰めることを確かめる。
   */
  it('位置で当てる場合は10列を超える列を切り詰める', async () => {
    await arrangeFallback('a\tb\tc\td\te\tf\tg\th\ti\tj\tk\tl');

    const result = await extractPdfData(new File(['test'], 'test.pdf'));

    expect(result.rows.map((r) => r.columns)).toEqual([
      ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'],
    ]);
  });

  /**
   * 見出し行の判定基準は「見出し語が異なる2欄以上に当たる」である（同じ欄に当たった
   * 複数列は1欄と数える）。1列だけの一致は
   * データ中の語（例: 「数量は概算」という備考）でも起こり、誤って見出し行とみなすと
   * 当たらない列が捨てられて（B-2）データの大半を失うため、見出しとみなさない。
   * このとき1行目は位置で当てたデータとして残ることを確かめる。
   */
  it('見出し語に当たる列が1列だけの1行目は見出し行とみなさず位置で当てる', async () => {
    await arrangeFallback('土工\t掘削工\t数量は概算');

    const result = await extractPdfData(new File(['test'], 'test.pdf'));

    expect(result.rows).toEqual([
      {
        columns: ['土工', '掘削工', '数量は概算', '', '', '', '', '', '', ''],
        sourceRowIndex: 0,
      },
    ]);
  });

  /**
   * 見出し行の判定は「当たった列の数」ではなく「当たった欄の種類の数」で数える。
   * 1行目の2列がいずれも名称欄の見出し語（「名称」「品名」）で、異なる欄が1つしか無い場合は
   * 見出し行とみなさず、位置で当てたデータとして残ることを確かめる。
   */
  it('同じ欄に当たる2列だけの1行目は異なる欄が1つなので見出し行とみなさず位置で当てる', async () => {
    await arrangeFallback('名称\t品名\n掘削工\tバックホウ掘削');

    const result = await extractPdfData(new File(['test'], 'test.pdf'));

    expect(result.rows).toEqual([
      { columns: ['名称', '品名', '', '', '', '', '', '', '', ''], sourceRowIndex: 0 },
      {
        columns: ['掘削工', 'バックホウ掘削', '', '', '', '', '', '', '', ''],
        sourceRowIndex: 1,
      },
    ]);
  });

  /**
   * 表として解釈できる行が無い場合も、ヘッダーは10欄の名前付きヘッダーで行は0件になる
   * ことを確かめる（二経路とも行0件のときに形式が食い違わない）。
   */
  it('行が無い場合も10欄の名前付きヘッダーを返す', async () => {
    await arrangeFallback('単一の語だけの行');

    const result = await extractPdfData(new File(['test'], 'test.pdf'));

    expect(result.headers).toEqual(PREVIEW_HEADERS);
    expect(result.rows).toEqual([]);
  });
});
