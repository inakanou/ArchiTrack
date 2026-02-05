/**
 * @fileoverview 見積書バリデーションスキーマのテスト
 *
 * TDD: RED phase - テストを先に書く
 *
 * Requirements (estimate-creation):
 * - REQ-13.1: 数量フィールドの数値バリデーション
 * - REQ-13.2: 単価フィールドの数値バリデーション
 * - REQ-13.3: 利益率の範囲バリデーション（0.00〜500.00）
 * - REQ-13.4: 必須フィールド（名称等）のバリデーション
 * - 文字数制限（名称200文字、規格500文字、単位50文字）
 *
 * Task 5.1: 入力バリデーションスキーマの定義
 *
 * @module __tests__/unit/schemas/estimate.schema
 */

import { describe, it, expect } from 'vitest';
import {
  createEstimateSchema,
  updateEstimateSchema,
  estimateItemLineSchema,
  createEstimateItemSchema,
  applyProfitRateSchema,
  calculateNetSchema,
  batchUpdateItemsSchema,
  calculateOverheadSchema,
  ESTIMATE_VALIDATION_MESSAGES,
} from '../../../schemas/estimate.schema.js';

describe('estimate.schema', () => {
  describe('ESTIMATE_VALIDATION_MESSAGES', () => {
    it('バリデーションメッセージ定数が定義されている', () => {
      expect(ESTIMATE_VALIDATION_MESSAGES).toBeDefined();
      expect(ESTIMATE_VALIDATION_MESSAGES.NAME_REQUIRED).toBeDefined();
      expect(ESTIMATE_VALIDATION_MESSAGES.NAME_TOO_LONG).toBeDefined();
      expect(ESTIMATE_VALIDATION_MESSAGES.SPECIFICATION_TOO_LONG).toBeDefined();
      expect(ESTIMATE_VALIDATION_MESSAGES.UNIT_TOO_LONG).toBeDefined();
      expect(ESTIMATE_VALIDATION_MESSAGES.QUANTITY_INVALID).toBeDefined();
      expect(ESTIMATE_VALIDATION_MESSAGES.UNIT_PRICE_INVALID).toBeDefined();
      expect(ESTIMATE_VALIDATION_MESSAGES.PROFIT_RATE_INVALID).toBeDefined();
      expect(ESTIMATE_VALIDATION_MESSAGES.NET_AMOUNT_INVALID).toBeDefined();
    });
  });

  describe('createEstimateSchema', () => {
    describe('name field (REQ-13.4)', () => {
      it('有効な名称を受け入れる', () => {
        const result = createEstimateSchema.safeParse({
          name: '見積書テスト',
        });
        expect(result.success).toBe(true);
      });

      it('空の名称を拒否する', () => {
        const result = createEstimateSchema.safeParse({
          name: '',
        });
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0]!.message).toBe(ESTIMATE_VALIDATION_MESSAGES.NAME_REQUIRED);
        }
      });

      it('200文字を超える名称を拒否する', () => {
        const result = createEstimateSchema.safeParse({
          name: 'a'.repeat(201),
        });
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0]!.message).toBe(ESTIMATE_VALIDATION_MESSAGES.NAME_TOO_LONG);
        }
      });

      it('200文字ちょうどの名称を受け入れる', () => {
        const result = createEstimateSchema.safeParse({
          name: 'a'.repeat(200),
        });
        expect(result.success).toBe(true);
      });
    });
  });

  describe('updateEstimateSchema', () => {
    const validInput = {
      name: '更新見積書',
      expectedUpdatedAt: '2026-02-04T00:00:00.000Z',
    };

    it('有効な更新データを受け入れる', () => {
      const result = updateEstimateSchema.safeParse(validInput);
      expect(result.success).toBe(true);
    });

    it('名称が空の場合を拒否する', () => {
      const result = updateEstimateSchema.safeParse({
        ...validInput,
        name: '',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]!.message).toBe(ESTIMATE_VALIDATION_MESSAGES.NAME_REQUIRED);
      }
    });
  });

  describe('estimateItemLineSchema', () => {
    describe('name field - 文字数制限（200文字）', () => {
      it('200文字以内の名称を受け入れる', () => {
        const result = estimateItemLineSchema.safeParse({
          lineType: 'ESTIMATE',
          name: 'a'.repeat(200),
        });
        expect(result.success).toBe(true);
      });

      it('200文字を超える名称を拒否する', () => {
        const result = estimateItemLineSchema.safeParse({
          lineType: 'ESTIMATE',
          name: 'a'.repeat(201),
        });
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0]!.message).toBe(ESTIMATE_VALIDATION_MESSAGES.NAME_TOO_LONG);
        }
      });
    });

    describe('specification field - 文字数制限（500文字）', () => {
      it('500文字以内の規格を受け入れる', () => {
        const result = estimateItemLineSchema.safeParse({
          lineType: 'ESTIMATE',
          specification: 'a'.repeat(500),
        });
        expect(result.success).toBe(true);
      });

      it('500文字を超える規格を拒否する', () => {
        const result = estimateItemLineSchema.safeParse({
          lineType: 'ESTIMATE',
          specification: 'a'.repeat(501),
        });
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0]!.message).toBe(
            ESTIMATE_VALIDATION_MESSAGES.SPECIFICATION_TOO_LONG
          );
        }
      });
    });

    describe('unit field - 文字数制限（50文字）', () => {
      it('50文字以内の単位を受け入れる', () => {
        const result = estimateItemLineSchema.safeParse({
          lineType: 'ESTIMATE',
          unit: 'a'.repeat(50),
        });
        expect(result.success).toBe(true);
      });

      it('50文字を超える単位を拒否する', () => {
        const result = estimateItemLineSchema.safeParse({
          lineType: 'ESTIMATE',
          unit: 'a'.repeat(51),
        });
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0]!.message).toBe(ESTIMATE_VALIDATION_MESSAGES.UNIT_TOO_LONG);
        }
      });
    });

    describe('quantity field (REQ-13.1)', () => {
      it('有効な数量（整数）を受け入れる', () => {
        const result = estimateItemLineSchema.safeParse({
          lineType: 'ESTIMATE',
          quantity: 10,
        });
        expect(result.success).toBe(true);
      });

      it('有効な数量（小数）を受け入れる', () => {
        const result = estimateItemLineSchema.safeParse({
          lineType: 'ESTIMATE',
          quantity: 10.5,
        });
        expect(result.success).toBe(true);
      });

      it('負の数量を受け入れる（値引き等のため）', () => {
        const result = estimateItemLineSchema.safeParse({
          lineType: 'ESTIMATE',
          quantity: -10,
        });
        expect(result.success).toBe(true);
      });

      it('nullの数量を受け入れる', () => {
        const result = estimateItemLineSchema.safeParse({
          lineType: 'ESTIMATE',
          quantity: null,
        });
        expect(result.success).toBe(true);
      });
    });

    describe('unitPrice field (REQ-13.2)', () => {
      it('有効な単価（整数）を受け入れる', () => {
        const result = estimateItemLineSchema.safeParse({
          lineType: 'ESTIMATE',
          unitPrice: 1500,
        });
        expect(result.success).toBe(true);
      });

      it('有効な単価（小数）を受け入れる', () => {
        const result = estimateItemLineSchema.safeParse({
          lineType: 'ESTIMATE',
          unitPrice: 1500.5,
        });
        expect(result.success).toBe(true);
      });

      it('負の単価を受け入れる（値引き等のため）', () => {
        const result = estimateItemLineSchema.safeParse({
          lineType: 'ESTIMATE',
          unitPrice: -1500,
        });
        expect(result.success).toBe(true);
      });

      it('nullの単価を受け入れる', () => {
        const result = estimateItemLineSchema.safeParse({
          lineType: 'ESTIMATE',
          unitPrice: null,
        });
        expect(result.success).toBe(true);
      });
    });

    describe('lineType field', () => {
      it('ESTIMATE行タイプを受け入れる', () => {
        const result = estimateItemLineSchema.safeParse({
          lineType: 'ESTIMATE',
        });
        expect(result.success).toBe(true);
      });

      it('EXECUTION行タイプを受け入れる', () => {
        const result = estimateItemLineSchema.safeParse({
          lineType: 'EXECUTION',
        });
        expect(result.success).toBe(true);
      });

      it('VENDOR行タイプを受け入れる', () => {
        const result = estimateItemLineSchema.safeParse({
          lineType: 'VENDOR',
        });
        expect(result.success).toBe(true);
      });

      it('無効な行タイプを拒否する', () => {
        const result = estimateItemLineSchema.safeParse({
          lineType: 'INVALID',
        });
        expect(result.success).toBe(false);
      });
    });
  });

  describe('applyProfitRateSchema (REQ-13.3)', () => {
    it('有効な利益率（0）を受け入れる', () => {
      const result = applyProfitRateSchema.safeParse({
        profitRate: '0',
        overwriteOption: 'all',
      });
      expect(result.success).toBe(true);
    });

    it('有効な利益率（10.00）を受け入れる', () => {
      const result = applyProfitRateSchema.safeParse({
        profitRate: '10',
        overwriteOption: 'all',
      });
      expect(result.success).toBe(true);
    });

    it('有効な利益率（500.00）を受け入れる', () => {
      const result = applyProfitRateSchema.safeParse({
        profitRate: '500',
        overwriteOption: 'all',
      });
      expect(result.success).toBe(true);
    });

    it('小数点を含む有効な利益率を受け入れる', () => {
      const result = applyProfitRateSchema.safeParse({
        profitRate: '25.5',
        overwriteOption: 'all',
      });
      expect(result.success).toBe(true);
    });

    it('負の利益率を拒否する', () => {
      const result = applyProfitRateSchema.safeParse({
        profitRate: '-1',
        overwriteOption: 'all',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]!.message).toBe(
          ESTIMATE_VALIDATION_MESSAGES.PROFIT_RATE_INVALID
        );
      }
    });

    it('500を超える利益率を拒否する', () => {
      const result = applyProfitRateSchema.safeParse({
        profitRate: '500.01',
        overwriteOption: 'all',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]!.message).toBe(
          ESTIMATE_VALIDATION_MESSAGES.PROFIT_RATE_INVALID
        );
      }
    });

    it('数値以外の利益率を拒否する', () => {
      const result = applyProfitRateSchema.safeParse({
        profitRate: 'abc',
        overwriteOption: 'all',
      });
      expect(result.success).toBe(false);
    });

    describe('overwriteOption field', () => {
      it('allオプションを受け入れる', () => {
        const result = applyProfitRateSchema.safeParse({
          profitRate: '10',
          overwriteOption: 'all',
        });
        expect(result.success).toBe(true);
      });

      it('empty_onlyオプションを受け入れる', () => {
        const result = applyProfitRateSchema.safeParse({
          profitRate: '10',
          overwriteOption: 'empty_only',
        });
        expect(result.success).toBe(true);
      });

      it('unit_price_onlyオプションを受け入れる', () => {
        const result = applyProfitRateSchema.safeParse({
          profitRate: '10',
          overwriteOption: 'unit_price_only',
        });
        expect(result.success).toBe(true);
      });

      it('無効なオプションを拒否する', () => {
        const result = applyProfitRateSchema.safeParse({
          profitRate: '10',
          overwriteOption: 'invalid',
        });
        expect(result.success).toBe(false);
      });
    });
  });

  describe('calculateNetSchema', () => {
    const validInput = {
      vendorName: '業者A',
      targetLineIds: ['550e8400-e29b-41d4-a716-446655440000'],
      excludeLineIds: [],
      netAmount: '100000',
    };

    it('有効なNET金額計算入力を受け入れる', () => {
      const result = calculateNetSchema.safeParse(validInput);
      expect(result.success).toBe(true);
    });

    it('業者名が空の場合を拒否する', () => {
      const result = calculateNetSchema.safeParse({
        ...validInput,
        vendorName: '',
      });
      expect(result.success).toBe(false);
    });

    it('対象行が空の場合を拒否する', () => {
      const result = calculateNetSchema.safeParse({
        ...validInput,
        targetLineIds: [],
      });
      expect(result.success).toBe(false);
    });

    it('負のNET金額を拒否する', () => {
      const result = calculateNetSchema.safeParse({
        ...validInput,
        netAmount: '-100000',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]!.message).toBe(
          ESTIMATE_VALIDATION_MESSAGES.NET_AMOUNT_INVALID
        );
      }
    });

    it('数値以外のNET金額を拒否する', () => {
      const result = calculateNetSchema.safeParse({
        ...validInput,
        netAmount: 'abc',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('createEstimateItemSchema', () => {
    it('有効な見積項目作成入力を受け入れる', () => {
      const result = createEstimateItemSchema.safeParse({
        displayOrder: 0,
        lines: [
          {
            lineType: 'ESTIMATE',
            name: 'テスト項目',
          },
        ],
      });
      expect(result.success).toBe(true);
    });

    it('linesが空の場合を拒否する', () => {
      const result = createEstimateItemSchema.safeParse({
        displayOrder: 0,
        lines: [],
      });
      expect(result.success).toBe(false);
    });

    it('linesが3行を超える場合を拒否する', () => {
      const result = createEstimateItemSchema.safeParse({
        displayOrder: 0,
        lines: [
          { lineType: 'ESTIMATE' },
          { lineType: 'EXECUTION' },
          { lineType: 'VENDOR' },
          { lineType: 'ESTIMATE' },
        ],
      });
      expect(result.success).toBe(false);
    });

    it('displayOrderが負の場合を拒否する', () => {
      const result = createEstimateItemSchema.safeParse({
        displayOrder: -1,
        lines: [{ lineType: 'ESTIMATE' }],
      });
      expect(result.success).toBe(false);
    });
  });

  describe('batchUpdateItemsSchema', () => {
    const validInput = {
      items: [
        {
          id: '550e8400-e29b-41d4-a716-446655440000',
          lines: [
            {
              id: '550e8400-e29b-41d4-a716-446655440001',
              lineType: 'ESTIMATE' as const,
              name: 'テスト',
            },
          ],
        },
      ],
      updatedAt: '2026-02-04T00:00:00.000Z',
    };

    it('有効なバッチ更新入力を受け入れる', () => {
      const result = batchUpdateItemsSchema.safeParse(validInput);
      expect(result.success).toBe(true);
    });

    it('文字数制限バリデーションが適用される', () => {
      const result = batchUpdateItemsSchema.safeParse({
        ...validInput,
        items: [
          {
            id: '550e8400-e29b-41d4-a716-446655440000',
            lines: [
              {
                id: '550e8400-e29b-41d4-a716-446655440001',
                lineType: 'ESTIMATE' as const,
                name: 'a'.repeat(201),
              },
            ],
          },
        ],
      });
      expect(result.success).toBe(false);
    });
  });

  describe('calculateOverheadSchema', () => {
    describe('costType field', () => {
      it('COMMON_TEMPORARYを受け入れる', () => {
        const result = calculateOverheadSchema.safeParse({
          costType: 'COMMON_TEMPORARY',
          directCost: '100000',
        });
        expect(result.success).toBe(true);
      });

      it('SITE_MANAGEMENTを受け入れる', () => {
        const result = calculateOverheadSchema.safeParse({
          costType: 'SITE_MANAGEMENT',
          directCost: '100000',
        });
        expect(result.success).toBe(true);
      });

      it('GENERAL_ADMINを受け入れる', () => {
        const result = calculateOverheadSchema.safeParse({
          costType: 'GENERAL_ADMIN',
          directCost: '100000',
        });
        expect(result.success).toBe(true);
      });

      it('無効な諸経費種別を拒否する', () => {
        const result = calculateOverheadSchema.safeParse({
          costType: 'INVALID',
          directCost: '100000',
        });
        expect(result.success).toBe(false);
      });
    });

    describe('directCost field', () => {
      it('有効な直接工事費を受け入れる', () => {
        const result = calculateOverheadSchema.safeParse({
          costType: 'COMMON_TEMPORARY',
          directCost: '100000',
        });
        expect(result.success).toBe(true);
      });

      it('0以下の直接工事費を拒否する', () => {
        const result = calculateOverheadSchema.safeParse({
          costType: 'COMMON_TEMPORARY',
          directCost: '0',
        });
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0]!.message).toBe(
            '直接工事費は0より大きい数値を入力してください'
          );
        }
      });

      it('数値以外の直接工事費を拒否する', () => {
        const result = calculateOverheadSchema.safeParse({
          costType: 'COMMON_TEMPORARY',
          directCost: 'abc',
        });
        expect(result.success).toBe(false);
      });
    });

    describe('pureConstructionCost field', () => {
      it('有効な純工事費を受け入れる', () => {
        const result = calculateOverheadSchema.safeParse({
          costType: 'SITE_MANAGEMENT',
          directCost: '100000',
          pureConstructionCost: '150000',
        });
        expect(result.success).toBe(true);
      });

      it('0以下の純工事費を拒否する', () => {
        const result = calculateOverheadSchema.safeParse({
          costType: 'SITE_MANAGEMENT',
          directCost: '100000',
          pureConstructionCost: '0',
        });
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0]!.message).toBe(
            '純工事費は0より大きい数値を入力してください'
          );
        }
      });

      it('負の純工事費を拒否する', () => {
        const result = calculateOverheadSchema.safeParse({
          costType: 'SITE_MANAGEMENT',
          directCost: '100000',
          pureConstructionCost: '-1000',
        });
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0]!.message).toBe(
            '純工事費は0より大きい数値を入力してください'
          );
        }
      });

      it('数値以外の純工事費を拒否する', () => {
        const result = calculateOverheadSchema.safeParse({
          costType: 'SITE_MANAGEMENT',
          directCost: '100000',
          pureConstructionCost: 'abc',
        });
        expect(result.success).toBe(false);
      });

      it('純工事費はオプショナルである', () => {
        const result = calculateOverheadSchema.safeParse({
          costType: 'SITE_MANAGEMENT',
          directCost: '100000',
        });
        expect(result.success).toBe(true);
      });
    });

    describe('constructionCost field', () => {
      it('有効な工事原価を受け入れる', () => {
        const result = calculateOverheadSchema.safeParse({
          costType: 'GENERAL_ADMIN',
          directCost: '100000',
          constructionCost: '200000',
        });
        expect(result.success).toBe(true);
      });

      it('0以下の工事原価を拒否する', () => {
        const result = calculateOverheadSchema.safeParse({
          costType: 'GENERAL_ADMIN',
          directCost: '100000',
          constructionCost: '0',
        });
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0]!.message).toBe(
            '工事原価は0より大きい数値を入力してください'
          );
        }
      });

      it('負の工事原価を拒否する', () => {
        const result = calculateOverheadSchema.safeParse({
          costType: 'GENERAL_ADMIN',
          directCost: '100000',
          constructionCost: '-5000',
        });
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0]!.message).toBe(
            '工事原価は0より大きい数値を入力してください'
          );
        }
      });

      it('数値以外の工事原価を拒否する', () => {
        const result = calculateOverheadSchema.safeParse({
          costType: 'GENERAL_ADMIN',
          directCost: '100000',
          constructionCost: 'xyz',
        });
        expect(result.success).toBe(false);
      });

      it('工事原価はオプショナルである', () => {
        const result = calculateOverheadSchema.safeParse({
          costType: 'GENERAL_ADMIN',
          directCost: '100000',
        });
        expect(result.success).toBe(true);
      });
    });

    describe('constructionPeriod field', () => {
      it('有効な工期を受け入れる', () => {
        const result = calculateOverheadSchema.safeParse({
          costType: 'COMMON_TEMPORARY',
          directCost: '100000',
          constructionPeriod: 30,
        });
        expect(result.success).toBe(true);
      });

      it('0以下の工期を拒否する', () => {
        const result = calculateOverheadSchema.safeParse({
          costType: 'COMMON_TEMPORARY',
          directCost: '100000',
          constructionPeriod: 0,
        });
        expect(result.success).toBe(false);
      });

      it('工期はオプショナルである', () => {
        const result = calculateOverheadSchema.safeParse({
          costType: 'COMMON_TEMPORARY',
          directCost: '100000',
        });
        expect(result.success).toBe(true);
      });
    });

    describe('isRenovation field', () => {
      it('trueを受け入れる', () => {
        const result = calculateOverheadSchema.safeParse({
          costType: 'COMMON_TEMPORARY',
          directCost: '100000',
          isRenovation: true,
        });
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.isRenovation).toBe(true);
        }
      });

      it('falseを受け入れる', () => {
        const result = calculateOverheadSchema.safeParse({
          costType: 'COMMON_TEMPORARY',
          directCost: '100000',
          isRenovation: false,
        });
        expect(result.success).toBe(true);
      });

      it('デフォルト値はfalseである', () => {
        const result = calculateOverheadSchema.safeParse({
          costType: 'COMMON_TEMPORARY',
          directCost: '100000',
        });
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.isRenovation).toBe(false);
        }
      });
    });
  });
});
