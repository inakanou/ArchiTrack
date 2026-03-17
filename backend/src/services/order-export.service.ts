/**
 * @fileoverview 発注一覧エクスポートサービス
 *
 * 発注のチェック済み項目一覧をExcel/PDFで出力します。
 * ヘッダー情報（発注取引先名、発注日、確定発注金額）を含み、
 * 発注済ステータスの場合は発注金額列を追加出力します。
 *
 * Task 6.1: 発注一覧エクスポートサービス実装
 *
 * Requirements (execution-budget-management):
 * - 10.1: チェック済み項目一覧をExcelファイル（.xlsx形式）で出力
 * - 10.2: チェック済み項目一覧をPDFファイルで出力
 * - 10.3: ヘッダー情報（発注取引先名、発注日、確定発注金額）を出力に含める
 * - 10.4: 発注済ステータスの場合に発注金額列を追加出力
 *
 * @module services/order-export
 */

import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import Decimal from 'decimal.js';
import type { PrismaClient } from '../generated/prisma/client.js';

// ============================================================================
// 型定義
// ============================================================================

/**
 * OrderExportService 依存関係
 */
export interface OrderExportServiceDependencies {
  prisma: PrismaClient;
}

/**
 * エクスポート用項目データ
 */
export interface OrderExportItem {
  name: string | null;
  specification: string | null;
  unit: string | null;
  quantity: string | null;
  executionUnitPrice: string | null;
  executionAmount: string | null;
  orderAmount: string | null;
}

/**
 * エクスポート用発注データ
 */
export interface OrderExportData {
  orderId: string;
  tradingPartnerName: string;
  orderDate: string;
  confirmedAmount: string | null;
  status: string;
  items: OrderExportItem[];
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
  name: 50,
  specification: 40,
  unit: 15,
  quantity: 20,
  executionUnitPrice: 25,
  executionAmount: 25,
  orderAmount: 25,
};

// ============================================================================
// サービスクラス
// ============================================================================

/**
 * 発注一覧エクスポートサービス
 *
 * 発注のチェック済み項目一覧をExcel/PDF形式で出力する機能を提供します。
 */
export class OrderExportService {
  private readonly prisma: PrismaClient;

  constructor(deps: OrderExportServiceDependencies) {
    this.prisma = deps.prisma;
  }

  // ============================================================================
  // Public: データ取得
  // ============================================================================

