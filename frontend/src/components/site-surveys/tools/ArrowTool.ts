/**
 * @fileoverview 矢印ツール
 *
 * Task 15.1: 矢印ツールを実装する
 * Task 65.1: Arrow クラスを Group ベースへ再設計（白縁取りダブルストローク）
 *
 * ドラッグによる矢印描画、矢印の方向（開始点→終了点）、
 * 白縁取り付き Group 構造のカスタム Fabric.js オブジェクト実装を行うモジュールです。
 *
 * Requirements:
 * - 7.1: 矢印ツールを選択してドラッグすると開始点から終了点へ矢印を描画する
 * - 24.1: 矢印本体線の両側に白色の縁取り線を付与して表示する
 * - 24.2: 白縁取り線幅を本体線幅の1.5倍以上の太さで付与する
 * - 24.3: 本体色を変更しても白縁取り部分の色は常に白のまま維持する
 * - 24.4: 移動・リサイズ・回転時に白縁取りを本体と同期して変形する
 */

import { Group, Path } from 'fabric';

import { ANNOTATION_DEFAULTS, type ArrowOutlineAttribute } from '../annotation-style-tokens';

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
 *
 * Task 65.2: `outline?: ArrowOutlineAttribute` を追加（Req 24.6, 24.7）。
 * `outline` が未定義のデータは白縁取り無しの従来表現で復元される（Req 24.9 後方互換）。
 */
export interface ArrowJSON {
  type: 'arrow';
  startPoint: Point;
  endPoint: Point;
  stroke: string;
  strokeWidth: number;
  arrowheadSize: number;
  /** 白縁取り属性（未設定は従来表現フォールバック） */
  outline?: ArrowOutlineAttribute;
}

// ============================================================================
// 定数定義
// ============================================================================

/**
 * デフォルトの矢印オプション
 *
 * Task 64.3: 本体色/線幅は `ANNOTATION_DEFAULTS`（Req 26.5 一元管理トークン）を参照。
 * Req 26.1: 初期線幅は 3px 以上（ANNOTATION_DEFAULTS.strokeWidth）。
 * Req 26.2: 初期本体色は赤系（ANNOTATION_DEFAULTS.stroke）。
 */
