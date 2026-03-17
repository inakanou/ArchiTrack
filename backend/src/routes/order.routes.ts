/**
 * @fileoverview 発注APIルート
 *
 * 発注のCRUD操作エンドポイントを提供します。
 * 実行予算のサブルートとして /api/projects/:projectId/execution-budget/orders/ にマウントされます。
 *
 * Requirements:
 * - 17.3: 発注の閲覧をVIEWER以上のロールに許可する / 発注の作成・編集・削除をEDITOR以上のロールに許可する
 * - 19.3: 発注のCRUD操作にRESTful APIを提供する
 * - 19.9: APIレスポンスに適切なHTTPステータスコードを返却する
 *
 * Design Reference: design.md - OrderService API Contract セクション
 *
 * Task 3.3: 発注のルーター実装
 *
 * @module routes/order
 */

import { Router, type Request, type Response, type NextFunction } from 'express';
import { OrderService } from '../services/order.service.js';
import { ExecutionBudgetService } from '../services/execution-budget.service.js';
import getPrismaClient from '../db.js';
import { validate } from '../middleware/validate.middleware.js';
import { authenticate } from '../middleware/authenticate.middleware.js';
import { requirePermission } from '../middleware/authorize.middleware.js';
import logger from '../utils/logger.js';
import {
  createOrderSchema,
  updateOrderSchema,
  updateOrderItemsSchema,
  updateOrderStatusSchema,
  type CreateOrderInput,
  type UpdateOrderInput,
  type UpdateOrderItemsInput,
  type UpdateOrderStatusInput,
} from '../schemas/execution-budget.schema.js';
import {
  OrderNotFoundError,
  OrderEditBlockedError,
  OrderDeletionBlockedError,
  ExecutionBudgetNotFoundForOrderError,
  ConfirmedAmountRequiredError,
  InvalidOrderStatusTransitionError,
  NoCheckedItemsError,
} from '../errors/orderError.js';

// mergeParams: true を設定してネストされたルートからprojectIdを取得できるようにする
const router = Router({ mergeParams: true });
const prisma = getPrismaClient();
const orderService = new OrderService({ prisma });
const executionBudgetService = new ExecutionBudgetService({ prisma });

/**
 * プロジェクトIDから実行予算IDを取得するヘルパー
 *
 * @param projectId - プロジェクトID
 * @returns 実行予算ID（存在しない場合はnull）
 */
async function getExecutionBudgetId(projectId: string): Promise<string | null> {
  const budget = await executionBudgetService.findByProjectId(projectId);
  return budget ? budget.id : null;
}

// ==========================================
// 発注一覧取得 GET /api/projects/:projectId/execution-budget/orders
// Requirements: 17.3, 19.3, 19.9
// ==========================================
router.get(
  '/',
  authenticate,
  requirePermission('order:read'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const projectId = req.params.projectId;
      if (!projectId) {
        res.status(400).json({
          status: 400,
          detail: 'プロジェクトIDが必要です',
        });
        return;
      }

      const executionBudgetId = await getExecutionBudgetId(projectId);
      if (!executionBudgetId) {
        res.status(404).json({
          status: 404,
          detail: '実行予算が見つかりません',
        });
        return;
      }

      const orders = await orderService.findByExecutionBudgetId(executionBudgetId);

      logger.debug({ projectId, count: orders.length }, 'Order list retrieved');

      res.json(orders);
    } catch (error) {
      next(error);
    }
  }
);

// ==========================================
// 発注作成 POST /api/projects/:projectId/execution-budget/orders
// Requirements: 17.3, 19.3, 19.9
// ==========================================
router.post(
  '/',
  authenticate,
  requirePermission('order:write'),
  validate(createOrderSchema, 'body'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const projectId = req.params.projectId;
      if (!projectId) {
        res.status(400).json({
          status: 400,
          detail: 'プロジェクトIDが必要です',
        });
        return;
      }

      const executionBudgetId = await getExecutionBudgetId(projectId);
      if (!executionBudgetId) {
        res.status(404).json({
          status: 404,
          detail: '実行予算が見つかりません',
        });
        return;
      }

      const { tradingPartnerId } = req.validatedBody as CreateOrderInput;

      const order = await orderService.create(executionBudgetId, tradingPartnerId);

      logger.info({ projectId, orderId: order.id, userId: req.user?.userId }, 'Order created');

      res.status(201).json(order);
    } catch (error) {
      if (error instanceof ExecutionBudgetNotFoundForOrderError) {
        res.status(404).json({
          status: 404,
          detail: error.message,
          code: error.code,
        });
        return;
      }
      next(error);
    }
  }
);

