/**
 * @fileoverview 見積書バリデーションスキーマ
 *
 * 見積書APIのリクエストバリデーションスキーマを定義します。
 *
 * Requirements (estimate-creation):
 * - REQ-11.1: プロジェクトに紐付く見積書の一覧を表示する
 * - REQ-11.5: 見積書に見積名称を設定可能とする
 * - REQ-11.6: 楽観的排他制御により競合を検出する
 * - REQ-13.1: 数量フィールドの数値バリデーション
 * - REQ-13.2: 単価フィールドの数値バリデーション
 * - REQ-13.3: 利益率の範囲バリデーション（0.00〜500.00）
 * - REQ-13.4: 必須フィールド（名称等）のバリデーション
 *
 * Task 4.1: 見積書CRUD APIエンドポイントの実装
 * Task 5.1: 入力バリデーションスキーマの定義
 *
 * @module schemas/estimate
 */

import { z } from 'zod';

/**
 * 見積書バリデーションメッセージ定数
 *
 * 一貫性のあるエラーメッセージを提供するための定数定義。
 *
 * Requirements: REQ-13.1, REQ-13.2, REQ-13.3, REQ-13.4
 * Task 5.1: 入力バリデーションスキーマの定義
 */
export const ESTIMATE_VALIDATION_MESSAGES = {
  // 名称関連
  NAME_REQUIRED: '見積書名は必須です',
  NAME_TOO_LONG: '見積書名は200文字以内で入力してください',

  // 規格関連
  SPECIFICATION_TOO_LONG: '規格は500文字以内で入力してください',

  // 単位関連
  UNIT_TOO_LONG: '単位は50文字以内で入力してください',

  // 数量関連（REQ-13.1）
  QUANTITY_INVALID: '数量は数値を入力してください',

  // 単価関連（REQ-13.2）
  UNIT_PRICE_INVALID: '単価は数値を入力してください',

  // 利益率関連（REQ-13.3）
  PROFIT_RATE_INVALID: '利益率は0〜500の範囲で入力してください',

  // NET金額関連
  NET_AMOUNT_INVALID: 'NET金額は0以上の数値を入力してください',

  // 行タイプ関連
  LINE_TYPE_INVALID: '行タイプが無効です',

  // その他
  UUID_INVALID: 'IDの形式が無効です',
  DATE_INVALID: '日時の形式が無効です',
} as const;

/**
 * UUIDスキーマ
 */
const uuidSchema = z.string().uuid();

/**
 * ISO日時文字列スキーマ
 */
const isoDateTimeSchema = z.string().datetime();

/**
 * プロジェクトIDパラメータスキーマ
 */
export const projectIdParamSchema = z.object({
  projectId: uuidSchema,
});

/**
 * 見積書IDパラメータスキーマ
 */
export const estimateIdParamSchema = z.object({
  id: uuidSchema,
});

/**
 * 見積項目IDパラメータスキーマ
 */
export const estimateItemIdParamSchema = z.object({
  id: uuidSchema,
  itemId: uuidSchema,
});

/**
 * 見積書作成リクエストスキーマ
 *
 * Requirements: REQ-11.5, REQ-13.4
 */
export const createEstimateSchema = z.object({
  name: z
    .string()
    .min(1, ESTIMATE_VALIDATION_MESSAGES.NAME_REQUIRED)
    .max(200, ESTIMATE_VALIDATION_MESSAGES.NAME_TOO_LONG),
  sourceItemizedStatementId: uuidSchema.optional(),
});

/**
 * 見積書更新リクエストスキーマ
 *
 * Requirements: REQ-11.5, REQ-11.6
 */
export const updateEstimateSchema = z.object({
  name: z
    .string()
    .min(1, ESTIMATE_VALIDATION_MESSAGES.NAME_REQUIRED)
    .max(200, ESTIMATE_VALIDATION_MESSAGES.NAME_TOO_LONG),
  expectedUpdatedAt: isoDateTimeSchema,
});

/**
 * 見積書削除リクエストスキーマ
 *
 * Requirements: REQ-11.6
 */
export const deleteEstimateSchema = z.object({
  updatedAt: isoDateTimeSchema,
});

/**
 * 見積書一覧クエリスキーマ
 *
 * Requirements: REQ-11.1
 */
export const estimateListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
  sort: z.enum(['createdAt', 'name']).default('createdAt'),
  order: z.enum(['asc', 'desc']).default('desc'),
});

/**
 * 見積項目行タイプ
 */
export const lineTypeSchema = z.enum(['ESTIMATE', 'EXECUTION', 'VENDOR']);

