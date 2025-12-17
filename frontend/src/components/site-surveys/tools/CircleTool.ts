/**
 * @fileoverview 円・楕円ツール
 *
 * Task 15.2: 円・楕円ツールを実装する
 *
 * ドラッグによる円/楕円描画、中心点と半径の計算、
 * カスタムFabric.jsオブジェクト実装を行うモジュールです。
 *
 * Requirements:
 * - 7.2: 円ツールを選択してドラッグすると円または楕円を描画する
 */

import { Ellipse } from 'fabric';

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
 * 円・楕円のオプション
 */
export interface CircleOptions {
  /** 線色（HEXカラーコード） */
  stroke: string;
  /** 線の太さ */
  strokeWidth: number;
  /** 塗りつぶし色（HEXカラーコードまたは'transparent'） */
  fill: string;
}

/**
 * 円・楕円のシリアライズ形式
 */
export interface CircleJSON {
  type: 'circleShape';
  centerX: number;
  centerY: number;
  rx: number;
  ry: number;
  stroke: string;
  strokeWidth: number;
  fill: string;
}

// ============================================================================
// 定数定義
// ============================================================================

/**
 * デフォルトの円・楕円オプション
 */
export const DEFAULT_CIRCLE_OPTIONS: CircleOptions = {
  stroke: '#000000',
  strokeWidth: 2,
  fill: 'transparent',
};

/**
 * 円・楕円を作成する最小サイズ（ピクセル）
 */
const MIN_SIZE = 5;

// ============================================================================
// CircleShapeクラス
// ============================================================================

/**
 * 円・楕円クラス
 *
 * Fabric.js Ellipseを拡張した円・楕円オブジェクト。
 * ドラッグ操作で作成・リサイズが可能。
 */
export class CircleShape extends Ellipse {
  /** 中心X座標 */
  private _centerX: number;

  /** 中心Y座標 */
  private _centerY: number;

  /** X方向の半径 */
  declare rx: number;

  /** Y方向の半径 */
  declare ry: number;

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
   * CircleShapeコンストラクタ
   *
   * @param centerX 中心X座標
   * @param centerY 中心Y座標
   * @param rx X方向の半径
   * @param ry Y方向の半径
   * @param options オプション
   */
  constructor(
    centerX: number,
    centerY: number,
    rx: number,
    ry: number,
    options: Partial<CircleOptions> = {}
  ) {
    // 設定をマージ
    const mergedOptions = { ...DEFAULT_CIRCLE_OPTIONS, ...options };

    // Ellipseを初期化
    super({
      left: centerX,
      top: centerY,
      rx: rx,
      ry: ry,
      stroke: mergedOptions.stroke,
      strokeWidth: mergedOptions.strokeWidth,
      fill: mergedOptions.fill,
      originX: 'center',
      originY: 'center',
      hasControls: true,
      hasBorders: true,
      lockMovementX: false,
      lockMovementY: false,
    });

    // プロパティを設定
    this._centerX = centerX;
    this._centerY = centerY;
    this.rx = rx;
    this.ry = ry;
    this.stroke = mergedOptions.stroke;
    this.strokeWidth = mergedOptions.strokeWidth;
    this.fill = mergedOptions.fill;
  }

  // ==========================================================================
  // ゲッター
  // ==========================================================================

  /** オブジェクトタイプを取得 */
  override get type(): string {
    return 'circleShape';
  }

  /** 中心X座標を取得 */
  get centerX(): number {
    return this._centerX;
  }

  /** 中心Y座標を取得 */
  get centerY(): number {
    return this._centerY;
  }

  /** 幅を取得（rx * 2） */
  getWidth(): number {
    return this.rx * 2;
  }

  /** 高さを取得（ry * 2） */
  getHeight(): number {
    return this.ry * 2;
  }

  // width/heightプロパティへのアクセスをラップ
  /** 幅（rx * 2） */
  get shapeWidth(): number {
    return this.rx * 2;
  }

  /** 高さ（ry * 2） */
  get shapeHeight(): number {
    return this.ry * 2;
  }

  /** 正円かどうか */
  get isCircle(): boolean {
    return Math.abs(this.rx - this.ry) < 0.001;
  }

  /** 楕円かどうか */
  get isEllipse(): boolean {
    return !this.isCircle;
  }

  // ==========================================================================
  // ジオメトリメソッド
  // ==========================================================================

  /**
   * バウンディングボックスを取得
   */
  getBounds(): BoundingBox {
    return {
      left: this._centerX - this.rx,
      top: this._centerY - this.ry,
      right: this._centerX + this.rx,
      bottom: this._centerY + this.ry,
    };
  }

  /**
   * 中心点を更新
   */
  setCenter(x: number, y: number): void {
    this._centerX = x;
    this._centerY = y;
    this.set({
      left: x,
      top: y,
    });
    this.setCoords();
  }

  /**
   * 半径を更新
   */
  setRadii(rx: number, ry: number): void {
    this.rx = rx;
    this.ry = ry;
    this.set({
      rx: rx,
      ry: ry,
    });
    this.setCoords();
  }

  /**
   * ドラッグ座標から円・楕円を更新
   */
  updateFromDrag(startPoint: Point, endPoint: Point): void {
    const { centerX, centerY, rx, ry } = calculateGeometryFromDrag(startPoint, endPoint);
    this._centerX = centerX;
    this._centerY = centerY;
    this.rx = rx;
    this.ry = ry;
    this.set({
      left: centerX,
      top: centerY,
      rx: rx,
      ry: ry,
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
  setStyle(options: Partial<CircleOptions>): void {
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
  getStyle(): CircleOptions {
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
  override toObject(): CircleJSON {
    return {
      type: 'circleShape' as const,
      centerX: this._centerX,
      centerY: this._centerY,
      rx: this.rx,
      ry: this.ry,
      stroke: this.stroke,
      strokeWidth: this.strokeWidth,
      fill: this.fill,
    };
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
): { centerX: number; centerY: number; rx: number; ry: number } {
  // バウンディングボックスの座標を計算（どの方向からドラッグしても対応）
  const left = Math.min(startPoint.x, endPoint.x);
  const right = Math.max(startPoint.x, endPoint.x);
  const top = Math.min(startPoint.y, endPoint.y);
  const bottom = Math.max(startPoint.y, endPoint.y);

  // 中心点と半径を計算
  const centerX = (left + right) / 2;
  const centerY = (top + bottom) / 2;
  const rx = (right - left) / 2;
  const ry = (bottom - top) / 2;

  return { centerX, centerY, rx, ry };
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
 * 円・楕円を作成するファクトリ関数
 *
 * @param startPoint ドラッグ開始点
 * @param endPoint ドラッグ終了点
 * @param options オプション
 * @returns 円・楕円オブジェクト、またはサイズが小さすぎる場合はnull
 */
export function createCircle(
  startPoint: Point,
  endPoint: Point,
  options?: Partial<CircleOptions>
): CircleShape | null {
  // サイズが小さすぎる場合はnullを返す
  if (!isValidSize(startPoint, endPoint)) {
    return null;
  }

  // ジオメトリを計算
  const { centerX, centerY, rx, ry } = calculateGeometryFromDrag(startPoint, endPoint);

  // 円・楕円を作成
  return new CircleShape(centerX, centerY, rx, ry, options);
}
