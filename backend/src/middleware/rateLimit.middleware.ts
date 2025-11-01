import rateLimit from 'express-rate-limit';
import type { Request, Response } from 'express';

/**
 * 一般的なAPIエンドポイント用のレート制限
 * 15分間で100リクエストまで
 */
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15分
  max: 100, // 最大100リクエスト
  message: {
    error: 'Too many requests from this IP, please try again later.',
  },
  standardHeaders: true, // RateLimit-* ヘッダーを返す
  legacyHeaders: false, // X-RateLimit-* ヘッダーを無効化
  // カスタムキー生成（プロキシ環境対応）
  keyGenerator: (req: Request): string => {
    return (
      (req.headers['x-forwarded-for'] as string)?.split(',')[0] ||
      (req.headers['x-real-ip'] as string) ||
      req.ip ||
      'unknown'
    );
  },
  // レート制限到達時のハンドラー
  handler: (req: Request, res: Response) => {
    req.log.warn(
      {
        ip: req.ip,
        path: req.path,
      },
      'Rate limit exceeded'
    );
    res.status(429).json({
      error: 'Too many requests from this IP, please try again later.',
      retryAfter: res.getHeader('Retry-After'),
    });
  },
});

/**
 * 認証エンドポイント用の厳格なレート制限
 * 15分間で5リクエストまで
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15分
  max: 5, // 最大5リクエスト
  message: {
    error: 'Too many authentication attempts, please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request): string => {
    return (
      (req.headers['x-forwarded-for'] as string)?.split(',')[0] ||
      (req.headers['x-real-ip'] as string) ||
      req.ip ||
      'unknown'
    );
  },
  handler: (req: Request, res: Response) => {
    req.log.warn(
      {
        ip: req.ip,
        path: req.path,
      },
      'Auth rate limit exceeded'
    );
    res.status(429).json({
      error: 'Too many authentication attempts, please try again later.',
      retryAfter: res.getHeader('Retry-After'),
    });
  },
});

/**
 * ヘルスチェック用の緩いレート制限
 * 1分間で60リクエストまで
 */
export const healthCheckLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1分
  max: 60, // 最大60リクエスト
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request): string => {
    return (
      (req.headers['x-forwarded-for'] as string)?.split(',')[0] ||
      (req.headers['x-real-ip'] as string) ||
      req.ip ||
      'unknown'
    );
  },
});
