/**
 * @fileoverview 契約書編集画面
 *
 * Task 8.1: 契約書編集ページコンポーネントを作成する
 *
 * Requirements (contract-management):
 * - REQ-9.1: 契約書編集画面に全項目を編集可能な状態で表示する
 * - REQ-9.2: 編集保存（PUT、楽観的排他制御のversion送信）と契約書詳細画面への遷移
 * - REQ-9.3: 編集キャンセル時に変更を破棄して契約書詳細画面に戻る
 * - REQ-9.4: パンくずナビゲーションを表示する
 * - REQ-9.5: 編集時自動表示項目更新（見積書変更時の金額自動再計算）
 * - REQ-11.8: 読み込みの 404 で見つからない旨と戻り先のリンクを表示する（Task 21.1）
 * - REQ-11.9: 保存の 404 で見つからない旨のメッセージを表示する（Task 21.1）
 *
 * @module pages/ContractEditPage
 */

import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getContractDetail, updateContract } from '../api/contracts';
import type { ContractDetail, CreateContractInput, UpdateContractInput } from '../api/contracts';
import { getProject } from '../api/projects';
import ContractForm from '../components/contract/ContractForm';
import type { ContractFormProjectInfo } from '../components/contract/ContractForm';
import { Breadcrumb, ResourceNotFound } from '../components/common';
import { useToast } from '../hooks/useToast';
import { classifyContractError } from '../utils/contractErrorHandler';
import type { ContractNotFoundTarget } from '../utils/contractErrorHandler';

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
  updateErrorContainer: {
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
 * 契約書編集画面
 *
 * 既存契約書データをフォーム初期値としてロードし、
 * ContractFormをmode='edit'で利用する。
 *
 * Requirements:
 * - REQ-9.1: 全項目を編集可能な状態で表示
 * - REQ-9.2: 保存時にPUT APIを呼び出し（version送信）、詳細画面に遷移
 * - REQ-9.3: キャンセル時に変更破棄して詳細画面に遷移
 * - REQ-9.4: パンくずナビゲーション
 * - REQ-9.5: 見積書変更時の金額自動再計算
 */
export default function ContractEditPage() {
  const { projectId, contractId } = useParams<{
    projectId: string;
    contractId: string;
  }>();
  const navigate = useNavigate();
  const toast = useToast();

  // データ状態
  const [contract, setContract] = useState<ContractDetail | null>(null);
  const [projectInfo, setProjectInfo] = useState<ContractFormProjectInfo | null>(null);

  // UI状態
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadErrorRetryable, setLoadErrorRetryable] = useState(false);
  // 読み込みが 404 を受けた対象（範囲外と不在を区別しない。REQ-11.8）
  const [notFoundTarget, setNotFoundTarget] = useState<ContractNotFoundTarget | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);

  /**
   * 契約書データとプロジェクト情報を取得
   * REQ-11.1, REQ-11.2: エラー種別に応じたフィードバック
   */
  const fetchData = useCallback(async () => {
    if (!projectId || !contractId) return;

    setIsLoading(true);
    setLoadError(null);
    setLoadErrorRetryable(false);
    setNotFoundTarget(null);

    try {
      // 契約書詳細とプロジェクト情報を並行取得し、どちらが失敗したかを個別に見る
      const [contractResult, projectResult] = await Promise.allSettled([
        getContractDetail(contractId),
        getProject(projectId),
      ]);

      // 404 の見分けは ApiError の状態コードで行う（REQ-11.8）。
      // 契約書の 404 を先に見る（契約書の画面では契約書が見つからない旨を告げる）
      const contractError =
        contractResult.status === 'rejected'
          ? classifyContractError(contractResult.reason, { notFoundTarget: 'contract' })
          : null;
      const projectError =
        projectResult.status === 'rejected'
          ? classifyContractError(projectResult.reason, { notFoundTarget: 'project' })
          : null;
      if (contractError?.type === 'not_found') {
        setNotFoundTarget('contract');
        return;
      }
      if (projectError?.type === 'not_found') {
        setNotFoundTarget('project');
        return;
      }
      const failure = contractError ?? projectError;
      if (failure) {
        toast.error(failure.message);
        setLoadError(failure.message);
        setLoadErrorRetryable(failure.retryable);
        return;
      }
      if (contractResult.status !== 'fulfilled' || projectResult.status !== 'fulfilled') {
        return;
      }

      const contractData = contractResult.value;
      const projectData = projectResult.value;
      setContract(contractData);
      setProjectInfo({
        id: projectData.id,
        name: projectData.name,
        siteAddress: projectData.siteAddress ?? null,
        tradingPartner: projectData.tradingPartner
          ? { id: projectData.tradingPartner.id, name: projectData.tradingPartner.name }
          : null,
      });
    } finally {
      setIsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, contractId]);

  // 初回取得
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  /**
   * フォーム送信処理
   * Requirements: REQ-9.2, REQ-11.1, REQ-11.2, REQ-11.4
   *
   * 楽観的排他制御のversionを含むUpdateContractInputをAPIに送信する。
   */
  const handleSubmit = useCallback(
    async (data: CreateContractInput) => {
      if (!contractId || !contract) return;

      setIsSubmitting(true);
      setUpdateError(null);

      try {
        // CreateContractInputからUpdateContractInputへ変換（versionを追加）
        const updateData: UpdateContractInput = {
          estimateId: data.estimateId,
          contractDate: data.contractDate,
          constructionStartDate: data.constructionStartDate,
          constructionEndDate: data.constructionEndDate,
          deliveryDate: data.deliveryDate,
          taxRate: data.taxRate,
          paymentTerms: data.paymentTerms,
          separateConstruction: data.separateConstruction,
          otherNotes: data.otherNotes,
          supervisorTradingPartnerId: data.supervisorTradingPartnerId,
          contractAmount: data.contractAmount,
          constructionPrice: data.constructionPrice,
          taxAmount: data.taxAmount,
          version: contract.version,
        };

        await updateContract(contractId, updateData);
        toast.success('契約書を更新しました。');
        navigate(`/projects/${projectId}/contracts/${contractId}`);
      } catch (err) {
        const classified = classifyContractError(err);
        toast.error(classified.message);
        setUpdateError(classified.message);
      } finally {
        setIsSubmitting(false);
      }
    },
    [contractId, contract, projectId, navigate, toast]
  );

  /**
   * キャンセル処理
   * Requirements: REQ-9.3
   *
   * 変更を破棄して契約書詳細画面に遷移する。
   */
  const handleCancel = useCallback(() => {
    navigate(`/projects/${projectId}/contracts/${contractId}`);
  }, [navigate, projectId, contractId]);

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

  // 見つからない表示（REQ-11.8）。再試行で解けないため再試行の釦を出さない
  if (notFoundTarget) {
    return (
      <main role="main" style={styles.container}>
        {notFoundTarget === 'contract' ? (
          <ResourceNotFound
            resourceType="契約書"
            returnPath={`/projects/${projectId}/contracts`}
            returnLabel="契約書一覧に戻る"
          />
        ) : (
          <ResourceNotFound
            resourceType="プロジェクト"
            returnPath="/projects"
            returnLabel="プロジェクト一覧に戻る"
          />
        )}
      </main>
    );
  }

  // エラー表示
  if (loadError) {
    return (
      <main role="main" style={styles.container}>
        <div role="alert" style={styles.errorContainer}>
          <p style={styles.errorText}>{loadError}</p>
          {loadErrorRetryable && (
            <button
              type="button"
              onClick={fetchData}
              style={{
                backgroundColor: '#dc2626',
                color: '#ffffff',
                border: 'none',
                padding: '8px 16px',
                fontSize: '14px',
                fontWeight: 500,
                borderRadius: '6px',
                cursor: 'pointer',
                marginTop: '8px',
              }}
            >
              再試行
            </button>
          )}
        </div>
      </main>
    );
  }

  if (!contract || !projectInfo || !projectId || !contractId) {
    return null;
  }

  return (
    <main role="main" style={styles.container} data-testid="contract-edit-page">
      {/* パンくずナビゲーション (REQ-9.4) */}
      <div style={styles.breadcrumbWrapper}>
        <Breadcrumb
          items={[
            { label: 'ダッシュボード', path: '/' },
            { label: 'プロジェクト一覧', path: '/projects' },
            { label: 'プロジェクト', path: `/projects/${projectId}` },
            { label: '契約書一覧', path: `/projects/${projectId}/contracts` },
            {
              label: '契約書詳細',
              path: `/projects/${projectId}/contracts/${contractId}`,
            },
            { label: '編集' },
          ]}
        />
      </div>

      {/* ヘッダー */}
      <div style={styles.header}>
        <h1 style={styles.title}>契約書編集</h1>
      </div>

      {/* 更新エラー表示 */}
      {updateError && (
        <div role="alert" style={styles.updateErrorContainer}>
          <p style={styles.errorText}>{updateError}</p>
        </div>
      )}

      {/* 契約書フォーム（mode='edit'、initialData付き） (REQ-9.1, REQ-9.5) */}
      <ContractForm
        mode="edit"
        projectId={projectId}
        projectInfo={projectInfo}
        onSubmit={handleSubmit}
        onCancel={handleCancel}
        initialData={contract}
        isSubmitting={isSubmitting}
      />
    </main>
  );
}
