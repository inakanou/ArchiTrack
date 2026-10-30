/**
 * @fileoverview クリップボードコピーボタンコンポーネント
 *
 * Task 5.6: ClipboardCopyButtonコンポーネントを実装する
 *
 * Requirements:
 * - 5.1: 「クリップボードにコピー」ボタンをクリックすると、選択した項目の一覧（タブ区切り。内訳書の Excel 出力と
 *   同じ項目）をクリップボードにコピー。見積依頼文（宛先・表題・本文）のコピーは EstimateRequestTextPanel が持つ
 * - 5.2: コピー成功時に「コピーしました」トースト表示
 *
 * Task 107.1: コピーは出力の記録の成功の後にだけ書き込む（Requirement 42.13・42.14。
 * user-authentication の要件40.9〜40.11）。書き込みと記録は上流の `runRecordedClipboardWrite` が行う。
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import {
  EXPORT_RECORD_FAILED_MESSAGE,
  runRecordedClipboardWrite,
  type ExportRecordInput,
} from '../../api/export-audit';

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
  /**
   * コピーの前に要求する出力の記録の入力（Requirement 42.13）。
   * 見積依頼の詳細画面の選択した項目の一覧は、種別 `estimate_request_items_clipboard`・見積依頼の案件・
   * 選択した項目の ID・選択した項目の数を渡す
   */
  exportRecord: ExportRecordInput;
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
  recordError: {
    margin: 0,
    fontSize: '14px',
    color: '#dc2626', // red-600 (WCAG AA contrast ratio)
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
 * <ClipboardCopyButton
 *   text={selectedItemsTsv}
 *   exportRecord={{
 *     kind: 'estimate_request_items_clipboard',
 *     projectId: request.projectId,
 *     targetIds: selectedItemIds,
 *     itemCount: selectedItemIds.length,
 *   }}
 * />
 * ```
 */
export function ClipboardCopyButton({
  text,
  disabled = false,
  exportRecord,
}: ClipboardCopyButtonProps) {
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  // 出力の記録の要求中（Requirement 42.13。押し直しで記録が 2 回にならないようボタンを止める）
  const [isRecording, setIsRecording] = useState(false);
  // 出力の記録の失敗のエラーメッセージ（Requirement 42.14）
  const [recordError, setRecordError] = useState<string | null>(null);

  // 記録の要求中に破棄されたら結果を表示しない（StrictMode の effect の再実行でも true に戻す）
  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const isDisabled = disabled || !text;

  /**
   * 書き込みの前に出力の記録を 1 回要求し、記録の成功の後にだけ中身を書き込む。
   * 記録の失敗では何も書かず「出力を記録できなかったため中止しました」を表示する
   * （Requirement 42.13・42.14）。Safari はクリックの処理の中で同期的に始めた書き込みしか
   * 許さないため、包みの呼び出しより前に `await` を置かない。
   */
  const handleCopy = useCallback(async () => {
    if (isDisabled || isRecording) return;
    // クリックの時点の中身と記録の入力を使う
    const copyText = text;
    const record = exportRecord;

    setIsRecording(true);
    setRecordError(null);
    setStatus('idle');

    try {
      const result = await runRecordedClipboardWrite(record, () => copyText);
      if (!isMountedRef.current) return;
      if (result.ok) {
        setStatus('success');

        // 2秒後に元の状態に戻す
        setTimeout(() => {
          setStatus('idle');
        }, 2000);
      } else if (result.error.type === 'RECORD_FAILED') {
        // 記録の失敗ではクリップボードは変わらない（Requirement 42.14）
        setRecordError(EXPORT_RECORD_FAILED_MESSAGE);
      } else {
        // 記録の後の書き込みの失敗は従来の表示（記録は再送しない）
        setStatus('error');

        // 3秒後に元の状態に戻す
        setTimeout(() => {
          setStatus('idle');
        }, 3000);
      }
    } catch {
      if (isMountedRef.current) setStatus('error');
    } finally {
      if (isMountedRef.current) setIsRecording(false);
    }
  }, [text, exportRecord, isDisabled, isRecording]);

  const getButtonStyle = (): React.CSSProperties => {
    const baseStyle = { ...styles.button };

    if (isDisabled || isRecording) {
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
    <>
      <button
        type="button"
        onClick={handleCopy}
        disabled={isDisabled || isRecording}
        style={getButtonStyle()}
        aria-label={getAriaLabel()}
      >
        {status === 'success' ? <CheckIcon /> : <CopyIcon />}
        {getButtonText()}
      </button>
      {recordError && (
        <p role="alert" style={styles.recordError}>
          {recordError}
        </p>
      )}
    </>
  );
}

export default ClipboardCopyButton;
