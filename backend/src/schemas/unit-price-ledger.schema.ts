/**
 * @fileoverview 単価台帳の要求の検証スキーマ（unit-price-ledger タスク1.4）
 *
 * 一覧の絞り込み（LedgerQueryService・LedgerExportService）、案件の無い受領見積書の修正と
 * 案件の受領見積書の印の更新（LedgerEditService）、似た単価の問い合わせ（SimilarPriceService）の
 * 要求を検証する。欄の上限の値は受領見積書の明細行と台帳の情報の検証の定義
 * （`schemas/received-quotation.schema.ts`）から取り、ここで数を重ねて書かない。
 *
 * Requirements: 4.2, 4.3, 4.4, 4.5, 5.1, 5.2, 5.3, 5.6, 7.1
 *
 * @module schemas/unit-price-ledger
 */

import { z } from 'zod';
import {
  LINE_ITEM_FIELD_LIMITS,
  LINE_ITEM_VALIDATION_MESSAGES,
  RECEIVED_QUOTATION_ADOPTIONS,
  RECEIVED_QUOTATION_CONSTRUCTION_KINDS,
  RECEIVED_QUOTATION_FIELD_LIMITS,
  RECEIVED_QUOTATION_READING_STATUSES,
  RECEIVED_QUOTATION_VALIDATION_MESSAGES,
  deleteReceivedQuotationQuerySchema,
  lineItemsArraySchema,
  receivedQuotationLedgerFieldsShape,
} from './received-quotation.schema.js';

/**
 * 単価台帳の検証の誤りの文言
 */
export const UNIT_PRICE_LEDGER_VALIDATION_MESSAGES = {
  // 一覧の絞り込み
  KEYWORD_TOO_LONG: '検索の文字は200文字以内で入力してください',
  SUBMITTED_DATE_INVALID: '見積日はYYYY-MM-DDの形式で入力してください',
  SUBMITTED_RANGE_INVALID: '見積日の期間の始まりは終わり以前の日付にしてください',
  FLAG_INVALID: '絞り込みの指定は true か false で指定してください',
  PAGE_INVALID: 'ページは1以上の整数で指定してください',

  // 見積・明細行の ID
  QUOTATION_ID_INVALID: '見積のIDの形式が不正です',
  LINE_ITEM_ID_INVALID: '明細行のIDの形式が不正です',
  LINE_ITEM_DUPLICATED: '同じ明細行が重ねて指定されています',

  // 案件の無い受領見積書の修正
  LEDGER_PROJECT_NAME_TOO_LONG: '案件名は255文字以内で入力してください',
  LEDGER_SOURCE_PATH_TOO_LONG: '原本のパスは1000文字以内で入力してください',
  LINE_ITEMS_REQUIRED: '明細行を1行以上入力してください',

  // 似た単価の問い合わせ
  SIMILAR_NAME_REQUIRED: '名称を入力してください',
  SIMILAR_NAME_TOO_LONG: '名称は200文字以内で入力してください',
  SIMILAR_SPECIFICATION_TOO_LONG: '規格は200文字以内で入力してください',
  SIMILAR_UNIT_TOO_LONG: '単位は50文字以内で入力してください',
  SIMILAR_WORK_TYPE_TOO_LONG: '工種は500文字以内で入力してください',
} as const;

/**
 * 一覧の 1 ページの件数（4.5）
 */
export const LEDGER_PAGE_SIZE = 50;

/**
 * 台帳の欄と一覧の絞り込みの文字の上限。台帳の 3 つの欄は DB の桁（design.md の Physical Data Model）に合わせる
 */
export const LEDGER_FIELD_LIMITS = {
  // 検索の文字は design に上限が無い。入力を守るため、似た単価の名称の上限（200）にそろえる
  keyword: 200,
  ledgerCardId: 200,
  ledgerSourcePath: 1000,
  ledgerProjectName: 255,
} as const;

/**
 * 似た単価の問い合わせの欄の上限（design.md の SimilarPriceQuery）。
 * 単位・分類キー・場所は受領見積書の明細行と台帳の情報の検証の上限を使う。
 * 工種は明細行の工種の DB の桁（`VarChar(500)`）に合わせる
 */
export const SIMILAR_PRICE_QUERY_LIMITS = {
  name: 200,
  specification: 200,
  unit: LINE_ITEM_FIELD_LIMITS.conversionUnit,
  classificationKey: LINE_ITEM_FIELD_LIMITS.classificationKey,
  workType: 500,
  siteLocation: RECEIVED_QUOTATION_FIELD_LIMITS.siteLocation,
} as const;

/**
 * UUIDバリデーション用正規表現（受領見積書の検証と同じ）
 */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** 文字は前後の空白を除き、空なら指定なし（undefined）とする */
