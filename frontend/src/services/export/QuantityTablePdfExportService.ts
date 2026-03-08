/**
 * @fileoverview 数量表PDF出力サービス
 *
 * Task 40.1-40.4: QuantityTablePdfExportServiceを実装する
 *
 * Requirements:
 * - 26.1: PDF出力操作でPDFファイル生成・ダウンロード
 * - 26.2: PDF表紙の表示
 * - 26.3: 数量グループごとのセクション表示（並び順）
 * - 26.4: 数量グループセクションの内容表示
 * - 26.5: 写真紐づけあり時の写真・コメント配置
 * - 26.6: 写真紐づけなし時の写真・コメント省略
 * - 26.7: 数量項目テーブル形式出力
 * - 26.8: 改ページ時のテーブルヘッダー繰り返し表示
 * - 26.11: PDFファイル名を「{数量表名}.pdf」とする
 * - 26.12: PDFページ番号表示（表紙除く）
 */

import { jsPDF } from 'jspdf';
import { initializePdfFonts, PDF_FONT_FAMILY } from './PdfFontService';

// ============================================================================
// 型定義
// ============================================================================

/**
 * 数量項目のPDF出力用データ
 */
export interface QuantityTablePdfItem {
  majorCategory: string;
  middleCategory: string;
  minorCategory: string;
  customCategory: string;
  workType: string;
  name: string;
  specification: string;
  calculationMethod: string;
  quantity: string;
  unit: string;
  remarks: string;
}

/**
 * 数量グループのPDF出力用データ
 */
export interface QuantityTablePdfGroup {
  name: string;
  displayOrder: number;
  photoDataUrl: string | null;
  photoComment: string | null;
  items: QuantityTablePdfItem[];
}

/**
 * 数量表PDF出力の入力データ
 */
export interface QuantityTablePdfInput {
  quantityTableName: string;
  projectName: string;
  createdDate: string;
  groups: QuantityTablePdfGroup[];
}

/**
 * PDF進捗コールバック
 */
export type PdfProgressCallback = (phase: string, message: string) => void;

// ============================================================================
// 定数
// ============================================================================

const LAYOUT = {
  PAGE_MARGIN: 15,
  TITLE_FONT_SIZE: 24,
  SUBTITLE_FONT_SIZE: 14,
  HEADER_FONT_SIZE: 10,
  BODY_FONT_SIZE: 8,
  SMALL_FONT_SIZE: 7,
  PAGE_NUMBER_FONT_SIZE: 8,
  TABLE_HEADER_HEIGHT: 8,
  TABLE_ROW_HEIGHT: 7,
  GROUP_NAME_FONT_SIZE: 12,
  PHOTO_WIDTH: 100,
  PHOTO_HEIGHT: 75,
  COMMENT_LEFT_MARGIN: 10,
} as const;

/**
 * テーブルヘッダーの列定義
 */
const TABLE_COLUMNS = [
  { label: '大項目', width: 22, align: 'left' as const },
  { label: '中項目', width: 22, align: 'left' as const },
  { label: '小項目', width: 22, align: 'left' as const },
  { label: '任意分類', width: 22, align: 'left' as const },
  { label: '工種', width: 22, align: 'left' as const },
  { label: '名称', width: 40, align: 'left' as const },
  { label: '規格', width: 30, align: 'left' as const },
  { label: '計算方法', width: 20, align: 'left' as const },
  { label: '数量', width: 22, align: 'right' as const },
  { label: '単位', width: 15, align: 'left' as const },
  { label: '備考', width: 30, align: 'left' as const },
] as const;

// ============================================================================
// サービスクラス
// ============================================================================

/**
 * 数量表PDF出力サービス
 *
 * jsPDFを使用してA4横向きのPDFを生成する。
 * 表紙、グループセクション（写真・コメント・項目テーブル）、ページ番号を含む。
 */
