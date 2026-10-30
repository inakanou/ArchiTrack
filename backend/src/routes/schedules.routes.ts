/**
 * @fileoverview 工程表APIルート
 *
 * 工程表のCRUD操作、バルク保存、エクスポートのエンドポイントを提供します。
 *
 * Requirements:
 * - 1.1: 工程表一覧表示
 * - 1.2: 工程表新規作成
 * - 1.3: 工程表保存
 * - 1.4: 工程表詳細表示
 * - 1.5: 工程表削除
 * - 1.6: 保存失敗時エラー表示
 * - 2.1: 数量表選択肢表示
 * - 2.2: 数量表なしで空の工程表作成
 * - 2.3: 数量表指定時の項目自動取得
 *
 * Design Reference: design.md - ScheduleRoutes セクション
 *
 * 案件の閲覧範囲（construction-schedule の Requirement 13.1〜13.5、user-authentication の要件39。タスク22.1）:
 * 全経路で requirePermission と経路の ID の形式の検査の後に construction-schedule-project-scope.middleware の
 * 判定部品を置き、範囲外は不在と同じ汎用の 404 にする。`/:id` 配下は経路の projectId でなく工程表が属する案件で
 * 判定し、二重マウントで経路の projectId と工程表の案件が食い違えば不在と同じ 404 にする。
 * 工程表の作成の要求が指す数量表の所属の照合（13.4）は ScheduleService.create が行う。
 *
 * 出力の記録（construction-schedule の Requirement 13.6・13.7、user-authentication の要件40.9。タスク22.2）:
 * 出力の経路は範囲の判定と形式の検査と出力データの取得の後、ファイル（Excel・PDF）を生成する前に
 * ExportAuditService.record を一つの要求につき 1 回呼ぶ（種別 schedule_export）。記録の失敗ではファイルを生成せず、
 * 500（`code: 'EXPORT_RECORD_FAILED'`、`detail` は「出力を記録できなかったため中止しました」）を返す。
 * 記録の判定が案件を範囲外・不在としたときも生成せず、不在と同じ汎用の 404 にする
 *
 * @module routes/schedules
 */

import { Router, type Request, type Response, type NextFunction } from 'express';
import { ScheduleService } from '../services/schedule.service.js';
import { ScheduleExportService } from '../services/schedule-export.service.js';
import { AuditLogService } from '../services/audit-log.service.js';
import { ExportAuditService, type ExportRecordInput } from '../services/export-audit.service.js';
import { getSharedProjectScopeService } from '../services/project-scope.service.js';
import getPrismaClient from '../db.js';
import { getClientIp } from '../middleware/client-ip.js';
import { InternalServerError, NotFoundError, type ApiError } from '../errors/apiError.js';
import { validate } from '../middleware/validate.middleware.js';
import { authenticate } from '../middleware/authenticate.middleware.js';
import { requirePermission } from '../middleware/authorize.middleware.js';
import { projectScopeDenialContextOf } from '../middleware/project-scope.middleware.js';
import {
  findProjectIdOfSchedule,
  requireProjectParamScope,
  requireScheduleProjectScope,
} from '../middleware/construction-schedule-project-scope.middleware.js';
import logger from '../utils/logger.js';
import {
  createScheduleSchema,
  updateScheduleSchema,
  bulkSaveScheduleItemsSchema,
  exportQuerySchema,
  scheduleListQuerySchema,
  scheduleIdParamSchema,
  projectIdParamSchema,
  type CreateScheduleInput,
  type UpdateScheduleInput,
  type BulkSaveScheduleItemsInput,
  type ExportQuery,
  type ScheduleListQuery,
} from '../schemas/schedule.schema.js';
import {
  ScheduleNotFoundError,
  ScheduleConflictError,
  ScheduleValidationError,
} from '../errors/scheduleError.js';

