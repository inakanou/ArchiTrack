/**
 * @fileoverview オートコンプリート入力コンポーネント
 *
 * Task 7.1: オートコンプリート入力コンポーネントを実装する
 *
 * Requirements:
 * - 7.1: 入力開始時の候補表示
 * - 7.4: 候補選択時の自動入力
 * - 7.5: 上下キー選択とEnter確定
 */

import { useState, useRef, useCallback, useId, useEffect } from 'react';
import { useAutocomplete } from '../../hooks/useAutocomplete';

// ============================================================================
// 型定義
// ============================================================================

/**
 * AutocompleteInputコンポーネントのProps
 */
export interface AutocompleteInputProps {
  /** 現在の入力値 */
  value: string;
  /** 値変更時のコールバック */
  onChange: (value: string) => void;
  /** APIエンドポイント */
  endpoint: string;
  /** プレースホルダー */
  placeholder?: string;
  /** ラベル */
  label?: string;
  /** 入力フィールドのID */
  id?: string;
  /** 追加のクエリパラメータ */
  additionalParams?: Record<string, string>;
  /** 未保存の値リスト（画面上で入力された値） */
  unsavedValues?: string[];
  /** エラーメッセージ */
  error?: string;
  /** 必須フィールドかどうか */
  required?: boolean;
  /** 無効化フラグ */
  disabled?: boolean;
  /** デバウンス遅延（ミリ秒） */
  debounceMs?: number;
  /** オートコンプリート有効化フラグ */
  autocompleteEnabled?: boolean;
}

// ============================================================================
// スタイル定義
// ============================================================================

