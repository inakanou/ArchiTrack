/**
 * @fileoverview 数量項目APIルート
 *
 * Requirements:
 * - 5.1: 数量グループ内で行追加操作を行う
 * - 5.2: 数量項目の各フィールドに値を入力する
 * - 5.3: 必須フィールド（大項目・工種・名称・単位・数量）が未入力で保存を試行する
 * - 5.4: 数量項目を選択して削除操作を行う
 * - 6.1: 数量項目のコピー
 * - 6.2: 数量項目の移動
 * - 6.4: 複数項目の一括コピー・移動
 *
 * @module routes/quantity-items
 */

import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { QuantityItemService } from '../services/quantity-item.service.js';
import { AuditLogService } from '../services/audit-log.service.js';
import getPrismaClient from '../db.js';
import { validate } from '../middleware/validate.middleware.js';
import { authenticate } from '../middleware/authenticate.middleware.js';
import { requirePermission } from '../middleware/authorize.middleware.js';
import logger from '../utils/logger.js';
import {
  createQuantityItemSchema,
  updateQuantityItemSchema,
  quantityItemIdParamSchema,
} from '../schemas/quantity-table.schema.js';
import {
  QuantityGroupNotFoundError,
  QuantityItemNotFoundError,
  QuantityItemConflictError,
  QuantityTableValidationError,
} from '../errors/quantityTableError.js';

// mergeParams: true を設定してネストされたルートからgroupIdを取得できるようにする
const router = Router({ mergeParams: true });
const prisma = getPrismaClient();
const auditLogService = new AuditLogService({ prisma });
const quantityItemService = new QuantityItemService({
  prisma,
  auditLogService,
});

/**
 * グループIDパラメータスキーマ（URLパラメータ用）
 */
const groupIdUrlParamSchema = z.object({
  groupId: z
    .string()
    .min(1, '数量グループIDは必須です')
    .regex(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      '数量グループIDの形式が不正です'
    ),
});

/**
 * 作成時のリクエストボディ用スキーマ（quantityGroupIdはURLパラメータから取得するため除外）
 */
const createQuantityItemBodySchema = createQuantityItemSchema.omit({ quantityGroupId: true });

/**
 * 更新リクエストボディ用スキーマ（expectedUpdatedAt必須）
 */
const updateQuantityItemRequestSchema = updateQuantityItemSchema.extend({
  expectedUpdatedAt: z.string().datetime({ message: '日時の形式が不正です' }),
});

/**
 * 表示順序更新スキーマ
 */
const updateDisplayOrderSchema = z.object({
  orderUpdates: z.array(
    z.object({
      id: z.string().uuid('項目IDの形式が不正です'),
      displayOrder: z.number().int().min(0, '表示順序は0以上の整数を入力してください'),
    })
  ),
});

/**
 * 移動リクエストスキーマ
 */
const moveItemSchema = z.object({
  targetGroupId: z.string().uuid('移動先グループIDの形式が不正です'),
  displayOrder: z.number().int().min(0, '表示順序は0以上の整数を入力してください'),
});

/**
 * 一括コピースキーマ
 */
const bulkCopySchema = z.object({
  itemIds: z
    .array(z.string().uuid('項目IDの形式が不正です'))
    .min(1, '項目を1つ以上選択してください'),
});

/**
 * 一括移動スキーマ
 */
const bulkMoveSchema = z.object({
  itemIds: z
    .array(z.string().uuid('項目IDの形式が不正です'))
    .min(1, '項目を1つ以上選択してください'),
  targetGroupId: z.string().uuid('移動先グループIDの形式が不正です'),
});

/**
 * @swagger
 * /api/quantity-groups/{groupId}/items:
 *   post:
 *     summary: 数量項目作成
 *     description: 新しい数量項目を作成
 *     tags:
 *       - Quantity Items
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: groupId
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
 *               - majorCategory
 *               - workType
 *               - name
 *               - unit
 *               - quantity
 *             properties:
 *               majorCategory:
 *                 type: string
 *                 maxLength: 100
 *               middleCategory:
 *                 type: string
 *                 maxLength: 100
 *               minorCategory:
 *                 type: string
 *                 maxLength: 100
 *               customCategory:
 *                 type: string
 *                 maxLength: 100
 *               workType:
 *                 type: string
 *                 maxLength: 100
 *               name:
 *                 type: string
 *                 maxLength: 200
 *               specification:
 *                 type: string
 *                 maxLength: 500
 *               unit:
 *                 type: string
 *                 maxLength: 50
 *               quantity:
 *                 type: number
 *     responses:
 *       201:
 *         description: 数量項目作成成功
 *       400:
 *         description: バリデーションエラー
 *       401:
 *         description: 認証エラー
 *       403:
 *         description: 権限不足
 *       404:
 *         description: 数量グループが見つからない
 */
