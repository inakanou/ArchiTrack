/**
 * @fileoverview 寸法線ツール
 *
 * Task 14.1: 寸法線描画機能を実装する
 * Task 14.2: 寸法値入力機能を実装する
 * Task 14.3: 寸法線編集機能を実装する
 * Task 82.1: Dimension クラスを Group ベースへ再設計
 *            （outlineLine + bodyLine + labelText の 3 子構成、線部白縁取り）
 *
 * 2点クリックによる寸法線描画、端点間の直線と垂直線（エンドキャップ）、
 * 白縁取り付き Group 構造のカスタム Fabric.js オブジェクト実装、
 * 寸法値ラベル表示を行うモジュールです。
 *
 * Requirements:
 * - 6.1: 寸法線ツールを選択して2点をクリックすると2点間に寸法線を描画する
 * - 6.2: 寸法線が描画されると寸法値入力用のテキストフィールドを表示する
 * - 6.3: ユーザーが寸法値を入力すると寸法線上に数値とオプションの単位を表示する
 * - 6.4: 既存の寸法線をクリックすると寸法線を選択状態にして編集可能にする
 * - 6.5: 寸法線の端点をドラッグすると寸法線の位置を調整する
 * - 6.7: 寸法線の色・線の太さをカスタマイズ可能にする
 * - 32.1: 寸法線部に白色の縁取り線を付与する
 * - 32.2: 白縁取り線幅を本体線幅の 1.5 倍以上に設定する
 * - 32.3: 本体色を変更しても白縁取りは白のまま維持する
 * - 32.4: 移動・リサイズ・回転・形状変形（端点移動）時に本体と同期して白縁取りを変形する
 *
 * Task 82.1 設計メモ:
 * - 子 3 構成: `outlineLine`（白・幅広 Path） + `bodyLine`（本体色 Path） + `labelText`（FabricText）
 * - `outline.enabled = false` のときは `outlineLine.opacity = 0`（構造は維持）。labelText には影響しない
 * - labelText の白アウトライン（paintFirst）は **Task 82.2** で `labelOutline` 属性として独立適用
 * - toObject/fromObject の outline/labelOutline 拡張は **Task 82.3** で実装する
 *
 * @requirement site-survey/REQ-26.1
 * @requirement site-survey/REQ-26.5
 * @requirement site-survey/REQ-32.1
 * @requirement site-survey/REQ-32.2
 * @requirement site-survey/REQ-32.3
 * @requirement site-survey/REQ-32.4
 */

import { Path, FabricText, Group, type Canvas } from 'fabric';

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
  /** 背景色（Task 82.1 以降は子 labelText の背景描画なし。Task 82.3 のシリアライズ互換のため保持） */
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
 *
 * Task 64.3: 本体色/線幅は `ANNOTATION_DEFAULTS`（Req 26.5 一元管理トークン）を参照。
 * Req 26.1: 初期線幅は 3px 以上（ANNOTATION_DEFAULTS.strokeWidth）。
 * ラベル用の `DEFAULT_LABEL_STYLE` は本体色とは別の概念のため変更しない。
 */
