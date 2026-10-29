/**
 * @fileoverview 見積依頼新規作成画面
 *
 * Task 6.1: EstimateRequestCreatePageの実装
 *
 * Requirements:
 * - 3.6: ユーザーが必須項目を入力して保存したとき、見積依頼を作成し詳細画面に遷移する
 *
 * Task 105.1 変更: プロジェクトの読み込み（プロジェクトの取得とフォームの内訳書の一覧の取得）が
 *   404 を受けたときに、プロジェクトが見つからない旨とプロジェクトの一覧へのリンクを表示する
 *   （estimate-request の Requirement 10.5）
 */

import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { EstimateRequestForm } from '../components/estimate-request';
import { getProject } from '../api/projects';
import { Breadcrumb, ResourceNotFound } from '../components/common';
import { isNotFoundError } from '../utils/estimateRequestNotFound';
import type { EstimateRequestInfo } from '../types/estimate-request.types';

// ============================================================================
// スタイル定義
// ============================================================================

const styles = {
  container: {
    maxWidth: '800px',
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
  card: {
    backgroundColor: '#ffffff',
    borderRadius: '8px',
    border: '1px solid #e5e7eb',
    padding: '24px',
  } as React.CSSProperties,
};

// ============================================================================
// メインコンポーネント
// ============================================================================

/**
 * 見積依頼新規作成画面
 *
 * 見積依頼の新規作成フォームを表示し、
 * 作成完了後は詳細画面に遷移します。
 */
export default function EstimateRequestCreatePage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();

  // プロジェクト名（パンくず表示用）
  const [projectName, setProjectName] = useState<string>('');
  // プロジェクトの読み込みが 404 を受けた（範囲外と不在を区別しない。REQ-10.5）
  const [isProjectNotFound, setIsProjectNotFound] = useState(false);

  useEffect(() => {
    if (!projectId) return;
    setIsProjectNotFound(false);
    getProject(projectId)
      .then((data) => {
        if (data?.name) {
          setProjectName(data.name);
        }
      })
      .catch((err: unknown) => {
        if (isNotFoundError(err)) {
          setIsProjectNotFound(true);
        }
        // 404 以外の失敗ではプロジェクト名のフォールバック表示を維持
      });
  }, [projectId]);

  /**
   * フォームの内訳書の一覧の取得が 404 を受けた（REQ-10.5）
   */
  const handleProjectNotFound = useCallback(() => {
    setIsProjectNotFound(true);
  }, []);

  /**
   * 作成成功時のコールバック
   * Requirements: 3.6 - 作成後に詳細画面に遷移
   */
  const handleSuccess = useCallback(
    (request: EstimateRequestInfo) => {
      navigate(`/estimate-requests/${request.id}`);
    },
    [navigate]
  );

  /**
   * キャンセル時のコールバック
   */
  const handleCancel = useCallback(() => {
    navigate(`/projects/${projectId}/estimate-requests`);
  }, [navigate, projectId]);

  // プロジェクトが見つからない表示（REQ-10.5）。フォームと再試行の釦を出さない
  if (isProjectNotFound) {
    return (
      <main role="main" style={styles.container}>
        <ResourceNotFound
          resourceType="プロジェクト"
          returnPath="/projects"
          returnLabel="プロジェクト一覧に戻る"
        />
      </main>
    );
  }

  return (
    <main role="main" style={styles.container} data-testid="estimate-request-create-page">
      {/* パンくずナビゲーション */}
      <div style={styles.breadcrumbWrapper}>
        <Breadcrumb
          items={[
            { label: 'ダッシュボード', path: '/' },
            { label: 'プロジェクト一覧', path: '/projects' },
            { label: projectName || 'プロジェクト', path: `/projects/${projectId}` },
            { label: '見積依頼一覧', path: `/projects/${projectId}/estimate-requests` },
            { label: '新規作成' },
          ]}
        />
      </div>

      {/* ヘッダー */}
      <div style={styles.header}>
        <h1 style={styles.title}>見積依頼 新規作成</h1>
      </div>

      {/* フォームカード */}
      <div style={styles.card}>
        <EstimateRequestForm
          projectId={projectId!}
          onSuccess={handleSuccess}
          onCancel={handleCancel}
          onProjectNotFound={handleProjectNotFound}
        />
      </div>
    </main>
  );
}
