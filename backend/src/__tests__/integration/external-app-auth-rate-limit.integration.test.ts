/**
 * @fileoverview 外部アプリ用の窓口の利用者ごとの回数制限と送信元の受け渡しの統合検証（user-authentication タスク 75.2）
 *
 * 試験の実行環境では制限が外れるので、`mountExternalAppOAuth` に開発（無効化の明示なし）と本番の
 * 環境変数を与えて、実際の HTTP・oidc-provider・PostgreSQL・Redis で確かめる。
 * - 51.4: 利用者の全ての接続を合算して数え、超えたら 429 と Retry-After。別の利用者は数えない
 * - 51.5: 回数と集計期間を環境変数で変えられる
 * - 51.6: 本番では無効化の設定を無視する
 * - 要求の送信元 IP（`trust proxy` の段数で決めた値）とユーザーエージェントを検証へ渡す
 *
 * Design: Requirements 46-51 > ExternalAppAuthMiddleware
 *
 * @requirement user-authentication/REQ-51.4
 * @requirement user-authentication/REQ-51.5
 * @requirement user-authentication/REQ-51.6
 * @requirement user-authentication/REQ-51.7
 */

import { createHash, generateKeyPairSync, randomBytes, randomUUID } from 'crypto';
import http from 'http';
import type { AddressInfo } from 'net';
import express from 'express';
import type Redis from 'ioredis';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const { observeSecurityAnomaly } = vi.hoisted(() => ({ observeSecurityAnomaly: vi.fn() }));

vi.mock('../../services/security-anomaly-monitor.service.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/security-anomaly-monitor.service.js')>()),
  observeSecurityAnomaly,
}));

import { validateEnv } from '../../config/env.js';
import type { PrismaClient } from '../../generated/prisma/client.js';

validateEnv();

import getPrismaClient from '../../db.js';
import { ExternalAppConfigError } from '../../oauth/client-registry.js';
import { mountExternalAppOAuth, type MountedExternalAppOAuth } from '../../oauth/provider.js';
import redis, { initRedis } from '../../redis.js';
import { mountExternalAppResourceRoutes } from '../../routes/external-app.routes.js';
import {
  CONNECTION_ABSOLUTE_MS,
  CONNECTION_IDLE_MS,
} from '../../services/external-app-connection.service.js';
import { deleteAuditLogsWithArchivePermission } from '../../utils/audit-log-archive-permission.js';
import { createTestUser } from './test-user-factory.js';

const CLIENT_IDS = ['test-oauth752-rl-client-a', 'test-oauth752-rl-client-b'] as const;
const REDIRECT_URI = 'https://client.example/callback';
const WHOAMI = '/oauth/resource/whoami';
const PRODUCTION_ISSUER = 'https://auth.architrack.test';
const DAY_MS = 24 * 60 * 60 * 1000;

type ClientId = (typeof CLIENT_IDS)[number];
type CookieJar = Map<string, string>;

interface Harness {
  readonly base: string;
  readonly resource: string;
  readonly mounted: MountedExternalAppOAuth;
  readonly secrets: Record<ClientId, string>;
}

