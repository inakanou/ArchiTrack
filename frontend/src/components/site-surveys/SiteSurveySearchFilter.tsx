/**
 * @fileoverview 現場調査検索・フィルタUIコンポーネント
 *
 * Task 8.2: 検索・フィルタリングUIを実装する
 *
 * Requirements:
 * - 3.2: キーワード検索フォーム（名前・メモの部分一致）
 * - 3.3: 調査日範囲フィルター
 * - 3.4: ソート切り替え（調査日・作成日・更新日）
 */

import { useState, useCallback, useId } from 'react';
import type {
  SiteSurveyFilter,
  SiteSurveySortableField,
  SiteSurveySortOrder,
} from '../../types/site-survey.types';

// ============================================================================
// 型定義
// ============================================================================

/**
 * SiteSurveySearchFilter コンポーネントのProps
 */
export interface SiteSurveySearchFilterProps {
  /** 現在のフィルタ設定 */
  filter: SiteSurveyFilter;
  /** 現在のソートフィールド */
  sortField: SiteSurveySortableField;
  /** 現在のソート順序 */
  sortOrder: SiteSurveySortOrder;
  /** フィルタ変更ハンドラ */
  onFilterChange: (filter: SiteSurveyFilter) => void;
  /** ソート変更ハンドラ */
  onSortChange: (field: SiteSurveySortableField, order: SiteSurveySortOrder) => void;
}

// ============================================================================
// 定数定義
// ============================================================================

/**
 * 検索キーワードの最小文字数
 */
const MIN_SEARCH_LENGTH = 2;

/**
 * 検索キーワードのバリデーションエラーメッセージ
 */
const SEARCH_MIN_LENGTH_ERROR = '2文字以上で入力してください';

/**
 * ソートフィールドの表示ラベル
 */
const SORT_FIELD_LABELS: Record<SiteSurveySortableField, string> = {
  surveyDate: '調査日',
  createdAt: '作成日',
  updatedAt: '更新日',
};

// ============================================================================
// メインコンポーネント
// ============================================================================

/**
 * 現場調査検索・フィルタコンポーネント
 *
 * 検索フィールド、調査日範囲フィルタ、ソート選択を提供します。
 *
 * @example
 * ```tsx
 * <SiteSurveySearchFilter
 *   filter={currentFilter}
 *   sortField="surveyDate"
 *   sortOrder="desc"
 *   onFilterChange={setFilter}
 *   onSortChange={handleSort}
 * />
 * ```
 */
