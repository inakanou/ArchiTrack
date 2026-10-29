/**
 * @fileoverview データ出力の記録の API と監査ログの JSON 出力の記録の統合検証（user-authentication タスク53.3）
 *
 * Requirements (user-authentication):
 * - REQ-40.9: データの出力を記録すると、実行者・出力の種別・対象の案件とデータ・件数・日時が監査ログに残る
 *
 * design.md「監査」の ExportAuditService の節のとおり、`POST /api/v1/audit-logs/exports` は認証済みの
 * 全利用者が呼べ、案件を指定した記録は閲覧範囲で判定し、範囲外は存在しない案件と同じ 404 にする。
 * 監査ログの JSON 出力（`GET /api/v1/audit-logs/export`）は同じ手段で記録する。
 * 本物のアプリ（app.ts のルート・authenticate・共有の ProjectScopeService と RBACService）と実データベースを通す。
 * 監査ログは削除できない（トリガー audit_logs_immutable）ため、行は記録の ID と本テストで作る利用者の ID で数える。
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

const MARK = 'test-ua533-export-audit';
/** 版 4・変種 8 の整った UUID（形式の検査を通り、案件としては存在しない） */
const MISSING_PROJECT_ID = '00000000-0000-4000-8000-000000000533';

interface TestUser {
  id: string;
  token: string;
}

