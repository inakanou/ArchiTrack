/**
 * @fileoverview 外部アプリ用トークンの検証の統合検証（user-authentication タスク 75.1）
 *
 * 実際の oidc-provider・保存アダプター・PostgreSQL で発行したトークンを検証する。
 * - 33.3: 想定利用者が `OAUTH_RESOURCE_URL` のトークンだけを受け付ける
 * - 48.2・48.3: 期限を過ぎた接続は検証の中で終わり、要求の送信元 IP が監査に残る
 * - 48.9: 失効した接続のトークンは拒否する
 * - 51.1: 接続の範囲・利用者の現在の状態と権限のすべてが認めるときだけ主体を返す
 * - 51.3: 画面用のトークンは拒否する
 * - 51.7: 期限切れの終了の監査に実行者・対象・アプリ・範囲・理由・日時・送信元 IP が残る
 *
 * Design: Requirements 46-51 > ExternalAppTokenVerifier
 *
 * @requirement user-authentication/REQ-33.3
 * @requirement user-authentication/REQ-48.2
 * @requirement user-authentication/REQ-48.3
 * @requirement user-authentication/REQ-48.9
 * @requirement user-authentication/REQ-51.1
 * @requirement user-authentication/REQ-51.3
 * @requirement user-authentication/REQ-51.7
 */

import { createHash, generateKeyPairSync, randomBytes, randomUUID } from 'crypto';
import http from 'http';
import type { AddressInfo } from 'net';
import express from 'express';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { validateEnv } from '../../config/env.js';
import type { PrismaClient } from '../../generated/prisma/client.js';

validateEnv();

import getPrismaClient from '../../db.js';
import {
  createExternalAppClientRegistry,
  parseExternalAppOAuthConfig,
  type ExternalAppOAuthConfig,
} from '../../oauth/client-registry.js';
import type { ExternalAppScope } from '../../oauth/oauth.types.js';
import { createOAuthProviderHost, type OAuthProviderHost } from '../../oauth/provider.js';
import { AuditLogService } from '../../services/audit-log.service.js';
import {
  CONNECTION_ABSOLUTE_MS,
  CONNECTION_IDLE_MS,
  ExternalAppConnectionService,
} from '../../services/external-app-connection.service.js';
import {
  ExternalAppTokenVerificationError,
  ExternalAppTokenVerifier,
  type ExternalAppTokenVerifierDeps,
} from '../../services/external-app-token-verifier.service.js';
import { TokenService } from '../../services/token.service.js';
import { deleteAuditLogsWithArchivePermission } from '../../utils/audit-log-archive-permission.js';
import logger from '../../utils/logger.js';
import { createTestUser, type TestUserState } from './test-user-factory.js';

const CLIENT_ID = 'test-oauth751-client';
const CLIENT_SECRET = randomBytes(24).toString('hex');
const REDIRECT_URI = 'https://client.example/callback';
const SOURCE = { ipAddress: '198.51.100.75', userAgent: 'oauth-751-integration' } as const;
const LOCK_WAIT_TIMEOUT_MS = 3000;
const DAY_MS = 24 * 60 * 60 * 1000;

type CookieJar = Map<string, string>;

interface PermissionSpec {
  readonly resource: string;
  readonly action: string;
}

interface Connected {
  readonly userId: string;
  readonly grantId: string;
  readonly connectionId: string;
  readonly accessToken: string;
  readonly refreshToken: string;
  /** 交換に使った（使用済みの）認可コード */
  readonly usedCode: string;
}

