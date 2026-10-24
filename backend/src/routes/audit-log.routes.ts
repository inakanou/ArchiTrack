/**
 * @fileoverview 監査ログAPIルート
 *
 * Requirements:
 * - 22: 監査ログとコンプライアンス
 * - user-authentication 40.9: データ出力の記録の API（POST /exports）と、監査ログの JSON 出力の記録
 */

import { Router, type Request, type Response, type NextFunction } from 'express';
import { AuditLogService, serializeAuditLogExport } from '../services/audit-log.service.js';
import getPrismaClient from '../db.js';
import { authenticate } from '../middleware/authenticate.middleware.js';
import { requirePermission } from '../middleware/authorize.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { getClientIp } from '../middleware/client-ip.js';
import type { AuditLogFilter } from '../types/audit-log.types.js';
import type { RequestContext } from '../types/auth.types.js';
import { ExportAuditService, type ExportRecordInput } from '../services/export-audit.service.js';
import { getSharedProjectScopeService } from '../services/project-scope.service.js';
import { exportRecordSchema } from '../schemas/export-audit.schema.js';
import { InternalServerError, NotFoundError } from '../errors/apiError.js';
import logger from '../utils/logger.js';

const router = Router();
const prisma = getPrismaClient();
const auditLogService = new AuditLogService({ prisma });
const exportAuditService = new ExportAuditService({
  auditLogService,
  // 共有のインスタンスは要求のたびに取り直す（PrismaClient・RBACService の作り直しに追従する）
  scopeService: {
    evaluateProjectAccess: (userId, projectId) =>
      getSharedProjectScopeService().evaluateProjectAccess(userId, projectId),
  },
});

/** 監査の記録に使う要求の送信元 */
function requestContext(req: Request): RequestContext {
  return { ipAddress: getClientIp(req), userAgent: req.get('user-agent') };
}

/** 出力を記録できなかったときの応答（出力は返さない） */
function exportRecordFailedError(): InternalServerError {
  return new InternalServerError('出力を記録できなかったため中止しました', 'EXPORT_RECORD_FAILED');
}

/**
 * @swagger
 * /api/v1/audit-logs:
 *   get:
 *     summary: 監査ログ取得
 *     description: 監査ログを取得（フィルタリング対応）
 *     tags:
 *       - Audit Logs
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: actorId
 *         schema:
 *           type: string
 *         description: 実行者ユーザーID
 *       - in: query
 *         name: targetId
 *         schema:
 *           type: string
 *         description: 対象リソースID
 *       - in: query
 *         name: action
 *         schema:
 *           type: string
 *         description: アクション種別
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: 開始日時（ISO 8601形式）
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: 終了日時（ISO 8601形式）
 *       - in: query
 *         name: skip
 *         schema:
 *           type: integer
 *         description: スキップ数
 *       - in: query
 *         name: take
 *         schema:
 *           type: integer
 *         description: 取得件数
 *     responses:
 *       200:
 *         description: 監査ログ一覧
 *       401:
 *         description: 認証エラー
 *       403:
 *         description: 権限不足
 */
