import Redis from 'ioredis';
import logger from './utils/logger.js';

let redis: Redis | null = null;
let isConnecting = false;

/**
 * Redis クライアントの初期化
 * REDIS_URLが設定されている場合のみクライアントを作成
 */
function createRedisClient(): Redis | null {
  if (!process.env.REDIS_URL) {
    logger.warn('REDIS_URL not configured, Redis client will not be initialized');
    return null;
  }

  const client = new Redis(process.env.REDIS_URL, {
    maxRetriesPerRequest: 3,
    retryStrategy(times: number): number {
      const delay = Math.min(times * 50, 2000);
      logger.debug({ attempt: times, delay }, 'Redis retry attempt');
      return delay;
    },
    lazyConnect: true, // 手動で接続を管理
  });

  client.on('connect', () => {
    logger.info('Redis connected');
  });

  client.on('ready', () => {
    logger.info('Redis ready');
  });

  client.on('error', (err: Error) => {
    logger.error({ err }, 'Redis error');
  });

  client.on('close', () => {
    logger.info('Redis connection closed');
  });

  client.on('reconnecting', () => {
    logger.info('Redis reconnecting...');
  });

  return client;
}

/**
 * Redis接続の初期化（アプリケーション起動時に呼び出す）
 */
export async function initRedis(): Promise<void> {
  if (redis || isConnecting) {
    return;
  }

  isConnecting = true;

  try {
    redis = createRedisClient();
    if (redis) {
      await redis.connect();
      logger.info('Redis initialized successfully');
    }
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error({ err }, 'Failed to initialize Redis');
    // Redis接続失敗でもアプリケーションは起動を継続
  } finally {
    isConnecting = false;
  }
}

/**
 * Redisクライアントの取得
 */
function getRedis(): Redis | null {
  return redis;
}

export default {
  /**
   * Ping コマンド
   */
  ping: async (): Promise<string> => {
    const r = getRedis();
    if (!r) {
      throw new Error('Redis client not initialized');
    }
    if (r.status !== 'ready') {
      throw new Error('Redis not ready');
    }
    return r.ping();
  },

  /**
   * 切断処理
   */
  disconnect: async (): Promise<void> => {
    if (redis) {
      await redis.quit();
      redis = null;
      logger.info('Redis disconnected');
    }
  },

  /**
   * Redisクライアントの直接取得（高度な使用）
   */
  getClient: (): Redis | null => {
    return getRedis();
  },
};
