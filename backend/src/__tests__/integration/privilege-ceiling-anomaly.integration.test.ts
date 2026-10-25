/**
 * @fileoverview 権限付与の上限による拒否（403）を異常の検知へ送ることの統合検証
 *
 * Requirements (user-authentication):
 * - REQ-43.2: 権限チェックの失敗（403）の件数が閾値を超えると全システム管理者へ通知する
 * - REQ-38.1〜38.3: 権限付与の上限（ロールの割り当て・全権限の追加・システムロールの名前の変更）
 *
 * 権限の検査（requirePermission）を通った後に、権限付与の上限で拒否される 403 も「権限の拒否」として数える。
 * 観測は本物の経路（app.ts のロールの割り当て・ロールの権限の追加・ロールの更新）から送らせ、計数は実 Redis、
 * 宛先は実 DB の有効なシステム管理者で決める（メールの投入だけを記録の部品で代える）。
 * 閾値は本検証だけで下げた部品を共有の部品と差し替え、Redis の鍵は本検証だけの接頭辞で数える。
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'crypto';
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
import { loadSecurityAlertConfig } from '../../config/security-alert.js';
import { AdminNotificationService } from '../../services/admin-notification.service.js';
import {
  SecurityAnomalyMonitor,
  setSharedSecurityAnomalyMonitor,
} from '../../services/security-anomaly-monitor.service.js';
import { createTestUser } from './test-user-factory.js';

const MARK = 'test-ua43-ceiling-anomaly';
/** 本検証だけの Redis の鍵の接頭辞 */
const KEY_PREFIX = `${MARK}:${randomUUID()}:`;
/** 下げた閾値（4 件目で超える） */
const THRESHOLD = 3;
/** 上限の検証のための委任ロール（システム管理者より低い優先度で、利用者・ロールの更新の権限を持つ） */
const DELEGATE_ROLE_NAME = `${MARK}-delegate`;

interface SentEmail {
  to: string;
  subject: string;
  lines: string[];
}

