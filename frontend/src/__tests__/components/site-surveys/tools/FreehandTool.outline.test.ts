/**
 * @fileoverview フリーハンドツール 白縁取り構造テスト（Task 81.1）
 *
 * Requirements:
 * - 32.1: 矢印以外の形状（寸法線・円・四角形・多角形・折れ線・フリーハンド）にも白色縁取りを付与する
 * - 32.2: 白縁取り線幅を本体線幅の 1.5 倍以上に設定する
 * - 32.3: 本体色を変更しても白縁取りは白のまま維持する
 * - 32.4: 移動・リサイズ・回転・形状変形（端点移動・頂点追加/削除等）時に本体と同期して白縁取りを変形する
 *
 * テスト対象:
 * - FreehandPath extends Group（2つの子: outlinePath + bodyPath）
 * - setStroke / setStrokeWidth / setOutline / getOutline の挙動
 * - 線の端点・接合は round（視認性確保）
 * - Group 構造は setOutline({enabled:false}) でも維持される
 * - パスデータ変更（_setPath 経由）時に outlinePath と bodyPath を同期更新する
 * - 開放形状のため fill は両 path とも未使用（design.md 5347 行）
 *
 * @requirement site-survey/REQ-32.1
 * @requirement site-survey/REQ-32.2
 * @requirement site-survey/REQ-32.3
 * @requirement site-survey/REQ-32.4
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// vi.hoistedでモック関数を定義（ホイスティング対応）
const { mockSetCoords, mockSet, mockSetPath } = vi.hoisted(() => {
  return {
    mockSetCoords: vi.fn(),
    mockSet: vi.fn(),
    mockSetPath: vi.fn(),
  };
});

// Fabric.jsのモック
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

    _setPath(pathData: string | Array<unknown>): void {
      this.path = pathData;
      mockSetPath(pathData);
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

import { Group } from 'fabric';

import {
  FreehandPath,
  createFreehandPath,
} from '../../../../components/site-surveys/tools/FreehandTool';
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
  // FreehandPath extends Group; MockGroup exposes `_objects` array
  return (freehand as unknown as { _objects: ChildPath[] })._objects;
}

/**
 * Group の 2 つの子（outline, body）をタプルとして取得する。
 * Task 81.1 の Freehand は常に 2 つの子 Path を持つことが不変条件。
 */
function getOutlineAndBody(freehand: FreehandPath): [ChildPath, ChildPath] {
  const children = getChildren(freehand);
  if (children.length < 2) {
    throw new Error(
      `Expected Freehand to have 2 children (outline + body), got ${children.length}`
    );
  }
  return [children[0] as ChildPath, children[1] as ChildPath];
}

const FREEHAND_PATH_DATA = 'M 100 100 L 200 100 L 150 200';

// ============================================================================
// テストスイート
// ============================================================================

