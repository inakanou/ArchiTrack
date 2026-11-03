/**
 * @fileoverview 他のユーザーの管理の上限（削除・無効化・再有効化・2FA の再設定）の統合検証（タスク62.1）
 *
 * Requirements (user-authentication):
 * - REQ-38.13: 保有ロールの最高の優先度より高い優先度のロールを持つ他のユーザーの削除・無効化・再有効化、
 *   または 2FA の再設定を 403 で拒否する
 *
 * 本物の経路（app.ts の `DELETE /api/v1/users/:id`、`POST /api/v1/users/:id/deactivate`・`/reactivate`・
 * `/2fa/reset`）を実 DB の上で呼び、拒否の応答（403 TARGET_USER_EXCEEDS_ACTOR）、権限チェックの失敗
 * （PERMISSION_CHECK_FAILED）の記録、DB の不変（利用者の行・保有ロール・2FA の状態・バックアップコード・
 * リフレッシュトークン）を確かめる。各拒否には、同じ実行者が上限ちょうどの利用者と、ロールを持たない利用者へ
 * 同じ操作をできることを対照として添える。異常の検知（要件43.2）への送信は、共有の部品を記録だけの部品に
 * 差し替えて数える。
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { validateEnv } from '../../config/env.js';
import type { PrismaClient } from '../../generated/prisma/client.js';

// 環境変数を初期化（トークン発行の鍵を読むため、アプリとサービスのインポート前に実行）
validateEnv();

import app from '../../app.js';
import getPrismaClient from '../../db.js';
import redis, { initRedis } from '../../redis.js';
import tokenService from '../../services/token.service.js';
import { getSharedRBACService } from '../../services/rbac.service.js';
import { seedPermissions, seedRolePermissions, seedRoles } from '../../utils/seed-helpers.js';
import { deleteAuditLogsWithArchivePermission } from '../../utils/audit-log-archive-permission.js';
import {
  setSharedSecurityAnomalyMonitor,
  type SecurityAnomalyMonitor,
} from '../../services/security-anomaly-monitor.service.js';
import { createTestUser } from './test-user-factory.js';
import { createStoredRefreshToken } from './refresh-token-fixture.js';

const MARK = 'test-ua38-13-manage-user';
/** 実行者の上限（保有ロールの優先度） */
const ACTOR_PRIORITY = 50;

