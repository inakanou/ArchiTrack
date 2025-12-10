/**
 * @fileoverview 取引先検索・フィルタUIコンポーネント
 *
 * Task 9.2: 検索・フィルター機能の実装
 *
 * Requirements (trading-partner-management):
 * - REQ-1.3: 検索条件を入力したとき、取引先名またはフリガナによる部分一致検索を実行
 * - REQ-1.4: フィルター条件を選択したとき、取引先種別（顧客/協力業者）でのフィルタリングを実行
 */

import { useState, useCallback, useId, type ChangeEvent } from 'react';
import type { TradingPartnerFilter, TradingPartnerType } from '../../types/trading-partner.types';
import {
  TRADING_PARTNER_TYPES,
  TRADING_PARTNER_TYPE_LABELS,
} from '../../types/trading-partner.types';

// ============================================================================
// 型定義
// ============================================================================

/**
 * TradingPartnerSearchFilter コンポーネントのProps
 */
export interface TradingPartnerSearchFilterProps {
  /** 現在のフィルタ設定 */
  filter: TradingPartnerFilter;
  /** フィルタ変更ハンドラ */
  onFilterChange: (filter: TradingPartnerFilter) => void;
}

// ============================================================================
// メインコンポーネント
// ============================================================================

/**
 * 取引先検索・フィルタコンポーネント
 *
 * 検索フィールドと種別フィルタを提供します。
 *
 * @example
 * ```tsx
 * <TradingPartnerSearchFilter
 *   filter={currentFilter}
 *   onFilterChange={setFilter}
 * />
 * ```
 */
export default function TradingPartnerSearchFilter({
  filter,
  onFilterChange,
}: TradingPartnerSearchFilterProps) {
  // ローカル状態（検索フィールドの入力値）
  const [searchInput, setSearchInput] = useState(filter.search || '');

  // ユニークID生成（アクセシビリティ用）
  const baseId = useId();
  const searchInputId = `${baseId}-search`;
  const typeGroupId = `${baseId}-type-group`;

  /**
   * 検索を実行
   */
  const executeSearch = useCallback(() => {
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
      }
    },
    [executeSearch]
  );

  /**
   * 検索入力変更ハンドラ
   */
  const handleSearchInputChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    setSearchInput(e.target.value);
  }, []);

  /**
   * 種別チェックボックス変更ハンドラ
   */
  const handleTypeChange = useCallback(
    (type: TradingPartnerType) => (e: ChangeEvent<HTMLInputElement>) => {
      const currentTypes = filter.type || [];
      const isChecked = e.target.checked;

      if (isChecked) {
        // 追加（順序を維持するため、TRADING_PARTNER_TYPESの順序に従う）
        const newTypes = TRADING_PARTNER_TYPES.filter(
          (t) => currentTypes.includes(t) || t === type
        ) as TradingPartnerType[];
        onFilterChange({
          ...filter,
          type: newTypes,
        });
      } else {
        // 削除
        const newTypes = currentTypes.filter((t) => t !== type);
        onFilterChange({
          ...filter,
          type: newTypes,
        });
      }
    },
    [filter, onFilterChange]
  );

  /**
   * フィルタクリアハンドラ
   */
  const handleClearFilters = useCallback(() => {
    setSearchInput('');
    onFilterChange({
      search: '',
      type: [],
    });
  }, [onFilterChange]);

  /**
   * 特定の種別が選択されているかどうかを判定
   */
  const isTypeSelected = (type: TradingPartnerType): boolean => {
    return (filter.type || []).includes(type);
  };

  // アクティブフィルタ数を計算
  const activeFilterCount = [filter.search, filter.type && filter.type.length > 0].filter(
    Boolean
  ).length;

  return (
    <form
      role="search"
      aria-label="取引先検索・フィルタ"
      className="bg-white p-5 rounded-xl shadow-sm border border-gray-200 mb-6"
      onSubmit={(e) => {
        e.preventDefault();
        executeSearch();
      }}
    >
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
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
                className="w-full pl-10 pr-4 py-2.5 border rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors border-gray-300 hover:border-gray-400"
                placeholder="取引先名・フリガナで検索"
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
        </div>

        {/* 種別フィルタ */}
        <div>
          <span
            id={`${typeGroupId}-label`}
            className="block text-sm font-medium text-gray-700 mb-1.5"
          >
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
                  d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                />
              </svg>
              種別
            </span>
          </span>
          <div role="group" aria-label="種別フィルタ" className="flex flex-wrap gap-4 py-2">
            {TRADING_PARTNER_TYPES.map((type) => {
              const checkboxId = `${typeGroupId}-${type}`;
              const typeLabel = TRADING_PARTNER_TYPE_LABELS[type];

              return (
                <label
                  key={type}
                  htmlFor={checkboxId}
                  className="flex items-center gap-2 cursor-pointer text-sm text-gray-700 hover:text-gray-900"
                >
                  <input
                    type="checkbox"
                    id={checkboxId}
                    name={type}
                    checked={isTypeSelected(type)}
                    onChange={handleTypeChange(type)}
                    aria-label={typeLabel}
                    className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 focus:ring-2"
                  />
                  <span>{typeLabel}</span>
                </label>
              );
            })}
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
