/**
 * @fileoverview 注釈ツール横断の既定スタイル値を一元管理するトークン
 *
 * Requirements:
 * - 26.1: 初期線幅を3論理ピクセル以上に設定する
 * - 26.2: 初期本体色を赤系またはオレンジ系の有彩色に設定する
 * - 26.3: 初回選択時に白縁取り/白アウトラインが有効な初期状態で起動する
 * - 26.5: 各ツールの既定色・既定線幅・既定白縁取り有無を一元管理する
 * - 24.2: 矢印の白縁取り線幅を本体線幅の 1.5 倍以上の太さで付与する（比率を全線幅で満たす）
 * - 32.2: 白縁取り線幅を本体線幅の 1.5 倍以上の太さで付与する（比率を全線幅で満たす）
 * - 32.11: 寸法線・円・四角形・多角形・折れ線・フリーハンドの各ツール初回起動時に
 *          白縁取りが有効な初期状態でツールを起動する
 * - 32.13: 各対象ツールの既定白縁取り有無を Req 26 の設定資材一元管理の枠組みで管理する
 *
 * 既定本体色には `#e53935`（赤系）を採用。白縁取りと組み合わせたとき暗/明双方の
 * 背景で視認性が確保でき、既存の `DEFAULT_STYLE_OPTIONS.strokeColor = '#ff0000'`
 * に近い色調のため UX 上の連続性も維持される。
 *
 * @requirement site-survey/REQ-26.1
 * @requirement site-survey/REQ-26.2
 * @requirement site-survey/REQ-26.3
 * @requirement site-survey/REQ-26.5
 * @requirement site-survey/REQ-24.2
 * @requirement site-survey/REQ-32.2
 * @requirement site-survey/REQ-32.11
 * @requirement site-survey/REQ-32.13
 * @requirement site-survey/REQ-24.5
 * @requirement site-survey/REQ-25.2
 * @requirement site-survey/REQ-32.5
 */

import type { ToolType, OutlineCapableTool } from './annotation-toolbar.constants';

// ============================================================================
// 型定義
// ============================================================================

/**
 * 形状（矢印を含む）の白縁取り属性
 *
 * design.md `ShapeOutlineAttribute` に対応。
 * Task 75.1: 寸法線・円・四角形・多角形・折れ線・フリーハンドにも適用するため、
 * 共通型として導入。
 */
export interface ShapeOutlineAttribute {
  /** 白縁取りを描画するか */
  enabled: boolean;
  /** 白縁取りの色（将来拡張のためプロパティとして保持） */
  color: string;
  /** 白縁取りの片側幅。本体 strokeWidth * 0.75 を推奨既定 */
  width: number;
}

/**
 * 矢印の白縁取り属性
 *
 * design.md 5485 行の指針に従い、`ShapeOutlineAttribute` の型エイリアスとして定義。
 * 既存 `ArrowTool` の import 元は `ShapeOutlineAttribute` と同一の構造を受け取るため
 * 破壊変更にはならない。
 */
export type ArrowOutlineAttribute = ShapeOutlineAttribute;

/**
 * テキストの白アウトライン属性
 *
 * design.md `TextOutlineAttribute` に対応。
 */
export interface TextOutlineAttribute {
  /** 白アウトラインを描画するか */
  enabled: boolean;
  /** fontSize に対する比率 (0.10〜0.20) */
  widthRatio: number;
}

/**
 * 寸法値ラベルの既定スタイル属性
 *
 * Task 115.98 (Req 26.5): 従来は `DimensionTool.ts` の `DEFAULT_LABEL_STYLE` が
 * 一元管理の外で literal を持っていた。同じラベルの白アウトライン
 * （`dimensionLabelOutline`）は既に本ファイルにあり、`fontSize × widthRatio` という
 * 一つの算出式が二つの供給元をまたいでいた。型と既定値の双方を本ファイルへ移し、
 * 供給元を一つにする。宣言の移設であり既定値そのものは変えない。
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
 * ツール横断の既定スタイル値
 *
 * design.md `AnnotationToolDefaults` (Req 26) と `AnnotationToolDefaultsExt` (Req 32) を統合。
 */
