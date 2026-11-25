/**
 * @fileoverview 認可サーバーの設定とミドルウェアの単体検証
 *
 * ライブラリへ渡す設定の関数（利用者の解決・有効期間・Grant の読み込み・同意の判定・資源の検証・エラーの画面）、
 * 保存アダプターへ渡す処理、Express のミドルウェアの経路の振り分け・回数制限・ヘッダーの置き換えを確かめる。
 * ライブラリの本体は実物を使い、構築の設定だけを読み取る。DB と Redis は使わない。
 */

import { generateKeyPairSync, randomBytes } from 'crypto';
import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import { errors } from 'oidc-provider';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '../../../generated/prisma/client.js';
import {
  parseExternalAppOAuthConfig,
  type ExternalAppOAuthConfig,
} from '../../../oauth/client-registry.js';
import type { OAuthStoreAdapterDeps } from '../../../oauth/store-adapter.js';
import type { ExternalAppConnectionService } from '../../../services/external-app-connection.service.js';

type Handler = (req: Request, res: Response) => Promise<void>;
type Limiter = (req: Request, res: Response, next: (error?: unknown) => void) => void;

const captured = vi.hoisted(() => ({
  configuration: undefined as Record<string, unknown> | undefined,
  handle: null as Handler | null,
  adapterDeps: undefined as unknown,
  rateLimitArgs: undefined as unknown[] | undefined,
  limiters: { authorize: undefined as unknown, token: undefined as unknown },
}));

vi.mock('oidc-provider', async (importOriginal) => {
  const actual = await importOriginal<typeof import('oidc-provider')>();
  const Original = actual.default;
  class CapturingProvider extends Original {
    constructor(issuer: string, configuration: Record<string, unknown>) {
      super(issuer, configuration as never);
      captured.configuration = configuration;
    }

    override callback(): ReturnType<InstanceType<typeof Original>['callback']> {
      const real = super.callback();
      return (req, res) =>
        captured.handle
          ? captured.handle(req as unknown as Request, res as unknown as Response)
          : real(req, res);
    }
  }
  return { ...actual, default: CapturingProvider };
});

vi.mock('../../../oauth/store-adapter.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../oauth/store-adapter.js')>();
  return {
    ...actual,
    createOAuthStoreAdapterFactory: (deps: OAuthStoreAdapterDeps) => {
      captured.adapterDeps = deps;
      return actual.createOAuthStoreAdapterFactory(deps);
    },
  };
});

vi.mock('../../../oauth/rate-limit.js', () => ({
  createOAuthRateLimiters: (...args: unknown[]) => {
    captured.rateLimitArgs = args;
    return {
      authorize: (req: Request, res: Response, next: NextFunction) =>
        (captured.limiters.authorize as Limiter)(req, res, next),
      token: (req: Request, res: Response, next: NextFunction) =>
        (captured.limiters.token as Limiter)(req, res, next),
    };
  },
}));

import {
  createOAuthProviderHost,
  mountExternalAppOAuth,
  OAUTH_ERROR_PAGE,
} from '../../../oauth/provider.js';
import { getRequestSource } from '../../../oauth/request-context.js';

const ISSUER = 'http://localhost:5174';
const RESOURCE_URL = 'http://localhost:5174/mcp';
const CLIENT_ID = 'unit-client';
const FIXED_NOW_MS = Date.parse('2026-11-24T00:00:00.000Z');
const FIXED_NOW_SECONDS = Math.floor(FIXED_NOW_MS / 1000);
const DAY_SECONDS = 24 * 60 * 60;

function rsaJwk(): Record<string, unknown> {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  return { ...privateKey.export({ format: 'jwk' }), kid: 'unit', use: 'sig', alg: 'RS256' };
}

const JWK = rsaJwk();
const CLIENT_SECRET = randomBytes(24).toString('hex');

function envSource(): NodeJS.ProcessEnv {
  return {
    NODE_ENV: 'test',
    OAUTH_ALLOWED_CLIENTS: JSON.stringify([
      {
        clientId: CLIENT_ID,
        clientSecret: CLIENT_SECRET,
        displayName: 'Unit',
        redirectUris: ['https://client.example/callback'],
      },
    ]),
    OAUTH_ISSUER: ISSUER,
    OAUTH_RESOURCE_URL: RESOURCE_URL,
    OAUTH_JWKS: JSON.stringify({ keys: [JWK] }),
    OAUTH_COOKIE_KEYS: JSON.stringify([randomBytes(32).toString('hex')]),
    OAUTH_TOKEN_HMAC_KEY: randomBytes(32).toString('hex'),
  };
}

