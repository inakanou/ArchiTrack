/**
 * @fileoverview 四角形ツールのテスト
 *
 * Task 15.3: 四角形ツールを実装する（TDD）
 *
 * Requirements:
 * - 7.3: 四角形ツールを選択してドラッグすると長方形を描画する
 *
 * テスト対象:
 * - ドラッグによる長方形描画
 * - 座標計算（位置、幅、高さ）
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

// Fabric.jsのモック - Rectクラスを継承可能にする
vi.mock('fabric', () => {
  // 四角形モック
  class MockRect {
    left?: number;
    top?: number;
    width?: number;
    height?: number;
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
      this.width = 0;
      this.height = 0;
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
        left: this.left,
        top: this.top,
        width: this.width,
        height: this.height,
        fill: this.fill,
        stroke: this.stroke,
        strokeWidth: this.strokeWidth,
      };
    }
  }

  return {
    Rect: MockRect,
  };
});

import {
  RectangleShape,
  createRectangle,
  type RectangleOptions,
  DEFAULT_RECTANGLE_OPTIONS,
} from '../../../components/site-surveys/tools/RectangleTool';

// ============================================================================
// テストスイート
// ============================================================================

describe('RectangleTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ==========================================================================
  // Task 15.3: 四角形ツール実装テスト
  // ==========================================================================
  describe('四角形描画機能', () => {
    describe('ドラッグによる長方形描画', () => {
      it('ドラッグの開始点と終了点から四角形オブジェクトが作成される', () => {
        const startPoint = { x: 100, y: 100 };
        const endPoint = { x: 200, y: 200 };

        const rectangle = createRectangle(startPoint, endPoint);

        expect(rectangle).toBeDefined();
        expect(rectangle).not.toBeNull();
      });

      it('ドラッグで正方形の領域を指定すると正方形が作成される', () => {
        const startPoint = { x: 100, y: 100 };
        const endPoint = { x: 200, y: 200 }; // 100x100の正方形領域

        const rectangle = createRectangle(startPoint, endPoint);

        expect(rectangle).not.toBeNull();
        expect(rectangle!.shapeWidth).toBe(rectangle!.shapeHeight); // 正方形は幅と高さが等しい
        expect(rectangle!.isSquare).toBe(true);
      });

      it('ドラッグで長方形の領域を指定すると長方形が作成される', () => {
        const startPoint = { x: 100, y: 100 };
        const endPoint = { x: 300, y: 200 }; // 200x100の長方形領域

        const rectangle = createRectangle(startPoint, endPoint);

        expect(rectangle).not.toBeNull();
        expect(rectangle!.shapeWidth).not.toBe(rectangle!.shapeHeight); // 長方形は幅と高さが異なる
        expect(rectangle!.isSquare).toBe(false);
      });

      it('水平方向に長い長方形が作成される', () => {
        const startPoint = { x: 100, y: 100 };
        const endPoint = { x: 400, y: 200 }; // 幅300x高さ100

        const rectangle = createRectangle(startPoint, endPoint);

        expect(rectangle).not.toBeNull();
        expect(rectangle!.shapeWidth).toBeGreaterThan(rectangle!.shapeHeight);
      });

      it('垂直方向に長い長方形が作成される', () => {
        const startPoint = { x: 100, y: 100 };
        const endPoint = { x: 200, y: 400 }; // 幅100x高さ300

        const rectangle = createRectangle(startPoint, endPoint);

        expect(rectangle).not.toBeNull();
        expect(rectangle!.shapeHeight).toBeGreaterThan(rectangle!.shapeWidth);
      });

      it('始点と終点が同じ場合は四角形が作成されない', () => {
        const startPoint = { x: 100, y: 100 };
        const endPoint = { x: 100, y: 100 };

        const rectangle = createRectangle(startPoint, endPoint);

        expect(rectangle).toBeNull();
      });

      it('非常に小さい領域でも四角形が作成される（5px以上）', () => {
        const startPoint = { x: 100, y: 100 };
        const endPoint = { x: 106, y: 106 }; // 6x6の領域

        const rectangle = createRectangle(startPoint, endPoint);

        expect(rectangle).not.toBeNull();
      });

      it('小さすぎる領域の場合は四角形が作成されない（5px未満）', () => {
        const startPoint = { x: 100, y: 100 };
        const endPoint = { x: 103, y: 103 }; // 3x3の領域

        const rectangle = createRectangle(startPoint, endPoint);

        expect(rectangle).toBeNull();
      });

      it('左上から右下へドラッグしても四角形が正しく作成される', () => {
        const startPoint = { x: 100, y: 100 };
        const endPoint = { x: 200, y: 200 };

        const rectangle = createRectangle(startPoint, endPoint);

        expect(rectangle).not.toBeNull();
        expect(rectangle!.positionX).toBe(100); // 左上X
        expect(rectangle!.positionY).toBe(100); // 左上Y
      });

      it('右下から左上へドラッグしても四角形が正しく作成される', () => {
        const startPoint = { x: 200, y: 200 };
        const endPoint = { x: 100, y: 100 };

        const rectangle = createRectangle(startPoint, endPoint);

        expect(rectangle).not.toBeNull();
        expect(rectangle!.positionX).toBe(100);
        expect(rectangle!.positionY).toBe(100);
      });

      it('左下から右上へドラッグしても四角形が正しく作成される', () => {
        const startPoint = { x: 100, y: 200 };
        const endPoint = { x: 200, y: 100 };

        const rectangle = createRectangle(startPoint, endPoint);

        expect(rectangle).not.toBeNull();
        expect(rectangle!.positionX).toBe(100);
        expect(rectangle!.positionY).toBe(100);
      });

      it('右上から左下へドラッグしても四角形が正しく作成される', () => {
        const startPoint = { x: 200, y: 100 };
        const endPoint = { x: 100, y: 200 };

        const rectangle = createRectangle(startPoint, endPoint);

        expect(rectangle).not.toBeNull();
        expect(rectangle!.positionX).toBe(100);
        expect(rectangle!.positionY).toBe(100);
      });
    });

    describe('座標と寸法の計算', () => {
      it('位置（左上座標）が正しく計算される', () => {
        const startPoint = { x: 100, y: 100 };
        const endPoint = { x: 300, y: 200 };

        const rectangle = createRectangle(startPoint, endPoint);

        expect(rectangle).not.toBeNull();
        expect(rectangle!.positionX).toBe(100);
        expect(rectangle!.positionY).toBe(100);
      });

      it('幅が正しく計算される', () => {
        const startPoint = { x: 100, y: 100 };
        const endPoint = { x: 300, y: 200 };

        const rectangle = createRectangle(startPoint, endPoint);

        expect(rectangle).not.toBeNull();
        expect(rectangle!.shapeWidth).toBe(200); // 300 - 100
      });

      it('高さが正しく計算される', () => {
        const startPoint = { x: 100, y: 100 };
        const endPoint = { x: 300, y: 200 };

        const rectangle = createRectangle(startPoint, endPoint);

        expect(rectangle).not.toBeNull();
        expect(rectangle!.shapeHeight).toBe(100); // 200 - 100
      });

      it('正方形の場合、幅と高さが等しい', () => {
        const startPoint = { x: 100, y: 100 };
        const endPoint = { x: 200, y: 200 };

        const rectangle = createRectangle(startPoint, endPoint);

        expect(rectangle).not.toBeNull();
        expect(rectangle!.shapeWidth).toBe(100);
        expect(rectangle!.shapeHeight).toBe(100);
      });

      it('getBounds()でバウンディングボックスを取得できる', () => {
        const startPoint = { x: 100, y: 100 };
        const endPoint = { x: 300, y: 200 };

        const rectangle = createRectangle(startPoint, endPoint);

        expect(rectangle).not.toBeNull();
        const bounds = rectangle!.getBounds();
        expect(bounds.left).toBe(100);
        expect(bounds.top).toBe(100);
        expect(bounds.right).toBe(300);
        expect(bounds.bottom).toBe(200);
      });
    });

    describe('カスタムFabric.jsオブジェクト実装', () => {
      it('RectangleShapeクラスはFabric.js Rectを拡張している', () => {
        const startPoint = { x: 100, y: 100 };
        const endPoint = { x: 300, y: 200 };

        const rectangle = createRectangle(startPoint, endPoint);

        expect(rectangle).not.toBeNull();
        expect(rectangle!.type).toBe('rectangleShape');
      });

      it('四角形オブジェクトはtypeプロパティを持つ', () => {
        const startPoint = { x: 100, y: 100 };
        const endPoint = { x: 200, y: 200 };

        const rectangle = createRectangle(startPoint, endPoint);

        expect(rectangle).not.toBeNull();
        expect(rectangle!.type).toBe('rectangleShape');
      });

      it('toObject()は四角形の情報を含むJSONを返す', () => {
        const startPoint = { x: 100, y: 100 };
        const endPoint = { x: 300, y: 200 };

        const rectangle = createRectangle(startPoint, endPoint);

        expect(rectangle).not.toBeNull();
        const jsonObject = rectangle!.toObject();

        expect(jsonObject.type).toBe('rectangleShape');
        expect(jsonObject.left).toBe(100);
        expect(jsonObject.top).toBe(100);
        expect(jsonObject.width).toBe(200);
        expect(jsonObject.height).toBe(100);
      });

      it('四角形はFabric.js標準のコントロールを持つ', () => {
        const startPoint = { x: 100, y: 100 };
        const endPoint = { x: 200, y: 200 };

        const rectangle = createRectangle(startPoint, endPoint);

        expect(rectangle).not.toBeNull();
        expect(rectangle!.hasControls).toBe(true);
        expect(rectangle!.hasBorders).toBe(true);
      });

      it('四角形はドラッグで移動可能', () => {
        const startPoint = { x: 100, y: 100 };
        const endPoint = { x: 200, y: 200 };

        const rectangle = createRectangle(startPoint, endPoint);

        expect(rectangle).not.toBeNull();
        expect(rectangle!.lockMovementX).toBe(false);
        expect(rectangle!.lockMovementY).toBe(false);
      });
    });

    describe('スタイルオプション', () => {
      it('デフォルトの線色は黒（#000000）である', () => {
        const startPoint = { x: 100, y: 100 };
        const endPoint = { x: 200, y: 200 };

        const rectangle = createRectangle(startPoint, endPoint);

        expect(rectangle).not.toBeNull();
        expect(rectangle!.stroke).toBe(DEFAULT_RECTANGLE_OPTIONS.stroke);
      });

      it('デフォルトの線の太さは2pxである', () => {
        const startPoint = { x: 100, y: 100 };
        const endPoint = { x: 200, y: 200 };

        const rectangle = createRectangle(startPoint, endPoint);

        expect(rectangle).not.toBeNull();
        expect(rectangle!.strokeWidth).toBe(DEFAULT_RECTANGLE_OPTIONS.strokeWidth);
      });

      it('デフォルトの塗りつぶし色は透明である', () => {
        const startPoint = { x: 100, y: 100 };
        const endPoint = { x: 200, y: 200 };

        const rectangle = createRectangle(startPoint, endPoint);

        expect(rectangle).not.toBeNull();
        expect(rectangle!.fill).toBe(DEFAULT_RECTANGLE_OPTIONS.fill);
      });

      it('線色をカスタマイズできる', () => {
        const startPoint = { x: 100, y: 100 };
        const endPoint = { x: 200, y: 200 };
        const options: Partial<RectangleOptions> = { stroke: '#ff0000' };

        const rectangle = createRectangle(startPoint, endPoint, options);

        expect(rectangle).not.toBeNull();
        expect(rectangle!.stroke).toBe('#ff0000');
      });

      it('線の太さをカスタマイズできる', () => {
        const startPoint = { x: 100, y: 100 };
        const endPoint = { x: 200, y: 200 };
        const options: Partial<RectangleOptions> = { strokeWidth: 4 };

        const rectangle = createRectangle(startPoint, endPoint, options);

        expect(rectangle).not.toBeNull();
        expect(rectangle!.strokeWidth).toBe(4);
      });

      it('塗りつぶし色をカスタマイズできる', () => {
        const startPoint = { x: 100, y: 100 };
        const endPoint = { x: 200, y: 200 };
        const options: Partial<RectangleOptions> = { fill: '#00ff00' };

        const rectangle = createRectangle(startPoint, endPoint, options);

        expect(rectangle).not.toBeNull();
        expect(rectangle!.fill).toBe('#00ff00');
      });
    });
  });

  // ==========================================================================
  // RectangleShapeクラスの詳細テスト
  // ==========================================================================
  describe('RectangleShapeクラス', () => {
    describe('インスタンス作成', () => {
      it('RectangleShapeクラスのインスタンスが作成できる', () => {
        const rectangle = new RectangleShape(100, 100, 200, 150);

        expect(rectangle).toBeInstanceOf(RectangleShape);
      });

      it('位置と寸法のプロパティが設定される', () => {
        const rectangle = new RectangleShape(100, 100, 200, 150);

        expect(rectangle.positionX).toBe(100);
        expect(rectangle.positionY).toBe(100);
        expect(rectangle.shapeWidth).toBe(200);
        expect(rectangle.shapeHeight).toBe(150);
      });

      it('オプションを指定してインスタンスが作成できる', () => {
        const options: Partial<RectangleOptions> = {
          stroke: '#ff0000',
          strokeWidth: 4,
          fill: '#00ff00',
        };
        const rectangle = new RectangleShape(100, 100, 200, 150, options);

        expect(rectangle.stroke).toBe('#ff0000');
        expect(rectangle.strokeWidth).toBe(4);
        expect(rectangle.fill).toBe('#00ff00');
      });
    });

    describe('ジオメトリの更新', () => {
      it('位置を更新できる', () => {
        const rectangle = new RectangleShape(100, 100, 200, 150);

        rectangle.setPosition(150, 200);

        expect(rectangle.positionX).toBe(150);
        expect(rectangle.positionY).toBe(200);
      });

      it('寸法を更新できる', () => {
        const rectangle = new RectangleShape(100, 100, 200, 150);

        rectangle.setDimensions(300, 250);

        expect(rectangle.shapeWidth).toBe(300);
        expect(rectangle.shapeHeight).toBe(250);
      });

      it('寸法の更新後、setCoords()が呼ばれて座標が更新される', () => {
        const rectangle = new RectangleShape(100, 100, 200, 150);

        rectangle.setDimensions(300, 250);

        expect(mockSetCoords).toHaveBeenCalled();
      });

      it('ドラッグ座標から四角形を更新できる（updateFromDrag）', () => {
        const rectangle = new RectangleShape(100, 100, 200, 150);

        rectangle.updateFromDrag({ x: 50, y: 50 }, { x: 250, y: 200 });

        expect(rectangle.positionX).toBe(50);
        expect(rectangle.positionY).toBe(50);
        expect(rectangle.shapeWidth).toBe(200);
        expect(rectangle.shapeHeight).toBe(150);
      });
    });

    describe('スタイルの更新', () => {
      it('線色を更新できる', () => {
        const rectangle = new RectangleShape(100, 100, 200, 150);

        rectangle.setStroke('#00ff00');

        expect(rectangle.stroke).toBe('#00ff00');
      });

      it('線の太さを更新できる', () => {
        const rectangle = new RectangleShape(100, 100, 200, 150);

        rectangle.setStrokeWidth(6);

        expect(rectangle.strokeWidth).toBe(6);
      });

      it('塗りつぶし色を更新できる', () => {
        const rectangle = new RectangleShape(100, 100, 200, 150);

        rectangle.setFill('#0000ff');

        expect(rectangle.fill).toBe('#0000ff');
      });

      it('スタイルを一括で変更できる', () => {
        const rectangle = new RectangleShape(100, 100, 200, 150);

        rectangle.setStyle({
          stroke: '#ff00ff',
          strokeWidth: 5,
          fill: '#00ffff',
        });

        expect(rectangle.stroke).toBe('#ff00ff');
        expect(rectangle.strokeWidth).toBe(5);
        expect(rectangle.fill).toBe('#00ffff');
      });

      it('現在のスタイルを取得できる', () => {
        const rectangle = new RectangleShape(100, 100, 200, 150, {
          stroke: '#123456',
          strokeWidth: 3,
          fill: '#654321',
        });

        const style = rectangle.getStyle();

        expect(style.stroke).toBe('#123456');
        expect(style.strokeWidth).toBe(3);
        expect(style.fill).toBe('#654321');
      });
    });

    describe('toObject()のシリアライズ', () => {
      it('スタイル情報がシリアライズに含まれる', () => {
        const rectangle = new RectangleShape(100, 100, 200, 150, {
          stroke: '#ff0000',
          strokeWidth: 4,
          fill: '#00ff00',
        });

        const json = rectangle.toObject();

        expect(json.stroke).toBe('#ff0000');
        expect(json.strokeWidth).toBe(4);
        expect(json.fill).toBe('#00ff00');
      });

      it('ジオメトリ情報がシリアライズに含まれる', () => {
        const rectangle = new RectangleShape(100, 100, 200, 150);

        const json = rectangle.toObject();

        expect(json.left).toBe(100);
        expect(json.top).toBe(100);
        expect(json.width).toBe(200);
        expect(json.height).toBe(150);
      });
    });

    describe('fromObject() デシリアライズ', () => {
      it('JSONオブジェクトからRectangleShapeを復元できる', async () => {
        const json = {
          type: 'rectangleShape' as const,
          left: 100,
          top: 100,
          width: 200,
          height: 150,
          stroke: '#ff0000',
          strokeWidth: 4,
          fill: '#00ff00',
        };

        const rectangle = await RectangleShape.fromObject(json);

        expect(rectangle).toBeInstanceOf(RectangleShape);
        expect(rectangle.positionX).toBe(100);
        expect(rectangle.positionY).toBe(100);
        expect(rectangle.shapeWidth).toBe(200);
        expect(rectangle.shapeHeight).toBe(150);
        expect(rectangle.stroke).toBe('#ff0000');
        expect(rectangle.strokeWidth).toBe(4);
        expect(rectangle.fill).toBe('#00ff00');
      });

      it('デフォルトオプションで復元できる', async () => {
        const json = {
          type: 'rectangleShape' as const,
          left: 50,
          top: 50,
          width: 100,
          height: 100,
          stroke: '#000000',
          strokeWidth: 2,
          fill: 'transparent',
        };

        const rectangle = await RectangleShape.fromObject(json);

        expect(rectangle.type).toBe('rectangleShape');
        expect(rectangle.isSquare).toBe(true);
      });

      it('toObject()で出力したJSONをfromObject()で復元できる', async () => {
        const originalRect = new RectangleShape(120, 80, 250, 180, {
          stroke: '#00ff00',
          strokeWidth: 3,
          fill: '#ff00ff',
        });

        const json = originalRect.toObject();
        const restoredRect = await RectangleShape.fromObject(json);

        expect(restoredRect.positionX).toBe(originalRect.positionX);
        expect(restoredRect.positionY).toBe(originalRect.positionY);
        expect(restoredRect.shapeWidth).toBe(originalRect.shapeWidth);
        expect(restoredRect.shapeHeight).toBe(originalRect.shapeHeight);
        expect(restoredRect.stroke).toBe(originalRect.stroke);
        expect(restoredRect.strokeWidth).toBe(originalRect.strokeWidth);
        expect(restoredRect.fill).toBe(originalRect.fill);
      });
    });

    describe('setStyle() 部分更新', () => {
      it('strokeのみ更新できる', () => {
        const rectangle = new RectangleShape(100, 100, 200, 150);
        const originalStrokeWidth = rectangle.strokeWidth;
        const originalFill = rectangle.fill;

        rectangle.setStyle({ stroke: '#0000ff' });

        expect(rectangle.stroke).toBe('#0000ff');
        expect(rectangle.strokeWidth).toBe(originalStrokeWidth);
        expect(rectangle.fill).toBe(originalFill);
      });

      it('strokeWidthのみ更新できる', () => {
        const rectangle = new RectangleShape(100, 100, 200, 150);
        const originalStroke = rectangle.stroke;
        const originalFill = rectangle.fill;

        rectangle.setStyle({ strokeWidth: 8 });

        expect(rectangle.stroke).toBe(originalStroke);
        expect(rectangle.strokeWidth).toBe(8);
        expect(rectangle.fill).toBe(originalFill);
      });

      it('fillのみ更新できる', () => {
        const rectangle = new RectangleShape(100, 100, 200, 150);
        const originalStroke = rectangle.stroke;
        const originalStrokeWidth = rectangle.strokeWidth;

        rectangle.setStyle({ fill: '#ffff00' });

        expect(rectangle.stroke).toBe(originalStroke);
        expect(rectangle.strokeWidth).toBe(originalStrokeWidth);
        expect(rectangle.fill).toBe('#ffff00');
      });

      it('空のオプションでも安全に処理される', () => {
        const rectangle = new RectangleShape(100, 100, 200, 150);
        const originalStyle = rectangle.getStyle();

        rectangle.setStyle({});

        expect(rectangle.getStyle()).toEqual(originalStyle);
      });
    });
  });
});
