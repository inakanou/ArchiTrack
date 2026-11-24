/**
 * @fileoverview 画面用の API が外部アプリ用のトークンを拒むことを実際の app.ts で確かめる（user-authentication タスク 75.3）
 *
 * 外部アプリ用のアクセストークンとリフレッシュトークンは、同意の API（タスク74.3）を 2FA から通し、
 * 認可サーバーの `/oauth/token` で実際に発行したものを使う。画面用のトークンの検証（TokenService）は
 * 変えず、不透明な値が JWT として解釈できないことで拒否されることを、画面用の保護された経路・
 * リフレッシュの経路・同意の API のそれぞれで確かめる。あわせて、拒否が何も作らず・置き換えず・
 * 取り消さないこと（外部アプリの窓口では引き続き使えること）と、逆向き（画面用のトークンを
 * `/oauth/token` のリフレッシュに出す）も拒まれることを確かめる。
 *
 * Design: Requirements 46-51 > TokenService（画面用のトークンの検証を変えずに、外部アプリ用トークンを拒否する）
 *
 * @requirement user-authentication/REQ-33.1
 * @requirement user-authentication/REQ-33.3
 */

import { createHash, generateKeyPairSync, randomBytes, randomUUID } from 'crypto';
import type { Express } from 'express';
import { authenticator } from 'otplib';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestUser } from './test-user-factory.js';

const ISSUER = 'http://localhost:5174';
const RESOURCE = `${ISSUER}/mcp`;
const CLIENT_ID = 'test-oauth753-client';
const CLIENT_SECRET = randomBytes(24).toString('hex');
const APP_NAME = 'Screen Rejects External Token Test App';
const REDIRECT_URI = 'https://client.example/callback';
const WHOAMI = '/oauth/resource/whoami';
const SCREEN_INVALID_TOKEN_CHALLENGE = 'Bearer realm="ArchiTrack", error="invalid_token"';
const SCREEN_MISSING_TOKEN_CHALLENGE = 'Bearer realm="ArchiTrack", error="missing_token"';
const INVALID_TOKEN_BODY = { error: 'INVALID_TOKEN', message: 'Invalid or expired token' };
const INVALID_REFRESH_TOKEN_BODY = {
  error: 'Invalid refresh token',
  detail: '無効なトークンです (Invalid token)',
  code: 'INVALID_REFRESH_TOKEN',
};
const OAUTH_KEYS = [
  'OAUTH_ALLOWED_CLIENTS',
  'OAUTH_ISSUER',
  'OAUTH_RESOURCE_URL',
  'OAUTH_JWKS',
  'OAUTH_COOKIE_KEYS',
  'OAUTH_TOKEN_HMAC_KEY',
] as const;

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

interface ScreenUser {
  readonly id: string;
  readonly secret: string;
  /** 画面用のアクセストークン */
  readonly token: string;
}

interface Flow {
  readonly uid: string;
  readonly jar: PathCookieJar;
  readonly verifier: string;
}

interface Connection {
  readonly user: ScreenUser;
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly grantId: string;
}

/** 画面用の保護された経路（読み取り・書き込み・管理・セッション・ログアウト） */
interface ScreenRoute {
  readonly name: string;
  readonly method: 'get' | 'post' | 'patch' | 'delete';
  readonly path: string;
  readonly body?: object;
  /** CSRF の二重送信と Origin を付ける（Cookie で状態を変える経路） */
  readonly csrf?: boolean;
}

const SCREEN_ROUTES: readonly ScreenRoute[] = [
  { name: '自分の情報の取得', method: 'get', path: '/api/v1/auth/me' },
  {
    name: '自分の情報の更新（書き込み）',
    method: 'patch',
    path: '/api/v1/auth/me',
    body: { displayName: 'changed-by-external-token' },
  },
  {
    name: 'プロジェクトの作成（書き込み）',
    method: 'post',
    path: '/api/projects',
    body: { name: 'external-token-project' },
  },
  { name: 'セッションの一覧', method: 'get', path: '/api/v1/auth/sessions' },
  {
    name: 'セッションの削除',
    method: 'delete',
    path: `/api/v1/auth/sessions/${randomUUID()}`,
  },
  { name: '管理のログレベルの取得', method: 'get', path: '/api/v1/admin/log-level' },
  {
    name: '管理のログレベルの変更',
    method: 'post',
    path: '/api/v1/admin/log-level',
    body: { level: 'debug' },
  },
  { name: '監査ログの一覧（管理）', method: 'get', path: '/api/v1/audit-logs' },
  { name: 'ログアウト', method: 'post', path: '/api/v1/auth/logout', csrf: true },
  { name: '全デバイスのログアウト', method: 'post', path: '/api/v1/auth/logout-all' },
];

