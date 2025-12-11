/**
 * @fileoverview プロジェクト一覧ページ
 *
 * Task 8.5: ProjectListPageの実装
 *
 * Requirements:
 * - 2.1: ログイン後、プロジェクト一覧ページが表示される
 * - 2.2: 一覧はカード/テーブル形式でプロジェクト情報を表示
 * - 3.1-3.5: ページネーション機能
 * - 4.1-4.5: 検索機能
 * - 5.1-5.5: フィルタ機能
 * - 6.1-6.6: ソート機能
 * - 15.1-15.4: レスポンシブデザイン
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { getProjects } from '../api/projects';
import type { GetProjectsOptions } from '../api/projects';
import type {
  ProjectInfo,
  ProjectFilter,
  PaginationInfo,
  ProjectStatus,
} from '../types/project.types';
import { PROJECT_STATUS_LABELS } from '../types/project.types';
import { getStatusColor } from '../utils/project-status';
import type { SortField, SortOrder } from '../components/projects/ProjectListTable';
import ProjectListView from '../components/projects/ProjectListView';
import ProjectSearchFilter from '../components/projects/ProjectSearchFilter';
import PaginationUI from '../components/projects/PaginationUI';
import { Breadcrumb } from '../components/common';

// ============================================================================
// 型定義
// ============================================================================

/**
 * ページ状態
 */
interface PageState {
  /** 現在のページ番号 */
  page: number;
  /** 表示件数 */
  limit: number;
  /** ソートフィールド */
  sortField: SortField;
  /** ソート順序 */
  sortOrder: SortOrder;
  /** フィルタ条件 */
  filter: ProjectFilter;
}

// ============================================================================
// 定数定義
// ============================================================================

/**
 * デフォルトのページ設定
 */
const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const DEFAULT_SORT_FIELD: SortField = 'updatedAt';
const DEFAULT_SORT_ORDER: SortOrder = 'desc';

/**
 * デバウンス時間（ミリ秒）
 */
const DEBOUNCE_DELAY = 300;

// ============================================================================
// ヘルパー関数
// ============================================================================

/**
 * URLパラメータから状態を復元
 */
function parseSearchParams(searchParams: URLSearchParams): Partial<PageState> {
  const page = searchParams.get('page');
  const limit = searchParams.get('limit');
  const sort = searchParams.get('sort');
  const order = searchParams.get('order');
  const search = searchParams.get('search');
  const status = searchParams.get('status');
  const createdFrom = searchParams.get('createdFrom');
  const createdTo = searchParams.get('createdTo');

  return {
    page: page ? parseInt(page, 10) : undefined,
    limit: limit ? parseInt(limit, 10) : undefined,
    sortField: sort as SortField | undefined,
    sortOrder: order as SortOrder | undefined,
    filter: {
      search: search || undefined,
      status: status ? (status.split(',') as ProjectFilter['status']) : undefined,
      createdFrom: createdFrom || undefined,
      createdTo: createdTo || undefined,
    },
  };
}

/**
 * 状態からURLパラメータを生成
 */
function buildSearchParams(state: PageState): URLSearchParams {
  const params = new URLSearchParams();

  if (state.page !== DEFAULT_PAGE) {
    params.set('page', String(state.page));
  }
  if (state.limit !== DEFAULT_LIMIT) {
    params.set('limit', String(state.limit));
  }
  if (state.sortField !== DEFAULT_SORT_FIELD) {
    params.set('sort', state.sortField);
  }
  if (state.sortOrder !== DEFAULT_SORT_ORDER) {
    params.set('order', state.sortOrder);
  }
  if (state.filter.search) {
    params.set('search', state.filter.search);
  }
  if (state.filter.status && state.filter.status.length > 0) {
    params.set('status', state.filter.status.join(','));
  }
  if (state.filter.createdFrom) {
    params.set('createdFrom', state.filter.createdFrom);
  }
  if (state.filter.createdTo) {
    params.set('createdTo', state.filter.createdTo);
  }

  return params;
}

// ============================================================================
// カスタムフック
// ============================================================================

/**
 * デバウンスフック
 */
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(timer);
    };
  }, [value, delay]);

  return debouncedValue;
}

// ============================================================================
// サブコンポーネント
// ============================================================================

/**
 * ステータス別統計サマリーカード
 */
function StatusSummaryCard({
  status,
  count,
  onClick,
}: {
  status: ProjectStatus;
  count: number;
  onClick: (status: ProjectStatus) => void;
}) {
  const { bg, text } = getStatusColor(status);
  const label = PROJECT_STATUS_LABELS[status];

  return (
    <button
      type="button"
      onClick={() => onClick(status)}
      className={`${bg} rounded-lg p-3 text-left transition-all hover:shadow-md hover:scale-[1.02] focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2`}
    >
      <div className={`text-2xl font-bold ${text}`}>{count}</div>
      <div className={`text-xs font-medium ${text} opacity-80`}>{label}</div>
    </button>
  );
}

/**
 * 統計サマリーセクション
 */
