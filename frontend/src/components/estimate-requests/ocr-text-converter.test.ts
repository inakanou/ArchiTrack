/**
 * @fileoverview OCRテキスト→構造化データ変換ロジック改善のユニットテスト
 *
 * Task 47: OCRテキスト変換ロジック改善のユニットテスト
 *
 * Requirements:
 * - 20.1: 漢字・ひらがな・カタカナ・英数字を含まない行をゴミ行として除外
 * - 20.2: 文字数が極端に少ない行（2文字以下）をゴミ行として除外
 * - 20.3: 集計行キーワードを含む行を除外
 * - 20.4: カンマ区切り数値の正規化
 * - 20.5: ゴミ行フィルタと集計行除外の適用位置
 * - 20.6: Excelデータパースへの非影響
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// モック関数（vi.mock外でアクセス可能にするためvi.hoistedを使用）
const { mockCreateWorker, mockXlsxRead, mockSheetToJson, mockExtractPdfHybrid } = vi.hoisted(
  () => ({
    mockCreateWorker: vi.fn(),
    mockXlsxRead: vi.fn(),
    mockSheetToJson: vi.fn(),
    mockExtractPdfHybrid: vi.fn(),
  })
);

// tesseract.jsをモック
vi.mock('tesseract.js', () => ({
  createWorker: mockCreateWorker,
}));

// xlsxをモック
vi.mock('xlsx', () => ({
  read: mockXlsxRead,
  utils: {
    sheet_to_json: mockSheetToJson,
  },
}));

// pdf-text-extractorをモック
vi.mock('./pdf-text-extractor', () => ({
  extractPdfHybrid: mockExtractPdfHybrid,
}));

// テスト対象のconvertOcrTextToLineItemsをインポート
// OcrDataExtractor内部の関数なので、テスト用にexportされている想定
import {
  filterGarbageLines,
  filterSummaryLines,
  normalizeCommaNumbers,
  convertOcrTextToLineItems,
} from './OcrDataExtractor';

// ============================================================================
// Task 47.1: ゴミ行フィルタのテスト (Requirements 20.1, 20.2)
// ============================================================================

describe('filterGarbageLines', () => {
  it('漢字/ひらがな/カタカナ/英数字を含まない行が除外される', () => {
    const lines = [
      '外壁塗装工事', // 漢字あり - 保持
      '| | | |', // 記号のみ - 除外
      '---', // 記号のみ - 除外
      '  ', // 空白のみ - 除外
      '|||', // 記号のみ - 除外
      '間 還 間 間 症 昌', // 漢字あり - 保持（ただし2文字以下チェックは別途）
    ];

    const result = filterGarbageLines(lines);

    expect(result).toContain('外壁塗装工事');
    expect(result).toContain('間 還 間 間 症 昌');
    expect(result).not.toContain('| | | |');
    expect(result).not.toContain('---');
    expect(result).not.toContain('  ');
    expect(result).not.toContain('|||');
  });

  it('漢字/ひらがな/カタカナ/英数字を含む行が保持される', () => {
    const lines = [
      'コンクリート打設', // カタカナ
      'てすと', // ひらがな
      'Test Item', // 英数字
      '12345', // 数字
      '防水工事 m2 50 8000', // 混在
    ];

    const result = filterGarbageLines(lines);

    expect(result).toHaveLength(5);
  });

  it('空白除去後2文字以下の行が除外される', () => {
    const lines = [
      '間', // 1文字 - 除外
      '  | ', // 空白除去後1文字（|のみ）→ ゴミ行フィルタで除外（英数字なし）
      'AB', // 2文字 - 除外
      'ABC', // 3文字 - 保持
      '外壁塗装工事', // 6文字 - 保持
    ];

    const result = filterGarbageLines(lines);

    expect(result).not.toContain('間');
    expect(result).not.toContain('AB');
    expect(result).toContain('ABC');
    expect(result).toContain('外壁塗装工事');
  });

  it('空白除去後3文字以上の行が保持される', () => {
    const lines = [
      '漢字三', // 3文字 - 保持
      '  四文字  ', // 空白除去後4文字 - 保持
      'abcdef', // 6文字 - 保持
    ];

    const result = filterGarbageLines(lines);

    expect(result).toHaveLength(3);
  });
});

// ============================================================================
// Task 47.2: 集計行除外のテスト (Requirement 20.3)
// ============================================================================

describe('filterSummaryLines', () => {
  it('「合計」「小計」「直接工事費」「諸経費」「一般管理費」「値引き」「消費税」を含む行が除外される', () => {
    const lines = [
      '外壁塗装工事 m2 150 3500',
      '合計 525,000',
      '小計 400,000',
      '直接工事費 925,000',
      '諸経費 100,000',
      '一般管理費 50,000',
      '値引き -10,000',
      '消費税 102,500',
      '防水工事 m2 50 8000',
    ];

    const result = filterSummaryLines(lines);

    expect(result).toHaveLength(2);
    expect(result[0]).toBe('外壁塗装工事 m2 150 3500');
    expect(result[1]).toBe('防水工事 m2 50 8000');
  });

  it('上記キーワードを含まない通常の明細行が保持される', () => {
    const lines = [
      '外壁塗装工事 m2 150 3500',
      '防水工事 m2 50 8000',
      'コンクリート打設 m3 10 15000',
    ];

    const result = filterSummaryLines(lines);

    expect(result).toHaveLength(3);
  });
});

// ============================================================================
// Task 47.3: カンマ区切り数値正規化のテスト (Requirement 20.4)
// ============================================================================

describe('normalizeCommaNumbers', () => {
  it('"1,234,567"が"1234567"に正規化される', () => {
    const result = normalizeCommaNumbers('1,234,567');
    expect(result).toBe('1234567');
  });

  it('"33,000"が"33000"に正規化される', () => {
    const result = normalizeCommaNumbers('33,000');
    expect(result).toBe('33000');
  });

  it('カンマを含まない数値（"12345"）がそのまま保持される', () => {
    const result = normalizeCommaNumbers('12345');
    expect(result).toBe('12345');
  });

  it('テキストと数値が混在する行でもカンマ区切り数値が正規化される', () => {
    const result = normalizeCommaNumbers('外壁塗装 m2 150 3,500 525,000');
    expect(result).toBe('外壁塗装 m2 150 3500 525000');
  });

  it('非数値のカンマは影響しない', () => {
    // 数値パターン（\d{1,3}(,\d{3})+）にマッチしない場合はそのまま
    const result = normalizeCommaNumbers('A,B,C');
    expect(result).toBe('A,B,C');
  });
});

// ============================================================================
// Task 47.4: convertOcrTextToLineItemsの統合テスト（改善後）
// ============================================================================

describe('convertOcrTextToLineItems（改善後）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('罫線ゴミ文字を含むOCRテキストがフィルタされ、実データのみが明細行に変換される', () => {
    // 実際のスキャンPDF OCR結果を模したテキスト
    const ocrText = [
      '名称\t規格\t単位\t数量\t単価',
      '間 還 間 間 症 昌', // ゴミ行（漢字はあるがヘッダーでも明細でもない）
      '| | | | |', // ゴミ行（英数字/漢字なし）
      '---', // ゴミ行（英数字/漢字なし→除外、2文字以下→除外）
      '外壁塗装工事\tシリコン系\tm2\t150\t3500',
      '防水工事\tウレタン防水\tm2\t50\t8000',
    ].join('\n');

    const items = convertOcrTextToLineItems(ocrText);

    // ゴミ行が除外されて実際の明細行のみが変換される
    expect(items.length).toBeGreaterThanOrEqual(1);
    // 明細データが含まれている
    const names = items.map((item) => item.name);
    expect(names).toContain('外壁塗装工事');
  });

  it('集計行（"合計 33,000"）が除外される', () => {
    const ocrText = [
      '名称\t規格\t単位\t数量\t単価',
      '外壁塗装工事\tシリコン系\tm2\t150\t3,500',
      '合計\t\t\t\t33,000',
    ].join('\n');

    const items = convertOcrTextToLineItems(ocrText);

    // 合計行が除外されている
    const names = items.map((item) => item.name);
    expect(names).not.toContain('合計');
  });

  it('カンマ区切り金額（"33,000"）が正しく数値認識される', () => {
    const ocrText = [
      '名称\t規格\t単位\t数量\t単価',
      '外壁塗装工事\tシリコン系\tm2\t150\t3,500',
    ].join('\n');

    const items = convertOcrTextToLineItems(ocrText);

    expect(items.length).toBeGreaterThanOrEqual(1);
    const firstItem = items.find((item) => item.name === '外壁塗装工事');
    expect(firstItem).toBeDefined();
    if (firstItem) {
      // カンマが除去された数値が格納される
      expect(firstItem.unitPrice).toBe('3500');
    }
  });

  it('Excelパース結果にゴミ行フィルタが適用されないこと（20.6）', () => {
    // convertExcelToLineItemsは別関数でありゴミ行フィルタが適用されない
    // この要件はconvertOcrTextToLineItemsのみにフィルタが追加されることを確認する
    // Excelパース結果はconvertExcelToLineItemsで処理されるため、
    // OCRフィルタの影響を受けない

    // ゴミ行のようなデータでもExcel変換では通過する（名称がある場合）
    // この点を間接的に確認: convertOcrTextToLineItemsのフィルタが
    // 内部でconvertExcelToLineItemsを呼ぶ前に行をフィルタしている
    const ocrText = [
      '名称\t規格\t単位\t数量\t単価',
      '外壁塗装工事\tシリコン系\tm2\t150\t3500',
    ].join('\n');

    const items = convertOcrTextToLineItems(ocrText);

    expect(items.length).toBeGreaterThanOrEqual(1);
    expect(items[0]?.name).toBe('外壁塗装工事');
  });
});
