/**
 * @fileoverview 工事看板用バリデーションスキーマ（境界での fail fast）
 *
 * 既存の site-survey スキーマ規約（zod・メッセージ定数・UUID_REGEX・z.infer）に準拠。
 *
 * Requirements:
 * - 8.2: 標準項目「工事件名」「工事場所」（ラベルと値）を保持
 * - 8.3: ラベルと値の組からなる任意数の自由項目行を保持
 * - 8.4: 下部記入欄の固定テキスト（複数行を許容）を保持
 *
 * 長さ制限の設計判断（design はこれらの数値を明示していないため要件趣旨から決定）:
 * - workName/workLocation 各200文字: site-survey の `name` 上限=200 と整合。
 * - freeItems 最大20行: 電子小黒板（工事黒板）の限られた記入領域に写真上で
 *   可読描画できる現実的な行数の上限。過大な行数入力による描画破綻・DoS を防ぐ。
 * - freeItem label 50 / value 200: label は短い見出し（例「天候」「施工者」）、
 *   value は標準項目の値と同じ 200 に揃える。
 * - footerText 2000文字: 複数行の状況・摘要。site-survey の `memo`/コメント=2000 と整合。
 *
 * @module schemas/construction-signboard
 */

import { z } from 'zod';
import type { SignboardFreeItem } from '../types/construction-photo.types.js';

/**
 * UUIDバリデーション用正規表現（既存スキーマと同一）
 */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// ============================================================================
// 制約定数（設計判断: 上記 @fileoverview 参照）
// ============================================================================

/** 工事件名の最大長 */
export const SIGNBOARD_WORK_NAME_MAX_LENGTH = 200;
/** 工事場所の最大長 */
export const SIGNBOARD_WORK_LOCATION_MAX_LENGTH = 200;
/** 自由項目ラベルの最大長 */
export const SIGNBOARD_FREE_ITEM_LABEL_MAX_LENGTH = 50;
/** 自由項目値の最大長 */
export const SIGNBOARD_FREE_ITEM_VALUE_MAX_LENGTH = 200;
/** 自由項目の最大行数 */
export const SIGNBOARD_FREE_ITEMS_MAX = 20;
/** 下部記入欄固定テキストの最大長 */
export const SIGNBOARD_FOOTER_TEXT_MAX_LENGTH = 2000;

/**
 * バリデーションエラーメッセージ定数
 */
export const CONSTRUCTION_SIGNBOARD_VALIDATION_MESSAGES = {
  // 工事件名
  WORK_NAME_REQUIRED: '工事件名は必須です',
  WORK_NAME_TOO_LONG: `工事件名は${SIGNBOARD_WORK_NAME_MAX_LENGTH}文字以内で入力してください`,
  // 工事場所
  WORK_LOCATION_REQUIRED: '工事場所は必須です',
  WORK_LOCATION_TOO_LONG: `工事場所は${SIGNBOARD_WORK_LOCATION_MAX_LENGTH}文字以内で入力してください`,
  // 自由項目
  FREE_ITEM_LABEL_REQUIRED: '自由項目のラベルは必須です',
  FREE_ITEM_LABEL_TOO_LONG: `自由項目のラベルは${SIGNBOARD_FREE_ITEM_LABEL_MAX_LENGTH}文字以内で入力してください`,
  FREE_ITEM_VALUE_TOO_LONG: `自由項目の値は${SIGNBOARD_FREE_ITEM_VALUE_MAX_LENGTH}文字以内で入力してください`,
  FREE_ITEMS_TOO_MANY: `自由項目は${SIGNBOARD_FREE_ITEMS_MAX}行以内で入力してください`,
  // 固定テキスト
  FOOTER_TEXT_TOO_LONG: `記入欄テキストは${SIGNBOARD_FOOTER_TEXT_MAX_LENGTH}文字以内で入力してください`,
  // 楽観排他
  UPDATED_AT_REQUIRED: '更新日時（updatedAt）は必須です',
  UPDATED_AT_INVALID: '更新日時の形式が不正です',
  // ID
  ID_REQUIRED: '工事看板IDは必須です',
  ID_INVALID_UUID: '工事看板IDの形式が不正です',
  PROJECT_ID_REQUIRED: 'プロジェクトIDは必須です',
  PROJECT_ID_INVALID_UUID: 'プロジェクトIDの形式が不正です',
} as const;

// ============================================================================
// 自由項目スキーマ
// ============================================================================

/**
 * 自由項目（ラベルと値の組）スキーマ
 * Requirements: 8.3
 */
