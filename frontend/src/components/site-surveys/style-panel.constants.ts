/**
 * @fileoverview スタイルパネルの定数と型定義
 *
 * react-refresh/only-export-components 対応のため分離
 */

// ============================================================================
// 型定義
// ============================================================================

/**
 * スタイル設定オプション
 */
export interface StyleOptions {
  /** 線色（HEXカラーコード） */
  strokeColor: string;
  /** 塗りつぶし色（HEXカラーコードまたは'transparent'） */
  fillColor: string;
  /** 線の太さ（1-20） */
  strokeWidth: number;
  /** フォントサイズ（8-72） */
  fontSize: number;
  /** 文字色（HEXカラーコード） */
  fontColor: string;
}

// ============================================================================
// 定数定義
// ============================================================================

/**
 * デフォルトのスタイル設定
 */
export const DEFAULT_STYLE_OPTIONS: StyleOptions = {
  strokeColor: '#000000',
  fillColor: 'transparent',
  strokeWidth: 2,
  fontSize: 16,
  fontColor: '#000000',
};
