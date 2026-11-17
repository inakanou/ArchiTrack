/**
 * @fileoverview 単価台帳の見積の詳細の画面（/unit-price-ledger/quotations/:id）
 *
 * unit-price-ledger タスク4.1: 経路と枠。タスク4.4: 詳細の表示と、案件の無い受領見積書の全体の修正・削除。
 * タスク4.5: 案件の受領見積書は、印（読取の確認・参考の印と理由・分類キー）だけを編集し（`MarksEditForm`）、
 * ほかの欄は受領見積書の画面への導線を出す（`ReceivedQuotationLinkNotice`）。
 *
 * 経路は認証済みの経路で、ProtectedRoute はロールしか確かめない。画面の中で台帳の管理の権限
 * （`unit_price_ledger:manage`）を確かめ、無ければ内容を出さず、詳細も問い合わせない（design.md の UnitPriceLedgerPage と同じ）。
 *
 * Requirements (unit-price-ledger):
 * - 4.6: 見積の情報・カードの ID・原本のパスと、すべての明細行（区分・条件・換算・参考の印と理由・分類キー・
 *   数量表の行のキーを含む）を表示する
 * - 4.8: 論理削除された案件の見積は、案件名の隣に「削除済みの案件」と出す
 * - 5.1: 案件の無い受領見積書は、業者名・見積日・見積の情報・案件名・原本のパスと、明細行の追加・削除・並べ替え・
 *   各欄を修正できる（LineItemEditor・LedgerInfoSection）
 * - 5.2: 案件の受領見積書は、読取の確認・参考の印と理由・分類キーだけを編集でき（PATCH /quotations/:id/marks）、
 *   ほかの欄は受領見積書の画面（見積依頼の詳細、または案件の受領見積書の一覧）への導線を出す
 * - 5.3: 分類キーは 50 文字まで（LineItemEditor の欄の上限）
 * - 5.4: 読取の確認を確認済みにして保存すると、記録された確認者と日時を出す
 * - 5.5: 案件の無い受領見積書は、確認の後に削除する
 * - 5.6: 排他の不一致（409 `LEDGER_CONFLICT`）は保存せず「ほかの利用者が更新しました。最新の内容を読み込み直してください」と出す
 * - 10.1・10.4: 台帳の管理の権限を持つ利用者だけに内容を出す
 */

import {
  useCallback,
  useEffect,
  useId,
  useState,
  type FormEvent,
  type ReactElement,
  type ReactNode,
} from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { usePermission } from '../hooks/usePermission';
import { ApiError, getApiErrorCode } from '../api/client';
import {
  UNIT_PRICE_LEDGER_MANAGE_PERMISSION,
  unitPriceLedgerApi,
  type LedgerQuotationDetail,
} from '../api/unit-price-ledger';
import type { LineItemConversion, LineItemInfo, ReadingStatus } from '../api/received-quotations';
import { ResourceNotFound } from '../components/common';
import LineItemEditor, {
  LINE_ITEM_CATEGORY_LABELS,
  LINE_ITEM_FIELD_MAX_LENGTHS,
} from '../components/estimate-requests/LineItemEditor';
import LedgerInfoSection from '../components/estimate-requests/LedgerInfoSection';
import {
  LEDGER_INFO_ERROR_SUMMARY,
  LINE_ITEMS_ERROR_SUMMARY,
} from '../components/estimate-requests/received-quotation-form-messages';
import {
  ADOPTION_LABELS,
  CONSTRUCTION_KIND_LABELS,
  DELETED_PROJECT_LABEL,
  READING_STATUS_LABELS,
} from '../components/unit-price-ledger/ledger-labels';
import {
  LEDGER_QUOTATION_MAX_LENGTHS,
  createLedgerQuotationFormData,
  hasLedgerQuotationErrors,
  toLedgerQuotationUpdateInput,
  validateLedgerQuotationForm,
  type LedgerQuotationFormData,
  type LedgerQuotationValidation,
} from '../components/unit-price-ledger/ledger-quotation-form';
import {
  createLedgerMarksFormData,
  toLedgerMarksUpdateInput,
  validateLedgerMarksForm,
  type LedgerMarkRowFormData,
  type LedgerMarksFormData,
  type LedgerMarksRowErrors,
} from '../components/unit-price-ledger/ledger-marks-form';
import { formatDate, formatDateTime } from '../utils/formatters';

