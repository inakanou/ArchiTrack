import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import type { Request, Response } from 'express';
import redis from '../redis.js';
import { RedisRateLimitStore } from './RedisRateLimitStore.js';

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
  // カスタムRedisストアを使用（遅延初期化）
  store: new RedisRateLimitStore(() => redis.getClient(), 'rl:api:'),
  // カスタムキー生成（プロキシ環境対応、IPv6対応）
  keyGenerator: (req: Request): string => {
    const forwardedFor = req.headers['x-forwarded-for'] as string | undefined;
    const realIp = req.headers['x-real-ip'] as string | undefined;

    const ip = forwardedFor?.split(',')[0] || realIp || req.ip || 'unknown';

    // IPv6アドレスの正規化のためにipKeyGeneratorヘルパーを使用
    return ipKeyGenerator(ip);
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
  // カスタムRedisストアを使用（遅延初期化）
  store: new RedisRateLimitStore(() => redis.getClient(), 'rl:auth:'),
  keyGenerator: (req: Request): string => {
    const forwardedFor = req.headers['x-forwarded-for'] as string | undefined;
    const realIp = req.headers['x-real-ip'] as string | undefined;

    const ip = forwardedFor?.split(',')[0] || realIp || req.ip || 'unknown';

    // IPv6アドレスの正規化のためにipKeyGeneratorヘルパーを使用
    return ipKeyGenerator(ip);
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
  // カスタムRedisストアを使用（遅延初期化）
  store: new RedisRateLimitStore(() => redis.getClient(), 'rl:health:'),
  keyGenerator: (req: Request): string => {
    const forwardedFor = req.headers['x-forwarded-for'] as string | undefined;
    const realIp = req.headers['x-real-ip'] as string | undefined;

    const ip = forwardedFor?.split(',')[0] || realIp || req.ip || 'unknown';

    // IPv6アドレスの正規化のためにipKeyGeneratorヘルパーを使用
    return ipKeyGenerator(ip);
  },
});
