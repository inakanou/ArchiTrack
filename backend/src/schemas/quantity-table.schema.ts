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
 * - 47.8: 「箇所数」フィールドを必須項目とし、入力可能範囲を1〜9999999の整数とする
 * - 47.15: 計算方法が「箇所数」の数量項目を保存・再読み込みしても各値が完全復元される
 * - 48.3-48.6: 計算パラメータの検証を計算方法（判別子）に対応する規則で行い、
 *   パラメータの形状から計算方法を推測しない。指定された計算方法で使用しないキーは破棄する
 *
 * @module schemas/quantity-table
 */

import { z } from 'zod';

// 箇所数の入力可能範囲（REQ-47 AC8, AC11）の唯一の定義元は calculation-engine.ts。
// 範囲の二重定義を避けるため、ここでは再定義せず import して参照する
// （calculation-engine.ts は decimal.js のみに依存するため循環参照は生じない）。
import { COUNT_MAX, COUNT_MIN } from '../services/calculation-engine.js';

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

  // 箇所数（REQ-47）
  COUNT_REQUIRED: '箇所数は必須です',
  COUNT_NOT_INTEGER: '箇所数は整数で入力してください',
  COUNT_OUT_OF_RANGE: `箇所数は${COUNT_MIN}〜${COUNT_MAX}の範囲で入力してください`,

  // ピッチ（文言は QuantityValidationService.validatePitchMode と一致させること）
  RANGE_LENGTH_REQUIRED: '範囲長は必須です',
  END_LENGTH1_REQUIRED: '端長1は必須です',
  END_LENGTH2_REQUIRED: '端長2は必須です',
  PITCH_LENGTH_REQUIRED: 'ピッチ長は必須です',

  // 計算パラメータ（REQ-48）
  CALCULATION_PARAMS_REQUIRED: '選択された計算方法に対応する計算パラメータを入力してください',
  CALCULATION_METHOD_REQUIRED_FOR_PARAMS:
    '計算パラメータを指定する場合は計算方法も指定してください',
} as const;

/**
 * UUIDバリデーション用正規表現
 */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * 計算方法の列挙
 */
export const CALCULATION_METHODS = ['STANDARD', 'AREA_VOLUME', 'PITCH', 'COUNT'] as const;
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
 * 数量表コピー用スキーマ
 *
 * Requirements:
 * - 17.2: コピーダイアログで数量表名を入力して作成を確定する
 */
export const copyQuantityTableSchema = z.object({
  name: z
    .string()
    .min(1, QUANTITY_TABLE_VALIDATION_MESSAGES.NAME_REQUIRED)
    .max(200, QUANTITY_TABLE_VALIDATION_MESSAGES.NAME_TOO_LONG)
    .refine((val) => val.trim().length > 0, {
      message: QUANTITY_TABLE_VALIDATION_MESSAGES.NAME_REQUIRED,
    }),
});

/**
 * 数量表コピー入力の型
 */
export type CopyQuantityTableInput = z.infer<typeof copyQuantityTableSchema>;

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
  rangeLength: z
    .number({ error: QUANTITY_TABLE_VALIDATION_MESSAGES.RANGE_LENGTH_REQUIRED })
    .positive(),
  endLength1: z
    .number({ error: QUANTITY_TABLE_VALIDATION_MESSAGES.END_LENGTH1_REQUIRED })
    .nonnegative(),
  endLength2: z
    .number({ error: QUANTITY_TABLE_VALIDATION_MESSAGES.END_LENGTH2_REQUIRED })
    .nonnegative(),
  pitchLength: z
    .number({ error: QUANTITY_TABLE_VALIDATION_MESSAGES.PITCH_LENGTH_REQUIRED })
    .positive(),
  length: z.number().positive().optional(),
  weight: z.number().positive().optional(),
});

