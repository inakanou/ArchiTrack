/**
 * @fileoverview プロジェクト作成ページ
 *
 * Task 10.3: ルーティング設定
 *
 * Requirements:
 * - 1.1: 「新規作成」ボタンでプロジェクト作成フォームを表示する
 * - 1.7: 「作成」ボタンをクリックした場合、プロジェクトが作成され、詳細画面に遷移
 * - 1.8: 作成成功時に成功メッセージを表示
 * - 13.9: サーバーサイドバリデーションエラー発生時、エラーメッセージを該当フィールドに表示
 * - 18.1: APIエラーが発生した場合、エラーダイアログを表示
 */

import { useState, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { createProject } from '../api/projects';
import { ApiError } from '../api/client';
import { useToast } from '../hooks/useToast';
import ProjectForm from '../components/projects/ProjectForm';
import type { ProjectFormData } from '../components/projects/ProjectForm';

// ============================================================================
// スタイル定義
// ============================================================================

const styles = {
  container: {
    maxWidth: '768px',
    margin: '0 auto',
    padding: '32px 16px',
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
  section: {
    backgroundColor: '#ffffff',
    borderRadius: '8px',
    border: '1px solid #e5e7eb',
    padding: '24px',
  } as React.CSSProperties,
  errorAlert: {
    backgroundColor: '#fef2f2',
    border: '1px solid #fecaca',
    borderRadius: '8px',
    padding: '16px',
    marginBottom: '24px',
  } as React.CSSProperties,
  errorText: {
    color: '#991b1b',
    fontSize: '14px',
  } as React.CSSProperties,
};

// ============================================================================
// コンポーネント
// ============================================================================

/**
 * プロジェクト作成ページ
 *
 * プロジェクト作成フォームを提供し、作成成功時に詳細ページへ遷移します。
 */
export default function ProjectCreatePage() {
  const navigate = useNavigate();
  const toast = useToast();

  // UI状態
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * プロジェクト作成
   */
  const handleSubmit = useCallback(
    async (data: ProjectFormData) => {
      setIsSubmitting(true);
      setError(null);

      try {
        const created = await createProject({
          name: data.name,
          customerName: data.customerName,
          salesPersonId: data.salesPersonId,
          constructionPersonId: data.constructionPersonId,
          siteAddress: data.siteAddress,
          description: data.description,
        });

        // トースト通知で成功メッセージを表示
        toast.projectCreated();

        navigate(`/projects/${created.id}`);
      } catch (err) {
        if (err instanceof ApiError) {
          const errorMessage = err.message || '作成中にエラーが発生しました';
          setError(errorMessage);
          // トースト通知でエラーメッセージを表示
          toast.operationFailed(errorMessage);
        } else {
          const defaultErrorMessage = '作成中にエラーが発生しました';
          setError(defaultErrorMessage);
          toast.operationFailed(defaultErrorMessage);
        }
      } finally {
        setIsSubmitting(false);
      }
    },
    [navigate, toast]
  );

  /**
   * キャンセル
   */
  const handleCancel = useCallback(() => {
    navigate('/projects');
  }, [navigate]);

  return (
    <main role="main" style={styles.container}>
      {/* ヘッダー */}
      <div style={styles.header}>
        <Link to="/projects" style={styles.backLink}>
          ← 一覧に戻る
        </Link>
        <h1 style={styles.title}>新規プロジェクト</h1>
      </div>

      {/* エラー表示 */}
      {error && (
        <div role="alert" style={styles.errorAlert}>
          <p style={styles.errorText}>{error}</p>
        </div>
      )}

      {/* フォーム */}
      <div style={styles.section}>
        <ProjectForm
          mode="create"
          onSubmit={handleSubmit}
          onCancel={handleCancel}
          isSubmitting={isSubmitting}
        />
      </div>
    </main>
  );
}
