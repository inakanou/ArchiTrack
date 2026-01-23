/**
 * @fileoverview 見積依頼バリデーションスキーマ
 *
 * Requirements:
 * - 3.7: バリデーションエラー表示
 * - 4.8: 見積依頼方法のラジオボタン（メール/FAX）
 *
 * Task 3.1: Zodバリデーションスキーマの定義
 *
 * @module schemas/estimate-request
 */

import { z } from 'zod';

/**
 * 見積依頼方法のEnum型
 * Requirements: 4.8
 */
export const ESTIMATE_REQUEST_METHODS = ['EMAIL', 'FAX'] as const;
export type EstimateRequestMethod = (typeof ESTIMATE_REQUEST_METHODS)[number];

/**
 * バリデーションエラーメッセージ定数
 * 日本語メッセージを定義
 */
export const ESTIMATE_REQUEST_VALIDATION_MESSAGES = {
  // 見積依頼名
  NAME_REQUIRED: '見積依頼名は必須です',
  NAME_TOO_LONG: '見積依頼名は200文字以内で入力してください',

  // 取引先ID
  TRADING_PARTNER_ID_REQUIRED: '取引先IDは必須です',
  TRADING_PARTNER_ID_INVALID_UUID: '取引先IDの形式が不正です',

  // 内訳書ID
  ITEMIZED_STATEMENT_ID_REQUIRED: '内訳書IDは必須です',
  ITEMIZED_STATEMENT_ID_INVALID_UUID: '内訳書IDの形式が不正です',

  // 見積依頼方法
  METHOD_INVALID: '無効な見積依頼方法です',

  // 見積依頼ID
  ID_REQUIRED: '見積依頼IDは必須です',
  ID_INVALID_UUID: '見積依頼IDの形式が不正です',

  // 項目選択
  ITEMS_REQUIRED: '更新する項目を1つ以上指定してください',
  ITEM_ID_INVALID_UUID: '項目IDの形式が不正です',

  // 日時
  DATETIME_INVALID: '日時の形式が不正です',

  // ページネーション
  PAGE_MIN: 'ページ番号は1以上である必要があります',
  LIMIT_MIN: '表示件数は1以上である必要があります',
  LIMIT_MAX: '表示件数は100以下である必要があります',
} as const;

/**
 * UUIDバリデーション用正規表現
 */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * 見積依頼作成スキーマ
 *
 * Requirements: 3.6, 3.7
 */
export const createEstimateRequestSchema = z.object({
  name: z
    .string()
    .min(1, ESTIMATE_REQUEST_VALIDATION_MESSAGES.NAME_REQUIRED)
    .max(200, ESTIMATE_REQUEST_VALIDATION_MESSAGES.NAME_TOO_LONG)
    .refine((val) => val.trim().length > 0, {
      message: ESTIMATE_REQUEST_VALIDATION_MESSAGES.NAME_REQUIRED,
    }),

  tradingPartnerId: z
    .string()
    .min(1, ESTIMATE_REQUEST_VALIDATION_MESSAGES.TRADING_PARTNER_ID_REQUIRED)
    .regex(UUID_REGEX, ESTIMATE_REQUEST_VALIDATION_MESSAGES.TRADING_PARTNER_ID_INVALID_UUID),

  itemizedStatementId: z
    .string()
    .min(1, ESTIMATE_REQUEST_VALIDATION_MESSAGES.ITEMIZED_STATEMENT_ID_REQUIRED)
    .regex(UUID_REGEX, ESTIMATE_REQUEST_VALIDATION_MESSAGES.ITEMIZED_STATEMENT_ID_INVALID_UUID),

  method: z
    .enum(ESTIMATE_REQUEST_METHODS, ESTIMATE_REQUEST_VALIDATION_MESSAGES.METHOD_INVALID)
    .default('EMAIL'),

  includeBreakdownInBody: z.boolean().default(false),
});

/**
 * 見積依頼作成入力型
 */
export type CreateEstimateRequestInput = z.infer<typeof createEstimateRequestSchema>;

