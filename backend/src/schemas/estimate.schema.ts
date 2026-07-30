/**
 * @fileoverview 見積書バリデーションスキーマ
 *
 * 見積書APIのリクエストバリデーションスキーマを定義します。
 *
 * Requirements (estimate-creation):
 * - REQ-11.1: プロジェクトに紐付く見積書の一覧を表示する
 * - REQ-11.5: 見積書に見積名称を設定可能とする
 * - REQ-11.6: 楽観的排他制御により競合を検出する
 * - REQ-13.1: 数量フィールドの数値バリデーション
 * - REQ-13.2: 単価フィールドの数値バリデーション
 * - REQ-13.3: 利益率の範囲バリデーション（0.00〜500.00）
 * - REQ-13.4: 必須フィールド（名称等）のバリデーション
 *
 * Task 4.1: 見積書CRUD APIエンドポイントの実装
 * Task 5.1: 入力バリデーションスキーマの定義
 *
 * @module schemas/estimate
 */

import { z } from 'zod';

/**
 * 見積書バリデーションメッセージ定数
 *
 * 一貫性のあるエラーメッセージを提供するための定数定義。
 *
 * Requirements: REQ-13.1, REQ-13.2, REQ-13.3, REQ-13.4
 * Task 5.1: 入力バリデーションスキーマの定義
 */
export const ESTIMATE_VALIDATION_MESSAGES = {
  // 名称関連
  NAME_REQUIRED: '見積書名は必須です',
  NAME_TOO_LONG: '見積書名は200文字以内で入力してください',

  // 規格関連
  SPECIFICATION_TOO_LONG: '規格は500文字以内で入力してください',

  // 単位関連
  UNIT_TOO_LONG: '単位は50文字以内で入力してください',

  // 数量関連（REQ-13.1）
  QUANTITY_INVALID: '数量は数値を入力してください',

  // 単価関連（REQ-13.2）
  UNIT_PRICE_INVALID: '単価は数値を入力してください',

  // 利益率関連（REQ-13.3）
  PROFIT_RATE_INVALID: '利益率は0〜500の範囲で入力してください',

  // NET金額関連
  NET_AMOUNT_INVALID: 'NET金額は0以上の数値を入力してください',

  // 行タイプ関連
  LINE_TYPE_INVALID: '行タイプが無効です',

  // その他
  UUID_INVALID: 'IDの形式が無効です',
  DATE_INVALID: '日時の形式が無効です',
} as const;

/**
 * UUIDスキーマ
 */
const uuidSchema = z.string().uuid();

/**
 * ISO日時文字列スキーマ
 */
const isoDateTimeSchema = z.string().datetime();

/**
 * プロジェクトIDパラメータスキーマ
 */
export const projectIdParamSchema = z.object({
  projectId: uuidSchema,
});

/**
 * 見積書IDパラメータスキーマ
 */
export const estimateIdParamSchema = z.object({
  id: uuidSchema,
});

/**
 * 見積項目IDパラメータスキーマ
 */
export const estimateItemIdParamSchema = z.object({
  id: uuidSchema,
  itemId: uuidSchema,
});

/**
 * 見積書作成リクエストスキーマ
 *
 * Requirements: REQ-11.5, REQ-13.4
 */
export const createEstimateSchema = z.object({
  name: z
    .string()
    .min(1, ESTIMATE_VALIDATION_MESSAGES.NAME_REQUIRED)
    .max(200, ESTIMATE_VALIDATION_MESSAGES.NAME_TOO_LONG),
  sourceItemizedStatementId: uuidSchema.optional(),
});

/**
 * 見積書更新リクエストスキーマ
 *
 * Requirements: REQ-11.5, REQ-11.6
 */
export const updateEstimateSchema = z.object({
  name: z
    .string()
    .min(1, ESTIMATE_VALIDATION_MESSAGES.NAME_REQUIRED)
    .max(200, ESTIMATE_VALIDATION_MESSAGES.NAME_TOO_LONG),
  expectedUpdatedAt: isoDateTimeSchema,
});

