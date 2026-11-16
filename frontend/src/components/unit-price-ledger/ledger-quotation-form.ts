/**
 * @fileoverview 案件の無い受領見積書の修正の値・検証・変換（unit-price-ledger タスク4.4）
 *
 * 台帳の詳細（`LedgerQuotationDetail`）から修正の欄の値を作り、保存の入力（`LedgerQuotationUpdateInput`）へ直す。
 * 明細行は `LineItemEditor` の値の形、台帳の情報は `LedgerInfoSection` の値の形を使う。
 *
 * 明細行の変換と検証（区分・条件・換算・分類キー・数量表の行のキー・参考の印と理由）は、受領見積書のフォーム
 * （ReceivedQuotationForm の convertToLineItemFormData・convertToLineItemInput・validateLineItemsForSave）と
 * 同じ規則にそろえた。あちらは部品の外へ出されていないため、同じ処理をここに書いた（estimate-request の側を
 * 変えないため）。
 *
 * Requirements (unit-price-ledger):
 * - 5.1: 業者名・見積日・見積の情報・案件名・原本のパスと、明細行の全体を修正する
 * - 5.3: 分類キーは 50 文字まで（LineItemEditor の欄の上限）。体系の登録の有無は検査しない
 */

import type {
  LedgerQuotationDetail,
  LedgerQuotationUpdateInput,
} from '../../api/unit-price-ledger';
import type { LineItemConversion, LineItemInput } from '../../api/received-quotations';
import {
  calculateAmount,
  createEmptyLineItem,
  ensureSortOrders,
  getLineItemLedgerFields,
  sortBySortOrder,
  type LineItemFormData,
  type LineItemLedgerFormData,
} from '../estimate-requests/LineItemEditor';
import { formatQuantity, formatUnitPrice } from '../estimate-requests/number-format';
import {
  createLedgerInfoFormData,
  toLedgerInfoInput,
  validateLedgerInfo,
  type LedgerInfoFormData,
} from '../estimate-requests/ledger-info-form';
import { LINE_ITEM_SAVE_VALIDATION_MESSAGES } from '../estimate-requests/received-quotation-form-messages';
import { formatDate } from '../../utils/formatters';

// ============================================================================
// 定数
// ============================================================================

/** 欄の上限（backend の受領見積書の業者名・台帳の案件名・原本のパスの上限） */
export const LEDGER_QUOTATION_MAX_LENGTHS = {
  vendorName: 200,
  ledgerProjectName: 255,
  ledgerSourcePath: 1000,
} as const;

/** 検証の文言（backend の検証の文言と同じ） */
export const LEDGER_QUOTATION_VALIDATION_MESSAGES = {
  VENDOR_NAME_REQUIRED: '業者名を入力してください',
  VENDOR_NAME_TOO_LONG: '業者名は200文字以内で入力してください',
  SUBMITTED_AT_REQUIRED: '見積日を入力してください',
  LINE_ITEMS_REQUIRED: '明細行を1行以上入力してください',
} as const;

// ============================================================================
// 型定義
// ============================================================================

/** 修正の欄の値 */
export interface LedgerQuotationFormData {
  vendorName: string;
  /** 見積日（YYYY-MM-DD） */
  submittedAt: string;
  ledgerProjectName: string;
  ledgerSourcePath: string;
  ledgerInfo: LedgerInfoFormData;
  lineItems: LineItemFormData[];
}

/** 見積全体の欄の誤り */
export type LedgerQuotationFieldErrors = Partial<
  Record<'vendorName' | 'submittedAt' | 'lineItems', string>
>;

/** 検証の結果 */
export interface LedgerQuotationValidation {
  fieldErrors: LedgerQuotationFieldErrors;
  /** 行の ID → 文言の並び */
  lineItemErrors: Record<string, string[]>;
  /** 台帳の情報の欄に誤りがあるか */
  hasLedgerInfoErrors: boolean;
}

// ============================================================================
// 明細行
// ============================================================================

/** 数の欄の文字を数にする（空・数でない文字は null） */
function parseNumberText(text: string): number | null {
  const trimmed = text.trim();
  if (trimmed === '') return null;
  const value = parseFloat(trimmed);
  return Number.isNaN(value) ? null : value;
}

