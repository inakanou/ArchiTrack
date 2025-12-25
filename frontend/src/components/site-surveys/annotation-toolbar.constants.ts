/**
 * @fileoverview 注釈ツールバーの定数と型定義
 *
 * react-refresh/only-export-components 対応のため分離
 */

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
 */
export const DEFAULT_STYLE_OPTIONS: StyleOptions = {
  strokeColor: '#ff0000',
  strokeWidth: 2,
  fillColor: '',
  fontSize: 16,
};