function buildConfig(): ExternalAppOAuthConfig {
  const config = parseExternalAppOAuthConfig(envSource());
  if (config === null) {
    throw new Error('試験の設定が読めません');
  }
  return config;
}

interface Grant {
  accountId?: string;
  clientId?: string;
  getOIDCScope(): string;
  addOIDCScope(scope: string): void;
  save(): Promise<unknown>;
}

interface InteractionCheck {
  reason: string;
  check(ctx: unknown): boolean;
}

interface CapturedConfiguration {
  clients: Record<string, unknown>[];
  clientAuthMethods: string[];
  scopes: string[];
  jwks: { keys: Record<string, unknown>[] };
  pkce: { required(): boolean };
  routes: Record<string, string>;
  features: {
    resourceIndicators: {
      defaultResource(ctx: unknown, client: unknown, oneOf?: string[]): Promise<string>;
      getResourceServerInfo(ctx: unknown, identifier: string): Promise<Record<string, unknown>>;
    };
  };
  ttl: {
    AccessToken(ctx: unknown): number;
    RefreshToken(ctx: unknown): number;
    AuthorizationCode: number;
    Grant: number;
    Interaction: number;
    Session: number;
  };
  rotateRefreshToken: boolean;
  issueRefreshToken(
    ctx: unknown,
    client: { grantTypeAllowed(type: string): boolean }
  ): Promise<boolean>;
  expiresWithSession(): Promise<boolean>;
  loadExistingGrant(ctx: unknown): Promise<Grant | undefined>;
  interactions: {
    policy: { get(name: string): { checks: Iterable<InteractionCheck> } | undefined };
    url(ctx: unknown, interaction: { uid: string }): string;
  };
  findAccount(
    ctx: unknown,
    id: string
  ): Promise<{ accountId: string; claims(): Promise<unknown> } | undefined>;
  renderError(ctx: { type?: string; body?: unknown }, out: unknown, error: Error): Promise<void>;
}

function connectionServiceStub() {
  return {
    handleReuse: vi.fn(async () => undefined),
    recordRefreshGrace: vi.fn(async () => undefined),
  };
}

function setup(prisma: unknown = {}) {
  const connectionService = connectionServiceStub();
  const host = createOAuthProviderHost(buildConfig(), {
    prisma: prisma as PrismaClient,
    connectionService: connectionService as unknown as ExternalAppConnectionService,
  });
  return {
    host,
    connectionService,
    configuration: captured.configuration as unknown as CapturedConfiguration,
    adapterDeps: captured.adapterDeps as OAuthStoreAdapterDeps,
  };
}