export interface AnnotationToolDefaults {
  /** 既定本体色（赤系または橙系） */
  stroke: string;
  /** 既定線幅（3px 以上） */
  strokeWidth: number;
  /** 既定フォントサイズ */
  fontSize: number;
  /** 既定塗りつぶし（通常 '' 透明） */
  fill: string;
  /** 矢印の既定白縁取り（enabled: true） */
  arrowOutline: ArrowOutlineAttribute;
  /** テキストの既定白アウトライン（enabled: true） */
  textOutline: TextOutlineAttribute;
  /** 四角形の既定白縁取り（Req 32.11, 32.13） */
  rectangleOutline: ShapeOutlineAttribute;
  /** 円の既定白縁取り（Req 32.11, 32.13） */
  circleOutline: ShapeOutlineAttribute;
  /** 多角形の既定白縁取り（Req 32.11, 32.13） */
  polygonOutline: ShapeOutlineAttribute;
  /** 折れ線の既定白縁取り（Req 32.11, 32.13） */
  polylineOutline: ShapeOutlineAttribute;
  /** フリーハンドの既定白縁取り（Req 32.11, 32.13） */
  freehandOutline: ShapeOutlineAttribute;
  /** 寸法線の既定白縁取り（線部、Req 32.11, 32.13） */
  dimensionOutline: ShapeOutlineAttribute;
  /** 寸法値ラベルの既定白アウトライン（Req 32.12, 32.13） */
  dimensionLabelOutline: TextOutlineAttribute;
  /** 寸法値ラベルの既定スタイル（フォントサイズ・文字色・背景色、Req 26.5） */
  dimensionLabel: DimensionLabelStyle;
}

// ============================================================================
// 既定値
// ============================================================================

/**
 * 既定線幅（論理ピクセル）
 *
 * Req 26.1: モバイル画面でも明瞭に視認できる太さ（概ね3論理ピクセル以上）
 */
const DEFAULT_STROKE_WIDTH = 3;

/**
 * 既定本体色（赤系）
 *
 * Req 26.2: 白縁取りと組み合わせて暗/明両方の背景で視認可能な有彩色
 */
const DEFAULT_STROKE = '#e53935';

/**
 * 既定フォントサイズ（ピクセル）
 *
 * 既存 `DEFAULT_STYLE_OPTIONS.fontSize` と同値を採用し UX 連続性を維持。
 */
const DEFAULT_FONT_SIZE = 16;

/**
 * 既定塗りつぶし色（透明）
 */
const DEFAULT_FILL = '';

/**
 * 寸法値ラベルの既定フォントサイズ（ピクセル）
 *
 * Task 115.98: `DimensionTool.ts` の `DEFAULT_LABEL_STYLE.fontSize` が持っていた値を
 * そのまま移設した。ツール横断の `DEFAULT_FONT_SIZE`（16）とは別値である。寸法値ラベルは
 * 寸法線の中央に重ねて描く従属表示であり、テキスト注釈と同じ大きさにすると線を覆う。
 * 値の統一は既定の見た目を変える別の判断であり、本タスクの範囲外とする。
 */
const DIMENSION_LABEL_FONT_SIZE = 12;

/**
 * 寸法値ラベルの既定文字色
 *
 * Task 115.98: 本体色（`DEFAULT_STROKE` = 赤系）とは異なる値を維持する。要件26.2 が
 * 赤系/橙系を求めるのは「新規矢印・テキスト注釈の初期本体色」であり、寸法値ラベルの
 * 文字色はその対象ではない。ラベルは白アウトライン（`dimensionLabelOutline`）を伴って
 * 描画されるため、黒文字＋白縁で暗/明どちらの背景でも読める。
 */
