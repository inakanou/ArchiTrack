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
import type {
  EstimateRequestText,
  EstimateRequestMethod,
} from '../../types/estimate-request.types';
import { buildMailtoUrl, buildGmailComposeUrl } from '../../utils/mail-launcher';

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
  /**
   * 「内訳書を本文に含める」チェックボックス（および同等の本文オプション要素）
   * を表示するかどうかのフラグ（Requirements: 39.8）。
   *
   * Task 84.3:
   * - デフォルト `true` で後方互換を維持
   * - 親（EstimateRequestDetailPage）から `hasItemizedStatement` を渡し、
   *   内訳書未紐付け時はチェックボックスを非表示とする
   * - 本コンポーネントはチェックボックス本体を保有しないため、現状は条件レンダリングの
   *   対象がないが、将来このパネル内に「内訳書を本文に含める」要素が移設された場合の
   *   ガード経路として props 契約を提供する（design.md 5576-5586）
   */
  showIncludeBreakdownToggle?: boolean;
  /**
   * 見積依頼方法（Req 41）。メーラー起動ボタンの活性条件判定に使用。
   * 'EMAIL' かつ宛先メールアドレスありのとき両ボタンを活性化する。
   * 未指定時は安全側に倒し非活性（理由表示）とする。
   */
  method?: EstimateRequestMethod;
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
    color: '#dc2626', // red-600 (WCAG AA contrast ratio)
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
  mailActionRow: {
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap' as const,
    gap: '8px',
  },
  mailButton: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    padding: '8px 16px',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: 500,
    cursor: 'pointer',
    border: '1px solid #2563eb',
    backgroundColor: '#2563eb',
    color: '#ffffff',
    textDecoration: 'none', // アンカー描画時の下線抑止（button/anchor 外観統一）
  },
  mailButtonDisabled: {
    cursor: 'not-allowed',
    backgroundColor: '#e5e7eb',
    borderColor: '#d1d5db',
    color: '#9ca3af',
  },
  mailDisabledReason: {
    fontSize: '12px',
    color: '#6b7280',
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
export function EstimateRequestTextPanel({
  text,
  loading = false,
  // Task 84.3: showIncludeBreakdownToggle props は将来パネル内に「内訳書を本文に含める」
  // チェックボックスを保有する場合のガード経路として受け取る（Requirements: 39.8）。
  // 現状はパネル内に該当要素が存在しないため runtime での gating 対象はないが、
  // 親（EstimateRequestDetailPage）の `hasItemizedStatement` 値の伝搬契約として保持する。
  showIncludeBreakdownToggle: _showIncludeBreakdownToggle = true,
  method,
}: EstimateRequestTextPanelProps) {
  // ============================================================================
  // メーラー起動の派生値（Req 41）— props からの算出のみ。追加 state は持たない。
  // ============================================================================
  // method は親（DetailPage）から伝搬。text は既存 props。
  const isEmailMethod = method === 'EMAIL';
  const hasRecipientEmail = !!text && !text.recipientError && text.recipient.trim().length > 0;
  const canLaunchMail = isEmailMethod && hasRecipientEmail;

  const mailDisabledReason = (() => {
    if (!isEmailMethod) return 'FAX依頼のためメール起動の対象外です';
    if (!hasRecipientEmail) return 'メールアドレスが登録されていません';
    return null;
  })();

  // mailto はアンカー（href）で起動するためハンドラ不要（design review 2026-06-02 Critical Issue 1 対応）。
  // mailtoUrl は活性時のみ算出する（無効化時は <a> を描画しないため未使用）。
  const mailtoUrl =
    canLaunchMail && text
      ? buildMailtoUrl({ to: text.recipient, subject: text.subject, body: text.body })
      : null;

  const handleOpenGmail = useCallback(() => {
    if (!text || !canLaunchMail) return;
    const url = buildGmailComposeUrl({
      to: text.recipient,
      subject: text.subject,
      body: text.body,
    });
    window.open(url, '_blank', 'noopener,noreferrer');
  }, [text, canLaunchMail]);

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

      {/* メーラー起動アクション（Req 41） */}
      <div style={styles.mailActionRow}>
        {/* 「メールで開く」: 活性時はアンカー（href で OS 既定メーラー起動）、無効時は disabled button */}
        {canLaunchMail && mailtoUrl ? (
          <a href={mailtoUrl} style={styles.mailButton}>
            メールで開く
          </a>
        ) : (
          <button
            type="button"
            disabled
            style={{ ...styles.mailButton, ...styles.mailButtonDisabled }}
          >
            メールで開く
          </button>
        )}
        <button
          type="button"
          onClick={handleOpenGmail}
          disabled={!canLaunchMail}
          style={{ ...styles.mailButton, ...(canLaunchMail ? {} : styles.mailButtonDisabled) }}
        >
          Gmailで開く
        </button>
        {mailDisabledReason && <span style={styles.mailDisabledReason}>{mailDisabledReason}</span>}
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
