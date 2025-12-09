/**
 * @fileoverview 削除確認ダイアログ コンポーネント
 *
 * プロジェクト削除時に確認を求めるモーダルダイアログ。
 * 関連データが存在する場合は警告メッセージを表示。
 * FocusManagerを使用したフォーカストラップと、
 * WCAG 2.1 Level AA準拠のアクセシビリティを実装。
 *
 * Requirements:
 * - 9.1: ユーザーがプロジェクト詳細画面で「削除」ボタンをクリックする、削除確認ダイアログを表示する
 * - 9.3: プロジェクトが正常に削除される、「プロジェクトを削除しました」という成功メッセージを表示する
 * - 9.4: ユーザーが削除確認ダイアログで「キャンセル」を選択する、ダイアログを閉じ、詳細画面に留まる
 * - 9.5: プロジェクトに関連データ（現場調査、見積書等）が存在する、「関連データがあります。本当に削除しますか？」という警告メッセージを表示
 * - 9.6: ユーザーが関連データ警告ダイアログで「削除する」を選択する、関連データを含めてプロジェクトを論理削除する
 * - 20.1: すべての操作をキーボードのみで実行可能にする
 */

import { useRef } from 'react';
import FocusManager from '../FocusManager';

// ============================================================================
// 型定義
// ============================================================================

/**
 * 関連データの件数
 */
export interface RelatedDataCounts {
  /** 現場調査の件数 */
  surveys?: number;
  /** 見積書の件数 */
  estimates?: number;
}

/**
 * 削除確認ダイアログの Props
 */
export interface DeleteConfirmationDialogProps {
  /** ダイアログが開いているか */
  isOpen: boolean;
  /** ダイアログを閉じる時のコールバック */
  onClose: () => void;
  /** 削除確認時のコールバック */
  onConfirm: () => void;
  /** プロジェクト名 */
  projectName: string;
  /** 関連データが存在するか */
  hasRelatedData: boolean;
  /** 関連データの件数（オプション） */
  relatedDataCounts?: RelatedDataCounts;
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
  projectName: {
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
    marginBottom: '8px',
  } as React.CSSProperties,
  relatedDataList: {
    fontSize: '13px',
    color: '#856404',
    paddingLeft: '16px',
    margin: 0,
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
  deleteButton: {
    backgroundColor: '#dc2626',
    color: '#ffffff',
    border: 'none',
  } as React.CSSProperties,
  deleteButtonDisabled: {
    backgroundColor: '#f87171',
    cursor: 'not-allowed',
    opacity: 0.6,
  } as React.CSSProperties,
};

// ============================================================================
// ID定義
// ============================================================================

const DIALOG_TITLE_ID = 'delete-dialog-title';
const DIALOG_DESCRIPTION_ID = 'delete-dialog-description';

// ============================================================================
// コンポーネント
// ============================================================================

/**
 * 削除確認ダイアログ
 *
 * プロジェクト削除時に確認を求めるモーダルダイアログ。
 * 関連データが存在する場合は警告メッセージを表示し、
 * 慎重な確認を促す。
 *
 * @example
 * ```tsx
 * <DeleteConfirmationDialog
 *   isOpen={isDialogOpen}
 *   onClose={() => setIsDialogOpen(false)}
 *   onConfirm={handleDelete}
 *   projectName="サンプルプロジェクト"
 *   hasRelatedData={true}
 *   relatedDataCounts={{ surveys: 3, estimates: 2 }}
 *   isDeleting={isDeleting}
 * />
 * ```
 */
function DeleteConfirmationDialog({
  isOpen,
  onClose,
  onConfirm,
  projectName,
  hasRelatedData,
  relatedDataCounts,
  isDeleting = false,
}: DeleteConfirmationDialogProps): React.ReactNode {
  const cancelButtonRef = useRef<HTMLButtonElement>(null);

  return (
    <FocusManager
      isOpen={isOpen}
      onClose={onClose}
      closeOnEscape={!isDeleting}
      closeOnOutsideClick={false}
      initialFocusRef={cancelButtonRef as React.RefObject<HTMLElement>}
    >
      <div
        style={styles.container}
        aria-labelledby={DIALOG_TITLE_ID}
        aria-describedby={DIALOG_DESCRIPTION_ID}
      >
        {/* タイトル */}
        <h2 id={DIALOG_TITLE_ID} style={styles.title}>
          プロジェクトの削除
        </h2>

        {/* 説明文 */}
        <div id={DIALOG_DESCRIPTION_ID} style={styles.description}>
          <span style={styles.projectName}>{projectName}</span>
          を削除しますか？この操作は取り消せません。
          {hasRelatedData && '本当に削除しますか？'}
        </div>

        {/* 関連データ警告（存在する場合） */}
        {hasRelatedData && (
          <div role="alert" style={styles.warningBox}>
            <div style={styles.warningTitle}>関連データがあります</div>
            <div style={styles.warningText}>
              このプロジェクトには関連データが存在します。削除すると、これらのデータも一緒に削除されます。
            </div>
            {relatedDataCounts && (
              <ul style={styles.relatedDataList}>
                <li>現場調査: {relatedDataCounts.surveys ?? 0}件</li>
                <li>見積書: {relatedDataCounts.estimates ?? 0}件</li>
              </ul>
            )}
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

export default DeleteConfirmationDialog;
