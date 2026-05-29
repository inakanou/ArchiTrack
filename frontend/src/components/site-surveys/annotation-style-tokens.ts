/**
 * @fileoverview 注釈ツール横断の既定スタイル値を一元管理するトークン
 *
 * Requirements:
 * - 26.1: 初期線幅を3論理ピクセル以上に設定する
 * - 26.2: 初期本体色を赤系またはオレンジ系の有彩色に設定する
 * - 26.3: 初回選択時に白縁取り/白アウトラインが有効な初期状態で起動する
 * - 26.5: 各ツールの既定色・既定線幅・既定白縁取り有無を一元管理する
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
 * @requirement site-survey/REQ-32.11
 * @requirement site-survey/REQ-32.13
 */

import type { ToolType } from './annotation-toolbar.constants';

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
 * 形状白縁取りの既定幅
 *
 * design.md: 本体 strokeWidth * 0.75 を推奨既定（最低 2px を保証）。
 * 既存 arrowOutline と同パターンで、本体線幅 3 に対し ceil(3 * 0.75) = 3 を最低 2px と合わせて 3px。
 * 注釈: タスク指示では「2.25 切り上げで最低 2px」と明記されているため Math.ceil を採用し最低 2 を保証。
 */
const DEFAULT_SHAPE_OUTLINE_WIDTH = Math.max(2, Math.ceil(DEFAULT_STROKE_WIDTH * 0.75));

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
    // design.md: 本体 strokeWidth * 0.75 を推奨既定（最低 1px を保証）
    width: Math.max(1, Math.round(DEFAULT_STROKE_WIDTH * 0.75)),
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
};

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
  };
}
