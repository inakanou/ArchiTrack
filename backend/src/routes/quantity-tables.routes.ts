/**
 * @fileoverview 数量表APIルート
 *
 * Requirements:
 * - 2.1: 数量表一覧画面で新規作成操作を行う
 * - 2.2: 数量表名を入力して作成を確定する
 * - 2.3: プロジェクトに紐づく全ての数量表を作成日時順に一覧表示する
 * - 2.4: 数量表を選択して削除操作を行う
 * - 2.5: 数量表名を編集する
 * - 1.2: 数量表セクションが表示されている状態で、数量表の総数を表示する
 * - 1.3: プロジェクトに数量表が存在する場合、直近の数量表カードを一覧表示する
 *
 * 案件の閲覧範囲（quantity-table-generation の Requirement 50、user-authentication の要件39。タスク104.1）:
 * 全経路で requirePermission の後に quantity-table-project-scope.middleware の判定部品を置き、
 * 範囲外は不在と同じ汎用の 404 にする。詳細と保存の応答の署名付きURLは、判定を通った数量表についてだけ組み立てる。
 *
 * @module routes/quantity-tables
 */

import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { QuantityTableService } from '../services/quantity-table.service.js';
import { AuditLogService } from '../services/audit-log.service.js';
import getPrismaClient from '../db.js';
import { validate } from '../middleware/validate.middleware.js';
import { authenticate } from '../middleware/authenticate.middleware.js';
import { requirePermission } from '../middleware/authorize.middleware.js';
import { projectScopeDenialContextOf } from '../middleware/project-scope.middleware.js';
import {
  requireProjectParamScope,
  requireQuantityTableProjectScope,
} from '../middleware/quantity-table-project-scope.middleware.js';
import logger from '../utils/logger.js';
import {
  CALCULATION_METHODS,
  createQuantityTableSchema,
  updateQuantityTableSchema,
  copyQuantityTableSchema,
  quantityTableIdParamSchema,
  projectIdParamSchema,
  withCalculationParams,
} from '../schemas/quantity-table.schema.js';
import {
  QuantityTableNotFoundError,
  QuantityTableConflictError,
  QuantityTableValidationError,
  QuantityTableSaveBusyError,
  ProjectNotFoundForQuantityTableError,
} from '../errors/quantityTableError.js';
import { SurveyDeletedError, sendSurveyDeletedProblem } from '../utils/survey-deleted-guard.js';
import { FIELD_CONSTRAINTS } from '../services/quantity-field-validation.service.js';
import { SurveyImageNotFoundError } from '../errors/siteSurveyError.js';
import type {
  SaveQuantityTableDraftInput,
  QuantityTableDetailWithItems,
} from '../services/quantity-table.service.js';
import { getStorageProvider, isStorageConfigured } from '../storage/index.js';

// mergeParams: true を設定してネストされたルートからprojectIdを取得できるようにする
const router = Router({ mergeParams: true });
const prisma = getPrismaClient();
const auditLogService = new AuditLogService({ prisma });
const quantityTableService = new QuantityTableService({
  prisma,
  auditLogService,
});

/**
 * 数量グループに紐づく surveyImage の URL を署名付きURLへ変換する。
 *
 * findById が返す surveyImage の thumbnailUrl/originalUrl/annotatedThumbnailUrl は
 * `/api/storage/<path>` 形式の内部パスである。ストレージ設定時はこれを署名付きURLへ
 * 変換しないと、フロントの <img> から直接参照できずリンク切れになる。詳細取得（GET /:id）と
 * 保存（PUT /:id/save）で表示経路を一致させるため、両エンドポイントでこの変換を共通適用する。
 *
 * 注釈付きサムネイル（annotatedThumbnailUrl）は、数量グループ表題部の写真表示で
 * クライアントサイドの注釈合成（グループごとの注釈取得APIとFabric.jsレンダリング）を
 * 省略するために用いる。変換対象から漏れると表示できずクライアント合成へ退行するため、
 * thumbnailUrl/originalUrl と同じ経路で変換する。
 * Requirements: quantity-table-generation 49.1（写真表示に必要な情報をまとめて取得する）
 *
 * **現調画像の所属（テナント境界）はここでは検めない。** 検査は取得の正典である
 * `QuantityTableService.findById` の写像に置いてある（Task 86.3）。ここに置かなかった理由は
 * 二つある。(1) 本関数はストレージ未設定時に冒頭で早期 return するため、ストレージの設定に
 * よって検査の有無が変わってしまう。テナント境界をストレージの設定に依存させてはならない。
 * (2) 本関数が受け取る `QuantityTableDetailWithItems` の写真サマリは所属プロジェクトを
 * 持たないため、ここで検めるには追加の問い合わせが要る。`findById` の側なら既存の問い合わせの
 * 取得項目を広げるだけで済む。
 * したがって本関数へ届く時点で所属違反の紐付けは既に落ちている。
 */
