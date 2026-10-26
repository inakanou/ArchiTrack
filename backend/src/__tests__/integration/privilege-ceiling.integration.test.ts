/**
 * @fileoverview 権限付与の上限の残り（ロールの作成・変更・削除、権限の追加と削除、割り当ての解除）の統合検証
 *
 * Requirements (user-authentication):
 * - REQ-38.6: 既存のロールの優先度を、保有ロールの最高の優先度より高い値へ変更することを 403 で拒否する
 * - REQ-38.7: 保有ロールの最高の優先度より高い優先度のロールの作成を 403 で拒否する
 * - REQ-38.8: システム管理者ロールを持たない利用者による、保有しない権限の追加を 403 で拒否する
 * - REQ-38.9: 保有ロールの最高の優先度より高い優先度のロールの割り当てを他のユーザーから外すことを 403 で拒否する
 * - REQ-38.10: システム管理者ロールの優先度を超える優先度の指定を 400 の検証エラーで拒否する
 * - REQ-38.11: 現在の優先度が上限より高いロールの変更（優先度・権限の追加と削除）と削除を 403 で拒否する
 * - REQ-38.12: システムロールの優先度の変更を拒否する
 *
 * 本物の経路（app.ts のロール・ロールの権限・ユーザーのロールの API）を実 DB の上で呼び、拒否の応答、
 * 権限チェックの失敗（PERMISSION_CHECK_FAILED）の記録、DB の不変を確かめる。各拒否には、同じ実行者が
 * 上限の内側の操作をできることを対照として添える。異常の検知（要件43.2）への送信は、共有の部品を
 * 記録だけの部品に差し替えて数える（計数と通知は privilege-ceiling-anomaly.integration.test.ts が担う）。
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
import { SYSTEM_ADMIN_ROLE_PRIORITY } from '../../services/privilege-ceiling.js';
import { createTestUser } from './test-user-factory.js';

const MARK = 'test-ua38-ceiling-rest';
/** 実行者の上限（保有ロールの優先度） */
const ACTOR_PRIORITY = 50;

