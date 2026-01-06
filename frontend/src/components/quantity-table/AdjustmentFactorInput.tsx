/**
 * @fileoverview 調整係数入力コンポーネント
 *
 * Task 6.3: 調整係数入力コンポーネントを実装する
 *
 * Requirements:
 * - 9.1: 数量項目を追加する場合、調整係数列に「1.00」をデフォルト値として設定する
 * - 9.2: 調整係数列に数値を入力する場合、計算結果に調整係数を乗算した値を数量として設定する
 * - 9.3: 調整係数列に0以下の値が入力される場合、警告メッセージを表示し、確認を求める
 * - 9.4: 調整係数列に数値以外の文字が入力される場合、入力を拒否しエラーメッセージを表示する
 * - 9.5: 調整係数が設定されている状態で、計算元の値変更時に調整係数を適用した数量を自動再計算する
 */

import { useCallback, useId } from 'react';

// ============================================================================
// 型定義
// ============================================================================

/**
 * 入力結果のメタ情報
 */
export interface AdjustmentFactorInputMeta {
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
 * AdjustmentFactorInputコンポーネントのProps
 */
export interface AdjustmentFactorInputProps {
  /** 現在の値 */
  value: number | undefined;
  /** 値変更時のコールバック */
  onChange: (value: number | undefined, meta: AdjustmentFactorInputMeta) => void;
  /** 無効化状態 */
  disabled?: boolean;
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
    fontSize: '13px',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    backgroundColor: '#ffffff',
    color: '#1f2937',
    outline: 'none',
    transition: 'border-color 0.2s, box-shadow 0.2s',
  } as React.CSSProperties,
  inputDisabled: {
    backgroundColor: '#f3f4f6',
    color: '#9ca3af',
    cursor: 'not-allowed',
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
 * 調整係数入力コンポーネント
 *
 * 数量に乗算する調整係数を入力するフィールド。
 * デフォルト値は1.00。
 * 0以下の値は警告、数値以外の入力はエラーとして処理する。
 */
export default function AdjustmentFactorInput({
  value,
  onChange,
  disabled = false,
  hasWarning = false,
  error,
}: AdjustmentFactorInputProps) {
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
          errorMessage: '調整係数を入力してください',
        });
        return;
      }

      const numValue = parseFloat(inputValue);

      // 数値でない場合
      if (isNaN(numValue)) {
        onChange(undefined, {
          hasWarning: false,
          hasError: true,
          errorMessage: '調整係数は数値で入力してください',
        });
        return;
      }

      // 0以下の場合は警告
      if (numValue <= 0) {
        onChange(numValue, {
          hasWarning: true,
          warningMessage: '調整係数が0以下です。続行しますか？',
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
    ...(error ? styles.inputError : {}),
    ...(hasWarning && !error ? styles.inputWarning : {}),
  };

  return (
    <div style={styles.container}>
      <div style={styles.labelContainer}>
        <label htmlFor={inputId} style={styles.label}>
          調整係数
        </label>
      </div>
      <div style={styles.inputWrapper}>
        <input
          id={inputId}
          type="number"
          value={value ?? ''}
          onChange={handleChange}
          disabled={disabled}
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
