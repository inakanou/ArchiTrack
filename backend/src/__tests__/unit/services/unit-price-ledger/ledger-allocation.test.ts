/**
 * @fileoverview 按分の計算（LedgerAllocation）の単体試験（unit-price-ledger タスク2.1）
 *
 * 候補の行の単価（換算の単価 → 単価 → 金額÷数量）、按分の基準（直接工事＋産廃）、
 * 諸経費と値引きの率、内訳、丸め（ROUND_HALF_UP：0 から遠い側）、按分できない印・反映できない印を確かめる。
 */
import { describe, it, expect } from 'vitest';
import Decimal from 'decimal.js';
import { Prisma } from '../../../../generated/prisma/client.js';
import {
  computeAllocation,
  type AllocationLine,
  type CategoryTotals,
} from '../../../../services/unit-price-ledger/ledger-allocation.js';

const line = (overrides: Partial<AllocationLine> = {}): AllocationLine => ({
  conversionUnitPrice: null,
  unitPrice: null,
  amount: null,
  quantity: null,
  ...overrides,
});

/** 基準 120000（直接工事 100000＋産廃 20000）、諸経費の計 15000、値引き -6000 */
const standardTotals: CategoryTotals = {
  DIRECT: '100000',
  WASTE: '20000',
  OVERHEAD: '10000',
  TRAVEL: '2000',
  LEGAL_WELFARE: '3000',
  DISCOUNT: '-6000',
};