const trimToUndefined = (val: unknown): unknown => {
  if (typeof val !== 'string') return val;
  const trimmed = val.trim();
  return trimmed === '' ? undefined : trimmed;
};

/** 文字は前後の空白を除き、空なら消す（null）とする */
const trimToNull = (val: unknown): unknown => {
  if (typeof val !== 'string') return val;
  const trimmed = val.trim();
  return trimmed === '' ? null : trimmed;
};

/** 空の文字は消す（null）とする。分類キー・参考の理由は受領見積書の明細行と同じく空白を除かない */
const emptyStringToNull = (val: unknown): unknown => (val === '' ? null : val);

/** 印の指定。クエリの 'true'/'false' と、JSON の本文の真偽の値の両方を受ける */
const optionalFlag = z.preprocess((val) => {
  if (val === 'true') return true;
  if (val === 'false') return false;
  if (val === '') return undefined;
  return val;
}, z.boolean(UNIT_PRICE_LEDGER_VALIDATION_MESSAGES.FLAG_INVALID).optional());

const optionalSubmittedDate = z.preprocess(
  trimToUndefined,
  z.iso.date(UNIT_PRICE_LEDGER_VALIDATION_MESSAGES.SUBMITTED_DATE_INVALID).optional()
);

/**
 * 一覧の絞り込みの欄（4.2〜4.4）
 */
const ledgerFilterShape = {
  /** 業者名・案件名・明細行の名称の部分一致（4.2） */
  keyword: z.preprocess(
    trimToUndefined,
    z
      .string()
      .max(LEDGER_FIELD_LIMITS.keyword, UNIT_PRICE_LEDGER_VALIDATION_MESSAGES.KEYWORD_TOO_LONG)
      .optional()
  ),
  /** 見積日の期間（4.2。YYYY-MM-DD、両端を含む） */
  submittedFrom: optionalSubmittedDate,
  submittedTo: optionalSubmittedDate,
  /** 案件の有無（4.2） */
  hasProject: optionalFlag,
  /** 採否（4.2） */
  adoption: z.preprocess(
    trimToUndefined,
    z
      .enum(RECEIVED_QUOTATION_ADOPTIONS, RECEIVED_QUOTATION_VALIDATION_MESSAGES.ADOPTION_INVALID)
      .optional()
  ),
  /** 読取の確認（4.2） */
  readingStatus: z.preprocess(
    trimToUndefined,
    z
      .enum(
        RECEIVED_QUOTATION_READING_STATUSES,
        RECEIVED_QUOTATION_VALIDATION_MESSAGES.READING_STATUS_INVALID
      )
      .optional()
  ),
  /** 改修／新営（4.2） */
  constructionKind: z.preprocess(
    trimToUndefined,
    z
      .enum(
        RECEIVED_QUOTATION_CONSTRUCTION_KINDS,
        RECEIVED_QUOTATION_VALIDATION_MESSAGES.CONSTRUCTION_KIND_INVALID
      )
      .optional()
  ),
  /** 要確認：参考の印のある明細行を 1 行以上持つ（4.3） */
  needsReview: optionalFlag,
  /** 分類キーの無い行がある：直接工事・産廃で分類キーが空の行を 1 行以上持つ（4.4） */
  missingClassificationKey: optionalFlag,
};

/** 見積日の期間の始まりが終わりより後でないこと（YYYY-MM-DD は文字の比較で日付の順になる） */
const checkSubmittedRange = (
  filter: { submittedFrom?: string; submittedTo?: string },
  ctx: z.RefinementCtx
): void => {
  if (filter.submittedFrom && filter.submittedTo && filter.submittedFrom > filter.submittedTo) {
    ctx.addIssue({
      code: 'custom',
      path: ['submittedFrom'],
      message: UNIT_PRICE_LEDGER_VALIDATION_MESSAGES.SUBMITTED_RANGE_INVALID,
    });
  }
};

/**
 * 台帳の絞り込みのスキーマ（ページを除く）。書き出し（POST /exports の本文）にも使う
 */
export const ledgerFilterSchema = z.object(ledgerFilterShape).superRefine(checkSubmittedRange);

/**
 * 台帳の絞り込みの型
 */
export type LedgerFilter = z.infer<typeof ledgerFilterSchema>;

/**
 * 台帳の一覧の問い合わせのスキーマ（GET /quotations のクエリ。1 ページは {@link LEDGER_PAGE_SIZE} 件）
 */
export const ledgerListQuerySchema = z
  .object({
    ...ledgerFilterShape,
    page: z.coerce
      .number(UNIT_PRICE_LEDGER_VALIDATION_MESSAGES.PAGE_INVALID)
      .int(UNIT_PRICE_LEDGER_VALIDATION_MESSAGES.PAGE_INVALID)
      .min(1, UNIT_PRICE_LEDGER_VALIDATION_MESSAGES.PAGE_INVALID)
      .default(1),
  })
  .superRefine(checkSubmittedRange);

