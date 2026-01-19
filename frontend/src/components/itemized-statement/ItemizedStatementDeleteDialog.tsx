/**
 * @fileoverview 内訳書削除確認ダイアログ
 *
 * Task 10: 内訳書削除機能の実装
 *
 * Requirements:
 * - 7.1: 内訳書詳細画面に削除ボタンを表示する
 * - 7.2: 削除ボタンクリック時に確認ダイアログを表示する
 * - 7.3: 確認ダイアログで削除を確定した場合に論理削除APIを呼び出す
 * - 7.4: 削除処理中にエラーが発生した場合にエラーメッセージを表示し内訳書を削除しない
 * - 12.3: 削除処理中のローディングインジケーターを表示する
 * - 12.4: ローディング中は操作ボタンを無効化する
 */

import { useRef } from 'react';
import FocusManager from '../FocusManager';

// ============================================================================
// 型定義
// ============================================================================

/**
 * 内訳書削除確認ダイアログの Props
 */
export interface ItemizedStatementDeleteDialogProps {
  /** ダイアログが開いているか */
  isOpen: boolean;
  /** ダイアログを閉じる時のコールバック */
  onClose: () => void;
  /** 削除確認時のコールバック */
  onConfirm: () => void;
  /** 内訳書名 */
  statementName: string;
  /** 削除処理中フラグ */
  isDeleting?: boolean;
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
  description: {
    marginBottom: '16px',
    fontSize: '14px',
    color: '#374151',
    lineHeight: '1.6',
  } as React.CSSProperties,
  statementName: {
    fontWeight: 'bold',
    color: '#1f2937',
  } as React.CSSProperties,
  warningText: {
    fontSize: '14px',
    color: '#dc2626',
    marginTop: '8px',
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
    color: '#6b7280',
    cursor: 'not-allowed',
  } as React.CSSProperties,
  deleteButton: {
    backgroundColor: '#dc2626',
    color: '#ffffff',
    border: 'none',
  } as React.CSSProperties,
  deleteButtonDisabled: {
    backgroundColor: '#6b7280',
    color: '#ffffff',
    cursor: 'not-allowed',
  } as React.CSSProperties,
};

// ============================================================================
// ID定義
// ============================================================================

const DIALOG_TITLE_ID = 'itemized-statement-delete-dialog-title';
const DIALOG_DESCRIPTION_ID = 'itemized-statement-delete-dialog-description';

// ============================================================================
// コンポーネント
// ============================================================================

/**
 * 内訳書削除確認ダイアログ
 *
 * 内訳書削除時に確認を求めるモーダルダイアログ。
 * FocusManagerを使用したフォーカストラップと、
 * WCAG 2.1 Level AA準拠のアクセシビリティを実装。
 *
 * @example
 * ```tsx
 * <ItemizedStatementDeleteDialog
 *   isOpen={isDialogOpen}
 *   onClose={() => setIsDialogOpen(false)}
 *   onConfirm={handleDelete}
 *   statementName="テスト内訳書"
 *   isDeleting={isDeleting}
 * />
 * ```
 */
function ItemizedStatementDeleteDialog({
  isOpen,
  onClose,
  onConfirm,
  statementName,
  isDeleting = false,
}: ItemizedStatementDeleteDialogProps): React.ReactNode {
  const cancelButtonRef = useRef<HTMLButtonElement>(null);

  return (
    <FocusManager
      isOpen={isOpen}
      onClose={onClose}
      closeOnEscape={!isDeleting}
      closeOnOutsideClick={false}
      initialFocusRef={cancelButtonRef as React.RefObject<HTMLElement>}
      ariaLabelledBy={DIALOG_TITLE_ID}
    >
      <div
        style={styles.container}
        aria-labelledby={DIALOG_TITLE_ID}
        aria-describedby={DIALOG_DESCRIPTION_ID}
      >
        {/* タイトル */}
        <h2 id={DIALOG_TITLE_ID} style={styles.title}>
          内訳書の削除
        </h2>

        {/* 説明文 */}
        <div id={DIALOG_DESCRIPTION_ID} style={styles.description}>
          <span style={styles.statementName}>{statementName}</span>
          を削除しますか？
          <div style={styles.warningText}>この操作は取り消せません。</div>
        </div>

        {/* ボタン */}
        <div style={styles.buttonContainer}>
          <button
            ref={cancelButtonRef}
            type="button"
            onClick={onClose}
            disabled={isDeleting}
            style={{
              ...styles.buttonBase,
              ...styles.cancelButton,
              ...(isDeleting ? styles.cancelButtonDisabled : {}),
            }}
          >
            キャンセル
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isDeleting}
            style={{
              ...styles.buttonBase,
              ...styles.deleteButton,
              ...(isDeleting ? styles.deleteButtonDisabled : {}),
            }}
          >
            {isDeleting ? '削除中...' : '削除'}
          </button>
        </div>
      </div>
    </FocusManager>
  );
}

export default ItemizedStatementDeleteDialog;
