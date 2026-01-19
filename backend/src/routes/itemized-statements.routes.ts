/**
 * @fileoverview 内訳書APIルート
 *
 * Requirements:
 * - 1.1: 内訳書作成（数量表選択）
 * - 1.4: 数量表未選択エラー
 * - 1.5: 数量表1つのみ選択可能
 * - 1.6: 内訳書名未入力エラー
 * - 1.7: 内訳書名最大200文字
 * - 1.9: 数量表に項目がない場合エラー
 * - 1.10: 同名内訳書重複エラー
 * - 3.1: 内訳書一覧表示
 * - 3.2: 作成日時降順
 * - 3.3: 内訳書なしメッセージ
 * - 3.4: 一覧の各行に情報を表示
 * - 3.5: 内訳書詳細画面への遷移
 * - 4.1: 内訳書詳細取得
 * - 7.1: 削除ボタン
 * - 7.2: 削除確認ダイアログ
 * - 7.4: 削除エラー表示
 * - 10.2: updatedAtフィールド
 * - 10.3: updatedAt比較（楽観的排他制御）
 * - 10.4: 409 Conflictエラー
 *
 * Task 3.1: 内訳書APIエンドポイントの実装
 * Task 3.2: エラーハンドリングの実装
 *
 * @module routes/itemized-statements
 */

import { Router, type Request, type Response, type NextFunction } from 'express';
import { ItemizedStatementService } from '../services/itemized-statement.service.js';
import { ItemizedStatementPivotService } from '../services/itemized-statement-pivot.service.js';
import { AuditLogService } from '../services/audit-log.service.js';
import getPrismaClient from '../db.js';
import { validate } from '../middleware/validate.middleware.js';
import { authenticate } from '../middleware/authenticate.middleware.js';
import { requirePermission } from '../middleware/authorize.middleware.js';
import logger from '../utils/logger.js';
import {
  createItemizedStatementSchema,
  itemizedStatementIdParamSchema,
  projectIdParamSchema,
  itemizedStatementListQuerySchema,
  latestSummaryQuerySchema,
  deleteItemizedStatementBodySchema,
} from '../schemas/itemized-statement.schema.js';
import {
  ItemizedStatementNotFoundError,
  EmptyQuantityItemsError,
  DuplicateItemizedStatementNameError,
  ItemizedStatementConflictError,
  QuantityOverflowError,
} from '../errors/itemizedStatementError.js';
import { QuantityTableNotFoundError } from '../errors/quantityTableError.js';

// mergeParams: true を設定してネストされたルートからprojectIdを取得できるようにする
const router = Router({ mergeParams: true });
const prisma = getPrismaClient();
const auditLogService = new AuditLogService({ prisma });
const pivotService = new ItemizedStatementPivotService({ prisma });
const itemizedStatementService = new ItemizedStatementService({
  prisma,
  auditLogService,
  pivotService,
});

/**
 * @swagger
 * /api/projects/{projectId}/itemized-statements:
 *   post:
 *     summary: 内訳書作成
 *     description: 数量表をピボット集計して内訳書を作成
 *     tags:
 *       - Itemized Statements
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
 *               - quantityTableId
 *             properties:
 *               name:
 *                 type: string
 *                 maxLength: 200
 *                 description: 内訳書名
 *               quantityTableId:
 *                 type: string
 *                 format: uuid
 *                 description: 集計元の数量表ID
 *     responses:
 *       201:
 *         description: 内訳書作成成功
 *       400:
 *         description: バリデーションエラー、または数量表に項目がない
 *       401:
 *         description: 認証エラー
 *       403:
 *         description: 権限不足
 *       404:
 *         description: 数量表が見つからない
 *       409:
 *         description: 同名の内訳書が既に存在
 *       422:
 *         description: 数量オーバーフロー
 */
