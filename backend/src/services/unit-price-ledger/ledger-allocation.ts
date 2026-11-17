/**
 * @fileoverview 按分の計算（unit-price-ledger タスク2.1、design.md の LedgerAllocation）
 *
 * 似た単価の候補の行の単価と、その見積の区分ごとの金額の合計から、諸経費と値引きを按分した
 * 単価の内訳を求める。DB に依らない純粋な計算。
 *
 * - 単価は、換算の単価 → 単価 → 金額÷数量 の順に決める（8.1）
 * - 按分の基準＝直接工事と産廃の金額の合計（8.2）
 * - 諸経費の率＝（諸経費＋交通費＋法定福利費）÷基準、値引きの率＝値引き÷基準。別途は使わない（8.3）
 * - 単価・諸経費の按分・値引きの按分・反映する単価を、ROUND_HALF_UP（0 から遠い側）で整数に丸める
 *   （8.4・8.5。estimate-creation の `roundMoney` と同じ丸め）。按分と反映する単価は丸める前の単価から求め、
 *   反映する単価は丸める前の 3 つの値の和を丸める
 * - 基準が 0 以下なら按分は 0 で `allocatable: false`（8.6）。丸めた反映する単価が 0 より小さければ
 *   `applicable: false`（8.7）
 * - 単価を決められない行は、4 つの金額を null、按分の状態を `UNIT_PRICE_UNDETERMINED`、`allocatable` と
 *   `applicable` を false で返す（8.8。タスク6.1）
 * - 按分の状態（`allocationStatus`）は、単価を決められない → `UNIT_PRICE_UNDETERMINED`、基準が 0 以下 →
 *   `BASE_NOT_POSITIVE`、それ以外 → `ALLOCATED` の順に決める
 * - 整数に丸める前の 4 つの値も、`unrounded` に小数点以下 `UNROUNDED_DECIMAL_PLACES`（10）桁までの十進の文字
 *   （ROUND_HALF_UP。末尾の 0 を除き、指数の表記を使わない。-0 は "0"）で返す。単価を決められない行は null
 *   （8.9。タスク6.7）
 *
 * Requirements (unit-price-ledger): 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8, 8.9
 *
 * @module services/unit-price-ledger/ledger-allocation
 */

import Decimal from 'decimal.js';
import type { ReceivedQuotationLineCategory } from '../../generated/prisma/enums.js';

/**
 * 按分の計算に使う Decimal。
 * 金額÷数量や率（÷基準）は割り切れないことがあり、既定の有効桁 20 では積の前に丸めが入りうるため、
 * 有効桁を 64 に広げる（DB の桁は DECIMAL(15,2)・DECIMAL(15,4) で十分に収まる）
 */
const AllocationDecimal = Decimal.clone({ precision: 64, rounding: Decimal.ROUND_HALF_UP });
type AllocationDecimal = InstanceType<typeof AllocationDecimal>;

/** 計算の入力の値（Prisma の Decimal・文字・数）。空は null */
export type AllocationValue = Decimal.Value | null;

/**
 * 候補の明細行のうち、単価を決めるのに使う欄（受領見積書の明細行の同名の欄）
 */
export interface AllocationLine {
  /** 換算の単価（換算のある行だけ） */
  conversionUnitPrice: AllocationValue;
  unitPrice: AllocationValue;
  amount: AllocationValue;
  quantity: AllocationValue;
}

/**
 * 候補の見積の、明細行の区分ごとの金額の合計。無い区分は 0 として扱う
 */
export type CategoryTotals = Partial<Record<ReceivedQuotationLineCategory, AllocationValue>>;

/**
 * 按分の状態（design.md の AllocationStatus）
 * - `ALLOCATED`：単価が決まり、按分の基準が 0 より大きい
 * - `BASE_NOT_POSITIVE`：単価は決まり、按分の基準が 0 以下（8.6）
 * - `UNIT_PRICE_UNDETERMINED`：単価を決められない（8.8）
 */
export type AllocationStatus = 'ALLOCATED' | 'BASE_NOT_POSITIVE' | 'UNIT_PRICE_UNDETERMINED';

/**
 * 整数に丸める前の値の、小数点以下の桁の上限（8.9）。
 * 入力の桁は小数点以下 4 桁まで（DECIMAL(15,4)）だが、金額÷数量と率（÷基準）は割り切れないことがあるため、
 * どこかで切る。10 桁なら誤差は 5×10^-11 以下で、呼び出し元の 1 円や 0.01 の丸めの結果が変わりうるのは、
 * 真の値が四捨五入の境目からその幅の内にあるときだけ（境目にちょうど乗る値は 10 桁以内で表せる）。
 * 単価の整数部は最大 17 桁（金額 13 桁÷数量 0.0001）で、有効桁は 27 桁まで（ArchiBench の受ける 28 桁以内）
 */
export const UNROUNDED_DECIMAL_PLACES = 10;

/**
 * 整数に丸める前の按分の内訳（8.9）。小数点以下 `UNROUNDED_DECIMAL_PLACES` 桁までの十進の文字
 */
export interface UnroundedAllocation {
  unitPrice: string;
  overheadAllocation: string;
  discountAllocation: string;
  /** 丸める前の単価・諸経費の按分・値引きの按分の和（桁を切る前の値の和） */
  appliedUnitPrice: string;
}

/** 単価が決まった行の按分の内訳。金額は整数の文字 */
export interface DeterminedAllocationBreakdown {
  allocationStatus: Exclude<AllocationStatus, 'UNIT_PRICE_UNDETERMINED'>;
  unitPrice: string;
  overheadAllocation: string;
  discountAllocation: string;
  appliedUnitPrice: string;
  /** 按分の基準が 0 より大きく、按分できたか（8.6） */
  allocatable: boolean;
  /** 反映する単価が 0 以上で、実行金額に反映できるか（8.7） */
  applicable: boolean;
  /** 整数に丸める前の 4 つの値（8.9） */
  unrounded: UnroundedAllocation;
}

