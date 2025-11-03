import { Router, Request, Response } from 'express';
import logger from '../utils/logger.js';

const router = Router();

/**
 * @swagger
 * /admin/log-level:
 *   post:
 *     summary: Change log level
 *     description: Change the application's log level. Requires authentication in production.
 *     tags:
 *       - Admin
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
 *                 description: The log level to set
 *     responses:
 *       200:
 *         description: Log level changed successfully
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
 *         $ref: '#/components/responses/BadRequest'
 */
router.post('/log-level', (req: Request, res: Response): void => {
  const { level } = req.body;

  // 有効なログレベルのバリデーション
  const validLevels = ['trace', 'debug', 'info', 'warn', 'error', 'fatal'];

  if (!level || !validLevels.includes(level)) {
    res.status(400).json({
      error: 'Invalid log level',
      code: 'INVALID_LOG_LEVEL',
      details: {
        validLevels,
      },
    });
    return;
  }

  // TODO: 認証ミドルウェアを追加（将来実装）
  // if (!req.user || req.user.role !== 'admin') {
  //   return res.status(403).json({ error: 'Forbidden' });
  // }

  // 本番環境では警告を出す
  if (process.env.NODE_ENV === 'production') {
    logger.warn(
      { oldLevel: logger.level, newLevel: level },
      'Changing log level in production environment'
    );
  }

  // ログレベルを変更
  logger.level = level;

  logger.info({ newLevel: level }, 'Log level changed successfully');

  res.json({
    success: true,
    level,
    message: `Log level changed to: ${level}`,
  });
});

/**
 * @swagger
 * /admin/log-level:
 *   get:
 *     summary: Get current log level
 *     description: Retrieve the current application log level and environment
 *     tags:
 *       - Admin
 *     responses:
 *       200:
 *         description: Current log level retrieved successfully
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
 */
router.get('/log-level', (_req: Request, res: Response) => {
  res.json({
    level: logger.level,
    environment: process.env.NODE_ENV || 'development',
  });
});

export default router;
