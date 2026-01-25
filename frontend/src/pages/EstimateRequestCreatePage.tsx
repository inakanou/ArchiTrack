/**
 * @fileoverview 見積依頼新規作成画面
 *
 * Task 6.1: EstimateRequestCreatePageの実装
 *
 * Requirements:
 * - 3.6: ユーザーが必須項目を入力して保存したとき、見積依頼を作成し詳細画面に遷移する
 */

import { useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { EstimateRequestForm } from '../components/estimate-request';
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
  backLink: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    color: '#2563eb',
    textDecoration: 'none',
    fontSize: '14px',
    marginBottom: '8px',
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
            { label: 'プロジェクト一覧', path: '/projects' },
            { label: 'プロジェクト詳細', path: `/projects/${projectId}` },
            { label: '見積依頼一覧', path: `/projects/${projectId}/estimate-requests` },
            { label: '新規作成' },
          ]}
        />
      </div>

      {/* ヘッダー */}
      <div style={styles.header}>
        <Link
          to={`/projects/${projectId}/estimate-requests`}
          style={styles.backLink}
          aria-label="一覧に戻る"
        >
          ← 一覧に戻る
        </Link>
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
