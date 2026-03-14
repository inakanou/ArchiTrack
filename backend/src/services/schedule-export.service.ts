/**
 * @fileoverview 工程表エクスポートサービス
 *
 * 工程表のExcel出力を担当します。
 * ガントチャートをセル背景色で再現し、プロジェクト名・自社名をヘッダーに含めます。
 *
 * Task 11.1: ScheduleExportServiceのExcel出力ロジックを実装する
 *
 * Requirements (construction-schedule):
 * - REQ-7.1: Excelダウンロード
 * - REQ-7.2: プロジェクト名含むExcel
 * - REQ-7.3: 自社名含むExcel
 * - REQ-7.4: 項目情報含むExcel（着工日・日数・完了日）
 * - REQ-7.5: ガントチャート再現Excel（セル背景色）
 * - REQ-9.3: isExportTarget=false の項目を出力から除外
 * - REQ-9.4: isExportTarget=true に復帰した項目は出力対象に復帰
 * - REQ-10.5: ラベル文字のExcel出力（左列セル）
 * - REQ-11.5: 詳細文字のExcel出力（バー先頭セル）
 *
 * @module services/schedule-export
 */

import * as XLSX from 'xlsx';
import type { PrismaClient } from '../generated/prisma/client.js';

// ============================================================================
// 型定義
// ============================================================================

/**
 * ScheduleExportService 依存関係
 */
export interface ScheduleExportServiceDependencies {
  prisma: PrismaClient;
}

/**
 * エクスポート用項目データ
 */
export interface ScheduleExportItem {
  id: string;
  itemName: string;
  labelText: string;
  detailText: string;
  startDate: string | null;
  duration: number | null;
  displayOrder: number;
  isExportTarget: boolean;
}

/**
 * エクスポート用工程表データ
 */
export interface ScheduleExportData {
  id: string;
  name: string;
  projectName: string;
  companyName: string;
  items: ScheduleExportItem[];
}

// ============================================================================
// 定数定義
// ============================================================================

/** バーの背景色（ARGB形式） */
const BAR_COLOR = '4472C4';

/** 土曜日の背景色 */
const SATURDAY_COLOR = 'DAEEF3';

/** 日曜日の背景色 */
const SUNDAY_COLOR = 'F2DCDB';

/** 祝日の背景色 */
const HOLIDAY_COLOR = 'FDE9D9';

/** ヘッダー行数（プロジェクト名、自社名、空行、日付ヘッダー） */
const HEADER_ROWS = 4;

/** 固定列数（ラベル、項目名、着工日、日数、完了日） */
const FIXED_COLS = 5;

// ============================================================================
// 祝日判定ユーティリティ（バックエンド用）
// ============================================================================

/**
 * DateをYYYY-MM-DD形式の文字列に変換する
 */
function formatDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * 祝日マップを生成する（指定期間の祝日をキャッシュ）
 */
async function buildHolidayMap(startDate: Date, endDate: Date): Promise<Map<string, string>> {
  const holidayMap = new Map<string, string>();

  try {
    // 動的インポートで @holiday-jp/holiday_jp を読み込む
    const holidayJp = await import('@holiday-jp/holiday_jp');
    const between = holidayJp.default?.between ?? holidayJp.between;

    if (typeof between === 'function') {
      const holidays = between(startDate, endDate);
      for (const h of holidays) {
        const d = h.date instanceof Date ? h.date : new Date(h.date);
        holidayMap.set(formatDateKey(d), h.name);
      }
    }
  } catch {
    // holiday-jpが利用できない場合は空のマップを返す
  }

  return holidayMap;
}

// ============================================================================
// サービスクラス
// ============================================================================

/**
 * 工程表エクスポートサービス
 *
 * 工程表のExcel/PDF出力機能を提供します。
 */
export class ScheduleExportService {
  private readonly prisma: PrismaClient;

  constructor(deps: ScheduleExportServiceDependencies) {
    this.prisma = deps.prisma;
  }

  // ============================================================================
  // Public: データ取得
  // ============================================================================

  /**
   * 工程表IDからエクスポートデータを取得する
   *
   * @param scheduleId - 工程表ID
   * @returns エクスポートデータ、見つからない場合はnull
   */
  async getExportData(scheduleId: string): Promise<ScheduleExportData | null> {
    const schedule = await this.prisma.constructionSchedule.findUnique({
      where: { id: scheduleId },
      include: {
        project: { select: { name: true } },
        items: {
          orderBy: { displayOrder: 'asc' },
        },
      },
    });

    if (!schedule || schedule.deletedAt) {
      return null;
    }

    // 自社情報の取得
    const companyInfo = await this.prisma.companyInfo.findFirst();

    return {
      id: schedule.id,
      name: schedule.name,
      projectName: schedule.project.name,
      companyName: companyInfo?.companyName ?? '',
      items: schedule.items.map((item) => ({
        id: item.id,
        itemName: item.itemName,
        labelText: item.labelText,
        detailText: item.detailText,
        startDate: item.startDate ? formatDateKey(item.startDate) : null,
        duration: item.duration,
        displayOrder: item.displayOrder,
        isExportTarget: item.isExportTarget,
      })),
    };
  }

