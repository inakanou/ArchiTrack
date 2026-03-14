/**
 * @fileoverview 工程表用バリデーションスキーマ
 *
 * Requirements:
 * - 1.3: 工程表保存（バリデーション）
 * - 1.6: 保存失敗時エラー表示（フィールド単位のバリデーションメッセージ）
 * - 3.4: 着工日未入力バリデーション
 * - 3.5: 日数0以下バリデーション
 */

import { z } from 'zod';

/**
 * UUIDバリデーション用正規表現
 */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * ISO日付形式バリデーション（YYYY-MM-DD）
 */
const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/**
 * バリデーションエラーメッセージ定数
 */
export const SCHEDULE_VALIDATION_MESSAGES = {
  // 工程表名
  NAME_REQUIRED: '工程表名は必須です',
  NAME_MAX_LENGTH: '工程表名は200文字以内で入力してください',

  // 数量表ID
  QUANTITY_TABLE_ID_INVALID_UUID: '数量表IDの形式が不正です',

  // version
  VERSION_REQUIRED: 'バージョンは必須です',
  VERSION_MIN: 'バージョンは0以上である必要があります',
  VERSION_INTEGER: 'バージョンは整数である必要があります',

  // 項目名
  ITEM_NAME_REQUIRED: '項目名は必須です',
  ITEM_NAME_MAX_LENGTH: '項目名は500文字以内で入力してください',

  // ラベル文字
  LABEL_TEXT_MAX_LENGTH: 'ラベル文字は200文字以内で入力してください',

  // 詳細文字
  DETAIL_TEXT_MAX_LENGTH: '詳細文字は500文字以内で入力してください',

  // 着工日
  START_DATE_INVALID: '着工日の形式が不正です（YYYY-MM-DD形式で入力してください）',

  // 日数
  DURATION_MIN: '日数は1以上の正の整数で入力してください',
  DURATION_INTEGER: '日数は整数で入力してください',

  // 表示順序
  DISPLAY_ORDER_MIN: '表示順序は0以上である必要があります',
  DISPLAY_ORDER_INTEGER: '表示順序は整数である必要があります',

  // 項目ID
  ITEM_ID_INVALID_UUID: '項目IDの形式が不正です',

  // エクスポート形式
  FORMAT_INVALID: '出力形式はxlsxまたはpdfを指定してください',

  // ページネーション
  PAGE_MIN: 'ページ番号は1以上である必要があります',
  LIMIT_MIN: '表示件数は1以上である必要があります',
  LIMIT_MAX: '表示件数は100以下である必要があります',

  // ソート
  SORT_BY_INVALID: '無効なソートフィールドです',
  SORT_ORDER_INVALID: '無効なソート順序です',
} as const;

/**
 * ソート可能フィールド
 */
const SCHEDULE_SORTABLE_FIELDS = ['createdAt', 'updatedAt', 'name'] as const;

/**
 * ソート順序
 */
const SORT_ORDERS = ['asc', 'desc'] as const;

/**
 * エクスポート形式
 */
const EXPORT_FORMATS = ['xlsx', 'pdf'] as const;

/**
 * ISO日付文字列バリデーション（YYYY-MM-DD形式）
 */
const isoDateStringSchema = z.string().refine(
  (val) => {
    if (!ISO_DATE_REGEX.test(val)) return false;
    const date = new Date(val);
    return !isNaN(date.getTime());
  },
  { message: SCHEDULE_VALIDATION_MESSAGES.START_DATE_INVALID }
);

/**
 * 工程表作成入力スキーマ
 *
 * Requirements:
 * - 1.3: name（必須、1-200文字）、quantityTableId（任意）
 */
export const createScheduleSchema = z.object({
  name: z
    .string()
    .min(1, SCHEDULE_VALIDATION_MESSAGES.NAME_REQUIRED)
    .max(200, SCHEDULE_VALIDATION_MESSAGES.NAME_MAX_LENGTH),

  quantityTableId: z
    .string()
    .regex(UUID_REGEX, SCHEDULE_VALIDATION_MESSAGES.QUANTITY_TABLE_ID_INVALID_UUID)
    .nullable()
    .optional()
    .default(null),
});

/**
 * 工程表作成入力の型
 */
export type CreateScheduleInput = z.infer<typeof createScheduleSchema>;

/**
 * 工程表更新入力スキーマ
 *
 * Requirements:
 * - 1.3: name（必須、1-200文字）
 * - 楽観的排他制御のversion必須
 */