const DIMENSION_LABEL_FONT_COLOR = '#000000';

/**
 * 寸法値ラベルの既定背景色
 *
 * Task 82.1 以降ラベルの背景は描画しないが、シリアライズ互換のため既定値を保持する。
 */
const DIMENSION_LABEL_BACKGROUND_COLOR = '#ffffff';

/**
 * 白縁取りの片側幅を本体線幅から算出する比率
 *
 * design.md 5427 行（6 形状）/ 4496 行（矢印）: 「片側幅。本体 strokeWidth * 0.75 を推奨既定」。
 * 矢印と 6 形状で同一の推奨既定が示されているため、比率は一つの定数として共有する。
 *
 * 「本体線幅の 1.5 倍以上」は描画される縁取り線幅の総幅を指す（design.md 5563 行の検証条件
 * `width >= bodyStrokeWidth * 0.75` に従う）。片側幅そのものを 1.5 倍と解すると、設計が示す
 * 推奨既定 0.75 倍が恒久的に要件違反となるため。
 */
const OUTLINE_WIDTH_RATIO = 0.75;

/**
 * 形状白縁取りの片側幅の下限（論理ピクセル）
 *
 * design.md: 本体 strokeWidth * 0.75 を推奨既定（最低 2px を保証）。
 */
const MIN_SHAPE_OUTLINE_WIDTH = 2;

/**
 * 本体線幅から形状白縁取りの片側幅を算出する（Req 32.2）
 *
 * Task 115.53: 従来は既定線幅 3 から算出した固定値を全形状・全線幅で共有していたため、
 * 縁取りの太さが「本体線幅への固定値の加算」で決まっていた。要件 32.2 が定めるのは
 * 比率（本体線幅の 1.5 倍以上）であり、固定値の加算では本体線幅が大きくなるほど比率が
 * 下がる。線幅の入力範囲は 1〜20（AnnotationToolbar / StylePanel）であり、固定値 3 の
 * 加算では本体線幅 13 以上で 1.5 倍を下回っていた。
 *
 * 本体線幅に比例させることで、描画される白縁取り線幅
 * （design.md 5407 行: `outlineShape.strokeWidth = bodyStrokeWidth + outlineWidth * 2`）は
 * 本体線幅の 2.5 倍となり、選択可能な全線幅で 1.5 倍以上を満たす。
 *
 * @param bodyStrokeWidth 本体線幅（論理ピクセル）
 * @returns 白縁取りの片側幅（論理ピクセル）
 */
export function resolveShapeOutlineWidth(bodyStrokeWidth: number): number {
  const effectiveBodyStrokeWidth =
    Number.isFinite(bodyStrokeWidth) && bodyStrokeWidth > 0
      ? bodyStrokeWidth
      : DEFAULT_STROKE_WIDTH;

  return Math.max(
    MIN_SHAPE_OUTLINE_WIDTH,
    Math.ceil(effectiveBodyStrokeWidth * OUTLINE_WIDTH_RATIO)
  );
}

/**
 * 矢印白縁取りの片側幅の下限（論理ピクセル）
 *
 * 矢印は 6 形状とは独立した既定項目であり、従来から下限 1px・四捨五入で運用してきた。
 * 既定線幅 3 に対する算出値（round(2.25) = 2）を維持するため、この丸め方を変えない。
 */
const MIN_ARROW_OUTLINE_WIDTH = 1;