/**
 * 箇所数計算パラメータスキーマ（REQ-47）
 *
 * 箇所数（count）は必須・整数・1〜9999999（範囲は calculation-engine.ts が単一情報源）。
 * 長さ（length）・重量（weight）は任意で、ピッチ計算と同一仕様の乗算に用いる。
 *
 * Requirements: 47.8, 47.10, 47.11
 */
export const countParamsSchema = z.object({
  count: z
    .number({ error: QUANTITY_TABLE_VALIDATION_MESSAGES.COUNT_REQUIRED })
    .int(QUANTITY_TABLE_VALIDATION_MESSAGES.COUNT_NOT_INTEGER)
    .min(COUNT_MIN, QUANTITY_TABLE_VALIDATION_MESSAGES.COUNT_OUT_OF_RANGE)
    .max(COUNT_MAX, QUANTITY_TABLE_VALIDATION_MESSAGES.COUNT_OUT_OF_RANGE),
  length: z.number().positive().optional(),
  weight: z.number().positive().optional(),
});

/**
 * 標準計算パラメータスキーマ（REQ-48）
 *
 * 計算方法「標準」は計算パラメータを持たない。空オブジェクト（または未指定）のみを
 * 意味のある入力として扱い、他の計算方法のキーが残留していても zod の既定の strip 挙動で
 * 破棄する（REQ-48 AC6）。
 */
export const standardParamsSchema = z.object({});

/**
 * 計算方法ごとの計算パラメータスキーマ対応表（REQ-48 AC5）
 *
 * 計算パラメータの検証は「パラメータの形状から計算方法を推測する」のではなく、
 * 数量項目に設定された計算方法（判別子）に対応するスキーマを引いて行う。
 * `Record<CalculationMethodType, ...>` としているため、`CALCULATION_METHODS` に
 * 計算方法を追加した際にここへの追加漏れは型エラーになる。
 */
export const PARAMS_SCHEMA_BY_METHOD: Record<CalculationMethodType, z.ZodType> = {
  STANDARD: standardParamsSchema,
  AREA_VOLUME: areaVolumeParamsSchema,
  PITCH: pitchParamsSchema,
  COUNT: countParamsSchema,
};

/**
 * 数量項目スキーマのうち、計算パラメータの判別に必要な最小形状
 *
 * `calculationParams` を単体で見ても計算方法は判別できないため、
 * `z.discriminatedUnion` ではなく数量項目オブジェクト全体に検証を掛ける。
 */
interface CalculationParamsCarrier {
  calculationMethod?: CalculationMethodType;
  calculationParams?: unknown;
}

/**
 * 計算パラメータの入力スキーマ（数値のみのレコード）
 *
 * 個々のキーの妥当性は `withCalculationParams` が計算方法に応じて検証・整形する。
 * ここでは JSON として保存可能な「数値のみのレコード」であることのみを保証する。
 */
const calculationParamsInputSchema = z.record(z.string(), z.number()).nullable().optional();

/**
 * 数量項目スキーマに「計算方法を判別子とした計算パラメータ検証」を付与する（REQ-48）
 *
 * - 検証: `calculationMethod` に対応するスキーマ（{@link PARAMS_SCHEMA_BY_METHOD}）で
 *   `calculationParams` を検証する。パラメータの形状から計算方法を推測しない（AC5）
 * - 整形: 指定された計算方法で使用しないキーは zod の strip 挙動により破棄したうえで
 *   永続化用の値に置き換える（AC6）。これにより「ピッチ→箇所数」「ピッチ→面積・体積」の
 *   切替時に、残留した旧パラメータが新しい入力値を追い出す不具合（AC3, AC4）が解消される
 *
 * 部分更新（`updateQuantityItemSchema`）で `calculationMethod` も `calculationParams` も
 * 指定されない場合は何もしない（既存の計算パラメータを不用意に null で上書きしないため）。
 * `calculationParams` のみが指定され `calculationMethod` が無い場合は、形状推測を行わずに
 * エラーとする（AC5）。
 *
 * @param itemSchema - 数量項目のオブジェクトスキーマ
 * @returns 計算パラメータ検証を付与したスキーマ（元のスキーマ型を保つ）
 */
