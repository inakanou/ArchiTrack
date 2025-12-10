/**
 * @fileoverview 取引先用バリデーションスキーマ
 *
 * Requirements (作成):
 * - 2.2, 2.3: 必須入力欄（名前、フリガナ、種別、住所）の定義
 * - 2.4: 請求締日として1日〜31日および「末日」の計32オプション
 * - 2.5: 支払日として月選択（翌月/翌々月/3ヶ月後）と日選択（1日〜31日および「末日」）
 * - 2.6: 種別選択肢として「顧客」と「協力業者」をチェックボックスで複数選択可能
 * - 2.9: 必須項目未入力時のバリデーションエラー表示
 * - 2.10: メールアドレス形式不正時のエラー表示
 *
 * Requirements (更新):
 * - 4.2: 作成時と同じ必須・任意項目の編集を可能とする
 * - 4.3: 請求締日として1日〜31日および「末日」の計32オプションをドロップダウンで提供
 * - 4.4: 支払日として月選択と日選択の組み合わせをドロップダウンで提供
 * - 4.9: 楽観的排他制御（バージョン管理）を実装
 *
 * Requirements (データ整合性):
 * - 11.1: 取引先名の最大文字数を200文字に制限
 * - 11.2: フリガナの最大文字数を200文字に制限し、カタカナのみを許可
 * - 11.3: 部課/支店/支社名の最大文字数を100文字に制限
 * - 11.4: 部課/支店/支社フリガナの最大文字数を100文字に制限し、カタカナのみを許可
 * - 11.5: 代表者名の最大文字数を100文字に制限
 * - 11.6: 代表者フリガナの最大文字数を100文字に制限し、カタカナのみを許可
 * - 11.7: 電話番号の形式バリデーション（数字、ハイフン、括弧のみ許可）
 * - 11.8: FAX番号の形式バリデーション（数字、ハイフン、括弧のみ許可）
 * - 11.9: メールアドレスの形式バリデーション
 * - 11.10: 住所の最大文字数を500文字に制限
 * - 11.11: 請求締日を1〜31の整数値または「末日」（99）として管理
 * - 11.12: 支払日を月オフセット（1-3）と日（1-31または99）の組み合わせとして管理
 * - 11.13: 備考の最大文字数を2000文字に制限
 */

import { z } from 'zod';

/**
 * 取引先種別
 * Requirements: 6.1, 6.2
 */
export const TRADING_PARTNER_TYPES = ['CUSTOMER', 'SUBCONTRACTOR'] as const;
export type TradingPartnerType = (typeof TRADING_PARTNER_TYPES)[number];

/**
 * 末日を表す特殊値
 * Requirements: 11.11, 11.12
 */
export const BILLING_CLOSING_DAY_END_OF_MONTH = 99;
export const PAYMENT_DAY_END_OF_MONTH = 99;

/**
 * バリデーションエラーメッセージ定数
 * 日本語メッセージを定義
 */
