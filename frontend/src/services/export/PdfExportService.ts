/**
 * PdfExportService - PDF報告書エクスポートサービス
 *
 * Task 21.3: PDF生成・ダウンロードを実装する
 * - jsPDFによるクライアントサイド生成
 * - プログレス表示（大量画像時）
 * - ダウンロードトリガー
 *
 * @see design.md - ExportService
 * @see requirements.md - 要件10.6
 */

import { jsPDF } from 'jspdf';
import type { SiteSurveyDetail } from '../../types/site-survey.types';
import type { AnnotatedImage, PdfReportOptions } from './PdfReportService';
import { generatePdfReport } from './PdfReportService';

// ============================================================================
// 定数定義
// ============================================================================

/**
 * PDFエクスポートフェーズ定数
 *
 * 進捗報告用のフェーズ識別子
 */
export const PDF_EXPORT_PHASES = {
  /** 初期化中 */
  INITIALIZING: 'initializing',
  /** PDF生成中 */
  GENERATING: 'generating',
  /** 最終処理中 */
  FINALIZING: 'finalizing',
  /** 完了 */
  COMPLETE: 'complete',
} as const;

/**
 * PDFエクスポートフェーズ型
 */
export type PdfExportPhase = (typeof PDF_EXPORT_PHASES)[keyof typeof PDF_EXPORT_PHASES];

// ============================================================================
// 型定義
// ============================================================================

/**
 * PDFエクスポート進捗情報
 *
 * 大量画像処理時のプログレス表示に使用
 */
export interface PdfExportProgress {
  /** 現在のフェーズ */
  phase: PdfExportPhase;
  /** 現在の処理インデックス */
  current: number;
  /** 総処理数 */
  total: number;
  /** 進捗パーセント（0-100） */
  percent: number;
  /** フェーズの説明メッセージ */
  message?: string;
}

/**
 * PDFエクスポートオプション
 *
 * PdfReportOptionsを拡張し、ダウンロード・進捗オプションを追加
 */
export interface PdfExportOptions extends PdfReportOptions {
  /** 進捗コールバック */
  onProgress?: (progress: PdfExportProgress) => void;
  /** ダウンロード時のファイル名 */
  filename?: string;
}

// ============================================================================
// PdfExportServiceクラス
// ============================================================================

/**
 * PDF報告書エクスポートサービスクラス
 *
 * 現場調査のPDF報告書をクライアントサイドで生成し、
 * ダウンロードを実行する。大量画像の処理時は進捗を報告する。
 *
 * Requirements:
 * - 10.6: PDF報告書生成（日本語対応）
 */
