/**
 * @fileoverview 見積書新規作成画面
 *
 * Task 11.2: EstimateCreatePageの実装
 *
 * Requirements (estimate-creation):
 * - REQ-3.1: 見積書新規作成を選択した場合、内訳書の選択画面を表示する
 * - REQ-3.2: 内訳書を選択した場合、見積金額行の初期値として設定する
 * - REQ-3.3: 内訳書を選択せずに作成した場合、空の見積書を作成する
 * - REQ-3.4: 見積書をプロジェクトに紐付けて保存する
 * - REQ-3.5: 内訳書が選択された場合、名称・規格・単位・数量を見積金額行に転記する
 *
 * @module pages/EstimateCreatePage
 */

import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { createEstimate } from '../api/estimates';
import { getItemizedStatements } from '../api/itemized-statements';
import type { CreateEstimateInput } from '../api/estimates';
import { Breadcrumb } from '../components/common';

// ============================================================================
// 型定義
// ============================================================================

interface ItemizedStatementOption {
  id: string;
  name: string;
}

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
  form: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '24px',
  } as React.CSSProperties,
  formGroup: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '8px',
  } as React.CSSProperties,
  label: {
    fontSize: '14px',
    fontWeight: 500,
    color: '#374151',
  } as React.CSSProperties,
  required: {
    color: '#dc2626',
    marginLeft: '4px',
  } as React.CSSProperties,
  input: {
    padding: '10px 14px',
    borderRadius: '6px',
    border: '1px solid #d1d5db',
    fontSize: '14px',
    color: '#1f2937',
    outline: 'none',
    transition: 'border-color 0.2s',
  } as React.CSSProperties,
  select: {
    padding: '10px 14px',
    borderRadius: '6px',
    border: '1px solid #d1d5db',
    fontSize: '14px',
    color: '#1f2937',
    outline: 'none',
    backgroundColor: '#ffffff',
    cursor: 'pointer',
  } as React.CSSProperties,
  helpText: {
    fontSize: '12px',
    color: '#6b7280',
  } as React.CSSProperties,
  buttonGroup: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '12px',
    marginTop: '16px',
  } as React.CSSProperties,
  cancelButton: {
    padding: '10px 20px',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: 500,
    backgroundColor: '#ffffff',
    color: '#374151',
    border: '1px solid #d1d5db',
    cursor: 'pointer',
  } as React.CSSProperties,
  submitButton: {
    padding: '10px 20px',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: 500,
    backgroundColor: '#2563eb',
    color: '#ffffff',
    border: 'none',
    cursor: 'pointer',
  } as React.CSSProperties,
  submitButtonDisabled: {
    backgroundColor: '#93c5fd',
    cursor: 'not-allowed',
  } as React.CSSProperties,
  errorContainer: {
    backgroundColor: '#fef2f2',
    border: '1px solid #fecaca',
    borderRadius: '8px',
    padding: '12px 16px',
    marginBottom: '16px',
  } as React.CSSProperties,
  errorText: {
    color: '#991b1b',
    fontSize: '14px',
    margin: 0,
  } as React.CSSProperties,
  loadingContainer: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    padding: '48px 16px',
  } as React.CSSProperties,
  loadingSpinner: {
    width: '32px',
    height: '32px',
    border: '3px solid #e5e7eb',
    borderTop: '3px solid #2563eb',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
    marginBottom: '12px',
  } as React.CSSProperties,
};

// ============================================================================
// メインコンポーネント
// ============================================================================

/**
 * 見積書新規作成画面
 *
 * Requirements:
 * - REQ-3.1: 内訳書の選択画面を表示
 * - REQ-3.2: 内訳書選択時に初期値として設定
 * - REQ-3.3: 内訳書未選択時は空の見積書を作成
 * - REQ-3.4: プロジェクトに紐付けて保存
 */
