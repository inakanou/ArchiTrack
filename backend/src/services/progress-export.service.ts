/**
 * @fileoverview 月別出来高エクスポートサービス
 *
 * 月別出来高データをExcel/PDFで出力します。
 * ProgressServiceのgetMonthlyAggregationデータを使用し、
 * 対象月・当月出来高金額・累計出来高金額・累計出来高率を含むエクスポートを提供します。
 *
 * Task 6.2: 月別出来高エクスポートサービス実装
 *
 * Requirements (execution-budget-management):
 * - 16.4: 月別出来高データをExcelファイル（.xlsx形式）で出力
 * - 16.5: 月別出来高データをPDFファイルで出力
 *
 * @module services/progress-export
 */

import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import type { ProgressService, MonthlyProgressSummary } from './progress.service.js';

// ============================================================================
// 型定義
// ============================================================================

/**
 * ProgressExportService 依存関係
 */
export interface ProgressExportServiceDependencies {
  progressService: ProgressService;
}

/**
 * エクスポート用出来高データ
 */
export interface ProgressExportData {
  executionBudgetId: string;
  projectName: string;
  monthlySummaries: MonthlyProgressSummary[];
}

// ============================================================================
// PDF出力用定数
// ============================================================================

/** PDF: マージン上（mm） */
const PDF_MARGIN_TOP = 15;

/** PDF: マージン左（mm） */
const PDF_MARGIN_LEFT = 10;

/** PDF: 行の高さ（mm） */
const PDF_ROW_HEIGHT = 7;

/** PDF: フォントサイズ */
const PDF_FONT_SIZE_TITLE = 12;
const PDF_FONT_SIZE_HEADER = 8;
const PDF_FONT_SIZE_BODY = 7;

/** PDF: 列幅（mm） */
const PDF_COL_WIDTHS = {
  yearMonth: 30,
  monthlyAmount: 40,
  cumulativeAmount: 40,
  cumulativeRate: 30,
};

// ============================================================================
// サービスクラス
// ============================================================================

/**
 * 月別出来高エクスポートサービス
 *
 * 月別出来高データをExcel/PDF形式で出力する機能を提供します。
 */
export class ProgressExportService {
  private readonly progressService: ProgressService;

  constructor(deps: ProgressExportServiceDependencies) {
    this.progressService = deps.progressService;
  }

  // ============================================================================
  // Public: データ取得
  // ============================================================================

  /**
   * 実行予算IDからエクスポート用データを取得する
   *
   * ProgressServiceのgetMonthlyAggregationを使用して月別出来高データを取得し、
   * エクスポート用のデータ形式に変換する。
   *
   * @param executionBudgetId - 実行予算ID
   * @param projectName - プロジェクト名
   * @returns エクスポートデータ
   */
  async getExportData(executionBudgetId: string, projectName: string): Promise<ProgressExportData> {
    const monthlySummaries = await this.progressService.getMonthlyAggregation(executionBudgetId);

    return {
      executionBudgetId,
      projectName,
      monthlySummaries,
    };
  }

  // ============================================================================
  // Public: Excel出力
  // ============================================================================

  /**
   * 月別出来高データをExcel形式で出力する
   *
   * Requirements:
   * - REQ-16.4: 月別出来高データをExcelファイル（.xlsx形式）で出力
   *
   * @param data - エクスポートデータ
   * @returns Excel バッファ
   */
  async exportToExcel(data: ProgressExportData): Promise<Buffer> {
    // シートデータの構築
    const sheetData = this.buildExcelSheetData(data);

    // ワークブック作成
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.aoa_to_sheet(sheetData);

    // 列幅の設定
    this.setExcelColumnWidths(worksheet);

    // シートをワークブックに追加
    XLSX.utils.book_append_sheet(workbook, worksheet, '月別出来高');

    // バッファとして出力
    const buffer = XLSX.write(workbook, {
      type: 'buffer',
      bookType: 'xlsx',
    });
    return buffer;
  }

  // ============================================================================
  // Public: PDF出力
  // ============================================================================

