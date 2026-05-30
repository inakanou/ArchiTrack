/**
 * @fileoverview `registerCustomShapes` で 6 形状（rectangle / circle / polygon / polyline /
 *               freehand / dimension）の Group 版が再登録されることの統合テスト（Task 86）
 *
 * Requirements:
 * - 32.7: 保存された白縁取り属性を復元して表示する（新形式 JSON の復元経路）
 * - 32.9: outline 未定義の旧データは白縁取り無しの従来表現で表示する（後方互換）。
 *         Group 版への差し替えで `util.enlivenObjects` 経路（= `*.fromObject`）を
 *         壊さないことを保証する。
 *
 * テスト対象:
 * - `registerCustomShapes.ts` の import で 6 形状すべてが
 *   `classRegistry.setClass(ClassName, typeId)` で登録され、
 *   type ID（'rectangleShape' / 'circleShape' / 'polygonShape' / 'polylineShape' /
 *   'freehand' / 'dimensionLine'）は既存値を維持する（旧データの復元経路を破壊しない）。
 * - 登録された各クラスの `fromObject` に旧形式 JSON（outline 未定義）を渡すと、
 *   Group インスタンスとして復元され、白縁取り無しの従来表現
 *   （outlineShape.opacity = 0, getOutline().enabled = false）が維持される。
 *
 * Note:
 *   `util.enlivenObjects` の内部パイプラインは Fabric 側で
 *   `classRegistry.getClass(type).fromObject(...)` 相当の処理を行うため、
 *   本テストでは「登録確認」と「`classRegistry.getClass(...).fromObject` の直接検証」で
 *   "enlivenObjects 経路を壊さない" 観測可能完了を成立させる。
 *
 * @requirement site-survey/REQ-32.7
 * @requirement site-survey/REQ-32.9
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ============================================================================
// Fabric.js のモック
// ============================================================================
// - classRegistry: setClass/getClass を spy できるようにする（登録検証用）
// - Group + 各種子形状（Rect / Ellipse / Polygon / Polyline / Path / FabricText）:
//   6 形状クラスがそれぞれ extends Group するため必須。
//   registerCustomShapes.arrow.test.ts と同形状のモック構造を踏襲する。
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
    opacity?: number;
    strokeWidth?: number;
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

  class MockEllipse {
    opacity?: number;
    strokeWidth?: number;
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

  class MockPolygon {
    opacity?: number;
    strokeWidth?: number;
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
      mockSet(options, value);
      return this;
    }
  }

  class MockPolyline {
    opacity?: number;
    strokeWidth?: number;
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
      mockSet(options, value);
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
    fontSize?: number;
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
  // `registerCustomShapes.ts` は第 2 引数で type ID（'rectangleShape' 等）を明示指定するため、
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

import { RectangleShape } from '../../../components/site-surveys/tools/RectangleTool';
import { CircleShape } from '../../../components/site-surveys/tools/CircleTool';
import { PolygonShape } from '../../../components/site-surveys/tools/PolygonTool';
import { PolylineShape } from '../../../components/site-surveys/tools/PolylineTool';
import { FreehandPath } from '../../../components/site-surveys/tools/FreehandTool';
import { DimensionLine } from '../../../components/site-surveys/tools/DimensionTool';

// ============================================================================
// ヘルパー
// ============================================================================

type ChildWithOpacity = {
  opacity?: number;
};

/**
 * Group ベース形状の `_objects[0]`（= outline 子オブジェクト）を取り出す。
 * 6 形状はすべて `[outline*, body*, ...]` の順で super に渡しているため、
 * `_objects[0]` が outline 子に対応する。
 */
function getOutlineChild(shape: { _objects: unknown[] }): ChildWithOpacity {
  if (!shape._objects || shape._objects.length < 1) {
    throw new Error('Expected Group-based shape to have at least 1 outline child');
  }
  return shape._objects[0] as ChildWithOpacity;
}

// ============================================================================
// テストスイート
// ============================================================================

