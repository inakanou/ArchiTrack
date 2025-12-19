/**
 * @fileoverview 寸法線ツール
 *
 * Task 14.1: 寸法線描画機能を実装する
 * Task 14.2: 寸法値入力機能を実装する
 * Task 14.3: 寸法線編集機能を実装する
 *
 * 2点クリックによる寸法線描画、端点間の直線と垂直線（エンドキャップ）、
 * カスタムFabric.jsオブジェクト実装、寸法値ラベル表示を行うモジュールです。
 *
 * Requirements:
 * - 6.1: 寸法線ツールを選択して2点をクリックすると2点間に寸法線を描画する
 * - 6.2: 寸法線が描画されると寸法値入力用のテキストフィールドを表示する
 * - 6.3: ユーザーが寸法値を入力すると寸法線上に数値とオプションの単位を表示する
 * - 6.4: 既存の寸法線をクリックすると寸法線を選択状態にして編集可能にする
 * - 6.5: 寸法線の端点をドラッグすると寸法線の位置を調整する
 * - 6.7: 寸法線の色・線の太さをカスタマイズ可能にする
 */

import { Path, FabricText, Rect, type Canvas } from 'fabric';

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
 * 寸法線のカスタムデータ
 */
export interface DimensionCustomData {
  /** 寸法値（文字列） */
  dimensionValue: string;
  /** 寸法の単位 */
  dimensionUnit: string;
}

/**
 * 寸法線のオプション
 */
export interface DimensionLineOptions {
  /** 線色（HEXカラーコード） */
  stroke: string;
  /** 線の太さ */
  strokeWidth: number;
  /** エンドキャップの長さ */
  capLength: number;
}

/**
 * 寸法線ラベルのスタイルオプション
 */
export interface DimensionLabelStyle {
  /** フォントサイズ */
  fontSize: number;
  /** フォント色 */
  fontColor: string;
  /** 背景色 */
  backgroundColor: string;
}

/**
 * 寸法線のシリアライズ形式
 */
export interface DimensionLineJSON {
  type: 'dimensionLine';
  startPoint: Point;
  endPoint: Point;
  stroke: string;
  strokeWidth: number;
  capLength: number;
  customData: DimensionCustomData;
  labelStyle?: DimensionLabelStyle;
}

// ============================================================================
// 定数定義
// ============================================================================

/**
 * デフォルトの寸法線オプション
 */
export const DEFAULT_DIMENSION_OPTIONS: DimensionLineOptions = {
  stroke: '#000000',
  strokeWidth: 2,
  capLength: 10,
};

/**
 * デフォルトのラベルスタイル
 */
export const DEFAULT_LABEL_STYLE: DimensionLabelStyle = {
  fontSize: 12,
  fontColor: '#000000',
  backgroundColor: '#ffffff',
};

/**
 * 寸法線を作成する最小距離（ピクセル）
 */
const MIN_DIMENSION_DISTANCE = 5;

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

/**
 * エンドキャップの端点を計算する
 *
 * メインラインに垂直な線を描画するため、
 * 90度回転した方向に端点を配置する
 */
