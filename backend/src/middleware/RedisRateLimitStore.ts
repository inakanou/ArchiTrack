import { MemoryStore, type Store, type IncrementResponse, type Options } from 'express-rate-limit';
import type { default as RedisType } from 'ioredis';

/**
 * 加算と期限の設定を原子的に行う。期限の無いキー（新規、または過去に設定を失敗して残ったもの）に
 * だけ窓の長さの期限を付けるので、窓は後の加算で延びず、期限なしのキーで恒久的に締め出されない。
 * 戻り値は `[加算後の回数, 残りのミリ秒]`
 */
const INCREMENT_SCRIPT = `
local hits = redis.call('INCR', KEYS[1])
local ttl = redis.call('PTTL', KEYS[1])
if ttl == -1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
  ttl = tonumber(ARGV[1])
end
return {hits, ttl}
`;

/** スクリプトの応答を読む。想定外の形は例外にして、呼び出し元でメモリの記録へ退避する */
function parseIncrementReply(reply: unknown): [number, number] {
  if (Array.isArray(reply) && reply.length === 2) {
    const [hits, ttl] = reply as unknown[];
    if (typeof hits === 'number' && typeof ttl === 'number') {
      return [hits, ttl];
    }
  }
  throw new Error('Unexpected reply from the rate limit script');
}

/**
 * カスタムRedis Rate Limitストア
 * express-rate-limit用のioredis互換ストア実装
 *
 * Redis が無い・操作が失敗したときは、制限を外さずプロセス内のメモリの記録へ退避する
 * （user-authentication タスク48.1、design.md の RateLimitPolicy）。
 */
export class RedisRateLimitStore implements Store {
  private clientGetter: () => RedisType | null;
  public prefix: string;
  private windowMs: number = 0;
  /** Redis を使えないときの退避先 */
  private readonly fallback = new MemoryStore();

  constructor(clientGetter: () => RedisType | null, prefix: string = 'rl:') {
    this.clientGetter = clientGetter;
    this.prefix = prefix;
  }

  /**
   * Redisクライアントを取得（遅延初期化）
   * Redisが利用できない場合はnullを返す（メモリの記録へ退避する）
   */
  private getClient(): RedisType | null {
    return this.clientGetter();
  }

  /**
   * ストアの初期化
   */
  /** メモリの記録で数える（記録は呼び出しのたびに書き換わるため写しを返す） */
  private async incrementInMemory(key: string): Promise<IncrementResponse> {
    const { totalHits, resetTime } = await this.fallback.increment(key);
    return { totalHits, resetTime };
  }

  init(options: Options): void {
    this.windowMs = options.windowMs;
    this.fallback.init(options);
  }

  /**
   * キーのカウントをインクリメント
   */
  async increment(key: string): Promise<IncrementResponse> {
    const client = this.getClient();

    // Redisが利用できない場合はメモリの記録で数える
    if (!client) {
      return this.incrementInMemory(key);
    }

    const redisKey = `${this.prefix}${key}`;

    try {
      const [totalHits, ttl] = parseIncrementReply(
        await client.eval(INCREMENT_SCRIPT, 1, redisKey, this.windowMs)
      );
      const resetTime = ttl > 0 ? new Date(Date.now() + ttl) : undefined;

      return {
        totalHits,
        resetTime,
      };
    } catch (error) {
      // Redisエラー時はメモリの記録へ退避する（制限は外さない）
      console.warn('Redis error during increment, falling back to memory store:', error);
      return this.incrementInMemory(key);
    }
  }

  /**
   * キーのカウントをデクリメント
   */
  async decrement(key: string): Promise<void> {
    const client = this.getClient();
    if (!client) {
      await this.fallback.decrement(key);
      return;
    }

    const redisKey = `${this.prefix}${key}`;

    try {
      await client.decr(redisKey);
    } catch (error) {
      console.warn('Redis error during decrement:', error);
      await this.fallback.decrement(key);
    }
  }

  /**
   * キーをリセット
   */
  async resetKey(key: string): Promise<void> {
    // 退避中に数えた分も消す
    await this.fallback.resetKey(key);

    const client = this.getClient();
    if (!client) return;

    const redisKey = `${this.prefix}${key}`;

    try {
      await client.del(redisKey);
    } catch (error) {
      console.warn('Redis error during reset:', error);
    }
  }
}
