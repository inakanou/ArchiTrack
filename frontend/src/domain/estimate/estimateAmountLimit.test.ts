/**
 * @fileoverview estimateAmountLimit の単体テスト
 *
 * 金額の上限（`backend/src/schemas/estimate.schema.ts` の `AMOUNT_DECIMAL_PATTERN`
 * ＝整数部13桁・小数部2桁）を超えたかの判定と、明細ツリーの上限超過の数え上げを検証する。
 * 境界値（9999999999999.99 は上限内、10000000000000 は超過）は backend の保存スキーマの
 * 単体テスト（`backend/src/__tests__/unit/schemas/estimate.schema.test.ts`）と同じ値で固定する。
 *
 * Requirements (estimate-creation):
 * - 13.5: 金額計算結果が数値の最大値を超えた場合にオーバーフロー警告を表示する
 *
 * @module domain/estimate/estimateAmountLimit.test
 */

import Decimal from 'decimal.js';
import { describe, it, expect } from 'vitest';

import {
  ESTIMATE_AMOUNT_MAX,
  ESTIMATE_AMOUNT_MAX_DISPLAY,
  countOverflowingAmountLines,
  isAmountOverflow,
  type AmountLimitItemLike,
} from './estimateAmountLimit';

const item = (
  amounts: (string | number | null)[],
  children: AmountLimitItemLike[] = [],
  itemType?: string
): AmountLimitItemLike => ({
  itemType,
  lines: amounts.map((amount) => ({ amount })),
  children,
});

describe('estimateAmountLimit', () => {
  describe('上限値', () => {
    it('保存スキーマの上限（整数部13桁・小数部2桁）と一致する', () => {
      expect(ESTIMATE_AMOUNT_MAX.toString()).toBe('9999999999999.99');
      expect(ESTIMATE_AMOUNT_MAX_DISPLAY).toBe('9,999,999,999,999');
    });
  });

  describe('isAmountOverflow (13.5)', () => {
    /**
     * @requirement estimate-creation/REQ-13.5 金額計算結果が数値の最大値を超えた場合にオーバーフロー警告を表示する
     */
    it('上限を超えた金額を上限超過と判定する', () => {
      expect(isAmountOverflow('10000000000000')).toBe(true);
      expect(isAmountOverflow('9999999999999.991')).toBe(true);
      expect(isAmountOverflow(new Decimal('1e+24'))).toBe(true);
      expect(isAmountOverflow('1e+24')).toBe(true);
    });

    it('APIが返す数値の金額も判定する', () => {
      expect(isAmountOverflow(12000000000000)).toBe(true);
      expect(isAmountOverflow(-12000000000000)).toBe(true);
      expect(isAmountOverflow(6000000000000)).toBe(false);
      expect(isAmountOverflow(Number.NaN)).toBe(false);
      expect(isAmountOverflow(Number.POSITIVE_INFINITY)).toBe(true);
    });

    it('負数（値引き行）は絶対値で判定する', () => {
      expect(isAmountOverflow('-10000000000000')).toBe(true);
      expect(isAmountOverflow('-9999999999999.99')).toBe(false);
    });

    it('上限ちょうどまでは上限超過としない', () => {
      expect(isAmountOverflow('9999999999999.99')).toBe(false);
      expect(isAmountOverflow('9999999999999')).toBe(false);
      expect(isAmountOverflow(new Decimal(0))).toBe(false);
    });

    it('未入力・数値として読めない値は上限超過としない', () => {
      expect(isAmountOverflow(null)).toBe(false);
      expect(isAmountOverflow(undefined)).toBe(false);
      expect(isAmountOverflow('')).toBe(false);
      expect(isAmountOverflow('abc')).toBe(false);
    });
  });

  describe('countOverflowingAmountLines (13.5)', () => {
    /**
     * @requirement estimate-creation/REQ-13.5 親の集計金額を含む金額計算結果の上限超過を数える
     */
    it('葉と親（子の合計）の金額行のうち上限を超えたものを数える', () => {
      const tree = [
        item(
          ['12000000000000', '1000', '1000'],
          [item(['6000000000000', '500', '500']), item(['6000000000000', '500', '500'])]
        ),
        item(['100', '100', '100']),
      ];
      expect(countOverflowingAmountLines(tree)).toBe(1);
    });

    it('深い階層の上限超過も数える（深さに上限を設けない）', () => {
      let node = item(['20000000000000']);
      for (let depth = 0; depth < 50; depth++) {
        node = item(['1'], [node]);
      }
      expect(countOverflowingAmountLines([node])).toBe(1);
    });

    it('APIが返す数値の金額（未編集の明細行）も数える', () => {
      expect(countOverflowingAmountLines([item([12000000000000, 100, 100])])).toBe(1);
    });

    it('上限を超えた金額が無ければ 0 を返す', () => {
      expect(countOverflowingAmountLines([item(['9999999999999', null, '1'])])).toBe(0);
      expect(countOverflowingAmountLines([])).toBe(0);
    });

    it('注記行は数えない', () => {
      expect(countOverflowingAmountLines([item(['20000000000000'], [], 'NOTE')])).toBe(0);
    });
  });
});