describe('registerCustomShapes — 6 形状 Group 版の再登録 (Task 86, Req 32.7 / 32.9)', () => {
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

  // ==========================================================================
  // classRegistry への登録（type ID 維持の検証）
  // ==========================================================================

  describe('classRegistry への登録（type ID は既存値を維持し、旧データ復元経路を破壊しない）', () => {
    // NOTE: モジュールキャッシュにより `registerCustomShapes` の side-effect は
    //       テストファイル全体で 1 度だけ実行される。`mockSetClass.mock.calls` は
    //       beforeEach でクリアされてしまうため、setClass 呼び出し履歴は最初の
    //       1 テストでのみ確認し、後続では永続性のある `classRegistry.getClass`
    //       経由で「正しい Group 版クラスが登録されている」ことを検証する。

    it('registerCustomShapes の import で 6 形状すべてが setClass で登録される（履歴検証）', async () => {
      await import('../../../components/site-surveys/tools/registerCustomShapes');

      const expected: ReadonlyArray<readonly [string, unknown]> = [
        ['rectangleShape', RectangleShape],
        ['circleShape', CircleShape],
        ['polygonShape', PolygonShape],
        ['polylineShape', PolylineShape],
        ['freehand', FreehandPath],
        ['dimensionLine', DimensionLine],
      ];

      for (const [typeId, expectedClass] of expected) {
        const call = mockSetClass.mock.calls.find((c) => c[1] === typeId);
        expect(call, `setClass call for type="${typeId}" should exist`).toBeDefined();
        expect(call![0]).toBe(expectedClass);
      }
    });

    it.each([
      ['rectangleShape', () => RectangleShape] as const,
      ['circleShape', () => CircleShape] as const,
      ['polygonShape', () => PolygonShape] as const,
      ['polylineShape', () => PolylineShape] as const,
      ['freehand', () => FreehandPath] as const,
      ['dimensionLine', () => DimensionLine] as const,
    ])(
      'classRegistry.getClass("%s") は Group ベースクラスを返す（type ID 維持）',
      async (typeId, getExpectedClass) => {
        await import('../../../components/site-surveys/tools/registerCustomShapes');

        const registered = classRegistry.getClass(typeId);
        expect(registered).toBe(getExpectedClass());
      }
    );
  });

  // ==========================================================================
  // 旧形式 JSON（outline 未定義）の復元（enlivenObjects 経路）
  // ==========================================================================
  // 各形状の `classRegistry.getClass(typeId).fromObject(legacyJson)` を直接叩く。
  // これは `util.enlivenObjects` の内部で実行される唯一の形状固有処理であり、
  // Group 版への差し替えで旧データ復元経路が壊れていないことを検証する。

  describe('旧形式 JSON（outline 未定義）の復元 — Req 32.9 後方互換', () => {
    it('rectangleShape: outline 未定義の旧 JSON を Group インスタンス + 白縁取り無しで復元', async () => {
      await import('../../../components/site-surveys/tools/registerCustomShapes');
      const Registered = classRegistry.getClass('rectangleShape') as typeof RectangleShape;

      const legacyJson = {
        type: 'rectangleShape' as const,
        left: 10,
        top: 20,
        width: 100,
        height: 50,
        stroke: '#000000',
        strokeWidth: 2,
        fill: 'transparent',
      };

      const restored = await Registered.fromObject(legacyJson);

      expect(restored).toBeInstanceOf(Group);
      expect(restored).toBeInstanceOf(RectangleShape);
      expect(restored.type).toBe('rectangleShape');
      // Req 32.9: outline 未定義データは白縁取り無しの従来表現
      expect(restored.getOutline()!.enabled).toBe(false);
      expect(getOutlineChild(restored as unknown as { _objects: unknown[] }).opacity).toBe(0);
    });

    it('circleShape: outline 未定義の旧 JSON を Group インスタンス + 白縁取り無しで復元', async () => {
      await import('../../../components/site-surveys/tools/registerCustomShapes');
      const Registered = classRegistry.getClass('circleShape') as typeof CircleShape;

      const legacyJson = {
        type: 'circleShape' as const,
        centerX: 50,
        centerY: 50,
        rx: 30,
        ry: 20,
        stroke: '#000000',
        strokeWidth: 2,
        fill: 'transparent',
      };

      const restored = await Registered.fromObject(legacyJson);

      expect(restored).toBeInstanceOf(Group);
      expect(restored).toBeInstanceOf(CircleShape);
      expect(restored.type).toBe('circleShape');
      expect(restored.getOutline()!.enabled).toBe(false);
      expect(getOutlineChild(restored as unknown as { _objects: unknown[] }).opacity).toBe(0);
    });

    it('polygonShape: outline 未定義の旧 JSON を Group インスタンス + 白縁取り無しで復元', async () => {
      await import('../../../components/site-surveys/tools/registerCustomShapes');
      const Registered = classRegistry.getClass('polygonShape') as typeof PolygonShape;

      const legacyJson = {
        type: 'polygonShape' as const,
        points: [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
          { x: 50, y: 80 },
        ],
        stroke: '#000000',
        strokeWidth: 2,
        fill: 'transparent',
      };

      const restored = await Registered.fromObject(legacyJson);

      expect(restored).toBeInstanceOf(Group);
      expect(restored).toBeInstanceOf(PolygonShape);
      expect(restored.type).toBe('polygonShape');
      expect(restored.getOutline()!.enabled).toBe(false);
      expect(getOutlineChild(restored as unknown as { _objects: unknown[] }).opacity).toBe(0);
    });

    it('polylineShape: outline 未定義の旧 JSON を Group インスタンス + 白縁取り無しで復元', async () => {
      await import('../../../components/site-surveys/tools/registerCustomShapes');
      const Registered = classRegistry.getClass('polylineShape') as typeof PolylineShape;

      const legacyJson = {
        type: 'polylineShape' as const,
        points: [
          { x: 0, y: 0 },
          { x: 50, y: 30 },
          { x: 100, y: 0 },
        ],
        stroke: '#000000',
        strokeWidth: 2,
        fill: 'transparent',
      };

      const restored = await Registered.fromObject(legacyJson);

      expect(restored).toBeInstanceOf(Group);
      expect(restored).toBeInstanceOf(PolylineShape);
      expect(restored.type).toBe('polylineShape');
      expect(restored.getOutline()!.enabled).toBe(false);
      expect(getOutlineChild(restored as unknown as { _objects: unknown[] }).opacity).toBe(0);
    });

    it('freehand: outline 未定義の旧 JSON を Group インスタンス + 白縁取り無しで復元', async () => {
      await import('../../../components/site-surveys/tools/registerCustomShapes');
      const Registered = classRegistry.getClass('freehand') as typeof FreehandPath;

      const legacyJson = {
        type: 'freehand' as const,
        pathData: 'M 0 0 L 10 10 L 20 5',
        stroke: '#000000',
        strokeWidth: 2,
        fill: 'transparent',
        strokeLineCap: 'round',
        strokeLineJoin: 'round',
      };

      const restored = await Registered.fromObject(legacyJson);

      expect(restored).toBeInstanceOf(Group);
      expect(restored).toBeInstanceOf(FreehandPath);
      expect(restored.type).toBe('freehand');
      expect(restored.getOutline()!.enabled).toBe(false);
      expect(getOutlineChild(restored as unknown as { _objects: unknown[] }).opacity).toBe(0);
    });

    it('dimensionLine: outline 未定義の旧 JSON を Group インスタンス + 白縁取り無しで復元', async () => {
      await import('../../../components/site-surveys/tools/registerCustomShapes');
      const Registered = classRegistry.getClass('dimensionLine') as typeof DimensionLine;

      const legacyJson = {
        type: 'dimensionLine' as const,
        startPoint: { x: 10, y: 10 },
        endPoint: { x: 110, y: 10 },
        stroke: '#000000',
        strokeWidth: 2,
        capLength: 10,
        customData: { dimensionValue: '100', dimensionUnit: 'mm' },
      };

      const restored = await Registered.fromObject(legacyJson);

      expect(restored).toBeInstanceOf(Group);
      expect(restored).toBeInstanceOf(DimensionLine);
      expect(restored.type).toBe('dimensionLine');
      // Req 32.9: outline 未定義 → 線部白縁取りは enabled=false / opacity=0
      expect(restored.getOutline()!.enabled).toBe(false);
      expect(getOutlineChild(restored as unknown as { _objects: unknown[] }).opacity).toBe(0);
    });
  });
});
