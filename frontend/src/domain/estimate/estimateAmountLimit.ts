/**
 * @fileoverview estimateAmountLimit - 金額の上限と上限超過（オーバーフロー）の判定
 *
 * 見積の金額計算結果が、システムが保持できる金額の最大値を超えたかを判定する。
 * 画面（見積書詳細画面の明細行とサマリー）はこの判定でオーバーフロー警告を表示する（13.5）。
 *
 * ## 上限の出どころ（正はサーバーの保存スキーマ）
 *
 * 金額の上限の正は、一括保存（`PUT /api/estimates/:id/save`）の検証である
 * `backend/src/schemas/estimate.schema.ts` の `AMOUNT_DECIMAL_PATTERN`
 * （整数部13桁・小数部2桁。永続化先 `EstimateItemLine.amount` の Prisma `Decimal(15, 2)` に対応）。
 * この範囲を外れた金額は保存時に 400 で拒まれる。フロントエンドはバックエンドの
 * モジュールを import できないため、同じ上限を {@link ESTIMATE_AMOUNT_MAX} として写して持つ。
 * 保存スキーマの上限を変える場合はこの値も同じ変更で改めること
 * （両者の一致は `estimateAmountLimit.test.ts` と backend の保存スキーマの単体テストが
 * それぞれ同じ境界値で固定している）。
 *
 * ## 対象
 *
 * - 明細行の金額（葉の 数量×単価、親の子の合計＝`estimateTree.recalculateAncestorAmounts`）。
 *   いずれも保存時に永続化されるため、上限を超えると保存できない。
 * - サマリーの合計・差額（`summarize` 相当の値）。永続化はされないが金額計算の結果であり、
 *   上限を超えた値は帳票の金額として扱えないため同じ上限で警告する。
 *
 * 負数（値引き行、41.5）は絶対値で判定する（保存スキーマも符号を除いた桁数で判定する）。
 *
 * UI・サーバーいずれにも依存しないドメイン層のモジュールであり、
 * components / hooks / pages / api からは import しない（design.md `#### Dependency Direction`）。
 *
 * Requirements (estimate-creation):
 * - 13.5: 金額計算結果が数値の最大値を超えた場合にオーバーフロー警告を表示する
 *
 * @module domain/estimate/estimateAmountLimit
 */

import Decimal from 'decimal.js';

/**
 * 金額の最大値（絶対値）
 *
 * `backend/src/schemas/estimate.schema.ts` の `AMOUNT_DECIMAL_PATTERN`（整数部13桁・小数部2桁）の
 * 最大値を写したもの。
 */
export const ESTIMATE_AMOUNT_MAX = new Decimal('9999999999999.99');

/**
 * 金額の最大値の表示用文字列（金額は整数で表示するため、整数部の最大値を桁区切りで示す）
 */
export const ESTIMATE_AMOUNT_MAX_DISPLAY = '9,999,999,999,999';

/**
 * 金額が上限を超えているかを判定する
 *
 * 未入力（`null` / 空文字）と数値として読めない値は「超えていない」とする
 * （数値以外の入力は 13.1 / 13.2 の所管であり、ここでは上限だけを見る）。
 *
 * 見積書APIは金額を**数値**で返し（`EstimateDetailPage` の `toDecimalPayloadValue` の注記）、
 * 一度も編集していない明細行には数値が残るため、数値も受け付ける。
 */
export function isAmountOverflow(amount: Decimal | string | number | null | undefined): boolean {
  if (amount === null || amount === undefined) {
    return false;
  }
  let value: Decimal;
  if (Decimal.isDecimal(amount)) {
    value = amount;
  } else {
    if (typeof amount === 'string' && amount.trim() === '') {
      return false;
    }
    try {
      value = new Decimal(amount);
    } catch {
      return false;
    }
  }
  if (value.isNaN()) {
    return false;
  }
  // 無限大は上限を超えたものとして扱う
  return !value.isFinite() || value.abs().greaterThan(ESTIMATE_AMOUNT_MAX);
}

/** 上限の判定に必要な明細の形（編集フックの階層・ドメイン層の編集項目のいずれも満たす） */
export interface AmountLimitItemLike {
  readonly itemType?: string;
  readonly lines: readonly { readonly amount: string | number | null }[];
  readonly children: readonly AmountLimitItemLike[];
}

/**
 * 明細ツリーのうち、金額が上限を超えている金額行の件数を数える
 *
 * 親項目の集計金額も数える（親の金額も保存時に永続化されるため）。注記行は金額を持たない（55.1）。
 * 階層の深さに上限を設けないため、明示スタックで走査する（2.5）。
 */
export function countOverflowingAmountLines(items: readonly AmountLimitItemLike[]): number {
  let count = 0;
  const stack: AmountLimitItemLike[] = [...items];
  while (stack.length > 0) {
    const item = stack.pop()!;
    if (item.itemType !== 'NOTE') {
      for (const line of item.lines) {
        if (isAmountOverflow(line.amount)) {
          count += 1;
        }
      }
    }
    for (const child of item.children) {
      stack.push(child);
    }
  }
  return count;
}