export const TRADING_PARTNER_VALIDATION_MESSAGES = {
  // 名前
  NAME_REQUIRED: '取引先名は必須です',
  NAME_TOO_LONG: '取引先名は200文字以内で入力してください',

  // フリガナ
  NAME_KANA_REQUIRED: 'フリガナは必須です',
  NAME_KANA_TOO_LONG: 'フリガナは200文字以内で入力してください',
  NAME_KANA_KATAKANA_ONLY: 'フリガナはカタカナで入力してください',

  // 部課/支店/支社名
  BRANCH_NAME_TOO_LONG: '部課/支店/支社名は100文字以内で入力してください',
  BRANCH_NAME_KANA_TOO_LONG: '部課/支店/支社フリガナは100文字以内で入力してください',
  BRANCH_NAME_KANA_KATAKANA_ONLY: '部課/支店/支社フリガナはカタカナで入力してください',

  // 代表者名
  REPRESENTATIVE_NAME_TOO_LONG: '代表者名は100文字以内で入力してください',
  REPRESENTATIVE_NAME_KANA_TOO_LONG: '代表者フリガナは100文字以内で入力してください',
  REPRESENTATIVE_NAME_KANA_KATAKANA_ONLY: '代表者フリガナはカタカナで入力してください',

  // 種別
  TYPES_REQUIRED: '種別を1つ以上選択してください',
  TYPES_INVALID: '無効な種別です',

  // 住所
  ADDRESS_REQUIRED: '住所は必須です',
  ADDRESS_TOO_LONG: '住所は500文字以内で入力してください',

  // 電話番号
  PHONE_NUMBER_INVALID: '電話番号の形式が不正です（数字、ハイフン、括弧のみ使用可）',

  // FAX番号
  FAX_NUMBER_INVALID: 'FAX番号の形式が不正です（数字、ハイフン、括弧のみ使用可）',

  // メールアドレス
  EMAIL_INVALID: '有効なメールアドレスを入力してください',

  // 請求締日
  BILLING_CLOSING_DAY_INVALID: '請求締日は1〜31または末日（99）を指定してください',

  // 支払月オフセット
  PAYMENT_MONTH_OFFSET_INVALID: '支払月は翌月(1)、翌々月(2)、3ヶ月後(3)から選択してください',

  // 支払日
  PAYMENT_DAY_INVALID: '支払日は1〜31または末日（99）を指定してください',

  // 備考
  NOTES_TOO_LONG: '備考は2000文字以内で入力してください',
} as const;

/**
 * カタカナバリデーション用正規表現
 * 全角カタカナ、長音符（ー）、中黒（・）、全角スペース、半角スペースを許可
 * Requirements: 11.2, 11.4, 11.6
 */
export const KATAKANA_REGEX = /^[ァ-ヶー・\u3000 ]+$/;

/**
 * 電話番号・FAX番号バリデーション用正規表現
 * 数字、ハイフン、括弧のみを許可
 * Requirements: 11.7, 11.8
 */
export const PHONE_FAX_REGEX = /^[0-9\-()]+$/;

/**
 * 請求締日バリデーションスキーマ
 * 1〜31または99（末日）のみを許可
 * Requirements: 11.11
 */
const billingClosingDaySchema = z
  .number()
  .int()
  .refine((val) => (val >= 1 && val <= 31) || val === BILLING_CLOSING_DAY_END_OF_MONTH, {
    message: TRADING_PARTNER_VALIDATION_MESSAGES.BILLING_CLOSING_DAY_INVALID,
  })
  .nullable()
  .optional();

/**
 * 支払月オフセットバリデーションスキーマ
 * 1（翌月）、2（翌々月）、3（3ヶ月後）のみを許可
 * Requirements: 11.12
 */
const paymentMonthOffsetSchema = z
  .number()
  .int()
  .min(1, TRADING_PARTNER_VALIDATION_MESSAGES.PAYMENT_MONTH_OFFSET_INVALID)
  .max(3, TRADING_PARTNER_VALIDATION_MESSAGES.PAYMENT_MONTH_OFFSET_INVALID)
  .nullable()
  .optional();

/**
 * 支払日バリデーションスキーマ
 * 1〜31または99（末日）のみを許可
 * Requirements: 11.12
 */
const paymentDaySchema = z
  .number()
  .int()
  .refine((val) => (val >= 1 && val <= 31) || val === PAYMENT_DAY_END_OF_MONTH, {
    message: TRADING_PARTNER_VALIDATION_MESSAGES.PAYMENT_DAY_INVALID,
  })
  .nullable()
  .optional();

/**
 * 電話番号・FAX番号のバリデーションヘルパー
 * @param errorMessage - 形式エラー時のメッセージ
 */
const phoneOrFaxSchema = (errorMessage: string) =>
  z
    .string()
    .refine((val) => PHONE_FAX_REGEX.test(val), {
      message: errorMessage,
    })
    .nullable()
    .optional();

