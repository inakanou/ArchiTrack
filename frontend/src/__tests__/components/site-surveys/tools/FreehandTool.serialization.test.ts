/**
 * @fileoverview フリーハンドツール outline シリアライズ/復元テスト（Task 81.2）
 *
 * Requirements:
 * - 32.5: 白縁取りの有効/無効をユーザーが任意に切替可能にする（API レベル）
 * - 32.6: 白縁取り属性（有効/無効・縁取り幅）を注釈データに含めて永続化する
 * - 32.7: 保存された白縁取り属性を復元して表示する
 * - 32.9: outline 未定義の旧データは白縁取り無しの従来表現で表示する（後方互換）
 * - 32.10: 白縁取りの有効化/無効化切替操作を Undo/Redo 履歴に記録する
 *
 * テスト対象:
 * - FreehandPath.toObject() が outline 属性を含めて返す
 * - FreehandPath.fromObject(validJson) が outline 属性を復元する（round-trip）
 * - FreehandPath.fromObject(object without outline) が enabled=false / opacity=0 で復元する（Req 32.9）
 * - FreehandPath.fromObject(不正 JSON) が安全な既定値で復元し console.warn を出す（防御）
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

// Fabric.js のモック（FreehandTool.outline.test.ts と同一仕様ベース）
vi.mock('fabric', () => {
  class MockPath {
    path: string | Array<unknown>;
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

    constructor(pathData?: string | Array<unknown>, options?: Record<string, unknown>) {
      this.path = pathData ?? '';
      this.fill = 'transparent';
      this.stroke = '#000000';
      this.strokeWidth = 2;
      this.opacity = 1;
      this.strokeLineCap = 'round';
      this.strokeLineJoin = 'round';
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

  // PencilBrush は本テストでは未使用だが import 解決のためにスタブ提供
  class MockPencilBrush {
    color: string = '#000000';
    width: number = 2;
    decimate: number = 8;
    constructor(_canvas?: unknown) {}
    onMouseDown(_pointer: unknown, _ev?: unknown): void {}
    onMouseMove(_pointer: unknown, _ev?: unknown): void {}
    onMouseUp(_ev?: unknown): boolean {
      return true;
    }
  }

  return {
    Path: MockPath,
    Group: MockGroup,
    PencilBrush: MockPencilBrush,
  };
});

import { FreehandPath } from '../../../../components/site-surveys/tools/FreehandTool';
import { ANNOTATION_DEFAULTS } from '../../../../components/site-surveys/annotation-style-tokens';

// ============================================================================
// ヘルパー
// ============================================================================

type ChildPath = {
  path?: string | Array<unknown>;
  stroke?: string;
  strokeWidth?: number;
  fill?: string;
  opacity?: number;
  strokeLineCap?: string;
  strokeLineJoin?: string;
};

function getChildren(freehand: FreehandPath): ChildPath[] {
  return (freehand as unknown as { _objects: ChildPath[] })._objects;
}

function getOutlinePath(freehand: FreehandPath): ChildPath {
  const children = getChildren(freehand);
  if (children.length < 1) {
    throw new Error(`Expected Freehand to have at least 1 child, got ${children.length}`);
  }
  return children[0] as ChildPath;
}

/**
 * Fabric Canvas のモック（最小実装: fire のみ）
 */
function makeMockCanvas(): { fire: ReturnType<typeof vi.fn> } {
  return { fire: mockCanvasFire };
}

const FREEHAND_PATH_DATA = 'M 100 100 L 200 100 L 150 200';

// ============================================================================
// テストスイート
// ============================================================================