/**
 * 見積依頼更新スキーマ
 * expectedUpdatedAtは楽観的排他制御用
 *
 * Requirements: 8.5, 9.6
 */
export const updateEstimateRequestSchema = z.object({
  name: z
    .string()
    .min(1, ESTIMATE_REQUEST_VALIDATION_MESSAGES.NAME_REQUIRED)
    .max(200, ESTIMATE_REQUEST_VALIDATION_MESSAGES.NAME_TOO_LONG)
    .refine((val) => val.trim().length > 0, {
      message: ESTIMATE_REQUEST_VALIDATION_MESSAGES.NAME_REQUIRED,
    })
    .optional(),

  method: z
    .enum(ESTIMATE_REQUEST_METHODS, ESTIMATE_REQUEST_VALIDATION_MESSAGES.METHOD_INVALID)
    .optional(),

  includeBreakdownInBody: z.boolean().optional(),

  expectedUpdatedAt: z.string().datetime({ message: ESTIMATE_REQUEST_VALIDATION_MESSAGES.DATETIME_INVALID }),
});

/**
 * 見積依頼更新入力型
 */
export type UpdateEstimateRequestInput = z.infer<typeof updateEstimateRequestSchema>;

/**
 * 項目選択更新スキーマ
 *
 * Requirements: 4.4, 4.5
 */
export const updateItemSelectionSchema = z.object({
  items: z
    .array(
      z.object({
        itemId: z.string().regex(UUID_REGEX, ESTIMATE_REQUEST_VALIDATION_MESSAGES.ITEM_ID_INVALID_UUID),
        selected: z.boolean(),
      })
    )
    .min(1, ESTIMATE_REQUEST_VALIDATION_MESSAGES.ITEMS_REQUIRED),
});

/**
 * 項目選択更新入力型
 */
export type UpdateItemSelectionInput = z.infer<typeof updateItemSelectionSchema>;

/**
 * 見積依頼IDパラメータスキーマ
 */
export const estimateRequestIdParamSchema = z.object({
  id: z
    .string()
    .min(1, ESTIMATE_REQUEST_VALIDATION_MESSAGES.ID_REQUIRED)
    .regex(UUID_REGEX, ESTIMATE_REQUEST_VALIDATION_MESSAGES.ID_INVALID_UUID),
});

/**
 * 見積依頼IDパラメータ型
 */
export type EstimateRequestIdParam = z.infer<typeof estimateRequestIdParamSchema>;

/**
 * プロジェクトIDパラメータスキーマ（ネストルート用）
 */
export const projectIdParamSchema = z.object({
  projectId: z.string().regex(UUID_REGEX, '無効なプロジェクトID形式です'),
});

/**
 * プロジェクトIDパラメータ型
 */
export type ProjectIdParam = z.infer<typeof projectIdParamSchema>;

/**
 * ページネーションスキーマ
 */
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1, ESTIMATE_REQUEST_VALIDATION_MESSAGES.PAGE_MIN).default(1),
  limit: z.coerce
    .number()
    .int()
    .min(1, ESTIMATE_REQUEST_VALIDATION_MESSAGES.LIMIT_MIN)
    .max(100, ESTIMATE_REQUEST_VALIDATION_MESSAGES.LIMIT_MAX)
    .default(20),
});

/**
 * 見積依頼一覧取得クエリスキーマ
 */
export const estimateRequestListQuerySchema = paginationSchema;

/**
 * 見積依頼一覧取得クエリ型
 */
export type EstimateRequestListQuery = z.infer<typeof estimateRequestListQuerySchema>;

/**
 * 削除リクエストボディスキーマ（楽観的排他制御用）
 */
export const deleteEstimateRequestBodySchema = z.object({
  updatedAt: z.string().datetime({ message: ESTIMATE_REQUEST_VALIDATION_MESSAGES.DATETIME_INVALID }),
});

/**
 * 削除リクエストボディ型
 */
export type DeleteEstimateRequestBody = z.infer<typeof deleteEstimateRequestBodySchema>;
