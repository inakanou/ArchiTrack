/**
 * @fileoverview カスタムシェイプのFabric.jsクラスレジストリ登録
 *
 * Fabric.js v6では、カスタムクラスを`util.enlivenObjects`で復元するために
 * 事前にclassRegistryに登録する必要がある。
 *
 * このモジュールをインポートすると、すべてのカスタムシェイプクラスが
 * Fabric.jsのクラスレジストリに登録される。
 *
 * @see https://fabricjs.com/docs/fabric.classRegistry
 */

import { classRegistry } from 'fabric';
import { RectangleShape } from './RectangleTool';
import { CircleShape } from './CircleTool';
import { PolygonShape } from './PolygonTool';
import { PolylineShape } from './PolylineTool';
import { FreehandPath } from './FreehandTool';
import { TextAnnotation } from './TextTool';
import { Arrow } from './ArrowTool';
import { DimensionLine } from './DimensionTool';

/**
 * カスタムシェイプをFabric.jsクラスレジストリに登録する
 *
 * この関数は一度だけ呼び出される必要がある。
 * 複数回呼び出しても問題ないが、効率のため一度だけ呼び出すことを推奨。
 */
export function registerCustomShapes(): void {
  // RectangleShape
  classRegistry.setClass(RectangleShape, 'rectangleShape');

  // CircleShape
  classRegistry.setClass(CircleShape, 'circleShape');

  // PolygonShape
  classRegistry.setClass(PolygonShape, 'polygonShape');

  // PolylineShape
  classRegistry.setClass(PolylineShape, 'polylineShape');

  // FreehandPath
  classRegistry.setClass(FreehandPath, 'freehand');

  // TextAnnotation
  classRegistry.setClass(TextAnnotation, 'textAnnotation');

  // Arrow
  classRegistry.setClass(Arrow, 'arrow');

  // DimensionLine
  classRegistry.setClass(DimensionLine, 'dimensionLine');
}

// モジュールがインポートされた時点で自動的に登録
registerCustomShapes();

export default registerCustomShapes;
