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
import logger from '../utils/logger.js';
import {
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
  ProjectNotFoundForQuantityTableError,
} from '../errors/quantityTableError.js';
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
 * findById が返す surveyImage の thumbnailUrl/originalUrl は `/api/storage/<path>` 形式の
 * 内部パスである。ストレージ設定時はこれを署名付きURLへ変換しないと、フロントの <img> から
 * 直接参照できずリンク切れになる。詳細取得（GET /:id）と保存（PUT /:id/save）で表示経路を
 * 一致させるため、両エンドポイントでこの変換を共通適用する。
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

      // 元のURLを保持（署名付きURL生成失敗時のフォールバック）
      let thumbnailUrl: string = group.surveyImage.thumbnailUrl;
      let originalUrl: string = group.surveyImage.originalUrl;

      // サムネイルURLを署名付きURLに変換
      try {
        // /api/storage/ プレフィックスを除去してパスのみを取得
        const thumbnailPath = group.surveyImage.thumbnailUrl.replace(/^\/api\/storage\//, '');
        thumbnailUrl = await storageProvider.getSignedUrl(thumbnailPath);
      } catch (error) {
        logger.warn(
          { groupId: group.id, thumbnailUrl: group.surveyImage.thumbnailUrl, error },
          'Failed to generate signed URL for thumbnail'
        );
      }

      // オリジナル画像URLを署名付きURLに変換
      try {
        // /api/storage/ プレフィックスを除去してパスのみを取得
        const originalPath = group.surveyImage.originalUrl.replace(/^\/api\/storage\//, '');
        originalUrl = await storageProvider.getSignedUrl(originalPath);
      } catch (error) {
        logger.warn(
          { groupId: group.id, originalUrl: group.surveyImage.originalUrl, error },
          'Failed to generate signed URL for original image'
        );
      }

      return {
        ...group,
        surveyImage: {
          ...group.surveyImage,
          thumbnailUrl,
          originalUrl,
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
 * フル状態同期保存（saveDraft）用の項目スキーマ
 *
 * Field Specifications 準拠の全フィールド（大項目〜備考、計算用フィールド、
 * 調整係数、丸め設定）と表示順を保持する。既存=UUID / 新規=null。
 * 新規項目はクライアント仮ID（tempId）を任意で付与できる。
 *
 * 計算パラメータは `withCalculationParams` により計算方法（判別子）に対応するスキーマで
 * 検証し、当該計算方法で使用しないキーは破棄したうえで永続化する（REQ-48 AC5, AC6）。
 * パラメータの形状から計算方法を推測することはしない。
 *
 * Requirements: 42.5, 48.5, 48.6
 */
const saveDraftItemSchema = withCalculationParams(
  z.object({
    id: z.string().uuid('項目IDの形式が不正です').nullable(),
    tempId: z.string().optional(),
    majorCategory: z.string().max(100).nullable(),
    middleCategory: z.string().max(100).nullable(),
    minorCategory: z.string().max(100).nullable(),
    customCategory: z.string().max(100).nullable(),
    workType: z.string().max(100),
    name: z.string().max(200),
    specification: z.string().max(500).nullable(),
    unit: z.string().max(50),
    calculationMethod: z.enum(['STANDARD', 'AREA_VOLUME', 'PITCH']),
    calculationParams: z.record(z.string(), z.number()).nullable(),
    adjustmentFactor: z.number().positive(),
    roundingUnit: z.number().positive(),
    quantity: z.number(),
    remarks: z.string().nullable(),
    displayOrder: z.number().int().min(0),
  })
);

/**
 * フル状態同期保存（saveDraft）用のグループスキーマ
 *
 * 既存=UUID / 新規=null。新規グループはクライアント仮ID（tempId）を任意で付与できる。
 * 写真紐づけ（surveyImageId）は参照のみ。
 *
 * Requirements: 42.5
 */
const saveDraftGroupSchema = z.object({
  id: z.string().uuid('グループIDの形式が不正です').nullable(),
  tempId: z.string().optional(),
  name: z.string().max(200),
  surveyImageId: z.string().uuid('写真IDの形式が不正です').nullable(),
  displayOrder: z.number().int().min(0),
  items: z.array(saveDraftItemSchema),
});

/**
 * フル状態同期保存（saveDraft）リクエストボディスキーマ
 *
 * 数量表名・全グループ・全項目の最終状態（表示順）と楽観ロック用の
 * expectedUpdatedAt を保持する。既存 bulk-save スキーマを統合・置換する。
 *
 * Requirements: 42.5, 42.8
 */
const saveQuantityTableDraftSchema = z.object({
  expectedUpdatedAt: z.string().datetime({ message: '日時の形式が不正です' }),
  name: z.string().max(200),
  groups: z.array(saveDraftGroupSchema),
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
 *         description: 数量表詳細
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
 *         description: 数量表が見つからない
 *       409:
 *         description: 楽観的排他制御エラー（競合）
 */
router.put(
  '/:id/save',
  authenticate,
  requirePermission('quantity_table:update'),
  validate(quantityTableIdParamSchema, 'params'),
  validate(saveQuantityTableDraftSchema, 'body'),
  async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    try {
      const { id } = req.validatedParams as { id: string };
      const actorId = req.user!.userId;
      // Zod 検証済みボディは SaveQuantityTableDraftInput と構造一致する
      const input = req.validatedBody as SaveQuantityTableDraftInput;

      const quantityTable = await quantityTableService.saveDraft(id, input, actorId);

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
 *     description: 既存の数量表を全データ（グループ・項目・写真紐づけ）含めてディープコピーする
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
