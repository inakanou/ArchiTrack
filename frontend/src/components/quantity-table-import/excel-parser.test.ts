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

  /**
   * 全シートを解析対象とすること（受入基準 28.2）と、読み取りの出所が SheetJS ただ一つで
   * あること（受入基準 28.1）を、この区間が確かめる。
   *
   * シートを二枚（`Sheet1` に2行・`Sheet2` に1行）与えて抽出行が合計 3 行になることを主張する
   * ため、この数はシートをまたいで積み上げた結果でしか満たせない。`sheetNames` と行の中身は
   * いずれもモックした `XLSX.read` の返り値からのみ導かれる。
   *
   * 二つの変異を当てて実測した（2026-09-14、基線コミット 47a4dde4 の作業ツリー）。
   * `excel-parser.ts` の `workbook.SheetNames` を `workbook.SheetNames.slice(0, 1)` へ変えると
   * 本ファイルは 2 failed | 4 passed (6) になる。`XLSX.read(arrayBuffer, { type: 'array' })` を
   * SheetJS を経由しない workbook リテラルへ差し替えると 4 failed | 2 passed (6) になる。
   * どちらの変異でも本区間は落ちる側に入る。
   *
   * @requirement quantity-table-generation/REQ-28.1
   * @requirement quantity-table-generation/REQ-28.2
   */
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

  /**
   * 本区間と次の区間は受入基準 28.3 を名乗らない（無タグである理由をここに残す。115.176）。
   *
   * 28.3 が課すのは列データを数量項目の対応フィールド（大項目・中項目・小項目・任意分類・
   * 工種・名称・規格・数量・単位・備考）へマッピングすることである。その実体は
   * `frontend/src/components/quantity-table-import/field-mapping.ts` の `MAPPING_RULES` に在り、
   * `parseExcelFile` は列名と列値を元の並びのまま返すだけでマッピング先を決めない。
   * 本区間が主張するのは検出した列見出しの字面であってマッピングではないため、
   * ここで 28.3 を名乗ると当該検証が確かめていない条文を被覆と数えることになる（86.3）。
   * 28.3 の被覆は `e2e/specs/quantity-tables/import-e2e.spec.ts` の区間が担っている。
   */
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

  /**
   * Excelファイルの読み取りが失敗したとき、手動入力を促すエラーメッセージで失敗することを確かめる。
   * 元のエラーの文言（SheetJS の例外文など）は利用者へ出さない。
   * ダイアログでの表示は `e2e/specs/quantity-tables/import-e2e.spec.ts` の REQ-28.6 の区間が確かめる。
   *
   * @requirement quantity-table-generation/REQ-28.6
   */
  it('ファイル読み取り失敗時は手動入力を促すエラーメッセージで失敗する', async () => {
    vi.mocked(XLSX.read).mockImplementation(() => {
      throw new Error('Invalid file format');
    });

    const outcome = parseExcelFile(createMockFile('test.xlsx'));

    await expect(outcome).rejects.toThrow(
      'Excelファイルの読み取りに失敗しました。手動入力してください'
    );
    await expect(outcome).rejects.not.toThrow('Invalid file format');
  });

  /**
   * 読み取り後のシートの変換で失敗した場合も、同じメッセージで失敗することを確かめる。
   *
   * @requirement quantity-table-generation/REQ-28.6
   */
  it('シートの変換で失敗した場合も手動入力を促すエラーメッセージで失敗する', async () => {
    vi.mocked(XLSX.read).mockReturnValue({
      SheetNames: ['Sheet1'],
      Sheets: { Sheet1: {} },
    } as unknown as XLSX.WorkBook);
    vi.mocked(XLSX.utils.sheet_to_json).mockImplementationOnce(() => {
      throw new Error('Corrupted sheet');
    });

    const outcome = parseExcelFile(createMockFile('test.xlsx'));

    await expect(outcome).rejects.toThrow(
      'Excelファイルの読み取りに失敗しました。手動入力してください'
    );
    await expect(outcome).rejects.not.toThrow('Corrupted sheet');
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
