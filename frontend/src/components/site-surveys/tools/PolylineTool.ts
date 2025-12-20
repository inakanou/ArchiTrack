/**
 * @fileoverview 折れ線ツール
 *
 * Task 15.5: 折れ線ツールを実装する
 *
 * クリックによる点追加、ダブルクリックで終了、
 * カスタムFabric.jsオブジェクト実装を行うモジュールです。
 *
 * Requirements:
 * - 7.5: 折れ線ツールを選択して点をクリックすると折れ線を描画する
 */

import { Polyline } from 'fabric';

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
 * 折れ線のオプション
 */
export interface PolylineOptions {
  /** 線色（HEXカラーコード） */
  stroke: string;
  /** 線の太さ */
  strokeWidth: number;
  /** 塗りつぶし色（HEXカラーコードまたは'transparent'） */
  fill: string;
}

/**
 * 折れ線のシリアライズ形式
 */
export interface PolylineJSON {
  type: 'polylineShape';
  points: Point[];
  stroke: string;
  strokeWidth: number;
  fill: string;
}

// ============================================================================
// 定数定義
// ============================================================================

/**
 * デフォルトの折れ線オプション
 */
export const DEFAULT_POLYLINE_OPTIONS: PolylineOptions = {
  stroke: '#000000',
  strokeWidth: 2,
  fill: 'transparent',
};

/**
 * 折れ線を作成する最小点数
 */
const MIN_POINT_COUNT = 2;

// ============================================================================
// PolylineShapeクラス
// ============================================================================

/**
 * 折れ線クラス
 *
 * Fabric.js Polylineを拡張した折れ線オブジェクト。
 * クリック操作で点を追加し、折れ線を構築する。
 */
export class PolylineShape extends Polyline {
  /** 点配列 */
  private _points: Point[];

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
   * PolylineShapeコンストラクタ
   *
   * @param points 点の配列
   * @param options オプション
   */
  constructor(points: Point[], options: Partial<PolylineOptions> = {}) {
    // 設定をマージ
    const mergedOptions = { ...DEFAULT_POLYLINE_OPTIONS, ...options };

    // Polylineを初期化
    super(points, {
      stroke: mergedOptions.stroke,
      strokeWidth: mergedOptions.strokeWidth,
      fill: mergedOptions.fill,
      hasControls: true,
      hasBorders: true,
      lockMovementX: false,
      lockMovementY: false,
    });

    // プロパティを設定
    this._points = points.map((p) => ({ ...p }));
    this.stroke = mergedOptions.stroke;
    this.strokeWidth = mergedOptions.strokeWidth;
    this.fill = mergedOptions.fill;
  }

  // ==========================================================================
  // ゲッター
  // ==========================================================================

  /** オブジェクトタイプを取得 */
  override get type(): string {
    return 'polylineShape';
  }

  /** 点数を取得 */
  get pointCount(): number {
    return this._points.length;
  }

  /** 閉じた図形かどうか（折れ線は常に開いている） */
  get isClosed(): boolean {
    return false;
  }

  // ==========================================================================
  // 点操作
  // ==========================================================================

  /**
   * 全ての点を取得
   */
  getPoints(): Point[] {
    return this._points.map((p) => ({ ...p }));
  }

  /**
   * 指定されたインデックスの点を取得
   */
  getPoint(index: number): Point | null {
    const point = this._points[index];
    if (index < 0 || index >= this._points.length || !point) {
      return null;
    }
    return { x: point.x, y: point.y };
  }

  /**
   * 指定されたインデックスの点を更新
   */
  setPoint(index: number, point: Point): void {
    if (index < 0 || index >= this._points.length) {
      return;
    }
    this._points[index] = { ...point };
    this._updatePoints();
    this.setCoords();
  }

  /**
   * 全点を一括で更新
   */
  setPoints(points: Point[]): void {
    this._points = points.map((p) => ({ ...p }));
    this._updatePoints();
    this.setCoords();
  }

  /**
   * Fabric.js Polylineのpointsプロパティを更新
   */
  private _updatePoints(): void {
    this.set(
      'points',
      this._points.map((p) => ({ ...p }))
    );
  }

  // ==========================================================================
  // ジオメトリメソッド
  // ==========================================================================

