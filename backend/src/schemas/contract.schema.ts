/**
 * @fileoverview 契約書用バリデーションスキーマ
 *
 * Requirements:
 * - 3.1: 新規契約入力フィールド（見積書選択、契約日、工期、引渡日、消費税率、支払条件、別途工事、その他、監理者）
 * - 3.2: 消費税率デフォルト10%
 * - 5.1: 変更契約時のparentContractId必須化
 * - 5.3: 変更契約入力フィールド
 * - 7.1: 作成ボタン（バリデーション）
 * - 9.2: 編集保存（楽観的排他制御のversion含む）
 */

import { z } from 'zod';

/**
 * UUIDバリデーション用正規表現
 */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * バリデーションエラーメッセージ定数
 */
export const CONTRACT_VALIDATION_MESSAGES = {
  // 契約種類
  CONTRACT_TYPE_INVALID: '契約種類はNEWまたはAMENDMENTである必要があります',

  // 基契約書ID
  PARENT_CONTRACT_REQUIRED: '変更契約の場合、基となる契約書の選択は必須です',
  PARENT_CONTRACT_INVALID_UUID: '基契約書IDの形式が不正です',

  // 見積書ID
  ESTIMATE_ID_REQUIRED: '見積書の選択は必須です',
  ESTIMATE_ID_INVALID_UUID: '見積書IDの形式が不正です',

  // 日付
  DATE_INVALID: '日付の形式が不正です',
  START_DATE_BEFORE_END_DATE: '工期着手日は工期完成日以前である必要があります',

  // 消費税率
  TAX_RATE_MIN: '消費税率は0以上である必要があります',
  TAX_RATE_MAX: '消費税率は1以下である必要があります',

  // 金額
  AMOUNT_MIN: '金額は0以上である必要があります',

  // 監理者取引先ID
  SUPERVISOR_INVALID_UUID: '監理者取引先IDの形式が不正です',

  // version
  VERSION_REQUIRED: 'バージョンは必須です',
  VERSION_MIN: 'バージョンは0以上である必要があります',
  VERSION_INTEGER: 'バージョンは整数である必要があります',

  // ステータス
  STATUS_INVALID: '無効なステータスです',

  // ページネーション
  PAGE_MIN: 'ページ番号は1以上である必要があります',
  LIMIT_MIN: '表示件数は1以上である必要があります',
  LIMIT_MAX: '表示件数は100以下である必要があります',

  // ソート
  SORT_BY_INVALID: '無効なソートフィールドです',
  SORT_ORDER_INVALID: '無効なソート順序です',
} as const;

/**
 * 契約種類
 */
const CONTRACT_TYPES = ['NEW', 'AMENDMENT'] as const;

/**
 * 契約ステータス
 */
const CONTRACT_STATUSES = ['BEFORE_CONTRACT', 'CONTRACTED'] as const;

/**
 * ソート可能フィールド
 */
const CONTRACT_SORTABLE_FIELDS = ['contractDate', 'createdAt'] as const;

/**
 * ソート順序
 */
const SORT_ORDERS = ['asc', 'desc'] as const;

/**
 * 日付文字列バリデーション（YYYY-MM-DD形式またはISO8601形式）
 */
const dateStringSchema = z.string().refine(
  (val) => {
    const date = new Date(val);
    return !isNaN(date.getTime());
  },
  { message: CONTRACT_VALIDATION_MESSAGES.DATE_INVALID }
);

/**
 * UUID文字列バリデーション
 */
const uuidSchema = (message: string) => z.string().regex(UUID_REGEX, message);

/**
 * 契約書作成入力スキーマ
 *
 * Requirements:
 * - 3.1: 全入力フィールドのバリデーション
 * - 3.2: 消費税率デフォルト10%
 * - 5.1: 変更契約時のparentContractId必須化
 */
export const createContractSchema = z
  .object({
    contractType: z.enum(CONTRACT_TYPES, CONTRACT_VALIDATION_MESSAGES.CONTRACT_TYPE_INVALID),

    parentContractId: uuidSchema(CONTRACT_VALIDATION_MESSAGES.PARENT_CONTRACT_INVALID_UUID)
      .nullable()
      .optional()
      .default(null),

    estimateId: z
      .string()
      .min(1, CONTRACT_VALIDATION_MESSAGES.ESTIMATE_ID_REQUIRED)
      .regex(UUID_REGEX, CONTRACT_VALIDATION_MESSAGES.ESTIMATE_ID_INVALID_UUID),

    contractDate: dateStringSchema,
    constructionStartDate: dateStringSchema,
    constructionEndDate: dateStringSchema,
    deliveryDate: dateStringSchema,

    taxRate: z
      .number()
      .min(0, CONTRACT_VALIDATION_MESSAGES.TAX_RATE_MIN)
      .max(1, CONTRACT_VALIDATION_MESSAGES.TAX_RATE_MAX)
      .default(0.1),

    paymentTerms: z.string().default(''),
    separateConstruction: z.string().default(''),
    otherNotes: z.string().default(''),

    supervisorTradingPartnerId: uuidSchema(CONTRACT_VALIDATION_MESSAGES.SUPERVISOR_INVALID_UUID)
      .nullable()
      .optional()
      .default(null),

    contractAmount: z.number().min(0, CONTRACT_VALIDATION_MESSAGES.AMOUNT_MIN),
    constructionPrice: z.number().min(0, CONTRACT_VALIDATION_MESSAGES.AMOUNT_MIN),
    taxAmount: z.number().min(0, CONTRACT_VALIDATION_MESSAGES.AMOUNT_MIN),
  })
  .refine(
    (data) => {
      const start = new Date(data.constructionStartDate);
      const end = new Date(data.constructionEndDate);
      return start <= end;
    },
    {
      message: CONTRACT_VALIDATION_MESSAGES.START_DATE_BEFORE_END_DATE,
      path: ['constructionStartDate'],
    }
  )
  .refine(
    (data) => {
      if (data.contractType === 'AMENDMENT') {
        return data.parentContractId != null;
      }
      return true;
    },
    {
      message: CONTRACT_VALIDATION_MESSAGES.PARENT_CONTRACT_REQUIRED,
      path: ['parentContractId'],
    }
  );

