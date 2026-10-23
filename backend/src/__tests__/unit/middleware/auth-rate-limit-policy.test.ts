import { describe, it, expect, vi } from 'vitest';
import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';
import type Redis from 'ioredis';
import { createRuntimeMode, type RuntimeMode } from '../../../config/runtime-mode.js';
import {
  AUTH_RATE_LIMITS,
  createRateLimiters,
  mountAuthRateLimitPolicy,
  type RateLimiterDependencies,
} from '../../../middleware/rateLimit.middleware.js';
import { PASSWORD_RESET_REQUEST_ACCEPTED_RESPONSE } from '../../../config/security.constants.js';

/**
 * 認証系の専用の制限（user-authentication タスク48.1、design.md の RateLimitPolicy）
 *
 * 実際の express-rate-limit とストアで組み立てた制限を、本番の経路と同じパスへ掛けて確かめる。
 * 実行環境の判定とキャッシュ基盤の接続は組み立ての引数で与える。
 */

// 既定の制限の組み立てが実際の Redis へ接続しないようにする
vi.mock('../../../redis.js', () => ({
  default: {
    getClient: vi.fn(() => null),
  },
}));

type Method = 'get' | 'post';
type Route = readonly [Method, string];

interface LimitCase {
  name: 'twoFactorVerify' | 'passwordReset' | 'registration';
  limit: number;
  routes: readonly Route[];
}

const LIMIT_CASES: readonly LimitCase[] = [
  {
    name: 'twoFactorVerify',
    limit: AUTH_RATE_LIMITS.TWO_FACTOR_VERIFY.limit,
    routes: [
      ['post', '/api/v1/auth/verify-2fa'],
      ['post', '/api/v1/auth/verify-2fa/backup'],
    ],
  },
  {
    name: 'passwordReset',
    limit: AUTH_RATE_LIMITS.PASSWORD_RESET.limit,
    routes: [
      ['post', '/api/v1/auth/password/reset'],
      ['post', '/api/v1/auth/password/verify-reset'],
    ],
  },
  {
    name: 'registration',
    limit: AUTH_RATE_LIMITS.REGISTRATION.limit,
    routes: [
      ['post', '/api/v1/auth/register'],
      ['post', '/api/v1/invitations/verify'],
    ],
  },
];

const production = (extra: NodeJS.ProcessEnv = {}): RuntimeMode =>
  createRuntimeMode({ NODE_ENV: 'production', ...extra });

/** 全ての操作が失敗するキャッシュ基盤の接続 */
function failingRedis(): Redis {
  const fail = vi.fn().mockRejectedValue(new Error('Redis connection lost'));
  return { incr: fail, pexpire: fail, pttl: fail, decr: fail, del: fail } as unknown as Redis;
}

/**
 * 制限の方針を掛けたアプリ（制限の後ろは本物の経路の代わりに 200 を返す）
 */
function buildApp(deps: RateLimiterDependencies, trustProxyHops = 0): Express {
  const app = express();
  app.set('trust proxy', trustProxyHops);
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    req.log = { warn: vi.fn() } as unknown as Request['log'];
    next();
  });
  mountAuthRateLimitPolicy(app, createRateLimiters(deps));
  app.use((_req: Request, res: Response) => {
    res.status(200).json({ ok: true });
  });
  return app;
}

function send(app: Express, [method, path]: Route, forwardedFor?: string) {
  const req = method === 'get' ? request(app).get(path) : request(app).post(path).send({});
  return forwardedFor === undefined ? req : req.set('X-Forwarded-For', forwardedFor);
}

/** 上限まで送り、各応答の状態を返す（対象の経路を交互に使う） */
async function exhaust(app: Express, limitCase: LimitCase, forwardedFor?: string) {
  const statuses: number[] = [];
  for (let i = 0; i < limitCase.limit; i++) {
    const route = limitCase.routes[i % limitCase.routes.length]!;
    statuses.push((await send(app, route, forwardedFor)).status);
  }
  return statuses;
}

