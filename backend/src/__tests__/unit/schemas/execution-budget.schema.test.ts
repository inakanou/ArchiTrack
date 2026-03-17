/**
 * @fileoverview 実行予算管理Zodバリデーションスキーマのユニットテスト
 *
 * TDD: RED phase - テストを先に書く
 *
 * Requirements:
 * - 19.7: API入力値のバリデーションにZodスキーマを使用する
 *
 * Task 1.2: Zodバリデーションスキーマの定義
 * - 実行予算作成・更新、発注作成・更新・ステータス変更、出来高入力、原価入力、月次締めの各API入力に対するZodスキーマ
 * - 金額フィールドの文字列受け取りとDecimal変換のバリデーションロジック
 * - targetMonth（YYYY-MM形式）のカスタムバリデーション
 */

import { describe, it, expect } from 'vitest';
import {
  createExecutionBudgetSchema,
  updateExecutionBudgetItemSchema,
  createOrderSchema,
  updateOrderSchema,
  updateOrderItemsSchema,
  updateOrderStatusSchema,
  saveProgressSchema,
  updateCostSchema,
  monthlyCloseSchema,
  EXECUTION_BUDGET_VALIDATION_MESSAGES,
  decimalStringSchema,
  targetMonthSchema,
} from '../../../schemas/execution-budget.schema.js';

// ========================================
// テストデータのテンプレート
// ========================================

const VALID_UUID = '550e8400-e29b-41d4-a716-446655440001';
const VALID_UUID_2 = '550e8400-e29b-41d4-a716-446655440002';

// ========================================
// decimalStringSchema テスト
// ========================================

describe('decimalStringSchema', () => {
  it('正の整数文字列でバリデーションが成功すること', () => {
    const result = decimalStringSchema.safeParse('12345');
    expect(result.success).toBe(true);
  });

  it('正の小数文字列でバリデーションが成功すること', () => {
    const result = decimalStringSchema.safeParse('12345.67');
    expect(result.success).toBe(true);
  });

  it('0でバリデーションが成功すること', () => {
    const result = decimalStringSchema.safeParse('0');
    expect(result.success).toBe(true);
  });

  it('負の数値文字列でバリデーションが成功すること', () => {
    const result = decimalStringSchema.safeParse('-100');
    expect(result.success).toBe(true);
  });

  it('空文字列でエラーになること', () => {
    const result = decimalStringSchema.safeParse('');
    expect(result.success).toBe(false);
  });

  it('数値でない文字列でエラーになること', () => {
    const result = decimalStringSchema.safeParse('abc');
    expect(result.success).toBe(false);
  });

  it('数値型でエラーになること（文字列のみ受け付ける）', () => {
    const result = decimalStringSchema.safeParse(12345);
    expect(result.success).toBe(false);
  });
});

// ========================================
// targetMonthSchema テスト
// ========================================

describe('targetMonthSchema', () => {
  it('YYYY-MM形式の有効な文字列でバリデーションが成功すること', () => {
    const result = targetMonthSchema.safeParse('2026-03');
    expect(result.success).toBe(true);
  });

  it('12月でバリデーションが成功すること', () => {
    const result = targetMonthSchema.safeParse('2026-12');
    expect(result.success).toBe(true);
  });

  it('1月でバリデーションが成功すること', () => {
    const result = targetMonthSchema.safeParse('2026-01');
    expect(result.success).toBe(true);
  });

  it('月が13の場合エラーになること', () => {
    const result = targetMonthSchema.safeParse('2026-13');
    expect(result.success).toBe(false);
  });

  it('月が00の場合エラーになること', () => {
    const result = targetMonthSchema.safeParse('2026-00');
    expect(result.success).toBe(false);
  });

  it('YYYY-MM-DD形式でエラーになること', () => {
    const result = targetMonthSchema.safeParse('2026-03-18');
    expect(result.success).toBe(false);
  });

  it('不正な形式でエラーになること', () => {
    const result = targetMonthSchema.safeParse('2026/03');
    expect(result.success).toBe(false);
  });

  it('空文字列でエラーになること', () => {
    const result = targetMonthSchema.safeParse('');
    expect(result.success).toBe(false);
  });
});

// ========================================
// createExecutionBudgetSchema テスト
// ========================================