export const DEFAULT_ARROW_OPTIONS: ArrowOptions = {
  stroke: ANNOTATION_DEFAULTS.stroke,
  strokeWidth: ANNOTATION_DEFAULTS.strokeWidth,
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
 * Fabric.js Group を拡張した矢印オブジェクト。
 * - outlinePath: 白い縁取り（本体線幅 + 縁取り幅×2）
 * - bodyPath: 本体色の細い線
 * の 2 つの子 Path を持つ。
 *
 * `type === 'arrow'` は維持（classRegistry 後方互換）。
 */
export class Arrow extends Group {
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

  /** 白縁取り属性 */
  private _outline: ArrowOutlineAttribute;

  /** 外側の白縁取り Path */
  private _outlinePath: Path;

  /** 本体色の Path */
  private _bodyPath: Path;

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

    // 矢印のSVGパスを生成（2つの Path で共有）
    const pathData = generateArrowPath(startPoint, endPoint, mergedOptions.arrowheadSize);

    // 白縁取り属性（ANNOTATION_DEFAULTS から複製）
    const outline: ArrowOutlineAttribute = { ...ANNOTATION_DEFAULTS.arrowOutline };

    // 外側 Path（白縁取り）を生成
    const outlinePath = new Path(pathData, {
      stroke: outline.color,
      strokeWidth: mergedOptions.strokeWidth + outline.width * 2,
      fill: '',
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

    // 本体 Path を生成
    const bodyPath = new Path(pathData, {
      stroke: mergedOptions.stroke,
      strokeWidth: mergedOptions.strokeWidth,
      fill: '',
      originX: 'left',
      originY: 'top',
      selectable: false,
      evented: false,
      hasControls: false,
      hasBorders: false,
      objectCaching: true,
    });

    // Group を初期化（outline → body の順で重ね、body が上に描画される）
    // 本体色/本体線幅は Group 自体にもミラー設定して、既存 consumer の `arrow.stroke` /
    // `arrow.strokeWidth` 参照（Task 65.1 以前の API）との後方互換を維持する。
    super([outlinePath, bodyPath], {
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
      fill: '',
    });

    // プロパティを設定
    this._startPoint = { ...startPoint };
    this._endPoint = { ...endPoint };
    this._arrowheadSize = mergedOptions.arrowheadSize;
    this._length = length;
    this._arrowAngle = normalizeAngle(arrowAngle);
    this._outline = outline;
    this._outlinePath = outlinePath;
    this._bodyPath = bodyPath;
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
   *
   * Task 65.1: outlinePath と bodyPath の双方に同一 path data を適用する。
   */
  private _updateGeometry(): void {
    // 角度と距離を再計算
    this._arrowAngle = normalizeAngle(calculateAngle(this._startPoint, this._endPoint));
    this._length = calculateDistance(this._startPoint, this._endPoint);

    // 新しいパスデータを生成
    const pathData = generateArrowPath(this._startPoint, this._endPoint, this._arrowheadSize);

    // 両方の子 Path を更新（Fabric.js v6/v7 の内部 API）
    this._outlinePath._setPath(pathData);
    this._bodyPath._setPath(pathData);

    // 座標を更新
    this.setCoords();
  }

  // ==========================================================================
  // スタイルの更新
  // ==========================================================================

  /**
   * 線色（本体色）を更新
   *
   * Task 65.1 (Req 24.3): 白縁取り（outlinePath）の色は常に白のまま維持する。
   * `arrow.stroke` は Group 自身のプロパティも同期更新し、既存 consumer の参照互換を保つ。
   */
  setStroke(color: string): void {
    this._bodyPath.set('stroke', color);
    this.set('stroke', color);
  }

  /**
   * 線の太さ（本体線幅）を更新
   *
   * Task 65.1 (Req 24.2): 白縁取り Path の線幅も `width + outline.width * 2` に同期更新する。
   * `arrow.strokeWidth` は Group 自身のプロパティも同期更新し、既存 consumer の参照互換を保つ。
   */
  setStrokeWidth(width: number): void {
    this._bodyPath.set('strokeWidth', width);
    this._outlinePath.set('strokeWidth', width + this._outline.width * 2);
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
      stroke: (this._bodyPath.stroke as string) ?? '',
      strokeWidth: (this._bodyPath.strokeWidth as number) ?? 0,
      arrowheadSize: this._arrowheadSize,
    };
  }

  // ==========================================================================
  // 白縁取り属性の更新
  // ==========================================================================

  /**
   * 白縁取り属性を部分更新
   *
   * Task 65.1 (Req 24.1, 24.2):
   * - enabled=false のときは outlinePath.opacity=0（構造は保持）
   * - enabled=true のときは outlinePath.opacity=1 かつ stroke/width を再適用
   *
   * Task 65.2 (Req 24.10):
   * - canvas にアタッチ済みであれば `object:modified` イベントを発火し、
   *   `useFabricUndoIntegration` 経由で Undo/Redo 履歴に切替操作を記録する。
   *   canvas 未アタッチ時は安全に no-op（例外を投げない）。
   *
   * @param next 部分更新する属性
   */
  setOutline(next: Partial<ArrowOutlineAttribute>): void {
    this._outline = { ...this._outline, ...next };

    if (this._outline.enabled) {
      const bodyStrokeWidth = (this._bodyPath.strokeWidth as number) ?? 0;
      this._outlinePath.set({
        opacity: 1,
        stroke: this._outline.color,
        strokeWidth: bodyStrokeWidth + this._outline.width * 2,
      });
    } else {
      this._outlinePath.set({ opacity: 0 });
    }

    // Req 24.10: Undo/Redo 履歴記録のため canvas:object:modified を発火する。
    // Fabric.js v6 以降は FabricObject.canvas プロパティがアタッチ後に設定される。
    // canvas 未アタッチ（新規生成直後など）は安全に skip。
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
  getOutline(): ArrowOutlineAttribute | undefined {
    return { ...this._outline };
  }

  // ==========================================================================
  // シリアライズ
  // ==========================================================================

  /**
   * オブジェクトをJSON形式にシリアライズ
   *
   * Task 65.2 (Req 24.6):
   * - `outline` 現状を常に含めて出力する（新規保存時は enabled=false の場合も含める）。
   *   design.md §Arrow (Group) Postconditions「新規保存時は必ず outline を含める」に従う。
   */
  // @ts-expect-error - Fabric.js v6のtoObjectシグネチャとの互換性のため型を簡略化
  override toObject(): ArrowJSON {
    return {
      type: 'arrow' as const,
      startPoint: this.startPoint,
      endPoint: this.endPoint,
      stroke: (this._bodyPath.stroke as string) ?? '',
      strokeWidth: (this._bodyPath.strokeWidth as number) ?? 0,
      arrowheadSize: this._arrowheadSize,
      outline: { ...this._outline },
    };
  }

  /**
   * JSONオブジェクトからArrowを復元する
   *
   * Fabric.js v6のenlivenObjectsで使用される静的メソッド。
   *
   * Task 65.2 (Req 24.7, 24.9, design.md Migration 安全性):
   * - `object.outline` 定義時は setOutline で復元（Req 24.7）
   * - `object.outline` 未定義の旧データは「白縁取り無し」の従来表現で復元する（Req 24.9 後方互換）
   * - 必須フィールド（startPoint/endPoint/stroke/strokeWidth/arrowheadSize）欠落や
   *   null/undefined 受領時は安全な既定値（座標 (0,0)、stroke 黒、strokeWidth 2、arrowheadSize 10）で
   *   復元し、console.warn を送出する（防御的フォールバック）。
   *
   * @param object シリアライズされたJSONオブジェクト（null/undefined/不正値を許容）
   * @returns 復元されたArrowインスタンス
   */
  static override fromObject(object: ArrowJSON): Promise<Arrow> {
    // 防御的バリデーション: 必須フィールドの存在確認
    const safeDefaults = {
      startPoint: { x: 0, y: 0 } as Point,
      endPoint: { x: 0, y: 0 } as Point,
      stroke: '#000000',
      strokeWidth: 2,
      arrowheadSize: 10,
    };

    const hasValidRequiredFields =
      object != null &&
      typeof object === 'object' &&
      object.startPoint != null &&
      typeof object.startPoint === 'object' &&
      typeof (object.startPoint as Point).x === 'number' &&
      typeof (object.startPoint as Point).y === 'number' &&
      object.endPoint != null &&
      typeof object.endPoint === 'object' &&
      typeof (object.endPoint as Point).x === 'number' &&
      typeof (object.endPoint as Point).y === 'number' &&
      typeof object.stroke === 'string' &&
      typeof object.strokeWidth === 'number' &&
      typeof object.arrowheadSize === 'number';

    let startPoint: Point;
    let endPoint: Point;
    let stroke: string;
    let strokeWidth: number;
    let arrowheadSize: number;

    if (!hasValidRequiredFields) {
      // 不正データ: 警告ログ + 安全な既定値で復元

      console.warn('[ArrowTool] fromObject: missing required fields, using safe defaults', {
        received: object,
      });
      startPoint = safeDefaults.startPoint;
      endPoint = safeDefaults.endPoint;
      stroke = safeDefaults.stroke;
      strokeWidth = safeDefaults.strokeWidth;
      arrowheadSize = safeDefaults.arrowheadSize;
    } else {
      startPoint = object.startPoint;
      endPoint = object.endPoint;
      stroke = object.stroke;
      strokeWidth = object.strokeWidth;
      arrowheadSize = object.arrowheadSize;
    }

    const arrow = new Arrow(startPoint, endPoint, {
      stroke,
      strokeWidth,
      arrowheadSize,
    });

    // outline 属性の復元
    if (hasValidRequiredFields && object.outline !== undefined) {
      // Req 24.7: 保存された outline を復元
      arrow.setOutline(object.outline);
    } else {
      // Req 24.9: outline 未定義の旧データは白縁取り無しの従来表現で復元
      //   既存の ANNOTATION_DEFAULTS.arrowOutline（enabled=true）を無効化し、
      //   outlinePath.opacity=0 + width=0 で「白縁取り無し」状態にする。
      arrow.setOutline({ enabled: false, color: '#ffffff', width: 0 });
    }

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
