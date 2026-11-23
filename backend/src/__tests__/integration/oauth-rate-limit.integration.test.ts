/**
 * @fileoverview 認可の窓口の送信元 IP ごとの回数制限の統合検証（user-authentication タスク 73.5）
 *
 * 実際の HTTP・oidc-provider・PostgreSQL・Redis で確かめる。試験の実行環境では制限が外れるので、
 * 制限は本番の判定を明示して組み立てる。
 *
 * Design: Requirements 46-51 > OAuthProviderHost > Rate limit
 *
 * @requirement user-authentication/REQ-51.10
 */

import { createHash, generateKeyPairSync, randomBytes, randomInt, randomUUID } from 'crypto';
import http from 'http';
import type { AddressInfo } from 'net';
import express, { type Express } from 'express';
import type Redis from 'ioredis';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const { observeSecurityAnomaly } = vi.hoisted(() => ({ observeSecurityAnomaly: vi.fn() }));

vi.mock('../../services/security-anomaly-monitor.service.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/security-anomaly-monitor.service.js')>()),
  observeSecurityAnomaly,
}));

import { validateEnv } from '../../config/env.js';
import { createRuntimeMode, type RuntimeMode } from '../../config/runtime-mode.js';
import type { PrismaClient } from '../../generated/prisma/client.js';

validateEnv();

import getPrismaClient from '../../db.js';
import { createRateLimiters } from '../../middleware/rateLimit.middleware.js';
import {
  createExternalAppClientRegistry,
  parseExternalAppOAuthConfig,
} from '../../oauth/client-registry.js';
import {
  createOAuthProviderHost,
  mountExternalAppOAuth,
  type OAuthProviderHost,
} from '../../oauth/provider.js';
import redis, { initRedis } from '../../redis.js';
import { AuditLogService } from '../../services/audit-log.service.js';
import { ExternalAppConnectionService } from '../../services/external-app-connection.service.js';
import { deleteAuditLogsWithArchivePermission } from '../../utils/audit-log-archive-permission.js';
import logger from '../../utils/logger.js';

const CLIENT_ID = 'test-oauth735-client';
const CLIENT_SECRET = randomBytes(24).toString('hex');
const REDIRECT_URI = 'https://client.example/callback';
const STATE_MARKER = 'state-marker-735-must-not-appear';
const PRODUCTION_MODE = createRuntimeMode({ NODE_ENV: 'production' });

type CookieJar = Map<string, string>;

interface HarnessOptions {
  readonly hops?: number;
  readonly authorizeMax?: number;
  readonly tokenMax?: number;
  readonly runtimeMode?: Pick<RuntimeMode, 'isRateLimitBypassAllowed'>;
  readonly getRedisClient?: () => Redis | null;
}

interface Harness {
  readonly base: string;
  readonly resource: string;
  readonly host: OAuthProviderHost;
  close(): Promise<void>;
}

/** 試験ごとに重ならない送信元（Redis の記録を共有しない） */
const usedIps: string[] = [];
function freshIp(): string {
  const ip = `10.${randomInt(1, 255)}.${randomInt(0, 255)}.${randomInt(1, 255)}`;
  usedIps.push(ip);
  return ip;
}

function jwkSet(): string {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  return JSON.stringify({
    keys: [{ ...privateKey.export({ format: 'jwk' }), kid: 'k735', use: 'sig', alg: 'RS256' }],
  });
}

function pkcePair(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString('base64url');
  return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') };
}

function storeCookies(jar: CookieJar, response: Response): void {
  for (const line of response.headers.getSetCookie()) {
    const [pair] = line.split(';');
    const separator = (pair ?? '').indexOf('=');
    const name = (pair ?? '').slice(0, separator);
    const value = (pair ?? '').slice(separator + 1);
    if (value === '' || /expires=Thu, 01 Jan 1970/i.test(line)) {
      jar.delete(name);
    } else {
      jar.set(name, value);
    }
  }
}

function cookieHeader(jar: CookieJar): string {
  return [...jar].map(([name, value]) => `${name}=${value}`).join('; ');
}

function authorizeUrl(h: Harness, challenge = pkcePair().challenge): string {
  const query = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: 'code',
    redirect_uri: REDIRECT_URI,
    scope: 'read write',
    resource: h.resource,
    state: STATE_MARKER,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  });
  return `${h.base}/oauth/authorize?${query.toString()}`;
}

function fromIp(ip: string): Record<string, string> {
  return { 'x-forwarded-for': ip };
}

