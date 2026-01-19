/**
 * @fileoverview 内訳書作成フォームコンポーネント
 *
 * Task 5.1: 内訳書作成フォームコンポーネントの実装
 * Task 5.2: 作成フォームのエラー表示とローディング
 *
 * Requirements:
 * - 1.1: 新規作成ボタンをクリックすると内訳書作成フォームが表示される
 * - 1.2: 数量表選択時に選択された数量表の項目数を表示する
 * - 1.4: 数量表未選択時のエラーメッセージ
 * - 1.5: 数量表は1つのみ選択可能
 * - 1.6: 内訳書名未入力時のエラーメッセージ
 * - 1.7: 内訳書名は最大200文字
 * - 1.8: 数量表がない場合は新規作成ボタンを無効化
 * - 1.9: 選択された数量表の項目数が0件の場合のエラー
 * - 1.10: 同名の内訳書が存在する場合のエラー
 * - 2.5: オーバーフローエラー
 * - 12.1: 集計処理中のローディングインジケーター
 * - 12.4: ローディング中は操作ボタンを無効化
 * - 12.5: ローディング完了時にインジケーターを非表示
 */

import { useState, useCallback, useMemo } from 'react';
import type { QuantityTableInfo } from '../../types/quantity-table.types';
import type {
  ItemizedStatementInfo,
  CreateItemizedStatementInput,
} from '../../types/itemized-statement.types';

// ============================================================================
// 型定義
// ============================================================================

/**
 * エラーレスポンス型
 */
interface ApiError {
  status?: number;
  code?: string;
  detail?: string;
}

/**
 * CreateItemizedStatementFormコンポーネントのProps
 */
export interface CreateItemizedStatementFormProps {
  /** プロジェクトID */
  projectId: string;
  /** 利用可能な数量表一覧 */
  quantityTables: QuantityTableInfo[];
  /** 作成成功時のコールバック */
  onSuccess: (statement: ItemizedStatementInfo) => void;
  /** キャンセル時のコールバック */
  onCancel: () => void;
  /**
   * 送信処理（テスト用にオプショナル）
   * デフォルトではAPIクライアントを使用
   */
  onSubmit?: (input: CreateItemizedStatementInput) => Promise<ItemizedStatementInfo>;
}

/**
 * フォームエラー状態
 */
interface FormErrors {
  name?: string;
  quantityTableId?: string;
  general?: string;
}

// ============================================================================
// スタイル定義
// ============================================================================

const styles = {
  form: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '16px',
  },
  fieldGroup: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '4px',
  },
  label: {
    fontSize: '14px',
    fontWeight: 500,
    color: '#374151',
  },
  required: {
    color: '#ef4444',
    marginLeft: '4px',
  },
  input: {
    padding: '8px 12px',
    borderRadius: '6px',
    border: '1px solid #d1d5db',
    fontSize: '14px',
    outline: 'none',
    transition: 'border-color 0.2s',
  },
  inputError: {
    borderColor: '#ef4444',
  },
  select: {
    padding: '8px 12px',
    borderRadius: '6px',
    border: '1px solid #d1d5db',
    fontSize: '14px',
    outline: 'none',
    backgroundColor: '#ffffff',
    cursor: 'pointer',
  },
  selectError: {
    borderColor: '#ef4444',
  },
  helperText: {
    fontSize: '12px',
    color: '#6b7280',
    marginTop: '4px',
  },
  itemCountText: {
    fontSize: '12px',
    color: '#2563eb',
    marginTop: '4px',
    fontWeight: 500,
  },
  errorText: {
    fontSize: '12px',
    color: '#ef4444',
    marginTop: '4px',
  },
  buttonGroup: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '12px',
    marginTop: '8px',
  },
  button: {
    padding: '8px 16px',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: 500,
    cursor: 'pointer',
    border: 'none',
    transition: 'background-color 0.2s',
  },
  submitButton: {
    backgroundColor: '#2563eb',
    color: '#ffffff',
  },
  submitButtonDisabled: {
    backgroundColor: '#9ca3af',
    cursor: 'not-allowed',
  },
  cancelButton: {
    backgroundColor: '#ffffff',
    color: '#374151',
    border: '1px solid #d1d5db',
  },
  cancelButtonDisabled: {
    backgroundColor: '#f3f4f6',
    color: '#9ca3af',
    cursor: 'not-allowed',
  },
  loadingWrapper: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  loadingSpinner: {
    width: '16px',
    height: '16px',
    border: '2px solid #ffffff',
    borderTopColor: 'transparent',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
  },
  emptyMessage: {
    padding: '16px',
    backgroundColor: '#fef3c7',
    borderRadius: '6px',
    color: '#92400e',
    fontSize: '14px',
    textAlign: 'center' as const,
  },
  generalError: {
    padding: '12px',
    backgroundColor: '#fef2f2',
    borderRadius: '6px',
    border: '1px solid #fecaca',
    color: '#991b1b',
    fontSize: '14px',
  },
};

// ============================================================================
// エラーメッセージ変換
// ============================================================================

/**
 * APIエラーコードからユーザーフレンドリーなメッセージに変換
 */
function getErrorMessage(error: ApiError): string {
  if (error.code === 'DUPLICATE_ITEMIZED_STATEMENT_NAME') {
    return '同名の内訳書が既に存在します';
  }
  if (error.code === 'QUANTITY_OVERFLOW') {
    return '数量の合計が許容範囲を超えています';
  }
  if (error.code === 'EMPTY_QUANTITY_ITEMS') {
    return '選択された数量表に項目がありません';
  }
  return error.detail || '内訳書の作成中にエラーが発生しました';
}

// ============================================================================
// ローディングインジケーター
// ============================================================================

/**
 * スピナーアイコン
 */
