import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Request, Response } from 'express';

// RedisRateLimitStoreのモック（clientGetterを保存して後でテスト可能にする）
const clientGetterStore: Map<string, () => unknown> = new Map();
vi.mock('../../../middleware/RedisRateLimitStore.js', () => {
  return {
    RedisRateLimitStore: class MockRedisRateLimitStore {
      clientGetter: () => unknown;
      prefix: string;
      init = vi.fn();
      increment = vi.fn();
      decrement = vi.fn();
      resetKey = vi.fn();

      constructor(clientGetter: () => unknown, prefix: string) {
        this.clientGetter = clientGetter;
        this.prefix = prefix;
        clientGetterStore.set(prefix, clientGetter);
      }
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

      // authenticate が設定する形（userId）だけを与える（id は読まない）
      const req = createMockRequest();
      req.user = { userId: 'user-123', email: 'test@example.com', roles: ['user'] };

      const key = limiter.keyGenerator(req);
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

    it('loginLimiter keyGeneratorがreq.ipからIPを取得すること', async () => {
      const { loginLimiter } = await import('../../../middleware/rateLimit.middleware.js');
      const limiter = loginLimiter as unknown as { keyGenerator: (req: Request) => string };

      const req = createMockRequest({ ip: '172.16.0.5' });
      const key = limiter.keyGenerator(req);
      expect(key).toBe('172.16.0.5');
    });

    it('loginLimiter keyGeneratorがIPなしの場合unknownを返すこと', async () => {
      const { loginLimiter } = await import('../../../middleware/rateLimit.middleware.js');
      const limiter = loginLimiter as unknown as { keyGenerator: (req: Request) => string };

      const req = createMockRequest({ ip: undefined, headers: {} });
      const key = limiter.keyGenerator(req);
      expect(key).toBe('unknown');
    });

    it('refreshLimiter keyGeneratorがreq.ipからIPを取得すること', async () => {
      const { refreshLimiter } = await import('../../../middleware/rateLimit.middleware.js');
      const limiter = refreshLimiter as unknown as { keyGenerator: (req: Request) => string };

      const req = createMockRequest({ ip: '192.168.0.1' });
      const key = limiter.keyGenerator(req);
      expect(key).toBe('192.168.0.1');
    });

    it('refreshLimiter keyGeneratorがIPなしの場合unknownを返すこと', async () => {
      const { refreshLimiter } = await import('../../../middleware/rateLimit.middleware.js');
      const limiter = refreshLimiter as unknown as { keyGenerator: (req: Request) => string };

      const req = createMockRequest({ ip: undefined, headers: {} });
      const key = limiter.keyGenerator(req);
      expect(key).toBe('unknown');
    });

    it('healthCheckLimiter keyGeneratorがreq.ipからIPを取得すること', async () => {
      const { healthCheckLimiter } = await import('../../../middleware/rateLimit.middleware.js');
      const limiter = healthCheckLimiter as unknown as { keyGenerator: (req: Request) => string };

      const req = createMockRequest({ ip: '10.0.0.200' });
      const key = limiter.keyGenerator(req);
      expect(key).toBe('10.0.0.200');
    });

    it('healthCheckLimiter keyGeneratorがIPなしの場合unknownを返すこと', async () => {
      const { healthCheckLimiter } = await import('../../../middleware/rateLimit.middleware.js');
      const limiter = healthCheckLimiter as unknown as { keyGenerator: (req: Request) => string };

      const req = createMockRequest({ ip: undefined, headers: {} });
      const key = limiter.keyGenerator(req);
      expect(key).toBe('unknown');
    });

    it('invitationLimiter keyGeneratorがIPなしの場合ip:unknownを返すこと', async () => {
      const { invitationLimiter } = await import('../../../middleware/rateLimit.middleware.js');
      const limiter = invitationLimiter as unknown as { keyGenerator: (req: Request) => string };

      const req = createMockRequest({ ip: undefined, headers: {} });
      const key = limiter.keyGenerator(req);
      expect(key).toBe('ip:unknown');
    });
    // 要件35.1: 送信元の識別は信頼する中継の段数に基づく req.ip だけを用い、
    // 利用者が指定できる X-Forwarded-For / X-Real-IP を直接読まない
    const SPOOFED_HEADERS = {
      'x-forwarded-for': '198.51.100.250, 10.0.0.1',
      'x-real-ip': '198.51.100.251',
    };

    it.each([
      ['apiLimiter', ''],
      ['loginLimiter', ''],
      ['refreshLimiter', ''],
      ['healthCheckLimiter', ''],
      ['invitationLimiter', 'ip:'],
    ] as const)(
      '%s keyGeneratorはX-Forwarded-For・X-Real-IPを読まずreq.ipで識別すること',
      async (name, prefix) => {
        const mod = await import('../../../middleware/rateLimit.middleware.js');
        const limiter = mod[name] as unknown as { keyGenerator: (req: Request) => string };

        const req = createMockRequest({ headers: SPOOFED_HEADERS, ip: '172.16.0.9' });
        expect(limiter.keyGenerator(req)).toBe(`${prefix}172.16.0.9`);

        const noIp = createMockRequest({ headers: SPOOFED_HEADERS, ip: undefined });
        expect(limiter.keyGenerator(noIp)).toBe(`${prefix}unknown`);
      }
    );
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

    // 本番では無効化の設定を無視する（user-authentication タスク48.1）
    it('本番ではDISABLE_RATE_LIMIT=trueでもスキップしないこと', async () => {
      process.env.NODE_ENV = 'production';
      process.env.DISABLE_RATE_LIMIT = 'true';
      vi.resetModules();

      const { apiLimiter } = await import('../../../middleware/rateLimit.middleware.js');
      const limiter = apiLimiter as unknown as { skip: (req: Request) => boolean };

      const req = createMockRequest({ method: 'POST' });
      expect(limiter.skip(req)).toBe(false);
    });

    it('開発ではDISABLE_RATE_LIMIT=trueの明示でスキップすること', async () => {
      process.env.NODE_ENV = 'development';
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

    it('loginLimiterがOPTIONSリクエストをスキップすること', async () => {
      const { loginLimiter } = await import('../../../middleware/rateLimit.middleware.js');
      const limiter = loginLimiter as unknown as { skip: (req: Request) => boolean };

      const req = createMockRequest({ method: 'OPTIONS' });
      expect(limiter.skip(req)).toBe(true);
    });

    it('refreshLimiterがOPTIONSリクエストをスキップすること', async () => {
      const { refreshLimiter } = await import('../../../middleware/rateLimit.middleware.js');
      const limiter = refreshLimiter as unknown as { skip: (req: Request) => boolean };

      const req = createMockRequest({ method: 'OPTIONS' });
      expect(limiter.skip(req)).toBe(true);
    });

    it('invitationLimiterがOPTIONSリクエストをスキップすること', async () => {
      const { invitationLimiter } = await import('../../../middleware/rateLimit.middleware.js');
      const limiter = invitationLimiter as unknown as { skip: (req: Request) => boolean };

      const req = createMockRequest({ method: 'OPTIONS' });
      expect(limiter.skip(req)).toBe(true);
    });

    it('loginLimiterがテスト環境でスキップすること', async () => {
      process.env.NODE_ENV = 'test';
      vi.resetModules();

      const { loginLimiter } = await import('../../../middleware/rateLimit.middleware.js');
      const limiter = loginLimiter as unknown as { skip: (req: Request) => boolean };

      const req = createMockRequest({ method: 'POST' });
      expect(limiter.skip(req)).toBe(true);
    });

    it('refreshLimiterがテスト環境でスキップすること', async () => {
      process.env.NODE_ENV = 'test';
      vi.resetModules();

      const { refreshLimiter } = await import('../../../middleware/rateLimit.middleware.js');
      const limiter = refreshLimiter as unknown as { skip: (req: Request) => boolean };

      const req = createMockRequest({ method: 'POST' });
      expect(limiter.skip(req)).toBe(true);
    });

    it('invitationLimiterがテスト環境でスキップすること', async () => {
      process.env.NODE_ENV = 'test';
      vi.resetModules();

      const { invitationLimiter } = await import('../../../middleware/rateLimit.middleware.js');
      const limiter = invitationLimiter as unknown as { skip: (req: Request) => boolean };

      const req = createMockRequest({ method: 'POST' });
      expect(limiter.skip(req)).toBe(true);
    });

    it('loginLimiterが本番ではDISABLE_RATE_LIMIT=trueでもスキップしないこと', async () => {
      process.env.NODE_ENV = 'production';
      process.env.DISABLE_RATE_LIMIT = 'true';
      vi.resetModules();

      const { loginLimiter } = await import('../../../middleware/rateLimit.middleware.js');
      const limiter = loginLimiter as unknown as { skip: (req: Request) => boolean };

      const req = createMockRequest({ method: 'POST' });
      expect(limiter.skip(req)).toBe(false);
    });

    it('refreshLimiterが本番ではDISABLE_RATE_LIMIT=trueでもスキップしないこと', async () => {
      process.env.NODE_ENV = 'production';
      process.env.DISABLE_RATE_LIMIT = 'true';
      vi.resetModules();

      const { refreshLimiter } = await import('../../../middleware/rateLimit.middleware.js');
      const limiter = refreshLimiter as unknown as { skip: (req: Request) => boolean };

      const req = createMockRequest({ method: 'POST' });
      expect(limiter.skip(req)).toBe(false);
    });

    it('invitationLimiterが本番ではDISABLE_RATE_LIMIT=trueでもスキップしないこと', async () => {
      process.env.NODE_ENV = 'production';
      process.env.DISABLE_RATE_LIMIT = 'true';
      vi.resetModules();

      const { invitationLimiter } = await import('../../../middleware/rateLimit.middleware.js');
      const limiter = invitationLimiter as unknown as { skip: (req: Request) => boolean };

      const req = createMockRequest({ method: 'POST' });
      expect(limiter.skip(req)).toBe(false);
    });

    it('loginLimiterが通常リクエストをスキップしないこと', async () => {
      process.env.NODE_ENV = 'production';
      process.env.DISABLE_RATE_LIMIT = 'false';
      vi.resetModules();

      const { loginLimiter } = await import('../../../middleware/rateLimit.middleware.js');
      const limiter = loginLimiter as unknown as { skip: (req: Request) => boolean };

      const req = createMockRequest({ method: 'POST' });
      expect(limiter.skip(req)).toBe(false);
    });

    it('refreshLimiterが通常リクエストをスキップしないこと', async () => {
      process.env.NODE_ENV = 'production';
      process.env.DISABLE_RATE_LIMIT = 'false';
      vi.resetModules();

      const { refreshLimiter } = await import('../../../middleware/rateLimit.middleware.js');
      const limiter = refreshLimiter as unknown as { skip: (req: Request) => boolean };

      const req = createMockRequest({ method: 'POST' });
      expect(limiter.skip(req)).toBe(false);
    });

    it('invitationLimiterが通常リクエストをスキップしないこと', async () => {
      process.env.NODE_ENV = 'production';
      process.env.DISABLE_RATE_LIMIT = 'false';
      vi.resetModules();

      const { invitationLimiter } = await import('../../../middleware/rateLimit.middleware.js');
      const limiter = invitationLimiter as unknown as { skip: (req: Request) => boolean };

      const req = createMockRequest({ method: 'POST' });
      expect(limiter.skip(req)).toBe(false);
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

      const req = createMockRequest();
      req.user = { userId: 'user-456', email: 'test@example.com', roles: ['user'] };
      const res = createMockResponse();

      limiter.handler(req, res);

      expect(req.log.warn).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'user-456' }),
        'Invitation rate limit exceeded'
      );
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

  describe('RedisRateLimitStore設定', () => {
    it('apiLimiterにstoreが設定されていること', async () => {
      const { apiLimiter } = await import('../../../middleware/rateLimit.middleware.js');
      const limiter = apiLimiter as unknown as { store: unknown };
      expect(limiter.store).toBeDefined();
    });

    it('loginLimiterにstoreが設定されていること', async () => {
      const { loginLimiter } = await import('../../../middleware/rateLimit.middleware.js');
      const limiter = loginLimiter as unknown as { store: unknown };
      expect(limiter.store).toBeDefined();
    });

    it('refreshLimiterにstoreが設定されていること', async () => {
      const { refreshLimiter } = await import('../../../middleware/rateLimit.middleware.js');
      const limiter = refreshLimiter as unknown as { store: unknown };
      expect(limiter.store).toBeDefined();
    });

    it('invitationLimiterにstoreが設定されていること', async () => {
      const { invitationLimiter } = await import('../../../middleware/rateLimit.middleware.js');
      const limiter = invitationLimiter as unknown as { store: unknown };
      expect(limiter.store).toBeDefined();
    });

    it('healthCheckLimiterにstoreが設定されていること', async () => {
      const { healthCheckLimiter } = await import('../../../middleware/rateLimit.middleware.js');
      const limiter = healthCheckLimiter as unknown as { store: unknown };
      expect(limiter.store).toBeDefined();
    });
  });

  describe('invitationLimiter handler追加テスト', () => {
    it('invitationLimiter handlerがユーザーなしでログを出力すること', async () => {
      const { invitationLimiter } = await import('../../../middleware/rateLimit.middleware.js');
      const limiter = invitationLimiter as unknown as {
        handler: (req: Request, res: Response) => void;
      };

      // ユーザーなしのリクエスト
      const req = createMockRequest();
      const res = createMockResponse();

      limiter.handler(req, res);

      expect(req.log.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: undefined,
          ip: '127.0.0.1',
          path: '/api/test',
        }),
        'Invitation rate limit exceeded'
      );
    });
  });

  describe('loginLimiter handler追加テスト', () => {
    it('loginLimiter handlerがログを出力すること', async () => {
      const { loginLimiter } = await import('../../../middleware/rateLimit.middleware.js');
      const limiter = loginLimiter as unknown as {
        handler: (req: Request, res: Response) => void;
      };

      const req = createMockRequest({ path: '/api/auth/login' });
      const res = createMockResponse();

      limiter.handler(req, res);

      expect(req.log.warn).toHaveBeenCalledWith(
        expect.objectContaining({ ip: '127.0.0.1', path: '/api/auth/login' }),
        'Login rate limit exceeded'
      );
    });
  });

  describe('refreshLimiter handler追加テスト', () => {
    it('refreshLimiter handlerがログを出力すること', async () => {
      const { refreshLimiter } = await import('../../../middleware/rateLimit.middleware.js');
      const limiter = refreshLimiter as unknown as {
        handler: (req: Request, res: Response) => void;
      };

      const req = createMockRequest({ path: '/api/auth/refresh' });
      const res = createMockResponse();

      limiter.handler(req, res);

      expect(req.log.warn).toHaveBeenCalledWith(
        expect.objectContaining({ ip: '127.0.0.1', path: '/api/auth/refresh' }),
        'Token refresh rate limit exceeded'
      );
    });
  });

  describe('clientGetter callbacks', () => {
    it('apiLimiter clientGetterがredis.getClient()を呼び出すこと', async () => {
      // モジュールをインポートしてclientGetterを登録させる
      await import('../../../middleware/rateLimit.middleware.js');

      const clientGetter = clientGetterStore.get('rl:api:');
      expect(clientGetter).toBeDefined();

      // clientGetterを呼び出す（これで関数カバレッジが向上）
      const result = clientGetter!();
      expect(result).toBeNull(); // モックは null を返す
    });

    it('loginLimiter clientGetterがredis.getClient()を呼び出すこと', async () => {
      await import('../../../middleware/rateLimit.middleware.js');

      const clientGetter = clientGetterStore.get('rl:login:');
      expect(clientGetter).toBeDefined();

      const result = clientGetter!();
      expect(result).toBeNull();
    });

    it('refreshLimiter clientGetterがredis.getClient()を呼び出すこと', async () => {
      await import('../../../middleware/rateLimit.middleware.js');

      const clientGetter = clientGetterStore.get('rl:refresh:');
      expect(clientGetter).toBeDefined();

      const result = clientGetter!();
      expect(result).toBeNull();
    });

    it('invitationLimiter clientGetterがredis.getClient()を呼び出すこと', async () => {
      await import('../../../middleware/rateLimit.middleware.js');

      const clientGetter = clientGetterStore.get('rl:invitation:');
      expect(clientGetter).toBeDefined();

      const result = clientGetter!();
      expect(result).toBeNull();
    });

    it('healthCheckLimiter clientGetterがredis.getClient()を呼び出すこと', async () => {
      await import('../../../middleware/rateLimit.middleware.js');

      const clientGetter = clientGetterStore.get('rl:health:');
      expect(clientGetter).toBeDefined();

      const result = clientGetter!();
      expect(result).toBeNull();
    });
  });
});
