/**
 * @fileoverview Excelデータパース機能
 *
 * Task 44.1: SheetJS（xlsx）ライブラリを使用してExcelファイルの全シートを読み取り、
 * 数量項目フィールドにマッピングする構造化データを抽出する。
 *
 * Requirements:
 * - 28.1: SheetJS（xlsx）ライブラリを使用してExcelデータを直接読み取る
 * - 28.2: Excelファイルの全シートを解析対象とする
 * - 28.3: 列データを数量項目の対応フィールドにマッピングする
 * - 28.4: データパース完了時に抽出結果をプレビューテーブルとして表示する
 * - 28.6: ファイル読み取り失敗時はエラーメッセージを返す
 * - 28.7: テキストをユーザーが選択・コピーできる状態で表示する
 */

import * as XLSX from 'xlsx';
import type { ImportExtractionResult, ImportExtractedRow } from '../../types/quantity-import.types';

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
