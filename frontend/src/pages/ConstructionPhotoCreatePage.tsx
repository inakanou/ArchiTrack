/**
 * @fileoverview 工事写真アルバム作成ページ
 *
 * Task 6.2: アルバム作成/編集画面
 *
 * site-survey の SiteSurveyCreatePage を雛形に、工事写真アルバムの作成フォーム
 * （アルバム名・メモ）を提供する。5.1 のAPIクライアント createConstructionPhotoAlbum を
 * 使用し、作成成功後に一覧へ遷移して新規アルバムを反映させる。
 *
 * 注: ルート登録（routes.tsx）はこのタスクの境界外。フォームは本ページ内にインラインで
 * 実装し、境界（pages のみ）を維持する。
 *
 * Requirements:
 * - 1.1: アルバム作成フォーム送信で新規アルバムレコードを作成する
 */

import { useState, useCallback, useEffect, type FormEvent } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { createConstructionPhotoAlbum } from '../api/construction-photos';
import { getProject } from '../api/projects';
import { ApiError } from '../api/client';
import { useToast } from '../hooks/useToast';
import { Breadcrumb } from '../components/common';
import type { BreadcrumbItem } from '../components/common';
import type { ProjectDetail } from '../types/project.types';

// ============================================================================
// バリデーション定数
// ============================================================================

const NAME_MAX_LENGTH = 200;
const MEMO_MAX_LENGTH = 2000;

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
  fieldGroup: {
    marginBottom: '1rem',
  } as React.CSSProperties,
  label: {
    display: 'block',
    marginBottom: '0.5rem',
    fontWeight: 500,
    color: '#374151',
  } as React.CSSProperties,
  required: {
    color: '#dc2626',
    marginLeft: '0.25rem',
  } as React.CSSProperties,
  input: {
    width: '100%',
    padding: '0.5rem 0.75rem',
    border: '1px solid #d1d5db',
    borderRadius: '0.375rem',
    fontSize: '1rem',
    lineHeight: '1.5',
    boxSizing: 'border-box',
  } as React.CSSProperties,
  inputError: {
    border: '2px solid #dc2626',
  } as React.CSSProperties,
  textarea: {
    width: '100%',
    padding: '0.5rem 0.75rem',
    border: '1px solid #d1d5db',
    borderRadius: '0.375rem',
    fontSize: '1rem',
    lineHeight: '1.5',
    minHeight: '100px',
    resize: 'vertical',
    boxSizing: 'border-box',
  } as React.CSSProperties,
  fieldError: {
    marginTop: '0.25rem',
    fontSize: '0.875rem',
    color: '#dc2626',
  } as React.CSSProperties,
  actions: {
    display: 'flex',
    gap: '1rem',
    justifyContent: 'flex-end',
    marginTop: '1.5rem',
  } as React.CSSProperties,
  cancelButton: {
    padding: '0.75rem 1.5rem',
    backgroundColor: '#ffffff',
    color: '#111827',
    border: '1px solid #d1d5db',
    borderRadius: '0.375rem',
    fontSize: '1rem',
    fontWeight: 500,
    cursor: 'pointer',
  } as React.CSSProperties,
  submitButton: {
    padding: '0.75rem 1.5rem',
    backgroundColor: '#1d4ed8',
    color: '#ffffff',
    border: 'none',
    borderRadius: '0.375rem',
    fontSize: '1rem',
    fontWeight: 600,
    cursor: 'pointer',
  } as React.CSSProperties,
  submitButtonDisabled: {
    backgroundColor: '#6b7280',
    cursor: 'not-allowed',
  } as React.CSSProperties,
};

/**
 * アルバム名のバリデーション
 */
function validateName(value: string): string {
  if (!value.trim()) {
    return 'アルバム名は必須です';
  }
  if (value.length > NAME_MAX_LENGTH) {
    return `アルバム名は${NAME_MAX_LENGTH}文字以内で入力してください`;
  }
  return '';
}

/**
 * メモのバリデーション
 */
function validateMemo(value: string): string {
  if (value && value.length > MEMO_MAX_LENGTH) {
    return `メモは${MEMO_MAX_LENGTH}文字以内で入力してください`;
  }
  return '';
}

// ============================================================================
// コンポーネント
// ============================================================================

/**
 * 工事写真アルバム作成ページ
 *
 * アルバム作成フォームを提供し、作成成功時に一覧ページへ遷移する。
 */
