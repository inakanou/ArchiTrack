/**
 * @fileoverview 発注一覧と月別出来高の出力の記録の統合検証（execution-budget-management タスク17.2）
 *
 * サーバーで生成する発注一覧（`GET /orders/:orderId/export`）と月別出来高（`GET /progress/monthly/export`）の
 * 出力が、ファイルの生成の前に監査 `DATA_EXPORTED` を種別・案件・対象・件数つきで 1 件残すこと、
 * 記録の失敗ではファイルを生成せず 500 と識別子 `EXPORT_RECORD_FAILED` を返すこと、
 * 範囲外・不在の 404 の要求は記録しないことを確かめる。
 *
 * 被覆する受入基準（execution-budget-management の Requirement 20 の受入基準7・8）は各 it の
 * `@requirement` の印が名乗る。
 *
 * 本物のアプリ（app.ts のルート・authenticate・requirePermission・requireProjectScope・
 * ExportAuditService）とテスト用の実データベースを通す。記録の失敗は、ルートの AuditLogService の
 * 記録を `DATA_EXPORTED` のときだけ失敗させて起こす（user-deletion-audit の統合テストと同じ手段）。
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
import { OrderExportService } from '../../services/order-export.service.js';
import { ProgressExportService } from '../../services/progress-export.service.js';
import type { CreateAuditLogInput } from '../../types/audit-log.types.js';
import { seedPermissions, seedRolePermissions, seedRoles } from '../../utils/seed-helpers.js';
import { deleteAuditLogsWithArchivePermission } from '../../utils/audit-log-archive-permission.js';
import { createTestUser } from './test-user-factory.js';

const MARK = 'test-eb172-export-audit';
const MEMBER_ROLE = `${MARK}-member`;
/** 版 4・変種 8 の整った UUID（ID の形式の検査を通り、どの行としても存在しない） */
const MISSING_ID = '00000000-0000-4000-8000-000000017200';

interface TestUser {
  id: string;
  token: string;
}

