import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RedisRateLimitStore } from '../../../middleware/RedisRateLimitStore.js';
import type Redis from 'ioredis';
import type { Options } from 'express-rate-limit';

describe('RedisRateLimitStore', () => {
  let mockRedisClient: Partial<Redis>;
  let store: RedisRateLimitStore;
  let clientGetter: () => Redis | null;

  beforeEach(() => {
    mockRedisClient = {
      eval: vi.fn(),
      decr: vi.fn(),
      del: vi.fn(),
    };

    clientGetter = vi.fn(() => mockRedisClient as Redis);
    store = new RedisRateLimitStore(clientGetter, 'test:');
  });

  describe('init', () => {
    it('オプションからwindowMsを設定すること', () => {
      const options: Partial<Options> = {
        windowMs: 60000,
        max: 100,
        standardHeaders: true,
        legacyHeaders: false,
      };

      store.init(options as Options);

      // windowMsが内部的に設定されていることを確認
      expect(store['windowMs']).toBe(60000);
    });
  });

  describe('increment', () => {
    beforeEach(() => {
      store.init({
        windowMs: 60000,
        max: 100,
        standardHeaders: true,
        legacyHeaders: false,
      } as Options);
    });

    // キャッシュ基盤が無いときは制限を外さずメモリの記録へ退避する（user-authentication タスク48.1）
    it('Redisが利用できない場合、メモリの記録で数え続けること', async () => {
      clientGetter = vi.fn(() => null);
      store = new RedisRateLimitStore(clientGetter, 'test:');
      store.init({
        windowMs: 60000,
        max: 100,
        standardHeaders: true,
        legacyHeaders: false,
      } as Options);

      const first = await store.increment('test-key');
      const second = await store.increment('test-key');
      const third = await store.increment('test-key');
      const other = await store.increment('other-key');

      expect([first.totalHits, second.totalHits, third.totalHits]).toEqual([1, 2, 3]);
      expect(first.resetTime).toBeInstanceOf(Date);
      expect(other.totalHits).toBe(1);
    });

    it('加算と期限の設定を 1 回のスクリプトで行い、回数と期限を返すこと', async () => {
      vi.mocked(mockRedisClient.eval!).mockResolvedValue([1, 60000]);

      const result = await store.increment('test-key');

      expect(mockRedisClient.eval).toHaveBeenCalledTimes(1);
      expect(mockRedisClient.eval).toHaveBeenCalledWith(
        expect.stringContaining('PEXPIRE'),
        1,
        'test:test-key',
        60000
      );
      expect(result.totalHits).toBe(1);
      expect(result.resetTime).toBeInstanceOf(Date);
    });

    it('2回目以降の回数をそのまま返すこと', async () => {
      vi.mocked(mockRedisClient.eval!).mockResolvedValue([2, 50000]);

      const result = await store.increment('test-key');

      expect(result.totalHits).toBe(2);
      expect(result.resetTime!.getTime()).toBeLessThanOrEqual(Date.now() + 50000);
    });

    it('TTLが0以下の場合、resetTimeをundefinedにすること', async () => {
      vi.mocked(mockRedisClient.eval!).mockResolvedValue([1, 0]);

      const result = await store.increment('test-key');

      expect(result.resetTime).toBeUndefined();
    });

    it.each([[null], ['1'], [[1]], [['1', 60000]], [[1, '60000']]])(
      'スクリプトの応答が想定外（%j）ならメモリの記録へ退避すること',
      async (reply) => {
        vi.mocked(mockRedisClient.eval!).mockResolvedValue(reply);
        const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

        const result = await store.increment('test-key');

        expect(result.totalHits).toBe(1);
        expect(result.resetTime).toBeInstanceOf(Date);
        expect(consoleWarnSpy).toHaveBeenCalledWith(
          'Redis error during increment, falling back to memory store:',
          expect.any(Error)
        );
        consoleWarnSpy.mockRestore();
      }
    );

    it('Redisエラー時にメモリの記録へ退避して数え続けること', async () => {
      vi.mocked(mockRedisClient.eval!).mockRejectedValue(new Error('Redis connection error'));

      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const result = await store.increment('test-key');
      const again = await store.increment('test-key');

      expect(result.totalHits).toBe(1);
      expect(result.resetTime).toBeInstanceOf(Date);
      expect(again.totalHits).toBe(2);
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'Redis error during increment, falling back to memory store:',
        expect.any(Error)
      );

      consoleWarnSpy.mockRestore();
    });
  });

  describe('decrement', () => {
    it('Redisが利用できない場合、Redisを呼ばずメモリの記録を減らすこと', async () => {
      clientGetter = vi.fn(() => null);
      store = new RedisRateLimitStore(clientGetter, 'test:');
      store.init({ windowMs: 60000 } as Options);
      await store.increment('test-key');
      await store.increment('test-key');

      await store.decrement('test-key');

      expect(mockRedisClient.decr).not.toHaveBeenCalled();
      expect((await store.increment('test-key')).totalHits).toBe(2);
    });

    it('カウントをデクリメントすること', async () => {
      vi.mocked(mockRedisClient.decr!).mockResolvedValue(1);

      await store.decrement('test-key');

      expect(mockRedisClient.decr).toHaveBeenCalledWith('test:test-key');
    });

    it('Redisエラー時に警告を出力すること', async () => {
      vi.mocked(mockRedisClient.decr!).mockRejectedValue(new Error('Redis error'));

      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      await store.decrement('test-key');

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'Redis error during decrement:',
        expect.any(Error)
      );

      consoleWarnSpy.mockRestore();
    });
  });

  describe('resetKey', () => {
    it('Redisが利用できない場合、Redisを呼ばずメモリの記録を消すこと', async () => {
      clientGetter = vi.fn(() => null);
      store = new RedisRateLimitStore(clientGetter, 'test:');
      store.init({ windowMs: 60000 } as Options);
      await store.increment('test-key');
      await store.increment('test-key');

      await store.resetKey('test-key');

      expect(mockRedisClient.del).not.toHaveBeenCalled();
      expect((await store.increment('test-key')).totalHits).toBe(1);
    });

    it('キーを削除すること', async () => {
      vi.mocked(mockRedisClient.del!).mockResolvedValue(1);

      await store.resetKey('test-key');

      expect(mockRedisClient.del).toHaveBeenCalledWith('test:test-key');
    });

    it('Redisエラー時に警告を出力すること', async () => {
      vi.mocked(mockRedisClient.del!).mockRejectedValue(new Error('Redis error'));

      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      await store.resetKey('test-key');

      expect(consoleWarnSpy).toHaveBeenCalledWith('Redis error during reset:', expect.any(Error));

      consoleWarnSpy.mockRestore();
    });
  });

  describe('prefix', () => {
    it('デフォルトのprefixが設定されること', () => {
      const defaultStore = new RedisRateLimitStore(clientGetter);
      expect(defaultStore.prefix).toBe('rl:');
    });

    it('カスタムprefixが設定されること', () => {
      const customStore = new RedisRateLimitStore(clientGetter, 'custom:');
      expect(customStore.prefix).toBe('custom:');
    });
  });
});
