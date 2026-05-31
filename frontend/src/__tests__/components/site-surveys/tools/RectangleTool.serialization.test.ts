/**
 * @fileoverview 四角形ツール outline シリアライズ/復元テスト（Task 77.2）
 *
 * Requirements:
 * - 32.5: 白縁取りの有効/無効をユーザーが任意に切替可能にする（API レベル）
 * - 32.6: 白縁取り属性（有効/無効・縁取り幅）を注釈データに含めて永続化する
 * - 32.7: 保存された白縁取り属性を復元して表示する
 * - 32.9: outline 未定義の旧データは白縁取り無しの従来表現で表示する（後方互換）
 * - 32.10: 白縁取りの有効化/無効化切替操作を Undo/Redo 履歴に記録する
 *
 * テスト対象:
 * - RectangleShape.toObject() が outline 属性を含めて返す
 * - RectangleShape.fromObject(validJson) が outline 属性を復元する（round-trip）
 * - RectangleShape.fromObject(object without outline) が enabled=false / opacity=0 で復元する（Req 32.9）
 * - RectangleShape.fromObject(不正 JSON) が安全な既定値で復元し console.warn を出す（防御）
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

// Fabric.js のモック（RectangleTool.outline.test.ts と同一仕様ベース）
vi.mock('fabric', () => {
  class MockRect {
    left?: number;
    top?: number;
    width?: number;
    height?: number;
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

    constructor(options?: Record<string, unknown>) {
      this.width = 0;
      this.height = 0;
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
    Rect: MockRect,
    Group: MockGroup,
  };
});

import { RectangleShape } from '../../../../components/site-surveys/tools/RectangleTool';
import { ANNOTATION_DEFAULTS } from '../../../../components/site-surveys/annotation-style-tokens';

// ============================================================================
// ヘルパー
// ============================================================================

type ChildRect = {
  width?: number;
  height?: number;
  stroke?: string;
  strokeWidth?: number;
  fill?: string;
  opacity?: number;
  strokeLineCap?: string;
  strokeLineJoin?: string;
};

function getChildren(rect: RectangleShape): ChildRect[] {
  return (rect as unknown as { _objects: ChildRect[] })._objects;
}

function getOutlineRect(rect: RectangleShape): ChildRect {
  const children = getChildren(rect);
  if (children.length < 1) {
    throw new Error(`Expected Rectangle to have at least 1 child, got ${children.length}`);
  }
  return children[0] as ChildRect;
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

describe('Rectangle シリアライズ/復元 (Task 77.2)', () => {
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
      const rect = new RectangleShape(10, 20, 200, 100);

      const json = rect.toObject();

      expect(json.outline).toBeDefined();
      expect(json.outline).toEqual(ANNOTATION_DEFAULTS.rectangleOutline);
    });

    it('setOutline({ enabled: false }) 後、toObject で outline.enabled === false が出力される', () => {
      const rect = new RectangleShape(0, 0, 100, 100);

      rect.setOutline({ enabled: false });
      const json = rect.toObject();

      expect(json.outline).toBeDefined();
      expect(json.outline!.enabled).toBe(false);
    });

    it('setOutline({ width: 5 }) 後、toObject で outline.width === 5 が出力される', () => {
      const rect = new RectangleShape(0, 0, 100, 100);

      rect.setOutline({ width: 5 });
      const json = rect.toObject();

      expect(json.outline!.width).toBe(5);
    });

    it('既存の left/top/width/height/stroke/strokeWidth/fill も引き続き含まれる', () => {
      const rect = new RectangleShape(10, 20, 200, 100, {
        stroke: '#00ff00',
        strokeWidth: 5,
        fill: '#abcdef',
      });

      const json = rect.toObject();

      expect(json.type).toBe('rectangleShape');
      expect(json.left).toBe(10);
      expect(json.top).toBe(20);
      expect(json.width).toBe(200);
      expect(json.height).toBe(100);
      expect(json.stroke).toBe('#00ff00');
      expect(json.strokeWidth).toBe(5);
      expect(json.fill).toBe('#abcdef');
    });
  });

  // ==========================================================================
  // fromObject() で outline を復元する（Req 32.7）
  // ==========================================================================

  describe('fromObject() が outline 属性を復元する（Req 32.7）', () => {
    it('有効な JSON（outline 付き）から RectangleShape を復元し、outline が一致する', async () => {
      const json = {
        type: 'rectangleShape' as const,
        left: 10,
        top: 20,
        width: 200,
        height: 100,
        stroke: '#ff0000',
        strokeWidth: 4,
        fill: 'transparent',
        outline: { enabled: true, color: '#ffffff', width: 3 },
      };

      const rect = await RectangleShape.fromObject(json);

      const restored = rect.getOutline();
      expect(restored).toEqual({ enabled: true, color: '#ffffff', width: 3 });
    });

    it('toObject → fromObject のラウンドトリップで outline が保持される', async () => {
      const original = new RectangleShape(5, 5, 50, 50, { strokeWidth: 3 });
      original.setOutline({ enabled: true, width: 4 });

      const json = original.toObject();
      const restored = await RectangleShape.fromObject(json);

      expect(restored.getOutline()).toEqual({ enabled: true, color: '#ffffff', width: 4 });
    });

    it('outline.enabled=false の JSON から復元すると outlineRect.opacity が 0 になる', async () => {
      const json = {
        type: 'rectangleShape' as const,
        left: 10,
        top: 20,
        width: 200,
        height: 100,
        stroke: '#ff0000',
        strokeWidth: 3,
        fill: 'transparent',
        outline: { enabled: false, color: '#ffffff', width: 2 },
      };

      const rect = await RectangleShape.fromObject(json);

      expect(rect.getOutline()!.enabled).toBe(false);
      expect(getOutlineRect(rect).opacity).toBe(0);
    });

    it('ラウンドトリップで本体属性も保持される（left/top/width/height/stroke/strokeWidth/fill）', async () => {
      const original = new RectangleShape(10, 20, 200, 100, {
        stroke: '#123456',
        strokeWidth: 5,
        fill: '#abcdef',
      });

      const json = original.toObject();
      const restored = await RectangleShape.fromObject(json);

      expect(restored.positionX).toBe(10);
      expect(restored.positionY).toBe(20);
      expect(restored.shapeWidth).toBe(200);
      expect(restored.shapeHeight).toBe(100);
      const style = restored.getStyle();
      expect(style.stroke).toBe('#123456');
      expect(style.strokeWidth).toBe(5);
      expect(style.fill).toBe('#abcdef');
    });
  });

  // ==========================================================================
  // outline 未定義の旧データは従来表現で復元（Req 32.9 後方互換）
  // ==========================================================================

  describe('outline 未定義の旧データは従来表現で復元する（Req 32.9 後方互換）', () => {
    it('outline フィールド欠落 JSON でも例外にならず RectangleShape を返す', async () => {
      const legacyJson = {
        type: 'rectangleShape' as const,
        left: 10,
        top: 20,
        width: 200,
        height: 100,
        stroke: '#ff0000',
        strokeWidth: 3,
        fill: 'transparent',
      };

      await expect(RectangleShape.fromObject(legacyJson)).resolves.toBeInstanceOf(RectangleShape);
    });

    it('outline 未定義の JSON から復元した RectangleShape は outline.enabled=false である', async () => {
      const legacyJson = {
        type: 'rectangleShape' as const,
        left: 10,
        top: 20,
        width: 200,
        height: 100,
        stroke: '#ff0000',
        strokeWidth: 3,
        fill: 'transparent',
      };

      const rect = await RectangleShape.fromObject(legacyJson);

      const outline = rect.getOutline();
      expect(outline).toBeDefined();
      expect(outline!.enabled).toBe(false);
    });

    it('outline 未定義の JSON から復元した RectangleShape は outlineRect.opacity === 0 である', async () => {
      const legacyJson = {
        type: 'rectangleShape' as const,
        left: 10,
        top: 20,
        width: 200,
        height: 100,
        stroke: '#ff0000',
        strokeWidth: 3,
        fill: 'transparent',
      };

      const rect = await RectangleShape.fromObject(legacyJson);

      expect(getOutlineRect(rect).opacity).toBe(0);
    });
  });

  // ==========================================================================
  // 防御的フォールバック（design.md: 必須フィールド欠落時）
  // ==========================================================================

  describe('防御的フォールバック: 必須フィールド欠落時は安全な既定で復元する', () => {
    it('width 欠落の JSON で console.warn が発行され、安全な既定で復元される', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const bad = {
        type: 'rectangleShape' as const,
        left: 10,
        top: 20,
        height: 100,
        stroke: '#000000',
        strokeWidth: 2,
        fill: 'transparent',
      } as unknown as Parameters<typeof RectangleShape.fromObject>[0];

      const rect = await RectangleShape.fromObject(bad);

      expect(warnSpy).toHaveBeenCalled();
      expect(rect).toBeInstanceOf(RectangleShape);
      // 座標は安全な既定 (0,0)
      expect(rect.positionX).toBe(0);
      expect(rect.positionY).toBe(0);
    });

    it('stroke 欠落の JSON で安全な既定 stroke=#000000, strokeWidth=2, fill="" で復元される', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const bad = {
        type: 'rectangleShape' as const,
        left: 10,
        top: 10,
        width: 100,
        height: 100,
      } as unknown as Parameters<typeof RectangleShape.fromObject>[0];

      const rect = await RectangleShape.fromObject(bad);

      expect(warnSpy).toHaveBeenCalled();
      expect(rect).toBeInstanceOf(RectangleShape);
      const style = rect.getStyle();
      expect(style.stroke).toBe('#000000');
      expect(style.strokeWidth).toBe(2);
      expect(style.fill).toBe('');
    });

    it('null を渡しても例外を投げず RectangleShape を返す', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const rect = await RectangleShape.fromObject(
        null as unknown as Parameters<typeof RectangleShape.fromObject>[0]
      );

      expect(warnSpy).toHaveBeenCalled();
      expect(rect).toBeInstanceOf(RectangleShape);
      expect(rect.positionX).toBe(0);
      expect(rect.positionY).toBe(0);
    });

    it('undefined を渡しても例外を投げず RectangleShape を返す', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const rect = await RectangleShape.fromObject(
        undefined as unknown as Parameters<typeof RectangleShape.fromObject>[0]
      );

      expect(warnSpy).toHaveBeenCalled();
      expect(rect).toBeInstanceOf(RectangleShape);
    });
  });

  // ==========================================================================
  // setOutline と Undo/Redo 連携（Req 32.10 確認）
  // ==========================================================================

  describe('setOutline は Undo/Redo 履歴記録のため canvas.fire("object:modified") を発火する（Req 32.10）', () => {
    it('canvas が付与されている場合、setOutline で canvas.fire が "object:modified" とともに呼ばれる', () => {
      const rect = new RectangleShape(0, 0, 100, 100);
      const mockCanvas = makeMockCanvas();
      (rect as unknown as { canvas: unknown }).canvas = mockCanvas;

      rect.setOutline({ enabled: false });

      expect(mockCanvasFire).toHaveBeenCalled();
      const [eventName, payload] = mockCanvasFire.mock.calls[0] as [string, { target: unknown }];
      expect(eventName).toBe('object:modified');
      expect(payload).toBeDefined();
      expect(payload.target).toBe(rect);
    });

    it('canvas が null（未 add）なら setOutline は例外を投げない', () => {
      const rect = new RectangleShape(0, 0, 100, 100);
      // canvas プロパティなし（未アタッチ）

      expect(() => rect.setOutline({ enabled: false })).not.toThrow();
      // canvas が無ければ fire も呼ばれない
      expect(mockCanvasFire).not.toHaveBeenCalled();
    });
  });
});
