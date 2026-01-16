/**
 * @fileoverview 数値フィールド入力コンポーネント
 *
 * 調整係数・丸め設定・数量フィールドを小数2桁で常時表示し、
 * 右寄せで表示する機能を提供します。
 *
 * Requirements:
 * - 14.1: 調整係数・丸め設定・数量フィールドを右寄せで表示する
 * - 14.2: 調整係数・丸め設定・数量フィールドを小数2桁で常時表示する
 * - 14.5: 全ての数値フィールドを右寄せで表示する
 *
 * Task 12.2: 数値フィールド表示書式コンポーネントを実装する
 *
 * @module components/quantity-table/NumericFieldInput
 */

import { useState, useCallback, useMemo, useId } from 'react';
import { formatDecimal2 } from '../../utils/field-validation';

// ============================================================================
// 型定義
// ============================================================================

/**
 * 数値フィールドのタイプ
 */
export type NumericFieldType = 'adjustmentFactor' | 'roundingUnit' | 'quantity';

/**
 * 入力結果のメタ情報
 */
export interface NumericFieldInputMeta {
  /** エラーがあるか */
  hasError: boolean;
  /** エラーメッセージ */
  errorMessage?: string;
  /** 警告があるか */
  hasWarning?: boolean;
  /** 警告メッセージ */
  warningMessage?: string;
}

/**
 * NumericFieldInputコンポーネントのProps
 */
export interface NumericFieldInputProps {
  /** 現在の値（undefinedの場合はデフォルト値を表示） */
  value: number | undefined;
  /** 値変更時のコールバック */
  onChange: (value: number, meta: NumericFieldInputMeta) => void;
  /** フィールドタイプ */
  fieldType: NumericFieldType;
  /** ラベル */
  label: string;
  /** 入力フィールドのID */
  id?: string;
  /** エラーメッセージ */
  error?: string;
  /** 必須フィールドかどうか */
  required?: boolean;
  /** 無効化フラグ */
  disabled?: boolean;
  /** 追加のクラス名 */
  className?: string;
}

// ============================================================================
// 定数
// ============================================================================

/**
 * フィールドタイプ別のデフォルト値
 */
const DEFAULT_VALUES: Record<NumericFieldType, number> = {
  adjustmentFactor: 1.0,
  roundingUnit: 0.01,
  quantity: 0,
};

// ============================================================================
// スタイル定義
// ============================================================================

const styles = {
  container: {
    position: 'relative' as const,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '1px',
    width: '100%',
  } as React.CSSProperties,
  labelRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    height: '14px',
  } as React.CSSProperties,
  label: {
    display: 'block',
    fontSize: '11px',
    fontWeight: 500,
    color: '#374151',
    whiteSpace: 'nowrap' as const,
    lineHeight: '14px',
  } as React.CSSProperties,
  requiredMark: {
    color: '#dc2626',
    marginLeft: '2px',
  } as React.CSSProperties,
  inputWrapper: {
    position: 'relative' as const,
    height: '22px',
  } as React.CSSProperties,
  input: {
    width: '100%',
    height: '22px',
    padding: '2px 4px',
    border: '1px solid #d1d5db',
    borderRadius: '0px',
    fontSize: '12px',
    color: '#1f2937',
    backgroundColor: '#ffffff',
    outline: 'none',
    transition: 'border-color 0.2s, box-shadow 0.2s',
    boxSizing: 'border-box' as const,
    textAlign: 'right' as const,
  } as React.CSSProperties,
  inputFocused: {
    borderColor: '#2563eb',
    boxShadow: '0 0 0 3px rgba(37, 99, 235, 0.1)',
  } as React.CSSProperties,
  inputError: {
    borderColor: '#dc2626',
    boxShadow: '0 0 0 3px rgba(220, 38, 38, 0.1)',
  } as React.CSSProperties,
  inputDisabled: {
    backgroundColor: '#f9fafb',
    color: '#9ca3af',
    cursor: 'not-allowed',
  } as React.CSSProperties,
  errorMessage: {
    marginTop: '2px',
    fontSize: '11px',
    color: '#dc2626',
    lineHeight: '1.2',
  } as React.CSSProperties,
};

