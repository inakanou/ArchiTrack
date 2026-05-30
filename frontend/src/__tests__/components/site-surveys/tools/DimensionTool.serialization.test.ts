/**
 * @fileoverview 寸法線ツール outline / labelOutline シリアライズ/復元テスト（Task 82.3）
 *
 * Requirements:
 * - 32.5: 白縁取りの有効/無効をユーザーが任意に切替可能にする（API レベル）
 * - 32.6: 白縁取り属性（有効/無効・縁取り幅）を注釈データに含めて永続化する
 * - 32.7: 保存された白縁取り属性を復元して表示する
 * - 32.9: outline 未定義の旧データは白縁取り無しの従来表現で表示する（後方互換）
 * - 32.10: 白縁取りの有効化/無効化切替操作を Undo/Redo 履歴に記録する
 *
 * テスト対象:
 * - DimensionLine.toObject() が outline / labelOutline 属性をそれぞれ独立に含めて返す
 * - DimensionLine.fromObject(validJson) が outline / labelOutline 属性を独立に復元する（round-trip）
 * - outline 未定義の旧 JSON 復元で outlineLine.opacity=0（従来表現）に戻る
 * - labelOutline 未定義の旧 JSON 復元で labelText.stroke=''（paintFirst なし従来表現）に戻る
 * - outline と labelOutline は片方のみ定義/未定義の混合パターンでも独立に復元される
 * - 不正データは安全な既定値 + console.warn で防御的に復元される
 *
 * @requirement site-survey/REQ-32.5
 * @requirement site-survey/REQ-32.6
 * @requirement site-survey/REQ-32.7
 * @requirement site-survey/REQ-32.9
 * @requirement site-survey/REQ-32.10
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// vi.hoistedでモック関数を定義（ホイスティング対応）
const { mockSetCoords, mockSet } = vi.hoisted(() => {
  return {
    mockSetCoords: vi.fn(),
    mockSet: vi.fn(),
  };
});

// Fabric.js のモック（DimensionTool.outline.test.ts / label-outline.test.ts と同形）
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

function getOutlinePath(dim: DimensionLine): ChildPath {
  return getOutlineBodyLabel(dim)[0];
}

function getLabel(dim: DimensionLine): ChildText {
  return getOutlineBodyLabel(dim)[2];
}

const START = { x: 100, y: 100 };
const END = { x: 300, y: 100 };

// ============================================================================
// テストスイート
// ============================================================================

describe('Dimension シリアライズ/復元 (Task 82.3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // toObject() に outline / labelOutline を含める（Req 32.6）
  // ==========================================================================

  describe('toObject() が outline / labelOutline 属性を独立に含める（Req 32.6）', () => {
    it('デフォルトで outline 属性を含む（ANNOTATION_DEFAULTS.dimensionOutline）', () => {
      const dim = new DimensionLine(START, END);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const json = dim.toObject() as any;

      expect(json.outline).toBeDefined();
      expect(json.outline).toEqual(ANNOTATION_DEFAULTS.dimensionOutline);
    });

    it('デフォルトで labelOutline 属性を含む（ANNOTATION_DEFAULTS.dimensionLabelOutline）', () => {
      const dim = new DimensionLine(START, END);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const json = dim.toObject() as any;

      expect(json.labelOutline).toBeDefined();
      expect(json.labelOutline).toEqual(ANNOTATION_DEFAULTS.dimensionLabelOutline);
    });

    it('setOutline({ enabled: false }) 後、toObject で outline.enabled === false が出力される', () => {
      const dim = new DimensionLine(START, END);

      dim.setOutline({ enabled: false });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const json = dim.toObject() as any;

      expect(json.outline).toBeDefined();
      expect(json.outline.enabled).toBe(false);
    });

    it('setLabelOutline({ enabled: false }) 後、toObject で labelOutline.enabled === false が出力される', () => {
      const dim = new DimensionLine(START, END);

      dim.setLabelOutline({ enabled: false });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const json = dim.toObject() as any;

      expect(json.labelOutline).toBeDefined();
      expect(json.labelOutline.enabled).toBe(false);
    });

    it('outline と labelOutline は独立に出力される（labelOutline=false でも outline は維持）', () => {
      const dim = new DimensionLine(START, END);

      dim.setLabelOutline({ enabled: false });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const json = dim.toObject() as any;

      // outline は既定（enabled=true）のまま
      expect(json.outline.enabled).toBe(true);
      // labelOutline のみ false
      expect(json.labelOutline.enabled).toBe(false);
    });

    it('outline と labelOutline は独立に出力される（outline=false でも labelOutline は維持）', () => {
      const dim = new DimensionLine(START, END);

      dim.setOutline({ enabled: false });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const json = dim.toObject() as any;

      expect(json.outline.enabled).toBe(false);
      // labelOutline は既定（enabled=true）のまま
      expect(json.labelOutline.enabled).toBe(true);
    });

    it('setOutline({ width: 5 }) 後、toObject で outline.width === 5 が出力される', () => {
      const dim = new DimensionLine(START, END);

      dim.setOutline({ width: 5 });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const json = dim.toObject() as any;

      expect(json.outline.width).toBe(5);
    });

    it('setLabelOutline({ widthRatio: 0.2 }) 後、toObject で labelOutline.widthRatio === 0.2 が出力される', () => {
      const dim = new DimensionLine(START, END);

      dim.setLabelOutline({ widthRatio: 0.2 });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const json = dim.toObject() as any;

      expect(json.labelOutline.widthRatio).toBe(0.2);
    });

    it('既存の startPoint/endPoint/stroke/strokeWidth/capLength も引き続き含まれる', () => {
      const dim = new DimensionLine(START, END, {
        stroke: '#00ff00',
        strokeWidth: 5,
        capLength: 12,
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const json = dim.toObject() as any;

      expect(json.type).toBe('dimensionLine');
      expect(json.startPoint).toEqual(START);
      expect(json.endPoint).toEqual(END);
      expect(json.stroke).toBe('#00ff00');
      expect(json.strokeWidth).toBe(5);
      expect(json.capLength).toBe(12);
    });
  });

  // ==========================================================================
  // fromObject() で outline / labelOutline を復元する（Req 32.7）
  // ==========================================================================

  describe('fromObject() が outline / labelOutline 属性を独立に復元する（Req 32.7）', () => {
    it('有効な JSON（outline + labelOutline 付き）から DimensionLine を復元し、両方が一致する', async () => {
      const json = {
        type: 'dimensionLine' as const,
        startPoint: START,
        endPoint: END,
        stroke: '#ff0000',
        strokeWidth: 4,
        capLength: 10,
        customData: { dimensionValue: '5', dimensionUnit: 'm' },
        outline: { enabled: true, color: '#ffffff', width: 3 },
        labelOutline: { enabled: true, widthRatio: 0.15 },
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const dim = await DimensionLine.fromObject(json as any);

      expect(dim.getOutline()).toEqual({ enabled: true, color: '#ffffff', width: 3 });
      expect(dim.getLabelOutline()).toEqual({ enabled: true, widthRatio: 0.15 });
    });

    it('toObject → fromObject のラウンドトリップで outline と labelOutline が独立に保持される', async () => {
      const original = new DimensionLine(START, END, { strokeWidth: 3 });
      original.setOutline({ enabled: true, width: 4 });
      original.setLabelOutline({ enabled: true, widthRatio: 0.18 });

      const json = original.toObject();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const restored = await DimensionLine.fromObject(json as any);

      expect(restored.getOutline()).toEqual({ enabled: true, color: '#ffffff', width: 4 });
      expect(restored.getLabelOutline()).toEqual({ enabled: true, widthRatio: 0.18 });
    });

    it('outline.enabled=false の JSON から復元すると outlineLine.opacity が 0 になる', async () => {
      const json = {
        type: 'dimensionLine' as const,
        startPoint: START,
        endPoint: END,
        stroke: '#ff0000',
        strokeWidth: 3,
        capLength: 10,
        customData: { dimensionValue: '', dimensionUnit: '' },
        outline: { enabled: false, color: '#ffffff', width: 2 },
        labelOutline: { enabled: true, widthRatio: 0.12 },
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const dim = await DimensionLine.fromObject(json as any);

      expect(dim.getOutline()!.enabled).toBe(false);
      expect(getOutlinePath(dim).opacity).toBe(0);
    });

    it('labelOutline.enabled=false の JSON から復元すると labelText.stroke が "" になる', async () => {
      const json = {
        type: 'dimensionLine' as const,
        startPoint: START,
        endPoint: END,
        stroke: '#ff0000',
        strokeWidth: 3,
        capLength: 10,
        customData: { dimensionValue: '', dimensionUnit: '' },
        outline: { enabled: true, color: '#ffffff', width: 2 },
        labelOutline: { enabled: false, widthRatio: 0.12 },
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const dim = await DimensionLine.fromObject(json as any);

      expect(dim.getLabelOutline()!.enabled).toBe(false);
      expect(getLabel(dim).stroke).toBe('');
      expect(getLabel(dim).strokeWidth).toBe(0);
    });

    it('ラウンドトリップで本体属性も保持される（startPoint/endPoint/stroke/strokeWidth/capLength）', async () => {
      const original = new DimensionLine(START, END, {
        stroke: '#123456',
        strokeWidth: 5,
        capLength: 14,
      });

      const json = original.toObject();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const restored = await DimensionLine.fromObject(json as any);

      expect(restored.startPoint).toEqual(START);
      expect(restored.endPoint).toEqual(END);
      const style = restored.getStyle();
      expect(style.stroke).toBe('#123456');
      expect(style.strokeWidth).toBe(5);
      expect(style.capLength).toBe(14);
    });
  });

  // ==========================================================================
  // outline 未定義の旧データは従来表現で復元（Req 32.9 後方互換）
  // ==========================================================================

  describe('outline 未定義の旧データは従来表現で復元する（Req 32.9 後方互換）', () => {
    it('outline / labelOutline ともに欠落 JSON でも例外にならず DimensionLine を返す', async () => {
      const legacyJson = {
        type: 'dimensionLine' as const,
        startPoint: START,
        endPoint: END,
        stroke: '#ff0000',
        strokeWidth: 3,
        capLength: 10,
        customData: { dimensionValue: '', dimensionUnit: '' },
      };

      await expect(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        DimensionLine.fromObject(legacyJson as any)
      ).resolves.toBeInstanceOf(DimensionLine);
    });

    it('outline 未定義の旧 JSON から復元した DimensionLine は outline.enabled=false になる', async () => {
      const legacyJson = {
        type: 'dimensionLine' as const,
        startPoint: START,
        endPoint: END,
        stroke: '#ff0000',
        strokeWidth: 3,
        capLength: 10,
        customData: { dimensionValue: '', dimensionUnit: '' },
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const dim = await DimensionLine.fromObject(legacyJson as any);

      const outline = dim.getOutline();
      expect(outline).toBeDefined();
      expect(outline!.enabled).toBe(false);
    });

    it('outline 未定義の旧 JSON から復元した DimensionLine は outlineLine.opacity === 0 である', async () => {
      const legacyJson = {
        type: 'dimensionLine' as const,
        startPoint: START,
        endPoint: END,
        stroke: '#ff0000',
        strokeWidth: 3,
        capLength: 10,
        customData: { dimensionValue: '', dimensionUnit: '' },
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const dim = await DimensionLine.fromObject(legacyJson as any);

      expect(getOutlinePath(dim).opacity).toBe(0);
    });

    it('labelOutline 未定義の旧 JSON から復元した DimensionLine は labelOutline.enabled=false になる', async () => {
      const legacyJson = {
        type: 'dimensionLine' as const,
        startPoint: START,
        endPoint: END,
        stroke: '#ff0000',
        strokeWidth: 3,
        capLength: 10,
        customData: { dimensionValue: '', dimensionUnit: '' },
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const dim = await DimensionLine.fromObject(legacyJson as any);

      const labelOutline = dim.getLabelOutline();
      expect(labelOutline).toBeDefined();
      expect(labelOutline!.enabled).toBe(false);
    });

    it('labelOutline 未定義の旧 JSON から復元した DimensionLine は labelText.stroke === "" である', async () => {
      const legacyJson = {
        type: 'dimensionLine' as const,
        startPoint: START,
        endPoint: END,
        stroke: '#ff0000',
        strokeWidth: 3,
        capLength: 10,
        customData: { dimensionValue: '', dimensionUnit: '' },
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const dim = await DimensionLine.fromObject(legacyJson as any);

      expect(getLabel(dim).stroke).toBe('');
      expect(getLabel(dim).strokeWidth).toBe(0);
    });
  });

  // ==========================================================================
  // 混合パターン: outline と labelOutline の独立復元
  // ==========================================================================

  describe('outline と labelOutline の混合復元パターン（独立復元）', () => {
    it('outline 定義 + labelOutline 欠落 → outline は復元、labelOutline は従来表現', async () => {
      const json = {
        type: 'dimensionLine' as const,
        startPoint: START,
        endPoint: END,
        stroke: '#ff0000',
        strokeWidth: 3,
        capLength: 10,
        customData: { dimensionValue: '', dimensionUnit: '' },
        outline: { enabled: true, color: '#ffffff', width: 5 },
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const dim = await DimensionLine.fromObject(json as any);

      // outline は JSON の値で復元
      expect(dim.getOutline()).toEqual({ enabled: true, color: '#ffffff', width: 5 });
      // labelOutline は従来表現（enabled=false / stroke=''）に復元
      expect(dim.getLabelOutline()!.enabled).toBe(false);
      expect(getLabel(dim).stroke).toBe('');
    });

    it('outline 欠落 + labelOutline 定義 → outline は従来表現、labelOutline は復元', async () => {
      const json = {
        type: 'dimensionLine' as const,
        startPoint: START,
        endPoint: END,
        stroke: '#ff0000',
        strokeWidth: 3,
        capLength: 10,
        customData: { dimensionValue: '', dimensionUnit: '' },
        labelOutline: { enabled: true, widthRatio: 0.2 },
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const dim = await DimensionLine.fromObject(json as any);

      // outline は従来表現（enabled=false / opacity=0）に復元
      expect(dim.getOutline()!.enabled).toBe(false);
      expect(getOutlinePath(dim).opacity).toBe(0);
      // labelOutline は JSON の値で復元
      expect(dim.getLabelOutline()).toEqual({ enabled: true, widthRatio: 0.2 });
    });

    it('outline=true + labelOutline=false → 両方独立に復元される', async () => {
      const json = {
        type: 'dimensionLine' as const,
        startPoint: START,
        endPoint: END,
        stroke: '#ff0000',
        strokeWidth: 3,
        capLength: 10,
        customData: { dimensionValue: '', dimensionUnit: '' },
        outline: { enabled: true, color: '#ffffff', width: 3 },
        labelOutline: { enabled: false, widthRatio: 0.12 },
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const dim = await DimensionLine.fromObject(json as any);

      expect(dim.getOutline()!.enabled).toBe(true);
      expect(getOutlinePath(dim).opacity).toBe(1);
      expect(dim.getLabelOutline()!.enabled).toBe(false);
      expect(getLabel(dim).stroke).toBe('');
    });

    it('outline=false + labelOutline=true → 両方独立に復元される', async () => {
      const json = {
        type: 'dimensionLine' as const,
        startPoint: START,
        endPoint: END,
        stroke: '#ff0000',
        strokeWidth: 3,
        capLength: 10,
        customData: { dimensionValue: '', dimensionUnit: '' },
        outline: { enabled: false, color: '#ffffff', width: 3 },
        labelOutline: { enabled: true, widthRatio: 0.15 },
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const dim = await DimensionLine.fromObject(json as any);

      expect(dim.getOutline()!.enabled).toBe(false);
      expect(getOutlinePath(dim).opacity).toBe(0);
      expect(dim.getLabelOutline()!.enabled).toBe(true);
      expect(getLabel(dim).stroke).toBe('#ffffff');
    });
  });

  // ==========================================================================
  // 防御的フォールバック（design.md: 必須フィールド欠落時）
  // ==========================================================================

  describe('防御的フォールバック: 必須フィールド欠落時は安全な既定で復元する', () => {
    it('startPoint 欠落の JSON で console.warn が発行され、安全な既定で復元される', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const bad = {
        type: 'dimensionLine' as const,
        endPoint: END,
        stroke: '#000000',
        strokeWidth: 2,
        capLength: 10,
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const dim = await DimensionLine.fromObject(bad as any);

      expect(warnSpy).toHaveBeenCalled();
      expect(dim).toBeInstanceOf(DimensionLine);
    });

    it('endPoint 欠落の JSON で console.warn が発行され、安全な既定で復元される', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const bad = {
        type: 'dimensionLine' as const,
        startPoint: START,
        stroke: '#000000',
        strokeWidth: 2,
        capLength: 10,
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const dim = await DimensionLine.fromObject(bad as any);

      expect(warnSpy).toHaveBeenCalled();
      expect(dim).toBeInstanceOf(DimensionLine);
    });

    it('startPoint に x が欠落している JSON で console.warn が発行され、安全な既定で復元される', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const bad = {
        type: 'dimensionLine' as const,
        startPoint: { y: 10 },
        endPoint: END,
        stroke: '#000000',
        strokeWidth: 2,
        capLength: 10,
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const dim = await DimensionLine.fromObject(bad as any);

      expect(warnSpy).toHaveBeenCalled();
      expect(dim).toBeInstanceOf(DimensionLine);
    });

    it('stroke 欠落の JSON で安全な既定 stroke=#000000, strokeWidth=2 で復元される', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const bad = {
        type: 'dimensionLine' as const,
        startPoint: START,
        endPoint: END,
        capLength: 10,
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const dim = await DimensionLine.fromObject(bad as any);

      expect(warnSpy).toHaveBeenCalled();
      expect(dim).toBeInstanceOf(DimensionLine);
      const style = dim.getStyle();
      expect(style.stroke).toBe('#000000');
      expect(style.strokeWidth).toBe(2);
    });

    it('null を渡しても例外を投げず DimensionLine を返す', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const dim = await DimensionLine.fromObject(null as any);

      expect(warnSpy).toHaveBeenCalled();
      expect(dim).toBeInstanceOf(DimensionLine);
    });

    it('undefined を渡しても例外を投げず DimensionLine を返す', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const dim = await DimensionLine.fromObject(undefined as any);

      expect(warnSpy).toHaveBeenCalled();
      expect(dim).toBeInstanceOf(DimensionLine);
    });

    it('不正データでも outline / labelOutline は従来表現（enabled=false）で復元される', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const bad = {
        type: 'dimensionLine' as const,
        // startPoint / endPoint 欠落
        stroke: '#000000',
        strokeWidth: 2,
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const dim = await DimensionLine.fromObject(bad as any);

      expect(warnSpy).toHaveBeenCalled();
      expect(dim.getOutline()!.enabled).toBe(false);
      expect(dim.getLabelOutline()!.enabled).toBe(false);
    });
  });
});
