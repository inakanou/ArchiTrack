/**
 * @fileoverview 権限キャッシュの無効化の確かさの統合検証（タスク37.2）
 *
 * 本物のアプリ（app.ts のルート・authenticate・requirePermission・共有の RBACService・
 * RolePermissionService・UserRoleService）と、テスト用の実データベース・実 Redis を通す。
 * Redis は redis.ts の initRedis で初期化した本物のクライアント（REDIS_URL）を使い、
 * 接続できないときは前提の確認で赤くなる（読み飛ばさない）。
 *
 * 確かめること:
 * - (i) 権限の確認が DB から権限を読んだ後、キャッシュへ書き込む前に、別の操作のコミットと無効化が
 *   割り込んでも、古い権限は書き戻されず、次の確認は新しい権限で判定される。割り込みは、共有の
 *   PrismaClient の権限の問い合わせ（`user.findUnique` の権限の形のもの）を一度だけ包み、
 *   本物の結果を得た後・返す前に変更の API を呼んで決定的に起こす。ユーザー単位の無効化
 *   （ロールの割り当ての解除）とロール単位の無効化（ロールからの権限の削除）の両方で確かめる
 * - (ii) Redis のクライアントが `ready` でない（接続は確立したが応答の無いサーバー。ioredis は
 *   コマンドをオフラインキューに積んで待つ）とき、無効化は変更の API の応答を待たせず、
 *   `err` 付きの警告ログを残す。障害の前のエントリは TTL の範囲で残る（design.md の「無効化の限界」）
 * - (iii) システム管理者ロールの割り当て・解除のアラートの送信が投げても、コミット済みの変更は成功として
 *   返り、無効化はアラートの前に行われ、次の確認は新しい権限で判定される。アラートは NODE_ENV=test で
 *   抑制されるため、この検証の間だけ NODE_ENV を development にして本物の経路へ到達させる
 *   （HTTP を通すと CSRF の検査が NODE_ENV で変わるため、サービスを直接呼ぶ）
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import net from 'node:net';
import request from 'supertest';
import Redis from 'ioredis';
import { validateEnv } from '../../config/env.js';
import type { PrismaClient } from '../../generated/prisma/client.js';

// 環境変数を初期化（トークン発行の鍵を読むため、アプリとサービスのインポート前に実行）
validateEnv();

import app from '../../app.js';
import getPrismaClient from '../../db.js';
import redis, { initRedis } from '../../redis.js';
import tokenService from '../../services/token.service.js';
import { getSharedRBACService } from '../../services/rbac.service.js';
import { UserRoleService } from '../../services/user-role.service.js';
import { AuditLogService } from '../../services/audit-log.service.js';
import type { EmailService } from '../../services/email.service.js';
import logger from '../../utils/logger.js';

const MARK = 'test-ua372-rbac-inval';

/** RBACService の権限キャッシュのキー */
function cacheKey(userId: string): string {
  return `rbac:permissions:${userId}`;
}

/** RBACService の権限キャッシュの TTL（秒） */
const PERMISSION_CACHE_TTL_SECONDS = 15 * 60;

/** 無効化が変更の API を待たせないことの上限（応答が無い Redis を待てばこれを超えて赤になる） */
const PROMPT_RESPONSE_DEADLINE_MS = 5000;

/** 権限の確認（RBACService.getUserPermissions）が発行する問い合わせの形か */
function isPermissionQuery(args: unknown, userId: string): boolean {
  const a = args as {
    where?: { id?: string };
    select?: { userRoles?: { select?: { role?: unknown } } };
  };
  return a?.where?.id === userId && a?.select?.userRoles?.select?.role !== undefined;
}

