import 'dotenv/config';
import app from './app.js';
import { disconnectPrisma } from './db.js';
import redis, { initRedis } from './redis.js';
import logger from './utils/logger.js';
import { validateEnv } from './config/env.js';

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
      });
    });
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error({ err }, 'Failed to start server');
    process.exit(1);
  }
}

startServer();
