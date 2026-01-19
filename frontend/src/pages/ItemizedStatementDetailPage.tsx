/**
 * @fileoverview 内訳書詳細ページ
 *
 * Task 7.1, 7.2: 内訳書詳細画面の実装
 * Task 8: 内訳項目のソート機能実装
 * Task 9: 内訳項目のフィルタリング機能実装
 * Task 10: 内訳書削除機能の実装
 *
 * Requirements:
 * - 4.1: 集計結果をテーブル形式で表示する
 * - 4.2: テーブルは「任意分類」「工種」「名称」「規格」「数量」「単位」の順でカラムを表示する
 * - 4.3: 数量カラムは小数点以下2桁で表示し、桁が足りない場合は0で埋める
 * - 4.4: パンくずナビゲーションでプロジェクト詳細画面への戻りリンクを提供する
 * - 4.5: 内訳書名と作成日時をヘッダーに表示する
 * - 4.6: テーブルは最大2000件の内訳項目を表示可能とする
 * - 4.7: 内訳項目が50件を超える場合はページネーションを表示する
 * - 4.8: ページネーションは1ページあたり50件の項目を表示する
 * - 4.9: ページネーションは現在のページ番号と総ページ数を表示する
 * - 5.1: 各カラムヘッダーにソートボタンを表示する
 * - 5.2: カラムヘッダークリック時に該当カラムで昇順ソートを適用する
 * - 5.3: 同じカラムヘッダーを再度クリックした場合に降順ソートに切り替える
 * - 5.4: ソートが適用されているカラムヘッダーに現在のソート方向を示すアイコンを表示する
 * - 5.5: デフォルトのソート順として任意分類・工種・名称・規格の優先度で昇順を適用する
 * - 6.1: フィルタ入力エリアを内訳書詳細画面に配置する
 * - 6.2: フィルタは「任意分類」「工種」「名称」「規格」「単位」の全カラムに対応する
 * - 6.3: フィルタに値を入力すると該当カラムで部分一致する項目のみを表示する
 * - 6.4: 複数のフィルタが設定されている場合に全条件をAND結合して絞り込む
 * - 6.5: フィルタ結果が0件の場合に「該当する項目はありません」メッセージを表示する
 * - 6.6: クリアボタンで全フィルタを一括解除できる
 * - 6.7: フィルタが適用されている状態でページネーションを使用する場合、フィルタ結果に対してページネーションを適用する
 * - 7.1: 内訳書詳細画面で削除ボタンを表示する
 * - 7.2: 削除ボタンクリック時に確認ダイアログを表示する
 * - 7.3: 確認ダイアログで削除を確定した場合に論理削除APIを呼び出す
 * - 7.4: 削除処理中にエラーが発生した場合にエラーメッセージを表示し内訳書を削除しない
 * - 8.4: 集計元の数量表名を参照情報として表示する
 * - 9.1: パンくずナビゲーションを表示する
 * - 9.2: パンくずを「プロジェクト一覧 > {プロジェクト名} > 内訳書 > {内訳書名}」形式で表示する
 * - 9.3: プロジェクト名クリックでプロジェクト詳細画面に遷移する
 * - 9.4: プロジェクト一覧クリックでプロジェクト一覧画面に遷移する
 * - 10.2: 削除リクエストを受信すると、システムはリクエストのupdatedAtと現在値を比較する
 * - 10.3: updatedAtが一致しない場合は409 Conflictエラーを返却する
 * - 10.4: 409エラーが返却されると「他のユーザーにより更新されました。画面を再読み込みしてください」メッセージを表示する
 * - 12.2: 内訳書詳細データの取得中はローディングインジケーターを表示する
 * - 12.3: 削除処理中はローディングインジケーターを表示する
 * - 12.4: ローディング中は操作ボタンを無効化する
 * - 12.5: ローディングが完了したらインジケーターを非表示にする
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { getItemizedStatementDetail, deleteItemizedStatement } from '../api/itemized-statements';
import { Breadcrumb } from '../components/common';
import ItemizedStatementDeleteDialog from '../components/itemized-statement/ItemizedStatementDeleteDialog';
import type {
  ItemizedStatementDetail,
  ItemizedStatementItemInfo,
} from '../types/itemized-statement.types';

// ============================================================================
// 型定義
// ============================================================================

/** ソート可能なカラム */
type SortColumn = 'customCategory' | 'workType' | 'name' | 'specification' | 'unit' | 'quantity';

