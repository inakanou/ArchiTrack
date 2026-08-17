/**
 * @fileoverview 復元時の表示倍率の適用先を座標系ごとに揃える導出のテスト（Task 115.73）
 *
 * Requirements:
 * - 32.2: 白縁取り線幅を本体線幅の 1.5 倍以上に設定する
 *   （本体線幅の基準は実際に描かれている線でなければならない。集合体へ複写された線幅だけに
 *   表示倍率が掛かると、比率の基準となる値が実描画と食い違う）
 *
 * テスト対象:
 * - `deriveRenderedBodyStrokeWidth`: 集合体の中で実際に描かれている本体線の線幅を取得する
 * - `resolveRestoredStrokeWidth`: 復元後に保持すべき線幅を解決する
 *   - 集合体（矢印・寸法線・6 形状）: 表示倍率を掛けず実描画から導出し直す
 *   - 集合体でない注釈（テキスト注釈: `strokeUniform` のため拡大率が線幅へ伝搬しない）:
 *     従来どおり平均倍率を掛ける
 *
 * 本テストは Fabric.js をモックせず、本番の形状クラスをそのまま構築して検証する。
 *
 * @requirement site-survey/REQ-32.2
 */

import { describe, it, expect } from 'vitest';
import { Path } from 'fabric';
import {
  deriveRenderedBodyStrokeWidth,
  resolveRestoredStrokeWidth,
} from '../../../components/site-surveys/annotation-restore-scale';
import { CircleShape } from '../../../components/site-surveys/tools/CircleTool';
import { RectangleShape } from '../../../components/site-surveys/tools/RectangleTool';
import { PolygonShape } from '../../../components/site-surveys/tools/PolygonTool';
import { PolylineShape } from '../../../components/site-surveys/tools/PolylineTool';
import { FreehandPath } from '../../../components/site-surveys/tools/FreehandTool';
import { DimensionLine } from '../../../components/site-surveys/tools/DimensionTool';
import { Arrow } from '../../../components/site-surveys/tools/ArrowTool';

/**
 * 表示倍率（保存時 400px 幅 → 現在 800px 幅 相当）の平均。
 * 期待値は本番の算出を再実行せず、この具体値から手計算した値を直書きする。
 */
const AVERAGE_SCALE = 2;

