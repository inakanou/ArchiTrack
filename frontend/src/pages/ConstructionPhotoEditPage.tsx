/**
 * @fileoverview 工事写真アルバム編集ページ
 *
 * Task 6.2: アルバム作成/編集画面
 *
 * site-survey の SiteSurveyEditPage を雛形に、既存アルバムの編集フォーム
 * （アルバム名・メモ）を提供する。5.1 のAPIクライアント updateConstructionPhotoAlbum を
 * 使用し、楽観的排他制御（updatedAt）で更新する。更新成功後は一覧へ遷移する。
 *
 * 注: ルート登録（routes.tsx）はこのタスクの境界外。フォームは本ページ内にインラインで
 * 実装し、境界（pages のみ）を維持する。
 *
 * Requirements:
 * - 1.3: アルバム情報を編集して保存する（楽観的排他制御）
 * - 1.5: 競合検出時に競合エラーを表示する
 */

import { useState, useEffect, useCallback, type FormEvent } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  getConstructionPhotoAlbum,
  updateConstructionPhotoAlbum,
} from '../api/construction-photos';
import { getProject } from '../api/projects';
import { ApiError } from '../api/client';
import { useToast } from '../hooks/useToast';
import { Breadcrumb } from '../components/common';
import type { BreadcrumbItem } from '../components/common';
import type { ConstructionPhotoAlbum } from '../types/construction-photo.types';
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
    fontWeight: 500,
    borderRadius: '6px',
    cursor: 'pointer',
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
 * 工事写真アルバム編集ページ
 *
 * 既存アルバムの値をロードして編集フォームを表示し、
 * 楽観的排他制御で更新する。更新成功時に一覧ページへ遷移する。
 */
export default function ConstructionPhotoEditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const toast = useToast();

  const [album, setAlbum] = useState<ConstructionPhotoAlbum | null>(null);
  const [project, setProject] = useState<ProjectDetail | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isNotFound, setIsNotFound] = useState(false);

  // フォーム状態
  const [name, setName] = useState('');
  const [memo, setMemo] = useState('');
  const [nameError, setNameError] = useState('');
  const [memoError, setMemoError] = useState('');

  /**
   * アルバムとプロジェクトを取得
   */
  const fetchAlbum = useCallback(async () => {
    if (!id) return;

    setIsLoading(true);
    setError(null);
    setIsNotFound(false);

    try {
      const data = await getConstructionPhotoAlbum(id);
      setAlbum(data);
      setName(data.name);
      setMemo(data.memo ?? '');

      try {
        const projectData = await getProject(data.projectId);
        setProject(projectData);
      } catch {
        // プロジェクト取得失敗はブレッドクラムのみに影響するため致命的ではない
        setProject(null);
      }
    } catch (err) {
      if (err instanceof ApiError && err.statusCode === 404) {
        setIsNotFound(true);
        return;
      }
      setError(
        err instanceof ApiError ? err.message || 'エラーが発生しました' : 'エラーが発生しました'
      );
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchAlbum();
  }, [fetchAlbum]);

  /**
   * アルバム更新
   */
  const handleSubmit = useCallback(
    async (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (!id || !album) return;

      const nameValidation = validateName(name);
      const memoValidation = validateMemo(memo);
      setNameError(nameValidation);
      setMemoError(memoValidation);
      if (nameValidation || memoValidation) {
        return;
      }

      setIsSubmitting(true);

      try {
        await updateConstructionPhotoAlbum(
          id,
          {
            name: name.trim(),
            memo: memo.trim() || null,
          },
          album.updatedAt
        );

        toast.success('工事写真アルバムを更新しました');
        // 更新結果を一覧に反映するため一覧へ遷移する
        navigate(`/projects/${album.projectId}/construction-photos`);
      } catch (err) {
        const message =
          err instanceof ApiError && err.message ? err.message : '更新中にエラーが発生しました';
        toast.error(message);
      } finally {
        setIsSubmitting(false);
      }
    },
    [id, album, name, memo, navigate, toast]
  );

  /**
   * キャンセル
   */
  const handleCancel = useCallback(() => {
    if (album) {
      navigate(`/projects/${album.projectId}/construction-photos`);
    } else {
      navigate(-1);
    }
  }, [navigate, album]);

  // 存在しないアルバムの表示
  if (isNotFound) {
    return (
      <main role="main" style={styles.container}>
        <div role="alert" style={styles.errorAlert}>
          <p style={styles.errorText}>工事写真アルバムが見つかりません</p>
        </div>
      </main>
    );
  }

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

  // エラー表示（データ未取得の場合）
  if (error && !album) {
    return (
      <main role="main" style={styles.container}>
        <div role="alert" style={styles.errorAlert}>
          <p style={styles.errorText}>{error}</p>
          <button type="button" onClick={fetchAlbum} style={styles.retryButton}>
            再試行
          </button>
        </div>
      </main>
    );
  }

  if (!album || !id) {
    return null;
  }

  // ブレッドクラム生成（階層規約の共通化は Task 7.1 で実施予定）
  const breadcrumbItems: BreadcrumbItem[] = [
    { label: 'ダッシュボード', path: '/' },
    { label: 'プロジェクト一覧', path: '/projects' },
    ...(project ? [{ label: project.name, path: `/projects/${album.projectId}` }] : []),
    { label: '工事写真一覧', path: `/projects/${album.projectId}/construction-photos` },
    { label: 'アルバムを編集' },
  ];

  return (
    <main role="main" style={styles.container}>
      {/* パンくずナビゲーション */}
      <div style={styles.breadcrumbWrapper}>
        <Breadcrumb items={breadcrumbItems} />
      </div>

      {/* ヘッダー */}
      <div style={styles.header}>
        <h1 style={styles.title}>アルバムを編集</h1>
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
              {isSubmitting ? '保存中...' : '保存'}
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
