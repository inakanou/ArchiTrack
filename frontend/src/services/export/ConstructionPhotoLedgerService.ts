/**
 * ConstructionPhotoLedgerService - 工事写真台帳PDFレンダラ
 *
 * Task 8.1: 台帳版組・表紙・写真ページレンダラ
 *
 * 参考書式（社内の既存工事写真台帳）に準拠した台帳PDFドキュメントを、
 * 与えられた写真項目データ（印字画像 dataUrl＋コメント）と工事名・工事施工者
 * （会社名）から構築するレンダラ。
 *
 * - 表紙: 全体を外枠で囲み、中央に「工事写真」表題、工事名・工事施工者を
 *   ラベル＋下線付きで表示する。
 * - 写真ページ: 1ページに写真項目を最大3件、縦積みで配置。各項目は左に写真、
 *   右に「No.（通し番号）」見出し＋下線＋点線コメント欄。
 * - No. は文書全体でページを跨いだ通し番号。
 * - 最終ページで3枠に満たない枠は空欄（余白枠）としてページ体裁を保持する。
 * - 日本語フォント（NotoSansJP）で文字化けなく描画する。
 *
 * 注意: 本サービスはデータを引数で受け取り、印字画像の取得（fetch）や画面
 * ボタン結線・0件通知は行わない（それらは Task 8.2 が担当）。
 *
 * @see design.md - Components and Interfaces（ConstructionPhotoLedgerService）
 * @see requirements.md - 要件10.2, 10.4, 10.5, 10.6, 10.7, 10.10, 10.11
 * @see research.md - 参考書式（A4縦mm・写真幅比0.45/右コメント幅比0.45・点線8本6.5mm間隔・行高75mm）
 */

import type { jsPDF } from 'jspdf';
import { calculateImageDimensions } from './PdfReportService';
import { initializePdfFonts, PDF_FONT_FAMILY } from './PdfFontService';

// ============================================================================
// 定数定義
// ============================================================================

/**
 * 工事写真台帳のレイアウト設定
 *
 * 参考書式（実台帳）に合わせた版組パラメータ。
 * 既存 `PDF_REPORT_LAYOUT_V2`（1ページ3組版組）を基準とし、
 * A4寸法・外枠・No.見出し等の台帳固有の値を追加する。
 */
export const CONSTRUCTION_PHOTO_LEDGER_LAYOUT = {
  // ページ設定（A4縦・mm）
  /** ページ幅（mm） */
  PAGE_WIDTH: 210,
  /** ページ高さ（mm） */
  PAGE_HEIGHT: 297,
  /** ページマージン（mm） */
  PAGE_MARGIN: 15,
  /** 写真ページ上端のヘッダー余白（mm） */
  HEADER_HEIGHT: 5,

  // 写真枠（1ページ3枠）
  /** 1ページあたりの写真項目数 */
  IMAGES_PER_PAGE: 3,
  /** 1枠あたりの高さ（mm） */
  ROW_HEIGHT: 75,
  /** 枠間の余白（mm） */
  ROW_GAP: 5,

  // 写真（左カラム）
  /** コンテンツ幅に対する写真幅の比率 */
  IMAGE_WIDTH_RATIO: 0.45,
  /** 写真の最大高さ（mm） */
  IMAGE_MAX_HEIGHT: 70,

  // コメント欄（右カラム）
  /** コンテンツ幅に対するコメント欄幅の比率 */
  COMMENT_WIDTH_RATIO: 0.45,
  /** 写真とコメント欄の間の余白（mm） */
  COLUMN_GAP: 10,
  /** コメントフォントサイズ（pt） */
  COMMENT_FONT_SIZE: 10,
  /** コメント行間 */
  COMMENT_LINE_HEIGHT: 1.4,

  // No.見出し（右カラム上部）
  /** No.見出しフォントサイズ（pt） */
  NO_HEADING_FONT_SIZE: 11,

  // 点線コメント罫線
  /** 点線罫線の本数 */
  DOTTED_LINE_COUNT: 8,
  /** 点線罫線の行間（mm） */
  DOTTED_LINE_SPACING: 6.5,
  /** No.下線からコメント欄先頭罫線までのオフセット（mm） */
  COMMENT_TOP_OFFSET: 10,

  // 表紙
  /** 外枠のページ端からのマージン（mm） */
  COVER_BORDER_MARGIN: 15,
  /** 表題「工事写真」のフォントサイズ（pt） */
  COVER_TITLE_FONT_SIZE: 32,
  /** 表題のY座標（mm） */
  COVER_TITLE_Y: 90,
  /** ラベル・値のフォントサイズ（pt） */
  COVER_LABEL_FONT_SIZE: 14,
  /** 工事名行のY座標（mm） */
  COVER_WORK_NAME_Y: 170,
  /** 工事施工者行のY座標（mm） */
  COVER_CONTRACTOR_Y: 200,

  // フォント
  /** フォントファミリー */
  FONT_FAMILY: 'NotoSansJP',
} as const;

