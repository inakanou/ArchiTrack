/**
 * @fileoverview プロジェクト詳細ページ
 *
 * Task 9.2: ProjectDetailPageの実装
 * Task 18.3: 取引先情報表示拡張
 * Task 19.2: パンくずナビゲーション追加
 * Task 19.5: 編集ボタン遷移先更新（/projects/:id/edit へ遷移）
 * Task 27.2: フィールドラベル変更（「取引先」→「顧客名」）
 * Task 10.1 (site-survey): 現場調査への導線追加
 * Task 7.2 (estimate-request): 見積依頼への導線追加
 * Task 53.1: パンくずナビゲーション更新（プロジェクト一覧 → プロジェクト詳細）
 * Task 53.2: 「← 一覧に戻る」リンク削除
 * Task 53.3: クリップボードコピーボタン追加
 * Task 53.4: 作成日時・更新日時フィールド削除
 *
 * Requirements:
 * - 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7: プロジェクト詳細表示
 * - 8.1, 8.2, 8.3, 8.4, 8.5, 8.6: プロジェクト編集
 * - 9.2, 9.3, 9.4, 9.7: プロジェクト削除
 * - 11.1, 11.2, 11.3, 11.4, 11.5, 11.6: 関連データ参照（機能フラグ対応）
 * - 18.4, 18.5: エラーハンドリング
 * - 19.2: パフォーマンス
 * - 21.15, 21.18: パンくずナビゲーション（ダッシュボード > プロジェクト一覧 > プロジェクト詳細）
 * - 31.1-31.4: パンくずナビゲーション更新
 * - 32.1-32.2: 「一覧に戻る」リンク削除
 * - 33.1-33.9: クリップボードコピーボタン追加
 * - 34.1-34.2: 作成日時・更新日時フィールド削除
 * - 21.21: 編集ボタンクリックで編集ページへ遷移
 * - 22: 顧客情報表示（ラベル「顧客名」）
 * - 2.1, 2.2: 現場調査タブ/セクション表示と遷移
 * - 1.1 (estimate-request): プロジェクト詳細画面に見積依頼セクションを表示する
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { deleteProject, transitionStatus, getProjectDetailSummary } from '../api/projects';
import type {
  ContractSectionSummary,
  ScheduleSectionSummary,
  ProjectConstructionPhotoSummary,
} from '../api/projects';
import { ApiError } from '../api/client';
import type { ProjectSurveySummary } from '../types/site-survey.types';
import type { ProjectQuantityTableSummary } from '../types/quantity-table.types';
import type { ProjectItemizedStatementSummary } from '../types/itemized-statement.types';
import type { ProjectEstimateRequestSummary } from '../types/estimate-request.types';
import type { EstimateSummary } from '../api/estimates';
import { useToast } from '../hooks/useToast';
import type {
  ProjectDetail,
  StatusHistoryResponse,
  AllowedTransition,
  ProjectStatus,
} from '../types/project.types';
import { PROJECT_STATUS_LABELS } from '../types/project.types';
import StatusTransitionUI from '../components/projects/StatusTransitionUI';
import DeleteConfirmationDialog from '../components/projects/DeleteConfirmationDialog';
import { SiteSurveySectionCard } from '../components/projects/SiteSurveySectionCard';
import { QuantityTableSectionCard } from '../components/projects/QuantityTableSectionCard';
import { ItemizedStatementSectionCard } from '../components/projects/ItemizedStatementSectionCard';
import { EstimateRequestSectionCard } from '../components/projects/EstimateRequestSectionCard';
import { EstimateSectionCard } from '../components/projects/EstimateSectionCard';
import { ContractSectionCard } from '../components/projects/ContractSectionCard';
import { ScheduleSectionCard } from '../components/projects/ScheduleSectionCard';
import { ConstructionPhotoSectionCard } from '../components/projects/ConstructionPhotoSectionCard';
import {
  ExecutionBudgetSectionCard,
  type ExecutionBudgetSectionInfo,
} from '../components/projects/ExecutionBudgetSectionCard';
import { Breadcrumb } from '../components/common';

// ============================================================================
// 定数定義
// ============================================================================

/**
 * ステータス遷移ルール
 * 各ステータスから遷移可能なステータスとその種別を定義
 */
