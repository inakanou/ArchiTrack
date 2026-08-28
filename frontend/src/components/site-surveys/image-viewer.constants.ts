/**
 * @fileoverview 画像ビューアの定数と型定義
 *
 * react-refresh/only-export-components 対応のため、定数・型をコンポーネント本体から切り出した
 * 共有モジュール。現在の参照元は `gestures/canvasViewportController`・`gestures/gesture-thresholds`・
 * `hooks/useCanvasViewport`・`construction-photos/ConstructionPhotoImageViewer` である
 * （切り出し元だった `ImageViewer.tsx` はタスク 115.146 で撤去済みである）。
 */

// ============================================================================
// 定数定義
// ============================================================================

/**
 * ズーム関連の定数
 * @description ズーム範囲制限（0.1x-10x）とズームステップを定義
 */
export const ZOOM_CONSTANTS = {
  /** 最小ズーム倍率 */
  MIN_ZOOM: 0.1,
  /** 最大ズーム倍率 */
  MAX_ZOOM: 10,
  /** ズームステップ（ボタン・キーボード操作時） */
  ZOOM_STEP: 0.1,
  /** マウスホイールズームの感度 */
  WHEEL_ZOOM_FACTOR: 0.001,
} as const;

/**
 * 回転関連の定数
 * @description 90度単位の回転ステップと許可される回転値を定義
 */
export const ROTATION_CONSTANTS = {
  /** 回転ステップ（度） */
  ROTATION_STEP: 90,
  /** 許可される回転値 */
  ROTATION_VALUES: [0, 90, 180, 270] as const,
} as const;

/** 回転角度の型 */
export type RotationAngle = (typeof ROTATION_CONSTANTS.ROTATION_VALUES)[number];

/**
 * パン関連の定数
 * @description ドラッグによる表示領域移動の設定を定義
 */
export const PAN_CONSTANTS = {
  /** パン機能が有効になる最小ズームレベル */
  MIN_PAN_ZOOM: 1.01,
  /** キーボードパン操作のステップ（ピクセル） */
  KEYBOARD_PAN_STEP: 50,
} as const;

/**
 * タッチ操作関連の定数
 * @description ピンチズームと2本指パン操作の設定を定義
 * Requirements: 5.5 - ピンチ操作を行う（タッチデバイス）とズームレベルを変更する
 * Requirements: 13.2 - タッチ操作に最適化された注釈ツールを提供する
 */
export const TOUCH_CONSTANTS = {
  /** ピンチズームの最小距離閾値（ピクセル） */
  PINCH_THRESHOLD: 10,
  /** ピンチズームの感度係数 */
  PINCH_ZOOM_FACTOR: 0.01,
} as const;