async function enrichQuantityTableSignedUrls(
  quantityTable: QuantityTableDetailWithItems
): Promise<QuantityTableDetailWithItems> {
  if (!isStorageConfigured() || !quantityTable.groups) {
    return quantityTable;
  }

  const storageProvider = getStorageProvider();
  if (!storageProvider) {
    return quantityTable;
  }

  const enrichedGroups = await Promise.all(
    quantityTable.groups.map(async (group) => {
      if (!group.surveyImage) {
        return group;
      }

      /**
       * `/api/storage/<path>` 形式の内部パスを署名付きURLへ変換する。
       * 生成に失敗した場合は元のURLをそのまま返す（既存のフォールバック挙動を維持）。
       */
      const toSignedUrl = async <T extends string | null>(
        internalUrl: T,
        label: string
      ): Promise<T> => {
        if (!internalUrl) {
          return internalUrl;
        }
        try {
          // /api/storage/ プレフィックスを除去してパスのみを取得
          const objectKey = internalUrl.replace(/^\/api\/storage\//, '');
          return (await storageProvider.getSignedUrl(objectKey)) as T;
        } catch (error) {
          logger.warn(
            { groupId: group.id, internalUrl, error },
            `Failed to generate signed URL for ${label}`
          );
          return internalUrl;
        }
      };

      const [thumbnailUrl, originalUrl, annotatedThumbnailUrl] = await Promise.all([
        toSignedUrl(group.surveyImage.thumbnailUrl, 'thumbnail'),
        toSignedUrl(group.surveyImage.originalUrl, 'original image'),
        toSignedUrl(group.surveyImage.annotatedThumbnailUrl, 'annotated thumbnail'),
      ]);

      return {
        ...group,
        surveyImage: {
          ...group.surveyImage,
          thumbnailUrl,
          originalUrl,
          annotatedThumbnailUrl,
        },
      };
    })
  );

  return {
    ...quantityTable,
    groups: enrichedGroups,
  };
}

/**
 * 数量表一覧取得クエリスキーマ
 */
const quantityTableListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
  sort: z.enum(['createdAt', 'updatedAt', 'name']).default('createdAt'),
  order: z.enum(['asc', 'desc']).default('desc'),
});

/**
 * 直近N件取得のクエリパラメータスキーマ
 */
const summaryQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(10).default(2),
});

/**
 * 作成時のリクエストボディ用スキーマ（projectIdはURLパラメータから取得するため除外）
 */
const createQuantityTableBodySchema = createQuantityTableSchema.omit({ projectId: true });

/**
 * 更新リクエストボディ用スキーマ（expectedUpdatedAt必須）
 */
const updateQuantityTableRequestSchema = updateQuantityTableSchema.extend({
  expectedUpdatedAt: z.string().datetime({ message: '日時の形式が不正です' }),
});

/**
 * 保存（saveDraft）の本文の仮 ID・計算用パラメータのキー・備考の上限
 * （Requirement 42.13。OWASP API Security の API4）
 *
 * 値は利用者が 2026-10-31 に確定した（design.md の「2026-10-31 の追加: 件数の上限の画面の表示と、
 * 本文の文字列・計算用パラメータ・個別の操作の配列の上限」の「決定」の表）。超えた要求は
 * 本文の検証（`validate` の 400）で拒み、サービスを呼ばない。
 */
/** 数量グループ・数量項目の仮 ID（tempId）の長さの上限（下限は 1 文字） */
export const SAVE_QUANTITY_TABLE_MAX_TEMP_ID_LENGTH = 100;
/** 計算用パラメータ（calculationParams）のキーの数の上限 */
export const SAVE_QUANTITY_TABLE_MAX_CALCULATION_PARAM_KEYS = 10;
/** 計算用パラメータ（calculationParams）の各キーの長さの上限 */
export const SAVE_QUANTITY_TABLE_MAX_CALCULATION_PARAM_KEY_LENGTH = 50;
/**
 * 備考（remarks）の文字数の上限
 *
 * 幅の検証（`FIELD_CONSTRAINTS.REMARKS`。全角を 2、ASCII と半角カタカナを 1 として数える）の
 * 半角の上限と同じ値。Zod の文字列の長さは符号位置の数で数え、符号位置ごとの幅は 1 以上なので、
 * 符号位置の数は幅を超えない。このため幅の検証を通る値を
 * 拒まない。幅の検証は従来どおりサービスに残し、ここは 51 文字以上を早く拒むだけである。
 */
export const SAVE_QUANTITY_TABLE_MAX_REMARKS_LENGTH = FIELD_CONSTRAINTS.REMARKS.hankaku;