/**
 * 取引先作成用スキーマ
 * Requirements: 2.2, 2.3, 2.4, 2.5, 2.6, 2.9, 2.10, 11.1-11.13
 */
export const createTradingPartnerSchema = z.object({
  // 必須フィールド
  name: z
    .string()
    .min(1, TRADING_PARTNER_VALIDATION_MESSAGES.NAME_REQUIRED)
    .max(200, TRADING_PARTNER_VALIDATION_MESSAGES.NAME_TOO_LONG)
    .refine((val) => val.trim().length > 0, {
      message: TRADING_PARTNER_VALIDATION_MESSAGES.NAME_REQUIRED,
    }),

  nameKana: z
    .string()
    .min(1, TRADING_PARTNER_VALIDATION_MESSAGES.NAME_KANA_REQUIRED)
    .max(200, TRADING_PARTNER_VALIDATION_MESSAGES.NAME_KANA_TOO_LONG)
    .refine((val) => KATAKANA_REGEX.test(val), {
      message: TRADING_PARTNER_VALIDATION_MESSAGES.NAME_KANA_KATAKANA_ONLY,
    }),

  types: z
    .array(z.enum(TRADING_PARTNER_TYPES, TRADING_PARTNER_VALIDATION_MESSAGES.TYPES_INVALID))
    .min(1, TRADING_PARTNER_VALIDATION_MESSAGES.TYPES_REQUIRED),

  address: z
    .string()
    .min(1, TRADING_PARTNER_VALIDATION_MESSAGES.ADDRESS_REQUIRED)
    .max(500, TRADING_PARTNER_VALIDATION_MESSAGES.ADDRESS_TOO_LONG)
    .refine((val) => val.trim().length > 0, {
      message: TRADING_PARTNER_VALIDATION_MESSAGES.ADDRESS_REQUIRED,
    }),

  // 任意フィールド
  branchName: z
    .string()
    .max(100, TRADING_PARTNER_VALIDATION_MESSAGES.BRANCH_NAME_TOO_LONG)
    .nullable()
    .optional(),

  branchNameKana: z
    .string()
    .max(100, TRADING_PARTNER_VALIDATION_MESSAGES.BRANCH_NAME_KANA_TOO_LONG)
    .refine((val) => KATAKANA_REGEX.test(val), {
      message: TRADING_PARTNER_VALIDATION_MESSAGES.BRANCH_NAME_KANA_KATAKANA_ONLY,
    })
    .nullable()
    .optional(),

  representativeName: z
    .string()
    .max(100, TRADING_PARTNER_VALIDATION_MESSAGES.REPRESENTATIVE_NAME_TOO_LONG)
    .nullable()
    .optional(),

  representativeNameKana: z
    .string()
    .max(100, TRADING_PARTNER_VALIDATION_MESSAGES.REPRESENTATIVE_NAME_KANA_TOO_LONG)
    .refine((val) => KATAKANA_REGEX.test(val), {
      message: TRADING_PARTNER_VALIDATION_MESSAGES.REPRESENTATIVE_NAME_KANA_KATAKANA_ONLY,
    })
    .nullable()
    .optional(),

  phoneNumber: phoneOrFaxSchema(TRADING_PARTNER_VALIDATION_MESSAGES.PHONE_NUMBER_INVALID),

  faxNumber: phoneOrFaxSchema(TRADING_PARTNER_VALIDATION_MESSAGES.FAX_NUMBER_INVALID),

  email: z.string().email(TRADING_PARTNER_VALIDATION_MESSAGES.EMAIL_INVALID).nullable().optional(),

  billingClosingDay: billingClosingDaySchema,

  paymentMonthOffset: paymentMonthOffsetSchema,

  paymentDay: paymentDaySchema,

  notes: z
    .string()
    .max(2000, TRADING_PARTNER_VALIDATION_MESSAGES.NOTES_TOO_LONG)
    .nullable()
    .optional(),
});

