/**
 * @fileoverview 認可コードフロー全体を実際の app.ts・DB・Redis で確かめる（user-authentication タスク 79.1）
 *
 * Cookie の入れ物を 1 つのブラウザとして扱い、実際のログイン（パスワードと 2FA）・認可の要求・同意の API
 * （内容の取得 → 2FA → 同意）・再開・`/oauth/token` の交換（`client_secret_post`、PKCE S256）・更新・
 * 本人の取り消し・外部アプリ用の窓口（whoami）を 1 本の流れで通す。外部アプリ（Claude）の要求は
 * ブラウザの Cookie を持たない。
 *
 * - 46.1・47.6・47.9・48.1・48.5: 許可されたアプリの申し込みから交換・更新まで
 * - 47.2・47.8: 同じブラウザの 2 回目の申し込みは 2FA と同意へ戻り、前のトークンは使えなくなる
 * - 47.10・48.6: 使用済みの認可コードとリフレッシュトークンの再提示（48.11 の猶予を含む）
 * - 48.4: 更新で接続の 90 日を延ばさない
 * - 48.9・51.1・51.2: 終了した接続のトークンは 401、読み取りだけの接続の書き込みは 403
 *
 * 期限は時計を進めず、保存データの行の期限（`expiresAt` と本体の `exp`）を過去へ書き換えて確かめる
 * （既存の統合テストと同じ方法）。2FA は「次のコードを待つ」代わりに最後に使ったステップを戻す。
 *
 * Design: Requirements 46-51 > System Flows（接続の同意・接続の状態）、OAuthProviderHost、OAuthStoreAdapter
 *
 * @requirement user-authentication/REQ-46.1
 * @requirement user-authentication/REQ-47.2
 * @requirement user-authentication/REQ-47.6
 * @requirement user-authentication/REQ-47.8
 * @requirement user-authentication/REQ-47.9
 * @requirement user-authentication/REQ-47.10
 * @requirement user-authentication/REQ-48.1
 * @requirement user-authentication/REQ-48.4
 * @requirement user-authentication/REQ-48.5
 * @requirement user-authentication/REQ-48.6
 * @requirement user-authentication/REQ-48.9
 * @requirement user-authentication/REQ-51.1
 * @requirement user-authentication/REQ-51.2
 */

import { createHash, generateKeyPairSync, randomBytes, randomUUID } from 'crypto';
import type { Express } from 'express';
import { hash } from '@node-rs/argon2';
import { authenticator } from 'otplib';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Prisma } from '../../generated/prisma/client.js';
import { createTestUser } from './test-user-factory.js';

const ISSUER = 'http://localhost:5174';
const RESOURCE = `${ISSUER}/mcp`;
const CLIENT_ID = 'test-oauth791-client';
const CLIENT_SECRET = randomBytes(24).toString('hex');
const OTHER_CLIENT_ID = 'test-oauth791-other';
const OTHER_CLIENT_SECRET = randomBytes(24).toString('hex');
const REDIRECT_URI = 'https://client.example/callback';
const APP_NAME = 'Flow Test App';
const PASSWORD = 'Flow791-Passw0rd!xyz';
const DAY_MS = 24 * 60 * 60 * 1000;
const LOOPBACK = /127\.0\.0\.1|::1/;
const OAUTH_KEYS = [
  'OAUTH_ALLOWED_CLIENTS',
  'OAUTH_ISSUER',
  'OAUTH_RESOURCE_URL',
  'OAUTH_JWKS',
  'OAUTH_COOKIE_KEYS',
  'OAUTH_TOKEN_HMAC_KEY',
] as const;

type Prisma791 = Awaited<typeof import('../../db.js')>['default'] extends () => infer P ? P : never;

interface FlowUser {
  readonly id: string;
  readonly email: string;
  readonly secret: string;
}

interface Tokens {
  readonly access_token: string;
  readonly refresh_token: string;
  readonly scope: string;
  readonly expires_in: number;
}

interface Authorization {
  readonly uid: string;
  readonly verifier: string;
}

/** 名前と Path の組で Cookie を持ち、要求のパスに合うものだけを送るブラウザの入れ物 */
class Browser {
  private readonly cookies = new Map<string, { name: string; value: string; path: string }>();
  accessToken: string | null = null;

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
      const key = `${name};${path}`;
      if (value === '' || /expires=Thu, 01 Jan 1970/i.test(line)) {
        this.cookies.delete(key);
      } else {
        this.cookies.set(key, { name, value, path });
      }
    }
  }

  set(name: string, value: string, path = '/'): void {
    this.cookies.set(`${name};${path}`, { name, value, path });
  }

  has(name: string): boolean {
    return [...this.cookies.values()].some((cookie) => cookie.name === name);
  }

  header(requestPath: string): string {
    return (
      [...this.cookies.values()]
        .filter(
          ({ path }) => path === '/' || requestPath === path || requestPath.startsWith(`${path}/`)
        )
        // ブラウザと同じく Path の長い方を先に送る
        .sort((left, right) => right.path.length - left.path.length)
        .map(({ name, value }) => `${name}=${value}`)
        .join('; ')
    );
  }
}

