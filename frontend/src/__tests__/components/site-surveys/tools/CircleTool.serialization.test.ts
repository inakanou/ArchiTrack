/**
 * @fileoverview 円・楕円ツール outline シリアライズ/復元テスト（Task 78.2）
 *
 * Requirements:
 * - 32.5: 白縁取りの有効/無効をユーザーが任意に切替可能にする（API レベル）
 * - 32.6: 白縁取り属性（有効/無効・縁取り幅）を注釈データに含めて永続化する
 * - 32.7: 保存された白縁取り属性を復元して表示する
 * - 32.9: outline 未定義の旧データは白縁取り無しの従来表現で表示する（後方互換）
 * - 32.10: 白縁取りの有効化/無効化切替操作を Undo/Redo 履歴に記録する
 *
 * テスト対象:
 * - CircleShape.toObject() が outline 属性を含めて返す
 * - CircleShape.fromObject(validJson) が outline 属性を復元する（round-trip）
 * - CircleShape.fromObject(object without outline) が enabled=false / opacity=0 で復元する（Req 32.9）
 * - CircleShape.fromObject(不正 JSON) が安全な既定値で復元し console.warn を出す（防御）
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

// Fabric.js のモック（CircleTool.outline.test.ts と同一仕様ベース）
vi.mock('fabric', () => {
  class MockEllipse {
    left?: number;
    top?: number;
    rx?: number;
    ry?: number;
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
      this.rx = 0;
      this.ry = 0;
      this.fill = 'transparent';
      this.stroke = '#000000';
      this.strokeWidth = 2;
      this.opacity = 1;
      this.originX = 'center';
      this.originY = 'center';
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
    Ellipse: MockEllipse,
    Group: MockGroup,
  };
});

import { CircleShape } from '../../../../components/site-surveys/tools/CircleTool';
import { ANNOTATION_DEFAULTS } from '../../../../components/site-surveys/annotation-style-tokens';

// ============================================================================
// ヘルパー
// ============================================================================

type ChildEllipse = {
  rx?: number;
  ry?: number;
  stroke?: string;
  strokeWidth?: number;
  fill?: string;
  opacity?: number;
  strokeLineCap?: string;
  strokeLineJoin?: string;
};

function getChildren(circle: CircleShape): ChildEllipse[] {
  return (circle as unknown as { _objects: ChildEllipse[] })._objects;
}

function getOutlineEllipse(circle: CircleShape): ChildEllipse {
  const children = getChildren(circle);
  if (children.length < 1) {
    throw new Error(`Expected Circle to have at least 1 child, got ${children.length}`);
  }
  return children[0] as ChildEllipse;
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

describe('Circle シリアライズ/復元 (Task 78.2)', () => {
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
      const circle = new CircleShape(100, 100, 50, 30);

      const json = circle.toObject();

      expect(json.outline).toBeDefined();
      expect(json.outline).toEqual(ANNOTATION_DEFAULTS.circleOutline);
    });

    it('setOutline({ enabled: false }) 後、toObject で outline.enabled === false が出力される', () => {
      const circle = new CircleShape(0, 0, 50, 50);

      circle.setOutline({ enabled: false });
      const json = circle.toObject();

      expect(json.outline).toBeDefined();
      expect(json.outline!.enabled).toBe(false);
    });

    it('setOutline({ width: 5 }) 後、toObject で outline.width === 5 が出力される', () => {
      const circle = new CircleShape(0, 0, 50, 50);

      circle.setOutline({ width: 5 });
      const json = circle.toObject();

      expect(json.outline!.width).toBe(5);
    });

    it('既存の centerX/centerY/rx/ry/stroke/strokeWidth/fill も引き続き含まれる', () => {
      const circle = new CircleShape(100, 200, 50, 30, {
        stroke: '#00ff00',
        strokeWidth: 5,
        fill: '#abcdef',
      });

      const json = circle.toObject();

      expect(json.type).toBe('circleShape');
      expect(json.centerX).toBe(100);
      expect(json.centerY).toBe(200);
      expect(json.rx).toBe(50);
      expect(json.ry).toBe(30);
      expect(json.stroke).toBe('#00ff00');
      expect(json.strokeWidth).toBe(5);
      expect(json.fill).toBe('#abcdef');
    });
  });

  // ==========================================================================
  // fromObject() で outline を復元する（Req 32.7）
  // ==========================================================================

  describe('fromObject() が outline 属性を復元する（Req 32.7）', () => {
    it('有効な JSON（outline 付き）から CircleShape を復元し、outline が一致する', async () => {
      const json = {
        type: 'circleShape' as const,
        centerX: 100,
        centerY: 200,
        rx: 50,
        ry: 30,
        stroke: '#ff0000',
        strokeWidth: 4,
        fill: 'transparent',
        outline: { enabled: true, color: '#ffffff', width: 3 },
      };

      const circle = await CircleShape.fromObject(json);

      const restored = circle.getOutline();
      expect(restored).toEqual({ enabled: true, color: '#ffffff', width: 3 });
    });

    it('toObject → fromObject のラウンドトリップで outline が保持される', async () => {
      const original = new CircleShape(5, 5, 25, 25, { strokeWidth: 3 });
      original.setOutline({ enabled: true, width: 4 });

      const json = original.toObject();
      const restored = await CircleShape.fromObject(json);

      expect(restored.getOutline()).toEqual({ enabled: true, color: '#ffffff', width: 4 });
    });

    it('outline.enabled=false の JSON から復元すると outlineEllipse.opacity が 0 になる', async () => {
      const json = {
        type: 'circleShape' as const,
        centerX: 100,
        centerY: 200,
        rx: 50,
        ry: 30,
        stroke: '#ff0000',
        strokeWidth: 3,
        fill: 'transparent',
        outline: { enabled: false, color: '#ffffff', width: 2 },
      };

      const circle = await CircleShape.fromObject(json);

      expect(circle.getOutline()!.enabled).toBe(false);
      expect(getOutlineEllipse(circle).opacity).toBe(0);
    });

    it('ラウンドトリップで本体属性も保持される（centerX/centerY/rx/ry/stroke/strokeWidth/fill）', async () => {
      const original = new CircleShape(100, 200, 50, 30, {
        stroke: '#123456',
        strokeWidth: 5,
        fill: '#abcdef',
      });

      const json = original.toObject();
      const restored = await CircleShape.fromObject(json);

      expect(restored.centerX).toBe(100);
      expect(restored.centerY).toBe(200);
      expect(restored.shapeWidth).toBe(100); // rx * 2
      expect(restored.shapeHeight).toBe(60); // ry * 2
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
    it('outline フィールド欠落 JSON でも例外にならず CircleShape を返す', async () => {
      const legacyJson = {
        type: 'circleShape' as const,
        centerX: 100,
        centerY: 200,
        rx: 50,
        ry: 30,
        stroke: '#ff0000',
        strokeWidth: 3,
        fill: 'transparent',
      };

      await expect(CircleShape.fromObject(legacyJson)).resolves.toBeInstanceOf(CircleShape);
    });

    it('outline 未定義の JSON から復元した CircleShape は outline.enabled=false である', async () => {
      const legacyJson = {
        type: 'circleShape' as const,
        centerX: 100,
        centerY: 200,
        rx: 50,
        ry: 30,
        stroke: '#ff0000',
        strokeWidth: 3,
        fill: 'transparent',
      };

      const circle = await CircleShape.fromObject(legacyJson);

      const outline = circle.getOutline();
      expect(outline).toBeDefined();
      expect(outline!.enabled).toBe(false);
    });

    it('outline 未定義の JSON から復元した CircleShape は outlineEllipse.opacity === 0 である', async () => {
      const legacyJson = {
        type: 'circleShape' as const,
        centerX: 100,
        centerY: 200,
        rx: 50,
        ry: 30,
        stroke: '#ff0000',
        strokeWidth: 3,
        fill: 'transparent',
      };

      const circle = await CircleShape.fromObject(legacyJson);

      expect(getOutlineEllipse(circle).opacity).toBe(0);
    });
  });

  // ==========================================================================
  // 防御的フォールバック（design.md: 必須フィールド欠落時）
  // ==========================================================================

  describe('防御的フォールバック: 必須フィールド欠落時は安全な既定で復元する', () => {
    it('rx 欠落の JSON で console.warn が発行され、安全な既定で復元される', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const bad = {
        type: 'circleShape' as const,
        centerX: 100,
        centerY: 200,
        ry: 30,
        stroke: '#000000',
        strokeWidth: 2,
        fill: 'transparent',
      } as unknown as Parameters<typeof CircleShape.fromObject>[0];

      const circle = await CircleShape.fromObject(bad);

      expect(warnSpy).toHaveBeenCalled();
      expect(circle).toBeInstanceOf(CircleShape);
      // 中心座標は安全な既定 (0,0)
      expect(circle.centerX).toBe(0);
      expect(circle.centerY).toBe(0);
    });

    it('stroke 欠落の JSON で安全な既定 stroke=#000000, strokeWidth=2, fill="" で復元される', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const bad = {
        type: 'circleShape' as const,
        centerX: 100,
        centerY: 100,
        rx: 50,
        ry: 50,
      } as unknown as Parameters<typeof CircleShape.fromObject>[0];

      const circle = await CircleShape.fromObject(bad);

      expect(warnSpy).toHaveBeenCalled();
      expect(circle).toBeInstanceOf(CircleShape);
      const style = circle.getStyle();
      expect(style.stroke).toBe('#000000');
      expect(style.strokeWidth).toBe(2);
      expect(style.fill).toBe('');
    });

    it('null を渡しても例外を投げず CircleShape を返す', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const circle = await CircleShape.fromObject(
        null as unknown as Parameters<typeof CircleShape.fromObject>[0]
      );

      expect(warnSpy).toHaveBeenCalled();
      expect(circle).toBeInstanceOf(CircleShape);
      expect(circle.centerX).toBe(0);
      expect(circle.centerY).toBe(0);
    });

    it('undefined を渡しても例外を投げず CircleShape を返す', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const circle = await CircleShape.fromObject(
        undefined as unknown as Parameters<typeof CircleShape.fromObject>[0]
      );

      expect(warnSpy).toHaveBeenCalled();
      expect(circle).toBeInstanceOf(CircleShape);
    });
  });

  // ==========================================================================
  // setOutline と Undo/Redo 連携（Req 32.10 確認）
  // ==========================================================================

  describe('setOutline は Undo/Redo 履歴記録のため canvas.fire("object:modified") を発火する（Req 32.10）', () => {
    it('canvas が付与されている場合、setOutline で canvas.fire が "object:modified" とともに呼ばれる', () => {
      const circle = new CircleShape(0, 0, 50, 50);
      const mockCanvas = makeMockCanvas();
      (circle as unknown as { canvas: unknown }).canvas = mockCanvas;

      circle.setOutline({ enabled: false });

      expect(mockCanvasFire).toHaveBeenCalled();
      const [eventName, payload] = mockCanvasFire.mock.calls[0] as [string, { target: unknown }];
      expect(eventName).toBe('object:modified');
      expect(payload).toBeDefined();
      expect(payload.target).toBe(circle);
    });

    it('canvas が null（未 add）なら setOutline は例外を投げない', () => {
      const circle = new CircleShape(0, 0, 50, 50);
      // canvas プロパティなし（未アタッチ）

      expect(() => circle.setOutline({ enabled: false })).not.toThrow();
      // canvas が無ければ fire も呼ばれない
      expect(mockCanvasFire).not.toHaveBeenCalled();
    });
  });
});