// ============================================================================
// 型定義
// ============================================================================

/**
 * 台帳に出力する写真項目（レンダラ入力）
 *
 * 印字画像は dataUrl で受ける前提（実際の印字画像取得は Task 8.2 が担当）。
 */
export interface LedgerPhotoItem {
  /** 印字画像のデータURL（JPEG） */
  dataUrl: string;
  /** 写真項目のコメント（null/空可） */
  comment: string | null;
  /** 画像の実寸幅（px・アスペクト比計算用、未指定時は4:3を仮定） */
  width?: number;
  /** 画像の実寸高さ（px・アスペクト比計算用、未指定時は4:3を仮定） */
  height?: number;
}

/**
 * 台帳PDF構築の入力
 */
export interface ConstructionPhotoLedgerInput {
  /** 工事名 */
  workName: string;
  /** 工事施工者（会社名） */
  contractorName: string;
  /** 写真項目配列（表示順序。No.はこの順序で通し番号を付与） */
  items: LedgerPhotoItem[];
}

// ============================================================================
// ConstructionPhotoLedgerService クラス
// ============================================================================

/**
 * 工事写真台帳PDFレンダラサービス
 *
 * Requirements:
 * - 10.2: 表紙（外枠・「工事写真」・工事名・工事施工者）
 * - 10.4: 左写真・右No.見出し＋コメント欄レイアウト
 * - 10.5: No.のページ跨ぎ通し番号
 * - 10.6: コメントの出力
 * - 10.7: 写真のアスペクト比保持
 * - 10.10: 最終ページの余白枠
 * - 10.11: 日本語テキストの文字化けなし出力
 */
export class ConstructionPhotoLedgerService {
  /**
   * 台帳PDFドキュメントを構築する
   *
   * 1ページ目に表紙、2ページ目以降に写真ページ（1ページ3枠）を描画する。
   *
   * @param doc jsPDFインスタンス（A4縦・mm単位で初期化済み）
   * @param input 工事名・工事施工者・写真項目配列
   * @returns 構築済みのjsPDFインスタンス
   * @throws Error jsPDFインスタンスがnull/undefinedの場合
   */
  buildLedgerDocument(doc: jsPDF, input: ConstructionPhotoLedgerInput): jsPDF {
    if (!doc) {
      throw new Error('jsPDF instance is required');
    }

    // フォントを初期化（失敗時はデフォルトフォントにフォールバック）
    try {
      initializePdfFonts(doc);
      doc.setFont(PDF_FONT_FAMILY);
    } catch (fontError) {
      console.warn('Failed to load Japanese font, using default font:', fontError);
      doc.setFont('helvetica');
    }

    // 1ページ目: 表紙
    this.renderCoverPage(doc, input.workName, input.contractorName);

    // 2ページ目以降: 写真ページ
    const items = input.items ?? [];
    if (items.length > 0) {
      this.renderPhotoPages(doc, items);
    }

    return doc;
  }

  /**
   * 表紙ページを描画する
   *
   * 全体を外枠で囲み、中央に「工事写真」表題、工事名・工事施工者を
   * ラベル＋下線付きの値で表示する。
   *
   * 要件10.2: 外枠内に「工事写真」の表題、工事名、工事施工者（会社名）を表示
   *
   * @param doc jsPDFインスタンス
   * @param workName 工事名
   * @param contractorName 工事施工者（会社名）
   */
  renderCoverPage(doc: jsPDF, workName: string, contractorName: string): void {
    const L = CONSTRUCTION_PHOTO_LEDGER_LAYOUT;
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const centerX = pageWidth / 2;

    // 外枠
    doc.setDrawColor(30, 30, 30);
    doc.setLineWidth(0.8);
    doc.rect(
      L.COVER_BORDER_MARGIN,
      L.COVER_BORDER_MARGIN,
      pageWidth - L.COVER_BORDER_MARGIN * 2,
      pageHeight - L.COVER_BORDER_MARGIN * 2
    );

    // 表題「工事写真」（文字間隔を空けて中央配置）
    doc.setFontSize(L.COVER_TITLE_FONT_SIZE);
    doc.setTextColor(30, 30, 30);
    doc.text('工 事 写 真', centerX, L.COVER_TITLE_Y, { align: 'center' });

    // ラベル・値の配置基準
    const labelX = L.PAGE_MARGIN + 25;
    const valueX = labelX + 40;
    const valueRightX = pageWidth - L.PAGE_MARGIN - 25;

    // 工事名
    this.renderCoverField(doc, '工事名', workName, labelX, valueX, valueRightX, L.COVER_WORK_NAME_Y);

    // 工事施工者
    this.renderCoverField(
      doc,
      '工事施工者',
      contractorName,
      labelX,
      valueX,
      valueRightX,
      L.COVER_CONTRACTOR_Y
    );
  }

