/**
 * @fileoverview 四角形ツール
 *
 * Task 15.3: 四角形ツールを実装する
 * Task 77.1: Rectangle クラスを Group ベースへ再設計（白縁取りダブルストローク）
 *
 * ドラッグによる長方形描画、座標計算（位置、幅、高さ）、
 * 白縁取り付き Group 構造のカスタム Fabric.js オブジェクト実装を行うモジュールです。
 *
 * Requirements:
 * - 7.3: 四角形ツールを選択してドラッグすると長方形を描画する
 * - 32.1: 矢印以外の形状にも白色の縁取り線を付与する
 * - 32.2: 白縁取り線幅を本体線幅の 1.5 倍以上に設定する
 * - 32.3: 本体色を変更しても白縁取りは白のまま維持する
 * - 32.4: 移動・リサイズ・回転時に本体と同期して白縁取りを変形する
 *
 * @requirement site-survey/REQ-26.1
 * @requirement site-survey/REQ-26.2
 * @requirement site-survey/REQ-26.5
 * @requirement site-survey/REQ-32.1
 * @requirement site-survey/REQ-32.2
 * @requirement site-survey/REQ-32.3
 * @requirement site-survey/REQ-32.4
 */

import { Group, Rect } from 'fabric';

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
 *
 * Task 77.2: `outline?: ShapeOutlineAttribute` を追加（Req 32.6, 32.7）。
 * `outline` が未定義のデータは白縁取り無しの従来表現で復元される（Req 32.9 後方互換）。
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
  /** 白縁取り属性（未設定は従来表現フォールバック） */
  outline?: ShapeOutlineAttribute;
}

// ============================================================================
// 定数定義
// ============================================================================

/**
 * デフォルトの四角形オプション
 *
 * Task 64.3: 本体色/線幅は `ANNOTATION_DEFAULTS`（Req 26.5 一元管理トークン）を参照。
 * 塗りつぶしは従来通り 'transparent'（Fabric 上の透明表現）を維持する。
 */
