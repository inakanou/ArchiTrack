/**
 * @fileoverview 現場調査用バリデーションスキーマ
 *
 * Requirements:
 * - 1.1: プロジェクトに紐付く新規現場調査レコードを作成する
 * - 1.6: プロジェクトが存在しない場合、現場調査の作成を許可しない
 *
 * @module schemas/site-survey
 */

import { z } from 'zod';

/**
 * バリデーションエラーメッセージ定数
 */
export const SITE_SURVEY_VALIDATION_MESSAGES = {
  // プロジェクトID
  PROJECT_ID_REQUIRED: 'プロジェクトIDは必須です',
  PROJECT_ID_INVALID_UUID: 'プロジェクトIDの形式が不正です',

  // 現場調査名
  NAME_REQUIRED: '現場調査名は必須です',
  NAME_TOO_LONG: '現場調査名は200文字以内で入力してください',

  // 調査日
  SURVEY_DATE_REQUIRED: '調査日は必須です',
  SURVEY_DATE_INVALID: '調査日の形式が不正です',

  // メモ
  MEMO_TOO_LONG: 'メモは2000文字以内で入力してください',

  // 現場調査ID
  SURVEY_ID_REQUIRED: '現場調査IDは必須です',
  SURVEY_ID_INVALID_UUID: '現場調査IDの形式が不正です',
} as const;

/**
 * UUIDバリデーション用正規表現
 */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * 日付文字列バリデーション（YYYY-MM-DD形式）
 */
const dateStringSchema = z.string().refine(
  (val) => {
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(val)) return false;
    const date = new Date(val);
    return !isNaN(date.getTime());
  },
  { message: SITE_SURVEY_VALIDATION_MESSAGES.SURVEY_DATE_INVALID }
);

/**
 * 現場調査作成用スキーマ
 *
 * Requirements:
 * - 1.1: プロジェクトに紐付く新規現場調査レコードを作成する
 */
export const createSiteSurveySchema = z.object({
  projectId: z
    .string()
    .min(1, SITE_SURVEY_VALIDATION_MESSAGES.PROJECT_ID_REQUIRED)
    .regex(UUID_REGEX, SITE_SURVEY_VALIDATION_MESSAGES.PROJECT_ID_INVALID_UUID),

  name: z
    .string()
    .min(1, SITE_SURVEY_VALIDATION_MESSAGES.NAME_REQUIRED)
    .max(200, SITE_SURVEY_VALIDATION_MESSAGES.NAME_TOO_LONG)
    .refine((val) => val.trim().length > 0, {
      message: SITE_SURVEY_VALIDATION_MESSAGES.NAME_REQUIRED,
    }),

  surveyDate: dateStringSchema,

  memo: z.string().max(2000, SITE_SURVEY_VALIDATION_MESSAGES.MEMO_TOO_LONG).nullable().optional(),
});

/**
 * 現場調査作成入力の型
 */
export type CreateSiteSurveyInput = z.infer<typeof createSiteSurveySchema>;

/**
 * 現場調査更新用スキーマ
 * すべてのフィールドがオプショナル
 */
export const updateSiteSurveySchema = z.object({
  name: z
    .string()
    .min(1, SITE_SURVEY_VALIDATION_MESSAGES.NAME_REQUIRED)
    .max(200, SITE_SURVEY_VALIDATION_MESSAGES.NAME_TOO_LONG)
    .refine((val) => val.trim().length > 0, {
      message: SITE_SURVEY_VALIDATION_MESSAGES.NAME_REQUIRED,
    })
    .optional(),

  surveyDate: dateStringSchema.optional(),

  memo: z.string().max(2000, SITE_SURVEY_VALIDATION_MESSAGES.MEMO_TOO_LONG).nullable().optional(),
});

/**
 * 現場調査更新入力の型
 */
export type UpdateSiteSurveyInput = z.infer<typeof updateSiteSurveySchema>;

/**
 * 現場調査IDパラメータ用スキーマ
 */
export const siteSurveyIdParamSchema = z.object({
  id: z
    .string()
    .min(1, SITE_SURVEY_VALIDATION_MESSAGES.SURVEY_ID_REQUIRED)
    .regex(UUID_REGEX, SITE_SURVEY_VALIDATION_MESSAGES.SURVEY_ID_INVALID_UUID),
});

/**
 * 現場調査IDパラメータの型
 */
export type SiteSurveyIdParam = z.infer<typeof siteSurveyIdParamSchema>;

/**
 * プロジェクトIDパラメータ用スキーマ（一覧取得用）
 */
export const projectIdParamSchema = z.object({
  projectId: z
    .string()
    .min(1, SITE_SURVEY_VALIDATION_MESSAGES.PROJECT_ID_REQUIRED)
    .regex(UUID_REGEX, SITE_SURVEY_VALIDATION_MESSAGES.PROJECT_ID_INVALID_UUID),
});

/**
 * プロジェクトIDパラメータの型
 */
export type ProjectIdParam = z.infer<typeof projectIdParamSchema>;
