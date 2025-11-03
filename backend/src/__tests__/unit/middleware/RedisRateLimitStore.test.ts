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
      incr: vi.fn(),
      pexpire: vi.fn(),
      pttl: vi.fn(),
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

    it('Redisが利用できない場合、デフォルト値を返すこと', async () => {
      clientGetter = vi.fn(() => null);
      store = new RedisRateLimitStore(clientGetter, 'test:');
      store.init({
        windowMs: 60000,
        max: 100,
        standardHeaders: true,
        legacyHeaders: false,
      } as Options);

      const result = await store.increment('test-key');

      expect(result.totalHits).toBe(1);
      expect(result.resetTime).toBeInstanceOf(Date);
    });

    it('初回アクセス時にカウントをインクリメントしてTTLを設定すること', async () => {
      vi.mocked(mockRedisClient.incr!).mockResolvedValue(1);
      vi.mocked(mockRedisClient.pttl!).mockResolvedValue(60000);

      const result = await store.increment('test-key');

      expect(mockRedisClient.incr).toHaveBeenCalledWith('test:test-key');
      expect(mockRedisClient.pexpire).toHaveBeenCalledWith('test:test-key', 60000);
      expect(mockRedisClient.pttl).toHaveBeenCalledWith('test:test-key');
      expect(result.totalHits).toBe(1);
      expect(result.resetTime).toBeInstanceOf(Date);
    });

    it('2回目以降のアクセスではTTLを設定しないこと', async () => {
      vi.mocked(mockRedisClient.incr!).mockResolvedValue(2);
      vi.mocked(mockRedisClient.pttl!).mockResolvedValue(50000);

      const result = await store.increment('test-key');

      expect(mockRedisClient.incr).toHaveBeenCalledWith('test:test-key');
      expect(mockRedisClient.pexpire).not.toHaveBeenCalled();
      expect(result.totalHits).toBe(2);
    });

    it('TTLが0以下の場合、resetTimeをundefinedにすること', async () => {
      vi.mocked(mockRedisClient.incr!).mockResolvedValue(1);
      vi.mocked(mockRedisClient.pttl!).mockResolvedValue(-1);

      const result = await store.increment('test-key');

      expect(result.resetTime).toBeUndefined();
    });

    it('Redisエラー時にフォールバック値を返すこと', async () => {
      vi.mocked(mockRedisClient.incr!).mockRejectedValue(new Error('Redis connection error'));

      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const result = await store.increment('test-key');

      expect(result.totalHits).toBe(1);
      expect(result.resetTime).toBeInstanceOf(Date);
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'Redis error during increment, falling back to memory store:',
        expect.any(Error)
      );

      consoleWarnSpy.mockRestore();
    });
  });

  describe('decrement', () => {
    it('Redisが利用できない場合、何もしないこと', async () => {
      clientGetter = vi.fn(() => null);
      store = new RedisRateLimitStore(clientGetter, 'test:');

      await store.decrement('test-key');

      expect(mockRedisClient.decr).not.toHaveBeenCalled();
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
    it('Redisが利用できない場合、何もしないこと', async () => {
      clientGetter = vi.fn(() => null);
      store = new RedisRateLimitStore(clientGetter, 'test:');

      await store.resetKey('test-key');

      expect(mockRedisClient.del).not.toHaveBeenCalled();
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
