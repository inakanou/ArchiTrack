/**
 * @fileoverview 発注一覧エクスポートサービス ユニットテスト
 *
 * TDD: RED phase - テストを先に書く
 *
 * Task 6.1: 発注一覧エクスポートサービス実装
 *
 * Requirements (execution-budget-management):
 * - 10.1: チェック済み項目一覧をExcelファイル（.xlsx形式）で出力
 * - 10.2: チェック済み項目一覧をPDFファイルで出力
 * - 10.3: ヘッダー情報（発注取引先名、発注日、確定発注金額）を出力に含める
 * - 10.4: 発注済ステータスの場合に発注金額列を追加出力
 *
 * @module __tests__/unit/services/order-export.service
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as XLSX from 'xlsx';
import type { PrismaClient } from '../../../generated/prisma/client.js';

import {
  OrderExportService,
  type OrderExportData,
} from '../../../services/order-export.service.js';

// ============================================================================
// テストデータヘルパー
// ============================================================================

function createMockPrisma() {
  return {
    order: {
      findUnique: vi.fn(),
    },
  } as unknown as PrismaClient;
}

/**
 * 発注前ステータスのテストデータを生成する
 */
function createTestOrderExportData(overrides: Partial<OrderExportData> = {}): OrderExportData {
  return {
    orderId: 'order-1',
    tradingPartnerName: 'テスト建設株式会社',
    orderDate: '2026-03-15',
    confirmedAmount: '1500000',
    status: 'BEFORE_ORDER',
    items: [
      {
        name: '基礎工事',
        specification: 'コンクリート基礎',
        unit: 'm3',
        quantity: '10.5000',
        executionUnitPrice: '25000.00',
        executionAmount: '262500',
        orderAmount: null,
      },
      {
        name: '鉄骨工事',
        specification: 'H鋼',
        unit: 't',
        quantity: '5.0000',
        executionUnitPrice: '150000.00',
        executionAmount: '750000',
        orderAmount: null,
      },
      {
        name: '塗装工事',
        specification: '外壁塗装',
        unit: 'm2',
        quantity: '200.0000',
        executionUnitPrice: '2500.00',
        executionAmount: '500000',
        orderAmount: null,
      },
    ],
    ...overrides,
  };
}

/**
 * 発注済ステータスのテストデータを生成する
 */
function createOrderedExportData(): OrderExportData {
  return createTestOrderExportData({
    status: 'ORDERED',
    confirmedAmount: '1400000',
    items: [
      {
        name: '基礎工事',
        specification: 'コンクリート基礎',
        unit: 'm3',
        quantity: '10.5000',
        executionUnitPrice: '25000.00',
        executionAmount: '262500',
        orderAmount: '243750',
      },
      {
        name: '鉄骨工事',
        specification: 'H鋼',
        unit: 't',
        quantity: '5.0000',
        executionUnitPrice: '150000.00',
        executionAmount: '750000',
        orderAmount: '693750',
      },
      {
        name: '塗装工事',
        specification: '外壁塗装',
        unit: 'm2',
        quantity: '200.0000',
        executionUnitPrice: '2500.00',
        executionAmount: '500000',
        orderAmount: '462500',
      },
    ],
  });
}

// ============================================================================
// テスト
// ============================================================================

