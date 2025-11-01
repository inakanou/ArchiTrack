import 'dotenv/config';
import app from './app.js';
import { disconnectPrisma } from './db.js';
import redis from './redis.js';
import logger from './utils/logger.js';

const PORT = parseInt(process.env.PORT || '3000', 10);

// Graceful shutdown
const gracefulShutdown = async (): Promise<void> => {
  logger.info('Shutting down gracefully...');

  try {
    await disconnectPrisma();
    redis.disconnect();
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

// Start server
app.listen(PORT, () => {
  logger.info({
    msg: 'Server started',
    port: PORT,
    env: process.env.NODE_ENV || 'development',
    healthCheck: `http://localhost:${PORT}/health`,
  });
});
