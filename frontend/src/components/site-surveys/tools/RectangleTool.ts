/**
 * @fileoverview 四角形ツール
 *
 * Task 15.3: 四角形ツールを実装する
 *
 * ドラッグによる長方形描画、座標計算（位置、幅、高さ）、
 * カスタムFabric.jsオブジェクト実装を行うモジュールです。
 *
 * Requirements:
 * - 7.3: 四角形ツールを選択してドラッグすると長方形を描画する
 */

import { Rect } from 'fabric';

// ============================================================================
// 型定義
// ============================================================================

/**
 * 2D座標を表すポイント
 */
export interface Point {
  x: number;
  y: number;
}

/**
 * バウンディングボックス
 */
export interface BoundingBox {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * 四角形のオプション
 */
export interface RectangleOptions {
  /** 線色（HEXカラーコード） */
  stroke: string;
  /** 線の太さ */
  strokeWidth: number;
  /** 塗りつぶし色（HEXカラーコードまたは'transparent'） */
  fill: string;
}

/**
 * 四角形のシリアライズ形式
 */
export interface RectangleJSON {
  type: 'rectangleShape';
  left: number;
  top: number;
  width: number;
  height: number;
  stroke: string;
  strokeWidth: number;
  fill: string;
}

// ============================================================================
// 定数定義
// ============================================================================

/**
 * デフォルトの四角形オプション
 */
export const DEFAULT_RECTANGLE_OPTIONS: RectangleOptions = {
  stroke: '#000000',
  strokeWidth: 2,
  fill: 'transparent',
};

/**
 * 四角形を作成する最小サイズ（ピクセル）
 */
const MIN_SIZE = 5;

// ============================================================================
// RectangleShapeクラス
// ============================================================================

/**
 * 四角形クラス
 *
 * Fabric.js Rectを拡張した四角形オブジェクト。
 * ドラッグ操作で作成・リサイズが可能。
 */
export class RectangleShape extends Rect {
  /** X位置（左端） */
  private _positionX: number;

  /** Y位置（上端） */
  private _positionY: number;

  /** 幅 */
  private _shapeWidth: number;

  /** 高さ */
  private _shapeHeight: number;

  /** 線色 */
  declare stroke: string;

  /** 線の太さ */
  declare strokeWidth: number;

  /** 塗りつぶし色 */
  declare fill: string;

  /** コントロール表示フラグ */
  declare hasControls: boolean;

  /** ボーダー表示フラグ */
  declare hasBorders: boolean;

  /** X軸移動ロック */
  declare lockMovementX: boolean;

  /** Y軸移動ロック */
  declare lockMovementY: boolean;

  /**
   * RectangleShapeコンストラクタ
   *
   * @param left 左端X座標
   * @param top 上端Y座標
   * @param width 幅
   * @param height 高さ
   * @param options オプション
   */
  constructor(
    left: number,
    top: number,
    width: number,
    height: number,
    options: Partial<RectangleOptions> = {}
  ) {
    // 設定をマージ
    const mergedOptions = { ...DEFAULT_RECTANGLE_OPTIONS, ...options };

    // Rectを初期化
    super({
      left: left,
      top: top,
      width: width,
      height: height,
      stroke: mergedOptions.stroke,
      strokeWidth: mergedOptions.strokeWidth,
      fill: mergedOptions.fill,
      originX: 'left',
      originY: 'top',
      hasControls: true,
      hasBorders: true,
      lockMovementX: false,
      lockMovementY: false,
    });

    // プロパティを設定
    this._positionX = left;
    this._positionY = top;
    this._shapeWidth = width;
    this._shapeHeight = height;
    this.stroke = mergedOptions.stroke;
    this.strokeWidth = mergedOptions.strokeWidth;
    this.fill = mergedOptions.fill;
  }

  // ==========================================================================
  // ゲッター
  // ==========================================================================

  /** オブジェクトタイプを取得 */
  override get type(): string {
    return 'rectangleShape';
  }

  /** X位置（左端）を取得 */
  get positionX(): number {
    return this._positionX;
  }

  /** Y位置（上端）を取得 */
  get positionY(): number {
    return this._positionY;
  }

  /** 幅を取得 */
  get shapeWidth(): number {
    return this._shapeWidth;
  }

  /** 高さを取得 */
  get shapeHeight(): number {
    return this._shapeHeight;
  }

