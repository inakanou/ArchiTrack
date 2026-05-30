/**
 * @fileoverview フリーハンドツール
 *
 * Task 15.6: フリーハンドツールを実装する
 * Task 81.1: Freehand クラスを Group ベースへ再設計（白縁取りダブルストローク）
 *
 * Fabric.js PencilBrushの活用、描画の滑らかさ調整、
 * 白縁取り付き Group 構造のカスタム Fabric.js オブジェクト実装を行うモジュールです。
 *
 * Requirements:
 * - 7.6: フリーハンドツールを選択して描画するとフリーハンドの線を描画する
 * - 32.1: 矢印以外の形状にも白色の縁取り線を付与する
 * - 32.2: 白縁取り線幅を本体線幅の 1.5 倍以上に設定する
 * - 32.3: 本体色を変更しても白縁取りは白のまま維持する
 * - 32.4: 移動・リサイズ・回転・形状変形（パスデータ変更）時に本体と同期して白縁取りを変形する
 *
 * @requirement site-survey/REQ-26.1
 * @requirement site-survey/REQ-26.2
 * @requirement site-survey/REQ-26.5
 * @requirement site-survey/REQ-32.1
 * @requirement site-survey/REQ-32.2
 * @requirement site-survey/REQ-32.3
 * @requirement site-survey/REQ-32.4
 */

import { Group, Path, PencilBrush, type Canvas, type TPointerEvent, type TEvent } from 'fabric';
import type { Point as FabricPoint } from 'fabric';

import { ANNOTATION_DEFAULTS, type ShapeOutlineAttribute } from '../annotation-style-tokens';

// ============================================================================
// 型定義
// ============================================================================

/**
 * 2D座標を表すポイント（シンプル版）
 */
export interface Point {
  x: number;
  y: number;
}

/**
 * フリーハンドのオプション
 */
export interface FreehandOptions {
  /** 線色（HEXカラーコード） */
  stroke: string;
  /** 線の太さ */
  strokeWidth: number;
  /** 塗りつぶし色（HEXカラーコードまたは'transparent'） */
  fill: string;
  /** デシメート値（点の間引き）- 小さいほど滑らか */
  decimate: number;
  /** 線の端点スタイル */
  strokeLineCap: 'butt' | 'round' | 'square';
  /** 線の結合スタイル */
  strokeLineJoin: 'bevel' | 'round' | 'miter';
}

/**
 * フリーハンドのシリアライズ形式
 */
export interface FreehandJSON {
  type: 'freehand';
  pathData: string;
  stroke: string;
  strokeWidth: number;
  fill: string;
  strokeLineCap: string;
  strokeLineJoin: string;
  /** 移動後の位置X（オプション、後方互換性のため） */
  left?: number;
  /** 移動後の位置Y（オプション、後方互換性のため） */
  top?: number;
}

// ============================================================================
// 定数定義
// ============================================================================

/**
 * デフォルトのフリーハンドオプション
 *
 * Task 64.3: 本体色/線幅は `ANNOTATION_DEFAULTS`（Req 26.5 一元管理トークン）を参照。
 * 塗りつぶしは従来通り 'transparent'（Fabric 上の透明表現）を維持する。
 */
export const DEFAULT_FREEHAND_OPTIONS: FreehandOptions = {
  stroke: ANNOTATION_DEFAULTS.stroke,
  strokeWidth: ANNOTATION_DEFAULTS.strokeWidth,
  fill: 'transparent',
  decimate: 8,
  strokeLineCap: 'round',
  strokeLineJoin: 'round',
};

/**
 * パスを作成する最小ポイント数
 */
const MIN_POINT_COUNT = 2;

// ============================================================================
// FreehandPathクラス
// ============================================================================

/**
 * フリーハンドパスクラス
 *
 * Fabric.js Group を拡張したフリーハンドオブジェクト。
 * - outlinePath: 白い縁取り（本体線幅 + 縁取り幅×2）
 * - bodyPath: 本体色の細い線
 * の 2 つの子 Path を持つ。
 *
 * 開放形状のため両 Path の `fill` は `'transparent'` を維持する
 * （design.md 5347 行: 「開放形状 2 種（Polyline/Freehand）は両 path とも fill 未使用」）。
 *
 * `type === 'freehand'` は維持（classRegistry 後方互換）。
 *
 * Task 81.1 で `Path` 直接継承から `Group` ベースへ再設計。
 */
export class FreehandPath extends Group {
  /** パスデータ（SVGパス文字列） */
  private _pathData: string;

  /** 白縁取り属性 */
  private _outline: ShapeOutlineAttribute;

