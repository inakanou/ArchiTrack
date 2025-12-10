/**
 * @fileoverview 取引先一覧ページ
 *
 * Task 9.4: 一覧画面のエラーハンドリング
 *
 * Requirements (trading-partner-management):
 * - REQ-1.1: 取引先一覧ページにアクセスしたとき、登録済みの取引先をテーブル形式で表示
 * - REQ-1.2: 取引先名、フリガナ、部課/支店/支社名、代表者名、取引先種別、住所、電話番号、登録日を一覧に表示
 * - REQ-1.3: 検索条件を入力したとき、取引先名またはフリガナによる部分一致検索を実行
 * - REQ-1.4: フィルター条件を選択したとき、取引先種別でのフィルタリングを実行
 * - REQ-1.5: ページネーションを提供し、1ページあたりの表示件数を選択可能とする
 * - REQ-1.6: ソート列クリックで指定された列で昇順または降順にソート
 * - REQ-1.7: 取引先データが存在しない場合、「取引先が登録されていません」というメッセージを表示
 * - REQ-1.8: 取引先一覧のデフォルトソート順をフリガナの昇順とする
 * - REQ-8.1: ネットワークエラー時のエラーメッセージ表示と再試行ボタン
 * - REQ-8.2: サーバーエラー（5xx）時のメッセージ表示
 * - REQ-8.3: セッション期限切れ時のログインページリダイレクト
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { getTradingPartners } from '../api/trading-partners';
import type { GetTradingPartnersOptions } from '../api/trading-partners';
import type {
  TradingPartnerInfo,
  TradingPartnerFilter,
  PaginationInfo,
} from '../types/trading-partner.types';
import type { SortField, SortOrder } from '../components/trading-partners/TradingPartnerListTable';
import TradingPartnerListTable from '../components/trading-partners/TradingPartnerListTable';
import TradingPartnerSearchFilter from '../components/trading-partners/TradingPartnerSearchFilter';
import TradingPartnerPaginationUI from '../components/trading-partners/TradingPartnerPaginationUI';
import NetworkErrorDisplay from '../components/NetworkErrorDisplay';
import { useNetworkError } from '../hooks/useNetworkError';

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
  filter: TradingPartnerFilter;
}

// ============================================================================
// 定数定義
// ============================================================================

/**
 * デフォルトのページ設定
 * @requirement REQ-1.8: デフォルトソート順をフリガナの昇順とする
 */
const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const DEFAULT_SORT_FIELD: SortField = 'nameKana';
const DEFAULT_SORT_ORDER: SortOrder = 'asc';

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
  const type = searchParams.get('type');

  return {
    page: page ? parseInt(page, 10) : undefined,
    limit: limit ? parseInt(limit, 10) : undefined,
    sortField: sort as SortField | undefined,
    sortOrder: order as SortOrder | undefined,
    filter: {
      search: search || undefined,
      type: type ? (type.split(',') as TradingPartnerFilter['type']) : undefined,
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
  if (state.filter.type && state.filter.type.length > 0) {
    params.set('type', state.filter.type.join(','));
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
        d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
      />
    </svg>
  );
}

// ============================================================================
// メインコンポーネント
// ============================================================================

/**
 * 取引先一覧ページ
 *
 * 取引先一覧の表示、検索、フィルタ、ソート、ページネーションを提供します。
 * ネットワークエラー、サーバーエラー、セッション期限切れのエラーハンドリングを実装。
 */
export default function TradingPartnerListPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // ネットワークエラー処理用フック
  const { error: networkError, isRetrying, handleError, retry, clearError } = useNetworkError();

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
        type: parsed.filter?.type || [],
      },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // 初回のみ実行

  // ページ状態
  const [pageState, setPageState] = useState<PageState>(initialState);

  // データ状態
  const [tradingPartners, setTradingPartners] = useState<TradingPartnerInfo[]>([]);
  const [pagination, setPagination] = useState<PaginationInfo>({
    page: DEFAULT_PAGE,
    limit: DEFAULT_LIMIT,
    total: 0,
    totalPages: 0,
  });

  // UI状態
  const [loading, setLoading] = useState(true);

  // APIリクエストのデバウンス用
  const debouncedPageState = useDebounce(pageState, DEBOUNCE_DELAY);

  // 最新の状態を参照するためのref
  const isInitialMount = useRef(true);

  /**
   * 取引先一覧を取得
   */
  const fetchTradingPartners = useCallback(
    async (state: PageState) => {
      setLoading(true);
      clearError();

      try {
        const options: GetTradingPartnersOptions = {
          page: state.page,
          limit: state.limit,
          sort: state.sortField,
          order: state.sortOrder,
          filter: state.filter,
        };

        const result = await getTradingPartners(options);
        setTradingPartners(result.data);
        setPagination(result.pagination);
      } catch (err) {
        // エラーハンドリング（REQ-8.1, 8.2, 8.3）
        handleError(err, () => fetchTradingPartners(state));
      } finally {
        setLoading(false);
      }
    },
    [clearError, handleError]
  );

  // デバウンスされた状態が変更されたらAPIを呼び出す
  useEffect(() => {
    // 初回マウント時は即座に実行
    if (isInitialMount.current) {
      isInitialMount.current = false;
      fetchTradingPartners(pageState);
      return;
    }

    // 2回目以降はデバウンスされた状態を使用
    fetchTradingPartners(debouncedPageState);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedPageState]);

  // URLパラメータの更新
  useEffect(() => {
    if (isInitialMount.current) return;

    const params = buildSearchParams(debouncedPageState);
    setSearchParams(params, { replace: true });
  }, [debouncedPageState, setSearchParams]);

  /**
   * 新規作成
   */
  const handleCreate = useCallback(() => {
    navigate('/trading-partners/new');
  }, [navigate]);

  /**
   * 取引先詳細へ遷移
   */
  const handleRowClick = useCallback(
    (partnerId: string) => {
      navigate(`/trading-partners/${partnerId}`);
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
  const handleFilterChange = useCallback((filter: TradingPartnerFilter) => {
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
  const isEmpty = !loading && !networkError && tradingPartners.length === 0;

  return (
    <main role="main" aria-busy={loading} className="py-8">
      {/* エラー表示（REQ-8.1, 8.2, 8.3） */}
      <NetworkErrorDisplay
        error={networkError}
        onRetry={retry}
        onDismiss={clearError}
        isRetrying={isRetrying}
      />

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
                d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
              />
            </svg>
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">取引先一覧</h1>
            <p className="text-sm text-gray-500">取引先の管理</p>
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
      <TradingPartnerSearchFilter filter={pageState.filter} onFilterChange={handleFilterChange} />

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

      {/* 空状態（REQ-1.7） */}
      {isEmpty && (
        <div className="text-center py-16 bg-gradient-to-b from-gray-50 to-white rounded-xl border border-gray-100 shadow-sm">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gray-100 mb-6">
            <EmptyIcon />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">取引先が登録されていません</h3>
          <p className="text-gray-500 mb-6">最初の取引先を登録して始めましょう</p>
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
            最初の取引先を登録
          </button>
        </div>
      )}

      {/* 取引先一覧 */}
      {!loading && !networkError && tradingPartners.length > 0 && (
        <>
          {/* 一覧テーブル */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <TradingPartnerListTable
              partners={tradingPartners}
              sortField={pageState.sortField}
              sortOrder={pageState.sortOrder}
              onSort={handleSort}
              onRowClick={handleRowClick}
            />
          </div>

          {/* ページネーション */}
          {pagination.totalPages > 0 && (
            <div className="mt-6">
              <TradingPartnerPaginationUI
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
