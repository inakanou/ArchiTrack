import Redis from 'ioredis';
import logger from './utils/logger.js';

let redis: Redis | null = null;

// Lazy initialization - only create redis client when REDIS_URL is available
function getRedis(): Redis | null {
  if (!redis && process.env.REDIS_URL) {
    redis = new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: 3,
      retryStrategy(times: number): number {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
      lazyConnect: true, // Don't connect immediately
    });

    redis.on('connect', () => {
      logger.info('Redis connected');
    });

    redis.on('error', (err: Error) => {
      logger.error({ err }, 'Redis error');
    });
  }
  return redis;
}

export default {
  ping: async (): Promise<string> => {
    const r = getRedis();
    if (!r) {
      throw new Error('REDIS_URL not configured');
    }
    if (r.status !== 'ready') {
      await r.connect();
    }
    return r.ping();
  },
  disconnect: (): void => {
    if (redis) {
      redis.disconnect();
    }
  },
};
