/**
 * @fileoverview 同意の API を実際の app.ts・認可サーバー・DB・Redis で確かめる（user-authentication タスク 74.3）
 *
 * Cookie は応答の Path に従って送り、手続きの Cookie が API の経路へ実際に届くことも確かめる。
 *
 * @requirement user-authentication/REQ-46.2
 * @requirement user-authentication/REQ-46.3
 * @requirement user-authentication/REQ-46.7
 * @requirement user-authentication/REQ-47.1
 * @requirement user-authentication/REQ-47.3
 * @requirement user-authentication/REQ-47.11
 */

import { createHash, generateKeyPairSync, randomBytes, randomUUID } from 'crypto';
import { IncomingMessage } from 'http';
import type { Express } from 'express';
import { hash } from '@node-rs/argon2';
import { authenticator } from 'otplib';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestUser, type TestUserState } from './test-user-factory.js';

const ISSUER = 'http://localhost:5174';
const RESOURCE = `${ISSUER}/mcp`;
const CLIENT_ID = 'test-oauth743-client';
const CLIENT_SECRET = randomBytes(24).toString('hex');
const REDIRECT_URI = 'https://client.example/callback';
const EVIL_HOST = 'evil.example';
const OAUTH_KEYS = [
  'OAUTH_ALLOWED_CLIENTS',
  'OAUTH_ISSUER',
  'OAUTH_RESOURCE_URL',
  'OAUTH_JWKS',
  'OAUTH_COOKIE_KEYS',
  'OAUTH_TOKEN_HMAC_KEY',
] as const;
const STATE_CHANGING_ACTIONS = ['second-factor', 'approve', 'deny'] as const;

type Action = 'details' | (typeof STATE_CHANGING_ACTIONS)[number];

/** 応答の Path に従って Cookie を送る、ブラウザと同じ振る舞いの入れ物 */
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

  pathOf(name: string): string | undefined {
    return this.cookies.get(name)?.path;
  }
}

interface Flow {
  readonly jar: PathCookieJar;
  readonly uid: string;
  readonly verifier: string;
}

interface ConsentUser {
  readonly id: string;
  readonly email: string;
  readonly secret: string;
  readonly token: string;
}

interface SendOptions {
  readonly token?: string;
  readonly jar?: PathCookieJar;
  readonly body?: unknown;
  readonly csrf?: 'valid' | 'missing' | 'wrong' | 'bad-origin';
  readonly headers?: Record<string, string>;
}

