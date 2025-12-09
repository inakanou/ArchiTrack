/**
 * @fileoverview ページネーションUIコンポーネント
 *
 * Task 8.4: ページネーションUIの実装
 *
 * Requirements:
 * - 3.1: 1ページあたりのデフォルト表示件数を20件とする
 * - 3.2: プロジェクト総数がページサイズを超える場合、ページネーションコントロールを表示
 * - 3.3: ページ番号クリックで該当ページのプロジェクトを表示
 * - 3.4: 現在のページ番号、総ページ数、総プロジェクト数を表示
 * - 3.5: 表示件数変更で選択された件数で一覧を再表示
 */

import { useMemo, useCallback, type ChangeEvent } from 'react';
import type { PaginationInfo } from '../../types/project.types';

// ============================================================================
// 型定義
// ============================================================================

/**
 * PaginationUI コンポーネントのProps
 */
export interface PaginationUIProps {
  /** ページネーション情報 */
  pagination: PaginationInfo;
  /** ページ変更ハンドラ */
  onPageChange: (page: number) => void;
  /** 表示件数変更ハンドラ */
  onLimitChange: (limit: number) => void;
}

// ============================================================================
// 定数定義
// ============================================================================

/**
 * 表示件数オプション
 * @requirement project-management/REQ-3.5: 10/20/50件から選択可能
 */
const LIMIT_OPTIONS = [10, 20, 50] as const;

/**
 * ページ番号表示の最大数
 * これを超える場合は省略記号（...）を表示
 */
const MAX_VISIBLE_PAGES = 7;

// ============================================================================
// ヘルパー関数
// ============================================================================

/**
 * 表示するページ番号のリストを計算
 *
 * @param currentPage - 現在のページ番号
 * @param totalPages - 総ページ数
 * @returns 表示するページ番号の配列（省略は-1）
 */
function calculateVisiblePages(currentPage: number, totalPages: number): number[] {
  // ページ数が少ない場合は全て表示
  if (totalPages <= MAX_VISIBLE_PAGES) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }

  const pages: number[] = [];
  const halfVisible = Math.floor((MAX_VISIBLE_PAGES - 2) / 2);

  // 常に先頭と末尾のページを表示
  const firstPage = 1;
  const lastPage = totalPages;

  // 現在のページを中心とした範囲を計算
  let startPage = Math.max(currentPage - halfVisible, firstPage + 1);
  let endPage = Math.min(currentPage + halfVisible, lastPage - 1);

  // 範囲が狭い場合は調整
  if (startPage === firstPage + 1) {
    endPage = Math.min(firstPage + MAX_VISIBLE_PAGES - 2, lastPage - 1);
  }
  if (endPage === lastPage - 1) {
    startPage = Math.max(lastPage - MAX_VISIBLE_PAGES + 2, firstPage + 1);
  }

  // 先頭ページを追加
  pages.push(firstPage);

  // 先頭との間に省略がある場合
  if (startPage > firstPage + 1) {
    pages.push(-1); // -1 は省略記号を表す
  }

  // 中間のページを追加
  for (let i = startPage; i <= endPage; i++) {
    pages.push(i);
  }

  // 末尾との間に省略がある場合
  if (endPage < lastPage - 1) {
    pages.push(-1); // -1 は省略記号を表す
  }

  // 末尾ページを追加
  if (lastPage !== firstPage) {
    pages.push(lastPage);
  }

  return pages;
}

/**
 * 表示範囲を計算
 *
 * @param page - 現在のページ番号
 * @param limit - 1ページあたりの件数
 * @param total - 総件数
 * @returns { start, end } 表示範囲
 */
function calculateDisplayRange(
  page: number,
  limit: number,
  total: number
): { start: number; end: number } {
  const start = (page - 1) * limit + 1;
  const end = Math.min(page * limit, total);
  return { start, end };
}

// ============================================================================
// サブコンポーネント
// ============================================================================

/**
 * 前のページボタン
 */
function PrevButton({ disabled, onClick }: { disabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label="前のページ"
      className={`p-2 rounded-lg border text-sm font-medium transition-all ${
        disabled
          ? 'border-gray-200 text-gray-300 cursor-not-allowed bg-gray-50'
          : 'border-gray-300 text-gray-700 hover:bg-gray-100 hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 bg-white'
      }`}
    >
      <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
      </svg>
    </button>
  );
}

/**
 * 次のページボタン
 */
function NextButton({ disabled, onClick }: { disabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label="次のページ"
      className={`p-2 rounded-lg border text-sm font-medium transition-all ${
        disabled
          ? 'border-gray-200 text-gray-300 cursor-not-allowed bg-gray-50'
          : 'border-gray-300 text-gray-700 hover:bg-gray-100 hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 bg-white'
      }`}
    >
      <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
      </svg>
    </button>
  );
}

/**
 * ページ番号ボタン
 */