function StatsSummary({
  projects,
  total,
  onStatusClick,
}: {
  projects: ProjectInfo[];
  total: number;
  onStatusClick: (status: ProjectStatus) => void;
}) {
  // ステータス別の件数を集計
  const statusCounts = useMemo(() => {
    const counts: Partial<Record<ProjectStatus, number>> = {};
    projects.forEach((project) => {
      counts[project.status] = (counts[project.status] || 0) + 1;
    });
    return counts;
  }, [projects]);

  // 表示するステータス（件数がある順に最大6件）
  const activeStatuses = useMemo(() => {
    return (Object.entries(statusCounts) as [ProjectStatus, number][])
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6);
  }, [statusCounts]);

  if (activeStatuses.length === 0) {
    return null;
  }

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wider">
          ステータス別件数（現在表示中）
        </h2>
        <span className="text-sm text-gray-500">
          全 <span className="font-semibold text-gray-900">{total}</span> 件
        </span>
      </div>
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
        {activeStatuses.map(([status, count]) => (
          <StatusSummaryCard key={status} status={status} count={count} onClick={onStatusClick} />
        ))}
      </div>
    </div>
  );
}

/**
 * 空状態アイコン
 */
function EmptyIcon() {
  return (
    <svg
      width="40"
      height="40"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      className="text-gray-400"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
      />
    </svg>
  );
}

/**
 * 検索結果なしアイコン
 */
function SearchEmptyIcon() {
  return (
    <svg
      width="40"
      height="40"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      className="text-gray-400"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
      />
    </svg>
  );
}

// ============================================================================
// メインコンポーネント
// ============================================================================

/**
 * プロジェクト一覧ページ
 *
 * プロジェクト一覧の表示、検索、フィルタ、ソート、ページネーションを提供します。
 */
