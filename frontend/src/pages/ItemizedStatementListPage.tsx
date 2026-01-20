/**
 * @fileoverview 内訳書一覧画面
 *
 * Requirements:
 * - 3.2: 内訳書セクションは作成済み内訳書を作成日時の降順で一覧表示する
 * - 3.3: 内訳書が存在しない場合「内訳書はまだ作成されていません」メッセージを表示する
 * - 3.4: 内訳書一覧の各行は内訳書名、作成日時、集計元数量表名、合計項目数を表示する
 * - 3.5: ユーザーが内訳書行をクリックすると内訳書詳細画面に遷移する
 * - 11.5: 内訳書セクションは一覧画面へのリンクを表示する
 */

import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getItemizedStatements, deleteItemizedStatement } from '../api/itemized-statements';
import { getQuantityTables } from '../api/quantity-tables';
import type {
  ItemizedStatementInfo,
  PaginatedItemizedStatements,
} from '../types/itemized-statement.types';
import type { QuantityTableInfo } from '../types/quantity-table.types';
import { Breadcrumb } from '../components/common';
import { CreateItemizedStatementForm } from '../components/itemized-statement/CreateItemizedStatementForm';

// ============================================================================
// スタイル定義
// ============================================================================

const styles = {
  container: {
    maxWidth: '1024px',
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
  createButton: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    backgroundColor: '#2563eb',
    color: '#ffffff',
    padding: '10px 20px',
    borderRadius: '6px',
    textDecoration: 'none',
    fontSize: '14px',
    fontWeight: 500,
    transition: 'background-color 0.2s',
    border: 'none',
    cursor: 'pointer',
  } as React.CSSProperties,
  statementList: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '12px',
  } as React.CSSProperties,
  statementCard: {
    display: 'flex',
    gap: '16px',
    padding: '16px',
    backgroundColor: '#ffffff',
    borderRadius: '8px',
    border: '1px solid #e5e7eb',
    textDecoration: 'none',
    color: 'inherit',
    transition: 'box-shadow 0.2s, border-color 0.2s',
  } as React.CSSProperties,
  iconWrapper: {
    width: '56px',
    height: '56px',
    borderRadius: '8px',
    backgroundColor: '#f3f4f6',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#6b7280',
    flexShrink: 0,
  } as React.CSSProperties,
  statementInfo: {
    flex: 1,
    minWidth: 0,
  } as React.CSSProperties,
  statementName: {
    fontSize: '16px',
    fontWeight: 600,
    color: '#1f2937',
    margin: 0,
    marginBottom: '4px',
  } as React.CSSProperties,
  statementMeta: {
    fontSize: '14px',
    color: '#6b7280',
  } as React.CSSProperties,
  emptyState: {
    textAlign: 'center' as const,
    padding: '64px 24px',
    backgroundColor: '#ffffff',
    borderRadius: '8px',
    border: '1px solid #e5e7eb',
  } as React.CSSProperties,
  emptyIcon: {
    width: '64px',
    height: '64px',
    margin: '0 auto 16px',
    color: '#9ca3af',
  } as React.CSSProperties,
  emptyText: {
    fontSize: '16px',
    color: '#6b7280',
    marginBottom: '16px',
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
  cardActions: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  } as React.CSSProperties,
  deleteButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '36px',
    height: '36px',
    border: 'none',
    borderRadius: '6px',
    backgroundColor: '#fef2f2',
    color: '#dc2626',
    cursor: 'pointer',
    transition: 'background-color 0.2s',
  } as React.CSSProperties,
  dialogOverlay: {
    position: 'fixed' as const,
    inset: 0,
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
    width: '90%',
    boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
  } as React.CSSProperties,
  dialogTitle: {
    fontSize: '18px',
    fontWeight: 600,
    color: '#1f2937',
    margin: 0,
    marginBottom: '12px',
  } as React.CSSProperties,
  dialogMessage: {
    fontSize: '14px',
    color: '#6b7280',
    marginBottom: '24px',
  } as React.CSSProperties,
  dialogActions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '12px',
  } as React.CSSProperties,
  cancelButton: {
    padding: '8px 16px',
    fontSize: '14px',
    fontWeight: 500,
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    backgroundColor: '#ffffff',
    color: '#374151',
    cursor: 'pointer',
  } as React.CSSProperties,
  confirmDeleteButton: {
    padding: '8px 16px',
    fontSize: '14px',
    fontWeight: 500,
    border: 'none',
    borderRadius: '6px',
    backgroundColor: '#dc2626',
    color: '#ffffff',
    cursor: 'pointer',
  } as React.CSSProperties,
  formWrapper: {
    marginBottom: '24px',
    padding: '24px',
    backgroundColor: '#ffffff',
    borderRadius: '8px',
    border: '1px solid #e5e7eb',
  } as React.CSSProperties,
  createButtonDisabled: {
    backgroundColor: '#9ca3af',
    cursor: 'not-allowed',
  } as React.CSSProperties,
};

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
  });
}

