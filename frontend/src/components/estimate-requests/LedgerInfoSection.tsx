/**
 * @fileoverview 受領見積書の台帳の情報の欄
 *
 * 見積番号・見積全体の条件・案件の条件・採否・確定金額・読取の確認・見積の区別を一つの欄にまとめ、
 * 既定で折りたたむ。開閉は OCR の欄（ReceivedQuotationForm の Requirement 40）と同じく、見出しの
 * `<button>` の `aria-expanded`・`aria-controls` と中身の `hidden` で行う。
 *
 * 値は親が持つ（制御された部品）。数の欄は入力の途中の文字を保つため文字で持ち、
 * `toLedgerInfoInput` で保存の入力へ直す。検証の文言はサーバーの検証と同じ文言にそろえる。
 *
 * 根拠: 46.1, 46.2, 46.3, 46.6, 46.7, 46.9, 48.2（estimate-request のタスク117.3。design の同章の LedgerInfoSection）
 */

import { useCallback, useId, useState, type ChangeEvent, type CSSProperties } from 'react';
import type {
  ConstructionKind,
  QuotationAdoption,
  ReadingStatus,
} from '../../api/received-quotations';
import { formatDateTime } from '../../utils/formatters';
import {
  LEDGER_INFO_MAX_LENGTHS,
  validateLedgerInfo,
  type LedgerInfoErrors,
  type LedgerInfoFormData,
} from './ledger-info-form';

// ============================================================================
// 定数
// ============================================================================

/** 欄の見出し（46.9） */
export const LEDGER_INFO_SECTION_TITLE = '台帳の情報';

/** 改修／新営の選択肢（46.2。空は未設定） */
const CONSTRUCTION_KIND_OPTIONS: ReadonlyArray<{ value: ConstructionKind | ''; label: string }> = [
  { value: '', label: '未設定' },
  { value: 'RENOVATION', label: '改修' },
  { value: 'NEW_CONSTRUCTION', label: '新営' },
];

/** 採否の選択肢（46.3） */
const ADOPTION_OPTIONS: ReadonlyArray<{ value: QuotationAdoption; label: string }> = [
  { value: 'ADOPTED', label: '採用' },
  { value: 'REJECTED', label: '不採用' },
  { value: 'UNKNOWN', label: '不明' },
];

/** 読取の確認の選択肢（46.6） */
const READING_STATUS_OPTIONS: ReadonlyArray<{ value: ReadingStatus; label: string }> = [
  { value: 'UNCONFIRMED', label: '未確認' },
  { value: 'CONFIRMED', label: '確認済み' },
];

export interface LedgerInfoSectionProps {
  /** 欄の値 */
  value: LedgerInfoFormData;
  /** 値が変わったときに、変えた後の値全体を渡す */
  onChange: (next: LedgerInfoFormData) => void;
  /**
   * 保存済みの確認の日時（受領見積書の `readingConfirmedAt`）。
   * 保存済みの読取の確認が確認済みのときに渡す
   */
  readingConfirmedAt?: Date | null;
  /**
   * 確認者の表示名。受領見積書の応答は確認者の ID（`readingConfirmedById`）だけを持つため、
   * 名前が分かる呼び出し元（例: 確認者がログイン中の利用者のとき）が渡す。無ければ「—」と表示する
   */
  readingConfirmedByName?: string | null;
  /** 外から渡す誤り（サーバーの検証の誤りなど）。部品の検証の誤りより優先する */
  errors?: LedgerInfoErrors;
  /** 欄を操作できなくする（開閉は操作できる） */
  disabled?: boolean;
}

// ============================================================================
// 表示
// ============================================================================

