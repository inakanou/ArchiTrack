/**
 * @fileoverview プロジェクト詳細ページ
 *
 * Task 9.2: ProjectDetailPageの実装
 * Task 18.3: 取引先情報表示拡張
 * Task 19.2: パンくずナビゲーション追加
 * Task 19.5: 編集ボタン遷移先更新（/projects/:id/edit へ遷移）
 * Task 27.2: フィールドラベル変更（「取引先」→「顧客名」）
 * Task 10.1 (site-survey): 現場調査への導線追加
 *
 * Requirements:
 * - 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7: プロジェクト詳細表示
 * - 8.1, 8.2, 8.3, 8.4, 8.5, 8.6: プロジェクト編集
 * - 9.2, 9.3, 9.4, 9.7: プロジェクト削除
 * - 11.1, 11.2, 11.3, 11.4, 11.5, 11.6: 関連データ参照（機能フラグ対応）
 * - 18.4, 18.5: エラーハンドリング
 * - 19.2: パフォーマンス
 * - 21.15, 21.18: パンくずナビゲーション（ダッシュボード > プロジェクト > [プロジェクト名]）
 * - 21.21: 編集ボタンクリックで編集ページへ遷移
 * - 22: 顧客情報表示（ラベル「顧客名」）
 * - 2.1, 2.2: 現場調査タブ/セクション表示と遷移
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { getProject, getStatusHistory, deleteProject, transitionStatus } from '../api/projects';
import { getLatestSiteSurveys } from '../api/site-surveys';
import { getLatestQuantityTables } from '../api/quantity-tables';
import { getLatestItemizedStatements } from '../api/itemized-statements';
import { ApiError } from '../api/client';
import type { ProjectSurveySummary } from '../types/site-survey.types';
import type { ProjectQuantityTableSummary } from '../types/quantity-table.types';
import type { ProjectItemizedStatementSummary } from '../types/itemized-statement.types';
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

/**
 * 日付フォーマット
 */
function formatDate(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
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
  backLink: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    color: '#2563eb',
    textDecoration: 'none',
    fontSize: '14px',
    marginBottom: '16px',
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
  const [isSurveyLoading, setIsSurveyLoading] = useState(false);
  const [quantityTableSummary, setQuantityTableSummary] =
    useState<ProjectQuantityTableSummary | null>(null);
  const [isQuantityTableLoading, setIsQuantityTableLoading] = useState(false);
  const [itemizedStatementSummary, setItemizedStatementSummary] =
    useState<ProjectItemizedStatementSummary | null>(null);
  const [isItemizedStatementLoading, setIsItemizedStatementLoading] = useState(false);

  // UI状態
  const [isLoading, setIsLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  // エラー状態
  const [error, setError] = useState<string | null>(null);

  /**
   * プロジェクトデータを取得
   */
  const fetchProject = useCallback(async () => {
    if (!id) return;

    setIsLoading(true);
    setIsSurveyLoading(true);
    setIsQuantityTableLoading(true);
    setIsItemizedStatementLoading(true);
    setError(null);

    try {
      const [projectData, historyData] = await Promise.all([getProject(id), getStatusHistory(id)]);

      setProject(projectData);
      setStatusHistory(historyData);

      // 取引先情報は既にprojectDataに含まれている（tradingPartnerフィールド）

      // 現場調査サマリー取得（Task 31.3: Requirements 2.1）
      try {
        const summaryData = await getLatestSiteSurveys(id);
        setSurveySummary(summaryData);
      } catch {
        // 現場調査の取得に失敗しても、プロジェクト詳細は表示する
        setSurveySummary({ totalCount: 0, latestSurveys: [] });
      } finally {
        setIsSurveyLoading(false);
      }

      // 数量表サマリー取得（Task 4.1: Requirements 1.1, 1.2, 1.3）
      try {
        const quantityTableData = await getLatestQuantityTables(id);
        setQuantityTableSummary(quantityTableData);
      } catch {
        // 数量表の取得に失敗しても、プロジェクト詳細は表示する
        setQuantityTableSummary({ totalCount: 0, latestTables: [] });
      } finally {
        setIsQuantityTableLoading(false);
      }

      // 内訳書サマリー取得（Task 6: Requirements 3.1, 3.2, 3.3, 3.4, 11.1）
      try {
        const itemizedStatementData = await getLatestItemizedStatements(id);
        setItemizedStatementSummary(itemizedStatementData);
      } catch {
        // 内訳書の取得に失敗しても、プロジェクト詳細は表示する
        setItemizedStatementSummary({ totalCount: 0, latestStatements: [] });
      } finally {
        setIsItemizedStatementLoading(false);
      }
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

        // データ再取得
        const [projectData, historyData] = await Promise.all([
          getProject(id),
          getStatusHistory(id),
        ]);

        setProject(projectData);
        setStatusHistory(historyData);

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
            { label: 'プロジェクト', path: '/projects' },
            { label: project.name },
          ]}
        />
      </div>

      {/* ヘッダー */}
      <div style={styles.header}>
        <Link to="/projects" style={styles.backLink}>
          ← 一覧に戻る
        </Link>
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
            <div style={styles.fieldValue}>{project.name}</div>
          </div>
          <div style={styles.field}>
            <div style={styles.fieldLabel}>顧客名</div>
            <div style={styles.fieldValue}>{project.tradingPartner?.name ?? '-'}</div>
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
            <div style={styles.fieldValue}>{project.siteAddress || '-'}</div>
          </div>
          <div style={styles.field}>
            <div style={styles.fieldLabel}>ステータス</div>
            <div style={styles.fieldValue}>{PROJECT_STATUS_LABELS[project.status]}</div>
          </div>
          <div style={styles.field}>
            <div style={styles.fieldLabel}>作成日時</div>
            <div style={styles.fieldValue}>{formatDate(project.createdAt)}</div>
          </div>
          <div style={styles.field}>
            <div style={styles.fieldLabel}>更新日時</div>
            <div style={styles.fieldValue}>{formatDate(project.updatedAt)}</div>
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
        isLoading={isSurveyLoading}
      />

      {/* 数量表セクション (Task 4.1, Requirements 1.1, 1.2, 1.3) */}
      <QuantityTableSectionCard
        projectId={project.id}
        totalCount={quantityTableSummary?.totalCount ?? 0}
        latestTables={quantityTableSummary?.latestTables ?? []}
        isLoading={isQuantityTableLoading}
      />

      {/* 内訳書セクション (Task 6, Requirements 3.1, 3.2, 3.3, 3.4, 11.1, 11.2, 11.3, 11.4, 11.5) */}
      {/* Task 11: 内訳書作成成功時に詳細画面への自動遷移を実装 */}
      <ItemizedStatementSectionCard
        projectId={project.id}
        totalCount={itemizedStatementSummary?.totalCount ?? 0}
        latestStatements={itemizedStatementSummary?.latestStatements ?? []}
        quantityTables={quantityTableSummary?.latestTables ?? []}
        isLoading={isItemizedStatementLoading}
        onSuccess={(statement) => {
          // 内訳書作成成功時に作成された内訳書の詳細画面に遷移
          navigate(`/itemized-statements/${statement.id}`);
        }}
      />

      {/* 関連データ（機能フラグ対応、将来実装予定） */}
      <section style={styles.section}>
        <h2 style={styles.sectionTitle}>関連データ</h2>
        <div style={styles.relatedDataSection}>
          <p>見積書などの関連データ機能は今後実装予定です。</p>
        </div>
      </section>

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