/**
 * 見積書削除リクエストスキーマ
 *
 * Requirements: REQ-11.6
 */
export const deleteEstimateSchema = z.object({
  updatedAt: isoDateTimeSchema,
});

/**
 * 見積書一覧クエリスキーマ
 *
 * Requirements: REQ-11.1
 */
export const estimateListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
  sort: z.enum(['createdAt', 'name']).default('createdAt'),
  order: z.enum(['asc', 'desc']).default('desc'),
});

/**
 * 見積項目行タイプ
 */
export const lineTypeSchema = z.enum(['ESTIMATE', 'EXECUTION', 'VENDOR']);

/**
 * 見積項目種別
 *
 * - STANDARD: 通常項目（見積・実行・業者の3行1セット）
 * - DISCOUNT: 値引き行（見積金額行のみ。実行・業者行を持たない、REQ-41.3）
 *
 * Requirements: REQ-41.1, REQ-41.3
 */
export const itemTypeSchema = z.enum(['STANDARD', 'DISCOUNT']);

/**
 * 見積項目行入力スキーマ
 *
 * Requirements: REQ-13.1, REQ-13.2
 * Task 5.1: 入力バリデーションスキーマの定義
 */
export const estimateItemLineSchema = z.object({
  lineType: lineTypeSchema,
  name: z.string().max(200, ESTIMATE_VALIDATION_MESSAGES.NAME_TOO_LONG).nullable().optional(),
  specification: z
    .string()
    .max(500, ESTIMATE_VALIDATION_MESSAGES.SPECIFICATION_TOO_LONG)
    .nullable()
    .optional(),
  unit: z.string().max(50, ESTIMATE_VALIDATION_MESSAGES.UNIT_TOO_LONG).nullable().optional(),
  quantity: z.number().nullable().optional(),
  unitPrice: z.number().nullable().optional(),
  remarks: z.string().nullable().optional(),
});

/**
 * 見積項目作成スキーマ
 *
 * Requirements: REQ-12.1
 */
export const createEstimateItemSchema = z.object({
  parentId: uuidSchema.nullable().optional(),
  displayOrder: z.number().int().min(0),
  // 項目種別（任意、省略時 STANDARD 相当）。REQ-41.1
  itemType: itemTypeSchema.optional(),
  lines: z.array(estimateItemLineSchema).min(1).max(3),
});

/**
 * 見積項目行更新スキーマ
 */
export const updateEstimateItemLineSchema = z.object({
  id: uuidSchema,
  lineType: lineTypeSchema,
  name: z.string().max(200).nullable().optional(),
  specification: z.string().max(500).nullable().optional(),
  unit: z.string().max(50).nullable().optional(),
  quantity: z.number().nullable().optional(),
  unitPrice: z.number().nullable().optional(),
  remarks: z.string().nullable().optional(),
});

/**
 * 見積項目更新スキーマ
 */
export const updateEstimateItemSchema = z.object({
  lines: z.array(updateEstimateItemLineSchema).min(1).max(3),
});

/**
 * 見積項目並び替えスキーマ
 *
 * Requirements: REQ-12.2
 */
export const reorderItemsSchema = z.object({
  itemOrders: z.array(
    z.object({
      id: uuidSchema,
      displayOrder: z.number().int().min(0),
    })
  ),
});

/**
 * 見積項目バッチ更新スキーマ
 */
export const batchUpdateItemsSchema = z.object({
  items: z.array(
    z.object({
      id: uuidSchema,
      // 項目種別（任意、省略時 STANDARD 相当）。REQ-41.1
      itemType: itemTypeSchema.optional(),
      lines: z.array(
        z.object({
          id: uuidSchema,
          lineType: lineTypeSchema,
          name: z.string().max(200).nullable().optional(),
          specification: z.string().max(500).nullable().optional(),
          unit: z.string().max(50).nullable().optional(),
          quantity: z.number().nullable().optional(),
          unitPrice: z.number().nullable().optional(),
          remarks: z.string().nullable().optional(),
        })
      ),
    })
  ),
  updatedAt: isoDateTimeSchema,
});