beforeEach(() => {
  captured.handle = null;
  captured.limiters.authorize = vi.fn((_req, _res, next: () => void) => next());
  captured.limiters.token = vi.fn((_req, _res, next: () => void) => next());
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ライブラリへ渡す設定', () => {
  it('許可するアプリを、登録した送信の方式・コードの応答・更新つきの範囲だけで登録する', () => {
    const { configuration } = setup();

    expect(configuration.clients).toEqual([
      {
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        client_name: 'Unit',
        redirect_uris: ['https://client.example/callback'],
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
        response_modes: ['query'],
        token_endpoint_auth_method: 'client_secret_post',
        scope: 'offline_access read write',
      },
    ]);
    expect(configuration.clientAuthMethods).toEqual(['client_secret_post']);
    expect(configuration.scopes).toEqual(['offline_access', 'read', 'write']);
    expect(configuration.routes).toEqual({
      authorization: '/oauth/authorize',
      token: '/oauth/token',
      jwks: '/oauth/jwks',
    });
    expect(configuration.pkce.required()).toBe(true);
    expect(configuration.rotateRefreshToken).toBe(true);
    expect(configuration.ttl).toMatchObject({
      AuthorizationCode: 600,
      Grant: 90 * DAY_SECONDS,
      Interaction: 600,
      Session: 600,
    });
  });

  it('鍵は設定の値の複製を渡す（ライブラリの書き換えを設定へ戻さない）', () => {
    const config = buildConfig();
    createOAuthProviderHost(config, {
      prisma: {} as PrismaClient,
      connectionService: connectionServiceStub() as unknown as ExternalAppConnectionService,
    });
    const configuration = captured.configuration as unknown as CapturedConfiguration;

    expect(configuration.jwks.keys).toEqual(config.jwks.keys);
    expect(configuration.jwks.keys[0]).not.toBe(config.jwks.keys[0]);
  });

  it('更新トークンはアプリに更新の許可があるときだけ発行し、セッションの終了で失効させない', async () => {
    const { configuration } = setup();
    const allowed = vi.fn(() => true);
    const denied = vi.fn(() => false);

    await expect(configuration.issueRefreshToken({}, { grantTypeAllowed: allowed })).resolves.toBe(
      true
    );
    await expect(configuration.issueRefreshToken({}, { grantTypeAllowed: denied })).resolves.toBe(
      false
    );
    expect(allowed).toHaveBeenCalledWith('refresh_token');
    await expect(configuration.expiresWithSession()).resolves.toBe(false);
  });

  it('同意の画面の URL は申し込みの uid だけから作る', () => {
    const { configuration } = setup();

    expect(configuration.interactions.url({}, { uid: 'uid-123' })).toBe(
      '/oauth/interaction/uid-123'
    );
  });

  it('エラーの画面は固定の文面で、例外の文を含めない', async () => {
    const { configuration } = setup();
    const ctx: { type?: string; body?: unknown } = {};

    await configuration.renderError(ctx, { error: 'x' }, new Error('secret detail in error'));

    expect(ctx.type).toBe('html');
    expect(ctx.body).toBe(OAUTH_ERROR_PAGE);
    expect(String(ctx.body)).not.toContain('secret detail');
  });
});

describe('利用者の解決（findAccount）', () => {
  it('有効な利用者は ID だけを claims に持つ', async () => {
    const findUnique = vi.fn().mockResolvedValue({ id: 'user-1', isActive: true });
    const { configuration } = setup({ user: { findUnique } });

    const account = await configuration.findAccount({}, 'user-1');

    expect(findUnique).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      select: { id: true, isActive: true },
    });
    expect(account?.accountId).toBe('user-1');
    await expect(account?.claims()).resolves.toEqual({ sub: 'user-1' });
  });

  it.each([
    ['無効な利用者', { id: 'user-1', isActive: false }],
    ['存在しない利用者', null],
  ])('%sは解決しない', async (_name, user) => {
    const { configuration } = setup({ user: { findUnique: vi.fn().mockResolvedValue(user) } });

    await expect(configuration.findAccount({}, 'user-1')).resolves.toBeUndefined();
  });
});

describe('トークンの有効期間', () => {
  beforeEach(() => {
    vi.spyOn(Date, 'now').mockReturnValue(FIXED_NOW_MS);
  });

  function grantContext(exp: unknown) {
    return { oidc: { entities: { Grant: exp === undefined ? undefined : { exp } } } };
  }

  it.each([
    ['AccessToken', 900],
    ['RefreshToken', 30 * DAY_SECONDS],
  ] as const)('%s は上限の期間を Grant の残りで切り詰める', (kind, limit) => {
    const { configuration } = setup();
    const ttl = configuration.ttl[kind];

    expect(ttl(grantContext(FIXED_NOW_SECONDS + 90 * DAY_SECONDS))).toBe(limit);
    expect(ttl(grantContext(FIXED_NOW_SECONDS + 120))).toBe(120);
  });

  it.each([
    ['Grant が無い', undefined],
    ['Grant の期限が数でない', '1700000000'],
    ['Grant の期限に達した', FIXED_NOW_SECONDS],
    ['Grant の期限を過ぎた', FIXED_NOW_SECONDS - 1],
  ])('%sときは invalid_grant で発行しない', (_name, exp) => {
    const { configuration } = setup();

    expect(() => configuration.ttl.AccessToken(grantContext(exp))).toThrow(errors.InvalidGrant);
    expect(() => configuration.ttl.RefreshToken(grantContext(exp))).toThrow(errors.InvalidGrant);
  });

  it('文脈が無いときも invalid_grant にする', () => {
    const { configuration } = setup();

    expect(() => configuration.ttl.AccessToken(undefined)).toThrow(errors.InvalidGrant);
  });
});

