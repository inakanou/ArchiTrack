import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Request, Response } from 'express';

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

// モックリクエスト作成ヘルパー
const createMockRequest = (overrides: Partial<Request> = {}): Request =>
  ({
    method: 'GET',
    headers: {},
    ip: '127.0.0.1',
    path: '/api/test',
    log: {
      warn: vi.fn(),
    },
    ...overrides,
  }) as unknown as Request;

// モックレスポンス作成ヘルパー
const createMockResponse = (): Response => {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    getHeader: vi.fn().mockReturnValue('60'),
  } as unknown as Response;
  return res;
};

describe('rateLimit middleware', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('エクスポート確認', () => {
    it('apiLimiterがエクスポートされていること', async () => {
      const { apiLimiter } = await import('../../../middleware/rateLimit.middleware.js');
      expect(apiLimiter).toBeDefined();
      expect(typeof apiLimiter).toBe('function');
    });

    it('loginLimiterがエクスポートされていること', async () => {
      const { loginLimiter } = await import('../../../middleware/rateLimit.middleware.js');
      expect(loginLimiter).toBeDefined();
      expect(typeof loginLimiter).toBe('function');
    });

    it('refreshLimiterがエクスポートされていること', async () => {
      const { refreshLimiter } = await import('../../../middleware/rateLimit.middleware.js');
      expect(refreshLimiter).toBeDefined();
      expect(typeof refreshLimiter).toBe('function');
    });

    it('invitationLimiterがエクスポートされていること', async () => {
      const { invitationLimiter } = await import('../../../middleware/rateLimit.middleware.js');
      expect(invitationLimiter).toBeDefined();
      expect(typeof invitationLimiter).toBe('function');
    });

    it('healthCheckLimiterがエクスポートされていること', async () => {
      const { healthCheckLimiter } = await import('../../../middleware/rateLimit.middleware.js');
      expect(healthCheckLimiter).toBeDefined();
      expect(typeof healthCheckLimiter).toBe('function');
    });
  });

  describe('keyGenerator', () => {
    it('x-forwarded-forヘッダーからIPを取得すること', async () => {
      const { apiLimiter } = await import('../../../middleware/rateLimit.middleware.js');
      const limiter = apiLimiter as unknown as { keyGenerator: (req: Request) => string };

      const req = createMockRequest({
        headers: { 'x-forwarded-for': '192.168.1.100, 10.0.0.1' },
      });

      const key = limiter.keyGenerator(req);
      expect(key).toBe('192.168.1.100');
    });

    it('x-real-ipヘッダーからIPを取得すること', async () => {
      const { apiLimiter } = await import('../../../middleware/rateLimit.middleware.js');
      const limiter = apiLimiter as unknown as { keyGenerator: (req: Request) => string };

      const req = createMockRequest({
        headers: { 'x-real-ip': '10.0.0.50' },
      });

      const key = limiter.keyGenerator(req);
      expect(key).toBe('10.0.0.50');
    });

    it('req.ipからIPを取得すること', async () => {
      const { apiLimiter } = await import('../../../middleware/rateLimit.middleware.js');
      const limiter = apiLimiter as unknown as { keyGenerator: (req: Request) => string };

      const req = createMockRequest({
        ip: '172.16.0.1',
      });

      const key = limiter.keyGenerator(req);
      expect(key).toBe('172.16.0.1');
    });

    it('IPが取得できない場合はunknownを返すこと', async () => {
      const { apiLimiter } = await import('../../../middleware/rateLimit.middleware.js');
      const limiter = apiLimiter as unknown as { keyGenerator: (req: Request) => string };

      const req = createMockRequest({
        ip: undefined,
        headers: {},
      });

      const key = limiter.keyGenerator(req);
      expect(key).toBe('unknown');
    });

    it('invitationLimiterはユーザーIDベースでキーを生成すること', async () => {
      const { invitationLimiter } = await import('../../../middleware/rateLimit.middleware.js');
      const limiter = invitationLimiter as unknown as { keyGenerator: (req: Request) => string };

      const req = createMockRequest() as Request & {
        user?: { id: string; userId: string; email: string; roles: string[] };
      };
      req.user = { id: 'user-123', userId: 'user-123', email: 'test@example.com', roles: ['user'] };

      const key = limiter.keyGenerator(req as Request);
      expect(key).toBe('user:user-123');
    });

    it('invitationLimiterはユーザーがいない場合IPベースでキーを生成すること', async () => {
      const { invitationLimiter } = await import('../../../middleware/rateLimit.middleware.js');
      const limiter = invitationLimiter as unknown as { keyGenerator: (req: Request) => string };

      const req = createMockRequest({
        ip: '192.168.1.1',
      });

      const key = limiter.keyGenerator(req);
      expect(key).toBe('ip:192.168.1.1');
    });
  });

  describe('skip', () => {
    it('OPTIONSリクエストをスキップすること', async () => {
      const { apiLimiter } = await import('../../../middleware/rateLimit.middleware.js');
      const limiter = apiLimiter as unknown as { skip: (req: Request) => boolean };

      const req = createMockRequest({ method: 'OPTIONS' });
      expect(limiter.skip(req)).toBe(true);
    });

    it('test環境をスキップすること', async () => {
      process.env.NODE_ENV = 'test';
      vi.resetModules();

      const { apiLimiter } = await import('../../../middleware/rateLimit.middleware.js');
      const limiter = apiLimiter as unknown as { skip: (req: Request) => boolean };

      const req = createMockRequest({ method: 'POST' });
      expect(limiter.skip(req)).toBe(true);
    });

    it('DISABLE_RATE_LIMIT=trueの場合スキップすること', async () => {
      process.env.NODE_ENV = 'production';
      process.env.DISABLE_RATE_LIMIT = 'true';
      vi.resetModules();

      const { apiLimiter } = await import('../../../middleware/rateLimit.middleware.js');
      const limiter = apiLimiter as unknown as { skip: (req: Request) => boolean };

      const req = createMockRequest({ method: 'POST' });
      expect(limiter.skip(req)).toBe(true);
    });

    it('通常のリクエストはスキップしないこと', async () => {
      process.env.NODE_ENV = 'production';
      process.env.DISABLE_RATE_LIMIT = 'false';
      vi.resetModules();

      const { apiLimiter } = await import('../../../middleware/rateLimit.middleware.js');
      const limiter = apiLimiter as unknown as { skip: (req: Request) => boolean };

      const req = createMockRequest({ method: 'POST' });
      expect(limiter.skip(req)).toBe(false);
    });

    it('healthCheckLimiterにはskipが設定されていないこと', async () => {
      const { healthCheckLimiter } = await import('../../../middleware/rateLimit.middleware.js');
      const limiter = healthCheckLimiter as unknown as { skip?: (req: Request) => boolean };

      expect(limiter.skip).toBeUndefined();
    });
  });

  describe('handler', () => {
    it('apiLimiter handlerが429レスポンスを返すこと', async () => {
      const { apiLimiter } = await import('../../../middleware/rateLimit.middleware.js');
      const limiter = apiLimiter as unknown as {
        handler: (req: Request, res: Response) => void;
      };

      const req = createMockRequest();
      const res = createMockResponse();

      limiter.handler(req, res);

      expect(res.status).toHaveBeenCalledWith(429);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Too many requests from this IP, please try again later.',
        retryAfter: '60',
      });
    });

    it('loginLimiter handlerが429レスポンスを返すこと', async () => {
      const { loginLimiter } = await import('../../../middleware/rateLimit.middleware.js');
      const limiter = loginLimiter as unknown as {
        handler: (req: Request, res: Response) => void;
      };

      const req = createMockRequest();
      const res = createMockResponse();

      limiter.handler(req, res);

      expect(res.status).toHaveBeenCalledWith(429);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Too many login attempts, please try again later.',
        retryAfter: '60',
      });
    });

    it('refreshLimiter handlerが429レスポンスを返すこと', async () => {
      const { refreshLimiter } = await import('../../../middleware/rateLimit.middleware.js');
      const limiter = refreshLimiter as unknown as {
        handler: (req: Request, res: Response) => void;
      };

      const req = createMockRequest();
      const res = createMockResponse();

      limiter.handler(req, res);

      expect(res.status).toHaveBeenCalledWith(429);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Too many token refresh attempts, please try again later.',
        retryAfter: '60',
      });
    });

    it('invitationLimiter handlerが429レスポンスを返すこと', async () => {
      const { invitationLimiter } = await import('../../../middleware/rateLimit.middleware.js');
      const limiter = invitationLimiter as unknown as {
        handler: (req: Request, res: Response) => void;
      };

      const req = createMockRequest() as Request & {
        user?: { id: string; userId: string; email: string; roles: string[] };
      };
      req.user = { id: 'user-456', userId: 'user-456', email: 'test@example.com', roles: ['user'] };
      const res = createMockResponse();

      limiter.handler(req as Request, res);

      expect(res.status).toHaveBeenCalledWith(429);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Too many invitation requests, please try again later.',
        retryAfter: '60',
      });
    });

    it('handlerがログを出力すること', async () => {
      const { apiLimiter } = await import('../../../middleware/rateLimit.middleware.js');
      const limiter = apiLimiter as unknown as {
        handler: (req: Request, res: Response) => void;
      };

      const req = createMockRequest();
      const res = createMockResponse();

      limiter.handler(req, res);

      expect(req.log.warn).toHaveBeenCalledWith(
        expect.objectContaining({ ip: '127.0.0.1', path: '/api/test' }),
        'Rate limit exceeded'
      );
    });
  });

  describe('設定値', () => {
    it('apiLimiterの設定が正しいこと', async () => {
      const { apiLimiter } = await import('../../../middleware/rateLimit.middleware.js');
      const limiter = apiLimiter as unknown as { windowMs: number; max: number };

      expect(limiter.windowMs).toBe(15 * 60 * 1000);
      expect(limiter.max).toBe(100);
    });

    it('loginLimiterの設定が正しいこと', async () => {
      const { loginLimiter } = await import('../../../middleware/rateLimit.middleware.js');
      const limiter = loginLimiter as unknown as { windowMs: number; max: number };

      expect(limiter.windowMs).toBe(1 * 60 * 1000);
      expect(limiter.max).toBe(10);
    });

    it('refreshLimiterの設定が正しいこと', async () => {
      const { refreshLimiter } = await import('../../../middleware/rateLimit.middleware.js');
      const limiter = refreshLimiter as unknown as { windowMs: number; max: number };

      expect(limiter.windowMs).toBe(1 * 60 * 1000);
      expect(limiter.max).toBe(20);
    });

    it('invitationLimiterの設定が正しいこと', async () => {
      const { invitationLimiter } = await import('../../../middleware/rateLimit.middleware.js');
      const limiter = invitationLimiter as unknown as { windowMs: number; max: number };

      expect(limiter.windowMs).toBe(1 * 60 * 1000);
      expect(limiter.max).toBe(5);
    });

    it('healthCheckLimiterの設定が正しいこと', async () => {
      const { healthCheckLimiter } = await import('../../../middleware/rateLimit.middleware.js');
      const limiter = healthCheckLimiter as unknown as { windowMs: number; max: number };

      expect(limiter.windowMs).toBe(1 * 60 * 1000);
      expect(limiter.max).toBe(60);
    });
  });
});