export default function ProjectListPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // URLパラメータから初期状態を復元
  const initialState = useMemo(() => {
    const parsed = parseSearchParams(searchParams);
    return {
      page: parsed.page || DEFAULT_PAGE,
      limit: parsed.limit || DEFAULT_LIMIT,
      sortField: parsed.sortField || DEFAULT_SORT_FIELD,
      sortOrder: parsed.sortOrder || DEFAULT_SORT_ORDER,
      filter: {
        search: parsed.filter?.search || '',
        status: parsed.filter?.status || [],
        createdFrom: parsed.filter?.createdFrom,
        createdTo: parsed.filter?.createdTo,
      },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // 初回のみ実行

  // ページ状態
  const [pageState, setPageState] = useState<PageState>(initialState);

  // データ状態
  const [projects, setProjects] = useState<ProjectInfo[]>([]);
  const [pagination, setPagination] = useState<PaginationInfo>({
    page: DEFAULT_PAGE,
    limit: DEFAULT_LIMIT,
    total: 0,
    totalPages: 0,
  });

  // UI状態
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  // APIリクエストのデバウンス用
  const debouncedPageState = useDebounce(pageState, DEBOUNCE_DELAY);

  // 最新の状態を参照するためのref
  const isInitialMount = useRef(true);

  /**
   * プロジェクト一覧を取得
   */
  const fetchProjects = useCallback(async (state: PageState) => {
    setLoading(true);
    setError(null);

    try {
      const options: GetProjectsOptions = {
        page: state.page,
        limit: state.limit,
        sort: state.sortField,
        order: state.sortOrder,
        filter: state.filter,
      };

      const result = await getProjects(options);
      setProjects(result.data);
      setPagination(result.pagination);
    } catch {
      setError('プロジェクト一覧を取得できませんでした');
    } finally {
      setLoading(false);
    }
  }, []);

  // デバウンスされた状態が変更されたらAPIを呼び出す
  useEffect(() => {
    // 初回マウント時は即座に実行
    if (isInitialMount.current) {
      isInitialMount.current = false;
      fetchProjects(pageState);
      return;
    }

    // 2回目以降はデバウンスされた状態を使用
    fetchProjects(debouncedPageState);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedPageState]);

  // URLパラメータの更新
  useEffect(() => {
    if (isInitialMount.current) return;

    const params = buildSearchParams(debouncedPageState);
    setSearchParams(params, { replace: true });
  }, [debouncedPageState, setSearchParams]);

  /**
   * 再試行
   */
  const handleRetry = useCallback(() => {
    fetchProjects(pageState);
  }, [fetchProjects, pageState]);

  /**
   * 新規作成
   */
  const handleCreate = useCallback(() => {
    navigate('/projects/new');
  }, [navigate]);

  /**
   * プロジェクト詳細へ遷移
   */
  const handleRowClick = useCallback(
    (projectId: string) => {
      navigate(`/projects/${projectId}`);
    },
    [navigate]
  );

  /**
   * ソート変更
   */
  const handleSort = useCallback((field: SortField) => {
    setPageState((prev) => {
      // 同じフィールドの場合は順序を反転
      const newOrder = prev.sortField === field && prev.sortOrder === 'asc' ? 'desc' : 'asc';

      return {
        ...prev,
        sortField: field,
        sortOrder: newOrder,
      };
    });
  }, []);

  /**
   * フィルタ変更
   */
  const handleFilterChange = useCallback((filter: ProjectFilter) => {
    setHasSearched(true);
    setPageState((prev) => ({
      ...prev,
      filter,
      page: 1, // フィルタ変更時はページ1にリセット
    }));
  }, []);

  /**
   * ページ変更
   */
  const handlePageChange = useCallback((page: number) => {
    setPageState((prev) => ({
      ...prev,
      page,
    }));
  }, []);

  /**
   * 表示件数変更
   */
  const handleLimitChange = useCallback((limit: number) => {
    setPageState((prev) => ({
      ...prev,
      limit,
      page: 1, // 件数変更時はページ1にリセット
    }));
  }, []);

  /**
   * ステータスクリックでフィルタ適用
   */
  const handleStatusClick = useCallback((status: ProjectStatus) => {
    setHasSearched(true);
    setPageState((prev) => ({
      ...prev,
      filter: {
        ...prev.filter,
        status: [status],
      },
      page: 1,
    }));
  }, []);

  // 空状態の判定
  const isEmpty = !loading && !error && projects.length === 0;
  const isEmptyWithSearch = isEmpty && hasSearched;
  const isEmptyWithoutSearch = isEmpty && !hasSearched;

  // パンくずナビゲーション項目
  const breadcrumbItems = [{ label: 'ダッシュボード', path: '/' }, { label: 'プロジェクト' }];

  return (
    <main role="main" aria-busy={loading} className="py-8">
      {/* パンくずナビゲーション */}
      <div className="mb-4">
        <Breadcrumb items={breadcrumbItems} />
      </div>

      {/* ヘッダー */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
        <div className="flex items-center gap-3">
          <div className="flex-shrink-0 p-2 bg-blue-100 rounded-lg">
            <svg
              className="text-blue-600"
              width="32"
              height="32"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
              />
            </svg>
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">プロジェクト一覧</h1>
            <p className="text-sm text-gray-500">プロジェクトの管理・進捗確認</p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleCreate}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-blue-600 to-blue-700 text-white font-medium rounded-lg shadow-lg shadow-blue-500/30 hover:from-blue-700 hover:to-blue-800 hover:shadow-blue-500/40 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-all"
        >
          <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          新規作成
        </button>
      </div>

      {/* 検索・フィルタ */}
      <ProjectSearchFilter filter={pageState.filter} onFilterChange={handleFilterChange} />

      {/* ローディング */}
      {loading && (
        <div
          role="status"
          aria-live="polite"
          className="flex flex-col items-center justify-center py-16 bg-white rounded-xl border border-gray-100 shadow-sm"
        >
          <div className="relative">
            <div className="animate-spin rounded-full h-14 w-14 border-4 border-blue-200" />
            <div className="absolute inset-0 animate-spin rounded-full h-14 w-14 border-4 border-blue-600 border-t-transparent" />
          </div>
          <p className="mt-4 text-gray-600 font-medium">読み込み中...</p>
        </div>
      )}

      {/* エラー */}
      {error && (
        <div
          role="alert"
          className="bg-red-50 border border-red-200 rounded-xl p-8 text-center shadow-sm"
        >
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-100 mb-4">
            <svg
              width="32"
              height="32"
              className="text-red-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
          <p className="text-red-700 font-medium mb-2">エラーが発生しました</p>
          <p className="text-red-600 text-sm mb-6">{error}</p>
          <button
            type="button"
            onClick={handleRetry}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-red-600 text-white font-medium rounded-lg hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 transition-colors"
          >
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
            再試行
          </button>
        </div>
      )}

      {/* 空状態（検索なし） */}
      {isEmptyWithoutSearch && (
        <div className="text-center py-16 bg-gradient-to-b from-gray-50 to-white rounded-xl border border-gray-100 shadow-sm">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gray-100 mb-6">
            <EmptyIcon />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">プロジェクトがありません</h3>
          <p className="text-gray-500 mb-6">最初のプロジェクトを作成して始めましょう</p>
          <button
            type="button"
            onClick={handleCreate}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
          >
            <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 4v16m8-8H4"
              />
            </svg>
            最初のプロジェクトを作成
          </button>
        </div>
      )}

      {/* 空状態（検索結果なし） */}
      {isEmptyWithSearch && (
        <div className="text-center py-16 bg-gradient-to-b from-gray-50 to-white rounded-xl border border-gray-100 shadow-sm">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gray-100 mb-6">
            <SearchEmptyIcon />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">検索結果がありません</h3>
          <p className="text-gray-500">検索条件を変更するか、フィルタをクリアしてください</p>
        </div>
      )}

      {/* プロジェクト一覧 */}
      {!loading && !error && projects.length > 0 && (
        <>
          {/* 統計サマリー */}
          <StatsSummary
            projects={projects}
            total={pagination.total}
            onStatusClick={handleStatusClick}
          />

          {/* 一覧ビュー */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <ProjectListView
              projects={projects}
              sortField={pageState.sortField}
              sortOrder={pageState.sortOrder}
              onSort={handleSort}
              onRowClick={handleRowClick}
            />
          </div>

          {/* ページネーション */}
          {pagination.totalPages > 0 && (
            <div className="mt-6">
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
