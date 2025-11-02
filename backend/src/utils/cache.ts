import redis, { CACHE_TTL } from '../redis.js';
import logger from './logger.js';

/**
 * キャッシュキーのプレフィックス
 */
export const CACHE_PREFIX = {
  USER: 'user',
  SESSION: 'session',
  RATE_LIMIT: 'ratelimit',
  TEMP: 'temp',
} as const;

/**
 * キャッシュキーを生成
 */
export function generateCacheKey(prefix: string, ...parts: (string | number)[]): string {
  return `${prefix}:${parts.join(':')}`;
}

/**
 * キャッシュからデータを取得（JSON自動パース）
 */
export async function getCache<T>(key: string): Promise<T | null> {
  try {
    const client = redis.getClient();
    if (!client) {
      logger.debug('Redis not available, cache miss');
      return null;
    }

    const value = await client.get(key);
    if (!value) {
      return null;
    }

    return JSON.parse(value) as T;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error({ err, key }, 'Failed to get cache');
    return null;
  }
}

/**
 * データをキャッシュに保存（JSON自動シリアライズ）
 */
export async function setCache(
  key: string,
  value: unknown,
  ttlSeconds: number = CACHE_TTL.MEDIUM
): Promise<boolean> {
  try {
    const client = redis.getClient();
    if (!client) {
      logger.debug('Redis not available, skipping cache set');
      return false;
    }

    const serialized = JSON.stringify(value);
    await client.setex(key, ttlSeconds, serialized);
    return true;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error({ err, key }, 'Failed to set cache');
    return false;
  }
}

/**
 * キャッシュを削除
 */
export async function deleteCache(key: string): Promise<boolean> {
  try {
    const client = redis.getClient();
    if (!client) {
      return false;
    }

    await client.del(key);
    return true;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error({ err, key }, 'Failed to delete cache');
    return false;
  }
}

/**
 * パターンマッチするキーを削除
 * 注意: 本番環境で大量のキーがある場合はSCANを使用することを推奨
 */
export async function deleteCachePattern(pattern: string): Promise<number> {
  try {
    const client = redis.getClient();
    if (!client) {
      return 0;
    }

    const keys = await client.keys(pattern);
    if (keys.length === 0) {
      return 0;
    }

    await client.del(...keys);
    return keys.length;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error({ err, pattern }, 'Failed to delete cache pattern');
    return 0;
  }
}

/**
 * キャッシュの存在確認
 */
export async function hasCache(key: string): Promise<boolean> {
  try {
    const client = redis.getClient();
    if (!client) {
      return false;
    }

    const exists = await client.exists(key);
    return exists === 1;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error({ err, key }, 'Failed to check cache existence');
    return false;
  }
}

/**
 * キャッシュ戦略: Cache-Aside Pattern
 * キャッシュにデータがあれば返し、なければfetchFnを実行してキャッシュに保存
 *
 * @example
 * const user = await cacheAside(
 *   generateCacheKey(CACHE_PREFIX.USER, userId),
 *   () => prisma.user.findUnique({ where: { id: userId } }),
 *   CACHE_TTL.LONG
 * );
 */
export async function cacheAside<T>(
  key: string,
  fetchFn: () => Promise<T>,
  ttlSeconds: number = CACHE_TTL.MEDIUM
): Promise<T> {
  // キャッシュから取得を試みる
  const cached = await getCache<T>(key);
  if (cached !== null) {
    logger.debug({ key }, 'Cache hit');
    return cached;
  }

  // キャッシュミス: データを取得
  logger.debug({ key }, 'Cache miss, fetching data');
  const data = await fetchFn();

  // キャッシュに保存（非同期、失敗しても続行）
  setCache(key, data, ttlSeconds).catch((error) => {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error({ err, key }, 'Failed to cache data after fetch');
  });

  return data;
}

/**
 * 複数のキャッシュを一括取得
 */
export async function mgetCache<T>(keys: string[]): Promise<(T | null)[]> {
  try {
    const client = redis.getClient();
    if (!client || keys.length === 0) {
      return keys.map(() => null);
    }

    const values = await client.mget(...keys);
    return values.map((value) => {
      if (!value) return null;
      try {
        return JSON.parse(value) as T;
      } catch {
        return null;
      }
    });
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error({ err, keys }, 'Failed to mget cache');
    return keys.map(() => null);
  }
}

/**
 * 複数のキャッシュを一括設定
 */
export async function msetCache(
  entries: Array<{ key: string; value: unknown; ttl?: number }>,
  defaultTtl: number = CACHE_TTL.MEDIUM
): Promise<boolean> {
  try {
    const client = redis.getClient();
    if (!client || entries.length === 0) {
      return false;
    }

    // pipelineを使用して一括設定
    const pipeline = client.pipeline();
    for (const entry of entries) {
      const serialized = JSON.stringify(entry.value);
      const ttl = entry.ttl ?? defaultTtl;
      pipeline.setex(entry.key, ttl, serialized);
    }

    await pipeline.exec();
    return true;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error({ err }, 'Failed to mset cache');
    return false;
  }
}

/**
 * TTLを更新（キーの有効期限を延長）
 */
export async function refreshTTL(key: string, ttlSeconds: number): Promise<boolean> {
  try {
    const client = redis.getClient();
    if (!client) {
      return false;
    }

    const result = await client.expire(key, ttlSeconds);
    return result === 1;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error({ err, key }, 'Failed to refresh TTL');
    return false;
  }
}

/**
 * カウンターをインクリメント（レート制限などに使用）
 */
export async function incrementCounter(key: string, ttlSeconds?: number): Promise<number | null> {
  try {
    const client = redis.getClient();
    if (!client) {
      return null;
    }

    const count = await client.incr(key);

    // TTLが指定されている場合は設定
    if (ttlSeconds !== undefined && count === 1) {
      await client.expire(key, ttlSeconds);
    }

    return count;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error({ err, key }, 'Failed to increment counter');
    return null;
  }
}

/**
 * カウンター値を取得
 */
export async function getCounter(key: string): Promise<number | null> {
  try {
    const client = redis.getClient();
    if (!client) {
      return null;
    }

    const value = await client.get(key);
    if (!value) {
      return 0;
    }

    return parseInt(value, 10);
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error({ err, key }, 'Failed to get counter');
    return null;
  }
}
