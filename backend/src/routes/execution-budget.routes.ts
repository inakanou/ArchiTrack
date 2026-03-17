/**
 * @fileoverview 実行予算APIルート
 *
 * 実行予算のCRUD操作エンドポイントを提供します。
 *
 * Requirements:
 * - 17.1: 実行予算の閲覧をVIEWER以上のロールに許可する
 * - 17.2: 実行予算の作成・編集・削除をEDITOR以上のロールに許可する
 * - 19.2: 実行予算のCRUD操作にRESTful APIを提供する
 * - 19.9: APIレスポンスに適切なHTTPステータスコードを返却する
 *
 * Design Reference: design.md - ExecutionBudget API Contract セクション
 *
 * Task 2.3: 実行予算のルーター実装
 *
 * @module routes/execution-budget
 */

import { Router, type Request, type Response, type NextFunction } from 'express';
import { ExecutionBudgetService } from '../services/execution-budget.service.js';
import getPrismaClient from '../db.js';
import { validate } from '../middleware/validate.middleware.js';
import { authenticate } from '../middleware/authenticate.middleware.js';
import { requirePermission } from '../middleware/authorize.middleware.js';
import logger from '../utils/logger.js';
import {
  createExecutionBudgetSchema,
  updateExecutionBudgetItemSchema,
  type CreateExecutionBudgetInput,
  type UpdateExecutionBudgetItemInput,
} from '../schemas/execution-budget.schema.js';
import {
  ExecutionBudgetAlreadyExistsError,
  ContractNotFoundForBudgetError,
  ExecutionBudgetNotFoundError,
  ExecutionBudgetConflictError,
  ExecutionBudgetDeletionBlockedError,
} from '../errors/executionBudgetError.js';

// mergeParams: true を設定してネストされたルートからprojectIdを取得できるようにする
const router = Router({ mergeParams: true });
const prisma = getPrismaClient();
const executionBudgetService = new ExecutionBudgetService({ prisma });

// ==========================================
// 実行予算作成 POST /api/projects/:projectId/execution-budget
// Requirements: 17.2, 19.2, 19.9
// ==========================================
router.post(
  '/',
  authenticate,
  requirePermission('execution_budget:write'),
  validate(createExecutionBudgetSchema, 'body'),
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

      const { contractId } = req.validatedBody as CreateExecutionBudgetInput;

      const budget = await executionBudgetService.create(projectId, contractId);

      logger.info(
        { projectId, budgetId: budget.id, userId: req.user?.userId },
        'Execution budget created'
      );

      res.status(201).json(budget);
    } catch (error) {
      if (error instanceof ExecutionBudgetAlreadyExistsError) {
        res.status(409).json({
          status: 409,
          detail: error.message,
          code: error.code,
        });
        return;
      }
      if (error instanceof ContractNotFoundForBudgetError) {
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
// 実行予算取得 GET /api/projects/:projectId/execution-budget
// Requirements: 17.1, 19.2, 19.9
// ==========================================
router.get(
  '/',
  authenticate,
  requirePermission('execution_budget:read'),
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

      const budget = await executionBudgetService.getWithItems(projectId);

      if (!budget) {
        res.status(404).json({
          status: 404,
          detail: '実行予算が見つかりません',
        });
        return;
      }

      logger.debug({ projectId, budgetId: budget.id }, 'Execution budget retrieved');

      res.json(budget);
    } catch (error) {
      next(error);
    }
  }
);

// ==========================================
// 実行予算削除 DELETE /api/projects/:projectId/execution-budget
// Requirements: 17.2, 19.2, 19.9
// ==========================================
router.delete(
  '/',
  authenticate,
  requirePermission('execution_budget:write'),
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

      await executionBudgetService.delete(projectId);

      logger.info({ projectId, userId: req.user?.userId }, 'Execution budget deleted');

      res.status(204).end();
    } catch (error) {
      if (error instanceof ExecutionBudgetNotFoundError) {
        res.status(404).json({
          status: 404,
          detail: error.message,
          code: error.code,
        });
        return;
      }
      if (error instanceof ExecutionBudgetDeletionBlockedError) {
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
// 実行予算項目編集 PATCH /api/projects/:projectId/execution-budget/items/:itemId
// Requirements: 17.2, 19.2, 19.9
// ==========================================
router.patch(
  '/items/:itemId',
  authenticate,
  requirePermission('execution_budget:write'),
  validate(updateExecutionBudgetItemSchema, 'body'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const itemId = req.params.itemId as string;
      const data = req.validatedBody as UpdateExecutionBudgetItemInput;

      const result = await executionBudgetService.updateItem(itemId, data);

      logger.info({ itemId, userId: req.user?.userId }, 'Execution budget item updated');

      res.json(result);
    } catch (error) {
      if (error instanceof ExecutionBudgetNotFoundError) {
        res.status(404).json({
          status: 404,
          detail: error.message,
          code: error.code,
        });
        return;
      }
      if (error instanceof ExecutionBudgetConflictError) {
        res.status(409).json({
          status: 409,
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