describe('annotation-restore-scale (Task 115.73)', () => {
  describe('deriveRenderedBodyStrokeWidth: 実描画の本体線幅を取得する', () => {
    it('円（集合体）は本体 Ellipse の線幅を返す', () => {
      const circle = new CircleShape(100, 100, 50, 40, { strokeWidth: 4 });

      expect(deriveRenderedBodyStrokeWidth(circle)).toBe(4);
    });

    it('四角形（集合体）は本体 Rect の線幅を返す', () => {
      const rectangle = new RectangleShape(10, 20, 100, 60, { strokeWidth: 6 });

      expect(deriveRenderedBodyStrokeWidth(rectangle)).toBe(6);
    });

    it('多角形（集合体）は本体 Polygon の線幅を返す', () => {
      const polygon = new PolygonShape(
        [
          { x: 0, y: 0 },
          { x: 50, y: 0 },
          { x: 25, y: 40 },
        ],
        { strokeWidth: 5 }
      );

      expect(deriveRenderedBodyStrokeWidth(polygon)).toBe(5);
    });

    it('折れ線（集合体）は本体 Polyline の線幅を返す', () => {
      const polyline = new PolylineShape(
        [
          { x: 0, y: 0 },
          { x: 30, y: 10 },
          { x: 60, y: 0 },
        ],
        { strokeWidth: 7 }
      );

      expect(deriveRenderedBodyStrokeWidth(polyline)).toBe(7);
    });

    it('フリーハンド（集合体）は本体 Path の線幅を返す', () => {
      const freehand = new FreehandPath('M 0 0 L 10 10 L 20 0', { strokeWidth: 8 });

      expect(deriveRenderedBodyStrokeWidth(freehand)).toBe(8);
    });

    it('寸法線（子が 3 つの集合体）は本体 Path の線幅を返す（ラベルの線幅ではない）', () => {
      const dimension = new DimensionLine({ x: 0, y: 0 }, { x: 100, y: 0 }, { strokeWidth: 5 });

      expect(deriveRenderedBodyStrokeWidth(dimension)).toBe(5);
    });

    it('矢印（集合体）は本体 Path の線幅を返す', () => {
      const arrow = new Arrow({ x: 0, y: 0 }, { x: 100, y: 100 }, { strokeWidth: 4 });

      expect(deriveRenderedBodyStrokeWidth(arrow)).toBe(4);
    });

    it('実描画の本体線幅が複写された線幅と食い違う場合は実描画の値を返す', () => {
      const circle = new CircleShape(100, 100, 50, 40, { strokeWidth: 4 });
      // 実描画（子）だけを変更し、集合体へ複写された線幅（4）はそのままにする
      circle.getObjects()[1]?.set('strokeWidth', 7);

      expect(deriveRenderedBodyStrokeWidth(circle)).toBe(7);
      expect(circle.strokeWidth).toBe(4);
    });

    // テキスト注釈は IText（集合体でない）だが、jsdom には 2D コンテキストが無く
    // Fabric のテキスト計測が構築時に失敗するため、集合体でない Fabric オブジェクトの
    // 代表として Path を用いる。テキスト注釈そのものの復元経路は
    // AnnotationEditor.restore-scale.test.tsx が画面側で観測する。
    it('集合体でない注釈（子を持たない Fabric オブジェクト）は undefined を返す', () => {
      const path = new Path('M 0 0 L 10 10', { strokeWidth: 3 });

      expect(deriveRenderedBodyStrokeWidth(path)).toBeUndefined();
    });

    it('null / 非オブジェクト / 子を持たない値は undefined を返す', () => {
      expect(deriveRenderedBodyStrokeWidth(null)).toBeUndefined();
      expect(deriveRenderedBodyStrokeWidth(undefined)).toBeUndefined();
      expect(deriveRenderedBodyStrokeWidth(4)).toBeUndefined();
      expect(deriveRenderedBodyStrokeWidth({ strokeWidth: 4 })).toBeUndefined();
      expect(deriveRenderedBodyStrokeWidth({ getObjects: () => [] })).toBeUndefined();
      expect(
        deriveRenderedBodyStrokeWidth({ getObjects: () => [{ strokeWidth: 10 }] })
      ).toBeUndefined();
      expect(
        deriveRenderedBodyStrokeWidth({
          getObjects: () => [{ strokeWidth: 10 }, { strokeWidth: 0 }],
        })
      ).toBeUndefined();
    });
  });

  describe('resolveRestoredStrokeWidth: 復元後に保持すべき線幅', () => {
    it('円（集合体）は表示倍率 2 倍でも実描画の 4 を返す（8 にしない）', () => {
      const circle = new CircleShape(100, 100, 50, 40, { strokeWidth: 4 });

      expect(resolveRestoredStrokeWidth(circle, circle.strokeWidth, AVERAGE_SCALE)).toBe(4);
    });

    it('矢印（集合体）は表示倍率 2 倍でも実描画の 4 を返す（8 にしない）', () => {
      const arrow = new Arrow({ x: 0, y: 0 }, { x: 100, y: 100 }, { strokeWidth: 4 });

      expect(resolveRestoredStrokeWidth(arrow, arrow.strokeWidth, AVERAGE_SCALE)).toBe(4);
    });

    it('寸法線（集合体）は表示倍率 2 倍でも実描画の 5 を返す（10 にしない）', () => {
      const dimension = new DimensionLine({ x: 0, y: 0 }, { x: 100, y: 0 }, { strokeWidth: 5 });

      expect(resolveRestoredStrokeWidth(dimension, dimension.strokeWidth, AVERAGE_SCALE)).toBe(5);
    });

    it('集合体でない注釈は従来どおり平均倍率を掛けた 6 を返す', () => {
      const path = new Path('M 0 0 L 10 10', { strokeWidth: 3 });

      expect(resolveRestoredStrokeWidth(path, 3, AVERAGE_SCALE)).toBe(6);
    });
  });
});
