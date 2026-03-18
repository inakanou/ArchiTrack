/**
 * @fileoverview 契約書一覧画面
 *
 * Task 4.1: ContractListPageの実装
 *
 * Requirements (contract-management):
 * - REQ-1.1: プロジェクトに紐付く契約書のリストを一覧画面に表示する
 * - REQ-1.2: 各契約書について契約種類（新規契約/変更契約）、契約日、ステータス（契約前/契約済）を一覧に表示する
 * - REQ-1.3: 一覧画面に新規作成ボタンを表示する
 * - REQ-1.4: ユーザーが新規作成ボタンを押した場合、契約書新規作成画面に遷移する
 * - REQ-1.5: ユーザーが一覧の契約書を選択した場合、選択した契約書の詳細画面に遷移する
 * - REQ-1.6: 一覧画面にパンくずナビゲーションを表示する
 * - REQ-13.5: contract:create権限がない場合、新規作成ボタンを非表示にする
 *
 * @module pages/ContractListPage
 */

import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getContracts } from '../api/contracts';
import type { ContractsResponse, ContractListItem } from '../api/contracts';
import { Breadcrumb } from '../components/common';
import { usePermission } from '../hooks/usePermission';

// ============================================================================
// 定数定義
// ============================================================================

/** デフォルトのページ番号 */
const DEFAULT_PAGE = 1;

/** デフォルトの表示件数 */
const DEFAULT_LIMIT = 20;

// ============================================================================
// ヘルパー関数
// ============================================================================

/**
 * 契約種類の表示名を取得する
 */
function getContractTypeLabel(contractType: ContractListItem['contractType']): string {
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
function getStatusLabel(status: ContractListItem['status']): string {
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
 * 契約日をフォーマットする
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
 * 金額をフォーマットする
 */
function formatAmount(amount: number): string {
  return new Intl.NumberFormat('ja-JP', {
    style: 'currency',
    currency: 'JPY',
    maximumFractionDigits: 0,
  }).format(amount);
}

// ============================================================================
// スタイル定義
// ============================================================================

const styles = {
  container: {
    maxWidth: '1024px',
    margin: '0 auto',
    padding: '32px 16px',
  } as React.CSSProperties,
  breadcrumbWrapper: {
    marginBottom: '16px',
  } as React.CSSProperties,
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '24px',
  } as React.CSSProperties,
  headerLeft: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '8px',
  } as React.CSSProperties,
  title: {
    fontSize: '24px',
    fontWeight: 'bold',
    color: '#1f2937',
    margin: 0,
  } as React.CSSProperties,
  subtitle: {
    fontSize: '14px',
    color: '#6b7280',
  } as React.CSSProperties,
  createButton: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    backgroundColor: '#2563eb',
    color: '#ffffff',
    padding: '10px 20px',
    borderRadius: '6px',
    textDecoration: 'none',
    fontSize: '14px',
    fontWeight: 500,
    transition: 'background-color 0.2s',
    border: 'none',
    cursor: 'pointer',
  } as React.CSSProperties,
  table: {
    width: '100%',
    borderCollapse: 'collapse' as const,
    backgroundColor: '#ffffff',
    borderRadius: '8px',
    overflow: 'hidden',
    border: '1px solid #e5e7eb',
  } as React.CSSProperties,
  th: {
    padding: '12px 16px',
    textAlign: 'left' as const,
    fontSize: '12px',
    fontWeight: 600,
    color: '#6b7280',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
    backgroundColor: '#f9fafb',
    borderBottom: '1px solid #e5e7eb',
  } as React.CSSProperties,
  td: {
    padding: '12px 16px',
    fontSize: '14px',
    color: '#1f2937',
    borderBottom: '1px solid #e5e7eb',
  } as React.CSSProperties,
  tableRow: {
    textDecoration: 'none',
    color: 'inherit',
    display: 'table-row',
  } as React.CSSProperties,
  statusBadge: {
    display: 'inline-block',
    padding: '2px 8px',
    borderRadius: '9999px',
    fontSize: '12px',
    fontWeight: 500,
  } as React.CSSProperties,
  statusBeforeContract: {
    backgroundColor: '#fef3c7',
    color: '#92400e',
  } as React.CSSProperties,
  statusContracted: {
    backgroundColor: '#d1fae5',
    color: '#065f46',
  } as React.CSSProperties,
  emptyState: {
    textAlign: 'center' as const,
    padding: '64px 24px',
    backgroundColor: '#ffffff',
    borderRadius: '8px',
    border: '1px solid #e5e7eb',
  } as React.CSSProperties,
  emptyText: {
    fontSize: '16px',
    color: '#6b7280',
    marginBottom: '16px',
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
    fontWeight: 500,
    borderRadius: '6px',
    cursor: 'pointer',
  } as React.CSSProperties,
};

// ============================================================================
// サブコンポーネント
// ============================================================================

/**
 * プラスアイコン
 */
function PlusIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

/**
 * 空状態表示
 */