describe('権限付与の上限の残り（統合・実 DB）', () => {
  let prisma: PrismaClient;
  let actorId: string;
  let actorToken: string;
  let adminId: string;
  let adminToken: string;
  let targetUserId: string;
  let userRoleId: string;
  let adrReadId: string;
  let roleUpdateId: string;
  let projectUpdateId: string;
  /** 異常の検知への送信の記録 */
  const observe = vi.fn();

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
      OR: [
        { actorId: { in: userIds } },
        { targetId: { in: userIds } },
        { targetId: { in: roleIds } },
      ],
    });
    await prisma.userRole.deleteMany({
      where: { OR: [{ userId: { in: userIds } }, { roleId: { in: roleIds } }] },
    });
    await prisma.rolePermission.deleteMany({ where: { roleId: { in: roleIds } } });
    await prisma.role.deleteMany({ where: { id: { in: roleIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  }

  /**
   * 共有のシステムロールの優先度を seed の値（admin 100・user 0）へ戻す。38.12 の検証が途中で失敗して
   * 優先度の変更が成立していても、共有の試験 DB を汚さない
   */
  async function restoreSystemRolePriorities(): Promise<void> {
    for (const [name, priority] of [
      ['admin', SYSTEM_ADMIN_ROLE_PRIORITY],
      ['user', 0],
    ] as const) {
      await prisma.role.updateMany({ where: { name, NOT: { priority } }, data: { priority } });
    }
  }

  async function requireRoleId(name: string): Promise<string> {
    const role = await prisma.role.findUnique({ where: { name }, select: { id: true } });
    if (!role) {
      throw new Error(`前提の欠落: ロール ${name} が試験 DB に無い`);
    }
    return role.id;
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
  ): Promise<{ id: string; name: string }> {
    const role = await prisma.role.create({
      data: { name: `${MARK}-${label}`, description: `${MARK} ${label}`, priority },
      select: { id: true, name: true },
    });
    for (const permissionId of permissionIds) {
      await prisma.rolePermission.create({ data: { roleId: role.id, permissionId } });
    }
    return role;
  }

  async function createUserWithRole(
    label: string,
    roleId: string | null,
    roleName: string
  ): Promise<{ id: string; token: string }> {
    const email = `${MARK}-${label}@example.com`;
    const user = await createTestUser(prisma, {
      email,
      displayName: `${MARK}-${label}`,
      passwordHash: 'not-used',
    });
    if (roleId) {
      await prisma.userRole.create({ data: { userId: user.id, roleId } });
    }
    const token = await tokenService.generateAccessToken({
      accessTokenGeneration: 0,
      userId: user.id,
      email,
      roles: [roleName],
    });
    return { id: user.id, token };
  }

  /** 実行者の権限チェックの失敗の記録 */
  async function ceilingRecords(actor: string, targetType: string, targetId: string) {
    return prisma.auditLog.findMany({
      where: { action: 'PERMISSION_CHECK_FAILED', actorId: actor, targetType, targetId },
      select: { metadata: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  async function rolePermissionKeys(roleId: string): Promise<string[]> {
    const rows = await prisma.rolePermission.findMany({
      where: { roleId },
      select: { permission: { select: { resource: true, action: true } } },
    });
    return rows.map((r) => `${r.permission.resource}:${r.permission.action}`).sort();
  }

  async function priorityOf(roleId: string): Promise<number | undefined> {
    return (await prisma.role.findUnique({ where: { id: roleId }, select: { priority: true } }))
      ?.priority;
  }

  /** 403 と上限による拒否の本文、異常の検知への送信を確かめる */
  function expectCeilingRejection(
    response: request.Response,
    code: string,
    userId: string = actorId
  ): void {
    expect(response.status, JSON.stringify(response.body)).toBe(403);
    expect(response.body).toMatchObject({ error: 'FORBIDDEN', code });
    expect(observe).toHaveBeenCalledWith(
      expect.objectContaining({ signal: 'permission_denied', userId })
    );
  }

  const asActor = (r: request.Test) => r.set('Authorization', `Bearer ${actorToken}`);
  const asAdmin = (r: request.Test) => r.set('Authorization', `Bearer ${adminToken}`);

  beforeAll(async () => {
    prisma = getPrismaClient();
    await initRedis();
    await cleanup();
    await seedRoles(prisma);
    await seedPermissions(prisma);
    await seedRolePermissions(prisma);

    userRoleId = await requireRoleId('user');
    adrReadId = await requirePermissionId('adr', 'read');
    roleUpdateId = await requirePermissionId('role', 'update');
    projectUpdateId = await requirePermissionId('project', 'update');

    // ロールの作成・更新・削除と利用者の更新の権限、adr:read を持つが、システム管理者ではない実行者（上限 50）
    const delegatePermissionIds = [
      await requirePermissionId('role', 'create'),
      roleUpdateId,
      await requirePermissionId('role', 'delete'),
      await requirePermissionId('user', 'update'),
      adrReadId,
    ];
    const delegateRole = await createRole('delegate', ACTOR_PRIORITY, delegatePermissionIds);
    const actor = await createUserWithRole('actor', delegateRole.id, delegateRole.name);
    actorId = actor.id;
    actorToken = actor.token;
    // 前提: 実行者は権限の検査を通る（上限の判定まで届く）
    for (const permission of ['role:create', 'role:update', 'role:delete', 'user:update']) {
      expect(await getSharedRBACService().hasPermission(actorId, permission), permission).toBe(
        true
      );
    }

    const admin = await createUserWithRole('admin', await requireRoleId('admin'), 'admin');
    adminId = admin.id;
    adminToken = admin.token;

    targetUserId = (await createUserWithRole('target', null, 'user')).id;
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
    await restoreSystemRolePriorities();
    await cleanup();
    await redis.disconnect();
  });

  /**
   * @requirement user-authentication/REQ-38.7
   */
  it('上限を超える優先度のロールを作成できず、上限ちょうどの優先度のロールは作成できる', async () => {
    const name = `${MARK}-created-over`;

    const rejected = await asActor(request(app).post('/api/v1/roles')).send({
      name,
      description: 'over',
      priority: ACTOR_PRIORITY + 1,
    });

    expectCeilingRejection(rejected, 'ROLE_PRIORITY_EXCEEDS_ACTOR');
    expect(await prisma.role.count({ where: { name } })).toBe(0);
    const records = await ceilingRecords(actorId, 'role', name);
    expect(records).toHaveLength(1);
    expect(records[0]!.metadata).toEqual({
      reason: 'ROLE_PRIORITY_EXCEEDS_ACTOR',
      requestedName: name,
      requestedPriority: String(ACTOR_PRIORITY + 1),
    });

    // 対照: 上限と同じ優先度のロールは作成できる
    const allowed = await asActor(request(app).post('/api/v1/roles')).send({
      name: `${MARK}-created-equal`,
      description: 'equal',
      priority: ACTOR_PRIORITY,
    });
    expect(allowed.status, JSON.stringify(allowed.body)).toBe(201);
    expect(allowed.body.priority).toBe(ACTOR_PRIORITY);
  });

  /**
   * @requirement user-authentication/REQ-38.6
   */
  it('上限以下のロールの優先度を上限より上へ変えられず、上限ちょうどへは変えられる', async () => {
    const role = await createRole('raise', 40);

    const rejected = await asActor(request(app).patch(`/api/v1/roles/${role.id}`)).send({
      priority: ACTOR_PRIORITY + 1,
    });

    expectCeilingRejection(rejected, 'ROLE_PRIORITY_EXCEEDS_ACTOR');
    expect(await priorityOf(role.id)).toBe(40);
    const records = await ceilingRecords(actorId, 'role', role.id);
    expect(records).toHaveLength(1);
    expect(records[0]!.metadata).toEqual({
      reason: 'ROLE_PRIORITY_EXCEEDS_ACTOR',
      currentPriority: '40',
      requestedPriority: String(ACTOR_PRIORITY + 1),
    });

    const allowed = await asActor(request(app).patch(`/api/v1/roles/${role.id}`)).send({
      priority: ACTOR_PRIORITY,
    });
    expect(allowed.status, JSON.stringify(allowed.body)).toBe(200);
    expect(await priorityOf(role.id)).toBe(ACTOR_PRIORITY);
  });

  /**
   * @requirement user-authentication/REQ-38.11
   */
  it('上限より上のロールの優先度の引き下げ・権限の追加と削除・削除を拒否し、説明の変更はできる', async () => {
    const high = await createRole('high', 80, [adrReadId]);

    const lowered = await asActor(request(app).patch(`/api/v1/roles/${high.id}`)).send({
      priority: 40,
    });
    expectCeilingRejection(lowered, 'ROLE_PRIORITY_EXCEEDS_ACTOR');

    const added = await asActor(request(app).post(`/api/v1/roles/${high.id}/permissions`)).send({
      permissionId: roleUpdateId,
    });
    expectCeilingRejection(added, 'ROLE_PRIORITY_EXCEEDS_ACTOR');

    const removed = await asActor(
      request(app).delete(`/api/v1/roles/${high.id}/permissions/${adrReadId}`)
    );
    expectCeilingRejection(removed, 'ROLE_PRIORITY_EXCEEDS_ACTOR');

    const deleted = await asActor(request(app).delete(`/api/v1/roles/${high.id}`));
    expectCeilingRejection(deleted, 'ROLE_PRIORITY_EXCEEDS_ACTOR');

    // DB は変わらない
    expect(await priorityOf(high.id)).toBe(80);
    expect(await rolePermissionKeys(high.id)).toEqual(['adr:read']);

    const roleRecords = await ceilingRecords(actorId, 'role', high.id);
    expect(roleRecords.map((r) => r.metadata)).toEqual([
      { reason: 'ROLE_PRIORITY_EXCEEDS_ACTOR', currentPriority: '80', requestedPriority: '40' },
      { reason: 'ROLE_PRIORITY_EXCEEDS_ACTOR', roleName: high.name },
    ]);
    const permissionRecords = await ceilingRecords(actorId, 'role-permission', high.id);
    expect(permissionRecords.map((r) => r.metadata)).toEqual([
      {
        reason: 'ROLE_PRIORITY_EXCEEDS_ACTOR',
        permissionId: roleUpdateId,
        permission: 'role:update',
      },
      { reason: 'ROLE_PRIORITY_EXCEEDS_ACTOR', permissionId: adrReadId, permission: 'adr:read' },
    ]);

    // 対照: 名前と説明だけの変更、同じ優先度の再送は判定しない
    const described = await asActor(request(app).patch(`/api/v1/roles/${high.id}`)).send({
      description: `${MARK} changed`,
      priority: 80,
    });
    expect(described.status, JSON.stringify(described.body)).toBe(200);
    expect(described.body.description).toBe(`${MARK} changed`);
  });

  /**
   * @requirement user-authentication/REQ-38.8
   */
  it('保有しない権限を追加できず、一括の追加は 1 件の違反で全体が反映されず、保有する権限は追加できる', async () => {
    const role = await createRole('grant', 10);

    const single = await asActor(request(app).post(`/api/v1/roles/${role.id}/permissions`)).send({
      permissionId: projectUpdateId,
    });
    expectCeilingRejection(single, 'PERMISSION_NOT_HELD_BY_ACTOR');

    // 保有する adr:read を先に置いた一括の追加も、全体がロールバックされる
    const bulk = await asActor(request(app).post(`/api/v1/roles/${role.id}/permissions`)).send({
      permissionIds: [adrReadId, projectUpdateId],
    });
    expectCeilingRejection(bulk, 'PERMISSION_NOT_HELD_BY_ACTOR');
    expect(await rolePermissionKeys(role.id)).toEqual([]);

    const records = await ceilingRecords(actorId, 'role-permission', role.id);
    expect(records).toHaveLength(2);
    for (const record of records) {
      expect(record.metadata).toEqual({
        reason: 'PERMISSION_NOT_HELD_BY_ACTOR',
        permissionId: projectUpdateId,
        permission: 'project:update',
      });
    }

    // 対照: 保有する権限は追加できる
    const allowed = await asActor(request(app).post(`/api/v1/roles/${role.id}/permissions`)).send({
      permissionIds: [adrReadId, roleUpdateId],
    });
    expect(allowed.status, JSON.stringify(allowed.body)).toBe(204);
    expect(await rolePermissionKeys(role.id)).toEqual(['adr:read', 'role:update']);
  });

  /**
   * @requirement user-authentication/REQ-38.9
   */
  it('上限を超えるロールの割り当てを他の利用者から外せず、上限ちょうどのロールは外せる', async () => {
    const high = await createRole('revoke-high', ACTOR_PRIORITY + 1);
    const equal = await createRole('revoke-equal', ACTOR_PRIORITY);
    await prisma.userRole.createMany({
      data: [
        { userId: targetUserId, roleId: high.id },
        { userId: targetUserId, roleId: equal.id },
      ],
    });

    const rejected = await asActor(
      request(app).delete(`/api/v1/users/${targetUserId}/roles/${high.id}`)
    );

    expectCeilingRejection(rejected, 'ROLE_PRIORITY_EXCEEDS_ACTOR');
    expect(await prisma.userRole.count({ where: { userId: targetUserId, roleId: high.id } })).toBe(
      1
    );
    const records = await ceilingRecords(actorId, 'user-role', targetUserId);
    expect(records.map((r) => r.metadata)).toEqual([
      { reason: 'ROLE_PRIORITY_EXCEEDS_ACTOR', roleId: high.id },
    ]);

    const allowed = await asActor(
      request(app).delete(`/api/v1/users/${targetUserId}/roles/${equal.id}`)
    );
    expect(allowed.status, JSON.stringify(allowed.body)).toBe(204);
    expect(await prisma.userRole.count({ where: { userId: targetUserId, roleId: equal.id } })).toBe(
      0
    );
  });

  /**
   * @requirement user-authentication/REQ-38.12
   */
  it('システム管理者でもシステムロールの優先度を変えられず、同じ優先度の再送は通る', async () => {
    try {
      const rejected = await asAdmin(request(app).patch(`/api/v1/roles/${userRoleId}`)).send({
        priority: 1,
      });

      expectCeilingRejection(rejected, 'SYSTEM_ROLE_PRIORITY_CHANGE_FORBIDDEN', adminId);
      expect(await priorityOf(userRoleId)).toBe(0);
      const records = await ceilingRecords(adminId, 'role', userRoleId);
      expect(records.map((r) => r.metadata)).toEqual([
        {
          reason: 'SYSTEM_ROLE_PRIORITY_CHANGE_FORBIDDEN',
          currentPriority: '0',
          requestedPriority: '1',
        },
      ]);

      const resent = await asAdmin(request(app).patch(`/api/v1/roles/${userRoleId}`)).send({
        priority: 0,
      });
      expect(resent.status, JSON.stringify(resent.body)).toBe(200);
      expect(await priorityOf(userRoleId)).toBe(0);
    } finally {
      // 拒否が誤って成立していても、共有のシステムロールの優先度を必ず戻す
      await restoreSystemRolePriorities();
    }
  });

  /**
   * @requirement user-authentication/REQ-38.10
   */
  it('システム管理者ロールの優先度を超える指定は、システム管理者でも 400 の検証エラーで、記録も異常の検知への送信もしない', async () => {
    const role = await createRole('range', 10);
    const name = `${MARK}-created-101`;
    const countFailures = () =>
      prisma.auditLog.count({ where: { action: 'PERMISSION_CHECK_FAILED', actorId: adminId } });
    const failuresBefore = await countFailures();

    const created = await asAdmin(request(app).post('/api/v1/roles')).send({
      name,
      description: 'over admin',
      priority: 101,
    });
    const updated = await asAdmin(request(app).patch(`/api/v1/roles/${role.id}`)).send({
      priority: 101,
    });

    for (const response of [created, updated]) {
      expect(response.status, JSON.stringify(response.body)).toBe(400);
      expect(response.body.code).toBe('VALIDATION_ERROR');
    }
    expect(await prisma.role.count({ where: { name } })).toBe(0);
    expect(await priorityOf(role.id)).toBe(10);
    expect(await countFailures()).toBe(failuresBefore);
    expect(observe).not.toHaveBeenCalled();

    // 対照: システム管理者ロールの優先度と等しい値は指定できる
    const equal = await asAdmin(request(app).patch(`/api/v1/roles/${role.id}`)).send({
      priority: 100,
    });
    expect(equal.status, JSON.stringify(equal.body)).toBe(200);
    expect(await priorityOf(role.id)).toBe(100);
  });
});
