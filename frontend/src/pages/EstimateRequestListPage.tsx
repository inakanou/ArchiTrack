/**
 * @fileoverview 見積依頼一覧画面
 *
 * Task 5.2: EstimateRequestListPageコンポーネントを実装する
 * Task 16.3: EstimateRequestListTableへのステータス列追加
 *
 * Requirements:
 * - 2.1: プロジェクトに関連する見積依頼一覧を表示する
 * - 2.2: 見積依頼が存在しない場合「見積依頼はまだありません」メッセージを表示する
 * - 2.3: 見積依頼一覧の各行をクリックすると見積依頼詳細画面に遷移する
 * - 2.4: 一覧に見積依頼の名前、宛先、見積依頼方法、参照内訳書名、作成日時を表示
 * - 2.5: 新規作成ボタンをクリックすると見積依頼作成画面に遷移する
 * - 2.6: 一覧表示にページネーションを提供する
 * - 12.12: 見積依頼一覧画面に各見積依頼のステータスを表示する
 */

import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getEstimateRequests } from '../api/estimate-requests';
import type {
  EstimateRequestInfo,
  EstimateRequestMethod,
  PaginatedEstimateRequests,
  EstimateRequestPaginationInfo,
} from '../types/estimate-request.types';
import { Breadcrumb } from '../components/common';
import { StatusBadge } from '../components/estimate-request';
import type { EstimateRequestStatus } from '../components/estimate-request';
import PaginationUI from '../components/projects/PaginationUI';

// ============================================================================
// 定数定義
// ============================================================================

/** デフォルトのページ番号 */
const DEFAULT_PAGE = 1;