function LoadingSpinner() {
  return (
    <svg
      data-testid="loading-indicator"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{
        animation: 'spin 1s linear infinite',
      }}
    >
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </svg>
  );
}

// ============================================================================
// メインコンポーネント
// ============================================================================

/**
 * 内訳書作成フォーム
 *
 * プロジェクト詳細画面から内訳書を作成するためのフォームコンポーネント。
 * 数量表を選択してピボット集計を実行し、内訳書を生成する。
 *
 * @example
 * ```tsx
 * <CreateItemizedStatementForm
 *   projectId="project-123"
 *   quantityTables={tables}
 *   onSuccess={(statement) => navigate(`/itemized-statements/${statement.id}`)}
 *   onCancel={() => setShowForm(false)}
 * />
 * ```
 */
export function CreateItemizedStatementForm({
  projectId,
  quantityTables,
  onSuccess,
  onCancel,
  onSubmit,
}: CreateItemizedStatementFormProps) {
  // フォーム状態
  const [name, setName] = useState('');
  const [quantityTableId, setQuantityTableId] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});

  // 数量表が存在しない場合
  const hasNoQuantityTables = quantityTables.length === 0;

  // 選択された数量表の情報
  const selectedTable = useMemo(() => {
    return quantityTables.find((table) => table.id === quantityTableId);
  }, [quantityTables, quantityTableId]);

  // バリデーション
  const validate = useCallback((): boolean => {
    const newErrors: FormErrors = {};

    if (!name.trim()) {
      newErrors.name = '内訳書名を入力してください';
    }

    if (!quantityTableId) {
      newErrors.quantityTableId = '数量表を選択してください';
    } else if (selectedTable && selectedTable.itemCount === 0) {
      newErrors.quantityTableId = '選択された数量表に項目がありません';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [name, quantityTableId, selectedTable]);

  // フォーム送信
  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();

      if (!validate()) {
        return;
      }

      setIsSubmitting(true);
      setErrors({});

      try {
        const input: CreateItemizedStatementInput = {
          name: name.trim(),
          quantityTableId,
        };

        let result: ItemizedStatementInfo;

        if (onSubmit) {
          // テスト用のカスタム送信関数
          result = await onSubmit(input);
        } else {
          // 実際のAPI呼び出し（デフォルト）
          const { createItemizedStatement } = await import('../../api/itemized-statements');
          result = await createItemizedStatement(projectId, input);
        }

        onSuccess(result);
      } catch (error) {
        const apiError = error as ApiError;
        setErrors({
          general: getErrorMessage(apiError),
        });
      } finally {
        setIsSubmitting(false);
      }
    },
    [name, quantityTableId, validate, onSubmit, projectId, onSuccess]
  );

  // 名前変更ハンドラ
  const handleNameChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setName(e.target.value);
    setErrors((prev) => ({ ...prev, name: undefined }));
  }, []);

  // 数量表選択ハンドラ
  const handleQuantityTableChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    setQuantityTableId(e.target.value);
    setErrors((prev) => ({ ...prev, quantityTableId: undefined }));
  }, []);

  return (
    <form onSubmit={handleSubmit} style={styles.form}>
      {/* 数量表がない場合のメッセージ */}
      {hasNoQuantityTables && (
        <div style={styles.emptyMessage}>数量表がありません。先に数量表を作成してください。</div>
      )}

      {/* 一般エラー表示 */}
      {errors.general && <div style={styles.generalError}>{errors.general}</div>}

      {/* 内訳書名 */}
      <div style={styles.fieldGroup}>
        <label htmlFor="name" style={styles.label}>
          内訳書名<span style={styles.required}>*</span>
        </label>
        <input
          id="name"
          type="text"
          value={name}
          onChange={handleNameChange}
          maxLength={200}
          placeholder="内訳書名を入力"
          disabled={isSubmitting}
          style={{
            ...styles.input,
            ...(errors.name ? styles.inputError : {}),
          }}
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

      {/* 数量表選択 */}
      <div style={styles.fieldGroup}>
        <label htmlFor="quantityTableId" style={styles.label}>
          数量表<span style={styles.required}>*</span>
        </label>
        <select
          id="quantityTableId"
          value={quantityTableId}
          onChange={handleQuantityTableChange}
          disabled={isSubmitting || hasNoQuantityTables}
          style={{
            ...styles.select,
            ...(errors.quantityTableId ? styles.selectError : {}),
          }}
          aria-invalid={!!errors.quantityTableId}
          aria-describedby={
            errors.quantityTableId
              ? 'quantityTableId-error'
              : selectedTable
                ? 'quantityTableId-info'
                : undefined
          }
        >
          <option value="">数量表を選択してください</option>
          {quantityTables.map((table) => (
            <option key={table.id} value={table.id}>
              {table.name}
            </option>
          ))}
        </select>
        {errors.quantityTableId ? (
          <p id="quantityTableId-error" style={styles.errorText} role="alert">
            {errors.quantityTableId}
          </p>
        ) : selectedTable ? (
          <p id="quantityTableId-info" style={styles.itemCountText}>
            {selectedTable.itemCount}項目
          </p>
        ) : null}
      </div>

      {/* ボタングループ */}
      <div style={styles.buttonGroup}>
        <button
          type="button"
          onClick={onCancel}
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
          disabled={isSubmitting || hasNoQuantityTables}
          style={{
            ...styles.button,
            ...styles.submitButton,
            ...(isSubmitting || hasNoQuantityTables ? styles.submitButtonDisabled : {}),
          }}
        >
          {isSubmitting ? (
            <span style={styles.loadingWrapper}>
              <LoadingSpinner />
              作成中...
            </span>
          ) : (
            '作成'
          )}
        </button>
      </div>
    </form>
  );
}

export default CreateItemizedStatementForm;