  /**
   * 表紙のラベル＋下線付き値を描画する（内部ヘルパー）
   *
   * @param doc jsPDFインスタンス
   * @param label ラベル文字列
   * @param value 値文字列
   * @param labelX ラベルX座標
   * @param valueX 値X座標
   * @param valueRightX 下線右端X座標
   * @param y 描画Y座標
   */
  private renderCoverField(
    doc: jsPDF,
    label: string,
    value: string,
    labelX: number,
    valueX: number,
    valueRightX: number,
    y: number
  ): void {
    const L = CONSTRUCTION_PHOTO_LEDGER_LAYOUT;

    doc.setFontSize(L.COVER_LABEL_FONT_SIZE);
    doc.setTextColor(30, 30, 30);

    // ラベル
    doc.text(label, labelX, y);

    // 値
    if (value && value.trim() !== '') {
      doc.text(value, valueX, y);
    }

    // 値の下線
    doc.setDrawColor(30, 30, 30);
    doc.setLineWidth(0.4);
    doc.line(valueX, y + 2, valueRightX, y + 2);
  }

  /**
   * 写真ページ群を描画する
   *
   * 写真項目を1ページ3枠で縦積み配置し、No.をページを跨いだ通し番号で付番する。
   * 最終ページで3枠に満たない枠は余白枠として描画する。
   *
   * 要件10.3, 10.5, 10.10: 1ページ3枠・No.通し番号・余白枠
   *
   * @param doc jsPDFインスタンス
   * @param items 写真項目配列（表示順序）
   */
  renderPhotoPages(doc: jsPDF, items: LedgerPhotoItem[]): void {
    const L = CONSTRUCTION_PHOTO_LEDGER_LAYOUT;
    const totalPages = Math.ceil(items.length / L.IMAGES_PER_PAGE);

    for (let page = 0; page < totalPages; page++) {
      // 表紙（1ページ目）は既存のため、各写真ページで新規ページを追加する
      doc.addPage();
      let currentY = L.PAGE_MARGIN + L.HEADER_HEIGHT;

      for (let slot = 0; slot < L.IMAGES_PER_PAGE; slot++) {
        const index = page * L.IMAGES_PER_PAGE + slot;

        if (index < items.length) {
          const item = items[index];
          if (item) {
            // No. は文書全体の通し番号（1始まり）
            this.renderPhotoItem(doc, item, index + 1, currentY);
          }
        } else {
          // 3枠に満たない枠は余白枠（要件10.10）
          this.renderEmptySlot(doc, currentY);
        }

        currentY += L.ROW_HEIGHT + L.ROW_GAP;
      }
    }
  }

  /**
   * 写真項目1件（1枠）を描画する
   *
   * 左に写真（アスペクト比保持）、右に「No.（通し番号）」見出し＋下線＋
   * 点線コメント欄を描画する。
   *
   * 要件10.4, 10.6, 10.7: 左写真・右No.＋コメント欄、コメント出力、アスペクト比保持
   *
   * @param doc jsPDFインスタンス
   * @param item 写真項目
   * @param no 通し番号（1始まり）
   * @param topY 枠の上端Y座標
   */
  renderPhotoItem(doc: jsPDF, item: LedgerPhotoItem, no: number, topY: number): void {
    const L = CONSTRUCTION_PHOTO_LEDGER_LAYOUT;
    const pageWidth = doc.internal.pageSize.getWidth();
    const contentWidth = pageWidth - L.PAGE_MARGIN * 2;
    const imageWidth = contentWidth * L.IMAGE_WIDTH_RATIO;
    const commentAreaWidth = contentWidth * L.COMMENT_WIDTH_RATIO;

    const imageX = L.PAGE_MARGIN;

    // 写真サイズ（アスペクト比保持。実寸未指定時は4:3を仮定）
    const originalWidth = item.width && item.width > 0 ? item.width : 4;
    const originalHeight = item.height && item.height > 0 ? item.height : 3;
    const { width, height } = calculateImageDimensions(
      originalWidth,
      originalHeight,
      imageWidth,
      L.IMAGE_MAX_HEIGHT
    );

    // 写真を描画（失敗時はプレースホルダー枠）
    try {
      doc.addImage(item.dataUrl, 'JPEG', imageX, topY, width, height);
    } catch {
      doc.setDrawColor(200, 200, 200);
      doc.setFillColor(240, 240, 240);
      doc.rect(imageX, topY, width, height, 'FD');
      doc.setFontSize(L.COMMENT_FONT_SIZE);
      doc.setTextColor(150, 150, 150);
      doc.text('画像を読み込めませんでした', imageX + width / 2, topY + height / 2, {
        align: 'center',
      });
    }

    // 右カラム: No.見出し
    const commentX = imageX + imageWidth + L.COLUMN_GAP;
    let cursorY = topY;

    doc.setFontSize(L.NO_HEADING_FONT_SIZE);
    doc.setTextColor(30, 30, 30);
    doc.text(`No.${no}`, commentX, cursorY + 4);

    // No.下線
    cursorY += 6;
    doc.setDrawColor(30, 30, 30);
    doc.setLineWidth(0.5);
    doc.line(commentX, cursorY, commentX + commentAreaWidth, cursorY);

    // 点線コメント欄
    cursorY += L.COMMENT_TOP_OFFSET;
    const commentLines: string[] = item.comment
      ? doc.splitTextToSize(item.comment, commentAreaWidth - 4)
      : [];

    for (let lineIdx = 0; lineIdx < L.DOTTED_LINE_COUNT; lineIdx++) {
      const lineY = cursorY + lineIdx * L.DOTTED_LINE_SPACING;

      // コメントテキストを点線の上に描画
      const commentText = commentLines[lineIdx];
      if (commentText) {
        doc.setFontSize(L.COMMENT_FONT_SIZE);
        doc.setTextColor(30, 30, 30);
        doc.text(commentText, commentX, lineY - 1);
      }

      // 点線罫線
      this.drawDottedLine(doc, commentX, lineY, commentX + commentAreaWidth, lineY);
    }
  }