describe('認証系の専用の制限（RateLimitPolicy）', () => {
  describe('上限の超過', () => {
    it.each(LIMIT_CASES)(
      '$name は同じ送信元からの上限の超過で対象の全経路が 429 になる',
      async (limitCase) => {
        const app = buildApp({ runtimeMode: production(), getRedisClient: () => null });

        const statuses = await exhaust(app, limitCase);
        expect(statuses).toEqual(Array(limitCase.limit).fill(200));

        for (const route of limitCase.routes) {
          const res = await send(app, route);
          expect(res.status).toBe(429);
          expect(res.body).toEqual({
            error: expect.stringMatching(/^Too many /),
            retryAfter: expect.any(String),
          });
          expect(res.headers['ratelimit-limit']).toBe(String(limitCase.limit));
        }
      }
    );

    it('制限ごとに数を分けて数える（2FA の検証の超過がリセット・登録を止めない）', async () => {
      const app = buildApp({ runtimeMode: production(), getRedisClient: () => null });
      const [twoFactor, passwordReset, registration] = LIMIT_CASES as [
        LimitCase,
        LimitCase,
        LimitCase,
      ];

      await exhaust(app, twoFactor);
      expect((await send(app, twoFactor.routes[0]!)).status).toBe(429);

      expect((await send(app, passwordReset.routes[0]!)).status).toBe(200);
      expect((await send(app, registration.routes[1]!)).status).toBe(200);
    });

    it('送信元ごとに数える（別の送信元は止めない）', async () => {
      // 中継 1 段を信頼する構成で、中継が付けた送信元を変える
      const app = buildApp({ runtimeMode: production(), getRedisClient: () => null }, 1);
      const twoFactor = LIMIT_CASES[0]!;

      await exhaust(app, twoFactor, '203.0.113.10');
      expect((await send(app, twoFactor.routes[0]!, '203.0.113.10')).status).toBe(429);
      expect((await send(app, twoFactor.routes[0]!, '203.0.113.11')).status).toBe(200);
    });

    it('上限の対象外の経路は制限しない', async () => {
      const app = buildApp({ runtimeMode: production(), getRedisClient: () => null });

      for (let i = 0; i < AUTH_RATE_LIMITS.TWO_FACTOR_VERIFY.limit + 1; i++) {
        expect((await request(app).post('/api/v1/auth/2fa/setup').send({})).status).toBe(200);
      }
    });
  });

  describe('無効化の設定', () => {
    it.each(LIMIT_CASES)(
      '$name は本番の設定では DISABLE_RATE_LIMIT=true でも 429 になり、無効化の変数を読まない',
      async (limitCase) => {
        const read: string[] = [];
        const env = new Proxy<NodeJS.ProcessEnv>(
          { NODE_ENV: 'production', DISABLE_RATE_LIMIT: 'true' },
          {
            get(target, name) {
              if (typeof name === 'string') {
                read.push(name);
              }
              return target[name as string];
            },
          }
        );
        const app = buildApp({ runtimeMode: createRuntimeMode(env), getRedisClient: () => null });

        await exhaust(app, limitCase);
        expect((await send(app, limitCase.routes[0]!)).status).toBe(429);
        expect(read).toContain('NODE_ENV');
        expect(read).not.toContain('DISABLE_RATE_LIMIT');
      }
    );

    it('本番の設定ではログインの制限も DISABLE_RATE_LIMIT=true で外れない', async () => {
      const limiters = createRateLimiters({
        runtimeMode: production({ DISABLE_RATE_LIMIT: 'true' }),
        getRedisClient: () => null,
      });
      const app = express();
      app.use((req: Request, _res: Response, next: NextFunction) => {
        req.log = { warn: vi.fn() } as unknown as Request['log'];
        next();
      });
      app.post('/api/v1/auth/login', limiters.login, (_req: Request, res: Response) => {
        res.status(200).json({ ok: true });
      });

      const statuses: number[] = [];
      for (let i = 0; i < 11; i++) {
        statuses.push((await request(app).post('/api/v1/auth/login').send({})).status);
      }
      expect(statuses.slice(0, 10)).toEqual(Array(10).fill(200));
      expect(statuses[10]).toBe(429);
    });

    it.each([
      ['試験の明示（NODE_ENV=test）', { NODE_ENV: 'test' }],
      [
        '開発での明示（DISABLE_RATE_LIMIT=true）',
        { NODE_ENV: 'development', DISABLE_RATE_LIMIT: 'true' },
      ],
    ] as const)('%s では上限を超えても制限しない', async (_label, env) => {
      const app = buildApp({
        runtimeMode: createRuntimeMode({ ...env }),
        getRedisClient: () => null,
      });

      for (const limitCase of LIMIT_CASES) {
        const statuses = await exhaust(app, { ...limitCase, limit: limitCase.limit + 2 });
        expect(statuses).toEqual(Array(limitCase.limit + 2).fill(200));
      }
    });

    it.each([
      ['開発で無効化の明示が無いとき', { NODE_ENV: 'development' }],
      ['実行環境の指定が無いとき', { DISABLE_RATE_LIMIT: 'true' }],
    ] as const)('%s は制限する', async (_label, env) => {
      const app = buildApp({
        runtimeMode: createRuntimeMode({ ...env }),
        getRedisClient: () => null,
      });
      const twoFactor = LIMIT_CASES[0]!;

      await exhaust(app, twoFactor);
      expect((await send(app, twoFactor.routes[1]!)).status).toBe(429);
    });
  });

  describe('キャッシュ基盤の障害', () => {
    it.each(LIMIT_CASES)(
      '$name は Redis の操作が失敗してもメモリの記録へ退避して 429 になる',
      async (limitCase) => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        try {
          const redis = failingRedis();
          const app = buildApp({ runtimeMode: production(), getRedisClient: () => redis });

          const statuses = await exhaust(app, limitCase);
          expect(statuses).toEqual(Array(limitCase.limit).fill(200));
          expect((await send(app, limitCase.routes[1]!)).status).toBe(429);
          expect(redis.incr).toHaveBeenCalled();
        } finally {
          warn.mockRestore();
        }
      }
    );

    it('途中で Redis が失われても制限を続ける', async () => {
      const healthy = new Map<string, number>();
      const redis = {
        incr: vi.fn(async (key: string) => {
          const next = (healthy.get(key) ?? 0) + 1;
          healthy.set(key, next);
          return next;
        }),
        pexpire: vi.fn().mockResolvedValue(1),
        pttl: vi.fn().mockResolvedValue(60_000),
      } as unknown as Redis;
      let available = true;
      const app = buildApp({
        runtimeMode: production(),
        getRedisClient: () => (available ? redis : null),
      });
      const registration = LIMIT_CASES[2]!;

      await exhaust(app, { ...registration, limit: 3 });
      available = false;

      const statuses = await exhaust(app, registration);
      expect(statuses).toEqual(Array(registration.limit).fill(200));
      expect((await send(app, registration.routes[0]!)).status).toBe(429);
    });
  });

  describe('パスワードリセットの要求（タスク48.2）', () => {
    const RESET_REQUEST = '/api/v1/auth/password/reset-request';
    const LIMIT = AUTH_RATE_LIMITS.PASSWORD_RESET_REQUEST.limit;

    function resetRequest(app: Express, email: unknown, forwardedFor?: string) {
      const req = request(app).post(RESET_REQUEST).send({ email });
      return forwardedFor === undefined ? req : req.set('X-Forwarded-For', forwardedFor);
    }

    it('時間窓は 1 時間、上限は送信元・メールアドレスのそれぞれで 5 回', () => {
      expect(AUTH_RATE_LIMITS.PASSWORD_RESET_REQUEST).toEqual({
        windowMs: 60 * 60 * 1000,
        limit: 5,
      });
    });

    /**
     * @requirement user-authentication/REQ-35.4
     */
    it('同じ送信元からの上限の超過は、メールアドレスを変えても 429 になる', async () => {
      const app = buildApp({ runtimeMode: production(), getRedisClient: () => null });

      for (let i = 0; i < LIMIT; i++) {
        expect((await resetRequest(app, `ip-${i}@example.com`)).status).toBe(200);
      }
      const res = await resetRequest(app, 'ip-next@example.com');
      expect(res.status).toBe(429);
      expect(res.body).toEqual({
        error: 'Too many password reset requests, please try again later.',
        retryAfter: expect.any(String),
      });
    });

    /**
     * @requirement user-authentication/REQ-35.4
     * @requirement user-authentication/REQ-35.7
     */
    it('同じメールアドレスへの上限の超過は、送信元を変えても通常の受理と同じ 200 を返し、後ろへ渡さない', async () => {
      const app = buildApp({ runtimeMode: production(), getRedisClient: () => null }, 1);

      for (let i = 0; i < LIMIT; i++) {
        const res = await resetRequest(app, 'victim@example.com', `203.0.113.${i + 1}`);
        expect(res.body).toEqual({ ok: true }); // 後ろ（本物の経路の代わり）へ届いた
      }
      // 大文字小文字・前後の空白が違っても同じメールアドレスとして数える
      const res = await resetRequest(app, '  Victim@Example.COM ', '203.0.113.100');
      expect(res.status).toBe(200);
      expect(res.body).toEqual(PASSWORD_RESET_REQUEST_ACCEPTED_RESPONSE);
      // メールアドレスごとの数をヘッダーで示さない（送信元ごとのヘッダーは超過していない値のまま）
      expect(res.headers['retry-after']).toBeUndefined();
      expect(res.headers['ratelimit-remaining']).toBe(String(LIMIT - 1));

      // 別のメールアドレスは止めない
      expect((await resetRequest(app, 'other@example.com', '203.0.113.101')).body).toEqual({
        ok: true,
      });
    });

    it('本文にメールアドレスの文字列が無い要求はメールアドレスごとに数えない（後ろの検証へ渡す）', async () => {
      const app = buildApp({ runtimeMode: production(), getRedisClient: () => null }, 1);

      for (let i = 0; i < LIMIT + 1; i++) {
        const res = await resetRequest(app, undefined, `198.51.100.${i + 1}`);
        expect(res.body).toEqual({ ok: true });
      }
    });

    it('試験の実行環境では送信元・メールアドレスのどちらも制限しない', async () => {
      const app = buildApp({
        runtimeMode: createRuntimeMode({ NODE_ENV: 'test' }),
        getRedisClient: () => null,
      });

      for (let i = 0; i < LIMIT + 2; i++) {
        expect((await resetRequest(app, 'same@example.com')).body).toEqual({ ok: true });
      }
    });

    it('Redis の操作が失敗してもメモリの記録へ退避して制限を続ける', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      try {
        const app = buildApp(
          { runtimeMode: production(), getRedisClient: () => failingRedis() },
          1
        );

        for (let i = 0; i < LIMIT; i++) {
          await resetRequest(app, 'fallback@example.com', `192.0.2.${i + 1}`);
        }
        const res = await resetRequest(app, 'fallback@example.com', '192.0.2.200');
        expect(res.body).toEqual(PASSWORD_RESET_REQUEST_ACCEPTED_RESPONSE);
      } finally {
        warn.mockRestore();
      }
    });
  });

  describe('既定の組み立て', () => {
    it('引数を省くと process.env の実行環境の判定を使う（試験の実行環境では制限しない）', async () => {
      const app = express();
      mountAuthRateLimitPolicy(app, createRateLimiters());
      app.use((_req: Request, res: Response) => {
        res.status(200).json({ ok: true });
      });
      const twoFactor = LIMIT_CASES[0]!;

      const statuses = await exhaust(app, { ...twoFactor, limit: twoFactor.limit + 2 });
      expect(statuses).toEqual(Array(twoFactor.limit + 2).fill(200));
    });
  });
});
