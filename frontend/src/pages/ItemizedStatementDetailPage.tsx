/**
 * @fileoverview 内訳書詳細ページ
 *
 * Task 7.1, 7.2: 内訳書詳細画面の実装
 * Task 8: 内訳項目のソート機能実装
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
 * - 8.4: 集計元の数量表名を参照情報として表示する
 * - 9.1: パンくずナビゲーションを表示する
 * - 9.2: パンくずを「プロジェクト一覧 > {プロジェクト名} > 内訳書 > {内訳書名}」形式で表示する
 * - 9.3: プロジェクト名クリックでプロジェクト詳細画面に遷移する
 * - 9.4: プロジェクト一覧クリックでプロジェクト一覧画面に遷移する
 * - 12.2: 内訳書詳細データの取得中はローディングインジケーターを表示する
 * - 12.5: ローディングが完了したらインジケーターを非表示にする
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getItemizedStatementDetail } from '../api/itemized-statements';
import { Breadcrumb } from '../components/common';
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

// ============================================================================
// サブコンポーネント
// ============================================================================

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

  // データ状態
  const [statement, setStatement] = useState<ItemizedStatementDetail | null>(null);

  // UI状態
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);

  // ソート状態（Req 5.5: デフォルトはnullでデフォルトソートを適用）
  const [sortState, setSortState] = useState<SortState>({
    column: null,
    direction: 'asc',
  });

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

  // ソート済み項目（Req 5.2, 5.3, 5.5）
  const sortedItems = useMemo(() => {
    if (!statement) return [];

    if (sortState.column === null) {
      // デフォルトソート（Req 5.5）
      return applyDefaultSort(statement.items);
    }

    // 単一カラムソート（Req 5.2, 5.3）
    return applySingleColumnSort(statement.items, sortState.column, sortState.direction);
  }, [statement, sortState]);

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
            <button type="button" style={styles.deleteButton} aria-label="削除">
              削除
            </button>
          </div>
        </div>
      </div>

      {/* 内訳項目テーブル (Req 4.1, 4.2, 4.3, 4.6, 5.1-5.5) */}
      <section style={styles.section}>
        <h2 style={styles.sectionTitle}>内訳項目 ({statement.itemCount}件)</h2>
        {statement.items.length === 0 ? (
          <div style={styles.emptyState}>
            <p>内訳項目がありません</p>
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
            {/* ページネーション (Req 4.7, 4.8, 4.9) */}
            {showPagination && (
              <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                onPageChange={handlePageChange}
              />
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
