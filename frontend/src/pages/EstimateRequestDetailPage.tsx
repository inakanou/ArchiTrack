/**
 * @fileoverview 見積依頼詳細画面
 *
 * Task 6.2: EstimateRequestDetailPageの実装
 * Task 16.1: 受領見積書セクション追加
 * Task 16.2: ステータス管理追加
 *
 * Requirements:
 * - 4.1: 見積依頼詳細画面にパンくずナビゲーションを表示する
 * - 4.2: 見積依頼詳細画面に内訳書項目の一覧を表示する
 * - 4.3: 各項目行にチェックボックスを表示する
 * - 4.4: チェックボックス変更時に自動保存する
 * - 5.1: 見積依頼詳細画面に「見積依頼文を表示」ボタンを表示する
 * - 6.1-6.7: 見積依頼文表示パネル
 * - 7.1: 見積依頼詳細画面に「Excel出力」ボタンを表示する
 * - 8.1: 見積依頼詳細画面に「クリップボードにコピー」ボタンを表示する
 * - 9.1: 見積依頼詳細画面に編集ボタンを表示する
 * - 9.2: 見積依頼詳細画面に削除ボタンを表示する
 * - 9.4: ユーザーが削除ボタンをクリックしたとき、削除確認ダイアログを表示する
 * - 9.5: ユーザーが削除を確認したとき、見積依頼を論理削除し一覧画面に遷移する
 * - 11.1, 11.2, 11.12, 11.14: 受領見積書セクション表示
 * - 12.1, 12.4, 12.5-12.10: ステータス管理
 */

