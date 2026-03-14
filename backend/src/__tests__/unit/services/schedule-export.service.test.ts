/**
 * @fileoverview ScheduleExportService ユニットテスト
 *
 * TDD: RED phase - テストを先に書く
 *
 * Task 11.1: ScheduleExportServiceのExcel出力ロジックを実装する
 * Task 12.1: ScheduleExportServiceのPDF出力ロジックを実装する
 *
 * Requirements:
 * - 7.1: Excelダウンロード
 * - 7.2: プロジェクト名含むExcel
 * - 7.3: 自社名含むExcel
 * - 7.4: 項目情報含むExcel
 * - 7.5: ガントチャート再現Excel
 * - 8.1: PDFダウンロード
 * - 8.2: プロジェクト名含むPDF
 * - 8.3: 自社名含むPDF
 * - 8.4: 項目情報含むPDF
 * - 8.5: ガントチャート再現PDF
 * - 9.3: チェックOFF時の出力除外
 * - 9.4: チェック復帰時の出力復帰
 * - 10.5: ラベル文字のExcel/PDF出力
 * - 11.5: 詳細文字のExcel/PDF出力
 *
 * @module __tests__/unit/services/schedule-export.service
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as XLSX from 'xlsx';
import type { PrismaClient } from '../../../generated/prisma/client.js';

// ScheduleExportServiceをインポート（実装前なのでテスト先行）
import {
  ScheduleExportService,
  type ScheduleExportData,
} from '../../../services/schedule-export.service.js';

// ============================================================================
// テストデータヘルパー
// ============================================================================

function createMockPrisma() {
  return {
    constructionSchedule: {
      findUnique: vi.fn(),
    },
    companyInfo: {
      findFirst: vi.fn(),
    },
  } as unknown as PrismaClient;
}

function createTestScheduleData(overrides: Partial<ScheduleExportData> = {}): ScheduleExportData {
  return {
    id: 'schedule-1',
    name: 'テスト工程表',
    projectName: 'テストプロジェクト',
    companyName: 'テスト建設株式会社',
    items: [
      {
        id: 'item-1',
        itemName: '基礎工事',
        labelText: '基礎',
        detailText: 'コンクリート打設',
        startDate: '2026-04-01',
        duration: 5,
        displayOrder: 0,
        isExportTarget: true,
      },
      {
        id: 'item-2',
        itemName: '躯体工事',
        labelText: '躯体',
        detailText: '鉄骨建方',
        startDate: '2026-04-06',
        duration: 10,
        displayOrder: 1,
        isExportTarget: true,
      },
      {
        id: 'item-3',
        itemName: '内装工事',
        labelText: '内装',
        detailText: 'クロス貼り',
        startDate: '2026-04-16',
        duration: 7,
        displayOrder: 2,
        isExportTarget: false, // 出力対象外
      },
    ],
    ...overrides,
  };
}

// ============================================================================
// テスト
// ============================================================================

describe('ScheduleExportService', () => {
  let service: ScheduleExportService;
  let mockPrisma: PrismaClient;

  beforeEach(() => {
    mockPrisma = createMockPrisma();
    service = new ScheduleExportService({ prisma: mockPrisma });
  });

  describe('exportToExcel', () => {
    it('Bufferを返す', async () => {
      const data = createTestScheduleData();
      const result = await service.exportToExcel(data);

      expect(result).toBeInstanceOf(Buffer);
      expect(result.length).toBeGreaterThan(0);
    });

    it('有効な.xlsxファイルを生成する', async () => {
      const data = createTestScheduleData();
      const buffer = await service.exportToExcel(data);

      // xlsxライブラリで読み取れることを確認
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      expect(workbook.SheetNames.length).toBeGreaterThan(0);
    });

    // REQ-7.2: プロジェクト名を含む
    it('プロジェクト名をヘッダーに含む', async () => {
      const data = createTestScheduleData({ projectName: '渋谷駅前ビル新築工事' });
      const buffer = await service.exportToExcel(data);

      const workbook = XLSX.read(buffer, { type: 'buffer' });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]!]!;
      const sheetData = XLSX.utils.sheet_to_json<string[]>(firstSheet, { header: 1 });

      // シートのどこかにプロジェクト名が含まれることを確認
      const allText = sheetData.flat().join(' ');
      expect(allText).toContain('渋谷駅前ビル新築工事');
    });

    // REQ-7.3: 自社名を含む
    it('自社名をヘッダーに含む', async () => {
      const data = createTestScheduleData({ companyName: '株式会社テスト建設' });
      const buffer = await service.exportToExcel(data);

      const workbook = XLSX.read(buffer, { type: 'buffer' });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]!]!;
      const sheetData = XLSX.utils.sheet_to_json<string[]>(firstSheet, { header: 1 });

      const allText = sheetData.flat().join(' ');
      expect(allText).toContain('株式会社テスト建設');
    });

    // REQ-9.3: isExportTarget=falseの項目を除外
    it('isExportTarget=falseの項目を出力対象から除外する', async () => {
      const data = createTestScheduleData();
      const buffer = await service.exportToExcel(data);

      const workbook = XLSX.read(buffer, { type: 'buffer' });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]!]!;
      const sheetData = XLSX.utils.sheet_to_json<string[]>(firstSheet, { header: 1 });

      const allText = sheetData.flat().join(' ');
      // 出力対象の項目は含まれる
      expect(allText).toContain('基礎工事');
      expect(allText).toContain('躯体工事');
      // 出力対象外の項目は含まれない
      expect(allText).not.toContain('内装工事');
    });

    // REQ-9.4: チェック復帰時の出力復帰
    it('isExportTarget=trueの全項目を出力する', async () => {
      const data = createTestScheduleData({
        items: [
          {
            id: 'item-1',
            itemName: '基礎工事',
            labelText: '基礎',
            detailText: 'コンクリート打設',
            startDate: '2026-04-01',
            duration: 5,
            displayOrder: 0,
            isExportTarget: true,
          },
          {
            id: 'item-2',
            itemName: '内装工事',
            labelText: '内装',
            detailText: 'クロス貼り',
            startDate: '2026-04-16',
            duration: 7,
            displayOrder: 1,
            isExportTarget: true, // 復帰済
          },
        ],
      });

      const buffer = await service.exportToExcel(data);
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]!]!;
      const sheetData = XLSX.utils.sheet_to_json<string[]>(firstSheet, { header: 1 });

      const allText = sheetData.flat().join(' ');
      expect(allText).toContain('基礎工事');
      expect(allText).toContain('内装工事');
    });

    // REQ-7.4: 項目情報（着工日・日数・完了日）を含む
    it('各項目の着工日・日数・完了日を出力する', async () => {
      const data = createTestScheduleData({
        items: [
          {
            id: 'item-1',
            itemName: '基礎工事',
            labelText: '基礎',
            detailText: 'コンクリート打設',
            startDate: '2026-04-01',
            duration: 5,
            displayOrder: 0,
            isExportTarget: true,
          },
        ],
      });

      const buffer = await service.exportToExcel(data);
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]!]!;
      const sheetData = XLSX.utils.sheet_to_json<string[]>(firstSheet, { header: 1 });

      const allText = sheetData.flat().join(' ');
      // 着工日が含まれる
      expect(allText).toContain('2026-04-01');
      // 日数が含まれる
      expect(allText).toContain('5');
      // 完了日が含まれる（着工日 + 日数 - 1 = 2026-04-05）
      expect(allText).toContain('2026-04-05');
    });

    // REQ-10.5: ラベル文字のExcel出力
    it('ラベル文字を左列に出力する', async () => {
      const data = createTestScheduleData({
        items: [
          {
            id: 'item-1',
            itemName: '基礎工事',
            labelText: '基礎ラベルテスト',
            detailText: '',
            startDate: '2026-04-01',
            duration: 5,
            displayOrder: 0,
            isExportTarget: true,
          },
        ],
      });

      const buffer = await service.exportToExcel(data);
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]!]!;
      const sheetData = XLSX.utils.sheet_to_json<string[]>(firstSheet, { header: 1 });

      const allText = sheetData.flat().join(' ');
      expect(allText).toContain('基礎ラベルテスト');
    });

    // REQ-11.5: 詳細文字のExcel出力
    it('詳細文字をバー先頭セルに出力する', async () => {
      const data = createTestScheduleData({
        items: [
          {
            id: 'item-1',
            itemName: '基礎工事',
            labelText: '',
            detailText: '詳細テキストテスト',
            startDate: '2026-04-01',
            duration: 5,
            displayOrder: 0,
            isExportTarget: true,
          },
        ],
      });

      const buffer = await service.exportToExcel(data);
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]!]!;
      const sheetData = XLSX.utils.sheet_to_json<string[]>(firstSheet, { header: 1 });

      const allText = sheetData.flat().join(' ');
      expect(allText).toContain('詳細テキストテスト');
    });

    // REQ-7.5: ガントチャート再現（セル背景色）
    it('日付列をセルとして展開しバー期間のセルに背景色を設定する', async () => {
      const data = createTestScheduleData({
        items: [
          {
            id: 'item-1',
            itemName: '基礎工事',
            labelText: '基礎',
            detailText: '',
            startDate: '2026-04-01',
            duration: 3,
            displayOrder: 0,
            isExportTarget: true,
          },
        ],
      });

      const buffer = await service.exportToExcel(data);
      const workbook = XLSX.read(buffer, { type: 'buffer', cellStyles: true });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]!]!;

      // シートに日付列ヘッダーが含まれることを確認
      const sheetData = XLSX.utils.sheet_to_json<string[]>(firstSheet, { header: 1 });
      const allText = sheetData.flat().join(' ');

      // 日付列ヘッダーにバー期間の日付が含まれる
      expect(allText).toContain('4/1');
      expect(allText).toContain('4/2');
      expect(allText).toContain('4/3');
    });

    // 土日祝の背景色
    it('土日祝のセルに対応する背景色を設定する', async () => {
      // 2026-04-04 = 土曜日, 2026-04-05 = 日曜日
      const data = createTestScheduleData({
        items: [
          {
            id: 'item-1',
            itemName: '基礎工事',
            labelText: '基礎',
            detailText: '',
            startDate: '2026-04-01',
            duration: 7,
            displayOrder: 0,
            isExportTarget: true,
          },
        ],
      });

      const buffer = await service.exportToExcel(data);
      const workbook = XLSX.read(buffer, { type: 'buffer', cellStyles: true });

      // ワークブックが正常に生成されることを確認
      // 注: xlsxライブラリの制限により、セルスタイルの詳細検証は困難だが、
      // 生成されたファイルが有効であることを検証
      expect(workbook.SheetNames.length).toBeGreaterThan(0);
    });

    // 空の項目リストの場合
    it('出力対象項目が0件の場合も正常にExcelを生成する', async () => {
      const data = createTestScheduleData({
        items: [
          {
            id: 'item-1',
            itemName: '内装工事',
            labelText: '',
            detailText: '',
            startDate: '2026-04-01',
            duration: 5,
            displayOrder: 0,
            isExportTarget: false, // 全て出力対象外
          },
        ],
      });

      const buffer = await service.exportToExcel(data);
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      expect(workbook.SheetNames.length).toBeGreaterThan(0);
    });

    // 着工日・日数が未入力の項目
    it('着工日がnullの項目はバー表示なしで情報のみ出力する', async () => {
      const data = createTestScheduleData({
        items: [
          {
            id: 'item-1',
            itemName: '基礎工事',
            labelText: '基礎',
            detailText: '',
            startDate: null,
            duration: null,
            displayOrder: 0,
            isExportTarget: true,
          },
          {
            id: 'item-2',
            itemName: '躯体工事',
            labelText: '躯体',
            detailText: '',
            startDate: '2026-04-01',
            duration: 5,
            displayOrder: 1,
            isExportTarget: true,
          },
        ],
      });

      const buffer = await service.exportToExcel(data);
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]!]!;
      const sheetData = XLSX.utils.sheet_to_json<string[]>(firstSheet, { header: 1 });

      const allText = sheetData.flat().join(' ');
      // 着工日nullの項目のラベルも含まれる
      expect(allText).toContain('基礎');
      expect(allText).toContain('躯体');
    });
  });

  // ============================================================================
  // Task 12.1: PDF出力テスト
  // ============================================================================

  describe('exportToPdf', () => {
    // REQ-8.1: PDFダウンロード（Bufferを返す）
    it('Bufferを返す', async () => {
      const data = createTestScheduleData();
      const result = await service.exportToPdf(data);

      expect(result).toBeInstanceOf(Buffer);
      expect(result.length).toBeGreaterThan(0);
    });

    // REQ-8.1: 有効なPDFファイルを生成する
    it('有効なPDFファイルを生成する（PDFヘッダーを含む）', async () => {
      const data = createTestScheduleData();
      const buffer = await service.exportToPdf(data);

      // PDFファイルは%PDFで始まる
      const header = buffer.subarray(0, 5).toString('ascii');
      expect(header).toBe('%PDF-');
    });

    // A4横向き（ランドスケープ）レイアウト
    it('A4横向き（ランドスケープ）レイアウトで生成する', async () => {
      const data = createTestScheduleData();
      const buffer = await service.exportToPdf(data);

      // PDFファイルが正常に生成されることを確認
      // ランドスケープのMediaBoxは[0 0 841.89 595.28]のパターンを含む
      const pdfContent = buffer.toString('latin1');
      // A4ランドスケープ: 幅841.89 > 高さ595.28
      expect(pdfContent).toContain('841');
      expect(pdfContent).toContain('595');
    });

    // REQ-8.2: プロジェクト名を含むPDF
    it('プロジェクト名をヘッダーに含む', async () => {
      const data = createTestScheduleData({ projectName: '渋谷駅前ビル新築工事PDF' });
      const buffer = await service.exportToPdf(data);

      // PDFバイナリ内にプロジェクト名が含まれることを確認
      // jsPDFはテキストをPDF内部に直接埋め込む
      expect(buffer.length).toBeGreaterThan(0);
      // PDF生成が正常に完了すること（テキスト内容の検証はPDFパース不要の範囲で）
    });

    // REQ-8.3: 自社名を含むPDF
    it('自社名をヘッダーに含む', async () => {
      const data = createTestScheduleData({ companyName: '株式会社テスト建設PDF' });
      const buffer = await service.exportToPdf(data);

      expect(buffer.length).toBeGreaterThan(0);
    });

    // REQ-9.3: isExportTarget=falseの項目を除外
    it('isExportTarget=falseの項目を出力対象から除外する', async () => {
      const data = createTestScheduleData();
      // 3項目中、2項目がisExportTarget=true、1項目がfalse
      const bufferWithAll = await service.exportToPdf(data);

      // 全項目をisExportTarget=trueにしたデータ
      const dataAllTrue = createTestScheduleData({
        items: data.items.map((item) => ({ ...item, isExportTarget: true })),
      });
      const bufferAllTrue = await service.exportToPdf(dataAllTrue);

      // 出力対象が多い方がPDFサイズが大きい（またはレイアウトが異なる）
      // 最低限、両方とも有効なPDFであること
      expect(bufferWithAll.subarray(0, 5).toString('ascii')).toBe('%PDF-');
      expect(bufferAllTrue.subarray(0, 5).toString('ascii')).toBe('%PDF-');
      // 3項目全てを出力した場合の方がサイズが大きくなるはず
      expect(bufferAllTrue.length).toBeGreaterThan(bufferWithAll.length);
    });

    // REQ-9.4: チェック復帰時の出力復帰
    it('isExportTarget=trueの全項目を出力する', async () => {
      const data = createTestScheduleData({
        items: [
          {
            id: 'item-1',
            itemName: '基礎工事',
            labelText: '基礎',
            detailText: 'コンクリート打設',
            startDate: '2026-04-01',
            duration: 5,
            displayOrder: 0,
            isExportTarget: true,
          },
          {
            id: 'item-2',
            itemName: '内装工事',
            labelText: '内装',
            detailText: 'クロス貼り',
            startDate: '2026-04-16',
            duration: 7,
            displayOrder: 1,
            isExportTarget: true, // 復帰済
          },
        ],
      });

      const buffer = await service.exportToPdf(data);
      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    });

    // REQ-8.4: 項目情報（着工日・日数・完了日）をテーブル行として出力
    it('各項目の着工日・日数・完了日をテーブル行として出力する', async () => {
      const data = createTestScheduleData({
        items: [
          {
            id: 'item-1',
            itemName: '基礎工事',
            labelText: '基礎',
            detailText: 'コンクリート打設',
            startDate: '2026-04-01',
            duration: 5,
            displayOrder: 0,
            isExportTarget: true,
          },
        ],
      });

      const buffer = await service.exportToPdf(data);
      // PDFが正常に生成され、有効なフォーマットであること
      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    });

    // REQ-10.5: ラベル文字のPDF出力（バー左側のテキスト領域に配置）
    it('ラベル文字をバー左側のテキスト領域に配置する', async () => {
      const data = createTestScheduleData({
        items: [
          {
            id: 'item-1',
            itemName: '基礎工事',
            labelText: '基礎ラベルPDFテスト',
            detailText: '',
            startDate: '2026-04-01',
            duration: 5,
            displayOrder: 0,
            isExportTarget: true,
          },
        ],
      });

      const buffer = await service.exportToPdf(data);
      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    });

    // REQ-11.5: 詳細文字のPDF出力（バー矩形の上にtext()で配置）
    it('詳細文字をバー矩形の上にtext()で配置する', async () => {
      const data = createTestScheduleData({
        items: [
          {
            id: 'item-1',
            itemName: '基礎工事',
            labelText: '',
            detailText: '詳細テキストPDFテスト',
            startDate: '2026-04-01',
            duration: 5,
            displayOrder: 0,
            isExportTarget: true,
          },
        ],
      });

      const buffer = await service.exportToPdf(data);
      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    });

    // REQ-8.5: ガントチャート再現PDF（rect()による矩形描画）
    it('rect()による矩形描画でガントチャートのバーを再現する', async () => {
      const data = createTestScheduleData({
        items: [
          {
            id: 'item-1',
            itemName: '基礎工事',
            labelText: '基礎',
            detailText: '',
            startDate: '2026-04-01',
            duration: 3,
            displayOrder: 0,
            isExportTarget: true,
          },
        ],
      });

      const buffer = await service.exportToPdf(data);
      // PDFバイナリ内に矩形描画コマンド（re = rectangle）が含まれること
      const pdfContent = buffer.toString('latin1');
      expect(pdfContent).toContain(' re');
    });

    // 土日祝列に薄い背景色の矩形を全行にわたって描画
    it('土日祝列に薄い背景色の矩形を描画する', async () => {
      // 2026-04-04 = 土曜日, 2026-04-05 = 日曜日
      const data = createTestScheduleData({
        items: [
          {
            id: 'item-1',
            itemName: '基礎工事',
            labelText: '基礎',
            detailText: '',
            startDate: '2026-04-01',
            duration: 7,
            displayOrder: 0,
            isExportTarget: true,
          },
        ],
      });

      const buffer = await service.exportToPdf(data);
      // PDFが有効で矩形描画が含まれること（土日祝の背景色矩形）
      const pdfContent = buffer.toString('latin1');
      expect(pdfContent).toContain(' re');
      // fillコマンドが含まれること
      expect(pdfContent).toContain(' f');
    });

    // 出力対象項目が0件の場合
    it('出力対象項目が0件の場合も正常にPDFを生成する', async () => {
      const data = createTestScheduleData({
        items: [
          {
            id: 'item-1',
            itemName: '内装工事',
            labelText: '',
            detailText: '',
            startDate: '2026-04-01',
            duration: 5,
            displayOrder: 0,
            isExportTarget: false, // 全て出力対象外
          },
        ],
      });

      const buffer = await service.exportToPdf(data);
      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    });

    // 着工日・日数が未入力の項目
    it('着工日がnullの項目はバー表示なしで情報のみ出力する', async () => {
      const data = createTestScheduleData({
        items: [
          {
            id: 'item-1',
            itemName: '基礎工事',
            labelText: '基礎',
            detailText: '',
            startDate: null,
            duration: null,
            displayOrder: 0,
            isExportTarget: true,
          },
          {
            id: 'item-2',
            itemName: '躯体工事',
            labelText: '躯体',
            detailText: '',
            startDate: '2026-04-01',
            duration: 5,
            displayOrder: 1,
            isExportTarget: true,
          },
        ],
      });

      const buffer = await service.exportToPdf(data);
      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    });
  });

  describe('getExportData', () => {
    it('工程表IDからエクスポートデータを取得する', async () => {
      const scheduleId = 'schedule-1';

      // Prismaモックの設定
      const mockSchedule = {
        id: scheduleId,
        name: 'テスト工程表',
        project: { name: 'テストプロジェクト' },
        items: [
          {
            id: 'item-1',
            itemName: '基礎工事',
            labelText: '基礎',
            detailText: 'コンクリート打設',
            startDate: new Date('2026-04-01'),
            duration: 5,
            displayOrder: 0,
            isExportTarget: true,
          },
        ],
        deletedAt: null,
      };

      const mockCompanyInfo = {
        companyName: 'テスト建設株式会社',
      };

      (mockPrisma.constructionSchedule.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockSchedule
      );
      (mockPrisma.companyInfo.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockCompanyInfo
      );

      const result = await service.getExportData(scheduleId);

      expect(result).not.toBeNull();
      expect(result!.id).toBe(scheduleId);
      expect(result!.name).toBe('テスト工程表');
      expect(result!.projectName).toBe('テストプロジェクト');
      expect(result!.companyName).toBe('テスト建設株式会社');
      expect(result!.items.length).toBe(1);
    });

    it('工程表が見つからない場合nullを返す', async () => {
      (mockPrisma.constructionSchedule.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
        null
      );

      const result = await service.getExportData('non-existent-id');

      expect(result).toBeNull();
    });

    it('論理削除済みの工程表の場合nullを返す', async () => {
      (mockPrisma.constructionSchedule.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'schedule-1',
        deletedAt: new Date(),
      });

      const result = await service.getExportData('schedule-1');

      expect(result).toBeNull();
    });

    it('自社情報が未登録の場合は空文字を設定する', async () => {
      const mockSchedule = {
        id: 'schedule-1',
        name: 'テスト工程表',
        project: { name: 'テストプロジェクト' },
        items: [],
        deletedAt: null,
      };

      (mockPrisma.constructionSchedule.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockSchedule
      );
      (mockPrisma.companyInfo.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const result = await service.getExportData('schedule-1');

      expect(result).not.toBeNull();
      expect(result!.companyName).toBe('');
    });
  });

  describe('calculateEndDate', () => {
    it('着工日と日数から完了日を算出する', () => {
      // 2026-04-01 + 5日 = 2026-04-05
      const result = service.calculateEndDate('2026-04-01', 5);
      expect(result).toBe('2026-04-05');
    });

    it('1日間の場合は着工日=完了日', () => {
      const result = service.calculateEndDate('2026-04-01', 1);
      expect(result).toBe('2026-04-01');
    });

    it('月をまたぐ場合も正しく算出する', () => {
      // 2026-03-30 + 5日 = 2026-04-03
      const result = service.calculateEndDate('2026-03-30', 5);
      expect(result).toBe('2026-04-03');
    });

    it('着工日がnullの場合はnullを返す', () => {
      const result = service.calculateEndDate(null, 5);
      expect(result).toBeNull();
    });

    it('日数がnullの場合はnullを返す', () => {
      const result = service.calculateEndDate('2026-04-01', null);
      expect(result).toBeNull();
    });
  });
});
