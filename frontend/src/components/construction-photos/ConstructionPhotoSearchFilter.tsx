/**
 * @fileoverview 工事写真アルバム検索・フィルタUIコンポーネント
 *
 * Task 6.1: 工事写真一覧画面
 *
 * site-survey の SiteSurveySearchFilter のクローン。工事写真アルバムは
 * 日付範囲フィルタを持たないため、キーワード検索とソート（作成日/更新日）に限定する。
 *
 * Requirements:
 * - 3.3: アルバム名での部分一致検索
 * - 3.4: 作成日・更新日でソート
 */

import { useState, useCallback, useId } from 'react';
import type {
  ConstructionPhotoAlbumSortableField,
  ConstructionPhotoSortOrder,
} from '../../types/construction-photo.types';

// ============================================================================
// 型定義
// ============================================================================

/**
 * 工事写真アルバム一覧のフィルタ設定
 */
export interface ConstructionPhotoAlbumFilter {
  /** アルバム名の部分一致検索キーワード */
  search?: string;
}

/**
 * ConstructionPhotoSearchFilter コンポーネントのProps
 */
export interface ConstructionPhotoSearchFilterProps {
  /** 現在のフィルタ設定 */
  filter: ConstructionPhotoAlbumFilter;
  /** 現在のソートフィールド */
  sortField: ConstructionPhotoAlbumSortableField;
  /** 現在のソート順序 */
  sortOrder: ConstructionPhotoSortOrder;
  /** フィルタ変更ハンドラ */
  onFilterChange: (filter: ConstructionPhotoAlbumFilter) => void;
  /** ソート変更ハンドラ */
  onSortChange: (
    field: ConstructionPhotoAlbumSortableField,
    order: ConstructionPhotoSortOrder
  ) => void;
}

// ============================================================================
// 定数定義
// ============================================================================

/**
 * 検索キーワードの最小文字数（空文字は全件検索として許可）
 */
const MIN_SEARCH_LENGTH = 2;

/**
 * 検索キーワードのバリデーションエラーメッセージ
 */
const SEARCH_MIN_LENGTH_ERROR = '2文字以上で入力してください';

/**
 * ソートフィールドの表示ラベル
 */
const SORT_FIELD_LABELS: Record<ConstructionPhotoAlbumSortableField, string> = {
  createdAt: '作成日',
  updatedAt: '更新日',
};

// ============================================================================
// メインコンポーネント
// ============================================================================

/**
 * 工事写真アルバム検索・フィルタコンポーネント
 *
 * キーワード検索フィールドとソート選択を提供します。
 */
export default function ConstructionPhotoSearchFilter({
  filter,
  sortField,
  sortOrder,
  onFilterChange,
  onSortChange,
}: ConstructionPhotoSearchFilterProps) {
  const [searchInput, setSearchInput] = useState(filter.search || '');
  const [searchError, setSearchError] = useState<string | null>(null);

  const baseId = useId();
  const searchInputId = `${baseId}-search`;
  const sortSelectId = `${baseId}-sort`;
  const errorId = `${baseId}-error`;

  /**
   * 検索を実行
   */
  const executeSearch = useCallback(() => {
    // 空文字は許可（全件検索）
    if (searchInput === '') {
      setSearchError(null);
      onFilterChange({ ...filter, search: '' });
      return;
    }

    // 1文字以下はエラー
    if (searchInput.length < MIN_SEARCH_LENGTH) {
      setSearchError(SEARCH_MIN_LENGTH_ERROR);
      return;
    }

    setSearchError(null);
    onFilterChange({ ...filter, search: searchInput });
  }, [searchInput, filter, onFilterChange]);

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

  const handleSearchInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchInput(e.target.value);
    setSearchError(null);
  }, []);

  const handleSortFieldChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const newField = e.target.value as ConstructionPhotoAlbumSortableField;
      onSortChange(newField, sortOrder);
    },
    [sortOrder, onSortChange]
  );

  const handleSortOrderToggle = useCallback(() => {
    const newOrder: ConstructionPhotoSortOrder = sortOrder === 'desc' ? 'asc' : 'desc';
    onSortChange(sortField, newOrder);
  }, [sortField, sortOrder, onSortChange]);

  const handleClearFilters = useCallback(() => {
    setSearchInput('');
    setSearchError(null);
    onFilterChange({ search: '' });
  }, [onFilterChange]);

  const activeFilterCount = [filter.search].filter(Boolean).length;
  const sortOrderLabel = sortOrder === 'desc' ? '降順（新しい順）' : '昇順（古い順）';

  return (
    <form
      role="search"
      aria-label="工事写真検索・フィルタ"
      className="bg-white p-5 rounded-xl shadow-sm border border-gray-200 mb-6"
      onSubmit={(e) => {
        e.preventDefault();
        executeSearch();
      }}
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* 検索フィールド */}
        <div>
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
                placeholder="アルバム名で検索"
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
