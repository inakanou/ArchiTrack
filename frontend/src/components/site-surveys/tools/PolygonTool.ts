/**
 * @fileoverview 多角形ツール
 *
 * Task 15.4: 多角形ツールを実装する
 *
 * クリックによる頂点追加、ダブルクリックで閉じる、
 * カスタムFabric.jsオブジェクト実装を行うモジュールです。
 *
 * Requirements:
 * - 7.4: 多角形ツールを選択して頂点をクリックすると多角形を描画する
 */

import { Polygon } from 'fabric';

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
 * 多角形のオプション
 */
export interface PolygonOptions {
  /** 線色（HEXカラーコード） */
  stroke: string;
  /** 線の太さ */
  strokeWidth: number;
  /** 塗りつぶし色（HEXカラーコードまたは'transparent'） */
  fill: string;
}

/**
 * 多角形のシリアライズ形式
 */
export interface PolygonJSON {
  type: 'polygonShape';
  points: Point[];
  stroke: string;
  strokeWidth: number;
  fill: string;
}

// ============================================================================
// 定数定義
// ============================================================================

/**
 * デフォルトの多角形オプション
 */
export const DEFAULT_POLYGON_OPTIONS: PolygonOptions = {
  stroke: '#000000',
  strokeWidth: 2,
  fill: 'transparent',
};

/**
 * 多角形を作成する最小頂点数
 */
const MIN_VERTEX_COUNT = 3;

// ============================================================================
// PolygonShapeクラス
// ============================================================================

/**
 * 多角形クラス
 *
 * Fabric.js Polygonを拡張した多角形オブジェクト。
 * クリック操作で頂点を追加し、多角形を構築する。
 */
export class PolygonShape extends Polygon {
  /** 頂点配列 */
  private _vertices: Point[];

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
   * PolygonShapeコンストラクタ
   *
   * @param points 頂点の配列
   * @param options オプション
   */
  constructor(points: Point[], options: Partial<PolygonOptions> = {}) {
    // 設定をマージ
    const mergedOptions = { ...DEFAULT_POLYGON_OPTIONS, ...options };

    // Polygonを初期化
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
    this._vertices = points.map((p) => ({ ...p }));
    this.stroke = mergedOptions.stroke;
    this.strokeWidth = mergedOptions.strokeWidth;
    this.fill = mergedOptions.fill;
  }

  // ==========================================================================
  // ゲッター
  // ==========================================================================

  /** オブジェクトタイプを取得 */
  override get type(): string {
    return 'polygonShape';
  }

  /** 頂点数を取得 */
  get vertexCount(): number {
    return this._vertices.length;
  }

  /** 三角形かどうか */
  get isTriangle(): boolean {
    return this._vertices.length === 3;
  }

  /** 閉じた図形かどうか（多角形は常に閉じている） */
  get isClosed(): boolean {
    return true;
  }

  // ==========================================================================
  // 頂点操作
  // ==========================================================================

  /**
   * 全ての頂点を取得
   */
  getVertices(): Point[] {
    return this._vertices.map((p) => ({ ...p }));
  }

  /**
   * 指定されたインデックスの頂点を取得
   */
  getVertex(index: number): Point | null {
    const vertex = this._vertices[index];
    if (index < 0 || index >= this._vertices.length || !vertex) {
      return null;
    }
    return { x: vertex.x, y: vertex.y };
  }

  /**
   * 指定されたインデックスの頂点を更新
   */
  setVertex(index: number, point: Point): void {
    if (index < 0 || index >= this._vertices.length) {
      return;
    }
    this._vertices[index] = { ...point };
    this._updatePoints();
    this.setCoords();
  }

  /**
   * 全頂点を一括で更新
   */
  setVertices(points: Point[]): void {
    this._vertices = points.map((p) => ({ ...p }));
    this._updatePoints();
    this.setCoords();
  }

