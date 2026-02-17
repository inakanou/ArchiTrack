/**
 * @fileoverview PDFテキスト抽出ロジック（pdfjs-distベース）
 *
 * Task 40.1: pdfjs-distベースのPDFテキスト抽出処理
 * Task 40.2: テキストPDF/スキャンPDF判定とハイブリッド処理フロー
 * Task 40.3: スキャンPDFフォールバック（Canvas→画像→Tesseract OCR）
 * Task 44.1: Canvas描画スケールの引き上げ（2.0→4.0）
 * Task 44.2: グレースケール変換関数の実装
 * Task 44.3: 大津の二値化関数の実装
 * Task 44.4: 水平線除去関数の実装
 * Task 44.5: 垂直線除去関数の実装
 * Task 44.6: 画像前処理パイプライン統合関数の実装
 * Task 44.7: extractPdfWithOcrFallback関数への画像前処理パイプライン統合
 *
 * Requirements:
 * - 17.1: pdfjs-distのgetTextContent() APIを使用してPDFからテキストを抽出する
 * - 17.2: PDFの全ページ（1ページ目から最終ページ）を対象にテキスト抽出を行う
 * - 17.3: テキストPDFの場合は抽出テキストをそのまま使用する
 * - 17.4: スキャンPDFの場合はCanvas→Tesseract OCRフォールバックを実行する
 * - 19.1: Canvas描画スケールを2.0から4.0に引き上げる
 * - 19.2: グレースケール変換（RGB加重平均: 0.299R + 0.587G + 0.114B）
 * - 19.3: 大津の二値化（Otsu's binarization）
 * - 19.4: 水平線除去（画像幅の30%以上の連続黒ピクセルを白に置換）
 * - 19.5: 垂直線除去（画像高さの30%以上の連続黒ピクセルを白に置換）
 * - 19.6: 画像前処理パイプライン（グレースケール→大津の二値化→水平線除去→垂直線除去）
 * - 19.7: 新規外部依存なし（Canvas APIのみ使用）
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
 * スキャンPDFフォールバック時のCanvas描画スケール（Tesseract OCR用）
 * Task 44.1: scale 2.0から4.0に引き上げて高解像度化によりOCR認識精度を向上
 * Requirements: 19.1
 */
const CANVAS_RENDER_SCALE = 4.0;

/**
 * Claude Vision API用のCanvas描画スケール
 * Claude Visionは高解像度を必要としないため2.0で十分。
 * 4.0だと画像が巨大になりAPIトークン上限に達して全ページが処理されない場合がある。
 */
const CLAUDE_VISION_RENDER_SCALE = 2.0;

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
// 画像前処理パイプライン（Task 44.2-44.6, Requirements 19.2-19.6）
// Canvas APIのgetImageData/putImageDataのみを使用（19.7: 新規外部依存なし）
// ============================================================================

/**
 * ImageDataをグレースケールに変換する（インプレース）
 *
 * RGB加重平均（0.299R + 0.587G + 0.114B）で各ピクセルを変換する。
 * 人間の視覚に合わせた輝度変換の標準的な重み付けを使用。
 *
 * Task 44.2, Requirement 19.2
 *
 * @param imageData - 変換対象のImageData（インプレースで変更される）
 */
export function toGrayscale(imageData: ImageData): void {
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i] ?? 0;
    const g = data[i + 1] ?? 0;
    const b = data[i + 2] ?? 0;
    const gray = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
    data[i] = gray;
    data[i + 1] = gray;
    data[i + 2] = gray;
    // alphaチャネル（data[i+3]）はそのまま
  }
}

/**
 * 大津の二値化（Otsu's binarization）を適用する（インプレース）
 *
 * 256階調のヒストグラムを構築し、クラス間分散を最大化する閾値を算出して
 * 各ピクセルを0（黒）または255（白）に変換する。
 *
 * Task 44.3, Requirement 19.3
 *
 * @param imageData - 変換対象のImageData（グレースケール済み前提、インプレースで変更される）
 */