function calculateCapEndpoints(
  point: Point,
  angleRad: number,
  capLength: number
): { start: Point; end: Point } {
  // メインラインに垂直な方向（90度回転）
  const perpAngle = angleRad + Math.PI / 2;
  const halfLength = capLength / 2;

  return {
    start: {
      x: point.x + halfLength * Math.cos(perpAngle),
      y: point.y + halfLength * Math.sin(perpAngle),
    },
    end: {
      x: point.x - halfLength * Math.cos(perpAngle),
      y: point.y - halfLength * Math.sin(perpAngle),
    },
  };
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
 * 寸法線のSVGパスデータを生成
 *
 * @param startPoint 始点
 * @param endPoint 終点
 * @param capLength エンドキャップの長さ
 * @returns SVGパスデータ文字列
 */
function generateDimensionLinePath(startPoint: Point, endPoint: Point, capLength: number): string {
  // 角度（ラジアン）
  const angle = calculateAngleRad(startPoint, endPoint);

  // 始点のエンドキャップ端点を計算
  const startCap = calculateCapEndpoints(startPoint, angle, capLength);

  // 終点のエンドキャップ端点を計算
  const endCap = calculateCapEndpoints(endPoint, angle, capLength);

  // SVGパスを生成
  // メインライン: 始点から終点
  // 始点キャップ: 垂直線
  // 終点キャップ: 垂直線
  const pathData = [
    // メインライン
    `M ${startPoint.x} ${startPoint.y}`,
    `L ${endPoint.x} ${endPoint.y}`,
    // 始点のエンドキャップ
    `M ${startCap.start.x} ${startCap.start.y}`,
    `L ${startCap.end.x} ${startCap.end.y}`,
    // 終点のエンドキャップ
    `M ${endCap.start.x} ${endCap.start.y}`,
    `L ${endCap.end.x} ${endCap.end.y}`,
  ].join(' ');

  return pathData;
}

// ============================================================================
// DimensionLineクラス
// ============================================================================

/**
 * 寸法線クラス
 *
 * Fabric.js Pathを拡張した寸法線オブジェクト。
 * メインライン（端点間の直線）と2つのエンドキャップ（垂直線）で構成される。
 *
 * Note: ラベル機能は外部のCanvas上で別オブジェクトとして管理する。
 * addLabelToCanvas() / removeLabelFromCanvas() を使用。
 */
export class DimensionLine extends Path {
  /** 始点 */
  private _startPoint: Point;

  /** 終点 */
  private _endPoint: Point;

  /** エンドキャップの長さ */
  private _capLength: number;

  /** 寸法線の長さ（ピクセル） */
  private _length: number;

  /** 寸法線の角度（度） */
  private _dimensionAngle: number;

  /** カスタムデータ */
  customData: DimensionCustomData;

  /** ラベルテキスト（Canvas上に別途追加される） */
  private _labelText: FabricText | null = null;

  /** ラベル背景（Canvas上に別途追加される） */
  private _labelBackground: Rect | null = null;

  /** ラベルスタイル */
  private _labelStyle: DimensionLabelStyle = { ...DEFAULT_LABEL_STYLE };

  /** 編集中フラグ（Task 14.3） */
  private _isEditing = false;

  /** 選択状態フラグ（Task 14.3） */
  private _isSelected = false;

  /**
   * DimensionLineコンストラクタ
   *
   * @param startPoint 始点
   * @param endPoint 終点
   * @param options オプション
   */
  constructor(startPoint: Point, endPoint: Point, options: Partial<DimensionLineOptions> = {}) {
    // 設定をマージ
    const mergedOptions = { ...DEFAULT_DIMENSION_OPTIONS, ...options };

    // 角度と距離を計算
    const dimensionAngle = calculateAngle(startPoint, endPoint);
    const length = calculateDistance(startPoint, endPoint);

    // SVGパスデータを生成
    const pathData = generateDimensionLinePath(startPoint, endPoint, mergedOptions.capLength);

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
    this._capLength = mergedOptions.capLength;
    this._length = length;
    this._dimensionAngle = normalizeAngle(dimensionAngle);

    // カスタムデータを初期化
    this.customData = {
      dimensionValue: '',
      dimensionUnit: '',
    };
  }

  // ==========================================================================
  // ゲッター
  // ==========================================================================

  /** オブジェクトタイプを取得 */
  override get type(): string {
    return 'dimensionLine';
  }

  /** 始点を取得 */
  get startPoint(): Point {
    return { ...this._startPoint };
  }

  /** 終点を取得 */
  get endPoint(): Point {
    return { ...this._endPoint };
  }

  /** 寸法線の長さを取得（ピクセル） */
  get length(): number {
    return this._length;
  }

  /** 寸法線の角度を取得（度） */
  get dimensionAngle(): number {
    return this._dimensionAngle;
  }

  /** メインラインの情報を取得 */
  get mainLine(): LineInfo {
    return {
      x1: this._startPoint.x,
      y1: this._startPoint.y,
      x2: this._endPoint.x,
      y2: this._endPoint.y,
    };
  }

  /** 始点エンドキャップの情報を取得 */
  get startCap(): LineInfo {
    const angleRad = calculateAngleRad(this._startPoint, this._endPoint);
    const capPoints = calculateCapEndpoints(this._startPoint, angleRad, this._capLength);
    return {
      x1: capPoints.start.x,
      y1: capPoints.start.y,
      x2: capPoints.end.x,
      y2: capPoints.end.y,
    };
  }

  /** 終点エンドキャップの情報を取得 */
  get endCap(): LineInfo {
    const angleRad = calculateAngleRad(this._startPoint, this._endPoint);
    const capPoints = calculateCapEndpoints(this._endPoint, angleRad, this._capLength);
    return {
      x1: capPoints.start.x,
      y1: capPoints.start.y,
      x2: capPoints.end.x,
      y2: capPoints.end.y,
    };
  }

  /** 水平な寸法線かどうか */
  get isHorizontal(): boolean {
    return Math.abs(this._startPoint.y - this._endPoint.y) < 0.001;
  }

  /** 垂直な寸法線かどうか */
  get isVertical(): boolean {
    return Math.abs(this._startPoint.x - this._endPoint.x) < 0.001;
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
   * 両端点を取得（Task 14.3）
   */
  getEndpoints(): { start: Point; end: Point } {
    return {
      start: { ...this._startPoint },
      end: { ...this._endPoint },
    };
  }

  /**
   * 両端点を同時に更新（Task 14.3）
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
    this._dimensionAngle = normalizeAngle(calculateAngle(this._startPoint, this._endPoint));
    this._length = calculateDistance(this._startPoint, this._endPoint);

    // 新しいパスデータを生成
    const pathData = generateDimensionLinePath(this._startPoint, this._endPoint, this._capLength);

    // パスを更新（Fabric.js v6のAPIを使用）
    this._setPath(pathData);

    // 座標を更新
    this.setCoords();
  }

  /**
   * 中央位置を計算
   */
  private _calculateCenterPosition(): Point {
    return {
      x: (this._startPoint.x + this._endPoint.x) / 2,
      y: (this._startPoint.y + this._endPoint.y) / 2,
    };
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
   * スタイルを一括で更新（Task 14.3）
   */
  setStyle(options: Partial<DimensionLineOptions>): void {
    if (options.stroke !== undefined) {
      this.setStroke(options.stroke);
    }
    if (options.strokeWidth !== undefined) {
      this.setStrokeWidth(options.strokeWidth);
    }
    if (options.capLength !== undefined) {
      this._capLength = options.capLength;
      // エンドキャップを再計算
      this._updateGeometry();
    }
  }

  /**
   * 現在のスタイルを取得（Task 14.3）
   */
  getStyle(): DimensionLineOptions {
    return {
      stroke: this.stroke as string,
      strokeWidth: this.strokeWidth as number,
      capLength: this._capLength,
    };
  }

  // ==========================================================================
  // 寸法値の管理
  // ==========================================================================

  /**
   * 寸法値を設定
   */
  setDimensionValue(value: string): void {
    this.customData.dimensionValue = value;
  }

  /**
   * 寸法の単位を設定
   */
  setDimensionUnit(unit: string): void {
    this.customData.dimensionUnit = unit;
  }

  /**
   * 寸法値と単位を同時に設定
   */
  setDimension(value: string, unit: string): void {
    this.customData.dimensionValue = value;
    this.customData.dimensionUnit = unit;
  }

  /**
   * フォーマット済み寸法文字列を取得
   */
  getFormattedDimension(): string {
    if (!this.customData.dimensionValue) {
      return '';
    }
    if (!this.customData.dimensionUnit) {
      return this.customData.dimensionValue;
    }
    return `${this.customData.dimensionValue} ${this.customData.dimensionUnit}`;
  }

  // ==========================================================================
  // ラベル機能（Task 14.2）- 外部Canvas管理方式
  // ==========================================================================

  /**
   * 寸法値とラベルを設定してCanvasに追加
   *
   * @param canvas Fabric.js Canvas
   * @param value 寸法値
   * @param unit 単位
   * @param style ラベルスタイル（オプション）
   */
  setDimensionWithLabel(
    canvas: Canvas,
    value: string,
    unit: string,
    style?: Partial<DimensionLabelStyle>
  ): void {
    // customDataを更新
    this.customData.dimensionValue = value;
    this.customData.dimensionUnit = unit;

    // スタイルをマージ
    if (style) {
      this._labelStyle = { ...this._labelStyle, ...style };
    }

    // 空の値の場合はラベルを削除
    if (!value) {
      this.removeLabelFromCanvas(canvas);
      return;
    }

    // ラベルテキストを生成
    const labelText = unit ? `${value} ${unit}` : value;

    // 既存のラベルがある場合は更新、なければ作成
    if (this._labelText) {
      this._updateLabelText(labelText);
      canvas.renderAll();
    } else {
      this._createLabelOnCanvas(canvas, labelText);
    }
  }

  /**
   * ラベルをCanvasに作成
   */
  private _createLabelOnCanvas(canvas: Canvas, text: string): void {
    const centerPos = this._calculateCenterPosition();
    const padding = 4;

    // テキストを作成
    this._labelText = new FabricText(text, {
      fontSize: this._labelStyle.fontSize,
      fill: this._labelStyle.fontColor,
      fontFamily: 'Arial, sans-serif',
      selectable: false,
      evented: false,
    });

    // テキストサイズを取得
    const textWidth = this._labelText.width || 0;
    const textHeight = this._labelText.height || 0;

    // テキストを中央に配置
    this._labelText.set({
      left: centerPos.x - textWidth / 2,
      top: centerPos.y - textHeight / 2,
    });

    // 背景を作成
    this._labelBackground = new Rect({
      left: centerPos.x - textWidth / 2 - padding,
      top: centerPos.y - textHeight / 2 - padding,
      width: textWidth + padding * 2,
      height: textHeight + padding * 2,
      fill: this._labelStyle.backgroundColor,
      selectable: false,
      evented: false,
    });

    // Canvasに追加（背景を先に追加）
    canvas.add(this._labelBackground);
    canvas.add(this._labelText);
    canvas.renderAll();
  }

  /**
   * ラベルテキストを更新
   */
  private _updateLabelText(text: string): void {
    if (this._labelText && this._labelBackground) {
      const centerPos = this._calculateCenterPosition();
      const padding = 4;

      // テキストを更新
      this._labelText.set({
        text: text,
        fontSize: this._labelStyle.fontSize,
        fill: this._labelStyle.fontColor,
      });

      // テキストサイズを再取得
      const textWidth = this._labelText.width || 0;
      const textHeight = this._labelText.height || 0;

      // テキストを中央に配置
      this._labelText.set({
        left: centerPos.x - textWidth / 2,
        top: centerPos.y - textHeight / 2,
      });

      // 背景を更新
      this._labelBackground.set({
        left: centerPos.x - textWidth / 2 - padding,
        top: centerPos.y - textHeight / 2 - padding,
        width: textWidth + padding * 2,
        height: textHeight + padding * 2,
        fill: this._labelStyle.backgroundColor,
      });
    }
  }

  /**
   * ラベルをCanvasから削除
   */
  removeLabelFromCanvas(canvas: Canvas): void {
    if (this._labelText) {
      canvas.remove(this._labelText);
      this._labelText = null;
    }
    if (this._labelBackground) {
      canvas.remove(this._labelBackground);
      this._labelBackground = null;
    }
    canvas.renderAll();
  }

  /**
   * ラベル位置を更新（DimensionLine移動時に呼び出す）
   */
  updateLabelPosition(): void {
    if (this._labelText && this._labelBackground) {
      const centerPos = this._calculateCenterPosition();
      const textWidth = this._labelText.width || 0;
      const textHeight = this._labelText.height || 0;
      const padding = 4;

      // ラベルテキストを中央に配置
      this._labelText.set({
        left: centerPos.x - textWidth / 2,
        top: centerPos.y - textHeight / 2,
      });

      // 背景も更新
      this._labelBackground.set({
        left: centerPos.x - textWidth / 2 - padding,
        top: centerPos.y - textHeight / 2 - padding,
        width: textWidth + padding * 2,
        height: textHeight + padding * 2,
      });
    }
  }

  /**
   * ラベルが存在するかどうか
   */
  hasLabel(): boolean {
    return this._labelText !== null;
  }

  /**
   * ラベル位置を取得
   */
  getLabelPosition(): Point {
    return this._calculateCenterPosition();
  }

  /**
   * ラベルテキストを取得
   */
  getLabelText(): string {
    return this.getFormattedDimension();
  }

  /**
   * ラベルスタイルを取得
   */
  getLabelStyle(): DimensionLabelStyle {
    return { ...this._labelStyle };
  }

  /**
   * ラベルスタイルを個別に更新（Task 14.3）
   */
  setLabelStyle(style: Partial<DimensionLabelStyle>): void {
    this._labelStyle = { ...this._labelStyle, ...style };

    // ラベルが存在する場合は更新を反映
    if (this._labelText) {
      if (style.fontSize !== undefined) {
        this._labelText.set('fontSize', style.fontSize);
      }
      if (style.fontColor !== undefined) {
        this._labelText.set('fill', style.fontColor);
      }
    }
    if (this._labelBackground && style.backgroundColor !== undefined) {
      this._labelBackground.set('fill', style.backgroundColor);
    }
  }

  // ==========================================================================
  // 編集状態管理（Task 14.3）
  // ==========================================================================

  /**
   * 編集中かどうかを取得
   */
  get isEditing(): boolean {
    return this._isEditing;
  }

  /**
   * 編集を開始
   */
  startEditing(): void {
    this._isEditing = true;
  }

  /**
   * 編集を終了
   */
  stopEditing(): void {
    this._isEditing = false;
  }

  // ==========================================================================
  // 選択状態管理（Task 14.3）
  // ==========================================================================

  /**
   * 選択状態かどうかを取得
   */
  get isSelected(): boolean {
    return this._isSelected;
  }

  /**
   * 選択状態を設定
   */
  setSelected(selected: boolean): void {
    this._isSelected = selected;
  }

  // ==========================================================================
  // シリアライズ
  // ==========================================================================

  /**
   * オブジェクトをJSON形式にシリアライズ
   */
  // @ts-expect-error - Fabric.js v6のtoObjectシグネチャとの互換性のため型を簡略化
  override toObject(): DimensionLineJSON {
    const result: DimensionLineJSON = {
      type: 'dimensionLine' as const,
      startPoint: this.startPoint,
      endPoint: this.endPoint,
      stroke: this.stroke as string,
      strokeWidth: this.strokeWidth as number,
      capLength: this._capLength,
      customData: { ...this.customData },
    };

    // ラベルがある場合はスタイルも含める
    if (this.hasLabel()) {
      result.labelStyle = { ...this._labelStyle };
    }

    return result;
  }
}

// ============================================================================
// ファクトリ関数
// ============================================================================

/**
 * 寸法線を作成するファクトリ関数
 *
 * @param startPoint 始点
 * @param endPoint 終点
 * @param options オプション
 * @returns 寸法線オブジェクト、または距離が短すぎる場合はnull
 */
export function createDimensionLine(
  startPoint: Point,
  endPoint: Point,
  options?: Partial<DimensionLineOptions>
): DimensionLine | null {
  // 2点間の距離を計算
  const distance = calculateDistance(startPoint, endPoint);

  // 距離が短すぎる場合はnullを返す
  if (distance < MIN_DIMENSION_DISTANCE) {
    return null;
  }

  // 寸法線を作成
  return new DimensionLine(startPoint, endPoint, options);
}
