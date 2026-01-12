/**
 * @fileoverview 数量項目フィールドバリデーションサービス ユニットテスト
 *
 * TDD: RED phase - テストを先に書く
 *
 * Requirements:
 * - 13.1: 大項目・中項目等のフィールド（全角25文字/半角50文字）超過を防止
 * - 13.2: 工種フィールド（全角8文字/半角16文字）超過を防止
 * - 13.3: 単位フィールド（全角3文字/半角6文字）超過を防止
 * - 9.3: 調整係数の入力可能範囲（-9.99〜9.99）検証
 * - 10.3: 丸め設定の入力可能範囲（-99.99〜99.99）検証
 * - 15.1: 数量フィールドの入力可能範囲（-999999.99〜9999999.99）検証
 * - 15.3: 寸法・ピッチ計算フィールドの入力可能範囲（0.01〜9999999.99）検証
 * - 9.4: 調整係数フィールドの空白時に「1.00」を自動設定
 * - 10.4: 丸め設定フィールドの0または空白時に「0.01」を自動設定
 * - 15.2: 数量フィールドの空白時に「0」を自動設定
 *
 * Task 11: フィールドバリデーションサービスの拡張
 *
 * @module __tests__/unit/services/quantity-field-validation.service.test
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  QuantityFieldValidationService,
  FIELD_CONSTRAINTS,
} from '../../../services/quantity-field-validation.service.js';

describe('QuantityFieldValidationService', () => {
  let service: QuantityFieldValidationService;

  beforeEach(() => {
    service = new QuantityFieldValidationService();
  });

  describe('Task 11.1: テキストフィールドの文字数制限バリデーション', () => {
    describe('calculateStringWidth - 文字幅計算', () => {
      it('半角英数字は1文字として計算される', () => {
        expect(service.calculateStringWidth('abc123')).toBe(6);
      });

      it('全角文字は2文字として計算される', () => {
        expect(service.calculateStringWidth('あいう')).toBe(6);
      });

      it('全角と半角の混在文字列を正しく計算する', () => {
        // あ(2) + い(2) + abc(3) = 7
        expect(service.calculateStringWidth('あいabc')).toBe(7);
      });

      it('空文字列は0を返す', () => {
        expect(service.calculateStringWidth('')).toBe(0);
      });

      it('半角カタカナは1文字として計算される', () => {
        expect(service.calculateStringWidth('ｱｲｳ')).toBe(3);
      });

      it('全角カタカナは2文字として計算される', () => {
        expect(service.calculateStringWidth('アイウ')).toBe(6);
      });

      it('全角数字・記号は2文字として計算される', () => {
        expect(service.calculateStringWidth('０１２')).toBe(6);
      });
    });

    describe('validateTextLength - テキスト長検証', () => {
      it('制限内の文字列は有効と判定される', () => {
        const result = service.validateTextLength('test', 25, 50);
        expect(result).toBe(true);
      });

      it('半角50文字ちょうどは有効', () => {
        const text = 'a'.repeat(50);
        const result = service.validateTextLength(text, 25, 50);
        expect(result).toBe(true);
      });

      it('半角51文字は無効', () => {
        const text = 'a'.repeat(51);
        const result = service.validateTextLength(text, 25, 50);
        expect(result).toBe(false);
      });

      it('全角25文字ちょうどは有効', () => {
        const text = 'あ'.repeat(25);
        const result = service.validateTextLength(text, 25, 50);
        expect(result).toBe(true);
      });

      it('全角26文字は無効', () => {
        const text = 'あ'.repeat(26);
        const result = service.validateTextLength(text, 25, 50);
        expect(result).toBe(false);
      });

      it('全角半角混在で幅50以内は有効', () => {
        // あ(2)*20 + a(1)*10 = 50
        const text = 'あ'.repeat(20) + 'a'.repeat(10);
        const result = service.validateTextLength(text, 25, 50);
        expect(result).toBe(true);
      });

      it('全角半角混在で幅51は無効', () => {
        // あ(2)*20 + a(1)*11 = 51
        const text = 'あ'.repeat(20) + 'a'.repeat(11);
        const result = service.validateTextLength(text, 25, 50);
        expect(result).toBe(false);
      });
    });

    describe('フィールド別文字数検証', () => {
      it('大項目（全角25/半角50）の検証 (Requirements: 13.1)', () => {
        const validResult = service.validateMajorCategory('テスト大項目');
        expect(validResult.isValid).toBe(true);

        const invalidResult = service.validateMajorCategory('a'.repeat(51));
        expect(invalidResult.isValid).toBe(false);
        expect(invalidResult.error).toContain('50');
      });

      it('中項目（全角25/半角50）の検証 (Requirements: 13.1)', () => {
        const validResult = service.validateMiddleCategory('テスト中項目');
        expect(validResult.isValid).toBe(true);

        const invalidResult = service.validateMiddleCategory('あ'.repeat(26));
        expect(invalidResult.isValid).toBe(false);
      });

      it('小項目（全角25/半角50）の検証 (Requirements: 13.1)', () => {
        const validResult = service.validateMinorCategory('テスト小項目');
        expect(validResult.isValid).toBe(true);

        const invalidResult = service.validateMinorCategory('a'.repeat(51));
        expect(invalidResult.isValid).toBe(false);
      });

      it('任意分類（全角25/半角50）の検証 (Requirements: 13.1)', () => {
        const validResult = service.validateCustomCategory('任意分類');
        expect(validResult.isValid).toBe(true);

        const invalidResult = service.validateCustomCategory('あ'.repeat(26));
        expect(invalidResult.isValid).toBe(false);
      });

      it('工種（全角8/半角16）の検証 (Requirements: 13.2)', () => {
        const validResult = service.validateWorkType('工種名');
        expect(validResult.isValid).toBe(true);

        // 全角9文字は無効
        const invalidResult = service.validateWorkType('あ'.repeat(9));
        expect(invalidResult.isValid).toBe(false);
        expect(invalidResult.error).toContain('16');

        // 半角17文字は無効
        const invalidResult2 = service.validateWorkType('a'.repeat(17));
        expect(invalidResult2.isValid).toBe(false);
      });

      it('名称（全角25/半角50）の検証 (Requirements: 13.1)', () => {
        const validResult = service.validateName('名称テスト');
        expect(validResult.isValid).toBe(true);

        const invalidResult = service.validateName('a'.repeat(51));
        expect(invalidResult.isValid).toBe(false);
      });

      it('規格（全角25/半角50）の検証 (Requirements: 13.1)', () => {
        const validResult = service.validateSpecification('規格');
        expect(validResult.isValid).toBe(true);

        const invalidResult = service.validateSpecification('あ'.repeat(26));
        expect(invalidResult.isValid).toBe(false);
      });

      it('単位（全角3/半角6）の検証 (Requirements: 13.3)', () => {
        const validResult = service.validateUnit('式');
        expect(validResult.isValid).toBe(true);

        // 全角4文字は無効
        const invalidResult = service.validateUnit('あいうえ');
        expect(invalidResult.isValid).toBe(false);
        expect(invalidResult.error).toContain('6');

        // 半角7文字は無効
        const invalidResult2 = service.validateUnit('a'.repeat(7));
        expect(invalidResult2.isValid).toBe(false);
      });

      it('計算方法（全角25/半角50）の検証 (Requirements: 13.1)', () => {
        const validResult = service.validateCalculationMethodText('標準');
        expect(validResult.isValid).toBe(true);

        const invalidResult = service.validateCalculationMethodText('a'.repeat(51));
        expect(invalidResult.isValid).toBe(false);
      });

      it('備考（全角25/半角50）の検証 (Requirements: 13.1)', () => {
        const validResult = service.validateRemarks('備考テスト');
        expect(validResult.isValid).toBe(true);

        const invalidResult = service.validateRemarks('あ'.repeat(26));
        expect(invalidResult.isValid).toBe(false);
      });
    });
  });

  describe('Task 11.2: 数値フィールドの範囲バリデーション', () => {
    describe('validateNumericRange - 数値範囲検証', () => {
      it('範囲内の値は有効', () => {
        const result = service.validateNumericRange(5, -10, 10);
        expect(result.isValid).toBe(true);
      });

      it('最小値ちょうどは有効', () => {
        const result = service.validateNumericRange(-10, -10, 10);
        expect(result.isValid).toBe(true);
      });

      it('最大値ちょうどは有効', () => {
        const result = service.validateNumericRange(10, -10, 10);
        expect(result.isValid).toBe(true);
      });

      it('最小値未満は無効', () => {
        const result = service.validateNumericRange(-11, -10, 10);
        expect(result.isValid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
      });

      it('最大値超過は無効', () => {
        const result = service.validateNumericRange(11, -10, 10);
        expect(result.isValid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
      });
    });

    describe('validateAdjustmentFactor - 調整係数検証 (Requirements: 9.3)', () => {
      it('範囲内（-9.99〜9.99）の値は有効', () => {
        const result = service.validateAdjustmentFactor(1.5);
        expect(result.isValid).toBe(true);
      });

      it('最小値-9.99は有効', () => {
        const result = service.validateAdjustmentFactor(-9.99);
        expect(result.isValid).toBe(true);
      });

      it('最大値9.99は有効', () => {
        const result = service.validateAdjustmentFactor(9.99);
        expect(result.isValid).toBe(true);
      });

      it('最小値未満（-10）は無効', () => {
        const result = service.validateAdjustmentFactor(-10);
        expect(result.isValid).toBe(false);
        expect(result.errors).toContainEqual(
          expect.objectContaining({
            field: 'adjustmentFactor',
          })
        );
      });

      it('最大値超過（10）は無効', () => {
        const result = service.validateAdjustmentFactor(10);
        expect(result.isValid).toBe(false);
      });
    });

    describe('validateRoundingUnit - 丸め設定検証 (Requirements: 10.3)', () => {
      it('範囲内（-99.99〜99.99）の値は有効', () => {
        const result = service.validateRoundingUnit(0.01);
        expect(result.isValid).toBe(true);
      });

      it('最小値-99.99は有効', () => {
        const result = service.validateRoundingUnit(-99.99);
        expect(result.isValid).toBe(true);
      });

      it('最大値99.99は有効', () => {
        const result = service.validateRoundingUnit(99.99);
        expect(result.isValid).toBe(true);
      });

      it('最小値未満（-100）は無効', () => {
        const result = service.validateRoundingUnit(-100);
        expect(result.isValid).toBe(false);
        expect(result.errors).toContainEqual(
          expect.objectContaining({
            field: 'roundingUnit',
          })
        );
      });

      it('最大値超過（100）は無効', () => {
        const result = service.validateRoundingUnit(100);
        expect(result.isValid).toBe(false);
      });
    });

    describe('validateQuantity - 数量検証 (Requirements: 15.1)', () => {
      it('範囲内（-999999.99〜9999999.99）の値は有効', () => {
        const result = service.validateQuantity(12345.67);
        expect(result.isValid).toBe(true);
      });

      it('最小値-999999.99は有効', () => {
        const result = service.validateQuantity(-999999.99);
        expect(result.isValid).toBe(true);
      });

      it('最大値9999999.99は有効', () => {
        const result = service.validateQuantity(9999999.99);
        expect(result.isValid).toBe(true);
      });

      it('最小値未満（-1000000）は無効', () => {
        const result = service.validateQuantity(-1000000);
        expect(result.isValid).toBe(false);
        expect(result.errors).toContainEqual(
          expect.objectContaining({
            field: 'quantity',
          })
        );
      });

      it('最大値超過（10000000）は無効', () => {
        const result = service.validateQuantity(10000000);
        expect(result.isValid).toBe(false);
      });
    });

    describe('validateDimensionField - 寸法フィールド検証 (Requirements: 15.3)', () => {
      it('範囲内（0.01〜9999999.99）の値は有効', () => {
        const result = service.validateDimensionField(100.5);
        expect(result.isValid).toBe(true);
      });

      it('最小値0.01は有効', () => {
        const result = service.validateDimensionField(0.01);
        expect(result.isValid).toBe(true);
      });

      it('最大値9999999.99は有効', () => {
        const result = service.validateDimensionField(9999999.99);
        expect(result.isValid).toBe(true);
      });

      it('nullは有効（空白許可）', () => {
        const result = service.validateDimensionField(null);
        expect(result.isValid).toBe(true);
      });

      it('最小値未満（0）は無効', () => {
        const result = service.validateDimensionField(0);
        expect(result.isValid).toBe(false);
      });

      it('最小値未満（0.001）は無効', () => {
        const result = service.validateDimensionField(0.001);
        expect(result.isValid).toBe(false);
      });

      it('最大値超過（10000000）は無効', () => {
        const result = service.validateDimensionField(10000000);
        expect(result.isValid).toBe(false);
      });
    });
  });

  describe('Task 11.3: 空白・デフォルト値の自動設定', () => {
    describe('applyAdjustmentFactorDefault - 調整係数デフォルト (Requirements: 9.4)', () => {
      it('nullの場合は1.00を返す', () => {
        const result = service.applyAdjustmentFactorDefault(null);
        expect(result).toBe(1.0);
      });

      it('undefinedの場合は1.00を返す', () => {
        const result = service.applyAdjustmentFactorDefault(undefined);
        expect(result).toBe(1.0);
      });

      it('有効な数値はそのまま返す', () => {
        const result = service.applyAdjustmentFactorDefault(1.5);
        expect(result).toBe(1.5);
      });
    });

    describe('applyRoundingUnitDefault - 丸め設定デフォルト (Requirements: 10.4)', () => {
      it('nullの場合は0.01を返す', () => {
        const result = service.applyRoundingUnitDefault(null);
        expect(result).toBe(0.01);
      });

      it('undefinedの場合は0.01を返す', () => {
        const result = service.applyRoundingUnitDefault(undefined);
        expect(result).toBe(0.01);
      });

      it('0の場合は0.01を返す', () => {
        const result = service.applyRoundingUnitDefault(0);
        expect(result).toBe(0.01);
      });

      it('有効な数値はそのまま返す', () => {
        const result = service.applyRoundingUnitDefault(0.25);
        expect(result).toBe(0.25);
      });
    });

    describe('applyQuantityDefault - 数量デフォルト (Requirements: 15.2)', () => {
      it('nullの場合は0を返す', () => {
        const result = service.applyQuantityDefault(null);
        expect(result).toBe(0);
      });

      it('undefinedの場合は0を返す', () => {
        const result = service.applyQuantityDefault(undefined);
        expect(result).toBe(0);
      });

      it('有効な数値はそのまま返す', () => {
        const result = service.applyQuantityDefault(100);
        expect(result).toBe(100);
      });
    });
  });

  describe('formatDecimal2 - 小数2桁表示', () => {
    it('整数を小数2桁で表示する', () => {
      expect(service.formatDecimal2(1)).toBe('1.00');
    });

    it('小数1桁を小数2桁で表示する', () => {
      expect(service.formatDecimal2(1.5)).toBe('1.50');
    });

    it('小数2桁はそのまま表示する', () => {
      expect(service.formatDecimal2(1.23)).toBe('1.23');
    });

    it('小数3桁以上は2桁に丸める', () => {
      expect(service.formatDecimal2(1.234)).toBe('1.23');
    });

    it('負の数も正しく表示する', () => {
      expect(service.formatDecimal2(-1.5)).toBe('-1.50');
    });

    it('0は0.00と表示する', () => {
      expect(service.formatDecimal2(0)).toBe('0.00');
    });
  });

  describe('formatConditionalDecimal2 - 条件付き書式設定', () => {
    it('数値入力時は小数2桁で表示する', () => {
      expect(service.formatConditionalDecimal2(1.5)).toBe('1.50');
    });

    it('nullは空文字を返す', () => {
      expect(service.formatConditionalDecimal2(null)).toBe('');
    });

    it('undefinedは空文字を返す', () => {
      expect(service.formatConditionalDecimal2(undefined)).toBe('');
    });
  });

  describe('FIELD_CONSTRAINTS 定数', () => {
    it('テキストフィールド制約が正しく定義されている', () => {
      expect(FIELD_CONSTRAINTS.MAJOR_CATEGORY).toEqual({ zenkaku: 25, hankaku: 50 });
      expect(FIELD_CONSTRAINTS.WORK_TYPE).toEqual({ zenkaku: 8, hankaku: 16 });
      expect(FIELD_CONSTRAINTS.UNIT).toEqual({ zenkaku: 3, hankaku: 6 });
    });

    it('数値フィールド制約が正しく定義されている', () => {
      expect(FIELD_CONSTRAINTS.ADJUSTMENT_FACTOR).toEqual({
        min: -9.99,
        max: 9.99,
        default: 1.0,
      });
      expect(FIELD_CONSTRAINTS.ROUNDING_UNIT).toEqual({
        min: -99.99,
        max: 99.99,
        default: 0.01,
      });
      expect(FIELD_CONSTRAINTS.QUANTITY).toEqual({
        min: -999999.99,
        max: 9999999.99,
        default: 0,
      });
      expect(FIELD_CONSTRAINTS.DIMENSION).toEqual({
        min: 0.01,
        max: 9999999.99,
      });
    });
  });
});
