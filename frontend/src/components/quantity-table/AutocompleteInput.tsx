/**
 * @fileoverview オートコンプリート入力コンポーネント
 *
 * Task 7.1: オートコンプリート入力コンポーネントを実装する
 * Task 17.1: クライアントサイド候補ストア方式に更新する
 * Task 18.1: 旧useAutocompleteフックを廃止し新モード専用に統合する
 * Task 25.2: フォーカス時にvalueの有無に関わらずドロップダウンを開くよう修正
 *
 * Requirements:
 * - 7.1: 入力開始時の候補表示
 * - 7.3: クライアントサイドでのフィルタリング表示（フォーカス時に全候補表示）
 * - 7.3a: 空フィールドへのフォーカス時に全候補をドロップダウン表示
 * - 7.4: 候補選択時の自動入力
 * - 7.5: 上下キー選択とEnter確定
 * - 7.6: blur時の候補追加はAPIリクエスト不要
 * - 7.7: 候補を50音順に表示
 */

import { useState, useRef, useCallback, useId, useEffect, useMemo } from 'react';
import type { AutocompleteFieldName } from '../../hooks/useAutocompleteCandidateStore';

// ============================================================================
// 型定義
// ============================================================================

/**
 * AutocompleteInputコンポーネントのProps（新モード専用）
 */
export interface AutocompleteInputProps {
  /** 現在の入力値 */
  value: string;
  /** 値変更時のコールバック */
  onChange: (value: string) => void;
  /** 対象フィールド名 */
  field: AutocompleteFieldName;
  /** 候補を取得する関数（AutocompleteCandidateStoreから注入） */
  getSuggestions: (field: AutocompleteFieldName, inputText: string) => string[];
  /** blur時に候補を追加する関数（AutocompleteCandidateStoreから注入） */
  onBlurAddCandidate: (field: AutocompleteFieldName, value: string) => void;
  /** プレースホルダー */
  placeholder?: string;
  /** ラベル */
  label?: string;
  /** 入力フィールドのID */
  id?: string;
  /** エラーメッセージ */
  error?: string;
  /** 必須フィールドかどうか */
  required?: boolean;
  /** 無効化フラグ */
  disabled?: boolean;
}

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
  label: {
    display: 'block',
    fontSize: '11px',
    fontWeight: 500,
    color: '#374151',
    whiteSpace: 'nowrap' as const,
    height: '14px',
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
  dropdown: {
    position: 'absolute' as const,
    top: '100%',
    left: 0,
    minWidth: '100%',
    marginTop: '2px',
    maxHeight: '200px',
    overflowY: 'auto' as const,
    overflowX: 'hidden' as const,
    backgroundColor: '#ffffff',
    border: '1px solid #e5e7eb',
    borderRadius: '0px',
    boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
    zIndex: 50,
  } as React.CSSProperties,
  option: {
    padding: '4px 8px',
    fontSize: '12px',
    color: '#374151',
    cursor: 'pointer',
    transition: 'background-color 0.15s',
    whiteSpace: 'nowrap' as const,
    overflow: 'hidden' as const,
    textOverflow: 'ellipsis' as const,
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
 * クライアントサイド候補ストアベース（getSuggestions関数使用）で
 * field + getSuggestions + onBlurAddCandidate propsを受け取ります。
 *
 * @param props - コンポーネントProps
 */
export default function AutocompleteInput(props: AutocompleteInputProps) {
  const {
    value,
    onChange,
    field,
    getSuggestions,
    onBlurAddCandidate,
    placeholder = '',
    label,
    id: propId,
    error,
    required = false,
    disabled = false,
  } = props;

  const generatedId = useId();
  const inputId = propId || generatedId;
  const listboxId = `${inputId}-listbox`;

  const [isOpen, setIsOpen] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [hoveredIndex, setHoveredIndex] = useState(-1);

  const inputRef = useRef<HTMLInputElement>(null);
  const listboxRef = useRef<HTMLUListElement>(null);

  // getSuggestionsで候補を取得
  const suggestions = useMemo(() => {
    return getSuggestions(field, value);
  }, [field, value, getSuggestions]);

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
   * Task 19.1: フォーカス時に既存の入力値を全選択する
   * Task 25.2: フォーカス時にvalueの有無に関わらずドロップダウンを開く
   */
  const handleFocus = useCallback(() => {
    setIsFocused(true);
    // フォーカス時に既存の入力値を全選択（上書き入力の効率化）
    inputRef.current?.select();
    if (suggestions.length > 0) {
      setIsOpen(true);
    }
  }, [suggestions.length]);

  /**
   * ブラー時ハンドラ
   * blur時にonBlurAddCandidateを呼び出して確定値を候補に追加
   */
  const handleBlur = useCallback(
    (e: React.FocusEvent<HTMLInputElement>) => {
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

      // blur時に確定値を候補リストに追加（APIリクエストなし）
      if (!disabled && value.trim()) {
        onBlurAddCandidate(field, value);
      }
    },
    [disabled, value, field, onBlurAddCandidate]
  );

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
