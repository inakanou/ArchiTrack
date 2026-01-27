/**
 * @fileoverview 見積依頼APIルート
 *
 * Requirements:
 * - 3.6: 見積依頼を作成し詳細画面に遷移
 * - 8.1: 見積依頼をプロジェクトに紐付けて保存
 * - 9.3: 見積依頼名の表示
 * - 9.5: 削除確認ダイアログ
 * - 9.6: 変更を保存
 * - 10.1: 見積依頼一覧ページ
 * - 10.2: 各行に見積依頼情報を表示
 * - 10.3: 詳細画面への遷移
 * - 10.4: 見積依頼が0件の場合
 * - 4.4: 項目の選択状態更新
 * - 4.5: 選択状態を自動的に保存
 * - 4.10-4.12: 他の見積依頼での選択状態を含む項目一覧取得
 * - 5.1, 5.2: Excel出力
 * - 6.1: 見積依頼文生成
 *
 * Task 3.2: estimate-requests.routesの基本エンドポイント実装
 * Task 3.3: estimate-requests.routesの追加エンドポイント実装
 *
 * @module routes/estimate-requests
 */

import { Router, type Request, type Response, type NextFunction } from 'express';
import { EstimateRequestService } from '../services/estimate-request.service.js';
import { EstimateRequestTextService } from '../services/estimate-request-text.service.js';
import { AuditLogService } from '../services/audit-log.service.js';
import getPrismaClient from '../db.js';
import { validate } from '../middleware/validate.middleware.js';
import { authenticate } from '../middleware/authenticate.middleware.js';
import { requirePermission } from '../middleware/authorize.middleware.js';
import logger from '../utils/logger.js';
import {
  createEstimateRequestSchema,
  updateEstimateRequestSchema,
  updateItemSelectionSchema,
  estimateRequestIdParamSchema,
  projectIdParamSchema,
  estimateRequestListQuerySchema,
  deleteEstimateRequestBodySchema,
} from '../schemas/estimate-request.schema.js';
import {
  EstimateRequestNotFoundError,
  EstimateRequestConflictError,
  TradingPartnerNotSubcontractorError,
  EmptyItemizedStatementItemsError,
  NoItemsSelectedError,
  MissingContactInfoError,
} from '../errors/estimateRequestError.js';
import { ItemizedStatementNotFoundError } from '../errors/itemizedStatementError.js';
import { NotFoundError } from '../errors/apiError.js';

// mergeParams: true を設定してネストされたルートからprojectIdを取得できるようにする
const router = Router({ mergeParams: true });
const prisma = getPrismaClient();
const auditLogService = new AuditLogService({ prisma });
const estimateRequestService = new EstimateRequestService({
  prisma,
  auditLogService,
});
const estimateRequestTextService = new EstimateRequestTextService({ prisma });

/**
 * @swagger
 * /api/projects/{projectId}/estimate-requests:
 *   post:
 *     summary: 見積依頼作成
 *     description: 内訳書に基づいて見積依頼を作成
 *     tags:
 *       - Estimate Requests
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
 *               - tradingPartnerId
 *               - itemizedStatementId
 *             properties:
 *               name:
 *                 type: string
 *                 maxLength: 200
 *                 description: 見積依頼名
 *               tradingPartnerId:
 *                 type: string
 *                 format: uuid
 *                 description: 取引先（協力業者）ID
 *               itemizedStatementId:
 *                 type: string
 *                 format: uuid
 *                 description: 内訳書ID
 *               method:
 *                 type: string
 *                 enum: [EMAIL, FAX]
 *                 default: EMAIL
 *                 description: 見積依頼方法
 *               includeBreakdownInBody:
 *                 type: boolean
 *                 default: false
 *                 description: 内訳を本文に含めるか
 *     responses:
 *       201:
 *         description: 見積依頼作成成功
 *       400:
 *         description: バリデーションエラー
 *       401:
 *         description: 認証エラー
 *       403:
 *         description: 権限不足
 *       404:
 *         description: 内訳書または取引先が見つからない
 *       422:
 *         description: 取引先が協力業者ではない、または内訳書に項目がない
 */
