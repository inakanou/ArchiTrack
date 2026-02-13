/**
 * @fileoverview 見積計算サービスのユニットテスト
 *
 * Requirements (estimate-creation):
 * - REQ-1.3: 金額フィールドを単価と数量の積として自動計算する
 * - REQ-2.3: 子項目を持つ場合、親項目の金額として子項目の金額合計を自動計算して表示する
 * - REQ-5.1: 業者と対象の業者金額行を指定し、案分対象として選択状態にする
 * - REQ-5.2: 案分から除外する諸経費行を指定した場合、案分対象から除外する
 * - REQ-5.3: NET金額を入力した場合、除外された諸経費行以外を実行金額行に転記する
 * - REQ-5.4: NET金額が入力された場合、各実行金額行の単価をNET金額に基づいて案分計算する
 * - REQ-5.5: 案分計算が実行された場合、案分後の金額を自動計算して表示する
 * - REQ-6.1: 利益率を指定した場合、全実行金額行に対して利益率を適用した単価を計算する
 * - REQ-6.2: 「すべて上書き」オプションを選択した場合、名称・規格・単位・数量・単価を上書きする
 * - REQ-6.3: 「空の場合のみ上書き」オプションを選択した場合、空の項目のみ上書きする
 * - REQ-6.4: 「単価のみ上書き」オプションを選択した場合、単価のみを上書きする
 * - REQ-13.6: 高精度な10進数計算により丸め誤差を最小化する
 *
 * Task 3.1: EstimateCalculationServiceの実装（金額計算基盤）
 * Task 3.2: NET金額計算と案分機能の実装
 * Task 3.3: 利益率適用機能の実装
 *
 * @module __tests__/unit/services/estimate-calculation.service
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { EstimateCalculationService } from '../../../services/estimate-calculation.service.js';
import Decimal from 'decimal.js';

describe('EstimateCalculationService', () => {
  let service: EstimateCalculationService;

  beforeEach(() => {
    service = new EstimateCalculationService();
  });

  describe('calculateAmount', () => {
    it('数量と単価から金額を計算する', () => {
      const result = service.calculateAmount('10', '1500');
      expect(result).not.toBeNull();
      expect(result!.toString()).toBe('15000');
    });

    it('REQ-22: 小数点を含む計算結果を整数に丸める', () => {
      // 3 * 0.1 = 0.3 -> 0（小数第1位四捨五入→整数）
      const result = service.calculateAmount('3', '0.1');
      expect(result).not.toBeNull();
      expect(result!.toString()).toBe('0');
    });

    it('REQ-22: 大きな数値でも整数に丸める', () => {
      const result = service.calculateAmount('1234567.89', '9876543.21');
      expect(result).not.toBeNull();
      // Decimal.jsによる高精度計算 (1234567.89 * 9876543.21 = 12193263111263.5269 -> 12193263111264)
      expect(result!.toString()).toBe('12193263111264');
    });

    it('数量がnullの場合はnullを返す', () => {
      const result = service.calculateAmount(null, '1500');
      expect(result).toBeNull();
    });

    it('単価がnullの場合はnullを返す', () => {
      const result = service.calculateAmount('10', null);
      expect(result).toBeNull();
    });

    it('両方nullの場合はnullを返す', () => {
      const result = service.calculateAmount(null, null);
      expect(result).toBeNull();
    });

    it('REQ-22: 結果を小数第1位で四捨五入して整数にする', () => {
      const result = service.calculateAmount('3', '1.005');
      expect(result).not.toBeNull();
      // 3 * 1.005 = 3.015 -> 3（小数第1位四捨五入→整数）
      expect(result!.toString()).toBe('3');
    });

    it('REQ-22: .5は切り上げ（ROUND_HALF_UP）', () => {
      // 1 * 1.5 = 1.5 -> 2
      const result = service.calculateAmount('1', '1.5');
      expect(result).not.toBeNull();
      expect(result!.toString()).toBe('2');
    });

    it('マイナスの値も計算できる', () => {
      const result = service.calculateAmount('-10', '1500');
      expect(result).not.toBeNull();
      expect(result!.toString()).toBe('-15000');
    });
  });

  describe('calculateSubtotal', () => {
    it('金額の合計を計算する', () => {
      const amounts = [new Decimal('10000'), new Decimal('20000'), new Decimal('30000')];
      const result = service.calculateSubtotal(amounts);
      expect(result.toString()).toBe('60000');
    });

    it('空配列の場合は0を返す', () => {
      const result = service.calculateSubtotal([]);
      expect(result.toString()).toBe('0');
    });

    it('小数点を含む合計計算で精度を維持する', () => {
      const amounts = [new Decimal('0.1'), new Decimal('0.2'), new Decimal('0.3')];
      const result = service.calculateSubtotal(amounts);
      expect(result.toString()).toBe('0.6');
    });

    it('マイナスの値を含む合計を計算する', () => {
      const amounts = [new Decimal('10000'), new Decimal('-5000'), new Decimal('20000')];
      const result = service.calculateSubtotal(amounts);
      expect(result.toString()).toBe('25000');
    });
  });

  describe('calculateHierarchyAmounts', () => {
    it('子項目の金額合計を親項目の金額として計算する', () => {
      const hierarchy = [
        {
          id: 'parent-1',
          lines: [{ lineType: 'ESTIMATE' as const, amount: null }],
          children: [
            {
              id: 'child-1',
              lines: [{ lineType: 'ESTIMATE' as const, amount: new Decimal('10000') }],
              children: [],
            },
            {
              id: 'child-2',
              lines: [{ lineType: 'ESTIMATE' as const, amount: new Decimal('20000') }],
              children: [],
            },
          ],
        },
      ];

      const result = service.calculateHierarchyAmounts(hierarchy);

      // 親項目の金額が子項目の合計になっている
      const parentEstimateLine = result[0]!.lines.find((l) => l.lineType === 'ESTIMATE');
      expect(parentEstimateLine?.amount?.toString()).toBe('30000');
    });

    it('複数階層のネストを処理する', () => {
      const hierarchy = [
        {
          id: 'grandparent',
          lines: [{ lineType: 'ESTIMATE' as const, amount: null }],
          children: [
            {
              id: 'parent-1',
              lines: [{ lineType: 'ESTIMATE' as const, amount: null }],
              children: [
                {
                  id: 'child-1',
                  lines: [{ lineType: 'ESTIMATE' as const, amount: new Decimal('5000') }],
                  children: [],
                },
                {
                  id: 'child-2',
                  lines: [{ lineType: 'ESTIMATE' as const, amount: new Decimal('5000') }],
                  children: [],
                },
              ],
            },
            {
              id: 'parent-2',
              lines: [{ lineType: 'ESTIMATE' as const, amount: new Decimal('10000') }],
              children: [],
            },
          ],
        },
      ];

      const result = service.calculateHierarchyAmounts(hierarchy);

      // grandparent = parent-1 (10000) + parent-2 (10000) = 20000
      const grandparentLine = result[0]!.lines.find((l) => l.lineType === 'ESTIMATE');
      expect(grandparentLine?.amount?.toString()).toBe('20000');
    });

    it('子項目がない場合は元の金額を維持する', () => {
      const hierarchy = [
        {
          id: 'item-1',
          lines: [{ lineType: 'ESTIMATE' as const, amount: new Decimal('15000') }],
          children: [],
        },
      ];

      const result = service.calculateHierarchyAmounts(hierarchy);

      const estimateLine = result[0]!.lines.find((l) => l.lineType === 'ESTIMATE');
      expect(estimateLine?.amount?.toString()).toBe('15000');
    });
  });

  describe('previewNetAllocation (NET金額案分プレビュー)', () => {
    it('NET金額を業者金額行の比率で案分する', () => {
      const vendorLines = [
        { id: 'line-1', amount: new Decimal('30000') },
        { id: 'line-2', amount: new Decimal('20000') },
        { id: 'line-3', amount: new Decimal('50000') },
      ];
      const netAmount = '80000';

      const result = service.previewNetAllocation(vendorLines, [], netAmount);

      // 合計100000に対して、80000を案分
      // line-1: 30000 / 100000 * 80000 = 24000
      // line-2: 20000 / 100000 * 80000 = 16000
      // line-3: 50000 / 100000 * 80000 = 40000
      expect(result).toHaveLength(3);
      expect(result[0]!.allocatedAmount.toString()).toBe('24000');
      expect(result[1]!.allocatedAmount.toString()).toBe('16000');
      expect(result[2]!.allocatedAmount.toString()).toBe('40000');
    });

    it('除外IDに指定された行を案分から除外する', () => {
      const vendorLines = [
        { id: 'line-1', amount: new Decimal('30000') },
        { id: 'line-2', amount: new Decimal('20000') }, // 除外
        { id: 'line-3', amount: new Decimal('50000') },
      ];
      const excludeIds = ['line-2'];
      const netAmount = '80000';

      const result = service.previewNetAllocation(vendorLines, excludeIds, netAmount);

      // line-2を除外、残りで案分
      // line-1: 30000 / 80000 * 80000 = 30000
      // line-3: 50000 / 80000 * 80000 = 50000
      expect(result).toHaveLength(2);
      expect(result[0]!.lineId).toBe('line-1');
      expect(result[0]!.allocatedAmount.toString()).toBe('30000');
      expect(result[1]!.lineId).toBe('line-3');
      expect(result[1]!.allocatedAmount.toString()).toBe('50000');
    });

    it('案分率を正確に計算する', () => {
      const vendorLines = [
        { id: 'line-1', amount: new Decimal('33333') },
        { id: 'line-2', amount: new Decimal('33333') },
        { id: 'line-3', amount: new Decimal('33334') },
      ];
      const netAmount = '100000';

      const result = service.previewNetAllocation(vendorLines, [], netAmount);

      // 比率の検証
      expect(result[0]!.ratio).toBeDefined();
      expect(result[1]!.ratio).toBeDefined();
      expect(result[2]!.ratio).toBeDefined();
    });

    it('合計が0の場合は全て0で返す', () => {
      const vendorLines = [
        { id: 'line-1', amount: new Decimal('0') },
        { id: 'line-2', amount: new Decimal('0') },
      ];
      const netAmount = '80000';

      const result = service.previewNetAllocation(vendorLines, [], netAmount);

      expect(result).toHaveLength(2);
      expect(result[0]!.allocatedAmount.toString()).toBe('0');
      expect(result[1]!.allocatedAmount.toString()).toBe('0');
    });

    it('REQ-22: 端数処理は整数に丸める', () => {
      const vendorLines = [
        { id: 'line-1', amount: new Decimal('10000') },
        { id: 'line-2', amount: new Decimal('10000') },
        { id: 'line-3', amount: new Decimal('10000') },
      ];
      const netAmount = '10000'; // 3で割り切れない

      const result = service.previewNetAllocation(vendorLines, [], netAmount);

      // 各行は 10000/3 = 3333.33... -> 3333（整数に丸め）
      // 各行が整数であることを確認
      for (const r of result) {
        expect(r.allocatedAmount.toString()).not.toContain('.');
      }
      // 各行が3333であることを確認
      expect(result[0]!.allocatedAmount.toString()).toBe('3333');
      expect(result[1]!.allocatedAmount.toString()).toBe('3333');
      expect(result[2]!.allocatedAmount.toString()).toBe('3333');
      // 整数丸めのため端数が失われる（9999 vs 10000）
      const total = result.reduce((sum, r) => sum.add(r.allocatedAmount), new Decimal(0));
      expect(total.toNumber()).toBe(9999);
    });
  });

  describe('previewProfitRate (利益率適用プレビュー)', () => {
    it('利益率を適用した単価を計算する', () => {
      const executionLines = [
        { lineId: 'line-1', unitPrice: new Decimal('1000') },
        { lineId: 'line-2', unitPrice: new Decimal('2000') },
      ];
      const profitRate = '10'; // 10%

      const result = service.previewProfitRate(executionLines, profitRate);

      // 10%利益率 = 単価 * 1.10
      expect(result).toHaveLength(2);
      const first = result[0];
      const second = result[1];
      expect(first).toBeDefined();
      expect(second).toBeDefined();
      expect(first!.newUnitPrice!.toString()).toBe('1100');
      expect(second!.newUnitPrice!.toString()).toBe('2200');
    });

    it('0%の利益率でも正しく計算する', () => {
      const executionLines = [{ lineId: 'line-1', unitPrice: new Decimal('1000') }];
      const profitRate = '0';

      const result = service.previewProfitRate(executionLines, profitRate);

      const item = result[0];
      expect(item).toBeDefined();
      expect(item!.newUnitPrice!.toString()).toBe('1000');
    });

    it('大きな利益率でも正しく計算する', () => {
      const executionLines = [{ lineId: 'line-1', unitPrice: new Decimal('1000') }];
      const profitRate = '100'; // 100%

      const result = service.previewProfitRate(executionLines, profitRate);

      const item = result[0];
      expect(item).toBeDefined();
      expect(item!.newUnitPrice!.toString()).toBe('2000');
    });

    it('REQ-22: 新しい単価を小数第1位で四捨五入して整数にする', () => {
      const executionLines = [{ lineId: 'line-1', unitPrice: new Decimal('1000') }];
      const profitRate = '33.333'; // 33.333%

      const result = service.previewProfitRate(executionLines, profitRate);

      // 1000 * 1.33333 = 1333.33 -> 1333（小数第1位四捨五入→整数）
      const item = result[0];
      expect(item).toBeDefined();
      expect(item!.newUnitPrice!.toString()).toBe('1333');
    });

    it('単価がnullの場合はnullを返す', () => {
      const executionLines = [{ lineId: 'line-1', unitPrice: null }];
      const profitRate = '10';

      const result = service.previewProfitRate(executionLines, profitRate);

      expect(result[0]!.newUnitPrice).toBeNull();
    });
  });

  describe('validateProfitRate (利益率バリデーション)', () => {
    it('有効な利益率（0.00〜500.00）を受け入れる', () => {
      expect(service.validateProfitRate('0')).toBe(true);
      expect(service.validateProfitRate('10')).toBe(true);
      expect(service.validateProfitRate('100')).toBe(true);
      expect(service.validateProfitRate('500')).toBe(true);
    });

    it('小数点を含む有効な利益率を受け入れる', () => {
      expect(service.validateProfitRate('0.01')).toBe(true);
      expect(service.validateProfitRate('25.5')).toBe(true);
      expect(service.validateProfitRate('499.99')).toBe(true);
    });

    it('範囲外の利益率を拒否する', () => {
      expect(service.validateProfitRate('-1')).toBe(false);
      expect(service.validateProfitRate('500.01')).toBe(false);
      expect(service.validateProfitRate('1000')).toBe(false);
    });

    it('数値以外の入力を拒否する', () => {
      expect(service.validateProfitRate('abc')).toBe(false);
      expect(service.validateProfitRate('')).toBe(false);
    });
  });

  describe('calculateOverflowCheck (オーバーフローチェック)', () => {
    it('安全な計算結果に対してtrueを返す', () => {
      const result = service.checkOverflow(new Decimal('999999999999.99'));
      expect(result.isOverflow).toBe(false);
    });

    it('オーバーフロー可能性がある場合にwarningを返す', () => {
      // Decimal(15, 2)の最大値を超える数値
      const result = service.checkOverflow(new Decimal('10000000000000.00'));
      expect(result.isOverflow).toBe(true);
      expect(result.warning).toBeDefined();
    });
  });
});
