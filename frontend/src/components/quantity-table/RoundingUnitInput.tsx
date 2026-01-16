/**
 * @fileoverview 丸め設定入力コンポーネント
 *
 * Task 6.4: 丸め設定入力コンポーネントを実装する
 *
 * Requirements:
 * - 10.1: 数量項目を追加する場合、丸め設定列に「0.01」をデフォルト値として設定する
 * - 10.2: 丸め設定列に数値を入力する場合、調整係数適用後の値を指定された単位で切り上げた値を最終数量として設定する
 * - 10.3: 丸め設定列に0以下の値が入力される場合、エラーメッセージを表示し、正の値の入力を求める
 * - 10.4: 丸め設定列に数値以外の文字が入力される場合、入力を拒否しエラーメッセージを表示する
 * - 10.5: 丸め設定が設定されている状態で、調整係数適用後の値変更時に丸め処理を自動再実行する
 */

import { useCallback, useId } from 'react';

// ============================================================================
// 型定義
// ============================================================================

/**
 * 入力結果のメタ情報
 */
export interface RoundingUnitInputMeta {
  /** エラーがあるか */
  hasError: boolean;
  /** エラーメッセージ */
  errorMessage?: string;
}

/**
 * RoundingUnitInputコンポーネントのProps
 */
export interface RoundingUnitInputProps {
  /** 現在の値 */
  value: number | undefined;
  /** 値変更時のコールバック */
  onChange: (value: number | undefined, meta: RoundingUnitInputMeta) => void;
  /** 無効化状態 */
  disabled?: boolean;
  /** エラーメッセージ */
  error?: string;
}

// ============================================================================
// 定数
// ============================================================================

/**
 * プリセット値
 */
const PRESET_VALUES = [0.01, 0.1, 1];

// ============================================================================
// スタイル定義
// ============================================================================

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '4px',
  } as React.CSSProperties,
  label: {
    fontSize: '12px',
    fontWeight: 500,
    color: '#374151',
  } as React.CSSProperties,
  inputWrapper: {
    display: 'flex',
    gap: '8px',
    alignItems: 'center',
  } as React.CSSProperties,
  input: {
    flex: 1,
    height: '36px',
    padding: '0 12px',
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
  presetsContainer: {
    display: 'flex',
    gap: '4px',
  } as React.CSSProperties,
  presetButton: {
    height: '28px',
    padding: '0 8px',
    fontSize: '11px',
    fontWeight: 500,
    border: '1px solid #e5e7eb',
    borderRadius: '4px',
    backgroundColor: '#f9fafb',
    color: '#374151',
    cursor: 'pointer',
    transition: 'background-color 0.2s, border-color 0.2s',
  } as React.CSSProperties,
  presetButtonDisabled: {
    backgroundColor: '#f3f4f6',
    color: '#9ca3af',
    cursor: 'not-allowed',
    borderColor: '#e5e7eb',
  } as React.CSSProperties,
  errorMessage: {
    fontSize: '12px',
    color: '#dc2626',
  } as React.CSSProperties,
};

// ============================================================================
// メインコンポーネント
// ============================================================================

/**
 * 丸め設定入力コンポーネント
 *
 * 数量の丸め単位を入力するフィールド。
 * デフォルト値は0.01。
 * 0以下の値はエラー、プリセット値のボタンも提供する。
 */
export default function RoundingUnitInput({
  value,
  onChange,
  disabled = false,
  error,
}: RoundingUnitInputProps) {
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
          hasError: true,
          errorMessage: '丸め設定を入力してください',
        });
        return;
      }

      const numValue = parseFloat(inputValue);

      // 数値でない場合
      if (isNaN(numValue)) {
        onChange(undefined, {
          hasError: true,
          errorMessage: '丸め設定は数値で入力してください',
        });
        return;
      }

      // 0以下の場合はエラー
      if (numValue <= 0) {
        onChange(numValue, {
          hasError: true,
          errorMessage: '丸め設定は正の値を入力してください',
        });
        return;
      }

      // 正常な値
      onChange(numValue, {
        hasError: false,
      });
    },
    [onChange]
  );

  /**
   * プリセットボタンクリックハンドラ
   */
  const handlePresetClick = useCallback(
    (presetValue: number) => {
      onChange(presetValue, {
        hasError: false,
      });
    },
    [onChange]
  );

  const inputStyle = {
    ...styles.input,
    ...(disabled ? styles.inputDisabled : {}),
    ...(error ? styles.inputError : {}),
  };

  return (
    <div style={styles.container}>
      <label htmlFor={inputId} style={styles.label}>
        丸め設定
      </label>
      <div style={styles.inputWrapper}>
        <input
          id={inputId}
          type="number"
          value={value ?? ''}
          onChange={handleChange}
          disabled={disabled}
          step="0.001"
          min="0"
          style={inputStyle}
          aria-invalid={!!error}
          aria-describedby={error ? errorId : undefined}
        />
        <div style={styles.presetsContainer}>
          {PRESET_VALUES.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => handlePresetClick(preset)}
              disabled={disabled}
              style={{
                ...styles.presetButton,
                ...(disabled ? styles.presetButtonDisabled : {}),
              }}
            >
              {preset}
            </button>
          ))}
        </div>
      </div>
      {error && (
        <span id={errorId} style={styles.errorMessage}>
          {error}
        </span>
      )}
    </div>
  );
}
