/**
 * @fileoverview 実行予算・発注・出来高・原価・月次締め・出力の API への案件の閲覧範囲の適用の統合検証
 * （execution-budget-management タスク17.1）
 *
 * 本物のアプリ（app.ts のルート・authenticate・requirePermission・requireProjectScope・共有の
 * ProjectScopeService と RBACService）とテスト用の実データベースを通す。
 *
 * 被覆する受入基準（execution-budget-management の Requirement 20.1〜20.6 と、改訂した Requirement 17.1〜17.6）は
 * 各 it の `@requirement` の印が名乗る。出力の記録（20.7・20.8）はタスク17.2 の担当で、本ファイルは扱わない。
 *
 * 利用者（いずれもテストで作るロール。ロール名は admin ではない）:
 * - MEMBER: 実行予算・発注・出来高・原価・月次締めの権限だけを持ち、全案件閲覧の権限を持たない
 * - READ_ALL: MEMBER の権限に全案件閲覧の権限（project:read_all）を加えたもの
 * - 案件 target の営業担当者・工事担当者・作成者（関係者）、担当外の利用者、全案件閲覧の利用者、権限なしの利用者
 * - 案件 other の営業担当者・作成者は担当外の利用者（他の案件の子リソースを用意するため）
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

const MARK = 'test-eb17-scope';
const MEMBER_ROLE = `${MARK}-member`;
const READ_ALL_ROLE = `${MARK}-read-all`;
const NO_PERMISSION_ROLE = `${MARK}-no-permission`;
/** 版 4・変種 8 の整った UUID（ID の形式の検査を通り、どの行としても存在しない） */
const MISSING_ID = '00000000-0000-4000-8000-000000017100';
/** 出来高記録・月次締めの基準の日付と月 */
const PROGRESS_DATE = '2026-10-01';
const CLOSED_MONTH = '2026-09';

interface TestUser {
  id: string;
  token: string;
}

interface Fixture {
  projectId: string;
  contractId: string;
  amendmentContractId: string;
  budgetId: string;
  itemIds: [string, string];
  orderId: string;
  progressRecordId: string;
}

type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete';

interface RouteCall {
  method: HttpMethod;
  path: string;
  body?: Record<string, unknown>;
}