/** 単価を決められない行の按分の内訳（8.8）。4 つの金額は値なし */
export interface UndeterminedAllocationBreakdown {
  allocationStatus: 'UNIT_PRICE_UNDETERMINED';
  unitPrice: null;
  overheadAllocation: null;
  discountAllocation: null;
  appliedUnitPrice: null;
  allocatable: false;
  applicable: false;
  /** 丸める前の値も値なし（8.9） */
  unrounded: null;
}

/**
 * 按分の内訳（design.md の AllocationBreakdown）
 */
export type AllocationBreakdown = DeterminedAllocationBreakdown | UndeterminedAllocationBreakdown;

/** 単価を決められない行の按分の内訳（8.8） */
const UNDETERMINED_ALLOCATION: UndeterminedAllocationBreakdown = {
  allocationStatus: 'UNIT_PRICE_UNDETERMINED',
  unitPrice: null,
  overheadAllocation: null,
  discountAllocation: null,
  appliedUnitPrice: null,
  allocatable: false,
  applicable: false,
  unrounded: null,
};

/** 諸経費の率の分子に入れる区分（8.3） */
const OVERHEAD_CATEGORIES = ['OVERHEAD', 'TRAVEL', 'LEGAL_WELFARE'] as const;
/** 按分の基準に入れる区分（8.2） */
const BASE_CATEGORIES = ['DIRECT', 'WASTE'] as const;

const toDecimal = (value: AllocationValue | undefined): AllocationDecimal | null =>
  value === null || value === undefined ? null : new AllocationDecimal(value.toString());

const sumCategories = (
  totals: CategoryTotals,
  categories: readonly ReceivedQuotationLineCategory[]
): AllocationDecimal =>
  categories.reduce<AllocationDecimal>(
    (sum, category) => sum.plus(toDecimal(totals[category]) ?? 0),
    new AllocationDecimal(0)
  );

/**
 * 整数に丸めて文字にする（ROUND_HALF_UP：等距離なら 0 から遠い側）。-0 は "0" にする
 */
const roundToIntegerString = (value: AllocationDecimal): string => {
  const rounded = value.toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
  return rounded.isZero() ? '0' : rounded.toFixed(0);
};

/**
 * 小数点以下 `UNROUNDED_DECIMAL_PLACES` 桁までに丸めて文字にする（8.9。ROUND_HALF_UP）。
 * 末尾の 0 を除き、指数の表記を使わない。-0 は "0" にする
 */
const toUnroundedString = (value: AllocationDecimal): string => {
  const rounded = value.toDecimalPlaces(UNROUNDED_DECIMAL_PLACES, Decimal.ROUND_HALF_UP);
  return rounded.isZero() ? '0' : rounded.toFixed();
};

/**
 * 候補の行の単価を決める（8.1）。換算の単価 → 単価 → 金額÷数量。
 * 単価も換算の単価も空で、金額か数量が空、または数量が 0 なら決められないため null
 */
const resolveUnitPrice = (line: AllocationLine): AllocationDecimal | null => {
  const conversionUnitPrice = toDecimal(line.conversionUnitPrice);
  if (conversionUnitPrice) return conversionUnitPrice;

  const unitPrice = toDecimal(line.unitPrice);
  if (unitPrice) return unitPrice;

  const amount = toDecimal(line.amount);
  const quantity = toDecimal(line.quantity);
  if (!amount || !quantity || quantity.isZero()) return null;
  return amount.div(quantity);
};

/**
 * 候補の行の按分の内訳を求める
 *
 * @param line - 候補の明細行の単価の欄
 * @param totals - 候補の見積の、区分ごとの明細行の金額の合計
 * @returns 按分の内訳
 */
export function computeAllocation(
  line: AllocationLine,
  totals: CategoryTotals
): AllocationBreakdown {
  const unitPrice = resolveUnitPrice(line);
  if (!unitPrice) {
    // 単価を決められない行は、金額を値なしで返し、按分も反映もできない（8.8）
    return { ...UNDETERMINED_ALLOCATION };
  }

  const base = sumCategories(totals, BASE_CATEGORIES);
  const allocatable = base.greaterThan(0);

  const zero = new AllocationDecimal(0);
  const overheadAllocation = allocatable
    ? unitPrice.mul(sumCategories(totals, OVERHEAD_CATEGORIES)).div(base)
    : zero;
  const discountAllocation = allocatable
    ? unitPrice.mul(toDecimal(totals.DISCOUNT) ?? 0).div(base)
    : zero;

  const unroundedAppliedUnitPrice = unitPrice.plus(overheadAllocation).plus(discountAllocation);
  const appliedUnitPrice = roundToIntegerString(unroundedAppliedUnitPrice);

  return {
    allocationStatus: allocatable ? 'ALLOCATED' : 'BASE_NOT_POSITIVE',
    unitPrice: roundToIntegerString(unitPrice),
    overheadAllocation: roundToIntegerString(overheadAllocation),
    discountAllocation: roundToIntegerString(discountAllocation),
    appliedUnitPrice,
    allocatable,
    applicable: !new AllocationDecimal(appliedUnitPrice).lessThan(0),
    unrounded: {
      unitPrice: toUnroundedString(unitPrice),
      overheadAllocation: toUnroundedString(overheadAllocation),
      discountAllocation: toUnroundedString(discountAllocation),
      appliedUnitPrice: toUnroundedString(unroundedAppliedUnitPrice),
    },
  };
}