interface ConnectOptions {
  /** 認可要求と Grant の範囲 */
  readonly grantScope?: string;
  /** 接続の行の範囲 */
  readonly connectionScopes?: readonly ExternalAppScope[];
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

describe('外部アプリ用トークンの検証（タスク75.1）', () => {
  let prisma: PrismaClient;
  let server: http.Server;
  let host: OAuthProviderHost;
  let config: ExternalAppOAuthConfig;
  let connectionService: ExternalAppConnectionService;
  let base: string;
  let resource: string;
  const userIds: string[] = [];
  const grantIds: string[] = [];
  const roleIds: string[] = [];
  const createdPermissionIds: string[] = [];

  async function startServer(): Promise<void> {
    const expressApp = express();
    expressApp.set('trust proxy', 1);
    server = http.createServer(expressApp);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;
    base = `http://127.0.0.1:${port}`;
    resource = `${base}/mcp`;
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const parsed = parseExternalAppOAuthConfig({
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
      OAUTH_JWKS: JSON.stringify({
        keys: [{ ...privateKey.export({ format: 'jwk' }), kid: 'k1', use: 'sig', alg: 'RS256' }],
      }),
      OAUTH_COOKIE_KEYS: JSON.stringify([randomBytes(32).toString('hex')]),
      OAUTH_TOKEN_HMAC_KEY: randomBytes(32).toString('hex'),
    });
    if (parsed === null) {
      throw new Error('試験の設定が読めません');
    }
    config = parsed;
    connectionService = new ExternalAppConnectionService({
      prisma,
      auditLogService: new AuditLogService({ prisma }),
      clientRegistry: createExternalAppClientRegistry(config),
      observeAnomaly: vi.fn(),
    });
    host = createOAuthProviderHost(config, { prisma, connectionService });
    expressApp.use(host.middleware);
    // 同意の完了（タスク74の手続きの代わりに試験だけが使う経路）。本番には載せない
    expressApp.post('/oauth/interaction/:uid/test-finish', express.json(), async (req, res) => {
      const { accountId, scope } = req.body as { accountId: string; scope: string };
      const grant = new host.provider.Grant({ accountId, clientId: CLIENT_ID });
      grant.addResourceScope(resource, scope);
      const grantId = await grant.save();
      const returnTo = await host.provider.interactionResult(req, res, {
        login: { accountId },
        consent: { grantId },
      });
      res.json({ returnTo, grantId });
    });
  }

  function verifier(
    overrides: Partial<ExternalAppTokenVerifierDeps> = {}
  ): ExternalAppTokenVerifier {
    return new ExternalAppTokenVerifier({
      provider: host.provider,
      prisma,
      connectionService,
      clientRegistry: createExternalAppClientRegistry(config),
      resourceUrl: config.resourceUrl,
      ...overrides,
    });
  }

  async function ensurePermission(spec: PermissionSpec): Promise<string> {
    const existing = await prisma.permission.findUnique({
      where: { resource_action: { resource: spec.resource, action: spec.action } },
    });
    if (existing) {
      return existing.id;
    }
    const created = await prisma.permission.create({
      data: { resource: spec.resource, action: spec.action, description: 'oauth751' },
    });
    createdPermissionIds.push(created.id);
    return created.id;
  }

  async function createUser(
    options: { permission?: PermissionSpec | null; state?: TestUserState } = {}
  ): Promise<string> {
    const id = randomUUID();
    await createTestUser(
      prisma,
      {
        id,
        email: `oauth751-${id}@example.test`,
        displayName: 'OAuth 751',
        passwordHash: 'not-used',
      },
      options.state
    );
    userIds.push(id);
    const permission =
      options.permission === undefined
        ? { resource: 'external_app', action: 'connect' }
        : options.permission;
    if (permission !== null) {
      const permissionId = await ensurePermission(permission);
      const role = await prisma.role.create({
        data: { name: `oauth751-${randomUUID()}`, description: 'oauth751' },
      });
      roleIds.push(role.id);
      await prisma.rolePermission.create({ data: { roleId: role.id, permissionId } });
      await prisma.userRole.create({ data: { userId: id, roleId: role.id } });
    }
    return id;
  }

  /** 認可コードまで進め、接続の行を作る（交換はしない） */
  async function authorize(
    userId: string,
    options: ConnectOptions = {}
  ): Promise<{ grantId: string; connectionId: string; code: string; verifier: string }> {
    const grantScope = options.grantScope ?? 'read write';
    const jar: CookieJar = new Map();
    const pkceVerifier = randomBytes(32).toString('base64url');
    const query = new URLSearchParams({
      client_id: CLIENT_ID,
      response_type: 'code',
      redirect_uri: REDIRECT_URI,
      scope: grantScope,
      resource,
      state: 'state-751',
      code_challenge: createHash('sha256').update(pkceVerifier).digest('base64url'),
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
      body: JSON.stringify({ accountId: userId, scope: grantScope }),
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
    const connection = await prisma.externalAppConnection.create({
      data: {
        userId,
        clientId: CLIENT_ID,
        grantId,
        scopes: [...(options.connectionScopes ?? ['read', 'write'])],
        consentedAt: now,
        expiresAt: new Date(now.getTime() + CONNECTION_ABSOLUTE_MS),
      },
    });
    return { grantId, connectionId: connection.id, code, verifier: pkceVerifier };
  }

  async function connect(userId: string, options: ConnectOptions = {}): Promise<Connected> {
    const authorized = await authorize(userId, options);
    const response = await fetch(`${base}/oauth/token`, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        accept: 'application/json',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: authorized.code,
        code_verifier: authorized.verifier,
        redirect_uri: REDIRECT_URI,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        resource,
      }).toString(),
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { access_token: string; refresh_token: string };
    return {
      userId,
      grantId: authorized.grantId,
      connectionId: authorized.connectionId,
      accessToken: body.access_token,
      refreshToken: body.refresh_token,
      usedCode: authorized.code,
    };
  }

  async function expectInvalidToken(
    pending: ReturnType<ExternalAppTokenVerifier['verify']>
  ): Promise<void> {
    const result = await pending;
    expect(result).toEqual({ ok: false, error: { kind: 'INVALID_TOKEN' } });
  }

  function connectionCount(grantId: string): Promise<number> {
    return prisma.externalAppConnection.count({ where: { grantId } });
  }

  /** 接続の行を `FOR KEY SHARE` で待っている文が現れるまで待つ */
  async function waitForConnectionLockWaiter(): Promise<void> {
    const deadline = Date.now() + LOCK_WAIT_TIMEOUT_MS;
    while (Date.now() < deadline) {
      const [row] = await prisma.$queryRaw<{ count: bigint }[]>`
        SELECT count(*) AS count FROM pg_stat_activity
        WHERE wait_event_type = 'Lock'
          AND query ILIKE '%external_app_connections%FOR KEY SHARE%'`;
      if ((row?.count ?? 0n) > 0n) {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error('接続の行のロックを待つ文が現れませんでした');
  }

  beforeAll(async () => {
    prisma = getPrismaClient();
    await startServer();
  });

  afterEach(() => {
    vi.restoreAllMocks();
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
    await prisma.userRole.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.rolePermission.deleteMany({ where: { roleId: { in: roleIds } } });
    await prisma.role.deleteMany({ where: { id: { in: roleIds } } });
    await prisma.permission.deleteMany({ where: { id: { in: createdPermissionIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  describe('成功（51.1）', () => {
    it('有効なトークンで主体と範囲を返し、最後の利用を記録し、最終ログインを更新しない', async () => {
      const userId = await createUser();
      const connected = await connect(userId);
      const now = new Date();

      const result = await verifier().verify(connected.accessToken, now, SOURCE);

      expect(result).toEqual({
        ok: true,
        value: {
          userId,
          clientId: CLIENT_ID,
          connectionId: connected.connectionId,
          scopes: ['read', 'write'],
        },
      });
      const row = await prisma.externalAppConnection.findUniqueOrThrow({
        where: { id: connected.connectionId },
      });
      expect(row.lastUsedAt?.getTime()).toBe(now.getTime());
      const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
      expect(user.lastLoginAt).toBeNull();
    });

    it('読み取りだけの同意では範囲は read だけになる', async () => {
      const userId = await createUser();
      const connected = await connect(userId, { grantScope: 'read', connectionScopes: ['read'] });

      const result = await verifier().verify(connected.accessToken, new Date(), SOURCE);

      expect(result.ok && result.value.scopes).toEqual(['read']);
    });

    it('トークンの範囲は接続の範囲より広くならない', async () => {
      const userId = await createUser();
      const connected = await connect(userId, {
        grantScope: 'read write',
        connectionScopes: ['read'],
      });

      const result = await verifier().verify(connected.accessToken, new Date(), SOURCE);

      expect(result.ok && result.value.scopes).toEqual(['read']);
    });

    it.each([
      ['*:*', { resource: '*', action: '*' }],
      ['external_app:*', { resource: 'external_app', action: '*' }],
      ['*:connect', { resource: '*', action: 'connect' }],
    ])('ワイルドカードの権限 %s でも主体を返す', async (_label, permission) => {
      const userId = await createUser({ permission });
      const connected = await connect(userId);

      const result = await verifier().verify(connected.accessToken, new Date(), SOURCE);

      expect(result.ok).toBe(true);
    });
  });

  describe('トークンの不成立（33.3、48.9、51.3）', () => {
    it.each([
      ['空', ''],
      ['未知の値', randomBytes(32).toString('base64url')],
      ['使えない文字を含む値', 'abc def'],
      ['長すぎる値', 'a'.repeat(4096)],
    ])('%s のトークンは INVALID_TOKEN', async (_label, value) => {
      await expectInvalidToken(verifier().verify(value, new Date(), SOURCE));
    });

    it('画面用のアクセストークン（JWT）は INVALID_TOKEN', async () => {
      const userId = await createUser();
      await connect(userId);
      const screenToken = await new TokenService().generateAccessToken({
        accessTokenGeneration: 0,
        userId,
        email: `oauth751-${userId}@example.test`,
        roles: [],
      });

      await expectInvalidToken(verifier().verify(screenToken, new Date(), SOURCE));
    });

    it('リフレッシュトークンをアクセストークンとして提示すると INVALID_TOKEN で、接続は保たれる', async () => {
      const userId = await createUser();
      const connected = await connect(userId);

      await expectInvalidToken(verifier().verify(connected.refreshToken, new Date(), SOURCE));

      expect(await connectionCount(connected.grantId)).toBe(1);
      expect(
        await prisma.auditLog.count({ where: { action: 'TOKEN_REUSE_DETECTED', targetId: userId } })
      ).toBe(0);
    });

    it('使用済みと未使用の認可コードの提示は INVALID_TOKEN で、接続は保たれる', async () => {
      const userId = await createUser();
      const connected = await connect(userId);
      const otherUserId = await createUser();
      const pending = await authorize(otherUserId);

      await expectInvalidToken(verifier().verify(connected.usedCode, new Date(), SOURCE));
      await expectInvalidToken(verifier().verify(pending.code, new Date(), SOURCE));

      expect(await connectionCount(connected.grantId)).toBe(1);
      expect(await connectionCount(pending.grantId)).toBe(1);
    });

    it('有効期限を過ぎたトークンは INVALID_TOKEN（判定の時刻と保存の期限の両方）', async () => {
      const userId = await createUser();
      const connected = await connect(userId);
      const issued = await host.provider.AccessToken.find(connected.accessToken);
      if (typeof issued?.exp !== 'number') {
        throw new Error('発行したトークンが読めません');
      }

      await expectInvalidToken(
        verifier().verify(connected.accessToken, new Date(issued.exp * 1000), SOURCE)
      );
      await prisma.oAuthStoreRecord.updateMany({
        where: { grantId: connected.grantId, kind: 'AccessToken' },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      await expectInvalidToken(verifier().verify(connected.accessToken, new Date(), SOURCE));
      expect(await connectionCount(connected.grantId)).toBe(1);
    });

    it('想定利用者が OAUTH_RESOURCE_URL でないトークンは INVALID_TOKEN', async () => {
      const userId = await createUser();
      const connected = await connect(userId);

      await expectInvalidToken(
        verifier({ resourceUrl: `${base}/other` }).verify(connected.accessToken, new Date(), SOURCE)
      );
      await expectInvalidToken(
        verifier({ resourceUrl: `${resource}/` }).verify(connected.accessToken, new Date(), SOURCE)
      );
    });

    it('許可の一覧から外れたアプリのトークンは INVALID_TOKEN', async () => {
      const userId = await createUser();
      const connected = await connect(userId);
      const registry = createExternalAppClientRegistry({ ...config, clients: [] });

      await expectInvalidToken(
        verifier({ clientRegistry: registry }).verify(connected.accessToken, new Date(), SOURCE)
      );
    });

    it('read を含まないトークンは INVALID_TOKEN', async () => {
      const userId = await createUser();
      const connected = await connect(userId, { grantScope: 'write' });

      await expectInvalidToken(verifier().verify(connected.accessToken, new Date(), SOURCE));
    });
  });

  describe('接続の不成立（48.2、48.3、48.9、51.7）', () => {
    it('取り消した接続のトークンは INVALID_TOKEN', async () => {
      const userId = await createUser();
      const connected = await connect(userId);
      const revoked = await connectionService.revokeOwn(userId, connected.connectionId, {
        userId,
      });
      expect(revoked.ok).toBe(true);

      await expectInvalidToken(verifier().verify(connected.accessToken, new Date(), SOURCE));
    });

    it('接続の行が無い Grant のトークンは INVALID_TOKEN', async () => {
      const userId = await createUser();
      const connected = await connect(userId);
      await prisma.externalAppConnection.delete({ where: { id: connected.connectionId } });

      await expectInvalidToken(verifier().verify(connected.accessToken, new Date(), SOURCE));
    });

    it('トークンと接続の利用者が食い違うと INVALID_TOKEN', async () => {
      const userId = await createUser();
      const connected = await connect(userId);
      const otherUserId = await createUser();
      await prisma.externalAppConnection.update({
        where: { id: connected.connectionId },
        data: { userId: otherUserId },
      });

      await expectInvalidToken(verifier().verify(connected.accessToken, new Date(), SOURCE));
    });

    it('同意から 90 日ちょうどで接続を終え、送信元 IP つきの監査を残す。直前は有効', async () => {
      const userId = await createUser();
      const connected = await connect(userId);
      const now = new Date();
      const consentedAt = new Date(now.getTime() - CONNECTION_ABSOLUTE_MS + 1);
      await prisma.externalAppConnection.update({
        where: { id: connected.connectionId },
        data: {
          consentedAt,
          lastUsedAt: new Date(now.getTime() - 1000),
          expiresAt: new Date(consentedAt.getTime() + CONNECTION_ABSOLUTE_MS),
        },
      });

      const before = await verifier().verify(connected.accessToken, now, SOURCE);
      expect(before.ok).toBe(true);

      await expectInvalidToken(
        verifier().verify(connected.accessToken, new Date(now.getTime() + 1), SOURCE)
      );

      expect(await connectionCount(connected.grantId)).toBe(0);
      expect(await prisma.oAuthStoreRecord.count({ where: { grantId: connected.grantId } })).toBe(
        0
      );
      const audits = await prisma.auditLog.findMany({
        where: { action: 'CONNECTION_ENDED', targetId: userId },
      });
      expect(audits).toHaveLength(1);
      expect(audits[0]?.metadata).toMatchObject({
        clientId: CLIENT_ID,
        scopes: ['read', 'write'],
        reason: 'ABSOLUTE_EXPIRED',
        ipAddress: SOURCE.ipAddress,
        userAgent: SOURCE.userAgent,
      });
    });

    it('最後の利用から 30 日ちょうどで接続を終え、送信元 IP つきの監査を残す', async () => {
      const userId = await createUser();
      const connected = await connect(userId);
      const now = new Date();
      await prisma.externalAppConnection.update({
        where: { id: connected.connectionId },
        data: {
          consentedAt: new Date(now.getTime() - 40 * DAY_MS),
          lastUsedAt: new Date(now.getTime() - CONNECTION_IDLE_MS),
          expiresAt: new Date(now.getTime() + 50 * DAY_MS),
        },
      });

      await expectInvalidToken(verifier().verify(connected.accessToken, now, SOURCE));

      expect(await connectionCount(connected.grantId)).toBe(0);
      const audit = await prisma.auditLog.findFirstOrThrow({
        where: { action: 'CONNECTION_ENDED', targetId: userId },
      });
      expect(audit.metadata).toMatchObject({
        reason: 'IDLE_EXPIRED',
        ipAddress: SOURCE.ipAddress,
        userAgent: SOURCE.userAgent,
      });
    });

    it('最後の利用から 30 日の直前は有効で、利用の記録で期限が延びる', async () => {
      const userId = await createUser();
      const connected = await connect(userId);
      const now = new Date();
      await prisma.externalAppConnection.update({
        where: { id: connected.connectionId },
        data: {
          consentedAt: new Date(now.getTime() - 40 * DAY_MS),
          lastUsedAt: new Date(now.getTime() - CONNECTION_IDLE_MS + 1),
          expiresAt: new Date(now.getTime() + 50 * DAY_MS),
        },
      });

      const result = await verifier().verify(connected.accessToken, now, SOURCE);

      expect(result.ok).toBe(true);
      const row = await prisma.externalAppConnection.findUniqueOrThrow({
        where: { id: connected.connectionId },
      });
      expect(row.lastUsedAt?.getTime()).toBe(now.getTime());
    });
  });

  describe('利用者の不成立（51.1）', () => {
    it('権限を外された利用者のトークンは INVALID_TOKEN', async () => {
      const userId = await createUser();
      const connected = await connect(userId);
      await prisma.userRole.deleteMany({ where: { userId } });

      await expectInvalidToken(verifier().verify(connected.accessToken, new Date(), SOURCE));
    });

    it('関係の無い権限だけの利用者のトークンは INVALID_TOKEN', async () => {
      const userId = await createUser({ permission: { resource: 'external_app', action: 'read' } });
      const connected = await connect(userId);

      await expectInvalidToken(verifier().verify(connected.accessToken, new Date(), SOURCE));
    });

    it('無効化された利用者のトークンは INVALID_TOKEN', async () => {
      const userId = await createUser();
      const connected = await connect(userId);
      await prisma.user.update({ where: { id: userId }, data: { isActive: false } });

      await expectInvalidToken(verifier().verify(connected.accessToken, new Date(), SOURCE));
    });

    it.each([
      ['初回のパスワード変更を要する', { mustChangePassword: true }],
      ['2FA 未登録の', { twoFactorEnabled: false, twoFactorSecret: null }],
    ])('%s利用者（制限中、34.2）のトークンは INVALID_TOKEN', async (_label, data) => {
      const userId = await createUser();
      const connected = await connect(userId);
      await prisma.user.update({ where: { id: userId }, data });

      await expectInvalidToken(verifier().verify(connected.accessToken, new Date(), SOURCE));
    });
  });

  describe('利用の記録（51.7、48.2）', () => {
    it('利用の記録は 1 分に 1 回に抑えられる', async () => {
      const userId = await createUser();
      const connected = await connect(userId);
      const first = new Date();
      const target = verifier();

      expect((await target.verify(connected.accessToken, first, SOURCE)).ok).toBe(true);
      const withinMinute = new Date(first.getTime() + 59_999);
      expect((await target.verify(connected.accessToken, withinMinute, SOURCE)).ok).toBe(true);
      const kept = await prisma.externalAppConnection.findUniqueOrThrow({
        where: { id: connected.connectionId },
      });
      expect(kept.lastUsedAt?.getTime()).toBe(first.getTime());

      const afterMinute = new Date(first.getTime() + 60_000);
      expect((await target.verify(connected.accessToken, afterMinute, SOURCE)).ok).toBe(true);
      const updated = await prisma.externalAppConnection.findUniqueOrThrow({
        where: { id: connected.connectionId },
      });
      expect(updated.lastUsedAt?.getTime()).toBe(afterMinute.getTime());
    });

    it('利用の記録の失敗は検証を失敗させず、トークンを記録しない', async () => {
      const userId = await createUser();
      const connected = await connect(userId);
      const warn = vi.spyOn(logger, 'warn');
      const failingService = {
        assertActive: connectionService.assertActive.bind(connectionService),
        confirmNotEnded: connectionService.confirmNotEnded.bind(connectionService),
        touch: () => Promise.reject(new Error(`touch failed ${connected.accessToken}`)),
      };

      const result = await verifier({ connectionService: failingService }).verify(
        connected.accessToken,
        new Date(),
        SOURCE
      );

      expect(result.ok).toBe(true);
      expect(warn).toHaveBeenCalled();
      expect(JSON.stringify(warn.mock.calls)).not.toContain(connected.accessToken);
    });
  });

  describe('基盤の失敗と並行（72.1 の申し送り）', () => {
    it('接続の判定の DB の失敗は 401 にせず例外にし、トークンを文に含めない', async () => {
      const userId = await createUser();
      const connected = await connect(userId);
      const lockTimeout = Object.assign(
        new Error(`Transaction API error: unable to start a transaction ${connected.accessToken}`),
        { code: 'P2028' }
      );
      const failingService = {
        assertActive: () => Promise.reject(lockTimeout),
        confirmNotEnded: connectionService.confirmNotEnded.bind(connectionService),
        touch: connectionService.touch.bind(connectionService),
      };

      const pending = verifier({ connectionService: failingService }).verify(
        connected.accessToken,
        new Date(),
        SOURCE
      );

      const error = await pending.then(
        () => null,
        (caught: unknown) => caught
      );
      expect(error).toBeInstanceOf(ExternalAppTokenVerificationError);
      expect((error as ExternalAppTokenVerificationError).code).toBe('P2028');
      expect(String((error as Error).message)).not.toContain(connected.accessToken);
      expect((error as Error).cause).toBeUndefined();
    });

    it('取り消しの途中の検証は取り消しのコミットを待ち、コミットの後に成功しない', async () => {
      const userId = await createUser();
      const connected = await connect(userId);
      let release: () => void = () => undefined;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      let revocationStarted: () => void = () => undefined;
      const started = new Promise<void>((resolve) => {
        revocationStarted = resolve;
      });

      const revocation = prisma.$transaction(
        async (tx) => {
          const ended = await connectionService.revokeAllForUser(
            userId,
            'LOGOUT_ALL',
            { userId },
            tx
          );
          expect(ended).toBe(1);
          revocationStarted();
          await gate;
        },
        { timeout: 15_000 }
      );
      await started;

      const verification = verifier().verify(connected.accessToken, new Date(), SOURCE);
      await waitForConnectionLockWaiter();
      release();
      await revocation;

      await expectInvalidToken(verification);
      const row = await prisma.externalAppConnection.findUnique({
        where: { id: connected.connectionId },
      });
      expect(row).toBeNull();
    });
  });
});
