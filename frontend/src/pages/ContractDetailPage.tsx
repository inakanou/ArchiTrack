/**
 * @fileoverview 契約書詳細画面
 *
 * Task 7.1: ContractDetailPageの実装
 *
 * Requirements (contract-management):
 * - REQ-8.1: 契約書詳細画面に新規作成時に入力した全項目と自動表示項目を表示する
 * - REQ-8.2: ステータス遷移ボタン（「契約前」→「契約済」）を提供する
 * - REQ-8.3: ステータスの双方向遷移（「契約前」⇔「契約済」）
 * - REQ-8.4: 基となった見積書へのリンクを表示する
 * - REQ-8.5: 変更契約の場合、基となった他の契約書へのリンクを表示する
 * - REQ-8.6: 編集ボタンを提供する
 * - REQ-8.7: 編集ボタン押下時、契約書編集画面に遷移する
 * - REQ-8.8: パンくずナビゲーションを表示する
 *
 * @module pages/ContractDetailPage
 */

import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getContractDetail, updateContractStatus } from '../api/contracts';
import type { ContractDetail } from '../api/contracts';
import { Breadcrumb } from '../components/common';

// ============================================================================
// ヘルパー関数
// ============================================================================

/**
 * 契約種類の表示名を取得する
 */
function getContractTypeLabel(contractType: ContractDetail['contractType']): string {
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
function getStatusLabel(status: ContractDetail['status']): string {
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
 * 日付をフォーマットする（年月日のみ）
 */
function formatDate(dateString: string): string {
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

/**
 * 消費税率をパーセント表示にする
 */
function formatTaxRate(rate: number): string {
  return `${Math.round(rate * 100)}%`;
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
    alignItems: 'flex-start',
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
  headerRight: {
    display: 'flex',
    gap: '8px',
    alignItems: 'center',
  } as React.CSSProperties,
  editLink: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    padding: '8px 16px',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: 500,
    backgroundColor: '#2563eb',
    color: '#ffffff',
    textDecoration: 'none',
    cursor: 'pointer',
    border: 'none',
  } as React.CSSProperties,
  statusButton: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    padding: '8px 16px',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: 500,
    cursor: 'pointer',
    border: 'none',
  } as React.CSSProperties,
  statusButtonContract: {
    backgroundColor: '#10b981',
    color: '#ffffff',
  } as React.CSSProperties,
  statusButtonRevert: {
    backgroundColor: '#f59e0b',
    color: '#ffffff',
  } as React.CSSProperties,
  content: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '24px',
  } as React.CSSProperties,
  card: {
    backgroundColor: '#ffffff',
    borderRadius: '8px',
    border: '1px solid #e5e7eb',
    padding: '24px',
  } as React.CSSProperties,
  sectionTitle: {
    fontSize: '18px',
    fontWeight: 600,
    color: '#1f2937',
    margin: 0,
    marginBottom: '16px',
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
    fontWeight: 500,
    color: '#6b7280',
  } as React.CSSProperties,
  infoValue: {
    fontSize: '14px',
    color: '#1f2937',
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
  linkStyle: {
    color: '#2563eb',
    textDecoration: 'underline',
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
  infoItemFull: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '4px',
    gridColumn: 'span 2',
  } as React.CSSProperties,
};

// ============================================================================
// サブコンポーネント
// ============================================================================

/**
 * ステータスバッジ
 */
function StatusBadge({ status }: { status: ContractDetail['status'] }) {
  const statusStyle =
    status === 'CONTRACTED' ? styles.statusContracted : styles.statusBeforeContract;

  return <span style={{ ...styles.statusBadge, ...statusStyle }}>{getStatusLabel(status)}</span>;
}

// ============================================================================
// メインコンポーネント
// ============================================================================

/**
 * 契約書詳細画面
 *
 * Requirements:
 * - REQ-8.1: 契約書の全項目を表示
 * - REQ-8.2: ステータス遷移ボタン
 * - REQ-8.3: ステータスの双方向遷移
 * - REQ-8.4: 見積書へのリンク
 * - REQ-8.5: 基契約書へのリンク（変更契約の場合）
 * - REQ-8.6: 編集ボタン
 * - REQ-8.7: 編集画面への遷移
 * - REQ-8.8: パンくずナビゲーション
 */
export default function ContractDetailPage() {
  const { projectId, contractId } = useParams<{ projectId: string; contractId: string }>();

  // データ状態
  const [contract, setContract] = useState<ContractDetail | null>(null);

  // UI状態
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);

  /**
   * 契約書詳細を取得
   */
  const fetchContract = useCallback(async () => {
    if (!contractId) return;

    setIsLoading(true);
    setError(null);

    try {
      const data = await getContractDetail(contractId);
      setContract(data);
    } catch {
      setError('契約書の取得に失敗しました');
    } finally {
      setIsLoading(false);
    }
  }, [contractId]);

  // 初回読み込み
  useEffect(() => {
    fetchContract();
  }, [fetchContract]);

  /**
   * ステータス遷移処理
   * REQ-8.2, REQ-8.3: 双方向ステータス遷移
   */
  const handleStatusChange = useCallback(async () => {
    if (!contract || !contractId) return;

    const newStatus = contract.status === 'BEFORE_CONTRACT' ? 'CONTRACTED' : 'BEFORE_CONTRACT';

    setIsUpdatingStatus(true);
    try {
      const updated = await updateContractStatus(contractId, newStatus);
      setContract(updated);
    } catch {
      setError('ステータスの更新に失敗しました');
    } finally {
      setIsUpdatingStatus(false);
    }
  }, [contract, contractId]);

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
  if (error || !contract) {
    return (
      <main role="main" style={styles.container}>
        <div role="alert" style={styles.errorContainer}>
          <p style={styles.errorText}>{error || '契約書が見つかりません'}</p>
          <button type="button" onClick={fetchContract} style={styles.retryButton}>
            再試行
          </button>
        </div>
      </main>
    );
  }

  return (
    <main role="main" style={styles.container} data-testid="contract-detail-page">
      {/* パンくずナビゲーション (REQ-8.8) */}
      <div style={styles.breadcrumbWrapper}>
        <Breadcrumb
          items={[
            { label: 'ダッシュボード', path: '/' },
            { label: 'プロジェクト一覧', path: '/projects' },
            { label: 'プロジェクト', path: `/projects/${projectId}` },
            { label: '契約書一覧', path: `/projects/${projectId}/contracts` },
            { label: '契約書詳細' },
          ]}
        />
      </div>

      {/* ヘッダー */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <h1 style={styles.title}>契約書詳細</h1>
        </div>
        <div style={styles.headerRight}>
          {/* ステータス遷移ボタン (REQ-8.2, REQ-8.3) */}
          <button
            type="button"
            onClick={handleStatusChange}
            disabled={isUpdatingStatus}
            style={{
              ...styles.statusButton,
              ...(contract.status === 'BEFORE_CONTRACT'
                ? styles.statusButtonContract
                : styles.statusButtonRevert),
            }}
          >
            {isUpdatingStatus
              ? '更新中...'
              : contract.status === 'BEFORE_CONTRACT'
                ? '契約済にする'
                : '契約前に戻す'}
          </button>

          {/* 編集ボタン (REQ-8.6, REQ-8.7) */}
          <Link
            to={`/projects/${projectId}/contracts/${contractId}/edit`}
            style={styles.editLink}
            aria-label="編集"
          >
            編集
          </Link>
        </div>
      </div>

      {/* コンテンツ */}
      <div style={styles.content}>
        {/* 基本情報 */}
        <div style={styles.card}>
          <h2 style={styles.sectionTitle}>基本情報</h2>
          <div style={styles.infoGrid}>
            <div style={styles.infoItem}>
              <span style={styles.infoLabel}>契約種類</span>
              <span style={styles.infoValue}>{getContractTypeLabel(contract.contractType)}</span>
            </div>
            <div style={styles.infoItem}>
              <span style={styles.infoLabel}>ステータス</span>
              <span style={styles.infoValue}>
                <StatusBadge status={contract.status} />
              </span>
            </div>
            <div style={styles.infoItem}>
              <span style={styles.infoLabel}>契約日</span>
              <span style={styles.infoValue}>{formatDate(contract.contractDate)}</span>
            </div>
            <div style={styles.infoItem}>
              <span style={styles.infoLabel}>消費税率</span>
              <span style={styles.infoValue}>{formatTaxRate(contract.taxRate)}</span>
            </div>
          </div>
        </div>

        {/* 金額情報 */}
        <div style={styles.card}>
          <h2 style={styles.sectionTitle}>金額情報</h2>
          <div style={styles.infoGrid}>
            <div style={styles.infoItem}>
              <span style={styles.infoLabel}>請負代金額</span>
              <span style={styles.infoValue}>{formatAmount(contract.contractAmount)}</span>
            </div>
            <div style={styles.infoItem}>
              <span style={styles.infoLabel}>工事価格</span>
              <span style={styles.infoValue}>{formatAmount(contract.constructionPrice)}</span>
            </div>
            <div style={styles.infoItem}>
              <span style={styles.infoLabel}>消費税額</span>
              <span style={styles.infoValue}>{formatAmount(contract.taxAmount)}</span>
            </div>
          </div>
        </div>

        {/* 工期情報 */}
        <div style={styles.card}>
          <h2 style={styles.sectionTitle}>工期情報</h2>
          <div style={styles.infoGrid}>
            <div style={styles.infoItem}>
              <span style={styles.infoLabel}>着手日</span>
              <span style={styles.infoValue}>{formatDate(contract.constructionStartDate)}</span>
            </div>
            <div style={styles.infoItem}>
              <span style={styles.infoLabel}>完成日</span>
              <span style={styles.infoValue}>{formatDate(contract.constructionEndDate)}</span>
            </div>
            <div style={styles.infoItem}>
              <span style={styles.infoLabel}>引渡日</span>
              <span style={styles.infoValue}>{formatDate(contract.deliveryDate)}</span>
            </div>
          </div>
        </div>

        {/* プロジェクト情報 */}
        <div style={styles.card}>
          <h2 style={styles.sectionTitle}>プロジェクト情報</h2>
          <div style={styles.infoGrid}>
            <div style={styles.infoItem}>
              <span style={styles.infoLabel}>工事名</span>
              <span style={styles.infoValue}>{contract.project.name}</span>
            </div>
            <div style={styles.infoItem}>
              <span style={styles.infoLabel}>工事場所</span>
              <span style={styles.infoValue}>{contract.project.siteAddress || '-'}</span>
            </div>
            <div style={styles.infoItem}>
              <span style={styles.infoLabel}>発注者</span>
              <span style={styles.infoValue}>{contract.project.tradingPartner?.name || '-'}</span>
            </div>
            <div style={styles.infoItem}>
              <span style={styles.infoLabel}>監理者</span>
              <span style={styles.infoValue}>{contract.supervisorTradingPartner?.name || '-'}</span>
            </div>
          </div>
        </div>

        {/* 契約条件 */}
        <div style={styles.card}>
          <h2 style={styles.sectionTitle}>契約条件</h2>
          <div style={styles.infoGrid}>
            <div style={styles.infoItemFull}>
              <span style={styles.infoLabel}>支払条件</span>
              <span style={styles.infoValue}>{contract.paymentTerms || '-'}</span>
            </div>
            <div style={styles.infoItemFull}>
              <span style={styles.infoLabel}>別途工事</span>
              <span style={styles.infoValue}>{contract.separateConstruction || '-'}</span>
            </div>
            <div style={styles.infoItemFull}>
              <span style={styles.infoLabel}>その他</span>
              <span style={styles.infoValue}>{contract.otherNotes || '-'}</span>
            </div>
          </div>
        </div>

        {/* 関連ドキュメント (REQ-8.4, REQ-8.5) */}
        <div style={styles.card}>
          <h2 style={styles.sectionTitle}>関連ドキュメント</h2>
          <div style={styles.infoGrid}>
            {/* 見積書リンク (REQ-8.4) */}
            <div style={styles.infoItem}>
              <span style={styles.infoLabel}>基となった見積書</span>
              <span style={styles.infoValue}>
                {contract.estimate ? (
                  <Link to={`/estimates/${contract.estimate.id}`} style={styles.linkStyle}>
                    {contract.estimate.name}
                  </Link>
                ) : (
                  '-'
                )}
              </span>
            </div>

            {/* 基契約書リンク (REQ-8.5) */}
            {contract.parentContract && (
              <div style={styles.infoItem}>
                <span style={styles.infoLabel}>基となった契約書</span>
                <span style={styles.infoValue}>
                  <Link
                    to={`/projects/${projectId}/contracts/${contract.parentContract.id}`}
                    style={styles.linkStyle}
                    data-testid="parent-contract-link"
                  >
                    {getContractTypeLabel(contract.parentContract.contractType)}（
                    {formatDate(contract.parentContract.contractDate)}）
                  </Link>
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