// ==========================================
// 発注詳細取得 GET /api/projects/:projectId/execution-budget/orders/:orderId
// Requirements: 17.3, 19.3, 19.9
// ==========================================
router.get(
  '/:orderId',
  authenticate,
  requirePermission('order:read'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const orderId = req.params.orderId as string;

      const order = await orderService.getWithItems(orderId);

      if (!order) {
        res.status(404).json({
          status: 404,
          detail: '発注が見つかりません',
        });
        return;
      }

      logger.debug({ orderId }, 'Order detail retrieved');

      res.json(order);
    } catch (error) {
      next(error);
    }
  }
);

// ==========================================
// 発注編集 PATCH /api/projects/:projectId/execution-budget/orders/:orderId
// Requirements: 17.3, 19.3, 19.9
// ==========================================
router.patch(
  '/:orderId',
  authenticate,
  requirePermission('order:write'),
  validate(updateOrderSchema, 'body'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const orderId = req.params.orderId as string;
      const data = req.validatedBody as UpdateOrderInput;

      const result = await orderService.update(orderId, data);

      logger.info({ orderId, userId: req.user?.userId }, 'Order updated');

      res.json(result);
    } catch (error) {
      if (error instanceof OrderNotFoundError) {
        res.status(404).json({
          status: 404,
          detail: error.message,
          code: error.code,
        });
        return;
      }
      if (error instanceof OrderEditBlockedError) {
        res.status(422).json({
          status: 422,
          detail: error.message,
          code: error.code,
        });
        return;
      }
      next(error);
    }
  }
);

// ==========================================
// 発注項目更新 PUT /api/projects/:projectId/execution-budget/orders/:orderId/items
// Requirements: 17.3, 19.3, 19.9
// ==========================================
router.put(
  '/:orderId/items',
  authenticate,
  requirePermission('order:write'),
  validate(updateOrderItemsSchema, 'body'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const orderId = req.params.orderId as string;
      const { itemIds } = req.validatedBody as UpdateOrderItemsInput;

      const result = await orderService.updateItems(orderId, itemIds);

      logger.info({ orderId, userId: req.user?.userId }, 'Order items updated');

      res.json(result);
    } catch (error) {
      if (error instanceof OrderNotFoundError) {
        res.status(404).json({
          status: 404,
          detail: error.message,
          code: error.code,
        });
        return;
      }
      if (error instanceof OrderEditBlockedError) {
        res.status(422).json({
          status: 422,
          detail: error.message,
          code: error.code,
        });
        return;
      }
      next(error);
    }
  }
);

// ==========================================
// 発注ステータス変更 PATCH /api/projects/:projectId/execution-budget/orders/:orderId/status
// Requirements: 17.3, 19.3, 19.9
// ==========================================
router.patch(
  '/:orderId/status',
  authenticate,
  requirePermission('order:write'),
  validate(updateOrderStatusSchema, 'body'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const orderId = req.params.orderId as string;
      const { status, confirmedAmount } = req.validatedBody as UpdateOrderStatusInput;

      let result;
      // CANCELLED変更時は取消処理を実行
      if (status === 'CANCELLED') {
        result = await orderService.cancelOrder(orderId);
      } else {
        result = await orderService.updateStatus(orderId, status, confirmedAmount);
      }

      logger.info({ orderId, newStatus: status, userId: req.user?.userId }, 'Order status updated');

      res.json(result);
    } catch (error) {
      if (error instanceof OrderNotFoundError) {
        res.status(404).json({
          status: 404,
          detail: error.message,
          code: error.code,
        });
        return;
      }
      if (
        error instanceof ConfirmedAmountRequiredError ||
        error instanceof InvalidOrderStatusTransitionError ||
        error instanceof NoCheckedItemsError
      ) {
        res.status(422).json({
          status: 422,
          detail: error.message,
          code: error.code,
        });
        return;
      }
      next(error);
    }
  }
);

// ==========================================
// 発注削除 DELETE /api/projects/:projectId/execution-budget/orders/:orderId
// Requirements: 17.3, 19.3, 19.9
// ==========================================
router.delete(
  '/:orderId',
  authenticate,
  requirePermission('order:write'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const orderId = req.params.orderId as string;

      await orderService.delete(orderId);

      logger.info({ orderId, userId: req.user?.userId }, 'Order deleted');

      res.status(204).end();
    } catch (error) {
      if (error instanceof OrderNotFoundError) {
        res.status(404).json({
          status: 404,
          detail: error.message,
          code: error.code,
        });
        return;
      }
      if (error instanceof OrderDeletionBlockedError) {
        res.status(422).json({
          status: 422,
          detail: error.message,
          code: error.code,
        });
        return;
      }
      next(error);
    }
  }
);

export default router;
