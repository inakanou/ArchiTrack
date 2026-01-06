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
  QUANTITY_TABLE_VALIDATION_MESSAGES,
} from '../../../schemas/quantity-table.schema.js';

describe('quantity-table.schema', () => {
  describe('updateQuantityItemSchema', () => {
    describe('majorCategory フィールド（空白トリムバリデーション）', () => {
      it('有効な値を受け入れる', () => {
        const result = updateQuantityItemSchema.safeParse({
          majorCategory: '土工',
        });
        expect(result.success).toBe(true);
      });

      it('空白のみの場合エラーになる', () => {
        const result = updateQuantityItemSchema.safeParse({
          majorCategory: '   ',
        });
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0]?.message).toBe(
            QUANTITY_TABLE_VALIDATION_MESSAGES.MAJOR_CATEGORY_REQUIRED
          );
        }
      });

      it('タブ文字のみの場合エラーになる', () => {
        const result = updateQuantityItemSchema.safeParse({
          majorCategory: '\t\t',
        });
        expect(result.success).toBe(false);
      });

      it('改行のみの場合エラーになる', () => {
        const result = updateQuantityItemSchema.safeParse({
          majorCategory: '\n\n',
        });
        expect(result.success).toBe(false);
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
});
