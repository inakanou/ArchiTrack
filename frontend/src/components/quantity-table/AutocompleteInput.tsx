/**
 * @fileoverview オートコンプリート入力コンポーネント
 *
 * Task 7.1: オートコンプリート入力コンポーネントを実装する
 * Task 17.1: クライアントサイド候補ストア方式に更新する
 * Task 18.1: 旧useAutocompleteフックを廃止し新モード専用に統合する
 * Task 25.2: フォーカス時にvalueの有無に関わらずドロップダウンを開くよう修正
 * Task 12.1: テキストフィールドの入力時点での最大文字数超過を防止する
 * Task 115.43: 補完候補の取得時点で上限を超える候補を濾す（選択経由の迂回を塞ぐ）
 *
 * Requirements:
 * - 13.1: 大項目・中項目・小項目・任意分類・名称・規格・備考の最大文字数超過入力を防止（全角25/半角50）
 * - 13.2: 工種の最大文字数超過入力を防止（全角8/半角16）
 * - 13.3: 単位の最大文字数超過入力を防止（全角3/半角6）
 * - 7.3: クライアントサイドでのフィルタリング表示（フォーカス時に全候補表示）
 * - 7.4: フォーカス中の入力に応じて前方一致する候補へリアルタイムに絞り込む
 * - 7.5: 候補選択時の自動入力（上下キー選択とEnter確定を含む）
 * - 7.6: blur時にクライアントサイドで候補追加
 * - 7.7: blur時の候補追加はAPIリクエスト不要
 *
 * 本コンポーネントの責務ではないもの（Task 97.11 / 98.5 で実体に揃えた）:
 * 初回表示での候補の一括取得と保持、および候補の並べ替えは候補ストア
 * （hooks/useAutocompleteCandidateStore.ts）が担う。本コンポーネントは
 * 受け取った getSuggestions の戻り値をそのまま描画するだけで、取得も並べ替えも行わない。
 */

