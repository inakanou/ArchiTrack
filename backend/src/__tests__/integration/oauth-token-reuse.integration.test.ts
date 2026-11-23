/**
 * @fileoverview 使用済みの値の再提示の統合検証（user-authentication タスク 73.3）
 *
 * 実際の `/oauth/token`・oidc-provider・PostgreSQL で確かめる。
 * - 47.10: 使用済みの認可コードの再提示（期限切れ後・検証値の誤り・同時要求）で接続が終わる
 * - 48.6: 猶予に当たらないリフレッシュトークンの再提示で接続が終わる
 * - 48.11: 30 秒以内・後継が未使用・クライアント認証の成功で接続を保つ
 * - 51.7: 再利用の検知と猶予の適用が監査に残る
 *
 * Design: Requirements 46-51 > OAuthStoreAdapter
 *
 * @requirement user-authentication/REQ-47.10
 * @requirement user-authentication/REQ-48.6
 * @requirement user-authentication/REQ-48.11
 * @requirement user-authentication/REQ-51.7
 */

import { createHash, generateKeyPairSync, randomBytes, randomUUID } from 'crypto';
import http from 'http';
import type { AddressInfo } from 'net';
import express from 'express';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { validateEnv } from '../../config/env.js';
import type { Prisma, PrismaClient } from '../../generated/prisma/client.js';

validateEnv();

import getPrismaClient from '../../db.js';
import {
  createExternalAppClientRegistry,
  parseExternalAppOAuthConfig,
} from '../../oauth/client-registry.js';
import { createOAuthProviderHost, type OAuthProviderHost } from '../../oauth/provider.js';
import type { TokenReuseEvent } from '../../oauth/oauth.types.js';
import { AuditLogService } from '../../services/audit-log.service.js';
import { ExternalAppConnectionService } from '../../services/external-app-connection.service.js';
import { deleteAuditLogsWithArchivePermission } from '../../utils/audit-log-archive-permission.js';

const CLIENT_ID = 'test-oauth733-client';
const CLIENT_SECRET = randomBytes(24).toString('hex');
const OTHER_CLIENT_ID = 'test-oauth733-other';
const OTHER_CLIENT_SECRET = randomBytes(24).toString('hex');
const REDIRECT_URI = 'https://client.example/callback';
const CLIENT_IP = '198.51.100.33';
const USER_AGENT = 'oauth-733-integration';
const DAY_MS = 24 * 60 * 60 * 1000;
const LOCK_WAIT_TIMEOUT_MS = 3000;

type CookieJar = Map<string, string>;

interface TokenResponse {
  access_token: string;
  refresh_token: string;
}

