/**
 * @fileoverview 受領見積書・ステータス管理バリデーションスキーマ
 *
 * Requirements:
 * - 11.10: バリデーションエラー表示
 * - 12.9: ステータス遷移のバリデーション
 *
 * Task 13.1: Zodバリデーションスキーマの定義
 *
 * @module schemas/received-quotation
 */

import { z } from 'zod';

/**
 * コンテンツタイプのEnum型
 * Requirements: 11.7
 */
export const CONTENT_TYPES = ['TEXT', 'FILE'] as const;
export type ContentType = (typeof CONTENT_TYPES)[number];

/**
 * 見積依頼ステータスのEnum型
 * Requirements: 12.2
 */
export const ESTIMATE_REQUEST_STATUSES = [
  'BEFORE_REQUEST',
  'REQUESTED',
  'QUOTATION_RECEIVED',
] as const;
export type EstimateRequestStatus = (typeof ESTIMATE_REQUEST_STATUSES)[number];

/**
 * バリデーションエラーメッセージ定数
 * 日本語メッセージを定義
 */
export const RECEIVED_QUOTATION_VALIDATION_MESSAGES = {
  // 受領見積書名
  NAME_REQUIRED: '受領見積書名は必須です',
  NAME_TOO_LONG: '受領見積書名は200文字以内で入力してください',

  // 提出日
  SUBMITTED_AT_REQUIRED: '提出日は必須です',
  SUBMITTED_AT_INVALID: '提出日の形式が不正です',

  // コンテンツタイプ
  CONTENT_TYPE_INVALID: '無効なコンテンツタイプです',

  // テキスト内容
  TEXT_CONTENT_REQUIRED: 'テキスト内容は必須です',

  // ファイル
  FILE_REQUIRED: 'ファイルは必須です',
  FILE_TYPE_INVALID:
    'このファイル形式は許可されていません。PDF、Excel、または画像ファイルをアップロードしてください',
  FILE_SIZE_EXCEEDED: 'ファイルサイズが上限を超えています。最大サイズ: 10MB',

  // 受領見積書ID
  ID_REQUIRED: '受領見積書IDは必須です',
  ID_INVALID_UUID: '受領見積書IDの形式が不正です',

  // 日時
  DATETIME_INVALID: '日時の形式が不正です',

  // ステータス
  STATUS_INVALID: '無効なステータスです',
  STATUS_REQUIRED: 'ステータスは必須です',
} as const;

/**
 * UUIDバリデーション用正規表現
 */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * 受領見積書作成スキーマ
 *
 * Requirements: 11.3, 11.4, 11.5, 11.6, 11.7, 11.10
 */
export const createReceivedQuotationSchema = z.object({
  name: z
    .string()
    .min(1, RECEIVED_QUOTATION_VALIDATION_MESSAGES.NAME_REQUIRED)
    .max(200, RECEIVED_QUOTATION_VALIDATION_MESSAGES.NAME_TOO_LONG)
    .refine((val) => val.trim().length > 0, {
      message: RECEIVED_QUOTATION_VALIDATION_MESSAGES.NAME_REQUIRED,
    }),

  submittedAt: z
    .string()
    .datetime({ message: RECEIVED_QUOTATION_VALIDATION_MESSAGES.SUBMITTED_AT_INVALID }),

  contentType: z.enum(CONTENT_TYPES, RECEIVED_QUOTATION_VALIDATION_MESSAGES.CONTENT_TYPE_INVALID),

  textContent: z.string().optional(),
});

/**
 * 受領見積書作成入力型
 */
export type CreateReceivedQuotationInput = z.infer<typeof createReceivedQuotationSchema>;

/**
 * 受領見積書更新スキーマ
 * expectedUpdatedAtは楽観的排他制御用
 *
 * Requirements: 11.15, 11.16
 */
export const updateReceivedQuotationSchema = z.object({
  name: z
    .string()
    .min(1, RECEIVED_QUOTATION_VALIDATION_MESSAGES.NAME_REQUIRED)
    .max(200, RECEIVED_QUOTATION_VALIDATION_MESSAGES.NAME_TOO_LONG)
    .refine((val) => val.trim().length > 0, {
      message: RECEIVED_QUOTATION_VALIDATION_MESSAGES.NAME_REQUIRED,
    })
    .optional(),

  submittedAt: z
    .string()
    .datetime({ message: RECEIVED_QUOTATION_VALIDATION_MESSAGES.SUBMITTED_AT_INVALID })
    .optional(),

  contentType: z
    .enum(CONTENT_TYPES, RECEIVED_QUOTATION_VALIDATION_MESSAGES.CONTENT_TYPE_INVALID)
    .optional(),

  textContent: z.string().optional(),

  expectedUpdatedAt: z
    .string()
    .datetime({ message: RECEIVED_QUOTATION_VALIDATION_MESSAGES.DATETIME_INVALID }),
});

/**
 * 受領見積書更新入力型
 */
export type UpdateReceivedQuotationInput = z.infer<typeof updateReceivedQuotationSchema>;

/**
 * 受領見積書IDパラメータスキーマ
 */
export const receivedQuotationIdParamSchema = z.object({
  id: z
    .string()
    .min(1, RECEIVED_QUOTATION_VALIDATION_MESSAGES.ID_REQUIRED)
    .regex(UUID_REGEX, RECEIVED_QUOTATION_VALIDATION_MESSAGES.ID_INVALID_UUID),
});

/**
 * 受領見積書IDパラメータ型
 */
export type ReceivedQuotationIdParam = z.infer<typeof receivedQuotationIdParamSchema>;

/**
 * 見積依頼IDパラメータスキーマ（受領見積書用）
 */
export const estimateRequestIdForQuotationSchema = z.object({
  id: z.string().min(1, '見積依頼IDは必須です').regex(UUID_REGEX, '見積依頼IDの形式が不正です'),
});

/**
 * 削除リクエストボディスキーマ（楽観的排他制御用）
 */
export const deleteReceivedQuotationBodySchema = z.object({
  updatedAt: z
    .string()
    .datetime({ message: RECEIVED_QUOTATION_VALIDATION_MESSAGES.DATETIME_INVALID }),
});

/**
 * 削除リクエストボディ型
 */
export type DeleteReceivedQuotationBody = z.infer<typeof deleteReceivedQuotationBodySchema>;

/**
 * ステータス遷移リクエストスキーマ
 *
 * Requirements: 12.9
 */
export const statusTransitionSchema = z.object({
  status: z.enum(ESTIMATE_REQUEST_STATUSES, RECEIVED_QUOTATION_VALIDATION_MESSAGES.STATUS_INVALID),
});

/**
 * ステータス遷移リクエスト型
 */
export type StatusTransitionInput = z.infer<typeof statusTransitionSchema>;

/**
 * 許可されるファイルMIMEタイプ
 * Requirements: 11.8
 */
export const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/jpeg',
  'image/png',
  'image/jpg',
] as const;

/**
 * ファイルサイズ上限（10MB）
 * Requirements: 11.9
 */
export const MAX_FILE_SIZE = 10 * 1024 * 1024;