// ============================================================================
// 定数
// ============================================================================

/** 権限の無い利用者に出す文言 */
const NO_PERMISSION_MESSAGE = '単価台帳を表示する権限がありません';

/** 排他の不一致の文言（5.6） */
const CONFLICT_MESSAGE = 'ほかの利用者が更新しました。最新の内容を読み込み直してください';

/** 排他の不一致のエラーコード（backend の LedgerConflictError） */
const LEDGER_CONFLICT_CODE = 'LEDGER_CONFLICT';

const LOAD_FAILED_MESSAGE = '見積を読み込めませんでした。時間をおいて、もう一度お試しください';
const SAVE_FAILED_MESSAGE = '保存に失敗しました。時間をおいて、もう一度お試しください';
const DELETE_FAILED_MESSAGE = '削除に失敗しました。時間をおいて、もう一度お試しください';
const SAVED_MESSAGE = '保存しました';

const LIST_PATH = '/unit-price-ledger';

/** 値の無い欄の表示 */
const EMPTY = '-';

const BUTTON_CLASS =
  'inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed';
const SECONDARY_BUTTON_CLASS = `${BUTTON_CLASS} border-gray-300 bg-white text-gray-700 hover:bg-gray-50`;
const PRIMARY_BUTTON_CLASS = `${BUTTON_CLASS} border-blue-700 bg-blue-700 text-white hover:bg-blue-800`;
const DANGER_BUTTON_CLASS = `${BUTTON_CLASS} border-red-700 bg-red-700 text-white hover:bg-red-800`;
const ALERT_CLASS = 'px-4 py-3 rounded-lg border border-red-200 bg-red-50 text-red-800';
const INPUT_CLASS =
  'w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500';
const INPUT_ERROR_CLASS =
  'w-full px-3 py-2 text-sm border-2 border-red-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500';

const yenFormatter = new Intl.NumberFormat('ja-JP');

// ============================================================================
// 表示の補助
// ============================================================================

function formatYen(amount: number | null): string {
  return amount === null ? EMPTY : `${yenFormatter.format(amount)}円`;
}

function textOrEmpty(value: string | null | undefined): string {
  return value === null || value === undefined || value === '' ? EMPTY : value;
}

/** 案件名。論理削除された案件は隣に「削除済みの案件」を添える（4.8） */
function formatProjectName(detail: LedgerQuotationDetail): string {
  const name = textOrEmpty(detail.projectName ?? detail.ledgerProjectName);
  return detail.projectDeleted ? `${name}（${DELETED_PROJECT_LABEL}）` : name;
}

function formatConversion(conversion: LineItemConversion | null): string {
  if (conversion === null) return EMPTY;
  return `${conversion.quantity} ${conversion.unit} × ${formatYen(conversion.unitPrice)}（${conversion.basis}）`;
}

/** 誤りの種類 */
type ActionError = { kind: 'conflict' } | { kind: 'message'; message: string };

/** 保存・削除の誤りを画面の表示にする（排他の不一致は決まった文言。ほかはサーバーの文言） */
function toActionError(error: unknown, fallback: string): ActionError {
  if (getApiErrorCode(error) === LEDGER_CONFLICT_CODE) return { kind: 'conflict' };
  if (error instanceof ApiError && error.statusCode >= 400 && error.statusCode < 500) {
    return { kind: 'message', message: error.message };
  }
  return { kind: 'message', message: fallback };
}

// ============================================================================
// 詳細の表示（4.6）
// ============================================================================

interface InfoItem {
  term: string;
  value: string;
}

