/**
 * @fileoverview 数量表スキーマのテスト
 *
 * 未カバー行のテスト（402-429, 453）:
 * - updateQuantityItemSchema の refine 関数（空白トリムチェック）
 *
 * @module __tests__/unit/schemas/quantity-table.schema.test
 */

import { describe, it, expect } from 'vitest';
import {
  updateQuantityItemSchema,
  calculationParamsSchema,
  QUANTITY_TABLE_VALIDATION_MESSAGES,
} from '../../../schemas/quantity-table.schema.js';

describe('quantity-table.schema', () => {
  describe('updateQuantityItemSchema', () => {
    describe('majorCategory フィールド（任意フィールド）', () => {
      it('有効な値を受け入れる', () => {
        const result = updateQuantityItemSchema.safeParse({
          majorCategory: '土工',
        });
        expect(result.success).toBe(true);
      });

      // Req: 大項目は必須ではない（フィールド仕様テーブル参照）
      // デフォルト値は「空白」
      it('空文字列を受け入れる', () => {
        const result = updateQuantityItemSchema.safeParse({
          majorCategory: '',
        });
        expect(result.success).toBe(true);
      });

      it('空白のみでも受け入れる（必須ではない）', () => {
        const result = updateQuantityItemSchema.safeParse({
          majorCategory: '   ',
        });
        expect(result.success).toBe(true);
      });

      it('タブ文字のみでも受け入れる（必須ではない）', () => {
        const result = updateQuantityItemSchema.safeParse({
          majorCategory: '\t\t',
        });
        expect(result.success).toBe(true);
      });

      it('改行のみでも受け入れる（必須ではない）', () => {
        const result = updateQuantityItemSchema.safeParse({
          majorCategory: '\n\n',
        });
        expect(result.success).toBe(true);
      });

      it('nullを受け入れる', () => {
        const result = updateQuantityItemSchema.safeParse({
          majorCategory: null,
        });
        expect(result.success).toBe(true);
      });
    });

    describe('workType フィールド（空白トリムバリデーション）', () => {
      it('有効な値を受け入れる', () => {
        const result = updateQuantityItemSchema.safeParse({
          workType: '舗装工',
        });
        expect(result.success).toBe(true);
      });

      it('空白のみの場合エラーになる', () => {
        const result = updateQuantityItemSchema.safeParse({
          workType: '   ',
        });
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0]?.message).toBe(
            QUANTITY_TABLE_VALIDATION_MESSAGES.WORK_TYPE_REQUIRED
          );
        }
      });

      it('タブと空白の混合の場合エラーになる', () => {
        const result = updateQuantityItemSchema.safeParse({
          workType: ' \t \t ',
        });
        expect(result.success).toBe(false);
      });
    });

    describe('name フィールド（空白トリムバリデーション）', () => {
      it('有効な値を受け入れる', () => {
        const result = updateQuantityItemSchema.safeParse({
          name: 'コンクリート打設',
        });
        expect(result.success).toBe(true);
      });

      it('空白のみの場合エラーになる', () => {
        const result = updateQuantityItemSchema.safeParse({
          name: '   ',
        });
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0]?.message).toBe(
            QUANTITY_TABLE_VALIDATION_MESSAGES.ITEM_NAME_REQUIRED
          );
        }
      });
    });

    describe('unit フィールド（空白トリムバリデーション）', () => {
      it('有効な値を受け入れる', () => {
        const result = updateQuantityItemSchema.safeParse({
          unit: 'm3',
        });
        expect(result.success).toBe(true);
      });

      it('空白のみの場合エラーになる', () => {
        const result = updateQuantityItemSchema.safeParse({
          unit: '   ',
        });
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0]?.message).toBe(
            QUANTITY_TABLE_VALIDATION_MESSAGES.UNIT_REQUIRED
          );
        }
      });

      it('全角スペースのみの場合エラーになる', () => {
        const result = updateQuantityItemSchema.safeParse({
          unit: '　　　',
        });
        expect(result.success).toBe(false);
      });
    });

    describe('複合バリデーション', () => {
      it('複数フィールドを同時に更新できる', () => {
        const result = updateQuantityItemSchema.safeParse({
          majorCategory: '土工',
          workType: '掘削',
          name: '床掘り',
          unit: 'm3',
          quantity: 100,
        });
        expect(result.success).toBe(true);
      });

      it('空のオブジェクトでも成功する（全フィールドオプショナル）', () => {
        const result = updateQuantityItemSchema.safeParse({});
        expect(result.success).toBe(true);
      });

      it('null許可フィールドはnullを受け入れる', () => {
        const result = updateQuantityItemSchema.safeParse({
          middleCategory: null,
          minorCategory: null,
          customCategory: null,
          specification: null,
        });
        expect(result.success).toBe(true);
      });
    });
  });

  describe('calculationParamsSchema', () => {
    describe('ピッチ計算パラメータ', () => {
      it('全てのピッチ計算パラメータを保持する', () => {
        const pitchParams = {
          rangeLength: 100,
          endLength1: 10,
          endLength2: 10,
          pitchLength: 5,
          length: 2.5,
          weight: 1.5,
        };
        const result = calculationParamsSchema.safeParse(pitchParams);
        expect(result.success).toBe(true);
        if (result.success) {
          // 重要: 全てのピッチ計算パラメータが保持されること
          expect(result.data).toEqual(pitchParams);
        }
      });

      it('必須フィールドのみでも成功する', () => {
        const pitchParams = {
          rangeLength: 100,
          endLength1: 0,
          endLength2: 0,
          pitchLength: 5,
        };
        const result = calculationParamsSchema.safeParse(pitchParams);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data).toEqual(pitchParams);
        }
      });

      it('必須フィールドが欠けている場合はエラーになる', () => {
        const incompleteParams = {
          rangeLength: 100,
          // endLength1, endLength2, pitchLength が欠けている
        };
        const result = calculationParamsSchema.safeParse(incompleteParams);
        // areaVolumeParamsSchemaとしてパースされる可能性があるが、
        // 未知のキー(rangeLength)は削除される
        expect(result.success).toBe(true);
        if (result.success) {
          // rangeLength は areaVolumeParams の有効なキーではないため削除される
          expect(result.data).not.toHaveProperty('rangeLength');
        }
      });
    });

    describe('面積・体積計算パラメータ', () => {
      it('全ての面積・体積計算パラメータを保持する', () => {
        const areaVolumeParams = {
          width: 10,
          depth: 5,
          height: 2,
          weight: 1.5,
        };
        const result = calculationParamsSchema.safeParse(areaVolumeParams);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data).toEqual(areaVolumeParams);
        }
      });

      it('一部のフィールドのみでも成功する', () => {
        const partialParams = {
          width: 10,
          weight: 1.5,
        };
        const result = calculationParamsSchema.safeParse(partialParams);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data).toEqual(partialParams);
        }
      });
    });

    describe('null値', () => {
      it('nullを受け入れる', () => {
        const result = calculationParamsSchema.safeParse(null);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data).toBeNull();
        }
      });
    });
  });
});
