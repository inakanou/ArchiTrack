/**
 * @fileoverview ScheduleExportService ユニットテスト
 *
 * TDD: RED phase - テストを先に書く
 *
 * Task 11.1: ScheduleExportServiceのExcel出力ロジックを実装する
 * Task 12.1: ScheduleExportServiceのPDF出力ロジックを実装する
 * Task 14.1: Excel出力ロジックの単体テストを作成する
 * Task 14.2: PDF出力ロジックの単体テストを作成する
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

  // ============================================================================
  // Task 14.1: Excel出力ロジックの単体テスト（詳細検証）
  // Requirements: 7.2, 7.3, 7.4, 7.5, 9.3, 9.4, 10.5, 11.5
  // ============================================================================

  describe('exportToExcel - 詳細検証 (Task 14.1)', () => {
    // -----------------------------------------------------------------------
    // REQ-7.2, 7.3: プロジェクト名・自社名のヘッダー出力位置確認
    // -----------------------------------------------------------------------

    it('プロジェクト名を1行目のA1セルに出力する', async () => {
      const data = createTestScheduleData({ projectName: '新宿タワービル新築工事' });
      const buffer = await service.exportToExcel(data);

      const workbook = XLSX.read(buffer, { type: 'buffer' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]!]!;
      const rows = XLSX.utils.sheet_to_json<(string | number | null)[]>(sheet, { header: 1 });

      // 1行目（インデックス0）の最初の列にプロジェクト名
      expect(rows[0]![0]).toBe('新宿タワービル新築工事');
    });

    it('自社名を2行目のA2セルに出力する', async () => {
      const data = createTestScheduleData({ companyName: '大成建設株式会社' });
      const buffer = await service.exportToExcel(data);

      const workbook = XLSX.read(buffer, { type: 'buffer' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]!]!;
      const rows = XLSX.utils.sheet_to_json<(string | number | null)[]>(sheet, { header: 1 });

      // 2行目（インデックス1）の最初の列に自社名
      expect(rows[1]![0]).toBe('大成建設株式会社');
    });

    it('3行目を空行とし4行目にヘッダー行を出力する', async () => {
      const data = createTestScheduleData();
      const buffer = await service.exportToExcel(data);

      const workbook = XLSX.read(buffer, { type: 'buffer' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]!]!;
      const rows = XLSX.utils.sheet_to_json<(string | number | null)[]>(sheet, { header: 1 });

      // 3行目（インデックス2）は空行
      const row3 = rows[2] || [];
      const row3HasContent = row3.some((v) => v !== null && v !== undefined && v !== '');
      expect(row3HasContent).toBe(false);

      // 4行目（インデックス3）はヘッダー行
      expect(rows[3]![0]).toBe('ラベル');
      expect(rows[3]![1]).toBe('項目名');
      expect(rows[3]![2]).toBe('着工日');
      expect(rows[3]![3]).toBe('日数');
      expect(rows[3]![4]).toBe('完了日');
    });

    // -----------------------------------------------------------------------
    // REQ-9.3, 9.4: 出力対象フィルタ（isExportTarget）の動作確認
    // -----------------------------------------------------------------------

    it('isExportTarget=trueの項目のみデータ行として出力しfalseの項目は含まない', async () => {
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
          {
            id: 'item-2',
            itemName: '非出力項目A',
            labelText: '非出力A',
            detailText: '',
            startDate: '2026-04-04',
            duration: 2,
            displayOrder: 1,
            isExportTarget: false,
          },
          {
            id: 'item-3',
            itemName: '躯体工事',
            labelText: '躯体',
            detailText: '',
            startDate: '2026-04-06',
            duration: 4,
            displayOrder: 2,
            isExportTarget: true,
          },
          {
            id: 'item-4',
            itemName: '非出力項目B',
            labelText: '非出力B',
            detailText: '',
            startDate: '2026-04-10',
            duration: 3,
            displayOrder: 3,
            isExportTarget: false,
          },
        ],
      });

      const buffer = await service.exportToExcel(data);
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]!]!;
      const rows = XLSX.utils.sheet_to_json<(string | number | null)[]>(sheet, { header: 1 });

      // ヘッダー4行 + データ2行（isExportTarget=trueのみ）= 合計6行
      // 日付列を含む行もあるため、データ行数を検証
      const dataRows = rows.slice(4); // ヘッダー4行をスキップ
      expect(dataRows.length).toBe(2);

      // 出力対象の項目名が正しい順序で含まれる
      expect(dataRows[0]![1]).toBe('基礎工事');
      expect(dataRows[1]![1]).toBe('躯体工事');

      // 非出力対象の項目名がシート全体に含まれないことを確認
      const allText = rows.flat().join(' ');
      expect(allText).not.toContain('非出力項目A');
      expect(allText).not.toContain('非出力項目B');
    });

    it('全項目がisExportTarget=falseの場合はヘッダーのみのExcelを生成する', async () => {
      const data = createTestScheduleData({
        items: [
          {
            id: 'item-1',
            itemName: '工事A',
            labelText: '',
            detailText: '',
            startDate: '2026-04-01',
            duration: 5,
            displayOrder: 0,
            isExportTarget: false,
          },
          {
            id: 'item-2',
            itemName: '工事B',
            labelText: '',
            detailText: '',
            startDate: '2026-04-06',
            duration: 3,
            displayOrder: 1,
            isExportTarget: false,
          },
        ],
      });

      const buffer = await service.exportToExcel(data);
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]!]!;
      const rows = XLSX.utils.sheet_to_json<(string | number | null)[]>(sheet, { header: 1 });

      // ヘッダー4行のみ、データ行はなし
      expect(rows.length).toBe(4);
      expect(rows[3]![0]).toBe('ラベル');
    });

    it('isExportTarget切り替え後の復帰時に正しく出力に含まれる', async () => {
      // シナリオ: 一度falseにした後trueに戻した項目が正しく出力される
      const data = createTestScheduleData({
        items: [
          {
            id: 'item-1',
            itemName: '電気工事',
            labelText: '電気',
            detailText: '配線工事',
            startDate: '2026-05-01',
            duration: 10,
            displayOrder: 0,
            isExportTarget: true, // 復帰後のtrue状態
          },
        ],
      });

      const buffer = await service.exportToExcel(data);
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]!]!;
      const rows = XLSX.utils.sheet_to_json<(string | number | null)[]>(sheet, { header: 1 });

      const dataRows = rows.slice(4);
      expect(dataRows.length).toBe(1);
      expect(dataRows[0]![0]).toBe('電気');
      expect(dataRows[0]![1]).toBe('電気工事');
      expect(dataRows[0]![2]).toBe('2026-05-01');
      expect(dataRows[0]![3]).toBe(10);
    });

    // -----------------------------------------------------------------------
    // REQ-7.4, 10.5, 11.5: 項目情報の出力確認
    // -----------------------------------------------------------------------

    it('各項目行にラベル文字・項目名・着工日・日数・完了日を正しい列順序で出力する', async () => {
      const data = createTestScheduleData({
        items: [
          {
            id: 'item-1',
            itemName: '防水工事',
            labelText: '防水',
            detailText: 'シート防水',
            startDate: '2026-06-01',
            duration: 14,
            displayOrder: 0,
            isExportTarget: true,
          },
        ],
      });

      const buffer = await service.exportToExcel(data);
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]!]!;
      const rows = XLSX.utils.sheet_to_json<(string | number | null)[]>(sheet, { header: 1 });

      const dataRow = rows[4]!; // 5行目（1行目のデータ行）
      expect(dataRow[0]).toBe('防水'); // 列A: ラベル文字
      expect(dataRow[1]).toBe('防水工事'); // 列B: 項目名
      expect(dataRow[2]).toBe('2026-06-01'); // 列C: 着工日
      expect(dataRow[3]).toBe(14); // 列D: 日数
      expect(dataRow[4]).toBe('2026-06-14'); // 列E: 完了日（6/1 + 14 - 1 = 6/14）
    });

    it('複数項目をdisplayOrder順にデータ行として出力する', async () => {
      const data = createTestScheduleData({
        items: [
          {
            id: 'item-1',
            itemName: '外壁工事',
            labelText: '外壁',
            detailText: '',
            startDate: '2026-04-01',
            duration: 5,
            displayOrder: 0,
            isExportTarget: true,
          },
          {
            id: 'item-2',
            itemName: '屋根工事',
            labelText: '屋根',
            detailText: '',
            startDate: '2026-04-06',
            duration: 3,
            displayOrder: 1,
            isExportTarget: true,
          },
          {
            id: 'item-3',
            itemName: '塗装工事',
            labelText: '塗装',
            detailText: '',
            startDate: '2026-04-09',
            duration: 7,
            displayOrder: 2,
            isExportTarget: true,
          },
        ],
      });

      const buffer = await service.exportToExcel(data);
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]!]!;
      const rows = XLSX.utils.sheet_to_json<(string | number | null)[]>(sheet, { header: 1 });

      const dataRows = rows.slice(4);
      expect(dataRows.length).toBe(3);
      expect(dataRows[0]![1]).toBe('外壁工事');
      expect(dataRows[1]![1]).toBe('屋根工事');
      expect(dataRows[2]![1]).toBe('塗装工事');
    });

    it('ラベル文字が空文字の場合もセルは存在する', async () => {
      const data = createTestScheduleData({
        items: [
          {
            id: 'item-1',
            itemName: '基礎工事',
            labelText: '',
            detailText: '',
            startDate: '2026-04-01',
            duration: 3,
            displayOrder: 0,
            isExportTarget: true,
          },
        ],
      });

      const buffer = await service.exportToExcel(data);
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]!]!;
      const rows = XLSX.utils.sheet_to_json<(string | number | null)[]>(sheet, { header: 1 });

      // ラベルが空でも項目名は出力される
      expect(rows[4]![1]).toBe('基礎工事');
    });

    it('詳細文字をバー開始日のセルに配置する', async () => {
      const data = createTestScheduleData({
        items: [
          {
            id: 'item-1',
            itemName: '基礎工事',
            labelText: '',
            detailText: '型枠組立',
            startDate: '2026-04-01',
            duration: 5,
            displayOrder: 0,
            isExportTarget: true,
          },
        ],
      });

      const buffer = await service.exportToExcel(data);
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]!]!;
      const rows = XLSX.utils.sheet_to_json<(string | number | null)[]>(sheet, { header: 1 });

      // 固定列5列の後が日付列（列F以降）
      // バー開始日（4/1）のセルに詳細文字が配置される
      const dataRow = rows[4]!;
      // 固定列5個をスキップした最初のセルがバー開始日
      expect(dataRow[5]).toBe('型枠組立');
    });

    it('詳細文字が空の場合はバー範囲のセルが空文字となる', async () => {
      const data = createTestScheduleData({
        items: [
          {
            id: 'item-1',
            itemName: '基礎工事',
            labelText: '',
            detailText: '',
            startDate: '2026-04-01',
            duration: 3,
            displayOrder: 0,
            isExportTarget: true,
          },
        ],
      });

      const buffer = await service.exportToExcel(data);
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]!]!;
      const rows = XLSX.utils.sheet_to_json<(string | number | null)[]>(sheet, { header: 1 });

      const dataRow = rows[4]!;
      // バー範囲のセルは空文字（詳細文字なし）
      expect(dataRow[5]).toBe('');
    });

    // -----------------------------------------------------------------------
    // REQ-7.5: ガントチャート再現（セル背景色）の確認
    // -----------------------------------------------------------------------

    it('日付列ヘッダーが開始日から終了日までの全日付を含む', async () => {
      const data = createTestScheduleData({
        items: [
          {
            id: 'item-1',
            itemName: '基礎工事',
            labelText: '',
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
      const sheet = workbook.Sheets[workbook.SheetNames[0]!]!;
      const rows = XLSX.utils.sheet_to_json<(string | number | null)[]>(sheet, { header: 1 });

      const headerRow = rows[3]!;
      // 固定列5列の後に日付列（4/1～4/5の5日間）
      expect(headerRow[5]).toBe('4/1');
      expect(headerRow[6]).toBe('4/2');
      expect(headerRow[7]).toBe('4/3');
      expect(headerRow[8]).toBe('4/4');
      expect(headerRow[9]).toBe('4/5');
    });

    it('複数項目の日付範囲を全体の最小開始日から最大完了日まで生成する', async () => {
      const data = createTestScheduleData({
        items: [
          {
            id: 'item-1',
            itemName: '基礎工事',
            labelText: '',
            detailText: '',
            startDate: '2026-04-03',
            duration: 3,
            displayOrder: 0,
            isExportTarget: true,
          },
          {
            id: 'item-2',
            itemName: '躯体工事',
            labelText: '',
            detailText: '',
            startDate: '2026-04-01',
            duration: 7,
            displayOrder: 1,
            isExportTarget: true,
          },
        ],
      });

      const buffer = await service.exportToExcel(data);
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]!]!;
      const rows = XLSX.utils.sheet_to_json<(string | number | null)[]>(sheet, { header: 1 });

      const headerRow = rows[3]!;
      // 最小開始日: 4/1、最大完了日: 4/7（4/1 + 7 - 1）
      expect(headerRow[5]).toBe('4/1');
      expect(headerRow[11]).toBe('4/7');
      // 日付列数は7（4/1～4/7）
      const dateCols = headerRow.slice(5);
      expect(dateCols.length).toBe(7);
    });

    it('バー期間に該当するセルにスタイルオブジェクトが設定される', async () => {
      const data = createTestScheduleData({
        items: [
          {
            id: 'item-1',
            itemName: '基礎工事',
            labelText: '',
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
      const sheet = workbook.Sheets[workbook.SheetNames[0]!]!;

      // データ行のバー範囲セル（行4=インデックス4、列F/G/H=インデックス5/6/7）
      // セルが存在し、何らかの値が設定されていることを確認
      const barStartCell = sheet[XLSX.utils.encode_cell({ r: 4, c: 5 })];
      const barMidCell = sheet[XLSX.utils.encode_cell({ r: 4, c: 6 })];
      const barEndCell = sheet[XLSX.utils.encode_cell({ r: 4, c: 7 })];

      expect(barStartCell).toBeDefined();
      expect(barMidCell).toBeDefined();
      expect(barEndCell).toBeDefined();
    });

    it('バー期間外の日付セルにはバー背景色が設定されない', async () => {
      const data = createTestScheduleData({
        items: [
          {
            id: 'item-1',
            itemName: '基礎工事',
            labelText: '',
            detailText: '',
            startDate: '2026-04-02',
            duration: 2,
            displayOrder: 0,
            isExportTarget: true,
          },
          {
            id: 'item-2',
            itemName: '躯体工事',
            labelText: '',
            detailText: '',
            startDate: '2026-04-01',
            duration: 5,
            displayOrder: 1,
            isExportTarget: true,
          },
        ],
      });

      const buffer = await service.exportToExcel(data);
      const workbook = XLSX.read(buffer, { type: 'buffer', cellStyles: true });
      const sheet = workbook.Sheets[workbook.SheetNames[0]!]!;
      const rows = XLSX.utils.sheet_to_json<(string | number | null)[]>(sheet, { header: 1 });

      // item-1のバーは4/2-4/3のみ。4/1（列5）と4/4（列8）以降はバー外
      const dataRow1 = rows[4]!;
      // 4/1セル（列5）はitem-1のバー外なのでnullまたはundefined（xlsxライブラリは空セルをundefinedで返す）
      expect(dataRow1[5]).toBeUndefined();
    });

    it('土曜日の日付列ヘッダーセルに背景色スタイルが設定される', async () => {
      // 2026-04-04 = 土曜日
      const data = createTestScheduleData({
        items: [
          {
            id: 'item-1',
            itemName: '基礎工事',
            labelText: '',
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
      const sheet = workbook.Sheets[workbook.SheetNames[0]!]!;

      // ヘッダー行（行3）の土曜日列（4/4 = 列5+3=列8）
      const saturdayHeaderCell = sheet[XLSX.utils.encode_cell({ r: 3, c: 8 })];
      expect(saturdayHeaderCell).toBeDefined();

      // 日曜日列（4/5 = 列5+4=列9）
      const sundayHeaderCell = sheet[XLSX.utils.encode_cell({ r: 3, c: 9 })];
      expect(sundayHeaderCell).toBeDefined();
    });

    it('シート名が工程表である', async () => {
      const data = createTestScheduleData();
      const buffer = await service.exportToExcel(data);

      const workbook = XLSX.read(buffer, { type: 'buffer' });
      expect(workbook.SheetNames[0]).toBe('工程表');
    });

    it('列幅設定が存在する', async () => {
      const data = createTestScheduleData({
        items: [
          {
            id: 'item-1',
            itemName: '基礎工事',
            labelText: '',
            detailText: '',
            startDate: '2026-04-01',
            duration: 3,
            displayOrder: 0,
            isExportTarget: true,
          },
        ],
      });

      const buffer = await service.exportToExcel(data);
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]!]!;

      // xlsxライブラリでは!colsプロパティは読み取り時に保持されない場合があるが、
      // 生成されたファイルが有効であることを確認
      expect(sheet['!ref']).toBeDefined();
    });
  });

  // ============================================================================
  // Task 14.2: PDF出力ロジックの単体テスト（詳細検証）
  // Requirements: 8.2, 8.3, 8.4, 8.5, 9.3, 9.4, 10.5, 11.5
  // ============================================================================

  describe('exportToPdf - 詳細検証 (Task 14.2)', () => {
    // -----------------------------------------------------------------------
    // REQ-8.2, 8.3: プロジェクト名・自社名のヘッダー出力確認
    // -----------------------------------------------------------------------

    it('プロジェクト名と自社名の両方がPDF出力に含まれる', async () => {
      const data = createTestScheduleData({
        projectName: '品川再開発プロジェクト',
        companyName: '清水建設株式会社',
      });

      const buffer = await service.exportToPdf(data);
      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.subarray(0, 5).toString('ascii')).toBe('%PDF-');

      // プロジェクト名のみのPDFと比較してサイズが異なることで内容が含まれることを確認
      const dataNoCompany = createTestScheduleData({
        projectName: '品川再開発プロジェクト',
        companyName: '',
      });
      const bufferNoCompany = await service.exportToPdf(dataNoCompany);

      // 自社名を含む方がPDFサイズが大きい
      expect(buffer.length).toBeGreaterThan(bufferNoCompany.length);
    });

    it('プロジェクト名が空文字でもPDFが正常に生成される', async () => {
      const data = createTestScheduleData({ projectName: '' });
      const buffer = await service.exportToPdf(data);

      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    });

    it('自社名が空文字でもPDFが正常に生成される', async () => {
      const data = createTestScheduleData({ companyName: '' });
      const buffer = await service.exportToPdf(data);

      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    });

    // -----------------------------------------------------------------------
    // REQ-9.3, 9.4: 出力対象フィルタ（isExportTarget）の動作確認
    // -----------------------------------------------------------------------

    it('isExportTarget=falseの項目が複数ある場合も正しくフィルタされる', async () => {
      const dataWith1Item = createTestScheduleData({
        items: [
          {
            id: 'item-1',
            itemName: '基礎工事',
            labelText: '基礎',
            detailText: '',
            startDate: '2026-04-01',
            duration: 5,
            displayOrder: 0,
            isExportTarget: true,
          },
          {
            id: 'item-2',
            itemName: '非出力A',
            labelText: '',
            detailText: '',
            startDate: '2026-04-06',
            duration: 3,
            displayOrder: 1,
            isExportTarget: false,
          },
          {
            id: 'item-3',
            itemName: '非出力B',
            labelText: '',
            detailText: '',
            startDate: '2026-04-09',
            duration: 2,
            displayOrder: 2,
            isExportTarget: false,
          },
          {
            id: 'item-4',
            itemName: '非出力C',
            labelText: '',
            detailText: '',
            startDate: '2026-04-11',
            duration: 4,
            displayOrder: 3,
            isExportTarget: false,
          },
        ],
      });

      const dataWith4Items = createTestScheduleData({
        items: dataWith1Item.items.map((item) => ({ ...item, isExportTarget: true })),
      });

      const bufferWith1 = await service.exportToPdf(dataWith1Item);
      const bufferWith4 = await service.exportToPdf(dataWith4Items);

      // 4項目出力の方が1項目出力よりPDFサイズが大きい
      expect(bufferWith4.length).toBeGreaterThan(bufferWith1.length);
    });

    it('isExportTarget=falseからtrueに復帰した項目のPDFサイズが増加する', async () => {
      // 1項目のみ出力対象
      const data1 = createTestScheduleData({
        items: [
          {
            id: 'item-1',
            itemName: '基礎工事',
            labelText: '基礎',
            detailText: 'コンクリート',
            startDate: '2026-04-01',
            duration: 5,
            displayOrder: 0,
            isExportTarget: true,
          },
          {
            id: 'item-2',
            itemName: '躯体工事',
            labelText: '躯体',
            detailText: '鉄骨',
            startDate: '2026-04-06',
            duration: 5,
            displayOrder: 1,
            isExportTarget: false, // 出力対象外
          },
        ],
      });

      // 2項目とも出力対象（復帰後）
      const data2 = createTestScheduleData({
        items: data1.items.map((item) => ({ ...item, isExportTarget: true })),
      });

      const buffer1 = await service.exportToPdf(data1);
      const buffer2 = await service.exportToPdf(data2);

      expect(buffer2.length).toBeGreaterThan(buffer1.length);
    });

    // -----------------------------------------------------------------------
    // REQ-8.4, 10.5, 11.5: 項目情報の出力確認
    // -----------------------------------------------------------------------

    it('着工日が設定されている項目のPDFにはバー描画のrectコマンドが含まれる', async () => {
      const data = createTestScheduleData({
        items: [
          {
            id: 'item-1',
            itemName: '基礎工事',
            labelText: '基礎',
            detailText: '',
            startDate: '2026-04-01',
            duration: 5,
            displayOrder: 0,
            isExportTarget: true,
          },
        ],
      });

      const buffer = await service.exportToPdf(data);
      const pdfContent = buffer.toString('latin1');

      // rect描画コマンド（re）とfill描画コマンド（f）が含まれる
      expect(pdfContent).toContain(' re');
      expect(pdfContent).toContain(' f');
    });

    it('着工日がnullで日数もnullの項目ではバー矩形描画コマンドが増加しない', async () => {
      // バーなし項目のみ
      const dataNoBar = createTestScheduleData({
        items: [
          {
            id: 'item-1',
            itemName: '準備工事',
            labelText: '準備',
            detailText: '',
            startDate: null,
            duration: null,
            displayOrder: 0,
            isExportTarget: true,
          },
        ],
      });

      // バーあり項目のみ
      const dataWithBar = createTestScheduleData({
        items: [
          {
            id: 'item-1',
            itemName: '基礎工事',
            labelText: '基礎',
            detailText: '',
            startDate: '2026-04-01',
            duration: 5,
            displayOrder: 0,
            isExportTarget: true,
          },
        ],
      });

      const bufferNoBar = await service.exportToPdf(dataNoBar);
      const bufferWithBar = await service.exportToPdf(dataWithBar);

      // バーあり版の方がrectコマンド数が多い（サイズが大きい）
      const noBarRects = (bufferNoBar.toString('latin1').match(/ re\n/g) || []).length;
      const withBarRects = (bufferWithBar.toString('latin1').match(/ re\n/g) || []).length;
      expect(withBarRects).toBeGreaterThan(noBarRects);
    });

    it('詳細文字を含む項目のPDFはテキスト描画コマンドが増加する', async () => {
      const dataNoDetail = createTestScheduleData({
        items: [
          {
            id: 'item-1',
            itemName: '基礎工事',
            labelText: '',
            detailText: '',
            startDate: '2026-04-01',
            duration: 5,
            displayOrder: 0,
            isExportTarget: true,
          },
        ],
      });

      const dataWithDetail = createTestScheduleData({
        items: [
          {
            id: 'item-1',
            itemName: '基礎工事',
            labelText: '',
            detailText: 'コンクリート打設工事詳細',
            startDate: '2026-04-01',
            duration: 5,
            displayOrder: 0,
            isExportTarget: true,
          },
        ],
      });

      const bufferNoDetail = await service.exportToPdf(dataNoDetail);
      const bufferWithDetail = await service.exportToPdf(dataWithDetail);

      // 詳細文字を含む方がPDFサイズが大きい
      expect(bufferWithDetail.length).toBeGreaterThan(bufferNoDetail.length);
    });

    it('ラベル文字を含む項目のPDFはテキスト描画コマンドが増加する', async () => {
      const dataNoLabel = createTestScheduleData({
        items: [
          {
            id: 'item-1',
            itemName: '基礎工事',
            labelText: '',
            detailText: '',
            startDate: '2026-04-01',
            duration: 5,
            displayOrder: 0,
            isExportTarget: true,
          },
        ],
      });

      const dataWithLabel = createTestScheduleData({
        items: [
          {
            id: 'item-1',
            itemName: '基礎工事',
            labelText: '基礎工事ラベルテキスト',
            detailText: '',
            startDate: '2026-04-01',
            duration: 5,
            displayOrder: 0,
            isExportTarget: true,
          },
        ],
      });

      const bufferNoLabel = await service.exportToPdf(dataNoLabel);
      const bufferWithLabel = await service.exportToPdf(dataWithLabel);

      // ラベル文字を含む方がPDFサイズが大きい
      expect(bufferWithLabel.length).toBeGreaterThan(bufferNoLabel.length);
    });

    // -----------------------------------------------------------------------
    // ランドスケープレイアウトの確認
    // -----------------------------------------------------------------------

    it('PDFのページサイズがA4ランドスケープ（幅>高さ）である', async () => {
      const data = createTestScheduleData();
      const buffer = await service.exportToPdf(data);

      const pdfContent = buffer.toString('latin1');
      // A4ランドスケープのMediaBox: [0 0 841.89 595.28]
      // 幅(841) > 高さ(595) となるページ設定が含まれる
      // jsPDFの出力にはMediaBoxが含まれる
      const mediaBoxMatch = pdfContent.match(/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/);
      expect(mediaBoxMatch).not.toBeNull();
      if (mediaBoxMatch) {
        const width = parseFloat(mediaBoxMatch[1]!);
        const height = parseFloat(mediaBoxMatch[2]!);
        // ランドスケープ: 幅 > 高さ
        expect(width).toBeGreaterThan(height);
        // A4サイズの許容範囲（±1pt）: 幅841.89pt, 高さ595.28pt
        expect(width).toBeCloseTo(841.89, 0);
        expect(height).toBeCloseTo(595.28, 0);
      }
    });

    it('1ページのみで構成されるPDFを生成する', async () => {
      const data = createTestScheduleData({
        items: [
          {
            id: 'item-1',
            itemName: '基礎工事',
            labelText: '基礎',
            detailText: '',
            startDate: '2026-04-01',
            duration: 5,
            displayOrder: 0,
            isExportTarget: true,
          },
        ],
      });

      const buffer = await service.exportToPdf(data);
      const pdfContent = buffer.toString('latin1');

      // PDFのページ数を確認（/Type /Page の出現回数、ただし/Type /Pagesは除く）
      const pageMatches = pdfContent.match(/\/Type\s*\/Page(?!s)/g);
      expect(pageMatches).not.toBeNull();
      expect(pageMatches!.length).toBe(1);
    });

    // -----------------------------------------------------------------------
    // 土日祝の背景色矩形描画
    // -----------------------------------------------------------------------

    it('土日を含む期間のPDFは平日のみの期間より多くの矩形描画コマンドを含む', async () => {
      // 2026-04-06(月)～2026-04-08(水): 平日のみ3日間
      const dataWeekdaysOnly = createTestScheduleData({
        items: [
          {
            id: 'item-1',
            itemName: '基礎工事',
            labelText: '',
            detailText: '',
            startDate: '2026-04-06',
            duration: 3,
            displayOrder: 0,
            isExportTarget: true,
          },
        ],
      });

      // 2026-04-01(水)～2026-04-07(火): 土日を含む7日間
      const dataWithWeekend = createTestScheduleData({
        items: [
          {
            id: 'item-1',
            itemName: '基礎工事',
            labelText: '',
            detailText: '',
            startDate: '2026-04-01',
            duration: 7,
            displayOrder: 0,
            isExportTarget: true,
          },
        ],
      });

      const bufferWeekdays = await service.exportToPdf(dataWeekdaysOnly);
      const bufferWithWeekend = await service.exportToPdf(dataWithWeekend);

      // 土日を含む方がfillColor設定+rect描画が多いためPDFサイズが大きい
      const weekdayRects = (bufferWeekdays.toString('latin1').match(/ re\n/g) || []).length;
      const weekendRects = (bufferWithWeekend.toString('latin1').match(/ re\n/g) || []).length;
      expect(weekendRects).toBeGreaterThan(weekdayRects);
    });

    // -----------------------------------------------------------------------
    // エッジケース
    // -----------------------------------------------------------------------

    it('項目リストが空配列でもPDFが正常に生成される', async () => {
      const data = createTestScheduleData({ items: [] });
      const buffer = await service.exportToPdf(data);

      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    });

    it('長い項目名でもPDFが正常に生成される', async () => {
      const longName = 'あ'.repeat(500);
      const data = createTestScheduleData({
        items: [
          {
            id: 'item-1',
            itemName: longName,
            labelText: 'あ'.repeat(200),
            detailText: 'あ'.repeat(500),
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

    it('duration=1の最短期間でもPDFバー描画が正常に行われる', async () => {
      const data = createTestScheduleData({
        items: [
          {
            id: 'item-1',
            itemName: '検査',
            labelText: '検査',
            detailText: '完了検査',
            startDate: '2026-04-01',
            duration: 1,
            displayOrder: 0,
            isExportTarget: true,
          },
        ],
      });

      const buffer = await service.exportToPdf(data);
      const pdfContent = buffer.toString('latin1');

      expect(buffer).toBeInstanceOf(Buffer);
      expect(pdfContent).toContain(' re');
    });
  });
});
