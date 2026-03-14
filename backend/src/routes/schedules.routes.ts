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
 * @module routes/schedules
 */

import { Router, type Request, type Response, type NextFunction } from 'express';
import { ScheduleService } from '../services/schedule.service.js';
import { ScheduleExportService } from '../services/schedule-export.service.js';
import getPrismaClient from '../db.js';
import { validate } from '../middleware/validate.middleware.js';
import { authenticate } from '../middleware/authenticate.middleware.js';
import { requirePermission } from '../middleware/authorize.middleware.js';
import logger from '../utils/logger.js';
import {
  createScheduleSchema,
  updateScheduleSchema,
  bulkSaveScheduleItemsSchema,
  exportQuerySchema,
  scheduleListQuerySchema,
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
 *       401:
 *         description: 認証エラー
 *       403:
 *         description: 権限不足
 */
router.get(
  '/',
  authenticate,
  requirePermission('schedule:read'),
  validate(scheduleListQuerySchema, 'query'),
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
 *       401:
 *         description: 認証エラー
 *       403:
 *         description: 権限不足
 *       404:
 *         description: 工程表が見つからない
 */
router.get(
  '/:id',
  authenticate,
  requirePermission('schedule:read'),
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
 *         description: バリデーションエラー
 *       401:
 *         description: 認証エラー
 *       403:
 *         description: 権限不足
 *       422:
 *         description: ビジネスロジックエラー
 */
router.post(
  '/',
  authenticate,
  requirePermission('schedule:create'),
  validate(createScheduleSchema, 'body'),
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

      const data = req.validatedBody as CreateScheduleInput;

      const schedule = await scheduleService.create(projectId, data);

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
 *         description: バリデーションエラー
 *       401:
 *         description: 認証エラー
 *       403:
 *         description: 権限不足
 *       404:
 *         description: 工程表が見つからない
 *       409:
 *         description: 楽観的排他制御エラー（競合）
 */
router.put(
  '/:id',
  authenticate,
  requirePermission('schedule:update'),
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
 *         description: バリデーションエラー
 *       401:
 *         description: 認証エラー
 *       403:
 *         description: 権限不足
 *       404:
 *         description: 工程表が見つからない
 *       409:
 *         description: 楽観的排他制御エラー（競合）
 */
router.put(
  '/:id/bulk-save',
  authenticate,
  requirePermission('schedule:update'),
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
 *       401:
 *         description: 認証エラー
 *       403:
 *         description: 権限不足
 *       404:
 *         description: 工程表が見つからない
 */
router.delete(
  '/:id',
  authenticate,
  requirePermission('schedule:delete'),
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
 *         description: バリデーションエラー
 *       401:
 *         description: 認証エラー
 *       403:
 *         description: 権限不足
 *       404:
 *         description: 工程表が見つからない
 */
router.get(
  '/:id/export',
  authenticate,
  requirePermission('schedule:read'),
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
      } else {
        // PDF出力はTask 12で実装予定
        res.status(501).json({
          status: 501,
          detail: 'PDF出力は未実装です',
        });
      }
    } catch (error) {
      next(error);
    }
  }
);

export default router;