/**
 * 取引先作成入力の型
 */
export type CreateTradingPartnerInput = z.infer<typeof createTradingPartnerSchema>;

/**
 * 楽観的排他制御用バリデーションエラーメッセージ
 * Requirements: 4.9, 4.10
 */
export const EXPECTED_UPDATED_AT_VALIDATION_MESSAGES = {
  REQUIRED: '更新日時は必須です',
  INVALID: '更新日時の形式が不正です',
} as const;

/**
 * 日付文字列バリデーション（ISO8601形式またはYYYY-MM-DD形式）
 * Requirements: 4.9
 */
const dateStringSchema = z.string().refine(
  (val) => {
    if (!val || val.trim() === '') {
      return false;
    }
    const date = new Date(val);
    return !isNaN(date.getTime());
  },
  { message: EXPECTED_UPDATED_AT_VALIDATION_MESSAGES.INVALID }
);

/**
 * 取引先更新用スキーマ
 * Requirements: 4.2, 4.3, 4.4, 11.1-11.13
 *
 * 部分更新に対応: すべてのフィールドがオプショナル（expectedUpdatedAt以外）
 * 楽観的排他制御: expectedUpdatedAtは必須
 */
export const updateTradingPartnerSchema = z.object({
  // 楽観的排他制御用（必須）
  expectedUpdatedAt: dateStringSchema,

  // 必須フィールド（指定された場合のみバリデーション）
  name: z
    .string()
    .min(1, TRADING_PARTNER_VALIDATION_MESSAGES.NAME_REQUIRED)
    .max(200, TRADING_PARTNER_VALIDATION_MESSAGES.NAME_TOO_LONG)
    .refine((val) => val.trim().length > 0, {
      message: TRADING_PARTNER_VALIDATION_MESSAGES.NAME_REQUIRED,
    })
    .optional(),

  nameKana: z
    .string()
    .min(1, TRADING_PARTNER_VALIDATION_MESSAGES.NAME_KANA_REQUIRED)
    .max(200, TRADING_PARTNER_VALIDATION_MESSAGES.NAME_KANA_TOO_LONG)
    .refine((val) => KATAKANA_REGEX.test(val), {
      message: TRADING_PARTNER_VALIDATION_MESSAGES.NAME_KANA_KATAKANA_ONLY,
    })
    .optional(),

  types: z
    .array(z.enum(TRADING_PARTNER_TYPES, TRADING_PARTNER_VALIDATION_MESSAGES.TYPES_INVALID))
    .min(1, TRADING_PARTNER_VALIDATION_MESSAGES.TYPES_REQUIRED)
    .optional(),

  address: z
    .string()
    .min(1, TRADING_PARTNER_VALIDATION_MESSAGES.ADDRESS_REQUIRED)
    .max(500, TRADING_PARTNER_VALIDATION_MESSAGES.ADDRESS_TOO_LONG)
    .refine((val) => val.trim().length > 0, {
      message: TRADING_PARTNER_VALIDATION_MESSAGES.ADDRESS_REQUIRED,
    })
    .optional(),

  // 任意フィールド
  branchName: z
    .string()
    .max(100, TRADING_PARTNER_VALIDATION_MESSAGES.BRANCH_NAME_TOO_LONG)
    .nullable()
    .optional(),

  branchNameKana: z
    .string()
    .max(100, TRADING_PARTNER_VALIDATION_MESSAGES.BRANCH_NAME_KANA_TOO_LONG)
    .refine((val) => KATAKANA_REGEX.test(val), {
      message: TRADING_PARTNER_VALIDATION_MESSAGES.BRANCH_NAME_KANA_KATAKANA_ONLY,
    })
    .nullable()
    .optional(),

  representativeName: z
    .string()
    .max(100, TRADING_PARTNER_VALIDATION_MESSAGES.REPRESENTATIVE_NAME_TOO_LONG)
    .nullable()
    .optional(),

  representativeNameKana: z
    .string()
    .max(100, TRADING_PARTNER_VALIDATION_MESSAGES.REPRESENTATIVE_NAME_KANA_TOO_LONG)
    .refine((val) => KATAKANA_REGEX.test(val), {
      message: TRADING_PARTNER_VALIDATION_MESSAGES.REPRESENTATIVE_NAME_KANA_KATAKANA_ONLY,
    })
    .nullable()
    .optional(),

  phoneNumber: phoneOrFaxSchema(TRADING_PARTNER_VALIDATION_MESSAGES.PHONE_NUMBER_INVALID),

  faxNumber: phoneOrFaxSchema(TRADING_PARTNER_VALIDATION_MESSAGES.FAX_NUMBER_INVALID),

  email: z.string().email(TRADING_PARTNER_VALIDATION_MESSAGES.EMAIL_INVALID).nullable().optional(),

  billingClosingDay: billingClosingDaySchema,

  paymentMonthOffset: paymentMonthOffsetSchema,

  paymentDay: paymentDaySchema,

  notes: z
    .string()
    .max(2000, TRADING_PARTNER_VALIDATION_MESSAGES.NOTES_TOO_LONG)
    .nullable()
    .optional(),
});