describe('同意の API（タスク74.3）', () => {
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
        displayName: 'Consent API Test App',
        redirectUris: [REDIRECT_URI],
      },
    ]);
    process.env.OAUTH_ISSUER = ISSUER;
    process.env.OAUTH_RESOURCE_URL = RESOURCE;
    process.env.OAUTH_JWKS = JSON.stringify({
      keys: [{ ...privateKey.export({ format: 'jwk' }), kid: 'k743', use: 'sig', alg: 'RS256' }],
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

  async function createUser(
    options: { permitted?: boolean; state?: TestUserState } = {}
  ): Promise<ConsentUser> {
    const secret = authenticator.generateSecret();
    const id = randomUUID();
    const email = `oauth743-${id}@example.test`;
    await createTestUser(
      prisma,
      { id, email, displayName: 'OAuth 743', passwordHash: 'not-used' },
      { twoFactor: { secret }, ...options.state }
    );
    userIds.push(id);
    if (options.permitted ?? true) {
      const permission = await prisma.permission.findUniqueOrThrow({
        where: { resource_action: { resource: 'external_app', action: 'connect' } },
      });
      const role = await prisma.role.create({
        data: { name: `oauth743-${randomUUID()}`, description: 'oauth743' },
      });
      roleIds.push(role.id);
      await prisma.rolePermission.create({
        data: { roleId: role.id, permissionId: permission.id },
      });
      await prisma.userRole.create({ data: { userId: id, roleId: role.id } });
    }
    const token = await tokenService.generateAccessToken({
      userId: id,
      email,
      roles: [],
      accessTokenGeneration: 0,
    });
    return { id, email, secret, token };
  }

  async function start(scope = 'offline_access read write'): Promise<Flow> {
    const jar = new PathCookieJar();
    const verifier = randomBytes(32).toString('base64url');
    const query = new URLSearchParams({
      client_id: CLIENT_ID,
      response_type: 'code',
      redirect_uri: REDIRECT_URI,
      resource: RESOURCE,
      scope,
      state: 'state-743',
      code_challenge: createHash('sha256').update(verifier).digest('base64url'),
      code_challenge_method: 'S256',
    });
    const response = await request(app).get(`/oauth/authorize?${query.toString()}`).redirects(0);
    expect(response.status).toBe(303);
    jar.store(response.headers['set-cookie']);
    const location = String(response.headers.location);
    expect(location).toMatch(/^\/oauth\/interaction\/[A-Za-z0-9_-]{43}$/);
    const uid = location.split('/').pop() ?? '';
    flowUids.add(uid);
    return { jar, uid, verifier };
  }

  function send(method: 'get' | 'post', uid: string, action: Action, options: SendOptions = {}) {
    const path = `/oauth/interaction/${uid}/${action}`;
    const csrf = options.csrf ?? 'valid';
    const cookies = [options.jar?.header(path) ?? ''];
    if (method === 'post' && csrf !== 'missing') {
      cookies.push(`csrf-token=${csrfToken}`);
    }
    let call = request(app)[method](path);
    const cookie = cookies.filter((part) => part !== '').join('; ');
    if (cookie !== '') {
      call = call.set('Cookie', cookie);
    }
    if (options.token) {
      call = call.set('Authorization', `Bearer ${options.token}`);
    }
    if (method === 'post') {
      call = call.set('Origin', csrf === 'bad-origin' ? 'https://evil.example' : frontendOrigin);
      if (csrf !== 'missing') {
        call = call.set('X-CSRF-Token', csrf === 'wrong' ? 'f'.repeat(64) : csrfToken);
      }
    }
    for (const [name, value] of Object.entries(options.headers ?? {})) {
      call = call.set(name, value);
    }
    return options.body === undefined ? call : call.send(options.body as object);
  }

  async function totp(user: ConsentUser): Promise<{ type: 'totp'; code: string }> {
    await prisma.user.update({ where: { id: user.id }, data: { twoFactorLastUsedStep: null } });
    return { type: 'totp', code: authenticator.generate(user.secret) };
  }

  /** 正しいコードと必ず違う 6 桁を返す（前後のステップも通らない） */
  function wrongCode(user: ConsentUser): { type: 'totp'; code: string } {
    const step = 30_000;
    const now = Date.now();
    const valid = new Set(
      [-step, 0, step].map((offset) => {
        const options = authenticator.allOptions();
        return authenticator.clone({ ...options, epoch: now + offset }).generate(user.secret);
      })
    );
    for (let value = 0; value < 10; value += 1) {
      const candidate = String(value).repeat(6);
      if (!valid.has(candidate)) {
        return { type: 'totp', code: candidate };
      }
    }
    throw new Error('試験のコードを作れません');
  }

  async function passSecondFactor(flow: Flow, user: ConsentUser): Promise<void> {
    const details = await send('get', flow.uid, 'details', { token: user.token, jar: flow.jar });
    expect(details.status).toBe(200);
    const verified = await send('post', flow.uid, 'second-factor', {
      token: user.token,
      jar: flow.jar,
      body: await totp(user),
    });
    expect(verified.status).toBe(204);
  }

  async function connectionCount(userId: string): Promise<number> {
    return prisma.externalAppConnection.count({ where: { userId, clientId: CLIENT_ID } });
  }

  async function resume(flow: Flow, redirectTo: string): Promise<URL> {
    const path = new URL(redirectTo).pathname;
    const response = await request(app).get(path).set('Cookie', flow.jar.header(path)).redirects(0);
    expect(response.status).toBe(303);
    return new URL(String(response.headers.location));
  }

  describe('同意の URL から画面への転送', () => {
    it('認証なしで /connect/consent/:uid へ相対パスで転送する', async () => {
      const uid = 'A'.repeat(21) + '_-' + 'b'.repeat(20);
      const response = await request(app)
        .get(`/oauth/interaction/${uid}`)
        .set('X-Forwarded-Host', EVIL_HOST)
        .set('Host', EVIL_HOST)
        .redirects(0);
      expect(response.status).toBe(302);
      expect(response.headers.location).toBe(`/connect/consent/${uid}`);
      expect(response.headers['cache-control']).toBe('no-store');
    });

    it('認可サーバーが作った実際の uid を転送できる', async () => {
      const flow = await start();
      const response = await request(app).get(`/oauth/interaction/${flow.uid}`).redirects(0);
      expect(response.status).toBe(302);
      expect(response.headers.location).toBe(`/connect/consent/${flow.uid}`);
    });

    it.each([
      ['短い', 'abc'],
      ['長い', 'a'.repeat(44)],
      ['許されない文字', `${'a'.repeat(42)}.`],
      ['符号化した区切り', `${'a'.repeat(40)}%2Fb`],
      ['符号化したスクリプト', '%3Cscript%3Ealert(1)%3C%2Fscript%3E'],
      ['壊れた符号化', '%E0%A4%A'],
    ])('形の違う uid（%s）は固定の 400 で値を返さない', async (_label, uid) => {
      const response = await request(app).get(`/oauth/interaction/${uid}`).redirects(0);
      expect(response.status).toBe(400);
      expect(response.headers.location).toBeUndefined();
      expect(response.headers['cache-control']).toBe('no-store');
      expect(response.text).not.toContain(uid);
      expect(response.text).not.toContain('script');
    });

    it('API の経路でも形の違う uid は 400 で値を返さない', async () => {
      const user = await createUser();
      const response = await send('get', 'not-a-valid-uid', 'details', { token: user.token });
      expect(response.status).toBe(400);
      expect(response.text).not.toContain('not-a-valid-uid');
    });
  });

  describe('認証と手続きの Cookie', () => {
    it('手続きの Cookie の Path が API の経路を含み、実際に届く', async () => {
      const user = await createUser();
      const flow = await start();
      expect(flow.jar.pathOf('_interaction')).toBe(`/oauth/interaction/${flow.uid}`);
      const response = await send('get', flow.uid, 'details', {
        token: user.token,
        jar: flow.jar,
      });
      expect(response.status).toBe(200);
      expect(response.headers['cache-control']).toBe('no-store');
      expect(response.body).toMatchObject({
        appName: 'Consent API Test App',
        redirectHost: 'client.example',
        account: { email: user.email },
        requestedScopes: ['read', 'write'],
        idleDays: 30,
        absoluteDays: 90,
        secondFactorVerified: false,
      });
    });

    it.each(['details', ...STATE_CHANGING_ACTIONS] as const)(
      '%s は画面用のアクセストークンが無いと 401',
      async (action) => {
        const flow = await start();
        const response = await send(action === 'details' ? 'get' : 'post', flow.uid, action, {
          jar: flow.jar,
          body: action === 'details' ? undefined : {},
        });
        expect(response.status).toBe(401);
        expect(response.headers['cache-control']).toBe('no-store');
      }
    );

    it('手続きの Cookie が無いと 404', async () => {
      const user = await createUser();
      const flow = await start();
      const response = await send('get', flow.uid, 'details', { token: user.token });
      expect(response.status).toBe(404);
      expect(response.body.code).toBe('INTERACTION_NOT_FOUND');
    });

    it('別の申し込みの Cookie では扱えない', async () => {
      const user = await createUser();
      const first = await start();
      const second = await start();
      const path = `/oauth/interaction/${first.uid}/details`;
      const secondCookie = second.jar.header(`/oauth/interaction/${second.uid}/details`);
      const response = await request(app)
        .get(path)
        .set('Authorization', `Bearer ${user.token}`)
        .set('Cookie', secondCookie);
      expect(response.status).toBe(404);
    });
  });

  describe('CSRF', () => {
    it.each(STATE_CHANGING_ACTIONS)('%s は CSRF トークンが無いと 403', async (action) => {
      const user = await createUser();
      const flow = await start();
      const response = await send('post', flow.uid, action, {
        token: user.token,
        jar: flow.jar,
        csrf: 'missing',
        body: {},
      });
      expect(response.status).toBe(403);
      expect(response.body.code).toBe('CSRF_TOKEN_MISSING');
      expect(response.headers['cache-control']).toBe('no-store');
    });

    it.each(STATE_CHANGING_ACTIONS)('%s は CSRF トークンが違うと 403', async (action) => {
      const user = await createUser();
      const flow = await start();
      const response = await send('post', flow.uid, action, {
        token: user.token,
        jar: flow.jar,
        csrf: 'wrong',
        body: {},
      });
      expect(response.status).toBe(403);
      expect(response.body.code).toBe('CSRF_TOKEN_INVALID');
    });

    it.each(STATE_CHANGING_ACTIONS)('%s は別のオリジンからだと 403', async (action) => {
      const user = await createUser();
      const flow = await start();
      const response = await send('post', flow.uid, action, {
        token: user.token,
        jar: flow.jar,
        csrf: 'bad-origin',
        body: {},
      });
      expect(response.status).toBe(403);
      expect(response.body.code).toBe('CSRF_ORIGIN_MISMATCH');
      expect(await connectionCount(user.id)).toBe(0);
    });
  });

  describe('権限と制限', () => {
    it('権限が無い利用者は 403 PERMISSION_REQUIRED', async () => {
      const user = await createUser({ permitted: false });
      const flow = await start();
      const details = await send('get', flow.uid, 'details', { token: user.token, jar: flow.jar });
      expect(details.status).toBe(403);
      expect(details.body.code).toBe('PERMISSION_REQUIRED');
      const approved = await send('post', flow.uid, 'approve', {
        token: user.token,
        jar: flow.jar,
        body: { scopes: ['read'] },
      });
      expect(approved.status).toBe(403);
      expect(approved.body.code).toBe('PERMISSION_REQUIRED');
      expect(await connectionCount(user.id)).toBe(0);
    });

    it('権限が無い利用者も拒否してアプリへ戻れる', async () => {
      const user = await createUser({ permitted: false });
      const flow = await start();
      const denied = await send('post', flow.uid, 'deny', { token: user.token, jar: flow.jar });
      expect(denied.status).toBe(200);
      const callback = await resume(flow, denied.body.redirectTo as string);
      expect(callback.searchParams.get('error')).toBe('access_denied');
    });

    it.each([
      ['PASSWORD_CHANGE_REQUIRED', { mustChangePassword: true }],
      ['TWO_FACTOR_SETUP_REQUIRED', { twoFactor: false }],
    ] as const)('制限中の利用者（%s）は 403 で接続を作れない', async (code, state) => {
      const user = await createUser({ state });
      const flow = await start();
      for (const [method, action, body] of [
        ['get', 'details', undefined],
        ['post', 'second-factor', { type: 'totp', code: '000000' }],
        ['post', 'approve', { scopes: ['read'] }],
        // 要件34.2 は設定とログアウト以外を拒むので、制限中は拒否の経路も通らない
        ['post', 'deny', undefined],
      ] as const) {
        const response = await send(method, flow.uid, action, {
          token: user.token,
          jar: flow.jar,
          body,
        });
        expect(response.status).toBe(403);
        expect(response.body.code).toBe(code);
      }
      expect(await connectionCount(user.id)).toBe(0);
    });

    it('状態のキャッシュが古くても、手続きの確認で 403 にする', async () => {
      const user = await createUser();
      const flow = await start();
      await send('get', flow.uid, 'details', { token: user.token, jar: flow.jar });
      // キャッシュを消さずに DB だけを変え、authenticate を通った後の確認を試す
      await prisma.user.update({ where: { id: user.id }, data: { mustChangePassword: true } });
      const response = await send('post', flow.uid, 'approve', {
        token: user.token,
        jar: flow.jar,
        body: { scopes: ['read'] },
      });
      expect(response.status).toBe(403);
      expect(response.body.code).toBe('PASSWORD_CHANGE_REQUIRED');
      expect(await connectionCount(user.id)).toBe(0);
    });
  });

  describe('2FA', () => {
    it('通っていないと同意は 403 SECOND_FACTOR_REQUIRED', async () => {
      const user = await createUser();
      const flow = await start();
      await send('get', flow.uid, 'details', { token: user.token, jar: flow.jar });
      const response = await send('post', flow.uid, 'approve', {
        token: user.token,
        jar: flow.jar,
        body: { scopes: ['read'] },
      });
      expect(response.status).toBe(403);
      expect(response.body.code).toBe('SECOND_FACTOR_REQUIRED');
    });

    it('誤ったコードは 400 で、値を応答に含めない', async () => {
      const user = await createUser();
      const flow = await start();
      await send('get', flow.uid, 'details', { token: user.token, jar: flow.jar });
      const code = wrongCode(user);
      const response = await send('post', flow.uid, 'second-factor', {
        token: user.token,
        jar: flow.jar,
        body: code,
      });
      expect(response.status).toBe(400);
      expect(response.body.code).toBe('SECOND_FACTOR_FAILED');
      expect(response.text).not.toContain(code.code);
      const row = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
      expect(row.twoFactorFailures).toBe(1);
    });

    it('連続の失敗で 403 のロックになり、解除の時刻を返す', async () => {
      const user = await createUser();
      const flow = await start();
      await send('get', flow.uid, 'details', { token: user.token, jar: flow.jar });
      const code = wrongCode(user);
      const statuses: number[] = [];
      let last: Awaited<ReturnType<typeof send>> | undefined;
      for (let attempt = 0; attempt < 5; attempt += 1) {
        last = await send('post', flow.uid, 'second-factor', {
          token: user.token,
          jar: flow.jar,
          body: code,
        });
        statuses.push(last.status);
      }
      expect(statuses).toEqual([400, 400, 400, 400, 403]);
      expect(last?.body.code).toBe('SECOND_FACTOR_LOCKED');
      expect(Number.isNaN(Date.parse(String(last?.body.unlockAt)))).toBe(false);
    });

    it.each([
      ['桁が違う', { type: 'totp', code: '12345' }],
      ['数字でない', { type: 'totp', code: 'abcdef' }],
      ['種類が違う', { type: 'sms', code: '123456' }],
      ['余分な項目', { type: 'totp', code: '123456', extra: 'x' }],
      ['バックアップの形が違う', { type: 'backup', code: 'short' }],
      ['本文が無い', undefined],
    ])('本文の形が違う（%s）と 400 で計数しない', async (_label, body) => {
      const user = await createUser();
      const flow = await start();
      await send('get', flow.uid, 'details', { token: user.token, jar: flow.jar });
      const response = await send('post', flow.uid, 'second-factor', {
        token: user.token,
        jar: flow.jar,
        body,
      });
      expect(response.status).toBe(400);
      expect(response.body.code).toBe('INVALID_REQUEST');
      const row = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
      expect(row.twoFactorFailures ?? 0).toBe(0);
    });

    it.each([
      ['保存の形', 'ABCD2345'],
      ['表示の形', 'ABCD-2345'],
      ['小文字', 'abcd-2345'],
    ])('バックアップコード（%s）で通過できる', async (_label, code) => {
      const user = await createUser();
      await prisma.twoFactorBackupCode.create({
        data: { userId: user.id, codeHash: await hash('ABCD2345') },
      });
      const flow = await start();
      await send('get', flow.uid, 'details', { token: user.token, jar: flow.jar });
      const response = await send('post', flow.uid, 'second-factor', {
        token: user.token,
        jar: flow.jar,
        body: { type: 'backup', code },
      });
      expect(response.status).toBe(204);
      const details = await send('get', flow.uid, 'details', { token: user.token, jar: flow.jar });
      expect(details.body.secondFactorVerified).toBe(true);
    });

    it('壊れた JSON は固定の 400', async () => {
      const user = await createUser();
      const flow = await start();
      const response = await send('post', flow.uid, 'second-factor', {
        token: user.token,
        jar: flow.jar,
        headers: { 'Content-Type': 'application/json' },
        body: '{"code":"123',
      });
      expect(response.status).toBe(400);
      expect(response.body.code).toBe('INVALID_REQUEST');
      expect(response.text).not.toContain('123');
      expect(response.headers['cache-control']).toBe('no-store');
    });

    describe('既存の試行制限', () => {
      async function clearLimiterKeys(): Promise<void> {
        const client = redis.getClient();
        if (!client) {
          throw new Error('Redis の接続がありません');
        }
        const keys = await client.keys('rl:2fa-verify:*');
        if (keys.length > 0) {
          await client.del(...keys);
        }
      }

      beforeEach(async () => {
        await clearLimiterKeys();
        // 試験では httpLogger が差し替えられ、超過の応答が使う req.log が無い
        Object.defineProperty(IncomingMessage.prototype, 'log', {
          configurable: true,
          writable: true,
          value: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
        });
      });

      afterEach(async () => {
        delete (IncomingMessage.prototype as unknown as { log?: unknown }).log;
        await clearLimiterKeys();
      });

      it('ログインの 2FA と同じ枠で数え、超過は 429', async () => {
        const { runtimeMode } = await import('../../config/runtime-mode.js');
        vi.spyOn(runtimeMode, 'isRateLimitBypassAllowed').mockReturnValue(false);
        const user = await createUser();
        const flow = await start();

        for (let attempt = 0; attempt < 5; attempt += 1) {
          const login = await request(app)
            .post('/api/v1/auth/verify-2fa')
            .send({ challengeToken: 'invalid', code: '12' });
          expect(login.status).not.toBe(429);
        }
        for (let attempt = 0; attempt < 5; attempt += 1) {
          const consent = await send('post', flow.uid, 'second-factor', {
            token: user.token,
            jar: flow.jar,
            body: { type: 'totp', code: 'bad' },
          });
          expect(consent.status).toBe(400);
        }
        const limited = await send('post', flow.uid, 'second-factor', {
          token: user.token,
          jar: flow.jar,
          body: { type: 'totp', code: '000000' },
        });
        expect(limited.status).toBe(429);
        expect(limited.headers['retry-after']).toBeDefined();
        expect(limited.headers['cache-control']).toBe('no-store');
        const row = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
        expect(row.twoFactorFailures ?? 0).toBe(0);
      });
    });
  });

  describe('期限切れと別の利用者', () => {
    it.each([
      ['get', 'details', undefined],
      ['post', 'second-factor', { type: 'totp', code: '000000' }],
      ['post', 'approve', { scopes: ['read'] }],
      ['post', 'deny', undefined],
    ] as const)('期限切れの申し込みは %s %s が 404', async (method, action, body) => {
      const user = await createUser();
      const flow = await start();
      const id = `Interaction:${flow.uid}`;
      const row = await prisma.oAuthStoreRecord.findUniqueOrThrow({ where: { id } });
      const exp = Math.floor(Date.now() / 1000) - 1;
      await prisma.oAuthStoreRecord.update({
        where: { id },
        data: {
          expiresAt: new Date(exp * 1000),
          payload: { ...(row.payload as Record<string, unknown>), exp },
        },
      });
      const response = await send(method, flow.uid, action, {
        token: user.token,
        jar: flow.jar,
        body,
      });
      expect(response.status).toBe(404);
      expect(response.body.code).toBe('INTERACTION_NOT_FOUND');
    });

    it('別の利用者は通過の印を使えず、接続を作れない', async () => {
      const owner = await createUser();
      const other = await createUser();
      const flow = await start();
      await passSecondFactor(flow, owner);
      const response = await send('post', flow.uid, 'approve', {
        token: other.token,
        jar: flow.jar,
        body: { scopes: ['read'] },
      });
      expect(response.status).toBe(403);
      expect(response.body.code).toBe('SECOND_FACTOR_REQUIRED');
      expect(response.text).not.toContain(owner.email);
      expect(await connectionCount(other.id)).toBe(0);
      expect(await connectionCount(owner.id)).toBe(0);
    });

    it('Cookie を持たない別の利用者には申し込みの有無を明かさない', async () => {
      const owner = await createUser();
      const other = await createUser();
      const flow = await start();
      await passSecondFactor(flow, owner);
      const existing = await send('get', flow.uid, 'details', { token: other.token });
      const missing = await send('get', 'Z'.repeat(43), 'details', { token: other.token });
      expect(existing.status).toBe(404);
      expect(missing.status).toBe(404);
      expect(existing.body).toEqual(missing.body);
    });

    it('開始の後に世代の結び付きが消えたら 404 RECONNECT_REQUIRED', async () => {
      const user = await createUser();
      const flow = await start();
      await send('get', flow.uid, 'details', { token: user.token, jar: flow.jar });
      await redis.getClient()?.del(`oauth:consent:generation:${flow.uid}:${user.id}`);
      const response = await send('post', flow.uid, 'second-factor', {
        token: user.token,
        jar: flow.jar,
        body: await totp(user),
      });
      expect(response.status).toBe(404);
      expect(response.body.code).toBe('RECONNECT_REQUIRED');
    });

    it('Redis が使えないと 503', async () => {
      const user = await createUser();
      const flow = await start();
      await send('get', flow.uid, 'details', { token: user.token, jar: flow.jar });
      const client = redis.getClient();
      vi.spyOn(redis, 'getClient').mockReturnValue(null);
      const response = await send('post', flow.uid, 'second-factor', {
        token: user.token,
        jar: flow.jar,
        body: { type: 'totp', code: '000000' },
      });
      vi.mocked(redis.getClient).mockReturnValue(client);
      expect(response.status).toBe(503);
      expect(response.body.code).toBe('SERVICE_UNAVAILABLE');
    });
  });

  describe('範囲の検証', () => {
    it.each([
      ['未知の範囲', { scopes: ['read', 'admin'] }],
      ['空', { scopes: [] }],
      ['重複', { scopes: ['read', 'read'] }],
      ['配列でない', { scopes: 'read' }],
      ['余分な項目', { scopes: ['read'], extra: true }],
    ])('本文の形が違う（%s）と 400', async (_label, body) => {
      const user = await createUser();
      const flow = await start();
      await passSecondFactor(flow, user);
      const response = await send('post', flow.uid, 'approve', {
        token: user.token,
        jar: flow.jar,
        body,
      });
      expect(response.status).toBe(400);
      expect(response.body.code).toBe('INVALID_REQUEST');
      expect(await connectionCount(user.id)).toBe(0);
    });

    it('read を外すと 400 READ_SCOPE_REQUIRED', async () => {
      const user = await createUser();
      const flow = await start();
      await passSecondFactor(flow, user);
      const response = await send('post', flow.uid, 'approve', {
        token: user.token,
        jar: flow.jar,
        body: { scopes: ['write'] },
      });
      expect(response.status).toBe(400);
      expect(response.body.code).toBe('READ_SCOPE_REQUIRED');
    });

    it('要求に無い範囲は 400 SCOPE_NOT_REQUESTED', async () => {
      const user = await createUser();
      const flow = await start('offline_access read');
      await passSecondFactor(flow, user);
      const response = await send('post', flow.uid, 'approve', {
        token: user.token,
        jar: flow.jar,
        body: { scopes: ['read', 'write'] },
      });
      expect(response.status).toBe(400);
      expect(response.body.code).toBe('SCOPE_NOT_REQUESTED');
    });
  });

  describe('同意と拒否', () => {
    it('同意で公開オリジンの再開 URL を返し、コードをトークンへ交換できる', async () => {
      const user = await createUser();
      const flow = await start();
      await passSecondFactor(flow, user);
      const approved = await send('post', flow.uid, 'approve', {
        token: user.token,
        jar: flow.jar,
        body: { scopes: ['read'] },
        headers: { 'X-Forwarded-Host': EVIL_HOST, 'X-Forwarded-Proto': 'https' },
      });
      expect(approved.status).toBe(200);
      expect(approved.headers['cache-control']).toBe('no-store');
      expect(approved.body).toEqual({ redirectTo: `${ISSUER}/oauth/authorize/${flow.uid}` });
      expect(await connectionCount(user.id)).toBe(1);

      const callback = await resume(flow, approved.body.redirectTo as string);
      expect(callback.origin + callback.pathname).toBe(REDIRECT_URI);
      expect(callback.searchParams.get('state')).toBe('state-743');
      const code = callback.searchParams.get('code');
      expect(code).toBeTruthy();

      const tokenResponse = await request(app)
        .post('/oauth/token')
        .type('form')
        .send({
          grant_type: 'authorization_code',
          code: code ?? '',
          redirect_uri: REDIRECT_URI,
          client_id: CLIENT_ID,
          client_secret: CLIENT_SECRET,
          code_verifier: flow.verifier,
          resource: RESOURCE,
        });
      expect(tokenResponse.status).toBe(200);
      expect(tokenResponse.headers['cache-control']).toBe('no-store');
      // アクセストークンの範囲はリソースの範囲だけで、offline_access は更新トークンの発行に表れる
      expect(tokenResponse.body.scope).toBe('read');
      expect(tokenResponse.body.refresh_token).toEqual(expect.any(String));

      // 外部アプリ用のトークンは同意の API で使えない
      const another = await start();
      const rejected = await send('get', another.uid, 'details', {
        token: tokenResponse.body.access_token as string,
        jar: another.jar,
      });
      expect(rejected.status).toBe(401);
    });

    it('拒否は access_denied を戻り先へ返し、接続を作らない', async () => {
      const user = await createUser();
      const flow = await start();
      const denied = await send('post', flow.uid, 'deny', { token: user.token, jar: flow.jar });
      expect(denied.status).toBe(200);
      expect(denied.headers['cache-control']).toBe('no-store');
      expect(denied.body).toEqual({ redirectTo: `${ISSUER}/oauth/authorize/${flow.uid}` });
      const callback = await resume(flow, denied.body.redirectTo as string);
      expect(callback.origin + callback.pathname).toBe(REDIRECT_URI);
      expect(callback.searchParams.get('error')).toBe('access_denied');
      expect(callback.searchParams.get('code')).toBeNull();
      expect(await connectionCount(user.id)).toBe(0);
    });
  });
});
