/**
 * @fileoverview 数値フィールド範囲チェック機能のテスト
 *
 * Task 12.4: 数値フィールドの入力制御と範囲チェックを実装する
 *
 * Requirements:
 * - 15.1: 調整係数は-9.99〜9.99の範囲で入力可能とする
 * - 15.2: 丸め設定は0.01〜99.99の範囲で入力可能とする
 * - 15.3: 数量は-999999.99〜9999999.99の範囲で入力可能とする
 * - 15.1: 寸法・ピッチ計算フィールドは0.01〜9999999.99の範囲で入力可能とする
 *
 * @module components/quantity-table/NumericFieldRangeValidator.test
 */

import { describe, it, expect } from 'vitest';
import {
  validateNumericRange,
  getFieldRangeConfig,
  type NumericRangeFieldType,
} from './numeric-range-validation';

describe('NumericFieldRangeValidator', () => {
  describe('調整係数の範囲チェック（REQ-15.1）', () => {
    const fieldType: NumericRangeFieldType = 'adjustmentFactor';

    it('0は有効', () => {
      const result = validateNumericRange(0, fieldType);
      expect(result.isValid).toBe(true);
    });

    it('1.00は有効', () => {
      const result = validateNumericRange(1.0, fieldType);
      expect(result.isValid).toBe(true);
    });

    it('9.99は有効（上限）', () => {
      const result = validateNumericRange(9.99, fieldType);
      expect(result.isValid).toBe(true);
    });

    it('-9.99は有効（下限）', () => {
      const result = validateNumericRange(-9.99, fieldType);
      expect(result.isValid).toBe(true);
    });

    it('10.00は無効（上限超過）', () => {
      const result = validateNumericRange(10.0, fieldType);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('-9.99');
      expect(result.error).toContain('9.99');
    });

    it('-10.00は無効（下限未満）', () => {
      const result = validateNumericRange(-10.0, fieldType);
      expect(result.isValid).toBe(false);
    });
  });

  describe('丸め設定の範囲チェック（REQ-15.2）', () => {
    const fieldType: NumericRangeFieldType = 'roundingUnit';

    it('0.01は有効（下限）', () => {
      const result = validateNumericRange(0.01, fieldType);
      expect(result.isValid).toBe(true);
    });

    it('99.99は有効（上限）', () => {
      const result = validateNumericRange(99.99, fieldType);
      expect(result.isValid).toBe(true);
    });

    it('1.00は有効', () => {
      const result = validateNumericRange(1.0, fieldType);
      expect(result.isValid).toBe(true);
    });

    it('0は無効（下限未満）', () => {
      const result = validateNumericRange(0, fieldType);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('0.01');
      expect(result.error).toContain('99.99');
    });

    it('100.00は無効（上限超過）', () => {
      const result = validateNumericRange(100.0, fieldType);
      expect(result.isValid).toBe(false);
    });

    it('-0.01は無効（負の値）', () => {
      const result = validateNumericRange(-0.01, fieldType);
      expect(result.isValid).toBe(false);
    });
  });

  describe('数量の範囲チェック（REQ-15.3）', () => {
    const fieldType: NumericRangeFieldType = 'quantity';

    it('0は有効', () => {
      const result = validateNumericRange(0, fieldType);
      expect(result.isValid).toBe(true);
    });

    it('9999999.99は有効（上限）', () => {
      const result = validateNumericRange(9999999.99, fieldType);
      expect(result.isValid).toBe(true);
    });

    it('-999999.99は有効（下限）', () => {
      const result = validateNumericRange(-999999.99, fieldType);
      expect(result.isValid).toBe(true);
    });

    it('10000000.00は無効（上限超過）', () => {
      const result = validateNumericRange(10000000.0, fieldType);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('-999999.99');
      expect(result.error).toContain('9999999.99');
    });

    it('-1000000.00は無効（下限未満）', () => {
      const result = validateNumericRange(-1000000.0, fieldType);
      expect(result.isValid).toBe(false);
    });
  });

  describe('寸法フィールドの範囲チェック（REQ-15.1）', () => {
    const fieldType: NumericRangeFieldType = 'dimension';

    it('0.01は有効（下限）', () => {
      const result = validateNumericRange(0.01, fieldType);
      expect(result.isValid).toBe(true);
    });

    it('9999999.99は有効（上限）', () => {
      const result = validateNumericRange(9999999.99, fieldType);
      expect(result.isValid).toBe(true);
    });

    it('100.00は有効', () => {
      const result = validateNumericRange(100.0, fieldType);
      expect(result.isValid).toBe(true);
    });

    it('0は無効（下限未満）', () => {
      const result = validateNumericRange(0, fieldType);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('0.01');
      expect(result.error).toContain('9999999.99');
    });

    it('10000000.00は無効（上限超過）', () => {
      const result = validateNumericRange(10000000.0, fieldType);
      expect(result.isValid).toBe(false);
    });

    it('-1.00は無効（負の値）', () => {
      const result = validateNumericRange(-1.0, fieldType);
      expect(result.isValid).toBe(false);
    });
  });

  describe('getFieldRangeConfig', () => {
    it('調整係数の範囲設定を取得できる', () => {
      const config = getFieldRangeConfig('adjustmentFactor');
      expect(config.min).toBe(-9.99);
      expect(config.max).toBe(9.99);
    });

    it('丸め設定の範囲設定を取得できる', () => {
      const config = getFieldRangeConfig('roundingUnit');
      expect(config.min).toBe(0.01);
      expect(config.max).toBe(99.99);
    });

    it('数量の範囲設定を取得できる', () => {
      const config = getFieldRangeConfig('quantity');
      expect(config.min).toBe(-999999.99);
      expect(config.max).toBe(9999999.99);
    });

    it('寸法の範囲設定を取得できる', () => {
      const config = getFieldRangeConfig('dimension');
      expect(config.min).toBe(0.01);
      expect(config.max).toBe(9999999.99);
    });
  });

  // ============================================================================
  // Task 13.2: 数値フィールドバリデーションの単体テスト（拡張）
  // ============================================================================

  describe('Task 13.2: 数値フィールドバリデーション拡張テスト', () => {
    describe('調整係数の詳細境界値テスト', () => {
      const fieldType: NumericRangeFieldType = 'adjustmentFactor';

      it('正の小数値（1.23）は有効', () => {
        const result = validateNumericRange(1.23, fieldType);
        expect(result.isValid).toBe(true);
      });

      it('負の小数値（-1.23）は有効', () => {
        const result = validateNumericRange(-1.23, fieldType);
        expect(result.isValid).toBe(true);
      });

      it('境界値テスト: -9.98は有効', () => {
        const result = validateNumericRange(-9.98, fieldType);
        expect(result.isValid).toBe(true);
      });

      it('境界値テスト: 9.98は有効', () => {
        const result = validateNumericRange(9.98, fieldType);
        expect(result.isValid).toBe(true);
      });

      it('境界値テスト: -9.991は無効（微小超過）', () => {
        const result = validateNumericRange(-9.991, fieldType);
        expect(result.isValid).toBe(false);
      });

      it('境界値テスト: 9.991は無効（微小超過）', () => {
        const result = validateNumericRange(9.991, fieldType);
        expect(result.isValid).toBe(false);
      });
    });

    describe('丸め設定の詳細境界値テスト', () => {
      const fieldType: NumericRangeFieldType = 'roundingUnit';

      it('一般的な丸め値（0.25）は有効', () => {
        const result = validateNumericRange(0.25, fieldType);
        expect(result.isValid).toBe(true);
      });

      it('大きな丸め値（50）は有効', () => {
        const result = validateNumericRange(50, fieldType);
        expect(result.isValid).toBe(true);
      });

      it('境界値テスト: 0.02は有効', () => {
        const result = validateNumericRange(0.02, fieldType);
        expect(result.isValid).toBe(true);
      });

      it('境界値テスト: 99.98は有効', () => {
        const result = validateNumericRange(99.98, fieldType);
        expect(result.isValid).toBe(true);
      });

      it('境界値テスト: 0.009は無効（最小値未満）', () => {
        const result = validateNumericRange(0.009, fieldType);
        expect(result.isValid).toBe(false);
      });

      it('境界値テスト: 99.991は無効（微小超過）', () => {
        const result = validateNumericRange(99.991, fieldType);
        expect(result.isValid).toBe(false);
      });
    });

    describe('数量フィールドの詳細境界値テスト', () => {
      const fieldType: NumericRangeFieldType = 'quantity';

      it('一般的な数量（123.45）は有効', () => {
        const result = validateNumericRange(123.45, fieldType);
        expect(result.isValid).toBe(true);
      });

      it('大きな正の数量（5000000）は有効', () => {
        const result = validateNumericRange(5000000, fieldType);
        expect(result.isValid).toBe(true);
      });

      it('負の数量（-500000）は有効', () => {
        const result = validateNumericRange(-500000, fieldType);
        expect(result.isValid).toBe(true);
      });

      it('境界値テスト: -999999.98は有効', () => {
        const result = validateNumericRange(-999999.98, fieldType);
        expect(result.isValid).toBe(true);
      });

      it('境界値テスト: 9999999.98は有効', () => {
        const result = validateNumericRange(9999999.98, fieldType);
        expect(result.isValid).toBe(true);
      });

      it('境界値テスト: -999999.991は無効（微小超過）', () => {
        const result = validateNumericRange(-999999.991, fieldType);
        expect(result.isValid).toBe(false);
      });

      it('境界値テスト: 9999999.991は無効（微小超過）', () => {
        const result = validateNumericRange(9999999.991, fieldType);
        expect(result.isValid).toBe(false);
      });
    });

    describe('寸法・ピッチフィールドの詳細境界値テスト', () => {
      const fieldType: NumericRangeFieldType = 'dimension';

      it('一般的な寸法値（100）は有効', () => {
        const result = validateNumericRange(100, fieldType);
        expect(result.isValid).toBe(true);
      });

      it('小さな寸法値（0.02）は有効', () => {
        const result = validateNumericRange(0.02, fieldType);
        expect(result.isValid).toBe(true);
      });

      it('大きな寸法値（5000000）は有効', () => {
        const result = validateNumericRange(5000000, fieldType);
        expect(result.isValid).toBe(true);
      });

      it('境界値テスト: 0.009は無効（最小値未満）', () => {
        const result = validateNumericRange(0.009, fieldType);
        expect(result.isValid).toBe(false);
      });

      it('境界値テスト: 0.011は有効', () => {
        const result = validateNumericRange(0.011, fieldType);
        expect(result.isValid).toBe(true);
      });

      it('境界値テスト: 9999999.98は有効', () => {
        const result = validateNumericRange(9999999.98, fieldType);
        expect(result.isValid).toBe(true);
      });

      it('境界値テスト: 9999999.991は無効（微小超過）', () => {
        const result = validateNumericRange(9999999.991, fieldType);
        expect(result.isValid).toBe(false);
      });

      it('負の値（-0.01）は無効', () => {
        const result = validateNumericRange(-0.01, fieldType);
        expect(result.isValid).toBe(false);
      });
    });

    describe('エラーメッセージのフォーマット確認', () => {
      it('調整係数のエラーメッセージに範囲が含まれる', () => {
        const result = validateNumericRange(100, 'adjustmentFactor');
        expect(result.error).toContain('-9.99');
        expect(result.error).toContain('9.99');
        expect(result.error).toContain('調整係数');
      });

      it('丸め設定のエラーメッセージに範囲が含まれる', () => {
        const result = validateNumericRange(-1, 'roundingUnit');
        expect(result.error).toContain('0.01');
        expect(result.error).toContain('99.99');
        expect(result.error).toContain('丸め設定');
      });

      it('数量のエラーメッセージに範囲が含まれる', () => {
        const result = validateNumericRange(10000000, 'quantity');
        expect(result.error).toContain('-999999.99');
        expect(result.error).toContain('9999999.99');
        expect(result.error).toContain('数量');
      });

      it('寸法のエラーメッセージに範囲が含まれる', () => {
        const result = validateNumericRange(-1, 'dimension');
        expect(result.error).toContain('0.01');
        expect(result.error).toContain('9999999.99');
        expect(result.error).toContain('寸法/ピッチ');
      });
    });
  });
});
