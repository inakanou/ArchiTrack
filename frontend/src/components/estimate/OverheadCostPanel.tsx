/**
 * @fileoverview OverheadCostPanelコンポーネント - 諸経費計算UI
 *
 * Task 10.3: OverheadCostPanelコンポーネントの実装
 *
 * 諸経費（共通仮設費/現場管理費/一般管理費）計算のUIコンポーネントです。
 * 国土交通省の公共建築工事共通費積算基準に準じた自動計算機能を提供します。
 *
 * Requirements (estimate-creation):
 * - REQ-7.1: 共通仮設費行の追加を選択した場合、プリセット値を設定する
 * - REQ-7.2: 共通仮設費の単価を手入力で設定可能とする
 * - REQ-7.3: 自動計算機能が有効な場合、国土交通省基準の計算式に準じて単価を自動計算する
 * - REQ-7.4: 自動計算機能が有効な場合、計算に必要なパラメータの入力画面を提供する
 * - REQ-7.5: 自動計算結果を手入力で上書き可能とする
 * - REQ-7.6: 計算中であることを表示する
 * - REQ-8.1〜8.6: 現場管理費（同様）
 * - REQ-9.1〜9.6: 一般管理費（同様）
 *
 * @module components/estimate/OverheadCostPanel
 */

import { useState, useCallback } from 'react';
import Decimal from 'decimal.js';

// ============================================================================
// 型定義
// ============================================================================

/**
 * 諸経費種別
 */
export type OverheadCostType = 'COMMON_TEMPORARY' | 'SITE_MANAGEMENT' | 'GENERAL_ADMIN';

/**
 * 計算結果
 */
export interface OverheadCostResult {
  rate: string;
  amount: string;
  formula: string;
}

/**
 * 計算パラメータ
 */
export interface CalculateOverheadParams {
  costType: OverheadCostType;
  directCost: string;
  constructionPeriod?: string;
  pureConstructionCost?: string;
  constructionCost?: string;
  isRenovation: boolean;
}

/**
 * 項目追加パラメータ
 */
export interface AddOverheadItemParams {
  costType: OverheadCostType;
  name: string;
  specification: string;
  unit: string;
  quantity: string;
  unitPrice: string;
}

/**
 * OverheadCostPanelコンポーネントのProps
 */
export interface OverheadCostPanelProps {
  /** 見積書ID */
  estimateId: string;
  /** 項目追加時のコールバック */
  onItemAdded: (params: AddOverheadItemParams) => void | Promise<void>;
  /** 計算実行時のコールバック（API呼び出し用） */
  onCalculate?: (params: CalculateOverheadParams) => Promise<OverheadCostResult>;
}

// ============================================================================
// 定数定義
// ============================================================================

/**
 * 諸経費種別とプリセット名称のマッピング
 */
const COST_TYPE_NAMES: Record<OverheadCostType, string> = {
  COMMON_TEMPORARY: '共通仮設費',
  SITE_MANAGEMENT: '現場管理費',
  GENERAL_ADMIN: '一般管理費',
};

// ============================================================================
// スタイル定義
// ============================================================================