  /** 正方形かどうか */
  get isSquare(): boolean {
    return Math.abs(this._shapeWidth - this._shapeHeight) < 0.001;
  }

  // ==========================================================================
  // ジオメトリメソッド
  // ==========================================================================

  /**
   * バウンディングボックスを取得
   */
  getBounds(): BoundingBox {
    return {
      left: this._positionX,
      top: this._positionY,
      right: this._positionX + this._shapeWidth,
      bottom: this._positionY + this._shapeHeight,
    };
  }

  /**
   * 位置を更新
   */
  setPosition(x: number, y: number): void {
    this._positionX = x;
    this._positionY = y;
    this.set({
      left: x,
      top: y,
    });
    this.setCoords();
  }

  /**
   * 寸法を更新
   */
  setDimensions(width: number, height: number): void {
    this._shapeWidth = width;
    this._shapeHeight = height;
    this.set({
      width: width,
      height: height,
    });
    this.setCoords();
  }

  /**
   * ドラッグ座標から四角形を更新
   */
  updateFromDrag(startPoint: Point, endPoint: Point): void {
    const { left, top, width, height } = calculateGeometryFromDrag(startPoint, endPoint);
    this._positionX = left;
    this._positionY = top;
    this._shapeWidth = width;
    this._shapeHeight = height;
    this.set({
      left: left,
      top: top,
      width: width,
      height: height,
    });
    this.setCoords();
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
  setStyle(options: Partial<RectangleOptions>): void {
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
  getStyle(): RectangleOptions {
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
  override toObject(): RectangleJSON {
    return {
      type: 'rectangleShape' as const,
      // Fabric.jsの移動操作でleft/topが更新されるため、現在の位置を使用
      left: this.left ?? this._positionX,
      top: this.top ?? this._positionY,
      width: this._shapeWidth,
      height: this._shapeHeight,
      stroke: this.stroke,
      strokeWidth: this.strokeWidth,
      fill: this.fill,
    };
  }

  /**
   * JSONオブジェクトからRectangleShapeを復元する
   *
   * Fabric.js v6のenlivenObjectsで使用される静的メソッド。
   *
   * @param object シリアライズされたJSONオブジェクト
   * @returns 復元されたRectangleShapeインスタンス
   */
  static override fromObject(object: RectangleJSON): Promise<RectangleShape> {
    const rectangle = new RectangleShape(object.left, object.top, object.width, object.height, {
      stroke: object.stroke,
      strokeWidth: object.strokeWidth,
      fill: object.fill,
    });
    return Promise.resolve(rectangle);
  }
}

// ============================================================================
// ヘルパー関数
// ============================================================================

/**
 * ドラッグの開始点と終了点からジオメトリを計算
 */
function calculateGeometryFromDrag(
  startPoint: Point,
  endPoint: Point
): { left: number; top: number; width: number; height: number } {
  // バウンディングボックスの座標を計算（どの方向からドラッグしても対応）
  const left = Math.min(startPoint.x, endPoint.x);
  const right = Math.max(startPoint.x, endPoint.x);
  const top = Math.min(startPoint.y, endPoint.y);
  const bottom = Math.max(startPoint.y, endPoint.y);

  // 幅と高さを計算
  const width = right - left;
  const height = bottom - top;

  return { left, top, width, height };
}

/**
 * 領域が有効なサイズかどうかを判定
 */
function isValidSize(startPoint: Point, endPoint: Point): boolean {
  const width = Math.abs(endPoint.x - startPoint.x);
  const height = Math.abs(endPoint.y - startPoint.y);
  return width >= MIN_SIZE && height >= MIN_SIZE;
}

// ============================================================================
// ファクトリ関数
// ============================================================================

/**
 * 四角形を作成するファクトリ関数
 *
 * @param startPoint ドラッグ開始点
 * @param endPoint ドラッグ終了点
 * @param options オプション
 * @returns 四角形オブジェクト、またはサイズが小さすぎる場合はnull
 */
export function createRectangle(
  startPoint: Point,
  endPoint: Point,
  options?: Partial<RectangleOptions>
): RectangleShape | null {
  // サイズが小さすぎる場合はnullを返す
  if (!isValidSize(startPoint, endPoint)) {
    return null;
  }

  // ジオメトリを計算
  const { left, top, width, height } = calculateGeometryFromDrag(startPoint, endPoint);

  // 四角形を作成
  return new RectangleShape(left, top, width, height, options);
}
