/**
 * Excelデータパース機能の単体テスト
 *
 * Task 44.1 + 48.1: Excelデータパース機能
 *
 * Requirements:
 * - 28.1: SheetJS（xlsx）ライブラリを使用してExcelデータを直接読み取る
 * - 28.2: Excelファイルの全シートを解析対象とする
 * - 28.3: 列データを数量項目の対応フィールドにマッピングする
 * - 28.6: ファイル読み取り失敗時はエラーメッセージを返す
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ImportExtractionResult } from '../../types/quantity-import.types';

// Mock xlsx module
vi.mock('xlsx', () => {
  return {
    read: vi.fn(),
    utils: {
      sheet_to_json: vi.fn(),
    },
  };
});

import * as XLSX from 'xlsx';
import { parseExcelFile } from './excel-parser';

/**
 * テスト用のFileオブジェクトを作成する（arrayBuffer()メソッド付き）
 */
function createMockFile(name: string): File {
  const content = new Uint8Array([0x50, 0x4b]); // PK header
  const blob = new Blob([content]);
  const file = new File([blob], name);
  // jsdomではFile.arrayBuffer()が未実装の場合があるため、明示的に定義
  if (!file.arrayBuffer) {
    file.arrayBuffer = () => Promise.resolve(content.buffer as ArrayBuffer);
  }
  return file;
}

describe('parseExcelFile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('Excelファイルの全シートを解析してImportExtractionResult形式で返す', async () => {
    // Arrange
    const mockWorkbook = {
      SheetNames: ['Sheet1', 'Sheet2'],
      Sheets: {
        Sheet1: {},
        Sheet2: {},
      },
    };

    const mockSheet1Rows = [
      { 大項目: '土工', 工種: '土工', 名称: '掘削工', 数量: 150, 単位: 'm3' },
      { 大項目: '土工', 工種: '土工', 名称: '埋戻し', 数量: 80, 単位: 'm3' },
    ];

    const mockSheet2Rows = [{ 工種: '仮設', 名称: '仮設工', 数量: 1, 単位: '式' }];

    vi.mocked(XLSX.read).mockReturnValue(mockWorkbook as unknown as XLSX.WorkBook);
    vi.mocked(XLSX.utils.sheet_to_json)
      .mockReturnValueOnce(mockSheet1Rows)
      .mockReturnValueOnce(mockSheet2Rows);

    const file = createMockFile('test.xlsx');

    // Act
    const result: ImportExtractionResult = await parseExcelFile(file);

    // Assert
    expect(result.extractionType).toBe('excel-parse');
    expect(result.sheetNames).toEqual(['Sheet1', 'Sheet2']);
    expect(result.headers.length).toBeGreaterThan(0);
    expect(result.rows.length).toBe(3); // 2 + 1
  });

  it('ヘッダー行を自動検出して列ヘッダーとして返す', async () => {
    const mockWorkbook = {
      SheetNames: ['Sheet1'],
      Sheets: { Sheet1: {} },
    };

    const mockRows = [
      { 工種: '土工', 名称: '掘削工', 規格: 'バックホウ', 数量: 150, 単位: 'm3', 備考: '' },
    ];

    vi.mocked(XLSX.read).mockReturnValue(mockWorkbook as unknown as XLSX.WorkBook);
    vi.mocked(XLSX.utils.sheet_to_json).mockReturnValue(mockRows);

    const file = createMockFile('test.xlsx');

    const result = await parseExcelFile(file);

    expect(result.headers).toEqual(
      expect.arrayContaining(['工種', '名称', '規格', '数量', '単位', '備考'])
    );
  });

  it('データ行の列値を文字列配列として抽出する', async () => {
    const mockWorkbook = {
      SheetNames: ['Sheet1'],
      Sheets: { Sheet1: {} },
    };

    const mockRows = [{ 工種: '土工', 名称: '掘削工', 数量: 150, 単位: 'm3' }];

    vi.mocked(XLSX.read).mockReturnValue(mockWorkbook as unknown as XLSX.WorkBook);
    vi.mocked(XLSX.utils.sheet_to_json).mockReturnValue(mockRows);

    const file = createMockFile('test.xlsx');

    const result = await parseExcelFile(file);

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.columns).toEqual(
      expect.arrayContaining(['土工', '掘削工', '150', 'm3'])
    );
    expect(result.rows[0]?.sourceRowIndex).toBe(0);
  });

  it('シート名一覧をextractionResultに含める', async () => {
    const mockWorkbook = {
      SheetNames: ['数量表', '内訳書'],
      Sheets: {
        数量表: {},
        内訳書: {},
      },
    };

    vi.mocked(XLSX.read).mockReturnValue(mockWorkbook as unknown as XLSX.WorkBook);
    vi.mocked(XLSX.utils.sheet_to_json).mockReturnValue([]);

    const file = createMockFile('test.xlsx');

    const result = await parseExcelFile(file);

    expect(result.sheetNames).toEqual(['数量表', '内訳書']);
  });

  it('ファイル読み取り失敗時はエラーをスローする', async () => {
    vi.mocked(XLSX.read).mockImplementation(() => {
      throw new Error('Invalid file format');
    });

    const file = createMockFile('test.xlsx');

    await expect(parseExcelFile(file)).rejects.toThrow();
  });

  it('空のシートがある場合はスキップして処理を継続する', async () => {
    const mockWorkbook = {
      SheetNames: ['Sheet1', 'Empty'],
      Sheets: {
        Sheet1: {},
        Empty: {},
      },
    };

    const mockRows = [{ 工種: '土工', 名称: '掘削工' }];

    vi.mocked(XLSX.read).mockReturnValue(mockWorkbook as unknown as XLSX.WorkBook);
    vi.mocked(XLSX.utils.sheet_to_json).mockReturnValueOnce(mockRows).mockReturnValueOnce([]); // Empty sheet

    const file = createMockFile('test.xlsx');

    const result = await parseExcelFile(file);

    expect(result.rows).toHaveLength(1);
  });
});
