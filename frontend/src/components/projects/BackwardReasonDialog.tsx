/**
 * @fileoverview 差し戻し理由入力ダイアログ コンポーネント
 *
 * 差し戻し遷移時に理由の入力を求めるモーダルダイアログ。
 * FocusManagerを使用したフォーカストラップと、
 * WCAG 2.1 Level AA準拠のアクセシビリティを実装。
 *
 * Requirements:
 * - 10.14: 差し戻し遷移時は差し戻し理由の入力を必須とする
 * - 20.1: すべての操作をキーボードのみで実行可能にする
 */

import { useState, useRef, useCallback } from 'react';
import FocusManager from '../FocusManager';
import type { ProjectStatus } from '../../types/project.types';
import { PROJECT_STATUS_LABELS } from '../../types/project.types';

// ============================================================================
// 型定義
// ============================================================================

/**
 * 差し戻し理由入力ダイアログの Props
 */
export interface BackwardReasonDialogProps {
  /** ダイアログが開いているか */
  isOpen: boolean;
  /** 確認時のコールバック（理由を引数に渡す） */
  onConfirm: (reason: string) => void;
  /** キャンセル時のコールバック */
  onCancel: () => void;
  /** 遷移元ステータス */
  fromStatus: ProjectStatus;
  /** 遷移先ステータス */
  toStatus: ProjectStatus;
  /** 送信中フラグ */
  isSubmitting?: boolean;
}

// ============================================================================
// スタイル定義
// ============================================================================

const styles = {
  container: {
    width: '100%',
    maxWidth: '480px',
    padding: '24px',
  } as React.CSSProperties,
  title: {
    fontSize: '18px',
    fontWeight: 'bold',
    marginBottom: '16px',
    color: '#1f2937',
  } as React.CSSProperties,
  statusInfo: {
    marginBottom: '16px',
    padding: '12px',
    backgroundColor: '#fef3cd',
    borderRadius: '8px',
    border: '1px solid #ffc107',
  } as React.CSSProperties,
  statusLabel: {
    fontSize: '14px',
    color: '#856404',
  } as React.CSSProperties,
  statusBadge: {
    display: 'inline-block',
    padding: '4px 8px',
    borderRadius: '4px',
    fontSize: '12px',
    fontWeight: 'bold',
  } as React.CSSProperties,
  arrow: {
    display: 'inline-block',
    margin: '0 8px',
    color: '#856404',
  } as React.CSSProperties,
  label: {
    display: 'block',
    marginBottom: '8px',
    fontSize: '14px',
    fontWeight: '500',
    color: '#374151',
  } as React.CSSProperties,
  textarea: {
    width: '100%',
    minHeight: '120px',
    padding: '12px',
    fontSize: '14px',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: '#d1d5db',
    borderRadius: '8px',
    resize: 'vertical',
    fontFamily: 'inherit',
  } as React.CSSProperties,
  textareaError: {
    borderColor: '#dc2626',
  } as React.CSSProperties,
  textareaDisabled: {
    backgroundColor: '#f3f4f6',
    cursor: 'not-allowed',
  } as React.CSSProperties,
  errorMessage: {
    marginTop: '8px',
    fontSize: '14px',
    color: '#dc2626',
  } as React.CSSProperties,
  buttonContainer: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '12px',
    marginTop: '24px',
  } as React.CSSProperties,
  buttonBase: {
    padding: '10px 20px',
    fontSize: '14px',
    fontWeight: '500',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'all 0.2s',
  } as React.CSSProperties,
  cancelButton: {
    backgroundColor: '#ffffff',
    color: '#374151',
    border: '1px solid #d1d5db',
  } as React.CSSProperties,
  cancelButtonDisabled: {
    backgroundColor: '#f3f4f6',
    cursor: 'not-allowed',
    opacity: 0.6,
  } as React.CSSProperties,
  confirmButton: {
    backgroundColor: '#f97316',
    color: '#ffffff',
    border: 'none',
  } as React.CSSProperties,
  confirmButtonDisabled: {
    backgroundColor: '#fdba74',
    cursor: 'not-allowed',
    opacity: 0.6,
  } as React.CSSProperties,
};

// ============================================================================
// コンポーネント
// ============================================================================

