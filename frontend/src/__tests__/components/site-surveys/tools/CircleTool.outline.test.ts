/**
 * @fileoverview 円・楕円ツール 白縁取り構造テスト（Task 78.1）
 *
 * Requirements:
 * - 32.1: 矢印以外の形状（寸法線・円・四角形・多角形・折れ線・フリーハンド）にも白色縁取りを付与する
 * - 32.2: 白縁取り線幅を本体線幅の 1.5 倍以上に設定する
 * - 32.3: 本体色を変更しても白縁取りは白のまま維持する
 * - 32.4: 移動・リサイズ・回転時に本体と同期して白縁取りを変形する
 *
 * テスト対象:
 * - Circle (CircleShape) extends Group（2つの子: outlineEllipse + bodyEllipse）
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

import { Group } from 'fabric';

import { CircleShape, createCircle } from '../../../../components/site-surveys/tools/CircleTool';
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
  // CircleShape extends Group; MockGroup exposes `_objects` array
  return (circle as unknown as { _objects: ChildEllipse[] })._objects;
}

/**
 * Group の 2 つの子（outline, body）をタプルとして取得する。
 * Task 78.1 の Circle は常に 2 つの子 Ellipse を持つことが不変条件。
 */
function getOutlineAndBody(circle: CircleShape): [ChildEllipse, ChildEllipse] {
  const children = getChildren(circle);
  if (children.length < 2) {
    throw new Error(`Expected Circle to have 2 children (outline + body), got ${children.length}`);
  }
  return [children[0] as ChildEllipse, children[1] as ChildEllipse];
}

// ============================================================================
// テストスイート
// ============================================================================

