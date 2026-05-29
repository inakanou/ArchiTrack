/**
 * @fileoverview 多角形ツール
 *
 * Task 15.4: 多角形ツールを実装する
 * Task 79.1: Polygon クラスを Group ベースへ再設計（白縁取りダブルストローク）
 *
 * クリックによる頂点追加、ダブルクリックで閉じる、
 * 白縁取り付き Group 構造のカスタム Fabric.js オブジェクト実装を行うモジュールです。
 *
 * Requirements:
 * - 7.4: 多角形ツールを選択して頂点をクリックすると多角形を描画する
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

import { Group, Polygon } from 'fabric';

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
 *
 * Task 79.2: `outline?: ShapeOutlineAttribute` を追加（Req 32.6, 32.7）。
 * `outline` が未定義のデータは白縁取り無しの従来表現で復元される（Req 32.9 後方互換）。
 */
export interface PolygonJSON {
  type: 'polygonShape';
  points: Point[];
  stroke: string;
  strokeWidth: number;
  fill: string;
  /** 移動後の位置X（オプション、後方互換性のため） */
  left?: number;
  /** 移動後の位置Y（オプション、後方互換性のため） */
  top?: number;
  /** 白縁取り属性（未設定は従来表現フォールバック） */
  outline?: ShapeOutlineAttribute;
}

// ============================================================================
// 定数定義
// ============================================================================

/**
 * デフォルトの多角形オプション
 *
 * Task 64.3: 本体色/線幅は `ANNOTATION_DEFAULTS`（Req 26.5 一元管理トークン）を参照。
 * 塗りつぶしは従来通り 'transparent'（Fabric 上の透明表現）を維持する。
 */