describe('createExecutionBudgetSchema', () => {
  const validData = {
    contractId: VALID_UUID,
  };

  describe('有効なデータのバリデーション', () => {
    it('有効なcontractIdでバリデーションが成功すること', () => {
      const result = createExecutionBudgetSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });
  });

  describe('contractId バリデーション', () => {
    it('contractIdが空文字列でエラーになること', () => {
      const result = createExecutionBudgetSchema.safeParse({ contractId: '' });
      expect(result.success).toBe(false);
    });

    it('contractIdが不正なUUID形式でエラーになること', () => {
      const result = createExecutionBudgetSchema.safeParse({ contractId: 'invalid-uuid' });
      expect(result.success).toBe(false);
    });

    it('contractIdが未指定でエラーになること', () => {
      const result = createExecutionBudgetSchema.safeParse({});
      expect(result.success).toBe(false);
    });
  });
});

// ========================================
// updateExecutionBudgetItemSchema テスト
// ========================================

describe('updateExecutionBudgetItemSchema', () => {
  describe('実行単価の更新', () => {
    it('実行単価を文字列で指定してバリデーションが成功すること', () => {
      const result = updateExecutionBudgetItemSchema.safeParse({
        executionUnitPrice: '15000.50',
        version: 0,
      });
      expect(result.success).toBe(true);
    });

    it('実行単価を省略してバリデーションが成功すること', () => {
      const result = updateExecutionBudgetItemSchema.safeParse({
        version: 0,
      });
      expect(result.success).toBe(true);
    });

    it('実行単価が不正な文字列でエラーになること', () => {
      const result = updateExecutionBudgetItemSchema.safeParse({
        executionUnitPrice: 'abc',
        version: 0,
      });
      expect(result.success).toBe(false);
    });
  });

  describe('備考の更新', () => {
    it('備考を指定してバリデーションが成功すること', () => {
      const result = updateExecutionBudgetItemSchema.safeParse({
        remarks: 'テスト備考',
        version: 0,
      });
      expect(result.success).toBe(true);
    });

    it('備考をnullで指定してバリデーションが成功すること', () => {
      const result = updateExecutionBudgetItemSchema.safeParse({
        remarks: null,
        version: 0,
      });
      expect(result.success).toBe(true);
    });
  });

  describe('version バリデーション', () => {
    it('versionが必須であること', () => {
      const result = updateExecutionBudgetItemSchema.safeParse({
        executionUnitPrice: '15000',
      });
      expect(result.success).toBe(false);
    });

    it('versionが負の値でエラーになること', () => {
      const result = updateExecutionBudgetItemSchema.safeParse({
        version: -1,
      });
      expect(result.success).toBe(false);
    });

    it('versionが小数でエラーになること', () => {
      const result = updateExecutionBudgetItemSchema.safeParse({
        version: 1.5,
      });
      expect(result.success).toBe(false);
    });
  });
});

// ========================================
// createOrderSchema テスト
// ========================================

