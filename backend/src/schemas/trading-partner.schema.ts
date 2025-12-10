/**
 * @fileoverview 取引先用バリデーションスキーマ
 *
 * Requirements:
 * - 2.2, 2.3: 必須入力欄（名前、フリガナ、種別、住所）の定義
 * - 2.4: 請求締日として1日〜31日および「末日」の計32オプション
 * - 2.5: 支払日として月選択（翌月/翌々月/3ヶ月後）と日選択（1日〜31日および「末日」）
 * - 2.6: 種別選択肢として「顧客」と「協力業者」をチェックボックスで複数選択可能
 * - 2.9: 必須項目未入力時のバリデーションエラー表示
 * - 2.10: メールアドレス形式不正時のエラー表示
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
