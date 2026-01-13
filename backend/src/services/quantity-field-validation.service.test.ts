/**
 * @fileoverview 数量項目フィールドバリデーションサービステスト
 *
 * Task 14.2: 保存時バリデーションにフィールド仕様チェックを追加する
 *
 * Requirements:
 * - 11.2: 保存前にすべてのフィールドの文字数・範囲をサーバーサイドで再検証する
 * - 11.3: バリデーションエラー時にエラー箇所を特定する
 * - 11.4: フィールド仕様違反の詳細なエラーメッセージを返却する
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  QuantityFieldValidationService,
  FIELD_CONSTRAINTS,
} from './quantity-field-validation.service.js';

describe('QuantityFieldValidationService', () => {
  let service: QuantityFieldValidationService;

  beforeEach(() => {
    service = new QuantityFieldValidationService();
  });

  // ==========================================================================
  // 文字幅計算
  // ==========================================================================
  describe('calculateStringWidth - 文字幅計算', () => {
    it('半角英数字は幅1としてカウントされる', () => {
      expect(service.calculateStringWidth('abc123')).toBe(6);
    });

    it('全角文字は幅2としてカウントされる', () => {
      expect(service.calculateStringWidth('あいう')).toBe(6);
    });

    it('半角カタカナは幅1としてカウントされる', () => {
      expect(service.calculateStringWidth('ｱｲｳ')).toBe(3);
    });

    it('混在文字列は正しくカウントされる', () => {
      expect(service.calculateStringWidth('aあ1い')).toBe(6); // 1+2+1+2
    });

    it('空文字列は幅0を返す', () => {
      expect(service.calculateStringWidth('')).toBe(0);
    });
  });

  // ==========================================================================
  // テキストフィールド検証
  // ==========================================================================
  describe('validateTextLength - テキスト長検証', () => {
    it('幅が最大値以下の場合trueを返す', () => {
      expect(service.validateTextLength('abc', 25, 50)).toBe(true);
    });

    it('幅が最大値を超える場合falseを返す', () => {
      expect(service.validateTextLength('a'.repeat(51), 25, 50)).toBe(false);
    });
  });

  describe('個別テキストフィールド検証', () => {
    it('validateMajorCategory - 有効な値', () => {
      const result = service.validateMajorCategory('建築工事');
      expect(result.isValid).toBe(true);
    });

    it('validateMajorCategory - 無効な値', () => {
      const result = service.validateMajorCategory('あ'.repeat(26));
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('大項目');
    });

    it('validateMiddleCategory - 有効な値', () => {
      const result = service.validateMiddleCategory('内装工事');
      expect(result.isValid).toBe(true);
    });

    it('validateMinorCategory - 有効な値', () => {
      const result = service.validateMinorCategory('床工事');
      expect(result.isValid).toBe(true);
    });

    it('validateCustomCategory - 有効な値', () => {
      const result = service.validateCustomCategory('特殊分類');
      expect(result.isValid).toBe(true);
    });

    it('validateWorkType - 有効な値', () => {
      const result = service.validateWorkType('足場工事');
      expect(result.isValid).toBe(true);
    });

    it('validateWorkType - 無効な値（8文字超過）', () => {
      const result = service.validateWorkType('あ'.repeat(9));
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('工種');
    });

    it('validateName - 有効な値', () => {
      const result = service.validateName('外部足場');
      expect(result.isValid).toBe(true);
    });

    it('validateSpecification - 有効な値', () => {
      const result = service.validateSpecification('H=10m');
      expect(result.isValid).toBe(true);
    });

    it('validateUnit - 有効な値', () => {
      const result = service.validateUnit('m2');
      expect(result.isValid).toBe(true);
    });

    it('validateUnit - 無効な値（3文字超過）', () => {
      const result = service.validateUnit('あいうえ');
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('単位');
    });

    it('validateCalculationMethodText - 有効な値', () => {
      const result = service.validateCalculationMethodText('長さ×幅');
      expect(result.isValid).toBe(true);
    });

    it('validateRemarks - 有効な値', () => {
      const result = service.validateRemarks('備考テスト');
      expect(result.isValid).toBe(true);
    });
  });

  // ==========================================================================
  // 数値フィールド検証
  // ==========================================================================
  describe('validateNumericRange - 数値範囲検証', () => {
    it('範囲内の値は有効', () => {
      const result = service.validateNumericRange(5, 0, 10);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('最小値未満はエラー', () => {
      const result = service.validateNumericRange(-1, 0, 10);
      expect(result.isValid).toBe(false);
      expect(result.errors).toHaveLength(1);
    });

    it('最大値超過はエラー', () => {
      const result = service.validateNumericRange(11, 0, 10);
      expect(result.isValid).toBe(false);
      expect(result.errors).toHaveLength(1);
    });

    it('境界値（最小値）は有効', () => {
      const result = service.validateNumericRange(0, 0, 10);
      expect(result.isValid).toBe(true);
    });

    it('境界値（最大値）は有効', () => {
      const result = service.validateNumericRange(10, 0, 10);
      expect(result.isValid).toBe(true);
    });
  });

  describe('validateAdjustmentFactor - 調整係数検証', () => {
    it('範囲内（-9.99〜9.99）の値は有効', () => {
      const result = service.validateAdjustmentFactor(1.5);
      expect(result.isValid).toBe(true);
    });

    it('境界値（-9.99）は有効', () => {
      const result = service.validateAdjustmentFactor(FIELD_CONSTRAINTS.ADJUSTMENT_FACTOR.min);
      expect(result.isValid).toBe(true);
    });

    it('境界値（9.99）は有効', () => {
      const result = service.validateAdjustmentFactor(FIELD_CONSTRAINTS.ADJUSTMENT_FACTOR.max);
      expect(result.isValid).toBe(true);
    });

    it('範囲外の値はエラー', () => {
      const result = service.validateAdjustmentFactor(10);
      expect(result.isValid).toBe(false);
      expect(result.errors[0]?.field).toBe('adjustmentFactor');
    });

    it('負の範囲外の値はエラー', () => {
      const result = service.validateAdjustmentFactor(-10);
      expect(result.isValid).toBe(false);
    });
  });

  describe('validateRoundingUnit - 丸め設定検証', () => {
    it('範囲内（-99.99〜99.99）の値は有効', () => {
      const result = service.validateRoundingUnit(0.01);
      expect(result.isValid).toBe(true);
    });

    it('境界値（-99.99）は有効', () => {
      const result = service.validateRoundingUnit(FIELD_CONSTRAINTS.ROUNDING_UNIT.min);
      expect(result.isValid).toBe(true);
    });

    it('境界値（99.99）は有効', () => {
      const result = service.validateRoundingUnit(FIELD_CONSTRAINTS.ROUNDING_UNIT.max);
      expect(result.isValid).toBe(true);
    });

    it('範囲外の値はエラー', () => {
      const result = service.validateRoundingUnit(100);
      expect(result.isValid).toBe(false);
      expect(result.errors[0]?.field).toBe('roundingUnit');
    });
  });

  describe('validateQuantity - 数量検証', () => {
    it('範囲内の値は有効', () => {
      const result = service.validateQuantity(1000);
      expect(result.isValid).toBe(true);
    });

    it('境界値（-999999.99）は有効', () => {
      const result = service.validateQuantity(FIELD_CONSTRAINTS.QUANTITY.min);
      expect(result.isValid).toBe(true);
    });

    it('境界値（9999999.99）は有効', () => {
      const result = service.validateQuantity(FIELD_CONSTRAINTS.QUANTITY.max);
      expect(result.isValid).toBe(true);
    });

    it('範囲外の値はエラー', () => {
      const result = service.validateQuantity(10000000);
      expect(result.isValid).toBe(false);
      expect(result.errors[0]?.field).toBe('quantity');
    });

    it('負の範囲外の値はエラー', () => {
      const result = service.validateQuantity(-1000000);
      expect(result.isValid).toBe(false);
    });
  });

  describe('validateDimensionField - 寸法フィールド検証', () => {
    it('範囲内の値は有効', () => {
      const result = service.validateDimensionField(100);
      expect(result.isValid).toBe(true);
    });

    it('nullは有効（空白許可）', () => {
      const result = service.validateDimensionField(null);
      expect(result.isValid).toBe(true);
    });

    it('境界値（0.01）は有効', () => {
      const result = service.validateDimensionField(FIELD_CONSTRAINTS.DIMENSION.min);
      expect(result.isValid).toBe(true);
    });

    it('境界値（9999999.99）は有効', () => {
      const result = service.validateDimensionField(FIELD_CONSTRAINTS.DIMENSION.max);
      expect(result.isValid).toBe(true);
    });

    it('最小値未満はエラー', () => {
      const result = service.validateDimensionField(0.001);
      expect(result.isValid).toBe(false);
      expect(result.errors[0]?.field).toBe('dimension');
    });

    it('最大値超過はエラー', () => {
      const result = service.validateDimensionField(10000000);
      expect(result.isValid).toBe(false);
    });
  });

  // ==========================================================================
  // デフォルト値適用
  // ==========================================================================
  describe('applyAdjustmentFactorDefault - 調整係数デフォルト値', () => {
    it('nullの場合1.0を返す', () => {
      expect(service.applyAdjustmentFactorDefault(null)).toBe(1.0);
    });

    it('undefinedの場合1.0を返す', () => {
      expect(service.applyAdjustmentFactorDefault(undefined)).toBe(1.0);
    });

    it('値がある場合はそのまま返す', () => {
      expect(service.applyAdjustmentFactorDefault(2.5)).toBe(2.5);
    });

    it('0の場合はそのまま返す', () => {
      expect(service.applyAdjustmentFactorDefault(0)).toBe(0);
    });
  });

  describe('applyRoundingUnitDefault - 丸め設定デフォルト値', () => {
    it('nullの場合0.01を返す', () => {
      expect(service.applyRoundingUnitDefault(null)).toBe(0.01);
    });

    it('undefinedの場合0.01を返す', () => {
      expect(service.applyRoundingUnitDefault(undefined)).toBe(0.01);
    });

    it('0の場合0.01を返す', () => {
      expect(service.applyRoundingUnitDefault(0)).toBe(0.01);
    });

    it('値がある場合はそのまま返す', () => {
      expect(service.applyRoundingUnitDefault(0.1)).toBe(0.1);
    });
  });

  describe('applyQuantityDefault - 数量デフォルト値', () => {
    it('nullの場合0を返す', () => {
      expect(service.applyQuantityDefault(null)).toBe(0);
    });

    it('undefinedの場合0を返す', () => {
      expect(service.applyQuantityDefault(undefined)).toBe(0);
    });

    it('値がある場合はそのまま返す', () => {
      expect(service.applyQuantityDefault(100)).toBe(100);
    });

    it('0の場合はそのまま返す', () => {
      expect(service.applyQuantityDefault(0)).toBe(0);
    });
  });

  // ==========================================================================
  // 書式設定
  // ==========================================================================
  describe('formatDecimal2 - 小数2桁書式', () => {
    it('整数を小数2桁に書式設定する', () => {
      expect(service.formatDecimal2(1)).toBe('1.00');
    });

    it('小数1桁を小数2桁に書式設定する', () => {
      expect(service.formatDecimal2(1.5)).toBe('1.50');
    });

    it('小数2桁はそのまま', () => {
      expect(service.formatDecimal2(1.23)).toBe('1.23');
    });

    it('小数3桁以上は四捨五入される', () => {
      expect(service.formatDecimal2(1.235)).toBe('1.24');
      expect(service.formatDecimal2(1.234)).toBe('1.23');
    });

    it('負の数も正しく書式設定される', () => {
      expect(service.formatDecimal2(-1.5)).toBe('-1.50');
    });
  });

  describe('formatConditionalDecimal2 - 条件付き小数2桁書式', () => {
    it('nullの場合空文字を返す', () => {
      expect(service.formatConditionalDecimal2(null)).toBe('');
    });

    it('undefinedの場合空文字を返す', () => {
      expect(service.formatConditionalDecimal2(undefined)).toBe('');
    });

    it('数値の場合小数2桁に書式設定する', () => {
      expect(service.formatConditionalDecimal2(1)).toBe('1.00');
    });

    it('0の場合も書式設定される', () => {
      expect(service.formatConditionalDecimal2(0)).toBe('0.00');
    });
  });
});

// ==========================================================================
// Task 14.2 テスト
// ==========================================================================
describe('QuantityFieldValidationService - Task 14.2', () => {
  let service: QuantityFieldValidationService;

  beforeEach(() => {
    service = new QuantityFieldValidationService();
  });

  describe('validateItemFieldSpecs - フィールド仕様検証', () => {
    describe('テキストフィールドの文字数検証', () => {
      it('全てのテキストフィールドが有効な場合、エラーは返されない', () => {
        const validItem = {
          majorCategory: '建築工事',
          middleCategory: '内装仕上工事',
          minorCategory: '床工事',
          customCategory: '特殊分類',
          workType: '足場工事',
          name: '外部足場',
          specification: 'H=10m',
          unit: 'm2',
          remarks: '備考',
          adjustmentFactor: 1.0,
          roundingUnit: 0.01,
          quantity: 100.0,
        };

        const result = service.validateItemFieldSpecs(validItem);

        expect(result.isValid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it('大項目が全角25文字を超えた場合、エラーが返される', () => {
        const invalidItem = {
          majorCategory: 'あ'.repeat(26), // 全角26文字（超過）
          middleCategory: null,
          minorCategory: null,
          customCategory: null,
          workType: '足場工事',
          name: '外部足場',
          specification: null,
          unit: 'm2',
          remarks: null,
          adjustmentFactor: 1.0,
          roundingUnit: 0.01,
          quantity: 100.0,
        };

        const result = service.validateItemFieldSpecs(invalidItem);

        expect(result.isValid).toBe(false);
        expect(result.errors).toContainEqual({
          field: 'majorCategory',
          message: '大項目は全角25文字/半角50文字以内で入力してください',
          value: invalidItem.majorCategory,
        });
      });

      it('工種が全角8文字を超えた場合、エラーが返される', () => {
        const invalidItem = {
          majorCategory: '建築工事',
          middleCategory: null,
          minorCategory: null,
          customCategory: null,
          workType: 'あ'.repeat(9), // 全角9文字（超過）
          name: '外部足場',
          specification: null,
          unit: 'm2',
          remarks: null,
          adjustmentFactor: 1.0,
          roundingUnit: 0.01,
          quantity: 100.0,
        };

        const result = service.validateItemFieldSpecs(invalidItem);

        expect(result.isValid).toBe(false);
        expect(result.errors).toContainEqual({
          field: 'workType',
          message: '工種は全角8文字/半角16文字以内で入力してください',
          value: invalidItem.workType,
        });
      });

      it('単位が全角3文字を超えた場合、エラーが返される', () => {
        const invalidItem = {
          majorCategory: '建築工事',
          middleCategory: null,
          minorCategory: null,
          customCategory: null,
          workType: '足場工事',
          name: '外部足場',
          specification: null,
          unit: 'あいうえ', // 全角4文字（超過）
          remarks: null,
          adjustmentFactor: 1.0,
          roundingUnit: 0.01,
          quantity: 100.0,
        };

        const result = service.validateItemFieldSpecs(invalidItem);

        expect(result.isValid).toBe(false);
        expect(result.errors).toContainEqual({
          field: 'unit',
          message: '単位は全角3文字/半角6文字以内で入力してください',
          value: invalidItem.unit,
        });
      });

      it('半角文字は幅1、全角文字は幅2としてカウントされる', () => {
        const mixedItem = {
          majorCategory: 'あaいbうcえdおeかfきgくhけiこj', // 10全角(20) + 10半角(10) = 30幅
          middleCategory: null,
          minorCategory: null,
          customCategory: null,
          workType: '足場工事',
          name: '外部足場',
          specification: null,
          unit: 'm2',
          remarks: null,
          adjustmentFactor: 1.0,
          roundingUnit: 0.01,
          quantity: 100.0,
        };

        const result = service.validateItemFieldSpecs(mixedItem);

        expect(result.isValid).toBe(true);
      });
    });

    describe('数値フィールドの範囲検証', () => {
      it('調整係数が範囲外（-9.99〜9.99）の場合、エラーが返される', () => {
        const invalidItem = {
          majorCategory: '建築工事',
          middleCategory: null,
          minorCategory: null,
          customCategory: null,
          workType: '足場工事',
          name: '外部足場',
          specification: null,
          unit: 'm2',
          remarks: null,
          adjustmentFactor: 10.0, // 範囲外
          roundingUnit: 0.01,
          quantity: 100.0,
        };

        const result = service.validateItemFieldSpecs(invalidItem);

        expect(result.isValid).toBe(false);
        expect(result.errors).toContainEqual({
          field: 'adjustmentFactor',
          message: '調整係数は-9.99から9.99の範囲で入力してください',
          value: 10.0,
        });
      });

      it('丸め設定が範囲外（0.01〜999.99）の場合、エラーが返される', () => {
        const invalidItem = {
          majorCategory: '建築工事',
          middleCategory: null,
          minorCategory: null,
          customCategory: null,
          workType: '足場工事',
          name: '外部足場',
          specification: null,
          unit: 'm2',
          remarks: null,
          adjustmentFactor: 1.0,
          roundingUnit: 0.001, // 範囲外（小さすぎる）
          quantity: 100.0,
        };

        const result = service.validateItemFieldSpecs(invalidItem);

        expect(result.isValid).toBe(false);
        expect(result.errors).toContainEqual({
          field: 'roundingUnit',
          message: '丸め設定は0.01から999.99の範囲で入力してください',
          value: 0.001,
        });
      });

      it('数量が範囲外（-999999.99〜9999999.99）の場合、エラーが返される', () => {
        const invalidItem = {
          majorCategory: '建築工事',
          middleCategory: null,
          minorCategory: null,
          customCategory: null,
          workType: '足場工事',
          name: '外部足場',
          specification: null,
          unit: 'm2',
          remarks: null,
          adjustmentFactor: 1.0,
          roundingUnit: 0.01,
          quantity: 10000000.0, // 範囲外
        };

        const result = service.validateItemFieldSpecs(invalidItem);

        expect(result.isValid).toBe(false);
        expect(result.errors).toContainEqual({
          field: 'quantity',
          message: '数量は-999999.99から9999999.99の範囲で入力してください',
          value: 10000000.0,
        });
      });
    });

    describe('複数フィールドエラー', () => {
      it('複数のフィールドにエラーがある場合、全てのエラーが返される', () => {
        const invalidItem = {
          majorCategory: 'あ'.repeat(26), // エラー
          middleCategory: null,
          minorCategory: null,
          customCategory: null,
          workType: 'あ'.repeat(9), // エラー
          name: '外部足場',
          specification: null,
          unit: 'あいうえ', // エラー
          remarks: null,
          adjustmentFactor: 10.0, // エラー
          roundingUnit: 0.01,
          quantity: 100.0,
        };

        const result = service.validateItemFieldSpecs(invalidItem);

        expect(result.isValid).toBe(false);
        expect(result.errors.length).toBe(4);
        expect(result.errors.map((e) => e.field)).toContain('majorCategory');
        expect(result.errors.map((e) => e.field)).toContain('workType');
        expect(result.errors.map((e) => e.field)).toContain('unit');
        expect(result.errors.map((e) => e.field)).toContain('adjustmentFactor');
      });
    });

    describe('null/undefinedフィールドの処理', () => {
      it('nullのオプションフィールドはバリデーションをスキップする', () => {
        const validItem = {
          majorCategory: '建築工事',
          middleCategory: null,
          minorCategory: null,
          customCategory: null,
          workType: '足場工事',
          name: '外部足場',
          specification: null,
          unit: 'm2',
          remarks: null,
          adjustmentFactor: 1.0,
          roundingUnit: 0.01,
          quantity: 100.0,
        };

        const result = service.validateItemFieldSpecs(validItem);

        expect(result.isValid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });
    });
  });

  describe('createValidationErrorResponse - エラーレスポンス生成', () => {
    it('フィールド仕様違反の詳細なエラーメッセージを含むレスポンスを生成する', () => {
      const errors = [
        {
          field: 'majorCategory',
          message: '大項目は全角25文字/半角50文字以内で入力してください',
          value: 'あ'.repeat(26),
        },
        {
          field: 'workType',
          message: '工種は全角8文字/半角16文字以内で入力してください',
          value: 'あ'.repeat(9),
        },
      ];

      const response = service.createValidationErrorResponse(errors);

      expect(response.type).toBe('https://architrack.example.com/problems/field-validation-error');
      expect(response.title).toBe('Field Validation Error');
      expect(response.status).toBe(400);
      expect(response.code).toBe('FIELD_VALIDATION_ERROR');
      expect(response.fieldErrors).toHaveLength(2);
      expect(response.fieldErrors[0]).toEqual({
        field: 'majorCategory',
        message: '大項目は全角25文字/半角50文字以内で入力してください',
        value: 'あ'.repeat(26),
      });
    });

    it('エラーメッセージは日本語で返される', () => {
      const errors = [
        {
          field: 'quantity',
          message: '数量は-999999.99から9999999.99の範囲で入力してください',
          value: 10000000,
        },
      ];

      const response = service.createValidationErrorResponse(errors);

      expect(response.detail).toContain('数量は-999999.99から9999999.99の範囲で入力してください');
    });
  });
});
