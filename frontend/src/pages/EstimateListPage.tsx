/**
 * @fileoverview 見積書一覧画面
 *
 * Task 11.1: EstimateListPageの実装
 *
 * Requirements (estimate-creation):
 * - REQ-11.1: プロジェクトに紐付く見積書の一覧を表示する
 * - REQ-14.1: 見積書一覧画面を提供する
 * - REQ-14.2: 見積書の一覧をカード形式で表示する
 * - REQ-14.3: 見積書名、作成日時、合計金額を表示する
 * - REQ-14.4: 見積書カードクリックで詳細画面へ遷移
 * - REQ-14.5: 新規作成ボタンを提供する
 * - REQ-14.6: ページネーションを提供する
 * - REQ-14.7: 見積書が存在しない場合のメッセージ表示
 * - REQ-15.1-15.3: パンくずナビゲーション
 *
 * @module pages/EstimateListPage
 */

import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getEstimates } from '../api/estimates';
import type { EstimatesResponse } from '../api/estimates';
import { Breadcrumb } from '../components/common';
import PaginationUI from '../components/projects/PaginationUI';
import { EstimateCard } from '../components/estimate';

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
  estimateList: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '12px',
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
// ヘルパー関数は components/estimate/EstimateCard.tsx に移動
// ============================================================================

// ============================================================================
// サブコンポーネント
// ============================================================================

/**
 * 見積書アイコン（ドキュメントアイコン）
 */
function EstimateIcon({ size = 24 }: { size?: number }) {
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
 * 空状態表示
 * Requirements: REQ-14.7
 */
function EmptyState({ projectId }: { projectId: string }) {
  return (
    <div style={styles.emptyState} data-testid="empty-state">
      <div style={styles.emptyIcon}>
        <EstimateIcon size={64} />
      </div>
      <p style={styles.emptyText}>見積書はまだありません</p>
      <Link to={`/projects/${projectId}/estimates/new`} style={styles.createButton}>
        <PlusIcon />
        新規作成
      </Link>
    </div>
  );
}

// Note: EstimateCardコンポーネントは components/estimate/EstimateCard.tsx からインポート

// ============================================================================
// メインコンポーネント
// ============================================================================

/**
 * 見積書一覧画面
 *
 * Requirements:
 * - REQ-11.1: プロジェクトに紐付く見積書の一覧を表示
 * - REQ-14.1: 見積書一覧画面を提供
 * - REQ-14.2: カード形式で表示
 * - REQ-14.5: 新規作成ボタンを提供
 * - REQ-14.6: ページネーションを提供
 * - REQ-14.7: 空状態メッセージを表示
 * - REQ-15.1-15.3: パンくずナビゲーション
 */
export default function EstimateListPage() {
  const { projectId } = useParams<{ projectId: string }>();

  // ページネーション状態
  const [page, setPage] = useState(DEFAULT_PAGE);
  const [limit, setLimit] = useState(DEFAULT_LIMIT);

  // データ状態
  const [data, setData] = useState<EstimatesResponse | null>(null);

  // UI状態
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /**
   * 見積書一覧を取得
   * Requirements: REQ-11.1, REQ-14.6
   */
  const fetchEstimates = useCallback(async () => {
    if (!projectId) return;

    setIsLoading(true);
    setError(null);

    try {
      const result = await getEstimates(projectId, { page, limit });
      setData(result);
    } catch {
      setError('見積書の取得に失敗しました');
    } finally {
      setIsLoading(false);
    }
  }, [projectId, page, limit]);

  // 初回読み込み
  useEffect(() => {
    fetchEstimates();
  }, [fetchEstimates]);

  /**
   * ページ変更ハンドラー
   * Requirements: REQ-14.6
   */
  const handlePageChange = useCallback((newPage: number) => {
    setPage(newPage);
  }, []);

  /**
   * 表示件数変更ハンドラー
   * Requirements: REQ-14.6
   */
  const handleLimitChange = useCallback((newLimit: number) => {
    setLimit(newLimit);
    setPage(DEFAULT_PAGE);
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
          <button type="button" onClick={fetchEstimates} style={styles.retryButton}>
            再試行
          </button>
        </div>
      </main>
    );
  }

  const estimates = data?.data ?? [];
  const totalCount = data?.pagination.total ?? 0;
  const pagination = data?.pagination ?? {
    page: DEFAULT_PAGE,
    limit: DEFAULT_LIMIT,
    total: 0,
    totalPages: 0,
  };

  return (
    <main role="main" style={styles.container} data-testid="estimate-list-page">
      {/* パンくずナビゲーション (REQ-15.1-15.3) */}
      <div style={styles.breadcrumbWrapper}>
        <Breadcrumb
          items={[
            { label: 'プロジェクト一覧', path: '/projects' },
            { label: 'プロジェクト詳細', path: `/projects/${projectId}` },
            { label: '見積書一覧' },
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
          <h1 style={styles.title}>見積書一覧</h1>
          <p style={styles.subtitle}>全{totalCount}件</p>
        </div>
        <Link
          to={`/projects/${projectId}/estimates/new`}
          style={styles.createButton}
          aria-label="見積書を新規作成"
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
          <div style={styles.estimateList} data-testid="estimate-list">
            {estimates.map((estimate) => (
              <EstimateCard
                key={estimate.id}
                id={estimate.id}
                name={estimate.name}
                createdAt={estimate.createdAt}
                totalAmount={estimate.totalAmount ?? null}
              />
            ))}
          </div>

          {/* ページネーション (REQ-14.6) */}
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