const styles = {
  panel: {
    border: '1px solid #e5e7eb',
    borderRadius: '8px',
    padding: '16px',
    backgroundColor: '#ffffff',
    marginBottom: '16px',
  } as React.CSSProperties,
  header: {
    fontSize: '16px',
    fontWeight: 600,
    color: '#374151',
    marginBottom: '16px',
    paddingBottom: '12px',
    borderBottom: '1px solid #e5e7eb',
  } as React.CSSProperties,
  formRow: {
    display: 'flex',
    gap: '16px',
    marginBottom: '16px',
    flexWrap: 'wrap' as const,
  } as React.CSSProperties,
  formGroup: {
    flex: '1',
    minWidth: '150px',
  } as React.CSSProperties,
  formGroupFull: {
    width: '100%',
    marginBottom: '16px',
  } as React.CSSProperties,
  label: {
    display: 'block',
    fontSize: '14px',
    fontWeight: 500,
    color: '#374151',
    marginBottom: '4px',
  } as React.CSSProperties,
  labelSuffix: {
    fontSize: '12px',
    color: '#6b7280',
    fontWeight: 'normal' as const,
  } as React.CSSProperties,
  inputWrapper: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  } as React.CSSProperties,
  input: {
    width: '100%',
    padding: '8px 12px',
    fontSize: '14px',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    backgroundColor: '#ffffff',
  } as React.CSSProperties,
  inputError: {
    borderColor: '#ef4444',
  } as React.CSSProperties,
  select: {
    width: '100%',
    padding: '8px 12px',
    fontSize: '14px',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    backgroundColor: '#ffffff',
    cursor: 'pointer',
  } as React.CSSProperties,
  suffix: {
    fontSize: '14px',
    color: '#6b7280',
    whiteSpace: 'nowrap' as const,
  } as React.CSSProperties,
  checkboxLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '14px',
    color: '#374151',
    cursor: 'pointer',
  } as React.CSSProperties,
  checkbox: {
    width: '16px',
    height: '16px',
    cursor: 'pointer',
  } as React.CSSProperties,
  errorText: {
    color: '#ef4444',
    fontSize: '12px',
    marginTop: '4px',
  } as React.CSSProperties,
  resultSection: {
    marginTop: '16px',
    padding: '16px',
    backgroundColor: '#f9fafb',
    borderRadius: '6px',
  } as React.CSSProperties,
  resultTitle: {
    fontSize: '14px',
    fontWeight: 500,
    color: '#374151',
    marginBottom: '12px',
  } as React.CSSProperties,
  resultRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '8px',
  } as React.CSSProperties,
  resultLabel: {
    fontSize: '14px',
    color: '#6b7280',
  } as React.CSSProperties,
  resultValue: {
    fontSize: '14px',
    fontWeight: 500,
    color: '#374151',
  } as React.CSSProperties,
  formulaText: {
    fontSize: '12px',
    color: '#6b7280',
    fontFamily: 'monospace',
    marginTop: '8px',
    padding: '8px',
    backgroundColor: '#f3f4f6',
    borderRadius: '4px',
    wordBreak: 'break-all' as const,
  } as React.CSSProperties,
  buttonRow: {
    display: 'flex',
    gap: '12px',
    marginTop: '16px',
    justifyContent: 'flex-end',
  } as React.CSSProperties,
  button: {
    padding: '10px 20px',
    fontSize: '14px',
    fontWeight: 500,
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    transition: 'background-color 0.2s',
  } as React.CSSProperties,
  buttonPrimary: {
    backgroundColor: '#3b82f6',
    color: '#ffffff',
  } as React.CSSProperties,
  buttonSecondary: {
    backgroundColor: '#ffffff',
    color: '#374151',
    border: '1px solid #d1d5db',
  } as React.CSSProperties,
  buttonDisabled: {
    backgroundColor: '#d1d5db',
    color: '#9ca3af',
    cursor: 'not-allowed',
  } as React.CSSProperties,
};

// ============================================================================
// ユーティリティ関数
// ============================================================================

/**
 * 金額をフォーマットする
 */
const formatAmount = (amount: string | null): string => {
  if (amount === null || amount === '') return '-';
  try {
    const num = parseFloat(amount);
    return num.toLocaleString('ja-JP');
  } catch {
    return amount;
  }
};

/**
 * 数値バリデーション
 */
const validateNumber = (value: string): string | null => {
  if (!value) return null;
  try {
    const num = new Decimal(value);
    if (num.isNaN()) {
      return '数値を入力してください';
    }
    return null;
  } catch {
    return '数値を入力してください';
  }
};

/**
 * 正の数値バリデーション
 */