/**
 * 見積項目削除スキーマ
 */
export const deleteEstimateItemSchema = z.object({
  forceDelete: z.boolean().default(false),
});

/**
 * 見積項目移動スキーマ
 *
 * Requirements: REQ-12.6
 */
export const moveEstimateItemSchema = z.object({
  newParentId: uuidSchema.nullable(),
});

/**
 * 受領見積書転記スキーマ
 *
 * Requirements: REQ-4.1, REQ-4.2
 */
export const transferQuotationSchema = z.object({
  receivedQuotationId: uuidSchema,
  lineItemIds: z.array(uuidSchema).min(1, '転記する明細行を選択してください'),
  targetEstimateItemId: uuidSchema.optional(),
});

/**
 * NET金額計算スキーマ
 *
 * Requirements: REQ-5.1, REQ-5.2, REQ-5.3, REQ-5.4
 * Task 5.1: 入力バリデーションスキーマの定義
 */
export const calculateNetSchema = z.object({
  vendorName: z.string().min(1, '業者名は必須です'),
  targetLineIds: z.array(uuidSchema).min(1, '案分対象の行を選択してください'),
  excludeLineIds: z.array(uuidSchema).default([]),
  netAmount: z.string().refine(
    (val) => {
      const num = parseFloat(val);
      return !isNaN(num) && num >= 0;
    },
    { message: ESTIMATE_VALIDATION_MESSAGES.NET_AMOUNT_INVALID }
  ),
});

/**
 * 利益率適用スキーマ
 *
 * Requirements: REQ-6.1, REQ-13.3
 * Task 5.1: 入力バリデーションスキーマの定義
 */
export const applyProfitRateSchema = z.object({
  profitRate: z.string().refine(
    (val) => {
      const num = parseFloat(val);
      return !isNaN(num) && num >= 0 && num <= 500;
    },
    { message: ESTIMATE_VALIDATION_MESSAGES.PROFIT_RATE_INVALID }
  ),
  overwriteOption: z.enum(['all', 'empty_only', 'unit_price_only']),
});

/**
 * 諸経費種別
 */
export const overheadCostTypeSchema = z.enum([
  'COMMON_TEMPORARY',
  'SITE_MANAGEMENT',
  'GENERAL_ADMIN',
]);

/**
 * 諸経費計算スキーマ
 *
 * Requirements: REQ-7.1, REQ-8.1, REQ-9.1
 */
export const calculateOverheadSchema = z.object({
  costType: overheadCostTypeSchema,
  directCost: z.string().refine(
    (val) => {
      const num = parseFloat(val);
      return !isNaN(num) && num > 0;
    },
    { message: '直接工事費は0より大きい数値を入力してください' }
  ),
  constructionPeriod: z.number().int().min(1, '工期は1以上の整数を入力してください').optional(),
  pureConstructionCost: z
    .string()
    .refine(
      (val) => {
        const num = parseFloat(val);
        return !isNaN(num) && num > 0;
      },
      { message: '純工事費は0より大きい数値を入力してください' }
    )
    .optional(),
  constructionCost: z
    .string()
    .refine(
      (val) => {
        const num = parseFloat(val);
        return !isNaN(num) && num > 0;
      },
      { message: '工事原価は0より大きい数値を入力してください' }
    )
    .optional(),
  isRenovation: z.boolean().default(false),
});

/**
 * 諸経費行追加スキーマ
 */
export const addOverheadItemSchema = z.object({
  costType: overheadCostTypeSchema,
  unitPrice: z.number().optional(),
});

/**
 * 値引き行追加スキーマ
 *
 * 値引きプリセット行（種別=DISCOUNT・見積金額行のみ）を追加する際のリクエストボディ。
 * 単価は手入力前提（REQ-41.4）で任意、かつマイナス値（負数）を許容する（REQ-41.5）。
 * z.number() は範囲制限を付けないため、デフォルトで負数を受理する。
 *
 * Requirements: REQ-41.1, REQ-41.2, REQ-41.4, REQ-41.5
 */
