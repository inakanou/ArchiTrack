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
  quantityTableIdParamSchema,
  projectIdParamSchema,
} from '../schemas/quantity-table.schema.js';
import {
  QuantityTableNotFoundError,
  QuantityTableConflictError,
  ProjectNotFoundForQuantityTableError,
} from '../errors/quantityTableError.js';

// mergeParams: true を設定してネストされたルートからprojectIdを取得できるようにする
const router = Router({ mergeParams: true });
const prisma = getPrismaClient();
const auditLogService = new AuditLogService({ prisma });
const quantityTableService = new QuantityTableService({
  prisma,
  auditLogService,
});

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

      logger.debug(
        { userId: req.user?.userId, quantityTableId: id },
        'Quantity table detail retrieved'
      );

      res.json(quantityTable);
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
