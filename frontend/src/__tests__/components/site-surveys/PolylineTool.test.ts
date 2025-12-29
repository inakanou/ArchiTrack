/**
 * @fileoverview 折れ線ツールのテスト
 *
 * Task 15.5: 折れ線ツールを実装する（TDD）
 *
 * Requirements:
 * - 7.5: 折れ線ツールを選択して点をクリックすると折れ線を描画する
 *
 * テスト対象:
 * - クリックによる点追加
 * - ダブルクリックで終了
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

// Fabric.jsのモック - Polylineクラスを継承可能にする
vi.mock('fabric', () => {
  // 折れ線モック
  class MockPolyline {
    points: Array<{ x: number; y: number }>;
    left?: number;
    top?: number;
    fill?: string;
    stroke?: string;
    strokeWidth?: number;
    originX?: string;
    originY?: string;
    selectable?: boolean;
    evented?: boolean;
    hasControls?: boolean;
    hasBorders?: boolean;
    lockMovementX?: boolean;
    lockMovementY?: boolean;

    constructor(points?: Array<{ x: number; y: number }>, options?: Record<string, unknown>) {
      this.points = points || [];
      this.fill = 'transparent';
      this.stroke = '#000000';
      this.strokeWidth = 2;
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
      return {
        points: this.points,
        fill: this.fill,
        stroke: this.stroke,
        strokeWidth: this.strokeWidth,
      };
    }
  }

  return {
    Polyline: MockPolyline,
  };
});

import {
  PolylineShape,
  PolylineBuilder,
  createPolyline,
  type PolylineOptions,
  DEFAULT_POLYLINE_OPTIONS,
} from '../../../components/site-surveys/tools/PolylineTool';

// ============================================================================
// テストスイート
// ============================================================================

describe('PolylineTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ==========================================================================
  // Task 15.5: 折れ線ツール実装テスト
  // ==========================================================================
  describe('折れ線描画機能', () => {
    describe('クリックによる点追加', () => {
      it('点配列から折れ線オブジェクトが作成される', () => {
        const points = [
          { x: 100, y: 100 },
          { x: 200, y: 100 },
        ];

        const polyline = createPolyline(points);

        expect(polyline).toBeDefined();
        expect(polyline).not.toBeNull();
        expect(polyline!.pointCount).toBe(2);
      });

      it('2点の折れ線（直線）が作成される', () => {
        const points = [
          { x: 100, y: 100 },
          { x: 200, y: 100 },
        ];

        const polyline = createPolyline(points);

        expect(polyline).not.toBeNull();
        expect(polyline!.pointCount).toBe(2);
      });

      it('3点の折れ線が作成される', () => {
        const points = [
          { x: 100, y: 100 },
          { x: 200, y: 100 },
          { x: 150, y: 200 },
        ];

        const polyline = createPolyline(points);

        expect(polyline).not.toBeNull();
        expect(polyline!.pointCount).toBe(3);
      });

      it('5点の折れ線が作成される', () => {
        const points = [
          { x: 150, y: 100 },
          { x: 200, y: 150 },
          { x: 175, y: 225 },
          { x: 125, y: 225 },
          { x: 100, y: 150 },
        ];

        const polyline = createPolyline(points);

        expect(polyline).not.toBeNull();
        expect(polyline!.pointCount).toBe(5);
      });

      it('点が1つの場合は折れ線が作成されない', () => {
        const points = [{ x: 100, y: 100 }];

        const polyline = createPolyline(points);

        expect(polyline).toBeNull();
      });

      it('空の点配列の場合は折れ線が作成されない', () => {
        const points: Array<{ x: number; y: number }> = [];

        const polyline = createPolyline(points);

        expect(polyline).toBeNull();
      });

      it('全ての点を取得できる', () => {
        const points = [
          { x: 100, y: 100 },
          { x: 200, y: 100 },
          { x: 150, y: 200 },
        ];

        const polyline = createPolyline(points);

        expect(polyline).not.toBeNull();
        const vertices = polyline!.getPoints();
        expect(vertices).toHaveLength(3);
        expect(vertices[0]).toEqual({ x: 100, y: 100 });
        expect(vertices[1]).toEqual({ x: 200, y: 100 });
        expect(vertices[2]).toEqual({ x: 150, y: 200 });
      });

      it('指定されたインデックスの点を取得できる', () => {
        const points = [
          { x: 100, y: 100 },
          { x: 200, y: 100 },
          { x: 150, y: 200 },
        ];

        const polyline = createPolyline(points);

        expect(polyline).not.toBeNull();
        expect(polyline!.getPoint(0)).toEqual({ x: 100, y: 100 });
        expect(polyline!.getPoint(1)).toEqual({ x: 200, y: 100 });
        expect(polyline!.getPoint(2)).toEqual({ x: 150, y: 200 });
      });

      it('範囲外のインデックスの場合はnullを返す', () => {
        const points = [
          { x: 100, y: 100 },
          { x: 200, y: 100 },
          { x: 150, y: 200 },
        ];

        const polyline = createPolyline(points);

        expect(polyline).not.toBeNull();
        expect(polyline!.getPoint(5)).toBeNull();
        expect(polyline!.getPoint(-1)).toBeNull();
      });
    });

    describe('PolylineBuilder - 対話的な折れ線構築', () => {
      it('PolylineBuilderのインスタンスが作成できる', () => {
        const builder = new PolylineBuilder();

        expect(builder).toBeDefined();
        expect(builder.pointCount).toBe(0);
      });

      it('点を追加できる', () => {
        const builder = new PolylineBuilder();

        builder.addPoint({ x: 100, y: 100 });

        expect(builder.pointCount).toBe(1);
      });

      it('複数の点を順次追加できる', () => {
        const builder = new PolylineBuilder();

        builder.addPoint({ x: 100, y: 100 });
        builder.addPoint({ x: 200, y: 100 });
        builder.addPoint({ x: 150, y: 200 });

        expect(builder.pointCount).toBe(3);
      });

      it('折れ線を完成できる（finish）', () => {
        const builder = new PolylineBuilder();
        builder.addPoint({ x: 100, y: 100 });
        builder.addPoint({ x: 200, y: 100 });

        const polyline = builder.finish();

        expect(polyline).not.toBeNull();
        expect(polyline!.pointCount).toBe(2);
      });

      it('点が1つの場合はfinishでnullが返る', () => {
        const builder = new PolylineBuilder();
        builder.addPoint({ x: 100, y: 100 });

        const polyline = builder.finish();

        expect(polyline).toBeNull();
      });

      it('構築中の点をクリアできる', () => {
        const builder = new PolylineBuilder();
        builder.addPoint({ x: 100, y: 100 });
        builder.addPoint({ x: 200, y: 100 });

        builder.clear();

        expect(builder.pointCount).toBe(0);
      });

      it('構築中の点を取得できる', () => {
        const builder = new PolylineBuilder();
        builder.addPoint({ x: 100, y: 100 });
        builder.addPoint({ x: 200, y: 100 });

        const points = builder.getPoints();

        expect(points).toHaveLength(2);
        expect(points[0]).toEqual({ x: 100, y: 100 });
      });

      it('最後に追加した点を削除できる（undo）', () => {
        const builder = new PolylineBuilder();
        builder.addPoint({ x: 100, y: 100 });
        builder.addPoint({ x: 200, y: 100 });

        builder.removeLastPoint();

        expect(builder.pointCount).toBe(1);
      });

      it('空の状態で削除しても問題ない', () => {
        const builder = new PolylineBuilder();

        expect(() => builder.removeLastPoint()).not.toThrow();
        expect(builder.pointCount).toBe(0);
      });

      it('構築可能かどうかを判定できる', () => {
        const builder = new PolylineBuilder();

        expect(builder.canFinish).toBe(false);

        builder.addPoint({ x: 100, y: 100 });
        expect(builder.canFinish).toBe(false);

        builder.addPoint({ x: 200, y: 100 });
        expect(builder.canFinish).toBe(true);
      });

      it('オプション付きで折れ線を作成できる', () => {
        const builder = new PolylineBuilder({
          stroke: '#ff0000',
          strokeWidth: 4,
        });
        builder.addPoint({ x: 100, y: 100 });
        builder.addPoint({ x: 200, y: 100 });

        const polyline = builder.finish();

        expect(polyline).not.toBeNull();
        expect(polyline!.stroke).toBe('#ff0000');
        expect(polyline!.strokeWidth).toBe(4);
      });
    });

    describe('ダブルクリックで終了', () => {
      it('折れ線は開いた図形として作成される（始点と終点が接続されない）', () => {
        const points = [
          { x: 100, y: 100 },
          { x: 200, y: 100 },
          { x: 150, y: 200 },
        ];

        const polyline = createPolyline(points);

        expect(polyline).not.toBeNull();
        expect(polyline!.isClosed).toBe(false);
      });

      it('PolylineBuilderでfinishすると開いた折れ線が作成される', () => {
        const builder = new PolylineBuilder();
        builder.addPoint({ x: 100, y: 100 });
        builder.addPoint({ x: 200, y: 100 });
        builder.addPoint({ x: 150, y: 200 });

        const polyline = builder.finish();

        expect(polyline).not.toBeNull();
        expect(polyline!.isClosed).toBe(false);
      });
    });

    describe('カスタムFabric.jsオブジェクト実装', () => {
      it('PolylineShapeクラスはFabric.js Polylineを拡張している', () => {
        const points = [
          { x: 100, y: 100 },
          { x: 200, y: 100 },
        ];

        const polyline = createPolyline(points);

        expect(polyline).not.toBeNull();
        expect(polyline!.type).toBe('polylineShape');
      });

      it('折れ線オブジェクトはtypeプロパティを持つ', () => {
        const points = [
          { x: 100, y: 100 },
          { x: 200, y: 100 },
        ];

        const polyline = createPolyline(points);

        expect(polyline).not.toBeNull();
        expect(polyline!.type).toBe('polylineShape');
      });

      it('toObject()は折れ線の情報を含むJSONを返す', () => {
        const points = [
          { x: 100, y: 100 },
          { x: 200, y: 100 },
          { x: 150, y: 200 },
        ];

        const polyline = createPolyline(points);

        expect(polyline).not.toBeNull();
        const jsonObject = polyline!.toObject();

        expect(jsonObject.type).toBe('polylineShape');
        expect(jsonObject.points).toHaveLength(3);
      });

      it('折れ線はFabric.js標準のコントロールを持つ', () => {
        const points = [
          { x: 100, y: 100 },
          { x: 200, y: 100 },
        ];

        const polyline = createPolyline(points);

        expect(polyline).not.toBeNull();
        expect(polyline!.hasControls).toBe(true);
        expect(polyline!.hasBorders).toBe(true);
      });

      it('折れ線はドラッグで移動可能', () => {
        const points = [
          { x: 100, y: 100 },
          { x: 200, y: 100 },
        ];

        const polyline = createPolyline(points);

        expect(polyline).not.toBeNull();
        expect(polyline!.lockMovementX).toBe(false);
        expect(polyline!.lockMovementY).toBe(false);
      });
    });

    describe('スタイルオプション', () => {
      it('デフォルトの線色は黒（#000000）である', () => {
        const points = [
          { x: 100, y: 100 },
          { x: 200, y: 100 },
        ];

        const polyline = createPolyline(points);

        expect(polyline).not.toBeNull();
        expect(polyline!.stroke).toBe(DEFAULT_POLYLINE_OPTIONS.stroke);
      });

      it('デフォルトの線の太さは2pxである', () => {
        const points = [
          { x: 100, y: 100 },
          { x: 200, y: 100 },
        ];

        const polyline = createPolyline(points);

        expect(polyline).not.toBeNull();
        expect(polyline!.strokeWidth).toBe(DEFAULT_POLYLINE_OPTIONS.strokeWidth);
      });

      it('デフォルトの塗りつぶし色は透明である', () => {
        const points = [
          { x: 100, y: 100 },
          { x: 200, y: 100 },
        ];

        const polyline = createPolyline(points);

        expect(polyline).not.toBeNull();
        expect(polyline!.fill).toBe(DEFAULT_POLYLINE_OPTIONS.fill);
      });

      it('線色をカスタマイズできる', () => {
        const points = [
          { x: 100, y: 100 },
          { x: 200, y: 100 },
        ];
        const options: Partial<PolylineOptions> = { stroke: '#ff0000' };

        const polyline = createPolyline(points, options);

        expect(polyline).not.toBeNull();
        expect(polyline!.stroke).toBe('#ff0000');
      });

      it('線の太さをカスタマイズできる', () => {
        const points = [
          { x: 100, y: 100 },
          { x: 200, y: 100 },
        ];
        const options: Partial<PolylineOptions> = { strokeWidth: 4 };

        const polyline = createPolyline(points, options);

        expect(polyline).not.toBeNull();
        expect(polyline!.strokeWidth).toBe(4);
      });

      it('塗りつぶし色をカスタマイズできる', () => {
        const points = [
          { x: 100, y: 100 },
          { x: 200, y: 100 },
        ];
        const options: Partial<PolylineOptions> = { fill: '#00ff00' };

        const polyline = createPolyline(points, options);

        expect(polyline).not.toBeNull();
        expect(polyline!.fill).toBe('#00ff00');
      });
    });

    describe('バウンディングボックス', () => {
      it('getBounds()でバウンディングボックスを取得できる', () => {
        const points = [
          { x: 100, y: 100 },
          { x: 200, y: 100 },
          { x: 150, y: 200 },
        ];

        const polyline = createPolyline(points);

        expect(polyline).not.toBeNull();
        const bounds = polyline!.getBounds();
        expect(bounds.left).toBe(100);
        expect(bounds.top).toBe(100);
        expect(bounds.right).toBe(200);
        expect(bounds.bottom).toBe(200);
      });

      it('複雑な折れ線のバウンディングボックスが正しく計算される', () => {
        const points = [
          { x: 50, y: 75 },
          { x: 250, y: 50 },
          { x: 300, y: 200 },
          { x: 200, y: 250 },
          { x: 100, y: 225 },
        ];

        const polyline = createPolyline(points);

        expect(polyline).not.toBeNull();
        const bounds = polyline!.getBounds();
        expect(bounds.left).toBe(50);
        expect(bounds.top).toBe(50);
        expect(bounds.right).toBe(300);
        expect(bounds.bottom).toBe(250);
      });
    });
  });

  // ==========================================================================
  // PolylineShapeクラスの詳細テスト
  // ==========================================================================
  describe('PolylineShapeクラス', () => {
    describe('インスタンス作成', () => {
      it('PolylineShapeクラスのインスタンスが作成できる', () => {
        const points = [
          { x: 100, y: 100 },
          { x: 200, y: 100 },
        ];
        const polyline = new PolylineShape(points);

        expect(polyline).toBeInstanceOf(PolylineShape);
      });

      it('点のプロパティが設定される', () => {
        const points = [
          { x: 100, y: 100 },
          { x: 200, y: 100 },
          { x: 150, y: 200 },
        ];
        const polyline = new PolylineShape(points);

        expect(polyline.pointCount).toBe(3);
      });

      it('オプションを指定してインスタンスが作成できる', () => {
        const points = [
          { x: 100, y: 100 },
          { x: 200, y: 100 },
        ];
        const options: Partial<PolylineOptions> = {
          stroke: '#ff0000',
          strokeWidth: 4,
          fill: '#00ff00',
        };
        const polyline = new PolylineShape(points, options);

        expect(polyline.stroke).toBe('#ff0000');
        expect(polyline.strokeWidth).toBe(4);
        expect(polyline.fill).toBe('#00ff00');
      });
    });

    describe('点の更新', () => {
      it('指定されたインデックスの点を更新できる', () => {
        const points = [
          { x: 100, y: 100 },
          { x: 200, y: 100 },
          { x: 150, y: 200 },
        ];
        const polyline = new PolylineShape(points);

        polyline.setPoint(1, { x: 250, y: 150 });

        expect(polyline.getPoint(1)).toEqual({ x: 250, y: 150 });
      });

      it('範囲外のインデックスに対する更新は無視される', () => {
        const points = [
          { x: 100, y: 100 },
          { x: 200, y: 100 },
          { x: 150, y: 200 },
        ];
        const polyline = new PolylineShape(points);

        polyline.setPoint(10, { x: 250, y: 150 });

        // 点数は変わらない
        expect(polyline.pointCount).toBe(3);
      });

      it('点の更新後、setCoords()が呼ばれて座標が更新される', () => {
        const points = [
          { x: 100, y: 100 },
          { x: 200, y: 100 },
          { x: 150, y: 200 },
        ];
        const polyline = new PolylineShape(points);

        polyline.setPoint(1, { x: 250, y: 150 });

        expect(mockSetCoords).toHaveBeenCalled();
      });

      it('全点を一括で更新できる', () => {
        const initialPoints = [
          { x: 100, y: 100 },
          { x: 200, y: 100 },
        ];
        const polyline = new PolylineShape(initialPoints);

        const newPoints = [
          { x: 50, y: 50 },
          { x: 250, y: 50 },
          { x: 200, y: 250 },
          { x: 100, y: 250 },
        ];
        polyline.setPoints(newPoints);

        expect(polyline.pointCount).toBe(4);
        expect(polyline.getPoint(0)).toEqual({ x: 50, y: 50 });
      });
    });

    describe('スタイルの更新', () => {
      it('線色を更新できる', () => {
        const points = [
          { x: 100, y: 100 },
          { x: 200, y: 100 },
        ];
        const polyline = new PolylineShape(points);

        polyline.setStroke('#00ff00');

        expect(polyline.stroke).toBe('#00ff00');
      });

      it('線の太さを更新できる', () => {
        const points = [
          { x: 100, y: 100 },
          { x: 200, y: 100 },
        ];
        const polyline = new PolylineShape(points);

        polyline.setStrokeWidth(6);

        expect(polyline.strokeWidth).toBe(6);
      });

      it('塗りつぶし色を更新できる', () => {
        const points = [
          { x: 100, y: 100 },
          { x: 200, y: 100 },
        ];
        const polyline = new PolylineShape(points);

        polyline.setFill('#0000ff');

        expect(polyline.fill).toBe('#0000ff');
      });

      it('スタイルを一括で変更できる', () => {
        const points = [
          { x: 100, y: 100 },
          { x: 200, y: 100 },
        ];
        const polyline = new PolylineShape(points);

        polyline.setStyle({
          stroke: '#ff00ff',
          strokeWidth: 5,
          fill: '#00ffff',
        });

        expect(polyline.stroke).toBe('#ff00ff');
        expect(polyline.strokeWidth).toBe(5);
        expect(polyline.fill).toBe('#00ffff');
      });

      it('現在のスタイルを取得できる', () => {
        const points = [
          { x: 100, y: 100 },
          { x: 200, y: 100 },
        ];
        const polyline = new PolylineShape(points, {
          stroke: '#123456',
          strokeWidth: 3,
          fill: '#654321',
        });

        const style = polyline.getStyle();

        expect(style.stroke).toBe('#123456');
        expect(style.strokeWidth).toBe(3);
        expect(style.fill).toBe('#654321');
      });
    });

    describe('toObject()のシリアライズ', () => {
      it('スタイル情報がシリアライズに含まれる', () => {
        const points = [
          { x: 100, y: 100 },
          { x: 200, y: 100 },
        ];
        const polyline = new PolylineShape(points, {
          stroke: '#ff0000',
          strokeWidth: 4,
          fill: '#00ff00',
        });

        const json = polyline.toObject();

        expect(json.stroke).toBe('#ff0000');
        expect(json.strokeWidth).toBe(4);
        expect(json.fill).toBe('#00ff00');
      });

      it('点情報がシリアライズに含まれる', () => {
        const points = [
          { x: 100, y: 100 },
          { x: 200, y: 100 },
          { x: 150, y: 200 },
        ];
        const polyline = new PolylineShape(points);

        const json = polyline.toObject();

        expect(json.points).toHaveLength(3);
        expect(json.points[0]).toEqual({ x: 100, y: 100 });
        expect(json.points[1]).toEqual({ x: 200, y: 100 });
        expect(json.points[2]).toEqual({ x: 150, y: 200 });
      });
    });

    describe('fromObject() デシリアライズ', () => {
      it('JSONオブジェクトからPolylineShapeを復元できる', async () => {
        const json = {
          type: 'polylineShape' as const,
          points: [
            { x: 100, y: 100 },
            { x: 200, y: 100 },
            { x: 150, y: 200 },
          ],
          stroke: '#ff0000',
          strokeWidth: 4,
          fill: '#00ff00',
        };

        const polyline = await PolylineShape.fromObject(json);

        expect(polyline).toBeInstanceOf(PolylineShape);
        expect(polyline.pointCount).toBe(3);
        expect(polyline.stroke).toBe('#ff0000');
        expect(polyline.strokeWidth).toBe(4);
        expect(polyline.fill).toBe('#00ff00');
      });

      it('left/topを含むJSONを復元できる', async () => {
        const json = {
          type: 'polylineShape' as const,
          points: [
            { x: 100, y: 100 },
            { x: 200, y: 100 },
          ],
          stroke: '#000000',
          strokeWidth: 2,
          fill: 'transparent',
          left: 50,
          top: 75,
        };

        const polyline = await PolylineShape.fromObject(json);

        expect(polyline).toBeInstanceOf(PolylineShape);
        expect(polyline.left).toBe(50);
        expect(polyline.top).toBe(75);
        expect(mockSetCoords).toHaveBeenCalled();
      });

      it('left/topなしでも復元できる（後方互換性）', async () => {
        const json = {
          type: 'polylineShape' as const,
          points: [
            { x: 100, y: 100 },
            { x: 200, y: 100 },
          ],
          stroke: '#000000',
          strokeWidth: 2,
          fill: 'transparent',
        };

        const polyline = await PolylineShape.fromObject(json);

        expect(polyline).toBeInstanceOf(PolylineShape);
        expect(polyline.pointCount).toBe(2);
      });

      it('toObject()で出力したJSONをfromObject()で復元できる', async () => {
        const points = [
          { x: 100, y: 100 },
          { x: 200, y: 100 },
          { x: 150, y: 200 },
          { x: 50, y: 150 },
        ];
        const original = new PolylineShape(points, {
          stroke: '#123456',
          strokeWidth: 3,
          fill: '#654321',
        });

        const json = original.toObject();
        const restored = await PolylineShape.fromObject(json);

        expect(restored.pointCount).toBe(original.pointCount);
        expect(restored.stroke).toBe(original.stroke);
        expect(restored.strokeWidth).toBe(original.strokeWidth);
        expect(restored.fill).toBe(original.fill);
      });
    });

    describe('setStyle() 部分更新', () => {
      it('strokeのみ更新できる', () => {
        const points = [
          { x: 100, y: 100 },
          { x: 200, y: 100 },
        ];
        const polyline = new PolylineShape(points);

        polyline.setStyle({ stroke: '#0000ff' });

        expect(polyline.stroke).toBe('#0000ff');
        expect(polyline.strokeWidth).toBe(DEFAULT_POLYLINE_OPTIONS.strokeWidth);
        expect(polyline.fill).toBe(DEFAULT_POLYLINE_OPTIONS.fill);
      });

      it('strokeWidthのみ更新できる', () => {
        const points = [
          { x: 100, y: 100 },
          { x: 200, y: 100 },
        ];
        const polyline = new PolylineShape(points);

        polyline.setStyle({ strokeWidth: 8 });

        expect(polyline.stroke).toBe(DEFAULT_POLYLINE_OPTIONS.stroke);
        expect(polyline.strokeWidth).toBe(8);
        expect(polyline.fill).toBe(DEFAULT_POLYLINE_OPTIONS.fill);
      });

      it('fillのみ更新できる', () => {
        const points = [
          { x: 100, y: 100 },
          { x: 200, y: 100 },
        ];
        const polyline = new PolylineShape(points);

        polyline.setStyle({ fill: '#ff00ff' });

        expect(polyline.stroke).toBe(DEFAULT_POLYLINE_OPTIONS.stroke);
        expect(polyline.strokeWidth).toBe(DEFAULT_POLYLINE_OPTIONS.strokeWidth);
        expect(polyline.fill).toBe('#ff00ff');
      });

      it('空のオプションでも安全に処理される', () => {
        const points = [
          { x: 100, y: 100 },
          { x: 200, y: 100 },
        ];
        const polyline = new PolylineShape(points);

        polyline.setStyle({});

        expect(polyline.stroke).toBe(DEFAULT_POLYLINE_OPTIONS.stroke);
        expect(polyline.strokeWidth).toBe(DEFAULT_POLYLINE_OPTIONS.strokeWidth);
        expect(polyline.fill).toBe(DEFAULT_POLYLINE_OPTIONS.fill);
      });
    });

    describe('setPoint() 負のインデックス', () => {
      it('負のインデックスに対する更新は無視される', () => {
        const points = [
          { x: 100, y: 100 },
          { x: 200, y: 100 },
        ];
        const polyline = new PolylineShape(points);

        polyline.setPoint(-1, { x: 999, y: 999 });

        // 点は変更されていない
        expect(polyline.getPoint(0)).toEqual({ x: 100, y: 100 });
        expect(polyline.getPoint(1)).toEqual({ x: 200, y: 100 });
      });
    });
  });
});