export class PdfExportService {
  /**
   * PDF報告書をエクスポートする
   *
   * jsPDFを使用してPDF報告書を生成し、Blobとして返す。
   * 大量画像の処理時は進捗コールバックで進捗を報告する。
   *
   * @param survey 現場調査詳細
   * @param images 注釈付き画像の配列
   * @param options エクスポートオプション
   * @returns PDF Blob
   * @throws Error surveyがnullの場合
   */
  async exportPdf(
    survey: SiteSurveyDetail,
    images: AnnotatedImage[],
    options: PdfExportOptions = {}
  ): Promise<Blob> {
    // バリデーション
    if (!survey) {
      throw new Error('Survey detail is required');
    }

    const { onProgress, ...reportOptions } = options;

    // フェーズ1: 初期化
    this.reportProgress(onProgress, {
      phase: PDF_EXPORT_PHASES.INITIALIZING,
      current: 0,
      total: images.length + 2, // 画像数 + 初期化 + 最終処理
      percent: 0,
      message: 'PDF生成を初期化中...',
    });

    // jsPDFインスタンスを作成（A4サイズ、縦向き、mm単位）
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    });

    // フェーズ2: PDF生成
    this.reportProgress(onProgress, {
      phase: PDF_EXPORT_PHASES.GENERATING,
      current: 1,
      total: images.length + 2,
      percent: Math.round((1 / (images.length + 2)) * 100),
      message: 'PDF報告書を生成中...',
    });

    // PdfReportServiceを使用してPDFを生成
    generatePdfReport(doc, survey, images, reportOptions);

    // 画像ごとの進捗報告（大量画像対応）
    if (images.length > 0 && onProgress) {
      for (let i = 0; i < images.length; i++) {
        this.reportProgress(onProgress, {
          phase: PDF_EXPORT_PHASES.GENERATING,
          current: i + 2,
          total: images.length + 2,
          percent: Math.round(((i + 2) / (images.length + 2)) * 100),
          message: `画像を処理中... (${i + 1}/${images.length})`,
        });
        // 大量画像の場合、UIをブロックしないように少し待機
        if (images.length > 5) {
          await this.sleep(0);
        }
      }
    }

    // フェーズ3: 最終処理
    this.reportProgress(onProgress, {
      phase: PDF_EXPORT_PHASES.FINALIZING,
      current: images.length + 1,
      total: images.length + 2,
      percent: 95,
      message: 'PDFを最終処理中...',
    });

    // PDFをBlobとして出力
    const blob = doc.output('blob');

    // フェーズ4: 完了
    this.reportProgress(onProgress, {
      phase: PDF_EXPORT_PHASES.COMPLETE,
      current: images.length + 2,
      total: images.length + 2,
      percent: 100,
      message: 'PDF生成完了',
    });

    return blob;
  }

  /**
   * PDFをダウンロードする
   *
   * Blobからダウンロードリンクを作成し、ブラウザのダウンロード機能を起動する。
   *
   * @param blob PDF Blob
   * @param filename ダウンロードファイル名（デフォルト: 'report.pdf'）
   */
  downloadPdf(blob: Blob, filename: string = 'report.pdf'): void {
    // Object URLを作成
    const objectUrl = URL.createObjectURL(blob);

    // アンカー要素を作成
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = filename;

    // ダウンロードをトリガー
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    // Object URLを解放
    URL.revokeObjectURL(objectUrl);
  }

  /**
   * PDF報告書を生成してダウンロードする（一括実行）
   *
   * エクスポートとダウンロードを一括で実行する便利メソッド。
   *
   * @param survey 現場調査詳細
   * @param images 注釈付き画像の配列
   * @param options エクスポートオプション
   */
  async exportAndDownloadPdf(
    survey: SiteSurveyDetail,
    images: AnnotatedImage[],
    options: PdfExportOptions = {}
  ): Promise<void> {
    const blob = await this.exportPdf(survey, images, options);
    const filename = options.filename || this.generateDefaultFilename(survey);
    this.downloadPdf(blob, filename);
  }

  /**
   * デフォルトのファイル名を生成する
   *
   * 調査名と調査日を使用してファイル名を生成する。
   * ファイル名に使用できない文字は置換される。
   *
   * @param survey 現場調査詳細
   * @returns ファイル名
   */
  generateDefaultFilename(survey: SiteSurveyDetail): string {
    // 調査名をサニタイズ（ファイル名に使用できない文字を置換）
    const sanitizedName = this.sanitizeFilename(survey.name);

    // 調査日をフォーマット（YYYY-MM-DD形式のまま、またはYYYYMMDD形式）
    const dateStr = survey.surveyDate.replace(/-/g, '');

    return `${sanitizedName}_${dateStr}.pdf`;
  }

  /**
   * ファイル名をサニタイズする
   *
   * ファイル名に使用できない文字を安全な文字に置換する。
   *
   * @param filename 元のファイル名
   * @returns サニタイズされたファイル名
   */
  private sanitizeFilename(filename: string): string {
    // ファイル名に使用できない文字を置換
    // Windows: \ / : * ? " < > |
    // Unix: /
    return filename
      .replace(/[\\/:*?"<>|]/g, '_')
      .replace(/\s+/g, '_')
      .replace(/_+/g, '_')
      .trim();
  }

  /**
   * 進捗を報告する
   *
   * コールバックが設定されている場合のみ進捗を報告する。
   *
   * @param callback 進捗コールバック
   * @param progress 進捗情報
   */
  private reportProgress(
    callback: ((progress: PdfExportProgress) => void) | undefined,
    progress: PdfExportProgress
  ): void {
    if (callback) {
      callback(progress);
    }
  }

  /**
   * 指定ミリ秒待機する
   *
   * 大量画像処理時にUIをブロックしないための待機処理。
   *
   * @param ms 待機ミリ秒（0の場合はマイクロタスク終了後に実行）
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// ============================================================================
// シングルトンインスタンス
// ============================================================================

/**
 * デフォルトのPdfExportServiceインスタンス
 */
let defaultService: PdfExportService | null = null;

/**
 * デフォルトのサービスインスタンスを取得
 */
function getDefaultService(): PdfExportService {
  if (!defaultService) {
    defaultService = new PdfExportService();
  }
  return defaultService;
}

/**
 * シングルトンインスタンスをリセットする（テスト用）
 */
export function resetPdfExportService(): void {
  defaultService = null;
}

// ============================================================================
// スタンドアロン関数
// ============================================================================

/**
 * PDF報告書をエクスポートする（スタンドアロン関数）
 *
 * @param survey 現場調査詳細
 * @param images 注釈付き画像の配列
 * @param options エクスポートオプション
 * @returns PDF Blob
 */
export function exportPdf(
  survey: SiteSurveyDetail,
  images: AnnotatedImage[],
  options?: PdfExportOptions
): Promise<Blob> {
  return getDefaultService().exportPdf(survey, images, options);
}

/**
 * PDFをダウンロードする（スタンドアロン関数）
 *
 * @param blob PDF Blob
 * @param filename ダウンロードファイル名
 */
export function downloadPdf(blob: Blob, filename?: string): void {
  getDefaultService().downloadPdf(blob, filename);
}

/**
 * PDF報告書を生成してダウンロードする（スタンドアロン関数）
 *
 * @param survey 現場調査詳細
 * @param images 注釈付き画像の配列
 * @param options エクスポートオプション
 */
export function exportAndDownloadPdf(
  survey: SiteSurveyDetail,
  images: AnnotatedImage[],
  options?: PdfExportOptions
): Promise<void> {
  return getDefaultService().exportAndDownloadPdf(survey, images, options);
}

// Re-export for convenience
export { generatePdfReport } from './PdfReportService';

export default PdfExportService;
