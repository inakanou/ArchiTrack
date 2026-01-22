/**
 * @fileoverview Excel出力ユーティリティ 単体テスト
 *
 * Task 14.2, 16.1: Excelエクスポートユーティリティのテスト
 *
 * Requirements:
 * - 13.2: .xlsx形式でファイル生成
 * - 13.3: 任意分類、工種、名称、規格、数量、単位のカラム
 * - 13.4: ファイル名は {内訳書名}_{YYYYMMDD}.xlsx
 * - 13.5: 数量は数値として出力、小数点以下2桁精度
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ItemizedStatementItemInfo } from '../types/itemized-statement.types';

// xlsxライブラリのモック
vi.mock('xlsx', () => ({
  utils: {
    json_to_sheet: vi.fn(() => ({})),
    book_new: vi.fn(() => ({})),
    book_append_sheet: vi.fn(),
  },
  writeFile: vi.fn(),
}));

// テスト前にモジュールをインポート（モック後）
import { exportToExcel, formatItemsForExcel, generateExcelFileName } from './export-excel';
import * as XLSX from 'xlsx';

// ============================================================================
// テストデータ
// ============================================================================

const mockItems: ItemizedStatementItemInfo[] = [
  {
    id: '1',
    customCategory: 'カテゴリA',
    workType: '工種1',
    name: '品目1',
    specification: '規格A',
    unit: 'm',
    quantity: 123.45,
  },
  {
    id: '2',
    customCategory: null,
    workType: '工種2',
    name: '品目2',
    specification: null,
    unit: 'm2',
    quantity: 0.5,
  },
  {
    id: '3',
    customCategory: 'カテゴリB',
    workType: null,
    name: null,
    specification: '規格B',
    unit: null,
    quantity: 1000,
  },
];

// ============================================================================
// テストスイート
// ============================================================================

describe('export-excel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // 日付を固定
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-22T10:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('generateExcelFileName', () => {
    it('内訳書名と日付からファイル名を生成する (Req 13.4)', () => {
      const fileName = generateExcelFileName('テスト内訳書');
      expect(fileName).toBe('テスト内訳書_20260122.xlsx');
    });

    it('ファイル名に使用できない文字を置換する', () => {
      const fileName = generateExcelFileName('テスト/内訳書\\名:前');
      // スラッシュ、バックスラッシュ、コロンをアンダースコアに置換
      expect(fileName).toBe('テスト_内訳書_名_前_20260122.xlsx');
    });

    it('空白を含む内訳書名も正しく処理する', () => {
      const fileName = generateExcelFileName('テスト 内訳書');
      expect(fileName).toBe('テスト 内訳書_20260122.xlsx');
    });
  });

  describe('formatItemsForExcel', () => {
    it('項目をExcelエクスポート用の形式に変換する (Req 13.3)', () => {
      const formatted = formatItemsForExcel(mockItems);

      expect(formatted).toHaveLength(3);
      expect(formatted[0]).toEqual({
        任意分類: 'カテゴリA',
        工種: '工種1',
        名称: '品目1',
        規格: '規格A',
        数量: 123.45,
        単位: 'm',
      });
    });

    it('null値を空文字に変換する', () => {
      const formatted = formatItemsForExcel(mockItems);

      // 2番目の項目（null値を含む）
      expect(formatted[1]).toEqual({
        任意分類: '',
        工種: '工種2',
        名称: '品目2',
        規格: '',
        数量: 0.5,
        単位: 'm2',
      });

      // 3番目の項目（複数のnull値）
      expect(formatted[2]).toEqual({
        任意分類: 'カテゴリB',
        工種: '',
        名称: '',
        規格: '規格B',
        数量: 1000,
        単位: '',
      });
    });

    it('数量を数値型のまま維持する (Req 13.5)', () => {
      const formatted = formatItemsForExcel(mockItems);

      // 配列が空でないことを確認
      expect(formatted.length).toBe(3);

      // 数量が数値型であることを確認
      expect(typeof formatted[0]?.数量).toBe('number');
      expect(typeof formatted[1]?.数量).toBe('number');
      expect(typeof formatted[2]?.数量).toBe('number');

      // 値が正確であることを確認
      expect(formatted[0]?.数量).toBe(123.45);
      expect(formatted[1]?.数量).toBe(0.5);
      expect(formatted[2]?.数量).toBe(1000);
    });

    it('空配列を処理できる', () => {
      const formatted = formatItemsForExcel([]);
      expect(formatted).toEqual([]);
    });

    it('ヘッダー行の順序が正しい (Req 13.3)', () => {
      const formatted = formatItemsForExcel(mockItems);
      expect(formatted.length).toBeGreaterThan(0);
      const firstItem = formatted[0];
      expect(firstItem).toBeDefined();
      if (firstItem) {
        const keys = Object.keys(firstItem);
        expect(keys).toEqual(['任意分類', '工種', '名称', '規格', '数量', '単位']);
      }
    });
  });

  describe('exportToExcel', () => {
    it('Excelファイルを正常に生成する (Req 13.2)', () => {
      const result = exportToExcel({
        items: mockItems,
        statementName: 'テスト内訳書',
      });

      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();

      // xlsxライブラリの関数が正しく呼ばれたことを確認
      expect(XLSX.utils.json_to_sheet).toHaveBeenCalled();
      expect(XLSX.utils.book_new).toHaveBeenCalled();
      expect(XLSX.utils.book_append_sheet).toHaveBeenCalled();
      expect(XLSX.writeFile).toHaveBeenCalledWith(expect.anything(), 'テスト内訳書_20260122.xlsx');
    });

    it('空の項目配列でも正常に生成する（ヘッダーのみ）', () => {
      const result = exportToExcel({
        items: [],
        statementName: 'ヘッダーのみ内訳書',
      });

      expect(result.success).toBe(true);
      expect(XLSX.writeFile).toHaveBeenCalled();
    });

    it('エラー発生時はエラー情報を返却する (Req 13.8)', () => {
      // writeFileでエラーをスローするようにモック
      vi.mocked(XLSX.writeFile).mockImplementationOnce(() => {
        throw new Error('ファイル書き込みエラー');
      });

      const result = exportToExcel({
        items: mockItems,
        statementName: 'エラーテスト',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('ファイル書き込みエラー');
    });

    it('未知のエラーも適切にハンドリングする', () => {
      vi.mocked(XLSX.writeFile).mockImplementationOnce(() => {
        throw 'unknown error';
      });

      const result = exportToExcel({
        items: mockItems,
        statementName: 'エラーテスト',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Excelファイルの生成に失敗しました');
    });

    it('json_to_sheetに正しいデータが渡される', () => {
      exportToExcel({
        items: mockItems,
        statementName: 'テスト内訳書',
      });

      const expectedData = formatItemsForExcel(mockItems);
      expect(XLSX.utils.json_to_sheet).toHaveBeenCalledWith(expectedData, {
        header: ['任意分類', '工種', '名称', '規格', '数量', '単位'],
      });
    });

    it('ワークシート名が「内訳書」である', () => {
      exportToExcel({
        items: mockItems,
        statementName: 'テスト内訳書',
      });

      expect(XLSX.utils.book_append_sheet).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        '内訳書'
      );
    });
  });

  describe('小数点精度', () => {
    it('小数点以下2桁の数量が正確に保持される (Req 13.5)', () => {
      const itemsWithPrecision: ItemizedStatementItemInfo[] = [
        {
          id: '1',
          customCategory: null,
          workType: null,
          name: null,
          specification: null,
          unit: null,
          quantity: 0.01,
        },
        {
          id: '2',
          customCategory: null,
          workType: null,
          name: null,
          specification: null,
          unit: null,
          quantity: 999999.99,
        },
        {
          id: '3',
          customCategory: null,
          workType: null,
          name: null,
          specification: null,
          unit: null,
          quantity: -123.45,
        },
      ];

      const formatted = formatItemsForExcel(itemsWithPrecision);

      expect(formatted.length).toBe(3);
      expect(formatted[0]?.数量).toBe(0.01);
      expect(formatted[1]?.数量).toBe(999999.99);
      expect(formatted[2]?.数量).toBe(-123.45);
    });
  });
});
