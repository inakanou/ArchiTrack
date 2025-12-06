import { useState, useId, ChangeEvent, FocusEvent } from 'react';

/**
 * CustomerNameInputコンポーネントのプロパティ
 */
export interface CustomerNameInputProps {
  /** 現在の入力値 */
  value: string;
  /** 値が変更された時のコールバック */
  onChange: (value: string) => void;
  /** フォーカスを外した時のコールバック */
  onBlur?: () => void;
  /** プレースホルダーテキスト */
  placeholder?: string;
  /** 必須フィールドかどうか */
  required?: boolean;
  /** 無効化状態 */
  disabled?: boolean;
  /** 外部から渡されるエラーメッセージ */
  error?: string;
  /** カスタムラベル（デフォルト: "顧客名"） */
  label?: string;
  /**
   * オートコンプリート候補選択時のコールバック
   * 将来的なオートコンプリート機能拡張用
   * 現時点では使用されないが、propsとして受け入れる
   */
  onSuggestionSelect?: (suggestion: string) => void;
}

/** 最大文字数 */
const MAX_LENGTH = 255;

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
    disabled: '#9ca3af',
    disabledBg: '#f3f4f6',
    white: '#ffffff',
  },
  borderRadius: '0.375rem',
  transition: 'border-color 0.15s ease-in-out, box-shadow 0.15s ease-in-out',
} as const;

/**
 * 顧客名入力コンポーネント
 *
 * プロジェクト作成・編集フォームで使用する顧客名入力フィールドです。
 * 将来的に取引先オートコンプリート機能と連携予定。
 *
 * @example
 * ```tsx
 * <CustomerNameInput
 *   value={customerName}
 *   onChange={setCustomerName}
 *   required
 * />
 * ```
 *
 * Requirements:
 * - 16.9: 取引先外の顧客も入力可能
 * - 13.2: 1-255文字のバリデーション
 * - 20.2: アクセシビリティ属性（aria-label）
 */
function CustomerNameInput({
  value,
  onChange,
  onBlur,
  placeholder,
  required = false,
  disabled = false,
  error: externalError,
  label = '顧客名',
  onSuggestionSelect: _onSuggestionSelect, // 将来使用予定
}: CustomerNameInputProps) {
  const [internalError, setInternalError] = useState<string>('');
  const [touched, setTouched] = useState(false);
  const [isFocused, setIsFocused] = useState(false);

  // 一意のIDを生成
  const uniqueId = useId();
  const inputId = `customer-name-input-${uniqueId}`;
  const errorId = `customer-name-error-${uniqueId}`;

  // 表示するエラー（外部エラーを優先）
  const displayError = externalError || internalError;

  /**
   * バリデーションを実行
   */
  const validate = (inputValue: string): string => {
    if (required && !inputValue.trim()) {
      return '顧客名は必須です';
    }
    if (inputValue.length > MAX_LENGTH) {
      return `顧客名は${MAX_LENGTH}文字以内で入力してください`;
    }
    return '';
  };

  /**
   * 入力値変更時のハンドラ
   */
  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    onChange(newValue);

    // タッチ済みの場合のみバリデーションを実行
    if (touched) {
      const validationError = validate(newValue);
      setInternalError(validationError);
    }
  };

  /**
   * フォーカスを外した時のハンドラ
   */
  const handleBlur = (_e: FocusEvent<HTMLInputElement>) => {
    setTouched(true);
    setIsFocused(false);
    const validationError = validate(value);
    setInternalError(validationError);

    if (onBlur) {
      onBlur();
    }
  };

  /**
   * フォーカスを得た時のハンドラ
   */
  const handleFocus = () => {
    if (!disabled) {
      setIsFocused(true);
    }
  };

  const hasError = !!displayError;

  /**
   * 入力フィールドの境界線の色を計算
   */
  const getBorderColor = (): string => {
    if (hasError) return STYLES.colors.error;
    if (isFocused) return STYLES.colors.focus;
    return STYLES.colors.border;
  };

  /**
   * 入力フィールドのボックスシャドウを計算
   */
  const getBoxShadow = (): string => {
    if (!isFocused) return 'none';
    if (hasError) return `0 0 0 3px ${STYLES.colors.errorLight}`;
    return `0 0 0 3px ${STYLES.colors.focusLight}`;
  };

  return (
    <div style={{ marginBottom: '1rem' }}>
      {/* ラベル */}
      <label
        htmlFor={inputId}
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

      {/* 入力フィールド */}
      <input
        id={inputId}
        type="text"
        value={value}
        onChange={handleChange}
        onBlur={handleBlur}
        onFocus={handleFocus}
        placeholder={placeholder}
        disabled={disabled}
        aria-label={label}
        aria-required={required}
        aria-invalid={hasError}
        aria-describedby={hasError ? errorId : undefined}
        style={{
          width: '100%',
          padding: '0.5rem 0.75rem',
          border: hasError ? `2px solid ${STYLES.colors.error}` : `1px solid ${getBorderColor()}`,
          borderRadius: STYLES.borderRadius,
          fontSize: '1rem',
          lineHeight: '1.5',
          color: disabled ? STYLES.colors.disabled : STYLES.colors.text,
          backgroundColor: disabled ? STYLES.colors.disabledBg : STYLES.colors.white,
          outline: 'none',
          cursor: disabled ? 'not-allowed' : 'text',
          transition: STYLES.transition,
          boxShadow: getBoxShadow(),
        }}
      />

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
          {displayError}
        </p>
      )}
    </div>
  );
}

export default CustomerNameInput;
