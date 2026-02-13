/**
 * @fileoverview PDFテキスト抽出ロジック（pdfjs-distベース）
 *
 * Task 40.1: pdfjs-distベースのPDFテキスト抽出処理
 * Task 40.2: テキストPDF/スキャンPDF判定とハイブリッド処理フロー
 * Task 40.3: スキャンPDFフォールバック（Canvas→画像→Tesseract OCR）
 *
 * Requirements:
 * - 17.1: pdfjs-distのgetTextContent() APIを使用してPDFからテキストを抽出する
 * - 17.2: PDFの全ページ（1ページ目から最終ページ）を対象にテキスト抽出を行う
 * - 17.3: テキストPDFの場合は抽出テキストをそのまま使用する
 * - 17.4: スキャンPDFの場合はCanvas→Tesseract OCRフォールバックを実行する
 */

// pdfjs-dist worker設定のインポート（副作用インポート）
import './pdf-worker-config';
import { getDocument } from 'pdfjs-dist';
import type { TextItem } from 'pdfjs-dist/types/src/display/api';

// ============================================================================
// 定数
// ============================================================================

/**
 * テキストPDF/スキャンPDF判定の閾値（文字数）
 * 空白を除いた文字数がこの閾値以上であればテキストPDFと判定する
 */
export const PDF_TEXT_THRESHOLD = 50;

/**
 * スキャンPDFフォールバック時のCanvas描画スケール
 * scale 2.0でOCR精度を向上させる
 */
const CANVAS_RENDER_SCALE = 2.0;

// ============================================================================
// 型定義
// ============================================================================

/**
 * PDFテキスト抽出の結果
 */
export interface PdfTextExtractionResult {
  /** 抽出テキスト */
  text: string;
  /** テキストPDFかスキャンPDFか */
  isTextPdf: boolean;
  /** 総ページ数 */
  numPages: number;
}

/**
 * 進捗通知コールバック
 */
export type ProgressCallback = (progress: number, message?: string) => void;

// ============================================================================
// pdfjs-distによるテキスト抽出
// ============================================================================

/**
 * pdfjs-distのgetTextContent() APIを使用してPDFから全ページのテキストを抽出する
 *
 * @param file - 処理対象のPDFファイル
 * @returns 抽出テキスト
 */
export async function extractPdfText(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await getDocument({ data: new Uint8Array(arrayBuffer) }).promise;

  const pageTexts: string[] = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();

    // テキストアイテムのstrプロパティを結合してテキストを構築
    const pageText = textContent.items
      .filter((item): item is TextItem => 'str' in item)
      .map((item) => item.str)
      .join(' ');

    pageTexts.push(pageText);
  }

  // ページ間の区切りとして改行を挿入
  return pageTexts.join('\n');
}

// ============================================================================
// スキャンPDFフォールバック（Canvas→画像→Tesseract OCR）
// ============================================================================

/**
 * スキャンPDFの各ページをCanvas描画→画像変換→Tesseract OCRで処理する
 *
 * @param file - 処理対象のPDFファイル
 * @param onProgress - 進捗通知コールバック
 * @returns OCR抽出テキスト
 */
export async function extractPdfWithOcrFallback(
  file: File,
  onProgress?: ProgressCallback
): Promise<string> {
  const { createWorker } = await import('tesseract.js');

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await getDocument({ data: new Uint8Array(arrayBuffer) }).promise;

  // Tesseract.jsワーカーの初期化
  const worker = await createWorker('jpn');

  try {
    const pageTexts: string[] = [];

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      // 進捗通知
      if (onProgress) {
        const progressPercent = Math.round((pageNum / pdf.numPages) * 60) + 30;
        onProgress(progressPercent, `${pageNum}/${pdf.numPages}ページ処理中...`);
      }

      const page = await pdf.getPage(pageNum);
      const viewport = page.getViewport({ scale: CANVAS_RENDER_SCALE });

      // Canvas要素を動的に作成
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const context = canvas.getContext('2d');

      if (!context) {
        throw new Error('Canvas 2Dコンテキストの取得に失敗しました');
      }

      // PDFページをCanvas上に描画
      await page.render({ canvas, viewport }).promise;

      // Canvas描画結果をPNG画像に変換
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((b) => {
          if (b) {
            resolve(b);
          } else {
            reject(new Error('Canvas画像変換に失敗しました'));
          }
        }, 'image/png');
      });

      // Canvas参照を即座に解放してメモリを節約
      canvas.width = 0;
      canvas.height = 0;

      // Tesseract.jsでOCR処理
      const imageFile = new File([blob], `page-${pageNum}.png`, { type: 'image/png' });
      const result = await worker.recognize(imageFile);
      pageTexts.push(result.data.text);
    }

    return pageTexts.join('\n');
  } finally {
    // ワーカーを終了してメモリを解放
    await worker.terminate();
  }
}

// ============================================================================
// ハイブリッド処理フロー
// ============================================================================

/**
 * PDFテキスト抽出のハイブリッドアプローチ
 *
 * 1. pdfjs-distでテキスト抽出を試行
 * 2. テキスト文字数が閾値以上 → テキストPDF（そのまま使用）
 * 3. テキスト文字数が閾値未満 → スキャンPDF（Canvas→Tesseract OCRフォールバック）
 *
 * @param file - 処理対象のPDFファイル
 * @param onProgress - 進捗通知コールバック
 * @returns テキスト抽出結果
 */
export async function extractPdfHybrid(
  file: File,
  onProgress?: ProgressCallback
): Promise<PdfTextExtractionResult> {
  if (onProgress) {
    onProgress(10, 'PDFテキスト抽出中...');
  }

  // Step 1: pdfjs-distでテキスト抽出
  const pdfText = await extractPdfText(file);

  // Step 2: 閾値判定（空白を除いた文字数）
  const textLengthWithoutSpaces = pdfText.replace(/\s/g, '').length;
  const isTextPdf = textLengthWithoutSpaces >= PDF_TEXT_THRESHOLD;

  // PDFのページ数を取得
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
  const numPages = pdf.numPages;

  if (isTextPdf) {
    // テキストPDF: pdfjs-dist抽出テキストをそのまま使用
    if (onProgress) {
      onProgress(100, 'テキスト抽出完了');
    }
    return { text: pdfText, isTextPdf: true, numPages };
  }

  // Step 3: スキャンPDFフォールバック
  if (onProgress) {
    onProgress(25, 'スキャンPDF検出、OCR処理を開始...');
  }
  const ocrText = await extractPdfWithOcrFallback(file, onProgress);

  return { text: ocrText, isTextPdf: false, numPages };
}