/**
 * 取引先更新入力の型
 */
export type UpdateTradingPartnerInput = z.infer<typeof updateTradingPartnerSchema>;

/**
 * 一覧取得用バリデーションエラーメッセージ定数
 * Requirements: 1.3, 1.4, 1.5, 1.6
 */
export const TRADING_PARTNER_LIST_VALIDATION_MESSAGES = {
  // ページネーション
  PAGE_MIN: 'ページ番号は1以上である必要があります',
  LIMIT_MIN: '表示件数は1以上である必要があります',
  LIMIT_MAX: '表示件数は100以下である必要があります',

  // 種別フィルター
  TYPE_INVALID: '無効な種別です',

  // ソート
  SORT_FIELD_INVALID: '無効なソートフィールドです',
  ORDER_INVALID: '無効なソート順序です',
} as const;

/**
 * オートコンプリート検索用バリデーションエラーメッセージ定数
 * Requirements: 10.2, 10.5
 */
export const TRADING_PARTNER_SEARCH_VALIDATION_MESSAGES = {
  // 検索クエリ
  QUERY_REQUIRED: '検索クエリは必須です',

  // 種別フィルター
  TYPE_INVALID: '無効な種別です',

  // 件数制限
  LIMIT_MIN: '件数は1以上である必要があります',
  LIMIT_MAX: '件数は10以下である必要があります',
} as const;

/**
 * IDパラメータ用バリデーションエラーメッセージ定数
 */
export const TRADING_PARTNER_ID_VALIDATION_MESSAGES = {
  ID_REQUIRED: '取引先IDは必須です',
  ID_INVALID_UUID: '取引先IDの形式が不正です',
} as const;

/**
 * ソート可能フィールド（取引先一覧用）
 * Requirements: 1.6 - 指定された列でソート可能
 */
export const TRADING_PARTNER_SORTABLE_FIELDS = [
  'id',
  'name',
  'nameKana',
  'createdAt',
  'updatedAt',
] as const;
export type TradingPartnerSortableField = (typeof TRADING_PARTNER_SORTABLE_FIELDS)[number];

/**
 * ソート順序
 */
export const SORT_ORDERS = ['asc', 'desc'] as const;
export type SortOrder = (typeof SORT_ORDERS)[number];

/**
 * UUIDバリデーション用正規表現
 */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * ページネーション用スキーマ（取引先一覧用）
 * クエリパラメータは文字列として送信されるため、coerceで数値に変換
 * Requirements: 1.5
 */