export function otsuBinarize(imageData: ImageData): void {
  const data = imageData.data;
  const totalPixels = imageData.width * imageData.height;

  // Step 1: 256階調のヒストグラムを構築
  const histogram = new Array<number>(256).fill(0);
  for (let i = 0; i < data.length; i += 4) {
    const pixelValue = data[i] ?? 0;
    histogram[pixelValue] = (histogram[pixelValue] ?? 0) + 1;
  }

  // Step 2: クラス間分散を最大化する閾値を算出
  let bestThreshold = 0;
  let maxVariance = 0;

  let w0 = 0; // クラス0（背景）の重み
  let sum0 = 0; // クラス0の輝度合計
  let totalSum = 0; // 全体の輝度合計

  for (let t = 0; t < 256; t++) {
    totalSum += t * (histogram[t] ?? 0);
  }

  for (let t = 0; t < 256; t++) {
    const histCount = histogram[t] ?? 0;
    w0 += histCount;
    if (w0 === 0) continue;

    const w1 = totalPixels - w0;
    if (w1 === 0) break;

    sum0 += t * histCount;
    const mean0 = sum0 / w0;
    const mean1 = (totalSum - sum0) / w1;

    // クラス間分散
    const variance = w0 * w1 * (mean0 - mean1) * (mean0 - mean1);

    if (variance > maxVariance) {
      maxVariance = variance;
      bestThreshold = t;
    }
  }

  // Step 3: 閾値に基づき二値化
  for (let i = 0; i < data.length; i += 4) {
    const binaryValue = (data[i] ?? 0) > bestThreshold ? 255 : 0;
    data[i] = binaryValue;
    data[i + 1] = binaryValue;
    data[i + 2] = binaryValue;
  }
}

/**
 * 水平線を除去する（インプレース）
 *
 * 各行を左から右へ走査し、連続する黒ピクセル（R=0）のランレングスが
 * 画像幅×minLengthRatio以上の場合、そのランを白ピクセル（255）で置換する。
 *
 * Task 44.4, Requirement 19.4
 *
 * @param imageData - 変換対象のImageData（二値化済み前提、インプレースで変更される）
 * @param minLengthRatio - 除去対象とするランの最小長さ比率（デフォルト: 0.3 = 30%）
 */
export function removeHorizontalLines(imageData: ImageData, minLengthRatio: number = 0.3): void {
  const { data, width, height } = imageData;
  const minLength = Math.floor(width * minLengthRatio);

  for (let y = 0; y < height; y++) {
    let runStart = -1;
    let runLength = 0;

    for (let x = 0; x <= width; x++) {
      const idx = (y * width + x) * 4;
      const isBlack = x < width && data[idx] === 0;

      if (isBlack) {
        if (runStart === -1) {
          runStart = x;
          runLength = 1;
        } else {
          runLength++;
        }
      } else {
        // ランの終了: 閾値以上なら白に置換
        if (runStart !== -1 && runLength >= minLength) {
          for (let rx = runStart; rx < runStart + runLength; rx++) {
            const rIdx = (y * width + rx) * 4;
            data[rIdx] = 255;
            data[rIdx + 1] = 255;
            data[rIdx + 2] = 255;
          }
        }
        runStart = -1;
        runLength = 0;
      }
    }
  }
}

/**
 * 垂直線を除去する（インプレース）
 *
 * 各列を上から下へ走査し、連続する黒ピクセル（R=0）のランレングスが
 * 画像高さ×minLengthRatio以上の場合、そのランを白ピクセル（255）で置換する。
 *
 * Task 44.5, Requirement 19.5
 *
 * @param imageData - 変換対象のImageData（二値化済み前提、インプレースで変更される）
 * @param minLengthRatio - 除去対象とするランの最小長さ比率（デフォルト: 0.3 = 30%）
 */