describe('権限キャッシュの無効化の確かさ（統合・実 Redis・実 DB）', () => {
  let prisma: PrismaClient;
  let redisClient: Redis;
  let roleReadPermissionId: string;
  let readerRoleId: string;
  let readerUserId: string;
  let readerToken: string;
  let adminUserId: string;
  let adminToken: string;
  let systemAdminRoleId: string;

  async function cleanup(): Promise<void> {
    const users = await prisma.user.findMany({
      where: { email: { contains: MARK } },
      select: { id: true },
    });
    const userIds = users.map((u) => u.id);
    if (userIds.length > 0) {
      await redisClient.del(...userIds.map(cacheKey));
    }
    await prisma.auditLog.deleteMany({
      where: { OR: [{ actorId: { in: userIds } }, { targetId: { in: userIds } }] },
    });
    await prisma.userRole.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.rolePermission.deleteMany({ where: { role: { name: { startsWith: MARK } } } });
    await prisma.role.deleteMany({ where: { name: { startsWith: MARK } } });
  }

  async function ensurePermission(resource: string, action: string): Promise<string> {
    const permission = await prisma.permission.upsert({
      where: { resource_action: { resource, action } },
      update: {},
      create: { resource, action, description: `${resource}:${action}` },
    });
    return permission.id;
  }

  async function createUser(
    suffix: string,
    roleId: string
  ): Promise<{ id: string; email: string; token: string }> {
    const email = `${MARK}-${suffix}@example.com`;
    const user = await prisma.user.create({
      data: { email, displayName: `${MARK}-${suffix}`, passwordHash: 'not-used' },
    });
    await prisma.userRole.create({ data: { userId: user.id, roleId } });
    const token = await tokenService.generateAccessToken({ userId: user.id, email, roles: [] });
    return { id: user.id, email, token };
  }

  /** 読み手（role:read だけを持つ）としてロールの一覧を要求する */
  function getRolesAsReader(): request.Test {
    return request(app).get('/api/v1/roles').set('Authorization', `Bearer ${readerToken}`);
  }

  /** 読み手としてユーザーの一覧を要求する（user:read が要る。読み手のロールには無い） */
  function getUsersAsReader(): request.Test {
    return request(app).get('/api/v1/users').set('Authorization', `Bearer ${readerToken}`);
  }

  /**
   * 共有の PrismaClient の、読み手の権限の問い合わせを一度だけ包む。本物の結果を得た後・返す前に
   * interleave を実行する（DB の読み出しとキャッシュへの書き込みの間に変更と無効化を割り込ませる）
   */
  function interleaveAfterPermissionRead(interleave: () => Promise<void>): {
    ran: () => boolean;
  } {
    const original = prisma.user.findUnique.bind(prisma.user);
    let done = false;
    vi.spyOn(prisma.user, 'findUnique').mockImplementation(((args: unknown) => {
      if (done || !isPermissionQuery(args, readerUserId)) {
        return original(args as Parameters<typeof original>[0]);
      }
      done = true;
      return (async () => {
        const stale = await original(args as Parameters<typeof original>[0]);
        await interleave();
        return stale;
      })();
    }) as unknown as typeof prisma.user.findUnique);
    return { ran: () => done };
  }

  beforeAll(async () => {
    prisma = getPrismaClient();
    await initRedis();
    const client = redis.getClient();
    // 前提: 実 Redis に接続できていること（できなければ赤にする。読み飛ばさない）
    expect(client, 'REDIS_URL の Redis クライアントが初期化されていない').not.toBeNull();
    expect(client!.status, '実 Redis に接続できていない').toBe('ready');
    redisClient = client!;

    // 前提: システム管理者ロール（シード）が *:* を持って存在すること
    const systemAdminRole = await prisma.role.findUnique({ where: { name: 'admin' } });
    expect(systemAdminRole, 'シードのシステム管理者ロール（admin）が無い').not.toBeNull();
    systemAdminRoleId = systemAdminRole!.id;

    await cleanup();

    roleReadPermissionId = await ensurePermission('role', 'read');
    const roleUpdatePermissionId = await ensurePermission('role', 'update');
    const userUpdatePermissionId = await ensurePermission('user', 'update');

    const adminRole = await prisma.role.create({
      data: { name: `${MARK}-admin`, description: MARK, priority: 0, isSystem: false },
    });
    await prisma.rolePermission.createMany({
      data: [roleReadPermissionId, roleUpdatePermissionId, userUpdatePermissionId].map(
        (permissionId) => ({ roleId: adminRole.id, permissionId })
      ),
    });
    const admin = await createUser('admin', adminRole.id);
    adminUserId = admin.id;
    adminToken = admin.token;
  });

  beforeEach(async () => {
    // 読み手は各検証で作り直す（role:read だけを持つロールと、それを割り当てたユーザー）
    const readers = await prisma.user.findMany({
      where: { email: { contains: `${MARK}-reader` } },
      select: { id: true },
    });
    const readerIds = readers.map((u) => u.id);
    if (readerIds.length > 0) {
      await redisClient.del(...readerIds.map(cacheKey));
    }
    await prisma.auditLog.deleteMany({
      where: { OR: [{ actorId: { in: readerIds } }, { targetId: { in: readerIds } }] },
    });
    await prisma.userRole.deleteMany({ where: { userId: { in: readerIds } } });
    await prisma.user.deleteMany({ where: { id: { in: readerIds } } });
    await prisma.rolePermission.deleteMany({ where: { role: { name: `${MARK}-reader` } } });
    await prisma.role.deleteMany({ where: { name: `${MARK}-reader` } });

    const readerRole = await prisma.role.create({
      data: { name: `${MARK}-reader`, description: MARK, priority: 0, isSystem: false },
    });
    readerRoleId = readerRole.id;
    await prisma.rolePermission.create({
      data: { roleId: readerRoleId, permissionId: roleReadPermissionId },
    });
    const reader = await createUser(`reader-${Date.now()}`, readerRoleId);
    readerUserId = reader.id;
    readerToken = reader.token;

    vi.mocked(logger.warn).mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await cleanup();
    await redis.disconnect();
  });

  describe('(i) 読み込みと無効化の競合', () => {
    /**
     * @requirement user-authentication/REQ-21.8: ユーザーのロールの変更で無効化したキャッシュへ、変更の前に読んだ権限を書き戻さない
     */
    it('権限の DB の読み出しと書き込みの間にロールの割り当ての解除と無効化が入っても、古い権限を書き戻さず次の確認は拒否になる', async () => {
      const revokeStatuses: number[] = [];
      const hook = interleaveAfterPermissionRead(async () => {
        const revoke = await request(app)
          .delete(`/api/v1/users/${readerUserId}/roles/${readerRoleId}`)
          .set('Authorization', `Bearer ${adminToken}`);
        revokeStatuses.push(revoke.status);
      });

      // 割り込まれた確認: 変更の前に読んだ権限で判定する（この要求そのものは許可）
      const raced = await getRolesAsReader();
      expect(hook.ran()).toBe(true);
      expect(revokeStatuses).toEqual([204]);
      expect(raced.status).toBe(200);

      // 無効化の後に古い権限が書き戻されていない
      expect(await redisClient.get(cacheKey(readerUserId))).toBeNull();

      // 次の確認は新しい権限（ロールなし）で判定される
      vi.restoreAllMocks();
      expect((await getRolesAsReader()).status).toBe(403);
    });

    /**
     * @requirement user-authentication/REQ-21.8: ロールの権限の変更で無効化したキャッシュへ、変更の前に読んだ権限を書き戻さない
     */
    it('権限の DB の読み出しと書き込みの間にロールからの権限の削除と無効化が入っても、古い権限を書き戻さず次の確認は拒否になる', async () => {
      const revokeStatuses: number[] = [];
      const hook = interleaveAfterPermissionRead(async () => {
        const revoke = await request(app)
          .delete(`/api/v1/roles/${readerRoleId}/permissions/${roleReadPermissionId}`)
          .set('Authorization', `Bearer ${adminToken}`);
        revokeStatuses.push(revoke.status);
      });

      const raced = await getRolesAsReader();
      expect(hook.ran()).toBe(true);
      expect(revokeStatuses).toEqual([204]);
      expect(raced.status).toBe(200);

      expect(await redisClient.get(cacheKey(readerUserId))).toBeNull();

      vi.restoreAllMocks();
      expect((await getRolesAsReader()).status).toBe(403);
    });

    it('割り込みが無いときは、DB から読んだ権限を TTL 付きでキャッシュへ書き込む（対照）', async () => {
      expect((await getRolesAsReader()).status).toBe(200);
      const cached = await redisClient.get(cacheKey(readerUserId));
      expect(cached).not.toBeNull();
      expect(JSON.parse(cached!)).toEqual([
        expect.objectContaining({ id: roleReadPermissionId, resource: 'role', action: 'read' }),
      ]);
      const ttl = await redisClient.ttl(cacheKey(readerUserId));
      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(PERMISSION_CACHE_TTL_SECONDS);

      // 無効化の後の最初の確認も書き込む（世代が進んだ後の読み出しは書き込みを妨げない）
      const revoke = await request(app)
        .delete(`/api/v1/roles/${readerRoleId}/permissions/${roleReadPermissionId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(revoke.status).toBe(204);
      expect(await redisClient.get(cacheKey(readerUserId))).toBeNull();
      expect((await getRolesAsReader()).status).toBe(403);
      expect(await redisClient.get(cacheKey(readerUserId))).toBe('[]');
    });
  });

  describe('(ii) Redis が ready でないときの無効化', () => {
    let blackHole: net.Server;
    let blackHoleSockets: net.Socket[];
    let notReadyClient: Redis;

    beforeEach(async () => {
      // 接続は受け付けるが一切応答しない TCP サーバー。ioredis は接続の後の ready の確認（INFO）の
      // 応答を待ち続けるため status は 'connect' のまま、コマンドはオフラインキューに積まれて待つ
      blackHoleSockets = [];
      blackHole = net.createServer((socket) => {
        blackHoleSockets.push(socket);
        socket.on('error', () => undefined);
      });
      await new Promise<void>((resolve) => blackHole.listen(0, '127.0.0.1', () => resolve()));
      const { port } = blackHole.address() as net.AddressInfo;
      // redis.ts の createRedisClient と同じオプション
      notReadyClient = new Redis(`redis://127.0.0.1:${port}`, {
        maxRetriesPerRequest: 3,
        retryStrategy: (times: number) => Math.min(times * 50, 2000),
        lazyConnect: true,
      });
      notReadyClient.on('error', () => undefined);
      const connected = new Promise<void>((resolve) => notReadyClient.once('connect', resolve));
      void notReadyClient.connect().catch(() => undefined);
      await connected;
      expect(notReadyClient.status).not.toBe('ready');
    });

    afterEach(async () => {
      notReadyClient.disconnect();
      for (const socket of blackHoleSockets) {
        socket.destroy();
      }
      await new Promise<void>((resolve) => blackHole.close(() => resolve()));
    });

    /** 読み手の権限をキャッシュへ置く（本物のクライアントで） */
    async function primeReaderCache(): Promise<void> {
      expect((await getRolesAsReader()).status).toBe(200);
      expect(await redisClient.get(cacheKey(readerUserId))).not.toBeNull();
    }

    /** アプリが使う Redis クライアントを ready でないクライアントへ差し替える */
    function useNotReadyRedis(): void {
      vi.spyOn(redis, 'getClient').mockReturnValue(notReadyClient);
    }

    /**
     * @requirement user-authentication/REQ-24.7: キャッシュ障害で無効化を行えないとき、変更を待たせず警告ログを記録する
     */
    it('ユーザーのロールの割り当ての解除は、無効化で応答を待たせず、err 付きの警告ログを残す', async () => {
      await primeReaderCache();
      useNotReadyRedis();

      const startedAt = performance.now();
      const revoke = await request(app)
        .delete(`/api/v1/users/${readerUserId}/roles/${readerRoleId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .timeout({ deadline: PROMPT_RESPONSE_DEADLINE_MS });
      const elapsedMs = performance.now() - startedAt;

      expect(revoke.status).toBe(204);
      expect(elapsedMs).toBeLessThan(PROMPT_RESPONSE_DEADLINE_MS);
      // 無効化のコマンドを応答の無い接続へ積んでいない
      expect(notReadyClient.status).not.toBe('ready');

      const warnCalls = vi
        .mocked(logger.warn)
        .mock.calls.filter(([, message]) => message === 'Failed to invalidate permission cache');
      expect(warnCalls).toHaveLength(1);
      const [fields] = warnCalls[0]!;
      expect(fields).toEqual({ err: expect.any(Error), userId: readerUserId });
      expect((fields as { err: Error }).err.message).toContain('Redis connection is not ready');

      // 障害の前のエントリは TTL の範囲で残る（design.md の「無効化の限界」）
      const ttl = await redisClient.ttl(cacheKey(readerUserId));
      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(PERMISSION_CACHE_TTL_SECONDS);
    });

    /**
     * @requirement user-authentication/REQ-24.7: キャッシュ障害で無効化を行えないとき、変更を待たせず警告ログを記録する
     */
    it('ロールからの権限の削除は、ロール単位の無効化で応答を待たせず、err 付きの警告ログを残す', async () => {
      await primeReaderCache();
      useNotReadyRedis();

      const startedAt = performance.now();
      const revoke = await request(app)
        .delete(`/api/v1/roles/${readerRoleId}/permissions/${roleReadPermissionId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .timeout({ deadline: PROMPT_RESPONSE_DEADLINE_MS });
      const elapsedMs = performance.now() - startedAt;

      expect(revoke.status).toBe(204);
      expect(elapsedMs).toBeLessThan(PROMPT_RESPONSE_DEADLINE_MS);

      const warnCalls = vi
        .mocked(logger.warn)
        .mock.calls.filter(
          ([, message]) => message === 'Failed to invalidate permission cache for role'
        );
      expect(warnCalls).toHaveLength(1);
      const [fields] = warnCalls[0]!;
      expect(fields).toEqual({ err: expect.any(Error), roleId: readerRoleId });
      expect((fields as { err: Error }).err.message).toContain('Redis connection is not ready');
    });
  });

  describe('(iii) コミット後の処理の失敗', () => {
    let originalNodeEnv: typeof process.env.NODE_ENV;

    beforeEach(() => {
      originalNodeEnv = process.env.NODE_ENV;
    });

    afterEach(() => {
      process.env.NODE_ENV = originalNodeEnv;
    });

    /**
     * アラートの送信が投げる EmailService。呼ばれた時点の読み手のキャッシュを記録する
     * （無効化がアラートより先に行われたことの観測）
     */
    function throwingEmailService(): {
      service: EmailService;
      cacheAtAlert: (string | null)[];
      failure: Error;
    } {
      const cacheAtAlert: (string | null)[] = [];
      const failure = new Error('alert delivery failed');
      const service = {
        sendAdminRoleChangedAlert: vi.fn(async () => {
          cacheAtAlert.push(await redisClient.get(cacheKey(readerUserId)));
          throw failure;
        }),
      } as unknown as EmailService;
      return { service, cacheAtAlert, failure };
    }

    function userRoleServiceWith(emailService: EmailService): UserRoleService {
      return new UserRoleService(
        prisma,
        getSharedRBACService(),
        new AuditLogService({ prisma }),
        emailService
      );
    }

    /**
     * @requirement user-authentication/REQ-21.8: ロールの割り当ての後処理が失敗しても、キャッシュを無効化する
     */
    it('システム管理者ロールの割り当てのアラートが投げても、割り当ては成功として返り、キャッシュは無効化される', async () => {
      // 読み手の「権限なし（user:read が無い）」をキャッシュへ置く
      expect((await getUsersAsReader()).status).toBe(403);
      expect(await redisClient.get(cacheKey(readerUserId))).not.toBeNull();

      const { service: emailService, cacheAtAlert, failure } = throwingEmailService();
      // アラートは NODE_ENV=test で抑制されるため、この呼び出しの間だけ本物の経路へ到達させる
      process.env.NODE_ENV = 'development';
      const result = await userRoleServiceWith(emailService).addRoleToUser(
        readerUserId,
        systemAdminRoleId,
        adminUserId,
        { email: `${MARK}-admin@example.com`, displayName: `${MARK}-admin` }
      );
      process.env.NODE_ENV = originalNodeEnv;

      // コミット済みの変更は成功として返る
      expect(result).toEqual({ ok: true, value: undefined });
      expect(
        await prisma.userRole.findFirst({
          where: { userId: readerUserId, roleId: systemAdminRoleId },
        })
      ).not.toBeNull();
      // アラートの経路へ到達し、その時点でキャッシュは無効化済み（無効化が先）
      expect(emailService.sendAdminRoleChangedAlert).toHaveBeenCalledTimes(1);
      expect(cacheAtAlert).toEqual([null]);
      expect(await redisClient.get(cacheKey(readerUserId))).toBeNull();

      // 失敗は err 付きの警告ログに留める
      const warnCalls = vi
        .mocked(logger.warn)
        .mock.calls.filter(([, message]) => message === 'Failed to send admin role change alert');
      expect(warnCalls).toHaveLength(1);
      expect(warnCalls[0]![0]).toMatchObject({ err: failure, userId: readerUserId });

      // 次の確認は新しい権限（*:*）で判定される
      expect((await getUsersAsReader()).status).toBe(200);
    });

    /**
     * @requirement user-authentication/REQ-21.8: ロールの割り当ての解除の後処理が失敗しても、キャッシュを無効化する
     */
    it('システム管理者ロールの解除のアラートが投げても、解除は成功として返り、キャッシュは無効化される', async () => {
      // 前提: 読み手にシステム管理者ロールを割り当て、「許可」をキャッシュへ置く
      await prisma.userRole.create({ data: { userId: readerUserId, roleId: systemAdminRoleId } });
      expect((await getUsersAsReader()).status).toBe(200);
      expect(await redisClient.get(cacheKey(readerUserId))).not.toBeNull();

      const { service: emailService, cacheAtAlert, failure } = throwingEmailService();
      process.env.NODE_ENV = 'development';
      const result = await userRoleServiceWith(emailService).removeRoleFromUser(
        readerUserId,
        systemAdminRoleId,
        adminUserId,
        { email: `${MARK}-admin@example.com`, displayName: `${MARK}-admin` }
      );
      process.env.NODE_ENV = originalNodeEnv;

      expect(result).toEqual({ ok: true, value: undefined });
      expect(
        await prisma.userRole.findFirst({
          where: { userId: readerUserId, roleId: systemAdminRoleId },
        })
      ).toBeNull();
      expect(emailService.sendAdminRoleChangedAlert).toHaveBeenCalledTimes(1);
      expect(cacheAtAlert).toEqual([null]);
      expect(await redisClient.get(cacheKey(readerUserId))).toBeNull();

      const warnCalls = vi
        .mocked(logger.warn)
        .mock.calls.filter(([, message]) => message === 'Failed to send admin role change alert');
      expect(warnCalls).toHaveLength(1);
      expect(warnCalls[0]![0]).toMatchObject({ err: failure, userId: readerUserId });

      // 次の確認は新しい権限（role:read のみ）で判定される
      expect((await getUsersAsReader()).status).toBe(403);
    });
  });
});
