/**
 * @fileoverview 外部アプリ用の窓口の認証・範囲の確認を実際の app.ts で確かめる（user-authentication タスク 75.2）
 *
 * トークンは同意の API（タスク74.3）を 2FA から通して発行し、確認用の窓口
 * （`/oauth/resource/whoami`・`/oauth/resource/whoami/write-access`。業務データを返さない）へ提示する。
 * 回数制限は試験の実行環境では外れるので、別のファイル（external-app-auth-rate-limit）で確かめる。
 *
 * Design: Requirements 46-51 > ExternalAppAuthMiddleware、ExternalAppRoutes
 *
 * @requirement user-authentication/REQ-33.3
 * @requirement user-authentication/REQ-51.1
 * @requirement user-authentication/REQ-51.2
 * @requirement user-authentication/REQ-51.3
 */

import { createHash, generateKeyPairSync, randomBytes, randomUUID } from 'crypto';
import type { Express } from 'express';
import { authenticator } from 'otplib';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createTestUser } from './test-user-factory.js';

const ISSUER = 'http://localhost:5174';
const RESOURCE = `${ISSUER}/mcp`;
const METADATA_URL = `${ISSUER}/.well-known/oauth-protected-resource/mcp`;
const CLIENT_ID = 'test-oauth752-client';
const CLIENT_SECRET = randomBytes(24).toString('hex');
const APP_NAME = 'Resource Auth Test App';
const REDIRECT_URI = 'https://client.example/callback';
const WHOAMI = '/oauth/resource/whoami';
const WRITE_ACCESS = '/oauth/resource/whoami/write-access';
const CHALLENGE = `Bearer resource_metadata="${METADATA_URL}", scope="read write"`;
const INVALID_TOKEN_CHALLENGE = `Bearer error="invalid_token", resource_metadata="${METADATA_URL}", scope="read write"`;
const INSUFFICIENT_SCOPE_CHALLENGE = 'Bearer error="insufficient_scope", scope="read write"';
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
  readonly token: string;
}

interface Connection {
  readonly user: ScreenUser;
  readonly accessToken: string;
  readonly refreshToken: string;
}

