/**
 * @fileoverview 取引先削除確認ダイアログコンポーネント
 *
 * Task 10.2: 削除確認ダイアログの実装
 *
 * 取引先削除時に確認を求めるモーダルダイアログ。
 * FocusManagerを使用したフォーカストラップと、
 * WCAG 2.1 Level AA準拠のアクセシビリティを実装。
 *
 * Requirements:
 * - 5.1: ユーザーが削除ボタンをクリックしたとき、削除確認ダイアログを表示する
 * - 5.2: ユーザーが削除を確認したとき、取引先レコードを論理削除する
 * - 5.3: ユーザーが削除確認ダイアログでキャンセルをクリックしたとき、ダイアログを閉じ、削除処理を中止する
 * - 5.4: 削除に成功したとき、成功メッセージを表示し、取引先一覧ページに遷移する
 * - 5.5: 取引先がプロジェクトに紐付いている場合、削除を拒否しエラーメッセージを表示する
 */

import { useRef } from 'react';
import FocusManager from '../FocusManager';

// ============================================================================
// 型定義
// ============================================================================

/**
 * 取引先削除確認ダイアログの Props
 */
export interface TradingPartnerDeleteDialogProps {
  /** ダイアログが開いているか */
  isOpen: boolean;
  /** ダイアログを閉じる時のコールバック */
  onClose: () => void;
  /** 削除確認時のコールバック */
  onConfirm: () => void;
  /** 取引先名 */
  partnerName: string;
  /** 削除処理中フラグ */
  isDeleting?: boolean;
  /** エラーメッセージ（プロジェクト紐付けエラー等） */
  error?: string | null;
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
  partnerName: {
    fontWeight: 'bold',
    color: '#1f2937',
  } as React.CSSProperties,
  errorBox: {
    marginBottom: '16px',
    padding: '12px',
    backgroundColor: '#fee2e2',
    borderRadius: '8px',
    border: '1px solid #ef4444',
  } as React.CSSProperties,
  errorText: {
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
    backgroundColor: '#e5e7eb',
    color: '#6b7280', // WCAG 2.1 AA準拠 (5.0:1 on #e5e7eb)
    cursor: 'not-allowed',
  } as React.CSSProperties,
  deleteButton: {
    backgroundColor: '#dc2626',
    color: '#ffffff',
    border: 'none',
  } as React.CSSProperties,
  deleteButtonDisabled: {
    backgroundColor: '#6b7280', // WCAG 2.1 AA準拠 - gray for disabled
    cursor: 'not-allowed',
  } as React.CSSProperties,
};

// ============================================================================
// ID定義
// ============================================================================

const DIALOG_TITLE_ID = 'trading-partner-delete-dialog-title';
const DIALOG_DESCRIPTION_ID = 'trading-partner-delete-dialog-description';

// ============================================================================
// コンポーネント
// ============================================================================

/**
 * 取引先削除確認ダイアログ
 *
 * 取引先削除時に確認を求めるモーダルダイアログ。
 * プロジェクトに紐付いている場合はエラーメッセージを表示し、
 * 慎重な確認を促す。
 *
 * @example
 * ```tsx
 * <TradingPartnerDeleteDialog
 *   isOpen={isDialogOpen}
 *   onClose={() => setIsDialogOpen(false)}
 *   onConfirm={handleDelete}
 *   partnerName="テスト株式会社"
 *   isDeleting={isDeleting}
 *   error={deleteError}
 * />
 * ```
 */
function TradingPartnerDeleteDialog({
  isOpen,
  onClose,
  onConfirm,
  partnerName,
  isDeleting = false,
  error = null,
}: TradingPartnerDeleteDialogProps): React.ReactNode {
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
          取引先の削除
        </h2>

        {/* 説明文 */}
        <div id={DIALOG_DESCRIPTION_ID} style={styles.description}>
          <span style={styles.partnerName}>{partnerName}</span>
          を削除しますか？この操作は取り消せません。
        </div>

        {/* エラーメッセージ（プロジェクト紐付けエラー等） */}
        {error && (
          <div role="alert" style={styles.errorBox}>
            <div style={styles.errorText}>{error}</div>
          </div>
        )}

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

export default TradingPartnerDeleteDialog;
