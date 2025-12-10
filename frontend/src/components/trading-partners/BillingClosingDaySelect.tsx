/**
 * @fileoverview 請求締日選択コンポーネント
 *
 * Task 7.2: 請求締日・支払日選択コンポーネントの実装
 *
 * 請求締日として1日〜31日および「末日」の計32オプションをドロップダウンで
 * 提供するコンポーネントです。
 *
 * @example
 * ```tsx
 * <BillingClosingDaySelect
 *   value={15}
 *   onChange={(day) => setBillingClosingDay(day)}
 *   label="請求締日"
 * />
 * ```
 *
 * Requirements:
 * - 2.4: 請求締日として1日〜31日および「末日」の計32オプションをドロップダウンで提供する
 * - 4.3: 編集時も同様に請求締日の選択肢を提供する
 */

import { useId, ChangeEvent } from 'react';

// ============================================================================
// 定数定義
// ============================================================================

/** 末日を表す値（99） */
export const LAST_DAY_VALUE = 99;

/** 末日のラベル */
const LAST_DAY_LABEL = '末日';

/**
 * 日付オプションを生成する関数
 * 1日〜31日と末日（99）の計32オプションを返す
 */
function generateDayOptions(): Array<{ value: number; label: string }> {
  const options: Array<{ value: number; label: string }> = [];

  // 1日〜31日
  for (let day = 1; day <= 31; day++) {
    options.push({ value: day, label: `${day}日` });
  }

  // 末日
  options.push({ value: LAST_DAY_VALUE, label: LAST_DAY_LABEL });

  return options;
}

/** 日付オプション（32オプション） */
const DAY_OPTIONS = generateDayOptions();

// ============================================================================
// 型定義
// ============================================================================

/**
 * BillingClosingDaySelectコンポーネントのプロパティ
 */
export interface BillingClosingDaySelectProps {
  /** 現在の値（1-31 or 99=末日、null=未選択） */
  value: number | null;
  /** 値が変更された時のコールバック */
  onChange: (value: number | null) => void;
  /** ラベルテキスト */
  label: string;
  /** 必須フィールドかどうか */
  required?: boolean;
  /** 無効化状態 */
  disabled?: boolean;
  /** エラーメッセージ */
  error?: string;
}

// ============================================================================
// スタイル定数
// ============================================================================

/** スタイル定数 */
const STYLES = {
  colors: {
    error: '#dc2626',
    focus: '#2563eb',
    border: '#d1d5db',
    label: '#374151',
    text: '#111827',
    disabled: '#9ca3af',
    disabledBg: '#f3f4f6',
    white: '#ffffff',
  },
  borderRadius: '0.375rem',
  transition: 'border-color 0.15s ease-in-out, box-shadow 0.15s ease-in-out',
} as const;

// ============================================================================
// コンポーネント
// ============================================================================

/**
 * 請求締日選択コンポーネント
 *
 * 1日〜31日および「末日」の計32オプションをドロップダウンで提供します。
 * 末日は内部的に99として扱われます。
 *
 * Requirements:
 * - 2.4: 請求締日として1日〜31日および「末日」の計32オプションをドロップダウンで提供する
 * - 4.3: 編集時も同様に請求締日の選択肢を提供する
 */
function BillingClosingDaySelect({
  value,
  onChange,
  label,
  required = false,
  disabled = false,
  error,
}: BillingClosingDaySelectProps) {
  // 一意のIDを生成
  const uniqueId = useId();
  const selectId = `billing-closing-day-select-${uniqueId}`;
  const labelId = `billing-closing-day-label-${uniqueId}`;
  const errorId = `billing-closing-day-error-${uniqueId}`;

  const hasError = !!error;

  /**
   * select要素の変更ハンドラ
   */
  const handleChange = (e: ChangeEvent<HTMLSelectElement>) => {
    if (disabled) {
      return;
    }

    const selectedValue = e.target.value;

    if (selectedValue === '') {
      onChange(null);
    } else {
      onChange(parseInt(selectedValue, 10));
    }
  };

  return (
    <div style={{ marginBottom: '1rem' }}>
      {/* ラベル */}
      <label
        id={labelId}
        htmlFor={selectId}
        style={{
          display: 'block',
          marginBottom: '0.5rem',
          fontWeight: 500,
          color: hasError ? STYLES.colors.error : STYLES.colors.label,
        }}
      >
        {label}
        {required && (
          <span
            style={{
              color: STYLES.colors.error,
              marginLeft: '0.25rem',
            }}
            aria-hidden="true"
          >
            *
          </span>
        )}
      </label>

      {/* ドロップダウン */}
      <select
        id={selectId}
        value={value === null ? '' : value.toString()}
        onChange={handleChange}
        disabled={disabled}
        aria-labelledby={labelId}
        aria-required={required}
        aria-invalid={hasError}
        aria-describedby={hasError ? errorId : undefined}
        style={{
          width: '100%',
          padding: '0.5rem 0.75rem',
          fontSize: '1rem',
          lineHeight: 1.5,
          color: disabled ? STYLES.colors.disabled : STYLES.colors.text,
          backgroundColor: disabled ? STYLES.colors.disabledBg : STYLES.colors.white,
          border: `1px solid ${hasError ? STYLES.colors.error : STYLES.colors.border}`,
          borderRadius: STYLES.borderRadius,
          outline: 'none',
          cursor: disabled ? 'not-allowed' : 'pointer',
          transition: STYLES.transition,
        }}
      >
        {/* 未選択オプション */}
        <option value="">選択してください</option>

        {/* 日付オプション（32オプション） */}
        {DAY_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>

      {/* エラーメッセージ */}
      {hasError && (
        <p
          id={errorId}
          role="alert"
          aria-live="polite"
          style={{
            marginTop: '0.25rem',
            fontSize: '0.875rem',
            color: STYLES.colors.error,
          }}
        >
          {error}
        </p>
      )}
    </div>
  );
}

export default BillingClosingDaySelect;
