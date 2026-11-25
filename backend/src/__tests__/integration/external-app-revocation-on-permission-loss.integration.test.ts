/**
 * @fileoverview 権限の喪失による接続の失効の統合検証（user-authentication タスク 76.3）
 *
 * 本物のアプリ（app.ts の経路・認証ミドルウェア・認可サーバー）・実 PostgreSQL・実 Redis を通す。外部アプリ用の
 * トークンは同意の API を 2FA から通して発行し、確認用の窓口（`/oauth/resource/whoami`）へ提示する。2 つ目のアプリの
 * 接続は接続の管理の `createOrReplace` で作り、Grant とトークンの保存データの行を足す。
 *
 * 確かめること:
 * - 50.4: ロールの解除（`DELETE /api/v1/users/:id/roles/:roleId`）・ロールの権限の解除
 *   （`DELETE /api/v1/roles/:id/permissions/:permissionId`）・一括の解除（サービスの一括の経路）で、権限
 *   「外部アプリの接続」を失った利用者の接続だけが終わり、別のロールやワイルドカード（`*:*`・`external_app:*`・
 *   `*:connect`）で権限が残る利用者の接続は残る。権限を失っていない利用者の失効の世代は進まない
 * - 51.7: 接続の終了の監査に実行者（管理者）・対象・アプリ・理由 `PERMISSION_LOST`・送信元 IP・UA が残る
 * - 途中の失敗で取引を戻すと、失効もロールと権限の変更も戻る
 * - 判定はロックの後の DB の現在の値で行い、並行する変更・進行中の同意と競合しても権限を失った利用者の接続は
 *   残らず、権限が残る利用者の同意は成功する
 * - 利用者の削除・無効化・全デバイスのログアウトと同時に進んでもデッドロックしない
 * - `admin` ロールの `*:*` は外せず、使用中のロールは消せない（権限を失わせない経路であることを確かめる）
 *
 * Design: Requirements 46-51 > Modified Files（user-role.service.ts・role-permission.service.ts・
 * user-roles.routes.ts・roles.routes.ts）、ExternalAppConnectionService の Invariants と Implementation Notes
 *
 * @requirement user-authentication/REQ-50.4
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
import type { UserRoleService as UserRoleServiceClass } from '../../services/user-role.service.js';
import type { RolePermissionService as RolePermissionServiceClass } from '../../services/role-permission.service.js';
import { createTestUser } from './test-user-factory.js';

const MARK = 'test-ua763-permission-loss';
const ISSUER = 'http://localhost:5174';
const RESOURCE = `${ISSUER}/mcp`;
const CLIENT_ID = 'test-oauth763-client';
const CLIENT_SECRET = randomBytes(24).toString('hex');
const OTHER_CLIENT_ID = `${MARK}-client-b`;
const REDIRECT_URI = 'https://client.example/callback';
const WHOAMI = '/oauth/resource/whoami';
const PASSWORD = 'PermissionLoss!Passphrase-2026';
const USER_AGENT = 'ua763-integration-agent/1.0';
const SERVICE_SOURCE = { ipAddress: '198.51.100.63', userAgent: 'ua763-service-agent/1.0' };
const LOCK_WAIT_DEADLINE_MS = 8000;
const OAUTH_KEYS = [
  'OAUTH_ALLOWED_CLIENTS',
  'OAUTH_ISSUER',
  'OAUTH_RESOURCE_URL',
  'OAUTH_JWKS',
  'OAUTH_COOKIE_KEYS',
  'OAUTH_TOKEN_HMAC_KEY',
] as const;

/** 権限「外部アプリの接続」を包含する 4 つの形（既存の権限の照合と同じ規則） */
const CONNECT_FORMS = [
  ['external_app', 'connect'],
  ['external_app', '*'],
  ['*', 'connect'],
  ['*', '*'],
] as const;
type PermissionKey = readonly [resource: string, action: string];

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

