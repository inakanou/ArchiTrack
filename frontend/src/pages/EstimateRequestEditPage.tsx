/**
 * @fileoverview 見積依頼編集画面
 *
 * Task 6.3: EstimateRequestEditPageの実装
 *
 * Requirements:
 * - 9.3: ユーザーが編集ボタンをクリックしたとき、見積依頼の名前を編集可能にする
 * - 9.6: ユーザーが編集内容を保存したとき、変更を保存し詳細画面に遷移する
 */

import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { getEstimateRequestDetail, updateEstimateRequest } from '../api/estimate-requests';
import { Breadcrumb } from '../components/common';
import type {
  EstimateRequestInfo,
  UpdateEstimateRequestInput,
} from '../types/estimate-request.types';

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
  form: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '16px',
  } as React.CSSProperties,
  fieldGroup: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '4px',
  } as React.CSSProperties,
  label: {
    fontSize: '14px',
    fontWeight: 500,
    color: '#374151',
  } as React.CSSProperties,
  required: {
    color: '#ef4444',
    marginLeft: '4px',
  } as React.CSSProperties,
  input: {
    padding: '8px 12px',
    borderRadius: '6px',
    border: '1px solid #d1d5db',
    fontSize: '14px',
    outline: 'none',
    transition: 'border-color 0.2s',
  } as React.CSSProperties,
  inputError: {
    borderColor: '#ef4444',
  } as React.CSSProperties,
  helperText: {
    fontSize: '12px',
    color: '#6b7280',
    marginTop: '4px',
  } as React.CSSProperties,
  errorText: {
    fontSize: '12px',
    color: '#ef4444',
    marginTop: '4px',
  } as React.CSSProperties,
  readOnlyField: {
    padding: '8px 12px',
    borderRadius: '6px',
    border: '1px solid #e5e7eb',
    backgroundColor: '#f9fafb',
    fontSize: '14px',
    color: '#6b7280',
  } as React.CSSProperties,
  buttonGroup: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '12px',
    marginTop: '8px',
  } as React.CSSProperties,
  button: {
    padding: '8px 16px',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: 500,
    cursor: 'pointer',
    border: 'none',
    transition: 'background-color 0.2s',
  } as React.CSSProperties,
  submitButton: {
    backgroundColor: '#2563eb',
    color: '#ffffff',
  } as React.CSSProperties,
  submitButtonDisabled: {
    backgroundColor: '#9ca3af',
    cursor: 'not-allowed',
  } as React.CSSProperties,
  cancelButton: {
    backgroundColor: '#ffffff',
    color: '#374151',
    border: '1px solid #d1d5db',
  } as React.CSSProperties,
  cancelButtonDisabled: {
    backgroundColor: '#f3f4f6',
    color: '#9ca3af',
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
    padding: '24px',
    textAlign: 'center' as const,
  } as React.CSSProperties,
  errorMessage: {
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
  generalError: {
    padding: '12px',
    backgroundColor: '#fef2f2',
    borderRadius: '6px',
    border: '1px solid #fecaca',
    color: '#991b1b',
    fontSize: '14px',
  } as React.CSSProperties,
};

// ============================================================================
// 型定義
// ============================================================================

interface FormErrors {
  name?: string;
  general?: string;
}

// ============================================================================
// メインコンポーネント
// ============================================================================

/**
 * 見積依頼編集画面
 *
 * 見積依頼の名前を編集するフォームを表示し、
 * 保存完了後は詳細画面に遷移します。
 */
