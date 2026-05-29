/**
 * @fileoverview 折れ線ツール
 *
 * Task 15.5: 折れ線ツールを実装する
 * Task 80.1: Polyline クラスを Group ベースへ再設計（白縁取りダブルストローク）
 *
 * クリックによる点追加、ダブルクリックで終了、
 * 白縁取り付き Group 構造のカスタム Fabric.js オブジェクト実装を行うモジュールです。
 *
 * Requirements:
 * - 7.5: 折れ線ツールを選択して点をクリックすると折れ線を描画する
 * - 32.1: 矢印以外の形状にも白色の縁取り線を付与する
 * - 32.2: 白縁取り線幅を本体線幅の 1.5 倍以上に設定する
 * - 32.3: 本体色を変更しても白縁取りは白のまま維持する
 * - 32.4: 移動・リサイズ・回転・形状変形（端点移動・頂点追加/削除等）時に本体と同期して白縁取りを変形する
 *
 * @requirement site-survey/REQ-26.1
 * @requirement site-survey/REQ-26.2
 * @requirement site-survey/REQ-26.5
 * @requirement site-survey/REQ-32.1
 * @requirement site-survey/REQ-32.2
 * @requirement site-survey/REQ-32.3
 * @requirement site-survey/REQ-32.4
 */

import { Group, Polyline } from 'fabric';

import { ANNOTATION_DEFAULTS, type ShapeOutlineAttribute } from '../annotation-style-tokens';

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
 *
 * Task 80.2 で `outline?: ShapeOutlineAttribute` を追加予定（Req 32.6, 32.7）。
 * 現時点（Task 80.1）は Group 化のみで、outline 属性のシリアライズは未対応。
 */
export interface PolylineJSON {
  type: 'polylineShape';
  points: Point[];
  stroke: string;
  strokeWidth: number;
  fill: string;
  /** 移動後の位置X（オプション、後方互換性のため） */
  left?: number;
  /** 移動後の位置Y（オプション、後方互換性のため） */
  top?: number;
}

// ============================================================================
// 定数定義
// ============================================================================

/**
 * デフォルトの折れ線オプション
 *
 * Task 64.3: 本体色/線幅は `ANNOTATION_DEFAULTS`（Req 26.5 一元管理トークン）を参照。
 * 塗りつぶしは従来通り 'transparent'（Fabric 上の透明表現）を維持する。
 */
