/**
 * @fileoverview 円・楕円ツール
 *
 * Task 15.2: 円・楕円ツールを実装する
 * Task 78.1: Circle クラスを Group ベースへ再設計（白縁取りダブルストローク）
 *
 * ドラッグによる円/楕円描画、中心点と半径の計算、
 * 白縁取り付き Group 構造のカスタム Fabric.js オブジェクト実装を行うモジュールです。
 *
 * Requirements:
 * - 7.2: 円ツールを選択してドラッグすると円または楕円を描画する
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

import { Ellipse, Group } from 'fabric';

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
 *
 * Task 78.2: `outline?: ShapeOutlineAttribute` を追加（Req 32.6, 32.7）。
 * `outline` が未定義のデータは白縁取り無しの従来表現で復元される（Req 32.9 後方互換）。
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
  /** 白縁取り属性（未設定は従来表現フォールバック） */
  outline?: ShapeOutlineAttribute;
}

// ============================================================================
// 定数定義
// ============================================================================

/**
 * デフォルトの円・楕円オプション
 *
 * Task 64.3: 本体色/線幅は `ANNOTATION_DEFAULTS`（Req 26.5 一元管理トークン）を参照。
 * 塗りつぶしは従来通り 'transparent'（Fabric 上の透明表現）を維持する。
 */
