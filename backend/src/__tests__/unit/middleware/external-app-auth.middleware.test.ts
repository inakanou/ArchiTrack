/**
 * @fileoverview 外部アプリ用の窓口の認証・範囲の確認・回数制限の単体検証（user-authentication タスク 75.2）
 *
 * Design: Requirements 46-51 > ExternalAppAuthMiddleware
 *
 * @requirement user-authentication/REQ-33.3
 * @requirement user-authentication/REQ-51.1
 * @requirement user-authentication/REQ-51.2
 * @requirement user-authentication/REQ-51.3
 * @requirement user-authentication/REQ-51.4
 * @requirement user-authentication/REQ-51.6
 */

import http from 'http';
import type { AddressInfo } from 'net';
import express, { type Express, type RequestHandler } from 'express';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRuntimeMode } from '../../../config/runtime-mode.js';
import {
  createExternalAppAuth,
  getExternalAppPrincipal,
  protectedResourceMetadataUrl,
  type ExternalAppAuthDeps,
} from '../../../middleware/external-app-auth.middleware.js';
import type {
  ExternalAppAuthError,
  ExternalAppPrincipal,
  ExternalAppScope,
} from '../../../oauth/oauth.types.js';
import { ExternalAppTokenVerificationError } from '../../../services/external-app-token-verifier.service.js';
import type { RequestContext } from '../../../types/auth.types.js';
import { Err, Ok, type Result } from '../../../types/result.js';

const RESOURCE_URL = 'https://rs.example/mcp';
const METADATA_URL = 'https://rs.example/.well-known/oauth-protected-resource/mcp';
const CHALLENGE = `Bearer resource_metadata="${METADATA_URL}", scope="read write"`;
const INVALID_TOKEN_CHALLENGE = `Bearer error="invalid_token", resource_metadata="${METADATA_URL}", scope="read write"`;
const INSUFFICIENT_SCOPE_CHALLENGE = 'Bearer error="insufficient_scope", scope="read write"';
const PRODUCTION_MODE = createRuntimeMode({ NODE_ENV: 'production' });

/** トークンの値ごとの主体。無ければ INVALID_TOKEN */
const PRINCIPALS: Record<string, ExternalAppPrincipal> = {
  'read-a': { userId: 'user-a', clientId: 'claude', connectionId: 'c-a1', scopes: ['read'] },
  'write-a': {
    userId: 'user-a',
    clientId: 'claude',
    connectionId: 'c-a2',
    scopes: ['read', 'write'],
  },
  'read-b': { userId: 'user-b', clientId: 'claude', connectionId: 'c-b1', scopes: ['read'] },
};

type Verify = (
  token: string,
  now: Date,
  source: RequestContext
) => Promise<Result<ExternalAppPrincipal, ExternalAppAuthError>>;

function fakeVerify(): ReturnType<typeof vi.fn<Verify>> {
  return vi.fn<Verify>(async (token) => {
    const principal = PRINCIPALS[token];
    return principal ? Ok(principal) : Err({ kind: 'INVALID_TOKEN' });
  });
}

interface BuildOptions {
  readonly verify?: Verify;
  readonly max?: number;
  readonly deps?: Partial<ExternalAppAuthDeps>;
  readonly routes?: (app: Express, auth: ReturnType<typeof createExternalAppAuth>) => void;
}

function build(options: BuildOptions = {}): { app: Express; verify: Verify } {
  const verify = options.verify ?? fakeVerify();
  const auth = createExternalAppAuth({
    verifier: { verify },
    resourceUrl: RESOURCE_URL,
    rateLimit: { max: options.max ?? 1000, windowMs: 60_000 },
    rateLimitDeps: { runtimeMode: PRODUCTION_MODE, getRedisClient: () => null },
    ...options.deps,
  });
  const app = express();
  app.set('trust proxy', 1);
  if (options.routes) {
    options.routes(app, auth);
  } else {
    app.get('/read', ...auth.protect('read'), (req, res) => {
      const principal = getExternalAppPrincipal(req);
      res.json({ principal, screenUser: req.user ?? null });
    });
    app.post('/write', ...auth.protect('write'), (req, res) => {
      res.json({ userId: getExternalAppPrincipal(req).userId });
    });
  }
  return { app, verify };
}

