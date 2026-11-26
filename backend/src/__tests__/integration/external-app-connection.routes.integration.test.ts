/**
 * @fileoverview 接続の一覧と取り消しの API を実際の app.ts で確かめる（user-authentication タスク 77.1）
 *
 * - 本人用（`/api/v1/external-app-connections`）と管理者用（`/api/v1/admin/external-app-connections`）
 * - 画面用のアクセストークンだけで認証し、外部アプリ用のトークンは 401
 * - 管理者用はロール `admin` を DB で確かめる。権限（`*:*` を含む）では通さない（design.md の SystemAdminGuard）
 * - 状態を変える経路は既存の CSRF の検証を通す
 * - 外部アプリ用のトークンは、同意の API を 2FA から通して認可サーバーの `/oauth/token` で実際に発行したものを使う
 *
 * Design: Requirements 46-51 > ExternalAppRoutes, SystemAdminGuard
 *
 * @requirement user-authentication/REQ-49.1
 * @requirement user-authentication/REQ-49.4
 * @requirement user-authentication/REQ-49.5
 * @requirement user-authentication/REQ-49.6
 * @requirement user-authentication/REQ-49.8
 * @requirement user-authentication/REQ-49.9
 */

import { createHash, generateKeyPairSync, randomBytes, randomUUID } from 'crypto';
import type { Express } from 'express';
import { authenticator } from 'otplib';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestUser } from './test-user-factory.js';

const ISSUER = 'http://localhost:5174';
const RESOURCE = `${ISSUER}/mcp`;
const CLIENT_A = 'test-oauth771-client-a';
const CLIENT_B = 'test-oauth771-client-b';
const CLIENT_SECRET = randomBytes(24).toString('hex');
const APP_NAME_A = 'Connection Routes Test App A';
const APP_NAME_B = 'Connection Routes Test App B';
/** 許可の一覧に無いアプリ（一覧では表示名の代わりに client ID を返す） */
const REMOVED_CLIENT = 'test-oauth771-removed-client';
const REDIRECT_URI = 'https://client.example/callback';
const WHOAMI = '/oauth/resource/whoami';
const OWN = '/api/v1/external-app-connections';
const ADMIN = '/api/v1/admin/external-app-connections';
const USER_AGENT = 'oauth771-agent/1.0';
const DAY_MS = 24 * 60 * 60 * 1000;
const OAUTH_KEYS = [
  'OAUTH_ALLOWED_CLIENTS',
  'OAUTH_ISSUER',
  'OAUTH_RESOURCE_URL',
  'OAUTH_JWKS',
  'OAUTH_COOKIE_KEYS',
  'OAUTH_TOKEN_HMAC_KEY',
] as const;
const ADMIN_FORBIDDEN_BODY = {
  error: 'FORBIDDEN',
  message: 'Insufficient permissions',
  code: 'SYSTEM_ADMIN_REQUIRED',
};

/** 応答の Path に従って Cookie を送る入れ物 */
class PathCookieJar {
  private readonly cookies = new Map<string, { value: string; path: string }>();

  store(lines: string[] | string | undefined): void {
    const list = lines === undefined ? [] : Array.isArray(lines) ? lines : [lines];
    for (const line of list) {
      const [pair = '', ...attributes] = line.split(';');
      const separator = pair.indexOf('=');
      const name = pair.slice(0, separator).trim();
      const value = pair.slice(separator + 1).trim();
      const pathAttribute = attributes
        .map((attribute) => attribute.trim())
        .find((attribute) => attribute.toLowerCase().startsWith('path='));
      const path = pathAttribute?.slice('path='.length) ?? '/';
      if (value === '' || /expires=Thu, 01 Jan 1970/i.test(line)) {
        this.cookies.delete(name);
      } else {
        this.cookies.set(name, { value, path });
      }
    }
  }

  header(requestPath: string): string {
    return [...this.cookies]
      .filter(
        ([, { path }]) => path === '/' || requestPath === path || requestPath.startsWith(`${path}/`)
      )
      .map(([name, { value }]) => `${name}=${value}`)
      .join('; ');
  }
}

type UserKind = 'connector' | 'admin' | 'wildcard' | 'admin-claim-only';

interface ScreenUser {
  readonly id: string;
  readonly email: string;
  readonly displayName: string;
  readonly secret: string;
  /** 画面用のアクセストークン */
  readonly token: string;
}

interface ExternalConnection {
  readonly id: string;
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly grantId: string;
}

