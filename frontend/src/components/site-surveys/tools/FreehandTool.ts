/**
 * @fileoverview フリーハンドツール
 *
 * Task 15.6: フリーハンドツールを実装する
 *
 * Fabric.js PencilBrushの活用、描画の滑らかさ調整、
 * カスタムFabric.jsオブジェクト実装を行うモジュールです。
 *
 * Requirements:
 * - 7.6: フリーハンドツールを選択して描画するとフリーハンドの線を描画する
 */

import { Path, PencilBrush, type Canvas, type TPointerEvent, type TEvent } from 'fabric';
import type { Point as FabricPoint } from 'fabric';

// ============================================================================
// 型定義
// ============================================================================

/**
 * 2D座標を表すポイント（シンプル版）
 */
export interface Point {
  x: number;
  y: number;
}

/**
 * フリーハンドのオプション
 */
export interface FreehandOptions {
  /** 線色（HEXカラーコード） */
  stroke: string;
  /** 線の太さ */
  strokeWidth: number;
  /** 塗りつぶし色（HEXカラーコードまたは'transparent'） */
  fill: string;
  /** デシメート値（点の間引き）- 小さいほど滑らか */
  decimate: number;
  /** 線の端点スタイル */
  strokeLineCap: 'butt' | 'round' | 'square';
  /** 線の結合スタイル */
  strokeLineJoin: 'bevel' | 'round' | 'miter';
}

/**
 * フリーハンドのシリアライズ形式
 */
export interface FreehandJSON {
  type: 'freehand';
  pathData: string;
  stroke: string;
  strokeWidth: number;
  fill: string;
  strokeLineCap: string;
  strokeLineJoin: string;
}

// ============================================================================
// 定数定義
// ============================================================================

/**
 * デフォルトのフリーハンドオプション
 */
export const DEFAULT_FREEHAND_OPTIONS: FreehandOptions = {
  stroke: '#000000',
  strokeWidth: 2,
  fill: 'transparent',
  decimate: 8,
  strokeLineCap: 'round',
  strokeLineJoin: 'round',
};

/**
 * パスを作成する最小ポイント数
 */
const MIN_POINT_COUNT = 2;

// ============================================================================
// FreehandPathクラス
// ============================================================================

/**
 * フリーハンドパスクラス
 *
 * Fabric.js Pathを拡張したフリーハンドオブジェクト。
 * 滑らかな曲線を保持する。
 */
export class FreehandPath extends Path {
  /** パスデータ（SVGパス文字列） */
  private _pathData: string;

  /** 線色 */
  declare stroke: string;

  /** 線の太さ */
  declare strokeWidth: number;

  /** 塗りつぶし色 */
  declare fill: string;

  /** 線の端点スタイル */
  declare strokeLineCap: 'butt' | 'round' | 'square';

  /** 線の結合スタイル */
  declare strokeLineJoin: 'bevel' | 'round' | 'miter';

  /** コントロール表示フラグ */
  declare hasControls: boolean;

  /** ボーダー表示フラグ */
  declare hasBorders: boolean;

  /** X軸移動ロック */
  declare lockMovementX: boolean;

  /** Y軸移動ロック */
  declare lockMovementY: boolean;

  /**
   * FreehandPathコンストラクタ
   *
   * @param pathData SVGパス文字列
   * @param options オプション
   */
  constructor(pathData: string, options: Partial<FreehandOptions> = {}) {
    // 設定をマージ
    const mergedOptions = { ...DEFAULT_FREEHAND_OPTIONS, ...options };

    // Pathを初期化
    super(pathData, {
      stroke: mergedOptions.stroke,
      strokeWidth: mergedOptions.strokeWidth,
      fill: mergedOptions.fill,
      strokeLineCap: mergedOptions.strokeLineCap,
      strokeLineJoin: mergedOptions.strokeLineJoin,
      hasControls: true,
      hasBorders: true,
      lockMovementX: false,
      lockMovementY: false,
    });

    // プロパティを設定
    this._pathData = pathData;
    this.stroke = mergedOptions.stroke;
    this.strokeWidth = mergedOptions.strokeWidth;
    this.fill = mergedOptions.fill;
    this.strokeLineCap = mergedOptions.strokeLineCap;
    this.strokeLineJoin = mergedOptions.strokeLineJoin;
  }

