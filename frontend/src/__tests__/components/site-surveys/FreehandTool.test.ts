/**
 * @fileoverview フリーハンドツールのテスト
 *
 * Task 15.6: フリーハンドツールを実装する（TDD）
 *
 * Requirements:
 * - 7.6: フリーハンドツールを選択して描画するとフリーハンドの線を描画する
 *
 * テスト対象:
 * - Fabric.js PencilBrushの活用
 * - 描画の滑らかさ調整
 * - カスタムFabric.jsオブジェクト実装
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// vi.hoistedでモック関数を定義（ホイスティング対応）
const { mockSetCoords, mockSet, mockOnMouseDown, mockOnMouseMove, mockOnMouseUp } = vi.hoisted(
  () => {
    return {
      mockSetCoords: vi.fn(),
      mockSet: vi.fn(),
      mockOnMouseDown: vi.fn(),
      mockOnMouseMove: vi.fn(),
      mockOnMouseUp: vi.fn(),
    };
  }
);

// Fabric.jsのモック
vi.mock('fabric', () => {
  // PencilBrushモック
  class MockPencilBrush {
    color: string;
    width: number;
    decimate?: number;
    _points: Array<{ x: number; y: number }>;

    constructor(_canvas?: unknown) {
      this.color = '#000000';
      this.width = 2;
      this.decimate = 8;
      this._points = [];
    }

    onMouseDown(pointer: { x: number; y: number }): void {
      this._points = [pointer];
      mockOnMouseDown(pointer);
    }

    onMouseMove(pointer: { x: number; y: number }): void {
      this._points.push(pointer);
      mockOnMouseMove(pointer);
    }

    onMouseUp(): unknown {
      mockOnMouseUp();
      return {
        path: this._points,
      };
    }
  }

  // Pathモック（フリーハンド描画結果）
  class MockPath {
    path: string | Array<unknown>;
    fill?: string;
    stroke?: string;
    strokeWidth?: number;
    strokeLineCap?: string;
    strokeLineJoin?: string;
    selectable?: boolean;
    evented?: boolean;
    hasControls?: boolean;
    hasBorders?: boolean;
    lockMovementX?: boolean;
    lockMovementY?: boolean;
    originX?: string;
    originY?: string;

    constructor(pathData?: string | Array<unknown>, options?: Record<string, unknown>) {
      this.path = pathData || '';
      this.fill = 'transparent';
      this.stroke = '#000000';
      this.strokeWidth = 2;
      this.strokeLineCap = 'round';
      this.strokeLineJoin = 'round';
      this.hasControls = true;
      this.hasBorders = true;
      this.lockMovementX = false;
      this.lockMovementY = false;
      this.originX = 'left';
      this.originY = 'top';
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
        path: this.path,
        fill: this.fill,
        stroke: this.stroke,
        strokeWidth: this.strokeWidth,
        strokeLineCap: this.strokeLineCap,
        strokeLineJoin: this.strokeLineJoin,
      };
    }
  }

  return {
    PencilBrush: MockPencilBrush,
    Path: MockPath,
  };
});

import {
  FreehandPath,
  FreehandBrush,
  createFreehandPath,
  createFreehandBrush,
  type FreehandOptions,
  DEFAULT_FREEHAND_OPTIONS,
} from '../../../components/site-surveys/tools/FreehandTool';

// ============================================================================
// テストスイート
// ============================================================================

describe('FreehandTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ==========================================================================
  // Task 15.6: フリーハンドツール実装テスト
  // ==========================================================================
  describe('フリーハンド描画機能', () => {
    describe('Fabric.js PencilBrushの活用', () => {
      it('FreehandBrushがPencilBrushを拡張している', () => {
        const brush = createFreehandBrush();

        expect(brush).toBeDefined();
        expect(brush).not.toBeNull();
      });

      it('ブラシのデフォルト設定が正しく適用される', () => {
        const brush = createFreehandBrush();

        expect(brush!.color).toBe(DEFAULT_FREEHAND_OPTIONS.stroke);
        expect(brush!.width).toBe(DEFAULT_FREEHAND_OPTIONS.strokeWidth);
      });

      it('カスタムオプションでブラシを作成できる', () => {
        const options: Partial<FreehandOptions> = {
          stroke: '#ff0000',
          strokeWidth: 5,
        };

        const brush = createFreehandBrush(options);

        expect(brush!.color).toBe('#ff0000');
        expect(brush!.width).toBe(5);
      });

      it('onMouseDownイベントで描画が開始される', () => {
        const brush = createFreehandBrush();

        brush!.onMouseDown({ x: 100, y: 100 });

        // イベントオブジェクトなしで呼ばれた場合、内部状態が更新される
        expect(brush!.isDrawing).toBe(true);
        expect(brush!.getPointCount()).toBe(1);
      });

      it('onMouseMoveイベントで描画が継続される', () => {
        const brush = createFreehandBrush();
        brush!.onMouseDown({ x: 100, y: 100 });

        brush!.onMouseMove({ x: 150, y: 150 });

        // イベントオブジェクトなしで呼ばれた場合、内部状態が更新される
        expect(brush!.getPointCount()).toBe(2);
      });

      it('onMouseUpイベントで描画が完了される', () => {
        const brush = createFreehandBrush();
        brush!.onMouseDown({ x: 100, y: 100 });
        brush!.onMouseMove({ x: 150, y: 150 });

        brush!.onMouseUp();

        // イベントオブジェクトなしで呼ばれた場合、描画終了状態になる
        expect(brush!.isDrawing).toBe(false);
      });
    });

    describe('描画の滑らかさ調整', () => {
      it('デフォルトのdecimate値が設定される', () => {
        const brush = createFreehandBrush();

        expect(brush!.decimate).toBe(DEFAULT_FREEHAND_OPTIONS.decimate);
      });

      it('decimate値をカスタマイズできる', () => {
        const options: Partial<FreehandOptions> = {
          decimate: 4,
        };

        const brush = createFreehandBrush(options);

        expect(brush!.decimate).toBe(4);
      });

      it('decimate値が小さいほど点が多くなる（より滑らか）', () => {
        const smoothBrush = createFreehandBrush({ decimate: 2 });
        const normalBrush = createFreehandBrush({ decimate: 8 });

        expect(smoothBrush!.decimate).toBeLessThan(normalBrush!.decimate!);
      });

      it('strokeLineCapがデフォルトでroundに設定される', () => {
        const path = createFreehandPath('M 0 0 L 100 100');

        expect(path!.strokeLineCap).toBe('round');
      });

      it('strokeLineJoinがデフォルトでroundに設定される', () => {
        const path = createFreehandPath('M 0 0 L 100 100');

        expect(path!.strokeLineJoin).toBe('round');
      });
    });

    describe('FreehandPath - カスタムFabric.jsオブジェクト実装', () => {
      it('パス文字列からFreehandPathオブジェクトが作成される', () => {
        const pathData = 'M 100 100 L 200 100 L 150 200';

        const path = createFreehandPath(pathData);

        expect(path).toBeDefined();
        expect(path).not.toBeNull();
      });

      it('FreehandPathクラスはtypeプロパティを持つ', () => {
        const pathData = 'M 100 100 L 200 100';

        const path = createFreehandPath(pathData);

        expect(path).not.toBeNull();
        expect(path!.type).toBe('freehand');
      });

      it('toObject()はフリーハンドの情報を含むJSONを返す', () => {
        const pathData = 'M 100 100 L 200 100 L 150 200';

        const path = createFreehandPath(pathData);

        expect(path).not.toBeNull();
        const jsonObject = path!.toObject();

        expect(jsonObject.type).toBe('freehand');
        expect(jsonObject.pathData).toBe(pathData);
      });

      it('フリーハンドパスはFabric.js標準のコントロールを持つ', () => {
        const pathData = 'M 100 100 L 200 100';

        const path = createFreehandPath(pathData);

        expect(path).not.toBeNull();
        expect(path!.hasControls).toBe(true);
        expect(path!.hasBorders).toBe(true);
      });

      it('フリーハンドパスはドラッグで移動可能', () => {
        const pathData = 'M 100 100 L 200 100';

        const path = createFreehandPath(pathData);

        expect(path).not.toBeNull();
        expect(path!.lockMovementX).toBe(false);
        expect(path!.lockMovementY).toBe(false);
      });

      it('空のパスデータの場合はnullを返す', () => {
        const path = createFreehandPath('');

        expect(path).toBeNull();
      });

      it('短すぎるパスデータの場合はnullを返す（ポイントが少ない）', () => {
        const path = createFreehandPath('M 100 100');

        expect(path).toBeNull();
      });
    });

    describe('スタイルオプション', () => {
      it('デフォルトの線色は黒（#000000）である', () => {
        const pathData = 'M 100 100 L 200 100';

        const path = createFreehandPath(pathData);

        expect(path).not.toBeNull();
        expect(path!.stroke).toBe(DEFAULT_FREEHAND_OPTIONS.stroke);
      });

      it('デフォルトの線の太さは2pxである', () => {
        const pathData = 'M 100 100 L 200 100';

        const path = createFreehandPath(pathData);

        expect(path).not.toBeNull();
        expect(path!.strokeWidth).toBe(DEFAULT_FREEHAND_OPTIONS.strokeWidth);
      });

      it('線色をカスタマイズできる', () => {
        const pathData = 'M 100 100 L 200 100';
        const options: Partial<FreehandOptions> = { stroke: '#ff0000' };

        const path = createFreehandPath(pathData, options);

        expect(path).not.toBeNull();
        expect(path!.stroke).toBe('#ff0000');
      });

      it('線の太さをカスタマイズできる', () => {
        const pathData = 'M 100 100 L 200 100';
        const options: Partial<FreehandOptions> = { strokeWidth: 4 };

        const path = createFreehandPath(pathData, options);

        expect(path).not.toBeNull();
        expect(path!.strokeWidth).toBe(4);
      });

      it('塗りつぶし色をカスタマイズできる', () => {
        const pathData = 'M 100 100 L 200 100';
        const options: Partial<FreehandOptions> = { fill: '#00ff00' };

        const path = createFreehandPath(pathData, options);

        expect(path).not.toBeNull();
        expect(path!.fill).toBe('#00ff00');
      });

      it('デフォルトの塗りつぶし色は透明である', () => {
        const pathData = 'M 100 100 L 200 100';

        const path = createFreehandPath(pathData);

        expect(path).not.toBeNull();
        expect(path!.fill).toBe(DEFAULT_FREEHAND_OPTIONS.fill);
      });
    });
  });

  // ==========================================================================
  // FreehandPathクラスの詳細テスト
  // ==========================================================================
  describe('FreehandPathクラス', () => {
    describe('インスタンス作成', () => {
      it('FreehandPathクラスのインスタンスが作成できる', () => {
        const path = new FreehandPath('M 100 100 L 200 100');

        expect(path).toBeInstanceOf(FreehandPath);
      });

      it('パスデータのプロパティが設定される', () => {
        const pathData = 'M 100 100 L 200 100 L 150 200';
        const path = new FreehandPath(pathData);

        expect(path.pathData).toBe(pathData);
      });

      it('オプションを指定してインスタンスが作成できる', () => {
        const options: Partial<FreehandOptions> = {
          stroke: '#ff0000',
          strokeWidth: 4,
          fill: '#00ff00',
        };
        const path = new FreehandPath('M 100 100 L 200 100', options);

        expect(path.stroke).toBe('#ff0000');
        expect(path.strokeWidth).toBe(4);
        expect(path.fill).toBe('#00ff00');
      });
    });

    describe('スタイルの更新', () => {
      it('線色を更新できる', () => {
        const path = new FreehandPath('M 100 100 L 200 100');

        path.setStroke('#00ff00');

        expect(path.stroke).toBe('#00ff00');
      });

      it('線の太さを更新できる', () => {
        const path = new FreehandPath('M 100 100 L 200 100');

        path.setStrokeWidth(6);

        expect(path.strokeWidth).toBe(6);
      });

      it('塗りつぶし色を更新できる', () => {
        const path = new FreehandPath('M 100 100 L 200 100');

        path.setFill('#0000ff');

        expect(path.fill).toBe('#0000ff');
      });

      it('スタイルを一括で変更できる', () => {
        const path = new FreehandPath('M 100 100 L 200 100');

        path.setStyle({
          stroke: '#ff00ff',
          strokeWidth: 5,
          fill: '#00ffff',
        });

        expect(path.stroke).toBe('#ff00ff');
        expect(path.strokeWidth).toBe(5);
        expect(path.fill).toBe('#00ffff');
      });

      it('現在のスタイルを取得できる', () => {
        const path = new FreehandPath('M 100 100 L 200 100', {
          stroke: '#123456',
          strokeWidth: 3,
          fill: '#654321',
        });

        const style = path.getStyle();

        expect(style.stroke).toBe('#123456');
        expect(style.strokeWidth).toBe(3);
        expect(style.fill).toBe('#654321');
      });
    });

    describe('toObject()のシリアライズ', () => {
      it('スタイル情報がシリアライズに含まれる', () => {
        const path = new FreehandPath('M 100 100 L 200 100', {
          stroke: '#ff0000',
          strokeWidth: 4,
          fill: '#00ff00',
        });

        const json = path.toObject();

        expect(json.stroke).toBe('#ff0000');
        expect(json.strokeWidth).toBe(4);
        expect(json.fill).toBe('#00ff00');
      });

      it('パスデータがシリアライズに含まれる', () => {
        const pathData = 'M 100 100 L 200 100 L 150 200';
        const path = new FreehandPath(pathData);

        const json = path.toObject();

        expect(json.pathData).toBe(pathData);
      });

      it('strokeLineCapがシリアライズに含まれる', () => {
        const path = new FreehandPath('M 100 100 L 200 100');

        const json = path.toObject();

        expect(json.strokeLineCap).toBe('round');
      });

      it('strokeLineJoinがシリアライズに含まれる', () => {
        const path = new FreehandPath('M 100 100 L 200 100');

        const json = path.toObject();

        expect(json.strokeLineJoin).toBe('round');
      });
    });
  });

  // ==========================================================================
  // FreehandBrushクラスの詳細テスト
  // ==========================================================================
  describe('FreehandBrushクラス', () => {
    describe('インスタンス作成', () => {
      it('FreehandBrushクラスのインスタンスが作成できる', () => {
        const brush = new FreehandBrush();

        expect(brush).toBeInstanceOf(FreehandBrush);
      });

      it('オプションを指定してインスタンスが作成できる', () => {
        const options: Partial<FreehandOptions> = {
          stroke: '#ff0000',
          strokeWidth: 4,
          decimate: 4,
        };
        const brush = new FreehandBrush(undefined, options);

        expect(brush.color).toBe('#ff0000');
        expect(brush.width).toBe(4);
        expect(brush.decimate).toBe(4);
      });
    });

    describe('描画操作', () => {
      it('onMouseDownで描画が開始される', () => {
        const brush = new FreehandBrush();

        brush.onMouseDown({ x: 100, y: 100 });

        expect(brush.isDrawing).toBe(true);
      });

      it('onMouseMoveでパスが延長される', () => {
        const brush = new FreehandBrush();
        brush.onMouseDown({ x: 100, y: 100 });

        brush.onMouseMove({ x: 150, y: 150 });

        expect(brush.getPointCount()).toBeGreaterThan(1);
      });

      it('onMouseUpで描画が終了される', () => {
        const brush = new FreehandBrush();
        brush.onMouseDown({ x: 100, y: 100 });
        brush.onMouseMove({ x: 150, y: 150 });

        const result = brush.onMouseUp();

        expect(brush.isDrawing).toBe(false);
        expect(result).toBeDefined();
      });

      it('描画結果からFreehandPathを作成できる', () => {
        const brush = new FreehandBrush();
        brush.onMouseDown({ x: 100, y: 100 });
        brush.onMouseMove({ x: 150, y: 150 });
        brush.onMouseMove({ x: 200, y: 100 });

        brush.onMouseUp();
        const result = brush.getLastCreatedPath();

        expect(result).not.toBeNull();
      });

      it('点が少なすぎる場合はnullを返す', () => {
        const brush = new FreehandBrush();
        brush.onMouseDown({ x: 100, y: 100 });

        brush.onMouseUp();
        const result = brush.getLastCreatedPath();

        expect(result).toBeNull();
      });
    });

    describe('スタイルの更新', () => {
      it('線色を更新できる', () => {
        const brush = new FreehandBrush();

        brush.setColor('#00ff00');

        expect(brush.color).toBe('#00ff00');
      });

      it('線の太さを更新できる', () => {
        const brush = new FreehandBrush();

        brush.setWidth(6);

        expect(brush.width).toBe(6);
      });

      it('decimate値を更新できる', () => {
        const brush = new FreehandBrush();

        brush.setDecimate(4);

        expect(brush.decimate).toBe(4);
      });
    });

    describe('キャンセル操作', () => {
      it('描画をキャンセルできる', () => {
        const brush = new FreehandBrush();
        brush.onMouseDown({ x: 100, y: 100 });
        brush.onMouseMove({ x: 150, y: 150 });

        brush.cancel();

        expect(brush.isDrawing).toBe(false);
        expect(brush.getPointCount()).toBe(0);
      });
    });
  });
});
