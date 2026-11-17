/**
 * @fileoverview 単価台帳の一覧の絞り込みの欄（unit-price-ledger タスク4.2）
 *
 * 欄の値は手元に持ち、「検索」で親へ渡す。親は渡された条件を URL の検索の値に持ち、
 * 条件が変わったら `key` を変えてこの欄を作り直す（欄の値を条件に戻すため）。
 *
 * Requirements (unit-price-ledger):
 * - 4.2: 業者名・案件名・明細行の名称の文字、見積日の期間、案件の有無、採否、読取の確認、改修／新営で絞り込む
 * - 4.3: 「要確認」（参考の印のある明細行を持つ）で絞り込む
 * - 4.4: 「分類キーの無い行がある」で絞り込む
 * - 4.9: 「削除済みの案件を除く」で、論理削除された案件の見積を除く
 */

import { useCallback, useId, useState, type ChangeEvent, type FormEvent } from 'react';
import type { LedgerFilter } from '../../api/unit-price-ledger';
import type {
  ConstructionKind,
  QuotationAdoption,
  ReadingStatus,
} from '../../api/received-quotations';
import { ADOPTION_LABELS, CONSTRUCTION_KIND_LABELS, READING_STATUS_LABELS } from './ledger-labels';

// ============================================================================
// 型定義
// ============================================================================

export interface LedgerSearchFilterProps {
  /** いま当てている条件 */
  filter: LedgerFilter;
  /** 「検索」・「条件をクリア」で、新しい条件を渡す */
  onSearch: (filter: LedgerFilter) => void;
  /** 読み込み中などで操作をさせないとき */
  disabled?: boolean;
}

/** 欄の値（選択の欄の空は「すべて」） */
interface DraftFilter {
  keyword: string;
  submittedFrom: string;
  submittedTo: string;
  hasProject: '' | 'true' | 'false';
  adoption: '' | QuotationAdoption;
  readingStatus: '' | ReadingStatus;
  constructionKind: '' | ConstructionKind;
  needsReview: boolean;
  missingClassificationKey: boolean;
  excludeDeletedProjects: boolean;
}

// ============================================================================
// 定数
// ============================================================================

/** キーワードの文字の上限（backend の LEDGER_FIELD_LIMITS.keyword と同じ） */
const KEYWORD_MAX_LENGTH = 200;

/** 見積日の期間の始まりが終わりより後のときの文言 */
const SUBMITTED_RANGE_ERROR = '見積日の期間は、始まりを終わり以前にしてください';

const ALL_LABEL = 'すべて';

const HAS_PROJECT_OPTIONS: ReadonlyArray<{ value: DraftFilter['hasProject']; label: string }> = [
  { value: '', label: ALL_LABEL },
  { value: 'true', label: 'あり' },
  { value: 'false', label: 'なし' },
];

function optionsOf<T extends string>(
  labels: Readonly<Record<T, string>>
): ReadonlyArray<{ value: '' | T; label: string }> {
  return [
    { value: '', label: ALL_LABEL },
    ...(Object.entries(labels) as Array<[T, string]>).map(([value, label]) => ({ value, label })),
  ];
}

const ADOPTION_OPTIONS = optionsOf(ADOPTION_LABELS);
const READING_STATUS_OPTIONS = optionsOf(READING_STATUS_LABELS);
const CONSTRUCTION_KIND_OPTIONS = optionsOf(CONSTRUCTION_KIND_LABELS);

const INPUT_CLASS =
  'w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100';
const LABEL_CLASS = 'block text-sm font-medium text-gray-700 mb-1';

// ============================================================================
// ヘルパー関数
// ============================================================================

function toDraft(filter: LedgerFilter): DraftFilter {
  return {
    keyword: filter.keyword ?? '',
    submittedFrom: filter.submittedFrom ?? '',
    submittedTo: filter.submittedTo ?? '',
    hasProject: filter.hasProject === undefined ? '' : filter.hasProject ? 'true' : 'false',
    adoption: filter.adoption ?? '',
    readingStatus: filter.readingStatus ?? '',
    constructionKind: filter.constructionKind ?? '',
    needsReview: filter.needsReview === true,
    missingClassificationKey: filter.missingClassificationKey === true,
    excludeDeletedProjects: filter.excludeDeletedProjects === true,
  };
}

/** 欄の値を条件にする。空の欄は条件に入れない */
function toFilter(draft: DraftFilter): LedgerFilter {
  const filter: LedgerFilter = {};
  const keyword = draft.keyword.trim();
  if (keyword !== '') filter.keyword = keyword;
  if (draft.submittedFrom !== '') filter.submittedFrom = draft.submittedFrom;
  if (draft.submittedTo !== '') filter.submittedTo = draft.submittedTo;
  if (draft.hasProject !== '') filter.hasProject = draft.hasProject === 'true';
  if (draft.adoption !== '') filter.adoption = draft.adoption;
  if (draft.readingStatus !== '') filter.readingStatus = draft.readingStatus;
  if (draft.constructionKind !== '') filter.constructionKind = draft.constructionKind;
  if (draft.needsReview) filter.needsReview = true;
  if (draft.missingClassificationKey) filter.missingClassificationKey = true;
  if (draft.excludeDeletedProjects) filter.excludeDeletedProjects = true;
  return filter;
}

// ============================================================================
// コンポーネント
// ============================================================================

