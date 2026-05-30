/**
 * @fileoverview 寸法線ツール 白縁取り構造テスト（Task 82.1）
 *
 * Requirements:
 * - 32.1: 矢印以外の形状（寸法線・円・四角形・多角形・折れ線・フリーハンド）にも白色縁取りを付与する
 * - 32.2: 白縁取り線幅を本体線幅の 1.5 倍以上に設定する
 * - 32.3: 本体色を変更しても白縁取りは白のまま維持する
 * - 32.4: 移動・リサイズ・回転・形状変形（端点移動等）時に本体と同期して白縁取りを変形する
 *
 * テスト対象:
 * - DimensionLine extends Group（3つの子: outlineLine + bodyLine + labelText）
 * - setStroke / setStrokeWidth / setOutline / getOutline の挙動
 * - 線の端点・接合は round（視認性確保）
 * - Group 構造は setOutline({enabled:false}) でも維持される
 * - 端点更新時に outlineLine と bodyLine の path data を同期更新する
 * - setOutline({enabled:false}) で outlineLine.opacity = 0 になり labelText は影響を受けない
 *
 * Note:
 * - 本 82.1 では「線部の白縁取り（outlineLine）」のみを実装する。
 * - labelText の paintFirst 白アウトラインは Task 82.2 で適用する。
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
  class MockPath {
    path: string;
    stroke?: string;
    strokeWidth?: number;
    fill?: string;
    opacity?: number;
    strokeLineCap?: string;
    strokeLineJoin?: string;
    originX?: string;
    originY?: string;
    selectable?: boolean;
    evented?: boolean;
    hasControls?: boolean;
    hasBorders?: boolean;
    objectCaching?: boolean;

    constructor(pathData?: string, options?: Record<string, unknown>) {
      this.path = pathData || '';
      this.opacity = 1;
      this.fill = '';
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

    _setPath(pathData: string): void {
      this.path = pathData;
    }

    toObject(): Record<string, unknown> {
      return {};
    }
  }

  class MockFabricText {
    text: string;
    fontSize?: number;
    fill?: string;
    fontFamily?: string;
    left?: number;
    top?: number;
    width: number;
    height: number;
    selectable?: boolean;
    evented?: boolean;
    opacity?: number;
    paintFirst?: string;
    stroke?: string;
    strokeWidth?: number;

    constructor(text: string, options?: Record<string, unknown>) {
      this.text = text;
      this.width = Math.max(1, text.length * 7);
      this.height = 14;
      this.opacity = 1;
      if (options) {
        Object.assign(this, options);
      }
    }

    set(options: Record<string, unknown> | string, value?: unknown): this {
      if (typeof options === 'string') {
        (this as Record<string, unknown>)[options] = value;
      } else {
        Object.assign(this, options);
        if (options.text !== undefined) {
          this.text = options.text as string;
          this.width = Math.max(1, (options.text as string).length * 7);
        }
      }
      mockSet(options, value);
      return this;
    }
  }

  class MockRect {
    left?: number;
    top?: number;
    width?: number;
    height?: number;
    fill?: string;
    selectable?: boolean;
    evented?: boolean;

    constructor(options?: Record<string, unknown>) {
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
      return this;
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
  }

  class MockCanvas {
    _objects: unknown[] = [];
    add(object: unknown): void {
      this._objects.push(object);
    }
    remove(object: unknown): void {
      const index = this._objects.indexOf(object);
      if (index > -1) {
        this._objects.splice(index, 1);
      }
    }
    renderAll(): void {
      // no-op
    }
  }

  return {
    Path: MockPath,
    FabricText: MockFabricText,
    Rect: MockRect,
    Group: MockGroup,
    Canvas: MockCanvas,
  };
});

import { Group } from 'fabric';

import {
  DimensionLine,
  createDimensionLine,
} from '../../../../components/site-surveys/tools/DimensionTool';
import { ANNOTATION_DEFAULTS } from '../../../../components/site-surveys/annotation-style-tokens';

// ============================================================================
// ヘルパー
// ============================================================================

type ChildPath = {
  path?: string;
  stroke?: string;
  strokeWidth?: number;
  fill?: string;
  opacity?: number;
  strokeLineCap?: string;
  strokeLineJoin?: string;
};

type ChildText = {
  text?: string;
  fontSize?: number;
  fill?: string;
  opacity?: number;
};

function getChildren(dim: DimensionLine): unknown[] {
  return (dim as unknown as { _objects: unknown[] })._objects;
}

/**
 * Group の 3 つの子（outlineLine, bodyLine, labelText）をタプルとして取得する。
 * Task 82.1 の Dimension は 3 つの子を持つことが不変条件。
 */
