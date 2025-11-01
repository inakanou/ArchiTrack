import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import getPrismaClient from './db.js';
import redis from './redis.js';
import { httpLogger } from './middleware/logger.middleware.js';
import { apiLimiter, healthCheckLimiter } from './middleware/rateLimit.middleware.js';
import { validateEnv } from './config/env.js';

const app = express();

// Middleware
// HTTPロギングを最初に適用
app.use(httpLogger);

// 環境変数を検証して取得
const env = validateEnv();

// セキュリティヘッダーの設定
app.use(
  helmet({
    // Content Security Policy
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'https:'],
      },
    },
    // Cross-Origin-Embedder-Policy
    crossOriginEmbedderPolicy: false, // フロントエンドとの連携のため無効化
    // Cross-Origin-Resource-Policy
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);

app.use(
  cors({
    origin: env.FRONTEND_URL,
    credentials: true,
  })
);
app.use(express.json());

// Health check endpoint with timeout
app.get('/health', healthCheckLimiter, async (req: Request, res: Response) => {
  const services: Record<string, string> = {};
  const CHECK_TIMEOUT = 2000; // 2秒でタイムアウト

  // Helper function to add timeout to promises
  const withTimeout = <T>(promise: Promise<T>, timeoutMs: number): Promise<T> => {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) => setTimeout(() => reject(new Error('Timeout')), timeoutMs)),
    ]);
  };

  // PostgreSQL チェック（オプショナル）
  try {
    const prisma = getPrismaClient();
    await withTimeout(prisma.$queryRaw`SELECT 1`, CHECK_TIMEOUT);
    services.database = 'connected';
  } catch (error) {
    req.log.warn({ err: error }, 'PostgreSQL not available');
    services.database = 'disconnected';
    // DB接続がない場合でもサーバーは稼働可能
  }

  // Redis チェック（オプショナル）
  try {
    await withTimeout(redis.ping(), CHECK_TIMEOUT);
    services.redis = 'connected';
  } catch (error) {
    req.log.warn({ err: error }, 'Redis not available');
    services.redis = 'disconnected';
    // Redis接続がない場合でもサーバーは稼働可能
  }

  // サーバー自体が起動していればOK
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    services,
  });
});

// Favicon handler - ブラウザのfaviconリクエストに対応
app.get('/favicon.ico', (_req: Request, res: Response) => {
  res.status(204).end(); // No Content
});

// API routes
// 全APIエンドポイントにレート制限を適用
app.use('/api', apiLimiter);

app.get('/api', (_req: Request, res: Response) => {
  res.json({
    message: 'ArchiTrack API',
    version: '1.0.0',
  });
});

// 404 handler
app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: 'Not found' });
});

// Error handler
app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
  req.log.error({ err }, 'Internal server error');
  res.status(500).json({ error: 'Internal server error' });
});

export default app;
