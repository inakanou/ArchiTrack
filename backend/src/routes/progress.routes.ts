/**
 * @fileoverview 出来高APIルート
 *
 * 出来高のCRUD操作エンドポイントを提供します。
 * 実行予算のサブルートとして /api/projects/:projectId/execution-budget/progress/ にマウントされます。
 *
 * Requirements:
 * - 17.4: 出来高の入力・編集・削除をEDITOR以上のロールに許可する
 * - 19.4: 出来高データのCRUD操作にRESTful APIを提供する
 * - 19.9: APIレスポンスに適切なHTTPステータスコードを返却する
 *
 * Design Reference: design.md - ProgressService API Contract セクション
 *
 * Task 4.3: 出来高のルーター実装
 *
 * @module routes/progress
 */

import { Router, type Request, type Response, type NextFunction } from 'express';
import { ProgressService } from '../services/progress.service.js';
import { ExecutionBudgetService } from '../services/execution-budget.service.js';
import getPrismaClient from '../db.js';
import { validate } from '../middleware/validate.middleware.js';
import { authenticate } from '../middleware/authenticate.middleware.js';
import { requirePermission } from '../middleware/authorize.middleware.js';
import logger from '../utils/logger.js';
import { saveProgressSchema, type SaveProgressInput } from '../schemas/execution-budget.schema.js';
import {
  ProgressRecordNotFoundError,
  ExecutionBudgetNotFoundForProgressError,
  ProgressAmountNegativeError,
} from '../errors/progressError.js';

// mergeParams: true を設定してネストされたルートからprojectIdを取得できるようにする
const router = Router({ mergeParams: true });
const prisma = getPrismaClient();
const progressService = new ProgressService({ prisma });
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
// 月別出来高集計 GET /api/projects/:projectId/execution-budget/progress/monthly
// Requirements: 17.4, 19.4, 19.9
// 注意: パラメータ付きルート /:date より先に定義する必要がある
// ==========================================
router.get(
  '/monthly',
  authenticate,
  requirePermission('progress:read'),
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

      const result = await progressService.getMonthlyAggregation(executionBudgetId);

      logger.debug({ projectId, count: result.length }, 'Monthly progress aggregation retrieved');

      res.json(result);
    } catch (error) {
      if (error instanceof ExecutionBudgetNotFoundForProgressError) {
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
// 月別出来高明細 GET /api/projects/:projectId/execution-budget/progress/monthly/:yearMonth
// Requirements: 17.4, 19.4, 19.9
// ==========================================
router.get(
  '/monthly/:yearMonth',
  authenticate,
  requirePermission('progress:read'),
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

      const yearMonth = req.params.yearMonth as string;
      const result = await progressService.getMonthlyDetail(executionBudgetId, yearMonth);

      logger.debug(
        { projectId, yearMonth, count: result.length },
        'Monthly progress detail retrieved'
      );

      res.json(result);
    } catch (error) {
      if (error instanceof ExecutionBudgetNotFoundForProgressError) {
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
// 出来高保存 POST /api/projects/:projectId/execution-budget/progress
// Requirements: 17.4, 19.4, 19.9
// ==========================================
router.post(
  '/',
  authenticate,
  requirePermission('progress:write'),
  validate(saveProgressSchema, 'body'),
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

      const input = req.validatedBody as SaveProgressInput;
      const result = await progressService.save(executionBudgetId, input);

      logger.info(
        { projectId, recordId: result.id, userId: req.user?.userId },
        'Progress record saved'
      );

      res.status(201).json(result);
    } catch (error) {
      if (error instanceof ExecutionBudgetNotFoundForProgressError) {
        res.status(404).json({
          status: 404,
          detail: error.message,
          code: error.code,
        });
        return;
      }
      if (error instanceof ProgressAmountNegativeError) {
        res.status(400).json({
          status: 400,
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
// 出来高履歴一覧 GET /api/projects/:projectId/execution-budget/progress
// Requirements: 17.4, 19.4, 19.9
// ==========================================
router.get(
  '/',
  authenticate,
  requirePermission('progress:read'),
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

      const records = await progressService.findByExecutionBudgetId(executionBudgetId);

      logger.debug({ projectId, count: records.length }, 'Progress record list retrieved');

      res.json(records);
    } catch (error) {
      next(error);
    }
  }
);

// ==========================================
// 施工日指定出来高取得 GET /api/projects/:projectId/execution-budget/progress/:date
// Requirements: 17.4, 19.4, 19.9
// ==========================================
router.get(
  '/:date',
  authenticate,
  requirePermission('progress:read'),
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

      const dateStr = req.params.date as string;
      const constructionDate = new Date(dateStr);

      const result = await progressService.getByDate(executionBudgetId, constructionDate);

      logger.debug({ projectId, date: dateStr }, 'Progress record by date retrieved');

      res.json(result);
    } catch (error) {
      if (error instanceof ProgressRecordNotFoundError) {
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
// 出来高削除 DELETE /api/projects/:projectId/execution-budget/progress/:progressRecordId
// Requirements: 17.4, 19.4, 19.9
// ==========================================
router.delete(
  '/:progressRecordId',
  authenticate,
  requirePermission('progress:write'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const progressRecordId = req.params.progressRecordId as string;

      await progressService.delete(progressRecordId);

      logger.info({ progressRecordId, userId: req.user?.userId }, 'Progress record deleted');

      res.status(204).end();
    } catch (error) {
      if (error instanceof ProgressRecordNotFoundError) {
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
