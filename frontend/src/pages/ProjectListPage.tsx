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
import type { ProjectInfo, ProjectFilter, PaginationInfo } from '../types/project.types';
import type { SortField, SortOrder } from '../components/projects/ProjectListTable';
import ProjectListView from '../components/projects/ProjectListView';
import ProjectSearchFilter from '../components/projects/ProjectSearchFilter';
import PaginationUI from '../components/projects/PaginationUI';

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

  // 空状態の判定
  const isEmpty = !loading && !error && projects.length === 0;
  const isEmptyWithSearch = isEmpty && hasSearched;
  const isEmptyWithoutSearch = isEmpty && !hasSearched;

  return (
    <main role="main" aria-busy={loading} className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* ヘッダー */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <h1 className="text-2xl font-bold text-gray-900">プロジェクト一覧</h1>
        <button
          type="button"
          onClick={handleCreate}
          className="inline-flex items-center px-4 py-2 bg-blue-600 text-white font-medium rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
        >
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
          className="flex flex-col items-center justify-center py-12"
        >
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4" />
          <p className="text-gray-600">読み込み中...</p>
        </div>
      )}

      {/* エラー */}
      {error && (
        <div role="alert" className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
          <p className="text-red-700 mb-4">{error}</p>
          <button
            type="button"
            onClick={handleRetry}
            className="inline-flex items-center px-4 py-2 bg-red-600 text-white font-medium rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 transition-colors"
          >
            再試行
          </button>
        </div>
      )}

      {/* 空状態（検索なし） */}
      {isEmptyWithoutSearch && (
        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <p className="text-gray-600">プロジェクトがありません</p>
          <button
            type="button"
            onClick={handleCreate}
            className="mt-4 inline-flex items-center px-4 py-2 bg-blue-600 text-white font-medium rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
          >
            最初のプロジェクトを作成
          </button>
        </div>
      )}

      {/* 空状態（検索結果なし） */}
      {isEmptyWithSearch && (
        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <p className="text-gray-600">検索結果がありません</p>
          <p className="text-sm text-gray-500 mt-2">
            検索条件を変更するか、フィルタをクリアしてください
          </p>
        </div>
      )}

      {/* プロジェクト一覧 */}
      {!loading && !error && projects.length > 0 && (
        <>
          <ProjectListView
            projects={projects}
            sortField={pageState.sortField}
            sortOrder={pageState.sortOrder}
            onSort={handleSort}
            onRowClick={handleRowClick}
          />

          {/* ページネーション */}
          {pagination.totalPages > 0 && (
            <PaginationUI
              pagination={pagination}
              onPageChange={handlePageChange}
              onLimitChange={handleLimitChange}
            />
          )}
        </>
      )}
    </main>
  );
}
