/**
 * @fileoverview 矢印ツールのテスト
 *
 * Task 15.1: 矢印ツールを実装する（TDD）
 *
 * Requirements:
 * - 7.1: 矢印ツールを選択してドラッグすると開始点から終了点へ矢印を描画する
 *
 * テスト対象:
 * - ドラッグによる矢印描画
 * - 矢印の方向（開始点→終了点）
 * - カスタムFabric.jsオブジェクト実装
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// vi.hoistedでモック関数を定義（ホイスティング対応）
const { mockSetCoords, mockSet } = vi.hoisted(() => {
  return {
    mockSetCoords: vi.fn(),
    mockSet: vi.fn(),
  };
});

// Fabric.jsのモック - Pathクラスを継承可能にする
vi.mock('fabric', () => {
  // Pathモック（矢印用）
  class MockPath {
    path?: string;
    stroke?: string;
    strokeWidth?: number;
    fill?: string;
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

  // 基本的なLineモック
  class MockLine {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    stroke?: string;
    strokeWidth?: number;
    selectable?: boolean;
    evented?: boolean;

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

  // Triangleモック（矢印ヘッド用）
  class MockTriangle {
    left?: number;
    top?: number;
    width?: number;
    height?: number;
    angle?: number;
    fill?: string;
    stroke?: string;
    strokeWidth?: number;
    selectable?: boolean;
    evented?: boolean;
    originX?: string;
    originY?: string;

    constructor(options?: Record<string, unknown>) {
      this.width = 10;
      this.height = 15;
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

  // Groupモック - 継承可能なクラス
  class MockGroup {
    _objects: unknown[];
    hasControls: boolean;
    hasBorders: boolean;
    lockMovementX: boolean;
    lockMovementY: boolean;
    subTargetCheck: boolean;

    constructor(objects?: unknown[], options?: Record<string, unknown>) {
      this._objects = objects || [];
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

import {
  Arrow,
  createArrow,
  type ArrowOptions,
  DEFAULT_ARROW_OPTIONS,
} from '../../../components/site-surveys/tools/ArrowTool';

// ============================================================================
// テストスイート
// ============================================================================

describe('ArrowTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ==========================================================================
  // Task 15.1: 矢印ツール実装テスト
  // ==========================================================================
  describe('矢印描画機能', () => {
    describe('ドラッグによる矢印描画', () => {
      it('2点の座標から矢印オブジェクトが作成される', () => {
        const startPoint = { x: 100, y: 100 };
        const endPoint = { x: 300, y: 100 };

        const arrow = createArrow(startPoint, endPoint);

        expect(arrow).toBeDefined();
        expect(arrow).not.toBeNull();
        expect(arrow!.startPoint).toEqual(startPoint);
        expect(arrow!.endPoint).toEqual(endPoint);
      });

      it('水平な矢印が作成される（y座標が同じ場合）', () => {
        const startPoint = { x: 100, y: 200 };
        const endPoint = { x: 400, y: 200 };

        const arrow = createArrow(startPoint, endPoint);

        expect(arrow).not.toBeNull();
        expect(arrow!.isHorizontal).toBe(true);
        expect(arrow!.isVertical).toBe(false);
      });

      it('垂直な矢印が作成される（x座標が同じ場合）', () => {
        const startPoint = { x: 150, y: 100 };
        const endPoint = { x: 150, y: 400 };

        const arrow = createArrow(startPoint, endPoint);

        expect(arrow).not.toBeNull();
        expect(arrow!.isHorizontal).toBe(false);
        expect(arrow!.isVertical).toBe(true);
      });

      it('斜めの矢印が作成される', () => {
        const startPoint = { x: 100, y: 100 };
        const endPoint = { x: 300, y: 250 };

        const arrow = createArrow(startPoint, endPoint);

        expect(arrow).not.toBeNull();
        expect(arrow!.isHorizontal).toBe(false);
        expect(arrow!.isVertical).toBe(false);
      });

      it('始点と終点が同じ場合は矢印が作成されない', () => {
        const startPoint = { x: 100, y: 100 };
        const endPoint = { x: 100, y: 100 };

        const arrow = createArrow(startPoint, endPoint);

        expect(arrow).toBeNull();
      });

      it('非常に近い2点の場合でも矢印が作成される（5px以上）', () => {
        const startPoint = { x: 100, y: 100 };
        const endPoint = { x: 106, y: 100 }; // 6px離れている

        const arrow = createArrow(startPoint, endPoint);

        expect(arrow).not.toBeNull();
      });

      it('近すぎる2点の場合は矢印が作成されない（5px未満）', () => {
        const startPoint = { x: 100, y: 100 };
        const endPoint = { x: 103, y: 100 }; // 3px離れている

        const arrow = createArrow(startPoint, endPoint);

        expect(arrow).toBeNull();
      });
    });

    describe('矢印の方向（開始点→終了点）', () => {
      it('矢印はシャフト（始点から終点への直線）を含む', () => {
        const startPoint = { x: 100, y: 100 };
        const endPoint = { x: 300, y: 100 };

        const arrow = createArrow(startPoint, endPoint);

        expect(arrow).not.toBeNull();
        expect(arrow!.shaftLine).toBeDefined();
        expect(arrow!.shaftLine.x1).toBe(100);
        expect(arrow!.shaftLine.y1).toBe(100);
        expect(arrow!.shaftLine.x2).toBe(300);
        expect(arrow!.shaftLine.y2).toBe(100);
      });

      it('矢印は終点に矢じり（三角形）を含む', () => {
        const startPoint = { x: 100, y: 100 };
        const endPoint = { x: 300, y: 100 };

        const arrow = createArrow(startPoint, endPoint);

        expect(arrow).not.toBeNull();
        expect(arrow!.hasArrowhead).toBe(true);
      });

      it('矢じりは終点の位置に配置される', () => {
        const startPoint = { x: 100, y: 100 };
        const endPoint = { x: 300, y: 100 };

        const arrow = createArrow(startPoint, endPoint);

        expect(arrow).not.toBeNull();
        const arrowheadPosition = arrow!.getArrowheadPosition();
        expect(arrowheadPosition.x).toBe(300);
        expect(arrowheadPosition.y).toBe(100);
      });

      it('矢じりは開始点から終了点への方向を向く', () => {
        const startPoint = { x: 100, y: 100 };
        const endPoint = { x: 300, y: 100 };

        const arrow = createArrow(startPoint, endPoint);

        expect(arrow).not.toBeNull();
        // 水平線（左から右）の場合、矢じりの角度は0度（または360度）
        const arrowheadAngle = arrow!.getArrowheadAngle();
        expect(arrowheadAngle).toBeCloseTo(0, 1);
      });

      it('下向きの矢印の矢じりは下を向く', () => {
        const startPoint = { x: 200, y: 100 };
        const endPoint = { x: 200, y: 300 };

        const arrow = createArrow(startPoint, endPoint);

        expect(arrow).not.toBeNull();
        // 垂直線（上から下）の場合、矢じりの角度は90度
        const arrowheadAngle = arrow!.getArrowheadAngle();
        expect(arrowheadAngle).toBeCloseTo(90, 1);
      });

      it('斜めの矢印の矢じりは適切な方向を向く', () => {
        const startPoint = { x: 100, y: 100 };
        const endPoint = { x: 200, y: 200 };

        const arrow = createArrow(startPoint, endPoint);

        expect(arrow).not.toBeNull();
        // 45度の斜め線の場合、矢じりの角度は45度
        const arrowheadAngle = arrow!.getArrowheadAngle();
        expect(arrowheadAngle).toBeCloseTo(45, 1);
      });

      it('逆方向の矢印の矢じりは逆を向く', () => {
        const startPoint = { x: 300, y: 100 };
        const endPoint = { x: 100, y: 100 };

        const arrow = createArrow(startPoint, endPoint);

        expect(arrow).not.toBeNull();
        // 水平線（右から左）の場合、矢じりの角度は180度
        const arrowheadAngle = arrow!.getArrowheadAngle();
        expect(arrowheadAngle).toBeCloseTo(180, 1);
      });
    });

    describe('カスタムFabric.jsオブジェクト実装', () => {
      it('ArrowクラスはFabric.js Groupを拡張している', () => {
        const startPoint = { x: 100, y: 100 };
        const endPoint = { x: 300, y: 100 };

        const arrow = createArrow(startPoint, endPoint);

        expect(arrow).not.toBeNull();
        expect(arrow!.type).toBe('arrow');
      });

      it('矢印オブジェクトはtypeプロパティを持つ', () => {
        const startPoint = { x: 100, y: 100 };
        const endPoint = { x: 300, y: 100 };

        const arrow = createArrow(startPoint, endPoint);

        expect(arrow).not.toBeNull();
        expect(arrow!.type).toBe('arrow');
      });

      it('toObject()は矢印の情報を含むJSONを返す', () => {
        const startPoint = { x: 100, y: 100 };
        const endPoint = { x: 300, y: 100 };

        const arrow = createArrow(startPoint, endPoint);

        expect(arrow).not.toBeNull();
        const jsonObject = arrow!.toObject();

        expect(jsonObject.type).toBe('arrow');
        expect(jsonObject.startPoint).toEqual(startPoint);
        expect(jsonObject.endPoint).toEqual(endPoint);
      });

      it('矢印はFabric.js標準のコントロールを持つ', () => {
        const startPoint = { x: 100, y: 100 };
        const endPoint = { x: 300, y: 100 };

        const arrow = createArrow(startPoint, endPoint);

        expect(arrow).not.toBeNull();
        expect(arrow!.hasControls).toBe(true);
        expect(arrow!.hasBorders).toBe(true);
      });

      it('矢印はドラッグで移動可能', () => {
        const startPoint = { x: 100, y: 100 };
        const endPoint = { x: 300, y: 100 };

        const arrow = createArrow(startPoint, endPoint);

        expect(arrow).not.toBeNull();
        expect(arrow!.lockMovementX).toBe(false);
        expect(arrow!.lockMovementY).toBe(false);
      });
    });

    describe('スタイルオプション', () => {
      it('デフォルトの線色は黒（#000000）である', () => {
        const startPoint = { x: 100, y: 100 };
        const endPoint = { x: 300, y: 100 };

        const arrow = createArrow(startPoint, endPoint);

        expect(arrow).not.toBeNull();
        expect(arrow!.stroke).toBe(DEFAULT_ARROW_OPTIONS.stroke);
      });

      it('デフォルトの線の太さは2pxである', () => {
        const startPoint = { x: 100, y: 100 };
        const endPoint = { x: 300, y: 100 };

        const arrow = createArrow(startPoint, endPoint);

        expect(arrow).not.toBeNull();
        expect(arrow!.strokeWidth).toBe(DEFAULT_ARROW_OPTIONS.strokeWidth);
      });

      it('線色をカスタマイズできる', () => {
        const startPoint = { x: 100, y: 100 };
        const endPoint = { x: 300, y: 100 };
        const options: Partial<ArrowOptions> = { stroke: '#ff0000' };

        const arrow = createArrow(startPoint, endPoint, options);

        expect(arrow).not.toBeNull();
        expect(arrow!.stroke).toBe('#ff0000');
      });

      it('線の太さをカスタマイズできる', () => {
        const startPoint = { x: 100, y: 100 };
        const endPoint = { x: 300, y: 100 };
        const options: Partial<ArrowOptions> = { strokeWidth: 4 };

        const arrow = createArrow(startPoint, endPoint, options);

        expect(arrow).not.toBeNull();
        expect(arrow!.strokeWidth).toBe(4);
      });

      it('矢じりのサイズをカスタマイズできる', () => {
        const startPoint = { x: 100, y: 100 };
        const endPoint = { x: 300, y: 100 };
        const options: Partial<ArrowOptions> = { arrowheadSize: 20 };

        const arrow = createArrow(startPoint, endPoint, options);

        expect(arrow).not.toBeNull();
        expect(arrow!.arrowheadSize).toBe(20);
      });

      it('デフォルトの矢じりサイズは10pxである', () => {
        const startPoint = { x: 100, y: 100 };
        const endPoint = { x: 300, y: 100 };

        const arrow = createArrow(startPoint, endPoint);

        expect(arrow).not.toBeNull();
        expect(arrow!.arrowheadSize).toBe(DEFAULT_ARROW_OPTIONS.arrowheadSize);
      });
    });

    describe('矢印の計算', () => {
      it('2点間の距離（ピクセル）が計算される', () => {
        const startPoint = { x: 0, y: 0 };
        const endPoint = { x: 300, y: 400 }; // 3-4-5の直角三角形 -> 距離500

        const arrow = createArrow(startPoint, endPoint);

        expect(arrow).not.toBeNull();
        expect(arrow!.length).toBe(500);
      });

      it('水平線の距離が正しく計算される', () => {
        const startPoint = { x: 100, y: 200 };
        const endPoint = { x: 400, y: 200 };

        const arrow = createArrow(startPoint, endPoint);

        expect(arrow).not.toBeNull();
        expect(arrow!.length).toBe(300);
      });

      it('垂直線の距離が正しく計算される', () => {
        const startPoint = { x: 150, y: 100 };
        const endPoint = { x: 150, y: 350 };

        const arrow = createArrow(startPoint, endPoint);

        expect(arrow).not.toBeNull();
        expect(arrow!.length).toBe(250);
      });

      it('矢印の角度（度）が計算される', () => {
        const startPoint = { x: 0, y: 0 };
        const endPoint = { x: 100, y: 100 }; // 45度

        const arrow = createArrow(startPoint, endPoint);

        expect(arrow).not.toBeNull();
        expect(arrow!.arrowAngle).toBeCloseTo(45);
      });

      it('水平線の角度は0度', () => {
        const startPoint = { x: 100, y: 200 };
        const endPoint = { x: 400, y: 200 };

        const arrow = createArrow(startPoint, endPoint);

        expect(arrow).not.toBeNull();
        expect(arrow!.arrowAngle).toBe(0);
      });

      it('垂直線の角度は90度', () => {
        const startPoint = { x: 150, y: 100 };
        const endPoint = { x: 150, y: 350 };

        const arrow = createArrow(startPoint, endPoint);

        expect(arrow).not.toBeNull();
        expect(arrow!.arrowAngle).toBe(90);
      });
    });
  });

  // ==========================================================================
  // Arrowクラスの詳細テスト
  // ==========================================================================
  describe('Arrowクラス', () => {
    describe('インスタンス作成', () => {
      it('Arrowクラスのインスタンスが作成できる', () => {
        const arrow = new Arrow({ x: 100, y: 100 }, { x: 300, y: 100 });

        expect(arrow).toBeInstanceOf(Arrow);
      });

      it('始点と終点のプロパティが設定される', () => {
        const startPoint = { x: 100, y: 100 };
        const endPoint = { x: 300, y: 100 };
        const arrow = new Arrow(startPoint, endPoint);

        expect(arrow.startPoint).toEqual(startPoint);
        expect(arrow.endPoint).toEqual(endPoint);
      });

      it('オプションを指定してインスタンスが作成できる', () => {
        const options: Partial<ArrowOptions> = {
          stroke: '#ff0000',
          strokeWidth: 4,
          arrowheadSize: 15,
        };
        const arrow = new Arrow({ x: 100, y: 100 }, { x: 300, y: 100 }, options);

        expect(arrow.stroke).toBe('#ff0000');
        expect(arrow.strokeWidth).toBe(4);
        expect(arrow.arrowheadSize).toBe(15);
      });
    });

    describe('端点の更新', () => {
      it('始点を更新できる', () => {
        const arrow = new Arrow({ x: 100, y: 100 }, { x: 300, y: 100 });

        arrow.setStartPoint({ x: 50, y: 50 });

        expect(arrow.startPoint).toEqual({ x: 50, y: 50 });
      });

      it('終点を更新できる', () => {
        const arrow = new Arrow({ x: 100, y: 100 }, { x: 300, y: 100 });

        arrow.setEndPoint({ x: 400, y: 200 });

        expect(arrow.endPoint).toEqual({ x: 400, y: 200 });
      });

      it('端点の更新後、シャフトラインが再計算される', () => {
        const arrow = new Arrow({ x: 100, y: 100 }, { x: 300, y: 100 });

        arrow.setEndPoint({ x: 500, y: 100 });

        expect(arrow.shaftLine.x2).toBe(500);
      });

      it('端点の更新後、矢じりの位置が更新される', () => {
        const arrow = new Arrow({ x: 100, y: 100 }, { x: 300, y: 100 });

        arrow.setEndPoint({ x: 500, y: 200 });

        const arrowheadPosition = arrow.getArrowheadPosition();
        expect(arrowheadPosition.x).toBe(500);
        expect(arrowheadPosition.y).toBe(200);
      });

      it('端点の更新後、矢じりの向きが更新される', () => {
        const arrow = new Arrow({ x: 100, y: 100 }, { x: 300, y: 100 });
        expect(arrow.getArrowheadAngle()).toBeCloseTo(0, 1);

        arrow.setEndPoint({ x: 100, y: 300 });

        // 下向きになるので角度は90度
        expect(arrow.getArrowheadAngle()).toBeCloseTo(90, 1);
      });

      it('端点の更新後、距離が再計算される', () => {
        const arrow = new Arrow({ x: 100, y: 100 }, { x: 300, y: 100 });

        expect(arrow.length).toBe(200);

        arrow.setEndPoint({ x: 500, y: 100 });

        expect(arrow.length).toBe(400);
      });

      it('setCoords()が呼ばれて座標が更新される', () => {
        const arrow = new Arrow({ x: 100, y: 100 }, { x: 300, y: 100 });

        arrow.setStartPoint({ x: 50, y: 50 });

        expect(mockSetCoords).toHaveBeenCalled();
      });

      it('端点情報を取得するgetEndpoints()メソッドがある', () => {
        const arrow = new Arrow({ x: 100, y: 100 }, { x: 300, y: 200 });

        const endpoints = arrow.getEndpoints();

        expect(endpoints).toEqual({
          start: { x: 100, y: 100 },
          end: { x: 300, y: 200 },
        });
      });

      it('両端点を同時に更新できるsetEndpoints()メソッドがある', () => {
        const arrow = new Arrow({ x: 100, y: 100 }, { x: 300, y: 100 });

        arrow.setEndpoints({ x: 50, y: 50 }, { x: 400, y: 200 });

        expect(arrow.startPoint).toEqual({ x: 50, y: 50 });
        expect(arrow.endPoint).toEqual({ x: 400, y: 200 });
      });
    });

    describe('スタイルの更新', () => {
      it('線色を更新できる', () => {
        const arrow = new Arrow({ x: 100, y: 100 }, { x: 300, y: 100 });

        arrow.setStroke('#00ff00');

        expect(arrow.stroke).toBe('#00ff00');
      });

      it('線の太さを更新できる', () => {
        const arrow = new Arrow({ x: 100, y: 100 }, { x: 300, y: 100 });

        arrow.setStrokeWidth(6);

        expect(arrow.strokeWidth).toBe(6);
      });

      it('矢じりのサイズを更新できる', () => {
        const arrow = new Arrow({ x: 100, y: 100 }, { x: 300, y: 100 });

        arrow.setArrowheadSize(20);

        expect(arrow.arrowheadSize).toBe(20);
      });

      it('スタイルを一括で変更できる', () => {
        const arrow = new Arrow({ x: 100, y: 100 }, { x: 300, y: 100 });

        arrow.setStyle({
          stroke: '#ff00ff',
          strokeWidth: 5,
          arrowheadSize: 25,
        });

        expect(arrow.stroke).toBe('#ff00ff');
        expect(arrow.strokeWidth).toBe(5);
        expect(arrow.arrowheadSize).toBe(25);
      });

      it('現在のスタイルを取得できる', () => {
        const arrow = new Arrow(
          { x: 100, y: 100 },
          { x: 300, y: 100 },
          { stroke: '#123456', strokeWidth: 3, arrowheadSize: 18 }
        );

        const style = arrow.getStyle();

        expect(style.stroke).toBe('#123456');
        expect(style.strokeWidth).toBe(3);
        expect(style.arrowheadSize).toBe(18);
      });
    });

    describe('toObject()のシリアライズ', () => {
      it('スタイル情報がシリアライズに含まれる', () => {
        const arrow = new Arrow(
          { x: 100, y: 100 },
          { x: 300, y: 100 },
          { stroke: '#ff0000', strokeWidth: 4, arrowheadSize: 15 }
        );

        const json = arrow.toObject();

        expect(json.stroke).toBe('#ff0000');
        expect(json.strokeWidth).toBe(4);
        expect(json.arrowheadSize).toBe(15);
      });

      it('端点情報がシリアライズに含まれる', () => {
        const arrow = new Arrow({ x: 50, y: 75 }, { x: 350, y: 125 });

        const json = arrow.toObject();

        expect(json.startPoint).toEqual({ x: 50, y: 75 });
        expect(json.endPoint).toEqual({ x: 350, y: 125 });
      });
    });

    describe('fromObject() デシリアライズ', () => {
      it('JSONオブジェクトからArrowを復元できる', async () => {
        const json = {
          type: 'arrow' as const,
          startPoint: { x: 100, y: 100 },
          endPoint: { x: 300, y: 200 },
          stroke: '#ff0000',
          strokeWidth: 4,
          arrowheadSize: 15,
        };

        const arrow = await Arrow.fromObject(json);

        expect(arrow).toBeInstanceOf(Arrow);
        expect(arrow.startPoint).toEqual({ x: 100, y: 100 });
        expect(arrow.endPoint).toEqual({ x: 300, y: 200 });
        expect(arrow.stroke).toBe('#ff0000');
        expect(arrow.strokeWidth).toBe(4);
        expect(arrow.arrowheadSize).toBe(15);
      });

      it('デフォルトオプションで復元できる', async () => {
        const json = {
          type: 'arrow' as const,
          startPoint: { x: 50, y: 50 },
          endPoint: { x: 250, y: 150 },
          stroke: '#000000',
          strokeWidth: 2,
          arrowheadSize: 10,
        };

        const arrow = await Arrow.fromObject(json);

        expect(arrow.type).toBe('arrow');
        expect(arrow.startPoint).toEqual({ x: 50, y: 50 });
        expect(arrow.endPoint).toEqual({ x: 250, y: 150 });
      });

      it('toObject()で出力したJSONをfromObject()で復元できる', async () => {
        const originalArrow = new Arrow(
          { x: 120, y: 80 },
          { x: 400, y: 300 },
          { stroke: '#00ff00', strokeWidth: 3, arrowheadSize: 12 }
        );

        const json = originalArrow.toObject();
        const restoredArrow = await Arrow.fromObject(json);

        expect(restoredArrow.startPoint).toEqual(originalArrow.startPoint);
        expect(restoredArrow.endPoint).toEqual(originalArrow.endPoint);
        expect(restoredArrow.stroke).toBe(originalArrow.stroke);
        expect(restoredArrow.strokeWidth).toBe(originalArrow.strokeWidth);
        expect(restoredArrow.arrowheadSize).toBe(originalArrow.arrowheadSize);
      });
    });

    describe('角度の正規化（負の角度）', () => {
      it('左向きの矢印の角度は180度', () => {
        const arrow = new Arrow({ x: 300, y: 100 }, { x: 100, y: 100 });

        expect(arrow.arrowAngle).toBeCloseTo(180, 1);
      });

      it('上向きの矢印の角度は270度', () => {
        const arrow = new Arrow({ x: 100, y: 300 }, { x: 100, y: 100 });

        expect(arrow.arrowAngle).toBeCloseTo(270, 1);
      });

      it('左上向きの矢印の角度は正規化される', () => {
        const arrow = new Arrow({ x: 200, y: 200 }, { x: 100, y: 100 });

        // 左上は-135度 → 正規化されて225度
        expect(arrow.arrowAngle).toBeCloseTo(225, 1);
      });

      it('左下向きの矢印の角度は正規化される', () => {
        const arrow = new Arrow({ x: 200, y: 100 }, { x: 100, y: 200 });

        // 左下は135度
        expect(arrow.arrowAngle).toBeCloseTo(135, 1);
      });
    });

    describe('setStyle() 部分更新', () => {
      it('strokeのみ更新できる', () => {
        const arrow = new Arrow({ x: 100, y: 100 }, { x: 300, y: 100 });
        const originalStrokeWidth = arrow.strokeWidth;
        const originalArrowheadSize = arrow.arrowheadSize;

        arrow.setStyle({ stroke: '#0000ff' });

        expect(arrow.stroke).toBe('#0000ff');
        expect(arrow.strokeWidth).toBe(originalStrokeWidth);
        expect(arrow.arrowheadSize).toBe(originalArrowheadSize);
      });

      it('strokeWidthのみ更新できる', () => {
        const arrow = new Arrow({ x: 100, y: 100 }, { x: 300, y: 100 });
        const originalStroke = arrow.stroke;
        const originalArrowheadSize = arrow.arrowheadSize;

        arrow.setStyle({ strokeWidth: 8 });

        expect(arrow.stroke).toBe(originalStroke);
        expect(arrow.strokeWidth).toBe(8);
        expect(arrow.arrowheadSize).toBe(originalArrowheadSize);
      });

      it('arrowheadSizeのみ更新できる', () => {
        const arrow = new Arrow({ x: 100, y: 100 }, { x: 300, y: 100 });
        const originalStroke = arrow.stroke;
        const originalStrokeWidth = arrow.strokeWidth;

        arrow.setStyle({ arrowheadSize: 30 });

        expect(arrow.stroke).toBe(originalStroke);
        expect(arrow.strokeWidth).toBe(originalStrokeWidth);
        expect(arrow.arrowheadSize).toBe(30);
      });

      it('空のオプションでも安全に処理される', () => {
        const arrow = new Arrow({ x: 100, y: 100 }, { x: 300, y: 100 });
        const originalStyle = arrow.getStyle();

        arrow.setStyle({});

        expect(arrow.getStyle()).toEqual(originalStyle);
      });
    });
  });
});