describe('認可コードフロー全体（タスク79.1）', () => {
  let app: Express;
  let prisma: Prisma791;
  let redis: (typeof import('../../redis.js'))['default'];
  let invalidateUserStateCache: (userId: string) => Promise<void>;
  let loginForTokens: (typeof import('./auth-login-client.js'))['loginForTokens'];
  let frontendOrigin: string;
  let csrfToken: string;
  let passwordHash: string;
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
        tokenEndpointAuthMethod: 'client_secret_post',
      },
      {
        clientId: OTHER_CLIENT_ID,
        clientSecret: OTHER_CLIENT_SECRET,
        displayName: 'Flow Other App',
        redirectUris: [REDIRECT_URI],
        tokenEndpointAuthMethod: 'client_secret_post',
      },
    ]);
    process.env.OAUTH_ISSUER = ISSUER;
    process.env.OAUTH_RESOURCE_URL = RESOURCE;
    process.env.OAUTH_JWKS = JSON.stringify({
      keys: [{ ...privateKey.export({ format: 'jwk' }), kid: 'k791', use: 'sig', alg: 'RS256' }],
    });
    process.env.OAUTH_COOKIE_KEYS = JSON.stringify([randomBytes(32).toString('hex')]);
    process.env.OAUTH_TOKEN_HMAC_KEY = randomBytes(32).toString('hex');

    ({ default: app } = await import('../../app.js'));
    const { default: getPrismaClient } = await import('../../db.js');
    prisma = getPrismaClient() as Prisma791;
    const redisModule = await import('../../redis.js');
    redis = redisModule.default;
    await redisModule.initRedis();
    expect(redis.getClient()?.status).toBe('ready');
    ({ invalidateUserStateCache } = await import('./test-user-factory.js'));
    ({ loginForTokens } = await import('./auth-login-client.js'));
    const { getEnv } = await import('../../config/env.js');
    frontendOrigin = new URL(getEnv().FRONTEND_URL).origin;

    // 設定が欠けて認可サーバーが載らなければ、ここで失敗させる（試験を素通りさせない）
    const metadata = await request(app).get('/.well-known/oauth-authorization-server');
    expect(metadata.status).toBe(200);
    expect(metadata.body.issuer).toBe(ISSUER);
    expect(metadata.body.token_endpoint).toBe(`${ISSUER}/oauth/token`);

    const csrfResponse = await request(app).get('/csrf-token');
    expect(csrfResponse.status).toBe(200);
    csrfToken = csrfResponse.body.csrfToken as string;
    passwordHash = await hash(PASSWORD, { memoryCost: 65536, timeCost: 3, parallelism: 4 });
  });

  afterAll(async () => {
    const { deleteAuditLogsWithArchivePermission } =
      await import('../../utils/audit-log-archive-permission.js');
    const clientIds = [CLIENT_ID, OTHER_CLIENT_ID];
    await prisma.externalAppConnection.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.oAuthStoreRecord.deleteMany({
      where: { OR: clientIds.map((id) => ({ payload: { path: ['clientId'], equals: id } })) },
    });
    await prisma.oAuthStoreRecord.deleteMany({
      where: {
        OR: clientIds.map((id) => ({ payload: { path: ['params', 'client_id'], equals: id } })),
      },
    });
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

  // ---- 利用者とブラウザ ----

  async function createUser(): Promise<FlowUser> {
    const secret = authenticator.generateSecret();
    const id = randomUUID();
    const email = `oauth791-${id}@example.test`;
    await createTestUser(
      prisma,
      { id, email, displayName: 'OAuth 791', passwordHash },
      { twoFactor: { secret } }
    );
    userIds.push(id);
    const permission = await prisma.permission.findUniqueOrThrow({
      where: { resource_action: { resource: 'external_app', action: 'connect' } },
    });
    const role = await prisma.role.create({
      data: { name: `oauth791-${randomUUID()}`, description: 'oauth791' },
    });
    roleIds.push(role.id);
    await prisma.rolePermission.create({ data: { roleId: role.id, permissionId: permission.id } });
    await prisma.userRole.create({ data: { userId: id, roleId: role.id } });
    await invalidateUserStateCache(id);
    return { id, email, secret };
  }

  function newBrowser(): Browser {
    const browser = new Browser();
    browser.set('csrf-token', csrfToken);
    return browser;
  }

  /** 実際のログイン（パスワード → 2FA）。リフレッシュの Cookie をブラウザに置く */
  async function login(browser: Browser, user: FlowUser): Promise<void> {
    const response = await loginForTokens(app, { email: user.email, password: PASSWORD });
    browser.store(response.headers['set-cookie']);
    expect(browser.has('refreshToken')).toBe(true);
    browser.accessToken = response.body.accessToken as string;
  }

  /** 1 端末のログアウト（要件50.5 で接続は残る） */
  async function logout(browser: Browser): Promise<void> {
    const path = '/api/v1/auth/logout';
    const response = await request(app)
      .post(path)
      .set('Authorization', `Bearer ${browser.accessToken ?? ''}`)
      .set('Cookie', browser.header(path))
      .set('Origin', frontendOrigin)
      .set('X-CSRF-Token', csrfToken);
    expect(response.status).toBe(200);
    browser.store(response.headers['set-cookie']);
    expect(browser.has('refreshToken')).toBe(false);
    browser.accessToken = null;
  }

  // ---- 認可の要求と同意（ブラウザ） ----

  function pkce(): { verifier: string; challenge: string } {
    const verifier = randomBytes(32).toString('base64url');
    return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') };
  }

  async function authorizeRaw(
    browser: Browser,
    overrides: Record<string, string> = {}
  ): Promise<{ response: request.Response; verifier: string }> {
    const { verifier, challenge } = pkce();
    const query = new URLSearchParams({
      client_id: CLIENT_ID,
      response_type: 'code',
      redirect_uri: REDIRECT_URI,
      resource: RESOURCE,
      scope: 'offline_access read write',
      state: 'state-791',
      code_challenge: challenge,
      code_challenge_method: 'S256',
      ...overrides,
    });
    const path = '/oauth/authorize';
    const response = await request(app)
      .get(`${path}?${query.toString()}`)
      .set('Cookie', browser.header(path))
      .redirects(0);
    browser.store(response.headers['set-cookie']);
    return { response, verifier };
  }

  /** 認可の要求を送り、同意の URL から画面への転送までを通す */
  async function authorize(
    browser: Browser,
    overrides: Record<string, string> = {}
  ): Promise<Authorization> {
    const { response, verifier } = await authorizeRaw(browser, overrides);
    // 既に同意した利用者でも、黙ってコードを返さず同意の手続きへ送る（47.2）
    expect(response.status).toBe(303);
    const location = String(response.headers.location);
    expect(location).toMatch(/^\/oauth\/interaction\/[A-Za-z0-9_-]{43}$/);
    const uid = location.split('/').pop() ?? '';
    flowUids.add(uid);
    const forwarded = await request(app)
      .get(location)
      .set('Cookie', browser.header(location))
      .redirects(0);
    expect(forwarded.status).toBe(302);
    expect(forwarded.headers.location).toBe(`/connect/consent/${uid}`);
    return { uid, verifier };
  }

  function consentApi(
    browser: Browser,
    method: 'get' | 'post',
    uid: string,
    action: 'details' | 'second-factor' | 'approve' | 'deny',
    body?: object
  ) {
    const path = `/oauth/interaction/${uid}/${action}`;
    let call = request(app)
      [method](path)
      .set('Authorization', `Bearer ${browser.accessToken ?? ''}`)
      .set('Cookie', browser.header(path));
    if (method === 'post') {
      call = call.set('Origin', frontendOrigin).set('X-CSRF-Token', csrfToken);
    }
    return body === undefined ? call : call.send(body);
  }

  /** 画面が「次のコードを待つ」代わりに、最後に使ったステップを戻して今のコードを作る */
  async function nextTotp(user: FlowUser): Promise<{ type: 'totp'; code: string }> {
    await prisma.user.update({ where: { id: user.id }, data: { twoFactorLastUsedStep: null } });
    return { type: 'totp', code: authenticator.generate(user.secret) };
  }

  /** 同意の画面の操作（内容の取得 → 2FA → 同意）を通し、再開の URL を返す */
  async function consent(
    browser: Browser,
    user: FlowUser,
    authorization: Authorization,
    scopes: string[]
  ): Promise<string> {
    const details = await consentApi(browser, 'get', authorization.uid, 'details');
    expect(details.status).toBe(200);
    expect(details.body).toMatchObject({
      appName: APP_NAME,
      redirectHost: 'client.example',
      account: { email: user.email },
      secondFactorVerified: false,
    });
    const verified = await consentApi(
      browser,
      'post',
      authorization.uid,
      'second-factor',
      await nextTotp(user)
    );
    expect(verified.status).toBe(204);
    const approved = await consentApi(browser, 'post', authorization.uid, 'approve', { scopes });
    expect(approved.status).toBe(200);
    expect(approved.body.redirectTo).toBe(`${ISSUER}/oauth/authorize/${authorization.uid}`);
    return approved.body.redirectTo as string;
  }

  /** 再開の URL へ遷移し、戻り先へ返った URL を返す */
  async function resume(browser: Browser, redirectTo: string): Promise<URL> {
    const path = new URL(redirectTo).pathname;
    const response = await request(app).get(path).set('Cookie', browser.header(path)).redirects(0);
    browser.store(response.headers['set-cookie']);
    expect(response.status).toBe(303);
    const callback = new URL(String(response.headers.location));
    expect(callback.origin + callback.pathname).toBe(REDIRECT_URI);
    expect(callback.searchParams.get('state')).toBe('state-791');
    return callback;
  }

  /** 申し込みから同意・再開までを通し、戻り先に返った認可コードを返す */
  async function obtainCode(
    browser: Browser,
    user: FlowUser,
    scopes: string[] = ['read', 'write']
  ): Promise<{ code: string; verifier: string; uid: string }> {
    const authorization = await authorize(browser);
    const callback = await resume(browser, await consent(browser, user, authorization, scopes));
    const code = callback.searchParams.get('code');
    expect(code).toEqual(expect.any(String));
    return { code: code ?? '', verifier: authorization.verifier, uid: authorization.uid };
  }

  // ---- 外部アプリ（Claude）の要求。ブラウザの Cookie を持たない ----

  function tokenRequest(body: Record<string, string>) {
    return request(app)
      .post('/oauth/token')
      .type('form')
      .set('User-Agent', 'oauth-791-client')
      .send(body);
  }

  function exchange(code: string, verifier: string, overrides: Record<string, string> = {}) {
    return tokenRequest({
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT_URI,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      code_verifier: verifier,
      resource: RESOURCE,
      ...overrides,
    });
  }

  function refresh(refreshToken: string, overrides: Record<string, string> = {}) {
    return tokenRequest({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      resource: RESOURCE,
      ...overrides,
    });
  }

  async function exchangeOk(code: string, verifier: string): Promise<Tokens> {
    const response = await exchange(code, verifier);
    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    return response.body as Tokens;
  }

  async function refreshOk(refreshToken: string): Promise<Tokens> {
    const response = await refresh(refreshToken);
    expect(response.status).toBe(200);
    return response.body as Tokens;
  }

  function whoami(accessToken: string) {
    return request(app).get('/oauth/resource/whoami').set('Authorization', `Bearer ${accessToken}`);
  }

  async function expectAccepted(accessToken: string, scopes: string[]): Promise<void> {
    const response = await whoami(accessToken);
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ scopes, appName: APP_NAME });
  }

  async function expectRejected(accessToken: string): Promise<void> {
    const response = await whoami(accessToken);
    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'invalid_token' });
    expect(response.headers['www-authenticate']).toContain('error="invalid_token"');
  }

  function expectInvalidGrant(response: request.Response): void {
    expect(response.status).toBe(400);
    expect(response.body.error).toBe('invalid_grant');
    expect(response.body.access_token).toBeUndefined();
  }

  // ---- 状態の確かめ ----

  function connectionOf(userId: string, clientId = CLIENT_ID) {
    return prisma.externalAppConnection.findUnique({
      where: { userId_clientId: { userId, clientId } },
    });
  }

  function auditsOf(userId: string, action: string) {
    return prisma.auditLog.findMany({
      where: { action, targetId: userId },
      orderBy: { createdAt: 'asc' },
    });
  }

  function metadataOf(audit: { metadata: unknown } | undefined): Record<string, unknown> {
    return (audit?.metadata ?? {}) as Record<string, unknown>;
  }

  /** 保存データの行の期限を過去へ書き換える（行の期限と、ライブラリが見る本体の exp の両方） */
  async function expireRecord(where: Prisma.OAuthStoreRecordWhereInput): Promise<void> {
    const rows = await prisma.oAuthStoreRecord.findMany({ where });
    expect(rows.length).toBeGreaterThan(0);
    const exp = Math.floor(Date.now() / 1000) - 1;
    for (const row of rows) {
      await prisma.oAuthStoreRecord.update({
        where: { id: row.id },
        data: {
          expiresAt: new Date(exp * 1000),
          payload: { ...(row.payload as Prisma.JsonObject), exp },
        },
      });
    }
  }

  /** 使用済みのリフレッシュトークンの置き換えの日時を過去へずらす（30 秒の猶予の外へ出す） */
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

  /** 1 人の利用者が新しいブラウザでログインして接続し、トークンを得る */
  async function connect(scopes: string[] = ['read', 'write']) {
    const user = await createUser();
    const browser = newBrowser();
    await login(browser, user);
    const { code, verifier } = await obtainCode(browser, user, scopes);
    const tokens = await exchangeOk(code, verifier);
    const connection = await connectionOf(user.id);
    expect(connection).not.toBeNull();
    return { user, browser, code, verifier, tokens, grantId: connection?.grantId ?? '' };
  }

  describe('許可されたアプリの申し込みから取り消しまで', () => {
    it('同意・交換・利用・更新・本人の取り消しを通し、取り消しの後は両方のトークンが拒まれる', async () => {
      const user = await createUser();
      const browser = newBrowser();
      await login(browser, user);
      const before = Date.now();

      const { code, verifier } = await obtainCode(browser, user, ['read', 'write']);
      const connection = await connectionOf(user.id);
      expect(connection?.scopes).toEqual(['read', 'write']);
      expect(connection?.expiresAt.getTime()).toBeGreaterThanOrEqual(before + 90 * DAY_MS - 1000);

      const first = await exchangeOk(code, verifier);
      expect(first.scope).toBe('read write');
      expect(first.expires_in).toBe(900);
      expect(first.refresh_token).toEqual(expect.any(String));
      // トークンの値は DB に現れない（要件48.7）
      const stored = JSON.stringify(
        await prisma.oAuthStoreRecord.findMany({ where: { grantId: connection?.grantId } })
      );
      expect(stored).not.toContain(first.access_token);
      expect(stored).not.toContain(first.refresh_token);

      await expectAccepted(first.access_token, ['read', 'write']);
      const writeAccess = await request(app)
        .get('/oauth/resource/whoami/write-access')
        .set('Authorization', `Bearer ${first.access_token}`);
      expect(writeAccess.status).toBe(204);
      const touched = await connectionOf(user.id);
      expect(touched?.lastUsedAt).not.toBeNull();

      // 更新はトークンを回転し、接続の 90 日を延ばさない（48.4・48.5）
      const grantBefore = await prisma.oAuthStoreRecord.findFirstOrThrow({
        where: { grantId: connection?.grantId, kind: 'Grant' },
      });
      const second = await refreshOk(first.refresh_token);
      expect(second.refresh_token).not.toBe(first.refresh_token);
      expect(second.access_token).not.toBe(first.access_token);
      expect(second.scope).toBe('read write');
      await expectAccepted(second.access_token, ['read', 'write']);
      const grantAfter = await prisma.oAuthStoreRecord.findFirstOrThrow({
        where: { grantId: connection?.grantId, kind: 'Grant' },
      });
      expect(grantAfter.expiresAt).toEqual(grantBefore.expiresAt);
      expect((await connectionOf(user.id))?.expiresAt).toEqual(connection?.expiresAt);

      // 認可サーバーのトークンの失効の窓口は無く、取り消しは本システムの画面からだけ行う
      const revokeEndpoint = await request(app).post('/oauth/revoke').type('form').send({
        token: second.refresh_token,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
      });
      expect(revokeEndpoint.status).toBe(404);
      await expectAccepted(second.access_token, ['read', 'write']);

      // 本人の取り消し（連携中のアプリの画面の操作）
      const listed = await request(app)
        .get('/api/v1/external-app-connections')
        .set('Authorization', `Bearer ${browser.accessToken ?? ''}`);
      expect(listed.status).toBe(200);
      expect(listed.body.data).toHaveLength(1);
      expect(listed.body.data[0]).toMatchObject({ id: connection?.id, scopes: ['read', 'write'] });
      const path = `/api/v1/external-app-connections/${connection?.id ?? ''}`;
      const revoked = await request(app)
        .delete(path)
        .set('Authorization', `Bearer ${browser.accessToken ?? ''}`)
        .set('Cookie', browser.header(path))
        .set('Origin', frontendOrigin)
        .set('X-CSRF-Token', csrfToken);
      expect(revoked.status).toBe(204);

      await expectRejected(second.access_token);
      await expectRejected(first.access_token);
      expectInvalidGrant(await refresh(second.refresh_token));
      expect(await connectionOf(user.id)).toBeNull();
      expect(await prisma.oAuthStoreRecord.count({ where: { grantId: connection?.grantId } })).toBe(
        0
      );

      const granted = await auditsOf(user.id, 'CONSENT_GRANTED');
      expect(granted).toHaveLength(1);
      expect(granted[0]?.actorId).toBe(user.id);
      expect(metadataOf(granted[0])).toMatchObject({
        clientId: CLIENT_ID,
        scopes: ['read', 'write'],
        ipAddress: expect.stringMatching(LOOPBACK),
      });
      const ended = await auditsOf(user.id, 'CONNECTION_ENDED');
      expect(ended).toHaveLength(1);
      expect(ended[0]?.actorId).toBe(user.id);
      expect(metadataOf(ended[0])).toMatchObject({
        clientId: CLIENT_ID,
        reason: 'USER_REVOKED',
        ipAddress: expect.stringMatching(LOOPBACK),
      });
      // 取り消しの後のトークンの提示は再利用として扱わない（接続はもう無い）
      expect(await auditsOf(user.id, 'TOKEN_REUSE_DETECTED')).toHaveLength(0);
    });
  });

  describe('同じブラウザの 2 回目の申し込み', () => {
    it('2FA と同意へ戻り、完了の後は前のトークンが使えず新しいトークンが使える', async () => {
      const { user, browser, tokens: old, grantId: oldGrantId } = await connect();
      await expectAccepted(old.access_token, ['read', 'write']);

      // 同じブラウザ（ログイン中、前の再開で受けた Cookie も持つ）からの 2 回目の申し込み
      const authorization = await authorize(browser);
      const details = await consentApi(browser, 'get', authorization.uid, 'details');
      expect(details.status).toBe(200);
      expect(details.body.secondFactorVerified).toBe(false);
      // 2FA を通さない同意は拒まれ、接続は置き換わらない
      const silent = await consentApi(browser, 'post', authorization.uid, 'approve', {
        scopes: ['read'],
      });
      expect(silent.status).toBe(403);
      expect(silent.body.code).toBe('SECOND_FACTOR_REQUIRED');
      expect((await connectionOf(user.id))?.grantId).toBe(oldGrantId);
      // 同意の結果を持たない再開の URL を直接開いても、コードは返らず新しい同意の手続きへ戻る
      const resumePath = `/oauth/authorize/${authorization.uid}`;
      const premature = await request(app)
        .get(resumePath)
        .set('Cookie', browser.header(resumePath))
        .redirects(0);
      browser.store(premature.headers['set-cookie']);
      expect(premature.status).toBe(303);
      const location = String(premature.headers.location);
      expect(location).not.toContain('code=');
      expect(location).toMatch(/^\/oauth\/interaction\/[A-Za-z0-9_-]{43}$/);
      const retried: Authorization = {
        uid: location.split('/').pop() ?? '',
        verifier: authorization.verifier,
      };
      expect(retried.uid).not.toBe(authorization.uid);
      flowUids.add(retried.uid);
      await expectAccepted(old.access_token, ['read', 'write']);

      const callback = await resume(browser, await consent(browser, user, retried, ['read']));
      const code = callback.searchParams.get('code') ?? '';
      const replaced = await connectionOf(user.id);
      expect(replaced?.grantId).not.toBe(oldGrantId);
      expect(replaced?.scopes).toEqual(['read']);

      // 置き換えの時点で前のトークンは使えない（交換の前から）
      await expectRejected(old.access_token);
      expectInvalidGrant(await refresh(old.refresh_token));
      expect(await prisma.oAuthStoreRecord.count({ where: { grantId: oldGrantId } })).toBe(0);

      const fresh = await exchangeOk(code, authorization.verifier);
      expect(fresh.scope).toBe('read');
      await expectAccepted(fresh.access_token, ['read']);
      const rotated = await refreshOk(fresh.refresh_token);
      await expectAccepted(rotated.access_token, ['read']);
      // 前のリフレッシュトークンの提示で新しい接続は終わらない
      expectInvalidGrant(await refresh(old.refresh_token));
      expect((await connectionOf(user.id))?.grantId).toBe(replaced?.grantId);
      await expectAccepted(rotated.access_token, ['read']);

      const replacedAudits = await auditsOf(user.id, 'CONNECTION_REPLACED');
      expect(replacedAudits).toHaveLength(1);
      expect(metadataOf(replacedAudits[0])).toMatchObject({
        clientId: CLIENT_ID,
        reason: 'REPLACED',
        ipAddress: expect.stringMatching(LOOPBACK),
      });
      expect(await auditsOf(user.id, 'CONSENT_GRANTED')).toHaveLength(2);
      expect(await auditsOf(user.id, 'TOKEN_REUSE_DETECTED')).toHaveLength(0);
    });
  });

  describe('同じブラウザで別の利用者が同意する', () => {
    it('ログアウトして別の利用者がログインすると、その利用者の接続とトークンが作られ、前の利用者の接続は残る', async () => {
      const first = await connect();
      const { browser } = first;
      await logout(browser);
      // 1 端末のログアウトでは接続は残る（50.5）
      await expectAccepted(first.tokens.access_token, ['read', 'write']);

      const second = await createUser();
      await login(browser, second);
      const { code, verifier } = await obtainCode(browser, second, ['read']);
      const tokens = await exchangeOk(code, verifier);
      await expectAccepted(tokens.access_token, ['read']);

      const secondConnection = await connectionOf(second.id);
      expect(secondConnection?.scopes).toEqual(['read']);
      expect(secondConnection?.grantId).not.toBe(first.grantId);
      const secondGrant = await prisma.oAuthStoreRecord.findFirstOrThrow({
        where: { grantId: secondConnection?.grantId, kind: 'Grant' },
      });
      expect((secondGrant.payload as Record<string, unknown>).accountId).toBe(second.id);

      const firstConnection = await connectionOf(first.user.id);
      expect(firstConnection?.grantId).toBe(first.grantId);
      await expectAccepted(first.tokens.access_token, ['read', 'write']);
      const firstRotated = await refreshOk(first.tokens.refresh_token);
      await expectAccepted(firstRotated.access_token, ['read', 'write']);
      expect(await auditsOf(first.user.id, 'CONNECTION_REPLACED')).toHaveLength(0);
      expect(await auditsOf(first.user.id, 'CONNECTION_ENDED')).toHaveLength(0);
    });
  });

  describe('交換の失敗', () => {
    it('PKCE の検証値の不一致は invalid_grant で、トークンを発行しない', async () => {
      const user = await createUser();
      const browser = newBrowser();
      await login(browser, user);
      const { code, verifier } = await obtainCode(browser, user);
      const connection = await connectionOf(user.id);

      expectInvalidGrant(await exchange(code, pkce().verifier));
      // code_verifier の欠落も同じ
      const missingResponse = await tokenRequest({
        grant_type: 'authorization_code',
        code,
        redirect_uri: REDIRECT_URI,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        resource: RESOURCE,
      });
      expect(missingResponse.status).toBe(400);
      expect(missingResponse.body.error).toBe('invalid_grant');
      expect(missingResponse.body.access_token).toBeUndefined();
      expect(
        await prisma.oAuthStoreRecord.count({
          where: { grantId: connection?.grantId, kind: { in: ['AccessToken', 'RefreshToken'] } },
        })
      ).toBe(0);

      // 不一致は再利用ではないので接続は終わらず、正しい検証値の交換は通る
      expect(await auditsOf(user.id, 'TOKEN_REUSE_DETECTED')).toHaveLength(0);
      const tokens = await exchangeOk(code, verifier);
      await expectAccepted(tokens.access_token, ['read', 'write']);
    });

    it('使用済みの認可コードの再提示は invalid_grant で、そのコードから発行したトークンが使えなくなる', async () => {
      const { user, code, verifier, tokens, grantId } = await connect();
      await expectAccepted(tokens.access_token, ['read', 'write']);

      expectInvalidGrant(await exchange(code, verifier));

      await expectRejected(tokens.access_token);
      expectInvalidGrant(await refresh(tokens.refresh_token));
      expect(await connectionOf(user.id)).toBeNull();
      expect(await prisma.oAuthStoreRecord.count({ where: { grantId } })).toBe(0);
      const reuse = await auditsOf(user.id, 'TOKEN_REUSE_DETECTED');
      expect(reuse).toHaveLength(1);
      expect(metadataOf(reuse[0])).toMatchObject({
        clientId: CLIENT_ID,
        reuseKind: 'authorization_code',
        ipAddress: expect.stringMatching(LOOPBACK),
      });
    });

    it('期限の切れた認可コードは invalid_grant で、トークンを発行しない', async () => {
      const user = await createUser();
      const browser = newBrowser();
      await login(browser, user);
      const { code, verifier } = await obtainCode(browser, user);
      const connection = await connectionOf(user.id);
      await expireRecord({ grantId: connection?.grantId, kind: 'AuthorizationCode' });

      expectInvalidGrant(await exchange(code, verifier));
      expect(
        await prisma.oAuthStoreRecord.count({
          where: { grantId: connection?.grantId, kind: { in: ['AccessToken', 'RefreshToken'] } },
        })
      ).toBe(0);
    });

    it('別のアプリの認証で交換すると invalid_grant で、持ち主の接続は終わらない', async () => {
      const user = await createUser();
      const browser = newBrowser();
      await login(browser, user);
      const { code, verifier } = await obtainCode(browser, user);

      expectInvalidGrant(
        await exchange(code, verifier, {
          client_id: OTHER_CLIENT_ID,
          client_secret: OTHER_CLIENT_SECRET,
        })
      );
      expect(await auditsOf(user.id, 'TOKEN_REUSE_DETECTED')).toHaveLength(0);
      const tokens = await exchangeOk(code, verifier);
      await expectAccepted(tokens.access_token, ['read', 'write']);
    });
  });

  describe('リフレッシュトークンの再提示', () => {
    it('30 秒の猶予の外の再提示は接続を終わらせ、後継のトークンも使えなくなる', async () => {
      const { user, tokens, grantId } = await connect();
      const rotated = await refreshOk(tokens.refresh_token);
      // 後継を使ってから 31 秒後に、置き換え済みのトークンが提示された
      await expectAccepted(rotated.access_token, ['read', 'write']);
      await ageRotations(grantId, 31_000);

      expectInvalidGrant(await refresh(tokens.refresh_token));

      await expectRejected(rotated.access_token);
      expectInvalidGrant(await refresh(rotated.refresh_token));
      expect(await connectionOf(user.id)).toBeNull();
      const reuse = await auditsOf(user.id, 'TOKEN_REUSE_DETECTED');
      expect(reuse).toHaveLength(1);
      expect(metadataOf(reuse[0])).toMatchObject({
        clientId: CLIENT_ID,
        reuseKind: 'refresh_token',
        ipAddress: expect.stringMatching(LOOPBACK),
      });
      expect(await auditsOf(user.id, 'REFRESH_GRACE_APPLIED')).toHaveLength(0);
    });

    it('30 秒の猶予の内で後継が未使用なら、接続を保って新しいトークンを発行し、届かなかった後継は置き換え済みになる', async () => {
      const { user, tokens, grantId } = await connect();
      // 更新の応答が届かなかった（後継は未使用）想定で、同じトークンで再試行する
      const lost = await refreshOk(tokens.refresh_token);
      const retried = await refreshOk(tokens.refresh_token);
      expect(retried.refresh_token).not.toBe(lost.refresh_token);
      await expectAccepted(retried.access_token, ['read', 'write']);
      expect((await connectionOf(user.id))?.grantId).toBe(grantId);

      const grace = await auditsOf(user.id, 'REFRESH_GRACE_APPLIED');
      expect(grace).toHaveLength(1);
      expect(metadataOf(grace[0])).toMatchObject({
        clientId: CLIENT_ID,
        ipAddress: expect.stringMatching(LOOPBACK),
      });
      expect(await auditsOf(user.id, 'TOKEN_REUSE_DETECTED')).toHaveLength(0);

      // 新しい系列は使い続けられる
      const next = await refreshOk(retried.refresh_token);
      await expectAccepted(next.access_token, ['read', 'write']);

      // 届かなかった後継は置き換え済みとして扱い、猶予の後に提示されれば接続が終わる（48.11）
      await ageRotations(grantId, 31_000);
      expectInvalidGrant(await refresh(lost.refresh_token));
      expect(await connectionOf(user.id)).toBeNull();
      await expectRejected(next.access_token);
      expect(await auditsOf(user.id, 'TOKEN_REUSE_DETECTED')).toHaveLength(1);
    });
  });

  describe('アクセストークンの期限', () => {
    it('期限の切れたアクセストークンは 401 で、更新で得た新しいトークンは使える', async () => {
      const { user, tokens, grantId } = await connect();
      await expireRecord({ grantId, kind: 'AccessToken' });

      await expectRejected(tokens.access_token);
      // 期限切れは接続の終了ではない
      expect(await connectionOf(user.id)).not.toBeNull();
      const renewed = await refreshOk(tokens.refresh_token);
      await expectAccepted(renewed.access_token, ['read', 'write']);
    });
  });

  describe('範囲', () => {
    it('読み取りだけの同意のトークンは書き込みで 403、更新で範囲を広げられない', async () => {
      const { user, tokens } = await connect(['read']);
      expect(tokens.scope).toBe('read');
      expect((await connectionOf(user.id))?.scopes).toEqual(['read']);
      await expectAccepted(tokens.access_token, ['read']);

      const write = await request(app)
        .get('/oauth/resource/whoami/write-access')
        .set('Authorization', `Bearer ${tokens.access_token}`);
      expect(write.status).toBe(403);
      expect(write.headers['www-authenticate']).toContain('error="insufficient_scope"');

      const widened = await refresh(tokens.refresh_token, { scope: 'read write' });
      expect(widened.status).toBe(400);
      expect(widened.body.error).toBe('invalid_scope');
      expect(widened.body.access_token).toBeUndefined();
      // 拒まれた更新でトークンは消費されず、接続も保たれる
      const renewed = await refreshOk(tokens.refresh_token);
      expect(renewed.scope).toBe('read');
      await expectAccepted(renewed.access_token, ['read']);
    });

    it('アプリに許可されていない範囲（openid）の申し込みは同意の手続きへ進まず、戻り先へ invalid_scope を返す', async () => {
      const browser = newBrowser();
      const { response } = await authorizeRaw(browser, { scope: 'openid read' });
      expect(response.status).toBe(303);
      const callback = new URL(String(response.headers.location));
      expect(callback.origin + callback.pathname).toBe(REDIRECT_URI);
      expect(callback.searchParams.get('error')).toBe('invalid_scope');
      expect(callback.searchParams.get('code')).toBeNull();
      expect(browser.has('_interaction')).toBe(false);
    });

    it('未知の範囲は利用者に示さず付与もしない（74.2 の設計どおり拒否ではなく無視する）', async () => {
      const user = await createUser();
      const browser = newBrowser();
      await login(browser, user);
      const authorization = await authorize(browser, { scope: 'offline_access read write admin' });
      const details = await consentApi(browser, 'get', authorization.uid, 'details');
      expect(details.status).toBe(200);
      expect(details.body.requestedScopes).toEqual(['read', 'write']);
      const callback = await resume(
        browser,
        await consent(browser, user, authorization, ['read', 'write'])
      );
      const tokens = await exchangeOk(
        callback.searchParams.get('code') ?? '',
        authorization.verifier
      );
      expect(tokens.scope).toBe('read write');
      expect((await connectionOf(user.id))?.scopes).toEqual(['read', 'write']);
      const grant = await prisma.oAuthStoreRecord.findFirstOrThrow({
        where: { grantId: (await connectionOf(user.id))?.grantId, kind: 'Grant' },
      });
      // 付与はリソースの read write だけで、未知の範囲は拒否として記録される
      expect(grant.payload).toMatchObject({
        resources: { [RESOURCE]: 'read write' },
        rejected: { resources: { [RESOURCE]: 'admin' } },
      });
    });

    it('申し込みに無い範囲の同意は 400 で、接続を作らない', async () => {
      const user = await createUser();
      const browser = newBrowser();
      await login(browser, user);
      const authorization = await authorize(browser, { scope: 'offline_access read' });
      const details = await consentApi(browser, 'get', authorization.uid, 'details');
      expect(details.body.requestedScopes).toEqual(['read']);
      const verified = await consentApi(
        browser,
        'post',
        authorization.uid,
        'second-factor',
        await nextTotp(user)
      );
      expect(verified.status).toBe(204);
      const approved = await consentApi(browser, 'post', authorization.uid, 'approve', {
        scopes: ['read', 'write'],
      });
      expect(approved.status).toBe(400);
      expect(approved.body.code).toBe('SCOPE_NOT_REQUESTED');
      expect(await connectionOf(user.id)).toBeNull();
    });
  });

  describe('タスク75.1 の申し送り', () => {
    it('接続とトークンのアプリが食い違うと 401', async () => {
      const { user, tokens } = await connect();
      await expectAccepted(tokens.access_token, ['read', 'write']);
      await prisma.externalAppConnection.update({
        where: { userId_clientId: { userId: user.id, clientId: CLIENT_ID } },
        data: { clientId: OTHER_CLIENT_ID },
      });
      await expectRejected(tokens.access_token);
    });
  });

  describe('同意の手続きの有効期間（タスク73.2・74.2・78.1 の申し送り）', () => {
    it('手続きは申し込みから 600 秒で、期限の直前でもログイン済みの利用者の同意は完了する', async () => {
      const user = await createUser();
      const browser = newBrowser();
      await login(browser, user);
      const authorization = await authorize(browser);
      const id = `Interaction:${authorization.uid}`;
      const row = await prisma.oAuthStoreRecord.findUniqueOrThrow({ where: { id } });
      const payload = row.payload as { iat: number; exp: number };
      expect(payload.exp - payload.iat).toBe(600);

      // 申し込みから 590 秒が過ぎた（残り 10 秒）手続き
      const exp = Math.floor(Date.now() / 1000) + 10;
      await prisma.oAuthStoreRecord.update({
        where: { id },
        data: { expiresAt: new Date(exp * 1000), payload: { ...payload, exp } },
      });
      const callback = await resume(browser, await consent(browser, user, authorization, ['read']));
      const tokens = await exchangeOk(
        callback.searchParams.get('code') ?? '',
        authorization.verifier
      );
      await expectAccepted(tokens.access_token, ['read']);
    });
  });
});