export const DEFAULT_POLYGON_OPTIONS: PolygonOptions = {
  stroke: ANNOTATION_DEFAULTS.stroke,
  strokeWidth: ANNOTATION_DEFAULTS.strokeWidth,
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
 * Fabric.js Group を拡張した多角形オブジェクト。
 * - outlinePolygon: 白い縁取り（本体線幅 + 縁取り幅×2）
 * - bodyPolygon: 本体色の細い線
 * の 2 つの子 Polygon を持つ。
 *
 * `type === 'polygonShape'` は維持（classRegistry 後方互換）。
 *
 * Task 79.1 で `Polygon` 直接継承から `Group` ベースへ再設計。
 */
export class PolygonShape extends Group {
  /** 頂点配列（内部状態） */
  private _vertices: Point[];

  /** 白縁取り属性 */
  private _outline: ShapeOutlineAttribute;

  /** 外側の白縁取り Polygon */
  private _outlinePolygon: Polygon;

  /** 本体色の Polygon */
  private _bodyPolygon: Polygon;

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
   * PolygonShapeコンストラクタ
   *
   * @param points 頂点の配列
   * @param options オプション
   */
  constructor(points: Point[], options: Partial<PolygonOptions> = {}) {
    // 設定をマージ
    const mergedOptions = { ...DEFAULT_POLYGON_OPTIONS, ...options };

    // 白縁取り属性（ANNOTATION_DEFAULTS から複製）
    const outline: ShapeOutlineAttribute = { ...ANNOTATION_DEFAULTS.polygonOutline };

    // 頂点配列のコピー
    const verticesCopy = points.map((p) => ({ ...p }));

    // 外側 Polygon（白縁取り）を生成
    // 子の left/top は Group 原点（0,0）からの相対座標。
    // 親 Group が位置決めし、子は points で形状を保持することで
    // 移動・リサイズ・回転・頂点編集時に同期する（Req 32.4）。
    const outlinePolygon = new Polygon(verticesCopy, {
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

    // 本体 Polygon を生成
    const bodyPolygon = new Polygon(verticesCopy, {
      stroke: mergedOptions.stroke,
      strokeWidth: mergedOptions.strokeWidth,
      fill: mergedOptions.fill,
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
    // `polygon.stroke` / `polygon.strokeWidth` / `polygon.fill` 参照との
    // 後方互換を維持する。
    super([outlinePolygon, bodyPolygon], {
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
    this._vertices = verticesCopy;
    this._outline = outline;
    this._outlinePolygon = outlinePolygon;
    this._bodyPolygon = bodyPolygon;
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
   *
   * Task 79.1 (Req 32.4): outlinePolygon と bodyPolygon の双方を同期更新する。
   */
  setVertex(index: number, point: Point): void {
    if (index < 0 || index >= this._vertices.length) {
      return;
    }
    this._vertices[index] = { ...point };
    this._syncChildPoints();
    this.setCoords();
  }

  /**
   * 全頂点を一括で更新
   *
   * Task 79.1 (Req 32.4): outlinePolygon と bodyPolygon の双方を同期更新する。
   * 頂点配列の長さが変化（追加・削除）した場合も両子に伝搬する。
   */
  setVertices(points: Point[]): void {
    this._vertices = points.map((p) => ({ ...p }));
    this._syncChildPoints();
    this.setCoords();
  }

  /**
   * 子 Polygon（outline + body）の points を同期更新するヘルパー
   *
   * Task 79.1 (Req 32.4): 頂点追加・削除・移動時に両 Polygon を同期更新する。
   * Fabric.js Polygon の points は配列参照で管理されるため、新しい配列コピーを
   * 渡して setter 経由で更新する。
   */
  private _syncChildPoints(): void {
    const pointsCopy = this._vertices.map((p) => ({ ...p }));
    this._outlinePolygon.set(
      'points',
      pointsCopy.map((p) => ({ ...p }))
    );
    this._bodyPolygon.set(
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
   * 線色（本体色）を更新
   *
   * Task 79.1 (Req 32.3): 白縁取り（outlinePolygon）の色は常に白のまま維持する。
   * `polygon.stroke` は Group 自身のプロパティも同期更新し、既存 consumer の参照互換を保つ。
   */
  setStroke(color: string): void {
    this.stroke = color;
    this._bodyPolygon.set('stroke', color);
    this.set('stroke', color);
  }

  /**
   * 線の太さ（本体線幅）を更新
   *
   * Task 79.1 (Req 32.2): 白縁取り Polygon の線幅も `width + outline.width * 2` に同期更新する。
   * `polygon.strokeWidth` は Group 自身のプロパティも同期更新し、既存 consumer の参照互換を保つ。
   */
  setStrokeWidth(width: number): void {
    this.strokeWidth = width;
    this._bodyPolygon.set('strokeWidth', width);
    this._outlinePolygon.set('strokeWidth', width + this._outline.width * 2);
    this.set('strokeWidth', width);
  }

  /**
   * 塗りつぶし色を更新
   *
   * Task 79.1: 本体 Polygon の fill のみ更新する。外側 Polygon は常に `transparent` を維持。
   */
  setFill(color: string): void {
    this.fill = color;
    this._bodyPolygon.set('fill', color);
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
  // 白縁取り属性の更新
  // ==========================================================================

  /**
   * 白縁取り属性を部分更新
   *
   * Task 79.1 (Req 32.1, 32.2):
   * - enabled=false のときは outlinePolygon.opacity=0（構造は保持）
   * - enabled=true のときは outlinePolygon.opacity=1 かつ stroke/width を再適用
   *
   * @param next 部分更新する属性
   */
  setOutline(next: Partial<ShapeOutlineAttribute>): void {
    this._outline = { ...this._outline, ...next };

    if (this._outline.enabled) {
      const bodyStrokeWidth = (this._bodyPolygon.strokeWidth as number) ?? 0;
      this._outlinePolygon.set({
        opacity: 1,
        stroke: this._outline.color,
        strokeWidth: bodyStrokeWidth + this._outline.width * 2,
      });
    } else {
      this._outlinePolygon.set({ opacity: 0 });
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
   * Task 79.2 (Req 32.6):
   * - `outline` 現状を常に含めて出力する（新規保存時は enabled=false の場合も含める）。
   *   design.md §Polygon (Group) Postconditions「新規保存時は必ず outline を含める」に従う。
   */
  // @ts-expect-error - Fabric.js v6のtoObjectシグネチャとの互換性のため型を簡略化
  override toObject(): PolygonJSON {
    return {
      type: 'polygonShape' as const,
      points: this.getVertices(),
      stroke: this.stroke,
      strokeWidth: this.strokeWidth,
      fill: this.fill,
      left: this.left,
      top: this.top,
      outline: { ...this._outline },
    };
  }

  /**
   * JSONオブジェクトからPolygonShapeを復元する
   *
   * Fabric.js v6のenlivenObjectsで使用される静的メソッド。
   *
   * Task 79.2 (Req 32.7, 32.9, design.md Migration 安全性):
   * - `object.outline` 定義時は setOutline で復元（Req 32.7）
   * - `object.outline` 未定義の旧データは「白縁取り無し」の従来表現で復元する（Req 32.9 後方互換）
   * - 必須フィールド（points 配列・各点の x/y・stroke/strokeWidth/fill）欠落や
   *   null/undefined 受領時は安全な既定値（空配列でも生成可能な三角形デフォルト、
   *   stroke 黒、strokeWidth 2、fill ''）で復元し、console.warn を送出する（防御的フォールバック）。
   *
   * @param object シリアライズされたJSONオブジェクト（null/undefined/不正値を許容）
   * @returns 復元されたPolygonShapeインスタンス
   */
  static override fromObject(object: PolygonJSON): Promise<PolygonShape> {
    // 防御的バリデーション: 必須フィールドの存在確認
    // points 欠落時は最低限の三角形（原点付近）でフォールバック（PolygonShape は最低 1 頂点必要）。
    const safeDefaults = {
      points: [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 0, y: 1 },
      ] as Point[],
      stroke: '#000000',
      strokeWidth: 2,
      fill: '',
    };

    const isValidPointsArray =
      object != null &&
      typeof object === 'object' &&
      Array.isArray(object.points) &&
      object.points.every(
        (p): p is Point =>
          p != null && typeof p === 'object' && typeof p.x === 'number' && typeof p.y === 'number'
      );

    const hasValidRequiredFields =
      object != null &&
      typeof object === 'object' &&
      isValidPointsArray &&
      typeof object.stroke === 'string' &&
      typeof object.strokeWidth === 'number' &&
      typeof object.fill === 'string';

    let points: Point[];
    let stroke: string;
    let strokeWidth: number;
    let fill: string;

    if (!hasValidRequiredFields) {
      // 不正データ: 警告ログ + 安全な既定値で復元
      console.warn('[PolygonTool] fromObject: missing required fields, using safe defaults', {
        received: object,
      });
      points = safeDefaults.points;
      stroke = safeDefaults.stroke;
      strokeWidth = safeDefaults.strokeWidth;
      fill = safeDefaults.fill;
    } else {
      points = object.points;
      stroke = object.stroke;
      strokeWidth = object.strokeWidth;
      fill = object.fill;
    }

    const polygon = new PolygonShape(points, {
      stroke,
      strokeWidth,
      fill,
    });

    // 移動後の位置を復元（後方互換性のためオプション）
    if (hasValidRequiredFields && object.left !== undefined) {
      polygon.set('left', object.left);
    }
    if (hasValidRequiredFields && object.top !== undefined) {
      polygon.set('top', object.top);
    }
    polygon.setCoords();

    // outline 属性の復元
    if (hasValidRequiredFields && object.outline !== undefined) {
      // Req 32.7: 保存された outline を復元
      polygon.setOutline(object.outline);
    } else {
      // Req 32.9: outline 未定義の旧データは白縁取り無しの従来表現で復元
      //   既存の ANNOTATION_DEFAULTS.polygonOutline（enabled=true）を無効化し、
      //   outlinePolygon.opacity=0 + width=0 で「白縁取り無し」状態にする。
      polygon.setOutline({ enabled: false, color: '#ffffff', width: 0 });
    }

    return Promise.resolve(polygon);
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
