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
import { QuantityFieldValidationService } from './quantity-field-validation.service.js';

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