interface Flow {
  readonly userId: string;
  readonly grantId: string;
  readonly code: string;
  readonly verifier: string;
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

describe('使用済みの値の再提示（タスク73.3）', () => {
  let prisma: PrismaClient;
  let server: http.Server;
  let host: OAuthProviderHost;
  let base: string;
  let resource: string;
  /** 次の `n` 番目の保存のトランザクションを失敗させる（1 始まり。0 は無効） */
  let failTransactionAt = 0;
  let transactionCount = 0;
  let failReuseHandler = false;
  let failGraceAudit = false;
  /** 指定した回の保存のトランザクションの直前に実行する処理 */
  let beforeTransaction: { nth: number; action: () => Promise<void> } | null = null;
  const observeAnomaly = vi.fn();
  const userIds: string[] = [];
  const grantIds: string[] = [];

  /** 保存アダプターに渡す DB。指定した回のトランザクションだけを失敗させる */
  function faultInjectingPrisma(real: PrismaClient): PrismaClient {
    return new Proxy(real, {
      get(target, property) {
        if (property === '$transaction') {
          return (...args: unknown[]) => {
            transactionCount += 1;
            if (beforeTransaction?.nth === transactionCount) {
              const { action } = beforeTransaction;
              beforeTransaction = null;
              return action().then(() =>
                (target.$transaction as (...inner: unknown[]) => unknown)(...args)
              );
            }
            if (failTransactionAt !== 0 && transactionCount === failTransactionAt) {
              failTransactionAt = 0;
              return Promise.reject(new Error('injected store failure'));
            }
            return (target.$transaction as (...inner: unknown[]) => unknown)(...args);
          };
        }
        const value = Reflect.get(target, property) as unknown;
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
  }

  function armTransactionFailure(nth: number): void {
    transactionCount = 0;
    failTransactionAt = nth;
  }

  async function startServer(): Promise<void> {
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
          displayName: 'Test App',
          redirectUris: [REDIRECT_URI],
        },
        {
          clientId: OTHER_CLIENT_ID,
          clientSecret: OTHER_CLIENT_SECRET,
          displayName: 'Other App',
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
    const connectionService = new ExternalAppConnectionService({
      prisma,
      auditLogService: new AuditLogService({ prisma }),
      clientRegistry: createExternalAppClientRegistry(config),
      observeAnomaly,
    });
    host = createOAuthProviderHost(config, {
      prisma: faultInjectingPrisma(prisma),
      connectionService: {
        handleReuse: (event: TokenReuseEvent) =>
          failReuseHandler
            ? Promise.reject(new Error('injected reuse failure'))
            : connectionService.handleReuse(event),
        recordRefreshGrace: (event) =>
          failGraceAudit
            ? Promise.reject(new Error('injected audit failure'))
            : connectionService.recordRefreshGrace(event),
      },
    });
    expressApp.use(host.middleware);
    // 同意の完了（タスク74の代わりに試験だけが使う経路）。本番には載せない
    expressApp.post('/oauth/interaction/:uid/test-finish', express.json(), async (req, res) => {
      const { accountId } = req.body as { accountId: string };
      const grant = new host.provider.Grant({ accountId, clientId: CLIENT_ID });
      grant.addResourceScope(resource, 'read write');
      const grantId = await grant.save();
      const returnTo = await host.provider.interactionResult(req, res, {
        login: { accountId },
        consent: { grantId },
      });
      res.json({ returnTo, grantId });
    });
  }

  async function startFlow(): Promise<Flow> {
    const userId = randomUUID();
    await prisma.user.create({
      data: {
        id: userId,
        email: `oauth733-${userId}@example.test`,
        displayName: 'OAuth 733',
        passwordHash: 'not-used',
        isActive: true,
      },
    });
    userIds.push(userId);

    const jar: CookieJar = new Map();
    const { verifier, challenge } = pkcePair();
    const query = new URLSearchParams({
      client_id: CLIENT_ID,
      response_type: 'code',
      redirect_uri: REDIRECT_URI,
      scope: 'read write',
      resource,
      state: 'state-value-733',
      code_challenge: challenge,
      code_challenge_method: 'S256',
    });
    const started = await fetch(`${base}/oauth/authorize?${query.toString()}`, {
      redirect: 'manual',
    });
    storeCookies(jar, started);
    expect(started.status).toBe(303);
    const uid = new URL(started.headers.get('location') ?? '', base).pathname.split('/').pop();
    const finished = await fetch(`${base}/oauth/interaction/${uid}/test-finish`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: cookieHeader(jar) },
      body: JSON.stringify({ accountId: userId }),
    });
    expect(finished.status).toBe(200);
    const { returnTo, grantId } = (await finished.json()) as { returnTo: string; grantId: string };
    grantIds.push(grantId);
    const resumed = await fetch(`${base}${new URL(returnTo).pathname}`, {
      redirect: 'manual',
      headers: { cookie: cookieHeader(jar) },
    });
    expect(resumed.status).toBe(303);
    const code = new URL(resumed.headers.get('location') ?? '').searchParams.get('code');
    if (code === null) {
      throw new Error('認可コードが返りませんでした');
    }
    const now = new Date();
    await prisma.externalAppConnection.create({
      data: {
        userId,
        clientId: CLIENT_ID,
        grantId,
        scopes: ['read', 'write'],
        consentedAt: now,
        expiresAt: new Date(now.getTime() + 90 * DAY_MS),
      },
    });
    return { userId, grantId, code, verifier };
  }

  function tokenRequest(body: Record<string, string>): Promise<Response> {
    return fetch(`${base}/oauth/token`, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        accept: 'application/json',
        'user-agent': USER_AGENT,
        'x-forwarded-for': CLIENT_IP,
      },
      body: new URLSearchParams(body).toString(),
    });
  }

  function exchange(
    flow: Pick<Flow, 'code' | 'verifier'>,
    overrides: Record<string, string> = {}
  ): Promise<Response> {
    return tokenRequest({
      grant_type: 'authorization_code',
      code: flow.code,
      code_verifier: flow.verifier,
      redirect_uri: REDIRECT_URI,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      resource,
      ...overrides,
    });
  }

  function refresh(token: string, overrides: Record<string, string> = {}): Promise<Response> {
    return tokenRequest({
      grant_type: 'refresh_token',
      refresh_token: token,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      resource,
      ...overrides,
    });
  }

  async function firstRefreshToken(flow: Flow): Promise<string> {
    const response = await exchange(flow);
    expect(response.status).toBe(200);
    return ((await response.json()) as TokenResponse).refresh_token;
  }

  async function rotate(token: string): Promise<string> {
    const response = await refresh(token);
    expect(response.status).toBe(200);
    return ((await response.json()) as TokenResponse).refresh_token;
  }

  async function expectInvalidGrant(response: Response): Promise<void> {
    expect(response.status).toBe(400);
    expect(((await response.json()) as { error: string }).error).toBe('invalid_grant');
  }

  async function expectConnectionEnded(flow: Flow): Promise<void> {
    expect(await prisma.externalAppConnection.count({ where: { grantId: flow.grantId } })).toBe(0);
    expect(await prisma.oAuthStoreRecord.count({ where: { grantId: flow.grantId } })).toBe(0);
    const audits = await prisma.auditLog.findMany({
      where: { action: 'TOKEN_REUSE_DETECTED', targetId: flow.userId },
    });
    expect(audits).toHaveLength(1);
    const metadata = audits[0]?.metadata as Record<string, unknown>;
    expect(metadata.ipAddress).toBe(CLIENT_IP);
    expect(metadata.clientId).toBe(CLIENT_ID);
  }

  async function expectConnectionKept(flow: Flow): Promise<void> {
    expect(await prisma.externalAppConnection.count({ where: { grantId: flow.grantId } })).toBe(1);
    expect(
      await prisma.auditLog.count({
        where: { action: 'TOKEN_REUSE_DETECTED', targetId: flow.userId },
      })
    ).toBe(0);
  }

  function graceAuditCount(flow: Flow): Promise<number> {
    return prisma.auditLog.count({
      where: { action: 'REFRESH_GRACE_APPLIED', targetId: flow.userId },
    });
  }

  /** 使用済みのリフレッシュトークンの「置き換えの日時」を過去へずらす */
  async function ageRotations(grantId: string, ageMs: number): Promise<void> {
    const rows = await prisma.oAuthStoreRecord.findMany({
      where: { grantId, kind: 'RefreshToken', consumedAt: { not: null } },
    });
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      const payload = row.payload as Record<string, unknown>;
      const rotation = payload.rotation as { replacedAt: number; successorId: string };
      expect(typeof rotation.replacedAt).toBe('number');
      await prisma.oAuthStoreRecord.update({
        where: { id: row.id },
        data: {
          payload: {
            ...payload,
            rotation: { ...rotation, replacedAt: Date.now() - ageMs },
          } as Prisma.InputJsonObject,
        },
      });
    }
  }

