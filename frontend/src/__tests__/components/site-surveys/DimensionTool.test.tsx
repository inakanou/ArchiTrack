/**
 * @fileoverview 寸法線ツールのテスト
 *
 * Task 14.1: 寸法線描画機能を実装する（TDD）
 *
 * Requirements:
 * - 6.1: 寸法線ツールを選択して2点をクリックすると2点間に寸法線を描画する
 *
 * テスト対象:
 * - 2点クリックによる寸法線描画
 * - 端点間の直線と垂直線（エンドキャップ）
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

// Fabric.jsのモック - Groupクラスを継承可能にする
vi.mock('fabric', () => {
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

  // FabricTextモック
  class MockFabricText {
    text: string;
    fontSize?: number;
    fill?: string;
    fontFamily?: string;
    left?: number;
    top?: number;
    width: number;
    height: number;
    selectable?: boolean;
    evented?: boolean;

    constructor(text: string, options?: Record<string, unknown>) {
      this.text = text;
      this.width = text.length * 7; // 概算幅
      this.height = 14; // 概算高さ
      if (options) {
        Object.assign(this, options);
      }
    }

    set(options: Record<string, unknown> | string, value?: unknown): this {
      if (typeof options === 'string') {
        (this as Record<string, unknown>)[options] = value;
      } else {
        Object.assign(this, options);
        // textが更新された場合は幅も更新
        if (options.text) {
          this.width = (options.text as string).length * 7;
        }
      }
      return this;
    }
  }

  // Rectモック
  class MockRect {
    left?: number;
    top?: number;
    width?: number;
    height?: number;
    fill?: string;
    selectable?: boolean;
    evented?: boolean;

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
    Line: MockLine,
    Group: MockGroup,
    FabricText: MockFabricText,
    Rect: MockRect,
  };
});

import {
  DimensionLine,
  createDimensionLine,
  type DimensionLineOptions,
  DEFAULT_DIMENSION_OPTIONS,
} from '../../../components/site-surveys/tools/DimensionTool';

// ============================================================================
// テストスイート
// ============================================================================

describe('DimensionTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ==========================================================================
  // Task 14.1: 寸法線描画機能テスト
  // ==========================================================================
  describe('寸法線描画機能', () => {
    describe('2点クリックによる寸法線描画', () => {
      it('2点の座標から寸法線オブジェクトが作成される', () => {
        const startPoint = { x: 100, y: 100 };
        const endPoint = { x: 300, y: 100 };

        const dimensionLine = createDimensionLine(startPoint, endPoint);

        expect(dimensionLine).toBeDefined();
        expect(dimensionLine).not.toBeNull();
        expect(dimensionLine!.startPoint).toEqual(startPoint);
        expect(dimensionLine!.endPoint).toEqual(endPoint);
      });

      it('水平な寸法線が作成される（y座標が同じ場合）', () => {
        const startPoint = { x: 100, y: 200 };
        const endPoint = { x: 400, y: 200 };

        const dimensionLine = createDimensionLine(startPoint, endPoint);

        expect(dimensionLine).not.toBeNull();
        expect(dimensionLine!.isHorizontal).toBe(true);
        expect(dimensionLine!.isVertical).toBe(false);
      });

      it('垂直な寸法線が作成される（x座標が同じ場合）', () => {
        const startPoint = { x: 150, y: 100 };
        const endPoint = { x: 150, y: 400 };

        const dimensionLine = createDimensionLine(startPoint, endPoint);

        expect(dimensionLine).not.toBeNull();
        expect(dimensionLine!.isHorizontal).toBe(false);
        expect(dimensionLine!.isVertical).toBe(true);
      });

      it('斜めの寸法線が作成される', () => {
        const startPoint = { x: 100, y: 100 };
        const endPoint = { x: 300, y: 250 };

        const dimensionLine = createDimensionLine(startPoint, endPoint);

        expect(dimensionLine).not.toBeNull();
        expect(dimensionLine!.isHorizontal).toBe(false);
        expect(dimensionLine!.isVertical).toBe(false);
      });

      it('始点と終点が同じ場合は寸法線が作成されない', () => {
        const startPoint = { x: 100, y: 100 };
        const endPoint = { x: 100, y: 100 };

        const dimensionLine = createDimensionLine(startPoint, endPoint);

        expect(dimensionLine).toBeNull();
      });

      it('非常に近い2点の場合でも寸法線が作成される（5px以上）', () => {
        const startPoint = { x: 100, y: 100 };
        const endPoint = { x: 106, y: 100 }; // 6px離れている

        const dimensionLine = createDimensionLine(startPoint, endPoint);

        expect(dimensionLine).not.toBeNull();
      });

      it('近すぎる2点の場合は寸法線が作成されない（5px未満）', () => {
        const startPoint = { x: 100, y: 100 };
        const endPoint = { x: 103, y: 100 }; // 3px離れている

        const dimensionLine = createDimensionLine(startPoint, endPoint);

        expect(dimensionLine).toBeNull();
      });
    });

    describe('端点間の直線と垂直線（エンドキャップ）', () => {
      it('寸法線はメインライン（端点間の直線）を含む', () => {
        const startPoint = { x: 100, y: 100 };
        const endPoint = { x: 300, y: 100 };

        const dimensionLine = createDimensionLine(startPoint, endPoint);

        expect(dimensionLine).not.toBeNull();
        expect(dimensionLine!.mainLine).toBeDefined();
        expect(dimensionLine!.mainLine.x1).toBe(100);
        expect(dimensionLine!.mainLine.y1).toBe(100);
        expect(dimensionLine!.mainLine.x2).toBe(300);
        expect(dimensionLine!.mainLine.y2).toBe(100);
      });

      it('寸法線は始点のエンドキャップ（垂直線）を含む', () => {
        const startPoint = { x: 100, y: 100 };
        const endPoint = { x: 300, y: 100 };

        const dimensionLine = createDimensionLine(startPoint, endPoint);

        expect(dimensionLine).not.toBeNull();
        expect(dimensionLine!.startCap).toBeDefined();
        // 始点キャップは始点から垂直に伸びる（水平線なのでx座標は同じ）
        expect(dimensionLine!.startCap.x1).toBe(100);
        expect(dimensionLine!.startCap.x2).toBe(100);
      });

      it('寸法線は終点のエンドキャップ（垂直線）を含む', () => {
        const startPoint = { x: 100, y: 100 };
        const endPoint = { x: 300, y: 100 };

        const dimensionLine = createDimensionLine(startPoint, endPoint);

        expect(dimensionLine).not.toBeNull();
        expect(dimensionLine!.endCap).toBeDefined();
        // 終点キャップは終点から垂直に伸びる（水平線なのでx座標は同じ）
        expect(dimensionLine!.endCap.x1).toBe(300);
        expect(dimensionLine!.endCap.x2).toBe(300);
      });

      it('エンドキャップの長さはデフォルトで10pxである', () => {
        const startPoint = { x: 100, y: 100 };
        const endPoint = { x: 300, y: 100 };

        const dimensionLine = createDimensionLine(startPoint, endPoint);

        expect(dimensionLine).not.toBeNull();
        // 水平線の場合、キャップは垂直に伸びる
        const capLength = Math.abs(dimensionLine!.startCap.y2 - dimensionLine!.startCap.y1);
        expect(capLength).toBe(DEFAULT_DIMENSION_OPTIONS.capLength);
      });

      it('エンドキャップの長さをカスタマイズできる', () => {
        const startPoint = { x: 100, y: 100 };
        const endPoint = { x: 300, y: 100 };
        const options: Partial<DimensionLineOptions> = { capLength: 20 };

        const dimensionLine = createDimensionLine(startPoint, endPoint, options);

        expect(dimensionLine).not.toBeNull();
        const capLength = Math.abs(dimensionLine!.startCap.y2 - dimensionLine!.startCap.y1);
        expect(capLength).toBe(20);
      });

      it('垂直な寸法線の場合、エンドキャップは水平に伸びる', () => {
        const startPoint = { x: 150, y: 100 };
        const endPoint = { x: 150, y: 300 };

        const dimensionLine = createDimensionLine(startPoint, endPoint);

        expect(dimensionLine).not.toBeNull();
        // 垂直線の場合、キャップは水平に伸びる（y座標は同じ）
        expect(dimensionLine!.startCap.y1).toBe(100);
        expect(dimensionLine!.startCap.y2).toBe(100);
      });

      it('斜めの寸法線の場合、エンドキャップは寸法線に垂直に伸びる', () => {
        const startPoint = { x: 100, y: 100 };
        const endPoint = { x: 200, y: 200 };

        const dimensionLine = createDimensionLine(startPoint, endPoint);

        expect(dimensionLine).not.toBeNull();
        // 斜め線の場合、キャップも斜めに配置される
        expect(dimensionLine!.startCap).toBeDefined();
        expect(dimensionLine!.endCap).toBeDefined();
      });
    });

    describe('カスタムFabric.jsオブジェクト実装', () => {
      it('DimensionLineクラスはFabric.js Groupを拡張している', () => {
        const startPoint = { x: 100, y: 100 };
        const endPoint = { x: 300, y: 100 };

        const dimensionLine = createDimensionLine(startPoint, endPoint);

        expect(dimensionLine).not.toBeNull();
        expect(dimensionLine!.type).toBe('dimensionLine');
      });

      it('寸法線オブジェクトはtypeプロパティを持つ', () => {
        const startPoint = { x: 100, y: 100 };
        const endPoint = { x: 300, y: 100 };

        const dimensionLine = createDimensionLine(startPoint, endPoint);

        expect(dimensionLine).not.toBeNull();
        expect(dimensionLine!.type).toBe('dimensionLine');
      });

      it('寸法線オブジェクトはcustomDataを持つ', () => {
        const startPoint = { x: 100, y: 100 };
        const endPoint = { x: 300, y: 100 };

        const dimensionLine = createDimensionLine(startPoint, endPoint);

        expect(dimensionLine).not.toBeNull();
        expect(dimensionLine!.customData).toBeDefined();
        expect(dimensionLine!.customData.dimensionValue).toBe('');
        expect(dimensionLine!.customData.dimensionUnit).toBe('');
      });

      it('toObject()は寸法線の情報を含むJSONを返す', () => {
        const startPoint = { x: 100, y: 100 };
        const endPoint = { x: 300, y: 100 };

        const dimensionLine = createDimensionLine(startPoint, endPoint);

        expect(dimensionLine).not.toBeNull();
        const jsonObject = dimensionLine!.toObject();

        expect(jsonObject.type).toBe('dimensionLine');
        expect(jsonObject.startPoint).toEqual(startPoint);
        expect(jsonObject.endPoint).toEqual(endPoint);
        expect(jsonObject.customData).toBeDefined();
      });

      it('寸法線はFabric.js標準のコントロールを持つ', () => {
        const startPoint = { x: 100, y: 100 };
        const endPoint = { x: 300, y: 100 };

        const dimensionLine = createDimensionLine(startPoint, endPoint);

        expect(dimensionLine).not.toBeNull();
        expect(dimensionLine!.hasControls).toBe(true);
        expect(dimensionLine!.hasBorders).toBe(true);
      });

      it('寸法線はドラッグで移動可能', () => {
        const startPoint = { x: 100, y: 100 };
        const endPoint = { x: 300, y: 100 };

        const dimensionLine = createDimensionLine(startPoint, endPoint);

        expect(dimensionLine).not.toBeNull();
        expect(dimensionLine!.lockMovementX).toBe(false);
        expect(dimensionLine!.lockMovementY).toBe(false);
      });
    });

    describe('スタイルオプション', () => {
      it('デフォルトの線色は黒（#000000）である', () => {
        const startPoint = { x: 100, y: 100 };
        const endPoint = { x: 300, y: 100 };

        const dimensionLine = createDimensionLine(startPoint, endPoint);

        expect(dimensionLine).not.toBeNull();
        expect(dimensionLine!.stroke).toBe(DEFAULT_DIMENSION_OPTIONS.stroke);
      });

      it('デフォルトの線の太さは2pxである', () => {
        const startPoint = { x: 100, y: 100 };
        const endPoint = { x: 300, y: 100 };

        const dimensionLine = createDimensionLine(startPoint, endPoint);

        expect(dimensionLine).not.toBeNull();
        expect(dimensionLine!.strokeWidth).toBe(DEFAULT_DIMENSION_OPTIONS.strokeWidth);
      });

      it('線色をカスタマイズできる', () => {
        const startPoint = { x: 100, y: 100 };
        const endPoint = { x: 300, y: 100 };
        const options: Partial<DimensionLineOptions> = { stroke: '#ff0000' };

        const dimensionLine = createDimensionLine(startPoint, endPoint, options);

        expect(dimensionLine).not.toBeNull();
        expect(dimensionLine!.stroke).toBe('#ff0000');
      });

      it('線の太さをカスタマイズできる', () => {
        const startPoint = { x: 100, y: 100 };
        const endPoint = { x: 300, y: 100 };
        const options: Partial<DimensionLineOptions> = { strokeWidth: 4 };

        const dimensionLine = createDimensionLine(startPoint, endPoint, options);

        expect(dimensionLine).not.toBeNull();
        expect(dimensionLine!.strokeWidth).toBe(4);
      });
    });

    describe('寸法線の計算', () => {
      it('2点間の距離（ピクセル）が計算される', () => {
        const startPoint = { x: 0, y: 0 };
        const endPoint = { x: 300, y: 400 }; // 3-4-5の直角三角形 -> 距離500

        const dimensionLine = createDimensionLine(startPoint, endPoint);

        expect(dimensionLine).not.toBeNull();
        expect(dimensionLine!.length).toBe(500);
      });

      it('水平線の距離が正しく計算される', () => {
        const startPoint = { x: 100, y: 200 };
        const endPoint = { x: 400, y: 200 };

        const dimensionLine = createDimensionLine(startPoint, endPoint);

        expect(dimensionLine).not.toBeNull();
        expect(dimensionLine!.length).toBe(300);
      });

      it('垂直線の距離が正しく計算される', () => {
        const startPoint = { x: 150, y: 100 };
        const endPoint = { x: 150, y: 350 };

        const dimensionLine = createDimensionLine(startPoint, endPoint);

        expect(dimensionLine).not.toBeNull();
        expect(dimensionLine!.length).toBe(250);
      });

      it('寸法線の角度（度）が計算される', () => {
        const startPoint = { x: 0, y: 0 };
        const endPoint = { x: 100, y: 100 }; // 45度

        const dimensionLine = createDimensionLine(startPoint, endPoint);

        expect(dimensionLine).not.toBeNull();
        expect(dimensionLine!.angle).toBeCloseTo(45);
      });

      it('水平線の角度は0度', () => {
        const startPoint = { x: 100, y: 200 };
        const endPoint = { x: 400, y: 200 };

        const dimensionLine = createDimensionLine(startPoint, endPoint);

        expect(dimensionLine).not.toBeNull();
        expect(dimensionLine!.angle).toBe(0);
      });

      it('垂直線の角度は90度', () => {
        const startPoint = { x: 150, y: 100 };
        const endPoint = { x: 150, y: 350 };

        const dimensionLine = createDimensionLine(startPoint, endPoint);

        expect(dimensionLine).not.toBeNull();
        expect(dimensionLine!.angle).toBe(90);
      });
    });
  });

  // ==========================================================================
  // DimensionLineクラスの詳細テスト
  // ==========================================================================
  describe('DimensionLineクラス', () => {
    describe('インスタンス作成', () => {
      it('DimensionLineクラスのインスタンスが作成できる', () => {
        const dimensionLine = new DimensionLine({ x: 100, y: 100 }, { x: 300, y: 100 });

        expect(dimensionLine).toBeInstanceOf(DimensionLine);
      });

      it('始点と終点のプロパティが設定される', () => {
        const startPoint = { x: 100, y: 100 };
        const endPoint = { x: 300, y: 100 };
        const dimensionLine = new DimensionLine(startPoint, endPoint);

        expect(dimensionLine.startPoint).toEqual(startPoint);
        expect(dimensionLine.endPoint).toEqual(endPoint);
      });

      it('オプションを指定してインスタンスが作成できる', () => {
        const options: Partial<DimensionLineOptions> = {
          stroke: '#ff0000',
          strokeWidth: 4,
          capLength: 15,
        };
        const dimensionLine = new DimensionLine({ x: 100, y: 100 }, { x: 300, y: 100 }, options);

        expect(dimensionLine.stroke).toBe('#ff0000');
        expect(dimensionLine.strokeWidth).toBe(4);
      });
    });

    describe('端点の更新', () => {
      it('始点を更新できる', () => {
        const dimensionLine = new DimensionLine({ x: 100, y: 100 }, { x: 300, y: 100 });

        dimensionLine.setStartPoint({ x: 50, y: 50 });

        expect(dimensionLine.startPoint).toEqual({ x: 50, y: 50 });
      });

      it('終点を更新できる', () => {
        const dimensionLine = new DimensionLine({ x: 100, y: 100 }, { x: 300, y: 100 });

        dimensionLine.setEndPoint({ x: 400, y: 200 });

        expect(dimensionLine.endPoint).toEqual({ x: 400, y: 200 });
      });

      it('端点の更新後、メインラインが再計算される', () => {
        const dimensionLine = new DimensionLine({ x: 100, y: 100 }, { x: 300, y: 100 });

        dimensionLine.setEndPoint({ x: 500, y: 100 });

        expect(dimensionLine.mainLine.x2).toBe(500);
      });

      it('端点の更新後、エンドキャップが再計算される', () => {
        const dimensionLine = new DimensionLine({ x: 100, y: 100 }, { x: 300, y: 100 });

        dimensionLine.setEndPoint({ x: 500, y: 100 });

        expect(dimensionLine.endCap.x1).toBe(500);
        expect(dimensionLine.endCap.x2).toBe(500);
      });

      it('端点の更新後、距離が再計算される', () => {
        const dimensionLine = new DimensionLine({ x: 100, y: 100 }, { x: 300, y: 100 });

        expect(dimensionLine.length).toBe(200);

        dimensionLine.setEndPoint({ x: 500, y: 100 });

        expect(dimensionLine.length).toBe(400);
      });
    });

    describe('スタイルの更新', () => {
      it('線色を更新できる', () => {
        const dimensionLine = new DimensionLine({ x: 100, y: 100 }, { x: 300, y: 100 });

        dimensionLine.setStroke('#00ff00');

        expect(dimensionLine.stroke).toBe('#00ff00');
      });

      it('線の太さを更新できる', () => {
        const dimensionLine = new DimensionLine({ x: 100, y: 100 }, { x: 300, y: 100 });

        dimensionLine.setStrokeWidth(6);

        expect(dimensionLine.strokeWidth).toBe(6);
      });
    });

    describe('寸法値の管理', () => {
      it('寸法値を設定できる', () => {
        const dimensionLine = new DimensionLine({ x: 100, y: 100 }, { x: 300, y: 100 });

        dimensionLine.setDimensionValue('1500');

        expect(dimensionLine.customData.dimensionValue).toBe('1500');
      });

      it('寸法の単位を設定できる', () => {
        const dimensionLine = new DimensionLine({ x: 100, y: 100 }, { x: 300, y: 100 });

        dimensionLine.setDimensionUnit('mm');

        expect(dimensionLine.customData.dimensionUnit).toBe('mm');
      });

      it('寸法値と単位を同時に設定できる', () => {
        const dimensionLine = new DimensionLine({ x: 100, y: 100 }, { x: 300, y: 100 });

        dimensionLine.setDimension('2500', 'cm');

        expect(dimensionLine.customData.dimensionValue).toBe('2500');
        expect(dimensionLine.customData.dimensionUnit).toBe('cm');
      });

      it('寸法のフォーマット済み文字列を取得できる', () => {
        const dimensionLine = new DimensionLine({ x: 100, y: 100 }, { x: 300, y: 100 });

        dimensionLine.setDimension('1500', 'mm');

        expect(dimensionLine.getFormattedDimension()).toBe('1500 mm');
      });

      it('単位がない場合はフォーマット済み文字列に単位が含まれない', () => {
        const dimensionLine = new DimensionLine({ x: 100, y: 100 }, { x: 300, y: 100 });

        dimensionLine.setDimensionValue('1500');

        expect(dimensionLine.getFormattedDimension()).toBe('1500');
      });

      it('寸法値がない場合は空文字列が返される', () => {
        const dimensionLine = new DimensionLine({ x: 100, y: 100 }, { x: 300, y: 100 });

        expect(dimensionLine.getFormattedDimension()).toBe('');
      });
    });

    // ========================================================================
    // Task 14.2: 寸法値入力機能テスト
    // ========================================================================
    describe('寸法線上への値表示（Task 14.2）', () => {
      it('寸法値を設定するとテキストラベルが作成される', () => {
        const dimensionLine = new DimensionLine({ x: 100, y: 100 }, { x: 300, y: 100 });

        dimensionLine.setDimensionWithLabel('1500', 'mm');

        expect(dimensionLine.hasLabel()).toBe(true);
      });

      it('テキストラベルは寸法線の中央に配置される', () => {
        const dimensionLine = new DimensionLine({ x: 100, y: 100 }, { x: 300, y: 100 });

        dimensionLine.setDimensionWithLabel('1500', 'mm');

        const labelPosition = dimensionLine.getLabelPosition();
        expect(labelPosition.x).toBe(200); // 中央: (100 + 300) / 2
        expect(labelPosition.y).toBe(100); // 同じy座標
      });

      it('テキストラベルには寸法値と単位が表示される', () => {
        const dimensionLine = new DimensionLine({ x: 100, y: 100 }, { x: 300, y: 100 });

        dimensionLine.setDimensionWithLabel('1500', 'mm');

        expect(dimensionLine.getLabelText()).toBe('1500 mm');
      });

      it('単位なしで寸法値を設定できる', () => {
        const dimensionLine = new DimensionLine({ x: 100, y: 100 }, { x: 300, y: 100 });

        dimensionLine.setDimensionWithLabel('1500', '');

        expect(dimensionLine.getLabelText()).toBe('1500');
      });

      it('寸法値を更新するとラベルテキストも更新される', () => {
        const dimensionLine = new DimensionLine({ x: 100, y: 100 }, { x: 300, y: 100 });

        dimensionLine.setDimensionWithLabel('1500', 'mm');
        dimensionLine.setDimensionWithLabel('2000', 'cm');

        expect(dimensionLine.getLabelText()).toBe('2000 cm');
      });

      it('空の寸法値を設定するとラベルが削除される', () => {
        const dimensionLine = new DimensionLine({ x: 100, y: 100 }, { x: 300, y: 100 });

        dimensionLine.setDimensionWithLabel('1500', 'mm');
        expect(dimensionLine.hasLabel()).toBe(true);

        dimensionLine.setDimensionWithLabel('', '');
        expect(dimensionLine.hasLabel()).toBe(false);
      });

      it('端点を移動するとラベル位置も更新される', () => {
        const dimensionLine = new DimensionLine({ x: 100, y: 100 }, { x: 300, y: 100 });
        dimensionLine.setDimensionWithLabel('1500', 'mm');

        dimensionLine.setEndPoint({ x: 500, y: 100 });

        const labelPosition = dimensionLine.getLabelPosition();
        expect(labelPosition.x).toBe(300); // 中央: (100 + 500) / 2
      });

      it('テキストラベルのスタイルを設定できる', () => {
        const dimensionLine = new DimensionLine({ x: 100, y: 100 }, { x: 300, y: 100 });

        dimensionLine.setDimensionWithLabel('1500', 'mm', {
          fontSize: 14,
          fontColor: '#ff0000',
          backgroundColor: '#ffffff',
        });

        const labelStyle = dimensionLine.getLabelStyle();
        expect(labelStyle.fontSize).toBe(14);
        expect(labelStyle.fontColor).toBe('#ff0000');
        expect(labelStyle.backgroundColor).toBe('#ffffff');
      });

      it('デフォルトのラベルスタイルが適用される', () => {
        const dimensionLine = new DimensionLine({ x: 100, y: 100 }, { x: 300, y: 100 });

        dimensionLine.setDimensionWithLabel('1500', 'mm');

        const labelStyle = dimensionLine.getLabelStyle();
        expect(labelStyle.fontSize).toBe(12);
        expect(labelStyle.fontColor).toBe('#000000');
        expect(labelStyle.backgroundColor).toBe('#ffffff');
      });

      it('toObject()にラベル情報が含まれる', () => {
        const dimensionLine = new DimensionLine({ x: 100, y: 100 }, { x: 300, y: 100 });

        dimensionLine.setDimensionWithLabel('1500', 'mm');

        const jsonObject = dimensionLine.toObject();
        expect(jsonObject.customData.dimensionValue).toBe('1500');
        expect(jsonObject.customData.dimensionUnit).toBe('mm');
        expect(jsonObject.labelStyle).toBeDefined();
      });
    });

    // ========================================================================
    // Task 14.3: 寸法線編集機能テスト
    // ========================================================================
    describe('寸法線編集機能（Task 14.3）', () => {
      describe('端点のドラッグによる位置調整（6.4, 6.5）', () => {
        it('始点をドラッグして位置を調整できる', () => {
          const dimensionLine = new DimensionLine({ x: 100, y: 100 }, { x: 300, y: 100 });

          dimensionLine.setStartPoint({ x: 50, y: 150 });

          expect(dimensionLine.startPoint).toEqual({ x: 50, y: 150 });
          expect(dimensionLine.endPoint).toEqual({ x: 300, y: 100 });
        });

        it('終点をドラッグして位置を調整できる', () => {
          const dimensionLine = new DimensionLine({ x: 100, y: 100 }, { x: 300, y: 100 });

          dimensionLine.setEndPoint({ x: 400, y: 200 });

          expect(dimensionLine.startPoint).toEqual({ x: 100, y: 100 });
          expect(dimensionLine.endPoint).toEqual({ x: 400, y: 200 });
        });

        it('端点移動後にメインラインの座標が更新される', () => {
          const dimensionLine = new DimensionLine({ x: 100, y: 100 }, { x: 300, y: 100 });

          dimensionLine.setStartPoint({ x: 50, y: 50 });

          expect(dimensionLine.mainLine.x1).toBe(50);
          expect(dimensionLine.mainLine.y1).toBe(50);
          expect(dimensionLine.mainLine.x2).toBe(300);
          expect(dimensionLine.mainLine.y2).toBe(100);
        });

        it('端点移動後に始点エンドキャップの位置が更新される', () => {
          const dimensionLine = new DimensionLine({ x: 100, y: 100 }, { x: 300, y: 100 });

          dimensionLine.setStartPoint({ x: 50, y: 50 });

          // エンドキャップは新しい始点(50,50)を中心に垂直に伸びる
          expect(dimensionLine.startCap).toBeDefined();
          // 斜めの寸法線なので、キャップは斜めに配置される
        });

        it('端点移動後に終点エンドキャップの位置が更新される', () => {
          const dimensionLine = new DimensionLine({ x: 100, y: 100 }, { x: 300, y: 100 });

          dimensionLine.setEndPoint({ x: 500, y: 200 });

          expect(dimensionLine.endCap).toBeDefined();
        });

        it('端点移動後に寸法線の長さが再計算される', () => {
          const dimensionLine = new DimensionLine({ x: 0, y: 0 }, { x: 100, y: 0 });
          expect(dimensionLine.length).toBe(100);

          dimensionLine.setEndPoint({ x: 200, y: 0 });

          expect(dimensionLine.length).toBe(200);
        });

        it('端点移動後に寸法線の角度が再計算される', () => {
          const dimensionLine = new DimensionLine({ x: 0, y: 0 }, { x: 100, y: 0 });
          expect(dimensionLine.angle).toBe(0);

          dimensionLine.setEndPoint({ x: 100, y: 100 });

          expect(dimensionLine.angle).toBeCloseTo(45);
        });

        it('端点移動後にラベル位置が更新される（ラベルがある場合）', () => {
          const dimensionLine = new DimensionLine({ x: 100, y: 100 }, { x: 300, y: 100 });
          dimensionLine.setDimensionWithLabel('1500', 'mm');

          dimensionLine.setEndPoint({ x: 500, y: 100 });

          const labelPosition = dimensionLine.getLabelPosition();
          expect(labelPosition.x).toBe(300); // (100 + 500) / 2 = 300
          expect(labelPosition.y).toBe(100);
        });

        it('setCoords()が呼ばれて座標が更新される', () => {
          const dimensionLine = new DimensionLine({ x: 100, y: 100 }, { x: 300, y: 100 });

          dimensionLine.setStartPoint({ x: 50, y: 50 });

          expect(mockSetCoords).toHaveBeenCalled();
        });

        it('端点情報を取得するgetEndpoints()メソッドがある', () => {
          const dimensionLine = new DimensionLine({ x: 100, y: 100 }, { x: 300, y: 200 });

          const endpoints = dimensionLine.getEndpoints();

          expect(endpoints).toEqual({
            start: { x: 100, y: 100 },
            end: { x: 300, y: 200 },
          });
        });

        it('両端点を同時に更新できるsetEndpoints()メソッドがある', () => {
          const dimensionLine = new DimensionLine({ x: 100, y: 100 }, { x: 300, y: 100 });

          dimensionLine.setEndpoints({ x: 50, y: 50 }, { x: 400, y: 200 });

          expect(dimensionLine.startPoint).toEqual({ x: 50, y: 50 });
          expect(dimensionLine.endPoint).toEqual({ x: 400, y: 200 });
        });
      });

      describe('寸法値の再編集（6.4）', () => {
        it('既存の寸法値を取得できる', () => {
          const dimensionLine = new DimensionLine({ x: 100, y: 100 }, { x: 300, y: 100 });
          dimensionLine.setDimensionWithLabel('1500', 'mm');

          expect(dimensionLine.customData.dimensionValue).toBe('1500');
          expect(dimensionLine.customData.dimensionUnit).toBe('mm');
        });

        it('寸法値を再編集（更新）できる', () => {
          const dimensionLine = new DimensionLine({ x: 100, y: 100 }, { x: 300, y: 100 });
          dimensionLine.setDimensionWithLabel('1500', 'mm');

          dimensionLine.setDimensionWithLabel('2000', 'cm');

          expect(dimensionLine.customData.dimensionValue).toBe('2000');
          expect(dimensionLine.customData.dimensionUnit).toBe('cm');
        });

        it('寸法値の再編集後、ラベルテキストが更新される', () => {
          const dimensionLine = new DimensionLine({ x: 100, y: 100 }, { x: 300, y: 100 });
          dimensionLine.setDimensionWithLabel('1500', 'mm');

          dimensionLine.setDimensionWithLabel('2000', 'cm');

          expect(dimensionLine.getLabelText()).toBe('2000 cm');
        });

        it('単位のみを変更できる', () => {
          const dimensionLine = new DimensionLine({ x: 100, y: 100 }, { x: 300, y: 100 });
          dimensionLine.setDimensionWithLabel('1500', 'mm');

          dimensionLine.setDimensionWithLabel('1500', 'm');

          expect(dimensionLine.getLabelText()).toBe('1500 m');
        });

        it('値のみを変更できる', () => {
          const dimensionLine = new DimensionLine({ x: 100, y: 100 }, { x: 300, y: 100 });
          dimensionLine.setDimensionWithLabel('1500', 'mm');

          dimensionLine.setDimensionWithLabel('2500', 'mm');

          expect(dimensionLine.getLabelText()).toBe('2500 mm');
        });

        it('寸法値をクリア（空に）できる', () => {
          const dimensionLine = new DimensionLine({ x: 100, y: 100 }, { x: 300, y: 100 });
          dimensionLine.setDimensionWithLabel('1500', 'mm');

          dimensionLine.setDimensionWithLabel('', '');

          expect(dimensionLine.customData.dimensionValue).toBe('');
          expect(dimensionLine.customData.dimensionUnit).toBe('');
          expect(dimensionLine.hasLabel()).toBe(false);
        });

        it('編集中かどうかを示すisEditing状態を管理できる', () => {
          const dimensionLine = new DimensionLine({ x: 100, y: 100 }, { x: 300, y: 100 });

          expect(dimensionLine.isEditing).toBe(false);

          dimensionLine.startEditing();
          expect(dimensionLine.isEditing).toBe(true);

          dimensionLine.stopEditing();
          expect(dimensionLine.isEditing).toBe(false);
        });
      });

      describe('スタイル変更（6.7）', () => {
        it('線色を変更できる', () => {
          const dimensionLine = new DimensionLine({ x: 100, y: 100 }, { x: 300, y: 100 });

          dimensionLine.setStroke('#ff0000');

          expect(dimensionLine.stroke).toBe('#ff0000');
        });

        it('線の太さを変更できる', () => {
          const dimensionLine = new DimensionLine({ x: 100, y: 100 }, { x: 300, y: 100 });

          dimensionLine.setStrokeWidth(6);

          expect(dimensionLine.strokeWidth).toBe(6);
        });

        it('線色の変更はメインラインに反映される', () => {
          const dimensionLine = new DimensionLine({ x: 100, y: 100 }, { x: 300, y: 100 });

          dimensionLine.setStroke('#00ff00');

          // mockSetが呼ばれていることを確認
          expect(mockSet).toHaveBeenCalledWith('stroke', '#00ff00');
        });

        it('線色の変更は始点キャップに反映される', () => {
          const dimensionLine = new DimensionLine({ x: 100, y: 100 }, { x: 300, y: 100 });
          vi.clearAllMocks();

          dimensionLine.setStroke('#0000ff');

          // mockSetが複数回呼ばれていることを確認（メインライン、始点キャップ、終点キャップ）
          expect(mockSet).toHaveBeenCalled();
        });

        it('線色の変更は終点キャップに反映される', () => {
          const dimensionLine = new DimensionLine({ x: 100, y: 100 }, { x: 300, y: 100 });
          vi.clearAllMocks();

          dimensionLine.setStroke('#ffff00');

          expect(mockSet).toHaveBeenCalled();
        });

        it('線の太さの変更はメインラインに反映される', () => {
          const dimensionLine = new DimensionLine({ x: 100, y: 100 }, { x: 300, y: 100 });
          vi.clearAllMocks();

          dimensionLine.setStrokeWidth(8);

          expect(mockSet).toHaveBeenCalledWith('strokeWidth', 8);
        });

        it('線の太さの変更は始点キャップに反映される', () => {
          const dimensionLine = new DimensionLine({ x: 100, y: 100 }, { x: 300, y: 100 });
          vi.clearAllMocks();

          dimensionLine.setStrokeWidth(10);

          expect(mockSet).toHaveBeenCalled();
        });

        it('線の太さの変更は終点キャップに反映される', () => {
          const dimensionLine = new DimensionLine({ x: 100, y: 100 }, { x: 300, y: 100 });
          vi.clearAllMocks();

          dimensionLine.setStrokeWidth(12);

          expect(mockSet).toHaveBeenCalled();
        });

        it('スタイルを一括で変更できる', () => {
          const dimensionLine = new DimensionLine({ x: 100, y: 100 }, { x: 300, y: 100 });

          dimensionLine.setStyle({
            stroke: '#ff00ff',
            strokeWidth: 5,
          });

          expect(dimensionLine.stroke).toBe('#ff00ff');
          expect(dimensionLine.strokeWidth).toBe(5);
        });

        it('現在のスタイルを取得できる', () => {
          const dimensionLine = new DimensionLine(
            { x: 100, y: 100 },
            { x: 300, y: 100 },
            { stroke: '#123456', strokeWidth: 3 }
          );

          const style = dimensionLine.getStyle();

          expect(style.stroke).toBe('#123456');
          expect(style.strokeWidth).toBe(3);
          expect(style.capLength).toBeDefined();
        });

        it('ラベルのスタイルを個別に更新できる', () => {
          const dimensionLine = new DimensionLine({ x: 100, y: 100 }, { x: 300, y: 100 });
          dimensionLine.setDimensionWithLabel('1500', 'mm');

          dimensionLine.setLabelStyle({
            fontSize: 18,
            fontColor: '#ff0000',
          });

          const labelStyle = dimensionLine.getLabelStyle();
          expect(labelStyle.fontSize).toBe(18);
          expect(labelStyle.fontColor).toBe('#ff0000');
        });
      });

      describe('選択状態の管理', () => {
        it('選択状態をチェックできる', () => {
          const dimensionLine = new DimensionLine({ x: 100, y: 100 }, { x: 300, y: 100 });

          expect(dimensionLine.isSelected).toBe(false);
        });

        it('選択状態を設定できる', () => {
          const dimensionLine = new DimensionLine({ x: 100, y: 100 }, { x: 300, y: 100 });

          dimensionLine.setSelected(true);

          expect(dimensionLine.isSelected).toBe(true);
        });

        it('選択を解除できる', () => {
          const dimensionLine = new DimensionLine({ x: 100, y: 100 }, { x: 300, y: 100 });
          dimensionLine.setSelected(true);

          dimensionLine.setSelected(false);

          expect(dimensionLine.isSelected).toBe(false);
        });
      });

      describe('toObject()のシリアライズ', () => {
        it('スタイル情報がシリアライズに含まれる', () => {
          const dimensionLine = new DimensionLine(
            { x: 100, y: 100 },
            { x: 300, y: 100 },
            { stroke: '#ff0000', strokeWidth: 4, capLength: 15 }
          );

          const json = dimensionLine.toObject();

          expect(json.stroke).toBe('#ff0000');
          expect(json.strokeWidth).toBe(4);
          expect(json.capLength).toBe(15);
        });

        it('端点情報がシリアライズに含まれる', () => {
          const dimensionLine = new DimensionLine({ x: 50, y: 75 }, { x: 350, y: 125 });

          const json = dimensionLine.toObject();

          expect(json.startPoint).toEqual({ x: 50, y: 75 });
          expect(json.endPoint).toEqual({ x: 350, y: 125 });
        });

        it('寸法値情報がシリアライズに含まれる', () => {
          const dimensionLine = new DimensionLine({ x: 100, y: 100 }, { x: 300, y: 100 });
          dimensionLine.setDimensionWithLabel('2500', 'cm');

          const json = dimensionLine.toObject();

          expect(json.customData.dimensionValue).toBe('2500');
          expect(json.customData.dimensionUnit).toBe('cm');
        });
      });
    });
  });
});