describe('他のユーザーの管理の上限（統合・実 DB）', () => {
  let prisma: PrismaClient;
  let actorId: string;
  let actorToken: string;
  /** 実行者の上限を 1 だけ超えるロール */
  let seniorRoleId: string;
  /** 実行者の上限ちょうどのロール */
  let peerRoleId: string;
  /** 異常の検知への送信の記録 */
  const observe = vi.fn();
  let sequence = 0;

  async function cleanup(): Promise<void> {
    const users = await prisma.user.findMany({
      where: { email: { contains: MARK } },
      select: { id: true },
    });
    const userIds = users.map((u) => u.id);
    const rbac = getSharedRBACService();
    for (const id of userIds) {
      await rbac.invalidateUserPermissionsCache(id);
    }
    const roles = await prisma.role.findMany({
      where: { name: { contains: MARK } },
      select: { id: true },
    });
    const roleIds = roles.map((r) => r.id);
    await deleteAuditLogsWithArchivePermission(prisma, {
      OR: [{ actorId: { in: userIds } }, { targetId: { in: userIds } }],
    });
    await prisma.userRole.deleteMany({
      where: { OR: [{ userId: { in: userIds } }, { roleId: { in: roleIds } }] },
    });
    await prisma.rolePermission.deleteMany({ where: { roleId: { in: roleIds } } });
    await prisma.role.deleteMany({ where: { id: { in: roleIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  }

  async function requirePermissionId(resource: string, action: string): Promise<string> {
    const permission = await prisma.permission.findFirst({
      where: { resource, action },
      select: { id: true },
    });
    if (!permission) {
      throw new Error(`前提の欠落: 権限 ${resource}:${action} が試験 DB に無い`);
    }
    return permission.id;
  }

  /** 検証用のロール（システムロールでない）を作る */
  async function createRole(
    label: string,
    priority: number,
    permissionIds: readonly string[] = []
  ): Promise<string> {
    const role = await prisma.role.create({
      data: { name: `${MARK}-${label}`, description: `${MARK} ${label}`, priority },
      select: { id: true },
    });
    for (const permissionId of permissionIds) {
      await prisma.rolePermission.create({ data: { roleId: role.id, permissionId } });
    }
    return role.id;
  }

  /**
   * 管理の対象の利用者を作る（2FA 登録済み・バックアップコード 1 件・リフレッシュトークン 1 件）
   */
  async function createTarget(
    label: string,
    roleId: string | null,
    isActive = true
  ): Promise<string> {
    sequence += 1;
    const email = `${MARK}-${label}-${sequence}@example.com`;
    const user = await createTestUser(
      prisma,
      { email, displayName: `${MARK}-${label}`, passwordHash: 'not-used' },
      { isActive }
    );
    if (roleId) {
      await prisma.userRole.create({ data: { userId: user.id, roleId } });
    }
    await prisma.twoFactorBackupCode.create({
      data: { userId: user.id, codeHash: 'hashed-backup-code' },
    });
    await createStoredRefreshToken(prisma, {
      userId: user.id,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });
    return user.id;
  }

  /** 対象の利用者の行・保有ロール・2FA・トークンの写し（拒否の前後で比べる） */
  async function snapshotOf(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        isActive: true,
        deactivatedAt: true,
        deactivationReason: true,
        reactivatedAt: true,
        twoFactorEnabled: true,
        twoFactorSecret: true,
        accessTokenGeneration: true,
        userRoles: { select: { roleId: true } },
      },
    });
    return {
      user,
      backupCodes: await prisma.twoFactorBackupCode.count({ where: { userId } }),
      refreshTokens: await prisma.refreshToken.count({ where: { userId } }),
    };
  }

  /** 実行者の上限による他のユーザーの管理の拒否の記録 */
  async function manageRejections(targetId: string) {
    return prisma.auditLog.findMany({
      where: { action: 'PERMISSION_CHECK_FAILED', actorId, targetType: 'user', targetId },
      select: { metadata: true, actorEmail: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  /** 403 TARGET_USER_EXCEEDS_ACTOR と、異常の検知への送信を確かめる */
  function expectRejected(response: request.Response): void {
    expect(response.status, JSON.stringify(response.body)).toBe(403);
    expect(response.body).toEqual({
      error: 'FORBIDDEN',
      message: 'The target user exceeds the privileges of the requesting user',
      code: 'TARGET_USER_EXCEEDS_ACTOR',
    });
    expect(observe).toHaveBeenCalledTimes(1);
    expect(observe).toHaveBeenCalledWith(
      expect.objectContaining({ signal: 'permission_denied', userId: actorId })
    );
  }

  const asActor = (r: request.Test) => r.set('Authorization', `Bearer ${actorToken}`);

  type Operation = 'delete' | 'deactivate' | 'reactivate' | 'two_factor_reset';

  function call(operation: Operation, targetId: string): request.Test {
    switch (operation) {
      case 'delete':
        return asActor(request(app).delete(`/api/v1/users/${targetId}`));
      case 'deactivate':
        return asActor(request(app).post(`/api/v1/users/${targetId}/deactivate`)).send({
          reason: `${MARK} 無効化`,
        });
      case 'reactivate':
        return asActor(request(app).post(`/api/v1/users/${targetId}/reactivate`)).send({
          reason: `${MARK} 再有効化`,
        });
      case 'two_factor_reset':
        return asActor(request(app).post(`/api/v1/users/${targetId}/2fa/reset`));
    }
  }

  beforeAll(async () => {
    prisma = getPrismaClient();
    await initRedis();
    await cleanup();
    await seedRoles(prisma);
    await seedPermissions(prisma);
    await seedRolePermissions(prisma);

    // 利用者の削除と管理の権限を持つが、システム管理者ではない実行者（上限 50）
    const delegateRoleId = await createRole('delegate', ACTOR_PRIORITY, [
      await requirePermissionId('user', 'delete'),
      await requirePermissionId('user', 'manage'),
    ]);
    seniorRoleId = await createRole('senior', ACTOR_PRIORITY + 1);
    peerRoleId = await createRole('peer', ACTOR_PRIORITY);

    const email = `${MARK}-actor@example.com`;
    const actor = await createTestUser(prisma, {
      email,
      displayName: `${MARK}-actor`,
      passwordHash: 'not-used',
    });
    await prisma.userRole.create({ data: { userId: actor.id, roleId: delegateRoleId } });
    actorId = actor.id;
    actorToken = await tokenService.generateAccessToken({
      accessTokenGeneration: 0,
      userId: actor.id,
      email,
      roles: [`${MARK}-delegate`],
    });
    // 前提: 実行者は権限の検査を通る（上限の判定まで届く）
    for (const permission of ['user:delete', 'user:manage']) {
      expect(await getSharedRBACService().hasPermission(actorId, permission), permission).toBe(
        true
      );
    }
  });

  beforeEach(() => {
    observe.mockClear();
    setSharedSecurityAnomalyMonitor({
      observe,
      flush: async () => undefined,
    } as unknown as SecurityAnomalyMonitor);
  });

  afterAll(async () => {
    setSharedSecurityAnomalyMonitor(null);
    await cleanup();
    await redis.disconnect();
  });

  /** 拒否される操作と、その対象の初期の状態（再有効化は無効な利用者が対象） */
  const operations: ReadonlyArray<[Operation, boolean]> = [
    ['delete', true],
    ['deactivate', true],
    ['reactivate', false],
    ['two_factor_reset', true],
  ];

  /**
   * @requirement user-authentication/REQ-38.13
   */
  it.each(operations)(
    '%s: 上限を超えるロールを持つ利用者への操作を 403 で拒否し、何も変えずに監査へ記録し、上限ちょうど・ロール無しの利用者にはできる',
    async (operation, isActive) => {
      const senior = await createTarget(`${operation}-senior`, seniorRoleId, isActive);
      const before = await snapshotOf(senior);

      const rejected = await call(operation, senior);

      expectRejected(rejected);
      // 拒否では対象の利用者・保有ロール・2FA・バックアップコード・リフレッシュトークンが変わらない
      expect(await snapshotOf(senior)).toEqual(before);
      expect(before.user?.userRoles).toEqual([{ roleId: seniorRoleId }]);
      expect(before.backupCodes).toBe(1);
      expect(before.refreshTokens).toBe(1);
      const records = await manageRejections(senior);
      expect(records).toHaveLength(1);
      expect(records[0]!.metadata).toEqual({
        reason: 'TARGET_USER_EXCEEDS_ACTOR',
        operation,
        targetPriority: String(ACTOR_PRIORITY + 1),
      });
      expect(records[0]!.actorEmail).toBe(`${MARK}-actor@example.com`);

      // 対照: 上限ちょうどのロールを持つ利用者と、ロールを持たない利用者には同じ操作ができる
      for (const [label, roleId] of [
        ['peer', peerRoleId],
        ['no-role', null],
      ] as const) {
        observe.mockClear();
        const target = await createTarget(`${operation}-${label}`, roleId, isActive);
        const allowed = await call(operation, target);
        expect(allowed.status, `${label}: ${JSON.stringify(allowed.body)}`).toBe(204);
        expect(observe).not.toHaveBeenCalled();
        expect(await manageRejections(target)).toEqual([]);
        const after = await snapshotOf(target);
        switch (operation) {
          case 'delete':
            expect(after.user).toBeNull();
            break;
          case 'deactivate':
            expect(after.user?.isActive).toBe(false);
            expect(after.refreshTokens).toBe(0);
            break;
          case 'reactivate':
            expect(after.user?.isActive).toBe(true);
            break;
          case 'two_factor_reset':
            expect(after.user?.twoFactorEnabled).toBe(false);
            expect(after.backupCodes).toBe(0);
            expect(after.refreshTokens).toBe(0);
            break;
        }
      }
    }
  );
});
