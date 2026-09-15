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

import type {
  ImportExtractionResult,
  ImportExtractedRow,
  ImportTargetField,
} from '../../types/quantity-import.types';
import type { ProgressCallback } from '../estimate-requests/pdf-text-extractor';
import { autoDetectFieldMapping } from './field-mapping';

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
  const headers = [...PREVIEW_HEADERS];

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
  const rawRows = parseTextToRows(pdfResult.text);

  // Claude Vision 経路と同一のプレビューテーブル形式（10欄の名前付きヘッダー）へ揃える
  return {
    headers: [...PREVIEW_HEADERS],
    rows: alignRowsToPreviewFields(rawRows),
    extractionType: pdfResult.isTextPdf ? 'pdf-text' : 'pdf-ocr',
  };
}

/**
 * プレビューテーブルの10欄（並び順）。Claude Vision 経路とフォールバック経路が共有する。
 */
const PREVIEW_FIELDS: ReadonlyArray<{ field: ImportTargetField; header: string }> = [
  { field: 'majorCategory', header: '大項目' },
  { field: 'middleCategory', header: '中項目' },
  { field: 'minorCategory', header: '小項目' },
  { field: 'customCategory', header: '任意分類' },
  { field: 'workType', header: '工種' },
  { field: 'name', header: '名称' },
  { field: 'specification', header: '規格' },
  { field: 'quantity', header: '数量' },
  { field: 'unit', header: '単位' },
  { field: 'remarks', header: '備考' },
];

const PREVIEW_HEADERS: readonly string[] = PREVIEW_FIELDS.map((f) => f.header);

/**
 * 1行目を見出し行とみなすのに必要な、見出し語で当たった欄の種類の最小数。
 *
 * 1列だけの一致はデータ中の語（例: 「数量は概算」という備考）でも起こりうる。
 * 誤って見出し行とみなすと、当たらない列を捨てる規則によりデータの大半を失うため、
 * 異なる2欄以上の一致を見出し行の条件とする（同じ欄に当たった複数列は1欄と数える）。
 */
const MIN_HEADER_MATCHES = 2;

/**
 * フォールバック経路で得た行を、Claude Vision 経路と同じ10欄の並びへ組み替える。
 *
 * - 1行目の各列を `autoDetectFieldMapping`（`field-mapping.ts` の見出し語の規則）で判定し、
 *   当たった欄の種類が `MIN_HEADER_MATCHES` 以上なら見出し行とみなす。各行を判定した欄へ並べ替え、
 *   見出し行はデータから外す。どの欄にも当たらない列は捨てる。同じ欄に2列以上が当たった
 *   場合は左側（先に現れた列）を採り、後の列は捨てる。
 * - 見出し行とみなさない場合は位置で当てる（第1列→大項目 … 第10列→備考）。
 *   1行目もデータとして扱い、10列を超える列は切り詰め、不足は空欄で埋める。
 */
function alignRowsToPreviewFields(rows: ImportExtractedRow[]): ImportExtractedRow[] {
  const firstRow = rows[0];
  if (!firstRow) return [];

  const detected = autoDetectFieldMapping(firstRow.columns, []).mappings;
  const columnForField = new Map<ImportTargetField, number>();
  firstRow.columns.forEach((_, colIndex) => {
    const field = detected[colIndex];
    if (field && field !== 'skip' && !columnForField.has(field)) {
      columnForField.set(field, colIndex);
    }
  });

  if (columnForField.size >= MIN_HEADER_MATCHES) {
    return rows.slice(1).map((row) => ({
      columns: PREVIEW_FIELDS.map(({ field }) => {
        const colIndex = columnForField.get(field);
        return colIndex === undefined ? '' : (row.columns[colIndex] ?? '');
      }),
      sourceRowIndex: row.sourceRowIndex,
    }));
  }

  return rows.map((row) => ({
    columns: PREVIEW_FIELDS.map((_, i) => row.columns[i] ?? ''),
    sourceRowIndex: row.sourceRowIndex,
  }));
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