function bearer(token: string): [string, string] {
  return ['Authorization', `Bearer ${token}`];
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('protectedResourceMetadataUrl（RFC 9728 の 3.1）', () => {
  it.each([
    ['https://rs.example/mcp', 'https://rs.example/.well-known/oauth-protected-resource/mcp'],
    ['https://rs.example', 'https://rs.example/.well-known/oauth-protected-resource'],
    ['https://rs.example/', 'https://rs.example/.well-known/oauth-protected-resource'],
    ['http://localhost:5174/a/b', 'http://localhost:5174/.well-known/oauth-protected-resource/a/b'],
  ])('%s のメタデータは %s', (resource, expected) => {
    expect(protectedResourceMetadataUrl(resource)).toBe(expected);
  });
});

describe('authenticateExternalApp', () => {
  describe('資格の無い要求（RFC 6750 の 3.1）', () => {
    it('Authorization が無ければ 401 と error の無い挑戦を返し、検証を呼ばない', async () => {
      const { app, verify } = build();
      const response = await request(app).get('/read');
      expect(response.status).toBe(401);
      expect(response.headers['www-authenticate']).toBe(CHALLENGE);
      expect(response.headers['cache-control']).toBe('no-store');
      expect(response.body).toEqual({ error: 'invalid_token' });
      expect(verify).not.toHaveBeenCalled();
    });

    it.each([['Basic dXNlcjpwYXNz'], ['Token abc'], ['Bearerabc'], ['Bearer\tread-a']])(
      'Bearer でない方式（%s）は資格の無い要求として 401',
      async (value) => {
        const { app, verify } = build();
        const response = await request(app).get('/read').set('Authorization', value);
        expect(response.status).toBe(401);
        expect(response.headers['www-authenticate']).toBe(CHALLENGE);
        expect(verify).not.toHaveBeenCalled();
      }
    );
  });

  describe('トークンの読み取り', () => {
    it.each([['Bearer'], ['bearer'], ['BEARER'], ['BeArEr']])(
      '方式の名前 %s は大文字小文字を区別しない',
      async (scheme) => {
        const { app, verify } = build();
        const response = await request(app).get('/read').set('Authorization', `${scheme} read-a`);
        expect(response.status).toBe(200);
        expect(verify).toHaveBeenCalledWith('read-a', expect.any(Date), expect.any(Object));
      }
    );

    // 値の末尾の空白は HTTP の解析で取り除かれる（RFC 9110 の 5.5）ので、区切りの崩れと空のトークンを確かめる
    it.each([['Bearer '], ['Bearer  read-a'], ['Bearer read-a extra']])(
      '形の崩れた Bearer（%j）は検証を呼ばず invalid_token の 401',
      async (value) => {
        const { app, verify } = build();
        const response = await request(app).get('/read').set('Authorization', value);
        expect(response.status).toBe(401);
        expect(response.headers['www-authenticate']).toBe(INVALID_TOKEN_CHALLENGE);
        expect(verify).not.toHaveBeenCalled();
      }
    );

    it('検証が不成立なら invalid_token の 401 で、トークンを応答に含めない', async () => {
      const { app } = build();
      const token = 'unknown-token-value-must-not-echo';
      const response = await request(app)
        .get('/read')
        .set(...bearer(token));
      expect(response.status).toBe(401);
      expect(response.headers['www-authenticate']).toBe(INVALID_TOKEN_CHALLENGE);
      expect(response.headers['cache-control']).toBe('no-store');
      expect(JSON.stringify(response.headers)).not.toContain(token);
      expect(response.text).not.toContain(token);
    });

    it('問い合わせの access_token は受け付けず 400 invalid_request（ヘッダーが正しくても）', async () => {
      const { app, verify } = build();
      const response = await request(app)
        .get('/read?access_token=read-a')
        .set(...bearer('read-a'));
      expect(response.status).toBe(400);
      expect(response.headers['www-authenticate']).toBe(
        `Bearer error="invalid_request", resource_metadata="${METADATA_URL}", scope="read write"`
      );
      expect(response.headers['cache-control']).toBe('no-store');
      expect(response.text).not.toContain('read-a');
      expect(verify).not.toHaveBeenCalled();
    });

    it('解析済みの本文の access_token は受け付けず 400 invalid_request', async () => {
      const { app, verify } = build({
        routes: (target, auth) => {
          target.post('/form', express.urlencoded({ extended: false }), ...auth.protect('read'));
        },
      });
      const response = await request(app)
        .post('/form')
        .type('form')
        .send({ access_token: 'read-a' })
        .set(...bearer('read-a'));
      expect(response.status).toBe(400);
      expect(verify).not.toHaveBeenCalled();
    });

    it('Authorization が 2 つある要求は 400 invalid_request で検証を呼ばない', async () => {
      const { app, verify } = build();
      const server = http.createServer(app);
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
      const { port } = server.address() as AddressInfo;
      try {
        const status = await new Promise<number>((resolve, reject) => {
          const outgoing = http.request(
            {
              host: '127.0.0.1',
              port,
              path: '/read',
              headers: ['Authorization', 'Bearer read-a', 'Authorization', 'Bearer write-a'],
            },
            (incoming) => {
              incoming.resume();
              resolve(incoming.statusCode ?? 0);
            }
          );
          outgoing.on('error', reject);
          outgoing.end();
        });
        expect(status).toBe(400);
        expect(verify).not.toHaveBeenCalled();
      } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    });
  });

  describe('検証へ渡す値', () => {
    it('信頼する段数で決めた送信元 IP とユーザーエージェントを渡す', async () => {
      const { app, verify } = build();
      await request(app)
        .get('/read')
        .set(...bearer('read-a'))
        .set('X-Forwarded-For', '198.51.100.7')
        .set('User-Agent', 'claude-connector/1.0');
      expect(verify).toHaveBeenCalledWith('read-a', expect.any(Date), {
        ipAddress: '198.51.100.7',
        userAgent: 'claude-connector/1.0',
      });
    });

    it('判定の時刻は注入した時計の値', async () => {
      const fixed = new Date('2026-11-24T00:00:00.000Z');
      const { app, verify } = build({ deps: { now: () => fixed } });
      await request(app)
        .get('/read')
        .set(...bearer('read-a'));
      expect(verify).toHaveBeenCalledWith('read-a', fixed, expect.any(Object));
    });
  });

  describe('基盤の失敗', () => {
    it('検証の基盤の失敗は 401 にせず 503 で、挑戦を付けない', async () => {
      const verify = vi.fn<Verify>(async () => {
        throw new ExternalAppTokenVerificationError('load_user', 'P1001');
      });
      const { app } = build({ verify });
      const response = await request(app)
        .get('/read')
        .set(...bearer('read-a'));
      expect(response.status).toBe(503);
      expect(response.headers['www-authenticate']).toBeUndefined();
      expect(response.headers['cache-control']).toBe('no-store');
      expect(response.body).toEqual({ error: 'temporarily_unavailable' });
    });

    it('想定外の例外はエラーの処理へ渡す（500）', async () => {
      const verify = vi.fn<Verify>(async () => {
        throw new Error('unexpected');
      });
      const { app } = build({ verify });
      const response = await request(app)
        .get('/read')
        .set(...bearer('read-a'));
      expect(response.status).toBe(500);
      expect(response.headers['www-authenticate']).toBeUndefined();
    });
  });

  describe('主体の受け渡し', () => {
    it('主体は範囲の確認の後に専用の取得でだけ読め、画面用の req.user を設定しない', async () => {
      const { app } = build();
      const response = await request(app)
        .get('/read')
        .set(...bearer('read-a'));
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ principal: PRINCIPALS['read-a'], screenUser: null });
    });

    it('範囲の確認を通していない経路で主体を読むと失敗する（範囲の宣言の漏れを通さない）', async () => {
      const { app } = build({
        routes: (target, auth) => {
          const handler: RequestHandler = (req, res) => {
            res.json(getExternalAppPrincipal(req));
          };
          target.get('/forgot-scope', auth.authenticateExternalApp(), handler);
        },
      });
      const response = await request(app)
        .get('/forgot-scope')
        .set(...bearer('write-a'));
      expect(response.status).toBe(500);
      expect(response.text).not.toContain('user-a');
    });

    it('認証の無い要求で主体を読むと失敗する', async () => {
      const app = express();
      app.get('/none', (req, res) => {
        res.json(getExternalAppPrincipal(req));
      });
      const response = await request(app).get('/none');
      expect(response.status).toBe(500);
    });

    it('画面用の認証の req.user は外部アプリの主体として扱わない', async () => {
      const { app } = build({
        routes: (target, auth) => {
          target.get(
            '/screen-user',
            (req, _res, next) => {
              req.user = { userId: 'screen-user', email: 'a@example.test', roles: [] };
              next();
            },
            ...auth.protect('read'),
            (req, res) => {
              res.json(getExternalAppPrincipal(req));
            }
          );
        },
      });
      const unauthenticated = await request(app).get('/screen-user');
      expect(unauthenticated.status).toBe(401);
    });
  });
});

