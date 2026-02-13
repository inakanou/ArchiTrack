/**
 * @fileoverview 数量表コピーダイアログコンポーネント
 *
 * Task 21.1: コピーダイアログコンポーネントを実装する
 *
 * Requirements:
 * - 17.1: コピー先の数量表名入力ダイアログ表示、デフォルト値「{元の数量表名}のコピー」
 * - 17.5: エラー発生時のエラーメッセージ表示
 * - 17.6: コピー処理中のインジケーター表示、重複操作防止
 */

import { useState, useCallback } from 'react';
import { copyQuantityTable } from '../../api/quantity-tables';

// ============================================================================
// 型定義
// ============================================================================

/**
 * CopyQuantityTableDialogのプロパティ
 */
export interface CopyQuantityTableDialogProps {
  /** ダイアログの表示状態 */
  isOpen: boolean;
  /** ダイアログを閉じるコールバック */
  onClose: () => void;
  /** コピー元の数量表情報 */
  sourceTable: {
    id: string;
    name: string;
  };
  /** コピー完了時のコールバック（コピーされた数量表のIDを受け取る） */
  onCopyComplete: (copiedTableId: string) => void;
}

// ============================================================================
// スタイル定義
// ============================================================================

const styles = {
  overlay: {
    position: 'fixed' as const,
    inset: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  } as React.CSSProperties,
  content: {
    backgroundColor: '#ffffff',
    borderRadius: '8px',
    padding: '24px',
    maxWidth: '460px',
    width: '90%',
    boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
  } as React.CSSProperties,
  title: {
    fontSize: '18px',
    fontWeight: 600,
    color: '#1f2937',
    margin: 0,
    marginBottom: '16px',
  } as React.CSSProperties,
  label: {
    display: 'block',
    fontSize: '14px',
    fontWeight: 500,
    color: '#374151',
    marginBottom: '6px',
  } as React.CSSProperties,
  input: {
    width: '100%',
    padding: '8px 12px',
    fontSize: '14px',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    outline: 'none',
    boxSizing: 'border-box' as const,
  } as React.CSSProperties,
  actions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '12px',
    marginTop: '24px',
  } as React.CSSProperties,
  cancelButton: {
    padding: '8px 16px',
    fontSize: '14px',
    fontWeight: 500,
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    backgroundColor: '#ffffff',
    color: '#374151',
    cursor: 'pointer',
  } as React.CSSProperties,
  copyButton: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 16px',
    fontSize: '14px',
    fontWeight: 500,
    border: 'none',
    borderRadius: '6px',
    backgroundColor: '#2563eb',
    color: '#ffffff',
    cursor: 'pointer',
  } as React.CSSProperties,
  disabledButton: {
    opacity: 0.6,
    cursor: 'not-allowed',
  } as React.CSSProperties,
  errorContainer: {
    marginTop: '12px',
    padding: '8px 12px',
    backgroundColor: '#fef2f2',
    border: '1px solid #fecaca',
    borderRadius: '6px',
  } as React.CSSProperties,
  errorText: {
    color: '#991b1b',
    fontSize: '13px',
    margin: 0,
  } as React.CSSProperties,
  spinner: {
    display: 'inline-block',
    width: '16px',
    height: '16px',
    border: '2px solid rgba(255, 255, 255, 0.3)',
    borderTop: '2px solid #ffffff',
    borderRadius: '50%',
    animation: 'copy-dialog-spin 0.8s linear infinite',
  } as React.CSSProperties,
};

// ============================================================================
// コンポーネント
// ============================================================================

/**
 * 数量表コピーダイアログ
 *
 * 数量表一覧画面から呼び出されるモーダルダイアログ。
 * コピー先の数量表名を入力し、コピーを実行する。
 */
export default function CopyQuantityTableDialog({
  isOpen,
  onClose,
  sourceTable,
  onCopyComplete,
}: CopyQuantityTableDialogProps) {
  const [name, setName] = useState(`${sourceTable.name}のコピー`);
  const [isCopying, setIsCopying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * コピーを実行する
   */
  const handleCopy = useCallback(async () => {
    const trimmedName = name.trim();

    // 空の名前ではコピーしない
    if (!trimmedName) {
      return;
    }

    setIsCopying(true);
    setError(null);

    try {
      const result = await copyQuantityTable(sourceTable.id, { name: trimmedName });
      onCopyComplete(result.id);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '数量表のコピーに失敗しました';
      setError(errorMessage);
    } finally {
      setIsCopying(false);
    }
  }, [name, sourceTable.id, onCopyComplete]);

  if (!isOpen) {
    return null;
  }

  return (
    <div style={styles.overlay} role="dialog" aria-modal="true" aria-labelledby="copy-dialog-title">
      <div style={styles.content}>
        <h2 id="copy-dialog-title" style={styles.title}>
          数量表をコピー
        </h2>

        <div>
          <label htmlFor="copy-table-name" style={styles.label}>
            数量表名
          </label>
          <input
            id="copy-table-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={styles.input}
            disabled={isCopying}
            aria-label="数量表名"
          />
        </div>

        {error && (
          <div role="alert" style={styles.errorContainer}>
            <p style={styles.errorText}>{error}</p>
          </div>
        )}

        <div style={styles.actions}>
          <button type="button" style={styles.cancelButton} onClick={onClose} disabled={isCopying}>
            キャンセル
          </button>
          <button
            type="button"
            style={{
              ...styles.copyButton,
              ...(isCopying ? styles.disabledButton : {}),
            }}
            onClick={handleCopy}
            disabled={isCopying}
          >
            {isCopying && <span role="status" style={styles.spinner} aria-label="処理中" />}
            {isCopying ? 'コピー中...' : 'コピーを作成'}
          </button>
        </div>
      </div>

      <style>
        {`
          @keyframes copy-dialog-spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}
      </style>
    </div>
  );
}
