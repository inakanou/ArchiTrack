/**
 * @fileoverview 注釈ツールのエクスポート
 *
 * Task 14.1: 寸法線描画機能を実装する
 * Task 14.2: マーキングツール群を実装する（将来）
 * Task 15.1: テキスト注釈機能を実装する（将来）
 */

// 寸法線ツール
export { DimensionLine, createDimensionLine, DEFAULT_DIMENSION_OPTIONS } from './DimensionTool';

export type {
  Point,
  LineInfo,
  DimensionCustomData,
  DimensionLineOptions,
  DimensionLineJSON,
} from './DimensionTool';
