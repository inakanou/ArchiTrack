/**
 * @fileoverview 数量表用バリデーションスキーマ
 *
 * Requirements:
 * - 2.1: 数量表一覧画面で新規作成操作を行う
 * - 2.2: 数量表名を入力して作成を確定する
 * - 2.3: プロジェクトに紐づく全ての数量表を作成日時順に一覧表示する
 * - 2.4: 数量表を選択して削除操作を行う
 * - 2.5: 数量表名を編集する
 * - 4.1: 数量表編集画面で数量グループ追加操作を行う
 * - 4.5: 数量グループの削除操作を行う
 * - 5.1: 数量グループ内で行追加操作を行う
 * - 5.2: 数量項目の各フィールドに値を入力する
 * - 5.3: 必須フィールド（工種・名称・単位・計算方法・調整係数・丸め設定・数量）が未入力で保存を試行する
 * - 5.4: 数量項目を選択して削除操作を行う
 * - 8.1: 計算方法列に「標準」をデフォルト値として設定する
 *
 * @module schemas/quantity-table
 */

import { z } from 'zod';

/**
 * バリデーションエラーメッセージ定数
 */
export const QUANTITY_TABLE_VALIDATION_MESSAGES = {
  // プロジェクトID
  PROJECT_ID_REQUIRED: 'プロジェクトIDは必須です',
  PROJECT_ID_INVALID_UUID: 'プロジェクトIDの形式が不正です',

  // 数量表ID
  TABLE_ID_REQUIRED: '数量表IDは必須です',
  TABLE_ID_INVALID_UUID: '数量表IDの形式が不正です',

  // 数量表名
  NAME_REQUIRED: '数量表名は必須です',
  NAME_TOO_LONG: '数量表名は200文字以内で入力してください',

  // 数量グループID
  GROUP_ID_REQUIRED: '数量グループIDは必須です',
  GROUP_ID_INVALID_UUID: '数量グループIDの形式が不正です',

  // グループ名
  GROUP_NAME_TOO_LONG: 'グループ名は200文字以内で入力してください',

  // 現場調査画像ID
  SURVEY_IMAGE_ID_INVALID_UUID: '現場調査画像IDの形式が不正です',

  // 数量項目ID
  ITEM_ID_REQUIRED: '数量項目IDは必須です',
  ITEM_ID_INVALID_UUID: '数量項目IDの形式が不正です',

  // 大項目
  MAJOR_CATEGORY_REQUIRED: '大項目は必須です',
  MAJOR_CATEGORY_TOO_LONG: '大項目は100文字以内で入力してください',

  // 中項目
  MIDDLE_CATEGORY_TOO_LONG: '中項目は100文字以内で入力してください',

  // 小項目
  MINOR_CATEGORY_TOO_LONG: '小項目は100文字以内で入力してください',

  // 任意分類
  CUSTOM_CATEGORY_TOO_LONG: '任意分類は100文字以内で入力してください',

  // 工種
  WORK_TYPE_REQUIRED: '工種は必須です',
  WORK_TYPE_TOO_LONG: '工種は100文字以内で入力してください',

  // 名称
  ITEM_NAME_REQUIRED: '名称は必須です',
  ITEM_NAME_TOO_LONG: '名称は200文字以内で入力してください',

  // 規格
  SPECIFICATION_TOO_LONG: '規格は500文字以内で入力してください',

  // 単位
  UNIT_REQUIRED: '単位は必須です',
  UNIT_TOO_LONG: '単位は50文字以内で入力してください',

  // 計算方法
  CALCULATION_METHOD_INVALID: '計算方法が不正です',

  // 調整係数
  ADJUSTMENT_FACTOR_INVALID: '調整係数は0より大きい数値を入力してください',

  // 丸め単位
  ROUNDING_UNIT_INVALID: '丸め単位は0より大きい数値を入力してください',

  // 数量
  QUANTITY_REQUIRED: '数量は必須です',
  QUANTITY_INVALID: '数量は0以上の数値を入力してください',

  // 表示順序
  DISPLAY_ORDER_INVALID: '表示順序は0以上の整数を入力してください',
} as const;

/**
 * UUIDバリデーション用正規表現
 */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * 計算方法の列挙
 */
export const CALCULATION_METHODS = ['STANDARD', 'AREA_VOLUME', 'PITCH'] as const;
export type CalculationMethodType = (typeof CALCULATION_METHODS)[number];

// ===== 数量表スキーマ =====

/**
 * 数量表作成用スキーマ
 *
 * Requirements:
 * - 2.1: 数量表一覧画面で新規作成操作を行う
 * - 2.2: 数量表名を入力して作成を確定する
 */
