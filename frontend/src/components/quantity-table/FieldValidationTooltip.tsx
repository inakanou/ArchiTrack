/**
 * @fileoverview フィールドバリデーション吹き出しコンポーネント
 *
 * 入力フィールド内の右端に警告アイコンを重ね、ホバー時にメッセージを
 * 吹き出し（position: absolute オーバーレイ）で表示する。
 * メッセージを通常フローに挿入しないため、フィールド間の縦スペースが
 * 広がってレイアウトが崩れることを防ぐ。
 *
 * 使用側はこのコンポーネントを position: relative の入力ラッパー内に
 * 配置し、入力欄にはアイコン分の右パディングを確保すること。
 */

import { useState } from 'react';

// ============================================================================
// 型定義
// ============================================================================

export interface FieldValidationTooltipProps {
  /** 表示するメッセージ */
  message: string;
  /** スクリーンリーダー用 alert 要素の id（input の aria-describedby と対応付ける） */
  id?: string;
  /** 重要度（色の出し分け） */
  severity?: 'error' | 'warning';
}

// ============================================================================
// スタイル定義
// ============================================================================

const SEVERITY_COLOR: Record<NonNullable<FieldValidationTooltipProps['severity']>, string> = {
  error: '#dc2626',
  warning: '#b45309',
};

const styles = {
  iconButton: {
    position: 'absolute' as const,
    top: '50%',
    right: '4px',
    transform: 'translateY(-50%)',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '16px',
    height: '16px',
    cursor: 'help',
    zIndex: 2,
  } as React.CSSProperties,
  tooltip: {
    position: 'absolute' as const,
    bottom: 'calc(100% + 4px)',
    right: 0,
    backgroundColor: '#1f2937',
    color: '#ffffff',
    fontSize: '11px',
    lineHeight: 1.4,
    padding: '4px 8px',
    borderRadius: '4px',
    whiteSpace: 'nowrap' as const,
    boxShadow: '0 2px 6px rgba(0, 0, 0, 0.2)',
    zIndex: 60,
    pointerEvents: 'none' as const,
  } as React.CSSProperties,
  // 視覚に影響しないスクリーンリーダー用ライブメッセージ
  srOnly: {
    position: 'absolute' as const,
    width: '1px',
    height: '1px',
    padding: 0,
    margin: '-1px',
    overflow: 'hidden',
    clip: 'rect(0, 0, 0, 0)',
    whiteSpace: 'nowrap' as const,
    border: 0,
  } as React.CSSProperties,
};

// ============================================================================
// アイコン
// ============================================================================

/**
 * 警告アイコン（三角形＋感嘆符）
 */
function WarningIcon({ color }: { color: string }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

// ============================================================================
// メインコンポーネント
// ============================================================================

/**
 * フィールドバリデーション吹き出し
 *
 * @param props - コンポーネントProps
 */
export default function FieldValidationTooltip({
  message,
  id,
  severity = 'error',
}: FieldValidationTooltipProps) {
  const [isHovered, setIsHovered] = useState(false);
  const color = SEVERITY_COLOR[severity];

  return (
    <>
      <span
        style={styles.iconButton}
        role="img"
        aria-label={message}
        title={message}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <WarningIcon color={color} />
      </span>

      {isHovered && (
        <span role="tooltip" style={styles.tooltip}>
          {message}
        </span>
      )}

      {/* a11y: 視覚に影響しないライブメッセージ（input の aria-describedby が参照） */}
      {id && (
        <span id={id} role="alert" style={styles.srOnly}>
          {message}
        </span>
      )}
    </>
  );
}