router.post(
  '/',
  authenticate,
  requirePermission('estimate_request:create'),
  validate(projectIdParamSchema, 'params'),
  validate(createEstimateRequestSchema, 'body'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { projectId } = req.validatedParams as { projectId: string };
      const actorId = req.user!.userId;
      const validatedBody = req.validatedBody as {
        name: string;
        tradingPartnerId: string;
        itemizedStatementId: string;
        method?: 'EMAIL' | 'FAX';
        includeBreakdownInBody?: boolean;
      };

      const input = {
        name: validatedBody.name,
        projectId,
        tradingPartnerId: validatedBody.tradingPartnerId,
        itemizedStatementId: validatedBody.itemizedStatementId,
        method: validatedBody.method,
        includeBreakdownInBody: validatedBody.includeBreakdownInBody,
      };

      const estimateRequest = await estimateRequestService.create(input, actorId);

      logger.info(
        {
          userId: actorId,
          estimateRequestId: estimateRequest.id,
          projectId,
          name: estimateRequest.name,
        },
        'Estimate request created successfully'
      );

      res.status(201).json(estimateRequest);
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
      if (error instanceof NotFoundError) {
        res.status(404).json({
          type: 'https://architrack.example.com/problems/not-found',
          title: 'Not Found',
          status: 404,
          detail: error.message,
          code: error.code,
        });
        return;
      }
      if (error instanceof TradingPartnerNotSubcontractorError) {
        res.status(422).json({
          type: 'https://architrack.example.com/problems/trading-partner-not-subcontractor',
          title: 'Trading Partner Not Subcontractor',
          status: 422,
          detail: error.message,
          code: 'TRADING_PARTNER_NOT_SUBCONTRACTOR',
        });
        return;
      }
      if (error instanceof EmptyItemizedStatementItemsError) {
        res.status(422).json({
          type: 'https://architrack.example.com/problems/empty-itemized-statement-items',
          title: 'Empty Itemized Statement Items',
          status: 422,
          detail: error.message,
          code: 'EMPTY_ITEMIZED_STATEMENT_ITEMS',
        });
        return;
      }
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/projects/{projectId}/estimate-requests:
 *   get:
 *     summary: 見積依頼一覧取得
 *     description: プロジェクトに紐付く見積依頼の一覧を取得（ページネーション対応）
 *     tags:
 *       - Estimate Requests
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
 *     responses:
 *       200:
 *         description: 見積依頼一覧
 *       401:
 *         description: 認証エラー
 *       403:
 *         description: 権限不足
 */
router.get(
  '/',
  authenticate,
  requirePermission('estimate_request:read'),
  validate(projectIdParamSchema, 'params'),
  validate(estimateRequestListQuerySchema, 'query'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { projectId } = req.validatedParams as { projectId: string };
      const validatedQuery = req.validatedQuery as { page: number; limit: number };

      const result = await estimateRequestService.findByProjectId(projectId, validatedQuery);

      logger.debug(
        {
          userId: req.user?.userId,
          projectId,
          page: validatedQuery.page,
          total: result.pagination.total,
        },
        'Estimate requests list retrieved'
      );

      res.json(result);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/projects/{projectId}/estimate-requests/latest:
 *   get:
 *     summary: 直近の見積依頼一覧と総数を取得
 *     description: プロジェクト詳細画面の見積依頼セクション用に、直近N件の見積依頼と総数を取得
 *     tags:
 *       - Estimate Requests
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
 *         description: 取得件数（1〜10、デフォルト: 2）
 *     responses:
 *       200:
 *         description: 見積依頼サマリー
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 totalCount:
 *                   type: integer
 *                   description: 見積依頼の総数
 *                 latestRequests:
 *                   type: array
 *                   description: 直近N件の見積依頼
 *       401:
 *         description: 認証エラー
 *       403:
 *         description: 権限不足
 */
router.get(
  '/latest',
  authenticate,
  requirePermission('estimate_request:read'),
  validate(projectIdParamSchema, 'params'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { projectId } = req.validatedParams as { projectId: string };
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 2;

      const result = await estimateRequestService.findLatestByProjectId(projectId, limit);

      logger.debug(
        {
          userId: req.user?.userId,
          projectId,
          limit,
          totalCount: result.totalCount,
        },
        'Latest estimate requests retrieved'
      );

      res.json(result);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/estimate-requests/{id}:
 *   get:
 *     summary: 見積依頼詳細取得
 *     description: 見積依頼の詳細情報を取得
 *     tags:
 *       - Estimate Requests
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: 見積依頼ID
 *     responses:
 *       200:
 *         description: 見積依頼詳細
 *       401:
 *         description: 認証エラー
 *       403:
 *         description: 権限不足
 *       404:
 *         description: 見積依頼が見つからない
 */
router.get(
  '/:id',
  authenticate,
  requirePermission('estimate_request:read'),
  validate(estimateRequestIdParamSchema, 'params'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.validatedParams as { id: string };

      const estimateRequest = await estimateRequestService.findById(id);

      if (!estimateRequest) {
        res.status(404).json({
          type: 'https://architrack.example.com/problems/estimate-request-not-found',
          title: 'Estimate Request Not Found',
          status: 404,
          detail: `見積依頼が見つかりません: ${id}`,
          code: 'ESTIMATE_REQUEST_NOT_FOUND',
          estimateRequestId: id,
        });
        return;
      }

      logger.debug(
        { userId: req.user?.userId, estimateRequestId: id },
        'Estimate request detail retrieved'
      );

      res.json(estimateRequest);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/estimate-requests/{id}:
 *   put:
 *     summary: 見積依頼更新
 *     description: 見積依頼の情報を更新（楽観的排他制御）
 *     tags:
 *       - Estimate Requests
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: 見積依頼ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - expectedUpdatedAt
 *             properties:
 *               name:
 *                 type: string
 *                 maxLength: 200
 *                 description: 見積依頼名
 *               method:
 *                 type: string
 *                 enum: [EMAIL, FAX]
 *                 description: 見積依頼方法
 *               includeBreakdownInBody:
 *                 type: boolean
 *                 description: 内訳を本文に含めるか
 *               expectedUpdatedAt:
 *                 type: string
 *                 format: date-time
 *                 description: 楽観的排他制御用の更新日時
 *     responses:
 *       200:
 *         description: 見積依頼更新成功
 *       400:
 *         description: バリデーションエラー
 *       401:
 *         description: 認証エラー
 *       403:
 *         description: 権限不足
 *       404:
 *         description: 見積依頼が見つからない
 *       409:
 *         description: 楽観的排他制御エラー（競合）
 */
router.put(
  '/:id',
  authenticate,
  requirePermission('estimate_request:update'),
  validate(estimateRequestIdParamSchema, 'params'),
  validate(updateEstimateRequestSchema, 'body'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.validatedParams as { id: string };
      const actorId = req.user!.userId;
      const { expectedUpdatedAt, ...updateData } = req.validatedBody as {
        expectedUpdatedAt: string;
        name?: string;
        method?: 'EMAIL' | 'FAX';
        includeBreakdownInBody?: boolean;
      };

      const estimateRequest = await estimateRequestService.update(
        id,
        updateData,
        actorId,
        new Date(expectedUpdatedAt)
      );

      logger.info(
        { userId: actorId, estimateRequestId: id },
        'Estimate request updated successfully'
      );

      res.json(estimateRequest);
    } catch (error) {
      if (error instanceof EstimateRequestNotFoundError) {
        res.status(404).json({
          type: 'https://architrack.example.com/problems/estimate-request-not-found',
          title: 'Estimate Request Not Found',
          status: 404,
          detail: error.message,
          code: 'ESTIMATE_REQUEST_NOT_FOUND',
        });
        return;
      }
      if (error instanceof EstimateRequestConflictError) {
        res.status(409).json({
          type: 'https://architrack.example.com/problems/estimate-request-conflict',
          title: 'Conflict',
          status: 409,
          detail: error.message,
          code: 'ESTIMATE_REQUEST_CONFLICT',
        });
        return;
      }
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/estimate-requests/{id}:
 *   delete:
 *     summary: 見積依頼削除
 *     description: 見積依頼を論理削除（楽観的排他制御）
 *     tags:
 *       - Estimate Requests
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: 見積依頼ID
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
 *         description: 見積依頼削除成功
 *       400:
 *         description: バリデーションエラー
 *       401:
 *         description: 認証エラー
 *       403:
 *         description: 権限不足
 *       404:
 *         description: 見積依頼が見つからない
 *       409:
 *         description: 楽観的排他制御エラー（競合）
 */
router.delete(
  '/:id',
  authenticate,
  requirePermission('estimate_request:delete'),
  validate(estimateRequestIdParamSchema, 'params'),
  validate(deleteEstimateRequestBodySchema, 'body'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.validatedParams as { id: string };
      const actorId = req.user!.userId;
      const { updatedAt } = req.validatedBody as { updatedAt: string };

      await estimateRequestService.delete(id, actorId, new Date(updatedAt));

      logger.info(
        { userId: actorId, estimateRequestId: id },
        'Estimate request deleted successfully'
      );

      res.status(204).send();
    } catch (error) {
      if (error instanceof EstimateRequestNotFoundError) {
        res.status(404).json({
          type: 'https://architrack.example.com/problems/estimate-request-not-found',
          title: 'Estimate Request Not Found',
          status: 404,
          detail: error.message,
          code: 'ESTIMATE_REQUEST_NOT_FOUND',
        });
        return;
      }
      if (error instanceof EstimateRequestConflictError) {
        res.status(409).json({
          type: 'https://architrack.example.com/problems/estimate-request-conflict',
          title: 'Conflict',
          status: 409,
          detail: error.message,
          code: 'ESTIMATE_REQUEST_CONFLICT',
        });
        return;
      }
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/estimate-requests/{id}/items:
 *   patch:
 *     summary: 項目選択状態更新
 *     description: 見積依頼の項目選択状態を更新
 *     tags:
 *       - Estimate Requests
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: 見積依頼ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - items
 *             properties:
 *               items:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required:
 *                     - itemId
 *                     - selected
 *                   properties:
 *                     itemId:
 *                       type: string
 *                       format: uuid
 *                       description: 見積依頼項目ID
 *                     selected:
 *                       type: boolean
 *                       description: 選択状態
 *     responses:
 *       204:
 *         description: 項目選択状態更新成功
 *       400:
 *         description: バリデーションエラー
 *       401:
 *         description: 認証エラー
 *       403:
 *         description: 権限不足
 *       404:
 *         description: 見積依頼が見つからない
 */
router.patch(
  '/:id/items',
  authenticate,
  requirePermission('estimate_request:update'),
  validate(estimateRequestIdParamSchema, 'params'),
  validate(updateItemSelectionSchema, 'body'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.validatedParams as { id: string };
      const actorId = req.user!.userId;
      const { items } = req.validatedBody as {
        items: Array<{ itemId: string; selected: boolean }>;
      };

      await estimateRequestService.updateItemSelection(id, items, actorId);

      logger.info(
        { userId: actorId, estimateRequestId: id, itemCount: items.length },
        'Estimate request items updated successfully'
      );

      res.status(204).send();
    } catch (error) {
      if (error instanceof EstimateRequestNotFoundError) {
        res.status(404).json({
          type: 'https://architrack.example.com/problems/estimate-request-not-found',
          title: 'Estimate Request Not Found',
          status: 404,
          detail: error.message,
          code: 'ESTIMATE_REQUEST_NOT_FOUND',
        });
        return;
      }
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/estimate-requests/{id}/items-with-status:
 *   get:
 *     summary: 他の見積依頼での選択状態を含む項目一覧取得
 *     description: 見積依頼の項目一覧を、他の見積依頼での選択状態情報と共に取得
 *     tags:
 *       - Estimate Requests
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: 見積依頼ID
 *     responses:
 *       200:
 *         description: 項目一覧（他の見積依頼での選択状態を含む）
 *       401:
 *         description: 認証エラー
 *       403:
 *         description: 権限不足
 *       404:
 *         description: 見積依頼が見つからない
 */
router.get(
  '/:id/items-with-status',
  authenticate,
  requirePermission('estimate_request:read'),
  validate(estimateRequestIdParamSchema, 'params'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.validatedParams as { id: string };

      const items = await estimateRequestService.findItemsWithOtherRequestStatus(id);

      logger.debug(
        { userId: req.user?.userId, estimateRequestId: id, itemCount: items.length },
        'Estimate request items with status retrieved'
      );

      res.json(items);
    } catch (error) {
      if (error instanceof EstimateRequestNotFoundError) {
        res.status(404).json({
          type: 'https://architrack.example.com/problems/estimate-request-not-found',
          title: 'Estimate Request Not Found',
          status: 404,
          detail: error.message,
          code: 'ESTIMATE_REQUEST_NOT_FOUND',
        });
        return;
      }
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/estimate-requests/{id}/text:
 *   get:
 *     summary: 見積依頼文生成
 *     description: 見積依頼のmethod（EMAIL/FAX）に応じた見積依頼文を生成
 *     tags:
 *       - Estimate Requests
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: 見積依頼ID
 *     responses:
 *       200:
 *         description: 見積依頼文
 *         content:
 *           application/json:
 *             schema:
 *               oneOf:
 *                 - type: object
 *                   properties:
 *                     type:
 *                       type: string
 *                       enum: [email]
 *                     to:
 *                       type: string
 *                       format: email
 *                     subject:
 *                       type: string
 *                     body:
 *                       type: string
 *                 - type: object
 *                   properties:
 *                     type:
 *                       type: string
 *                       enum: [fax]
 *                     faxNumber:
 *                       type: string
 *                     body:
 *                       type: string
 *       401:
 *         description: 認証エラー
 *       403:
 *         description: 権限不足
 *       404:
 *         description: 見積依頼が見つからない
 *       422:
 *         description: 項目が選択されていない、または連絡先が未登録
 */
router.get(
  '/:id/text',
  authenticate,
  requirePermission('estimate_request:read'),
  validate(estimateRequestIdParamSchema, 'params'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.validatedParams as { id: string };

      const text = await estimateRequestTextService.generateText(id);

      logger.debug(
        { userId: req.user?.userId, estimateRequestId: id, type: text.type },
        'Estimate request text generated'
      );

      // Transform backend response to frontend expected format
      const recipient = text.type === 'email' ? text.to : text.faxNumber;
      res.json({
        recipient,
        subject: text.type === 'email' ? text.subject : '',
        body: text.body,
      });
    } catch (error) {
      if (error instanceof EstimateRequestNotFoundError) {
        res.status(404).json({
          type: 'https://architrack.example.com/problems/estimate-request-not-found',
          title: 'Estimate Request Not Found',
          status: 404,
          detail: error.message,
          code: 'ESTIMATE_REQUEST_NOT_FOUND',
        });
        return;
      }
      if (error instanceof NoItemsSelectedError) {
        res.status(422).json({
          type: 'https://architrack.example.com/problems/no-items-selected',
          title: 'No Items Selected',
          status: 422,
          detail: error.message,
          code: 'NO_ITEMS_SELECTED',
        });
        return;
      }
      if (error instanceof MissingContactInfoError) {
        res.status(422).json({
          type: 'https://architrack.example.com/problems/missing-contact-info',
          title: 'Missing Contact Info',
          status: 422,
          detail: error.message,
          code: 'MISSING_CONTACT_INFO',
          contactType: error.contactType,
          tradingPartnerId: error.tradingPartnerId,
        });
        return;
      }
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/estimate-requests/{id}/excel:
 *   get:
 *     summary: Excel出力
 *     description: 選択された項目をExcelファイルとしてダウンロード
 *     tags:
 *       - Estimate Requests
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: 見積依頼ID
 *     responses:
 *       200:
 *         description: Excelファイル
 *         content:
 *           application/vnd.openxmlformats-officedocument.spreadsheetml.sheet:
 *             schema:
 *               type: string
 *               format: binary
 *       401:
 *         description: 認証エラー
 *       403:
 *         description: 権限不足
 *       404:
 *         description: 見積依頼が見つからない
 *       422:
 *         description: 項目が選択されていない
 */
router.get(
  '/:id/excel',
  authenticate,
  requirePermission('estimate_request:read'),
  validate(estimateRequestIdParamSchema, 'params'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.validatedParams as { id: string };

      // TODO: Task 4 で実装予定（Excel生成サービス）
      // 一時的に未実装のレスポンスを返す
      res.status(501).json({
        type: 'https://architrack.example.com/problems/not-implemented',
        title: 'Not Implemented',
        status: 501,
        detail: 'Excel出力機能は未実装です',
        code: 'NOT_IMPLEMENTED',
        estimateRequestId: id,
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