export const createQuantityTableSchema = z.object({
  projectId: z
    .string()
    .min(1, QUANTITY_TABLE_VALIDATION_MESSAGES.PROJECT_ID_REQUIRED)
    .regex(UUID_REGEX, QUANTITY_TABLE_VALIDATION_MESSAGES.PROJECT_ID_INVALID_UUID),

  name: z
    .string()
    .min(1, QUANTITY_TABLE_VALIDATION_MESSAGES.NAME_REQUIRED)
    .max(200, QUANTITY_TABLE_VALIDATION_MESSAGES.NAME_TOO_LONG)
    .refine((val) => val.trim().length > 0, {
      message: QUANTITY_TABLE_VALIDATION_MESSAGES.NAME_REQUIRED,
    }),
});

/**
 * 数量表作成入力の型
 */
export type CreateQuantityTableInput = z.infer<typeof createQuantityTableSchema>;

/**
 * 数量表更新用スキーマ
 *
 * Requirements:
 * - 2.5: 数量表名を編集する
 */
export const updateQuantityTableSchema = z.object({
  name: z
    .string()
    .min(1, QUANTITY_TABLE_VALIDATION_MESSAGES.NAME_REQUIRED)
    .max(200, QUANTITY_TABLE_VALIDATION_MESSAGES.NAME_TOO_LONG)
    .refine((val) => val.trim().length > 0, {
      message: QUANTITY_TABLE_VALIDATION_MESSAGES.NAME_REQUIRED,
    }),
});

/**
 * 数量表更新入力の型
 */
export type UpdateQuantityTableInput = z.infer<typeof updateQuantityTableSchema>;

/**
 * 数量表IDパラメータ用スキーマ
 */
export const quantityTableIdParamSchema = z.object({
  id: z
    .string()
    .min(1, QUANTITY_TABLE_VALIDATION_MESSAGES.TABLE_ID_REQUIRED)
    .regex(UUID_REGEX, QUANTITY_TABLE_VALIDATION_MESSAGES.TABLE_ID_INVALID_UUID),
});

/**
 * 数量表IDパラメータの型
 */
export type QuantityTableIdParam = z.infer<typeof quantityTableIdParamSchema>;

// ===== 数量グループスキーマ =====

/**
 * 数量グループ作成用スキーマ
 *
 * Requirements:
 * - 4.1: 数量表編集画面で数量グループ追加操作を行う
 * - 4.2: 数量グループが追加される場合、同一プロジェクトの注釈付き現場調査写真選択機能を提供する
 */
export const createQuantityGroupSchema = z.object({
  quantityTableId: z
    .string()
    .min(1, QUANTITY_TABLE_VALIDATION_MESSAGES.TABLE_ID_REQUIRED)
    .regex(UUID_REGEX, QUANTITY_TABLE_VALIDATION_MESSAGES.TABLE_ID_INVALID_UUID),

  surveyImageId: z
    .string()
    .regex(UUID_REGEX, QUANTITY_TABLE_VALIDATION_MESSAGES.SURVEY_IMAGE_ID_INVALID_UUID)
    .nullable()
    .optional(),

  name: z
    .string()
    .max(200, QUANTITY_TABLE_VALIDATION_MESSAGES.GROUP_NAME_TOO_LONG)
    .nullable()
    .optional(),

  displayOrder: z
    .number()
    .int()
    .min(0, QUANTITY_TABLE_VALIDATION_MESSAGES.DISPLAY_ORDER_INVALID)
    .default(0),
});

/**
 * 数量グループ作成入力の型
 */
export type CreateQuantityGroupInput = z.infer<typeof createQuantityGroupSchema>;

/**
 * 数量グループ更新用スキーマ
 */
export const updateQuantityGroupSchema = z.object({
  surveyImageId: z
    .string()
    .regex(UUID_REGEX, QUANTITY_TABLE_VALIDATION_MESSAGES.SURVEY_IMAGE_ID_INVALID_UUID)
    .nullable()
    .optional(),

  name: z
    .string()
    .max(200, QUANTITY_TABLE_VALIDATION_MESSAGES.GROUP_NAME_TOO_LONG)
    .nullable()
    .optional(),

  displayOrder: z
    .number()
    .int()
    .min(0, QUANTITY_TABLE_VALIDATION_MESSAGES.DISPLAY_ORDER_INVALID)
    .optional(),
});

/**
 * 数量グループ更新入力の型
 */
export type UpdateQuantityGroupInput = z.infer<typeof updateQuantityGroupSchema>;

/**
 * 数量グループIDパラメータ用スキーマ
 */
