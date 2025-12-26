/**
 * @fileoverview 現場調査編集ページ
 *
 * Task 22.1: ルーティング設定を実装する
 *
 * Requirements:
 * - 1.3: 現場調査情報を編集して保存（楽観的排他制御）
 * - 2.5: 全ての現場調査関連画面にブレッドクラムナビゲーションを表示する
 */

import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getSiteSurvey, updateSiteSurvey } from '../api/site-surveys';
import { ApiError } from '../api/client';
import type { SiteSurveyDetail } from '../types/site-survey.types';
import { Breadcrumb, ResourceNotFound } from '../components/common';
import SiteSurveyForm from '../components/site-surveys/SiteSurveyForm';
import type { SiteSurveyFormData } from '../components/site-surveys/SiteSurveyForm';
import { buildSiteSurveyEditBreadcrumb } from '../utils/siteSurveyBreadcrumb';
import { useToast } from '../hooks/useToast';

// ============================================================================
// スタイル定義
// ============================================================================

const styles = {
  container: {
    maxWidth: '1024px',
    margin: '0 auto',
    padding: '32px 16px',
  } as React.CSSProperties,
  breadcrumbContainer: {
    marginBottom: '24px',
  } as React.CSSProperties,
  header: {
    marginBottom: '24px',
  } as React.CSSProperties,
  title: {
    fontSize: '1.5rem',
    fontWeight: 600,
    color: '#111827',
    margin: 0,
  } as React.CSSProperties,
  formSection: {
    backgroundColor: '#ffffff',
    borderRadius: '8px',
    boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)',
    padding: '24px',
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
  submitErrorContainer: {
    backgroundColor: '#fef2f2',
    border: '1px solid #fecaca',
    borderRadius: '8px',
    padding: '16px',
    marginBottom: '16px',
  } as React.CSSProperties,
  submitErrorText: {
    color: '#991b1b',
    fontSize: '14px',
    margin: 0,
  } as React.CSSProperties,
};

// ============================================================================
// コンポーネント
// ============================================================================

/**
 * 現場調査編集ページ
 *
 * SiteSurveyFormを編集モードで表示し、
 * パンくずナビゲーションで現在位置を示す。
 */
export default function SiteSurveyEditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const toast = useToast();

  // データ状態
  const [survey, setSurvey] = useState<SiteSurveyDetail | null>(null);

  // UI状態
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // エラー状態
  const [error, setError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<unknown | null>(null);
  const [isNotFound, setIsNotFound] = useState(false);

  /**
   * 現場調査データを取得
   */
  const fetchSurvey = useCallback(async () => {
    if (!id) return;

    setIsLoading(true);
    setError(null);
    setIsNotFound(false);

    try {
      const data = await getSiteSurvey(id);
      setSurvey(data);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.statusCode === 404) {
          setIsNotFound(true);
          return;
        }
        setError(err.message || 'エラーが発生しました');
      } else {
        setError('エラーが発生しました');
      }
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  // 初回読み込み
  useEffect(() => {
    fetchSurvey();
  }, [fetchSurvey]);

  /**
   * フォーム送信ハンドラ
   */
  const handleSubmit = useCallback(
    async (data: SiteSurveyFormData) => {
      if (!id || !survey) return;

      setIsSubmitting(true);
      setSubmitError(null);

      try {
        // 楽観的排他制御用のexpectedUpdatedAtを含めてAPI呼び出し
        await updateSiteSurvey(
          id,
          {
            name: data.name,
            surveyDate: data.surveyDate,
            memo: data.memo,
          },
          survey.updatedAt
        );

        // 成功時はトースト表示と詳細ページへ遷移
        toast.success('現場調査を更新しました');
        navigate(`/site-surveys/${id}`);
      } catch (err) {
        if (err instanceof ApiError) {
          const errorMessage = err.message || '現場調査の更新に失敗しました';

          // トースト通知でエラーを表示
          toast.error(errorMessage);

          if (err.statusCode === 409) {
            // 競合エラー（楽観的排他制御）
            setSubmitError(errorMessage);
          } else {
            setSubmitError(errorMessage);
          }
        } else {
          const defaultErrorMessage = '現場調査の更新に失敗しました';
          toast.error(defaultErrorMessage);
          setSubmitError(defaultErrorMessage);
        }
      } finally {
        setIsSubmitting(false);
      }
    },
    [id, survey, navigate, toast]
  );

  /**
   * キャンセルハンドラ
   */
  const handleCancel = useCallback(() => {
    navigate(`/site-surveys/${id}`);
  }, [id, navigate]);

  // 存在しない現場調査の表示
  if (isNotFound) {
    return (
      <main role="main" style={styles.container}>
        <ResourceNotFound
          resourceType="現場調査"
          returnPath="/projects"
          returnLabel="プロジェクト一覧に戻る"
        />
      </main>
    );
  }

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

  // エラー表示（データ未取得の場合）
  if (error && !survey) {
    return (
      <main role="main" style={styles.container}>
        <div role="alert" style={styles.errorContainer}>
          <p style={styles.errorText}>{error}</p>
          <button type="button" onClick={fetchSurvey} style={styles.retryButton}>
            再試行
          </button>
        </div>
      </main>
    );
  }

  // 現場調査データがない場合
  if (!survey || !id) {
    return null;
  }

  // パンくずナビゲーション項目
  const breadcrumbItems = buildSiteSurveyEditBreadcrumb(
    survey.projectId,
    survey.project.name,
    survey.id,
    survey.name
  );

  // フォーム初期データ
  // surveyDateはISO形式（2025-01-15T00:00:00.000Z）で返されるため、YYYY-MM-DD形式に変換
  const initialData: Partial<SiteSurveyFormData> = {
    name: survey.name,
    surveyDate: survey.surveyDate.split('T')[0],
    memo: survey.memo,
  };

  return (
    <main role="main" style={styles.container}>
      {/* パンくずナビゲーション */}
      <div style={styles.breadcrumbContainer}>
        <Breadcrumb items={breadcrumbItems} />
      </div>

      {/* ページヘッダー */}
      <header style={styles.header}>
        <h1 style={styles.title}>現場調査を編集</h1>
      </header>

      {/* 送信エラー表示 */}
      {submitError !== null && (
        <div role="alert" style={styles.submitErrorContainer}>
          <p style={styles.submitErrorText}>
            {typeof submitError === 'string' ? submitError : '現場調査の更新に失敗しました'}
          </p>
        </div>
      )}

      {/* フォームセクション */}
      <section style={styles.formSection}>
        <SiteSurveyForm
          key={survey.id}
          mode="edit"
          initialData={initialData}
          onSubmit={handleSubmit}
          onCancel={handleCancel}
          isSubmitting={isSubmitting}
          submitError={submitError}
        />
      </section>
    </main>
  );
}
