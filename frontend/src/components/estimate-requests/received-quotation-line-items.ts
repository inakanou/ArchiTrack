/**
 * @fileoverview 受領見積書の明細行の変換と保存の前の検証（unit-price-ledger タスク6.6）
 *
 * 受領見積書のフォーム（ReceivedQuotationForm）と、単価台帳の案件の無い受領見積書の修正
 * （`components/unit-price-ledger/ledger-quotation-form.ts`）が同じ規則で明細行を扱うための部品。
 * もとは ReceivedQuotationForm の外へ出されていない関数で、台帳の側に同じ処理を書き写していた。
 * タスク6.6 でここへ集め、両方から使う。
 *
 * - サーバーの明細行を LineItemEditor の値にする（並び順の補完と整列。37.3）
 * - LineItemEditor の値を保存の入力にする（区分・条件・換算・分類キー・数量表の行のキー・参考の印と理由）
 * - 保存で送る明細行を、サーバーの明細行の検証の 45.4・45.9・46.5 と同じ規則で確かめる
 *
 * Requirements (estimate-request):
 * - 37.3: 並び順の欠けを補い、昇順に並べる
 * - 45.4: 値引きの行の金額は 0 以下
 * - 45.8・45.9: 換算は 4 つの欄が揃うときだけ送り、一部だけなら保存の前に止める
 * - 46.5: 参考の理由は参考の印が有の行だけ
 *
 * Requirements (unit-price-ledger):
 * - 5.1: 案件の無い受領見積書の明細行の全体の修正
 */

import type {
  LineItemConversion,
  LineItemInput,
  ReceivedQuotationInfo,
} from '../../api/received-quotations';
import {
  calculateAmount,
  createEmptyLineItem,
  ensureSortOrders,
  getLineItemLedgerFields,
  sortBySortOrder,
  type LineItemFormData,
} from './LineItemEditor';
import { formatQuantity, formatUnitPrice } from './number-format';
import { LINE_ITEM_SAVE_VALIDATION_MESSAGES } from './received-quotation-form-messages';

/**
 * 保存で送る明細行（名称の空の行は送らない）。送る順はフォームの並び順で、サーバーの「明細行の{n}行目」の n は
 * この並びの 1 始まりの番号になる
 */
export function getSubmittedLineItems(items: LineItemFormData[]): LineItemFormData[] {
  return items.filter((item) => item.name.trim() !== '');
}

/** 空の文字を null にする（台帳の文字の欄。入力された文字は変えずに送る） */
function toNullableText(text: string): string | null {
  return text === '' ? null : text;
}

/** 数の欄の文字を数にする（空・数でない文字は null） */
function parseNumberText(text: string): number | null {
  const trimmed = text.trim();
  if (trimmed === '') return null;
  const value = parseFloat(trimmed);
  return Number.isNaN(value) ? null : value;
}

/** 換算の欄のうち入力されたものの数（0〜4。単価は数として読めるときだけ数える） */
function countConversionParts(ledger: ReturnType<typeof getLineItemLedgerFields>): number {
  return [
    ledger.conversionQuantity.trim() !== '',
    ledger.conversionUnit.trim() !== '',
    parseNumberText(ledger.conversionUnitPrice) !== null,
    ledger.conversionBasis.trim() !== '',
  ].filter(Boolean).length;
}

/**
 * 換算の欄を保存の入力にする（45.8）。4 つが揃うときだけ値を持ち、どれも無ければ null。
 * 一部だけのときは保存の前の検証（45.9）が止めるため、ここでは null にする
 */
function toConversionInput(
  ledger: ReturnType<typeof getLineItemLedgerFields>
): LineItemConversion | null {
  const quantity = parseNumberText(ledger.conversionQuantity);
  const unitPrice = parseNumberText(ledger.conversionUnitPrice);
  if (countConversionParts(ledger) !== 4 || quantity === null || unitPrice === null) return null;
  return {
    quantity,
    unit: ledger.conversionUnit,
    unitPrice,
    basis: ledger.conversionBasis,
  };
}

/**
 * LineItemFormDataをLineItemInputに変換
 *
 * タスク117.4: 区分・条件・換算・分類キー・数量表の行のキー・参考の印と理由を送る（省略された欄は既定で補う）。
 * 保存済みの値をそのまま送り返すため、編集して保存しても区分などが直接工事へ戻らない。
 * 名称の空の行を除き、渡された並びの順に 0 から sortOrder を振る（37.13）
 */