/** デフォルトの表示件数 */
const DEFAULT_LIMIT = 20;

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
  requestList: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '12px',
  } as React.CSSProperties,
  requestCard: {
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
  requestInfo: {
    flex: 1,
    minWidth: 0,
  } as React.CSSProperties,
  requestName: {
    fontSize: '16px',
    fontWeight: 600,
    color: '#1f2937',
    margin: 0,
    marginBottom: '4px',
  } as React.CSSProperties,
  requestMeta: {
    fontSize: '14px',
    color: '#6b7280',
  } as React.CSSProperties,
  statusWrapper: {
    display: 'flex',
    alignItems: 'center',
    flexShrink: 0,
    marginLeft: 'auto',
    paddingLeft: '16px',
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

/**
 * 見積依頼方法を日本語ラベルに変換
 */
function formatMethod(method: EstimateRequestMethod): string {
  return method === 'EMAIL' ? 'メール' : 'FAX';
}

// ============================================================================
// サブコンポーネント
// ============================================================================

/**
 * 見積依頼アイコン
 */
function EstimateRequestIcon({ size = 24 }: { size?: number }) {
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
      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
      <polyline points="22,6 12,13 2,6" />
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
 * 空状態表示
 * Requirements: 2.2
 */
function EmptyState({ projectId }: { projectId: string }) {
  return (
    <div style={styles.emptyState} data-testid="empty-state">
      <div style={styles.emptyIcon}>
        <EstimateRequestIcon size={64} />
      </div>
      <p style={styles.emptyText}>見積依頼はまだありません</p>
      <Link to={`/projects/${projectId}/estimate-requests/new`} style={styles.createButton}>
        <PlusIcon />
        新規作成
      </Link>
    </div>
  );
}

/**
 * 見積依頼カード
 * Requirements: 2.3, 2.4, 12.12
 */
function RequestCard({ request }: { request: EstimateRequestInfo }) {
  return (
    <Link
      to={`/estimate-requests/${request.id}`}
      style={styles.requestCard}
      aria-label={`${request.name}の見積依頼詳細を見る`}
      data-testid={`request-card-${request.id}`}
    >
      <div style={styles.iconWrapper}>
        <EstimateRequestIcon size={28} />
      </div>
      <div style={styles.requestInfo}>
        <h2 style={styles.requestName}>{request.name}</h2>
        <p style={styles.requestMeta}>
          {formatDate(request.createdAt)} / {request.tradingPartnerName} /{' '}
          {formatMethod(request.method)} / {request.itemizedStatementName}
        </p>
      </div>
      {/* ステータスバッジ (Requirements 12.12) */}
      <div style={styles.statusWrapper}>
        <StatusBadge
          status={(request.status || 'BEFORE_REQUEST') as EstimateRequestStatus}
          size="sm"
        />
      </div>
    </Link>
  );
}

// ============================================================================
// メインコンポーネント
// ============================================================================

/**
 * 見積依頼一覧画面
 *
 * Requirements:
 * - 2.1: プロジェクトに関連する見積依頼一覧を表示
 * - 2.2: 見積依頼が存在しない場合のメッセージ
 * - 2.3: 見積依頼行クリックで詳細画面に遷移
 * - 2.4: 見積依頼名、宛先、見積依頼方法、参照内訳書名、作成日時を表示
 * - 2.5: 新規作成ボタンで作成画面へ遷移
 */
export default function EstimateRequestListPage() {
  const { projectId } = useParams<{ projectId: string }>();

  // ページネーション状態
  const [page, setPage] = useState(DEFAULT_PAGE);
  const [limit, setLimit] = useState(DEFAULT_LIMIT);

  // データ状態
  const [data, setData] = useState<PaginatedEstimateRequests | null>(null);

  // UI状態
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /**
   * 見積依頼一覧を取得
   * Requirements: 2.1, 2.6
   */
  const fetchEstimateRequests = useCallback(async () => {
    if (!projectId) return;

    setIsLoading(true);
    setError(null);

    try {
      const result = await getEstimateRequests(projectId, { page, limit });
      setData(result);
    } catch {
      setError('見積依頼の取得に失敗しました');
    } finally {
      setIsLoading(false);
    }
  }, [projectId, page, limit]);

  // 初回読み込み
  useEffect(() => {
    fetchEstimateRequests();
  }, [fetchEstimateRequests]);

  /**
   * ページ変更ハンドラー
   * Requirements: 2.6
   */
  const handlePageChange = useCallback((newPage: number) => {
    setPage(newPage);
  }, []);

  /**
   * 表示件数変更ハンドラー
   * Requirements: 2.6
   */
  const handleLimitChange = useCallback((newLimit: number) => {
    setLimit(newLimit);
    setPage(DEFAULT_PAGE); // 表示件数変更時は1ページ目に戻る
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
          <button type="button" onClick={fetchEstimateRequests} style={styles.retryButton}>
            再試行
          </button>
        </div>
      </main>
    );
  }

  const estimateRequests = data?.data ?? [];
  const totalCount = data?.pagination.total ?? 0;
  const pagination: EstimateRequestPaginationInfo = data?.pagination ?? {
    page: DEFAULT_PAGE,
    limit: DEFAULT_LIMIT,
    total: 0,
    totalPages: 0,
  };

  return (
    <main role="main" style={styles.container} data-testid="estimate-request-list-page">
      {/* パンくずナビゲーション */}
      <div style={styles.breadcrumbWrapper}>
        <Breadcrumb
          items={[
            { label: 'プロジェクト一覧', path: '/projects' },
            { label: 'プロジェクト詳細', path: `/projects/${projectId}` },
            { label: '見積依頼一覧' },
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
          <h1 style={styles.title}>見積依頼一覧</h1>
          <p style={styles.subtitle}>全{totalCount}件</p>
        </div>
        <Link
          to={`/projects/${projectId}/estimate-requests/new`}
          style={styles.createButton}
          aria-label="見積依頼を新規作成"
        >
          <PlusIcon />
          新規作成
        </Link>
      </div>

      {/* 一覧 */}
      {totalCount === 0 ? (
        <EmptyState projectId={projectId!} />
      ) : (
        <>
          <div style={styles.requestList} data-testid="request-list">
            {estimateRequests.map((request) => (
              <RequestCard key={request.id} request={request} />
            ))}
          </div>

          {/* ページネーション (Requirements: 2.6) */}
          {pagination.totalPages > 0 && (
            <div style={{ marginTop: '24px' }}>
              <PaginationUI
                pagination={pagination}
                onPageChange={handlePageChange}
                onLimitChange={handleLimitChange}
              />
            </div>
          )}
        </>
      )}
    </main>
  );
}
