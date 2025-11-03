import 'dotenv/config';
import { initSentry } from './utils/sentry.js';
import app from './app.js';
import { disconnectPrisma } from './db.js';
import redis, { initRedis } from './redis.js';
import logger from './utils/logger.js';
import { validateEnv } from './config/env.js';

// Sentryの初期化（最初に実行）
initSentry();

// 環境変数の検証
const env = validateEnv();
const PORT = env.PORT;

// Graceful shutdown
const gracefulShutdown = async (): Promise<void> => {
  logger.info('Shutting down gracefully...');

  try {
    await disconnectPrisma();
    await redis.disconnect();
    logger.info('Connections closed');
    process.exit(0);
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error({ err }, 'Error during shutdown');
    process.exit(1);
  }
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

// アプリケーション初期化と起動
async function startServer(): Promise<void> {
  try {
    // Redisの初期化（失敗してもアプリケーションは起動）
    await initRedis();

    // サーバー起動
    app.listen(PORT, () => {
      logger.info({
        msg: 'Server started',
        port: PORT,
        env: env.NODE_ENV,
        healthCheck: `http://localhost:${PORT}/health`,
        ...(env.NODE_ENV !== 'production' && {
          documentation: `http://localhost:${PORT}/docs`,
          apiSpec: `http://localhost:${PORT}/docs/json`,
        }),
      });
    });
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error({ err }, 'Failed to start server');
    process.exit(1);
  }
}

startServer();
