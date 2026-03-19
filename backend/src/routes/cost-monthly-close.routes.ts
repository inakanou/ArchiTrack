/**
 * @fileoverview 原価・月次締めAPIルート
 *
 * 原価（支出実績）の入力と月次締め処理のエンドポイントを提供します。
 * 実行予算のサブルートとして /api/projects/:projectId/execution-budget/ にマウントされます。
 *
 * Requirements:
 * - 17.5: 原価（支出実績）の入力・月次締めをEDITOR以上のロールに許可する
 * - 19.5: 原価（支出実績）データのCRUD操作にRESTful APIを提供する
 * - 19.6: 月次締めデータのCRUD操作にRESTful APIを提供する
 * - 19.9: APIレスポンスに適切なHTTPステータスコードを返却する
 *
 * Design Reference: design.md - CostService / MonthlyCloseService API Contract セクション
 *
 * Task 5.3: 原価・月次締めのルーター実装
 *
 * @module routes/cost-monthly-close
 */

import { Router, type Request, type Response, type NextFunction } from 'express';
import { CostService } from '../services/cost.service.js';
import { MonthlyCloseService } from '../services/monthly-close.service.js';
import { ExecutionBudgetService } from '../services/execution-budget.service.js';
import getPrismaClient from '../db.js';
import { validate } from '../middleware/validate.middleware.js';
import { authenticate } from '../middleware/authenticate.middleware.js';
import { requirePermission } from '../middleware/authorize.middleware.js';
import logger from '../utils/logger.js';
import {
  updateCostSchema,
  monthlyCloseSchema,
  type UpdateCostInput,
  type MonthlyCloseInput,
} from '../schemas/execution-budget.schema.js';
import {
  ExecutionBudgetNotFoundError,
  ExecutionBudgetConflictError,
  MonthlyCloseAlreadyExistsError,
} from '../errors/executionBudgetError.js';

// mergeParams: true を設定してネストされたルートからprojectIdを取得できるようにする
const router = Router({ mergeParams: true });
const prisma = getPrismaClient();
const costService = new CostService({ prisma });
const monthlyCloseService = new MonthlyCloseService({ prisma });
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
// 原価入力 PATCH /api/projects/:projectId/execution-budget/items/:itemId/cost
// Requirements: 17.5, 19.5, 19.9
// ==========================================
router.patch(
  '/items/:itemId/cost',
  authenticate,
  requirePermission('cost:write'),
  validate(updateCostSchema, 'body'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const itemId = req.params.itemId as string;
      const data = req.validatedBody as UpdateCostInput;

      const result = await costService.updateCost(itemId, data);

      logger.info({ itemId, userId: req.user?.userId }, 'Cost updated');

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

// ==========================================
// 月次締め POST /api/projects/:projectId/execution-budget/monthly-close
// Requirements: 17.5, 19.6, 19.9
// ==========================================
router.post(
  '/monthly-close',
  authenticate,
  requirePermission('monthly_close:write'),
  validate(monthlyCloseSchema, 'body'),
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

      const { targetMonth } = req.validatedBody as MonthlyCloseInput;
      const closedById = req.user?.userId as string;

      const result = await monthlyCloseService.close(executionBudgetId, targetMonth, closedById);

      logger.info(
        { projectId, targetMonth, historyId: result.id, userId: closedById },
        'Monthly close executed'
      );

      res.status(201).json(result);
    } catch (error) {
      if (error instanceof ExecutionBudgetNotFoundError) {
        res.status(404).json({
          status: 404,
          detail: error.message,
          code: error.code,
        });
        return;
      }
      if (error instanceof MonthlyCloseAlreadyExistsError) {
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

// ==========================================
// 月次締め履歴一覧 GET /api/projects/:projectId/execution-budget/monthly-close
// Requirements: 17.5, 19.6, 19.9
// ==========================================
router.get(
  '/monthly-close',
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

      const executionBudgetId = await getExecutionBudgetId(projectId);
      if (!executionBudgetId) {
        res.status(404).json({
          status: 404,
          detail: '実行予算が見つかりません',
        });
        return;
      }

      const histories = await monthlyCloseService.getHistory(executionBudgetId);

      logger.debug({ projectId, count: histories.length }, 'Monthly close history list retrieved');

      res.json(histories);
    } catch (error) {
      if (error instanceof ExecutionBudgetNotFoundError) {
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

export default router;
