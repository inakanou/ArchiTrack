/**
 * @fileoverview ProfitRatePanelコンポーネント - 利益率適用UI
 *
 * Task 10.2: ProfitRatePanelコンポーネントの実装
 *
 * 利益率適用のUIコンポーネントです。
 * 実行金額行に対して利益率を適用し、見積金額行に反映する機能を提供します。
 *
 * Requirements (estimate-creation):
 * - REQ-6.1: 利益率を指定した場合、全実行金額行に対して利益率を適用した単価を計算する
 * - REQ-6.2: 「すべて上書き」オプションを選択した場合、実行金額行の名称・規格・単位・数量・単価を見積金額行に上書きする
 * - REQ-6.3: 「空の場合のみ上書き」オプションを選択した場合、見積金額行が空の項目のみ実行金額行から上書きする
 * - REQ-6.4: 「単価のみ上書き」オプションを選択した場合、実行金額行の単価のみを見積金額行に上書きする
 * - REQ-6.5: 見積金額行への反映が実行された場合、金額を自動計算して表示する
 * - REQ-6.6: 利益率を百分率で入力可能とする
 *
 * @module components/estimate/ProfitRatePanel
 */

import { useState, useMemo, useCallback } from 'react';
import { EstimateCalculator, type ProfitRatePreview } from '../../utils/estimate-calculation';

// ============================================================================
// 型定義
// ============================================================================

/**
 * 上書きオプション
 */
export type OverwriteOption = 'all' | 'empty_only' | 'unit_price_only';

/**
 * 実行金額行情報（拡張）
 */
export interface ExecutionLineInfoExtended {
  lineId: string;
  unitPrice: string | null;
  name: string;
  specification: string | null;
  unit: string | null;
  quantity: string | null;
  amount: string | null;
}

/**
 * ProfitRatePanelコンポーネントのProps
 */