/** 換算の欄のうち入力されたものの数（0〜4。単価は数として読めるときだけ数える） */
function countConversionParts(ledger: LineItemLedgerFormData): number {
  return [
    ledger.conversionQuantity.trim() !== '',
    ledger.conversionUnit.trim() !== '',
    parseNumberText(ledger.conversionUnitPrice) !== null,
    ledger.conversionBasis.trim() !== '',
  ].filter(Boolean).length;
}

/** 換算の欄を保存の入力にする。4 つが揃うときだけ値を持ち、そうでなければ null */
function toConversionInput(ledger: LineItemLedgerFormData): LineItemConversion | null {
  const quantity = parseNumberText(ledger.conversionQuantity);
  const unitPrice = parseNumberText(ledger.conversionUnitPrice);
  if (countConversionParts(ledger) !== 4 || quantity === null || unitPrice === null) return null;
  return { quantity, unit: ledger.conversionUnit, unitPrice, basis: ledger.conversionBasis };
}

const toNullableText = (text: string): string | null => (text === '' ? null : text);

/** 保存で送る明細行（名称の空の行は送らない） */
function getSubmittedLineItems(items: LineItemFormData[]): LineItemFormData[] {
  return items.filter((item) => item.name.trim() !== '');
}

/** 詳細の明細行を LineItemEditor の値にする（並び順で並べる。行が無ければ空の 1 行） */
function toLineItemFormData(items: LedgerQuotationDetail['lineItems']): LineItemFormData[] {
  if (items.length === 0) return [createEmptyLineItem(0)];
  const intermediate = items.map((item) => ({
    id: item.id,
    sortOrder: item.sortOrder,
    customCategory: item.customCategory ?? '',
    workType: item.workType ?? '',
    name: item.name,
    specification: item.specification ?? '',
    unit: item.unit ?? '',
    quantity: formatQuantity(item.quantity !== null ? String(item.quantity) : ''),
    unitPrice: formatUnitPrice(item.unitPrice !== null ? String(item.unitPrice) : ''),
    amount: item.amount,
    remarks: item.remarks ?? '',
    category: item.category,
    condition: item.condition ?? '',
    conversionQuantity: item.conversion ? String(item.conversion.quantity) : '',
    conversionUnit: item.conversion?.unit ?? '',
    conversionUnitPrice: item.conversion ? formatUnitPrice(String(item.conversion.unitPrice)) : '',
    conversionBasis: item.conversion?.basis ?? '',
    classificationKey: item.classificationKey ?? '',
    quantityRowKey: item.quantityRowKey ?? '',
    isReference: item.isReference,
    referenceReason: item.referenceReason ?? '',
  }));
  return sortBySortOrder(ensureSortOrders(intermediate));
}

/** LineItemEditor の値を保存の入力にする（名称の空の行を除き、並びの順に 0 から番号を振る） */
function toLineItemInputs(items: LineItemFormData[]): LineItemInput[] {
  return getSubmittedLineItems(sortBySortOrder(items)).map((item, index) => {
    const ledger = getLineItemLedgerFields(item);
    return {
      name: item.name.trim(),
      customCategory: item.customCategory.trim() || undefined,
      workType: item.workType.trim() || undefined,
      specification: item.specification.trim() || undefined,
      unit: item.unit.trim() || undefined,
      quantity: item.quantity ? parseFloat(item.quantity) : undefined,
      unitPrice: item.unitPrice ? parseFloat(item.unitPrice) : undefined,
      amount: item.amount ?? undefined,
      remarks: item.remarks.trim() || undefined,
      sortOrder: index,
      category: ledger.category,
      condition: toNullableText(ledger.condition),
      conversion: toConversionInput(ledger),
      classificationKey: toNullableText(ledger.classificationKey),
      quantityRowKey: toNullableText(ledger.quantityRowKey),
      isReference: ledger.isReference,
      referenceReason: ledger.referenceReason.trim() === '' ? null : ledger.referenceReason,
    };
  });
}

