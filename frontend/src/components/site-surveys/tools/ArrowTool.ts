/**
 * @fileoverview 矢印ツール
 *
 * Task 15.1: 矢印ツールを実装する
 *
 * ドラッグによる矢印描画、矢印の方向（開始点→終了点）、
 * カスタムFabric.jsオブジェクト実装を行うモジュールです。
 *
 * Requirements:
 * - 7.1: 矢印ツールを選択してドラッグすると開始点から終了点へ矢印を描画する
 */

import { Group, Line, Triangle } from 'fabric';

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
 * 線の情報
 */
export interface LineInfo {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/**
 * 矢印のオプション
 */
export interface ArrowOptions {
  /** 線色（HEXカラーコード） */
  stroke: string;
  /** 線の太さ */
  strokeWidth: number;
  /** 矢じりのサイズ */
  arrowheadSize: number;
}

/**
 * 矢印のシリアライズ形式
 */
export interface ArrowJSON {
  type: 'arrow';
  startPoint: Point;
  endPoint: Point;
  stroke: string;
  strokeWidth: number;
  arrowheadSize: number;
}

// ============================================================================
// 定数定義
// ============================================================================

/**
 * デフォルトの矢印オプション
 */
export const DEFAULT_ARROW_OPTIONS: ArrowOptions = {
  stroke: '#000000',
  strokeWidth: 2,
  arrowheadSize: 10,
};

/**
 * 矢印を作成する最小距離（ピクセル）
 */
const MIN_ARROW_DISTANCE = 5;

// ============================================================================
// ヘルパー関数
// ============================================================================

/**
 * 2点間の距離を計算する
 */
function calculateDistance(p1: Point, p2: Point): number {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * 2点間の角度を計算する（度）
 */
function calculateAngle(p1: Point, p2: Point): number {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  return Math.atan2(dy, dx) * (180 / Math.PI);
}

/**
 * 角度を0〜360度の範囲に正規化
 */
function normalizeAngle(deg: number): number {
  let normalized = deg % 360;
  if (normalized < 0) {
    normalized += 360;
  }
  return normalized;
}

// ============================================================================
// Arrowクラス
// ============================================================================

/**
 * 矢印クラス
 *
 * Fabric.js Groupを拡張した矢印オブジェクト。
 * シャフトライン（始点から終点への直線）と矢じり（三角形）で構成される。
 */
export class Arrow extends Group {
  /** 始点 */
  private _startPoint: Point;

  /** 終点 */
  private _endPoint: Point;

  /** 線色 */
  declare stroke: string;

  /** 線の太さ */
  declare strokeWidth: number;

  /** 矢じりのサイズ */
  private _arrowheadSize: number;

  /** シャフトライン */
  private _shaftLine: Line;

  /** 矢じり（三角形） */
  private _arrowhead: Triangle;

  /** 矢印の長さ（ピクセル） */
  private _length: number;

  /** 矢印の角度（度） */
  private _arrowAngle: number;

  /** コントロール表示フラグ */
  declare hasControls: boolean;

  /** ボーダー表示フラグ */
  declare hasBorders: boolean;

  /** X軸移動ロック */
  declare lockMovementX: boolean;

  /** Y軸移動ロック */
  declare lockMovementY: boolean;

  /**
   * Arrowコンストラクタ
   *
   * @param startPoint 始点
   * @param endPoint 終点
   * @param options オプション
   */
  constructor(startPoint: Point, endPoint: Point, options: Partial<ArrowOptions> = {}) {
    // 設定をマージ
    const mergedOptions = { ...DEFAULT_ARROW_OPTIONS, ...options };

    // 角度と距離を計算
    const arrowAngle = calculateAngle(startPoint, endPoint);
    const length = calculateDistance(startPoint, endPoint);

    // シャフトラインを作成
    const shaftLine = new Line([startPoint.x, startPoint.y, endPoint.x, endPoint.y], {
      stroke: mergedOptions.stroke,
      strokeWidth: mergedOptions.strokeWidth,
      selectable: false,
      evented: false,
    });

    // 矢じり（三角形）を作成
    const arrowhead = new Triangle({
      left: endPoint.x,
      top: endPoint.y,
      width: mergedOptions.arrowheadSize,
      height: mergedOptions.arrowheadSize * 1.5,
      fill: mergedOptions.stroke,
      stroke: mergedOptions.stroke,
      strokeWidth: 0,
      angle: arrowAngle + 90, // 三角形は上向きがデフォルトなので90度回転
      originX: 'center',
      originY: 'center',
      selectable: false,
      evented: false,
    });

    // Groupを初期化
    super([shaftLine, arrowhead], {
      hasControls: true,
      hasBorders: true,
      lockMovementX: false,
      lockMovementY: false,
      subTargetCheck: false,
    });

    // プロパティを設定
    this._startPoint = { ...startPoint };
    this._endPoint = { ...endPoint };
    this.stroke = mergedOptions.stroke;
    this.strokeWidth = mergedOptions.strokeWidth;
    this._arrowheadSize = mergedOptions.arrowheadSize;
    this._shaftLine = shaftLine;
    this._arrowhead = arrowhead;
    this._length = length;
    this._arrowAngle = normalizeAngle(arrowAngle);
  }

  // ==========================================================================
  // ゲッター
  // ==========================================================================

  /** オブジェクトタイプを取得 */
  override get type(): string {
    return 'arrow';
  }

  /** 始点を取得 */
  get startPoint(): Point {
    return { ...this._startPoint };
  }

  /** 終点を取得 */
  get endPoint(): Point {
    return { ...this._endPoint };
  }

  /** 矢印の長さを取得（ピクセル） */
  get length(): number {
    return this._length;
  }

  /** 矢印の角度を取得（度） */
  // @ts-expect-error - Fabric.js v6ではangleがプロパティとして定義されているが、計算済みの値を返す
  override get angle(): number {
    return this._arrowAngle;
  }

  /** 矢じりのサイズを取得 */
  get arrowheadSize(): number {
    return this._arrowheadSize;
  }

  /** シャフトラインの情報を取得 */
  get shaftLine(): LineInfo {
    return {
      x1: this._startPoint.x,
      y1: this._startPoint.y,
      x2: this._endPoint.x,
      y2: this._endPoint.y,
    };
  }

  /** 矢じりが存在するかどうか */
  get hasArrowhead(): boolean {
    return this._arrowhead !== null;
  }

  /** 水平な矢印かどうか */
  get isHorizontal(): boolean {
    return Math.abs(this._startPoint.y - this._endPoint.y) < 0.001;
  }

  /** 垂直な矢印かどうか */
  get isVertical(): boolean {
    return Math.abs(this._startPoint.x - this._endPoint.x) < 0.001;
  }

  // ==========================================================================
  // 矢じり関連
  // ==========================================================================

  /**
   * 矢じりの位置を取得
   */
  getArrowheadPosition(): Point {
    return { ...this._endPoint };
  }

  /**
   * 矢じりの角度を取得（度）
   *
   * 矢じりは始点から終点への方向を向く
   */
  getArrowheadAngle(): number {
    return this._arrowAngle;
  }

  // ==========================================================================
  // 端点の更新
  // ==========================================================================

  /**
   * 始点を更新
   */
  setStartPoint(point: Point): void {
    this._startPoint = { ...point };
    this._updateGeometry();
  }

  /**
   * 終点を更新
   */
  setEndPoint(point: Point): void {
    this._endPoint = { ...point };
    this._updateGeometry();
  }

  /**
   * 両端点を取得
   */
  getEndpoints(): { start: Point; end: Point } {
    return {
      start: { ...this._startPoint },
      end: { ...this._endPoint },
    };
  }

  /**
   * 両端点を同時に更新
   */
  setEndpoints(start: Point, end: Point): void {
    this._startPoint = { ...start };
    this._endPoint = { ...end };
    this._updateGeometry();
  }

  /**
   * ジオメトリを更新（端点変更時）
   */
  private _updateGeometry(): void {
    // 角度と距離を再計算
    this._arrowAngle = normalizeAngle(calculateAngle(this._startPoint, this._endPoint));
    this._length = calculateDistance(this._startPoint, this._endPoint);

    // シャフトラインを更新
    this._shaftLine.set({
      x1: this._startPoint.x,
      y1: this._startPoint.y,
      x2: this._endPoint.x,
      y2: this._endPoint.y,
    });

    // 矢じりを更新
    this._arrowhead.set({
      left: this._endPoint.x,
      top: this._endPoint.y,
      angle: this._arrowAngle + 90,
    });

    // 座標を更新
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
    this._shaftLine.set('stroke', color);
    this._arrowhead.set('fill', color);
    this._arrowhead.set('stroke', color);
  }

  /**
   * 線の太さを更新
   */
  setStrokeWidth(width: number): void {
    this.strokeWidth = width;
    this._shaftLine.set('strokeWidth', width);
  }

  /**
   * 矢じりのサイズを更新
   */
  setArrowheadSize(size: number): void {
    this._arrowheadSize = size;
    this._arrowhead.set({
      width: size,
      height: size * 1.5,
    });
  }

  /**
   * スタイルを一括で更新
   */
  setStyle(options: Partial<ArrowOptions>): void {
    if (options.stroke !== undefined) {
      this.setStroke(options.stroke);
    }
    if (options.strokeWidth !== undefined) {
      this.setStrokeWidth(options.strokeWidth);
    }
    if (options.arrowheadSize !== undefined) {
      this.setArrowheadSize(options.arrowheadSize);
    }
  }

  /**
   * 現在のスタイルを取得
   */
  getStyle(): ArrowOptions {
    return {
      stroke: this.stroke,
      strokeWidth: this.strokeWidth,
      arrowheadSize: this._arrowheadSize,
    };
  }

  // ==========================================================================
  // シリアライズ
  // ==========================================================================

  /**
   * オブジェクトをJSON形式にシリアライズ
   */
  // @ts-expect-error - Fabric.js v6のtoObjectシグネチャとの互換性のため型を簡略化
  override toObject(): ArrowJSON {
    return {
      type: 'arrow' as const,
      startPoint: this.startPoint,
      endPoint: this.endPoint,
      stroke: this.stroke,
      strokeWidth: this.strokeWidth,
      arrowheadSize: this._arrowheadSize,
    };
  }
}

// ============================================================================
// ファクトリ関数
// ============================================================================

/**
 * 矢印を作成するファクトリ関数
 *
 * @param startPoint 始点
 * @param endPoint 終点
 * @param options オプション
 * @returns 矢印オブジェクト、または距離が短すぎる場合はnull
 */
export function createArrow(
  startPoint: Point,
  endPoint: Point,
  options?: Partial<ArrowOptions>
): Arrow | null {
  // 2点間の距離を計算
  const distance = calculateDistance(startPoint, endPoint);

  // 距離が短すぎる場合はnullを返す
  if (distance < MIN_ARROW_DISTANCE) {
    return null;
  }

  // 矢印を作成
  return new Arrow(startPoint, endPoint, options);
}
