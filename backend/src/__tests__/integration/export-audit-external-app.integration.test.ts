/**
 * @fileoverview 外部アプリ経由の出力の記録の統合検証（user-authentication タスク77.2）
 *
 * Requirements (user-authentication):
 * - REQ-51.8: 業務機能が外部アプリ経由の出力を記録すると、実行者の利用者に加えて外部アプリが監査ログに残る
 * - REQ-40.9: 外部アプリの欄の無い記録は従来どおりの内容で残る
 *
 * design.md「Requirements 46-51」の ExportAuditService の節のとおり、外部アプリの欄（`externalClientId`）は
 * サーバー側のコードが `ExternalAppPrincipal` から渡すサービスの入力に限り、`POST /api/v1/audit-logs/exports` の
 * 本文では受け付けない。サービスは本物の AuditLogService と共有の ProjectScopeService で、経路は本物のアプリ
 * （app.ts）で、どちらも実データベースを通す。
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
import { AuditLogService } from '../../services/audit-log.service.js';
import { ExportAuditService } from '../../services/export-audit.service.js';
import { getSharedProjectScopeService } from '../../services/project-scope.service.js';
import { getSharedRBACService } from '../../services/rbac.service.js';
import { seedPermissions, seedRolePermissions, seedRoles } from '../../utils/seed-helpers.js';
import { deleteAuditLogsWithArchivePermission } from '../../utils/audit-log-archive-permission.js';
import { createTestUser } from './test-user-factory.js';

const MARK = 'test-ua772-export-external-app';
const CLIENT_ID = 'test-ua772-claude-connector';
const CTX = { ipAddress: '203.0.113.72', userAgent: 'export-external-app-integration' };

describe('外部アプリ経由の出力の記録（統合・実 DB）', () => {
  let prisma: PrismaClient;
  let service: ExportAuditService;
  let userId: string;
  let token: string;
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

  /** 記録の成功を確かめて記録の ID を返す（失敗ならテストを失敗させる） */
  function recordIdOf(result: Awaited<ReturnType<ExportAuditService['record']>>): string {
    if (!result.ok) {
      throw new Error(`記録に失敗した: ${result.error.type}`);
    }
    return result.value.recordId;
  }

  /** 実行者の DATA_EXPORTED の行の ID の集合 */
  async function exportIds(): Promise<Set<string>> {
    const rows = await prisma.auditLog.findMany({
      where: { actorId: userId, action: 'DATA_EXPORTED' },
      select: { id: true },
    });
    return new Set(rows.map((r) => r.id));
  }

  beforeAll(async () => {
    prisma = getPrismaClient();
    await cleanup();
    await seedRoles(prisma);
    await seedPermissions(prisma);
    await seedRolePermissions(prisma);

    const role = await prisma.role.findUnique({ where: { name: 'user' } });
    if (!role) {
      throw new Error('前提の欠落: ロール user が試験 DB に無い');
    }
    const email = `${MARK}-owner@example.com`;
    const user = await createTestUser(prisma, {
      email,
      displayName: `${MARK}-owner`,
      passwordHash: 'not-used',
    });
    await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });
    userId = user.id;
    token = await tokenService.generateAccessToken({
      accessTokenGeneration: 0,
      userId,
      email,
      roles: ['user'],
    });

    const project = await prisma.project.create({
      data: { name: `${MARK}-project`, salesPersonId: userId, createdById: userId },
      select: { id: true },
    });
    projectId = project.id;

    // 経路と同じ組み立て（本物の監査ログの記録と共有の閲覧範囲の判定）
    service = new ExportAuditService({
      auditLogService: new AuditLogService({ prisma }),
      scopeService: {
        evaluateProjectAccess: (actorId, id) =>
          getSharedProjectScopeService().evaluateProjectAccess(actorId, id),
      },
    });
  });

  afterAll(async () => {
    await cleanup();
  });

  /**
   * @requirement user-authentication/REQ-51.8
   */
  it('外部アプリの欄を渡した記録は、実行者の利用者に加えて外部アプリの client ID を監査に残す', async () => {
    const result = await service.record(
      userId,
      {
        kind: 'estimate_pdf',
        projectId,
        targetIds: ['estimate-a'],
        itemCount: 1,
        externalClientId: CLIENT_ID,
      },
      CTX
    );

    const row = await prisma.auditLog.findUnique({ where: { id: recordIdOf(result) } });
    expect(row).toMatchObject({
      action: 'DATA_EXPORTED',
      actorId: userId,
      actorEmail: `${MARK}-owner@example.com`,
      targetType: 'Project',
      targetId: projectId,
    });
    expect(row!.metadata).toEqual({
      kind: 'estimate_pdf',
      projectId,
      targetIds: ['estimate-a'],
      targetIdCount: 1,
      itemCount: 1,
      externalClientId: CLIENT_ID,
      ipAddress: CTX.ipAddress,
      userAgent: CTX.userAgent,
    });
  });

  /**
   * @requirement user-authentication/REQ-51.8
   * @requirement user-authentication/REQ-40.9
   */
  it('外部アプリの欄の無い記録は、外部アプリの項目を持たない従来どおりの内容で残る', async () => {
    const result = await service.record(
      userId,
      { kind: 'quantity_table_pdf', projectId, targetIds: ['table-a', 'table-b'], itemCount: 2 },
      CTX
    );

    const row = await prisma.auditLog.findUnique({ where: { id: recordIdOf(result) } });
    expect(row).toMatchObject({ action: 'DATA_EXPORTED', actorId: userId, targetId: projectId });
    expect(row!.metadata).toEqual({
      kind: 'quantity_table_pdf',
      projectId,
      targetIds: ['table-a', 'table-b'],
      targetIdCount: 2,
      itemCount: 2,
      ipAddress: CTX.ipAddress,
      userAgent: CTX.userAgent,
    });
  });

  /**
   * @requirement user-authentication/REQ-51.8
   */
  it('記録の API の本文に外部アプリの欄を入れた要求は 400 で拒まれ、記録が増えない', async () => {
    const before = await exportIds();

    const rejected = await request(app)
      .post('/api/v1/audit-logs/exports')
      .set('Authorization', `Bearer ${token}`)
      .send({
        kind: 'estimate_pdf',
        projectId,
        targetIds: ['estimate-a'],
        itemCount: 1,
        externalClientId: CLIENT_ID,
      })
      .expect(400);

    expect(rejected.body.recordId).toBeUndefined();
    expect(await exportIds()).toEqual(before);
  });

  /**
   * @requirement user-authentication/REQ-40.9
   */
  it('外部アプリの欄の無い本文の記録の API は従来どおり記録し、外部アプリの項目を持たない', async () => {
    const response = await request(app)
      .post('/api/v1/audit-logs/exports')
      .set('Authorization', `Bearer ${token}`)
      .send({ kind: 'estimate_pdf', projectId, targetIds: ['estimate-b'], itemCount: 1 })
      .expect(201);

    const row = await prisma.auditLog.findUnique({ where: { id: response.body.recordId } });
    expect(row).toMatchObject({ action: 'DATA_EXPORTED', actorId: userId, targetId: projectId });
    expect(row!.metadata).toMatchObject({
      kind: 'estimate_pdf',
      projectId,
      targetIds: ['estimate-b'],
      itemCount: 1,
    });
    expect(row!.metadata).not.toHaveProperty('externalClientId');
  });
});