/**
 * 台帳の一覧の問い合わせの型
 */
export type LedgerListQuery = z.infer<typeof ledgerListQuerySchema>;

/**
 * 台帳の見積の ID の経路の引数のスキーマ
 */
export const ledgerQuotationIdParamSchema = z.object({
  id: z.string().regex(UUID_REGEX, UNIT_PRICE_LEDGER_VALIDATION_MESSAGES.QUOTATION_ID_INVALID),
});

/**
 * 台帳の見積の ID の経路の引数の型
 */
export type LedgerQuotationIdParam = z.infer<typeof ledgerQuotationIdParamSchema>;

/**
 * 案件の無い受領見積書の削除のクエリ（`?updatedAt=`）。受領見積書の削除と同じ形を使う
 */
export const ledgerQuotationDeleteQuerySchema = deleteReceivedQuotationQuerySchema;

/**
 * 案件の無い受領見積書の削除のクエリの型
 */
export type LedgerQuotationDeleteQuery = z.infer<typeof ledgerQuotationDeleteQuerySchema>;

/**
 * 案件の無い受領見積書の修正のスキーマ（PUT /quotations/:id。5.1）
 *
 * 業者名・見積日・見積の情報（受領見積書の台帳の項目）・案件名・原本のパスと、明細行の全体を受ける。
 * 業者名は必須とし、その検証は受領見積書の台帳の項目の業者名の定義を使う。
 * 明細行は受領見積書の明細行の定義（`lineItemSchema`）で検証する（分類キーの 50 文字の上限を含む。5.3）。
 * 案件の無い受領見積書は原本のファイルを持たないため、明細行は 1 行以上とする。
 */
export const ledgerQuotationUpdateSchema = z.object({
  ...receivedQuotationLedgerFieldsShape,
  vendorName: receivedQuotationLedgerFieldsShape.vendorName.unwrap(),
  submittedAt: z
    .string(RECEIVED_QUOTATION_VALIDATION_MESSAGES.SUBMITTED_AT_REQUIRED)
    .datetime({ message: RECEIVED_QUOTATION_VALIDATION_MESSAGES.SUBMITTED_AT_INVALID }),
  ledgerProjectName: z.preprocess(
    trimToNull,
    z
      .string()
      .max(
        LEDGER_FIELD_LIMITS.ledgerProjectName,
        UNIT_PRICE_LEDGER_VALIDATION_MESSAGES.LEDGER_PROJECT_NAME_TOO_LONG
      )
      .nullish()
  ),
  ledgerSourcePath: z.preprocess(
    trimToNull,
    z
      .string()
      .max(
        LEDGER_FIELD_LIMITS.ledgerSourcePath,
        UNIT_PRICE_LEDGER_VALIDATION_MESSAGES.LEDGER_SOURCE_PATH_TOO_LONG
      )
      .nullish()
  ),
  lineItems: lineItemsArraySchema.min(1, UNIT_PRICE_LEDGER_VALIDATION_MESSAGES.LINE_ITEMS_REQUIRED),
  expectedUpdatedAt: z
    .string(RECEIVED_QUOTATION_VALIDATION_MESSAGES.DATETIME_INVALID)
    .datetime({ message: RECEIVED_QUOTATION_VALIDATION_MESSAGES.DATETIME_INVALID }),
});

/**
 * 案件の無い受領見積書の修正の入力型
 */
export type LedgerQuotationUpdateInput = z.infer<typeof ledgerQuotationUpdateSchema>;

/**
 * 印の更新の 1 行（参考の印と理由・分類キー。5.2）。欄が無いときは変えない、空の文字は消す（null）
 */
const ledgerLineItemMarkSchema = z
  .object({
    id: z.string().regex(UUID_REGEX, UNIT_PRICE_LEDGER_VALIDATION_MESSAGES.LINE_ITEM_ID_INVALID),
    isReference: z.boolean(LINE_ITEM_VALIDATION_MESSAGES.IS_REFERENCE_INVALID).optional(),
    referenceReason: z.preprocess(
      emptyStringToNull,
      z
        .string()
        .max(
          LINE_ITEM_FIELD_LIMITS.referenceReason,
          LINE_ITEM_VALIDATION_MESSAGES.REFERENCE_REASON_TOO_LONG
        )
        .nullish()
    ),
    // 5.3: estimate-request Requirement 47 の決まり（50 文字まで、体系の登録の有無は検査しない）
    classificationKey: z.preprocess(
      emptyStringToNull,
      z
        .string()
        .max(
          LINE_ITEM_FIELD_LIMITS.classificationKey,
          LINE_ITEM_VALIDATION_MESSAGES.CLASSIFICATION_KEY_TOO_LONG
        )
        .nullish()
    ),
  })
  .superRefine((mark, ctx) => {
    // estimate-request 46.5: 参考の理由は参考の印が有の行だけ。印を外す要求に理由があれば拒む
    // （印を送らない要求の照合は、保存済みの印を知るサービスが行う）
    if (
      mark.isReference === false &&
      typeof mark.referenceReason === 'string' &&
      mark.referenceReason.trim() !== ''
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['referenceReason'],
        message: LINE_ITEM_VALIDATION_MESSAGES.REFERENCE_REASON_WITHOUT_REFERENCE,
      });
    }
  });