describe('接続の一覧と取り消しの API（タスク77.1、app.ts）', () => {
  let app: Express;
  let prisma: Awaited<typeof import('../../db.js')>['default'] extends () => infer P ? P : never;
  let redis: (typeof import('../../redis.js'))['default'];
  let tokenService: (typeof import('../../services/token.service.js'))['default'];
  let maxLimit: number;
  let maxOffset: number;
  let frontendOrigin: string;
  let csrfToken: string;
  const saved = new Map<string, string | undefined>();
  const userIds: string[] = [];
  const roleIds: string[] = [];
  const flowUids = new Set<string>();

  beforeAll(async () => {
    for (const key of OAUTH_KEYS) {
      saved.set(key, process.env[key]);
    }
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    process.env.OAUTH_ALLOWED_CLIENTS = JSON.stringify([
      {
        clientId: CLIENT_A,
        clientSecret: CLIENT_SECRET,
        displayName: APP_NAME_A,
        redirectUris: [REDIRECT_URI],
      },
      {
        clientId: CLIENT_B,
        clientSecret: CLIENT_SECRET,
        displayName: APP_NAME_B,
        redirectUris: [REDIRECT_URI],
      },
    ]);
    process.env.OAUTH_ISSUER = ISSUER;
    process.env.OAUTH_RESOURCE_URL = RESOURCE;
    process.env.OAUTH_JWKS = JSON.stringify({
      keys: [{ ...privateKey.export({ format: 'jwk' }), kid: 'k771', use: 'sig', alg: 'RS256' }],
    });
    process.env.OAUTH_COOKIE_KEYS = JSON.stringify([randomBytes(32).toString('hex')]);
    process.env.OAUTH_TOKEN_HMAC_KEY = randomBytes(32).toString('hex');

    ({ default: app } = await import('../../app.js'));
    const { default: getPrismaClient } = await import('../../db.js');
    prisma = getPrismaClient() as typeof prisma;
    const redisModule = await import('../../redis.js');
    redis = redisModule.default;
    await redisModule.initRedis();
    expect(redis.getClient()?.status).toBe('ready');
    ({ default: tokenService } = await import('../../services/token.service.js'));
    ({ CONNECTION_LIST_MAX_LIMIT: maxLimit, CONNECTION_LIST_MAX_OFFSET: maxOffset } =
      await import('../../services/external-app-connection.service.js'));
    const { getEnv } = await import('../../config/env.js');
    frontendOrigin = new URL(getEnv().FRONTEND_URL).origin;

    const csrfResponse = await request(app).get('/csrf-token');
    expect(csrfResponse.status).toBe(200);
    csrfToken = csrfResponse.body.csrfToken as string;
  });

  afterAll(async () => {
    const { deleteAuditLogsWithArchivePermission } =
      await import('../../utils/audit-log-archive-permission.js');
    await prisma.externalAppConnection.deleteMany({ where: { userId: { in: userIds } } });
    for (const clientId of [CLIENT_A, CLIENT_B]) {
      await prisma.oAuthStoreRecord.deleteMany({
        where: { payload: { path: ['clientId'], equals: clientId } },
      });
      await prisma.oAuthStoreRecord.deleteMany({
        where: { payload: { path: ['params', 'client_id'], equals: clientId } },
      });
    }
    // 再開で作られる認可サーバーの Session の行は clientId を持たないので、利用者で消す（タスク79.4）
    await prisma.oAuthStoreRecord.deleteMany({
      where: {
        kind: 'Session',
        OR: userIds.map((id) => ({ payload: { path: ['accountId'], equals: id } })),
      },
    });
    await deleteAuditLogsWithArchivePermission(prisma, { targetId: { in: userIds } });
    await deleteAuditLogsWithArchivePermission(prisma, { actorId: { in: userIds } });
    await prisma.refreshToken.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.userRole.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.rolePermission.deleteMany({ where: { roleId: { in: roleIds } } });
    await prisma.role.deleteMany({ where: { id: { in: roleIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
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
    for (const [key, value] of saved) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  async function assignPermission(userId: string, resource: string, action: string) {
    const permission = await prisma.permission.findUniqueOrThrow({
      where: { resource_action: { resource, action } },
    });
    const role = await prisma.role.create({
      data: { name: `oauth771-${randomUUID()}`, description: 'oauth771' },
    });
    roleIds.push(role.id);
    await prisma.rolePermission.create({ data: { roleId: role.id, permissionId: permission.id } });
    await prisma.userRole.create({ data: { userId, roleId: role.id } });
  }

  /**
   * 利用者を作る
   *
   * - connector: 外部アプリの接続の権限だけ
   * - admin: ロール `admin`（seed のシステム管理者）
   * - wildcard: 権限 `*:*` を与えたカスタムのロール（ロール `admin` ではない）
   * - admin-claim-only: 接続の権限だけを持ち、画面用のトークンの roles に `admin` を書いた利用者
   */
  async function createUser(
    kind: UserKind,
    state: { twoFactor?: boolean; mustChangePassword?: boolean } = {}
  ): Promise<ScreenUser> {
    const secret = authenticator.generateSecret();
    const id = randomUUID();
    const email = `oauth771-${id}@example.test`;
    const displayName = `OAuth 771 ${kind}`;
    await createTestUser(
      prisma,
      { id, email, displayName, passwordHash: 'not-used' },
      {
        twoFactor: state.twoFactor === false ? false : { secret },
        mustChangePassword: state.mustChangePassword ?? false,
      }
    );
    userIds.push(id);
    if (kind === 'admin') {
      const adminRole = await prisma.role.findUniqueOrThrow({ where: { name: 'admin' } });
      await prisma.userRole.create({ data: { userId: id, roleId: adminRole.id } });
    } else if (kind === 'wildcard') {
      await assignPermission(id, '*', '*');
    } else {
      await assignPermission(id, 'external_app', 'connect');
    }
    const token = await tokenService.generateAccessToken({
      userId: id,
      email,
      roles: kind === 'admin' || kind === 'admin-claim-only' ? ['admin'] : [],
      accessTokenGeneration: 0,
    });
    return { id, email, displayName, secret, token };
  }

  function consentCall(
    method: 'get' | 'post',
    uid: string,
    action: string,
    bearer: string,
    jar: PathCookieJar,
    body?: object
  ) {
    const path = `/oauth/interaction/${uid}/${action}`;
    const cookies = [jar.header(path)];
    if (method === 'post') {
      cookies.push(`csrf-token=${csrfToken}`);
    }
    let call = request(app)
      [method](path)
      .set('Authorization', `Bearer ${bearer}`)
      .set('Cookie', cookies.filter((part) => part !== '').join('; '));
    if (method === 'post') {
      call = call.set('Origin', frontendOrigin).set('X-CSRF-Token', csrfToken);
    }
    return body === undefined ? call : call.send(body);
  }

  /** 同意の API を 2FA から通して接続し、認可サーバーが発行した外部アプリ用のトークンを得る */
  async function connect(user: ScreenUser, clientId: string): Promise<ExternalConnection> {
    const jar = new PathCookieJar();
    const verifier = randomBytes(32).toString('base64url');
    const query = new URLSearchParams({
      client_id: clientId,
      response_type: 'code',
      redirect_uri: REDIRECT_URI,
      resource: RESOURCE,
      scope: 'offline_access read write',
      state: 'state-771',
      code_challenge: createHash('sha256').update(verifier).digest('base64url'),
      code_challenge_method: 'S256',
    });
    const started = await request(app).get(`/oauth/authorize?${query.toString()}`).redirects(0);
    expect(started.status).toBe(303);
    jar.store(started.headers['set-cookie']);
    const uid = String(started.headers.location).split('/').pop() ?? '';
    expect(uid).toMatch(/^[A-Za-z0-9_-]{43}$/);
    flowUids.add(uid);

    expect((await consentCall('get', uid, 'details', user.token, jar)).status).toBe(200);
    await prisma.user.update({ where: { id: user.id }, data: { twoFactorLastUsedStep: null } });
    const verified = await consentCall('post', uid, 'second-factor', user.token, jar, {
      type: 'totp',
      code: authenticator.generate(user.secret),
    });
    expect(verified.status).toBe(204);
    const approved = await consentCall('post', uid, 'approve', user.token, jar, {
      scopes: ['read', 'write'],
    });
    expect(approved.status).toBe(200);

    const resumePath = new URL(approved.body.redirectTo as string).pathname;
    const resumed = await request(app)
      .get(resumePath)
      .set('Cookie', jar.header(resumePath))
      .redirects(0);
    expect(resumed.status).toBe(303);
    const code = new URL(String(resumed.headers.location)).searchParams.get('code') ?? '';
    const tokens = await request(app).post('/oauth/token').type('form').send({
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT_URI,
      client_id: clientId,
      client_secret: CLIENT_SECRET,
      code_verifier: verifier,
      resource: RESOURCE,
    });
    expect(tokens.status).toBe(200);
    const connection = await prisma.externalAppConnection.findUniqueOrThrow({
      where: { userId_clientId: { userId: user.id, clientId } },
    });
    return {
      id: connection.id,
      accessToken: tokens.body.access_token as string,
      refreshToken: tokens.body.refresh_token as string,
      grantId: connection.grantId,
    };
  }

  /** 一覧と絞り込みの確認用に、接続の行を直接作る（トークンは発行しない） */
  async function insertConnection(
    userId: string,
    clientId: string,
    consentedAt: Date,
    lastUsedAt: Date | null = null
  ) {
    return prisma.externalAppConnection.create({
      data: {
        userId,
        clientId,
        grantId: `oauth771-grant-${randomUUID()}`,
        scopes: ['read'],
        consentedAt,
        lastUsedAt,
        expiresAt: new Date(consentedAt.getTime() + 90 * DAY_MS),
      },
    });
  }

  function getOwn(bearer: string) {
    return request(app).get(OWN).set('Authorization', `Bearer ${bearer}`);
  }

  function getAdmin(bearer: string, query = '') {
    return request(app).get(`${ADMIN}${query}`).set('Authorization', `Bearer ${bearer}`);
  }

  function deleteWithCsrf(path: string, bearer: string) {
    return request(app)
      .delete(path)
      .set('Authorization', `Bearer ${bearer}`)
      .set('User-Agent', USER_AGENT)
      .set('Cookie', `csrf-token=${csrfToken}`)
      .set('Origin', frontendOrigin)
      .set('X-CSRF-Token', csrfToken);
  }

  async function endedAudits(targetUserId: string) {
    return prisma.auditLog.findMany({
      where: { action: 'CONNECTION_ENDED', targetId: targetUserId },
      orderBy: { createdAt: 'asc' },
    });
  }

  function expectNoSecrets(text: string, connection: ExternalConnection): void {
    expect(text).not.toContain(connection.grantId);
    expect(text).not.toContain(connection.accessToken);
    expect(text).not.toContain(connection.refreshToken);
    expect(text).not.toContain('grantId');
  }

  describe('本人の一覧（49.1）', () => {
    it('本人の接続だけを、アプリ名・範囲・同意・最終利用・実際の期限の形で返す', async () => {
      const user = await createUser('connector');
      const other = await createUser('connector');
      const connection = await connect(user, CLIENT_A);
      const now = Date.now();
      const consentedAt = new Date(now - 40 * DAY_MS);
      const lastUsedAt = new Date(now - 5 * DAY_MS);
      const removed = await insertConnection(user.id, REMOVED_CLIENT, consentedAt, lastUsedAt);
      await insertConnection(other.id, CLIENT_B, new Date(now - DAY_MS));

      const response = await getOwn(user.token);

      expect(response.status).toBe(200);
      expect(response.headers['cache-control']).toBe('no-store');
      const row = await prisma.externalAppConnection.findUniqueOrThrow({
        where: { id: connection.id },
      });
      expect(response.body).toEqual({
        data: [
          {
            id: connection.id,
            appName: APP_NAME_A,
            scopes: ['read', 'write'],
            consentedAt: row.consentedAt.toISOString(),
            lastUsedAt: null,
            // 未使用の期限（同意 + 30 日）が同意からの期限より早い
            expiresAt: new Date(row.consentedAt.getTime() + 30 * DAY_MS).toISOString(),
          },
          {
            id: removed.id,
            // 許可の一覧から外れたアプリは client ID を表示名にする
            appName: REMOVED_CLIENT,
            scopes: ['read'],
            consentedAt: consentedAt.toISOString(),
            lastUsedAt: lastUsedAt.toISOString(),
            // 最終利用 + 30 日（35 日後）より同意 + 90 日（50 日後）が遅いので、最終利用 + 30 日
            expiresAt: new Date(lastUsedAt.getTime() + 30 * DAY_MS).toISOString(),
          },
        ],
      });
      expectNoSecrets(response.text, connection);
    });

    it('接続が無ければ空の一覧', async () => {
      const user = await createUser('connector');
      const response = await getOwn(user.token);
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ data: [] });
    });

    it('認証が無ければ 401', async () => {
      const response = await request(app).get(OWN);
      expect(response.status).toBe(401);
      expect(response.body.error).toBe('MISSING_TOKEN');
      expect(response.headers['cache-control']).toBe('no-store');
    });
  });

  describe('本人の取り消し（49.4、49.5）', () => {
    it('204 で接続と外部アプリ用のトークンが直ちに使えなくなり、送信元つきで監査に残る', async () => {
      const user = await createUser('connector');
      const connection = await connect(user, CLIENT_A);
      const whoamiBefore = await request(app)
        .get(WHOAMI)
        .set('Authorization', `Bearer ${connection.accessToken}`);
      expect(whoamiBefore.status).toBe(200);

      const response = await deleteWithCsrf(`${OWN}/${connection.id}`, user.token);

      expect(response.status).toBe(204);
      expect(response.text).toBe('');
      expect(response.headers['cache-control']).toBe('no-store');
      expect(
        await prisma.externalAppConnection.findUnique({ where: { id: connection.id } })
      ).toBeNull();
      expect(await prisma.oAuthStoreRecord.count({ where: { grantId: connection.grantId } })).toBe(
        0
      );
      const whoamiAfter = await request(app)
        .get(WHOAMI)
        .set('Authorization', `Bearer ${connection.accessToken}`);
      expect(whoamiAfter.status).toBe(401);
      const refreshed = await request(app).post('/oauth/token').type('form').send({
        grant_type: 'refresh_token',
        refresh_token: connection.refreshToken,
        client_id: CLIENT_A,
        client_secret: CLIENT_SECRET,
        resource: RESOURCE,
      });
      expect(refreshed.status).toBe(400);
      expect(refreshed.body.error).toBe('invalid_grant');
      expect((await getOwn(user.token)).body).toEqual({ data: [] });

      const audits = await endedAudits(user.id);
      expect(audits).toHaveLength(1);
      expect(audits[0]?.actorId).toBe(user.id);
      const metadata = audits[0]?.metadata as Record<string, unknown>;
      expect(metadata.reason).toBe('USER_REVOKED');
      expect(metadata.clientId).toBe(CLIENT_A);
      expect(metadata.ipAddress).toEqual(expect.stringMatching(/127\.0\.0\.1|::1/));
      expect(metadata.userAgent).toBe(USER_AGENT);
      expect(JSON.stringify(audits)).not.toContain(connection.grantId);
    });

    it('他の利用者の接続・存在しない ID・不正な形の ID は同じ 404 で、何も変えない', async () => {
      const owner = await createUser('connector');
      const intruder = await createUser('connector');
      const connection = await connect(owner, CLIENT_A);

      const responses = [
        await deleteWithCsrf(`${OWN}/${connection.id}`, intruder.token),
        await deleteWithCsrf(`${OWN}/${randomUUID()}`, intruder.token),
        await deleteWithCsrf(`${OWN}/not-a-uuid`, intruder.token),
      ];

      for (const response of responses) {
        expect(response.status).toBe(404);
        expect(response.body.code).toBe('CONNECTION_NOT_FOUND');
        expect(response.headers['cache-control']).toBe('no-store');
      }
      // 他人の接続と存在しない ID で本文が同じ（存在を明かさない）
      expect(responses[0]?.body.detail).toBe(responses[1]?.body.detail);
      expect(
        await prisma.externalAppConnection.findUnique({ where: { id: connection.id } })
      ).not.toBeNull();
      expect(await endedAudits(owner.id)).toHaveLength(0);
      const whoami = await request(app)
        .get(WHOAMI)
        .set('Authorization', `Bearer ${connection.accessToken}`);
      expect(whoami.status).toBe(200);
    });

    it('同じ接続の同時の取り消しは 1 件だけが 204 で、残りは 404。監査は 1 件', async () => {
      const user = await createUser('connector');
      const connection = await connect(user, CLIENT_A);

      const responses = await Promise.all([
        deleteWithCsrf(`${OWN}/${connection.id}`, user.token),
        deleteWithCsrf(`${OWN}/${connection.id}`, user.token),
        deleteWithCsrf(`${OWN}/${connection.id}`, user.token),
      ]);

      expect(responses.map((response) => response.status).sort()).toEqual([204, 404, 404]);
      expect(await endedAudits(user.id)).toHaveLength(1);
    });

    it('CSRF のトークンが無い・一致しない・Origin が違うと 403 で、接続は残る', async () => {
      const user = await createUser('connector');
      const connection = await insertConnection(user.id, CLIENT_A, new Date());
      const path = `${OWN}/${connection.id}`;

      const missing = await request(app)
        .delete(path)
        .set('Authorization', `Bearer ${user.token}`)
        .set('Origin', frontendOrigin);
      expect(missing.status).toBe(403);
      expect(missing.body.code).toBe('CSRF_TOKEN_MISSING');

      const mismatched = await request(app)
        .delete(path)
        .set('Authorization', `Bearer ${user.token}`)
        .set('Cookie', `csrf-token=${csrfToken}`)
        .set('Origin', frontendOrigin)
        .set('X-CSRF-Token', `${csrfToken}x`);
      expect(mismatched.status).toBe(403);
      expect(mismatched.body.code).toBe('CSRF_TOKEN_INVALID');

      const foreignOrigin = await request(app)
        .delete(path)
        .set('Authorization', `Bearer ${user.token}`)
        .set('Cookie', `csrf-token=${csrfToken}`)
        .set('Origin', 'https://evil.example')
        .set('X-CSRF-Token', csrfToken);
      expect(foreignOrigin.status).toBe(403);

      expect(
        await prisma.externalAppConnection.findUnique({ where: { id: connection.id } })
      ).not.toBeNull();
      expect(await endedAudits(user.id)).toHaveLength(0);
    });
  });

  describe('管理者の一覧（49.6、49.7）', () => {
    it('全利用者の接続を、利用者・アプリ・範囲・同意・最終利用・期限とともに返す', async () => {
      const admin = await createUser('admin');
      const target = await createUser('connector');
      const connection = await connect(target, CLIENT_B);

      const response = await getAdmin(admin.token, `?userId=${target.id}`);

      expect(response.status).toBe(200);
      expect(response.headers['cache-control']).toBe('no-store');
      const row = await prisma.externalAppConnection.findUniqueOrThrow({
        where: { id: connection.id },
      });
      expect(response.body).toEqual({
        data: [
          {
            id: connection.id,
            appName: APP_NAME_B,
            clientId: CLIENT_B,
            scopes: ['read', 'write'],
            consentedAt: row.consentedAt.toISOString(),
            lastUsedAt: null,
            expiresAt: new Date(row.consentedAt.getTime() + 30 * DAY_MS).toISOString(),
            user: { id: target.id, displayName: target.displayName, email: target.email },
          },
        ],
        pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
      });
      expectNoSecrets(response.text, connection);
    });

    it('利用者とアプリの完全一致の絞り込みと、ページの切り替え', async () => {
      const admin = await createUser('admin');
      const target = await createUser('connector');
      const other = await createUser('connector');
      const now = Date.now();
      const newest = await insertConnection(target.id, CLIENT_A, new Date(now - DAY_MS));
      const middle = await insertConnection(target.id, CLIENT_B, new Date(now - 2 * DAY_MS));
      const oldest = await insertConnection(target.id, REMOVED_CLIENT, new Date(now - 3 * DAY_MS));
      await insertConnection(other.id, CLIENT_A, new Date(now - DAY_MS));

      const first = await getAdmin(admin.token, `?userId=${target.id}&limit=2`);
      expect(first.status).toBe(200);
      expect(first.body.data.map((item: { id: string }) => item.id)).toEqual([
        newest.id,
        middle.id,
      ]);
      expect(first.body.pagination).toEqual({ page: 1, limit: 2, total: 3, totalPages: 2 });

      const second = await getAdmin(admin.token, `?userId=${target.id}&limit=2&page=2`);
      expect(second.status).toBe(200);
      expect(second.body.data.map((item: { id: string }) => item.id)).toEqual([oldest.id]);
      expect(second.body.pagination).toEqual({ page: 2, limit: 2, total: 3, totalPages: 2 });

      const byClient = await getAdmin(admin.token, `?clientId=${CLIENT_A}&userId=${target.id}`);
      expect(byClient.status).toBe(200);
      expect(byClient.body.data.map((item: { id: string }) => item.id)).toEqual([newest.id]);

      const byClientOnly = await getAdmin(admin.token, `?clientId=${CLIENT_A}&limit=${maxLimit}`);
      expect(byClientOnly.status).toBe(200);
      const userIdsByClient = byClientOnly.body.data.map(
        (item: { user: { id: string } }) => item.user.id
      );
      expect(userIdsByClient).toEqual(expect.arrayContaining([target.id, other.id]));
      expect(
        byClientOnly.body.data.every((item: { clientId: string }) => item.clientId === CLIENT_A)
      ).toBe(true);

      // 部分一致では絞り込まない
      const partial = await getAdmin(
        admin.token,
        `?clientId=${CLIENT_A.slice(0, -1)}&userId=${target.id}`
      );
      expect(partial.status).toBe(200);
      expect(partial.body).toEqual({
        data: [],
        pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
      });
    });

    it('読み飛ばす行数の上限ちょうどは 200、超えると 400', async () => {
      const admin = await createUser('admin');
      const target = await createUser('connector');

      const atLimit = await getAdmin(
        admin.token,
        `?userId=${target.id}&limit=1&page=${maxOffset + 1}`
      );
      expect(atLimit.status).toBe(200);
      expect(atLimit.body.data).toEqual([]);

      const over = await getAdmin(
        admin.token,
        `?userId=${target.id}&limit=1&page=${maxOffset + 2}`
      );
      expect(over.status).toBe(400);
      expect(over.body.code).toBe('VALIDATION_ERROR');
    });

    it.each([
      ['limit=0'],
      ['limit=101'],
      ['limit=1.5'],
      ['limit=abc'],
      ['limit=1&limit=2'],
      ['page=0'],
      ['page=-1'],
      ['page=abc'],
      ['userId=not-a-uuid'],
      ['userId='],
      ['clientId='],
      [`clientId=${'a'.repeat(256)}`],
      ['clientId=%00bad'],
    ])('不正なクエリ %s は 400', async (query) => {
      const admin = await createUser('admin');
      const response = await getAdmin(admin.token, `?${query}`);
      expect(response.status).toBe(400);
      expect(response.body.code).toBe('VALIDATION_ERROR');
      expect(response.headers['cache-control']).toBe('no-store');
    });
  });

  describe('管理者の取り消し（49.8）', () => {
    it('204 で接続とトークンが使えなくなり、実行者の管理者と送信元が監査に残る', async () => {
      const admin = await createUser('admin');
      const target = await createUser('connector');
      const connection = await connect(target, CLIENT_A);

      const response = await deleteWithCsrf(`${ADMIN}/${connection.id}`, admin.token);

      expect(response.status).toBe(204);
      expect(response.headers['cache-control']).toBe('no-store');
      expect(
        await prisma.externalAppConnection.findUnique({ where: { id: connection.id } })
      ).toBeNull();
      const whoami = await request(app)
        .get(WHOAMI)
        .set('Authorization', `Bearer ${connection.accessToken}`);
      expect(whoami.status).toBe(401);

      const audits = await endedAudits(target.id);
      expect(audits).toHaveLength(1);
      expect(audits[0]?.actorId).toBe(admin.id);
      const metadata = audits[0]?.metadata as Record<string, unknown>;
      expect(metadata.reason).toBe('ADMIN_REVOKED');
      expect(metadata.ipAddress).toEqual(expect.stringMatching(/127\.0\.0\.1|::1/));
      expect(metadata.userAgent).toBe(USER_AGENT);
    });

    it('存在しない ID と不正な形の ID は 404', async () => {
      const admin = await createUser('admin');
      for (const id of [randomUUID(), 'not-a-uuid']) {
        const response = await deleteWithCsrf(`${ADMIN}/${id}`, admin.token);
        expect(response.status).toBe(404);
        expect(response.body.code).toBe('CONNECTION_NOT_FOUND');
      }
    });

    it('CSRF のトークンが無いと 403 で、接続は残る', async () => {
      const admin = await createUser('admin');
      const target = await createUser('connector');
      const connection = await insertConnection(target.id, CLIENT_A, new Date());

      const response = await request(app)
        .delete(`${ADMIN}/${connection.id}`)
        .set('Authorization', `Bearer ${admin.token}`)
        .set('Origin', frontendOrigin);

      expect(response.status).toBe(403);
      expect(response.body.code).toBe('CSRF_TOKEN_MISSING');
      expect(
        await prisma.externalAppConnection.findUnique({ where: { id: connection.id } })
      ).not.toBeNull();
    });
  });

  describe('システム管理者でない利用者の管理者用の経路（49.9）', () => {
    it.each([
      ['外部アプリの接続の権限だけを持つ利用者', 'connector'],
      ['権限 *:* を持つが、ロール admin でない利用者', 'wildcard'],
      [
        'トークンの roles に admin とあるが、DB でロール admin を持たない利用者',
        'admin-claim-only',
      ],
    ] as const)(
      '%s は一覧と取り消しが 403 で、接続の有無を明かさず何も変えない',
      async (_label, kind) => {
        const user = await createUser(kind);
        const target = await createUser('connector');
        const connection = await insertConnection(target.id, CLIENT_A, new Date());

        const list = await getAdmin(user.token, `?userId=${target.id}`);
        expect(list.status).toBe(403);
        expect(list.body).toEqual(ADMIN_FORBIDDEN_BODY);
        expect(list.headers['cache-control']).toBe('no-store');

        const invalidQuery = await getAdmin(user.token, '?limit=0');
        expect(invalidQuery.status).toBe(403);
        expect(invalidQuery.body).toEqual(ADMIN_FORBIDDEN_BODY);

        const existing = await deleteWithCsrf(`${ADMIN}/${connection.id}`, user.token);
        const missing = await deleteWithCsrf(`${ADMIN}/${randomUUID()}`, user.token);
        for (const response of [existing, missing]) {
          expect(response.status).toBe(403);
          expect(response.body).toEqual(ADMIN_FORBIDDEN_BODY);
        }

        expect(
          await prisma.externalAppConnection.findUnique({ where: { id: connection.id } })
        ).not.toBeNull();
        expect(await endedAudits(target.id)).toHaveLength(0);
        // 権限の拒否として監査に残す（要件21.7 と同じ記録）
        const denied = await prisma.auditLog.findMany({
          where: { action: 'PERMISSION_CHECK_FAILED', actorId: user.id },
        });
        expect(denied.length).toBeGreaterThanOrEqual(1);
        expect(denied[0]?.targetType).toBe('Role');
        expect(denied[0]?.targetId).toBe('admin');
      }
    );

    it('ロール admin を外された利用者は、トークンの期限の前でも次の要求から 403', async () => {
      const admin = await createUser('admin');
      expect((await getAdmin(admin.token)).status).toBe(200);

      const adminRole = await prisma.role.findUniqueOrThrow({ where: { name: 'admin' } });
      await prisma.userRole.deleteMany({ where: { userId: admin.id, roleId: adminRole.id } });

      const response = await getAdmin(admin.token);
      expect(response.status).toBe(403);
      expect(response.body).toEqual(ADMIN_FORBIDDEN_BODY);
    });

    it('システム管理者でも本人用の取り消しで他人の接続は消せない（404）', async () => {
      const admin = await createUser('admin');
      const target = await createUser('connector');
      const connection = await insertConnection(target.id, CLIENT_A, new Date());

      const response = await deleteWithCsrf(`${OWN}/${connection.id}`, admin.token);
      expect(response.status).toBe(404);
      expect(
        await prisma.externalAppConnection.findUnique({ where: { id: connection.id } })
      ).not.toBeNull();
    });
  });

  describe('外部アプリ用のトークンを提示する（33.1）', () => {
    it('4 つの経路のどれも無効なトークンの 401 で、何も変えない', async () => {
      const admin = await createUser('admin');
      const connection = await connect(admin, CLIENT_A);

      for (const token of [connection.accessToken, connection.refreshToken]) {
        const responses = [
          await getOwn(token),
          await deleteWithCsrf(`${OWN}/${connection.id}`, token),
          await getAdmin(token),
          await deleteWithCsrf(`${ADMIN}/${connection.id}`, token),
        ];
        for (const response of responses) {
          expect(response.status).toBe(401);
          expect(response.body).toEqual({
            error: 'INVALID_TOKEN',
            message: 'Invalid or expired token',
          });
        }
      }

      expect(
        await prisma.externalAppConnection.findUnique({ where: { id: connection.id } })
      ).not.toBeNull();
      const whoami = await request(app)
        .get(WHOAMI)
        .set('Authorization', `Bearer ${connection.accessToken}`);
      expect(whoami.status).toBe(200);
    });
  });

  describe('制限中の利用者（34.2）', () => {
    it.each([
      ['2FA 未登録', { twoFactor: false }, 'TWO_FACTOR_SETUP_REQUIRED'],
      ['初回のパスワード変更が必要', { mustChangePassword: true }, 'PASSWORD_CHANGE_REQUIRED'],
    ] as const)(
      '%s の利用者は既存の認証の制限どおり一覧も取り消しも 403 で、接続は残る',
      async (_label, state, code) => {
        const user = await createUser('connector', state);
        const connection = await insertConnection(user.id, CLIENT_A, new Date());

        const list = await getOwn(user.token);
        expect(list.status).toBe(403);
        expect(list.body.code).toBe(code);

        const revoke = await deleteWithCsrf(`${OWN}/${connection.id}`, user.token);
        expect(revoke.status).toBe(403);
        expect(revoke.body.code).toBe(code);

        expect(
          await prisma.externalAppConnection.findUnique({ where: { id: connection.id } })
        ).not.toBeNull();
      }
    );
  });
});
