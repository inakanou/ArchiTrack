/**
 * PdfReportService - PDF報告書レイアウトサービス
 *
 * Task 21.2: PDF報告書レイアウトを実装する
 * - 表紙（調査名、調査日、プロジェクト名）
 * - 基本情報セクション（メモ含む）
 * - 画像一覧セクション（注釈付き画像）
 * - ページ番号
 *
 * Task 28.2: PDF報告書1ページ3組レイアウトを実装する
 * - 1ページ目に現場調査の基本情報（調査名、調査日、メモ等）を配置
 * - 2ページ目以降に写真とコメントの組み合わせを1ページあたり3組で配置
 * - 画像の左側配置、コメントの右側配置レイアウト
 * - コメント最大行数制限とオーバーフロー処理
 *
 * @see design.md - ExportService
 * @see requirements.md - 要件10.6, 10.7, 11.4, 11.5, 11.6
 */

import type { jsPDF } from 'jspdf';
import type { SiteSurveyDetail, SurveyImageInfo } from '../../types/site-survey.types';
import { initializePdfFonts, PDF_FONT_FAMILY } from './PdfFontService';

// ============================================================================
// 定数定義
// ============================================================================

/**
 * PDF報告書のレイアウト設定
 */
export const PDF_REPORT_LAYOUT = {
  /** ページマージン（mm） */
  PAGE_MARGIN: 15,
  /** タイトルフォントサイズ */
  TITLE_FONT_SIZE: 24,
  /** サブタイトルフォントサイズ */
  SUBTITLE_FONT_SIZE: 14,
  /** ヘッダーフォントサイズ */
  HEADER_FONT_SIZE: 12,
  /** 本文フォントサイズ */
  BODY_FONT_SIZE: 10,
  /** 小さいフォントサイズ（ページ番号等） */
  SMALL_FONT_SIZE: 8,
  /** 行間 */
  LINE_HEIGHT: 1.4,
  /** セクション間の余白 */
  SECTION_MARGIN: 10,
  /** 画像と画像の間の余白 */
  IMAGE_MARGIN: 5,
  /** 画像の最大幅（ページ幅に対する比率） */
  IMAGE_MAX_WIDTH_RATIO: 0.9,
  /** 画像の最大高さ（ページ高さに対する比率） */
  IMAGE_MAX_HEIGHT_RATIO: 0.6,
} as const;

/**
 * PDF報告書の3組レイアウト設定（Task 28.2用）
 *
 * 要件11.5: 1ページあたり3組の写真+コメント配置
 */
export const PDF_REPORT_LAYOUT_V2 = {
  // ページ設定
  /** ページマージン（mm） */
  PAGE_MARGIN: 15,
  /** ヘッダー高さ（mm） */
  HEADER_HEIGHT: 5,
  /** フッター高さ（mm） */
  FOOTER_HEIGHT: 15,

  // 画像+コメント組の設定
  /** 1ページあたりの画像数 */
  IMAGES_PER_PAGE: 3,
  /** 1組あたりの高さ（mm） */
  ROW_HEIGHT: 75,
  /** 行間（mm） */
  ROW_GAP: 5,

  // 画像設定
  /** ページ幅に対する画像幅の比率 */
  IMAGE_WIDTH_RATIO: 0.45,
  /** 画像の最大高さ（mm） */
  IMAGE_MAX_HEIGHT: 70,

  // コメント設定
  /** ページ幅に対するコメント幅の比率 */
  COMMENT_WIDTH_RATIO: 0.45,
  /** コメントフォントサイズ（pt） */
  COMMENT_FONT_SIZE: 10,
  /** コメント行間 */
  COMMENT_LINE_HEIGHT: 1.4,
  /** コメント最大行数 */
  COMMENT_MAX_LINES: 5,

  // フォント
  /** フォントファミリー */
  FONT_FAMILY: 'NotoSansJP',
} as const;

// ============================================================================
// 型定義
// ============================================================================

/**
 * 注釈付き画像データ
 */
export interface AnnotatedImage {
  /** 画像情報 */
  imageInfo: SurveyImageInfo;
  /** 注釈付き画像のデータURL */
  dataUrl: string;
}

/**
 * コメント付き注釈画像データ（Task 28.2用）
 *
 * 要件11.6: 各写真に紐付けられたコメントをPDFに含める
 */
export interface AnnotatedImageWithComment extends AnnotatedImage {
  /** 画像に紐付けられたコメント */
  comment: string | null;
}

