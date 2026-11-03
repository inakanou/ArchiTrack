/**
 * @fileoverview 見積書・見積明細・編集中の在席・プロジェクト単位の受領見積書の一覧の API への案件の閲覧範囲の
 * 適用の統合検証（estimate-creation タスク62.1）
 *
 * 本物のアプリ（app.ts のルート・authenticate・requirePermission・requireProjectScope・共有の
 * ProjectScopeService と RBACService）と、テスト用の実データベース・実ストレージ（STORAGE_TYPE=local）を通す。
 *
 * 被覆する受入基準（estimate-creation の Requirement 57.1〜57.6）は各 it の `@requirement` の印が名乗る。
 * 出力の記録（57.7・57.8）はタスク62.2 の担当で、本ファイルは扱わない。
 *
 * 利用者（いずれもテストで作るロール。ロール名は admin ではない）:
 * - MEMBER: 見積書の閲覧・作成・編集・削除と見積依頼の閲覧の権限だけを持ち、全案件閲覧の権限を持たない
 * - READ_ALL: MEMBER の権限に全案件閲覧の権限（project:read_all）を加えたもの
 * - 案件 target の営業担当者・工事担当者・作成者（関係者）、担当外の利用者、全案件閲覧の利用者、権限なしの利用者
 * - 案件 other の営業担当者・作成者は担当外の利用者（範囲外の内訳書・見積書・見積項目を用意するため）
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

const MARK = 'test-ec62-scope';
const MEMBER_ROLE = `${MARK}-member`;
const READ_ALL_ROLE = `${MARK}-read-all`;
const NO_PERMISSION_ROLE = `${MARK}-no-permission`;
/** 版 4・変種 8 の整った UUID（ID の形式の検査を通り、どの行としても存在しない） */
const MISSING_ID = '00000000-0000-4000-8000-000000062100';

interface TestUser {
  id: string;
  token: string;
}

interface Fixture {
  projectId: string;
  itemizedStatementId: string;
  estimateId: string;
  estimateItemId: string;
  estimateName: string;
  quotationId: string;
}

/** 見積明細の一括保存の明細行（estimate-draft-save の統合テストと同じ形） */
const linePayload = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  lineType: 'ESTIMATE',
  name: null,
  specification: null,
  unit: null,
  quantity: null,
  unitPrice: null,
  amount: null,
  remarks: null,
  sourceVendorName: null,
  ...overrides,
});

const nodePayload = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: null,
  tempId: null,
  itemType: 'STANDARD',
  lines: [linePayload()],
  children: [],
  ...overrides,
});

const REPORT_FIELDS = { submissionDate: null, validityPeriod: null, separateWorks: [] };

/** 諸経費の計算の要求（一般管理費） */
const OVERHEAD_REQUEST = {
  costType: 'GENERAL_ADMIN',
  directCost: '10000',
  constructionCost: '10000',
  isRenovation: false,
};