export default function EstimateCreatePage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();

  // フォーム状態
  const [name, setName] = useState('見積書');
  const [sourceItemizedStatementId, setSourceItemizedStatementId] = useState('');

  // 内訳書オプション
  const [itemizedStatements, setItemizedStatements] = useState<ItemizedStatementOption[]>([]);
  const [isLoadingStatements, setIsLoadingStatements] = useState(true);

  // UI状態
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * 内訳書一覧を取得
   * Requirements: REQ-3.1
   */
  useEffect(() => {
    async function fetchItemizedStatements() {
      if (!projectId) return;

      setIsLoadingStatements(true);
      try {
        const result = await getItemizedStatements(projectId, { limit: 100 });
        setItemizedStatements(
          result.data.map((is) => ({
            id: is.id,
            name: is.name,
          }))
        );
      } catch {
        // 内訳書取得エラーは無視（選択肢が空になるだけ）
      } finally {
        setIsLoadingStatements(false);
      }
    }

    fetchItemizedStatements();
  }, [projectId]);

  /**
   * フォーム送信処理
   * Requirements: REQ-3.2, REQ-3.3, REQ-3.4, REQ-3.5
   */
  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();

      if (!projectId || !name.trim()) return;

      setIsSubmitting(true);
      setError(null);

      try {
        const input: CreateEstimateInput = {
          name: name.trim(),
        };

        // 内訳書が選択されている場合のみ追加
        if (sourceItemizedStatementId) {
          input.sourceItemizedStatementId = sourceItemizedStatementId;
        }

        const estimate = await createEstimate(projectId, input);

        // 詳細画面に遷移
        navigate(`/estimates/${estimate.id}`);
      } catch {
        setError('見積書の作成に失敗しました');
      } finally {
        setIsSubmitting(false);
      }
    },
    [projectId, name, sourceItemizedStatementId, navigate]
  );

  /**
   * キャンセル処理
   */
  const handleCancel = useCallback(() => {
    navigate(`/projects/${projectId}/estimates`);
  }, [navigate, projectId]);

  const isFormValid = name.trim().length > 0;

  return (
    <main role="main" style={styles.container} data-testid="estimate-create-page">
      {/* パンくずナビゲーション (REQ-15.5-15.7, REQ-15.11) */}
      <div style={styles.breadcrumbWrapper}>
        <Breadcrumb
          items={[
            { label: 'ダッシュボード', path: '/' },
            { label: 'プロジェクト一覧', path: '/projects' },
            { label: 'プロジェクト', path: `/projects/${projectId}` },
            { label: '見積書一覧', path: `/projects/${projectId}/estimates` },
            { label: '新規作成' },
          ]}
        />
      </div>

      {/* ヘッダー */}
      <div style={styles.header}>
        <h1 style={styles.title}>見積書作成</h1>
      </div>

      {/* フォームカード */}
      <div style={styles.card}>
        {/* エラー表示 */}
        {error && (
          <div role="alert" style={styles.errorContainer}>
            <p style={styles.errorText}>{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} style={styles.form}>
          {/* 見積書名 */}
          <div style={styles.formGroup}>
            <label htmlFor="estimate-name" style={styles.label}>
              見積書名
              <span style={styles.required}>*</span>
            </label>
            <input
              id="estimate-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例: 建築工事見積書"
              maxLength={200}
              style={styles.input}
              disabled={isSubmitting}
            />
          </div>

          {/* 内訳書選択 */}
          <div style={styles.formGroup}>
            <label htmlFor="itemized-statement" style={styles.label}>
              内訳書を選択
            </label>
            {isLoadingStatements ? (
              <div style={styles.loadingContainer}>
                <div style={styles.loadingSpinner} />
                <p>内訳書を読み込み中...</p>
                <style>
                  {`
                    @keyframes spin {
                      0% { transform: rotate(0deg); }
                      100% { transform: rotate(360deg); }
                    }
                  `}
                </style>
              </div>
            ) : (
              <>
                <select
                  id="itemized-statement"
                  aria-label="内訳書を選択"
                  value={sourceItemizedStatementId}
                  onChange={(e) => setSourceItemizedStatementId(e.target.value)}
                  style={styles.select}
                  disabled={isSubmitting}
                >
                  <option value="">選択しない</option>
                  {itemizedStatements.map((is) => (
                    <option key={is.id} value={is.id}>
                      {is.name}
                    </option>
                  ))}
                </select>
                <p style={styles.helpText}>
                  内訳書を選択すると、その項目が見積金額行の初期値として設定されます。
                </p>
              </>
            )}
          </div>

          {/* ボタン */}
          <div style={styles.buttonGroup}>
            <button
              type="button"
              onClick={handleCancel}
              style={styles.cancelButton}
              disabled={isSubmitting}
            >
              キャンセル
            </button>
            <button
              type="submit"
              disabled={!isFormValid || isSubmitting}
              style={{
                ...styles.submitButton,
                ...(!isFormValid || isSubmitting ? styles.submitButtonDisabled : {}),
              }}
            >
              {isSubmitting ? '作成中...' : '作成'}
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