/** 明細行を backend の明細行の検証（値引きの金額・換算の 4 つの欄・参考の理由）と同じ規則で確かめる */
function validateLineItems(items: LineItemFormData[]): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  const messages = LINE_ITEM_SAVE_VALIDATION_MESSAGES;
  for (const item of getSubmittedLineItems(items)) {
    const ledger = getLineItemLedgerFields(item);
    const rowErrors: string[] = [];
    if (ledger.category === 'DISCOUNT') {
      const effectiveAmount = item.amount ?? calculateAmount(item.quantity, item.unitPrice);
      if (effectiveAmount !== null && effectiveAmount > 0) {
        rowErrors.push(messages.DISCOUNT_AMOUNT_POSITIVE);
      }
    }
    const conversionParts = countConversionParts(ledger);
    if (conversionParts > 0) {
      const quantity = parseNumberText(ledger.conversionQuantity);
      if (conversionParts < 4 || quantity === null || quantity <= 0) {
        rowErrors.push(messages.CONVERSION_INCOMPLETE);
      }
    }
    if (!ledger.isReference && ledger.referenceReason.trim() !== '') {
      rowErrors.push(messages.REFERENCE_REASON_WITHOUT_REFERENCE);
    }
    if (rowErrors.length > 0) result[item.id] = rowErrors;
  }
  return result;
}

// ============================================================================
// 見積全体
// ============================================================================

/** 詳細から修正の欄の値を作る */
export function createLedgerQuotationFormData(
  detail: LedgerQuotationDetail
): LedgerQuotationFormData {
  return {
    vendorName: detail.vendorName,
    submittedAt: formatDate(detail.submittedAt),
    ledgerProjectName: detail.ledgerProjectName ?? '',
    ledgerSourcePath: detail.ledgerSourcePath ?? '',
    ledgerInfo: createLedgerInfoFormData(detail),
    lineItems: toLineItemFormData(detail.lineItems),
  };
}

/** 修正の欄の値を、backend の検証と同じ規則で確かめる */
export function validateLedgerQuotationForm(
  data: LedgerQuotationFormData
): LedgerQuotationValidation {
  const messages = LEDGER_QUOTATION_VALIDATION_MESSAGES;
  const fieldErrors: LedgerQuotationFieldErrors = {};
  const vendorName = data.vendorName.trim();
  if (vendorName === '') {
    fieldErrors.vendorName = messages.VENDOR_NAME_REQUIRED;
  } else if (vendorName.length > LEDGER_QUOTATION_MAX_LENGTHS.vendorName) {
    fieldErrors.vendorName = messages.VENDOR_NAME_TOO_LONG;
  }
  if (data.submittedAt === '' || Number.isNaN(new Date(data.submittedAt).getTime())) {
    fieldErrors.submittedAt = messages.SUBMITTED_AT_REQUIRED;
  }
  if (getSubmittedLineItems(data.lineItems).length === 0) {
    fieldErrors.lineItems = messages.LINE_ITEMS_REQUIRED;
  }
  return {
    fieldErrors,
    lineItemErrors: validateLineItems(data.lineItems),
    hasLedgerInfoErrors: Object.keys(validateLedgerInfo(data.ledgerInfo)).length > 0,
  };
}

/** 検証の結果に誤りがあるか */
export function hasLedgerQuotationErrors(validation: LedgerQuotationValidation): boolean {
  return (
    Object.keys(validation.fieldErrors).length > 0 ||
    Object.keys(validation.lineItemErrors).length > 0 ||
    validation.hasLedgerInfoErrors
  );
}

/**
 * 修正の欄の値を保存の入力にする（検証を通った値を渡すこと）
 *
 * - 見積日を変えていないときは、読み込んだ見積日をそのまま送る（日付の欄の表し方で時刻をずらさないため）
 * - 取引先は送らない（backend が業者名で照合する）
 * - 楽観的排他のため、読み込んだときの更新の日時を送る（5.6）
 */
export function toLedgerQuotationUpdateInput(
  data: LedgerQuotationFormData,
  detail: LedgerQuotationDetail
): LedgerQuotationUpdateInput {
  const submittedAt =
    data.submittedAt === formatDate(detail.submittedAt)
      ? detail.submittedAt.toISOString()
      : new Date(data.submittedAt).toISOString();
  return {
    vendorName: data.vendorName.trim(),
    submittedAt,
    ledgerProjectName: data.ledgerProjectName.trim() === '' ? null : data.ledgerProjectName,
    ledgerSourcePath: data.ledgerSourcePath.trim() === '' ? null : data.ledgerSourcePath,
    ...toLedgerInfoInput(data.ledgerInfo),
    lineItems: toLineItemInputs(data.lineItems),
    expectedUpdatedAt: detail.updatedAt.toISOString(),
  };
}
