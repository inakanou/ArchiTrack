/**
 * @fileoverview 見積依頼フォームコンポーネント
 *
 * Task 5.3: EstimateRequestFormコンポーネントを実装する
 *
 * Requirements:
 * - 3.1: 新規作成時に見積依頼の名前入力フィールドを表示する
 * - 3.2: 新規作成時に宛先（取引先）選択フィールドを表示する
 * - 3.3: 新規作成時に参照する内訳書の選択フィールドを表示する
 * - 3.4: 宛先の候補として協力業者である取引先のみを表示する
 * - 3.5: 取引先の検索機能を提供する
 * - 3.6: ユーザーが必須項目を入力して保存したとき、見積依頼を作成
 * - 3.7: 必須項目が未入力の場合、バリデーションエラーを表示
 * - 3.8: 協力業者の取引先が存在しない場合、メッセージを表示
 * - 3.9: プロジェクトに内訳書が存在しない場合、メッセージを表示
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { getTradingPartners } from '../../api/trading-partners';
import { getItemizedStatements } from '../../api/itemized-statements';
import type { TradingPartnerInfo } from '../../types/trading-partner.types';
import type { ItemizedStatementInfo } from '../../types/itemized-statement.types';
import type {
  EstimateRequestInfo,
  CreateEstimateRequestInput,
} from '../../types/estimate-request.types';

// ============================================================================
// 型定義
// ============================================================================

/**
 * エラーレスポンス型（API Problem Details）
 */
interface ApiProblemDetails {
  status?: number;
  code?: string;
  detail?: string;
}

/**
 * APIクライアントから投げられるエラー型
 */
interface ApiClientError {
  statusCode?: number;
  message?: string;
  response?: ApiProblemDetails;
}

/**
 * フォーム初期値
 */
export interface EstimateRequestFormInitialData {
  /** 見積依頼名 */
  name?: string;
  /** 取引先ID */
  tradingPartnerId?: string;
  /** 内訳書ID */
  itemizedStatementId?: string;
}

/**
 * EstimateRequestFormコンポーネントのProps
 */
export interface EstimateRequestFormProps {
  /** プロジェクトID */
  projectId: string;
  /** 初期値（編集時） */
  initialData?: EstimateRequestFormInitialData;
  /** 作成成功時のコールバック */
  onSuccess: (request: EstimateRequestInfo) => void;
  /** キャンセル時のコールバック */
  onCancel: () => void;
  /**
   * 送信処理（テスト用にオプショナル）
   * デフォルトではAPIクライアントを使用
   */
  onSubmit?: (input: CreateEstimateRequestInput) => Promise<EstimateRequestInfo>;
}

/**
 * フォームエラー状態
 */
interface FormErrors {
  name?: string;
  tradingPartnerId?: string;
  itemizedStatementId?: string;
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
  loadingContainer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '32px',
    color: '#6b7280',
    fontSize: '14px',
  },
};

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
// エラーメッセージ変換
// ============================================================================

/**
 * APIエラーコードからユーザーフレンドリーなメッセージに変換
 */
function getErrorMessage(error: ApiClientError): string {
  const problemDetails = error.response;
  const code = problemDetails?.code;
  const detail = problemDetails?.detail || error.message;

  if (code === 'TRADING_PARTNER_NOT_SUBCONTRACTOR') {
    return '選択された取引先は協力業者ではありません';
  }
  if (code === 'EMPTY_ITEMIZED_STATEMENT_ITEMS') {
    return '選択された内訳書に項目がありません';
  }
  return detail || '見積依頼の作成中にエラーが発生しました';
}

// ============================================================================
// メインコンポーネント
// ============================================================================

/**
 * 見積依頼フォーム
 *
 * 見積依頼の作成・編集を行うフォームコンポーネント。
 * 名前、宛先（取引先）、参照内訳書の入力を受け付けます。
 *
 * @example
 * ```tsx
 * <EstimateRequestForm
 *   projectId="project-123"
 *   onSuccess={(request) => navigate(`/estimate-requests/${request.id}`)}
 *   onCancel={() => navigate(-1)}
 * />
 * ```
 */