describe('外部アプリ用の窓口の認証と範囲の確認（タスク75.2、app.ts）', () => {
  let app: Express;
  let prisma: Awaited<typeof import('../../db.js')>['default'] extends () => infer P ? P : never;
  let redis: (typeof import('../../redis.js'))['default'];
  let tokenService: (typeof import('../../services/token.service.js'))['default'];
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
      keys: [{ ...privateKey.export({ format: 'jwk' }), kid: 'k752', use: 'sig', alg: 'RS256' }],
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
    const { getEnv } = await import('../../config/env.js');
    frontendOrigin = new URL(getEnv().FRONTEND_URL).origin;

    const csrfResponse = await request(app).get('/csrf-token');
    expect(csrfResponse.status).toBe(200);
    csrfToken = csrfResponse.body.csrfToken as string;
  });

  afterEach(() => {
    vi.restoreAllMocks();
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

  async function createUser(): Promise<ScreenUser> {
    const secret = authenticator.generateSecret();
    const id = randomUUID();
    const email = `oauth752-${id}@example.test`;
    await createTestUser(
      prisma,
      { id, email, displayName: 'OAuth 752', passwordHash: 'not-used' },
      { twoFactor: { secret } }
    );
    userIds.push(id);
    const permission = await prisma.permission.findUniqueOrThrow({
      where: { resource_action: { resource: 'external_app', action: 'connect' } },
    });
    const role = await prisma.role.create({
      data: { name: `oauth752-${randomUUID()}`, description: 'oauth752' },
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
    user: ScreenUser,
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
      .set('Authorization', `Bearer ${user.token}`)
      .set('Cookie', cookies.filter((part) => part !== '').join('; '));
    if (method === 'post') {
      call = call.set('Origin', frontendOrigin).set('X-CSRF-Token', csrfToken);
    }
    return body === undefined ? call : call.send(body);
  }

  /** 同意の API を 2FA から通して接続し、トークンを得る */
  async function connect(scopes: readonly ('read' | 'write')[]): Promise<Connection> {
    const user = await createUser();
    const jar = new PathCookieJar();
    const verifier = randomBytes(32).toString('base64url');
    const query = new URLSearchParams({
      client_id: CLIENT_ID,
      response_type: 'code',
      redirect_uri: REDIRECT_URI,
      resource: RESOURCE,
      scope: 'offline_access read write',
      state: 'state-752',
      code_challenge: createHash('sha256').update(verifier).digest('base64url'),
      code_challenge_method: 'S256',
    });
    const started = await request(app).get(`/oauth/authorize?${query.toString()}`).redirects(0);
    expect(started.status).toBe(303);
    jar.store(started.headers['set-cookie']);
    const uid = String(started.headers.location).split('/').pop() ?? '';
    flowUids.add(uid);

    expect((await consentCall('get', uid, 'details', user, jar)).status).toBe(200);
    await prisma.user.update({ where: { id: user.id }, data: { twoFactorLastUsedStep: null } });
    const verified = await consentCall('post', uid, 'second-factor', user, jar, {
      type: 'totp',
      code: authenticator.generate(user.secret),
    });
    expect(verified.status).toBe(204);
    const approved = await consentCall('post', uid, 'approve', user, jar, { scopes });
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
    return {
      user,
      accessToken: tokens.body.access_token as string,
      refreshToken: tokens.body.refresh_token as string,
    };
  }

  function get(path: string, token?: string) {
    const call = request(app).get(path);
    return token === undefined ? call : call.set('Authorization', `Bearer ${token}`);
  }

  describe('有効なトークン（51.1）', () => {
    it('読み取りの窓口は範囲とアプリ名だけを返し、業務データを返さない', async () => {
      const connection = await connect(['read']);
      const response = await get(WHOAMI, connection.accessToken);
      expect(response.status).toBe(200);
      expect(response.headers['cache-control']).toBe('no-store');
      expect(response.body).toEqual({ scopes: ['read'], appName: APP_NAME });
    });

    it('読み取りと書き込みの接続は書き込みの確認の窓口で 204', async () => {
      const connection = await connect(['read', 'write']);
      const whoami = await get(WHOAMI, connection.accessToken);
      expect(whoami.body).toEqual({ scopes: ['read', 'write'], appName: APP_NAME });
      const response = await get(WRITE_ACCESS, connection.accessToken);
      expect(response.status).toBe(204);
      expect(response.headers['cache-control']).toBe('no-store');
    });

    it('方式の名前は大文字小文字を区別しない', async () => {
      const connection = await connect(['read']);
      const response = await request(app)
        .get(WHOAMI)
        .set('Authorization', `bearer ${connection.accessToken}`);
      expect(response.status).toBe(200);
    });
  });

  describe('範囲の不足（51.2）', () => {
    it('読み取りだけの接続の書き込みは 403 と insufficient_scope の挑戦', async () => {
      const connection = await connect(['read']);
      const response = await get(WRITE_ACCESS, connection.accessToken);
      expect(response.status).toBe(403);
      expect(response.headers['www-authenticate']).toBe(INSUFFICIENT_SCOPE_CHALLENGE);
      expect(response.headers['cache-control']).toBe('no-store');
      expect(response.body).toEqual({ error: 'insufficient_scope' });
    });
  });

  describe('認証の不成立（33.3・51.3）', () => {
    it('トークンが無ければ 401 と保護されたリソースのメタデータの挑戦', async () => {
      for (const path of [WHOAMI, WRITE_ACCESS]) {
        const response = await get(path);
        expect(response.status).toBe(401);
        expect(response.headers['www-authenticate']).toBe(CHALLENGE);
        expect(response.headers['cache-control']).toBe('no-store');
      }
    });

    it('無効なトークンは invalid_token の 401 で、値を応答に含めない', async () => {
      const token = 'invalid-token-752-must-not-echo';
      const response = await get(WHOAMI, token);
      expect(response.status).toBe(401);
      expect(response.headers['www-authenticate']).toBe(INVALID_TOKEN_CHALLENGE);
      expect(response.text).not.toContain(token);
    });

    it('画面用のアクセストークンは 401', async () => {
      const user = await createUser();
      for (const path of [WHOAMI, WRITE_ACCESS]) {
        const response = await get(path, user.token);
        expect(response.status).toBe(401);
        expect(response.headers['www-authenticate']).toBe(INVALID_TOKEN_CHALLENGE);
      }
    });

    it('外部アプリ用のリフレッシュトークンは 401', async () => {
      const connection = await connect(['read', 'write']);
      const response = await get(WHOAMI, connection.refreshToken);
      expect(response.status).toBe(401);
      expect(response.headers['www-authenticate']).toBe(INVALID_TOKEN_CHALLENGE);
    });

    it('問い合わせで渡したトークンは受け付けない', async () => {
      const connection = await connect(['read']);
      const response = await request(app).get(
        `${WHOAMI}?access_token=${encodeURIComponent(connection.accessToken)}`
      );
      expect(response.status).toBe(400);
      expect(response.text).not.toContain(connection.accessToken);
    });

    it('取り消した接続のトークンは 401', async () => {
      const connection = await connect(['read']);
      expect((await get(WHOAMI, connection.accessToken)).status).toBe(200);
      await prisma.externalAppConnection.deleteMany({ where: { userId: connection.user.id } });
      const response = await get(WHOAMI, connection.accessToken);
      expect(response.status).toBe(401);
    });
  });

  describe('基盤の失敗', () => {
    it('検証の DB の失敗は 401 にせず 503 で返す（外部アプリに接続を捨てさせない）', async () => {
      const connection = await connect(['read']);
      const failure = Object.assign(new Error(`db down ${connection.accessToken}`), {
        code: 'P1001',
      });
      vi.spyOn(prisma.user, 'findUnique').mockRejectedValueOnce(failure);
      const response = await get(WHOAMI, connection.accessToken);
      expect(response.status).toBe(503);
      expect(response.headers['www-authenticate']).toBeUndefined();
      expect(response.headers['cache-control']).toBe('no-store');
      expect(response.text).not.toContain(connection.accessToken);

      // 障害の後も接続は残り、同じトークンが使える
      expect((await get(WHOAMI, connection.accessToken)).status).toBe(200);
    });
  });

  describe('経路の区別', () => {
    it('確認用の窓口は GET だけを扱う', async () => {
      const connection = await connect(['read', 'write']);
      const post = await request(app)
        .post(WRITE_ACCESS)
        .set('Authorization', `Bearer ${connection.accessToken}`);
      expect(post.status).toBe(404);
    });
  });
});
