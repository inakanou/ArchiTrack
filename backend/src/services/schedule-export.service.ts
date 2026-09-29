/**
 * @fileoverview 工程表エクスポートサービス
 *
 * 工程表のExcel/PDF出力を担当します。
 * ガントチャートをExcelではセル背景色、PDFではrect()矩形描画で再現し、
 * プロジェクト名・自社名をヘッダーに含めます。
 *
 * Task 11.1: ScheduleExportServiceのExcel出力ロジックを実装する
 * Task 12.1: ScheduleExportServiceのPDF出力ロジックを実装する
 * Task 18.4: PDF出力を複数ページに対応させ、全工程項目とガントチャートの全期間を含める
 *
 * Requirements (construction-schedule):
 * - REQ-7.1: Excelダウンロード
 * - REQ-7.2: プロジェクト名含むExcel
 * - REQ-7.3: 自社名含むExcel
 * - REQ-7.4: 項目情報含むExcel（着工日・日数・完了日）
 * - REQ-7.5: ガントチャート再現Excel（セル背景色）
 * - REQ-8.1: PDFダウンロード
 * - REQ-8.2: プロジェクト名含むPDF
 * - REQ-8.3: 自社名含むPDF
 * - REQ-8.4: 項目情報含むPDF（着工日・日数・完了日をテーブル行として出力）
 * - REQ-8.5: ガントチャート再現PDF（rect()矩形描画）
 * - REQ-9.3: isExportTarget=false の項目を出力から除外
 * - REQ-9.4: isExportTarget=true に復帰した項目は出力対象に復帰
 * - REQ-10.5: ラベル文字のExcel/PDF出力
 * - REQ-11.5: 詳細文字のExcel/PDF出力
 *
 * @module services/schedule-export
 */

import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
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

/**
 * PDF の日付見出し1つ分（Task 18.4）
 */
interface PdfDateLabel {
  /** 見出しを置く日付列の位置 */
  colIdx: number;
  /** 見出しの文字 */
  text: string;
  /** 区切り（週・月の始まり）ではない期間の先頭に置く見出しか（目盛り線を引かない） */
  leading?: boolean;
}

/**
 * PDF の日付列の幅と見出しの配置（Task 18.4）
 */
