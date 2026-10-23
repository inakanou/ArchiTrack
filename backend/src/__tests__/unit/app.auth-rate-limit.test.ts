import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { AUTH_RATE_LIMITS } from '../../middleware/rateLimit.middleware.js';

/**
 * 実際の app の組み立てに認証系の専用の制限が掛かることを確かめる
 * （user-authentication タスク48.1、design.md の RateLimitPolicy）。
 *
 * 本番の設定（NODE_ENV=production）で無効化の変数（DISABLE_RATE_LIMIT=true）を与えて app を組み立て、
 * 対象の経路が上限の超過で 429 になることを見る。キャッシュ基盤は無い状態（getClient が null）とし、
 * 制限がメモリの記録で続くことも同時に確かめる。
 */

vi.mock('../../db.js', () => ({
  default: vi.fn(() => ({
    $queryRaw: vi.fn().mockResolvedValue([{ '?column?': 1 }]),
    $disconnect: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock('../../redis.js', () => ({
  default: {
    ping: vi.fn().mockResolvedValue('PONG'),
    disconnect: vi.fn(),
    getClient: vi.fn().mockReturnValue(null),
  },
}));

// 超過時の処理は要求のロガーへ記録する（共通の設定は記録を外すため、記録の口だけを置く）
vi.mock('../../middleware/logger.middleware.js', () => ({
  httpLogger: (req: { log?: unknown }, _res: unknown, next: () => void) => {
    req.log = { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() };
    next();
  },
}));

type Method = 'get' | 'post';

const CASES: ReadonlyArray<{
  name: string;
  limit: number;
  routes: ReadonlyArray<readonly [Method, string]>;
}> = [
  {
    name: '2FA の検証',
    limit: AUTH_RATE_LIMITS.TWO_FACTOR_VERIFY.limit,
    routes: [
      ['post', '/api/v1/auth/verify-2fa'],
      ['post', '/api/v1/auth/verify-2fa/backup'],
    ],
  },
  {
    name: 'パスワードリセットの実行と検証',
    limit: AUTH_RATE_LIMITS.PASSWORD_RESET.limit,
    routes: [
      ['post', '/api/v1/auth/password/reset'],
      ['post', '/api/v1/auth/password/verify-reset'],
    ],
  },
  {
    name: '登録と招待の検証',
    limit: AUTH_RATE_LIMITS.REGISTRATION.limit,
    routes: [
      ['post', '/api/v1/auth/register'],
      ['post', '/api/v1/invitations/verify'],
    ],
  },
];

describe('app の認証系の専用の制限', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    vi.resetModules();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  async function loadProductionApp(): Promise<Express> {
    process.env.NODE_ENV = 'production';
    process.env.DISABLE_RATE_LIMIT = 'true';
    // 本番の検証は DATABASE_URL と REDIS_URL を求める（接続はモックする）
    process.env.DATABASE_URL ??= 'postgresql://test:test@localhost:5432/test';
    process.env.REDIS_URL ??= 'redis://localhost:6379';
    const { default: app } = await import('../../app.js');
    return app;
  }

  function send(app: Express, [method, path]: readonly [Method, string]) {
    // 本番は HTTPS へ寄せるため、中継が HTTPS で受けた要求として送る
    const req = method === 'get' ? request(app).get(path) : request(app).post(path).send({});
    return req.set('X-Forwarded-Proto', 'https');
  }

  it.each(CASES)(
    '本番の設定では DISABLE_RATE_LIMIT=true でも $name が上限の超過で 429 になる',
    async ({ limit, routes }) => {
      const app = await loadProductionApp();

      for (let i = 0; i < limit; i++) {
        const res = await send(app, routes[i % routes.length]!);
        expect(res.status).not.toBe(429);
      }
      for (const route of routes) {
        const res = await send(app, route);
        expect(res.status).toBe(429);
        expect(res.body.error).toMatch(/^Too many /);
      }
    }
  );
});