describe('発注一覧と月別出来高の出力の記録（統合・実 DB）', () => {
  let prisma: PrismaClient;
  let member: TestUser;
  let outsider: TestUser;
  let projectId: string;
  let budgetId: string;
  let orderId: string;

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
    // 発注項目・出来高項目は実行予算項目を指すため先に消す。
    // 実行予算・項目・発注・出来高・契約・見積書は案件の削除に連なって消える
    const budgetWhere = { executionBudget: { projectId: { in: projectIds } } };
    await prisma.orderItem.deleteMany({ where: { order: budgetWhere } });
    await prisma.progressRecordItem.deleteMany({ where: { progressRecord: budgetWhere } });
    await prisma.projectStatusHistory.deleteMany({ where: { projectId: { in: projectIds } } });
    await prisma.project.deleteMany({ where: { id: { in: projectIds } } });
    await prisma.tradingPartner.deleteMany({ where: { name: { contains: MARK } } });
    await prisma.userRole.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.rolePermission.deleteMany({ where: { role: { name: MEMBER_ROLE } } });
    await prisma.role.deleteMany({ where: { name: MEMBER_ROLE } });
  }

  async function createUser(suffix: string): Promise<TestUser> {
    const email = `${MARK}-${suffix}@example.com`;
    const user = await createTestUser(prisma, {
      email,
      displayName: `${MARK}-${suffix}`,
      passwordHash: 'not-used',
    });
    const role = await prisma.role.findUniqueOrThrow({ where: { name: MEMBER_ROLE } });
    await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });
    const token = await tokenService.generateAccessToken({
      accessTokenGeneration: 0,
      userId: user.id,
      email,
      roles: [MEMBER_ROLE],
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

  function orderExportPath(format: 'xlsx' | 'pdf', id = orderId, project = projectId): string {
    return `/api/projects/${project}/execution-budget/orders/${id}/export?format=${format}`;
  }

  function progressExportPath(format: 'xlsx' | 'pdf', project = projectId): string {
    return `/api/projects/${project}/execution-budget/progress/monthly/export?format=${format}`;
  }

  beforeAll(async () => {
    prisma = getPrismaClient();
    await cleanup();
    await seedRoles(prisma);
    await seedPermissions(prisma);
    await seedRolePermissions(prisma);

    const role = await prisma.role.create({
      data: { name: MEMBER_ROLE, description: 'execution-budget-management タスク17.2 の検証用' },
    });
    const permissions = await prisma.permission.findMany({
      where: {
        OR: [
          { resource: 'order', action: 'read' },
          { resource: 'progress', action: 'read' },
        ],
      },
    });
    expect(permissions, '前提の欠落: order:read・progress:read が試験 DB に無い').toHaveLength(2);
    await prisma.rolePermission.createMany({
      data: permissions.map((p) => ({ roleId: role.id, permissionId: p.id })),
    });

    member = await createUser('member');
    outsider = await createUser('outsider');

    const partner = await prisma.tradingPartner.create({
      data: {
        name: `${MARK}-partner`,
        nameKana: 'テストキョウリョクギョウシャ',
        address: '東京都千代田区1-1-1',
        types: { create: [{ type: 'SUBCONTRACTOR' }] },
      },
      select: { id: true },
    });

    const project = await prisma.project.create({
      data: { name: `${MARK}-project`, salesPersonId: member.id, createdById: member.id },
      select: { id: true },
    });
    projectId = project.id;
    const estimate = await prisma.estimate.create({
      data: { projectId, name: `${MARK}-estimate` },
      select: { id: true },
    });
    const contract = await prisma.contract.create({
      data: {
        projectId,
        contractType: 'NEW',
        status: 'CONTRACTED',
        estimateId: estimate.id,
        contractDate: new Date('2026-01-01'),
        constructionStartDate: new Date('2026-02-01'),
        constructionEndDate: new Date('2026-12-31'),
        deliveryDate: new Date('2027-01-15'),
        taxRate: 0.1,
        contractAmount: 22000,
        constructionPrice: 20000,
        taxAmount: 2000,
      },
      select: { id: true },
    });
    const budget = await prisma.executionBudget.create({
      data: { projectId, contractId: contract.id },
      select: { id: true },
    });
    budgetId = budget.id;
    const itemIds: string[] = [];
    for (const [index, name] of ['項目1', '項目2', '項目3'].entries()) {
      const item = await prisma.executionBudgetItem.create({
        data: {
          executionBudgetId: budgetId,
          displayOrder: index,
          name: `${MARK}-${name}`,
          unit: 'm2',
          quantity: 10,
          executionUnitPrice: 1000,
          executionAmount: 10000,
        },
        select: { id: true },
      });
      itemIds.push(item.id);
    }
    // チェック済みは 2 件（出力の件数はチェック済みの項目の数）
    const order = await prisma.order.create({
      data: {
        executionBudgetId: budgetId,
        tradingPartnerId: partner.id,
        items: {
          create: [
            { executionBudgetItemId: itemIds[0]!, checked: true },
            { executionBudgetItemId: itemIds[1]!, checked: true },
            { executionBudgetItemId: itemIds[2]!, checked: false },
          ],
        },
      },
      select: { id: true },
    });
    orderId = order.id;
    // 出来高は 2 か月（出力の件数は月の数）
    for (const date of ['2026-09-10', '2026-10-10']) {
      await prisma.progressRecord.create({
        data: {
          executionBudgetId: budgetId,
          constructionDate: new Date(date),
          items: { create: [{ executionBudgetItemId: itemIds[0]!, amount: 3000 }] },
        },
      });
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await cleanup();
  });

  describe('出力のたびの記録（20.7）', () => {
    /**
     * @requirement execution-budget-management/REQ-20.7
     */
    it.each(['xlsx', 'pdf'] as const)(
      '発注一覧の出力（%s）は監査 DATA_EXPORTED を種別 order_export・案件・発注・チェック済み項目の件数つきで 1 件残す',
      async (format) => {
        const before = await exportRecordIds(member.id);

        const response = await request(app)
          .get(orderExportPath(format))
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
          kind: 'order_export',
          projectId,
          targetIds: [orderId],
          itemCount: 2,
        });
      }
    );

    /**
     * @requirement execution-budget-management/REQ-20.7
     */
    it.each(['xlsx', 'pdf'] as const)(
      '月別出来高の出力（%s）は監査 DATA_EXPORTED を種別 progress_export・案件・実行予算・月の数つきで 1 件残す',
      async (format) => {
        const monthly = await request(app)
          .get(`/api/projects/${projectId}/execution-budget/progress/monthly`)
          .set('Authorization', `Bearer ${member.token}`)
          .expect(200);
        expect(monthly.body).toHaveLength(2);
        const before = await exportRecordIds(member.id);

        const response = await request(app)
          .get(progressExportPath(format))
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
          kind: 'progress_export',
          projectId,
          targetIds: [budgetId],
          itemCount: 2,
        });
      }
    );
  });

  describe('記録の失敗（20.8）', () => {
    /**
     * @requirement execution-budget-management/REQ-20.8
     */
    it('記録が失敗すると発注一覧のファイルを生成せず、ファイルを含まない 500 と EXPORT_RECORD_FAILED を返す', async () => {
      failExportRecord();
      const excel = vi.spyOn(OrderExportService.prototype, 'exportToExcel');
      const pdf = vi.spyOn(OrderExportService.prototype, 'exportToPdf');
      const before = await exportRecordIds(member.id);

      for (const format of ['xlsx', 'pdf'] as const) {
        const response = await request(app)
          .get(orderExportPath(format))
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

    /**
     * @requirement execution-budget-management/REQ-20.8
     */
    it('記録が失敗すると月別出来高のファイルを生成せず、ファイルを含まない 500 と EXPORT_RECORD_FAILED を返す', async () => {
      failExportRecord();
      const excel = vi.spyOn(ProgressExportService.prototype, 'exportToExcel');
      const pdf = vi.spyOn(ProgressExportService.prototype, 'exportToPdf');
      const before = await exportRecordIds(member.id);

      for (const format of ['xlsx', 'pdf'] as const) {
        const response = await request(app)
          .get(progressExportPath(format))
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

  describe('404 の要求は記録しない（20.7）', () => {
    /**
     * @requirement execution-budget-management/REQ-20.7
     */
    it('範囲外の利用者の出力と、存在しない発注・案件の出力は 404 で、監査 DATA_EXPORTED を残さない', async () => {
      const outsiderBefore = await exportRecordIds(outsider.id);
      for (const path of [orderExportPath('xlsx'), progressExportPath('xlsx')]) {
        await request(app).get(path).set('Authorization', `Bearer ${outsider.token}`).expect(404);
      }
      expect(await addedExportRecords(outsider.id, outsiderBefore)).toHaveLength(0);

      const memberBefore = await exportRecordIds(member.id);
      for (const path of [
        orderExportPath('xlsx', MISSING_ID),
        orderExportPath('pdf', orderId, MISSING_ID),
        progressExportPath('xlsx', MISSING_ID),
      ]) {
        await request(app).get(path).set('Authorization', `Bearer ${member.token}`).expect(404);
      }
      expect(await addedExportRecords(member.id, memberBefore)).toHaveLength(0);
    });
  });
});