/** ソート方向 */
type SortDirection = 'asc' | 'desc';

/** ソート状態（nullはデフォルトソート） */
interface SortState {
  column: SortColumn | null;
  direction: SortDirection;
}

/** カラム定義 */
interface ColumnDefinition {
  key: SortColumn;
  label: string;
  isQuantity?: boolean;
}

/** フィルタ可能なカラム (数量以外) */
type FilterColumn = 'customCategory' | 'workType' | 'name' | 'specification' | 'unit';

/** フィルタ状態 */
interface FilterState {
  customCategory: string;
  workType: string;
  name: string;
  specification: string;
  unit: string;
}

// ============================================================================
// 定数定義
// ============================================================================

/** ページあたりの項目数 */
const PAGE_SIZE = 50;

/** カラム定義一覧 */
const COLUMNS: ColumnDefinition[] = [
  { key: 'customCategory', label: '任意分類' },
  { key: 'workType', label: '工種' },
  { key: 'name', label: '名称' },
  { key: 'specification', label: '規格' },
  { key: 'quantity', label: '数量', isQuantity: true },
  { key: 'unit', label: '単位' },
];

/** フィルタ可能なカラム定義（数量以外） */
const FILTER_COLUMNS: { key: FilterColumn; label: string }[] = [
  { key: 'customCategory', label: '任意分類' },
  { key: 'workType', label: '工種' },
  { key: 'name', label: '名称' },
  { key: 'specification', label: '規格' },
  { key: 'unit', label: '単位' },
];

/** フィルタの初期値 */
const INITIAL_FILTER_STATE: FilterState = {
  customCategory: '',
  workType: '',
  name: '',
  specification: '',
  unit: '',
};

// ============================================================================
// スタイル定義
// ============================================================================

