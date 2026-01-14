/**
 * @fileoverview 数量表セクションカードコンポーネント
 *
 * Task 4.1: QuantityTableSectionCardコンポーネントを実装する
 *
 * Requirements:
 * - 1.1: プロジェクト詳細画面に数量表セクションを表示する
 * - 1.2: 数量表の総数とヘッダーを表示する
 * - 1.3: 直近の数量表カードを一覧表示する
 * - 1.4: 数量表一覧画面への遷移リンク
 * - 1.5: 数量表詳細/編集画面への遷移リンク
 * - 1.6: 空状態表示（数量表がない場合）
 * - 1.7: 新規作成ボタン
 *
 * 表示要素:
 * - セクションタイトル「数量表」
 * - 総数表示（例: 全5件）
 * - 直近N件のカード形式表示
 *   - 数量表名
 *   - グループ数・項目数
 *   - 作成日
 * - 「すべて見る」リンク（一覧画面へ遷移）
 */

import { Link } from 'react-router-dom';
import type { QuantityTableInfo } from '../../types/quantity-table.types';

// ============================================================================
// 型定義
// ============================================================================

/**
 * QuantityTableSectionCardコンポーネントのProps
 */
export interface QuantityTableSectionCardProps {
  /** プロジェクトID */
  projectId: string;
  /** 数量表の総数 */
  totalCount: number;
  /** 直近N件の数量表 */
  latestTables: QuantityTableInfo[];
  /** ローディング状態 */
  isLoading: boolean;
}

// ============================================================================
// スタイル定義
// ============================================================================

