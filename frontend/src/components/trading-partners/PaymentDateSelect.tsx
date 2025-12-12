/**
 * @fileoverview 支払日選択コンポーネント
 *
 * Task 7.2: 請求締日・支払日選択コンポーネントの実装
 *
 * 支払日として月選択（翌月/翌々月/3ヶ月後）と日選択（1日〜31日および「末日」）の
 * 組み合わせをドロップダウンで提供するコンポーネントです。
 *
 * @example
 * ```tsx
 * <PaymentDateSelect
 *   monthOffset={1}
 *   day={15}
 *   onChange={({ monthOffset, day }) => {
 *     setPaymentMonthOffset(monthOffset);
 *     setPaymentDay(day);
 *   }}
 *   label="支払日"
 * />
 * ```
 *
 * Requirements:
 * - 2.5: 支払日として月選択（翌月/翌々月/3ヶ月後）と日選択（1日〜31日および「末日」）の組み合わせをドロップダウンで提供する
 * - 4.4: 編集時も同様に支払日の選択肢を提供する
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
 * 月オフセットオプション
 * - 1: 翌月
 * - 2: 翌々月
 * - 3: 3ヶ月後
 */
const MONTH_OFFSET_OPTIONS: Array<{ value: number; label: string }> = [
  { value: 1, label: '翌月' },
  { value: 2, label: '翌々月' },
  { value: 3, label: '3ヶ月後' },
];

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
 * 支払日の値を表す型
 */
export interface PaymentDateValue {
  /** 月オフセット（1=翌月, 2=翌々月, 3=3ヶ月後、null=未選択） */
  monthOffset: number | null;
  /** 日（1-31 or 99=末日、null=未選択） */
  day: number | null;
}

/**
 * PaymentDateSelectコンポーネントのプロパティ
 */
export interface PaymentDateSelectProps {
  /** 月オフセット（1-3、null=未選択） */
  monthOffset: number | null;
  /** 日（1-31 or 99=末日、null=未選択） */
  day: number | null;
  /** 値が変更された時のコールバック */
  onChange: (value: PaymentDateValue) => void;
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
 * 支払日選択コンポーネント
 *
 * 月選択（翌月/翌々月/3ヶ月後）と日選択（1日〜31日および「末日」）の
 * 組み合わせを2つのドロップダウンで提供します。
 *
 * Requirements:
 * - 2.5: 支払日として月選択（翌月/翌々月/3ヶ月後）と日選択の組み合わせをドロップダウンで提供する
 * - 4.4: 編集時も同様に支払日の選択肢を提供する
 */
function PaymentDateSelect({
  monthOffset,
  day,
  onChange,
  label,
  required = false,
  disabled = false,
  error,
}: PaymentDateSelectProps) {
  // 一意のIDを生成
  const uniqueId = useId();
  const monthSelectId = `payment-month-select-${uniqueId}`;
  const daySelectId = `payment-day-select-${uniqueId}`;
  const labelId = `payment-date-label-${uniqueId}`;
  const errorId = `payment-date-error-${uniqueId}`;

  const hasError = !!error;

  /**
   * 月選択の変更ハンドラ
   */
  const handleMonthChange = (e: ChangeEvent<HTMLSelectElement>) => {
    if (disabled) {
      return;
    }

    const selectedValue = e.target.value;
    const newMonthOffset = selectedValue === '' ? null : parseInt(selectedValue, 10);

    onChange({
      monthOffset: newMonthOffset,
      day,
    });
  };

  /**
   * 日選択の変更ハンドラ
   */
  const handleDayChange = (e: ChangeEvent<HTMLSelectElement>) => {
    if (disabled) {
      return;
    }

    const selectedValue = e.target.value;
    const newDay = selectedValue === '' ? null : parseInt(selectedValue, 10);

    onChange({
      monthOffset,
      day: newDay,
    });
  };

  /**
   * select要素の共通スタイル
   */
  const selectStyle: React.CSSProperties = {
    flex: 1,
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
  };

  return (
    <div style={{ marginBottom: '1rem' }}>
      {/* ラベル */}
      <div
        id={labelId}
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
      </div>

      {/* 月選択と日選択のコンテナ */}
      <div
        style={{
          display: 'flex',
          gap: '0.75rem',
          alignItems: 'center',
        }}
      >
        {/* 月選択ドロップダウン */}
        <select
          id={monthSelectId}
          name="paymentMonthOffset"
          value={monthOffset === null ? '' : monthOffset.toString()}
          onChange={handleMonthChange}
          disabled={disabled}
          aria-label={`${label} - 月`}
          aria-invalid={hasError}
          aria-describedby={hasError ? errorId : undefined}
          style={selectStyle}
        >
          <option value="">選択してください</option>
          {MONTH_OFFSET_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        {/* 日選択ドロップダウン */}
        <select
          id={daySelectId}
          name="paymentDay"
          value={day === null ? '' : day.toString()}
          onChange={handleDayChange}
          disabled={disabled}
          aria-label={`${label} - 日`}
          aria-invalid={hasError}
          aria-describedby={hasError ? errorId : undefined}
          style={selectStyle}
        >
          <option value="">選択してください</option>
          {DAY_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

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

export default PaymentDateSelect;