const tradingPartnerPaginationSchema = z.object({
  page: z.coerce
    .number()
    .int()
    .min(1, TRADING_PARTNER_LIST_VALIDATION_MESSAGES.PAGE_MIN)
    .default(1),

  limit: z.coerce
    .number()
    .int()
    .min(1, TRADING_PARTNER_LIST_VALIDATION_MESSAGES.LIMIT_MIN)
    .max(100, TRADING_PARTNER_LIST_VALIDATION_MESSAGES.LIMIT_MAX)
    .default(20),
});

/**
 * フィルター用スキーマ（取引先一覧用）
 * Requirements: 1.3, 1.4
 */
const tradingPartnerFilterSchema = z.object({
  // 検索キーワード（取引先名またはフリガナで部分一致検索）
  // 空文字の場合はundefinedとして扱う
  search: z
    .string()
    .optional()
    .transform((val) => (val === '' ? undefined : val)),

  // 種別フィルター
  type: z
    .enum(TRADING_PARTNER_TYPES, TRADING_PARTNER_LIST_VALIDATION_MESSAGES.TYPE_INVALID)
    .optional(),
});

/**
 * ソート用スキーマ（取引先一覧用）
 * Requirements: 1.6, 1.8 - フリガナ昇順がデフォルト
 */
const tradingPartnerSortSchema = z.object({
  sort: z
    .enum(
      TRADING_PARTNER_SORTABLE_FIELDS,
      TRADING_PARTNER_LIST_VALIDATION_MESSAGES.SORT_FIELD_INVALID
    )
    .default('nameKana'),

  order: z.enum(SORT_ORDERS, TRADING_PARTNER_LIST_VALIDATION_MESSAGES.ORDER_INVALID).default('asc'),
});

/**
 * 取引先一覧取得用クエリスキーマ（フィルター + ページネーション + ソート）
 * Requirements: 1.3, 1.4, 1.5, 1.6
 */
export const tradingPartnerListQuerySchema = tradingPartnerFilterSchema
  .merge(tradingPartnerPaginationSchema)
  .merge(tradingPartnerSortSchema);

/**
 * 取引先一覧取得用クエリの型
 */
export type TradingPartnerListQuery = z.infer<typeof tradingPartnerListQuerySchema>;

/**
 * オートコンプリート検索用クエリスキーマ
 * Requirements: 10.2, 10.5
 */
export const tradingPartnerSearchQuerySchema = z.object({
  // 検索クエリ（1文字以上必須）
  q: z.string().min(1, TRADING_PARTNER_SEARCH_VALIDATION_MESSAGES.QUERY_REQUIRED),

  // 種別フィルター（オプショナル）
  type: z
    .enum(TRADING_PARTNER_TYPES, TRADING_PARTNER_SEARCH_VALIDATION_MESSAGES.TYPE_INVALID)
    .optional(),

  // 件数制限（デフォルト10、最大10）
  limit: z.coerce
    .number()
    .int()
    .min(1, TRADING_PARTNER_SEARCH_VALIDATION_MESSAGES.LIMIT_MIN)
    .max(10, TRADING_PARTNER_SEARCH_VALIDATION_MESSAGES.LIMIT_MAX)
    .default(10),
});

/**
 * オートコンプリート検索用クエリの型
 */
export type TradingPartnerSearchQuery = z.infer<typeof tradingPartnerSearchQuerySchema>;

/**
 * 取引先IDパラメータ用スキーマ
 */
export const tradingPartnerIdParamSchema = z.object({
  id: z
    .string()
    .min(1, TRADING_PARTNER_ID_VALIDATION_MESSAGES.ID_REQUIRED)
    .regex(UUID_REGEX, TRADING_PARTNER_ID_VALIDATION_MESSAGES.ID_INVALID_UUID),
});

/**
 * 取引先IDパラメータの型
 */
export type TradingPartnerIdParam = z.infer<typeof tradingPartnerIdParamSchema>;