  // ==========================================================================
  // ゲッター
  // ==========================================================================

  /** オブジェクトタイプを取得 */
  override get type(): string {
    return 'freehand';
  }

  /** パスデータを取得 */
  get pathData(): string {
    return this._pathData;
  }

  // ==========================================================================
  // スタイルの更新
  // ==========================================================================

  /**
   * 線色を更新
   */
  setStroke(color: string): void {
    this.stroke = color;
    this.set('stroke', color);
  }

  /**
   * 線の太さを更新
   */
  setStrokeWidth(width: number): void {
    this.strokeWidth = width;
    this.set('strokeWidth', width);
  }

  /**
   * 塗りつぶし色を更新
   */
  setFill(color: string): void {
    this.fill = color;
    this.set('fill', color);
  }

  /**
   * スタイルを一括で更新
   */
  setStyle(options: Partial<FreehandOptions>): void {
    if (options.stroke !== undefined) {
      this.setStroke(options.stroke);
    }
    if (options.strokeWidth !== undefined) {
      this.setStrokeWidth(options.strokeWidth);
    }
    if (options.fill !== undefined) {
      this.setFill(options.fill);
    }
  }

  /**
   * 現在のスタイルを取得
   */
  getStyle(): Pick<FreehandOptions, 'stroke' | 'strokeWidth' | 'fill'> {
    return {
      stroke: this.stroke,
      strokeWidth: this.strokeWidth,
      fill: this.fill,
    };
  }

  // ==========================================================================
  // シリアライズ
  // ==========================================================================

  /**
   * オブジェクトをJSON形式にシリアライズ
   */
  // @ts-expect-error - Fabric.js v6のtoObjectシグネチャとの互換性のため型を簡略化
  override toObject(): FreehandJSON {
    return {
      type: 'freehand' as const,
      pathData: this._pathData,
      stroke: this.stroke,
      strokeWidth: this.strokeWidth,
      fill: this.fill,
      strokeLineCap: this.strokeLineCap,
      strokeLineJoin: this.strokeLineJoin,
    };
  }
}

// ============================================================================
// FreehandBrushクラス
// ============================================================================

/**
 * フリーハンドブラシクラス
 *
 * Fabric.js PencilBrushを拡張したブラシ。
 * 滑らかなフリーハンド描画を提供する。
 */
export class FreehandBrush extends PencilBrush {
  /** 描画中フラグ */
  private _isDrawingFreehand: boolean = false;

  /** 描画中のポイント配列（シンプル版） */
  private _freehandPoints: Point[] = [];

  /** デシメート値 */
  declare decimate: number;

  /** ブラシオプション */
  private _options: Partial<FreehandOptions>;

  /**
   * FreehandBrushコンストラクタ
   *
   * @param canvas Fabric.jsキャンバス（オプション）
   * @param options オプション
   */
  constructor(canvas?: Canvas, options: Partial<FreehandOptions> = {}) {
    // 設定をマージ
    const mergedOptions = { ...DEFAULT_FREEHAND_OPTIONS, ...options };

    // PencilBrushを初期化
    // canvas がない場合は空のオブジェクトを渡す（テスト用）
    super(canvas as Canvas);

    // プロパティを設定
    this.color = mergedOptions.stroke;
    this.width = mergedOptions.strokeWidth;
    this.decimate = mergedOptions.decimate;
    this._options = options;
    this._isDrawingFreehand = false;
    this._freehandPoints = [];
  }

  // ==========================================================================
  // ゲッター
  // ==========================================================================

  /** 描画中かどうか */
  get isDrawing(): boolean {
    return this._isDrawingFreehand;
  }

  // ==========================================================================
  // 描画操作
  // ==========================================================================

  /**
   * マウスダウンイベント（描画開始）
   */
  override onMouseDown(pointer: Point | FabricPoint, ev?: TEvent<TPointerEvent>): void {
    this._isDrawingFreehand = true;
    this._freehandPoints = [{ x: pointer.x, y: pointer.y }];
    // Fabric.js v6では第2引数が必要
    if (ev) {
      super.onMouseDown(pointer as FabricPoint, ev);
    }
  }