/**
 * PDF報告書生成オプション
 */
export interface PdfReportOptions {
  /** 表紙を含める（デフォルト: true） */
  includeCoverPage?: boolean;
  /** 基本情報セクションを含める（デフォルト: true） */
  includeInfoSection?: boolean;
  /** 画像セクションを含める（デフォルト: true） */
  includeImages?: boolean;
  /** ページ番号を含める（デフォルト: true） */
  includePageNumbers?: boolean;
}

/**
 * 画像サイズ計算結果
 */
export interface ImageDimensions {
  width: number;
  height: number;
}

// ============================================================================
// ユーティリティ関数
// ============================================================================

/**
 * 日付をPDF用にフォーマットする
 *
 * @param dateString ISO8601形式の日付文字列（YYYY-MM-DD）
 * @returns 日本語形式の日付文字列（yyyy年mm月dd日）
 */
export function formatDateForPdf(dateString: string): string {
  if (!dateString) return '';

  const parts = dateString.split('-');
  if (parts.length !== 3) return dateString;

  const year = parts[0] ?? '';
  const month = parts[1] ?? '';
  const day = parts[2] ?? '';

  return `${year}年${parseInt(month, 10)}月${parseInt(day, 10)}日`;
}

/**
 * 画像のサイズを計算する
 *
 * アスペクト比を維持しながら、指定された最大サイズに収まるサイズを計算する。
 *
 * @param originalWidth 元の画像の幅
 * @param originalHeight 元の画像の高さ
 * @param maxWidth 最大幅
 * @param maxHeight 最大高さ
 * @returns 計算された幅と高さ
 */
export function calculateImageDimensions(
  originalWidth: number,
  originalHeight: number,
  maxWidth: number,
  maxHeight: number
): ImageDimensions {
  const aspectRatio = originalWidth / originalHeight;

  let width = maxWidth;
  let height = width / aspectRatio;

  if (height > maxHeight) {
    height = maxHeight;
    width = height * aspectRatio;
  }

  return { width, height };
}

/**
 * コメント行を最大行数で切り捨てる（Task 28.2用）
 *
 * 要件11.6: コメント最大行数制限とオーバーフロー処理
 *
 * @param lines 元の行配列
 * @param maxLines 最大行数
 * @returns 切り捨て後の行配列（最後の行に「...」を追加）
 */
export function truncateCommentLines(lines: string[], maxLines: number): string[] {
  if (lines.length === 0) {
    return [];
  }

  if (lines.length <= maxLines) {
    return lines;
  }

  // 最大行数で切り捨て、最後の行に「...」を追加
  const truncated = lines.slice(0, maxLines);
  const lastLine = truncated[maxLines - 1] ?? '';
  truncated[maxLines - 1] = lastLine + '...';

  return truncated;
}

// ============================================================================
// PdfReportServiceクラス
// ============================================================================

/**
 * PDF報告書サービスクラス
 *
 * 現場調査のPDF報告書を生成する。表紙、基本情報、画像一覧、
 * ページ番号を含むレイアウトを実装。
 *
 * Requirements:
 * - 10.6: PDF報告書生成（日本語対応）
 * - 10.7: 調査報告PDFに基本情報を含める
 */
