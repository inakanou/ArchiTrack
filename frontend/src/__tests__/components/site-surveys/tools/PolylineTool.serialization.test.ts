/**
 * @fileoverview 折れ線ツール outline シリアライズ/復元テスト（Task 80.2）
 *
 * Requirements:
 * - 32.5: 白縁取りの有効/無効をユーザーが任意に切替可能にする（API レベル）
 * - 32.6: 白縁取り属性（有効/無効・縁取り幅）を注釈データに含めて永続化する
 * - 32.7: 保存された白縁取り属性を復元して表示する
 * - 32.9: outline 未定義の旧データは白縁取り無しの従来表現で表示する（後方互換）
 * - 32.10: 白縁取りの有効化/無効化切替操作を Undo/Redo 履歴に記録する
 *
 * テスト対象:
 * - PolylineShape.toObject() が outline 属性を含めて返す
 * - PolylineShape.fromObject(validJson) が outline 属性を復元する（round-trip）
 * - PolylineShape.fromObject(object without outline) が enabled=false / opacity=0 で復元する（Req 32.9）
 * - PolylineShape.fromObject(不正 JSON) が安全な既定値で復元し console.warn を出す（防御）
 * - setOutline() が canvas.fire('object:modified') を発火する（Undo 連携, Req 32.10）
 *
 * @requirement site-survey/REQ-32.5
 * @requirement site-survey/REQ-32.6
 * @requirement site-survey/REQ-32.7
 * @requirement site-survey/REQ-32.9
 * @requirement site-survey/REQ-32.10
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// vi.hoistedでモック関数を定義（ホイスティング対応）
const { mockSetCoords, mockSet, mockCanvasFire } = vi.hoisted(() => {
  return {
    mockSetCoords: vi.fn(),
    mockSet: vi.fn(),
    mockCanvasFire: vi.fn(),
  };
});

// Fabric.js のモック（PolylineTool.outline.test.ts と同一仕様ベース）
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
    canvas?: unknown;
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

import { PolylineShape } from '../../../../components/site-surveys/tools/PolylineTool';
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
  return (polyline as unknown as { _objects: ChildPolyline[] })._objects;
}

function getOutlinePolyline(polyline: PolylineShape): ChildPolyline {
  const children = getChildren(polyline);
  if (children.length < 1) {
    throw new Error(`Expected Polyline to have at least 1 child, got ${children.length}`);
  }
  return children[0] as ChildPolyline;
}

/**
 * Fabric Canvas のモック（最小実装: fire のみ）
 */
function makeMockCanvas(): { fire: ReturnType<typeof vi.fn> } {
  return { fire: mockCanvasFire };
}

const POLYLINE_POINTS = [
  { x: 100, y: 100 },
  { x: 200, y: 100 },
  { x: 150, y: 200 },
];

// ============================================================================
// テストスイート
// ============================================================================

