/**
 * @fileoverview 受領見積書の業者名の入力（自由入力と協力業者の候補）
 *
 * 業者名は自由に入力でき、入力を止めてからデバウンスの後に登録済みの協力業者の取引先を
 * `searchTradingPartners(q, ['SUBCONTRACTOR'], 10)` で検索して候補に出す（CustomerNameInput と同じ形）。
 * 候補を選ぶと取引先の名前と ID を返し、選ばずに入力した文字はそのまま業者名として保つ。
 * 選んだ後に文字を打ち直すと取引先の ID を外す（サーバーが名前で照合し直す）。文字を変えない限り
 * ID は保ち、再保存で今の取引先の ID をそのまま送れるようにする（113.2 の申し送り）。
 * 検索が権限の不足などで失敗したときは候補を出さず、自由な入力を続けられる。
 * `TradingPartnerSelect` は自由な文字を保てないため使わない（design の D4）。
 *
 * 根拠: 43.6, 44.4, 44.5（estimate-request のタスク117.3。design の同章の VendorNameInput）
 */

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
} from 'react';
import { searchTradingPartners } from '../../api/trading-partners';
import type { TradingPartnerSearchResult } from '../../types/trading-partner.types';
import { useDebounce } from '../../utils/react';

/** 検索のデバウンス（ミリ秒。CustomerNameInput と同じ） */
export const VENDOR_NAME_SEARCH_DEBOUNCE_MS = 300;
/** 候補の最大件数 */
export const VENDOR_NAME_MAX_SUGGESTIONS = 10;
/** 業者名の上限（44.1） */
export const VENDOR_NAME_MAX_LENGTH = 200;
/** 業者名が空のときの文言（43.8。サーバーの検証と同じ） */
export const VENDOR_NAME_REQUIRED_MESSAGE = '業者名を入力してください';

/** 業者名の入力の値 */
export interface VendorNameValue {
  /** 業者名（入力した文字、または選んだ取引先の名前） */
  vendorName: string;
  /** 選んだ取引先の ID。選ばずに入力した・打ち直したときは null */
  tradingPartnerId: string | null;
}

export interface VendorNameInputProps {
  value: VendorNameValue;
  onChange: (next: VendorNameValue) => void;
  onBlur?: () => void;
  /** 必須か（案件の文脈の登録・編集。43.8） */
  required?: boolean;
  disabled?: boolean;
  /** 外から渡す誤り（サーバーの検証の誤りなど） */
  error?: string;
  /** ラベル（既定: 業者名） */
  label?: string;
  placeholder?: string;
}

const COLORS = {
  error: '#dc2626',
  border: '#d1d5db',
  focus: '#2563eb',
  label: '#374151',
  text: '#111827',
  subText: '#6b7280',
  disabledBg: '#f3f4f6',
  white: '#ffffff',
  selectedBg: '#e5e7eb',
} as const;

/**
 * 業者名の入力
 */
