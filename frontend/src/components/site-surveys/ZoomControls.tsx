/**
 * @fileoverview ズーム操作コントロール（注釈編集モード）
 *
 * Task 94.1: ZoomControls の実装（ボタン/倍率バッジ/下部配置/44px）
 *
 * 注釈編集モードに、ズームイン・ズームアウト・全体表示（フィット）のボタンと
 * 現在のズーム倍率バッジを提供する。useCanvasViewport（Task 92）が公開する
 * `zoom`/`zoomIn`/`zoomOut`/`fit` を props で受け取り表示するプレゼンテーション
 * コンポーネント（AnnotationEditor への結線は Task 96 で行う）。
 *
 * 依存方向（design.md「Architecture Integration」/「中点ズームフロー」）:
 *   CanvasViewportController → useCanvasViewport → ZoomControls（表示）
 * 本コンポーネントは表示専用で逆向き依存を持たない。
 *
 * Requirements:
 * - 34.1: ズームイン・ズームアウト・全体表示（フィット）の操作手段を提供する
 * - 34.2: 現在のズーム倍率を示す視覚的表示を提供する
 * - 34.5: 各タップ領域を最小44x44論理ピクセル以上で提供する（Req 28.3 と整合）
 * - 34.6: モバイル幅で画面下部など片手のタッチで届きやすい領域に配置する
 * - 34.8: ズーム操作が背景画像への描画として誤発火しないようにする（Req 28.6 と整合）
 *
 * @see design.md - Requirements 29.4, 33-34 / File Structure Plan / 中点ズームフロー
 */

import React, { useCallback } from 'react';

/**
 * ZoomControls の Props。
 */
export interface ZoomControlsProps {
  /** 現在のズーム倍率（例: 1.5 = 150%）。Req 34.2 の倍率バッジ表示に用いる。 */
  zoom: number;
  /** ズームイン操作（Req 34.1）。useCanvasViewport.zoomIn を想定。 */
  onZoomIn: () => void;
  /** ズームアウト操作（Req 34.1）。useCanvasViewport.zoomOut を想定。 */
  onZoomOut: () => void;
  /** 全体表示（フィット）操作（Req 34.1/34.4）。useCanvasViewport.fit を想定。 */
  onFit: () => void;
  /** 無効化フラグ（任意） */
  disabled?: boolean;
}

// ============================================================================
// スタイル定義（既存 site-surveys コンポーネントの inline style / 44px 流儀に準拠）
// ============================================================================

const STYLES = {
  // Req 34.6: 画面下部の片手到達領域に固定配置する。
  // Task 98.2: モバイルでは注釈キャンバスが小画面の下部いっぱいを占めるため、横並びの
  // 下部中央バーだと描画/編集の主作業領域（キャンバス中央）を覆ってしまう。Req 34.8
  // （ズーム操作を背景画像の描画ヒット領域外に置く）と両立させるため、下部「右端」に
  // 縦並びのコンパクトなスタックとして配置し、キャンバス中央の操作領域を空ける
  // （右手親指での片手到達も満たす）。position:fixed は維持（レイアウトビューポート＝
  // デバイス幅である前提。ホスト画面側でページ水平 overflow を抑止すること）。
  container: {
    position: 'fixed' as const,
    bottom: '16px',
    right: '16px',
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: '8px',
    padding: '8px',
    backgroundColor: '#ffffff',
    borderRadius: '12px',
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
    zIndex: 20,
    // Req 34.8: コントロール領域内のタップ/クリックが背景 canvas への描画として
    // 誤発火しないよう、明示的なポインタ境界を確立する（Req 28.6 と整合）。
    pointerEvents: 'auto' as const,
  },
  button: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    // Req 34.5: 44x44 論理ピクセル以上のタップ領域（Req 28.3 と整合）。
    minWidth: '44px',
    minHeight: '44px',
    padding: '8px',
    border: '1px solid #d1d5db',
    borderRadius: '8px',
    backgroundColor: '#ffffff',
    color: '#374151',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    outline: 'none',
  } as React.CSSProperties,
  buttonDisabled: {
    backgroundColor: '#e5e7eb',
    color: '#525b6a', // WCAG 2.1 AA: 5.0:1 on #e5e7eb
    cursor: 'not-allowed',
  } as React.CSSProperties,
  // Req 34.2: 現在倍率バッジ。
  badge: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: '56px',
    height: '44px',
    padding: '0 8px',
    fontSize: '14px',
    fontWeight: 600,
    color: '#374151',
    fontVariantNumeric: 'tabular-nums' as const,
    userSelect: 'none' as const,
  } as React.CSSProperties,
  icon: {
    width: '20px',
    height: '20px',
  },
};

/**
 * 倍率（小数）をパーセント表示文字列へ変換する（四捨五入）。
 * Req 34.2: 例 1 -> "100%", 1.5 -> "150%"。
 */
const formatZoomPercent = (zoom: number): string => `${Math.round(zoom * 100)}%`;

/**
 * ズーム操作コントロール。
 *
 * ズームイン/ズームアウト/全体表示ボタンと現在倍率バッジを画面下部に表示する。
 */
function ZoomControls({
  zoom,
  onZoomIn,
  onZoomOut,
  onFit,
  disabled = false,
}: ZoomControlsProps): React.JSX.Element {
  /**
   * Req 34.8: ボタン操作が背景 canvas の pointer/click として伝播し、描画を
   * 誤発火させないよう stopPropagation/preventDefault を行ってから本処理へ委譲する。
   */
  const handleClick = useCallback(
    (handler: () => void) =>
      (event: React.MouseEvent<HTMLButtonElement>): void => {
        event.stopPropagation();
        event.preventDefault();
        handler();
      },
    []
  );

  const buttonStyle = (active: boolean): React.CSSProperties => ({
    ...STYLES.button,
    ...(active ? {} : STYLES.buttonDisabled),
  });

  return (
    <div data-testid="zoom-controls" role="group" aria-label="ズーム操作" style={STYLES.container}>
      <button
        type="button"
        style={buttonStyle(!disabled)}
        onClick={handleClick(onZoomOut)}
        disabled={disabled}
        aria-label="ズームアウト"
        title="ズームアウト"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={STYLES.icon}
          aria-hidden="true"
        >
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </button>

      <span data-testid="zoom-badge" style={STYLES.badge} aria-live="polite">
        {formatZoomPercent(zoom)}
      </span>

      <button
        type="button"
        style={buttonStyle(!disabled)}
        onClick={handleClick(onZoomIn)}
        disabled={disabled}
        aria-label="ズームイン"
        title="ズームイン"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={STYLES.icon}
          aria-hidden="true"
        >
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </button>

      <button
        type="button"
        style={buttonStyle(!disabled)}
        onClick={handleClick(onFit)}
        disabled={disabled}
        aria-label="全体表示"
        title="全体表示（フィット）"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={STYLES.icon}
          aria-hidden="true"
        >
          <path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M16 21h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
        </svg>
      </button>
    </div>
  );
}

export default ZoomControls;
