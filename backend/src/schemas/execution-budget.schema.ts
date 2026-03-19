/**
 * @fileoverview 実行予算管理用バリデーションスキーマ
 *
 * 実行予算作成・更新、発注作成・更新・ステータス変更、出来高入力、原価入力、月次締めの
 * 各API入力に対するZodスキーマを定義する。
 *
 * Requirements:
 * - 19.7: API入力値のバリデーションにZodスキーマを使用する
 *
 * Task 1.2: Zodバリデーションスキーマの定義
 * - 金額フィールドの文字列受け取りとDecimal変換のバリデーションロジック
 * - targetMonth（YYYY-MM形式）のカスタムバリデーション
 */

import { z } from 'zod';

/**
 * UUIDバリデーション用正規表現
 */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * YYYY-MM形式の正規表現（月: 01-12）
 */
const TARGET_MONTH_REGEX = /^\d{4}-(0[1-9]|1[0-2])$/;

/**
 * バリデーションエラーメッセージ定数
 */
export const EXECUTION_BUDGET_VALIDATION_MESSAGES = {
  // 共通
  UUID_INVALID: 'IDの形式が不正です',

  // 契約書ID
  CONTRACT_ID_REQUIRED: '契約書IDは必須です',
  CONTRACT_ID_INVALID_UUID: '契約書IDの形式が不正です',

  // 金額（Decimal文字列）
  DECIMAL_INVALID: '金額は有効な数値文字列で入力してください',
  DECIMAL_NON_NEGATIVE: '金額は0以上の値で入力してください',

  // 取引先ID
  TRADING_PARTNER_ID_REQUIRED: '取引先IDは必須です',
  TRADING_PARTNER_ID_INVALID_UUID: '取引先IDの形式が不正です',

  // version
  VERSION_REQUIRED: 'バージョンは必須です',
  VERSION_MIN: 'バージョンは0以上である必要があります',
  VERSION_INTEGER: 'バージョンは整数である必要があります',

  // ステータス
  STATUS_INVALID: '無効なステータスです',

  // targetMonth
  TARGET_MONTH_REQUIRED: '対象月は必須です',
  TARGET_MONTH_INVALID: '対象月はYYYY-MM形式で入力してください',

  // 施工日
  CONSTRUCTION_DATE_REQUIRED: '施工日は必須です',
  CONSTRUCTION_DATE_INVALID: '施工日の形式が不正です',

  // 出来高
  ITEMS_REQUIRED: '項目は1つ以上必要です',
  ITEM_ID_INVALID_UUID: '項目IDの形式が不正です',
  AMOUNT_INVALID: '金額は有効な数値文字列で入力してください',
  AMOUNT_NON_NEGATIVE: '出来高金額は0以上の値で入力してください',

  // 原価
  CURRENT_MONTH_EXPENSE_REQUIRED: '今月の支出は必須です',
} as const;

/**
 * Decimal文字列バリデーションスキーマ
 *
 * JavaScriptの数値精度問題を回避するため、金額フィールドは文字列として受け取り、
 * バリデーション後にサービス層でDecimalに変換する。
 */
export const decimalStringSchema = z.string().refine(
  (val) => {
    if (val === '') return false;
    const num = Number(val);
    return !isNaN(num) && isFinite(num);
  },
  { message: EXECUTION_BUDGET_VALIDATION_MESSAGES.DECIMAL_INVALID }
);

/**
 * 非負Decimal文字列バリデーションスキーマ
 *
 * 出来高金額など、0以上の制約がある金額フィールド用。
 */
export const nonNegativeDecimalStringSchema = z.string().refine(
  (val) => {
    if (val === '') return false;
    const num = Number(val);
    return !isNaN(num) && isFinite(num) && num >= 0;
  },
  { message: EXECUTION_BUDGET_VALIDATION_MESSAGES.AMOUNT_NON_NEGATIVE }
);

/**
 * targetMonth（YYYY-MM形式）バリデーションスキーマ
 *
 * 月次締め処理の対象月を検証する。
 */