export const DEFAULT_DIMENSION_OPTIONS: DimensionLineOptions = {
  stroke: ANNOTATION_DEFAULTS.stroke,
  strokeWidth: ANNOTATION_DEFAULTS.strokeWidth,
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
 * Fabric.js Group を拡張した寸法線オブジェクト。
 * - outlineLine: 白い縁取り Path（本体線幅 + outline.width × 2）
 * - bodyLine: 本体色の Path
 * - labelText: 寸法値表示 FabricText（白アウトラインは Task 82.2 で適用）
 * の 3 子から構成される。
 *
 * `type === 'dimensionLine'` は維持（classRegistry 後方互換）。
 *
 * Task 82.1 で `Path` 直接継承から `Group` ベースへ再設計。
 */
export class DimensionLine extends Group {
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

  /** 白縁取り属性（線部、Task 82.1） */
  private _outline: ShapeOutlineAttribute;

  /** 外側の白縁取り Path */
  private _outlineLine: Path;

  /** 本体色の Path */
  private _bodyLine: Path;

  /** Group 内の寸法値ラベル（FabricText） */
  private _labelText: FabricText;

  /** ラベルが描画中かどうか（labelText.text が非空のとき true） */
  private _hasLabel = false;

  /** ラベルスタイル */
  private _labelStyle: DimensionLabelStyle = { ...DEFAULT_LABEL_STYLE };

  /** 編集中フラグ（Task 14.3） */
  private _isEditing = false;

  /** 選択状態フラグ（Task 14.3） */
  private _isSelected = false;

  /** 線色（後方互換: Group 自体にもミラー設定） */
  declare stroke: string;

  /** 線の太さ（後方互換: Group 自体にもミラー設定） */
  declare strokeWidth: number;

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

    // SVGパスデータを生成（outlineLine と bodyLine で共有）
    const pathData = generateDimensionLinePath(startPoint, endPoint, mergedOptions.capLength);

    // 白縁取り属性（ANNOTATION_DEFAULTS から複製）
    const outline: ShapeOutlineAttribute = { ...ANNOTATION_DEFAULTS.dimensionOutline };

    // 外側 Path（白縁取り）を生成
    // Task 82.1 (Req 32.1, 32.2): outlineLine.strokeWidth = bodyStrokeWidth + outline.width * 2
    //   outlineLine.stroke = '#ffffff'
    const outlineLine = new Path(pathData, {
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
    const bodyLine = new Path(pathData, {
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

    // 寸法値ラベル（FabricText）を生成
    // Task 82.1 では空テキストで初期化。Task 82.2 で labelOutline (paintFirst) を適用する。
    const centerPos: Point = {
      x: (startPoint.x + endPoint.x) / 2,
      y: (startPoint.y + endPoint.y) / 2,
    };
    const labelText = new FabricText('', {
      fontSize: DEFAULT_LABEL_STYLE.fontSize,
      fill: DEFAULT_LABEL_STYLE.fontColor,
      fontFamily: 'Arial, sans-serif',
      left: centerPos.x,
      top: centerPos.y,
      originX: 'center',
      originY: 'center',
      selectable: false,
      evented: false,
    });

    // Group を初期化（outline → body → label の順で重ね、label が最上位に描画される）
    // 本体色/本体線幅は Group 自体にもミラー設定して、既存 consumer の `dim.stroke` /
    // `dim.strokeWidth` 参照（Task 82.1 以前の API）との後方互換を維持する。
    super([outlineLine, bodyLine, labelText], {
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
    this._capLength = mergedOptions.capLength;
    this._length = length;
    this._dimensionAngle = normalizeAngle(dimensionAngle);
    this._outline = outline;
    this._outlineLine = outlineLine;
    this._bodyLine = bodyLine;
    this._labelText = labelText;
    this.stroke = mergedOptions.stroke;
    this.strokeWidth = mergedOptions.strokeWidth;

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
   *
   * Task 82.1 (Req 32.4): outlineLine と bodyLine の双方に同一 path data を適用する。
   * labelText 位置も中央に追従する。
   */
  private _updateGeometry(): void {
    // 角度と距離を再計算
    this._dimensionAngle = normalizeAngle(calculateAngle(this._startPoint, this._endPoint));
    this._length = calculateDistance(this._startPoint, this._endPoint);

    // 新しいパスデータを生成
    const pathData = generateDimensionLinePath(this._startPoint, this._endPoint, this._capLength);

    // 両方の子 Path を更新（Fabric.js v6/v7 の内部 API）
    this._outlineLine._setPath(pathData);
    this._bodyLine._setPath(pathData);

    // labelText の中央位置を更新
    const centerPos = this._calculateCenterPosition();
    this._labelText.set({ left: centerPos.x, top: centerPos.y });

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
   * 線色（本体色）を更新
   *
   * Task 82.1 (Req 32.3): 白縁取り（outlineLine）の色は常に白のまま維持する。
   * `dim.stroke` は Group 自身のプロパティも同期更新し、既存 consumer の参照互換を保つ。
   */
  setStroke(color: string): void {
    this.stroke = color;
    this._bodyLine.set('stroke', color);
    this.set('stroke', color);
  }

  /**
   * 線の太さ（本体線幅）を更新
   *
   * Task 82.1 (Req 32.2): outlineLine の線幅も `width + outline.width * 2` に同期更新する。
   * `dim.strokeWidth` は Group 自身のプロパティも同期更新し、既存 consumer の参照互換を保つ。
   */
  setStrokeWidth(width: number): void {
    this.strokeWidth = width;
    this._bodyLine.set('strokeWidth', width);
    this._outlineLine.set('strokeWidth', width + this._outline.width * 2);
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
      stroke: (this._bodyLine.stroke as string) ?? this.stroke,
      strokeWidth: (this._bodyLine.strokeWidth as number) ?? this.strokeWidth,
      capLength: this._capLength,
    };
  }

  // ==========================================================================
  // 白縁取り属性の更新（Task 82.1）
  // ==========================================================================

  /**
   * 白縁取り属性を部分更新
   *
   * Task 82.1 (Req 32.1, 32.2, 32.3):
   * - enabled=false のときは outlineLine.opacity=0（構造は保持、labelText は影響を受けない）
   * - enabled=true のときは outlineLine.opacity=1 かつ stroke/width を再適用
   *
   * Polyline/Arrow と同方針で canvas にアタッチ済みなら `object:modified` イベントを発火する。
   *
   * @param next 部分更新する属性
   */
  setOutline(next: Partial<ShapeOutlineAttribute>): void {
    this._outline = { ...this._outline, ...next };

    if (this._outline.enabled) {
      const bodyStrokeWidth = (this._bodyLine.strokeWidth as number) ?? 0;
      this._outlineLine.set({
        opacity: 1,
        stroke: this._outline.color,
        strokeWidth: bodyStrokeWidth + this._outline.width * 2,
      });
    } else {
      this._outlineLine.set({ opacity: 0 });
    }

    // Arrow/Polyline と同方針: canvas にアタッチ済みなら object:modified を発火する。
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
  // ラベル機能（Task 14.2 / 82.1）
  //
  // Task 82.1 以降、labelText は Group の子として管理する。
  // 既存 API シグネチャ（Canvas を受け取る形）は維持し、内部実装を Group 子更新に
  // 切り替える。Canvas 引数は描画フラッシュ用に renderAll を呼ぶためだけに使用する。
  // ==========================================================================

  /**
   * 寸法値とラベルを設定して Group 内の labelText を更新
   *
   * @param canvas Fabric.js Canvas（renderAll 呼び出しに使用）
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

    // ラベルテキストを生成
    const labelText = unit ? `${value} ${unit}` : value;

    // labelText を更新
    this._labelText.set({
      text: labelText,
      fontSize: this._labelStyle.fontSize,
      fill: this._labelStyle.fontColor,
    });

    // 中央位置を更新
    const centerPos = this._calculateCenterPosition();
    this._labelText.set({ left: centerPos.x, top: centerPos.y });

    // 値が空ならラベル無し扱い、それ以外は有り扱い
    this._hasLabel = labelText.length > 0;

    canvas.renderAll();
  }

  /**
   * ラベルを削除（テキストを空にする）
   *
   * Task 82.1 以降、labelText は Group の子として常駐するため、
   * 外部 Canvas からの remove ではなく labelText.text を空にする。
   */
  removeLabelFromCanvas(canvas: Canvas): void {
    this._labelText.set({ text: '' });
    this._hasLabel = false;
    canvas.renderAll();
  }

  /**
   * ラベル位置を更新（DimensionLine 移動時に呼び出す）
   */
  updateLabelPosition(): void {
    const centerPos = this._calculateCenterPosition();
    this._labelText.set({ left: centerPos.x, top: centerPos.y });
  }

  /**
   * ラベルが存在するかどうか
   */
  hasLabel(): boolean {
    return this._hasLabel;
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

    // ラベル中の FabricText に対しても fontSize / fontColor を反映する。
    // 背景色は本実装（82.1）では描画しないが、シリアライズに含めるため保持する。
    if (style.fontSize !== undefined) {
      this._labelText.set('fontSize', style.fontSize);
    }
    if (style.fontColor !== undefined) {
      this._labelText.set('fill', style.fontColor);
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
  //
  // Note: Task 82.3 で outline / labelOutline を含む拡張シリアライズへ拡張する。
  // 本 82.1 では既存の DimensionLineJSON 形を維持する。
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
      stroke: (this._bodyLine.stroke as string) ?? this.stroke,
      strokeWidth: (this._bodyLine.strokeWidth as number) ?? this.strokeWidth,
      capLength: this._capLength,
      customData: { ...this.customData },
    };

    // ラベルがある場合はスタイルも含める
    if (this.hasLabel()) {
      result.labelStyle = { ...this._labelStyle };
    }

    return result;
  }

  /**
   * JSONオブジェクトからDimensionLineを復元する
   *
   * Fabric.js v6のenlivenObjectsで使用される静的メソッド。
   *
   * @param object シリアライズされたJSONオブジェクト
   * @returns 復元されたDimensionLineインスタンス
   */
  static override fromObject(object: DimensionLineJSON): Promise<DimensionLine> {
    const dimensionLine = new DimensionLine(object.startPoint, object.endPoint, {
      stroke: object.stroke,
      strokeWidth: object.strokeWidth,
      capLength: object.capLength,
    });

    // カスタムデータを復元
    if (object.customData) {
      dimensionLine.customData = { ...object.customData };
    }

    // ラベルスタイルを復元
    if (object.labelStyle) {
      dimensionLine.setLabelStyle(object.labelStyle);
    }

    return Promise.resolve(dimensionLine);
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
