/**
 * @fileoverview 数量表一覧画面
 *
 * Task 4.2: 数量表一覧画面を実装する
 *
 * Requirements:
 * - 2.1: 数量表一覧画面で新規作成操作を行う
 * - 2.3: プロジェクトに紐づく全ての数量表を作成日時順に一覧表示する
 * - 2.4: 数量表を選択して削除操作を行う
 * - 2.5: 数量表名を編集する
 */

import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getQuantityTables, deleteQuantityTable } from '../api/quantity-tables';
import type { QuantityTableInfo, PaginatedQuantityTables } from '../types/quantity-table.types';
import { Breadcrumb } from '../components/common';

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
  } as React.CSSProperties,
  tableList: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '12px',
  } as React.CSSProperties,
  tableCard: {
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
  tableInfo: {
    flex: 1,
    minWidth: 0,
  } as React.CSSProperties,
  tableName: {
    fontSize: '16px',
    fontWeight: 600,
    color: '#1f2937',
    margin: 0,
    marginBottom: '4px',
  } as React.CSSProperties,
  tableMeta: {
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
 * 数量表アイコン
 */
function QuantityTableIcon({ size = 24 }: { size?: number }) {
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
      <path d="M3 3h18v18H3zM3 9h18M3 15h18M9 9v12M15 9v12" />
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
 */
function EmptyState({ projectId }: { projectId: string }) {
  return (
    <div style={styles.emptyState}>
      <div style={styles.emptyIcon}>
        <QuantityTableIcon size={64} />
      </div>
      <p style={styles.emptyText}>数量表はまだありません</p>
      <Link to={`/projects/${projectId}/quantity-tables/new`} style={styles.createButton}>
        <PlusIcon />
        新規作成
      </Link>
    </div>
  );
}

/**
 * 数量表カード
 */
function TableCard({
  table,
  onDelete,
}: {
  table: QuantityTableInfo;
  onDelete: (id: string) => void;
}) {
  const handleDeleteClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onDelete(table.id);
  };

  return (
    <div style={styles.tableCard}>
      <Link
        to={`/projects/${table.projectId}/quantity-tables/${table.id}`}
        style={{ display: 'flex', gap: '16px', flex: 1, textDecoration: 'none', color: 'inherit' }}
        aria-label={`${table.name}の数量表詳細を見る`}
      >
        <div style={styles.iconWrapper}>
          <QuantityTableIcon size={28} />
        </div>
        <div style={styles.tableInfo}>
          <h2 style={styles.tableName}>{table.name}</h2>
          <p style={styles.tableMeta}>
            作成: {formatDate(table.createdAt)} / {table.groupCount}グループ / {table.itemCount}項目
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
 * 数量表一覧画面
 */
export default function QuantityTableListPage() {
  const { projectId } = useParams<{ projectId: string }>();

  // データ状態
  const [data, setData] = useState<PaginatedQuantityTables | null>(null);

  // UI状態
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tableToDelete, setTableToDelete] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  /**
   * 数量表一覧を取得
   */
  const fetchQuantityTables = useCallback(async () => {
    if (!projectId) return;

    setIsLoading(true);
    setError(null);

    try {
      const result = await getQuantityTables(projectId, {
        sort: 'createdAt',
        order: 'desc',
      });
      setData(result);
    } catch {
      setError('数量表の取得に失敗しました');
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  // 初回読み込み
  useEffect(() => {
    fetchQuantityTables();
  }, [fetchQuantityTables]);

  /**
   * 削除ダイアログを開く
   */
  const handleDeleteClick = useCallback((id: string) => {
    setTableToDelete(id);
  }, []);

  /**
   * 削除を実行
   */
  const handleConfirmDelete = useCallback(async () => {
    if (!tableToDelete) return;

    setIsDeleting(true);
    try {
      await deleteQuantityTable(tableToDelete);
      setData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          data: prev.data.filter((t) => t.id !== tableToDelete),
          pagination: {
            ...prev.pagination,
            total: prev.pagination.total - 1,
          },
        };
      });
      setTableToDelete(null);
    } catch {
      setError('削除に失敗しました');
    } finally {
      setIsDeleting(false);
    }
  }, [tableToDelete]);

  /**
   * 削除をキャンセル
   */
  const handleCancelDelete = useCallback(() => {
    setTableToDelete(null);
  }, []);

  // ローディング表示
  if (isLoading) {
    return (
      <main role="main" style={styles.container}>
        <div style={styles.loadingContainer}>
          <div role="status" style={styles.loadingSpinner} />
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
          <button type="button" onClick={fetchQuantityTables} style={styles.retryButton}>
            再試行
          </button>
        </div>
      </main>
    );
  }

  const quantityTables = data?.data ?? [];
  const totalCount = data?.pagination.total ?? 0;

  return (
    <main role="main" style={styles.container}>
      {/* パンくずナビゲーション */}
      <div style={styles.breadcrumbWrapper}>
        <Breadcrumb
          items={[
            { label: 'ダッシュボード', path: '/' },
            { label: 'プロジェクト', path: '/projects' },
            { label: 'プロジェクト詳細', path: `/projects/${projectId}` },
            { label: '数量表一覧' },
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
          <h1 style={styles.title}>数量表一覧</h1>
          <p style={styles.subtitle}>全{totalCount}件</p>
        </div>
        {totalCount > 0 && (
          <Link to={`/projects/${projectId}/quantity-tables/new`} style={styles.createButton}>
            <PlusIcon />
            新規作成
          </Link>
        )}
      </div>

      {/* 一覧 */}
      {totalCount === 0 ? (
        <EmptyState projectId={projectId!} />
      ) : (
        <div style={styles.tableList}>
          {quantityTables.map((table) => (
            <TableCard key={table.id} table={table} onDelete={handleDeleteClick} />
          ))}
        </div>
      )}

      {/* 削除確認ダイアログ */}
      {tableToDelete && (
        <div style={styles.dialogOverlay} role="dialog" aria-modal="true">
          <div style={styles.dialogContent}>
            <h2 style={styles.dialogTitle}>数量表を削除</h2>
            <p style={styles.dialogMessage}>この数量表を削除しますか？この操作は取り消せません。</p>
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