  /**
   * 月別出来高データをPDF形式で出力する
   *
   * Requirements:
   * - REQ-16.5: 月別出来高データをPDFファイルで出力
   *
   * @param data - エクスポートデータ
   * @returns PDF バッファ
   */
  async exportToPdf(data: ProgressExportData): Promise<Buffer> {
    // jsPDFインスタンスを作成（A4横向き）
    const doc = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: 'a4',
    });

    // ヘッダー描画
    let yPos = this.drawPdfHeader(doc, data);

    // テーブルヘッダー描画
    yPos = this.drawPdfTableHeader(doc, yPos);

    // 各月のデータ行を描画
    this.drawPdfDataRows(doc, data.monthlySummaries, yPos);

    // ArrayBufferからBufferへ変換
    const arrayBuffer = doc.output('arraybuffer');
    return Buffer.from(arrayBuffer);
  }

  // ============================================================================
  // Private: Excel シートデータ構築
  // ============================================================================

  /**
   * Excelシートデータ（2D配列）を構築する
   */
  private buildExcelSheetData(data: ProgressExportData): (string | number | null)[][] {
    const rows: (string | number | null)[][] = [];

    // ヘッダー情報行
    rows.push(['プロジェクト名', data.projectName]);
    rows.push([]); // 空行

    // テーブルヘッダー行
    rows.push(['対象月', '当月出来高金額', '累計出来高金額', '累計出来高率']);

    // データ行
    for (const summary of data.monthlySummaries) {
      rows.push([
        summary.yearMonth,
        summary.monthlyAmount,
        summary.cumulativeAmount,
        `${summary.cumulativeRate}%`,
      ]);
    }

    return rows;
  }

  /**
   * Excel列幅を設定する
   */
  private setExcelColumnWidths(worksheet: XLSX.WorkSheet): void {
    worksheet['!cols'] = [
      { wch: 12 }, // 対象月
      { wch: 18 }, // 当月出来高金額
      { wch: 18 }, // 累計出来高金額
      { wch: 15 }, // 累計出来高率
    ];
  }

  // ============================================================================
  // Private: PDF描画メソッド
  // ============================================================================

  /**
   * PDFヘッダーを描画する（タイトル・プロジェクト名）
   *
   * @returns 次の描画Y座標
   */
  private drawPdfHeader(doc: jsPDF, data: ProgressExportData): number {
    let yPos = PDF_MARGIN_TOP;

    doc.setFontSize(PDF_FONT_SIZE_TITLE);
    doc.text('月別出来高', PDF_MARGIN_LEFT, yPos);
    yPos += PDF_ROW_HEIGHT + 2;

    doc.setFontSize(PDF_FONT_SIZE_HEADER);
    doc.text(`プロジェクト名: ${data.projectName}`, PDF_MARGIN_LEFT, yPos);
    yPos += PDF_ROW_HEIGHT;

    yPos += 3; // ヘッダーとテーブルの間隔

    return yPos;
  }

  /**
   * PDFテーブルヘッダーを描画する
   *
   * @returns 次の描画Y座標
   */
  private drawPdfTableHeader(doc: jsPDF, yPos: number): number {
    doc.setFontSize(PDF_FONT_SIZE_HEADER);

    let xPos = PDF_MARGIN_LEFT;
    const headers = ['対象月', '当月出来高金額', '累計出来高金額', '累計出来高率'];
    const widths = [
      PDF_COL_WIDTHS.yearMonth,
      PDF_COL_WIDTHS.monthlyAmount,
      PDF_COL_WIDTHS.cumulativeAmount,
      PDF_COL_WIDTHS.cumulativeRate,
    ];

    // ヘッダー背景色
    const totalWidth = widths.reduce((sum, w) => sum + w, 0);
    doc.setFillColor(230, 230, 230);
    doc.rect(xPos, yPos - PDF_ROW_HEIGHT + 2, totalWidth, PDF_ROW_HEIGHT, 'F');

    for (let i = 0; i < headers.length; i++) {
      doc.text(headers[i]!, xPos + 1, yPos);
      xPos += widths[i]!;
    }

    return yPos + PDF_ROW_HEIGHT;
  }

  /**
   * PDFデータ行を描画する
   */
  private drawPdfDataRows(doc: jsPDF, summaries: MonthlyProgressSummary[], startY: number): void {
    doc.setFontSize(PDF_FONT_SIZE_BODY);
    let yPos = startY;

    for (const summary of summaries) {
      let xPos = PDF_MARGIN_LEFT;

      doc.text(summary.yearMonth, xPos + 1, yPos);
      xPos += PDF_COL_WIDTHS.yearMonth;

      doc.text(summary.monthlyAmount, xPos + 1, yPos);
      xPos += PDF_COL_WIDTHS.monthlyAmount;

      doc.text(summary.cumulativeAmount, xPos + 1, yPos);
      xPos += PDF_COL_WIDTHS.cumulativeAmount;

      doc.text(`${summary.cumulativeRate}%`, xPos + 1, yPos);

      yPos += PDF_ROW_HEIGHT;
    }
  }
}
