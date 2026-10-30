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
 *
 * Task 107.1: 宛先・表題・本文のコピーと「メールで開く」「Gmailで開く」は、出力の記録の成功の後にだけ行う
 * （Requirement 42.13〜42.16。user-authentication の要件40.9〜40.11）。記録の失敗ではコピーもメールの起動も
 * せず、パネルの `role="alert"` の欄に「出力を記録できなかったため中止しました」を表示する。
 */

import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import type {
  EstimateRequestText,
  EstimateRequestMethod,
} from '../../types/estimate-request.types';
import {
  EXPORT_RECORD_FAILED_MESSAGE,
  runRecordedClipboardWrite,
  runRecordedExport,
  type ExportRecordInput,
} from '../../api/export-audit';
import {
  buildMailtoUrl,
  buildGmailComposeUrl,
  openMailClient,
  openBlankMailTab,
  navigateMailTab,
  closeMailTab,
} from '../../utils/mail-launcher';

// ============================================================================
// 型定義
// ============================================================================

/**
 * EstimateRequestTextPanelコンポーネントのProps
 */
export interface EstimateRequestTextPanelProps {
  /** 見積依頼文データ */
  text: EstimateRequestText | null;
  /** 見積依頼の ID（出力の記録の対象。Requirement 42.13・42.15） */
  estimateRequestId: string;
  /** 見積依頼が属する案件の ID（出力の記録の案件。Requirement 42.13・42.15） */
  projectId: string;
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
   *   ガード経路として props 契約を提供する
   *   （design.md「EstimateRequestTextPanel（改訂）」の §Implementation Notes）
   */
  showIncludeBreakdownToggle?: boolean;
  /**
   * 見積依頼方法（Req 41）。メーラー起動ボタンの活性条件判定に使用。
   * 'EMAIL' かつ宛先メールアドレスありのとき両ボタンを活性化する。
   * 未指定時は安全側に倒し非活性（理由表示）とする。
   */
  method?: EstimateRequestMethod;
  /**
   * 見積依頼文を取得できなかった理由の案内（Task 97.2）。
   * `text` が null のとき、指定があれば汎用の「見積依頼文を取得できませんでした」の代わりに表示する。
   * 例: 「内訳書を本文に含める」が ON で項目が 0 件のとき（422 `NO_ITEMS_SELECTED`）の案内
   */
  errorMessage?: string | null;
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
    // 記録の要求中に切り替わるため、mailButton の border の一括指定と同じ形で上書きする
    border: '1px solid #d1d5db',
    color: '#9ca3af',
  },
  mailDisabledReason: {
    fontSize: '12px',
    color: '#6b7280',
  },
  recordError: {
    margin: 0,
    padding: '8px 12px',
    borderRadius: '6px',
    border: '1px solid #fecaca',
    backgroundColor: '#fef2f2',
    color: '#b91c1c', // red-700 (WCAG AA contrast ratio)
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
  /** コピーの前に要求する出力の記録の入力（Requirement 42.13） */
  exportRecord: ExportRecordInput;
  /** コピーの操作を始めたとき（パネルの記録の失敗の表示を消す） */
  onRecordStart: () => void;
  /** 出力の記録が失敗したとき（パネルの alert に表示する。Requirement 42.14） */
  onRecordFailed: () => void;
}

/**
 * 書き込みの前に出力の記録を 1 回要求し、記録の成功の後にだけ中身を書き込む（Requirement 42.13）。
 * 記録の失敗では何も書かず、パネルへ知らせる（Requirement 42.14）。記録の後の書き込みの失敗は従来どおり
 * 表示しない。Safari はクリックの処理の中で同期的に始めた書き込みしか許さないため、包みの呼び出しより
 * 前に `await` を置かない。記録の要求中はボタンを止める。
 */
