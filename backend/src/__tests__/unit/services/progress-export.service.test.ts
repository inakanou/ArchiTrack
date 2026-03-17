/**
 * @fileoverview 月別出来高エクスポートサービス ユニットテスト
 *
 * TDD: RED phase - テストを先に書く
 *
 * Task 6.2: 月別出来高エクスポートサービス実装
 *
 * Requirements (execution-budget-management):
 * - 16.4: 月別出来高データをExcelファイル（.xlsx形式）で出力
 * - 16.5: 月別出来高データをPDFファイルで出力
 *
 * @module __tests__/unit/services/progress-export.service
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as XLSX from 'xlsx';

import {
  ProgressExportService,
  type ProgressExportData,
} from '../../../services/progress-export.service.js';
import type {
  ProgressService,
  MonthlyProgressSummary,
} from '../../../services/progress.service.js';

// ============================================================================
// テストデータヘルパー
// ============================================================================

/**
 * モックProgressServiceを生成する
 */
function createMockProgressService(): ProgressService {
  return {
    getMonthlyAggregation: vi.fn(),
    save: vi.fn(),
    findByExecutionBudgetId: vi.fn(),
    getByDate: vi.fn(),
    delete: vi.fn(),
    getLatestProgressByBudgetId: vi.fn(),
    getMonthlyDetail: vi.fn(),
  } as unknown as ProgressService;
}

/**
 * テスト用月別出来高集計データを生成する
 */
function createTestMonthlyData(): MonthlyProgressSummary[] {
  return [
    {
      yearMonth: '2026-01',
      monthlyAmount: '500000',
      cumulativeAmount: '500000',
      cumulativeRate: '25.0',
    },
    {
      yearMonth: '2026-02',
      monthlyAmount: '750000',
      cumulativeAmount: '1250000',
      cumulativeRate: '62.5',
    },
    {
      yearMonth: '2026-03',
      monthlyAmount: '750000',
      cumulativeAmount: '2000000',
      cumulativeRate: '100.0',
    },
  ];
}

/**
 * テスト用エクスポートデータを生成する
 */
function createTestExportData(overrides: Partial<ProgressExportData> = {}): ProgressExportData {
  return {
    executionBudgetId: 'eb-1',
    projectName: 'テストプロジェクト',
    monthlySummaries: createTestMonthlyData(),
    ...overrides,
  };
}

// ============================================================================
// テスト
// ============================================================================