const styles = {
  section: { marginTop: '16px' } as CSSProperties,
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 12px',
    width: '100%',
    background: 'transparent',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: 600,
    color: '#374151',
    textAlign: 'left',
  } as CSSProperties,
  headerFocus: {
    outline: '2px solid #2563eb',
    outlineOffset: '2px',
    boxShadow: '0 0 0 4px rgba(37, 99, 235, 0.2)',
  } as CSSProperties,
  body: { padding: '8px 12px' } as CSSProperties,
  fieldset: {
    border: '1px solid #e5e7eb',
    borderRadius: '6px',
    padding: '12px',
    margin: '0 0 12px 0',
  } as CSSProperties,
  legend: {
    fontSize: '13px',
    fontWeight: 600,
    color: '#374151',
    padding: '0 4px',
  } as CSSProperties,
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
    gap: '12px',
  } as CSSProperties,
  field: { display: 'flex', flexDirection: 'column', gap: '4px' } as CSSProperties,
  fullWidth: { gridColumn: '1 / -1' } as CSSProperties,
  label: { fontSize: '13px', fontWeight: 500, color: '#374151' } as CSSProperties,
  input: {
    padding: '6px 8px',
    border: '1px solid #d1d5db',
    borderRadius: '4px',
    fontSize: '14px',
    width: '100%',
    boxSizing: 'border-box',
  } as CSSProperties,
  inputError: { border: '2px solid #dc2626' } as CSSProperties,
  textarea: { minHeight: '72px', resize: 'vertical' } as CSSProperties,
  error: { fontSize: '12px', color: '#dc2626', margin: 0 } as CSSProperties,
  confirmation: { fontSize: '13px', color: '#4b5563', margin: '4px 0 0 0' } as CSSProperties,
} as const;

/** 開閉の状態を示す印（支援技術には `aria-expanded` で伝えるため読み上げない） */
function ChevronIcon({ isExpanded }: { isExpanded: boolean }) {
  return (
    <span
      style={{
        display: 'inline-block',
        width: '12px',
        height: '12px',
        transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
        transition: 'transform 150ms ease',
        userSelect: 'none',
      }}
      aria-hidden="true"
    >
      ▶
    </span>
  );
}

type TextFieldKey =
  | 'quoteNumber'
  | 'overallConditions'
  | 'siteLocation'
  | 'useType'
  | 'workConditions'
  | 'quoteDiscriminator'
  | 'constructionPrice'
  | 'distanceKm'
  | 'confirmedAmount';

/**
 * 受領見積書の台帳の情報の欄（既定で折りたたむ）
 */