describe('実行予算・発注・出来高・原価・月次締め・出力の API の閲覧範囲（統合・実 DB）', () => {
  let prisma: PrismaClient;
  let sales: TestUser;
  let construction: TestUser;
  let creator: TestUser;
  let outsider: TestUser;
  let readAll: TestUser;
  let noPermission: TestUser;
  let tradingPartnerId: string;
  let target: Fixture;
  let other: Fixture;

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
    // 発注項目・出来高項目は他の案件の実行予算項目を指しうる（是正前の振る舞いで作られた行）ため先に消す。
    // 実行予算・項目・発注・出来高・月次締め履歴・契約・見積書は案件の削除に連なって消える
    const budgetWhere = { executionBudget: { projectId: { in: projectIds } } };
    await prisma.orderItem.deleteMany({
      where: { OR: [{ order: budgetWhere }, { executionBudgetItem: budgetWhere }] },
    });
    await prisma.progressRecordItem.deleteMany({
      where: { OR: [{ progressRecord: budgetWhere }, { executionBudgetItem: budgetWhere }] },
    });
    await prisma.projectStatusHistory.deleteMany({ where: { projectId: { in: projectIds } } });
    await prisma.project.deleteMany({ where: { id: { in: projectIds } } });
    await prisma.tradingPartner.deleteMany({ where: { name: { contains: MARK } } });
    await prisma.userRole.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    const roleNames = [MEMBER_ROLE, READ_ALL_ROLE, NO_PERMISSION_ROLE];
    await prisma.rolePermission.deleteMany({ where: { role: { name: { in: roleNames } } } });
    await prisma.role.deleteMany({ where: { name: { in: roleNames } } });
  }

  async function createRole(name: string, permissions: Array<[string, string]>): Promise<void> {
    const role = await prisma.role.create({
      data: { name, description: 'execution-budget-management タスク17 の検証用' },
    });
    const records = await prisma.permission.findMany({
      where: { OR: permissions.map(([resource, action]) => ({ resource, action })) },
    });
    expect(records, `前提の欠落: ロール ${name} の権限が試験 DB に揃っていない`).toHaveLength(
      permissions.length
    );
    if (records.length > 0) {
      await prisma.rolePermission.createMany({
        data: records.map((p) => ({ roleId: role.id, permissionId: p.id })),
      });
    }
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

  function auth(user: TestUser): [string, string] {
    return ['Authorization', `Bearer ${user.token}`];
  }

  function withoutInstance(body: Record<string, unknown>): Record<string, unknown> {
    const { instance: _instance, ...rest } = body;
    return rest;
  }

  function send(user: TestUser, call: RouteCall): request.Test {
    const req = request(app)
      [call.method](call.path)
      .set(...auth(user));
    return call.body === undefined ? req : req.send(call.body);
  }

  /** 見積項目（実行の行 1 つ）を 1 件ずつ持つ見積書を作る */
  async function createEstimate(projectId: string, label: string): Promise<string> {
    const estimate = await prisma.estimate.create({
      data: {
        projectId,
        name: `${MARK}-${label}-estimate`,
        items: {
          create: [
            {
              displayOrder: 0,
              lines: {
                create: [
                  {
                    lineType: 'EXECUTION',
                    name: `${label} の項目`,
                    unit: 'm2',
                    quantity: 10,
                    unitPrice: 1000,
                    amount: 10000,
                  },
                ],
              },
            },
          ],
        },
      },
      select: { id: true },
    });
    return estimate.id;
  }

  async function createContract(
    projectId: string,
    estimateId: string,
    contractType: 'NEW' | 'AMENDMENT',
    parentContractId?: string
  ): Promise<string> {
    const contract = await prisma.contract.create({
      data: {
        projectId,
        contractType,
        status: 'CONTRACTED',
        estimateId,
        parentContractId: parentContractId ?? null,
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
    return contract.id;
  }

  /** 案件・見積書・契約（新規と変更）・実行予算（2 項目）・発注・出来高記録・月次締め履歴を作る */
  async function createFixture(
    label: string,
    people: { salesPersonId: string; constructionPersonId?: string; createdById: string }
  ): Promise<Fixture> {
    const project = await prisma.project.create({
      data: { name: `${MARK}-${label}`, ...people },
      select: { id: true },
    });
    const estimateId = await createEstimate(project.id, label);
    const contractId = await createContract(project.id, estimateId, 'NEW');
    const amendmentEstimateId = await createEstimate(project.id, `${label}-amendment`);
    const amendmentContractId = await createContract(
      project.id,
      amendmentEstimateId,
      'AMENDMENT',
      contractId
    );
    const budget = await prisma.executionBudget.create({
      data: { projectId: project.id, contractId },
      select: { id: true },
    });
    const first = await prisma.executionBudgetItem.create({
      data: {
        executionBudgetId: budget.id,
        displayOrder: 0,
        name: `${MARK}-${label}-item-1`,
        unit: 'm2',
        quantity: 10,
        executionUnitPrice: 1000,
        executionAmount: 10000,
      },
      select: { id: true },
    });
    const second = await prisma.executionBudgetItem.create({
      data: {
        executionBudgetId: budget.id,
        displayOrder: 1,
        name: `${MARK}-${label}-item-2`,
        unit: 'm3',
        quantity: 5,
        executionUnitPrice: 2000,
        executionAmount: 10000,
      },
      select: { id: true },
    });
    const order = await prisma.order.create({
      data: {
        executionBudgetId: budget.id,
        tradingPartnerId,
        items: {
          create: [
            { executionBudgetItemId: first.id, checked: true },
            { executionBudgetItemId: second.id, checked: false },
          ],
        },
      },
      select: { id: true },
    });
    const progress = await prisma.progressRecord.create({
      data: {
        executionBudgetId: budget.id,
        constructionDate: new Date(PROGRESS_DATE),
        items: { create: [{ executionBudgetItemId: first.id, amount: 3000 }] },
      },
      select: { id: true },
    });
    await prisma.monthlyCloseHistory.create({
      data: {
        executionBudgetId: budget.id,
        targetMonth: CLOSED_MONTH,
        closedById: people.createdById,
      },
    });
    return {
      projectId: project.id,
      contractId,
      amendmentContractId,
      budgetId: budget.id,
      itemIds: [first.id, second.id],
      orderId: order.id,
      progressRecordId: progress.id,
    };
  }

  /** 対象の案件の実行予算まわりのデータの状態（範囲外の要求の前後で変わらないことを比べる） */
  async function snapshot(fixture: Fixture): Promise<unknown> {
    const budgetWhere = { executionBudget: { projectId: fixture.projectId } };
    return {
      budgets: await prisma.executionBudget.findMany({
        where: { projectId: fixture.projectId },
        select: { id: true, contractId: true, version: true, deletedAt: true, updatedAt: true },
      }),
      items: await prisma.executionBudgetItem.findMany({
        where: budgetWhere,
        select: {
          id: true,
          name: true,
          executionUnitPrice: true,
          executionAmount: true,
          amendmentAmount: true,
          currentMonthExpense: true,
          previousMonthExpense: true,
          remarks: true,
          deletedAt: true,
          updatedAt: true,
        },
        orderBy: { id: 'asc' },
      }),
      orders: await prisma.order.findMany({
        where: budgetWhere,
        select: {
          id: true,
          tradingPartnerId: true,
          status: true,
          confirmedAmount: true,
          deletedAt: true,
          updatedAt: true,
          items: {
            select: { executionBudgetItemId: true, checked: true, orderAmount: true },
            orderBy: { executionBudgetItemId: 'asc' },
          },
        },
        orderBy: { id: 'asc' },
      }),
      progress: await prisma.progressRecord.findMany({
        where: budgetWhere,
        select: {
          id: true,
          constructionDate: true,
          updatedAt: true,
          items: {
            select: { executionBudgetItemId: true, amount: true },
            orderBy: { executionBudgetItemId: 'asc' },
          },
        },
        orderBy: { id: 'asc' },
      }),
      monthlyCloses: await prisma.monthlyCloseHistory.findMany({
        where: budgetWhere,
        select: { id: true, targetMonth: true },
        orderBy: { id: 'asc' },
      }),
      amendmentApplies: await prisma.amendmentApplyHistory.count({ where: budgetWhere }),
    };
  }

  /** 案件 ID を差し替えた本機能の 25 経路（読み取り） */
  function readCalls(projectId: string, fixture: Fixture): RouteCall[] {
    const base = `/api/projects/${projectId}/execution-budget`;
    return [
      { method: 'get', path: base },
      { method: 'get', path: `${base}/unreflected-amendments` },
      { method: 'get', path: `${base}/amendment-diff/${fixture.amendmentContractId}` },
      { method: 'get', path: `${base}/orders` },
      { method: 'get', path: `${base}/orders/${fixture.orderId}` },
      { method: 'get', path: `${base}/progress/monthly` },
      { method: 'get', path: `${base}/progress/monthly/2026-10` },
      { method: 'get', path: `${base}/progress` },
      { method: 'get', path: `${base}/progress/${PROGRESS_DATE}` },
      { method: 'get', path: `${base}/monthly-close` },
      { method: 'get', path: `${base}/orders/${fixture.orderId}/export?format=xlsx` },
      { method: 'get', path: `${base}/progress/monthly/export?format=xlsx` },
    ];
  }

  /** 案件 ID を差し替えた本機能の 25 経路（書き込み） */
  function writeCalls(projectId: string, fixture: Fixture): RouteCall[] {
    const base = `/api/projects/${projectId}/execution-budget`;
    return [
      { method: 'post', path: base, body: { contractId: fixture.contractId } },
      {
        method: 'patch',
        path: `${base}/items/${fixture.itemIds[0]}`,
        body: { executionUnitPrice: '9999', version: 0 },
      },
      {
        method: 'post',
        path: `${base}/apply-amendment`,
        body: { contractId: fixture.amendmentContractId },
      },
      { method: 'post', path: `${base}/orders`, body: { tradingPartnerId } },
      {
        method: 'patch',
        path: `${base}/orders/${fixture.orderId}`,
        body: { confirmedAmount: '1' },
      },
      {
        method: 'put',
        path: `${base}/orders/${fixture.orderId}/items`,
        body: { itemIds: [fixture.itemIds[1]] },
      },
      {
        method: 'patch',
        path: `${base}/orders/${fixture.orderId}/status`,
        body: { status: 'CANCELLED' },
      },
      {
        method: 'post',
        path: `${base}/progress`,
        body: {
          constructionDate: '2026-10-02',
          items: [{ itemId: fixture.itemIds[0], amount: '100' }],
        },
      },
      {
        method: 'patch',
        path: `${base}/items/${fixture.itemIds[0]}/cost`,
        body: { currentMonthExpense: '777', version: 0 },
      },
      { method: 'post', path: `${base}/monthly-close`, body: { targetMonth: '2026-10' } },
      { method: 'delete', path: `${base}/progress/${fixture.progressRecordId}` },
      { method: 'delete', path: `${base}/orders/${fixture.orderId}` },
      { method: 'delete', path: base },
    ];
  }

  beforeAll(async () => {
    prisma = getPrismaClient();
    await cleanup();
    await seedRoles(prisma);
    await seedPermissions(prisma);
    await seedRolePermissions(prisma);

    const memberPermissions: Array<[string, string]> = [
      ['execution_budget', 'read'],
      ['execution_budget', 'write'],
      ['order', 'read'],
      ['order', 'write'],
      ['progress', 'read'],
      ['progress', 'write'],
      ['cost', 'write'],
      ['monthly_close', 'write'],
    ];
    await createRole(MEMBER_ROLE, memberPermissions);
    await createRole(READ_ALL_ROLE, [...memberPermissions, ['project', 'read_all']]);
    await createRole(NO_PERMISSION_ROLE, []);

    sales = await createUser('sales', MEMBER_ROLE);
    construction = await createUser('construction', MEMBER_ROLE);
    creator = await createUser('creator', MEMBER_ROLE);
    outsider = await createUser('outsider', MEMBER_ROLE);
    readAll = await createUser('read-all', READ_ALL_ROLE);
    noPermission = await createUser('no-permission', NO_PERMISSION_ROLE);

    const partner = await prisma.tradingPartner.create({
      data: {
        name: `${MARK}-partner`,
        nameKana: 'テストキョウリョクギョウシャ',
        address: '東京都千代田区1-1-1',
        types: { create: [{ type: 'SUBCONTRACTOR' }] },
      },
      select: { id: true },
    });
    tradingPartnerId = partner.id;

    target = await createFixture('target', {
      salesPersonId: sales.id,
      constructionPersonId: construction.id,
      createdById: creator.id,
    });
    other = await createFixture('other', { salesPersonId: outsider.id, createdById: outsider.id });
  });

  afterAll(async () => {
    await cleanup();
  });

  describe('範囲内の利用者（20.1・20.6）', () => {
    /**
     * @requirement execution-budget-management/REQ-20.1
     * @requirement execution-budget-management/REQ-20.6
     * @requirement execution-budget-management/REQ-17.1
     */
    it('営業担当者・工事担当者・作成者・全案件閲覧の権限の利用者は、実行予算・発注・出来高・月次締め・未反映の変更契約を従来どおり得られ、一覧は経路の案件のものだけである', async () => {
      for (const user of [sales, construction, creator, readAll]) {
        for (const call of readCalls(target.projectId, target)) {
          const response = await send(user, call);
          expect(response.status, `${call.method} ${call.path}`).toBe(200);
        }

        const orders = await send(user, {
          method: 'get',
          path: `/api/projects/${target.projectId}/execution-budget/orders`,
        });
        expect(orders.body.map((o: { id: string }) => o.id)).toEqual([target.orderId]);

        const progress = await send(user, {
          method: 'get',
          path: `/api/projects/${target.projectId}/execution-budget/progress`,
        });
        expect(progress.body.map((r: { id: string }) => r.id)).toEqual([target.progressRecordId]);

        const amendments = await send(user, {
          method: 'get',
          path: `/api/projects/${target.projectId}/execution-budget/unreflected-amendments`,
        });
        const amendmentIds = JSON.stringify(amendments.body);
        expect(amendmentIds).toContain(target.amendmentContractId);
        expect(amendmentIds).not.toContain(other.amendmentContractId);
      }
    });

    /**
     * @requirement execution-budget-management/REQ-20.1
     * @requirement execution-budget-management/REQ-17.2
     * @requirement execution-budget-management/REQ-17.3
     * @requirement execution-budget-management/REQ-17.4
     * @requirement execution-budget-management/REQ-17.5
     */
    it('関係者と全案件閲覧の権限の利用者は、実行予算項目の編集・原価の入力・発注の作成から削除・出来高の保存と削除・月次締め・変更契約の反映・実行予算の削除を行える', async () => {
      const fixture = await createFixture('writable', {
        salesPersonId: sales.id,
        constructionPersonId: construction.id,
        createdById: creator.id,
      });
      const base = `/api/projects/${fixture.projectId}/execution-budget`;

      await send(construction, {
        method: 'patch',
        path: `${base}/items/${fixture.itemIds[0]}`,
        body: { executionUnitPrice: '1500', version: 0 },
      }).expect(200);
      await send(sales, {
        method: 'patch',
        path: `${base}/items/${fixture.itemIds[1]}/cost`,
        body: { currentMonthExpense: '500', version: 1 },
      }).expect(200);

      const created = await send(creator, {
        method: 'post',
        path: `${base}/orders`,
        body: { tradingPartnerId },
      }).expect(201);
      await send(readAll, {
        method: 'put',
        path: `${base}/orders/${created.body.id}/items`,
        body: { itemIds: fixture.itemIds },
      }).expect(200);
      await send(construction, {
        method: 'patch',
        path: `${base}/orders/${created.body.id}/status`,
        body: { status: 'UNDER_REVIEW' },
      }).expect(200);
      await send(construction, {
        method: 'patch',
        path: `${base}/orders/${fixture.orderId}`,
        body: { confirmedAmount: '9000' },
      }).expect(200);
      await send(construction, {
        method: 'delete',
        path: `${base}/orders/${fixture.orderId}`,
      }).expect(204);

      await send(readAll, {
        method: 'post',
        path: `${base}/progress`,
        body: {
          constructionDate: '2026-10-05',
          items: fixture.itemIds.map((itemId) => ({ itemId, amount: '100' })),
        },
      }).expect(201);
      await send(sales, {
        method: 'delete',
        path: `${base}/progress/${fixture.progressRecordId}`,
      }).expect(204);

      await send(creator, {
        method: 'post',
        path: `${base}/monthly-close`,
        body: { targetMonth: '2026-10' },
      }).expect(201);
      await send(construction, {
        method: 'get',
        path: `${base}/amendment-diff/${fixture.amendmentContractId}`,
      }).expect(200);
      await send(construction, {
        method: 'post',
        path: `${base}/apply-amendment`,
        body: { contractId: fixture.amendmentContractId },
      }).expect(200);

      // 検討中から発注前へ戻せる。実行予算の削除は発注済みの発注が無ければ通る
      await send(construction, {
        method: 'patch',
        path: `${base}/orders/${created.body.id}/status`,
        body: { status: 'BEFORE_ORDER' },
      }).expect(200);
      await send(readAll, { method: 'delete', path: base }).expect(204);
    });
  });

  describe('範囲外の ID 指定（20.2・20.3・20.6）', () => {
    /**
     * @requirement execution-budget-management/REQ-20.2
     * @requirement execution-budget-management/REQ-20.3
     * @requirement execution-budget-management/REQ-20.6
     * @requirement execution-budget-management/REQ-17.1
     */
    it('担当外の利用者の読み取り・一覧・出力は、存在しない案件と同じ 404 の本文になり、案件 ID を含めない', async () => {
      const missing = readCalls(MISSING_ID, target);
      const outOfScope = readCalls(target.projectId, target);
      for (let i = 0; i < outOfScope.length; i += 1) {
        const call = outOfScope[i]!;
        const missingResponse = await send(outsider, missing[i]!);
        const response = await send(outsider, call);
        expect(missingResponse.status, missing[i]!.path).toBe(404);
        expect(response.status, call.path).toBe(404);
        expect(response.body.code, call.path).toBe('NOT_FOUND');
        expect(withoutInstance(response.body), call.path).toEqual(
          withoutInstance(missingResponse.body)
        );
        const exposed = JSON.stringify(withoutInstance(response.body));
        expect(exposed, call.path).not.toContain(target.projectId);
        expect(exposed, call.path).not.toContain(target.budgetId);
        expect(response.headers['content-disposition'], call.path).toBeUndefined();
      }
    });

    /**
     * @requirement execution-budget-management/REQ-20.2
     * @requirement execution-budget-management/REQ-20.3
     * @requirement execution-budget-management/REQ-17.2
     * @requirement execution-budget-management/REQ-17.3
     * @requirement execution-budget-management/REQ-17.4
     * @requirement execution-budget-management/REQ-17.5
     * @requirement execution-budget-management/REQ-17.6
     */
    it('担当外の利用者の作成・編集・原価の入力・発注の操作・出来高の保存と削除・月次締め・変更契約の反映・削除は、存在しない案件と同じ 404 の本文になり、データベースを変えない', async () => {
      const before = await snapshot(target);
      const missing = writeCalls(MISSING_ID, target);
      const outOfScope = writeCalls(target.projectId, target);
      for (let i = 0; i < outOfScope.length; i += 1) {
        const call = outOfScope[i]!;
        const missingResponse = await send(outsider, missing[i]!);
        const response = await send(outsider, call);
        expect(missingResponse.status, `${call.method} ${missing[i]!.path}`).toBe(404);
        expect(response.status, `${call.method} ${call.path}`).toBe(404);
        expect(response.body.code, `${call.method} ${call.path}`).toBe('NOT_FOUND');
        expect(withoutInstance(response.body), `${call.method} ${call.path}`).toEqual(
          withoutInstance(missingResponse.body)
        );
        expect(JSON.stringify(withoutInstance(response.body))).not.toContain(target.projectId);
      }
      expect(await snapshot(target)).toEqual(before);
    });

    /**
     * @requirement execution-budget-management/REQ-20.2
     */
    it('範囲外のアクセスは PROJECT_SCOPE_DENIED として記録される', async () => {
      await send(outsider, {
        method: 'get',
        path: `/api/projects/${target.projectId}/execution-budget`,
      }).expect(404);

      const denied = await prisma.auditLog.findMany({
        where: { action: 'PROJECT_SCOPE_DENIED', actorId: outsider.id },
      });
      expect(denied.length).toBeGreaterThan(0);
      expect(denied.every((log) => log.targetId === target.projectId)).toBe(true);
    });

    /**
     * @requirement execution-budget-management/REQ-17.6
     */
    it('権限を持たない利用者には、範囲の判定より先に権限なしの 403 を返す', async () => {
      for (const call of [
        ...readCalls(target.projectId, target),
        ...writeCalls(target.projectId, target),
      ]) {
        const response = await send(noPermission, call);
        expect(response.status, `${call.method} ${call.path}`).toBe(403);
      }
      const denied = await prisma.auditLog.count({
        where: { action: 'PROJECT_SCOPE_DENIED', actorId: noPermission.id },
      });
      expect(denied, '権限なしの 403 は範囲外として記録しない').toBe(0);
    });
  });

  describe('子リソースの所属の照合（20.4）', () => {
    /**
     * @requirement execution-budget-management/REQ-20.4
     */
    it('経路の案件に属さない実行予算項目・発注・出来高記録は、存在しない ID と同じ 404 になり、どちらの案件のデータも変えない', async () => {
      const beforeTarget = await snapshot(target);
      const beforeOther = await snapshot(other);
      const base = `/api/projects/${target.projectId}/execution-budget`;
      const pairs: Array<[RouteCall, RouteCall]> = (
        [
          (id: string): RouteCall => ({
            method: 'patch',
            path: `${base}/items/${id}`,
            body: { executionUnitPrice: '9999', version: 0 },
          }),
          (id: string): RouteCall => ({
            method: 'patch',
            path: `${base}/items/${id}/cost`,
            body: { currentMonthExpense: '777', version: 0 },
          }),
        ] as Array<(id: string) => RouteCall>
      )
        .map((build): [RouteCall, RouteCall] => [build(other.itemIds[0]), build(MISSING_ID)])
        .concat(
          (
            [
              (id: string): RouteCall => ({ method: 'get', path: `${base}/orders/${id}` }),
              (id: string): RouteCall => ({
                method: 'patch',
                path: `${base}/orders/${id}`,
                body: { confirmedAmount: '1' },
              }),
              (id: string): RouteCall => ({
                method: 'put',
                path: `${base}/orders/${id}/items`,
                body: { itemIds: [] },
              }),
              (id: string): RouteCall => ({
                method: 'patch',
                path: `${base}/orders/${id}/status`,
                body: { status: 'CANCELLED' },
              }),
              (id: string): RouteCall => ({ method: 'delete', path: `${base}/orders/${id}` }),
              (id: string): RouteCall => ({
                method: 'get',
                path: `${base}/orders/${id}/export?format=xlsx`,
              }),
            ] as Array<(id: string) => RouteCall>
          ).map((build): [RouteCall, RouteCall] => [build(other.orderId), build(MISSING_ID)])
        )
        .concat([
          [
            { method: 'delete', path: `${base}/progress/${other.progressRecordId}` },
            { method: 'delete', path: `${base}/progress/${MISSING_ID}` },
          ],
        ]);

      // 案件 other が範囲外の関係者と、案件 other も範囲内の全案件閲覧の利用者のどちらでも同じ
      for (const user of [construction, readAll]) {
        for (const [crossed, missing] of pairs) {
          const missingResponse = await send(user, missing);
          const response = await send(user, crossed);
          const label = `${crossed.method} ${crossed.path}`;
          expect(missingResponse.status, label).toBe(404);
          expect(response.status, label).toBe(404);
          expect(response.body.code, label).toBe('NOT_FOUND');
          expect(withoutInstance(response.body), label).toEqual(
            withoutInstance(missingResponse.body)
          );
          expect(JSON.stringify(withoutInstance(response.body)), label).not.toContain(
            other.projectId
          );
        }
      }

      expect(await snapshot(target)).toEqual(beforeTarget);
      expect(await snapshot(other)).toEqual(beforeOther);
      // 所属しない子は不在の扱いであり、範囲外としては記録しない
      const denied = await prisma.auditLog.count({
        where: { action: 'PROJECT_SCOPE_DENIED', actorId: { in: [construction.id, readAll.id] } },
      });
      expect(denied).toBe(0);
    });

    /**
     * @requirement execution-budget-management/REQ-20.4
     */
    it('経路・要求本文の契約が経路の案件に属さなければ、存在しない契約と同じ 404 になり、実行予算を作らず変更契約を反映しない', async () => {
      const fresh = await prisma.project.create({
        data: {
          name: `${MARK}-no-budget`,
          salesPersonId: sales.id,
          constructionPersonId: construction.id,
          createdById: creator.id,
        },
        select: { id: true },
      });
      const normalize = (body: Record<string, unknown>, ref: string): unknown =>
        JSON.parse(JSON.stringify(withoutInstance(body)).split(ref).join('<ref>'));

      const cases: Array<{
        project: string;
        build: (contractId: string) => RouteCall;
        crossedId: string;
      }> = [
        {
          project: fresh.id,
          build: (contractId) => ({
            method: 'post',
            path: `/api/projects/${fresh.id}/execution-budget`,
            body: { contractId },
          }),
          crossedId: other.contractId,
        },
        {
          project: target.projectId,
          build: (contractId) => ({
            method: 'get',
            path: `/api/projects/${target.projectId}/execution-budget/amendment-diff/${contractId}`,
          }),
          crossedId: other.amendmentContractId,
        },
        {
          project: target.projectId,
          build: (contractId) => ({
            method: 'post',
            path: `/api/projects/${target.projectId}/execution-budget/apply-amendment`,
            body: { contractId },
          }),
          crossedId: other.amendmentContractId,
        },
      ];

      const beforeTarget = await snapshot(target);
      for (const user of [construction, readAll]) {
        for (const { build, crossedId } of cases) {
          const missing = await send(user, build(MISSING_ID));
          const crossed = await send(user, build(crossedId));
          const label = build(crossedId).path;
          expect(missing.status, label).toBe(404);
          expect(crossed.status, label).toBe(404);
          expect(crossed.body.code, label).toBe(missing.body.code);
          expect(normalize(crossed.body, crossedId), label).toEqual(
            normalize(missing.body, MISSING_ID)
          );
          expect(JSON.stringify(crossed.body), label).not.toContain(other.projectId);
        }
      }
      expect(await prisma.executionBudget.count({ where: { projectId: fresh.id } })).toBe(0);
      expect(await snapshot(target)).toEqual(beforeTarget);

      // 対照: 同じ案件の契約なら、関係者は実行予算を作成できる（20.1・17.2）
      const ownContractId = await createContract(
        fresh.id,
        await createEstimate(fresh.id, 'no-budget'),
        'NEW'
      );
      await send(construction, {
        method: 'post',
        path: `/api/projects/${fresh.id}/execution-budget`,
        body: { contractId: ownContractId },
      }).expect(201);
    });
  });

  describe('一括の要求の全件か無しか（20.5）', () => {
    /**
     * @requirement execution-budget-management/REQ-20.5
     */
    it('発注のチェック済み項目の更新と出来高の保存は、他の案件の項目が 1 件でも混じると、存在しない項目が混じる要求と同じ 404 になり、どの行にも書き込まない', async () => {
      const beforeTarget = await snapshot(target);
      const beforeOther = await snapshot(other);
      const base = `/api/projects/${target.projectId}/execution-budget`;
      const orderItems = (foreignId: string): RouteCall => ({
        method: 'put',
        path: `${base}/orders/${target.orderId}/items`,
        body: { itemIds: [target.itemIds[1], foreignId] },
      });
      const saveProgress = (foreignId: string): RouteCall => ({
        method: 'post',
        path: `${base}/progress`,
        body: {
          constructionDate: '2026-10-03',
          items: [
            { itemId: target.itemIds[0], amount: '100' },
            { itemId: foreignId, amount: '200' },
          ],
        },
      });

      for (const user of [construction, readAll]) {
        for (const build of [orderItems, saveProgress]) {
          const missing = await send(user, build(MISSING_ID));
          const crossed = await send(user, build(other.itemIds[0]));
          const label = build(other.itemIds[0]).path;
          expect(missing.status, label).toBe(404);
          expect(crossed.status, label).toBe(404);
          expect(crossed.body.code, label).toBe('NOT_FOUND');
          expect(withoutInstance(crossed.body), label).toEqual(withoutInstance(missing.body));
        }
      }

      expect(await snapshot(target)).toEqual(beforeTarget);
      expect(await snapshot(other)).toEqual(beforeOther);
    });
  });
});
