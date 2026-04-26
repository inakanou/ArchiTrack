/**
 * @fileoverview `registerCustomShapes` で Group 版 Arrow が再登録されることの統合テスト（Task 65.3）
 *
 * Requirements:
 * - 24.9: 過去に白縁取り属性を持たずに保存した矢印注釈を表示する際、白縁取り無しの
 *         従来表現のまま表示する（後方互換維持）。Group 版 Arrow への差し替えで
 *         `util.enlivenObjects` 経路（= `Arrow.fromObject`）を壊さないことを保証する。
 *
 * テスト対象:
 * - `registerCustomShapes.ts` の import で `classRegistry.setClass(Arrow, 'arrow')` が実行され、
 *   登録されるクラスが Group ベースの `Arrow` であること。
 * - 登録された Arrow の `fromObject` に旧形式（outline 未定義）の JSON を渡すと、
 *   `Group` インスタンスとして復元され、`type === 'arrow'`、白縁取りは非表示（opacity=0）となる。
 * - 新形式（outline 付き）JSON でも outline が復元されること。
 *
 * Note:
 *   `util.enlivenObjects` の内部パイプラインは Fabric 側で `classRegistry.getClass(type).fromObject(...)`
 *   相当の処理を行うため、本テストでは登録確認と `Arrow.fromObject` の直接検証で
 *   「enlivenObjects 経路を壊さない」観測可能完了を成立させる。
 *
 * @requirement site-survey/REQ-24.9
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ============================================================================
// Fabric.js のモック
// ============================================================================
// - classRegistry: setClass/getClass を spy できるようにする（登録検証用）
// - Group/Path: Arrow が extends Group するため必須、outline.test.ts と同形状
// ----------------------------------------------------------------------------

const { mockSetClass, classMap, mockSet, mockSetCoords } = vi.hoisted(() => {
  return {
    mockSetClass: vi.fn(),
    classMap: new Map<string, unknown>(),
    mockSet: vi.fn(),
    mockSetCoords: vi.fn(),
  };
});

vi.mock('fabric', () => {
  class MockPath {
    path?: string;
    stroke?: string;
    strokeWidth?: number;
    fill?: string;
    opacity?: number;
    strokeLineCap?: string;
    strokeLineJoin?: string;

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

  class MockTriangle {
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
      mockSet(options, value);
      return this;
    }
  }

  class MockLine {
    constructor(_coords?: number[], options?: Record<string, unknown>) {
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

  class MockRect {
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

  class MockEllipse {
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

  class MockPolygon {
    constructor(_points?: unknown[], options?: Record<string, unknown>) {
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

  class MockPolyline {
    constructor(_points?: unknown[], options?: Record<string, unknown>) {
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

  class MockIText {
    constructor(_text?: string, options?: Record<string, unknown>) {
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

  class MockFabricText {
    constructor(_text?: string, options?: Record<string, unknown>) {
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

  class MockPencilBrush {
    color?: string;
    width?: number;
    constructor(_canvas?: unknown) {
      // no-op
    }
  }

  // classRegistry は Fabric.js v6+ の登録ストア相当をモック。
  // setClass(cls, key) は「登録」、getClass(key) は「参照」を表現する。
  // Fabric.js 実装では `setClass(cls)` で `cls.name` をキーに登録することもあるが、
  // `registerCustomShapes.ts` は第2引数 `'arrow'` を明示指定しているため、
  // 本モックは `(cls, key?) => key ?? cls.name` をキーとして採用する。
  const mockClassRegistry = {
    setClass: (cls: { name: string }, key?: string) => {
      const resolvedKey = key ?? cls.name;
      classMap.set(resolvedKey, cls);
      mockSetClass(cls, key);
    },
    getClass: (key: string) => classMap.get(key),
  };

  return {
    Path: MockPath,
    Group: MockGroup,
    Triangle: MockTriangle,
    Line: MockLine,
    Rect: MockRect,
    Ellipse: MockEllipse,
    Polygon: MockPolygon,
    Polyline: MockPolyline,
    IText: MockIText,
    FabricText: MockFabricText,
    PencilBrush: MockPencilBrush,
    classRegistry: mockClassRegistry,
  };
});

// モック定義後に import（ホイスティング済みモックを使う）
import { Group, classRegistry } from 'fabric';

import { Arrow } from '../../../../components/site-surveys/tools/ArrowTool';

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

function getOutlinePath(arrow: Arrow): ChildPath {
  const children = (arrow as unknown as { _objects: ChildPath[] })._objects;
  if (!children || children.length < 1) {
    throw new Error(`Expected Arrow Group to have at least 1 child path`);
  }
  return children[0] as ChildPath;
}

// ============================================================================
// テストスイート
// ============================================================================

describe('registerCustomShapes — Group 版 Arrow の再登録 (Task 65.3, Req 24.9)', () => {
  // NOTE: registerCustomShapes は module import 時の side-effect で classRegistry へ
  //       登録する。beforeEach で classMap をクリアすると、モジュール cache により
  //       以後の `await import` は side-effect を再実行せず、登録が失われる。
  //       本テストでは spy の履歴のみリセットし、登録状態は保持する（冪等な登録なので安全）。
  beforeEach(() => {
    mockSetClass.mockClear();
    mockSet.mockClear();
    mockSetCoords.mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('classRegistry への登録', () => {
    it('registerCustomShapes の import で classRegistry.setClass が呼ばれ、type="arrow" に Group ベース Arrow が登録される', async () => {
      // side-effect import で登録処理を走らせる
      await import('../../../../components/site-surveys/tools/registerCustomShapes');

      // Arrow が 'arrow' キーで setClass 呼び出しされている
      const arrowCall = mockSetClass.mock.calls.find((call) => call[1] === 'arrow');
      expect(arrowCall).toBeDefined();
      expect(arrowCall![0]).toBe(Arrow);
    });

    it('classRegistry.getClass("arrow") が Group ベースの Arrow クラスを返す', async () => {
      await import('../../../../components/site-surveys/tools/registerCustomShapes');

      const registered = classRegistry.getClass('arrow');

      expect(registered).toBe(Arrow);
    });

    it('登録された Arrow クラスで生成したインスタンスは Fabric.js Group のサブクラス', async () => {
      await import('../../../../components/site-surveys/tools/registerCustomShapes');

      const Registered = classRegistry.getClass('arrow') as typeof Arrow;
      const instance = new Registered({ x: 0, y: 0 }, { x: 100, y: 0 });

      expect(instance).toBeInstanceOf(Group);
    });
  });

  describe('旧形式 JSON（outline 未定義）の復元（enlivenObjects 経路）', () => {
    // NOTE: `util.enlivenObjects` を直接呼ばず、Fabric が内部で使う
    //       `classRegistry.getClass('arrow').fromObject(obj)` 経路を直接叩く。
    //       これは同経路が実運用の enlivenObjects パイプラインで使われる唯一の
    //       Arrow 固有処理であり、Group 版への差し替えが壊れていないことを検証する。

    it('outline 未定義の旧 JSON から Arrow.fromObject で Group インスタンスとして復元される', async () => {
      await import('../../../../components/site-surveys/tools/registerCustomShapes');
      const Registered = classRegistry.getClass('arrow') as typeof Arrow;

      const legacyJson = {
        type: 'arrow' as const,
        startPoint: { x: 10, y: 10 },
        endPoint: { x: 100, y: 100 },
        stroke: '#000000',
        strokeWidth: 2,
        arrowheadSize: 10,
      };

      const restored = await Registered.fromObject(legacyJson);

      expect(restored).toBeInstanceOf(Group);
      expect(restored).toBeInstanceOf(Arrow);
      expect(restored.type).toBe('arrow');
    });

    it('outline 未定義の旧 JSON を復元すると白縁取りは opacity=0（後方互換: 白縁取り無し表現）', async () => {
      await import('../../../../components/site-surveys/tools/registerCustomShapes');
      const Registered = classRegistry.getClass('arrow') as typeof Arrow;

      const legacyJson = {
        type: 'arrow' as const,
        startPoint: { x: 10, y: 10 },
        endPoint: { x: 100, y: 100 },
        stroke: '#ff0000',
        strokeWidth: 3,
        arrowheadSize: 10,
      };

      const restored = await Registered.fromObject(legacyJson);

      // Req 24.9: outline 未定義データは白縁取り無しの従来表現
      expect(restored.getOutline()!.enabled).toBe(false);
      expect(getOutlinePath(restored).opacity).toBe(0);
    });
  });

  describe('新形式 JSON（outline 付き）の復元', () => {
    it('outline 付きの新 JSON を復元すると outline が保持され、Group インスタンスが返る', async () => {
      await import('../../../../components/site-surveys/tools/registerCustomShapes');
      const Registered = classRegistry.getClass('arrow') as typeof Arrow;

      const newJson = {
        type: 'arrow' as const,
        startPoint: { x: 5, y: 5 },
        endPoint: { x: 80, y: 80 },
        stroke: '#ff0000',
        strokeWidth: 4,
        arrowheadSize: 12,
        outline: { enabled: true, color: '#ffffff', width: 3 },
      };

      const restored = await Registered.fromObject(newJson);

      expect(restored).toBeInstanceOf(Group);
      expect(restored.type).toBe('arrow');
      expect(restored.getOutline()).toEqual({
        enabled: true,
        color: '#ffffff',
        width: 3,
      });
    });
  });
});