router.post(
  '/',
  authenticate,
  requirePermission('quantity_table:update'),
  validate(groupIdUrlParamSchema, 'params'),
  validate(createQuantityItemBodySchema, 'body'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { groupId } = req.validatedParams as { groupId: string };
      const actorId = req.user!.userId;
      const validatedBody = req.validatedBody as Omit<
        z.infer<typeof createQuantityItemSchema>,
        'quantityGroupId'
      >;

      const input = {
        ...validatedBody,
        quantityGroupId: groupId,
      };

      const quantityItem = await quantityItemService.create(input, actorId);

      logger.info(
        {
          userId: actorId,
          quantityItemId: quantityItem.id,
          groupId,
          name: quantityItem.name,
        },
        'Quantity item created successfully'
      );

      res.status(201).json(quantityItem);
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

/**
 * @swagger
 * /api/quantity-groups/{groupId}/items:
 *   get:
 *     summary: 数量項目一覧取得
 *     description: グループに紐付く項目の一覧を取得
 *     tags:
 *       - Quantity Items
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: groupId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: 数量グループID
 *     responses:
 *       200:
 *         description: 数量項目一覧
 *       401:
 *         description: 認証エラー
 *       403:
 *         description: 権限不足
 */
router.get(
  '/',
  authenticate,
  requirePermission('quantity_table:read'),
  validate(groupIdUrlParamSchema, 'params'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { groupId } = req.validatedParams as { groupId: string };

      const items = await quantityItemService.findByGroupId(groupId);

      logger.debug(
        { userId: req.user?.userId, groupId, count: items.length },
        'Quantity items list retrieved'
      );

      res.json(items);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/quantity-groups/{groupId}/items/order:
 *   put:
 *     summary: 数量項目の表示順序一括更新
 *     description: 項目の表示順序を一括で更新
 *     tags:
 *       - Quantity Items
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: groupId
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
 */
router.put(
  '/order',
  authenticate,
  requirePermission('quantity_table:update'),
  validate(groupIdUrlParamSchema, 'params'),
  validate(updateDisplayOrderSchema, 'body'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { groupId } = req.validatedParams as { groupId: string };
      const actorId = req.user!.userId;
      const { orderUpdates } = req.validatedBody as {
        orderUpdates: Array<{ id: string; displayOrder: number }>;
      };

      await quantityItemService.updateDisplayOrder(groupId, orderUpdates, actorId);

      logger.info(
        { userId: actorId, groupId, updatedCount: orderUpdates.length },
        'Quantity items display order updated'
      );

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
 * /api/quantity-items/{id}:
 *   get:
 *     summary: 数量項目詳細取得
 *     description: 数量項目の詳細情報を取得
 *     tags:
 *       - Quantity Items
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: 数量項目ID
 *     responses:
 *       200:
 *         description: 数量項目詳細
 *       401:
 *         description: 認証エラー
 *       403:
 *         description: 権限不足
 *       404:
 *         description: 数量項目が見つからない
 */
router.get(
  '/:id',
  authenticate,
  requirePermission('quantity_table:read'),
  validate(quantityItemIdParamSchema, 'params'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.validatedParams as { id: string };

      const quantityItem = await quantityItemService.findById(id);

      if (!quantityItem) {
        res.status(404).json({
          type: 'https://architrack.example.com/problems/quantity-item-not-found',
          title: 'Quantity Item Not Found',
          status: 404,
          detail: `Quantity item not found: ${id}`,
          code: 'QUANTITY_ITEM_NOT_FOUND',
          quantityItemId: id,
        });
        return;
      }

      logger.debug(
        { userId: req.user?.userId, quantityItemId: id },
        'Quantity item detail retrieved'
      );

      res.json(quantityItem);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/quantity-items/{id}:
 *   put:
 *     summary: 数量項目更新
 *     description: 既存の数量項目情報を更新（楽観的排他制御）
 *     tags:
 *       - Quantity Items
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: 数量項目ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - expectedUpdatedAt
 *             properties:
 *               majorCategory:
 *                 type: string
 *               name:
 *                 type: string
 *               quantity:
 *                 type: number
 *               expectedUpdatedAt:
 *                 type: string
 *                 format: date-time
 *     responses:
 *       200:
 *         description: 数量項目更新成功
 *       400:
 *         description: バリデーションエラー
 *       401:
 *         description: 認証エラー
 *       403:
 *         description: 権限不足
 *       404:
 *         description: 数量項目が見つからない
 *       409:
 *         description: 楽観的排他制御エラー（競合）
 */
router.put(
  '/:id',
  authenticate,
  requirePermission('quantity_table:update'),
  validate(quantityItemIdParamSchema, 'params'),
  validate(updateQuantityItemRequestSchema, 'body'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.validatedParams as { id: string };
      const actorId = req.user!.userId;
      const { expectedUpdatedAt, ...updateData } = req.validatedBody as {
        expectedUpdatedAt: string;
        [key: string]: unknown;
      };

      const quantityItem = await quantityItemService.update(
        id,
        updateData as z.infer<typeof updateQuantityItemSchema>,
        actorId,
        new Date(expectedUpdatedAt)
      );

      logger.info({ userId: actorId, quantityItemId: id }, 'Quantity item updated successfully');

      res.json(quantityItem);
    } catch (error) {
      if (error instanceof QuantityItemNotFoundError) {
        res.status(404).json({
          type: 'https://architrack.example.com/problems/quantity-item-not-found',
          title: 'Quantity Item Not Found',
          status: 404,
          detail: error.message,
          code: 'QUANTITY_ITEM_NOT_FOUND',
        });
        return;
      }
      if (error instanceof QuantityItemConflictError) {
        const conflictDetails = error.details as Record<string, unknown> | undefined;
        res.status(409).json({
          type: 'https://architrack.example.com/problems/quantity-item-conflict',
          title: 'Conflict',
          status: 409,
          detail: error.message,
          code: 'QUANTITY_ITEM_CONFLICT',
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
 * /api/quantity-items/{id}:
 *   delete:
 *     summary: 数量項目削除
 *     description: 数量項目を削除
 *     tags:
 *       - Quantity Items
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: 数量項目ID
 *     responses:
 *       204:
 *         description: 数量項目削除成功
 *       401:
 *         description: 認証エラー
 *       403:
 *         description: 権限不足
 *       404:
 *         description: 数量項目が見つからない
 */
router.delete(
  '/:id',
  authenticate,
  requirePermission('quantity_table:delete'),
  validate(quantityItemIdParamSchema, 'params'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.validatedParams as { id: string };
      const actorId = req.user!.userId;

      await quantityItemService.delete(id, actorId);

      logger.info({ userId: actorId, quantityItemId: id }, 'Quantity item deleted successfully');

      res.status(204).send();
    } catch (error) {
      if (error instanceof QuantityItemNotFoundError) {
        res.status(404).json({
          type: 'https://architrack.example.com/problems/quantity-item-not-found',
          title: 'Quantity Item Not Found',
          status: 404,
          detail: error.message,
          code: 'QUANTITY_ITEM_NOT_FOUND',
        });
        return;
      }
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/quantity-items/{id}/copy:
 *   post:
 *     summary: 数量項目コピー
 *     description: 数量項目をコピーして新規作成
 *     tags:
 *       - Quantity Items
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: コピー元の数量項目ID
 *     responses:
 *       201:
 *         description: 数量項目コピー成功
 *       401:
 *         description: 認証エラー
 *       403:
 *         description: 権限不足
 *       404:
 *         description: 数量項目が見つからない
 */
router.post(
  '/:id/copy',
  authenticate,
  requirePermission('quantity_table:update'),
  validate(quantityItemIdParamSchema, 'params'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.validatedParams as { id: string };
      const actorId = req.user!.userId;

      const copiedItem = await quantityItemService.copy(id, actorId);

      logger.info(
        { userId: actorId, sourceItemId: id, copiedItemId: copiedItem.id },
        'Quantity item copied successfully'
      );

      res.status(201).json(copiedItem);
    } catch (error) {
      if (error instanceof QuantityItemNotFoundError) {
        res.status(404).json({
          type: 'https://architrack.example.com/problems/quantity-item-not-found',
          title: 'Quantity Item Not Found',
          status: 404,
          detail: error.message,
          code: 'QUANTITY_ITEM_NOT_FOUND',
        });
        return;
      }
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/quantity-items/{id}/move:
 *   post:
 *     summary: 数量項目移動
 *     description: 数量項目を別のグループに移動
 *     tags:
 *       - Quantity Items
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: 移動対象の数量項目ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - targetGroupId
 *               - displayOrder
 *             properties:
 *               targetGroupId:
 *                 type: string
 *                 format: uuid
 *               displayOrder:
 *                 type: integer
 *     responses:
 *       200:
 *         description: 数量項目移動成功
 *       400:
 *         description: バリデーションエラー
 *       401:
 *         description: 認証エラー
 *       403:
 *         description: 権限不足
 *       404:
 *         description: 数量項目または移動先グループが見つからない
 */
router.post(
  '/:id/move',
  authenticate,
  requirePermission('quantity_table:update'),
  validate(quantityItemIdParamSchema, 'params'),
  validate(moveItemSchema, 'body'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.validatedParams as { id: string };
      const actorId = req.user!.userId;
      const { targetGroupId, displayOrder } = req.validatedBody as {
        targetGroupId: string;
        displayOrder: number;
      };

      const movedItem = await quantityItemService.move(id, targetGroupId, displayOrder, actorId);

      logger.info(
        { userId: actorId, itemId: id, targetGroupId },
        'Quantity item moved successfully'
      );

      res.json(movedItem);
    } catch (error) {
      if (error instanceof QuantityItemNotFoundError) {
        res.status(404).json({
          type: 'https://architrack.example.com/problems/quantity-item-not-found',
          title: 'Quantity Item Not Found',
          status: 404,
          detail: error.message,
          code: 'QUANTITY_ITEM_NOT_FOUND',
        });
        return;
      }
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
 * /api/quantity-items/bulk-copy:
 *   post:
 *     summary: 数量項目一括コピー
 *     description: 複数の数量項目を一括でコピー
 *     tags:
 *       - Quantity Items
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - itemIds
 *             properties:
 *               itemIds:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: uuid
 *     responses:
 *       201:
 *         description: 一括コピー成功
 *       400:
 *         description: バリデーションエラー
 *       401:
 *         description: 認証エラー
 *       403:
 *         description: 権限不足
 */
router.post(
  '/bulk-copy',
  authenticate,
  requirePermission('quantity_table:update'),
  validate(bulkCopySchema, 'body'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const actorId = req.user!.userId;
      const { itemIds } = req.validatedBody as { itemIds: string[] };

      const copiedItems = await quantityItemService.bulkCopy(itemIds, actorId);

      logger.info(
        { userId: actorId, sourceCount: itemIds.length, copiedCount: copiedItems.length },
        'Quantity items bulk copied successfully'
      );

      res.status(201).json(copiedItems);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/quantity-items/bulk-move:
 *   post:
 *     summary: 数量項目一括移動
 *     description: 複数の数量項目を一括で別グループに移動
 *     tags:
 *       - Quantity Items
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - itemIds
 *               - targetGroupId
 *             properties:
 *               itemIds:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: uuid
 *               targetGroupId:
 *                 type: string
 *                 format: uuid
 *     responses:
 *       204:
 *         description: 一括移動成功
 *       400:
 *         description: バリデーションエラー
 *       401:
 *         description: 認証エラー
 *       403:
 *         description: 権限不足
 *       404:
 *         description: 移動先グループが見つからない
 */
router.post(
  '/bulk-move',
  authenticate,
  requirePermission('quantity_table:update'),
  validate(bulkMoveSchema, 'body'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const actorId = req.user!.userId;
      const { itemIds, targetGroupId } = req.validatedBody as {
        itemIds: string[];
        targetGroupId: string;
      };

      await quantityItemService.bulkMove(itemIds, targetGroupId, actorId);

      logger.info(
        { userId: actorId, itemCount: itemIds.length, targetGroupId },
        'Quantity items bulk moved successfully'
      );

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

export default router;
