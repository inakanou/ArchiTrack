/**
 * @fileoverview 矢印ツール outline シリアライズ/復元テスト（Task 65.2）
 *
 * Requirements:
 * - 24.5: 白縁取りの有効/無効をユーザーが任意に切替可能にする（API レベル）
 * - 24.6: 白縁取り属性（有効/無効・縁取り幅）を注釈データに含めて永続化する
 * - 24.7: 保存された白縁取り属性を復元して表示する
 * - 24.9: outline 未定義の旧データは白縁取り無しの従来表現で表示する（後方互換）
 * - 24.10: 白縁取りの有効化/無効化切替操作を Undo/Redo 履歴に記録する
 *
 * テスト対象:
 * - Arrow.toObject() が outline 属性を含めて返す
 * - Arrow.fromObject(validJson) が outline 属性を復元する（round-trip）
 * - Arrow.fromObject(object without outline) が enabled=false / opacity=0 で復元する（Req 24.9）
 * - Arrow.fromObject(不正 JSON) が安全な既定値で復元し console.warn を出す（防御）
 * - setOutline() が canvas.fire('object:modified') を発火する（Undo 連携, Req 24.10）
 *
 * @requirement site-survey/REQ-24.5
 * @requirement site-survey/REQ-24.6
 * @requirement site-survey/REQ-24.7
 * @requirement site-survey/REQ-24.9
 * @requirement site-survey/REQ-24.10
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

// Fabric.js のモック（ArrowTool.outline.test.ts と同一仕様ベース）
vi.mock('fabric', () => {
  class MockPath {
    path?: string;
    stroke?: string;
    strokeWidth?: number;
    fill?: string;
    opacity?: number;
    strokeLineCap?: string;
    strokeLineJoin?: string;
    selectable?: boolean;
    evented?: boolean;
    hasControls?: boolean;
    hasBorders?: boolean;
    lockMovementX?: boolean;
    lockMovementY?: boolean;

    constructor(path?: string, options?: Record<string, unknown>) {
      this.path = path;
      if (options) {
        Object.assign(this, options);
      }
    }

    setCoords(): void {
      mockSetCoords();
    }

    _setPath(pathData: string): void {
      this.path = pathData;
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

  class MockGroup {
    _objects: unknown[];
    left?: number;
    top?: number;
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
    Path: MockPath,
    Group: MockGroup,
  };
});

import { Arrow } from '../../../../components/site-surveys/tools/ArrowTool';
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

function getChildren(arrow: Arrow): ChildPath[] {
  return (arrow as unknown as { _objects: ChildPath[] })._objects;
}

function getOutlinePath(arrow: Arrow): ChildPath {
  const children = getChildren(arrow);
  if (children.length < 1) {
    throw new Error(`Expected Arrow to have at least 1 child, got ${children.length}`);
  }
  return children[0] as ChildPath;
}

/**
 * Fabric Canvas のモック（最小実装: fire のみ）
 */
function makeMockCanvas(): { fire: ReturnType<typeof vi.fn> } {
  return { fire: mockCanvasFire };
}

// ============================================================================
// テストスイート
// ============================================================================