/** 仮 ID・計算用パラメータのキー・備考の上限を超えたときの日本語のメッセージ（Requirement 42.13） */
export const SAVE_QUANTITY_TABLE_FIELD_LIMIT_MESSAGES = {
  TEMP_ID_LENGTH: `仮IDは1文字以上${SAVE_QUANTITY_TABLE_MAX_TEMP_ID_LENGTH}文字以内で指定してください`,
  CALCULATION_PARAM_KEYS_TOO_MANY: `計算用パラメータは${SAVE_QUANTITY_TABLE_MAX_CALCULATION_PARAM_KEYS}項目以内で指定してください`,
  CALCULATION_PARAM_KEY_TOO_LONG: `計算用パラメータの名前は${SAVE_QUANTITY_TABLE_MAX_CALCULATION_PARAM_KEY_LENGTH}文字以内で指定してください`,
  // 幅の検証（validateRemarks）と同じ文言を、同じ FIELD_CONSTRAINTS.REMARKS の値から組み立てる
  REMARKS_TOO_LONG: `備考は全角${FIELD_CONSTRAINTS.REMARKS.zenkaku}文字/半角${FIELD_CONSTRAINTS.REMARKS.hankaku}文字以内で入力してください`,
} as const;

/** 数量グループ・数量項目の仮 ID（1〜100 文字。既存の要素は省略する） */
const saveDraftTempIdSchema = z
  .string()
  .min(1, SAVE_QUANTITY_TABLE_FIELD_LIMIT_MESSAGES.TEMP_ID_LENGTH)
  .max(
    SAVE_QUANTITY_TABLE_MAX_TEMP_ID_LENGTH,
    SAVE_QUANTITY_TABLE_FIELD_LIMIT_MESSAGES.TEMP_ID_LENGTH
  )
  .optional();

/**
 * 計算用パラメータ（数値のみの連想配列）。キーの数と各キーの長さに上限を付ける。
 *
 * どちらも `abort: true` で、超えたら同じ数量項目の計算方法ごとの検証（`withCalculationParams`）を
 * 走らせずに拒む（design.md の 42.13 の「決定」）。`withCalculationParams` の条件は変えない。
 */
const saveDraftCalculationParamsSchema = z
  .record(z.string(), z.number())
  .refine(
    (params) => Object.keys(params).length <= SAVE_QUANTITY_TABLE_MAX_CALCULATION_PARAM_KEYS,
    {
      message: SAVE_QUANTITY_TABLE_FIELD_LIMIT_MESSAGES.CALCULATION_PARAM_KEYS_TOO_MANY,
      abort: true,
    }
  )
  .refine(
    (params) =>
      Object.keys(params).every(
        (key) => key.length <= SAVE_QUANTITY_TABLE_MAX_CALCULATION_PARAM_KEY_LENGTH
      ),
    {
      message: SAVE_QUANTITY_TABLE_FIELD_LIMIT_MESSAGES.CALCULATION_PARAM_KEY_TOO_LONG,
      abort: true,
    }
  )
  .nullable();

/** 備考（50 文字まで。幅の検証はサービスに残す） */
const saveDraftRemarksSchema = z
  .string()
  .max(
    SAVE_QUANTITY_TABLE_MAX_REMARKS_LENGTH,
    SAVE_QUANTITY_TABLE_FIELD_LIMIT_MESSAGES.REMARKS_TOO_LONG
  )
  .nullable();

/**
 * フル状態同期保存（saveDraft）用の項目スキーマ
 *
 * Field Specifications 準拠の全フィールド（大項目〜備考、計算用フィールド、
 * 調整係数、丸め設定）と表示順を保持する。既存=UUID / 新規=null。
 * 新規項目はクライアント仮ID（tempId）を任意で付与できる。
 *
 * 計算方法は `CALCULATION_METHODS`（quantity-table.schema.ts）を単一情報源として参照する。
 * リテラルを直書きすると計算方法の追加時にここへの追随漏れが起き、当該計算方法の数量項目を
 * 含む数量表の保存が 400 で弾かれる（「箇所数」で実際に発生した不具合。REQ-47 AC15, AC18）。
 *
 * 計算パラメータは `withCalculationParams` により計算方法（判別子）に対応するスキーマで
 * 検証し、当該計算方法で使用しないキーは破棄したうえで永続化する（REQ-48 AC5, AC6）。
 * パラメータの形状から計算方法を推測することはしない。
 *
 * Requirements: 42.5, 47.15, 47.18, 48.5, 48.6
 */
const saveDraftItemSchema = withCalculationParams(
  z.object({
    id: z.string().uuid('項目IDの形式が不正です').nullable(),
    tempId: saveDraftTempIdSchema,
    majorCategory: z.string().max(100).nullable(),
    middleCategory: z.string().max(100).nullable(),
    minorCategory: z.string().max(100).nullable(),
    customCategory: z.string().max(100).nullable(),
    workType: z.string().max(100),
    name: z.string().max(200),
    specification: z.string().max(500).nullable(),
    unit: z.string().max(50),
    calculationMethod: z.enum(CALCULATION_METHODS),
    calculationParams: saveDraftCalculationParamsSchema,
    // 数値欄の範囲はここでは課さない。範囲の唯一の出所は
    // `quantity-field-validation.service.ts` の `FIELD_CONSTRAINTS` であり、
    // 検証は `validateDraft` → `validateItemFieldSpecs` が担う（Task 85.1）。
    // `quantity` が以前からこの層立てである（下行）。
    adjustmentFactor: z.number(),
    roundingUnit: z.number(),
    quantity: z.number(),
    remarks: saveDraftRemarksSchema,
    displayOrder: z.number().int().min(0),
  })
);

