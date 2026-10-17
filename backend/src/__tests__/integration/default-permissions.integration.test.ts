/**
 * @fileoverview 既定の権限の統合検証（user-authentication タスク44.4）
 *
 * 本物のアプリ（app.ts のルート・authenticate・requirePermission・共有の RBACService）と、
 * テスト用の実データベースを通す。試験 DB には移行（`..._default_permissions`）が適用済みで、
 * backend の seed（seed-helpers）を流した後の状態を確かめる。
 *
 * 確かめること:
 * - 要件38.4: 一般ユーザーロール（`user`）の既定権限に `user:read` が無く、
 *   一般ユーザーだけを持つ利用者の `GET /api/v1/users` は 403 になる
 * - 要件39.5: 権限 `project:read_all`（全案件閲覧）と `ops:manage`（運用設定の管理）が存在し、
 *   システム管理者（`admin` の `*:*`）は両方を持ち、一般ユーザーはどちらも持たない
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { validateEnv } from '../../config/env.js';
import type { PrismaClient } from '../../generated/prisma/client.js';

// 環境変数を初期化（トークン発行の鍵を読むため、アプリとサービスのインポート前に実行）
validateEnv();

import app from '../../app.js';
import getPrismaClient from '../../db.js';
import tokenService from '../../services/token.service.js';
import { getSharedRBACService } from '../../services/rbac.service.js';
import { seedPermissions, seedRolePermissions, seedRoles } from '../../utils/seed-helpers.js';
import { deleteAuditLogsWithArchivePermission } from '../../utils/audit-log-archive-permission.js';

const MARK = 'test-ua444-default-perms';

describe('既定の権限（統合・実 DB）', () => {
  let prisma: PrismaClient;
  let regularUserId: string;
  let regularToken: string;
  let adminUserId: string;
  let adminToken: string;

  async function cleanup(): Promise<void> {
    const users = await prisma.user.findMany({
      where: { email: { contains: MARK } },
      select: { id: true },
    });
    const userIds = users.map((u) => u.id);
    if (userIds.length > 0) {
      const rbac = getSharedRBACService();
      for (const id of userIds) {
        await rbac.invalidateUserPermissionsCache(id);
      }
    }
    await deleteAuditLogsWithArchivePermission(prisma, {
      OR: [{ actorId: { in: userIds } }, { targetId: { in: userIds } }],
    });
    await prisma.userRole.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  }

  async function createUserWithRole(
    suffix: string,
    roleName: 'user' | 'admin'
  ): Promise<{ id: string; token: string }> {
    const role = await prisma.role.findUnique({ where: { name: roleName } });
    if (!role) {
      throw new Error(`前提の欠落: システムロール ${roleName} が試験 DB に無い`);
    }
    const email = `${MARK}-${suffix}@example.com`;
    const user = await prisma.user.create({
      data: { email, displayName: `${MARK}-${suffix}`, passwordHash: 'not-used' },
    });
    await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });
    const token = await tokenService.generateAccessToken({
      userId: user.id,
      email,
      roles: [roleName],
    });
    return { id: user.id, token };
  }

  async function rolePermissionKeys(roleName: string): Promise<string[]> {
    const role = await prisma.role.findUnique({
      where: { name: roleName },
      include: { rolePermissions: { include: { permission: true } } },
    });
    if (!role) {
      throw new Error(`前提の欠落: システムロール ${roleName} が試験 DB に無い`);
    }
    return role.rolePermissions.map((rp) => `${rp.permission.resource}:${rp.permission.action}`);
  }

  beforeAll(async () => {
    prisma = getPrismaClient();
    await cleanup();
    // seed は冪等。移行の後に seed を流した状態（本番・試験の起動と同じ順序）で確かめる
    await seedRoles(prisma);
    await seedPermissions(prisma);
    await seedRolePermissions(prisma);

    const regular = await createUserWithRole('regular', 'user');
    regularUserId = regular.id;
    regularToken = regular.token;
    const admin = await createUserWithRole('admin', 'admin');
    adminUserId = admin.id;
    adminToken = admin.token;
  });

  afterAll(async () => {
    await cleanup();
  });

  it('全案件閲覧（project:read_all）と運用設定の管理（ops:manage）の権限が存在する', async () => {
    const permissions = await prisma.permission.findMany({
      where: {
        OR: [
          { resource: 'project', action: 'read_all' },
          { resource: 'ops', action: 'manage' },
        ],
      },
    });
    expect(permissions.map((p) => `${p.resource}:${p.action}`).sort()).toEqual([
      'ops:manage',
      'project:read_all',
    ]);
  });

  it('一般ユーザーロールは user:read・project:read_all・ops:manage を持たない（38.4）', async () => {
    const keys = await rolePermissionKeys('user');
    // 前提: 一般ユーザーロールに既定の権限が割り当てられている（空なら判定が素通りになる）
    expect(keys).toContain('project:read');
    expect(keys).not.toContain('user:read');
    expect(keys).not.toContain('project:read_all');
    expect(keys).not.toContain('ops:manage');
  });

  it('一般ユーザーの GET /api/v1/users は 403 になる（38.4）', async () => {
    const response = await request(app)
      .get('/api/v1/users')
      .set('Authorization', `Bearer ${regularToken}`);
    expect(response.status).toBe(403);
  });

  it('システム管理者の GET /api/v1/users は 200 になる（一覧の閲覧は管理者に残る）', async () => {
    const response = await request(app)
      .get('/api/v1/users')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(response.status).toBe(200);
  });

  it('システム管理者は全案件閲覧と運用設定の管理の権限を持ち、一般ユーザーは持たない（39.5）', async () => {
    const rbac = getSharedRBACService();
    expect(await rbac.hasPermission(adminUserId, 'project:read_all')).toBe(true);
    expect(await rbac.hasPermission(adminUserId, 'ops:manage')).toBe(true);
    expect(await rbac.hasPermission(regularUserId, 'project:read_all')).toBe(false);
    expect(await rbac.hasPermission(regularUserId, 'ops:manage')).toBe(false);
    expect(await rbac.hasPermission(regularUserId, 'user:read')).toBe(false);
  });
});