export class QuantityTablePdfExportService {
  /**
   * PDFを生成する
   *
   * @param input PDF出力用入力データ
   * @param onProgress 進捗コールバック
   * @returns PDF Blob
   */
  async generatePdf(input: QuantityTablePdfInput, onProgress?: PdfProgressCallback): Promise<Blob> {
    onProgress?.('initializing', 'PDF生成を初期化中...');

    // A4横向きでPDFを作成
    const doc = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: 'a4',
    });

    // 日本語フォントを初期化
    try {
      initializePdfFonts(doc);
      doc.setFont(PDF_FONT_FAMILY);
    } catch {
      doc.setFont('helvetica');
    }

    onProgress?.('generating', 'PDF報告書を生成中...');

    // 表紙を描画
    this.renderCoverPage(doc, input);

    // グループをdisplayOrder順にソート
    const sortedGroups = [...input.groups].sort((a, b) => a.displayOrder - b.displayOrder);

    // 各グループのセクションを描画
    for (let i = 0; i < sortedGroups.length; i++) {
      const group = sortedGroups[i]!;
      doc.addPage();
      this.renderGroupSection(doc, group);
      onProgress?.('generating', `グループを処理中... (${i + 1}/${sortedGroups.length})`);
    }

    onProgress?.('finalizing', 'PDFを最終処理中...');

    // ページ番号を追記（表紙を除く）
    this.renderPageNumbers(doc);

    onProgress?.('complete', 'PDF生成完了');

    return doc.output('blob');
  }

  /**
   * ファイル名を取得する
   *
   * @param quantityTableName 数量表名
   * @returns ファイル名
   */
  getFilename(quantityTableName: string): string {
    return `${quantityTableName}.pdf`;
  }

  /**
   * 表紙を描画する（REQ-26.2）
   *
   * PdfReportServiceの表紙レイアウトを参考にしたデザイン。
   */
  private renderCoverPage(doc: jsPDF, input: QuantityTablePdfInput): void {
    const pageWidth = doc.internal.pageSize.getWidth();
    const centerX = pageWidth / 2;

    // タイトル：「数量表」
    doc.setFontSize(LAYOUT.TITLE_FONT_SIZE);
    doc.setTextColor(30, 30, 30);
    doc.text('数量表', centerX, 50, { align: 'center' });

    // 数量表名
    doc.setFontSize(LAYOUT.SUBTITLE_FONT_SIZE);
    doc.text(input.quantityTableName, centerX, 75, { align: 'center' });

    // 装飾線
    doc.setDrawColor(80, 80, 80);
    doc.setLineWidth(0.5);
    doc.line(LAYOUT.PAGE_MARGIN + 30, 90, pageWidth - LAYOUT.PAGE_MARGIN - 30, 90);

    // 工事名（プロジェクト名）
    doc.setFontSize(LAYOUT.SUBTITLE_FONT_SIZE);
    doc.text(input.projectName, centerX, 110, { align: 'center' });

    // 作成日（ページ下部中央）
    doc.setFontSize(LAYOUT.HEADER_FONT_SIZE);
    doc.setTextColor(80, 80, 80);
    const pageHeight = doc.internal.pageSize.getHeight();
    doc.text(input.createdDate, centerX, pageHeight - 30, { align: 'center' });
  }

  /**
   * グループセクションを描画する（REQ-26.3, 26.4, 26.5, 26.6）
   */
  private renderGroupSection(doc: jsPDF, group: QuantityTablePdfGroup): void {
    const pageWidth = doc.internal.pageSize.getWidth();
    let currentY: number = LAYOUT.PAGE_MARGIN;

    // グループ名
    doc.setFontSize(LAYOUT.GROUP_NAME_FONT_SIZE);
    doc.setTextColor(30, 30, 30);
    doc.text(group.name, LAYOUT.PAGE_MARGIN, currentY + 5);
    currentY += 12;

    // 写真・コメント（REQ-26.5, 26.6）
    if (group.photoDataUrl) {
      try {
        doc.addImage(
          group.photoDataUrl,
          'JPEG',
          LAYOUT.PAGE_MARGIN,
          currentY,
          LAYOUT.PHOTO_WIDTH,
          LAYOUT.PHOTO_HEIGHT
        );
      } catch {
        // 画像追加失敗時はプレースホルダー
        doc.setDrawColor(200, 200, 200);
        doc.setFillColor(240, 240, 240);
        doc.rect(LAYOUT.PAGE_MARGIN, currentY, LAYOUT.PHOTO_WIDTH, LAYOUT.PHOTO_HEIGHT, 'FD');
      }

      // コメント（写真の右側に配置）
      if (group.photoComment) {
        const commentX = LAYOUT.PAGE_MARGIN + LAYOUT.PHOTO_WIDTH + LAYOUT.COMMENT_LEFT_MARGIN;
        const commentMaxWidth = pageWidth - commentX - LAYOUT.PAGE_MARGIN;
        doc.setFontSize(LAYOUT.BODY_FONT_SIZE);
        doc.setTextColor(30, 30, 30);
        const commentLines: string[] = doc.splitTextToSize(group.photoComment, commentMaxWidth);
        let commentY = currentY + 5;
        for (const line of commentLines) {
          doc.text(line, commentX, commentY);
          commentY += 4;
        }
      }

      currentY += LAYOUT.PHOTO_HEIGHT + 5;
    }

    // 項目テーブル（REQ-26.7）
    if (group.items.length > 0) {
      currentY = this.renderItemTable(doc, group.items, currentY);
    }
  }

  /**
   * 項目テーブルを描画する（REQ-26.7, 26.8）
   */
  private renderItemTable(doc: jsPDF, items: QuantityTablePdfItem[], startY: number): number {
    let currentY = startY;

    // テーブルヘッダーを描画
    currentY = this.renderTableHeader(doc, currentY);

    // 各項目を行として描画
    for (const item of items) {
      const pageHeight = doc.internal.pageSize.getHeight();

      // ページ残り高さチェック（REQ-26.8: 改ページ時にヘッダー繰り返し）
      if (currentY + LAYOUT.TABLE_ROW_HEIGHT > pageHeight - LAYOUT.PAGE_MARGIN - 15) {
        doc.addPage();
        currentY = LAYOUT.PAGE_MARGIN;
        currentY = this.renderTableHeader(doc, currentY);
      }

      currentY = this.renderTableRow(doc, item, currentY);
    }

    return currentY;
  }

  /**
   * テーブルヘッダーを描画する
   */
  private renderTableHeader(doc: jsPDF, startY: number): number {
    let currentX = LAYOUT.PAGE_MARGIN;
    const currentY = startY;

    // ヘッダー背景
    const totalWidth = TABLE_COLUMNS.reduce((sum, col) => sum + col.width, 0);
    doc.setFillColor(243, 244, 246);
    doc.rect(LAYOUT.PAGE_MARGIN, currentY, totalWidth, LAYOUT.TABLE_HEADER_HEIGHT, 'F');

    // ヘッダーテキスト
    doc.setFontSize(LAYOUT.SMALL_FONT_SIZE);
    doc.setTextColor(55, 65, 81);

    for (const col of TABLE_COLUMNS) {
      doc.text(col.label, currentX + 1, currentY + 5.5);
      currentX += col.width;
    }

    // ヘッダー下線
    doc.setDrawColor(209, 213, 219);
    doc.setLineWidth(0.3);
    doc.line(
      LAYOUT.PAGE_MARGIN,
      currentY + LAYOUT.TABLE_HEADER_HEIGHT,
      LAYOUT.PAGE_MARGIN + totalWidth,
      currentY + LAYOUT.TABLE_HEADER_HEIGHT
    );

    return currentY + LAYOUT.TABLE_HEADER_HEIGHT;
  }

  /**
   * テーブル行を描画する
   */
  private renderTableRow(doc: jsPDF, item: QuantityTablePdfItem, startY: number): number {
    let currentX = LAYOUT.PAGE_MARGIN;
    const currentY = startY;

    doc.setFontSize(LAYOUT.SMALL_FONT_SIZE);
    doc.setTextColor(31, 41, 55);

    const values = [
      item.majorCategory,
      item.middleCategory,
      item.minorCategory,
      item.customCategory,
      item.workType,
      item.name,
      item.specification,
      item.calculationMethod,
      item.quantity,
      item.unit,
      item.remarks,
    ];

    for (let i = 0; i < TABLE_COLUMNS.length; i++) {
      const col = TABLE_COLUMNS[i]!;
      const value = values[i] ?? '';

      if (col.align === 'right') {
        const textWidth = doc.getTextWidth(value);
        doc.text(value, currentX + col.width - textWidth - 1, currentY + 5);
      } else {
        doc.text(value, currentX + 1, currentY + 5);
      }

      currentX += col.width;
    }

    // 行下線
    const totalWidth = TABLE_COLUMNS.reduce((sum, col) => sum + col.width, 0);
    doc.setDrawColor(229, 231, 235);
    doc.setLineWidth(0.1);
    doc.line(
      LAYOUT.PAGE_MARGIN,
      currentY + LAYOUT.TABLE_ROW_HEIGHT,
      LAYOUT.PAGE_MARGIN + totalWidth,
      currentY + LAYOUT.TABLE_ROW_HEIGHT
    );

    return currentY + LAYOUT.TABLE_ROW_HEIGHT;
  }

  /**
   * ページ番号を描画する（REQ-26.12: 表紙を除く全ページ）
   */
  private renderPageNumbers(doc: jsPDF): void {
    const totalPages = doc.getNumberOfPages();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();

    // 表紙（1ページ目）を除くページにページ番号を付与
    const contentPages = totalPages - 1;
    for (let i = 2; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setFontSize(LAYOUT.PAGE_NUMBER_FONT_SIZE);
      doc.setTextColor(120, 120, 120);
      const pageNumberText = `${i - 1} / ${contentPages}`;
      doc.text(pageNumberText, pageWidth / 2, pageHeight - 8, { align: 'center' });
    }
  }
}

// ============================================================================
// スタンドアロン関数
// ============================================================================

/**
 * 数量表PDFを生成する
 *
 * @param input PDF出力用入力データ
 * @param onProgress 進捗コールバック
 * @returns PDF Blob
 */
export async function generateQuantityTablePdf(
  input: QuantityTablePdfInput,
  onProgress?: PdfProgressCallback
): Promise<Blob> {
  const service = new QuantityTablePdfExportService();
  return service.generatePdf(input, onProgress);
}
