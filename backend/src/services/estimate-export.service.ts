/**
 * @fileoverview 見積書出力サービス
 *
 * 見積書のPDF/Excel出力を担当します。
 * 建設工事見積書形式でファイルを生成し、バイナリデータを返します。
 *
 * Requirements (estimate-creation):
 * - REQ-10.1: PDF出力を選択した場合、建設工事見積書形式のPDFファイルを生成する
 * - REQ-10.2: Excel出力を選択した場合、建設工事見積書形式のExcelファイル（.xlsx）を生成する
 * - REQ-10.3: 出力の1ページ目に表紙を含める
 * - REQ-10.4: 出力の2ページ目に見積項目の第1階層の項目一覧を含める
 * - REQ-10.5: 各第1階層項目の子項目一覧を後続ページに順次出力する
 * - REQ-10.6: ネスト階層ごとに別ページとして出力する
 * - REQ-10.7: 見積金額行のみを出力対象とする（実行金額行・業者金額行は出力しない）
 * - REQ-10.8: 出力処理中であることを表示する
 *
 * Task 6.1: EstimateExportServiceの実装（PDF出力）
 * Task 6.2: Excel出力機能の実装
 *
 * @module services/estimate-export
 */

import { jsPDF } from 'jspdf';
import * as XLSX from 'xlsx';

// ============================================================================
// 型定義
// ============================================================================

/**
 * 出力形式
 */
export const ExportFormat = {
  PDF: 'pdf',
  XLSX: 'xlsx',
} as const;

export type ExportFormat = (typeof ExportFormat)[keyof typeof ExportFormat];

/**
 * 見積項目行データ（出力用）
 */
export interface EstimateExportLine {
  id: string;
  lineType: 'ESTIMATE' | 'EXECUTION' | 'VENDOR';
  name: string | null;
  specification: string | null;
  unit: string | null;
  quantity: number | null;
  unitPrice: number | null;
  amount: number | null;
  remarks: string | null;
}

/**
 * 見積項目データ（出力用）
 */
export interface EstimateExportItem {
  id: string;
  parentId: string | null;
  displayOrder: number;
  lines: EstimateExportLine[];
  children: EstimateExportItem[];
}

/**
 * 見積書データ（出力用）
 */
export interface EstimateExportData {
  id: string;
  name: string;
  projectName: string;
  createdAt: Date;
  items: EstimateExportItem[];
  totalAmount: number | null;
}

// ============================================================================
// 定数定義
// ============================================================================

/** A4サイズ（mm） */
// const A4_WIDTH = 210; // Reserved for future use
const A4_HEIGHT = 297;

/** マージン（mm） */
const MARGIN_TOP = 20;
const MARGIN_BOTTOM = 20;
const MARGIN_LEFT = 15;
// const MARGIN_RIGHT = 15; // Reserved for future use

/** フォントサイズ（pt） */
const FONT_SIZE_TITLE = 18;
const FONT_SIZE_SUBTITLE = 14;
const FONT_SIZE_HEADER = 12;
const FONT_SIZE_BODY = 10;
const FONT_SIZE_SMALL = 8;

/** 列幅設定（mm） */
const COL_WIDTH_NAME = 60;
const COL_WIDTH_SPEC = 40;
const COL_WIDTH_UNIT = 15;
const COL_WIDTH_QTY = 20;
const COL_WIDTH_PRICE = 25;
// const COL_WIDTH_AMOUNT = 25; // Reserved for future use