export function LedgerInfoSection({
  value,
  onChange,
  readingConfirmedAt = null,
  readingConfirmedByName = null,
  errors: externalErrors,
  disabled = false,
}: LedgerInfoSectionProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isHeaderFocused, setIsHeaderFocused] = useState(false);
  const uid = useId();
  const bodyId = `ledger-info-section-body-${uid}`;
  const fieldId = (key: keyof LedgerInfoFormData) => `ledger-info-${key}-${uid}`;

  const internalErrors = validateLedgerInfo(value);
  const errorFor = (key: keyof LedgerInfoFormData): string | undefined =>
    externalErrors?.[key] ?? internalErrors[key];

  const update = useCallback(
    <K extends keyof LedgerInfoFormData>(key: K, next: LedgerInfoFormData[K]) => {
      onChange({ ...value, [key]: next });
    },
    [onChange, value]
  );

  const renderTextField = (
    key: TextFieldKey,
    label: string,
    options: { maxLength?: number; multiline?: boolean; inputMode?: 'numeric' | 'decimal' } = {}
  ) => {
    const id = fieldId(key);
    const error = errorFor(key);
    const errorId = `${id}-error`;
    const common = {
      id,
      value: value[key],
      disabled,
      maxLength: options.maxLength,
      'aria-invalid': error ? true : false,
      'aria-describedby': error ? errorId : undefined,
      onChange: (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
        update(key, e.target.value),
      style: {
        ...styles.input,
        ...(options.multiline ? styles.textarea : {}),
        ...(error ? styles.inputError : {}),
      },
    };
    return (
      <div style={{ ...styles.field, ...(options.multiline ? styles.fullWidth : {}) }}>
        <label htmlFor={id} style={styles.label}>
          {label}
        </label>
        {options.multiline ? (
          <textarea {...common} />
        ) : (
          <input type="text" inputMode={options.inputMode} {...common} />
        )}
        {error && (
          <p id={errorId} style={styles.error}>
            {error}
          </p>
        )}
      </div>
    );
  };

  const renderSelect = <K extends 'constructionKind' | 'adoption' | 'readingStatus'>(
    key: K,
    label: string,
    options: ReadonlyArray<{ value: LedgerInfoFormData[K]; label: string }>
  ) => {
    const id = fieldId(key);
    return (
      <div style={styles.field}>
        <label htmlFor={id} style={styles.label}>
          {label}
        </label>
        <select
          id={id}
          value={value[key]}
          disabled={disabled}
          onChange={(e) => update(key, e.target.value as LedgerInfoFormData[K])}
          style={styles.input}
        >
          {options.map((option) => (
            <option key={option.value || 'none'} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
    );
  };

  const renderReadingConfirmation = () => {
    if (value.readingStatus !== 'CONFIRMED') return null;
    return (
      <p data-testid="ledger-reading-confirmation" style={styles.confirmation}>
        {readingConfirmedAt
          ? `確認者: ${readingConfirmedByName || '—'}　確認日時: ${formatDateTime(
              readingConfirmedAt.toISOString()
            )}`
          : '保存すると確認者と日時を記録します'}
      </p>
    );
  };

  const max = LEDGER_INFO_MAX_LENGTHS;

  return (
    <div style={styles.section}>
      <button
        type="button"
        onClick={() => setIsExpanded((prev) => !prev)}
        onFocus={() => setIsHeaderFocused(true)}
        onBlur={() => setIsHeaderFocused(false)}
        aria-expanded={isExpanded}
        aria-controls={bodyId}
        style={{ ...styles.header, ...(isHeaderFocused ? styles.headerFocus : {}) }}
        data-testid="ledger-info-section-header"
      >
        <ChevronIcon isExpanded={isExpanded} />
        <span>{LEDGER_INFO_SECTION_TITLE}</span>
      </button>
      <div id={bodyId} hidden={!isExpanded} style={styles.body}>
        <fieldset style={styles.fieldset}>
          <legend style={styles.legend}>見積の情報</legend>
          <div style={styles.grid}>
            {renderTextField('quoteNumber', '見積番号', { maxLength: max.quoteNumber })}
            {renderTextField('quoteDiscriminator', '見積の区別', {
              maxLength: max.quoteDiscriminator,
            })}
            {renderTextField('overallConditions', '見積全体の条件', {
              maxLength: max.overallConditions,
              multiline: true,
            })}
          </div>
        </fieldset>

        <fieldset style={styles.fieldset}>
          <legend style={styles.legend}>案件の条件</legend>
          <div style={styles.grid}>
            {renderTextField('siteLocation', '場所', { maxLength: max.siteLocation })}
            {renderSelect('constructionKind', '改修／新営', CONSTRUCTION_KIND_OPTIONS)}
            {renderTextField('useType', '用途', { maxLength: max.useType })}
            {renderTextField('constructionPrice', '工事価格（円）', { inputMode: 'numeric' })}
            {renderTextField('workConditions', '作業条件', { maxLength: max.workConditions })}
            {renderTextField('distanceKm', '距離（km）', { inputMode: 'decimal' })}
          </div>
        </fieldset>

        <fieldset style={styles.fieldset}>
          <legend style={styles.legend}>採否と読取の確認</legend>
          <div style={styles.grid}>
            {renderSelect('adoption', '採否', ADOPTION_OPTIONS)}
            {renderTextField('confirmedAmount', '確定金額（円）', { inputMode: 'numeric' })}
            <div style={styles.field}>
              {renderSelect('readingStatus', '読取の確認', READING_STATUS_OPTIONS)}
              {renderReadingConfirmation()}
            </div>
          </div>
        </fieldset>
      </div>
    </div>
  );
}

export default LedgerInfoSection;