export const addDiscountItemSchema = z.object({
  unitPrice: z.number().nullable().optional(),
});

/**
 * 見積書出力クエリスキーマ
 *
 * Requirements: REQ-10.1, REQ-10.2, REQ-32.4
 *
 * Task 42.2: lineTypeをlineTypes（カンマ区切り複数対応）に変更
 * 後方互換性のため、lineType（単一値）も受付可能
 */
export const exportEstimateQuerySchema = z
  .object({
    format: z.enum(['pdf', 'xlsx']),
    lineTypes: z
      .string()
      .optional()
      .transform((val) => {
        if (!val) return undefined;
        return val.split(',').filter((v) => ['ESTIMATE', 'EXECUTION', 'VENDOR'].includes(v));
      }),
    // 後方互換性: lineType（単一値）も受付
    lineType: z.enum(['ESTIMATE', 'EXECUTION', 'VENDOR']).optional(),
  })
  .transform((data) => {
    // lineTypesが指定されている場合はそちらを優先、なければlineTypeから配列を構築
    const lineTypes =
      data.lineTypes && data.lineTypes.length > 0
        ? (data.lineTypes as Array<'ESTIMATE' | 'EXECUTION' | 'VENDOR'>)
        : data.lineType
          ? [data.lineType]
          : ['ESTIMATE' as const];
    return {
      format: data.format,
      lineTypes,
    };
  });

/**
 * 階層取得クエリスキーマ
 */
export const getItemsQuerySchema = z.object({
  hierarchy: z.coerce.boolean().default(false),
});

// ---------------------------------------------------------------------------
// 明細の一括保存（PUT /api/estimates/:id/save）
//
// Requirements (estimate-creation): 42.4, 42.8, 54.1
// Task 52.3: 明細の一括保存リクエストのスキーマとバリデーション
// ---------------------------------------------------------------------------

/**
 * 一括保存で受け付ける明細の総数上限（42.4）
 *
 * 子孫を含むツリー全体の節点数に対する上限。design.md「estimate-draft.service」の
 * Implementation Notes に従い、配列長上限を持たない `batchUpdateItemsSchema`
 * （本ファイル 228-249 行）の問題を再発させないために設ける。
 * 同 Notes の Risks にあるとおり実測に応じて調整できるよう定数として公開する。
 *
 * 2000 は暫定値。design.md の Risks に基づき段階1リリース前に実測で見直すこと。
 */
export const SAVE_ESTIMATE_MAX_ITEMS = 2000;

/** 別途工事の最大件数（54.1） */
const SEPARATE_WORKS_MAX_COUNT = 5;

/** 別途工事1件あたりの最大文字数 */
const SEPARATE_WORKS_MAX_LENGTH = 200;

/** 有効期限の最大文字数（54.2） */
const VALIDITY_PERIOD_MAX_LENGTH = 100;

/**
 * 数量の10進数文字列パターン（Prisma `Decimal(15, 4)`）
 *
 * 整数部は最大11桁、小数部は最大4桁。値引き行のために負数を許容する（41.5）。
 */
const QUANTITY_DECIMAL_PATTERN = /^-?\d{1,11}(\.\d{1,4})?$/;

/**
 * 単価・金額の10進数文字列パターン（Prisma `Decimal(15, 2)`）
 *
 * 整数部は最大13桁、小数部は最大2桁。値引き行のために負数を許容する（41.5）。
 */
const AMOUNT_DECIMAL_PATTERN = /^-?\d{1,13}(\.\d{1,2})?$/;

/**
 * 一括保存バリデーションメッセージ定数
 *
 * 検証NGの内容は 422 として呼び出し元へ返るため、利用者に提示できる日本語とする（42.4）。
 */
