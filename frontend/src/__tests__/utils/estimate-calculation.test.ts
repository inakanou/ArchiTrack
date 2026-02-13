/**
 * @fileoverview EstimateCalculator単体テスト
 *
 * Task 14.1: EstimateCalculator単体テスト
 * - 金額計算のDecimal精度検証 (REQ-1.3, REQ-13.6)
 * - 合計計算のテスト (REQ-1.5, REQ-2.3)
 * - プレビュー計算のテスト (REQ-5.1, REQ-5.4, REQ-6.1)
 */

import { describe, it, expect } from 'vitest';
import Decimal from 'decimal.js';
import {
  EstimateCalculator,
  EstimateItemWithLines,
  EstimateItemHierarchy,
  VendorLineInfo,
  ExecutionLineInfo,
} from '../../utils/estimate-calculation';

describe('EstimateCalculator', () => {
  // ============================================================================
  // calculateAmount - 金額計算 (数量 × 単価)
  // REQ-1.3: 金額フィールドを単価と数量の積として自動計算する
  // REQ-13.6: 高精度な10進数計算により丸め誤差を最小化する
  // ============================================================================
  describe('calculateAmount', () => {
    describe('正常系', () => {
      it('整数の数量と単価から金額を計算できること', () => {
        const result = EstimateCalculator.calculateAmount('10', '1000');

        expect(result).not.toBeNull();
        expect(result?.toString()).toBe('10000');
      });

      it('小数点を含む数量から金額を計算できること', () => {
        const result = EstimateCalculator.calculateAmount('2.5', '1000');

        expect(result).not.toBeNull();
        expect(result?.toString()).toBe('2500');
      });

      it('REQ-22: 小数点を含む単価から金額を計算し整数に丸めること', () => {
        // 10 * 99.99 = 999.9 -> 1000（小数第1位四捨五入→整数）
        const result = EstimateCalculator.calculateAmount('10', '99.99');

        expect(result).not.toBeNull();
        expect(result?.toString()).toBe('1000');
      });

      it('REQ-22: 計算結果を小数第1位で四捨五入して整数にすること', () => {
        // 10 * 3.333 = 33.33 -> 33（小数第1位四捨五入→整数）
        const result = EstimateCalculator.calculateAmount('10', '3.333');

        expect(result).not.toBeNull();
        expect(result?.toString()).toBe('33');
      });

      it('REQ-22: .5以上は切り上げ（ROUND_HALF_UP）', () => {
        // 1 * 1.125 = 1.125 → 1（小数第1位四捨五入→整数）
        const result = EstimateCalculator.calculateAmount('1', '1.125');

        expect(result).not.toBeNull();
        expect(result?.toString()).toBe('1');
      });

      it('大きな数値を正確に計算できること', () => {
        // 1000000 * 999999 = 999999000000
        const result = EstimateCalculator.calculateAmount('1000000', '999999');

        expect(result).not.toBeNull();
        expect(result?.toString()).toBe('999999000000');
      });

      it('REQ-22: Decimal精度で浮動小数点誤差を回避しつつ整数に丸めること', () => {
        // 3 * 0.1 = 0.3 -> 0（小数第1位四捨五入→整数）
        const result = EstimateCalculator.calculateAmount('3', '0.1');

        expect(result).not.toBeNull();
        expect(result?.toString()).toBe('0');
      });

      it('ゼロの数量を計算できること', () => {
        const result = EstimateCalculator.calculateAmount('0', '1000');

        expect(result).not.toBeNull();
        expect(result?.toString()).toBe('0');
      });

      it('ゼロの単価を計算できること', () => {
        const result = EstimateCalculator.calculateAmount('10', '0');

        expect(result).not.toBeNull();
        expect(result?.toString()).toBe('0');
      });

      it('負の数量を計算できること', () => {
        const result = EstimateCalculator.calculateAmount('-5', '100');

        expect(result).not.toBeNull();
        expect(result?.toString()).toBe('-500');
      });

      it('負の単価を計算できること', () => {
        const result = EstimateCalculator.calculateAmount('5', '-100');

        expect(result).not.toBeNull();
        expect(result?.toString()).toBe('-500');
      });
    });

    describe('境界値', () => {
      it('数量がnullの場合はnullを返すこと', () => {
        const result = EstimateCalculator.calculateAmount(null, '1000');

        expect(result).toBeNull();
      });

      it('単価がnullの場合はnullを返すこと', () => {
        const result = EstimateCalculator.calculateAmount('10', null);

        expect(result).toBeNull();
      });

      it('数量が空文字の場合はnullを返すこと', () => {
        const result = EstimateCalculator.calculateAmount('', '1000');

        expect(result).toBeNull();
      });

      it('単価が空文字の場合はnullを返すこと', () => {
        const result = EstimateCalculator.calculateAmount('10', '');

        expect(result).toBeNull();
      });

      it('数量が数値として無効な場合はnullを返すこと', () => {
        const result = EstimateCalculator.calculateAmount('abc', '1000');

        expect(result).toBeNull();
      });

      it('単価が数値として無効な場合はnullを返すこと', () => {
        const result = EstimateCalculator.calculateAmount('10', 'xyz');

        expect(result).toBeNull();
      });
    });
  });

  // ============================================================================
  // calculateSubtotal - 合計金額計算
  // REQ-1.5: 合計行に全見積項目の金額合計を自動計算して表示する
  // ============================================================================
  describe('calculateSubtotal', () => {
    describe('正常系', () => {
      it('見積項目の見積金額行の合計を計算できること', () => {
        const items: EstimateItemWithLines[] = [
          {
            id: '1',
            lines: [
              { lineType: 'ESTIMATE', amount: '10000' },
              { lineType: 'EXECUTION', amount: '9000' },
              { lineType: 'VENDOR', amount: '8000' },
            ],
          },
          {
            id: '2',
            lines: [
              { lineType: 'ESTIMATE', amount: '20000' },
              { lineType: 'EXECUTION', amount: '18000' },
              { lineType: 'VENDOR', amount: '16000' },
            ],
          },
        ];

        const result = EstimateCalculator.calculateSubtotal(items);

        // 見積金額行のみ合計: 10000 + 20000 = 30000
        expect(result.toString()).toBe('30000');
      });

      it('見積金額行がない項目をスキップすること', () => {
        const items: EstimateItemWithLines[] = [
          {
            id: '1',
            lines: [
              { lineType: 'EXECUTION', amount: '9000' },
              { lineType: 'VENDOR', amount: '8000' },
            ],
          },
          {
            id: '2',
            lines: [{ lineType: 'ESTIMATE', amount: '20000' }],
          },
        ];

        const result = EstimateCalculator.calculateSubtotal(items);

        expect(result.toString()).toBe('20000');
      });

      it('見積金額行のamountがnullの場合はスキップすること', () => {
        const items: EstimateItemWithLines[] = [
          {
            id: '1',
            lines: [{ lineType: 'ESTIMATE', amount: null }],
          },
          {
            id: '2',
            lines: [{ lineType: 'ESTIMATE', amount: '15000' }],
          },
        ];

        const result = EstimateCalculator.calculateSubtotal(items);

        expect(result.toString()).toBe('15000');
      });

      it('空の配列の場合は0を返すこと', () => {
        const items: EstimateItemWithLines[] = [];

        const result = EstimateCalculator.calculateSubtotal(items);

        expect(result.toString()).toBe('0');
      });

      it('小数点を含む金額を正確に合計できること', () => {
        const items: EstimateItemWithLines[] = [
          {
            id: '1',
            lines: [{ lineType: 'ESTIMATE', amount: '10000.55' }],
          },
          {
            id: '2',
            lines: [{ lineType: 'ESTIMATE', amount: '20000.45' }],
          },
        ];

        const result = EstimateCalculator.calculateSubtotal(items);

        expect(result.toString()).toBe('30001');
      });

      it('無効な金額文字列がある場合はスキップすること', () => {
        const items: EstimateItemWithLines[] = [
          {
            id: '1',
            lines: [{ lineType: 'ESTIMATE', amount: 'invalid' }],
          },
          {
            id: '2',
            lines: [{ lineType: 'ESTIMATE', amount: '5000' }],
          },
        ];

        const result = EstimateCalculator.calculateSubtotal(items);

        expect(result.toString()).toBe('5000');
      });
    });
  });

  // ============================================================================
  // calculateHierarchyAmounts - 階層金額計算
  // REQ-2.3: 子項目を持つ場合、親項目の金額として子項目の金額合計を自動計算して表示する
  // ============================================================================
  describe('calculateHierarchyAmounts', () => {
    describe('正常系', () => {
      it('子項目がない場合は元の金額を維持すること', () => {
        const hierarchy: EstimateItemHierarchy[] = [
          {
            id: '1',
            lines: [{ lineType: 'ESTIMATE', amount: '10000' }],
            children: [],
          },
        ];

        const result = EstimateCalculator.calculateHierarchyAmounts(hierarchy);

        expect(result[0]!.lines.find((l) => l.lineType === 'ESTIMATE')?.amount).toBe('10000');
      });

      it('子項目の金額合計を親項目の金額として設定すること', () => {
        const hierarchy: EstimateItemHierarchy[] = [
          {
            id: 'parent',
            lines: [
              { lineType: 'ESTIMATE', amount: '0' }, // 初期値
            ],
            children: [
              {
                id: 'child1',
                lines: [{ lineType: 'ESTIMATE', amount: '5000' }],
                children: [],
              },
              {
                id: 'child2',
                lines: [{ lineType: 'ESTIMATE', amount: '3000' }],
                children: [],
              },
            ],
          },
        ];

        const result = EstimateCalculator.calculateHierarchyAmounts(hierarchy);

        // 親: 5000 + 3000 = 8000
        expect(result[0]!.lines.find((l) => l.lineType === 'ESTIMATE')?.amount).toBe('8000');
        // 子は元のまま
        expect(result[0]!.children[0]!.lines.find((l) => l.lineType === 'ESTIMATE')?.amount).toBe(
          '5000'
        );
        expect(result[0]!.children[1]!.lines.find((l) => l.lineType === 'ESTIMATE')?.amount).toBe(
          '3000'
        );
      });

      it('多階層の場合、下から順に計算すること', () => {
        const hierarchy: EstimateItemHierarchy[] = [
          {
            id: 'grandparent',
            lines: [{ lineType: 'ESTIMATE', amount: '0' }],
            children: [
              {
                id: 'parent',
                lines: [{ lineType: 'ESTIMATE', amount: '0' }],
                children: [
                  {
                    id: 'child1',
                    lines: [{ lineType: 'ESTIMATE', amount: '1000' }],
                    children: [],
                  },
                  {
                    id: 'child2',
                    lines: [{ lineType: 'ESTIMATE', amount: '2000' }],
                    children: [],
                  },
                ],
              },
            ],
          },
        ];

        const result = EstimateCalculator.calculateHierarchyAmounts(hierarchy);

        // 孫: 元のまま
        expect(
          result[0]!.children[0]!.children[0]!.lines.find((l) => l.lineType === 'ESTIMATE')?.amount
        ).toBe('1000');
        expect(
          result[0]!.children[0]!.children[1]!.lines.find((l) => l.lineType === 'ESTIMATE')?.amount
        ).toBe('2000');
        // 親: 1000 + 2000 = 3000
        expect(result[0]!.children[0]!.lines.find((l) => l.lineType === 'ESTIMATE')?.amount).toBe(
          '3000'
        );
        // 祖父: 3000
        expect(result[0]!.lines.find((l) => l.lineType === 'ESTIMATE')?.amount).toBe('3000');
      });

      it('複数のルート項目を処理できること', () => {
        const hierarchy: EstimateItemHierarchy[] = [
          {
            id: 'root1',
            lines: [{ lineType: 'ESTIMATE', amount: '0' }],
            children: [
              {
                id: 'child1',
                lines: [{ lineType: 'ESTIMATE', amount: '10000' }],
                children: [],
              },
            ],
          },
          {
            id: 'root2',
            lines: [{ lineType: 'ESTIMATE', amount: '5000' }],
            children: [],
          },
        ];

        const result = EstimateCalculator.calculateHierarchyAmounts(hierarchy);

        expect(result[0]!.lines.find((l) => l.lineType === 'ESTIMATE')?.amount).toBe('10000');
        expect(result[1]!.lines.find((l) => l.lineType === 'ESTIMATE')?.amount).toBe('5000');
      });

      it('子項目のamountがnullの場合は0として計算すること', () => {
        const hierarchy: EstimateItemHierarchy[] = [
          {
            id: 'parent',
            lines: [{ lineType: 'ESTIMATE', amount: '0' }],
            children: [
              {
                id: 'child1',
                lines: [{ lineType: 'ESTIMATE', amount: null }],
                children: [],
              },
              {
                id: 'child2',
                lines: [{ lineType: 'ESTIMATE', amount: '7000' }],
                children: [],
              },
            ],
          },
        ];

        const result = EstimateCalculator.calculateHierarchyAmounts(hierarchy);

        expect(result[0]!.lines.find((l) => l.lineType === 'ESTIMATE')?.amount).toBe('7000');
      });

      it('見積金額行以外の行を維持すること', () => {
        const hierarchy: EstimateItemHierarchy[] = [
          {
            id: 'parent',
            lines: [
              { lineType: 'ESTIMATE', amount: '0' },
              { lineType: 'EXECUTION', amount: '5000' },
              { lineType: 'VENDOR', amount: '4000' },
            ],
            children: [
              {
                id: 'child1',
                lines: [{ lineType: 'ESTIMATE', amount: '10000' }],
                children: [],
              },
            ],
          },
        ];

        const result = EstimateCalculator.calculateHierarchyAmounts(hierarchy);

        // 見積金額行のみ更新
        expect(result[0]!.lines.find((l) => l.lineType === 'ESTIMATE')?.amount).toBe('10000');
        // 他の行は元のまま
        expect(result[0]!.lines.find((l) => l.lineType === 'EXECUTION')?.amount).toBe('5000');
        expect(result[0]!.lines.find((l) => l.lineType === 'VENDOR')?.amount).toBe('4000');
      });
    });
  });

  // ============================================================================
  // previewNetAllocation - NET金額案分プレビュー計算
  // REQ-5.1, REQ-5.2, REQ-5.4: NET金額計算と案分機能
  // ============================================================================
  describe('previewNetAllocation', () => {
    describe('正常系', () => {
      it('金額比率に基づいてNET金額を案分できること', () => {
        const vendorLines: VendorLineInfo[] = [
          { id: '1', amount: '6000' }, // 60%
          { id: '2', amount: '4000' }, // 40%
        ];
        const excludeIds: string[] = [];
        const netAmount = '10000';

        const result = EstimateCalculator.previewNetAllocation(vendorLines, excludeIds, netAmount);

        expect(result).toHaveLength(2);
        expect(result[0]!.lineId).toBe('1');
        expect(result[0]!.allocatedAmount).toBe('6000'); // 10000 * 0.6
        expect(result[0]!.ratio).toBe('60%');
        expect(result[1]!.lineId).toBe('2');
        expect(result[1]!.allocatedAmount).toBe('4000'); // 10000 * 0.4
        expect(result[1]!.ratio).toBe('40%');
      });

      it('除外IDの行を案分対象から除外すること', () => {
        const vendorLines: VendorLineInfo[] = [
          { id: '1', amount: '5000' },
          { id: '2', amount: '3000' }, // 除外
          { id: '3', amount: '2000' },
        ];
        const excludeIds: string[] = ['2'];
        const netAmount = '7000';

        const result = EstimateCalculator.previewNetAllocation(vendorLines, excludeIds, netAmount);

        // 除外後: 5000 + 2000 = 7000
        // 5000/7000 ≈ 71.43%, 2000/7000 ≈ 28.57%
        expect(result).toHaveLength(2);
        expect(result.find((r) => r.lineId === '2')).toBeUndefined();
        expect(result[0]!.lineId).toBe('1');
        expect(result[1]!.lineId).toBe('3');
      });

      it('REQ-22: 小数点を含む案分計算で結果が整数に丸められること', () => {
        const vendorLines: VendorLineInfo[] = [
          { id: '1', amount: '1000' },
          { id: '2', amount: '1000' },
          { id: '3', amount: '1000' },
        ];
        const excludeIds: string[] = [];
        const netAmount = '10000';

        const result = EstimateCalculator.previewNetAllocation(vendorLines, excludeIds, netAmount);

        // 各行: 10000 / 3 = 3333.33... -> 3333（整数に丸め）
        expect(result).toHaveLength(3);
        result.forEach((r) => {
          expect(r.allocatedAmount).toBe('3333');
          expect(r.ratio).toBe('33.33%');
        });
      });

      it('元の金額(originalAmount)を保持すること', () => {
        const vendorLines: VendorLineInfo[] = [{ id: '1', amount: '8000' }];

        const result = EstimateCalculator.previewNetAllocation(vendorLines, [], '10000');

        expect(result[0]!.originalAmount).toBe('8000');
      });
    });

    describe('境界値', () => {
      it('合計金額が0の場合、全て0を返すこと', () => {
        const vendorLines: VendorLineInfo[] = [
          { id: '1', amount: '0' },
          { id: '2', amount: '0' },
        ];

        const result = EstimateCalculator.previewNetAllocation(vendorLines, [], '10000');

        expect(result).toHaveLength(2);
        result.forEach((r) => {
          expect(r.allocatedAmount).toBe('0');
          expect(r.ratio).toBe('0%');
        });
      });

      it('amountがnullの行は金額0として扱うこと', () => {
        const vendorLines: VendorLineInfo[] = [
          { id: '1', amount: null },
          { id: '2', amount: '10000' },
        ];

        const result = EstimateCalculator.previewNetAllocation(vendorLines, [], '10000');

        expect(result[0]!.allocatedAmount).toBe('0');
        expect(result[0]!.ratio).toBe('0%');
        expect(result[1]!.allocatedAmount).toBe('10000');
        expect(result[1]!.ratio).toBe('100%');
      });

      it('全ての行が除外された場合、空配列を返すこと', () => {
        const vendorLines: VendorLineInfo[] = [
          { id: '1', amount: '5000' },
          { id: '2', amount: '3000' },
        ];
        const excludeIds: string[] = ['1', '2'];

        const result = EstimateCalculator.previewNetAllocation(vendorLines, excludeIds, '10000');

        expect(result).toHaveLength(0);
      });

      it('無効な金額文字列がある場合は0として扱うこと', () => {
        const vendorLines: VendorLineInfo[] = [
          { id: '1', amount: 'invalid' },
          { id: '2', amount: '10000' },
        ];

        const result = EstimateCalculator.previewNetAllocation(vendorLines, [], '10000');

        expect(result[0]!.allocatedAmount).toBe('0');
        expect(result[1]!.allocatedAmount).toBe('10000');
      });
    });
  });

  // ============================================================================
  // previewProfitRate - 利益率適用プレビュー計算
  // REQ-6.1: 利益率を指定した場合、全実行金額行に対して利益率を適用した単価を計算する
  // ============================================================================
  describe('previewProfitRate', () => {
    describe('正常系', () => {
      it('利益率を適用した新しい単価を計算できること', () => {
        const executionLines: ExecutionLineInfo[] = [
          { lineId: '1', unitPrice: '1000' },
          { lineId: '2', unitPrice: '2000' },
        ];
        const profitRate = '10'; // 10%

        const result = EstimateCalculator.previewProfitRate(executionLines, profitRate);

        expect(result).toHaveLength(2);
        expect(result[0]!.lineId).toBe('1');
        expect(result[0]!.originalUnitPrice).toBe('1000');
        expect(result[0]!.newUnitPrice).toBe('1100'); // 1000 * 1.10
        expect(result[1]!.lineId).toBe('2');
        expect(result[1]!.newUnitPrice).toBe('2200'); // 2000 * 1.10
      });

      it('0%の利益率を適用できること', () => {
        const executionLines: ExecutionLineInfo[] = [{ lineId: '1', unitPrice: '1000' }];

        const result = EstimateCalculator.previewProfitRate(executionLines, '0');

        expect(result[0]!.newUnitPrice).toBe('1000'); // 1000 * 1.00
      });

      it('小数点を含む利益率を適用できること', () => {
        const executionLines: ExecutionLineInfo[] = [{ lineId: '1', unitPrice: '1000' }];

        const result = EstimateCalculator.previewProfitRate(executionLines, '12.5');

        expect(result[0]!.newUnitPrice).toBe('1125'); // 1000 * 1.125
      });

      it('REQ-22: 新しい単価を小数第1位で四捨五入して整数にすること', () => {
        const executionLines: ExecutionLineInfo[] = [{ lineId: '1', unitPrice: '1000' }];

        // 33.333% → 1000 * 1.33333 = 1333.33 -> 1333（整数に丸め）
        const result = EstimateCalculator.previewProfitRate(executionLines, '33.333');

        expect(result[0]!.newUnitPrice).toBe('1333');
      });

      it('500%の利益率を適用できること（上限）', () => {
        const executionLines: ExecutionLineInfo[] = [{ lineId: '1', unitPrice: '100' }];

        const result = EstimateCalculator.previewProfitRate(executionLines, '500');

        expect(result[0]!.newUnitPrice).toBe('600'); // 100 * 6.00
      });
    });

    describe('境界値', () => {
      it('unitPriceがnullの場合、newUnitPriceもnullを返すこと', () => {
        const executionLines: ExecutionLineInfo[] = [{ lineId: '1', unitPrice: null }];

        const result = EstimateCalculator.previewProfitRate(executionLines, '10');

        expect(result[0]!.originalUnitPrice).toBeNull();
        expect(result[0]!.newUnitPrice).toBeNull();
      });

      it('unitPriceが空文字の場合、newUnitPriceはnullを返すこと', () => {
        const executionLines: ExecutionLineInfo[] = [{ lineId: '1', unitPrice: '' }];

        const result = EstimateCalculator.previewProfitRate(executionLines, '10');

        expect(result[0]!.originalUnitPrice).toBeNull();
        expect(result[0]!.newUnitPrice).toBeNull();
      });

      it('unitPriceが無効な文字列の場合、newUnitPriceはnullを返すこと', () => {
        const executionLines: ExecutionLineInfo[] = [{ lineId: '1', unitPrice: 'invalid' }];

        const result = EstimateCalculator.previewProfitRate(executionLines, '10');

        expect(result[0]!.newUnitPrice).toBeNull();
      });
    });
  });

  // ============================================================================
  // validateProfitRate - 利益率バリデーション
  // REQ-13.3: 利益率に0.00から500.00の範囲外の値が入力された場合、エラーメッセージを表示する
  // ============================================================================
  describe('validateProfitRate', () => {
    describe('正常系', () => {
      it('0%は有効であること', () => {
        expect(EstimateCalculator.validateProfitRate('0')).toBe(true);
      });

      it('0.00%は有効であること', () => {
        expect(EstimateCalculator.validateProfitRate('0.00')).toBe(true);
      });

      it('100%は有効であること', () => {
        expect(EstimateCalculator.validateProfitRate('100')).toBe(true);
      });

      it('500%は有効であること', () => {
        expect(EstimateCalculator.validateProfitRate('500')).toBe(true);
      });

      it('500.00%は有効であること', () => {
        expect(EstimateCalculator.validateProfitRate('500.00')).toBe(true);
      });

      it('小数点を含む値が有効であること', () => {
        expect(EstimateCalculator.validateProfitRate('25.5')).toBe(true);
        expect(EstimateCalculator.validateProfitRate('99.99')).toBe(true);
      });
    });

    describe('無効な値', () => {
      it('負の値は無効であること', () => {
        expect(EstimateCalculator.validateProfitRate('-1')).toBe(false);
        expect(EstimateCalculator.validateProfitRate('-0.01')).toBe(false);
      });

      it('500を超える値は無効であること', () => {
        expect(EstimateCalculator.validateProfitRate('500.01')).toBe(false);
        expect(EstimateCalculator.validateProfitRate('501')).toBe(false);
        expect(EstimateCalculator.validateProfitRate('1000')).toBe(false);
      });

      it('空文字は無効であること', () => {
        expect(EstimateCalculator.validateProfitRate('')).toBe(false);
      });

      it('数値以外の文字列は無効であること', () => {
        expect(EstimateCalculator.validateProfitRate('abc')).toBe(false);
        expect(EstimateCalculator.validateProfitRate('10%')).toBe(false);
        expect(EstimateCalculator.validateProfitRate('ten')).toBe(false);
      });
    });
  });

  // ============================================================================
  // Decimal精度検証
  // REQ-13.6: 高精度な10進数計算により丸め誤差を最小化する
  // ============================================================================
  describe('Decimal精度検証', () => {
    it('REQ-22: 浮動小数点演算結果を整数に丸めること', () => {
      // 1 * 0.3 = 0.3 -> 0（小数第1位四捨五入→整数）
      const result = EstimateCalculator.calculateAmount('1', '0.3');

      expect(result?.toString()).toBe('0');
    });

    it('REQ-22: 大きな数値の乗算結果を整数に丸めること', () => {
      // 1.01 * 99999999.99 = 100999999.9899 -> 101000000（整数に丸め）
      const result = EstimateCalculator.calculateAmount('1.01', '99999999.99');

      expect(result?.toString()).toBe('101000000');
    });

    it('非常に小さな数値を正確に計算できること', () => {
      // 0.0001 * 0.0001 = 0.00000001 → 0 (小数点2桁)
      const result = EstimateCalculator.calculateAmount('0.0001', '0.0001');

      expect(result?.toString()).toBe('0');
    });

    it('REQ-22: 繰り返し計算でも整数に丸めること', () => {
      // 1000 / 3 = 333.33（2桁）
      // 3 * 333.33 = 999.99 -> 1000（小数第1位四捨五入→整数）
      const thirdPrice = new Decimal('1000').div(3).toDecimalPlaces(2);
      const result = EstimateCalculator.calculateAmount('3', thirdPrice.toString());

      // 333.33 * 3 = 999.99 -> 1000（整数に丸め）
      expect(result?.toString()).toBe('1000');
    });
  });
});
