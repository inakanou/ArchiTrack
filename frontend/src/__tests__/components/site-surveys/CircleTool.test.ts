/**
 * @fileoverview 円・楕円ツールのテスト
 *
 * Task 15.2: 円・楕円ツールを実装する（TDD）
 *
 * Requirements:
 * - 7.2: 円ツールを選択してドラッグすると円または楕円を描画する
 *
 * テスト対象:
 * - ドラッグによる円/楕円描画
 * - 中心点と半径の計算
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

// Fabric.jsのモック - Ellipseクラスを継承可能にする
vi.mock('fabric', () => {
  // 楕円モック
  class MockEllipse {
    left?: number;
    top?: number;
    rx?: number;
    ry?: number;
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

    constructor(options?: Record<string, unknown>) {
      this.rx = 0;
      this.ry = 0;
      this.fill = 'transparent';
      this.stroke = '#000000';
      this.strokeWidth = 2;
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
      return {
        left: this.left,
        top: this.top,
        rx: this.rx,
        ry: this.ry,
        fill: this.fill,
        stroke: this.stroke,
        strokeWidth: this.strokeWidth,
      };
    }
  }

  return {
    Ellipse: MockEllipse,
  };
});

import {
  CircleShape,
  createCircle,
  type CircleOptions,
  DEFAULT_CIRCLE_OPTIONS,
} from '../../../components/site-surveys/tools/CircleTool';

// ============================================================================
// テストスイート
// ============================================================================

describe('CircleTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ==========================================================================
  // Task 15.2: 円・楕円ツール実装テスト
  // ==========================================================================
  describe('円・楕円描画機能', () => {
    describe('ドラッグによる円/楕円描画', () => {
      it('ドラッグの開始点と終了点から円/楕円オブジェクトが作成される', () => {
        const startPoint = { x: 100, y: 100 };
        const endPoint = { x: 200, y: 200 };

        const circle = createCircle(startPoint, endPoint);

        expect(circle).toBeDefined();
        expect(circle).not.toBeNull();
      });

      it('ドラッグで正方形の領域を指定すると正円が作成される', () => {
        const startPoint = { x: 100, y: 100 };
        const endPoint = { x: 200, y: 200 }; // 100x100の正方形領域

        const circle = createCircle(startPoint, endPoint);

        expect(circle).not.toBeNull();
        expect(circle!.rx).toBe(circle!.ry); // 正円は半径が等しい
        expect(circle!.isCircle).toBe(true);
      });

      it('ドラッグで長方形の領域を指定すると楕円が作成される', () => {
        const startPoint = { x: 100, y: 100 };
        const endPoint = { x: 300, y: 200 }; // 200x100の長方形領域

        const circle = createCircle(startPoint, endPoint);

        expect(circle).not.toBeNull();
        expect(circle!.rx).not.toBe(circle!.ry); // 楕円は半径が異なる
        expect(circle!.isCircle).toBe(false);
        expect(circle!.isEllipse).toBe(true);
      });

      it('水平方向に長い楕円が作成される', () => {
        const startPoint = { x: 100, y: 100 };
        const endPoint = { x: 400, y: 200 }; // 幅300x高さ100

        const circle = createCircle(startPoint, endPoint);

        expect(circle).not.toBeNull();
        expect(circle!.rx).toBeGreaterThan(circle!.ry);
      });

      it('垂直方向に長い楕円が作成される', () => {
        const startPoint = { x: 100, y: 100 };
        const endPoint = { x: 200, y: 400 }; // 幅100x高さ300

        const circle = createCircle(startPoint, endPoint);

        expect(circle).not.toBeNull();
        expect(circle!.ry).toBeGreaterThan(circle!.rx);
      });

      it('始点と終点が同じ場合は円/楕円が作成されない', () => {
        const startPoint = { x: 100, y: 100 };
        const endPoint = { x: 100, y: 100 };

        const circle = createCircle(startPoint, endPoint);

        expect(circle).toBeNull();
      });

      it('非常に小さい領域でも円/楕円が作成される（5px以上）', () => {
        const startPoint = { x: 100, y: 100 };
        const endPoint = { x: 106, y: 106 }; // 6x6の領域

        const circle = createCircle(startPoint, endPoint);

        expect(circle).not.toBeNull();
      });

      it('小さすぎる領域の場合は円/楕円が作成されない（5px未満）', () => {
        const startPoint = { x: 100, y: 100 };
        const endPoint = { x: 103, y: 103 }; // 3x3の領域

        const circle = createCircle(startPoint, endPoint);

        expect(circle).toBeNull();
      });

      it('左上から右下へドラッグしても円/楕円が正しく作成される', () => {
        const startPoint = { x: 100, y: 100 };
        const endPoint = { x: 200, y: 200 };

        const circle = createCircle(startPoint, endPoint);

        expect(circle).not.toBeNull();
        expect(circle!.centerX).toBe(150); // 中心X
        expect(circle!.centerY).toBe(150); // 中心Y
      });

      it('右下から左上へドラッグしても円/楕円が正しく作成される', () => {
        const startPoint = { x: 200, y: 200 };
        const endPoint = { x: 100, y: 100 };

        const circle = createCircle(startPoint, endPoint);

        expect(circle).not.toBeNull();
        expect(circle!.centerX).toBe(150);
        expect(circle!.centerY).toBe(150);
      });

      it('左下から右上へドラッグしても円/楕円が正しく作成される', () => {
        const startPoint = { x: 100, y: 200 };
        const endPoint = { x: 200, y: 100 };

        const circle = createCircle(startPoint, endPoint);

        expect(circle).not.toBeNull();
        expect(circle!.centerX).toBe(150);
        expect(circle!.centerY).toBe(150);
      });

      it('右上から左下へドラッグしても円/楕円が正しく作成される', () => {
        const startPoint = { x: 200, y: 100 };
        const endPoint = { x: 100, y: 200 };

        const circle = createCircle(startPoint, endPoint);

        expect(circle).not.toBeNull();
        expect(circle!.centerX).toBe(150);
        expect(circle!.centerY).toBe(150);
      });
    });

    describe('中心点と半径の計算', () => {
      it('中心点が正しく計算される', () => {
        const startPoint = { x: 100, y: 100 };
        const endPoint = { x: 300, y: 200 };

        const circle = createCircle(startPoint, endPoint);

        expect(circle).not.toBeNull();
        expect(circle!.centerX).toBe(200); // (100 + 300) / 2
        expect(circle!.centerY).toBe(150); // (100 + 200) / 2
      });

      it('X方向の半径（rx）が正しく計算される', () => {
        const startPoint = { x: 100, y: 100 };
        const endPoint = { x: 300, y: 200 };

        const circle = createCircle(startPoint, endPoint);

        expect(circle).not.toBeNull();
        expect(circle!.rx).toBe(100); // (300 - 100) / 2
      });

      it('Y方向の半径（ry）が正しく計算される', () => {
        const startPoint = { x: 100, y: 100 };
        const endPoint = { x: 300, y: 200 };

        const circle = createCircle(startPoint, endPoint);

        expect(circle).not.toBeNull();
        expect(circle!.ry).toBe(50); // (200 - 100) / 2
      });

      it('正円の場合、rxとryが等しい', () => {
        const startPoint = { x: 100, y: 100 };
        const endPoint = { x: 200, y: 200 };

        const circle = createCircle(startPoint, endPoint);

        expect(circle).not.toBeNull();
        expect(circle!.rx).toBe(50);
        expect(circle!.ry).toBe(50);
      });

      it('幅と高さが取得できる', () => {
        const startPoint = { x: 100, y: 100 };
        const endPoint = { x: 300, y: 200 };

        const circle = createCircle(startPoint, endPoint);

        expect(circle).not.toBeNull();
        expect(circle!.getWidth()).toBe(200); // rx * 2
        expect(circle!.getHeight()).toBe(100); // ry * 2
        expect(circle!.shapeWidth).toBe(200); // ゲッター版
        expect(circle!.shapeHeight).toBe(100); // ゲッター版
      });

      it('getBounds()でバウンディングボックスを取得できる', () => {
        const startPoint = { x: 100, y: 100 };
        const endPoint = { x: 300, y: 200 };

        const circle = createCircle(startPoint, endPoint);

        expect(circle).not.toBeNull();
        const bounds = circle!.getBounds();
        expect(bounds.left).toBe(100);
        expect(bounds.top).toBe(100);
        expect(bounds.right).toBe(300);
        expect(bounds.bottom).toBe(200);
      });
    });

    describe('カスタムFabric.jsオブジェクト実装', () => {
      it('CircleShapeクラスはFabric.js Ellipseを拡張している', () => {
        const startPoint = { x: 100, y: 100 };
        const endPoint = { x: 300, y: 200 };

        const circle = createCircle(startPoint, endPoint);

        expect(circle).not.toBeNull();
        expect(circle!.type).toBe('circleShape');
      });

      it('円/楕円オブジェクトはtypeプロパティを持つ', () => {
        const startPoint = { x: 100, y: 100 };
        const endPoint = { x: 200, y: 200 };

        const circle = createCircle(startPoint, endPoint);

        expect(circle).not.toBeNull();
        expect(circle!.type).toBe('circleShape');
      });

      it('toObject()は円/楕円の情報を含むJSONを返す', () => {
        const startPoint = { x: 100, y: 100 };
        const endPoint = { x: 300, y: 200 };

        const circle = createCircle(startPoint, endPoint);

        expect(circle).not.toBeNull();
        const jsonObject = circle!.toObject();

        expect(jsonObject.type).toBe('circleShape');
        expect(jsonObject.centerX).toBe(200);
        expect(jsonObject.centerY).toBe(150);
        expect(jsonObject.rx).toBe(100);
        expect(jsonObject.ry).toBe(50);
      });

      it('円/楕円はFabric.js標準のコントロールを持つ', () => {
        const startPoint = { x: 100, y: 100 };
        const endPoint = { x: 200, y: 200 };

        const circle = createCircle(startPoint, endPoint);

        expect(circle).not.toBeNull();
        expect(circle!.hasControls).toBe(true);
        expect(circle!.hasBorders).toBe(true);
      });

      it('円/楕円はドラッグで移動可能', () => {
        const startPoint = { x: 100, y: 100 };
        const endPoint = { x: 200, y: 200 };

        const circle = createCircle(startPoint, endPoint);

        expect(circle).not.toBeNull();
        expect(circle!.lockMovementX).toBe(false);
        expect(circle!.lockMovementY).toBe(false);
      });
    });

    describe('スタイルオプション', () => {
      it('デフォルトの線色は黒（#000000）である', () => {
        const startPoint = { x: 100, y: 100 };
        const endPoint = { x: 200, y: 200 };

        const circle = createCircle(startPoint, endPoint);

        expect(circle).not.toBeNull();
        expect(circle!.stroke).toBe(DEFAULT_CIRCLE_OPTIONS.stroke);
      });

      it('デフォルトの線の太さは2pxである', () => {
        const startPoint = { x: 100, y: 100 };
        const endPoint = { x: 200, y: 200 };

        const circle = createCircle(startPoint, endPoint);

        expect(circle).not.toBeNull();
        expect(circle!.strokeWidth).toBe(DEFAULT_CIRCLE_OPTIONS.strokeWidth);
      });

      it('デフォルトの塗りつぶし色は透明である', () => {
        const startPoint = { x: 100, y: 100 };
        const endPoint = { x: 200, y: 200 };

        const circle = createCircle(startPoint, endPoint);

        expect(circle).not.toBeNull();
        expect(circle!.fill).toBe(DEFAULT_CIRCLE_OPTIONS.fill);
      });

      it('線色をカスタマイズできる', () => {
        const startPoint = { x: 100, y: 100 };
        const endPoint = { x: 200, y: 200 };
        const options: Partial<CircleOptions> = { stroke: '#ff0000' };

        const circle = createCircle(startPoint, endPoint, options);

        expect(circle).not.toBeNull();
        expect(circle!.stroke).toBe('#ff0000');
      });

      it('線の太さをカスタマイズできる', () => {
        const startPoint = { x: 100, y: 100 };
        const endPoint = { x: 200, y: 200 };
        const options: Partial<CircleOptions> = { strokeWidth: 4 };

        const circle = createCircle(startPoint, endPoint, options);

        expect(circle).not.toBeNull();
        expect(circle!.strokeWidth).toBe(4);
      });

      it('塗りつぶし色をカスタマイズできる', () => {
        const startPoint = { x: 100, y: 100 };
        const endPoint = { x: 200, y: 200 };
        const options: Partial<CircleOptions> = { fill: '#00ff00' };

        const circle = createCircle(startPoint, endPoint, options);

        expect(circle).not.toBeNull();
        expect(circle!.fill).toBe('#00ff00');
      });
    });
  });

  // ==========================================================================
  // CircleShapeクラスの詳細テスト
  // ==========================================================================
  describe('CircleShapeクラス', () => {
    describe('インスタンス作成', () => {
      it('CircleShapeクラスのインスタンスが作成できる', () => {
        const circle = new CircleShape(150, 150, 50, 50);

        expect(circle).toBeInstanceOf(CircleShape);
      });

      it('中心点と半径のプロパティが設定される', () => {
        const circle = new CircleShape(150, 150, 50, 30);

        expect(circle.centerX).toBe(150);
        expect(circle.centerY).toBe(150);
        expect(circle.rx).toBe(50);
        expect(circle.ry).toBe(30);
      });

      it('オプションを指定してインスタンスが作成できる', () => {
        const options: Partial<CircleOptions> = {
          stroke: '#ff0000',
          strokeWidth: 4,
          fill: '#00ff00',
        };
        const circle = new CircleShape(150, 150, 50, 50, options);

        expect(circle.stroke).toBe('#ff0000');
        expect(circle.strokeWidth).toBe(4);
        expect(circle.fill).toBe('#00ff00');
      });
    });

    describe('ジオメトリの更新', () => {
      it('中心点を更新できる', () => {
        const circle = new CircleShape(150, 150, 50, 50);

        circle.setCenter(200, 200);

        expect(circle.centerX).toBe(200);
        expect(circle.centerY).toBe(200);
      });

      it('半径を更新できる', () => {
        const circle = new CircleShape(150, 150, 50, 50);

        circle.setRadii(100, 75);

        expect(circle.rx).toBe(100);
        expect(circle.ry).toBe(75);
      });

      it('半径の更新後、setCoords()が呼ばれて座標が更新される', () => {
        const circle = new CircleShape(150, 150, 50, 50);

        circle.setRadii(100, 75);

        expect(mockSetCoords).toHaveBeenCalled();
      });

      it('ドラッグ座標から円/楕円を更新できる（updateFromDrag）', () => {
        const circle = new CircleShape(150, 150, 50, 50);

        circle.updateFromDrag({ x: 100, y: 100 }, { x: 300, y: 200 });

        expect(circle.centerX).toBe(200);
        expect(circle.centerY).toBe(150);
        expect(circle.rx).toBe(100);
        expect(circle.ry).toBe(50);
      });
    });

    describe('スタイルの更新', () => {
      it('線色を更新できる', () => {
        const circle = new CircleShape(150, 150, 50, 50);

        circle.setStroke('#00ff00');

        expect(circle.stroke).toBe('#00ff00');
      });

      it('線の太さを更新できる', () => {
        const circle = new CircleShape(150, 150, 50, 50);

        circle.setStrokeWidth(6);

        expect(circle.strokeWidth).toBe(6);
      });

      it('塗りつぶし色を更新できる', () => {
        const circle = new CircleShape(150, 150, 50, 50);

        circle.setFill('#0000ff');

        expect(circle.fill).toBe('#0000ff');
      });

      it('スタイルを一括で変更できる', () => {
        const circle = new CircleShape(150, 150, 50, 50);

        circle.setStyle({
          stroke: '#ff00ff',
          strokeWidth: 5,
          fill: '#00ffff',
        });

        expect(circle.stroke).toBe('#ff00ff');
        expect(circle.strokeWidth).toBe(5);
        expect(circle.fill).toBe('#00ffff');
      });

      it('現在のスタイルを取得できる', () => {
        const circle = new CircleShape(150, 150, 50, 50, {
          stroke: '#123456',
          strokeWidth: 3,
          fill: '#654321',
        });

        const style = circle.getStyle();

        expect(style.stroke).toBe('#123456');
        expect(style.strokeWidth).toBe(3);
        expect(style.fill).toBe('#654321');
      });
    });

    describe('toObject()のシリアライズ', () => {
      it('スタイル情報がシリアライズに含まれる', () => {
        const circle = new CircleShape(150, 150, 50, 50, {
          stroke: '#ff0000',
          strokeWidth: 4,
          fill: '#00ff00',
        });

        const json = circle.toObject();

        expect(json.stroke).toBe('#ff0000');
        expect(json.strokeWidth).toBe(4);
        expect(json.fill).toBe('#00ff00');
      });

      it('ジオメトリ情報がシリアライズに含まれる', () => {
        const circle = new CircleShape(200, 150, 100, 75);

        const json = circle.toObject();

        expect(json.centerX).toBe(200);
        expect(json.centerY).toBe(150);
        expect(json.rx).toBe(100);
        expect(json.ry).toBe(75);
      });
    });

    describe('fromObject() デシリアライズ', () => {
      it('JSONオブジェクトからCircleShapeを復元できる', async () => {
        const json = {
          type: 'circleShape' as const,
          centerX: 200,
          centerY: 150,
          rx: 100,
          ry: 75,
          stroke: '#ff0000',
          strokeWidth: 4,
          fill: '#00ff00',
        };

        const circle = await CircleShape.fromObject(json);

        expect(circle).toBeInstanceOf(CircleShape);
        expect(circle.centerX).toBe(200);
        expect(circle.centerY).toBe(150);
        expect(circle.rx).toBe(100);
        expect(circle.ry).toBe(75);
        expect(circle.stroke).toBe('#ff0000');
        expect(circle.strokeWidth).toBe(4);
        expect(circle.fill).toBe('#00ff00');
      });

      it('デフォルトオプションで復元できる', async () => {
        const json = {
          type: 'circleShape' as const,
          centerX: 150,
          centerY: 150,
          rx: 50,
          ry: 50,
          stroke: '#000000',
          strokeWidth: 2,
          fill: 'transparent',
        };

        const circle = await CircleShape.fromObject(json);

        expect(circle.type).toBe('circleShape');
        expect(circle.isCircle).toBe(true);
      });

      it('toObject()で出力したJSONをfromObject()で復元できる', async () => {
        const originalCircle = new CircleShape(180, 120, 80, 60, {
          stroke: '#00ff00',
          strokeWidth: 3,
          fill: '#ff00ff',
        });

        const json = originalCircle.toObject();
        const restoredCircle = await CircleShape.fromObject(json);

        expect(restoredCircle.centerX).toBe(originalCircle.centerX);
        expect(restoredCircle.centerY).toBe(originalCircle.centerY);
        expect(restoredCircle.rx).toBe(originalCircle.rx);
        expect(restoredCircle.ry).toBe(originalCircle.ry);
        expect(restoredCircle.stroke).toBe(originalCircle.stroke);
        expect(restoredCircle.strokeWidth).toBe(originalCircle.strokeWidth);
        expect(restoredCircle.fill).toBe(originalCircle.fill);
      });
    });

    describe('setStyle() 部分更新', () => {
      it('strokeのみ更新できる', () => {
        const circle = new CircleShape(150, 150, 50, 50);
        const originalStrokeWidth = circle.strokeWidth;
        const originalFill = circle.fill;

        circle.setStyle({ stroke: '#0000ff' });

        expect(circle.stroke).toBe('#0000ff');
        expect(circle.strokeWidth).toBe(originalStrokeWidth);
        expect(circle.fill).toBe(originalFill);
      });

      it('strokeWidthのみ更新できる', () => {
        const circle = new CircleShape(150, 150, 50, 50);
        const originalStroke = circle.stroke;
        const originalFill = circle.fill;

        circle.setStyle({ strokeWidth: 8 });

        expect(circle.stroke).toBe(originalStroke);
        expect(circle.strokeWidth).toBe(8);
        expect(circle.fill).toBe(originalFill);
      });

      it('fillのみ更新できる', () => {
        const circle = new CircleShape(150, 150, 50, 50);
        const originalStroke = circle.stroke;
        const originalStrokeWidth = circle.strokeWidth;

        circle.setStyle({ fill: '#ffff00' });

        expect(circle.stroke).toBe(originalStroke);
        expect(circle.strokeWidth).toBe(originalStrokeWidth);
        expect(circle.fill).toBe('#ffff00');
      });

      it('空のオプションでも安全に処理される', () => {
        const circle = new CircleShape(150, 150, 50, 50);
        const originalStyle = circle.getStyle();

        circle.setStyle({});

        expect(circle.getStyle()).toEqual(originalStyle);
      });
    });
  });
});