export const signboardFreeItemSchema: z.ZodType<SignboardFreeItem> = z.object({
  label: z
    .string()
    .min(1, CONSTRUCTION_SIGNBOARD_VALIDATION_MESSAGES.FREE_ITEM_LABEL_REQUIRED)
    .max(
      SIGNBOARD_FREE_ITEM_LABEL_MAX_LENGTH,
      CONSTRUCTION_SIGNBOARD_VALIDATION_MESSAGES.FREE_ITEM_LABEL_TOO_LONG
    ),
  value: z
    .string()
    .max(
      SIGNBOARD_FREE_ITEM_VALUE_MAX_LENGTH,
      CONSTRUCTION_SIGNBOARD_VALIDATION_MESSAGES.FREE_ITEM_VALUE_TOO_LONG
    ),
});

const freeItemsSchema = z
  .array(signboardFreeItemSchema)
  .max(SIGNBOARD_FREE_ITEMS_MAX, CONSTRUCTION_SIGNBOARD_VALIDATION_MESSAGES.FREE_ITEMS_TOO_MANY);

const footerTextSchema = z
  .string()
  .max(
    SIGNBOARD_FOOTER_TEXT_MAX_LENGTH,
    CONSTRUCTION_SIGNBOARD_VALIDATION_MESSAGES.FOOTER_TEXT_TOO_LONG
  )
  .nullable()
  .optional();

const workNameSchema = z
  .string()
  .min(1, CONSTRUCTION_SIGNBOARD_VALIDATION_MESSAGES.WORK_NAME_REQUIRED)
  .max(
    SIGNBOARD_WORK_NAME_MAX_LENGTH,
    CONSTRUCTION_SIGNBOARD_VALIDATION_MESSAGES.WORK_NAME_TOO_LONG
  );

const workLocationSchema = z
  .string()
  .min(1, CONSTRUCTION_SIGNBOARD_VALIDATION_MESSAGES.WORK_LOCATION_REQUIRED)
  .max(
    SIGNBOARD_WORK_LOCATION_MAX_LENGTH,
    CONSTRUCTION_SIGNBOARD_VALIDATION_MESSAGES.WORK_LOCATION_TOO_LONG
  );

const updatedAtSchema = z
  .string({ message: CONSTRUCTION_SIGNBOARD_VALIDATION_MESSAGES.UPDATED_AT_REQUIRED })
  .datetime({ message: CONSTRUCTION_SIGNBOARD_VALIDATION_MESSAGES.UPDATED_AT_INVALID });

// ============================================================================
// 看板 CRUD
// ============================================================================

/**
 * 看板作成スキーマ（freeItems 既定 []）
 * Requirements: 8.1, 8.2, 8.3, 8.4
 */
export const createConstructionSignboardSchema = z.object({
  workName: workNameSchema,
  workLocation: workLocationSchema,
  freeItems: freeItemsSchema.default([]),
  footerText: footerTextSchema,
});
export type CreateConstructionSignboardInput = z.infer<typeof createConstructionSignboardSchema>;

/**
 * 看板更新スキーマ（楽観排他 updatedAt 必須、各項目は任意）
 * Requirements: 8.6
 */
export const updateConstructionSignboardSchema = z.object({
  workName: workNameSchema.optional(),
  workLocation: workLocationSchema.optional(),
  freeItems: freeItemsSchema.optional(),
  footerText: footerTextSchema,
  updatedAt: updatedAtSchema,
});
export type UpdateConstructionSignboardInput = z.infer<typeof updateConstructionSignboardSchema>;

// ============================================================================
// パラメータスキーマ
// ============================================================================

export const constructionSignboardIdParamSchema = z.object({
  id: z
    .string()
    .min(1, CONSTRUCTION_SIGNBOARD_VALIDATION_MESSAGES.ID_REQUIRED)
    .regex(UUID_REGEX, CONSTRUCTION_SIGNBOARD_VALIDATION_MESSAGES.ID_INVALID_UUID),
});
export type ConstructionSignboardIdParam = z.infer<typeof constructionSignboardIdParamSchema>;

export const constructionSignboardProjectIdParamSchema = z.object({
  projectId: z
    .string()
    .min(1, CONSTRUCTION_SIGNBOARD_VALIDATION_MESSAGES.PROJECT_ID_REQUIRED)
    .regex(UUID_REGEX, CONSTRUCTION_SIGNBOARD_VALIDATION_MESSAGES.PROJECT_ID_INVALID_UUID),
});
export type ConstructionSignboardProjectIdParam = z.infer<
  typeof constructionSignboardProjectIdParamSchema
>;
