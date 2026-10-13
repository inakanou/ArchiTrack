/**
 * @fileoverview Excelデータパース機能
 *
 * Task 44.1: SheetJS（xlsx）ライブラリを使用してExcelファイルの全シートを読み取り、
 * 数量項目フィールドにマッピングする構造化データを抽出する。
 *
 * Requirements:
 * - 28.1: SheetJS（xlsx）ライブラリを使用してExcelデータを直接読み取る
 * - 28.2: Excelファイルの全シートを解析対象とする
 *
 * 本ファイルは見出しと列値の配列を返すだけで、次の受入基準は担わない。
 * 列から数量項目フィールドへの対応付け（28.3）は field-mapping.ts、
 * プレビューテーブルの表示と選択・コピー（28.4 / 28.7）は ImportPreviewTable.tsx が担う。
 * 読み取り失敗（28.6）は、元の例外文を出さず手動入力を促すメッセージ（EXCEL_READ_FAILURE_MESSAGE）で
 * 失敗させ、呼び出し元（useImportDataExtractor.ts）を経て ImportDialog.tsx の role="alert" が
 * リトライボタンと併せて表示する。
 */

import * as XLSX from 'xlsx';
import type { ImportExtractionResult, ImportExtractedRow } from '../../types/quantity-import.types';

/** Excelファイルの読み取りに失敗した場合のエラーメッセージ（REQ-28.6。PDF 経路の REQ-29.9 と同じ形の文言） */
export const EXCEL_READ_FAILURE_MESSAGE =
  'Excelファイルの読み取りに失敗しました。手動入力してください';

/**
 * Excelファイルをパースして行データを抽出する
 *
 * 1. SheetJS（xlsx）で全シートを読み取り
 * 2. 各シートのデータ範囲を特定
 * 3. ヘッダー行を自動検出（最初の非空行）
 * 4. データ行を抽出し、列値の配列として返却
 *
 * @param file Excelファイル
 * @returns 抽出結果
 */
export async function parseExcelFile(file: File): Promise<ImportExtractionResult> {
  try {
    return await readExcelFile(file);
  } catch {
    // 元の例外文（SheetJS の例外など）は利用者へ出さない
    throw new Error(EXCEL_READ_FAILURE_MESSAGE);
  }
}

/**
 * SheetJS で全シートを読み取り、見出しと列値の配列を組み立てる（失敗時は例外をそのまま投げる）
 */
async function readExcelFile(file: File): Promise<ImportExtractionResult> {
  const arrayBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, { type: 'array' });

  const allHeaders: string[] = [];
  const allRows: ImportExtractedRow[] = [];
  let rowIndex = 0;

  for (const sheetName of workbook.SheetNames) {
    const worksheet = workbook.Sheets[sheetName];
    if (!worksheet) continue;

    // sheet_to_json returns array of objects with header keys
    const rows = XLSX.utils.sheet_to_json(worksheet, { defval: '' }) as Record<string, unknown>[];

    if (rows.length === 0) continue;

    // Extract headers from the first row's keys (auto-detected by SheetJS)
    const firstRow = rows[0];
    if (firstRow) {
      const sheetHeaders = Object.keys(firstRow);
      // Merge headers (avoid duplicates for multi-sheet)
      for (const header of sheetHeaders) {
        if (!allHeaders.includes(header)) {
          allHeaders.push(header);
        }
      }
    }

    // Extract data rows
    for (const row of rows) {
      const columns = allHeaders.map((header) => {
        const value = row[header];
        return value != null ? String(value) : '';
      });

      allRows.push({
        columns,
        sourceRowIndex: rowIndex++,
      });
    }
  }

  return {
    headers: allHeaders,
    rows: allRows,
    extractionType: 'excel-parse',
    sheetNames: workbook.SheetNames,
  };
}