const styles = {
  section: {
    backgroundColor: '#ffffff',
    borderRadius: '8px',
    border: '1px solid #e5e7eb',
    padding: '24px',
    marginBottom: '24px',
  } as React.CSSProperties,
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '16px',
    paddingBottom: '8px',
    borderBottom: '1px solid #e5e7eb',
  } as React.CSSProperties,
  titleWrapper: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  } as React.CSSProperties,
  title: {
    fontSize: '16px',
    fontWeight: 'bold',
    color: '#1f2937',
    margin: 0,
  } as React.CSSProperties,
  count: {
    fontSize: '14px',
    color: '#6b7280',
  } as React.CSSProperties,
  viewAllLink: {
    fontSize: '14px',
    color: '#2563eb',
    textDecoration: 'none',
    fontWeight: 500,
  } as React.CSSProperties,
  headerActions: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  } as React.CSSProperties,
  addButton: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    backgroundColor: '#2563eb',
    color: '#ffffff',
    padding: '6px 12px',
    borderRadius: '6px',
    textDecoration: 'none',
    fontSize: '13px',
    fontWeight: 500,
    border: 'none',
    cursor: 'pointer',
  } as React.CSSProperties,
  tableList: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '12px',
  } as React.CSSProperties,
  tableCard: {
    display: 'flex',
    gap: '12px',
    padding: '12px',
    backgroundColor: '#f9fafb',
    borderRadius: '6px',
    border: '1px solid #e5e7eb',
    textDecoration: 'none',
    color: 'inherit',
    transition: 'background-color 0.2s',
  } as React.CSSProperties,
  iconWrapper: {
    width: '48px',
    height: '48px',
    borderRadius: '6px',
    backgroundColor: '#e5e7eb',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#6b7280',
    flexShrink: 0,
  } as React.CSSProperties,
  tableInfo: {
    flex: 1,
    minWidth: 0,
  } as React.CSSProperties,
  tableName: {
    fontSize: '14px',
    fontWeight: 500,
    color: '#1f2937',
    margin: 0,
    whiteSpace: 'nowrap' as const,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  } as React.CSSProperties,
  tableMeta: {
    fontSize: '12px',
    color: '#6b7280',
    marginTop: '4px',
  } as React.CSSProperties,
  emptyState: {
    textAlign: 'center' as const,
    padding: '24px',
    color: '#6b7280',
  } as React.CSSProperties,
  emptyText: {
    fontSize: '14px',
    marginBottom: '12px',
  } as React.CSSProperties,
  createLink: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    backgroundColor: '#2563eb',
    color: '#ffffff',
    padding: '8px 16px',
    borderRadius: '6px',
    textDecoration: 'none',
    fontSize: '14px',
    fontWeight: 500,
  } as React.CSSProperties,
  skeleton: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '12px',
  } as React.CSSProperties,
  skeletonCard: {
    display: 'flex',
    gap: '12px',
    padding: '12px',
    backgroundColor: '#f9fafb',
    borderRadius: '6px',
    animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
  } as React.CSSProperties,
  skeletonIcon: {
    width: '48px',
    height: '48px',
    borderRadius: '6px',
    backgroundColor: '#e5e7eb',
  } as React.CSSProperties,
  skeletonContent: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '6px',
  } as React.CSSProperties,
  skeletonLine: {
    height: '14px',
    backgroundColor: '#e5e7eb',
    borderRadius: '4px',
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

// ============================================================================
// サブコンポーネント
// ============================================================================

/**
 * 数量表アイコン（テーブルアイコン）
 */
function QuantityTableIcon() {
  return (
    <svg
      data-testid="quantity-table-icon"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 3h18v18H3zM3 9h18M3 15h18M9 9v12M15 9v12" />
    </svg>
  );
}

/**
 * スケルトンローダー
 */
function TableSkeleton() {
  return (
    <div style={styles.skeleton} data-testid="quantity-table-section-skeleton">
      {[1, 2].map((index) => (
        <div key={index} style={styles.skeletonCard}>
          <div style={styles.skeletonIcon} />
          <div style={styles.skeletonContent}>
            <div style={{ ...styles.skeletonLine, width: '60%' }} />
            <div style={{ ...styles.skeletonLine, width: '40%' }} />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * 空状態表示
 */
function EmptyState({ projectId }: { projectId: string }) {
  return (
    <div style={styles.emptyState}>
      <p style={styles.emptyText}>数量表はまだありません</p>
      <Link to={`/projects/${projectId}/quantity-tables/new`} style={styles.createLink}>
        新規作成
      </Link>
    </div>
  );
}

/**
 * 数量表カード
 */
function TableCard({ table }: { table: QuantityTableInfo }) {
  return (
    <Link
      to={`/projects/${table.projectId}/quantity-tables/${table.id}`}
      style={styles.tableCard}
      aria-label={`${table.name}の数量表詳細を見る`}
    >
      <div style={styles.iconWrapper}>
        <QuantityTableIcon />
      </div>
      <div style={styles.tableInfo}>
        <h4 style={styles.tableName}>{table.name}</h4>
        <p style={styles.tableMeta}>
          {formatDate(table.createdAt)} / {table.groupCount}グループ / {table.itemCount}項目
        </p>
      </div>
    </Link>
  );
}

// ============================================================================
// メインコンポーネント
// ============================================================================

/**
 * 数量表セクションカード
 *
 * プロジェクト詳細画面で直近の数量表と総数を表示する。
 *
 * @example
 * ```tsx
 * <QuantityTableSectionCard
 *   projectId="project-123"
 *   totalCount={5}
 *   latestTables={tables}
 *   isLoading={false}
 * />
 * ```
 */
export function QuantityTableSectionCard({
  projectId,
  totalCount,
  latestTables,
  isLoading,
}: QuantityTableSectionCardProps) {
  return (
    <section
      style={styles.section}
      role="region"
      aria-labelledby="quantity-table-section-title"
      data-testid="quantity-table-section"
    >
      <div style={styles.header}>
        <div style={styles.titleWrapper}>
          <h3 id="quantity-table-section-title" style={styles.title}>
            数量表
          </h3>
          {!isLoading && <span style={styles.count}>全{totalCount}件</span>}
        </div>
        {!isLoading && totalCount > 0 && (
          <div style={styles.headerActions}>
            <Link
              to={`/projects/${projectId}/quantity-tables/new`}
              style={styles.addButton}
              aria-label="数量表を新規作成"
            >
              新規作成
            </Link>
            <Link to={`/projects/${projectId}/quantity-tables`} style={styles.viewAllLink}>
              すべて見る
            </Link>
          </div>
        )}
      </div>

      {isLoading ? (
        <TableSkeleton />
      ) : totalCount === 0 ? (
        <EmptyState projectId={projectId} />
      ) : (
        <div style={styles.tableList}>
          {latestTables.map((table) => (
            <TableCard key={table.id} table={table} />
          ))}
        </div>
      )}
    </section>
  );
}

export default QuantityTableSectionCard;
