/**
 * @fileoverview エクスポートAPIルート
 *
 * 発注一覧エクスポートと月別出来高エクスポートのエンドポイントを提供します。
 * 実行予算のサブルートとして /api/projects/:projectId/execution-budget/ にマウントされます。
 *
 * Requirements:
 * - 19.9: APIレスポンスに適切なHTTPステータスコードを返却する
 *
 * Design Reference: design.md - ExportService API Contract セクション
 *
 * Task 6.3: エクスポートのルーター実装
 *
 * @module routes/export
 */

import { Router, type Request, type Response, type NextFunction } from 'express';
import { OrderExportService } from '../services/order-export.service.js';
import { ProgressExportService } from '../services/progress-export.service.js';
import { ProgressService } from '../services/progress.service.js';
import { ExecutionBudgetService } from '../services/execution-budget.service.js';
import getPrismaClient from '../db.js';
import { validate } from '../middleware/validate.middleware.js';
import { authenticate } from '../middleware/authenticate.middleware.js';
import { requirePermission } from '../middleware/authorize.middleware.js';
import logger from '../utils/logger.js';
import { exportQuerySchema, type ExportQuery } from '../schemas/execution-budget.schema.js';

// mergeParams: true を設定してネストされたルートからprojectIdを取得できるようにする
const router = Router({ mergeParams: true });
const prisma = getPrismaClient();
const orderExportService = new OrderExportService({ prisma });
const progressService = new ProgressService({ prisma });
const progressExportService = new ProgressExportService({ progressService });
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

/**
 * プロジェクトIDからプロジェクト名を取得するヘルパー
 *
 * @param projectId - プロジェクトID
 * @returns プロジェクト名
 */
async function getProjectName(projectId: string): Promise<string> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { name: true },
  });
  return project?.name ?? 'プロジェクト';
}

// ==========================================
// 発注エクスポート GET /api/projects/:projectId/execution-budget/orders/:orderId/export
// Requirements: 19.9
// ==========================================
router.get(
  '/orders/:orderId/export',
  authenticate,
  requirePermission('order:read'),
  validate(exportQuerySchema, 'query'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const orderId = req.params.orderId as string;
      const { format } = req.validatedQuery as ExportQuery;

      // エクスポートデータの取得
      const exportData = await orderExportService.getExportData(orderId);
      if (!exportData) {
        res.status(404).json({
          status: 404,
          detail: '発注が見つかりません',
        });
        return;
      }

      logger.info({ orderId, format, userId: req.user?.userId }, 'Order export requested');

      if (format === 'xlsx') {
        const buffer = await orderExportService.exportToExcel(exportData);
        const fileName = encodeURIComponent(`発注一覧_${exportData.tradingPartnerName}.xlsx`);

        res.setHeader(
          'Content-Type',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        );
        res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${fileName}`);
        res.send(buffer);
      } else if (format === 'pdf') {
        const buffer = await orderExportService.exportToPdf(exportData);
        const fileName = encodeURIComponent(`発注一覧_${exportData.tradingPartnerName}.pdf`);

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${fileName}`);
        res.send(buffer);
      }
    } catch (error) {
      next(error);
    }
  }
);

// ==========================================
// 月別出来高エクスポート GET /api/projects/:projectId/execution-budget/progress/monthly/export
// Requirements: 19.9
// ==========================================
router.get(
  '/progress/monthly/export',
  authenticate,
  requirePermission('progress:read'),
  validate(exportQuerySchema, 'query'),
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

      const { format } = req.validatedQuery as ExportQuery;

      // プロジェクト名を取得
      const projectName = await getProjectName(projectId);

      // エクスポートデータの取得
      const exportData = await progressExportService.getExportData(executionBudgetId, projectName);

      logger.info(
        { projectId, format, userId: req.user?.userId },
        'Monthly progress export requested'
      );

      if (format === 'xlsx') {
        const buffer = await progressExportService.exportToExcel(exportData);
        const fileName = encodeURIComponent(`月別出来高_${projectName}.xlsx`);

        res.setHeader(
          'Content-Type',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        );
        res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${fileName}`);
        res.send(buffer);
      } else if (format === 'pdf') {
        const buffer = await progressExportService.exportToPdf(exportData);
        const fileName = encodeURIComponent(`月別出来高_${projectName}.pdf`);

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${fileName}`);
        res.send(buffer);
      }
    } catch (error) {
      next(error);
    }
  }
);

export default router;
