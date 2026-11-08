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

  // 業者名（43.8・44.1。タスク112.2）
  VENDOR_NAME_REQUIRED: '業者名を入力してください',
  VENDOR_NAME_TOO_LONG: '業者名は200文字以内で入力してください',
  TRADING_PARTNER_ID_INVALID: '取引先IDの形式が不正です',

  // 見積の情報（46.1〜46.3・46.6。タスク112.2）
  QUOTE_NUMBER_TOO_LONG: '見積番号は100文字以内で入力してください',
  OVERALL_CONDITIONS_TOO_LONG: '見積全体の条件は2000文字以内で入力してください',
  SITE_LOCATION_TOO_LONG: '場所は100文字以内で入力してください',
  USE_TYPE_TOO_LONG: '用途は100文字以内で入力してください',
  WORK_CONDITIONS_TOO_LONG: '作業条件は200文字以内で入力してください',
  CONSTRUCTION_KIND_INVALID: '改修／新営の区分が不正です',
  CONSTRUCTION_PRICE_INVALID: '工事価格は0以上の整数（円）で入力してください',
  DISTANCE_KM_INVALID: '距離は0以上の数値を小数第1位までで入力してください',
  ADOPTION_INVALID: '採否が不正です',
  CONFIRMED_AMOUNT_INVALID: '確定金額は0以上の整数（円）で入力してください',
  READING_STATUS_INVALID: '読取の確認の状態が不正です',

  // 見積の区別（48.2。タスク112.2）
  QUOTE_DISCRIMINATOR_TOO_LONG: '見積の区別は100文字以内で入力してください',
  QUOTE_DISCRIMINATOR_WHITESPACE: '見積の区別の前後に空白を入れないでください',
} as const;

/**
 * UUIDバリデーション用正規表現
 */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** 改修／新営の区分（46.2） */
export const RECEIVED_QUOTATION_CONSTRUCTION_KINDS = ['RENOVATION', 'NEW_CONSTRUCTION'] as const;
/** 採否（46.3） */
export const RECEIVED_QUOTATION_ADOPTIONS = ['ADOPTED', 'REJECTED', 'UNKNOWN'] as const;
/** 読取の確認の状態（46.6） */
export const RECEIVED_QUOTATION_READING_STATUSES = ['UNCONFIRMED', 'CONFIRMED'] as const;

/** 整数円の上限（`Decimal(15,0)` の 15 桁） */
const MAX_YEN_AMOUNT = 999_999_999_999_999;
/** 距離の上限（`Decimal(6,1)`） */
const MAX_DISTANCE_KM = 99_999.9;

/**
 * FormData の文字の欄を受ける前処理。欄が無い（undefined）は「変えない」、空の文字は「消す」（null）
 */
const emptyStringToNull = (val: unknown): unknown => (val === '' ? null : val);

/**
 * FormData の数の欄を受ける前処理。空・空白だけは null、文字は数に直す（数でない文字は NaN として拒まれる）
 */
const formNumber = (val: unknown): unknown => {
  if (val === undefined) return undefined;
  if (val === null || val === 'null') return null;
  if (typeof val === 'string') return val.trim() === '' ? null : Number(val);
  return val;
};

const optionalText = (max: number, message: string) =>
  z.preprocess(emptyStringToNull, z.string().max(max, message).nullish());

const optionalYenAmount = (message: string) =>
  z.preprocess(
    formNumber,
    z.number(message).int(message).min(0, message).max(MAX_YEN_AMOUNT, message).nullish()
  );

/**
 * 受領見積書の台帳の項目（業者名・取引先・見積の情報・読取の確認・見積の区別）の検証
 *
 * 登録と更新で共通。どれも任意で、欄が無いときは undefined（更新では変えない）、空の文字は null（消す）とする。
 * 案件の文脈で業者名を必須とすること（43.8）と、見積依頼の文脈で業者名を無視すること（44.3）は
 * 経路・サービスが行う（タスク113.2・114.1）。
 *
 * 根拠: 44.1, 46.1, 46.2, 46.3, 46.6, 48.2（タスク112.2）
 */