describe('資源の指定（resourceIndicators）', () => {
  it('省いたトークンの要求は、結び付いた値が設定の資源だけなら設定の資源を使う', async () => {
    const { configuration } = setup();
    const { defaultResource } = configuration.features.resourceIndicators;

    await expect(defaultResource({}, {}, [RESOURCE_URL])).resolves.toBe(RESOURCE_URL);
  });

  it.each([
    ['候補が無い認可の要求', undefined],
    ['別の資源を含む候補', [RESOURCE_URL, 'https://other.example/mcp']],
  ])('%sは invalid_target で拒否する', async (_name, oneOf) => {
    const { configuration } = setup();

    await expect(
      configuration.features.resourceIndicators.defaultResource({}, {}, oneOf)
    ).rejects.toBeInstanceOf(errors.InvalidTarget);
  });

  it('設定の資源には範囲・対象・有効期間・不透明な形式を返し、他の資源は拒否する', async () => {
    const { getResourceServerInfo } = setup().configuration.features.resourceIndicators;

    await expect(getResourceServerInfo({}, RESOURCE_URL)).resolves.toEqual({
      scope: 'read write',
      audience: RESOURCE_URL,
      accessTokenTTL: 900,
      accessTokenFormat: 'opaque',
    });
    await expect(getResourceServerInfo({}, 'https://other.example/mcp')).rejects.toBeInstanceOf(
      errors.InvalidTarget
    );
  });
});

describe('同意の結果の Grant の読み込み（loadExistingGrant）', () => {
  function grantStub(overrides: Partial<Grant> = {}): Grant {
    return {
      accountId: 'user-1',
      clientId: CLIENT_ID,
      getOIDCScope: () => 'read',
      addOIDCScope: vi.fn(),
      save: vi.fn(async () => 'saved'),
      ...overrides,
    };
  }

  function consentContext(options: {
    grantId?: unknown;
    grant?: Grant | undefined;
    scopes?: string[];
    accountId?: string;
  }) {
    const find = vi.fn(async () => options.grant);
    return {
      find,
      ctx: {
        oidc: {
          result: 'grantId' in options ? { consent: { grantId: options.grantId } } : undefined,
          provider: { Grant: { find } },
          account: { accountId: options.accountId ?? 'user-1' },
          client: { clientId: CLIENT_ID },
          requestParamScopes: new Set(options.scopes ?? ['read']),
        },
      },
    };
  }

  it.each([
    ['同意の結果が無い', {}],
    ['grantId が空', { grantId: '' }],
    ['grantId が文字列でない', { grantId: 42 }],
  ])('%sときはセッションの Grant を使わず読まない', async (_name, options) => {
    const { configuration } = setup();
    const { ctx, find } = consentContext(options);

    await expect(configuration.loadExistingGrant(ctx)).resolves.toBeUndefined();
    expect(find).not.toHaveBeenCalled();
  });

  it('同意の結果の Grant が無ければ undefined を返す', async () => {
    const { configuration } = setup();
    const { ctx, find } = consentContext({ grantId: 'grant-1', grant: undefined });

    await expect(configuration.loadExistingGrant(ctx)).resolves.toBeUndefined();
    expect(find).toHaveBeenCalledWith('grant-1');
  });

  it('要求された offline_access を、要求の利用者とアプリの Grant にだけ付与して保存する', async () => {
    const { configuration } = setup();
    const grant = grantStub();
    const { ctx } = consentContext({
      grantId: 'grant-1',
      grant,
      scopes: ['read', 'offline_access'],
    });

    await expect(configuration.loadExistingGrant(ctx)).resolves.toBe(grant);
    expect(grant.addOIDCScope).toHaveBeenCalledWith('offline_access');
    expect(grant.save).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['offline_access が要求されていない', grantStub(), ['read'], 'user-1'],
    [
      'Grant に offline_access が付与済み',
      grantStub({ getOIDCScope: () => 'read offline_access' }),
      ['read', 'offline_access'],
      'user-1',
    ],
    ['Grant が別の利用者のもの', grantStub(), ['read', 'offline_access'], 'user-other'],
    [
      'Grant が別のアプリのもの',
      grantStub({ clientId: 'client-other' }),
      ['read', 'offline_access'],
      'user-1',
    ],
  ])('%sときは Grant を変えずに返す', async (_name, grant, scopes, accountId) => {
    const { configuration } = setup();
    const { ctx } = consentContext({ grantId: 'grant-1', grant, scopes, accountId });

    await expect(configuration.loadExistingGrant(ctx)).resolves.toBe(grant);
    expect(grant.addOIDCScope).not.toHaveBeenCalled();
    expect(grant.save).not.toHaveBeenCalled();
  });
});

