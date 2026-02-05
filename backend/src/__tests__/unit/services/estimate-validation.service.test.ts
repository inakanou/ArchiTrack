/**
 * @fileoverview 見積計算バリデーションサービスのユニットテスト
 *
 * TDD: RED phase - テストを先に書く
 *
 * Requirements (estimate-creation):
 * - REQ-13.5: 金額計算結果が数値の最大値を超えた場合にオーバーフロー警告を表示する
 * - REQ-13.6: 高精度な10進数計算により丸め誤差を最小化する
 *
 * Task 5.2: 計算結果バリデーションの実装
 *
 * @module __tests__/unit/services/estimate-validation.service
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { EstimateValidationService } from '../../../services/estimate-validation.service.js';
import Decimal from 'decimal.js';

describe('EstimateValidationService', () => {
  let service: EstimateValidationService;

  beforeEach(() => {
    service = new EstimateValidationService();
  });

  describe('validateCalculationResult (REQ-13.5)', () => {
    describe('金額オーバーフロー検出', () => {
      it('安全な金額（最大値以下）に対してisValidがtrueを返す', () => {
        const result = service.validateCalculationResult(new Decimal('9999999999999.99'));
        expect(result.isValid).toBe(true);
        expect(result.warnings).toHaveLength(0);
      });

      it('Decimal(15,2)最大値ちょうどはisValidがtrueを返す', () => {
        const result = service.validateCalculationResult(new Decimal('9999999999999.99'));
        expect(result.isValid).toBe(true);
      });

      it('最大値を超える金額に対してisValidがfalseを返す', () => {
        const result = service.validateCalculationResult(new Decimal('10000000000000.00'));
        expect(result.isValid).toBe(false);
        expect(result.warnings).toHaveLength(1);
        expect(result.warnings[0]).toContain('オーバーフロー');
      });

      it('負の大きな値のオーバーフローを検出する', () => {
        const result = service.validateCalculationResult(new Decimal('-10000000000000.00'));
        expect(result.isValid).toBe(false);
        expect(result.warnings).toHaveLength(1);
      });

      it('nullの場合はisValidがtrueを返す', () => {
        const result = service.validateCalculationResult(null);
        expect(result.isValid).toBe(true);
        expect(result.warnings).toHaveLength(0);
      });
    });

    describe('オーバーフロー警告の生成', () => {
      it('警告メッセージに金額情報を含む', () => {
        const result = service.validateCalculationResult(new Decimal('10000000000000.00'));
        expect(result.warnings[0]).toContain('10000000000000');
      });

      it('最大許容値を警告メッセージに含む', () => {
        const result = service.validateCalculationResult(new Decimal('10000000000000.00'));
        expect(result.warnings[0]).toContain('9999999999999.99');
      });
    });
  });

  describe('validateDecimalPrecision (REQ-13.6)', () => {
    describe('高精度10進数計算の精度検証', () => {
      it('通常の精度での計算結果を検証', () => {
        const result = service.validateDecimalPrecision(new Decimal('12345.67'));
        expect(result.isValid).toBe(true);
        expect(result.warnings).toHaveLength(0);
      });

      it('小数点以下2桁を超える場合は警告を出す', () => {
        const result = service.validateDecimalPrecision(new Decimal('12345.6789'));
        expect(result.isValid).toBe(true); // まだ有効だが警告あり
        expect(result.warnings).toHaveLength(1);
        expect(result.warnings[0]).toContain('小数点');
      });

      it('整数値は有効', () => {
        const result = service.validateDecimalPrecision(new Decimal('12345'));
        expect(result.isValid).toBe(true);
        expect(result.warnings).toHaveLength(0);
      });

      it('0は有効', () => {
        const result = service.validateDecimalPrecision(new Decimal('0'));
        expect(result.isValid).toBe(true);
        expect(result.warnings).toHaveLength(0);
      });
    });
  });

  describe('validateBatchCalculation', () => {
    it('複数の計算結果を一括検証できる', () => {
      const amounts = [new Decimal('10000'), new Decimal('20000'), new Decimal('30000')];

      const result = service.validateBatchCalculation(amounts);
      expect(result.isValid).toBe(true);
      expect(result.warnings).toHaveLength(0);
    });

    it('一つでもオーバーフローがあればisValidがfalseを返す', () => {
      const amounts = [
        new Decimal('10000'),
        new Decimal('10000000000000.00'), // オーバーフロー
        new Decimal('30000'),
      ];

      const result = service.validateBatchCalculation(amounts);
      expect(result.isValid).toBe(false);
      expect(result.warnings.length).toBeGreaterThan(0);
    });

    it('空配列の場合はisValidがtrueを返す', () => {
      const result = service.validateBatchCalculation([]);
      expect(result.isValid).toBe(true);
      expect(result.warnings).toHaveLength(0);
    });

    it('nullを含む配列を処理できる', () => {
      const amounts = [new Decimal('10000'), null, new Decimal('30000')];

      const result = service.validateBatchCalculation(amounts);
      expect(result.isValid).toBe(true);
    });
  });

  describe('validateQuantityValue', () => {
    it('正の数量を受け入れる', () => {
      const result = service.validateQuantityValue('10');
      expect(result.isValid).toBe(true);
    });

    it('負の数量を受け入れる（値引き等）', () => {
      const result = service.validateQuantityValue('-10');
      expect(result.isValid).toBe(true);
    });

    it('0の数量を受け入れる', () => {
      const result = service.validateQuantityValue('0');
      expect(result.isValid).toBe(true);
    });

    it('小数の数量を受け入れる', () => {
      const result = service.validateQuantityValue('10.5');
      expect(result.isValid).toBe(true);
    });

    it('数値以外を拒否する', () => {
      const result = service.validateQuantityValue('abc');
      expect(result.isValid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('空文字列を拒否する', () => {
      const result = service.validateQuantityValue('');
      expect(result.isValid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('Decimal(15,4)の最大精度を超える場合は警告を出す', () => {
      const result = service.validateQuantityValue('1.23456');
      expect(result.isValid).toBe(true);
      expect(result.warnings).toBeDefined();
      expect(result.warnings!.length).toBeGreaterThan(0);
    });
  });

  describe('validateUnitPriceValue', () => {
    it('正の単価を受け入れる', () => {
      const result = service.validateUnitPriceValue('1500');
      expect(result.isValid).toBe(true);
    });

    it('負の単価を受け入れる（値引き等）', () => {
      const result = service.validateUnitPriceValue('-1500');
      expect(result.isValid).toBe(true);
    });

    it('0の単価を受け入れる', () => {
      const result = service.validateUnitPriceValue('0');
      expect(result.isValid).toBe(true);
    });

    it('小数の単価を受け入れる', () => {
      const result = service.validateUnitPriceValue('1500.50');
      expect(result.isValid).toBe(true);
    });

    it('数値以外を拒否する', () => {
      const result = service.validateUnitPriceValue('abc');
      expect(result.isValid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('Decimal(15,2)の最大精度を超える場合は警告を出す', () => {
      const result = service.validateUnitPriceValue('1500.123');
      expect(result.isValid).toBe(true);
      expect(result.warnings).toBeDefined();
      expect(result.warnings!.length).toBeGreaterThan(0);
    });
  });

  describe('validateProfitRateValue', () => {
    it('0%の利益率を受け入れる', () => {
      const result = service.validateProfitRateValue('0');
      expect(result.isValid).toBe(true);
    });

    it('500%の利益率を受け入れる', () => {
      const result = service.validateProfitRateValue('500');
      expect(result.isValid).toBe(true);
    });

    it('小数の利益率を受け入れる', () => {
      const result = service.validateProfitRateValue('25.5');
      expect(result.isValid).toBe(true);
    });

    it('負の利益率を拒否する', () => {
      const result = service.validateProfitRateValue('-1');
      expect(result.isValid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('500%を超える利益率を拒否する', () => {
      const result = service.validateProfitRateValue('500.01');
      expect(result.isValid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('数値以外を拒否する', () => {
      const result = service.validateProfitRateValue('abc');
      expect(result.isValid).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('validateNetAmountValue', () => {
    it('正のNET金額を受け入れる', () => {
      const result = service.validateNetAmountValue('100000');
      expect(result.isValid).toBe(true);
    });

    it('0のNET金額を受け入れる', () => {
      const result = service.validateNetAmountValue('0');
      expect(result.isValid).toBe(true);
    });

    it('小数のNET金額を受け入れる', () => {
      const result = service.validateNetAmountValue('100000.50');
      expect(result.isValid).toBe(true);
    });

    it('負のNET金額を拒否する', () => {
      const result = service.validateNetAmountValue('-100000');
      expect(result.isValid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('数値以外を拒否する', () => {
      const result = service.validateNetAmountValue('abc');
      expect(result.isValid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('オーバーフローするNET金額を警告する', () => {
      const result = service.validateNetAmountValue('10000000000000');
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('オーバーフロー');
    });
  });
});