router.post(
  '/',
  authenticate,
  requirePermission('itemized_statement:create'),
  validate(projectIdParamSchema, 'params'),
  validate(createItemizedStatementSchema, 'body'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { projectId } = req.validatedParams as { projectId: string };
      const actorId = req.user!.userId;
      const validatedBody = req.validatedBody as { name: string; quantityTableId: string };

      const input = {
        name: validatedBody.name,
        projectId,
        sourceQuantityTableId: validatedBody.quantityTableId,
      };

      const itemizedStatement = await itemizedStatementService.create(input, actorId);

      logger.info(
        {
          userId: actorId,
          itemizedStatementId: itemizedStatement.id,
          projectId,
          name: itemizedStatement.name,
        },
        'Itemized statement created successfully'
      );

      res.status(201).json(itemizedStatement);
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
      if (error instanceof EmptyQuantityItemsError) {
        res.status(400).json({
          type: 'https://architrack.example.com/problems/empty-quantity-items',
          title: 'Empty Quantity Items',
          status: 400,
          detail: error.message,
          code: 'EMPTY_QUANTITY_ITEMS',
          quantityTableId: error.quantityTableId,
        });
        return;
      }
      if (error instanceof DuplicateItemizedStatementNameError) {
        res.status(409).json({
          type: 'https://architrack.example.com/problems/duplicate-itemized-statement-name',
          title: 'Duplicate Name',
          status: 409,
          detail: error.message,
          code: 'DUPLICATE_ITEMIZED_STATEMENT_NAME',
          name: error.duplicateName,
          projectId: error.projectId,
        });
        return;
      }
      if (error instanceof QuantityOverflowError) {
        res.status(422).json({
          type: 'https://architrack.example.com/problems/quantity-overflow',
          title: 'Quantity Overflow',
          status: 422,
          detail: error.message,
          code: 'QUANTITY_OVERFLOW',
          actualValue: error.actualValue,
          minAllowed: error.minAllowed,
          maxAllowed: error.maxAllowed,
        });
        return;
      }
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/projects/{projectId}/itemized-statements/latest:
 *   get:
 *     summary: 内訳書サマリー取得
 *     description: プロジェクトに紐付く直近の内訳書と総数を取得
 *     tags:
 *       - Itemized Statements
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
 *         description: 直近N件の内訳書と総数
 *       401:
 *         description: 認証エラー
 *       403:
 *         description: 権限不足
 */
router.get(
  '/latest',
  authenticate,
  requirePermission('itemized_statement:read'),
  validate(projectIdParamSchema, 'params'),
  validate(latestSummaryQuerySchema, 'query'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { projectId } = req.validatedParams as { projectId: string };
      const { limit } = req.validatedQuery as { limit: number };

      const result = await itemizedStatementService.findLatestByProjectId(projectId, limit);

      logger.debug(
        { userId: req.user?.userId, projectId, limit, totalCount: result.totalCount },
        'Itemized statements summary retrieved'
      );

      res.json(result);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/projects/{projectId}/itemized-statements:
 *   get:
 *     summary: 内訳書一覧取得
 *     description: プロジェクトに紐付く内訳書の一覧を取得（ページネーション、検索、ソート対応）
 *     tags:
 *       - Itemized Statements
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
 *           enum: [createdAt, name]
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
 *         description: 内訳書一覧
 *       401:
 *         description: 認証エラー
 *       403:
 *         description: 権限不足
 */
router.get(
  '/',
  authenticate,
  requirePermission('itemized_statement:read'),
  validate(projectIdParamSchema, 'params'),
  validate(itemizedStatementListQuerySchema, 'query'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { projectId } = req.validatedParams as { projectId: string };
      const validatedQuery = req.validatedQuery as {
        page: number;
        limit: number;
        sort: 'createdAt' | 'name';
        order: 'asc' | 'desc';
        search?: string;
      };

      const { page, limit, sort, order, search } = validatedQuery;

      const result = await itemizedStatementService.findByProjectId(
        projectId,
        { search },
        { page, limit },
        { sort, order }
      );

      logger.debug(
        { userId: req.user?.userId, projectId, page, limit, total: result.pagination.total },
        'Itemized statements list retrieved'
      );

      res.json(result);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/itemized-statements/{id}:
 *   get:
 *     summary: 内訳書詳細取得
 *     description: 内訳書の詳細情報を取得
 *     tags:
 *       - Itemized Statements
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: 内訳書ID
 *     responses:
 *       200:
 *         description: 内訳書詳細
 *       401:
 *         description: 認証エラー
 *       403:
 *         description: 権限不足
 *       404:
 *         description: 内訳書が見つからない
 */
router.get(
  '/:id',
  authenticate,
  requirePermission('itemized_statement:read'),
  validate(itemizedStatementIdParamSchema, 'params'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.validatedParams as { id: string };

      const itemizedStatement = await itemizedStatementService.findById(id);

      if (!itemizedStatement) {
        res.status(404).json({
          type: 'https://architrack.example.com/problems/itemized-statement-not-found',
          title: 'Itemized Statement Not Found',
          status: 404,
          detail: `内訳書が見つかりません: ${id}`,
          code: 'ITEMIZED_STATEMENT_NOT_FOUND',
          itemizedStatementId: id,
        });
        return;
      }

      logger.debug(
        { userId: req.user?.userId, itemizedStatementId: id },
        'Itemized statement detail retrieved'
      );

      res.json(itemizedStatement);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/itemized-statements/{id}:
 *   delete:
 *     summary: 内訳書削除
 *     description: 内訳書を論理削除（楽観的排他制御）
 *     tags:
 *       - Itemized Statements
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: 内訳書ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - updatedAt
 *             properties:
 *               updatedAt:
 *                 type: string
 *                 format: date-time
 *                 description: 楽観的排他制御用の更新日時
 *     responses:
 *       204:
 *         description: 内訳書削除成功
 *       400:
 *         description: バリデーションエラー
 *       401:
 *         description: 認証エラー
 *       403:
 *         description: 権限不足
 *       404:
 *         description: 内訳書が見つからない
 *       409:
 *         description: 楽観的排他制御エラー（競合）
 */
router.delete(
  '/:id',
  authenticate,
  requirePermission('itemized_statement:delete'),
  validate(itemizedStatementIdParamSchema, 'params'),
  validate(deleteItemizedStatementBodySchema, 'body'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.validatedParams as { id: string };
      const actorId = req.user!.userId;
      const { updatedAt } = req.validatedBody as { updatedAt: string };

      await itemizedStatementService.delete(id, actorId, new Date(updatedAt));

      logger.info(
        { userId: actorId, itemizedStatementId: id },
        'Itemized statement deleted successfully'
      );

      res.status(204).send();
    } catch (error) {
      if (error instanceof ItemizedStatementNotFoundError) {
        res.status(404).json({
          type: 'https://architrack.example.com/problems/itemized-statement-not-found',
          title: 'Itemized Statement Not Found',
          status: 404,
          detail: error.message,
          code: 'ITEMIZED_STATEMENT_NOT_FOUND',
        });
        return;
      }
      if (error instanceof ItemizedStatementConflictError) {
        res.status(409).json({
          type: 'https://architrack.example.com/problems/itemized-statement-conflict',
          title: 'Conflict',
          status: 409,
          detail: error.message,
          code: 'ITEMIZED_STATEMENT_CONFLICT',
        });
        return;
      }
      next(error);
    }
  }
);

export default router;