  // ============================================================================
  // Public: Excel出力
  // ============================================================================

  /**
   * 工程表データをExcel形式で出力する
   *
   * Requirements:
   * - REQ-7.1: Excel出力
   * - REQ-7.2: プロジェクト名含む
   * - REQ-7.3: 自社名含む
   * - REQ-7.4: 項目情報含む
   * - REQ-7.5: ガントチャート再現
   * - REQ-9.3: isExportTarget=false除外
   * - REQ-10.5: ラベル文字出力
   * - REQ-11.5: 詳細文字出力
   *
   * @param data - エクスポートデータ
   * @returns Excel バッファ
   */
  async exportToExcel(data: ScheduleExportData): Promise<Buffer> {
    // isExportTarget=true の項目のみフィルタ
    const exportItems = data.items.filter((item) => item.isExportTarget);

    // 全項目の日付範囲を算出
    const dateRange = this.calculateDateRange(exportItems);

    // 日付列の生成
    const dateColumns = dateRange
      ? this.generateDateColumns(dateRange.startDate, dateRange.endDate)
      : [];

    // 祝日マップの生成
    const holidayMap = dateRange
      ? await buildHolidayMap(new Date(dateRange.startDate), new Date(dateRange.endDate))
      : new Map<string, string>();

    // ワークブック作成
    const workbook = XLSX.utils.book_new();

    // シートデータの構築
    const sheetData = this.buildSheetData(data, exportItems, dateColumns, holidayMap);

    // ワークシート作成
    const worksheet = XLSX.utils.aoa_to_sheet(sheetData);

    // セルスタイルの設定（バー背景色、土日祝背景色）
    this.applyStyles(worksheet, exportItems, dateColumns, holidayMap);

    // 列幅の設定
    this.setColumnWidths(worksheet, dateColumns.length);

    // シートをワークブックに追加
    XLSX.utils.book_append_sheet(workbook, worksheet, '工程表');

    // バッファとして出力
    const buffer = XLSX.write(workbook, {
      type: 'buffer',
      bookType: 'xlsx',
      cellStyles: true,
    });
    return buffer;
  }

  // ============================================================================
  // Public: ユーティリティ
  // ============================================================================

  /**
   * 着工日と日数から完了日を算出する
   *
   * @param startDate - 着工日（YYYY-MM-DD形式）
   * @param duration - 日数
   * @returns 完了日（YYYY-MM-DD形式）、入力がnullの場合はnull
   */
  calculateEndDate(startDate: string | null, duration: number | null): string | null {
    if (!startDate || !duration) {
      return null;
    }

    const start = new Date(startDate);
    const end = new Date(start);
    end.setDate(start.getDate() + duration - 1);
    return formatDateKey(end);
  }

  // ============================================================================
  // Private: シートデータ構築
  // ============================================================================

  /**
   * シートデータ（2D配列）を構築する
   */
  private buildSheetData(
    data: ScheduleExportData,
    exportItems: ScheduleExportItem[],
    dateColumns: Date[],
    _holidayMap: Map<string, string>
  ): (string | number | null)[][] {
    const rows: (string | number | null)[][] = [];

    // 行1: プロジェクト名
    rows.push([data.projectName]);

    // 行2: 自社名
    rows.push([data.companyName]);

    // 行3: 空行
    rows.push([]);

    // 行4: ヘッダー行（固定列 + 日付列）
    const headerRow: (string | number | null)[] = ['ラベル', '項目名', '着工日', '日数', '完了日'];
    for (const date of dateColumns) {
      const month = date.getMonth() + 1;
      const day = date.getDate();
      headerRow.push(`${month}/${day}`);
    }
    rows.push(headerRow);

    // 行5〜: 各項目データ
    for (const item of exportItems) {
      const endDate = this.calculateEndDate(item.startDate, item.duration);

      const itemRow: (string | number | null)[] = [
        item.labelText,
        item.itemName,
        item.startDate ?? '',
        item.duration ?? '',
        endDate ?? '',
      ];

      // 日付列のセルデータ
      for (let colIdx = 0; colIdx < dateColumns.length; colIdx++) {
        const date = dateColumns[colIdx]!;
        const dateStr = formatDateKey(date);

        // バー期間の判定
        if (
          item.startDate &&
          item.duration &&
          endDate &&
          dateStr >= item.startDate &&
          dateStr <= endDate
        ) {
          // バー先頭セルに詳細文字を配置
          if (dateStr === item.startDate && item.detailText) {
            itemRow.push(item.detailText);
          } else {
            itemRow.push('');
          }
        } else {
          itemRow.push(null);
        }
      }

      rows.push(itemRow);
    }

    return rows;
  }

  // ============================================================================
  // Private: スタイル適用
  // ============================================================================