/**
 * 差し戻し理由入力ダイアログ
 *
 * ステータス差し戻し時に理由入力を求めるモーダルダイアログ。
 * 理由は必須入力で、空の場合はエラーメッセージを表示。
 *
 * @example
 * ```tsx
 * <BackwardReasonDialog
 *   isOpen={isDialogOpen}
 *   onConfirm={(reason) => handleBackward(reason)}
 *   onCancel={() => setIsDialogOpen(false)}
 *   fromStatus="SURVEYING"
 *   toStatus="PREPARING"
 * />
 * ```
 */
function BackwardReasonDialog({
  isOpen,
  onConfirm,
  onCancel,
  fromStatus,
  toStatus,
  isSubmitting = false,
}: BackwardReasonDialogProps): React.ReactNode {
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const errorId = 'backward-reason-error';

  // キャンセル時にリセットしてコールバック呼び出し
  const handleCancel = useCallback(() => {
    setReason('');
    setError(null);
    onCancel();
  }, [onCancel]);

  // 入力時にエラーをクリア
  const handleReasonChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setReason(value);
    if (value.trim()) {
      setError(null);
    }
  }, []);

  // 確認ボタンクリック
  const handleConfirm = useCallback(() => {
    const trimmedReason = reason.trim();
    if (!trimmedReason) {
      setError('差し戻し理由は必須です');
      return;
    }
    onConfirm(trimmedReason);
  }, [reason, onConfirm]);

  // ステータスラベル取得
  const fromStatusLabel = PROJECT_STATUS_LABELS[fromStatus];
  const toStatusLabel = PROJECT_STATUS_LABELS[toStatus];

  return (
    <FocusManager
      isOpen={isOpen}
      onClose={handleCancel}
      closeOnEscape={!isSubmitting}
      closeOnOutsideClick={false}
      initialFocusRef={textareaRef as React.RefObject<HTMLElement>}
    >
      <div style={styles.container}>
        {/* タイトル */}
        <h2 style={styles.title}>差し戻し理由の入力</h2>

        {/* ステータス遷移情報 */}
        <div style={styles.statusInfo}>
          <span style={styles.statusLabel}>
            <span
              style={{
                ...styles.statusBadge,
                backgroundColor: '#fbbf24',
                color: '#78350f',
              }}
            >
              {fromStatusLabel}
            </span>
            <span style={styles.arrow}>→</span>
            <span
              style={{
                ...styles.statusBadge,
                backgroundColor: '#d1d5db',
                color: '#374151',
              }}
            >
              {toStatusLabel}
            </span>
            <span style={{ marginLeft: '8px' }}>への差し戻し</span>
          </span>
        </div>

        {/* 理由入力 */}
        <div>
          <label htmlFor="backward-reason" style={styles.label}>
            差し戻し理由 <span style={{ color: '#dc2626' }}>*</span>
          </label>
          <textarea
            ref={textareaRef}
            id="backward-reason"
            value={reason}
            onChange={handleReasonChange}
            placeholder="差し戻しの理由を入力してください..."
            disabled={isSubmitting}
            aria-label="差し戻し理由"
            aria-describedby={error ? errorId : undefined}
            aria-invalid={!!error}
            aria-required="true"
            style={{
              ...styles.textarea,
              ...(error ? styles.textareaError : {}),
              ...(isSubmitting ? styles.textareaDisabled : {}),
            }}
          />
          {error && (
            <div id={errorId} role="alert" aria-live="polite" style={styles.errorMessage}>
              {error}
            </div>
          )}
        </div>

        {/* ボタン */}
        <div style={styles.buttonContainer}>
          <button
            type="button"
            onClick={handleCancel}
            disabled={isSubmitting}
            style={{
              ...styles.buttonBase,
              ...styles.cancelButton,
              ...(isSubmitting ? styles.cancelButtonDisabled : {}),
            }}
          >
            キャンセル
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={isSubmitting}
            style={{
              ...styles.buttonBase,
              ...styles.confirmButton,
              ...(isSubmitting ? styles.confirmButtonDisabled : {}),
            }}
          >
            {isSubmitting ? '処理中...' : '差し戻す'}
          </button>
        </div>
      </div>
    </FocusManager>
  );
}

export default BackwardReasonDialog;