const STATUS_TRANSITIONS: Record<ProjectStatus, AllowedTransition[]> = {
  PREPARING: [
    { status: 'SURVEYING', type: 'forward', requiresReason: false },
    { status: 'CANCELLED', type: 'terminate', requiresReason: false },
  ],
  SURVEYING: [
    { status: 'ESTIMATING', type: 'forward', requiresReason: false },
    { status: 'PREPARING', type: 'backward', requiresReason: true },
    { status: 'CANCELLED', type: 'terminate', requiresReason: false },
  ],
  ESTIMATING: [
    { status: 'APPROVING', type: 'forward', requiresReason: false },
    { status: 'SURVEYING', type: 'backward', requiresReason: true },
    { status: 'CANCELLED', type: 'terminate', requiresReason: false },
  ],
  APPROVING: [
    { status: 'CONTRACTING', type: 'forward', requiresReason: false },
    { status: 'ESTIMATING', type: 'backward', requiresReason: true },
    { status: 'LOST', type: 'terminate', requiresReason: false },
  ],
  CONTRACTING: [
    { status: 'CONSTRUCTING', type: 'forward', requiresReason: false },
    { status: 'APPROVING', type: 'backward', requiresReason: true },
    { status: 'LOST', type: 'terminate', requiresReason: false },
  ],
  CONSTRUCTING: [
    { status: 'DELIVERING', type: 'forward', requiresReason: false },
    { status: 'CONTRACTING', type: 'backward', requiresReason: true },
  ],
  DELIVERING: [
    { status: 'BILLING', type: 'forward', requiresReason: false },
    { status: 'CONSTRUCTING', type: 'backward', requiresReason: true },
  ],
  BILLING: [
    { status: 'AWAITING', type: 'forward', requiresReason: false },
    { status: 'DELIVERING', type: 'backward', requiresReason: true },
  ],
  AWAITING: [
    { status: 'COMPLETED', type: 'forward', requiresReason: false },
    { status: 'BILLING', type: 'backward', requiresReason: true },
  ],
  COMPLETED: [],
  CANCELLED: [],
  LOST: [],
};

// ============================================================================
// CopyButton ローカルコンポーネント
// Task 53.3: 基本情報のクリップボードコピーボタン追加
// ============================================================================

/**
 * CopyButton Props
 */
interface CopyButtonProps {
  /** コピーするテキスト */
  text: string;
  /** aria-label */
  ariaLabel: string;
}

/**
 * コピーボタンコンポーネント
 *
 * クリップボードにテキストをコピーし、成功/失敗のフィードバックを2秒間表示する。
 * navigator.clipboard.writeText を使用。非対応ブラウザではエラーフィードバックを表示。
 *
 * Requirements: 33.1, 33.2, 33.3, 33.4, 33.5, 33.6, 33.7, 33.8, 33.9
 */
