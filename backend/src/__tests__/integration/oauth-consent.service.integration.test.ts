/**
 * @fileoverview 同意の手続きを実際の認可サーバーと実 DB・Redis で確かめる（user-authentication タスク 74.2）
 *
 * HTTP の API はタスク74.3 が持つので、試験だけの経路からサービスを呼ぶ。
 *
 * @requirement user-authentication/REQ-46.2
 * @requirement user-authentication/REQ-46.3
 * @requirement user-authentication/REQ-46.7
 * @requirement user-authentication/REQ-47.1
 * @requirement user-authentication/REQ-47.2
 * @requirement user-authentication/REQ-47.4
 * @requirement user-authentication/REQ-47.6
 * @requirement user-authentication/REQ-47.7
 * @requirement user-authentication/REQ-47.8
 * @requirement user-authentication/REQ-51.7
 */

import { createHash, generateKeyPairSync, randomBytes, randomUUID } from 'crypto';
import http from 'http';
import type { AddressInfo } from 'net';
import express from 'express';
import { authenticator } from 'otplib';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import getPrismaClient from '../../db.js';
import type { PrismaClient } from '../../generated/prisma/client.js';
import {
  createExternalAppClientRegistry,
  parseExternalAppOAuthConfig,
} from '../../oauth/client-registry.js';
import type { ExternalAppScope } from '../../oauth/oauth.types.js';
import { createOAuthProviderHost, type OAuthProviderHost } from '../../oauth/provider.js';
import {
  OAuthStoreAdapter,
  OAuthStoreError,
  withInteractionTransaction,
} from '../../oauth/store-adapter.js';
import redis, { initRedis } from '../../redis.js';
import { AuditLogService } from '../../services/audit-log.service.js';
import { ExternalAppConnectionService } from '../../services/external-app-connection.service.js';
import {
  CONSENT_PASS_TTL_SECONDS,
  ConsentInteractionService,
  consentPassKey,
  type ConsentInteractionServiceDependencies,
} from '../../services/oauth-consent.service.js';
import { SecondFactorVerifier } from '../../services/second-factor-verifier.service.js';
import { TwoFactorChallengeService } from '../../services/two-factor-challenge.service.js';
import { TwoFactorService } from '../../services/two-factor.service.js';
import { deleteAuditLogsWithArchivePermission } from '../../utils/audit-log-archive-permission.js';
import { createTestUser, type TestUserState } from './test-user-factory.js';

const CLIENT_ID = 'test-oauth742-client';
const CLIENT_SECRET = randomBytes(24).toString('hex');
const REDIRECT_URI = 'https://client.example/callback';
const SOURCE = { ipAddress: '203.0.113.42', userAgent: 'oauth-742-integration' };

type CookieJar = Map<string, string>;

interface ServiceReply {
  readonly ok: boolean;
  readonly value?: {
    redirectTo?: string;
    requestedScopes?: string[];
    secondFactorVerified?: boolean;
    appName?: string;
    redirectHost?: string;
    account?: { email: string };
  };
  readonly error?: { type: string; restriction?: string; unlockAt?: string };
}

interface Flow {
  readonly jar: CookieJar;
  readonly uid: string;
  readonly verifier: string;
}