export const SAVE_ESTIMATE_VALIDATION_MESSAGES = {
  ITEMS_TOO_MANY: `見積明細は合計${SAVE_ESTIMATE_MAX_ITEMS}件以内で保存してください`,
  ITEM_IDENTIFIER_REQUIRED: '新規の見積項目には一時IDが必要です',
  ITEM_IDENTIFIER_AMBIGUOUS: '見積項目のIDと一時IDは同時に指定できません',
  ITEM_ID_DUPLICATED: '同じ見積項目が複数の位置に存在します',
  ITEM_TEMP_ID_DUPLICATED: '新規の見積項目の一時IDが重複しています',
  ITEM_CIRCULAR_REFERENCE: '見積項目が自身の子孫に含まれています（循環参照）',
  ITEM_CHILDREN_NOT_ALLOWED: '値引き行・注記行は子項目を持てません',
  ITEM_LINES_ESTIMATE_ONLY: '値引き行・注記行は見積金額行1件のみを持てます',
  LINE_TYPE_DUPLICATED: '1つの見積項目に同じ行タイプを複数指定できません',
  SEPARATE_WORKS_TOO_MANY: `別途工事は${SEPARATE_WORKS_MAX_COUNT}件以内で入力してください`,
  SEPARATE_WORKS_TOO_LONG: `別途工事は${SEPARATE_WORKS_MAX_LENGTH}文字以内で入力してください`,
  VALIDITY_PERIOD_TOO_LONG: `有効期限は${VALIDITY_PERIOD_MAX_LENGTH}文字以内で入力してください`,
  SUBMISSION_DATE_INVALID: '提出日はYYYY-MM-DD形式で入力してください',
  QUANTITY_DECIMAL_INVALID: '数量は整数部11桁・小数部4桁以内の数値で入力してください',
  UNIT_PRICE_DECIMAL_INVALID: '単価は整数部13桁・小数部2桁以内の数値で入力してください',
  AMOUNT_DECIMAL_INVALID: '金額は整数部13桁・小数部2桁以内の数値で入力してください',
  TEMP_ID_REQUIRED: '一時IDは1文字以上100文字以内で指定してください',
} as const;

/**
 * 一括保存で受け付ける見積項目の種別（55.1 で注記行を追加）
 *
 * 既存の {@link itemTypeSchema} は旧APIが用いるため変更せず、保存API専用に定義する。
 *
 * 申し送り: design.md 4376 の「`NOTE` 項目は `name` 以外は NULL とする」は本スキーマでは
 * 未検証。本スキーマが担保するのは「子を持たない」「見積金額行1件のみ」までであり、
 * 規格・単位・数量・単価・金額を NULL に正規化する責務は差分適用側（タスク 52.4）に委ねる。
 */
export const saveItemTypeSchema = z.enum(['STANDARD', 'DISCOUNT', 'NOTE']);

/**
 * 一括保存の明細行スキーマ
 *
 * 数量・単価・金額は精度欠落を避けるため10進数文字列で受け取る
 * （design.md「estimate-draft.service」の `SaveEstimateLine`）。
 *
 * 各フィールドは design.md 4313-4323 の `SaveEstimateLine` に合わせ
 * **null 許容だが省略不可**とする。本APIはフル状態同期であり、省略を許すと
 * 「キーの欠落＝null 上書き」となって既存行の名称・数量を意図せず消す経路が生まれる。
 */
export const saveEstimateLineSchema = z.object({
  lineType: lineTypeSchema,
  name: z.string().max(200, ESTIMATE_VALIDATION_MESSAGES.NAME_TOO_LONG).nullable(),
  specification: z
    .string()
    .max(500, ESTIMATE_VALIDATION_MESSAGES.SPECIFICATION_TOO_LONG)
    .nullable(),
  unit: z.string().max(50, ESTIMATE_VALIDATION_MESSAGES.UNIT_TOO_LONG).nullable(),
  quantity: z
    .string()
    .regex(QUANTITY_DECIMAL_PATTERN, SAVE_ESTIMATE_VALIDATION_MESSAGES.QUANTITY_DECIMAL_INVALID)
    .nullable(),
  unitPrice: z
    .string()
    .regex(AMOUNT_DECIMAL_PATTERN, SAVE_ESTIMATE_VALIDATION_MESSAGES.UNIT_PRICE_DECIMAL_INVALID)
    .nullable(),
  amount: z
    .string()
    .regex(AMOUNT_DECIMAL_PATTERN, SAVE_ESTIMATE_VALIDATION_MESSAGES.AMOUNT_DECIMAL_INVALID)
    .nullable(),
  // `remarks` は Prisma 上も長さ制約のない TEXT（`EstimateItemLine.remarks`）のため、
  // 他8フィールドと異なり最大長を設けない。DB 側に制約が無い以上、
  // スキーマ独自の上限は保存できるはずの値を弾くことになる
  remarks: z.string().nullable(),
  sourceVendorName: z.string().max(200).nullable(),
});

