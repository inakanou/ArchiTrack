/**
 * @fileoverview 標準モード数量入力コンポーネント
 *
 * Task 6.5: 標準モードの数量入力を実装する
 *
 * Requirements:
 * - 8.2: 「標準」モードで数量フィールドに直接数値を入力する
 * - 8.3: 数量フィールドに負の値が入力される場合、警告メッセージを表示し、確認を求める
 * - 8.4: 数量フィールドに数値以外の文字が入力される場合、入力を拒否しエラーメッセージを表示する
 */

import { useCallback, useId } from 'react';

// ============================================================================
// 型定義
// ============================================================================

/**
 * 入力結果のメタ情報
 */
export interface QuantityInputMeta {
  /** 警告があるか */
  hasWarning: boolean;
  /** 警告メッセージ */
  warningMessage?: string;
  /** エラーがあるか */
  hasError: boolean;
  /** エラーメッセージ */
  errorMessage?: string;
}

/**
 * QuantityInputコンポーネントのProps
 */
export interface QuantityInputProps {
  /** 現在の値 */
  value: number | undefined;
  /** 値変更時のコールバック */
  onChange: (value: number | undefined, meta: QuantityInputMeta) => void;
  /** 無効化状態 */
  disabled?: boolean;
  /** 読み取り専用（計算値表示用） */
  readOnly?: boolean;
  /** 警告状態 */
  hasWarning?: boolean;
  /** エラーメッセージ */
  error?: string;
}

// ============================================================================
// スタイル定義
// ============================================================================

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '4px',
  } as React.CSSProperties,
  labelContainer: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
  } as React.CSSProperties,
  label: {
    fontSize: '12px',
    fontWeight: 500,
    color: '#374151',
  } as React.CSSProperties,
  calculatedLabel: {
    fontSize: '10px',
    color: '#4b5563',
    backgroundColor: '#e5e7eb',
    padding: '2px 6px',
    borderRadius: '4px',
  } as React.CSSProperties,
  inputWrapper: {
    position: 'relative' as const,
    display: 'flex',
    alignItems: 'center',
  } as React.CSSProperties,
  input: {
    width: '100%',
    height: '36px',
    padding: '0 12px',
    paddingRight: '32px',
    fontSize: '14px',
    fontWeight: 600,
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    backgroundColor: '#ffffff',
    color: '#1f2937',
    outline: 'none',
    transition: 'border-color 0.2s, box-shadow 0.2s',
    textAlign: 'right' as const,
  } as React.CSSProperties,
  inputDisabled: {
    backgroundColor: '#f3f4f6',
    color: '#9ca3af',
    cursor: 'not-allowed',
  } as React.CSSProperties,
  inputReadOnly: {
    backgroundColor: '#f3f4f6',
    color: '#1f2937',
    cursor: 'default',
    fontWeight: 700,
  } as React.CSSProperties,
  inputError: {
    borderColor: '#dc2626',
  } as React.CSSProperties,
  inputWarning: {
    borderColor: '#f59e0b',
  } as React.CSSProperties,
  warningIcon: {
    position: 'absolute' as const,
    right: '10px',
    width: '16px',
    height: '16px',
    color: '#f59e0b',
  } as React.CSSProperties,
  errorMessage: {
    fontSize: '12px',
    color: '#dc2626',
  } as React.CSSProperties,
};

// ============================================================================
// サブコンポーネント
// ============================================================================

/**
 * 警告アイコン
 */
function WarningIcon() {
  return (
    <svg
      role="img"
      aria-label="警告"
      style={styles.warningIcon}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

// ============================================================================
// メインコンポーネント
// ============================================================================

/**
 * 数量入力コンポーネント
 *
 * 標準モードでは直接数値を入力する。
 * 計算モードでは計算結果を読み取り専用で表示する。
 * 負の値は警告、数値以外の入力はエラーとして処理する。
 */
export default function QuantityInput({
  value,
  onChange,
  disabled = false,
  readOnly = false,
  hasWarning = false,
  error,
}: QuantityInputProps) {
  const inputId = useId();
  const errorId = `${inputId}-error`;

  /**
   * 値変更ハンドラ
   */
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const inputValue = e.target.value;

      // 空文字の場合
      if (inputValue === '') {
        onChange(undefined, {
          hasWarning: false,
          hasError: true,
          errorMessage: '数量を入力してください',
        });
        return;
      }

      const numValue = parseFloat(inputValue);

      // 数値でない場合
      if (isNaN(numValue)) {
        onChange(undefined, {
          hasWarning: false,
          hasError: true,
          errorMessage: '数量は数値で入力してください',
        });
        return;
      }

      // 負の値の場合は警告
      if (numValue < 0) {
        onChange(numValue, {
          hasWarning: true,
          warningMessage: '負の数量が入力されています。続行しますか？',
          hasError: false,
        });
        return;
      }

      // 正常な値
      onChange(numValue, {
        hasWarning: false,
        hasError: false,
      });
    },
    [onChange]
  );

  const inputStyle = {
    ...styles.input,
    ...(disabled ? styles.inputDisabled : {}),
    ...(readOnly ? styles.inputReadOnly : {}),
    ...(error ? styles.inputError : {}),
    ...(hasWarning && !error ? styles.inputWarning : {}),
  };

  return (
    <div style={styles.container}>
      <div style={styles.labelContainer}>
        <label htmlFor={inputId} style={styles.label}>
          数量
        </label>
        {readOnly && <span style={styles.calculatedLabel}>計算結果</span>}
      </div>
      <div style={styles.inputWrapper}>
        <input
          id={inputId}
          type="number"
          value={value ?? ''}
          onChange={handleChange}
          disabled={disabled}
          readOnly={readOnly}
          step="0.01"
          style={inputStyle}
          aria-invalid={!!error}
          aria-describedby={error ? errorId : undefined}
        />
        {hasWarning && !error && <WarningIcon />}
      </div>
      {error && (
        <span id={errorId} style={styles.errorMessage}>
          {error}
        </span>
      )}
    </div>
  );
}
