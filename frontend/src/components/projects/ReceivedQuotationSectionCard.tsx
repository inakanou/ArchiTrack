/**
 * @fileoverview 受領見積書セクションカード
 *
 * Task 77.3: 受領見積書セクションの部品
 *
 * Requirements (project-management):
 * - 42.3: 見出し「受領見積書」
 * - 42.4: 総数（全N件）
 * - 42.5, 42.6: 直近の受領見積書のカード（受領見積書名・業者名・提出日・NET金額）
 * - 42.7, 42.8, 42.9: カードと「すべて見る」で案件の受領見積書の一覧へ移る
 * - 42.10, 42.11: 登録の権限があるときだけ「新規登録」を出し、登録フォームを開く状態を付けて一覧へ移る
 * - 42.12: 空のときは「受領見積書はまだありません」
 * - 42.13: ロード中は骨組み
 * - 42.14: 工程表セクションと同じ形
 *
 * 新規登録の権限は親が hasPermission('estimate_request:update') で渡す（design D1）。
 */

import { Link } from 'react-router-dom';
import type { ReceivedQuotationSectionItem } from '../../api/projects';

export type { ReceivedQuotationSectionItem };

// ============================================================================
// 型定義
// ============================================================================

/** 一覧の画面で登録フォームを開くための遷移の状態 */
export interface ReceivedQuotationListNavigationState {
  openRegisterForm: true;
}

/**
 * ReceivedQuotationSectionCard の Props
 */
export interface ReceivedQuotationSectionCardProps {
  /** プロジェクトID */
  projectId: string;
  /** 受領見積書の総数 */
  totalCount: number;
  /** 直近の受領見積書（登録日時の新しい順） */
  latestReceivedQuotations: ReceivedQuotationSectionItem[];
  /** ロード中か */
  isLoading: boolean;
  /** 新規登録を出すか（estimate_request:update） */
  canRegister: boolean;
}

// ============================================================================
// スタイル定義（ScheduleSectionCard と同じ）
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
  list: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '12px',
  } as React.CSSProperties,
  card: {
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
  info: {
    flex: 1,
    minWidth: 0,
  } as React.CSSProperties,
  name: {
    fontSize: '14px',
    fontWeight: 500,
    color: '#1f2937',
    margin: 0,
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  } as React.CSSProperties,
  meta: {
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
// ヘルパー関数（受領見積書の一覧画面と同じ形）
// ============================================================================

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

/** 提出日（YYYY/MM/DD） */
function formatDate(dateString: string): string {
  const d = new Date(dateString);
  return `${d.getFullYear()}/${pad2(d.getMonth() + 1)}/${pad2(d.getDate())}`;
}

/** NET金額（未入力は「-」） */
function formatNetAmount(amount: number | null): string {
  return amount === null ? '-' : `${amount.toLocaleString('ja-JP')}円`;
}

function listPath(projectId: string): string {
  return `/projects/${projectId}/quotations`;
}

const REGISTER_STATE: ReceivedQuotationListNavigationState = { openRegisterForm: true };

// ============================================================================
// サブコンポーネント
// ============================================================================

/** 受領見積書のアイコン（書類） */
function ReceivedQuotationIcon() {
  return (
    <svg
      data-testid="received-quotation-icon"
      aria-hidden="true"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
      <polyline points="14 3 14 9 20 9" />
      <line x1="8" y1="13" x2="16" y2="13" />
      <line x1="8" y1="17" x2="13" y2="17" />
    </svg>
  );
}

/** 骨組み */
function ReceivedQuotationSkeleton() {
  return (
    <div style={styles.skeleton} data-testid="received-quotation-section-skeleton">
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

/** 新規登録のリンク */
function RegisterLink({ projectId, style }: { projectId: string; style: React.CSSProperties }) {
  return (
    <Link
      to={listPath(projectId)}
      state={REGISTER_STATE}
      style={style}
      aria-label="受領見積書を新規登録"
    >
      新規登録
    </Link>
  );
}

/** 空の表示 */
function EmptyState({ projectId, canRegister }: { projectId: string; canRegister: boolean }) {
  return (
    <div style={styles.emptyState}>
      <p style={styles.emptyText}>受領見積書はまだありません</p>
      {canRegister && <RegisterLink projectId={projectId} style={styles.createLink} />}
    </div>
  );
}

/** 受領見積書のカード */
function ReceivedQuotationCard({
  projectId,
  quotation,
}: {
  projectId: string;
  quotation: ReceivedQuotationSectionItem;
}) {
  return (
    <Link
      to={listPath(projectId)}
      style={styles.card}
      data-testid={`received-quotation-card-${quotation.id}`}
    >
      <div style={styles.iconWrapper}>
        <ReceivedQuotationIcon />
      </div>
      <div style={styles.info}>
        <h4 style={styles.name}>{quotation.name}</h4>
        <p style={styles.meta}>
          <span>{quotation.vendorName}</span> /{' '}
          <span>提出日 {formatDate(quotation.submittedAt)}</span> /{' '}
          <span>NET {formatNetAmount(quotation.netAmount)}</span>
        </p>
      </div>
    </Link>
  );
}

// ============================================================================
// メインコンポーネント
// ============================================================================

/**
 * 受領見積書セクションカード
 *
 * プロジェクト詳細画面で受領見積書の総数と直近を出し、案件の受領見積書の一覧へ導く。
 */
export function ReceivedQuotationSectionCard({
  projectId,
  totalCount,
  latestReceivedQuotations,
  isLoading,
  canRegister,
}: ReceivedQuotationSectionCardProps) {
  return (
    <section
      style={styles.section}
      role="region"
      aria-labelledby="received-quotation-section-title"
      aria-busy={isLoading}
      data-testid="received-quotation-section"
    >
      <div style={styles.header}>
        <div style={styles.titleWrapper}>
          <h3 id="received-quotation-section-title" style={styles.title}>
            受領見積書
          </h3>
          {!isLoading && <span style={styles.count}>全{totalCount}件</span>}
        </div>
        {!isLoading && totalCount > 0 && (
          <div style={styles.headerActions}>
            {canRegister && <RegisterLink projectId={projectId} style={styles.addButton} />}
            <Link to={listPath(projectId)} style={styles.viewAllLink}>
              すべて見る
            </Link>
          </div>
        )}
      </div>

      {isLoading ? (
        <ReceivedQuotationSkeleton />
      ) : totalCount === 0 ? (
        <EmptyState projectId={projectId} canRegister={canRegister} />
      ) : (
        <div style={styles.list}>
          {latestReceivedQuotations.map((quotation) => (
            <ReceivedQuotationCard key={quotation.id} projectId={projectId} quotation={quotation} />
          ))}
        </div>
      )}
    </section>
  );
}

export default ReceivedQuotationSectionCard;