/**
 * 一括保存の見積項目ノードスキーマ（再帰）
 *
 * 既存項目は `id` を持ち、新規項目は `id: null` ＋ `tempId` で親子関係を表現する。
 * 構造上の制約（循環参照・重複・種別ごとの制約）は
 * {@link saveEstimateDraftSchema} のツリー走査でまとめて検証する。
 *
 * design.md 4305-4311 の `SaveEstimateItemNode` に合わせ、`id` / `tempId` は
 * **null 許容だが省略不可**、`children` は**省略不可**とする（葉は空配列を明示送信する）。
 */
export const saveEstimateItemNodeSchema = z.object({
  id: uuidSchema.nullable(),
  tempId: z
    .string()
    .min(1, SAVE_ESTIMATE_VALIDATION_MESSAGES.TEMP_ID_REQUIRED)
    .max(100, SAVE_ESTIMATE_VALIDATION_MESSAGES.TEMP_ID_REQUIRED)
    .nullable(),
  itemType: saveItemTypeSchema,
  lines: z.array(saveEstimateLineSchema).min(1).max(3),
  get children(): z.ZodArray<typeof saveEstimateItemNodeSchema> {
    return z.array(saveEstimateItemNodeSchema);
  },
});

/**
 * 帳票用入力項目スキーマ（54.1, 54.2, 54.3）
 *
 * 3フィールドの `.default()` は意図的に残している。{@link saveEstimateDraftSchema} で
 * `reportFields` 自体を省略不可としたため、トップレベルの省略は 400 で弾かれ、
 * 「省略＝保存済みの値を静かに消す」経路は塞がっている。
 */
export const saveEstimateReportFieldsSchema = z.object({
  submissionDate: z
    .string()
    .date(SAVE_ESTIMATE_VALIDATION_MESSAGES.SUBMISSION_DATE_INVALID)
    .nullable()
    .optional()
    .default(null),
  validityPeriod: z
    .string()
    .max(VALIDITY_PERIOD_MAX_LENGTH, SAVE_ESTIMATE_VALIDATION_MESSAGES.VALIDITY_PERIOD_TOO_LONG)
    .nullable()
    .optional()
    .default(null),
  separateWorks: z
    .array(
      z
        .string()
        .max(SEPARATE_WORKS_MAX_LENGTH, SAVE_ESTIMATE_VALIDATION_MESSAGES.SEPARATE_WORKS_TOO_LONG)
    )
    .max(SEPARATE_WORKS_MAX_COUNT, SAVE_ESTIMATE_VALIDATION_MESSAGES.SEPARATE_WORKS_TOO_MANY)
    .optional()
    .default([]),
});

/** ツリー走査で検証する見積項目ノード（{@link saveEstimateItemNodeSchema} の出力形） */
type SaveEstimateItemNodeParsed = z.infer<typeof saveEstimateItemNodeSchema>;

/** 深さ優先走査の作業単位 */
interface SaveItemFrame {
  readonly node: SaveEstimateItemNodeParsed;
  readonly path: readonly (string | number)[];
  readonly ancestorIds: ReadonlySet<string>;
}

/**
 * 明細ツリー全体の構造検証（42.4, 42.8）
 *
 * トランザクション開始前に全件を検証し、不備は issue として呼び出し元へ返す。
 * 再帰ではなく明示的なスタックによる深さ優先走査とし、深い階層でも
 * コールスタックを消費しない。
 */
