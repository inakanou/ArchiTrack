/**
 * @fileoverview 矢印ツール 白縁取り構造テスト（Task 65.1）
 *
 * Requirements:
 * - 24.1: 矢印本体線の両側に白色の縁取り線を付与して表示する
 * - 24.2: 白縁取り線幅を本体線幅の1.5倍以上の太さで付与する
 * - 24.3: 本体色を変更しても白縁取り部分の色は常に白のまま維持する
 * - 24.4: 移動・リサイズ・回転時に白縁取りを本体と同期して変形する
 *
 * テスト対象:
 * - Arrow extends Group（2つの子 Path: outlinePath + bodyPath）
 * - setStroke / setStrokeWidth / setOutline / getOutline の挙動
 * - 線の端点・接合は round（視認性確保）
 * - Group 移動時に子が連動
 * - ジオメトリ更新時に両方の子 Path のパスデータが更新される
 *
 * @requirement site-survey/REQ-24.1
 * @requirement site-survey/REQ-24.2
 * @requirement site-survey/REQ-24.3
 * @requirement site-survey/REQ-24.4
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// vi.hoistedでモック関数を定義（ホイスティング対応）
const { mockSetCoords, mockSet } = vi.hoisted(() => {
  return {
    mockSetCoords: vi.fn(),
    mockSet: vi.fn(),
  };
});

// Fabric.jsのモック（ArrowTool.test.ts と同一仕様）
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

  class MockLine {
    x1: number;
    y1: number;
    x2: number;
    y2: number;

    constructor(points?: number[], options?: Record<string, unknown>) {
      this.x1 = points?.[0] || 0;
      this.y1 = points?.[1] || 0;
      this.x2 = points?.[2] || 0;
      this.y2 = points?.[3] || 0;
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

  class MockGroup {
    _objects: unknown[];
    left?: number;
    top?: number;
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
    Line: MockLine,
    Group: MockGroup,
    Triangle: MockTriangle,
  };
});

import { Group } from 'fabric';

import { Arrow, createArrow } from '../../../../components/site-surveys/tools/ArrowTool';
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
  // Arrow extends Group; MockGroup exposes `_objects` array
  return (arrow as unknown as { _objects: ChildPath[] })._objects;
}

/**
 * Group の 2 つの子（outline, body）をタプルとして取得する。
 * 本タスク（65.1）の Arrow は常に 2 つの子 Path を持つことが不変条件。
 */
function getOutlineAndBody(arrow: Arrow): [ChildPath, ChildPath] {
  const children = getChildren(arrow);
  if (children.length < 2) {
    throw new Error(`Expected Arrow to have 2 children (outline + body), got ${children.length}`);
  }
  return [children[0] as ChildPath, children[1] as ChildPath];
}

// ============================================================================
// テストスイート
// ============================================================================

