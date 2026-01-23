/**
 * @fileoverview 見積依頼セクションカードコンポーネント
 *
 * Task 5.1: EstimateRequestSectionCardコンポーネントを実装する
 *
 * Requirements:
 * - 1.1: プロジェクト詳細画面に見積依頼セクションを表示する
 * - 1.2: 見積依頼の総数とヘッダーを表示する
 * - 1.3: 直近の見積依頼カードを一覧表示する
 * - 1.4: 見積依頼一覧画面への遷移リンク
 * - 1.5: 見積依頼詳細画面への遷移リンク
 * - 2.1: 空状態表示（見積依頼がない場合）
 * - 2.2: 新規作成ボタン
 * - 2.4: 一覧に見積依頼の名前、宛先、見積依頼方法、参照内訳書名、作成日時を表示
 *
 * 表示要素:
 * - セクションタイトル「見積依頼」
 * - 総数表示（例: 全5件）
 * - 直近N件のカード形式表示
 *   - 見積依頼名
 *   - 取引先名
 *   - 見積依頼方法（メール/FAX）
 *   - 作成日
 * - 「すべて見る」リンク（一覧画面へ遷移）
 */

import { Link } from 'react-router-dom';
import type {
  EstimateRequestInfo,
  EstimateRequestMethod,
} from '../../types/estimate-request.types';

// ============================================================================
// 型定義
// ============================================================================

/**
 * EstimateRequestSectionCardコンポーネントのProps
 */
export interface EstimateRequestSectionCardProps {
  /** プロジェクトID */
  projectId: string;
  /** 見積依頼の総数 */
  totalCount: number;
  /** 直近N件の見積依頼 */
  latestRequests: EstimateRequestInfo[];
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
  requestList: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '12px',
  } as React.CSSProperties,
  requestCard: {
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
  requestInfo: {
    flex: 1,
    minWidth: 0,
  } as React.CSSProperties,
  requestName: {
    fontSize: '14px',
    fontWeight: 500,
    color: '#1f2937',
    margin: 0,
    whiteSpace: 'nowrap' as const,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  } as React.CSSProperties,
  requestMeta: {
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
 * 見積依頼方法を日本語ラベルに変換
 * @param method - 見積依頼方法（EMAIL/FAX）
 */
function formatMethod(method: EstimateRequestMethod): string {
  return method === 'EMAIL' ? 'メール' : 'FAX';
}

// ============================================================================
// サブコンポーネント
// ============================================================================

/**
 * 見積依頼アイコン（封筒アイコン）
 */
function EstimateRequestIcon() {
  return (
    <svg
      data-testid="estimate-request-icon"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
      <polyline points="22,6 12,13 2,6" />
    </svg>
  );
}

/**
 * スケルトンローダー
 */
function RequestSkeleton() {
  return (
    <div style={styles.skeleton} data-testid="estimate-request-section-skeleton">
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
      <p style={styles.emptyText}>見積依頼はまだありません</p>
      <Link to={`/projects/${projectId}/estimate-requests/new`} style={styles.createLink}>
        新規作成
      </Link>
    </div>
  );
}

/**
 * 見積依頼カード
 */
function RequestCard({ request }: { request: EstimateRequestInfo }) {
  return (
    <Link
      to={`/estimate-requests/${request.id}`}
      style={styles.requestCard}
      aria-label={`${request.name}の見積依頼詳細を見る`}
    >
      <div style={styles.iconWrapper}>
        <EstimateRequestIcon />
      </div>
      <div style={styles.requestInfo}>
        <h4 style={styles.requestName}>{request.name}</h4>
        <p style={styles.requestMeta}>
          {formatDate(request.createdAt)} / {request.tradingPartnerName} /{' '}
          {formatMethod(request.method)}
        </p>
      </div>
    </Link>
  );
}

// ============================================================================
// メインコンポーネント
// ============================================================================

/**
 * 見積依頼セクションカード
 *
 * プロジェクト詳細画面で直近の見積依頼と総数を表示する。
 *
 * @example
 * ```tsx
 * <EstimateRequestSectionCard
 *   projectId="project-123"
 *   totalCount={5}
 *   latestRequests={requests}
 *   isLoading={false}
 * />
 * ```
 */
export function EstimateRequestSectionCard({
  projectId,
  totalCount,
  latestRequests,
  isLoading,
}: EstimateRequestSectionCardProps) {
  return (
    <section
      style={styles.section}
      role="region"
      aria-labelledby="estimate-request-section-title"
      data-testid="estimate-request-section"
    >
      <div style={styles.header}>
        <div style={styles.titleWrapper}>
          <h3 id="estimate-request-section-title" style={styles.title}>
            見積依頼
          </h3>
          {!isLoading && <span style={styles.count}>全{totalCount}件</span>}
        </div>
        {!isLoading && totalCount > 0 && (
          <div style={styles.headerActions}>
            <Link
              to={`/projects/${projectId}/estimate-requests/new`}
              style={styles.addButton}
              aria-label="見積依頼を新規作成"
            >
              新規作成
            </Link>
            <Link to={`/projects/${projectId}/estimate-requests`} style={styles.viewAllLink}>
              すべて見る
            </Link>
          </div>
        )}
      </div>

      {isLoading ? (
        <RequestSkeleton />
      ) : totalCount === 0 ? (
        <EmptyState projectId={projectId} />
      ) : (
        <div style={styles.requestList}>
          {latestRequests.map((request) => (
            <RequestCard key={request.id} request={request} />
          ))}
        </div>
      )}
    </section>
  );
}

export default EstimateRequestSectionCard;