function CopyButton({ text, ariaLabel }: CopyButtonProps) {
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');

  const handleCopy = useCallback(async () => {
    try {
      if (!navigator.clipboard) {
        setStatus('error');
        setTimeout(() => setStatus('idle'), 2000);
        return;
      }
      await navigator.clipboard.writeText(text);
      setStatus('success');
      setTimeout(() => setStatus('idle'), 2000);
    } catch {
      setStatus('error');
      setTimeout(() => setStatus('idle'), 2000);
    }
  }, [text]);

  const copyButtonStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    padding: '2px 6px',
    border: 'none',
    background: 'transparent',
    cursor: 'pointer',
    color: status === 'success' ? '#16a34a' : status === 'error' ? '#dc2626' : '#6b7280',
    fontSize: '12px',
    borderRadius: '4px',
    transition: 'color 0.2s',
    verticalAlign: 'middle',
  };

  if (status === 'success') {
    return (
      <button type="button" style={copyButtonStyle} aria-label={ariaLabel}>
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
        <span>コピーしました</span>
      </button>
    );
  }

  if (status === 'error') {
    return (
      <button type="button" style={copyButtonStyle} aria-label={ariaLabel}>
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
        <span>コピーに失敗しました</span>
      </button>
    );
  }

  return (
    <button type="button" onClick={handleCopy} style={copyButtonStyle} aria-label={ariaLabel}>
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
      </svg>
    </button>
  );
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
    marginBottom: '24px',
  } as React.CSSProperties,
  title: {
    fontSize: '24px',
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: '8px',
  } as React.CSSProperties,
  subtitle: {
    fontSize: '14px',
    color: '#4b5563', // WCAG 2.1 AA準拠 - コントラスト比 5.7:1 on #f5f5f5
  } as React.CSSProperties,
  actionsContainer: {
    display: 'flex',
    gap: '12px',
    marginTop: '16px',
  } as React.CSSProperties,
  button: {
    padding: '8px 16px',
    fontSize: '14px',
    fontWeight: '500',
    borderRadius: '6px',
    cursor: 'pointer',
    transition: 'all 0.2s',
  } as React.CSSProperties,
  editButton: {
    backgroundColor: '#2563eb',
    color: '#ffffff',
    border: 'none',
  } as React.CSSProperties,
  deleteButton: {
    backgroundColor: '#ffffff',
    color: '#dc2626',
    border: '1px solid #dc2626',
  } as React.CSSProperties,
  section: {
    backgroundColor: '#ffffff',
    borderRadius: '8px',
    border: '1px solid #e5e7eb',
    padding: '24px',
    marginBottom: '24px',
  } as React.CSSProperties,
  sectionTitle: {
    fontSize: '16px',
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: '16px',
    paddingBottom: '8px',
    borderBottom: '1px solid #e5e7eb',
  } as React.CSSProperties,
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
    gap: '16px',
  } as React.CSSProperties,
  field: {
    marginBottom: '16px',
  } as React.CSSProperties,
  fieldLabel: {
    fontSize: '12px',
    fontWeight: '500',
    color: '#6b7280',
    marginBottom: '4px',
    textTransform: 'uppercase' as const,
  } as React.CSSProperties,
  fieldValue: {
    fontSize: '14px',
    color: '#1f2937',
  } as React.CSSProperties,
  description: {
    whiteSpace: 'pre-wrap' as const,
    fontSize: '14px',
    color: '#374151',
    lineHeight: '1.6',
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
  conflictError: {
    backgroundColor: '#fff7ed',
    border: '1px solid #fed7aa',
    borderRadius: '8px',
    padding: '16px',
    marginBottom: '16px',
  } as React.CSSProperties,
  conflictErrorText: {
    color: '#c2410c',
    fontSize: '14px',
  } as React.CSSProperties,
  relatedDataSection: {
    backgroundColor: '#f9fafb',
    borderRadius: '8px',
    padding: '16px',
    color: '#6b7280',
    fontSize: '14px',
    textAlign: 'center' as const,
  } as React.CSSProperties,
};

// ============================================================================
// コンポーネント
// ============================================================================

/**
 * プロジェクト詳細ページ
 *
 * プロジェクトの詳細情報、編集、削除、ステータス遷移機能を提供します。
 */