  /**
   * バウンディングボックスを取得
   */
  getBounds(): BoundingBox {
    const firstPoint = this._points[0];
    if (this._points.length === 0 || !firstPoint) {
      return { left: 0, top: 0, right: 0, bottom: 0 };
    }

    let minX = firstPoint.x;
    let maxX = firstPoint.x;
    let minY = firstPoint.y;
    let maxY = firstPoint.y;

    for (const point of this._points) {
      if (point.x < minX) minX = point.x;
      if (point.x > maxX) maxX = point.x;
      if (point.y < minY) minY = point.y;
      if (point.y > maxY) maxY = point.y;
    }

    return {
      left: minX,
      top: minY,
      right: maxX,
      bottom: maxY,
    };
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
  setStyle(options: Partial<PolylineOptions>): void {
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
  getStyle(): PolylineOptions {
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
  override toObject(): PolylineJSON {
    return {
      type: 'polylineShape' as const,
      points: this.getPoints(),
      stroke: this.stroke,
      strokeWidth: this.strokeWidth,
      fill: this.fill,
    };
  }

  /**
   * JSONオブジェクトからPolylineShapeを復元する
   *
   * Fabric.js v6のenlivenObjectsで使用される静的メソッド。
   *
   * @param object シリアライズされたJSONオブジェクト
   * @returns 復元されたPolylineShapeインスタンス
   */
  static override fromObject(object: PolylineJSON): Promise<PolylineShape> {
    const polyline = new PolylineShape(object.points, {
      stroke: object.stroke,
      strokeWidth: object.strokeWidth,
      fill: object.fill,
    });
    return Promise.resolve(polyline);
  }
}

// ============================================================================
// PolylineBuilderクラス
// ============================================================================

/**
 * 折れ線ビルダークラス
 *
 * 対話的な折れ線構築をサポートするヘルパークラス。
 * クリックごとに点を追加し、最終的に折れ線を完成させる。
 */
export class PolylineBuilder {
  /** 構築中の点配列 */
  private _points: Point[] = [];

  /** 折れ線オプション */
  private _options: Partial<PolylineOptions>;

  /**
   * PolylineBuilderコンストラクタ
   *
   * @param options 折れ線のオプション
   */
  constructor(options: Partial<PolylineOptions> = {}) {
    this._options = options;
  }

  // ==========================================================================
  // ゲッター
  // ==========================================================================

  /** 現在の点数を取得 */
  get pointCount(): number {
    return this._points.length;
  }

  /** 折れ線を完成できるかどうか */
  get canFinish(): boolean {
    return this._points.length >= MIN_POINT_COUNT;
  }

  // ==========================================================================
  // 点操作
  // ==========================================================================

  /**
   * 点を追加
   */
  addPoint(point: Point): void {
    this._points.push({ ...point });
  }

  /**
   * 構築中の点を取得
   */
  getPoints(): Point[] {
    return this._points.map((p) => ({ ...p }));
  }

  /**
   * 最後に追加した点を削除
   */
  removeLastPoint(): void {
    if (this._points.length > 0) {
      this._points.pop();
    }
  }

  /**
   * 構築中の点をクリア
   */
  clear(): void {
    this._points = [];
  }

  // ==========================================================================
  // 折れ線の完成
  // ==========================================================================

  /**
   * 折れ線を完成させる
   *
   * @returns 折れ線オブジェクト、または点が不足している場合はnull
   */
  finish(): PolylineShape | null {
    if (!this.canFinish) {
      return null;
    }

    const polyline = new PolylineShape(this._points, this._options);
    this.clear();
    return polyline;
  }
}

// ============================================================================
// ファクトリ関数
// ============================================================================

/**
 * 折れ線を作成するファクトリ関数
 *
 * @param points 点の配列
 * @param options オプション
 * @returns 折れ線オブジェクト、または点が不足している場合はnull
 */
export function createPolyline(
  points: Point[],
  options?: Partial<PolylineOptions>
): PolylineShape | null {
  // 点が2つ未満の場合はnullを返す
  if (points.length < MIN_POINT_COUNT) {
    return null;
  }

  // 折れ線を作成
  return new PolylineShape(points, options);
}
