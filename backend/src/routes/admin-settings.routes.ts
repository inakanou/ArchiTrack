/**
 * @fileoverview システムの設定の管理 API ルート
 *
 * estimate-request の design の章「Requirements 43-50」の D8。外部の AI での読み取りの設定の取得・変更を
 * 認証済みで settings:update の権限（一般のロールに付与されていない。システム管理者は *:* で持つ）を持つ
 * 利用者に限る。変更は楽観的排他で行い、版が違えば 409（SYSTEM_SETTING_CONFLICT）を返す。
 * 変更の監査ログはサービスが同じトランザクションで記録する。
 *
 * app.ts が `/api/v1/admin/settings` にマウントする。
 */

import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import getPrismaClient from '../db.js';
import { authenticate } from '../middleware/authenticate.middleware.js';
import { requirePermission } from '../middleware/authorize.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { AuditLogService } from '../services/audit-log.service.js';
import { SystemSettingService } from '../services/system-setting.service.js';
import logger from '../utils/logger.js';

const router = Router();
const prisma = getPrismaClient();
const systemSettingService = new SystemSettingService({
  prisma,
  auditLogService: new AuditLogService({ prisma }),
});

/** システムの設定の管理の権限 */
const SETTINGS_UPDATE_PERMISSION = 'settings:update';

/** 外部の AI での読み取りの設定の変更の本文 */
const updateExternalAiReadingSchema = z
  .object({
    enabled: z.boolean({ message: 'enabled は真偽値で指定してください' }),
    version: z
      .number({ message: 'version は数値で指定してください' })
      .int('version は整数で指定してください')
      .min(0, 'version は0以上で指定してください'),
  })
  .strict();

type UpdateExternalAiReadingInput = z.infer<typeof updateExternalAiReadingSchema>;

/**
 * @swagger
 * /api/v1/admin/settings/external-ai-reading:
 *   get:
 *     summary: 外部の AI での読み取りの設定の取得
 *     description: |
 *       外部の AI（Claude Vision）での読み取りが全体で有効かどうかと、楽観的排他の版を返す。
 *       設定が一度も変えられていないときは有効・版 0 を返す。
 *       システムの設定の管理の権限（settings:update。システム管理者が持つ）が必要。
 *     tags:
 *       - Admin
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 現在の設定
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 enabled:
 *                   type: boolean
 *                   example: true
 *                 version:
 *                   type: integer
 *                   example: 0
 *       401:
 *         description: 認証エラー
 *       403:
 *         description: 権限不足
 */
router.get(
  '/external-ai-reading',
  authenticate,
  requirePermission(SETTINGS_UPDATE_PERMISSION),
  async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      res.json(await systemSettingService.getExternalAiReading());
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/v1/admin/settings/external-ai-reading:
 *   put:
 *     summary: 外部の AI での読み取りの停止・再開
 *     description: |
 *       外部の AI（Claude Vision）での読み取りを全体で止める・戻す。取得で得た版を送り、版が今の版と違えば
 *       409 を返す（他の管理者の変更を上書きしない）。変更は監査ログ（OPERATIONAL_SETTING_CHANGED、
 *       対象 SystemSetting / externalAiReading、変更前後の有効・無効）に同じトランザクションで記録し、
 *       記録できないときは変更しない。システムの設定の管理の権限（settings:update）が必要。
 *     tags:
 *       - Admin
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             additionalProperties: false
 *             required:
 *               - enabled
 *               - version
 *             properties:
 *               enabled:
 *                 type: boolean
 *                 description: 変更後の有効・無効（false で停止）
 *               version:
 *                 type: integer
 *                 minimum: 0
 *                 description: 取得で得た版
 *     responses:
 *       200:
 *         description: 変更後の設定
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 enabled:
 *                   type: boolean
 *                   example: false
 *                 version:
 *                   type: integer
 *                   example: 1
 *       400:
 *         description: 本文の検証エラー
 *       401:
 *         description: 認証エラー
 *       403:
 *         description: 権限不足
 *       409:
 *         description: 版の競合（SYSTEM_SETTING_CONFLICT。再読み込みを促す）
 */
router.put(
  '/external-ai-reading',
  authenticate,
  requirePermission(SETTINGS_UPDATE_PERMISSION),
  validate(updateExternalAiReadingSchema, 'body'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const actorId = req.user!.userId;
      const { enabled, version } = req.validatedBody as UpdateExternalAiReadingInput;

      const setting = await systemSettingService.setExternalAiReading(enabled, version, actorId);

      logger.info(
        { userId: actorId, enabled: setting.enabled, version: setting.version },
        'External AI reading setting changed'
      );

      res.json(setting);
    } catch (error) {
      next(error);
    }
  }
);

export default router;
