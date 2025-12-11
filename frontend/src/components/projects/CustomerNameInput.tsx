import {
  useState,
  useId,
  useEffect,
  useRef,
  useCallback,
  ChangeEvent,
  FocusEvent,
  KeyboardEvent,
} from 'react';
import { searchTradingPartnersForAutocomplete } from '../../api/trading-partners';
import type { TradingPartnerSearchResult } from '../../types/trading-partner.types';
import { useDebounce } from '../../utils/react';

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
  /**
   * オートコンプリート機能を有効にするかどうか
   * デフォルト: false（後方互換性のため）
   *
   * Task 18.2: 取引先オートコンプリート機能拡張
   */
  enableAutocomplete?: boolean;
}

/** 最大文字数 */
const MAX_LENGTH = 255;

/** オートコンプリートの最大候補数 */
const MAX_SUGGESTIONS = 10;

/** デバウンス遅延（ミリ秒） */
const DEBOUNCE_DELAY = 300;

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
    hoverBg: '#f3f4f6',
    selectedBg: '#e5e7eb',
    subText: '#6b7280',
  },
  borderRadius: '0.375rem',
  transition: 'border-color 0.15s ease-in-out, box-shadow 0.15s ease-in-out',
} as const;

/**
 * 顧客名入力コンポーネント
 *
 * プロジェクト作成・編集フォームで使用する顧客名入力フィールドです。
 * enableAutocomplete=trueで取引先オートコンプリート機能が有効になります。
 *
 * @example
 * ```tsx
 * // 基本的な使用（オートコンプリート無効）
 * <CustomerNameInput
 *   value={customerName}
 *   onChange={setCustomerName}
 *   required
 * />
 *
 * // オートコンプリート有効
 * <CustomerNameInput
 *   value={customerName}
 *   onChange={setCustomerName}
 *   enableAutocomplete
 *   required
 * />
 * ```
 *
 * Requirements:
 * - 16.9: 取引先外の顧客も入力可能
 * - 13.2: 1-255文字のバリデーション
 * - 20.2: アクセシビリティ属性（aria-label）
 * - 22.1: 顧客種別を持つ取引先をオートコンプリート候補として表示
 * - 22.3: 入力文字列で取引先名・フリガナの部分一致検索
 * - 16.5: 候補は最大10件まで表示
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
  onSuggestionSelect,
  enableAutocomplete = false,
}: CustomerNameInputProps) {
  const [internalError, setInternalError] = useState<string>('');
  const [touched, setTouched] = useState(false);
  const [isFocused, setIsFocused] = useState(false);

  // オートコンプリート関連の状態
  const [suggestions, setSuggestions] = useState<TradingPartnerSearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);

  // refs
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // デバウンスされた値
  const debouncedValue = useDebounce(value, DEBOUNCE_DELAY);

  // 一意のIDを生成
  const uniqueId = useId();
  const inputId = `customer-name-input-${uniqueId}`;
  const errorId = `customer-name-error-${uniqueId}`;
  const listboxId = `customer-name-listbox-${uniqueId}`;

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
   * オートコンプリート候補を取得
   */
  const fetchSuggestions = useCallback(
    async (searchValue: string) => {
      if (!enableAutocomplete || !searchValue.trim()) {
        setSuggestions([]);
        setShowSuggestions(false);
        return;
      }

      setIsLoading(true);
      try {
        const results = await searchTradingPartnersForAutocomplete(searchValue, MAX_SUGGESTIONS);
        setSuggestions(results);
        setShowSuggestions(true);
        setSelectedIndex(-1);
      } catch {
        // エラー時は候補を表示しない（フリー入力は可能）
        setSuggestions([]);
        setShowSuggestions(false);
      } finally {
        setIsLoading(false);
      }
    },
    [enableAutocomplete]
  );

  /**
   * デバウンスされた値が変更されたらAPI呼び出し
   */
  useEffect(() => {
    if (enableAutocomplete && debouncedValue && isFocused) {
      fetchSuggestions(debouncedValue);
    }
  }, [debouncedValue, enableAutocomplete, isFocused, fetchSuggestions]);

  /**
   * 外部クリックで候補リストを閉じる
   */
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
        setSelectedIndex(-1);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  /**
   * 候補を選択
   */
  const selectSuggestion = useCallback(
    (suggestion: TradingPartnerSearchResult) => {
      onChange(suggestion.name);
      setShowSuggestions(false);
      setSelectedIndex(-1);
      setSuggestions([]);
      if (onSuggestionSelect) {
        onSuggestionSelect(suggestion.name);
      }
    },
    [onChange, onSuggestionSelect]
  );

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

    // 入力がクリアされた場合は候補リストを閉じる
    if (!newValue.trim()) {
      setShowSuggestions(false);
      setSuggestions([]);
    }
  };

  /**
   * キーボード操作のハンドラ
   */
  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!enableAutocomplete || !showSuggestions || suggestions.length === 0) {
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex((prev) => Math.min(prev + 1, suggestions.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        const selectedSuggestion = suggestions[selectedIndex];
        if (selectedIndex >= 0 && selectedSuggestion) {
          selectSuggestion(selectedSuggestion);
        }
        break;
      case 'Escape':
        e.preventDefault();
        setShowSuggestions(false);
        setSelectedIndex(-1);
        break;
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
      // フォーカス時に値があれば候補を表示
      if (enableAutocomplete && value.trim()) {
        fetchSuggestions(value);
      }
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
    <div style={{ marginBottom: '1rem', position: 'relative' }} ref={containerRef}>
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
        ref={inputRef}
        id={inputId}
        type="text"
        value={value}
        onChange={handleChange}
        onBlur={handleBlur}
        onFocus={handleFocus}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        aria-label={label}
        aria-required={required}
        aria-invalid={hasError}
        aria-describedby={hasError ? errorId : undefined}
        aria-autocomplete={enableAutocomplete ? 'list' : undefined}
        aria-controls={enableAutocomplete && showSuggestions ? listboxId : undefined}
        aria-expanded={enableAutocomplete ? showSuggestions : undefined}
        aria-activedescendant={
          enableAutocomplete && showSuggestions && selectedIndex >= 0
            ? `suggestion-${uniqueId}-${selectedIndex}`
            : undefined
        }
        role={enableAutocomplete ? 'combobox' : undefined}
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

      {/* ローディングインジケータ */}
      {enableAutocomplete && isLoading && (
        <div
          role="status"
          aria-label="取引先を検索中"
          style={{
            position: 'absolute',
            right: '0.75rem',
            top: '50%',
            transform: 'translateY(-50%)',
            marginTop: '0.75rem',
          }}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            style={{ animation: 'spin 1s linear infinite' }}
          >
            <circle
              cx="12"
              cy="12"
              r="10"
              stroke={STYLES.colors.border}
              strokeWidth="3"
              fill="none"
            />
            <path
              d="M12 2a10 10 0 0 1 10 10"
              stroke={STYLES.colors.focus}
              strokeWidth="3"
              fill="none"
              strokeLinecap="round"
            />
          </svg>
          <style>{`
            @keyframes spin {
              from { transform: rotate(0deg); }
              to { transform: rotate(360deg); }
            }
          `}</style>
        </div>
      )}

      {/* オートコンプリート候補リスト */}
      {enableAutocomplete && showSuggestions && !isLoading && (
        <ul
          id={listboxId}
          role="listbox"
          aria-label="取引先候補"
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            maxHeight: '240px',
            overflowY: 'auto',
            margin: 0,
            padding: 0,
            listStyle: 'none',
            backgroundColor: STYLES.colors.white,
            border: `1px solid ${STYLES.colors.border}`,
            borderRadius: STYLES.borderRadius,
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
            zIndex: 1000,
          }}
        >
          {suggestions.length === 0 ? (
            <li
              style={{
                padding: '0.75rem 1rem',
                color: STYLES.colors.subText,
                textAlign: 'center',
              }}
            >
              該当する取引先がありません
            </li>
          ) : (
            suggestions.map((suggestion, index) => (
              <li
                key={suggestion.id}
                id={`suggestion-${uniqueId}-${index}`}
                role="option"
                aria-selected={index === selectedIndex}
                onClick={() => selectSuggestion(suggestion)}
                onMouseEnter={() => setSelectedIndex(index)}
                style={{
                  padding: '0.75rem 1rem',
                  cursor: 'pointer',
                  backgroundColor:
                    index === selectedIndex ? STYLES.colors.selectedBg : STYLES.colors.white,
                  transition: 'background-color 0.1s ease',
                }}
              >
                <div
                  style={{
                    fontWeight: 500,
                    color: STYLES.colors.text,
                  }}
                >
                  {suggestion.name}
                </div>
                <div
                  style={{
                    fontSize: '0.875rem',
                    color: STYLES.colors.subText,
                    marginTop: '0.125rem',
                  }}
                >
                  {suggestion.nameKana}
                </div>
              </li>
            ))
          )}
        </ul>
      )}

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