// ============================================================================
// ヘルパー関数
// ============================================================================

/**
 * 文字列を数値に変換する（無効な場合はnullを返す）
 *
 * @param str - 変換対象の文字列
 * @returns 数値またはnull
 */
function parseNumericString(str: string): number | null {
  if (str.trim() === '') {
    return null;
  }

  const num = parseFloat(str);
  if (isNaN(num)) {
    return null;
  }

  return num;
}

// ============================================================================
// メインコンポーネント
// ============================================================================

/**
 * 数値フィールド入力コンポーネント
 *
 * 調整係数・丸め設定・数量フィールドの入力を統一的に扱い、
 * 小数2桁での常時表示と右寄せ表示を提供します。
 *
 * @param props - コンポーネントProps
 */
export default function NumericFieldInput({
  value,
  onChange,
  fieldType,
  label,
  id: propId,
  error,
  required = false,
  disabled = false,
  className,
}: NumericFieldInputProps) {
  const generatedId = useId();
  const inputId = propId || generatedId;
  const errorId = `${inputId}-error`;

  // デフォルト値を取得
  const defaultValue = DEFAULT_VALUES[fieldType];

  // 実際の値（undefinedの場合はデフォルト値）
  const actualValue = value ?? defaultValue;

  // 入力中の文字列を管理（フォーカス中は生の値を表示）
  const [inputString, setInputString] = useState<string>(formatDecimal2(actualValue));
  const [isFocused, setIsFocused] = useState(false);

  // 表示値を計算
  const displayValue = useMemo(() => {
    if (isFocused) {
      return inputString;
    }
    return formatDecimal2(actualValue);
  }, [isFocused, inputString, actualValue]);

  // 値の変更を伝播
  const propagateChange = useCallback(
    (numValue: number) => {
      onChange(numValue, { hasError: false });
    },
    [onChange]
  );

  // フォーカスハンドラ
  const handleFocus = useCallback(() => {
    setIsFocused(true);
    setInputString(formatDecimal2(actualValue));
  }, [actualValue]);

  // フォーカスアウトハンドラ
  const handleBlur = useCallback(() => {
    setIsFocused(false);

    const parsedValue = parseNumericString(inputString);

    if (parsedValue === null) {
      // 空白または無効な入力の場合はデフォルト値を適用
      setInputString(formatDecimal2(defaultValue));
      propagateChange(defaultValue);
    } else {
      // 有効な数値の場合
      setInputString(formatDecimal2(parsedValue));
      propagateChange(parsedValue);
    }
  }, [inputString, defaultValue, propagateChange]);

  // 入力変更ハンドラ
  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setInputString(e.target.value);
  }, []);

  // 入力スタイルを計算
  const inputStyles = {
    ...styles.input,
    ...(error ? styles.inputError : {}),
    ...(disabled ? styles.inputDisabled : {}),
  };

  return (
    <div style={styles.container} className={className}>
      {/* ラベル行 */}
      <div style={styles.labelRow}>
        <label htmlFor={inputId} style={styles.label}>
          {label}
          {required && <span style={styles.requiredMark}>*</span>}
        </label>
      </div>

      {/* 入力フィールド */}
      <div style={styles.inputWrapper}>
        <input
          id={inputId}
          type="text"
          value={displayValue}
          disabled={disabled}
          style={inputStyles}
          onChange={handleChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          aria-invalid={!!error}
          aria-required={required}
          aria-describedby={error ? errorId : undefined}
        />
      </div>

      {/* エラーメッセージ */}
      {error && (
        <div id={errorId} style={styles.errorMessage} role="alert">
          {error}
        </div>
      )}
    </div>
  );
}