const styles = {
  container: {
    maxWidth: '1200px',
    margin: '0 auto',
    padding: '32px 16px',
  } as React.CSSProperties,
  breadcrumbWrapper: {
    marginBottom: '16px',
  } as React.CSSProperties,
  header: {
    marginBottom: '24px',
  } as React.CSSProperties,
  backLink: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    color: '#2563eb',
    textDecoration: 'none',
    fontSize: '14px',
    marginBottom: '16px',
  } as React.CSSProperties,
  titleRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: '16px',
    flexWrap: 'wrap' as const,
  } as React.CSSProperties,
  titleSection: {
    flex: 1,
    minWidth: '200px',
  } as React.CSSProperties,
  title: {
    fontSize: '24px',
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: '8px',
  } as React.CSSProperties,
  subtitle: {
    fontSize: '14px',
    color: '#4b5563',
  } as React.CSSProperties,
  metaInfo: {
    fontSize: '14px',
    color: '#6b7280',
    marginTop: '4px',
  } as React.CSSProperties,
  actionsContainer: {
    display: 'flex',
    gap: '12px',
    flexShrink: 0,
  } as React.CSSProperties,
  deleteButton: {
    padding: '8px 16px',
    fontSize: '14px',
    fontWeight: '500',
    borderRadius: '6px',
    cursor: 'pointer',
    backgroundColor: '#ffffff',
    color: '#dc2626',
    border: '1px solid #dc2626',
    transition: 'all 0.2s',
  } as React.CSSProperties,
  section: {
    backgroundColor: '#ffffff',
    borderRadius: '8px',
    border: '1px solid #e5e7eb',
    padding: '24px',
    marginBottom: '24px',
    overflowX: 'auto' as const,
  } as React.CSSProperties,
  sectionTitle: {
    fontSize: '16px',
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: '16px',
    paddingBottom: '8px',
    borderBottom: '1px solid #e5e7eb',
  } as React.CSSProperties,
  table: {
    width: '100%',
    borderCollapse: 'collapse' as const,
    fontSize: '14px',
  } as React.CSSProperties,
  th: {
    padding: '12px 16px',
    textAlign: 'left' as const,
    fontWeight: '600',
    color: '#374151',
    backgroundColor: '#f9fafb',
    borderBottom: '2px solid #e5e7eb',
    whiteSpace: 'nowrap' as const,
    cursor: 'pointer',
    userSelect: 'none' as const,
  } as React.CSSProperties,
  thQuantity: {
    textAlign: 'right' as const,
  } as React.CSSProperties,
  sortIcon: {
    marginLeft: '4px',
    fontSize: '10px',
  } as React.CSSProperties,
  td: {
    padding: '12px 16px',
    color: '#1f2937',
    borderBottom: '1px solid #e5e7eb',
    verticalAlign: 'top' as const,
  } as React.CSSProperties,
  tdQuantity: {
    textAlign: 'right' as const,
    fontFamily: 'monospace',
  } as React.CSSProperties,
  tdEmpty: {
    color: '#9ca3af',
  } as React.CSSProperties,
  pagination: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    gap: '16px',
    marginTop: '24px',
    padding: '16px',
    borderTop: '1px solid #e5e7eb',
  } as React.CSSProperties,
  paginationButton: {
    padding: '8px 16px',
    fontSize: '14px',
    fontWeight: '500',
    borderRadius: '6px',
    cursor: 'pointer',
    backgroundColor: '#ffffff',
    color: '#2563eb',
    border: '1px solid #2563eb',
    transition: 'all 0.2s',
  } as React.CSSProperties,
  paginationButtonDisabled: {
    opacity: 0.5,
    cursor: 'not-allowed',
  } as React.CSSProperties,
  paginationInfo: {
    fontSize: '14px',
    color: '#6b7280',
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
    fontWeight: '500',
    borderRadius: '6px',
    cursor: 'pointer',
  } as React.CSSProperties,
  emptyState: {
    textAlign: 'center' as const,
    padding: '48px 24px',
    color: '#6b7280',
  } as React.CSSProperties,
  filterContainer: {
    backgroundColor: '#f9fafb',
    borderRadius: '8px',
    padding: '16px',
    marginBottom: '16px',
    border: '1px solid #e5e7eb',
  } as React.CSSProperties,
  filterHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '12px',
  } as React.CSSProperties,
  filterTitle: {
    fontSize: '14px',
    fontWeight: '600',
    color: '#374151',
  } as React.CSSProperties,
  filterGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
    gap: '12px',
  } as React.CSSProperties,
  filterField: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '4px',
  } as React.CSSProperties,
  filterLabel: {
    fontSize: '12px',
    fontWeight: '500',
    color: '#6b7280',
  } as React.CSSProperties,
  filterInput: {
    padding: '8px 12px',
    fontSize: '14px',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    backgroundColor: '#ffffff',
    outline: 'none',
    transition: 'border-color 0.2s, box-shadow 0.2s',
  } as React.CSSProperties,
  clearButton: {
    padding: '6px 12px',
    fontSize: '12px',
    fontWeight: '500',
    borderRadius: '4px',
    cursor: 'pointer',
    backgroundColor: '#ffffff',
    color: '#6b7280',
    border: '1px solid #d1d5db',
    transition: 'all 0.2s',
  } as React.CSSProperties,
  noResults: {
    textAlign: 'center' as const,
    padding: '48px 24px',
    color: '#6b7280',
    backgroundColor: '#f9fafb',
    borderRadius: '8px',
  } as React.CSSProperties,
  deleteErrorContainer: {
    backgroundColor: '#fef2f2',
    border: '1px solid #fecaca',
    borderRadius: '8px',
    padding: '16px',
    marginBottom: '16px',
  } as React.CSSProperties,
  deleteErrorText: {
    color: '#991b1b',
    fontSize: '14px',
    margin: 0,
  } as React.CSSProperties,
};

// ============================================================================
// ヘルパー関数
// ============================================================================

/**
 * 日付を日本語形式でフォーマット
 * @param dateString - ISO8601形式の日付文字列
 */
function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/**
 * 数量を小数点以下2桁で表示
 * @param quantity - 数量
 */
function formatQuantity(quantity: number): string {
  return quantity.toFixed(2);
}

