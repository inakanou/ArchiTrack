/**
 * @fileoverview 取引先選択コンポーネント（ドロップダウン+オートコンプリート）
 *
 * プロジェクトフォームで使用する取引先選択用のコンポーネントを提供します。
 * ドロップダウンとオートコンプリート機能を併用したUIで、
 * 顧客種別（CUSTOMER）を含む取引先のみを選択肢として表示します。
 *
 * Requirements:
 * - 16.1: ドロップダウン選択UIとオートコンプリート機能を併用したUIを提供
 * - 16.2: 入力文字列に部分一致する取引先候補をフィルタリング表示
 * - 16.3: 取引先候補の表示形式を「名前 / 部課・支店・支社名 / 代表者名」の組み合わせとする
 * - 16.10: 取引先マスタに登録されていない顧客の自由入力を許可しない
 * - 16.12: 取引先種別に「顧客」（CUSTOMER）を含む取引先のみを候補として表示
 * - 20.1: すべての操作をキーボードのみで実行可能
 * - 20.2: フォーム要素にaria-label属性を適切に設定
 * - 20.4: フォーカス状態を視覚的に明確に表示
 * - 22.5-7: 表示形式のフォールバック処理
 */

import { useState, useEffect, useId, useRef, useCallback, KeyboardEvent, FocusEvent } from 'react';
import { getTradingPartners } from '../../api/trading-partners';
import type { TradingPartnerInfo } from '../../types/trading-partner.types';

// ============================================================================
// 型定義
// ============================================================================

/**
 * TradingPartnerSelectコンポーネントのプロパティ
 */
export interface TradingPartnerSelectProps {
  /** 選択中の取引先ID */
  value: string;
  /** 値変更時のコールバック */
  onChange: (value: string) => void;
  /** blurイベントハンドラ */
  onBlur?: () => void;
  /** 無効状態 */
  disabled?: boolean;
  /** エラーメッセージ */
  error?: string;
}

// ============================================================================
// スタイル定数
// ============================================================================

const STYLES = {
  colors: {
    error: '#dc2626',
    errorLight: 'rgba(220, 38, 38, 0.1)',
    focus: '#2563eb',
    focusLight: 'rgba(37, 99, 235, 0.1)',
    border: '#d1d5db',
    label: '#374151',
    text: '#111827',
    textSecondary: '#6b7280',
    disabled: '#9ca3af',
    disabledBg: '#f3f4f6',
    white: '#ffffff',
    hoverBg: '#f3f4f6',
    selectedBg: '#e5edff',
  },
  borderRadius: '0.375rem',
  transition: 'border-color 0.15s ease-in-out, box-shadow 0.15s ease-in-out',
} as const;

// ============================================================================
// ヘルパー関数
// ============================================================================

/**
 * 取引先の表示名を生成
 * 「名前 / 部課・支店・支社名 / 代表者名」の組み合わせ
 *
 * Requirements: 16.3, 22.5-7
 */
function formatTradingPartnerDisplay(partner: TradingPartnerInfo): string {
  const parts: string[] = [partner.name];

  if (partner.branchName) {
    parts.push(partner.branchName);
  }

  if (partner.representativeName) {
    parts.push(partner.representativeName);
  }

  return parts.join(' / ');
}

/**
 * 検索クエリに一致するかどうか判定
 * 名前、フリガナ、部課名、代表者名で部分一致
 */
function matchesSearchQuery(partner: TradingPartnerInfo, query: string): boolean {
  const lowerQuery = query.toLowerCase();
  return (
    partner.name.toLowerCase().includes(lowerQuery) ||
    partner.nameKana.toLowerCase().includes(lowerQuery) ||
    (partner.branchName?.toLowerCase().includes(lowerQuery) ?? false) ||
    (partner.branchNameKana?.toLowerCase().includes(lowerQuery) ?? false) ||
    (partner.representativeName?.toLowerCase().includes(lowerQuery) ?? false) ||
    (partner.representativeNameKana?.toLowerCase().includes(lowerQuery) ?? false)
  );
}

// ============================================================================
// コンポーネント
// ============================================================================

/**
 * 取引先選択コンポーネント（ドロップダウン+オートコンプリート）
 *
 * 顧客種別を持つ取引先をドロップダウン+オートコンプリートで選択できます。
 * 表示形式は「名前 / 部課・支店・支社名 / 代表者名」の組み合わせです。
 *
 * @example
 * ```tsx
 * <TradingPartnerSelect
 *   value={tradingPartnerId}
 *   onChange={setTradingPartnerId}
 *   onBlur={() => validateTradingPartnerId()}
 *   disabled={isSubmitting}
 *   error={errors.tradingPartnerId}
 * />
 * ```
 */