  /**
   * 発注IDからエクスポート用データを取得する
   *
   * チェック済み項目のみを含むデータを返却する。
   *
   * @param orderId - 発注ID
   * @returns エクスポートデータ、見つからない場合はnull
   */
  async getExportData(orderId: string): Promise<OrderExportData | null> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        tradingPartner: {
          select: { name: true },
        },
        items: {
          include: {
            executionBudgetItem: {
              select: {
                name: true,
                specification: true,
                unit: true,
                quantity: true,
                executionUnitPrice: true,
                executionAmount: true,
              },
            },
          },
        },
      },
    });

    if (!order || order.deletedAt !== null) {
      return null;
    }

    // チェック済み項目のみフィルタ
    const checkedItems = order.items.filter((item: { checked: boolean }) => item.checked);

    const items: OrderExportItem[] = checkedItems.map(
      (item: {
        orderAmount: { toString(): string } | null;
        executionBudgetItem: {
          name: string | null;
          specification: string | null;
          unit: string | null;
          quantity: { toString(): string } | null;
          executionUnitPrice: { toString(): string } | null;
          executionAmount: { toString(): string } | null;
        };
      }) => ({
        name: item.executionBudgetItem.name,
        specification: item.executionBudgetItem.specification,
        unit: item.executionBudgetItem.unit,
        quantity: item.executionBudgetItem.quantity?.toString() ?? null,
        executionUnitPrice: item.executionBudgetItem.executionUnitPrice?.toString() ?? null,
        executionAmount: item.executionBudgetItem.executionAmount?.toString() ?? null,
        orderAmount: item.orderAmount?.toString() ?? null,
      })
    );

    // 発注日は作成日を使用
    const orderDate = order.createdAt.toISOString().split('T')[0]!;

    return {
      orderId: order.id,
      tradingPartnerName: (order as unknown as { tradingPartner: { name: string } }).tradingPartner
        .name,
      orderDate,
      confirmedAmount: order.confirmedAmount?.toString() ?? null,
      status: order.status as string,
      items,
    };
  }

  // ============================================================================
  // Public: Excel出力
  // ============================================================================

  /**
   * 発注データをExcel形式で出力する
   *
   * Requirements:
   * - REQ-10.1: チェック済み項目一覧をExcelファイル（.xlsx形式）で出力
   * - REQ-10.3: ヘッダー情報を出力に含める
   * - REQ-10.4: 発注済ステータスの場合に発注金額列を追加出力
   *
   * @param data - エクスポートデータ
   * @returns Excel バッファ
   */
  async exportToExcel(data: OrderExportData): Promise<Buffer> {
    const isOrdered = data.status === 'ORDERED';

    // シートデータの構築
    const sheetData = this.buildExcelSheetData(data, isOrdered);

    // ワークブック作成
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.aoa_to_sheet(sheetData);

    // 列幅の設定
    this.setExcelColumnWidths(worksheet, isOrdered);

    // シートをワークブックに追加
    XLSX.utils.book_append_sheet(workbook, worksheet, '発注一覧');

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
   * 発注データをPDF形式で出力する
   *
   * Requirements:
   * - REQ-10.2: チェック済み項目一覧をPDFファイルで出力
   * - REQ-10.3: ヘッダー情報を出力に含める
   * - REQ-10.4: 発注済ステータスの場合に発注金額列を追加出力
   *
   * @param data - エクスポートデータ
   * @returns PDF バッファ
   */
  async exportToPdf(data: OrderExportData): Promise<Buffer> {
    const isOrdered = data.status === 'ORDERED';

    // jsPDFインスタンスを作成（A4横向き）
    const doc = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: 'a4',
    });

    // ヘッダー描画
    let yPos = this.drawPdfHeader(doc, data);

    // テーブルヘッダー描画
    yPos = this.drawPdfTableHeader(doc, yPos, isOrdered);

    // 各項目行を描画
    yPos = this.drawPdfItemRows(doc, data.items, yPos, isOrdered);

    // 合計行を描画
    this.drawPdfTotalRow(doc, data.items, yPos, isOrdered);

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
  private buildExcelSheetData(
    data: OrderExportData,
    isOrdered: boolean
  ): (string | number | null)[][] {
    const rows: (string | number | null)[][] = [];

    // ヘッダー情報行
    rows.push(['発注取引先名', data.tradingPartnerName]);
    rows.push(['発注日', data.orderDate]);
    rows.push([
      '確定発注金額',
      data.confirmedAmount ? this.formatAmount(data.confirmedAmount) : '',
    ]);
    rows.push([]); // 空行

    // テーブルヘッダー行
    const headerRow: (string | number | null)[] = [
      '項目名',
      '規格',
      '単位',
      '数量',
      '実行単価',
      '実行金額',
    ];
    if (isOrdered) {
      headerRow.push('発注金額');
    }
    rows.push(headerRow);

    // データ行
    for (const item of data.items) {
      const row: (string | number | null)[] = [
        item.name ?? '',
        item.specification ?? '',
        item.unit ?? '',
        item.quantity ?? '',
        item.executionUnitPrice ?? '',
        item.executionAmount ?? '',
      ];
      if (isOrdered) {
        row.push(item.orderAmount ?? '');
      }
      rows.push(row);
    }

    // 合計行
    const totalExecutionAmount = this.calculateTotalExecutionAmount(data.items);
    const totalRow: (string | number | null)[] = ['合計', '', '', '', '', totalExecutionAmount];
    if (isOrdered) {
      const totalOrderAmount = this.calculateTotalOrderAmount(data.items);
      totalRow.push(totalOrderAmount);
    }
    rows.push(totalRow);

    return rows;
  }

  /**
   * Excel列幅を設定する
   */
  private setExcelColumnWidths(worksheet: XLSX.WorkSheet, isOrdered: boolean): void {
    const cols: XLSX.ColInfo[] = [
      { wch: 25 }, // 項目名
      { wch: 20 }, // 規格
      { wch: 8 }, // 単位
      { wch: 12 }, // 数量
      { wch: 15 }, // 実行単価
      { wch: 15 }, // 実行金額
    ];

    if (isOrdered) {
      cols.push({ wch: 15 }); // 発注金額
    }

    worksheet['!cols'] = cols;
  }

  // ============================================================================
  // Private: PDF描画メソッド
  // ============================================================================

  /**
   * PDFヘッダーを描画する（発注取引先名・発注日・確定発注金額）
   *
   * @returns 次の描画Y座標
   */
  private drawPdfHeader(doc: jsPDF, data: OrderExportData): number {
    let yPos = PDF_MARGIN_TOP;

    doc.setFontSize(PDF_FONT_SIZE_TITLE);
    doc.text('発注一覧', PDF_MARGIN_LEFT, yPos);
    yPos += PDF_ROW_HEIGHT + 2;

    doc.setFontSize(PDF_FONT_SIZE_HEADER);
    doc.text(`発注取引先名: ${data.tradingPartnerName}`, PDF_MARGIN_LEFT, yPos);
    yPos += PDF_ROW_HEIGHT;

    doc.text(`発注日: ${data.orderDate}`, PDF_MARGIN_LEFT, yPos);
    yPos += PDF_ROW_HEIGHT;

    if (data.confirmedAmount) {
      doc.text(`確定発注金額: ${this.formatAmount(data.confirmedAmount)}`, PDF_MARGIN_LEFT, yPos);
      yPos += PDF_ROW_HEIGHT;
    }

    yPos += 3; // ヘッダーとテーブルの間隔

    return yPos;
  }

  /**
   * PDFテーブルヘッダーを描画する
   *
   * @returns 次の描画Y座標
   */
  private drawPdfTableHeader(doc: jsPDF, yPos: number, isOrdered: boolean): number {
    doc.setFontSize(PDF_FONT_SIZE_HEADER);

    let xPos = PDF_MARGIN_LEFT;
    const headers = ['項目名', '規格', '単位', '数量', '実行単価', '実行金額'];
    const widths = [
      PDF_COL_WIDTHS.name,
      PDF_COL_WIDTHS.specification,
      PDF_COL_WIDTHS.unit,
      PDF_COL_WIDTHS.quantity,
      PDF_COL_WIDTHS.executionUnitPrice,
      PDF_COL_WIDTHS.executionAmount,
    ];

    if (isOrdered) {
      headers.push('発注金額');
      widths.push(PDF_COL_WIDTHS.orderAmount);
    }

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
   * PDF項目行を描画する
   *
   * @returns 次の描画Y座標
   */
  private drawPdfItemRows(
    doc: jsPDF,
    items: OrderExportItem[],
    startY: number,
    isOrdered: boolean
  ): number {
    doc.setFontSize(PDF_FONT_SIZE_BODY);
    let yPos = startY;

    for (const item of items) {
      let xPos = PDF_MARGIN_LEFT;

      doc.text(item.name ?? '', xPos + 1, yPos);
      xPos += PDF_COL_WIDTHS.name;

      doc.text(item.specification ?? '', xPos + 1, yPos);
      xPos += PDF_COL_WIDTHS.specification;

      doc.text(item.unit ?? '', xPos + 1, yPos);
      xPos += PDF_COL_WIDTHS.unit;

      doc.text(item.quantity ?? '', xPos + 1, yPos);
      xPos += PDF_COL_WIDTHS.quantity;

      doc.text(item.executionUnitPrice ?? '', xPos + 1, yPos);
      xPos += PDF_COL_WIDTHS.executionUnitPrice;

      doc.text(item.executionAmount ?? '', xPos + 1, yPos);
      xPos += PDF_COL_WIDTHS.executionAmount;

      if (isOrdered) {
        doc.text(item.orderAmount ?? '', xPos + 1, yPos);
      }

      yPos += PDF_ROW_HEIGHT;
    }

    return yPos;
  }

  /**
   * PDF合計行を描画する
   */
  private drawPdfTotalRow(
    doc: jsPDF,
    items: OrderExportItem[],
    yPos: number,
    isOrdered: boolean
  ): void {
    doc.setFontSize(PDF_FONT_SIZE_HEADER);

    let xPos = PDF_MARGIN_LEFT;

    // 合計ラベル
    doc.text('合計', xPos + 1, yPos);

    // 実行金額合計の位置へ移動
    xPos +=
      PDF_COL_WIDTHS.name +
      PDF_COL_WIDTHS.specification +
      PDF_COL_WIDTHS.unit +
      PDF_COL_WIDTHS.quantity +
      PDF_COL_WIDTHS.executionUnitPrice;

    const totalExecution = this.calculateTotalExecutionAmount(items);
    doc.text(totalExecution, xPos + 1, yPos);
    xPos += PDF_COL_WIDTHS.executionAmount;

    if (isOrdered) {
      const totalOrder = this.calculateTotalOrderAmount(items);
      doc.text(totalOrder, xPos + 1, yPos);
    }
  }

  // ============================================================================
  // Private: 計算ユーティリティ
  // ============================================================================

  /**
   * チェック済み項目の合計実行金額を計算する
   */
  private calculateTotalExecutionAmount(items: OrderExportItem[]): string {
    let total = new Decimal(0);
    for (const item of items) {
      if (item.executionAmount) {
        total = total.add(new Decimal(item.executionAmount));
      }
    }
    return total.toFixed(0);
  }

  /**
   * チェック済み項目の合計発注金額を計算する
   */
  private calculateTotalOrderAmount(items: OrderExportItem[]): string {
    let total = new Decimal(0);
    for (const item of items) {
      if (item.orderAmount) {
        total = total.add(new Decimal(item.orderAmount));
      }
    }
    return total.toFixed(0);
  }

  /**
   * 金額を3桁区切りカンマ付きでフォーマットする
   */
  private formatAmount(amount: string): string {
    const num = parseInt(amount, 10);
    if (isNaN(num)) return amount;
    return num.toLocaleString('ja-JP');
  }
}