describe('requireExternalScope（51.2）', () => {
  it('読み取りだけの接続の書き込みは 403 と insufficient_scope の挑戦', async () => {
    const { app } = build();
    const response = await request(app)
      .post('/write')
      .set(...bearer('read-a'));
    expect(response.status).toBe(403);
    expect(response.headers['www-authenticate']).toBe(INSUFFICIENT_SCOPE_CHALLENGE);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body).toEqual({ error: 'insufficient_scope' });
  });

  it('書き込みを含む接続の書き込みは通る', async () => {
    const { app } = build();
    const response = await request(app)
      .post('/write')
      .set(...bearer('write-a'));
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ userId: 'user-a' });
  });

  it('読み取りの経路は読み取りだけの接続で通る', async () => {
    const { app } = build();
    const response = await request(app)
      .get('/read')
      .set(...bearer('read-a'));
    expect(response.status).toBe(200);
  });

  it.each([['admin'], [''], [undefined]])(
    '未知の範囲（%j）を宣言した経路は組み立ての時点で失敗する',
    (scope) => {
      const auth = createExternalAppAuth({
        verifier: { verify: fakeVerify() },
        resourceUrl: RESOURCE_URL,
        rateLimit: { max: 10, windowMs: 60_000 },
        rateLimitDeps: { runtimeMode: PRODUCTION_MODE, getRedisClient: () => null },
      });
      expect(() => auth.requireExternalScope(scope as unknown as ExternalAppScope)).toThrow();
      expect(() => auth.protect(scope as unknown as ExternalAppScope)).toThrow();
    }
  );

  it('認証の前に範囲の確認だけを掛けた経路は通さない', async () => {
    const { app } = build({
      routes: (target, auth) => {
        target.get('/scope-only', auth.requireExternalScope('read'), (_req, res) => {
          res.json({ reached: true });
        });
      },
    });
    const response = await request(app).get('/scope-only');
    expect(response.status).toBe(500);
    expect(response.text).not.toContain('reached');
  });
});