export const quantityGroupIdParamSchema = z.object({
  id: z
    .string()
    .min(1, QUANTITY_TABLE_VALIDATION_MESSAGES.GROUP_ID_REQUIRED)
    .regex(UUID_REGEX, QUANTITY_TABLE_VALIDATION_MESSAGES.GROUP_ID_INVALID_UUID),
});

/**
 * 数量グループIDパラメータの型
 */
export type QuantityGroupIdParam = z.infer<typeof quantityGroupIdParamSchema>;

// ===== 数量項目スキーマ =====

/**
 * 面積・体積計算パラメータスキーマ
 *
 * Requirements: 8.5, 8.6
 */
export const areaVolumeParamsSchema = z.object({
  width: z.number().positive().optional(),
  depth: z.number().positive().optional(),
  height: z.number().positive().optional(),
  weight: z.number().positive().optional(),
});

/**
 * ピッチ計算パラメータスキーマ
 *
 * Requirements: 8.8, 8.9
 */
export const pitchParamsSchema = z.object({
  rangeLength: z.number().positive(),
  endLength1: z.number().nonnegative(),
  endLength2: z.number().nonnegative(),
  pitchLength: z.number().positive(),
  length: z.number().positive().optional(),
  weight: z.number().positive().optional(),
});

/**
 * 計算パラメータスキーマ（共用体）
 */
export const calculationParamsSchema = z.union([
  areaVolumeParamsSchema,
  pitchParamsSchema,
  z.null(),
]);

/**
 * 数量項目作成用スキーマ
 *
 * Requirements:
 * - 5.1: 数量グループ内で行追加操作を行う
 * - 5.2: 数量項目の各フィールドに値を入力する
 * - 5.3: 必須フィールド（工種・名称・単位・計算方法・調整係数・丸め設定・数量）が未入力で保存を試行する
 * - 8.1: 計算方法列に「標準」をデフォルト値として設定する
 */
export const createQuantityItemSchema = z.object({
  quantityGroupId: z
    .string()
    .min(1, QUANTITY_TABLE_VALIDATION_MESSAGES.GROUP_ID_REQUIRED)
    .regex(UUID_REGEX, QUANTITY_TABLE_VALIDATION_MESSAGES.GROUP_ID_INVALID_UUID),

  majorCategory: z
    .string()
    .max(100, QUANTITY_TABLE_VALIDATION_MESSAGES.MAJOR_CATEGORY_TOO_LONG)
    .nullable()
    .optional(),

  middleCategory: z
    .string()
    .max(100, QUANTITY_TABLE_VALIDATION_MESSAGES.MIDDLE_CATEGORY_TOO_LONG)
    .nullable()
    .optional(),

  minorCategory: z
    .string()
    .max(100, QUANTITY_TABLE_VALIDATION_MESSAGES.MINOR_CATEGORY_TOO_LONG)
    .nullable()
    .optional(),

  customCategory: z
    .string()
    .max(100, QUANTITY_TABLE_VALIDATION_MESSAGES.CUSTOM_CATEGORY_TOO_LONG)
    .nullable()
    .optional(),

  workType: z.string().max(100, QUANTITY_TABLE_VALIDATION_MESSAGES.WORK_TYPE_TOO_LONG),

  name: z.string().max(200, QUANTITY_TABLE_VALIDATION_MESSAGES.ITEM_NAME_TOO_LONG),

  specification: z
    .string()
    .max(500, QUANTITY_TABLE_VALIDATION_MESSAGES.SPECIFICATION_TOO_LONG)
    .nullable()
    .optional(),

  unit: z.string().max(50, QUANTITY_TABLE_VALIDATION_MESSAGES.UNIT_TOO_LONG),

  calculationMethod: z.enum(CALCULATION_METHODS).default('STANDARD'),

  calculationParams: calculationParamsSchema.nullable().optional(),

  adjustmentFactor: z
    .number()
    .positive(QUANTITY_TABLE_VALIDATION_MESSAGES.ADJUSTMENT_FACTOR_INVALID)
    .default(1.0),

  roundingUnit: z
    .number()
    .positive(QUANTITY_TABLE_VALIDATION_MESSAGES.ROUNDING_UNIT_INVALID)
    .default(0.01),

  quantity: z.number().nonnegative(QUANTITY_TABLE_VALIDATION_MESSAGES.QUANTITY_INVALID),

  remarks: z.string().nullable().optional(),

  displayOrder: z
    .number()
    .int()
    .min(0, QUANTITY_TABLE_VALIDATION_MESSAGES.DISPLAY_ORDER_INVALID)
    .default(0),
});

/**
 * 数量項目作成入力の型
 */
export type CreateQuantityItemInput = z.infer<typeof createQuantityItemSchema>;

/**
 * 数量項目更新用スキーマ
 */