// ============================================================================
// サブコンポーネント
// ============================================================================

/**
 * 内訳書アイコン
 */
function ItemizedStatementIcon({ size = 24 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
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

/**
 * プラスアイコン
 */
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

/**
 * ゴミ箱アイコン
 */
function TrashIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
}

/**
 * 空状態表示
 * Requirements: 3.3
 */
function EmptyState({ projectId }: { projectId: string }) {
  return (
    <div style={styles.emptyState} data-testid="empty-state">
      <div style={styles.emptyIcon}>
        <ItemizedStatementIcon size={64} />
      </div>
      <p style={styles.emptyText}>内訳書はまだ作成されていません</p>
      <Link to={`/projects/${projectId}`} style={styles.createButton}>
        <PlusIcon />
        プロジェクト詳細で作成
      </Link>
    </div>
  );
}

/**
 * 内訳書カード
 * Requirements: 3.4, 3.5
 */
function StatementCard({
  statement,
  onDelete,
}: {
  statement: ItemizedStatementInfo;
  onDelete: (id: string, updatedAt: string) => void;
}) {
  const handleDeleteClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onDelete(statement.id, statement.updatedAt);
  };

  return (
    <div style={styles.statementCard} data-testid={`statement-card-${statement.id}`}>
      <Link
        to={`/itemized-statements/${statement.id}`}
        style={{ display: 'flex', gap: '16px', flex: 1, textDecoration: 'none', color: 'inherit' }}
        aria-label={`${statement.name}の内訳書詳細を見る`}
      >
        <div style={styles.iconWrapper}>
          <ItemizedStatementIcon size={28} />
        </div>
        <div style={styles.statementInfo}>
          <h2 style={styles.statementName}>{statement.name}</h2>
          <p style={styles.statementMeta}>
            {formatDate(statement.createdAt)} / {statement.sourceQuantityTableName} /{' '}
            {statement.itemCount}項目
          </p>
        </div>
      </Link>
      <div style={styles.cardActions}>
        <button
          type="button"
          style={styles.deleteButton}
          onClick={handleDeleteClick}
          aria-label="削除"
          title="削除"
        >
          <TrashIcon />
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// メインコンポーネント
// ============================================================================

/**
 * 内訳書一覧画面
 *
 * Requirements:
 * - 3.2: 作成日時の降順で一覧表示
 * - 3.3: 内訳書が存在しない場合のメッセージ
 * - 3.4: 内訳書名、作成日時、集計元数量表名、合計項目数を表示
 * - 3.5: 内訳書行クリックで詳細画面に遷移
 */
export default function ItemizedStatementListPage() {
  const { projectId } = useParams<{ projectId: string }>();

  // データ状態
  const [data, setData] = useState<PaginatedItemizedStatements | null>(null);
  const [quantityTables, setQuantityTables] = useState<QuantityTableInfo[]>([]);

  // UI状態
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statementToDelete, setStatementToDelete] = useState<{
    id: string;
    updatedAt: string;
  } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);

  /**
   * 内訳書一覧を取得
   * Requirements: 3.2 - 作成日時の降順で一覧表示
   */
  const fetchItemizedStatements = useCallback(async () => {
    if (!projectId) return;

    setIsLoading(true);
    setError(null);

    try {
      const [statementsResult, tablesResult] = await Promise.all([
        getItemizedStatements(projectId, {
          sort: 'createdAt',
          order: 'desc',
        }),
        getQuantityTables(projectId, { limit: 100 }),
      ]);
      setData(statementsResult);
      setQuantityTables(tablesResult.data);
    } catch {
      setError('内訳書の取得に失敗しました');
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  // 初回読み込み
  useEffect(() => {
    fetchItemizedStatements();
  }, [fetchItemizedStatements]);

  /**
   * 削除ダイアログを開く
   */
  const handleDeleteClick = useCallback((id: string, updatedAt: string) => {
    setStatementToDelete({ id, updatedAt });
  }, []);

  /**
   * 削除を実行
   */
  const handleConfirmDelete = useCallback(async () => {
    if (!statementToDelete) return;

    setIsDeleting(true);
    try {
      await deleteItemizedStatement(statementToDelete.id, statementToDelete.updatedAt);
      setData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          data: prev.data.filter((s) => s.id !== statementToDelete.id),
          pagination: {
            ...prev.pagination,
            total: prev.pagination.total - 1,
          },
        };
      });
      setStatementToDelete(null);
    } catch {
      setError('削除に失敗しました');
    } finally {
      setIsDeleting(false);
    }
  }, [statementToDelete]);

  /**
   * 削除をキャンセル
   */
  const handleCancelDelete = useCallback(() => {
    setStatementToDelete(null);
  }, []);

  /**
   * 新規作成フォームを表示
   */
  const handleShowCreateForm = useCallback(() => {
    setShowCreateForm(true);
  }, []);

  /**
   * 新規作成フォームをキャンセル
   */
  const handleCancelCreate = useCallback(() => {
    setShowCreateForm(false);
  }, []);

  /**
   * 内訳書作成成功時
   */
  const handleCreateSuccess = useCallback((newStatement: ItemizedStatementInfo) => {
    setShowCreateForm(false);
    // 一覧を再取得して最新状態を反映
    setData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        data: [newStatement, ...prev.data],
        pagination: {
          ...prev.pagination,
          total: prev.pagination.total + 1,
        },
      };
    });
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
  if (error) {
    return (
      <main role="main" style={styles.container}>
        <div role="alert" style={styles.errorContainer}>
          <p style={styles.errorText}>{error}</p>
          <button type="button" onClick={fetchItemizedStatements} style={styles.retryButton}>
            再試行
          </button>
        </div>
      </main>
    );
  }

  const itemizedStatements = data?.data ?? [];
  const totalCount = data?.pagination.total ?? 0;

  return (
    <main role="main" style={styles.container} data-testid="itemized-statement-list-page">
      {/* パンくずナビゲーション */}
      <div style={styles.breadcrumbWrapper}>
        <Breadcrumb
          items={[
            { label: 'プロジェクト一覧', path: '/projects' },
            { label: 'プロジェクト詳細', path: `/projects/${projectId}` },
            { label: '内訳書一覧' },
          ]}
        />
      </div>

      {/* ヘッダー */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <Link
            to={`/projects/${projectId}`}
            style={styles.backLink}
            aria-label="プロジェクト詳細に戻る"
          >
            ← プロジェクト詳細に戻る
          </Link>
          <h1 style={styles.title}>内訳書一覧</h1>
          <p style={styles.subtitle}>全{totalCount}件</p>
        </div>
        <button
          type="button"
          onClick={handleShowCreateForm}
          disabled={quantityTables.length === 0}
          style={{
            ...styles.createButton,
            ...(quantityTables.length === 0 ? styles.createButtonDisabled : {}),
          }}
          aria-label="内訳書を新規作成"
          title={quantityTables.length === 0 ? '数量表を先に作成してください' : '新規作成'}
        >
          <PlusIcon />
          新規作成
        </button>
      </div>

      {/* 新規作成フォーム */}
      {showCreateForm && (
        <div style={styles.formWrapper}>
          <CreateItemizedStatementForm
            projectId={projectId!}
            quantityTables={quantityTables}
            onSuccess={handleCreateSuccess}
            onCancel={handleCancelCreate}
          />
        </div>
      )}

      {/* 一覧 */}
      {totalCount === 0 ? (
        <EmptyState projectId={projectId!} />
      ) : (
        <div style={styles.statementList} data-testid="statement-list">
          {itemizedStatements.map((statement) => (
            <StatementCard key={statement.id} statement={statement} onDelete={handleDeleteClick} />
          ))}
        </div>
      )}

      {/* 削除確認ダイアログ */}
      {statementToDelete && (
        <div style={styles.dialogOverlay} role="dialog" aria-modal="true">
          <div style={styles.dialogContent}>
            <h2 style={styles.dialogTitle}>内訳書を削除</h2>
            <p style={styles.dialogMessage}>この内訳書を削除しますか？この操作は取り消せません。</p>
            <div style={styles.dialogActions}>
              <button
                type="button"
                style={styles.cancelButton}
                onClick={handleCancelDelete}
                disabled={isDeleting}
              >
                キャンセル
              </button>
              <button
                type="button"
                style={styles.confirmDeleteButton}
                onClick={handleConfirmDelete}
                disabled={isDeleting}
              >
                {isDeleting ? '削除中...' : '削除'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
