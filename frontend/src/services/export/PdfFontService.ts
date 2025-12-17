/**
 * PdfFontService - jsPDF日本語フォント埋め込みサービス
 *
 * Task 21.1: 日本語フォント埋め込みを実装する
 * - Noto Sans JPフォントのサブセット化（約500KB）
 * - jsPDFへのフォント登録
 * - Base64エンコードによるバンドル
 *
 * @see design.md - ExportService日本語フォント埋め込み詳細
 * @see requirements.md - 要件10.6
 */

import type { jsPDF } from 'jspdf';

// Noto Sans JP フォントのBase64データをインポート
// サブセット化されたフォントファイル（約500KB）
import { NotoSansJPBase64 } from './fonts/noto-sans-jp-base64';

// ============================================================================
// 定数定義
// ============================================================================

/**
 * PDFフォントファミリー名
 *
 * jsPDFで使用するフォント名
 */
export const PDF_FONT_FAMILY = 'NotoSansJP';

/**
 * PDFフォント名（jsPDF内部で使用）
 */
export const PDF_FONT_NAME = 'NotoSansJP-Regular.ttf';

// ============================================================================
// 型定義
// ============================================================================

/**
 * フォント読み込みステータス
 */
export enum FontLoadStatus {
  /** 未読み込み */
  NOT_LOADED = 'not_loaded',
  /** 読み込み済み */
  LOADED = 'loaded',
  /** 読み込み失敗 */
  FAILED = 'failed',
}

// ============================================================================
// PdfFontServiceクラス
// ============================================================================

/**
 * PDF日本語フォントサービスクラス
 *
 * jsPDFに日本語フォント（Noto Sans JP）を埋め込み、
 * PDF報告書で日本語テキストを正しくレンダリングする。
 *
 * Requirements:
 * - 10.6: PDF報告書生成で日本語を正しく表示する
 */
export class PdfFontService {
  /** フォント読み込みステータス */
  private status: FontLoadStatus = FontLoadStatus.NOT_LOADED;

  /**
   * 現在のステータスを取得
   */
  getStatus(): FontLoadStatus {
    return this.status;
  }

  /**
   * フォントが読み込まれているかどうか
   */
  isLoaded(): boolean {
    return this.status === FontLoadStatus.LOADED;
  }

  /**
   * PDFフォントファミリー文字列を取得
   */
  getPdfFontFamily(): string {
    return PDF_FONT_FAMILY;
  }

  /**
   * jsPDFに日本語フォントを初期化する
   *
   * Base64エンコードされたNoto Sans JPフォントを
   * jsPDFのVFS（Virtual File System）に追加し、
   * フォントとして登録する。
   *
   * @param doc jsPDFインスタンス
   * @throws Error jsPDFインスタンスがnullまたはundefinedの場合
   */
  initialize(doc: jsPDF): void {
    // バリデーション
    if (!doc) {
      throw new Error('jsPDF instance is required');
    }

    // 既に初期化済みの場合はフォントのみ設定
    if (this.status === FontLoadStatus.LOADED) {
      doc.setFont(PDF_FONT_FAMILY);
      return;
    }

    try {
      // 1. フォントファイルをVFS（Virtual File System）に追加
      doc.addFileToVFS(PDF_FONT_NAME, NotoSansJPBase64);

      // 2. フォントを登録
      doc.addFont(PDF_FONT_NAME, PDF_FONT_FAMILY, 'normal');

      // 3. フォントを設定
      doc.setFont(PDF_FONT_FAMILY);

      // ステータスを更新
      this.status = FontLoadStatus.LOADED;
    } catch (error) {
      this.status = FontLoadStatus.FAILED;
      throw error;
    }
  }

  /**
   * 状態をリセットする（テスト用）
   */
  reset(): void {
    this.status = FontLoadStatus.NOT_LOADED;
  }
}

// ============================================================================
// シングルトンインスタンス
// ============================================================================

/**
 * デフォルトのPdfFontServiceインスタンス
 *
 * アプリケーション全体で共有されるシングルトンインスタンス
 */
let defaultService = new PdfFontService();

/**
 * シングルトンインスタンスをリセットする（テスト用）
 */
export function resetPdfFontService(): void {
  defaultService = new PdfFontService();
}

// ============================================================================
// スタンドアロン関数
// ============================================================================

/**
 * jsPDFにPDFフォントを初期化する（スタンドアロン関数）
 *
 * @param doc jsPDFインスタンス
 */
export function initializePdfFonts(doc: jsPDF): void {
  defaultService.initialize(doc);
}

/**
 * PDFフォントが読み込まれているかどうか（スタンドアロン関数）
 *
 * @returns 読み込まれている場合true
 */
export function isPdfFontLoaded(): boolean {
  return defaultService.isLoaded();
}

/**
 * PDFフォントファミリー文字列を取得（スタンドアロン関数）
 *
 * @returns PDFフォントファミリー名
 */
export function getPdfFontFamily(): string {
  return defaultService.getPdfFontFamily();
}

export default PdfFontService;