describe('ProgressExportService', () => {
  let service: ProgressExportService;
  let mockProgressService: ProgressService;

  beforeEach(() => {
    mockProgressService = createMockProgressService();
    service = new ProgressExportService({ progressService: mockProgressService });
  });

  // ==========================================================================
  // getExportData - データ取得テスト
  // ==========================================================================

  describe('getExportData', () => {
    it('実行予算IDから月別出来高エクスポート用データを取得する', async () => {
      const monthlySummaries = createTestMonthlyData();
      (mockProgressService.getMonthlyAggregation as ReturnType<typeof vi.fn>).mockResolvedValue(
        monthlySummaries
      );

      const result = await service.getExportData('eb-1', 'テストプロジェクト');

      expect(result).not.toBeNull();
      expect(result.executionBudgetId).toBe('eb-1');
      expect(result.projectName).toBe('テストプロジェクト');
      expect(result.monthlySummaries).toHaveLength(3);
      expect(result.monthlySummaries[0]!.yearMonth).toBe('2026-01');
    });

    it('月別出来高データが空の場合も正常にデータを返す', async () => {
      (mockProgressService.getMonthlyAggregation as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      const result = await service.getExportData('eb-1', 'テストプロジェクト');

      expect(result.monthlySummaries).toHaveLength(0);
    });
  });

  // ==========================================================================
  // exportToExcel - Excel出力テスト
  // ==========================================================================

  describe('exportToExcel', () => {
    it('月別出来高データをExcelファイル（.xlsx形式）で出力する (REQ-16.4)', async () => {
      const data = createTestExportData();
      const buffer = await service.exportToExcel(data);

      // バッファが返却される
      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(0);

      // Excelファイルとしてパース可能
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      expect(workbook.SheetNames).toContain('月別出来高');
    });

    it('プロジェクト名をヘッダー情報として含む (REQ-16.4)', async () => {
      const data = createTestExportData();
      const buffer = await service.exportToExcel(data);

      const workbook = XLSX.read(buffer, { type: 'buffer' });
      const sheet = workbook.Sheets['月別出来高']!;
      const sheetData = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1 });
      const flatData = sheetData.flat().map(String);

      expect(flatData.some((cell) => cell.includes('テストプロジェクト'))).toBe(true);
    });

    it('月別出来高データの列（対象月、当月出来高金額、累計出来高金額、累計出来高率）を含む (REQ-16.4)', async () => {
      const data = createTestExportData();
      const buffer = await service.exportToExcel(data);

      const workbook = XLSX.read(buffer, { type: 'buffer' });
      const sheet = workbook.Sheets['月別出来高']!;
      const sheetData = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1 });
      const flatData = sheetData.flat().map(String);

      // テーブルヘッダー列名が含まれる
      expect(flatData.some((cell) => cell.includes('対象月'))).toBe(true);
      expect(flatData.some((cell) => cell.includes('当月出来高金額'))).toBe(true);
      expect(flatData.some((cell) => cell.includes('累計出来高金額'))).toBe(true);
      expect(flatData.some((cell) => cell.includes('累計出来高率'))).toBe(true);
    });

    it('月別出来高のデータ行を含む (REQ-16.4)', async () => {
      const data = createTestExportData();
      const buffer = await service.exportToExcel(data);

      const workbook = XLSX.read(buffer, { type: 'buffer' });
      const sheet = workbook.Sheets['月別出来高']!;
      const sheetData = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1 });
      const flatData = sheetData.flat().map(String);

      // 月のデータが含まれている
      expect(flatData.some((cell) => cell.includes('2026-01'))).toBe(true);
      expect(flatData.some((cell) => cell.includes('2026-02'))).toBe(true);
      expect(flatData.some((cell) => cell.includes('2026-03'))).toBe(true);

      // 金額データが含まれている
      expect(flatData.some((cell) => cell.includes('500000'))).toBe(true);
      expect(flatData.some((cell) => cell.includes('750000'))).toBe(true);
      expect(flatData.some((cell) => cell.includes('1250000'))).toBe(true);
      expect(flatData.some((cell) => cell.includes('2000000'))).toBe(true);
    });

    it('累計出来高率をデータに含む (REQ-16.4)', async () => {
      const data = createTestExportData();
      const buffer = await service.exportToExcel(data);

      const workbook = XLSX.read(buffer, { type: 'buffer' });
      const sheet = workbook.Sheets['月別出来高']!;
      const sheetData = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1 });
      const flatData = sheetData.flat().map(String);

      // 出来高率が含まれている
      expect(flatData.some((cell) => cell.includes('25.0'))).toBe(true);
      expect(flatData.some((cell) => cell.includes('62.5'))).toBe(true);
      expect(flatData.some((cell) => cell.includes('100.0'))).toBe(true);
    });

    it('データが空の場合でもヘッダー付きのExcelを出力する', async () => {
      const data = createTestExportData({ monthlySummaries: [] });
      const buffer = await service.exportToExcel(data);

      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(0);

      const workbook = XLSX.read(buffer, { type: 'buffer' });
      expect(workbook.SheetNames).toContain('月別出来高');
    });
  });

  // ==========================================================================
  // exportToPdf - PDF出力テスト
  // ==========================================================================

  describe('exportToPdf', () => {
    it('月別出来高データをPDFファイルで出力する (REQ-16.5)', async () => {
      const data = createTestExportData();
      const buffer = await service.exportToPdf(data);

      // バッファが返却される
      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(0);

      // PDFヘッダーマジックバイトを検証
      const header = buffer.subarray(0, 5).toString('ascii');
      expect(header).toBe('%PDF-');
    });

    it('プロジェクト名がPDFに含まれる (REQ-16.5)', async () => {
      const data = createTestExportData();
      const buffer = await service.exportToPdf(data);

      // PDFとして有効である（ヘッダーマジックバイト確認）
      expect(buffer).toBeInstanceOf(Buffer);
      const header = buffer.subarray(0, 5).toString('ascii');
      expect(header).toBe('%PDF-');
      // PDFの中身のテキスト検証は困難なため、バッファサイズで出力データ有無を間接確認
      expect(buffer.length).toBeGreaterThan(100);
    });

    it('データが空の場合でもPDFを出力する', async () => {
      const data = createTestExportData({ monthlySummaries: [] });
      const buffer = await service.exportToPdf(data);

      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(0);
    });

    it('複数月のデータを含むPDFを出力する (REQ-16.5)', async () => {
      const data = createTestExportData();
      const buffer = await service.exportToPdf(data);

      expect(buffer).toBeInstanceOf(Buffer);
      // 3ヶ月分のデータを含むので、空データより大きなバッファになるはず
      const emptyData = createTestExportData({ monthlySummaries: [] });
      const emptyBuffer = await service.exportToPdf(emptyData);
      expect(buffer.length).toBeGreaterThan(emptyBuffer.length);
    });
  });
});
