/**
 * @fileoverview クリップボードコピーボタンコンポーネント
 *
 * Task 5.6: ClipboardCopyButtonコンポーネントを実装する
 *
 * Requirements:
 * - 5.1: 「クリップボードにコピー」ボタンをクリックすると見積依頼文全体をクリップボードにコピー
 * - 5.2: コピー成功時に「コピーしました」トースト表示
 */

import { useState, useCallback } from 'react';

// ============================================================================
// 型定義
// ============================================================================

/**
 * ClipboardCopyButtonコンポーネントのProps
 */
export interface ClipboardCopyButtonProps {
  /** コピーするテキスト */
  text: string;
  /** 無効状態 */
  disabled?: boolean;
}

// ============================================================================
// スタイル定義
// ============================================================================

const styles = {
  button: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    padding: '10px 20px',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'background-color 0.2s, border-color 0.2s',
    border: '1px solid #d1d5db',
    backgroundColor: '#ffffff',
    color: '#374151',
  } as React.CSSProperties,
  buttonDisabled: {
    backgroundColor: '#f3f4f6',
    color: '#9ca3af',
    cursor: 'not-allowed',
  } as React.CSSProperties,
  buttonSuccess: {
    backgroundColor: '#dcfce7',
    borderColor: '#86efac',
    color: '#166534',
  } as React.CSSProperties,
  buttonError: {
    backgroundColor: '#fef2f2',
    borderColor: '#fecaca',
    color: '#991b1b',
  } as React.CSSProperties,
};

// ============================================================================
// サブコンポーネント
// ============================================================================

/**
 * コピーアイコン
 */
function CopyIcon() {
  return (
    <svg
      data-testid="copy-icon"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

/**
 * チェックアイコン（コピー成功時）
 */
function CheckIcon() {
  return (
    <svg
      data-testid="check-icon"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

// ============================================================================
// メインコンポーネント
// ============================================================================

/**
 * クリップボードコピーボタン
 *
 * テキストをクリップボードにコピーするボタン。
 * コピー成功時には視覚的フィードバックを表示します。
 *
 * Requirements:
 * - 5.1: クリックでテキストをクリップボードにコピー
 * - 5.2: コピー成功時にフィードバック表示
 *
 * @example
 * ```tsx
 * <ClipboardCopyButton text="コピーするテキスト" />
 * ```
 */
export function ClipboardCopyButton({ text, disabled = false }: ClipboardCopyButtonProps) {
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');

  const isDisabled = disabled || !text;

  const handleCopy = useCallback(async () => {
    if (isDisabled) return;

    try {
      await navigator.clipboard.writeText(text);
      setStatus('success');

      // 2秒後に元の状態に戻す
      setTimeout(() => {
        setStatus('idle');
      }, 2000);
    } catch {
      setStatus('error');

      // 3秒後に元の状態に戻す
      setTimeout(() => {
        setStatus('idle');
      }, 3000);
    }
  }, [text, isDisabled]);

  const getButtonStyle = (): React.CSSProperties => {
    const baseStyle = { ...styles.button };

    if (isDisabled) {
      return { ...baseStyle, ...styles.buttonDisabled };
    }

    if (status === 'success') {
      return { ...baseStyle, ...styles.buttonSuccess };
    }

    if (status === 'error') {
      return { ...baseStyle, ...styles.buttonError };
    }

    return baseStyle;
  };

  const getButtonText = (): string => {
    if (status === 'success') return 'コピーしました';
    if (status === 'error') return 'コピーに失敗しました';
    return 'クリップボードにコピー';
  };

  const getAriaLabel = (): string => {
    if (status === 'success') return 'コピーしました';
    if (status === 'error') return 'コピーに失敗しました';
    return 'クリップボードにコピー';
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      disabled={isDisabled}
      style={getButtonStyle()}
      aria-label={getAriaLabel()}
    >
      {status === 'success' ? <CheckIcon /> : <CopyIcon />}
      {getButtonText()}
    </button>
  );
}

export default ClipboardCopyButton;
