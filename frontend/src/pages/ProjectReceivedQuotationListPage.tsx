/**
 * @fileoverview 案件の受領見積書の一覧の画面（estimate-request のタスク118.1）
 *
 * 案件に属する受領見積書を、見積依頼に紐づくものと紐づかないものの区別なく一覧する（要件 43.1・43.2・43.3）。
 * 見積依頼名からその見積依頼の詳細へ遷移でき（要件 43.4）、見積依頼の無い受領見積書は、この画面から
 * 登録・編集・削除する（要件 43.5・43.6・43.9）。見積依頼に紐づくものの編集・削除は見積依頼の詳細画面
 * （要件 11）が持つため、この画面では出さない。参考の印と読取の確認は共有の部品で出す（要件 46.10）。
 *
 * - 権限の無い閲覧・操作は、見積依頼の画面（要件 10.3・10.4）と同じくアクセスの拒否・操作の拒否を出す（要件 43.11）
 * - プロジェクトの読み込みの 404 は、見積依頼の一覧（要件 10.5）と同じ表示にする（要件 43.13）
 * - 保存の失敗はすべてフォームへ投げ返し、再認証の後の再送はフォームの `usePendingSaveAfterReauth` が行う
 *   （タスク117.4 の見積依頼の詳細画面と同じ配線）。同じ原本の他の受領見積書の知らせ（要件 48.4）は、
 *   フォームを閉じた後に一覧の上の `role="status"` へ出す
 */

import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getProject } from '../api/projects';
import {
  getReceivedQuotationsByProject,
  createProjectReceivedQuotation,
  updateReceivedQuotation,
  deleteReceivedQuotation,
  getPreviewUrl,
} from '../api/received-quotations';
import type {
  ReceivedQuotationInfo,
  CreateReceivedQuotationInput,
  UpdateReceivedQuotationInput,
  ReceivedQuotationSaveResult,
} from '../api/received-quotations';
import { ApiError } from '../api/client';
import { Breadcrumb, ResourceNotFound } from '../components/common';
import { ReceivedQuotationForm } from '../components/estimate-requests';
import { ReceivedQuotationLedgerIndicators } from '../components/estimate-requests/ReceivedQuotationLedgerIndicators';
import {
  QUOTATION_LIST_REFRESH_FAILED_MESSAGE,
  formatSharedOriginalNotice,
} from '../components/estimate-requests/received-quotation-form-messages';
import {
  getEstimateRequestNotFoundMessage,
  isNotFoundError,
} from '../utils/estimateRequestNotFound';
import {
  PROJECT_QUOTATION_FORBIDDEN_MESSAGES,
  PROJECT_QUOTATION_LIST_TEXT,
} from './project-received-quotation-list-messages';

// ============================================================================
// スタイル定義
// ============================================================================