function buildInfoItems(detail: LedgerQuotationDetail): InfoItem[] {
  const items: InfoItem[] = [
    { term: '業者名', value: detail.vendorName },
    { term: '見積日', value: formatDate(detail.submittedAt) },
    { term: '案件名', value: formatProjectName(detail) },
    { term: '見積番号', value: textOrEmpty(detail.quoteNumber) },
    { term: '見積の区別', value: textOrEmpty(detail.quoteDiscriminator) },
    { term: '見積全体の条件', value: textOrEmpty(detail.overallConditions) },
    { term: '場所', value: textOrEmpty(detail.siteLocation) },
    {
      term: '改修／新営',
      value: detail.constructionKind ? CONSTRUCTION_KIND_LABELS[detail.constructionKind] : EMPTY,
    },
    { term: '用途', value: textOrEmpty(detail.useType) },
    { term: '工事価格', value: formatYen(detail.constructionPrice) },
    { term: '作業条件', value: textOrEmpty(detail.workConditions) },
    { term: '距離', value: detail.distanceKm === null ? EMPTY : `${detail.distanceKm}km` },
    { term: '採否', value: ADOPTION_LABELS[detail.adoption] },
    { term: '確定金額', value: formatYen(detail.confirmedAmount) },
    { term: '読取の確認', value: READING_STATUS_LABELS[detail.readingStatus] },
  ];
  if (detail.readingStatus === 'CONFIRMED') {
    items.push(
      { term: '確認者', value: textOrEmpty(detail.readingConfirmedBy?.displayName) },
      {
        term: '確認日時',
        value: detail.readingConfirmedAt
          ? formatDateTime(detail.readingConfirmedAt.toISOString())
          : EMPTY,
      }
    );
  }
  items.push(
    { term: '合計（別途を除く）', value: formatYen(detail.totalAmount) },
    { term: 'カードの ID', value: textOrEmpty(detail.ledgerCardId) },
    { term: '原本のパス', value: textOrEmpty(detail.ledgerSourcePath) },
    { term: '原本のファイル', value: textOrEmpty(detail.fileName) }
  );
  return items;
}

