/**
 * @fileoverview 検索・フィルタUIコンポーネント
 *
 * Task 8.3: 検索・フィルタUIの実装
 *
 * Requirements:
 * - 4.1: 検索フィールドにキーワードを入力してEnterキーを押すまたは検索ボタンをクリックで検索実行
 * - 4.2: 検索結果が0件の場合、メッセージを表示（親コンポーネントの責務）
 * - 4.3: 検索キーワードをクリアすると全プロジェクト一覧を再表示
 * - 4.4: 2文字以上の検索キーワードを要求
 * - 4.5: 検索キーワードが1文字以下の場合、メッセージを表示し検索を実行しない
 * - 5.1: ステータスフィルタで値を選択すると選択されたステータスのプロジェクトのみ表示
 * - 5.2: 期間フィルタで作成日を基準とした日付範囲フィルタリング
 * - 5.3: 期間フィルタで日付範囲を指定すると指定期間内のプロジェクトのみ表示
 * - 5.4: 複数のフィルタを適用するとAND条件で絞り込み
 * - 5.5: フィルタをクリアをクリックするとすべてのフィルタを解除
 */

import { useState, useCallback, useId } from 'react';
import type { ProjectFilter, ProjectStatus } from '../../types/project.types';
import { PROJECT_STATUSES, PROJECT_STATUS_LABELS } from '../../types/project.types';

// ============================================================================
// 型定義
// ============================================================================

/**
 * ProjectSearchFilter コンポーネントのProps
 */
export interface ProjectSearchFilterProps {
  /** 現在のフィルタ設定 */
  filter: ProjectFilter;
  /** フィルタ変更ハンドラ */
  onFilterChange: (filter: ProjectFilter) => void;
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

// ============================================================================
// メインコンポーネント
// ============================================================================

/**
 * プロジェクト検索・フィルタコンポーネント
 *
 * 検索フィールド、ステータスフィルタ、期間フィルタを提供します。
 *
 * @example
 * ```tsx
 * <ProjectSearchFilter
 *   filter={currentFilter}
 *   onFilterChange={setFilter}
 * />
 * ```
 */
export default function ProjectSearchFilter({ filter, onFilterChange }: ProjectSearchFilterProps) {
  // ローカル状態（検索フィールドの入力値とエラー）
  const [searchInput, setSearchInput] = useState(filter.search || '');
  const [searchError, setSearchError] = useState<string | null>(null);

  // ユニークID生成（アクセシビリティ用）
  const baseId = useId();
  const searchInputId = `${baseId}-search`;
  const statusSelectId = `${baseId}-status`;
  const fromDateId = `${baseId}-from-date`;
  const toDateId = `${baseId}-to-date`;
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
   * ステータス選択変更ハンドラ
   */
  const handleStatusChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const selectedOptions = Array.from(e.target.selectedOptions).map(
        (opt) => opt.value as ProjectStatus
      );
      onFilterChange({
        ...filter,
        status: selectedOptions,
      });
    },
    [filter, onFilterChange]
  );

  /**
   * 開始日変更ハンドラ
   */
  const handleFromDateChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onFilterChange({
        ...filter,
        createdFrom: e.target.value || undefined,
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
        createdTo: e.target.value || undefined,
      });
    },
    [filter, onFilterChange]
  );

  /**
   * フィルタクリアハンドラ
   */
  const handleClearFilters = useCallback(() => {
    setSearchInput('');
    setSearchError(null);
    onFilterChange({
      search: '',
      status: [],
      createdFrom: undefined,
      createdTo: undefined,
    });
  }, [onFilterChange]);

  return (
    <form
      role="search"
      aria-label="プロジェクト検索・フィルタ"
      className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 mb-4"
      onSubmit={(e) => {
        e.preventDefault();
        executeSearch();
      }}
    >
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* 検索フィールド */}
        <div className="lg:col-span-2">
          <label htmlFor={searchInputId} className="block text-sm font-medium text-gray-700 mb-1">
            検索
          </label>
          <div className="flex gap-2">
            <div className="flex-1">
              <input
                id={searchInputId}
                type="search"
                role="searchbox"
                aria-label="検索キーワード"
                aria-describedby={searchError ? errorId : undefined}
                aria-invalid={searchError ? 'true' : 'false'}
                className={`
                  w-full px-3 py-2 border rounded-md shadow-sm
                  focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500
                  ${searchError ? 'border-red-500' : 'border-gray-300'}
                `}
                placeholder="プロジェクト名・顧客名で検索"
                value={searchInput}
                onChange={handleSearchInputChange}
                onKeyDown={handleSearchKeyDown}
              />
            </div>
            <button
              type="submit"
              aria-label="検索"
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
            >
              検索
            </button>
          </div>
          {searchError && (
            <p
              id={errorId}
              aria-live="assertive"
              role="alert"
              className="mt-1 text-sm text-red-600"
            >
              {searchError}
            </p>
          )}
        </div>

        {/* ステータスフィルタ */}
        <div>
          <label htmlFor={statusSelectId} className="block text-sm font-medium text-gray-700 mb-1">
            ステータス
          </label>
          <select
            id={statusSelectId}
            aria-label="ステータスフィルタ"
            multiple
            size={1}
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            value={filter.status || []}
            onChange={handleStatusChange}
          >
            <option value="">すべて</option>
            {PROJECT_STATUSES.map((status) => (
              <option key={status} value={status}>
                {PROJECT_STATUS_LABELS[status]}
              </option>
            ))}
          </select>
        </div>

        {/* 期間フィルタ */}
        <div className="flex flex-col">
          <span className="block text-sm font-medium text-gray-700 mb-1">作成日</span>
          <div className="flex gap-2 items-center">
            <div className="flex-1">
              <label htmlFor={fromDateId} className="sr-only">
                作成日（開始）
              </label>
              <input
                id={fromDateId}
                type="date"
                aria-label="作成日（開始）"
                className="w-full px-2 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                value={filter.createdFrom || ''}
                onChange={handleFromDateChange}
              />
            </div>
            <span className="text-gray-500">-</span>
            <div className="flex-1">
              <label htmlFor={toDateId} className="sr-only">
                作成日（終了）
              </label>
              <input
                id={toDateId}
                type="date"
                aria-label="作成日（終了）"
                className="w-full px-2 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                value={filter.createdTo || ''}
                onChange={handleToDateChange}
              />
            </div>
          </div>
        </div>
      </div>

      {/* フィルタクリアボタン */}
      <div className="mt-4 flex justify-end">
        <button
          type="button"
          aria-label="フィルタをクリア"
          onClick={handleClearFilters}
          className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2"
        >
          フィルタをクリア
        </button>
      </div>
    </form>
  );
}
