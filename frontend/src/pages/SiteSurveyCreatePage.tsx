/**
 * @fileoverview 現場調査作成ページ
 *
 * Task 22.1: ルーティング設定を実装する
 *
 * Requirements:
 * - 1.1: 現場調査作成フォームで必須フィールド（調査名、調査日）を入力可能
 * - 2.5: 全ての現場調査関連画面にブレッドクラムナビゲーションを表示する
 */

import { useState, useCallback, useEffect } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { createSiteSurvey } from '../api/site-surveys';
import { getProject } from '../api/projects';
import { ApiError } from '../api/client';
import { useToast } from '../hooks/useToast';
import SiteSurveyForm from '../components/site-surveys/SiteSurveyForm';
import type { SiteSurveyFormData } from '../components/site-surveys/SiteSurveyForm';
import { Breadcrumb } from '../components/common';
import { buildSiteSurveyCreateBreadcrumb } from '../utils/siteSurveyBreadcrumb';
import type { ProjectDetail } from '../types/project.types';

// ============================================================================
// スタイル定義
// ============================================================================

const styles = {
  container: {
    maxWidth: '768px',
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
  } as React.CSSProperties,
};

// ============================================================================
// コンポーネント
// ============================================================================

/**
 * 現場調査作成ページ
 *
 * 現場調査作成フォームを提供し、作成成功時に詳細ページへ遷移します。
 */
export default function SiteSurveyCreatePage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const toast = useToast();

  // データ状態
  const [project, setProject] = useState<ProjectDetail | null>(null);

  // UI状態
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<unknown | null>(null);

  /**
   * プロジェクト情報を取得
   */
  useEffect(() => {
    const fetchProject = async () => {
      if (!projectId) return;

      try {
        const data = await getProject(projectId);
        setProject(data);
      } catch (err) {
        if (err instanceof ApiError) {
          setError(err.message || 'プロジェクトの取得に失敗しました');
        } else {
          setError('プロジェクトの取得に失敗しました');
        }
      } finally {
        setIsLoading(false);
      }
    };

    fetchProject();
  }, [projectId]);

  /**
   * 現場調査作成
   */
  const handleSubmit = useCallback(
    async (data: SiteSurveyFormData) => {
      if (!projectId) return;

      setIsSubmitting(true);
      setError(null);
      setSubmitError(null);

      try {
        const created = await createSiteSurvey(projectId, {
          name: data.name,
          surveyDate: data.surveyDate,
          memo: data.memo,
        });

        // トースト通知で成功メッセージを表示
        toast.success('現場調査を作成しました');

        navigate(`/site-surveys/${created.id}`);
      } catch (err) {
        if (err instanceof ApiError) {
          const errorMessage = err.message || '作成中にエラーが発生しました';
          setError(errorMessage);
          toast.error(errorMessage);

          if (err.statusCode === 409) {
            setSubmitError(err.response);
          }
        } else {
          const defaultErrorMessage = '作成中にエラーが発生しました';
          setError(defaultErrorMessage);
          toast.error(defaultErrorMessage);
        }
      } finally {
        setIsSubmitting(false);
      }
    },
    [projectId, navigate, toast]
  );

  /**
   * キャンセル
   */
  const handleCancel = useCallback(() => {
    if (projectId) {
      navigate(`/projects/${projectId}/site-surveys`);
    } else {
      navigate(-1);
    }
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

  // プロジェクトが見つからない場合
  if (!project || !projectId) {
    return (
      <main role="main" style={styles.container}>
        <div role="alert" style={styles.errorAlert}>
          <p style={styles.errorText}>{error || 'プロジェクトが見つかりません'}</p>
        </div>
      </main>
    );
  }

  // ブレッドクラム生成
  const breadcrumbItems = buildSiteSurveyCreateBreadcrumb(projectId, project.name);

  return (
    <main role="main" style={styles.container}>
      {/* パンくずナビゲーション */}
      <div style={styles.breadcrumbWrapper}>
        <Breadcrumb items={breadcrumbItems} />
      </div>

      {/* ヘッダー */}
      <div style={styles.header}>
        <Link to={`/projects/${projectId}/site-surveys`} style={styles.backLink}>
          &larr; 一覧に戻る
        </Link>
        <h1 style={styles.title}>新規現場調査</h1>
      </div>

      {/* エラー表示 */}
      {error && (
        <div role="alert" style={styles.errorAlert}>
          <p style={styles.errorText}>{error}</p>
        </div>
      )}

      {/* フォーム */}
      <div style={styles.section}>
        <SiteSurveyForm
          mode="create"
          initialData={{ name: '現場調査' }}
          onSubmit={handleSubmit}
          onCancel={handleCancel}
          isSubmitting={isSubmitting}
          submitError={submitError}
        />
      </div>
    </main>
  );
}
