/**
 * @fileoverview 案件の API への閲覧範囲の適用の統合検証（user-authentication タスク52.3）
 *
 * 本物のアプリ（app.ts のルート・authenticate・requirePermission・requireProjectScope・共有の
 * ProjectScopeService と RBACService）と、テスト用の実データベースを通す。
 *
 * Requirements (user-authentication):
 * - REQ-39.2: 範囲外の案件への ID 指定のアクセスは、存在しない案件と同じ 404 の本文になる
 * - REQ-39.3: 案件の一覧・検索・状態ごとの件数は、範囲内の案件だけを返す
 *
 * 利用者:
 * - 営業担当者・工事担当者・作成者（関係者）と、担当外の利用者。いずれもテストで作るロール
 *   （project の read・update・delete を持ち、project:read_all を持たない）を持つ
 * - システム管理者（`admin` の `*:*` で project:read_all を持つ）
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
import { createTestUser } from './test-user-factory.js';

const MARK = 'test-ua523-project-scope';
const MEMBER_ROLE = `${MARK}-member`;
/** 版 4・変種 8 の整った UUID（ID の形式の検査を通り、案件としては存在しない） */
const MISSING_PROJECT_ID = '00000000-0000-4000-8000-000000000523';

interface TestUser {
  id: string;
  token: string;
}