export const targetMonthSchema = z.string().refine((val) => TARGET_MONTH_REGEX.test(val), {
  message: EXECUTION_BUDGET_VALIDATION_MESSAGES.TARGET_MONTH_INVALID,
});

/**
 * UUID文字列バリデーション
 */
const uuidSchema = (message: string = EXECUTION_BUDGET_VALIDATION_MESSAGES.UUID_INVALID) =>
  z.string().regex(UUID_REGEX, message);

/**
 * 日付文字列バリデーション（YYYY-MM-DD形式またはISO8601形式）
 */
const dateStringSchema = z.string().refine(
  (val) => {
    const date = new Date(val);
    return !isNaN(date.getTime());
  },
  { message: EXECUTION_BUDGET_VALIDATION_MESSAGES.CONSTRUCTION_DATE_INVALID }
);

/**
 * 発注ステータスenum
 */
const ORDER_STATUSES = ['BEFORE_ORDER', 'UNDER_REVIEW', 'ORDERED', 'CANCELLED'] as const;

// ========================================
// 実行予算スキーマ
// ========================================

/**
 * 実行予算作成入力スキーマ
 *
 * Requirements: 1.1-1.7（実行予算の作成）
 */
export const createExecutionBudgetSchema = z.object({
  contractId: z
    .string()
    .min(1, EXECUTION_BUDGET_VALIDATION_MESSAGES.CONTRACT_ID_REQUIRED)
    .regex(UUID_REGEX, EXECUTION_BUDGET_VALIDATION_MESSAGES.CONTRACT_ID_INVALID_UUID),
});

/**
 * 実行予算作成入力の型
 */
export type CreateExecutionBudgetInput = z.infer<typeof createExecutionBudgetSchema>;

/**
 * 実行予算項目更新入力スキーマ
 *
 * 実行単価と備考の更新。楽観的排他制御用のversionフィールドを必須とする。
 *
 * Requirements: 4.1-4.5（実行予算項目の編集）
 */
export const updateExecutionBudgetItemSchema = z.object({
  executionUnitPrice: decimalStringSchema.optional(),
  remarks: z.string().nullable().optional(),
  version: z
    .number()
    .int(EXECUTION_BUDGET_VALIDATION_MESSAGES.VERSION_INTEGER)
    .min(0, EXECUTION_BUDGET_VALIDATION_MESSAGES.VERSION_MIN),
});

/**
 * 実行予算項目更新入力の型
 */
export type UpdateExecutionBudgetItemInput = z.infer<typeof updateExecutionBudgetItemSchema>;

// ========================================
// 契約変更反映スキーマ
// ========================================

/**
 * 契約変更反映入力スキーマ
 *
 * Requirements: 15.1-15.8（契約変更への対応）
 */
export const applyAmendmentSchema = z.object({
  contractId: z
    .string()
    .min(1, EXECUTION_BUDGET_VALIDATION_MESSAGES.CONTRACT_ID_REQUIRED)
    .regex(UUID_REGEX, EXECUTION_BUDGET_VALIDATION_MESSAGES.CONTRACT_ID_INVALID_UUID),
});

/**
 * 契約変更反映入力の型
 */
export type ApplyAmendmentInput = z.infer<typeof applyAmendmentSchema>;

// ========================================
// 発注スキーマ
// ========================================

/**
 * 発注作成入力スキーマ
 *
 * Requirements: 6.1-6.8（発注の作成と取引先指定）
 */
export const createOrderSchema = z.object({
  tradingPartnerId: z
    .string()
    .min(1, EXECUTION_BUDGET_VALIDATION_MESSAGES.TRADING_PARTNER_ID_REQUIRED)
    .regex(UUID_REGEX, EXECUTION_BUDGET_VALIDATION_MESSAGES.TRADING_PARTNER_ID_INVALID_UUID),
});

/**
 * 発注作成入力の型
 */
export type CreateOrderInput = z.infer<typeof createOrderSchema>;

/**
 * 発注更新入力スキーマ
 *
 * Requirements: 7.1-7.5（発注の編集と削除）
 */
