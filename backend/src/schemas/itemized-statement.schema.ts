/**
 * @fileoverview 内訳書用バリデーションスキーマ
 *
 * Requirements:
 * - 1.4: 数量表が選択されていない状態で作成を試行する場合エラー
 * - 1.6: 内訳書名が未入力の状態で作成を試行する場合エラー
 * - 1.7: 内訳書名フィールドは最大200文字の入力制限を適用する
 * - 10.2: 内訳書はupdatedAtフィールドを持つ
 * - 10.3: 削除リクエストを受信する場合、リクエストのupdatedAtと現在値を比較する
 *
 * Task 3.1: 内訳書APIエンドポイントの実装
 * Task 3.2: エラーハンドリングの実装
 *
 * @module schemas/itemized-statement
 */

import { z } from 'zod';

/**
 * バリデーションエラーメッセージ定数
 */
export const ITEMIZED_STATEMENT_VALIDATION_MESSAGES = {
  // プロジェクトID
  PROJECT_ID_REQUIRED: 'プロジェクトIDは必須です',
  PROJECT_ID_INVALID_UUID: 'プロジェクトIDの形式が不正です',

  // 内訳書ID
  STATEMENT_ID_REQUIRED: '内訳書IDは必須です',
  STATEMENT_ID_INVALID_UUID: '内訳書IDの形式が不正です',

  // 内訳書名
  NAME_REQUIRED: '内訳書名を入力してください',
  NAME_TOO_LONG: '内訳書名は200文字以内で入力してください',

  // 数量表ID
  QUANTITY_TABLE_ID_REQUIRED: '数量表を選択してください',
  QUANTITY_TABLE_ID_INVALID_UUID: '数量表IDの形式が不正です',

  // updatedAt（楽観的排他制御用）
  UPDATED_AT_REQUIRED: '更新日時は必須です',
  UPDATED_AT_INVALID_FORMAT: '更新日時の形式が不正です',
} as const;

/**
 * UUIDバリデーション用正規表現
 */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// ===== 内訳書スキーマ =====

/**
 * 内訳書作成用スキーマ
 *
 * Requirements:
 * - 1.4: 数量表が選択されていない場合エラー
 * - 1.6: 内訳書名が未入力の場合エラー
 * - 1.7: 内訳書名は最大200文字
 */
export const createItemizedStatementSchema = z.object({
  name: z
    .string()
    .min(1, ITEMIZED_STATEMENT_VALIDATION_MESSAGES.NAME_REQUIRED)
    .max(200, ITEMIZED_STATEMENT_VALIDATION_MESSAGES.NAME_TOO_LONG)
    .refine((val) => val.trim().length > 0, {
      message: ITEMIZED_STATEMENT_VALIDATION_MESSAGES.NAME_REQUIRED,
    }),

  quantityTableId: z
    .string()
    .min(1, ITEMIZED_STATEMENT_VALIDATION_MESSAGES.QUANTITY_TABLE_ID_REQUIRED)
    .regex(UUID_REGEX, ITEMIZED_STATEMENT_VALIDATION_MESSAGES.QUANTITY_TABLE_ID_INVALID_UUID),
});

/**
 * 内訳書作成入力の型
 */
export type CreateItemizedStatementRequestInput = z.infer<typeof createItemizedStatementSchema>;

/**
 * 内訳書IDパラメータ用スキーマ
 */
export const itemizedStatementIdParamSchema = z.object({
  id: z
    .string()
    .min(1, ITEMIZED_STATEMENT_VALIDATION_MESSAGES.STATEMENT_ID_REQUIRED)
    .regex(UUID_REGEX, ITEMIZED_STATEMENT_VALIDATION_MESSAGES.STATEMENT_ID_INVALID_UUID),
});

/**
 * 内訳書IDパラメータの型
 */
export type ItemizedStatementIdParam = z.infer<typeof itemizedStatementIdParamSchema>;

/**
 * プロジェクトIDパラメータ用スキーマ
 */
export const projectIdParamSchema = z.object({
  projectId: z
    .string()
    .min(1, ITEMIZED_STATEMENT_VALIDATION_MESSAGES.PROJECT_ID_REQUIRED)
    .regex(UUID_REGEX, ITEMIZED_STATEMENT_VALIDATION_MESSAGES.PROJECT_ID_INVALID_UUID),
});

/**
 * プロジェクトIDパラメータの型
 */
export type ProjectIdParam = z.infer<typeof projectIdParamSchema>;

/**
 * 内訳書一覧取得クエリスキーマ
 */
export const itemizedStatementListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
  sort: z.enum(['createdAt', 'name']).default('createdAt'),
  order: z.enum(['asc', 'desc']).default('desc'),
});

/**
 * 内訳書一覧取得クエリの型
 */
export type ItemizedStatementListQuery = z.infer<typeof itemizedStatementListQuerySchema>;

/**
 * 直近N件取得のクエリパラメータスキーマ
 */
export const latestSummaryQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(10).default(2),
});

/**
 * 直近N件取得のクエリパラメータの型
 */
export type LatestSummaryQuery = z.infer<typeof latestSummaryQuerySchema>;

/**
 * 内訳書削除リクエストボディスキーマ
 *
 * Requirements:
 * - 10.2: 内訳書はupdatedAtフィールドを持つ
 * - 10.3: 削除リクエストを受信する場合、リクエストのupdatedAtと現在値を比較する
 */
export const deleteItemizedStatementBodySchema = z.object({
  updatedAt: z
    .string()
    .min(1, ITEMIZED_STATEMENT_VALIDATION_MESSAGES.UPDATED_AT_REQUIRED)
    .datetime({ message: ITEMIZED_STATEMENT_VALIDATION_MESSAGES.UPDATED_AT_INVALID_FORMAT }),
});

/**
 * 内訳書削除リクエストボディの型
 */
export type DeleteItemizedStatementBody = z.infer<typeof deleteItemizedStatementBodySchema>;