function QuotationInfoView({ detail }: { detail: LedgerQuotationDetail }): ReactElement {
  const headingId = useId();
  return (
    <section
      aria-labelledby={headingId}
      className="bg-white rounded-xl border border-gray-200 shadow-sm p-4"
    >
      <h2 id={headingId} className="text-lg font-semibold text-gray-900 mb-3">
        見積の情報
      </h2>
      <dl className="grid grid-cols-1 sm:grid-cols-[max-content_1fr] gap-x-6 gap-y-2 text-sm">
        {buildInfoItems(detail).map((item) => (
          <div key={item.term} className="contents">
            <dt className="font-medium text-gray-600">{item.term}</dt>
            <dd className="text-gray-900 whitespace-pre-wrap break-words">{item.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

const LINE_ITEM_COLUMNS = [
  '区分',
  '任意分類',
  '工種',
  '名称',
  '規格',
  '数量',
  '単位',
  '単価',
  '金額',
  '条件',
  '換算',
  '参考の印',
  '参考の理由',
  '分類キー',
  '数量表の行のキー',
  '備考',
] as const;

function lineItemCells(item: LineItemInfo): string[] {
  return [
    LINE_ITEM_CATEGORY_LABELS[item.category],
    textOrEmpty(item.customCategory),
    textOrEmpty(item.workType),
    item.name,
    textOrEmpty(item.specification),
    item.quantity === null ? EMPTY : String(item.quantity),
    textOrEmpty(item.unit),
    formatYen(item.unitPrice),
    formatYen(item.amount),
    textOrEmpty(item.condition),
    formatConversion(item.conversion),
    item.isReference ? 'あり' : 'なし',
    textOrEmpty(item.referenceReason),
    textOrEmpty(item.classificationKey),
    textOrEmpty(item.quantityRowKey),
    textOrEmpty(item.remarks),
  ];
}

function LineItemTable({ lineItems }: { lineItems: LineItemInfo[] }): ReactElement {
  const sorted = [...lineItems].sort((a, b) => a.sortOrder - b.sortOrder);
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200 text-sm">
        <caption className="text-left text-lg font-semibold text-gray-900 p-4">明細行</caption>
        <thead className="bg-gray-50">
          <tr>
            {LINE_ITEM_COLUMNS.map((column) => (
              <th
                key={column}
                scope="col"
                className="px-3 py-2 text-left font-medium text-gray-700 whitespace-nowrap"
              >
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200">
          {sorted.map((item) => (
            <tr key={item.id}>
              {lineItemCells(item).map((cell, index) => (
                <td key={LINE_ITEM_COLUMNS[index]} className="px-3 py-2 text-gray-900 align-top">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ============================================================================
// 案件の無い受領見積書の修正（5.1・5.3・5.4）
// ============================================================================

interface TextFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: 'text' | 'date';
  maxLength?: number;
  required?: boolean;
  error?: string;
  disabled: boolean;
}

function TextField({
  label,
  value,
  onChange,
  type = 'text',
  maxLength,
  required = false,
  error,
  disabled,
}: TextFieldProps): ReactElement {
  const id = useId();
  const errorId = `${id}-error`;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1">
        <label htmlFor={id} className="text-sm font-medium text-gray-700">
          {label}
        </label>
        {/* 必須であることは input の required で支援技術へ伝えるため、印は読み上げない */}
        {required && (
          <span aria-hidden="true" className="text-sm text-red-700">
            *
          </span>
        )}
      </div>
      <input
        id={id}
        type={type}
        value={value}
        maxLength={maxLength}
        required={required}
        disabled={disabled}
        aria-invalid={error ? true : false}
        aria-describedby={error ? errorId : undefined}
        onChange={(e) => onChange(e.target.value)}
        className={error ? INPUT_ERROR_CLASS : INPUT_CLASS}
      />
      {error && (
        <p id={errorId} className="text-xs text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}

interface QuotationEditFormProps {
  detail: LedgerQuotationDetail;
  isSaving: boolean;
  onSubmit: (data: LedgerQuotationFormData) => void;
  onCancel: () => void;
}

function QuotationEditForm({
  detail,
  isSaving,
  onSubmit,
  onCancel,
}: QuotationEditFormProps): ReactElement {
  const headingId = useId();
  const [form, setForm] = useState<LedgerQuotationFormData>(() =>
    createLedgerQuotationFormData(detail)
  );
  const [validation, setValidation] = useState<LedgerQuotationValidation | null>(null);

  const update = <K extends keyof LedgerQuotationFormData>(
    key: K,
    value: LedgerQuotationFormData[K]
  ): void => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const result = validateLedgerQuotationForm(form);
    setValidation(result);
    if (hasLedgerQuotationErrors(result)) return;
    onSubmit(form);
  };

  const fieldErrors = validation?.fieldErrors ?? {};
  const hasLineItemErrors =
    validation !== null && Object.keys(validation.lineItemErrors).length > 0;

  return (
    <form
      aria-labelledby={headingId}
      onSubmit={handleSubmit}
      noValidate
      className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex flex-col gap-4"
    >
      <h2 id={headingId} className="text-lg font-semibold text-gray-900">
        見積の修正
      </h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <TextField
          label="業者名"
          value={form.vendorName}
          onChange={(value) => update('vendorName', value)}
          maxLength={LEDGER_QUOTATION_MAX_LENGTHS.vendorName}
          required
          error={fieldErrors.vendorName}
          disabled={isSaving}
        />
        <TextField
          label="見積日"
          type="date"
          value={form.submittedAt}
          onChange={(value) => update('submittedAt', value)}
          required
          error={fieldErrors.submittedAt}
          disabled={isSaving}
        />
        <TextField
          label="案件名"
          value={form.ledgerProjectName}
          onChange={(value) => update('ledgerProjectName', value)}
          maxLength={LEDGER_QUOTATION_MAX_LENGTHS.ledgerProjectName}
          disabled={isSaving}
        />
        <TextField
          label="原本のパス"
          value={form.ledgerSourcePath}
          onChange={(value) => update('ledgerSourcePath', value)}
          maxLength={LEDGER_QUOTATION_MAX_LENGTHS.ledgerSourcePath}
          disabled={isSaving}
        />
      </div>
      <p className="text-sm text-gray-600">カードの ID: {textOrEmpty(detail.ledgerCardId)}</p>

      <div>
        <LedgerInfoSection
          value={form.ledgerInfo}
          onChange={(next) => update('ledgerInfo', next)}
          readingConfirmedAt={
            detail.readingStatus === 'CONFIRMED' ? detail.readingConfirmedAt : null
          }
          readingConfirmedByName={detail.readingConfirmedBy?.displayName ?? null}
          disabled={isSaving}
        />
        {validation?.hasLedgerInfoErrors && (
          <p className="mt-1 text-xs text-red-700">{LEDGER_INFO_ERROR_SUMMARY}</p>
        )}
      </div>

      <fieldset className="border border-gray-200 rounded-lg p-3">
        <legend className="px-1 text-sm font-semibold text-gray-700">明細行</legend>
        <LineItemEditor
          lineItems={form.lineItems}
          onLineItemsChange={(items) => update('lineItems', items)}
          disabled={isSaving}
          lineItemErrors={validation?.lineItemErrors}
        />
        {fieldErrors.lineItems && (
          <p className="mt-2 text-xs text-red-700">{fieldErrors.lineItems}</p>
        )}
        {hasLineItemErrors && (
          <p className="mt-2 text-xs text-red-700">{LINE_ITEMS_ERROR_SUMMARY}</p>
        )}
      </fieldset>

      <div className="flex justify-end gap-3">
        <button
          type="button"
          onClick={onCancel}
          disabled={isSaving}
          className={SECONDARY_BUTTON_CLASS}
        >
          取り消す
        </button>
        <button type="submit" disabled={isSaving} className={PRIMARY_BUTTON_CLASS}>
          {isSaving ? '保存中...' : '保存'}
        </button>
      </div>
    </form>
  );
}

// ============================================================================
// 案件の受領見積書の印の編集（5.2・5.3・5.4）
// ============================================================================

/** 案件の受領見積書を直す画面（見積依頼の受領見積書は見積依頼の詳細、ほかは案件の受領見積書の一覧） */
function receivedQuotationPath(detail: LedgerQuotationDetail): string | null {
  if (detail.estimateRequestId !== null) return `/estimate-requests/${detail.estimateRequestId}`;
  if (detail.projectId !== null) return `/projects/${detail.projectId}/quotations`;
  return null;
}

/** ほかの欄を受領見積書の画面で直すための導線（5.2） */
function ReceivedQuotationLinkNotice({ path }: { path: string }): ReactElement {
  return (
    <div className="px-4 py-3 rounded-lg border border-blue-200 bg-blue-50 text-blue-900 text-sm flex flex-col sm:flex-row sm:items-center gap-2">
      <p className="flex-1">
        案件の受領見積書です。台帳の画面では、読取の確認・明細行の参考の印と理由・分類キーだけを直せます。
        ほかの欄は受領見積書の画面で直してください。
      </p>
      <Link
        to={path}
        className="font-medium text-blue-800 underline hover:text-blue-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 rounded"
      >
        受領見積書の画面で修正する
      </Link>
    </div>
  );
}

const READING_STATUS_OPTIONS: readonly ReadingStatus[] = ['UNCONFIRMED', 'CONFIRMED'];

interface MarksEditFormProps {
  detail: LedgerQuotationDetail;
  isSaving: boolean;
  onSubmit: (data: LedgerMarksFormData) => void;
  onCancel: () => void;
}

function MarksEditForm({ detail, isSaving, onSubmit, onCancel }: MarksEditFormProps): ReactElement {
  const headingId = useId();
  const readingStatusId = useId();
  const rowIdPrefix = useId();
  const [form, setForm] = useState<LedgerMarksFormData>(() => createLedgerMarksFormData(detail));
  const [rowErrors, setRowErrors] = useState<LedgerMarksRowErrors>({});

  const updateRow = <K extends keyof LedgerMarkRowFormData>(
    id: string,
    key: K,
    value: LedgerMarkRowFormData[K]
  ): void => {
    setForm((prev) => ({
      ...prev,
      rows: prev.rows.map((row) => (row.id === id ? { ...row, [key]: value } : row)),
    }));
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const errors = validateLedgerMarksForm(form);
    setRowErrors(errors);
    if (Object.keys(errors).length > 0) return;
    onSubmit(form);
  };

  const hasRowErrors = Object.keys(rowErrors).length > 0;

  return (
    <form
      aria-labelledby={headingId}
      onSubmit={handleSubmit}
      noValidate
      className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex flex-col gap-4"
    >
      <h2 id={headingId} className="text-lg font-semibold text-gray-900">
        印の編集
      </h2>

      <div className="flex flex-col gap-1 max-w-xs">
        <label htmlFor={readingStatusId} className="text-sm font-medium text-gray-700">
          読取の確認
        </label>
        <select
          id={readingStatusId}
          value={form.readingStatus}
          disabled={isSaving}
          onChange={(e) =>
            setForm((prev) => ({ ...prev, readingStatus: e.target.value as ReadingStatus }))
          }
          className={INPUT_CLASS}
        >
          {READING_STATUS_OPTIONS.map((status) => (
            <option key={status} value={status}>
              {READING_STATUS_LABELS[status]}
            </option>
          ))}
        </select>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <caption className="text-left text-sm font-semibold text-gray-700 pb-2">
            明細行の印
          </caption>
          <thead className="bg-gray-50">
            <tr>
              {['行', '名称', '参考の印', '参考の理由', '分類キー'].map((column) => (
                <th
                  key={column}
                  scope="col"
                  className="px-3 py-2 text-left font-medium text-gray-700 whitespace-nowrap"
                >
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {form.rows.map((row, index) => {
              const rowNumber = index + 1;
              const errors = rowErrors[row.id];
              const errorId = `${rowIdPrefix}-${row.id}-error`;
              return (
                <tr key={row.id}>
                  <td className="px-3 py-2 align-top text-gray-700">{rowNumber}</td>
                  <td className="px-3 py-2 align-top text-gray-900">{row.name}</td>
                  <td className="px-3 py-2 align-top">
                    <input
                      type="checkbox"
                      checked={row.isReference}
                      disabled={isSaving}
                      aria-label={`行${rowNumber} 参考`}
                      onChange={(e) => updateRow(row.id, 'isReference', e.target.checked)}
                      className="h-4 w-4 focus:ring-2 focus:ring-blue-500"
                    />
                  </td>
                  <td className="px-3 py-2 align-top min-w-[12rem]">
                    <input
                      type="text"
                      value={row.referenceReason}
                      disabled={isSaving}
                      maxLength={LINE_ITEM_FIELD_MAX_LENGTHS.referenceReason}
                      aria-label={`行${rowNumber} 参考の理由`}
                      aria-invalid={errors ? true : false}
                      aria-describedby={errors ? errorId : undefined}
                      onChange={(e) => updateRow(row.id, 'referenceReason', e.target.value)}
                      className={errors ? INPUT_ERROR_CLASS : INPUT_CLASS}
                    />
                    {errors && (
                      <p id={errorId} className="mt-1 text-xs text-red-700">
                        {errors.join('、')}
                      </p>
                    )}
                  </td>
                  <td className="px-3 py-2 align-top min-w-[8rem]">
                    <input
                      type="text"
                      value={row.classificationKey}
                      disabled={isSaving}
                      maxLength={LINE_ITEM_FIELD_MAX_LENGTHS.classificationKey}
                      aria-label={`行${rowNumber} 分類キー`}
                      onChange={(e) => updateRow(row.id, 'classificationKey', e.target.value)}
                      className={INPUT_CLASS}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {hasRowErrors && <p className="mt-2 text-xs text-red-700">{LINE_ITEMS_ERROR_SUMMARY}</p>}
      </div>

      <div className="flex justify-end gap-3">
        <button
          type="button"
          onClick={onCancel}
          disabled={isSaving}
          className={SECONDARY_BUTTON_CLASS}
        >
          取り消す
        </button>
        <button type="submit" disabled={isSaving} className={PRIMARY_BUTTON_CLASS}>
          {isSaving ? '保存中...' : '保存'}
        </button>
      </div>
    </form>
  );
}

// ============================================================================
// 削除の確認（5.5）
// ============================================================================

interface DeleteConfirmDialogProps {
  quotationName: string;
  isDeleting: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

function DeleteConfirmDialog({
  quotationName,
  isDeleting,
  onConfirm,
  onCancel,
}: DeleteConfirmDialogProps): ReactElement {
  const titleId = useId();
  const messageId = useId();

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && !isDeleting) onCancel();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isDeleting, onCancel]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={messageId}
        className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl"
      >
        <h2 id={titleId} className="text-lg font-semibold text-gray-900">
          見積の削除
        </h2>
        <p id={messageId} className="mt-2 text-sm text-gray-700">
          「{quotationName}」を削除しますか？この操作は取り消せません。
        </p>
        <div className="mt-6 flex justify-end gap-3">
          {/* 取り消しを先に置き、開いたときの焦点を取り消しに当てる（誤って削除しないため） */}
          <button
            type="button"
            onClick={onCancel}
            disabled={isDeleting}
            autoFocus
            className={SECONDARY_BUTTON_CLASS}
          >
            キャンセル
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isDeleting}
            className={DANGER_BUTTON_CLASS}
          >
            {isDeleting ? '削除中...' : '削除する'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// 画面
// ============================================================================

type LoadState =
  | { status: 'loading' }
  | { status: 'notFound' }
  | { status: 'error' }
  | { status: 'loaded'; detail: LedgerQuotationDetail };

function PageContainer({ children }: { children: ReactNode }): ReactElement {
  return <div className="max-w-7xl mx-auto px-4 py-6 flex flex-col gap-4">{children}</div>;
}

function LedgerQuotationDetailContent({ id }: { id: string }): ReactElement {
  const navigate = useNavigate();
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [actionError, setActionError] = useState<ActionError | null>(null);
  const [savedNotice, setSavedNotice] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    try {
      const detail = await unitPriceLedgerApi.getQuotation(id);
      setState({ status: 'loaded', detail });
    } catch (error) {
      setState(
        error instanceof ApiError && error.statusCode === 404
          ? { status: 'notFound' }
          : { status: 'error' }
      );
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  /** 排他の不一致の後に最新の内容を読み込み直す（修正の欄は閉じ、入力は捨てる） */
  const handleReload = useCallback(async (): Promise<void> => {
    setActionError(null);
    setSavedNotice(false);
    setIsEditing(false);
    await load();
  }, [load]);

  const handleSubmit = useCallback(
    async (data: LedgerQuotationFormData): Promise<void> => {
      if (state.status !== 'loaded') return;
      setIsSaving(true);
      setActionError(null);
      setSavedNotice(false);
      try {
        const updated = await unitPriceLedgerApi.updateQuotation(
          id,
          toLedgerQuotationUpdateInput(data, state.detail)
        );
        setState({ status: 'loaded', detail: updated });
        setIsEditing(false);
        setSavedNotice(true);
      } catch (error) {
        setActionError(toActionError(error, SAVE_FAILED_MESSAGE));
      } finally {
        setIsSaving(false);
      }
    },
    [id, state]
  );

  const handleSubmitMarks = useCallback(
    async (data: LedgerMarksFormData): Promise<void> => {
      if (state.status !== 'loaded') return;
      const input = toLedgerMarksUpdateInput(data, state.detail);
      // 何も変えていなければ送らない（送ると版が進み、ほかの利用者の保存を排他の不一致にしうる）
      if (input.readingStatus === undefined && input.lineItems.length === 0) {
        setActionError(null);
        setIsEditing(false);
        return;
      }
      setIsSaving(true);
      setActionError(null);
      setSavedNotice(false);
      try {
        const updated = await unitPriceLedgerApi.updateMarks(id, input);
        setState({ status: 'loaded', detail: updated });
        setIsEditing(false);
        setSavedNotice(true);
      } catch (error) {
        setActionError(toActionError(error, SAVE_FAILED_MESSAGE));
      } finally {
        setIsSaving(false);
      }
    },
    [id, state]
  );

  const handleCancelDelete = useCallback((): void => setIsDeleteOpen(false), []);

  const handleConfirmDelete = useCallback(async (): Promise<void> => {
    if (state.status !== 'loaded') return;
    setIsDeleting(true);
    setActionError(null);
    try {
      await unitPriceLedgerApi.deleteQuotation(id, state.detail.updatedAt);
      navigate(LIST_PATH);
    } catch (error) {
      if (error instanceof ApiError && error.statusCode === 404) {
        setState({ status: 'notFound' });
      } else {
        setActionError(toActionError(error, DELETE_FAILED_MESSAGE));
      }
      setIsDeleteOpen(false);
      setIsDeleting(false);
    }
  }, [id, navigate, state]);

  if (state.status === 'notFound') {
    return (
      <PageContainer>
        <ResourceNotFound
          resourceType="見積"
          returnPath={LIST_PATH}
          returnLabel="台帳の一覧に戻る"
        />
      </PageContainer>
    );
  }

  const header = (
    <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
      <h1 className="text-2xl font-bold text-gray-900">見積の詳細</h1>
      {state.status === 'loaded' && state.detail.projectId === null && !isEditing && (
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              setSavedNotice(false);
              setActionError(null);
              setIsEditing(true);
            }}
            className={SECONDARY_BUTTON_CLASS}
          >
            修正
          </button>
          <button
            type="button"
            onClick={() => {
              setActionError(null);
              setIsDeleteOpen(true);
            }}
            className={`${BUTTON_CLASS} border-red-300 bg-white text-red-700 hover:bg-red-50`}
          >
            削除
          </button>
        </div>
      )}
      {state.status === 'loaded' && state.detail.projectId !== null && !isEditing && (
        <button
          type="button"
          onClick={() => {
            setSavedNotice(false);
            setActionError(null);
            setIsEditing(true);
          }}
          className={SECONDARY_BUTTON_CLASS}
        >
          印の編集
        </button>
      )}
    </header>
  );

  if (state.status === 'loading') {
    return (
      <PageContainer>
        {header}
        <p role="status" className="text-gray-600">
          読み込み中...
        </p>
      </PageContainer>
    );
  }

  if (state.status === 'error') {
    return (
      <PageContainer>
        {header}
        <p role="alert" className={ALERT_CLASS}>
          {LOAD_FAILED_MESSAGE}
        </p>
      </PageContainer>
    );
  }

  const { detail } = state;
  const isProjectQuotation = detail.projectId !== null;
  const editPath = isProjectQuotation ? receivedQuotationPath(detail) : null;

  return (
    <PageContainer>
      {header}

      {actionError && (
        <div
          role="alert"
          className={`${ALERT_CLASS} flex flex-col sm:flex-row sm:items-center gap-3`}
        >
          <p className="flex-1">
            {actionError.kind === 'conflict' ? CONFLICT_MESSAGE : actionError.message}
          </p>
          {actionError.kind === 'conflict' && (
            <button
              type="button"
              onClick={() => void handleReload()}
              className={SECONDARY_BUTTON_CLASS}
            >
              最新の内容を読み込み直す
            </button>
          )}
        </div>
      )}

      {savedNotice && (
        <p
          role="status"
          className="px-4 py-3 rounded-lg border border-green-200 bg-green-50 text-green-800"
        >
          {SAVED_MESSAGE}
        </p>
      )}

      {editPath !== null && <ReceivedQuotationLinkNotice path={editPath} />}

      {isEditing && isProjectQuotation ? (
        <MarksEditForm
          key={detail.updatedAt.toISOString()}
          detail={detail}
          isSaving={isSaving}
          onSubmit={(data) => void handleSubmitMarks(data)}
          onCancel={() => {
            setActionError(null);
            setIsEditing(false);
          }}
        />
      ) : isEditing ? (
        <QuotationEditForm
          key={detail.updatedAt.toISOString()}
          detail={detail}
          isSaving={isSaving}
          onSubmit={(data) => void handleSubmit(data)}
          onCancel={() => {
            setActionError(null);
            setIsEditing(false);
          }}
        />
      ) : (
        <>
          <QuotationInfoView detail={detail} />
          <LineItemTable lineItems={detail.lineItems} />
        </>
      )}

      {isDeleteOpen && !isProjectQuotation && (
        <DeleteConfirmDialog
          quotationName={detail.name}
          isDeleting={isDeleting}
          onConfirm={() => void handleConfirmDelete()}
          onCancel={handleCancelDelete}
        />
      )}
    </PageContainer>
  );
}

export default function LedgerQuotationDetailPage(): ReactElement {
  const { hasPermission, isLoading } = usePermission();
  const { id = '' } = useParams<{ id: string }>();

  if (isLoading) {
    return (
      <PageContainer>
        <p role="status" className="text-gray-600">
          読み込み中...
        </p>
      </PageContainer>
    );
  }

  if (!hasPermission(UNIT_PRICE_LEDGER_MANAGE_PERMISSION)) {
    return (
      <PageContainer>
        <p role="alert" className={ALERT_CLASS}>
          {NO_PERMISSION_MESSAGE}
        </p>
      </PageContainer>
    );
  }

  return <LedgerQuotationDetailContent key={id} id={id} />;
}
