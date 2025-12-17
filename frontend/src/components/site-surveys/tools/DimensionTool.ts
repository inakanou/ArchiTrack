/**
 * @fileoverview 寸法線ツール
 *
 * Task 14.1: 寸法線描画機能を実装する
 * Task 14.2: 寸法値入力機能を実装する
 *
 * 2点クリックによる寸法線描画、端点間の直線と垂直線（エンドキャップ）、
 * カスタムFabric.jsオブジェクト実装、寸法値ラベル表示を行うモジュールです。
 *
 * Requirements:
 * - 6.1: 寸法線ツールを選択して2点をクリックすると2点間に寸法線を描画する
 * - 6.2: 寸法線が描画されると寸法値入力用のテキストフィールドを表示する
 * - 6.3: ユーザーが寸法値を入力すると寸法線上に数値とオプションの単位を表示する
 */

import { Group, Line, FabricText, Rect } from 'fabric';

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
  deg: number,
  capLength: number
): { start: Point; end: Point } {
  // メインラインに垂直な方向（90度回転）
  const perpAngle = deg + 90;
  const radians = perpAngle * (Math.PI / 180);
  const halfLength = capLength / 2;

  return {
    start: {
      x: point.x + halfLength * Math.cos(radians),
      y: point.y + halfLength * Math.sin(radians),
    },
    end: {
      x: point.x - halfLength * Math.cos(radians),
      y: point.y - halfLength * Math.sin(radians),
    },
  };
}

// ============================================================================
// DimensionLineクラス
// ============================================================================

/**
 * 寸法線クラス
 *
 * Fabric.js Groupを拡張した寸法線オブジェクト。
 * メインライン（端点間の直線）と2つのエンドキャップ（垂直線）で構成される。
 */
export class DimensionLine extends Group {
  /** 始点 */
  private _startPoint: Point;

  /** 終点 */
  private _endPoint: Point;

  /** 線色 */
  declare stroke: string;

  /** 線の太さ */
  declare strokeWidth: number;

  /** エンドキャップの長さ */
  private _capLength: number;

  /** メインライン */
  private _mainLine: Line;

  /** 始点のエンドキャップ */
  private _startCap: Line;

  /** 終点のエンドキャップ */
  private _endCap: Line;

  /** 寸法線の長さ（ピクセル） */
  private _length: number;

  /** 寸法線の角度（度） */
  private _dimensionAngle: number;

  /** カスタムデータ */
  declare customData: DimensionCustomData;

  /** ラベルテキスト */
  private _labelText: FabricText | null = null;

  /** ラベル背景 */
  private _labelBackground: Rect | null = null;

  /** ラベルスタイル */
  private _labelStyle: DimensionLabelStyle = { ...DEFAULT_LABEL_STYLE };

  /** コントロール表示フラグ */
  declare hasControls: boolean;

  /** ボーダー表示フラグ */
  declare hasBorders: boolean;

  /** X軸移動ロック */
  declare lockMovementX: boolean;

  /** Y軸移動ロック */
  declare lockMovementY: boolean;

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

    // メインラインを作成
    const mainLine = new Line([startPoint.x, startPoint.y, endPoint.x, endPoint.y], {
      stroke: mergedOptions.stroke,
      strokeWidth: mergedOptions.strokeWidth,
      selectable: false,
      evented: false,
    });

    // 始点のエンドキャップを計算・作成
    const startCapPoints = calculateCapEndpoints(
      startPoint,
      dimensionAngle,
      mergedOptions.capLength
    );
    const startCap = new Line(
      [startCapPoints.start.x, startCapPoints.start.y, startCapPoints.end.x, startCapPoints.end.y],
      {
        stroke: mergedOptions.stroke,
        strokeWidth: mergedOptions.strokeWidth,
        selectable: false,
        evented: false,
      }
    );

    // 終点のエンドキャップを計算・作成
    const endCapPoints = calculateCapEndpoints(endPoint, dimensionAngle, mergedOptions.capLength);
    const endCap = new Line(
      [endCapPoints.start.x, endCapPoints.start.y, endCapPoints.end.x, endCapPoints.end.y],
      {
        stroke: mergedOptions.stroke,
        strokeWidth: mergedOptions.strokeWidth,
        selectable: false,
        evented: false,
      }
    );

    // Groupを初期化
    super([mainLine, startCap, endCap], {
      hasControls: true,
      hasBorders: true,
      lockMovementX: false,
      lockMovementY: false,
      subTargetCheck: false,
    });