describe('権限の喪失による接続の失効（統合・タスク76.3）', () => {
  let app: Express;
  let prisma: PrismaClient;
  let redis: (typeof import('../../redis.js'))['default'];
  let tokenService: (typeof import('../../services/token.service.js'))['default'];
  let AuditLogService: typeof AuditLogServiceClass;
  let ConnectionRevocationConflictError: typeof ConflictErrorClass;
  let connectionService: ConnectionServiceClass;
  let userRoleService: UserRoleServiceClass;
  let rolePermissionService: RolePermissionServiceClass;
  let frontendOrigin: string;
  let csrfToken: string;
  let passwordHash: string;
  let admin: TestUser;
  let adminRoleId: string;
  const saved = new Map<string, string | undefined>();
  const userIds: string[] = [];
  const roleIds: string[] = [];
  const createdPermissionIds: string[] = [];
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
        displayName: 'Permission Loss Test App',
        redirectUris: [REDIRECT_URI],
      },
    ]);
    process.env.OAUTH_ISSUER = ISSUER;
    process.env.OAUTH_RESOURCE_URL = RESOURCE;
    process.env.OAUTH_JWKS = JSON.stringify({
      keys: [{ ...privateKey.export({ format: 'jwk' }), kid: 'k763', use: 'sig', alg: 'RS256' }],
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
    // 一括の解除の経路（API の経路は持たない）を、経路と同じ組み立てで作る
    const { getSharedRBACService } = await import('../../services/rbac.service.js');
    const { PrivilegeCeilingPolicy } = await import('../../services/privilege-ceiling.js');
    const { UserRoleService } = await import('../../services/user-role.service.js');
    const { RolePermissionService } = await import('../../services/role-permission.service.js');
    const auditLogService = new AuditLogService({ prisma });
    userRoleService = new UserRoleService(
      prisma,
      getSharedRBACService(),
      auditLogService,
      undefined,
      undefined,
      new PrivilegeCeilingPolicy(prisma)
    );
    rolePermissionService = new RolePermissionService(
      prisma,
      getSharedRBACService(),
      auditLogService,
      new PrivilegeCeilingPolicy(prisma)
    );
    const { seedRoles, seedPermissions, seedRolePermissions } =
      await import('../../utils/seed-helpers.js');
    await seedRoles(prisma);
    await seedPermissions(prisma);
    await seedRolePermissions(prisma);
    for (const [resource, action] of CONNECT_FORMS) {
      const existing = await prisma.permission.findUnique({
        where: { resource_action: { resource, action } },
      });
      if (!existing) {
        const created = await prisma.permission.create({
          data: { resource, action, description: `${MARK} ${resource}:${action}` },
        });
        createdPermissionIds.push(created.id);
      }
    }
    adminRoleId = (await prisma.role.findUniqueOrThrow({ where: { name: 'admin' } })).id;
    const { getEnv } = await import('../../config/env.js');
    frontendOrigin = new URL(getEnv().FRONTEND_URL).origin;
    passwordHash = await hash(PASSWORD, { memoryCost: 65536, timeCost: 3, parallelism: 4 });

    const csrfResponse = await request(app).get('/csrf-token');
    expect(csrfResponse.status).toBe(200);
    csrfToken = csrfResponse.body.csrfToken as string;

    admin = await createUser('admin', [adminRoleId]);
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
      OR: [
        { actorId: { in: userIds } },
        { targetId: { in: userIds } },
        { targetId: { in: roleIds } },
      ],
    });
    await prisma.refreshToken.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.passwordHistory.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.userRole.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.rolePermission.deleteMany({ where: { roleId: { in: roleIds } } });
    await prisma.role.deleteMany({ where: { id: { in: roleIds } } });
    await prisma.rolePermission.deleteMany({
      where: { permissionId: { in: createdPermissionIds } },
    });
    await prisma.permission.deleteMany({ where: { id: { in: createdPermissionIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    const client = redis.getClient();
    if (!client) {
      throw new Error('Redis の接続がありません');
    }
    const { authUserStateCacheKey } =
      await import('../../services/authenticated-user-state-cache.js');
    if (userIds.length > 0) {
      await client.del(...userIds.map(authUserStateCacheKey));
      await client.del(...userIds.map((id) => `rbac:permissions:${id}`));
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

  async function permissionId([resource, action]: PermissionKey): Promise<string> {
    const permission = await prisma.permission.findUniqueOrThrow({
      where: { resource_action: { resource, action } },
    });
    return permission.id;
  }

  /** 与えた権限だけを持つロールを作る */
  async function createRole(permissions: readonly PermissionKey[]): Promise<string> {
    const role = await prisma.role.create({
      data: { name: `${MARK}-${randomUUID()}`, description: 'ua763', priority: 10 },
    });
    roleIds.push(role.id);
    for (const key of permissions) {
      await prisma.rolePermission.create({
        data: { roleId: role.id, permissionId: await permissionId(key) },
      });
    }
    return role.id;
  }

  /** 利用者を作り、与えたロールを割り当てる */
  async function createUser(label: string, roles: readonly string[]): Promise<TestUser> {
    const secret = authenticator.generateSecret();
    const id = randomUUID();
    const email = `${MARK}-${label}-${randomBytes(4).toString('hex')}@example.com`;
    await createTestUser(
      prisma,
      { id, email, displayName: `${MARK}-${label}`, passwordHash },
      { twoFactor: { secret } }
    );
    userIds.push(id);
    for (const roleId of roles) {
      await prisma.userRole.create({ data: { userId: id, roleId } });
    }
    const screenToken = await tokenService.generateAccessToken({
      userId: id,
      email,
      roles: roles.includes(adminRoleId) ? ['admin'] : [],
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
  async function connectViaOAuth(user: TestUser): Promise<string> {
    const jar = new PathCookieJar();
    const verifier = randomBytes(32).toString('base64url');
    const query = new URLSearchParams({
      client_id: CLIENT_ID,
      response_type: 'code',
      redirect_uri: REDIRECT_URI,
      resource: RESOURCE,
      scope: 'offline_access read',
      state: 'state-763',
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
    const token = tokens.body.access_token as string;
    expect((await whoami(token)).status).toBe(200);
    return token;
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

  function whoami(token: string) {
    return request(app).get(WHOAMI).set('Authorization', `Bearer ${token}`);
  }

  function connectionCount(userId: string): Promise<number> {
    return prisma.externalAppConnection.count({ where: { userId } });
  }

  function endedAudits(userId: string) {
    return prisma.auditLog.findMany({
      where: { action: 'CONNECTION_ENDED', targetId: userId },
      orderBy: { createdAt: 'asc' },
    });
  }

  function reasonsOf(userId: string): Promise<unknown[]> {
    return endedAudits(userId).then((audits) =>
      audits.map((audit) => (audit.metadata as Record<string, unknown>).reason)
    );
  }

  function auditsOf(action: string, targetId: string) {
    return prisma.auditLog.findMany({ where: { action, targetId } });
  }

  /** 経路の監査の期待値（実行者は管理者、送信元は経路の IP と UA） */
  async function expectPermissionLostAudits(
    userId: string,
    clients: readonly string[],
    source: { ipAddress: unknown; userAgent: string } = {
      ipAddress: expect.stringMatching(/127\.0\.0\.1|::1/),
      userAgent: USER_AGENT,
    }
  ): Promise<void> {
    const audits = await endedAudits(userId);
    expect(audits).toHaveLength(clients.length);
    for (const audit of audits) {
      expect(audit.targetType).toBe('User');
      expect(audit.targetId).toBe(userId);
      expect(audit.actorId).toBe(admin.id);
      const metadata = audit.metadata as Record<string, unknown>;
      expect(metadata.reason).toBe('PERMISSION_LOST');
      expect(metadata.ipAddress).toEqual(source.ipAddress);
      expect(metadata.userAgent).toEqual(source.userAgent);
      expect(metadata.scopes).toEqual(['read']);
    }
    expect(
      audits.map((audit) => (audit.metadata as Record<string, unknown>).clientId).sort()
    ).toEqual([...clients].sort());
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

  function removeRole(userId: string, roleId: string): Promise<request.Response> {
    return start(
      request(app)
        .delete(`/api/v1/users/${userId}/roles/${roleId}`)
        .set('Authorization', `Bearer ${admin.screenToken}`)
        .set('User-Agent', USER_AGENT)
    );
  }

  function removePermission(roleId: string, permission: string): Promise<request.Response> {
    return start(
      request(app)
        .delete(`/api/v1/roles/${roleId}/permissions/${permission}`)
        .set('Authorization', `Bearer ${admin.screenToken}`)
        .set('User-Agent', USER_AGENT)
    );
  }

  function deleteUser(userId: string): Promise<request.Response> {
    return start(
      request(app)
        .delete(`/api/v1/users/${userId}`)
        .set('Authorization', `Bearer ${admin.screenToken}`)
        .set('User-Agent', USER_AGENT)
    );
  }

  function deactivate(userId: string): Promise<request.Response> {
    return start(
      request(app)
        .post(`/api/v1/users/${userId}/deactivate`)
        .set('Authorization', `Bearer ${admin.screenToken}`)
        .set('User-Agent', USER_AGENT)
        .send({ reason: '権限の確認のため' })
    );
  }

  /** 2 つ目のアプリの接続の終了の監査で失敗させる（1 件目の消去は取引の中で済んでいる） */
  function failSecondEndedAudit(targetId: string): { count: () => number } {
    const original = AuditLogService.prototype.createLog;
    let ended = 0;
    vi.spyOn(AuditLogService.prototype, 'createLog').mockImplementation(async function (
      this: AuditLogServiceClass,
      input,
      tx
    ) {
      if (input.action === 'CONNECTION_ENDED' && input.targetId === targetId && ++ended === 2) {
        throw new Error('injected audit failure');
      }
      return original.call(this, input, tx);
    });
    return { count: () => ended };
  }

  describe('ロールの解除（DELETE /api/v1/users/:id/roles/:roleId）', () => {
    it('権限を与える唯一のロールを外すと全ての接続が終わり、トークンが直ちに 401 になり、送信元を監査に残す', async () => {
      const connectRole = await createRole([['external_app', 'connect']]);
      const otherRole = await createRole([['project', 'read']]);
      const target = await createUser('only-role', [connectRole, otherRole]);
      const token = await connectViaOAuth(target);
      await addFixtureConnection(target.id);
      const generationBefore = await generationOf(target.id);

      const response = await removeRole(target.id, connectRole);

      expect(response.status, JSON.stringify(response.body)).toBe(204);
      expect(await connectionCount(target.id)).toBe(0);
      const rejected = await whoami(token);
      expect(rejected.status).toBe(401);
      expect(rejected.headers['www-authenticate']).toContain('error="invalid_token"');
      expect(await generationOf(target.id)).toBe(generationBefore + 1);
      await expectPermissionLostAudits(target.id, [CLIENT_ID, OTHER_CLIENT_ID]);
      expect(await auditsOf('USER_ROLE_REVOKED', target.id)).toHaveLength(1);
      // 残したロールは外れていない
      expect(await prisma.userRole.count({ where: { userId: target.id } })).toBe(1);
    });

    it.each(CONNECT_FORMS)(
      '別のロールの %s:%s で権限が残る利用者の接続は残り、世代も進まない',
      async (resource, action) => {
        const removed = await createRole([['external_app', 'connect']]);
        const keeping = await createRole([[resource, action]]);
        const target = await createUser('keep-role', [removed, keeping]);
        const token = await connectViaOAuth(target);
        const generationBefore = await generationOf(target.id);

        const response = await removeRole(target.id, removed);

        expect(response.status, JSON.stringify(response.body)).toBe(204);
        expect(await connectionCount(target.id)).toBe(1);
        expect((await whoami(token)).status).toBe(200);
        expect(await generationOf(target.id)).toBe(generationBefore);
        expect(await endedAudits(target.id)).toHaveLength(0);
      }
    );

    it('権限を与えないロールを外しても、権限を持たない利用者の世代は進まない', async () => {
      const unrelated = await createRole([['project', 'read']]);
      const remaining = await createRole([['project', 'update']]);
      const target = await createUser('never-had', [unrelated, remaining]);
      const generationBefore = await generationOf(target.id);

      const response = await removeRole(target.id, unrelated);

      expect(response.status, JSON.stringify(response.body)).toBe(204);
      expect(await generationOf(target.id)).toBe(generationBefore);
      expect(await endedAudits(target.id)).toHaveLength(0);
    });

    it('接続の無い利用者が権限を失っても監査を残さず、開始済みの同意は失敗する', async () => {
      const connectRole = await createRole([['external_app', 'connect']]);
      const target = await createUser('no-connection', [connectRole]);
      const expected = await generationOf(target.id);

      const response = await removeRole(target.id, connectRole);

      expect(response.status, JSON.stringify(response.body)).toBe(204);
      expect(await endedAudits(target.id)).toHaveLength(0);
      expect(await generationOf(target.id)).toBe(expected + 1);
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

    it('権限が残る利用者の開始済みの同意は、ロールの解除の後も成功する', async () => {
      const removed = await createRole([['external_app', 'connect']]);
      const keeping = await createRole([['*', 'connect']]);
      const target = await createUser('stale-keep', [removed, keeping]);
      const expected = await generationOf(target.id);

      expect((await removeRole(target.id, removed)).status).toBe(204);

      await prisma.$transaction((tx) =>
        connectionService.createOrReplace(
          consentInput(target.id, OTHER_CLIENT_ID, `${MARK}-grant-${randomUUID()}`, expected),
          tx
        )
      );
      expect(await connectionCount(target.id)).toBe(1);
    });

    it('途中の失敗で取引を戻すと、ロールの割り当て・接続・世代が戻り、監査も残らない', async () => {
      const connectRole = await createRole([['external_app', 'connect']]);
      const target = await createUser('rollback', [connectRole]);
      const token = await connectViaOAuth(target);
      await addFixtureConnection(target.id);
      const generationBefore = await generationOf(target.id);
      const injected = failSecondEndedAudit(target.id);

      const response = await removeRole(target.id, connectRole);

      expect(injected.count()).toBe(2);
      expect(response.status).toBe(500);
      expect(await connectionCount(target.id)).toBe(2);
      expect(await generationOf(target.id)).toBe(generationBefore);
      expect(await endedAudits(target.id)).toHaveLength(0);
      expect(await auditsOf('USER_ROLE_REVOKED', target.id)).toHaveLength(0);
      expect(
        await prisma.userRole.count({ where: { userId: target.id, roleId: connectRole } })
      ).toBe(1);
      vi.restoreAllMocks();
      expect((await whoami(token)).status).toBe(200);
    });

    it('未コミットの同意を待ち、権限を失う利用者では同意のコミットの後にその接続も終了する', async () => {
      const connectRole = await createRole([['external_app', 'connect']]);
      const target = await createUser('pending-lose', [connectRole]);
      const expected = await generationOf(target.id);

      const { pending } = await holdTransaction(async (tx) => {
        await connectionService.createOrReplace(
          consentInput(target.id, OTHER_CLIENT_ID, `${MARK}-grant-${randomUUID()}`, expected),
          tx
        );
        const removing = removeRole(target.id, connectRole);
        await waitUntilBlocked(1);
        return { pending: { promise: removing } };
      });

      expect((await pending.promise).status).toBe(204);
      expect(await connectionCount(target.id)).toBe(0);
      await expectPermissionLostAudits(target.id, [OTHER_CLIENT_ID]);
    });

    it('未コミットの同意を待ち、権限が残る利用者では同意の接続が残る', async () => {
      const removed = await createRole([['external_app', 'connect']]);
      const keeping = await createRole([['external_app', '*']]);
      const target = await createUser('pending-keep', [removed, keeping]);
      const expected = await generationOf(target.id);

      const { pending } = await holdTransaction(async (tx) => {
        await connectionService.createOrReplace(
          consentInput(target.id, OTHER_CLIENT_ID, `${MARK}-grant-${randomUUID()}`, expected),
          tx
        );
        const removing = removeRole(target.id, removed);
        await waitUntilBlocked(1);
        return { pending: { promise: removing } };
      });

      expect((await pending.promise).status).toBe(204);
      expect(await connectionCount(target.id)).toBe(1);
      expect(await generationOf(target.id)).toBe(expected);
    });

    it('権限を与える 2 つのロールを同時に外すと、後の取引が先の変更を見て接続を終了する', async () => {
      const first = await createRole([['external_app', 'connect']]);
      const second = await createRole([['*', 'connect']]);
      const target = await createUser('concurrent-roles', [first, second]);
      await addFixtureConnection(target.id);

      // 利用者の行を共有でロックし、2 つの解除を同時に待たせてから放す
      const { pending } = await holdTransaction(async (tx) => {
        await tx.$queryRaw`SELECT 1 FROM "users" WHERE "id" = ${target.id} FOR SHARE`;
        const a = removeRole(target.id, first);
        const b = removeRole(target.id, second);
        await waitUntilBlocked(2);
        return { pending: { promise: Promise.all([a, b]) } };
      });

      const responses = await pending.promise;
      expect(responses.map((response) => response.status)).toEqual([204, 204]);
      expect(await prisma.userRole.count({ where: { userId: target.id } })).toBe(0);
      expect(await connectionCount(target.id)).toBe(0);
      await expectPermissionLostAudits(target.id, [OTHER_CLIENT_ID]);
    });

    it('利用者の削除と同時に進んでもデッドロックせず、両方が成功する', async () => {
      const connectRole = await createRole([['external_app', 'connect']]);
      const otherRole = await createRole([['project', 'read']]);
      const target = await createUser('with-delete', [connectRole, otherRole]);
      await addFixtureConnection(target.id);

      // 監査の表への書き込みを止め、解除（紐付けの削除の後の監査）と削除（利用者の行のロックの後の監査）を
      // 同時に止めてから放す。解除が紐付けを消してから利用者の行を待つと、利用者の行を持つ削除の連鎖が
      // その紐付けを待ち、互いに待つ
      const { pending } = await holdTransaction(async (tx) => {
        await tx.$executeRaw`LOCK TABLE "audit_logs" IN SHARE MODE`;
        const removing = removeRole(target.id, connectRole);
        await waitUntilBlocked(1);
        const deleting = deleteUser(target.id);
        await waitUntilBlocked(2);
        return { pending: { promise: Promise.all([removing, deleting]) } };
      });

      const [removed, deleted] = await pending.promise;
      expect(removed.status, JSON.stringify(removed.body)).toBe(204);
      expect(deleted.status, JSON.stringify(deleted.body)).toBe(204);
      expect(await prisma.user.findUnique({ where: { id: target.id } })).toBeNull();
      expect(await reasonsOf(target.id)).toEqual(['PERMISSION_LOST']);
    });

    it('無効化と同時に進んでもデッドロックせず、両方が成功して接続が残らない', async () => {
      const connectRole = await createRole([['external_app', 'connect']]);
      const target = await createUser('with-deactivate', [connectRole]);
      await addFixtureConnection(target.id);

      const { pending } = await holdTransaction(async (tx) => {
        await tx.$queryRaw`SELECT 1 FROM "users" WHERE "id" = ${target.id} FOR SHARE`;
        const removing = removeRole(target.id, connectRole);
        await waitUntilBlocked(1);
        const deactivating = deactivate(target.id);
        await waitUntilBlocked(2);
        return { pending: { promise: Promise.all([removing, deactivating]) } };
      });

      const [removed, deactivated] = await pending.promise;
      expect(removed.status, JSON.stringify(removed.body)).toBe(204);
      expect(deactivated.status, JSON.stringify(deactivated.body)).toBe(204);
      expect(await connectionCount(target.id)).toBe(0);
      expect(await reasonsOf(target.id)).toEqual(['PERMISSION_LOST']);
    });

    it('全デバイスのログアウトと同時に進んでもデッドロックせず、両方が成功する', async () => {
      const connectRole = await createRole([['external_app', 'connect']]);
      const target = await createUser('with-logout-all', [connectRole]);
      await addFixtureConnection(target.id);
      const { lockUserRefreshTokens } = await import('../../utils/refresh-token-lock.js');

      // 全デバイスのログアウトをリフレッシュトークンの取引ロックで待たせたまま、解除を最後まで進める
      // （解除はリフレッシュトークンの取引ロックを取らず、ログアウトの取る users の行もまだ取られていない）
      const { pending, removed } = await holdTransaction(async (tx) => {
        await lockUserRefreshTokens(tx, target.id);
        const loggingOut = start(
          request(app)
            .post('/api/v1/auth/logout-all')
            .set('Authorization', `Bearer ${target.screenToken}`)
            .set('User-Agent', USER_AGENT)
        );
        await waitUntilBlocked(1);
        const response = await removeRole(target.id, connectRole);
        return { pending: { promise: loggingOut }, removed: response };
      });

      expect(removed.status, JSON.stringify(removed.body)).toBe(204);
      const loggedOut = await pending.promise;
      expect(loggedOut.status, JSON.stringify(loggedOut.body)).toBe(200);
      expect(await connectionCount(target.id)).toBe(0);
      expect(await reasonsOf(target.id)).toEqual(['PERMISSION_LOST']);
    });
  });

  describe('ロールの権限の解除（DELETE /api/v1/roles/:id/permissions/:permissionId）', () => {
    it.each(CONNECT_FORMS)(
      '%s:%s を外すと、権限を失う保有者の接続だけが終わり、別のロールやワイルドカードで残る保有者と他の利用者は変わらない',
      async (resource, action) => {
        const role = await createRole([
          [resource, action],
          ['project', 'read'],
        ]);
        const viaRole = await createRole([['external_app', 'connect']]);
        const viaWildcard = await createRole([['*', 'connect']]);
        const losing = await createUser('perm-lose', [role]);
        const keepByRole = await createUser('perm-keep-role', [role, viaRole]);
        const keepByWildcard = await createUser('perm-keep-wild', [role, viaWildcard]);
        const noConnection = await createUser('perm-no-conn', [role]);
        const bystander = await createUser('perm-bystander', [viaRole]);
        const losingToken = await connectViaOAuth(losing);
        await addFixtureConnection(losing.id);
        const keepingToken = await connectViaOAuth(keepByRole);
        await addFixtureConnection(keepByWildcard.id);
        await addFixtureConnection(bystander.id);
        const before = new Map<string, number>();
        for (const user of [losing, keepByRole, keepByWildcard, noConnection, bystander]) {
          before.set(user.id, await generationOf(user.id));
        }

        const response = await removePermission(role, await permissionId([resource, action]));

        expect(response.status, JSON.stringify(response.body)).toBe(204);
        expect(await connectionCount(losing.id)).toBe(0);
        expect((await whoami(losingToken)).status).toBe(401);
        await expectPermissionLostAudits(losing.id, [CLIENT_ID, OTHER_CLIENT_ID]);
        expect(await generationOf(losing.id)).toBe(before.get(losing.id)! + 1);
        // 接続の無い保有者も権限を失ったので世代は進むが、接続の終了の監査は無い
        expect(await generationOf(noConnection.id)).toBe(before.get(noConnection.id)! + 1);
        expect(await endedAudits(noConnection.id)).toHaveLength(0);
        // 権限が残る保有者と保有者でない利用者は変わらない
        expect((await whoami(keepingToken)).status).toBe(200);
        for (const user of [keepByRole, keepByWildcard, bystander]) {
          expect(await connectionCount(user.id)).toBe(1);
          expect(await generationOf(user.id)).toBe(before.get(user.id));
          expect(await endedAudits(user.id)).toHaveLength(0);
        }
      }
    );

    it('権限「外部アプリの接続」を包含しない権限を外しても、保有者の接続と世代は変わらない', async () => {
      const role = await createRole([
        ['external_app', 'connect'],
        ['project', 'read'],
      ]);
      const holder = await createUser('perm-unrelated', [role]);
      const neverHad = await createUser('perm-unrelated-none', [
        await createRole([['project', 'read']]),
      ]);
      await addFixtureConnection(holder.id);
      const holderBefore = await generationOf(holder.id);
      const neverHadBefore = await generationOf(neverHad.id);

      const response = await removePermission(role, await permissionId(['project', 'read']));

      expect(response.status, JSON.stringify(response.body)).toBe(204);
      expect(await connectionCount(holder.id)).toBe(1);
      expect(await generationOf(holder.id)).toBe(holderBefore);
      expect(await generationOf(neverHad.id)).toBe(neverHadBefore);
    });

    it('admin ロールの *:* は外せず、システム管理者の接続は残る', async () => {
      const otherAdmin = await createUser('admin-wildcard', [adminRoleId]);
      await addFixtureConnection(otherAdmin.id);
      const generationBefore = await generationOf(otherAdmin.id);

      const response = await removePermission(adminRoleId, await permissionId(['*', '*']));

      expect(response.status).toBe(400);
      expect(response.body.code).toBe('ADMIN_WILDCARD_PROTECTED');
      expect(await connectionCount(otherAdmin.id)).toBe(1);
      expect(await generationOf(otherAdmin.id)).toBe(generationBefore);
    });

    it('途中の失敗で取引を戻すと、ロールの権限・接続・世代が戻り、監査も残らない', async () => {
      const role = await createRole([['external_app', 'connect']]);
      const target = await createUser('perm-rollback', [role]);
      await addFixtureConnection(target.id);
      const token = await connectViaOAuth(target);
      const generationBefore = await generationOf(target.id);
      const connectId = await permissionId(['external_app', 'connect']);
      const injected = failSecondEndedAudit(target.id);

      const response = await removePermission(role, connectId);

      expect(injected.count()).toBe(2);
      expect(response.status).toBe(500);
      expect(await connectionCount(target.id)).toBe(2);
      expect(await generationOf(target.id)).toBe(generationBefore);
      expect(await endedAudits(target.id)).toHaveLength(0);
      expect(await auditsOf('PERMISSION_REVOKED', role)).toHaveLength(0);
      expect(
        await prisma.rolePermission.count({ where: { roleId: role, permissionId: connectId } })
      ).toBe(1);
      vi.restoreAllMocks();
      expect((await whoami(token)).status).toBe(200);
    });

    it('未コミットの同意を待ち、権限を失う保有者の接続は終わり、権限が残る保有者の接続は残る', async () => {
      const role = await createRole([['external_app', 'connect']]);
      const keepRole = await createRole([['external_app', 'connect']]);
      const losing = await createUser('perm-pending-lose', [role]);
      const keeping = await createUser('perm-pending-keep', [role, keepRole]);
      const losingExpected = await generationOf(losing.id);
      const keepingExpected = await generationOf(keeping.id);
      const connectId = await permissionId(['external_app', 'connect']);

      const { pending } = await holdTransaction(async (tx) => {
        await connectionService.createOrReplace(
          consentInput(losing.id, OTHER_CLIENT_ID, `${MARK}-grant-${randomUUID()}`, losingExpected),
          tx
        );
        await connectionService.createOrReplace(
          consentInput(
            keeping.id,
            OTHER_CLIENT_ID,
            `${MARK}-grant-${randomUUID()}`,
            keepingExpected
          ),
          tx
        );
        const removing = removePermission(role, connectId);
        await waitUntilBlocked(1);
        return { pending: { promise: removing } };
      });

      expect((await pending.promise).status).toBe(204);
      expect(await connectionCount(losing.id)).toBe(0);
      await expectPermissionLostAudits(losing.id, [OTHER_CLIENT_ID]);
      expect(await connectionCount(keeping.id)).toBe(1);
      expect(await generationOf(keeping.id)).toBe(keepingExpected);
    });

    it('同じ利用者のロールの解除と同時に進むと、後の取引が先の変更を見て接続を終了する', async () => {
      const role = await createRole([['external_app', 'connect']]);
      const otherRole = await createRole([['external_app', 'connect']]);
      const target = await createUser('perm-concurrent', [role, otherRole]);
      await addFixtureConnection(target.id);
      const connectId = await permissionId(['external_app', 'connect']);

      // 利用者の行を共有でロックし、権限の解除（判定の前）とロールの解除を同時に待たせてから放す。
      // どちらも相手の変更を見ずに判定すると「別のロールで残る」とみなし、接続が残る
      const { pending } = await holdTransaction(async (tx) => {
        await tx.$queryRaw`SELECT 1 FROM "users" WHERE "id" = ${target.id} FOR SHARE`;
        const a = removePermission(role, connectId);
        await waitUntilBlocked(1);
        const b = removeRole(target.id, otherRole);
        await waitUntilBlocked(2);
        return { pending: { promise: Promise.all([a, b]) } };
      });

      const responses = await pending.promise;
      expect(responses.map((response) => response.status)).toEqual([204, 204]);
      expect(await connectionCount(target.id)).toBe(0);
      await expectPermissionLostAudits(target.id, [OTHER_CLIENT_ID]);
    });

    it('先に待ったロールの解除のコミットの後に、権限の解除がロックの後の値で判定して接続を終了する', async () => {
      const role = await createRole([['external_app', 'connect']]);
      const otherRole = await createRole([['external_app', 'connect']]);
      const target = await createUser('perm-concurrent-late', [role, otherRole]);
      await addFixtureConnection(target.id);
      const connectId = await permissionId(['external_app', 'connect']);

      // ロールの解除を先に待たせ、権限の解除は判定の前（利用者のロック）で待たせる。ロールの解除は権限の解除の
      // 未コミットの変更を見ずに「残る」と判定するので、権限の解除がロックより前に読んだ値で判定すると、
      // 別のロール（解除済み）で残るとみなして接続が残る
      const { pending } = await holdTransaction(async (tx) => {
        await tx.$queryRaw`SELECT 1 FROM "users" WHERE "id" = ${target.id} FOR SHARE`;
        const b = removeRole(target.id, otherRole);
        await waitUntilBlocked(1);
        const a = removePermission(role, connectId);
        await waitUntilBlocked(2);
        return { pending: { promise: Promise.all([b, a]) } };
      });

      const responses = await pending.promise;
      expect(responses.map((response) => response.status)).toEqual([204, 204]);
      expect(await connectionCount(target.id)).toBe(0);
      await expectPermissionLostAudits(target.id, [OTHER_CLIENT_ID]);
    });

    it('保有者の削除と同時に進んでもデッドロックせず、両方が成功する', async () => {
      const role = await createRole([['external_app', 'connect']]);
      const target = await createUser('perm-with-delete', [role]);
      const otherHolder = await createUser('perm-with-delete-other', [role]);
      await addFixtureConnection(target.id);
      await addFixtureConnection(otherHolder.id);
      const connectId = await permissionId(['external_app', 'connect']);

      const { pending } = await holdTransaction(async (tx) => {
        await tx.$executeRaw`LOCK TABLE "audit_logs" IN SHARE MODE`;
        const removing = removePermission(role, connectId);
        await waitUntilBlocked(1);
        const deleting = deleteUser(target.id);
        await waitUntilBlocked(2);
        return { pending: { promise: Promise.all([removing, deleting]) } };
      });

      const [removed, deleted] = await pending.promise;
      expect(removed.status, JSON.stringify(removed.body)).toBe(204);
      expect(deleted.status, JSON.stringify(deleted.body)).toBe(204);
      expect(await prisma.user.findUnique({ where: { id: target.id } })).toBeNull();
      expect(await reasonsOf(target.id)).toHaveLength(1);
      expect(await connectionCount(otherHolder.id)).toBe(0);
      await expectPermissionLostAudits(otherHolder.id, [OTHER_CLIENT_ID]);
    });

    it('保有者の無効化と同時に進んでもデッドロックせず、両方が成功する', async () => {
      const role = await createRole([['external_app', 'connect']]);
      const target = await createUser('perm-with-deactivate', [role]);
      await addFixtureConnection(target.id);
      const connectId = await permissionId(['external_app', 'connect']);

      const { pending } = await holdTransaction(async (tx) => {
        await tx.$executeRaw`LOCK TABLE "audit_logs" IN SHARE MODE`;
        const removing = removePermission(role, connectId);
        await waitUntilBlocked(1);
        const deactivating = deactivate(target.id);
        await waitUntilBlocked(2);
        return { pending: { promise: Promise.all([removing, deactivating]) } };
      });

      const [removed, deactivated] = await pending.promise;
      expect(removed.status, JSON.stringify(removed.body)).toBe(204);
      expect(deactivated.status, JSON.stringify(deactivated.body)).toBe(204);
      expect(await connectionCount(target.id)).toBe(0);
      expect(await reasonsOf(target.id)).toHaveLength(1);
    });
  });

  describe('一括の解除（サービスの一括の経路）', () => {
    it('ロールの権限を一括で外して置き換えると、権限を失う保有者の接続が終わり、送信元を監査に残す', async () => {
      const role = await createRole([
        ['external_app', 'connect'],
        ['external_app', '*'],
        ['project', 'read'],
      ]);
      const losing = await createUser('bulk-perm-lose', [role]);
      const keeping = await createUser('bulk-perm-keep', [
        role,
        await createRole([['*', 'connect']]),
      ]);
      await addFixtureConnection(losing.id);
      await addFixtureConnection(keeping.id);

      const removed = await rolePermissionService.removePermissionsFromRole(
        role,
        [
          await permissionId(['external_app', 'connect']),
          await permissionId(['external_app', '*']),
        ],
        admin.id,
        SERVICE_SOURCE
      );
      const added = await rolePermissionService.addPermissionsToRole(
        role,
        [await permissionId(['project', 'update'])],
        admin.id
      );

      expect(removed.ok).toBe(true);
      expect(added.ok).toBe(true);
      expect(await connectionCount(losing.id)).toBe(0);
      await expectPermissionLostAudits(losing.id, [OTHER_CLIENT_ID], SERVICE_SOURCE);
      expect(await connectionCount(keeping.id)).toBe(1);
    });

    it('利用者のロールを一括で外して置き換えると接続が終わり、別のロールで残る利用者は変わらない', async () => {
      const first = await createRole([['external_app', 'connect']]);
      const second = await createRole([['external_app', '*']]);
      const replacement = await createRole([['project', 'read']]);
      const losing = await createUser('bulk-role-lose', [first, second]);
      const keeping = await createUser('bulk-role-keep', [
        first,
        second,
        await createRole([['*', '*']]),
      ]);
      await addFixtureConnection(losing.id);
      await addFixtureConnection(keeping.id);

      for (const user of [losing, keeping]) {
        const removed = await userRoleService.removeRolesFromUser(
          user.id,
          [first, second],
          admin.id,
          undefined,
          SERVICE_SOURCE
        );
        expect(removed.ok).toBe(true);
        expect((await userRoleService.addRolesToUser(user.id, [replacement], admin.id)).ok).toBe(
          true
        );
      }

      expect(await connectionCount(losing.id)).toBe(0);
      await expectPermissionLostAudits(losing.id, [OTHER_CLIENT_ID], SERVICE_SOURCE);
      expect(await connectionCount(keeping.id)).toBe(1);
      expect(await endedAudits(keeping.id)).toHaveLength(0);
    });

    it('一括の解除の途中で失敗すると、全ての解除と失効が戻る', async () => {
      const first = await createRole([['external_app', 'connect']]);
      const second = await createRole([['project', 'read']]);
      const target = await createUser('bulk-role-fail', [first, second]);
      await addFixtureConnection(target.id);

      // 存在しない紐付けを含めて全体を戻す
      const result = await userRoleService.removeRolesFromUser(
        target.id,
        [first, await createRole([])],
        admin.id,
        undefined,
        SERVICE_SOURCE
      );

      expect(result).toEqual({ ok: false, error: { type: 'ASSIGNMENT_NOT_FOUND' } });
      expect(await prisma.userRole.count({ where: { userId: target.id } })).toBe(2);
      expect(await connectionCount(target.id)).toBe(1);
      expect(await endedAudits(target.id)).toHaveLength(0);
    });
  });

  describe('ロールの削除（DELETE /api/v1/roles/:id）', () => {
    it('使用中のロールは消せず、保有者の接続と世代は変わらない', async () => {
      const role = await createRole([['external_app', 'connect']]);
      const holder = await createUser('delete-role-holder', [role]);
      await addFixtureConnection(holder.id);
      const generationBefore = await generationOf(holder.id);

      const response = await start(
        request(app)
          .delete(`/api/v1/roles/${role}`)
          .set('Authorization', `Bearer ${admin.screenToken}`)
      );

      expect(response.status).toBe(400);
      expect(response.body.code).toBe('ROLE_IN_USE');
      expect(await connectionCount(holder.id)).toBe(1);
      expect(await generationOf(holder.id)).toBe(generationBefore);
    });
  });
});