export default function TradingPartnerSelect({
  value,
  onChange,
  onBlur,
  disabled = false,
  error,
}: TradingPartnerSelectProps) {
  // 取引先一覧
  const [tradingPartners, setTradingPartners] = useState<TradingPartnerInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // 検索・UI状態
  const [searchQuery, setSearchQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  // Refs
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // 一意のID生成
  const uniqueId = useId();
  const inputId = `trading-partner-input-${uniqueId}`;
  const listboxId = `trading-partner-listbox-${uniqueId}`;
  const errorId = `trading-partner-error-${uniqueId}`;

  // フィルタリングされた取引先一覧
  const filteredPartners = searchQuery
    ? tradingPartners.filter((p) => matchesSearchQuery(p, searchQuery))
    : tradingPartners;

  // 選択中の取引先を取得
  const selectedPartner = tradingPartners.find((p) => p.id === value);

  // 取引先一覧を取得
  useEffect(() => {
    let mounted = true;

    const fetchTradingPartners = async () => {
      try {
        setIsLoading(true);
        setFetchError(null);

        // 顧客種別を含む取引先を取得（最大100件）
        const result = await getTradingPartners({
          limit: 100,
          filter: { type: ['CUSTOMER'] },
          sort: 'nameKana',
          order: 'asc',
        });

        if (mounted) {
          setTradingPartners(result.data);
        }
      } catch {
        if (mounted) {
          setFetchError('取引先一覧の取得に失敗しました');
        }
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    };

    fetchTradingPartners();

    return () => {
      mounted = false;
    };
  }, []);

  // クリックアウトサイドで閉じる
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSearchQuery('');
        setHighlightedIndex(-1);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // ハイライトされたアイテムをスクロール表示
  useEffect(() => {
    if (highlightedIndex >= 0 && listRef.current) {
      const highlightedElement = listRef.current.children[highlightedIndex] as HTMLElement;
      if (highlightedElement) {
        highlightedElement.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [highlightedIndex]);

  /**
   * 取引先を選択
   */
  const selectPartner = useCallback(
    (partner: TradingPartnerInfo | null) => {
      onChange(partner?.id ?? '');
      setSearchQuery('');
      setIsOpen(false);
      setHighlightedIndex(-1);
    },
    [onChange]
  );

  /**
   * キーボードイベントハンドラ
   */
  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          if (!isOpen) {
            setIsOpen(true);
            setHighlightedIndex(0);
          } else {
            setHighlightedIndex((prev) => (prev < filteredPartners.length - 1 ? prev + 1 : prev));
          }
          break;

        case 'ArrowUp':
          e.preventDefault();
          if (isOpen) {
            setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : prev));
          }
          break;

        case 'Enter':
          e.preventDefault();
          if (isOpen && highlightedIndex >= 0 && filteredPartners[highlightedIndex]) {
            selectPartner(filteredPartners[highlightedIndex]);
          }
          break;

        case 'Escape':
          e.preventDefault();
          setIsOpen(false);
          setSearchQuery('');
          setHighlightedIndex(-1);
          break;

        case 'Tab':
          setIsOpen(false);
          setSearchQuery('');
          setHighlightedIndex(-1);
          break;
      }
    },
    [isOpen, highlightedIndex, filteredPartners, selectPartner]
  );

  /**
   * 入力変更ハンドラ
   */
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
    setIsOpen(true);
    setHighlightedIndex(e.target.value ? 0 : -1);
  };

  /**
   * フォーカスハンドラ
   */
  const handleFocus = () => {
    setIsFocused(true);
    setIsOpen(true);
  };

  /**
   * blurイベントハンドラ
   */
  const handleBlur = (e: FocusEvent<HTMLInputElement>) => {
    // リストボックス内のクリックの場合はblurを無視
    if (containerRef.current?.contains(e.relatedTarget as Node)) {
      return;
    }
    setIsFocused(false);
    onBlur?.();
  };

  /**
   * 選択クリアハンドラ
   */
  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    selectPartner(null);
    inputRef.current?.focus();
  };

  /**
   * 境界線の色を計算
   */
  const getBorderColor = (): string => {
    if (error) return STYLES.colors.error;
    if (isFocused) return STYLES.colors.focus;
    return STYLES.colors.border;
  };

  /**
   * ボックスシャドウを計算
   */
  const getBoxShadow = (): string => {
    if (!isFocused) return 'none';
    if (error) return `0 0 0 3px ${STYLES.colors.errorLight}`;
    return `0 0 0 3px ${STYLES.colors.focusLight}`;
  };

  // 表示用の値（選択中は取引先名、未選択時は検索クエリ）
  const displayValue = isOpen
    ? searchQuery
    : selectedPartner
      ? formatTradingPartnerDisplay(selectedPartner)
      : '';

  return (
    <div style={{ marginBottom: '1rem' }} ref={containerRef}>
      <label
        htmlFor={inputId}
        style={{
          display: 'block',
          marginBottom: '0.5rem',
          fontWeight: 500,
          color: error ? STYLES.colors.error : STYLES.colors.label,
        }}
      >
        取引先
      </label>

      {/* 入力フィールドコンテナ */}
      <div style={{ position: 'relative' }}>
        <input
          ref={inputRef}
          id={inputId}
          type="text"
          value={displayValue}
          onChange={handleInputChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          disabled={disabled || isLoading}
          placeholder={
            isLoading ? '読み込み中...' : fetchError ? fetchError : '取引先を検索または選択（任意）'
          }
          role="combobox"
          aria-label="取引先"
          aria-expanded={isOpen}
          aria-haspopup="listbox"
          aria-controls={listboxId}
          aria-activedescendant={
            highlightedIndex >= 0 ? `${listboxId}-option-${highlightedIndex}` : undefined
          }
          aria-invalid={!!error}
          aria-describedby={error ? errorId : undefined}
          autoComplete="off"
          style={{
            width: '100%',
            padding: '0.5rem 2.5rem 0.5rem 0.75rem',
            border: error ? `2px solid ${STYLES.colors.error}` : `1px solid ${getBorderColor()}`,
            borderRadius: STYLES.borderRadius,
            fontSize: '1rem',
            lineHeight: '1.5',
            color: disabled || isLoading ? STYLES.colors.disabled : STYLES.colors.text,
            backgroundColor: disabled || isLoading ? STYLES.colors.disabledBg : STYLES.colors.white,
            outline: 'none',
            cursor: disabled || isLoading ? 'not-allowed' : 'text',
            transition: STYLES.transition,
            boxShadow: getBoxShadow(),
          }}
        />

        {/* クリア & ドロップダウンボタン */}
        <div
          style={{
            position: 'absolute',
            right: '0.5rem',
            top: '50%',
            transform: 'translateY(-50%)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.25rem',
          }}
        >
          {value && !disabled && !isLoading && (
            <button
              type="button"
              onClick={handleClear}
              aria-label="選択をクリア"
              style={{
                padding: '0.25rem',
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                color: STYLES.colors.textSecondary,
                fontSize: '1rem',
                lineHeight: 1,
              }}
            >
              ✕
            </button>
          )}
          <span
            style={{
              color: STYLES.colors.textSecondary,
              fontSize: '0.75rem',
              pointerEvents: 'none',
            }}
          >
            ▼
          </span>
        </div>
      </div>

      {/* ドロップダウンリスト */}
      {isOpen && !disabled && !isLoading && (
        <ul
          ref={listRef}
          id={listboxId}
          role="listbox"
          aria-label="取引先候補"
          style={{
            position: 'absolute',
            zIndex: 1000,
            width: containerRef.current?.offsetWidth ?? '100%',
            maxHeight: '240px',
            overflowY: 'auto',
            margin: '0.25rem 0 0 0',
            padding: 0,
            listStyle: 'none',
            backgroundColor: STYLES.colors.white,
            border: `1px solid ${STYLES.colors.border}`,
            borderRadius: STYLES.borderRadius,
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
          }}
        >
          {/* 未選択オプション */}
          <li
            id={`${listboxId}-option-empty`}
            role="option"
            aria-selected={value === ''}
            onClick={() => selectPartner(null)}
            onMouseEnter={() => setHighlightedIndex(-1)}
            style={{
              padding: '0.5rem 0.75rem',
              cursor: 'pointer',
              backgroundColor: value === '' ? STYLES.colors.selectedBg : 'transparent',
              color: STYLES.colors.textSecondary,
              fontStyle: 'italic',
            }}
          >
            -- 選択なし --
          </li>

          {filteredPartners.length === 0 ? (
            <li
              style={{
                padding: '0.75rem',
                textAlign: 'center',
                color: STYLES.colors.textSecondary,
              }}
            >
              該当する取引先がありません
            </li>
          ) : (
            filteredPartners.map((partner, index) => (
              <li
                key={partner.id}
                id={`${listboxId}-option-${index}`}
                role="option"
                aria-selected={partner.id === value}
                onClick={() => selectPartner(partner)}
                onMouseEnter={() => setHighlightedIndex(index)}
                style={{
                  padding: '0.5rem 0.75rem',
                  cursor: 'pointer',
                  backgroundColor:
                    partner.id === value
                      ? STYLES.colors.selectedBg
                      : highlightedIndex === index
                        ? STYLES.colors.hoverBg
                        : 'transparent',
                  borderBottom:
                    index < filteredPartners.length - 1
                      ? `1px solid ${STYLES.colors.border}`
                      : 'none',
                }}
              >
                <div style={{ fontWeight: 500, color: STYLES.colors.text }}>{partner.name}</div>
                {(partner.branchName || partner.representativeName) && (
                  <div
                    style={{
                      fontSize: '0.875rem',
                      color: STYLES.colors.textSecondary,
                      marginTop: '0.125rem',
                    }}
                  >
                    {[partner.branchName, partner.representativeName].filter(Boolean).join(' / ')}
                  </div>
                )}
              </li>
            ))
          )}
        </ul>
      )}

      {/* エラーメッセージ */}
      {error && (
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