export default function SiteSurveySearchFilter({
  filter,
  sortField,
  sortOrder,
  onFilterChange,
  onSortChange,
}: SiteSurveySearchFilterProps) {
  // ローカル状態（検索フィールドの入力値とエラー）
  const [searchInput, setSearchInput] = useState(filter.search || '');
  const [searchError, setSearchError] = useState<string | null>(null);

  // ユニークID生成（アクセシビリティ用）
  const baseId = useId();
  const searchInputId = `${baseId}-search`;
  const fromDateId = `${baseId}-from-date`;
  const toDateId = `${baseId}-to-date`;
  const sortSelectId = `${baseId}-sort`;
  const errorId = `${baseId}-error`;

  /**
   * 検索を実行
   */
  const executeSearch = useCallback(() => {
    // 空文字は許可（全件検索）
    if (searchInput === '') {
      setSearchError(null);
      onFilterChange({
        ...filter,
        search: '',
      });
      return;
    }

    // 1文字以下はエラー
    if (searchInput.length < MIN_SEARCH_LENGTH) {
      setSearchError(SEARCH_MIN_LENGTH_ERROR);
      return;
    }

    // 検索実行
    setSearchError(null);
    onFilterChange({
      ...filter,
      search: searchInput,
    });
  }, [searchInput, filter, onFilterChange]);

  /**
   * 検索フィールドのキーダウンハンドラ
   */
  const handleSearchKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        executeSearch();
      } else if (e.key === 'Escape') {
        setSearchError(null);
      }
    },
    [executeSearch]
  );

  /**
   * 検索入力変更ハンドラ
   */
  const handleSearchInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchInput(e.target.value);
    // 入力中はエラーをクリア
    setSearchError(null);
  }, []);

  /**
   * 開始日変更ハンドラ
   */
  const handleFromDateChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onFilterChange({
        ...filter,
        surveyDateFrom: e.target.value || undefined,
      });
    },
    [filter, onFilterChange]
  );

  /**
   * 終了日変更ハンドラ
   */
  const handleToDateChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onFilterChange({
        ...filter,
        surveyDateTo: e.target.value || undefined,
      });
    },
    [filter, onFilterChange]
  );

  /**
   * ソートフィールド変更ハンドラ
   */
  const handleSortFieldChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const newField = e.target.value as SiteSurveySortableField;
      onSortChange(newField, sortOrder);
    },
    [sortOrder, onSortChange]
  );

  /**
   * ソート順序切り替えハンドラ
   */
  const handleSortOrderToggle = useCallback(() => {
    const newOrder: SiteSurveySortOrder = sortOrder === 'desc' ? 'asc' : 'desc';
    onSortChange(sortField, newOrder);
  }, [sortField, sortOrder, onSortChange]);

  /**
   * フィルタクリアハンドラ
   */
  const handleClearFilters = useCallback(() => {
    setSearchInput('');
    setSearchError(null);
    onFilterChange({
      search: '',
      surveyDateFrom: undefined,
      surveyDateTo: undefined,
    });
  }, [onFilterChange]);

  // アクティブフィルタ数を計算
  const activeFilterCount = [filter.search, filter.surveyDateFrom, filter.surveyDateTo].filter(
    Boolean
  ).length;

  // ソート順序のラベル
  const sortOrderLabel = sortOrder === 'desc' ? '降順（新しい順）' : '昇順（古い順）';

  return (
    <form
      role="search"
      aria-label="現場調査検索・フィルタ"
      className="bg-white p-5 rounded-xl shadow-sm border border-gray-200 mb-6"
      onSubmit={(e) => {
        e.preventDefault();
        executeSearch();
      }}
    >
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* 検索フィールド */}
        <div className="lg:col-span-2">
          <label htmlFor={searchInputId} className="block text-sm font-medium text-gray-700 mb-1.5">
            <span className="flex items-center gap-1.5">
              <svg
                width="16"
                height="16"
                className="text-gray-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
              キーワード検索
            </span>
          </label>
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <svg
                  width="20"
                  height="20"
                  className="text-gray-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>
              </div>
              <input
                id={searchInputId}
                type="search"
                role="searchbox"
                aria-label="検索キーワード"
                aria-describedby={searchError ? errorId : undefined}
                aria-invalid={searchError ? 'true' : 'false'}
                className={`
                  w-full pl-10 pr-4 py-2.5 border rounded-lg shadow-sm
                  focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500
                  transition-colors
                  ${searchError ? 'border-red-500 bg-red-50' : 'border-gray-300 hover:border-gray-400'}
                `}
                placeholder="現場調査名・メモで検索"
                value={searchInput}
                onChange={handleSearchInputChange}
                onKeyDown={handleSearchKeyDown}
              />
            </div>
            <button
              type="submit"
              aria-label="検索"
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors shadow-sm"
            >
              <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
              検索
            </button>
          </div>
          {searchError && (
            <p
              id={errorId}
              aria-live="assertive"
              role="alert"
              className="mt-1.5 text-sm text-red-600 flex items-center gap-1"
            >
              <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              {searchError}
            </p>
          )}
        </div>

        {/* 調査日範囲フィルター */}
        <div className="flex flex-col">
          <span className="block text-sm font-medium text-gray-700 mb-1.5">
            <span className="flex items-center gap-1.5">
              <svg
                width="16"
                height="16"
                className="text-gray-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                />
              </svg>
              調査日
            </span>
          </span>
          <div className="flex gap-2 items-center">
            <div className="flex-1">
              <label htmlFor={fromDateId} className="sr-only">
                調査日（開始）
              </label>
              <input
                id={fromDateId}
                type="date"
                aria-label="調査日（開始）"
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 hover:border-gray-400 transition-colors text-sm"
                value={filter.surveyDateFrom || ''}
                onChange={handleFromDateChange}
              />
            </div>
            <span className="text-gray-400 font-medium">~</span>
            <div className="flex-1">
              <label htmlFor={toDateId} className="sr-only">
                調査日（終了）
              </label>
              <input
                id={toDateId}
                type="date"
                aria-label="調査日（終了）"
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 hover:border-gray-400 transition-colors text-sm"
                value={filter.surveyDateTo || ''}
                onChange={handleToDateChange}
              />
            </div>
          </div>
        </div>

        {/* ソート選択 */}
        <div className="flex flex-col">
          <label htmlFor={sortSelectId} className="block text-sm font-medium text-gray-700 mb-1.5">
            <span className="flex items-center gap-1.5">
              <svg
                width="16"
                height="16"
                className="text-gray-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12"
                />
              </svg>
              並び替え
            </span>
          </label>
          <div className="flex gap-2">
            <select
              id={sortSelectId}
              aria-label="並び替え"
              className="flex-1 px-3 py-2.5 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 hover:border-gray-400 transition-colors bg-white"
              value={sortField}
              onChange={handleSortFieldChange}
            >
              <option value="surveyDate">{SORT_FIELD_LABELS.surveyDate}</option>
              <option value="createdAt">{SORT_FIELD_LABELS.createdAt}</option>
              <option value="updatedAt">{SORT_FIELD_LABELS.updatedAt}</option>
            </select>
            <button
              type="button"
              aria-label={`ソート順序を切り替え（現在: ${sortOrderLabel}）`}
              className="inline-flex items-center justify-center w-10 h-10 border border-gray-300 rounded-lg shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
              onClick={handleSortOrderToggle}
            >
              {sortOrder === 'desc' ? (
                <svg
                  width="20"
                  height="20"
                  className="text-gray-600"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              ) : (
                <svg
                  width="20"
                  height="20"
                  className="text-gray-600"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 15l7-7 7 7"
                  />
                </svg>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* フィルタクリアボタン */}
      <div className="mt-4 flex items-center justify-between border-t border-gray-100 pt-4">
        <div className="text-sm text-gray-500">
          {activeFilterCount > 0 && (
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-blue-100 text-blue-600 text-xs font-medium">
                {activeFilterCount}
              </span>
              件のフィルタが適用中
            </span>
          )}
        </div>
        <button
          type="button"
          aria-label="フィルタをクリア"
          onClick={handleClearFilters}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2"
        >
          <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
          フィルタをクリア
        </button>
      </div>
    </form>
  );
}
