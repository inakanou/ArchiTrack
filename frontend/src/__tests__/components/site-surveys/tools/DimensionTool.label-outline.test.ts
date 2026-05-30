/**
 * @fileoverview 寸法線ツール ラベル白アウトラインテスト（Task 82.2）
 *
 * Requirements:
 * - 32.12: 寸法値ラベルにテキスト白アウトライン（paintFirst='stroke'）を適用する
 *
 * テスト対象:
 * - labelText に paintFirst='stroke', stroke='#ffffff', strokeWidth=fontSize*widthRatio,
 *   strokeUniform=true が適用される
 * - setLabelOutline / getLabelOutline API
 * - setLabelOutline は outline（線部）とは独立に状態遷移する
 * - 寸法値変更時に labelText.strokeWidth が fontSize * labelOutline.widthRatio で再計算される
 *
 * Note:
 * - 線部の白縁取り（outlineLine）は Task 82.1 で実装済み
 * - シリアライズの labelOutline 拡張は Task 82.3 で対応
 *
 * @requirement site-survey/REQ-32.12
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// vi.hoistedでモック関数を定義（ホイスティング対応）
const { mockSetCoords, mockSet } = vi.hoisted(() => {
  return {
    mockSetCoords: vi.fn(),
    mockSet: vi.fn(),
  };
});

// Fabric.jsのモック（DimensionTool.outline.test.ts と同形）
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
    strokeUniform?: boolean;

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

import { Canvas } from 'fabric';

import { DimensionLine } from '../../../../components/site-surveys/tools/DimensionTool';
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
};

type ChildText = {
  text?: string;
  fontSize?: number;
  fill?: string;
  opacity?: number;
  paintFirst?: string;
  stroke?: string;
  strokeWidth?: number;
  strokeUniform?: boolean;
};

function getChildren(dim: DimensionLine): unknown[] {
  return (dim as unknown as { _objects: unknown[] })._objects;
}

function getOutlineBodyLabel(dim: DimensionLine): [ChildPath, ChildPath, ChildText] {
  const children = getChildren(dim);
  if (children.length < 3) {
    throw new Error(
      `Expected Dimension to have 3 children (outline + body + label), got ${children.length}`
    );
  }
  return [children[0] as ChildPath, children[1] as ChildPath, children[2] as ChildText];
}

function getLabel(dim: DimensionLine): ChildText {
  return getOutlineBodyLabel(dim)[2];
}

const START = { x: 100, y: 100 };
const END = { x: 300, y: 100 };

// ============================================================================
// テストスイート
// ============================================================================

describe('Dimension labelOutline (Task 82.2 / Req 32.12)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('既定の labelOutline 適用（Req 32.12）', () => {
    it('labelText に paintFirst="stroke" が初期適用される', () => {
      const dim = new DimensionLine(START, END);

      const label = getLabel(dim);
      expect(label.paintFirst).toBe('stroke');
    });

    it('labelText に stroke="#ffffff" が初期適用される', () => {
      const dim = new DimensionLine(START, END);

      const label = getLabel(dim);
      expect(label.stroke).toBe('#ffffff');
    });

    it('labelText に strokeUniform=true が初期適用される', () => {
      const dim = new DimensionLine(START, END);

      const label = getLabel(dim);
      expect(label.strokeUniform).toBe(true);
    });

    it('labelText の strokeWidth は fontSize * labelOutline.widthRatio である', () => {
      const dim = new DimensionLine(START, END);

      const label = getLabel(dim);
      const expected = (label.fontSize ?? 0) * ANNOTATION_DEFAULTS.dimensionLabelOutline.widthRatio;
      expect(label.strokeWidth).toBe(expected);
    });
  });

  describe('getLabelOutline / setLabelOutline API', () => {
    it('getLabelOutline はデフォルトで ANNOTATION_DEFAULTS.dimensionLabelOutline を返す', () => {
      const dim = new DimensionLine(START, END);

      const labelOutline = dim.getLabelOutline();

      expect(labelOutline).toEqual(ANNOTATION_DEFAULTS.dimensionLabelOutline);
    });

    it('getLabelOutline はコピーを返す（外部からの破壊を防ぐ）', () => {
      const dim = new DimensionLine(START, END);

      const outline1 = dim.getLabelOutline();
      outline1!.enabled = false;
      const outline2 = dim.getLabelOutline();

      expect(outline2!.enabled).toBe(true);
    });

    it('setLabelOutline({enabled:false}) で labelText.stroke が空文字になる', () => {
      const dim = new DimensionLine(START, END);

      dim.setLabelOutline({ enabled: false });

      const label = getLabel(dim);
      expect(label.stroke).toBe('');
      expect(dim.getLabelOutline()!.enabled).toBe(false);
    });

    it('setLabelOutline({enabled:false}) で labelText.strokeWidth が 0 になる', () => {
      const dim = new DimensionLine(START, END);

      dim.setLabelOutline({ enabled: false });

      const label = getLabel(dim);
      expect(label.strokeWidth).toBe(0);
    });

    it('setLabelOutline({enabled:true}) で labelText.paintFirst/stroke/strokeUniform が再適用される', () => {
      const dim = new DimensionLine(START, END);
      dim.setLabelOutline({ enabled: false });

      dim.setLabelOutline({ enabled: true });

      const label = getLabel(dim);
      expect(label.paintFirst).toBe('stroke');
      expect(label.stroke).toBe('#ffffff');
      expect(label.strokeUniform).toBe(true);
    });

    it('setLabelOutline({enabled:true, widthRatio:0.15}) で strokeWidth = fontSize * 0.15 になる', () => {
      const dim = new DimensionLine(START, END);

      dim.setLabelOutline({ enabled: true, widthRatio: 0.15 });

      const label = getLabel(dim);
      const expected = (label.fontSize ?? 0) * 0.15;
      expect(label.strokeWidth).toBe(expected);
      expect(dim.getLabelOutline()!.widthRatio).toBe(0.15);
    });

    it('setLabelOutline({widthRatio:0.18}) で widthRatio のみ更新される（enabled は保持）', () => {
      const dim = new DimensionLine(START, END);

      dim.setLabelOutline({ widthRatio: 0.18 });

      const outline = dim.getLabelOutline()!;
      expect(outline.enabled).toBe(true);
      expect(outline.widthRatio).toBe(0.18);
    });
  });

  describe('寸法値変更時の strokeWidth 再計算（Req 32.12）', () => {
    it('setDimensionWithLabel で寸法値を設定後、labelText.strokeWidth が再計算される', () => {
      const canvas = new Canvas();
      const dim = new DimensionLine(START, END);

      dim.setDimensionWithLabel(canvas, '200', 'mm');

      const label = getLabel(dim);
      const expected = (label.fontSize ?? 0) * ANNOTATION_DEFAULTS.dimensionLabelOutline.widthRatio;
      expect(label.strokeWidth).toBe(expected);
    });

    it('setDimensionWithLabel でフォントサイズも変更された場合、strokeWidth = 新fontSize * widthRatio で再計算される', () => {
      const canvas = new Canvas();
      const dim = new DimensionLine(START, END);

      dim.setDimensionWithLabel(canvas, '200', 'mm', { fontSize: 24 });

      const label = getLabel(dim);
      const expected = 24 * ANNOTATION_DEFAULTS.dimensionLabelOutline.widthRatio;
      expect(label.strokeWidth).toBe(expected);
    });

    it('setLabelStyle({fontSize}) でも labelText.strokeWidth が再計算される', () => {
      const dim = new DimensionLine(START, END);

      dim.setLabelStyle({ fontSize: 20 });

      const label = getLabel(dim);
      const expected = 20 * ANNOTATION_DEFAULTS.dimensionLabelOutline.widthRatio;
      expect(label.strokeWidth).toBe(expected);
    });

    it('labelOutline.enabled=false のとき setDimensionWithLabel しても strokeWidth は 0 のまま', () => {
      const canvas = new Canvas();
      const dim = new DimensionLine(START, END);
      dim.setLabelOutline({ enabled: false });

      dim.setDimensionWithLabel(canvas, '200', 'mm');

      const label = getLabel(dim);
      expect(label.strokeWidth).toBe(0);
      expect(label.stroke).toBe('');
    });
  });

  describe('outline と labelOutline の独立性（Req 32.12）', () => {
    it('setOutline({enabled:false}) で線部のみ消え、labelText の stroke は影響を受けない', () => {
      const dim = new DimensionLine(START, END);

      dim.setOutline({ enabled: false });

      const [outline, , label] = getOutlineBodyLabel(dim);
      expect(outline.opacity).toBe(0);
      // labelText の paintFirst/stroke は維持される
      expect(label.paintFirst).toBe('stroke');
      expect(label.stroke).toBe('#ffffff');
    });

    it('setLabelOutline({enabled:false}) でラベルのみ消え、outlineLine は影響を受けない', () => {
      const dim = new DimensionLine(START, END);

      dim.setLabelOutline({ enabled: false });

      const [outline, , label] = getOutlineBodyLabel(dim);
      // outlineLine は維持される
      expect(outline.opacity).toBe(1);
      expect(outline.stroke).toBe('#ffffff');
      // labelText の stroke のみ消える
      expect(label.stroke).toBe('');
    });

    it('setOutline と setLabelOutline は独立に true/false 切替できる', () => {
      const dim = new DimensionLine(START, END);

      dim.setOutline({ enabled: false });
      dim.setLabelOutline({ enabled: true });

      expect(dim.getOutline()!.enabled).toBe(false);
      expect(dim.getLabelOutline()!.enabled).toBe(true);

      dim.setOutline({ enabled: true });
      dim.setLabelOutline({ enabled: false });

      expect(dim.getOutline()!.enabled).toBe(true);
      expect(dim.getLabelOutline()!.enabled).toBe(false);
    });

    it('setLabelOutline({enabled:false}) は outlineLine の strokeWidth に影響しない', () => {
      const dim = new DimensionLine(START, END, { strokeWidth: 3 });
      const [outlineBefore] = getOutlineBodyLabel(dim);
      const outlineStrokeWidthBefore = outlineBefore.strokeWidth;

      dim.setLabelOutline({ enabled: false });

      const [outlineAfter] = getOutlineBodyLabel(dim);
      expect(outlineAfter.strokeWidth).toBe(outlineStrokeWidthBefore);
    });
  });
});