export interface ProfitRatePanelProps {
  /** 見積書ID */
  estimateId: string;
  /** 実行金額行情報 */
  executionLines: ExecutionLineInfoExtended[];
  /** 適用完了時のコールバック */
  onApplyComplete: (params: {
    profitRate: string;
    overwriteOption: OverwriteOption;
  }) => void | Promise<void>;
}

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
    minWidth: '200px',
  } as React.CSSProperties,
  label: {
    display: 'block',
    fontSize: '14px',
    fontWeight: 500,
    color: '#374151',
    marginBottom: '4px',
  } as React.CSSProperties,
  inputWrapper: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  } as React.CSSProperties,
  input: {
    flex: '1',
    padding: '8px 12px',
    fontSize: '14px',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    backgroundColor: '#ffffff',
  } as React.CSSProperties,
  inputError: {
    borderColor: '#ef4444',
  } as React.CSSProperties,
  suffix: {
    fontSize: '14px',
    color: '#6b7280',
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
  errorText: {
    color: '#ef4444',
    fontSize: '12px',
    marginTop: '4px',
  } as React.CSSProperties,
  table: {
    width: '100%',
    borderCollapse: 'collapse' as const,
    marginBottom: '16px',
    fontSize: '14px',
  } as React.CSSProperties,
  th: {
    padding: '8px 12px',
    backgroundColor: '#f9fafb',
    borderBottom: '1px solid #e5e7eb',
    textAlign: 'left' as const,
    fontWeight: 500,
    color: '#374151',
  } as React.CSSProperties,
  td: {
    padding: '8px 12px',
    borderBottom: '1px solid #e5e7eb',
    color: '#374151',
  } as React.CSSProperties,
  tdRight: {
    textAlign: 'right' as const,
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
  buttonDisabled: {
    backgroundColor: '#d1d5db',
    color: '#9ca3af',
    cursor: 'not-allowed',
  } as React.CSSProperties,
  emptyState: {
    textAlign: 'center' as const,
    padding: '24px',
    color: '#6b7280',
  } as React.CSSProperties,
  previewSection: {
    marginTop: '16px',
    paddingTop: '16px',
    borderTop: '1px solid #e5e7eb',
  } as React.CSSProperties,
  previewTitle: {
    fontSize: '14px',
    fontWeight: 500,
    color: '#374151',
    marginBottom: '8px',
  } as React.CSSProperties,
  arrowIcon: {
    color: '#9ca3af',
    fontSize: '14px',
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

// ============================================================================
// メインコンポーネント
// ============================================================================

/**
 * 利益率適用パネル
 *
 * 実行金額行に利益率を適用して見積金額行に反映するUIコンポーネントです。
 * クライアントサイドでプレビュー計算を行い、確定時のみAPIを呼び出します。
 *
 * @example
 * ```tsx
 * <ProfitRatePanel
 *   estimateId="est-001"
 *   executionLines={executionLinesData}
 *   onApplyComplete={async (params) => {
 *     await api.applyProfitRate(params);
 *     refetch();
 *   }}
 * />
 * ```
 */
export function ProfitRatePanel({
  estimateId: _estimateId,
  executionLines,
  onApplyComplete,
}: ProfitRatePanelProps) {
  // 状態管理
  const [profitRate, setProfitRate] = useState<string>('');
  const [profitRateError, setProfitRateError] = useState<string | null>(null);
  const [overwriteOption, setOverwriteOption] = useState<OverwriteOption>('all');
  const [isApplying, setIsApplying] = useState(false);

  // 利益率のバリデーション
  const validateProfitRate = useCallback((value: string) => {
    if (!value) {
      setProfitRateError(null);
      return;
    }

    const isValid = EstimateCalculator.validateProfitRate(value);
    if (!isValid) {
      setProfitRateError('0.00〜500.00の範囲で入力してください');
    } else {
      setProfitRateError(null);
    }
  }, []);

  // プレビュー計算結果
  const previewResults = useMemo((): ProfitRatePreview[] | null => {
    if (!profitRate || profitRateError) {
      return null;
    }

    try {
      return EstimateCalculator.previewProfitRate(
        executionLines.map((line) => ({
          lineId: line.lineId,
          unitPrice: line.unitPrice,
        })),
        profitRate
      );
    } catch {
      return null;
    }
  }, [executionLines, profitRate, profitRateError]);

  // 利益率入力ハンドラー
  const handleProfitRateChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      setProfitRate(value);
      validateProfitRate(value);
    },
    [validateProfitRate]
  );

  // 上書きオプション変更ハンドラー
  const handleOverwriteOptionChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    setOverwriteOption(e.target.value as OverwriteOption);
  }, []);

  // 適用実行ハンドラー
  const handleApply = useCallback(async () => {
    if (!profitRate || profitRateError) {
      return;
    }

    setIsApplying(true);

    try {
      await onApplyComplete({
        profitRate,
        overwriteOption,
      });
    } finally {
      setIsApplying(false);
    }
  }, [profitRate, profitRateError, overwriteOption, onApplyComplete]);

  // ボタンの有効/無効判定
  const isApplyDisabled = !profitRate || !!profitRateError || isApplying;

  // 空の状態
  if (executionLines.length === 0) {
    return (
      <section style={styles.panel} role="region" aria-label="利益率適用">
        <div style={styles.header}>利益率適用</div>
        <div style={styles.emptyState}>実行金額行がありません</div>
      </section>
    );
  }

  return (
    <section style={styles.panel} role="region" aria-label="利益率適用">
      <div style={styles.header}>利益率適用</div>

      {/* 入力フォーム */}
      <div style={styles.formRow}>
        {/* 利益率入力 */}
        <div style={styles.formGroup}>
          <label htmlFor="profit-rate" style={styles.label}>
            利益率
          </label>
          <div style={styles.inputWrapper}>
            <input
              id="profit-rate"
              type="text"
              style={{
                ...styles.input,
                ...(profitRateError ? styles.inputError : {}),
              }}
              value={profitRate}
              onChange={handleProfitRateChange}
              placeholder="例: 10"
              aria-label="利益率"
              aria-invalid={!!profitRateError}
            />
            <span style={styles.suffix}>%</span>
          </div>
          {profitRateError && <div style={styles.errorText}>{profitRateError}</div>}
        </div>

        {/* 上書きオプション */}
        <div style={styles.formGroup}>
          <label htmlFor="overwrite-option" style={styles.label}>
            上書きオプション
          </label>
          <select
            id="overwrite-option"
            style={styles.select}
            value={overwriteOption}
            onChange={handleOverwriteOptionChange}
            aria-label="上書きオプション"
          >
            <option value="all">すべて上書き</option>
            <option value="empty_only">空の場合のみ上書き</option>
            <option value="unit_price_only">単価のみ上書き</option>
          </select>
        </div>
      </div>

      {/* プレビュー結果 */}
      {previewResults && (
        <div data-testid="preview-results">
          <div style={styles.previewTitle}>プレビュー計算結果</div>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>名称</th>
                <th style={{ ...styles.th, ...styles.tdRight, width: '120px' }}>元の単価</th>
                <th style={{ ...styles.th, width: '40px' }}></th>
                <th style={{ ...styles.th, ...styles.tdRight, width: '120px' }}>新しい単価</th>
              </tr>
            </thead>
            <tbody>
              {executionLines.map((line) => {
                const preview = previewResults.find((r) => r.lineId === line.lineId);
                return (
                  <tr key={line.lineId}>
                    <td style={styles.td}>{line.name}</td>
                    <td
                      style={{ ...styles.td, ...styles.tdRight }}
                      data-testid={`original-unit-price-${line.lineId}`}
                    >
                      {formatAmount(preview?.originalUnitPrice ?? line.unitPrice)}
                    </td>
                    <td style={{ ...styles.td, textAlign: 'center' as const }}>
                      <span style={styles.arrowIcon}>→</span>
                    </td>
                    <td
                      style={{ ...styles.td, ...styles.tdRight }}
                      data-testid={`new-unit-price-${line.lineId}`}
                    >
                      {formatAmount(preview?.newUnitPrice ?? null)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p style={{ fontSize: '13px', color: '#6b7280' }}>
            上記の新しい単価は、利益率を適用して計算されたプレビューです。
            「適用」ボタンをクリックすると、見積金額行に反映されます。
          </p>
        </div>
      )}

      {/* 適用ボタン */}
      <div style={{ marginTop: '16px', textAlign: 'right' as const }}>
        <button
          type="button"
          style={{
            ...styles.button,
            ...(isApplyDisabled ? styles.buttonDisabled : styles.buttonPrimary),
          }}
          disabled={isApplyDisabled}
          onClick={handleApply}
        >
          {isApplying ? '適用中...' : '適用'}
        </button>
      </div>
    </section>
  );
}

export default ProfitRatePanel;