router.get(
  '/',
  authenticate,
  requirePermission('audit:read'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const filter: AuditLogFilter = {};

      // クエリパラメータからフィルタを構築
      if (req.query.actorId) {
        filter.actorId = req.query.actorId as string;
      }
      if (req.query.targetId) {
        filter.targetId = req.query.targetId as string;
      }
      if (req.query.action) {
        filter.action = req.query.action as AuditLogFilter['action'];
      }
      if (req.query.startDate) {
        filter.startDate = req.query.startDate as string;
      }
      if (req.query.endDate) {
        filter.endDate = req.query.endDate as string;
      }
      if (req.query.skip) {
        filter.skip = parseInt(req.query.skip as string, 10);
      }
      if (req.query.take) {
        filter.take = parseInt(req.query.take as string, 10);
      }

      const logs = await auditLogService.getLogs(filter);

      logger.info(
        {
          userId: req.user?.userId,
          filterCount: Object.keys(filter).length,
          resultCount: logs.length,
        },
        'Audit logs retrieved'
      );

      res.json(logs);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/v1/audit-logs/export:
 *   get:
 *     summary: 監査ログエクスポート
 *     description: 監査ログをJSON形式でエクスポート
 *     tags:
 *       - Audit Logs
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: actorId
 *         schema:
 *           type: string
 *         description: 実行者ユーザーID
 *       - in: query
 *         name: targetId
 *         schema:
 *           type: string
 *         description: 対象リソースID
 *       - in: query
 *         name: action
 *         schema:
 *           type: string
 *         description: アクション種別
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: 開始日時（ISO 8601形式）
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: 終了日時（ISO 8601形式）
 *     responses:
 *       200:
 *         description: JSON形式の監査ログ
 *         content:
 *           application/json:
 *             schema:
 *               type: string
 *       401:
 *         description: 認証エラー
 *       403:
 *         description: 権限不足
 *       500:
 *         description: 出力の記録の失敗（出力は返さない）
 */
router.get(
  '/export',
  authenticate,
  requirePermission('audit:read'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const filter: AuditLogFilter = {};

      // クエリパラメータからフィルタを構築
      if (req.query.actorId) {
        filter.actorId = req.query.actorId as string;
      }
      if (req.query.targetId) {
        filter.targetId = req.query.targetId as string;
      }
      if (req.query.action) {
        filter.action = req.query.action as AuditLogFilter['action'];
      }
      if (req.query.startDate) {
        filter.startDate = req.query.startDate as string;
      }
      if (req.query.endDate) {
        filter.endDate = req.query.endDate as string;
      }

      const logs = await auditLogService.getLogs(filter);

      // 出力を返す前に記録する。記録できなければ出力を返さない（要件40.9）
      const recorded = await exportAuditService.record(
        req.user!.userId,
        {
          kind: 'audit_log_json',
          projectId: null,
          targetIds: logs.map((log) => log.id),
          itemCount: logs.length,
        },
        requestContext(req)
      );
      if (!recorded.ok) {
        next(exportRecordFailedError());
        return;
      }

      const jsonExport = serializeAuditLogExport(logs);

      // ファイル名にタイムスタンプを含める
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `audit-logs-${timestamp}.json`;

      logger.info(
        { userId: req.user?.userId, filterCount: Object.keys(filter).length, filename },
        'Audit logs exported'
      );

      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(jsonExport);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/v1/audit-logs/exports:
 *   post:
 *     summary: データ出力の記録
 *     description: |
 *       データの出力・一括ダウンロードを監査ログ（DATA_EXPORTED）に記録する。認証済みの全利用者が呼べる。
 *       ブラウザで生成する出力は、生成を始める前にこの記録を要求し、失敗したときは出力を中止する。
 *       案件を指定したときは閲覧範囲で判定し、範囲外の案件は存在しない案件と同じ 404 を返す。
 *     tags:
 *       - Audit Logs
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             additionalProperties: false
 *             required: [kind, projectId, targetIds, itemCount]
 *             properties:
 *               kind:
 *                 type: string
 *                 enum:
 *                   - site_survey_report_pdf
 *                   - site_survey_images_zip
 *                   - quantity_table_pdf
 *                   - itemized_statement_xlsx
 *                   - estimate_request_xlsx
 *                   - estimate_pdf
 *                   - estimate_xlsx
 *                   - schedule_export
 *                   - order_export
 *                   - progress_export
 *                   - construction_photo_ledger_pdf
 *                   - construction_photos_zip
 *                   - annotated_image
 *                   - audit_log_json
 *                 description: 出力の種別
 *               projectId:
 *                 type: string
 *                 format: uuid
 *                 nullable: true
 *                 description: 対象の案件（案件に属する出力は必須、audit_log_json は null）
 *               targetIds:
 *                 type: array
 *                 maxItems: 10000
 *                 items:
 *                   type: string
 *                   minLength: 1
 *                   maxLength: 256
 *                 description: 出力の対象のデータの ID
 *               itemCount:
 *                 type: integer
 *                 minimum: 0
 *                 description: 出力した件数
 *     responses:
 *       201:
 *         description: 記録した監査ログの ID
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 recordId:
 *                   type: string
 *       400:
 *         description: 入力の検証エラー
 *       401:
 *         description: 認証エラー
 *       404:
 *         description: 案件が存在しない、または閲覧範囲外
 *       500:
 *         description: 記録の失敗
 */
router.post(
  '/exports',
  authenticate,
  validate(exportRecordSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const input = req.validatedBody as ExportRecordInput;
      const result = await exportAuditService.record(req.user!.userId, input, requestContext(req));
      if (!result.ok) {
        next(
          result.error.type === 'PROJECT_OUT_OF_SCOPE'
            ? new NotFoundError()
            : exportRecordFailedError()
        );
        return;
      }
      res.status(201).json({ recordId: result.value.recordId });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
