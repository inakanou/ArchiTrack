/**
 * @fileoverview NetCalculationPanelコンポーネント - NET金額計算・案分UI
 *
 * Task 10.1: NetCalculationPanelコンポーネントの実装
 *
 * NET金額計算と案分のUIコンポーネントです。
 * 業者金額行の選択、諸経費行の除外、NET金額入力、プレビュー計算、案分実行を提供します。
 *
 * Requirements (estimate-creation):
 * - REQ-5.1: 業者と対象の業者金額行を指定した場合、その業者金額行を案分対象として選択状態にする
 * - REQ-5.2: 案分から除外する諸経費行を指定した場合、指定された諸経費行を案分対象から除外する
 * - REQ-5.3: NET金額を入力した場合、除外された諸経費行以外の業者金額行を実行金額行に転記する
 * - REQ-5.4: NET金額が入力された場合、各実行金額行の単価をNET金額に基づいて案分計算する
 * - REQ-5.5: 案分計算が実行された場合、案分後の金額を自動計算して実行金額行に表示する
 * - REQ-5.6: 案分対象となった業者を識別可能な状態で管理する
 * - REQ-5.7: 計算処理中であることを表示する
 *
 * @module components/estimate/NetCalculationPanel
 */

import { useState, useMemo, useCallback } from 'react';
import { EstimateCalculator, type AllocationPreview } from '../../utils/estimate-calculation';
import Decimal from 'decimal.js';

// ============================================================================
// 型定義
// ============================================================================

/**
 * 業者金額行情報（拡張）
 */
export interface VendorLineInfoExtended {
  id: string;
  amount: string | null;
  name: string;
  vendorName: string;
}

/**
 * NetCalculationPanelコンポーネントのProps
 */