export const updateScheduleSchema = z.object({
  name: z
    .string()
    .min(1, SCHEDULE_VALIDATION_MESSAGES.NAME_REQUIRED)
    .max(200, SCHEDULE_VALIDATION_MESSAGES.NAME_MAX_LENGTH),

  version: z
    .number()
    .int(SCHEDULE_VALIDATION_MESSAGES.VERSION_INTEGER)
    .min(0, SCHEDULE_VALIDATION_MESSAGES.VERSION_MIN),
});

/**
 * 工程表更新入力の型
 */
export type UpdateScheduleInput = z.infer<typeof updateScheduleSchema>;

/**
 * バルク保存項目スキーマ
 *
 * Requirements:
 * - 3.4: startDate ISO日付形式null許可
 * - 3.5: duration正の整数null許可
 */
const bulkSaveScheduleItemSchema = z.object({
  id: z.string().regex(UUID_REGEX, SCHEDULE_VALIDATION_MESSAGES.ITEM_ID_INVALID_UUID).nullable(),

  itemName: z
    .string()
    .min(1, SCHEDULE_VALIDATION_MESSAGES.ITEM_NAME_REQUIRED)
    .max(500, SCHEDULE_VALIDATION_MESSAGES.ITEM_NAME_MAX_LENGTH),

  labelText: z.string().max(200, SCHEDULE_VALIDATION_MESSAGES.LABEL_TEXT_MAX_LENGTH),

  detailText: z.string().max(500, SCHEDULE_VALIDATION_MESSAGES.DETAIL_TEXT_MAX_LENGTH),

  startDate: isoDateStringSchema.nullable(),

  duration: z
    .number()
    .int(SCHEDULE_VALIDATION_MESSAGES.DURATION_INTEGER)
    .min(1, SCHEDULE_VALIDATION_MESSAGES.DURATION_MIN)
    .nullable(),

  displayOrder: z
    .number()
    .int(SCHEDULE_VALIDATION_MESSAGES.DISPLAY_ORDER_INTEGER)
    .min(0, SCHEDULE_VALIDATION_MESSAGES.DISPLAY_ORDER_MIN),

  isExportTarget: z.boolean(),
});

/**
 * バルク保存入力スキーマ
 *
 * Requirements:
 * - 楽観的排他制御のversion必須
 * - items配列で全項目を一括保存
 */
export const bulkSaveScheduleItemsSchema = z.object({
  version: z
    .number()
    .int(SCHEDULE_VALIDATION_MESSAGES.VERSION_INTEGER)
    .min(0, SCHEDULE_VALIDATION_MESSAGES.VERSION_MIN),

  items: z.array(bulkSaveScheduleItemSchema),
});

/**
 * バルク保存入力の型
 */
export type BulkSaveScheduleItemsInput = z.infer<typeof bulkSaveScheduleItemsSchema>;

/**
 * エクスポートクエリスキーマ
 *
 * Requirements:
 * - format: xlsx|pdf
 */
export const exportQuerySchema = z.object({
  format: z.enum(EXPORT_FORMATS, SCHEDULE_VALIDATION_MESSAGES.FORMAT_INVALID),
});

/**
 * エクスポートクエリの型
 */
export type ExportQuery = z.infer<typeof exportQuerySchema>;

/**
 * 一覧クエリスキーマ
 *
 * クエリパラメータは文字列として送信されるため、coerceで数値に変換
 */
export const scheduleListQuerySchema = z.object({
  page: z.coerce.number().int().min(1, SCHEDULE_VALIDATION_MESSAGES.PAGE_MIN).default(1),

  limit: z.coerce
    .number()
    .int()
    .min(1, SCHEDULE_VALIDATION_MESSAGES.LIMIT_MIN)
    .max(100, SCHEDULE_VALIDATION_MESSAGES.LIMIT_MAX)
    .default(20),

  sortBy: z
    .enum(SCHEDULE_SORTABLE_FIELDS, SCHEDULE_VALIDATION_MESSAGES.SORT_BY_INVALID)
    .default('createdAt'),

  sortOrder: z.enum(SORT_ORDERS, SCHEDULE_VALIDATION_MESSAGES.SORT_ORDER_INVALID).default('desc'),
});

/**
 * 一覧クエリの型
 */
export type ScheduleListQuery = z.infer<typeof scheduleListQuerySchema>;
