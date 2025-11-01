import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import db from './db.js';
import redis from './redis.js';
import logger from './utils/logger.js';
import { httpLogger } from './middleware/logger.middleware.js';

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
// HTTPロギングを最初に適用
app.use(httpLogger);

app.use(
  cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true,
  })
);
app.use(express.json());

// Health check endpoint with timeout
app.get('/health', async (req: Request, res: Response) => {
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
    await withTimeout(db.query('SELECT 1'), CHECK_TIMEOUT);
    services.database = 'connected';
  } catch (error) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (req as any).log.warn({ err: error }, 'PostgreSQL not available');
    services.database = 'disconnected';
    // DB接続がない場合でもサーバーは稼働可能
  }

  // Redis チェック（オプショナル）
  try {
    await withTimeout(redis.ping(), CHECK_TIMEOUT);
    services.redis = 'connected';
  } catch (error) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (req as any).log.warn({ err: error }, 'Redis not available');
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (req as any).log.error({ err }, 'Internal server error');
  res.status(500).json({ error: 'Internal server error' });
});

// Graceful shutdown
const gracefulShutdown = async () => {
  logger.info('Shutting down gracefully...');

  try {
    await db.end();
    redis.disconnect();
    logger.info('Connections closed');
    process.exit(0);
  } catch (error) {
    logger.error({ err: error }, 'Error during shutdown');
    process.exit(1);
  }
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

// Start server
app.listen(PORT, () => {
  logger.info({
    msg: 'Server started',
    port: PORT,
    env: process.env.NODE_ENV || 'development',
    healthCheck: `http://localhost:${PORT}/health`,
  });
});
