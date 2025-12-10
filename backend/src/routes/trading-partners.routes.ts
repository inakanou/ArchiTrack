/**
 * @fileoverview 取引先CRUD APIルート
 *
 * Requirements:
 * - 7.1: 認証済みユーザーのみに取引先一覧・詳細の閲覧を許可
 * - 7.2: 取引先の作成・編集・削除操作に対して適切な権限チェックを実行
 * - 7.3: 権限のないユーザーが操作を試みた場合、403 Forbiddenエラーを返却
 *
 * @module routes/trading-partners
 */

import { Router, type Request, type Response, type NextFunction } from 'express';
import { TradingPartnerService } from '../services/trading-partner.service.js';
import { AuditLogService } from '../services/audit-log.service.js';
import getPrismaClient from '../db.js';
import { validate } from '../middleware/validate.middleware.js';
import { authenticate } from '../middleware/authenticate.middleware.js';
import { requirePermission } from '../middleware/authorize.middleware.js';
import logger from '../utils/logger.js';
import {
  createTradingPartnerSchema,
  updateTradingPartnerSchema,
  tradingPartnerListQuerySchema,
  tradingPartnerIdParamSchema,
  type CreateTradingPartnerInput,
  type UpdateTradingPartnerInput,
  type TradingPartnerListQuery,
  type TradingPartnerType,
  type TradingPartnerSortableField,
  type SortOrder,
} from '../schemas/trading-partner.schema.js';
import {
  TradingPartnerNotFoundError,
  TradingPartnerValidationError,
  TradingPartnerConflictError,
  DuplicatePartnerNameError,
  PartnerInUseError,
} from '../errors/tradingPartnerError.js';

const router = Router();
const prisma = getPrismaClient();
const auditLogService = new AuditLogService({ prisma });
const tradingPartnerService = new TradingPartnerService({
  prisma,
  auditLogService,
});

/**
 * @swagger
 * /api/trading-partners:
 *   get:
 *     summary: 取引先一覧取得
 *     description: ページネーション、検索、フィルタリング、ソートに対応した取引先一覧を取得
 *     tags:
 *       - TradingPartners
 *     security:
 *       - bearerAuth: []
 *     parameters:
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
 *         description: 1ページあたりの表示件数（1～100）
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: 検索キーワード（取引先名・フリガナの部分一致）
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [CUSTOMER, SUBCONTRACTOR]
 *         description: 種別フィルター
 *       - in: query
 *         name: sort
 *         schema:
 *           type: string
 *           enum: [id, name, nameKana, createdAt, updatedAt]
 *           default: nameKana
 *         description: ソートフィールド
 *       - in: query
 *         name: order
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *           default: asc
 *         description: ソート順序
 *     responses:
 *       200:
 *         description: 取引先一覧
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/TradingPartnerInfo'
 *                 pagination:
 *                   $ref: '#/components/schemas/PaginationInfo'
 *       400:
 *         description: バリデーションエラー
 *       401:
 *         description: 認証エラー
 *       403:
 *         description: 権限不足
 */