/**
 * 本体線幅から矢印白縁取りの片側幅を算出する（Req 24.2）
 *
 * Task 115.59: 矢印の片側幅は既定線幅 3 から一度だけ算出した固定値 2 を全線幅で共有していたため、
 * 描画される縁取り線幅は「本体線幅 + 4」という固定値の加算で決まっていた。要件 24.2 が定めるのは
 * 比率（本体線幅の 1.5 倍以上）であり、固定値の加算では本体線幅が大きくなるほど比率が下がる。
 * 線幅の入力範囲は 1〜20（AnnotationToolbar / StylePanel）であり、本体線幅 8 でちょうど 1.5 倍、
 * 9 以上で下回っていた（6 形状の 13 より早く破綻していた）。
 *
 * 本体線幅に比例させることで、描画される白縁取り線幅
 * （design.md 4478 行: `outlinePath.strokeWidth = bodyStrokeWidth + outlineWidth * 2`）は
 * 概ね本体線幅の 2.5 倍となり、選択可能な全線幅で 1.5 倍以上を満たす。
 *
 * 丸めは 6 形状の `Math.ceil` ではなく矢印従来の `Math.round`、下限も 2 ではなく 1 を維持する。
 * これにより既定線幅 3 での片側幅は 2 のままとなり、既定の見た目を変えずに比率を満たせる。
 * 四捨五入による最悪ケースでも片側幅は `0.75 * body - 0.5` 以上であり、描画幅は
 * `2.5 * body - 1`（本体線幅 1 以上で常に `1.5 * body` 以上）となる。
 *
 * @param bodyStrokeWidth 本体線幅（論理ピクセル）
 * @returns 白縁取りの片側幅（論理ピクセル）
 */
export function resolveArrowOutlineWidth(bodyStrokeWidth: number): number {
  const effectiveBodyStrokeWidth =
    Number.isFinite(bodyStrokeWidth) && bodyStrokeWidth > 0
      ? bodyStrokeWidth
      : DEFAULT_STROKE_WIDTH;

  return Math.max(
    MIN_ARROW_OUTLINE_WIDTH,
    Math.round(effectiveBodyStrokeWidth * OUTLINE_WIDTH_RATIO)
  );
}

/**
 * 形状白縁取りの既定幅
 *
 * 既定線幅 3 に対する算出値（ceil(3 * 0.75) = 3、下限 2px と合わせて 3px）。
 */
const DEFAULT_SHAPE_OUTLINE_WIDTH = resolveShapeOutlineWidth(DEFAULT_STROKE_WIDTH);

/**
 * 形状白縁取りの既定オブジェクトを生成するファクトリ
 *
 * Req 32.11 / 32.13: 6 形状すべてで同一の既定値を共有する。
 */
function makeDefaultShapeOutline(): ShapeOutlineAttribute {
  return {
    enabled: true,
    color: '#ffffff',
    width: DEFAULT_SHAPE_OUTLINE_WIDTH,
  };
}

/**
 * ツール横断の既定スタイル値（Req 26.5 / Req 32.13: 一元管理）
 */
export const ANNOTATION_DEFAULTS: AnnotationToolDefaults = {
  stroke: DEFAULT_STROKE,
  strokeWidth: DEFAULT_STROKE_WIDTH,
  fontSize: DEFAULT_FONT_SIZE,
  fill: DEFAULT_FILL,
  arrowOutline: {
    enabled: true,
    color: '#ffffff',
    // Task 115.59 (Req 24.2): 既定線幅に対する算出値（round(3 * 0.75) = 2、下限 1px）。
    // 実際の片側幅は本体線幅から都度算出する（resolveArrowOutlineWidth）。
    width: resolveArrowOutlineWidth(DEFAULT_STROKE_WIDTH),
  },
  textOutline: {
    enabled: true,
    // design.md: 既定 widthRatio = 0.12（0.10〜0.20 の範囲内）
    widthRatio: 0.12,
  },
  // Req 32.11: 6 形状の白縁取りはすべて enabled: true で起動する
  rectangleOutline: makeDefaultShapeOutline(),
  circleOutline: makeDefaultShapeOutline(),
  polygonOutline: makeDefaultShapeOutline(),
  polylineOutline: makeDefaultShapeOutline(),
  freehandOutline: makeDefaultShapeOutline(),
  dimensionOutline: makeDefaultShapeOutline(),
  // Req 32.12: 寸法値ラベルは Req 25 のテキスト白アウトラインと同形（widthRatio: 0.12）
  dimensionLabelOutline: {
    enabled: true,
    widthRatio: 0.12,
  },
  // Req 26.5 / Task 115.98: 寸法値ラベルの既定スタイルも本資材が単一の供給元となる
  dimensionLabel: {
    fontSize: DIMENSION_LABEL_FONT_SIZE,
    fontColor: DIMENSION_LABEL_FONT_COLOR,
    backgroundColor: DIMENSION_LABEL_BACKGROUND_COLOR,
  },
};