/**
 * 案件の受領見積書の印の更新のスキーマ（PATCH /quotations/:id/marks。5.2〜5.4）
 *
 * 読取の確認と、明細行ごとの参考の印と理由・分類キーだけを受ける。ほかの欄は送られても落とす。
 */
export const ledgerMarksUpdateSchema = z.object({
  readingStatus: receivedQuotationLedgerFieldsShape.readingStatus,
  lineItems: z.array(ledgerLineItemMarkSchema).superRefine((marks, ctx) => {
    const seen = new Set<string>();
    marks.forEach((mark, index) => {
      if (seen.has(mark.id)) {
        ctx.addIssue({
          code: 'custom',
          path: [index, 'id'],
          message: UNIT_PRICE_LEDGER_VALIDATION_MESSAGES.LINE_ITEM_DUPLICATED,
        });
      }
      seen.add(mark.id);
    });
  }),
  expectedUpdatedAt: z
    .string(RECEIVED_QUOTATION_VALIDATION_MESSAGES.DATETIME_INVALID)
    .datetime({ message: RECEIVED_QUOTATION_VALIDATION_MESSAGES.DATETIME_INVALID }),
});

/**
 * 案件の受領見積書の印の更新の入力型
 */
export type LedgerMarksUpdateInput = z.infer<typeof ledgerMarksUpdateSchema>;

const optionalQueryText = (max: number, message: string) =>
  z.preprocess(trimToUndefined, z.string().max(max, message).optional());

/**
 * 似た単価の問い合わせのスキーマ（POST /similar-prices。7.1）
 *
 * 名称は必須（前後の空白を除いて 1 文字以上）。規格・単位・分類キー・工種・改修／新営・場所は任意で、
 * 空の文字は指定なしとする。
 */
export const similarPriceQuerySchema = z.object({
  name: z.preprocess(
    (val) => (typeof val === 'string' ? val.trim() : val),
    z
      .string(UNIT_PRICE_LEDGER_VALIDATION_MESSAGES.SIMILAR_NAME_REQUIRED)
      .min(1, UNIT_PRICE_LEDGER_VALIDATION_MESSAGES.SIMILAR_NAME_REQUIRED)
      .max(
        SIMILAR_PRICE_QUERY_LIMITS.name,
        UNIT_PRICE_LEDGER_VALIDATION_MESSAGES.SIMILAR_NAME_TOO_LONG
      )
  ),
  specification: optionalQueryText(
    SIMILAR_PRICE_QUERY_LIMITS.specification,
    UNIT_PRICE_LEDGER_VALIDATION_MESSAGES.SIMILAR_SPECIFICATION_TOO_LONG
  ),
  unit: optionalQueryText(
    SIMILAR_PRICE_QUERY_LIMITS.unit,
    UNIT_PRICE_LEDGER_VALIDATION_MESSAGES.SIMILAR_UNIT_TOO_LONG
  ),
  classificationKey: optionalQueryText(
    SIMILAR_PRICE_QUERY_LIMITS.classificationKey,
    LINE_ITEM_VALIDATION_MESSAGES.CLASSIFICATION_KEY_TOO_LONG
  ),
  workType: optionalQueryText(
    SIMILAR_PRICE_QUERY_LIMITS.workType,
    UNIT_PRICE_LEDGER_VALIDATION_MESSAGES.SIMILAR_WORK_TYPE_TOO_LONG
  ),
  constructionKind: z.preprocess(
    trimToUndefined,
    z
      .enum(
        RECEIVED_QUOTATION_CONSTRUCTION_KINDS,
        RECEIVED_QUOTATION_VALIDATION_MESSAGES.CONSTRUCTION_KIND_INVALID
      )
      .optional()
  ),
  siteLocation: optionalQueryText(
    SIMILAR_PRICE_QUERY_LIMITS.siteLocation,
    RECEIVED_QUOTATION_VALIDATION_MESSAGES.SITE_LOCATION_TOO_LONG
  ),
});

/**
 * 似た単価の問い合わせの入力型
 */
export type SimilarPriceQuery = z.infer<typeof similarPriceQuerySchema>;