export function EstimateRequestForm({
  projectId,
  initialData,
  onSuccess,
  onCancel,
  onSubmit,
}: EstimateRequestFormProps) {
  // データ取得状態
  const [tradingPartners, setTradingPartners] = useState<TradingPartnerInfo[]>([]);
  const [itemizedStatements, setItemizedStatements] = useState<ItemizedStatementInfo[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [dataFetchError, setDataFetchError] = useState<string | null>(null);

  // フォーム状態
  const [name, setName] = useState(initialData?.name || '');
  const [tradingPartnerId, setTradingPartnerId] = useState(initialData?.tradingPartnerId || '');
  const [itemizedStatementId, setItemizedStatementId] = useState(
    initialData?.itemizedStatementId || ''
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});

  // 協力業者が存在しない
  const hasNoSubcontractors = tradingPartners.length === 0;

  // 内訳書が存在しない
  const hasNoItemizedStatements = itemizedStatements.length === 0;

  // 選択された内訳書の情報
  const selectedStatement = useMemo(() => {
    return itemizedStatements.find((s) => s.id === itemizedStatementId);
  }, [itemizedStatements, itemizedStatementId]);

  // データ取得
  useEffect(() => {
    let mounted = true;

    const fetchData = async () => {
      try {
        setIsLoadingData(true);
        setDataFetchError(null);

        // 協力業者を取得（Requirements: 3.4）
        const partnersPromise = getTradingPartners({
          limit: 100,
          filter: { type: ['SUBCONTRACTOR'] },
          sort: 'nameKana',
          order: 'asc',
        });

        // 内訳書を取得
        const statementsPromise = getItemizedStatements(projectId, {
          limit: 100,
        });

        const [partnersResult, statementsResult] = await Promise.all([
          partnersPromise,
          statementsPromise,
        ]);

        if (mounted) {
          setTradingPartners(partnersResult.data);
          setItemizedStatements(statementsResult.data);
        }
      } catch {
        if (mounted) {
          setDataFetchError('データの取得に失敗しました');
        }
      } finally {
        if (mounted) {
          setIsLoadingData(false);
        }
      }
    };

    fetchData();

    return () => {
      mounted = false;
    };
  }, [projectId]);

  // バリデーション
  const validate = useCallback((): boolean => {
    const newErrors: FormErrors = {};

    if (!name.trim()) {
      newErrors.name = '名前を入力してください';
    }

    if (!tradingPartnerId) {
      newErrors.tradingPartnerId = '宛先を選択してください';
    }

    if (!itemizedStatementId) {
      newErrors.itemizedStatementId = '内訳書を選択してください';
    } else if (selectedStatement && selectedStatement.itemCount === 0) {
      newErrors.itemizedStatementId = '選択された内訳書に項目がありません';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [name, tradingPartnerId, itemizedStatementId, selectedStatement]);

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
        const input: CreateEstimateRequestInput = {
          name: name.trim(),
          tradingPartnerId,
          itemizedStatementId,
        };

        let result: EstimateRequestInfo;

        if (onSubmit) {
          result = await onSubmit(input);
        } else {
          const { createEstimateRequest } = await import('../../api/estimate-requests');
          result = await createEstimateRequest(projectId, input);
        }

        onSuccess(result);
      } catch (error) {
        const apiError = error as ApiClientError;
        setErrors({
          general: getErrorMessage(apiError),
        });
      } finally {
        setIsSubmitting(false);
      }
    },
    [name, tradingPartnerId, itemizedStatementId, validate, onSubmit, projectId, onSuccess]
  );

  // 名前変更ハンドラ
  const handleNameChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setName(e.target.value);
    setErrors((prev) => ({ ...prev, name: undefined }));
  }, []);

  // 取引先選択ハンドラ
  const handleTradingPartnerChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    setTradingPartnerId(e.target.value);
    setErrors((prev) => ({ ...prev, tradingPartnerId: undefined }));
  }, []);

  // 内訳書選択ハンドラ
  const handleItemizedStatementChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    setItemizedStatementId(e.target.value);
    setErrors((prev) => ({ ...prev, itemizedStatementId: undefined }));
  }, []);

  // ローディング中
  if (isLoadingData) {
    return (
      <div style={styles.loadingContainer}>
        <LoadingSpinner />
        <span style={{ marginLeft: '8px' }}>読み込み中...</span>
      </div>
    );
  }

  // データ取得エラー
  if (dataFetchError) {
    return <div style={styles.generalError}>{dataFetchError}</div>;
  }

  return (
    <form onSubmit={handleSubmit} style={styles.form}>
      {/* 協力業者がない場合のメッセージ（Requirements: 3.8） */}
      {hasNoSubcontractors && <div style={styles.emptyMessage}>協力業者が登録されていません。</div>}

      {/* 内訳書がない場合のメッセージ（Requirements: 3.9） */}
      {hasNoItemizedStatements && (
        <div style={styles.emptyMessage}>内訳書が登録されていません。</div>
      )}

      {/* 一般エラー表示 */}
      {errors.general && <div style={styles.generalError}>{errors.general}</div>}

      {/* 名前入力（Requirements: 3.1） */}
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

      {/* 宛先選択（Requirements: 3.2, 3.4） */}
      <div style={styles.fieldGroup}>
        <label htmlFor="tradingPartnerId" style={styles.label}>
          宛先（取引先）<span style={styles.required}>*</span>
        </label>
        <select
          id="tradingPartnerId"
          value={tradingPartnerId}
          onChange={handleTradingPartnerChange}
          disabled={isSubmitting || hasNoSubcontractors}
          style={{
            ...styles.select,
            ...(errors.tradingPartnerId ? styles.selectError : {}),
          }}
          aria-required="true"
          aria-invalid={!!errors.tradingPartnerId}
          aria-describedby={errors.tradingPartnerId ? 'tradingPartnerId-error' : undefined}
          aria-label="宛先"
        >
          <option value="">宛先を選択してください</option>
          {tradingPartners.map((partner) => (
            <option key={partner.id} value={partner.id}>
              {partner.name}
            </option>
          ))}
        </select>
        {errors.tradingPartnerId && (
          <p id="tradingPartnerId-error" style={styles.errorText} role="alert">
            {errors.tradingPartnerId}
          </p>
        )}
      </div>

      {/* 内訳書選択（Requirements: 3.3） */}
      <div style={styles.fieldGroup}>
        <label htmlFor="itemizedStatementId" style={styles.label}>
          内訳書<span style={styles.required}>*</span>
        </label>
        <select
          id="itemizedStatementId"
          value={itemizedStatementId}
          onChange={handleItemizedStatementChange}
          disabled={isSubmitting || hasNoItemizedStatements}
          style={{
            ...styles.select,
            ...(errors.itemizedStatementId ? styles.selectError : {}),
          }}
          aria-required="true"
          aria-invalid={!!errors.itemizedStatementId}
          aria-describedby={
            errors.itemizedStatementId
              ? 'itemizedStatementId-error'
              : selectedStatement
                ? 'itemizedStatementId-info'
                : undefined
          }
          aria-label="内訳書"
        >
          <option value="">内訳書を選択してください</option>
          {itemizedStatements.map((statement) => (
            <option key={statement.id} value={statement.id} disabled={statement.itemCount === 0}>
              {statement.name} ({statement.itemCount}項目)
            </option>
          ))}
        </select>
        {errors.itemizedStatementId ? (
          <p id="itemizedStatementId-error" style={styles.errorText} role="alert">
            {errors.itemizedStatementId}
          </p>
        ) : selectedStatement ? (
          <p id="itemizedStatementId-info" style={styles.itemCountText}>
            {selectedStatement.itemCount}項目
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
          disabled={isSubmitting || hasNoSubcontractors || hasNoItemizedStatements}
          style={{
            ...styles.button,
            ...styles.submitButton,
            ...(isSubmitting || hasNoSubcontractors || hasNoItemizedStatements
              ? styles.submitButtonDisabled
              : {}),
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

export default EstimateRequestForm;
