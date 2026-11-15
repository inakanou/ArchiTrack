/**
 * @fileoverview 自社情報の保存の権限を一般ユーザーの既定から外すことの統合検証（company-info タスク10.1）
 *
 * 本物のアプリ（app.ts のルート・authenticate・requirePermission・共有の RBACService）と、
 * テスト用の実データベースを通す。試験 DB には移行（`..._company_info_update_not_default`）が適用済みで、
 * backend の seed（seed-helpers）を流した後の状態を確かめる。
 *
 * 確かめること（company-info の要件6.11）:
 * - 一般ユーザーロール（`user`）は `company_info:update` を持たず、`company_info:read` は持つ
 * - 一般ユーザーだけを持つ利用者の `PUT /api/company-info` は 403 になる
 * - システム管理者は `company_info:update` を持つ
 * - 移行の SQL は、一般ユーザーロールの割り当てだけを消し、他のロールの割り当てを残す
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
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
import { createTestUser } from './test-user-factory.js';

const MARK = 'test-ci101-company-info-perm';
const OTHER_ROLE_NAME = `${MARK}-role`;

/** 移行の SQL（試験 DB に当たっているものと同じファイル） */
const MIGRATION_SQL_PATH = fileURLToPath(
  new URL(
    '../../../prisma/migrations/20261115000000_company_info_update_not_default/migration.sql',
    import.meta.url
  )
);

describe('自社情報の保存の権限の既定（統合・実 DB）', () => {
  let prisma: PrismaClient;
  let regularUserId: string;
  let regularToken: string;
  let adminUserId: string;

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
    // 退行で一般ユーザーの保存が通ったときに書かれた自社情報を残さない
    await prisma.companyInfo.deleteMany({ where: { companyName: { contains: MARK } } });
    const otherRole = await prisma.role.findUnique({ where: { name: OTHER_ROLE_NAME } });
    if (otherRole) {
      await prisma.rolePermission.deleteMany({ where: { roleId: otherRole.id } });
      await prisma.role.delete({ where: { id: otherRole.id } });
    }
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
    const user = await createTestUser(prisma, {
      email,
      displayName: `${MARK}-${suffix}`,
      passwordHash: 'not-used',
    });
    await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });
    const token = await tokenService.generateAccessToken({
      accessTokenGeneration: 0,
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
      throw new Error(`前提の欠落: ロール ${roleName} が試験 DB に無い`);
    }
    return role.rolePermissions.map((rp) => `${rp.permission.resource}:${rp.permission.action}`);
  }

  async function companyInfoUpdatePermissionId(): Promise<string> {
    const permission = await prisma.permission.findUnique({
      where: { resource_action: { resource: 'company_info', action: 'update' } },
    });
    if (!permission) {
      throw new Error('前提の欠落: 権限 company_info:update が試験 DB に無い');
    }
    return permission.id;
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
  });

  afterAll(async () => {
    await cleanup();
  });

  /**
   * @requirement company-info/REQ-6.11
   */
  it('一般ユーザーロールは company_info:read を持ち、company_info:update を持たない', async () => {
    const keys = await rolePermissionKeys('user');
    expect(keys).toContain('company_info:read');
    expect(keys).not.toContain('company_info:update');
  });

  /**
   * @requirement company-info/REQ-6.11
   */
  it('一般ユーザーの PUT /api/company-info は 403 になり、システム管理者は保存の権限を持つ', async () => {
    const response = await request(app)
      .put('/api/company-info')
      .set('Authorization', `Bearer ${regularToken}`)
      .send({
        companyName: `${MARK} 株式会社`,
        address: '東京都千代田区',
        representative: '代表 太郎',
        version: 0,
      });
    expect(response.status).toBe(403);

    const rbac = getSharedRBACService();
    expect(await rbac.hasPermission(regularUserId, 'company_info:update')).toBe(false);
    expect(await rbac.hasPermission(regularUserId, 'company_info:read')).toBe(true);
    expect(await rbac.hasPermission(adminUserId, 'company_info:update')).toBe(true);
  });

  /**
   * @requirement company-info/REQ-6.11
   */
  it('移行の SQL は一般ユーザーロールの割り当てだけを消し、他のロールの割り当てを残す', async () => {
    const permissionId = await companyInfoUpdatePermissionId();
    const userRole = await prisma.role.findUnique({ where: { name: 'user' } });
    if (!userRole) {
      throw new Error('前提の欠落: システムロール user が試験 DB に無い');
    }
    const otherRole = await prisma.role.create({
      data: { name: OTHER_ROLE_NAME, description: '自社情報の保存を任されたロール（試験）' },
    });
    // 稼働中の環境の状態（一般ユーザーロールが保存の権限を持つ）と、管理者が付けた別のロールを用意する
    await prisma.rolePermission.createMany({
      data: [
        { roleId: userRole.id, permissionId },
        { roleId: otherRole.id, permissionId },
      ],
      skipDuplicates: true,
    });
    expect(await rolePermissionKeys('user')).toContain('company_info:update');

    let userKeys: string[];
    let otherKeys: string[];
    try {
      await prisma.$executeRawUnsafe(readFileSync(MIGRATION_SQL_PATH, 'utf8'));
      // 移行の直後の状態を読む（後片付けより前）
      userKeys = await rolePermissionKeys('user');
      otherKeys = await rolePermissionKeys(OTHER_ROLE_NAME);
    } finally {
      // 失敗しても一般ユーザーロールに保存の権限を残さない（他の試験へ漏らさない）
      await prisma.rolePermission.deleteMany({ where: { roleId: userRole.id, permissionId } });
      await getSharedRBACService().invalidateUserPermissionsCache(regularUserId);
    }

    expect(userKeys).not.toContain('company_info:update');
    expect(userKeys).toContain('company_info:read');
    expect(otherKeys).toContain('company_info:update');
  });
});