export const DEFAULT_POLYLINE_OPTIONS: PolylineOptions = {
  stroke: ANNOTATION_DEFAULTS.stroke,
  strokeWidth: ANNOTATION_DEFAULTS.strokeWidth,
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
 * Fabric.js Group を拡張した折れ線オブジェクト。
 * - outlinePolyline: 白い縁取り（本体線幅 + 縁取り幅×2）
 * - bodyPolyline: 本体色の細い線
 * の 2 つの子 Polyline を持つ。
 *
 * 開放形状のため両 Polyline の `fill` は `'transparent'` を維持する
 * （design.md 5347 行: 「開放形状 2 種（Polyline/Freehand）は両 path とも fill 未使用」）。
 *
 * `type === 'polylineShape'` は維持（classRegistry 後方互換）。
 *
 * Task 80.1 で `Polyline` 直接継承から `Group` ベースへ再設計。
 */
export class PolylineShape extends Group {
  /** 点配列（内部状態） */
  private _points: Point[];

  /** 白縁取り属性 */
  private _outline: ShapeOutlineAttribute;

  /** 外側の白縁取り Polyline */
  private _outlinePolyline: Polyline;

  /** 本体色の Polyline */
  private _bodyPolyline: Polyline;

  /** 線色（後方互換: Group 自体にもミラー設定） */
  declare stroke: string;

  /** 線の太さ（後方互換: Group 自体にもミラー設定） */
  declare strokeWidth: number;

  /** 塗りつぶし色（後方互換: Group 自体にもミラー設定） */
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

    // 白縁取り属性（ANNOTATION_DEFAULTS から複製）
    const outline: ShapeOutlineAttribute = { ...ANNOTATION_DEFAULTS.polylineOutline };

    // 点配列のコピー
    const pointsCopy = points.map((p) => ({ ...p }));

    // 外側 Polyline（白縁取り）を生成
    // 子の left/top は Group 原点（0,0）からの相対座標。
    // 親 Group が位置決めし、子は points で形状を保持することで
    // 移動・リサイズ・回転・頂点編集時に同期する（Req 32.4）。
    //
    // 開放形状のため fill は 'transparent'（design.md 5347 行）。
    const outlinePolyline = new Polyline(pointsCopy, {
      stroke: outline.color,
      strokeWidth: mergedOptions.strokeWidth + outline.width * 2,
      fill: 'transparent',
      strokeLineCap: 'round',
      strokeLineJoin: 'round',
      opacity: outline.enabled ? 1 : 0,
      originX: 'left',
      originY: 'top',
      selectable: false,
      evented: false,
      hasControls: false,
      hasBorders: false,
      objectCaching: true,
    });

    // 本体 Polyline を生成
    // 開放形状のため fill は 'transparent'（design.md 5347 行）。
    // 既存 PolylineOptions の `fill` は API 上維持するが、実描画では使用しない。
    const bodyPolyline = new Polyline(pointsCopy, {
      stroke: mergedOptions.stroke,
      strokeWidth: mergedOptions.strokeWidth,
      fill: 'transparent',
      originX: 'left',
      originY: 'top',
      selectable: false,
      evented: false,
      hasControls: false,
      hasBorders: false,
      objectCaching: true,
    });

    // Group を初期化（outline → body の順で重ね、body が上に描画される）
    // 本体色/本体線幅/塗りつぶしは Group 自体にもミラー設定して、既存 consumer の
    // `polyline.stroke` / `polyline.strokeWidth` / `polyline.fill` 参照との
    // 後方互換を維持する。
    super([outlinePolyline, bodyPolyline], {
      originX: 'left',
      originY: 'top',
      selectable: true,
      evented: true,
      hasControls: true,
      hasBorders: true,
      lockMovementX: false,
      lockMovementY: false,
      subTargetCheck: false,
      objectCaching: false,
      stroke: mergedOptions.stroke,
      strokeWidth: mergedOptions.strokeWidth,
      fill: mergedOptions.fill,
    });

    // プロパティを設定
    this._points = pointsCopy;
    this._outline = outline;
    this._outlinePolyline = outlinePolyline;
    this._bodyPolyline = bodyPolyline;
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
   *
   * Task 80.1 (Req 32.4): outlinePolyline と bodyPolyline の双方を同期更新する。
   */
  setPoint(index: number, point: Point): void {
    if (index < 0 || index >= this._points.length) {
      return;
    }
    this._points[index] = { ...point };
    this._syncChildPoints();
    this.setCoords();
  }

  /**
   * 全点を一括で更新
   *
   * Task 80.1 (Req 32.4): outlinePolyline と bodyPolyline の双方を同期更新する。
   * 点配列の長さが変化（追加・削除）した場合も両子に伝搬する。
   */
  setPoints(points: Point[]): void {
    this._points = points.map((p) => ({ ...p }));
    this._syncChildPoints();
    this.setCoords();
  }

  /**
   * 子 Polyline（outline + body）の points を同期更新するヘルパー
   *
   * Task 80.1 (Req 32.4): 点追加・削除・移動時に両 Polyline を同期更新する。
   * Fabric.js Polyline の points は配列参照で管理されるため、新しい配列コピーを
   * 渡して setter 経由で更新する。
   */
  private _syncChildPoints(): void {
    const pointsCopy = this._points.map((p) => ({ ...p }));
    this._outlinePolyline.set(
      'points',
      pointsCopy.map((p) => ({ ...p }))
    );
    this._bodyPolyline.set(
      'points',
      pointsCopy.map((p) => ({ ...p }))
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
   * 線色（本体色）を更新
   *
   * Task 80.1 (Req 32.3): 白縁取り（outlinePolyline）の色は常に白のまま維持する。
   * `polyline.stroke` は Group 自身のプロパティも同期更新し、既存 consumer の参照互換を保つ。
   */
  setStroke(color: string): void {
    this.stroke = color;
    this._bodyPolyline.set('stroke', color);
    this.set('stroke', color);
  }

  /**
   * 線の太さ（本体線幅）を更新
   *
   * Task 80.1 (Req 32.2): 白縁取り Polyline の線幅も `width + outline.width * 2` に同期更新する。
   * `polyline.strokeWidth` は Group 自身のプロパティも同期更新し、既存 consumer の参照互換を保つ。
   */
  setStrokeWidth(width: number): void {
    this.strokeWidth = width;
    this._bodyPolyline.set('strokeWidth', width);
    this._outlinePolyline.set('strokeWidth', width + this._outline.width * 2);
    this.set('strokeWidth', width);
  }

  /**
   * 塗りつぶし色を更新
   *
   * Task 80.1: 折れ線は開放形状のため実描画では fill は使用しないが、
   * 既存 API 互換のために Group プロパティのみ更新する。
   * 両子 Polyline の fill は 'transparent' のまま維持する（design.md 5347 行）。
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
  // 白縁取り属性の更新
  // ==========================================================================

  /**
   * 白縁取り属性を部分更新
   *
   * Task 80.1 (Req 32.1, 32.2):
   * - enabled=false のときは outlinePolyline.opacity=0（構造は保持）
   * - enabled=true のときは outlinePolyline.opacity=1 かつ stroke/width を再適用
   *
   * @param next 部分更新する属性
   */
  setOutline(next: Partial<ShapeOutlineAttribute>): void {
    this._outline = { ...this._outline, ...next };

    if (this._outline.enabled) {
      const bodyStrokeWidth = (this._bodyPolyline.strokeWidth as number) ?? 0;
      this._outlinePolyline.set({
        opacity: 1,
        stroke: this._outline.color,
        strokeWidth: bodyStrokeWidth + this._outline.width * 2,
      });
    } else {
      this._outlinePolyline.set({ opacity: 0 });
    }

    // Req 24.10 (Arrow と同方針): canvas にアタッチ済みなら object:modified を発火する。
    // canvas 未アタッチ時は安全に no-op。
    const attachedCanvas = (
      this as unknown as { canvas?: { fire?: (event: string, options?: unknown) => void } }
    ).canvas;
    attachedCanvas?.fire?.('object:modified', { target: this });
  }

  /**
   * 現在の白縁取り属性を取得
   *
   * @returns 現在の outline 属性のコピー
   */
  getOutline(): ShapeOutlineAttribute | undefined {
    return { ...this._outline };
  }

  // ==========================================================================
  // シリアライズ
  // ==========================================================================

  /**
   * オブジェクトをJSON形式にシリアライズ
   *
   * Task 80.1: Group 化のみ対応。outline 属性のシリアライズは Task 80.2 で実装。
   */
  // @ts-expect-error - Fabric.js v6のtoObjectシグネチャとの互換性のため型を簡略化
  override toObject(): PolylineJSON {
    return {
      type: 'polylineShape' as const,
      points: this.getPoints(),
      stroke: this.stroke,
      strokeWidth: this.strokeWidth,
      fill: this.fill,
      left: this.left,
      top: this.top,
    };
  }

  /**
   * JSONオブジェクトからPolylineShapeを復元する
   *
   * Fabric.js v6のenlivenObjectsで使用される静的メソッド。
   * Task 80.1: Group 化のみ対応。outline 属性の復元は Task 80.2 で実装。
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

    // 移動後の位置を復元（後方互換性のためオプション）
    if (object.left !== undefined) {
      polyline.set('left', object.left);
    }
    if (object.top !== undefined) {
      polyline.set('top', object.top);
    }
    polyline.setCoords();

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