function EmptyState({ projectId, canCreate }: { projectId: string; canCreate: boolean }) {
  return (
    <div style={styles.emptyState} data-testid="empty-state">
      <p style={styles.emptyText}>契約書はまだありません</p>
      {canCreate && (
        <Link to={`/projects/${projectId}/contracts/new`} style={styles.createButton}>
          <PlusIcon />
          新規作成
        </Link>
      )}
    </div>
  );
}

/**
 * ステータスバッジ
 */
function StatusBadge({ status }: { status: ContractListItem['status'] }) {
  const statusStyle =
    status === 'CONTRACTED' ? styles.statusContracted : styles.statusBeforeContract;

  return <span style={{ ...styles.statusBadge, ...statusStyle }}>{getStatusLabel(status)}</span>;
}

// ============================================================================
// メインコンポーネント
// ============================================================================

/**
 * 契約書一覧画面
 *
 * Requirements:
 * - REQ-1.1: プロジェクトに紐付く契約書のリストを一覧画面に表示する
 * - REQ-1.2: 各契約書について契約種類、契約日、ステータスを一覧に表示する
 * - REQ-1.3: 一覧画面に新規作成ボタンを表示する
 * - REQ-1.4: 新規作成ボタン押下時、契約書新規作成画面に遷移する
 * - REQ-1.5: 契約書選択時、詳細画面に遷移する
 * - REQ-1.6: パンくずナビゲーションを表示する
 */
export default function ContractListPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const { hasPermission } = usePermission();

  // 権限チェック (REQ-13.5)
  const canCreate = hasPermission('contract:create');

  // データ状態
  const [data, setData] = useState<ContractsResponse | null>(null);

  // UI状態
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /**
   * 契約書一覧を取得
   * Requirements: REQ-1.1
   */
  const fetchContracts = useCallback(async () => {
    if (!projectId) return;

    setIsLoading(true);
    setError(null);

    try {
      const result = await getContracts(projectId, {
        page: DEFAULT_PAGE,
        limit: DEFAULT_LIMIT,
      });
      setData(result);
    } catch {
      setError('契約書の取得に失敗しました');
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  // 初回読み込み
  useEffect(() => {
    fetchContracts();
  }, [fetchContracts]);

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
  if (error) {
    return (
      <main role="main" style={styles.container}>
        <div role="alert" style={styles.errorContainer}>
          <p style={styles.errorText}>{error}</p>
          <button type="button" onClick={fetchContracts} style={styles.retryButton}>
            再試行
          </button>
        </div>
      </main>
    );
  }

  const contracts = data?.contracts ?? [];
  const totalCount = data?.total ?? 0;

  return (
    <main role="main" style={styles.container} data-testid="contract-list-page">
      {/* パンくずナビゲーション (REQ-1.6) */}
      <div style={styles.breadcrumbWrapper}>
        <Breadcrumb
          items={[
            { label: 'ダッシュボード', path: '/' },
            { label: 'プロジェクト一覧', path: '/projects' },
            { label: 'プロジェクト', path: `/projects/${projectId}` },
            { label: '契約書一覧' },
          ]}
        />
      </div>

      {/* ヘッダー */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <h1 style={styles.title}>契約書一覧</h1>
          <p style={styles.subtitle}>全{totalCount}件</p>
        </div>
        {canCreate && (
          <Link
            to={`/projects/${projectId}/contracts/new`}
            style={styles.createButton}
            aria-label="契約書を新規作成"
          >
            <PlusIcon />
            新規作成
          </Link>
        )}
      </div>

      {/* 一覧 */}
      {totalCount === 0 ? (
        <EmptyState projectId={projectId!} canCreate={canCreate} />
      ) : (
        <table style={styles.table} data-testid="contract-list-table">
          <thead>
            <tr>
              <th style={styles.th}>契約種類</th>
              <th style={styles.th}>契約日</th>
              <th style={styles.th}>ステータス</th>
              <th style={styles.th}>請負代金額</th>
            </tr>
          </thead>
          <tbody>
            {contracts.map((contract) => (
              <tr key={contract.id} data-testid={`contract-row-${contract.id}`}>
                <td style={styles.td}>
                  <Link
                    to={`/projects/${projectId}/contracts/${contract.id}`}
                    style={styles.tableRow}
                  >
                    {getContractTypeLabel(contract.contractType)}
                  </Link>
                </td>
                <td style={styles.td}>
                  <Link
                    to={`/projects/${projectId}/contracts/${contract.id}`}
                    style={styles.tableRow}
                  >
                    {formatContractDate(contract.contractDate)}
                  </Link>
                </td>
                <td style={styles.td}>
                  <Link
                    to={`/projects/${projectId}/contracts/${contract.id}`}
                    style={styles.tableRow}
                  >
                    <StatusBadge status={contract.status} />
                  </Link>
                </td>
                <td style={styles.td}>
                  <Link
                    to={`/projects/${projectId}/contracts/${contract.id}`}
                    style={styles.tableRow}
                  >
                    {formatAmount(contract.contractAmount)}
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