router.get(
  '/',
  authenticate,
  requirePermission('trading-partner:read'),
  validate(tradingPartnerListQuerySchema, 'query'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const validatedQuery = req.validatedQuery as TradingPartnerListQuery;

      const { page, limit, sort, order, search, type } = validatedQuery;

      const result = await tradingPartnerService.getPartners(
        {
          search,
          type: type as TradingPartnerType | undefined,
        },
        { page, limit },
        { sort: sort as TradingPartnerSortableField, order: order as SortOrder }
      );

      logger.debug(
        { userId: req.user?.userId, page, limit, total: result.pagination.total },
        'Trading partners list retrieved'
      );

      res.json(result);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/trading-partners/{id}:
 *   get:
 *     summary: 取引先詳細取得
 *     description: 指定されたIDの取引先詳細を取得
 *     tags:
 *       - TradingPartners
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: 取引先ID
 *     responses:
 *       200:
 *         description: 取引先詳細
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/TradingPartnerDetail'
 *       400:
 *         description: 無効な取引先ID形式
 *       401:
 *         description: 認証エラー
 *       403:
 *         description: 権限不足
 *       404:
 *         description: 取引先が見つからない
 */
router.get(
  '/:id',
  authenticate,
  requirePermission('trading-partner:read'),
  validate(tradingPartnerIdParamSchema, 'params'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.validatedParams as { id: string };

      const partner = await tradingPartnerService.getPartner(id);

      logger.debug({ userId: req.user?.userId, partnerId: id }, 'Trading partner detail retrieved');

      res.json(partner);
    } catch (error) {
      if (error instanceof TradingPartnerNotFoundError) {
        res.status(404).json({
          type: error.problemType,
          title: 'Trading Partner Not Found',
          status: 404,
          detail: error.message,
          code: error.code,
          partnerId: error.partnerId,
        });
        return;
      }
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/trading-partners:
 *   post:
 *     summary: 取引先作成
 *     description: 新しい取引先を作成
 *     tags:
 *       - TradingPartners
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateTradingPartnerRequest'
 *     responses:
 *       201:
 *         description: 取引先作成成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/TradingPartnerInfo'
 *       400:
 *         description: バリデーションエラー
 *       401:
 *         description: 認証エラー
 *       403:
 *         description: 権限不足
 *       409:
 *         description: 取引先名重複
 */
router.post(
  '/',
  authenticate,
  requirePermission('trading-partner:create'),
  validate(createTradingPartnerSchema, 'body'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const actorId = req.user!.userId;
      const validatedBody = req.validatedBody as CreateTradingPartnerInput;

      const partner = await tradingPartnerService.createPartner(validatedBody, actorId);

      logger.info(
        { userId: actorId, partnerId: partner.id, name: partner.name },
        'Trading partner created successfully'
      );

      res.status(201).json(partner);
    } catch (error) {
      if (error instanceof TradingPartnerValidationError) {
        res.status(400).json({
          type: error.problemType,
          title: 'Validation Error',
          status: 400,
          detail: error.message,
          code: error.code,
          errors: error.validationErrors,
        });
        return;
      }
      if (error instanceof DuplicatePartnerNameError) {
        res.status(409).json({
          type: error.problemType,
          title: 'Duplicate Partner Name',
          status: 409,
          detail: error.message,
          code: error.code,
          name: error.partnerName,
        });
        return;
      }
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/trading-partners/{id}:
 *   put:
 *     summary: 取引先更新
 *     description: 既存の取引先情報を更新（楽観的排他制御）
 *     tags:
 *       - TradingPartners
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: 取引先ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateTradingPartnerRequest'
 *     responses:
 *       200:
 *         description: 取引先更新成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/TradingPartnerInfo'
 *       400:
 *         description: バリデーションエラー
 *       401:
 *         description: 認証エラー
 *       403:
 *         description: 権限不足
 *       404:
 *         description: 取引先が見つからない
 *       409:
 *         description: 楽観的排他制御エラー（競合）または取引先名重複
 */
router.put(
  '/:id',
  authenticate,
  requirePermission('trading-partner:update'),
  validate(tradingPartnerIdParamSchema, 'params'),
  validate(updateTradingPartnerSchema, 'body'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.validatedParams as { id: string };
      const actorId = req.user!.userId;
      const { expectedUpdatedAt, ...updateData } = req.validatedBody as UpdateTradingPartnerInput;

      const partner = await tradingPartnerService.updatePartner(
        id,
        updateData,
        actorId,
        new Date(expectedUpdatedAt)
      );

      logger.info({ userId: actorId, partnerId: id }, 'Trading partner updated successfully');

      res.json(partner);
    } catch (error) {
      if (error instanceof TradingPartnerNotFoundError) {
        res.status(404).json({
          type: error.problemType,
          title: 'Trading Partner Not Found',
          status: 404,
          detail: error.message,
          code: error.code,
          partnerId: error.partnerId,
        });
        return;
      }
      if (error instanceof TradingPartnerValidationError) {
        res.status(400).json({
          type: error.problemType,
          title: 'Validation Error',
          status: 400,
          detail: error.message,
          code: error.code,
          errors: error.validationErrors,
        });
        return;
      }
      if (error instanceof TradingPartnerConflictError) {
        const conflictDetails = error.details as Record<string, unknown> | undefined;
        res.status(409).json({
          type: error.problemType,
          title: 'Conflict',
          status: 409,
          detail: error.message,
          code: error.code,
          ...(conflictDetails ?? {}),
        });
        return;
      }
      if (error instanceof DuplicatePartnerNameError) {
        res.status(409).json({
          type: error.problemType,
          title: 'Duplicate Partner Name',
          status: 409,
          detail: error.message,
          code: error.code,
          name: error.partnerName,
        });
        return;
      }
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/trading-partners/{id}:
 *   delete:
 *     summary: 取引先削除
 *     description: 取引先を論理削除
 *     tags:
 *       - TradingPartners
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: 取引先ID
 *     responses:
 *       204:
 *         description: 取引先削除成功
 *       400:
 *         description: 無効な取引先ID形式
 *       401:
 *         description: 認証エラー
 *       403:
 *         description: 権限不足
 *       404:
 *         description: 取引先が見つからない
 *       409:
 *         description: プロジェクト紐付け中のため削除不可
 */
router.delete(
  '/:id',
  authenticate,
  requirePermission('trading-partner:delete'),
  validate(tradingPartnerIdParamSchema, 'params'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.validatedParams as { id: string };
      const actorId = req.user!.userId;

      await tradingPartnerService.deletePartner(id, actorId);

      logger.info({ userId: actorId, partnerId: id }, 'Trading partner deleted successfully');

      res.status(204).send();
    } catch (error) {
      if (error instanceof TradingPartnerNotFoundError) {
        res.status(404).json({
          type: error.problemType,
          title: 'Trading Partner Not Found',
          status: 404,
          detail: error.message,
          code: error.code,
          partnerId: error.partnerId,
        });
        return;
      }
      if (error instanceof PartnerInUseError) {
        const errorDetails = error.details as { partnerId?: string; projectIds?: string[] };
        res.status(409).json({
          type: error.problemType,
          title: 'Partner In Use',
          status: 409,
          detail: error.message,
          code: error.code,
          partnerId: errorDetails.partnerId,
          projectIds: errorDetails.projectIds,
        });
        return;
      }
      next(error);
    }
  }
);

export default router;
