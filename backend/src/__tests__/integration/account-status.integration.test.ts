/**
 * @fileoverview 管理者による無効化と再有効化の統合検証（user-authentication タスク49.2）
 *
 * Requirements (user-authentication):
 * - REQ-36.1: 無効化で全リフレッシュトークンを失効させ、以後のリフレッシュと API を拒否する
 * - REQ-36.3: 再有効化で再び利用できる
 * - REQ-36.4: 無効化・再有効化を全システム管理者へ通知し、監査に実行者・対象・理由を記録する
 * - REQ-36.5: 自分自身と最後の有効なシステム管理者の無効化を拒否する
 *
 * モックを使わず、本物のアプリ（認証ミドルウェア・権限の確認・ルート・エラーハンドラー）と実 PostgreSQL・
 * 実 Redis を通す。通知は本物の AdminNotificationService の呼び出しを観測する（送信はそのまま行う）。
 */

import { randomBytes } from 'crypto';
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { hash } from '@node-rs/argon2';
import type Redis from 'ioredis';
import { validateEnv } from '../../config/env.js';
import type { PrismaClient } from '../../generated/prisma/client.js';

// 環境変数を初期化（モジュールインポート前に実行）
validateEnv();

import app from '../../app.js';
import getPrismaClient from '../../db.js';
import redis, { initRedis } from '../../redis.js';
import tokenService from '../../services/token.service.js';
import { AdminNotificationService } from '../../services/admin-notification.service.js';
import { deleteAuditLogsWithArchivePermission } from '../../utils/audit-log-archive-permission.js';
import { seedRoles, seedPermissions, seedRolePermissions } from '../../utils/seed-helpers.js';
import { authUserStateCacheKey } from '../../services/authenticated-user-state-cache.js';
import { loginForTokens } from './auth-login-client.js';
import { issuedRefreshToken, refreshWithCookie } from './refresh-cookie-client.js';
import { createTestUser, invalidateUserStateCache } from './test-user-factory.js';

const MARK = 'test-49-2-account-status';
const PASSWORD = 'AccountStatus!Passphrase-2026';

