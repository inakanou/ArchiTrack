/**
 * @fileoverview プロジェクト用バリデーションスキーマ
 *
 * Requirements:
 * - 13.1: プロジェクト名は必須かつ1〜255文字
 * - 13.2: 取引先を任意とする（取引先IDまたは未設定）— tradingPartnerId は nullable かつ optional
 * - 13.4: 営業担当者は必須
 * - 13.5: 営業担当者の値がadmin以外の有効なユーザーIDであることを検証（サービス層で検証）
 * - 13.6: 工事担当者は任意
 * - 13.7: 工事担当者が指定された場合、admin以外の有効なユーザーIDであることを検証（サービス層で検証）
 * - 13.8: 現場住所は任意かつ最大500文字
 * - 13.9: 概要は任意かつ最大5000文字
 * - 13.10: フロントエンドでバリデーションエラーが発生する場合、エラーメッセージを即座に表示
 * - 13.11: バックエンドでバリデーションエラーが発生する場合、エラーレスポンスとエラー詳細を返却
 *   （条文はHTTPステータスを定めていない。実装が 400 を返す箇所は
 *   backend/src/routes/projects.routes.ts の ProjectValidationError 分岐であり、
 *   条文の要求ではなく実装の選択である）
 *
 * 従前この一覧が掲げていた「22.1-22.5: 取引先連携」は、現行の要件22 の 1〜5 が
 * 顧客候補のドロップダウン・オートコンプリート（UIの候補提示・部分一致・フリガナ検索）で
 * あり、本ファイルが担う tradingPartnerId の形式検証とは対応しない。取引先を任意の
 * 外部キー参照として扱う根拠は要件13 の 2 であるため、そちらへ名乗り直した。
 *
 * 上の一覧に要件13 の 3（取引先が指定された場合に取引先IDが有効な取引先マスタのIDで
 * あることを検証する）を挙げていないのは、本番コードに当該の検証が無いためである。
 * 本スキーマの tradingPartnerId が課すのは UUID の形式検証だけで
 * （`.regex(UUID_REGEX, TRADING_PARTNER_ID_INVALID_UUID)`）、取引先マスタに当該IDが
 * 実在するかは見ていない。サービス層にも実在確認は無く、
 * `ProjectService.createProject`（backend/src/services/project.service.ts）は
 * 受け取った値をそのまま `tradingPartnerId: input.tradingPartnerId || null` として
 * 書き込む。同ファイルが `ProjectValidationError` を投げるのは
 * `validateAssignableUser` の2箇所だけであり、いずれも担当者ユーザーの実在と
 * admin 判定であって取引先とは無関係である。作成経路で実在しない取引先IDを弾くのは
 * `Project.tradingPartner`（backend/prisma/schema.prisma の
 * `@relation(fields: [tradingPartnerId], references: [id])`）が張る
 * データベースの外部キー制約だけで、アプリケーション層の検証ではない。
 * よって要件13 の 3 は事実上未実装であり、本ファイルでは被覆として名乗らない。
 */

import { z } from 'zod';
import { PROJECT_STATUSES, type ProjectStatus } from '../types/project.types.js';

/**
 * バリデーションエラーメッセージ定数
 * 日本語メッセージを定義
 */
export const PROJECT_VALIDATION_MESSAGES = {
  // プロジェクト名
  NAME_REQUIRED: 'プロジェクト名は必須です',
  NAME_TOO_LONG: 'プロジェクト名は255文字以内で入力してください',

  // 取引先ID
  TRADING_PARTNER_ID_INVALID_UUID: '取引先IDの形式が不正です',

  // 営業担当者
  SALES_PERSON_REQUIRED: '営業担当者は必須です',
  SALES_PERSON_INVALID_UUID: '営業担当者IDの形式が不正です',

  // 工事担当者
  CONSTRUCTION_PERSON_INVALID_UUID: '工事担当者IDの形式が不正です',

  // 現場住所
  SITE_ADDRESS_TOO_LONG: '現場住所は500文字以内で入力してください',

  // 概要
  DESCRIPTION_TOO_LONG: '概要は5000文字以内で入力してください',

  // 検索
  SEARCH_TOO_SHORT: '2文字以上で入力してください',

  // ステータス
  STATUS_INVALID: '無効なステータスです',

  // 日付
  DATE_INVALID: '日付の形式が不正です',

  // ページネーション
  PAGE_MIN: 'ページ番号は1以上である必要があります',
  LIMIT_MIN: '表示件数は1以上である必要があります',
  LIMIT_MAX: '表示件数は100以下である必要があります',

  // ソート
  SORT_FIELD_INVALID: '無効なソートフィールドです',
  ORDER_INVALID: '無効なソート順序です',

  // プロジェクトID
  PROJECT_ID_REQUIRED: 'プロジェクトIDは必須です',
  PROJECT_ID_INVALID_UUID: 'プロジェクトIDの形式が不正です',
} as const;

