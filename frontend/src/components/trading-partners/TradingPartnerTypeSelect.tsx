/**
 * @fileoverview 取引先種別選択コンポーネント
 *
 * Task 7.1: 取引先種別選択コンポーネントの実装
 *
 * 顧客・協力業者をチェックボックスで選択可能にし、複数選択に対応した
 * 状態管理を提供するコンポーネントです。
 *
 * @example
 * ```tsx
 * <TradingPartnerTypeSelect
 *   value={['CUSTOMER']}
 *   onChange={(types) => setTypes(types)}
 *   label="取引先種別"
 *   required
 * />
 * ```
 *
 * Requirements:
 * - 2.6: 種別選択肢として「顧客」と「協力業者」をチェックボックスで提供し、複数選択を可能とする
 * - 6.4: ユーザーが取引先を登録または編集するとき、取引先種別をチェックボックスで選択させる
 */

import { useId, ChangeEvent } from 'react';
import {
  TradingPartnerType,
  TRADING_PARTNER_TYPES,
  TRADING_PARTNER_TYPE_LABELS,
} from '../../types/trading-partner.types';

/**
 * TradingPartnerTypeSelectコンポーネントのプロパティ
 */
export interface TradingPartnerTypeSelectProps {
  /** 現在選択されている種別の配列 */
  value: TradingPartnerType[];
  /** 選択が変更された時のコールバック */
  onChange: (types: TradingPartnerType[]) => void;
  /** ラベルテキスト */
  label: string;
  /** 必須フィールドかどうか */
  required?: boolean;
  /** 無効化状態 */
  disabled?: boolean;
  /** エラーメッセージ */
  error?: string;
}

/** スタイル定数 */
const STYLES = {
  colors: {
    error: '#dc2626',
    errorLight: 'rgba(220, 38, 38, 0.1)',
    focus: '#2563eb',
    focusLight: 'rgba(37, 99, 235, 0.1)',
    border: '#d1d5db',
    label: '#374151',
    text: '#111827',
    disabled: '#6b7280', // WCAG 2.1 AA準拠 (5.0:1 on #fff)
    disabledBg: '#f3f4f6',
    white: '#ffffff',
  },
  borderRadius: '0.375rem',
  transition: 'border-color 0.15s ease-in-out, box-shadow 0.15s ease-in-out',
} as const;

/**
 * 取引先種別選択コンポーネント
 *
 * 顧客・協力業者をチェックボックスで選択できるUIを提供します。
 * 複数選択に対応しており、1つの取引先が「顧客」と「協力業者」の両方
 * であることを可能にします。
 *
 * Requirements:
 * - 2.6: 種別選択肢として「顧客」と「協力業者」をチェックボックスで提供し、複数選択を可能とする
 * - 6.4: ユーザーが取引先を登録または編集するとき、取引先種別をチェックボックスで選択させる
 */
function TradingPartnerTypeSelect({
  value,
  onChange,
  label,
  required = false,
  disabled = false,
  error,
}: TradingPartnerTypeSelectProps) {
  // 一意のIDを生成
  const uniqueId = useId();
  const groupId = `trading-partner-type-group-${uniqueId}`;
  const errorId = `trading-partner-type-error-${uniqueId}`;

  const hasError = !!error;

  /**
   * チェックボックスの変更ハンドラ
   * チェックされた場合は配列に追加、チェック解除された場合は配列から削除
   */
  const handleChange = (type: TradingPartnerType) => (e: ChangeEvent<HTMLInputElement>) => {
    if (disabled) {
      return;
    }

    const isChecked = e.target.checked;

    if (isChecked) {
      // 追加（順序を維持するため、TRADING_PARTNER_TYPESの順序に従う）
      const newTypes = TRADING_PARTNER_TYPES.filter(
        (t) => value.includes(t) || t === type
      ) as TradingPartnerType[];
      onChange(newTypes);
    } else {
      // 削除
      const newTypes = value.filter((t) => t !== type);
      onChange(newTypes);
    }
  };

  /**
   * 特定の種別が選択されているかどうかを判定
   */
  const isTypeSelected = (type: TradingPartnerType): boolean => {
    return value.includes(type);
  };

  return (
    <div style={{ marginBottom: '1rem' }}>
      {/* ラベル */}
      <div
        id={`${groupId}-label`}
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

      {/* チェックボックスグループ */}
      <div
        role="group"
        aria-labelledby={`${groupId}-label`}
        aria-describedby={hasError ? errorId : undefined}
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '1rem',
        }}
      >
        {TRADING_PARTNER_TYPES.map((type) => {
          const checkboxId = `${groupId}-${type}`;
          const typeLabel = TRADING_PARTNER_TYPE_LABELS[type];

          return (
            <label
              key={type}
              htmlFor={checkboxId}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                cursor: disabled ? 'not-allowed' : 'pointer',
                color: disabled ? STYLES.colors.disabled : STYLES.colors.text,
              }}
            >
              <input
                type="checkbox"
                id={checkboxId}
                name={type}
                checked={isTypeSelected(type)}
                onChange={handleChange(type)}
                disabled={disabled}
                aria-label={typeLabel}
                style={{
                  width: '1rem',
                  height: '1rem',
                  cursor: disabled ? 'not-allowed' : 'pointer',
                  accentColor: STYLES.colors.focus,
                }}
              />
              <span>{typeLabel}</span>
            </label>
          );
        })}
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

export default TradingPartnerTypeSelect;
