/**
 * @fileoverview アルバム削除確認ダイアログ
 *
 * Task 11.5: アルバム削除確認ダイアログ
 *
 * 工事写真アルバムの削除実行時に確認を求めるモーダルダイアログ。
 * `projects/DeleteConfirmationDialog` と同様に FocusManager による
 * フォーカストラップ・キーボード操作対応を踏襲した薄いクローン。
 * 削除APIの呼び出しや削除後の画面遷移は呼び出し元（詳細/一覧画面）の責務であり、
 * 本コンポーネントはコールバック駆動の疎結合な確認UIのみを提供する。
 *
 * Requirements:
 * - 16.4: ユーザーがアルバム削除を実行しようとする際、削除の確認を求める
 * - (関連 1.4: アルバム削除時に関連する写真項目・看板配置も論理削除される)
 */

import { useRef } from 'react';
import FocusManager from '../FocusManager';

// ============================================================================
// 型定義
// ============================================================================

/**
 * アルバム削除確認ダイアログの Props
 */
export interface AlbumDeleteDialogProps {
  /** ダイアログが開いているか */
  isOpen: boolean;
  /** 削除対象のアルバム名 */
  albumName: string;
  /** 削除確認時のコールバック */
  onConfirm: () => void;
  /** ダイアログを閉じる（キャンセル）時のコールバック */
  onClose: () => void;
  /** 削除処理中フラグ（呼び出し元でAPI呼び出し中に指定） */
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
  albumName: {
    fontWeight: 'bold',
    color: '#1f2937',
  } as React.CSSProperties,
  warningBox: {
    marginBottom: '16px',
    padding: '12px',
    backgroundColor: '#fef3cd',
    borderRadius: '8px',
    border: '1px solid #ffc107',
  } as React.CSSProperties,
  warningTitle: {
    fontSize: '14px',
    fontWeight: 'bold',
    color: '#856404',
    marginBottom: '8px',
  } as React.CSSProperties,
  warningText: {
    fontSize: '14px',
    color: '#856404',
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
    backgroundColor: '#6b7280', // WCAG 2.1 AA準拠 - gray for disabled state
    color: '#ffffff',
    cursor: 'not-allowed',
  } as React.CSSProperties,
};

// ============================================================================
// ID定義
// ============================================================================

const DIALOG_TITLE_ID = 'album-delete-dialog-title';
const DIALOG_DESCRIPTION_ID = 'album-delete-dialog-description';

// ============================================================================
// コンポーネント
// ============================================================================

/**
 * アルバム削除確認ダイアログ
 *
 * @example
 * ```tsx
 * <AlbumDeleteDialog
 *   isOpen={isDialogOpen}
 *   onClose={() => setIsDialogOpen(false)}
 *   onConfirm={handleDelete}
 *   albumName="外壁工事アルバム"
 *   isDeleting={isDeleting}
 * />
 * ```
 */
function AlbumDeleteDialog({
  isOpen,
  albumName,
  onConfirm,
  onClose,
  isDeleting = false,
}: AlbumDeleteDialogProps): React.ReactNode {
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
          アルバムの削除
        </h2>

        {/* 説明文 */}
        <div id={DIALOG_DESCRIPTION_ID} style={styles.description}>
          <span style={styles.albumName}>{albumName}</span>
          を削除しますか？この操作は取り消せません。
        </div>

        {/* 関連データ削除の警告（Requirement 1.4 関連） */}
        <div role="alert" style={styles.warningBox}>
          <div style={styles.warningTitle}>関連データも削除されます</div>
          <div style={styles.warningText}>
            このアルバムに含まれる写真項目、および写真項目に配置された工事看板配置も、
            アルバムと一緒に削除されます。
          </div>
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

export default AlbumDeleteDialog;