export function withCalculationParams<T extends z.ZodObject<z.ZodRawShape>>(itemSchema: T): T {
  return itemSchema.superRefine((value, ctx) => {
    const item = value as CalculationParamsCarrier;
    const method = item.calculationMethod;
    const hasParamsKey = item.calculationParams !== undefined;

    // 計算方法が指定されていない部分更新
    if (method === undefined) {
      if (hasParamsKey && item.calculationParams !== null) {
        ctx.addIssue({
          code: 'custom',
          path: ['calculationParams'],
          message: QUANTITY_TABLE_VALIDATION_MESSAGES.CALCULATION_METHOD_REQUIRED_FOR_PARAMS,
        });
      }
      return;
    }

    const rawParams = item.calculationParams ?? null;

    // 計算パラメータ未指定（null / 未設定）
    if (rawParams === null) {
      if (method === 'STANDARD') {
        if (hasParamsKey) {
          item.calculationParams = null;
        }
        return;
      }
      ctx.addIssue({
        code: 'custom',
        path: ['calculationParams'],
        message: QUANTITY_TABLE_VALIDATION_MESSAGES.CALCULATION_PARAMS_REQUIRED,
      });
      return;
    }

    const result = PARAMS_SCHEMA_BY_METHOD[method].safeParse(rawParams);
    if (!result.success) {
      for (const issue of result.error.issues) {
        ctx.addIssue({
          code: 'custom',
          path: ['calculationParams', ...issue.path],
          message: issue.message,
        });
      }
      return;
    }

    // 指定された計算方法で使用しないキーを破棄した結果で置き換える（REQ-48 AC6）
    item.calculationParams = result.data;
  });
}

/**
 * 数量項目作成用スキーマ（計算パラメータ検証を付与する前の素のオブジェクトスキーマ）
 *
 * zod v4 では refinement を持つオブジェクトスキーマに対して `.omit()` が使用できないため、
 * `.omit()` / `.pick()` が必要な呼び出し元（例: `quantity-items.routes.ts` の
 * リクエストボディスキーマ）はこの素のスキーマを加工したうえで
 * {@link withCalculationParams} を適用すること。
 *
 * Requirements:
 * - 5.1: 数量グループ内で行追加操作を行う
 * - 5.2: 数量項目の各フィールドに値を入力する
 * - 5.3: 必須フィールド（工種・名称・単位・計算方法・調整係数・丸め設定・数量）が未入力で保存を試行する
 * - 8.1: 計算方法列に「標準」をデフォルト値として設定する
 */
export const createQuantityItemBaseSchema = z.object({
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

  calculationParams: calculationParamsInputSchema,

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
 * 数量項目作成用スキーマ（計算方法を判別子とした計算パラメータ検証つき）
 *
 * Requirements: 48.3-48.6
 */
export const createQuantityItemSchema = withCalculationParams(createQuantityItemBaseSchema);

/**
 * 数量項目作成入力の型
 */
export type CreateQuantityItemInput = z.infer<typeof createQuantityItemSchema>;

/**
 * 数量項目更新用スキーマ（計算パラメータ検証を付与する前の素のオブジェクトスキーマ）
 *
 * `.omit()` / `.pick()` が必要な呼び出し元はこの素のスキーマを加工したうえで
 * {@link withCalculationParams} を適用すること（zod v4 の制約。詳細は
 * {@link createQuantityItemBaseSchema} のコメントを参照）。
 */
export const updateQuantityItemBaseSchema = z.object({
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

  calculationParams: calculationParamsInputSchema,

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
 * 数量項目更新用スキーマ（計算方法を判別子とした計算パラメータ検証つき）
 *
 * Requirements: 48.3-48.6
 */
export const updateQuantityItemSchema = withCalculationParams(updateQuantityItemBaseSchema);

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