export interface NetCalculationPanelProps {
  /** 見積書ID */
  estimateId: string;
  /** 業者金額行情報 */
  vendorLines: VendorLineInfoExtended[];
  /** 計算完了時のコールバック */
  onCalculationComplete: (params: {
    vendorName: string;
    targetLineIds: string[];
    excludeLineIds: string[];
    netAmount: string;
    results: AllocationPreview[];
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
  formGroup: {
    marginBottom: '16px',
  } as React.CSSProperties,
  label: {
    display: 'block',
    fontSize: '14px',
    fontWeight: 500,
    color: '#374151',
    marginBottom: '4px',
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
  errorText: {
    color: '#ef4444',
    fontSize: '12px',
    marginTop: '4px',
  } as React.CSSProperties,
  selectedVendor: {
    fontSize: '14px',
    color: '#6b7280',
    marginBottom: '12px',
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
  checkbox: {
    width: '16px',
    height: '16px',
    cursor: 'pointer',
  } as React.CSSProperties,
  totalRow: {
    backgroundColor: '#f9fafb',
    fontWeight: 600,
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
 * NET金額計算・案分パネル
 *
 * 業者金額行からNET金額を指定して案分計算を行うUIコンポーネントです。
 * クライアントサイドでプレビュー計算を行い、確定時のみAPIを呼び出します。
 *
 * @example
 * ```tsx
 * <NetCalculationPanel
 *   estimateId="est-001"
 *   vendorLines={vendorLinesData}
 *   onCalculationComplete={async (params) => {
 *     await api.calculateNet(params);
 *     refetch();
 *   }}
 * />
 * ```
 */
export function NetCalculationPanel({
  estimateId: _estimateId,
  vendorLines,
  onCalculationComplete,
}: NetCalculationPanelProps) {
  // 状態管理
  const [selectedVendor, setSelectedVendor] = useState<string>('');
  const [excludeLineIds, setExcludeLineIds] = useState<Set<string>>(new Set());
  const [netAmount, setNetAmount] = useState<string>('');
  const [netAmountError, setNetAmountError] = useState<string | null>(null);
  const [isCalculating, setIsCalculating] = useState(false);

  // 業者リストを抽出（重複除去）
  const vendors = useMemo(() => {
    const vendorSet = new Set(vendorLines.map((line) => line.vendorName));
    return Array.from(vendorSet);
  }, [vendorLines]);

  // 選択した業者の行をフィルタリング
  const filteredLines = useMemo(() => {
    if (!selectedVendor) return [];
    return vendorLines.filter((line) => line.vendorName === selectedVendor);
  }, [vendorLines, selectedVendor]);

  // 案分対象行（除外されていない行）
  const targetLines = useMemo(() => {
    return filteredLines.filter((line) => !excludeLineIds.has(line.id));
  }, [filteredLines, excludeLineIds]);

  // 案分対象合計
  const allocationTotal = useMemo(() => {
    return targetLines.reduce((sum, line) => {
      if (line.amount) {
        try {
          return sum.add(new Decimal(line.amount));
        } catch {
          return sum;
        }
      }
      return sum;
    }, new Decimal(0));
  }, [targetLines]);

  // プレビュー計算結果
  const previewResults = useMemo((): AllocationPreview[] | null => {
    if (!netAmount || netAmountError || targetLines.length === 0) {
      return null;
    }

    try {
      return EstimateCalculator.previewNetAllocation(
        targetLines.map((line) => ({ id: line.id, amount: line.amount })),
        [], // 既にフィルタリング済み
        netAmount
      );
    } catch {
      return null;
    }
  }, [targetLines, netAmount, netAmountError]);

  // NET金額のバリデーション
  const validateNetAmount = useCallback((value: string) => {
    if (!value) {
      setNetAmountError(null);
      return;
    }

    try {
      const num = new Decimal(value);
      if (num.isNaN()) {
        setNetAmountError('数値を入力してください');
      } else if (num.lt(0)) {
        setNetAmountError('正の数値を入力してください');
      } else {
        setNetAmountError(null);
      }
    } catch {
      setNetAmountError('数値を入力してください');
    }
  }, []);

  // 業者選択ハンドラー
  const handleVendorChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedVendor(e.target.value);
    setExcludeLineIds(new Set()); // 業者変更時はリセット
  }, []);

  // NET金額入力ハンドラー
  const handleNetAmountChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      setNetAmount(value);
      validateNetAmount(value);
    },
    [validateNetAmount]
  );

  // チェックボックス変更ハンドラー
  const handleCheckboxChange = useCallback((lineId: string, checked: boolean) => {
    setExcludeLineIds((prev) => {
      const newSet = new Set(prev);
      if (checked) {
        newSet.delete(lineId);
      } else {
        newSet.add(lineId);
      }
      return newSet;
    });
  }, []);

  // 案分実行ハンドラー
  const handleExecute = useCallback(async () => {
    if (!selectedVendor || !netAmount || netAmountError || !previewResults) {
      return;
    }

    setIsCalculating(true);

    try {
      await onCalculationComplete({
        vendorName: selectedVendor,
        targetLineIds: targetLines.map((line) => line.id),
        excludeLineIds: Array.from(excludeLineIds),
        netAmount,
        results: previewResults,
      });
    } finally {
      setIsCalculating(false);
    }
  }, [
    selectedVendor,
    netAmount,
    netAmountError,
    previewResults,
    targetLines,
    excludeLineIds,
    onCalculationComplete,
  ]);

  // ボタンの有効/無効判定
  const isExecuteDisabled =
    !selectedVendor || !netAmount || !!netAmountError || targetLines.length === 0 || isCalculating;

  // 空の状態
  if (vendorLines.length === 0) {
    return (
      <section style={styles.panel} role="region" aria-label="NET金額計算・案分">
        <div style={styles.header}>NET金額計算・案分</div>
        <div style={styles.emptyState}>業者金額行がありません</div>
      </section>
    );
  }

  return (
    <section style={styles.panel} role="region" aria-label="NET金額計算・案分">
      <div style={styles.header}>NET金額計算・案分</div>

      {/* 業者選択 */}
      <div style={styles.formGroup}>
        <label htmlFor="vendor-select" style={styles.label}>
          対象業者
        </label>
        <select
          id="vendor-select"
          style={styles.select}
          value={selectedVendor}
          onChange={handleVendorChange}
          aria-label="対象業者"
        >
          <option value="">選択してください</option>
          {vendors.map((vendor) => (
            <option key={vendor} value={vendor}>
              {vendor}
            </option>
          ))}
        </select>
      </div>

      {/* 選択中の業者表示 */}
      {selectedVendor && <div style={styles.selectedVendor}>対象: {selectedVendor}</div>}

      {/* 案分対象行テーブル */}
      {selectedVendor && filteredLines.length > 0 && (
        <>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={{ ...styles.th, width: '40px' }}>選択</th>
                <th style={styles.th}>名称</th>
                <th style={{ ...styles.th, ...styles.tdRight, width: '120px' }}>金額</th>
                {previewResults && (
                  <>
                    <th style={{ ...styles.th, ...styles.tdRight, width: '80px' }}>案分率</th>
                    <th style={{ ...styles.th, ...styles.tdRight, width: '120px' }}>案分後金額</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {filteredLines.map((line) => {
                const isExcluded = excludeLineIds.has(line.id);
                const previewResult = previewResults?.find((r) => r.lineId === line.id);

                return (
                  <tr key={line.id}>
                    <td style={styles.td}>
                      <input
                        type="checkbox"
                        style={styles.checkbox}
                        checked={!isExcluded}
                        onChange={(e) => handleCheckboxChange(line.id, e.target.checked)}
                        aria-label={`${line.name}を案分対象に含める`}
                      />
                    </td>
                    <td style={styles.td}>{line.name}</td>
                    <td style={{ ...styles.td, ...styles.tdRight }}>{formatAmount(line.amount)}</td>
                    {previewResults && (
                      <>
                        <td
                          style={{ ...styles.td, ...styles.tdRight }}
                          data-testid={`ratio-${line.id}`}
                        >
                          {previewResult ? previewResult.ratio : '-'}
                        </td>
                        <td
                          style={{ ...styles.td, ...styles.tdRight }}
                          data-testid={`allocated-amount-${line.id}`}
                        >
                          {previewResult ? formatAmount(previewResult.allocatedAmount) : '-'}
                        </td>
                      </>
                    )}
                  </tr>
                );
              })}
              <tr style={styles.totalRow}>
                <td style={styles.td}></td>
                <td style={styles.td}>案分対象合計</td>
                <td style={{ ...styles.td, ...styles.tdRight }} data-testid="allocation-total">
                  {formatAmount(allocationTotal.toString())}
                </td>
                {previewResults && (
                  <>
                    <td style={{ ...styles.td, ...styles.tdRight }}>100%</td>
                    <td style={{ ...styles.td, ...styles.tdRight }}>{formatAmount(netAmount)}</td>
                  </>
                )}
              </tr>
            </tbody>
          </table>

          {/* NET金額入力 */}
          <div style={styles.formGroup}>
            <label htmlFor="net-amount" style={styles.label}>
              NET金額
            </label>
            <input
              id="net-amount"
              type="text"
              style={{
                ...styles.input,
                ...(netAmountError ? styles.inputError : {}),
              }}
              value={netAmount}
              onChange={handleNetAmountChange}
              placeholder="例: 800000"
              aria-label="NET金額"
              aria-invalid={!!netAmountError}
            />
            {netAmountError && <div style={styles.errorText}>{netAmountError}</div>}
          </div>

          {/* プレビュー結果セクション */}
          {previewResults && (
            <div style={styles.previewSection} data-testid="preview-results">
              <div style={styles.previewTitle}>プレビュー計算結果</div>
              <p style={{ fontSize: '13px', color: '#6b7280' }}>
                上記の案分率と案分後金額は、NET金額に基づいて自動計算されたプレビューです。
                「案分実行」ボタンをクリックすると、実行金額行に反映されます。
              </p>
            </div>
          )}

          {/* 案分実行ボタン */}
          <div style={{ marginTop: '16px', textAlign: 'right' as const }}>
            <button
              type="button"
              style={{
                ...styles.button,
                ...(isExecuteDisabled ? styles.buttonDisabled : styles.buttonPrimary),
              }}
              disabled={isExecuteDisabled}
              onClick={handleExecute}
            >
              {isCalculating ? '計算中...' : '案分実行'}
            </button>
          </div>
        </>
      )}
    </section>
  );
}

export default NetCalculationPanel;
