import { Router, Request, Response } from 'express';
import logger from '../utils/logger.js';

const router = Router();

/**
 * ログレベル変更エンドポイント
 * 本番環境での使用には認証が必要（将来実装）
 *
 * POST /admin/log-level
 * Body: { "level": "debug" | "info" | "warn" | "error" }
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
 * 現在のログレベル取得エンドポイント
 * GET /admin/log-level
 */
router.get('/log-level', (_req: Request, res: Response) => {
  res.json({
    level: logger.level,
    environment: process.env.NODE_ENV || 'development',
  });
});

export default router;