/**
 * 見積項目行入力スキーマ
 *
 * Requirements: REQ-13.1, REQ-13.2
 * Task 5.1: 入力バリデーションスキーマの定義
 */
export const estimateItemLineSchema = z.object({
  lineType: lineTypeSchema,
  name: z.string().max(200, ESTIMATE_VALIDATION_MESSAGES.NAME_TOO_LONG).nullable().optional(),
  specification: z
    .string()
    .max(500, ESTIMATE_VALIDATION_MESSAGES.SPECIFICATION_TOO_LONG)
    .nullable()
    .optional(),
  unit: z.string().max(50, ESTIMATE_VALIDATION_MESSAGES.UNIT_TOO_LONG).nullable().optional(),
  quantity: z.number().nullable().optional(),
  unitPrice: z.number().nullable().optional(),
  remarks: z.string().nullable().optional(),
});

/**
 * 見積項目作成スキーマ
 *
 * Requirements: REQ-12.1
 */
export const createEstimateItemSchema = z.object({
  parentId: uuidSchema.nullable().optional(),
  displayOrder: z.number().int().min(0),
  lines: z.array(estimateItemLineSchema).min(1).max(3),
});

/**
 * 見積項目行更新スキーマ
 */
export const updateEstimateItemLineSchema = z.object({
  id: uuidSchema,
  lineType: lineTypeSchema,
  name: z.string().max(200).nullable().optional(),
  specification: z.string().max(500).nullable().optional(),
  unit: z.string().max(50).nullable().optional(),
  quantity: z.number().nullable().optional(),
  unitPrice: z.number().nullable().optional(),
  remarks: z.string().nullable().optional(),
});

/**
 * 見積項目更新スキーマ
 */
export const updateEstimateItemSchema = z.object({
  lines: z.array(updateEstimateItemLineSchema).min(1).max(3),
});

/**
 * 見積項目並び替えスキーマ
 *
 * Requirements: REQ-12.2
 */
export const reorderItemsSchema = z.object({
  itemOrders: z.array(
    z.object({
      id: uuidSchema,
      displayOrder: z.number().int().min(0),
    })
  ),
});

/**
 * 見積項目バッチ更新スキーマ
 */
export const batchUpdateItemsSchema = z.object({
  items: z.array(
    z.object({
      id: uuidSchema,
      lines: z.array(
        z.object({
          id: uuidSchema,
          lineType: lineTypeSchema,
          name: z.string().max(200).nullable().optional(),
          specification: z.string().max(500).nullable().optional(),
          unit: z.string().max(50).nullable().optional(),
          quantity: z.number().nullable().optional(),
          unitPrice: z.number().nullable().optional(),
          remarks: z.string().nullable().optional(),
        })
      ),
    })
  ),
  updatedAt: isoDateTimeSchema,
});

/**
 * 見積項目削除スキーマ
 */
export const deleteEstimateItemSchema = z.object({
  forceDelete: z.boolean().default(false),
});

/**
 * 見積項目移動スキーマ
 *
 * Requirements: REQ-12.6
 */
export const moveEstimateItemSchema = z.object({
  newParentId: uuidSchema.nullable(),
});

/**
 * 受領見積書転記スキーマ
 *
 * Requirements: REQ-4.1, REQ-4.2
 */
export const transferQuotationSchema = z.object({
  receivedQuotationId: uuidSchema,
  lineItemIds: z.array(uuidSchema).min(1, '転記する明細行を選択してください'),
  targetEstimateItemId: uuidSchema.optional(),
});

/**
 * NET金額計算スキーマ
 *
 * Requirements: REQ-5.1, REQ-5.2, REQ-5.3, REQ-5.4
 * Task 5.1: 入力バリデーションスキーマの定義
 */
export const calculateNetSchema = z.object({
  vendorName: z.string().min(1, '業者名は必須です'),
  targetLineIds: z.array(uuidSchema).min(1, '案分対象の行を選択してください'),
  excludeLineIds: z.array(uuidSchema).default([]),
  netAmount: z.string().refine(
    (val) => {
      const num = parseFloat(val);
      return !isNaN(num) && num >= 0;
    },
    { message: ESTIMATE_VALIDATION_MESSAGES.NET_AMOUNT_INVALID }
  ),
});

/**
 * 利益率適用スキーマ
 *
 * Requirements: REQ-6.1, REQ-13.3
 * Task 5.1: 入力バリデーションスキーマの定義
 */