// mergeParams: true を設定してネストされたルートからprojectIdを取得できるようにする
const router = Router({ mergeParams: true });
const prisma = getPrismaClient();
const scheduleService = new ScheduleService({ prisma });
const scheduleExportService = new ScheduleExportService({ prisma });
const exportAuditService = new ExportAuditService({
  auditLogService: new AuditLogService({ prisma }),
  // 共有のインスタンスは要求のたびに取り直す（PrismaClient・RBACService の作り直しに追従する）
  scopeService: {
    evaluateProjectAccess: (userId, projectId) =>
      getSharedProjectScopeService().evaluateProjectAccess(userId, projectId),
  },
});

/**
 * ファイルを生成する前に出力を記録する（Requirement 13.6・13.7）
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

// ==========================================
// 工程表一覧取得 GET /api/projects/:projectId/schedules
// ==========================================

/**
 * @swagger
 * /api/projects/{projectId}/schedules:
 *   get:
 *     summary: 工程表一覧取得
 *     description: プロジェクトに紐付く工程表の一覧を取得する
 *     tags:
 *       - Schedules
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           enum: [createdAt, updatedAt, name]
 *           default: createdAt
 *       - in: query
 *         name: sortOrder
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *           default: desc
 *     responses:
 *       200:
 *         description: 工程表一覧
 *       400:
 *         description: バリデーションエラー（projectId の形式不正など）
 *       401:
 *         description: 認証エラー
 *       403:
 *         description: 権限不足
 *       404:
 *         description: プロジェクトが見つからない（閲覧範囲外を含む）
 */
router.get(
  '/',
  authenticate,
  requirePermission('schedule:read'),
  validate(projectIdParamSchema, 'params'),
  requireProjectParamScope('projectId'),
  validate(scheduleListQuerySchema, 'query'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // 経路のプロジェクト ID は形式の検査（projectIdParamSchema）を通っている。`/api/schedules` のマウント
      // から届く要求は経路にプロジェクト ID が無く、その検査の 400 で終わる（タスク22.1）
      const { projectId } = req.validatedParams as { projectId: string };

      const query = req.validatedQuery as ScheduleListQuery;

      const result = await scheduleService.findByProject(projectId, query);

      logger.debug({ projectId, total: result.total }, 'Schedule list retrieved');

      res.json(result);
    } catch (error) {
      next(error);
    }
  }
);

// ==========================================
// 工程表詳細取得 GET /api/schedules/:id
// ==========================================

/**
 * @swagger
 * /api/schedules/{id}:
 *   get:
 *     summary: 工程表詳細取得
 *     description: 工程表の詳細情報を取得する
 *     tags:
 *       - Schedules
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: 工程表詳細
 *       400:
 *         description: 工程表IDの形式不正
 *       401:
 *         description: 認証エラー
 *       403:
 *         description: 権限不足
 *       404:
 *         description: 工程表が見つからない（閲覧範囲外・論理削除済みを含む）
 */
router.get(
  '/:id',
  authenticate,
  requirePermission('schedule:read'),
  validate(scheduleIdParamSchema, 'params'),
  requireScheduleProjectScope('id'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = req.params.id as string;

      const schedule = await scheduleService.findById(id);

      if (!schedule) {
        res.status(404).json({
          status: 404,
          detail: '工程表が見つかりません',
        });
        return;
      }

      logger.debug({ scheduleId: id }, 'Schedule detail retrieved');

      res.json(schedule);
    } catch (error) {
      next(error);
    }
  }
);

// ==========================================
// 工程表作成 POST /api/projects/:projectId/schedules
// ==========================================

/**
 * @swagger
 * /api/projects/{projectId}/schedules:
 *   post:
 *     summary: 工程表作成
 *     description: プロジェクトに紐付く工程表を作成する
 *     tags:
 *       - Schedules
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateScheduleInput'
 *     responses:
 *       201:
 *         description: 工程表作成成功
 *       400:
 *         description: バリデーションエラー（projectId の形式不正、数量表の項目数の上限超過を含む）
 *       401:
 *         description: 認証エラー
 *       403:
 *         description: 権限不足
 *       404:
 *         description: プロジェクトが見つからない（閲覧範囲外を含む）
 *       422:
 *         description: 数量表が見つからない（論理削除済み・経路のプロジェクトに属さない数量表を含む。本文は同一）
 */