export const DEFAULT_CIRCLE_OPTIONS: CircleOptions = {
  stroke: ANNOTATION_DEFAULTS.stroke,
  strokeWidth: ANNOTATION_DEFAULTS.strokeWidth,
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
 * Fabric.js Group を拡張した円・楕円オブジェクト。
 * - outlineEllipse: 白い縁取り（本体線幅 + 縁取り幅×2）
 * - bodyEllipse: 本体色の細い線
 * の 2 つの子 Ellipse を持つ。
 *
 * `type === 'circleShape'` は維持（classRegistry 後方互換）。
 *
 * Task 78.1 で `Ellipse` 直接継承から `Group` ベースへ再設計。
 */
export class CircleShape extends Group {
  /** 中心X座標 */
  private _centerX: number;

  /** 中心Y座標 */
  private _centerY: number;

  /** X方向の半径（内部状態） */
  private _shapeRx: number;

  /** Y方向の半径（内部状態） */
  private _shapeRy: number;

  /** 白縁取り属性 */
  private _outline: ShapeOutlineAttribute;

  /** 外側の白縁取り Ellipse */
  private _outlineEllipse: Ellipse;

  /** 本体色の Ellipse */
  private _bodyEllipse: Ellipse;

  /** X方向の半径（後方互換: Group 自体にもミラー設定） */
  declare rx: number;

  /** Y方向の半径（後方互換: Group 自体にもミラー設定） */
  declare ry: number;

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

    // 白縁取り属性（ANNOTATION_DEFAULTS から複製）
    const outline: ShapeOutlineAttribute = { ...ANNOTATION_DEFAULTS.circleOutline };

    // 外側 Ellipse（白縁取り）を生成
    // 子の left/top は Group 原点（0,0）からの相対座標。
    // 親 Group が `left`/`top` で位置決め（originX/Y='center'）し、子は相対 0 を保持することで
    // 移動・リサイズ・回転時に同期する（Req 32.4）。
    const outlineEllipse = new Ellipse({
      left: 0,
      top: 0,
      rx,
      ry,
      stroke: outline.color,
      strokeWidth: mergedOptions.strokeWidth + outline.width * 2,
      fill: 'transparent',
      strokeLineCap: 'round',
      strokeLineJoin: 'round',
      opacity: outline.enabled ? 1 : 0,
      originX: 'center',
      originY: 'center',
      selectable: false,
      evented: false,
      hasControls: false,
      hasBorders: false,
      objectCaching: true,
    });

    // 本体 Ellipse を生成
    const bodyEllipse = new Ellipse({
      left: 0,
      top: 0,
      rx,
      ry,
      stroke: mergedOptions.stroke,
      strokeWidth: mergedOptions.strokeWidth,
      fill: mergedOptions.fill,
      originX: 'center',
      originY: 'center',
      selectable: false,
      evented: false,
      hasControls: false,
      hasBorders: false,
      objectCaching: true,
    });

    // Group を初期化（outline → body の順で重ね、body が上に描画される）
    // 本体色/本体線幅/塗りつぶしは Group 自体にもミラー設定して、既存 consumer の
    // `circle.stroke` / `circle.strokeWidth` / `circle.fill` 参照との後方互換を維持する。
    super([outlineEllipse, bodyEllipse], {
      left: centerX,
      top: centerY,
      originX: 'center',
      originY: 'center',
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
    this._centerX = centerX;
    this._centerY = centerY;
    this._shapeRx = rx;
    this._shapeRy = ry;
    this._outline = outline;
    this._outlineEllipse = outlineEllipse;
    this._bodyEllipse = bodyEllipse;
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
    return this._shapeRx * 2;
  }

  /** 高さを取得（ry * 2） */
  getHeight(): number {
    return this._shapeRy * 2;
  }

  // width/heightプロパティへのアクセスをラップ
  /** 幅（rx * 2） */
  get shapeWidth(): number {
    return this._shapeRx * 2;
  }

  /** 高さ（ry * 2） */
  get shapeHeight(): number {
    return this._shapeRy * 2;
  }

  /** 正円かどうか */
  get isCircle(): boolean {
    return Math.abs(this._shapeRx - this._shapeRy) < 0.001;
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
      left: this._centerX - this._shapeRx,
      top: this._centerY - this._shapeRy,
      right: this._centerX + this._shapeRx,
      bottom: this._centerY + this._shapeRy,
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
   *
   * Task 78.1: outlineEllipse と bodyEllipse の双方を同期更新する（Req 32.4）。
   */
  setRadii(rx: number, ry: number): void {
    this._shapeRx = rx;
    this._shapeRy = ry;
    this.rx = rx;
    this.ry = ry;
    this._syncChildRadii(rx, ry);
    this.set({
      rx,
      ry,
    });
    this.setCoords();
  }

  /**
   * ドラッグ座標から円・楕円を更新
   *
   * Task 78.1: outlineEllipse と bodyEllipse の双方を同期更新する（Req 32.4）。
   */
  updateFromDrag(startPoint: Point, endPoint: Point): void {
    const { centerX, centerY, rx, ry } = calculateGeometryFromDrag(startPoint, endPoint);
    this._centerX = centerX;
    this._centerY = centerY;
    this._shapeRx = rx;
    this._shapeRy = ry;
    this.rx = rx;
    this.ry = ry;
    this._syncChildRadii(rx, ry);
    this.set({
      left: centerX,
      top: centerY,
      rx,
      ry,
    });
    this.setCoords();
  }

  /**
   * 子 Ellipse（outline + body）の半径を同期更新するヘルパー
   *
   * Task 78.1 (Req 32.4): 半径変更時に両 Ellipse を同期更新する。
   */
  private _syncChildRadii(rx: number, ry: number): void {
    this._outlineEllipse.set({ rx, ry });
    this._bodyEllipse.set({ rx, ry });
  }

  // ==========================================================================
  // スタイルの更新
  // ==========================================================================

  /**
   * 線色（本体色）を更新
   *
   * Task 78.1 (Req 32.3): 白縁取り（outlineEllipse）の色は常に白のまま維持する。
   * `circle.stroke` は Group 自身のプロパティも同期更新し、既存 consumer の参照互換を保つ。
   */
  setStroke(color: string): void {
    this.stroke = color;
    this._bodyEllipse.set('stroke', color);
    this.set('stroke', color);
  }

  /**
   * 線の太さ（本体線幅）を更新
   *
   * Task 78.1 (Req 32.2): 白縁取り Ellipse の線幅も `width + outline.width * 2` に同期更新する。
   * `circle.strokeWidth` は Group 自身のプロパティも同期更新し、既存 consumer の参照互換を保つ。
   */
  setStrokeWidth(width: number): void {
    this.strokeWidth = width;
    this._bodyEllipse.set('strokeWidth', width);
    this._outlineEllipse.set('strokeWidth', width + this._outline.width * 2);
    this.set('strokeWidth', width);
  }

  /**
   * 塗りつぶし色を更新
   *
   * Task 78.1: 本体 Ellipse の fill のみ更新する。外側 Ellipse は常に `transparent` を維持。
   */
  setFill(color: string): void {
    this.fill = color;
    this._bodyEllipse.set('fill', color);
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
  // 白縁取り属性の更新
  // ==========================================================================

  /**
   * 白縁取り属性を部分更新
   *
   * Task 78.1 (Req 32.1, 32.2):
   * - enabled=false のときは outlineEllipse.opacity=0（構造は保持）
   * - enabled=true のときは outlineEllipse.opacity=1 かつ stroke/width を再適用
   *
   * @param next 部分更新する属性
   */
  setOutline(next: Partial<ShapeOutlineAttribute>): void {
    this._outline = { ...this._outline, ...next };

    if (this._outline.enabled) {
      const bodyStrokeWidth = (this._bodyEllipse.strokeWidth as number) ?? 0;
      this._outlineEllipse.set({
        opacity: 1,
        stroke: this._outline.color,
        strokeWidth: bodyStrokeWidth + this._outline.width * 2,
      });
    } else {
      this._outlineEllipse.set({ opacity: 0 });
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
   * Task 78.2 (Req 32.6):
   * - `outline` 現状を常に含めて出力する（新規保存時は enabled=false の場合も含める）。
   *   design.md §Circle (Group) Postconditions「新規保存時は必ず outline を含める」に従う。
   */
  // @ts-expect-error - Fabric.js v6のtoObjectシグネチャとの互換性のため型を簡略化
  override toObject(): CircleJSON {
    return {
      type: 'circleShape' as const,
      // Fabric.jsの移動操作でleft/topが更新されるため、現在の位置を使用
      // CircleShapeはoriginX/Y='center'なのでleft/topが中心座標
      centerX: this.left ?? this._centerX,
      centerY: this.top ?? this._centerY,
      rx: this._shapeRx,
      ry: this._shapeRy,
      stroke: this.stroke,
      strokeWidth: this.strokeWidth,
      fill: this.fill,
      outline: { ...this._outline },
    };
  }

  /**
   * JSONオブジェクトからCircleShapeを復元する
   *
   * Fabric.js v6のenlivenObjectsで使用される静的メソッド。
   *
   * Task 78.2 (Req 32.7, 32.9, design.md Migration 安全性):
   * - `object.outline` 定義時は setOutline で復元（Req 32.7）
   * - `object.outline` 未定義の旧データは「白縁取り無し」の従来表現で復元する（Req 32.9 後方互換）
   * - 必須フィールド（centerX/centerY/rx/ry/stroke/strokeWidth/fill）欠落や
   *   null/undefined 受領時は安全な既定値（中心 (0,0)、stroke 黒、strokeWidth 2、fill ''、
   *   rx/ry 0）で復元し、console.warn を送出する（防御的フォールバック）。
   *
   * @param object シリアライズされたJSONオブジェクト（null/undefined/不正値を許容）
   * @returns 復元されたCircleShapeインスタンス
   */
  static override fromObject(object: CircleJSON): Promise<CircleShape> {
    // 防御的バリデーション: 必須フィールドの存在確認
    const safeDefaults = {
      centerX: 0,
      centerY: 0,
      rx: 0,
      ry: 0,
      stroke: '#000000',
      strokeWidth: 2,
      fill: '',
    };

    const hasValidRequiredFields =
      object != null &&
      typeof object === 'object' &&
      typeof object.centerX === 'number' &&
      typeof object.centerY === 'number' &&
      typeof object.rx === 'number' &&
      typeof object.ry === 'number' &&
      typeof object.stroke === 'string' &&
      typeof object.strokeWidth === 'number' &&
      typeof object.fill === 'string';

    let centerX: number;
    let centerY: number;
    let rx: number;
    let ry: number;
    let stroke: string;
    let strokeWidth: number;
    let fill: string;

    if (!hasValidRequiredFields) {
      // 不正データ: 警告ログ + 安全な既定値で復元

      console.warn('[CircleTool] fromObject: missing required fields, using safe defaults', {
        received: object,
      });
      centerX = safeDefaults.centerX;
      centerY = safeDefaults.centerY;
      rx = safeDefaults.rx;
      ry = safeDefaults.ry;
      stroke = safeDefaults.stroke;
      strokeWidth = safeDefaults.strokeWidth;
      fill = safeDefaults.fill;
    } else {
      centerX = object.centerX;
      centerY = object.centerY;
      rx = object.rx;
      ry = object.ry;
      stroke = object.stroke;
      strokeWidth = object.strokeWidth;
      fill = object.fill;
    }

    const circle = new CircleShape(centerX, centerY, rx, ry, {
      stroke,
      strokeWidth,
      fill,
    });

    // outline 属性の復元
    if (hasValidRequiredFields && object.outline !== undefined) {
      // Req 32.7: 保存された outline を復元
      circle.setOutline(object.outline);
    } else {
      // Req 32.9: outline 未定義の旧データは白縁取り無しの従来表現で復元
      //   既存の ANNOTATION_DEFAULTS.circleOutline（enabled=true）を無効化し、
      //   outlineEllipse.opacity=0 + width=0 で「白縁取り無し」状態にする。
      circle.setOutline({ enabled: false, color: '#ffffff', width: 0 });
    }

    return Promise.resolve(circle);
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
