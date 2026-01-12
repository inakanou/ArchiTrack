/**
 * @fileoverview 計算用数値フィールド入力コンポーネント
 *
 * 寸法・ピッチフィールドの条件付き書式を提供します。
 * 数値入力時は小数2桁で表示し、空白時は表示なしとします。
 *
 * Requirements:
 * - 14.3: 寸法・ピッチフィールドは数値入力時のみ小数2桁で表示し、空白時は表示しない
 * - 14.4: 寸法・ピッチフィールドの入力フォーカス時は編集可能な形式で表示し、フォーカスアウト時は書式適用表示に切り替える
 *
 * Task 12.3: 寸法・ピッチフィールドの条件付き書式を実装する
 *
 * @module components/quantity-table/CalculationNumericInput
 */

import { useState, useCallback, useMemo, useId } from 'react';
import { formatDecimal2 } from '../../utils/field-validation';

// ============================================================================
// 型定義
// ============================================================================

/**
 * CalculationNumericInputコンポーネントのProps
 */
export interface CalculationNumericInputProps {
  /** 現在の値（undefinedの場合は空白を表示） */
  value: number | undefined;
  /** 値変更時のコールバック */
  onChange: (value: number | undefined) => void;
  /** ラベル */
  label: string;
  /** 入力フィールドのID */
  id?: string;
  /** 必須フィールドかどうか */
  required?: boolean;
  /** 無効化フラグ */
  disabled?: boolean;
  /** ステップ値 */
  step?: number;
  /** 追加のクラス名 */
  className?: string;
}

// ============================================================================
// スタイル定義
// ============================================================================

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '1px',
    width: '100%',
  } as React.CSSProperties,
  label: {
    fontSize: '11px',
    fontWeight: 500,
    color: '#374151',
    display: 'flex',
    alignItems: 'center',
    gap: '2px',
    whiteSpace: 'nowrap' as const,
    height: '14px',
    lineHeight: '14px',
  } as React.CSSProperties,
  requiredMark: {
    color: '#dc2626',
    fontSize: '11px',
  } as React.CSSProperties,
  input: {
    width: '100%',
    height: '22px',
    padding: '0 4px',
    fontSize: '12px',
    border: '1px solid #d1d5db',
    borderRadius: '0px',
    backgroundColor: '#ffffff',
    color: '#1f2937',
    outline: 'none',
    transition: 'border-color 0.2s, box-shadow 0.2s',
    boxSizing: 'border-box' as const,
    textAlign: 'right' as const,
  } as React.CSSProperties,
  inputDisabled: {
    backgroundColor: '#f3f4f6',
    color: '#9ca3af',
    cursor: 'not-allowed',
  } as React.CSSProperties,
};

// ============================================================================
// ヘルパー関数
// ============================================================================

/**
 * 値に基づいて表示文字列を取得する
 *
 * undefinedの場合は空文字、数値の場合は小数2桁形式で返す。
 *
 * @param value - 表示対象の値
 * @returns 表示文字列
 */
function getDisplayString(value: number | undefined): string {
  if (value === undefined) {
    return '';
  }
  return formatDecimal2(value);
}

/**
 * 文字列を数値に変換する（無効な場合はundefinedを返す）
 *
 * @param str - 変換対象の文字列
 * @returns 数値またはundefined
 */
function parseNumericString(str: string): number | undefined {
  if (str.trim() === '') {
    return undefined;
  }

  const num = parseFloat(str);
  if (isNaN(num)) {
    return undefined;
  }

  return num;
}

// ============================================================================
// メインコンポーネント
// ============================================================================

/**
 * 計算用数値フィールド入力コンポーネント
 *
 * 寸法・ピッチフィールドの入力を統一的に扱い、
 * 数値入力時は小数2桁で表示し、空白時は表示なしとします。
 *
 * @param props - コンポーネントProps
 */
export default function CalculationNumericInput({
  value,
  onChange,
  label,
  id: propId,
  required = false,
  disabled = false,
  className,
}: CalculationNumericInputProps) {
  const generatedId = useId();
  const inputId = propId || generatedId;

  // 入力中の文字列を管理
  const [inputString, setInputString] = useState<string>(getDisplayString(value));
  const [isFocused, setIsFocused] = useState(false);

  // 表示値を計算
  const displayValue = useMemo(() => {
    if (isFocused) {
      return inputString;
    }
    return getDisplayString(value);
  }, [isFocused, inputString, value]);

  // フォーカスハンドラ
  const handleFocus = useCallback(() => {
    setIsFocused(true);
    setInputString(getDisplayString(value));
  }, [value]);

  // フォーカスアウトハンドラ
  const handleBlur = useCallback(() => {
    setIsFocused(false);

    const parsedValue = parseNumericString(inputString);
    setInputString(getDisplayString(parsedValue));
    onChange(parsedValue);
  }, [inputString, onChange]);

  // 入力変更ハンドラ
  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setInputString(e.target.value);
  }, []);

  // 入力スタイルを計算
  const inputStyles = {
    ...styles.input,
    ...(disabled ? styles.inputDisabled : {}),
  };

  return (
    <div style={styles.container} className={className}>
      {/* ラベル */}
      <label htmlFor={inputId} style={styles.label}>
        {label}
        {required && <span style={styles.requiredMark}>*</span>}
      </label>

      {/* 入力フィールド */}
      <input
        id={inputId}
        type="text"
        value={displayValue}
        disabled={disabled}
        style={inputStyles}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        aria-required={required}
      />
    </div>
  );
}