describe('利用者ごとの回数制限（51.4・51.6）', () => {
  it('同じ利用者の全接続を合算し、上限を超えると 429 と Retry-After を返す', async () => {
    const { app } = build({ max: 3 });
    expect(
      (
        await request(app)
          .get('/read')
          .set(...bearer('read-a'))
      ).status
    ).toBe(200);
    expect(
      (
        await request(app)
          .get('/read')
          .set(...bearer('write-a'))
      ).status
    ).toBe(200);
    expect(
      (
        await request(app)
          .get('/read')
          .set(...bearer('read-a'))
      ).status
    ).toBe(200);
    const limited = await request(app)
      .get('/read')
      .set(...bearer('write-a'));
    expect(limited.status).toBe(429);
    expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
    expect(Number(limited.headers['retry-after'])).toBeLessThanOrEqual(60);
    expect(limited.headers['cache-control']).toBe('no-store');
    expect(limited.headers['www-authenticate']).toBeUndefined();
    expect(limited.body).toEqual({
      error: 'rate_limited',
      retryAfterSeconds: Number(limited.headers['retry-after']),
    });
  });

  it('別の利用者は数えない', async () => {
    const { app } = build({ max: 1 });
    await request(app)
      .get('/read')
      .set(...bearer('read-a'));
    expect(
      (
        await request(app)
          .get('/read')
          .set(...bearer('read-a'))
      ).status
    ).toBe(429);
    expect(
      (
        await request(app)
          .get('/read')
          .set(...bearer('read-b'))
      ).status
    ).toBe(200);
  });

  it('送信元 IP が変わっても同じ利用者として数える', async () => {
    const { app } = build({ max: 1 });
    await request(app)
      .get('/read')
      .set(...bearer('read-a'))
      .set('X-Forwarded-For', '198.51.100.1');
    const limited = await request(app)
      .get('/read')
      .set(...bearer('read-a'))
      .set('X-Forwarded-For', '198.51.100.2');
    expect(limited.status).toBe(429);
  });

  it('認証に失敗した要求は利用者の枠を消費しない', async () => {
    const { app } = build({ max: 1 });
    for (let index = 0; index < 5; index += 1) {
      expect(
        (
          await request(app)
            .get('/read')
            .set(...bearer('bad'))
        ).status
      ).toBe(401);
      expect((await request(app).get('/read')).status).toBe(401);
    }
    expect(
      (
        await request(app)
          .get('/read')
          .set(...bearer('read-a'))
      ).status
    ).toBe(200);
  });

  it('範囲の不足の 403 も認証済みの要求として数える', async () => {
    const { app } = build({ max: 1 });
    expect(
      (
        await request(app)
          .post('/write')
          .set(...bearer('read-a'))
      ).status
    ).toBe(403);
    expect(
      (
        await request(app)
          .get('/read')
          .set(...bearer('read-a'))
      ).status
    ).toBe(429);
  });

  it.each([
    ['production', { NODE_ENV: 'production', DISABLE_RATE_LIMIT: 'true' }],
    ['未設定', { DISABLE_RATE_LIMIT: 'true' }],
    ['未知の値', { NODE_ENV: 'staging', DISABLE_RATE_LIMIT: 'true' }],
  ])('%s では無効化の設定を無視する', async (_label, env) => {
    const { app } = build({
      max: 1,
      deps: {
        rateLimitDeps: {
          runtimeMode: createRuntimeMode(env as NodeJS.ProcessEnv),
          getRedisClient: () => null,
        },
      },
    });
    await request(app)
      .get('/read')
      .set(...bearer('read-a'));
    expect(
      (
        await request(app)
          .get('/read')
          .set(...bearer('read-a'))
      ).status
    ).toBe(429);
  });

  it('既存の無効化の判定（試験の実行環境）だけで外れる', async () => {
    const { app } = build({
      max: 1,
      deps: {
        rateLimitDeps: {
          runtimeMode: createRuntimeMode({ NODE_ENV: 'test' }),
          getRedisClient: () => null,
        },
      },
    });
    await request(app)
      .get('/read')
      .set(...bearer('read-a'));
    expect(
      (
        await request(app)
          .get('/read')
          .set(...bearer('read-a'))
      ).status
    ).toBe(200);
  });
});
