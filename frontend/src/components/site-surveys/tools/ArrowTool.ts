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

import { Path } from 'fabric';

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
 * 2点間の角度を計算する（ラジアン）
 */
function calculateAngleRad(p1: Point, p2: Point): number {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  return Math.atan2(dy, dx);
}

/**
 * 2点間の角度を計算する（度）
 */
function calculateAngle(p1: Point, p2: Point): number {
  return calculateAngleRad(p1, p2) * (180 / Math.PI);
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

/**
 * 矢印のSVGパスデータを生成
 *
 * @param startPoint 始点
 * @param endPoint 終点
 * @param arrowheadSize 矢じりのサイズ
 * @returns SVGパスデータ文字列
 */
function generateArrowPath(startPoint: Point, endPoint: Point, arrowheadSize: number): string {
  // 矢印の方向（ラジアン）
  const angle = calculateAngleRad(startPoint, endPoint);

  // 矢じりの両側の角度（30度 = π/6）
  const arrowAngle = Math.PI / 6;

  // 矢じりの頂点を計算
  const arrowPoint1 = {
    x: endPoint.x - arrowheadSize * Math.cos(angle - arrowAngle),
    y: endPoint.y - arrowheadSize * Math.sin(angle - arrowAngle),
  };
  const arrowPoint2 = {
    x: endPoint.x - arrowheadSize * Math.cos(angle + arrowAngle),
    y: endPoint.y - arrowheadSize * Math.sin(angle + arrowAngle),
  };

  // SVGパスを生成
  // M: 始点に移動
  // L: 終点まで線を引く
  // M: 矢じりの頂点1に移動
  // L: 終点まで線
  // L: 矢じりの頂点2まで線
  const pathData = [
    `M ${startPoint.x} ${startPoint.y}`,
    `L ${endPoint.x} ${endPoint.y}`,
    `M ${arrowPoint1.x} ${arrowPoint1.y}`,
    `L ${endPoint.x} ${endPoint.y}`,
    `L ${arrowPoint2.x} ${arrowPoint2.y}`,
  ].join(' ');

  return pathData;
}

// ============================================================================
// Arrowクラス
// ============================================================================

/**
 * 矢印クラス
 *
 * Fabric.js Pathを拡張した矢印オブジェクト。
 * シャフトライン（始点から終点への直線）と矢じりで構成される。
 */
export class Arrow extends Path {
  /** 始点 */
  private _startPoint: Point;

  /** 終点 */
  private _endPoint: Point;

  /** 矢じりのサイズ */
  private _arrowheadSize: number;

  /** 矢印の長さ（ピクセル） */
  private _length: number;

  /** 矢印の角度（度） */
  private _arrowAngle: number;

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

    // 矢印のSVGパスを生成
    const pathData = generateArrowPath(startPoint, endPoint, mergedOptions.arrowheadSize);

    // Pathを初期化
    super(pathData, {
      stroke: mergedOptions.stroke,
      strokeWidth: mergedOptions.strokeWidth,
      fill: '',
      selectable: true,
      evented: true,
      hasControls: true,
      hasBorders: true,
      lockMovementX: false,
      lockMovementY: false,
    });

    // プロパティを設定
    this._startPoint = { ...startPoint };
    this._endPoint = { ...endPoint };
    this._arrowheadSize = mergedOptions.arrowheadSize;
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
  get arrowAngle(): number {
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
    return true;
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

    // 新しいパスデータを生成
    const pathData = generateArrowPath(this._startPoint, this._endPoint, this._arrowheadSize);

    // パスを更新（Fabric.js v6のAPIを使用）
    this._setPath(pathData);

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
    this.set('stroke', color);
  }

  /**
   * 線の太さを更新
   */
  setStrokeWidth(width: number): void {
    this.set('strokeWidth', width);
  }

  /**
   * 矢じりのサイズを更新
   */
  setArrowheadSize(size: number): void {
    this._arrowheadSize = size;
    this._updateGeometry();
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
      stroke: this.stroke as string,
      strokeWidth: this.strokeWidth as number,
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
      stroke: this.stroke as string,
      strokeWidth: this.strokeWidth as number,
      arrowheadSize: this._arrowheadSize,
    };
  }

  /**
   * JSONオブジェクトからArrowを復元する
   *
   * Fabric.js v6のenlivenObjectsで使用される静的メソッド。
   *
   * @param object シリアライズされたJSONオブジェクト
   * @returns 復元されたArrowインスタンス
   */
  static override fromObject(object: ArrowJSON): Promise<Arrow> {
    const arrow = new Arrow(object.startPoint, object.endPoint, {
      stroke: object.stroke,
      strokeWidth: object.strokeWidth,
      arrowheadSize: object.arrowheadSize,
    });
    return Promise.resolve(arrow);
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