describe('同意の判定（interactions.policy）', () => {
  function consentCheck(): InteractionCheck {
    const prompt = setup().configuration.interactions.policy.get('consent');
    const checks = [...(prompt?.checks ?? [])];
    expect(checks.map((check) => check.reason)).toEqual(['consent_result_required']);
    return checks[0] as InteractionCheck;
  }

  it('この申し込みの同意の結果が無ければ同意へ戻す', () => {
    expect(consentCheck().check({ oidc: { result: undefined, account: {} } })).toBe(true);
    expect(consentCheck().check({ oidc: { result: { consent: {} }, account: {} } })).toBe(true);
  });

  it('同意の結果があり利用者が有効なら戻さない（範囲の照合で戻し続けない）', () => {
    const ctx = {
      oidc: { result: { consent: { grantId: 'grant-1' } }, account: { accountId: 'u' } },
    };

    expect(consentCheck().check(ctx)).toBe(false);
  });

  it('同意の後に利用者が無効になったら access_denied で認可コードを返さない', () => {
    const ctx = { oidc: { result: { consent: { grantId: 'grant-1' } }, account: undefined } };

    expect(() => consentCheck().check(ctx)).toThrow(errors.AccessDenied);
  });

  it('同意以外の判定はライブラリの既定のまま残す', () => {
    const { policy } = setup().configuration.interactions;

    expect([...(policy.get('login')?.checks ?? [])].length).toBeGreaterThan(0);
  });
});

describe('保存アダプターへ渡す処理', () => {
  it('Grant の失効と更新の猶予を接続のサービスへそのまま渡す', async () => {
    const { adapterDeps, connectionService } = setup();
    const reuse = {
      grantId: 'g',
      kind: 'refresh_token' as const,
      ipAddress: null,
      userAgent: null,
    };
    const grace = { grantId: 'g', ipAddress: '192.0.2.1', userAgent: 'ua' };

    await adapterDeps.onGrantRevoked(reuse);
    await adapterDeps.onRefreshGraceApplied(grace);

    expect(connectionService.handleReuse).toHaveBeenCalledWith(reuse);
    expect(connectionService.recordRefreshGrace).toHaveBeenCalledWith(grace);
    expect(adapterDeps.getRequestSource).toBe(getRequestSource);
    expect(adapterDeps.tokenHmacKey).toMatch(/^[0-9a-f]{64}$/);
  });

  it.each([
    ['resource を省いた', undefined],
    ['設定の資源だけの', RESOURCE_URL],
    ['設定の資源だけの配列の', [RESOURCE_URL, RESOURCE_URL]],
  ])('%s認可コードの交換は通す', (_name, resource) => {
    const { adapterDeps } = setup();

    expect(() =>
      adapterDeps.assertCodeExchangeRequest?.({ oidc: { params: { resource } } } as never)
    ).not.toThrow();
  });

  it.each([
    ['別の資源の', 'https://other.example/mcp'],
    ['別の資源を含む配列の', [RESOURCE_URL, 'https://other.example/mcp']],
  ])('%s認可コードの交換はコードの消費の前に invalid_target で拒否する', (_name, resource) => {
    const { adapterDeps } = setup();

    expect(() =>
      adapterDeps.assertCodeExchangeRequest?.({ oidc: { params: { resource } } } as never)
    ).toThrow(errors.InvalidTarget);
  });
});

