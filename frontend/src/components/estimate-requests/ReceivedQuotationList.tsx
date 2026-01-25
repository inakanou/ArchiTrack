/**
 * @fileoverview 受領見積書一覧コンポーネント
 *
 * Task 14.2: ReceivedQuotationListの実装
 *
 * Requirements:
 * - 11.1: 受領見積書登録ボタン
 * - 11.11: 複数の受領見積書を許可
 * - 11.12: 登録済み受領見積書の表示
 * - 11.13: 受領見積書名、提出日、登録日時の表示
 * - 11.14: ファイルプレビューリンク（署名付きURL）
 * - 11.16: 編集・削除アクションボタン
 * - 11.17: 削除確認ダイアログ
 */

import { useState, useCallback } from 'react';
import type { ReceivedQuotationInfo } from './ReceivedQuotationForm';

// ============================================================================
// 型定義
// ============================================================================

/**
 * ReceivedQuotationListコンポーネントのProps
 */
export interface ReceivedQuotationListProps {
  /** 見積依頼ID */
  estimateRequestId: string;
  /** 受領見積書一覧 */
  quotations: ReceivedQuotationInfo[];
  /** 登録ボタンクリック時のコールバック */
  onAddClick: () => void;
  /** 編集ボタンクリック時のコールバック */
  onEditClick: (quotation: ReceivedQuotationInfo) => void;
  /** 削除確認後のコールバック */
  onDeleteClick: (quotation: ReceivedQuotationInfo) => void;
  /** プレビューボタンクリック時のコールバック */
  onPreviewClick: (quotation: ReceivedQuotationInfo) => void;
  /** 無効状態 */
  disabled?: boolean;
}

// ============================================================================
// スタイル定義
// ============================================================================

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '16px',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    fontSize: '16px',
    fontWeight: 600,
    color: '#374151',
    margin: 0,
  },
  addButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '8px 16px',
    fontSize: '14px',
    fontWeight: 500,
    color: '#ffffff',
    backgroundColor: '#2563eb',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    transition: 'background-color 0.2s',
  },
  addButtonDisabled: {
    backgroundColor: '#9ca3af',
    cursor: 'not-allowed',
  },
  emptyMessage: {
    padding: '24px',
    textAlign: 'center' as const,
    color: '#6b7280',
    fontSize: '14px',
    backgroundColor: '#f9fafb',
    borderRadius: '8px',
    border: '1px dashed #d1d5db',
  },
  list: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '8px',
  },
  listItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '12px 16px',
    backgroundColor: '#ffffff',
    borderRadius: '8px',
    border: '1px solid #e5e7eb',
    transition: 'border-color 0.2s',
  },
  iconContainer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '40px',
    height: '40px',
    borderRadius: '8px',
    backgroundColor: '#f3f4f6',
    flexShrink: 0,
  },
  contentContainer: {
    flex: 1,
    minWidth: 0,
  },
  quotationName: {
    fontSize: '14px',
    fontWeight: 500,
    color: '#374151',
    marginBottom: '4px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  metaInfo: {
    display: 'flex',
    gap: '12px',
    fontSize: '12px',
    color: '#6b7280',
  },
  metaItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
  },
  actionsContainer: {
    display: 'flex',
    gap: '8px',
    flexShrink: 0,
  },
  actionButton: {
    padding: '6px 12px',
    fontSize: '12px',
    fontWeight: 500,
    border: '1px solid #d1d5db',
    borderRadius: '4px',
    backgroundColor: '#ffffff',
    color: '#374151',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  previewButton: {
    color: '#2563eb',
    borderColor: '#2563eb',
  },
  deleteButton: {
    color: '#ef4444',
    borderColor: '#ef4444',
  },
  dialogOverlay: {
    position: 'fixed' as const,
    inset: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  dialogContent: {
    backgroundColor: '#ffffff',
    borderRadius: '12px',
    padding: '24px',
    maxWidth: '400px',
    width: '90%',
    boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
  },
  dialogTitle: {
    fontSize: '18px',
    fontWeight: 600,
    color: '#374151',
    marginBottom: '12px',
  },
  dialogMessage: {
    fontSize: '14px',
    color: '#6b7280',
    marginBottom: '20px',
    lineHeight: 1.5,
  },
  dialogActions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '12px',
  },
  dialogCancelButton: {
    padding: '8px 16px',
    fontSize: '14px',
    fontWeight: 500,
    backgroundColor: '#ffffff',
    color: '#374151',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    cursor: 'pointer',
  },
  dialogConfirmButton: {
    padding: '8px 16px',
    fontSize: '14px',
    fontWeight: 500,
    backgroundColor: '#ef4444',
    color: '#ffffff',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
  },
};

// ============================================================================
// ヘルパー関数
// ============================================================================

/**
 * 日付をフォーマット
 */