  /**
   * Fabric.js Polygonのpointsプロパティを更新
   */
  private _updatePoints(): void {
    this.set(
      'points',
      this._vertices.map((p) => ({ ...p }))
    );
  }

  // ==========================================================================
  // ジオメトリメソッド
  // ==========================================================================

  /**
   * バウンディングボックスを取得
   */
  getBounds(): BoundingBox {
    const firstVertex = this._vertices[0];
    if (this._vertices.length === 0 || !firstVertex) {
      return { left: 0, top: 0, right: 0, bottom: 0 };
    }

    let minX = firstVertex.x;
    let maxX = firstVertex.x;
    let minY = firstVertex.y;
    let maxY = firstVertex.y;

    for (const vertex of this._vertices) {
      if (vertex.x < minX) minX = vertex.x;
      if (vertex.x > maxX) maxX = vertex.x;
      if (vertex.y < minY) minY = vertex.y;
      if (vertex.y > maxY) maxY = vertex.y;
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
  setStyle(options: Partial<PolygonOptions>): void {
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
  getStyle(): PolygonOptions {
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
  override toObject(): PolygonJSON {
    return {
      type: 'polygonShape' as const,
      points: this.getVertices(),
      stroke: this.stroke,
      strokeWidth: this.strokeWidth,
      fill: this.fill,
    };
  }
}

// ============================================================================
// PolygonBuilderクラス
// ============================================================================

/**
 * 多角形ビルダークラス
 *
 * 対話的な多角形構築をサポートするヘルパークラス。
 * クリックごとに頂点を追加し、最終的に多角形を完成させる。
 */
export class PolygonBuilder {
  /** 構築中の頂点配列 */
  private _vertices: Point[] = [];

  /** 多角形オプション */
  private _options: Partial<PolygonOptions>;

  /**
   * PolygonBuilderコンストラクタ
   *
   * @param options 多角形のオプション
   */
  constructor(options: Partial<PolygonOptions> = {}) {
    this._options = options;
  }

  // ==========================================================================
  // ゲッター
  // ==========================================================================

  /** 現在の頂点数を取得 */
  get vertexCount(): number {
    return this._vertices.length;
  }

  /** 多角形を完成できるかどうか */
  get canFinish(): boolean {
    return this._vertices.length >= MIN_VERTEX_COUNT;
  }

  // ==========================================================================
  // 頂点操作
  // ==========================================================================

  /**
   * 頂点を追加
   */
  addVertex(point: Point): void {
    this._vertices.push({ ...point });
  }

  /**
   * 構築中の頂点を取得
   */
  getVertices(): Point[] {
    return this._vertices.map((p) => ({ ...p }));
  }

  /**
   * 最後に追加した頂点を削除
   */
  removeLastVertex(): void {
    if (this._vertices.length > 0) {
      this._vertices.pop();
    }
  }

  /**
   * 構築中の頂点をクリア
   */
  clear(): void {
    this._vertices = [];
  }

  // ==========================================================================
  // 多角形の完成
  // ==========================================================================

  /**
   * 多角形を完成させる
   *
   * @returns 多角形オブジェクト、または頂点が不足している場合はnull
   */
  finish(): PolygonShape | null {
    if (!this.canFinish) {
      return null;
    }

    const polygon = new PolygonShape(this._vertices, this._options);
    this.clear();
    return polygon;
  }
}

// ============================================================================
// ファクトリ関数
// ============================================================================

/**
 * 多角形を作成するファクトリ関数
 *
 * @param points 頂点の配列
 * @param options オプション
 * @returns 多角形オブジェクト、または頂点が不足している場合はnull
 */
export function createPolygon(
  points: Point[],
  options?: Partial<PolygonOptions>
): PolygonShape | null {
  // 頂点が3つ未満の場合はnullを返す
  if (points.length < MIN_VERTEX_COUNT) {
    return null;
  }

  // 多角形を作成
  return new PolygonShape(points, options);
}