const styles = {
  container: {
    position: 'relative' as const,
    width: '100%',
  } as React.CSSProperties,
  label: {
    display: 'block',
    marginBottom: '4px',
    fontSize: '13px',
    fontWeight: 500,
    color: '#374151',
  } as React.CSSProperties,
  requiredMark: {
    color: '#dc2626',
    marginLeft: '4px',
  } as React.CSSProperties,
  inputWrapper: {
    position: 'relative' as const,
  } as React.CSSProperties,
  input: {
    width: '100%',
    padding: '8px 32px 8px 12px',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    fontSize: '14px',
    color: '#1f2937',
    backgroundColor: '#ffffff',
    outline: 'none',
    transition: 'border-color 0.2s, box-shadow 0.2s',
    boxSizing: 'border-box' as const,
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
  loadingIndicator: {
    position: 'absolute' as const,
    right: '10px',
    top: '50%',
    transform: 'translateY(-50%)',
    width: '16px',
    height: '16px',
    border: '2px solid #e5e7eb',
    borderTopColor: '#2563eb',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  } as React.CSSProperties,
  dropdown: {
    position: 'absolute' as const,
    top: '100%',
    left: 0,
    right: 0,
    marginTop: '4px',
    maxHeight: '200px',
    overflowY: 'auto' as const,
    backgroundColor: '#ffffff',
    border: '1px solid #e5e7eb',
    borderRadius: '6px',
    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
    zIndex: 50,
  } as React.CSSProperties,
  option: {
    padding: '8px 12px',
    fontSize: '14px',
    color: '#374151',
    cursor: 'pointer',
    transition: 'background-color 0.15s',
  } as React.CSSProperties,
  optionSelected: {
    backgroundColor: '#eff6ff',
    color: '#1d4ed8',
  } as React.CSSProperties,
  optionHover: {
    backgroundColor: '#f3f4f6',
  } as React.CSSProperties,
  errorMessage: {
    marginTop: '4px',
    fontSize: '12px',
    color: '#dc2626',
  } as React.CSSProperties,
};

// ============================================================================
// メインコンポーネント
// ============================================================================

/**
 * オートコンプリート入力コンポーネント
 *
 * 入力時に過去の入力履歴から候補を表示し、
 * キーボード操作やクリックで選択できる。
 *
 * @param props - コンポーネントProps
 */
export default function AutocompleteInput({
  value,
  onChange,
  endpoint,
  placeholder = '',
  label,
  id: propId,
  additionalParams = {},
  unsavedValues = [],
  error,
  required = false,
  disabled = false,
  debounceMs = 300,
  autocompleteEnabled = true,
}: AutocompleteInputProps) {
  const generatedId = useId();
  const inputId = propId || generatedId;
  const listboxId = `${inputId}-listbox`;

  const [isOpen, setIsOpen] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [hoveredIndex, setHoveredIndex] = useState(-1);

  const inputRef = useRef<HTMLInputElement>(null);
  const listboxRef = useRef<HTMLUListElement>(null);

  // useAutocomplete hookで候補を取得
  const { suggestions, isLoading } = useAutocomplete({
    endpoint,
    inputValue: value,
    unsavedValues,
    additionalParams,
    debounceMs,
    enabled: autocompleteEnabled && !disabled,
  });

  // 候補があり、フォーカス中の場合にドロップダウンを開く
  const shouldShowDropdown = isOpen && suggestions.length > 0;

  /**
   * 候補を選択してドロップダウンを閉じる
   */
  const selectSuggestion = useCallback(
    (suggestion: string) => {
      onChange(suggestion);
      setIsOpen(false);
      setSelectedIndex(-1);
      inputRef.current?.focus();
    },
    [onChange]
  );

  /**
   * 入力値変更ハンドラ
   */
  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = e.target.value;
      onChange(newValue);
      setIsOpen(true);
      setSelectedIndex(-1);
    },
    [onChange]
  );

  /**
   * フォーカス時ハンドラ
   */
  const handleFocus = useCallback(() => {
    setIsFocused(true);
    if (value && suggestions.length > 0) {
      setIsOpen(true);
    }
  }, [value, suggestions.length]);

  /**
   * ブラー時ハンドラ
   */
  const handleBlur = useCallback((e: React.FocusEvent<HTMLInputElement>) => {
    // リストボックスへのフォーカス移動の場合は閉じない
    if (e.relatedTarget && listboxRef.current?.contains(e.relatedTarget as Node)) {
      return;
    }
    setIsFocused(false);
    // 遅延してドロップダウンを閉じる（クリック処理を先に実行するため）
    setTimeout(() => {
      setIsOpen(false);
      setSelectedIndex(-1);
    }, 150);
  }, []);

  /**
   * キーダウンハンドラ
   */
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (!shouldShowDropdown) {
        if (e.key === 'ArrowDown' && suggestions.length > 0) {
          setIsOpen(true);
          setSelectedIndex(0);
          e.preventDefault();
        }
        return;
      }

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex((prev) => {
            const next = prev + 1;
            return next >= suggestions.length ? 0 : next;
          });
          break;

        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex((prev) => {
            const next = prev - 1;
            return next < 0 ? suggestions.length - 1 : next;
          });
          break;

        case 'Enter':
          e.preventDefault();
          if (selectedIndex >= 0 && selectedIndex < suggestions.length) {
            const selected = suggestions[selectedIndex];
            if (selected) {
              selectSuggestion(selected);
            }
          }
          break;

        case 'Escape':
          e.preventDefault();
          setIsOpen(false);
          setSelectedIndex(-1);
          break;

        case 'Tab':
          setIsOpen(false);
          setSelectedIndex(-1);
          break;
      }
    },
    [shouldShowDropdown, suggestions, selectedIndex, selectSuggestion]
  );

  /**
   * 候補クリックハンドラ
   */
  const handleOptionClick = useCallback(
    (suggestion: string) => {
      selectSuggestion(suggestion);
    },
    [selectSuggestion]
  );

  /**
   * 選択インデックスが変更されたらスクロール
   */
  useEffect(() => {
    if (selectedIndex >= 0 && listboxRef.current) {
      const selectedOption = listboxRef.current.children[selectedIndex] as HTMLElement;
      if (selectedOption) {
        selectedOption.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [selectedIndex]);

  // 入力スタイルを計算
  const inputStyles = {
    ...styles.input,
    ...(isFocused && !error ? styles.inputFocused : {}),
    ...(error ? styles.inputError : {}),
    ...(disabled ? styles.inputDisabled : {}),
  };

  // 現在選択されている候補のID
  const activeDescendant =
    selectedIndex >= 0 && shouldShowDropdown ? `${listboxId}-option-${selectedIndex}` : undefined;

  return (
    <div style={styles.container}>
      {/* ラベル */}
      {label && (
        <label htmlFor={inputId} style={styles.label}>
          {label}
          {required && <span style={styles.requiredMark}>*</span>}
        </label>
      )}

      {/* 入力フィールドコンテナ */}
      <div style={styles.inputWrapper}>
        <input
          ref={inputRef}
          id={inputId}
          type="text"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={shouldShowDropdown}
          aria-controls={shouldShowDropdown ? listboxId : undefined}
          aria-activedescendant={activeDescendant}
          aria-invalid={!!error}
          aria-required={required}
          aria-describedby={error ? `${inputId}-error` : undefined}
          value={value}
          placeholder={placeholder}
          disabled={disabled}
          style={inputStyles}
          onChange={handleInputChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
        />

        {/* ローディングインジケーター */}
        {isLoading && (
          <div style={styles.loadingIndicator} aria-label="読み込み中" role="status">
            <style>
              {`
                @keyframes spin {
                  to { transform: translateY(-50%) rotate(360deg); }
                }
              `}
            </style>
          </div>
        )}
      </div>

      {/* ドロップダウン候補リスト */}
      {shouldShowDropdown && (
        <ul
          ref={listboxRef}
          id={listboxId}
          role="listbox"
          aria-label={`${label || ''}の候補`}
          style={styles.dropdown}
        >
          {suggestions.map((suggestion, index) => {
            const isSelected = index === selectedIndex;
            const isHovered = index === hoveredIndex;
            const optionId = `${listboxId}-option-${index}`;

            const optionStyles = {
              ...styles.option,
              ...(isSelected ? styles.optionSelected : {}),
              ...(isHovered && !isSelected ? styles.optionHover : {}),
            };

            return (
              <li
                key={suggestion}
                id={optionId}
                role="option"
                aria-selected={isSelected}
                style={optionStyles}
                onClick={() => handleOptionClick(suggestion)}
                onMouseEnter={() => setHoveredIndex(index)}
                onMouseLeave={() => setHoveredIndex(-1)}
              >
                {suggestion}
              </li>
            );
          })}
        </ul>
      )}

      {/* エラーメッセージ */}
      {error && (
        <div id={`${inputId}-error`} style={styles.errorMessage} role="alert">
          {error}
        </div>
      )}
    </div>
  );
}
