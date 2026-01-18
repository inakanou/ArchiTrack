/**
 * @fileoverview 計算方法選択コンポーネント
 *
 * Task 6.1: 計算方法選択コンポーネントを実装する
 *
 * Requirements:
 * - 8.1: 計算方法列に「標準」をデフォルト値として設定する
 * - 8.5: 「面積・体積」が選択された場合、計算用列表示切り替え
 * - 8.8: 「ピッチ」が選択された場合、計算用列表示切り替え
 */

import { useCallback, useId } from 'react';
import type { CalculationMethod } from '../../types/quantity-edit.types';

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
}

// ============================================================================
// 定数
// ============================================================================

/**
 * 計算方法オプション
 */
const CALCULATION_METHOD_OPTIONS: { value: CalculationMethod; label: string }[] = [
  { value: 'STANDARD', label: '標準' },
  { value: 'AREA_VOLUME', label: '面積・体積' },
  { value: 'PITCH', label: 'ピッチ' },
];

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
 * 標準/面積・体積/ピッチの3種類から選択可能。
 */
export default function CalculationMethodSelect({
  value,
  onChange,
  disabled = false,
  id: propId,
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
      <label id={labelId} htmlFor={selectId} style={styles.label}>
        計算方法
      </label>
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
          aria-labelledby={labelId}
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