export default function LedgerSearchFilter({
  filter,
  onSearch,
  disabled = false,
}: LedgerSearchFilterProps) {
  const [draft, setDraft] = useState<DraftFilter>(() => toDraft(filter));
  const [rangeError, setRangeError] = useState(false);

  const baseId = useId();
  const ids = {
    keyword: `${baseId}-keyword`,
    submittedFrom: `${baseId}-submitted-from`,
    submittedTo: `${baseId}-submitted-to`,
    hasProject: `${baseId}-has-project`,
    adoption: `${baseId}-adoption`,
    readingStatus: `${baseId}-reading-status`,
    constructionKind: `${baseId}-construction-kind`,
    needsReview: `${baseId}-needs-review`,
    missingClassificationKey: `${baseId}-missing-classification-key`,
    excludeDeletedProjects: `${baseId}-exclude-deleted-projects`,
    rangeError: `${baseId}-range-error`,
  };

  const update = useCallback(<K extends keyof DraftFilter>(key: K, value: DraftFilter[K]) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
    if (key === 'submittedFrom' || key === 'submittedTo') {
      setRangeError(false);
    }
  }, []);

  const handleSubmit = useCallback(
    (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (
        draft.submittedFrom !== '' &&
        draft.submittedTo !== '' &&
        draft.submittedFrom > draft.submittedTo
      ) {
        setRangeError(true);
        return;
      }
      onSearch(toFilter(draft));
    },
    [draft, onSearch]
  );

  const handleClear = useCallback(() => {
    setDraft(toDraft({}));
    setRangeError(false);
    onSearch({});
  }, [onSearch]);

  const renderSelect = <K extends 'hasProject' | 'adoption' | 'readingStatus' | 'constructionKind'>(
    key: K,
    label: string,
    options: ReadonlyArray<{ value: DraftFilter[K]; label: string }>
  ) => (
    <div>
      <label htmlFor={ids[key]} className={LABEL_CLASS}>
        {label}
      </label>
      <select
        id={ids[key]}
        className={INPUT_CLASS}
        value={draft[key]}
        onChange={(e: ChangeEvent<HTMLSelectElement>) =>
          update(key, e.target.value as DraftFilter[K])
        }
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );

  const renderCheckbox = (
    key: 'needsReview' | 'missingClassificationKey' | 'excludeDeletedProjects',
    label: string
  ) => (
    <label
      htmlFor={ids[key]}
      className="flex items-center gap-2 cursor-pointer text-sm text-gray-700"
    >
      <input
        id={ids[key]}
        type="checkbox"
        className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500"
        checked={draft[key]}
        onChange={(e) => update(key, e.target.checked)}
      />
      <span>{label}</span>
    </label>
  );

  return (
    <form
      role="search"
      aria-label="台帳の絞り込み"
      className="bg-white p-5 rounded-xl shadow-sm border border-gray-200 mb-6"
      onSubmit={handleSubmit}
      noValidate
    >
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="md:col-span-2">
          <label htmlFor={ids.keyword} className={LABEL_CLASS}>
            キーワード
          </label>
          <input
            id={ids.keyword}
            type="search"
            className={INPUT_CLASS}
            placeholder="業者名・案件名・明細行の名称"
            maxLength={KEYWORD_MAX_LENGTH}
            value={draft.keyword}
            onChange={(e) => update('keyword', e.target.value)}
          />
        </div>
        <div>
          <label htmlFor={ids.submittedFrom} className={LABEL_CLASS}>
            見積日（から）
          </label>
          <input
            id={ids.submittedFrom}
            type="date"
            className={INPUT_CLASS}
            value={draft.submittedFrom}
            aria-invalid={rangeError || undefined}
            aria-describedby={rangeError ? ids.rangeError : undefined}
            onChange={(e) => update('submittedFrom', e.target.value)}
          />
        </div>
        <div>
          <label htmlFor={ids.submittedTo} className={LABEL_CLASS}>
            見積日（まで）
          </label>
          <input
            id={ids.submittedTo}
            type="date"
            className={INPUT_CLASS}
            value={draft.submittedTo}
            aria-invalid={rangeError || undefined}
            aria-describedby={rangeError ? ids.rangeError : undefined}
            onChange={(e) => update('submittedTo', e.target.value)}
          />
        </div>
        {renderSelect('hasProject', '案件の有無', HAS_PROJECT_OPTIONS)}
        {renderSelect('adoption', '採否', ADOPTION_OPTIONS)}
        {renderSelect('readingStatus', '読取の確認', READING_STATUS_OPTIONS)}
        {renderSelect('constructionKind', '改修／新営', CONSTRUCTION_KIND_OPTIONS)}
      </div>

      <div className="mt-4 flex flex-wrap gap-6">
        {renderCheckbox('needsReview', '要確認')}
        {renderCheckbox('missingClassificationKey', '分類キーの無い行がある')}
        {renderCheckbox('excludeDeletedProjects', '削除済みの案件を除く')}
      </div>

      {rangeError && (
        <p id={ids.rangeError} role="alert" className="mt-3 text-sm text-red-700">
          {SUBMITTED_RANGE_ERROR}
        </p>
      )}

      <div className="mt-4 flex items-center justify-end gap-3 border-t border-gray-100 pt-4">
        <button
          type="button"
          onClick={handleClear}
          disabled={disabled}
          className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          条件をクリア
        </button>
        <button
          type="submit"
          disabled={disabled}
          className="px-5 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          検索
        </button>
      </div>
    </form>
  );
}