describe('Circle (Group + 白縁取り)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Group 構造（Req 32.1）', () => {
    it('CircleShape は Fabric.js Group を継承している', () => {
      const circle = new CircleShape(150, 150, 50, 50);

      expect(circle).toBeInstanceOf(Group);
    });

    it('CircleShape は 2 つの子 Ellipse（outlineEllipse + bodyEllipse）を持つ', () => {
      const circle = new CircleShape(150, 150, 50, 50);

      const children = getChildren(circle);
      expect(children).toHaveLength(2);
    });

    it('外側の白縁取りが最初、本体色が次、の順序で配置される', () => {
      const bodyColor = '#ff0000';
      const circle = new CircleShape(150, 150, 50, 50, { stroke: bodyColor });

      const [outline, body] = getOutlineAndBody(circle);
      expect(outline.stroke).toBe('#ffffff');
      expect(body.stroke).toBe(bodyColor);
    });

    it('type プロパティは "circleShape" を維持する（classRegistry 後方互換）', () => {
      const circle = new CircleShape(150, 150, 50, 50);

      expect(circle.type).toBe('circleShape');
    });
  });

  describe('白縁取りの視認性（Req 32.2）', () => {
    it('白縁取りの線幅は本体線幅 + outline.width * 2 である', () => {
      const circle = new CircleShape(150, 150, 50, 50, { strokeWidth: 3 });

      const [outline, body] = getOutlineAndBody(circle);
      expect(body.strokeWidth).toBe(3);
      expect(outline.strokeWidth).toBe(3 + ANNOTATION_DEFAULTS.circleOutline.width * 2);
    });

    it('白縁取り線幅は本体線幅の 1.5 倍以上である（既定）', () => {
      const circle = new CircleShape(150, 150, 50, 50, { strokeWidth: 3 });

      const [outline, body] = getOutlineAndBody(circle);
      expect((outline.strokeWidth ?? 0) / (body.strokeWidth ?? 1)).toBeGreaterThanOrEqual(1.5);
    });

    it('外側 Ellipse は strokeLineCap: round / strokeLineJoin: round を適用する', () => {
      const circle = new CircleShape(150, 150, 50, 50);

      const [outline] = getOutlineAndBody(circle);
      expect(outline.strokeLineCap).toBe('round');
      expect(outline.strokeLineJoin).toBe('round');
    });

    it('外側 Ellipse の fill は transparent', () => {
      const circle = new CircleShape(150, 150, 50, 50);

      const [outline] = getOutlineAndBody(circle);
      expect(outline.fill).toBe('transparent');
    });

    it('本体 Ellipse の fill は指定された塗りつぶし色を維持する', () => {
      const circle = new CircleShape(150, 150, 50, 50, { fill: '#00ff00' });

      const [, body] = getOutlineAndBody(circle);
      expect(body.fill).toBe('#00ff00');
    });
  });

  describe('本体色変更で白縁取りは白のまま（Req 32.3）', () => {
    it('setStroke で本体色を変更しても外側 Ellipse は白を維持', () => {
      const circle = new CircleShape(150, 150, 50, 50, { stroke: '#ff0000' });

      circle.setStroke('#00ff00');

      const [outline, body] = getOutlineAndBody(circle);
      expect(outline.stroke).toBe('#ffffff');
      expect(body.stroke).toBe('#00ff00');
    });

    it('setStrokeWidth 更新時、外側 Ellipse の線幅も連動する（本体+outline*2）', () => {
      const circle = new CircleShape(150, 150, 50, 50);

      circle.setStrokeWidth(5);

      const [outline, body] = getOutlineAndBody(circle);
      expect(body.strokeWidth).toBe(5);
      expect(outline.strokeWidth).toBe(5 + ANNOTATION_DEFAULTS.circleOutline.width * 2);
    });

    it('setFill で本体塗りつぶしを変更しても外側 Ellipse は transparent を維持', () => {
      const circle = new CircleShape(150, 150, 50, 50);

      circle.setFill('#00ff00');

      const [outline, body] = getOutlineAndBody(circle);
      expect(outline.fill).toBe('transparent');
      expect(body.fill).toBe('#00ff00');
    });
  });

  describe('outline 属性の API', () => {
    it('getOutline はデフォルトで ANNOTATION_DEFAULTS.circleOutline を返す', () => {
      const circle = new CircleShape(150, 150, 50, 50);

      const outline = circle.getOutline();

      expect(outline).toEqual(ANNOTATION_DEFAULTS.circleOutline);
    });

    it('getOutline はコピーを返す（外部からの破壊を防ぐ）', () => {
      const circle = new CircleShape(150, 150, 50, 50);

      const outline1 = circle.getOutline();
      outline1!.color = '#000000';
      const outline2 = circle.getOutline();

      expect(outline2!.color).toBe('#ffffff');
    });

    it('setOutline({ enabled: false }) で外側 Ellipse の opacity が 0 になる', () => {
      const circle = new CircleShape(150, 150, 50, 50);

      circle.setOutline({ enabled: false });

      const [outline] = getOutlineAndBody(circle);
      expect(outline.opacity).toBe(0);
      expect(circle.getOutline()!.enabled).toBe(false);
    });

    it('setOutline({ enabled: true }) で外側 Ellipse の opacity が 1 に戻る', () => {
      const circle = new CircleShape(150, 150, 50, 50);
      circle.setOutline({ enabled: false });

      circle.setOutline({ enabled: true });

      const [outline] = getOutlineAndBody(circle);
      expect(outline.opacity).toBe(1);
      expect(circle.getOutline()!.enabled).toBe(true);
    });

    it('setOutline({ width: 4 }) で外側 Ellipse の strokeWidth が更新される', () => {
      const circle = new CircleShape(150, 150, 50, 50, { strokeWidth: 3 });

      circle.setOutline({ width: 4 });

      const [outline] = getOutlineAndBody(circle);
      expect(outline.strokeWidth).toBe(3 + 4 * 2);
      expect(circle.getOutline()!.width).toBe(4);
    });

    it('setOutline で Group 構造（子の数）は維持される（enabled=false でも remove しない）', () => {
      const circle = new CircleShape(150, 150, 50, 50);

      circle.setOutline({ enabled: false });

      expect(getChildren(circle)).toHaveLength(2);
    });
  });

  describe('ジオメトリ更新時の同期（Req 32.4）', () => {
    it('setRadii で両方の子 Ellipse の rx/ry が同期更新される', () => {
      const circle = new CircleShape(150, 150, 50, 50);
      const [outlineBefore, bodyBefore] = getOutlineAndBody(circle);

      circle.setRadii(100, 75);

      const [outlineAfter, bodyAfter] = getOutlineAndBody(circle);
      expect(outlineAfter.rx).toBe(100);
      expect(outlineAfter.ry).toBe(75);
      expect(bodyAfter.rx).toBe(100);
      expect(bodyAfter.ry).toBe(75);
      // 参照の同一性（remove/再作成ではなく既存子の更新）
      expect(outlineBefore).toBe(outlineAfter);
      expect(bodyBefore).toBe(bodyAfter);
    });

    it('updateFromDrag で両方の子 Ellipse の rx/ry が同期更新される', () => {
      const circle = new CircleShape(150, 150, 50, 50);

      circle.updateFromDrag({ x: 100, y: 100 }, { x: 300, y: 200 });

      const [outline, body] = getOutlineAndBody(circle);
      expect(outline.rx).toBe(100);
      expect(outline.ry).toBe(50);
      expect(body.rx).toBe(100);
      expect(body.ry).toBe(50);
    });
  });

  describe('ファクトリ関数との統合', () => {
    it('createCircle で生成した円も Group 構造を持つ', () => {
      const circle = createCircle({ x: 100, y: 100 }, { x: 300, y: 200 });

      expect(circle).not.toBeNull();
      expect(circle!).toBeInstanceOf(Group);
      expect(getChildren(circle!)).toHaveLength(2);
    });
  });
});
