/**
 * @fileoverview 実行予算セクションカードコンポーネント
 *
 * Task 8.1: 実行予算の作成・表示・削除UI実装
 *
 * Requirements:
 * - REQ-1.1: プロジェクト詳細画面で実行予算セクションを表示する
 * - REQ-1.2: 実行予算の新規作成操作を行う
 * - REQ-1.5: プロジェクトに対して実行予算を1つだけ作成可能とする
 * - REQ-1.6: 既存の実行予算が存在する場合は作成ボタンを非活性にし、メッセージを表示する
 * - REQ-1.7: 実行予算に紐づく契約書名、契約金額、作成日時を表示する
 * - REQ-2.1: 削除確認ダイアログを表示する
 * - REQ-2.2: 実行予算を論理削除する
 * - REQ-2.3: 発注済みの発注が存在する場合のエラー表示
 *
 * 表示要素:
 * - セクションタイトル「実行予算」
 * - 実行予算が未作成時: 作成ボタン
 * - 実行予算が存在時: 契約書名、契約金額、作成日時、利益見込額、発注進捗率
 * - 「詳細を見る」リンク（実行予算ページへ遷移）
 */

import { Link } from 'react-router-dom';

// ============================================================================
// 型定義
// ============================================================================

/**
 * 実行予算セクション表示用のサマリー情報
 */
export interface ExecutionBudgetSectionInfo {
  id: string;
  contractName: string;
  contractAmount: number;
  createdAt: string;
  executionAmountTotal: string;
  profitForecast: string;
  orderProgressRate: string;
}

/**
 * ExecutionBudgetSectionCardコンポーネントのProps
 */
export interface ExecutionBudgetSectionCardProps {
  /** プロジェクトID */
  projectId: string;
  /** 実行予算のサマリー情報（存在しない場合はnull） */
  budgetInfo: ExecutionBudgetSectionInfo | null;
  /** ローディング状態 */
  isLoading: boolean;
}

// ============================================================================
// スタイル定義（ContractSectionCardと同様のスタイル）
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
  viewLink: {
    fontSize: '14px',
    color: '#2563eb',
    textDecoration: 'none',
    fontWeight: 500,
  } as React.CSSProperties,
  addButton: {
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
  infoGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: '16px',
  } as React.CSSProperties,
  infoItem: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '4px',
  } as React.CSSProperties,
  infoLabel: {
    fontSize: '12px',
    color: '#6b7280',
    fontWeight: 500,
  } as React.CSSProperties,
  infoValue: {
    fontSize: '14px',
    color: '#1f2937',
    fontWeight: 600,
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
 * 金額を3桁区切りカンマ付き整数形式でフォーマットする
 */
function formatAmount(amount: number | string): string {
  const num = typeof amount === 'string' ? parseInt(amount, 10) : amount;
  if (isNaN(num)) return '0';
  return num.toLocaleString('ja-JP') + '円';
}

/**
 * 日時を日本語形式でフォーマットする
 */
function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

// ============================================================================
// サブコンポーネント
// ============================================================================

/**
 * スケルトンローダー
 */
function ExecutionBudgetSkeleton() {
  return (
    <div style={styles.skeleton} data-testid="execution-budget-section-skeleton">
      {[1, 2].map((index) => (
        <div key={index} style={styles.skeletonCard}>
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
      <p style={styles.emptyText}>実行予算はまだありません</p>
      <Link to={`/projects/${projectId}/execution-budget`} style={styles.addButton}>
        新規作成
      </Link>
    </div>
  );
}

/**
 * 実行予算情報表示
 */
function BudgetInfo({ projectId, info }: { projectId: string; info: ExecutionBudgetSectionInfo }) {
  return (
    <div>
      <div style={styles.infoGrid}>
        <div style={styles.infoItem}>
          <span style={styles.infoLabel}>契約書</span>
          <span style={styles.infoValue}>{info.contractName}</span>
        </div>
        <div style={styles.infoItem}>
          <span style={styles.infoLabel}>契約金額</span>
          <span style={styles.infoValue}>{formatAmount(info.contractAmount)}</span>
        </div>
        <div style={styles.infoItem}>
          <span style={styles.infoLabel}>作成日時</span>
          <span style={styles.infoValue}>{formatDate(info.createdAt)}</span>
        </div>
        <div style={styles.infoItem}>
          <span style={styles.infoLabel}>利益見込額</span>
          <span style={styles.infoValue}>{formatAmount(info.profitForecast)}</span>
        </div>
        <div style={styles.infoItem}>
          <span style={styles.infoLabel}>実行金額合計</span>
          <span style={styles.infoValue}>{formatAmount(info.executionAmountTotal)}</span>
        </div>
        <div style={styles.infoItem}>
          <span style={styles.infoLabel}>発注進捗率</span>
          <span style={styles.infoValue}>{info.orderProgressRate}%</span>
        </div>
      </div>
      <div style={{ marginTop: '16px', textAlign: 'right' as const }}>
        <Link to={`/projects/${projectId}/execution-budget`} style={styles.viewLink}>
          詳細を見る
        </Link>
      </div>
    </div>
  );
}

// ============================================================================
// メインコンポーネント
// ============================================================================

/**
 * 実行予算セクションカード
 *
 * プロジェクト詳細画面で実行予算のサマリー情報を表示する。
 * ContractSectionCardと同様のスタイル・パターンを踏襲。
 */
export function ExecutionBudgetSectionCard({
  projectId,
  budgetInfo,
  isLoading,
}: ExecutionBudgetSectionCardProps) {
  return (
    <section
      style={styles.section}
      role="region"
      aria-labelledby="execution-budget-section-title"
      data-testid="execution-budget-section"
    >
      <div style={styles.header}>
        <div style={styles.titleWrapper}>
          <h3 id="execution-budget-section-title" style={styles.title}>
            実行予算
          </h3>
        </div>
      </div>

      {isLoading ? (
        <ExecutionBudgetSkeleton />
      ) : budgetInfo === null ? (
        <EmptyState projectId={projectId} />
      ) : (
        <BudgetInfo projectId={projectId} info={budgetInfo} />
      )}
    </section>
  );
}

export default ExecutionBudgetSectionCard;
