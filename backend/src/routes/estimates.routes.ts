/**
 * @fileoverview 見積書APIルート
 *
 * 見積書のCRUD操作、見積項目管理、計算・転記機能のエンドポイントを提供します。
 *
 * Requirements (estimate-creation):
 * - REQ-11.1: プロジェクトに紐付く見積書の一覧を表示する
 * - REQ-11.2: 見積書を選択した場合、見積書の詳細を表示する
 * - REQ-11.3: 見積書を編集した場合、変更内容を保存する
 * - REQ-11.4: 確認ダイアログを表示後に削除を実行する
 * - REQ-11.5: 見積書に見積名称を設定可能とする
 * - REQ-11.6: 楽観的排他制御により競合を検出する
 * - REQ-1.1-1.6: 見積書基本構造
 * - REQ-2.1-2.6: 見積項目ネスト構造
 * - REQ-4.1-4.5: 受領見積書転記
 * - REQ-5.1-5.7: NET金額計算と案分
 * - REQ-6.1-6.6: 利益率による見積金額反映
 * - REQ-7.1-9.6: 諸経費自動計算
 * - REQ-12.1-12.6: 見積項目操作
 *
 * Task 4.1: 見積書CRUD APIエンドポイントの実装
 * Task 4.2: 見積項目CRUD APIエンドポイントの実装
 * Task 4.3: 計算・転記APIエンドポイントの実装
 *
 * @module routes/estimates
 */

import { Router, type Request, type Response, type NextFunction } from 'express';
import { EstimateService } from '../services/estimate.service.js';
import { EstimateItemService } from '../services/estimate-item.service.js';
import { EstimateCalculationService } from '../services/estimate-calculation.service.js';
import { OverheadCostService, OverheadCostType } from '../services/overhead-cost.service.js';
import {
  EstimateExportService,
  ExportFormat,
  type EstimateExportData,
  type EstimateExportItem,
} from '../services/estimate-export.service.js';
import { AuditLogService } from '../services/audit-log.service.js';
import getPrismaClient from '../db.js';
import { validate } from '../middleware/validate.middleware.js';
import { authenticate } from '../middleware/authenticate.middleware.js';
import { requirePermission } from '../middleware/authorize.middleware.js';
import logger from '../utils/logger.js';
import {
  projectIdParamSchema,
  estimateIdParamSchema,
  estimateItemIdParamSchema,
  createEstimateSchema,
  updateEstimateSchema,
  deleteEstimateSchema,
  estimateListQuerySchema,
  createEstimateItemSchema,
  reorderItemsSchema,
  transferQuotationSchema,
  calculateNetSchema,
  applyProfitRateSchema,
  calculateOverheadSchema,
  addOverheadItemSchema,
  getItemsQuerySchema,
  exportEstimateQuerySchema,
  moveEstimateItemSchema,
  batchUpdateItemsSchema,
} from '../schemas/estimate.schema.js';
import {
  EstimateNotFoundError,
  EstimateConflictError,
  DuplicateEstimateNameError,
  EstimateItemNotFoundError,
  EstimateItemHasChildrenError,
  EstimateItemNotBelongToEstimateError,
  EstimateItemCircularReferenceError,
  ReceivedQuotationLineItemNotFoundError,
  ItemizedStatementNotFoundForEstimateError,
} from '../errors/estimateError.js';
import { ProjectNotFoundError } from '../errors/projectError.js';
import { ReceivedQuotationNotFoundError } from '../errors/receivedQuotationError.js';
import Decimal from 'decimal.js';

// mergeParams: true を設定してネストされたルートからprojectIdを取得できるようにする
const router = Router({ mergeParams: true });
const prisma = getPrismaClient();
const auditLogService = new AuditLogService({ prisma });
const estimateService = new EstimateService({
  prisma,
  auditLogService,
});
const estimateItemService = new EstimateItemService({ prisma });
const estimateCalculationService = new EstimateCalculationService();
const overheadCostService = new OverheadCostService();
const estimateExportService = new EstimateExportService();

// ==========================================
// 見積書CRUD API (Task 4.1)
// ==========================================

/**
 * @swagger
 * /api/projects/{projectId}/estimates:
 *   post:
 *     summary: 見積書作成
 *     description: プロジェクトに紐付く見積書を作成
 *     tags:
 *       - Estimates
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
 *                 description: 見積書名
 *               sourceItemizedStatementId:
 *                 type: string
 *                 format: uuid
 *                 description: 参照する内訳書ID（任意）
 *     responses:
 *       201:
 *         description: 見積書作成成功
 *       400:
 *         description: バリデーションエラー
 *       401:
 *         description: 認証エラー
 *       403:
 *         description: 権限不足
 *       404:
 *         description: プロジェクトまたは内訳書が見つからない
 *       409:
 *         description: 同名の見積書が存在
 */