function validateSaveEstimateItemTree(
  items: readonly SaveEstimateItemNodeParsed[],
  ctx: z.RefinementCtx
): void {
  const seenIds = new Set<string>();
  const seenTempIds = new Set<string>();
  let totalCount = 0;

  // 末尾から積むことで表示順どおりに走査する
  const stack: SaveItemFrame[] = items
    .map((node, index) => ({
      node,
      path: ['items', index] as readonly (string | number)[],
      ancestorIds: new Set<string>() as ReadonlySet<string>,
    }))
    .reverse();

  for (let frame = stack.pop(); frame !== undefined; frame = stack.pop()) {
    const { node, path, ancestorIds } = frame;
    totalCount += 1;

    // 識別子: 既存はID、新規は一時IDのいずれか一方のみ。
    // どちらも持たない節点は子の親を解決できず、親を失った項目を生む（42.8）
    if (node.id === null && node.tempId === null) {
      ctx.addIssue({
        code: 'custom',
        path: [...path, 'tempId'],
        message: SAVE_ESTIMATE_VALIDATION_MESSAGES.ITEM_IDENTIFIER_REQUIRED,
      });
    } else if (node.id !== null && node.tempId !== null) {
      ctx.addIssue({
        code: 'custom',
        path: [...path, 'tempId'],
        message: SAVE_ESTIMATE_VALIDATION_MESSAGES.ITEM_IDENTIFIER_AMBIGUOUS,
      });
    }

    if (node.id !== null) {
      if (ancestorIds.has(node.id)) {
        // 自身が自身の子孫に現れる＝循環参照（42.8）
        ctx.addIssue({
          code: 'custom',
          path: [...path, 'id'],
          message: SAVE_ESTIMATE_VALIDATION_MESSAGES.ITEM_CIRCULAR_REFERENCE,
        });
      } else if (seenIds.has(node.id)) {
        // 同一項目が複数の位置に現れると親が一意に定まらず、
        // 差分適用後にいずれかが親を失う（42.8）
        ctx.addIssue({
          code: 'custom',
          path: [...path, 'id'],
          message: SAVE_ESTIMATE_VALIDATION_MESSAGES.ITEM_ID_DUPLICATED,
        });
      }
      seenIds.add(node.id);
    }

    if (node.tempId !== null) {
      if (seenTempIds.has(node.tempId)) {
        // 一時IDが重複すると生成IDへの対応表が壊れ、親子関係を解決できない
        ctx.addIssue({
          code: 'custom',
          path: [...path, 'tempId'],
          message: SAVE_ESTIMATE_VALIDATION_MESSAGES.ITEM_TEMP_ID_DUPLICATED,
        });
      }
      seenTempIds.add(node.tempId);
    }

    // 同一項目に同じ行タイプは1件のみ（EstimateItemLine の estimateItemId + lineType 一意制約）
    const seenLineTypes = new Set<string>();
    for (const [lineIndex, line] of node.lines.entries()) {
      if (seenLineTypes.has(line.lineType)) {
        ctx.addIssue({
          code: 'custom',
          path: [...path, 'lines', lineIndex],
          message: SAVE_ESTIMATE_VALIDATION_MESSAGES.LINE_TYPE_DUPLICATED,
        });
      }
      seenLineTypes.add(line.lineType);
    }

    // 値引き行・注記行は子を持たず、見積金額行1件のみ（41.3, 55.1）
    if (node.itemType === 'DISCOUNT' || node.itemType === 'NOTE') {
      if (node.children.length > 0) {
        ctx.addIssue({
          code: 'custom',
          path: [...path, 'children'],
          message: SAVE_ESTIMATE_VALIDATION_MESSAGES.ITEM_CHILDREN_NOT_ALLOWED,
        });
      }
      if (node.lines.length !== 1 || node.lines[0]?.lineType !== 'ESTIMATE') {
        ctx.addIssue({
          code: 'custom',
          path: [...path, 'lines'],
          message: SAVE_ESTIMATE_VALIDATION_MESSAGES.ITEM_LINES_ESTIMATE_ONLY,
        });
      }
    }

    const childAncestorIds =
      node.id === null ? ancestorIds : new Set<string>([...ancestorIds, node.id]);
    for (let index = node.children.length - 1; index >= 0; index -= 1) {
      stack.push({
        node: node.children[index]!,
        path: [...path, 'children', index],
        ancestorIds: childAncestorIds,
      });
    }
  }

  // 子孫を含む総数の上限（42.4）
  if (totalCount > SAVE_ESTIMATE_MAX_ITEMS) {
    ctx.addIssue({
      code: 'custom',
      path: ['items'],
      message: SAVE_ESTIMATE_VALIDATION_MESSAGES.ITEMS_TOO_MANY,
    });
  }
}