export function removeVerticalLines(imageData: ImageData, minLengthRatio: number = 0.3): void {
  const { data, width, height } = imageData;
  const minLength = Math.floor(height * minLengthRatio);

  for (let x = 0; x < width; x++) {
    let runStart = -1;
    let runLength = 0;

    for (let y = 0; y <= height; y++) {
      const idx = (y * width + x) * 4;
      const isBlack = y < height && data[idx] === 0;

      if (isBlack) {
        if (runStart === -1) {
          runStart = y;
          runLength = 1;
        } else {
          runLength++;
        }
      } else {
        // ランの終了: 閾値以上なら白に置換
        if (runStart !== -1 && runLength >= minLength) {
          for (let ry = runStart; ry < runStart + runLength; ry++) {
            const rIdx = (ry * width + x) * 4;
            data[rIdx] = 255;
            data[rIdx + 1] = 255;
            data[rIdx + 2] = 255;
          }
        }
        runStart = -1;
        runLength = 0;
      }
    }
  }
}

/**
 * 画像前処理パイプライン統合関数
 *
 * グレースケール変換 → 大津の二値化 → 水平線除去 → 垂直線除去
 * の4ステップを順次実行する。入力のImageDataをインプレースで変更し、同じ参照を返す。
 *
 * Task 44.6, Requirement 19.6
 *
 * @param imageData - 処理対象のImageData（インプレースで変更される）
 * @returns 同じImageData参照（前処理済み）
 */
export function preprocessImageData(imageData: ImageData): ImageData {
  toGrayscale(imageData);
  otsuBinarize(imageData);
  removeHorizontalLines(imageData);
  removeVerticalLines(imageData);
  return imageData;
}

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

      // Task 44.7: 画像前処理パイプラインの適用（Requirements 19.6, 19.7）
      // Canvas描画後、toBlob()前にImageDataを取得して前処理を実行
      const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
      preprocessImageData(imageData);
      context.putImageData(imageData, 0, 0);

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

// ============================================================================
// Claude Vision用: PDFページをBase64画像に変換
// Task 54.1, Requirement 24.3
// ============================================================================

/** PDFページをBase64画像に変換する際の最大ページ数 */
const MAX_PAGES_FOR_VISION = 20;

/**
 * PDFファイルの各ページをCanvas APIで画像に変換しBase64エンコードする
 *
 * 既存のextractPdfWithOcrFallback関数内のCanvas描画ロジックを再利用可能な形で切り出し。
 * Claude Vision APIに送信するための画像データ配列を返す。
 *
 * Task 54.1, Requirement 24.3
 *
 * @param file - 処理対象のPDFファイル
 * @returns Base64エンコードされた画像データの配列（最大20ページ）
 */
export async function renderPdfPagesToBase64(
  file: File
): Promise<Array<{ base64Data: string; mediaType: 'image/jpeg' }>> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await getDocument({ data: new Uint8Array(arrayBuffer) }).promise;

  const pagesToRender = Math.min(pdf.numPages, MAX_PAGES_FOR_VISION);
  const results: Array<{ base64Data: string; mediaType: 'image/jpeg' }> = [];

  for (let pageNum = 1; pageNum <= pagesToRender; pageNum++) {
    const page = await pdf.getPage(pageNum);
    // Claude Vision用の適切なスケール（Tesseract用の4.0ではなく2.0）
    const viewport = page.getViewport({ scale: CLAUDE_VISION_RENDER_SCALE });

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

    // Canvas描画結果をJPEG画像に変換（PNGより軽量でAPI送信に適する）
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);

    // data:image/jpeg;base64, プレフィックスを除去
    const base64Data = dataUrl.replace(/^data:image\/jpeg;base64,/, '');

    // Canvas参照を即座に解放してメモリを節約
    canvas.width = 0;
    canvas.height = 0;

    results.push({
      base64Data,
      mediaType: 'image/jpeg' as const,
    });
  }

  return results;
}