    // プロパティを設定
    this._startPoint = { ...startPoint };
    this._endPoint = { ...endPoint };
    this.stroke = mergedOptions.stroke;
    this.strokeWidth = mergedOptions.strokeWidth;
    this._capLength = mergedOptions.capLength;
    this._mainLine = mainLine;
    this._startCap = startCap;
    this._endCap = endCap;
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
  // @ts-expect-error - Fabric.js v6ではangleがプロパティとして定義されているが、計算済みの値を返す
  override get angle(): number {
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
    const capPoints = calculateCapEndpoints(
      this._startPoint,
      calculateAngle(this._startPoint, this._endPoint),
      this._capLength
    );
    return {
      x1: capPoints.start.x,
      y1: capPoints.start.y,
      x2: capPoints.end.x,
      y2: capPoints.end.y,
    };
  }

  /** 終点エンドキャップの情報を取得 */
  get endCap(): LineInfo {
    const capPoints = calculateCapEndpoints(
      this._endPoint,
      calculateAngle(this._startPoint, this._endPoint),
      this._capLength
    );
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
   * ジオメトリを更新（端点変更時）
   */
  private _updateGeometry(): void {
    // 角度と距離を再計算
    this._dimensionAngle = normalizeAngle(calculateAngle(this._startPoint, this._endPoint));
    this._length = calculateDistance(this._startPoint, this._endPoint);

    // メインラインを更新
    this._mainLine.set({
      x1: this._startPoint.x,
      y1: this._startPoint.y,
      x2: this._endPoint.x,
      y2: this._endPoint.y,
    });

    // 始点キャップを更新
    const startCapPoints = calculateCapEndpoints(
      this._startPoint,
      calculateAngle(this._startPoint, this._endPoint),
      this._capLength
    );
    this._startCap.set({
      x1: startCapPoints.start.x,
      y1: startCapPoints.start.y,
      x2: startCapPoints.end.x,
      y2: startCapPoints.end.y,
    });

    // 終点キャップを更新
    const endCapPoints = calculateCapEndpoints(
      this._endPoint,
      calculateAngle(this._startPoint, this._endPoint),
      this._capLength
    );
    this._endCap.set({
      x1: endCapPoints.start.x,
      y1: endCapPoints.start.y,
      x2: endCapPoints.end.x,
      y2: endCapPoints.end.y,
    });

    // ラベル位置を更新
    this._updateLabelPosition();

    // 座標を更新
    this.setCoords();
  }

  /**
   * ラベル位置を更新（端点変更時）
   */
  private _updateLabelPosition(): void {
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
    this.stroke = color;
    this._mainLine.set('stroke', color);
    this._startCap.set('stroke', color);
    this._endCap.set('stroke', color);
  }

  /**
   * 線の太さを更新
   */
  setStrokeWidth(width: number): void {
    this.strokeWidth = width;
    this._mainLine.set('strokeWidth', width);
    this._startCap.set('strokeWidth', width);
    this._endCap.set('strokeWidth', width);
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
  // ラベル機能（Task 14.2）
  // ==========================================================================

  /**
   * 寸法値とラベルを設定
   *
   * @param value 寸法値
   * @param unit 単位
   * @param style ラベルスタイル（オプション）
   */
  setDimensionWithLabel(value: string, unit: string, style?: Partial<DimensionLabelStyle>): void {
    // customDataを更新
    this.customData.dimensionValue = value;
    this.customData.dimensionUnit = unit;

    // スタイルをマージ
    if (style) {
      this._labelStyle = { ...this._labelStyle, ...style };
    }

    // 空の値の場合はラベルを削除
    if (!value) {
      this._removeLabel();
      return;
    }

    // ラベルテキストを生成
    const labelText = unit ? `${value} ${unit}` : value;

    // 既存のラベルがある場合は更新、なければ作成
    if (this._labelText) {
      this._updateLabelText(labelText);
    } else {
      this._createLabel(labelText);
    }
  }

  /**
   * ラベルを作成
   */
  private _createLabel(text: string): void {
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

    // グループに追加（背景を先に追加）
    this.add(this._labelBackground);
    this.add(this._labelText);
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

      // テキストサイズを再計得
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
   * ラベルを削除
   */
  private _removeLabel(): void {
    if (this._labelText) {
      this.remove(this._labelText);
      this._labelText = null;
    }
    if (this._labelBackground) {
      this.remove(this._labelBackground);
      this._labelBackground = null;
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
      stroke: this.stroke,
      strokeWidth: this.strokeWidth,
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