function getAuthorize(h: Harness, headers: Record<string, string> = {}): Promise<Response> {
  return fetch(authorizeUrl(h), { redirect: 'manual', headers });
}

function postToken(
  h: Harness,
  headers: Record<string, string> = {},
  body: Record<string, string> = { grant_type: 'refresh_token', client_id: CLIENT_ID }
): Promise<Response> {
  return fetch(`${h.base}/oauth/token`, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      accept: 'application/json',
      ...headers,
    },
    body: new URLSearchParams(body).toString(),
  });
}

function expectRetryAfter(response: Response): void {
  const retryAfter = Number(response.headers.get('retry-after'));
  expect(Number.isInteger(retryAfter)).toBe(true);
  expect(retryAfter).toBeGreaterThan(0);
  expect(retryAfter).toBeLessThanOrEqual(60);
}

describe('認可の窓口の送信元 IP ごとの回数制限（タスク73.5）', () => {
  let prisma: PrismaClient;
  let redisClient: Redis;
  const harnesses: Harness[] = [];
  const userIds: string[] = [];

  async function startHarness(options: HarnessOptions = {}): Promise<Harness> {
    const expressApp = express();
    expressApp.set('trust proxy', options.hops ?? 1);
    const server = http.createServer(expressApp);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;
    const base = `http://127.0.0.1:${port}`;
    const resource = `${base}/mcp`;
    const config = parseExternalAppOAuthConfig({
      NODE_ENV: 'test',
      OAUTH_ALLOWED_CLIENTS: JSON.stringify([
        {
          clientId: CLIENT_ID,
          clientSecret: CLIENT_SECRET,
          displayName: 'Test App',
          redirectUris: [REDIRECT_URI],
        },
      ]),
      OAUTH_ISSUER: base,
      OAUTH_RESOURCE_URL: resource,
      OAUTH_JWKS: jwkSet(),
      OAUTH_COOKIE_KEYS: JSON.stringify([randomBytes(32).toString('hex')]),
      OAUTH_TOKEN_HMAC_KEY: randomBytes(32).toString('hex'),
      OAUTH_RATE_LIMIT_AUTHORIZE_MAX: String(options.authorizeMax ?? 2),
      OAUTH_RATE_LIMIT_TOKEN_MAX: String(options.tokenMax ?? 2),
      OAUTH_RATE_LIMIT_WINDOW_MS: '60000',
    });
    if (config === null) {
      throw new Error('試験の設定が読めません');
    }
    const connectionService = new ExternalAppConnectionService({
      prisma,
      auditLogService: new AuditLogService({ prisma }),
      clientRegistry: createExternalAppClientRegistry(config),
      observeAnomaly: vi.fn(),
    });
    const host = createOAuthProviderHost(config, {
      prisma,
      connectionService,
      rateLimit: {
        runtimeMode: options.runtimeMode ?? PRODUCTION_MODE,
        getRedisClient: options.getRedisClient ?? (() => null),
      },
    });
    expressApp.use(host.middleware);
    // 同意の完了（タスク74の代わりに試験だけが使う経路）
    expressApp.post('/oauth/interaction/:uid/test-finish', express.json(), async (req, res) => {
      const { accountId } = req.body as { accountId: string };
      const grant = new host.provider.Grant({ accountId, clientId: CLIENT_ID });
      grant.addResourceScope(resource, 'read write');
      const grantId = await grant.save();
      const returnTo = await host.provider.interactionResult(req, res, {
        login: { accountId },
        consent: { grantId },
      });
      res.json({ returnTo });
    });
    expressApp.use((_req, res) => {
      res.status(404).json({ passedThrough: true });
    });
    const harness: Harness = {
      base,
      resource,
      host,
      close: () => new Promise((resolve) => server.close(() => resolve())),
    };
    harnesses.push(harness);
    return harness;
  }

  async function obtainCode(
    h: Harness,
    ip: string
  ): Promise<{ code: string; verifier: string; grantId: string }> {
    const id = randomUUID();
    await prisma.user.create({
      data: {
        id,
        email: `oauth735-${id}@example.test`,
        displayName: 'OAuth 735',
        passwordHash: 'not-used',
        isActive: true,
      },
    });
    userIds.push(id);
    const jar: CookieJar = new Map();
    const { verifier, challenge } = pkcePair();
    const started = await fetch(authorizeUrl(h, challenge), {
      redirect: 'manual',
      headers: fromIp(ip),
    });
    storeCookies(jar, started);
    expect(started.status).toBe(303);
    const uid = new URL(started.headers.get('location') ?? '', h.base).pathname.split('/').pop();
    const finished = await fetch(`${h.base}/oauth/interaction/${uid}/test-finish`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: cookieHeader(jar) },
      body: JSON.stringify({ accountId: id }),
    });
    expect(finished.status).toBe(200);
    storeCookies(jar, finished);
    const { returnTo } = (await finished.json()) as { returnTo: string };
    const resumed = await fetch(`${h.base}${new URL(returnTo).pathname}`, {
      redirect: 'manual',
      headers: { cookie: cookieHeader(jar), ...fromIp(ip) },
    });
    expect(resumed.status).toBe(303);
    const redirected = new URL(resumed.headers.get('location') ?? '');
    const code = redirected.searchParams.get('code');
    if (code === null) {
      throw new Error('認可コードが返りませんでした');
    }
    const row = await prisma.oAuthStoreRecord.findFirstOrThrow({
      where: {
        kind: 'AuthorizationCode',
        payload: { path: ['accountId'], equals: id },
      },
    });
    return { code, verifier, grantId: row.grantId ?? '' };
  }

  function codeBody(h: Harness, code: string, verifier: string): Record<string, string> {
    return {
      grant_type: 'authorization_code',
      code,
      code_verifier: verifier,
      redirect_uri: REDIRECT_URI,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      resource: h.resource,
    };
  }

  function countInteractions(): Promise<number> {
    return prisma.oAuthStoreRecord.count({
      where: { kind: 'Interaction', payload: { path: ['params', 'client_id'], equals: CLIENT_ID } },
    });
  }

  beforeAll(async () => {
    prisma = getPrismaClient();
    await initRedis();
    const client = redis.getClient();
    if (client === null) {
      throw new Error('試験用の Redis に接続できません');
    }
    redisClient = client;
  });

  afterAll(async () => {
    await Promise.all(harnesses.map((harness) => harness.close()));
    const keys = usedIps.flatMap((ip) => [
      `rl:oauth-authorize:${ip}`,
      `rl:oauth-token:${ip}`,
      `rl:api:${ip}`,
    ]);
    if (keys.length > 0) {
      await redisClient.del(...keys);
    }
    await prisma.oAuthStoreRecord.deleteMany({
      where: { payload: { path: ['clientId'], equals: CLIENT_ID } },
    });
    await prisma.oAuthStoreRecord.deleteMany({
      where: { payload: { path: ['params', 'client_id'], equals: CLIENT_ID } },
    });
    if (userIds.length > 0) {
      await prisma.oAuthStoreRecord.deleteMany({
        where: {
          kind: 'Session',
          OR: userIds.map((id) => ({ payload: { path: ['accountId'], equals: id } })),
        },
      });
      await deleteAuditLogsWithArchivePermission(prisma, { targetId: { in: userIds } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    }
  });

  describe('認可の要求', () => {
    it('上限を超えると 429 と再試行までの時間を返し、手続きを作らず、転送も反映もしない', async () => {
      const h = await startHarness({ authorizeMax: 2 });
      const ip = freshIp();
      const before = await countInteractions();
      for (let i = 0; i < 2; i += 1) {
        expect((await getAuthorize(h, fromIp(ip))).status).toBe(303);
      }
      expect(await countInteractions()).toBe(before + 2);

      const limited = await getAuthorize(h, fromIp(ip));
      expect(limited.status).toBe(429);
      expectRetryAfter(limited);
      expect(limited.headers.get('location')).toBeNull();
      expect(limited.headers.get('cache-control')).toBe('no-store');
      expect(limited.headers.get('content-type')).toContain('text/html');
      expect(limited.headers.getSetCookie()).toEqual([]);
      const body = await limited.text();
      expect(body).not.toContain(STATE_MARKER);
      expect(body).not.toContain(REDIRECT_URI);
      expect(body).not.toContain(CLIENT_ID);
      expect(await countInteractions()).toBe(before + 2);
    });

    it('再開の経路も同じ枠で数える', async () => {
      const h = await startHarness({ authorizeMax: 1 });
      const ip = freshIp();
      expect((await getAuthorize(h, fromIp(ip))).status).toBe(303);
      const resumed = await fetch(`${h.base}/oauth/authorize/some-uid_1`, {
        redirect: 'manual',
        headers: fromIp(ip),
      });
      expect(resumed.status).toBe(429);
      expectRetryAfter(resumed);
    });

    it('超過を異常の検知へ送り、ログに要求の値を残さない', async () => {
      const h = await startHarness({ authorizeMax: 1 });
      const ip = freshIp();
      const warn = vi.spyOn(logger, 'warn');
      observeSecurityAnomaly.mockClear();
      await getAuthorize(h, fromIp(ip));
      const limited = await fetch(`${h.base}/oauth/authorize/secret-uid-735?code=code-735`, {
        redirect: 'manual',
        headers: fromIp(ip),
      });
      expect(limited.status).toBe(429);
      expect(observeSecurityAnomaly).toHaveBeenCalledWith(
        expect.objectContaining({ signal: 'rate_limited', sourceIp: ip })
      );
      const logged = JSON.stringify(warn.mock.calls);
      expect(logged).toContain('OAuth rate limit exceeded');
      expect(logged).not.toContain('secret-uid-735');
      expect(logged).not.toContain('code-735');
      expect(logged).not.toContain(STATE_MARKER);
      warn.mockRestore();
    });
  });

  describe('トークンの要求', () => {
    it('上限を超えると OAuth の形の 429 を返し、コードを消費せずトークンも作らない', async () => {
      const h = await startHarness({ authorizeMax: 10, tokenMax: 1 });
      const ip = freshIp();
      const { code, verifier, grantId } = await obtainCode(h, ip);

      expect((await postToken(h, fromIp(ip))).status).toBe(401);
      const limited = await postToken(h, fromIp(ip), codeBody(h, code, verifier));
      expect(limited.status).toBe(429);
      expectRetryAfter(limited);
      expect(limited.headers.get('cache-control')).toBe('no-store');
      expect(limited.headers.get('content-type')).toContain('application/json');
      const body = (await limited.json()) as Record<string, unknown>;
      expect(body.error).toBe('temporarily_unavailable');
      expect(JSON.stringify(body)).not.toContain(code);
      expect(
        await prisma.oAuthStoreRecord.count({
          where: { grantId, kind: { in: ['AccessToken', 'RefreshToken'] } },
        })
      ).toBe(0);
      const codeRow = await prisma.oAuthStoreRecord.findFirstOrThrow({
        where: { grantId, kind: 'AuthorizationCode' },
      });
      expect(codeRow.consumedAt).toBeNull();

      // 制限で止めたコードは、別の送信元からはそのまま交換できる（消費されていない）
      const other = await postToken(h, fromIp(freshIp()), codeBody(h, code, verifier));
      expect(other.status).toBe(200);
    });

    it('Basic の拒否より前に数える', async () => {
      const h = await startHarness({ tokenMax: 1 });
      const ip = freshIp();
      const basic = { ...fromIp(ip), authorization: 'Basic eDp5' };
      expect((await postToken(h, basic)).status).toBe(401);
      expect((await postToken(h, basic)).status).toBe(429);
    });
  });

  describe('数える範囲', () => {
    it('認可とトークンは別々に数える', async () => {
      const h = await startHarness({ authorizeMax: 1, tokenMax: 1 });
      const ip = freshIp();
      expect((await getAuthorize(h, fromIp(ip))).status).toBe(303);
      expect((await getAuthorize(h, fromIp(ip))).status).toBe(429);
      expect((await postToken(h, fromIp(ip))).status).toBe(401);
      expect((await postToken(h, fromIp(ip))).status).toBe(429);
    });

    it('メタデータ・JWKS・トークンの OPTIONS・担当外の経路は数えない', async () => {
      const h = await startHarness({ authorizeMax: 1, tokenMax: 1 });
      const ip = freshIp();
      for (let i = 0; i < 3; i += 1) {
        const metadata = await fetch(`${h.base}/.well-known/oauth-authorization-server`, {
          headers: fromIp(ip),
        });
        expect(metadata.status).toBe(200);
        expect(metadata.headers.get('ratelimit-limit')).toBeNull();
        const jwks = await fetch(`${h.base}/oauth/jwks`, { headers: fromIp(ip) });
        expect(jwks.status).toBe(200);
        expect(jwks.headers.get('ratelimit-limit')).toBeNull();
        const preflight = await fetch(`${h.base}/oauth/token`, {
          method: 'OPTIONS',
          headers: {
            ...fromIp(ip),
            origin: 'https://client.example',
            'access-control-request-method': 'POST',
          },
        });
        expect(preflight.status).not.toBe(429);
        const unknown = await fetch(`${h.base}/oauth/unknown`, { headers: fromIp(ip) });
        expect(unknown.status).toBe(404);
      }
      expect((await getAuthorize(h, fromIp(ip))).status).toBe(303);
      expect((await postToken(h, fromIp(ip))).status).toBe(401);
    });
  });

  describe('送信元の判定（TRUST_PROXY_HOPS）', () => {
    it('段数 1: 利用者が先頭に足した値を変えても同じ枠で数える', async () => {
      const h = await startHarness({ hops: 1, tokenMax: 2 });
      const real = freshIp();
      for (let i = 0; i < 2; i += 1) {
        const response = await postToken(h, { 'x-forwarded-for': `198.51.100.${i}, ${real}` });
        expect(response.status).toBe(401);
      }
      const forged = await postToken(h, { 'x-forwarded-for': `198.51.100.99, ${real}` });
      expect(forged.status).toBe(429);
    });

    it('段数 1: 信頼する中継が付けた送信元が違えば別の枠になる', async () => {
      const h = await startHarness({ hops: 1, tokenMax: 1 });
      expect((await postToken(h, fromIp(freshIp()))).status).toBe(401);
      expect((await postToken(h, fromIp(freshIp()))).status).toBe(401);
    });

    it('段数 0: 転送ヘッダーを読まず、接続元で数える', async () => {
      const h = await startHarness({ hops: 0, tokenMax: 2 });
      for (let i = 0; i < 2; i += 1) {
        const response = await postToken(h, { 'x-forwarded-for': `198.51.100.${i}` });
        expect(response.status).toBe(401);
      }
      const forged = await postToken(h, { 'x-forwarded-for': '198.51.100.200' });
      expect(forged.status).toBe(429);
    });
  });

  describe('無効化の設定', () => {
    it.each([
      ['production', { NODE_ENV: 'production', DISABLE_RATE_LIMIT: 'true' }],
      ['未設定', { DISABLE_RATE_LIMIT: 'true' }],
      ['未知の値', { NODE_ENV: 'staging', DISABLE_RATE_LIMIT: 'true' }],
      ['development で明示なし', { NODE_ENV: 'development' }],
    ])('%s では制限が掛かる', async (_name, env) => {
      const h = await startHarness({
        tokenMax: 1,
        runtimeMode: createRuntimeMode(env as NodeJS.ProcessEnv),
      });
      const ip = freshIp();
      expect((await postToken(h, fromIp(ip))).status).toBe(401);
      expect((await postToken(h, fromIp(ip))).status).toBe(429);
    });

    it.each([
      ['test', { NODE_ENV: 'test' }],
      ['development で明示', { NODE_ENV: 'development', DISABLE_RATE_LIMIT: 'true' }],
    ])('%s では既存の制限と同じく外れる', async (_name, env) => {
      const h = await startHarness({
        tokenMax: 1,
        runtimeMode: createRuntimeMode(env as NodeJS.ProcessEnv),
      });
      const ip = freshIp();
      expect((await postToken(h, fromIp(ip))).status).toBe(401);
      expect((await postToken(h, fromIp(ip))).status).toBe(401);
    });

    it('搭載は与えられた環境変数の実行環境で判定する（本番では無効化を無視する）', async () => {
      const expressApp: Express = express();
      expressApp.set('trust proxy', 1);
      const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
      const host = mountExternalAppOAuth(expressApp, prisma, {
        NODE_ENV: 'production',
        DISABLE_RATE_LIMIT: 'true',
        OAUTH_ALLOWED_CLIENTS: JSON.stringify([
          {
            clientId: CLIENT_ID,
            clientSecret: randomBytes(24).toString('hex'),
            displayName: 'Test App',
            redirectUris: [REDIRECT_URI],
          },
        ]),
        OAUTH_ISSUER: 'https://auth.architrack.test',
        OAUTH_RESOURCE_URL: 'https://auth.architrack.test/mcp',
        OAUTH_JWKS: JSON.stringify({
          keys: [{ ...privateKey.export({ format: 'jwk' }), kid: 'p', use: 'sig', alg: 'RS256' }],
        }),
        OAUTH_COOKIE_KEYS: JSON.stringify([randomBytes(32).toString('hex')]),
        OAUTH_TOKEN_HMAC_KEY: randomBytes(32).toString('hex'),
        OAUTH_RATE_LIMIT_TOKEN_MAX: '1',
      } as NodeJS.ProcessEnv);
      expect(host).not.toBeNull();
      const server = http.createServer(expressApp);
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
      const { port } = server.address() as AddressInfo;
      const base = `http://127.0.0.1:${port}`;
      const ip = freshIp();
      const send = () =>
        fetch(`${base}/oauth/token`, {
          method: 'POST',
          headers: {
            'content-type': 'application/x-www-form-urlencoded',
            'x-forwarded-for': ip,
          },
          body: 'grant_type=refresh_token',
        });
      try {
        expect((await send()).status).not.toBe(429);
        expect((await send()).status).toBe(429);
      } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    });
  });

  describe('Redis', () => {
    it('専用の接頭辞で Redis に数え、既存の制限の枠を使わない', async () => {
      const h = await startHarness({
        authorizeMax: 5,
        tokenMax: 5,
        getRedisClient: () => redisClient,
      });
      const ip = freshIp();
      await getAuthorize(h, fromIp(ip));
      await postToken(h, fromIp(ip));
      await postToken(h, fromIp(ip));
      expect(await redisClient.get(`rl:oauth-authorize:${ip}`)).toBe('1');
      expect(await redisClient.get(`rl:oauth-token:${ip}`)).toBe('2');
      expect(await redisClient.get(`rl:api:${ip}`)).toBeNull();
      expect(await redisClient.pttl(`rl:oauth-token:${ip}`)).toBeGreaterThan(0);
    });

    it('Redis の操作が失敗しても要求は落ちず、メモリの記録で制限を続ける', async () => {
      const broken = {
        eval: vi.fn().mockRejectedValue(new Error('redis is down')),
      } as unknown as Redis;
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const h = await startHarness({ tokenMax: 1, getRedisClient: () => broken });
      const ip = freshIp();
      expect((await postToken(h, fromIp(ip))).status).toBe(401);
      expect((await postToken(h, fromIp(ip))).status).toBe(429);
      expect(broken.eval).toHaveBeenCalled();
      warn.mockRestore();
    });

    it('Redis が無くてもメモリの記録で制限する', async () => {
      const h = await startHarness({ tokenMax: 1, getRedisClient: () => null });
      const ip = freshIp();
      expect((await postToken(h, fromIp(ip))).status).toBe(401);
      expect((await postToken(h, fromIp(ip))).status).toBe(429);
    });
  });

  describe('設定が無い環境', () => {
    it('何も載せず、窓口の制限の値を読まず、既存の API の上限を変えない', async () => {
      const expressApp: Express = express();
      expressApp.set('trust proxy', 1);
      const host = mountExternalAppOAuth(expressApp, prisma, {
        NODE_ENV: 'production',
        OAUTH_RATE_LIMIT_AUTHORIZE_MAX: 'not-a-number',
        OAUTH_RATE_LIMIT_TOKEN_MAX: '0',
        OAUTH_RATE_LIMIT_WINDOW_MS: '-1',
      } as NodeJS.ProcessEnv);
      expect(host).toBeNull();

      const { api } = createRateLimiters({
        runtimeMode: PRODUCTION_MODE,
        getRedisClient: () => redisClient,
      });
      expressApp.use('/api', api, (_req, res) => {
        res.json({ ok: true });
      });
      expressApp.use((_req, res) => {
        res.status(404).json({ passedThrough: true });
      });
      const server = http.createServer(expressApp);
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
      const { port } = server.address() as AddressInfo;
      const base = `http://127.0.0.1:${port}`;
      const ip = freshIp();
      try {
        for (const [method, path] of [
          ['GET', '/oauth/authorize'],
          ['GET', '/oauth/authorize/abc'],
          ['POST', '/oauth/token'],
        ] as const) {
          const response = await fetch(`${base}${path}`, { method, headers: fromIp(ip) });
          expect(response.status).toBe(404);
          expect(response.headers.get('ratelimit-limit')).toBeNull();
        }
        expect(await redisClient.get(`rl:oauth-authorize:${ip}`)).toBeNull();
        expect(await redisClient.get(`rl:oauth-token:${ip}`)).toBeNull();

        const apiResponse = await fetch(`${base}/api/ping`, { headers: fromIp(ip) });
        expect(apiResponse.status).toBe(200);
        expect(apiResponse.headers.get('ratelimit-limit')).toBe('100');
        expect(await redisClient.get(`rl:api:${ip}`)).toBe('1');
      } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    });
  });
});
