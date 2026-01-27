/**
 * @fileoverview 内訳書セクションカードコンポーネント
 *
 * Task 6: 内訳書セクションカードの実装
 * Task 18.1: 既存コンポーネントの表示ロジック更新
 *
 * Requirements:
 * - 1.8: プロジェクトに数量表が存在しない場合、「まず数量表を作成してください」メッセージを表示し新規作成ボタンを非表示
 * - 3.1: プロジェクト詳細画面に数量表セクションの下に内訳書セクションを表示する
 * - 3.2: 作成済み内訳書を作成日時の降順で一覧表示する
 * - 3.3: 数量表が存在しない場合「まず数量表を作成してください」メッセージを表示する
 * - 3.4: 数量表は存在するが内訳書が存在しない場合「内訳書はまだありません」メッセージを表示する
 * - 3.5: 内訳書行をクリックで詳細画面に遷移する
 * - 11.1: プロジェクト詳細画面に数量表セクションの下に内訳書セクションを配置する
 * - 11.2: 数量表セクションと同様のカードレイアウトを使用する
 * - 11.3: 数量表が存在する場合、新規作成ボタンを表示する
 * - 11.4: ユーザーが新規作成ボタンをクリックすると、システムは内訳書新規作成画面に遷移する
 * - 11.5: 一覧画面へのリンクを表示する
 */

import { Link } from 'react-router-dom';
import type { ItemizedStatementInfo } from '../../types/itemized-statement.types';
import type { QuantityTableInfo } from '../../types/quantity-table.types';

// ============================================================================
// 型定義
// ============================================================================

/**
 * ItemizedStatementSectionCardコンポーネントのProps
 */
export interface ItemizedStatementSectionCardProps {
  /** プロジェクトID */
  projectId: string;
  /** 内訳書の総数 */
  totalCount: number;
  /** 直近N件の内訳書 */
  latestStatements: ItemizedStatementInfo[];
  /** 利用可能な数量表一覧 */
  quantityTables: QuantityTableInfo[];
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
    fontSize: '13px',
    fontWeight: 500,
    textDecoration: 'none',
  } as React.CSSProperties,
  statementList: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '12px',
  } as React.CSSProperties,
  statementCard: {
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
  statementInfo: {
    flex: 1,
    minWidth: 0,
  } as React.CSSProperties,
  statementName: {
    fontSize: '14px',
    fontWeight: 500,
    color: '#1f2937',
    margin: 0,
    whiteSpace: 'nowrap' as const,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  } as React.CSSProperties,
  statementMeta: {
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
    border: 'none',
    cursor: 'pointer',
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
 * 内訳書アイコン（ドキュメントアイコン）
 */
function ItemizedStatementIcon() {
  return (
    <svg
      data-testid="itemized-statement-icon"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10 9 9 9 8 9" />
    </svg>
  );
}

/**
 * スケルトンローダー
 */
function StatementSkeleton() {
  return (
    <div style={styles.skeleton} data-testid="itemized-statement-section-skeleton">
      {[1, 2].map((index) => (
        <div key={index} style={styles.skeletonCard}>
          <div style={styles.skeletonIcon} />
          <div style={styles.skeletonContent}>
            <div style={{ ...styles.skeletonLine, width: '60%' }} />
            <div style={{ ...styles.skeletonLine, width: '80%' }} />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * 空状態表示
 *
 * Requirements:
 * - 1.8, 3.3: 数量表が存在しない場合「まず数量表を作成してください」メッセージを表示し新規作成ボタンを非表示
 * - 3.4: 数量表は存在するが内訳書が存在しない場合「内訳書はまだありません」メッセージを表示
 * - 11.3: 数量表が存在する場合、新規作成ボタンを表示
 * - 11.4: 新規作成ボタンクリックで内訳書新規作成画面に遷移
 */
function EmptyState({
  projectId,
  quantityTables,
}: {
  projectId: string;
  quantityTables: QuantityTableInfo[];
}) {
  const hasQuantityTables = quantityTables.length > 0;

  return (
    <div style={styles.emptyState}>
      {hasQuantityTables ? (
        <>
          <p style={styles.emptyText}>内訳書はまだありません</p>
          <Link
            to={`/projects/${projectId}/itemized-statements/new`}
            style={styles.createLink}
            aria-label="新規作成"
          >
            新規作成
          </Link>
        </>
      ) : (
        <>
          <p style={styles.emptyText}>まず数量表を作成してください</p>
          <Link
            to={`/projects/${projectId}/quantity-tables/new`}
            style={styles.createLink}
            aria-label="数量表を作成"
          >
            数量表を作成
          </Link>
        </>
      )}
    </div>
  );
}

/**
 * 内訳書カード
 */
function StatementCard({ statement }: { statement: ItemizedStatementInfo }) {
  return (
    <Link
      to={`/itemized-statements/${statement.id}`}
      style={styles.statementCard}
      aria-label={`${statement.name}の内訳書詳細を見る`}
    >
      <div style={styles.iconWrapper}>
        <ItemizedStatementIcon />
      </div>
      <div style={styles.statementInfo}>
        <h4 style={styles.statementName}>{statement.name}</h4>
        <p style={styles.statementMeta}>
          {formatDate(statement.createdAt)} / {statement.sourceQuantityTableName} /{' '}
          {statement.itemCount}項目
        </p>
      </div>
    </Link>
  );
}

// ============================================================================
// メインコンポーネント
// ============================================================================

/**
 * 内訳書セクションカード
 *
 * プロジェクト詳細画面で直近の内訳書と総数を表示する。
 * 数量表セクションカードと同様のレイアウトを使用してUIの一貫性を保つ。
 *
 * Task 18.1: 既存コンポーネントの表示ロジック更新
 * - 数量表有無に応じた条件分岐表示を実装
 * - 新規作成ボタンを内訳書新規作成画面へのLinkに変更
 *
 * @example
 * ```tsx
 * <ItemizedStatementSectionCard
 *   projectId="project-123"
 *   totalCount={5}
 *   latestStatements={statements}
 *   quantityTables={tables}
 *   isLoading={false}
 * />
 * ```
 */
export function ItemizedStatementSectionCard({
  projectId,
  totalCount,
  latestStatements,
  quantityTables,
  isLoading,
}: ItemizedStatementSectionCardProps) {
  const hasQuantityTables = quantityTables.length > 0;

  return (
    <section
      style={styles.section}
      role="region"
      aria-labelledby="itemized-statement-section-title"
      data-testid="itemized-statement-section"
    >
      <div style={styles.header}>
        <div style={styles.titleWrapper}>
          <h3 id="itemized-statement-section-title" style={styles.title}>
            内訳書
          </h3>
          {!isLoading && <span style={styles.count}>全{totalCount}件</span>}
        </div>
        {!isLoading && totalCount > 0 && (
          <div style={styles.headerActions}>
            {hasQuantityTables && (
              <Link
                to={`/projects/${projectId}/itemized-statements/new`}
                style={styles.addButton}
                aria-label="内訳書を新規作成"
              >
                新規作成
              </Link>
            )}
            <Link to={`/projects/${projectId}/itemized-statements`} style={styles.viewAllLink}>
              すべて見る
            </Link>
          </div>
        )}
      </div>

      {isLoading ? (
        <StatementSkeleton />
      ) : totalCount === 0 ? (
        <EmptyState projectId={projectId} quantityTables={quantityTables} />
      ) : (
        <div style={styles.statementList}>
          {latestStatements.map((statement) => (
            <StatementCard key={statement.id} statement={statement} />
          ))}
        </div>
      )}
    </section>
  );
}

export default ItemizedStatementSectionCard;
