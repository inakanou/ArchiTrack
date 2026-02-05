/**
 * @fileoverview EstimateCalculator（クライアントサイド計算モジュール）のユニットテスト
 *
 * TDD: テストファースト
 *
 * Requirements (estimate-creation):
 * - REQ-1.3: 金額フィールドを単価と数量の積として自動計算する
 * - REQ-2.3: 子項目を持つ場合、親項目の金額として子項目の金額合計を自動計算して表示する
 * - REQ-13.6: 高精度な10進数計算により丸め誤差を最小化する
 *
 * Task 7.1: EstimateCalculator（クライアントサイド計算モジュール）の実装
 *
 * @module utils/estimate-calculation.test
 */

import { describe, it, expect } from 'vitest';
import {
  EstimateCalculator,
  type VendorLineInfo,
  type ExecutionLineInfo,
  type EstimateItemWithLines,
  type EstimateItemHierarchy,
} from './estimate-calculation';
import Decimal from 'decimal.js';

describe('EstimateCalculator', () => {
  describe('calculateAmount', () => {
    it('数量と単価から金額を計算する', () => {
      const result = EstimateCalculator.calculateAmount('10', '1500');
      expect(result).not.toBeNull();
      expect(result!.toString()).toBe('15000');
    });

    it('小数点を含む計算で精度を維持する（REQ-13.6）', () => {
      // 0.1 + 0.2 = 0.3 のような精度問題を回避
      const result = EstimateCalculator.calculateAmount('3', '0.1');
      expect(result).not.toBeNull();
      expect(result!.toString()).toBe('0.3');
    });

    it('大きな数値でも精度を維持する（REQ-13.6）', () => {
      const result = EstimateCalculator.calculateAmount('1234567.89', '9876543.21');
      expect(result).not.toBeNull();
      // Decimal.jsによる高精度計算 (1234567.89 * 9876543.21 = 12193263111263.5269 -> 12193263111263.53)
      expect(result!.toDecimalPlaces(2).toString()).toBe('12193263111263.53');
    });

    it('数量がnullの場合はnullを返す', () => {
      const result = EstimateCalculator.calculateAmount(null, '1500');
      expect(result).toBeNull();
    });

    it('単価がnullの場合はnullを返す', () => {
      const result = EstimateCalculator.calculateAmount('10', null);
      expect(result).toBeNull();
    });

    it('両方nullの場合はnullを返す', () => {
      const result = EstimateCalculator.calculateAmount(null, null);
      expect(result).toBeNull();
    });

    it('空文字の場合もnullを返す', () => {
      const result = EstimateCalculator.calculateAmount('', '1500');
      expect(result).toBeNull();
    });

    it('結果を小数点以下2桁で丸める（四捨五入）', () => {
      const result = EstimateCalculator.calculateAmount('3', '1.005');
      expect(result).not.toBeNull();
      // 3 * 1.005 = 3.015 -> 3.02（四捨五入）
      expect(result!.toString()).toBe('3.02');
    });

    it('マイナスの値も計算できる', () => {
      const result = EstimateCalculator.calculateAmount('-10', '1500');
      expect(result).not.toBeNull();
      expect(result!.toString()).toBe('-15000');
    });
  });

  describe('calculateSubtotal', () => {
    it('見積項目配列から見積金額行の合計を計算する（REQ-1.5）', () => {
      const items: EstimateItemWithLines[] = [
        {
          id: 'item-1',
          lines: [{ lineType: 'ESTIMATE', amount: '10000' }],
        },
        {
          id: 'item-2',
          lines: [{ lineType: 'ESTIMATE', amount: '20000' }],
        },
        {
          id: 'item-3',
          lines: [{ lineType: 'ESTIMATE', amount: '30000' }],
        },
      ];

      const result = EstimateCalculator.calculateSubtotal(items);
      expect(result.toString()).toBe('60000');
    });

    it('空配列の場合は0を返す', () => {
      const result = EstimateCalculator.calculateSubtotal([]);
      expect(result.toString()).toBe('0');
    });

    it('小数点を含む合計計算で精度を維持する（REQ-13.6）', () => {
      const items: EstimateItemWithLines[] = [
        { id: 'item-1', lines: [{ lineType: 'ESTIMATE', amount: '0.1' }] },
        { id: 'item-2', lines: [{ lineType: 'ESTIMATE', amount: '0.2' }] },
        { id: 'item-3', lines: [{ lineType: 'ESTIMATE', amount: '0.3' }] },
      ];

      const result = EstimateCalculator.calculateSubtotal(items);
      expect(result.toString()).toBe('0.6');
    });

    it('amountがnullの項目は0として扱う', () => {
      const items: EstimateItemWithLines[] = [
        { id: 'item-1', lines: [{ lineType: 'ESTIMATE', amount: '10000' }] },
        { id: 'item-2', lines: [{ lineType: 'ESTIMATE', amount: null }] },
      ];

      const result = EstimateCalculator.calculateSubtotal(items);
      expect(result.toString()).toBe('10000');
    });

    it('ESTIMATE以外の行タイプは無視する', () => {
      const items: EstimateItemWithLines[] = [
        {
          id: 'item-1',
          lines: [
            { lineType: 'ESTIMATE', amount: '10000' },
            { lineType: 'EXECUTION', amount: '8000' },
            { lineType: 'VENDOR', amount: '5000' },
          ],
        },
      ];

      const result = EstimateCalculator.calculateSubtotal(items);
      expect(result.toString()).toBe('10000');
    });
  });

  describe('calculateHierarchyAmounts', () => {
    it('子項目の金額合計を親項目の金額として計算する（REQ-2.3）', () => {
      const hierarchy: EstimateItemHierarchy[] = [
        {
          id: 'parent-1',
          lines: [
            { lineType: 'ESTIMATE', amount: null },
            { lineType: 'EXECUTION', amount: null },
            { lineType: 'VENDOR', amount: null },
          ],
          children: [
            {
              id: 'child-1',
              lines: [{ lineType: 'ESTIMATE', amount: '10000' }],
              children: [],
            },
            {
              id: 'child-2',
              lines: [{ lineType: 'ESTIMATE', amount: '20000' }],
              children: [],
            },
          ],
        },
      ];

      const result = EstimateCalculator.calculateHierarchyAmounts(hierarchy);

      // 親項目の金額が子項目の合計になっている
      const parentEstimateLine = result[0]!.lines.find((l) => l.lineType === 'ESTIMATE');
      expect(parentEstimateLine?.amount?.toString()).toBe('30000');
    });

    it('複数階層のネストを処理する（REQ-2.4）', () => {
      const hierarchy: EstimateItemHierarchy[] = [
        {
          id: 'grandparent',
          lines: [{ lineType: 'ESTIMATE', amount: null }],
          children: [
            {
              id: 'parent-1',
              lines: [{ lineType: 'ESTIMATE', amount: null }],
              children: [
                {
                  id: 'child-1',
                  lines: [{ lineType: 'ESTIMATE', amount: '5000' }],
                  children: [],
                },
                {
                  id: 'child-2',
                  lines: [{ lineType: 'ESTIMATE', amount: '5000' }],
                  children: [],
                },
              ],
            },
            {
              id: 'parent-2',
              lines: [{ lineType: 'ESTIMATE', amount: '10000' }],
              children: [],
            },
          ],
        },
      ];

      const result = EstimateCalculator.calculateHierarchyAmounts(hierarchy);

      // grandparent = parent-1 (10000) + parent-2 (10000) = 20000
      const grandparentLine = result[0]!.lines.find((l) => l.lineType === 'ESTIMATE');
      expect(grandparentLine?.amount?.toString()).toBe('20000');
    });

    it('子項目がない場合は元の金額を維持する', () => {
      const hierarchy: EstimateItemHierarchy[] = [
        {
          id: 'item-1',
          lines: [{ lineType: 'ESTIMATE', amount: '15000' }],
          children: [],
        },
      ];

      const result = EstimateCalculator.calculateHierarchyAmounts(hierarchy);

      const estimateLine = result[0]!.lines.find((l) => l.lineType === 'ESTIMATE');
      expect(estimateLine?.amount?.toString()).toBe('15000');
    });

    it('空の階層配列に対応する', () => {
      const result = EstimateCalculator.calculateHierarchyAmounts([]);
      expect(result).toHaveLength(0);
    });
  });

  describe('previewNetAllocation (NET金額案分プレビュー計算)', () => {
    it('NET金額を業者金額行の比率で案分する', () => {
      const vendorLines: VendorLineInfo[] = [
        { id: 'line-1', amount: '30000' },
        { id: 'line-2', amount: '20000' },
        { id: 'line-3', amount: '50000' },
      ];
      const netAmount = '80000';

      const result = EstimateCalculator.previewNetAllocation(vendorLines, [], netAmount);

      // 合計100000に対して、80000を案分
      // line-1: 30000 / 100000 * 80000 = 24000
      // line-2: 20000 / 100000 * 80000 = 16000
      // line-3: 50000 / 100000 * 80000 = 40000
      expect(result).toHaveLength(3);
      expect(result[0]!.allocatedAmount).toBe('24000');
      expect(result[1]!.allocatedAmount).toBe('16000');
      expect(result[2]!.allocatedAmount).toBe('40000');
    });

    it('除外IDに指定された行を案分から除外する', () => {
      const vendorLines: VendorLineInfo[] = [
        { id: 'line-1', amount: '30000' },
        { id: 'line-2', amount: '20000' }, // 除外
        { id: 'line-3', amount: '50000' },
      ];
      const excludeIds = ['line-2'];
      const netAmount = '80000';

      const result = EstimateCalculator.previewNetAllocation(vendorLines, excludeIds, netAmount);

      // line-2を除外、残りで案分
      // line-1: 30000 / 80000 * 80000 = 30000
      // line-3: 50000 / 80000 * 80000 = 50000
      expect(result).toHaveLength(2);
      expect(result[0]!.lineId).toBe('line-1');
      expect(result[0]!.allocatedAmount).toBe('30000');
      expect(result[1]!.lineId).toBe('line-3');
      expect(result[1]!.allocatedAmount).toBe('50000');
    });

    it('案分率（%）を正確に計算する', () => {
      const vendorLines: VendorLineInfo[] = [
        { id: 'line-1', amount: '25000' },
        { id: 'line-2', amount: '75000' },
      ];
      const netAmount = '100000';

      const result = EstimateCalculator.previewNetAllocation(vendorLines, [], netAmount);

      expect(result[0]!.ratio).toBe('25%');
      expect(result[1]!.ratio).toBe('75%');
    });

    it('合計が0の場合は全て0で返す', () => {
      const vendorLines: VendorLineInfo[] = [
        { id: 'line-1', amount: '0' },
        { id: 'line-2', amount: '0' },
      ];
      const netAmount = '80000';

      const result = EstimateCalculator.previewNetAllocation(vendorLines, [], netAmount);

      expect(result).toHaveLength(2);
      expect(result[0]!.allocatedAmount).toBe('0');
      expect(result[1]!.allocatedAmount).toBe('0');
    });

    it('端数処理を適切に行う', () => {
      const vendorLines: VendorLineInfo[] = [
        { id: 'line-1', amount: '10000' },
        { id: 'line-2', amount: '10000' },
        { id: 'line-3', amount: '10000' },
      ];
      const netAmount = '10000'; // 3で割り切れない

      const result = EstimateCalculator.previewNetAllocation(vendorLines, [], netAmount);

      // 各行は約3333.33
      expect(result).toHaveLength(3);
      // 各行の案分後金額を合計すると元のNET金額に近いことを確認
      const total = result.reduce(
        (sum, r) => sum.add(new Decimal(r.allocatedAmount)),
        new Decimal(0)
      );
      expect(total.toNumber()).toBeCloseTo(10000, 0);
    });

    it('nullの金額は0として扱う', () => {
      const vendorLines: VendorLineInfo[] = [
        { id: 'line-1', amount: '50000' },
        { id: 'line-2', amount: null },
      ];
      const netAmount = '100000';

      const result = EstimateCalculator.previewNetAllocation(vendorLines, [], netAmount);

      expect(result).toHaveLength(2);
      expect(result[0]!.allocatedAmount).toBe('100000');
      expect(result[1]!.allocatedAmount).toBe('0');
    });
  });

  describe('previewProfitRate (利益率適用プレビュー計算)', () => {
    it('利益率を適用した単価を計算する', () => {
      const executionLines: ExecutionLineInfo[] = [
        { lineId: 'line-1', unitPrice: '1000' },
        { lineId: 'line-2', unitPrice: '2000' },
      ];
      const profitRate = '10'; // 10%

      const result = EstimateCalculator.previewProfitRate(executionLines, profitRate);

      // 10%利益率 = 単価 * 1.10
      expect(result).toHaveLength(2);
      expect(result[0]!.newUnitPrice).toBe('1100');
      expect(result[1]!.newUnitPrice).toBe('2200');
    });

    it('0%の利益率でも正しく計算する', () => {
      const executionLines: ExecutionLineInfo[] = [{ lineId: 'line-1', unitPrice: '1000' }];
      const profitRate = '0';

      const result = EstimateCalculator.previewProfitRate(executionLines, profitRate);

      expect(result[0]!.newUnitPrice).toBe('1000');
    });

    it('大きな利益率でも正しく計算する（500%上限）', () => {
      const executionLines: ExecutionLineInfo[] = [{ lineId: 'line-1', unitPrice: '1000' }];
      const profitRate = '100'; // 100%

      const result = EstimateCalculator.previewProfitRate(executionLines, profitRate);

      expect(result[0]!.newUnitPrice).toBe('2000');
    });

    it('小数点以下2桁で丸める', () => {
      const executionLines: ExecutionLineInfo[] = [{ lineId: 'line-1', unitPrice: '1000' }];
      const profitRate = '33.333'; // 33.333%

      const result = EstimateCalculator.previewProfitRate(executionLines, profitRate);

      // 1000 * 1.33333 = 1333.33
      expect(result[0]!.newUnitPrice).toBe('1333.33');
    });

    it('単価がnullの場合はnullを返す', () => {
      const executionLines: ExecutionLineInfo[] = [{ lineId: 'line-1', unitPrice: null }];
      const profitRate = '10';

      const result = EstimateCalculator.previewProfitRate(executionLines, profitRate);

      expect(result[0]!.originalUnitPrice).toBeNull();
      expect(result[0]!.newUnitPrice).toBeNull();
    });

    it('空文字の単価はnullとして扱う', () => {
      const executionLines: ExecutionLineInfo[] = [{ lineId: 'line-1', unitPrice: '' }];
      const profitRate = '10';

      const result = EstimateCalculator.previewProfitRate(executionLines, profitRate);

      expect(result[0]!.newUnitPrice).toBeNull();
    });

    it('元の単価を保持する', () => {
      const executionLines: ExecutionLineInfo[] = [{ lineId: 'line-1', unitPrice: '1000' }];
      const profitRate = '10';

      const result = EstimateCalculator.previewProfitRate(executionLines, profitRate);

      expect(result[0]!.originalUnitPrice).toBe('1000');
    });
  });

  describe('validateProfitRate (利益率バリデーション)', () => {
    it('有効な利益率（0.00〜500.00）を受け入れる', () => {
      expect(EstimateCalculator.validateProfitRate('0')).toBe(true);
      expect(EstimateCalculator.validateProfitRate('10')).toBe(true);
      expect(EstimateCalculator.validateProfitRate('100')).toBe(true);
      expect(EstimateCalculator.validateProfitRate('500')).toBe(true);
    });

    it('小数点を含む有効な利益率を受け入れる', () => {
      expect(EstimateCalculator.validateProfitRate('0.01')).toBe(true);
      expect(EstimateCalculator.validateProfitRate('25.5')).toBe(true);
      expect(EstimateCalculator.validateProfitRate('499.99')).toBe(true);
    });

    it('範囲外の利益率を拒否する', () => {
      expect(EstimateCalculator.validateProfitRate('-1')).toBe(false);
      expect(EstimateCalculator.validateProfitRate('500.01')).toBe(false);
      expect(EstimateCalculator.validateProfitRate('1000')).toBe(false);
    });

    it('数値以外の入力を拒否する', () => {
      expect(EstimateCalculator.validateProfitRate('abc')).toBe(false);
      expect(EstimateCalculator.validateProfitRate('')).toBe(false);
    });
  });
});