/**
 * 保存（saveDraft）の本文の配列の件数の上限（Requirement 42.11。OWASP API Security の API4）
 *
 * 値は利用者が 2026-10-31 に確定した（design.md の「2026-10-31 の追加: 保存の本文の配列の
 * 件数の上限」の「決定」の表）。超えた要求は本文の検証（`validate` の 400）で拒み、
 * サービスを呼ばない。
 */
/** 一つの数量表の数量グループの数の上限 */
export const SAVE_QUANTITY_TABLE_MAX_GROUPS = 1000;
/** 一つの数量グループの数量項目の数の上限 */
export const SAVE_QUANTITY_TABLE_MAX_ITEMS_PER_GROUP = 2000;
/** 一つの数量表の数量項目の総数の上限 */
export const SAVE_QUANTITY_TABLE_MAX_TOTAL_ITEMS = 5000;

/** 件数の上限を超えたときの日本語のメッセージ（Requirement 42.11） */
export const SAVE_QUANTITY_TABLE_LIMIT_MESSAGES = {
  GROUPS_TOO_MANY: `数量グループは${SAVE_QUANTITY_TABLE_MAX_GROUPS}件以内で保存してください`,
  ITEMS_PER_GROUP_TOO_MANY: `一つの数量グループの数量項目は${SAVE_QUANTITY_TABLE_MAX_ITEMS_PER_GROUP}件以内で保存してください`,
  TOTAL_ITEMS_TOO_MANY: `数量項目は合計${SAVE_QUANTITY_TABLE_MAX_TOTAL_ITEMS}件以内で保存してください`,
} as const;

/**
 * フル状態同期保存（saveDraft）用のグループスキーマ
 *
 * 既存=UUID / 新規=null。新規グループはクライアント仮ID（tempId）を任意で付与できる。
 * 写真紐づけ（surveyImageId）は参照のみ。数量項目の数は
 * `SAVE_QUANTITY_TABLE_MAX_ITEMS_PER_GROUP` までとする（42.11）。
 *
 * Requirements: 42.5, 42.11
 */
const saveDraftGroupSchema = z.object({
  id: z.string().uuid('グループIDの形式が不正です').nullable(),
  tempId: saveDraftTempIdSchema,
  name: z.string().max(200),
  surveyImageId: z.string().uuid('写真IDの形式が不正です').nullable(),
  displayOrder: z.number().int().min(0),
  items: z.array(saveDraftItemSchema).max(SAVE_QUANTITY_TABLE_MAX_ITEMS_PER_GROUP, {
    message: SAVE_QUANTITY_TABLE_LIMIT_MESSAGES.ITEMS_PER_GROUP_TOO_MANY,
  }),
});

/**
 * フル状態同期保存（saveDraft）リクエストボディスキーマ
 *
 * 数量表名・全グループ・全項目の最終状態（表示順）と楽観ロック用の
 * expectedUpdatedAt を保持する。既存 bulk-save スキーマを統合・置換する。
 * 数量グループの数は `SAVE_QUANTITY_TABLE_MAX_GROUPS` まで、数量項目の総数は
 * `SAVE_QUANTITY_TABLE_MAX_TOTAL_ITEMS` まで（`superRefine` で数える）とする（42.11）。
 *
 * Requirements: 42.5, 42.8, 42.11
 */
const saveQuantityTableDraftSchema = z
  .object({
    expectedUpdatedAt: z.string().datetime({ message: '日時の形式が不正です' }),
    name: z.string().max(200),
    groups: z.array(saveDraftGroupSchema).max(SAVE_QUANTITY_TABLE_MAX_GROUPS, {
      message: SAVE_QUANTITY_TABLE_LIMIT_MESSAGES.GROUPS_TOO_MANY,
    }),
  })
  .superRefine((body, ctx) => {
    const totalItems = body.groups.reduce((sum, group) => sum + group.items.length, 0);
    if (totalItems > SAVE_QUANTITY_TABLE_MAX_TOTAL_ITEMS) {
      ctx.addIssue({
        code: 'custom',
        path: ['groups'],
        message: SAVE_QUANTITY_TABLE_LIMIT_MESSAGES.TOTAL_ITEMS_TOO_MANY,
      });
    }
  });

/**
 * @swagger
 * /api/projects/{projectId}/quantity-tables:
 *   post:
 *     summary: 数量表作成
 *     description: 新しい数量表を作成
 *     tags:
 *       - Quantity Tables
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: プロジェクトID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *             properties:
 *               name:
 *                 type: string
 *                 maxLength: 200
 *     responses:
 *       201:
 *         description: 数量表作成成功
 *       400:
 *         description: バリデーションエラー
 *       401:
 *         description: 認証エラー
 *       403:
 *         description: 権限不足
 *       404:
 *         description: プロジェクトが見つからない
 */
