/**
 * @fileoverview 四角形ツール 白縁取り構造テスト（Task 77.1）
 *
 * Requirements:
 * - 32.1: 矢印以外の形状（寸法線・円・四角形・多角形・折れ線・フリーハンド）にも白色縁取りを付与する
 * - 32.2: 白縁取り線幅を本体線幅の 1.5 倍以上に設定する
 * - 32.3: 本体色を変更しても白縁取りは白のまま維持する
 * - 32.4: 移動・リサイズ・回転時に本体と同期して白縁取りを変形する
 *
 * テスト対象:
 * - Rectangle (RectangleShape) extends Group（2つの子: outlineRect + bodyRect）
 * - setStroke / setStrokeWidth / setOutline / getOutline の挙動
 * - 線の端点・接合は round（視認性確保）
 * - Group 構造は setOutline({enabled:false}) でも維持される
 *
 * @requirement site-survey/REQ-32.1
 * @requirement site-survey/REQ-32.2
 * @requirement site-survey/REQ-32.3
 * @requirement site-survey/REQ-32.4
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// vi.hoistedでモック関数を定義（ホイスティング対応）
const { mockSetCoords, mockSet } = vi.hoisted(() => {
  return {
    mockSetCoords: vi.fn(),
    mockSet: vi.fn(),
  };
});

// Fabric.jsのモック
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

import { Group } from 'fabric';

import {
  RectangleShape,
  createRectangle,
} from '../../../../components/site-surveys/tools/RectangleTool';
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
  // RectangleShape extends Group; MockGroup exposes `_objects` array
  return (rect as unknown as { _objects: ChildRect[] })._objects;
}

/**
 * Group の 2 つの子（outline, body）をタプルとして取得する。
 * Task 77.1 の Rectangle は常に 2 つの子 Rect を持つことが不変条件。
 */
function getOutlineAndBody(rect: RectangleShape): [ChildRect, ChildRect] {
  const children = getChildren(rect);
  if (children.length < 2) {
    throw new Error(
      `Expected Rectangle to have 2 children (outline + body), got ${children.length}`
    );
  }
  return [children[0] as ChildRect, children[1] as ChildRect];
}

// ============================================================================
// テストスイート
// ============================================================================