router.post(
  '/',
  authenticate,
  requirePermission('schedule:create'),
  validate(projectIdParamSchema, 'params'),
  requireProjectParamScope('projectId'),
  validate(createScheduleSchema, 'body'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // 経路のプロジェクト ID は形式の検査（projectIdParamSchema）を通っている。`/api/schedules` のマウント
      // から届く要求は経路にプロジェクト ID が無く、その検査の 400 で終わる（タスク22.1）
      const { projectId } = req.validatedParams as { projectId: string };

      const data = req.validatedBody as CreateScheduleInput;

      const schedule = await scheduleService.create(
        projectId,
        data,
        req.user?.userId,
        projectScopeDenialContextOf(req)
      );

      logger.info(
        { projectId, scheduleId: schedule.id, userId: req.user?.userId },
        'Schedule created'
      );

      res.status(201).json(schedule);
    } catch (error) {
      if (error instanceof ScheduleValidationError) {
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
// 工程表更新 PUT /api/schedules/:id
// ==========================================

/**
 * @swagger
 * /api/schedules/{id}:
 *   put:
 *     summary: 工程表更新
 *     description: 工程表を更新する（楽観的排他制御）
 *     tags:
 *       - Schedules
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateScheduleInput'
 *     responses:
 *       200:
 *         description: 工程表更新成功
 *       400:
 *         description: バリデーションエラー（工程表IDの形式不正を含む）
 *       401:
 *         description: 認証エラー
 *       403:
 *         description: 権限不足
 *       404:
 *         description: 工程表が見つからない（閲覧範囲外・論理削除済みを含む）
 *       409:
 *         description: 楽観的排他制御エラー（競合）
 */
router.put(
  '/:id',
  authenticate,
  requirePermission('schedule:update'),
  validate(scheduleIdParamSchema, 'params'),
  requireScheduleProjectScope('id'),
  validate(updateScheduleSchema, 'body'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = req.params.id as string;
      const data = req.validatedBody as UpdateScheduleInput;

      const schedule = await scheduleService.update(id, data);

      logger.info({ scheduleId: id, userId: req.user?.userId }, 'Schedule updated');

      res.json(schedule);
    } catch (error) {
      if (error instanceof ScheduleNotFoundError) {
        res.status(404).json({
          status: 404,
          detail: error.message,
          code: error.code,
        });
        return;
      }
      if (error instanceof ScheduleConflictError) {
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
// バルク保存 PUT /api/schedules/:id/bulk-save
// ==========================================

/**
 * @swagger
 * /api/schedules/{id}/bulk-save:
 *   put:
 *     summary: 工程表項目バルク保存
 *     description: 工程表の全項目を一括保存する（楽観的排他制御）
 *     tags:
 *       - Schedules
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/BulkSaveScheduleItemsInput'
 *     responses:
 *       200:
 *         description: バルク保存成功
 *       400:
 *         description: バリデーションエラー（工程表IDの形式不正を含む）
 *       401:
 *         description: 認証エラー
 *       403:
 *         description: 権限不足
 *       404:
 *         description: 工程表が見つからない（閲覧範囲外・論理削除済みを含む）
 *       409:
 *         description: 楽観的排他制御エラー（競合）
 */
router.put(
  '/:id/bulk-save',
  authenticate,
  requirePermission('schedule:update'),
  validate(scheduleIdParamSchema, 'params'),
  requireScheduleProjectScope('id'),
  validate(bulkSaveScheduleItemsSchema, 'body'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = req.params.id as string;
      const data = req.validatedBody as BulkSaveScheduleItemsInput;

      const result = await scheduleService.bulkSaveItems(id, data);

      logger.info(
        { scheduleId: id, itemCount: result.updatedItemCount, userId: req.user?.userId },
        'Schedule items bulk saved'
      );

      res.json(result);
    } catch (error) {
      if (error instanceof ScheduleNotFoundError) {
        res.status(404).json({
          status: 404,
          detail: error.message,
          code: error.code,
        });
        return;
      }
      if (error instanceof ScheduleConflictError) {
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
// 工程表論理削除 DELETE /api/schedules/:id
// ==========================================

/**
 * @swagger
 * /api/schedules/{id}:
 *   delete:
 *     summary: 工程表論理削除
 *     description: 工程表を論理削除する
 *     tags:
 *       - Schedules
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       204:
 *         description: 削除成功
 *       400:
 *         description: 工程表IDの形式不正
 *       401:
 *         description: 認証エラー
 *       403:
 *         description: 権限不足
 *       404:
 *         description: 工程表が見つからない（閲覧範囲外・論理削除済みを含む）
 */
router.delete(
  '/:id',
  authenticate,
  requirePermission('schedule:delete'),
  validate(scheduleIdParamSchema, 'params'),
  requireScheduleProjectScope('id'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = req.params.id as string;

      await scheduleService.delete(id);

      logger.info({ scheduleId: id, userId: req.user?.userId }, 'Schedule soft-deleted');

      res.status(204).end();
    } catch (error) {
      if (error instanceof ScheduleNotFoundError) {
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
// エクスポート GET /api/schedules/:id/export
// ==========================================

/**
 * @swagger
 * /api/schedules/{id}/export:
 *   get:
 *     summary: 工程表エクスポート
 *     description: 工程表をExcelまたはPDF形式でエクスポートする
 *     tags:
 *       - Schedules
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: format
 *         required: true
 *         schema:
 *           type: string
 *           enum: [xlsx, pdf]
 *     responses:
 *       200:
 *         description: エクスポート成功
 *       400:
 *         description: バリデーションエラー（工程表IDの形式不正を含む）
 *       401:
 *         description: 認証エラー
 *       403:
 *         description: 権限不足
 *       404:
 *         description: 工程表が見つからない（閲覧範囲外・論理削除済みを含む）
 *       500:
 *         description: 出力の記録の失敗（code EXPORT_RECORD_FAILED。ファイルを生成せず返さない）、またはファイルの生成の失敗
 */
router.get(
  '/:id/export',
  authenticate,
  requirePermission('schedule:read'),
  validate(scheduleIdParamSchema, 'params'),
  requireScheduleProjectScope('id'),
  validate(exportQuerySchema, 'query'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = req.params.id as string;
      const { format } = req.validatedQuery as ExportQuery;

      // エクスポートデータの取得（工程表 + プロジェクト情報 + 自社情報）
      const exportData = await scheduleExportService.getExportData(id);
      if (!exportData) {
        res.status(404).json({
          status: 404,
          detail: '工程表が見つかりません',
        });
        return;
      }

      // 生成の前に記録する。対象は工程表、件数は出力対象の工程項目の数（13.6。Requirement 9.3）。
      // 案件は判定部品と同じ解決関数で工程表から引く（`/api/schedules` のマウントには経路の案件 ID が無い）。
      // 判定部品の後に工程表が無くなった・論理的に取り除かれた競合では、記録も生成もせず汎用の 404 にする（13.9）
      const schedule = await findProjectIdOfSchedule(id);
      if (schedule === null || schedule.deleted) {
        next(new NotFoundError());
        return;
      }
      const recordError = await recordExportBeforeGeneration(req, {
        kind: 'schedule_export',
        projectId: schedule.projectId,
        targetIds: [id],
        itemCount: exportData.items.filter((item) => item.isExportTarget).length,
      });
      if (recordError) {
        next(recordError);
        return;
      }

      logger.info(
        { scheduleId: id, format, userId: req.user?.userId },
        'Schedule export requested'
      );

      if (format === 'xlsx') {
        const buffer = await scheduleExportService.exportToExcel(exportData);
        const fileName = encodeURIComponent(`${exportData.name}.xlsx`);

        res.setHeader(
          'Content-Type',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        );
        res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${fileName}`);
        res.send(buffer);
      } else if (format === 'pdf') {
        const buffer = await scheduleExportService.exportToPdf(exportData);
        const fileName = encodeURIComponent(`${exportData.name}.pdf`);

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${fileName}`);
        res.send(buffer);
      } else {
        res.status(400).json({
          status: 400,
          detail: 'サポートされていない出力形式です',
        });
      }
    } catch (error) {
      next(error);
    }
  }
);

export default router;
