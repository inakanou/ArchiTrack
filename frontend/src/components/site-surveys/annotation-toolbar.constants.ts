/**
 * @fileoverview 注釈ツールバーの定数と型定義
 *
 * react-refresh/only-export-components 対応のため分離
 *
 * Task 64.2 (Req 26.5): `DEFAULT_STYLE_OPTIONS` の値はツール横断の単一情報源である
 * `ANNOTATION_DEFAULTS` (`./annotation-style-tokens`) から参照する。本ファイルは
 * 既存 consumer 向けのフィールド名ブリッジ（`strokeColor` ← `stroke`,
 * `fillColor` ← `fill`）のみを提供し、値そのものはトークン側で管理する。
 *
 * Task 115.96 (Req 24.5, 25.2, 32.5): `StyleOptions` へ `outlineEnabled` を追加した。
 * 従来この型には白縁取りに相当する項目が無く、道具帯のスタイルパネルは白縁取りの
 * 切替を表現できなかった（型の水準で切替が不可能だった）。既定値はツール別に
 * `ANNOTATION_DEFAULTS`（Req 26.5 / 32.13 の一元管理資材）から供給する。
 *
 * @requirement site-survey/REQ-26.5
 * @requirement site-survey/REQ-24.5
 * @requirement site-survey/REQ-25.2
 * @requirement site-survey/REQ-32.5
 */

import { ANNOTATION_DEFAULTS, createDefaultOutlineEnabled } from './annotation-style-tokens';

// ============================================================================
// 型定義
// ============================================================================

/**
 * 注釈ツールの種類
 */
export type ToolType =
  | 'select'
  | 'dimension'
  | 'arrow'
  | 'circle'
  | 'rectangle'
  | 'polygon'
  | 'polyline'
  | 'freehand'
  | 'text';

/**
 * 白縁取り（テキストは白アウトライン）を持ちうるツール
 *
 * 選択ツールは注釈を描かないため対象外。要件 24.5（矢印）・25.2（テキスト）・
 * 32.5（寸法線・円・四角形・多角形・折れ線・フリーハンド）の対象がちょうどこの集合になる。
 */
export type OutlineCapableTool = Exclude<ToolType, 'select'>;

/**
 * ツール定義
 */
export interface ToolDefinition {
  /** ツールID */
  id: ToolType;
  /** 表示ラベル */
  label: string;
  /** アイコン（SVGパス） */
  icon: string;
  /** ツールチップ説明 */
  description: string;
}

/**
 * スタイルオプション
 */
export interface StyleOptions {
  /** 線の色 */
  strokeColor: string;
  /** 線の太さ */
  strokeWidth: number;
  /** 塗りつぶしの色（透明の場合は空文字） */
  fillColor: string;
  /** フォントサイズ（テキスト用） */
  fontSize: number;
  /**
   * ツール別の白縁取り（テキストは白アウトライン）の有効/無効 (Req 24.5, 25.2, 32.5)
   *
   * 描画設定の一部であり、以降に描かれる注釈へ適用される。既存の注釈は変更しない
   * （Req 24.9 / 25.10 / 32.9 の後方互換を切替の導入で壊さないため）。
   */
  outlineEnabled: Record<OutlineCapableTool, boolean>;
}

// ============================================================================
// ツール定義
// ============================================================================

/**
 * 全ツールの定義
 */
export const TOOL_DEFINITIONS: Record<ToolType, ToolDefinition> = {
  select: {
    id: 'select',
    label: '選択',
    icon: 'M3 3l18 18M3 3v6M3 3h6',
    description: 'オブジェクトを選択・移動',
  },
  dimension: {
    id: 'dimension',
    label: '寸法線',
    icon: 'M3 12h18M3 8v8M21 8v8',
    description: '2点間の寸法線を描画',
  },
  arrow: {
    id: 'arrow',
    label: '矢印',
    icon: 'M5 19L19 5M19 5h-6M19 5v6',
    description: '矢印を描画',
  },
  circle: {
    id: 'circle',
    label: '円',
    icon: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z',
    description: '円または楕円を描画',
  },
  rectangle: {
    id: 'rectangle',
    label: '四角形',
    icon: 'M3 3h18v18H3z',
    description: '四角形を描画',
  },
  polygon: {
    id: 'polygon',
    label: '多角形',
    icon: 'M12 2l9 7-3.5 10h-11L3 9z',
    description: '多角形を描画',
  },
  polyline: {
    id: 'polyline',
    label: '折れ線',
    icon: 'M3 17l6-6 4 4 8-10',
    description: '折れ線を描画',
  },
  freehand: {
    id: 'freehand',
    label: 'フリーハンド',
    icon: 'M3 17c3 0 5-2 8-2s5 4 8 4M3 12c3 0 5-2 8-2s5 2 8 2',
    description: 'フリーハンドで描画',
  },
  text: {
    id: 'text',
    label: 'テキスト',
    icon: 'M4 6h16M12 6v14M8 6v2M16 6v2',
    description: 'テキストを追加',
  },
};

/**
 * ツールの表示順序
 */
export const TOOL_ORDER: ToolType[] = [
  'select',
  'dimension',
  'arrow',
  'circle',
  'rectangle',
  'polygon',
  'polyline',
  'freehand',
  'text',
];

/**
 * デフォルトのスタイルオプション
 *
 * Req 26.5: 値は `ANNOTATION_DEFAULTS` を単一情報源として展開する。
 * フィールド名は既存 consumer との互換性を維持するため従来の
 * `strokeColor` / `fillColor` を保持し、トークン側の `stroke` / `fill` から
 * マッピングする。
 */
export const DEFAULT_STYLE_OPTIONS: StyleOptions = {
  strokeColor: ANNOTATION_DEFAULTS.stroke,
  strokeWidth: ANNOTATION_DEFAULTS.strokeWidth,
  fillColor: ANNOTATION_DEFAULTS.fill,
  fontSize: ANNOTATION_DEFAULTS.fontSize,
  // Req 26.3 / 32.11: 初回選択時は白縁取り/白アウトラインが有効な状態で起動する。
  // 値はツール別に一元管理の資材から供給し、本ファイルは独自の既定値を持たない。
  outlineEnabled: createDefaultOutlineEnabled(),
};
