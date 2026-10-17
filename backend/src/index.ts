import 'dotenv/config';
import { initSentry } from './utils/sentry.js';
import app from './app.js';
import { disconnectPrisma } from './db.js';
import redis, { initRedis } from './redis.js';
import logger from './utils/logger.js';
import { validateEnv } from './config/env.js';
import { runtimeMode } from './config/runtime-mode.js';
import { initializeStorage, disconnectStorage, isStorageConfigured } from './storage/index.js';
import { initializeStorageServices } from './routes/survey-images.routes.js';

// Initialize Sentry (must run first)
initSentry();

// Validate environment variables
const env = validateEnv();
const PORT = env.PORT;

// Graceful shutdown
const gracefulShutdown = async (): Promise<void> => {
  logger.info('Shutting down gracefully...');

  try {
    await disconnectStorage();
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

// Initialize and start the application
async function startServer(): Promise<void> {
  try {
    // 本番の前提（アーカイブの鍵・中継の段数・キャッシュ基盤の接続先）が欠けたら起動を止める（要件41.3）
    runtimeMode.assertProductionPrerequisites();

    // Initialize Redis (application starts even if Redis initialization fails)
    await initRedis();

    // Initialize Storage (application starts even if storage initialization fails)
    if (isStorageConfigured()) {
      const storageInitialized = await initializeStorage();
      if (storageInitialized) {
        logger.info('Storage initialized successfully');
        // Initialize storage-related services
        await initializeStorageServices();
      } else {
        logger.warn('Storage initialization failed. Image features will be disabled.');
      }
    } else {
      logger.info('Storage is not configured. Image features are disabled.');
    }

    // Start server
    // Listen on :: (dual-stack: IPv6 and IPv4) to accept external connections in container
    // environments. The frontend nginx proxies the API to the backend over Railway's private
    // network, which is IPv6-only in some environments (*.railway.internal resolves to AAAA
    // only), so listening on 0.0.0.0 (IPv4 only) would make the proxy target unreachable.
    app.listen(PORT, '::', () => {
      logger.info({
        msg: 'Server started',
        port: PORT,
        env: env.NODE_ENV,
        healthCheck: `http://localhost:${PORT}/health`,
        ...(runtimeMode.isDevelopmentFeatureEnabled() && {
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