describe('案件の API の閲覧範囲（統合・実 DB）', () => {
  let prisma: PrismaClient;
  let sales: TestUser;
  let construction: TestUser;
  let creator: TestUser;
  let outsider: TestUser;
  let admin: TestUser;
  let projectId: string;
  let projectName: string;

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
    const projects = await prisma.project.findMany({
      where: { name: { contains: MARK } },
      select: { id: true },
    });
    const projectIds = projects.map((p) => p.id);
    await deleteAuditLogsWithArchivePermission(prisma, {
      OR: [
        { actorId: { in: userIds } },
        { targetId: { in: userIds } },
        { targetId: { in: projectIds } },
      ],
    });
    await prisma.projectStatusHistory.deleteMany({ where: { projectId: { in: projectIds } } });
    await prisma.project.deleteMany({ where: { id: { in: projectIds } } });
    await prisma.userRole.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.rolePermission.deleteMany({ where: { role: { name: MEMBER_ROLE } } });
    await prisma.role.deleteMany({ where: { name: MEMBER_ROLE } });
  }

  async function createUser(suffix: string, roleName: string): Promise<TestUser> {
    const role = await prisma.role.findUnique({ where: { name: roleName } });
    if (!role) {
      throw new Error(`前提の欠落: ロール ${roleName} が試験 DB に無い`);
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

  async function createProject(
    suffix: string,
    people: { salesPersonId: string; constructionPersonId?: string; createdById: string }
  ): Promise<{ id: string; name: string }> {
    const name = `${MARK}-${suffix}`;
    const project = await prisma.project.create({
      data: { name, ...people },
      select: { id: true, name: true },
    });
    return project;
  }

  function withoutInstance(body: Record<string, unknown>): Record<string, unknown> {
    const { instance: _instance, ...rest } = body;
    return rest;
  }

  beforeAll(async () => {
    prisma = getPrismaClient();
    await cleanup();
    await seedRoles(prisma);
    await seedPermissions(prisma);
    await seedRolePermissions(prisma);

    // project の read・update・delete を持ち、project:read_all を持たないロール
    const role = await prisma.role.create({
      data: { name: MEMBER_ROLE, description: 'タスク52.3 の検証用' },
    });
    const permissions = await prisma.permission.findMany({
      where: { resource: 'project', action: { in: ['read', 'update', 'delete'] } },
    });
    expect(permissions).toHaveLength(3);
    await prisma.rolePermission.createMany({
      data: permissions.map((p) => ({ roleId: role.id, permissionId: p.id })),
    });

    sales = await createUser('sales', MEMBER_ROLE);
    construction = await createUser('construction', MEMBER_ROLE);
    creator = await createUser('creator', MEMBER_ROLE);
    outsider = await createUser('outsider', MEMBER_ROLE);
    admin = await createUser('admin', 'admin');

    const project = await createProject('target', {
      salesPersonId: sales.id,
      constructionPersonId: construction.id,
      createdById: creator.id,
    });
    projectId = project.id;
    projectName = project.name;
  });

  afterAll(async () => {
    await cleanup();
  });

  describe('一覧・検索・件数（39.3）', () => {
    /**
     * @requirement user-authentication/REQ-39.3
     */
    it('担当外の利用者の一覧と検索に案件が出ず、件数は 0 になる', async () => {
      const list = await request(app)
        .get('/api/projects')
        .query({ limit: 100 })
        .set('Authorization', `Bearer ${outsider.token}`)
        .expect(200);
      expect(list.body.data.map((p: { id: string }) => p.id)).not.toContain(projectId);
      // 担当外の利用者は関係する案件を持たない
      expect(list.body.pagination.total).toBe(0);

      const search = await request(app)
        .get('/api/projects')
        .query({ search: projectName })
        .set('Authorization', `Bearer ${outsider.token}`)
        .expect(200);
      expect(search.body.data).toEqual([]);

      const counts = await request(app)
        .get('/api/projects/status-counts')
        .set('Authorization', `Bearer ${outsider.token}`)
        .expect(200);
      expect(counts.body.total).toBe(0);
      expect(counts.body.counts.PREPARING).toBe(0);
    });

    /**
     * @requirement user-authentication/REQ-39.3
     */
    it('営業担当者・工事担当者・作成者の一覧・検索・件数には案件が出る', async () => {
      for (const user of [sales, construction, creator]) {
        const search = await request(app)
          .get('/api/projects')
          .query({ search: projectName })
          .set('Authorization', `Bearer ${user.token}`)
          .expect(200);
        expect(search.body.data.map((p: { id: string }) => p.id)).toEqual([projectId]);

        const list = await request(app)
          .get('/api/projects')
          .query({ limit: 100 })
          .set('Authorization', `Bearer ${user.token}`)
          .expect(200);
        expect(list.body.pagination.total).toBe(1);

        const counts = await request(app)
          .get('/api/projects/status-counts')
          .set('Authorization', `Bearer ${user.token}`)
          .expect(200);
        expect(counts.body.total).toBe(1);
        expect(counts.body.counts.PREPARING).toBe(1);
      }
    });

    /**
     * @requirement user-authentication/REQ-39.3
     */
    it('全案件閲覧の権限を持つシステム管理者の一覧と件数は絞り込まれない', async () => {
      const search = await request(app)
        .get('/api/projects')
        .query({ search: projectName })
        .set('Authorization', `Bearer ${admin.token}`)
        .expect(200);
      expect(search.body.data.map((p: { id: string }) => p.id)).toEqual([projectId]);

      const counts = await request(app)
        .get('/api/projects/status-counts')
        .set('Authorization', `Bearer ${admin.token}`)
        .expect(200);
      // 管理者は関係者でない。対象の案件（準備中）が件数に含まれる
      expect(counts.body.counts.PREPARING).toBeGreaterThanOrEqual(1);
      expect(counts.body.total).toBeGreaterThanOrEqual(1);
    });
  });

  describe('ID 指定の要求（39.2）', () => {
    /**
     * @requirement user-authentication/REQ-39.2
     */
    it('担当外の利用者の詳細・詳細の集計・状態の履歴は、存在しない案件と同じ 404 の本文になる', async () => {
      for (const suffix of ['', '/detail-summary', '/status-history']) {
        const missing = await request(app)
          .get(`/api/projects/${MISSING_PROJECT_ID}${suffix}`)
          .set('Authorization', `Bearer ${outsider.token}`)
          .expect(404);
        const outOfScope = await request(app)
          .get(`/api/projects/${projectId}${suffix}`)
          .set('Authorization', `Bearer ${outsider.token}`)
          .expect(404);

        expect(outOfScope.body.code).toBe('NOT_FOUND');
        expect(withoutInstance(outOfScope.body)).toEqual(withoutInstance(missing.body));
        // 本文に案件の ID や名前を含めない（instance は要求の経路そのもの）
        expect(JSON.stringify(withoutInstance(outOfScope.body))).not.toContain(projectId);
        expect(JSON.stringify(outOfScope.body)).not.toContain(projectName);
      }
    });

    /**
     * @requirement user-authentication/REQ-39.2
     */
    it('担当外の利用者の更新・状態変更・削除は 404 になり、案件は変わらない', async () => {
      const before = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });

      const missingUpdate = await request(app)
        .put(`/api/projects/${MISSING_PROJECT_ID}`)
        .set('Authorization', `Bearer ${outsider.token}`)
        .send({ name: `${MARK}-renamed`, expectedUpdatedAt: before.updatedAt.toISOString() })
        .expect(404);
      const update = await request(app)
        .put(`/api/projects/${projectId}`)
        .set('Authorization', `Bearer ${outsider.token}`)
        .send({ name: `${MARK}-renamed`, expectedUpdatedAt: before.updatedAt.toISOString() })
        .expect(404);
      expect(withoutInstance(update.body)).toEqual(withoutInstance(missingUpdate.body));

      const status = await request(app)
        .patch(`/api/projects/${projectId}/status`)
        .set('Authorization', `Bearer ${outsider.token}`)
        .send({ status: 'SURVEYING' })
        .expect(404);
      expect(status.body.code).toBe('NOT_FOUND');

      const deletion = await request(app)
        .delete(`/api/projects/${projectId}`)
        .set('Authorization', `Bearer ${outsider.token}`)
        .expect(404);
      expect(deletion.body.code).toBe('NOT_FOUND');

      const after = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
      expect(after.name).toBe(before.name);
      expect(after.status).toBe(before.status);
      expect(after.deletedAt).toBeNull();
      expect(after.updatedAt.toISOString()).toBe(before.updatedAt.toISOString());
    });

    /**
     * @requirement user-authentication/REQ-39.2
     */
    it('範囲外のアクセスだけが PROJECT_SCOPE_DENIED として記録される', async () => {
      await request(app)
        .get(`/api/projects/${projectId}`)
        .set('Authorization', `Bearer ${outsider.token}`)
        .expect(404);

      const denied = await prisma.auditLog.findMany({
        where: { action: 'PROJECT_SCOPE_DENIED', actorId: outsider.id },
      });
      expect(denied.length).toBeGreaterThan(0);
      expect(denied.every((log) => log.targetId === projectId)).toBe(true);
    });

    /**
     * @requirement user-authentication/REQ-39.2
     */
    it('関係者とシステム管理者は詳細・詳細の集計・状態の履歴を取得できる', async () => {
      for (const user of [sales, construction, creator, admin]) {
        const detail = await request(app)
          .get(`/api/projects/${projectId}`)
          .set('Authorization', `Bearer ${user.token}`)
          .expect(200);
        expect(detail.body.id).toBe(projectId);

        const summary = await request(app)
          .get(`/api/projects/${projectId}/detail-summary`)
          .set('Authorization', `Bearer ${user.token}`)
          .expect(200);
        expect(summary.body.project.id).toBe(projectId);

        await request(app)
          .get(`/api/projects/${projectId}/status-history`)
          .set('Authorization', `Bearer ${user.token}`)
          .expect(200);
      }
    });

    /**
     * @requirement user-authentication/REQ-39.2
     */
    it('関係者は状態変更・更新・削除を行える', async () => {
      const own = await createProject('own', {
        salesPersonId: sales.id,
        createdById: creator.id,
      });

      await request(app)
        .patch(`/api/projects/${own.id}/status`)
        .set('Authorization', `Bearer ${sales.token}`)
        .send({ status: 'SURVEYING' })
        .expect(200);

      const current = await prisma.project.findUniqueOrThrow({ where: { id: own.id } });
      await request(app)
        .put(`/api/projects/${own.id}`)
        .set('Authorization', `Bearer ${creator.token}`)
        .send({ name: `${MARK}-own-renamed`, expectedUpdatedAt: current.updatedAt.toISOString() })
        .expect(200);

      await request(app)
        .delete(`/api/projects/${own.id}`)
        .set('Authorization', `Bearer ${sales.token}`)
        .expect(204);
      const deleted = await prisma.project.findUniqueOrThrow({ where: { id: own.id } });
      expect(deleted.deletedAt).not.toBeNull();
    });
  });
});