describe('権限付与の上限による拒否の異常の検知（統合・実 DB・実 Redis）', () => {
  let prisma: PrismaClient;
  let monitor: SecurityAnomalyMonitor;
  let sent: SentEmail[];
  let adminEmail: string;
  let delegateId: string;
  let delegateToken: string;
  let targetUserId: string;
  let adminRoleId: string;
  let userRoleId: string;
  let delegateRoleId: string;
  let wildcardPermissionId: string;

  const emailSender = {
    sendAdminNotificationEmail: vi.fn(async (to: string, subject: string, lines: string[]) => {
      sent.push({ to, subject, lines });
    }),
  };

  async function cleanup(): Promise<void> {
    const client = redis.getClient();
    if (client) {
      const keys = await client.keys(`${KEY_PREFIX}*`);
      if (keys.length > 0) {
        await client.del(...keys);
      }
    }
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

  async function settle(): Promise<void> {
    await monitor.flush();
  }

  beforeAll(async () => {
    prisma = getPrismaClient();
    await initRedis();
    const client = redis.getClient();
    // 前提: 実 Redis に接続できていること（できなければ計数は捨てられ、ここでの観測にならないため赤にする）
    expect(client, 'REDIS_URL の Redis クライアントが初期化されていない').not.toBeNull();
    expect(client!.status, '実 Redis に接続できていない').toBe('ready');

    await cleanup();
    await seedRoles(prisma);
    await seedPermissions(prisma);
    await seedRolePermissions(prisma);

    adminRoleId = await requireRoleId('admin');
    userRoleId = await requireRoleId('user');
    wildcardPermissionId = await requirePermissionId('*', '*');

    // 通知の宛先のシステム管理者
    adminEmail = `${MARK}-admin@example.com`;
    const admin = await createTestUser(prisma, {
      email: adminEmail,
      displayName: `${MARK}-admin`,
      passwordHash: 'not-used',
    });
    await prisma.userRole.create({ data: { userId: admin.id, roleId: adminRoleId } });

    // 利用者・ロールの更新の権限を持つが、システム管理者ではない実行者
    const delegateRole = await prisma.role.create({
      data: { name: DELEGATE_ROLE_NAME, description: `${MARK} delegate`, priority: 10 },
      select: { id: true },
    });
    delegateRoleId = delegateRole.id;
    for (const [resource, action] of [
      ['user', 'update'],
      ['role', 'update'],
    ] as const) {
      await prisma.rolePermission.create({
        data: { roleId: delegateRoleId, permissionId: await requirePermissionId(resource, action) },
      });
    }
    const delegateEmail = `${MARK}-delegate@example.com`;
    const delegate = await createTestUser(prisma, {
      email: delegateEmail,
      displayName: `${MARK}-delegate`,
      passwordHash: 'not-used',
    });
    await prisma.userRole.create({ data: { userId: delegate.id, roleId: delegateRoleId } });
    delegateId = delegate.id;
    delegateToken = await tokenService.generateAccessToken({
      accessTokenGeneration: 0,
      userId: delegate.id,
      email: delegateEmail,
      roles: [DELEGATE_ROLE_NAME],
    });
    // 前提: 実行者は権限の検査を通る（上限の判定まで届く）
    expect(await getSharedRBACService().hasPermission(delegateId, 'user:update')).toBe(true);
    expect(await getSharedRBACService().hasPermission(delegateId, 'role:update')).toBe(true);

    const target = await createTestUser(prisma, {
      email: `${MARK}-target@example.com`,
      displayName: `${MARK}-target`,
      passwordHash: 'not-used',
    });
    targetUserId = target.id;

    monitor = new SecurityAnomalyMonitor({
      getRedisClient: () => redis.getClient(),
      getNotifier: () => new AdminNotificationService(prisma, emailSender),
      config: loadSecurityAlertConfig({
        SECURITY_ALERT_LOGIN_FAILED_THRESHOLD: String(THRESHOLD),
        SECURITY_ALERT_PERMISSION_DENIED_THRESHOLD: String(THRESHOLD),
        SECURITY_ALERT_RATE_LIMITED_THRESHOLD: String(THRESHOLD),
        SECURITY_ALERT_SERVER_ERROR_THRESHOLD: String(THRESHOLD),
        SECURITY_ALERT_DATA_EXPORT_THRESHOLD: String(THRESHOLD),
      }),
      keyPrefix: KEY_PREFIX,
    });
    setSharedSecurityAnomalyMonitor(monitor);
    sent = [];
  });

  afterAll(async () => {
    setSharedSecurityAnomalyMonitor(null);
    await cleanup();
    await redis.disconnect();
  });

  /**
   * @requirement user-authentication/REQ-43.2
   */
  it('上限による 403（ロールの割り当て・全権限の追加・システムロールの名前の変更）を権限の拒否として数え、閾値を超えると通知する', async () => {
    const assignAdmin = () =>
      request(app)
        .post(`/api/v1/users/${targetUserId}/roles`)
        .set('Authorization', `Bearer ${delegateToken}`)
        .send({ roleIds: [adminRoleId] });
    const grantWildcard = () =>
      request(app)
        .post(`/api/v1/roles/${delegateRoleId}/permissions`)
        .set('Authorization', `Bearer ${delegateToken}`)
        .send({ permissionId: wildcardPermissionId });
    const renameSystemRole = () =>
      request(app)
        .patch(`/api/v1/roles/${userRoleId}`)
        .set('Authorization', `Bearer ${delegateToken}`)
        .send({ name: `${MARK}-renamed` });

    const first = await assignAdmin();
    expect(first.status).toBe(403);
    expect(first.body.code).toBe('SYSTEM_ADMIN_REQUIRED');
    const second = await grantWildcard();
    expect(second.status).toBe(403);
    expect(second.body.code).toBe('SYSTEM_ADMIN_REQUIRED');
    const third = await renameSystemRole();
    expect(third.status).toBe(403);
    expect(third.body.code).toBe('SYSTEM_ROLE_RENAME_FORBIDDEN');
    await settle();
    expect(sent).toHaveLength(0);

    expect((await assignAdmin()).status).toBe(403);
    await settle();

    const notices = sent.filter((m) => m.to === adminEmail && m.subject.includes('権限の拒否'));
    expect(notices).toHaveLength(1);
    const body = notices[0]!.lines.join('\n');
    expect(body).toContain('（permission_denied）');
    expect(body).toContain(`件数: ${THRESHOLD + 1} 件（閾値 ${THRESHOLD} 件）`);
    expect(body).toContain(`主な利用者 ID: ${delegateId}（4 件）`);

    // 上限で拒否されたので、ロール・権限・名前は変わっていない
    expect(
      await prisma.userRole.count({ where: { userId: targetUserId, roleId: adminRoleId } })
    ).toBe(0);
    expect(
      await prisma.rolePermission.count({
        where: { roleId: delegateRoleId, permissionId: wildcardPermissionId },
      })
    ).toBe(0);
    expect((await prisma.role.findUnique({ where: { id: userRoleId } }))?.name).toBe('user');
  });
});