import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  getEstimateRequestDetail,
  getEstimateRequestItems,
  getEstimateRequestText,
  updateEstimateRequest,
  updateItemSelection,
  deleteEstimateRequest,
} from '../api/estimate-requests';
import {
  getReceivedQuotations,
  createReceivedQuotation,
  updateReceivedQuotation,
  deleteReceivedQuotation,
  getPreviewUrl,
} from '../api/received-quotations';
import type {
  ReceivedQuotationInfo,
  CreateReceivedQuotationInput,
  UpdateReceivedQuotationInput,
} from '../api/received-quotations';
import { transitionStatus } from '../api/estimate-request-status';
import type { EstimateRequestStatus } from '../api/estimate-request-status';
import { ApiError } from '../api/client';
import {
  ItemSelectionPanel,
  EstimateRequestTextPanel,
  ExcelExportButton,
  ClipboardCopyButton,
  StatusBadge,
  StatusTransitionButton,
} from '../components/estimate-request';
import { ReceivedQuotationList, ReceivedQuotationForm } from '../components/estimate-requests';
import { Breadcrumb } from '../components/common';
import type {
  EstimateRequestInfo,
  ItemWithSelectionInfo,
  EstimateRequestText,
  EstimateRequestMethod,
  ItemSelectionInput,
} from '../types/estimate-request.types';

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
    alignItems: 'flex-start',
    marginBottom: '24px',
  } as React.CSSProperties,
  headerLeft: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '8px',
  } as React.CSSProperties,
  backLink: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    color: '#2563eb',
    textDecoration: 'none',
    fontSize: '14px',
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
  } as React.CSSProperties,
  headerRight: {
    display: 'flex',
    gap: '8px',
  } as React.CSSProperties,
  editButton: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    padding: '8px 16px',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: 500,
    backgroundColor: '#2563eb',
    color: '#ffffff',
    textDecoration: 'none',
    border: 'none',
    cursor: 'pointer',
  } as React.CSSProperties,
  deleteButton: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    padding: '8px 16px',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: 500,
    backgroundColor: '#ef4444',
    color: '#ffffff',
    border: 'none',
    cursor: 'pointer',
  } as React.CSSProperties,
  content: {
    display: 'grid',
    gridTemplateColumns: '1fr 400px',
    gap: '24px',
  } as React.CSSProperties,
  mainSection: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '24px',
  } as React.CSSProperties,
  sideSection: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '24px',
  } as React.CSSProperties,
  card: {
    backgroundColor: '#ffffff',
    borderRadius: '8px',
    border: '1px solid #e5e7eb',
    padding: '24px',
  } as React.CSSProperties,
  sectionTitle: {
    fontSize: '18px',
    fontWeight: 600,
    color: '#1f2937',
    margin: 0,
    marginBottom: '16px',
  } as React.CSSProperties,
  infoGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: '16px',
  } as React.CSSProperties,
  infoItem: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '4px',
  } as React.CSSProperties,
  infoLabel: {
    fontSize: '12px',
    fontWeight: 500,
    color: '#6b7280',
  } as React.CSSProperties,
  infoValue: {
    fontSize: '14px',
    color: '#1f2937',
  } as React.CSSProperties,
  actionButtons: {
    display: 'flex',
    gap: '8px',
    flexWrap: 'wrap' as const,
  } as React.CSSProperties,
  actionButton: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    padding: '8px 12px',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: 500,
    backgroundColor: '#ffffff',
    color: '#374151',
    border: '1px solid #d1d5db',
    cursor: 'pointer',
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
    marginBottom: '16px',
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
  dialog: {
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
  dialogContent: {
    backgroundColor: '#ffffff',
    borderRadius: '8px',
    padding: '24px',
    maxWidth: '400px',
    width: '100%',
  } as React.CSSProperties,
  dialogTitle: {
    fontSize: '18px',
    fontWeight: 600,
    color: '#1f2937',
    marginBottom: '16px',
  } as React.CSSProperties,
  dialogMessage: {
    fontSize: '14px',
    color: '#6b7280',
    marginBottom: '24px',
  } as React.CSSProperties,
  dialogButtons: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '8px',
  } as React.CSSProperties,
  dialogCancelButton: {
    padding: '8px 16px',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: 500,
    backgroundColor: '#ffffff',
    color: '#374151',
    border: '1px solid #d1d5db',
    cursor: 'pointer',
  } as React.CSSProperties,
  dialogConfirmButton: {
    padding: '8px 16px',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: 500,
    backgroundColor: '#ef4444',
    color: '#ffffff',
    border: 'none',
    cursor: 'pointer',
  } as React.CSSProperties,
  statusSection: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    flexWrap: 'wrap' as const,
  } as React.CSSProperties,
  statusLabel: {
    fontSize: '14px',
    fontWeight: 500,
    color: '#6b7280',
  } as React.CSSProperties,
  toastMessage: {
    position: 'fixed' as const,
    bottom: '24px',
    right: '24px',
    padding: '12px 20px',
    borderRadius: '8px',
    backgroundColor: '#10b981',
    color: '#ffffff',
    fontSize: '14px',
    fontWeight: 500,
    zIndex: 2000,
    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
  } as React.CSSProperties,
  modal: {
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
    maxWidth: '500px',
    width: '100%',
    maxHeight: '90vh',
    overflow: 'auto',
  } as React.CSSProperties,
  modalTitle: {
    fontSize: '18px',
    fontWeight: 600,
    color: '#1f2937',
    marginBottom: '16px',
  } as React.CSSProperties,
};

// ============================================================================
// サブコンポーネント
// ============================================================================

/**
 * 削除確認ダイアログ
 */
