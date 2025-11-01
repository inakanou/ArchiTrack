import type { Store, IncrementResponse, Options } from 'express-rate-limit';
import type { default as RedisType } from 'ioredis';

/**
 * カスタムRedis Rate Limitストア
 * express-rate-limit用のioredis互換ストア実装
 */
export class RedisRateLimitStore implements Store {
  private clientGetter: () => RedisType | null;
  public prefix: string;
  private windowMs: number = 0;

  constructor(clientGetter: () => RedisType | null, prefix: string = 'rl:') {
    this.clientGetter = clientGetter;
    this.prefix = prefix;
  }

  /**
   * Redisクライアントを取得（遅延初期化）
   */
  private getClient(): RedisType {
    const client = this.clientGetter();
    if (!client) {
      throw new Error('Redis client is not initialized');
    }
    return client;
  }

  /**
   * ストアの初期化
   */
  init(options: Options): void {
    this.windowMs = options.windowMs;
  }

  /**
   * キーのカウントをインクリメント
   */
  async increment(key: string): Promise<IncrementResponse> {
    const redisKey = `${this.prefix}${key}`;
    const client = this.getClient();

    // カウントをインクリメント
    const totalHits = await client.incr(redisKey);

    // 初回アクセス時にTTLを設定
    if (totalHits === 1) {
      await client.pexpire(redisKey, this.windowMs);
    }

    // TTLを取得してresetTimeを計算
    const ttl = await client.pttl(redisKey);
    const resetTime = ttl > 0 ? new Date(Date.now() + ttl) : undefined;

    return {
      totalHits,
      resetTime,
    };
  }

  /**
   * キーのカウントをデクリメント
   */
  async decrement(key: string): Promise<void> {
    const redisKey = `${this.prefix}${key}`;
    const client = this.getClient();
    await client.decr(redisKey);
  }

  /**
   * キーをリセット
   */
  async resetKey(key: string): Promise<void> {
    const redisKey = `${this.prefix}${key}`;
    const client = this.getClient();
    await client.del(redisKey);
  }
}