const styles = {
  container: {
    maxWidth: '1200px',
    margin: '0 auto',
    padding: '32px 16px',
  } as React.CSSProperties,
  breadcrumbWrapper: {
    marginBottom: '16px',
  } as React.CSSProperties,
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap' as const,
    gap: '12px',
    marginBottom: '24px',
  } as React.CSSProperties,
  title: {
    fontSize: '24px',
    fontWeight: 'bold',
    color: '#1f2937',
    margin: 0,
  } as React.CSSProperties,
  subtitle: {
    fontSize: '14px',
    color: '#6b7280',
    margin: '4px 0 0 0',
  } as React.CSSProperties,
  primaryButton: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    backgroundColor: '#2563eb',
    color: '#ffffff',
    padding: '10px 20px',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: 500,
    border: 'none',
    cursor: 'pointer',
  } as React.CSSProperties,
  tableWrapper: {
    overflowX: 'auto' as const,
    backgroundColor: '#ffffff',
    borderRadius: '8px',
    border: '1px solid #e5e7eb',
  } as React.CSSProperties,
  table: {
    width: '100%',
    borderCollapse: 'collapse' as const,
    fontSize: '14px',
  } as React.CSSProperties,
  th: {
    textAlign: 'left' as const,
    padding: '10px 12px',
    backgroundColor: '#f9fafb',
    color: '#374151',
    fontWeight: 600,
    borderBottom: '1px solid #e5e7eb',
    whiteSpace: 'nowrap' as const,
  } as React.CSSProperties,
  td: {
    padding: '10px 12px',
    color: '#1f2937',
    borderBottom: '1px solid #f3f4f6',
    verticalAlign: 'middle' as const,
  } as React.CSSProperties,
  amountCell: {
    textAlign: 'right' as const,
    whiteSpace: 'nowrap' as const,
  } as React.CSSProperties,
  requestLink: {
    color: '#1d4ed8',
    textDecoration: 'underline',
  } as React.CSSProperties,
  noRequest: {
    color: '#4b5563',
  } as React.CSSProperties,
  actions: {
    display: 'flex',
    gap: '8px',
  } as React.CSSProperties,
  secondaryButton: {
    padding: '4px 12px',
    fontSize: '13px',
    borderRadius: '4px',
    border: '1px solid #d1d5db',
    backgroundColor: '#ffffff',
    color: '#374151',
    cursor: 'pointer',
  } as React.CSSProperties,
  dangerButton: {
    padding: '4px 12px',
    fontSize: '13px',
    borderRadius: '4px',
    border: '1px solid #fecaca',
    backgroundColor: '#ffffff',
    color: '#b91c1c',
    cursor: 'pointer',
  } as React.CSSProperties,
  emptyState: {
    textAlign: 'center' as const,
    padding: '64px 24px',
    backgroundColor: '#ffffff',
    borderRadius: '8px',
    border: '1px solid #e5e7eb',
    color: '#4b5563',
    fontSize: '16px',
  } as React.CSSProperties,
  notice: {
    margin: '0 0 12px 0',
    padding: '8px 12px',
    borderRadius: '6px',
    backgroundColor: '#eff6ff',
    border: '1px solid #bfdbfe',
    color: '#1e3a8a',
    fontSize: '14px',
  } as React.CSSProperties,
  operationError: {
    margin: '0 0 12px 0',
    padding: '8px 12px',
    borderRadius: '6px',
    backgroundColor: '#fef2f2',
    border: '1px solid #fecaca',
    color: '#991b1b',
    fontSize: '14px',
  } as React.CSSProperties,
  loadingContainer: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    padding: '64px 16px',
  } as React.CSSProperties,
  loadingSpinner: {
    width: '48px',
    height: '48px',
    border: '4px solid #e5e7eb',
    borderTop: '4px solid #2563eb',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
    marginBottom: '16px',
  } as React.CSSProperties,
  errorContainer: {
    backgroundColor: '#fef2f2',
    border: '1px solid #fecaca',
    borderRadius: '8px',
    padding: '24px',
    textAlign: 'center' as const,
  } as React.CSSProperties,
  errorText: {
    color: '#991b1b',
    fontSize: '14px',
    margin: '0 0 16px 0',
  } as React.CSSProperties,
  retryButton: {
    backgroundColor: '#dc2626',
    color: '#ffffff',
    border: 'none',
    padding: '8px 16px',
    fontSize: '14px',
    fontWeight: 500,
    borderRadius: '6px',
    cursor: 'pointer',
  } as React.CSSProperties,
  overlay: {
    position: 'fixed' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  } as React.CSSProperties,
  modalContent: {
    backgroundColor: '#ffffff',
    borderRadius: '12px',
    padding: '24px',
    maxWidth: '95vw',
    width: '1400px',
    maxHeight: '90vh',
    overflow: 'auto',
    margin: '20px',
  } as React.CSSProperties,
  modalTitle: {
    fontSize: '18px',
    fontWeight: 600,
    color: '#1f2937',
    margin: '0 0 16px 0',
  } as React.CSSProperties,
  dialogContent: {
    backgroundColor: '#ffffff',
    borderRadius: '8px',
    padding: '24px',
    maxWidth: '400px',
    width: '100%',
    margin: '16px',
  } as React.CSSProperties,
  dialogMessage: {
    fontSize: '14px',
    color: '#4b5563',
    margin: '0 0 24px 0',
  } as React.CSSProperties,
  dialogActions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '12px',
  } as React.CSSProperties,
  dialogConfirmButton: {
    padding: '8px 16px',
    fontSize: '14px',
    fontWeight: 500,
    borderRadius: '6px',
    border: 'none',
    backgroundColor: '#dc2626',
    color: '#ffffff',
    cursor: 'pointer',
  } as React.CSSProperties,
};

