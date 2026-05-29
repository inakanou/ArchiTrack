/**
 * @fileoverview 折れ線ツール 白縁取り構造テスト（Task 80.1）
 *
 * Requirements:
 * - 32.1: 矢印以外の形状（寸法線・円・四角形・多角形・折れ線・フリーハンド）にも白色縁取りを付与する
 * - 32.2: 白縁取り線幅を本体線幅の 1.5 倍以上に設定する
 * - 32.3: 本体色を変更しても白縁取りは白のまま維持する
 * - 32.4: 移動・リサイズ・回転・形状変形（端点移動・頂点追加/削除等）時に本体と同期して白縁取りを変形する
 *
 * テスト対象:
 * - Polyline (PolylineShape) extends Group（2つの子: outlinePolyline + bodyPolyline）
 * - setStroke / setStrokeWidth / setOutline / getOutline の挙動
 * - 線の端点・接合は round（視認性確保）
 * - Group 構造は setOutline({enabled:false}) でも維持される
 * - 頂点追加・削除・移動時に outlinePolyline.points と bodyPolyline.points を同期更新する
 * - 開放形状のため fill は両 path とも未使用（design.md 5347 行）
 *
 * @requirement site-survey/REQ-32.1
 * @requirement site-survey/REQ-32.2
 * @requirement site-survey/REQ-32.3
 * @requirement site-survey/REQ-32.4
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// vi.hoistedでモック関数を定義（ホイスティング対応）
const { mockSetCoords, mockSet } = vi.hoisted(() => {
  return {
    mockSetCoords: vi.fn(),
    mockSet: vi.fn(),
  };
});

// Fabric.jsのモック
vi.mock('fabric', () => {
  class MockPolyline {
    points: Array<{ x: number; y: number }>;
    left?: number;
    top?: number;
    fill?: string;
    stroke?: string;
    strokeWidth?: number;
    opacity?: number;
    strokeLineCap?: string;
    strokeLineJoin?: string;
    originX?: string;
    originY?: string;
    selectable?: boolean;
    evented?: boolean;
    hasControls?: boolean;
    hasBorders?: boolean;
    lockMovementX?: boolean;
    lockMovementY?: boolean;
    objectCaching?: boolean;

    constructor(points?: Array<{ x: number; y: number }>, options?: Record<string, unknown>) {
      this.points = points ? points.map((p) => ({ ...p })) : [];
      this.fill = 'transparent';
      this.stroke = '#000000';
      this.strokeWidth = 2;
      this.opacity = 1;
      this.originX = 'left';
      this.originY = 'top';
      this.hasControls = true;
      this.hasBorders = true;
      this.lockMovementX = false;
      this.lockMovementY = false;
      if (options) {
        Object.assign(this, options);
      }
    }

    set(options: Record<string, unknown> | string, value?: unknown): this {
      if (typeof options === 'string') {
        (this as Record<string, unknown>)[options] = value;
      } else {
        Object.assign(this, options);
      }
      mockSet(options, value);
      return this;
    }

    setCoords(): void {
      mockSetCoords();
    }

    toObject(): Record<string, unknown> {
      return {};
    }
  }

  class MockGroup {
    _objects: unknown[];
    left?: number;
    top?: number;
    width?: number;
    height?: number;
    stroke?: string;
    strokeWidth?: number;
    fill?: string;
    hasControls: boolean;
    hasBorders: boolean;
    lockMovementX: boolean;
    lockMovementY: boolean;
    subTargetCheck: boolean;

    constructor(objects?: unknown[], options?: Record<string, unknown>) {
      this._objects = objects ? [...objects] : [];
      this.hasControls = true;
      this.hasBorders = true;
      this.lockMovementX = false;
      this.lockMovementY = false;
      this.subTargetCheck = false;
      if (options) {
        Object.assign(this, options);
      }
    }

    setCoords(): void {
      mockSetCoords();
    }

    set(options: Record<string, unknown> | string, value?: unknown): this {
      if (typeof options === 'string') {
        (this as Record<string, unknown>)[options] = value;
      } else {
        Object.assign(this, options);
      }
      mockSet(options, value);
      return this;
    }

    toObject(): Record<string, unknown> {
      return {};
    }

    add(object: unknown): void {
      this._objects.push(object);
    }

    remove(object: unknown): void {
      const index = this._objects.indexOf(object);
      if (index > -1) {
        this._objects.splice(index, 1);
      }
    }
  }

  return {
    Polyline: MockPolyline,
    Group: MockGroup,
  };
});

import { Group } from 'fabric';

import {
  PolylineShape,
  createPolyline,
} from '../../../../components/site-surveys/tools/PolylineTool';
import { ANNOTATION_DEFAULTS } from '../../../../components/site-surveys/annotation-style-tokens';

// ============================================================================
// ヘルパー
// ============================================================================

type ChildPolyline = {
  points?: Array<{ x: number; y: number }>;
  stroke?: string;
  strokeWidth?: number;
  fill?: string;
  opacity?: number;
  strokeLineCap?: string;
  strokeLineJoin?: string;
};

function getChildren(polyline: PolylineShape): ChildPolyline[] {
  // PolylineShape extends Group; MockGroup exposes `_objects` array
  return (polyline as unknown as { _objects: ChildPolyline[] })._objects;
}

/**
 * Group の 2 つの子（outline, body）をタプルとして取得する。
 * Task 80.1 の Polyline は常に 2 つの子 Polyline を持つことが不変条件。
 */