/**
 * 契約書作成入力の型
 */
export type CreateContractInput = z.infer<typeof createContractSchema>;

/**
 * 契約書更新入力スキーマ
 *
 * Requirements:
 * - 9.2: 編集保存（楽観的排他制御のversion含む）
 */
export const updateContractSchema = z
  .object({
    estimateId: z
      .string()
      .min(1, CONTRACT_VALIDATION_MESSAGES.ESTIMATE_ID_REQUIRED)
      .regex(UUID_REGEX, CONTRACT_VALIDATION_MESSAGES.ESTIMATE_ID_INVALID_UUID),

    contractDate: dateStringSchema,
    constructionStartDate: dateStringSchema,
    constructionEndDate: dateStringSchema,
    deliveryDate: dateStringSchema,

    taxRate: z
      .number()
      .min(0, CONTRACT_VALIDATION_MESSAGES.TAX_RATE_MIN)
      .max(1, CONTRACT_VALIDATION_MESSAGES.TAX_RATE_MAX),

    paymentTerms: z.string(),
    separateConstruction: z.string(),
    otherNotes: z.string(),

    supervisorTradingPartnerId: uuidSchema(CONTRACT_VALIDATION_MESSAGES.SUPERVISOR_INVALID_UUID)
      .nullable()
      .optional()
      .default(null),

    contractAmount: z.number().min(0, CONTRACT_VALIDATION_MESSAGES.AMOUNT_MIN),
    constructionPrice: z.number().min(0, CONTRACT_VALIDATION_MESSAGES.AMOUNT_MIN),
    taxAmount: z.number().min(0, CONTRACT_VALIDATION_MESSAGES.AMOUNT_MIN),

    version: z
      .number()
      .int(CONTRACT_VALIDATION_MESSAGES.VERSION_INTEGER)
      .min(0, CONTRACT_VALIDATION_MESSAGES.VERSION_MIN),
  })
  .refine(
    (data) => {
      const start = new Date(data.constructionStartDate);
      const end = new Date(data.constructionEndDate);
      return start <= end;
    },
    {
      message: CONTRACT_VALIDATION_MESSAGES.START_DATE_BEFORE_END_DATE,
      path: ['constructionStartDate'],
    }
  );

/**
 * 契約書更新入力の型
 */
export type UpdateContractInput = z.infer<typeof updateContractSchema>;

/**
 * 契約書一覧クエリスキーマ
 *
 * クエリパラメータは文字列として送信されるため、coerceで数値に変換
 */
export const contractListQuerySchema = z.object({
  page: z.coerce.number().int().min(1, CONTRACT_VALIDATION_MESSAGES.PAGE_MIN).default(1),

  limit: z.coerce
    .number()
    .int()
    .min(1, CONTRACT_VALIDATION_MESSAGES.LIMIT_MIN)
    .max(100, CONTRACT_VALIDATION_MESSAGES.LIMIT_MAX)
    .default(20),

  sortBy: z
    .enum(CONTRACT_SORTABLE_FIELDS, CONTRACT_VALIDATION_MESSAGES.SORT_BY_INVALID)
    .default('createdAt'),

  sortOrder: z.enum(SORT_ORDERS, CONTRACT_VALIDATION_MESSAGES.SORT_ORDER_INVALID).default('desc'),
});

/**
 * 契約書一覧クエリの型
 */
export type ContractListQuery = z.infer<typeof contractListQuerySchema>;

/**
 * ステータス更新入力スキーマ
 *
 * Requirements:
 * - 8.2, 8.3: ステータス双方向遷移
 */
export const updateContractStatusSchema = z.object({
  status: z.enum(CONTRACT_STATUSES, CONTRACT_VALIDATION_MESSAGES.STATUS_INVALID),
});

/**
 * ステータス更新入力の型
 */
export type UpdateContractStatusInput = z.infer<typeof updateContractStatusSchema>;
