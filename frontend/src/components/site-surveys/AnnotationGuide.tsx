/**
 * @fileoverview AnnotationGuide - 注釈ツール選択後の簡易ガイドオーバーレイ
 *
 * Task 69.1: ツール選択後の簡易ガイドオーバーレイを新規作成する
 *
 * Requirements:
 * - 29.7: ツール選択後一定時間内に描画操作を開始しない場合、選択中ツールに対する
 *         簡易ガイド（例: 「ドラッグで描画」「タップでテキスト入力」）を画像領域に
 *         非侵襲的に提示する
 * - 29.8: 視覚フィードバック要素がコンテキストメニュー表示中および
 *         マルチタッチ入力中でも互いに競合しないよう制御する
 *
 * Design: design.md "AnnotationGuide"
 *   - visible, toolKind, onDismiss を受ける presentational component
 *   - 表示閾値 (GUIDE_IDLE_MS=3000) は親コンポーネント側で管理する
 */

import type { CSSProperties, MouseEvent } from 'react';
import type { ToolType } from './annotation-toolbar.constants';

// =============================================================================
// 型定義
// =============================================================================

/**
 * ガイド文言を切替えるためのツール種別。
 * 注釈ツールバーの `ToolType` を再利用する。
 */
export type GuideToolKind = ToolType;

/**
 * AnnotationGuide の Props
 */
export interface AnnotationGuideProps {
  /** ガイドを表示するか。false の場合は何もレンダリングしない */
  visible: boolean;
  /** 現在選択中の注釈ツール種別 */
  toolKind: GuideToolKind;
  /** ガイドをタップ/クリックして閉じた際のコールバック */
  onDismiss: () => void;
}

// =============================================================================
// ツール種別ごとのガイド文言マッピング
// =============================================================================

/**
 * Req 29.7: ツール種別ごとの簡易ガイド文言。
 * ドラッグ系（arrow/circle/rectangle/freehand）、クリック系（polygon/polyline）、
 * タップ系（text/select）、2点クリック系（dimension）で分類される。
 */
const GUIDE_MESSAGES: Record<GuideToolKind, string> = {
  select: 'タップで選択',
  dimension: '2点クリックで寸法線',
  arrow: 'ドラッグで描画',
  circle: 'ドラッグで描画',
  rectangle: 'ドラッグで描画',
  polygon: 'クリックで頂点追加',
  polyline: 'クリックで頂点追加',
  freehand: 'ドラッグで描画',
  text: 'タップでテキスト入力',
};

// =============================================================================
// スタイル定義
// =============================================================================

/**
 * Req 29.8: 非侵襲的オーバーレイ。
 * - `position: absolute` で親の画像領域上に重ねる。
 * - 半透明の暗い背景で視認性を確保しつつ、タップで即 dismiss 可能。
 * - `pointer-events: auto` としオーバーレイ自身はクリック可能にする一方、
 *   表示時間は親コンポーネント側の idle タイマ（GUIDE_IDLE_MS）と onDismiss で制御する。
 */
const styles = {
  overlay: {
    position: 'absolute',
    bottom: '16px',
    left: '50%',
    transform: 'translateX(-50%)',
    padding: '8px 16px',
    backgroundColor: 'rgba(17, 24, 39, 0.82)',
    color: '#ffffff',
    fontSize: '13px',
    fontWeight: 500,
    lineHeight: 1.4,
    borderRadius: '6px',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2)',
    pointerEvents: 'auto',
    cursor: 'pointer',
    userSelect: 'none',
    zIndex: 10,
    maxWidth: '80%',
    textAlign: 'center',
  } as CSSProperties,
};

// =============================================================================
// コンポーネント
// =============================================================================

/**
 * 注釈ツール選択後の簡易ガイドオーバーレイ。
 *
 * 親コンポーネント（AnnotationEditor）が idle タイマを監視し、一定時間操作が
 * 無い場合に `visible=true` を与えることでガイドを表示する。タップされると
 * `onDismiss` を呼び出し、親コンポーネント側で `visible=false` に切り替える。
 *
 * @example
 * ```tsx
 * <AnnotationGuide
 *   visible={isIdle}
 *   toolKind={currentTool}
 *   onDismiss={() => setIsIdle(false)}
 * />
 * ```
 */
export function AnnotationGuide({ visible, toolKind, onDismiss }: AnnotationGuideProps) {
  if (!visible) {
    return null;
  }

  const message = GUIDE_MESSAGES[toolKind];

  const handleClick = (_event: MouseEvent<HTMLDivElement>) => {
    onDismiss();
  };

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="annotation-guide"
      data-tool-kind={toolKind}
      style={styles.overlay}
      onClick={handleClick}
    >
      {message}
    </div>
  );
}