export const updateQuantityItemSchema = z.object({
  majorCategory: z
    .string()
    .max(100, QUANTITY_TABLE_VALIDATION_MESSAGES.MAJOR_CATEGORY_TOO_LONG)
    .nullable()
    .optional(),

  middleCategory: z
    .string()
    .max(100, QUANTITY_TABLE_VALIDATION_MESSAGES.MIDDLE_CATEGORY_TOO_LONG)
    .nullable()
    .optional(),

  minorCategory: z
    .string()
    .max(100, QUANTITY_TABLE_VALIDATION_MESSAGES.MINOR_CATEGORY_TOO_LONG)
    .nullable()
    .optional(),

  customCategory: z
    .string()
    .max(100, QUANTITY_TABLE_VALIDATION_MESSAGES.CUSTOM_CATEGORY_TOO_LONG)
    .nullable()
    .optional(),

  workType: z
    .string()
    .min(1, QUANTITY_TABLE_VALIDATION_MESSAGES.WORK_TYPE_REQUIRED)
    .max(100, QUANTITY_TABLE_VALIDATION_MESSAGES.WORK_TYPE_TOO_LONG)
    .refine((val) => val.trim().length > 0, {
      message: QUANTITY_TABLE_VALIDATION_MESSAGES.WORK_TYPE_REQUIRED,
    })
    .optional(),

  name: z
    .string()
    .min(1, QUANTITY_TABLE_VALIDATION_MESSAGES.ITEM_NAME_REQUIRED)
    .max(200, QUANTITY_TABLE_VALIDATION_MESSAGES.ITEM_NAME_TOO_LONG)
    .refine((val) => val.trim().length > 0, {
      message: QUANTITY_TABLE_VALIDATION_MESSAGES.ITEM_NAME_REQUIRED,
    })
    .optional(),

  specification: z
    .string()
    .max(500, QUANTITY_TABLE_VALIDATION_MESSAGES.SPECIFICATION_TOO_LONG)
    .nullable()
    .optional(),

  unit: z
    .string()
    .min(1, QUANTITY_TABLE_VALIDATION_MESSAGES.UNIT_REQUIRED)
    .max(50, QUANTITY_TABLE_VALIDATION_MESSAGES.UNIT_TOO_LONG)
    .refine((val) => val.trim().length > 0, {
      message: QUANTITY_TABLE_VALIDATION_MESSAGES.UNIT_REQUIRED,
    })
    .optional(),

  calculationMethod: z.enum(CALCULATION_METHODS).optional(),

  calculationParams: calculationParamsSchema.nullable().optional(),

  adjustmentFactor: z
    .number()
    .positive(QUANTITY_TABLE_VALIDATION_MESSAGES.ADJUSTMENT_FACTOR_INVALID)
    .optional(),

  roundingUnit: z
    .number()
    .positive(QUANTITY_TABLE_VALIDATION_MESSAGES.ROUNDING_UNIT_INVALID)
    .optional(),

  quantity: z.number().nonnegative(QUANTITY_TABLE_VALIDATION_MESSAGES.QUANTITY_INVALID).optional(),

  remarks: z.string().nullable().optional(),

  displayOrder: z
    .number()
    .int()
    .min(0, QUANTITY_TABLE_VALIDATION_MESSAGES.DISPLAY_ORDER_INVALID)
    .optional(),
});

/**
 * 数量項目更新入力の型
 */
export type UpdateQuantityItemInput = z.infer<typeof updateQuantityItemSchema>;

/**
 * 数量項目IDパラメータ用スキーマ
 */
export const quantityItemIdParamSchema = z.object({
  id: z
    .string()
    .min(1, QUANTITY_TABLE_VALIDATION_MESSAGES.ITEM_ID_REQUIRED)
    .regex(UUID_REGEX, QUANTITY_TABLE_VALIDATION_MESSAGES.ITEM_ID_INVALID_UUID),
});

/**
 * 数量項目IDパラメータの型
 */
export type QuantityItemIdParam = z.infer<typeof quantityItemIdParamSchema>;

// ===== プロジェクトIDパラメータ =====

/**
 * プロジェクトIDパラメータ用スキーマ（一覧取得用）
 */
export const projectIdParamSchema = z.object({
  projectId: z
    .string()
    .min(1, QUANTITY_TABLE_VALIDATION_MESSAGES.PROJECT_ID_REQUIRED)
    .regex(UUID_REGEX, QUANTITY_TABLE_VALIDATION_MESSAGES.PROJECT_ID_INVALID_UUID),
});

/**
 * プロジェクトIDパラメータの型
 */
export type ProjectIdParam = z.infer<typeof projectIdParamSchema>;
