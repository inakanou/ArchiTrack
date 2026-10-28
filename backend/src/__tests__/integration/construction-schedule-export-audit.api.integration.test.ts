/**
 * @fileoverview 工程表の出力の記録の統合検証（construction-schedule タスク22.2）
 *
 * サーバーで生成する工程表の Excel・PDF の出力（`GET /api/schedules/:id/export`）が、ファイルの生成の前に
 * 監査 `DATA_EXPORTED` を種別・案件・対象・件数つきで 1 件残すこと、記録の失敗ではファイルを生成せず
 * 500 と識別子 `EXPORT_RECORD_FAILED` を返すこと、範囲外・不在の 404 と format の 400 と権限なしの 403 の
 * 要求は記録しないことを確かめる。
 *
 * 被覆する受入基準（construction-schedule の Requirement 13.6・13.7）は各 it の `@requirement` の印が名乗る。
 *
 * 本物のアプリ（app.ts のルート・authenticate・requirePermission・requireProjectScope・
 * ExportAuditService）とテスト用の実データベースを通す。記録の失敗は、ルートの AuditLogService の
 * 記録を `DATA_EXPORTED` のときだけ失敗させて起こす（execution-budget-management タスク17.2 の統合テストと同じ手段）。
 * 監査ログは削除できない（トリガー audit_logs_immutable）ため、行は本テストで作る利用者の ID で数える。
 */

import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import request from 'supertest';
import { validateEnv } from '../../config/env.js';
import type { PrismaClient, Prisma } from '../../generated/prisma/client.js';

// 環境変数を初期化（トークン発行の鍵を読むため、アプリとサービスのインポート前に実行）
validateEnv();

import app from '../../app.js';
import getPrismaClient from '../../db.js';
import tokenService from '../../services/token.service.js';
import { getSharedRBACService } from '../../services/rbac.service.js';
import { AuditLogService } from '../../services/audit-log.service.js';
import { ScheduleExportService } from '../../services/schedule-export.service.js';
import type { CreateAuditLogInput } from '../../types/audit-log.types.js';
import { seedPermissions, seedRolePermissions, seedRoles } from '../../utils/seed-helpers.js';
import { deleteAuditLogsWithArchivePermission } from '../../utils/audit-log-archive-permission.js';
import { createTestUser } from './test-user-factory.js';

const MARK = 'test-cs222-export-audit';
const MEMBER_ROLE = `${MARK}-member`;
const NO_PERMISSION_ROLE = `${MARK}-no-permission`;
/** 版 4・変種 8 の整った UUID（ID の形式の検査を通り、どの行としても存在しない） */
const MISSING_ID = '00000000-0000-4000-8000-000000022200';

interface TestUser {
  id: string;
  token: string;
}

