/**
 * @fileoverview 削除確認ダイアログ コンポーネント
 *
 * プロジェクト削除時に確認を求めるモーダルダイアログ。
 * 関連データが存在する場合は警告と種類ごとの件数を表示し、
 * 常に保持期間（90日後の完全削除）を知らせる。
 * FocusManagerを使用したフォーカストラップと、
 * WCAG 2.1 Level AA準拠のアクセシビリティを実装。
 *
 * Requirements:
 * - 9.1: ユーザーがプロジェクト詳細画面で「削除」ボタンをクリックする、削除確認ダイアログを表示する
 * - 9.3: プロジェクトが正常に削除される、「プロジェクトを削除しました」という成功メッセージを表示する
 * - 9.4: ユーザーが削除確認ダイアログで「キャンセル」を選択する、ダイアログを閉じ、詳細画面に留まる
 * - 9.5: 論理削除されていない関連データがあるとき、「関連データがあります。本当に削除しますか？」と種類ごとの件数を出し、「削除する」「キャンセル」を出す
 * - 9.6: ユーザーが関連データ警告ダイアログで「削除する」を選択する、プロジェクトを論理削除する
 * - 46.3: 論理削除したプロジェクトを元に戻す手段を出さない
 * - 46.4: 関連データと共に90日後に完全に削除され元に戻せない旨を出す
 * - 20.1: すべての操作をキーボードのみで実行可能にする
 */

import { useRef } from 'react';
import FocusManager from '../FocusManager';

// ============================================================================
// 型定義
// ============================================================================

/**
 * 関連データの種類ごとの件数（GET /api/projects/:id/related-counts の応答と同じ形）
 */
export interface RelatedCounts {
  /** 現場調査 */
  siteSurveys: number;
  /** 数量表 */
  quantityTables: number;
  /** 内訳書 */
  itemizedStatements: number;
  /** 見積依頼 */
  estimateRequests: number;
  /** 受領見積書 */
  receivedQuotations: number;
  /** 見積書 */
  estimates: number;
  /** 契約書 */
  contracts: number;
  /** 工程表 */
  schedules: number;
  /** 実行予算 */
  executionBudgets: number;
  /** 工事写真 */
  constructionPhotos: number;
}

/**
 * 表示する種類と名前（9.5 の順）
 */
const RELATED_COUNT_LABELS: ReadonlyArray<{ key: keyof RelatedCounts; label: string }> = [
  { key: 'siteSurveys', label: '現場調査' },
  { key: 'quantityTables', label: '数量表' },
  { key: 'itemizedStatements', label: '内訳書' },
  { key: 'estimateRequests', label: '見積依頼' },
  { key: 'receivedQuotations', label: '受領見積書' },
  { key: 'estimates', label: '見積書' },
  { key: 'contracts', label: '契約書' },
  { key: 'schedules', label: '工程表' },
  { key: 'executionBudgets', label: '実行予算' },
  { key: 'constructionPhotos', label: '工事写真' },
];

/** 関連データがあるときの警告（9.5 の逐語） */
const RELATED_DATA_WARNING = '関連データがあります。本当に削除しますか？';

/** 保持期間の文（46.4） */
const RETENTION_NOTICE =
  '削除したプロジェクトは、関連データと共に90日後に完全に削除され、元に戻せません。';

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
  /** 関連データの種類ごとの件数（オプション） */
  relatedDataCounts?: RelatedCounts;
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
  retentionNotice: {
    marginBottom: '16px',
    fontSize: '14px',
    color: '#374151',
    lineHeight: '1.6',
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
 *   relatedDataCounts={relatedCounts}
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
  // 件数が 1 以上の種類だけを並べる
  const visibleCounts = relatedDataCounts
    ? RELATED_COUNT_LABELS.filter(({ key }) => relatedDataCounts[key] > 0)
    : [];

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
          プロジェクトの削除
        </h2>

        {/* 説明文 */}
        <div id={DIALOG_DESCRIPTION_ID} style={styles.description}>
          <span style={styles.projectName}>{projectName}</span>
          を削除しますか？この操作は取り消せません。
        </div>

        {/* 関連データ警告（存在する場合） */}
        {hasRelatedData && (
          <div role="alert" style={styles.warningBox}>
            <div style={styles.warningTitle}>{RELATED_DATA_WARNING}</div>
            {visibleCounts.length > 0 && relatedDataCounts && (
              <ul style={styles.relatedDataList}>
                {visibleCounts.map(({ key, label }) => (
                  <li key={key}>
                    {label}: {relatedDataCounts[key]}件
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* 保持期間の文（常に出す） */}
        <p style={styles.retentionNotice}>{RETENTION_NOTICE}</p>

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
            {isDeleting ? '削除中...' : hasRelatedData ? '削除する' : '削除'}
          </button>
        </div>
      </div>
    </FocusManager>
  );
}

export default DeleteConfirmationDialog;
