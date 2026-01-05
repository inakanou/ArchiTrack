/**
 * @fileoverview 数量グループAPIルート
 *
 * Requirements:
 * - 4.1: 数量表編集画面で数量グループ追加操作を行う
 * - 4.2: 数量グループが追加される場合、同一プロジェクトの注釈付き現場調査写真選択機能を提供する
 * - 4.3: 数量グループ内で写真選択操作を行う
 * - 4.4: 数量グループに写真が紐づけられている状態で、注釈付き写真と数量項目の関連性を視覚的に表示する
 * - 4.5: 数量グループの削除操作を行う
 *
 * @module routes/quantity-groups
 */

import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { QuantityGroupService } from '../services/quantity-group.service.js';
import { AuditLogService } from '../services/audit-log.service.js';
import getPrismaClient from '../db.js';
import { validate } from '../middleware/validate.middleware.js';
import { authenticate } from '../middleware/authenticate.middleware.js';
import { requirePermission } from '../middleware/authorize.middleware.js';
import logger from '../utils/logger.js';
import {
  createQuantityGroupSchema,
  updateQuantityGroupSchema,
  quantityGroupIdParamSchema,
} from '../schemas/quantity-table.schema.js';
import {
  QuantityTableNotFoundError,
  QuantityGroupNotFoundError,
  QuantityGroupConflictError,
  QuantityTableValidationError,
} from '../errors/quantityTableError.js';
import { SurveyImageNotFoundError } from '../errors/siteSurveyError.js';

// mergeParams: true を設定してネストされたルートからquantityTableIdを取得できるようにする
const router = Router({ mergeParams: true });
const prisma = getPrismaClient();
const auditLogService = new AuditLogService({ prisma });
const quantityGroupService = new QuantityGroupService({
  prisma,
  auditLogService,
});

/**
 * 数量表IDパラメータスキーマ（URLパラメータ用）
 */
const quantityTableIdUrlParamSchema = z.object({
  quantityTableId: z
    .string()
    .min(1, '数量表IDは必須です')
    .regex(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      '数量表IDの形式が不正です'
    ),
});

/**
 * 作成時のリクエストボディ用スキーマ（quantityTableIdはURLパラメータから取得するため除外）
 */
const createQuantityGroupBodySchema = createQuantityGroupSchema.omit({ quantityTableId: true });

/**
 * 更新リクエストボディ用スキーマ（expectedUpdatedAt必須）
 */
const updateQuantityGroupRequestSchema = updateQuantityGroupSchema.extend({
  expectedUpdatedAt: z.string().datetime({ message: '日時の形式が不正です' }),
});

/**
 * 表示順序更新スキーマ
 */
const updateDisplayOrderSchema = z.object({
  orderUpdates: z.array(
    z.object({
      id: z.string().uuid('グループIDの形式が不正です'),
      displayOrder: z.number().int().min(0, '表示順序は0以上の整数を入力してください'),
    })
  ),
});

/**
 * @swagger
 * /api/quantity-tables/{quantityTableId}/groups:
 *   post:
 *     summary: 数量グループ作成
 *     description: 新しい数量グループを作成
 *     tags:
 *       - Quantity Groups
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: quantityTableId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: 数量表ID
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 maxLength: 200
 *               surveyImageId:
 *                 type: string
 *                 format: uuid
 *               displayOrder:
 *                 type: integer
 *                 minimum: 0
 *     responses:
 *       201:
 *         description: 数量グループ作成成功
 *       400:
 *         description: バリデーションエラー
 *       401:
 *         description: 認証エラー
 *       403:
 *         description: 権限不足
 *       404:
 *         description: 数量表または現場調査画像が見つからない
 */