router.post(
  '/',
  authenticate,
  requirePermission('estimate:create'),
  validate(projectIdParamSchema, 'params'),
  validate(createEstimateSchema, 'body'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { projectId } = req.validatedParams as { projectId: string };
      const actorId = req.user!.userId;
      const validatedBody = req.validatedBody as {
        name: string;
        sourceItemizedStatementId?: string;
      };

      const input = {
        projectId,
        name: validatedBody.name,
        sourceItemizedStatementId: validatedBody.sourceItemizedStatementId,
      };

      const estimate = await estimateService.create(input, actorId);

      logger.info(
        {
          userId: actorId,
          estimateId: estimate.id,
          projectId,
          name: estimate.name,
        },
        'Estimate created successfully'
      );

      res.status(201).json(estimate);
    } catch (error) {
      if (error instanceof ProjectNotFoundError) {
        res.status(404).json({
          type: 'https://architrack.example.com/problems/project-not-found',
          title: 'Project Not Found',
          status: 404,
          detail: error.message,
          code: 'PROJECT_NOT_FOUND',
        });
        return;
      }
      if (error instanceof ItemizedStatementNotFoundForEstimateError) {
        res.status(404).json({
          type: 'https://architrack.example.com/problems/itemized-statement-not-found',
          title: 'Itemized Statement Not Found',
          status: 404,
          detail: error.message,
          code: 'ITEMIZED_STATEMENT_NOT_FOUND',
        });
        return;
      }
      if (error instanceof DuplicateEstimateNameError) {
        res.status(409).json({
          type: 'https://architrack.example.com/problems/duplicate-estimate-name',
          title: 'Duplicate Estimate Name',
          status: 409,
          detail: error.message,
          code: 'DUPLICATE_ESTIMATE_NAME',
        });
        return;
      }
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/projects/{projectId}/estimates:
 *   get:
 *     summary: 見積書一覧取得
 *     description: プロジェクトに紐付く見積書の一覧を取得（ページネーション対応）
 *     tags:
 *       - Estimates
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *           maximum: 100
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *       - in: query
 *         name: sort
 *         schema:
 *           type: string
 *           enum: [createdAt, name]
 *           default: createdAt
 *       - in: query
 *         name: order
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *           default: desc
 *     responses:
 *       200:
 *         description: 見積書一覧
 *       401:
 *         description: 認証エラー
 *       403:
 *         description: 権限不足
 */
router.get(
  '/',
  authenticate,
  requirePermission('estimate:read'),
  validate(projectIdParamSchema, 'params'),
  validate(estimateListQuerySchema, 'query'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { projectId } = req.validatedParams as { projectId: string };
      const validatedQuery = req.validatedQuery as {
        page: number;
        limit: number;
        search?: string;
        sort: 'createdAt' | 'name';
        order: 'asc' | 'desc';
      };

      const result = await estimateService.findByProjectId(
        projectId,
        { search: validatedQuery.search },
        { page: validatedQuery.page, limit: validatedQuery.limit },
        { sort: validatedQuery.sort, order: validatedQuery.order }
      );

      logger.debug(
        {
          userId: req.user?.userId,
          projectId,
          page: validatedQuery.page,
          total: result.pagination.total,
        },
        'Estimates list retrieved'
      );

      res.json(result);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/projects/{projectId}/estimates/latest:
 *   get:
 *     summary: 直近の見積書一覧と総数を取得
 *     description: プロジェクト詳細画面の見積書セクション用に、直近N件の見積書と総数を取得
 *     tags:
 *       - Estimates
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 2
 *           minimum: 1
 *           maximum: 10
 *     responses:
 *       200:
 *         description: 見積書サマリー
 *       401:
 *         description: 認証エラー
 *       403:
 *         description: 権限不足
 */
router.get(
  '/latest',
  authenticate,
  requirePermission('estimate:read'),
  validate(projectIdParamSchema, 'params'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { projectId } = req.validatedParams as { projectId: string };
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 2;

      const result = await estimateService.findLatestByProjectId(projectId, limit);

      logger.debug(
        {
          userId: req.user?.userId,
          projectId,
          limit,
          totalCount: result.totalCount,
        },
        'Latest estimates retrieved'
      );

      res.json({
        totalCount: result.totalCount,
        latestEstimates: result.estimates,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/estimates/{id}:
 *   get:
 *     summary: 見積書詳細取得
 *     description: 見積書の詳細情報（見積項目含む）を取得
 *     tags:
 *       - Estimates
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: 見積書詳細
 *       401:
 *         description: 認証エラー
 *       403:
 *         description: 権限不足
 *       404:
 *         description: 見積書が見つからない
 */
router.get(
  '/:id',
  authenticate,
  requirePermission('estimate:read'),
  validate(estimateIdParamSchema, 'params'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.validatedParams as { id: string };

      const estimate = await estimateService.findById(id);

      if (!estimate) {
        res.status(404).json({
          type: 'https://architrack.example.com/problems/estimate-not-found',
          title: 'Estimate Not Found',
          status: 404,
          detail: `見積書が見つかりません: ${id}`,
          code: 'ESTIMATE_NOT_FOUND',
          estimateId: id,
        });
        return;
      }

      logger.debug({ userId: req.user?.userId, estimateId: id }, 'Estimate detail retrieved');

      res.json(estimate);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/estimates/{id}:
 *   put:
 *     summary: 見積書更新
 *     description: 見積書の情報を更新（楽観的排他制御）
 *     tags:
 *       - Estimates
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
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
 *         description: 見積書更新成功
 *       400:
 *         description: バリデーションエラー
 *       401:
 *         description: 認証エラー
 *       403:
 *         description: 権限不足
 *       404:
 *         description: 見積書が見つからない
 *       409:
 *         description: 楽観的排他制御エラーまたは同名の見積書が存在
 */
router.put(
  '/:id',
  authenticate,
  requirePermission('estimate:update'),
  validate(estimateIdParamSchema, 'params'),
  validate(updateEstimateSchema, 'body'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.validatedParams as { id: string };
      const actorId = req.user!.userId;
      const { expectedUpdatedAt, ...updateData } = req.validatedBody as {
        expectedUpdatedAt: string;
        name: string;
      };

      const estimate = await estimateService.update(
        id,
        updateData,
        actorId,
        new Date(expectedUpdatedAt)
      );

      logger.info({ userId: actorId, estimateId: id }, 'Estimate updated successfully');

      res.json(estimate);
    } catch (error) {
      if (error instanceof EstimateNotFoundError) {
        res.status(404).json({
          type: 'https://architrack.example.com/problems/estimate-not-found',
          title: 'Estimate Not Found',
          status: 404,
          detail: error.message,
          code: 'ESTIMATE_NOT_FOUND',
        });
        return;
      }
      if (error instanceof EstimateConflictError) {
        res.status(409).json({
          type: 'https://architrack.example.com/problems/estimate-conflict',
          title: 'Conflict',
          status: 409,
          detail: error.message,
          code: 'ESTIMATE_CONFLICT',
        });
        return;
      }
      if (error instanceof DuplicateEstimateNameError) {
        res.status(409).json({
          type: 'https://architrack.example.com/problems/duplicate-estimate-name',
          title: 'Duplicate Estimate Name',
          status: 409,
          detail: error.message,
          code: 'DUPLICATE_ESTIMATE_NAME',
        });
        return;
      }
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/estimates/{id}:
 *   delete:
 *     summary: 見積書削除
 *     description: 見積書を論理削除（楽観的排他制御）
 *     tags:
 *       - Estimates
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
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
 *     responses:
 *       204:
 *         description: 見積書削除成功
 *       400:
 *         description: バリデーションエラー
 *       401:
 *         description: 認証エラー
 *       403:
 *         description: 権限不足
 *       404:
 *         description: 見積書が見つからない
 *       409:
 *         description: 楽観的排他制御エラー
 */
router.delete(
  '/:id',
  authenticate,
  requirePermission('estimate:delete'),
  validate(estimateIdParamSchema, 'params'),
  validate(deleteEstimateSchema, 'body'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.validatedParams as { id: string };
      const actorId = req.user!.userId;
      const { updatedAt } = req.validatedBody as { updatedAt: string };

      await estimateService.delete(id, actorId, new Date(updatedAt));

      logger.info({ userId: actorId, estimateId: id }, 'Estimate deleted successfully');

      res.status(204).send();
    } catch (error) {
      if (error instanceof EstimateNotFoundError) {
        res.status(404).json({
          type: 'https://architrack.example.com/problems/estimate-not-found',
          title: 'Estimate Not Found',
          status: 404,
          detail: error.message,
          code: 'ESTIMATE_NOT_FOUND',
        });
        return;
      }
      if (error instanceof EstimateConflictError) {
        res.status(409).json({
          type: 'https://architrack.example.com/problems/estimate-conflict',
          title: 'Conflict',
          status: 409,
          detail: error.message,
          code: 'ESTIMATE_CONFLICT',
        });
        return;
      }
      next(error);
    }
  }
);

// ==========================================
// 見積項目API (Task 4.2)
// ==========================================

/**
 * @swagger
 * /api/estimates/{id}/items:
 *   get:
 *     summary: 見積項目一覧取得
 *     description: 見積書の見積項目一覧を取得（階層構造オプション）
 *     tags:
 *       - Estimate Items
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: hierarchy
 *         schema:
 *           type: boolean
 *           default: false
 *     responses:
 *       200:
 *         description: 見積項目一覧
 *       401:
 *         description: 認証エラー
 *       403:
 *         description: 権限不足
 *       404:
 *         description: 見積書が見つからない
 */
router.get(
  '/:id/items',
  authenticate,
  requirePermission('estimate:read'),
  validate(estimateIdParamSchema, 'params'),
  validate(getItemsQuerySchema, 'query'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.validatedParams as { id: string };

      const items = await estimateItemService.getHierarchy(id);

      logger.debug({ userId: req.user?.userId, estimateId: id }, 'Estimate items retrieved');

      res.json(items);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/estimates/{id}/items:
 *   post:
 *     summary: 見積項目作成
 *     description: 見積書に新規見積項目（3行1セット）を追加
 *     tags:
 *       - Estimate Items
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - displayOrder
 *               - lines
 *             properties:
 *               parentId:
 *                 type: string
 *                 format: uuid
 *                 nullable: true
 *               displayOrder:
 *                 type: integer
 *               lines:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     lineType:
 *                       type: string
 *                       enum: [ESTIMATE, EXECUTION, VENDOR]
 *                     name:
 *                       type: string
 *                     specification:
 *                       type: string
 *                     unit:
 *                       type: string
 *                     quantity:
 *                       type: number
 *                     unitPrice:
 *                       type: number
 *                     remarks:
 *                       type: string
 *     responses:
 *       201:
 *         description: 見積項目作成成功
 *       400:
 *         description: バリデーションエラー
 *       401:
 *         description: 認証エラー
 *       403:
 *         description: 権限不足
 *       404:
 *         description: 見積書が見つからない
 */
router.post(
  '/:id/items',
  authenticate,
  requirePermission('estimate:update'),
  validate(estimateIdParamSchema, 'params'),
  validate(createEstimateItemSchema, 'body'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.validatedParams as { id: string };
      const validatedBody = req.validatedBody as {
        parentId?: string | null;
        displayOrder: number;
        lines: Array<{
          lineType: 'ESTIMATE' | 'EXECUTION' | 'VENDOR';
          name?: string | null;
          specification?: string | null;
          unit?: string | null;
          quantity?: number | null;
          unitPrice?: number | null;
          remarks?: string | null;
        }>;
      };

      const item = await estimateItemService.createItem(id, validatedBody);

      logger.info(
        { userId: req.user?.userId, estimateId: id, itemId: item.id },
        'Estimate item created successfully'
      );

      res.status(201).json(item);
    } catch (error) {
      if (error instanceof EstimateNotFoundError) {
        res.status(404).json({
          type: 'https://architrack.example.com/problems/estimate-not-found',
          title: 'Estimate Not Found',
          status: 404,
          detail: error.message,
          code: 'ESTIMATE_NOT_FOUND',
        });
        return;
      }
      if (error instanceof EstimateItemNotFoundError) {
        res.status(404).json({
          type: 'https://architrack.example.com/problems/estimate-item-not-found',
          title: 'Estimate Item Not Found',
          status: 404,
          detail: error.message,
          code: 'ESTIMATE_ITEM_NOT_FOUND',
        });
        return;
      }
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/estimates/{id}/items/{itemId}:
 *   delete:
 *     summary: 見積項目削除
 *     description: 見積項目（3行1セット）を削除
 *     tags:
 *       - Estimate Items
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: path
 *         name: itemId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               forceDelete:
 *                 type: boolean
 *                 default: false
 *     responses:
 *       204:
 *         description: 見積項目削除成功
 *       401:
 *         description: 認証エラー
 *       403:
 *         description: 権限不足
 *       404:
 *         description: 見積項目が見つからない
 *       422:
 *         description: 子項目が存在（forceDelete=falseの場合）
 */
router.delete(
  '/:id/items/:itemId',
  authenticate,
  requirePermission('estimate:update'),
  validate(estimateItemIdParamSchema, 'params'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { itemId } = req.validatedParams as { id: string; itemId: string };
      const forceDelete = (req.body as { forceDelete?: boolean })?.forceDelete ?? false;

      await estimateItemService.deleteItem(itemId, forceDelete);

      logger.info({ userId: req.user?.userId, itemId }, 'Estimate item deleted successfully');

      res.status(204).send();
    } catch (error) {
      if (error instanceof EstimateItemNotFoundError) {
        res.status(404).json({
          type: 'https://architrack.example.com/problems/estimate-item-not-found',
          title: 'Estimate Item Not Found',
          status: 404,
          detail: error.message,
          code: 'ESTIMATE_ITEM_NOT_FOUND',
        });
        return;
      }
      if (error instanceof EstimateItemHasChildrenError) {
        res.status(422).json({
          type: 'https://architrack.example.com/problems/estimate-item-has-children',
          title: 'Estimate Item Has Children',
          status: 422,
          detail: error.message,
          code: 'ESTIMATE_ITEM_HAS_CHILDREN',
        });
        return;
      }
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/estimates/{id}/items/{itemId}/duplicate:
 *   post:
 *     summary: 見積項目複製
 *     description: 見積項目（3行1セット）を複製
 *     tags:
 *       - Estimate Items
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: path
 *         name: itemId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       201:
 *         description: 見積項目複製成功
 *       401:
 *         description: 認証エラー
 *       403:
 *         description: 権限不足
 *       404:
 *         description: 見積項目が見つからない
 */
router.post(
  '/:id/items/:itemId/duplicate',
  authenticate,
  requirePermission('estimate:update'),
  validate(estimateItemIdParamSchema, 'params'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { itemId } = req.validatedParams as { id: string; itemId: string };

      const duplicatedItem = await estimateItemService.duplicateItem(itemId);

      logger.info(
        { userId: req.user?.userId, sourceItemId: itemId, newItemId: duplicatedItem.id },
        'Estimate item duplicated successfully'
      );

      res.status(201).json(duplicatedItem);
    } catch (error) {
      if (error instanceof EstimateItemNotFoundError) {
        res.status(404).json({
          type: 'https://architrack.example.com/problems/estimate-item-not-found',
          title: 'Estimate Item Not Found',
          status: 404,
          detail: error.message,
          code: 'ESTIMATE_ITEM_NOT_FOUND',
        });
        return;
      }
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/estimates/{id}/items/reorder:
 *   put:
 *     summary: 見積項目並び替え
 *     description: 見積項目の表示順序を一括変更
 *     tags:
 *       - Estimate Items
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - itemOrders
 *             properties:
 *               itemOrders:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required:
 *                     - id
 *                     - displayOrder
 *                   properties:
 *                     id:
 *                       type: string
 *                       format: uuid
 *                     displayOrder:
 *                       type: integer
 *     responses:
 *       204:
 *         description: 並び替え成功
 *       400:
 *         description: バリデーションエラー
 *       401:
 *         description: 認証エラー
 *       403:
 *         description: 権限不足
 *       404:
 *         description: 見積書が見つからない
 */
// ==========================================
// 見積項目バッチ更新API (REQ-27.3)
// ==========================================

router.put(
  '/:id/items/batch',
  authenticate,
  requirePermission('estimate:update'),
  validate(estimateIdParamSchema, 'params'),
  validate(batchUpdateItemsSchema, 'body'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.validatedParams as { id: string };
      const { items } = req.validatedBody as {
        items: Array<{
          id: string;
          lines: Array<{
            id: string;
            lineType: 'ESTIMATE' | 'EXECUTION' | 'VENDOR';
            name?: string | null;
            specification?: string | null;
            unit?: string | null;
            quantity?: number | null;
            unitPrice?: number | null;
            remarks?: string | null;
          }>;
        }>;
      };

      await estimateItemService.batchUpdateItems(id, items);

      logger.info(
        { userId: req.user?.userId, estimateId: id, itemCount: items.length },
        'Estimate items batch updated'
      );

      res.status(200).json({ success: true });
    } catch (error) {
      if (error instanceof EstimateNotFoundError) {
        res.status(404).json({
          type: 'https://architrack.example.com/problems/estimate-not-found',
          title: 'Estimate Not Found',
          status: 404,
          detail: error.message,
          code: 'ESTIMATE_NOT_FOUND',
        });
        return;
      }
      next(error);
    }
  }
);

router.put(
  '/:id/items/reorder',
  authenticate,
  requirePermission('estimate:update'),
  validate(estimateIdParamSchema, 'params'),
  validate(reorderItemsSchema, 'body'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.validatedParams as { id: string };
      const { itemOrders } = req.validatedBody as {
        itemOrders: Array<{ id: string; displayOrder: number }>;
      };

      await estimateItemService.reorderItems(id, itemOrders);

      logger.info({ userId: req.user?.userId, estimateId: id }, 'Estimate items reordered');

      res.status(204).send();
    } catch (error) {
      if (error instanceof EstimateNotFoundError) {
        res.status(404).json({
          type: 'https://architrack.example.com/problems/estimate-not-found',
          title: 'Estimate Not Found',
          status: 404,
          detail: error.message,
          code: 'ESTIMATE_NOT_FOUND',
        });
        return;
      }
      next(error);
    }
  }
);

// ==========================================
// 階層移動API (Task 27.1, REQ-24)
// ==========================================

/**
 * @swagger
 * /api/estimates/{id}/items/{itemId}/move:
 *   patch:
 *     summary: 見積項目の階層移動
 *     description: 見積項目の親子関係を変更（階層移動）
 *     tags:
 *       - Estimate Items
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: 見積書ID
 *       - in: path
 *         name: itemId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: 移動する見積項目ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - newParentId
 *             properties:
 *               newParentId:
 *                 type: string
 *                 format: uuid
 *                 nullable: true
 *                 description: 新しい親項目ID（nullでルートレベルに移動）
 *     responses:
 *       200:
 *         description: 移動成功
 *       400:
 *         description: バリデーションエラーまたは循環参照
 *       401:
 *         description: 認証エラー
 *       403:
 *         description: 権限不足
 *       404:
 *         description: 見積項目が見つからない
 */
router.patch(
  '/:id/items/:itemId/move',
  authenticate,
  requirePermission('estimate:update'),
  validate(estimateItemIdParamSchema, 'params'),
  validate(moveEstimateItemSchema, 'body'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { itemId } = req.validatedParams as { id: string; itemId: string };
      const { newParentId } = req.validatedBody as { newParentId: string | null };

      await estimateItemService.moveItem(itemId, newParentId);

      logger.info(
        { userId: req.user?.userId, itemId, newParentId },
        'Estimate item moved successfully'
      );

      res.json({ success: true });
    } catch (error) {
      if (error instanceof EstimateItemCircularReferenceError) {
        res.status(400).json({
          type: 'https://architrack.example.com/problems/estimate-item-circular-reference',
          title: 'Circular Reference',
          status: 400,
          detail: error.message,
          code: 'ESTIMATE_ITEM_CIRCULAR_REFERENCE',
        });
        return;
      }
      if (error instanceof EstimateItemNotFoundError) {
        res.status(404).json({
          type: 'https://architrack.example.com/problems/estimate-item-not-found',
          title: 'Estimate Item Not Found',
          status: 404,
          detail: error.message,
          code: 'ESTIMATE_ITEM_NOT_FOUND',
        });
        return;
      }
      next(error);
    }
  }
);

// ==========================================
// 計算・転記API (Task 4.3)
// ==========================================

/**
 * @swagger
 * /api/estimates/{id}/transfer-quotation:
 *   post:
 *     summary: 受領見積書転記
 *     description: 受領見積書の明細行を見積書の業者金額行に転記
 *     tags:
 *       - Estimate Calculation
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - receivedQuotationId
 *               - lineItemIds
 *             properties:
 *               receivedQuotationId:
 *                 type: string
 *                 format: uuid
 *               lineItemIds:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: uuid
 *               targetEstimateItemId:
 *                 type: string
 *                 format: uuid
 *     responses:
 *       200:
 *         description: 転記成功
 *       400:
 *         description: バリデーションエラー
 *       401:
 *         description: 認証エラー
 *       403:
 *         description: 権限不足
 *       404:
 *         description: 見積書、受領見積書、または転記先が見つからない
 */
router.post(
  '/:id/transfer-quotation',
  authenticate,
  requirePermission('estimate:update'),
  validate(estimateIdParamSchema, 'params'),
  validate(transferQuotationSchema, 'body'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.validatedParams as { id: string };
      const validatedBody = req.validatedBody as {
        receivedQuotationId: string;
        lineItemIds: string[];
        targetEstimateItemId?: string;
      };

      const items = await estimateItemService.transferFromQuotation({
        estimateId: id,
        receivedQuotationId: validatedBody.receivedQuotationId,
        lineItemIds: validatedBody.lineItemIds,
        targetEstimateItemId: validatedBody.targetEstimateItemId,
      });

      logger.info(
        { userId: req.user?.userId, estimateId: id, transferredCount: items.length },
        'Quotation transferred successfully'
      );

      res.json(items);
    } catch (error) {
      if (error instanceof EstimateNotFoundError) {
        res.status(404).json({
          type: 'https://architrack.example.com/problems/estimate-not-found',
          title: 'Estimate Not Found',
          status: 404,
          detail: error.message,
          code: 'ESTIMATE_NOT_FOUND',
        });
        return;
      }
      if (error instanceof ReceivedQuotationNotFoundError) {
        res.status(404).json({
          type: 'https://architrack.example.com/problems/received-quotation-not-found',
          title: 'Received Quotation Not Found',
          status: 404,
          detail: error.message,
          code: 'RECEIVED_QUOTATION_NOT_FOUND',
        });
        return;
      }
      if (error instanceof ReceivedQuotationLineItemNotFoundError) {
        res.status(404).json({
          type: 'https://architrack.example.com/problems/received-quotation-line-item-not-found',
          title: 'Received Quotation Line Item Not Found',
          status: 404,
          detail: error.message,
          code: 'RECEIVED_QUOTATION_LINE_ITEM_NOT_FOUND',
        });
        return;
      }
      if (error instanceof EstimateItemNotFoundError) {
        res.status(404).json({
          type: 'https://architrack.example.com/problems/estimate-item-not-found',
          title: 'Estimate Item Not Found',
          status: 404,
          detail: error.message,
          code: 'ESTIMATE_ITEM_NOT_FOUND',
        });
        return;
      }
      if (error instanceof EstimateItemNotBelongToEstimateError) {
        res.status(400).json({
          type: 'https://architrack.example.com/problems/estimate-item-not-belong-to-estimate',
          title: 'Bad Request',
          status: 400,
          detail: error.message,
          code: 'ESTIMATE_ITEM_NOT_BELONG_TO_ESTIMATE',
        });
        return;
      }
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/estimates/{id}/calculate-net:
 *   post:
 *     summary: NET金額計算・案分
 *     description: 業者金額行をNET金額に基づいて案分計算
 *     tags:
 *       - Estimate Calculation
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - vendorName
 *               - targetLineIds
 *               - netAmount
 *             properties:
 *               vendorName:
 *                 type: string
 *               targetLineIds:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: uuid
 *               excludeLineIds:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: uuid
 *               netAmount:
 *                 type: string
 *     responses:
 *       200:
 *         description: 計算成功
 *       400:
 *         description: バリデーションエラー
 *       401:
 *         description: 認証エラー
 *       403:
 *         description: 権限不足
 */
router.post(
  '/:id/calculate-net',
  authenticate,
  requirePermission('estimate:update'),
  validate(estimateIdParamSchema, 'params'),
  validate(calculateNetSchema, 'body'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const validatedBody = req.validatedBody as {
        vendorName: string;
        targetLineIds: string[];
        excludeLineIds: string[];
        netAmount: string;
      };

      // データベースから業者金額行を取得
      const dbVendorLines = await prisma.estimateItemLine.findMany({
        where: {
          id: { in: validatedBody.targetLineIds },
          lineType: 'VENDOR',
        },
      });

      // 計算用の情報を構築
      const vendorLines = dbVendorLines.map((line) => ({
        id: line.id,
        amount: new Decimal(line.amount?.toString() || '0'),
      }));

      // NET金額案分計算
      const result = estimateCalculationService.previewNetAllocation(
        vendorLines,
        validatedBody.excludeLineIds,
        validatedBody.netAmount
      );

      // トランザクションで実行金額行を更新
      await prisma.$transaction(async (tx) => {
        for (const allocation of result) {
          const vendorLine = dbVendorLines.find((l) => l.id === allocation.lineId);
          if (!vendorLine) continue;

          // 案分後の単価を計算（数量がある場合は案分金額÷数量、ない場合は案分金額を単価とする）
          const quantity = vendorLine.quantity ? new Decimal(vendorLine.quantity.toString()) : null;
          const allocatedAmount = allocation.allocatedAmount.toDecimalPlaces(
            0,
            Decimal.ROUND_HALF_UP
          );
          const unitPrice =
            quantity && !quantity.isZero()
              ? allocatedAmount.div(quantity).toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
              : allocatedAmount;

          // 同じ項目のEXECUTION行を更新
          await tx.estimateItemLine.update({
            where: {
              estimateItemId_lineType: {
                estimateItemId: vendorLine.estimateItemId,
                lineType: 'EXECUTION',
              },
            },
            data: {
              name: vendorLine.name,
              specification: vendorLine.specification,
              unit: vendorLine.unit,
              quantity: vendorLine.quantity,
              unitPrice: unitPrice.toString(),
              amount: allocatedAmount.toString(),
            },
          });
        }

        // 見積書のupdatedAtを更新
        await tx.estimate.update({
          where: { id },
          data: { updatedAt: new Date() },
        });
      });

      // レスポンスを構築
      const response = result.map((item) => ({
        lineId: item.lineId,
        originalAmount: item.originalAmount?.toString() ?? null,
        allocatedAmount: item.allocatedAmount.toString(),
        ratio: item.ratio.toString(),
      }));

      logger.info({ userId: req.user?.userId }, 'NET calculation and allocation completed');

      res.json(response);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/estimates/{id}/apply-profit-rate:
 *   post:
 *     summary: 利益率適用
 *     description: 実行金額行に利益率を適用して見積金額行に反映
 *     tags:
 *       - Estimate Calculation
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - profitRate
 *               - overwriteOption
 *             properties:
 *               profitRate:
 *                 type: string
 *                 description: 利益率（0〜500%）
 *               overwriteOption:
 *                 type: string
 *                 enum: [all, empty_only, unit_price_only]
 *     responses:
 *       200:
 *         description: 適用成功
 *       400:
 *         description: バリデーションエラー（利益率範囲外など）
 *       401:
 *         description: 認証エラー
 *       403:
 *         description: 権限不足
 */
router.post(
  '/:id/apply-profit-rate',
  authenticate,
  requirePermission('estimate:update'),
  validate(estimateIdParamSchema, 'params'),
  validate(applyProfitRateSchema, 'body'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const validatedBody = req.validatedBody as {
        profitRate: string;
        overwriteOption: 'all' | 'empty_only' | 'unit_price_only';
      };

      // データベースから見積書の実行金額行を取得
      const dbExecutionLines = await prisma.estimateItemLine.findMany({
        where: {
          estimateItem: { estimateId: id },
          lineType: 'EXECUTION',
          unitPrice: { not: null },
        },
      });

      // 計算用の情報を構築
      const executionLines = dbExecutionLines.map((line) => ({
        lineId: line.id,
        unitPrice: new Decimal(line.unitPrice!.toString()),
      }));

      // 利益率計算
      const result = estimateCalculationService.previewProfitRate(
        executionLines,
        validatedBody.profitRate
      );

      // トランザクションで見積金額行を更新
      await prisma.$transaction(async (tx) => {
        for (const preview of result) {
          const execLine = dbExecutionLines.find((l) => l.id === preview.lineId);
          if (!execLine || !preview.newUnitPrice) continue;

          // 上書きオプションに基づいてESTIMATE行を取得
          const estimateLine = await tx.estimateItemLine.findUnique({
            where: {
              estimateItemId_lineType: {
                estimateItemId: execLine.estimateItemId,
                lineType: 'ESTIMATE',
              },
            },
          });
          if (!estimateLine) continue;

          // 上書き判定
          if (validatedBody.overwriteOption === 'empty_only') {
            if (estimateLine.unitPrice !== null) continue;
          }

          const newUnitPrice = preview.newUnitPrice.toDecimalPlaces(0, Decimal.ROUND_HALF_UP);

          if (validatedBody.overwriteOption === 'unit_price_only') {
            // 単価のみ更新（金額は数量×単価で再計算）
            const amount =
              estimateLine.quantity && newUnitPrice
                ? new Decimal(estimateLine.quantity.toString())
                    .mul(newUnitPrice)
                    .toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
                : null;
            await tx.estimateItemLine.update({
              where: { id: estimateLine.id },
              data: {
                unitPrice: newUnitPrice.toString(),
                amount: amount?.toString() ?? null,
              },
            });
          } else {
            // all または empty_only: 実行金額行の情報をコピー
            const quantity = execLine.quantity ? new Decimal(execLine.quantity.toString()) : null;
            const amount = quantity
              ? quantity.mul(newUnitPrice).toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
              : null;
            await tx.estimateItemLine.update({
              where: { id: estimateLine.id },
              data: {
                name: execLine.name,
                specification: execLine.specification,
                unit: execLine.unit,
                quantity: execLine.quantity,
                unitPrice: newUnitPrice.toString(),
                amount: amount?.toString() ?? null,
              },
            });
          }
        }

        // 見積書のupdatedAtを更新
        await tx.estimate.update({
          where: { id },
          data: { updatedAt: new Date() },
        });
      });

      // レスポンスを構築
      const response = result.map((item) => ({
        lineId: item.lineId,
        originalUnitPrice: item.originalUnitPrice?.toString() ?? null,
        newUnitPrice: item.newUnitPrice?.toString() ?? null,
      }));

      logger.info(
        { userId: req.user?.userId, profitRate: validatedBody.profitRate },
        'Profit rate calculation and application completed'
      );

      res.json(response);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/estimates/{id}/calculate-overhead:
 *   post:
 *     summary: 諸経費計算
 *     description: 国土交通省基準に準じた諸経費（共通仮設費・現場管理費・一般管理費）を計算
 *     tags:
 *       - Estimate Calculation
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - costType
 *               - directCost
 *             properties:
 *               costType:
 *                 type: string
 *                 enum: [COMMON_TEMPORARY, SITE_MANAGEMENT, GENERAL_ADMIN]
 *               directCost:
 *                 type: string
 *                 description: 直接工事費（千円単位）
 *               constructionPeriod:
 *                 type: integer
 *                 description: 工期（月）
 *               pureConstructionCost:
 *                 type: string
 *                 description: 純工事費（千円単位）
 *               constructionCost:
 *                 type: string
 *                 description: 工事原価（千円単位）
 *               isRenovation:
 *                 type: boolean
 *                 default: false
 *     responses:
 *       200:
 *         description: 計算成功
 *       400:
 *         description: バリデーションエラー
 *       401:
 *         description: 認証エラー
 *       403:
 *         description: 権限不足
 */
router.post(
  '/:id/calculate-overhead',
  authenticate,
  requirePermission('estimate:update'),
  validate(estimateIdParamSchema, 'params'),
  validate(calculateOverheadSchema, 'body'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const validatedBody = req.validatedBody as {
        costType: 'COMMON_TEMPORARY' | 'SITE_MANAGEMENT' | 'GENERAL_ADMIN';
        directCost: string;
        constructionPeriod?: number;
        pureConstructionCost?: string;
        constructionCost?: string;
        isRenovation: boolean;
      };

      let result;
      const costType = validatedBody.costType as OverheadCostType;

      switch (costType) {
        case OverheadCostType.COMMON_TEMPORARY:
          if (!validatedBody.constructionPeriod) {
            res.status(400).json({
              type: 'https://architrack.example.com/problems/validation-error',
              title: 'Validation Error',
              status: 400,
              detail: '共通仮設費の計算には工期が必要です',
              code: 'VALIDATION_ERROR',
            });
            return;
          }
          result = overheadCostService.calculateCommonTemporaryCost({
            directCost: new Decimal(validatedBody.directCost),
            constructionPeriod: validatedBody.constructionPeriod,
            isRenovation: validatedBody.isRenovation,
          });
          break;

        case OverheadCostType.SITE_MANAGEMENT:
          if (!validatedBody.pureConstructionCost) {
            res.status(400).json({
              type: 'https://architrack.example.com/problems/validation-error',
              title: 'Validation Error',
              status: 400,
              detail: '現場管理費の計算には純工事費が必要です',
              code: 'VALIDATION_ERROR',
            });
            return;
          }
          result = overheadCostService.calculateSiteManagementCost({
            pureConstructionCost: new Decimal(validatedBody.pureConstructionCost),
            isRenovation: validatedBody.isRenovation,
          });
          break;

        case OverheadCostType.GENERAL_ADMIN:
          if (!validatedBody.constructionCost) {
            res.status(400).json({
              type: 'https://architrack.example.com/problems/validation-error',
              title: 'Validation Error',
              status: 400,
              detail: '一般管理費の計算には工事原価が必要です',
              code: 'VALIDATION_ERROR',
            });
            return;
          }
          result = overheadCostService.calculateGeneralAdminCost({
            constructionCost: new Decimal(validatedBody.constructionCost),
            isRenovation: validatedBody.isRenovation,
          });
          break;

        default:
          res.status(400).json({
            type: 'https://architrack.example.com/problems/validation-error',
            title: 'Validation Error',
            status: 400,
            detail: '不明な諸経費種別です',
            code: 'VALIDATION_ERROR',
          });
          return;
      }

      // Decimalを文字列に変換
      const response = {
        costType: result.costType,
        rate: result.rate.toString(),
        amount: result.amount.toString(),
        formula: result.formula,
      };

      logger.info(
        { userId: req.user?.userId, costType: validatedBody.costType },
        'Overhead cost calculated'
      );

      res.json(response);
    } catch (error) {
      if (error instanceof Error && error.message.includes('0より大きい値')) {
        res.status(400).json({
          type: 'https://architrack.example.com/problems/validation-error',
          title: 'Validation Error',
          status: 400,
          detail: error.message,
          code: 'VALIDATION_ERROR',
        });
        return;
      }
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/estimates/{id}/overhead-items:
 *   post:
 *     summary: 諸経費行追加
 *     description: プリセット値を使用して諸経費行を追加
 *     tags:
 *       - Estimate Calculation
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - costType
 *             properties:
 *               costType:
 *                 type: string
 *                 enum: [COMMON_TEMPORARY, SITE_MANAGEMENT, GENERAL_ADMIN]
 *               unitPrice:
 *                 type: number
 *                 description: 単価（任意、自動計算結果を上書き）
 *     responses:
 *       201:
 *         description: 諸経費行追加成功
 *       400:
 *         description: バリデーションエラー
 *       401:
 *         description: 認証エラー
 *       403:
 *         description: 権限不足
 *       404:
 *         description: 見積書が見つからない
 */
router.post(
  '/:id/overhead-items',
  authenticate,
  requirePermission('estimate:update'),
  validate(estimateIdParamSchema, 'params'),
  validate(addOverheadItemSchema, 'body'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.validatedParams as { id: string };
      const validatedBody = req.validatedBody as {
        costType: 'COMMON_TEMPORARY' | 'SITE_MANAGEMENT' | 'GENERAL_ADMIN';
        unitPrice?: number;
      };

      const costType = validatedBody.costType as OverheadCostType;
      const preset = overheadCostService.getPresetValues(costType);

      // 既存の項目数を取得して表示順序を決定
      const existingItems = await estimateItemService.getHierarchy(id);
      const displayOrder = existingItems.length;

      const item = await estimateItemService.createItem(id, {
        displayOrder,
        lines: [
          {
            lineType: 'ESTIMATE',
            name: preset.name,
            specification: preset.specification,
            unit: preset.unit,
            quantity: preset.quantity,
            unitPrice: validatedBody.unitPrice ?? null,
          },
          { lineType: 'EXECUTION' },
          { lineType: 'VENDOR' },
        ],
      });

      logger.info(
        { userId: req.user?.userId, estimateId: id, costType: validatedBody.costType },
        'Overhead item added'
      );

      res.status(201).json(item);
    } catch (error) {
      if (error instanceof EstimateNotFoundError) {
        res.status(404).json({
          type: 'https://architrack.example.com/problems/estimate-not-found',
          title: 'Estimate Not Found',
          status: 404,
          detail: error.message,
          code: 'ESTIMATE_NOT_FOUND',
        });
        return;
      }
      next(error);
    }
  }
);

// ==========================================
// 見積書出力API (Task 6.3)
// ==========================================

/**
 * @swagger
 * /api/estimates/{id}/export:
 *   get:
 *     summary: 見積書出力
 *     description: 見積書をPDFまたはExcel形式で出力
 *     tags:
 *       - Estimates
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: 見積書ID
 *       - in: query
 *         name: format
 *         required: true
 *         schema:
 *           type: string
 *           enum: [pdf, xlsx]
 *         description: 出力形式
 *     responses:
 *       200:
 *         description: ファイルバイナリ
 *         content:
 *           application/pdf:
 *             schema:
 *               type: string
 *               format: binary
 *           application/vnd.openxmlformats-officedocument.spreadsheetml.sheet:
 *             schema:
 *               type: string
 *               format: binary
 *       400:
 *         description: バリデーションエラー
 *       401:
 *         description: 認証エラー
 *       403:
 *         description: 権限不足
 *       404:
 *         description: 見積書が見つからない
 *       500:
 *         description: 出力処理エラー
 */
router.get(
  '/:id/export',
  (req: Request, _res: Response, next: NextFunction): void => {
    // ファイルダウンロード用: クエリパラメータのtokenをAuthorizationヘッダーに変換
    if (!req.headers.authorization && typeof req.query.token === 'string' && req.query.token) {
      req.headers.authorization = `Bearer ${req.query.token}`;
    }
    next();
  },
  authenticate,
  requirePermission('estimate:read'),
  validate(estimateIdParamSchema, 'params'),
  validate(exportEstimateQuerySchema, 'query'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.validatedParams as { id: string };
      const { format, lineTypes } = req.validatedQuery as {
        format: 'pdf' | 'xlsx';
        lineTypes: Array<'ESTIMATE' | 'EXECUTION' | 'VENDOR'>;
      };

      // 見積書を取得
      const estimate = await estimateService.findById(id);

      if (!estimate) {
        res.status(404).json({
          type: 'https://architrack.example.com/problems/estimate-not-found',
          title: 'Estimate Not Found',
          status: 404,
          detail: `見積書が見つかりません: ${id}`,
          code: 'ESTIMATE_NOT_FOUND',
          estimateId: id,
        });
        return;
      }

      // 見積項目を階層構造で取得
      const items = await estimateItemService.getHierarchy(id);

      // 出力用データを構築（全行タイプを含めて渡す）
      const exportData: EstimateExportData = {
        id: estimate.id,
        name: estimate.name,
        projectName: (estimate as unknown as { project?: { name: string } }).project?.name ?? '',
        createdAt: estimate.createdAt,
        items: items.map((item) => convertToExportItem(item)),
        totalAmount: null, // サービス内で計算される
      };

      // 出力形式に応じてエクスポート（複数行タイプ対応）
      const exportFormat = format === 'pdf' ? ExportFormat.PDF : ExportFormat.XLSX;
      let buffer: Buffer;

      // REQ-10 AC10-12: 全ての行タイプでプレフィックス付き列名を使用
      if (exportFormat === ExportFormat.XLSX) {
        buffer = await estimateExportService.exportToExcelWithLineTypes(exportData, lineTypes);
      } else {
        buffer = await estimateExportService.exportToPdfWithLineTypes(exportData, lineTypes);
      }

      // ファイル名を生成（複数行タイプ対応）
      const fileName = estimateExportService.generateFileNameWithLineTypes(
        exportData,
        exportFormat,
        lineTypes
      );

      // Content-TypeとContent-Dispositionを設定
      const contentType =
        format === 'pdf'
          ? 'application/pdf'
          : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

      res.setHeader('Content-Type', contentType);
      res.setHeader(
        'Content-Disposition',
        `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`
      );
      res.setHeader('Content-Length', buffer.length);

      logger.info(
        { userId: req.user?.userId, estimateId: id, format, lineTypes },
        'Estimate exported successfully'
      );

      res.send(buffer);
    } catch (error) {
      if (error instanceof Error && error.message.includes('見積書')) {
        res.status(400).json({
          type: 'https://architrack.example.com/problems/export-error',
          title: 'Export Error',
          status: 400,
          detail: error.message,
          code: 'EXPORT_ERROR',
        });
        return;
      }
      next(error);
    }
  }
);

/**
 * EstimateItemをEstimateExportItemに変換するヘルパー関数
 */
function convertToExportItem(
  item: {
    id: string;
    parentId: string | null;
    displayOrder: number;
    lines: Array<{
      id: string;
      lineType: string;
      name: string | null;
      specification: string | null;
      unit: string | null;
      quantity: unknown;
      unitPrice: unknown;
      amount: unknown;
      remarks: string | null;
    }>;
    children?: unknown[];
  },
  targetLineType?: 'ESTIMATE' | 'EXECUTION' | 'VENDOR'
): EstimateExportItem {
  // 指定された行タイプのみをフィルタリング（指定なしの場合は全行）
  const filteredLines = targetLineType
    ? item.lines.filter((line) => line.lineType === targetLineType)
    : item.lines;

  return {
    id: item.id,
    parentId: item.parentId,
    displayOrder: item.displayOrder,
    lines: filteredLines.map((line) => ({
      id: line.id,
      lineType: line.lineType as 'ESTIMATE' | 'EXECUTION' | 'VENDOR',
      name: line.name,
      specification: line.specification,
      unit: line.unit,
      quantity: line.quantity !== null ? Number(line.quantity) : null,
      unitPrice: line.unitPrice !== null ? Number(line.unitPrice) : null,
      amount: line.amount !== null ? Number(line.amount) : null,
      remarks: line.remarks,
    })),
    children: Array.isArray(item.children)
      ? item.children.map((child) => convertToExportItem(child as typeof item, targetLineType))
      : [],
  };
}

export default router;