describe('createOrderSchema', () => {
  const validData = {
    tradingPartnerId: VALID_UUID,
  };

  describe('有効なデータのバリデーション', () => {
    it('有効なtradingPartnerIdでバリデーションが成功すること', () => {
      const result = createOrderSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });
  });

  describe('tradingPartnerId バリデーション', () => {
    it('tradingPartnerIdが未指定でエラーになること', () => {
      const result = createOrderSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it('tradingPartnerIdが不正なUUIDでエラーになること', () => {
      const result = createOrderSchema.safeParse({ tradingPartnerId: 'not-a-uuid' });
      expect(result.success).toBe(false);
    });
  });
});

// ========================================
// updateOrderSchema テスト
// ========================================

describe('updateOrderSchema', () => {
  describe('有効なデータのバリデーション', () => {
    it('tradingPartnerIdの更新でバリデーションが成功すること', () => {
      const result = updateOrderSchema.safeParse({
        tradingPartnerId: VALID_UUID_2,
      });
      expect(result.success).toBe(true);
    });

    it('confirmedAmountを文字列で指定してバリデーションが成功すること', () => {
      const result = updateOrderSchema.safeParse({
        confirmedAmount: '5000000',
      });
      expect(result.success).toBe(true);
    });

    it('全フィールド省略でバリデーションが成功すること', () => {
      const result = updateOrderSchema.safeParse({});
      expect(result.success).toBe(true);
    });
  });

  describe('confirmedAmount バリデーション', () => {
    it('confirmedAmountが不正な文字列でエラーになること', () => {
      const result = updateOrderSchema.safeParse({
        confirmedAmount: 'invalid',
      });
      expect(result.success).toBe(false);
    });
  });
});

// ========================================
// updateOrderItemsSchema テスト
// ========================================

describe('updateOrderItemsSchema', () => {
  describe('有効なデータのバリデーション', () => {
    it('有効なitemIds配列でバリデーションが成功すること', () => {
      const result = updateOrderItemsSchema.safeParse({
        itemIds: [VALID_UUID, VALID_UUID_2],
      });
      expect(result.success).toBe(true);
    });

    it('空の配列でバリデーションが成功すること', () => {
      const result = updateOrderItemsSchema.safeParse({
        itemIds: [],
      });
      expect(result.success).toBe(true);
    });
  });

  describe('itemIds バリデーション', () => {
    it('itemIdsが未指定でエラーになること', () => {
      const result = updateOrderItemsSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it('不正なUUIDを含むとエラーになること', () => {
      const result = updateOrderItemsSchema.safeParse({
        itemIds: [VALID_UUID, 'invalid'],
      });
      expect(result.success).toBe(false);
    });
  });
});

// ========================================
// updateOrderStatusSchema テスト
// ========================================

describe('updateOrderStatusSchema', () => {
  describe('有効なデータのバリデーション', () => {
    it('BEFORE_ORDERステータスでバリデーションが成功すること', () => {
      const result = updateOrderStatusSchema.safeParse({
        status: 'BEFORE_ORDER',
      });
      expect(result.success).toBe(true);
    });

    it('UNDER_REVIEWステータスでバリデーションが成功すること', () => {
      const result = updateOrderStatusSchema.safeParse({
        status: 'UNDER_REVIEW',
      });
      expect(result.success).toBe(true);
    });

    it('ORDEREDステータスとconfirmedAmountでバリデーションが成功すること', () => {
      const result = updateOrderStatusSchema.safeParse({
        status: 'ORDERED',
        confirmedAmount: '5000000',
      });
      expect(result.success).toBe(true);
    });

    it('CANCELLEDステータスでバリデーションが成功すること', () => {
      const result = updateOrderStatusSchema.safeParse({
        status: 'CANCELLED',
      });
      expect(result.success).toBe(true);
    });
  });

  describe('status バリデーション', () => {
    it('無効なステータスでエラーになること', () => {
      const result = updateOrderStatusSchema.safeParse({
        status: 'INVALID_STATUS',
      });
      expect(result.success).toBe(false);
    });

    it('statusが未指定でエラーになること', () => {
      const result = updateOrderStatusSchema.safeParse({});
      expect(result.success).toBe(false);
    });
  });

  describe('confirmedAmount バリデーション', () => {
    it('confirmedAmountが不正な文字列でエラーになること', () => {
      const result = updateOrderStatusSchema.safeParse({
        status: 'ORDERED',
        confirmedAmount: 'not-a-number',
      });
      expect(result.success).toBe(false);
    });
  });
});

// ========================================
// saveProgressSchema テスト
// ========================================

describe('saveProgressSchema', () => {
  const validData = {
    constructionDate: '2026-03-18',
    items: [
      { itemId: VALID_UUID, amount: '500000' },
      { itemId: VALID_UUID_2, amount: '300000' },
    ],
  };

  describe('有効なデータのバリデーション', () => {
    it('有効なデータでバリデーションが成功すること', () => {
      const result = saveProgressSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('出来高金額が0でバリデーションが成功すること', () => {
      const result = saveProgressSchema.safeParse({
        constructionDate: '2026-03-18',
        items: [{ itemId: VALID_UUID, amount: '0' }],
      });
      expect(result.success).toBe(true);
    });
  });

  describe('constructionDate バリデーション', () => {
    it('constructionDateが未指定でエラーになること', () => {
      const result = saveProgressSchema.safeParse({
        items: [{ itemId: VALID_UUID, amount: '500000' }],
      });
      expect(result.success).toBe(false);
    });

    it('constructionDateが不正な日付でエラーになること', () => {
      const result = saveProgressSchema.safeParse({
        constructionDate: 'invalid-date',
        items: [{ itemId: VALID_UUID, amount: '500000' }],
      });
      expect(result.success).toBe(false);
    });
  });

  describe('items バリデーション', () => {
    it('itemsが空配列でエラーになること', () => {
      const result = saveProgressSchema.safeParse({
        constructionDate: '2026-03-18',
        items: [],
      });
      expect(result.success).toBe(false);
    });

    it('items内のitemIdが不正なUUIDでエラーになること', () => {
      const result = saveProgressSchema.safeParse({
        constructionDate: '2026-03-18',
        items: [{ itemId: 'invalid', amount: '500000' }],
      });
      expect(result.success).toBe(false);
    });

    it('items内のamountが不正な文字列でエラーになること', () => {
      const result = saveProgressSchema.safeParse({
        constructionDate: '2026-03-18',
        items: [{ itemId: VALID_UUID, amount: 'not-a-number' }],
      });
      expect(result.success).toBe(false);
    });

    it('items内のamountが負の値でエラーになること', () => {
      const result = saveProgressSchema.safeParse({
        constructionDate: '2026-03-18',
        items: [{ itemId: VALID_UUID, amount: '-100' }],
      });
      expect(result.success).toBe(false);
    });
  });
});

// ========================================
// updateCostSchema テスト
// ========================================

describe('updateCostSchema', () => {
  describe('有効なデータのバリデーション', () => {
    it('有効なcurrentMonthExpenseでバリデーションが成功すること', () => {
      const result = updateCostSchema.safeParse({
        currentMonthExpense: '100000',
        version: 0,
      });
      expect(result.success).toBe(true);
    });

    it('currentMonthExpenseが0でバリデーションが成功すること', () => {
      const result = updateCostSchema.safeParse({
        currentMonthExpense: '0',
        version: 0,
      });
      expect(result.success).toBe(true);
    });
  });

  describe('currentMonthExpense バリデーション', () => {
    it('currentMonthExpenseが未指定でエラーになること', () => {
      const result = updateCostSchema.safeParse({ version: 0 });
      expect(result.success).toBe(false);
    });

    it('currentMonthExpenseが不正な文字列でエラーになること', () => {
      const result = updateCostSchema.safeParse({
        currentMonthExpense: 'invalid',
        version: 0,
      });
      expect(result.success).toBe(false);
    });
  });

  describe('version バリデーション', () => {
    it('versionが必須であること', () => {
      const result = updateCostSchema.safeParse({
        currentMonthExpense: '100000',
      });
      expect(result.success).toBe(false);
    });
  });
});

// ========================================
// monthlyCloseSchema テスト
// ========================================

describe('monthlyCloseSchema', () => {
  describe('有効なデータのバリデーション', () => {
    it('有効なtargetMonthでバリデーションが成功すること', () => {
      const result = monthlyCloseSchema.safeParse({
        targetMonth: '2026-03',
      });
      expect(result.success).toBe(true);
    });
  });

  describe('targetMonth バリデーション', () => {
    it('targetMonthが未指定でエラーになること', () => {
      const result = monthlyCloseSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it('targetMonthが不正な形式でエラーになること', () => {
      const result = monthlyCloseSchema.safeParse({
        targetMonth: '2026/03',
      });
      expect(result.success).toBe(false);
    });

    it('targetMonthがYYYY-MM-DD形式でエラーになること', () => {
      const result = monthlyCloseSchema.safeParse({
        targetMonth: '2026-03-18',
      });
      expect(result.success).toBe(false);
    });

    it('targetMonthの月が範囲外でエラーになること', () => {
      const result = monthlyCloseSchema.safeParse({
        targetMonth: '2026-13',
      });
      expect(result.success).toBe(false);
    });
  });
});

// ========================================
// EXECUTION_BUDGET_VALIDATION_MESSAGES テスト
// ========================================

describe('EXECUTION_BUDGET_VALIDATION_MESSAGES', () => {
  it('バリデーションメッセージ定数が定義されていること', () => {
    expect(EXECUTION_BUDGET_VALIDATION_MESSAGES).toBeDefined();
    expect(typeof EXECUTION_BUDGET_VALIDATION_MESSAGES.CONTRACT_ID_REQUIRED).toBe('string');
    expect(typeof EXECUTION_BUDGET_VALIDATION_MESSAGES.DECIMAL_INVALID).toBe('string');
    expect(typeof EXECUTION_BUDGET_VALIDATION_MESSAGES.TARGET_MONTH_INVALID).toBe('string');
    expect(typeof EXECUTION_BUDGET_VALIDATION_MESSAGES.VERSION_REQUIRED).toBe('string');
    expect(typeof EXECUTION_BUDGET_VALIDATION_MESSAGES.STATUS_INVALID).toBe('string');
  });
});
