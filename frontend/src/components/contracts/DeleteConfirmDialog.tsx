/**
 * @fileoverview 契約書削除確認ダイアログ
 *
 * Task 13.1: DeleteConfirmDialogコンポーネントの作成
 *
 * Requirements (contract-management):
 * - REQ-8.10: 削除ボタン押下時に削除確認ダイアログを表示する
 * - REQ-8.11: 削除確認時に契約書を論理削除する
 * - REQ-12.1: 子契約が存在する場合に削除を拒否し、エラーメッセージを表示する
 * - REQ-12.2: 契約済ステータスの場合に削除を拒否し、エラーメッセージを表示する
 *
 * @module components/contracts/DeleteConfirmDialog
 */

import { useState, useCallback } from 'react';
import { deleteContract } from '../../api/contracts';
import { ApiError } from '../../api/client';

// ============================================================================
// 型定義
// ============================================================================

interface DeleteConfirmDialogProps {
  /** 削除対象の契約書ID */
  contractId: string;
  /** ダイアログの表示状態 */
  isOpen: boolean;
  /** ダイアログを閉じるコールバック */
  onClose: () => void;
  /** 削除成功時のコールバック */
  onDeleteSuccess: () => void;
  /** 削除エラー時のコールバック（トースト通知用） */
  onDeleteError?: (message: string) => void;
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
    zIndex: 50,
  } as React.CSSProperties,
  content: {
    backgroundColor: '#ffffff',
    borderRadius: '8px',
    padding: '24px',
    maxWidth: '480px',
    width: '100%',
    margin: '0 16px',
  } as React.CSSProperties,
  title: {
    fontSize: '18px',
    fontWeight: 600,
    color: '#1f2937',
    margin: 0,
    marginBottom: '12px',
  } as React.CSSProperties,
  message: {
    fontSize: '14px',
    color: '#6b7280',
    marginBottom: '16px',
  } as React.CSSProperties,
  errorMessage: {
    backgroundColor: '#fef2f2',
    border: '1px solid #fecaca',
    borderRadius: '6px',
    padding: '12px',
    fontSize: '14px',
    color: '#991b1b',
    marginBottom: '16px',
  } as React.CSSProperties,
  actions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '8px',
  } as React.CSSProperties,
  cancelButton: {
    padding: '8px 16px',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: 500,
    backgroundColor: '#ffffff',
    color: '#374151',
    border: '1px solid #d1d5db',
    cursor: 'pointer',
  } as React.CSSProperties,
  deleteButton: {
    padding: '8px 16px',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: 500,
    backgroundColor: '#dc2626',
    color: '#ffffff',
    border: 'none',
    cursor: 'pointer',
  } as React.CSSProperties,
};

// ============================================================================
// コンポーネント
// ============================================================================

/**
 * 契約書削除確認ダイアログ
 *
 * - 「この契約書を削除しますか?」の確認メッセージを表示
 * - 確認ボタンとキャンセルボタンを提供
 * - 削除処理中の二重送信防止（isDeletingフラグ）
 * - 削除API呼び出し（DELETE /api/contracts/:id）
 * - 削除成功時にダイアログを閉じ、onDeleteSuccessコールバックで通知
 * - 422エラー（削除制約）のメッセージをダイアログ内に表示
 */
export function DeleteConfirmDialog({
  contractId,
  isOpen,
  onClose,
  onDeleteSuccess,
  onDeleteError,
}: DeleteConfirmDialogProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  /**
   * 削除実行ハンドラ
   */
  const handleDelete = useCallback(async () => {
    setIsDeleting(true);
    setErrorMessage(null);

    try {
      await deleteContract(contractId);
      onClose();
      onDeleteSuccess();
    } catch (err) {
      if (err instanceof ApiError && err.statusCode === 422) {
        const msg = err.message;
        setErrorMessage(msg);
        onDeleteError?.(msg);
      } else {
        const msg = '削除に失敗しました';
        setErrorMessage(msg);
        onDeleteError?.(msg);
      }
    } finally {
      setIsDeleting(false);
    }
  }, [contractId, onClose, onDeleteSuccess, onDeleteError]);

  if (!isOpen) return null;

  return (
    <div
      style={styles.overlay}
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-dialog-title"
    >
      <div style={styles.content}>
        <h2 id="delete-dialog-title" style={styles.title}>
          この契約書を削除しますか?
        </h2>
        <p style={styles.message}>この操作は取り消せません。</p>

        {/* エラーメッセージ表示 (REQ-12.1, REQ-12.2) */}
        {errorMessage && (
          <div role="alert" style={styles.errorMessage}>
            {errorMessage}
          </div>
        )}

        <div style={styles.actions}>
          <button type="button" onClick={onClose} style={styles.cancelButton} disabled={isDeleting}>
            キャンセル
          </button>
          <button
            type="button"
            onClick={handleDelete}
            style={styles.deleteButton}
            disabled={isDeleting}
          >
            {isDeleting ? '削除中...' : '削除する'}
          </button>
        </div>
      </div>
    </div>
  );
}
