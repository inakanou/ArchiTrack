/**
 * @fileoverview PDF OCR処理機能（数量表インポート用）
 *
 * Task 44.2: PDF OCR処理機能
 * Task 44.3: Claude Vision API連携によるPDF高精度抽出
 *
 * 受領見積書登録機能のpdf-text-extractor.tsのパイプラインを再利用する。
 *
 * Requirements:
 * - 29.1: pdfjs-distのgetTextContent() APIを使用してPDFからテキストを抽出する
 * - 29.2: PDFの全ページを対象にテキスト抽出を行う
 * - 29.3: テキストPDFの場合は抽出テキストをそのまま使用する
 * - 29.4: スキャンPDFの場合はCanvas→Tesseract OCRフォールバック
 * - 29.10: OCR処理のタイムアウトを30秒とする
 * - 30.1: Claude Vision APIが利用可能な場合は優先使用
 * - 30.5: API利用不可時のpdfjs-dist + Tesseract.jsフォールバック
 * - 30.6: APIタイムアウト時のフォールバック
 * - 30.7: 同一プレビューテーブル形式での表示
 */

import type { ImportExtractionResult, ImportExtractedRow } from '../../types/quantity-import.types';
import type { ProgressCallback } from '../estimate-requests/pdf-text-extractor';

/**
 * PDFファイルからOCR処理でデータを抽出する（Claude Vision API優先）
 *
 * 処理フロー:
 * 1. Claude Vision APIが利用可能か判定
 * 2. 利用可能: PDFページをBase64画像に変換 → Claude Vision API送信 → JSON抽出
 * 3. 利用不可/エラー: pdfjs-dist + Tesseract.jsフォールバック
 *
 * @param file PDFファイル
 * @param onProgress 進捗コールバック
 * @returns 抽出結果
 */
export async function extractPdfData(
  file: File,
  onProgress?: ProgressCallback
): Promise<ImportExtractionResult> {
  // Claude Vision API優先で試行
  try {
    if (onProgress) {
      onProgress(10, 'Claude Vision APIで解析中...');
    }

    const result = await extractWithClaudeVisionForQuantityTable(file, onProgress);
    return result;
  } catch {
    // Claude Vision API失敗時はpdfjs-dist + Tesseract.jsフォールバック
    if (onProgress) {
      onProgress(15, 'OCRフォールバック処理を開始...');
    }

    return extractWithOcrFallback(file, onProgress);
  }
}

/**
 * Claude Vision APIを使用してPDFから数量表データを抽出する
 */
async function extractWithClaudeVisionForQuantityTable(
  file: File,
  onProgress?: ProgressCallback
): Promise<ImportExtractionResult> {
  const { renderPdfPagesToBase64 } = await import('../estimate-requests/pdf-text-extractor');
  const { extractWithClaudeVisionForQuantityTable: callApi } =
    await import('../../api/claude-vision');

  if (onProgress) {
    onProgress(20, 'PDFページを画像に変換中...');
  }

  const pages = await renderPdfPagesToBase64(file);

  if (onProgress) {
    onProgress(40, 'Claude Vision APIで構造解析中...');
  }

  const response = await callApi(pages);

  if (onProgress) {
    onProgress(90, '抽出結果を整形中...');
  }

  // Claude Vision結果をImportExtractionResult形式に変換
  const headers = [
    '大項目',
    '中項目',
    '小項目',
    '任意分類',
    '工種',
    '名称',
    '規格',
    '数量',
    '単位',
    '備考',
  ];

  const rows: ImportExtractedRow[] = response.lineItems.map((item, index) => ({
    columns: [
      item.majorCategory ?? '',
      item.middleCategory ?? '',
      item.minorCategory ?? '',
      item.customCategory ?? '',
      item.workType ?? '',
      item.name ?? '',
      item.specification ?? '',
      item.quantity != null ? String(item.quantity) : '',
      item.unit ?? '',
      item.remarks ?? '',
    ],
    sourceRowIndex: index,
  }));

  if (onProgress) {
    onProgress(100, '抽出完了');
  }

  return {
    headers,
    rows,
    extractionType: 'pdf-claude-vision',
  };
}

/**
 * pdfjs-dist + Tesseract.jsによるOCRフォールバック
 */
async function extractWithOcrFallback(
  file: File,
  onProgress?: ProgressCallback
): Promise<ImportExtractionResult> {
  const { extractPdfHybrid } = await import('../estimate-requests/pdf-text-extractor');

  const pdfResult = await extractPdfHybrid(file, onProgress);

  // テキストから表構造を解析して行データに変換
  const rows = parseTextToRows(pdfResult.text);

  // ヘッダーの推定（行の最初のデータから）
  const headers = rows.length > 0 ? rows[0]!.columns.map((_, i) => `列${i + 1}`) : [];

  return {
    headers,
    rows,
    extractionType: pdfResult.isTextPdf ? 'pdf-text' : 'pdf-ocr',
  };
}

/**
 * テキストデータを行・列に分解する
 *
 * タブ区切りまたはスペース区切りの表構造を想定
 */
function parseTextToRows(text: string): ImportExtractedRow[] {
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const rows: ImportExtractedRow[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    // タブ区切りを優先、なければ複数スペース区切り
    const columns = line.includes('\t')
      ? line.split('\t').map((col) => col.trim())
      : line.split(/\s{2,}/).map((col) => col.trim());

    if (columns.length > 1) {
      rows.push({
        columns,
        sourceRowIndex: i,
      });
    }
  }

  return rows;
}