describe('工程表の出力の記録（統合・実 DB）', () => {
  let prisma: PrismaClient;
  let member: TestUser;
  let outsider: TestUser;
  let noPermission: TestUser;
  let projectId: string;
  let otherProjectId: string;
  let scheduleId: string;

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
    // 工程表・工程項目は案件の削除に連なって消える
    await prisma.projectStatusHistory.deleteMany({ where: { projectId: { in: projectIds } } });
    await prisma.project.deleteMany({ where: { id: { in: projectIds } } });
    await prisma.userRole.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    const roleNames = [MEMBER_ROLE, NO_PERMISSION_ROLE];
    await prisma.rolePermission.deleteMany({ where: { role: { name: { in: roleNames } } } });
    await prisma.role.deleteMany({ where: { name: { in: roleNames } } });
  }

  async function createUser(suffix: string, roleName: string): Promise<TestUser> {
    const email = `${MARK}-${suffix}@example.com`;
    const user = await createTestUser(prisma, {
      email,
      displayName: `${MARK}-${suffix}`,
      passwordHash: 'not-used',
    });
    const role = await prisma.role.findUniqueOrThrow({ where: { name: roleName } });
    await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });
    const token = await tokenService.generateAccessToken({
      accessTokenGeneration: 0,
      userId: user.id,
      email,
      roles: [roleName],
    });
    return { id: user.id, token };
  }

  /** 利用者が残した DATA_EXPORTED の行の ID */
  async function exportRecordIds(userId: string): Promise<Set<string>> {
    const rows = await prisma.auditLog.findMany({
      where: { action: 'DATA_EXPORTED', actorId: userId },
      select: { id: true },
    });
    return new Set(rows.map((r) => r.id));
  }

  /** 要求の前後で増えた DATA_EXPORTED の行 */
  async function addedExportRecords(userId: string, before: Set<string>) {
    const after = await exportRecordIds(userId);
    const added = [...after].filter((id) => !before.has(id));
    return prisma.auditLog.findMany({ where: { id: { in: added } } });
  }

  /** ルートの AuditLogService の記録を、DATA_EXPORTED のときだけ失敗させる（他の記録は本物を通す） */
  function failExportRecord(): void {
    const original = AuditLogService.prototype.createLog;
    vi.spyOn(AuditLogService.prototype, 'createLog').mockImplementation(async function (
      this: AuditLogService,
      input: CreateAuditLogInput,
      tx?: Prisma.TransactionClient
    ) {
      if (input.action !== 'DATA_EXPORTED') {
        return original.call(this, input, tx);
      }
      throw new Error('injected export audit write failure');
    });
  }

  function exportPath(format: string, id = scheduleId): string {
    return `/api/schedules/${id}/export?format=${format}`;
  }

  beforeAll(async () => {
    prisma = getPrismaClient();
    await cleanup();
    await seedRoles(prisma);
    await seedPermissions(prisma);
    await seedRolePermissions(prisma);

    const role = await prisma.role.create({
      data: { name: MEMBER_ROLE, description: 'construction-schedule タスク22.2 の検証用' },
    });
    const permissions = await prisma.permission.findMany({
      where: { resource: 'schedule', action: 'read' },
    });
    expect(permissions, '前提の欠落: schedule:read が試験 DB に無い').toHaveLength(1);
    await prisma.rolePermission.createMany({
      data: permissions.map((p) => ({ roleId: role.id, permissionId: p.id })),
    });
    await prisma.role.create({
      data: { name: NO_PERMISSION_ROLE, description: 'construction-schedule タスク22.2 の検証用' },
    });

    member = await createUser('member', MEMBER_ROLE);
    outsider = await createUser('outsider', MEMBER_ROLE);
    noPermission = await createUser('no-permission', NO_PERMISSION_ROLE);

    const project = await prisma.project.create({
      data: { name: `${MARK}-project`, salesPersonId: member.id, createdById: member.id },
      select: { id: true },
    });
    projectId = project.id;
    const otherProject = await prisma.project.create({
      data: { name: `${MARK}-other`, salesPersonId: member.id, createdById: member.id },
      select: { id: true },
    });
    otherProjectId = otherProject.id;

    // 工程項目は 3 件、出力対象は 2 件（出力の件数は出力対象の工程項目の数。Requirement 9.3）
    const schedule = await prisma.constructionSchedule.create({
      data: {
        projectId,
        name: `${MARK}-schedule`,
        version: 0,
        items: {
          create: [
            { itemName: '工程1', displayOrder: 0, duration: 3, isExportTarget: true },
            { itemName: '工程2', displayOrder: 1, duration: 5, isExportTarget: false },
            { itemName: '工程3', displayOrder: 2, duration: 2, isExportTarget: true },
          ],
        },
      },
      select: { id: true },
    });
    scheduleId = schedule.id;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await cleanup();
  });

  describe('出力のたびの記録（13.6）', () => {
    /**
     * @requirement construction-schedule/REQ-13.6
     */
    it.each(['xlsx', 'pdf'] as const)(
      '工程表の出力（%s）は生成の前に監査 DATA_EXPORTED を種別 schedule_export・案件・工程表・出力対象の件数つきで 1 件残す',
      async (format) => {
        const before = await exportRecordIds(member.id);
        const method = format === 'xlsx' ? 'exportToExcel' : 'exportToPdf';
        const original = ScheduleExportService.prototype[method];
        const recordedBeforeGeneration: number[] = [];
        const generator = vi
          .spyOn(ScheduleExportService.prototype, method)
          .mockImplementation(async function (
            this: ScheduleExportService,
            ...args: Parameters<typeof original>
          ) {
            // 生成が始まる時点で記録が既に 1 件残っていること（記録は生成の前。13.6）
            recordedBeforeGeneration.push((await addedExportRecords(member.id, before)).length);
            return original.apply(this, args);
          });

        const response = await request(app)
          .get(exportPath(format))
          .set('Authorization', `Bearer ${member.token}`)
          .buffer(true)
          .expect(200);
        expect(response.headers['content-disposition']).toContain('attachment');

        const added = await addedExportRecords(member.id, before);
        expect(added).toHaveLength(1);
        expect(added[0]).toMatchObject({
          action: 'DATA_EXPORTED',
          actorId: member.id,
          targetType: 'Project',
          targetId: projectId,
        });
        expect(added[0]!.metadata).toMatchObject({
          kind: 'schedule_export',
          projectId,
          targetIds: [scheduleId],
          itemCount: 2,
        });
        expect(generator).toHaveBeenCalledTimes(1);
        expect(recordedBeforeGeneration).toEqual([1]);
      }
    );
  });

  describe('記録の失敗（13.7）', () => {
    /**
     * @requirement construction-schedule/REQ-13.7
     */
    it('記録が失敗すると工程表のファイルを生成せず、ファイルを含まない 500 と EXPORT_RECORD_FAILED を返す', async () => {
      failExportRecord();
      const excel = vi.spyOn(ScheduleExportService.prototype, 'exportToExcel');
      const pdf = vi.spyOn(ScheduleExportService.prototype, 'exportToPdf');
      const before = await exportRecordIds(member.id);

      for (const format of ['xlsx', 'pdf'] as const) {
        const response = await request(app)
          .get(exportPath(format))
          .set('Authorization', `Bearer ${member.token}`)
          .expect(500);

        expect(response.headers['content-type']).toContain('json');
        expect(response.headers['content-disposition']).toBeUndefined();
        expect(response.body).toMatchObject({
          status: 500,
          code: 'EXPORT_RECORD_FAILED',
          detail: '出力を記録できなかったため中止しました',
        });
      }
      expect(excel).not.toHaveBeenCalled();
      expect(pdf).not.toHaveBeenCalled();
      expect(await addedExportRecords(member.id, before)).toHaveLength(0);
    });
  });

  describe('404・400・403 の要求は記録しない（13.6）', () => {
    /**
     * @requirement construction-schedule/REQ-13.6
     */
    it('範囲外の利用者の出力と、存在しない工程表・経路の案件の食い違う出力は 404 で、監査 DATA_EXPORTED を残さずファイルを生成しない', async () => {
      const excel = vi.spyOn(ScheduleExportService.prototype, 'exportToExcel');
      const pdf = vi.spyOn(ScheduleExportService.prototype, 'exportToPdf');

      const outsiderBefore = await exportRecordIds(outsider.id);
      for (const format of ['xlsx', 'pdf']) {
        await request(app)
          .get(exportPath(format))
          .set('Authorization', `Bearer ${outsider.token}`)
          .expect(404);
      }
      expect(await addedExportRecords(outsider.id, outsiderBefore)).toHaveLength(0);

      const memberBefore = await exportRecordIds(member.id);
      for (const path of [
        exportPath('xlsx', MISSING_ID),
        `/api/projects/${otherProjectId}/schedules/${scheduleId}/export?format=pdf`,
      ]) {
        await request(app).get(path).set('Authorization', `Bearer ${member.token}`).expect(404);
      }
      expect(await addedExportRecords(member.id, memberBefore)).toHaveLength(0);
      expect(excel).not.toHaveBeenCalled();
      expect(pdf).not.toHaveBeenCalled();
    });

    /**
     * @requirement construction-schedule/REQ-13.6
     */
    it('format の不正の 400 と、出力の権限を持たない利用者の 403 は、監査 DATA_EXPORTED を残さない', async () => {
      const memberBefore = await exportRecordIds(member.id);
      for (const path of [exportPath('csv'), `/api/schedules/${scheduleId}/export`]) {
        await request(app).get(path).set('Authorization', `Bearer ${member.token}`).expect(400);
      }
      expect(await addedExportRecords(member.id, memberBefore)).toHaveLength(0);

      const noPermissionBefore = await exportRecordIds(noPermission.id);
      await request(app)
        .get(exportPath('xlsx'))
        .set('Authorization', `Bearer ${noPermission.token}`)
        .expect(403);
      expect(await addedExportRecords(noPermission.id, noPermissionBefore)).toHaveLength(0);
    });
  });
});
