/**
 * @fileoverview プロジェクト編集ページ
 *
 * Task 19.4: ProjectEditPageの実装とパンくずナビゲーション追加
 * Task 22.7: 409エラーハンドリングを追加
 *
 * ProjectFormコンポーネントを編集モードで使用。
 * パンくずナビゲーション、楽観的排他制御、保存成功時の詳細ページ遷移を提供。
 *
 * Requirements:
 * - 21.12: 編集ボタンクリックで編集ページへ遷移
 * - 21.17: パンくず: ダッシュボード > プロジェクト > [プロジェクト名] > 編集
 * - 21.18: パンくずナビゲーションのアクセシビリティ
 * - 21.21: 保存成功時に詳細ページへ遷移
 * - 21.23: /projects/:id/edit のURLで提供
 * - 8.1: 編集ボタンクリックで編集フォームを表示
 * - 8.2: 現在のプロジェクト情報がプリセットされた編集フォームを表示
 * - 8.3: 変更を保存時にプロジェクトレコードを更新
 * - 8.4: バリデーションエラーが発生するとエラーメッセージを表示
 * - 8.5: キャンセルボタンで詳細ページに戻る
 * - 8.6: 楽観的排他制御による競合検出
 * - 8.7: 更新時にプロジェクト名が重複している場合、409エラーを受け取りエラーメッセージを表示
 */

import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getProject, updateProject } from '../api/projects';
import { ApiError } from '../api/client';
import type { ProjectDetail } from '../types/project.types';
import { isDuplicateProjectNameErrorResponse } from '../types/project.types';
import { Breadcrumb, ResourceNotFound } from '../components/common';
import ProjectForm from '../components/projects/ProjectForm';
import type { ProjectFormData } from '../components/projects/ProjectForm';
import { useToast } from '../hooks/useToast';

// ============================================================================
// 型定義
// ============================================================================

// ApiError class is imported from '../api/client'

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
 * プロジェクト編集ページ
 *
 * ProjectFormを編集モードで表示し、
 * パンくずナビゲーションで現在位置を示す。
 *
 * Requirements:
 * - 8.1: 編集フォームを表示
 * - 8.2: 現在のプロジェクト情報がプリセットされたフォームを表示
 * - 8.3: 変更を保存時にプロジェクトレコードを更新
 * - 8.5: キャンセルで詳細ページに戻る
 * - 8.6: 楽観的排他制御による競合検出
 * - 21.17: パンくず: ダッシュボード > プロジェクト > [プロジェクト名] > 編集
 * - 21.21: 保存成功時に詳細ページへ遷移
 */