describe('管理者による無効化と再有効化（統合）', () => {
  let prisma: PrismaClient;
  let redisClient: Redis;
  let passwordHash: string;
  let notifySpy: ReturnType<typeof vi.spyOn>;

  async function cleanup(): Promise<void> {
    const users = await prisma.user.findMany({
      where: { email: { contains: MARK } },
      select: { id: true },
    });
    const ids = users.map((u) => u.id);
    if (ids.length > 0) {
      await redisClient.del(...ids.map(authUserStateCacheKey));
    }
    await deleteAuditLogsWithArchivePermission(prisma, {
      OR: [{ actorId: { in: ids } }, { targetId: { in: ids } }],
    });
    await prisma.refreshToken.deleteMany({ where: { userId: { in: ids } } });
    await prisma.twoFactorBackupCode.deleteMany({ where: { userId: { in: ids } } });
    await prisma.passwordHistory.deleteMany({ where: { userId: { in: ids } } });
    await prisma.userRole.deleteMany({ where: { userId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await prisma.role.deleteMany({ where: { name: { startsWith: MARK } } });
  }

  async function clearRateLimits(): Promise<void> {
    const keys = await redisClient.keys('rl:*');
    if (keys.length > 0) {
      await redisClient.del(...keys);
    }
  }

  function newEmail(label: string): string {
    return `${MARK}-${label}-${randomBytes(4).toString('hex')}@example.com`;
  }

  /** ロールを割り当てた利用者を作る */
  async function createUserWithRole(label: string, roleName: string) {
    const user = await createTestUser(
      prisma,
      { email: newEmail(label), displayName: `${MARK}-${label}`, passwordHash },
      {}
    );
    const role = await prisma.role.findUniqueOrThrow({ where: { name: roleName } });
    await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });
    return user;
  }

  /** admin ロールを持たず user の権限だけを持つ利用者（最後の管理者の判定の実行者） */
  async function createUserManager(actions: string[] = ['manage']) {
    const role = await prisma.role.create({
      data: {
        name: `${MARK}-manager-${randomBytes(4).toString('hex')}`,
        description: '利用者の管理だけを行う試験用のロール',
      },
    });
    for (const action of actions) {
      const permission = await prisma.permission.findUniqueOrThrow({
        where: { resource_action: { resource: 'user', action } },
      });
      await prisma.rolePermission.create({
        data: { roleId: role.id, permissionId: permission.id },
      });
    }
    return createUserWithRole('manager', role.name);
  }

  async function bearerFor(
    user: { id: string; email: string },
    role: string
  ): Promise<[string, string]> {
    const accessToken = await tokenService.generateAccessToken({
      accessTokenGeneration: 0,
      userId: user.id,
      email: user.email,
      roles: [role],
    });
    return ['Authorization', `Bearer ${accessToken}`];
  }

  /**
   * 本試験の利用者以外の有効なシステム管理者を一時的に無効にして処理を行い、必ず元に戻す
   * （最後の有効なシステム管理者の判定は DB 全体の管理者の数で行うため）
   */
  async function withOnlyTestAdminsActive(run: () => Promise<void>): Promise<void> {
    const others = await prisma.user.findMany({
      where: {
        isActive: true,
        email: { not: { contains: MARK } },
        userRoles: { some: { role: { name: 'admin' } } },
      },
      select: { id: true },
    });
    const ids = others.map((u) => u.id);
    await prisma.user.updateMany({ where: { id: { in: ids } }, data: { isActive: false } });
    try {
      await run();
    } finally {
      await prisma.user.updateMany({ where: { id: { in: ids } }, data: { isActive: true } });
      for (const id of ids) {
        await invalidateUserStateCache(id);
      }
    }
  }

  beforeAll(async () => {
    prisma = getPrismaClient();
    await initRedis();
    const client = redis.getClient();
    // 前提: 実 Redis に接続できていること（できなければ赤にする。読み飛ばさない）
    expect(client, 'REDIS_URL の Redis クライアントが初期化されていない').not.toBeNull();
    expect(client!.status, '実 Redis に接続できていない').toBe('ready');
    redisClient = client!;
    await seedRoles(prisma);
    await seedPermissions(prisma);
    await seedRolePermissions(prisma);
    passwordHash = await hash(PASSWORD, { memoryCost: 65536, timeCost: 3, parallelism: 4 });
    await cleanup();
  });

  afterAll(async () => {
    await cleanup();
    await redis.disconnect();
  });

  beforeEach(async () => {
    await cleanup();
    await clearRateLimits();
    notifySpy = vi.spyOn(AdminNotificationService.prototype, 'notifyAllAdmins');
  });

  afterEach(() => {
    notifySpy.mockRestore();
  });

  /**
   * @requirement user-authentication/REQ-36.1
   * @requirement user-authentication/REQ-36.3
   * @requirement user-authentication/REQ-36.4
   */
  it('無効化の直後に対象者のリフレッシュと API が拒否され、再有効化で戻り、両方で監査と通知が残る', async () => {
    const admin = await createUserWithRole('admin', 'admin');
    const target = await createUserWithRole('target', 'user');
    const login = await loginForTokens(app, { email: target.email, password: PASSWORD });
    const targetAccessToken = login.body.accessToken as string;
    const targetBearer: [string, string] = ['Authorization', `Bearer ${targetAccessToken}`];

    // 有効な間に状態をキャッシュへ載せる（TTL を待たずに拒否されることを確かめるため）
    expect(
      (
        await request(app)
          .get('/api/v1/auth/me')
          .set(...targetBearer)
      ).status
    ).toBe(200);
    expect(await redisClient.get(authUserStateCacheKey(target.id))).not.toBeNull();
    expect(await prisma.refreshToken.count({ where: { userId: target.id } })).toBeGreaterThan(0);

    const deactivated = await request(app)
      .post(`/api/v1/users/${target.id}/deactivate`)
      .set(...(await bearerFor(admin, 'admin')))
      .set('User-Agent', 'account-status-test')
      .send({ reason: '退職のため' });
    expect(deactivated.status).toBe(204);

    // 状態の記録と全リフレッシュトークンの失効
    const stored = await prisma.user.findUniqueOrThrow({ where: { id: target.id } });
    expect(stored.isActive).toBe(false);
    expect(stored.deactivatedAt).toBeInstanceOf(Date);
    expect(stored.deactivationReason).toBe('退職のため');
    expect(await prisma.refreshToken.count({ where: { userId: target.id } })).toBe(0);

    // 直後のリフレッシュと API は拒否される
    const refresh = await refreshWithCookie(app, issuedRefreshToken(login));
    expect(refresh.status).toBe(401);
    for (const path of ['/api/v1/auth/me', '/api/projects']) {
      const denied = await request(app)
        .get(path)
        .set(...targetBearer);
      expect(denied.status, path).toBe(401);
      expect(denied.body.code, path).toBe('ACCOUNT_DISABLED');
    }

    // 監査（実行者・対象・理由）と通知
    const deactivationAudits = await prisma.auditLog.findMany({
      where: { action: 'USER_DEACTIVATED', targetId: target.id },
    });
    expect(deactivationAudits).toHaveLength(1);
    expect(deactivationAudits[0]).toMatchObject({
      actorId: admin.id,
      actorEmail: admin.email,
      targetType: 'User',
      targetId: target.id,
    });
    expect(deactivationAudits[0]!.metadata).toMatchObject({
      reason: '退職のため',
      targetEmail: target.email,
      userAgent: 'account-status-test',
    });
    expect(notifySpy).toHaveBeenCalledTimes(1);
    expect(notifySpy).toHaveBeenLastCalledWith(
      expect.objectContaining({
        kind: 'USER_DEACTIVATED',
        lines: expect.arrayContaining([expect.stringContaining(target.email)]),
      })
    );

    // 再有効化
    const reactivated = await request(app)
      .post(`/api/v1/users/${target.id}/reactivate`)
      .set(...(await bearerFor(admin, 'admin')))
      .send({ reason: '復職のため' });
    expect(reactivated.status).toBe(204);

    const restored = await prisma.user.findUniqueOrThrow({ where: { id: target.id } });
    expect(restored.isActive).toBe(true);
    expect(restored.deactivatedAt).toBeNull();
    expect(restored.deactivationReason).toBeNull();
    // 再有効化の日時を書き、最終ログイン日時は変えない（90 日の自動無効化の起点、タスク49.4）
    expect(restored.reactivatedAt).toBeInstanceOf(Date);
    expect(restored.lastLoginAt?.getTime()).toBe(stored.lastLoginAt?.getTime());
    expect(stored.lastLoginAt).toBeInstanceOf(Date);
    // 直後から API が通り、ログインとリフレッシュで再び利用できる
    expect(
      (
        await request(app)
          .get('/api/v1/auth/me')
          .set(...targetBearer)
      ).status
    ).toBe(200);
    const relogin = await loginForTokens(app, { email: target.email, password: PASSWORD });
    const refreshAgain = await refreshWithCookie(app, issuedRefreshToken(relogin));
    expect(refreshAgain.status).toBe(200);

    const reactivationAudits = await prisma.auditLog.findMany({
      where: { action: 'USER_REACTIVATED', targetId: target.id },
    });
    expect(reactivationAudits).toHaveLength(1);
    expect(reactivationAudits[0]).toMatchObject({ actorId: admin.id, targetType: 'User' });
    expect(reactivationAudits[0]!.metadata).toMatchObject({
      reason: '復職のため',
      targetEmail: target.email,
    });
    expect(notifySpy).toHaveBeenCalledTimes(2);
    expect(notifySpy).toHaveBeenLastCalledWith(
      expect.objectContaining({ kind: 'USER_REACTIVATED' })
    );
  });

  /**
   * @requirement user-authentication/REQ-36.5
   */
  it('自分自身の無効化を 409 SELF_DEACTIVATION_FORBIDDEN で拒否し、状態を変えず監査も通知も残さない', async () => {
    const admin = await createUserWithRole('self', 'admin');

    const response = await request(app)
      .post(`/api/v1/users/${admin.id}/deactivate`)
      .set(...(await bearerFor(admin, 'admin')))
      .send({ reason: '自分を止める' });

    expect(response.status).toBe(409);
    expect(response.body.code).toBe('SELF_DEACTIVATION_FORBIDDEN');
    expect((await prisma.user.findUniqueOrThrow({ where: { id: admin.id } })).isActive).toBe(true);
    expect(
      await prisma.auditLog.count({ where: { action: 'USER_DEACTIVATED', targetId: admin.id } })
    ).toBe(0);
    expect(notifySpy).not.toHaveBeenCalled();
  });

  /**
   * @requirement user-authentication/REQ-36.5
   */
  it('最後の有効なシステム管理者の無効化を 409 LAST_ACTIVE_ADMIN_PROTECTED で拒否する', async () => {
    const manager = await createUserManager();
    const lastAdmin = await createUserWithRole('last-admin', 'admin');

    await withOnlyTestAdminsActive(async () => {
      const response = await request(app)
        .post(`/api/v1/users/${lastAdmin.id}/deactivate`)
        .set(...(await bearerFor(manager, 'manager')))
        .send({ reason: '最後の管理者' });

      expect(response.status).toBe(409);
      expect(response.body.code).toBe('LAST_ACTIVE_ADMIN_PROTECTED');
      expect((await prisma.user.findUniqueOrThrow({ where: { id: lastAdmin.id } })).isActive).toBe(
        true
      );
      expect(
        await prisma.auditLog.count({
          where: { action: 'USER_DEACTIVATED', targetId: lastAdmin.id },
        })
      ).toBe(0);
      expect(notifySpy).not.toHaveBeenCalled();
    });
  });

  /**
   * @requirement user-authentication/REQ-36.5
   */
  it('有効な管理者が 2 人のとき、2 人の並行する無効化は直列化され、一方だけが成功して管理者が 1 人残る', async () => {
    const manager = await createUserManager();
    const adminX = await createUserWithRole('admin-x', 'admin');
    const adminY = await createUserWithRole('admin-y', 'admin');

    const managerBearer = await bearerFor(manager, 'manager');

    await withOnlyTestAdminsActive(async () => {
      const responses = await Promise.all(
        [adminX, adminY].map((target) =>
          request(app)
            .post(`/api/v1/users/${target.id}/deactivate`)
            .set(...managerBearer)
            .send({ reason: '並行の無効化' })
        )
      );

      expect(responses.map((r) => r.status).sort()).toEqual([204, 409]);
      expect(responses.find((r) => r.status === 409)!.body.code).toBe(
        'LAST_ACTIVE_ADMIN_PROTECTED'
      );
      expect(
        await prisma.user.count({ where: { id: { in: [adminX.id, adminY.id] }, isActive: true } })
      ).toBe(1);
    });
  });

  /**
   * 最後の管理者の保護（ロールの解除・利用者の削除）も有効な管理者の数で判定する。
   * 有効な管理者 A と無効化された管理者 B の状態で A を外すと、有効な管理者が 0 人になる
   */
  describe('ロールの解除と利用者の削除は無効化された管理者を数えない', () => {
    async function setupActiveAndDeactivatedAdmins() {
      const manager = await createUserManager(['update', 'delete']);
      const activeAdmin = await createUserWithRole('active-admin', 'admin');
      const deactivatedAdmin = await createUserWithRole('deactivated-admin', 'admin');
      await prisma.user.update({
        where: { id: deactivatedAdmin.id },
        data: { isActive: false, deactivatedAt: new Date(), deactivationReason: '試験' },
      });
      const adminRole = await prisma.role.findUniqueOrThrow({ where: { name: 'admin' } });
      const managerBearer = await bearerFor(manager, 'manager');
      return { activeAdmin, deactivatedAdmin, adminRole, managerBearer };
    }

    /**
     * @requirement user-authentication/REQ-36.5
     */
    it('有効な管理者が 1 人だけのとき、その admin ロールの解除を 400 LAST_ADMIN_PROTECTED で拒否する', async () => {
      const { activeAdmin, adminRole, managerBearer } = await setupActiveAndDeactivatedAdmins();

      await withOnlyTestAdminsActive(async () => {
        const response = await request(app)
          .delete(`/api/v1/users/${activeAdmin.id}/roles/${adminRole.id}`)
          .set(...managerBearer);

        expect(response.status).toBe(400);
        expect(response.body.code).toBe('LAST_ADMIN_PROTECTED');
        expect(
          await prisma.userRole.count({ where: { userId: activeAdmin.id, roleId: adminRole.id } })
        ).toBe(1);
      });
    });

    /**
     * @requirement user-authentication/REQ-36.5
     */
    it('有効な管理者が 1 人だけのとき、その利用者の削除を 400 LAST_ADMIN_PROTECTED で拒否する', async () => {
      const { activeAdmin, managerBearer } = await setupActiveAndDeactivatedAdmins();

      await withOnlyTestAdminsActive(async () => {
        const response = await request(app)
          .delete(`/api/v1/users/${activeAdmin.id}`)
          .set(...managerBearer);

        expect(response.status).toBe(400);
        expect(response.body.code).toBe('LAST_ADMIN_PROTECTED');
        expect(await prisma.user.count({ where: { id: activeAdmin.id } })).toBe(1);
      });
    });

    /**
     * @requirement user-authentication/REQ-36.5
     */
    it('無効化された管理者の admin ロールの解除と利用者の削除は、有効な管理者を減らさないため許す', async () => {
      const { activeAdmin, deactivatedAdmin, adminRole, managerBearer } =
        await setupActiveAndDeactivatedAdmins();

      await withOnlyTestAdminsActive(async () => {
        const revoked = await request(app)
          .delete(`/api/v1/users/${deactivatedAdmin.id}/roles/${adminRole.id}`)
          .set(...managerBearer);
        expect(revoked.status).toBe(204);

        // 管理者に戻してから削除する
        await prisma.userRole.create({
          data: { userId: deactivatedAdmin.id, roleId: adminRole.id },
        });
        const deleted = await request(app)
          .delete(`/api/v1/users/${deactivatedAdmin.id}`)
          .set(...managerBearer);
        expect(deleted.status).toBe(204);
        expect(await prisma.user.count({ where: { id: deactivatedAdmin.id } })).toBe(0);
        // 有効な管理者は残る
        expect(
          await prisma.userRole.count({ where: { userId: activeAdmin.id, roleId: adminRole.id } })
        ).toBe(1);
      });
    });
  });

  it('一般ユーザーの要求は 403、理由の欠落は 400、存在しない対象者は 404 になる', async () => {
    const user = await createUserWithRole('general', 'user');
    const other = await createUserWithRole('other', 'user');
    const admin = await createUserWithRole('admin', 'admin');

    for (const operation of ['deactivate', 'reactivate']) {
      const forbidden = await request(app)
        .post(`/api/v1/users/${other.id}/${operation}`)
        .set(...(await bearerFor(user, 'user')))
        .send({ reason: '権限なし' });
      expect(forbidden.status, operation).toBe(403);

      for (const body of [{}, { reason: '   ' }]) {
        const invalid = await request(app)
          .post(`/api/v1/users/${other.id}/${operation}`)
          .set(...(await bearerFor(admin, 'admin')))
          .send(body);
        expect(invalid.status, `${operation} ${JSON.stringify(body)}`).toBe(400);
      }

      const missing = await request(app)
        .post(`/api/v1/users/00000000-0000-4000-8000-000000000000/${operation}`)
        .set(...(await bearerFor(admin, 'admin')))
        .send({ reason: '不在' });
      expect(missing.status, operation).toBe(404);
      expect(missing.body.code, operation).toBe('USER_NOT_FOUND');
    }

    expect((await prisma.user.findUniqueOrThrow({ where: { id: other.id } })).isActive).toBe(true);
    expect(
      await prisma.auditLog.count({
        where: { action: { in: ['USER_DEACTIVATED', 'USER_REACTIVATED'] }, targetId: other.id },
      })
    ).toBe(0);
    expect(notifySpy).not.toHaveBeenCalled();
  });
});