interface PdfDateLayout {
  /** 1日あたりの幅（mm）。全期間がページ幅に収まるよう PDF_DAY_WIDTH を上限に縮める */
  dayWidth: number;
  /** 日付見出し（縮めた場合は重ならないよう間引いたもの） */
  labels: PdfDateLabel[];
  /** 見出しの位置に目盛り線を引くか（縮めた場合のみ） */
  showTicks: boolean;
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
// PDF出力用定数
// ============================================================================

/** PDF: 1日あたりの幅（mm） */
const PDF_DAY_WIDTH = 5;

/** PDF: 行の高さ（mm） */
const PDF_ROW_HEIGHT = 8;

/** PDF: マージン上（mm） */
const PDF_MARGIN_TOP = 20;

/** PDF: マージン左（mm） */
const PDF_MARGIN_LEFT = 10;

/** PDF: マージン下（mm） */
const PDF_MARGIN_BOTTOM = 15;

/** PDF: マージン右（mm）- ガントチャートの全期間をこの内側に収める */
const PDF_MARGIN_RIGHT = 10;

/** PDF: 2ページ目以降の表ヘッダーの上端（mm）- プロジェクト名・自社名は1ページ目のみ */
const PDF_CONTINUATION_TABLE_TOP = PDF_MARGIN_TOP;

/** PDF: ヘッダー領域の高さ（mm）- プロジェクト名・自社名を含む */
const PDF_HEADER_HEIGHT = 25;

/** PDF: テーブル固定列の幅（ラベル+項目名+着工日+日数+完了日） */
const PDF_LABEL_COL_WIDTH = 20;
const PDF_ITEM_NAME_COL_WIDTH = 35;
const PDF_START_DATE_COL_WIDTH = 22;
const PDF_DURATION_COL_WIDTH = 12;
const PDF_END_DATE_COL_WIDTH = 22;

/** PDF: テーブル固定列の合計幅 */
const PDF_FIXED_COLS_WIDTH =
  PDF_LABEL_COL_WIDTH +
  PDF_ITEM_NAME_COL_WIDTH +
  PDF_START_DATE_COL_WIDTH +
  PDF_DURATION_COL_WIDTH +
  PDF_END_DATE_COL_WIDTH;

/** PDF: バー背景色（RGB 0-1） */
const PDF_BAR_COLOR = { r: 0.267, g: 0.447, b: 0.769 }; // #4472C4

/** PDF: 土曜日背景色（RGB 0-1） */
const PDF_SATURDAY_COLOR = { r: 0.855, g: 0.933, b: 0.953 }; // #DAEEF3

/** PDF: 日曜日背景色（RGB 0-1） */
const PDF_SUNDAY_COLOR = { r: 0.949, g: 0.863, b: 0.859 }; // #F2DCDB

/** PDF: 祝日背景色（RGB 0-1） */
const PDF_HOLIDAY_COLOR = { r: 0.992, g: 0.914, b: 0.851 }; // #FDE9D9

/** PDF: 日付見出しの文字の左右の余白（mm） */
const PDF_DATE_LABEL_PADDING = 0.5;

/** PDF: 日付見出しの目盛り線の色（RGB 0-255） */
const PDF_DATE_TICK_GRAY = 150;

/** PDF: 月単位の見出しの間引きの段階（何か月ごとに見出しを置くか） */
const PDF_MONTH_LABEL_STEPS = [1, 2, 3, 6, 12] as const;

/** PDF: フォントサイズ（pt） */
const PDF_FONT_SIZE_TITLE = 12;
const PDF_FONT_SIZE_HEADER = 8;
const PDF_FONT_SIZE_BODY = 7;
const PDF_FONT_SIZE_SMALL = 6;

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
  // Public: PDF出力
  // ============================================================================

