/**
 * @fileoverview Excel出力ユーティリティ
 *
 * Task 14.2: Excelエクスポートユーティリティの実装
 *
 * 内訳書データをExcelファイル（.xlsx形式）として生成・ダウンロードする機能を提供します。
 *
 * Requirements:
 * - 13.2: .xlsx形式でファイル生成
 * - 13.3: 任意分類、工種、名称、規格、数量、単位のカラム
 * - 13.4: ファイル名は {内訳書名}_{YYYYMMDD}.xlsx
 * - 13.5: 数量は数値として出力、小数点以下2桁精度
 * - 13.6: フィルタ適用後のデータのみ出力
 * - 13.8: エラー発生時にエラー情報を返却
 */

import * as XLSX from 'xlsx';
import type { ItemizedStatementItemInfo } from '../types/itemized-statement.types';

// ============================================================================
// 型定義
// ============================================================================

/**
 * Excelエクスポートオプション
 */
export interface ExportToExcelOptions {
  /** 内訳書項目一覧（フィルタ・ソート適用後） */
  items: ItemizedStatementItemInfo[];
  /** 内訳書名（ファイル名に使用） */
  statementName: string;
}

/**
 * Excelエクスポート結果
 */
export interface ExportToExcelResult {
  success: boolean;
  error?: string;
}

/**
 * Excelエクスポート用の行データ型
 */
interface ExcelRowData {
  任意分類: string;
  工種: string;
  名称: string;
  規格: string;
  数量: number;
  単位: string;
}

// ============================================================================
// 定数定義
// ============================================================================

/**
 * Excelシートのヘッダー定義（順序を保持）
 * Req 13.3: 任意分類、工種、名称、規格、数量、単位のカラム
 */
const EXCEL_HEADERS = ['任意分類', '工種', '名称', '規格', '数量', '単位'] as const;

/**
 * ワークシート名
 */
const WORKSHEET_NAME = '内訳書';

/**
 * ファイル名に使用できない文字の正規表現
 */
const INVALID_FILENAME_CHARS = /[/\\:*?"<>|]/g;

// ============================================================================
// ヘルパー関数
// ============================================================================

/**
 * 現在日付をYYYYMMDD形式でフォーマット
 * @returns YYYYMMDD形式の日付文字列
 */
function formatDateForFileName(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

/**
 * ファイル名に使用できない文字を置換
 * @param name - 元の名前
 * @returns 安全なファイル名
 */
function sanitizeFileName(name: string): string {
  return name.replace(INVALID_FILENAME_CHARS, '_');
}

// ============================================================================
// エクスポート関数
// ============================================================================

/**
 * Excelファイル名を生成
 *
 * Req 13.4: ファイル名は {内訳書名}_{YYYYMMDD}.xlsx 形式
 *
 * @param statementName - 内訳書名
 * @returns 生成されたファイル名
 */
export function generateExcelFileName(statementName: string): string {
  const safeName = sanitizeFileName(statementName);
  const dateStr = formatDateForFileName();
  return `${safeName}_${dateStr}.xlsx`;
}

/**
 * 内訳書項目をExcelエクスポート用の形式に変換
 *
 * Req 13.3: カラム順序は 任意分類、工種、名称、規格、数量、単位
 * Req 13.5: 数量は数値型として出力
 *
 * @param items - 内訳書項目一覧
 * @returns Excelエクスポート用の行データ配列
 */
export function formatItemsForExcel(items: ItemizedStatementItemInfo[]): ExcelRowData[] {
  return items.map((item) => ({
    任意分類: item.customCategory ?? '',
    工種: item.workType ?? '',
    名称: item.name ?? '',
    規格: item.specification ?? '',
    数量: item.quantity, // 数値型のまま維持 (Req 13.5)
    単位: item.unit ?? '',
  }));
}

/**
 * 内訳書データをExcelファイルとしてダウンロード
 *
 * Requirements:
 * - 13.2: .xlsx形式でファイル生成
 * - 13.3: 任意分類、工種、名称、規格、数量、単位のカラム
 * - 13.4: ファイル名は {内訳書名}_{YYYYMMDD}.xlsx
 * - 13.5: 数量は数値として出力、小数点以下2桁精度
 * - 13.6: フィルタ適用後のデータのみ出力（呼び出し側で対応）
 * - 13.8: エラー発生時にエラー情報を返却
 *
 * @param options - エクスポートオプション
 * @returns エクスポート結果
 */
export function exportToExcel(options: ExportToExcelOptions): ExportToExcelResult {
  const { items, statementName } = options;

  try {
    // データをExcel形式に変換
    const excelData = formatItemsForExcel(items);

    // ワークシートを作成（ヘッダー順序を明示的に指定）
    const worksheet = XLSX.utils.json_to_sheet(excelData, {
      header: [...EXCEL_HEADERS],
    });

    // ワークブックを作成
    const workbook = XLSX.utils.book_new();

    // ワークシートをワークブックに追加
    XLSX.utils.book_append_sheet(workbook, worksheet, WORKSHEET_NAME);

    // ファイル名を生成
    const fileName = generateExcelFileName(statementName);

    // ファイルをダウンロード
    XLSX.writeFile(workbook, fileName);

    return { success: true };
  } catch (error) {
    // エラーハンドリング (Req 13.8)
    if (error instanceof Error) {
      return { success: false, error: error.message };
    }
    return { success: false, error: 'Excelファイルの生成に失敗しました' };
  }
}