  /**
   * 余白枠（空スロット）を描画する
   *
   * 最終ページで3枠に満たない枠を、薄い枠線で空欄として描画し、
   * ページ体裁（3枠構成）を保持する。
   *
   * 要件10.10: 余った枠を空欄（余白）としてページ体裁を保持する
   *
   * @param doc jsPDFインスタンス
   * @param topY 枠の上端Y座標
   */
  renderEmptySlot(doc: jsPDF, topY: number): void {
    const L = CONSTRUCTION_PHOTO_LEDGER_LAYOUT;
    const pageWidth = doc.internal.pageSize.getWidth();
    const contentWidth = pageWidth - L.PAGE_MARGIN * 2;

    // 空枠の外形（薄いグレーの枠線）
    doc.setDrawColor(220, 220, 220);
    doc.setLineWidth(0.2);
    doc.rect(L.PAGE_MARGIN, topY, contentWidth, L.ROW_HEIGHT);
  }

  /**
   * 点線を描画する
   *
   * @param doc jsPDFインスタンス
   * @param x1 開始X座標
   * @param y1 開始Y座標
   * @param x2 終了X座標
   * @param y2 終了Y座標
   */
  private drawDottedLine(doc: jsPDF, x1: number, y1: number, x2: number, y2: number): void {
    const dotLength = 0.5;
    const gapLength = 1.5;
    const totalLength = Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
    if (totalLength === 0) {
      return;
    }
    const dx = (x2 - x1) / totalLength;
    const dy = (y2 - y1) / totalLength;

    doc.setDrawColor(100, 100, 100);
    doc.setLineWidth(0.2);

    let currentPos = 0;
    while (currentPos < totalLength) {
      const startX = x1 + dx * currentPos;
      const startY = y1 + dy * currentPos;
      const endPos = Math.min(currentPos + dotLength, totalLength);
      const endX = x1 + dx * endPos;
      const endY = y1 + dy * endPos;

      doc.line(startX, startY, endX, endY);
      currentPos += dotLength + gapLength;
    }
  }
}

// ============================================================================
// シングルトンインスタンス
// ============================================================================

let defaultService: ConstructionPhotoLedgerService | null = null;

/**
 * デフォルトのサービスインスタンスを取得
 */
function getDefaultService(): ConstructionPhotoLedgerService {
  if (!defaultService) {
    defaultService = new ConstructionPhotoLedgerService();
  }
  return defaultService;
}

/**
 * シングルトンインスタンスをリセットする（テスト用）
 */
export function resetConstructionPhotoLedgerService(): void {
  defaultService = null;
}

// ============================================================================
// スタンドアロン関数
// ============================================================================

/**
 * 台帳PDFドキュメントを構築する（スタンドアロン関数）
 *
 * @param doc jsPDFインスタンス
 * @param input 工事名・工事施工者・写真項目配列
 * @returns 構築済みのjsPDFインスタンス
 */
export function buildConstructionPhotoLedger(
  doc: jsPDF,
  input: ConstructionPhotoLedgerInput
): jsPDF {
  return getDefaultService().buildLedgerDocument(doc, input);
}

export default ConstructionPhotoLedgerService;