// ============================================================================
// ヘルパー関数
// ============================================================================

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

/** 提出日（YYYY/MM/DD） */
function formatDate(date: Date): string {
  const d = new Date(date);
  return `${d.getFullYear()}/${pad2(d.getMonth() + 1)}/${pad2(d.getDate())}`;
}

/** 登録日時（YYYY/MM/DD HH:mm） */
function formatDateTime(date: Date): string {
  const d = new Date(date);
  return `${formatDate(d)} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** NET金額（未入力は「-」） */
function formatNetAmount(amount: number | null): string {
  return amount === null ? '-' : `${amount.toLocaleString('ja-JP')}円`;
}

/** 権限の無い操作（403）か */
function isForbiddenError(error: unknown): boolean {
  return error instanceof ApiError && error.statusCode === 403;
}

// ============================================================================
// サブコンポーネント
// ============================================================================

interface DeleteConfirmDialogProps {
  quotationName: string;
  isDeleting: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** 削除の確認（要件 43.9。削除は要件 14.5 の論理削除） */
function DeleteConfirmDialog({
  quotationName,
  isDeleting,
  onConfirm,
  onCancel,
}: DeleteConfirmDialogProps) {
  return (
    <div style={styles.overlay} onClick={isDeleting ? undefined : onCancel}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="project-quotation-delete-title"
        style={styles.dialogContent}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="project-quotation-delete-title" style={styles.modalTitle}>
          受領見積書の削除
        </h2>
        <p style={styles.dialogMessage}>
          「{quotationName}」を削除しますか？この操作は取り消せません。
        </p>
        <div style={styles.dialogActions}>
          <button
            type="button"
            style={styles.secondaryButton}
            onClick={onCancel}
            disabled={isDeleting}
          >
            キャンセル
          </button>
          <button
            type="button"
            style={styles.dialogConfirmButton}
            onClick={onConfirm}
            disabled={isDeleting}
          >
            削除する
          </button>
        </div>
      </div>
    </div>
  );
}

interface QuotationRowProps {
  quotation: ReceivedQuotationInfo;
  onEdit: (quotation: ReceivedQuotationInfo) => void;
  onDelete: (quotation: ReceivedQuotationInfo) => void;
}

/** 一覧の 1 行（要件 43.2・43.4・43.9・46.10） */
function QuotationRow({ quotation, onEdit, onDelete }: QuotationRowProps) {
  const isRequestLess = quotation.estimateRequestId === null;
  return (
    <tr data-testid={`project-quotation-row-${quotation.id}`}>
      <td style={styles.td}>{quotation.name}</td>
      <td style={styles.td}>{quotation.vendorName}</td>
      <td style={styles.td}>{formatDate(quotation.submittedAt)}</td>
      <td style={styles.td}>
        {isRequestLess ? (
          <span style={styles.noRequest}>{PROJECT_QUOTATION_LIST_TEXT.NO_ESTIMATE_REQUEST}</span>
        ) : (
          <Link to={`/estimate-requests/${quotation.estimateRequestId}`} style={styles.requestLink}>
            {quotation.estimateRequestName ?? quotation.estimateRequestId}
          </Link>
        )}
      </td>
      <td style={{ ...styles.td, ...styles.amountCell }}>{formatNetAmount(quotation.netAmount)}</td>
      <td style={styles.td}>{formatDateTime(quotation.createdAt)}</td>
      <td style={styles.td}>
        <ReceivedQuotationLedgerIndicators
          lineItems={quotation.lineItems}
          readingStatus={quotation.readingStatus}
        />
      </td>
      <td style={styles.td}>
        {/* 見積依頼に紐づくものの編集・削除は見積依頼の詳細画面が持つ（要件 43.9・43.10） */}
        {isRequestLess && (
          <div style={styles.actions}>
            <button
              type="button"
              style={styles.secondaryButton}
              onClick={() => onEdit(quotation)}
              aria-label={`${quotation.name}を編集`}
            >
              編集
            </button>
            <button
              type="button"
              style={styles.dangerButton}
              onClick={() => onDelete(quotation)}
              aria-label={`${quotation.name}を削除`}
            >
              削除
            </button>
          </div>
        )}
      </td>
    </tr>
  );
}

// ============================================================================
// メインコンポーネント
// ============================================================================

/**
 * 案件の受領見積書の一覧の画面（`/projects/:projectId/quotations`）
 */
export default function ProjectReceivedQuotationListPage() {
  const { projectId } = useParams<{ projectId: string }>();

  const [quotations, setQuotations] = useState<ReceivedQuotationInfo[]>([]);
  const [projectName, setProjectName] = useState<string>('');

  // 読み込みの状態
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // プロジェクトの読み込みが 404 を受けた（範囲外と不在を区別しない。要件 43.13）
  const [isProjectNotFound, setIsProjectNotFound] = useState(false);
  // 一覧の閲覧の権限が無い（要件 43.11）
  const [isViewForbidden, setIsViewForbidden] = useState(false);

  // 操作の失敗（削除の拒否・不在、保存の後の一覧の再読み込みの失敗）
  const [operationError, setOperationError] = useState<string | null>(null);
  // 同じ原本の他の受領見積書の知らせ（要件 48.4）。次にフォームを開くまで出しておく
  const [sharedOriginalNotice, setSharedOriginalNotice] = useState<string | null>(null);

  // フォーム
  const [showForm, setShowForm] = useState(false);
  const [editingQuotation, setEditingQuotation] = useState<ReceivedQuotationInfo | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [existingFilePreviewUrl, setExistingFilePreviewUrl] = useState<string | null>(null);
  const [isLoadingPreviewUrl, setIsLoadingPreviewUrl] = useState(false);

  // 削除の確認
  const [deleteTarget, setDeleteTarget] = useState<ReceivedQuotationInfo | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  /** 一覧とプロジェクト名を取得する（要件 43.1） */
  const fetchData = useCallback(async () => {
    if (!projectId) return;

    setIsLoading(true);
    setError(null);
    setIsProjectNotFound(false);
    setIsViewForbidden(false);

    try {
      const [list, project] = await Promise.all([
        getReceivedQuotationsByProject(projectId, { include: 'all' }),
        getProject(projectId),
      ]);
      setQuotations(list);
      if (project?.name) {
        setProjectName(project.name);
      }
    } catch (err) {
      if (isNotFoundError(err)) {
        // 見つからない旨は ResourceNotFound が告げる（要件 43.13）
        setIsProjectNotFound(true);
        return;
      }
      if (isForbiddenError(err)) {
        setIsViewForbidden(true);
        return;
      }
      setError(PROJECT_QUOTATION_LIST_TEXT.FETCH_FAILED);
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  /** 保存・削除の後に一覧だけを取り直す */
  const refreshList = useCallback(async () => {
    if (!projectId) return;
    const list = await getReceivedQuotationsByProject(projectId, { include: 'all' });
    setQuotations(list);
  }, [projectId]);

  /** 登録のフォームを開く（要件 43.5・43.6） */
  const handleRegisterClick = useCallback(() => {
    setEditingQuotation(null);
    setExistingFilePreviewUrl(null);
    setSharedOriginalNotice(null);
    setOperationError(null);
    setShowForm(true);
  }, []);

  /** 編集のフォームを開く（要件 43.9）。ファイルがあれば読み取りの再実行のためにプレビューの URL を取る */
  const handleEditClick = useCallback(async (quotation: ReceivedQuotationInfo) => {
    setEditingQuotation(quotation);
    setExistingFilePreviewUrl(null);
    setSharedOriginalNotice(null);
    setOperationError(null);
    setShowForm(true);

    if (quotation.fileName) {
      setIsLoadingPreviewUrl(true);
      try {
        setExistingFilePreviewUrl(await getPreviewUrl(quotation.id));
      } catch {
        // 取れなければ読み取りの再実行は使えないが、フォームは開く
        setExistingFilePreviewUrl(null);
      } finally {
        setIsLoadingPreviewUrl(false);
      }
    }
  }, []);

  const closeForm = useCallback(() => {
    setShowForm(false);
    setEditingQuotation(null);
    setExistingFilePreviewUrl(null);
  }, []);

  /**
   * フォームの保存。失敗はすべてフォームへ投げ返す（400・404・409・401 の扱いはフォームが持つ）。
   * 権限の無い操作（403）は、応答の英語の文言の代わりに操作の拒否の文言で投げ返す（要件 43.11）
   */
  const handleSubmit = useCallback(
    async (data: CreateReceivedQuotationInput | UpdateReceivedQuotationInput) => {
      if (!projectId) return;

      setIsSubmitting(true);
      let saved: ReceivedQuotationSaveResult;
      try {
        saved = editingQuotation
          ? await updateReceivedQuotation(
              editingQuotation.id,
              data as UpdateReceivedQuotationInput,
              editingQuotation.updatedAt.toISOString()
            )
          : await createProjectReceivedQuotation(projectId, data as CreateReceivedQuotationInput);
      } catch (err) {
        setIsSubmitting(false);
        if (isForbiddenError(err)) {
          throw new Error(PROJECT_QUOTATION_FORBIDDEN_MESSAGES.OPERATION);
        }
        throw err;
      }

      // 保存は成功した。ここから先の失敗は保存の失敗としてフォームへ伝えない（二重に登録させない）
      closeForm();
      setSharedOriginalNotice(formatSharedOriginalNotice(saved?.sharedOriginalCount ?? 0));
      try {
        await refreshList();
      } catch {
        setOperationError(QUOTATION_LIST_REFRESH_FAILED_MESSAGE);
      } finally {
        setIsSubmitting(false);
      }
    },
    [projectId, editingQuotation, closeForm, refreshList]
  );

  /** 削除の確認で「削除する」を選んだ（要件 43.9） */
  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteTarget) return;

    setIsDeleting(true);
    setOperationError(null);
    try {
      await deleteReceivedQuotation(deleteTarget.id, deleteTarget.updatedAt.toISOString());
    } catch (err) {
      setIsDeleting(false);
      setDeleteTarget(null);
      if (isForbiddenError(err)) {
        setOperationError(PROJECT_QUOTATION_FORBIDDEN_MESSAGES.OPERATION);
        return;
      }
      // 404 は受領見積書が見つからない旨（要件 10.6 と同じ。範囲外と不在を区別しない）。
      // それ以外は応答の英語の文言を出さずに日本語の失敗の文言を出す
      setOperationError(
        getEstimateRequestNotFoundMessage(err, 'receivedQuotation') ??
          PROJECT_QUOTATION_LIST_TEXT.DELETE_FAILED
      );
      return;
    }

    setIsDeleting(false);
    setDeleteTarget(null);
    try {
      await refreshList();
    } catch {
      setOperationError(PROJECT_QUOTATION_LIST_TEXT.DELETE_REFRESH_FAILED);
    }
  }, [deleteTarget, refreshList]);

  // 読み込み中
  if (isLoading) {
    return (
      <main role="main" style={styles.container}>
        <div style={styles.loadingContainer}>
          <div role="status" style={styles.loadingSpinner} aria-label="読み込み中" />
          <p>読み込み中...</p>
        </div>
        <style>
          {`
            @keyframes spin {
              0% { transform: rotate(0deg); }
              100% { transform: rotate(360deg); }
            }
          `}
        </style>
      </main>
    );
  }

  // プロジェクトが見つからない（要件 43.13）。再試行で解けないため再試行の釦を出さない
  if (isProjectNotFound) {
    return (
      <main role="main" style={styles.container}>
        <ResourceNotFound
          resourceType="プロジェクト"
          returnPath="/projects"
          returnLabel="プロジェクト一覧に戻る"
        />
      </main>
    );
  }

  // 閲覧の権限が無い（要件 43.11）。再試行で解けないため再試行の釦を出さない
  if (isViewForbidden) {
    return (
      <main role="main" style={styles.container}>
        <div role="alert" style={styles.errorContainer}>
          <p style={styles.errorText}>{PROJECT_QUOTATION_FORBIDDEN_MESSAGES.VIEW}</p>
          <Link to="/projects">プロジェクト一覧に戻る</Link>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main role="main" style={styles.container}>
        <div role="alert" style={styles.errorContainer}>
          <p style={styles.errorText}>{error}</p>
          <button type="button" onClick={fetchData} style={styles.retryButton}>
            再試行
          </button>
        </div>
      </main>
    );
  }

  return (
    <main role="main" style={styles.container} data-testid="project-received-quotation-list-page">
      {/* パンくず（要件 43.15。要件 29 と同じ形） */}
      <div style={styles.breadcrumbWrapper}>
        <Breadcrumb
          items={[
            { label: 'ダッシュボード', path: '/' },
            { label: 'プロジェクト一覧', path: '/projects' },
            { label: projectName || 'プロジェクト', path: `/projects/${projectId}` },
            { label: PROJECT_QUOTATION_LIST_TEXT.TITLE },
          ]}
        />
      </div>

      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>{PROJECT_QUOTATION_LIST_TEXT.TITLE}</h1>
          <p style={styles.subtitle}>全{quotations.length}件</p>
        </div>
        <button type="button" style={styles.primaryButton} onClick={handleRegisterClick}>
          {PROJECT_QUOTATION_LIST_TEXT.REGISTER_BUTTON}
        </button>
      </div>

      {sharedOriginalNotice && (
        <p role="status" style={styles.notice} data-testid="shared-original-notice">
          {sharedOriginalNotice}
        </p>
      )}
      {operationError && (
        <p
          role="alert"
          style={styles.operationError}
          data-testid="project-quotation-operation-error"
        >
          {operationError}
        </p>
      )}

      {quotations.length === 0 ? (
        <div style={styles.emptyState} data-testid="project-quotation-empty">
          {PROJECT_QUOTATION_LIST_TEXT.EMPTY}
        </div>
      ) : (
        <div style={styles.tableWrapper}>
          <table style={styles.table} data-testid="project-quotation-table">
            <thead>
              <tr>
                <th scope="col" style={styles.th}>
                  受領見積書名
                </th>
                <th scope="col" style={styles.th}>
                  業者名
                </th>
                <th scope="col" style={styles.th}>
                  提出日
                </th>
                <th scope="col" style={styles.th}>
                  見積依頼名
                </th>
                <th scope="col" style={{ ...styles.th, textAlign: 'right' }}>
                  NET金額
                </th>
                <th scope="col" style={styles.th}>
                  登録日時
                </th>
                <th scope="col" style={styles.th}>
                  台帳の状態
                </th>
                <th scope="col" style={styles.th}>
                  操作
                </th>
              </tr>
            </thead>
            <tbody>
              {quotations.map((quotation) => (
                <QuotationRow
                  key={quotation.id}
                  quotation={quotation}
                  onEdit={handleEditClick}
                  onDelete={setDeleteTarget}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {deleteTarget && (
        <DeleteConfirmDialog
          quotationName={deleteTarget.name}
          isDeleting={isDeleting}
          onConfirm={handleDeleteConfirm}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      {/* 登録・編集のフォーム（案件の文脈。要件 43.6） */}
      {showForm && projectId && (
        <div style={styles.overlay}>
          <div style={styles.modalContent}>
            <h2 style={styles.modalTitle}>
              {editingQuotation ? '受領見積書の編集' : '受領見積書の登録'}
            </h2>
            <ReceivedQuotationForm
              mode={editingQuotation ? 'edit' : 'create'}
              context={{ kind: 'project', projectId }}
              initialData={editingQuotation ?? undefined}
              onSubmit={handleSubmit}
              onCancel={closeForm}
              isSubmitting={isSubmitting || isLoadingPreviewUrl}
              existingFilePreviewUrl={existingFilePreviewUrl}
            />
          </div>
        </div>
      )}
    </main>
  );
}
