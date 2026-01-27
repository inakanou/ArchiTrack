/**
 * @fileoverview 自社情報用バリデーションスキーマ
 *
 * Requirements:
 * - 4.1: 会社名の最大文字数を200文字に制限
 * - 4.2: 住所の最大文字数を500文字に制限
 * - 4.3: 代表者名の最大文字数を100文字に制限
 * - 4.4: 電話番号の形式バリデーション（数字、ハイフン、括弧のみ許可、最大20文字）
 * - 4.5: FAX番号の形式バリデーション（数字、ハイフン、括弧のみ許可、最大20文字）
 * - 4.6: メールアドレスが入力されている場合、形式バリデーションを実行
 * - 4.7: メールアドレスの形式が不正な場合、「有効なメールアドレスを入力してください」エラー
 * - 4.8: メールアドレスの最大文字数を254文字に制限
 * - 4.9: 適格請求書発行事業者登録番号の形式バリデーション（T + 13桁の数字）
 * - 4.10: 適格請求書発行事業者登録番号の形式エラー表示
 *
 * Design Reference: design.md - company-info.schema.ts セクション
 */

import { z } from 'zod';

/**
 * バリデーションエラーメッセージ定数
 * 日本語メッセージを定義
 */
export const COMPANY_INFO_VALIDATION_MESSAGES = {
  // 会社名
  COMPANY_NAME_REQUIRED: '会社名は必須です',
  COMPANY_NAME_TOO_LONG: '会社名は200文字以内で入力してください',

  // 住所
  ADDRESS_REQUIRED: '住所は必須です',
  ADDRESS_TOO_LONG: '住所は500文字以内で入力してください',

  // 代表者
  REPRESENTATIVE_REQUIRED: '代表者は必須です',
  REPRESENTATIVE_TOO_LONG: '代表者名は100文字以内で入力してください',

  // 電話番号
  PHONE_INVALID: '電話番号の形式が不正です（数字、ハイフン、括弧のみ使用可）',
  PHONE_TOO_LONG: '電話番号は20文字以内で入力してください',

  // FAX番号
  FAX_INVALID: 'FAX番号の形式が不正です（数字、ハイフン、括弧のみ使用可）',
  FAX_TOO_LONG: 'FAX番号は20文字以内で入力してください',

  // メールアドレス
  EMAIL_INVALID: '有効なメールアドレスを入力してください',
  EMAIL_TOO_LONG: 'メールアドレスは254文字以内で入力してください',

  // 適格請求書発行事業者登録番号
  INVOICE_REGISTRATION_NUMBER_INVALID:
    '適格請求書発行事業者登録番号は「T」+ 13桁の数字で入力してください',

  // バージョン
  VERSION_INVALID: 'バージョンは0以上の整数である必要があります',
} as const;

/**
 * 電話番号・FAX番号バリデーション用正規表現
 * 数字、ハイフン、括弧のみを許可
 * Requirements: 4.4, 4.5
 */
export const PHONE_FAX_REGEX = /^[0-9\-()]+$/;

/**
 * 適格請求書発行事業者登録番号形式（T + 13桁数字）
 * Requirements: 4.9
 */
export const INVOICE_REGISTRATION_NUMBER_REGEX = /^T\d{13}$/;

/**
 * 電話番号・FAX番号のバリデーションヘルパー
 * 空文字は許容（任意項目のため）
 * @param errorMessage - 形式エラー時のメッセージ
 * @param maxLengthMessage - 文字数超過時のメッセージ
 */
const phoneOrFaxSchema = (errorMessage: string, maxLengthMessage: string) =>
  z
    .string()
    .max(20, maxLengthMessage)
    .refine((val) => val === '' || PHONE_FAX_REGEX.test(val), {
      message: errorMessage,
    })
    .nullable()
    .optional();

/**
 * メールアドレスのバリデーションスキーマ
 * 空文字は許容（任意項目のため）
 * Requirements: 4.6, 4.7, 4.8
 */
const emailSchema = z
  .string()
  .max(254, COMPANY_INFO_VALIDATION_MESSAGES.EMAIL_TOO_LONG)
  .refine(
    (val) => {
      if (val === '') return true; // 空文字は許容
      // 簡易的なメールアドレス形式チェック
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val);
    },
    { message: COMPANY_INFO_VALIDATION_MESSAGES.EMAIL_INVALID }
  )
  .nullable()
  .optional();

/**
 * 適格請求書発行事業者登録番号のバリデーションスキーマ
 * 空文字は許容（任意項目のため）
 * Requirements: 4.9, 4.10
 */
const invoiceRegistrationNumberSchema = z
  .string()
  .refine((val) => val === '' || INVOICE_REGISTRATION_NUMBER_REGEX.test(val), {
    message: COMPANY_INFO_VALIDATION_MESSAGES.INVOICE_REGISTRATION_NUMBER_INVALID,
  })
  .nullable()
  .optional();

/**
 * 自社情報更新用スキーマ
 * 自社情報は1件のみなので、作成・更新は同じスキーマを使用
 *
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9, 4.10
 */
export const updateCompanyInfoSchema = z.object({
  // 必須フィールド
  companyName: z
    .string()
    .min(1, COMPANY_INFO_VALIDATION_MESSAGES.COMPANY_NAME_REQUIRED)
    .max(200, COMPANY_INFO_VALIDATION_MESSAGES.COMPANY_NAME_TOO_LONG),

  address: z
    .string()
    .min(1, COMPANY_INFO_VALIDATION_MESSAGES.ADDRESS_REQUIRED)
    .max(500, COMPANY_INFO_VALIDATION_MESSAGES.ADDRESS_TOO_LONG),

  representative: z
    .string()
    .min(1, COMPANY_INFO_VALIDATION_MESSAGES.REPRESENTATIVE_REQUIRED)
    .max(100, COMPANY_INFO_VALIDATION_MESSAGES.REPRESENTATIVE_TOO_LONG),

  // 任意フィールド
  phone: phoneOrFaxSchema(
    COMPANY_INFO_VALIDATION_MESSAGES.PHONE_INVALID,
    COMPANY_INFO_VALIDATION_MESSAGES.PHONE_TOO_LONG
  ),

  fax: phoneOrFaxSchema(
    COMPANY_INFO_VALIDATION_MESSAGES.FAX_INVALID,
    COMPANY_INFO_VALIDATION_MESSAGES.FAX_TOO_LONG
  ),

  email: emailSchema,

  invoiceRegistrationNumber: invoiceRegistrationNumberSchema,

  // 楽観的排他制御用バージョン（オプショナル: 新規作成時は不要）
  version: z.number().int().min(0, COMPANY_INFO_VALIDATION_MESSAGES.VERSION_INVALID).optional(),
});

/**
 * 自社情報更新入力の型
 */
export type UpdateCompanyInfoInput = z.infer<typeof updateCompanyInfoSchema>;