export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const toast = useToast();

  // データ状態
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [statusHistory, setStatusHistory] = useState<StatusHistoryResponse[]>([]);
  const [surveySummary, setSurveySummary] = useState<ProjectSurveySummary | null>(null);
  const [quantityTableSummary, setQuantityTableSummary] =
    useState<ProjectQuantityTableSummary | null>(null);
  const [itemizedStatementSummary, setItemizedStatementSummary] =
    useState<ProjectItemizedStatementSummary | null>(null);
  const [estimateRequestSummary, setEstimateRequestSummary] =
    useState<ProjectEstimateRequestSummary | null>(null);
  const [estimateSummary, setEstimateSummary] = useState<EstimateSummary | null>(null);
  const [contractSummary, setContractSummary] = useState<ContractSectionSummary | null>(null);
  const [scheduleSummary, setScheduleSummary] = useState<ScheduleSectionSummary | null>(null);
  const [constructionPhotoSummary, setConstructionPhotoSummary] =
    useState<ProjectConstructionPhotoSummary | null>(null);
  const [executionBudgetInfo, setExecutionBudgetInfo] = useState<ExecutionBudgetSectionInfo | null>(
    null
  );
  const [isExecutionBudgetLoading, setIsExecutionBudgetLoading] = useState(true);

  // UI状態
  const [isLoading, setIsLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  // エラー状態
  const [error, setError] = useState<string | null>(null);

  /**
   * プロジェクトデータを一括取得
   *
   * Task 47.2: 7つの個別APIリクエストをgetProjectDetailSummaryの1リクエストに置換
   * Task 47.3: 5つの個別セクション用ローディング状態を1つのisLoadingに統合
   * Requirements: 29.2, 29.5
   */
  const fetchProject = useCallback(async () => {
    if (!id) return;

    setIsLoading(true);
    setError(null);

    try {
      const data = await getProjectDetailSummary(id);
      setProject(data.project);
      setStatusHistory(data.statusHistory);
      setSurveySummary(data.sections.siteSurveys);
      setQuantityTableSummary(data.sections.quantityTables);
      setItemizedStatementSummary(data.sections.itemizedStatements);
      setEstimateRequestSummary(data.sections.estimateRequests);
      setEstimateSummary(data.sections.estimates);

      // Task 59.2: detail-summary APIから契約書サマリーを取得（個別API呼び出しを置換）
      // Requirements: 37.1, 37.2
      setContractSummary(data.sections.contracts);

      // Task 62.1: detail-summary APIから工程表サマリーを取得
      // Requirements: 39.1, 39.2
      setScheduleSummary(data.sections.schedules);

      // Task 7.2 (construction-photo): detail-summary APIから工事写真サマリーを取得
      // Requirements (construction-photo): 2.3
      setConstructionPhotoSummary(data.sections.constructionPhotos);

      // Task 66.1: detail-summary APIから実行予算サマリーを取得（個別API呼び出しを置換）
      // Requirements: 40.1, 41.1
      setExecutionBudgetInfo(data.sections.executionBudget);
      setIsExecutionBudgetLoading(false);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.statusCode === 404) {
          navigate('/404', { replace: true });
          return;
        }
        if (err.statusCode === 403) {
          navigate('/403', { replace: true });
          return;
        }
        setError(err.message || 'エラーが発生しました');
      } else {
        setError('エラーが発生しました');
      }
    } finally {
      setIsLoading(false);
    }
  }, [id, navigate]);

  // 初回読み込み
  useEffect(() => {
    fetchProject();
  }, [fetchProject]);

  /**
   * 許可された遷移先を取得
   */
  const allowedTransitions = useMemo(() => {
    if (!project) return [];
    return STATUS_TRANSITIONS[project.status] || [];
  }, [project]);

  /**
   * 編集ページへ遷移
   * Task 19.5: TradingPartnerDetailPageと同じパターンで編集ページへ遷移
   */
  const handleEdit = useCallback(() => {
    if (project) {
      navigate(`/projects/${project.id}/edit`);
    }
  }, [project, navigate]);

  /**
   * プロジェクト削除
   */
  const handleDelete = useCallback(async () => {
    if (!id) return;

    setIsDeleting(true);

    try {
      await deleteProject(id);

      // トースト通知で成功メッセージを表示
      toast.projectDeleted();

      navigate('/projects');
    } catch (err) {
      setShowDeleteDialog(false);
      if (err instanceof ApiError) {
        const errorMessage = err.message || '削除中にエラーが発生しました';
        setError(errorMessage);
        toast.operationFailed(errorMessage);
      } else {
        const defaultErrorMessage = '削除中にエラーが発生しました';
        setError(defaultErrorMessage);
        toast.operationFailed(defaultErrorMessage);
      }
    } finally {
      setIsDeleting(false);
    }
  }, [id, navigate, toast]);

  /**
   * ステータス遷移
   */
  const handleTransition = useCallback(
    async (newStatus: ProjectStatus, reason?: string) => {
      if (!id) return;

      setIsTransitioning(true);

      try {
        await transitionStatus(id, {
          status: newStatus,
          reason,
        });

        // データ再取得（detail-summary APIで一括取得）
        const data = await getProjectDetailSummary(id);
        setProject(data.project);
        setStatusHistory(data.statusHistory);
        setSurveySummary(data.sections.siteSurveys);
        setQuantityTableSummary(data.sections.quantityTables);
        setItemizedStatementSummary(data.sections.itemizedStatements);
        setEstimateRequestSummary(data.sections.estimateRequests);
        setEstimateSummary(data.sections.estimates);
        setContractSummary(data.sections.contracts);
        setScheduleSummary(data.sections.schedules);
        setConstructionPhotoSummary(data.sections.constructionPhotos);
        setExecutionBudgetInfo(data.sections.executionBudget);

        // トースト通知で成功メッセージを表示
        const statusLabel = PROJECT_STATUS_LABELS[newStatus];
        toast.projectStatusChanged(statusLabel);
      } catch (err) {
        if (err instanceof ApiError) {
          const errorMessage = err.message || 'ステータス変更中にエラーが発生しました';
          setError(errorMessage);
          toast.operationFailed(errorMessage);
        } else {
          const defaultErrorMessage = 'ステータス変更中にエラーが発生しました';
          setError(defaultErrorMessage);
          toast.operationFailed(defaultErrorMessage);
        }
      } finally {
        setIsTransitioning(false);
      }
    },
    [id, toast]
  );

  // ローディング表示
  if (isLoading) {
    return (
      <main role="main" style={styles.container}>
        <div style={styles.loadingContainer}>
          <div role="status" style={styles.loadingSpinner} />
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
  if (error && !project) {
    return (
      <main role="main" style={styles.container}>
        <div role="alert" style={styles.errorContainer}>
          <p style={styles.errorText}>{error}</p>
          <button type="button" onClick={fetchProject} style={styles.retryButton}>
            再試行
          </button>
        </div>
      </main>
    );
  }

  // プロジェクトデータがない場合
  if (!project) {
    return null;
  }

  // 詳細表示
  return (
    <main role="main" aria-busy={isLoading} style={styles.container}>
      {/* パンくずナビゲーション */}
      <div style={styles.breadcrumbWrapper}>
        <Breadcrumb
          items={[
            { label: 'ダッシュボード', path: '/' },
            { label: 'プロジェクト一覧', path: '/projects' },
            { label: project.name },
          ]}
        />
      </div>

      {/* ヘッダー */}
      <div style={styles.header}>
        <h1 style={styles.title}>{project.name}</h1>
        <p style={styles.subtitle}>
          {project.tradingPartner?.name ?? '-'} | {PROJECT_STATUS_LABELS[project.status]}
        </p>

        <div style={styles.actionsContainer}>
          <button
            type="button"
            onClick={handleEdit}
            style={{ ...styles.button, ...styles.editButton }}
          >
            編集
          </button>
          <button
            type="button"
            onClick={() => setShowDeleteDialog(true)}
            style={{ ...styles.button, ...styles.deleteButton }}
          >
            削除
          </button>
        </div>
      </div>

      {/* エラー表示 */}
      {error && (
        <div role="alert" style={styles.conflictError}>
          <p style={styles.conflictErrorText}>{error}</p>
        </div>
      )}

      {/* 基本情報 */}
      <section style={styles.section}>
        <h2 style={styles.sectionTitle}>基本情報</h2>
        <div style={styles.grid}>
          <div style={styles.field}>
            <div style={styles.fieldLabel}>プロジェクト名</div>
            <div
              style={{ ...styles.fieldValue, display: 'flex', alignItems: 'center', gap: '4px' }}
            >
              {project.name}
              <CopyButton text={project.name} ariaLabel="プロジェクト名をコピー" />
            </div>
          </div>
          <div style={styles.field}>
            <div style={styles.fieldLabel}>顧客名</div>
            <div
              style={{ ...styles.fieldValue, display: 'flex', alignItems: 'center', gap: '4px' }}
            >
              {project.tradingPartner?.name ?? '-'}
              {project.tradingPartner?.name && (
                <CopyButton text={project.tradingPartner.name} ariaLabel="顧客名をコピー" />
              )}
            </div>
          </div>
          <div style={styles.field}>
            <div style={styles.fieldLabel}>営業担当者</div>
            <div style={styles.fieldValue}>{project.salesPerson.displayName}</div>
          </div>
          <div style={styles.field}>
            <div style={styles.fieldLabel}>工事担当者</div>
            <div style={styles.fieldValue}>
              {project.constructionPerson?.displayName || '未割当'}
            </div>
          </div>
          <div style={styles.field}>
            <div style={styles.fieldLabel}>現場住所</div>
            <div
              style={{ ...styles.fieldValue, display: 'flex', alignItems: 'center', gap: '4px' }}
            >
              {project.siteAddress || '-'}
              {project.siteAddress && (
                <CopyButton text={project.siteAddress} ariaLabel="現場住所をコピー" />
              )}
            </div>
          </div>
          <div style={styles.field}>
            <div style={styles.fieldLabel}>ステータス</div>
            <div style={styles.fieldValue}>{PROJECT_STATUS_LABELS[project.status]}</div>
          </div>
        </div>

        {project.description && (
          <div style={{ ...styles.field, marginTop: '16px' }}>
            <div style={styles.fieldLabel}>概要</div>
            <div style={styles.description}>{project.description}</div>
          </div>
        )}
      </section>

      {/* ステータス遷移UI */}
      <section style={styles.section}>
        <StatusTransitionUI
          projectId={project.id}
          currentStatus={project.status}
          allowedTransitions={allowedTransitions}
          statusHistory={statusHistory}
          onTransition={handleTransition}
          isLoading={isTransitioning}
        />
      </section>

      {/* 現場調査セクション (Task 31.3, Requirements 2.1, 2.2) */}
      <SiteSurveySectionCard
        projectId={project.id}
        totalCount={surveySummary?.totalCount ?? 0}
        latestSurveys={surveySummary?.latestSurveys ?? []}
        isLoading={isLoading}
      />

      {/* 数量表セクション (Task 4.1, Requirements 1.1, 1.2, 1.3) */}
      <QuantityTableSectionCard
        projectId={project.id}
        totalCount={quantityTableSummary?.totalCount ?? 0}
        latestTables={quantityTableSummary?.latestTables ?? []}
        isLoading={isLoading}
      />

      {/* 内訳書セクション (Task 6, Task 18.1, Requirements 1.8, 3.1, 3.2, 3.3, 3.4, 11.1, 11.2, 11.3, 11.4, 11.5) */}
      {/* 新規作成ボタンは内訳書新規作成画面へのLinkに変更（Task 18.1） */}
      <ItemizedStatementSectionCard
        projectId={project.id}
        totalCount={itemizedStatementSummary?.totalCount ?? 0}
        latestStatements={itemizedStatementSummary?.latestStatements ?? []}
        quantityTables={quantityTableSummary?.latestTables ?? []}
        isLoading={isLoading}
      />

      {/* 見積依頼セクション (Task 7.2, Requirements 1.1) */}
      <EstimateRequestSectionCard
        projectId={project.id}
        totalCount={estimateRequestSummary?.totalCount ?? 0}
        latestRequests={estimateRequestSummary?.latestRequests ?? []}
        isLoading={isLoading}
      />

      {/* 見積書セクション (Task 19.3, Requirements 16.1, 16.3, 16.4, 16.13) */}
      <EstimateSectionCard
        projectId={project.id}
        totalCount={estimateSummary?.totalCount ?? 0}
        latestEstimates={estimateSummary?.latestEstimates ?? []}
        isLoading={isLoading}
      />

      {/* 契約書セクション (Task 9.1, Requirements 1.4, 1.5) */}
      <ContractSectionCard
        projectId={project.id}
        totalCount={contractSummary?.totalCount ?? 0}
        latestContracts={contractSummary?.latestContracts ?? []}
        isLoading={isLoading}
      />

      {/* 実行予算セクション (Task 14.1, Requirements 1.1) */}
      <ExecutionBudgetSectionCard
        projectId={project.id}
        budgetInfo={executionBudgetInfo}
        isLoading={isExecutionBudgetLoading}
      />

      {/* 工程表セクション (Task 62.1, Requirements 38.1) */}
      <ScheduleSectionCard
        projectId={project.id}
        totalCount={scheduleSummary?.totalCount ?? 0}
        latestSchedules={scheduleSummary?.latestSchedules ?? []}
        isLoading={isLoading}
      />

      {/* 工事写真セクション (Task 7.2 construction-photo, Requirements 2.1, 2.2, 2.3) */}
      {/* 工程表パネルの直下に配置（Requirements 2.1） */}
      <ConstructionPhotoSectionCard
        projectId={project.id}
        totalCount={constructionPhotoSummary?.totalCount ?? 0}
        latestAlbums={constructionPhotoSummary?.latestAlbums ?? []}
        isLoading={isLoading}
      />

      {/* 削除確認ダイアログ */}
      <DeleteConfirmationDialog
        isOpen={showDeleteDialog}
        onClose={() => setShowDeleteDialog(false)}
        onConfirm={handleDelete}
        projectName={project.name}
        hasRelatedData={false}
        isDeleting={isDeleting}
      />
    </main>
  );
}