/**
 * ソート可能フィールド
 *
 * Task 21.2: ソートフィールドの拡張
 * - 'id'を削除
 * - 'tradingPartnerId'を'customerName'に変更（tradingPartner.nameへのエイリアス）
 * - 'salesPersonName'を追加（salesPerson.displayNameへのエイリアス）
 * - 'constructionPersonName'を追加（constructionPerson.displayNameへのエイリアス）
 *
 * Requirements: 6.5
 */
export const SORTABLE_FIELDS = [
  'name',
  'customerName',
  'salesPersonName',
  'constructionPersonName',
  'status',
  'createdAt',
  'updatedAt',
] as const;
export type SortableField = (typeof SORTABLE_FIELDS)[number];

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
 * 日付文字列バリデーション（ISO8601形式またはYYYY-MM-DD形式）
 */
const dateStringSchema = z.string().refine(
  (val) => {
    const date = new Date(val);
    return !isNaN(date.getTime());
  },
  { message: PROJECT_VALIDATION_MESSAGES.DATE_INVALID }
);

/**
 * ステータス文字列からステータス配列への変換
 * 単一ステータスまたはカンマ区切りのステータスを受け入れる
 */
const statusFilterSchema = z.string().transform((val, ctx) => {
  const statuses = val.split(',').map((s) => s.trim());
  const invalidStatuses = statuses.filter((s) => !PROJECT_STATUSES.includes(s as ProjectStatus));
  if (invalidStatuses.length > 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: PROJECT_VALIDATION_MESSAGES.STATUS_INVALID,
    });
    return z.NEVER;
  }
  return statuses as ProjectStatus[];
});

/**
 * プロジェクト作成用スキーマ
 * Zod 4.x対応: required_errorの代わりにmin(1)でメッセージを指定
 */
export const createProjectSchema = z.object({
  name: z
    .string()
    .min(1, PROJECT_VALIDATION_MESSAGES.NAME_REQUIRED)
    .max(255, PROJECT_VALIDATION_MESSAGES.NAME_TOO_LONG)
    .refine((val) => val.trim().length > 0, {
      message: PROJECT_VALIDATION_MESSAGES.NAME_REQUIRED,
    }),

  tradingPartnerId: z
    .string()
    .regex(UUID_REGEX, PROJECT_VALIDATION_MESSAGES.TRADING_PARTNER_ID_INVALID_UUID)
    .nullable()
    .optional(),

  salesPersonId: z
    .string()
    .min(1, PROJECT_VALIDATION_MESSAGES.SALES_PERSON_REQUIRED)
    .regex(UUID_REGEX, PROJECT_VALIDATION_MESSAGES.SALES_PERSON_INVALID_UUID),

  constructionPersonId: z
    .string()
    .regex(UUID_REGEX, PROJECT_VALIDATION_MESSAGES.CONSTRUCTION_PERSON_INVALID_UUID)
    .nullable()
    .optional(),

  siteAddress: z
    .string()
    .max(500, PROJECT_VALIDATION_MESSAGES.SITE_ADDRESS_TOO_LONG)
    .nullable()
    .optional(),

  description: z
    .string()
    .max(5000, PROJECT_VALIDATION_MESSAGES.DESCRIPTION_TOO_LONG)
    .nullable()
    .optional(),
});

/**
 * プロジェクト作成入力の型
 */
export type CreateProjectInput = z.infer<typeof createProjectSchema>;

/**
 * プロジェクト更新用スキーマ
 * すべてのフィールドがオプショナル
 */
