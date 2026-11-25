/**
 * @fileoverview 2FA の再設定による接続の失効の統合検証（user-authentication タスク 76.5）
 *
 * 本物のアプリ（app.ts の経路・認証ミドルウェア・認可サーバー）・サーバー上のスクリプトの実行
 * （`runResetUndecryptable` と本番と同じ部品の `createDefaultContext`）・実 PostgreSQL・実 Redis を通す。
 * 外部アプリ用のトークンは同意の API を 2FA から通して発行し、確認用の窓口（`/oauth/resource/whoami`）へ提示する。
 * 2 つ目のアプリの接続は接続の管理の `createOrReplace` で作り、Grant とトークンの保存データの行を足す。
 *
 * 確かめること:
 * - 50.7: 管理者による 2FA の再設定（`POST /api/v1/users/:id/2fa/reset`）で利用者の全ての接続と保存データの行が
 *   消え、外部アプリ用のトークンが 401 になる。暗号化鍵の入れ替えの後始末のスクリプトが 2FA を未登録へ戻す
 *   再設定でも同じく失効する（要件34.7 の再設定として扱う。タスク76.5 の判断）
 * - 51.7: 接続の終了の監査に理由 `TWO_FACTOR_RESET`・実行者の管理者・対象・アプリ・送信元 IP が残る。
 *   スクリプトは実行者も送信元も無いので null で記録する
 * - 途中の失敗で取引を戻すと、失効も再設定も戻る
 * - 進行中の同意と再設定の競合で、コミットの後に接続が残らない（失効の世代。タスク72.3）
 * - ロックの順序（リフレッシュトークンの取引ロック → users の行 → 失効の取引ロック）により、全デバイスの
 *   ログアウト・パスワードの変更・利用者の削除と同時に進んでもデッドロックしない（スクリプトの経路は
 *   users の行の後にリフレッシュトークンの取引ロックを取っていた。タスク76.1 の申し送り）
 * - 接続の無い利用者は再設定だけが行われる
 *
 * Design: Requirements 46-51 > ExternalAppConnectionService（`ConnectionEndReason` の `TWO_FACTOR_RESET`・
 * Invariants のロックの順序）、Modified Files（two-factor.service.ts）
 *
 * @requirement user-authentication/REQ-50.7
 * @requirement user-authentication/REQ-51.7
 */

import { createHash, generateKeyPairSync, randomBytes, randomUUID } from 'crypto';
import type { Express } from 'express';
import { authenticator } from 'otplib';
import request from 'supertest';
import { hash } from '@node-rs/argon2';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Prisma, PrismaClient } from '../../generated/prisma/client.js';
import type {
  ConnectionRevocationConflictError as ConflictErrorClass,
  ExternalAppConnectionService as ConnectionServiceClass,
} from '../../services/external-app-connection.service.js';
import type { AuditLogService as AuditLogServiceClass } from '../../services/audit-log.service.js';
import type { ResetUndecryptableContext } from '../../scripts/reset-undecryptable-two-factor.js';
import { createTestUser } from './test-user-factory.js';

// スクリプトのモジュールは .env を読み込む。試験の環境変数に開発用の値を混ぜない
vi.mock('dotenv/config', () => ({}));

const MARK = 'test-ua765-2fa-reset-revoke';
const ISSUER = 'http://localhost:5174';
const RESOURCE = `${ISSUER}/mcp`;
const CLIENT_ID = 'test-oauth765-client';
const CLIENT_SECRET = randomBytes(24).toString('hex');
const OTHER_CLIENT_ID = `${MARK}-client-b`;
const REDIRECT_URI = 'https://client.example/callback';
const WHOAMI = '/oauth/resource/whoami';
const PASSWORD = 'TwoFactorRevoke!Passphrase-2026';
const NEW_PASSWORD = 'TwoFactorRevoke!Rotated-2026xyz';
const USER_AGENT = 'ua765-integration-agent/1.0';
const SCRIPT_REASON = '統合検証の暗号化鍵の入れ替え';
const LOCK_WAIT_DEADLINE_MS = 8000;
/** 現在の暗号化鍵で復号できない 2FA の秘密（入れ替えより前の鍵で暗号化された値の代わり） */
const UNDECRYPTABLE_SECRET = 'undecryptable:with-the-current-key';
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