export function convertToLineItemInput(items: LineItemFormData[]): LineItemInput[] {
  return getSubmittedLineItems(items).map((item, index) => {
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

/**
 * 保存で送る明細行を、サーバーの明細行の検証の 45.4・45.9・46.5 と同じ規則で確かめる（タスク117.4）。
 * 誤りのある行だけを、行の ID → 文言の並びで返す
 */
export function validateLineItemsForSave(items: LineItemFormData[]): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  const messages = LINE_ITEM_SAVE_VALIDATION_MESSAGES;
  for (const item of getSubmittedLineItems(items)) {
    const ledger = getLineItemLedgerFields(item);
    const rowErrors: string[] = [];
    // 45.4: 金額が空で数量と単価があるときはサーバーが数量×単価で求めるため、その値で判定する
    if (ledger.category === 'DISCOUNT') {
      const effectiveAmount = item.amount ?? calculateAmount(item.quantity, item.unitPrice);
      if (effectiveAmount !== null && effectiveAmount > 0) {
        rowErrors.push(messages.DISCOUNT_AMOUNT_POSITIVE);
      }
    }
    // 45.9: 換算は 4 つすべてあるかすべて無い。数量は 0 より大きい
    const conversionParts = countConversionParts(ledger);
    if (conversionParts > 0) {
      const quantity = parseNumberText(ledger.conversionQuantity);
      if (conversionParts < 4 || quantity === null || quantity <= 0) {
        rowErrors.push(messages.CONVERSION_INCOMPLETE);
      }
    }
    // 46.5: 参考の理由は参考の印が有の行だけ
    if (!ledger.isReference && ledger.referenceReason.trim() !== '') {
      rowErrors.push(messages.REFERENCE_REASON_WITHOUT_REFERENCE);
    }
    if (rowErrors.length > 0) {
      result[item.id] = rowErrors;
    }
  }
  return result;
}

/**
 * ReceivedQuotationInfoのlineItemsをLineItemFormDataに変換
 *
 * Task 79.3: サーバー応答 lineItems を `LineItemFormData[]` に変換する際に、
 * sortOrder の NULL/undefined を `ensureSortOrders` で配列インデックスに補完し、
 * `sortBySortOrder` で昇順整列してから返す（Req 37.3）。行が無ければ空の 1 行を返す
 */
export function convertToLineItemFormData(
  items: ReceivedQuotationInfo['lineItems'] | undefined
): LineItemFormData[] {
  if (!items || items.length === 0) {
    return [createEmptyLineItem(0)];
  }
  // sortOrder 欠落補完用の中間配列（id を含めて ensureSortOrders に渡す）
  const intermediate = items.map((item) => {
    const rawQuantity = item.quantity !== null ? String(item.quantity) : '';
    const rawUnitPrice = item.unitPrice !== null ? String(item.unitPrice) : '';
    const rawSortOrder = (item as { sortOrder?: number | null }).sortOrder;
    return {
      id: item.id,
      customCategory: item.customCategory ?? '',
      workType: item.workType ?? '',
      name: item.name,
      specification: item.specification ?? '',
      unit: item.unit ?? '',
      quantity: formatQuantity(rawQuantity),
      unitPrice: formatUnitPrice(rawUnitPrice),
      amount: item.amount,
      remarks: item.remarks ?? '',
      sortOrder: typeof rawSortOrder === 'number' ? rawSortOrder : null,
      // Task 117.2: 台帳の項目をサーバーの値から読む（無い項目は既定）。換算の単価には 18 の表示を適用する（45.10）
      category: item.category ?? 'DIRECT',
      condition: item.condition ?? '',
      conversionQuantity: item.conversion ? String(item.conversion.quantity) : '',
      conversionUnit: item.conversion?.unit ?? '',
      conversionUnitPrice: item.conversion
        ? formatUnitPrice(String(item.conversion.unitPrice))
        : '',
      conversionBasis: item.conversion?.basis ?? '',
      classificationKey: item.classificationKey ?? '',
      quantityRowKey: item.quantityRowKey ?? '',
      isReference: item.isReference ?? false,
      referenceReason: item.referenceReason ?? '',
    };
  });
  // Req 37.3: NULL/undefined 補完 → 昇順ソート
  return sortBySortOrder(ensureSortOrders(intermediate));
}