describe('Rectangle (Group + 白縁取り)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Group 構造（Req 32.1）', () => {
    it('RectangleShape は Fabric.js Group を継承している', () => {
      const rect = new RectangleShape(100, 100, 200, 150);

      expect(rect).toBeInstanceOf(Group);
    });

    it('RectangleShape は 2 つの子 Rect（outlineRect + bodyRect）を持つ', () => {
      const rect = new RectangleShape(100, 100, 200, 150);

      const children = getChildren(rect);
      expect(children).toHaveLength(2);
    });

    it('外側の白縁取りが最初、本体色が次、の順序で配置される', () => {
      const bodyColor = '#ff0000';
      const rect = new RectangleShape(100, 100, 200, 150, { stroke: bodyColor });

      const [outline, body] = getOutlineAndBody(rect);
      expect(outline.stroke).toBe('#ffffff');
      expect(body.stroke).toBe(bodyColor);
    });

    it('type プロパティは "rectangleShape" を維持する（classRegistry 後方互換）', () => {
      const rect = new RectangleShape(100, 100, 200, 150);

      expect(rect.type).toBe('rectangleShape');
    });
  });

  describe('白縁取りの視認性（Req 32.2）', () => {
    it('白縁取りの線幅は本体線幅 + outline.width * 2 である', () => {
      const rect = new RectangleShape(100, 100, 200, 150, { strokeWidth: 3 });

      const [outline, body] = getOutlineAndBody(rect);
      expect(body.strokeWidth).toBe(3);
      expect(outline.strokeWidth).toBe(3 + ANNOTATION_DEFAULTS.rectangleOutline.width * 2);
    });

    it('白縁取り線幅は本体線幅の 1.5 倍以上である（既定）', () => {
      const rect = new RectangleShape(100, 100, 200, 150, { strokeWidth: 3 });

      const [outline, body] = getOutlineAndBody(rect);
      expect((outline.strokeWidth ?? 0) / (body.strokeWidth ?? 1)).toBeGreaterThanOrEqual(1.5);
    });

    it('外側 Rect は strokeLineCap: round / strokeLineJoin: round を適用する', () => {
      const rect = new RectangleShape(100, 100, 200, 150);

      const [outline] = getOutlineAndBody(rect);
      expect(outline.strokeLineCap).toBe('round');
      expect(outline.strokeLineJoin).toBe('round');
    });

    it('外側 Rect の fill は transparent', () => {
      const rect = new RectangleShape(100, 100, 200, 150);

      const [outline] = getOutlineAndBody(rect);
      expect(outline.fill).toBe('transparent');
    });

    it('本体 Rect の fill は指定された塗りつぶし色を維持する', () => {
      const rect = new RectangleShape(100, 100, 200, 150, { fill: '#00ff00' });

      const [, body] = getOutlineAndBody(rect);
      expect(body.fill).toBe('#00ff00');
    });
  });

  describe('本体色変更で白縁取りは白のまま（Req 32.3）', () => {
    it('setStroke で本体色を変更しても外側 Rect は白を維持', () => {
      const rect = new RectangleShape(100, 100, 200, 150, { stroke: '#ff0000' });

      rect.setStroke('#00ff00');

      const [outline, body] = getOutlineAndBody(rect);
      expect(outline.stroke).toBe('#ffffff');
      expect(body.stroke).toBe('#00ff00');
    });

    it('setStrokeWidth 更新時、外側 Rect の線幅も連動する（本体+outline*2）', () => {
      const rect = new RectangleShape(100, 100, 200, 150);

      rect.setStrokeWidth(5);

      const [outline, body] = getOutlineAndBody(rect);
      expect(body.strokeWidth).toBe(5);
      expect(outline.strokeWidth).toBe(5 + ANNOTATION_DEFAULTS.rectangleOutline.width * 2);
    });

    it('setFill で本体塗りつぶしを変更しても外側 Rect は transparent を維持', () => {
      const rect = new RectangleShape(100, 100, 200, 150);

      rect.setFill('#00ff00');

      const [outline, body] = getOutlineAndBody(rect);
      expect(outline.fill).toBe('transparent');
      expect(body.fill).toBe('#00ff00');
    });
  });

  describe('outline 属性の API', () => {
    it('getOutline はデフォルトで ANNOTATION_DEFAULTS.rectangleOutline を返す', () => {
      const rect = new RectangleShape(100, 100, 200, 150);

      const outline = rect.getOutline();

      expect(outline).toEqual(ANNOTATION_DEFAULTS.rectangleOutline);
    });

    it('getOutline はコピーを返す（外部からの破壊を防ぐ）', () => {
      const rect = new RectangleShape(100, 100, 200, 150);

      const outline1 = rect.getOutline();
      outline1!.color = '#000000';
      const outline2 = rect.getOutline();

      expect(outline2!.color).toBe('#ffffff');
    });

    it('setOutline({ enabled: false }) で外側 Rect の opacity が 0 になる', () => {
      const rect = new RectangleShape(100, 100, 200, 150);

      rect.setOutline({ enabled: false });

      const [outline] = getOutlineAndBody(rect);
      expect(outline.opacity).toBe(0);
      expect(rect.getOutline()!.enabled).toBe(false);
    });

    it('setOutline({ enabled: true }) で外側 Rect の opacity が 1 に戻る', () => {
      const rect = new RectangleShape(100, 100, 200, 150);
      rect.setOutline({ enabled: false });

      rect.setOutline({ enabled: true });

      const [outline] = getOutlineAndBody(rect);
      expect(outline.opacity).toBe(1);
      expect(rect.getOutline()!.enabled).toBe(true);
    });

    it('setOutline({ width: 4 }) で外側 Rect の strokeWidth が更新される', () => {
      const rect = new RectangleShape(100, 100, 200, 150, { strokeWidth: 3 });

      rect.setOutline({ width: 4 });

      const [outline] = getOutlineAndBody(rect);
      expect(outline.strokeWidth).toBe(3 + 4 * 2);
      expect(rect.getOutline()!.width).toBe(4);
    });

    it('setOutline で Group 構造（子の数）は維持される（enabled=false でも remove しない）', () => {
      const rect = new RectangleShape(100, 100, 200, 150);

      rect.setOutline({ enabled: false });

      expect(getChildren(rect)).toHaveLength(2);
    });
  });

  describe('ジオメトリ更新時の同期（Req 32.4）', () => {
    it('setDimensions で両方の子 Rect の width/height が同期更新される', () => {
      const rect = new RectangleShape(100, 100, 200, 150);
      const [outlineBefore, bodyBefore] = getOutlineAndBody(rect);

      rect.setDimensions(300, 250);

      const [outlineAfter, bodyAfter] = getOutlineAndBody(rect);
      expect(outlineAfter.width).toBe(300);
      expect(outlineAfter.height).toBe(250);
      expect(bodyAfter.width).toBe(300);
      expect(bodyAfter.height).toBe(250);
      // 参照の同一性（remove/再作成ではなく既存子の更新）
      expect(outlineBefore).toBe(outlineAfter);
      expect(bodyBefore).toBe(bodyAfter);
    });

    it('updateFromDrag で両方の子 Rect の width/height が同期更新される', () => {
      const rect = new RectangleShape(100, 100, 200, 150);

      rect.updateFromDrag({ x: 50, y: 50 }, { x: 250, y: 200 });

      const [outline, body] = getOutlineAndBody(rect);
      expect(outline.width).toBe(200);
      expect(outline.height).toBe(150);
      expect(body.width).toBe(200);
      expect(body.height).toBe(150);
    });
  });

  describe('ファクトリ関数との統合', () => {
    it('createRectangle で生成した四角形も Group 構造を持つ', () => {
      const rect = createRectangle({ x: 100, y: 100 }, { x: 300, y: 200 });

      expect(rect).not.toBeNull();
      expect(rect!).toBeInstanceOf(Group);
      expect(getChildren(rect!)).toHaveLength(2);
    });
  });
});