export const receivedQuotationLedgerFieldsShape = {
  vendorName: z
    .string()
    .trim()
    .min(1, RECEIVED_QUOTATION_VALIDATION_MESSAGES.VENDOR_NAME_REQUIRED)
    .max(200, RECEIVED_QUOTATION_VALIDATION_MESSAGES.VENDOR_NAME_TOO_LONG)
    .optional(),
  tradingPartnerId: z.preprocess(
    emptyStringToNull,
    z
      .string()
      .regex(UUID_REGEX, RECEIVED_QUOTATION_VALIDATION_MESSAGES.TRADING_PARTNER_ID_INVALID)
      .nullish()
  ),
  quoteNumber: optionalText(100, RECEIVED_QUOTATION_VALIDATION_MESSAGES.QUOTE_NUMBER_TOO_LONG),
  overallConditions: optionalText(
    2000,
    RECEIVED_QUOTATION_VALIDATION_MESSAGES.OVERALL_CONDITIONS_TOO_LONG
  ),
  siteLocation: optionalText(100, RECEIVED_QUOTATION_VALIDATION_MESSAGES.SITE_LOCATION_TOO_LONG),
  constructionKind: z.preprocess(
    emptyStringToNull,
    z
      .enum(
        RECEIVED_QUOTATION_CONSTRUCTION_KINDS,
        RECEIVED_QUOTATION_VALIDATION_MESSAGES.CONSTRUCTION_KIND_INVALID
      )
      .nullish()
  ),
  useType: optionalText(100, RECEIVED_QUOTATION_VALIDATION_MESSAGES.USE_TYPE_TOO_LONG),
  constructionPrice: optionalYenAmount(
    RECEIVED_QUOTATION_VALIDATION_MESSAGES.CONSTRUCTION_PRICE_INVALID
  ),
  workConditions: optionalText(
    200,
    RECEIVED_QUOTATION_VALIDATION_MESSAGES.WORK_CONDITIONS_TOO_LONG
  ),
  distanceKm: z.preprocess(
    formNumber,
    z
      .number(RECEIVED_QUOTATION_VALIDATION_MESSAGES.DISTANCE_KM_INVALID)
      .min(0, RECEIVED_QUOTATION_VALIDATION_MESSAGES.DISTANCE_KM_INVALID)
      .max(MAX_DISTANCE_KM, RECEIVED_QUOTATION_VALIDATION_MESSAGES.DISTANCE_KM_INVALID)
      .refine((val) => Math.abs(val * 10 - Math.round(val * 10)) < 1e-9, {
        message: RECEIVED_QUOTATION_VALIDATION_MESSAGES.DISTANCE_KM_INVALID,
      })
      .nullish()
  ),
  adoption: z
    .enum(RECEIVED_QUOTATION_ADOPTIONS, RECEIVED_QUOTATION_VALIDATION_MESSAGES.ADOPTION_INVALID)
    .optional(),
  confirmedAmount: optionalYenAmount(
    RECEIVED_QUOTATION_VALIDATION_MESSAGES.CONFIRMED_AMOUNT_INVALID
  ),
  readingStatus: z
    .enum(
      RECEIVED_QUOTATION_READING_STATUSES,
      RECEIVED_QUOTATION_VALIDATION_MESSAGES.READING_STATUS_INVALID
    )
    .optional(),
  quoteDiscriminator: z
    .string()
    .max(100, RECEIVED_QUOTATION_VALIDATION_MESSAGES.QUOTE_DISCRIMINATOR_TOO_LONG)
    .refine((val) => val === val.trim(), {
      message: RECEIVED_QUOTATION_VALIDATION_MESSAGES.QUOTE_DISCRIMINATOR_WHITESPACE,
    })
    .optional(),
};

/**
 * 受領見積書の台帳の項目の検証スキーマ（登録・更新の本文から台帳の項目だけを検証するとき）
 */
export const receivedQuotationLedgerFieldsSchema = z.object(receivedQuotationLedgerFieldsShape);

/**
 * 受領見積書の台帳の項目の入力型（design.md の同章の LedgerFieldsInput に当たる）
 */
export type ReceivedQuotationLedgerFieldsInput = z.infer<
  typeof receivedQuotationLedgerFieldsSchema
>;

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
  // FormData経由では文字列として送信されるため、preprocessで数値に変換
  netAmount: z.preprocess((val) => {
    if (val === null || val === undefined || val === '' || val === 'null') return null;
    return Number(val);
  }, z.number().nullable()),

  // タスク112.2: 台帳の項目（44.1・46.1〜46.3・46.6・48.2）
  ...receivedQuotationLedgerFieldsShape,
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
  // FormData経由では文字列として送信されるため、preprocessで数値に変換
  netAmount: z.preprocess((val) => {
    if (val === null || val === undefined || val === '' || val === 'null') return null;
    return Number(val);
  }, z.number().nullable()),

  expectedUpdatedAt: z
    .string()
    .datetime({ message: RECEIVED_QUOTATION_VALIDATION_MESSAGES.DATETIME_INVALID }),

  // タスク112.2: 台帳の項目（44.1・46.1〜46.3・46.6・48.2）
  ...receivedQuotationLedgerFieldsShape,
});

/**
 * 受領見積書更新入力型
 */
export type UpdateReceivedQuotationInput = z.infer<typeof updateReceivedQuotationSchema>;

