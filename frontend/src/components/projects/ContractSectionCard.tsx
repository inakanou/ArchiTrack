/**
 * @fileoverview 契約書セクションカードコンポーネント
 *
 * Task 9.1: プロジェクト詳細画面から契約書一覧への導線を追加する
 *
 * Requirements (contract-management):
 * - REQ-1.4: ユーザーが新規作成ボタンを押した場合、契約書新規作成画面に遷移する
 * - REQ-1.5: ユーザーが一覧の契約書を選択した場合、選択した契約書の詳細画面に遷移する
 *
 * 表示要素:
 * - セクションタイトル「契約書」
 * - 総数表示（例: 全5件）
 * - 直近N件のカード形式表示
 *   - 契約種類（新規契約/変更契約）
 *   - 契約日
 *   - ステータス（契約前/契約済）
 *   - 請負代金額
 * - 「すべて見る」リンク（一覧画面へ遷移）
 * - 新規作成ボタン（作成画面へ遷移）
 */

import { Link } from 'react-router-dom';
import type { ContractType, ContractStatus } from '../../api/contracts';

// ============================================================================
// 型定義
// ============================================================================

/**
 * 契約書セクション表示用のサマリー情報
 */
export interface ContractSectionItem {
  id: string;
  contractType: ContractType;
  contractDate: string;
  status: ContractStatus;
  contractAmount: number;
  createdAt: string;
}

/**
 * ContractSectionCardコンポーネントのProps
 */
export interface ContractSectionCardProps {
  /** プロジェクトID */
  projectId: string;
  /** 契約書の総数 */
  totalCount: number;
  /** 直近N件の契約書 */
  latestContracts: ContractSectionItem[];
  /** ローディング状態 */
  isLoading: boolean;
}

// ============================================================================
// スタイル定義（EstimateSectionCardと同様のスタイル）
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
  contractList: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '12px',
  } as React.CSSProperties,
  contractCard: {
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
  contractInfo: {
    flex: 1,
    minWidth: 0,
  } as React.CSSProperties,
  contractName: {
    fontSize: '14px',
    fontWeight: 500,
    color: '#1f2937',
    margin: 0,
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  } as React.CSSProperties,
  contractMeta: {
    fontSize: '12px',
    color: '#6b7280',
    marginTop: '4px',
  } as React.CSSProperties,
  statusBadge: {
    fontSize: '11px',
    padding: '1px 6px',
    borderRadius: '4px',
    fontWeight: 500,
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
 * 契約種類の表示名を取得する
 */
function getContractTypeLabel(contractType: ContractType): string {
  switch (contractType) {
    case 'NEW':
      return '新規契約';
    case 'AMENDMENT':
      return '変更契約';
    default:
      return contractType;
  }
}

/**
 * 契約ステータスの表示名を取得する
 */
function getStatusLabel(status: ContractStatus): string {
  switch (status) {
    case 'BEFORE_CONTRACT':
      return '契約前';
    case 'CONTRACTED':
      return '契約済';
    default:
      return status;
  }
}

/**
 * ステータスバッジのスタイルを取得する
 */
function getStatusBadgeStyle(status: ContractStatus): React.CSSProperties {
  const baseStyle = { ...styles.statusBadge };
  switch (status) {
    case 'BEFORE_CONTRACT':
      return {
        ...baseStyle,
        backgroundColor: '#fef3c7',
        color: '#92400e',
      };
    case 'CONTRACTED':
      return {
        ...baseStyle,
        backgroundColor: '#d1fae5',
        color: '#065f46',
      };
    default:
      return baseStyle;
  }
}

/**
 * 契約日を日本語形式でフォーマットする
 */
function formatContractDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/**
 * 金額を日本語形式でフォーマットする
 */
function formatAmount(amount: number): string {
  return amount.toLocaleString('ja-JP') + '円';
}

// ============================================================================
// サブコンポーネント
// ============================================================================

/**
 * 契約書アイコン
 */
function ContractIcon() {
  return (
    <svg
      data-testid="contract-icon"
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
      <line x1="10" y1="9" x2="8" y2="9" />
    </svg>
  );
}

/**
 * スケルトンローダー
 */
function ContractSkeleton() {
  return (
    <div style={styles.skeleton} data-testid="contract-section-skeleton">
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
      <p style={styles.emptyText}>契約書はまだありません</p>
      <Link to={`/projects/${projectId}/contracts/new`} style={styles.createLink}>
        新規作成
      </Link>
    </div>
  );
}

/**
 * 契約書カード
 */
function ContractCard({
  contract,
  projectId,
}: {
  contract: ContractSectionItem;
  projectId: string;
}) {
  return (
    <Link
      to={`/projects/${projectId}/contracts/${contract.id}`}
      style={styles.contractCard}
      data-testid={`contract-card-${contract.id}`}
    >
      <div style={styles.iconWrapper}>
        <ContractIcon />
      </div>
      <div style={styles.contractInfo}>
        <h4 style={styles.contractName}>
          {getContractTypeLabel(contract.contractType)}
          <span style={getStatusBadgeStyle(contract.status)}>
            {getStatusLabel(contract.status)}
          </span>
        </h4>
        <p style={styles.contractMeta}>
          {formatContractDate(contract.contractDate)} / {formatAmount(contract.contractAmount)}
        </p>
      </div>
    </Link>
  );
}

// ============================================================================
// メインコンポーネント
// ============================================================================

/**
 * 契約書セクションカード
 *
 * プロジェクト詳細画面で直近の契約書と総数を表示する。
 * EstimateSectionCardと同様のスタイル・パターンを踏襲。
 *
 * @example
 * ```tsx
 * <ContractSectionCard
 *   projectId="project-123"
 *   totalCount={5}
 *   latestContracts={contracts}
 *   isLoading={false}
 * />
 * ```
 */
export function ContractSectionCard({
  projectId,
  totalCount,
  latestContracts,
  isLoading,
}: ContractSectionCardProps) {
  return (
    <section
      style={styles.section}
      role="region"
      aria-labelledby="contract-section-title"
      data-testid="contract-section"
    >
      <div style={styles.header}>
        <div style={styles.titleWrapper}>
          <h3 id="contract-section-title" style={styles.title}>
            契約書
          </h3>
          {!isLoading && <span style={styles.count}>全{totalCount}件</span>}
        </div>
        {!isLoading && totalCount > 0 && (
          <div style={styles.headerActions}>
            <Link
              to={`/projects/${projectId}/contracts/new`}
              style={styles.addButton}
              aria-label="契約書を新規作成"
            >
              新規作成
            </Link>
            <Link to={`/projects/${projectId}/contracts`} style={styles.viewAllLink}>
              すべて見る
            </Link>
          </div>
        )}
      </div>

      {isLoading ? (
        <ContractSkeleton />
      ) : totalCount === 0 ? (
        <EmptyState projectId={projectId} />
      ) : (
        <div style={styles.contractList}>
          {latestContracts.map((contract) => (
            <ContractCard key={contract.id} contract={contract} projectId={projectId} />
          ))}
        </div>
      )}
    </section>
  );
}

export default ContractSectionCard;