router.post(
  '/',
  authenticate,
  requirePermission('quantity_table:create'),
  validate(projectIdParamSchema, 'params'),
  requireProjectParamScope('projectId'),
  validate(createQuantityTableBodySchema, 'body'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { projectId } = req.validatedParams as { projectId: string };
      const actorId = req.user!.userId;
      const validatedBody = req.validatedBody as { name: string };

      const input = {
        ...validatedBody,
        projectId,
      };

      const quantityTable = await quantityTableService.create(input, actorId);

      logger.info(
        { userId: actorId, quantityTableId: quantityTable.id, projectId, name: quantityTable.name },
        'Quantity table created successfully'
      );

      res.status(201).json(quantityTable);
    } catch (error) {
      if (error instanceof ProjectNotFoundForQuantityTableError) {
        res.status(404).json({
          type: 'https://architrack.example.com/problems/project-not-found',
          title: 'Project Not Found',
          status: 404,
          detail: error.message,
          code: 'PROJECT_NOT_FOUND',
          projectId: error.projectId,
        });
        return;
      }
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/projects/{projectId}/quantity-tables/summary:
 *   get:
 *     summary: 数量表サマリー取得
 *     description: プロジェクトに紐付く直近の数量表と総数を取得
 *     tags:
 *       - Quantity Tables
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: プロジェクトID
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 2
 *           minimum: 1
 *           maximum: 10
 *         description: 取得件数（デフォルト2、最大10）
 *     responses:
 *       200:
 *         description: 直近N件の数量表と総数
 *       401:
 *         description: 認証エラー
 *       403:
 *         description: 権限不足
 */
router.get(
  '/summary',
  authenticate,
  requirePermission('quantity_table:read'),
  validate(projectIdParamSchema, 'params'),
  requireProjectParamScope('projectId'),
  validate(summaryQuerySchema, 'query'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { projectId } = req.validatedParams as { projectId: string };
      const { limit } = req.validatedQuery as { limit: number };

      const result = await quantityTableService.findLatestByProjectId(projectId, limit);

      logger.debug(
        { userId: req.user?.userId, projectId, limit, totalCount: result.totalCount },
        'Quantity tables summary retrieved'
      );

      res.json(result);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/projects/{projectId}/quantity-tables:
 *   get:
 *     summary: 数量表一覧取得
 *     description: プロジェクトに紐付く数量表の一覧を取得（ページネーション、検索、ソート対応）
 *     tags:
 *       - Quantity Tables
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: プロジェクトID
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: ページ番号（1以上）
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *           maximum: 100
 *         description: 1ページあたりの表示件数（1〜100）
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: 検索キーワード（名前の部分一致）
 *       - in: query
 *         name: sort
 *         schema:
 *           type: string
 *           enum: [createdAt, updatedAt, name]
 *           default: createdAt
 *         description: ソートフィールド
 *       - in: query
 *         name: order
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *           default: desc
 *         description: ソート順序
 *     responses:
 *       200:
 *         description: 数量表一覧
 *       401:
 *         description: 認証エラー
 *       403:
 *         description: 権限不足
 */
router.get(
  '/',
  authenticate,
  requirePermission('quantity_table:read'),
  validate(projectIdParamSchema, 'params'),
  requireProjectParamScope('projectId'),
  validate(quantityTableListQuerySchema, 'query'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { projectId } = req.validatedParams as { projectId: string };
      const validatedQuery = req.validatedQuery as {
        page: number;
        limit: number;
        sort: 'createdAt' | 'updatedAt' | 'name';
        order: 'asc' | 'desc';
        search?: string;
      };

      const { page, limit, sort, order, search } = validatedQuery;

      const result = await quantityTableService.findByProjectId(
        projectId,
        { search },
        { page, limit },
        { sort, order }
      );

      logger.debug(
        { userId: req.user?.userId, projectId, page, limit, total: result.pagination.total },
        'Quantity tables list retrieved'
      );

      res.json(result);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/quantity-tables/{id}:
 *   get:
 *     summary: 数量表詳細取得
 *     description: 数量表の詳細情報を取得
 *     tags:
 *       - Quantity Tables
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: 数量表ID
 *     responses:
 *       200:
 *         description: |
 *           数量表詳細。他プロジェクトの現調画像を指す既存の紐付けは写真サマリと surveyImageId を
 *           落として返し（Task 86.3）、落とした紐付けを持つグループのIDを
 *           droppedSurveyImageLinkGroupIds（落としていなければ空配列）で返す（Task 86.5）。
 *           他プロジェクトの画像IDは返さない。
 *       401:
 *         description: 認証エラー
 *       403:
 *         description: 権限不足
 *       404:
 *         description: 数量表が見つからない
 */
router.get(
  '/:id',
  authenticate,
  requirePermission('quantity_table:read'),
  validate(quantityTableIdParamSchema, 'params'),
  requireQuantityTableProjectScope('id'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.validatedParams as { id: string };

      const quantityTable = await quantityTableService.findById(id);

      if (!quantityTable) {
        res.status(404).json({
          type: 'https://architrack.example.com/problems/quantity-table-not-found',
          title: 'Quantity Table Not Found',
          status: 404,
          detail: `Quantity table not found: ${id}`,
          code: 'QUANTITY_TABLE_NOT_FOUND',
          quantityTableId: id,
        });
        return;
      }

      // グループ内のsurveyImageのURLを署名付きURLに変換
      const enrichedQuantityTable = await enrichQuantityTableSignedUrls(quantityTable);

      logger.debug(
        { userId: req.user?.userId, quantityTableId: id },
        'Quantity table detail retrieved'
      );

      res.json(enrichedQuantityTable);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/quantity-tables/{id}:
 *   put:
 *     summary: 数量表更新
 *     description: 既存の数量表情報を更新（楽観的排他制御）
 *     tags:
 *       - Quantity Tables
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: 数量表ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - expectedUpdatedAt
 *             properties:
 *               name:
 *                 type: string
 *                 maxLength: 200
 *               expectedUpdatedAt:
 *                 type: string
 *                 format: date-time
 *     responses:
 *       200:
 *         description: 数量表更新成功
 *       400:
 *         description: バリデーションエラー
 *       401:
 *         description: 認証エラー
 *       403:
 *         description: 権限不足
 *       404:
 *         description: 数量表が見つからない
 *       409:
 *         description: 楽観的排他制御エラー（競合）
 */
router.put(
  '/:id',
  authenticate,
  requirePermission('quantity_table:update'),
  validate(quantityTableIdParamSchema, 'params'),
  requireQuantityTableProjectScope('id'),
  validate(updateQuantityTableRequestSchema, 'body'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.validatedParams as { id: string };
      const actorId = req.user!.userId;
      const { expectedUpdatedAt, ...updateData } = req.validatedBody as {
        expectedUpdatedAt: string;
        name: string;
      };

      const quantityTable = await quantityTableService.update(
        id,
        updateData,
        actorId,
        new Date(expectedUpdatedAt)
      );

      logger.info({ userId: actorId, quantityTableId: id }, 'Quantity table updated successfully');

      res.json(quantityTable);
    } catch (error) {
      if (error instanceof QuantityTableNotFoundError) {
        res.status(404).json({
          type: 'https://architrack.example.com/problems/quantity-table-not-found',
          title: 'Quantity Table Not Found',
          status: 404,
          detail: error.message,
          code: 'QUANTITY_TABLE_NOT_FOUND',
        });
        return;
      }
      if (error instanceof QuantityTableConflictError) {
        const conflictDetails = error.details as Record<string, unknown> | undefined;
        res.status(409).json({
          type: 'https://architrack.example.com/problems/quantity-table-conflict',
          title: 'Conflict',
          status: 409,
          detail: error.message,
          code: 'QUANTITY_TABLE_CONFLICT',
          ...(conflictDetails ?? {}),
        });
        return;
      }
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/quantity-tables/{id}/save:
 *   put:
 *     summary: 数量表フル状態同期保存
 *     description: >-
 *       編集画面のクライアントサイド編集状態（数量表名・全グループ・全項目の最終状態）を
 *       受領し、DB現状と差分比較して単一トランザクションで同期保存する（作成/更新/削除/並び替え）。
 *       楽観的排他制御は expectedUpdatedAt で実施する。既存 bulk-save を統合・置換した
 *       編集画面唯一の書き込みエンドポイント。
 *     tags:
 *       - Quantity Tables
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: 数量表ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - expectedUpdatedAt
 *               - name
 *               - groups
 *             properties:
 *               expectedUpdatedAt:
 *                 type: string
 *                 format: date-time
 *               name:
 *                 type: string
 *                 maxLength: 200
 *               groups:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required:
 *                     - id
 *                     - name
 *                     - surveyImageId
 *                     - displayOrder
 *                     - items
 *                   properties:
 *                     id:
 *                       type: string
 *                       format: uuid
 *                       nullable: true
 *                     tempId:
 *                       type: string
 *                     name:
 *                       type: string
 *                     surveyImageId:
 *                       type: string
 *                       format: uuid
 *                       nullable: true
 *                     displayOrder:
 *                       type: integer
 *                     items:
 *                       type: array
 *                       items:
 *                         type: object
 *     responses:
 *       200:
 *         description: フル状態同期保存成功（最新のQuantityTableDetailを返却）
 *       400:
 *         description: バリデーションエラー（リクエスト形式または整合性検証）
 *       401:
 *         description: 認証エラー
 *       403:
 *         description: 権限不足
 *       404:
 *         description: |
 *           数量表が見つからない（code: QUANTITY_TABLE_NOT_FOUND）、または指定した現調画像が
 *           存在しない（code: SURVEY_IMAGE_NOT_FOUND。見つからなかった画像IDを surveyImageId で返す）
 *       409:
 *         description: 楽観的排他制御エラー（競合）
 *       410:
 *         description: |
 *           指定した現調画像の親の現場調査が論理削除済み（code: SURVEY_DELETED）。
 *           削除された現場調査IDを surveyId で返し、原因のグループを
 *           groups[i].surveyImageId（i は payload 上のグループの位置）で名指す（Task 90.2）
 *       503:
 *         description: |
 *           同一数量表への先行の保存が長引き、行ロックの待機が上限（2 秒）を超えた
 *           （code: QUANTITY_TABLE_SAVE_BUSY。Task 92.5）。変更は一切保存されていない。
 *           時間をおいて再送すれば解消する種類の失敗である
 */
router.put(
  '/:id/save',
  authenticate,
  requirePermission('quantity_table:update'),
  validate(quantityTableIdParamSchema, 'params'),
  requireQuantityTableProjectScope('id'),
  validate(saveQuantityTableDraftSchema, 'body'),
  async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    try {
      const { id } = req.validatedParams as { id: string };
      const actorId = req.user!.userId;
      // Zod 検証済みボディは SaveQuantityTableDraftInput と構造一致する
      const input = req.validatedBody as SaveQuantityTableDraftInput;

      const quantityTable = await quantityTableService.saveDraft(
        id,
        input,
        actorId,
        projectScopeDenialContextOf(req)
      );

      // 保存直後の応答でも詳細取得（GET /:id）と同様に surveyImage を署名付きURLへ変換し、
      // 保存後にグループ画像がリンク切れになる事象を防ぐ。
      const enrichedQuantityTable = await enrichQuantityTableSignedUrls(quantityTable);

      logger.info(
        {
          userId: actorId,
          quantityTableId: id,
          groupCount: input.groups.length,
        },
        'Quantity table draft saved successfully'
      );

      res.json(enrichedQuantityTable);
    } catch (error) {
      // 論理削除された現場調査の画像は 410 で拒否する（site-survey の5経路と同じ扱い）
      if (error instanceof SurveyDeletedError) {
        sendSurveyDeletedProblem(res, error);
        return;
      }
      if (error instanceof QuantityTableNotFoundError) {
        res.status(404).json({
          type: 'https://architrack.example.com/problems/quantity-table-not-found',
          title: 'Quantity Table Not Found',
          status: 404,
          detail: error.message,
          code: 'QUANTITY_TABLE_NOT_FOUND',
        });
        return;
      }
      // 実在しない現調画像を指した保存は 404 で拒む。写しは数量グループの紐付け経路
      // （POST /api/quantity-tables/:quantityTableId/groups, PUT /api/quantity-groups/:id）と
      // 同一にする。同じ不変条件に対して経路ごとに違う応答を返さないためである（Task 86.2）
      if (error instanceof SurveyImageNotFoundError) {
        res.status(404).json({
          type: 'https://architrack.example.com/problems/survey-image-not-found',
          title: 'Survey Image Not Found',
          status: 404,
          detail: error.message,
          code: 'SURVEY_IMAGE_NOT_FOUND',
          // 画面が原因のグループを引き当てるための画像ID（Task 86.5。3経路で同じ項目を返す）
          surveyImageId: error.surveyImageId,
        });
        return;
      }
      if (error instanceof QuantityTableConflictError) {
        const conflictDetails = error.details as Record<string, unknown> | undefined;
        res.status(409).json({
          type: 'https://architrack.example.com/problems/quantity-table-conflict',
          title: 'Conflict',
          status: 409,
          detail: error.message,
          code: 'QUANTITY_TABLE_CONFLICT',
          ...(conflictDetails ?? {}),
        });
        return;
      }
      if (error instanceof QuantityTableValidationError) {
        // 整合性検証エラー（文字数・数値範囲・計算整合）。問題箇所を明示する（REQ-11.4, 42.9）
        const validationDetails = error.details as Record<string, unknown> | undefined;
        res.status(400).json({
          type: 'https://architrack.example.com/problems/quantity-table-validation-error',
          title: 'Validation Error',
          status: 400,
          detail: error.message,
          code: 'QUANTITY_TABLE_VALIDATION_ERROR',
          ...(validationDetails ?? {}),
        });
        return;
      }
      // ロック待ちの上限超過（Task 92.5）は混雑による一時的な失敗であり、時間をおけば
      // 解消する。恒久的な失敗（下の 500）と同じ文言・同じコードへ畳むと、運用側が
      // 「混雑しているだけ」と「本当に壊れている」を区別できない。画面に届く文言は
      // 一般の失敗と同じ（再試行を促す案内）であり、増えるのは運用側の識別である。
      if (error instanceof QuantityTableSaveBusyError) {
        logger.warn(
          {
            userId: req.user?.userId,
            quantityTableId: (req.validatedParams as { id?: string })?.id,
            code: 'QUANTITY_TABLE_SAVE_BUSY',
            details: error.details,
          },
          'Quantity table draft save aborted by lock wait timeout'
        );
        res.status(503).json({
          type: 'https://architrack.example.com/problems/quantity-table-save-busy',
          title: 'Service Unavailable',
          status: 503,
          detail: error.message,
          code: 'QUANTITY_TABLE_SAVE_BUSY',
        });
        return;
      }
      // 予期しないエラー（トランザクションエラー含む）は500として返却（REQ-42.9）
      logger.error(
        { error, quantityTableId: (req.validatedParams as { id?: string })?.id },
        'Failed to save quantity table draft'
      );
      res.status(500).json({
        type: 'https://architrack.example.com/problems/internal-server-error',
        title: 'Internal Server Error',
        status: 500,
        detail: '保存処理中にエラーが発生しました',
        code: 'QUANTITY_TABLE_SAVE_ERROR',
      });
    }
  }
);

/**
 * @swagger
 * /api/quantity-tables/{id}/copy:
 *   post:
 *     summary: 数量表コピー
 *     description: |
 *       既存の数量表を全データ（グループ・項目・写真紐づけ）含めてディープコピーする。
 *       ただし当該数量表と別のプロジェクトの現場調査画像を指す紐づけは複製先へ写さない
 *       （複製先の surveyImageId は null になる。複製自体は成功する）。
 *     tags:
 *       - Quantity Tables
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: コピー元の数量表ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *             properties:
 *               name:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 200
 *                 description: コピー先の数量表名
 *     responses:
 *       201:
 *         description: 数量表コピー成功
 *       400:
 *         description: バリデーションエラー
 *       401:
 *         description: 認証エラー
 *       403:
 *         description: 権限不足
 *       404:
 *         description: コピー元の数量表が見つからない
 *       500:
 *         description: コピー処理中のサーバーエラー
 */
router.post(
  '/:id/copy',
  authenticate,
  requirePermission('quantity_table:create'),
  validate(quantityTableIdParamSchema, 'params'),
  requireQuantityTableProjectScope('id'),
  validate(copyQuantityTableSchema, 'body'),
  async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    try {
      const { id } = req.validatedParams as { id: string };
      const actorId = req.user!.userId;
      const validatedBody = req.validatedBody as { name: string };

      const copiedTable = await quantityTableService.copy(id, validatedBody, actorId);

      logger.info(
        {
          userId: actorId,
          sourceTableId: id,
          copiedTableId: copiedTable.id,
          name: copiedTable.name,
        },
        'Quantity table copied successfully'
      );

      res.status(201).json(copiedTable);
    } catch (error) {
      if (error instanceof QuantityTableNotFoundError) {
        res.status(404).json({
          type: 'https://architrack.example.com/problems/quantity-table-not-found',
          title: 'Quantity Table Not Found',
          status: 404,
          detail: error.message,
          code: 'QUANTITY_TABLE_NOT_FOUND',
        });
        return;
      }
      // 予期しないエラー（トランザクションエラー含む）は500として返却
      logger.error(
        { error, quantityTableId: (req.validatedParams as { id?: string })?.id },
        'Failed to copy quantity table'
      );
      res.status(500).json({
        type: 'https://architrack.example.com/problems/internal-server-error',
        title: 'Internal Server Error',
        status: 500,
        detail: 'コピー処理中にエラーが発生しました',
        code: 'QUANTITY_TABLE_COPY_ERROR',
      });
    }
  }
);

/**
 * @swagger
 * /api/quantity-tables/{id}:
 *   delete:
 *     summary: 数量表削除
 *     description: 数量表を論理削除（関連するグループ・項目も自動的にアクセス不可）
 *     tags:
 *       - Quantity Tables
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: 数量表ID
 *     responses:
 *       204:
 *         description: 数量表削除成功
 *       401:
 *         description: 認証エラー
 *       403:
 *         description: 権限不足
 *       404:
 *         description: 数量表が見つからない
 */
router.delete(
  '/:id',
  authenticate,
  requirePermission('quantity_table:delete'),
  validate(quantityTableIdParamSchema, 'params'),
  requireQuantityTableProjectScope('id'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.validatedParams as { id: string };
      const actorId = req.user!.userId;

      await quantityTableService.delete(id, actorId);

      logger.info({ userId: actorId, quantityTableId: id }, 'Quantity table deleted successfully');

      res.status(204).send();
    } catch (error) {
      if (error instanceof QuantityTableNotFoundError) {
        res.status(404).json({
          type: 'https://architrack.example.com/problems/quantity-table-not-found',
          title: 'Quantity Table Not Found',
          status: 404,
          detail: error.message,
          code: 'QUANTITY_TABLE_NOT_FOUND',
        });
        return;
      }
      next(error);
    }
  }
);

export default router;