export function VendorNameInput({
  value,
  onChange,
  onBlur,
  required = false,
  disabled = false,
  error: externalError,
  label = '業者名',
  placeholder,
}: VendorNameInputProps) {
  const [suggestions, setSuggestions] = useState<TradingPartnerSearchResult[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [isFocused, setIsFocused] = useState(false);
  const [touched, setTouched] = useState(false);
  /** 利用者が文字を打ったか（フォーカスの出入りだけでは検索しない） */
  const [hasTyped, setHasTyped] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  /** 最後に出した検索の番号（遅れて届いた古い結果を捨てる） */
  const requestSeqRef = useRef(0);

  const uid = useId();
  const inputId = `vendor-name-input-${uid}`;
  const errorId = `vendor-name-error-${uid}`;
  const listboxId = `vendor-name-listbox-${uid}`;
  const optionId = (index: number) => `vendor-name-option-${uid}-${index}`;

  const debouncedName = useDebounce(value.vendorName, VENDOR_NAME_SEARCH_DEBOUNCE_MS);

  const internalError =
    touched && required && value.vendorName.trim() === '' ? VENDOR_NAME_REQUIRED_MESSAGE : '';
  const displayError = externalError || internalError;
  const hasError = displayError !== '';

  const closeSuggestions = useCallback(() => {
    setShowSuggestions(false);
    setSelectedIndex(-1);
  }, []);

  const fetchSuggestions = useCallback(async (query: string) => {
    const seq = ++requestSeqRef.current;
    try {
      const results = await searchTradingPartners(
        query,
        ['SUBCONTRACTOR'],
        VENDOR_NAME_MAX_SUGGESTIONS
      );
      if (seq !== requestSeqRef.current) return;
      setSuggestions(results);
      setShowSuggestions(true);
      setSelectedIndex(-1);
    } catch {
      // 権限の不足・通信の失敗では候補を出さない（自由な入力は続けられる）
      if (seq !== requestSeqRef.current) return;
      setSuggestions([]);
      setShowSuggestions(false);
    }
  }, []);

  // 入力を止めてから検索する。取引先を選んだ状態（ID あり）と、打っていないときは検索しない
  useEffect(() => {
    if (disabled || !isFocused || !hasTyped) return;
    if (value.tradingPartnerId !== null) return;
    if (debouncedName.trim() === '') return;
    void fetchSuggestions(debouncedName.trim());
  }, [debouncedName, disabled, isFocused, hasTyped, value.tradingPartnerId, fetchSuggestions]);

  // 部品の外を押したら候補を閉じる
  useEffect(() => {
    const handleMouseDown = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        closeSuggestions();
      }
    };
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [closeSuggestions]);

  const selectSuggestion = useCallback(
    (partner: TradingPartnerSearchResult) => {
      // 進行中の検索の結果で一覧を開き直さない
      requestSeqRef.current += 1;
      onChange({ vendorName: partner.name, tradingPartnerId: partner.id });
      setSuggestions([]);
      closeSuggestions();
    },
    [onChange, closeSuggestions]
  );

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const text = e.target.value;
    setHasTyped(true);
    // 文字を変えたら選んだ取引先との紐づけを外す（サーバーが名前で照合し直す。44.6・44.7）
    onChange({ vendorName: text, tradingPartnerId: null });
    if (text.trim() === '') {
      requestSeqRef.current += 1;
      setSuggestions([]);
      closeSuggestions();
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!showSuggestions) return;
    switch (e.key) {
      case 'ArrowDown':
        if (suggestions.length === 0) return;
        e.preventDefault();
        setSelectedIndex((prev) => Math.min(prev + 1, suggestions.length - 1));
        break;
      case 'ArrowUp':
        if (suggestions.length === 0) return;
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
        break;
      case 'Enter': {
        const picked = suggestions[selectedIndex];
        if (picked) {
          e.preventDefault();
          selectSuggestion(picked);
        }
        break;
      }
      case 'Escape':
        e.preventDefault();
        closeSuggestions();
        break;
    }
  };

  const handleBlur = () => {
    setIsFocused(false);
    setTouched(true);
    onBlur?.();
  };

  const isListOpen = showSuggestions && !disabled;
  const isLinked = value.tradingPartnerId !== null;

  return (
    <div ref={containerRef} style={{ marginBottom: '1rem', position: 'relative' }}>
      <label
        htmlFor={inputId}
        style={{
          display: 'block',
          marginBottom: '0.5rem',
          fontWeight: 500,
          color: hasError ? COLORS.error : COLORS.label,
        }}
      >
        {label}
        {required && (
          <span style={{ color: COLORS.error, marginLeft: '0.25rem' }} aria-hidden="true">
            *
          </span>
        )}
      </label>
      <input
        id={inputId}
        type="text"
        role="combobox"
        value={value.vendorName}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onFocus={() => {
          if (!disabled) setIsFocused(true);
        }}
        onBlur={handleBlur}
        placeholder={placeholder}
        disabled={disabled}
        maxLength={VENDOR_NAME_MAX_LENGTH}
        autoComplete="off"
        aria-required={required}
        aria-invalid={hasError}
        aria-describedby={hasError ? errorId : undefined}
        aria-autocomplete="list"
        aria-expanded={isListOpen}
        aria-controls={isListOpen ? listboxId : undefined}
        aria-activedescendant={
          isListOpen && selectedIndex >= 0 ? optionId(selectedIndex) : undefined
        }
        style={{
          width: '100%',
          padding: '0.5rem 0.75rem',
          border: hasError
            ? `2px solid ${COLORS.error}`
            : `1px solid ${isFocused ? COLORS.focus : COLORS.border}`,
          borderRadius: '0.375rem',
          fontSize: '1rem',
          lineHeight: '1.5',
          color: COLORS.text,
          backgroundColor: disabled ? COLORS.disabledBg : COLORS.white,
          boxSizing: 'border-box',
        }}
      />

      {isListOpen && (
        <ul
          id={listboxId}
          role="listbox"
          aria-label="協力業者の候補"
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
            backgroundColor: COLORS.white,
            border: `1px solid ${COLORS.border}`,
            borderRadius: '0.375rem',
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
            zIndex: 1000,
          }}
        >
          {suggestions.length === 0 ? (
            <li style={{ padding: '0.75rem 1rem', color: COLORS.subText, textAlign: 'center' }}>
              該当する協力業者がありません
            </li>
          ) : (
            suggestions.map((partner, index) => (
              <li
                key={partner.id}
                id={optionId(index)}
                role="option"
                aria-selected={index === selectedIndex}
                // 押下でフォーカスが移って blur が先に走らないようにする
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => selectSuggestion(partner)}
                onMouseEnter={() => setSelectedIndex(index)}
                style={{
                  padding: '0.75rem 1rem',
                  cursor: 'pointer',
                  backgroundColor: index === selectedIndex ? COLORS.selectedBg : COLORS.white,
                }}
              >
                <div style={{ fontWeight: 500, color: COLORS.text }}>{partner.name}</div>
                <div style={{ fontSize: '0.875rem', color: COLORS.subText }}>
                  {partner.nameKana}
                </div>
              </li>
            ))
          )}
        </ul>
      )}

      {isLinked && (
        <p
          data-testid="vendor-name-linked"
          style={{ marginTop: '0.25rem', fontSize: '0.875rem', color: COLORS.subText }}
        >
          登録済みの協力業者に紐づけています
        </p>
      )}

      {hasError && (
        <p
          id={errorId}
          role="alert"
          style={{ marginTop: '0.25rem', fontSize: '0.875rem', color: COLORS.error }}
        >
          {displayError}
        </p>
      )}
    </div>
  );
}

export default VendorNameInput;
