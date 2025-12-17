/**
 * @fileoverview 注釈ツールのエクスポート
 *
 * Task 14.1: 寸法線描画機能を実装する
 * Task 14.2: 寸法値入力機能を実装する
 * Task 15.5: 折れ線ツールを実装する
 * Task 15.1: テキスト注釈機能を実装する（将来）
 */

// 寸法線ツール
export {
  DimensionLine,
  createDimensionLine,
  DEFAULT_DIMENSION_OPTIONS,
  DEFAULT_LABEL_STYLE,
} from './DimensionTool';

export type {
  Point,
  LineInfo,
  DimensionCustomData,
  DimensionLineOptions,
  DimensionLineJSON,
  DimensionLabelStyle,
} from './DimensionTool';

// 寸法値入力コンポーネント
export { default as DimensionValueInput } from './DimensionValueInput';
export type { DimensionValueInputProps, Position } from './DimensionValueInput';

// 折れ線ツール
export {
  PolylineShape,
  PolylineBuilder,
  createPolyline,
  DEFAULT_POLYLINE_OPTIONS,
} from './PolylineTool';

export type { PolylineOptions, PolylineJSON, BoundingBox } from './PolylineTool';