export const updateOrderSchema = z.object({
  tradingPartnerId: uuidSchema(
    EXECUTION_BUDGET_VALIDATION_MESSAGES.TRADING_PARTNER_ID_INVALID_UUID
  ).optional(),
  confirmedAmount: decimalStringSchema.optional(),
});

/**
 * 発注更新入力の型
 */
export type UpdateOrderInput = z.infer<typeof updateOrderSchema>;

/**
 * 発注項目更新入力スキーマ
 *
 * Requirements: 6.4（チェックの追加・削除）
 */
export const updateOrderItemsSchema = z.object({
  itemIds: z.array(uuidSchema(EXECUTION_BUDGET_VALIDATION_MESSAGES.ITEM_ID_INVALID_UUID)),
});

/**
 * 発注項目更新入力の型
 */
export type UpdateOrderItemsInput = z.infer<typeof updateOrderItemsSchema>;

/**
 * 発注ステータス変更入力スキーマ
 *
 * Requirements: 8.1-8.9（発注金額の確定と案分）
 */
export const updateOrderStatusSchema = z.object({
  status: z.enum(ORDER_STATUSES, EXECUTION_BUDGET_VALIDATION_MESSAGES.STATUS_INVALID),
  confirmedAmount: decimalStringSchema.optional(),
});

/**
 * 発注ステータス変更入力の型
 */
export type UpdateOrderStatusInput = z.infer<typeof updateOrderStatusSchema>;

// ========================================
// 出来高スキーマ
// ========================================

/**
 * 出来高保存入力スキーマ
 *
 * Requirements: 11.1-11.11（出来高入力機能）、12.1-12.2（出来高の履歴管理）
 */
export const saveProgressSchema = z.object({
  constructionDate: dateStringSchema,
  items: z
    .array(
      z.object({
        itemId: uuidSchema(EXECUTION_BUDGET_VALIDATION_MESSAGES.ITEM_ID_INVALID_UUID),
        amount: nonNegativeDecimalStringSchema,
      })
    )
    .min(1, EXECUTION_BUDGET_VALIDATION_MESSAGES.ITEMS_REQUIRED),
});

/**
 * 出来高保存入力の型
 */
export type SaveProgressInput = z.infer<typeof saveProgressSchema>;

// ========================================
// 原価スキーマ
// ========================================

/**
 * 原価（今月の支出）更新入力スキーマ
 *
 * Requirements: 13.1-13.8（原価管理）
 */
export const updateCostSchema = z.object({
  currentMonthExpense: decimalStringSchema,
  version: z
    .number()
    .int(EXECUTION_BUDGET_VALIDATION_MESSAGES.VERSION_INTEGER)
    .min(0, EXECUTION_BUDGET_VALIDATION_MESSAGES.VERSION_MIN),
});

/**
 * 原価更新入力の型
 */
export type UpdateCostInput = z.infer<typeof updateCostSchema>;

// ========================================
// 月次締めスキーマ
// ========================================

/**
 * 月次締め入力スキーマ
 *
 * Requirements: 14.1-14.5（月次締め処理）
 */
export const monthlyCloseSchema = z.object({
  targetMonth: targetMonthSchema,
});

/**
 * 月次締め入力の型
 */
export type MonthlyCloseInput = z.infer<typeof monthlyCloseSchema>;

// ========================================
// エクスポートスキーマ
// ========================================

/**
 * エクスポート出力形式
 */
const EXPORT_FORMATS = ['xlsx', 'pdf'] as const;

/**
 * エクスポートクエリスキーマ
 *
 * format（xlsx/pdf）クエリパラメータによる出力形式切り替え。
 *
 * Requirements: 19.9（APIレスポンスに適切なHTTPステータスコードを返却する）
 */
export const exportQuerySchema = z.object({
  format: z.enum(EXPORT_FORMATS, {
    message: 'サポートされていない出力形式です。xlsx または pdf を指定してください',
  }),
});

/**
 * エクスポートクエリの型
 */
export type ExportQuery = z.infer<typeof exportQuerySchema>;