/**
 * 受領見積書IDパラメータスキーマ
 *
 * 経路の引数名は `quotationId`（見積依頼の配下の経路の親の引数 `id` と分ける。タスク106.1、42.12）
 */
export const receivedQuotationIdParamSchema = z.object({
  quotationId: z
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
 * 削除リクエストのクエリスキーマ（楽観的排他制御用）
 *
 * 楽観的排他制御の基準時刻はクエリ（`?updatedAt=`）で受け取る。HTTP（RFC 9110）は DELETE の本文に
 * 意味を定めておらず中継で落ちうるため、本文では受け取らない（2026-10-31 の是正。見積依頼の削除と同じ形）。
 */
export const deleteReceivedQuotationQuerySchema = z.object({
  updatedAt: z
    .string()
    .datetime({ message: RECEIVED_QUOTATION_VALIDATION_MESSAGES.DATETIME_INVALID }),
});

/**
 * 削除リクエストのクエリ型
 */
export type DeleteReceivedQuotationQuery = z.infer<typeof deleteReceivedQuotationQuerySchema>;

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

  // タスク112.2: 区分・条件・換算・分類キー・数量表の行のキー・参考の印と理由
  CATEGORY_INVALID: '明細行の区分が不正です',
  CONDITION_TOO_LONG: '条件は500文字以内で入力してください',
  CONVERSION_QUANTITY_INVALID: '換算の数量は数値で入力してください',
  CONVERSION_UNIT_TOO_LONG: '換算の単位は50文字以内で入力してください',
  CONVERSION_UNIT_PRICE_INVALID: '換算の単価は数値で入力してください',
  CONVERSION_BASIS_TOO_LONG: '換算の根拠は500文字以内で入力してください',
  CLASSIFICATION_KEY_TOO_LONG: '分類キーは50文字以内で入力してください',
  QUANTITY_ROW_KEY_TOO_LONG: '数量表の行のキーは1000文字以内で入力してください',
  IS_REFERENCE_INVALID: '参考の印は有か無で指定してください',
  REFERENCE_REASON_TOO_LONG: '参考の理由は200文字以内で入力してください',
  // 以下の3つは requirements.md の逐語（45.4・45.9・46.5）
  DISCOUNT_AMOUNT_POSITIVE: '値引きの金額は0以下で入力してください',
  CONVERSION_INCOMPLETE:
    '換算は数量・単位・単価・根拠をすべて入力してください（数量は0より大きい値）',
  REFERENCE_REASON_WITHOUT_REFERENCE: '参考の理由は参考の印を付けた行にだけ入力できます',
} as const;

/**
 * 明細行の区分（45.1）。表示は直接工事・諸経費・交通費・産廃・値引き・法定福利費・別途
 */
export const LINE_ITEM_CATEGORIES = [
  'DIRECT',
  'OVERHEAD',
  'TRAVEL',
  'WASTE',
  'DISCOUNT',
  'LEGAL_WELFARE',
  'EXCLUDED',
] as const;
export type LineItemCategory = (typeof LINE_ITEM_CATEGORIES)[number];

/**
 * 明細行の換算（45.8）。4 つは全部あるか全部無い（45.9）
 */
export interface LineItemConversion {
  quantity: number;
  unit: string;
  unitPrice: number;
  basis: string;
}

/**
 * 明細行の換算の入力。送られた形は一部だけのこともあるため各欄を任意で受け、
 * 揃っているかは明細行の検証（45.9）で判定する
 */
const lineItemConversionInputSchema = z.object({
  quantity: z.number(LINE_ITEM_VALIDATION_MESSAGES.CONVERSION_QUANTITY_INVALID).nullish(),
  unit: z.string().max(50, LINE_ITEM_VALIDATION_MESSAGES.CONVERSION_UNIT_TOO_LONG).nullish(),
  unitPrice: z.number(LINE_ITEM_VALIDATION_MESSAGES.CONVERSION_UNIT_PRICE_INVALID).nullish(),
  basis: z.string().max(500, LINE_ITEM_VALIDATION_MESSAGES.CONVERSION_BASIS_TOO_LONG).nullish(),
});
type LineItemConversionRaw = z.infer<typeof lineItemConversionInputSchema>;

const isFilledText = (val: string | null | undefined): val is string =>
  typeof val === 'string' && val.trim() !== '';

/** 換算の入力された欄の数（0〜4） */
const countConversionParts = (c: LineItemConversionRaw): number =>
  [c.quantity != null, isFilledText(c.unit), c.unitPrice != null, isFilledText(c.basis)].filter(
    Boolean
  ).length;

const emptyToNullText = (val: string | null | undefined): string | null =>
  val === undefined || val === null || val === '' ? null : val;

/**
 * 明細行データバリデーションスキーマ
 *
 * Requirements: 11.10 - 各フィールドのバリデーション
 * Task 21.2: 明細行データのバリデーションスキーマを定義
 */
export const lineItemSchema = z
  .object({
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

    // タスク112.2: 台帳の欄（45.1・45.7・45.8・46.4・47.1・47.4）。無い欄は既定（直接工事・参考の印は無）
    category: z
      .enum(LINE_ITEM_CATEGORIES, LINE_ITEM_VALIDATION_MESSAGES.CATEGORY_INVALID)
      .default('DIRECT'),
    condition: z.string().max(500, LINE_ITEM_VALIDATION_MESSAGES.CONDITION_TOO_LONG).nullish(),
    conversion: lineItemConversionInputSchema.nullish(),
    classificationKey: z
      .string()
      .max(50, LINE_ITEM_VALIDATION_MESSAGES.CLASSIFICATION_KEY_TOO_LONG)
      .nullish(),
    quantityRowKey: z
      .string()
      .max(1000, LINE_ITEM_VALIDATION_MESSAGES.QUANTITY_ROW_KEY_TOO_LONG)
      .nullish(),
    isReference: z.boolean(LINE_ITEM_VALIDATION_MESSAGES.IS_REFERENCE_INVALID).default(false),
    referenceReason: z
      .string()
      .max(200, LINE_ITEM_VALIDATION_MESSAGES.REFERENCE_REASON_TOO_LONG)
      .nullish(),
  })
  .superRefine((item, ctx) => {
    // 45.4: 値引きの行の金額は0以下。金額が空で数量と単価があるときはサーバーが数量×単価で求める（45.12）ため、その値で判定する
    if (item.category === 'DISCOUNT') {
      const effectiveAmount =
        item.amount ??
        (item.quantity != null && item.unitPrice != null ? item.quantity * item.unitPrice : null);
      if (effectiveAmount !== null && effectiveAmount > 0) {
        ctx.addIssue({
          code: 'custom',
          path: ['amount'],
          message: LINE_ITEM_VALIDATION_MESSAGES.DISCOUNT_AMOUNT_POSITIVE,
        });
      }
    }
    // 45.9: 換算は4つすべてあるかすべて無い。数量は0より大きい
    if (item.conversion) {
      const parts = countConversionParts(item.conversion);
      if (parts > 0 && (parts < 4 || (item.conversion.quantity ?? 0) <= 0)) {
        ctx.addIssue({
          code: 'custom',
          path: ['conversion'],
          message: LINE_ITEM_VALIDATION_MESSAGES.CONVERSION_INCOMPLETE,
        });
      }
    }
    // 46.5: 参考の理由は参考の印が有の行だけ
    if (!item.isReference && isFilledText(item.referenceReason)) {
      ctx.addIssue({
        code: 'custom',
        path: ['referenceReason'],
        message: LINE_ITEM_VALIDATION_MESSAGES.REFERENCE_REASON_WITHOUT_REFERENCE,
      });
    }
  })
  .transform((item) => {
    const conversion: LineItemConversion | null =
      item.conversion && countConversionParts(item.conversion) === 4
        ? {
            quantity: item.conversion.quantity as number,
            unit: item.conversion.unit as string,
            unitPrice: item.conversion.unitPrice as number,
            basis: item.conversion.basis as string,
          }
        : null;
    return {
      ...item,
      condition: emptyToNullText(item.condition),
      conversion,
      classificationKey: emptyToNullText(item.classificationKey),
      quantityRowKey: emptyToNullText(item.quantityRowKey),
      referenceReason: isFilledText(item.referenceReason) ? item.referenceReason : null,
    };
  });

/**
 * 明細行データ型
 */
export type LineItemInput = z.infer<typeof lineItemSchema>;

/**
 * 明細行の検証のエラーの文言に行の番号（1 始まり。画面の No と同じ）を添える
 */
export function formatLineItemErrorMessage(lineNumber: number, message: string): string {
  return `明細行の${lineNumber}行目: ${message}`;
}

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
    if (!firstIssue) {
      throw new Error(LINE_ITEM_VALIDATION_MESSAGES.LINE_ITEMS_INVALID_JSON);
    }
    // タスク112.2: 明細行の番号を添える（45.4・45.9・46.5 ほか明細行の各欄のエラー）
    const index = firstIssue.path[0];
    throw new Error(
      typeof index === 'number'
        ? formatLineItemErrorMessage(index + 1, firstIssue.message)
        : firstIssue.message
    );
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
  lineItems: readonly unknown[] | undefined
): void {
  const hasLineItems = lineItems !== undefined && lineItems.length > 0;

  if (!hasFile && !hasLineItems) {
    throw new Error(LINE_ITEM_VALIDATION_MESSAGES.FILE_OR_LINE_ITEMS_REQUIRED);
  }
}