/**
 * 文字列比較（null値は末尾に配置）
 * @param a - 比較対象1
 * @param b - 比較対象2
 * @param direction - ソート方向
 */
function compareStrings(a: string | null, b: string | null, direction: SortDirection): number {
  // null値は常に末尾に配置
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;

  const result = a.localeCompare(b, 'ja');
  return direction === 'asc' ? result : -result;
}

/**
 * 数値比較
 * @param a - 比較対象1
 * @param b - 比較対象2
 * @param direction - ソート方向
 */
function compareNumbers(a: number, b: number, direction: SortDirection): number {
  const result = a - b;
  return direction === 'asc' ? result : -result;
}

/**
 * デフォルトソート（任意分類 > 工種 > 名称 > 規格 の優先度で昇順）
 * @param items - ソート対象の項目配列
 */
function applyDefaultSort(items: ItemizedStatementItemInfo[]): ItemizedStatementItemInfo[] {
  return [...items].sort((a, b) => {
    // 任意分類で比較
    const customCategoryResult = compareStrings(a.customCategory, b.customCategory, 'asc');
    if (customCategoryResult !== 0) return customCategoryResult;

    // 工種で比較
    const workTypeResult = compareStrings(a.workType, b.workType, 'asc');
    if (workTypeResult !== 0) return workTypeResult;

    // 名称で比較
    const nameResult = compareStrings(a.name, b.name, 'asc');
    if (nameResult !== 0) return nameResult;

    // 規格で比較
    return compareStrings(a.specification, b.specification, 'asc');
  });
}

/**
 * 単一カラムでソート
 * @param items - ソート対象の項目配列
 * @param column - ソートカラム
 * @param direction - ソート方向
 */
function applySingleColumnSort(
  items: ItemizedStatementItemInfo[],
  column: SortColumn,
  direction: SortDirection
): ItemizedStatementItemInfo[] {
  return [...items].sort((a, b) => {
    if (column === 'quantity') {
      return compareNumbers(a.quantity, b.quantity, direction);
    }
    return compareStrings(a[column], b[column], direction);
  });
}

/**
 * フィルタを適用
 * @param items - フィルタ対象の項目配列
 * @param filters - フィルタ状態
 * @returns フィルタ後の項目配列
 */
function applyFilters(
  items: ItemizedStatementItemInfo[],
  filters: FilterState
): ItemizedStatementItemInfo[] {
  return items.filter((item) => {
    // 各フィルタ条件をAND結合
    for (const column of FILTER_COLUMNS) {
      const filterValue = filters[column.key].toLowerCase();
      if (filterValue === '') continue; // 空のフィルタはスキップ

      const itemValue = item[column.key];
      // null値はフィルタにマッチしない
      if (itemValue === null) return false;

      // 部分一致（大文字小文字を区別しない）
      if (!itemValue.toLowerCase().includes(filterValue)) {
        return false;
      }
    }
    return true;
  });
}

// ============================================================================
// サブコンポーネント
// ============================================================================

/**
 * フィルタ入力エリア (Req 6.1, 6.2, 6.6)
 */
interface FilterAreaProps {
  filters: FilterState;
  onFilterChange: (column: FilterColumn, value: string) => void;
  onClear: () => void;
}

function FilterArea({ filters, onFilterChange, onClear }: FilterAreaProps) {
  return (
    <section role="region" aria-label="フィルタ" style={styles.filterContainer}>
      <div style={styles.filterHeader}>
        <span style={styles.filterTitle}>フィルタ</span>
        <button
          type="button"
          onClick={onClear}
          style={styles.clearButton}
          aria-label="フィルタをクリア"
        >
          クリア
        </button>
      </div>
      <div style={styles.filterGrid}>
        {FILTER_COLUMNS.map((column) => (
          <div key={column.key} style={styles.filterField}>
            <label htmlFor={`filter-${column.key}`} style={styles.filterLabel}>
              {column.label}
            </label>
            <input
              id={`filter-${column.key}`}
              type="text"
              value={filters[column.key]}
              onChange={(e) => onFilterChange(column.key, e.target.value)}
              placeholder={`${column.label}で絞り込み`}
              style={styles.filterInput}
              aria-label={column.label}
            />
          </div>
        ))}
      </div>
    </section>
  );
}

