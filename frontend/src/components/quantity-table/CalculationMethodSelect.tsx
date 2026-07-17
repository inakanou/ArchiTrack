/**
 * @fileoverview 計算方法選択コンポーネント
 *
 * Task 6.1: 計算方法選択コンポーネントを実装する
 *
 * Requirements:
 * - 8.1: 計算方法列に「標準」をデフォルト値として設定する
 * - 8.5: 「面積・体積」が選択された場合、計算用列表示切り替え
 * - 8.8: 「ピッチ」が選択された場合、計算用列表示切り替え
 * - 8.12: 計算方法の選択肢として「標準」「面積・体積」「ピッチ」「箇所数」を提供する
 * - 47.1: 計算方法の選択肢に「箇所数」を含める
 *
 * Task 68.3: ローカルの配列リテラル定義（`{ value, label }[]`）を撤去し、選択肢を
 * `utils/calculation-method.ts` の `CALCULATION_METHOD_OPTIONS`（表示順・ラベルの単一情報源）から供給する。
 * 配列リテラルは網羅性チェックを持たないため、`CalculationMethod` に計算方法を追加しても
 * 型エラーにならず、選択肢から無言で欠落していた（COUNT が選べない状態）。
 * レジストリは `Record<CalculationMethod, string>` を基に生成されるため、以後は定義漏れがコンパイルエラーになる。
 */

import { useCallback, useId } from 'react';
import type { CalculationMethod } from '../../types/quantity-edit.types';
import { CALCULATION_METHOD_OPTIONS } from '../../utils/calculation-method';

// ============================================================================
// 型定義
// ============================================================================

/**
 * CalculationMethodSelectコンポーネントのProps
 */
export interface CalculationMethodSelectProps {
  /** 現在の計算方法 */
  value: CalculationMethod;
  /** 計算方法変更時のコールバック */
  onChange: (method: CalculationMethod) => void;
  /** 無効化状態 */
  disabled?: boolean;
  /** 要素ID */
  id?: string;
  /**
   * ラベル表示フラグ（Task 23.2: showFieldLabels対応）
   * @default true
   */
  showLabel?: boolean;
}

// ============================================================================
// スタイル定義
// ============================================================================

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '1px',
  } as React.CSSProperties,
  label: {
    fontSize: '11px',
    fontWeight: 500,
    color: '#374151',
    whiteSpace: 'nowrap' as const,
    height: '14px',
    lineHeight: '14px',
  } as React.CSSProperties,
  selectWrapper: {
    position: 'relative' as const,
    height: '22px',
  } as React.CSSProperties,
  select: {
    width: '100%',
    height: '22px',
    padding: '0 4px',
    fontSize: '12px',
    border: '1px solid #d1d5db',
    borderRadius: '0px',
    backgroundColor: '#ffffff',
    color: '#1f2937',
    cursor: 'pointer',
    outline: 'none',
    transition: 'border-color 0.2s, box-shadow 0.2s',
    boxSizing: 'border-box' as const,
  } as React.CSSProperties,
  selectFocus: {
    borderColor: '#2563eb',
    boxShadow: '0 0 0 3px rgba(37, 99, 235, 0.1)',
  } as React.CSSProperties,
  selectDisabled: {
    backgroundColor: '#f3f4f6',
    color: '#9ca3af',
    cursor: 'not-allowed',
  } as React.CSSProperties,
};

// ============================================================================
// メインコンポーネント
// ============================================================================

/**
 * 計算方法選択コンポーネント
 *
 * 数量項目の計算方法を選択するドロップダウン。
 * 選択肢・表示順・ラベルは `CALCULATION_METHOD_OPTIONS`（単一情報源）に従う。
 * 現在は 標準 / 面積・体積 / ピッチ / 箇所数（REQ-8.12, REQ-47.1）。
 */
export default function CalculationMethodSelect({
  value,
  onChange,
  disabled = false,
  id: propId,
  showLabel = true,
}: CalculationMethodSelectProps) {
  const generatedId = useId();
  const selectId = propId ?? generatedId;
  const labelId = `${selectId}-label`;

  /**
   * 計算方法変更ハンドラ
   */
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const newMethod = e.target.value as CalculationMethod;
      onChange(newMethod);
    },
    [onChange]
  );

  return (
    <div style={styles.container}>
      {showLabel && (
        <label id={labelId} htmlFor={selectId} style={styles.label}>
          計算方法
        </label>
      )}
      <div style={styles.selectWrapper}>
        <select
          id={selectId}
          value={value}
          onChange={handleChange}
          disabled={disabled}
          style={{
            ...styles.select,
            ...(disabled ? styles.selectDisabled : {}),
          }}
          {...(showLabel ? { 'aria-labelledby': labelId } : { 'aria-label': '計算方法' })}
        >
          {CALCULATION_METHOD_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
