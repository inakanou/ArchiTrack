/**
 * @fileoverview 見積書セクションカードコンポーネント
 *
 * Task 19.1: EstimateSectionCardコンポーネントを実装する
 *
 * Requirements:
 * - 16.1: プロジェクト詳細画面の見積依頼セクションの下に見積書セクションを表示する
 * - 16.2: 見積書セクションにセクションタイトル「見積書」を表示する
 * - 16.3: 見積書セクションに見積書の総数を表示する（例：全5件）
 * - 16.4: 見積書セクションに直近の見積書をカード形式で表示する
 * - 16.5: 見積書カードに見積書名、作成日時、合計金額を表示する
 * - 16.6: 見積書カードをクリックすると見積書画面へ遷移する
 * - 16.7: 見積書セクションに「すべて見る」リンクを表示する
 * - 16.8: 「すべて見る」リンクをクリックすると見積書一覧画面へ遷移する
 * - 16.9: 見積書セクションに新規作成ボタンを表示する
 * - 16.10: 新規作成ボタンをクリックすると見積書作成画面へ遷移する
 * - 16.11: 見積書が存在しない場合、空状態を表示する（メッセージと新規作成ボタン）
 * - 16.12: 見積書セクションのローディング中にスケルトンローダーを表示する
 * - 16.13: 見積書セクションは既存の見積依頼セクションと同様のスタイルを使用する
 *
 * 表示要素:
 * - セクションタイトル「見積書」
 * - 総数表示（例: 全5件）
 * - 直近N件のカード形式表示
 *   - 見積書名
 *   - 作成日時
 *   - 合計金額
 * - 「すべて見る」リンク（一覧画面へ遷移）
 * - 新規作成ボタン（作成画面へ遷移）
 */

import { Link } from 'react-router-dom';
import type { EstimateInfo } from '../../api/estimates';

// ============================================================================
// 型定義
// ============================================================================

/**
 * EstimateSectionCardコンポーネントのProps
 */
export interface EstimateSectionCardProps {
  /** プロジェクトID */
  projectId: string;
  /** 見積書の総数 */
  totalCount: number;
  /** 直近N件の見積書 */
  latestEstimates: EstimateInfo[];
  /** ローディング状態 */
  isLoading: boolean;
}

// ============================================================================
// スタイル定義（EstimateRequestSectionCardと同様のスタイル）
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
  estimateList: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '12px',
  } as React.CSSProperties,
  estimateCard: {
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
  estimateInfo: {
    flex: 1,
    minWidth: 0,
  } as React.CSSProperties,
  estimateName: {
    fontSize: '14px',
    fontWeight: 500,
    color: '#1f2937',
    margin: 0,
    whiteSpace: 'nowrap' as const,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  } as React.CSSProperties,
  estimateMeta: {
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

/**
 * 金額を日本語形式でフォーマット
 * @param amount - 金額文字列（Decimal形式）
 */
function formatAmount(amount: string | null | undefined): string | null {
  if (!amount) return null;
  const num = parseFloat(amount);
  if (isNaN(num)) return null;
  return num.toLocaleString('ja-JP') + '円';
}

// ============================================================================
// サブコンポーネント
// ============================================================================

/**
 * 見積書アイコン（ドキュメントアイコン）
 *
 * Note: 封筒アイコンではなく、ドキュメントアイコンを使用する（見積依頼と区別）
 */
function EstimateIcon() {
  return (
    <svg
      data-testid="estimate-icon"
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
function EstimateSkeleton() {
  return (
    <div style={styles.skeleton} data-testid="estimate-section-skeleton">
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
      <p style={styles.emptyText}>見積書はまだありません</p>
      <Link to={`/projects/${projectId}/estimates/new`} style={styles.createLink}>
        新規作成
      </Link>
    </div>
  );
}

/**
 * 見積書カード
 */
function EstimateCard({ estimate }: { estimate: EstimateInfo }) {
  const formattedAmount = formatAmount(estimate.totalAmount);

  return (
    <Link
      to={`/estimates/${estimate.id}`}
      style={styles.estimateCard}
      aria-label={`${estimate.name}の見積書詳細を見る`}
      data-testid={`estimate-card-${estimate.id}`}
    >
      <div style={styles.iconWrapper}>
        <EstimateIcon />
      </div>
      <div style={styles.estimateInfo}>
        <h4 style={styles.estimateName}>{estimate.name}</h4>
        <p style={styles.estimateMeta}>
          {formatDate(estimate.createdAt)}
          {formattedAmount && ` / ${formattedAmount}`}
        </p>
      </div>
    </Link>
  );
}

// ============================================================================
// メインコンポーネント
// ============================================================================

/**
 * 見積書セクションカード
 *
 * プロジェクト詳細画面で直近の見積書と総数を表示する。
 * EstimateRequestSectionCardと同様のスタイル・パターンを踏襲。
 *
 * @example
 * ```tsx
 * <EstimateSectionCard
 *   projectId="project-123"
 *   totalCount={5}
 *   latestEstimates={estimates}
 *   isLoading={false}
 * />
 * ```
 */
export function EstimateSectionCard({
  projectId,
  totalCount,
  latestEstimates,
  isLoading,
}: EstimateSectionCardProps) {
  return (
    <section
      style={styles.section}
      role="region"
      aria-labelledby="estimate-section-title"
      data-testid="estimate-section"
    >
      <div style={styles.header}>
        <div style={styles.titleWrapper}>
          <h3 id="estimate-section-title" style={styles.title}>
            見積書
          </h3>
          {!isLoading && <span style={styles.count}>全{totalCount}件</span>}
        </div>
        {!isLoading && totalCount > 0 && (
          <div style={styles.headerActions}>
            <Link
              to={`/projects/${projectId}/estimates/new`}
              style={styles.addButton}
              aria-label="見積書を新規作成"
            >
              新規作成
            </Link>
            <Link to={`/projects/${projectId}/estimates`} style={styles.viewAllLink}>
              すべて見る
            </Link>
          </div>
        )}
      </div>

      {isLoading ? (
        <EstimateSkeleton />
      ) : totalCount === 0 ? (
        <EmptyState projectId={projectId} />
      ) : (
        <div style={styles.estimateList}>
          {latestEstimates.map((estimate) => (
            <EstimateCard key={estimate.id} estimate={estimate} />
          ))}
        </div>
      )}
    </section>
  );
}

export default EstimateSectionCard;
