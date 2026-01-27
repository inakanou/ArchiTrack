/**
 * @fileoverview 数量表新規作成画面
 *
 * Task 10.1: ルーティングと画面遷移の統合 - 新規作成画面
 *
 * Requirements:
 * - 2.1: 数量表名を入力して作成を確定する
 * - 2.2: 新しい数量表を作成し、数量表編集画面に遷移する
 * - 12.3: パンくずナビゲーション「プロジェクト一覧 > {プロジェクト名} > 数量表 > 新規作成」
 */

import { useState, useCallback, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { createQuantityTable } from '../api/quantity-tables';
import { getProject } from '../api/projects';
import type { ProjectDetail } from '../types/project.types';
import { Breadcrumb } from '../components/common';

// ============================================================================
// スタイル定義
// ============================================================================

const styles = {
  container: {
    maxWidth: '640px',
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
    marginBottom: '16px',
  } as React.CSSProperties,
  title: {
    fontSize: '24px',
    fontWeight: 'bold',
    color: '#1f2937',
    margin: 0,
  } as React.CSSProperties,
  form: {
    backgroundColor: '#ffffff',
    borderRadius: '8px',
    border: '1px solid #e5e7eb',
    padding: '24px',
  } as React.CSSProperties,
  formGroup: {
    marginBottom: '24px',
  } as React.CSSProperties,
  label: {
    display: 'block',
    fontSize: '14px',
    fontWeight: 500,
    color: '#374151',
    marginBottom: '8px',
  } as React.CSSProperties,
  input: {
    width: '100%',
    padding: '10px 12px',
    fontSize: '14px',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    outline: 'none',
    transition: 'border-color 0.2s, box-shadow 0.2s',
    boxSizing: 'border-box' as const,
  } as React.CSSProperties,
  inputFocused: {
    borderColor: '#2563eb',
    boxShadow: '0 0 0 3px rgba(37, 99, 235, 0.1)',
  } as React.CSSProperties,
  buttonGroup: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '12px',
  } as React.CSSProperties,
  cancelButton: {
    padding: '10px 20px',
    fontSize: '14px',
    fontWeight: 500,
    color: '#374151',
    backgroundColor: '#ffffff',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    cursor: 'pointer',
    textDecoration: 'none',
    display: 'inline-flex',
    alignItems: 'center',
    transition: 'background-color 0.2s',
  } as React.CSSProperties,
  createButton: {
    padding: '10px 20px',
    fontSize: '14px',
    fontWeight: 500,
    color: '#ffffff',
    backgroundColor: '#2563eb',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    transition: 'background-color 0.2s',
  } as React.CSSProperties,
  createButtonDisabled: {
    backgroundColor: '#93c5fd',
    cursor: 'not-allowed',
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
    padding: '16px',
    marginBottom: '16px',
  } as React.CSSProperties,
  errorText: {
    color: '#991b1b',
    fontSize: '14px',
    margin: 0,
  } as React.CSSProperties,
};

// ============================================================================
// メインコンポーネント
// ============================================================================

/**
 * 数量表新規作成画面
 *
 * プロジェクトに紐付く新しい数量表を作成します。
 */
export default function QuantityTableCreatePage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();

  // プロジェクト情報
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [isLoadingProject, setIsLoadingProject] = useState(true);
  const [projectError, setProjectError] = useState<string | null>(null);

  // フォーム状態
  const [name, setName] = useState('数量表');
  const [isInputFocused, setIsInputFocused] = useState(false);

  // 送信状態
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  /**
   * プロジェクト情報を取得
   */
  const fetchProject = useCallback(async () => {
    if (!projectId) return;

    setIsLoadingProject(true);
    setProjectError(null);

    try {
      const projectData = await getProject(projectId);
      setProject(projectData);
    } catch {
      setProjectError('プロジェクト情報の取得に失敗しました');
    } finally {
      setIsLoadingProject(false);
    }
  }, [projectId]);

  // 初回読み込み
  useEffect(() => {
    fetchProject();
  }, [fetchProject]);

  /**
   * 数量表作成ハンドラ
   */
  const handleCreate = useCallback(async () => {
    if (!projectId || !name.trim()) return;

    setIsCreating(true);
    setCreateError(null);

    try {
      const result = await createQuantityTable(projectId, { name: name.trim() });
      // REQ-2.2: 作成成功後に編集画面に遷移
      navigate(`/quantity-tables/${result.id}/edit`);
    } catch {
      setCreateError('数量表の作成に失敗しました');
    } finally {
      setIsCreating(false);
    }
  }, [projectId, name, navigate]);

  /**
   * Enterキーで作成
   */
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter' && name.trim() && !isCreating) {
        handleCreate();
      }
    },
    [name, isCreating, handleCreate]
  );

  // ローディング表示
  if (isLoadingProject) {
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

  // プロジェクトエラー表示
  if (projectError) {
    return (
      <main role="main" style={styles.container}>
        <div role="alert" style={styles.errorContainer}>
          <p style={styles.errorText}>{projectError}</p>
        </div>
      </main>
    );
  }

  const isSubmitDisabled = !name.trim() || isCreating;

  return (
    <main role="main" style={styles.container}>
      {/* パンくずナビゲーション */}
      {/* REQ-12.3: プロジェクト一覧 > {プロジェクト名} > 数量表 > 新規作成 */}
      <nav aria-label="breadcrumb" style={styles.breadcrumbWrapper}>
        <Breadcrumb
          items={[
            { label: 'ダッシュボード', path: '/' },
            { label: 'プロジェクト', path: '/projects' },
            { label: project?.name ?? 'プロジェクト', path: `/projects/${projectId}` },
            { label: '数量表一覧', path: `/projects/${projectId}/quantity-tables` },
            { label: '新規作成' },
          ]}
        />
      </nav>

      {/* ヘッダー */}
      <div style={styles.header}>
        <Link
          to={`/projects/${projectId}/quantity-tables`}
          style={styles.backLink}
          aria-label="数量表一覧に戻る"
        >
          ← 数量表一覧に戻る
        </Link>
        <h1 style={styles.title}>数量表を新規作成</h1>
      </div>

      {/* フォーム */}
      <div style={styles.form}>
        {/* エラー表示 */}
        {createError && (
          <div role="alert" style={styles.errorContainer}>
            <p style={styles.errorText}>{createError}</p>
          </div>
        )}

        {/* 数量表名入力 */}
        <div style={styles.formGroup}>
          <label htmlFor="quantity-table-name" style={styles.label}>
            数量表名
          </label>
          <input
            id="quantity-table-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onFocus={() => setIsInputFocused(true)}
            onBlur={() => setIsInputFocused(false)}
            onKeyDown={handleKeyDown}
            placeholder="例: 第1回見積数量表"
            style={{
              ...styles.input,
              ...(isInputFocused ? styles.inputFocused : {}),
            }}
            autoFocus
          />
        </div>

        {/* ボタン */}
        <div style={styles.buttonGroup}>
          <Link to={`/projects/${projectId}/quantity-tables`} style={styles.cancelButton}>
            キャンセル
          </Link>
          <button
            type="button"
            onClick={handleCreate}
            disabled={isSubmitDisabled}
            style={{
              ...styles.createButton,
              ...(isSubmitDisabled ? styles.createButtonDisabled : {}),
            }}
          >
            {isCreating ? '作成中...' : '作成'}
          </button>
        </div>
      </div>
    </main>
  );
}