export class PdfReportService {
  /**
   * 表紙を描画する
   *
   * 調査名、調査日、プロジェクト名、メモを含む表紙を描画する。
   * サンプルPDFの書式に準拠：上下に青いバー、中央にタイトルと情報
   *
   * @param doc jsPDFインスタンス
   * @param survey 現場調査詳細
   */
  renderCoverPage(doc: jsPDF, survey: SiteSurveyDetail, outputImageCount?: number): void {
    // フォントを初期化（失敗時は無視してデフォルトフォントを使用）
    try {
      initializePdfFonts(doc);
    } catch {
      // generateReportで既にフォールバック済みのため、ここではログ出力のみ
    }

    const pageWidth = doc.internal.pageSize.getWidth();
    const centerX = pageWidth / 2;

    // タイトル：「現場調査報告書」
    doc.setFontSize(PDF_REPORT_LAYOUT.TITLE_FONT_SIZE);
    doc.setTextColor(30, 30, 30);
    doc.text('現場調査報告書', centerX, 55, { align: 'center' });

    // 調査名
    doc.setFontSize(PDF_REPORT_LAYOUT.SUBTITLE_FONT_SIZE + 4);
    doc.text(survey.name, centerX, 85, { align: 'center' });

    // 装飾線（中央）
    doc.setDrawColor(80, 80, 80);
    doc.setLineWidth(0.5);
    doc.line(
      PDF_REPORT_LAYOUT.PAGE_MARGIN + 30,
      105,
      pageWidth - PDF_REPORT_LAYOUT.PAGE_MARGIN - 30,
      105
    );

    // 基本情報セクション
    const infoStartY = 135;
    const labelX = PDF_REPORT_LAYOUT.PAGE_MARGIN + 25; // 左端に固定
    doc.setFontSize(PDF_REPORT_LAYOUT.HEADER_FONT_SIZE);

    // 「工事名：」の幅を測定して値の開始位置を計算（ラベルの右端から約1文字分離す）
    doc.setTextColor(80, 80, 80);
    const labelWidth = doc.getTextWidth('工事名：');
    const valueX = labelX + labelWidth + 3; // ラベルの右端から3mm（約1文字分）離す

    // 工事名（プロジェクト名）
    doc.text('工事名：', labelX, infoStartY);
    doc.setTextColor(30, 30, 30);
    doc.text(survey.project.name, valueX, infoStartY);

    // 調査日
    doc.setTextColor(80, 80, 80);
    doc.text('調査日：', labelX, infoStartY + 15);
    doc.setTextColor(30, 30, 30);
    doc.text(formatDateForPdf(survey.surveyDate), valueX, infoStartY + 15);

    // 画像件数（PDF出力対象の枚数を優先）
    const imageCount = outputImageCount ?? survey.imageCount;
    doc.setTextColor(80, 80, 80);
    doc.text('画像数：', labelX, infoStartY + 30);
    doc.setTextColor(30, 30, 30);
    doc.text(`${imageCount}枚`, valueX, infoStartY + 30);

    // 作成日
    const createdDate = survey.createdAt.split('T')[0] ?? '';
    doc.setTextColor(80, 80, 80);
    doc.text('作成日：', labelX, infoStartY + 45);
    doc.setTextColor(30, 30, 30);
    doc.text(formatDateForPdf(createdDate), valueX, infoStartY + 45);

    // メモ
    doc.setTextColor(80, 80, 80);
    doc.text('メモ：', labelX, infoStartY + 60);
    doc.setTextColor(30, 30, 30);
    if (survey.memo && survey.memo.trim() !== '') {
      // メモを折り返して表示（最大幅を設定）
      const memoMaxWidth = pageWidth - valueX - PDF_REPORT_LAYOUT.PAGE_MARGIN;
      const memoLines: string[] = doc.splitTextToSize(survey.memo, memoMaxWidth);
      let memoY = infoStartY + 60;
      const maxMemoLines = 5; // 表紙では最大5行
      const displayLines = memoLines.slice(0, maxMemoLines);
      for (const line of displayLines) {
        doc.text(line, valueX, memoY);
        memoY += 6;
      }
      if (memoLines.length > maxMemoLines) {
        doc.text('...', valueX, memoY);
      }
    } else {
      doc.setTextColor(120, 120, 120);
      doc.text('（なし）', valueX, infoStartY + 60);
    }
  }

  /**
   * 基本情報セクションを描画する
   *
   * メモを含む基本情報を描画する。
   *
   * @param doc jsPDFインスタンス
   * @param survey 現場調査詳細
   * @param startY 開始Y座標
   * @returns 描画終了時のY座標
   */
  renderInfoSection(doc: jsPDF, survey: SiteSurveyDetail, startY: number): number {
    const pageWidth = doc.internal.pageSize.getWidth();
    const contentWidth = pageWidth - PDF_REPORT_LAYOUT.PAGE_MARGIN * 2;
    let currentY = startY;

    // セクションヘッダー
    doc.setFontSize(PDF_REPORT_LAYOUT.HEADER_FONT_SIZE);
    doc.setTextColor(30, 30, 30);
    doc.text('基本情報', PDF_REPORT_LAYOUT.PAGE_MARGIN, currentY);
    currentY += 8;

    // 下線
    doc.setDrawColor(100, 100, 100);
    doc.setLineWidth(0.3);
    doc.line(
      PDF_REPORT_LAYOUT.PAGE_MARGIN,
      currentY,
      pageWidth - PDF_REPORT_LAYOUT.PAGE_MARGIN,
      currentY
    );
    currentY += 8;

    // メモ
    doc.setFontSize(PDF_REPORT_LAYOUT.BODY_FONT_SIZE);
    doc.setTextColor(60, 60, 60);
    doc.text('メモ：', PDF_REPORT_LAYOUT.PAGE_MARGIN, currentY);
    currentY += 6;

    if (survey.memo) {
      doc.setTextColor(30, 30, 30);
      // 長いテキストを折り返す
      const memoLines = doc.splitTextToSize(survey.memo, contentWidth - 5);
      memoLines.forEach((line: string) => {
        doc.text(line, PDF_REPORT_LAYOUT.PAGE_MARGIN + 5, currentY);
        currentY += 5;
      });
    } else {
      doc.setTextColor(120, 120, 120);
      doc.text('（メモなし）', PDF_REPORT_LAYOUT.PAGE_MARGIN + 5, currentY);
      currentY += 5;
    }

    return currentY + PDF_REPORT_LAYOUT.SECTION_MARGIN;
  }