/**
 * 明細の一括保存リクエストスキーマ
 *
 * 明細ツリー全体・楽観ロック用の基準時刻・帳票用入力項目を1リクエストで受け取る。
 * 形式不正は 400、構造の検証NGは 422 として呼び出し元へ不備の内容を返す（42.4）。
 *
 * Requirements (estimate-creation): 42.4, 42.8, 54.1
 * Task 52.3: 明細の一括保存リクエストのスキーマとバリデーション
 */
export const saveEstimateDraftSchema = z
  .object({
    expectedUpdatedAt: isoDateTimeSchema,
    // design.md 4297 の `SaveEstimateDraftRequest` に合わせ省略不可とする。
    // 本APIはフル状態同期のため、省略を許すと保存済みの提出日・有効期限・別途工事
    // （54.1〜54.3）を null / 空配列で静かに上書き消去する経路が生まれる
    reportFields: saveEstimateReportFieldsSchema,
    items: z.array(saveEstimateItemNodeSchema),
  })
  .superRefine((value, ctx) => {
    validateSaveEstimateItemTree(value.items, ctx);
  });

// 型エクスポート
export type CreateEstimateInput = z.infer<typeof createEstimateSchema>;
export type UpdateEstimateInput = z.infer<typeof updateEstimateSchema>;
export type DeleteEstimateInput = z.infer<typeof deleteEstimateSchema>;
export type EstimateListQuery = z.infer<typeof estimateListQuerySchema>;
export type CreateEstimateItemInput = z.infer<typeof createEstimateItemSchema>;
export type UpdateEstimateItemInput = z.infer<typeof updateEstimateItemSchema>;
export type ReorderItemsInput = z.infer<typeof reorderItemsSchema>;
export type BatchUpdateItemsInput = z.infer<typeof batchUpdateItemsSchema>;
export type DeleteEstimateItemInput = z.infer<typeof deleteEstimateItemSchema>;
export type MoveEstimateItemInput = z.infer<typeof moveEstimateItemSchema>;
export type TransferQuotationInput = z.infer<typeof transferQuotationSchema>;
export type CalculateNetInput = z.infer<typeof calculateNetSchema>;
export type ApplyProfitRateInput = z.infer<typeof applyProfitRateSchema>;
export type CalculateOverheadInput = z.infer<typeof calculateOverheadSchema>;
export type AddOverheadItemInput = z.infer<typeof addOverheadItemSchema>;
export type AddDiscountItemInput = z.infer<typeof addDiscountItemSchema>;
export type ExportEstimateQuery = z.infer<typeof exportEstimateQuerySchema>;
export type GetItemsQuery = z.infer<typeof getItemsQuerySchema>;

// 明細の一括保存（Task 52.3）
export type SaveEstimateLineInput = z.infer<typeof saveEstimateLineSchema>;
export type SaveEstimateItemNodeInput = z.infer<typeof saveEstimateItemNodeSchema>;
export type SaveEstimateReportFieldsInput = z.infer<typeof saveEstimateReportFieldsSchema>;
export type SaveEstimateDraftInput = z.infer<typeof saveEstimateDraftSchema>;