  /** Grant の行のロックを待っている文が現れるまで待つ */
  async function waitForGrantLockWaiter(): Promise<void> {
    const deadline = Date.now() + LOCK_WAIT_TIMEOUT_MS;
    while (Date.now() < deadline) {
      const [row] = await prisma.$queryRaw<{ count: bigint }[]>`
        SELECT count(*) AS count FROM pg_stat_activity
        WHERE wait_event_type = 'Lock'
          AND query ILIKE '%oauth_store_records%FOR UPDATE%'`;
      if ((row?.count ?? 0n) > 0n) {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error('Grant の行のロックを待つ文が現れませんでした');
  }

  beforeAll(async () => {
    prisma = getPrismaClient();
    await startServer();
  });

  afterEach(() => {
    failTransactionAt = 0;
    transactionCount = 0;
    failReuseHandler = false;
    failGraceAudit = false;
    beforeTransaction = null;
    observeAnomaly.mockClear();
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
    await prisma.externalAppConnection.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.oAuthStoreRecord.deleteMany({ where: { grantId: { in: grantIds } } });
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
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  describe('更新の猶予（48.11）', () => {
    it('応答を失った後の再試行は接続を保ち、新しいトークンが使え、監査に残る', async () => {
      const flow = await startFlow();
      const first = await firstRefreshToken(flow);
      const lost = await rotate(first);

      const retried = await rotate(first);

      expect(retried).not.toBe(lost);
      await expectConnectionKept(flow);
      expect(await graceAuditCount(flow)).toBe(1);
      const audit = await prisma.auditLog.findFirstOrThrow({
        where: { action: 'REFRESH_GRACE_APPLIED', targetId: flow.userId },
      });
      expect((audit.metadata as Record<string, unknown>).ipAddress).toBe(CLIENT_IP);
      await rotate(retried);
      await expectConnectionKept(flow);
    });

    it('同じトークンの 2 回目の再試行も接続を保つ', async () => {
      const flow = await startFlow();
      const first = await firstRefreshToken(flow);
      await rotate(first);
      await rotate(first);

      const third = await rotate(first);

      await expectConnectionKept(flow);
      expect(await graceAuditCount(flow)).toBe(2);
      await rotate(third);
      await expectConnectionKept(flow);
    });

    it('再試行が連鎖しても接続を保ち、未使用のトークンは最後の 1 つだけになる', async () => {
      const flow = await startFlow();
      const first = await firstRefreshToken(flow);
      const undelivered = await rotate(first);
      await rotate(first);

      await rotate(undelivered);
      const last = await rotate(first);

      await expectConnectionKept(flow);
      const unused = await prisma.oAuthStoreRecord.findMany({
        where: { grantId: flow.grantId, kind: 'RefreshToken', consumedAt: null },
      });
      expect(unused).toHaveLength(1);
      await rotate(last);
      await expectConnectionKept(flow);
    });

    it('30 秒以内の再提示は接続を保つ', async () => {
      const flow = await startFlow();
      const first = await firstRefreshToken(flow);
      await rotate(first);
      await ageRotations(flow.grantId, 29_000);

      await rotate(first);

      await expectConnectionKept(flow);
    });

    it('置き換えから 30 秒の後の再提示は失効する', async () => {
      const flow = await startFlow();
      const first = await firstRefreshToken(flow);
      const successor = await rotate(first);
      await ageRotations(flow.grantId, 30_500);

      await expectInvalidGrant(await refresh(first));

      await expectConnectionEnded(flow);
      await expectInvalidGrant(await refresh(successor));
    });

    it('後継が本当に使われた後の再提示は失効し、最新のトークンも使えない', async () => {
      const flow = await startFlow();
      const first = await firstRefreshToken(flow);
      const successor = await rotate(first);
      const latest = await rotate(successor);

      await expectInvalidGrant(await refresh(first));

      await expectConnectionEnded(flow);
      expect(observeAnomaly).toHaveBeenCalledWith(
        expect.objectContaining({ signal: 'external_app_token_reuse', userId: flow.userId })
      );
      await expectInvalidGrant(await refresh(latest));
    });

    it('届かなかった後継を 30 秒の後に提示すると失効する', async () => {
      const flow = await startFlow();
      const first = await firstRefreshToken(flow);
      const undelivered = await rotate(first);
      const delivered = await rotate(first);
      await ageRotations(flow.grantId, 30_500);

      await expectInvalidGrant(await refresh(undelivered));

      await expectConnectionEnded(flow);
      await expectInvalidGrant(await refresh(delivered));
    });

    it('client secret の誤りでは猶予も失効も起きず、行が変わらない', async () => {
      const flow = await startFlow();
      const first = await firstRefreshToken(flow);
      const successor = await rotate(first);
      const before = await prisma.oAuthStoreRecord.count({ where: { grantId: flow.grantId } });

      const wrong = await refresh(first, { client_secret: 'wrong-secret' });

      expect(wrong.status).toBe(401);
      expect(((await wrong.json()) as { error: string }).error).toBe('invalid_client');
      await expectConnectionKept(flow);
      expect(await graceAuditCount(flow)).toBe(0);
      expect(await prisma.oAuthStoreRecord.count({ where: { grantId: flow.grantId } })).toBe(
        before
      );
      await rotate(successor);
    });

    it('30 秒の後でも client secret の誤りでは接続を失効させない', async () => {
      const flow = await startFlow();
      const first = await firstRefreshToken(flow);
      const successor = await rotate(first);
      await ageRotations(flow.grantId, 60_000);

      const wrong = await refresh(first, { client_secret: 'wrong-secret' });

      expect(wrong.status).toBe(401);
      await expectConnectionKept(flow);
      await rotate(successor);
    });

    it('別のアプリの正しい認証で提示しても失効も猶予も起きない', async () => {
      const flow = await startFlow();
      const first = await firstRefreshToken(flow);
      const successor = await rotate(first);
      await ageRotations(flow.grantId, 60_000);

      await expectInvalidGrant(
        await refresh(first, { client_id: OTHER_CLIENT_ID, client_secret: OTHER_CLIENT_SECRET })
      );

      await expectConnectionKept(flow);
      await rotate(successor);
    });

    it('期限を過ぎたばかりの置き換え済みのトークンでも 30 秒以内なら接続を保つ', async () => {
      const flow = await startFlow();
      const first = await firstRefreshToken(flow);
      await rotate(first);
      const consumed = await prisma.oAuthStoreRecord.findFirstOrThrow({
        where: { grantId: flow.grantId, kind: 'RefreshToken', consumedAt: { not: null } },
      });
      const past = Math.floor(Date.now() / 1000) - 1;
      await prisma.oAuthStoreRecord.update({
        where: { id: consumed.id },
        data: {
          expiresAt: new Date(past * 1000),
          payload: {
            ...(consumed.payload as Record<string, unknown>),
            exp: past,
          } as Prisma.InputJsonObject,
        },
      });

      await rotate(first);

      await expectConnectionKept(flow);
    });

    it('同じトークンの同時の更新は接続を保ち、未使用のトークンは 1 つになる', async () => {
      const flow = await startFlow();
      const first = await firstRefreshToken(flow);

      const responses = await Promise.all(Array.from({ length: 5 }, () => refresh(first)));

      expect(responses.map((response) => response.status)).toEqual([200, 200, 200, 200, 200]);
      await expectConnectionKept(flow);
      const unused = await prisma.oAuthStoreRecord.findMany({
        where: { grantId: flow.grantId, kind: 'RefreshToken', consumedAt: null },
      });
      expect(unused).toHaveLength(1);
    });

    it('行にトークンの値を持たず、後継は HMAC の ID で持つ', async () => {
      const flow = await startFlow();
      const first = await firstRefreshToken(flow);
      const lost = await rotate(first);
      const retried = await rotate(first);

      const rows = await prisma.oAuthStoreRecord.findMany({ where: { grantId: flow.grantId } });

      const whole = JSON.stringify(rows);
      for (const raw of [first, lost, retried]) {
        expect(whole).not.toContain(raw);
      }
      const rotated = rows.filter((row) => row.kind === 'RefreshToken' && row.consumedAt !== null);
      expect(rotated.length).toBe(2);
      for (const row of rotated) {
        const { rotation } = row.payload as { rotation: { successorId: string } };
        expect(rotation.successorId).toMatch(/^RefreshToken:[0-9a-f]{64}$/);
      }
    });
  });

  describe('使用済みの認可コード（47.10）', () => {
    it('再提示で接続が終わり、発行したトークンが使えなくなる', async () => {
      const flow = await startFlow();
      const refreshToken = await firstRefreshToken(flow);

      await expectInvalidGrant(await exchange(flow));

      await expectConnectionEnded(flow);
      await expectInvalidGrant(await refresh(refreshToken));
    });

    it('期限切れの後の再提示でも接続が終わる', async () => {
      const flow = await startFlow();
      await firstRefreshToken(flow);
      const code = await prisma.oAuthStoreRecord.findFirstOrThrow({
        where: { grantId: flow.grantId, kind: 'AuthorizationCode' },
      });
      const past = Math.floor(Date.now() / 1000) - 60;
      await prisma.oAuthStoreRecord.update({
        where: { id: code.id },
        data: {
          expiresAt: new Date(past * 1000),
          payload: {
            ...(code.payload as Record<string, unknown>),
            exp: past,
          } as Prisma.InputJsonObject,
        },
      });

      await expectInvalidGrant(await exchange(flow));

      await expectConnectionEnded(flow);
    });

    it('検証値が誤った再提示でも接続が終わる', async () => {
      const flow = await startFlow();
      await firstRefreshToken(flow);

      await expectInvalidGrant(
        await exchange(flow, { code_verifier: randomBytes(32).toString('base64url') })
      );

      await expectConnectionEnded(flow);
    });

    it('未使用のコードの検証値の誤りは接続を終わらせず、正しい値で交換できる', async () => {
      const flow = await startFlow();

      await expectInvalidGrant(
        await exchange(flow, { code_verifier: randomBytes(32).toString('base64url') })
      );

      await expectConnectionKept(flow);
      await firstRefreshToken(flow);
      await expectConnectionKept(flow);
    });

    it('client secret の誤りでの再提示は接続を終わらせない', async () => {
      const flow = await startFlow();
      const refreshToken = await firstRefreshToken(flow);

      const wrong = await exchange(flow, { client_secret: 'wrong-secret' });

      expect(wrong.status).toBe(401);
      await expectConnectionKept(flow);
      await rotate(refreshToken);
    });

    it('別のアプリの正しい認証での再提示は接続を終わらせない', async () => {
      const flow = await startFlow();
      const refreshToken = await firstRefreshToken(flow);

      await expectInvalidGrant(
        await exchange(flow, { client_id: OTHER_CLIENT_ID, client_secret: OTHER_CLIENT_SECRET })
      );

      await expectConnectionKept(flow);
      await rotate(refreshToken);
    });

    it('同時の交換は多くても 1 件だけが成功し、接続が終わり、500 にならず行が残らない', async () => {
      for (let round = 0; round < 5; round += 1) {
        const flow = await startFlow();

        const responses = await Promise.all(Array.from({ length: 4 }, () => exchange(flow)));

        const statuses = responses.map((response) => response.status);
        expect(statuses.filter((status) => status === 200).length).toBeLessThanOrEqual(1);
        expect(statuses.every((status) => status === 200 || status === 400)).toBe(true);
        for (const response of responses.filter((candidate) => candidate.status === 400)) {
          expect(((await response.json()) as { error: string }).error).toBe('invalid_grant');
        }
        await expectConnectionEnded(flow);
      }
    });

    it('誤った resource の後の正しい再試行は再利用にならず、交換できる', async () => {
      const flow = await startFlow();

      const wrong = await exchange(flow, { resource: 'https://other.example/mcp' });

      expect(wrong.status).toBe(400);
      expect(((await wrong.json()) as { error: string }).error).toBe('invalid_target');
      const code = await prisma.oAuthStoreRecord.findFirstOrThrow({
        where: { grantId: flow.grantId, kind: 'AuthorizationCode' },
      });
      expect(code.consumedAt).toBeNull();
      await expectConnectionKept(flow);

      await firstRefreshToken(flow);
      await expectConnectionKept(flow);
    });

    it('resource の値の一部が誤っていてもコードを消費しない', async () => {
      const flow = await startFlow();
      const body = new URLSearchParams({
        grant_type: 'authorization_code',
        code: flow.code,
        code_verifier: flow.verifier,
        redirect_uri: REDIRECT_URI,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
      });
      body.append('resource', resource);
      body.append('resource', 'https://other.example/mcp');

      const wrong = await fetch(`${base}/oauth/token`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      });

      expect(wrong.status).toBe(400);
      expect(((await wrong.json()) as { error: string }).error).toBe('invalid_target');
      await firstRefreshToken(flow);
      await expectConnectionKept(flow);
    });
  });

  describe('保存の失敗', () => {
    it('新しいリフレッシュトークンの保存の失敗で消費が戻り、同じトークンで再試行できる', async () => {
      const flow = await startFlow();
      const first = await firstRefreshToken(flow);

      armTransactionFailure(1);
      const failed = await refresh(first);

      expect(failed.status).toBe(500);
      const rows = await prisma.oAuthStoreRecord.findMany({
        where: { grantId: flow.grantId, kind: 'RefreshToken' },
      });
      expect(rows).toHaveLength(1);
      expect(rows[0]?.consumedAt).toBeNull();

      await rotate(first);
      await expectConnectionKept(flow);
      expect(await graceAuditCount(flow)).toBe(0);
    });

    it('アクセストークンの保存の失敗の後は、猶予で再試行できる', async () => {
      const flow = await startFlow();
      const first = await firstRefreshToken(flow);

      armTransactionFailure(2);
      const failed = await refresh(first);

      expect(failed.status).toBe(500);
      await rotate(first);
      await expectConnectionKept(flow);
      expect(await graceAuditCount(flow)).toBe(1);
    });

    it('コードの交換の保存の失敗は発行せず、同じコードの再提示で接続が終わる', async () => {
      const flow = await startFlow();

      // 1 回目は認可コードの消費、2 回目はアクセストークンの保存
      armTransactionFailure(2);
      const failed = await exchange(flow);

      expect(failed.status).toBe(500);
      await expectInvalidGrant(await exchange(flow));
      await expectConnectionEnded(flow);
    });

    it('再利用の処理の失敗は 500 で使用済みの行を残し、復旧後の再提示で失効できる', async () => {
      const flow = await startFlow();
      const first = await firstRefreshToken(flow);
      const successor = await rotate(first);
      const latest = await rotate(successor);

      failReuseHandler = true;
      const failed = await refresh(first);
      failReuseHandler = false;

      expect(failed.status).toBe(500);
      expect(await prisma.externalAppConnection.count({ where: { grantId: flow.grantId } })).toBe(
        1
      );
      const consumed = await prisma.oAuthStoreRecord.count({
        where: { grantId: flow.grantId, kind: 'RefreshToken', consumedAt: { not: null } },
      });
      expect(consumed).toBe(2);

      await expectInvalidGrant(await refresh(first));
      await expectConnectionEnded(flow);
      await expectInvalidGrant(await refresh(latest));
    });

    it('猶予の監査の失敗はトークンを返さず、再試行で監査に残して発行する', async () => {
      const flow = await startFlow();
      const first = await firstRefreshToken(flow);
      await rotate(first);

      failGraceAudit = true;
      const failed = await refresh(first);
      failGraceAudit = false;

      expect(failed.status).toBe(500);
      expect(await graceAuditCount(flow)).toBe(0);
      await rotate(first);
      await expectConnectionKept(flow);
      expect(await graceAuditCount(flow)).toBe(1);
    });

    it('認可コードの再利用の処理の失敗の後も、再提示で失効できる', async () => {
      const flow = await startFlow();
      await firstRefreshToken(flow);

      failReuseHandler = true;
      const failed = await exchange(flow);
      failReuseHandler = false;

      expect(failed.status).toBe(500);
      await expectInvalidGrant(await exchange(flow));
      await expectConnectionEnded(flow);
    });
  });

  describe('Grant の行のロック（実 DB の競合）', () => {
    /** Grant の行をロックしたまま接続を終了し、待っていた保存が行を残さないことを確かめる */
    async function revokeWhileRequestWaits(
      flow: Flow,
      request: () => Promise<Response>
    ): Promise<Response> {
      let pending: Promise<Response> | undefined;
      await prisma.$transaction(
        async (tx) => {
          await tx.$queryRaw`
            SELECT "id" FROM "oauth_store_records"
            WHERE "grant_id" = ${flow.grantId} AND "kind" = 'Grant'
            FOR UPDATE`;
          pending = request();
          await waitForGrantLockWaiter();
          await tx.externalAppConnection.deleteMany({ where: { grantId: flow.grantId } });
          await tx.oAuthStoreRecord.deleteMany({ where: { grantId: flow.grantId } });
        },
        { timeout: LOCK_WAIT_TIMEOUT_MS * 2 }
      );
      if (pending === undefined) {
        throw new Error('要求が始まりませんでした');
      }
      return pending;
    }

    it('更新の保存は失効を待ち、失効の後にトークンの行を残さない', async () => {
      const flow = await startFlow();
      const first = await firstRefreshToken(flow);

      const response = await revokeWhileRequestWaits(flow, () => refresh(first));

      await expectInvalidGrant(response);
      expect(await prisma.oAuthStoreRecord.count({ where: { grantId: flow.grantId } })).toBe(0);
    });

    it('コードの交換は失効を待ち、失効の後にトークンの行を残さない', async () => {
      const flow = await startFlow();

      const response = await revokeWhileRequestWaits(flow, () => exchange(flow));

      await expectInvalidGrant(response);
      expect(await prisma.oAuthStoreRecord.count({ where: { grantId: flow.grantId } })).toBe(0);
    });

    it('コードの消費の後に接続が終わると、アクセストークンを保存せず invalid_grant にする', async () => {
      const flow = await startFlow();
      transactionCount = 0;
      // 1 回目は認可コードの消費、2 回目はアクセストークンの保存
      beforeTransaction = {
        nth: 2,
        action: async () => {
          await prisma.$transaction(async (tx) => {
            await tx.externalAppConnection.deleteMany({ where: { grantId: flow.grantId } });
            await tx.oAuthStoreRecord.deleteMany({ where: { grantId: flow.grantId } });
          });
        },
      };

      await expectInvalidGrant(await exchange(flow));

      expect(await prisma.oAuthStoreRecord.count({ where: { grantId: flow.grantId } })).toBe(0);
    });

    it('更新と接続の終了を同時に流しても、失効の後にトークンの行が残らない', async () => {
      for (let round = 0; round < 5; round += 1) {
        const flow = await startFlow();
        const first = await firstRefreshToken(flow);

        const [response] = await Promise.all([
          refresh(first),
          host.provider.RefreshToken.find(first).then(() =>
            prisma.$transaction(async (tx) => {
              await tx.$queryRaw`
                SELECT "id" FROM "oauth_store_records"
                WHERE "grant_id" = ${flow.grantId} AND "kind" = 'Grant'
                FOR UPDATE`;
              await tx.externalAppConnection.deleteMany({ where: { grantId: flow.grantId } });
              await tx.oAuthStoreRecord.deleteMany({ where: { grantId: flow.grantId } });
            })
          ),
        ]);

        expect([200, 400]).toContain(response.status);
        expect(await prisma.oAuthStoreRecord.count({ where: { grantId: flow.grantId } })).toBe(0);
      }
    });
  });
});
