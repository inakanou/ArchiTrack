/**
 * PDF OCR処理機能の単体テスト
 *
 * Task 44.2 + 44.3 + 48.2 + 48.3: PDF OCR処理とClaude Vision API連携
 *
 * 本ファイルが確かめる受入基準は 29.7 / 29.9 / 29.10 / 30.1 / 30.4〜30.7 である。番号は各検証の
 * `@requirement` の印に記してあり、冒頭には一覧を重ねない（Task 97.10）。
 * 29.1〜29.4（pdfjs-dist のテキスト抽出と OCR への切り替え）は、共有部品
 * `pdf-text-extractor` をモックしているため本ファイルでは確かめない。30.2 / 30.3（画像の送信と
 * プロンプト）も本ファイルは主張しない。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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

/** Claude Vision 経路が返す表データ（抽出テキストの検証用） */
const VISION_LINE_ITEMS = [
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
];

/** Promise の決着を同期的に観測するための控え */
function track<T>(promise: Promise<T>): {
  state: () => 'pending' | 'resolved' | 'rejected';
  value: () => T | undefined;
  error: () => unknown;
} {
  let state: 'pending' | 'resolved' | 'rejected' = 'pending';
  let value: T | undefined;
  let error: unknown;
  promise.then(
    (v) => {
      state = 'resolved';
      value = v;
    },
    (e: unknown) => {
      state = 'rejected';
      error = e;
    }
  );
  return { state: () => state, value: () => value, error: () => error };
}

