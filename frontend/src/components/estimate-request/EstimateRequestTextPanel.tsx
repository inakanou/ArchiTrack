/**
 * @fileoverview 見積依頼文パネルコンポーネント
 *
 * Task 5.5: EstimateRequestTextPanelコンポーネントを実装する
 *
 * Requirements:
 * - 6.1: 見積依頼文を表示するパネルを提供する
 * - 6.2: 宛先（メールアドレスまたはFAX番号）を表示する
 * - 6.3: 表題を表示する
 * - 6.4: 本文を表示する
 * - 6.5: メールアドレス未登録時のエラー表示
 * - 6.6: FAX番号未登録時のエラー表示
 * - 6.7: 各項目にクリップボードコピーボタンを表示する
 */

import { useState, useCallback } from 'react';
import type { EstimateRequestText } from '../../types/estimate-request.types';

// ============================================================================
// 型定義
// ============================================================================

/**
 * EstimateRequestTextPanelコンポーネントのProps
 */
export interface EstimateRequestTextPanelProps {
  /** 見積依頼文データ */
  text: EstimateRequestText | null;
  /** ローディング状態 */
  loading?: boolean;
}

// ============================================================================
// スタイル定義
// ============================================================================

const styles = {
  panel: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '24px',
    padding: '24px',
    backgroundColor: '#ffffff',
    borderRadius: '8px',
    border: '1px solid #e5e7eb',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '8px',
  },
  title: {
    fontSize: '18px',
    fontWeight: 600,
    color: '#1f2937',
  },
  section: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '8px',
  },
  sectionHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '8px',
  },
  sectionLabel: {
    fontSize: '14px',
    fontWeight: 500,
    color: '#374151',
  },
  sectionContent: {
    padding: '12px',
    backgroundColor: '#f9fafb',
    borderRadius: '6px',
    border: '1px solid #e5e7eb',
    fontSize: '14px',
    color: '#1f2937',
  },
  preContent: {
    margin: 0,
    whiteSpace: 'pre-wrap' as const,
    fontFamily: 'inherit',
    fontSize: '14px',
    color: '#1f2937',
    lineHeight: 1.6,
  },
  errorText: {
    color: 'rgb(239, 68, 68)',
    fontSize: '14px',
  },
  copyButton: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    padding: '4px 8px',
    borderRadius: '4px',
    fontSize: '12px',
    fontWeight: 500,
    cursor: 'pointer',
    border: '1px solid #d1d5db',
    backgroundColor: '#ffffff',
    color: '#374151',
    transition: 'background-color 0.2s',
  },
  copyButtonSuccess: {
    backgroundColor: '#dcfce7',
    borderColor: '#86efac',
    color: '#166534',
  },
  loadingContainer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '48px',
    color: '#6b7280',
    fontSize: '14px',
  },
  errorContainer: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    padding: '48px',
    gap: '8px',
    color: '#6b7280',
    fontSize: '14px',
  },
};

// ============================================================================
// サブコンポーネント
// ============================================================================

/**
 * スピナーアイコン
 */
function LoadingSpinner() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{
        animation: 'spin 1s linear infinite',
      }}
    >
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </svg>
  );
}

/**
 * コピーアイコン
 */
function CopyIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
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
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

/**
 * コピーボタン（インライン版）
 */
interface InlineCopyButtonProps {
  text: string;
  disabled?: boolean;
}

function InlineCopyButton({ text, disabled = false }: InlineCopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    if (disabled || !text) return;

    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // エラー処理
    }
  }, [text, disabled]);

  return (
    <button
      type="button"
      onClick={handleCopy}
      disabled={disabled || !text}
      style={{
        ...styles.copyButton,
        ...(copied ? styles.copyButtonSuccess : {}),
      }}
      aria-label={copied ? 'コピーしました' : 'コピー'}
    >
      {copied ? <CheckIcon /> : <CopyIcon />}
      {copied ? 'コピーしました' : 'コピー'}
    </button>
  );
}

// ============================================================================
// メインコンポーネント
// ============================================================================

/**
 * 見積依頼文パネル
 *
 * 見積依頼文（宛先、表題、本文）を表示し、
 * 各項目をクリップボードにコピーする機能を提供します。
 *
 * @example
 * ```tsx
 * <EstimateRequestTextPanel
 *   text={estimateRequestText}
 *   loading={isLoading}
 * />
 * ```
 */
export function EstimateRequestTextPanel({ text, loading = false }: EstimateRequestTextPanelProps) {
  // ローディング中
  if (loading) {
    return (
      <div style={styles.panel} role="region" aria-label="見積依頼文">
        <div style={styles.loadingContainer}>
          <LoadingSpinner />
          <span style={{ marginLeft: '8px' }}>読み込み中...</span>
        </div>
      </div>
    );
  }

  // エラー（textがnull）
  if (!text) {
    return (
      <div style={styles.panel} role="region" aria-label="見積依頼文">
        <div style={styles.errorContainer}>
          <span>見積依頼文を取得できませんでした</span>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.panel} role="region" aria-label="見積依頼文">
      {/* ヘッダー */}
      <div style={styles.header}>
        <h3 style={styles.title}>見積依頼文</h3>
      </div>

      {/* 宛先セクション */}
      <div style={styles.section}>
        <div style={styles.sectionHeader}>
          <span style={styles.sectionLabel}>宛先</span>
          <InlineCopyButton text={text.recipient} disabled={!!text.recipientError} />
        </div>
        <div style={styles.sectionContent}>
          {text.recipientError ? (
            <span style={styles.errorText}>{text.recipientError}</span>
          ) : (
            <span>{text.recipient}</span>
          )}
        </div>
      </div>

      {/* 表題セクション */}
      <div style={styles.section}>
        <div style={styles.sectionHeader}>
          <span style={styles.sectionLabel}>表題</span>
          <InlineCopyButton text={text.subject} />
        </div>
        <div style={styles.sectionContent}>
          <span>{text.subject}</span>
        </div>
      </div>

      {/* 本文セクション */}
      <div style={styles.section}>
        <div style={styles.sectionHeader}>
          <span style={styles.sectionLabel}>本文</span>
          <InlineCopyButton text={text.body} />
        </div>
        <div style={styles.sectionContent}>
          <pre style={styles.preContent}>{text.body}</pre>
        </div>
      </div>
    </div>
  );
}

export default EstimateRequestTextPanel;
