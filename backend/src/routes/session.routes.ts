/**
 * @fileoverview セッション管理ルート
 *
 * Requirements:
 * - 8.1-8.5: セッション管理（マルチデバイス対応、セッション一覧、個別削除、全削除）
 *
 * エンドポイント:
 * - GET /api/v1/auth/sessions - セッション一覧取得
 * - DELETE /api/v1/auth/sessions/:sessionId - 個別セッション削除
 * - DELETE /api/v1/auth/sessions - 全セッション削除（全デバイスのログアウトと同じ失効と監査。タスク76.1）
 */

import { Router, Request, Response, NextFunction } from 'express';
import getPrismaClient from '../db.js';
import { SessionService } from '../services/session.service.js';
import { AuthService } from '../services/auth.service.js';
import { authenticate } from '../middleware/authenticate.middleware.js';
import { getClientIp } from '../middleware/client-ip.js';
import logger from '../utils/logger.js';
import { sendAuthDatabaseError } from './auth-database-error.js';

const router = Router();
const prisma = getPrismaClient();
const sessionService = new SessionService(prisma);
const authService = new AuthService(
  prisma,
  undefined,
  undefined,
  undefined,
  undefined,
  sessionService
);

/**
 * @swagger
 * /api/v1/auth/sessions:
 *   get:
 *     summary: Get all sessions
 *     description: Get all active sessions for the authenticated user
 *     tags:
 *       - Sessions
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Sessions retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 sessions:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                         description: Session ID
 *                       deviceInfo:
 *                         type: string
 *                         description: Device information (User-Agent)
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *                         description: Session creation timestamp
 *                       expiresAt:
 *                         type: string
 *                         format: date-time
 *                         description: Session expiration timestamp
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.get(
  '/',
  authenticate,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Unauthorized', code: 'UNAUTHORIZED' });
        return;
      }

      const sessions = await sessionService.listSessions(req.user.userId);

      logger.info({ userId: req.user.userId, count: sessions.length }, 'Sessions retrieved');

      res.status(200).json({ sessions });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/v1/auth/sessions/{sessionId}:
 *   delete:
 *     summary: Delete a specific session
 *     description: Delete a specific session by session ID (logout from a specific device)
 *     tags:
 *       - Sessions
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: sessionId
 *         required: true
 *         schema:
 *           type: string
 *         description: Session ID to delete
 *     responses:
 *       200:
 *         description: Session deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *       404:
 *         description: Session not found
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.delete(
  '/:sessionId',
  authenticate,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Unauthorized', code: 'UNAUTHORIZED' });
        return;
      }

      const { sessionId } = req.params;

      // 自分のセッションの系列を失効させる（他の利用者のセッションは見つからない扱い）
      const result = await sessionService.revokeSessionById(req.user.userId, sessionId as string);

      if (!result.ok) {
        const error = result.error;
        if (error.type === 'SESSION_NOT_FOUND') {
          res.status(404).json({ error: 'Session not found', code: error.type });
          return;
        }
        res.status(500).json({ error: 'Failed to delete session', code: error.type });
        return;
      }

      logger.info({ userId: req.user.userId, sessionId }, 'Session deleted successfully');

      res.status(200).json({ message: 'Session deleted successfully' });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/v1/auth/sessions:
 *   delete:
 *     summary: Delete all sessions
 *     description: >-
 *       Delete all sessions for the authenticated user (logout from all devices). Same as
 *       POST /api/v1/auth/logout-all: issued access tokens and external app connections are
 *       revoked, and the logout is audited with the request source.
 *     tags:
 *       - Sessions
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: All sessions deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.delete(
  '/',
  authenticate,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Unauthorized', code: 'UNAUTHORIZED' });
        return;
      }

      // 全デバイスのログアウトと同じ失効（リフレッシュトークン・アクセストークンの世代・外部アプリの接続）と
      // 監査を通す（要件50.2・51.7）
      const result = await authService.logoutAll(req.user.userId, {
        ipAddress: getClientIp(req),
        userAgent: req.headers['user-agent'],
      });

      if (!result.ok) {
        // POST /api/v1/auth/logout-all と同じ汎用の 500 で返す（要件42.8）
        sendAuthDatabaseError(
          req,
          res,
          result.error.type === 'DATABASE_ERROR' ? result.error.message : result.error.type,
          'Database error during logout-all'
        );
        return;
      }

      logger.info({ userId: req.user.userId }, 'All sessions deleted successfully');

      res.status(200).json({ message: 'All sessions deleted successfully' });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
