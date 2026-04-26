/**
 * @fileoverview 注釈エディタの視覚フィードバック基盤設定モジュール
 *
 * Task 71.1 (Req 29.4, 29.5): タッチ/マウス環境でハンドルサイズを切替える。
 * Task 71.2 (Req 29.2): ツール別カーソルを Canvas に適用する。
 *
 * 本モジュールは純粋な設定関数とマップ定数のみを提供し、副作用は
 * Fabric `FabricObject.ownDefaults` と渡された Canvas インスタンスへの
 * 書込みに限定する。
 *
 * Boundary: Visual Feedback
 *
 * @requirement site-survey/REQ-29.2
 * @requirement site-survey/REQ-29.4
 * @requirement site-survey/REQ-29.5
 */

import { FabricObject } from 'fabric';
import type { Canvas } from 'fabric';
import type { ToolType } from './annotation-toolbar.constants';

// ============================================================================
// ハンドルサイズ既定値 (Task 71.1 / Req 29.4, 29.5)
// ============================================================================

/**
 * タッチ環境用ハンドルサイズ（論理ピクセル）。
 *
 * - `cornerSize`: ハンドル本体の描画サイズ
 * - `touchCornerSize`: ヒット判定用拡張サイズ（Req 29.4: 概ね32x32論理ピクセル以上）
 */
const TOUCH_HANDLE = {
  cornerSize: 20,
  touchCornerSize: 40,
} as const;

/**
 * マウス環境用ハンドルサイズ（Fabric.js v6 既定値に準拠）。
 */
const MOUSE_HANDLE = {
  cornerSize: 13,
  touchCornerSize: 24,
} as const;

/**
 * `matchMedia('(pointer: coarse)').matches` を評価してタッチ環境かを判定する。
 *
 * SSR / Node テスト等で `window` または `matchMedia` が存在しない場合は
 * `false`（＝マウス既定値フォールバック）を返す。
 */
function isCoarsePointer(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  const mm = (window as Window & { matchMedia?: (q: string) => MediaQueryList }).matchMedia;
  if (typeof mm !== 'function') {
    return false;
  }
  try {
    return mm.call(window, '(pointer: coarse)').matches === true;
  } catch {
    return false;
  }
}

/**
 * 現在の入力デバイス種別に応じて Fabric の既定ハンドルサイズを設定する。
 *
 * 呼び出し後に新規作成された `FabricObject`（およびそのサブクラス）は、
 * 設定された `cornerSize` / `touchCornerSize` を `FabricObject.getDefaults()`
 * 経由で受け取る。
 *
 * - タッチ環境 (`matchMedia('(pointer: coarse)').matches === true`):
 *   - `cornerSize = 20`, `touchCornerSize = 40`
 * - マウス環境（上記以外、または matchMedia 不在）:
 *   - `cornerSize = 13`, `touchCornerSize = 24`
 *
 * Requirements: 29.4, 29.5
 */
export function configureHandleSizes(): void {
  const handle = isCoarsePointer() ? TOUCH_HANDLE : MOUSE_HANDLE;
  FabricObject.ownDefaults.cornerSize = handle.cornerSize;
  FabricObject.ownDefaults.touchCornerSize = handle.touchCornerSize;
}

// ============================================================================
// ツール別カーソルマップと適用関数 (Task 71.2 / Req 29.2)
// ============================================================================

/**
 * ツール別 CSS カーソル名マップ。
 *
 * - 選択ツール: `default`（通常ポインタ）
 * - テキストツール: `text`（Iビームカーソル、テキスト入力の可視化）
 * - 描画系ツール（矢印・寸法・円・四角・多角形・折れ線・フリーハンド）: `crosshair`
 *
 * Requirements: 29.2
 */
export const TOOL_CURSOR_MAP: Record<ToolType, string> = {
  select: 'default',
  arrow: 'crosshair',
  text: 'text',
  dimension: 'crosshair',
  circle: 'crosshair',
  rectangle: 'crosshair',
  polygon: 'crosshair',
  polyline: 'crosshair',
  freehand: 'crosshair',
};

/**
 * 指定された Canvas に対して、現在選択中ツールに対応するカーソルを適用する。
 *
 * `defaultCursor`（通常時）、`hoverCursor`（オブジェクト上）、
 * `freeDrawingCursor`（フリーハンド描画時）の 3 つを同一カーソルに揃え、
 * ツール選択中にマウス位置によってカーソルが揺らがないようにする。
 *
 * 未知のツール型が渡された場合は `default` にフォールバックする。
 *
 * @param canvas - 対象の Fabric Canvas
 * @param tool - 適用するツール
 *
 * Requirements: 29.2
 */
export function applyToolCursor(canvas: Canvas, tool: ToolType): void {
  const cursor = TOOL_CURSOR_MAP[tool] ?? 'default';
  canvas.defaultCursor = cursor;
  canvas.hoverCursor = cursor;
  canvas.freeDrawingCursor = cursor;
}
