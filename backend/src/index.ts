import 'dotenv/config';
import { initSentry } from './utils/sentry.js';
import app from './app.js';
import { disconnectPrisma } from './db.js';
import redis, { initRedis } from './redis.js';
import logger from './utils/logger.js';
import { validateEnv } from './config/env.js';

// Initialize Sentry (must run first)
initSentry();

// Validate environment variables
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

// Initialize and start the application
async function startServer(): Promise<void> {
  try {
    // Initialize Redis (application starts even if Redis initialization fails)
    await initRedis();

    // Start server
    // Listen on 0.0.0.0 to accept external connections in container environments (e.g., Railway)
    app.listen(PORT, '0.0.0.0', () => {
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