router.post(
  '/',
  authenticate,
  requirePermission('quantity_table:update'),
  validate(quantityTableIdUrlParamSchema, 'params'),
  validate(createQuantityGroupBodySchema, 'body'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { quantityTableId } = req.validatedParams as { quantityTableId: string };
      const actorId = req.user!.userId;
      const validatedBody = req.validatedBody as {
        name?: string | null;
        surveyImageId?: string | null;
        displayOrder: number;
      };

      const input = {
        ...validatedBody,
        quantityTableId,
      };

      const quantityGroup = await quantityGroupService.create(input, actorId);

      logger.info(
        {
          userId: actorId,
          quantityGroupId: quantityGroup.id,
          quantityTableId,
          name: quantityGroup.name,
        },
        'Quantity group created successfully'
      );

      res.status(201).json(quantityGroup);
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
      if (error instanceof SurveyImageNotFoundError) {
        res.status(404).json({
          type: 'https://architrack.example.com/problems/survey-image-not-found',
          title: 'Survey Image Not Found',
          status: 404,
          detail: error.message,
          code: 'SURVEY_IMAGE_NOT_FOUND',
        });
        return;
      }
      if (error instanceof QuantityTableValidationError) {
        res.status(400).json({
          type: 'https://architrack.example.com/problems/validation-error',
          title: 'Validation Error',
          status: 400,
          detail: error.message,
          code: 'QUANTITY_TABLE_VALIDATION_ERROR',
        });
        return;
      }
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/quantity-tables/{quantityTableId}/groups:
 *   get:
 *     summary: 数量グループ一覧取得
 *     description: 数量表に紐付くグループの一覧を取得
 *     tags:
 *       - Quantity Groups
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: quantityTableId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: 数量表ID
 *     responses:
 *       200:
 *         description: 数量グループ一覧
 *       401:
 *         description: 認証エラー
 *       403:
 *         description: 権限不足
 */
router.get(
  '/',
  authenticate,
  requirePermission('quantity_table:read'),
  validate(quantityTableIdUrlParamSchema, 'params'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { quantityTableId } = req.validatedParams as { quantityTableId: string };

      const groups = await quantityGroupService.findByQuantityTableId(quantityTableId);

      logger.debug(
        { userId: req.user?.userId, quantityTableId, count: groups.length },
        'Quantity groups list retrieved'
      );

      res.json(groups);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/quantity-tables/{quantityTableId}/groups/order:
 *   put:
 *     summary: 数量グループの表示順序一括更新
 *     description: グループの表示順序を一括で更新
 *     tags:
 *       - Quantity Groups
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: quantityTableId
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
 *               - orderUpdates
 *             properties:
 *               orderUpdates:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       format: uuid
 *                     displayOrder:
 *                       type: integer
 *     responses:
 *       204:
 *         description: 更新成功
 *       400:
 *         description: バリデーションエラー
 *       401:
 *         description: 認証エラー
 *       403:
 *         description: 権限不足
 *       404:
 *         description: 数量表が見つからない
 */
router.put(
  '/order',
  authenticate,
  requirePermission('quantity_table:update'),
  validate(quantityTableIdUrlParamSchema, 'params'),
  validate(updateDisplayOrderSchema, 'body'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { quantityTableId } = req.validatedParams as { quantityTableId: string };
      const actorId = req.user!.userId;
      const { orderUpdates } = req.validatedBody as {
        orderUpdates: Array<{ id: string; displayOrder: number }>;
      };

      await quantityGroupService.updateDisplayOrder(quantityTableId, orderUpdates, actorId);

      logger.info(
        { userId: actorId, quantityTableId, updatedCount: orderUpdates.length },
        'Quantity groups display order updated'
      );

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
      if (error instanceof QuantityTableValidationError) {
        res.status(400).json({
          type: 'https://architrack.example.com/problems/validation-error',
          title: 'Validation Error',
          status: 400,
          detail: error.message,
          code: 'QUANTITY_TABLE_VALIDATION_ERROR',
        });
        return;
      }
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/quantity-groups/{id}:
 *   get:
 *     summary: 数量グループ詳細取得
 *     description: 数量グループの詳細情報を取得
 *     tags:
 *       - Quantity Groups
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: 数量グループID
 *     responses:
 *       200:
 *         description: 数量グループ詳細
 *       401:
 *         description: 認証エラー
 *       403:
 *         description: 権限不足
 *       404:
 *         description: 数量グループが見つからない
 */
router.get(
  '/:id',
  authenticate,
  requirePermission('quantity_table:read'),
  validate(quantityGroupIdParamSchema, 'params'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.validatedParams as { id: string };

      const quantityGroup = await quantityGroupService.findById(id);

      if (!quantityGroup) {
        res.status(404).json({
          type: 'https://architrack.example.com/problems/quantity-group-not-found',
          title: 'Quantity Group Not Found',
          status: 404,
          detail: `Quantity group not found: ${id}`,
          code: 'QUANTITY_GROUP_NOT_FOUND',
          quantityGroupId: id,
        });
        return;
      }

      logger.debug(
        { userId: req.user?.userId, quantityGroupId: id },
        'Quantity group detail retrieved'
      );

      res.json(quantityGroup);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/quantity-groups/{id}:
 *   put:
 *     summary: 数量グループ更新
 *     description: 既存の数量グループ情報を更新（楽観的排他制御）
 *     tags:
 *       - Quantity Groups
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: 数量グループID
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
 *               surveyImageId:
 *                 type: string
 *                 format: uuid
 *               displayOrder:
 *                 type: integer
 *               expectedUpdatedAt:
 *                 type: string
 *                 format: date-time
 *     responses:
 *       200:
 *         description: 数量グループ更新成功
 *       400:
 *         description: バリデーションエラー
 *       401:
 *         description: 認証エラー
 *       403:
 *         description: 権限不足
 *       404:
 *         description: 数量グループが見つからない
 *       409:
 *         description: 楽観的排他制御エラー（競合）
 */
router.put(
  '/:id',
  authenticate,
  requirePermission('quantity_table:update'),
  validate(quantityGroupIdParamSchema, 'params'),
  validate(updateQuantityGroupRequestSchema, 'body'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.validatedParams as { id: string };
      const actorId = req.user!.userId;
      const { expectedUpdatedAt, ...updateData } = req.validatedBody as {
        expectedUpdatedAt: string;
        name?: string | null;
        surveyImageId?: string | null;
        displayOrder?: number;
      };

      const quantityGroup = await quantityGroupService.update(
        id,
        updateData,
        actorId,
        new Date(expectedUpdatedAt)
      );

      logger.info({ userId: actorId, quantityGroupId: id }, 'Quantity group updated successfully');

      res.json(quantityGroup);
    } catch (error) {
      if (error instanceof QuantityGroupNotFoundError) {
        res.status(404).json({
          type: 'https://architrack.example.com/problems/quantity-group-not-found',
          title: 'Quantity Group Not Found',
          status: 404,
          detail: error.message,
          code: 'QUANTITY_GROUP_NOT_FOUND',
        });
        return;
      }
      if (error instanceof QuantityGroupConflictError) {
        const conflictDetails = error.details as Record<string, unknown> | undefined;
        res.status(409).json({
          type: 'https://architrack.example.com/problems/quantity-group-conflict',
          title: 'Conflict',
          status: 409,
          detail: error.message,
          code: 'QUANTITY_GROUP_CONFLICT',
          ...(conflictDetails ?? {}),
        });
        return;
      }
      if (error instanceof SurveyImageNotFoundError) {
        res.status(404).json({
          type: 'https://architrack.example.com/problems/survey-image-not-found',
          title: 'Survey Image Not Found',
          status: 404,
          detail: error.message,
          code: 'SURVEY_IMAGE_NOT_FOUND',
        });
        return;
      }
      if (error instanceof QuantityTableValidationError) {
        res.status(400).json({
          type: 'https://architrack.example.com/problems/validation-error',
          title: 'Validation Error',
          status: 400,
          detail: error.message,
          code: 'QUANTITY_TABLE_VALIDATION_ERROR',
        });
        return;
      }
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/quantity-groups/{id}:
 *   delete:
 *     summary: 数量グループ削除
 *     description: 数量グループを削除（配下の項目もカスケード削除）
 *     tags:
 *       - Quantity Groups
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: 数量グループID
 *     responses:
 *       204:
 *         description: 数量グループ削除成功
 *       401:
 *         description: 認証エラー
 *       403:
 *         description: 権限不足
 *       404:
 *         description: 数量グループが見つからない
 */
router.delete(
  '/:id',
  authenticate,
  requirePermission('quantity_table:delete'),
  validate(quantityGroupIdParamSchema, 'params'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.validatedParams as { id: string };
      const actorId = req.user!.userId;

      await quantityGroupService.delete(id, actorId);

      logger.info({ userId: actorId, quantityGroupId: id }, 'Quantity group deleted successfully');

      res.status(204).send();
    } catch (error) {
      if (error instanceof QuantityGroupNotFoundError) {
        res.status(404).json({
          type: 'https://architrack.example.com/problems/quantity-group-not-found',
          title: 'Quantity Group Not Found',
          status: 404,
          detail: error.message,
          code: 'QUANTITY_GROUP_NOT_FOUND',
        });
        return;
      }
      next(error);
    }
  }
);

export default router;