function PageButton({
  page,
  isCurrentPage,
  onClick,
}: {
  page: number;
  isCurrentPage: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isCurrentPage}
      aria-label={`ページ ${page}`}
      aria-current={isCurrentPage ? 'page' : undefined}
      className={`min-w-[40px] h-10 px-3 rounded-lg text-sm font-medium transition-all ${
        isCurrentPage
          ? 'bg-blue-600 text-white shadow-md shadow-blue-500/30'
          : 'bg-white text-gray-700 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 border border-gray-200 hover:border-gray-300'
      }`}
    >
      {page}
    </button>
  );
}

/**
 * 省略記号
 */
function Ellipsis() {
  return (
    <span className="min-w-[40px] h-10 flex items-center justify-center text-sm font-medium text-gray-400">
      ...
    </span>
  );
}

/**
 * 表示件数セレクト
 */
function LimitSelect({
  currentLimit,
  onChange,
}: {
  currentLimit: number;
  onChange: (limit: number) => void;
}) {
  const handleChange = (e: ChangeEvent<HTMLSelectElement>) => {
    onChange(Number(e.target.value));
  };

  return (
    <div className="flex items-center gap-2 bg-gray-50 px-3 py-2 rounded-lg">
      <label htmlFor="limit-select" className="text-sm text-gray-600 whitespace-nowrap">
        表示件数
      </label>
      <select
        id="limit-select"
        value={currentLimit}
        onChange={handleChange}
        aria-label="表示件数"
        className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
      >
        {LIMIT_OPTIONS.map((option) => (
          <option key={option} value={option}>
            {option}件
          </option>
        ))}
      </select>
    </div>
  );
}

// ============================================================================
// メインコンポーネント
// ============================================================================

/**
 * ページネーションUIコンポーネント
 *
 * プロジェクト一覧のページネーションコントロールを提供します。
 *
 * @example
 * ```tsx
 * <PaginationUI
 *   pagination={{ page: 1, limit: 20, total: 100, totalPages: 5 }}
 *   onPageChange={(page) => setPage(page)}
 *   onLimitChange={(limit) => setLimit(limit)}
 * />
 * ```
 */
export default function PaginationUI({
  pagination,
  onPageChange,
  onLimitChange,
}: PaginationUIProps) {
  const { page, limit, total, totalPages } = pagination;

  // 表示するページ番号のリストを計算
  const visiblePages = useMemo(() => calculateVisiblePages(page, totalPages), [page, totalPages]);

  // 表示範囲を計算
  const displayRange = useMemo(
    () => calculateDisplayRange(page, limit, total),
    [page, limit, total]
  );

  // 前のページに移動
  const handlePrev = useCallback(() => {
    if (page > 1) {
      onPageChange(page - 1);
    }
  }, [page, onPageChange]);

  // 次のページに移動
  const handleNext = useCallback(() => {
    if (page < totalPages) {
      onPageChange(page + 1);
    }
  }, [page, totalPages, onPageChange]);

  // 特定のページに移動
  const handlePageClick = useCallback(
    (targetPage: number) => {
      if (targetPage !== page) {
        onPageChange(targetPage);
      }
    },
    [page, onPageChange]
  );

  const isFirstPage = page === 1;
  const isLastPage = page === totalPages;

  return (
    <nav
      role="navigation"
      aria-label="ページネーション"
      data-testid="pagination-controls"
      className="flex flex-col sm:flex-row items-center justify-between gap-4 py-4 px-2"
    >
      {/* 左側: 表示範囲と総件数 */}
      <div className="text-sm text-gray-600 bg-white px-4 py-2 rounded-lg border border-gray-200 shadow-sm">
        <span className="font-semibold text-gray-900" data-testid="total-count">
          {total}
        </span>
        <span className="text-gray-400 mx-1">件中</span>
        <span className="font-medium text-gray-700">
          {displayRange.start}-{displayRange.end}件
        </span>
        <span className="text-gray-400 mx-1">を表示</span>
        <span className="text-gray-400 mx-1">|</span>
        <span data-testid="current-page" className="font-medium text-blue-600">
          {page}
        </span>
        <span className="text-gray-400 mx-0.5">/</span>
        <span data-testid="total-pages" className="text-gray-500">
          {totalPages}
        </span>
        <span className="text-gray-400 ml-1">ページ</span>
      </div>

      {/* 中央: ページ番号ボタン */}
      <div className="flex items-center gap-1">
        <PrevButton disabled={isFirstPage} onClick={handlePrev} />

        <div className="flex items-center gap-1 mx-2">
          {visiblePages.map((pageNum, index) =>
            pageNum === -1 ? (
              <Ellipsis key={`ellipsis-${index}`} />
            ) : (
              <PageButton
                key={pageNum}
                page={pageNum}
                isCurrentPage={pageNum === page}
                onClick={() => handlePageClick(pageNum)}
              />
            )
          )}
        </div>

        <NextButton disabled={isLastPage} onClick={handleNext} />
      </div>

      {/* 右側: 表示件数選択 */}
      <LimitSelect currentLimit={limit} onChange={onLimitChange} />
    </nav>
  );
}