export default function EstimateRequestEditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  // データ状態
  const [request, setRequest] = useState<EstimateRequestInfo | null>(null);

  // フォーム状態
  const [name, setName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});

  // UI状態
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  /**
   * データ取得
   */
  const fetchData = useCallback(async () => {
    if (!id) return;

    setIsLoading(true);
    setFetchError(null);

    try {
      const data = await getEstimateRequestDetail(id);
      setRequest(data);
      setName(data.name);
    } catch {
      setFetchError('見積依頼の取得に失敗しました');
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  // 初回読み込み
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  /**
   * バリデーション
   */
  const validate = useCallback((): boolean => {
    const newErrors: FormErrors = {};

    if (!name.trim()) {
      newErrors.name = '名前を入力してください';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [name]);

  /**
   * フォーム送信
   */
  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();

      if (!validate() || !id || !request) {
        return;
      }

      setIsSubmitting(true);
      setErrors({});

      try {
        const input: UpdateEstimateRequestInput = {
          name: name.trim(),
        };

        await updateEstimateRequest(id, input, request.updatedAt);
        navigate(`/estimate-requests/${id}`);
      } catch {
        setErrors({
          general: '見積依頼の更新に失敗しました',
        });
      } finally {
        setIsSubmitting(false);
      }
    },
    [id, name, request, validate, navigate]
  );

  /**
   * 名前変更ハンドラ
   */
  const handleNameChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setName(e.target.value);
    setErrors((prev) => ({ ...prev, name: undefined }));
  }, []);

  /**
   * キャンセルハンドラ
   */
  const handleCancel = useCallback(() => {
    navigate(`/estimate-requests/${id}`);
  }, [navigate, id]);

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

  // エラー表示
  if (fetchError || !request) {
    return (
      <main role="main" style={styles.container}>
        <div role="alert" style={styles.errorContainer}>
          <p style={styles.errorMessage}>{fetchError || '見積依頼が見つかりません'}</p>
          <button type="button" onClick={fetchData} style={styles.retryButton}>
            再試行
          </button>
        </div>
      </main>
    );
  }

  return (
    <main role="main" style={styles.container} data-testid="estimate-request-edit-page">
      {/* パンくずナビゲーション */}
      <div style={styles.breadcrumbWrapper}>
        <Breadcrumb
          items={[
            { label: 'プロジェクト一覧', path: '/projects' },
            { label: 'プロジェクト詳細', path: `/projects/${request.projectId}` },
            {
              label: '見積依頼一覧',
              path: `/projects/${request.projectId}/estimate-requests`,
            },
            { label: '見積依頼詳細', path: `/estimate-requests/${request.id}` },
            { label: '編集' },
          ]}
        />
      </div>

      {/* ヘッダー */}
      <div style={styles.header}>
        <Link to={`/estimate-requests/${id}`} style={styles.backLink} aria-label="詳細に戻る">
          ← 詳細に戻る
        </Link>
        <h1 style={styles.title}>見積依頼 編集</h1>
      </div>

      {/* フォームカード */}
      <div style={styles.card}>
        <form onSubmit={handleSubmit} style={styles.form}>
          {/* 一般エラー表示 */}
          {errors.general && <div style={styles.generalError}>{errors.general}</div>}

          {/* 名前入力 */}
          <div style={styles.fieldGroup}>
            <label htmlFor="name" style={styles.label}>
              名前<span style={styles.required}>*</span>
            </label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={handleNameChange}
              maxLength={200}
              placeholder="見積依頼名を入力"
              disabled={isSubmitting}
              style={{
                ...styles.input,
                ...(errors.name ? styles.inputError : {}),
              }}
              aria-required="true"
              aria-invalid={!!errors.name}
              aria-describedby={errors.name ? 'name-error' : undefined}
            />
            {errors.name ? (
              <p id="name-error" style={styles.errorText} role="alert">
                {errors.name}
              </p>
            ) : (
              <p style={styles.helperText}>最大200文字</p>
            )}
          </div>

          {/* 宛先（読み取り専用） */}
          <div style={styles.fieldGroup}>
            <label style={styles.label}>宛先（取引先）</label>
            <div style={styles.readOnlyField}>{request.tradingPartnerName}</div>
            <p style={styles.helperText}>宛先は変更できません</p>
          </div>

          {/* 内訳書（読み取り専用） */}
          <div style={styles.fieldGroup}>
            <label style={styles.label}>内訳書</label>
            <div style={styles.readOnlyField}>{request.itemizedStatementName}</div>
            <p style={styles.helperText}>内訳書は変更できません</p>
          </div>

          {/* ボタングループ */}
          <div style={styles.buttonGroup}>
            <button
              type="button"
              onClick={handleCancel}
              disabled={isSubmitting}
              style={{
                ...styles.button,
                ...styles.cancelButton,
                ...(isSubmitting ? styles.cancelButtonDisabled : {}),
              }}
            >
              キャンセル
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              style={{
                ...styles.button,
                ...styles.submitButton,
                ...(isSubmitting ? styles.submitButtonDisabled : {}),
              }}
            >
              {isSubmitting ? '更新中...' : '更新'}
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
