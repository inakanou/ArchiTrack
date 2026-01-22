/**
 * @fileoverview クリップボードコピーユーティリティ
 *
 * Task 15.1: クリップボードコピーユーティリティの実装
 *
 * 内訳書データをタブ区切り形式でクリップボードにコピーする機能を提供します。
 *
 * Requirements:
 * - 14.2: タブ区切り形式でコピー
 * - 14.3: ヘッダー行を含む
 * - 14.4: 各行はタブ文字で区切り、行末は改行文字で終端
 * - 14.7: コピー失敗時はエラーを返却
 * - 14.8: 数量は小数点以下2桁の文字列として出力
 */

import type { ItemizedStatementItemInfo } from '../types/itemized-statement.types';

// ============================================================================
// 型定義
// ============================================================================

/**
 * クリップボードコピーオプション
 */
export interface CopyToClipboardOptions {
  /** 内訳書項目一覧（フィルタ・ソート適用後） */
  items: ItemizedStatementItemInfo[];
}

/**
 * クリップボードコピー結果
 */
export interface CopyToClipboardResult {
  success: boolean;
  error?: string;
}

// ============================================================================
// 定数定義
// ============================================================================

/**
 * ヘッダー行の定義
 * Req 14.3: ヘッダー行（任意分類、工種、名称、規格、数量、単位）を含める
 */
const CLIPBOARD_HEADERS = ['任意分類', '工種', '名称', '規格', '数量', '単位'] as const;

/**
 * タブ区切り文字
 */
const TAB = '\t';

/**
 * 改行文字
 */
const NEWLINE = '\n';

// ============================================================================
// ヘルパー関数
// ============================================================================

/**
 * 数量を小数点以下2桁の文字列にフォーマット
 * Req 14.8: 数量は小数点以下2桁の精度を維持した文字列として出力する
 *
 * @param quantity - 数量
 * @returns 小数点以下2桁でフォーマットされた文字列
 */
function formatQuantity(quantity: number): string {
  return quantity.toFixed(2);
}

// ============================================================================
// エクスポート関数
// ============================================================================

/**
 * 内訳書項目をタブ区切りテキストに変換
 *
 * Requirements:
 * - 14.2: タブ区切り形式でコピー
 * - 14.3: ヘッダー行を含む
 * - 14.4: 各行はタブ文字で区切り、行末は改行文字で終端
 * - 14.8: 数量は小数点以下2桁の文字列として出力
 *
 * @param items - 内訳書項目一覧
 * @returns タブ区切りテキスト
 */
export function formatItemsForClipboard(items: ItemizedStatementItemInfo[]): string {
  // ヘッダー行を作成 (Req 14.3)
  const headerLine = CLIPBOARD_HEADERS.join(TAB);

  // データ行を作成 (Req 14.4, 14.8)
  const dataLines = items.map((item) => {
    const values = [
      item.customCategory ?? '',
      item.workType ?? '',
      item.name ?? '',
      item.specification ?? '',
      formatQuantity(item.quantity), // Req 14.8: 小数点以下2桁の文字列
      item.unit ?? '',
    ];
    return values.join(TAB);
  });

  // ヘッダーとデータを結合し、最後に改行を追加 (Req 14.4)
  return [headerLine, ...dataLines].join(NEWLINE) + NEWLINE;
}

/**
 * 内訳書データをタブ区切り形式でクリップボードにコピー
 *
 * Requirements:
 * - 14.2: タブ区切り形式でコピー
 * - 14.3: ヘッダー行を含む
 * - 14.4: 各行はタブ文字で区切り、行末は改行文字
 * - 14.5: フィルタ適用後のデータのみコピー（呼び出し側で対応）
 * - 14.7: コピー失敗時はエラーを返却
 * - 14.8: 数量は小数点以下2桁の文字列
 *
 * @param options - コピーオプション
 * @returns コピー結果（Promise）
 */
export async function copyToClipboard(
  options: CopyToClipboardOptions
): Promise<CopyToClipboardResult> {
  const { items } = options;

  try {
    // Clipboard APIの利用可否チェック
    if (!navigator.clipboard) {
      return { success: false, error: 'クリップボードAPIが利用できません' };
    }

    // タブ区切りテキストを生成
    const text = formatItemsForClipboard(items);

    // クリップボードにコピー
    await navigator.clipboard.writeText(text);

    return { success: true };
  } catch (error) {
    // エラーハンドリング (Req 14.7)
    if (error instanceof Error) {
      return { success: false, error: error.message };
    }
    return { success: false, error: 'クリップボードへのコピーに失敗しました' };
  }
}
