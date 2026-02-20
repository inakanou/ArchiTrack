/**
 * @fileoverview 受領見積書・ステータス管理バリデーションスキーマ（改訂版: Task 20.2）
 *
 * Requirements:
 * - 11.10: バリデーションエラー表示
 * - 11.22: ファイルまたは明細行データのいずれかが必須
 * - 12.9: ステータス遷移のバリデーション
 *
 * Task 13.1: Zodバリデーションスキーマの定義
 * Task 20.2: contentType/textContent廃止対応
 *
 * @module schemas/received-quotation
 */

import { z } from 'zod';

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
 * 受領見積書作成スキーマ（改訂版）
 *
 * Requirements: 11.3, 11.4, 11.6, 11.10, 11.22
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

  // Task 61.1: NET金額を受領見積書レベルに追加（Requirements: 28.7, 28.10）
  netAmount: z.number().nullable().optional(),
});

/**
 * 受領見積書作成入力型
 */
export type CreateReceivedQuotationInput = z.infer<typeof createReceivedQuotationSchema>;

/**
 * 受領見積書更新スキーマ（改訂版）
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

  removeFile: z.boolean().optional(),

  // Task 61.1: NET金額を受領見積書レベルに追加（Requirements: 28.7, 28.10）
  netAmount: z.number().nullable().optional(),

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

/**
 * 明細行バリデーションエラーメッセージ定数
 * Task 21.2: 明細行バリデーションスキーマ対応
 *
 * Requirements: 11.10, 11.22, 11.23, 11.24
 */
export const LINE_ITEM_VALIDATION_MESSAGES = {
  NAME_REQUIRED: '明細行の名称は必須です',
  SORT_ORDER_REQUIRED: '表示順序は必須です',
  SORT_ORDER_MIN: '表示順序は0以上の整数で指定してください',
  QUANTITY_INVALID: '数量は数値で入力してください',
  UNIT_PRICE_INVALID: '単価は数値で入力してください',
  AMOUNT_INVALID: '金額は数値で入力してください',
  LINE_ITEMS_INVALID_JSON: '明細行データのJSON形式が不正です',
  FILE_OR_LINE_ITEMS_REQUIRED: 'ファイルのアップロードまたは明細行データの入力が必要です',
} as const;

/**
 * 明細行データバリデーションスキーマ
 *
 * Requirements: 11.10 - 各フィールドのバリデーション
 * Task 21.2: 明細行データのバリデーションスキーマを定義
 */
export const lineItemSchema = z.object({
  name: z.string().min(1, LINE_ITEM_VALIDATION_MESSAGES.NAME_REQUIRED),
  sortOrder: z.number().int().min(0, LINE_ITEM_VALIDATION_MESSAGES.SORT_ORDER_MIN),
  customCategory: z.string().nullish(),
  workType: z.string().nullish(),
  specification: z.string().nullish(),
  unit: z.string().nullish(),
  quantity: z.number({ message: LINE_ITEM_VALIDATION_MESSAGES.QUANTITY_INVALID }).nullish(),
  unitPrice: z.number({ message: LINE_ITEM_VALIDATION_MESSAGES.UNIT_PRICE_INVALID }).nullish(),
  amount: z.number({ message: LINE_ITEM_VALIDATION_MESSAGES.AMOUNT_INVALID }).nullish(),
  // Task 61.1: netAmountは受領見積書レベルに移動（Requirements: 28.5）
  remarks: z.string().nullish(),
});

/**
 * 明細行データ型
 */
export type LineItemInput = z.infer<typeof lineItemSchema>;

/**
 * 明細行データ配列バリデーションスキーマ
 *
 * Task 21.2: 明細行データ（JSON配列）のバリデーションスキーマ
 */
export const lineItemsArraySchema = z.array(lineItemSchema);

/**
 * 明細行データ配列型
 */
export type LineItemsArrayInput = z.infer<typeof lineItemsArraySchema>;

/**
 * multipart内のlineItemsフィールド（JSON文字列）をパース・検証する
 *
 * Requirements: 11.22 - multipart内のlineItemsフィールドのパース・検証
 * Task 21.2: multipart内のlineItemsフィールド（JSON文字列）のパース・検証を実装
 *
 * @param lineItemsJson - JSON文字列（undefined、空文字列の場合はundefinedを返す）
 * @returns パース・検証済みの明細行データ配列、またはundefined
 * @throws Error - JSONパースまたはバリデーションに失敗した場合
 */
export function parseLineItemsFromMultipart(
  lineItemsJson: string | undefined
): LineItemInput[] | undefined {
  if (lineItemsJson === undefined || lineItemsJson === '') {
    return undefined;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(lineItemsJson);
  } catch {
    throw new Error(LINE_ITEM_VALIDATION_MESSAGES.LINE_ITEMS_INVALID_JSON);
  }

  const result = lineItemsArraySchema.safeParse(parsed);
  if (!result.success) {
    const firstIssue = result.error.issues[0];
    throw new Error(firstIssue?.message ?? LINE_ITEM_VALIDATION_MESSAGES.LINE_ITEMS_INVALID_JSON);
  }

  return result.data;
}

/**
 * ファイルまたは明細行データのいずれか一方が必須のバリデーション
 *
 * Requirements: 11.22, 11.24
 * Task 21.2: ファイルも明細行もない場合のエラーバリデーション
 *
 * @param hasFile - ファイルが存在するか
 * @param lineItems - 明細行データ配列
 * @throws Error - ファイルも明細行もない場合
 */
export function validateFileOrLineItemsRequired(
  hasFile: boolean,
  lineItems: LineItemInput[] | undefined
): void {
  const hasLineItems = lineItems !== undefined && lineItems.length > 0;

  if (!hasFile && !hasLineItems) {
    throw new Error(LINE_ITEM_VALIDATION_MESSAGES.FILE_OR_LINE_ITEMS_REQUIRED);
  }
}
