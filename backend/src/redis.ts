import Redis from 'ioredis';
import logger from './utils/logger.js';
import { parseRedisTimeouts } from './config/redis-timeouts.js';

/**
 * Redis キーのTTL定数（秒単位）
 */
export const CACHE_TTL = {
  SHORT: 60, // 1分
  MEDIUM: 300, // 5分
  LONG: 3600, // 1時間
  DAY: 86400, // 1日
  WEEK: 604800, // 1週間
} as const;

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

  // 接続を保ったまま基盤が応答しなくなっても待ち続けない（要件35.8）。期限切れは要求の失敗として返り、
  // 各用途の既存の失敗時の扱い（回数制限はメモリへ退避、キャッシュは原本を読む、原本の無い手続きは拒否）に乗る。
  // maxRetriesPerRequest は接続が切れて張り直す間の再試行の上限で、接続を保ったままの無応答には効かない
  const { commandTimeout, connectTimeout } = parseRedisTimeouts();
  const client = new Redis(process.env.REDIS_URL, {
    commandTimeout,
    connectTimeout,
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