describe('computeAllocation', () => {
  describe('按分の例', () => {
    /**
     * @requirement unit-price-ledger/REQ-8.2
     * @requirement unit-price-ledger/REQ-8.3
     * @requirement unit-price-ledger/REQ-8.4
     * @requirement unit-price-ledger/REQ-8.5
     */
    it('諸経費（諸経費＋交通費＋法定福利費）と値引きを、直接工事と産廃の金額の合計を基準に按分する', () => {
      // 諸経費の率 = 15000 / 120000 = 0.125、値引きの率 = -6000 / 120000 = -0.05
      // 諸経費の按分 = 1234 × 0.125 = 154.25 → 154、値引きの按分 = 1234 × -0.05 = -61.7 → -62
      // 反映する単価 = 1234 + 154.25 - 61.7 = 1326.55 → 1327（丸めた値の和 1326 ではない）
      const result = computeAllocation(line({ unitPrice: '1234' }), standardTotals);

      expect(result).toEqual({
        unitPrice: '1234',
        overheadAllocation: '154',
        discountAllocation: '-62',
        appliedUnitPrice: '1327',
        allocatable: true,
        applicable: true,
      });
    });

    /**
     * @requirement unit-price-ledger/REQ-8.3
     */
    it('別途の明細行の金額は按分に使わない', () => {
      const withExcluded = computeAllocation(line({ unitPrice: '1234' }), {
        ...standardTotals,
        EXCLUDED: '999999',
      });
      const withoutExcluded = computeAllocation(line({ unitPrice: '1234' }), standardTotals);

      expect(withExcluded).toEqual(withoutExcluded);
    });

    /**
     * @requirement unit-price-ledger/REQ-8.2
     * @requirement unit-price-ledger/REQ-8.3
     */
    it('合計に無い区分は 0 として扱う', () => {
      // 基準 = 50000（直接工事だけ）、諸経費の率 = 5000 / 50000 = 0.1、値引きは無い
      const result = computeAllocation(line({ unitPrice: '2000' }), {
        DIRECT: '50000',
        OVERHEAD: '5000',
      });

      expect(result).toEqual({
        unitPrice: '2000',
        overheadAllocation: '200',
        discountAllocation: '0',
        appliedUnitPrice: '2200',
        allocatable: true,
        applicable: true,
      });
    });

    /**
     * @requirement unit-price-ledger/REQ-8.4
     */
    it('Decimal と数の値を受け取れる', () => {
      const result = computeAllocation(line({ unitPrice: new Decimal('1234') }), {
        DIRECT: new Decimal('100000'),
        WASTE: 20000,
        OVERHEAD: new Decimal('10000'),
        TRAVEL: 2000,
        LEGAL_WELFARE: '3000',
        DISCOUNT: -6000,
      });

      expect(result.appliedUnitPrice).toBe('1327');
    });

    /**
     * @requirement unit-price-ledger/REQ-8.1
     */
    it('明細行の Prisma の Decimal の値を受け取れる', () => {
      const result = computeAllocation(
        line({
          conversionUnitPrice: null,
          unitPrice: null,
          amount: new Prisma.Decimal('10000.00'),
          quantity: new Prisma.Decimal('3.0000'),
        }),
        { ...standardTotals, DIRECT: new Prisma.Decimal('100000.00') }
      );

      expect(result.unitPrice).toBe('3333');
      expect(result.appliedUnitPrice).toBe('3583');
    });
  });

  describe('按分の基準が 0 以下', () => {
    /**
     * @requirement unit-price-ledger/REQ-8.6
     */
    it('基準が 0 なら、諸経費と値引きの按分を 0 とし、按分できない印を返す', () => {
      const result = computeAllocation(line({ unitPrice: '1500' }), {
        DIRECT: '0',
        WASTE: '0',
        OVERHEAD: '10000',
        DISCOUNT: '-3000',
      });

      expect(result).toEqual({
        unitPrice: '1500',
        overheadAllocation: '0',
        discountAllocation: '0',
        appliedUnitPrice: '1500',
        allocatable: false,
        applicable: true,
      });
    });

    /**
     * @requirement unit-price-ledger/REQ-8.6
     */
    it('基準が負でも按分できない印を返す', () => {
      const result = computeAllocation(line({ unitPrice: '1500' }), {
        DIRECT: '1000',
        WASTE: '-2000',
        OVERHEAD: '10000',
      });

      expect(result.allocatable).toBe(false);
      expect(result.overheadAllocation).toBe('0');
      expect(result.discountAllocation).toBe('0');
      expect(result.appliedUnitPrice).toBe('1500');
    });

    /**
     * @requirement unit-price-ledger/REQ-8.6
     */
    it('合計が 1 つも無いときも按分できない印を返す', () => {
      const result = computeAllocation(line({ unitPrice: '1500' }), {});

      expect(result.allocatable).toBe(false);
      expect(result.appliedUnitPrice).toBe('1500');
    });
  });

  describe('反映する単価が負', () => {
    /**
     * @requirement unit-price-ledger/REQ-8.7
     */
    it('反映する単価が 0 より小さければ、反映できない印を返し、内訳はそのまま返す', () => {
      // 値引きの率 = -150000 / 100000 = -1.5、値引きの按分 = 1000 × -1.5 = -1500、反映する単価 = -500
      const result = computeAllocation(line({ unitPrice: '1000' }), {
        DIRECT: '100000',
        DISCOUNT: '-150000',
      });

      expect(result).toEqual({
        unitPrice: '1000',
        overheadAllocation: '0',
        discountAllocation: '-1500',
        appliedUnitPrice: '-500',
        allocatable: true,
        applicable: false,
      });
    });

    /**
     * @requirement unit-price-ledger/REQ-8.7
     */
    it('反映する単価がちょうど 0 なら反映できる', () => {
      const result = computeAllocation(line({ unitPrice: '1000' }), {
        DIRECT: '100000',
        DISCOUNT: '-100000',
      });

      expect(result.appliedUnitPrice).toBe('0');
      expect(result.applicable).toBe(true);
    });

    /**
     * @requirement unit-price-ledger/REQ-8.5
     * @requirement unit-price-ledger/REQ-8.7
     */
    it('反映できるかは丸めた後の反映する単価で決め、-0 は "0" で返す', () => {
      // 値引きの率 = -100400 / 100000 = -1.004、値引きの按分 = 100 × -1.004 = -100.4 → -100
      // 反映する単価 = 100 - 100.4 = -0.4 → 丸めると 0（"-0" ではなく "0"）で、0 より小さくない
      const result = computeAllocation(line({ unitPrice: '100' }), {
        DIRECT: '100000',
        DISCOUNT: '-100400',
      });

      expect(result.appliedUnitPrice).toBe('0');
      expect(result.discountAllocation).toBe('-100');
      expect(result.applicable).toBe(true);
    });

    /**
     * @requirement unit-price-ledger/REQ-8.5
     * @requirement unit-price-ledger/REQ-8.7
     */
    it('丸めた反映する単価が -1 なら反映できない', () => {
      // 反映する単価 = 100 - 100.5 = -0.5 → -1（0 から遠い側）
      const result = computeAllocation(line({ unitPrice: '100' }), {
        DIRECT: '100000',
        DISCOUNT: '-100500',
      });

      expect(result.appliedUnitPrice).toBe('-1');
      expect(result.applicable).toBe(false);
    });
  });

  describe('候補の行の単価', () => {
    /**
     * @requirement unit-price-ledger/REQ-8.1
     */
    it('換算のある行は、単価があっても換算の単価を使う', () => {
      // 諸経費の率 0.125、値引きの率 -0.05：500 → 62.5 → 63、-25、反映 537.5 → 538
      const result = computeAllocation(
        line({ conversionUnitPrice: '500', unitPrice: '2000', amount: '20000', quantity: '10' }),
        standardTotals
      );

      expect(result).toEqual({
        unitPrice: '500',
        overheadAllocation: '63',
        discountAllocation: '-25',
        appliedUnitPrice: '538',
        allocatable: true,
        applicable: true,
      });
    });

    /**
     * @requirement unit-price-ledger/REQ-8.1
     */
    it('換算の無い行は、金額÷数量ではなく単価を使う', () => {
      const result = computeAllocation(
        line({ unitPrice: '2000', amount: '99999', quantity: '10' }),
        { DIRECT: '100000' }
      );

      expect(result.unitPrice).toBe('2000');
      expect(result.appliedUnitPrice).toBe('2000');
    });

    /**
     * @requirement unit-price-ledger/REQ-8.1
     * @requirement unit-price-ledger/REQ-8.4
     * @requirement unit-price-ledger/REQ-8.5
     */
    it('単価が空の行は、金額÷数量を単価とし、丸める前の値で按分する', () => {
      // 単価 = 10000 / 3 = 3333.333… → 3333
      // 諸経費の按分 = 3333.333… × 0.125 = 416.666… → 417
      // 値引きの按分 = 3333.333… × -0.05 = -166.666… → -167
      // 反映する単価 = 3333.333… × 1.075 = 3583.333… → 3583
      const result = computeAllocation(line({ amount: '10000', quantity: '3' }), standardTotals);

      expect(result).toEqual({
        unitPrice: '3333',
        overheadAllocation: '417',
        discountAllocation: '-167',
        appliedUnitPrice: '3583',
        allocatable: true,
        applicable: true,
      });
    });

    /**
     * @requirement unit-price-ledger/REQ-8.1
     * @requirement unit-price-ledger/REQ-8.5
     */
    it('金額÷数量がちょうど .5 なら 0 から遠い側に丸める', () => {
      const result = computeAllocation(line({ amount: '1001', quantity: '2' }), {
        DIRECT: '100000',
      });

      expect(result.unitPrice).toBe('501');
    });

    /**
     * @requirement unit-price-ledger/REQ-8.1
     */
    it('単価・金額・数量が求められない行は、0 とし、按分できない印と反映できない印を返す', () => {
      const expected = {
        unitPrice: '0',
        overheadAllocation: '0',
        discountAllocation: '0',
        appliedUnitPrice: '0',
        allocatable: false,
        applicable: false,
      };

      expect(computeAllocation(line({ amount: '1000', quantity: null }), standardTotals)).toEqual(
        expected
      );
      expect(computeAllocation(line({ amount: '1000', quantity: '0' }), standardTotals)).toEqual(
        expected
      );
      expect(computeAllocation(line({ amount: null, quantity: '5' }), standardTotals)).toEqual(
        expected
      );
    });
  });

  describe('負の値の丸め', () => {
    /**
     * @requirement unit-price-ledger/REQ-8.5
     */
    it('値引きの按分がちょうど -0.5 なら -1 に丸める（0 から遠い側）', () => {
      // 値引きの率 = -50 / 100000 = -0.0005、値引きの按分 = 1000 × -0.0005 = -0.5 → -1
      const result = computeAllocation(line({ unitPrice: '1000' }), {
        DIRECT: '100000',
        DISCOUNT: '-50',
      });

      expect(result.discountAllocation).toBe('-1');
      // 反映する単価 = 999.5 → 1000
      expect(result.appliedUnitPrice).toBe('1000');
    });

    /**
     * @requirement unit-price-ledger/REQ-8.5
     */
    it('-566.5 は -567 に丸める', () => {
      // 値引きの率 = -50000 / 100000 = -0.5、値引きの按分 = 1133 × -0.5 = -566.5 → -567
      // 反映する単価 = 566.5 → 567
      const result = computeAllocation(line({ unitPrice: '1133' }), {
        DIRECT: '100000',
        DISCOUNT: '-50000',
      });

      expect(result.discountAllocation).toBe('-567');
      expect(result.appliedUnitPrice).toBe('567');
    });

    /**
     * @requirement unit-price-ledger/REQ-8.5
     */
    it('-0.4 の按分は "-0" ではなく "0" で返す', () => {
      // 値引きの率 = -40 / 100000 = -0.0004、値引きの按分 = 1000 × -0.0004 = -0.4 → 0
      const result = computeAllocation(line({ unitPrice: '1000' }), {
        DIRECT: '100000',
        DISCOUNT: '-40',
      });

      expect(result.discountAllocation).toBe('0');
    });

    /**
     * @requirement unit-price-ledger/REQ-8.5
     */
    it('負の単価（値引きの性格の直接工事の行）も 0 から遠い側に丸める', () => {
      const result = computeAllocation(line({ amount: '-1001', quantity: '2' }), {
        DIRECT: '100000',
      });

      expect(result.unitPrice).toBe('-501');
      expect(result.appliedUnitPrice).toBe('-501');
      expect(result.applicable).toBe(false);
    });
  });
});