  /**
   * 画像一覧セクションを描画する
   *
   * 注釈付き画像を順番に描画する。ページをまたぐ場合は新しいページを追加する。
   *
   * @param doc jsPDFインスタンス
   * @param images 注釈付き画像の配列
   * @param startY 開始Y座標
   * @returns 描画終了時のY座標
   */
  renderImagesSection(doc: jsPDF, images: AnnotatedImage[], startY: number): number {
    if (images.length === 0) {
      return startY;
    }

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const contentWidth = pageWidth - PDF_REPORT_LAYOUT.PAGE_MARGIN * 2;
    const maxImageWidth = contentWidth * PDF_REPORT_LAYOUT.IMAGE_MAX_WIDTH_RATIO;
    const maxImageHeight =
      (pageHeight - PDF_REPORT_LAYOUT.PAGE_MARGIN * 2) * PDF_REPORT_LAYOUT.IMAGE_MAX_HEIGHT_RATIO;
    let currentY = startY;

    // セクションヘッダー
    doc.setFontSize(PDF_REPORT_LAYOUT.HEADER_FONT_SIZE);
    doc.setTextColor(30, 30, 30);
    doc.text('画像一覧', PDF_REPORT_LAYOUT.PAGE_MARGIN, currentY);
    currentY += 8;

    // 下線
    doc.setDrawColor(100, 100, 100);
    doc.setLineWidth(0.3);
    doc.line(
      PDF_REPORT_LAYOUT.PAGE_MARGIN,
      currentY,
      pageWidth - PDF_REPORT_LAYOUT.PAGE_MARGIN,
      currentY
    );
    currentY += 10;

    // 各画像を描画
    images.forEach((image, index) => {
      const { width, height } = calculateImageDimensions(
        image.imageInfo.width,
        image.imageInfo.height,
        maxImageWidth,
        maxImageHeight
      );

      // ページに収まるかチェック
      const requiredHeight = height + 20; // 画像 + キャプション
      if (currentY + requiredHeight > pageHeight - PDF_REPORT_LAYOUT.PAGE_MARGIN - 20) {
        // 新しいページを追加
        doc.addPage();
        currentY = PDF_REPORT_LAYOUT.PAGE_MARGIN + 10;
      }

      // 画像を中央揃えで配置
      const imageX = PDF_REPORT_LAYOUT.PAGE_MARGIN + (contentWidth - width) / 2;

      try {
        // 画像を追加
        doc.addImage(image.dataUrl, 'JPEG', imageX, currentY, width, height);
      } catch {
        // 画像追加に失敗した場合はプレースホルダーを表示
        doc.setDrawColor(200, 200, 200);
        doc.setFillColor(240, 240, 240);
        doc.rect(imageX, currentY, width, height, 'FD');
        doc.setFontSize(PDF_REPORT_LAYOUT.BODY_FONT_SIZE);
        doc.setTextColor(150, 150, 150);
        doc.text('画像を読み込めませんでした', imageX + width / 2, currentY + height / 2, {
          align: 'center',
        });
      }

      currentY += height + 5;

      // キャプション（ファイル名と番号）
      doc.setFontSize(PDF_REPORT_LAYOUT.SMALL_FONT_SIZE);
      doc.setTextColor(80, 80, 80);
      const caption = `図${index + 1}: ${image.imageInfo.fileName}`;
      doc.text(caption, pageWidth / 2, currentY, { align: 'center' });
      currentY += PDF_REPORT_LAYOUT.IMAGE_MARGIN + 10;
    });

    return currentY;
  }