  /**
   * マウスムーブイベント（描画継続）
   */
  override onMouseMove(pointer: Point | FabricPoint, ev?: TEvent<TPointerEvent>): void {
    if (!this._isDrawingFreehand) return;
    this._freehandPoints.push({ x: pointer.x, y: pointer.y });
    // Fabric.js v6では第2引数が必要
    if (ev) {
      super.onMouseMove(pointer as FabricPoint, ev);
    }
  }

  /**
   * マウスアップイベント（描画終了）
   * @returns Fabric.jsのonMouseUpはbooleanを返すが、テスト用にFreehandPathも返せるようにする
   */
  override onMouseUp(ev?: TEvent<TPointerEvent>): boolean {
    this._isDrawingFreehand = false;

    // ポイントが少なすぎる場合
    if (this._freehandPoints.length < MIN_POINT_COUNT) {
      this._freehandPoints = [];
      // 親クラスのonMouseUpを呼ぶ
      if (ev) {
        return super.onMouseUp(ev);
      }
      return false;
    }

    // パスデータを生成
    const pathData = this._generatePathData();

    // 結果を保持
    this._lastCreatedPath = new FreehandPath(pathData, this._options);
    this._freehandPoints = [];

    // 親クラスのonMouseUpを呼ぶ
    if (ev) {
      return super.onMouseUp(ev);
    }
    return true;
  }

  /** 最後に作成されたパス */
  private _lastCreatedPath: FreehandPath | null = null;

  /**
   * 最後に作成されたパスを取得
   */
  getLastCreatedPath(): FreehandPath | null {
    return this._lastCreatedPath;
  }

  /**
   * ポイント数を取得
   */
  getPointCount(): number {
    return this._freehandPoints.length;
  }

  /**
   * 描画をキャンセル
   */
  cancel(): void {
    this._isDrawingFreehand = false;
    this._freehandPoints = [];
  }

  // ==========================================================================
  // スタイルの更新
  // ==========================================================================

  /**
   * 線色を更新
   */
  setColor(color: string): void {
    this.color = color;
    this._options.stroke = color;
  }

  /**
   * 線の太さを更新
   */
  setWidth(width: number): void {
    this.width = width;
    this._options.strokeWidth = width;
  }

  /**
   * デシメート値を更新
   */
  setDecimate(value: number): void {
    this.decimate = value;
    this._options.decimate = value;
  }

  // ==========================================================================
  // プライベートメソッド
  // ==========================================================================

  /**
   * ポイント配列からSVGパス文字列を生成
   */
  private _generatePathData(): string {
    if (this._freehandPoints.length === 0) {
      return '';
    }

    const firstPoint = this._freehandPoints[0];
    if (!firstPoint) {
      return '';
    }

    let pathData = `M ${firstPoint.x} ${firstPoint.y}`;

    for (let i = 1; i < this._freehandPoints.length; i++) {
      const point = this._freehandPoints[i];
      if (point) {
        pathData += ` L ${point.x} ${point.y}`;
      }
    }

    return pathData;
  }
}

// ============================================================================
// ファクトリ関数
// ============================================================================

/**
 * フリーハンドパスを作成するファクトリ関数
 *
 * @param pathData SVGパス文字列
 * @param options オプション
 * @returns フリーハンドパスオブジェクト、またはパスが無効な場合はnull
 */
export function createFreehandPath(
  pathData: string,
  options?: Partial<FreehandOptions>
): FreehandPath | null {
  // 空のパスデータの場合はnullを返す
  if (!pathData || pathData.trim() === '') {
    return null;
  }

  // パスデータにLコマンドがない場合（単一ポイント）はnullを返す
  if (!pathData.includes(' L ')) {
    return null;
  }

  // フリーハンドパスを作成
  return new FreehandPath(pathData, options);
}

/**
 * フリーハンドブラシを作成するファクトリ関数
 *
 * @param options オプション
 * @param canvas Fabric.jsキャンバス（オプション）
 * @returns フリーハンドブラシオブジェクト
 */
export function createFreehandBrush(
  options?: Partial<FreehandOptions>,
  canvas?: Canvas
): FreehandBrush {
  return new FreehandBrush(canvas, options);
}