import { useState, useRef, useCallback, useId, useEffect, useLayoutEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import type { AutocompleteFieldName } from '../../hooks/useAutocompleteCandidateStore';
import { calculateStringWidth, FIELD_CONSTRAINTS } from '../../utils/field-validation';
import FieldValidationTooltip from './FieldValidationTooltip';

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
  /** 可視ラベル非表示時に <input> へ付与するアクセシブルネーム（label 未指定時のみ有効） */
  ariaLabel?: string;
  /** 入力フィールドのID */
  id?: string;
  /** エラーメッセージ */
  error?: string;
  /** 必須フィールドかどうか */
  required?: boolean;
  /** 無効化フラグ */
  disabled?: boolean;
  /**
   * 入力を受け付ける最大文字幅（半角換算。全角は幅2、半角は幅1）。
   * 省略時は field に対応するフィールド仕様（FIELD_CONSTRAINTS）の上限を用いる。
   *
   * Requirements: 13.1, 13.2, 13.3（最大文字数を超える入力を防止する）
   */
  maxWidth?: number;
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
    // 入力欄右端の警告アイコンと入力文字が重ならないよう余白を確保
    paddingRight: '22px',
  } as React.CSSProperties,
  inputDisabled: {
    backgroundColor: '#f9fafb',
    color: '#9ca3af',
    cursor: 'not-allowed',
  } as React.CSSProperties,
  dropdown: {
    // Portal で document.body 直下に描画するため fixed 配置とする。
    // 旧来は absolute だったが、数量項目テーブルの水平スクロールラッパー
    // (itemTableWrapper の overflow) にクリップされ候補が表示されなかった（REQ-41 回帰）。
    // 入力欄の getBoundingClientRect から top/left/width を動的に与える。
    position: 'fixed' as const,
    maxHeight: '200px',
    overflowY: 'auto' as const,
    overflowX: 'hidden' as const,
    backgroundColor: '#ffffff',
    border: '1px solid #e5e7eb',
    borderRadius: '0px',
    boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
    // body 直下に出すため、モーダル等より前面に来るよう十分高い z-index を設定。
    zIndex: 1000,
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
    ariaLabel,
    id: propId,
    error,
    required = false,
    disabled = false,
    maxWidth: maxWidthProp,
  } = props;

  const generatedId = useId();
  const inputId = propId || generatedId;
  const listboxId = `${inputId}-listbox`;

  const [isOpen, setIsOpen] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [hoveredIndex, setHoveredIndex] = useState(-1);
  // Portal 描画するドロップダウンの fixed 配置座標（入力欄の位置から算出）
  const [dropdownRect, setDropdownRect] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const listboxRef = useRef<HTMLUListElement>(null);
  /**
   * 日本語入力（IME）の変換中かどうか
   *
   * この記録の寿命は「一回の焦点セッション」とする（Task 115.42）。焦点を得た時点で
   * 初期化し、変換の確定（compositionend）で終了する。確定の通知でしか消さないと、
   * 確定が届かないまま焦点が外れた場合に記録が残り、以後その入力欄では変換と無関係の
   * 直接入力でも幅の判定が迂回され続けるため、焦点獲得側の初期化が要となる（Task 115.44）。
   */
  const isComposingRef = useRef(false);
  /**
   * 幅の判定を通った直前の値（判定を経ていない値が残りそうな場合の戻り先）
   *
   * 焦点を得た時点と変換を開始した時点で更新する。
   */
  const preCompositionValueRef = useRef('');

  /**
   * このフィールドの最大文字幅（半角換算）。
   * 明示指定がない場合はフィールド仕様（FIELD_CONSTRAINTS）から決まる。
   *
   * Requirements:
   * - 13.1: 大項目・中項目・小項目・任意分類・名称・規格・備考（全角25文字/半角50文字）
   * - 13.2: 工種（全角8文字/半角16文字）
   * - 13.3: 単位（全角3文字/半角6文字）
   */
  const maxWidth = maxWidthProp ?? FIELD_CONSTRAINTS[field].hankaku;

  /**
   * getSuggestions で候補を取得し、取得の時点で上限を超えるものを濾す（Task 115.43）
   *
   * 初回一括取得の候補（REQ-7.1）は、幅の検証を持たない経路で作られた既存データを含みうる。
   * 濾さずに表示すると、選択（クリック／上下キー＋Enter）でそのまま入力欄の状態へ載り、
   * 入力時点の防止（REQ-13.1/13.2/13.3）が候補経由で迂回される。
   *
   * 選択の処理（selectSuggestion）ではなく取得の時点で濾すのは次の理由による。
   * - 選択の経路はクリックと Enter の二つがあり、いずれも suggestions を参照する。
   *   取得の一点で濾せば経路の増減に関わらず防護が保たれる
   * - 上限超過の候補は選んでも入力できない。表示してから拒否するより、はじめから
   *   提示しない方が利用者から見て一貫する（REQ-7.5 の自動入力は常に成立する）
   * - 上限（maxWidth）は maxWidth prop とフィールド仕様から本コンポーネントが決めるため、
   *   候補ストア（useAutocompleteCandidateStore）側では権威ある判定ができない
   */
  const suggestions = useMemo(() => {
    return getSuggestions(field, value).filter(
      (candidate) => calculateStringWidth(candidate) <= maxWidth
    );
  }, [field, value, getSuggestions, maxWidth]);

  // 候補があり、フォーカス中の場合にドロップダウンを開く
  const shouldShowDropdown = isOpen && suggestions.length > 0;

  /**
   * 入力欄の現在位置から Portal ドロップダウンの fixed 座標を再計算する。
   * 入力欄直下（2px ギャップ）に左端・幅を揃えて配置する。
   */
  const updateDropdownRect = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setDropdownRect({ top: rect.bottom + 2, left: rect.left, width: rect.width });
  }, []);

  /**
   * ドロップダウン表示中は、祖先要素のスクロール（水平スクロールラッパー含む）や
   * ウィンドウリサイズに追従して配置を更新する。capture: true で祖先のスクロールも捕捉。
   */
  useLayoutEffect(() => {
    if (!shouldShowDropdown) {
      setDropdownRect(null);
      return;
    }
    updateDropdownRect();
    const handleReposition = () => updateDropdownRect();
    window.addEventListener('scroll', handleReposition, true);
    window.addEventListener('resize', handleReposition);
    return () => {
      window.removeEventListener('scroll', handleReposition, true);
      window.removeEventListener('resize', handleReposition);
    };
  }, [shouldShowDropdown, updateDropdownRect]);

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
   * 入力を受け付けてよいかを判定する。
   *
   * 上限以内なら受け付ける。上限を超える場合は原則拒否するが、
   * 現在値が既に上限を超えている（幅の検証を持たない数量項目作成APIで作られた既存データ等）
   * ときに編集不能とならないよう、値が短くなる編集だけは受け付ける。
   */
  const acceptsWidth = useCallback(
    (nextValue: string, baseValue: string) => {
      const nextWidth = calculateStringWidth(nextValue);
      return nextWidth <= maxWidth || nextWidth < calculateStringWidth(baseValue);
    },
    [maxWidth]
  );

  /**
   * 入力値変更ハンドラ
   *
   * REQ-13.1/13.2/13.3: 最大文字数（全角N文字/半角2N文字）を超える入力を防止する。
   * 保存時の拒否ではなく入力時点で受け付けない方式であり、REQ-22.5（数量グループ名）と
   * 同じく「上限以内のときだけ状態を更新する」ことで実現する。
   *
   * 日本語入力（IME）の変換中は判定を行わずそのまま通す。変換中の読み（例：単位欄の
   * 「りゅうべい」）は上限を超えることがあり、この段階で拒否すると変換が中断されて
   * 「立米」のような上限以内の正当な値を確定できなくなるため。判定は確定時に行う。
   */
  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = e.target.value;

      // 変換中は幅を判定しない（compositionend で確定値を判定する）
      const nativeIsComposing = (e.nativeEvent as InputEvent).isComposing === true;
      if (isComposingRef.current || nativeIsComposing) {
        onChange(newValue);
        setIsOpen(true);
        setSelectedIndex(-1);
        return;
      }

      // 上限を超える入力は親へ通知しない（＝状態が変化しないので controlled input の
      // 表示も直前の値のまま戻る）。DOM を直接書き換えないためカーソル位置も保たれる。
      if (!acceptsWidth(newValue, value)) {
        return;
      }

      onChange(newValue);
      setIsOpen(true);
      setSelectedIndex(-1);
    },
    [onChange, value, acceptsWidth]
  );

  /**
   * 変換開始ハンドラ。戻り先となる直前の確定値を控える。
   */
  const handleCompositionStart = useCallback(() => {
    isComposingRef.current = true;
    preCompositionValueRef.current = value;
  }, [value]);

  /**
   * 変換確定ハンドラ
   *
   * REQ-13.1/13.2/13.3: 変換で確定した値の幅を評価し、上限を超える場合のみ
   * 変換開始直前の確定値へ戻す。
   */
  const handleCompositionEnd = useCallback(
    (e: React.CompositionEvent<HTMLInputElement>) => {
      isComposingRef.current = false;
      const committed = e.currentTarget.value;
      const base = preCompositionValueRef.current;
      onChange(acceptsWidth(committed, base) ? committed : base);
    },
    [onChange, acceptsWidth]
  );

  /**
   * フォーカス時ハンドラ
   * Task 19.1: フォーカス時に既存の入力値を全選択する
   * Task 25.2: フォーカス時にvalueの有無に関わらずドロップダウンを開く
   */
  const handleFocus = useCallback(() => {
    setIsFocused(true);
    // 変換中の記録は焦点セッションごとに初期化する（Task 115.42）。
    // 前の焦点セッションで確定の通知が届かないまま終わっていた場合に、記録が
    // 持ち越されて幅の判定が迂回され続けることを防ぐ。
    isComposingRef.current = false;
    preCompositionValueRef.current = value;
    // フォーカス時に既存の入力値を全選択（上書き入力の効率化）
    inputRef.current?.select();
    if (suggestions.length > 0) {
      setIsOpen(true);
    }
  }, [suggestions.length, value]);

  /**
   * ブラー時ハンドラ
   *
   * 焦点喪失の時点では value が幅の判定を経ていない場合があるため、変換の確定と同じ
   * 判定を改めて適用し、判定を通った値だけを状態と候補の登録へ渡す。
   * - 変換中に焦点を失った場合。変換中は幅の判定を行わないため上限超過の読みが残る
   * - 変換の確定（compositionend）と焦点喪失が同一の実行単位に入った場合。戻し処理は
   *   状態の更新であり、同じ実行単位から見える値は反映前（＝上限超過）のままになる
   *
   * 変換中の記録はここでは終了させない（Task 115.44）。記録が意味を持つのは入力が
   * 起こるとき＝焦点がある間だけで、次に入力が起こる前には必ず焦点獲得（handleFocus）を
   * 経るため、初期化は焦点獲得側だけで漏れなく行える。候補一覧へ焦点が移る場合は
   * 冒頭で早期に戻るため、そもそもここでは終了させられない。
   *
   * blur時にonBlurAddCandidateを呼び出して確定値を候補に追加する（REQ-7.6）。
   * 上限を超える値は候補一覧へ入れない。候補は以後の入力の元になるため、
   * 入力時点の防止（REQ-13.1/13.2/13.3）を迂回する経路になってはならない。
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

      const base = preCompositionValueRef.current;
      const committed = acceptsWidth(value, base) ? value : base;
      preCompositionValueRef.current = committed;
      if (committed !== value) {
        onChange(committed);
      }

      // blur時に確定値を候補リストに追加（APIリクエストなし）
      if (!disabled && committed.trim() && calculateStringWidth(committed) <= maxWidth) {
        onBlurAddCandidate(field, committed);
      }
    },
    [disabled, value, field, onBlurAddCandidate, acceptsWidth, onChange, maxWidth]
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
          aria-label={!label && ariaLabel ? ariaLabel : undefined}
          value={value}
          placeholder={placeholder}
          disabled={disabled}
          style={inputStyles}
          onChange={handleInputChange}
          onCompositionStart={handleCompositionStart}
          onCompositionEnd={handleCompositionEnd}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
        />
        {/* バリデーションエラー（赤枠＋アイコン＋ホバー吹き出し）。
            通常フローにメッセージを挿入しないためフィールド間スペースが崩れない。 */}
        {error && (
          <FieldValidationTooltip message={error} id={`${inputId}-error`} severity="error" />
        )}
      </div>

      {/* ドロップダウン候補リスト。
          水平スクロールラッパー（itemTableWrapper の overflow）にクリップされないよう、
          Portal で document.body 直下に fixed 配置で描画する（REQ-41 回帰対応）。 */}
      {shouldShowDropdown &&
        dropdownRect &&
        createPortal(
          <ul
            ref={listboxRef}
            id={listboxId}
            role="listbox"
            aria-label={`${label || ariaLabel || ''}の候補`}
            style={{
              ...styles.dropdown,
              top: dropdownRect.top,
              left: dropdownRect.left,
              width: dropdownRect.width,
            }}
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
                  // Portal 先でのクリックでも入力欄の blur が先に閉じないよう、
                  // mousedown の既定動作（フォーカス移動）を抑止する。
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => handleOptionClick(suggestion)}
                  onMouseEnter={() => setHoveredIndex(index)}
                  onMouseLeave={() => setHoveredIndex(-1)}
                >
                  {suggestion}
                </li>
              );
            })}
          </ul>,
          document.body
        )}
    </div>
  );
}
