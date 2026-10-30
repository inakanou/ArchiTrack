/**
 * @fileoverview 見積依頼・受領見積書・ステータスの API への案件の閲覧範囲の適用の統合検証
 * （estimate-request タスク103.1）
 *
 * 本物のアプリ（app.ts のルート・authenticate・requirePermission・requireProjectScope・共有の
 * ProjectScopeService と RBACService）と、テスト用の実データベース・実ストレージ（STORAGE_TYPE=local）を通す。
 *
 * 被覆する受入基準（estimate-request の Requirement 42 と、改訂した Requirement 10）は各 it の
 * `@requirement` の印が名乗る。
 *
 * 利用者（いずれもテストで作るロール。ロール名は admin ではない）:
 * - MEMBER: 見積依頼の閲覧・作成・編集・削除の権限だけを持ち、全案件閲覧の権限を持たない
 * - READ_ALL: MEMBER の権限に全案件閲覧の権限（project:read_all）を加えたもの
 * - 案件 target の営業担当者・工事担当者・作成者（関係者）、担当外の利用者、全案件閲覧の利用者、権限なしの利用者
 * - 案件 other の営業担当者・作成者は担当外の利用者（範囲外の内訳書・見積依頼を用意するため）
 */

import fs from 'node:fs';
import path from 'node:path';
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

const MARK = 'test-er103-scope';
const MEMBER_ROLE = `${MARK}-member`;
const READ_ALL_ROLE = `${MARK}-read-all`;
const NO_PERMISSION_ROLE = `${MARK}-no-permission`;
/** 版 4・変種 8 の整った UUID（ID の形式の検査を通り、どの行としても存在しない） */
const MISSING_ID = '00000000-0000-4000-8000-000000103100';

interface TestUser {
  id: string;
  token: string;
}

interface Fixture {
  projectId: string;
  itemizedStatementId: string;
  estimateRequestId: string;
  quotationId: string;
}