describe('ミドルウェア', () => {
  interface Seen {
    method: string;
    path: string;
    headers: Record<string, unknown>;
    ip: string | undefined;
    source: unknown;
  }

  function appWith(trustProxy = 0): {
    app: Express;
    seen: Seen[];
    errorHandler: ReturnType<typeof vi.fn>;
  } {
    const { host } = setup();
    const seen: Seen[] = [];
    captured.handle = async (req, res) => {
      seen.push({
        method: req.method,
        path: req.path,
        headers: { ...req.headers },
        ip: req.ip,
        source: getRequestSource(),
      });
      res.statusCode = 204;
      res.end();
    };
    const errorHandler = vi.fn();
    const app = express();
    app.set('trust proxy', trustProxy);
    app.use(host.middleware);
    app.use((_req: Request, res: Response) => {
      res.status(404).json({ passedThrough: true });
    });
    app.use((error: Error, _req: Request, res: Response, _next: NextFunction) => {
      errorHandler(error);
      res.status(500).json({ error: 'caught' });
    });
    return { app, seen, errorHandler };
  }

  it('担当でない経路はライブラリへ渡さず次へ進める', async () => {
    const { app, seen } = appWith();

    const response = await request(app).get('/oauth/interaction/abc');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ passedThrough: true });
    expect(seen).toEqual([]);
    expect(captured.limiters.authorize).not.toHaveBeenCalled();
    expect(captured.limiters.token).not.toHaveBeenCalled();
  });

  it.each([
    ['GET', '/oauth/authorize', 'authorize'],
    ['GET', '/oauth/authorize/abc_DEF-1', 'authorize'],
    ['POST', '/oauth/token', 'token'],
  ] as const)(
    '%s %s は %s の回数制限を通してからライブラリへ渡す',
    async (method, path, limiter) => {
      const { app, seen } = appWith();

      const response =
        method === 'GET' ? await request(app).get(path) : await request(app).post(path).send('a=b');

      expect(response.status).toBe(204);
      expect(captured.limiters[limiter]).toHaveBeenCalledTimes(1);
      const other = limiter === 'token' ? 'authorize' : 'token';
      expect(captured.limiters[other]).not.toHaveBeenCalled();
      expect(seen).toHaveLength(1);
      expect(seen[0]).toMatchObject({ method, path });
    }
  );

  it.each([
    ['GET', '/oauth/jwks'],
    ['GET', '/.well-known/oauth-authorization-server'],
    ['OPTIONS', '/oauth/token'],
  ] as const)('%s %s は回数制限を通さずにライブラリへ渡す', async (method, path) => {
    const { app, seen } = appWith();

    const response =
      method === 'GET' ? await request(app).get(path) : await request(app).options(path);

    expect(response.status).toBe(204);
    expect(seen).toHaveLength(1);
    expect(captured.limiters.authorize).not.toHaveBeenCalled();
    expect(captured.limiters.token).not.toHaveBeenCalled();
  });

  it('回数制限が超過を返したらライブラリへ渡さない', async () => {
    captured.limiters.token = vi.fn((_req: Request, res: Response) => {
      res.status(429).json({ error: 'temporarily_unavailable' });
    });
    const { app, seen } = appWith();

    const response = await request(app).post('/oauth/token').send('grant_type=refresh_token');

    expect(response.status).toBe(429);
    expect(seen).toEqual([]);
  });

  it('回数制限の失敗はライブラリへ渡さずエラーの処理へ渡す', async () => {
    const failure = new Error('store down');
    captured.limiters.authorize = vi.fn((_req, _res, next: (error?: unknown) => void) =>
      next(failure)
    );
    const { app, seen, errorHandler } = appWith();

    const response = await request(app).get('/oauth/authorize');

    expect(response.status).toBe(500);
    expect(errorHandler).toHaveBeenCalledWith(failure);
    expect(seen).toEqual([]);
  });

  it('トークンの要求の Authorization ヘッダーは登録した方式でないので invalid_client で拒否する', async () => {
    const { app, seen } = appWith();

    const response = await request(app)
      .post('/oauth/token')
      .set(
        'Authorization',
        `Basic ${Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64')}`
      )
      .send('grant_type=refresh_token');

    expect(response.status).toBe(401);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body).toEqual({ error: 'invalid_client' });
    expect(seen).toEqual([]);
  });

  it('Host と転送ヘッダーを発行者の値で置き換え、送信元は置き換えの前の値で文脈へ置く', async () => {
    const { app, seen } = appWith(1);

    await request(app)
      .get('/oauth/jwks')
      .set('Host', 'evil.example')
      .set('X-Forwarded-For', '203.0.113.5')
      .set('X-Forwarded-Host', 'evil.example')
      .set('X-Forwarded-Proto', 'https')
      .set('X-Forwarded-Port', '8443')
      .set('X-Forwarded-Prefix', '/evil')
      .set('Forwarded', 'for=198.51.100.1;host=evil.example')
      .set('User-Agent', 'unit-agent');

    expect(seen).toHaveLength(1);
    const { headers, ip, source } = seen[0] as Seen;
    expect(headers.host).toBe('localhost:5174');
    expect(headers['x-forwarded-host']).toBe('localhost:5174');
    expect(headers['x-forwarded-proto']).toBe('http');
    for (const removed of [
      'forwarded',
      'x-forwarded-for',
      'x-forwarded-port',
      'x-forwarded-prefix',
    ]) {
      expect(headers).not.toHaveProperty(removed);
    }
    // 信頼する段数で決めた送信元は、転送ヘッダーを消した後も変わらない
    expect(ip).toBe('203.0.113.5');
    expect(source).toEqual({ ipAddress: '203.0.113.5', userAgent: 'unit-agent' });
  });

  it('認可サーバーのセッションの Cookie だけを外し、他の Cookie は残す', async () => {
    const { app, seen } = appWith();

    await request(app)
      .get('/oauth/authorize')
      .set('Cookie', '_session=s1; other=keep; _session.sig=sig1; theme=dark');
    await request(app).get('/oauth/authorize').set('Cookie', '_session=s1; _session.sig=sig1');
    await request(app).get('/oauth/authorize');

    expect(seen.map((entry) => entry.headers.cookie)).toEqual([
      'other=keep; theme=dark',
      undefined,
      undefined,
    ]);
    expect(seen[1]?.headers).not.toHaveProperty('cookie');
  });

  it('ライブラリの処理の失敗はエラーの処理へ渡す', async () => {
    const { app, errorHandler } = appWith();
    const failure = new Error('handler failed');
    captured.handle = vi.fn(async () => {
      throw failure;
    });

    const response = await request(app).get('/oauth/jwks');

    expect(response.status).toBe(500);
    expect(errorHandler).toHaveBeenCalledWith(failure);
  });
});