describe('データ出力の記録（統合・実 DB）', () => {
  let prisma: PrismaClient;
  let owner: TestUser;
  let outsider: TestUser;
  let admin: TestUser;
  let projectId: string;

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
    await prisma.project.deleteMany({ where: { id: { in: projectIds } } });
    await prisma.userRole.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
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

  /** 実行者と種別で監査ログの行の ID を数える（重複のない ID の集合） */
  async function auditIds(actorId: string, action: string): Promise<Set<string>> {
    const rows = await prisma.auditLog.findMany({
      where: { actorId, action },
      select: { id: true },
    });
    return new Set(rows.map((r) => r.id));
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

    // 一般ユーザー（project:read_all を持たない）と、システム管理者（`*:*`）
    owner = await createUser('owner', 'user');
    outsider = await createUser('outsider', 'user');
    admin = await createUser('admin', 'admin');
    expect(await getSharedRBACService().hasPermission(outsider.id, 'project:read_all')).toBe(false);

    const project = await prisma.project.create({
      data: { name: `${MARK}-project`, salesPersonId: owner.id, createdById: owner.id },
      select: { id: true },
    });
    projectId = project.id;
  });

  afterAll(async () => {
    await cleanup();
  });

  /**
   * @requirement user-authentication/REQ-40.9
   */
  it('範囲内の案件の出力の記録が、実行者・種別・案件・対象・件数・日時とともに監査に残る', async () => {
    const before = Date.now();
    const response = await request(app)
      .post('/api/v1/audit-logs/exports')
      .set('Authorization', `Bearer ${owner.token}`)
      .set('User-Agent', 'export-audit-integration')
      .send({
        kind: 'site_survey_report_pdf',
        projectId,
        targetIds: ['survey-a', 'survey-b'],
        itemCount: 2,
      })
      .expect(201);

    const recordId = response.body.recordId as string;
    expect(typeof recordId).toBe('string');
    const row = await prisma.auditLog.findUnique({ where: { id: recordId } });
    expect(row).not.toBeNull();
    expect(row).toMatchObject({
      action: 'DATA_EXPORTED',
      actorId: owner.id,
      actorEmail: `${MARK}-owner@example.com`,
      targetType: 'Project',
      targetId: projectId,
    });
    expect(row!.metadata).toMatchObject({
      kind: 'site_survey_report_pdf',
      projectId,
      targetIds: ['survey-a', 'survey-b'],
      targetIdCount: 2,
      itemCount: 2,
      userAgent: 'export-audit-integration',
    });
    expect(row!.createdAt.getTime()).toBeGreaterThanOrEqual(before - 1000);
  });

  /**
   * @requirement user-authentication/REQ-40.9
   */
  it('範囲外の案件の記録は存在しない案件と同じ 404 になり、出力の記録は残らない', async () => {
    const exportsBefore = await auditIds(outsider.id, 'DATA_EXPORTED');
    const deniedBefore = await auditIds(outsider.id, 'PROJECT_SCOPE_DENIED');
    const body = { kind: 'quantity_table_pdf', targetIds: ['table-a'], itemCount: 1 };

    const outOfScope = await request(app)
      .post('/api/v1/audit-logs/exports')
      .set('Authorization', `Bearer ${outsider.token}`)
      .send({ ...body, projectId })
      .expect(404);
    const missing = await request(app)
      .post('/api/v1/audit-logs/exports')
      .set('Authorization', `Bearer ${outsider.token}`)
      .send({ ...body, projectId: MISSING_PROJECT_ID })
      .expect(404);

    expect(withoutInstance(outOfScope.body)).toEqual(withoutInstance(missing.body));
    expect(JSON.stringify(outOfScope.body)).not.toContain(projectId);
    expect(await auditIds(outsider.id, 'DATA_EXPORTED')).toEqual(exportsBefore);

    // 範囲外のアクセスは記録する（存在しない案件は記録しない）
    const deniedAfter = await auditIds(outsider.id, 'PROJECT_SCOPE_DENIED');
    const added = [...deniedAfter].filter((id) => !deniedBefore.has(id));
    expect(added).toHaveLength(1);
    const denied = await prisma.auditLog.findUnique({ where: { id: added[0]! } });
    expect(denied).toMatchObject({ targetType: 'Project', targetId: projectId });
  });

  /**
   * @requirement user-authentication/REQ-40.9
   */
  it('全案件閲覧の権限を持つ利用者は担当外の案件の出力も記録できる', async () => {
    const response = await request(app)
      .post('/api/v1/audit-logs/exports')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ kind: 'estimate_pdf', projectId, targetIds: [], itemCount: 0 })
      .expect(201);

    const row = await prisma.auditLog.findUnique({ where: { id: response.body.recordId } });
    expect(row).toMatchObject({ action: 'DATA_EXPORTED', actorId: admin.id, targetId: projectId });
  });

  /**
   * @requirement user-authentication/REQ-40.9
   */
  it('不正な入力は 400 で記録せず、未認証は 401 になる', async () => {
    const exportsBefore = await auditIds(owner.id, 'DATA_EXPORTED');

    await request(app)
      .post('/api/v1/audit-logs/exports')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ kind: 'secret_dump', projectId, targetIds: [], itemCount: 1 })
      .expect(400);
    await request(app)
      .post('/api/v1/audit-logs/exports')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ kind: 'estimate_pdf', projectId, targetIds: [], itemCount: -1 })
      .expect(400);
    await request(app)
      .post('/api/v1/audit-logs/exports')
      .send({ kind: 'estimate_pdf', projectId, targetIds: [], itemCount: 1 })
      .expect(401);

    expect(await auditIds(owner.id, 'DATA_EXPORTED')).toEqual(exportsBefore);
  });

  /**
   * @requirement user-authentication/REQ-40.9
   */
  it('内訳書の項目のクリップボードへのコピーは案件に属する出力として記録され、案件の無い要求は 400 になる', async () => {
    const exportsBefore = await auditIds(owner.id, 'DATA_EXPORTED');

    await request(app)
      .post('/api/v1/audit-logs/exports')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({
        kind: 'itemized_statement_clipboard',
        projectId: null,
        targetIds: ['statement-a'],
        itemCount: 3,
      })
      .expect(400);
    expect(await auditIds(owner.id, 'DATA_EXPORTED')).toEqual(exportsBefore);

    const response = await request(app)
      .post('/api/v1/audit-logs/exports')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({
        kind: 'itemized_statement_clipboard',
        projectId,
        targetIds: ['statement-a'],
        itemCount: 3,
      })
      .expect(201);

    const row = await prisma.auditLog.findUnique({ where: { id: response.body.recordId } });
    expect(row).toMatchObject({
      action: 'DATA_EXPORTED',
      actorId: owner.id,
      targetType: 'Project',
      targetId: projectId,
    });
    expect(row!.metadata).toMatchObject({
      kind: 'itemized_statement_clipboard',
      projectId,
      targetIds: ['statement-a'],
      itemCount: 3,
    });
    const added = [...(await auditIds(owner.id, 'DATA_EXPORTED'))].filter(
      (id) => !exportsBefore.has(id)
    );
    expect(added).toEqual([response.body.recordId]);
  });

  /**
   * @requirement user-authentication/REQ-40.9
   */
  it('監査ログの JSON 出力が、出力した行の ID と件数とともに記録される', async () => {
    // 出力する行を本テストの中で作る（一般ユーザーの出力の記録）
    await prisma.auditLog.create({
      data: {
        action: 'DATA_EXPORTED',
        actorId: owner.id,
        targetType: 'Project',
        targetId: projectId,
        metadata: { kind: 'estimate_pdf' },
      },
    });
    const exportsBefore = await auditIds(admin.id, 'DATA_EXPORTED');

    const response = await request(app)
      .get('/api/v1/audit-logs/export')
      .query({ actorId: owner.id })
      .set('Authorization', `Bearer ${admin.token}`)
      .expect(200);

    const exported = JSON.parse(response.text) as Array<{ id: string }>;
    expect(exported.length).toBeGreaterThan(0);

    const exportsAfter = await auditIds(admin.id, 'DATA_EXPORTED');
    const added = [...exportsAfter].filter((id) => !exportsBefore.has(id));
    expect(added).toHaveLength(1);
    const row = await prisma.auditLog.findUnique({ where: { id: added[0]! } });
    expect(row).toMatchObject({
      action: 'DATA_EXPORTED',
      actorId: admin.id,
      targetType: 'DataExport',
      targetId: 'audit_log_json',
    });
    expect(row!.metadata).toMatchObject({
      kind: 'audit_log_json',
      projectId: null,
      targetIds: exported.map((log) => log.id),
      targetIdCount: exported.length,
      itemCount: exported.length,
    });
  });
});