export default function ProjectEditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { projectUpdated, operationFailed } = useToast();

  // データ状態
  const [project, setProject] = useState<ProjectDetail | null>(null);

  // UI状態
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // エラー状態
  const [error, setError] = useState<string | null>(null);
  /**
   * サーバーからのエラーレスポンス
   * Task 22.7: ProjectFormに渡してプロジェクト名重複エラーをフィールドに表示
   * Requirements: 8.7
   */
  const [submitError, setSubmitError] = useState<unknown | null>(null);
  const [isNotFound, setIsNotFound] = useState(false);

  /**
   * プロジェクトデータを取得
   */
  const fetchProject = useCallback(async () => {
    if (!id) return;

    setIsLoading(true);
    setError(null);
    setIsNotFound(false);

    try {
      const data = await getProject(id);
      setProject(data);
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
    fetchProject();
  }, [fetchProject]);

  /**
   * フォーム送信ハンドラ
   * (REQ-8.3, 8.6, 8.7, 21.21)
   *
   * Task 22.7: 409エラーハンドリングを追加
   * - プロジェクト名重複エラー: submitErrorにサーバーレスポンスを保存しProjectFormに渡す
   * - 楽観的排他制御エラー: submitErrorにサーバーレスポンスを保存
   */
  const handleSubmit = useCallback(
    async (data: ProjectFormData) => {
      if (!id || !project) return;

      setIsSubmitting(true);
      // 再送信時にsubmitErrorをクリア（Task 22.7）
      setSubmitError(null);

      try {
        // 楽観的排他制御用のexpectedUpdatedAtを含めてAPI呼び出し
        await updateProject(
          id,
          {
            name: data.name,
            tradingPartnerId: data.tradingPartnerId,
            salesPersonId: data.salesPersonId,
            constructionPersonId: data.constructionPersonId,
            siteAddress: data.siteAddress,
            description: data.description,
          },
          project.updatedAt
        );

        // 成功時はトースト表示と詳細ページへ遷移
        projectUpdated();
        navigate(`/projects/${id}`);
      } catch (err) {
        if (err instanceof ApiError) {
          const errorMessage = err.message || 'プロジェクトの更新に失敗しました';

          // トースト通知でエラーを表示
          operationFailed(errorMessage);

          if (err.statusCode === 409 && isDuplicateProjectNameErrorResponse(err.response)) {
            // Task 22.7: プロジェクト名重複エラー（409）の場合
            // サーバーレスポンスをProjectFormに渡す
            // これにより、ProjectFormがプロジェクト名重複エラーをフィールドに表示できる
            setSubmitError(err.response);
          } else {
            // 楽観的排他制御エラー（409だがプロジェクト名重複ではない）や
            // その他のエラーは文字列として保存
            setSubmitError(errorMessage);
          }
        } else {
          const defaultErrorMessage = 'プロジェクトの更新に失敗しました';
          operationFailed(defaultErrorMessage);
          setSubmitError(defaultErrorMessage);
        }
      } finally {
        setIsSubmitting(false);
      }
    },
    [id, project, navigate, projectUpdated, operationFailed]
  );

  /**
   * キャンセルハンドラ
   * (REQ-8.5)
   */
  const handleCancel = useCallback(() => {
    navigate(`/projects/${id}`);
  }, [id, navigate]);

  // 存在しないプロジェクトの表示
  if (isNotFound) {
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
  /* v8 ignore next 3 - 防御的コード: 通常到達しない */
  if (!project || !id) {
    return null;
  }

  // パンくずナビゲーション項目 (REQ-21.17)
  const breadcrumbItems = [
    { label: 'ダッシュボード', path: '/' },
    { label: 'プロジェクト', path: '/projects' },
    { label: project.name, path: `/projects/${project.id}` },
    { label: '編集' },
  ];

  // フォーム初期データ
  const initialData: Partial<ProjectFormData> = {
    name: project.name,
    tradingPartnerId: project.tradingPartnerId ?? undefined,
    salesPersonId: project.salesPerson.id,
    constructionPersonId: project.constructionPerson?.id,
    siteAddress: project.siteAddress,
    description: project.description,
  };

  return (
    <main role="main" style={styles.container}>
      {/* パンくずナビゲーション (REQ-21.17) */}
      <div style={styles.breadcrumbContainer}>
        <Breadcrumb items={breadcrumbItems} />
      </div>

      {/* ページヘッダー */}
      <header style={styles.header}>
        <h1 style={styles.title}>プロジェクトを編集</h1>
      </header>

      {/*
        送信エラー表示 (REQ-8.6, 8.7)
        Task 22.7: プロジェクト名重複エラーはProjectForm内で表示するため、
        ここではプロジェクト名重複エラー以外のエラーのみ表示
      */}
      {submitError !== null && !isDuplicateProjectNameErrorResponse(submitError) && (
        <div role="alert" style={styles.submitErrorContainer}>
          <p style={styles.submitErrorText}>
            {typeof submitError === 'string'
              ? (submitError as string)
              : 'プロジェクトの更新に失敗しました'}
          </p>
        </div>
      )}

      {/* フォームセクション */}
      <section style={styles.formSection}>
        {/*
          ProjectForm (REQ-8.1, 8.2, 8.3, 8.4, 8.5, 8.7)
          - mode="edit" で編集モード
          - initialData で現在のプロジェクト情報をプリセット
          - key={project.id} でプロジェクト変更時にフォームをリセット
          - onSubmit で保存処理（楽観的排他制御）
          - onCancel で詳細ページへ戻る
          - submitError でサーバーエラーレスポンスを渡す（Task 22.7）
        */}
        <ProjectForm
          key={project.id}
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
