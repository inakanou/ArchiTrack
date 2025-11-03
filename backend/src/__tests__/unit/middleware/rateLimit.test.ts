import { describe, it, expect, vi } from 'vitest';

// RedisRateLimitStoreのモック
vi.mock('../../../middleware/RedisRateLimitStore.js', () => {
  return {
    RedisRateLimitStore: class MockRedisRateLimitStore {
      init = vi.fn();
      increment = vi.fn();
      decrement = vi.fn();
      resetKey = vi.fn();
      prefix = 'rl:';
    },
  };
});

// redisモジュールのモック
vi.mock('../../../redis.js', () => ({
  default: {
    getClient: vi.fn(() => null),
  },
}));

// express-rate-limitのモック
vi.mock('express-rate-limit', () => ({
  default: vi.fn((config) => {
    // ミドルウェア関数を返す
    const middleware = (_req: unknown, _res: unknown, next: () => void) => next();
    // 設定をミドルウェアにコピー
    return Object.assign(middleware, config);
  }),
  ipKeyGenerator: vi.fn((ip) => ip),
}));

describe('rateLimit middleware', () => {
  it('apiLimiterがエクスポートされていること', async () => {
    const { apiLimiter } = await import('../../../middleware/rateLimit.middleware.js');
    expect(apiLimiter).toBeDefined();
    expect(typeof apiLimiter).toBe('function');
  });

  it('authLimiterがエクスポートされていること', async () => {
    const { authLimiter } = await import('../../../middleware/rateLimit.middleware.js');
    expect(authLimiter).toBeDefined();
    expect(typeof authLimiter).toBe('function');
  });

  it('healthCheckLimiterがエクスポートされていること', async () => {
    const { healthCheckLimiter } = await import('../../../middleware/rateLimit.middleware.js');
    expect(healthCheckLimiter).toBeDefined();
    expect(typeof healthCheckLimiter).toBe('function');
  });
});