/**
 * ツール別の既定白縁取り有無を生成する（Req 26.3 / 26.5 / 32.11 / 32.13）
 *
 * Task 115.96: 道具帯のスタイルパネルが持つ白縁取り切替の初期状態は、ツールごとの
 * 既定値を単一情報源である `ANNOTATION_DEFAULTS` から引く。切替UI側で真偽値を
 * literal として持つと、一元管理の資材と値が食い違う二つ目の供給元ができるため。
 *
 * 呼び出し側が値を変更しても内部状態が壊れないよう、毎回新しいオブジェクトを返す。
 *
 * @returns ツール別の白縁取り有効状態
 */
export function createDefaultOutlineEnabled(): Record<OutlineCapableTool, boolean> {
  return {
    arrow: ANNOTATION_DEFAULTS.arrowOutline.enabled,
    text: ANNOTATION_DEFAULTS.textOutline.enabled,
    dimension: ANNOTATION_DEFAULTS.dimensionOutline.enabled,
    circle: ANNOTATION_DEFAULTS.circleOutline.enabled,
    rectangle: ANNOTATION_DEFAULTS.rectangleOutline.enabled,
    polygon: ANNOTATION_DEFAULTS.polygonOutline.enabled,
    polyline: ANNOTATION_DEFAULTS.polylineOutline.enabled,
    freehand: ANNOTATION_DEFAULTS.freehandOutline.enabled,
  };
}

// ============================================================================
// API
// ============================================================================

/**
 * 指定されたツールの既定スタイル値を取得する
 *
 * 現時点では全ツールで共通の既定値を返す（ツール別差分は将来タスクで段階導入）。
 * 呼び出し側が値を変更しても内部状態が破壊されないよう、毎回新しいオブジェクトを返す。
 *
 * @param _tool ツール種別（現時点では未使用だがシグネチャ安定化のため受け取る）
 * @returns 当該ツールの既定スタイル値
 */
export function getToolDefaults(_tool: ToolType): AnnotationToolDefaults {
  return {
    stroke: ANNOTATION_DEFAULTS.stroke,
    strokeWidth: ANNOTATION_DEFAULTS.strokeWidth,
    fontSize: ANNOTATION_DEFAULTS.fontSize,
    fill: ANNOTATION_DEFAULTS.fill,
    arrowOutline: { ...ANNOTATION_DEFAULTS.arrowOutline },
    textOutline: { ...ANNOTATION_DEFAULTS.textOutline },
    rectangleOutline: { ...ANNOTATION_DEFAULTS.rectangleOutline },
    circleOutline: { ...ANNOTATION_DEFAULTS.circleOutline },
    polygonOutline: { ...ANNOTATION_DEFAULTS.polygonOutline },
    polylineOutline: { ...ANNOTATION_DEFAULTS.polylineOutline },
    freehandOutline: { ...ANNOTATION_DEFAULTS.freehandOutline },
    dimensionOutline: { ...ANNOTATION_DEFAULTS.dimensionOutline },
    dimensionLabelOutline: { ...ANNOTATION_DEFAULTS.dimensionLabelOutline },
    dimensionLabel: { ...ANNOTATION_DEFAULTS.dimensionLabel },
  };
}