export const DEFAULT_RECTANGLE_OPTIONS: RectangleOptions = {
  stroke: ANNOTATION_DEFAULTS.stroke,
  strokeWidth: ANNOTATION_DEFAULTS.strokeWidth,
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
 * Fabric.js Group を拡張した四角形オブジェクト。
 * - outlineRect: 白い縁取り（本体線幅 + 縁取り幅×2）
 * - bodyRect: 本体色の細い線
 * の 2 つの子 Rect を持つ。
 *
 * `type === 'rectangleShape'` は維持（classRegistry 後方互換）。
 *
 * Task 77.1 で `Rect` 直接継承から `Group` ベースへ再設計。
 */
export class RectangleShape extends Group {
  /** X位置（左端） */
  private _positionX: number;

  /** Y位置（上端） */
  private _positionY: number;

  /** 幅 */
  private _shapeWidth: number;

  /** 高さ */
  private _shapeHeight: number;

  /** 白縁取り属性 */
  private _outline: ShapeOutlineAttribute;

  /** 外側の白縁取り Rect */
  private _outlineRect: Rect;

  /** 本体色の Rect */
  private _bodyRect: Rect;

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

    // 白縁取り属性（ANNOTATION_DEFAULTS から複製）
    const outline: ShapeOutlineAttribute = { ...ANNOTATION_DEFAULTS.rectangleOutline };

    // 外側 Rect（白縁取り）を生成
    // 子の left/top は Group 原点（0,0）からの相対座標。
    // 親 Group が `left`/`top` で位置決めし、子は相対 0 を保持することで
    // 移動・リサイズ・回転時に同期する（Req 32.4）。
    const outlineRect = new Rect({
      left: 0,
      top: 0,
      width,
      height,
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

    // 本体 Rect を生成
    const bodyRect = new Rect({
      left: 0,
      top: 0,
      width,
      height,
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
    // `rectangle.stroke` / `rectangle.strokeWidth` / `rectangle.fill` 参照との
    // 後方互換を維持する。
    super([outlineRect, bodyRect], {
      left,
      top,
      width,
      height,
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
    this._positionX = left;
    this._positionY = top;
    this._shapeWidth = width;
    this._shapeHeight = height;
    this._outline = outline;
    this._outlineRect = outlineRect;
    this._bodyRect = bodyRect;
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
   *
   * Task 77.1: outlineRect と bodyRect の双方を同期更新する（Req 32.4）。
   */
  setDimensions(width: number, height: number): void {
    this._shapeWidth = width;
    this._shapeHeight = height;
    this._syncChildDimensions(width, height);
    this.set({
      width,
      height,
    });
    this.setCoords();
  }

  /**
   * ドラッグ座標から四角形を更新
   *
   * Task 77.1: outlineRect と bodyRect の双方を同期更新する（Req 32.4）。
   */
  updateFromDrag(startPoint: Point, endPoint: Point): void {
    const { left, top, width, height } = calculateGeometryFromDrag(startPoint, endPoint);
    this._positionX = left;
    this._positionY = top;
    this._shapeWidth = width;
    this._shapeHeight = height;
    this._syncChildDimensions(width, height);
    this.set({
      left,
      top,
      width,
      height,
    });
    this.setCoords();
  }

  /**
   * 子 Rect（outline + body）のサイズを同期更新するヘルパー
   *
   * Task 77.1 (Req 32.4): サイズ変更時に両 Rect を同期更新する。
   */
  private _syncChildDimensions(width: number, height: number): void {
    this._outlineRect.set({ width, height });
    this._bodyRect.set({ width, height });
  }

  // ==========================================================================
  // スタイルの更新
  // ==========================================================================

  /**
   * 線色（本体色）を更新
   *
   * Task 77.1 (Req 32.3): 白縁取り（outlineRect）の色は常に白のまま維持する。
   * `rectangle.stroke` は Group 自身のプロパティも同期更新し、既存 consumer の参照互換を保つ。
   */
  setStroke(color: string): void {
    this.stroke = color;
    this._bodyRect.set('stroke', color);
    this.set('stroke', color);
  }

  /**
   * 線の太さ（本体線幅）を更新
   *
   * Task 77.1 (Req 32.2): 白縁取り Rect の線幅も `width + outline.width * 2` に同期更新する。
   * `rectangle.strokeWidth` は Group 自身のプロパティも同期更新し、既存 consumer の参照互換を保つ。
   */
  setStrokeWidth(width: number): void {
    this.strokeWidth = width;
    this._bodyRect.set('strokeWidth', width);
    this._outlineRect.set('strokeWidth', width + this._outline.width * 2);
    this.set('strokeWidth', width);
  }

  /**
   * 塗りつぶし色を更新
   *
   * Task 77.1: 本体 Rect の fill のみ更新する。外側 Rect は常に `transparent` を維持。
   */
  setFill(color: string): void {
    this.fill = color;
    this._bodyRect.set('fill', color);
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
  // 白縁取り属性の更新
  // ==========================================================================

  /**
   * 白縁取り属性を部分更新
   *
   * Task 77.1 (Req 32.1, 32.2):
   * - enabled=false のときは outlineRect.opacity=0（構造は保持）
   * - enabled=true のときは outlineRect.opacity=1 かつ stroke/width を再適用
   *
   * @param next 部分更新する属性
   */
  setOutline(next: Partial<ShapeOutlineAttribute>): void {
    this._outline = { ...this._outline, ...next };

    if (this._outline.enabled) {
      const bodyStrokeWidth = (this._bodyRect.strokeWidth as number) ?? 0;
      this._outlineRect.set({
        opacity: 1,
        stroke: this._outline.color,
        strokeWidth: bodyStrokeWidth + this._outline.width * 2,
      });
    } else {
      this._outlineRect.set({ opacity: 0 });
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
   * Task 77.2 (Req 32.6):
   * - `outline` 現状を常に含めて出力する（新規保存時は enabled=false の場合も含める）。
   *   design.md §Rectangle (Group) Postconditions「新規保存時は必ず outline を含める」に従う。
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
      outline: { ...this._outline },
    };
  }

  /**
   * JSONオブジェクトからRectangleShapeを復元する
   *
   * Fabric.js v6のenlivenObjectsで使用される静的メソッド。
   *
   * Task 77.2 (Req 32.7, 32.9, design.md Migration 安全性):
   * - `object.outline` 定義時は setOutline で復元（Req 32.7）
   * - `object.outline` 未定義の旧データは「白縁取り無し」の従来表現で復元する（Req 32.9 後方互換）
   * - 必須フィールド（left/top/width/height/stroke/strokeWidth/fill）欠落や
   *   null/undefined 受領時は安全な既定値（座標 (0,0)、stroke 黒、strokeWidth 2、fill ''、
   *   width/height 0）で復元し、console.warn を送出する（防御的フォールバック）。
   *
   * @param object シリアライズされたJSONオブジェクト（null/undefined/不正値を許容）
   * @returns 復元されたRectangleShapeインスタンス
   */
  static override fromObject(object: RectangleJSON): Promise<RectangleShape> {
    // 防御的バリデーション: 必須フィールドの存在確認
    const safeDefaults = {
      left: 0,
      top: 0,
      width: 0,
      height: 0,
      stroke: '#000000',
      strokeWidth: 2,
      fill: '',
    };

    const hasValidRequiredFields =
      object != null &&
      typeof object === 'object' &&
      typeof object.left === 'number' &&
      typeof object.top === 'number' &&
      typeof object.width === 'number' &&
      typeof object.height === 'number' &&
      typeof object.stroke === 'string' &&
      typeof object.strokeWidth === 'number' &&
      typeof object.fill === 'string';

    let left: number;
    let top: number;
    let width: number;
    let height: number;
    let stroke: string;
    let strokeWidth: number;
    let fill: string;

    if (!hasValidRequiredFields) {
      // 不正データ: 警告ログ + 安全な既定値で復元

      console.warn('[RectangleTool] fromObject: missing required fields, using safe defaults', {
        received: object,
      });
      left = safeDefaults.left;
      top = safeDefaults.top;
      width = safeDefaults.width;
      height = safeDefaults.height;
      stroke = safeDefaults.stroke;
      strokeWidth = safeDefaults.strokeWidth;
      fill = safeDefaults.fill;
    } else {
      left = object.left;
      top = object.top;
      width = object.width;
      height = object.height;
      stroke = object.stroke;
      strokeWidth = object.strokeWidth;
      fill = object.fill;
    }

    const rectangle = new RectangleShape(left, top, width, height, {
      stroke,
      strokeWidth,
      fill,
    });

    // outline 属性の復元
    if (hasValidRequiredFields && object.outline !== undefined) {
      // Req 32.7: 保存された outline を復元
      rectangle.setOutline(object.outline);
    } else {
      // Req 32.9: outline 未定義の旧データは白縁取り無しの従来表現で復元
      //   既存の ANNOTATION_DEFAULTS.rectangleOutline（enabled=true）を無効化し、
      //   outlineRect.opacity=0 + width=0 で「白縁取り無し」状態にする。
      rectangle.setOutline({ enabled: false, color: '#ffffff', width: 0 });
    }

    return Promise.resolve(rectangle);
  }
}

/**
 * Rectangle は RectangleShape のエイリアス。
 *
 * design.md と Task 77.1 指示書のクラス名（Rectangle）と
 * 既存実装で歴史的に使用されてきたクラス名（RectangleShape）を両立するための
 * 後方互換 export。新規コードでは Rectangle を推奨する。
 */
export { RectangleShape as Rectangle };

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
