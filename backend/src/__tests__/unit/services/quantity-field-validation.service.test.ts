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

  // ============================================================================
  // Task 13: バリデーションテストの拡張
  // ============================================================================

  describe('Task 13.1: テキストフィールドバリデーションの単体テスト', () => {
    describe('全角/半角混在文字列の文字幅計算テスト (Requirements: 13.1, 13.2, 13.3)', () => {
      it('全角ひらがな・カタカナ・漢字の混在を正しく計算する', () => {
        // あ(2) + イ(2) + 漢(2) = 6
        expect(service.calculateStringWidth('あイ漢')).toBe(6);
      });

      it('半角英数字と全角文字の交互配置を正しく計算する', () => {
        // a(1) + あ(2) + b(1) + い(2) + c(1) = 7
        expect(service.calculateStringWidth('aあbいc')).toBe(7);
      });

      it('全角記号を正しく計算する', () => {
        // ！(2) + ？(2) + ＃(2) = 6
        expect(service.calculateStringWidth('！？＃')).toBe(6);
      });

      it('半角記号を正しく計算する', () => {
        // !(1) + ?(1) + #(1) = 3
        expect(service.calculateStringWidth('!?#')).toBe(3);
      });
    });

    describe('境界値テスト（最大文字数ちょうど、超過、空白）', () => {
      it('大項目: 全角25文字ちょうどは有効', () => {
        const text = '漢'.repeat(25); // 幅50
        const result = service.validateMajorCategory(text);
        expect(result.isValid).toBe(true);
      });

      it('大項目: 全角24文字 + 半角2文字（幅50）は有効', () => {
        const text = '漢'.repeat(24) + 'ab'; // 48 + 2 = 50
        const result = service.validateMajorCategory(text);
        expect(result.isValid).toBe(true);
      });

      it('大項目: 全角24文字 + 半角3文字（幅51）は無効', () => {
        const text = '漢'.repeat(24) + 'abc'; // 48 + 3 = 51
        const result = service.validateMajorCategory(text);
        expect(result.isValid).toBe(false);
      });

      it('工種: 全角8文字ちょうど（幅16）は有効', () => {
        const text = '漢'.repeat(8); // 幅16
        const result = service.validateWorkType(text);
        expect(result.isValid).toBe(true);
      });

      it('工種: 全角7文字 + 半角2文字（幅16）は有効', () => {
        const text = '漢'.repeat(7) + 'ab'; // 14 + 2 = 16
        const result = service.validateWorkType(text);
        expect(result.isValid).toBe(true);
      });

      it('工種: 半角17文字（幅17）は無効', () => {
        const text = 'a'.repeat(17);
        const result = service.validateWorkType(text);
        expect(result.isValid).toBe(false);
      });

      it('単位: 全角3文字ちょうど（幅6）は有効', () => {
        const text = '㎡台式'; // 幅6
        const result = service.validateUnit(text);
        expect(result.isValid).toBe(true);
      });

      it('単位: 半角6文字ちょうど（幅6）は有効', () => {
        const text = 'pieces'.slice(0, 6); // 幅6
        const result = service.validateUnit(text);
        expect(result.isValid).toBe(true);
      });

      it('単位: 全角2文字 + 半角3文字（幅7）は無効', () => {
        const text = '㎡台abc'; // 4 + 3 = 7
        const result = service.validateUnit(text);
        expect(result.isValid).toBe(false);
      });

      it('空白文字列は有効', () => {
        expect(service.validateMajorCategory('').isValid).toBe(true);
        expect(service.validateWorkType('').isValid).toBe(true);
        expect(service.validateUnit('').isValid).toBe(true);
      });
    });

    describe('特殊文字・絵文字・サロゲートペアの取り扱いテスト', () => {
      it('基本絵文字（BMP外）は全角として計算される', () => {
        // 絵文字は通常2幅として扱う
        const emoji = '\u{1F600}'; // 😀
        expect(service.calculateStringWidth(emoji)).toBe(2);
      });

      it('絵文字を含む文字列の幅を正しく計算する', () => {
        // 漢(2) + 😀(2) + a(1) = 5
        const text = '漢\u{1F600}a';
        expect(service.calculateStringWidth(text)).toBe(5);
      });

      it('サロゲートペア文字（𠮷など）を正しく計算する', () => {
        // 𠮷（つちよし）はサロゲートペア
        const text = '\u{20BB7}'; // 𠮷
        expect(service.calculateStringWidth(text)).toBe(2);
      });

      it('複数のサロゲートペア文字を正しく計算する', () => {
        // 𠮷(2) + 𩸽(2) = 4
        const text = '\u{20BB7}\u{29E3D}';
        expect(service.calculateStringWidth(text)).toBe(4);
      });

      it('制御文字を含む文字列を正しく処理する', () => {
        // タブや改行は半角として扱う（ASCII範囲）
        expect(service.calculateStringWidth('\t')).toBe(1);
        expect(service.calculateStringWidth('\n')).toBe(1);
      });

      it('全角スペースは全角として計算される', () => {
        expect(service.calculateStringWidth('\u3000')).toBe(2); // 全角スペース
      });

      it('半角スペースは半角として計算される', () => {
        expect(service.calculateStringWidth(' ')).toBe(1);
      });

      it('複合絵文字シーケンス（家族絵文字など）を正しく処理する', () => {
        // 複合絵文字は複数のコードポイントで構成される
        // for...ofはグラフェムクラスタではなくコードポイント単位で反復
        // 👨‍👩‍👧 = 👨(U+1F468) + ZWJ(U+200D) + 👩(U+1F469) + ZWJ(U+200D) + 👧(U+1F467)
        const family = '\u{1F468}\u200D\u{1F469}\u200D\u{1F467}';
        // 各コードポイント: 1F468(2) + 200D(1) + 1F469(2) + 200D(1) + 1F467(2) = 8
        const width = service.calculateStringWidth(family);
        expect(width).toBeGreaterThan(0);
      });
    });
  });

  describe('Task 13.2: 数値フィールドバリデーションの単体テスト', () => {
    describe('調整係数の範囲検証テスト（-9.99〜9.99）', () => {
      it('正の小数値（1.23）は有効', () => {
        const result = service.validateAdjustmentFactor(1.23);
        expect(result.isValid).toBe(true);
      });

      it('負の小数値（-1.23）は有効', () => {
        const result = service.validateAdjustmentFactor(-1.23);
        expect(result.isValid).toBe(true);
      });

      it('0は有効', () => {
        const result = service.validateAdjustmentFactor(0);
        expect(result.isValid).toBe(true);
      });

      it('境界値テスト: -9.98は有効', () => {
        const result = service.validateAdjustmentFactor(-9.98);
        expect(result.isValid).toBe(true);
      });

      it('境界値テスト: 9.98は有効', () => {
        const result = service.validateAdjustmentFactor(9.98);
        expect(result.isValid).toBe(true);
      });

      it('境界値テスト: -9.991は無効（微小超過）', () => {
        const result = service.validateAdjustmentFactor(-9.991);
        expect(result.isValid).toBe(false);
      });

      it('境界値テスト: 9.991は無効（微小超過）', () => {
        const result = service.validateAdjustmentFactor(9.991);
        expect(result.isValid).toBe(false);
      });
    });

    describe('丸め設定の範囲検証テスト（-99.99〜99.99）', () => {
      it('一般的な丸め値（0.25）は有効', () => {
        const result = service.validateRoundingUnit(0.25);
        expect(result.isValid).toBe(true);
      });

      it('大きな丸め値（50）は有効', () => {
        const result = service.validateRoundingUnit(50);
        expect(result.isValid).toBe(true);
      });

      it('負の丸め値（-0.5）は有効', () => {
        const result = service.validateRoundingUnit(-0.5);
        expect(result.isValid).toBe(true);
      });

      it('境界値テスト: -99.98は有効', () => {
        const result = service.validateRoundingUnit(-99.98);
        expect(result.isValid).toBe(true);
      });

      it('境界値テスト: 99.98は有効', () => {
        const result = service.validateRoundingUnit(99.98);
        expect(result.isValid).toBe(true);
      });

      it('境界値テスト: -99.991は無効（微小超過）', () => {
        const result = service.validateRoundingUnit(-99.991);
        expect(result.isValid).toBe(false);
      });

      it('境界値テスト: 99.991は無効（微小超過）', () => {
        const result = service.validateRoundingUnit(99.991);
        expect(result.isValid).toBe(false);
      });
    });

    describe('数量フィールドの範囲検証テスト（-999999.99〜9999999.99）', () => {
      it('一般的な数量（123.45）は有効', () => {
        const result = service.validateQuantity(123.45);
        expect(result.isValid).toBe(true);
      });

      it('大きな正の数量（5000000）は有効', () => {
        const result = service.validateQuantity(5000000);
        expect(result.isValid).toBe(true);
      });

      it('負の数量（-500000）は有効', () => {
        const result = service.validateQuantity(-500000);
        expect(result.isValid).toBe(true);
      });

      it('境界値テスト: -999999.98は有効', () => {
        const result = service.validateQuantity(-999999.98);
        expect(result.isValid).toBe(true);
      });

      it('境界値テスト: 9999999.98は有効', () => {
        const result = service.validateQuantity(9999999.98);
        expect(result.isValid).toBe(true);
      });

      it('境界値テスト: -999999.991は無効（微小超過）', () => {
        const result = service.validateQuantity(-999999.991);
        expect(result.isValid).toBe(false);
      });

      it('境界値テスト: 9999999.991は無効（微小超過）', () => {
        const result = service.validateQuantity(9999999.991);
        expect(result.isValid).toBe(false);
      });
    });

    describe('寸法・ピッチフィールドの範囲検証テスト（0.01〜9999999.99）', () => {
      it('一般的な寸法値（100）は有効', () => {
        const result = service.validateDimensionField(100);
        expect(result.isValid).toBe(true);
      });

      it('小さな寸法値（0.02）は有効', () => {
        const result = service.validateDimensionField(0.02);
        expect(result.isValid).toBe(true);
      });

      it('大きな寸法値（5000000）は有効', () => {
        const result = service.validateDimensionField(5000000);
        expect(result.isValid).toBe(true);
      });

      it('境界値テスト: 0.009は無効（最小値未満）', () => {
        const result = service.validateDimensionField(0.009);
        expect(result.isValid).toBe(false);
      });

      it('境界値テスト: 0.011は有効', () => {
        const result = service.validateDimensionField(0.011);
        expect(result.isValid).toBe(true);
      });

      it('境界値テスト: 9999999.98は有効', () => {
        const result = service.validateDimensionField(9999999.98);
        expect(result.isValid).toBe(true);
      });

      it('境界値テスト: 9999999.991は無効（微小超過）', () => {
        const result = service.validateDimensionField(9999999.991);
        expect(result.isValid).toBe(false);
      });

      it('負の値（-0.01）は無効', () => {
        const result = service.validateDimensionField(-0.01);
        expect(result.isValid).toBe(false);
      });
    });

    describe('空白・0入力時のデフォルト値設定テスト', () => {
      it('調整係数: 0はそのまま返す（0も有効な値）', () => {
        const result = service.applyAdjustmentFactorDefault(0);
        expect(result).toBe(0);
      });

      it('調整係数: 負の値はそのまま返す', () => {
        const result = service.applyAdjustmentFactorDefault(-1.5);
        expect(result).toBe(-1.5);
      });

      it('丸め設定: NaNはデフォルト値を返さない（NaN入力は別途処理）', () => {
        // NaNはnull/undefinedではないのでそのまま返る
        const result = service.applyRoundingUnitDefault(NaN);
        expect(Number.isNaN(result)).toBe(true);
      });

      it('数量: 0はそのまま返す（0も有効な数量）', () => {
        const result = service.applyQuantityDefault(0);
        expect(result).toBe(0);
      });

      it('数量: 負の値はそのまま返す', () => {
        const result = service.applyQuantityDefault(-100);
        expect(result).toBe(-100);
      });
    });
  });

  describe('Task 13.3: 表示書式変換の単体テスト', () => {
    describe('整数入力時の小数2桁表示変換テスト', () => {
      it('正の整数を小数2桁で表示する', () => {
        expect(service.formatDecimal2(100)).toBe('100.00');
        expect(service.formatDecimal2(999)).toBe('999.00');
        expect(service.formatDecimal2(1234567)).toBe('1234567.00');
      });

      it('負の整数を小数2桁で表示する', () => {
        expect(service.formatDecimal2(-100)).toBe('-100.00');
        expect(service.formatDecimal2(-999)).toBe('-999.00');
      });

      it('0を小数2桁で表示する', () => {
        expect(service.formatDecimal2(0)).toBe('0.00');
      });
    });

    describe('小数1桁入力時の小数2桁表示変換テスト', () => {
      it('正の小数1桁を小数2桁で表示する', () => {
        expect(service.formatDecimal2(1.5)).toBe('1.50');
        expect(service.formatDecimal2(99.9)).toBe('99.90');
        expect(service.formatDecimal2(0.1)).toBe('0.10');
      });

      it('負の小数1桁を小数2桁で表示する', () => {
        expect(service.formatDecimal2(-1.5)).toBe('-1.50');
        expect(service.formatDecimal2(-0.1)).toBe('-0.10');
      });
    });

    describe('空白時の条件付き表示テスト', () => {
      it('nullは空文字列を返す', () => {
        expect(service.formatConditionalDecimal2(null)).toBe('');
      });

      it('undefinedは空文字列を返す', () => {
        expect(service.formatConditionalDecimal2(undefined)).toBe('');
      });

      it('0は "0.00" を返す（空白ではない）', () => {
        expect(service.formatConditionalDecimal2(0)).toBe('0.00');
      });

      it('正の数は小数2桁で返す', () => {
        expect(service.formatConditionalDecimal2(123.4)).toBe('123.40');
      });

      it('負の数は小数2桁で返す', () => {
        expect(service.formatConditionalDecimal2(-123.4)).toBe('-123.40');
      });
    });

    describe('四捨五入処理テスト', () => {
      it('小数3桁以上は四捨五入で2桁に丸める', () => {
        expect(service.formatDecimal2(1.234)).toBe('1.23');
        expect(service.formatDecimal2(1.235)).toBe('1.24'); // 四捨五入
        expect(service.formatDecimal2(1.999)).toBe('2.00');
      });

      it('負の数も正しく四捨五入する', () => {
        expect(service.formatDecimal2(-1.234)).toBe('-1.23');
        expect(service.formatDecimal2(-1.235)).toBe('-1.24');
      });

      it('非常に小さい小数を正しく処理する', () => {
        expect(service.formatDecimal2(0.001)).toBe('0.00');
        expect(service.formatDecimal2(0.005)).toBe('0.01');
        expect(service.formatDecimal2(0.004)).toBe('0.00');
      });
    });

    describe('典型的なフィールド値の書式設定テスト', () => {
      it('調整係数の典型値を書式設定する', () => {
        expect(service.formatDecimal2(FIELD_CONSTRAINTS.ADJUSTMENT_FACTOR.default)).toBe('1.00');
        expect(service.formatDecimal2(1.2)).toBe('1.20');
        expect(service.formatDecimal2(-0.5)).toBe('-0.50');
      });

      it('丸め設定の典型値を書式設定する', () => {
        expect(service.formatDecimal2(FIELD_CONSTRAINTS.ROUNDING_UNIT.default)).toBe('0.01');
        expect(service.formatDecimal2(0.25)).toBe('0.25');
        expect(service.formatDecimal2(1)).toBe('1.00');
      });

      it('数量の典型値を書式設定する', () => {
        expect(service.formatDecimal2(FIELD_CONSTRAINTS.QUANTITY.default)).toBe('0.00');
        expect(service.formatDecimal2(150.5)).toBe('150.50');
        expect(service.formatDecimal2(-50)).toBe('-50.00');
      });

      it('寸法の典型値を条件付き書式設定する', () => {
        // 寸法は空白時は表示なし、数値時は小数2桁
        expect(service.formatConditionalDecimal2(null)).toBe('');
        expect(service.formatConditionalDecimal2(100)).toBe('100.00');
        expect(service.formatConditionalDecimal2(FIELD_CONSTRAINTS.DIMENSION.min)).toBe('0.01');
      });
    });
  });

  // ==========================================================================
  // Task 14.2: 保存時バリデーション
  // ==========================================================================
  describe('Task 14.2: 保存時バリデーション', () => {
    describe('validateItemFieldSpecs - フィールド仕様検証', () => {
      const createValidItem = () => ({
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
      });

      describe('テキストフィールドの文字数検証', () => {
        it('全てのテキストフィールドが有効な場合、エラーは返されない', () => {
          const result = service.validateItemFieldSpecs(createValidItem());
          expect(result.isValid).toBe(true);
          expect(result.errors).toHaveLength(0);
        });

        it('大項目が全角25文字を超えた場合、エラーが返される', () => {
          const item = { ...createValidItem(), majorCategory: 'あ'.repeat(26) };
          const result = service.validateItemFieldSpecs(item);
          expect(result.isValid).toBe(false);
          expect(result.errors).toContainEqual({
            field: 'majorCategory',
            message: '大項目は全角25文字/半角50文字以内で入力してください',
            value: item.majorCategory,
          });
        });

        it('中項目が全角25文字を超えた場合、エラーが返される', () => {
          const item = { ...createValidItem(), middleCategory: 'あ'.repeat(26) };
          const result = service.validateItemFieldSpecs(item);
          expect(result.isValid).toBe(false);
          expect(result.errors.some((e) => e.field === 'middleCategory')).toBe(true);
        });

        it('小項目が全角25文字を超えた場合、エラーが返される', () => {
          const item = { ...createValidItem(), minorCategory: 'あ'.repeat(26) };
          const result = service.validateItemFieldSpecs(item);
          expect(result.isValid).toBe(false);
          expect(result.errors.some((e) => e.field === 'minorCategory')).toBe(true);
        });

        it('任意分類が全角25文字を超えた場合、エラーが返される', () => {
          const item = { ...createValidItem(), customCategory: 'あ'.repeat(26) };
          const result = service.validateItemFieldSpecs(item);
          expect(result.isValid).toBe(false);
          expect(result.errors.some((e) => e.field === 'customCategory')).toBe(true);
        });

        it('工種が全角8文字を超えた場合、エラーが返される', () => {
          const item = { ...createValidItem(), workType: 'あ'.repeat(9) };
          const result = service.validateItemFieldSpecs(item);
          expect(result.isValid).toBe(false);
          expect(result.errors).toContainEqual({
            field: 'workType',
            message: '工種は全角8文字/半角16文字以内で入力してください',
            value: item.workType,
          });
        });

        it('名称が全角25文字を超えた場合、エラーが返される', () => {
          const item = { ...createValidItem(), name: 'あ'.repeat(26) };
          const result = service.validateItemFieldSpecs(item);
          expect(result.isValid).toBe(false);
          expect(result.errors.some((e) => e.field === 'name')).toBe(true);
        });

        it('規格が全角25文字を超えた場合、エラーが返される', () => {
          const item = { ...createValidItem(), specification: 'あ'.repeat(26) };
          const result = service.validateItemFieldSpecs(item);
          expect(result.isValid).toBe(false);
          expect(result.errors.some((e) => e.field === 'specification')).toBe(true);
        });

        it('単位が全角3文字を超えた場合、エラーが返される', () => {
          const item = { ...createValidItem(), unit: 'あいうえ' };
          const result = service.validateItemFieldSpecs(item);
          expect(result.isValid).toBe(false);
          expect(result.errors).toContainEqual({
            field: 'unit',
            message: '単位は全角3文字/半角6文字以内で入力してください',
            value: item.unit,
          });
        });

        it('備考が全角25文字を超えた場合、エラーが返される', () => {
          const item = { ...createValidItem(), remarks: 'あ'.repeat(26) };
          const result = service.validateItemFieldSpecs(item);
          expect(result.isValid).toBe(false);
          expect(result.errors.some((e) => e.field === 'remarks')).toBe(true);
        });

        it('半角文字は幅1、全角文字は幅2としてカウントされる', () => {
          const item = {
            ...createValidItem(),
            majorCategory: 'あaいbうcえdおeかfきgくhけiこj', // 10全角(20) + 10半角(10) = 30幅
          };
          const result = service.validateItemFieldSpecs(item);
          expect(result.isValid).toBe(true);
        });
      });

      describe('数値フィールドの範囲検証', () => {
        it('調整係数が範囲外（-9.99〜9.99）の場合、エラーが返される', () => {
          const item = { ...createValidItem(), adjustmentFactor: 10.0 };
          const result = service.validateItemFieldSpecs(item);
          expect(result.isValid).toBe(false);
          expect(result.errors).toContainEqual({
            field: 'adjustmentFactor',
            message: '調整係数は-9.99から9.99の範囲で入力してください',
            value: 10.0,
          });
        });

        it('調整係数が負の範囲外の場合、エラーが返される', () => {
          const item = { ...createValidItem(), adjustmentFactor: -10.0 };
          const result = service.validateItemFieldSpecs(item);
          expect(result.isValid).toBe(false);
          expect(result.errors.some((e) => e.field === 'adjustmentFactor')).toBe(true);
        });

        it('丸め設定が範囲外（0.01〜999.99）の場合、エラーが返される', () => {
          const item = { ...createValidItem(), roundingUnit: 0.001 };
          const result = service.validateItemFieldSpecs(item);
          expect(result.isValid).toBe(false);
          expect(result.errors).toContainEqual({
            field: 'roundingUnit',
            message: '丸め設定は0.01から999.99の範囲で入力してください',
            value: 0.001,
          });
        });

        it('丸め設定が上限超過の場合、エラーが返される', () => {
          const item = { ...createValidItem(), roundingUnit: 1000.0 };
          const result = service.validateItemFieldSpecs(item);
          expect(result.isValid).toBe(false);
          expect(result.errors.some((e) => e.field === 'roundingUnit')).toBe(true);
        });

        it('数量が範囲外（-999999.99〜9999999.99）の場合、エラーが返される', () => {
          const item = { ...createValidItem(), quantity: 10000000.0 };
          const result = service.validateItemFieldSpecs(item);
          expect(result.isValid).toBe(false);
          expect(result.errors).toContainEqual({
            field: 'quantity',
            message: '数量は-999999.99から9999999.99の範囲で入力してください',
            value: 10000000.0,
          });
        });

        it('数量が負の範囲外の場合、エラーが返される', () => {
          const item = { ...createValidItem(), quantity: -1000000.0 };
          const result = service.validateItemFieldSpecs(item);
          expect(result.isValid).toBe(false);
          expect(result.errors.some((e) => e.field === 'quantity')).toBe(true);
        });
      });

      describe('複数フィールドエラー', () => {
        it('複数のフィールドにエラーがある場合、全てのエラーが返される', () => {
          const item = {
            ...createValidItem(),
            majorCategory: 'あ'.repeat(26),
            workType: 'あ'.repeat(9),
            unit: 'あいうえ',
            adjustmentFactor: 10.0,
          };
          const result = service.validateItemFieldSpecs(item);
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
          const item = {
            ...createValidItem(),
            middleCategory: null,
            minorCategory: null,
            customCategory: null,
            specification: null,
            remarks: null,
          };
          const result = service.validateItemFieldSpecs(item);
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

        expect(response.type).toBe(
          'https://architrack.example.com/problems/field-validation-error'
        );
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

      it('複数エラーがセミコロンで連結される', () => {
        const errors = [
          { field: 'majorCategory', message: 'エラー1', value: 'x' },
          { field: 'workType', message: 'エラー2', value: 'y' },
        ];

        const response = service.createValidationErrorResponse(errors);

        expect(response.detail).toBe('フィールド仕様違反: エラー1; エラー2');
      });
    });
  });
});
