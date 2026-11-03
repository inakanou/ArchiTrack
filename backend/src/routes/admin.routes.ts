/**
 * @fileoverview 運用設定（ログレベル）の管理 API ルート
 *
 * 運用設定の変更・参照は、認証済みで運用設定の管理の権限（ops:manage）を持つ利用者（システム管理者）に限り、
 * 変更は実行者と変更前後の値とともに監査ログに記録する（user-authentication タスク55.1）。
 *
 * app.ts が `/api/v1/admin` にマウントする（認証の無い旧経路 `/admin` は設けない）。
 */

import { Router, type Request, type Response, type NextFunction } from 'express';
import getPrismaClient from '../db.js';
import { authenticate } from '../middleware/authenticate.middleware.js';
import { requirePermission } from '../middleware/authorize.middleware.js';
import { getClientIp } from '../middleware/client-ip.js';
import { AuditLogService } from '../services/audit-log.service.js';
import { InternalServerError } from '../errors/apiError.js';
import {
  AUDIT_IP_ADDRESS_MAX_LENGTH,
  AUDIT_USER_AGENT_MAX_LENGTH,
  boundAuditText,
} from '../utils/audit-text.js';
import logger from '../utils/logger.js';

const router = Router();
const auditLogService = new AuditLogService({ prisma: getPrismaClient() });

/** 運用設定の管理の権限 */
const OPS_MANAGE_PERMISSION = 'ops:manage';

/** 変更できるログレベル */
const VALID_LOG_LEVELS = ['trace', 'debug', 'info', 'warn', 'error', 'fatal'] as const;
type ValidLogLevel = (typeof VALID_LOG_LEVELS)[number];

/** 監査ログの対象（運用設定のログレベル） */
const OPERATIONAL_SETTING_TARGET_TYPE = 'OperationalSetting';
const LOG_LEVEL_SETTING_ID = 'logLevel';

function isValidLogLevel(value: unknown): value is ValidLogLevel {
  return typeof value === 'string' && (VALID_LOG_LEVELS as readonly string[]).includes(value);
}

/** 監査に書く要求の送信元（長さを切り詰める） */
function requestAuditMetadata(req: Request): Record<string, string | boolean> {
  const metadata: Record<string, string | boolean> = {};
  metadata.ipAddress = boundAuditText(getClientIp(req), AUDIT_IP_ADDRESS_MAX_LENGTH).value;
  const rawUserAgent = req.get('user-agent');
  if (rawUserAgent !== undefined) {
    const userAgent = boundAuditText(rawUserAgent, AUDIT_USER_AGENT_MAX_LENGTH);
    metadata.userAgent = userAgent.value;
    if (userAgent.truncated) {
      metadata.userAgentTruncated = true;
    }
  }
  return metadata;
}

/** 認証と運用設定の管理の権限（参照・変更の両方に課す） */
const guards = [authenticate, requirePermission(OPS_MANAGE_PERMISSION)];

/**
 * @swagger
 * /api/v1/admin/log-level:
 *   post:
 *     summary: ログレベルの変更
 *     description: |
 *       アプリケーションのログレベルを変更する。運用設定の管理の権限（ops:manage。システム管理者が持つ）が必要。
 *       変更は監査ログ（OPERATIONAL_SETTING_CHANGED、変更前後のログレベル）に記録し、記録できないときは変更しない。
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
 *             required:
 *               - level
 *             properties:
 *               level:
 *                 type: string
 *                 enum: [trace, debug, info, warn, error, fatal]
 *                 description: 設定するログレベル
 *     responses:
 *       200:
 *         description: ログレベルを変更した
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 level:
 *                   type: string
 *                   example: debug
 *                 message:
 *                   type: string
 *       400:
 *         description: 許可された値に無いログレベル（INVALID_LOG_LEVEL）
 *       401:
 *         description: 認証エラー
 *       403:
 *         description: 権限不足
 *       500:
 *         description: 変更を監査に記録できなかった（OPERATIONAL_SETTING_RECORD_FAILED。ログレベルは変わらない）
 */
router.post(
  '/log-level',
  ...guards,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const level: unknown = req.body?.level;

    if (!isValidLogLevel(level)) {
      res.status(400).json({
        error: 'Invalid log level',
        code: 'INVALID_LOG_LEVEL',
        details: {
          validLevels: VALID_LOG_LEVELS,
        },
      });
      return;
    }

    const oldLevel = logger.level;

    // 変更の前に記録する。記録できなければ変更しない
    try {
      await auditLogService.createLog({
        action: 'OPERATIONAL_SETTING_CHANGED',
        actorId: req.user!.userId,
        targetType: OPERATIONAL_SETTING_TARGET_TYPE,
        targetId: LOG_LEVEL_SETTING_ID,
        before: { logLevel: oldLevel },
        after: { logLevel: level },
        metadata: { setting: LOG_LEVEL_SETTING_ID, ...requestAuditMetadata(req) },
      });
    } catch (error) {
      logger.error(
        { err: error, oldLevel, newLevel: level },
        'Failed to record the log level change'
      );
      next(
        new InternalServerError(
          'ログレベルの変更を記録できなかったため中止しました',
          'OPERATIONAL_SETTING_RECORD_FAILED'
        )
      );
      return;
    }

    // 本番環境では警告を出す
    if (process.env.NODE_ENV === 'production') {
      logger.warn(
        { oldLevel, newLevel: level, userId: req.user?.userId },
        'Changing log level in production environment'
      );
    }

    logger.level = level;

    logger.info({ newLevel: level, userId: req.user?.userId }, 'Log level changed successfully');

    res.json({
      success: true,
      level,
      message: `Log level changed to: ${level}`,
    });
  }
);

/**
 * @swagger
 * /api/v1/admin/log-level:
 *   get:
 *     summary: 現在のログレベルの取得
 *     description: 現在のログレベルと実行環境を返す。運用設定の管理の権限（ops:manage。システム管理者が持つ）が必要。
 *     tags:
 *       - Admin
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 現在のログレベル
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 level:
 *                   type: string
 *                   example: info
 *                 environment:
 *                   type: string
 *                   enum: [development, production]
 *                   example: development
 *       401:
 *         description: 認証エラー
 *       403:
 *         description: 権限不足
 */
router.get('/log-level', ...guards, (_req: Request, res: Response) => {
  res.json({
    level: logger.level,
    environment: process.env.NODE_ENV || 'development',
  });
});

export default router;
