/**
 * @fileoverview 契約書新規作成画面
 *
 * Task 6.1: 契約書新規作成ページコンポーネントを作成する
 *
 * Requirements (contract-management):
 * - REQ-2.3: 変更契約フォーム表示
 * - REQ-2.4: パンくずナビゲーション
 * - REQ-7.1: 作成ボタン押下時のAPI呼び出し（POST）と契約書詳細画面への遷移
 * - REQ-7.2: キャンセルボタン押下時の前画面への遷移（何も作成しない）
 * - REQ-7.3: 作成・キャンセルボタン表示
 *
 * @module pages/ContractCreatePage
 */

import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { createContract } from '../api/contracts';
import type { CreateContractInput } from '../api/contracts';
import { getProject } from '../api/projects';
import ContractForm from '../components/contract/ContractForm';
import type { ContractFormProjectInfo } from '../components/contract/ContractForm';
import { Breadcrumb } from '../components/common';

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
    margin: 0,
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
    margin: 0,
  } as React.CSSProperties,
  createErrorContainer: {
    backgroundColor: '#fef2f2',
    border: '1px solid #fecaca',
    borderRadius: '8px',
    padding: '12px 16px',
    marginBottom: '16px',
  } as React.CSSProperties,
};

// ============================================================================
// メインコンポーネント
// ============================================================================

/**
 * 契約書新規作成画面
 *
 * ContractFormコンポーネントをmode='create'で利用し、
 * 作成ボタン押下時にAPI呼び出し（POST）と契約書詳細画面への遷移を行う。
 *
 * Requirements:
 * - REQ-2.3: 変更契約フォーム表示
 * - REQ-2.4: パンくずナビゲーション
 * - REQ-7.1: 作成ボタン押下時にAPI呼び出し（POST）と契約書詳細画面への遷移
 * - REQ-7.2: キャンセルボタン押下時に前画面への遷移
 * - REQ-7.3: 作成・キャンセルボタン表示
 */
export default function ContractCreatePage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();

  // プロジェクト情報の取得状態
  const [projectInfo, setProjectInfo] = useState<ContractFormProjectInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // 作成処理の状態
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // プロジェクト情報を取得
  useEffect(() => {
    if (!projectId) return;

    let mounted = true;
    const fetchProject = async () => {
      setIsLoading(true);
      setLoadError(null);
      try {
        const project = await getProject(projectId);
        if (mounted) {
          setProjectInfo({
            id: project.id,
            name: project.name,
            siteAddress: project.siteAddress ?? null,
            tradingPartner: project.tradingPartner
              ? { id: project.tradingPartner.id, name: project.tradingPartner.name }
              : null,
          });
        }
      } catch {
        if (mounted) {
          setLoadError('プロジェクト情報の取得に失敗しました');
        }
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    };
    fetchProject();
    return () => {
      mounted = false;
    };
  }, [projectId]);

  /**
   * フォーム送信処理
   * Requirements: REQ-7.1
   */
  const handleSubmit = useCallback(
    async (data: CreateContractInput) => {
      if (!projectId) return;

      setIsSubmitting(true);
      setCreateError(null);

      try {
        const contract = await createContract(projectId, data);
        navigate(`/projects/${projectId}/contracts/${contract.id}`);
      } catch {
        setCreateError('契約書の作成に失敗しました');
      } finally {
        setIsSubmitting(false);
      }
    },
    [projectId, navigate]
  );

  /**
   * キャンセル処理
   * Requirements: REQ-7.2
   */
  const handleCancel = useCallback(() => {
    navigate(`/projects/${projectId}/contracts`);
  }, [navigate, projectId]);

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

  // プロジェクト情報取得エラー
  if (loadError) {
    return (
      <main role="main" style={styles.container}>
        <div role="alert" style={styles.errorContainer}>
          <p style={styles.errorText}>{loadError}</p>
        </div>
      </main>
    );
  }

  if (!projectInfo || !projectId) {
    return null;
  }

  return (
    <main role="main" style={styles.container} data-testid="contract-create-page">
      {/* パンくずナビゲーション (REQ-2.4) */}
      <div style={styles.breadcrumbWrapper}>
        <Breadcrumb
          items={[
            { label: 'ダッシュボード', path: '/' },
            { label: 'プロジェクト一覧', path: '/projects' },
            { label: 'プロジェクト', path: `/projects/${projectId}` },
            { label: '契約書一覧', path: `/projects/${projectId}/contracts` },
            { label: '新規作成' },
          ]}
        />
      </div>

      {/* ヘッダー */}
      <div style={styles.header}>
        <h1 style={styles.title}>契約書作成</h1>
      </div>

      {/* 作成エラー表示 */}
      {createError && (
        <div role="alert" style={styles.createErrorContainer}>
          <p style={styles.errorText}>{createError}</p>
        </div>
      )}

      {/* 契約書フォーム（mode='create'） */}
      <ContractForm
        mode="create"
        projectId={projectId}
        projectInfo={projectInfo}
        onSubmit={handleSubmit}
        onCancel={handleCancel}
        isSubmitting={isSubmitting}
      />
    </main>
  );
}
