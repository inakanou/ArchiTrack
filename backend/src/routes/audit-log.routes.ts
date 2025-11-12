/**
 * @fileoverview 監査ログAPIルート
 *
 * Requirements:
 * - 22: 監査ログとコンプライアンス
 */

import { Router, type Request, type Response, type NextFunction } from 'express';
import { AuditLogService } from '../services/audit-log.service.js';
import getPrismaClient from '../db.js';
import { authenticate } from '../middleware/authenticate.middleware.js';
import { requirePermission } from '../middleware/authorize.middleware.js';
import type { AuditLogFilter } from '../types/audit-log.types';
import logger from '../utils/logger.js';

const router = Router();
const prisma = getPrismaClient();
const auditLogService = new AuditLogService({ prisma });

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

      const jsonExport = await auditLogService.exportLogs(filter);

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

export default router;
