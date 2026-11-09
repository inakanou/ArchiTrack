/**
 * @fileoverview 自分が外れるときの確認ダイアログ
 *
 * 担当者の変更で自分がプロジェクトを閲覧できなくなるとき、保存の前に確かめる。
 * フォーカスの扱いは削除確認ダイアログと同じ（FocusManager、初めはキャンセル、外側のクリックで閉じない）。
 *
 * Requirements:
 * - 45.1: 逐語の文言と「保存する」「キャンセル」を出す
 * - 45.2: 「キャンセル」で閉じ、保存しない
 */

import { useRef } from 'react';
import FocusManager from '../FocusManager';

/**
 * 自分が外れるときの確認ダイアログの Props
 */
export interface AssigneeSelfRemovalDialogProps {
  /** ダイアログが開いているか */
  isOpen: boolean;
  /** 保存中か */
  isSaving: boolean;
  /** 「保存する」を選んだとき */
  onConfirm: () => void;
  /** 「キャンセル」を選んだとき（Escape も同じ） */
  onCancel: () => void;
}

// 45.1 の逐語
const MESSAGE =
  'この変更を保存すると、あなたはこのプロジェクトを閲覧できなくなります。保存しますか？';

const DIALOG_TITLE_ID = 'assignee-self-removal-dialog-title';
const DIALOG_DESCRIPTION_ID = 'assignee-self-removal-dialog-description';

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
  description: {
    marginBottom: '16px',
    fontSize: '14px',
    color: '#374151',
    lineHeight: '1.6',
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
    backgroundColor: '#e5e7eb',
    color: '#6b7280', // WCAG 2.1 AA（#e5e7eb の上で 5.0:1）
    cursor: 'not-allowed',
  } as React.CSSProperties,
  confirmButton: {
    backgroundColor: '#2563eb',
    color: '#ffffff',
    border: 'none',
  } as React.CSSProperties,
  confirmButtonDisabled: {
    backgroundColor: '#6b7280',
    color: '#ffffff',
    cursor: 'not-allowed',
  } as React.CSSProperties,
};

/**
 * 自分が外れるときの確認ダイアログ
 */
function AssigneeSelfRemovalDialog({
  isOpen,
  isSaving,
  onConfirm,
  onCancel,
}: AssigneeSelfRemovalDialogProps): React.ReactNode {
  const cancelButtonRef = useRef<HTMLButtonElement>(null);

  return (
    <FocusManager
      isOpen={isOpen}
      onClose={onCancel}
      closeOnEscape={!isSaving}
      closeOnOutsideClick={false}
      initialFocusRef={cancelButtonRef as React.RefObject<HTMLElement>}
      ariaLabelledBy={DIALOG_TITLE_ID}
    >
      <div
        style={styles.container}
        aria-labelledby={DIALOG_TITLE_ID}
        aria-describedby={DIALOG_DESCRIPTION_ID}
      >
        <h2 id={DIALOG_TITLE_ID} style={styles.title}>
          担当者の変更の確認
        </h2>

        <p id={DIALOG_DESCRIPTION_ID} style={styles.description}>
          {MESSAGE}
        </p>

        <div style={styles.buttonContainer}>
          <button
            ref={cancelButtonRef}
            type="button"
            onClick={onCancel}
            disabled={isSaving}
            style={{
              ...styles.buttonBase,
              ...styles.cancelButton,
              ...(isSaving ? styles.cancelButtonDisabled : {}),
            }}
          >
            キャンセル
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isSaving}
            style={{
              ...styles.buttonBase,
              ...styles.confirmButton,
              ...(isSaving ? styles.confirmButtonDisabled : {}),
            }}
          >
            {isSaving ? '保存中...' : '保存する'}
          </button>
        </div>
      </div>
    </FocusManager>
  );
}

export default AssigneeSelfRemovalDialog;