  /** 外側の白縁取り Path */
  private _outlinePath: Path;

  /** 本体色の Path */
  private _bodyPath: Path;

  /** 線色（後方互換: Group 自体にもミラー設定） */
  declare stroke: string;

  /** 線の太さ（後方互換: Group 自体にもミラー設定） */
  declare strokeWidth: number;

  /** 塗りつぶし色（後方互換: Group 自体にもミラー設定） */
  declare fill: string;

  /** 線の端点スタイル（後方互換: Group 自体にもミラー設定） */
  declare strokeLineCap: 'butt' | 'round' | 'square';

  /** 線の結合スタイル（後方互換: Group 自体にもミラー設定） */
  declare strokeLineJoin: 'bevel' | 'round' | 'miter';

  /** コントロール表示フラグ */
  declare hasControls: boolean;

  /** ボーダー表示フラグ */
  declare hasBorders: boolean;

  /** X軸移動ロック */
  declare lockMovementX: boolean;

  /** Y軸移動ロック */
  declare lockMovementY: boolean;

  /**
   * FreehandPathコンストラクタ
   *
   * @param pathData SVGパス文字列
   * @param options オプション
   */
  constructor(pathData: string, options: Partial<FreehandOptions> = {}) {
    // 設定をマージ
    const mergedOptions = { ...DEFAULT_FREEHAND_OPTIONS, ...options };

    // 白縁取り属性（ANNOTATION_DEFAULTS から複製）
    const outline: ShapeOutlineAttribute = { ...ANNOTATION_DEFAULTS.freehandOutline };

    // 外側 Path（白縁取り）を生成
    // 子の left/top は Group 原点（0,0）からの相対座標。
    // 親 Group が位置決めし、子は path で形状を保持することで
    // 移動・リサイズ・回転・パスデータ変更時に同期する（Req 32.4）。
    //
    // 開放形状のため fill は 'transparent'（design.md 5347 行）。
    const outlinePath = new Path(pathData, {
      stroke: outline.color,
      strokeWidth: mergedOptions.strokeWidth + outline.width * 2,
      fill: 'transparent',
      strokeLineCap: mergedOptions.strokeLineCap,
      strokeLineJoin: mergedOptions.strokeLineJoin,
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
    // 開放形状のため fill は 'transparent'（design.md 5347 行）。
    // 既存 FreehandOptions の `fill` は API 上維持するが、実描画では使用しない。
    const bodyPath = new Path(pathData, {
      stroke: mergedOptions.stroke,
      strokeWidth: mergedOptions.strokeWidth,
      fill: 'transparent',
      strokeLineCap: mergedOptions.strokeLineCap,
      strokeLineJoin: mergedOptions.strokeLineJoin,
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
    // `freehand.stroke` / `freehand.strokeWidth` / `freehand.fill` 参照との
    // 後方互換を維持する。
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
      fill: mergedOptions.fill,
    });

    // プロパティを設定
    this._pathData = pathData;
    this._outline = outline;
    this._outlinePath = outlinePath;
    this._bodyPath = bodyPath;
    this.stroke = mergedOptions.stroke;
    this.strokeWidth = mergedOptions.strokeWidth;
    this.fill = mergedOptions.fill;
    this.strokeLineCap = mergedOptions.strokeLineCap;
    this.strokeLineJoin = mergedOptions.strokeLineJoin;
  }

  // ==========================================================================
  // ゲッター
  // ==========================================================================

  /** オブジェクトタイプを取得 */
  override get type(): string {
    return 'freehand';
  }

  /** パスデータを取得 */
  get pathData(): string {
    return this._pathData;
  }

  // ==========================================================================
  // スタイルの更新
  // ==========================================================================

  /**
   * 線色（本体色）を更新
   *
   * Task 81.1 (Req 32.3): 白縁取り（outlinePath）の色は常に白のまま維持する。
   * `freehand.stroke` は Group 自身のプロパティも同期更新し、既存 consumer の参照互換を保つ。
   */
  setStroke(color: string): void {
    this.stroke = color;
    this._bodyPath.set('stroke', color);
    this.set('stroke', color);
  }

  /**
   * 線の太さ（本体線幅）を更新
   *
   * Task 81.1 (Req 32.2): 白縁取り Path の線幅も `width + outline.width * 2` に同期更新する。
   * `freehand.strokeWidth` は Group 自身のプロパティも同期更新し、既存 consumer の参照互換を保つ。
   */
  setStrokeWidth(width: number): void {
    this.strokeWidth = width;
    this._bodyPath.set('strokeWidth', width);
    this._outlinePath.set('strokeWidth', width + this._outline.width * 2);
    this.set('strokeWidth', width);
  }

  /**
   * 塗りつぶし色を更新
   *
   * Task 81.1: フリーハンドは開放形状のため実描画では fill は使用しないが、
   * 既存 API 互換のために Group プロパティのみ更新する。
   * 両子 Path の fill は 'transparent' のまま維持する（design.md 5347 行）。
   */
  setFill(color: string): void {
    this.fill = color;
    this.set('fill', color);
  }

  /**
   * スタイルを一括で更新
   */
  setStyle(options: Partial<FreehandOptions>): void {
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
  getStyle(): Pick<FreehandOptions, 'stroke' | 'strokeWidth' | 'fill'> {
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
   * Task 81.1 (Req 32.1, 32.2):
   * - enabled=false のときは outlinePath.opacity=0（構造は保持）
   * - enabled=true のときは outlinePath.opacity=1 かつ stroke/width を再適用
   *
   * @param next 部分更新する属性
   */
  setOutline(next: Partial<ShapeOutlineAttribute>): void {
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
   * Task 81.1: outline 属性は 81.2 で追加予定。本タスクでは従来形式（白縁取り情報なし）を維持。
   */
  // @ts-expect-error - Fabric.js v6のtoObjectシグネチャとの互換性のため型を簡略化
  override toObject(): FreehandJSON {
    return {
      type: 'freehand' as const,
      pathData: this._pathData,
      stroke: this.stroke,
      strokeWidth: this.strokeWidth,
      fill: this.fill,
      strokeLineCap: this.strokeLineCap,
      strokeLineJoin: this.strokeLineJoin,
      left: this.left,
      top: this.top,
    };
  }

  /**
   * JSONオブジェクトからFreehandPathを復元する
   *
   * Fabric.js v6のenlivenObjectsで使用される静的メソッド。
   *
   * Task 81.1: outline 属性は 81.2 で追加予定。本タスクでは従来形式の復元のみ実装。
   *
   * @param object シリアライズされたJSONオブジェクト
   * @returns 復元されたFreehandPathインスタンス
   */
  static override fromObject(object: FreehandJSON): Promise<FreehandPath> {
    const freehand = new FreehandPath(object.pathData, {
      stroke: object.stroke,
      strokeWidth: object.strokeWidth,
      fill: object.fill,
      strokeLineCap: object.strokeLineCap as 'butt' | 'round' | 'square',
      strokeLineJoin: object.strokeLineJoin as 'bevel' | 'round' | 'miter',
    });

    // 移動後の位置を復元（後方互換性のためオプション）
    if (object.left !== undefined) {
      freehand.set('left', object.left);
    }
    if (object.top !== undefined) {
      freehand.set('top', object.top);
    }
    freehand.setCoords();

    return Promise.resolve(freehand);
  }
}

// ============================================================================
// FreehandBrushクラス
// ============================================================================

/**
 * フリーハンドブラシクラス
 *
 * Fabric.js PencilBrushを拡張したブラシ。
 * 滑らかなフリーハンド描画を提供する。
 */
export class FreehandBrush extends PencilBrush {
  /** 描画中フラグ */
  private _isDrawingFreehand: boolean = false;

  /** 描画中のポイント配列（シンプル版） */
  private _freehandPoints: Point[] = [];

  /** デシメート値 */
  declare decimate: number;

  /** ブラシオプション */
  private _options: Partial<FreehandOptions>;

  /**
   * FreehandBrushコンストラクタ
   *
   * @param canvas Fabric.jsキャンバス（オプション）
   * @param options オプション
   */
  constructor(canvas?: Canvas, options: Partial<FreehandOptions> = {}) {
    // 設定をマージ
    const mergedOptions = { ...DEFAULT_FREEHAND_OPTIONS, ...options };

    // PencilBrushを初期化
    // canvas がない場合は空のオブジェクトを渡す（テスト用）
    super(canvas as Canvas);

    // プロパティを設定
    this.color = mergedOptions.stroke;
    this.width = mergedOptions.strokeWidth;
    this.decimate = mergedOptions.decimate;
    this._options = options;
    this._isDrawingFreehand = false;
    this._freehandPoints = [];
  }

  // ==========================================================================
  // ゲッター
  // ==========================================================================

  /** 描画中かどうか */
  get isDrawing(): boolean {
    return this._isDrawingFreehand;
  }

  // ==========================================================================
  // 描画操作
  // ==========================================================================

  /**
   * マウスダウンイベント（描画開始）
   */
  override onMouseDown(pointer: Point | FabricPoint, ev?: TEvent<TPointerEvent>): void {
    this._isDrawingFreehand = true;
    this._freehandPoints = [{ x: pointer.x, y: pointer.y }];
    // Fabric.js v6では第2引数が必要
    if (ev) {
      super.onMouseDown(pointer as FabricPoint, ev);
    }
  }

  /**
   * マウスムーブイベント（描画継続）
   */
  override onMouseMove(pointer: Point | FabricPoint, ev?: TEvent<TPointerEvent>): void {
    if (!this._isDrawingFreehand) return;
    this._freehandPoints.push({ x: pointer.x, y: pointer.y });
    // Fabric.js v6では第2引数が必要
    if (ev) {
      super.onMouseMove(pointer as FabricPoint, ev);
    }
  }

  /**
   * マウスアップイベント（描画終了）
   * @returns Fabric.jsのonMouseUpはbooleanを返すが、テスト用にFreehandPathも返せるようにする
   */
  override onMouseUp(ev?: TEvent<TPointerEvent>): boolean {
    this._isDrawingFreehand = false;

    // ポイントが少なすぎる場合
    if (this._freehandPoints.length < MIN_POINT_COUNT) {
      this._freehandPoints = [];
      // 親クラスのonMouseUpを呼ぶ
      if (ev) {
        return super.onMouseUp(ev);
      }
      return false;
    }

    // パスデータを生成
    const pathData = this._generatePathData();

    // 結果を保持（Group ベース化済みなので outlinePath + bodyPath が透過的に作られる）
    this._lastCreatedPath = new FreehandPath(pathData, this._options);
    this._freehandPoints = [];

    // 親クラスのonMouseUpを呼ぶ
    if (ev) {
      return super.onMouseUp(ev);
    }
    return true;
  }

  /** 最後に作成されたパス */
  private _lastCreatedPath: FreehandPath | null = null;

  /**
   * 最後に作成されたパスを取得
   */
  getLastCreatedPath(): FreehandPath | null {
    return this._lastCreatedPath;
  }

  /**
   * ポイント数を取得
   */
  getPointCount(): number {
    return this._freehandPoints.length;
  }

  /**
   * 描画をキャンセル
   */
  cancel(): void {
    this._isDrawingFreehand = false;
    this._freehandPoints = [];
  }

  // ==========================================================================
  // スタイルの更新
  // ==========================================================================

  /**
   * 線色を更新
   */
  setColor(color: string): void {
    this.color = color;
    this._options.stroke = color;
  }

  /**
   * 線の太さを更新
   */
  setWidth(width: number): void {
    this.width = width;
    this._options.strokeWidth = width;
  }

  /**
   * デシメート値を更新
   */
  setDecimate(value: number): void {
    this.decimate = value;
    this._options.decimate = value;
  }

  // ==========================================================================
  // プライベートメソッド
  // ==========================================================================

  /**
   * ポイント配列からSVGパス文字列を生成
   */
  private _generatePathData(): string {
    if (this._freehandPoints.length === 0) {
      return '';
    }

    const firstPoint = this._freehandPoints[0];
    if (!firstPoint) {
      return '';
    }

    let pathData = `M ${firstPoint.x} ${firstPoint.y}`;

    for (let i = 1; i < this._freehandPoints.length; i++) {
      const point = this._freehandPoints[i];
      if (point) {
        pathData += ` L ${point.x} ${point.y}`;
      }
    }

    return pathData;
  }
}

// ============================================================================
// ファクトリ関数
// ============================================================================

/**
 * フリーハンドパスを作成するファクトリ関数
 *
 * @param pathData SVGパス文字列
 * @param options オプション
 * @returns フリーハンドパスオブジェクト、またはパスが無効な場合はnull
 */
export function createFreehandPath(
  pathData: string,
  options?: Partial<FreehandOptions>
): FreehandPath | null {
  // 空のパスデータの場合はnullを返す
  if (!pathData || pathData.trim() === '') {
    return null;
  }

  // パスデータにLコマンドがない場合（単一ポイント）はnullを返す
  if (!pathData.includes(' L ')) {
    return null;
  }

  // フリーハンドパスを作成
  return new FreehandPath(pathData, options);
}

/**
 * フリーハンドブラシを作成するファクトリ関数
 *
 * @param options オプション
 * @param canvas Fabric.jsキャンバス（オプション）
 * @returns フリーハンドブラシオブジェクト
 */
export function createFreehandBrush(
  options?: Partial<FreehandOptions>,
  canvas?: Canvas
): FreehandBrush {
  return new FreehandBrush(canvas, options);
}
