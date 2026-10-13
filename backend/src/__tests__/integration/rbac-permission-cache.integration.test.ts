/**
 * @fileoverview 権限の確認（requirePermission）の経路で権限のキャッシュが働くことの統合検証（タスク36.2）
 *
 * モックを使わず、本物のアプリ（app.ts のルート・authenticate・requirePermission・RBACService・
 * RolePermissionService・UserRoleService）と、テスト用の実データベース・実 Redis を通す。
 * Redis は redis.ts の initRedis で初期化した本物のクライアント（REDIS_URL。ローカルでは
 * test compose の localhost:6380/1）を使う。Redis に接続できないときは前提の確認で赤くなる（読み飛ばさない）。
 *
 * 確かめること:
 * - 1 回目の権限の確認が DB から取った権限を Redis に保存し、2 回目は DB を引かずにキャッシュで判定する（21.9）。
 *   「DB を引かない」は、1 回目の後に DB の権限を無効化の経路を通さずに直接消しても、2 回目が許可のままで
 *   あることで観測する（DB を引いていれば拒否になる）
 * - ロール・権限の変更・ユーザーの削除を API で行うと、キャッシュが無効化され次の確認は拒否になる（21.8）
 * - Redis の接続が失われているとき、権限を DB から直接取得して応答が成り立ち（24.2）、
 *   警告ログが pino の err シリアライザの効く `err` キー付きで残る（24.7）
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import type Redis from 'ioredis';
import { validateEnv } from '../../config/env.js';
import type { PrismaClient } from '../../generated/prisma/client.js';

// 環境変数を初期化（トークン発行の鍵を読むため、アプリとサービスのインポート前に実行）
validateEnv();

import app from '../../app.js';
import getPrismaClient from '../../db.js';
import redis, { initRedis } from '../../redis.js';
import tokenService from '../../services/token.service.js';
import logger from '../../utils/logger.js';

const MARK = 'test-ua362-rbac-cache';

/** RBACService の権限キャッシュのキー */
function cacheKey(userId: string): string {
  return `rbac:permissions:${userId}`;
}

/**
 * 本物のロガー（pino の設定を持つ実体）のシリアライザを、ログの第1引数へ当てて JSON にする。
 * テストの共通設定（vitest.setup.ts）はロガーをモックに置き換えるため、実体は importActual で取り出す。
 * pino はシリアライザを Symbol('pino.serializers') に持つので、記号はロガー自身から説明文で引く
 */
async function serializeWithRealLogger(
  logged: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const { default: realLogger } =
    await vi.importActual<typeof import('../../utils/logger.js')>('../../utils/logger.js');
  const serializersSym = Object.getOwnPropertySymbols(realLogger).find(
    (sym) => sym.description === 'pino.serializers'
  );
  expect(serializersSym).toBeDefined();
  const serializers = (
    realLogger as unknown as Record<symbol, Record<string, (v: unknown) => unknown>>
  )[serializersSym as symbol];
  expect(typeof serializers?.err).toBe('function');
  return JSON.parse(
    JSON.stringify(
      Object.fromEntries(
        Object.entries(logged).map(([key, value]) => [
          key,
          serializers?.[key] ? serializers[key](value) : value,
        ])
      )
    )
  );
}

/** RBACService の権限キャッシュの TTL（秒） */
const PERMISSION_CACHE_TTL_SECONDS = 15 * 60;