export default function ConstructionPhotoCreatePage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const toast = useToast();

  const [project, setProject] = useState<ProjectDetail | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // フォーム状態
  const [name, setName] = useState('');
  const [memo, setMemo] = useState('');
  const [nameError, setNameError] = useState('');
  const [memoError, setMemoError] = useState('');

  /**
   * プロジェクト情報を取得（ブレッドクラム用）
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
   * アルバム作成
   */
  const handleSubmit = useCallback(
    async (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (!projectId) return;

      const nameValidation = validateName(name);
      const memoValidation = validateMemo(memo);
      setNameError(nameValidation);
      setMemoError(memoValidation);
      if (nameValidation || memoValidation) {
        return;
      }

      setIsSubmitting(true);

      try {
        await createConstructionPhotoAlbum(projectId, {
          name: name.trim(),
          memo: memo.trim() || null,
        });

        toast.success('工事写真アルバムを作成しました');
        // 作成したアルバムを一覧に反映するため一覧へ遷移する
        navigate(`/projects/${projectId}/construction-photos`);
      } catch (err) {
        const message =
          err instanceof ApiError && err.message ? err.message : '作成中にエラーが発生しました';
        toast.error(message);
      } finally {
        setIsSubmitting(false);
      }
    },
    [projectId, name, memo, navigate, toast]
  );

  /**
   * キャンセル
   */
  const handleCancel = useCallback(() => {
    if (projectId) {
      navigate(`/projects/${projectId}/construction-photos`);
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

  // ブレッドクラム生成（階層規約の共通化は Task 7.1 で実施予定）
  const breadcrumbItems: BreadcrumbItem[] = [
    { label: 'ダッシュボード', path: '/' },
    { label: 'プロジェクト一覧', path: '/projects' },
    { label: project.name, path: `/projects/${projectId}` },
    { label: '工事写真一覧', path: `/projects/${projectId}/construction-photos` },
    { label: '新規アルバム' },
  ];

  return (
    <main role="main" style={styles.container}>
      {/* パンくずナビゲーション */}
      <div style={styles.breadcrumbWrapper}>
        <Breadcrumb items={breadcrumbItems} />
      </div>

      {/* ヘッダー */}
      <div style={styles.header}>
        <Link to={`/projects/${projectId}/construction-photos`} style={styles.backLink}>
          &larr; 一覧に戻る
        </Link>
        <h1 style={styles.title}>新規アルバム</h1>
      </div>

      {/* フォーム */}
      <div style={styles.section}>
        <form onSubmit={handleSubmit} role="form">
          {/* アルバム名 */}
          <div style={styles.fieldGroup}>
            <label htmlFor="album-name" style={styles.label}>
              アルバム名
              <span style={styles.required} aria-hidden="true">
                *
              </span>
            </label>
            <input
              id="album-name"
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (nameError) setNameError(validateName(e.target.value));
              }}
              disabled={isSubmitting}
              aria-label="アルバム名"
              aria-required="true"
              aria-invalid={!!nameError}
              style={nameError ? { ...styles.input, ...styles.inputError } : styles.input}
            />
            {nameError && (
              <p role="alert" style={styles.fieldError}>
                {nameError}
              </p>
            )}
          </div>

          {/* メモ */}
          <div style={styles.fieldGroup}>
            <label htmlFor="album-memo" style={styles.label}>
              メモ
            </label>
            <textarea
              id="album-memo"
              value={memo}
              onChange={(e) => {
                setMemo(e.target.value);
                if (memoError) setMemoError(validateMemo(e.target.value));
              }}
              disabled={isSubmitting}
              rows={4}
              aria-label="メモ"
              aria-invalid={!!memoError}
              style={memoError ? { ...styles.textarea, ...styles.inputError } : styles.textarea}
            />
            {memoError && (
              <p role="alert" style={styles.fieldError}>
                {memoError}
              </p>
            )}
          </div>

          {/* ボタン */}
          <div style={styles.actions}>
            <button type="button" onClick={handleCancel} style={styles.cancelButton}>
              キャンセル
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              style={
                isSubmitting
                  ? { ...styles.submitButton, ...styles.submitButtonDisabled }
                  : styles.submitButton
              }
            >
              {isSubmitting ? '作成中...' : '作成'}
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