  /**
   * ページ番号を描画する
   *
   * 全ページにページ番号（n / N 形式）を追加する。
   *
   * @param doc jsPDFインスタンス
   */
  renderPageNumbers(doc: jsPDF): void {
    const totalPages = doc.getNumberOfPages();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();

    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setFontSize(PDF_REPORT_LAYOUT.SMALL_FONT_SIZE);
      doc.setTextColor(120, 120, 120);
      const pageNumberText = `${i} / ${totalPages}`;
      doc.text(pageNumberText, pageWidth / 2, pageHeight - 10, { align: 'center' });
    }
  }

  // ==========================================================================
  // Task 28.2: 3組レイアウト用メソッド
  // ==========================================================================

  /**
   * コメントを描画する（Task 28.2用）
   *
   * 要件11.6: 各写真に紐付けられたコメントをPDFに含める
   * コメント最大行数制限とオーバーフロー処理を行う。
   *
   * @param doc jsPDFインスタンス
   * @param comment コメント文字列（nullまたは空の場合は何も描画しない）
   * @param x X座標
   * @param y Y座標
   * @param maxWidth 最大幅
   */
  renderComment(doc: jsPDF, comment: string | null, x: number, y: number, maxWidth: number): void {
    if (!comment || comment.trim() === '') {
      return;
    }

    doc.setFontSize(PDF_REPORT_LAYOUT_V2.COMMENT_FONT_SIZE);
    doc.setTextColor(30, 30, 30);

    // テキストを折り返して行配列を取得
    const lines: string[] = doc.splitTextToSize(comment, maxWidth);

    // 最大行数で切り捨て
    const truncatedLines = truncateCommentLines(lines, PDF_REPORT_LAYOUT_V2.COMMENT_MAX_LINES);

    // 各行を描画
    let currentY = y;
    const lineHeight =
      PDF_REPORT_LAYOUT_V2.COMMENT_FONT_SIZE * PDF_REPORT_LAYOUT_V2.COMMENT_LINE_HEIGHT * 0.352778; // pt to mm

    for (const line of truncatedLines) {
      doc.text(line, x, currentY);
      currentY += lineHeight;
    }
  }

  /**
   * 3組レイアウトで画像セクションを描画する（Task 28.2用）
   *
   * 要件11.5: 1ページあたり3組の写真+コメント配置
   * 画像を左側に配置し、コメントを右側に配置する。
   * サンプルPDFの書式に準拠：No.通番、下線、点線罫線
   *
   * @param doc jsPDFインスタンス
   * @param images コメント付き注釈画像の配列
   * @param startY 開始Y座標
   * @returns 描画終了時のY座標
   */
  renderImagesSection3PerPage(
    doc: jsPDF,
    images: AnnotatedImageWithComment[],
    startY: number
  ): number {
    if (images.length === 0) {
      return startY;
    }

    const pageWidth = doc.internal.pageSize.getWidth();
    const contentWidth = pageWidth - PDF_REPORT_LAYOUT_V2.PAGE_MARGIN * 2;
    const imageWidth = contentWidth * PDF_REPORT_LAYOUT_V2.IMAGE_WIDTH_RATIO;
    const commentAreaWidth = contentWidth * PDF_REPORT_LAYOUT_V2.COMMENT_WIDTH_RATIO;

    // 罫線設定
    const DOTTED_LINE_COUNT = 8; // 点線罫線の行数
    const DOTTED_LINE_SPACING = 6.5; // 点線罫線の行間（mm）

    let currentY = startY;

    for (let i = 0; i < images.length; i++) {
      const image = images[i];
      if (!image) continue;

      // 3組ごとに新しいページ
      if (i > 0 && i % PDF_REPORT_LAYOUT_V2.IMAGES_PER_PAGE === 0) {
        doc.addPage();
        currentY = PDF_REPORT_LAYOUT_V2.PAGE_MARGIN + PDF_REPORT_LAYOUT_V2.HEADER_HEIGHT;
      }

      // 画像のX座標（左側配置）
      const imageX = PDF_REPORT_LAYOUT_V2.PAGE_MARGIN;

      // 画像サイズを計算
      const { width, height } = calculateImageDimensions(
        image.imageInfo.width,
        image.imageInfo.height,
        imageWidth,
        PDF_REPORT_LAYOUT_V2.IMAGE_MAX_HEIGHT
      );

      try {
        // 画像を追加
        doc.addImage(image.dataUrl, 'JPEG', imageX, currentY, width, height);
      } catch {
        // 画像追加に失敗した場合はプレースホルダーを表示
        doc.setDrawColor(200, 200, 200);
        doc.setFillColor(240, 240, 240);
        doc.rect(imageX, currentY, width, height, 'FD');
        doc.setFontSize(PDF_REPORT_LAYOUT.BODY_FONT_SIZE);
        doc.setTextColor(150, 150, 150);
        doc.text('画像を読み込めませんでした', imageX + width / 2, currentY + height / 2, {
          align: 'center',
        });
      }

      // コメントエリアのX座標（右側配置）
      const commentX = imageX + imageWidth + 10;
      let commentY = currentY;

      // No.通番を描画（太字）
      doc.setFontSize(11);
      doc.setTextColor(30, 30, 30);
      doc.text(`No.${i + 1}`, commentX, commentY + 4);

      // 通番の下に実線を描画
      commentY += 6;
      doc.setDrawColor(30, 30, 30);
      doc.setLineWidth(0.5);
      doc.line(commentX, commentY, commentX + commentAreaWidth - 10, commentY);

      // 点線罫線を描画（No.行から離してバランスを整える）
      commentY += 10;
      doc.setDrawColor(100, 100, 100);
      doc.setLineWidth(0.2);

      // コメントを行に分割
      const commentLines: string[] = image.comment
        ? doc.splitTextToSize(image.comment, commentAreaWidth - 15)
        : [];

      for (let lineIdx = 0; lineIdx < DOTTED_LINE_COUNT; lineIdx++) {
        const lineY = commentY + lineIdx * DOTTED_LINE_SPACING;

        // コメントテキストを罫線の上に描画（罫線より少し上）
        if (lineIdx < commentLines.length) {
          const commentText = commentLines[lineIdx];
          if (commentText) {
            doc.setFontSize(PDF_REPORT_LAYOUT_V2.COMMENT_FONT_SIZE);
            doc.setTextColor(30, 30, 30);
            doc.text(commentText, commentX, lineY - 1);
          }
        }

        // 点線罫線を描画
        this.drawDottedLine(doc, commentX, lineY, commentX + commentAreaWidth - 10, lineY);
      }

      // 次の行へ
      currentY += PDF_REPORT_LAYOUT_V2.ROW_HEIGHT + PDF_REPORT_LAYOUT_V2.ROW_GAP;
    }

    return currentY;
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
    const dotLength = 0.5; // 点の長さ
    const gapLength = 1.5; // 間隔
    const totalLength = Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
    const dx = (x2 - x1) / totalLength;
    const dy = (y2 - y1) / totalLength;

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

  /**
   * 調査報告書を3組レイアウトで生成する（Task 28.2用）
   *
   * 要件11.4: 1ページ目に表紙（サンプルPDF準拠）、2ページ目以降に画像+コメント3組
   *
   * @param doc jsPDFインスタンス
   * @param survey 現場調査詳細
   * @param images コメント付き注釈画像の配列
   * @param options 生成オプション
   * @returns jsPDFインスタンス
   */
  generateSurveyReport(
    doc: jsPDF,
    survey: SiteSurveyDetail,
    images: AnnotatedImageWithComment[],
    options: PdfReportOptions = {}
  ): jsPDF {
    // バリデーション
    if (!doc) {
      throw new Error('jsPDF instance is required');
    }
    if (!survey) {
      throw new Error('Survey detail is required');
    }

    // オプションのデフォルト値を設定
    const opts = {
      includeCoverPage: true, // サンプルPDF準拠の表紙を使用
      includeInfoSection: false, // 表紙に情報を含めるため基本情報セクションは不要
      includeImages: true,
      includePageNumbers: true,
      ...options,
    };

    // フォントを初期化（失敗時はデフォルトフォントを使用）
    try {
      initializePdfFonts(doc);
      doc.setFont(PDF_FONT_FAMILY);
    } catch (fontError) {
      console.warn('Failed to load Japanese font, using default font:', fontError);
      doc.setFont('helvetica');
    }

    let currentY: number = PDF_REPORT_LAYOUT_V2.PAGE_MARGIN;

    // 1ページ目: 表紙を描画（サンプルPDF準拠）
    if (opts.includeCoverPage) {
      this.renderCoverPage(doc, survey, images.length);
    }

    // 2ページ目以降: 画像+コメントを3組ずつ配置
    if (opts.includeImages && images.length > 0) {
      doc.addPage();
      currentY = PDF_REPORT_LAYOUT_V2.PAGE_MARGIN + PDF_REPORT_LAYOUT_V2.HEADER_HEIGHT;
      this.renderImagesSection3PerPage(doc, images, currentY);
    }

    // ページ番号を追加
    if (opts.includePageNumbers) {
      this.renderPageNumbers(doc);
    }

    return doc;
  }

  /**
   * PDF報告書を生成する
   *
   * 表紙、基本情報、画像一覧、ページ番号を含むPDF報告書を生成する。
   *
   * @param doc jsPDFインスタンス
   * @param survey 現場調査詳細
   * @param images 注釈付き画像の配列
   * @param options 生成オプション
   * @returns jsPDFインスタンス
   */
  generateReport(
    doc: jsPDF,
    survey: SiteSurveyDetail,
    images: AnnotatedImage[],
    options: PdfReportOptions = {}
  ): jsPDF {
    // バリデーション
    if (!doc) {
      throw new Error('jsPDF instance is required');
    }
    if (!survey) {
      throw new Error('Survey detail is required');
    }

    // オプションのデフォルト値を設定
    const opts = {
      includeCoverPage: true,
      includeInfoSection: true,
      includeImages: true,
      includePageNumbers: true,
      ...options,
    };

    // フォントを初期化（失敗時はデフォルトフォントを使用）
    try {
      initializePdfFonts(doc);
      doc.setFont(PDF_FONT_FAMILY);
    } catch (fontError) {
      console.warn('Failed to load Japanese font, using default font:', fontError);
      // デフォルトフォント（Helvetica）を使用
      doc.setFont('helvetica');
    }

    let currentY: number = PDF_REPORT_LAYOUT.PAGE_MARGIN;

    // 表紙を描画
    if (opts.includeCoverPage) {
      this.renderCoverPage(doc, survey);
      doc.addPage();
      currentY = PDF_REPORT_LAYOUT.PAGE_MARGIN + 10;
    }

    // 基本情報セクションを描画
    if (opts.includeInfoSection) {
      currentY = this.renderInfoSection(doc, survey, currentY);
    }

    // 画像一覧セクションを描画
    if (opts.includeImages) {
      this.renderImagesSection(doc, images, currentY);
    }

    // ページ番号を追加
    if (opts.includePageNumbers) {
      this.renderPageNumbers(doc);
    }

    return doc;
  }
}