interface ConsentUser {
  readonly id: string;
  readonly secret: string;
  readonly roleId: string | null;
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

describe('同意の手続き（タスク74.2）', () => {
  let prisma: PrismaClient;
  let host: OAuthProviderHost;
  let connectionService: ExternalAppConnectionService;
  let verifier: SecondFactorVerifier;
  let serviceDeps: ConsentInteractionServiceDependencies;
  let service: ConsentInteractionService;
  let server: http.Server;
  let base: string;
  let resource: string;
  const userIds: string[] = [];
  const roleIds: string[] = [];
  const flowUids = new Set<string>();

  beforeAll(async () => {
    prisma = getPrismaClient();
    await initRedis();
    expect(redis.getClient()?.status).toBe('ready');

    const expressApp = express();
    expressApp.set('trust proxy', 1);
    server = http.createServer(expressApp);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;
    base = `http://127.0.0.1:${port}`;
    resource = `${base}/mcp`;
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const config = parseExternalAppOAuthConfig({
      NODE_ENV: 'test',
      OAUTH_ALLOWED_CLIENTS: JSON.stringify([
        {
          clientId: CLIENT_ID,
          clientSecret: CLIENT_SECRET,
          displayName: 'Consent Test App',
          redirectUris: [REDIRECT_URI],
        },
      ]),
      OAUTH_ISSUER: base,
      OAUTH_RESOURCE_URL: resource,
      OAUTH_JWKS: JSON.stringify({
        keys: [{ ...privateKey.export({ format: 'jwk' }), kid: 'k1', use: 'sig', alg: 'RS256' }],
      }),
      OAUTH_COOKIE_KEYS: JSON.stringify([randomBytes(32).toString('hex')]),
      OAUTH_TOKEN_HMAC_KEY: randomBytes(32).toString('hex'),
    });
    if (config === null) {
      throw new Error('試験の設定が読めません');
    }
    const clientRegistry = createExternalAppClientRegistry(config);
    connectionService = new ExternalAppConnectionService({
      prisma,
      auditLogService: new AuditLogService({ prisma }),
      clientRegistry,
      observeAnomaly: vi.fn(),
    });
    host = createOAuthProviderHost(config, { prisma, connectionService });
    verifier = new SecondFactorVerifier(prisma, new TwoFactorService());
    serviceDeps = {
      prisma,
      provider: host.provider,
      connectionService,
      secondFactorVerifier: verifier,
      clientRegistry,
      resourceUrl: resource,
      getRedis: () => redis.getClient(),
    };
    service = new ConsentInteractionService(serviceDeps);

    expressApp.use(host.middleware);
    // 同意の API（タスク74.3）の代わりに試験だけが使う経路
    expressApp.post('/oauth/interaction/:uid/test/:action', express.json(), async (req, res) => {
      const { userId, scopes, code } = req.body as {
        userId: string;
        scopes?: ExternalAppScope[];
        code?: { type: 'totp' | 'backup'; code: string };
      };
      const ctx = { req, res, uid: String(req.params.uid), source: SOURCE };
      switch (req.params.action) {
        case 'get':
          res.json(await service.getInteraction(ctx, userId));
          return;
        case 'verify':
          res.json(
            await service.verifySecondFactor(ctx, userId, code ?? { type: 'totp', code: '' })
          );
          return;
        case 'approve':
          res.json(await service.approve(ctx, userId, scopes ?? []));
          return;
        case 'deny':
          res.json(await service.deny(ctx, userId));
          return;
        default:
          res.status(404).end();
      }
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    service = new ConsentInteractionService(serviceDeps);
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await prisma.externalAppConnection.deleteMany({ where: { clientId: CLIENT_ID } });
    await prisma.oAuthStoreRecord.deleteMany({
      where: { payload: { path: ['clientId'], equals: CLIENT_ID } },
    });
    await prisma.oAuthStoreRecord.deleteMany({
      where: { payload: { path: ['params', 'client_id'], equals: CLIENT_ID } },
    });
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
    // この試験の申し込みの鍵だけを消す（鍵の第 4 区切りが申し込みの ID）
    const client = redis.getClient();
    if (!client) {
      throw new Error('Redis の接続がありません');
    }
    let cursor = '0';
    do {
      const [next, keys] = await client.scan(cursor, 'MATCH', 'oauth:consent:*', 'COUNT', 500);
      cursor = next;
      const own = keys.filter((key) => flowUids.has(key.split(':')[3] ?? ''));
      if (own.length > 0) {
        await client.del(...own);
      }
    } while (cursor !== '0');
    await redis.disconnect();
  });

  async function createUser(
    options: { permitted?: boolean; state?: TestUserState } = {}
  ): Promise<ConsentUser> {
    const secret = authenticator.generateSecret();
    const id = randomUUID();
    await createTestUser(
      prisma,
      {
        id,
        email: `oauth742-${id}@example.test`,
        displayName: 'OAuth 742',
        passwordHash: 'not-used',
      },
      { twoFactor: { secret }, ...options.state }
    );
    userIds.push(id);
    let roleId: string | null = null;
    if (options.permitted ?? true) {
      const permission = await prisma.permission.findUniqueOrThrow({
        where: { resource_action: { resource: 'external_app', action: 'connect' } },
      });
      const role = await prisma.role.create({
        data: { name: `oauth742-${randomUUID()}`, description: 'oauth742' },
      });
      roleIds.push(role.id);
      roleId = role.id;
      await prisma.rolePermission.create({
        data: { roleId: role.id, permissionId: permission.id },
      });
      await prisma.userRole.create({ data: { userId: id, roleId: role.id } });
    }
    return { id, secret, roleId };
  }

  async function startRaw(
    scope: string | undefined,
    prompt?: string
  ): Promise<{ response: Response; flow: Flow }> {
    const jar: CookieJar = new Map();
    const pkceVerifier = randomBytes(32).toString('base64url');
    const query = new URLSearchParams({
      client_id: CLIENT_ID,
      response_type: 'code',
      redirect_uri: REDIRECT_URI,
      resource,
      state: 'state-742',
      code_challenge: createHash('sha256').update(pkceVerifier).digest('base64url'),
      code_challenge_method: 'S256',
    });
    if (scope !== undefined) {
      query.set('scope', scope);
    }
    if (prompt !== undefined) {
      query.set('prompt', prompt);
    }
    const response = await fetch(`${base}/oauth/authorize?${query.toString()}`, {
      redirect: 'manual',
    });
    storeCookies(jar, response);
    const location = response.headers.get('location') ?? '';
    const uid = location.startsWith('/oauth/interaction/') ? (location.split('/').pop() ?? '') : '';
    flowUids.add(uid);
    return { response, flow: { jar, uid, verifier: pkceVerifier } };
  }

  async function start(scope = 'offline_access read write', prompt?: string): Promise<Flow> {
    const { response, flow } = await startRaw(scope, prompt);
    expect(response.status).toBe(303);
    expect(flow.uid).not.toBe('');
    return flow;
  }

  async function call(
    flow: Flow,
    action: 'get' | 'verify' | 'approve' | 'deny',
    body: Record<string, unknown>,
    options: { uid?: string; headers?: Record<string, string> } = {}
  ): Promise<ServiceReply> {
    const response = await fetch(
      `${base}/oauth/interaction/${options.uid ?? flow.uid}/test/${action}`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: cookieHeader(flow.jar),
          ...options.headers,
        },
        body: JSON.stringify(body),
      }
    );
    expect(response.status).toBe(200);
    return (await response.json()) as ServiceReply;
  }

  /** 同じ時間ステップのコードを再び使えるよう、使用済みの記録を消してからコードを作る */
  async function totp(user: ConsentUser): Promise<{ type: 'totp'; code: string }> {
    await prisma.user.update({ where: { id: user.id }, data: { twoFactorLastUsedStep: null } });
    return { type: 'totp', code: authenticator.generate(user.secret) };
  }

  async function passSecondFactor(flow: Flow, user: ConsentUser): Promise<void> {
    // 世代を結び付けるのは申し込みの取得だけなので、実際の画面と同じ順に呼ぶ
    expect(await call(flow, 'get', { userId: user.id })).toMatchObject({ ok: true });
    const reply = await call(flow, 'verify', { userId: user.id, code: await totp(user) });
    expect(reply).toMatchObject({ ok: true });
  }

  function approve(flow: Flow, user: ConsentUser, scopes: ExternalAppScope[] = ['read']) {
    return call(flow, 'approve', { userId: user.id, scopes });
  }

  async function resume(flow: Flow, redirectTo: string): Promise<URL> {
    const response = await fetch(`${base}${new URL(redirectTo).pathname}`, {
      redirect: 'manual',
      headers: { cookie: cookieHeader(flow.jar) },
    });
    storeCookies(flow.jar, response);
    expect(response.status).toBe(303);
    return new URL(response.headers.get('location') ?? '');
  }

  /** 再開の応答をそのまま返す（同意の手続きへ戻る場面は Location が相対のパスになる） */
  async function resumeRaw(flow: Flow, redirectTo: string): Promise<Response> {
    const response = await fetch(`${base}${new URL(redirectTo).pathname}`, {
      redirect: 'manual',
      headers: { cookie: cookieHeader(flow.jar) },
    });
    storeCookies(flow.jar, response);
    return response;
  }

  /** 再開が同意の手続きへ戻り、コードが出ないことを確かめて、新しい申し込みを返す */
  async function expectBackToConsent(flow: Flow, redirectTo: string): Promise<Flow> {
    const response = await resumeRaw(flow, redirectTo);
    expect(response.status).toBe(303);
    const location = response.headers.get('location') ?? '';
    expect(location).toMatch(/^\/oauth\/interaction\//);
    expect(location).not.toContain('code=');
    const uid = location.split('/').pop() ?? '';
    flowUids.add(uid);
    return { jar: flow.jar, uid, verifier: flow.verifier };
  }

  /** 結果を書いた後に失敗させる（同じトランザクションの中で例外になる） */
  function failAfterResultWrite(): { returnTo: () => string } {
    const original = host.provider.interactionResult.bind(host.provider);
    let returnTo = '';
    vi.spyOn(host.provider, 'interactionResult').mockImplementationOnce(
      async (req, res, result) => {
        returnTo = await original(req, res, result);
        throw new Error('コミットの失敗');
      }
    );
    return { returnTo: () => returnTo };
  }

  function authorizationCodeRows(userId: string) {
    return prisma.oAuthStoreRecord.count({
      where: { kind: 'AuthorizationCode', payload: { path: ['accountId'], equals: userId } },
    });
  }

  /** 保存データの行の DELETE がロックを待ち始めるまで待つ */
  async function waitForBlockedDelete(): Promise<void> {
    const deadline = Date.now() + 4_000;
    while (Date.now() < deadline) {
      const [row] = await prisma.$queryRaw<{ count: number }[]>`
        SELECT count(*)::int AS count FROM pg_stat_activity
        WHERE datname = current_database()
          AND wait_event_type = 'Lock'
          AND query ILIKE 'DELETE%oauth_store_records%'`;
      if ((row?.count ?? 0) > 0) {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error('再開の処理がコミットを待ちませんでした');
  }

  function exchange(code: string, pkceVerifier: string) {
    return fetch(`${base}/oauth/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        code_verifier: pkceVerifier,
        redirect_uri: REDIRECT_URI,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        resource,
      }).toString(),
    });
  }

  function refresh(refreshToken: string) {
    return fetch(`${base}/oauth/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        resource,
      }).toString(),
    });
  }

  /** 同意から交換までを通し、トークンの応答を返す */
  async function consentAndExchange(
    user: ConsentUser,
    scopes: ExternalAppScope[] = ['read'],
    requestScope = 'offline_access read write'
  ): Promise<Record<string, unknown>> {
    const flow = await start(requestScope);
    await passSecondFactor(flow, user);
    const approved = await approve(flow, user, scopes);
    expect(approved).toMatchObject({ ok: true });
    const redirected = await resume(flow, String(approved.value?.redirectTo));
    const code = redirected.searchParams.get('code');
    expect(code).not.toBeNull();
    const exchanged = await exchange(String(code), flow.verifier);
    expect(exchanged.status).toBe(200);
    return (await exchanged.json()) as Record<string, unknown>;
  }

  function grantRows(userId: string) {
    return prisma.oAuthStoreRecord.count({
      where: { kind: 'Grant', payload: { path: ['accountId'], equals: userId } },
    });
  }

  function connections(userId: string) {
    return prisma.externalAppConnection.findMany({ where: { userId } });
  }

  async function expectNothingCreated(userId: string): Promise<void> {
    expect(await grantRows(userId)).toBe(0);
    expect(await connections(userId)).toHaveLength(0);
  }

  function auditLogs(userId: string, action: string) {
    return prisma.auditLog.findMany({ where: { targetId: userId, action } });
  }

  describe('申し込みの内容', () => {
    it('アプリ・戻り先のホスト・利用者・範囲・期限を返し、offline_access を選択肢に出さない', async () => {
      const user = await createUser();
      const flow = await start();
      const reply = await call(flow, 'get', { userId: user.id });
      expect(reply.ok).toBe(true);
      expect(reply.value).toMatchObject({
        appName: 'Consent Test App',
        redirectHost: 'client.example',
        account: { email: `oauth742-${user.id}@example.test` },
        requestedScopes: ['read', 'write'],
        idleDays: 30,
        absoluteDays: 90,
        secondFactorVerified: false,
      });
    });

    it('権限が無い利用者は PERMISSION_REQUIRED になり、2FA にも同意にも進めない', async () => {
      const user = await createUser({ permitted: false });
      const flow = await start();
      expect(await call(flow, 'get', { userId: user.id })).toMatchObject({
        ok: false,
        error: { type: 'PERMISSION_REQUIRED' },
      });
      const verify = vi.spyOn(verifier, 'verify');
      expect(await call(flow, 'verify', { userId: user.id, code: await totp(user) })).toMatchObject(
        { ok: false, error: { type: 'PERMISSION_REQUIRED' } }
      );
      expect(verify).not.toHaveBeenCalled();
      expect(await approve(flow, user)).toMatchObject({
        ok: false,
        error: { type: 'PERMISSION_REQUIRED' },
      });
      await expectNothingCreated(user.id);
    });

    it('パスワードの変更を求められている利用者は接続を作れない', async () => {
      const user = await createUser({ state: { mustChangePassword: true } });
      const flow = await start();
      expect(await call(flow, 'get', { userId: user.id })).toMatchObject({
        ok: false,
        error: { type: 'ACCOUNT_RESTRICTED', restriction: 'PASSWORD_CHANGE_REQUIRED' },
      });
      expect(await approve(flow, user)).toMatchObject({
        ok: false,
        error: { type: 'ACCOUNT_RESTRICTED' },
      });
      await expectNothingCreated(user.id);
    });

    it('2FA 未登録の利用者は verify に届かず、失敗が数えられない', async () => {
      const user = await createUser({ state: { twoFactor: false } });
      const flow = await start();
      await call(flow, 'get', { userId: user.id });
      const verify = vi.spyOn(verifier, 'verify');
      expect(
        await call(flow, 'verify', { userId: user.id, code: { type: 'totp', code: '000000' } })
      ).toMatchObject({
        ok: false,
        error: { type: 'ACCOUNT_RESTRICTED', restriction: 'TWO_FACTOR_SETUP_REQUIRED' },
      });
      expect(verify).not.toHaveBeenCalled();
      const row = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
      expect(row.twoFactorFailures).toBe(0);
      await expectNothingCreated(user.id);
    });

    it('URL の uid と手続きの Cookie が違えば扱わない', async () => {
      const user = await createUser();
      const flow = await start();
      const other = await start();
      expect(await call(flow, 'get', { userId: user.id }, { uid: other.uid })).toMatchObject({
        ok: false,
        error: { type: 'INTERACTION_NOT_FOUND' },
      });
    });

    it('期限切れの申し込みは扱わない', async () => {
      const user = await createUser();
      const flow = await start();
      const row = await prisma.oAuthStoreRecord.findUniqueOrThrow({
        where: { id: `Interaction:${flow.uid}` },
      });
      const exp = Math.floor(Date.now() / 1000) - 1;
      await prisma.oAuthStoreRecord.update({
        where: { id: row.id },
        data: {
          expiresAt: new Date(exp * 1000),
          payload: { ...(row.payload as Record<string, unknown>), exp },
        },
      });
      expect(await call(flow, 'get', { userId: user.id })).toMatchObject({
        ok: false,
        error: { type: 'INTERACTION_NOT_FOUND' },
      });
    });
  });

  describe('同意', () => {
    it('コードが返り、交換でリソース側の範囲のトークンが出て、監査に全項目が残る', async () => {
      const user = await createUser();
      const tokens = await consentAndExchange(user, ['read', 'write']);
      // 応答の scope はリソース側の範囲で、offline_access は Grant にだけ付く
      expect(String(tokens.scope).split(' ').sort()).toEqual(['read', 'write']);
      expect(typeof tokens.refresh_token).toBe('string');

      const [connection] = await connections(user.id);
      expect(connection?.scopes).toEqual(['read', 'write']);
      const grant = await host.provider.Grant.find(String(connection?.grantId));
      expect(grant?.getResourceScope(resource).split(' ').sort()).toEqual(['read', 'write']);
      // 接続より先に Grant を作るので、トークンが接続より長く生きない
      expect(Number(grant?.exp) * 1000).toBeLessThanOrEqual(
        Number(connection?.expiresAt.getTime())
      );

      const [log] = await auditLogs(user.id, 'CONSENT_GRANTED');
      expect(log?.actorId).toBe(user.id);
      expect(log?.metadata).toMatchObject({
        clientId: CLIENT_ID,
        scopes: ['read', 'write'],
        reason: null,
        ipAddress: SOURCE.ipAddress,
        userAgent: SOURCE.userAgent,
      });
      expect(typeof (log?.metadata as { occurredAt?: unknown }).occurredAt).toBe('string');
    });

    it('外した範囲は Grant に拒否として残り、トークンに含まれない', async () => {
      const user = await createUser();
      const tokens = await consentAndExchange(user, ['read']);
      expect(String(tokens.scope).split(' ')).not.toContain('write');
      const [connection] = await connections(user.id);
      expect(connection?.scopes).toEqual(['read']);
      const grant = await host.provider.Grant.find(String(connection?.grantId));
      expect(grant?.getResourceScope(resource)).toBe('read');
      expect(grant?.getRejectedResourceScope(resource)).toBe('write');
    });

    it('転送ヘッダーを偽っても再開の URL は発行者のオリジンになる', async () => {
      const user = await createUser();
      const flow = await start();
      await passSecondFactor(flow, user);
      const reply = await call(
        flow,
        'approve',
        { userId: user.id, scopes: ['read'] },
        { headers: { 'x-forwarded-host': 'evil.example' } }
      );
      expect(new URL(String(reply.value?.redirectTo)).origin).toBe(base);
    });

    it('再度の同意は新しい Grant を作り、前の Grant とトークンだけを消す', async () => {
      const user = await createUser();
      const other = await createUser();
      const otherTokens = await consentAndExchange(other);
      const firstTokens = await consentAndExchange(user);
      const [first] = await connections(user.id);

      const secondTokens = await consentAndExchange(user, ['read', 'write']);
      const [second] = await connections(user.id);
      expect(second?.grantId).not.toBe(first?.grantId);
      expect(await grantRows(user.id)).toBe(1);
      expect(
        await prisma.oAuthStoreRecord.count({ where: { grantId: String(first?.grantId) } })
      ).toBe(0);
      expect((await refresh(String(firstTokens.refresh_token))).status).toBe(400);
      expect((await refresh(String(secondTokens.refresh_token))).status).toBe(200);
      expect((await refresh(String(otherTokens.refresh_token))).status).toBe(200);
      expect(await auditLogs(user.id, 'CONNECTION_REPLACED')).toHaveLength(1);
    });

    it('済んだ申し込みの再送は失敗し、接続を増やさない', async () => {
      const user = await createUser();
      const flow = await start();
      await passSecondFactor(flow, user);
      const approved = await approve(flow, user);
      expect(approved.ok).toBe(true);
      expect(await approve(flow, user)).toMatchObject({
        ok: false,
        error: { type: 'INTERACTION_NOT_FOUND' },
      });
      expect(await call(flow, 'deny', { userId: user.id })).toMatchObject({
        ok: false,
        error: { type: 'INTERACTION_NOT_FOUND' },
      });
      expect(await grantRows(user.id)).toBe(1);
      expect(await auditLogs(user.id, 'CONSENT_DENIED')).toHaveLength(0);
    });

    it('同時の同意と拒否は一方だけが通る', async () => {
      const user = await createUser();
      const flow = await start();
      await passSecondFactor(flow, user);
      const [approved, denied] = await Promise.all([
        approve(flow, user),
        call(flow, 'deny', { userId: user.id }),
      ]);
      expect([approved.ok, denied.ok].filter(Boolean)).toHaveLength(1);
      if (denied.ok) {
        await expectNothingCreated(user.id);
      } else {
        expect(await connections(user.id)).toHaveLength(1);
      }
    });
  });

  describe('拒否', () => {
    it('access_denied を戻り先へ返し、接続もトークンも作らず、監査に残す', async () => {
      const user = await createUser();
      const flow = await start();
      const denied = await call(flow, 'deny', { userId: user.id });
      expect(denied.ok).toBe(true);
      const redirected = await resume(flow, String(denied.value?.redirectTo));
      expect(redirected.origin + redirected.pathname).toBe(REDIRECT_URI);
      expect(redirected.searchParams.get('error')).toBe('access_denied');
      expect(redirected.searchParams.get('state')).toBe('state-742');
      expect(redirected.searchParams.get('code')).toBeNull();
      await expectNothingCreated(user.id);

      const [log] = await auditLogs(user.id, 'CONSENT_DENIED');
      expect(log?.actorId).toBe(user.id);
      expect(log?.metadata).toMatchObject({
        clientId: CLIENT_ID,
        scopes: ['read', 'write'],
        ipAddress: SOURCE.ipAddress,
        userAgent: SOURCE.userAgent,
      });
    });

    it('権限が無い利用者でも拒否してアプリへ戻れる', async () => {
      const user = await createUser({ permitted: false });
      const flow = await start();
      const denied = await call(flow, 'deny', { userId: user.id });
      expect(denied.ok).toBe(true);
      await expectNothingCreated(user.id);
    });
  });

  describe('途中の失敗', () => {
    it('監査の失敗で接続を戻し、保存した Grant を消す', async () => {
      const user = await createUser();
      const flow = await start();
      await passSecondFactor(flow, user);
      const original = connectionService.recordEvent.bind(connectionService);
      vi.spyOn(connectionService, 'recordEvent').mockImplementation(async (event, tx) => {
        if (event.kind === 'CONSENT_GRANTED') {
          throw new Error('監査の失敗');
        }
        await original(event, tx);
      });
      expect(await approve(flow, user)).toMatchObject({
        ok: false,
        error: { type: 'SERVICE_UNAVAILABLE' },
      });
      await expectNothingCreated(user.id);
      expect(await auditLogs(user.id, 'CONSENT_GRANTED')).toHaveLength(0);
    });

    it('置き換えの途中の失敗では前の接続が残る', async () => {
      const user = await createUser();
      const firstTokens = await consentAndExchange(user);
      const [before] = await connections(user.id);

      const flow = await start();
      await passSecondFactor(flow, user);
      vi.spyOn(connectionService, 'recordEvent').mockRejectedValue(new Error('監査の失敗'));
      expect((await approve(flow, user)).ok).toBe(false);
      vi.restoreAllMocks();

      const [after] = await connections(user.id);
      expect(after?.grantId).toBe(before?.grantId);
      expect(await grantRows(user.id)).toBe(1);
      expect((await refresh(String(firstTokens.refresh_token))).status).toBe(200);
    });

    it('コミットの後に申し込みへ結果を書けなければ、接続と Grant を残さない', async () => {
      const user = await createUser();
      const flow = await start();
      await passSecondFactor(flow, user);
      vi.spyOn(host.provider, 'interactionResult').mockRejectedValueOnce(new Error('保存の失敗'));
      expect(await approve(flow, user)).toMatchObject({
        ok: false,
        error: { type: 'SERVICE_UNAVAILABLE' },
      });
      await expectNothingCreated(user.id);
    });

    it('再同意で結果の書き込みが失敗しても前の接続とトークンが使え、終了の監査が増えない', async () => {
      const user = await createUser();
      const firstTokens = await consentAndExchange(user);
      const [before] = await connections(user.id);

      const flow = await start();
      await passSecondFactor(flow, user);
      vi.spyOn(host.provider, 'interactionResult').mockRejectedValueOnce(new Error('保存の失敗'));
      expect(await approve(flow, user, ['read', 'write'])).toMatchObject({
        ok: false,
        error: { type: 'SERVICE_UNAVAILABLE' },
      });

      const after = await connections(user.id);
      expect(after).toHaveLength(1);
      expect(after[0]?.grantId).toBe(before?.grantId);
      expect(after[0]?.scopes).toEqual(['read']);
      expect(await grantRows(user.id)).toBe(1);
      expect((await refresh(String(firstTokens.refresh_token))).status).toBe(200);
      expect(await auditLogs(user.id, 'CONNECTION_ENDED')).toHaveLength(0);
      expect(await auditLogs(user.id, 'CONNECTION_REPLACED')).toHaveLength(0);
      expect(await auditLogs(user.id, 'CONSENT_GRANTED')).toHaveLength(1);
    });

    it('結果の書き込みの後の失敗では、再開でコードが出ず同意へ戻り、2FA からやり直せる', async () => {
      const user = await createUser();
      const flow = await start();
      await passSecondFactor(flow, user);
      const failed = failAfterResultWrite();
      expect(await approve(flow, user)).toMatchObject({
        ok: false,
        error: { type: 'SERVICE_UNAVAILABLE' },
      });
      await expectNothingCreated(user.id);
      expect(await auditLogs(user.id, 'CONSENT_GRANTED')).toHaveLength(0);

      const retried = await expectBackToConsent(flow, failed.returnTo());
      expect(await authorizationCodeRows(user.id)).toBe(0);
      await passSecondFactor(retried, user);
      const approved = await approve(retried, user);
      expect(approved.ok).toBe(true);
      const redirected = await resume(retried, String(approved.value?.redirectTo));
      const exchanged = await exchange(
        String(redirected.searchParams.get('code')),
        retried.verifier
      );
      expect(exchanged.status).toBe(200);
      expect(await connections(user.id)).toHaveLength(1);
    });

    it('結果の書き込みの後に失敗し Grant の消去も失敗しても、コードが出ない', async () => {
      const user = await createUser();
      const flow = await start();
      await passSecondFactor(flow, user);
      const failed = failAfterResultWrite();
      const grantModel = host.provider.Grant as unknown as {
        prototype: { destroy(): Promise<void> };
      };
      vi.spyOn(grantModel.prototype, 'destroy').mockRejectedValueOnce(new Error('消去の失敗'));
      expect((await approve(flow, user)).ok).toBe(false);
      expect(await connections(user.id)).toHaveLength(0);
      // 消せなかった Grant は孤立して残るが、申し込みの結果に結び付かない
      expect(await grantRows(user.id)).toBe(1);

      await expectBackToConsent(flow, failed.returnTo());
      expect(await authorizationCodeRows(user.id)).toBe(0);
    });

    it('コミットの前に同じブラウザが再開しても、コードが出ない', async () => {
      const user = await createUser();
      const flow = await start();
      await passSecondFactor(flow, user);
      const original = host.provider.interactionResult.bind(host.provider);
      let returnTo = '';
      let markWritten: () => void = () => undefined;
      let release: () => void = () => undefined;
      const written = new Promise<void>((resolve) => {
        markWritten = resolve;
      });
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      vi.spyOn(host.provider, 'interactionResult').mockImplementationOnce(
        async (req, res, result) => {
          returnTo = await original(req, res, result);
          markWritten();
          await gate;
          return returnTo;
        }
      );

      const approving = approve(flow, user);
      await written;
      const resuming = resumeRaw(flow, returnTo);
      try {
        await waitForBlockedDelete();
      } finally {
        release();
      }
      const [approved, resumed] = await Promise.all([approving, resuming]);
      expect(approved.ok).toBe(true);
      expect(resumed.status).toBe(303);
      expect(resumed.headers.get('location') ?? '').not.toContain('code=');
      expect(await authorizationCodeRows(user.id)).toBe(0);
    });

    it('拒否の結果の書き込みの後の失敗では、アプリへ拒否が届かず監査も残らず、再試行で 1 件になる', async () => {
      const user = await createUser();
      const flow = await start();
      const failed = failAfterResultWrite();
      expect(await call(flow, 'deny', { userId: user.id })).toMatchObject({
        ok: false,
        error: { type: 'SERVICE_UNAVAILABLE' },
      });
      expect(await auditLogs(user.id, 'CONSENT_DENIED')).toHaveLength(0);
      const row = await prisma.oAuthStoreRecord.findUniqueOrThrow({
        where: { id: `Interaction:${flow.uid}` },
      });
      expect((row.payload as { result?: unknown }).result).toBeUndefined();

      const denied = await call(flow, 'deny', { userId: user.id });
      expect(denied.ok).toBe(true);
      expect(await auditLogs(user.id, 'CONSENT_DENIED')).toHaveLength(1);
      const redirected = await resume(flow, String(denied.value?.redirectTo));
      expect(redirected.searchParams.get('error')).toBe('access_denied');
      expect(failed.returnTo()).not.toBe('');
      await expectNothingCreated(user.id);
    });

    it('拒否の結果の書き込みの失敗では監査を残さず、再試行でも拒否の監査は 1 件', async () => {
      const user = await createUser();
      const flow = await start();
      vi.spyOn(host.provider, 'interactionResult').mockRejectedValueOnce(new Error('保存の失敗'));
      expect(await call(flow, 'deny', { userId: user.id })).toMatchObject({
        ok: false,
        error: { type: 'SERVICE_UNAVAILABLE' },
      });
      expect(await auditLogs(user.id, 'CONSENT_DENIED')).toHaveLength(0);

      expect((await call(flow, 'deny', { userId: user.id })).ok).toBe(true);
      expect(await auditLogs(user.id, 'CONSENT_DENIED')).toHaveLength(1);
      await expectNothingCreated(user.id);
    });

    it('トランザクションの 5 秒の期限切れでは何も残らず、コードも出ない', async () => {
      const user = await createUser();
      const flow = await start();
      await passSecondFactor(flow, user);
      const original = host.provider.interactionResult.bind(host.provider);
      let returnTo = '';
      vi.spyOn(host.provider, 'interactionResult').mockImplementationOnce(
        async (req, res, result) => {
          returnTo = await original(req, res, result);
          await new Promise((resolve) => setTimeout(resolve, 5_300));
          return returnTo;
        }
      );
      expect(await approve(flow, user)).toMatchObject({
        ok: false,
        error: { type: 'SERVICE_UNAVAILABLE' },
      });
      await expectNothingCreated(user.id);
      expect(await auditLogs(user.id, 'CONSENT_GRANTED')).toHaveLength(0);
      await expectBackToConsent(flow, returnTo);
      expect(await authorizationCodeRows(user.id)).toBe(0);
    }, 15_000);

    it('プールの一部を他の処理が占める中でも、同時の同意が全件完了する', async () => {
      const items: { user: ConsentUser; flow: Flow }[] = [];
      for (let i = 0; i < 30; i += 1) {
        const user = await createUser();
        const flow = await start();
        await passSecondFactor(flow, user);
        items.push({ user, flow });
      }
      let release: () => void = () => undefined;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      let held = 0;
      const holders = Array.from({ length: 5 }, () =>
        prisma.$transaction(
          async (tx) => {
            await tx.$queryRaw`SELECT 1`;
            held += 1;
            await gate;
          },
          { timeout: 20_000 }
        )
      );
      try {
        await vi.waitFor(() => expect(held).toBe(5), { timeout: 3_000, interval: 5 });
        const replies = await Promise.all(items.map(({ user, flow }) => approve(flow, user)));
        expect(replies.filter((reply) => reply.ok)).toHaveLength(items.length);
      } finally {
        release();
        await Promise.all(holders);
      }
    }, 30_000);

    it('verify の DB の例外は SERVICE_UNAVAILABLE になる', async () => {
      const user = await createUser();
      const flow = await start();
      await call(flow, 'get', { userId: user.id });
      vi.spyOn(verifier, 'verify').mockRejectedValue(new Error('DB の失敗'));
      expect(await call(flow, 'verify', { userId: user.id, code: await totp(user) })).toMatchObject(
        { ok: false, error: { type: 'SERVICE_UNAVAILABLE' } }
      );
    });

    it('Redis が使えないときは通過の印を発行せず、コードを消費しない', async () => {
      const user = await createUser();
      const flow = await start();
      await call(flow, 'get', { userId: user.id });
      service = new ConsentInteractionService({ ...serviceDeps, getRedis: () => null });
      const verify = vi.spyOn(verifier, 'verify');
      expect(await call(flow, 'verify', { userId: user.id, code: await totp(user) })).toMatchObject(
        { ok: false, error: { type: 'SERVICE_UNAVAILABLE' } }
      );
      expect(verify).not.toHaveBeenCalled();
    });
  });

  describe('申し込みのトランザクションの文脈', () => {
    function adapter(model: string): OAuthStoreAdapter {
      const key = randomBytes(32).toString('hex');
      return new OAuthStoreAdapter(
        model,
        {
          prisma,
          tokenHmacKey: key,
          onGrantRevoked: async () => undefined,
          onRefreshGraceApplied: async () => undefined,
          getRequestSource: () => ({}),
        },
        Buffer.from(key, 'hex'),
        new Map()
      );
    }

    const payload = { params: { client_id: CLIENT_ID }, marker: 'in-transaction' };

    it('Interaction の読み書きだけが tx を使い、戻すと消え、文脈の外からは見えない', async () => {
      const interaction = adapter('Interaction');
      const grant = adapter('Grant');
      const interactionId = `tx-${randomUUID()}`;
      const grantId = `tx-${randomUUID()}`;
      let outside: unknown = 'unread';
      await expect(
        prisma.$transaction(async (tx) => {
          await withInteractionTransaction(tx, async () => {
            await interaction.upsert(interactionId, payload, 60);
            expect(await interaction.find(interactionId)).toMatchObject({
              marker: 'in-transaction',
            });
            await grant.upsert(grantId, { accountId: 'x', clientId: CLIENT_ID }, 60);
          });
          // 文脈を抜けた同じ処理の流れと他の要求は、未確定の行を読まない
          outside = await interaction.find(interactionId);
          throw new Error('戻す');
        })
      ).rejects.toThrow('戻す');
      expect(outside).toBeUndefined();
      expect(await interaction.find(interactionId)).toBeUndefined();
      // Grant の経路は変えないので、トランザクションを戻しても残る
      expect(await grant.find(grantId)).toBeDefined();
      await grant.destroy(grantId);
    });

    it('同時の別の処理へ文脈が漏れない', async () => {
      const interaction = adapter('Interaction');
      const id = `tx-${randomUUID()}`;
      let entered: () => void = () => undefined;
      let finish: () => void = () => undefined;
      const inside = new Promise<void>((resolve) => {
        entered = resolve;
      });
      const hold = new Promise<void>((resolve) => {
        finish = resolve;
      });
      const running = prisma
        .$transaction(async (tx) => {
          await withInteractionTransaction(tx, async () => {
            await interaction.upsert(id, payload, 60);
            entered();
            await hold;
          });
          throw new Error('戻す');
        })
        .catch(() => undefined);
      await inside;
      expect(await interaction.find(id)).toBeUndefined();
      finish();
      await running;
      expect(await interaction.find(id)).toBeUndefined();
    });

    it('文脈の終了の後に残った処理は tx を使わず失敗する', async () => {
      const interaction = adapter('Interaction');
      const id = `tx-${randomUUID()}`;
      let detached: Promise<unknown> = Promise.resolve();
      let resumeDetached: () => void = () => undefined;
      const later = new Promise<void>((resolve) => {
        resumeDetached = resolve;
      });
      const endedTx = { oAuthStoreRecord: { upsert: vi.fn(), findUnique: vi.fn() } };
      await withInteractionTransaction(endedTx as never, async () => {
        detached = later.then(() => interaction.upsert(id, payload, 60));
      });
      resumeDetached();
      await expect(detached).rejects.toBeInstanceOf(OAuthStoreError);
      expect(endedTx.oAuthStoreRecord.upsert).not.toHaveBeenCalled();
      expect(await interaction.find(id)).toBeUndefined();
    });
  });

  describe('2FA の通過の印', () => {
    it('通過の前は同意できない', async () => {
      const user = await createUser();
      const flow = await start();
      await call(flow, 'get', { userId: user.id });
      expect(await approve(flow, user)).toMatchObject({
        ok: false,
        error: { type: 'SECOND_FACTOR_REQUIRED' },
      });
      await expectNothingCreated(user.id);
    });

    it('誤ったコードでは印を発行せず、SECOND_FACTOR_FAILED になる', async () => {
      const user = await createUser();
      const flow = await start();
      await call(flow, 'get', { userId: user.id });
      expect(
        await call(flow, 'verify', { userId: user.id, code: { type: 'totp', code: '000000' } })
      ).toMatchObject({ ok: false, error: { type: 'SECOND_FACTOR_FAILED' } });
      expect(await redis.getClient()?.exists(consentPassKey(flow.uid, user.id))).toBe(0);
    });

    it('ロック中は SECOND_FACTOR_LOCKED と解除の時刻を返し、印を発行しない', async () => {
      const user = await createUser();
      const flow = await start();
      await call(flow, 'get', { userId: user.id });
      const unlockAt = new Date(Date.now() + 60_000);
      await prisma.user.update({
        where: { id: user.id },
        data: { twoFactorLockedUntil: unlockAt },
      });
      const reply = await call(flow, 'verify', { userId: user.id, code: await totp(user) });
      expect(reply).toMatchObject({ ok: false, error: { type: 'SECOND_FACTOR_LOCKED' } });
      expect(new Date(String(reply.error?.unlockAt)).getTime()).toBe(unlockAt.getTime());
      expect(await redis.getClient()?.exists(consentPassKey(flow.uid, user.id))).toBe(0);
    });

    it('5 分で切れる', async () => {
      const user = await createUser();
      const flow = await start();
      await passSecondFactor(flow, user);
      const key = consentPassKey(flow.uid, user.id);
      const client = redis.getClient();
      const ttl = Number(await client?.ttl(key));
      expect(CONSENT_PASS_TTL_SECONDS).toBe(300);
      expect(ttl).toBeGreaterThan(290);
      expect(ttl).toBeLessThanOrEqual(300);
      await client?.pexpire(key, 1);
      await new Promise((resolve) => setTimeout(resolve, 30));
      expect(await approve(flow, user)).toMatchObject({
        ok: false,
        error: { type: 'SECOND_FACTOR_REQUIRED' },
      });
      await expectNothingCreated(user.id);
    });

    it('一度だけ使える（同時の同意でも接続は 1 件）', async () => {
      const user = await createUser();
      const flow = await start();
      await passSecondFactor(flow, user);
      const replies = await Promise.all([approve(flow, user), approve(flow, user)]);
      expect(replies.filter((reply) => reply.ok)).toHaveLength(1);
      expect(await redis.getClient()?.exists(consentPassKey(flow.uid, user.id))).toBe(0);
      expect(await connections(user.id)).toHaveLength(1);
      expect(await grantRows(user.id)).toBe(1);
    });

    it('別の利用者は同じ申し込みの印を使えない', async () => {
      const owner = await createUser();
      const other = await createUser();
      const flow = await start();
      await passSecondFactor(flow, owner);
      await call(flow, 'get', { userId: other.id });
      expect(await approve(flow, other)).toMatchObject({
        ok: false,
        error: { type: 'SECOND_FACTOR_REQUIRED' },
      });
      await expectNothingCreated(other.id);
      expect(await redis.getClient()?.exists(consentPassKey(flow.uid, owner.id))).toBe(1);
    });

    it('別の申し込みでは使えない', async () => {
      const user = await createUser();
      const first = await start();
      const second = await start();
      await passSecondFactor(first, user);
      await call(second, 'get', { userId: user.id });
      expect(await approve(second, user)).toMatchObject({
        ok: false,
        error: { type: 'SECOND_FACTOR_REQUIRED' },
      });
      await expectNothingCreated(user.id);
    });

    it('ログインの 2FA の資格としては使えない', async () => {
      const user = await createUser();
      const flow = await start();
      await passSecondFactor(flow, user);
      const key = consentPassKey(flow.uid, user.id);
      expect(key.startsWith('2fa:challenge:')).toBe(false);
      const stored = String(await redis.getClient()?.get(key));
      const challenges = new TwoFactorChallengeService();
      for (const candidate of [key, stored, flow.uid]) {
        expect(await challenges.peek(candidate)).toMatchObject({
          ok: false,
          error: { type: 'CHALLENGE_INVALID' },
        });
      }
    });
  });

  describe('失効の世代と開始の後の変化', () => {
    it('開始と同意の間の失効は衝突になり、接続も Grant も作らない', async () => {
      const user = await createUser();
      const flow = await start();
      await call(flow, 'get', { userId: user.id });
      await passSecondFactor(flow, user);
      await prisma.$transaction((tx) =>
        connectionService.revokeAllForUser(user.id, 'PASSWORD_CHANGED', { userId: user.id }, tx)
      );
      expect(await approve(flow, user)).toMatchObject({
        ok: false,
        error: { type: 'RECONNECT_REQUIRED' },
      });
      await expectNothingCreated(user.id);
      expect(await auditLogs(user.id, 'CONSENT_GRANTED')).toHaveLength(0);
    });

    it('開始の後の失効は、2FA をやり直しても世代が新しくならず衝突になる', async () => {
      const user = await createUser();
      const flow = await start();
      await call(flow, 'get', { userId: user.id });
      await prisma.$transaction((tx) =>
        connectionService.revokeAllForUser(user.id, 'PASSWORD_CHANGED', { userId: user.id }, tx)
      );
      await passSecondFactor(flow, user);
      expect(await approve(flow, user)).toMatchObject({
        ok: false,
        error: { type: 'RECONNECT_REQUIRED' },
      });
      await expectNothingCreated(user.id);
    });

    it('世代は権限の確認より前に読む（確認の最中の失効も衝突になる）', async () => {
      const user = await createUser();
      const flow = await start();
      const findRoles = prisma.userRole.findMany.bind(prisma.userRole);
      let revoked = false;
      vi.spyOn(prisma.userRole, 'findMany').mockImplementation(((args: never) => {
        if (revoked) {
          return findRoles(args);
        }
        revoked = true;
        return prisma
          .$transaction((tx) =>
            connectionService.revokeAllForUser(user.id, 'PERMISSION_LOST', { userId: null }, tx)
          )
          .then(() => findRoles(args));
      }) as never);
      expect(await call(flow, 'get', { userId: user.id })).toMatchObject({ ok: true });
      vi.restoreAllMocks();
      await passSecondFactor(flow, user);
      expect(await approve(flow, user)).toMatchObject({
        ok: false,
        error: { type: 'RECONNECT_REQUIRED' },
      });
      await expectNothingCreated(user.id);
    });

    it('世代の鍵が消えた後の verify は接続を作らず、コードも消費しない', async () => {
      const user = await createUser();
      const flow = await start();
      expect((await call(flow, 'get', { userId: user.id })).ok).toBe(true);
      await prisma.$transaction((tx) =>
        connectionService.revokeAllForUser(user.id, 'PASSWORD_CHANGED', { userId: user.id }, tx)
      );
      await redis.getClient()?.del(`oauth:consent:generation:${flow.uid}:${user.id}`);

      const verify = vi.spyOn(verifier, 'verify');
      expect(await call(flow, 'verify', { userId: user.id, code: await totp(user) })).toMatchObject(
        { ok: false, error: { type: 'RECONNECT_REQUIRED' } }
      );
      expect(verify).not.toHaveBeenCalled();
      const row = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
      expect(row.twoFactorLastUsedStep).toBeNull();
      expect(row.twoFactorFailures).toBe(0);
      expect(await redis.getClient()?.exists(consentPassKey(flow.uid, user.id))).toBe(0);
      expect(await approve(flow, user)).toMatchObject({
        ok: false,
        error: { type: 'SECOND_FACTOR_REQUIRED' },
      });
      await expectNothingCreated(user.id);
    });

    it('申し込みの取得を経ない verify は世代を結び付けず、照合しない', async () => {
      const user = await createUser();
      const flow = await start();
      const verify = vi.spyOn(verifier, 'verify');
      expect(await call(flow, 'verify', { userId: user.id, code: await totp(user) })).toMatchObject(
        { ok: false, error: { type: 'RECONNECT_REQUIRED' } }
      );
      expect(verify).not.toHaveBeenCalled();
      expect(
        await redis.getClient()?.exists(`oauth:consent:generation:${flow.uid}:${user.id}`)
      ).toBe(0);
    });

    it('開始と同意の間に権限を失うと接続を作らない', async () => {
      const user = await createUser();
      const flow = await start();
      await passSecondFactor(flow, user);
      await prisma.userRole.deleteMany({ where: { userId: user.id } });
      expect(await approve(flow, user)).toMatchObject({
        ok: false,
        error: { type: 'PERMISSION_REQUIRED' },
      });
      await expectNothingCreated(user.id);
    });

    it('開始と同意の間に制限中になると接続を作らない', async () => {
      const user = await createUser();
      const flow = await start();
      await passSecondFactor(flow, user);
      await prisma.user.update({ where: { id: user.id }, data: { mustChangePassword: true } });
      expect(await approve(flow, user)).toMatchObject({
        ok: false,
        error: { type: 'ACCOUNT_RESTRICTED', restriction: 'PASSWORD_CHANGE_REQUIRED' },
      });
      await expectNothingCreated(user.id);
    });
  });

  describe('範囲の扱い', () => {
    it('scope=write だけの要求は READ_SCOPE_REQUIRED で、read へ広げない', async () => {
      const user = await createUser();
      const flow = await start('write');
      expect(await call(flow, 'get', { userId: user.id })).toMatchObject({
        ok: false,
        error: { type: 'READ_SCOPE_REQUIRED' },
      });
      expect(await approve(flow, user, ['read'])).toMatchObject({
        ok: false,
        error: { type: 'READ_SCOPE_REQUIRED' },
      });
      await expectNothingCreated(user.id);
    });

    it('scope の省略は READ_SCOPE_REQUIRED で、拒否してアプリへ戻せる', async () => {
      const user = await createUser();
      const { response, flow } = await startRaw(undefined);
      expect(response.status).toBe(303);
      expect(flow.uid).not.toBe('');
      expect(await call(flow, 'get', { userId: user.id })).toMatchObject({
        ok: false,
        error: { type: 'READ_SCOPE_REQUIRED' },
      });
      const denied = await call(flow, 'deny', { userId: user.id });
      expect(denied.ok).toBe(true);
      const redirected = await resume(flow, String(denied.value?.redirectTo));
      expect(redirected.searchParams.get('error')).toBe('access_denied');
      await expectNothingCreated(user.id);
    });

    it('未知の範囲（read admin）は付与せず、拒否として残す', async () => {
      const user = await createUser();
      const flow = await start('read admin');
      const view = await call(flow, 'get', { userId: user.id });
      expect(view.value?.requestedScopes).toEqual(['read']);
      await passSecondFactor(flow, user);
      const approved = await approve(flow, user, ['read']);
      expect(approved.ok).toBe(true);
      const redirected = await resume(flow, String(approved.value?.redirectTo));
      const exchanged = await exchange(String(redirected.searchParams.get('code')), flow.verifier);
      expect(exchanged.status).toBe(200);
      const tokens = (await exchanged.json()) as { scope: string };
      expect(tokens.scope).toBe('read');
      const [connection] = await connections(user.id);
      const grant = await host.provider.Grant.find(String(connection?.grantId));
      expect(grant?.getResourceScope(resource)).toBe('read');
      expect(grant?.getRejectedResourceScope(resource)).toBe('admin');
    });

    it('要求に無い write の選択は拒み、範囲を広げない', async () => {
      const user = await createUser();
      const flow = await start('read');
      await passSecondFactor(flow, user);
      expect(await approve(flow, user, ['read', 'write'])).toMatchObject({
        ok: false,
        error: { type: 'SCOPE_NOT_REQUESTED' },
      });
      await expectNothingCreated(user.id);
    });

    it('未知の値の選択は拒む', async () => {
      const user = await createUser();
      const flow = await start();
      await passSecondFactor(flow, user);
      expect(
        await call(flow, 'approve', { userId: user.id, scopes: ['read', 'admin'] })
      ).toMatchObject({ ok: false, error: { type: 'SCOPE_NOT_REQUESTED' } });
      await expectNothingCreated(user.id);
    });

    it('read を外した同意は READ_SCOPE_REQUIRED で、印を消費しない', async () => {
      const user = await createUser();
      const flow = await start();
      await passSecondFactor(flow, user);
      expect(await approve(flow, user, ['write'])).toMatchObject({
        ok: false,
        error: { type: 'READ_SCOPE_REQUIRED' },
      });
      expect(await redis.getClient()?.exists(consentPassKey(flow.uid, user.id))).toBe(1);
      await expectNothingCreated(user.id);
    });

    it('prompt=consent つきの offline_access は選択肢に出さず Grant へ付与する', async () => {
      const user = await createUser();
      const flow = await start('offline_access read write', 'consent');
      const view = await call(flow, 'get', { userId: user.id });
      expect(view.value?.requestedScopes).toEqual(['read', 'write']);
      await passSecondFactor(flow, user);
      const approved = await approve(flow, user, ['read']);
      expect(approved.ok).toBe(true);
      const [connection] = await connections(user.id);
      expect(connection?.scopes).toEqual(['read']);
      // 再開の前の時点で付いていることを確かめる（再開の補完に頼らない）
      const saved = await host.provider.Grant.find(String(connection?.grantId));
      expect(saved?.getOIDCScope().split(' ')).toContain('offline_access');
      expect(saved?.getRejectedResourceScope(resource)).toBe('write');

      const redirected = await resume(flow, String(approved.value?.redirectTo));
      const exchanged = await exchange(String(redirected.searchParams.get('code')), flow.verifier);
      expect(exchanged.status).toBe(200);
      const tokens = (await exchanged.json()) as { scope: string; refresh_token?: string };
      expect(tokens.scope.split(' ')).not.toContain('write');
      expect(typeof tokens.refresh_token).toBe('string');
    });

    it('offline_access を要求しなくてもリフレッシュトークンが出て、Grant に付けない', async () => {
      const user = await createUser();
      const tokens = await consentAndExchange(user, ['read'], 'read');
      expect(tokens.scope).toBe('read');
      expect(typeof tokens.refresh_token).toBe('string');
      const [connection] = await connections(user.id);
      const grant = await host.provider.Grant.find(String(connection?.grantId));
      expect(grant?.getOIDCScope().split(' ')).not.toContain('offline_access');
    });
  });
});