describe('ライブラリの応答', () => {
  function realApp(): Express {
    const { host } = setup();
    captured.handle = null;
    const app = express();
    app.use(host.middleware);
    return app;
  }

  it('メタデータは要求の Host によらず発行者の URL を広告し、openid を範囲から外す', async () => {
    const response = await request(realApp())
      .get('/.well-known/oauth-authorization-server')
      .set('Host', 'evil.example');

    expect(response.status).toBe(200);
    expect(response.body.issuer).toBe(ISSUER);
    expect(response.body.authorization_endpoint).toBe(`${ISSUER}/oauth/authorize`);
    expect(response.body.token_endpoint).toBe(`${ISSUER}/oauth/token`);
    expect(response.body.scopes_supported).toEqual(
      expect.arrayContaining(['offline_access', 'read', 'write'])
    );
    expect(response.body.scopes_supported).not.toContain('openid');
    expect(JSON.stringify(response.body)).not.toContain('evil.example');
  });

  it('JWKS は公開鍵だけを返す（メタデータ以外の応答は書き換えない）', async () => {
    const response = await request(realApp()).get('/oauth/jwks');

    expect(response.status).toBe(200);
    expect(response.body.keys).toHaveLength(1);
    expect(response.body.keys[0]).toMatchObject({ kid: 'unit', kty: 'RSA', n: JWK.n, e: JWK.e });
    expect(response.body.keys[0]).not.toHaveProperty('d');
    expect(response.body).not.toHaveProperty('scopes_supported');
  });
});

describe('mountExternalAppOAuth の搭載', () => {
  it('許可するアプリがあれば、ミドルウェアを載せて同意と窓口の部品を返す', () => {
    const use = vi.fn();
    const app = { use } as unknown as Express;
    const source = envSource();

    const mounted = mountExternalAppOAuth(app, {} as PrismaClient, source);

    expect(mounted).not.toBeNull();
    expect(use).toHaveBeenCalledTimes(1);
    expect(use).toHaveBeenCalledWith(mounted?.middleware);
    expect(mounted?.resourceUrl).toBe(RESOURCE_URL);
    expect(mounted?.clientRegistry.isAllowed(CLIENT_ID)).toBe(true);
    expect(mounted?.clientRegistry.isAllowed('unknown-client')).toBe(false);
    expect(typeof mounted?.connectionService.handleReuse).toBe('function');
    expect(typeof mounted?.tokenVerifier.verify).toBe('function');
    expect(typeof mounted?.externalAppAuth.protect).toBe('function');
    // 回数制限は設定と同じ環境変数で決めた実行環境の判定を使う
    const [limits, deps] = captured.rateLimitArgs as [unknown, { runtimeMode: unknown }];
    expect(limits).toEqual(parseExternalAppOAuthConfig(source)?.rateLimit);
    expect(deps.runtimeMode).toBeDefined();
  });
});