function InlineCopyButton({
  text,
  disabled = false,
  exportRecord,
  onRecordStart,
  onRecordFailed,
}: InlineCopyButtonProps) {
  const [copied, setCopied] = useState(false);
  const [isRecording, setIsRecording] = useState(false);

  // 記録の要求中に破棄されたら結果を表示しない（StrictMode の effect の再実行でも true に戻す）
  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const handleCopy = useCallback(async () => {
    if (disabled || !text || isRecording) return;
    // クリックの時点の中身と記録の入力を使う
    const copyText = text;
    const record = exportRecord;

    setIsRecording(true);
    onRecordStart();

    try {
      const result = await runRecordedClipboardWrite(record, () => copyText);
      if (!isMountedRef.current) return;
      if (result.ok) {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } else if (result.error.type === 'RECORD_FAILED') {
        onRecordFailed();
      }
      // 記録の後の書き込みの失敗は従来どおり表示しない
    } catch {
      // 従来どおり表示しない
    } finally {
      if (isMountedRef.current) setIsRecording(false);
    }
  }, [text, disabled, isRecording, exportRecord, onRecordStart, onRecordFailed]);

  return (
    <button
      type="button"
      onClick={handleCopy}
      disabled={disabled || !text || isRecording}
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
  estimateRequestId,
  projectId,
  loading = false,
  // Task 84.3: showIncludeBreakdownToggle props は将来パネル内に「内訳書を本文に含める」
  // チェックボックスを保有する場合のガード経路として受け取る（Requirements: 39.8）。
  // 現状はパネル内に該当要素が存在しないため runtime での gating 対象はないが、
  // 親（EstimateRequestDetailPage）の `hasItemizedStatement` 値の伝搬契約として保持する。
  showIncludeBreakdownToggle: _showIncludeBreakdownToggle = true,
  method,
  errorMessage = null,
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

  // 「メールで開く」はアンカー（href）のまま描画する（design review 2026-06-02 Critical Issue 1 対応）。
  // Task 107.1 でクリックの既定の動作を止め、出力の記録の成功の後に mailto の URL で起動する
  // （href はリンクの描画と既存の E2E の主張のために残す。Requirement 42.15）。
  // mailtoUrl は活性時のみ算出する（無効化時は <a> を描画しないため未使用）。
  const mailtoUrl =
    canLaunchMail && text
      ? buildMailtoUrl({ to: text.recipient, subject: text.subject, body: text.body })
      : null;

  // ============================================================================
  // 出力の記録（Task 107.1、Requirement 42.13〜42.16）
  // ============================================================================
  // 記録の失敗のエラーメッセージ（コピーとメールの起動で共有する。パネルの role="alert" の欄）
  const [recordError, setRecordError] = useState<string | null>(null);
  // メールで開く操作の記録の要求中（両ボタンを止める）
  const [isLaunchingMail, setIsLaunchingMail] = useState(false);

  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  /** 見積依頼文のコピーの記録の入力（種別・見積依頼の案件・見積依頼の ID・件数 1） */
  const copyRecord = useMemo<ExportRecordInput>(
    () => ({
      kind: 'estimate_request_text_clipboard',
      projectId,
      targetIds: [estimateRequestId],
      itemCount: 1,
    }),
    [projectId, estimateRequestId]
  );

  /** メールで開く操作の記録の入力（種別・見積依頼の案件・見積依頼の ID・件数 1） */
  const mailRecord = useMemo<ExportRecordInput>(
    () => ({
      kind: 'estimate_request_text_mail',
      projectId,
      targetIds: [estimateRequestId],
      itemCount: 1,
    }),
    [projectId, estimateRequestId]
  );

  const clearRecordError = useCallback(() => setRecordError(null), []);
  const showRecordFailed = useCallback(() => setRecordError(EXPORT_RECORD_FAILED_MESSAGE), []);

  /**
   * 「メールで開く」: リンクの既定の動作（mailto へのページの遷移）を止め、出力の記録の成功の後に
   * メールクライアントを起動する。記録の失敗では起動せず記録の失敗の文言を表示する（Requirement 42.15・42.16）。
   * 中クリックも同じ扱いにする（既定の動作で記録なしに開かせない）。
   */
  const handleOpenMail = useCallback(
    async (event: ReactMouseEvent<HTMLAnchorElement>) => {
      event.preventDefault();
      if (!mailtoUrl || isLaunchingMail) return;
      const url = mailtoUrl;

      setIsLaunchingMail(true);
      setRecordError(null);
      try {
        const result = await runRecordedExport(mailRecord, async () => {
          // 記録の要求中にパネルが閉じられたら起動しない
          if (isMountedRef.current) openMailClient(url);
        });
        if (!isMountedRef.current) return;
        if (!result.ok && result.error.type === 'RECORD_FAILED') {
          setRecordError(EXPORT_RECORD_FAILED_MESSAGE);
        }
      } finally {
        if (isMountedRef.current) setIsLaunchingMail(false);
      }
    },
    [mailtoUrl, isLaunchingMail, mailRecord]
  );

  const handleMailAuxClick = useCallback(
    (event: ReactMouseEvent<HTMLAnchorElement>) => {
      // 中クリック（新しいタブで開く）も記録を経る
      if (event.button === 1) {
        void handleOpenMail(event);
      }
    },
    [handleOpenMail]
  );

  /**
   * 「Gmailで開く」: クリックの処理の中で同期的に空の新しいタブを開き（記録を待ってから開くと
   * ポップアップが止められうる）、出力の記録の成功の後に Gmail の作成画面へ移す。記録の失敗では
   * そのタブを閉じ、記録の失敗の文言を表示する（Requirement 42.15・42.16）。
   */
  const handleOpenGmail = useCallback(async () => {
    if (!text || !canLaunchMail || isLaunchingMail) return;
    const url = buildGmailComposeUrl({
      to: text.recipient,
      subject: text.subject,
      body: text.body,
    });
    const tab = openBlankMailTab();
    // ポップアップが止められて開けなければ何も開かないので記録しない
    if (!tab) return;

    setIsLaunchingMail(true);
    setRecordError(null);
    try {
      const result = await runRecordedExport(mailRecord, async () => {
        // 記録の要求中にパネルが閉じられたら作成画面へ移さない
        if (!isMountedRef.current) {
          closeMailTab(tab);
          return;
        }
        navigateMailTab(tab, url);
      });
      if (!result.ok) {
        closeMailTab(tab);
        if (isMountedRef.current && result.error.type === 'RECORD_FAILED') {
          setRecordError(EXPORT_RECORD_FAILED_MESSAGE);
        }
      }
    } finally {
      if (isMountedRef.current) setIsLaunchingMail(false);
    }
  }, [text, canLaunchMail, isLaunchingMail, mailRecord]);

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

  // エラー（textがnull）。理由の案内があればそれを、無ければ汎用の文言を表示する（Task 97.2）
  if (!text) {
    return (
      <div style={styles.panel} role="region" aria-label="見積依頼文">
        <div style={styles.errorContainer}>
          <span>{errorMessage ?? '見積依頼文を取得できませんでした'}</span>
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

      {/* 出力の記録の失敗（コピー・メールで開く操作。Requirement 42.14・42.16） */}
      {recordError && (
        <p role="alert" style={styles.recordError}>
          {recordError}
        </p>
      )}

      {/* 宛先セクション */}
      <div style={styles.section}>
        <div style={styles.sectionHeader}>
          <span style={styles.sectionLabel}>宛先</span>
          <InlineCopyButton
            text={text.recipient}
            disabled={!!text.recipientError}
            exportRecord={copyRecord}
            onRecordStart={clearRecordError}
            onRecordFailed={showRecordFailed}
          />
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
          <a
            href={mailtoUrl}
            onClick={handleOpenMail}
            onAuxClick={handleMailAuxClick}
            aria-disabled={isLaunchingMail ? 'true' : undefined}
            style={{
              ...styles.mailButton,
              ...(isLaunchingMail ? styles.mailButtonDisabled : {}),
            }}
          >
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
          disabled={!canLaunchMail || isLaunchingMail}
          style={{
            ...styles.mailButton,
            ...(canLaunchMail && !isLaunchingMail ? {} : styles.mailButtonDisabled),
          }}
        >
          Gmailで開く
        </button>
        {mailDisabledReason && <span style={styles.mailDisabledReason}>{mailDisabledReason}</span>}
      </div>

      {/* 表題セクション */}
      <div style={styles.section}>
        <div style={styles.sectionHeader}>
          <span style={styles.sectionLabel}>表題</span>
          <InlineCopyButton
            text={text.subject}
            exportRecord={copyRecord}
            onRecordStart={clearRecordError}
            onRecordFailed={showRecordFailed}
          />
        </div>
        <div style={styles.sectionContent}>
          <span>{text.subject}</span>
        </div>
      </div>

      {/* 本文セクション */}
      <div style={styles.section}>
        <div style={styles.sectionHeader}>
          <span style={styles.sectionLabel}>本文</span>
          <InlineCopyButton
            text={text.body}
            exportRecord={copyRecord}
            onRecordStart={clearRecordError}
            onRecordFailed={showRecordFailed}
          />
        </div>
        <div style={styles.sectionContent}>
          <pre style={styles.preContent}>{text.body}</pre>
        </div>
      </div>
    </div>
  );
}

export default EstimateRequestTextPanel;
