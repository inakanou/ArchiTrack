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
 * 案件の閲覧範囲（Requirement 20、user-authentication の要件39。タスク17.1）:
 * 両経路で requirePermission の後に ID の形式の検査と execution-budget-project-scope.middleware の
 * 判定部品を置き、範囲外は不在と同じ汎用の 404 にする。発注一覧の出力の発注が経路の案件に属さなければ
 * 不在と同じ 404 にする
 *
 * 出力の記録（Requirement 20.7・20.8、user-authentication の要件40.9。タスク17.2）:
 * 範囲の判定と発注の所属の照合を通った後、ファイル（Excel・PDF）を生成する前に
 * ExportAuditService.record を一つの要求につき 1 回呼ぶ（種別 order_export・progress_export）。
 * 記録の失敗ではファイルを生成せず、500（`code: 'EXPORT_RECORD_FAILED'`、`detail` は
 * 「出力を記録できなかったため中止しました」）を返す。記録の判定が案件を範囲外・不在とした
 * ときも生成せず、不在と同じ汎用の 404 にする
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
import { AuditLogService } from '../services/audit-log.service.js';
import { ExportAuditService, type ExportRecordInput } from '../services/export-audit.service.js';
import { getSharedProjectScopeService } from '../services/project-scope.service.js';
import getPrismaClient from '../db.js';
import { getClientIp } from '../middleware/client-ip.js';
import { InternalServerError, NotFoundError, type ApiError } from '../errors/apiError.js';
import { validate } from '../middleware/validate.middleware.js';
import { authenticate } from '../middleware/authenticate.middleware.js';
import { requirePermission } from '../middleware/authorize.middleware.js';
import {
  requireExecutionBudgetProjectScope,
  requireOrderInProject,
} from '../middleware/execution-budget-project-scope.middleware.js';
import logger from '../utils/logger.js';
import {
  executionBudgetProjectParamsSchema,
  orderParamsSchema,
  exportQuerySchema,
  type ExportQuery,
} from '../schemas/execution-budget.schema.js';

// mergeParams: true を設定してネストされたルートからprojectIdを取得できるようにする
const router = Router({ mergeParams: true });
const prisma = getPrismaClient();
const orderExportService = new OrderExportService({ prisma });
const progressService = new ProgressService({ prisma });
const progressExportService = new ProgressExportService({ progressService });
const executionBudgetService = new ExecutionBudgetService({ prisma });
const exportAuditService = new ExportAuditService({
  auditLogService: new AuditLogService({ prisma }),
  // 共有のインスタンスは要求のたびに取り直す（PrismaClient・RBACService の作り直しに追従する）
  scopeService: {
    evaluateProjectAccess: (userId, projectId) =>
      getSharedProjectScopeService().evaluateProjectAccess(userId, projectId),
  },
});

/**
 * ファイルを生成する前に出力を記録する（Requirement 20.7・20.8）
 *
 * @returns 記録できたときは null。記録できなかったときは応答にする誤り
 *   （範囲外・不在の案件は不在と同じ汎用の 404、記録の失敗は 500 の EXPORT_RECORD_FAILED）
 */
async function recordExportBeforeGeneration(
  req: Request,
  input: ExportRecordInput
): Promise<ApiError | null> {
  const result = await exportAuditService.record(req.user!.userId, input, {
    ipAddress: getClientIp(req),
    userAgent: req.get('user-agent'),
  });
  if (result.ok) {
    return null;
  }
  return result.error.type === 'PROJECT_OUT_OF_SCOPE'
    ? new NotFoundError()
    : new InternalServerError('出力を記録できなかったため中止しました', 'EXPORT_RECORD_FAILED');
}

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
  validate(orderParamsSchema, 'params'),
  requireExecutionBudgetProjectScope(),
  requireOrderInProject('orderId'),
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

      // 生成の前に記録する。対象は発注、件数は出力するチェック済み項目の数（20.7）
      const recordError = await recordExportBeforeGeneration(req, {
        kind: 'order_export',
        projectId: req.params.projectId as string,
        targetIds: [orderId],
        itemCount: exportData.items.length,
      });
      if (recordError) {
        next(recordError);
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
  validate(executionBudgetProjectParamsSchema, 'params'),
  requireExecutionBudgetProjectScope(),
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

      // 生成の前に記録する。対象は実行予算、件数は出力する月の数（20.7）
      const recordError = await recordExportBeforeGeneration(req, {
        kind: 'progress_export',
        projectId,
        targetIds: [executionBudgetId],
        itemCount: exportData.monthlySummaries.length,
      });
      if (recordError) {
        next(recordError);
        return;
      }

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