describe('Freehand シリアライズ/復元 (Task 81.2)', () => {
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
      const freehand = new FreehandPath(FREEHAND_PATH_DATA);

      const json = freehand.toObject();

      expect(json.outline).toBeDefined();
      expect(json.outline).toEqual(ANNOTATION_DEFAULTS.freehandOutline);
    });

    it('setOutline({ enabled: false }) 後、toObject で outline.enabled === false が出力される', () => {
      const freehand = new FreehandPath(FREEHAND_PATH_DATA);

      freehand.setOutline({ enabled: false });
      const json = freehand.toObject();

      expect(json.outline).toBeDefined();
      expect(json.outline!.enabled).toBe(false);
    });

    it('setOutline({ width: 5 }) 後、toObject で outline.width === 5 が出力される', () => {
      const freehand = new FreehandPath(FREEHAND_PATH_DATA);

      freehand.setOutline({ width: 5 });
      const json = freehand.toObject();

      expect(json.outline!.width).toBe(5);
    });

    it('既存の pathData/stroke/strokeWidth/fill も引き続き含まれる', () => {
      const freehand = new FreehandPath(FREEHAND_PATH_DATA, {
        stroke: '#00ff00',
        strokeWidth: 5,
        fill: 'transparent',
      });

      const json = freehand.toObject();

      expect(json.type).toBe('freehand');
      expect(json.pathData).toBe(FREEHAND_PATH_DATA);
      expect(json.stroke).toBe('#00ff00');
      expect(json.strokeWidth).toBe(5);
      expect(json.fill).toBe('transparent');
    });
  });

  // ==========================================================================
  // fromObject() で outline を復元する（Req 32.7）
  // ==========================================================================

  describe('fromObject() が outline 属性を復元する（Req 32.7）', () => {
    it('有効な JSON（outline 付き）から FreehandPath を復元し、outline が一致する', async () => {
      const json = {
        type: 'freehand' as const,
        pathData: FREEHAND_PATH_DATA,
        stroke: '#ff0000',
        strokeWidth: 4,
        fill: 'transparent',
        strokeLineCap: 'round',
        strokeLineJoin: 'round',
        outline: { enabled: true, color: '#ffffff', width: 3 },
      };

      const freehand = await FreehandPath.fromObject(json);

      const restored = freehand.getOutline();
      expect(restored).toEqual({ enabled: true, color: '#ffffff', width: 3 });
    });

    it('toObject → fromObject のラウンドトリップで outline が保持される', async () => {
      const original = new FreehandPath(FREEHAND_PATH_DATA, { strokeWidth: 3 });
      original.setOutline({ enabled: true, width: 4 });

      const json = original.toObject();
      const restored = await FreehandPath.fromObject(json);

      expect(restored.getOutline()).toEqual({ enabled: true, color: '#ffffff', width: 4 });
    });

    it('outline.enabled=false の JSON から復元すると outlinePath.opacity が 0 になる', async () => {
      const json = {
        type: 'freehand' as const,
        pathData: FREEHAND_PATH_DATA,
        stroke: '#ff0000',
        strokeWidth: 3,
        fill: 'transparent',
        strokeLineCap: 'round',
        strokeLineJoin: 'round',
        outline: { enabled: false, color: '#ffffff', width: 2 },
      };

      const freehand = await FreehandPath.fromObject(json);

      expect(freehand.getOutline()!.enabled).toBe(false);
      expect(getOutlinePath(freehand).opacity).toBe(0);
    });

    it('ラウンドトリップで本体属性も保持される（pathData/stroke/strokeWidth/fill）', async () => {
      const original = new FreehandPath(FREEHAND_PATH_DATA, {
        stroke: '#123456',
        strokeWidth: 5,
        fill: 'transparent',
      });

      const json = original.toObject();
      const restored = await FreehandPath.fromObject(json);

      expect(restored.pathData).toBe(FREEHAND_PATH_DATA);
      const style = restored.getStyle();
      expect(style.stroke).toBe('#123456');
      expect(style.strokeWidth).toBe(5);
      expect(style.fill).toBe('transparent');
    });

    it('ラウンドトリップで strokeLineCap/strokeLineJoin が保持される', async () => {
      const original = new FreehandPath(FREEHAND_PATH_DATA, {
        strokeLineCap: 'butt',
        strokeLineJoin: 'miter',
      });

      const json = original.toObject();
      const restored = await FreehandPath.fromObject(json);

      expect(restored.strokeLineCap).toBe('butt');
      expect(restored.strokeLineJoin).toBe('miter');
    });

    it('長い path セグメント数の pathData でもラウンドトリップで保持される', async () => {
      // 50 セグメントの折れ線パスを生成
      let longPath = 'M 0 0';
      for (let i = 1; i <= 50; i++) {
        longPath += ` L ${i * 10} ${i % 2 === 0 ? 100 : 50}`;
      }
      const original = new FreehandPath(longPath);

      const json = original.toObject();
      const restored = await FreehandPath.fromObject(json);

      expect(restored.pathData).toBe(longPath);
    });
  });

  // ==========================================================================
  // outline 未定義の旧データは従来表現で復元（Req 32.9 後方互換）
  // ==========================================================================

  describe('outline 未定義の旧データは従来表現で復元する（Req 32.9 後方互換）', () => {
    it('outline フィールド欠落 JSON でも例外にならず FreehandPath を返す', async () => {
      const legacyJson = {
        type: 'freehand' as const,
        pathData: FREEHAND_PATH_DATA,
        stroke: '#ff0000',
        strokeWidth: 3,
        fill: 'transparent',
        strokeLineCap: 'round',
        strokeLineJoin: 'round',
      };

      await expect(FreehandPath.fromObject(legacyJson)).resolves.toBeInstanceOf(FreehandPath);
    });

    it('outline 未定義の JSON から復元した FreehandPath は outline.enabled=false である', async () => {
      const legacyJson = {
        type: 'freehand' as const,
        pathData: FREEHAND_PATH_DATA,
        stroke: '#ff0000',
        strokeWidth: 3,
        fill: 'transparent',
        strokeLineCap: 'round',
        strokeLineJoin: 'round',
      };

      const freehand = await FreehandPath.fromObject(legacyJson);

      const outline = freehand.getOutline();
      expect(outline).toBeDefined();
      expect(outline!.enabled).toBe(false);
    });

    it('outline 未定義の JSON から復元した FreehandPath は outlinePath.opacity === 0 である', async () => {
      const legacyJson = {
        type: 'freehand' as const,
        pathData: FREEHAND_PATH_DATA,
        stroke: '#ff0000',
        strokeWidth: 3,
        fill: 'transparent',
        strokeLineCap: 'round',
        strokeLineJoin: 'round',
      };

      const freehand = await FreehandPath.fromObject(legacyJson);

      expect(getOutlinePath(freehand).opacity).toBe(0);
    });
  });

  // ==========================================================================
  // 防御的フォールバック（design.md: 必須フィールド欠落時）
  // ==========================================================================

  describe('防御的フォールバック: 必須フィールド欠落時は安全な既定で復元する', () => {
    it('pathData 欠落の JSON で console.warn が発行され、安全な既定で復元される', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const bad = {
        type: 'freehand' as const,
        stroke: '#000000',
        strokeWidth: 2,
        fill: 'transparent',
        strokeLineCap: 'round',
        strokeLineJoin: 'round',
      } as unknown as Parameters<typeof FreehandPath.fromObject>[0];

      const freehand = await FreehandPath.fromObject(bad);

      expect(warnSpy).toHaveBeenCalled();
      expect(freehand).toBeInstanceOf(FreehandPath);
    });

    it('pathData が文字列でない（数値）JSON で console.warn が発行され、安全な既定で復元される', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const bad = {
        type: 'freehand' as const,
        pathData: 12345,
        stroke: '#000000',
        strokeWidth: 2,
        fill: 'transparent',
        strokeLineCap: 'round',
        strokeLineJoin: 'round',
      } as unknown as Parameters<typeof FreehandPath.fromObject>[0];

      const freehand = await FreehandPath.fromObject(bad);

      expect(warnSpy).toHaveBeenCalled();
      expect(freehand).toBeInstanceOf(FreehandPath);
    });

    it('pathData が空文字列の JSON で console.warn が発行され、安全な既定で復元される', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const bad = {
        type: 'freehand' as const,
        pathData: '',
        stroke: '#000000',
        strokeWidth: 2,
        fill: 'transparent',
        strokeLineCap: 'round',
        strokeLineJoin: 'round',
      } as unknown as Parameters<typeof FreehandPath.fromObject>[0];

      const freehand = await FreehandPath.fromObject(bad);

      expect(warnSpy).toHaveBeenCalled();
      expect(freehand).toBeInstanceOf(FreehandPath);
    });

    it('stroke 欠落の JSON で安全な既定 stroke=#000000, strokeWidth=2, fill="transparent" で復元される', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const bad = {
        type: 'freehand' as const,
        pathData: FREEHAND_PATH_DATA,
      } as unknown as Parameters<typeof FreehandPath.fromObject>[0];

      const freehand = await FreehandPath.fromObject(bad);

      expect(warnSpy).toHaveBeenCalled();
      expect(freehand).toBeInstanceOf(FreehandPath);
      const style = freehand.getStyle();
      expect(style.stroke).toBe('#000000');
      expect(style.strokeWidth).toBe(2);
      expect(style.fill).toBe('transparent');
    });

    it('null を渡しても例外を投げず FreehandPath を返す', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const freehand = await FreehandPath.fromObject(
        null as unknown as Parameters<typeof FreehandPath.fromObject>[0]
      );

      expect(warnSpy).toHaveBeenCalled();
      expect(freehand).toBeInstanceOf(FreehandPath);
    });

    it('undefined を渡しても例外を投げず FreehandPath を返す', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const freehand = await FreehandPath.fromObject(
        undefined as unknown as Parameters<typeof FreehandPath.fromObject>[0]
      );

      expect(warnSpy).toHaveBeenCalled();
      expect(freehand).toBeInstanceOf(FreehandPath);
    });
  });

  // ==========================================================================
  // setOutline と Undo/Redo 連携（Req 32.10 確認）
  // ==========================================================================

  describe('setOutline は Undo/Redo 履歴記録のため canvas.fire("object:modified") を発火する（Req 32.10）', () => {
    it('canvas が付与されている場合、setOutline で canvas.fire が "object:modified" とともに呼ばれる', () => {
      const freehand = new FreehandPath(FREEHAND_PATH_DATA);
      const mockCanvas = makeMockCanvas();
      (freehand as unknown as { canvas: unknown }).canvas = mockCanvas;

      freehand.setOutline({ enabled: false });

      expect(mockCanvasFire).toHaveBeenCalled();
      const [eventName, payload] = mockCanvasFire.mock.calls[0] as [string, { target: unknown }];
      expect(eventName).toBe('object:modified');
      expect(payload).toBeDefined();
      expect(payload.target).toBe(freehand);
    });

    it('canvas が null（未 add）なら setOutline は例外を投げない', () => {
      const freehand = new FreehandPath(FREEHAND_PATH_DATA);
      // canvas プロパティなし（未アタッチ）

      expect(() => freehand.setOutline({ enabled: false })).not.toThrow();
      // canvas が無ければ fire も呼ばれない
      expect(mockCanvasFire).not.toHaveBeenCalled();
    });
  });
});