describe('権限の確認の経路の権限キャッシュ（統合・実 Redis）', () => {
  let prisma: PrismaClient;
  let redisClient: Redis;
  let roleReadPermissionId: string;
  let readerRoleId: string;
  let readerUserId: string;
  let readerToken: string;
  let adminToken: string;

  async function cleanup(): Promise<void> {
    const users = await prisma.user.findMany({
      where: { email: { contains: MARK } },
      select: { id: true },
    });
    const userIds = users.map((u) => u.id);
    if (userIds.length > 0) {
      await redisClient.del(...userIds.map(cacheKey));
    }
    await prisma.auditLog.deleteMany({ where: { actorId: { in: userIds } } });
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
  ): Promise<{ id: string; token: string }> {
    const email = `${MARK}-${suffix}@example.com`;
    const user = await prisma.user.create({
      data: { email, displayName: `${MARK}-${suffix}`, passwordHash: 'not-used' },
    });
    await prisma.userRole.create({ data: { userId: user.id, roleId } });
    const token = await tokenService.generateAccessToken({ userId: user.id, email, roles: [] });
    return { id: user.id, token };
  }

  /** 読み手（role:read だけを持つ）としてロールの一覧を要求する */
  function getRolesAsReader(): request.Test {
    return request(app).get('/api/v1/roles').set('Authorization', `Bearer ${readerToken}`);
  }

  beforeAll(async () => {
    prisma = getPrismaClient();
    await initRedis();
    const client = redis.getClient();
    // 前提: 実 Redis に接続できていること（できなければ赤にする。読み飛ばさない）
    expect(client, 'REDIS_URL の Redis クライアントが初期化されていない').not.toBeNull();
    expect(client!.status, '実 Redis に接続できていない').toBe('ready');
    redisClient = client!;

    await cleanup();

    roleReadPermissionId = await ensurePermission('role', 'read');
    const roleUpdatePermissionId = await ensurePermission('role', 'update');
    const userUpdatePermissionId = await ensurePermission('user', 'update');
    const userDeletePermissionId = await ensurePermission('user', 'delete');

    const adminRole = await prisma.role.create({
      data: { name: `${MARK}-admin`, description: MARK, priority: 0, isSystem: false },
    });
    await prisma.rolePermission.createMany({
      data: [
        roleReadPermissionId,
        roleUpdatePermissionId,
        userUpdatePermissionId,
        userDeletePermissionId,
      ].map((permissionId) => ({ roleId: adminRole.id, permissionId })),
    });
    const admin = await createUser('admin', adminRole.id);
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
    await prisma.auditLog.deleteMany({ where: { actorId: { in: readerIds } } });
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

  afterAll(async () => {
    // Redis の障害の検証が接続を落としたまま失敗した場合に備え、接続を戻してから後始末する
    if (redisClient && redisClient.status === 'end') {
      await redisClient.connect();
    }
    await cleanup();
    await redis.disconnect();
  });

  /**
   * @requirement user-authentication/REQ-21.9: 権限情報をキャッシュ機構に保存し、2 回目の確認は DB を引かない
   */
  it('1 回目の権限の確認は DB から取った権限を Redis に保存し、2 回目は DB を引かずにキャッシュで判定する', async () => {
    // 前提: キャッシュは空
    expect(await redisClient.get(cacheKey(readerUserId))).toBeNull();

    // 1 回目: DB から権限を取り、許可する
    const first = await getRolesAsReader();
    expect(first.status).toBe(200);

    // 権限が Redis に TTL 付きで保存されている
    const cached = await redisClient.get(cacheKey(readerUserId));
    expect(cached).not.toBeNull();
    expect(JSON.parse(cached!)).toEqual([
      expect.objectContaining({ id: roleReadPermissionId, resource: 'role', action: 'read' }),
    ]);
    const ttl = await redisClient.ttl(cacheKey(readerUserId));
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(PERMISSION_CACHE_TTL_SECONDS);

    // 無効化の経路を通さずに DB の権限を直接消す（DB を引けば拒否になる状態にする）
    await prisma.rolePermission.deleteMany({ where: { roleId: readerRoleId } });

    // 2 回目: DB を引かずキャッシュで判定するため、許可のまま
    const second = await getRolesAsReader();
    expect(second.status).toBe(200);

    // 対照: キャッシュを消すと DB を引き、DB の現状（権限なし）で拒否になる
    await redisClient.del(cacheKey(readerUserId));
    const afterEviction = await getRolesAsReader();
    expect(afterEviction.status).toBe(403);
  });

  /**
   * @requirement user-authentication/REQ-21.8: ロールからの権限の削除でキャッシュを無効化する
   */
  it('ロールから権限を API で削除すると、キャッシュ済みの利用者の次の確認は拒否になる', async () => {
    expect((await getRolesAsReader()).status).toBe(200);
    expect(await redisClient.get(cacheKey(readerUserId))).not.toBeNull();

    const revoke = await request(app)
      .delete(`/api/v1/roles/${readerRoleId}/permissions/${roleReadPermissionId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(revoke.status).toBe(204);

    expect(await redisClient.get(cacheKey(readerUserId))).toBeNull();
    expect((await getRolesAsReader()).status).toBe(403);
  });

  /**
   * @requirement user-authentication/REQ-21.8: ユーザーからのロールの削除でキャッシュを無効化する
   */
  it('ユーザーからロールを API で削除すると、キャッシュ済みの利用者の次の確認は拒否になる', async () => {
    expect((await getRolesAsReader()).status).toBe(200);
    expect(await redisClient.get(cacheKey(readerUserId))).not.toBeNull();

    const revoke = await request(app)
      .delete(`/api/v1/users/${readerUserId}/roles/${readerRoleId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(revoke.status).toBe(204);

    expect(await redisClient.get(cacheKey(readerUserId))).toBeNull();
    expect((await getRolesAsReader()).status).toBe(403);
  });

  /**
   * ユーザーの削除後も、そのユーザーのアクセストークンは有効期限まで検証を通る。
   * 残ったキャッシュで権限の確認を通さないこと
   */
  it('ユーザーを API で削除すると、削除されたユーザーのトークンでの次の確認は拒否になる', async () => {
    expect((await getRolesAsReader()).status).toBe(200);
    expect(await redisClient.get(cacheKey(readerUserId))).not.toBeNull();

    const remove = await request(app)
      .delete(`/api/v1/users/${readerUserId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(remove.status).toBe(204);

    expect(await redisClient.get(cacheKey(readerUserId))).toBeNull();
    expect((await getRolesAsReader()).status).toBe(403);
  });

  /**
   * @requirement user-authentication/REQ-24.2: キャッシュ接続が失敗するとき DB から直接権限情報を取得する
   * @requirement user-authentication/REQ-24.7: キャッシュ障害でフォールバックしたとき警告ログを記録する
   */
  it('Redis の接続が失われているとき、権限を DB から取得して応答し、err 付きの警告ログを残す', async () => {
    // キャッシュには「権限なし」を置く（キャッシュを読めば拒否、DB を引けば許可になる状態にする）
    await redisClient.set(cacheKey(readerUserId), '[]', 'EX', PERMISSION_CACHE_TTL_SECONDS);

    // アプリが使う本物のクライアントの接続を落とし、切断が終わる（status が end になる）まで待つ
    const ended = new Promise<void>((resolve) => redisClient.once('end', () => resolve()));
    redisClient.disconnect();
    await ended;
    try {
      expect(redisClient.status).toBe('end');

      const response = await getRolesAsReader();

      // DB から取った権限（role:read）で許可される
      expect(response.status).toBe(200);

      // 警告ログが、障害を err キーに載せて残る
      const warnCalls = vi
        .mocked(logger.warn)
        .mock.calls.filter(
          ([, message]) => message === 'Failed to get permissions from Redis cache'
        );
      expect(warnCalls).toHaveLength(1);
      const [fields] = warnCalls[0]!;
      expect(fields).toEqual({ err: expect.any(Error), userId: readerUserId });
      expect(fields).not.toHaveProperty('error');
      // 本物のロガーのシリアライザを当てた本番の JSON でも、障害の中身（message と stack）が残る
      const serialized = await serializeWithRealLogger(fields as Record<string, unknown>);
      const serializedErr = serialized.err as { message?: string; stack?: string };
      expect(serializedErr.message).toContain('Redis connection is not ready');
      expect(serializedErr.stack).toEqual(expect.any(String));
    } finally {
      await redisClient.connect();
    }

    // 接続の障害中はキャッシュを書き換えていない（置いた値のまま）
    expect(redisClient.status).toBe('ready');
    expect(await redisClient.get(cacheKey(readerUserId))).toBe('[]');
  });
});