describe('Freehand (Group + 白縁取り)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Group 構造（Req 32.1）', () => {
    it('FreehandPath は Fabric.js Group を継承している', () => {
      const freehand = new FreehandPath(FREEHAND_PATH_DATA);

      expect(freehand).toBeInstanceOf(Group);
    });

    it('FreehandPath は 2 つの子 Path（outlinePath + bodyPath）を持つ', () => {
      const freehand = new FreehandPath(FREEHAND_PATH_DATA);

      const children = getChildren(freehand);
      expect(children).toHaveLength(2);
    });

    it('外側の白縁取りが最初、本体色が次、の順序で配置される', () => {
      const bodyColor = '#ff0000';
      const freehand = new FreehandPath(FREEHAND_PATH_DATA, { stroke: bodyColor });

      const [outline, body] = getOutlineAndBody(freehand);
      expect(outline.stroke).toBe('#ffffff');
      expect(body.stroke).toBe(bodyColor);
    });

    it('type プロパティは "freehand" を維持する（classRegistry 後方互換）', () => {
      const freehand = new FreehandPath(FREEHAND_PATH_DATA);

      expect(freehand.type).toBe('freehand');
    });

    it('外側 Path と本体 Path は同じパスデータを持つ', () => {
      const freehand = new FreehandPath(FREEHAND_PATH_DATA);

      const [outline, body] = getOutlineAndBody(freehand);
      expect(outline.path).toBe(FREEHAND_PATH_DATA);
      expect(body.path).toBe(FREEHAND_PATH_DATA);
    });
  });

  describe('白縁取りの視認性（Req 32.2）', () => {
    it('白縁取りの線幅は本体線幅 + outline.width * 2 である', () => {
      const freehand = new FreehandPath(FREEHAND_PATH_DATA, { strokeWidth: 3 });

      const [outline, body] = getOutlineAndBody(freehand);
      expect(body.strokeWidth).toBe(3);
      expect(outline.strokeWidth).toBe(3 + ANNOTATION_DEFAULTS.freehandOutline.width * 2);
    });

    it('白縁取り線幅は本体線幅の 1.5 倍以上である（既定）', () => {
      const freehand = new FreehandPath(FREEHAND_PATH_DATA, { strokeWidth: 3 });

      const [outline, body] = getOutlineAndBody(freehand);
      expect((outline.strokeWidth ?? 0) / (body.strokeWidth ?? 1)).toBeGreaterThanOrEqual(1.5);
    });

    it('外側 Path は strokeLineCap: round / strokeLineJoin: round を適用する', () => {
      const freehand = new FreehandPath(FREEHAND_PATH_DATA);

      const [outline] = getOutlineAndBody(freehand);
      expect(outline.strokeLineCap).toBe('round');
      expect(outline.strokeLineJoin).toBe('round');
    });

    it('開放形状のため外側 Path の fill は transparent（design.md 5347 行）', () => {
      const freehand = new FreehandPath(FREEHAND_PATH_DATA);

      const [outline] = getOutlineAndBody(freehand);
      expect(outline.fill).toBe('transparent');
    });

    it('開放形状のため本体 Path の fill も transparent（design.md 5347 行）', () => {
      const freehand = new FreehandPath(FREEHAND_PATH_DATA);

      const [, body] = getOutlineAndBody(freehand);
      expect(body.fill).toBe('transparent');
    });
  });

  describe('本体色変更で白縁取りは白のまま（Req 32.3）', () => {
    it('setStroke で本体色を変更しても外側 Path は白を維持', () => {
      const freehand = new FreehandPath(FREEHAND_PATH_DATA, { stroke: '#ff0000' });

      freehand.setStroke('#00ff00');

      const [outline, body] = getOutlineAndBody(freehand);
      expect(outline.stroke).toBe('#ffffff');
      expect(body.stroke).toBe('#00ff00');
    });

    it('setStrokeWidth 更新時、外側 Path の線幅も連動する（本体+outline*2）', () => {
      const freehand = new FreehandPath(FREEHAND_PATH_DATA);

      freehand.setStrokeWidth(5);

      const [outline, body] = getOutlineAndBody(freehand);
      expect(body.strokeWidth).toBe(5);
      expect(outline.strokeWidth).toBe(5 + ANNOTATION_DEFAULTS.freehandOutline.width * 2);
    });
  });

  describe('outline 属性の API', () => {
    it('getOutline はデフォルトで ANNOTATION_DEFAULTS.freehandOutline を返す', () => {
      const freehand = new FreehandPath(FREEHAND_PATH_DATA);

      const outline = freehand.getOutline();

      expect(outline).toEqual(ANNOTATION_DEFAULTS.freehandOutline);
    });

    it('getOutline はコピーを返す（外部からの破壊を防ぐ）', () => {
      const freehand = new FreehandPath(FREEHAND_PATH_DATA);

      const outline1 = freehand.getOutline();
      outline1!.color = '#000000';
      const outline2 = freehand.getOutline();

      expect(outline2!.color).toBe('#ffffff');
    });

    it('setOutline({ enabled: false }) で外側 Path の opacity が 0 になる', () => {
      const freehand = new FreehandPath(FREEHAND_PATH_DATA);

      freehand.setOutline({ enabled: false });

      const [outline] = getOutlineAndBody(freehand);
      expect(outline.opacity).toBe(0);
      expect(freehand.getOutline()!.enabled).toBe(false);
    });

    it('setOutline({ enabled: true }) で外側 Path の opacity が 1 に戻る', () => {
      const freehand = new FreehandPath(FREEHAND_PATH_DATA);
      freehand.setOutline({ enabled: false });

      freehand.setOutline({ enabled: true });

      const [outline] = getOutlineAndBody(freehand);
      expect(outline.opacity).toBe(1);
      expect(freehand.getOutline()!.enabled).toBe(true);
    });

    it('setOutline({ width: 4 }) で外側 Path の strokeWidth が更新される', () => {
      const freehand = new FreehandPath(FREEHAND_PATH_DATA, { strokeWidth: 3 });

      freehand.setOutline({ width: 4 });

      const [outline] = getOutlineAndBody(freehand);
      expect(outline.strokeWidth).toBe(3 + 4 * 2);
      expect(freehand.getOutline()!.width).toBe(4);
    });

    it('setOutline で Group 構造（子の数）は維持される（enabled=false でも remove しない）', () => {
      const freehand = new FreehandPath(FREEHAND_PATH_DATA);

      freehand.setOutline({ enabled: false });

      expect(getChildren(freehand)).toHaveLength(2);
    });
  });

  describe('ファクトリ関数との統合', () => {
    it('createFreehandPath で生成したフリーハンドも Group 構造を持つ', () => {
      const freehand = createFreehandPath(FREEHAND_PATH_DATA);

      expect(freehand).not.toBeNull();
      expect(freehand!).toBeInstanceOf(Group);
      expect(getChildren(freehand!)).toHaveLength(2);
    });
  });
});
