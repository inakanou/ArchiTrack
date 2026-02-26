/**
 * @fileoverview 見積依頼新規作成画面
 *
 * Task 6.1: EstimateRequestCreatePageの実装
 *
 * Requirements:
 * - 3.6: ユーザーが必須項目を入力して保存したとき、見積依頼を作成し詳細画面に遷移する
 */

import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { EstimateRequestForm } from '../components/estimate-request';
import { getProject } from '../api/projects';
import { Breadcrumb } from '../components/common';
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

  useEffect(() => {
    if (!projectId) return;
    getProject(projectId)
      .then((data) => {
        if (data?.name) {
          setProjectName(data.name);
        }
      })
      .catch(() => {
        // プロジェクト名取得失敗時はフォールバック表示を維持
      });
  }, [projectId]);

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
        />
      </div>
    </main>
  );
}