function getOutlineAndBody(polyline: PolylineShape): [ChildPolyline, ChildPolyline] {
  const children = getChildren(polyline);
  if (children.length < 2) {
    throw new Error(
      `Expected Polyline to have 2 children (outline + body), got ${children.length}`
    );
  }
  return [children[0] as ChildPolyline, children[1] as ChildPolyline];
}

const POLYLINE_POINTS = [
  { x: 100, y: 100 },
  { x: 200, y: 100 },
  { x: 150, y: 200 },
];

// ============================================================================
// テストスイート
// ============================================================================

describe('Polyline (Group + 白縁取り)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Group 構造（Req 32.1）', () => {
    it('PolylineShape は Fabric.js Group を継承している', () => {
      const polyline = new PolylineShape(POLYLINE_POINTS);

      expect(polyline).toBeInstanceOf(Group);
    });

    it('PolylineShape は 2 つの子 Polyline（outlinePolyline + bodyPolyline）を持つ', () => {
      const polyline = new PolylineShape(POLYLINE_POINTS);

      const children = getChildren(polyline);
      expect(children).toHaveLength(2);
    });

    it('外側の白縁取りが最初、本体色が次、の順序で配置される', () => {
      const bodyColor = '#ff0000';
      const polyline = new PolylineShape(POLYLINE_POINTS, { stroke: bodyColor });

      const [outline, body] = getOutlineAndBody(polyline);
      expect(outline.stroke).toBe('#ffffff');
      expect(body.stroke).toBe(bodyColor);
    });

    it('type プロパティは "polylineShape" を維持する（classRegistry 後方互換）', () => {
      const polyline = new PolylineShape(POLYLINE_POINTS);

      expect(polyline.type).toBe('polylineShape');
    });

    it('外側 Polyline と本体 Polyline は同じ頂点配列を持つ', () => {
      const polyline = new PolylineShape(POLYLINE_POINTS);

      const [outline, body] = getOutlineAndBody(polyline);
      expect(outline.points).toEqual(POLYLINE_POINTS);
      expect(body.points).toEqual(POLYLINE_POINTS);
    });
  });

  describe('白縁取りの視認性（Req 32.2）', () => {
    it('白縁取りの線幅は本体線幅 + outline.width * 2 である', () => {
      const polyline = new PolylineShape(POLYLINE_POINTS, { strokeWidth: 3 });

      const [outline, body] = getOutlineAndBody(polyline);
      expect(body.strokeWidth).toBe(3);
      expect(outline.strokeWidth).toBe(3 + ANNOTATION_DEFAULTS.polylineOutline.width * 2);
    });

    it('白縁取り線幅は本体線幅の 1.5 倍以上である（既定）', () => {
      const polyline = new PolylineShape(POLYLINE_POINTS, { strokeWidth: 3 });

      const [outline, body] = getOutlineAndBody(polyline);
      expect((outline.strokeWidth ?? 0) / (body.strokeWidth ?? 1)).toBeGreaterThanOrEqual(1.5);
    });

    it('外側 Polyline は strokeLineCap: round / strokeLineJoin: round を適用する', () => {
      const polyline = new PolylineShape(POLYLINE_POINTS);

      const [outline] = getOutlineAndBody(polyline);
      expect(outline.strokeLineCap).toBe('round');
      expect(outline.strokeLineJoin).toBe('round');
    });

    it('開放形状のため外側 Polyline の fill は transparent（design.md 5347 行）', () => {
      const polyline = new PolylineShape(POLYLINE_POINTS);

      const [outline] = getOutlineAndBody(polyline);
      expect(outline.fill).toBe('transparent');
    });

    it('開放形状のため本体 Polyline の fill も transparent（design.md 5347 行）', () => {
      const polyline = new PolylineShape(POLYLINE_POINTS);

      const [, body] = getOutlineAndBody(polyline);
      expect(body.fill).toBe('transparent');
    });
  });

  describe('本体色変更で白縁取りは白のまま（Req 32.3）', () => {
    it('setStroke で本体色を変更しても外側 Polyline は白を維持', () => {
      const polyline = new PolylineShape(POLYLINE_POINTS, { stroke: '#ff0000' });

      polyline.setStroke('#00ff00');

      const [outline, body] = getOutlineAndBody(polyline);
      expect(outline.stroke).toBe('#ffffff');
      expect(body.stroke).toBe('#00ff00');
    });

    it('setStrokeWidth 更新時、外側 Polyline の線幅も連動する（本体+outline*2）', () => {
      const polyline = new PolylineShape(POLYLINE_POINTS);

      polyline.setStrokeWidth(5);

      const [outline, body] = getOutlineAndBody(polyline);
      expect(body.strokeWidth).toBe(5);
      expect(outline.strokeWidth).toBe(5 + ANNOTATION_DEFAULTS.polylineOutline.width * 2);
    });
  });

  describe('outline 属性の API', () => {
    it('getOutline はデフォルトで ANNOTATION_DEFAULTS.polylineOutline を返す', () => {
      const polyline = new PolylineShape(POLYLINE_POINTS);

      const outline = polyline.getOutline();

      expect(outline).toEqual(ANNOTATION_DEFAULTS.polylineOutline);
    });

    it('getOutline はコピーを返す（外部からの破壊を防ぐ）', () => {
      const polyline = new PolylineShape(POLYLINE_POINTS);

      const outline1 = polyline.getOutline();
      outline1!.color = '#000000';
      const outline2 = polyline.getOutline();

      expect(outline2!.color).toBe('#ffffff');
    });

    it('setOutline({ enabled: false }) で外側 Polyline の opacity が 0 になる', () => {
      const polyline = new PolylineShape(POLYLINE_POINTS);

      polyline.setOutline({ enabled: false });

      const [outline] = getOutlineAndBody(polyline);
      expect(outline.opacity).toBe(0);
      expect(polyline.getOutline()!.enabled).toBe(false);
    });

    it('setOutline({ enabled: true }) で外側 Polyline の opacity が 1 に戻る', () => {
      const polyline = new PolylineShape(POLYLINE_POINTS);
      polyline.setOutline({ enabled: false });

      polyline.setOutline({ enabled: true });

      const [outline] = getOutlineAndBody(polyline);
      expect(outline.opacity).toBe(1);
      expect(polyline.getOutline()!.enabled).toBe(true);
    });

    it('setOutline({ width: 4 }) で外側 Polyline の strokeWidth が更新される', () => {
      const polyline = new PolylineShape(POLYLINE_POINTS, { strokeWidth: 3 });

      polyline.setOutline({ width: 4 });

      const [outline] = getOutlineAndBody(polyline);
      expect(outline.strokeWidth).toBe(3 + 4 * 2);
      expect(polyline.getOutline()!.width).toBe(4);
    });

    it('setOutline で Group 構造（子の数）は維持される（enabled=false でも remove しない）', () => {
      const polyline = new PolylineShape(POLYLINE_POINTS);

      polyline.setOutline({ enabled: false });

      expect(getChildren(polyline)).toHaveLength(2);
    });
  });

  describe('頂点同期（Req 32.4）', () => {
    it('setPoint で 1 頂点を更新すると両方の子 Polyline の points が同期更新される', () => {
      const polyline = new PolylineShape(POLYLINE_POINTS);
      const [outlineBefore, bodyBefore] = getOutlineAndBody(polyline);

      polyline.setPoint(1, { x: 250, y: 150 });

      const [outlineAfter, bodyAfter] = getOutlineAndBody(polyline);
      expect(outlineAfter.points?.[1]).toEqual({ x: 250, y: 150 });
      expect(bodyAfter.points?.[1]).toEqual({ x: 250, y: 150 });
      // 参照の同一性（remove/再作成ではなく既存子の更新）
      expect(outlineBefore).toBe(outlineAfter);
      expect(bodyBefore).toBe(bodyAfter);
    });

    it('setPoints で頂点配列を一括更新すると両方の子 Polyline の points が同期更新される', () => {
      const polyline = new PolylineShape(POLYLINE_POINTS);
      const newPoints = [
        { x: 50, y: 50 },
        { x: 250, y: 50 },
        { x: 200, y: 250 },
        { x: 100, y: 250 },
      ];

      polyline.setPoints(newPoints);

      const [outline, body] = getOutlineAndBody(polyline);
      expect(outline.points).toEqual(newPoints);
      expect(body.points).toEqual(newPoints);
    });

    it('頂点配列の長さ変化（点追加）でも両方の子 Polyline に反映される', () => {
      const polyline = new PolylineShape(POLYLINE_POINTS);
      const expanded = [...POLYLINE_POINTS, { x: 50, y: 150 }];

      polyline.setPoints(expanded);

      const [outline, body] = getOutlineAndBody(polyline);
      expect(outline.points).toHaveLength(4);
      expect(body.points).toHaveLength(4);
      expect(outline.points?.[3]).toEqual({ x: 50, y: 150 });
      expect(body.points?.[3]).toEqual({ x: 50, y: 150 });
    });

    it('頂点配列の長さ変化（点削除）でも両方の子 Polyline に反映される', () => {
      const fivePoints = [
        { x: 150, y: 100 },
        { x: 200, y: 150 },
        { x: 175, y: 225 },
        { x: 125, y: 225 },
        { x: 100, y: 150 },
      ];
      const polyline = new PolylineShape(fivePoints);

      polyline.setPoints(fivePoints.slice(0, 3));

      const [outline, body] = getOutlineAndBody(polyline);
      expect(outline.points).toHaveLength(3);
      expect(body.points).toHaveLength(3);
    });
  });

  describe('ファクトリ関数との統合', () => {
    it('createPolyline で生成した折れ線も Group 構造を持つ', () => {
      const polyline = createPolyline(POLYLINE_POINTS);

      expect(polyline).not.toBeNull();
      expect(polyline!).toBeInstanceOf(Group);
      expect(getChildren(polyline!)).toHaveLength(2);
    });
  });
});