interface Connected {
  readonly userId: string;
  readonly connectionId: string;
  readonly accessToken: string;
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

describe('外部アプリ用の窓口の利用者ごとの回数制限（タスク75.2）', () => {
  let prisma: PrismaClient;
  let redisClient: Redis;
  const servers: http.Server[] = [];
  const userIds: string[] = [];
  const roleIds: string[] = [];

  /**
   * 与えた環境変数で `app.ts` と同じ搭載の関数を使い、認可サーバーと確認用の窓口を載せる
   */
  async function startHarness(
    env: Record<string, string> = {},
    options: { production?: boolean } = {}
  ): Promise<Harness> {
    const expressApp = express();
    expressApp.set('trust proxy', 1);
    const server = http.createServer(expressApp);
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;
    const base = `http://127.0.0.1:${port}`;
    const issuer = options.production ? PRODUCTION_ISSUER : base;
    const resource = `${issuer}/mcp`;
    const secrets = Object.fromEntries(
      CLIENT_IDS.map((clientId) => [clientId, randomBytes(24).toString('hex')])
    ) as Record<ClientId, string>;
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const mounted = mountExternalAppOAuth(expressApp, prisma, {
      NODE_ENV: options.production ? 'production' : 'development',
      OAUTH_ALLOWED_CLIENTS: JSON.stringify(
        CLIENT_IDS.map((clientId) => ({
          clientId,
          clientSecret: secrets[clientId],
          displayName: `App ${clientId}`,
          redirectUris: [REDIRECT_URI],
        }))
      ),
      OAUTH_ISSUER: issuer,
      OAUTH_RESOURCE_URL: resource,
      OAUTH_JWKS: JSON.stringify({
        keys: [{ ...privateKey.export({ format: 'jwk' }), kid: 'k752', use: 'sig', alg: 'RS256' }],
      }),
      OAUTH_COOKIE_KEYS: JSON.stringify([randomBytes(32).toString('hex')]),
      OAUTH_TOKEN_HMAC_KEY: randomBytes(32).toString('hex'),
      // 接続の準備で認可の窓口の制限（73.5）に当たらないようにする
      OAUTH_RATE_LIMIT_AUTHORIZE_MAX: '100000',
      OAUTH_RATE_LIMIT_TOKEN_MAX: '100000',
      ...env,
    } as NodeJS.ProcessEnv);
    if (mounted === null) {
      throw new Error('認可サーバーが載りませんでした');
    }
    mountExternalAppResourceRoutes(expressApp, mounted);
    // 同意の完了（タスク74の手続きの代わりに試験だけが使う経路）。本番には載せない
    expressApp.post('/oauth/interaction/:uid/test-finish', express.json(), async (req, res) => {
      const { accountId, clientId } = req.body as { accountId: string; clientId: string };
      const grant = new mounted.provider.Grant({ accountId, clientId });
      grant.addResourceScope(resource, 'read write');
      const grantId = await grant.save();
      const returnTo = await mounted.provider.interactionResult(req, res, {
        login: { accountId },
        consent: { grantId },
      });
      res.json({ returnTo, grantId });
    });
    return { base, resource, mounted, secrets };
  }

  async function createUser(): Promise<string> {
    const id = randomUUID();
    await createTestUser(prisma, {
      id,
      email: `oauth752rl-${id}@example.test`,
      displayName: 'OAuth 752 RL',
      passwordHash: 'not-used',
    });
    userIds.push(id);
    const permission = await prisma.permission.findUniqueOrThrow({
      where: { resource_action: { resource: 'external_app', action: 'connect' } },
    });
    const role = await prisma.role.create({
      data: { name: `oauth752rl-${randomUUID()}`, description: 'oauth752rl' },
    });
    roleIds.push(role.id);
    await prisma.rolePermission.create({ data: { roleId: role.id, permissionId: permission.id } });
    await prisma.userRole.create({ data: { userId: id, roleId: role.id } });
    return id;
  }

  /** 認可コードを発行して交換し、接続の行を作る */
  async function connect(
    h: Harness,
    userId: string,
    clientId: ClientId = CLIENT_IDS[0]
  ): Promise<Connected> {
    const jar: CookieJar = new Map();
    const verifier = randomBytes(32).toString('base64url');
    const query = new URLSearchParams({
      client_id: clientId,
      response_type: 'code',
      redirect_uri: REDIRECT_URI,
      scope: 'read write',
      resource: h.resource,
      state: 'state-752',
      code_challenge: createHash('sha256').update(verifier).digest('base64url'),
      code_challenge_method: 'S256',
    });
    const started = await fetch(`${h.base}/oauth/authorize?${query.toString()}`, {
      redirect: 'manual',
    });
    storeCookies(jar, started);
    expect(started.status).toBe(303);
    const uid = new URL(started.headers.get('location') ?? '', h.base).pathname.split('/').pop();
    const finished = await fetch(`${h.base}/oauth/interaction/${uid}/test-finish`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: cookieHeader(jar),
        'x-forwarded-proto': new URL(h.resource).protocol.slice(0, -1),
      },
      body: JSON.stringify({ accountId: userId, clientId }),
    });
    expect(finished.status).toBe(200);
    const { returnTo, grantId } = (await finished.json()) as { returnTo: string; grantId: string };
    const resumed = await fetch(`${h.base}${new URL(returnTo).pathname}`, {
      redirect: 'manual',
      headers: { cookie: cookieHeader(jar) },
    });
    expect(resumed.status).toBe(303);
    const code = new URL(resumed.headers.get('location') ?? '').searchParams.get('code') ?? '';
    const now = new Date();
    const connection = await prisma.externalAppConnection.create({
      data: {
        userId,
        clientId,
        grantId,
        scopes: ['read', 'write'],
        consentedAt: now,
        expiresAt: new Date(now.getTime() + CONNECTION_ABSOLUTE_MS),
      },
    });
    const tokens = await fetch(`${h.base}/oauth/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        code_verifier: verifier,
        redirect_uri: REDIRECT_URI,
        client_id: clientId,
        client_secret: h.secrets[clientId],
        resource: h.resource,
      }).toString(),
    });
    expect(tokens.status).toBe(200);
    const body = (await tokens.json()) as { access_token: string };
    return { userId, connectionId: connection.id, accessToken: body.access_token };
  }

  function whoami(
    h: Harness,
    token?: string,
    headers: Record<string, string> = {}
  ): Promise<Response> {
    return fetch(`${h.base}${WHOAMI}`, {
      headers: {
        ...(token === undefined ? {} : { authorization: `Bearer ${token}` }),
        ...headers,
      },
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
    await Promise.all(
      servers.map((server) => new Promise<void>((resolve) => server.close(() => resolve())))
    );
    if (userIds.length > 0) {
      await redisClient.del(...userIds.map((id) => `rl:external-app:user:${id}`));
    }
    await prisma.externalAppConnection.deleteMany({ where: { userId: { in: userIds } } });
    for (const clientId of CLIENT_IDS) {
      await prisma.oAuthStoreRecord.deleteMany({
        where: { payload: { path: ['clientId'], equals: clientId } },
      });
      await prisma.oAuthStoreRecord.deleteMany({
        where: { payload: { path: ['params', 'client_id'], equals: clientId } },
      });
    }
    await prisma.oAuthStoreRecord.deleteMany({
      where: {
        kind: 'Session',
        OR: userIds.map((id) => ({ payload: { path: ['accountId'], equals: id } })),
      },
    });
    await deleteAuditLogsWithArchivePermission(prisma, { targetId: { in: userIds } });
    await prisma.userRole.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.rolePermission.deleteMany({ where: { roleId: { in: roleIds } } });
    await prisma.role.deleteMany({ where: { id: { in: roleIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await redis.disconnect();
  });

  describe('既定の上限（51.4）', () => {
    it('設定が無ければ 1 分 120 回で、121 回目に 429 と Retry-After を返す', async () => {
      const h = await startHarness();
      const userId = await createUser();
      const connected = await connect(h, userId);

      const first = await whoami(h, connected.accessToken);
      expect(first.status).toBe(200);
      expect(first.headers.get('ratelimit-limit')).toBe('120');
      expect(Number(first.headers.get('ratelimit-reset'))).toBeLessThanOrEqual(60);
      expect(await redisClient.get(`rl:external-app:user:${userId}`)).toBe('1');
      const ttl = await redisClient.pttl(`rl:external-app:user:${userId}`);
      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(60_000);

      for (let count = 2; count <= 120; count += 1) {
        expect((await whoami(h, connected.accessToken)).status).toBe(200);
      }
      const limited = await whoami(h, connected.accessToken);
      expect(limited.status).toBe(429);
      const retryAfter = Number(limited.headers.get('retry-after'));
      expect(retryAfter).toBeGreaterThan(0);
      expect(retryAfter).toBeLessThanOrEqual(60);
      expect(limited.headers.get('cache-control')).toBe('no-store');
      expect(await limited.json()).toEqual({
        error: 'rate_limited',
        retryAfterSeconds: retryAfter,
      });
      expect(observeSecurityAnomaly).toHaveBeenCalledWith(
        expect.objectContaining({ signal: 'rate_limited' })
      );
    });
  });

  describe('数える単位（51.4）', () => {
    it('同じ利用者の 2 つの接続を合算し、別の利用者は数えない', async () => {
      const h = await startHarness({ EXTERNAL_APP_RATE_LIMIT_MAX: '3' });
      const userId = await createUser();
      const first = await connect(h, userId, CLIENT_IDS[0]);
      const second = await connect(h, userId, CLIENT_IDS[1]);
      const other = await connect(h, await createUser(), CLIENT_IDS[0]);

      expect((await whoami(h, first.accessToken)).status).toBe(200);
      expect((await whoami(h, second.accessToken)).status).toBe(200);
      expect((await whoami(h, first.accessToken)).status).toBe(200);
      expect((await whoami(h, second.accessToken)).status).toBe(429);
      expect((await whoami(h, first.accessToken)).status).toBe(429);

      expect((await whoami(h, other.accessToken)).status).toBe(200);
    });

    it('送信元 IP が違っても同じ利用者として数える', async () => {
      const h = await startHarness({ EXTERNAL_APP_RATE_LIMIT_MAX: '1' });
      const connected = await connect(h, await createUser());
      const fromFirst = await whoami(h, connected.accessToken, {
        'x-forwarded-for': '198.51.100.21',
      });
      expect(fromFirst.status).toBe(200);
      const fromSecond = await whoami(h, connected.accessToken, {
        'x-forwarded-for': '198.51.100.22',
      });
      expect(fromSecond.status).toBe(429);
    });

    it('認証に失敗した要求は利用者の枠を消費しない', async () => {
      const h = await startHarness({ EXTERNAL_APP_RATE_LIMIT_MAX: '2' });
      const connected = await connect(h, await createUser());
      for (let index = 0; index < 5; index += 1) {
        expect((await whoami(h, `${connected.accessToken}x`)).status).toBe(401);
        expect((await whoami(h)).status).toBe(401);
      }
      expect(await redisClient.get(`rl:external-app:user:${connected.userId}`)).toBeNull();
      expect((await whoami(h, connected.accessToken)).status).toBe(200);
      expect((await whoami(h, connected.accessToken)).status).toBe(200);
      expect((await whoami(h, connected.accessToken)).status).toBe(429);
    });
  });

  describe('環境ごとの設定（51.5）', () => {
    it('集計期間を環境変数で変えられる', async () => {
      const h = await startHarness({
        EXTERNAL_APP_RATE_LIMIT_MAX: '1',
        EXTERNAL_APP_RATE_LIMIT_WINDOW_MS: '5000',
      });
      const connected = await connect(h, await createUser());
      const first = await whoami(h, connected.accessToken);
      expect(first.headers.get('ratelimit-limit')).toBe('1');
      const ttl = await redisClient.pttl(`rl:external-app:user:${connected.userId}`);
      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(5000);
      const limited = await whoami(h, connected.accessToken);
      expect(limited.status).toBe(429);
      expect(Number(limited.headers.get('retry-after'))).toBeLessThanOrEqual(5);
    });

    it.each([
      ['EXTERNAL_APP_RATE_LIMIT_MAX', '0'],
      ['EXTERNAL_APP_RATE_LIMIT_WINDOW_MS', 'forever'],
    ])('%s が不正（%s）なら搭載で起動を止める', async (name, value) => {
      await expect(startHarness({ [name]: value })).rejects.toBeInstanceOf(ExternalAppConfigError);
    });
  });

  describe('無効化の設定（51.6）', () => {
    it('本番では DISABLE_RATE_LIMIT を無視して制限する', async () => {
      const h = await startHarness(
        { DISABLE_RATE_LIMIT: 'true', EXTERNAL_APP_RATE_LIMIT_MAX: '1' },
        { production: true }
      );
      const connected = await connect(h, await createUser());
      expect((await whoami(h, connected.accessToken)).status).toBe(200);
      expect((await whoami(h, connected.accessToken)).status).toBe(429);
    });

    it('開発で無効化を明示したときだけ既存の判定どおり外れる', async () => {
      const h = await startHarness({
        DISABLE_RATE_LIMIT: 'true',
        EXTERNAL_APP_RATE_LIMIT_MAX: '1',
      });
      const connected = await connect(h, await createUser());
      expect((await whoami(h, connected.accessToken)).status).toBe(200);
      expect((await whoami(h, connected.accessToken)).status).toBe(200);
    });
  });

  describe('送信元の受け渡し', () => {
    it('要求の中で期限切れになった接続の監査に、信頼する段数で決めた IP とユーザーエージェントが残る', async () => {
      const h = await startHarness();
      const userId = await createUser();
      const connected = await connect(h, userId);
      const now = new Date();
      await prisma.externalAppConnection.update({
        where: { id: connected.connectionId },
        data: {
          consentedAt: new Date(now.getTime() - 40 * DAY_MS),
          lastUsedAt: new Date(now.getTime() - CONNECTION_IDLE_MS - 1000),
          expiresAt: new Date(now.getTime() + 50 * DAY_MS),
        },
      });

      const response = await whoami(h, connected.accessToken, {
        'x-forwarded-for': '192.0.2.99, 203.0.113.75',
        'user-agent': 'oauth-752-integration-agent',
      });

      expect(response.status).toBe(401);
      const audit = await prisma.auditLog.findFirstOrThrow({
        where: { action: 'CONNECTION_ENDED', targetId: userId },
      });
      expect(audit.metadata).toMatchObject({
        reason: 'IDLE_EXPIRED',
        ipAddress: '203.0.113.75',
        userAgent: 'oauth-752-integration-agent',
      });
    });
  });
});