describe('Arrow シリアライズ/復元 (Task 65.2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // toObject() に outline を含める（Req 24.6）
  // ==========================================================================

  describe('toObject() が outline 属性を含める（Req 24.6）', () => {
    it('デフォルトで outline: { enabled: true, color: "#ffffff", width } を含む', () => {
      const arrow = new Arrow({ x: 10, y: 20 }, { x: 200, y: 100 });

      const json = arrow.toObject();

      expect(json.outline).toBeDefined();
      expect(json.outline).toEqual(ANNOTATION_DEFAULTS.arrowOutline);
    });

    it('setOutline({ enabled: false }) 後、toObject で outline.enabled === false が出力される', () => {
      const arrow = new Arrow({ x: 0, y: 0 }, { x: 100, y: 0 });

      arrow.setOutline({ enabled: false });
      const json = arrow.toObject();

      expect(json.outline).toBeDefined();
      expect(json.outline!.enabled).toBe(false);
    });

    it('setOutline({ width: 5 }) 後、toObject で outline.width === 5 が出力される', () => {
      const arrow = new Arrow({ x: 0, y: 0 }, { x: 100, y: 0 });

      arrow.setOutline({ width: 5 });
      const json = arrow.toObject();

      expect(json.outline!.width).toBe(5);
    });

    it('既存の startPoint/endPoint/stroke/strokeWidth/arrowheadSize も引き続き含まれる', () => {
      const arrow = new Arrow(
        { x: 10, y: 20 },
        { x: 200, y: 100 },
        { stroke: '#00ff00', strokeWidth: 5, arrowheadSize: 20 }
      );

      const json = arrow.toObject();

      expect(json.type).toBe('arrow');
      expect(json.startPoint).toEqual({ x: 10, y: 20 });
      expect(json.endPoint).toEqual({ x: 200, y: 100 });
      expect(json.stroke).toBe('#00ff00');
      expect(json.strokeWidth).toBe(5);
      expect(json.arrowheadSize).toBe(20);
    });
  });

  // ==========================================================================
  // fromObject() で outline を復元する（Req 24.7）
  // ==========================================================================

  describe('fromObject() が outline 属性を復元する（Req 24.7）', () => {
    it('有効な JSON（outline 付き）から Arrow を復元し、outline が一致する', async () => {
      const json = {
        type: 'arrow' as const,
        startPoint: { x: 10, y: 20 },
        endPoint: { x: 200, y: 100 },
        stroke: '#ff0000',
        strokeWidth: 4,
        arrowheadSize: 12,
        outline: { enabled: true, color: '#ffffff', width: 3 },
      };

      const arrow = await Arrow.fromObject(json);

      const restored = arrow.getOutline();
      expect(restored).toEqual({ enabled: true, color: '#ffffff', width: 3 });
    });

    it('toObject → fromObject のラウンドトリップで outline が保持される', async () => {
      const original = new Arrow({ x: 5, y: 5 }, { x: 50, y: 50 }, { strokeWidth: 3 });
      original.setOutline({ enabled: true, width: 4 });

      const json = original.toObject();
      const restored = await Arrow.fromObject(json);

      expect(restored.getOutline()).toEqual({ enabled: true, color: '#ffffff', width: 4 });
    });

    it('outline.enabled=false の JSON から復元すると outlinePath.opacity が 0 になる', async () => {
      const json = {
        type: 'arrow' as const,
        startPoint: { x: 10, y: 20 },
        endPoint: { x: 200, y: 100 },
        stroke: '#ff0000',
        strokeWidth: 3,
        arrowheadSize: 10,
        outline: { enabled: false, color: '#ffffff', width: 2 },
      };

      const arrow = await Arrow.fromObject(json);

      expect(arrow.getOutline()!.enabled).toBe(false);
      expect(getOutlinePath(arrow).opacity).toBe(0);
    });
  });

  // ==========================================================================
  // outline 未定義の旧データは従来表現で復元（Req 24.9 後方互換）
  // ==========================================================================

  describe('outline 未定義の旧データは従来表現で復元する（Req 24.9 後方互換）', () => {
    it('outline フィールド欠落 JSON でも例外にならず Arrow を返す', async () => {
      const legacyJson = {
        type: 'arrow' as const,
        startPoint: { x: 10, y: 20 },
        endPoint: { x: 200, y: 100 },
        stroke: '#ff0000',
        strokeWidth: 3,
        arrowheadSize: 10,
      };

      await expect(Arrow.fromObject(legacyJson)).resolves.toBeInstanceOf(Arrow);
    });

    it('outline 未定義の JSON から復元した Arrow は outline.enabled=false である', async () => {
      const legacyJson = {
        type: 'arrow' as const,
        startPoint: { x: 10, y: 20 },
        endPoint: { x: 200, y: 100 },
        stroke: '#ff0000',
        strokeWidth: 3,
        arrowheadSize: 10,
      };

      const arrow = await Arrow.fromObject(legacyJson);

      const outline = arrow.getOutline();
      expect(outline).toBeDefined();
      expect(outline!.enabled).toBe(false);
    });

    it('outline 未定義の JSON から復元した Arrow は outlinePath.opacity === 0 である', async () => {
      const legacyJson = {
        type: 'arrow' as const,
        startPoint: { x: 10, y: 20 },
        endPoint: { x: 200, y: 100 },
        stroke: '#ff0000',
        strokeWidth: 3,
        arrowheadSize: 10,
      };

      const arrow = await Arrow.fromObject(legacyJson);

      expect(getOutlinePath(arrow).opacity).toBe(0);
    });
  });

  // ==========================================================================
  // 防御的フォールバック（design.md: 必須フィールド欠落時）
  // ==========================================================================

  describe('防御的フォールバック: 必須フィールド欠落時は安全な既定で復元する', () => {
    it('startPoint 欠落の JSON で console.warn が発行され、安全な既定で復元される', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const bad = {
        type: 'arrow' as const,
        endPoint: { x: 100, y: 50 },
        stroke: '#000000',
        strokeWidth: 2,
        arrowheadSize: 10,
      } as unknown as Parameters<typeof Arrow.fromObject>[0];

      const arrow = await Arrow.fromObject(bad);

      expect(warnSpy).toHaveBeenCalled();
      expect(arrow).toBeInstanceOf(Arrow);
      // 座標は安全な既定 (0,0)
      expect(arrow.startPoint).toEqual({ x: 0, y: 0 });
      expect(arrow.endPoint).toEqual({ x: 0, y: 0 });
    });

    it('stroke 欠落の JSON で安全な既定 stroke=#000000, strokeWidth=2, arrowheadSize=10 で復元される', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const bad = {
        type: 'arrow' as const,
        startPoint: { x: 10, y: 10 },
        endPoint: { x: 20, y: 20 },
      } as unknown as Parameters<typeof Arrow.fromObject>[0];

      const arrow = await Arrow.fromObject(bad);

      expect(warnSpy).toHaveBeenCalled();
      expect(arrow).toBeInstanceOf(Arrow);
      const style = arrow.getStyle();
      expect(style.stroke).toBe('#000000');
      expect(style.strokeWidth).toBe(2);
      expect(style.arrowheadSize).toBe(10);
    });

    it('null を渡しても例外を投げず Arrow を返す', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const arrow = await Arrow.fromObject(
        null as unknown as Parameters<typeof Arrow.fromObject>[0]
      );

      expect(warnSpy).toHaveBeenCalled();
      expect(arrow).toBeInstanceOf(Arrow);
      expect(arrow.startPoint).toEqual({ x: 0, y: 0 });
      expect(arrow.endPoint).toEqual({ x: 0, y: 0 });
    });

    it('undefined を渡しても例外を投げず Arrow を返す', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const arrow = await Arrow.fromObject(
        undefined as unknown as Parameters<typeof Arrow.fromObject>[0]
      );

      expect(warnSpy).toHaveBeenCalled();
      expect(arrow).toBeInstanceOf(Arrow);
    });
  });

  // ==========================================================================
  // setOutline と Undo/Redo 連携（Req 24.10）
  // ==========================================================================

  describe('setOutline は Undo/Redo 履歴記録のため canvas.fire("object:modified") を発火する（Req 24.10）', () => {
    it('canvas が付与されている場合、setOutline で canvas.fire が "object:modified" とともに呼ばれる', () => {
      const arrow = new Arrow({ x: 0, y: 0 }, { x: 100, y: 0 });
      const mockCanvas = makeMockCanvas();
      (arrow as unknown as { canvas: unknown }).canvas = mockCanvas;

      arrow.setOutline({ enabled: false });

      expect(mockCanvasFire).toHaveBeenCalled();
      // 最初の引数は 'object:modified'
      const [eventName, payload] = mockCanvasFire.mock.calls[0] as [string, { target: unknown }];
      expect(eventName).toBe('object:modified');
      expect(payload).toBeDefined();
      expect(payload.target).toBe(arrow);
    });

    it('canvas が null（未 add）なら setOutline は例外を投げない', () => {
      const arrow = new Arrow({ x: 0, y: 0 }, { x: 100, y: 0 });
      // canvas プロパティなし（未アタッチ）

      expect(() => arrow.setOutline({ enabled: false })).not.toThrow();
      // canvas が無ければ fire も呼ばれない
      expect(mockCanvasFire).not.toHaveBeenCalled();
    });

    it('setOutline の前後で outline 属性の変更が反映されている', () => {
      const arrow = new Arrow({ x: 0, y: 0 }, { x: 100, y: 0 });
      const mockCanvas = makeMockCanvas();
      (arrow as unknown as { canvas: unknown }).canvas = mockCanvas;

      expect(arrow.getOutline()!.enabled).toBe(true);
      arrow.setOutline({ enabled: false });
      expect(arrow.getOutline()!.enabled).toBe(false);
      arrow.setOutline({ enabled: true });
      expect(arrow.getOutline()!.enabled).toBe(true);

      // 2 回の切替で 2 回 fire
      expect(mockCanvasFire).toHaveBeenCalledTimes(2);
    });
  });
});