describe('見積依頼・受領見積書・ステータスの API の閲覧範囲（統合・実 DB）', () => {
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
  /** 案件 target の見積依頼と同じ内訳書の項目を選んだ、同じ案件の別の見積依頼（範囲内） */
  let siblingRequestId: string;
  /** 案件 other に属しながら案件 target の内訳書を指し、同じ項目を選んだ見積依頼（target の関係者には範囲外） */
  let foreignRequestId: string;

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
    const requests = await prisma.estimateRequest.findMany({
      where: { projectId: { in: projectIds } },
      select: { id: true },
    });
    const requestIds = requests.map((r) => r.id);
    await deleteAuditLogsWithArchivePermission(prisma, {
      OR: [
        { actorId: { in: userIds } },
        { targetId: { in: userIds } },
        { targetId: { in: projectIds } },
        { targetId: { in: requestIds } },
      ],
    });
    // 見積依頼・項目・受領見積書・ステータス履歴・内訳書は案件の削除に連なって消える
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
      data: { name, description: 'estimate-request タスク103 の検証用' },
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

  /** 利用者が残した範囲外のアクセスの記録の件数（対象を指定すればその案件だけ） */
  function deniedCount(user: TestUser, targetId?: string): Promise<number> {
    return prisma.auditLog.count({
      where: {
        action: 'PROJECT_SCOPE_DENIED',
        actorId: user.id,
        ...(targetId ? { targetId } : {}),
      },
    });
  }

  function withoutInstance(body: Record<string, unknown>): Record<string, unknown> {
    const { instance: _instance, ...rest } = body;
    return rest;
  }

  /** 内訳書（2 項目）を作る */
  async function createItemizedStatement(projectId: string, label: string): Promise<string> {
    const statement = await prisma.itemizedStatement.create({
      data: {
        projectId,
        name: `${MARK}-${label}-statement`,
        sourceQuantityTableId: `${MARK}-${label}-qt`,
        sourceQuantityTableName: `${label} の数量表`,
        items: {
          create: [
            { workType: '工種1', name: '名称1', unit: '式', quantity: 1, displayOrder: 1 },
            { workType: '工種2', name: '名称2', unit: 'm', quantity: 2, displayOrder: 2 },
          ],
        },
      },
      select: { id: true },
    });
    return statement.id;
  }

  /** 内訳書の全項目を選んだ見積依頼を作る */
  async function createEstimateRequest(
    projectId: string,
    itemizedStatementId: string,
    name: string
  ): Promise<string> {
    const items = await prisma.itemizedStatementItem.findMany({
      where: { itemizedStatementId },
      select: { id: true },
    });
    const created = await prisma.estimateRequest.create({
      data: {
        projectId,
        tradingPartnerId,
        itemizedStatementId,
        name,
        selectedItems: {
          create: items.map((item) => ({ itemizedStatementItemId: item.id, selected: true })),
        },
      },
      select: { id: true },
    });
    return created.id;
  }

  async function createFixture(
    label: string,
    people: { salesPersonId: string; constructionPersonId?: string; createdById: string }
  ): Promise<Fixture> {
    const project = await prisma.project.create({
      data: { name: `${MARK}-${label}`, ...people },
      select: { id: true },
    });
    const itemizedStatementId = await createItemizedStatement(project.id, label);
    const estimateRequestId = await createEstimateRequest(
      project.id,
      itemizedStatementId,
      `${MARK}-${label}-request`
    );
    const quotation = await prisma.receivedQuotation.create({
      data: {
        estimateRequestId,
        name: `${MARK}-${label}-quotation`,
        submittedAt: new Date('2026-10-01'),
        filePath: `quotations/${estimateRequestId}/${label}.pdf`,
        fileName: `${label}.pdf`,
        fileMimeType: 'application/pdf',
        fileSize: 1024,
      },
      select: { id: true },
    });
    return {
      projectId: project.id,
      itemizedStatementId,
      estimateRequestId,
      quotationId: quotation.id,
    };
  }

  /** 対象の案件の見積依頼まわりのデータの状態（範囲外の要求の前後で変わらないことを比べる） */
  async function snapshot(fixture: Fixture): Promise<unknown> {
    return {
      requests: await prisma.estimateRequest.findMany({
        where: { projectId: fixture.projectId },
        select: {
          id: true,
          name: true,
          method: true,
          status: true,
          deletedAt: true,
          updatedAt: true,
        },
        orderBy: { id: 'asc' },
      }),
      items: await prisma.estimateRequestItem.findMany({
        where: { estimateRequest: { projectId: fixture.projectId } },
        select: { id: true, selected: true },
        orderBy: { id: 'asc' },
      }),
      quotations: await prisma.receivedQuotation.findMany({
        where: { estimateRequest: { projectId: fixture.projectId } },
        select: {
          id: true,
          name: true,
          filePath: true,
          fileName: true,
          deletedAt: true,
          updatedAt: true,
        },
        orderBy: { id: 'asc' },
      }),
      statusHistories: await prisma.estimateRequestStatusHistory.count({
        where: { estimateRequest: { projectId: fixture.projectId } },
      }),
    };
  }

  /** 見積依頼ごとの受領見積書のファイルの一覧（ローカルストレージ。要求の前後で変わらないことを比べる） */
  function storedQuotationFiles(estimateRequestIds: string[]): string[] {
    const root = process.env.LOCAL_STORAGE_PATH;
    expect(root, '前提: ローカルストレージのパス').toBeTruthy();
    const files: string[] = [];
    for (const estimateRequestId of estimateRequestIds) {
      const dir = path.join(root ?? '', 'quotations', estimateRequestId);
      if (fs.existsSync(dir)) {
        for (const entry of fs.readdirSync(dir, { recursive: true })) {
          files.push(path.join(estimateRequestId, String(entry)));
        }
      }
    }
    return files.sort();
  }

  beforeAll(async () => {
    prisma = getPrismaClient();
    await cleanup();
    await seedRoles(prisma);
    await seedPermissions(prisma);
    await seedRolePermissions(prisma);

    const memberPermissions: Array<[string, string]> = [
      ['estimate_request', 'create'],
      ['estimate_request', 'read'],
      ['estimate_request', 'update'],
      ['estimate_request', 'delete'],
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
        email: 'er103-partner@example.com',
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
    siblingRequestId = await createEstimateRequest(
      target.projectId,
      target.itemizedStatementId,
      `${MARK}-sibling-request`
    );
    // 別の案件の見積依頼が同じ内訳書を指せる（作成の要求の判定の前に作られたデータを想定し DB で作る）
    foreignRequestId = await createEstimateRequest(
      other.projectId,
      target.itemizedStatementId,
      `${MARK}-foreign-request`
    );
  });

  afterAll(async () => {
    await cleanup();
  });

  describe('範囲内の利用者（42.1・42.6・42.7）', () => {
    /**
     * @requirement estimate-request/REQ-42.1
     * @requirement estimate-request/REQ-42.6
     * @requirement estimate-request/REQ-42.7
     * @requirement estimate-request/REQ-10.1
     */
    it('営業担当者・工事担当者・作成者・全案件閲覧の権限の利用者は、一覧・直近・詳細・項目・見積依頼文・履歴・受領見積書を得られ、署名付きURLが発行される', async () => {
      for (const user of [sales, construction, creator, readAll]) {
        const list = await request(app)
          .get(`/api/projects/${target.projectId}/estimate-requests`)
          .set(...auth(user))
          .expect(200);
        const listedIds = list.body.data.map((r: { id: string }) => r.id);
        expect(listedIds).toContain(target.estimateRequestId);
        expect(listedIds).not.toContain(foreignRequestId);

        const latest = await request(app)
          .get(`/api/projects/${target.projectId}/estimate-requests/latest`)
          .set(...auth(user))
          .expect(200);
        expect(latest.body.totalCount).toBe(2);

        const detail = await request(app)
          .get(`/api/estimate-requests/${target.estimateRequestId}`)
          .set(...auth(user))
          .expect(200);
        expect(detail.body.id).toBe(target.estimateRequestId);

        // 二重マウントでも、経路の案件と見積依頼の案件が一致すれば従来どおり
        await request(app)
          .get(`/api/projects/${target.projectId}/estimate-requests/${target.estimateRequestId}`)
          .set(...auth(user))
          .expect(200);

        const items = await request(app)
          .get(`/api/estimate-requests/${target.estimateRequestId}/items-with-status`)
          .set(...auth(user))
          .expect(200);
        expect(items.body).toHaveLength(2);

        const text = await request(app)
          .get(`/api/estimate-requests/${target.estimateRequestId}/text`)
          .set(...auth(user))
          .expect(200);
        expect(text.body.recipient).toBe('er103-partner@example.com');

        await request(app)
          .get(`/api/estimate-requests/${target.estimateRequestId}/status-history`)
          .set(...auth(user))
          .expect(200);

        // Excel の経路は未実装（501）のまま。範囲内では従来どおりの応答が届く
        await request(app)
          .get(`/api/estimate-requests/${target.estimateRequestId}/excel`)
          .set(...auth(user))
          .expect(501);

        const quotations = await request(app)
          .get(`/api/estimate-requests/${target.estimateRequestId}/quotations`)
          .set(...auth(user))
          .expect(200);
        expect(quotations.body.map((q: { id: string }) => q.id)).toEqual([target.quotationId]);

        const quotation = await request(app)
          .get(`/api/quotations/${target.quotationId}`)
          .set(...auth(user))
          .expect(200);
        expect(quotation.body.id).toBe(target.quotationId);

        const preview = await request(app)
          .get(`/api/quotations/${target.quotationId}/preview`)
          .set(...auth(user))
          .expect(200);
        expect(preview.body.url, '受領見積書のファイルの署名付きURL').toBeTruthy();
      }
    });

    /**
     * @requirement estimate-request/REQ-42.1
     * @requirement estimate-request/REQ-10.2
     */
    it('関係者と全案件閲覧の権限の利用者は、見積依頼の作成・更新・項目の選択・ステータスの変更・削除と受領見積書の登録・更新・削除を行える', async () => {
      const created = await request(app)
        .post(`/api/projects/${target.projectId}/estimate-requests`)
        .set(...auth(construction))
        .send({
          name: `${MARK}-created`,
          tradingPartnerId,
          itemizedStatementId: target.itemizedStatementId,
        })
        .expect(201);
      const createdId = created.body.id as string;

      const updated = await request(app)
        .put(`/api/estimate-requests/${createdId}`)
        .set(...auth(creator))
        .send({ name: `${MARK}-renamed`, expectedUpdatedAt: created.body.updatedAt })
        .expect(200);
      expect(updated.body.name).toBe(`${MARK}-renamed`);

      const items = await request(app)
        .get(`/api/estimate-requests/${createdId}/items-with-status`)
        .set(...auth(sales))
        .expect(200);
      await request(app)
        .patch(`/api/estimate-requests/${createdId}/items`)
        .set(...auth(sales))
        .send({ items: [{ itemId: items.body[0].estimateRequestItemId, selected: true }] })
        .expect(204);

      await request(app)
        .patch(`/api/estimate-requests/${createdId}/status`)
        .set(...auth(readAll))
        .send({ status: 'REQUESTED' })
        .expect(200);

      const quotation = await request(app)
        .post(`/api/estimate-requests/${createdId}/quotations`)
        .set(...auth(construction))
        .field('name', `${MARK}-created-quotation`)
        .field('submittedAt', '2026-10-27T00:00:00.000Z')
        .field(
          'lineItems',
          JSON.stringify([{ name: '項目', sortOrder: 0, quantity: 1, unitPrice: 1000 }])
        )
        .expect(201);
      const quotationUpdated = await request(app)
        .put(`/api/quotations/${quotation.body.id}`)
        .set(...auth(creator))
        .field('name', `${MARK}-renamed-quotation`)
        .field('expectedUpdatedAt', quotation.body.updatedAt)
        .expect(200);
      await request(app)
        .delete(`/api/quotations/${quotation.body.id}`)
        .set(...auth(sales))
        .send({ updatedAt: quotationUpdated.body.updatedAt })
        .expect(204);

      const current = await prisma.estimateRequest.findUniqueOrThrow({ where: { id: createdId } });
      await request(app)
        .delete(`/api/estimate-requests/${createdId}`)
        .set(...auth(readAll))
        .query({ updatedAt: current.updatedAt.toISOString() })
        .expect(204);
    });

    /**
     * 解決関数は論理削除された見積依頼からも案件 ID を引く。範囲内の利用者には本体の 404
     * （見積依頼の不在の符号）がそのまま届き、範囲外の利用者には不在と同じ汎用の 404 が返る。
     *
     * @requirement estimate-request/REQ-42.1
     * @requirement estimate-request/REQ-42.2
     */
    it('論理削除された見積依頼は、範囲内の利用者には本体の 404、範囲外の利用者には汎用の 404 を返す', async () => {
      const deletedId = await createEstimateRequest(
        target.projectId,
        target.itemizedStatementId,
        `${MARK}-deleted`
      );
      await prisma.estimateRequest.update({
        where: { id: deletedId },
        data: { deletedAt: new Date() },
      });
      const inScope = await request(app)
        .get(`/api/estimate-requests/${deletedId}`)
        .set(...auth(sales))
        .expect(404);
      expect(inScope.body.code).toBe('ESTIMATE_REQUEST_NOT_FOUND');

      const outOfScope = await request(app)
        .get(`/api/estimate-requests/${deletedId}`)
        .set(...auth(outsider))
        .expect(404);
      expect(outOfScope.body.code).toBe('NOT_FOUND');
      expect(JSON.stringify(withoutInstance(outOfScope.body))).not.toContain(deletedId);
      await prisma.estimateRequest.delete({ where: { id: deletedId } });
    });
  });

  describe('他の見積依頼での選択状態（42.6）', () => {
    /**
     * @requirement estimate-request/REQ-42.6
     */
    it('他の見積依頼での選択状態には、閲覧範囲内の案件の見積依頼だけが載り、範囲外の見積依頼の名前・取引先は返らない', async () => {
      const forSales = await request(app)
        .get(`/api/estimate-requests/${target.estimateRequestId}/items-with-status`)
        .set(...auth(sales))
        .expect(200);
      for (const item of forSales.body as Array<{
        otherRequests: Array<{ estimateRequestId: string }>;
      }>) {
        expect(item.otherRequests.map((r) => r.estimateRequestId)).toEqual([siblingRequestId]);
      }
      expect(JSON.stringify(forSales.body)).not.toContain(`${MARK}-foreign-request`);
      expect(JSON.stringify(forSales.body)).not.toContain(foreignRequestId);

      // 全案件閲覧の権限の利用者には、別の案件の見積依頼も従来どおり載る
      const forReadAll = await request(app)
        .get(`/api/estimate-requests/${target.estimateRequestId}/items-with-status`)
        .set(...auth(readAll))
        .expect(200);
      for (const item of forReadAll.body as Array<{
        otherRequests: Array<{ estimateRequestId: string }>;
      }>) {
        expect(item.otherRequests.map((r) => r.estimateRequestId).sort()).toEqual(
          [siblingRequestId, foreignRequestId].sort()
        );
      }
    });
  });

  describe('範囲外の ID 指定（42.2・42.3・42.5・42.6・42.7）', () => {
    /**
     * @requirement estimate-request/REQ-42.2
     * @requirement estimate-request/REQ-42.3
     * @requirement estimate-request/REQ-42.6
     * @requirement estimate-request/REQ-42.7
     * @requirement estimate-request/REQ-10.3
     */
    it('担当外の利用者の読み取りは、存在しない ID と同じ 404 の本文になり、署名付きURLも案件 ID も返らない', async () => {
      const readPaths: Array<[string, string]> = [
        [
          `/api/projects/${target.projectId}/estimate-requests`,
          `/api/projects/${MISSING_ID}/estimate-requests`,
        ],
        [
          `/api/projects/${target.projectId}/estimate-requests/latest`,
          `/api/projects/${MISSING_ID}/estimate-requests/latest`,
        ],
        [
          `/api/estimate-requests/${target.estimateRequestId}`,
          `/api/estimate-requests/${MISSING_ID}`,
        ],
        [
          `/api/projects/${target.projectId}/estimate-requests/${target.estimateRequestId}`,
          `/api/projects/${target.projectId}/estimate-requests/${MISSING_ID}`,
        ],
        [
          `/api/estimate-requests/${target.estimateRequestId}/items-with-status`,
          `/api/estimate-requests/${MISSING_ID}/items-with-status`,
        ],
        [
          `/api/estimate-requests/${target.estimateRequestId}/text`,
          `/api/estimate-requests/${MISSING_ID}/text`,
        ],
        [
          `/api/estimate-requests/${target.estimateRequestId}/excel`,
          `/api/estimate-requests/${MISSING_ID}/excel`,
        ],
        [
          `/api/estimate-requests/${target.estimateRequestId}/status-history`,
          `/api/estimate-requests/${MISSING_ID}/status-history`,
        ],
        [
          `/api/estimate-requests/${target.estimateRequestId}/quotations`,
          `/api/estimate-requests/${MISSING_ID}/quotations`,
        ],
        [`/api/quotations/${target.quotationId}`, `/api/quotations/${MISSING_ID}`],
        [`/api/quotations/${target.quotationId}/preview`, `/api/quotations/${MISSING_ID}/preview`],
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
        expect(exposed, outOfScopePath).not.toContain(target.estimateRequestId);
        expect(exposed, outOfScopePath).not.toContain(target.quotationId);
        expect(outOfScope.body.url, outOfScopePath).toBeUndefined();
      }
    });

    /**
     * @requirement estimate-request/REQ-42.2
     * @requirement estimate-request/REQ-42.3
     * @requirement estimate-request/REQ-42.5
     * @requirement estimate-request/REQ-10.4
     */
    it('担当外の利用者の作成・更新・項目の選択の保存・ステータスの変更・削除は、存在しない ID と同じ 404 の本文になり、データベースを変えない', async () => {
      const before = await snapshot(target);
      const estimateRequest = await prisma.estimateRequest.findUniqueOrThrow({
        where: { id: target.estimateRequestId },
      });
      const quotation = await prisma.receivedQuotation.findUniqueOrThrow({
        where: { id: target.quotationId },
      });
      const requestItem = await prisma.estimateRequestItem.findFirstOrThrow({
        where: { estimateRequestId: target.estimateRequestId },
      });

      type Ids = { project: string; request: string; quotation: string };
      type Call = (id: Ids) => request.Test;
      const writes: Array<[string, Call]> = [
        [
          'POST estimate-requests',
          (id) =>
            request(app)
              .post(`/api/projects/${id.project}/estimate-requests`)
              .send({ name: `${MARK}-intrusion`, tradingPartnerId }),
        ],
        [
          'PUT estimate-requests/:id',
          (id) =>
            request(app)
              .put(`/api/estimate-requests/${id.request}`)
              .send({
                name: `${MARK}-intrusion`,
                expectedUpdatedAt: estimateRequest.updatedAt.toISOString(),
              }),
        ],
        [
          'PATCH estimate-requests/:id/items',
          (id) =>
            request(app)
              .patch(`/api/estimate-requests/${id.request}/items`)
              .send({ items: [{ itemId: requestItem.id, selected: false }] }),
        ],
        [
          'PATCH estimate-requests/:id/status',
          (id) =>
            request(app)
              .patch(`/api/estimate-requests/${id.request}/status`)
              .send({ status: 'REQUESTED' }),
        ],
        [
          'POST estimate-requests/:id/quotations',
          (id) =>
            request(app)
              .post(`/api/estimate-requests/${id.request}/quotations`)
              .field('name', `${MARK}-intrusion`)
              .field('submittedAt', '2026-10-27T00:00:00.000Z')
              .field(
                'lineItems',
                JSON.stringify([{ name: '項目', sortOrder: 0, quantity: 1, unitPrice: 1 }])
              ),
        ],
        [
          'PUT quotations/:id',
          (id) =>
            request(app)
              .put(`/api/quotations/${id.quotation}`)
              .field('name', `${MARK}-intrusion`)
              .field('expectedUpdatedAt', quotation.updatedAt.toISOString())
              .attach('file', Buffer.from('%PDF-1.4 intrusion'), {
                filename: 'intrusion.pdf',
                contentType: 'application/pdf',
              }),
        ],
        [
          'DELETE quotations/:id',
          (id) =>
            request(app)
              .delete(`/api/quotations/${id.quotation}`)
              .send({ updatedAt: quotation.updatedAt.toISOString() }),
        ],
        [
          'DELETE estimate-requests/:id',
          (id) =>
            request(app)
              .delete(`/api/estimate-requests/${id.request}`)
              .query({ updatedAt: estimateRequest.updatedAt.toISOString() }),
        ],
        // 範囲の判定はクエリの検証より先（判定の順序: 権限 → ID → 案件の範囲 → クエリの検証）。
        // 基準時刻の無い削除も 400 でなく、存在しない ID と同じ 404（2026-10-31 の是正）
        [
          'DELETE estimate-requests/:id（基準時刻なし）',
          (id) => request(app).delete(`/api/estimate-requests/${id.request}`),
        ],
      ];

      for (const [label, call] of writes) {
        const missing = await call({
          project: MISSING_ID,
          request: MISSING_ID,
          quotation: MISSING_ID,
        })
          .set(...auth(outsider))
          .expect(404);
        const outOfScope = await call({
          project: target.projectId,
          request: target.estimateRequestId,
          quotation: target.quotationId,
        })
          .set(...auth(outsider))
          .expect(404);
        expect(outOfScope.body.code, label).toBe('NOT_FOUND');
        expect(withoutInstance(outOfScope.body), label).toEqual(withoutInstance(missing.body));
        expect(JSON.stringify(withoutInstance(outOfScope.body)), label).not.toContain(
          target.projectId
        );
      }

      expect(await snapshot(target)).toEqual(before);
    });

    /**
     * @requirement estimate-request/REQ-42.2
     */
    it('範囲外のアクセスは PROJECT_SCOPE_DENIED として記録される', async () => {
      await request(app)
        .get(`/api/quotations/${target.quotationId}`)
        .set(...auth(outsider))
        .expect(404);

      const denied = await prisma.auditLog.findMany({
        where: { action: 'PROJECT_SCOPE_DENIED', actorId: outsider.id },
      });
      expect(denied.length).toBeGreaterThan(0);
      expect(denied.every((log) => log.targetId === target.projectId)).toBe(true);
    });

    /**
     * @requirement estimate-request/REQ-10.3
     * @requirement estimate-request/REQ-10.4
     */
    it('閲覧範囲内でも権限を持たない利用者には、範囲の判定より先に権限なしの 403 を返す', async () => {
      const paths = [
        `/api/projects/${target.projectId}/estimate-requests`,
        `/api/estimate-requests/${target.estimateRequestId}`,
        `/api/estimate-requests/${MISSING_ID}`,
        `/api/quotations/${target.quotationId}/preview`,
        `/api/estimate-requests/${target.estimateRequestId}/status-history`,
      ];
      for (const path of paths) {
        const response = await request(app)
          .get(path)
          .set(...auth(noPermission))
          .expect(403);
        expect(response.body.code, path).not.toBe('NOT_FOUND');
      }
    });
  });

  describe('作成の要求が指す内訳書と二重マウントの経路（42.2・42.4）', () => {
    /**
     * @requirement estimate-request/REQ-42.4
     * @requirement estimate-request/REQ-42.3
     */
    it('作成の要求が範囲外の案件の内訳書を指すと、存在しない内訳書と同じ 404 になり、見積依頼を作成しない', async () => {
      const beforeTarget = await snapshot(target);
      const beforeOther = await snapshot(other);

      const missingBefore = await deniedCount(sales);
      const missing = await request(app)
        .post(`/api/projects/${target.projectId}/estimate-requests`)
        .set(...auth(sales))
        .send({ name: `${MARK}-cross`, tradingPartnerId, itemizedStatementId: MISSING_ID })
        .expect(404);
      expect((await deniedCount(sales)) - missingBefore, '内訳書の不在は記録しない').toBe(0);
      const foreignBefore = await deniedCount(sales);
      const foreignTargetBefore = await deniedCount(sales, other.projectId);
      const foreign = await request(app)
        .post(`/api/projects/${target.projectId}/estimate-requests`)
        .set(...auth(sales))
        .send({
          name: `${MARK}-cross`,
          tradingPartnerId,
          itemizedStatementId: other.itemizedStatementId,
        })
        .expect(404);
      expect(foreign.body.code).toBe('NOT_FOUND');
      expect(withoutInstance(foreign.body)).toEqual(withoutInstance(missing.body));
      const exposed = JSON.stringify(withoutInstance(foreign.body));
      expect(exposed).not.toContain(other.projectId);
      expect(exposed).not.toContain(other.itemizedStatementId);
      // 範囲外の内訳書は内訳書の案件を対象に 1 件だけ記録する（42.4・42.10）
      expect((await deniedCount(sales)) - foreignBefore, '記録は 1 件だけ増える').toBe(1);
      expect(
        (await deniedCount(sales, other.projectId)) - foreignTargetBefore,
        '記録の対象は内訳書の実際の案件'
      ).toBe(1);

      expect(await snapshot(target)).toEqual(beforeTarget);
      expect(await snapshot(other)).toEqual(beforeOther);
    });

    /**
     * 範囲内の他のプロジェクトの内訳書を指す作成は、存在しない内訳書と同じ 404 で拒否し、
     * 見積依頼を作成せず記録もしない（estimate-request タスク104.1）。全案件閲覧の権限の利用者には
     * target と other の両方が範囲内である。
     *
     * @requirement estimate-request/REQ-42.10
     */
    it('作成の要求が範囲内の他のプロジェクトの内訳書を指すと、存在しない内訳書と同じ 404 になり、見積依頼を作成せず記録もしない', async () => {
      const beforeTarget = await snapshot(target);
      const beforeOther = await snapshot(other);
      const path = `/api/projects/${target.projectId}/estimate-requests`;

      const missing = await request(app)
        .post(path)
        .set(...auth(readAll))
        .send({ name: `${MARK}-sibling-cross`, tradingPartnerId, itemizedStatementId: MISSING_ID })
        .expect(404);
      const deniedBefore = await deniedCount(readAll);
      const sibling = await request(app)
        .post(path)
        .set(...auth(readAll))
        .send({
          name: `${MARK}-sibling-cross`,
          tradingPartnerId,
          itemizedStatementId: other.itemizedStatementId,
        })
        .expect(404);
      expect(sibling.body.code).toBe('NOT_FOUND');
      expect(withoutInstance(sibling.body)).toEqual(withoutInstance(missing.body));
      expect(JSON.stringify(withoutInstance(sibling.body))).not.toContain(
        other.itemizedStatementId
      );
      expect((await deniedCount(readAll)) - deniedBefore, '範囲内の食い違いは記録しない').toBe(0);
      expect(
        await prisma.estimateRequest.count({ where: { name: `${MARK}-sibling-cross` } }),
        '見積依頼を作成しない'
      ).toBe(0);

      expect(await snapshot(target)).toEqual(beforeTarget);
      expect(await snapshot(other)).toEqual(beforeOther);

      // 同じプロジェクトの内訳書を指す作成は従来どおり通る
      const created = await request(app)
        .post(path)
        .set(...auth(readAll))
        .send({
          name: `${MARK}-same-project`,
          tradingPartnerId,
          itemizedStatementId: target.itemizedStatementId,
        })
        .expect(201);
      const stored = await prisma.estimateRequest.findUniqueOrThrow({
        where: { id: created.body.id as string },
        select: { projectId: true, itemizedStatementId: true },
      });
      expect(stored).toEqual({
        projectId: target.projectId,
        itemizedStatementId: target.itemizedStatementId,
      });
    });

    /**
     * @requirement estimate-request/REQ-42.2
     */
    it('二重マウントの経路で、経路の案件と見積依頼の案件が食い違うと見積依頼の不在と同じ 404 にする', async () => {
      const missing = await request(app)
        .get(`/api/projects/${other.projectId}/estimate-requests/${MISSING_ID}`)
        .set(...auth(readAll))
        .expect(404);
      const mismatched = await request(app)
        .get(`/api/projects/${other.projectId}/estimate-requests/${target.estimateRequestId}`)
        .set(...auth(readAll))
        .expect(404);
      expect(mismatched.body.code).toBe('NOT_FOUND');
      expect(withoutInstance(mismatched.body)).toEqual(withoutInstance(missing.body));
    });

    /**
     * 応答は不在と同じ 404 のまま、見積依頼の実際の案件が範囲外なら範囲外の拒否として記録する
     * （estimate-request タスク104.2。user-authentication の要件39.8 の本機能への適用）。
     * 不在の見積依頼と、範囲内の他の案件の見積依頼（経路の誤り）は記録しない。
     *
     * @requirement estimate-request/REQ-42.11
     */
    it('二重マウントの経路で、範囲外の案件の見積依頼を範囲内の案件の経路で指すと、不在と同じ 404 になり、見積依頼の案件を対象に記録が 1 件増え、データを変えない', async () => {
      const beforeTarget = await snapshot(target);
      const beforeOther = await snapshot(other);
      const nested = `/api/projects/${target.projectId}/estimate-requests`;

      // 不在の見積依頼: 404 で記録しない
      const missingBefore = await deniedCount(sales);
      const missing = await request(app)
        .get(`${nested}/${MISSING_ID}`)
        .set(...auth(sales))
        .expect(404);
      expect((await deniedCount(sales)) - missingBefore, '不在の見積依頼は記録しない').toBe(0);

      // 範囲内の他の案件の見積依頼（経路の誤り。全案件閲覧の権限の利用者には other も範囲内）: 記録しない
      const misroutedBefore = await deniedCount(readAll);
      const misrouted = await request(app)
        .get(`${nested}/${other.estimateRequestId}`)
        .set(...auth(readAll))
        .expect(404);
      expect(withoutInstance(misrouted.body)).toEqual(withoutInstance(missing.body));
      expect((await deniedCount(readAll)) - misroutedBefore, '範囲内の食い違いは記録しない').toBe(
        0
      );

      // 範囲外の案件の見積依頼を、範囲内の案件の経路で読む・削除する: 要求ごとに 1 件、見積依頼の案件を対象に記録する
      const calls: Array<[string, () => request.Test]> = [
        ['GET', () => request(app).get(`${nested}/${other.estimateRequestId}`)],
        ['DELETE', () => request(app).delete(`${nested}/${other.estimateRequestId}`)],
      ];
      for (const [label, call] of calls) {
        const allBefore = await deniedCount(sales);
        const foreignBefore = await deniedCount(sales, other.projectId);
        const response = await call()
          .set(...auth(sales))
          .expect(404);
        expect(response.body.code, label).toBe('NOT_FOUND');
        expect(withoutInstance(response.body), `${label}: 見積依頼の不在と同じ本文`).toEqual(
          withoutInstance(missing.body)
        );
        expect(JSON.stringify(withoutInstance(response.body)), label).not.toContain(
          other.projectId
        );
        expect((await deniedCount(sales)) - allBefore, `${label}: 記録は 1 件だけ増える`).toBe(1);
        expect(
          (await deniedCount(sales, other.projectId)) - foreignBefore,
          `${label}: 記録の対象は見積依頼の実際の案件`
        ).toBe(1);
      }

      expect(await snapshot(target)).toEqual(beforeTarget);
      expect(await snapshot(other)).toEqual(beforeOther);
    });

    /**
     * 見積依頼の論理削除は区別しない（design.md の 42.11 の決定）。範囲外の案件の論理削除済みの
     * 見積依頼を範囲内の案件の経路で指しても、不在と同じ 404 で見積依頼の案件を対象に記録する。
     *
     * @requirement estimate-request/REQ-42.11
     */
    it('二重マウントの経路で、範囲外の案件の論理削除済みの見積依頼を範囲内の案件の経路で指しても、不在と同じ 404 になり、見積依頼の案件を対象に記録が 1 件増え、データを変えない', async () => {
      const deletedRequestId = await createEstimateRequest(
        other.projectId,
        other.itemizedStatementId,
        `${MARK}-deleted-foreign-request`
      );
      await prisma.estimateRequest.update({
        where: { id: deletedRequestId },
        data: { deletedAt: new Date() },
      });
      const beforeTarget = await snapshot(target);
      const beforeOther = await snapshot(other);
      const nested = `/api/projects/${target.projectId}/estimate-requests`;

      const missing = await request(app)
        .get(`${nested}/${MISSING_ID}`)
        .set(...auth(sales))
        .expect(404);

      const allBefore = await deniedCount(sales);
      const foreignBefore = await deniedCount(sales, other.projectId);
      const response = await request(app)
        .get(`${nested}/${deletedRequestId}`)
        .set(...auth(sales))
        .expect(404);
      expect(response.body.code).toBe('NOT_FOUND');
      expect(withoutInstance(response.body), '見積依頼の不在と同じ本文').toEqual(
        withoutInstance(missing.body)
      );
      expect((await deniedCount(sales)) - allBefore, '記録は 1 件だけ増える').toBe(1);
      expect(
        (await deniedCount(sales, other.projectId)) - foreignBefore,
        '記録の対象は見積依頼の実際の案件'
      ).toBe(1);

      expect(await snapshot(target)).toEqual(beforeTarget);
      expect(await snapshot(other)).toEqual(beforeOther);
    });
  });

  describe('見積依頼の配下の受領見積書の経路の食い違い（42.12）', () => {
    /** 受領見積書を DB で作る（ファイルの実体は置かない） */
    async function createQuotation(
      estimateRequestId: string,
      label: string,
      deletedAt: Date | null = null
    ): Promise<{ id: string; updatedAt: Date }> {
      return prisma.receivedQuotation.create({
        data: {
          estimateRequestId,
          name: `${MARK}-${label}-quotation`,
          submittedAt: new Date('2026-10-01'),
          filePath: `quotations/${estimateRequestId}/${label}.pdf`,
          fileName: `${label}.pdf`,
          fileMimeType: 'application/pdf',
          fileSize: 1024,
          deletedAt,
        },
        select: { id: true, updatedAt: true },
      });
    }

    type QuotationCall = (base: string, quotation: { id: string; updatedAt: Date }) => request.Test;
    /** 見積依頼の配下の /:quotationId の四つの経路（詳細の取得・更新・論理的な取り除き・プレビュー） */
    const nestedCalls: Array<[string, QuotationCall]> = [
      ['GET', (base, q) => request(app).get(`${base}/${q.id}`)],
      [
        'PUT',
        (base, q) =>
          request(app)
            .put(`${base}/${q.id}`)
            .field('name', `${MARK}-misrouted`)
            .field('expectedUpdatedAt', q.updatedAt.toISOString())
            .attach('file', Buffer.from('%PDF-1.4 misrouted'), {
              filename: 'misrouted.pdf',
              contentType: 'application/pdf',
            }),
      ],
      [
        'DELETE',
        (base, q) =>
          request(app).delete(`${base}/${q.id}`).send({ updatedAt: q.updatedAt.toISOString() }),
      ],
      ['GET preview', (base, q) => request(app).get(`${base}/${q.id}/preview`)],
    ];

    /**
     * 経路で指定した見積依頼に属さない受領見積書は、範囲内なら記録なしの、範囲外なら受領見積書の
     * 案件を対象に記録 1 件の、いずれも不在と同じ汎用の 404 になる（タスク106.1。user-authentication の
     * 要件39.8 とその 2026-10-30 の改訂〔論理削除済みの対象も実際の案件で記録する〕の本機能への適用）
     *
     * @requirement estimate-request/REQ-42.12
     * @requirement user-authentication/REQ-39.8
     */
    it('見積依頼の配下の経路で、同じ案件の別の見積依頼の受領見積書を指すと不在と同じ 404 になり、データとストレージを変えず記録もしない', async () => {
      const siblingQuotation = await createQuotation(siblingRequestId, 'sibling');
      const base = `/api/estimate-requests/${target.estimateRequestId}/quotations`;
      const beforeTarget = await snapshot(target);
      const beforeFiles = storedQuotationFiles([target.estimateRequestId, siblingRequestId]);

      for (const [label, call] of nestedCalls) {
        const missing = await call(base, { id: MISSING_ID, updatedAt: siblingQuotation.updatedAt })
          .set(...auth(sales))
          .expect(404);
        const recordsBefore = await deniedCount(sales);
        const misrouted = await call(base, siblingQuotation)
          .set(...auth(sales))
          .expect(404);
        expect(misrouted.body.code, label).toBe('NOT_FOUND');
        expect(withoutInstance(misrouted.body), `${label}: 受領見積書の不在と同じ本文`).toEqual(
          withoutInstance(missing.body)
        );
        const exposed = JSON.stringify(withoutInstance(misrouted.body));
        expect(exposed, label).not.toContain(siblingQuotation.id);
        expect(exposed, label).not.toContain(target.projectId);
        expect(misrouted.body.url, `${label}: 署名付きURLを返さない`).toBeUndefined();
        expect((await deniedCount(sales)) - recordsBefore, `${label}: 範囲内は記録しない`).toBe(0);
      }

      // 存在しない見積依頼の ID を経路に置いても、受領見積書はそれに属さないので同じ 404（記録しない）
      const recordsBefore = await deniedCount(sales);
      const missingRequest = await request(app)
        .get(`/api/estimate-requests/${MISSING_ID}/quotations/${target.quotationId}`)
        .set(...auth(sales))
        .expect(404);
      expect(missingRequest.body.code).toBe('NOT_FOUND');
      expect((await deniedCount(sales)) - recordsBefore).toBe(0);

      expect(await snapshot(target)).toEqual(beforeTarget);
      expect(storedQuotationFiles([target.estimateRequestId, siblingRequestId])).toEqual(
        beforeFiles
      );
    });

    /**
     * @requirement estimate-request/REQ-42.12
     * @requirement user-authentication/REQ-39.8
     */
    it('見積依頼の配下の経路で、範囲外の案件の受領見積書（論理削除済みを含む）を指すと不在と同じ 404 になり、受領見積書の案件を対象に記録が 1 件増え、データとストレージを変えない', async () => {
      const deletedForeign = await createQuotation(
        other.estimateRequestId,
        'deleted-foreign',
        new Date()
      );
      const otherQuotation = await prisma.receivedQuotation.findUniqueOrThrow({
        where: { id: other.quotationId },
        select: { id: true, updatedAt: true },
      });
      const base = `/api/estimate-requests/${target.estimateRequestId}/quotations`;
      const beforeTarget = await snapshot(target);
      const beforeOther = await snapshot(other);
      const beforeFiles = storedQuotationFiles([target.estimateRequestId, other.estimateRequestId]);

      for (const [label, call] of nestedCalls) {
        for (const [kind, quotation] of [
          ['範囲外', otherQuotation],
          ['範囲外の論理削除済み', deletedForeign],
        ] as const) {
          const missing = await call(base, { id: MISSING_ID, updatedAt: quotation.updatedAt })
            .set(...auth(sales))
            .expect(404);
          const allBefore = await deniedCount(sales);
          const foreignBefore = await deniedCount(sales, other.projectId);
          const response = await call(base, quotation)
            .set(...auth(sales))
            .expect(404);
          const name = `${label} ${kind}`;
          expect(response.body.code, name).toBe('NOT_FOUND');
          expect(withoutInstance(response.body), `${name}: 受領見積書の不在と同じ本文`).toEqual(
            withoutInstance(missing.body)
          );
          expect(JSON.stringify(withoutInstance(response.body)), name).not.toContain(
            other.projectId
          );
          expect(response.body.url, `${name}: 署名付きURLを返さない`).toBeUndefined();
          expect((await deniedCount(sales)) - allBefore, `${name}: 記録は 1 件だけ増える`).toBe(1);
          expect(
            (await deniedCount(sales, other.projectId)) - foreignBefore,
            `${name}: 記録の対象は受領見積書の実際の案件`
          ).toBe(1);
        }
      }

      expect(await snapshot(target)).toEqual(beforeTarget);
      expect(await snapshot(other)).toEqual(beforeOther);
      expect(storedQuotationFiles([target.estimateRequestId, other.estimateRequestId])).toEqual(
        beforeFiles
      );
    });

    /**
     * @requirement estimate-request/REQ-42.12
     */
    it('見積依頼の配下の経路で属する受領見積書と、/api/quotations の経路は従来どおり通る', async () => {
      const base = `/api/estimate-requests/${target.estimateRequestId}/quotations`;
      const detail = await request(app)
        .get(`${base}/${target.quotationId}`)
        .set(...auth(sales))
        .expect(200);
      expect(detail.body.id).toBe(target.quotationId);
      const preview = await request(app)
        .get(`${base}/${target.quotationId}/preview`)
        .set(...auth(sales))
        .expect(200);
      expect(preview.body.url, '受領見積書のファイルの署名付きURL').toBeTruthy();

      const own = await createQuotation(target.estimateRequestId, 'own');
      const updated = await request(app)
        .put(`${base}/${own.id}`)
        .set(...auth(sales))
        .field('name', `${MARK}-own-renamed`)
        .field('expectedUpdatedAt', own.updatedAt.toISOString())
        .expect(200);
      expect(updated.body.name).toBe(`${MARK}-own-renamed`);
      await request(app)
        .delete(`${base}/${own.id}`)
        .set(...auth(sales))
        .send({ updatedAt: updated.body.updatedAt })
        .expect(204);
      const removed = await prisma.receivedQuotation.findUniqueOrThrow({ where: { id: own.id } });
      expect(removed.deletedAt).not.toBeNull();

      // 見積依頼の ID を持たない経路は、範囲内の別の見積依頼の受領見積書もそのまま読める
      const siblingQuotation = await createQuotation(siblingRequestId, 'sibling-flat');
      const flat = await request(app)
        .get(`/api/quotations/${siblingQuotation.id}`)
        .set(...auth(sales))
        .expect(200);
      expect(flat.body.id).toBe(siblingQuotation.id);
      await request(app)
        .get(`/api/quotations/${siblingQuotation.id}/preview`)
        .set(...auth(sales))
        .expect(200);
    });
  });
});