// ============================================================================
// シングルトンインスタンス
// ============================================================================

/**
 * デフォルトのPdfReportServiceインスタンス
 */
let defaultService: PdfReportService | null = null;

/**
 * デフォルトのサービスインスタンスを取得
 */
function getDefaultService(): PdfReportService {
  if (!defaultService) {
    defaultService = new PdfReportService();
  }
  return defaultService;
}

/**
 * シングルトンインスタンスをリセットする（テスト用）
 */
export function resetPdfReportService(): void {
  defaultService = null;
}

// ============================================================================
// スタンドアロン関数
// ============================================================================

/**
 * PDF報告書を生成する（スタンドアロン関数）
 *
 * @param doc jsPDFインスタンス
 * @param survey 現場調査詳細
 * @param images 注釈付き画像の配列
 * @param options 生成オプション
 * @returns jsPDFインスタンス
 */
export function generatePdfReport(
  doc: jsPDF,
  survey: SiteSurveyDetail,
  images: AnnotatedImage[],
  options?: PdfReportOptions
): jsPDF {
  return getDefaultService().generateReport(doc, survey, images, options);
}

/**
 * 調査報告書を3組レイアウトで生成する（スタンドアロン関数、Task 28.2用）
 *
 * 要件11.4: 1ページ目に基本情報、2ページ目以降に画像+コメント3組
 *
 * @param doc jsPDFインスタンス
 * @param survey 現場調査詳細
 * @param images コメント付き注釈画像の配列
 * @param options 生成オプション
 * @returns jsPDFインスタンス
 */
export function generateSurveyReport(
  doc: jsPDF,
  survey: SiteSurveyDetail,
  images: AnnotatedImageWithComment[],
  options?: PdfReportOptions
): jsPDF {
  return getDefaultService().generateSurveyReport(doc, survey, images, options);
}

export default PdfReportService;