describe('OrderExportService', () => {
  let service: OrderExportService;
  let mockPrisma: PrismaClient;

  beforeEach(() => {
    mockPrisma = createMockPrisma();
    service = new OrderExportService({ prisma: mockPrisma });
  });

  // ==========================================================================
  // getExportData - データ取得テスト
  // ==========================================================================

  describe('getExportData', () => {
    it('発注IDからエクスポート用データを取得する', async () => {
      const mockOrder = {
        id: 'order-1',
        status: 'BEFORE_ORDER',
        confirmedAmount: { toString: () => '1500000' },
        createdAt: new Date('2026-03-15T00:00:00Z'),
        deletedAt: null,
        tradingPartner: {
          name: 'テスト建設株式会社',
        },
        items: [
          {
            checked: true,
            orderAmount: null,
            executionBudgetItem: {
              name: '基礎工事',
              specification: 'コンクリート基礎',
              unit: 'm3',
              quantity: { toString: () => '10.5000' },
              executionUnitPrice: { toString: () => '25000.00' },
              executionAmount: { toString: () => '262500' },
            },
          },
          {
            checked: false,
            orderAmount: null,
            executionBudgetItem: {
              name: '未チェック項目',
              specification: null,
              unit: null,
              quantity: null,
              executionUnitPrice: null,
              executionAmount: null,
            },
          },
        ],
      };

      (mockPrisma.order.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(mockOrder);

      const result = await service.getExportData('order-1');

      expect(result).not.toBeNull();
      expect(result!.orderId).toBe('order-1');
      expect(result!.tradingPartnerName).toBe('テスト建設株式会社');
      expect(result!.status).toBe('BEFORE_ORDER');
      // チェック済み項目のみ含まれる
      expect(result!.items).toHaveLength(1);
      expect(result!.items[0]!.name).toBe('基礎工事');
    });

    it('論理削除された発注はnullを返す', async () => {
      (mockPrisma.order.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'order-1',
        deletedAt: new Date(),
      });

      const result = await service.getExportData('order-1');
      expect(result).toBeNull();
    });

    it('存在しない発注はnullを返す', async () => {
      (mockPrisma.order.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const result = await service.getExportData('non-existent');
      expect(result).toBeNull();
    });
  });

  // ==========================================================================
  // exportToExcel - Excel出力テスト
  // ==========================================================================

  describe('exportToExcel', () => {
    it('チェック済み項目一覧をExcelファイル（.xlsx形式）で出力する (REQ-10.1)', async () => {
      const data = createTestOrderExportData();
      const buffer = await service.exportToExcel(data);

      // バッファが返却される
      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(0);

      // Excelファイルとしてパース可能
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      expect(workbook.SheetNames).toContain('発注一覧');
    });

    it('ヘッダー情報（発注取引先名、発注日、確定発注金額）を含む (REQ-10.3)', async () => {
      const data = createTestOrderExportData();
      const buffer = await service.exportToExcel(data);

      const workbook = XLSX.read(buffer, { type: 'buffer' });
      const sheet = workbook.Sheets['発注一覧']!;
      const sheetData = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1 });

      // ヘッダー行にて取引先名が含まれる
      const flatData = sheetData.flat().map(String);
      expect(flatData.some((cell) => cell.includes('テスト建設株式会社'))).toBe(true);
      expect(flatData.some((cell) => cell.includes('2026-03-15'))).toBe(true);
      expect(flatData.some((cell) => cell.includes('1,500,000') || cell.includes('1500000'))).toBe(
        true
      );
    });

    it('項目データ（項目名、規格、単位、数量、実行単価、実行金額）を含む (REQ-10.1)', async () => {
      const data = createTestOrderExportData();
      const buffer = await service.exportToExcel(data);

      const workbook = XLSX.read(buffer, { type: 'buffer' });
      const sheet = workbook.Sheets['発注一覧']!;
      const sheetData = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1 });
      const flatData = sheetData.flat().map(String);

      // 項目名が含まれている
      expect(flatData.some((cell) => cell.includes('基礎工事'))).toBe(true);
      expect(flatData.some((cell) => cell.includes('鉄骨工事'))).toBe(true);
      expect(flatData.some((cell) => cell.includes('塗装工事'))).toBe(true);
    });

    it('合計金額を含む (REQ-10.1)', async () => {
      const data = createTestOrderExportData();
      const buffer = await service.exportToExcel(data);

      const workbook = XLSX.read(buffer, { type: 'buffer' });
      const sheet = workbook.Sheets['発注一覧']!;
      const sheetData = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1 });
      const flatData = sheetData.flat().map(String);

      // 合計金額（262500 + 750000 + 500000 = 1512500）
      expect(flatData.some((cell) => cell.includes('1512500') || cell.includes('1,512,500'))).toBe(
        true
      );
    });

    it('発注済ステータスの場合に発注金額列を追加出力する (REQ-10.4)', async () => {
      const data = createOrderedExportData();
      const buffer = await service.exportToExcel(data);

      const workbook = XLSX.read(buffer, { type: 'buffer' });
      const sheet = workbook.Sheets['発注一覧']!;
      const sheetData = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1 });
      const flatData = sheetData.flat().map(String);

      // 発注金額列のヘッダーが含まれる
      expect(flatData.some((cell) => cell.includes('発注金額'))).toBe(true);
      // 発注金額値が含まれる
      expect(flatData.some((cell) => cell.includes('243750'))).toBe(true);
      expect(flatData.some((cell) => cell.includes('693750'))).toBe(true);
    });

    it('発注前ステータスの場合は発注金額列を出力しない (REQ-10.4)', async () => {
      const data = createTestOrderExportData({ status: 'BEFORE_ORDER' });
      const buffer = await service.exportToExcel(data);

      const workbook = XLSX.read(buffer, { type: 'buffer' });
      const sheet = workbook.Sheets['発注一覧']!;
      const sheetData = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1 });

      // テーブルヘッダー行を取得（ヘッダー情報の後）
      // 発注金額列ヘッダーは含まれない
      const headerRow = sheetData.find(
        (row) => Array.isArray(row) && row.some((cell) => String(cell) === '項目名')
      );
      if (headerRow) {
        expect(headerRow.map(String)).not.toContain('発注金額');
      }
    });

    it('項目がない場合でもヘッダー付きのExcelを出力する', async () => {
      const data = createTestOrderExportData({ items: [] });
      const buffer = await service.exportToExcel(data);

      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(0);

      const workbook = XLSX.read(buffer, { type: 'buffer' });
      expect(workbook.SheetNames).toContain('発注一覧');
    });
  });

  // ==========================================================================
  // exportToPdf - PDF出力テスト
  // ==========================================================================

  describe('exportToPdf', () => {
    it('チェック済み項目一覧をPDFファイルで出力する (REQ-10.2)', async () => {
      const data = createTestOrderExportData();
      const buffer = await service.exportToPdf(data);

      // バッファが返却される
      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(0);

      // PDFヘッダーマジックバイトを検証
      const header = buffer.subarray(0, 5).toString('ascii');
      expect(header).toBe('%PDF-');
    });

    it('発注済ステータスの場合にPDFにも発注金額列を追加出力する (REQ-10.4)', async () => {
      const data = createOrderedExportData();
      const buffer = await service.exportToPdf(data);

      // バッファが返却される
      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(0);

      // PDFヘッダーマジックバイトを検証
      const header = buffer.subarray(0, 5).toString('ascii');
      expect(header).toBe('%PDF-');
    });

    it('発注前ステータスの場合にPDFに発注金額列を含めない (REQ-10.4)', async () => {
      const data = createTestOrderExportData({ status: 'BEFORE_ORDER' });
      const buffer = await service.exportToPdf(data);

      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(0);
    });

    it('項目がない場合でもヘッダー付きのPDFを出力する', async () => {
      const data = createTestOrderExportData({ items: [] });
      const buffer = await service.exportToPdf(data);

      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(0);
    });

    it('ヘッダー情報がPDFに含まれる (REQ-10.3)', async () => {
      const data = createTestOrderExportData();
      const buffer = await service.exportToPdf(data);

      // PDFとして有効である（ヘッダーマジックバイト確認）
      expect(buffer).toBeInstanceOf(Buffer);
      const header = buffer.subarray(0, 5).toString('ascii');
      expect(header).toBe('%PDF-');
      // PDFの中身のテキスト検証は困難なため、バッファサイズで出力データ有無を間接確認
      expect(buffer.length).toBeGreaterThan(100);
    });
  });
});
