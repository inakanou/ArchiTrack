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
  // OPTIONSリクエスト（CORS preflight）、テスト環境、またはレート制限無効化フラグがある場合はスキップ
  skip: (req: Request) =>
    req.method === 'OPTIONS' ||
    process.env.NODE_ENV === 'test' ||
    process.env.DISABLE_RATE_LIMIT === 'true',
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
 * ログインエンドポイント用のレート制限
 * @requirement user-authentication/REQ-26.12: 1分間で10リクエストまで
 */
export const loginLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1分
  max: 10, // 最大10リクエスト
  message: {
    error: 'Too many login attempts, please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  // OPTIONSリクエスト（CORS preflight）、テスト環境、またはレート制限無効化フラグがある場合はスキップ
  skip: (req: Request) =>
    req.method === 'OPTIONS' ||
    process.env.NODE_ENV === 'test' ||
    process.env.DISABLE_RATE_LIMIT === 'true',
  // カスタムRedisストアを使用（遅延初期化）
  store: new RedisRateLimitStore(() => redis.getClient(), 'rl:login:'),
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
      'Login rate limit exceeded'
    );
    res.status(429).json({
      error: 'Too many login attempts, please try again later.',
      retryAfter: res.getHeader('Retry-After'),
    });
  },
});

/**
 * トークンリフレッシュエンドポイント用のレート制限
 * @requirement user-authentication/REQ-26.12: 1分間で20リクエストまで
 */
export const refreshLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1分
  max: 20, // 最大20リクエスト
  message: {
    error: 'Too many token refresh attempts, please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  // OPTIONSリクエスト（CORS preflight）、テスト環境、またはレート制限無効化フラグがある場合はスキップ
  skip: (req: Request) =>
    req.method === 'OPTIONS' ||
    process.env.NODE_ENV === 'test' ||
    process.env.DISABLE_RATE_LIMIT === 'true',
  // カスタムRedisストアを使用（遅延初期化）
  store: new RedisRateLimitStore(() => redis.getClient(), 'rl:refresh:'),
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
      'Token refresh rate limit exceeded'
    );
    res.status(429).json({
      error: 'Too many token refresh attempts, please try again later.',
      retryAfter: res.getHeader('Retry-After'),
    });
  },
});

/**
 * 招待エンドポイント用のレート制限
 * @requirement user-authentication/REQ-26.12: 1分間で5リクエストまで（ユーザーIDベース）
 */
export const invitationLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1分
  max: 5, // 最大5リクエスト
  message: {
    error: 'Too many invitation requests, please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  // OPTIONSリクエスト（CORS preflight）、テスト環境、またはレート制限無効化フラグがある場合はスキップ
  skip: (req: Request) =>
    req.method === 'OPTIONS' ||
    process.env.NODE_ENV === 'test' ||
    process.env.DISABLE_RATE_LIMIT === 'true',
  // カスタムRedisストアを使用（遅延初期化）
  store: new RedisRateLimitStore(() => redis.getClient(), 'rl:invitation:'),
  // ユーザーIDベースのレート制限
  keyGenerator: (req: Request): string => {
    // 認証済みユーザーのIDを使用
    const userId = (req as Request & { user?: { id: string } }).user?.id;
    if (userId) {
      return `user:${userId}`;
    }

    // IPアドレスを使用（IPv6対応）
    const forwardedFor = req.headers['x-forwarded-for'] as string | undefined;
    const realIp = req.headers['x-real-ip'] as string | undefined;
    const ip = forwardedFor?.split(',')[0] || realIp || req.ip || 'unknown';
    return `ip:${ipKeyGenerator(ip)}`;
  },
  handler: (req: Request, res: Response) => {
    req.log.warn(
      {
        userId: (req as Request & { user?: { id: string } }).user?.id,
        ip: req.ip,
        path: req.path,
      },
      'Invitation rate limit exceeded'
    );
    res.status(429).json({
      error: 'Too many invitation requests, please try again later.',
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
