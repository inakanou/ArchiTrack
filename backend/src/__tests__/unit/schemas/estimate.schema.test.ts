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
import { z } from 'zod';
import {
  saveEstimateDraftSchema,
  SAVE_ESTIMATE_MAX_ITEMS,
  SAVE_ESTIMATE_VALIDATION_MESSAGES,
  createEstimateSchema,
  updateEstimateSchema,
  estimateItemLineSchema,
  applyProfitRateSchema,
  calculateNetSchema,
  calculateOverheadSchema,
  exportEstimateQuerySchema,
  addDiscountItemSchema,
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

  describe('addDiscountItemSchema (REQ-41.5)', () => {
    it('単価を省略した入力を受け入れる（任意）', () => {
      const result = addDiscountItemSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it('負数の単価を受け入れる (REQ-41.5)', () => {
      const result = addDiscountItemSchema.safeParse({ unitPrice: -100000 });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.unitPrice).toBe(-100000);
      }
    });

    it('null の単価を受け入れる', () => {
      const result = addDiscountItemSchema.safeParse({ unitPrice: null });
      expect(result.success).toBe(true);
    });

    it('正数の単価を受け入れる', () => {
      const result = addDiscountItemSchema.safeParse({ unitPrice: 5000 });
      expect(result.success).toBe(true);
    });

    it('数値以外の単価を拒否する', () => {
      const result = addDiscountItemSchema.safeParse({ unitPrice: 'abc' });
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

  // ==========================================================================
  // Task 42.2: exportEstimateQuerySchema（複数行タイプ対応）
  // ==========================================================================
  describe('exportEstimateQuerySchema (Task 42.2)', () => {
    it('lineTypesにカンマ区切りの複数行タイプを指定できる', () => {
      const result = exportEstimateQuerySchema.safeParse({
        format: 'xlsx',
        lineTypes: 'ESTIMATE,EXECUTION',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.lineTypes).toEqual(['ESTIMATE', 'EXECUTION']);
      }
    });

    it('lineTypesに無効な値が含まれる場合はフィルタされる', () => {
      const result = exportEstimateQuerySchema.safeParse({
        format: 'pdf',
        lineTypes: 'ESTIMATE,INVALID,VENDOR',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.lineTypes).toEqual(['ESTIMATE', 'VENDOR']);
      }
    });

    it('lineTypesが未指定でlineTypeが指定されている場合はlineTypeを配列化する', () => {
      const result = exportEstimateQuerySchema.safeParse({
        format: 'pdf',
        lineType: 'EXECUTION',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.lineTypes).toEqual(['EXECUTION']);
      }
    });

    it('lineTypesもlineTypeも未指定の場合はデフォルトでESTIMATEとなる', () => {
      const result = exportEstimateQuerySchema.safeParse({
        format: 'xlsx',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.lineTypes).toEqual(['ESTIMATE']);
      }
    });

    it('lineTypesが空文字の場合はlineTypeにフォールバックする', () => {
      const result = exportEstimateQuerySchema.safeParse({
        format: 'pdf',
        lineTypes: '',
        lineType: 'VENDOR',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.lineTypes).toEqual(['VENDOR']);
      }
    });

    it('lineTypesが全て無効な値の場合はlineTypeにフォールバックする', () => {
      const result = exportEstimateQuerySchema.safeParse({
        format: 'xlsx',
        lineTypes: 'INVALID1,INVALID2',
        lineType: 'ESTIMATE',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.lineTypes).toEqual(['ESTIMATE']);
      }
    });

    it('lineTypesが全て無効でlineTypeも未指定の場合はデフォルトESTIMATEとなる', () => {
      const result = exportEstimateQuerySchema.safeParse({
        format: 'pdf',
        lineTypes: 'INVALID',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.lineTypes).toEqual(['ESTIMATE']);
      }
    });

    it('3つ全ての行タイプをlineTypesに指定できる', () => {
      const result = exportEstimateQuerySchema.safeParse({
        format: 'xlsx',
        lineTypes: 'ESTIMATE,EXECUTION,VENDOR',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.lineTypes).toEqual(['ESTIMATE', 'EXECUTION', 'VENDOR']);
      }
    });
  });

  /**
   * 明細の一括保存リクエストスキーマ
   *
   * Requirements (estimate-creation): 42.4, 42.8, 54.1
   * Task 52.3: 明細の一括保存リクエストのスキーマとバリデーション
   */
  describe('saveEstimateDraftSchema', () => {
    const ESTIMATE_ID = '11111111-1111-4111-8111-111111111111';
    const CHILD_ID = '22222222-2222-4222-8222-222222222222';

    /** 見積金額行の最小構成 */
    const estimateLine = (overrides: Record<string, unknown> = {}) => ({
      lineType: 'ESTIMATE',
      name: '基礎工事',
      specification: null,
      unit: '式',
      quantity: '1.0000',
      unitPrice: '100000.00',
      amount: '100000.00',
      remarks: null,
      sourceVendorName: null,
      ...overrides,
    });

    /** 既存の通常項目ノード */
    const existingNode = (overrides: Record<string, unknown> = {}) => ({
      id: ESTIMATE_ID,
      tempId: null,
      itemType: 'STANDARD',
      lines: [estimateLine()],
      children: [],
      ...overrides,
    });

    /** 新規（一時識別子のみ）ノード */
    const newNode = (tempId: string, overrides: Record<string, unknown> = {}) => ({
      id: null,
      tempId,
      itemType: 'STANDARD',
      lines: [estimateLine()],
      children: [],
      ...overrides,
    });

    /** 保存リクエスト全体 */
    const draft = (items: unknown[], overrides: Record<string, unknown> = {}) => ({
      expectedUpdatedAt: '2026-07-31T00:00:00.000Z',
      reportFields: {
        submissionDate: '2026-07-31',
        validityPeriod: '提出日より1ヶ月間',
        separateWorks: ['電気工事', '空調工事'],
      },
      items,
      ...overrides,
    });

    /** 検証NGの issue path を文字列化して取得する（呼び出し元へ不備内容が返ることの確認用） */
    const issuePaths = (result: { success: boolean; error?: z.ZodError }): string[] =>
      (result.error?.issues ?? []).map((issue) => issue.path.join('.'));

    describe('基本形状', () => {
      it('明細ツリー・基準時刻・帳票用入力項目を含むリクエストを受け入れる', () => {
        const result = saveEstimateDraftSchema.safeParse(draft([existingNode()]));
        expect(result.success).toBe(true);
      });

      it('明細が空のリクエストを受け入れる', () => {
        const result = saveEstimateDraftSchema.safeParse(draft([]));
        expect(result.success).toBe(true);
      });

      it('基準時刻が無い場合は拒否する', () => {
        const payload = draft([existingNode()]) as Record<string, unknown>;
        delete payload.expectedUpdatedAt;
        const result = saveEstimateDraftSchema.safeParse(payload);
        expect(result.success).toBe(false);
        expect(issuePaths(result)).toContain('expectedUpdatedAt');
      });

      it('基準時刻がISO8601形式でない場合は拒否する', () => {
        const result = saveEstimateDraftSchema.safeParse(
          draft([existingNode()], { expectedUpdatedAt: '2026-07-31' })
        );
        expect(result.success).toBe(false);
        expect(issuePaths(result)).toContain('expectedUpdatedAt');
      });

      it('入れ子の子項目を含むツリーを受け入れる', () => {
        const result = saveEstimateDraftSchema.safeParse(
          draft([existingNode({ children: [existingNode({ id: CHILD_ID })] })])
        );
        expect(result.success).toBe(true);
      });

      it('注記行の種別を受け入れる（55.1）', () => {
        const result = saveEstimateDraftSchema.safeParse(
          draft([
            existingNode({
              itemType: 'NOTE',
              lines: [estimateLine({ quantity: null, unitPrice: null, amount: null })],
            }),
          ])
        );
        expect(result.success).toBe(true);
      });

      it('未定義の種別は拒否する', () => {
        const result = saveEstimateDraftSchema.safeParse(
          draft([existingNode({ itemType: 'UNKNOWN' })])
        );
        expect(result.success).toBe(false);
      });
    });

    describe('新規項目の一時識別子', () => {
      it('IDを持たず一時識別子を持つ新規項目を受け入れる', () => {
        const result = saveEstimateDraftSchema.safeParse(draft([newNode('tmp-1')]));
        expect(result.success).toBe(true);
      });

      it('一時識別子で親子関係を表現できる', () => {
        const result = saveEstimateDraftSchema.safeParse(
          draft([newNode('tmp-parent', { children: [newNode('tmp-child')] })])
        );
        expect(result.success).toBe(true);
      });

      it('IDも一時識別子も持たない項目は拒否する（親を失った項目、42.8）', () => {
        const result = saveEstimateDraftSchema.safeParse(
          draft([newNode('tmp-1', { tempId: null })])
        );
        expect(result.success).toBe(false);
        expect(issuePaths(result)).toContain('items.0.tempId');
      });

      it('IDと一時識別子を同時に持つ項目は拒否する', () => {
        const result = saveEstimateDraftSchema.safeParse(
          draft([existingNode({ tempId: 'tmp-1' })])
        );
        expect(result.success).toBe(false);
        expect(issuePaths(result)).toContain('items.0.tempId');
      });

      it('一時識別子の重複を拒否する', () => {
        const result = saveEstimateDraftSchema.safeParse(
          draft([newNode('tmp-dup'), newNode('tmp-dup')])
        );
        expect(result.success).toBe(false);
        expect(issuePaths(result)).toContain('items.1.tempId');
      });

      it('IDがUUID形式でない場合は拒否する', () => {
        const result = saveEstimateDraftSchema.safeParse(
          draft([existingNode({ id: 'not-a-uuid' })])
        );
        expect(result.success).toBe(false);
        expect(issuePaths(result)).toContain('items.0.id');
      });
    });

    describe('明細総数の上限（42.4）', () => {
      it('上限ちょうどの明細件数を受け入れる', () => {
        const items = Array.from({ length: SAVE_ESTIMATE_MAX_ITEMS }, (_, index) =>
          newNode(`tmp-${index}`)
        );
        const result = saveEstimateDraftSchema.safeParse(draft(items));
        expect(result.success).toBe(true);
      });

      it('上限を超える明細件数を拒否する', () => {
        const items = Array.from({ length: SAVE_ESTIMATE_MAX_ITEMS + 1 }, (_, index) =>
          newNode(`tmp-${index}`)
        );
        const result = saveEstimateDraftSchema.safeParse(draft(items));
        expect(result.success).toBe(false);
        expect(issuePaths(result)).toContain('items');
      });

      it('子孫を含む総数で上限を判定する', () => {
        const items = Array.from({ length: SAVE_ESTIMATE_MAX_ITEMS }, (_, index) =>
          newNode(`tmp-${index}`)
        );
        items[0] = newNode('tmp-root', { children: [newNode('tmp-extra')] });
        const result = saveEstimateDraftSchema.safeParse(draft(items));
        expect(result.success).toBe(false);
        expect(issuePaths(result)).toContain('items');
      });
    });

    describe('値引き行・注記行の構造制約（41.3, 55.1）', () => {
      it.each(['DISCOUNT', 'NOTE'])('%s は子項目を持てない', (itemType) => {
        const result = saveEstimateDraftSchema.safeParse(
          draft([existingNode({ itemType, children: [existingNode({ id: CHILD_ID })] })])
        );
        expect(result.success).toBe(false);
        expect(issuePaths(result)).toContain('items.0.children');
      });

      it.each(['DISCOUNT', 'NOTE'])('%s は見積金額行以外の行を持てない', (itemType) => {
        const result = saveEstimateDraftSchema.safeParse(
          draft([
            existingNode({
              itemType,
              lines: [estimateLine(), estimateLine({ lineType: 'EXECUTION' })],
            }),
          ])
        );
        expect(result.success).toBe(false);
        expect(issuePaths(result)).toContain('items.0.lines');
      });

      it.each(['DISCOUNT', 'NOTE'])('%s は実行金額行のみの構成を拒否する', (itemType) => {
        const result = saveEstimateDraftSchema.safeParse(
          draft([existingNode({ itemType, lines: [estimateLine({ lineType: 'EXECUTION' })] })])
        );
        expect(result.success).toBe(false);
        expect(issuePaths(result)).toContain('items.0.lines');
      });

      it('通常項目は3行1セットを保持できる', () => {
        const result = saveEstimateDraftSchema.safeParse(
          draft([
            existingNode({
              lines: [
                estimateLine(),
                estimateLine({ lineType: 'EXECUTION' }),
                estimateLine({ lineType: 'VENDOR' }),
              ],
            }),
          ])
        );
        expect(result.success).toBe(true);
      });

      it('同一項目内で行タイプが重複する場合は重複した行を指して拒否する', () => {
        const result = saveEstimateDraftSchema.safeParse(
          draft([existingNode({ lines: [estimateLine(), estimateLine()] })])
        );
        expect(result.success).toBe(false);
        expect(issuePaths(result)).toContain('items.0.lines.1');
      });

      it('行を1件も持たない項目は拒否する', () => {
        const result = saveEstimateDraftSchema.safeParse(draft([existingNode({ lines: [] })]));
        expect(result.success).toBe(false);
        expect(issuePaths(result)).toContain('items.0.lines');
      });
    });

    describe('循環参照と親を失った項目（42.8）', () => {
      it('自身のIDが子孫に現れる場合は拒否する', () => {
        const result = saveEstimateDraftSchema.safeParse(
          draft([existingNode({ children: [existingNode()] })])
        );
        expect(result.success).toBe(false);
        expect(issuePaths(result)).toContain('items.0.children.0.id');
      });

      it('同一IDが別々の親に現れる場合は拒否する', () => {
        const result = saveEstimateDraftSchema.safeParse(
          draft([existingNode(), existingNode({ children: [] })])
        );
        expect(result.success).toBe(false);
        expect(issuePaths(result)).toContain('items.1.id');
      });

      it('深い階層の重複IDも検出する', () => {
        const result = saveEstimateDraftSchema.safeParse(
          draft([
            existingNode({
              children: [existingNode({ id: CHILD_ID, children: [existingNode()] })],
            }),
          ])
        );
        expect(result.success).toBe(false);
        expect(issuePaths(result)).toContain('items.0.children.0.children.0.id');
      });
    });

    describe('帳票用入力項目（54.1, 54.2, 54.3）', () => {
      it('別途工事を5件まで受け入れる', () => {
        const result = saveEstimateDraftSchema.safeParse(
          draft([], {
            reportFields: {
              submissionDate: null,
              validityPeriod: null,
              separateWorks: ['1', '2', '3', '4', '5'],
            },
          })
        );
        expect(result.success).toBe(true);
      });

      it('別途工事が6件の場合は拒否する', () => {
        const result = saveEstimateDraftSchema.safeParse(
          draft([], {
            reportFields: {
              submissionDate: null,
              validityPeriod: null,
              separateWorks: ['1', '2', '3', '4', '5', '6'],
            },
          })
        );
        expect(result.success).toBe(false);
        expect(issuePaths(result)).toContain('reportFields.separateWorks');
      });

      it('別途工事の各件が200文字を超える場合は拒否する', () => {
        const result = saveEstimateDraftSchema.safeParse(
          draft([], {
            reportFields: {
              submissionDate: null,
              validityPeriod: null,
              separateWorks: ['あ'.repeat(201)],
            },
          })
        );
        expect(result.success).toBe(false);
        expect(issuePaths(result)).toContain('reportFields.separateWorks.0');
      });

      it('有効期限が100文字を超える場合は拒否する', () => {
        const result = saveEstimateDraftSchema.safeParse(
          draft([], {
            reportFields: {
              submissionDate: null,
              validityPeriod: 'あ'.repeat(101),
              separateWorks: [],
            },
          })
        );
        expect(result.success).toBe(false);
        expect(issuePaths(result)).toContain('reportFields.validityPeriod');
      });

      it('提出日が日付形式でない場合は拒否する', () => {
        const result = saveEstimateDraftSchema.safeParse(
          draft([], {
            reportFields: {
              submissionDate: '2026/07/31',
              validityPeriod: null,
              separateWorks: [],
            },
          })
        );
        expect(result.success).toBe(false);
        expect(issuePaths(result)).toContain('reportFields.submissionDate');
      });

      // フル状態同期のため、帳票用入力項目の省略は保存済みの値を静かに消す経路になる。
      // 省略は既定値で補完せず拒否する（54.1〜54.3）
      it('帳票用入力項目を省略したリクエストは拒否する', () => {
        const payload = draft([]) as Record<string, unknown>;
        delete payload.reportFields;
        const result = saveEstimateDraftSchema.safeParse(payload);
        expect(result.success).toBe(false);
        expect(issuePaths(result)).toContain('reportFields');
      });
    });

    describe('明細行の値（13.1, 13.2）', () => {
      it('数値文字列でない数量を拒否する', () => {
        const result = saveEstimateDraftSchema.safeParse(
          draft([existingNode({ lines: [estimateLine({ quantity: 'abc' })] })])
        );
        expect(result.success).toBe(false);
        expect(issuePaths(result)).toContain('items.0.lines.0.quantity');
      });

      it('小数第5位以上の数量を拒否する（Decimal(15,4)）', () => {
        const result = saveEstimateDraftSchema.safeParse(
          draft([existingNode({ lines: [estimateLine({ quantity: '1.00001' })] })])
        );
        expect(result.success).toBe(false);
        expect(issuePaths(result)).toContain('items.0.lines.0.quantity');
      });

      it('小数第3位以上の単価を拒否する（Decimal(15,2)）', () => {
        const result = saveEstimateDraftSchema.safeParse(
          draft([existingNode({ lines: [estimateLine({ unitPrice: '100.001' })] })])
        );
        expect(result.success).toBe(false);
        expect(issuePaths(result)).toContain('items.0.lines.0.unitPrice');
      });

      it('値引き行の負数の単価・金額を受け入れる（41.5）', () => {
        const result = saveEstimateDraftSchema.safeParse(
          draft([
            existingNode({
              itemType: 'DISCOUNT',
              lines: [estimateLine({ unitPrice: '-50000.00', amount: '-50000.00' })],
            }),
          ])
        );
        expect(result.success).toBe(true);
      });

      it('名称が200文字を超える場合は拒否する', () => {
        const result = saveEstimateDraftSchema.safeParse(
          draft([existingNode({ lines: [estimateLine({ name: 'あ'.repeat(201) })] })])
        );
        expect(result.success).toBe(false);
        expect(issuePaths(result)).toContain('items.0.lines.0.name');
      });

      // フル状態同期のため「キーの欠落＝null 上書き」を許さない。
      // 明細行の各フィールドは null 許容だが省略不可とする（design.md 4313-4323）
      it('明細行のフィールドを省略したリクエストは拒否する', () => {
        const result = saveEstimateDraftSchema.safeParse(
          draft([existingNode({ lines: [{ lineType: 'ESTIMATE' }] })])
        );
        expect(result.success).toBe(false);
        const paths = issuePaths(result);
        expect(paths).toContain('items.0.lines.0.name');
        expect(paths).toContain('items.0.lines.0.quantity');
        expect(paths).toContain('items.0.lines.0.sourceVendorName');
      });

      it('明細行のフィールドは null を明示すれば受け入れる', () => {
        const result = saveEstimateDraftSchema.safeParse(
          draft([
            existingNode({
              lines: [
                estimateLine({
                  name: null,
                  unit: null,
                  quantity: null,
                  unitPrice: null,
                  amount: null,
                }),
              ],
            }),
          ])
        );
        expect(result.success).toBe(true);
      });
    });

    describe('ノードのフィールド必須性（design.md 4305-4311）', () => {
      it.each(['id', 'tempId', 'children'])('%s を省略したリクエストは拒否する', (field) => {
        const node = existingNode() as Record<string, unknown>;
        delete node[field];
        const result = saveEstimateDraftSchema.safeParse(draft([node]));
        expect(result.success).toBe(false);
        expect(issuePaths(result)).toContain(`items.0.${field}`);
      });

      it('葉の項目は children に空配列を明示すれば受け入れる', () => {
        const result = saveEstimateDraftSchema.safeParse(draft([existingNode({ children: [] })]));
        expect(result.success).toBe(true);
      });
    });

    describe('不備内容の返却（42.4）', () => {
      it('複数の不備をまとめて呼び出し元に返す', () => {
        const result = saveEstimateDraftSchema.safeParse(
          draft([
            existingNode({ itemType: 'NOTE', children: [existingNode({ id: CHILD_ID })] }),
            newNode('tmp-1', { tempId: null }),
          ])
        );
        expect(result.success).toBe(false);
        const paths = issuePaths(result);
        expect(paths).toContain('items.0.children');
        expect(paths).toContain('items.1.tempId');
      });

      it('検証NGの各 issue が日本語メッセージを持つ', () => {
        const result = saveEstimateDraftSchema.safeParse(
          draft([
            existingNode({ itemType: 'DISCOUNT', children: [existingNode({ id: CHILD_ID })] }),
          ])
        );
        expect(result.success).toBe(false);
        const messages = (result.error?.issues ?? []).map((issue) => issue.message);
        expect(messages).toContain(SAVE_ESTIMATE_VALIDATION_MESSAGES.ITEM_CHILDREN_NOT_ALLOWED);
      });
    });
  });
});