/** ファイル名に使用できない文字の正規表現 */
const INVALID_FILENAME_CHARS = /[/\\:*?"<>|]/g;

/** 行タイプのラベルマップ */
const LINE_TYPE_LABELS: Record<string, string> = {
  ESTIMATE: '見積',
  EXECUTION: '実行',
  VENDOR: '業者',
};

/** 列名定義（プレフィックスなし） */
const BASE_COLUMN_NAMES = ['名称', '規格', '単位', '数量', '単価', '金額', '備考'] as const;

// ============================================================================
// サービスクラス
// ============================================================================

/**
 * 見積書出力サービス
 *
 * 見積書のPDF/Excel出力機能を提供します。
 */
export class EstimateExportService {
  /**
   * 指定した形式で見積書を出力する
   *
   * @param estimate - 見積書データ
   * @param format - 出力形式
   * @returns 出力バッファ
   * @throws Error 見積書データがnullの場合
   * @throws Error サポートされていない形式の場合
   */
  async export(estimate: EstimateExportData, format: ExportFormat): Promise<Buffer> {
    switch (format) {
      case ExportFormat.PDF:
        return this.exportToPdf(estimate);
      case ExportFormat.XLSX:
        return this.exportToExcel(estimate);
      default:
        throw new Error('サポートされていない出力形式です');
    }
  }

  /**
   * PDFファイルを生成する
   *
   * Requirements:
   * - REQ-10.1: PDF出力
   * - REQ-10.3: 表紙を1ページ目に含める
   * - REQ-10.4: 第1階層項目一覧を2ページ目に含める
   * - REQ-10.5, REQ-10.6: 階層別ページ出力
   * - REQ-10.7: 見積金額行のみ出力
   *
   * @param estimate - 見積書データ
   * @returns PDF バッファ
   * @throws Error 見積書データがnullの場合
   * @throws Error 見積書名が空の場合
   */
  async exportToPdf(estimate: EstimateExportData): Promise<Buffer> {
    this.validateEstimateData(estimate);

    // 見積金額行のみをフィルタリング
    const filteredItems = this.filterEstimateLines(estimate.items);

    // jsPDFインスタンスを作成
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    });

    // 1ページ目: 表紙
    this.generateCoverPage(doc, estimate);

    // 2ページ目: 第1階層項目一覧
    doc.addPage();
    this.generateSummaryPage(doc, estimate, filteredItems);

    // 3ページ目以降: 各階層の詳細
    this.generateDetailPages(doc, filteredItems, 0);

    // ArrayBufferからBufferへ変換
    const arrayBuffer = doc.output('arraybuffer');
    return Buffer.from(arrayBuffer);
  }

  /**
   * Excelファイルを生成する
   *
   * Requirements:
   * - REQ-10.2: Excel出力
   * - REQ-10.3: 表紙シート
   * - REQ-10.4: 第1階層項目シート
   * - REQ-10.5, REQ-10.6: 階層別シート出力
   * - REQ-10.7: 見積金額行のみ出力
   *
   * @param estimate - 見積書データ
   * @returns Excel バッファ
   * @throws Error 見積書データがnullの場合
   */
  async exportToExcel(estimate: EstimateExportData): Promise<Buffer> {
    this.validateEstimateData(estimate);

    // 見積金額行のみをフィルタリング
    const filteredItems = this.filterEstimateLines(estimate.items);

    // ワークブックを作成
    const workbook = XLSX.utils.book_new();

    // 表紙シート
    const coverSheet = this.createCoverSheet(estimate);
    XLSX.utils.book_append_sheet(workbook, coverSheet, '表紙');

    // サマリーシート（第1階層一覧）
    const summarySheet = this.createSummarySheet(filteredItems);
    XLSX.utils.book_append_sheet(workbook, summarySheet, '項目一覧');

    // 各第1階層項目の詳細シート
    this.createDetailSheets(workbook, filteredItems);

    // バッファとして出力
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    return buffer;
  }

  /**
   * ファイル名を生成する
   *
   * @param estimate - 見積書データ
   * @param format - 出力形式
   * @returns ファイル名
   */
  generateFileName(estimate: EstimateExportData, format: ExportFormat): string {
    const safeName = this.sanitizeFileName(estimate.name);
    const dateStr = this.formatDateForFileName(new Date());
    const extension = format === ExportFormat.PDF ? 'pdf' : 'xlsx';
    return `${safeName}_${dateStr}.${extension}`;
  }

  /**
   * 見積金額行（ESTIMATE）のみをフィルタリングする
   *
   * Requirement REQ-10.7
   *
   * @param items - 見積項目
   * @returns フィルタリングされた見積項目
   */
  filterEstimateLines(items: EstimateExportItem[]): EstimateExportItem[] {
    return items.map((item) => ({
      ...item,
      lines: item.lines.filter((line) => line.lineType === 'ESTIMATE'),
      children: this.filterEstimateLines(item.children),
    }));
  }

  /**
   * 全項目の見積金額行の合計を計算する
   *
   * @param items - 見積項目
   * @returns 合計金額
   */
  calculateTotalAmount(items: EstimateExportItem[]): number {
    let total = 0;

    for (const item of items) {
      // ESTIMATE行のみを対象
      for (const line of item.lines) {
        if (line.lineType === 'ESTIMATE' && line.amount !== null) {
          total += line.amount;
        }
      }
      // 子項目も再帰的に計算
      total += this.calculateTotalAmount(item.children);
    }

    return total;
  }

  // ============================================================================
  // 複数行タイプ対応メソッド (Task 42.2)
  // ============================================================================

  /**
   * 複数行タイプでフィルタリングする
   *
   * Requirements: REQ-32.2
   *
   * @param items - 見積項目
   * @param lineTypes - フィルタ対象の行タイプ配列
   * @returns フィルタリングされた見積項目
   */
  filterLinesByTypes(
    items: EstimateExportItem[],
    lineTypes: Array<'ESTIMATE' | 'EXECUTION' | 'VENDOR'>
  ): EstimateExportItem[] {
    return items.map((item) => ({
      ...item,
      lines: item.lines.filter((line) => lineTypes.includes(line.lineType)),
      children: this.filterLinesByTypes(item.children, lineTypes),
    }));
  }

  /**
   * 複数行タイプ用のプレフィックス付き列名を生成する
   *
   * Requirements: REQ-32.7
   *
   * @param lineTypes - 行タイプ配列
   * @returns プレフィックス付き列名の配列
   */
  getHeadersForLineTypes(lineTypes: Array<'ESTIMATE' | 'EXECUTION' | 'VENDOR'>): string[] {
    const headers: string[] = [];
    for (const lineType of lineTypes) {
      const prefix = LINE_TYPE_LABELS[lineType] ?? lineType;
      for (const colName of BASE_COLUMN_NAMES) {
        headers.push(`${prefix}${colName}`);
      }
    }
    return headers;
  }

  /**
   * 複数行タイプ対応のファイル名を生成する
   *
   * Requirements: REQ-32.3
   *
   * @param estimate - 見積書データ
   * @param format - 出力形式
   * @param lineTypes - 行タイプ配列
   * @returns ファイル名
   */
  generateFileNameWithLineTypes(
    estimate: EstimateExportData,
    format: ExportFormat,
    lineTypes: Array<'ESTIMATE' | 'EXECUTION' | 'VENDOR'>
  ): string {
    const safeName = this.sanitizeFileName(estimate.name);
    const dateStr = this.formatDateForFileName(new Date());
    const lineTypeLabels = lineTypes.map((lt) => LINE_TYPE_LABELS[lt] ?? lt).join('_');
    const extension = format === ExportFormat.PDF ? 'pdf' : 'xlsx';
    return `${safeName}_${dateStr}_${lineTypeLabels}.${extension}`;
  }

  /**
   * 複数行タイプ対応のExcelを生成する
   *
   * Requirements: REQ-32.2, REQ-32.7, REQ-10.9, REQ-10.10, REQ-10.11
   *
   * @param estimate - 見積書データ
   * @param lineTypes - 行タイプ配列
   * @returns Excel バッファ
   */
  async exportToExcelWithLineTypes(
    estimate: EstimateExportData,
    lineTypes: Array<'ESTIMATE' | 'EXECUTION' | 'VENDOR'>
  ): Promise<Buffer> {
    this.validateEstimateData(estimate);

    // REQ-38.2, REQ-38.3: 空欄行をフィルタリング
    const filteredEstimate = {
      ...estimate,
      items: this.filterEmptyRows(estimate.items, lineTypes),
    };

    // ワークブックを作成
    const workbook = XLSX.utils.book_new();

    // 表紙シート
    const coverSheet = this.createCoverSheet(filteredEstimate);
    XLSX.utils.book_append_sheet(workbook, coverSheet, '表紙');

    // プレフィックス付きヘッダーを生成
    const headers = this.getHeadersForLineTypes(lineTypes);

    // サマリーシート（第1階層一覧）- 複数行タイプ列
    const summarySheet = this.createMultiLineTypeSummarySheet(
      filteredEstimate.items,
      lineTypes,
      headers
    );
    XLSX.utils.book_append_sheet(workbook, summarySheet, '項目一覧');

    // 各第1階層項目の詳細シート
    this.createMultiLineTypeDetailSheets(workbook, filteredEstimate.items, lineTypes, headers);

    // バッファとして出力
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    return buffer;
  }

  /**
   * 複数行タイプ対応のPDFを生成する
   *
   * Requirements: REQ-32.2, REQ-32.7, REQ-10.9, REQ-10.12, REQ-10.13
   *
   * @param estimate - 見積書データ
   * @param lineTypes - 行タイプ配列
   * @returns PDF バッファ
   */
  async exportToPdfWithLineTypes(
    estimate: EstimateExportData,
    lineTypes: Array<'ESTIMATE' | 'EXECUTION' | 'VENDOR'>
  ): Promise<Buffer> {
    this.validateEstimateData(estimate);

    // REQ-38.2, REQ-38.3: 空欄行をフィルタリング
    const filteredItems = this.filterEmptyRows(estimate.items, lineTypes);

    // jsPDFインスタンスを作成
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    });

    // 1ページ目: 表紙
    this.generateCoverPage(doc, estimate);

    // 2ページ目: 第1階層項目一覧（複数行タイプ対応）
    doc.addPage();
    this.generateMultiLineTypeSummaryPage(doc, estimate, filteredItems, lineTypes);

    // 3ページ目以降: 各階層の詳細（複数行タイプ対応）
    this.generateMultiLineTypeDetailPages(doc, filteredItems, lineTypes, 0);

    // ArrayBufferからBufferへ変換
    const arrayBuffer = doc.output('arraybuffer');
    return Buffer.from(arrayBuffer);
  }

  // ============================================================================
  // PDF生成用プライベートメソッド
  // ============================================================================

  /**
   * 表紙ページを生成する
   */
  private generateCoverPage(doc: jsPDF, estimate: EstimateExportData): void {
    const pageWidth = doc.internal.pageSize.getWidth();

    // タイトル「御見積書」
    doc.setFontSize(FONT_SIZE_TITLE);
    const title = '御見積書';
    const titleWidth = doc.getTextWidth(title);
    doc.text(title, (pageWidth - titleWidth) / 2, 80);

    // プロジェクト名
    doc.setFontSize(FONT_SIZE_SUBTITLE);
    const projectLabel = `工事名: ${estimate.projectName}`;
    doc.text(projectLabel, MARGIN_LEFT, 110);

    // 見積書名
    doc.setFontSize(FONT_SIZE_BODY);
    const estimateLabel = `見積書名: ${estimate.name}`;
    doc.text(estimateLabel, MARGIN_LEFT, 125);

    // 作成日
    const dateLabel = `作成日: ${this.formatDate(estimate.createdAt)}`;
    doc.text(dateLabel, MARGIN_LEFT, 135);

    // 合計金額
    const totalAmount = estimate.totalAmount ?? this.calculateTotalAmount(estimate.items);
    const totalLabel = `合計金額: ${this.formatCurrency(totalAmount)}`;
    doc.setFontSize(FONT_SIZE_HEADER);
    doc.text(totalLabel, MARGIN_LEFT, 155);
  }

  /**
   * サマリーページ（第1階層一覧）を生成する
   */
  private generateSummaryPage(
    doc: jsPDF,
    _estimate: EstimateExportData,
    items: EstimateExportItem[]
  ): void {
    let yPos = MARGIN_TOP;

    // ページタイトル
    doc.setFontSize(FONT_SIZE_HEADER);
    doc.text('項目一覧', MARGIN_LEFT, yPos);
    yPos += 10;

    // テーブルヘッダー
    doc.setFontSize(FONT_SIZE_BODY);
    this.drawTableHeader(doc, yPos);
    yPos += 8;

    // 各項目を出力
    for (const item of items) {
      if (yPos > A4_HEIGHT - MARGIN_BOTTOM - 10) {
        doc.addPage();
        yPos = MARGIN_TOP;
        this.drawTableHeader(doc, yPos);
        yPos += 8;
      }

      const line = item.lines[0];
      if (line) {
        this.drawTableRow(doc, yPos, line);
        yPos += 6;
      }
    }
  }

  /**
   * 詳細ページを再帰的に生成する
   */
  private generateDetailPages(doc: jsPDF, items: EstimateExportItem[], level: number): void {
    for (const item of items) {
      if (item.children.length > 0) {
        // 子項目がある場合、新しいページを追加
        doc.addPage();
        let yPos = MARGIN_TOP;

        // 親項目名をタイトルとして表示
        const parentLine = item.lines[0];
        const title = parentLine?.name ?? `項目 ${item.displayOrder + 1}`;
        doc.setFontSize(FONT_SIZE_HEADER);
        doc.text(title, MARGIN_LEFT, yPos);
        yPos += 10;

        // テーブルヘッダー
        doc.setFontSize(FONT_SIZE_BODY);
        this.drawTableHeader(doc, yPos);
        yPos += 8;

        // 子項目を出力
        for (const child of item.children) {
          if (yPos > A4_HEIGHT - MARGIN_BOTTOM - 10) {
            doc.addPage();
            yPos = MARGIN_TOP;
            this.drawTableHeader(doc, yPos);
            yPos += 8;
          }

          const line = child.lines[0];
          if (line) {
            this.drawTableRow(doc, yPos, line);
            yPos += 6;
          }
        }

        // 再帰的に子項目の詳細ページを生成
        this.generateDetailPages(doc, item.children, level + 1);
      }
    }
  }

  /**
   * テーブルヘッダーを描画する
   */
  private drawTableHeader(doc: jsPDF, yPos: number): void {
    let xPos = MARGIN_LEFT;
    doc.setFontSize(FONT_SIZE_SMALL);

    doc.text('名称', xPos, yPos);
    xPos += COL_WIDTH_NAME;

    doc.text('規格', xPos, yPos);
    xPos += COL_WIDTH_SPEC;

    doc.text('単位', xPos, yPos);
    xPos += COL_WIDTH_UNIT;

    doc.text('数量', xPos, yPos);
    xPos += COL_WIDTH_QTY;

    doc.text('単価', xPos, yPos);
    xPos += COL_WIDTH_PRICE;

    doc.text('金額', xPos, yPos);
  }

  /**
   * テーブル行を描画する
   */
  private drawTableRow(doc: jsPDF, yPos: number, line: EstimateExportLine): void {
    let xPos = MARGIN_LEFT;
    doc.setFontSize(FONT_SIZE_SMALL);

    doc.text(this.truncateText(line.name ?? '', 20), xPos, yPos);
    xPos += COL_WIDTH_NAME;

    doc.text(this.truncateText(line.specification ?? '', 15), xPos, yPos);
    xPos += COL_WIDTH_SPEC;

    doc.text(line.unit ?? '', xPos, yPos);
    xPos += COL_WIDTH_UNIT;

    doc.text(line.quantity?.toString() ?? '', xPos, yPos);
    xPos += COL_WIDTH_QTY;

    doc.text(line.unitPrice ? this.formatNumber(line.unitPrice) : '', xPos, yPos);
    xPos += COL_WIDTH_PRICE;

    doc.text(line.amount ? this.formatNumber(line.amount) : '', xPos, yPos);
  }

  // ============================================================================
  // Excel生成用プライベートメソッド
  // ============================================================================

  /**
   * 表紙シートを作成する
   */
  private createCoverSheet(estimate: EstimateExportData): XLSX.WorkSheet {
    const data = [
      ['御見積書'],
      [],
      ['工事名', estimate.projectName],
      ['見積書名', estimate.name],
      ['作成日', this.formatDate(estimate.createdAt)],
      [],
      ['合計金額', estimate.totalAmount ?? this.calculateTotalAmount(estimate.items)],
    ];

    return XLSX.utils.aoa_to_sheet(data);
  }

  /**
   * サマリーシート（第1階層一覧）を作成する
   */
  private createSummarySheet(items: EstimateExportItem[]): XLSX.WorkSheet {
    const headers: (string | number | null)[] = [
      '名称',
      '規格',
      '単位',
      '数量',
      '単価',
      '金額',
      '備考',
    ];
    const data: (string | number | null)[][] = [headers];

    for (const item of items) {
      const line = item.lines[0];
      if (line) {
        data.push([
          line.name ?? '',
          line.specification ?? '',
          line.unit ?? '',
          line.quantity,
          line.unitPrice,
          line.amount,
          line.remarks ?? '',
        ]);
      }
    }

    return XLSX.utils.aoa_to_sheet(data);
  }

  /**
   * 詳細シートを作成する（各第1階層項目ごと）
   */
  private createDetailSheets(workbook: XLSX.WorkBook, items: EstimateExportItem[]): void {
    for (const item of items) {
      if (item.children.length > 0) {
        const parentLine = item.lines[0];
        const sheetName = this.sanitizeSheetName(
          parentLine?.name ?? `項目${item.displayOrder + 1}`
        );

        const headers: (string | number | null)[] = [
          '名称',
          '規格',
          '単位',
          '数量',
          '単価',
          '金額',
          '備考',
        ];
        const data: (string | number | null)[][] = [headers];

        // 子項目を追加
        this.addChildrenToSheet(data, item.children, 0);

        const sheet = XLSX.utils.aoa_to_sheet(data);
        XLSX.utils.book_append_sheet(workbook, sheet, sheetName);
      }
    }
  }

  /**
   * 子項目を再帰的にシートデータに追加する
   */
  private addChildrenToSheet(
    data: (string | number | null)[][],
    children: EstimateExportItem[],
    level: number
  ): void {
    const indent = '  '.repeat(level);

    for (const child of children) {
      const line = child.lines[0];
      if (line) {
        data.push([
          indent + (line.name ?? ''),
          line.specification ?? '',
          line.unit ?? '',
          line.quantity,
          line.unitPrice,
          line.amount,
          line.remarks ?? '',
        ]);
      }

      // 再帰的に子項目を追加
      if (child.children.length > 0) {
        this.addChildrenToSheet(data, child.children, level + 1);
      }
    }
  }

  // ============================================================================
  // 複数行タイプ対応プライベートメソッド (Task 42.2)
  // ============================================================================

  /**
   * 複数行タイプ対応のサマリーシートを作成する
   */
  private createMultiLineTypeSummarySheet(
    items: EstimateExportItem[],
    lineTypes: Array<'ESTIMATE' | 'EXECUTION' | 'VENDOR'>,
    headers: string[]
  ): XLSX.WorkSheet {
    const data: (string | number | null)[][] = [headers];

    for (const item of items) {
      const row = this.buildMultiLineTypeRow(item, lineTypes);
      if (row) {
        data.push(row);
      }
    }

    return XLSX.utils.aoa_to_sheet(data);
  }

  /**
   * 複数行タイプ対応の詳細シートを作成する
   */
  private createMultiLineTypeDetailSheets(
    workbook: XLSX.WorkBook,
    items: EstimateExportItem[],
    lineTypes: Array<'ESTIMATE' | 'EXECUTION' | 'VENDOR'>,
    headers: string[]
  ): void {
    for (const item of items) {
      if (item.children.length > 0) {
        const parentLine = item.lines[0];
        const sheetName = this.sanitizeSheetName(
          parentLine?.name ?? `項目${item.displayOrder + 1}`
        );

        const data: (string | number | null)[][] = [headers];

        this.addMultiLineTypeChildrenToSheet(data, item.children, lineTypes, 0);

        const sheet = XLSX.utils.aoa_to_sheet(data);
        XLSX.utils.book_append_sheet(workbook, sheet, sheetName);
      }
    }
  }

  /**
   * 子項目を再帰的に複数行タイプ形式でシートデータに追加する
   */
  private addMultiLineTypeChildrenToSheet(
    data: (string | number | null)[][],
    children: EstimateExportItem[],
    lineTypes: Array<'ESTIMATE' | 'EXECUTION' | 'VENDOR'>,
    level: number
  ): void {
    const indent = '  '.repeat(level);

    for (const child of children) {
      const row = this.buildMultiLineTypeRow(child, lineTypes, indent);
      if (row) {
        data.push(row);
      }

      if (child.children.length > 0) {
        this.addMultiLineTypeChildrenToSheet(data, child.children, lineTypes, level + 1);
      }
    }
  }

  /**
   * 複数行タイプの1行分のデータを構築する
   */
  private buildMultiLineTypeRow(
    item: EstimateExportItem,
    lineTypes: Array<'ESTIMATE' | 'EXECUTION' | 'VENDOR'>,
    indent: string = ''
  ): (string | number | null)[] | null {
    const row: (string | number | null)[] = [];
    let hasData = false;

    for (const lineType of lineTypes) {
      const line = item.lines.find((l) => l.lineType === lineType);
      if (line) {
        hasData = true;
        row.push(
          indent + (line.name ?? ''),
          line.specification ?? '',
          line.unit ?? '',
          line.quantity,
          line.unitPrice,
          line.amount,
          line.remarks ?? ''
        );
      } else {
        // 該当行タイプのデータがない場合は空列で埋める
        row.push('', '', '', null, null, null, '');
      }
    }

    return hasData ? row : null;
  }

  /**
   * 複数行タイプ対応のサマリーページ（PDF）を生成する
   */
  private generateMultiLineTypeSummaryPage(
    doc: jsPDF,
    _estimate: EstimateExportData,
    items: EstimateExportItem[],
    lineTypes: Array<'ESTIMATE' | 'EXECUTION' | 'VENDOR'>
  ): void {
    let yPos = MARGIN_TOP;

    // ページタイトル
    doc.setFontSize(FONT_SIZE_HEADER);
    doc.text('項目一覧', MARGIN_LEFT, yPos);
    yPos += 10;

    // テーブルヘッダー（複数行タイプ対応）
    doc.setFontSize(FONT_SIZE_SMALL);
    this.drawMultiLineTypeTableHeader(doc, yPos, lineTypes);
    yPos += 8;

    // 各項目を出力
    for (const item of items) {
      if (yPos > A4_HEIGHT - MARGIN_BOTTOM - 10) {
        doc.addPage();
        yPos = MARGIN_TOP;
        this.drawMultiLineTypeTableHeader(doc, yPos, lineTypes);
        yPos += 8;
      }

      this.drawMultiLineTypeTableRow(doc, yPos, item, lineTypes);
      yPos += 6;
    }
  }

  /**
   * 複数行タイプ対応の詳細ページ（PDF）を再帰的に生成する
   */
  private generateMultiLineTypeDetailPages(
    doc: jsPDF,
    items: EstimateExportItem[],
    lineTypes: Array<'ESTIMATE' | 'EXECUTION' | 'VENDOR'>,
    level: number
  ): void {
    for (const item of items) {
      if (item.children.length > 0) {
        doc.addPage();
        let yPos = MARGIN_TOP;

        const parentLine = item.lines[0];
        const title = parentLine?.name ?? `項目 ${item.displayOrder + 1}`;
        doc.setFontSize(FONT_SIZE_HEADER);
        doc.text(title, MARGIN_LEFT, yPos);
        yPos += 10;

        doc.setFontSize(FONT_SIZE_SMALL);
        this.drawMultiLineTypeTableHeader(doc, yPos, lineTypes);
        yPos += 8;

        for (const child of item.children) {
          if (yPos > A4_HEIGHT - MARGIN_BOTTOM - 10) {
            doc.addPage();
            yPos = MARGIN_TOP;
            this.drawMultiLineTypeTableHeader(doc, yPos, lineTypes);
            yPos += 8;
          }

          this.drawMultiLineTypeTableRow(doc, yPos, child, lineTypes);
          yPos += 6;
        }

        this.generateMultiLineTypeDetailPages(doc, item.children, lineTypes, level + 1);
      }
    }
  }

  /**
   * 複数行タイプ対応のテーブルヘッダーを描画する（PDF用）
   */
  private drawMultiLineTypeTableHeader(
    doc: jsPDF,
    yPos: number,
    lineTypes: Array<'ESTIMATE' | 'EXECUTION' | 'VENDOR'>
  ): void {
    let xPos = MARGIN_LEFT;
    doc.setFontSize(FONT_SIZE_SMALL);

    // 列幅を行タイプ数に応じて調整
    const colWidthName = Math.min(COL_WIDTH_NAME, 180 / (lineTypes.length * 6)) + 10;
    const colWidthOther = Math.min(15, 180 / (lineTypes.length * 6));

    for (const lineType of lineTypes) {
      const prefix = LINE_TYPE_LABELS[lineType] ?? lineType;
      doc.text(`${prefix}名称`, xPos, yPos);
      xPos += colWidthName;
      doc.text(`${prefix}金額`, xPos, yPos);
      xPos += colWidthOther + 10;
    }
  }

  /**
   * 複数行タイプ対応のテーブル行を描画する（PDF用）
   */
  private drawMultiLineTypeTableRow(
    doc: jsPDF,
    yPos: number,
    item: EstimateExportItem,
    lineTypes: Array<'ESTIMATE' | 'EXECUTION' | 'VENDOR'>
  ): void {
    let xPos = MARGIN_LEFT;
    doc.setFontSize(FONT_SIZE_SMALL);

    const colWidthName = Math.min(COL_WIDTH_NAME, 180 / (lineTypes.length * 6)) + 10;
    const colWidthOther = Math.min(15, 180 / (lineTypes.length * 6)) + 10;

    for (const lineType of lineTypes) {
      const line = item.lines.find((l) => l.lineType === lineType);
      if (line) {
        doc.text(this.truncateText(line.name ?? '', 15), xPos, yPos);
        xPos += colWidthName;
        doc.text(line.amount ? this.formatNumber(line.amount) : '', xPos, yPos);
        xPos += colWidthOther;
      } else {
        xPos += colWidthName + colWidthOther;
      }
    }
  }

  // ============================================================================
  // 空欄行フィルタリング (Task 47.2, REQ-38.2, REQ-38.3)
  // ============================================================================

  /**
   * 選択された行タイプにデータが存在しない行を除外する
   *
   * Requirements:
   * - REQ-38.2: 選択された行タイプにデータが存在する行のみ出力
   * - REQ-38.3: 空欄行を詰めて出力
   *
   * @param items - 見積項目
   * @param lineTypes - 選択された行タイプ
   * @returns フィルタリングされた見積項目
   */
  private filterEmptyRows(
    items: EstimateExportItem[],
    lineTypes: Array<'ESTIMATE' | 'EXECUTION' | 'VENDOR'>
  ): EstimateExportItem[] {
    return items
      .filter((item) => {
        // 子項目を持つ親項目は階層構造維持のため常に出力対象
        if (item.children.length > 0) return true;
        // 選択された行タイプのいずれかにデータが存在するか確認
        return lineTypes.some((lineType) => {
          const line = item.lines.find((l) => l.lineType === lineType);
          return line != null && this.hasLineData(line);
        });
      })
      .map((item) => ({
        ...item,
        children: this.filterEmptyRows(item.children, lineTypes),
      }));
  }

  /**
   * 行にデータが存在するかを判定する
   *
   * @param line - 見積項目行
   * @returns データが存在する場合true
   */
  private hasLineData(line: EstimateExportLine): boolean {
    return !!(
      line.name ||
      line.specification ||
      line.unit ||
      line.quantity != null ||
      line.unitPrice != null ||
      line.remarks
    );
  }

  // ============================================================================
  // ユーティリティメソッド
  // ============================================================================

  /**
   * 見積書データをバリデーションする
   */
  private validateEstimateData(estimate: EstimateExportData): void {
    if (!estimate) {
      throw new Error('見積書データが必要です');
    }

    if (!estimate.name || estimate.name.trim() === '') {
      throw new Error('見積書名が必要です');
    }
  }

  /**
   * ファイル名をサニタイズする
   */
  private sanitizeFileName(name: string): string {
    return name.replace(INVALID_FILENAME_CHARS, '_').replace(/\s+/g, '_');
  }

  /**
   * シート名をサニタイズする（31文字以内、特殊文字除去）
   */
  private sanitizeSheetName(name: string): string {
    const sanitized = name
      .replace(/[\\/*?:\[\]]/g, '_')
      .replace(/\s+/g, ' ')
      .trim();
    return sanitized.substring(0, 31);
  }

  /**
   * 日付をファイル名用にフォーマットする（YYYYMMDD）
   */
  private formatDateForFileName(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}${month}${day}`;
  }

  /**
   * 日付を表示用にフォーマットする
   */
  private formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();
    return `${year}年${month}月${day}日`;
  }

  /**
   * 金額を通貨形式でフォーマットする
   */
  private formatCurrency(amount: number): string {
    return `${this.formatNumber(amount)}円`;
  }

  /**
   * 数値をフォーマットする（カンマ区切り）
   */
  private formatNumber(num: number): string {
    return num.toLocaleString('ja-JP');
  }

  /**
   * テキストを指定文字数で切り詰める
   */
  private truncateText(text: string, maxLength: number): string {
    if (text.length <= maxLength) {
      return text;
    }
    return text.substring(0, maxLength - 1) + '...';
  }
}
