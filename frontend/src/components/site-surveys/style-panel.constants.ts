/**
 * @fileoverview スタイルパネルの定数と型定義
 *
 * react-refresh/only-export-components 対応のため分離
 *
 * Task 70.2 (Req 24.5, 25.2, 26.3): `arrowOutlineEnabled` / `textOutlineEnabled`
 * を追加。既定値は `ANNOTATION_DEFAULTS` を単一情報源として参照する。
 * 既存 consumer との後方互換のためオプショナルフィールドとして追加する。
 */

import { ANNOTATION_DEFAULTS } from './annotation-style-tokens';

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
  /**
   * 矢印の白縁取りの有効/無効 (Req 24.5)
   *
   * 省略時は `ANNOTATION_DEFAULTS.arrowOutline.enabled` を既定値として扱う。
   * 後方互換のためオプショナル。
   */
  arrowOutlineEnabled?: boolean;
  /**
   * テキストの白アウトラインの有効/無効 (Req 25.2)
   *
   * 省略時は `ANNOTATION_DEFAULTS.textOutline.enabled` を既定値として扱う。
   * 後方互換のためオプショナル。
   */
  textOutlineEnabled?: boolean;
}

// ============================================================================
// 定数定義
// ============================================================================

/**
 * デフォルトのスタイル設定
 *
 * Req 26.3: 矢印・テキスト注釈は初期状態で白縁取り/白アウトラインが有効。
 * Req 26.5: 白縁取り既定値は `ANNOTATION_DEFAULTS` を単一情報源として参照する。
 */
export const DEFAULT_STYLE_OPTIONS: StyleOptions = {
  strokeColor: '#000000',
  fillColor: 'transparent',
  strokeWidth: 2,
  fontSize: 16,
  fontColor: '#000000',
  arrowOutlineEnabled: ANNOTATION_DEFAULTS.arrowOutline.enabled,
  textOutlineEnabled: ANNOTATION_DEFAULTS.textOutline.enabled,
};