  /**
   * 工程表データをPDF形式で出力する
   *
   * Requirements:
   * - REQ-8.1: PDF出力
   * - REQ-8.2: プロジェクト名含む
   * - REQ-8.3: 自社名含む
   * - REQ-8.4: 項目情報含む
   * - REQ-8.5: ガントチャート再現（rect()矩形描画）
   * - REQ-9.3: isExportTarget=false除外
   * - REQ-10.5: ラベル文字出力
   * - REQ-11.5: 詳細文字出力
   *
   * @param data - エクスポートデータ
   * @returns PDF バッファ
   */
  async exportToPdf(data: ScheduleExportData): Promise<Buffer> {
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

    // jsPDFインスタンスを作成（A4横向き）
    const doc = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: 'a4',
    });

    // 全項目をページへ割り付けて描画（ヘッダー・表ヘッダー・土日祝の背景・項目行）
    this.drawPdfPages(doc, data, exportItems, dateColumns, holidayMap);

    // ArrayBufferからBufferへ変換
    const arrayBuffer = doc.output('arraybuffer');
    return Buffer.from(arrayBuffer);
  }

  // ============================================================================
  // Private: PDF描画メソッド
  // ============================================================================

  /**
   * 全出力対象項目をページへ割り付けて描画する（Task 18.4）
   *
   * - 縦方向: ページの下端に収まる行数ごとに改ページし、ページごとに表のヘッダーと
   *   土日祝の背景を描き直す。プロジェクト名・自社名は1ページ目のみに描く
   * - 横方向: ガントチャートの全期間が1ページの幅に収まるよう日付列の幅を合わせる
   *   （上限は PDF_DAY_WIDTH）。期間でページを分割しない
   */
  private drawPdfPages(
    doc: jsPDF,
    data: ScheduleExportData,
    exportItems: ScheduleExportItem[],
    dateColumns: Date[],
    holidayMap: Map<string, string>
  ): void {
    const pageHeight = doc.internal.pageSize.getHeight();
    const layout = this.buildPdfDateLayout(doc, dateColumns, doc.internal.pageSize.getWidth());

    this.drawPdfHeader(doc, data);

    let tableStartY = PDF_MARGIN_TOP + PDF_HEADER_HEIGHT;
    let drawnCount = 0;
    for (;;) {
      const dataStartY = tableStartY + PDF_ROW_HEIGHT;
      const rowsPerPage = Math.max(
        1,
        Math.floor((pageHeight - PDF_MARGIN_BOTTOM - dataStartY) / PDF_ROW_HEIGHT)
      );
      const pageItems = exportItems.slice(drawnCount, drawnCount + rowsPerPage);

      this.drawPdfTableHeader(doc, tableStartY, dateColumns, holidayMap, layout);
      this.drawPdfHolidayColumns(
        doc,
        dateColumns,
        holidayMap,
        dataStartY,
        pageItems.length,
        layout.dayWidth
      );
      this.drawPdfItemRows(doc, pageItems, dateColumns, dataStartY, layout.dayWidth);

      drawnCount += pageItems.length;
      if (drawnCount >= exportItems.length) break;

      doc.addPage('a4', 'landscape');
      tableStartY = PDF_CONTINUATION_TABLE_TOP;
    }
  }

  /**
   * 日付列の幅と日付見出しの配置を決める（Task 18.4）
   *
   * 全期間がページ幅（左右の余白と固定列を除く）に収まる幅を、PDF_DAY_WIDTH を上限として採る。
   * 上限のまま収まる短い期間は、従来どおり毎日「月/日」の見出しを置く。
   * 縮めた場合は日ごとの見出しが重なるため、見出しが重ならない最も細かい段階を
   * 「週（月曜日に 月/日）」→「月（1日に 年/月）」→「2・3・6・12か月ごと」の順に選ぶ。
   */
  private buildPdfDateLayout(doc: jsPDF, dateColumns: Date[], pageWidth: number): PdfDateLayout {
    const ganttWidth = pageWidth - PDF_MARGIN_LEFT - PDF_FIXED_COLS_WIDTH - PDF_MARGIN_RIGHT;
    const dayWidth =
      dateColumns.length > 0
        ? Math.min(PDF_DAY_WIDTH, ganttWidth / dateColumns.length)
        : PDF_DAY_WIDTH;

    if (dayWidth >= PDF_DAY_WIDTH) {
      return { dayWidth, labels: this.buildPdfDailyLabels(dateColumns), showTicks: false };
    }

    doc.setFontSize(PDF_FONT_SIZE_SMALL);
    const candidates: PdfDateLabel[][] = [
      this.buildPdfBoundaryLabels(
        dateColumns,
        (date) => date.getDay() === 1,
        (date) => `${date.getMonth() + 1}/${date.getDate()}`
      ),
      ...PDF_MONTH_LABEL_STEPS.map((step) =>
        this.buildPdfBoundaryLabels(
          dateColumns,
          (date) =>
            date.getDate() === 1 && (date.getFullYear() * 12 + date.getMonth()) % step === 0,
          (date) => `${date.getFullYear()}/${date.getMonth() + 1}`
        )
      ),
    ];

    for (const candidate of candidates) {
      const labels = this.dropLeadingLabelIfCrowded(doc, candidate, dayWidth);
      if (this.pdfLabelsFit(doc, labels, dayWidth, dateColumns.length)) {
        return { dayWidth, labels, showTicks: true };
      }
    }

    // どの段階でも重なる極端に長い期間: 最も粗い段階から、重なる見出しを間引く
    const coarsest = candidates[candidates.length - 1]!;
    return {
      dayWidth,
      labels: this.dropOverlappingPdfLabels(doc, coarsest, dayWidth, dateColumns.length),
      showTicks: true,
    };
  }

  /**
   * 毎日の「月/日」見出しを作る（縮尺を合わせない短い期間の従来の見た目）
   */
  private buildPdfDailyLabels(dateColumns: Date[]): PdfDateLabel[] {
    return dateColumns.map((date, colIdx) => ({
      colIdx,
      text: `${date.getMonth() + 1}/${date.getDate()}`,
    }));
  }

  /**
   * 区切り（週の始まり・月の始まりなど）ごとの見出しを作る。
   * 期間の先頭が区切りでない場合は先頭にも置く（次の見出しと重なるなら
   * dropLeadingLabelIfCrowded / dropOverlappingPdfLabels が省く）。
   */
  private buildPdfBoundaryLabels(
    dateColumns: Date[],
    isBoundary: (date: Date) => boolean,
    format: (date: Date) => string
  ): PdfDateLabel[] {
    const labels: PdfDateLabel[] = [];
    dateColumns.forEach((date, colIdx) => {
      if (colIdx === 0 || isBoundary(date)) {
        labels.push({ colIdx, text: format(date), leading: colIdx === 0 && !isBoundary(date) });
      }
    });
    return labels;
  }

  /**
   * 見出しが隣の見出し（最後の見出しは右余白の手前）と重ならないかを判定する。
   */
  private pdfLabelsFit(
    doc: jsPDF,
    labels: PdfDateLabel[],
    dayWidth: number,
    columnCount: number
  ): boolean {
    return labels.every((label, i) => {
      const nextColIdx = labels[i + 1]?.colIdx;
      const available =
        nextColIdx !== undefined
          ? (nextColIdx - label.colIdx) * dayWidth
          : (columnCount - label.colIdx) * dayWidth + PDF_MARGIN_RIGHT;
      return doc.getTextWidth(label.text) + PDF_DATE_LABEL_PADDING * 2 <= available;
    });
  }

  /**
   * 区切りでない先頭の見出しが次の見出しと重なるなら省く
   */
  private dropLeadingLabelIfCrowded(
    doc: jsPDF,
    labels: PdfDateLabel[],
    dayWidth: number
  ): PdfDateLabel[] {
    const [first, second] = labels;
    if (!first?.leading || !second) return labels;
    const available = (second.colIdx - first.colIdx) * dayWidth;
    return doc.getTextWidth(first.text) + PDF_DATE_LABEL_PADDING * 2 <= available
      ? labels
      : labels.slice(1);
  }

  /**
   * 前の見出しと重なる見出しを順に間引く（どの段階でも収まらない場合の最後の手段）
   */
  private dropOverlappingPdfLabels(
    doc: jsPDF,
    labels: PdfDateLabel[],
    dayWidth: number,
    columnCount: number
  ): PdfDateLabel[] {
    const kept: PdfDateLabel[] = [];
    let nextFreeX = 0;
    for (const label of labels) {
      const x = label.colIdx * dayWidth;
      const width = doc.getTextWidth(label.text) + PDF_DATE_LABEL_PADDING * 2;
      if (x >= nextFreeX && x + width <= columnCount * dayWidth + PDF_MARGIN_RIGHT) {
        kept.push(label);
        nextFreeX = x + width;
      }
    }
    return kept;
  }

  /**
   * PDFヘッダーを描画する（プロジェクト名・自社名）
   */
  private drawPdfHeader(doc: jsPDF, data: ScheduleExportData): void {
    doc.setFontSize(PDF_FONT_SIZE_TITLE);
    doc.text(data.projectName, PDF_MARGIN_LEFT, PDF_MARGIN_TOP);

    doc.setFontSize(PDF_FONT_SIZE_HEADER);
    doc.text(data.companyName, PDF_MARGIN_LEFT, PDF_MARGIN_TOP + 8);
  }

  /**
   * PDFテーブルヘッダーを描画する
   */
  private drawPdfTableHeader(
    doc: jsPDF,
    yPos: number,
    dateColumns: Date[],
    holidayMap: Map<string, string>,
    layout: PdfDateLayout
  ): void {
    doc.setFontSize(PDF_FONT_SIZE_HEADER);

    let xPos = PDF_MARGIN_LEFT;

    // 固定列ヘッダー
    doc.text('Label', xPos, yPos + PDF_ROW_HEIGHT - 2);
    xPos += PDF_LABEL_COL_WIDTH;

    doc.text('Item', xPos, yPos + PDF_ROW_HEIGHT - 2);
    xPos += PDF_ITEM_NAME_COL_WIDTH;

    doc.text('Start', xPos, yPos + PDF_ROW_HEIGHT - 2);
    xPos += PDF_START_DATE_COL_WIDTH;

    doc.text('Days', xPos, yPos + PDF_ROW_HEIGHT - 2);
    xPos += PDF_DURATION_COL_WIDTH;

    doc.text('End', xPos, yPos + PDF_ROW_HEIGHT - 2);
    xPos += PDF_END_DATE_COL_WIDTH;

    // 日付列ヘッダー: 土日祝の背景色（日ごと）
    const ganttAreaX = xPos;
    for (const date of dateColumns) {
      const bgColor = this.getPdfDateBackgroundColor(date, holidayMap);
      if (bgColor) {
        doc.setFillColor(bgColor.r * 255, bgColor.g * 255, bgColor.b * 255);
        doc.rect(xPos, yPos, layout.dayWidth, PDF_ROW_HEIGHT, 'F');
      }
      xPos += layout.dayWidth;
    }

    // 日付列ヘッダー: 見出し（縮尺に応じて間引いた位置のみ）と目盛り
    doc.setFontSize(PDF_FONT_SIZE_SMALL);
    doc.setDrawColor(PDF_DATE_TICK_GRAY, PDF_DATE_TICK_GRAY, PDF_DATE_TICK_GRAY);
    doc.setLineWidth(0.1);
    for (const label of layout.labels) {
      const labelX = ganttAreaX + label.colIdx * layout.dayWidth;
      if (layout.showTicks && !label.leading) {
        doc.line(labelX, yPos, labelX, yPos + PDF_ROW_HEIGHT);
      }
      doc.setTextColor(0, 0, 0);
      doc.text(label.text, labelX + PDF_DATE_LABEL_PADDING, yPos + PDF_ROW_HEIGHT - 2);
    }
  }

  /**
   * 土日祝列の背景色矩形を全行にわたって描画する
   */
  private drawPdfHolidayColumns(
    doc: jsPDF,
    dateColumns: Date[],
    holidayMap: Map<string, string>,
    startY: number,
    itemCount: number,
    dayWidth: number
  ): void {
    const totalHeight = itemCount * PDF_ROW_HEIGHT;
    if (totalHeight <= 0) return;

    let xPos = PDF_MARGIN_LEFT + PDF_FIXED_COLS_WIDTH;

    for (const date of dateColumns) {
      const bgColor = this.getPdfDateBackgroundColor(date, holidayMap);
      if (bgColor) {
        doc.setFillColor(bgColor.r * 255, bgColor.g * 255, bgColor.b * 255);
        doc.rect(xPos, startY, dayWidth, totalHeight, 'F');
      }
      xPos += dayWidth;
    }
  }

  /**
   * 各項目行を描画する（渡された項目はすべて1ページに収まる前提。割り付けは drawPdfPages）
   */
  private drawPdfItemRows(
    doc: jsPDF,
    exportItems: ScheduleExportItem[],
    dateColumns: Date[],
    startY: number,
    dayWidth: number
  ): void {
    for (let rowIdx = 0; rowIdx < exportItems.length; rowIdx++) {
      const item = exportItems[rowIdx]!;
      const yPos = startY + rowIdx * PDF_ROW_HEIGHT;

      const endDate = this.calculateEndDate(item.startDate, item.duration);
      let xPos = PDF_MARGIN_LEFT;

      // ラベル文字（左列テキスト領域）
      doc.setFontSize(PDF_FONT_SIZE_BODY);
      doc.setTextColor(0, 0, 0);
      doc.text(
        this.truncatePdfText(item.labelText, PDF_LABEL_COL_WIDTH),
        xPos,
        yPos + PDF_ROW_HEIGHT - 2
      );
      xPos += PDF_LABEL_COL_WIDTH;

      // 項目名
      doc.text(
        this.truncatePdfText(item.itemName, PDF_ITEM_NAME_COL_WIDTH),
        xPos,
        yPos + PDF_ROW_HEIGHT - 2
      );
      xPos += PDF_ITEM_NAME_COL_WIDTH;

      // 着工日
      doc.text(item.startDate ?? '', xPos, yPos + PDF_ROW_HEIGHT - 2);
      xPos += PDF_START_DATE_COL_WIDTH;

      // 日数
      doc.text(item.duration?.toString() ?? '', xPos, yPos + PDF_ROW_HEIGHT - 2);
      xPos += PDF_DURATION_COL_WIDTH;

      // 完了日
      doc.text(endDate ?? '', xPos, yPos + PDF_ROW_HEIGHT - 2);

      // ガントチャートバーの描画（rect()矩形描画）
      if (item.startDate && item.duration && endDate && dateColumns.length > 0) {
        this.drawPdfGanttBar(doc, item, dateColumns, endDate, dayWidth, yPos);
      }
    }
  }

  /**
   * ガントチャートバーをrect()で描画する
   */
  private drawPdfGanttBar(
    doc: jsPDF,
    item: ScheduleExportItem,
    dateColumns: Date[],
    endDate: string,
    dayWidth: number,
    yPos: number
  ): void {
    if (!item.startDate || !item.duration) return;

    const ganttAreaX = PDF_MARGIN_LEFT + PDF_FIXED_COLS_WIDTH;

    // 着工日からのオフセットでX座標を算出
    let barStartCol = -1;
    let barEndCol = -1;

    for (let colIdx = 0; colIdx < dateColumns.length; colIdx++) {
      const dateStr = formatDateKey(dateColumns[colIdx]!);

      if (dateStr === item.startDate && barStartCol === -1) {
        barStartCol = colIdx;
      }
      if (dateStr <= endDate) {
        barEndCol = colIdx;
      }
    }

    if (barStartCol >= 0 && barEndCol >= 0) {
      const barX = ganttAreaX + barStartCol * dayWidth;
      const barWidth = (barEndCol - barStartCol + 1) * dayWidth;
      const barY = yPos + 1;
      const barHeight = PDF_ROW_HEIGHT - 2;

      // バー矩形描画
      doc.setFillColor(PDF_BAR_COLOR.r * 255, PDF_BAR_COLOR.g * 255, PDF_BAR_COLOR.b * 255);
      doc.rect(barX, barY, barWidth, barHeight, 'F');

      // 詳細文字をバー矩形の上にtext()で配置
      if (item.detailText) {
        doc.setFontSize(PDF_FONT_SIZE_SMALL);
        doc.setTextColor(255, 255, 255);
        doc.text(this.truncatePdfText(item.detailText, barWidth), barX + 0.5, barY + barHeight - 1);
        doc.setTextColor(0, 0, 0);
      }
    }
  }

  /**
   * 日付のPDF用背景色を取得する（土曜/日曜/祝日）
   */
  private getPdfDateBackgroundColor(
    date: Date,
    holidayMap: Map<string, string>
  ): { r: number; g: number; b: number } | null {
    const dateKey = formatDateKey(date);

    // 祝日チェック（祝日が最優先）
    if (holidayMap.has(dateKey)) {
      return PDF_HOLIDAY_COLOR;
    }

    const dayOfWeek = date.getDay();

    // 日曜日
    if (dayOfWeek === 0) {
      return PDF_SUNDAY_COLOR;
    }

    // 土曜日
    if (dayOfWeek === 6) {
      return PDF_SATURDAY_COLOR;
    }

    return null;
  }

  /**
   * PDFテキストを指定幅で切り詰める（簡易的な文字数ベース）
   */
  private truncatePdfText(text: string, maxWidthMm: number): string {
    // 1文字あたり約2mm（7ptフォント想定）の簡易計算
    const maxChars = Math.floor(maxWidthMm / 2);
    if (text.length <= maxChars) {
      return text;
    }
    return text.substring(0, maxChars - 1) + '..';
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
