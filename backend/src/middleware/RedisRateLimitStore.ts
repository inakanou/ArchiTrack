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
   * Redisが利用できない場合はnullを返す（メモリストアにフォールバック）
   */
  private getClient(): RedisType | null {
    const client = this.clientGetter();
    if (!client) {
      // Redisが利用できない場合、express-rate-limitは自動的に
      // メモリストアにフォールバックする
      return null;
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
    const client = this.getClient();

    // Redisが利用できない場合は、デフォルト値を返す
    // express-rate-limitがメモリストアにフォールバックする
    if (!client) {
      return {
        totalHits: 1,
        resetTime: new Date(Date.now() + this.windowMs),
      };
    }

    const redisKey = `${this.prefix}${key}`;

    try {
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
    } catch (error) {
      // Redisエラー時はフォールバック
      console.warn('Redis error during increment, falling back to memory store:', error);
      return {
        totalHits: 1,
        resetTime: new Date(Date.now() + this.windowMs),
      };
    }
  }

  /**
   * キーのカウントをデクリメント
   */
  async decrement(key: string): Promise<void> {
    const client = this.getClient();
    if (!client) return; // Redisが利用できない場合は何もしない

    const redisKey = `${this.prefix}${key}`;

    try {
      await client.decr(redisKey);
    } catch (error) {
      console.warn('Redis error during decrement:', error);
    }
  }

  /**
   * キーをリセット
   */
  async resetKey(key: string): Promise<void> {
    const client = this.getClient();
    if (!client) return; // Redisが利用できない場合は何もしない

    const redisKey = `${this.prefix}${key}`;

    try {
      await client.del(redisKey);
    } catch (error) {
      console.warn('Redis error during reset:', error);
    }
  }
}