describe('Arrow (Group + 白縁取り)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Group 構造（Req 24.1）', () => {
    it('Arrow は Fabric.js Group を継承している', () => {
      const arrow = new Arrow({ x: 100, y: 100 }, { x: 300, y: 100 });

      expect(arrow).toBeInstanceOf(Group);
    });

    it('Arrow は 2 つの子 Path（outlinePath + bodyPath）を持つ', () => {
      const arrow = new Arrow({ x: 100, y: 100 }, { x: 300, y: 100 });

      const children = getChildren(arrow);
      expect(children).toHaveLength(2);
    });

    it('外側の白縁取りが最初、本体色が次、の順序で配置される', () => {
      const bodyColor = '#ff0000';
      const arrow = new Arrow({ x: 100, y: 100 }, { x: 300, y: 100 }, { stroke: bodyColor });

      const [outline, body] = getOutlineAndBody(arrow);
      // 外側の白縁取りが下に描画される（最初に追加）
      expect(outline.stroke).toBe('#ffffff');
      // 本体色が上に描画される
      expect(body.stroke).toBe(bodyColor);
    });

    it('type プロパティは "arrow" を維持する（classRegistry 後方互換）', () => {
      const arrow = new Arrow({ x: 100, y: 100 }, { x: 300, y: 100 });

      expect(arrow.type).toBe('arrow');
    });
  });

  describe('白縁取りの視認性（Req 24.2）', () => {
    it('白縁取りの線幅は本体線幅の 1.5 倍以上である（デフォルト: body=3, outline=7）', () => {
      const arrow = new Arrow({ x: 100, y: 100 }, { x: 300, y: 100 }, { strokeWidth: 3 });

      const [outline, body] = getOutlineAndBody(arrow);
      expect(body.strokeWidth).toBe(3);
      // outline width = ANNOTATION_DEFAULTS.arrowOutline.width (=2) × 2 + body strokeWidth (3) = 7
      expect(outline.strokeWidth).toBe(3 + ANNOTATION_DEFAULTS.arrowOutline.width * 2);
      expect((outline.strokeWidth ?? 0) / (body.strokeWidth ?? 1)).toBeGreaterThanOrEqual(1.5);
    });

    it('外側 Path は strokeLineCap: round / strokeLineJoin: round を適用する', () => {
      const arrow = new Arrow({ x: 100, y: 100 }, { x: 300, y: 100 });

      const [outline] = getOutlineAndBody(arrow);
      expect(outline.strokeLineCap).toBe('round');
      expect(outline.strokeLineJoin).toBe('round');
    });

    it('子 Path の fill は透明（空文字）', () => {
      const arrow = new Arrow({ x: 100, y: 100 }, { x: 300, y: 100 });

      const [outline, body] = getOutlineAndBody(arrow);
      expect(outline.fill).toBe('');
      expect(body.fill).toBe('');
    });
  });

  describe('本体色変更で白縁取りは白のまま（Req 24.3）', () => {
    it('setStroke で本体色を変更しても外側 Path は白を維持', () => {
      const arrow = new Arrow({ x: 100, y: 100 }, { x: 300, y: 100 }, { stroke: '#ff0000' });

      arrow.setStroke('#00ff00');

      const [outline, body] = getOutlineAndBody(arrow);
      expect(outline.stroke).toBe('#ffffff');
      expect(body.stroke).toBe('#00ff00');
    });

    it('setStrokeWidth 更新時、外側 Path の線幅も連動する（本体+outline*2）', () => {
      const arrow = new Arrow({ x: 100, y: 100 }, { x: 300, y: 100 });

      arrow.setStrokeWidth(5);

      const [outline, body] = getOutlineAndBody(arrow);
      expect(body.strokeWidth).toBe(5);
      expect(outline.strokeWidth).toBe(5 + ANNOTATION_DEFAULTS.arrowOutline.width * 2);
    });
  });

  describe('outline 属性の API', () => {
    it('getOutline はデフォルトで ANNOTATION_DEFAULTS.arrowOutline を返す', () => {
      const arrow = new Arrow({ x: 100, y: 100 }, { x: 300, y: 100 });

      const outline = arrow.getOutline();

      expect(outline).toEqual(ANNOTATION_DEFAULTS.arrowOutline);
    });

    it('getOutline はコピーを返す（外部からの破壊を防ぐ）', () => {
      const arrow = new Arrow({ x: 100, y: 100 }, { x: 300, y: 100 });

      const outline1 = arrow.getOutline();
      outline1!.color = '#000000';
      const outline2 = arrow.getOutline();

      expect(outline2!.color).toBe('#ffffff');
    });

    it('setOutline({ enabled: false }) で外側 Path の opacity が 0 になる', () => {
      const arrow = new Arrow({ x: 100, y: 100 }, { x: 300, y: 100 });

      arrow.setOutline({ enabled: false });

      const [outline] = getOutlineAndBody(arrow);
      expect(outline.opacity).toBe(0);
      expect(arrow.getOutline()!.enabled).toBe(false);
    });

    it('setOutline({ enabled: true }) で外側 Path の opacity が 1 に戻る', () => {
      const arrow = new Arrow({ x: 100, y: 100 }, { x: 300, y: 100 });
      arrow.setOutline({ enabled: false });

      arrow.setOutline({ enabled: true });

      const [outline] = getOutlineAndBody(arrow);
      expect(outline.opacity).toBe(1);
      expect(arrow.getOutline()!.enabled).toBe(true);
    });

    it('setOutline({ width: 4 }) で外側 Path の strokeWidth が更新される', () => {
      const arrow = new Arrow({ x: 100, y: 100 }, { x: 300, y: 100 }, { strokeWidth: 3 });

      arrow.setOutline({ width: 4 });

      const [outline] = getOutlineAndBody(arrow);
      expect(outline.strokeWidth).toBe(3 + 4 * 2);
      expect(arrow.getOutline()!.width).toBe(4);
    });

    it('setOutline で Group 構造（子の数）は維持される（enabled=false でも remove しない）', () => {
      const arrow = new Arrow({ x: 100, y: 100 }, { x: 300, y: 100 });

      arrow.setOutline({ enabled: false });

      expect(getChildren(arrow)).toHaveLength(2);
    });
  });

  describe('ジオメトリ更新時の同期（Req 24.4）', () => {
    it('setEndPoint で両方の子 Path のパスデータが同一内容に更新される', () => {
      const arrow = new Arrow({ x: 100, y: 100 }, { x: 300, y: 100 });
      const [outlineBefore, bodyBefore] = getOutlineAndBody(arrow);
      const initialPath = bodyBefore.path;

      arrow.setEndPoint({ x: 500, y: 200 });

      const [outlineAfter, bodyAfter] = getOutlineAndBody(arrow);
      expect(outlineAfter.path).toBeDefined();
      expect(bodyAfter.path).toBeDefined();
      expect(outlineAfter.path).toBe(bodyAfter.path);
      expect(bodyAfter.path).not.toBe(initialPath);
      // 参照の同一性
      expect(outlineBefore).toBe(outlineAfter);
      expect(bodyBefore).toBe(bodyAfter);
    });

    it('setArrowheadSize で両方の子 Path のパスデータが更新される', () => {
      const arrow = new Arrow({ x: 100, y: 100 }, { x: 300, y: 100 });
      const [, bodyBefore] = getOutlineAndBody(arrow);
      const initialPath = bodyBefore.path;

      arrow.setArrowheadSize(30);

      const [outlineAfter, bodyAfter] = getOutlineAndBody(arrow);
      expect(outlineAfter.path).toBe(bodyAfter.path);
      expect(bodyAfter.path).not.toBe(initialPath);
    });

    it('Group の left/top を変更すると子は Group と連動する（Fabric Group の transform 伝搬）', () => {
      const arrow = new Arrow({ x: 100, y: 100 }, { x: 300, y: 100 });

      arrow.set({ left: 200, top: 50 });

      // Group 自体の座標が更新されることを確認。
      // 実際の Fabric 環境では子は Group の変換行列で描画されるため、
      // 子オブジェクト個別の left/top は相対座標のまま維持される。
      expect((arrow as unknown as { left: number }).left).toBe(200);
      expect((arrow as unknown as { top: number }).top).toBe(50);
      // 子が 2 個のまま（構造維持）
      expect(getChildren(arrow)).toHaveLength(2);
    });
  });

  describe('ファクトリ関数との統合', () => {
    it('createArrow で生成した矢印も Group 構造を持つ', () => {
      const arrow = createArrow({ x: 100, y: 100 }, { x: 300, y: 100 });

      expect(arrow).not.toBeNull();
      expect(arrow!).toBeInstanceOf(Group);
      expect(getChildren(arrow!)).toHaveLength(2);
    });
  });
});