describe('見積書・見積明細・在席・受領見積書の一覧の API の閲覧範囲（統合・実 DB）', () => {
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
    const estimates = await prisma.estimate.findMany({
      where: { projectId: { in: projectIds } },
      select: { id: true },
    });
    const estimateIds = estimates.map((e) => e.id);
    await deleteAuditLogsWithArchivePermission(prisma, {
      OR: [
        { actorId: { in: userIds } },
        { targetId: { in: userIds } },
        { targetId: { in: projectIds } },
        { targetId: { in: estimateIds } },
      ],
    });
    // 見積書・見積項目・在席・内訳書・見積依頼・受領見積書は案件の削除に連なって消える
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
      data: { name, description: 'estimate-creation タスク62 の検証用' },
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

  /** 見積書（見積項目 1 件・見積金額行 1 行）を DB に作る */
  async function createEstimate(
    projectId: string,
    name: string
  ): Promise<{ estimateId: string; estimateItemId: string }> {
    const estimate = await prisma.estimate.create({
      data: {
        projectId,
        name,
        items: {
          create: [
            {
              displayOrder: 0,
              lines: { create: [{ lineType: 'ESTIMATE', name: `${name}-項目`, quantity: 1 }] },
            },
          ],
        },
      },
      select: { id: true, items: { select: { id: true } } },
    });
    return { estimateId: estimate.id, estimateItemId: estimate.items[0]!.id };
  }

  async function createFixture(
    label: string,
    people: { salesPersonId: string; constructionPersonId?: string; createdById: string }
  ): Promise<Fixture> {
    const project = await prisma.project.create({
      data: { name: `${MARK}-${label}`, ...people },
      select: { id: true },
    });
    const statement = await prisma.itemizedStatement.create({
      data: {
        projectId: project.id,
        name: `${MARK}-${label}-statement`,
        sourceQuantityTableId: `${MARK}-${label}-qt`,
        sourceQuantityTableName: `${label} の数量表`,
        items: {
          create: [
            { workType: '工種1', name: `${label}-内訳1`, unit: '式', quantity: 1, displayOrder: 1 },
            { workType: '工種2', name: `${label}-内訳2`, unit: 'm', quantity: 2, displayOrder: 2 },
          ],
        },
      },
      select: { id: true },
    });
    const estimateName = `${MARK}-${label}-estimate`;
    const { estimateId, estimateItemId } = await createEstimate(project.id, estimateName);
    const estimateRequest = await prisma.estimateRequest.create({
      data: {
        projectId: project.id,
        tradingPartnerId,
        itemizedStatementId: statement.id,
        name: `${MARK}-${label}-request`,
      },
      select: { id: true },
    });
    const quotation = await prisma.receivedQuotation.create({
      data: {
        estimateRequestId: estimateRequest.id,
        name: `${MARK}-${label}-quotation`,
        submittedAt: new Date('2026-10-01'),
        filePath: `quotations/${estimateRequest.id}/${label}.pdf`,
        fileName: `${label}.pdf`,
        fileMimeType: 'application/pdf',
        fileSize: 1024,
      },
      select: { id: true },
    });
    return {
      projectId: project.id,
      itemizedStatementId: statement.id,
      estimateId,
      estimateItemId,
      estimateName,
      quotationId: quotation.id,
    };
  }

  /** 案件の見積書まわりのデータの状態（範囲外の要求の前後で変わらないことを比べる） */
  async function snapshot(fixture: Fixture): Promise<unknown> {
    const estimateWhere = { estimate: { projectId: fixture.projectId } };
    return {
      estimates: await prisma.estimate.findMany({
        where: { projectId: fixture.projectId },
        select: {
          id: true,
          name: true,
          submissionDate: true,
          validityPeriod: true,
          separateWorks: true,
          deletedAt: true,
          updatedAt: true,
        },
        orderBy: { id: 'asc' },
      }),
      items: await prisma.estimateItem.findMany({
        where: estimateWhere,
        select: { id: true, parentId: true, displayOrder: true, updatedAt: true },
        orderBy: { id: 'asc' },
      }),
      lines: await prisma.estimateItemLine.findMany({
        where: { estimateItem: estimateWhere },
        select: { id: true, name: true, quantity: true, updatedAt: true },
        orderBy: { id: 'asc' },
      }),
      editSessions: await prisma.estimateEditSession.findMany({
        where: estimateWhere,
        select: { estimateId: true, userId: true, lastSeenAt: true },
        orderBy: { userId: 'asc' },
      }),
    };
  }

  beforeAll(async () => {
    prisma = getPrismaClient();
    await cleanup();
    await seedRoles(prisma);
    await seedPermissions(prisma);
    await seedRolePermissions(prisma);

    const memberPermissions: Array<[string, string]> = [
      ['estimate', 'create'],
      ['estimate', 'read'],
      ['estimate', 'update'],
      ['estimate', 'delete'],
      ['estimate_request', 'read'],
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
        email: 'ec62-partner@example.com',
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

  describe('範囲内の利用者（57.1・57.6）', () => {
    /**
     * @requirement estimate-creation/REQ-57.1
     * @requirement estimate-creation/REQ-57.6
     */
    it('営業担当者・工事担当者・作成者・全案件閲覧の権限の利用者は、一覧・直近・詳細・見積項目・諸経費の計算・在席・受領見積書の一覧を従来どおり得られ、一覧には当該案件のものだけが載る', async () => {
      for (const user of [sales, construction, creator, readAll]) {
        const list = await request(app)
          .get(`/api/projects/${target.projectId}/estimates`)
          .set(...auth(user))
          .expect(200);
        const listedIds = list.body.data.map((e: { id: string }) => e.id);
        expect(listedIds).toContain(target.estimateId);
        expect(listedIds).not.toContain(other.estimateId);

        const latest = await request(app)
          .get(`/api/projects/${target.projectId}/estimates/latest`)
          .set(...auth(user))
          .expect(200);
        expect(latest.body.latestEstimates.map((e: { id: string }) => e.id)).toEqual([
          target.estimateId,
        ]);

        const detail = await request(app)
          .get(`/api/estimates/${target.estimateId}`)
          .set(...auth(user))
          .expect(200);
        expect(detail.body.name).toBe(target.estimateName);

        // 二重マウントでも、経路の案件と見積書の案件が一致すれば従来どおり
        await request(app)
          .get(`/api/projects/${target.projectId}/estimates/${target.estimateId}`)
          .set(...auth(user))
          .expect(200);

        const items = await request(app)
          .get(`/api/estimates/${target.estimateId}/items`)
          .set(...auth(user))
          .expect(200);
        expect(JSON.stringify(items.body)).toContain(target.estimateItemId);

        const overhead = await request(app)
          .post(`/api/estimates/${target.estimateId}/calculate-overhead`)
          .set(...auth(user))
          .send(OVERHEAD_REQUEST)
          .expect(200);
        expect(overhead.body.costType).toBe('GENERAL_ADMIN');

        await request(app)
          .put(`/api/estimates/${target.estimateId}/edit-session`)
          .set(...auth(user))
          .expect(200);
        await request(app)
          .delete(`/api/estimates/${target.estimateId}/edit-session`)
          .set(...auth(user))
          .expect(204);

        const quotations = await request(app)
          .get(`/api/projects/${target.projectId}/quotations`)
          .set(...auth(user))
          .expect(200);
        expect(quotations.body.map((q: { id: string }) => q.id)).toEqual([target.quotationId]);
      }
    });

    /**
     * @requirement estimate-creation/REQ-57.1
     */
    it('関係者と全案件閲覧の権限の利用者は、自案件の内訳書からの見積書の作成・更新・一括保存・削除を行える', async () => {
      const created = await request(app)
        .post(`/api/projects/${target.projectId}/estimates`)
        .set(...auth(construction))
        .send({ name: `${MARK}-created`, sourceItemizedStatementId: target.itemizedStatementId })
        .expect(201);
      const createdId = created.body.id as string;
      expect(created.body.sourceItemizedStatementId).toBe(target.itemizedStatementId);

      const updated = await request(app)
        .put(`/api/estimates/${createdId}`)
        .set(...auth(creator))
        .send({ name: `${MARK}-renamed`, expectedUpdatedAt: created.body.updatedAt })
        .expect(200);
      expect(updated.body.name).toBe(`${MARK}-renamed`);

      const saved = await request(app)
        .put(`/api/estimates/${createdId}/save`)
        .set(...auth(sales))
        .send({
          expectedUpdatedAt: updated.body.updatedAt,
          reportFields: REPORT_FIELDS,
          items: [nodePayload({ tempId: 'new-1', lines: [linePayload({ name: '追加' })] })],
        })
        .expect(200);
      expect(saved.body.itemCount).toBe(1);

      await request(app)
        .delete(`/api/estimates/${createdId}`)
        .set(...auth(readAll))
        .query({ updatedAt: saved.body.updatedAt })
        .expect(204);
    });

    /**
     * 解決関数は論理削除された見積書からも案件 ID を引く。範囲内の利用者には本体の 404
     * （見積書の不在の符号）がそのまま届き、範囲外の利用者には不在と同じ汎用の 404 が返る。
     *
     * @requirement estimate-creation/REQ-57.1
     * @requirement estimate-creation/REQ-57.2
     */
    it('論理削除された見積書は、範囲内の利用者には本体の 404、範囲外の利用者には汎用の 404 を返す', async () => {
      const { estimateId: deletedId } = await createEstimate(target.projectId, `${MARK}-deleted`);
      await prisma.estimate.update({ where: { id: deletedId }, data: { deletedAt: new Date() } });

      const inScope = await request(app)
        .put(`/api/estimates/${deletedId}`)
        .set(...auth(sales))
        .send({ name: `${MARK}-x`, expectedUpdatedAt: new Date().toISOString() })
        .expect(404);
      expect(inScope.body.code).toBe('ESTIMATE_NOT_FOUND');

      const outOfScope = await request(app)
        .put(`/api/estimates/${deletedId}`)
        .set(...auth(outsider))
        .send({ name: `${MARK}-x`, expectedUpdatedAt: new Date().toISOString() })
        .expect(404);
      expect(outOfScope.body.code).toBe('NOT_FOUND');
      expect(JSON.stringify(withoutInstance(outOfScope.body))).not.toContain(deletedId);
      await prisma.estimate.delete({ where: { id: deletedId } });
    });
  });

  describe('範囲外の ID 指定（57.2・57.3・57.6）', () => {
    /**
     * @requirement estimate-creation/REQ-57.2
     * @requirement estimate-creation/REQ-57.3
     * @requirement estimate-creation/REQ-57.6
     */
    it('担当外の利用者の一覧・直近・詳細・見積項目・受領見積書の一覧は、存在しない ID と同じ 404 の本文になり、案件 ID も見積書 ID も返らない', async () => {
      const readPaths: Array<[string, string]> = [
        [`/api/projects/${target.projectId}/estimates`, `/api/projects/${MISSING_ID}/estimates`],
        [
          `/api/projects/${target.projectId}/estimates/latest`,
          `/api/projects/${MISSING_ID}/estimates/latest`,
        ],
        [`/api/estimates/${target.estimateId}`, `/api/estimates/${MISSING_ID}`],
        [
          `/api/projects/${target.projectId}/estimates/${target.estimateId}`,
          `/api/projects/${target.projectId}/estimates/${MISSING_ID}`,
        ],
        [`/api/estimates/${target.estimateId}/items`, `/api/estimates/${MISSING_ID}/items`],
        [`/api/projects/${target.projectId}/quotations`, `/api/projects/${MISSING_ID}/quotations`],
      ];

      for (const [outOfScopePath, missingPath] of readPaths) {
        const missing = await request(app)
          .get(missingPath)
          .set(...auth(outsider))
          .expect(404);
        const outOfScope = await request(app)
          .get(outOfScopePath)
          .set(...auth(outsider))
          .expect(404);

        expect(outOfScope.body.code, outOfScopePath).toBe('NOT_FOUND');
        expect(withoutInstance(outOfScope.body), outOfScopePath).toEqual(
          withoutInstance(missing.body)
        );
        const exposed = JSON.stringify(withoutInstance(outOfScope.body));
        expect(exposed, outOfScopePath).not.toContain(target.projectId);
        expect(exposed, outOfScopePath).not.toContain(target.estimateId);
        expect(exposed, outOfScopePath).not.toContain(target.estimateName);
        expect(exposed, outOfScopePath).not.toContain(target.quotationId);
      }
    });

    /**
     * @requirement estimate-creation/REQ-57.2
     * @requirement estimate-creation/REQ-57.3
     */
    it('担当外の利用者の作成・更新・一括保存・削除・諸経費の計算・在席の通知と退出は、存在しない ID と同じ 404 の本文になり、データベースを変えない', async () => {
      // 範囲外の利用者の退出が範囲内の利用者の在席を消さないことも確かめるため、関係者の在席を置く
      await request(app)
        .put(`/api/estimates/${target.estimateId}/edit-session`)
        .set(...auth(sales))
        .expect(200);
      const before = await snapshot(target);
      const estimate = await prisma.estimate.findUniqueOrThrow({
        where: { id: target.estimateId },
      });
      const expectedUpdatedAt = estimate.updatedAt.toISOString();

      type Ids = { project: string; estimate: string };
      type Call = (id: Ids) => request.Test;
      const writes: Array<[string, Call]> = [
        [
          'POST estimates',
          (id) =>
            request(app)
              .post(`/api/projects/${id.project}/estimates`)
              .send({ name: `${MARK}-intrusion` }),
        ],
        [
          'PUT estimates/:id',
          (id) =>
            request(app)
              .put(`/api/estimates/${id.estimate}`)
              .send({ name: `${MARK}-intrusion`, expectedUpdatedAt }),
        ],
        [
          'PUT estimates/:id/save',
          (id) =>
            request(app)
              .put(`/api/estimates/${id.estimate}/save`)
              .send({
                expectedUpdatedAt,
                reportFields: { ...REPORT_FIELDS, validityPeriod: 'intrusion' },
                items: [],
              }),
        ],
        [
          'POST estimates/:id/calculate-overhead',
          (id) =>
            request(app)
              .post(`/api/estimates/${id.estimate}/calculate-overhead`)
              .send(OVERHEAD_REQUEST),
        ],
        [
          'PUT estimates/:id/edit-session',
          (id) => request(app).put(`/api/estimates/${id.estimate}/edit-session`),
        ],
        [
          'DELETE estimates/:id/edit-session',
          (id) => request(app).delete(`/api/estimates/${id.estimate}/edit-session`),
        ],
        [
          'DELETE estimates/:id',
          (id) =>
            request(app)
              .delete(`/api/estimates/${id.estimate}`)
              .query({ updatedAt: expectedUpdatedAt }),
        ],
        // 範囲の判定はクエリの検証より先（タスク62.1 の判定の順序）。基準時刻の無い要求も 400 でなく 404
        [
          'DELETE estimates/:id（基準時刻なし）',
          (id) => request(app).delete(`/api/estimates/${id.estimate}`),
        ],
      ];

      for (const [label, call] of writes) {
        const missing = await call({ project: MISSING_ID, estimate: MISSING_ID })
          .set(...auth(outsider))
          .expect(404);
        const outOfScope = await call({ project: target.projectId, estimate: target.estimateId })
          .set(...auth(outsider))
          .expect(404);
        expect(outOfScope.body.code, label).toBe('NOT_FOUND');
        expect(withoutInstance(outOfScope.body), label).toEqual(withoutInstance(missing.body));
        const exposed = JSON.stringify(withoutInstance(outOfScope.body));
        expect(exposed, label).not.toContain(target.projectId);
        expect(exposed, label).not.toContain(target.estimateId);
      }

      expect(await snapshot(target)).toEqual(before);
      await request(app)
        .delete(`/api/estimates/${target.estimateId}/edit-session`)
        .set(...auth(sales))
        .expect(204);
    });

    /**
     * @requirement estimate-creation/REQ-57.2
     */
    it('範囲外のアクセスは PROJECT_SCOPE_DENIED として記録される', async () => {
      await request(app)
        .get(`/api/estimates/${target.estimateId}`)
        .set(...auth(outsider))
        .expect(404);

      const denied = await prisma.auditLog.findMany({
        where: { action: 'PROJECT_SCOPE_DENIED', actorId: outsider.id },
      });
      expect(denied.length).toBeGreaterThan(0);
      expect(denied.every((log) => log.targetId === target.projectId)).toBe(true);
    });

    /**
     * @requirement estimate-creation/REQ-57.2
     */
    it('閲覧範囲内でも権限を持たない利用者には、範囲の判定より先に権限なしの 403 を返す', async () => {
      const paths = [
        `/api/projects/${target.projectId}/estimates`,
        `/api/estimates/${target.estimateId}`,
        `/api/estimates/${MISSING_ID}`,
        `/api/estimates/${target.estimateId}/items`,
        `/api/projects/${target.projectId}/quotations`,
      ];
      const deniedBefore = await prisma.auditLog.count({
        where: { action: 'PROJECT_SCOPE_DENIED', actorId: noPermission.id },
      });
      for (const path of paths) {
        const response = await request(app)
          .get(path)
          .set(...auth(noPermission))
          .expect(403);
        expect(response.body.code, path).not.toBe('NOT_FOUND');
      }
      // 権限なしは範囲の判定に届かないため、範囲外の拒否としては記録しない
      const deniedAfter = await prisma.auditLog.count({
        where: { action: 'PROJECT_SCOPE_DENIED', actorId: noPermission.id },
      });
      expect(deniedAfter - deniedBefore).toBe(0);
    });

    /**
     * @requirement estimate-creation/REQ-57.2
     */
    it('二重マウントの経路で、経路の案件と見積書の案件が食い違うと見積書の不在と同じ 404 にする', async () => {
      const deniedBefore = await prisma.auditLog.count({
        where: { action: 'PROJECT_SCOPE_DENIED', actorId: readAll.id },
      });
      const missing = await request(app)
        .get(`/api/projects/${other.projectId}/estimates/${MISSING_ID}`)
        .set(...auth(readAll))
        .expect(404);
      const mismatched = await request(app)
        .get(`/api/projects/${other.projectId}/estimates/${target.estimateId}`)
        .set(...auth(readAll))
        .expect(404);
      expect(mismatched.body.code).toBe('NOT_FOUND');
      expect(withoutInstance(mismatched.body)).toEqual(withoutInstance(missing.body));

      const before = await snapshot(target);
      const estimate = await prisma.estimate.findUniqueOrThrow({
        where: { id: target.estimateId },
      });
      const mismatchedWrite = await request(app)
        .put(`/api/projects/${other.projectId}/estimates/${target.estimateId}`)
        .set(...auth(readAll))
        .send({
          name: `${MARK}-mismatched`,
          expectedUpdatedAt: estimate.updatedAt.toISOString(),
        })
        .expect(404);
      expect(mismatchedWrite.body.code).toBe('NOT_FOUND');
      expect(await snapshot(target)).toEqual(before);
      // 全案件閲覧の権限の利用者には見積書の案件も範囲内であり、範囲内どうしの食い違い（経路の誤り）は
      // 範囲外の拒否としては記録しない（57.9）
      const deniedAfter = await prisma.auditLog.count({
        where: { action: 'PROJECT_SCOPE_DENIED', actorId: readAll.id },
      });
      expect(deniedAfter - deniedBefore).toBe(0);
    });

    /** 利用者が残した範囲外のアクセスの記録の件数（対象の案件を指定すればその案件だけ） */
    function deniedCount(actorId: string, targetId?: string): Promise<number> {
      return prisma.auditLog.count({
        where: { action: 'PROJECT_SCOPE_DENIED', actorId, ...(targetId ? { targetId } : {}) },
      });
    }

    /**
     * 応答は不在と同じ 404 のまま、見積書の実際の案件が範囲外なら範囲外の拒否として記録する
     * （estimate-creation タスク63.1。user-authentication の要件39.8 の本機能への適用）。
     * `/:id` 配下の 8 経路（詳細・更新・一括保存・見積項目の取得・諸経費の計算・在席の通知と退出・
     * 論理的な取り除き）のすべてで、要求ごとに 1 件記録し、データを変えない。不在の見積書は記録しない
     * （範囲内の他の案件の見積書は直前のテストが記録しないことを確かめる）。
     *
     * @requirement estimate-creation/REQ-57.9
     */
    it('二重マウントの経路で、範囲外の案件の見積書を範囲内の案件の経路で指すと、読み込みも書き込みも不在と同じ 404 になり、見積書の案件を対象に記録が 1 件ずつ増え、データを変えない', async () => {
      // 要求した利用者（sales）自身の在席の行を範囲外の案件の見積書に置く。退出の要求が届けば行が消え、
      // 通知の要求が届けば lastSeenAt が変わるため、データを変えないことを snapshot で確かめられる
      await prisma.estimateEditSession.create({
        data: {
          estimateId: other.estimateId,
          userId: sales.id,
          lastSeenAt: new Date('2026-01-01T00:00:00.000Z'),
        },
      });
      try {
        const beforeTarget = await snapshot(target);
        const beforeOther = await snapshot(other);
        const estimate = await prisma.estimate.findUniqueOrThrow({
          where: { id: other.estimateId },
        });
        const expectedUpdatedAt = estimate.updatedAt.toISOString();
        const nested = `/api/projects/${target.projectId}/estimates`;

        // 不在の見積書: 404 で記録しない
        const missingBefore = await deniedCount(sales.id);
        const missing = await request(app)
          .get(`${nested}/${MISSING_ID}`)
          .set(...auth(sales))
          .expect(404);
        expect((await deniedCount(sales.id)) - missingBefore, '不在の見積書は記録しない').toBe(0);

        const calls: Array<[string, () => request.Test]> = [
          ['GET :id', () => request(app).get(`${nested}/${other.estimateId}`)],
          [
            'PUT :id',
            () =>
              request(app)
                .put(`${nested}/${other.estimateId}`)
                .send({ name: `${MARK}-mismatched`, expectedUpdatedAt }),
          ],
          [
            'PUT :id/save',
            () =>
              request(app)
                .put(`${nested}/${other.estimateId}/save`)
                .send({
                  expectedUpdatedAt,
                  reportFields: { ...REPORT_FIELDS, validityPeriod: 'mismatched' },
                  items: [
                    nodePayload({
                      id: other.estimateItemId,
                      lines: [linePayload({ name: `${MARK}-mismatched-line`, quantity: '9' })],
                    }),
                  ],
                }),
          ],
          ['GET :id/items', () => request(app).get(`${nested}/${other.estimateId}/items`)],
          [
            'POST :id/calculate-overhead',
            () =>
              request(app)
                .post(`${nested}/${other.estimateId}/calculate-overhead`)
                .send(OVERHEAD_REQUEST),
          ],
          [
            'PUT :id/edit-session',
            () => request(app).put(`${nested}/${other.estimateId}/edit-session`),
          ],
          [
            'DELETE :id/edit-session',
            () => request(app).delete(`${nested}/${other.estimateId}/edit-session`),
          ],
          [
            'DELETE :id',
            () =>
              request(app)
                .delete(`${nested}/${other.estimateId}`)
                .query({ updatedAt: expectedUpdatedAt }),
          ],
        ];
        for (const [label, call] of calls) {
          const allBefore = await deniedCount(sales.id);
          const foreignBefore = await deniedCount(sales.id, other.projectId);
          const response = await call()
            .set(...auth(sales))
            .expect(404);
          expect(response.body.code, label).toBe('NOT_FOUND');
          expect(withoutInstance(response.body), `${label}: 見積書の不在と同じ本文`).toEqual(
            withoutInstance(missing.body)
          );
          const exposed = JSON.stringify(withoutInstance(response.body));
          expect(exposed, label).not.toContain(other.projectId);
          expect(exposed, label).not.toContain(other.estimateId);
          expect(exposed, label).not.toContain(other.estimateName);
          expect((await deniedCount(sales.id)) - allBefore, `${label}: 記録は 1 件だけ増える`).toBe(
            1
          );
          expect(
            (await deniedCount(sales.id, other.projectId)) - foreignBefore,
            `${label}: 記録の対象は見積書の実際の案件`
          ).toBe(1);
        }

        expect(await snapshot(target)).toEqual(beforeTarget);
        expect(await snapshot(other), 'データは変わらない').toEqual(beforeOther);
      } finally {
        await prisma.estimateEditSession.deleteMany({
          where: { estimateId: other.estimateId, userId: sales.id },
        });
      }
    });

    /**
     * 見積書の論理削除は区別しない（design.md の 2026-10-29 の追加の章の 57.9 の決定）。範囲外の案件の
     * 論理削除済みの見積書を範囲内の案件の経路で指しても、不在と同じ 404 で見積書の案件を対象に記録する。
     *
     * @requirement estimate-creation/REQ-57.9
     */
    it('二重マウントの経路で、範囲外の案件の論理削除済みの見積書を範囲内の案件の経路で指しても、不在と同じ 404 になり、見積書の案件を対象に記録が 1 件増え、データを変えない', async () => {
      const { estimateId: deletedId } = await createEstimate(
        other.projectId,
        `${MARK}-deleted-foreign`
      );
      await prisma.estimate.update({ where: { id: deletedId }, data: { deletedAt: new Date() } });
      try {
        const beforeTarget = await snapshot(target);
        const beforeOther = await snapshot(other);
        const nested = `/api/projects/${target.projectId}/estimates`;

        const missing = await request(app)
          .get(`${nested}/${MISSING_ID}`)
          .set(...auth(sales))
          .expect(404);

        const calls: Array<[string, () => request.Test]> = [
          ['GET :id', () => request(app).get(`${nested}/${deletedId}`)],
          [
            'POST :id/calculate-overhead',
            () =>
              request(app).post(`${nested}/${deletedId}/calculate-overhead`).send(OVERHEAD_REQUEST),
          ],
        ];
        for (const [label, call] of calls) {
          const allBefore = await deniedCount(sales.id);
          const foreignBefore = await deniedCount(sales.id, other.projectId);
          const response = await call()
            .set(...auth(sales))
            .expect(404);
          expect(response.body.code, label).toBe('NOT_FOUND');
          expect(withoutInstance(response.body), `${label}: 見積書の不在と同じ本文`).toEqual(
            withoutInstance(missing.body)
          );
          expect(JSON.stringify(withoutInstance(response.body)), label).not.toContain(deletedId);
          expect((await deniedCount(sales.id)) - allBefore, `${label}: 記録は 1 件だけ増える`).toBe(
            1
          );
          expect(
            (await deniedCount(sales.id, other.projectId)) - foreignBefore,
            `${label}: 記録の対象は見積書の実際の案件`
          ).toBe(1);
        }

        expect(await snapshot(target)).toEqual(beforeTarget);
        expect(await snapshot(other)).toEqual(beforeOther);
      } finally {
        await prisma.estimate.delete({ where: { id: deletedId } });
      }
    });
  });

  describe('作成の要求が指す内訳書（57.4）', () => {
    /** 内訳書の不在の応答と比べるため、本文に写る要求の内訳書 ID を伏せる */
    function maskStatementId(body: Record<string, unknown>, statementId: string): string {
      return JSON.stringify(withoutInstance(body)).split(statementId).join('<statement-id>');
    }

    /**
     * @requirement estimate-creation/REQ-57.4
     */
    it('作成の要求が範囲外の案件の内訳書を指すと、存在しない内訳書と同じ 404 になり、見積書を作成せず、範囲外の拒否として記録する', async () => {
      const beforeTarget = await snapshot(target);
      const beforeOther = await snapshot(other);
      const deniedBefore = await prisma.auditLog.count({
        where: { action: 'PROJECT_SCOPE_DENIED', actorId: sales.id, targetId: other.projectId },
      });

      const missing = await request(app)
        .post(`/api/projects/${target.projectId}/estimates`)
        .set(...auth(sales))
        .send({ name: `${MARK}-cross`, sourceItemizedStatementId: MISSING_ID })
        .expect(404);
      const foreign = await request(app)
        .post(`/api/projects/${target.projectId}/estimates`)
        .set(...auth(sales))
        .send({ name: `${MARK}-cross`, sourceItemizedStatementId: other.itemizedStatementId })
        .expect(404);

      expect(missing.body.code).toBe('ITEMIZED_STATEMENT_NOT_FOUND');
      expect(foreign.body.code).toBe('ITEMIZED_STATEMENT_NOT_FOUND');
      expect(maskStatementId(foreign.body, other.itemizedStatementId)).toBe(
        maskStatementId(missing.body, MISSING_ID)
      );
      const exposed = JSON.stringify(withoutInstance(foreign.body));
      expect(exposed).not.toContain(other.projectId);
      expect(exposed).not.toContain('other-内訳');

      expect(await snapshot(target)).toEqual(beforeTarget);
      expect(await snapshot(other)).toEqual(beforeOther);
      const deniedAfter = await prisma.auditLog.count({
        where: { action: 'PROJECT_SCOPE_DENIED', actorId: sales.id, targetId: other.projectId },
      });
      expect(
        deniedAfter - deniedBefore,
        '範囲外の案件の内訳書は範囲外の拒否として 1 回記録する'
      ).toBe(1);
    });

    /**
     * 照合は閲覧範囲でなく作成先のプロジェクトへの所属で行う。全案件閲覧の権限の利用者でも、
     * 他のプロジェクトの内訳書からは見積書を作れない（範囲内のため範囲外の拒否としては記録しない）。
     *
     * @requirement estimate-creation/REQ-57.4
     */
    it('作成の要求が範囲内の他のプロジェクトの内訳書を指しても、存在しない内訳書と同じ 404 になり、見積書を作成せず、範囲外の拒否としては記録しない', async () => {
      const beforeTarget = await snapshot(target);
      const deniedBefore = await prisma.auditLog.count({
        where: { action: 'PROJECT_SCOPE_DENIED', actorId: readAll.id },
      });

      const missing = await request(app)
        .post(`/api/projects/${target.projectId}/estimates`)
        .set(...auth(readAll))
        .send({ name: `${MARK}-cross-in-scope`, sourceItemizedStatementId: MISSING_ID })
        .expect(404);
      const foreign = await request(app)
        .post(`/api/projects/${target.projectId}/estimates`)
        .set(...auth(readAll))
        .send({
          name: `${MARK}-cross-in-scope`,
          sourceItemizedStatementId: other.itemizedStatementId,
        })
        .expect(404);

      expect(foreign.body.code).toBe('ITEMIZED_STATEMENT_NOT_FOUND');
      expect(maskStatementId(foreign.body, other.itemizedStatementId)).toBe(
        maskStatementId(missing.body, MISSING_ID)
      );
      expect(await snapshot(target)).toEqual(beforeTarget);
      expect(
        await prisma.auditLog.count({
          where: { action: 'PROJECT_SCOPE_DENIED', actorId: readAll.id },
        })
      ).toBe(deniedBefore);
    });

    /**
     * 所属の照合を論理削除の確かめより先に置くため、範囲外の案件の論理削除済みの内訳書を指す作成は、
     * 存在しない内訳書と同じ 404 の本文のまま、内訳書の案件を対象に範囲外の拒否として 1 件記録する。
     * 作成先のプロジェクトの論理削除済みの内訳書と、範囲内の利用者が同じ論理削除済みの内訳書を指す
     * 作成は記録しない（design.md の「2026-10-30 の追加」章の「決定」の「内訳書の照合の順」、
     * タスク65.1）。
     *
     * @requirement estimate-creation/REQ-57.10
     */
    it('作成の要求が範囲外の案件の論理削除済みの内訳書を指すと、存在しない内訳書と同じ 404 の本文になり、見積書を作成せず、内訳書の案件を対象に範囲外の拒否として 1 件記録する', async () => {
      const deletedStatement = (projectId: string, label: string) =>
        prisma.itemizedStatement.create({
          data: {
            projectId,
            name: `${MARK}-${label}-deleted-statement`,
            sourceQuantityTableId: `${MARK}-${label}-deleted-qt`,
            sourceQuantityTableName: `${label} の論理削除済みの数量表`,
            deletedAt: new Date(),
          },
          select: { id: true },
        });
      const deletedForeign = await deletedStatement(other.projectId, 'other');
      const deletedOwn = await deletedStatement(target.projectId, 'target');
      const deniedCount = (actorId: string, targetId?: string): Promise<number> =>
        prisma.auditLog.count({
          where: { action: 'PROJECT_SCOPE_DENIED', actorId, ...(targetId ? { targetId } : {}) },
        });
      const name = `${MARK}-cross-deleted`;
      const create = (actor: TestUser, sourceItemizedStatementId: string) =>
        request(app)
          .post(`/api/projects/${target.projectId}/estimates`)
          .set(...auth(actor))
          .send({ name, sourceItemizedStatementId })
          .expect(404);
      try {
        const beforeTarget = await snapshot(target);
        const beforeOther = await snapshot(other);

        const missing = await create(sales, MISSING_ID);
        expect(missing.body.code).toBe('ITEMIZED_STATEMENT_NOT_FOUND');
        const missingMasked = maskStatementId(missing.body, MISSING_ID);

        // 範囲外の案件の論理削除済みの内訳書: 内訳書の案件を対象に 1 件記録する
        const allBefore = await deniedCount(sales.id);
        const foreignBefore = await deniedCount(sales.id, other.projectId);
        const foreign = await create(sales, deletedForeign.id);
        expect(foreign.body.code).toBe('ITEMIZED_STATEMENT_NOT_FOUND');
        expect(maskStatementId(foreign.body, deletedForeign.id)).toBe(missingMasked);
        expect(JSON.stringify(withoutInstance(foreign.body))).not.toContain(other.projectId);
        expect((await deniedCount(sales.id)) - allBefore, '記録は 1 件だけ増える').toBe(1);
        expect(
          (await deniedCount(sales.id, other.projectId)) - foreignBefore,
          '記録の対象は内訳書の案件'
        ).toBe(1);

        // 作成先のプロジェクトの論理削除済みの内訳書: 同じ 404 で記録しない
        const ownBefore = await deniedCount(sales.id);
        const own = await create(sales, deletedOwn.id);
        expect(maskStatementId(own.body, deletedOwn.id)).toBe(missingMasked);
        expect((await deniedCount(sales.id)) - ownBefore).toBe(0);

        // 範囲内の利用者が同じ論理削除済みの内訳書を指しても記録しない
        const readAllBefore = await deniedCount(readAll.id);
        const inScope = await create(readAll, deletedForeign.id);
        expect(maskStatementId(inScope.body, deletedForeign.id)).toBe(missingMasked);
        expect((await deniedCount(readAll.id)) - readAllBefore).toBe(0);

        expect(await snapshot(target)).toEqual(beforeTarget);
        expect(await snapshot(other)).toEqual(beforeOther);
        expect(await prisma.estimate.count({ where: { name } })).toBe(0);
      } finally {
        await prisma.itemizedStatement.deleteMany({
          where: { id: { in: [deletedForeign.id, deletedOwn.id] } },
        });
      }
    });
  });

  describe('見積明細の一括保存の見積項目の所属（57.5）', () => {
    /**
     * 既存の検証（Requirement 42.4 の 422）が要求全体を書き込みの前に拒否する振る舞いを固定する。
     * 応答は存在しない見積項目の ID を含む場合と同じで、他の案件の見積項目の実在を推測させない。
     *
     * @requirement estimate-creation/REQ-57.5
     */
    it('自案件の見積書の一括保存に他の案件の見積書の見積項目の ID が一つでも混じると、存在しない ID と同じ 422 で要求全体を拒否し、どの見積項目にも書き込まない', async () => {
      const beforeTarget = await snapshot(target);
      const beforeOther = await snapshot(other);
      const estimate = await prisma.estimate.findUniqueOrThrow({
        where: { id: target.estimateId },
      });

      const save = (foreignOrMissingId: string): request.Test =>
        request(app)
          .put(`/api/estimates/${target.estimateId}/save`)
          .set(...auth(sales))
          .send({
            expectedUpdatedAt: estimate.updatedAt.toISOString(),
            reportFields: { ...REPORT_FIELDS, validityPeriod: '書き換えの試み' },
            items: [
              // 自分の見積項目の書き換えと新規の追加を含め、部分適用されないことを確かめる
              nodePayload({
                id: target.estimateItemId,
                lines: [linePayload({ name: '書き換えの試み' })],
              }),
              nodePayload({ tempId: 'new-1', lines: [linePayload({ name: '追加の試み' })] }),
              nodePayload({
                id: foreignOrMissingId,
                lines: [linePayload({ name: '他の案件の見積項目の書き換えの試み' })],
              }),
            ],
          });

      const missing = await save(MISSING_ID).expect(422);
      const foreign = await save(other.estimateItemId).expect(422);

      expect(foreign.body.code).toBe('ESTIMATE_DRAFT_VALIDATION_ERROR');
      expect(
        JSON.stringify(withoutInstance(foreign.body)).split(other.estimateItemId).join('<id>')
      ).toBe(JSON.stringify(withoutInstance(missing.body)).split(MISSING_ID).join('<id>'));
      expect(JSON.stringify(withoutInstance(foreign.body))).not.toContain(other.estimateId);
      expect(JSON.stringify(withoutInstance(foreign.body))).not.toContain(other.projectId);

      expect(await snapshot(target)).toEqual(beforeTarget);
      expect(await snapshot(other)).toEqual(beforeOther);
    });

    /**
     * 応答は 57.5 の 422 のまま、属さない見積項目の ID の実際の案件が範囲外なら、その案件を対象に範囲外の拒否として
     * 1 件記録する（タスク66.1。design.md の「2026-10-31 の追加」章。user-authentication の要件39.7・39.8）。
     * 見積書が論理削除済みでも行が実在すればその案件で判定し、構造の不備（重複配置）の 422 で終わる本文でも記録する。
     * 全案件閲覧の権限の利用者・同じ案件の別の見積書・範囲内の他の案件・存在しない ID・案件そのものの論理削除と、
     * 形式の不正の 400 では記録しない。
     *
     * @requirement estimate-creation/REQ-57.11
     */
    it('自案件の見積書の一括保存の本文に範囲外の案件の見積項目の ID が混じると、従来の 422 の本文のまま範囲外の案件を対象に記録が 1 件増え、どの見積書のデータも変わらない', async () => {
      const deniedCount = (actorId: string, targetId?: string): Promise<number> =>
        prisma.auditLog.count({
          where: { action: 'PROJECT_SCOPE_DENIED', actorId, ...(targetId ? { targetId } : {}) },
        });
      // 範囲外の案件の論理削除済みの見積書の見積項目
      const deletedForeign = await createEstimate(
        other.projectId,
        `${MARK}-other-deleted-estimate`
      );
      await prisma.estimate.update({
        where: { id: deletedForeign.estimateId },
        data: { deletedAt: new Date() },
      });
      // 同じ案件の別の見積書の見積項目
      const sameProject = await createEstimate(target.projectId, `${MARK}-target-second-estimate`);
      // 範囲内の他の案件（担当者が営業担当者）の見積項目
      const inScope = await createFixture('in-scope', {
        salesPersonId: sales.id,
        createdById: sales.id,
      });
      // 案件そのものが論理削除された、担当外の案件の見積項目
      const gone = await createFixture('gone', {
        salesPersonId: outsider.id,
        createdById: outsider.id,
      });
      await prisma.project.update({
        where: { id: gone.projectId },
        data: { deletedAt: new Date() },
      });

      try {
        const beforeTarget = await snapshot(target);
        const beforeOther = await snapshot(other);
        const estimate = await prisma.estimate.findUniqueOrThrow({
          where: { id: target.estimateId },
        });
        const body = (mixedId: string, extra: Record<string, unknown>[] = []) => ({
          expectedUpdatedAt: estimate.updatedAt.toISOString(),
          reportFields: { ...REPORT_FIELDS, validityPeriod: '書き換えの試み' },
          items: [
            nodePayload({
              id: target.estimateItemId,
              lines: [linePayload({ name: '書き換えの試み' })],
            }),
            ...extra,
            nodePayload({
              id: mixedId,
              lines: [linePayload({ name: '他の見積書の見積項目の書き換えの試み' })],
            }),
          ],
        });
        const save = (actor: TestUser, payload: Record<string, unknown>): request.Test =>
          request(app)
            .put(`/api/estimates/${target.estimateId}/save`)
            .set(...auth(actor))
            .send(payload);
        const masked = (res: request.Response, id: string): string =>
          JSON.stringify(withoutInstance(res.body)).split(id).join('<id>');

        const missing = await save(sales, body(MISSING_ID)).expect(422);
        const missingMasked = masked(missing, MISSING_ID);

        // 記録する: 範囲外の案件の見積項目（見積書が論理削除済みでも同じ）
        for (const [label, itemId] of [
          ['範囲外の案件の見積項目', other.estimateItemId],
          ['範囲外の案件の論理削除済みの見積書の見積項目', deletedForeign.estimateItemId],
        ] as const) {
          const allBefore = await deniedCount(sales.id);
          const foreignBefore = await deniedCount(sales.id, other.projectId);
          const res = await save(sales, body(itemId)).expect(422);
          expect(masked(res, itemId), `${label}: 存在しない ID と同じ本文`).toBe(missingMasked);
          expect(JSON.stringify(withoutInstance(res.body)), label).not.toContain(other.projectId);
          expect((await deniedCount(sales.id)) - allBefore, `${label}: 記録は 1 件だけ増える`).toBe(
            1
          );
          expect(
            (await deniedCount(sales.id, other.projectId)) - foreignBefore,
            `${label}: 記録の対象は見積項目の実際の案件`
          ).toBe(1);
        }

        // 記録する: 構造の不備（同じ既存 ID の重複配置）を併せて含む本文。応答は構造の不備の 422
        const duplicated = nodePayload({ id: target.estimateItemId });
        const structuralBefore = await deniedCount(sales.id, other.projectId);
        const structural = await save(sales, body(other.estimateItemId, [duplicated])).expect(422);
        expect(structural.body.code).toBe('ESTIMATE_DRAFT_VALIDATION_ERROR');
        expect(JSON.stringify(withoutInstance(structural.body))).not.toContain(other.projectId);
        expect(
          (await deniedCount(sales.id, other.projectId)) - structuralBefore,
          '構造の不備の 422 で終わる本文でも記録する'
        ).toBe(1);

        // 記録しない: 形式の不正の 400 で終わる本文
        const formatBefore = await deniedCount(sales.id);
        await save(sales, {
          ...body(other.estimateItemId),
          expectedUpdatedAt: '日時ではない',
        }).expect(400);
        expect((await deniedCount(sales.id)) - formatBefore, '形式の不正の 400 は判定しない').toBe(
          0
        );

        // 記録しない: 同じ案件の別の見積書・範囲内の他の案件・存在しない ID・案件そのものの論理削除
        for (const [label, itemId] of [
          ['同じ案件の別の見積書の見積項目', sameProject.estimateItemId],
          ['範囲内の他の案件の見積項目', inScope.estimateItemId],
          ['存在しない ID', MISSING_ID],
          ['案件そのものが論理削除された見積項目', gone.estimateItemId],
        ] as const) {
          const allBefore = await deniedCount(sales.id);
          const res = await save(sales, body(itemId)).expect(422);
          expect(masked(res, itemId), `${label}: 存在しない ID と同じ本文`).toBe(missingMasked);
          expect((await deniedCount(sales.id)) - allBefore, `${label}: 記録しない`).toBe(0);
        }

        // 記録しない: 全案件閲覧の権限の利用者
        const readAllBefore = await deniedCount(readAll.id);
        const readAllRes = await save(readAll, body(other.estimateItemId)).expect(422);
        expect(masked(readAllRes, other.estimateItemId)).toBe(missingMasked);
        expect(
          (await deniedCount(readAll.id)) - readAllBefore,
          '全案件閲覧の利用者は記録しない'
        ).toBe(0);

        expect(await snapshot(target)).toEqual(beforeTarget);
        expect(await snapshot(other)).toEqual(beforeOther);
      } finally {
        await prisma.estimate.deleteMany({
          where: { id: { in: [deletedForeign.estimateId, sameProject.estimateId] } },
        });
      }
    });

    /**
     * 総数の上限（2000）か深さの上限（100段）で Zod の検証の前に打ち切った本文も、読んだ節点の ID で
     * 57.11 の判定と記録を行う（タスク67.1。design.md の「2026-10-31 の追加: 一括保存の本文の件数の前倒しの
     * 数え上げと備考の文字数の上限」の章の「決定」）。打ち切った後ろの節点の ID は読まない。
     *
     * @requirement estimate-creation/REQ-57.11
     * @requirement estimate-creation/REQ-42.10
     * @requirement estimate-creation/REQ-42.12
     */
    it('件数・深さの上限を超えた本文に範囲外の案件の見積項目の ID を含めると、上限の 422 のまま範囲外の案件を対象に記録が 1 件増え、どの見積書のデータも変わらない', async () => {
      const deniedCount = (actorId: string, targetId: string): Promise<number> =>
        prisma.auditLog.count({ where: { action: 'PROJECT_SCOPE_DENIED', actorId, targetId } });
      const beforeTarget = await snapshot(target);
      const beforeOther = await snapshot(other);
      const estimate = await prisma.estimate.findUniqueOrThrow({
        where: { id: target.estimateId },
      });
      const body = (items: Record<string, unknown>[]) => ({
        expectedUpdatedAt: estimate.updatedAt.toISOString(),
        reportFields: { ...REPORT_FIELDS, validityPeriod: '書き換えの試み' },
        items,
      });
      const fresh = (count: number): Record<string, unknown>[] =>
        Array.from({ length: count }, (_, index) => nodePayload({ tempId: `over-${index}` }));
      const foreignNode = (children: Record<string, unknown>[] = []): Record<string, unknown> =>
        nodePayload({ id: other.estimateItemId, children });
      /** 範囲外の案件の見積項目を根に置いた深さ `depth` の鎖 */
      const deepChain = (depth: number): Record<string, unknown> => {
        let current = nodePayload({ tempId: `deep-${depth}` });
        for (let level = depth - 1; level >= 2; level -= 1) {
          current = nodePayload({ tempId: `deep-${level}`, children: [current] });
        }
        return foreignNode([current]);
      };
      const save = (payload: Record<string, unknown>): request.Test =>
        request(app)
          .put(`/api/estimates/${target.estimateId}/save`)
          .set(...auth(sales))
          .send(payload);

      for (const [label, items, message] of [
        [
          '総数が 2001 件（範囲外の ID は先頭）',
          [foreignNode(), ...fresh(2000)],
          '見積明細は合計2000件以内で保存してください',
        ],
        [
          '深さが 101 段（範囲外の ID は根）',
          [deepChain(101)],
          '見積項目の階層は100段以内で保存してください',
        ],
      ] as const) {
        const before = await deniedCount(sales.id, other.projectId);
        const res = await save(body([...items])).expect(422);
        expect(res.body.code, label).toBe('ESTIMATE_DRAFT_VALIDATION_ERROR');
        expect(res.body.details.issues, label).toEqual([{ path: 'items', message }]);
        expect(JSON.stringify(withoutInstance(res.body)), label).not.toContain(other.projectId);
        expect(
          (await deniedCount(sales.id, other.projectId)) - before,
          `${label}: 記録の対象は見積項目の実際の案件で 1 件`
        ).toBe(1);
      }

      // 打ち切った後ろ（2002 件目）の範囲外の ID は読まないため記録しない
      const afterCutBefore = await deniedCount(sales.id, other.projectId);
      await save(body([...fresh(2001), foreignNode()])).expect(422);
      expect(
        (await deniedCount(sales.id, other.projectId)) - afterCutBefore,
        '打ち切った後ろの ID は判定しない'
      ).toBe(0);

      expect(await snapshot(target)).toEqual(beforeTarget);
      expect(await snapshot(other)).toEqual(beforeOther);
    });
  });
});