  /**
   * セルスタイルを適用する（バー背景色、土日祝背景色）
   */
  private applyStyles(
    worksheet: XLSX.WorkSheet,
    exportItems: ScheduleExportItem[],
    dateColumns: Date[],
    holidayMap: Map<string, string>
  ): void {
    // 日付列ヘッダーの土日祝背景色
    for (let colIdx = 0; colIdx < dateColumns.length; colIdx++) {
      const date = dateColumns[colIdx]!;
      const cellRef = XLSX.utils.encode_cell({ r: HEADER_ROWS - 1, c: FIXED_COLS + colIdx });
      const bgColor = this.getDateBackgroundColor(date, holidayMap);

      if (bgColor) {
        this.setCellStyle(worksheet, cellRef, bgColor);
      }
    }

    // 各項目行のセルスタイル
    for (let rowIdx = 0; rowIdx < exportItems.length; rowIdx++) {
      const item = exportItems[rowIdx]!;
      const endDate = this.calculateEndDate(item.startDate, item.duration);

      for (let colIdx = 0; colIdx < dateColumns.length; colIdx++) {
        const date = dateColumns[colIdx]!;
        const dateStr = formatDateKey(date);
        const cellRef = XLSX.utils.encode_cell({
          r: HEADER_ROWS + rowIdx,
          c: FIXED_COLS + colIdx,
        });

        // バー期間のセルに背景色
        if (
          item.startDate &&
          item.duration &&
          endDate &&
          dateStr >= item.startDate &&
          dateStr <= endDate
        ) {
          this.setCellStyle(worksheet, cellRef, BAR_COLOR);
        } else {
          // 非バー期間の土日祝背景色
          const bgColor = this.getDateBackgroundColor(date, holidayMap);
          if (bgColor) {
            this.setCellStyle(worksheet, cellRef, bgColor);
          }
        }
      }
    }
  }

  /**
   * セルに背景色スタイルを設定する
   */
  private setCellStyle(worksheet: XLSX.WorkSheet, cellRef: string, bgColor: string): void {
    if (!worksheet[cellRef]) {
      worksheet[cellRef] = { t: 's', v: '' };
    }

    // xlsxライブラリのスタイル設定
    const cell = worksheet[cellRef] as XLSX.CellObject & {
      s?: { fill?: { fgColor?: { rgb: string }; patternType?: string } };
    };
    cell.s = {
      fill: {
        fgColor: { rgb: bgColor },
        patternType: 'solid',
      },
    };
  }

  /**
   * 日付の背景色を取得する（土曜/日曜/祝日）
   */
  private getDateBackgroundColor(date: Date, holidayMap: Map<string, string>): string | null {
    const dateKey = formatDateKey(date);

    // 祝日チェック（祝日が最優先）
    if (holidayMap.has(dateKey)) {
      return HOLIDAY_COLOR;
    }

    const dayOfWeek = date.getDay();

    // 日曜日
    if (dayOfWeek === 0) {
      return SUNDAY_COLOR;
    }

    // 土曜日
    if (dayOfWeek === 6) {
      return SATURDAY_COLOR;
    }

    return null;
  }

  // ============================================================================
  // Private: 日付範囲と列生成
  // ============================================================================

  /**
   * 全出力対象項目の日付範囲を算出する
   */
  private calculateDateRange(
    items: ScheduleExportItem[]
  ): { startDate: string; endDate: string } | null {
    let minDate: string | null = null;
    let maxDate: string | null = null;

    for (const item of items) {
      if (!item.startDate || !item.duration) continue;

      const endDate = this.calculateEndDate(item.startDate, item.duration);
      if (!endDate) continue;

      if (!minDate || item.startDate < minDate) {
        minDate = item.startDate;
      }
      if (!maxDate || endDate > maxDate) {
        maxDate = endDate;
      }
    }

    if (!minDate || !maxDate) {
      return null;
    }

    return { startDate: minDate, endDate: maxDate };
  }

  /**
   * 日付列の配列を生成する（開始日から終了日まで）
   */
  private generateDateColumns(startDate: string, endDate: string): Date[] {
    const columns: Date[] = [];
    const start = new Date(startDate);
    const end = new Date(endDate);

    const current = new Date(start);
    while (current <= end) {
      columns.push(new Date(current));
      current.setDate(current.getDate() + 1);
    }

    return columns;
  }

  // ============================================================================
  // Private: 列幅設定
  // ============================================================================

  /**
   * 列幅を設定する
   */
  private setColumnWidths(worksheet: XLSX.WorkSheet, dateColumnCount: number): void {
    const cols: XLSX.ColInfo[] = [
      { wch: 12 }, // ラベル
      { wch: 20 }, // 項目名
      { wch: 12 }, // 着工日
      { wch: 6 }, // 日数
      { wch: 12 }, // 完了日
    ];

    // 日付列は幅を狭くする
    for (let i = 0; i < dateColumnCount; i++) {
      cols.push({ wch: 4 });
    }

    worksheet['!cols'] = cols;
  }
}