function getOutlineBodyLabel(dim: DimensionLine): [ChildPath, ChildPath, ChildText] {
  const children = getChildren(dim);
  if (children.length < 3) {
    throw new Error(
      `Expected Dimension to have 3 children (outline + body + label), got ${children.length}`
    );
  }
  return [children[0] as ChildPath, children[1] as ChildPath, children[2] as ChildText];
}

const START = { x: 100, y: 100 };
const END = { x: 300, y: 100 };

// ============================================================================
// テストスイート
// ============================================================================

describe('Dimension (Group + 線部白縁取り)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Group 構造（Req 32.1）', () => {
    it('DimensionLine は Fabric.js Group を継承している', () => {
      const dim = new DimensionLine(START, END);

      expect(dim).toBeInstanceOf(Group);
    });

    it('DimensionLine は 3 つの子（outlineLine + bodyLine + labelText）を持つ', () => {
      const dim = new DimensionLine(START, END);

      const children = getChildren(dim);
      expect(children).toHaveLength(3);
    });

    it('外側 outlineLine が最初、本体 bodyLine が次、labelText が最後の順で配置される', () => {
      const bodyColor = '#ff0000';
      const dim = new DimensionLine(START, END, { stroke: bodyColor });

      const [outline, body, label] = getOutlineBodyLabel(dim);
      expect(outline.stroke).toBe('#ffffff');
      expect(body.stroke).toBe(bodyColor);
      // labelText は FabricText（text プロパティを持つ）
      expect(label.text).toBeDefined();
    });

    it('type プロパティは "dimensionLine" を維持する（classRegistry 後方互換）', () => {
      const dim = new DimensionLine(START, END);

      expect(dim.type).toBe('dimensionLine');
    });

    it('outlineLine と bodyLine は同じ path データを持つ', () => {
      const dim = new DimensionLine(START, END);

      const [outline, body] = getOutlineBodyLabel(dim);
      expect(outline.path).toBeDefined();
      expect(outline.path).toBe(body.path);
    });
  });

  describe('白縁取りの視認性（Req 32.2）', () => {
    it('outlineLine の線幅は本体線幅 + outline.width * 2 である', () => {
      const dim = new DimensionLine(START, END, { strokeWidth: 3 });

      const [outline, body] = getOutlineBodyLabel(dim);
      expect(body.strokeWidth).toBe(3);
      expect(outline.strokeWidth).toBe(3 + ANNOTATION_DEFAULTS.dimensionOutline.width * 2);
    });

    it('白縁取り線幅は本体線幅の 1.5 倍以上である（既定）', () => {
      const dim = new DimensionLine(START, END, { strokeWidth: 3 });

      const [outline, body] = getOutlineBodyLabel(dim);
      expect((outline.strokeWidth ?? 0) / (body.strokeWidth ?? 1)).toBeGreaterThanOrEqual(1.5);
    });

    it('outlineLine は strokeLineCap: round / strokeLineJoin: round を適用する', () => {
      const dim = new DimensionLine(START, END);

      const [outline] = getOutlineBodyLabel(dim);
      expect(outline.strokeLineCap).toBe('round');
      expect(outline.strokeLineJoin).toBe('round');
    });

    it('outlineLine の stroke は白（#ffffff）である', () => {
      const dim = new DimensionLine(START, END);

      const [outline] = getOutlineBodyLabel(dim);
      expect(outline.stroke).toBe('#ffffff');
    });
  });

  describe('本体色変更で白縁取りは白のまま（Req 32.3）', () => {
    it('setStroke で本体色を変更しても outlineLine は白を維持', () => {
      const dim = new DimensionLine(START, END, { stroke: '#ff0000' });

      dim.setStroke('#00ff00');

      const [outline, body] = getOutlineBodyLabel(dim);
      expect(outline.stroke).toBe('#ffffff');
      expect(body.stroke).toBe('#00ff00');
    });

    it('setStrokeWidth 更新時、outlineLine の線幅も連動する（本体+outline.width*2）', () => {
      const dim = new DimensionLine(START, END);

      dim.setStrokeWidth(5);

      const [outline, body] = getOutlineBodyLabel(dim);
      expect(body.strokeWidth).toBe(5);
      expect(outline.strokeWidth).toBe(5 + ANNOTATION_DEFAULTS.dimensionOutline.width * 2);
    });
  });

  describe('outline 属性の API', () => {
    it('getOutline はデフォルトで ANNOTATION_DEFAULTS.dimensionOutline を返す', () => {
      const dim = new DimensionLine(START, END);

      const outline = dim.getOutline();

      expect(outline).toEqual(ANNOTATION_DEFAULTS.dimensionOutline);
    });

    it('getOutline はコピーを返す（外部からの破壊を防ぐ）', () => {
      const dim = new DimensionLine(START, END);

      const outline1 = dim.getOutline();
      outline1!.color = '#000000';
      const outline2 = dim.getOutline();

      expect(outline2!.color).toBe('#ffffff');
    });

    it('setOutline({ enabled: false }) で outlineLine の opacity が 0 になる', () => {
      const dim = new DimensionLine(START, END);

      dim.setOutline({ enabled: false });

      const [outline] = getOutlineBodyLabel(dim);
      expect(outline.opacity).toBe(0);
      expect(dim.getOutline()!.enabled).toBe(false);
    });

    it('setOutline({ enabled: true }) で outlineLine の opacity が 1 に戻る', () => {
      const dim = new DimensionLine(START, END);
      dim.setOutline({ enabled: false });

      dim.setOutline({ enabled: true });

      const [outline] = getOutlineBodyLabel(dim);
      expect(outline.opacity).toBe(1);
      expect(dim.getOutline()!.enabled).toBe(true);
    });

    it('setOutline({ width: 4 }) で outlineLine の strokeWidth が更新される', () => {
      const dim = new DimensionLine(START, END, { strokeWidth: 3 });

      dim.setOutline({ width: 4 });

      const [outline] = getOutlineBodyLabel(dim);
      expect(outline.strokeWidth).toBe(3 + 4 * 2);
      expect(dim.getOutline()!.width).toBe(4);
    });

    it('setOutline で Group 構造（子の数）は維持される（enabled=false でも remove しない）', () => {
      const dim = new DimensionLine(START, END);

      dim.setOutline({ enabled: false });

      expect(getChildren(dim)).toHaveLength(3);
    });

    it('setOutline({ enabled: false }) は labelText には影響しない（独立 2 属性）', () => {
      const dim = new DimensionLine(START, END);
      const [, , labelBefore] = getOutlineBodyLabel(dim);
      const beforeOpacity = labelBefore.opacity;

      dim.setOutline({ enabled: false });

      const [, , labelAfter] = getOutlineBodyLabel(dim);
      expect(labelAfter.opacity).toBe(beforeOpacity);
    });
  });

  describe('端点同期（Req 32.4）', () => {
    it('setStartPoint で始点を更新すると outlineLine と bodyLine の path が同期更新される', () => {
      const dim = new DimensionLine(START, END);
      const [outlineBefore, bodyBefore] = getOutlineBodyLabel(dim);
      const oldPath = outlineBefore.path;

      dim.setStartPoint({ x: 50, y: 50 });

      const [outlineAfter, bodyAfter] = getOutlineBodyLabel(dim);
      expect(outlineAfter.path).not.toBe(oldPath);
      expect(outlineAfter.path).toBe(bodyAfter.path);
      // 参照の同一性（remove/再作成ではなく既存子の更新）
      expect(outlineBefore).toBe(outlineAfter);
      expect(bodyBefore).toBe(bodyAfter);
    });

    it('setEndPoint で終点を更新すると outlineLine と bodyLine の path が同期更新される', () => {
      const dim = new DimensionLine(START, END);

      dim.setEndPoint({ x: 500, y: 100 });

      const [outline, body] = getOutlineBodyLabel(dim);
      expect(outline.path).toBe(body.path);
    });

    it('setEndpoints で両端点を同時に更新すると outlineLine と bodyLine の path が同期更新される', () => {
      const dim = new DimensionLine(START, END);

      dim.setEndpoints({ x: 50, y: 50 }, { x: 400, y: 200 });

      const [outline, body] = getOutlineBodyLabel(dim);
      expect(outline.path).toBe(body.path);
    });
  });

  describe('ファクトリ関数との統合', () => {
    it('createDimensionLine で生成した寸法線も Group 構造を持つ', () => {
      const dim = createDimensionLine(START, END);

      expect(dim).not.toBeNull();
      expect(dim!).toBeInstanceOf(Group);
      expect(getChildren(dim!)).toHaveLength(3);
    });
  });
});