const validatePositiveNumber = (value: string): string | null => {
  if (!value) return null;
  try {
    const num = new Decimal(value);
    if (num.isNaN()) {
      return '数値を入力してください';
    }
    if (num.lt(0)) {
      return '正の数値を入力してください';
    }
    return null;
  } catch {
    return '数値を入力してください';
  }
};

// ============================================================================
// メインコンポーネント
// ============================================================================

/**
 * 諸経費計算パネル
 *
 * 国土交通省の公共建築工事共通費積算基準に準じた諸経費計算UIを提供します。
 * 計算はバックエンドAPIで実行され、結果を表示します。
 *
 * @example
 * ```tsx
 * <OverheadCostPanel
 *   estimateId="est-001"
 *   onItemAdded={async (params) => {
 *     await addOverheadItem(params);
 *     refetch();
 *   }}
 *   onCalculate={async (params) => {
 *     return await api.calculateOverhead(params);
 *   }}
 * />
 * ```
 */
export function OverheadCostPanel({
  estimateId: _estimateId,
  onItemAdded,
  onCalculate,
}: OverheadCostPanelProps) {
  // 状態管理
  const [costType, setCostType] = useState<OverheadCostType>('COMMON_TEMPORARY');
  const [directCost, setDirectCost] = useState<string>('');
  const [directCostError, setDirectCostError] = useState<string | null>(null);
  const [constructionPeriod, setConstructionPeriod] = useState<string>('');
  const [constructionPeriodError, setConstructionPeriodError] = useState<string | null>(null);
  const [pureConstructionCost, setPureConstructionCost] = useState<string>('');
  const [pureConstructionCostError, setPureConstructionCostError] = useState<string | null>(null);
  const [constructionCost, setConstructionCost] = useState<string>('');
  const [constructionCostError, setConstructionCostError] = useState<string | null>(null);
  const [isRenovation, setIsRenovation] = useState<boolean>(false);
  const [calculatedAmount, setCalculatedAmount] = useState<string>('');
  const [calculatedAmountError, setCalculatedAmountError] = useState<string | null>(null);
  const [calculationResult, setCalculationResult] = useState<OverheadCostResult | null>(null);
  const [isCalculating, setIsCalculating] = useState(false);
  const [isAdding, setIsAdding] = useState(false);

  // 入力ハンドラー
  const handleDirectCostChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setDirectCost(value);
    setDirectCostError(validateNumber(value));
  }, []);

  const handleConstructionPeriodChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setConstructionPeriod(value);
    setConstructionPeriodError(validatePositiveNumber(value));
  }, []);

  const handlePureConstructionCostChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setPureConstructionCost(value);
    setPureConstructionCostError(validateNumber(value));
  }, []);

  const handleConstructionCostChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setConstructionCost(value);
    setConstructionCostError(validateNumber(value));
  }, []);

  const handleCalculatedAmountChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setCalculatedAmount(value);
    setCalculatedAmountError(validateNumber(value));
  }, []);

  const handleCostTypeChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    setCostType(e.target.value as OverheadCostType);
    // リセット
    setCalculationResult(null);
  }, []);

  // 計算実行ハンドラー
  const handleCalculate = useCallback(async () => {
    if (!onCalculate) return;

    setIsCalculating(true);

    try {
      const params: CalculateOverheadParams = {
        costType,
        directCost,
        isRenovation,
      };

      if (costType === 'COMMON_TEMPORARY') {
        params.constructionPeriod = constructionPeriod;
      } else if (costType === 'SITE_MANAGEMENT') {
        params.pureConstructionCost = pureConstructionCost;
      } else if (costType === 'GENERAL_ADMIN') {
        params.constructionCost = constructionCost;
      }

      const result = await onCalculate(params);
      if (result) {
        setCalculationResult(result);
        setCalculatedAmount(result.amount);
      }
    } finally {
      setIsCalculating(false);
    }
  }, [
    costType,
    directCost,
    constructionPeriod,
    pureConstructionCost,
    constructionCost,
    isRenovation,
    onCalculate,
  ]);

  // 項目追加ハンドラー
  const handleAddItem = useCallback(async () => {
    if (!calculatedAmount) return;

    setIsAdding(true);

    try {
      await onItemAdded({
        costType,
        name: COST_TYPE_NAMES[costType],
        specification: '',
        unit: '式',
        quantity: '1',
        unitPrice: calculatedAmount,
      });
    } finally {
      setIsAdding(false);
    }
  }, [costType, calculatedAmount, onItemAdded]);

  // ボタンの有効/無効判定
  const isCalculateDisabled =
    isCalculating ||
    !directCost ||
    !!directCostError ||
    (costType === 'COMMON_TEMPORARY' && (!constructionPeriod || !!constructionPeriodError)) ||
    (costType === 'SITE_MANAGEMENT' && (!pureConstructionCost || !!pureConstructionCostError)) ||
    (costType === 'GENERAL_ADMIN' && (!constructionCost || !!constructionCostError));

  const isAddDisabled = isAdding || !calculatedAmount || !!calculatedAmountError;

  return (
    <section style={styles.panel} role="region" aria-label="諸経費計算">
      <div style={styles.header}>諸経費計算</div>

      {/* 諸経費種別選択 */}
      <div style={styles.formGroupFull}>
        <label htmlFor="cost-type" style={styles.label}>
          諸経費種別
        </label>
        <select
          id="cost-type"
          style={styles.select}
          value={costType}
          onChange={handleCostTypeChange}
          aria-label="諸経費種別"
        >
          <option value="COMMON_TEMPORARY">共通仮設費</option>
          <option value="SITE_MANAGEMENT">現場管理費</option>
          <option value="GENERAL_ADMIN">一般管理費</option>
        </select>
      </div>

      {/* 計算パラメータ入力 */}
      <div style={styles.formRow}>
        {/* 直接工事費（共通） */}
        <div style={styles.formGroup}>
          <label htmlFor="direct-cost" style={styles.label}>
            直接工事費 <span style={styles.labelSuffix}>（千円単位）</span>
          </label>
          <input
            id="direct-cost"
            type="text"
            style={{
              ...styles.input,
              ...(directCostError ? styles.inputError : {}),
            }}
            value={directCost}
            onChange={handleDirectCostChange}
            placeholder="例: 100000"
            aria-label="直接工事費"
            aria-invalid={!!directCostError}
          />
          {directCostError && <div style={styles.errorText}>{directCostError}</div>}
        </div>

        {/* 共通仮設費: 工期 */}
        {costType === 'COMMON_TEMPORARY' && (
          <div style={styles.formGroup}>
            <label htmlFor="construction-period" style={styles.label}>
              工期
            </label>
            <div style={styles.inputWrapper}>
              <input
                id="construction-period"
                type="text"
                style={{
                  ...styles.input,
                  ...(constructionPeriodError ? styles.inputError : {}),
                }}
                value={constructionPeriod}
                onChange={handleConstructionPeriodChange}
                placeholder="例: 12"
                aria-label="工期"
                aria-invalid={!!constructionPeriodError}
              />
              <span style={styles.suffix}>ヶ月</span>
            </div>
            {constructionPeriodError && (
              <div style={styles.errorText}>{constructionPeriodError}</div>
            )}
          </div>
        )}

        {/* 現場管理費: 純工事費 */}
        {costType === 'SITE_MANAGEMENT' && (
          <div style={styles.formGroup}>
            <label htmlFor="pure-construction-cost" style={styles.label}>
              純工事費 <span style={styles.labelSuffix}>（千円単位）</span>
            </label>
            <input
              id="pure-construction-cost"
              type="text"
              style={{
                ...styles.input,
                ...(pureConstructionCostError ? styles.inputError : {}),
              }}
              value={pureConstructionCost}
              onChange={handlePureConstructionCostChange}
              placeholder="例: 105000"
              aria-label="純工事費"
              aria-invalid={!!pureConstructionCostError}
            />
            {pureConstructionCostError && (
              <div style={styles.errorText}>{pureConstructionCostError}</div>
            )}
          </div>
        )}

        {/* 一般管理費: 工事原価 */}
        {costType === 'GENERAL_ADMIN' && (
          <div style={styles.formGroup}>
            <label htmlFor="construction-cost" style={styles.label}>
              工事原価 <span style={styles.labelSuffix}>（千円単位）</span>
            </label>
            <input
              id="construction-cost"
              type="text"
              style={{
                ...styles.input,
                ...(constructionCostError ? styles.inputError : {}),
              }}
              value={constructionCost}
              onChange={handleConstructionCostChange}
              placeholder="例: 120000"
              aria-label="工事原価"
              aria-invalid={!!constructionCostError}
            />
            {constructionCostError && <div style={styles.errorText}>{constructionCostError}</div>}
          </div>
        )}
      </div>

      {/* 共通仮設費: 改修工事フラグ */}
      {costType === 'COMMON_TEMPORARY' && (
        <div style={{ marginBottom: '16px' }}>
          <label style={styles.checkboxLabel}>
            <input
              type="checkbox"
              style={styles.checkbox}
              checked={isRenovation}
              onChange={(e) => setIsRenovation(e.target.checked)}
              aria-label="改修工事"
            />
            改修工事
          </label>
        </div>
      )}

      {/* 計算結果表示 */}
      {calculationResult && (
        <div style={styles.resultSection}>
          <div style={styles.resultTitle}>計算結果</div>
          <div style={styles.resultRow}>
            <span style={styles.resultLabel}>算定率:</span>
            <span style={styles.resultValue} data-testid="calculated-rate">
              {calculationResult.rate}%
            </span>
          </div>
          <div style={styles.resultRow}>
            <span style={styles.resultLabel}>計算金額:</span>
            <span style={styles.resultValue} data-testid="calculated-amount">
              {formatAmount(calculationResult.amount)}円
            </span>
          </div>
          <div style={styles.formulaText} data-testid="calculation-formula">
            {calculationResult.formula}
          </div>
        </div>
      )}

      {/* 計算金額入力（手入力/上書き用） */}
      <div style={styles.formGroupFull}>
        <label htmlFor="calculated-amount-input" style={styles.label}>
          計算金額
        </label>
        <div style={styles.inputWrapper}>
          <input
            id="calculated-amount-input"
            type="text"
            style={{
              ...styles.input,
              ...(calculatedAmountError ? styles.inputError : {}),
            }}
            value={calculatedAmount}
            onChange={handleCalculatedAmountChange}
            placeholder="計算結果または手入力"
            aria-label="計算金額"
            aria-invalid={!!calculatedAmountError}
          />
          <span style={styles.suffix}>円</span>
        </div>
        {calculatedAmountError && <div style={styles.errorText}>{calculatedAmountError}</div>}
      </div>

      {/* ボタン */}
      <div style={styles.buttonRow}>
        <button
          type="button"
          style={{
            ...styles.button,
            ...(isCalculateDisabled ? styles.buttonDisabled : styles.buttonSecondary),
          }}
          disabled={isCalculateDisabled}
          onClick={handleCalculate}
        >
          {isCalculating ? '計算中...' : '計算'}
        </button>
        <button
          type="button"
          style={{
            ...styles.button,
            ...(isAddDisabled ? styles.buttonDisabled : styles.buttonPrimary),
          }}
          disabled={isAddDisabled}
          onClick={handleAddItem}
        >
          {isAdding ? '追加中...' : '項目追加'}
        </button>
      </div>
    </section>
  );
}

export default OverheadCostPanel;