interface TestUser {
  readonly id: string;
  readonly email: string;
  readonly secret: string;
  /** 画面用のアクセストークン */
  readonly screenToken: string;
}

interface Connected {
  /** 外部アプリ用のアクセストークン */
  readonly externalToken: string;
  /** 利用者の全ての接続の Grant の ID */
  readonly grantIds: readonly string[];
}

type PathName = '管理者による再設定' | 'スクリプトによる再設定';

interface PathEntry {
  readonly name: PathName;
  /** 経路を呼び、成功したかを返す */
  readonly run: (target: TestUser) => Promise<{ ok: boolean; status?: number; detail?: string }>;
}

describe('2FA の再設定による接続の失効（統合・タスク76.5）', () => {
  let app: Express;
  let prisma: PrismaClient;
  let redis: (typeof import('../../redis.js'))['default'];
  let tokenService: (typeof import('../../services/token.service.js'))['default'];
  let AuditLogService: typeof AuditLogServiceClass;
  let ConnectionRevocationConflictError: typeof ConflictErrorClass;
  let connectionService: ConnectionServiceClass;
  let runResetUndecryptable: (typeof import('../../scripts/reset-undecryptable-two-factor.js'))['runResetUndecryptable'];
  let scriptContext: ResetUndecryptableContext;
  let frontendOrigin: string;
  let csrfToken: string;
  let passwordHash: string;
  let admin: TestUser;
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
        displayName: 'Two Factor Reset Revoke Test App',
        redirectUris: [REDIRECT_URI],
      },
    ]);
    process.env.OAUTH_ISSUER = ISSUER;
    process.env.OAUTH_RESOURCE_URL = RESOURCE;
    process.env.OAUTH_JWKS = JSON.stringify({
      keys: [{ ...privateKey.export({ format: 'jwk' }), kid: 'k765', use: 'sig', alg: 'RS256' }],
    });
    process.env.OAUTH_COOKIE_KEYS = JSON.stringify([randomBytes(32).toString('hex')]);
    process.env.OAUTH_TOKEN_HMAC_KEY = randomBytes(32).toString('hex');

    ({ default: app } = await import('../../app.js'));
    const { default: getPrismaClient } = await import('../../db.js');
    prisma = getPrismaClient();
    const redisModule = await import('../../redis.js');
    redis = redisModule.default;
    await redisModule.initRedis();
    // 前提: 実 Redis に接続できていること（できなければ赤にする。読み飛ばさない）
    expect(redis.getClient()?.status, '実 Redis に接続できていない').toBe('ready');
    ({ default: tokenService } = await import('../../services/token.service.js'));
    ({ AuditLogService } = await import('../../services/audit-log.service.js'));
    const connectionModule = await import('../../services/external-app-connection.service.js');
    ConnectionRevocationConflictError = connectionModule.ConnectionRevocationConflictError;
    connectionService = new connectionModule.ExternalAppConnectionService({
      prisma,
      auditLogService: new AuditLogService({ prisma }),
    });
    const scriptModule = await import('../../scripts/reset-undecryptable-two-factor.js');
    runResetUndecryptable = scriptModule.runResetUndecryptable;
    // 本番と同じ部品（TwoFactorService・状態のキャッシュの無効化）。接続は閉じない（試験の共有の接続）
    scriptContext = await scriptModule.createDefaultContext();
    // 前提: スクリプトが鍵の形式の確認で止まらないこと
    expect(scriptContext.encryptionKey, 'TWO_FACTOR_ENCRYPTION_KEY が無い').toMatch(
      /^[0-9a-f]{64}$/i
    );
    const { seedRoles, seedPermissions, seedRolePermissions } =
      await import('../../utils/seed-helpers.js');
    await seedRoles(prisma);
    await seedPermissions(prisma);
    await seedRolePermissions(prisma);
    const { getEnv } = await import('../../config/env.js');
    frontendOrigin = new URL(getEnv().FRONTEND_URL).origin;
    passwordHash = await hash(PASSWORD, { memoryCost: 65536, timeCost: 3, parallelism: 4 });

    const csrfResponse = await request(app).get('/csrf-token');
    expect(csrfResponse.status).toBe(200);
    csrfToken = csrfResponse.body.csrfToken as string;

    admin = await createUser('admin', { roleName: 'admin' });
  });

  beforeEach(async () => {
    const client = redis.getClient();
    const keys = (await client?.keys('rl:*')) ?? [];
    if (keys.length > 0) {
      await client!.del(...keys);
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    const { deleteAuditLogsWithArchivePermission } =
      await import('../../utils/audit-log-archive-permission.js');
    await prisma.externalAppConnection.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.oAuthStoreRecord.deleteMany({ where: { id: { contains: MARK } } });
    await prisma.oAuthStoreRecord.deleteMany({
      where: { payload: { path: ['clientId'], equals: CLIENT_ID } },
    });
    await prisma.oAuthStoreRecord.deleteMany({
      where: { payload: { path: ['params', 'client_id'], equals: CLIENT_ID } },
    });
    // 再開で作られる認可サーバーの Session の行は clientId を持たないので、利用者で消す（タスク79.4）
    await prisma.oAuthStoreRecord.deleteMany({
      where: {
        kind: 'Session',
        OR: userIds.map((id) => ({ payload: { path: ['accountId'], equals: id } })),
      },
    });
    await deleteAuditLogsWithArchivePermission(prisma, {
      OR: [{ actorId: { in: userIds } }, { targetId: { in: userIds } }],
    });
    await prisma.refreshToken.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.twoFactorBackupCode.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.passwordHistory.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.userRole.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.rolePermission.deleteMany({ where: { roleId: { in: roleIds } } });
    await prisma.role.deleteMany({ where: { id: { in: roleIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    const client = redis.getClient();
    if (!client) {
      throw new Error('Redis の接続がありません');
    }
    const { authUserStateCacheKey } =
      await import('../../services/authenticated-user-state-cache.js');
    if (userIds.length > 0) {
      await client.del(...userIds.map(authUserStateCacheKey));
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

  /** 利用者を作る。既定は権限「外部アプリの接続」だけを持つロールを割り当てる */
  async function createUser(label: string, options: { roleName?: string } = {}): Promise<TestUser> {
    const secret = authenticator.generateSecret();
    const id = randomUUID();
    const email = `${MARK}-${label}-${randomBytes(4).toString('hex')}@example.com`;
    await createTestUser(
      prisma,
      { id, email, displayName: `${MARK}-${label}`, passwordHash },
      { twoFactor: { secret } }
    );
    userIds.push(id);
    if (options.roleName !== undefined) {
      const role = await prisma.role.findUniqueOrThrow({ where: { name: options.roleName } });
      await prisma.userRole.create({ data: { userId: id, roleId: role.id } });
    } else {
      const permission = await prisma.permission.findUniqueOrThrow({
        where: { resource_action: { resource: 'external_app', action: 'connect' } },
      });
      const role = await prisma.role.create({
        data: { name: `${MARK}-${randomUUID()}`, description: 'ua765' },
      });
      roleIds.push(role.id);
      await prisma.rolePermission.create({
        data: { roleId: role.id, permissionId: permission.id },
      });
      await prisma.userRole.create({ data: { userId: id, roleId: role.id } });
    }
    const screenToken = await tokenService.generateAccessToken({
      userId: id,
      email,
      roles: options.roleName !== undefined ? [options.roleName] : [],
      accessTokenGeneration: 0,
    });
    return { id, email, secret, screenToken };
  }

  function consentCall(
    method: 'get' | 'post',
    uid: string,
    action: string,
    user: TestUser,
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
      .set('Authorization', `Bearer ${user.screenToken}`)
      .set('Cookie', cookies.filter((part) => part !== '').join('; '));
    if (method === 'post') {
      call = call.set('Origin', frontendOrigin).set('X-CSRF-Token', csrfToken);
    }
    return body === undefined ? call : call.send(body);
  }

  /** 同意の API を 2FA から通して接続し、外部アプリ用のアクセストークンを得る */
  async function connectViaOAuth(user: TestUser): Promise<{ token: string; grantId: string }> {
    const jar = new PathCookieJar();
    const verifier = randomBytes(32).toString('base64url');
    const query = new URLSearchParams({
      client_id: CLIENT_ID,
      response_type: 'code',
      redirect_uri: REDIRECT_URI,
      resource: RESOURCE,
      scope: 'offline_access read',
      state: 'state-765',
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
    const approved = await consentCall('post', uid, 'approve', user, jar, { scopes: ['read'] });
    expect(approved.status, JSON.stringify(approved.body)).toBe(200);

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
    const connection = await prisma.externalAppConnection.findUniqueOrThrow({
      where: { userId_clientId: { userId: user.id, clientId: CLIENT_ID } },
    });
    return { token: tokens.body.access_token as string, grantId: connection.grantId };
  }

  function generationOf(userId: string): Promise<number> {
    return prisma.user
      .findUniqueOrThrow({
        where: { id: userId },
        select: { externalAppRevocationGeneration: true },
      })
      .then((row) => row.externalAppRevocationGeneration);
  }

  function consentInput(userId: string, clientId: string, grantId: string, expected: number) {
    return {
      userId,
      clientId,
      grantId,
      scopes: ['read' as const],
      consentedAt: new Date(),
      expectedRevocationGeneration: expected,
    };
  }

  /** 2 つ目のアプリの接続を接続の管理で作り、Grant とトークンの保存データの行を足す */
  async function addFixtureConnection(userId: string): Promise<string> {
    const grantId = `${MARK}-grant-${randomUUID()}`;
    const expected = await generationOf(userId);
    await prisma.$transaction((tx) =>
      connectionService.createOrReplace(
        consentInput(userId, OTHER_CLIENT_ID, grantId, expected),
        tx
      )
    );
    await prisma.oAuthStoreRecord.createMany({
      data: [
        { id: `Grant:${MARK}-${randomUUID()}`, kind: 'Grant', grantId, payload: {} },
        { id: `AccessToken:${MARK}-${randomUUID()}`, kind: 'AccessToken', grantId, payload: {} },
      ],
    });
    return grantId;
  }

  /** 実際の同意の接続と 2 つ目のアプリの接続を作り、外部アプリ用のトークンが通ることを確かめる */
  async function connectTwoApps(user: TestUser): Promise<Connected> {
    const viaOAuth = await connectViaOAuth(user);
    const fixture = await addFixtureConnection(user.id);
    expect((await whoami(viaOAuth.token)).status).toBe(200);
    return { externalToken: viaOAuth.token, grantIds: [viaOAuth.grantId, fixture] };
  }

  function whoami(token: string) {
    return request(app).get(WHOAMI).set('Authorization', `Bearer ${token}`);
  }

  function me(token: string) {
    return request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${token}`);
  }

  function connectionCount(userId: string): Promise<number> {
    return prisma.externalAppConnection.count({ where: { userId } });
  }

  function storeRowCount(grantIds: readonly string[]): Promise<number> {
    return prisma.oAuthStoreRecord.count({ where: { grantId: { in: [...grantIds] } } });
  }

  function endedAudits(userId: string) {
    return prisma.auditLog.findMany({
      where: { action: 'CONNECTION_ENDED', targetId: userId },
      orderBy: { createdAt: 'asc' },
    });
  }

  function resetAudits(userId: string) {
    return prisma.auditLog.findMany({
      where: { action: 'TWO_FACTOR_RESET_BY_ADMIN', targetId: userId },
    });
  }

  function twoFactorStateOf(userId: string) {
    return prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { twoFactorEnabled: true, twoFactorSecret: true, accessTokenGeneration: true },
    });
  }

  /** ロックを待つ接続（同じデータベース）が `count` 件以上になるまで待つ。期限内に現れなければ失敗させる */
  async function waitUntilBlocked(count: number): Promise<void> {
    const deadline = Date.now() + LOCK_WAIT_DEADLINE_MS;
    while (Date.now() < deadline) {
      const rows = await prisma.$queryRaw<{ waiting: number }[]>`
        SELECT COUNT(*)::int AS waiting FROM pg_stat_activity
        WHERE datname = current_database() AND cardinality(pg_blocking_pids(pid)) > 0`;
      if ((rows[0]?.waiting ?? 0) >= count) {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error(`ロックを待つ接続が ${count} 件現れませんでした`);
  }

  /** 取引の中で本体を実行する（本体が始めた処理の待ちを確かめてからコミットする） */
  function holdTransaction<T>(body: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return prisma.$transaction(body, { timeout: LOCK_WAIT_DEADLINE_MS * 2 });
  }

  /** supertest の要求を直ちに送り始める（`then` を呼ぶまで送られないため） */
  function start(pending: request.Test): Promise<request.Response> {
    return pending.then((response) => response);
  }

  const PATHS: readonly PathEntry[] = [
    {
      name: '管理者による再設定',
      run: async (target) => {
        const response = await start(
          request(app)
            .post(`/api/v1/users/${target.id}/2fa/reset`)
            .set('Authorization', `Bearer ${admin.screenToken}`)
            .set('User-Agent', USER_AGENT)
        );
        return {
          ok: response.status === 204,
          status: response.status,
          detail: JSON.stringify(response.body),
        };
      },
    },
    {
      name: 'スクリプトによる再設定',
      run: async (target) => {
        // 暗号化鍵の入れ替えより前の鍵で暗号化された秘密の代わりに、現在の鍵で復号できない値を置く
        await prisma.user.update({
          where: { id: target.id },
          data: { twoFactorSecret: UNDECRYPTABLE_SECRET },
        });
        const out: string[] = [];
        const err: string[] = [];
        const code = await runResetUndecryptable(
          { apply: true, reason: SCRIPT_REASON },
          {
            ...scriptContext,
            // 共有の試験データベースの他の利用者を対象にしない
            listCandidates: () =>
              prisma.user.findMany({
                where: { id: target.id },
                select: {
                  id: true,
                  email: true,
                  twoFactorEnabled: true,
                  twoFactorSecret: true,
                  twoFactorPendingSecret: true,
                },
              }),
            out: (line) => out.push(line),
            err: (line) => err.push(line),
          }
        );
        return { ok: code === 0, detail: [...out, ...err].join('\n') };
      },
    },
  ];

  /** 経路の実行者と送信元の期待値（スクリプトは実行者も送信元も無い） */
  function expectedActor(entry: PathEntry) {
    return entry.name === 'スクリプトによる再設定'
      ? { actorId: null, ipAddress: null, userAgent: null }
      : {
          actorId: admin.id,
          ipAddress: expect.stringMatching(/127\.0\.0\.1|::1/),
          userAgent: USER_AGENT,
        };
  }

  describe.each(PATHS)('$name', (entry) => {
    it('全ての接続と保存データの行を消し、外部アプリ用のトークンを 401 にし、理由・実行者・対象・アプリ・送信元を監査に残す', async () => {
      const target = await createUser('target');
      const { externalToken, grantIds } = await connectTwoApps(target);
      const generationBefore = await generationOf(target.id);
      const stateBefore = await twoFactorStateOf(target.id);

      const result = await entry.run(target);

      expect(result.ok, result.detail).toBe(true);
      expect(await connectionCount(target.id)).toBe(0);
      expect(await storeRowCount(grantIds)).toBe(0);
      const rejected = await whoami(externalToken);
      expect(rejected.status).toBe(401);
      expect(rejected.headers['www-authenticate']).toContain('error="invalid_token"');
      // 発行済みの画面用アクセストークンも世代で直ちに 401 になる（要件34.7）
      expect((await me(target.screenToken)).status).toBe(401);
      expect(await generationOf(target.id)).toBe(generationBefore + 1);
      const stateAfter = await twoFactorStateOf(target.id);
      expect(stateAfter.twoFactorEnabled).toBe(false);
      expect(stateAfter.twoFactorSecret).toBeNull();
      expect(stateAfter.accessTokenGeneration).toBe(stateBefore.accessTokenGeneration + 1);
      expect(await resetAudits(target.id)).toHaveLength(1);

      const audits = await endedAudits(target.id);
      expect(audits).toHaveLength(2);
      const actor = expectedActor(entry);
      for (const audit of audits) {
        expect(audit.targetType).toBe('User');
        expect(audit.targetId).toBe(target.id);
        expect(audit.actorId).toBe(actor.actorId);
        const metadata = audit.metadata as Record<string, unknown>;
        expect(metadata.reason).toBe('TWO_FACTOR_RESET');
        expect(metadata.ipAddress).toEqual(actor.ipAddress);
        expect(metadata.userAgent).toEqual(actor.userAgent);
        expect(metadata.scopes).toEqual(['read']);
        expect(typeof metadata.occurredAt).toBe('string');
      }
      expect(
        audits.map((audit) => (audit.metadata as Record<string, unknown>).clientId).sort()
      ).toEqual([CLIENT_ID, OTHER_CLIENT_ID].sort());
    });

    it('途中の失敗で取引を戻すと、接続・保存データの行・世代・2FA の状態が戻る', async () => {
      const target = await createUser('rollback');
      const { externalToken, grantIds } = await connectTwoApps(target);
      const generationBefore = await generationOf(target.id);
      const storeRowsBefore = await storeRowCount(grantIds);
      const accessGenerationBefore = (await twoFactorStateOf(target.id)).accessTokenGeneration;

      // 対象の 2 件目の接続の終了の監査で失敗させる（1 件目の消去は取引の中で済んでいる）
      const original = AuditLogService.prototype.createLog;
      let ended = 0;
      vi.spyOn(AuditLogService.prototype, 'createLog').mockImplementation(async function (
        this: AuditLogServiceClass,
        input,
        tx
      ) {
        if (input.action === 'CONNECTION_ENDED' && input.targetId === target.id && ++ended === 2) {
          throw new Error('injected audit failure');
        }
        return original.call(this, input, tx);
      });

      const result = await entry.run(target);

      expect(ended).toBe(2);
      expect(result.ok).toBe(false);
      if (entry.name === '管理者による再設定') {
        expect(result.status).toBe(500);
      }
      expect(await connectionCount(target.id)).toBe(2);
      expect(await storeRowCount(grantIds)).toBe(storeRowsBefore);
      expect(await endedAudits(target.id)).toHaveLength(0);
      expect(await generationOf(target.id)).toBe(generationBefore);
      const state = await twoFactorStateOf(target.id);
      expect(state.twoFactorEnabled).toBe(true);
      expect(state.twoFactorSecret).not.toBeNull();
      expect(state.accessTokenGeneration).toBe(accessGenerationBefore);
      expect(await resetAudits(target.id)).toHaveLength(0);
      vi.restoreAllMocks();
      expect((await whoami(externalToken)).status).toBe(200);
    });

    it('未コミットの同意を待ち、同意のコミットの後にその接続も終了する', async () => {
      const target = await createUser('pending-consent');
      const grantId = `${MARK}-grant-${randomUUID()}`;
      const expected = await generationOf(target.id);

      const { pending } = await holdTransaction(async (tx) => {
        await connectionService.createOrReplace(
          consentInput(target.id, OTHER_CLIENT_ID, grantId, expected),
          tx
        );
        const started = entry.run(target);
        await waitUntilBlocked(1);
        return { pending: { promise: started } };
      });

      const result = await pending.promise;
      expect(result.ok, result.detail).toBe(true);
      expect(await connectionCount(target.id)).toBe(0);
      const audits = await endedAudits(target.id);
      expect(audits).toHaveLength(1);
      expect((audits[0]!.metadata as Record<string, unknown>).reason).toBe('TWO_FACTOR_RESET');
    });

    it('再設定より前に始まった同意は、再設定のコミットの後に接続を作れない', async () => {
      const target = await createUser('stale-consent');
      // 同意の手続きの開始時に読む世代
      const expected = await generationOf(target.id);

      const result = await entry.run(target);
      expect(result.ok, result.detail).toBe(true);

      await expect(
        prisma.$transaction((tx) =>
          connectionService.createOrReplace(
            consentInput(target.id, OTHER_CLIENT_ID, `${MARK}-grant-${randomUUID()}`, expected),
            tx
          )
        )
      ).rejects.toBeInstanceOf(ConnectionRevocationConflictError);
      expect(await connectionCount(target.id)).toBe(0);
    });

    it('接続の無い利用者は再設定だけが行われ、接続の終了を監査に残さない', async () => {
      const target = await createUser('no-connection');

      const result = await entry.run(target);

      expect(result.ok, result.detail).toBe(true);
      expect(await endedAudits(target.id)).toHaveLength(0);
      expect((await twoFactorStateOf(target.id)).twoFactorEnabled).toBe(false);
      expect(await resetAudits(target.id)).toHaveLength(1);
    });

    /**
     * 他の操作をリフレッシュトークンの取引ロックで先に待たせてから再設定を始める。再設定が users の行や失効の
     * 取引ロックをリフレッシュトークンの取引ロックより先に取ると、ロックの解放の後に互いに待つ（デッドロック）
     */
    async function raceBehindRefreshTokenLock(
      target: TestUser,
      other: () => Promise<request.Response>
    ): Promise<[request.Response, Awaited<ReturnType<PathEntry['run']>>]> {
      const { lockUserRefreshTokens } = await import('../../utils/refresh-token-lock.js');
      const { pending } = await holdTransaction(async (tx) => {
        await lockUserRefreshTokens(tx, target.id);
        const first = other();
        await waitUntilBlocked(1);
        const running = entry.run(target);
        await waitUntilBlocked(2);
        return { pending: { promise: Promise.all([first, running]) } };
      });
      return pending.promise;
    }

    it('全デバイスのログアウトと同時に進んでもデッドロックせず、両方が成功して接続が残らない', async () => {
      const target = await createUser('logout-all');
      await addFixtureConnection(target.id);

      const [loggedOut, result] = await raceBehindRefreshTokenLock(target, () =>
        start(
          request(app)
            .post('/api/v1/auth/logout-all')
            .set('Authorization', `Bearer ${target.screenToken}`)
            .set('User-Agent', USER_AGENT)
        )
      );

      expect(loggedOut.status, JSON.stringify(loggedOut.body)).toBe(200);
      expect(result.ok, result.detail).toBe(true);
      expect(await connectionCount(target.id)).toBe(0);
      expect((await twoFactorStateOf(target.id)).twoFactorEnabled).toBe(false);
      const reasons = (await endedAudits(target.id)).map(
        (audit) => (audit.metadata as Record<string, unknown>).reason
      );
      // 先に取引ロックを得た全デバイスのログアウトが接続を終了し、再設定は終了する接続を持たない
      expect(reasons).toEqual(['LOGOUT_ALL']);
    });

    it('パスワードの変更と同時に進んでもデッドロックせず、両方が成功して接続が残らない', async () => {
      const target = await createUser('password-change');
      await addFixtureConnection(target.id);

      const [changed, result] = await raceBehindRefreshTokenLock(target, () =>
        start(
          request(app)
            .post('/api/v1/auth/password/change')
            .set('Authorization', `Bearer ${target.screenToken}`)
            .set('User-Agent', USER_AGENT)
            .send({
              currentPassword: PASSWORD,
              newPassword: NEW_PASSWORD,
              newPasswordConfirm: NEW_PASSWORD,
            })
        )
      );

      expect(changed.status, JSON.stringify(changed.body)).toBe(200);
      expect(result.ok, result.detail).toBe(true);
      expect(await connectionCount(target.id)).toBe(0);
      expect((await twoFactorStateOf(target.id)).twoFactorEnabled).toBe(false);
      const reasons = (await endedAudits(target.id)).map(
        (audit) => (audit.metadata as Record<string, unknown>).reason
      );
      expect(reasons).toEqual(['PASSWORD_CHANGED']);
    });

    it('利用者の削除と同時に進んでもデッドロックせず、削除が成功して接続が残らない', async () => {
      const target = await createUser('delete');
      await addFixtureConnection(target.id);

      const [deleted, result] = await raceBehindRefreshTokenLock(target, () =>
        start(
          request(app)
            .delete(`/api/v1/users/${target.id}`)
            .set('Authorization', `Bearer ${admin.screenToken}`)
            .set('User-Agent', USER_AGENT)
        )
      );

      expect(deleted.status, JSON.stringify(deleted.body)).toBe(204);
      // 削除の後の再設定は対象の不在（管理者の経路は 404・スクリプトは何も変えない）で終わる。
      // デッドロックでは 500（管理者の経路）・失敗の終了コード（スクリプト）になる
      if (entry.name === '管理者による再設定') {
        expect([204, 404], result.detail).toContain(result.status);
      } else {
        expect(result.ok, result.detail).toBe(true);
      }
      expect(await prisma.user.findUnique({ where: { id: target.id } })).toBeNull();
      expect(await connectionCount(target.id)).toBe(0);
      const audits = await endedAudits(target.id);
      expect(audits).toHaveLength(1);
      expect(['ACCOUNT_DELETED', 'TWO_FACTOR_RESET']).toContain(
        (audits[0]!.metadata as Record<string, unknown>).reason
      );
    });
  });
});