describe('OCR処理の抽出テキスト・失敗時の導線・タイムアウト', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /**
   * OCR処理（フォールバック経路）が完了したとき、抽出したテキストをそのままテキストデータとして
   * 抽出結果に含め、プレビューテーブル用の行と併せて返すことを確かめる。ダイアログは
   * このテキストと行を並べて表示する（`ImportDialog.test.tsx` 側で確かめる）。
   *
   * @requirement quantity-table-generation/REQ-29.7
   */
  it('フォールバック経路は抽出テキストをテキストデータとして行データと併せて返す', async () => {
    const text = '工種\t名称\t数量\t単位\n土工\t掘削工\t150\tm3';
    await arrangeFallback(text);

    const result = await extractPdfData(new File(['test'], 'test.pdf'));

    expect(result.extractedText).toBe(text);
    expect(result.rows.map((r) => r.columns)).toEqual([
      ['', '', '', '', '土工', '掘削工', '', '150', 'm3', ''],
    ]);
  });

  /**
   * Claude Vision 経路が完了したときも、抽出した表データを整形したテキストを抽出結果に含める
   * ことを確かめる（受領見積書登録機能の `OcrDataExtractor.tsx` と同じく JSON を整形して表示する）。
   *
   * @requirement quantity-table-generation/REQ-29.7
   */
  it('Claude Vision経路は抽出した表データを整形したテキストとして返す', async () => {
    const { renderPdfPagesToBase64, extractPdfHybrid } =
      await import('../estimate-requests/pdf-text-extractor');
    const { extractWithClaudeVisionForQuantityTable } = await import('../../api/claude-vision');
    vi.mocked(renderPdfPagesToBase64).mockResolvedValue([
      { base64Data: 'dGVzdA==', mediaType: 'image/jpeg' },
    ]);
    vi.mocked(extractWithClaudeVisionForQuantityTable).mockResolvedValue({
      lineItems: VISION_LINE_ITEMS,
      pageCount: 1,
    });

    const result = await extractPdfData(new File(['test'], 'test.pdf'));

    expect(result.extractionType).toBe('pdf-claude-vision');
    expect(result.extractedText).toBe(JSON.stringify(VISION_LINE_ITEMS, null, 2));
    expect(extractPdfHybrid).not.toHaveBeenCalled();
  });

  /**
   * OCR処理が失敗したとき、手動入力を促すエラーメッセージで失敗することを確かめる。
   * 元のエラーの文言（pdfjs-dist の例外文など）は利用者へ出さない。
   *
   * @requirement quantity-table-generation/REQ-29.9
   */
  it('OCR処理が失敗した場合は手動入力を促すエラーメッセージで失敗する', async () => {
    const { renderPdfPagesToBase64, extractPdfHybrid } =
      await import('../estimate-requests/pdf-text-extractor');
    vi.mocked(renderPdfPagesToBase64).mockRejectedValue(new Error('API unavailable'));
    vi.mocked(extractPdfHybrid).mockRejectedValue(new Error('Invalid PDF structure.'));

    const outcome = extractPdfData(new File(['test'], 'test.pdf'));

    await expect(outcome).rejects.toThrow('OCR処理に失敗しました。手動入力してください');
    await expect(outcome).rejects.not.toThrow('Invalid PDF structure.');
  });

  /**
   * OCR処理が30秒を超えたらタイムアウトのメッセージで失敗し、30秒に満たない間は失敗しない
   * ことを偽のタイマーで確かめる（壁時計は使わない）。
   *
   * @requirement quantity-table-generation/REQ-29.10
   */
  it('OCR処理は30秒でタイムアウトし、30秒未満では失敗しない', async () => {
    vi.useFakeTimers();
    const { renderPdfPagesToBase64, extractPdfHybrid } =
      await import('../estimate-requests/pdf-text-extractor');
    vi.mocked(renderPdfPagesToBase64).mockRejectedValue(new Error('API unavailable'));
    vi.mocked(extractPdfHybrid).mockReturnValue(new Promise(() => {}));

    const outcome = track(extractPdfData(new File(['test'], 'test.pdf')));

    await vi.advanceTimersByTimeAsync(29_999);
    expect(outcome.state()).toBe('pending');

    await vi.advanceTimersByTimeAsync(1);
    expect(outcome.state()).toBe('rejected');
    expect((outcome.error() as Error).message).toBe(
      'OCR処理がタイムアウトしました（30秒超過）。手動入力してください'
    );
  });

  /**
   * 30秒の計時は OCR処理（フォールバック）の開始から始まり、Claude Vision API の応答待ちには
   * 課さないことを確かめる。Claude Vision が20秒後に失敗しても、OCR処理にはそこから30秒が与えられる。
   *
   * @requirement quantity-table-generation/REQ-29.10
   */
  it('タイムアウトの計時はClaude Vision APIの応答待ちを含まずOCR処理の開始から始まる', async () => {
    vi.useFakeTimers();
    const { renderPdfPagesToBase64, extractPdfHybrid } =
      await import('../estimate-requests/pdf-text-extractor');
    const { extractWithClaudeVisionForQuantityTable } = await import('../../api/claude-vision');
    vi.mocked(renderPdfPagesToBase64).mockResolvedValue([
      { base64Data: 'dGVzdA==', mediaType: 'image/jpeg' },
    ]);
    vi.mocked(extractWithClaudeVisionForQuantityTable).mockImplementation(
      () =>
        new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Timeout')), 20_000);
        })
    );
    vi.mocked(extractPdfHybrid).mockReturnValue(new Promise(() => {}));

    const outcome = track(extractPdfData(new File(['test'], 'test.pdf')));

    await vi.advanceTimersByTimeAsync(20_000 + 29_999);
    expect(outcome.state()).toBe('pending');

    await vi.advanceTimersByTimeAsync(1);
    expect(outcome.state()).toBe('rejected');
    expect((outcome.error() as Error).message).toContain('タイムアウト');
  });

  /**
   * Claude Vision API の応答が30秒を超えても、成功すればその結果を返すことを確かめる
   * （30秒を抽出処理の全体へ課すと、REQ-30.6 のフォールバックへ到達する前に失敗してしまう）。
   */
  it('Claude Vision APIの応答が30秒を超えても成功すれば結果を返す', async () => {
    vi.useFakeTimers();
    const { renderPdfPagesToBase64, extractPdfHybrid } =
      await import('../estimate-requests/pdf-text-extractor');
    const { extractWithClaudeVisionForQuantityTable } = await import('../../api/claude-vision');
    vi.mocked(renderPdfPagesToBase64).mockResolvedValue([
      { base64Data: 'dGVzdA==', mediaType: 'image/jpeg' },
    ]);
    vi.mocked(extractWithClaudeVisionForQuantityTable).mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(() => resolve({ lineItems: VISION_LINE_ITEMS, pageCount: 1 }), 45_000);
        })
    );

    const outcome = track(extractPdfData(new File(['test'], 'test.pdf')));

    await vi.advanceTimersByTimeAsync(45_000);
    expect(outcome.state()).toBe('resolved');
    expect(outcome.value()?.extractionType).toBe('pdf-claude-vision');
    expect(extractPdfHybrid).not.toHaveBeenCalled();
  });

  /**
   * 30秒以内に完了した OCR処理はタイムアウトのタイマーを残さないことを確かめる。
   */
  it('30秒以内に完了したOCR処理はタイムアウトのタイマーを残さない', async () => {
    vi.useFakeTimers();
    await arrangeFallback('土工\t掘削工\t150\tm3');

    const outcome = track(extractPdfData(new File(['test'], 'test.pdf')));
    await vi.advanceTimersByTimeAsync(0);

    expect(outcome.state()).toBe('resolved');
    expect(vi.getTimerCount()).toBe(0);
  });

  /**
   * タイムアウトした後に OCR処理から届く進捗は通知しないことを確かめる
   * （利用者がリトライした後の表示を古い処理の進捗で上書きしないため）。
   */
  it('タイムアウト後に届いた進捗は通知しない', async () => {
    vi.useFakeTimers();
    const { renderPdfPagesToBase64, extractPdfHybrid } =
      await import('../estimate-requests/pdf-text-extractor');
    vi.mocked(renderPdfPagesToBase64).mockRejectedValue(new Error('API unavailable'));
    let lateProgress: ((progress: number, message?: string) => void) | undefined;
    vi.mocked(extractPdfHybrid).mockImplementation((_file, onProgress) => {
      lateProgress = onProgress;
      return new Promise(() => {});
    });
    const onProgress = vi.fn();

    const outcome = track(extractPdfData(new File(['test'], 'test.pdf'), onProgress));
    await vi.advanceTimersByTimeAsync(30_000);
    expect(outcome.state()).toBe('rejected');

    onProgress.mockClear();
    lateProgress?.(80, '遅れて届いた進捗');
    expect(onProgress).not.toHaveBeenCalled();
  });
});