/**
 * ソート可能なカラムヘッダー
 */
interface SortableHeaderProps {
  column: ColumnDefinition;
  sortState: SortState;
  onSort: (column: SortColumn) => void;
}

function SortableHeader({ column, sortState, onSort }: SortableHeaderProps) {
  const isActive = sortState.column === column.key;
  const sortIcon = isActive ? (sortState.direction === 'asc' ? '▲' : '▼') : '';

  const handleClick = useCallback(() => {
    onSort(column.key);
  }, [column.key, onSort]);

  return (
    <th
      style={{
        ...styles.th,
        ...(column.isQuantity ? styles.thQuantity : {}),
      }}
      role="columnheader"
      onClick={handleClick}
      aria-sort={isActive ? (sortState.direction === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      {column.label}
      {sortIcon && <span style={styles.sortIcon}>{sortIcon}</span>}
    </th>
  );
}

/**
 * 内訳項目テーブル
 */
interface ItemsTableProps {
  items: ItemizedStatementItemInfo[];
  currentPage: number;
  pageSize: number;
  sortState: SortState;
  onSort: (column: SortColumn) => void;
}

function ItemsTable({ items, currentPage, pageSize, sortState, onSort }: ItemsTableProps) {
  // ページネーションに基づいて表示する項目を取得
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const displayItems = items.slice(startIndex, endIndex);

  return (
    <table style={styles.table} role="table">
      <thead>
        <tr>
          {COLUMNS.map((column) => (
            <SortableHeader
              key={column.key}
              column={column}
              sortState={sortState}
              onSort={onSort}
            />
          ))}
        </tr>
      </thead>
      <tbody>
        {displayItems.map((item) => (
          <tr key={item.id}>
            <td style={{ ...styles.td, ...(item.customCategory ? {} : styles.tdEmpty) }}>
              {item.customCategory ?? '-'}
            </td>
            <td style={{ ...styles.td, ...(item.workType ? {} : styles.tdEmpty) }}>
              {item.workType ?? '-'}
            </td>
            <td style={{ ...styles.td, ...(item.name ? {} : styles.tdEmpty) }}>
              {item.name ?? '-'}
            </td>
            <td style={{ ...styles.td, ...(item.specification ? {} : styles.tdEmpty) }}>
              {item.specification ?? '-'}
            </td>
            <td style={{ ...styles.td, ...styles.tdQuantity }}>{formatQuantity(item.quantity)}</td>
            <td style={{ ...styles.td, ...(item.unit ? {} : styles.tdEmpty) }}>
              {item.unit ?? '-'}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * ページネーションコンポーネント
 */
interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

function Pagination({ currentPage, totalPages, onPageChange }: PaginationProps) {
  const handlePrevious = useCallback(() => {
    if (currentPage > 1) {
      onPageChange(currentPage - 1);
    }
  }, [currentPage, onPageChange]);

  const handleNext = useCallback(() => {
    if (currentPage < totalPages) {
      onPageChange(currentPage + 1);
    }
  }, [currentPage, totalPages, onPageChange]);

  return (
    <nav aria-label="ページネーション" style={styles.pagination}>
      <button
        type="button"
        onClick={handlePrevious}
        disabled={currentPage === 1}
        style={{
          ...styles.paginationButton,
          ...(currentPage === 1 ? styles.paginationButtonDisabled : {}),
        }}
        aria-label="前へ"
      >
        前へ
      </button>
      <span style={styles.paginationInfo}>
        {currentPage} / {totalPages}
      </span>
      <button
        type="button"
        onClick={handleNext}
        disabled={currentPage === totalPages}
        style={{
          ...styles.paginationButton,
          ...(currentPage === totalPages ? styles.paginationButtonDisabled : {}),
        }}
        aria-label="次へ"
      >
        次へ
      </button>
    </nav>
  );
}

// ============================================================================
// メインコンポーネント
// ============================================================================

/**
 * 内訳書詳細ページ
 *
 * 内訳書の詳細情報と集計項目一覧を表示する。
 * ソート、フィルタリング、ページネーション機能を提供する。
 */
export default function ItemizedStatementDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  // データ状態
  const [statement, setStatement] = useState<ItemizedStatementDetail | null>(null);

  // UI状態
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);

  // 削除機能の状態 (Req 7.1, 7.2, 12.3, 12.4)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // ソート状態（Req 5.5: デフォルトはnullでデフォルトソートを適用）
  const [sortState, setSortState] = useState<SortState>({
    column: null,
    direction: 'asc',
  });

  // フィルタ状態 (Req 6.1, 6.2)
  const [filters, setFilters] = useState<FilterState>(INITIAL_FILTER_STATE);

  /**
   * 内訳書詳細データを取得
   */
  const fetchStatement = useCallback(async () => {
    if (!id) return;

    setIsLoading(true);
    setError(null);

    try {
      const data = await getItemizedStatementDetail(id);
      setStatement(data);
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('内訳書の取得に失敗しました');
      }
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  // 初回読み込み
  useEffect(() => {
    fetchStatement();
  }, [fetchStatement]);

  // フィルタ済み項目 (Req 6.3, 6.4)
  const filteredItems = useMemo(() => {
    if (!statement) return [];
    return applyFilters(statement.items, filters);
  }, [statement, filters]);

  // ソート済み項目（Req 5.2, 5.3, 5.5）- フィルタ後の項目に対してソート
  const sortedItems = useMemo(() => {
    if (filteredItems.length === 0) return [];

    if (sortState.column === null) {
      // デフォルトソート（Req 5.5）
      return applyDefaultSort(filteredItems);
    }

    // 単一カラムソート（Req 5.2, 5.3）
    return applySingleColumnSort(filteredItems, sortState.column, sortState.direction);
  }, [filteredItems, sortState]);

  // ページネーション計算
  const totalPages = useMemo(() => {
    if (!statement) return 1;
    return Math.ceil(sortedItems.length / PAGE_SIZE);
  }, [statement, sortedItems.length]);

  // ページネーションが必要かどうか
  const showPagination = useMemo(() => {
    if (!statement) return false;
    return sortedItems.length > PAGE_SIZE;
  }, [statement, sortedItems.length]);

  // ページ変更ハンドラ
  const handlePageChange = useCallback((page: number) => {
    setCurrentPage(page);
    // ページ上部にスクロール
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  // ソートハンドラ（Req 5.2, 5.3）
  const handleSort = useCallback((column: SortColumn) => {
    setSortState((prev) => {
      if (prev.column === column) {
        // 同じカラムの場合は方向を切り替え
        return {
          column,
          direction: prev.direction === 'asc' ? 'desc' : 'asc',
        };
      }
      // 異なるカラムの場合は昇順でソート
      return {
        column,
        direction: 'asc',
      };
    });
    // ソート変更時はページを1に戻さない（現在のページを維持）
  }, []);

  // フィルタ変更ハンドラ (Req 6.3)
  const handleFilterChange = useCallback((column: FilterColumn, value: string) => {
    setFilters((prev) => ({
      ...prev,
      [column]: value,
    }));
    // フィルタ変更時はページを1に戻す
    setCurrentPage(1);
  }, []);

  // フィルタクリアハンドラ (Req 6.6)
  const handleClearFilters = useCallback(() => {
    setFilters(INITIAL_FILTER_STATE);
    setCurrentPage(1);
  }, []);

  // 削除ダイアログを開く (Req 7.2)
  const handleOpenDeleteDialog = useCallback(() => {
    setDeleteError(null);
    setIsDeleteDialogOpen(true);
  }, []);

  // 削除ダイアログを閉じる
  const handleCloseDeleteDialog = useCallback(() => {
    if (!isDeleting) {
      setIsDeleteDialogOpen(false);
    }
  }, [isDeleting]);

  // 削除を実行 (Req 7.3, 7.4, 10.4, 12.3, 12.4)
  const handleConfirmDelete = useCallback(async () => {
    if (!statement) return;

    setIsDeleting(true);
    setDeleteError(null);

    try {
      await deleteItemizedStatement(statement.id, statement.updatedAt);
      // 削除成功後にプロジェクト詳細画面に遷移
      navigate(`/projects/${statement.projectId}`);
    } catch (err) {
      // 楽観的排他制御エラー（409）の判定 (Req 10.4)
      if (err && typeof err === 'object' && 'status' in err && err.status === 409) {
        setDeleteError('他のユーザーにより更新されました。画面を再読み込みしてください');
      } else if (err instanceof Error) {
        setDeleteError(err.message);
      } else {
        setDeleteError('削除に失敗しました');
      }
      setIsDeleteDialogOpen(false);
    } finally {
      setIsDeleting(false);
    }
  }, [statement, navigate]);

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
  if (error || !statement) {
    return (
      <main role="main" style={styles.container}>
        <div role="alert" style={styles.errorContainer}>
          <p style={styles.errorText}>{error || '内訳書が見つかりません'}</p>
          <button type="button" onClick={fetchStatement} style={styles.retryButton}>
            再試行
          </button>
        </div>
      </main>
    );
  }

  // 詳細表示
  return (
    <main role="main" aria-busy={isLoading} style={styles.container}>
      {/* パンくずナビゲーション (Req 9.1, 9.2, 9.3, 9.4) */}
      <div style={styles.breadcrumbWrapper}>
        <Breadcrumb
          items={[
            { label: 'プロジェクト一覧', path: '/projects' },
            { label: statement.project.name, path: `/projects/${statement.projectId}` },
            { label: '内訳書', path: `/projects/${statement.projectId}/itemized-statements` },
            { label: statement.name },
          ]}
        />
      </div>

      {/* ヘッダー (Req 4.4, 4.5, 8.4) */}
      <div style={styles.header}>
        <Link to={`/projects/${statement.projectId}`} style={styles.backLink}>
          ← プロジェクトに戻る
        </Link>
        <div style={styles.titleRow}>
          <div style={styles.titleSection}>
            <h1 style={styles.title}>{statement.name}</h1>
            <p style={styles.subtitle}>作成日: {formatDate(statement.createdAt)}</p>
            <p style={styles.metaInfo}>集計元数量表: {statement.sourceQuantityTableName}</p>
          </div>
          <div style={styles.actionsContainer}>
            <button
              type="button"
              style={styles.deleteButton}
              aria-label="削除"
              onClick={handleOpenDeleteDialog}
            >
              削除
            </button>
          </div>
        </div>
      </div>

      {/* 削除エラーメッセージ (Req 7.4, 10.4) */}
      {deleteError && (
        <div role="alert" style={styles.deleteErrorContainer}>
          <p style={styles.deleteErrorText}>{deleteError}</p>
        </div>
      )}

      {/* 削除確認ダイアログ (Req 7.2, 7.3, 12.3, 12.4) */}
      <ItemizedStatementDeleteDialog
        isOpen={isDeleteDialogOpen}
        onClose={handleCloseDeleteDialog}
        onConfirm={handleConfirmDelete}
        statementName={statement.name}
        isDeleting={isDeleting}
      />

      {/* 内訳項目テーブル (Req 4.1, 4.2, 4.3, 4.6, 5.1-5.5, 6.1-6.7) */}
      <section style={styles.section}>
        <h2 style={styles.sectionTitle}>内訳項目 ({statement.itemCount}件)</h2>
        {statement.items.length === 0 ? (
          <div style={styles.emptyState}>
            <p>内訳項目がありません</p>
          </div>
        ) : (
          <>
            {/* フィルタエリア (Req 6.1, 6.2, 6.6) */}
            <FilterArea
              filters={filters}
              onFilterChange={handleFilterChange}
              onClear={handleClearFilters}
            />
            {/* フィルタ結果が0件の場合 (Req 6.5) */}
            {sortedItems.length === 0 ? (
              <div style={styles.noResults}>
                <p>該当する項目はありません</p>
              </div>
            ) : (
              <>
                <ItemsTable
                  items={sortedItems}
                  currentPage={currentPage}
                  pageSize={PAGE_SIZE}
                  sortState={sortState}
                  onSort={handleSort}
                />
                {/* ページネーション (Req 4.7, 4.8, 4.9, 6.7) */}
                {showPagination && (
                  <Pagination
                    currentPage={currentPage}
                    totalPages={totalPages}
                    onPageChange={handlePageChange}
                  />
                )}
              </>
            )}
          </>
        )}
      </section>

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