describe('Polyline シリアライズ/復元 (Task 80.2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // toObject() に outline を含める（Req 32.6）
  // ==========================================================================

  describe('toObject() が outline 属性を含める（Req 32.6）', () => {
    it('デフォルトで outline: { enabled: true, color: "#ffffff", width } を含む', () => {
      const polyline = new PolylineShape(POLYLINE_POINTS);

      const json = polyline.toObject();

      expect(json.outline).toBeDefined();
      expect(json.outline).toEqual(ANNOTATION_DEFAULTS.polylineOutline);
    });

    it('setOutline({ enabled: false }) 後、toObject で outline.enabled === false が出力される', () => {
      const polyline = new PolylineShape(POLYLINE_POINTS);

      polyline.setOutline({ enabled: false });
      const json = polyline.toObject();

      expect(json.outline).toBeDefined();
      expect(json.outline!.enabled).toBe(false);
    });

    it('setOutline({ width: 5 }) 後、toObject で outline.width === 5 が出力される', () => {
      const polyline = new PolylineShape(POLYLINE_POINTS);

      polyline.setOutline({ width: 5 });
      const json = polyline.toObject();

      expect(json.outline!.width).toBe(5);
    });

    it('既存の points/stroke/strokeWidth/fill も引き続き含まれる', () => {
      const polyline = new PolylineShape(POLYLINE_POINTS, {
        stroke: '#00ff00',
        strokeWidth: 5,
        fill: 'transparent',
      });

      const json = polyline.toObject();

      expect(json.type).toBe('polylineShape');
      expect(json.points).toEqual(POLYLINE_POINTS);
      expect(json.stroke).toBe('#00ff00');
      expect(json.strokeWidth).toBe(5);
      expect(json.fill).toBe('transparent');
    });
  });

  // ==========================================================================
  // fromObject() で outline を復元する（Req 32.7）
  // ==========================================================================

  describe('fromObject() が outline 属性を復元する（Req 32.7）', () => {
    it('有効な JSON（outline 付き）から PolylineShape を復元し、outline が一致する', async () => {
      const json = {
        type: 'polylineShape' as const,
        points: POLYLINE_POINTS,
        stroke: '#ff0000',
        strokeWidth: 4,
        fill: 'transparent',
        outline: { enabled: true, color: '#ffffff', width: 3 },
      };

      const polyline = await PolylineShape.fromObject(json);

      const restored = polyline.getOutline();
      expect(restored).toEqual({ enabled: true, color: '#ffffff', width: 3 });
    });

    it('toObject → fromObject のラウンドトリップで outline が保持される', async () => {
      const original = new PolylineShape(POLYLINE_POINTS, { strokeWidth: 3 });
      original.setOutline({ enabled: true, width: 4 });

      const json = original.toObject();
      const restored = await PolylineShape.fromObject(json);

      expect(restored.getOutline()).toEqual({ enabled: true, color: '#ffffff', width: 4 });
    });

    it('outline.enabled=false の JSON から復元すると outlinePolyline.opacity が 0 になる', async () => {
      const json = {
        type: 'polylineShape' as const,
        points: POLYLINE_POINTS,
        stroke: '#ff0000',
        strokeWidth: 3,
        fill: 'transparent',
        outline: { enabled: false, color: '#ffffff', width: 2 },
      };

      const polyline = await PolylineShape.fromObject(json);

      expect(polyline.getOutline()!.enabled).toBe(false);
      expect(getOutlinePolyline(polyline).opacity).toBe(0);
    });

    it('ラウンドトリップで本体属性も保持される（points/stroke/strokeWidth/fill）', async () => {
      const original = new PolylineShape(POLYLINE_POINTS, {
        stroke: '#123456',
        strokeWidth: 5,
        fill: 'transparent',
      });

      const json = original.toObject();
      const restored = await PolylineShape.fromObject(json);

      expect(restored.getPoints()).toEqual(POLYLINE_POINTS);
      const style = restored.getStyle();
      expect(style.stroke).toBe('#123456');
      expect(style.strokeWidth).toBe(5);
      expect(style.fill).toBe('transparent');
    });

    it('ラウンドトリップで各点の x/y 座標が個別に保持される', async () => {
      const points = [
        { x: 10.5, y: 20.5 },
        { x: 100.25, y: 30.75 },
        { x: 200.0, y: 150.0 },
        { x: 50.5, y: 250.25 },
      ];
      const original = new PolylineShape(points);

      const json = original.toObject();
      const restored = await PolylineShape.fromObject(json);

      const restoredPoints = restored.getPoints();
      expect(restoredPoints).toHaveLength(4);
      expect(restoredPoints[0]).toEqual({ x: 10.5, y: 20.5 });
      expect(restoredPoints[1]).toEqual({ x: 100.25, y: 30.75 });
      expect(restoredPoints[2]).toEqual({ x: 200.0, y: 150.0 });
      expect(restoredPoints[3]).toEqual({ x: 50.5, y: 250.25 });
    });
  });

  // ==========================================================================
  // outline 未定義の旧データは従来表現で復元（Req 32.9 後方互換）
  // ==========================================================================

  describe('outline 未定義の旧データは従来表現で復元する（Req 32.9 後方互換）', () => {
    it('outline フィールド欠落 JSON でも例外にならず PolylineShape を返す', async () => {
      const legacyJson = {
        type: 'polylineShape' as const,
        points: POLYLINE_POINTS,
        stroke: '#ff0000',
        strokeWidth: 3,
        fill: 'transparent',
      };

      await expect(PolylineShape.fromObject(legacyJson)).resolves.toBeInstanceOf(PolylineShape);
    });

    it('outline 未定義の JSON から復元した PolylineShape は outline.enabled=false である', async () => {
      const legacyJson = {
        type: 'polylineShape' as const,
        points: POLYLINE_POINTS,
        stroke: '#ff0000',
        strokeWidth: 3,
        fill: 'transparent',
      };

      const polyline = await PolylineShape.fromObject(legacyJson);

      const outline = polyline.getOutline();
      expect(outline).toBeDefined();
      expect(outline!.enabled).toBe(false);
    });

    it('outline 未定義の JSON から復元した PolylineShape は outlinePolyline.opacity === 0 である', async () => {
      const legacyJson = {
        type: 'polylineShape' as const,
        points: POLYLINE_POINTS,
        stroke: '#ff0000',
        strokeWidth: 3,
        fill: 'transparent',
      };

      const polyline = await PolylineShape.fromObject(legacyJson);

      expect(getOutlinePolyline(polyline).opacity).toBe(0);
    });
  });

  // ==========================================================================
  // 防御的フォールバック（design.md: 必須フィールド欠落時）
  // ==========================================================================

  describe('防御的フォールバック: 必須フィールド欠落時は安全な既定で復元する', () => {
    it('points 欠落の JSON で console.warn が発行され、安全な既定で復元される', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const bad = {
        type: 'polylineShape' as const,
        stroke: '#000000',
        strokeWidth: 2,
        fill: 'transparent',
      } as unknown as Parameters<typeof PolylineShape.fromObject>[0];

      const polyline = await PolylineShape.fromObject(bad);

      expect(warnSpy).toHaveBeenCalled();
      expect(polyline).toBeInstanceOf(PolylineShape);
    });

    it('points が配列でない（オブジェクト）JSON で console.warn が発行され、安全な既定で復元される', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const bad = {
        type: 'polylineShape' as const,
        points: { x: 0, y: 0 },
        stroke: '#000000',
        strokeWidth: 2,
        fill: 'transparent',
      } as unknown as Parameters<typeof PolylineShape.fromObject>[0];

      const polyline = await PolylineShape.fromObject(bad);

      expect(warnSpy).toHaveBeenCalled();
      expect(polyline).toBeInstanceOf(PolylineShape);
    });

    it('各点に x が欠落している JSON で console.warn が発行され、安全な既定で復元される', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const bad = {
        type: 'polylineShape' as const,
        points: [{ y: 10 }, { y: 20 }],
        stroke: '#000000',
        strokeWidth: 2,
        fill: 'transparent',
      } as unknown as Parameters<typeof PolylineShape.fromObject>[0];

      const polyline = await PolylineShape.fromObject(bad);

      expect(warnSpy).toHaveBeenCalled();
      expect(polyline).toBeInstanceOf(PolylineShape);
    });

    it('各点に y が欠落している JSON で console.warn が発行され、安全な既定で復元される', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const bad = {
        type: 'polylineShape' as const,
        points: [{ x: 10 }, { x: 20 }],
        stroke: '#000000',
        strokeWidth: 2,
        fill: 'transparent',
      } as unknown as Parameters<typeof PolylineShape.fromObject>[0];

      const polyline = await PolylineShape.fromObject(bad);

      expect(warnSpy).toHaveBeenCalled();
      expect(polyline).toBeInstanceOf(PolylineShape);
    });

    it('stroke 欠落の JSON で安全な既定 stroke=#000000, strokeWidth=2, fill="transparent" で復元される', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const bad = {
        type: 'polylineShape' as const,
        points: POLYLINE_POINTS,
      } as unknown as Parameters<typeof PolylineShape.fromObject>[0];

      const polyline = await PolylineShape.fromObject(bad);

      expect(warnSpy).toHaveBeenCalled();
      expect(polyline).toBeInstanceOf(PolylineShape);
      const style = polyline.getStyle();
      expect(style.stroke).toBe('#000000');
      expect(style.strokeWidth).toBe(2);
      expect(style.fill).toBe('transparent');
    });

    it('null を渡しても例外を投げず PolylineShape を返す', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const polyline = await PolylineShape.fromObject(
        null as unknown as Parameters<typeof PolylineShape.fromObject>[0]
      );

      expect(warnSpy).toHaveBeenCalled();
      expect(polyline).toBeInstanceOf(PolylineShape);
    });

    it('undefined を渡しても例外を投げず PolylineShape を返す', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const polyline = await PolylineShape.fromObject(
        undefined as unknown as Parameters<typeof PolylineShape.fromObject>[0]
      );

      expect(warnSpy).toHaveBeenCalled();
      expect(polyline).toBeInstanceOf(PolylineShape);
    });
  });

  // ==========================================================================
  // setOutline と Undo/Redo 連携（Req 32.10 確認）
  // ==========================================================================

  describe('setOutline は Undo/Redo 履歴記録のため canvas.fire("object:modified") を発火する（Req 32.10）', () => {
    it('canvas が付与されている場合、setOutline で canvas.fire が "object:modified" とともに呼ばれる', () => {
      const polyline = new PolylineShape(POLYLINE_POINTS);
      const mockCanvas = makeMockCanvas();
      (polyline as unknown as { canvas: unknown }).canvas = mockCanvas;

      polyline.setOutline({ enabled: false });

      expect(mockCanvasFire).toHaveBeenCalled();
      const [eventName, payload] = mockCanvasFire.mock.calls[0] as [string, { target: unknown }];
      expect(eventName).toBe('object:modified');
      expect(payload).toBeDefined();
      expect(payload.target).toBe(polyline);
    });

    it('canvas が null（未 add）なら setOutline は例外を投げない', () => {
      const polyline = new PolylineShape(POLYLINE_POINTS);
      // canvas プロパティなし（未アタッチ）

      expect(() => polyline.setOutline({ enabled: false })).not.toThrow();
      // canvas が無ければ fire も呼ばれない
      expect(mockCanvasFire).not.toHaveBeenCalled();
    });
  });
});