export const updateProjectSchema = z.object({
  name: z
    .string()
    .min(1, PROJECT_VALIDATION_MESSAGES.NAME_REQUIRED)
    .max(255, PROJECT_VALIDATION_MESSAGES.NAME_TOO_LONG)
    .refine((val) => val.trim().length > 0, {
      message: PROJECT_VALIDATION_MESSAGES.NAME_REQUIRED,
    })
    .optional(),

  tradingPartnerId: z
    .string()
    .regex(UUID_REGEX, PROJECT_VALIDATION_MESSAGES.TRADING_PARTNER_ID_INVALID_UUID)
    .nullable()
    .optional(),

  salesPersonId: z
    .string()
    .regex(UUID_REGEX, PROJECT_VALIDATION_MESSAGES.SALES_PERSON_INVALID_UUID)
    .optional(),

  constructionPersonId: z
    .string()
    .regex(UUID_REGEX, PROJECT_VALIDATION_MESSAGES.CONSTRUCTION_PERSON_INVALID_UUID)
    .nullable()
    .optional(),

  siteAddress: z
    .string()
    .max(500, PROJECT_VALIDATION_MESSAGES.SITE_ADDRESS_TOO_LONG)
    .nullable()
    .optional(),

  description: z
    .string()
    .max(5000, PROJECT_VALIDATION_MESSAGES.DESCRIPTION_TOO_LONG)
    .nullable()
    .optional(),
});

/**
 * プロジェクト更新入力の型
 */
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;

/**
 * プロジェクトフィルタ用スキーマ（クエリパラメータ）
 */
export const projectFilterSchema = z.object({
  search: z.string().min(2, PROJECT_VALIDATION_MESSAGES.SEARCH_TOO_SHORT).optional(),

  status: statusFilterSchema.optional(),

  createdFrom: dateStringSchema.optional(),

  createdTo: dateStringSchema.optional(),

  tradingPartnerId: z
    .string()
    .regex(UUID_REGEX, PROJECT_VALIDATION_MESSAGES.TRADING_PARTNER_ID_INVALID_UUID)
    .optional(),

  // 新規追加: 終端ステータス（完了・中止・失注）を除外するフラグ
  // Requirements: 2.7, 2.8
  excludeTerminalStatuses: z
    .enum(['true', 'false'])
    .transform((val) => val === 'true')
    .optional(),
});

/**
 * プロジェクトフィルタ入力の型
 */
export type ProjectFilterInput = z.infer<typeof projectFilterSchema>;

/**
 * ページネーション用スキーマ（クエリパラメータ）
 * クエリパラメータは文字列として送信されるため、coerceで数値に変換
 */
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1, PROJECT_VALIDATION_MESSAGES.PAGE_MIN).default(1),

  limit: z.coerce
    .number()
    .int()
    .min(1, PROJECT_VALIDATION_MESSAGES.LIMIT_MIN)
    .max(100, PROJECT_VALIDATION_MESSAGES.LIMIT_MAX)
    .default(100), // Requirements: 3.1 - デフォルト表示件数を100件に変更
});

/**
 * ページネーション入力の型
 */
export type PaginationInput = z.infer<typeof paginationSchema>;

/**
 * ソート用スキーマ（クエリパラメータ）
 * Zod 4.x対応: errorMapの代わりにmessageプロパティを使用
 */
export const sortSchema = z.object({
  sort: z
    .enum(SORTABLE_FIELDS, PROJECT_VALIDATION_MESSAGES.SORT_FIELD_INVALID)
    .default('updatedAt'),

  order: z.enum(SORT_ORDERS, PROJECT_VALIDATION_MESSAGES.ORDER_INVALID).default('desc'),
});

/**
 * ソート入力の型
 */
export type SortInput = z.infer<typeof sortSchema>;

/**
 * ステータス変更用スキーマ
 * Zod 4.x対応: errorMapの代わりにmessageプロパティを使用
 */
export const statusChangeSchema = z.object({
  status: z.enum(PROJECT_STATUSES, PROJECT_VALIDATION_MESSAGES.STATUS_INVALID),

  reason: z.string().nullable().optional(),
});

/**
 * ステータス変更入力の型
 */
export type StatusChangeInput = z.infer<typeof statusChangeSchema>;

/**
 * プロジェクトIDパラメータ用スキーマ
 * Zod 4.x対応: required_errorの代わりにmin(1)でメッセージを指定
 */
export const projectIdParamSchema = z.object({
  id: z
    .string()
    .min(1, PROJECT_VALIDATION_MESSAGES.PROJECT_ID_REQUIRED)
    .regex(UUID_REGEX, PROJECT_VALIDATION_MESSAGES.PROJECT_ID_INVALID_UUID),
});

/**
 * プロジェクトIDパラメータの型
 */
export type ProjectIdParam = z.infer<typeof projectIdParamSchema>;

/**
 * プロジェクト一覧取得用クエリスキーマ（フィルタ + ページネーション + ソート）
 */
export const projectListQuerySchema = projectFilterSchema.merge(paginationSchema).merge(sortSchema);

/**
 * プロジェクト一覧取得用クエリの型
 */
export type ProjectListQuery = z.infer<typeof projectListQuerySchema>;