interface DeleteDialogProps {
  isOpen: boolean;
  isDeleting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

function DeleteDialog({ isOpen, isDeleting, onCancel, onConfirm }: DeleteDialogProps) {
  if (!isOpen) return null;

  return (
    <div
      style={styles.dialog}
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-dialog-title"
    >
      <div style={styles.dialogContent}>
        <h2 id="delete-dialog-title" style={styles.dialogTitle}>
          見積依頼の削除
        </h2>
        <p style={styles.dialogMessage}>
          この見積依頼を削除してよろしいですか？この操作は取り消せません。
        </p>
        <div style={styles.dialogButtons}>
          <button
            type="button"
            onClick={onCancel}
            disabled={isDeleting}
            style={styles.dialogCancelButton}
          >
            キャンセル
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isDeleting}
            style={styles.dialogConfirmButton}
          >
            {isDeleting ? '削除中...' : '削除'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// ヘルパー関数
// ============================================================================

/**
 * 日付を日本語形式でフォーマット
 */
function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * 見積依頼方法を日本語ラベルに変換
 */
function formatMethod(method: EstimateRequestMethod): string {
  return method === 'EMAIL' ? 'メール' : 'FAX';
}

// ============================================================================
// メインコンポーネント
// ============================================================================

/**
 * 見積依頼詳細画面
 */
export default function EstimateRequestDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  // データ状態
  const [request, setRequest] = useState<EstimateRequestInfo | null>(null);
  const [items, setItems] = useState<ItemWithSelectionInfo[]>([]);
  const [estimateText, setEstimateText] = useState<EstimateRequestText | null>(null);
  const [quotations, setQuotations] = useState<ReceivedQuotationInfo[]>([]);

  // UI状態
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showTextPanel, setShowTextPanel] = useState(false);
  const [isTextLoading, setIsTextLoading] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // 受領見積書関連
  const [showQuotationForm, setShowQuotationForm] = useState(false);
  const [editingQuotation, setEditingQuotation] = useState<ReceivedQuotationInfo | null>(null);
  const [isQuotationSubmitting, setIsQuotationSubmitting] = useState(false);

  // ステータス関連
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  /**
   * データ取得
   */
  const fetchData = useCallback(async () => {
    if (!id) return;

    setIsLoading(true);
    setError(null);

    try {
      const [requestData, itemsData, quotationsData] = await Promise.all([
        getEstimateRequestDetail(id),
        getEstimateRequestItems(id),
        getReceivedQuotations(id),
      ]);
      setRequest(requestData);
      setItems(itemsData);
      setQuotations(quotationsData);
    } catch {
      setError('見積依頼の取得に失敗しました');
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  // 初回読み込み
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  /**
   * 見積依頼文を取得
   */
  const handleShowText = useCallback(async () => {
    if (!id) return;

    if (showTextPanel) {
      setShowTextPanel(false);
      return;
    }

    setIsTextLoading(true);
    setShowTextPanel(true);

    try {
      const textData = await getEstimateRequestText(id);
      setEstimateText(textData);
    } catch (error) {
      // MISSING_CONTACT_INFO エラーの場合は適切なエラーメッセージを表示
      if (error instanceof ApiError && error.response) {
        const response = error.response as { code?: string; contactType?: string };
        if (response.code === 'MISSING_CONTACT_INFO') {
          const contactType = response.contactType;
          const errorMessage =
            contactType === 'email'
              ? 'メールアドレスが登録されていません'
              : 'FAX番号が登録されていません';
          setEstimateText({
            recipient: '',
            subject: '',
            body: '',
            recipientError: errorMessage,
          });
          return;
        }
      }
      setEstimateText(null);
    } finally {
      setIsTextLoading(false);
    }
  }, [id, showTextPanel]);

  /**
   * 項目選択変更
   */
  const handleItemSelectionChange = useCallback(
    async (selections: ItemSelectionInput[]) => {
      if (!id) return;

      try {
        await updateItemSelection(id, selections);
        // アイテムを再取得して状態を同期
        const updatedItems = await getEstimateRequestItems(id);
        setItems(updatedItems);
      } catch {
        // エラー処理（必要に応じて）
      }
    },
    [id]
  );

  /**
   * 見積依頼方法変更
   */
  const handleMethodChange = useCallback(
    async (method: EstimateRequestMethod) => {
      if (!id || !request) return;

      try {
        const updated = await updateEstimateRequest(id, { method }, request.updatedAt);
        setRequest(updated);
        // テキストパネルが開いている場合は再取得
        if (showTextPanel) {
          setIsTextLoading(true);
          try {
            const textData = await getEstimateRequestText(id);
            setEstimateText(textData);
          } catch (error) {
            // MISSING_CONTACT_INFO エラーの場合は適切なエラーメッセージを表示
            if (error instanceof ApiError && error.response) {
              const response = error.response as { code?: string; contactType?: string };
              if (response.code === 'MISSING_CONTACT_INFO') {
                const contactType = response.contactType;
                const errorMessage =
                  contactType === 'email'
                    ? 'メールアドレスが登録されていません'
                    : 'FAX番号が登録されていません';
                setEstimateText({
                  recipient: '',
                  subject: '',
                  body: '',
                  recipientError: errorMessage,
                });
              } else {
                setEstimateText(null);
              }
            } else {
              setEstimateText(null);
            }
          } finally {
            setIsTextLoading(false);
          }
        }
      } catch {
        // エラー処理（必要に応じて）
      }
    },
    [id, request, showTextPanel]
  );

  /**
   * 内訳書を本文に含める変更
   */
  const handleIncludeBreakdownChange = useCallback(
    async (includeBreakdownInBody: boolean) => {
      if (!id || !request) return;

      try {
        const updated = await updateEstimateRequest(
          id,
          { includeBreakdownInBody },
          request.updatedAt
        );
        setRequest(updated);
        // テキストパネルが開いている場合は再取得
        if (showTextPanel) {
          setIsTextLoading(true);
          try {
            const textData = await getEstimateRequestText(id);
            setEstimateText(textData);
          } catch (error) {
            // MISSING_CONTACT_INFO エラーの場合は適切なエラーメッセージを表示
            if (error instanceof ApiError && error.response) {
              const response = error.response as { code?: string; contactType?: string };
              if (response.code === 'MISSING_CONTACT_INFO') {
                const contactType = response.contactType;
                const errorMessage =
                  contactType === 'email'
                    ? 'メールアドレスが登録されていません'
                    : 'FAX番号が登録されていません';
                setEstimateText({
                  recipient: '',
                  subject: '',
                  body: '',
                  recipientError: errorMessage,
                });
              } else {
                setEstimateText(null);
              }
            } else {
              setEstimateText(null);
            }
          } finally {
            setIsTextLoading(false);
          }
        }
      } catch {
        // エラー処理（必要に応じて）
      }
    },
    [id, request, showTextPanel]
  );

  /**
   * 削除処理
   */
  const handleDelete = useCallback(async () => {
    if (!id || !request) return;

    setIsDeleting(true);

    try {
      await deleteEstimateRequest(id, request.updatedAt);
      navigate(`/projects/${request.projectId}/estimate-requests`);
    } catch {
      setError('見積依頼の削除に失敗しました');
      setIsDeleteDialogOpen(false);
    } finally {
      setIsDeleting(false);
    }
  }, [id, request, navigate]);

  /**
   * ステータス遷移処理
   */
  const handleStatusTransition = useCallback(
    async (newStatus: EstimateRequestStatus) => {
      if (!id) return;

      const result = await transitionStatus(id, newStatus);
      setRequest((prev) =>
        prev
          ? {
              ...prev,
              status: result.status,
              updatedAt: result.updatedAt.toISOString(),
            }
          : null
      );
    },
    [id]
  );

  /**
   * ステータス変更成功時のハンドラ
   */
  const handleStatusSuccess = useCallback((message: string) => {
    setToastMessage(message);
    setTimeout(() => setToastMessage(null), 3000);
  }, []);

  /**
   * 受領見積書追加フォーム表示
   */
  const handleAddQuotationClick = useCallback(() => {
    setEditingQuotation(null);
    setShowQuotationForm(true);
  }, []);

  /**
   * 受領見積書編集フォーム表示
   */
  const handleEditQuotationClick = useCallback((quotation: ReceivedQuotationInfo) => {
    setEditingQuotation(quotation);
    setShowQuotationForm(true);
  }, []);

  /**
   * 受領見積書フォーム送信
   */
  const handleQuotationSubmit = useCallback(
    async (data: CreateReceivedQuotationInput | UpdateReceivedQuotationInput) => {
      if (!id) return;

      setIsQuotationSubmitting(true);

      try {
        if (editingQuotation) {
          // 編集
          await updateReceivedQuotation(
            editingQuotation.id,
            data as UpdateReceivedQuotationInput,
            editingQuotation.updatedAt.toISOString()
          );
        } else {
          // 新規作成
          await createReceivedQuotation(id, data as CreateReceivedQuotationInput);
        }
        // 受領見積書一覧を再取得
        const updatedQuotations = await getReceivedQuotations(id);
        setQuotations(updatedQuotations);
        setShowQuotationForm(false);
        setEditingQuotation(null);
      } catch {
        // エラー処理
      } finally {
        setIsQuotationSubmitting(false);
      }
    },
    [id, editingQuotation]
  );

  /**
   * 受領見積書削除
   */
  const handleDeleteQuotation = useCallback(
    async (quotation: ReceivedQuotationInfo) => {
      if (!id) return;

      try {
        await deleteReceivedQuotation(quotation.id, quotation.updatedAt.toISOString());
        // 受領見積書一覧を再取得
        const updatedQuotations = await getReceivedQuotations(id);
        setQuotations(updatedQuotations);
      } catch {
        // エラー処理
      }
    },
    [id]
  );

  /**
   * 受領見積書プレビュー
   */
  const handlePreviewQuotation = useCallback(async (quotation: ReceivedQuotationInfo) => {
    try {
      const url = await getPreviewUrl(quotation.id);
      window.open(url, '_blank');
    } catch {
      // エラー処理
    }
  }, []);

  /**
   * 受領見積書フォームキャンセル
   */
  const handleQuotationCancel = useCallback(() => {
    setShowQuotationForm(false);
    setEditingQuotation(null);
  }, []);

  // ローディング表示
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

  // エラー表示
  if (error || !request) {
    return (
      <main role="main" style={styles.container}>
        <div role="alert" style={styles.errorContainer}>
          <p style={styles.errorText}>{error || '見積依頼が見つかりません'}</p>
          <button type="button" onClick={fetchData} style={styles.retryButton}>
            再試行
          </button>
        </div>
      </main>
    );
  }

  return (
    <main role="main" style={styles.container} data-testid="estimate-request-detail-page">
      {/* パンくずナビゲーション */}
      <div style={styles.breadcrumbWrapper}>
        <Breadcrumb
          items={[
            { label: 'プロジェクト一覧', path: '/projects' },
            { label: 'プロジェクト詳細', path: `/projects/${request.projectId}` },
            {
              label: '見積依頼一覧',
              path: `/projects/${request.projectId}/estimate-requests`,
            },
            { label: request.name },
          ]}
        />
      </div>

      {/* ヘッダー */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <Link
            to={`/projects/${request.projectId}/estimate-requests`}
            style={styles.backLink}
            aria-label="見積依頼一覧に戻る"
          >
            ← 見積依頼一覧に戻る
          </Link>
          <h1 style={styles.title}>{request.name}</h1>
          <p style={styles.subtitle}>
            {formatDate(request.createdAt)} / {request.tradingPartnerName} /{' '}
            {formatMethod(request.method)}
          </p>
        </div>
        <div style={styles.headerRight}>
          <Link
            to={`/estimate-requests/${request.id}/edit`}
            style={styles.editButton}
            aria-label="編集"
          >
            編集
          </Link>
          <button
            type="button"
            onClick={() => setIsDeleteDialogOpen(true)}
            style={styles.deleteButton}
          >
            削除
          </button>
        </div>
      </div>

      {/* コンテンツ */}
      <div style={styles.content}>
        {/* メインセクション */}
        <div style={styles.mainSection}>
          {/* ステータス管理 */}
          <div style={styles.card}>
            <h2 style={styles.sectionTitle}>ステータス</h2>
            <div style={styles.statusSection}>
              <span style={styles.statusLabel}>現在のステータス:</span>
              <StatusBadge status={(request.status || 'BEFORE_REQUEST') as EstimateRequestStatus} />
              <StatusTransitionButton
                status={(request.status || 'BEFORE_REQUEST') as EstimateRequestStatus}
                onTransition={handleStatusTransition}
                onSuccess={handleStatusSuccess}
              />
            </div>
          </div>

          {/* 基本情報 */}
          <div style={styles.card}>
            <h2 style={styles.sectionTitle}>基本情報</h2>
            <div style={styles.infoGrid}>
              <div style={styles.infoItem}>
                <span style={styles.infoLabel}>宛先（取引先）</span>
                <span style={styles.infoValue}>{request.tradingPartnerName}</span>
              </div>
              <div style={styles.infoItem}>
                <span style={styles.infoLabel}>見積依頼方法</span>
                <span style={styles.infoValue}>{formatMethod(request.method)}</span>
              </div>
              <div style={styles.infoItem}>
                <span style={styles.infoLabel}>参照内訳書</span>
                <span style={styles.infoValue}>{request.itemizedStatementName}</span>
              </div>
              <div style={styles.infoItem}>
                <span style={styles.infoLabel}>作成日時</span>
                <span style={styles.infoValue}>{formatDate(request.createdAt)}</span>
              </div>
            </div>
          </div>

          {/* アクションボタン */}
          <div style={styles.card}>
            <h2 style={styles.sectionTitle}>アクション</h2>
            <div style={styles.actionButtons}>
              <button
                type="button"
                onClick={handleShowText}
                style={styles.actionButton}
                aria-expanded={showTextPanel}
              >
                {showTextPanel ? '見積依頼文を閉じる' : '見積依頼文を表示'}
              </button>
              <ExcelExportButton
                selectedItems={items.filter((item) => item.selected)}
                estimateRequestName={request.name}
              />
              <ClipboardCopyButton
                text={items
                  .filter((item) => item.selected)
                  .map(
                    (item) =>
                      `${item.customCategory ?? ''}\t${item.workType ?? ''}\t${item.name ?? ''}\t${item.specification ?? ''}\t${item.unit ?? ''}\t${item.quantity}`
                  )
                  .join('\n')}
              />
            </div>
          </div>

          {/* 見積依頼文パネル */}
          {showTextPanel && (
            <EstimateRequestTextPanel text={estimateText} loading={isTextLoading} />
          )}

          {/* 項目選択パネル */}
          <div style={styles.card}>
            <h2 style={styles.sectionTitle}>項目選択</h2>
            <ItemSelectionPanel
              items={items}
              method={request.method}
              includeBreakdownInBody={request.includeBreakdownInBody}
              onItemSelectionChange={handleItemSelectionChange}
              onMethodChange={handleMethodChange}
              onIncludeBreakdownChange={handleIncludeBreakdownChange}
            />
          </div>
        </div>

        {/* サイドセクション */}
        <div style={styles.sideSection}>
          {/* 選択項目数 */}
          <div style={styles.card}>
            <h2 style={styles.sectionTitle}>選択状況</h2>
            <p style={styles.infoValue}>
              {items.filter((item) => item.selected).length} / {items.length} 項目選択中
            </p>
          </div>

          {/* 受領見積書セクション */}
          <div style={styles.card}>
            <ReceivedQuotationList
              estimateRequestId={request.id}
              quotations={quotations}
              onAddClick={handleAddQuotationClick}
              onEditClick={handleEditQuotationClick}
              onDeleteClick={handleDeleteQuotation}
              onPreviewClick={handlePreviewQuotation}
            />
          </div>
        </div>
      </div>

      {/* 削除確認ダイアログ */}
      <DeleteDialog
        isOpen={isDeleteDialogOpen}
        isDeleting={isDeleting}
        onCancel={() => setIsDeleteDialogOpen(false)}
        onConfirm={handleDelete}
      />

      {/* 受領見積書フォームモーダル */}
      {showQuotationForm && (
        <div style={styles.modal}>
          <div style={styles.modalContent}>
            <h3 style={styles.modalTitle}>
              {editingQuotation ? '受領見積書の編集' : '受領見積書の登録'}
            </h3>
            <ReceivedQuotationForm
              mode={editingQuotation ? 'edit' : 'create'}
              estimateRequestId={request.id}
              initialData={editingQuotation || undefined}
              onSubmit={handleQuotationSubmit}
              onCancel={handleQuotationCancel}
              isSubmitting={isQuotationSubmitting}
            />
          </div>
        </div>
      )}

      {/* トースト通知 */}
      {toastMessage && <div style={styles.toastMessage}>{toastMessage}</div>}
    </main>
  );
}
