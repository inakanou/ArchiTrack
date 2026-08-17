/**
 * @fileoverview スタイルパネルの定数と型定義
 *
 * react-refresh/only-export-components 対応のため分離
 *
 * Task 70.2 (Req 24.5, 25.2, 26.3): `arrowOutlineEnabled` / `textOutlineEnabled`
 * を追加。既定値は `ANNOTATION_DEFAULTS` を単一情報源として参照する。
 * 既存 consumer との後方互換のためオプショナルフィールドとして追加する。
 *
 * Task 115.70 (Req 26.1, 26.5): `DEFAULT_STYLE_OPTIONS` の**全項目**を
 * `ANNOTATION_DEFAULTS` から供給する形へ改めた。従来は白縁取りの二項目だけが
 * 一元管理の資材を参照し、本体色・線幅・塗りつぶし・文字色は独自の literal を
 * 持っていたため、`annotation-toolbar.constants.ts` の同名宣言と値が食い違う
 * 二重の供給元になっていた（本体色 `#000000` / 線幅 2 に対し中央は `#e53935` / 3）。
 * 本ファイルは既存 consumer 向けのフィールド名・表現の橋渡しのみを担い、値そのものは
 * トークン側で管理する。
 *
 * @requirement site-survey/REQ-26.1
 * @requirement site-survey/REQ-26.5
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
 * Req 26.1: 初期線幅はモバイルでも視認できる太さ（`ANNOTATION_DEFAULTS.strokeWidth`）。
 * Req 26.2: 初期本体色は赤系（`ANNOTATION_DEFAULTS.stroke`）。
 * Req 26.3: 矢印・テキスト注釈は初期状態で白縁取り/白アウトラインが有効。
 * Req 26.5: 全項目を `ANNOTATION_DEFAULTS` から供給し、独自の既定値を持たない。
 *
 * 表現の橋渡しは次の二点のみ:
 * - `fontColor`: テキストの本体色。トークン側は矢印もテキストも `stroke` で表す
 *   （`DEFAULT_TEXT_OPTIONS.fill` と同一の供給元）。
 * - `fillColor`: トークン側は透明を空文字で表すが、スタイルパネルは透明を
 *   `'transparent'` 文字列で表現する（塗りつぶしなしボタンの選択状態判定と
 *   色入力の代替表示がこの表現に依存するため）。
 */
export const DEFAULT_STYLE_OPTIONS: StyleOptions = {
  strokeColor: ANNOTATION_DEFAULTS.stroke,
  fillColor: ANNOTATION_DEFAULTS.fill === '' ? 'transparent' : ANNOTATION_DEFAULTS.fill,
  strokeWidth: ANNOTATION_DEFAULTS.strokeWidth,
  fontSize: ANNOTATION_DEFAULTS.fontSize,
  fontColor: ANNOTATION_DEFAULTS.stroke,
  arrowOutlineEnabled: ANNOTATION_DEFAULTS.arrowOutline.enabled,
  textOutlineEnabled: ANNOTATION_DEFAULTS.textOutline.enabled,
};