function formatDate(date: Date): string {
  const d = new Date(date);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * ファイルサイズをフォーマット
 */
function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * MIMEタイプからファイルタイプを判定
 */
function getFileType(mimeType: string | null): 'pdf' | 'excel' | 'image' | 'unknown' {
  if (!mimeType) return 'unknown';
  if (mimeType === 'application/pdf') return 'pdf';
  if (
    mimeType === 'application/vnd.ms-excel' ||
    mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ) {
    return 'excel';
  }
  if (mimeType.startsWith('image/')) return 'image';
  return 'unknown';
}

// ============================================================================
// アイコンコンポーネント
// ============================================================================

function TextIcon() {
  return (
    <svg
      data-testid="icon-text"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#6b7280"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10 9 9 9 8 9" />
    </svg>
  );
}

function PdfIcon() {
  return (
    <svg
      data-testid="icon-pdf"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#ef4444"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <path d="M10 12h4" />
      <path d="M10 16h4" />
    </svg>
  );
}

function ExcelIcon() {
  return (
    <svg
      data-testid="icon-excel"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#22c55e"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <rect x="8" y="12" width="8" height="6" />
      <line x1="12" y1="12" x2="12" y2="18" />
      <line x1="8" y1="15" x2="16" y2="15" />
    </svg>
  );
}

function ImageIcon() {
  return (
    <svg
      data-testid="icon-image"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#3b82f6"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <polyline points="21 15 16 10 5 21" />
    </svg>
  );
}

function FileTypeIcon({ quotation }: { quotation: ReceivedQuotationInfo }) {
  if (quotation.contentType === 'TEXT') {
    return <TextIcon />;
  }

  const fileType = getFileType(quotation.fileMimeType);
  switch (fileType) {
    case 'pdf':
      return <PdfIcon />;
    case 'excel':
      return <ExcelIcon />;
    case 'image':
      return <ImageIcon />;
    default:
      return <TextIcon />;
  }
}

function PlusIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

// ============================================================================
// 削除確認ダイアログ
// ============================================================================

interface DeleteConfirmDialogProps {
  isOpen: boolean;
  quotationName: string;
  onConfirm: () => void;
  onCancel: () => void;
}

function DeleteConfirmDialog({
  isOpen,
  quotationName,
  onConfirm,
  onCancel,
}: DeleteConfirmDialogProps) {
  if (!isOpen) return null;

  return (
    <div style={styles.dialogOverlay} onClick={onCancel} role="dialog" aria-modal="true">
      <div style={styles.dialogContent} onClick={(e) => e.stopPropagation()}>
        <h3 style={styles.dialogTitle}>受領見積書の削除</h3>
        <p style={styles.dialogMessage}>
          「{quotationName}」を削除しますか？この操作は取り消せません。
        </p>
        <div style={styles.dialogActions}>
          <button type="button" style={styles.dialogCancelButton} onClick={onCancel}>
            キャンセル
          </button>
          <button type="button" style={styles.dialogConfirmButton} onClick={onConfirm}>
            削除する
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// メインコンポーネント
// ============================================================================

/**
 * 受領見積書一覧コンポーネント
 *
 * @example
 * ```tsx
 * <ReceivedQuotationList
 *   estimateRequestId="er-123"
 *   quotations={quotations}
 *   onAddClick={() => setShowForm(true)}
 *   onEditClick={(q) => handleEdit(q)}
 *   onDeleteClick={(q) => handleDelete(q)}
 *   onPreviewClick={(q) => handlePreview(q)}
 * />
 * ```
 */
export function ReceivedQuotationList({
  quotations,
  onAddClick,
  onEditClick,
  onDeleteClick,
  onPreviewClick,
  disabled = false,
}: ReceivedQuotationListProps) {
  const [deleteTarget, setDeleteTarget] = useState<ReceivedQuotationInfo | null>(null);

  const handleDeleteClick = useCallback((quotation: ReceivedQuotationInfo) => {
    setDeleteTarget(quotation);
  }, []);

  const handleDeleteConfirm = useCallback(() => {
    if (deleteTarget) {
      onDeleteClick(deleteTarget);
      setDeleteTarget(null);
    }
  }, [deleteTarget, onDeleteClick]);

  const handleDeleteCancel = useCallback(() => {
    setDeleteTarget(null);
  }, []);

  return (
    <div style={styles.container}>
      {/* ヘッダー */}
      <div style={styles.header}>
        <h3 style={styles.title}>受領見積書</h3>
        <button
          type="button"
          onClick={onAddClick}
          disabled={disabled}
          style={{
            ...styles.addButton,
            ...(disabled ? styles.addButtonDisabled : {}),
          }}
        >
          <PlusIcon />
          受領見積書登録
        </button>
      </div>

      {/* 一覧またはメッセージ */}
      {quotations.length === 0 ? (
        <div style={styles.emptyMessage}>受領見積書はまだ登録されていません</div>
      ) : (
        <div style={styles.list}>
          {quotations.map((quotation) => (
            <div key={quotation.id} style={styles.listItem} data-testid="received-quotation-item">
              {/* ファイルタイプアイコン */}
              <div style={styles.iconContainer}>
                <FileTypeIcon quotation={quotation} />
              </div>

              {/* コンテンツ */}
              <div style={styles.contentContainer}>
                <div style={styles.quotationName}>{quotation.name}</div>
                <div style={styles.metaInfo}>
                  <span style={styles.metaItem}>提出日: {formatDate(quotation.submittedAt)}</span>
                  {quotation.contentType === 'FILE' && quotation.fileSize && (
                    <span style={styles.metaItem}>{formatFileSize(quotation.fileSize)}</span>
                  )}
                </div>
              </div>

              {/* アクションボタン */}
              <div style={styles.actionsContainer}>
                {quotation.contentType === 'FILE' && (
                  <button
                    type="button"
                    onClick={() => onPreviewClick(quotation)}
                    style={{ ...styles.actionButton, ...styles.previewButton }}
                    disabled={disabled}
                  >
                    プレビュー
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => onEditClick(quotation)}
                  style={styles.actionButton}
                  disabled={disabled}
                >
                  編集
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteClick(quotation)}
                  style={{ ...styles.actionButton, ...styles.deleteButton }}
                  disabled={disabled}
                >
                  削除
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 削除確認ダイアログ */}
      <DeleteConfirmDialog
        isOpen={deleteTarget !== null}
        quotationName={deleteTarget?.name ?? ''}
        onConfirm={handleDeleteConfirm}
        onCancel={handleDeleteCancel}
      />
    </div>
  );
}

export default ReceivedQuotationList;
