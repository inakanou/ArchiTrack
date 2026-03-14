/**
 * @fileoverview 工程表一覧画面
 *
 * Task 7: フロントエンド工程表一覧画面の実装
 *
 * Requirements (construction-schedule):
 * - REQ-1.1: 工程表一覧表示
 * - REQ-1.2: 工程表新規作成画面表示
 * - REQ-1.4: 工程表詳細表示（選択時の遷移）
 * - REQ-1.5: 工程表削除
 *
 * @module pages/ScheduleListPage
 */

import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getSchedules, deleteSchedule } from '../api/schedules';
import type { ScheduleListResponse, ScheduleListItem } from '../api/schedules';
import { Breadcrumb } from '../components/common';

// ============================================================================
// 定数定義
// ============================================================================

/** デフォルトのページ番号 */
const DEFAULT_PAGE = 1;

/** デフォルトの表示件数 */
const DEFAULT_LIMIT = 20;

// ============================================================================
// ヘルパー関数
// ============================================================================

/**
 * 日時をフォーマットする
 */
function formatDateTime(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

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
  table: {
    width: '100%',
    borderCollapse: 'collapse' as const,
    backgroundColor: '#ffffff',
    borderRadius: '8px',
    overflow: 'hidden',
    border: '1px solid #e5e7eb',
  } as React.CSSProperties,
  th: {
    padding: '12px 16px',
    textAlign: 'left' as const,
    fontSize: '12px',
    fontWeight: 600,
    color: '#6b7280',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
    backgroundColor: '#f9fafb',
    borderBottom: '1px solid #e5e7eb',
  } as React.CSSProperties,
  td: {
    padding: '12px 16px',
    fontSize: '14px',
    color: '#1f2937',
    borderBottom: '1px solid #e5e7eb',
  } as React.CSSProperties,
  tableRow: {
    textDecoration: 'none',
    color: 'inherit',
    display: 'table-row',
  } as React.CSSProperties,
  tableLink: {
    textDecoration: 'none',
    color: 'inherit',
  } as React.CSSProperties,
  emptyState: {
    textAlign: 'center' as const,
    padding: '64px 24px',
    backgroundColor: '#ffffff',
    borderRadius: '8px',
    border: '1px solid #e5e7eb',
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
  deleteButton: {
    backgroundColor: 'transparent',
    color: '#dc2626',
    border: '1px solid #dc2626',
    padding: '4px 12px',
    fontSize: '12px',
    fontWeight: 500,
    borderRadius: '4px',
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
    zIndex: 50,
  } as React.CSSProperties,
  dialogContent: {
    backgroundColor: '#ffffff',
    borderRadius: '8px',
    padding: '24px',
    maxWidth: '400px',
    width: '100%',
    boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
  } as React.CSSProperties,
  dialogTitle: {
    fontSize: '18px',
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: '8px',
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
    backgroundColor: '#ffffff',
    color: '#374151',
    border: '1px solid #d1d5db',
    padding: '8px 16px',
    fontSize: '14px',
    fontWeight: 500,
    borderRadius: '6px',
    cursor: 'pointer',
  } as React.CSSProperties,
  confirmButton: {
    backgroundColor: '#dc2626',
    color: '#ffffff',
    border: 'none',
    padding: '8px 16px',
    fontSize: '14px',
    fontWeight: 500,
    borderRadius: '6px',
    cursor: 'pointer',
  } as React.CSSProperties,
};

// ============================================================================
// サブコンポーネント
// ============================================================================

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
 * 空状態表示
 */
function EmptyState({ projectId }: { projectId: string }) {
  return (
    <div style={styles.emptyState} data-testid="empty-state">
      <p style={styles.emptyText}>工程表はまだありません</p>
      <Link to={`/projects/${projectId}/schedules/new`} style={styles.createButton}>
        <PlusIcon />
        新規作成
      </Link>
    </div>
  );
}

/**
 * 確認ダイアログ
 */
function ConfirmDialog({
  message,
  onConfirm,
  onCancel,
}: {
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div style={styles.dialogOverlay} role="dialog" aria-modal="true">
      <div style={styles.dialogContent}>
        <h2 style={styles.dialogTitle}>確認</h2>
        <p style={styles.dialogMessage}>{message}</p>
        <div style={styles.dialogActions}>
          <button type="button" onClick={onCancel} style={styles.cancelButton}>
            キャンセル
          </button>
          <button type="button" onClick={onConfirm} style={styles.confirmButton}>
            確認
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
 * 工程表一覧画面
 *
 * Requirements:
 * - REQ-1.1: 工程表一覧表示
 * - REQ-1.2: 工程表新規作成画面表示
 * - REQ-1.4: 工程表詳細表示（選択時の遷移）
 * - REQ-1.5: 工程表削除
 */
export default function ScheduleListPage() {
  const { projectId } = useParams<{ projectId: string }>();

  // データ状態
  const [data, setData] = useState<ScheduleListResponse | null>(null);

  // UI状態
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ScheduleListItem | null>(null);

  /**
   * 工程表一覧を取得
   * Requirements: REQ-1.1
   */
  const fetchSchedules = useCallback(async () => {
    if (!projectId) return;

    setIsLoading(true);
    setError(null);

    try {
      const result = await getSchedules(projectId, {
        page: DEFAULT_PAGE,
        limit: DEFAULT_LIMIT,
      });
      setData(result);
    } catch {
      setError('工程表の取得に失敗しました');
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  // 初回読み込み
  useEffect(() => {
    fetchSchedules();
  }, [fetchSchedules]);

  /**
   * 工程表削除ハンドラ
   * Requirements: REQ-1.5
   */
  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteTarget) return;

    try {
      await deleteSchedule(deleteTarget.id);
      setDeleteTarget(null);
      fetchSchedules();
    } catch {
      setError('工程表の削除に失敗しました');
      setDeleteTarget(null);
    }
  }, [deleteTarget, fetchSchedules]);

  const handleDeleteCancel = useCallback(() => {
    setDeleteTarget(null);
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
          <button type="button" onClick={fetchSchedules} style={styles.retryButton}>
            再試行
          </button>
        </div>
      </main>
    );
  }

  const schedules = data?.schedules ?? [];
  const totalCount = data?.total ?? 0;

  return (
    <main role="main" style={styles.container} data-testid="schedule-list-page">
      {/* パンくずナビゲーション */}
      <div style={styles.breadcrumbWrapper}>
        <Breadcrumb
          items={[
            { label: 'ダッシュボード', path: '/' },
            { label: 'プロジェクト一覧', path: '/projects' },
            { label: 'プロジェクト', path: `/projects/${projectId}` },
            { label: '工程表一覧' },
          ]}
        />
      </div>

      {/* ヘッダー */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <h1 style={styles.title}>工程表一覧</h1>
          <p style={styles.subtitle}>全{totalCount}件</p>
        </div>
        <Link
          to={`/projects/${projectId}/schedules/new`}
          style={styles.createButton}
          aria-label="工程表を新規作成"
        >
          <PlusIcon />
          新規作成
        </Link>
      </div>

      {/* 一覧 */}
      {totalCount === 0 ? (
        <EmptyState projectId={projectId!} />
      ) : (
        <table style={styles.table} data-testid="schedule-list-table">
          <thead>
            <tr>
              <th style={styles.th}>名称</th>
              <th style={styles.th}>数量表</th>
              <th style={styles.th}>項目数</th>
              <th style={styles.th}>作成日時</th>
              <th style={styles.th}>操作</th>
            </tr>
          </thead>
          <tbody>
            {schedules.map((schedule) => (
              <tr key={schedule.id} data-testid={`schedule-row-${schedule.id}`}>
                <td style={styles.td}>
                  <Link to={`/schedules/${schedule.id}`} style={styles.tableLink}>
                    {schedule.name}
                  </Link>
                </td>
                <td style={styles.td}>
                  <Link to={`/schedules/${schedule.id}`} style={styles.tableLink}>
                    {schedule.quantityTableName ?? '-'}
                  </Link>
                </td>
                <td style={styles.td}>
                  <Link to={`/schedules/${schedule.id}`} style={styles.tableLink}>
                    {schedule.itemCount}
                  </Link>
                </td>
                <td style={styles.td}>
                  <Link to={`/schedules/${schedule.id}`} style={styles.tableLink}>
                    {formatDateTime(schedule.createdAt)}
                  </Link>
                </td>
                <td style={styles.td}>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteTarget(schedule);
                    }}
                    style={styles.deleteButton}
                    aria-label={`${schedule.name}を削除`}
                  >
                    削除
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* 削除確認ダイアログ */}
      {deleteTarget && (
        <ConfirmDialog
          message={`「${deleteTarget.name}」を本当に削除しますか？この操作は取り消せません。`}
          onConfirm={handleDeleteConfirm}
          onCancel={handleDeleteCancel}
        />
      )}
    </main>
  );
}
