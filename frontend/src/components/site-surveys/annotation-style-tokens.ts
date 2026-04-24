/**
 * @fileoverview 注釈ツール横断の既定スタイル値を一元管理するトークン
 *
 * Requirements:
 * - 26.1: 初期線幅を3論理ピクセル以上に設定する
 * - 26.2: 初期本体色を赤系またはオレンジ系の有彩色に設定する
 * - 26.3: 初回選択時に白縁取り/白アウトラインが有効な初期状態で起動する
 * - 26.5: 各ツールの既定色・既定線幅・既定白縁取り有無を一元管理する
 *
 * 既定本体色には `#e53935`（赤系）を採用。白縁取りと組み合わせたとき暗/明双方の
 * 背景で視認性が確保でき、既存の `DEFAULT_STYLE_OPTIONS.strokeColor = '#ff0000'`
 * に近い色調のため UX 上の連続性も維持される。
 */

import type { ToolType } from './annotation-toolbar.constants';

// ============================================================================
// 型定義
// ============================================================================

/**
 * 矢印の白縁取り属性
 *
 * design.md `ArrowOutlineAttribute` に対応。
 */
export interface ArrowOutlineAttribute {
  /** 白縁取りを描画するか */
  enabled: boolean;
  /** 白縁取りの色（将来拡張のためプロパティとして保持） */
  color: string;
  /** 白縁取りの片側幅。本体 strokeWidth * 0.75 を推奨既定 */
  width: number;
}

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
 * design.md `AnnotationToolDefaults` に対応。
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
 * ツール横断の既定スタイル値（Req 26.5: 一元管理）
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
  };
}
