/**
 * @fileoverview 多角形ツールのテスト
 *
 * Task 15.4: 多角形ツールを実装する（TDD）
 *
 * Requirements:
 * - 7.4: 多角形ツールを選択して頂点をクリックすると多角形を描画する
 *
 * テスト対象:
 * - クリックによる頂点追加
 * - ダブルクリックで多角形を閉じる
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

// Fabric.jsのモック - Polygonクラスを継承可能にする
vi.mock('fabric', () => {
  // 多角形モック
  class MockPolygon {
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
    Polygon: MockPolygon,
  };
});

import {
  PolygonShape,
  PolygonBuilder,
  createPolygon,
  type PolygonOptions,
  DEFAULT_POLYGON_OPTIONS,
} from '../../../components/site-surveys/tools/PolygonTool';

// ============================================================================
// テストスイート
// ============================================================================

describe('PolygonTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ==========================================================================
  // Task 15.4: 多角形ツール実装テスト
  // ==========================================================================
  describe('多角形描画機能', () => {
    describe('クリックによる頂点追加', () => {
      it('頂点配列から多角形オブジェクトが作成される', () => {
        const points = [
          { x: 100, y: 100 },
          { x: 200, y: 100 },
          { x: 150, y: 200 },
        ];

        const polygon = createPolygon(points);

        expect(polygon).toBeDefined();
        expect(polygon).not.toBeNull();
        expect(polygon!.vertexCount).toBe(3);
      });

      it('三角形（3頂点）の多角形が作成される', () => {
        const points = [
          { x: 100, y: 100 },
          { x: 200, y: 100 },
          { x: 150, y: 200 },
        ];

        const polygon = createPolygon(points);

        expect(polygon).not.toBeNull();
        expect(polygon!.vertexCount).toBe(3);
        expect(polygon!.isTriangle).toBe(true);
      });

      it('四角形（4頂点）の多角形が作成される', () => {
        const points = [
          { x: 100, y: 100 },
          { x: 200, y: 100 },
          { x: 200, y: 200 },
          { x: 100, y: 200 },
        ];

        const polygon = createPolygon(points);

        expect(polygon).not.toBeNull();
        expect(polygon!.vertexCount).toBe(4);
        expect(polygon!.isTriangle).toBe(false);
      });

      it('五角形（5頂点）の多角形が作成される', () => {
        const points = [
          { x: 150, y: 100 },
          { x: 200, y: 150 },
          { x: 175, y: 225 },
          { x: 125, y: 225 },
          { x: 100, y: 150 },
        ];

        const polygon = createPolygon(points);

        expect(polygon).not.toBeNull();
        expect(polygon!.vertexCount).toBe(5);
      });

      it('頂点が2つ以下の場合は多角形が作成されない', () => {
        const points = [
          { x: 100, y: 100 },
          { x: 200, y: 100 },
        ];

        const polygon = createPolygon(points);

        expect(polygon).toBeNull();
      });

      it('頂点が1つの場合は多角形が作成されない', () => {
        const points = [{ x: 100, y: 100 }];

        const polygon = createPolygon(points);

        expect(polygon).toBeNull();
      });

      it('空の頂点配列の場合は多角形が作成されない', () => {
        const points: Array<{ x: number; y: number }> = [];

        const polygon = createPolygon(points);

        expect(polygon).toBeNull();
      });

      it('全ての頂点を取得できる', () => {
        const points = [
          { x: 100, y: 100 },
          { x: 200, y: 100 },
          { x: 150, y: 200 },
        ];

        const polygon = createPolygon(points);

        expect(polygon).not.toBeNull();
        const vertices = polygon!.getVertices();
        expect(vertices).toHaveLength(3);
        expect(vertices[0]).toEqual({ x: 100, y: 100 });
        expect(vertices[1]).toEqual({ x: 200, y: 100 });
        expect(vertices[2]).toEqual({ x: 150, y: 200 });
      });

      it('指定されたインデックスの頂点を取得できる', () => {
        const points = [
          { x: 100, y: 100 },
          { x: 200, y: 100 },
          { x: 150, y: 200 },
        ];

        const polygon = createPolygon(points);

        expect(polygon).not.toBeNull();
        expect(polygon!.getVertex(0)).toEqual({ x: 100, y: 100 });
        expect(polygon!.getVertex(1)).toEqual({ x: 200, y: 100 });
        expect(polygon!.getVertex(2)).toEqual({ x: 150, y: 200 });
      });

      it('範囲外のインデックスの場合はnullを返す', () => {
        const points = [
          { x: 100, y: 100 },
          { x: 200, y: 100 },
          { x: 150, y: 200 },
        ];

        const polygon = createPolygon(points);

        expect(polygon).not.toBeNull();
        expect(polygon!.getVertex(5)).toBeNull();
        expect(polygon!.getVertex(-1)).toBeNull();
      });
    });

    describe('PolygonBuilder - 対話的な多角形構築', () => {
      it('PolygonBuilderのインスタンスが作成できる', () => {
        const builder = new PolygonBuilder();

        expect(builder).toBeDefined();
        expect(builder.vertexCount).toBe(0);
      });

      it('頂点を追加できる', () => {
        const builder = new PolygonBuilder();

        builder.addVertex({ x: 100, y: 100 });

        expect(builder.vertexCount).toBe(1);
      });

      it('複数の頂点を順次追加できる', () => {
        const builder = new PolygonBuilder();

        builder.addVertex({ x: 100, y: 100 });
        builder.addVertex({ x: 200, y: 100 });
        builder.addVertex({ x: 150, y: 200 });

        expect(builder.vertexCount).toBe(3);
      });

      it('多角形を閉じることができる（finish）', () => {
        const builder = new PolygonBuilder();
        builder.addVertex({ x: 100, y: 100 });
        builder.addVertex({ x: 200, y: 100 });
        builder.addVertex({ x: 150, y: 200 });

        const polygon = builder.finish();

        expect(polygon).not.toBeNull();
        expect(polygon!.vertexCount).toBe(3);
      });

      it('頂点が2つ以下の場合はfinishでnullが返る', () => {
        const builder = new PolygonBuilder();
        builder.addVertex({ x: 100, y: 100 });
        builder.addVertex({ x: 200, y: 100 });

        const polygon = builder.finish();

        expect(polygon).toBeNull();
      });

      it('構築中の頂点をクリアできる', () => {
        const builder = new PolygonBuilder();
        builder.addVertex({ x: 100, y: 100 });
        builder.addVertex({ x: 200, y: 100 });

        builder.clear();

        expect(builder.vertexCount).toBe(0);
      });

      it('構築中の頂点を取得できる', () => {
        const builder = new PolygonBuilder();
        builder.addVertex({ x: 100, y: 100 });
        builder.addVertex({ x: 200, y: 100 });

        const vertices = builder.getVertices();

        expect(vertices).toHaveLength(2);
        expect(vertices[0]).toEqual({ x: 100, y: 100 });
      });

      it('最後に追加した頂点を削除できる（undo）', () => {
        const builder = new PolygonBuilder();
        builder.addVertex({ x: 100, y: 100 });
        builder.addVertex({ x: 200, y: 100 });

        builder.removeLastVertex();

        expect(builder.vertexCount).toBe(1);
      });

      it('空の状態で削除しても問題ない', () => {
        const builder = new PolygonBuilder();

        expect(() => builder.removeLastVertex()).not.toThrow();
        expect(builder.vertexCount).toBe(0);
      });

      it('構築可能かどうかを判定できる', () => {
        const builder = new PolygonBuilder();

        expect(builder.canFinish).toBe(false);

        builder.addVertex({ x: 100, y: 100 });
        expect(builder.canFinish).toBe(false);

        builder.addVertex({ x: 200, y: 100 });
        expect(builder.canFinish).toBe(false);

        builder.addVertex({ x: 150, y: 200 });
        expect(builder.canFinish).toBe(true);
      });

      it('オプション付きで多角形を作成できる', () => {
        const builder = new PolygonBuilder({
          stroke: '#ff0000',
          strokeWidth: 4,
          fill: '#00ff00',
        });
        builder.addVertex({ x: 100, y: 100 });
        builder.addVertex({ x: 200, y: 100 });
        builder.addVertex({ x: 150, y: 200 });

        const polygon = builder.finish();

        expect(polygon).not.toBeNull();
        expect(polygon!.stroke).toBe('#ff0000');
        expect(polygon!.strokeWidth).toBe(4);
        expect(polygon!.fill).toBe('#00ff00');
      });
    });

    describe('ダブルクリックで閉じる機能', () => {
      it('多角形は閉じた図形として作成される（始点と終点が接続される）', () => {
        const points = [
          { x: 100, y: 100 },
          { x: 200, y: 100 },
          { x: 150, y: 200 },
        ];

        const polygon = createPolygon(points);

        expect(polygon).not.toBeNull();
        expect(polygon!.isClosed).toBe(true);
      });

      it('PolygonBuilderでfinishすると閉じた多角形が作成される', () => {
        const builder = new PolygonBuilder();
        builder.addVertex({ x: 100, y: 100 });
        builder.addVertex({ x: 200, y: 100 });
        builder.addVertex({ x: 150, y: 200 });

        const polygon = builder.finish();

        expect(polygon).not.toBeNull();
        expect(polygon!.isClosed).toBe(true);
      });
    });

    describe('カスタムFabric.jsオブジェクト実装', () => {
      it('PolygonShapeクラスはFabric.js Polygonを拡張している', () => {
        const points = [
          { x: 100, y: 100 },
          { x: 200, y: 100 },
          { x: 150, y: 200 },
        ];

        const polygon = createPolygon(points);

        expect(polygon).not.toBeNull();
        expect(polygon!.type).toBe('polygonShape');
      });

      it('多角形オブジェクトはtypeプロパティを持つ', () => {
        const points = [
          { x: 100, y: 100 },
          { x: 200, y: 100 },
          { x: 150, y: 200 },
        ];

        const polygon = createPolygon(points);

        expect(polygon).not.toBeNull();
        expect(polygon!.type).toBe('polygonShape');
      });

      it('toObject()は多角形の情報を含むJSONを返す', () => {
        const points = [
          { x: 100, y: 100 },
          { x: 200, y: 100 },
          { x: 150, y: 200 },
        ];

        const polygon = createPolygon(points);

        expect(polygon).not.toBeNull();
        const jsonObject = polygon!.toObject();

        expect(jsonObject.type).toBe('polygonShape');
        expect(jsonObject.points).toHaveLength(3);
      });

      it('多角形はFabric.js標準のコントロールを持つ', () => {
        const points = [
          { x: 100, y: 100 },
          { x: 200, y: 100 },
          { x: 150, y: 200 },
        ];

        const polygon = createPolygon(points);

        expect(polygon).not.toBeNull();
        expect(polygon!.hasControls).toBe(true);
        expect(polygon!.hasBorders).toBe(true);
      });

      it('多角形はドラッグで移動可能', () => {
        const points = [
          { x: 100, y: 100 },
          { x: 200, y: 100 },
          { x: 150, y: 200 },
        ];

        const polygon = createPolygon(points);

        expect(polygon).not.toBeNull();
        expect(polygon!.lockMovementX).toBe(false);
        expect(polygon!.lockMovementY).toBe(false);
      });
    });

    describe('スタイルオプション', () => {
      it('デフォルトの線色は黒（#000000）である', () => {
        const points = [
          { x: 100, y: 100 },
          { x: 200, y: 100 },
          { x: 150, y: 200 },
        ];

        const polygon = createPolygon(points);

        expect(polygon).not.toBeNull();
        expect(polygon!.stroke).toBe(DEFAULT_POLYGON_OPTIONS.stroke);
      });

      it('デフォルトの線の太さは2pxである', () => {
        const points = [
          { x: 100, y: 100 },
          { x: 200, y: 100 },
          { x: 150, y: 200 },
        ];

        const polygon = createPolygon(points);

        expect(polygon).not.toBeNull();
        expect(polygon!.strokeWidth).toBe(DEFAULT_POLYGON_OPTIONS.strokeWidth);
      });

      it('デフォルトの塗りつぶし色は透明である', () => {
        const points = [
          { x: 100, y: 100 },
          { x: 200, y: 100 },
          { x: 150, y: 200 },
        ];

        const polygon = createPolygon(points);

        expect(polygon).not.toBeNull();
        expect(polygon!.fill).toBe(DEFAULT_POLYGON_OPTIONS.fill);
      });

      it('線色をカスタマイズできる', () => {
        const points = [
          { x: 100, y: 100 },
          { x: 200, y: 100 },
          { x: 150, y: 200 },
        ];
        const options: Partial<PolygonOptions> = { stroke: '#ff0000' };

        const polygon = createPolygon(points, options);

        expect(polygon).not.toBeNull();
        expect(polygon!.stroke).toBe('#ff0000');
      });

      it('線の太さをカスタマイズできる', () => {
        const points = [
          { x: 100, y: 100 },
          { x: 200, y: 100 },
          { x: 150, y: 200 },
        ];
        const options: Partial<PolygonOptions> = { strokeWidth: 4 };

        const polygon = createPolygon(points, options);

        expect(polygon).not.toBeNull();
        expect(polygon!.strokeWidth).toBe(4);
      });

      it('塗りつぶし色をカスタマイズできる', () => {
        const points = [
          { x: 100, y: 100 },
          { x: 200, y: 100 },
          { x: 150, y: 200 },
        ];
        const options: Partial<PolygonOptions> = { fill: '#00ff00' };

        const polygon = createPolygon(points, options);

        expect(polygon).not.toBeNull();
        expect(polygon!.fill).toBe('#00ff00');
      });
    });

    describe('バウンディングボックス', () => {
      it('getBounds()でバウンディングボックスを取得できる', () => {
        const points = [
          { x: 100, y: 100 },
          { x: 200, y: 100 },
          { x: 150, y: 200 },
        ];

        const polygon = createPolygon(points);

        expect(polygon).not.toBeNull();
        const bounds = polygon!.getBounds();
        expect(bounds.left).toBe(100);
        expect(bounds.top).toBe(100);
        expect(bounds.right).toBe(200);
        expect(bounds.bottom).toBe(200);
      });

      it('複雑な多角形のバウンディングボックスが正しく計算される', () => {
        const points = [
          { x: 50, y: 75 },
          { x: 250, y: 50 },
          { x: 300, y: 200 },
          { x: 200, y: 250 },
          { x: 100, y: 225 },
        ];

        const polygon = createPolygon(points);

        expect(polygon).not.toBeNull();
        const bounds = polygon!.getBounds();
        expect(bounds.left).toBe(50);
        expect(bounds.top).toBe(50);
        expect(bounds.right).toBe(300);
        expect(bounds.bottom).toBe(250);
      });
    });
  });

  // ==========================================================================
  // PolygonShapeクラスの詳細テスト
  // ==========================================================================
  describe('PolygonShapeクラス', () => {
    describe('インスタンス作成', () => {
      it('PolygonShapeクラスのインスタンスが作成できる', () => {
        const points = [
          { x: 100, y: 100 },
          { x: 200, y: 100 },
          { x: 150, y: 200 },
        ];
        const polygon = new PolygonShape(points);

        expect(polygon).toBeInstanceOf(PolygonShape);
      });

      it('頂点のプロパティが設定される', () => {
        const points = [
          { x: 100, y: 100 },
          { x: 200, y: 100 },
          { x: 150, y: 200 },
        ];
        const polygon = new PolygonShape(points);

        expect(polygon.vertexCount).toBe(3);
      });

      it('オプションを指定してインスタンスが作成できる', () => {
        const points = [
          { x: 100, y: 100 },
          { x: 200, y: 100 },
          { x: 150, y: 200 },
        ];
        const options: Partial<PolygonOptions> = {
          stroke: '#ff0000',
          strokeWidth: 4,
          fill: '#00ff00',
        };
        const polygon = new PolygonShape(points, options);

        expect(polygon.stroke).toBe('#ff0000');
        expect(polygon.strokeWidth).toBe(4);
        expect(polygon.fill).toBe('#00ff00');
      });
    });

    describe('頂点の更新', () => {
      it('指定されたインデックスの頂点を更新できる', () => {
        const points = [
          { x: 100, y: 100 },
          { x: 200, y: 100 },
          { x: 150, y: 200 },
        ];
        const polygon = new PolygonShape(points);

        polygon.setVertex(1, { x: 250, y: 150 });

        expect(polygon.getVertex(1)).toEqual({ x: 250, y: 150 });
      });

      it('範囲外のインデックスに対する更新は無視される', () => {
        const points = [
          { x: 100, y: 100 },
          { x: 200, y: 100 },
          { x: 150, y: 200 },
        ];
        const polygon = new PolygonShape(points);

        polygon.setVertex(10, { x: 250, y: 150 });

        // 頂点数は変わらない
        expect(polygon.vertexCount).toBe(3);
      });

      it('頂点の更新後、setCoords()が呼ばれて座標が更新される', () => {
        const points = [
          { x: 100, y: 100 },
          { x: 200, y: 100 },
          { x: 150, y: 200 },
        ];
        const polygon = new PolygonShape(points);

        polygon.setVertex(1, { x: 250, y: 150 });

        expect(mockSetCoords).toHaveBeenCalled();
      });

      it('全頂点を一括で更新できる', () => {
        const initialPoints = [
          { x: 100, y: 100 },
          { x: 200, y: 100 },
          { x: 150, y: 200 },
        ];
        const polygon = new PolygonShape(initialPoints);

        const newPoints = [
          { x: 50, y: 50 },
          { x: 250, y: 50 },
          { x: 200, y: 250 },
          { x: 100, y: 250 },
        ];
        polygon.setVertices(newPoints);

        expect(polygon.vertexCount).toBe(4);
        expect(polygon.getVertex(0)).toEqual({ x: 50, y: 50 });
      });
    });

    describe('スタイルの更新', () => {
      it('線色を更新できる', () => {
        const points = [
          { x: 100, y: 100 },
          { x: 200, y: 100 },
          { x: 150, y: 200 },
        ];
        const polygon = new PolygonShape(points);

        polygon.setStroke('#00ff00');

        expect(polygon.stroke).toBe('#00ff00');
      });

      it('線の太さを更新できる', () => {
        const points = [
          { x: 100, y: 100 },
          { x: 200, y: 100 },
          { x: 150, y: 200 },
        ];
        const polygon = new PolygonShape(points);

        polygon.setStrokeWidth(6);

        expect(polygon.strokeWidth).toBe(6);
      });

      it('塗りつぶし色を更新できる', () => {
        const points = [
          { x: 100, y: 100 },
          { x: 200, y: 100 },
          { x: 150, y: 200 },
        ];
        const polygon = new PolygonShape(points);

        polygon.setFill('#0000ff');

        expect(polygon.fill).toBe('#0000ff');
      });

      it('スタイルを一括で変更できる', () => {
        const points = [
          { x: 100, y: 100 },
          { x: 200, y: 100 },
          { x: 150, y: 200 },
        ];
        const polygon = new PolygonShape(points);

        polygon.setStyle({
          stroke: '#ff00ff',
          strokeWidth: 5,
          fill: '#00ffff',
        });

        expect(polygon.stroke).toBe('#ff00ff');
        expect(polygon.strokeWidth).toBe(5);
        expect(polygon.fill).toBe('#00ffff');
      });

      it('現在のスタイルを取得できる', () => {
        const points = [
          { x: 100, y: 100 },
          { x: 200, y: 100 },
          { x: 150, y: 200 },
        ];
        const polygon = new PolygonShape(points, {
          stroke: '#123456',
          strokeWidth: 3,
          fill: '#654321',
        });

        const style = polygon.getStyle();

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
          { x: 150, y: 200 },
        ];
        const polygon = new PolygonShape(points, {
          stroke: '#ff0000',
          strokeWidth: 4,
          fill: '#00ff00',
        });

        const json = polygon.toObject();

        expect(json.stroke).toBe('#ff0000');
        expect(json.strokeWidth).toBe(4);
        expect(json.fill).toBe('#00ff00');
      });

      it('頂点情報がシリアライズに含まれる', () => {
        const points = [
          { x: 100, y: 100 },
          { x: 200, y: 100 },
          { x: 150, y: 200 },
        ];
        const polygon = new PolygonShape(points);

        const json = polygon.toObject();

        expect(json.points).toHaveLength(3);
        expect(json.points[0]).toEqual({ x: 100, y: 100 });
        expect(json.points[1]).toEqual({ x: 200, y: 100 });
        expect(json.points[2]).toEqual({ x: 150, y: 200 });
      });
    });
  });
});