describe('画面用の API は外部アプリ用のトークンを拒む（タスク75.3、app.ts）', () => {
  let app: Express;
  let prisma: Awaited<typeof import('../../db.js')>['default'] extends () => infer P ? P : never;
  let redis: (typeof import('../../redis.js'))['default'];
  let tokenService: (typeof import('../../services/token.service.js'))['default'];
  let sessionService: InstanceType<
    (typeof import('../../services/session.service.js'))['SessionService']
  >;
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
        clientId: CLIENT_ID,
        clientSecret: CLIENT_SECRET,
        displayName: APP_NAME,
        redirectUris: [REDIRECT_URI],
      },
    ]);
    process.env.OAUTH_ISSUER = ISSUER;
    process.env.OAUTH_RESOURCE_URL = RESOURCE;
    process.env.OAUTH_JWKS = JSON.stringify({
      keys: [{ ...privateKey.export({ format: 'jwk' }), kid: 'k753', use: 'sig', alg: 'RS256' }],
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
    const { SessionService } = await import('../../services/session.service.js');
    sessionService = new SessionService(prisma);
    const { getEnv } = await import('../../config/env.js');
    frontendOrigin = new URL(getEnv().FRONTEND_URL).origin;

    const csrfResponse = await request(app).get('/csrf-token');
    expect(csrfResponse.status).toBe(200);
    csrfToken = csrfResponse.body.csrfToken as string;
  });

  afterAll(async () => {
    const { deleteAuditLogsWithArchivePermission } =
      await import('../../utils/audit-log-archive-permission.js');
    await prisma.externalAppConnection.deleteMany({ where: { clientId: CLIENT_ID } });
    await prisma.oAuthStoreRecord.deleteMany({
      where: { payload: { path: ['clientId'], equals: CLIENT_ID } },
    });
    await prisma.oAuthStoreRecord.deleteMany({
      where: { payload: { path: ['params', 'client_id'], equals: CLIENT_ID } },
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

  /** 2FA を設定済みで、外部アプリの接続の権限だけを持つ利用者を作る */
  async function createUser(): Promise<ScreenUser> {
    const secret = authenticator.generateSecret();
    const id = randomUUID();
    const email = `oauth753-${id}@example.test`;
    await createTestUser(
      prisma,
      { id, email, displayName: 'OAuth 753', passwordHash: 'not-used' },
      { twoFactor: { secret } }
    );
    userIds.push(id);
    const permission = await prisma.permission.findUniqueOrThrow({
      where: { resource_action: { resource: 'external_app', action: 'connect' } },
    });
    const role = await prisma.role.create({
      data: { name: `oauth753-${randomUUID()}`, description: 'oauth753' },
    });
    roleIds.push(role.id);
    await prisma.rolePermission.create({ data: { roleId: role.id, permissionId: permission.id } });
    await prisma.userRole.create({ data: { userId: id, roleId: role.id } });
    const token = await tokenService.generateAccessToken({
      userId: id,
      email,
      roles: [],
      accessTokenGeneration: 0,
    });
    return { id, secret, token };
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

  /** 認可の要求を始め、同意の手続きの uid を得る */
  async function startFlow(): Promise<Flow> {
    const jar = new PathCookieJar();
    const verifier = randomBytes(32).toString('base64url');
    const query = new URLSearchParams({
      client_id: CLIENT_ID,
      response_type: 'code',
      redirect_uri: REDIRECT_URI,
      resource: RESOURCE,
      scope: 'offline_access read write',
      state: 'state-753',
      code_challenge: createHash('sha256').update(verifier).digest('base64url'),
      code_challenge_method: 'S256',
    });
    const started = await request(app).get(`/oauth/authorize?${query.toString()}`).redirects(0);
    expect(started.status).toBe(303);
    jar.store(started.headers['set-cookie']);
    const uid = String(started.headers.location).split('/').pop() ?? '';
    expect(uid).toMatch(/^[A-Za-z0-9_-]{43}$/);
    flowUids.add(uid);
    return { uid, jar, verifier };
  }

  /** 同意の API を 2FA から通して接続し、認可サーバーが発行した外部アプリ用のトークンを得る */
  async function connect(): Promise<Connection> {
    const user = await createUser();
    const { uid, jar, verifier } = await startFlow();

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
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      code_verifier: verifier,
      resource: RESOURCE,
    });
    expect(tokens.status).toBe(200);
    const accessToken = tokens.body.access_token as string;
    const refreshToken = tokens.body.refresh_token as string;
    expect(typeof accessToken).toBe('string');
    expect(typeof refreshToken).toBe('string');
    // 外部アプリ用のトークンは不透明な値で、JWT の形（3 区画）でない（design.md の TokenService の節の前提）
    expect(accessToken.split('.')).toHaveLength(1);
    expect(refreshToken.split('.')).toHaveLength(1);

    const connection = await prisma.externalAppConnection.findUniqueOrThrow({
      where: { userId_clientId: { userId: user.id, clientId: CLIENT_ID } },
    });
    return { user, accessToken, refreshToken, grantId: connection.grantId };
  }

  function refreshTokenGrant(refreshToken: string) {
    return request(app).post('/oauth/token').type('form').send({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      resource: RESOURCE,
    });
  }

  /** 画面用の経路へ、Authorization の Bearer で与えたトークンを付けて要求する */
  function callScreenRoute(route: ScreenRoute, bearer: string, refreshCookie?: string) {
    let call = request(app)[route.method](route.path).set('Authorization', `Bearer ${bearer}`);
    const cookies: string[] = [];
    if (refreshCookie !== undefined) {
      cookies.push(`refreshToken=${refreshCookie}`);
    }
    if (route.csrf) {
      cookies.push(`csrf-token=${csrfToken}`);
      call = call.set('Origin', frontendOrigin).set('X-CSRF-Token', csrfToken);
    }
    if (cookies.length > 0) {
      call = call.set('Cookie', cookies.join('; '));
    }
    return route.body === undefined ? call : call.send(route.body);
  }

  /** 画面用のリフレッシュを、Cookie と CSRF・Origin で呼ぶ（画面と同じ契約） */
  function screenRefresh(cookies: Record<string, string>, body?: object) {
    const cookieHeader = [
      ...Object.entries(cookies).map(([name, value]) => `${name}=${value}`),
      `csrf-token=${csrfToken}`,
    ].join('; ');
    const call = request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', cookieHeader)
      .set('X-CSRF-Token', csrfToken)
      .set('Origin', frontendOrigin);
    return body === undefined ? call : call.send(body);
  }

  /** 利用者に関わる、拒否で変わってはならない状態を読む */
  async function snapshot(connection: Connection) {
    const [user, refreshTokens, auditLogs, externalConnection, storeRecords, projects] =
      await Promise.all([
        prisma.user.findUniqueOrThrow({
          where: { id: connection.user.id },
          select: {
            displayName: true,
            isActive: true,
            accessTokenGeneration: true,
            updatedAt: true,
          },
        }),
        prisma.refreshToken.findMany({
          where: { userId: connection.user.id },
          select: { id: true, replacedAt: true, expiresAt: true },
          orderBy: { id: 'asc' },
        }),
        prisma.auditLog.count({
          where: { OR: [{ actorId: connection.user.id }, { targetId: connection.user.id }] },
        }),
        prisma.externalAppConnection.findMany({
          where: { userId: connection.user.id },
          select: { id: true, grantId: true, scopes: true, expiresAt: true, lastUsedAt: true },
        }),
        prisma.oAuthStoreRecord.findMany({
          where: { grantId: connection.grantId },
          select: { id: true, kind: true, consumedAt: true, expiresAt: true },
          orderBy: { id: 'asc' },
        }),
        prisma.project.count({ where: { createdById: connection.user.id } }),
      ]);
    return { user, refreshTokens, auditLogs, externalConnection, storeRecords, projects };
  }

  function expectScreenInvalidToken(response: request.Response, label: string): void {
    expect(response.status, label).toBe(401);
    expect(response.headers['www-authenticate'], label).toBe(SCREEN_INVALID_TOKEN_CHALLENGE);
    expect(response.body, label).toEqual(INVALID_TOKEN_BODY);
  }

  function issuedRefreshCookies(response: request.Response): string[] {
    const raw = response.headers['set-cookie'] as unknown;
    const lines = Array.isArray(raw) ? (raw as string[]) : typeof raw === 'string' ? [raw] : [];
    return lines.filter(
      (line) => line.startsWith('refreshToken=') && !line.startsWith('refreshToken=;')
    );
  }

  describe('対照: 画面用のアクセストークンでは各経路が認証を通る', () => {
    it('どの経路も 401 にならない（拒否の 401 が認証によることを示す）', async () => {
      const user = await createUser();
      const { refreshToken } = await sessionService.createSession(user.id);
      for (const route of SCREEN_ROUTES) {
        const response = await callScreenRoute(route, user.token, refreshToken);
        expect(response.status, route.name).not.toBe(401);
      }
    });
  });

  describe('画面用の保護された経路に外部アプリ用のトークンを提示する（33.1）', () => {
    it('アクセストークンとリフレッシュトークンを Bearer で提示すると、どの経路も無効なトークンの 401', async () => {
      const connection = await connect();
      const { refreshToken: screenRefreshToken } = await sessionService.createSession(
        connection.user.id
      );
      const before = await snapshot(connection);

      for (const route of SCREEN_ROUTES) {
        for (const [kind, token] of [
          ['アクセストークン', connection.accessToken],
          ['リフレッシュトークン', connection.refreshToken],
        ] as const) {
          const response = await callScreenRoute(route, token, screenRefreshToken);
          expectScreenInvalidToken(response, `${route.name}（外部アプリ用の${kind}）`);
          expect(response.text).not.toContain(token);
        }
      }

      // 何も作らず・置き換えず・取り消さない
      expect(await snapshot(connection)).toEqual(before);

      // 外部アプリの窓口では引き続き使える（取り消し・再利用の検知が起きていない）
      const whoami = await request(app)
        .get(WHOAMI)
        .set('Authorization', `Bearer ${connection.accessToken}`);
      expect(whoami.status).toBe(200);
      const rotated = await refreshTokenGrant(connection.refreshToken);
      expect(rotated.status).toBe(200);
      expect(typeof rotated.body.access_token).toBe('string');
    });

    it('Cookie に置いたアクセストークンは資格として読まれず、トークンの欠如の 401', async () => {
      const connection = await connect();
      const before = await snapshot(connection);

      for (const route of SCREEN_ROUTES.filter((candidate) => !candidate.csrf)) {
        for (const name of ['accessToken', 'access_token', 'token']) {
          let call = request(app)
            [route.method](route.path)
            .set('Cookie', `${name}=${connection.accessToken}`);
          if (route.body !== undefined) {
            call = call.send(route.body);
          }
          const response = await call;
          expect(response.status, `${route.name}（Cookie ${name}）`).toBe(401);
          expect(response.headers['www-authenticate']).toBe(SCREEN_MISSING_TOKEN_CHALLENGE);
          expect(response.body).toEqual({
            error: 'MISSING_TOKEN',
            message: 'Authentication token is required',
          });
        }
      }

      expect(await snapshot(connection)).toEqual(before);
    });
  });

  describe('画面用のリフレッシュに外部アプリ用のトークンを提示する（33.1・33.3）', () => {
    it('リフレッシュの Cookie に外部アプリ用のリフレッシュトークン・アクセストークンを置くと、無効なリフレッシュトークンの 401 で何も発行しない', async () => {
      const connection = await connect();
      const before = await snapshot(connection);

      for (const [kind, token] of [
        ['リフレッシュトークン', connection.refreshToken],
        ['アクセストークン', connection.accessToken],
      ] as const) {
        const response = await screenRefresh({ refreshToken: token });
        expect(response.status, kind).toBe(401);
        expect(response.body, kind).toEqual(INVALID_REFRESH_TOKEN_BODY);
        expect(response.body.accessToken, kind).toBeUndefined();
        expect(issuedRefreshCookies(response), kind).toEqual([]);
        expect(response.text).not.toContain(token);
      }

      expect(await snapshot(connection)).toEqual(before);

      const whoami = await request(app)
        .get(WHOAMI)
        .set('Authorization', `Bearer ${connection.accessToken}`);
      expect(whoami.status).toBe(200);
      const rotated = await refreshTokenGrant(connection.refreshToken);
      expect(rotated.status).toBe(200);
    });

    it('本文の refreshToken は読まれず、Cookie が無ければ 400 で何も発行しない', async () => {
      const connection = await connect();
      const before = await snapshot(connection);

      const response = await screenRefresh({}, { refreshToken: connection.refreshToken });
      expect(response.status).toBe(400);
      expect(response.body.accessToken).toBeUndefined();
      expect(issuedRefreshCookies(response)).toEqual([]);
      expect(response.text).not.toContain(connection.refreshToken);

      expect(await snapshot(connection)).toEqual(before);
      const rotated = await refreshTokenGrant(connection.refreshToken);
      expect(rotated.status).toBe(200);
    });

    it('外部アプリ用のトークンを拒んだ後も、画面用のリフレッシュトークンは使える', async () => {
      const connection = await connect();
      const { refreshToken: screenRefreshToken } = await sessionService.createSession(
        connection.user.id
      );
      const rejected = await screenRefresh({ refreshToken: connection.refreshToken });
      expect(rejected.status).toBe(401);

      const refreshed = await screenRefresh({ refreshToken: screenRefreshToken });
      expect(refreshed.status).toBe(200);
      expect(typeof refreshed.body.accessToken).toBe('string');
      expect(issuedRefreshCookies(refreshed)).toHaveLength(1);
    });
  });

  describe('同意の API に外部アプリ用のトークンを提示する（33.1）', () => {
    it('手続きの詳細・2FA・承認・拒否のどれも無効なトークンの 401 で、手続きは画面用のトークンで続けられる', async () => {
      const connection = await connect();
      const user = await createUser();
      const flow = await startFlow();

      for (const [kind, token] of [
        ['アクセストークン', connection.accessToken],
        ['リフレッシュトークン', connection.refreshToken],
      ] as const) {
        const details = await consentCall('get', flow.uid, 'details', token, flow.jar);
        expectScreenInvalidToken(details, `details（${kind}）`);
        const secondFactor = await consentCall('post', flow.uid, 'second-factor', token, flow.jar, {
          type: 'totp',
          code: authenticator.generate(user.secret),
        });
        expectScreenInvalidToken(secondFactor, `second-factor（${kind}）`);
        const approve = await consentCall('post', flow.uid, 'approve', token, flow.jar, {
          scopes: ['read'],
        });
        expectScreenInvalidToken(approve, `approve（${kind}）`);
        const deny = await consentCall('post', flow.uid, 'deny', token, flow.jar);
        expectScreenInvalidToken(deny, `deny（${kind}）`);
      }

      // 外部アプリ用のトークンの持ち主の接続は増えも変わりもしない
      expect(
        await prisma.externalAppConnection.count({ where: { userId: connection.user.id } })
      ).toBe(1);
      // 同じ手続きは画面用のトークンで続けられる（拒否で手続きが壊れていない）
      expect((await consentCall('get', flow.uid, 'details', user.token, flow.jar)).status).toBe(
        200
      );
    });
  });

  describe('逆向き: 画面用のトークンを認可サーバーのリフレッシュに提示する（33.3）', () => {
    it('画面用のアクセストークン・リフレッシュトークンは invalid_grant で、外部アプリの接続も画面のセッションも変わらない', async () => {
      const connection = await connect();
      const { refreshToken: screenRefreshToken } = await sessionService.createSession(
        connection.user.id
      );
      const before = await snapshot(connection);

      for (const [kind, token] of [
        ['アクセストークン', connection.user.token],
        ['リフレッシュトークン', screenRefreshToken],
      ] as const) {
        const response = await refreshTokenGrant(token);
        expect(response.status, kind).toBe(400);
        expect(response.body.error, kind).toBe('invalid_grant');
        expect(response.body.access_token, kind).toBeUndefined();
      }

      expect(await snapshot(connection)).toEqual(before);
      const refreshed = await screenRefresh({ refreshToken: screenRefreshToken });
      expect(refreshed.status).toBe(200);
      const rotated = await refreshTokenGrant(connection.refreshToken);
      expect(rotated.status).toBe(200);
    });
  });
});