export const applyProfitRateSchema = z.object({
  profitRate: z.string().refine(
    (val) => {
      const num = parseFloat(val);
      return !isNaN(num) && num >= 0 && num <= 500;
    },
    { message: ESTIMATE_VALIDATION_MESSAGES.PROFIT_RATE_INVALID }
  ),
  overwriteOption: z.enum(['all', 'empty_only', 'unit_price_only']),
});

/**
 * 諸経費種別
 */
export const overheadCostTypeSchema = z.enum([
  'COMMON_TEMPORARY',
  'SITE_MANAGEMENT',
  'GENERAL_ADMIN',
]);

/**
 * 諸経費計算スキーマ
 *
 * Requirements: REQ-7.1, REQ-8.1, REQ-9.1
 */
export const calculateOverheadSchema = z.object({
  costType: overheadCostTypeSchema,
  directCost: z.string().refine(
    (val) => {
      const num = parseFloat(val);
      return !isNaN(num) && num > 0;
    },
    { message: '直接工事費は0より大きい数値を入力してください' }
  ),
  constructionPeriod: z.number().int().min(1, '工期は1以上の整数を入力してください').optional(),
  pureConstructionCost: z
    .string()
    .refine(
      (val) => {
        const num = parseFloat(val);
        return !isNaN(num) && num > 0;
      },
      { message: '純工事費は0より大きい数値を入力してください' }
    )
    .optional(),
  constructionCost: z
    .string()
    .refine(
      (val) => {
        const num = parseFloat(val);
        return !isNaN(num) && num > 0;
      },
      { message: '工事原価は0より大きい数値を入力してください' }
    )
    .optional(),
  isRenovation: z.boolean().default(false),
});

/**
 * 諸経費行追加スキーマ
 */
export const addOverheadItemSchema = z.object({
  costType: overheadCostTypeSchema,
  unitPrice: z.number().optional(),
});

/**
 * 見積書出力クエリスキーマ
 *
 * Requirements: REQ-10.1, REQ-10.2, REQ-32.4
 *
 * Task 42.2: lineTypeをlineTypes（カンマ区切り複数対応）に変更
 * 後方互換性のため、lineType（単一値）も受付可能
 */
export const exportEstimateQuerySchema = z
  .object({
    format: z.enum(['pdf', 'xlsx']),
    lineTypes: z
      .string()
      .optional()
      .transform((val) => {
        if (!val) return undefined;
        return val.split(',').filter((v) => ['ESTIMATE', 'EXECUTION', 'VENDOR'].includes(v));
      }),
    // 後方互換性: lineType（単一値）も受付
    lineType: z.enum(['ESTIMATE', 'EXECUTION', 'VENDOR']).optional(),
  })
  .transform((data) => {
    // lineTypesが指定されている場合はそちらを優先、なければlineTypeから配列を構築
    const lineTypes =
      data.lineTypes && data.lineTypes.length > 0
        ? (data.lineTypes as Array<'ESTIMATE' | 'EXECUTION' | 'VENDOR'>)
        : data.lineType
          ? [data.lineType]
          : ['ESTIMATE' as const];
    return {
      format: data.format,
      lineTypes,
    };
  });

/**
 * 階層取得クエリスキーマ
 */
export const getItemsQuerySchema = z.object({
  hierarchy: z.coerce.boolean().default(false),
});

// 型エクスポート
export type CreateEstimateInput = z.infer<typeof createEstimateSchema>;
export type UpdateEstimateInput = z.infer<typeof updateEstimateSchema>;
export type DeleteEstimateInput = z.infer<typeof deleteEstimateSchema>;
export type EstimateListQuery = z.infer<typeof estimateListQuerySchema>;
export type CreateEstimateItemInput = z.infer<typeof createEstimateItemSchema>;
export type UpdateEstimateItemInput = z.infer<typeof updateEstimateItemSchema>;
export type ReorderItemsInput = z.infer<typeof reorderItemsSchema>;
export type BatchUpdateItemsInput = z.infer<typeof batchUpdateItemsSchema>;
export type DeleteEstimateItemInput = z.infer<typeof deleteEstimateItemSchema>;
export type MoveEstimateItemInput = z.infer<typeof moveEstimateItemSchema>;
export type TransferQuotationInput = z.infer<typeof transferQuotationSchema>;
export type CalculateNetInput = z.infer<typeof calculateNetSchema>;
export type ApplyProfitRateInput = z.infer<typeof applyProfitRateSchema>;
export type CalculateOverheadInput = z.infer<typeof calculateOverheadSchema>;
export type AddOverheadItemInput = z.infer<typeof addOverheadItemSchema>;
export type ExportEstimateQuery = z.infer<typeof exportEstimateQuerySchema>;
export type GetItemsQuery = z.infer<typeof getItemsQuerySchema>;
