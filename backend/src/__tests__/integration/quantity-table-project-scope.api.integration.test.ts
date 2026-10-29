/**
 * @fileoverview 数量表・数量グループ・数量項目・オートコンプリート候補の API への案件の閲覧範囲の適用の統合検証
 * （quantity-table-generation タスク104.1）
 *
 * 本物のアプリ（app.ts のルート・authenticate・requirePermission・requireProjectScope・共有の
 * ProjectScopeService と RBACService）と、テスト用の実データベース・実ストレージ（STORAGE_TYPE=local）を通す。
 *
 * 被覆する受入基準（quantity-table-generation の Requirement 50）は各 it の `@requirement` の印が名乗る。
 *
 * 利用者（いずれもテストで作るロール。ロール名は admin ではない）:
 * - MEMBER: 数量表の閲覧・作成・編集・削除の権限だけを持ち、全案件閲覧の権限を持たない
 * - READ_ALL: MEMBER の権限に全案件閲覧の権限（project:read_all）を加えたもの
 * - 案件 target の営業担当者・工事担当者・作成者（関係者）、担当外の利用者、全案件閲覧の利用者、権限なしの利用者
 * - 案件 other の営業担当者・作成者は担当外の利用者（target の関係者には範囲外）
 * - 案件 sibling は target と同じ関係者を持つ別の案件（target の関係者には範囲内の別のプロジェクト）
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

const MARK = 'test-qt104-scope';
const MEMBER_ROLE = `${MARK}-member`;
const READ_ALL_ROLE = `${MARK}-read-all`;
const NO_PERMISSION_ROLE = `${MARK}-no-permission`;
/** 版 4・変種 8 の整った UUID（ID の形式の検査を通り、どの行としても存在しない） */
const MISSING_ID = '00000000-0000-4000-8000-000000104100';
/** 2 つ目の存在しない ID（一括の要求で使う） */
const MISSING_ID_2 = '00000000-0000-4000-8000-000000104101';

interface TestUser {
  id: string;
  token: string;
}

interface Fixture {
  projectId: string;
  surveyId: string;
  surveyImageId: string;
  quantityTableId: string;
  /** 現調画像を紐付けた数量グループ */
  groupId: string;
  /** 2 つ目の数量グループ（移動の移し先） */
  secondGroupId: string;
  itemId: string;
  secondItemId: string;
}

describe('数量表・数量グループ・数量項目・候補の API の閲覧範囲（統合・実 DB）', () => {
  let prisma: PrismaClient;
  let sales: TestUser;
  let construction: TestUser;
  let creator: TestUser;
  let outsider: TestUser;
  let readAll: TestUser;
  let noPermission: TestUser;
  let target: Fixture;
  let other: Fixture;
  let sibling: Fixture;

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
    const tables = await prisma.quantityTable.findMany({
      where: { projectId: { in: projectIds } },
      select: { id: true },
    });
    const tableIds = tables.map((t) => t.id);
    await deleteAuditLogsWithArchivePermission(prisma, {
      OR: [
        { actorId: { in: userIds } },
        { targetId: { in: userIds } },
        { targetId: { in: projectIds } },
        { targetId: { in: tableIds } },
      ],
    });
    // 数量表・数量グループ・数量項目・現場調査・現調画像は案件の削除に連なって消える
    await prisma.projectStatusHistory.deleteMany({ where: { projectId: { in: projectIds } } });
    await prisma.project.deleteMany({ where: { id: { in: projectIds } } });
    await prisma.userRole.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    const roleNames = [MEMBER_ROLE, READ_ALL_ROLE, NO_PERMISSION_ROLE];
    await prisma.rolePermission.deleteMany({ where: { role: { name: { in: roleNames } } } });
    await prisma.role.deleteMany({ where: { name: { in: roleNames } } });
  }

  async function createRole(name: string, permissions: Array<[string, string]>): Promise<void> {
    const role = await prisma.role.create({
      data: { name, description: 'quantity-table-generation タスク104 の検証用' },
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

  async function createSurveyImage(projectId: string, label: string): Promise<[string, string]> {
    const survey = await prisma.siteSurvey.create({
      data: { projectId, name: `${MARK}-${label}-survey`, surveyDate: new Date('2026-10-01') },
      select: { id: true },
    });
    const image = await prisma.surveyImage.create({
      data: {
        surveyId: survey.id,
        originalPath: `surveys/${survey.id}/${label}.jpg`,
        thumbnailPath: `surveys/${survey.id}/${label}-thumb.jpg`,
        fileName: `${label}.jpg`,
        fileSize: 1024,
        width: 800,
        height: 600,
        displayOrder: 0,
      },
      select: { id: true },
    });
    return [survey.id, image.id];
  }

  async function createItem(groupId: string, name: string, displayOrder: number): Promise<string> {
    const item = await prisma.quantityItem.create({
      data: {
        quantityGroupId: groupId,
        majorCategory: '土工事',
        workType: '掘削',
        name,
        unit: 'm3',
        quantity: 1,
        displayOrder,
      },
      select: { id: true },
    });
    return item.id;
  }

  async function createFixture(
    label: string,
    people: { salesPersonId: string; constructionPersonId?: string; createdById: string }
  ): Promise<Fixture> {
    const project = await prisma.project.create({
      data: { name: `${MARK}-${label}`, ...people },
      select: { id: true },
    });
    const [surveyId, surveyImageId] = await createSurveyImage(project.id, label);
    const table = await prisma.quantityTable.create({
      data: { projectId: project.id, name: `${MARK}-${label}-qt` },
      select: { id: true },
    });
    const group = await prisma.quantityGroup.create({
      data: {
        quantityTableId: table.id,
        name: `${label}-group`,
        surveyImageId,
        displayOrder: 0,
      },
      select: { id: true },
    });
    const secondGroup = await prisma.quantityGroup.create({
      data: { quantityTableId: table.id, name: `${label}-group-2`, displayOrder: 1 },
      select: { id: true },
    });
    const itemId = await createItem(group.id, `${MARK}-${label}-item`, 0);
    const secondItemId = await createItem(group.id, `${MARK}-${label}-item-2`, 1);
    return {
      projectId: project.id,
      surveyId,
      surveyImageId,
      quantityTableId: table.id,
      groupId: group.id,
      secondGroupId: secondGroup.id,
      itemId,
      secondItemId,
    };
  }

  /** 案件の数量表まわりのデータの状態（範囲外の要求の前後で変わらないことを比べる） */
  async function snapshot(fixture: Fixture): Promise<unknown> {
    return {
      tables: await prisma.quantityTable.findMany({
        where: { projectId: fixture.projectId },
        select: { id: true, name: true, deletedAt: true, updatedAt: true },
        orderBy: { id: 'asc' },
      }),
      groups: await prisma.quantityGroup.findMany({
        where: { quantityTable: { projectId: fixture.projectId } },
        select: {
          id: true,
          name: true,
          surveyImageId: true,
          displayOrder: true,
          updatedAt: true,
        },
        orderBy: { id: 'asc' },
      }),
      items: await prisma.quantityItem.findMany({
        where: { quantityGroup: { quantityTable: { projectId: fixture.projectId } } },
        select: {
          id: true,
          quantityGroupId: true,
          name: true,
          displayOrder: true,
          updatedAt: true,
        },
        orderBy: { id: 'asc' },
      }),
    };
  }

  async function updatedAtOf(model: 'table' | 'group' | 'item', id: string): Promise<string> {
    if (model === 'table') {
      const row = await prisma.quantityTable.findUniqueOrThrow({ where: { id } });
      return row.updatedAt.toISOString();
    }
    if (model === 'group') {
      const row = await prisma.quantityGroup.findUniqueOrThrow({ where: { id } });
      return row.updatedAt.toISOString();
    }
    const row = await prisma.quantityItem.findUniqueOrThrow({ where: { id } });
    return row.updatedAt.toISOString();
  }

  const itemBody = {
    majorCategory: '土工事',
    workType: '掘削',
    name: `${MARK}-new-item`,
    unit: 'm3',
    quantity: 1,
    calculationMethod: 'STANDARD',
    adjustmentFactor: 1.0,
    roundingUnit: 0.01,
  };

  beforeAll(async () => {
    prisma = getPrismaClient();
    await cleanup();
    await seedRoles(prisma);
    await seedPermissions(prisma);
    await seedRolePermissions(prisma);

    const memberPermissions: Array<[string, string]> = [
      ['quantity_table', 'create'],
      ['quantity_table', 'read'],
      ['quantity_table', 'update'],
      ['quantity_table', 'delete'],
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

    const targetPeople = {
      salesPersonId: sales.id,
      constructionPersonId: construction.id,
      createdById: creator.id,
    };
    target = await createFixture('target', targetPeople);
    sibling = await createFixture('sibling', targetPeople);
    other = await createFixture('other', { salesPersonId: outsider.id, createdById: outsider.id });
  });

  afterAll(async () => {
    await cleanup();
  });

  describe('範囲内の利用者（50.1・50.6・50.7）', () => {
    /**
     * @requirement quantity-table-generation/REQ-50.1
     * @requirement quantity-table-generation/REQ-50.6
     * @requirement quantity-table-generation/REQ-50.7
     */
    it('営業担当者・工事担当者・作成者・全案件閲覧の権限の利用者は、一覧・直近・詳細・グループ・項目・候補を得られ、紐付けた写真の署名付きURLが発行される', async () => {
      for (const user of [sales, construction, creator, readAll]) {
        const list = await request(app)
          .get(`/api/projects/${target.projectId}/quantity-tables`)
          .set(...auth(user))
          .expect(200);
        expect(list.body.data.map((t: { id: string }) => t.id)).toContain(target.quantityTableId);

        const summary = await request(app)
          .get(`/api/projects/${target.projectId}/quantity-tables/summary`)
          .set(...auth(user))
          .expect(200);
        expect(summary.body.totalCount).toBeGreaterThanOrEqual(1);

        const detail = await request(app)
          .get(`/api/quantity-tables/${target.quantityTableId}`)
          .set(...auth(user))
          .expect(200);
        const linked = detail.body.groups.find((g: { id: string }) => g.id === target.groupId);
        expect(linked.surveyImageId).toBe(target.surveyImageId);
        // 署名付きURL（/api/storage/ の内部パスでない URL）が発行される
        expect(linked.surveyImage.thumbnailUrl, '紐付けた写真のサムネイルの URL').toBeTruthy();
        expect(linked.surveyImage.originalUrl, '紐付けた写真の原本の URL').toBeTruthy();

        // 二重マウントでも、経路の案件と数量表の案件が一致すれば従来どおり
        await request(app)
          .get(`/api/projects/${target.projectId}/quantity-tables/${target.quantityTableId}`)
          .set(...auth(user))
          .expect(200);

        const groups = await request(app)
          .get(`/api/quantity-tables/${target.quantityTableId}/groups`)
          .set(...auth(user))
          .expect(200);
        expect(groups.body.map((g: { id: string }) => g.id)).toContain(target.groupId);

        await request(app)
          .get(`/api/quantity-groups/${target.groupId}`)
          .set(...auth(user))
          .expect(200);
        await request(app)
          .get(`/api/quantity-tables/${target.quantityTableId}/groups/${target.groupId}`)
          .set(...auth(user))
          .expect(200);

        const items = await request(app)
          .get(`/api/quantity-groups/${target.groupId}/items`)
          .set(...auth(user))
          .expect(200);
        expect(items.body.map((i: { id: string }) => i.id)).toContain(target.itemId);

        await request(app)
          .get(`/api/quantity-items/${target.itemId}`)
          .set(...auth(user))
          .expect(200);
        await request(app)
          .get(`/api/quantity-groups/${target.groupId}/items/${target.itemId}`)
          .set(...auth(user))
          .expect(200);

        const candidates = await request(app)
          .get(`/api/projects/${target.projectId}/quantity-items/autocomplete-candidates`)
          .set(...auth(user))
          .expect(200);
        expect(candidates.body.candidates.name).toContain(`${MARK}-target-item`);
        // 候補は経路の案件だけから引く（範囲外の案件の値を含めない）
        expect(candidates.body.candidates.name).not.toContain(`${MARK}-other-item`);
      }
    });

    /**
     * @requirement quantity-table-generation/REQ-50.1
     * @requirement quantity-table-generation/REQ-50.5
     */
    it('関係者と全案件閲覧の権限の利用者は、数量表・数量グループ・数量項目の作成・更新・保存・コピー・移動・一括の操作・削除を行える', async () => {
      for (const user of [construction, readAll]) {
        const created = await request(app)
          .post(`/api/projects/${target.projectId}/quantity-tables`)
          .set(...auth(user))
          .send({ name: `${MARK}-created` })
          .expect(201);
        const tableId = created.body.id as string;

        await request(app)
          .put(`/api/quantity-tables/${tableId}`)
          .set(...auth(user))
          .send({ name: `${MARK}-renamed`, expectedUpdatedAt: await updatedAtOf('table', tableId) })
          .expect(200);

        const group = await request(app)
          .post(`/api/quantity-tables/${tableId}/groups`)
          .set(...auth(user))
          .send({ name: 'g1', surveyImageId: target.surveyImageId })
          .expect(201);
        const groupId = group.body.id as string;
        const group2 = await request(app)
          .post(`/api/quantity-tables/${tableId}/groups`)
          .set(...auth(user))
          .send({ name: 'g2' })
          .expect(201);
        const group2Id = group2.body.id as string;

        await request(app)
          .put(`/api/quantity-groups/${group2Id}`)
          .set(...auth(user))
          .send({
            name: 'g2-renamed',
            surveyImageId: target.surveyImageId,
            expectedUpdatedAt: await updatedAtOf('group', group2Id),
          })
          .expect(200);

        await request(app)
          .put(`/api/quantity-tables/${tableId}/groups/order`)
          .set(...auth(user))
          .send({
            orderUpdates: [
              { id: groupId, displayOrder: 5 },
              { id: group2Id, displayOrder: 4 },
            ],
          })
          .expect(204);

        const item = await request(app)
          .post(`/api/quantity-groups/${groupId}/items`)
          .set(...auth(user))
          .send(itemBody)
          .expect(201);
        const itemId = item.body.id as string;
        const item2 = await request(app)
          .post(`/api/quantity-groups/${groupId}/items`)
          .set(...auth(user))
          .send(itemBody)
          .expect(201);
        const item2Id = item2.body.id as string;

        await request(app)
          .put(`/api/quantity-items/${itemId}`)
          .set(...auth(user))
          .send({ name: `${MARK}-updated`, expectedUpdatedAt: await updatedAtOf('item', itemId) })
          .expect(200);

        await request(app)
          .put(`/api/quantity-groups/${groupId}/items/order`)
          .set(...auth(user))
          .send({
            orderUpdates: [
              { id: itemId, displayOrder: 7 },
              { id: item2Id, displayOrder: 6 },
            ],
          })
          .expect(204);

        await request(app)
          .post(`/api/quantity-items/${itemId}/copy`)
          .set(...auth(user))
          .expect(201);
        await request(app)
          .post(`/api/quantity-items/${itemId}/move`)
          .set(...auth(user))
          .send({ targetGroupId: group2Id, displayOrder: 10 })
          .expect(200);
        await request(app)
          .post('/api/quantity-items/bulk-copy')
          .set(...auth(user))
          .send({ itemIds: [itemId, item2Id] })
          .expect(201);
        await request(app)
          .post('/api/quantity-items/bulk-move')
          .set(...auth(user))
          .send({ itemIds: [item2Id], targetGroupId: group2Id })
          .expect(204);

        await request(app)
          .post(`/api/quantity-groups/${groupId}/copy`)
          .set(...auth(user))
          .expect(201);
        const fromSurvey = await request(app)
          .post(`/api/quantity-tables/${tableId}/groups/from-survey`)
          .set(...auth(user))
          .send({ siteSurveyId: target.surveyId })
          .expect(201);
        expect(fromSurvey.body.created).toBe(1);

        await request(app)
          .delete(`/api/quantity-items/${itemId}`)
          .set(...auth(user))
          .expect(204);
        await request(app)
          .delete(`/api/quantity-groups/${group2Id}`)
          .set(...auth(user))
          .expect(204);

        // 保存は送らなかった既存のグループ・項目を消す（フル状態同期）
        const saved = await request(app)
          .put(`/api/quantity-tables/${tableId}/save`)
          .set(...auth(user))
          .send({
            expectedUpdatedAt: await updatedAtOf('table', tableId),
            name: `${MARK}-saved`,
            groups: [
              {
                id: null,
                name: 'saved-group',
                surveyImageId: target.surveyImageId,
                displayOrder: 0,
                items: [],
              },
            ],
          })
          .expect(200);
        expect(saved.body.groups[0].surveyImage.thumbnailUrl).toBeTruthy();

        await request(app)
          .post(`/api/quantity-tables/${tableId}/copy`)
          .set(...auth(user))
          .send({ name: `${MARK}-copied` })
          .expect(201);

        await request(app)
          .delete(`/api/quantity-tables/${tableId}`)
          .set(...auth(user))
          .expect(204);
      }
    });

    /**
     * @requirement quantity-table-generation/REQ-50.7
     */
    it('他のプロジェクトの画像への既存の紐付けには、範囲内の数量表の詳細でも署名付きURLを発行しない', async () => {
      // 範囲外の案件 other の画像を指す紐付けを DB に直接作る（判定の導入前に作られた紐付けを想定）
      const legacy = await prisma.quantityGroup.create({
        data: {
          quantityTableId: target.quantityTableId,
          name: 'legacy-foreign-link',
          surveyImageId: other.surveyImageId,
          displayOrder: 50,
        },
        select: { id: true },
      });
      try {
        for (const user of [sales, readAll]) {
          const detail = await request(app)
            .get(`/api/quantity-tables/${target.quantityTableId}`)
            .set(...auth(user))
            .expect(200);
          const group = detail.body.groups.find((g: { id: string }) => g.id === legacy.id);
          expect(group.surveyImage).toBeNull();
          expect(group.surveyImageId).toBeNull();
          expect(JSON.stringify(detail.body)).not.toContain(other.surveyImageId);
          expect(JSON.stringify(detail.body)).not.toContain(other.surveyId);
        }
      } finally {
        await prisma.quantityGroup.delete({ where: { id: legacy.id } });
      }
    });
  });

  describe('範囲外の ID 指定（50.2・50.3・50.6・50.7）', () => {
    /**
     * @requirement quantity-table-generation/REQ-50.2
     * @requirement quantity-table-generation/REQ-50.3
     * @requirement quantity-table-generation/REQ-50.6
     * @requirement quantity-table-generation/REQ-50.7
     */
    it('担当外の利用者の読み取りは、存在しない ID と同じ 404 の本文になり、署名付きURLも案件 ID も返らない', async () => {
      const readPaths: Array<[string, string]> = [
        [
          `/api/projects/${target.projectId}/quantity-tables`,
          `/api/projects/${MISSING_ID}/quantity-tables`,
        ],
        [
          `/api/projects/${target.projectId}/quantity-tables/summary`,
          `/api/projects/${MISSING_ID}/quantity-tables/summary`,
        ],
        [`/api/quantity-tables/${target.quantityTableId}`, `/api/quantity-tables/${MISSING_ID}`],
        [
          `/api/projects/${target.projectId}/quantity-tables/${target.quantityTableId}`,
          `/api/projects/${target.projectId}/quantity-tables/${MISSING_ID}`,
        ],
        [
          `/api/quantity-tables/${target.quantityTableId}/groups`,
          `/api/quantity-tables/${MISSING_ID}/groups`,
        ],
        [`/api/quantity-groups/${target.groupId}`, `/api/quantity-groups/${MISSING_ID}`],
        [
          `/api/quantity-groups/${target.groupId}/items`,
          `/api/quantity-groups/${MISSING_ID}/items`,
        ],
        [`/api/quantity-items/${target.itemId}`, `/api/quantity-items/${MISSING_ID}`],
        [
          `/api/projects/${target.projectId}/quantity-items/autocomplete-candidates`,
          `/api/projects/${MISSING_ID}/quantity-items/autocomplete-candidates`,
        ],
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
        for (const id of [
          target.projectId,
          target.quantityTableId,
          target.groupId,
          target.itemId,
          target.surveyImageId,
        ]) {
          expect(exposed, outOfScopePath).not.toContain(id);
        }
        expect(exposed, outOfScopePath).not.toContain('Url');
      }
    });

    /**
     * @requirement quantity-table-generation/REQ-50.2
     * @requirement quantity-table-generation/REQ-50.3
     * @requirement quantity-table-generation/REQ-50.7
     */
    it('担当外の利用者の作成・更新・保存・コピー・移動・削除は、存在しない ID と同じ 404 の本文になり、データベースを変えない', async () => {
      const before = await snapshot(target);
      const tableUpdatedAt = await updatedAtOf('table', target.quantityTableId);
      const groupUpdatedAt = await updatedAtOf('group', target.groupId);
      const itemUpdatedAt = await updatedAtOf('item', target.itemId);

      type Write = {
        method: 'post' | 'put' | 'delete';
        outOfScope: string;
        missing: string;
        body?: Record<string, unknown>;
        missingBody?: Record<string, unknown>;
      };
      const writes: Write[] = [
        {
          method: 'post',
          outOfScope: `/api/projects/${target.projectId}/quantity-tables`,
          missing: `/api/projects/${MISSING_ID}/quantity-tables`,
          body: { name: `${MARK}-intruder` },
        },
        {
          method: 'put',
          outOfScope: `/api/quantity-tables/${target.quantityTableId}`,
          missing: `/api/quantity-tables/${MISSING_ID}`,
          body: { name: `${MARK}-intruder`, expectedUpdatedAt: tableUpdatedAt },
        },
        {
          method: 'put',
          outOfScope: `/api/quantity-tables/${target.quantityTableId}/save`,
          missing: `/api/quantity-tables/${MISSING_ID}/save`,
          body: { expectedUpdatedAt: tableUpdatedAt, name: `${MARK}-intruder`, groups: [] },
        },
        {
          method: 'post',
          outOfScope: `/api/quantity-tables/${target.quantityTableId}/copy`,
          missing: `/api/quantity-tables/${MISSING_ID}/copy`,
          body: { name: `${MARK}-intruder` },
        },
        {
          method: 'post',
          outOfScope: `/api/quantity-tables/${target.quantityTableId}/groups`,
          missing: `/api/quantity-tables/${MISSING_ID}/groups`,
          body: { name: 'intruder' },
        },
        {
          method: 'put',
          outOfScope: `/api/quantity-tables/${target.quantityTableId}/groups/order`,
          missing: `/api/quantity-tables/${MISSING_ID}/groups/order`,
          body: { orderUpdates: [{ id: target.groupId, displayOrder: 9 }] },
        },
        {
          method: 'post',
          outOfScope: `/api/quantity-tables/${target.quantityTableId}/groups/from-survey`,
          missing: `/api/quantity-tables/${MISSING_ID}/groups/from-survey`,
          body: { siteSurveyId: other.surveyId },
        },
        {
          method: 'put',
          outOfScope: `/api/quantity-groups/${target.groupId}`,
          missing: `/api/quantity-groups/${MISSING_ID}`,
          body: { name: 'intruder', expectedUpdatedAt: groupUpdatedAt },
        },
        {
          method: 'post',
          outOfScope: `/api/quantity-groups/${target.groupId}/copy`,
          missing: `/api/quantity-groups/${MISSING_ID}/copy`,
        },
        {
          method: 'post',
          outOfScope: `/api/quantity-groups/${target.groupId}/items`,
          missing: `/api/quantity-groups/${MISSING_ID}/items`,
          body: itemBody,
        },
        {
          method: 'put',
          outOfScope: `/api/quantity-groups/${target.groupId}/items/order`,
          missing: `/api/quantity-groups/${MISSING_ID}/items/order`,
          body: { orderUpdates: [{ id: target.itemId, displayOrder: 9 }] },
        },
        {
          method: 'put',
          outOfScope: `/api/quantity-items/${target.itemId}`,
          missing: `/api/quantity-items/${MISSING_ID}`,
          body: { name: 'intruder', expectedUpdatedAt: itemUpdatedAt },
        },
        {
          method: 'post',
          outOfScope: `/api/quantity-items/${target.itemId}/copy`,
          missing: `/api/quantity-items/${MISSING_ID}/copy`,
        },
        {
          method: 'post',
          outOfScope: `/api/quantity-items/${target.itemId}/move`,
          missing: `/api/quantity-items/${MISSING_ID}/move`,
          body: { targetGroupId: target.secondGroupId, displayOrder: 9 },
        },
        {
          method: 'post',
          outOfScope: '/api/quantity-items/bulk-copy',
          missing: '/api/quantity-items/bulk-copy',
          body: { itemIds: [target.itemId] },
          missingBody: { itemIds: [MISSING_ID] },
        },
        {
          method: 'post',
          outOfScope: '/api/quantity-items/bulk-move',
          missing: '/api/quantity-items/bulk-move',
          body: { itemIds: [target.itemId], targetGroupId: target.secondGroupId },
          missingBody: { itemIds: [MISSING_ID], targetGroupId: MISSING_ID_2 },
        },
        {
          method: 'delete',
          outOfScope: `/api/quantity-items/${target.secondItemId}`,
          missing: `/api/quantity-items/${MISSING_ID}`,
        },
        {
          method: 'delete',
          outOfScope: `/api/quantity-groups/${target.secondGroupId}`,
          missing: `/api/quantity-groups/${MISSING_ID}`,
        },
        {
          method: 'delete',
          outOfScope: `/api/quantity-tables/${target.quantityTableId}`,
          missing: `/api/quantity-tables/${MISSING_ID}`,
        },
      ];

      for (const write of writes) {
        const label = `${write.method.toUpperCase()} ${write.outOfScope}`;
        const missing = await request(app)
          [write.method](write.missing)
          .set(...auth(outsider))
          .send(write.missingBody ?? write.body ?? {});
        const outOfScope = await request(app)
          [write.method](write.outOfScope)
          .set(...auth(outsider))
          .send(write.body ?? {});

        expect(missing.status, `${label}（不在）`).toBe(404);
        expect(outOfScope.status, label).toBe(404);
        expect(outOfScope.body.code, label).toBe('NOT_FOUND');
        expect(withoutInstance(outOfScope.body), label).toEqual(withoutInstance(missing.body));
        const exposed = JSON.stringify(withoutInstance(outOfScope.body));
        expect(exposed, label).not.toContain(target.projectId);
        expect(exposed, label).not.toContain(target.quantityTableId);
        expect(exposed, label).not.toContain('Url');
      }

      expect(await snapshot(target)).toEqual(before);
    });

    /**
     * @requirement quantity-table-generation/REQ-50.2
     */
    it('範囲外のアクセスは PROJECT_SCOPE_DENIED として記録される', async () => {
      await request(app)
        .get(`/api/quantity-items/${target.itemId}`)
        .set(...auth(outsider))
        .expect(404);

      const denied = await prisma.auditLog.findMany({
        where: { action: 'PROJECT_SCOPE_DENIED', actorId: outsider.id },
      });
      expect(denied.length).toBeGreaterThan(0);
      expect(denied.every((log) => log.targetId === target.projectId)).toBe(true);
    });

    /**
     * @requirement quantity-table-generation/REQ-50.1
     */
    it('閲覧範囲内でも権限を持たない利用者には、範囲の判定より先に権限なしの 403 を返す', async () => {
      const paths = [
        `/api/projects/${target.projectId}/quantity-tables`,
        `/api/quantity-tables/${target.quantityTableId}`,
        `/api/quantity-tables/${MISSING_ID}`,
        `/api/quantity-groups/${target.groupId}/items`,
        `/api/quantity-items/${target.itemId}`,
        `/api/projects/${target.projectId}/quantity-items/autocomplete-candidates`,
      ];
      for (const path of paths) {
        const response = await request(app)
          .get(path)
          .set(...auth(noPermission))
          .expect(403);
        expect(response.body.code, path).not.toBe('NOT_FOUND');
      }
    });

    /** 利用者が残した範囲外のアクセスの記録の件数（対象の案件を指定すればその案件だけ） */
    function deniedCount(actorId: string, targetId?: string): Promise<number> {
      return prisma.auditLog.count({
        where: { action: 'PROJECT_SCOPE_DENIED', actorId, ...(targetId ? { targetId } : {}) },
      });
    }

    /**
     * 担当者には経路の親（sibling）も対象の親（target）も範囲内であり、範囲内どうしの食い違い（経路の誤り）は
     * 範囲外の拒否としては記録しない（50.10）。
     *
     * @requirement quantity-table-generation/REQ-50.2
     * @requirement quantity-table-generation/REQ-50.10
     */
    it('二重マウントの経路で、経路の親と対象の親が食い違うと対象の不在と同じ 404 にする', async () => {
      const deniedBefore = await deniedCount(sales.id);
      const pairs: Array<[string, string]> = [
        [
          `/api/projects/${sibling.projectId}/quantity-tables/${target.quantityTableId}`,
          `/api/projects/${sibling.projectId}/quantity-tables/${MISSING_ID}`,
        ],
        [
          `/api/quantity-tables/${sibling.quantityTableId}/groups/${target.groupId}`,
          `/api/quantity-tables/${sibling.quantityTableId}/groups/${MISSING_ID}`,
        ],
        [
          `/api/quantity-groups/${target.secondGroupId}/items/${target.itemId}`,
          `/api/quantity-groups/${target.secondGroupId}/items/${MISSING_ID}`,
        ],
      ];
      for (const [mismatched, missingPath] of pairs) {
        const missing = await request(app)
          .get(missingPath)
          .set(...auth(sales))
          .expect(404);
        const response = await request(app)
          .get(mismatched)
          .set(...auth(sales))
          .expect(404);
        expect(withoutInstance(response.body), mismatched).toEqual(withoutInstance(missing.body));
      }
      expect(
        (await deniedCount(sales.id)) - deniedBefore,
        '範囲内どうしの食い違いは記録しない'
      ).toBe(0);
    });

    /**
     * 応答は不在と同じ 404 のまま、対象の実際の案件が範囲外なら範囲外の拒否として記録する
     * （quantity-table-generation タスク105.1。user-authentication の要件39.8 の本機能への適用）。
     * 範囲内の親（target の案件・数量表・数量グループ）の経路で、範囲外の案件（other）の数量表・数量グループ・
     * 数量項目を指す。数量表の 5 経路（詳細・更新・保存・コピー・取り除き）、数量グループの 4 経路（詳細・更新・
     * コピー・取り除き）、数量項目の 5 経路（詳細・更新・コピー・移動・取り除き）のすべてで、要求ごとに
     * 対象の実際の案件を対象に 1 件記録し、データを変えない。
     *
     * @requirement quantity-table-generation/REQ-50.10
     */
    it('二重マウントの経路で、範囲外の案件の数量表・数量グループ・数量項目を範囲内の親の経路で指すと、読み込みも書き込みも不在と同じ 404 になり、対象の実際の案件を対象に記録が 1 件ずつ増え、データを変えない', async () => {
      const beforeTarget = await snapshot(target);
      const beforeOther = await snapshot(other);
      const tableUpdatedAt = await updatedAtOf('table', other.quantityTableId);
      const groupUpdatedAt = await updatedAtOf('group', other.groupId);
      const itemUpdatedAt = await updatedAtOf('item', other.itemId);
      const tables = `/api/projects/${target.projectId}/quantity-tables`;
      const groups = `/api/quantity-tables/${target.quantityTableId}/groups`;
      const items = `/api/quantity-groups/${target.groupId}/items`;

      type Call = {
        method: 'get' | 'post' | 'put' | 'delete';
        path: string;
        missing: string;
        body?: Record<string, unknown>;
      };
      const calls: Call[] = [
        {
          method: 'get',
          path: `${tables}/${other.quantityTableId}`,
          missing: `${tables}/${MISSING_ID}`,
        },
        {
          method: 'put',
          path: `${tables}/${other.quantityTableId}`,
          missing: `${tables}/${MISSING_ID}`,
          body: { name: `${MARK}-mismatched`, expectedUpdatedAt: tableUpdatedAt },
        },
        {
          method: 'put',
          path: `${tables}/${other.quantityTableId}/save`,
          missing: `${tables}/${MISSING_ID}/save`,
          body: { expectedUpdatedAt: tableUpdatedAt, name: `${MARK}-mismatched`, groups: [] },
        },
        {
          method: 'post',
          path: `${tables}/${other.quantityTableId}/copy`,
          missing: `${tables}/${MISSING_ID}/copy`,
          body: { name: `${MARK}-mismatched` },
        },
        {
          method: 'get',
          path: `${groups}/${other.groupId}`,
          missing: `${groups}/${MISSING_ID}`,
        },
        {
          method: 'put',
          path: `${groups}/${other.groupId}`,
          missing: `${groups}/${MISSING_ID}`,
          body: { name: 'mismatched', expectedUpdatedAt: groupUpdatedAt },
        },
        {
          method: 'post',
          path: `${groups}/${other.groupId}/copy`,
          missing: `${groups}/${MISSING_ID}/copy`,
        },
        {
          method: 'get',
          path: `${items}/${other.itemId}`,
          missing: `${items}/${MISSING_ID}`,
        },
        {
          method: 'put',
          path: `${items}/${other.itemId}`,
          missing: `${items}/${MISSING_ID}`,
          body: { name: 'mismatched', expectedUpdatedAt: itemUpdatedAt },
        },
        {
          method: 'post',
          path: `${items}/${other.itemId}/copy`,
          missing: `${items}/${MISSING_ID}/copy`,
        },
        {
          method: 'post',
          path: `${items}/${other.itemId}/move`,
          missing: `${items}/${MISSING_ID}/move`,
          body: { targetGroupId: other.secondGroupId, displayOrder: 9 },
        },
        {
          method: 'delete',
          path: `${items}/${other.secondItemId}`,
          missing: `${items}/${MISSING_ID}`,
        },
        {
          method: 'delete',
          path: `${groups}/${other.secondGroupId}`,
          missing: `${groups}/${MISSING_ID}`,
        },
        {
          method: 'delete',
          path: `${tables}/${other.quantityTableId}`,
          missing: `${tables}/${MISSING_ID}`,
        },
      ];

      for (const call of calls) {
        const label = `${call.method.toUpperCase()} ${call.path}`;
        // 不在の対象: 404 で記録しない
        const missingBefore = await deniedCount(sales.id);
        const missing = await request(app)
          [call.method](call.missing)
          .set(...auth(sales))
          .send(call.body ?? {});
        expect(missing.status, `${label}（不在）`).toBe(404);
        expect((await deniedCount(sales.id)) - missingBefore, `${label}: 不在は記録しない`).toBe(0);

        const allBefore = await deniedCount(sales.id);
        const foreignBefore = await deniedCount(sales.id, other.projectId);
        const response = await request(app)
          [call.method](call.path)
          .set(...auth(sales))
          .send(call.body ?? {});
        expect(response.status, label).toBe(404);
        expect(response.body.code, label).toBe('NOT_FOUND');
        expect(withoutInstance(response.body), `${label}: 対象の不在と同じ本文`).toEqual(
          withoutInstance(missing.body)
        );
        const exposed = JSON.stringify(withoutInstance(response.body));
        for (const id of [other.projectId, other.quantityTableId, other.groupId, other.itemId]) {
          expect(exposed, label).not.toContain(id);
        }
        expect((await deniedCount(sales.id)) - allBefore, `${label}: 記録は 1 件だけ増える`).toBe(
          1
        );
        expect(
          (await deniedCount(sales.id, other.projectId)) - foreignBefore,
          `${label}: 記録の対象は対象の実際の案件`
        ).toBe(1);
      }

      expect(await snapshot(target)).toEqual(beforeTarget);
      expect(await snapshot(other), 'データは変わらない').toEqual(beforeOther);
    });

    /**
     * 数量表の論理削除は区別しない（design.md の 2026-10-29 の追加の章の 50.10 の決定）。範囲外の案件の
     * 論理削除済みの数量表とその配下の数量グループ・数量項目を範囲内の親の経路で指しても、不在と同じ 404 で
     * 数量表の案件を対象に記録する。
     *
     * @requirement quantity-table-generation/REQ-50.10
     */
    it('二重マウントの経路で、範囲外の案件の論理削除済みの数量表とその配下を範囲内の親の経路で指しても、不在と同じ 404 になり、数量表の案件を対象に記録が 1 件ずつ増え、データを変えない', async () => {
      const deletedTable = await prisma.quantityTable.create({
        data: { projectId: other.projectId, name: `${MARK}-deleted-foreign-qt` },
        select: { id: true },
      });
      const deletedGroup = await prisma.quantityGroup.create({
        data: { quantityTableId: deletedTable.id, name: 'deleted-foreign-group', displayOrder: 0 },
        select: { id: true },
      });
      const deletedItemId = await createItem(deletedGroup.id, `${MARK}-deleted-foreign-item`, 0);
      await prisma.quantityTable.update({
        where: { id: deletedTable.id },
        data: { deletedAt: new Date() },
      });
      try {
        const beforeTarget = await snapshot(target);
        const beforeOther = await snapshot(other);
        const pairs: Array<[string, string]> = [
          [
            `/api/projects/${target.projectId}/quantity-tables/${deletedTable.id}`,
            `/api/projects/${target.projectId}/quantity-tables/${MISSING_ID}`,
          ],
          [
            `/api/quantity-tables/${target.quantityTableId}/groups/${deletedGroup.id}`,
            `/api/quantity-tables/${target.quantityTableId}/groups/${MISSING_ID}`,
          ],
          [
            `/api/quantity-groups/${target.groupId}/items/${deletedItemId}`,
            `/api/quantity-groups/${target.groupId}/items/${MISSING_ID}`,
          ],
        ];
        for (const [mismatched, missingPath] of pairs) {
          const missing = await request(app)
            .get(missingPath)
            .set(...auth(sales))
            .expect(404);
          const allBefore = await deniedCount(sales.id);
          const foreignBefore = await deniedCount(sales.id, other.projectId);
          const response = await request(app)
            .get(mismatched)
            .set(...auth(sales))
            .expect(404);
          expect(response.body.code, mismatched).toBe('NOT_FOUND');
          expect(withoutInstance(response.body), `${mismatched}: 対象の不在と同じ本文`).toEqual(
            withoutInstance(missing.body)
          );
          const exposed = JSON.stringify(withoutInstance(response.body));
          expect(exposed, mismatched).not.toContain(other.projectId);
          expect(exposed, mismatched).not.toContain(deletedTable.id);
          expect(
            (await deniedCount(sales.id)) - allBefore,
            `${mismatched}: 記録は 1 件だけ増える`
          ).toBe(1);
          expect(
            (await deniedCount(sales.id, other.projectId)) - foreignBefore,
            `${mismatched}: 記録の対象は数量表の実際の案件`
          ).toBe(1);
        }
        expect(await snapshot(target)).toEqual(beforeTarget);
        expect(await snapshot(other)).toEqual(beforeOther);
      } finally {
        await prisma.quantityTable.delete({ where: { id: deletedTable.id } });
      }
    });
  });

  describe('複数の対象を一度に扱う要求（50.4）', () => {
    /**
     * @requirement quantity-table-generation/REQ-50.4
     */
    it('対象または移し先に範囲外が一つでも含まれる一括コピー・一括移動・移動・表示順の更新は、全体を不在と同じ 404 にしてどこにも書き込まない', async () => {
      const beforeTarget = await snapshot(target);
      const beforeOther = await snapshot(other);

      type Bulk = {
        method: 'post' | 'put';
        path: string;
        body: Record<string, unknown>;
        missingBody: Record<string, unknown>;
      };
      const bulks: Bulk[] = [
        // 一括コピー: 範囲内の項目と範囲外の項目が混じる（項目は複数の数量表にまたがり得る）
        {
          method: 'post',
          path: '/api/quantity-items/bulk-copy',
          body: { itemIds: [target.itemId, other.itemId] },
          missingBody: { itemIds: [target.itemId, MISSING_ID] },
        },
        // 一括移動: 範囲内の項目を範囲外のグループへ
        {
          method: 'post',
          path: '/api/quantity-items/bulk-move',
          body: { itemIds: [target.itemId], targetGroupId: other.secondGroupId },
          missingBody: { itemIds: [target.itemId], targetGroupId: MISSING_ID },
        },
        // 一括移動: 範囲外の項目を範囲内のグループへ
        {
          method: 'post',
          path: '/api/quantity-items/bulk-move',
          body: { itemIds: [target.itemId, other.itemId], targetGroupId: target.secondGroupId },
          missingBody: {
            itemIds: [target.itemId, MISSING_ID],
            targetGroupId: target.secondGroupId,
          },
        },
        // 移動: 範囲内の項目を範囲外のグループへ
        {
          method: 'post',
          path: `/api/quantity-items/${target.itemId}/move`,
          body: { targetGroupId: other.secondGroupId, displayOrder: 9 },
          missingBody: { targetGroupId: MISSING_ID, displayOrder: 9 },
        },
        // 数量グループの表示順の更新: 範囲外のグループが混じる
        {
          method: 'put',
          path: `/api/quantity-tables/${target.quantityTableId}/groups/order`,
          body: {
            orderUpdates: [
              { id: target.groupId, displayOrder: 7 },
              { id: other.groupId, displayOrder: 8 },
            ],
          },
          missingBody: {
            orderUpdates: [
              { id: target.groupId, displayOrder: 7 },
              { id: MISSING_ID, displayOrder: 8 },
            ],
          },
        },
        // 数量項目の表示順の更新: 範囲外の項目が混じる
        {
          method: 'put',
          path: `/api/quantity-groups/${target.groupId}/items/order`,
          body: {
            orderUpdates: [
              { id: target.itemId, displayOrder: 7 },
              { id: other.itemId, displayOrder: 8 },
            ],
          },
          missingBody: {
            orderUpdates: [
              { id: target.itemId, displayOrder: 7 },
              { id: MISSING_ID, displayOrder: 8 },
            ],
          },
        },
      ];

      for (const bulk of bulks) {
        const label = `${bulk.method.toUpperCase()} ${bulk.path} ${JSON.stringify(bulk.body)}`;
        const missing = await request(app)
          [bulk.method](bulk.path)
          .set(...auth(sales))
          .send(bulk.missingBody);
        const outOfScope = await request(app)
          [bulk.method](bulk.path)
          .set(...auth(sales))
          .send(bulk.body);

        expect(missing.status, `${label}（不在）`).toBe(404);
        expect(outOfScope.status, label).toBe(404);
        expect(outOfScope.body.code, label).toBe('NOT_FOUND');
        expect(withoutInstance(outOfScope.body), label).toEqual(withoutInstance(missing.body));
        const exposed = JSON.stringify(withoutInstance(outOfScope.body));
        expect(exposed, label).not.toContain(other.projectId);
      }

      expect(await snapshot(target)).toEqual(beforeTarget);
      expect(await snapshot(other)).toEqual(beforeOther);
    });

    /**
     * @requirement quantity-table-generation/REQ-50.4
     */
    it('数量表の保存は、範囲外の数量表を対象にすると全体を 404 にし、どの行にも書き込まない', async () => {
      const beforeOther = await snapshot(other);
      const response = await request(app)
        .put(`/api/quantity-tables/${other.quantityTableId}/save`)
        .set(...auth(sales))
        .send({
          expectedUpdatedAt: await updatedAtOf('table', other.quantityTableId),
          name: `${MARK}-intruder`,
          groups: [
            {
              id: other.groupId,
              name: 'intruder',
              surveyImageId: null,
              displayOrder: 0,
              items: [],
            },
          ],
        })
        .expect(404);
      expect(response.body.code).toBe('NOT_FOUND');
      expect(await snapshot(other)).toEqual(beforeOther);
    });
  });

  describe('写真の紐付けが指す現場調査・画像（50.5）', () => {
    /**
     * @requirement quantity-table-generation/REQ-50.5
     */
    it('範囲外の案件の現場調査・画像を指す紐付けは、現場調査・画像の不在と同じ 404 になり、数量グループの作成と紐付けを行わない', async () => {
      const before = await snapshot(target);
      const tableUpdatedAt = await updatedAtOf('table', target.quantityTableId);
      const groupUpdatedAt = await updatedAtOf('group', target.secondGroupId);

      const linkRequests: Array<{
        method: 'post' | 'put';
        path: string;
        body: (ref: string) => Record<string, unknown>;
        code: string;
        foreign: string;
      }> = [
        {
          method: 'post',
          path: `/api/quantity-tables/${target.quantityTableId}/groups`,
          body: (ref) => ({ name: 'link', surveyImageId: ref }),
          code: 'SURVEY_IMAGE_NOT_FOUND',
          foreign: other.surveyImageId,
        },
        {
          method: 'put',
          path: `/api/quantity-groups/${target.secondGroupId}`,
          body: (ref) => ({ surveyImageId: ref, expectedUpdatedAt: groupUpdatedAt }),
          code: 'SURVEY_IMAGE_NOT_FOUND',
          foreign: other.surveyImageId,
        },
        {
          method: 'put',
          path: `/api/quantity-tables/${target.quantityTableId}/save`,
          body: (ref) => ({
            expectedUpdatedAt: tableUpdatedAt,
            name: `${MARK}-target-qt`,
            groups: [{ id: null, name: 'link', surveyImageId: ref, displayOrder: 0, items: [] }],
          }),
          code: 'SURVEY_IMAGE_NOT_FOUND',
          foreign: other.surveyImageId,
        },
        {
          method: 'post',
          path: `/api/quantity-tables/${target.quantityTableId}/groups/from-survey`,
          body: (ref) => ({ siteSurveyId: ref }),
          code: 'SITE_SURVEY_NOT_FOUND',
          foreign: other.surveyId,
        },
      ];

      for (const link of linkRequests) {
        const label = `${link.method.toUpperCase()} ${link.path}`;
        const missing = await request(app)
          [link.method](link.path)
          .set(...auth(sales))
          .send(link.body(MISSING_ID));
        const outOfScope = await request(app)
          [link.method](link.path)
          .set(...auth(sales))
          .send(link.body(link.foreign));

        expect(missing.status, `${label}（不在）`).toBe(404);
        expect(outOfScope.status, label).toBe(404);
        expect(outOfScope.body.code, label).toBe(link.code);
        expect(missing.body.code, label).toBe(link.code);
        // 本文は要求した ID を写す項目（surveyImageId・detail の ID）を除いて不在と一致する
        const normalize = (body: Record<string, unknown>, ref: string): unknown =>
          JSON.parse(JSON.stringify(withoutInstance(body)).split(ref).join('<ref>'));
        expect(normalize(outOfScope.body, link.foreign), label).toEqual(
          normalize(missing.body, MISSING_ID)
        );
        expect(JSON.stringify(outOfScope.body), label).not.toContain(other.projectId);
      }

      expect(await snapshot(target)).toEqual(before);
    });

    /**
     * @requirement quantity-table-generation/REQ-50.5
     */
    it('範囲外の現場調査・画像を指す紐付けの拒否は、当該の案件 ID で PROJECT_SCOPE_DENIED として記録され、不在と範囲内の別のプロジェクトでは記録されない', async () => {
      /** 営業担当者の範囲外の記録（user-authentication の要件39.7） */
      const deniedLogs = () =>
        prisma.auditLog.findMany({
          where: { action: 'PROJECT_SCOPE_DENIED', actorId: sales.id },
          orderBy: { createdAt: 'asc' },
        });
      const send = async (
        method: 'post' | 'put',
        path: string,
        body: Record<string, unknown>
      ): Promise<number> => {
        const response = await request(app)
          [method](path)
          .set(...auth(sales))
          .set('User-Agent', `${MARK}-agent`)
          .send(body);
        return response.status;
      };
      const tablePath = `/api/quantity-tables/${target.quantityTableId}`;
      const groupPath = `/api/quantity-groups/${target.secondGroupId}`;
      const saveBody = async (ref: string): Promise<Record<string, unknown>> => ({
        expectedUpdatedAt: await updatedAtOf('table', target.quantityTableId),
        name: `${MARK}-target-qt`,
        groups: [{ id: null, name: 'link', surveyImageId: ref, displayOrder: 0, items: [] }],
      });
      const updateBody = async (ref: string): Promise<Record<string, unknown>> => ({
        surveyImageId: ref,
        expectedUpdatedAt: await updatedAtOf('group', target.secondGroupId),
      });

      type Case = { method: 'post' | 'put'; path: string; body: (ref: string) => Promise<unknown> };
      const cases: Array<Case & { foreign: string; sibling: string; siblingStatus: number }> = [
        {
          method: 'post',
          path: `${tablePath}/groups`,
          body: async (ref) => ({ name: 'link', surveyImageId: ref }),
          foreign: other.surveyImageId,
          sibling: sibling.surveyImageId,
          siblingStatus: 400,
        },
        {
          method: 'put',
          path: `${tablePath}/save`,
          body: saveBody,
          foreign: other.surveyImageId,
          sibling: sibling.surveyImageId,
          siblingStatus: 400,
        },
        {
          method: 'put',
          path: groupPath,
          body: updateBody,
          foreign: other.surveyImageId,
          sibling: sibling.surveyImageId,
          siblingStatus: 400,
        },
        {
          method: 'post',
          path: `${tablePath}/groups/from-survey`,
          body: async (ref) => ({ siteSurveyId: ref }),
          foreign: other.surveyId,
          sibling: sibling.surveyId,
          siblingStatus: 403,
        },
      ];

      for (const c of cases) {
        const label = `${c.method.toUpperCase()} ${c.path}`;
        const beforeCount = (await deniedLogs()).length;

        // 不在と範囲内の別のプロジェクトは記録しない
        expect(
          await send(c.method, c.path, (await c.body(MISSING_ID)) as Record<string, unknown>),
          `${label}（不在）`
        ).toBe(404);
        expect(
          await send(c.method, c.path, (await c.body(c.sibling)) as Record<string, unknown>),
          `${label}（範囲内の別のプロジェクト）`
        ).toBe(c.siblingStatus);
        expect((await deniedLogs()).length, `${label}（不在・範囲内）`).toBe(beforeCount);

        // 範囲外は 404 で拒み、当該の案件 ID で 1 件記録する（トランザクションの巻き戻しに巻き込まれない）
        expect(
          await send(c.method, c.path, (await c.body(c.foreign)) as Record<string, unknown>),
          label
        ).toBe(404);
        const logs = await deniedLogs();
        expect(logs.length, label).toBe(beforeCount + 1);
        const log = logs[logs.length - 1]!;
        expect(log.targetType, label).toBe('Project');
        expect(log.targetId, label).toBe(other.projectId);
        expect(log.metadata, label).toMatchObject({
          method: c.method.toUpperCase(),
          userAgent: `${MARK}-agent`,
        });
        const metadata = log.metadata as Record<string, unknown>;
        // 経路は requireProjectScope と同じく baseUrl + path（マウント点の直下は末尾の / を伴う）
        expect(String(metadata.path).replace(/\/$/, ''), label).toBe(c.path);
        expect(metadata.ipAddress, label).toBeTruthy();
        expect('requestId' in metadata, label).toBe(true);
      }
    });

    /**
     * @requirement quantity-table-generation/REQ-50.5
     */
    it('範囲内の別のプロジェクトの写真は、従来どおり同一プロジェクトの検証が 400・403 で拒む', async () => {
      const before = await snapshot(target);

      const group = await request(app)
        .post(`/api/quantity-tables/${target.quantityTableId}/groups`)
        .set(...auth(sales))
        .send({ name: 'link', surveyImageId: sibling.surveyImageId })
        .expect(400);
      expect(group.body.code).toBe('QUANTITY_TABLE_VALIDATION_ERROR');

      const fromSurvey = await request(app)
        .post(`/api/quantity-tables/${target.quantityTableId}/groups/from-survey`)
        .set(...auth(sales))
        .send({ siteSurveyId: sibling.surveyId })
        .expect(403);
      expect(fromSurvey.body.code).toBe('SITE_SURVEY_PROJECT_MISMATCH');

      const saveBody = (secondRef: string): Record<string, unknown> => ({
        name: `${MARK}-target-qt`,
        groups: [
          { id: null, name: 'a', surveyImageId: sibling.surveyImageId, displayOrder: 0, items: [] },
          { id: null, name: 'b', surveyImageId: secondRef, displayOrder: 1, items: [] },
        ],
      });
      // 範囲内の別のプロジェクトの写真の後に範囲外の写真が続いても、不在の写真が続く場合と同じ 400 になる
      // （範囲外の写真は所属の検査の名指しにも現れない）
      const withMissing = await request(app)
        .put(`/api/quantity-tables/${target.quantityTableId}/save`)
        .set(...auth(sales))
        .send({
          ...saveBody(MISSING_ID),
          expectedUpdatedAt: await updatedAtOf('table', target.quantityTableId),
        })
        .expect(400);
      const withOutOfScope = await request(app)
        .put(`/api/quantity-tables/${target.quantityTableId}/save`)
        .set(...auth(sales))
        .send({
          ...saveBody(other.surveyImageId),
          expectedUpdatedAt: await updatedAtOf('table', target.quantityTableId),
        })
        .expect(400);
      expect(withoutInstance(withOutOfScope.body)).toEqual(withoutInstance(withMissing.body));
      expect(withOutOfScope.body['groups[0].surveyImageId']).toBeTruthy();
      expect(withOutOfScope.body['groups[1].surveyImageId']).toBeUndefined();

      expect(await snapshot(target)).toEqual(before);
    });

    /**
     * @requirement quantity-table-generation/REQ-50.5
     */
    it('全案件閲覧の権限の利用者には、別の案件の写真は範囲内として従来どおりの 400・403 になる', async () => {
      const group = await request(app)
        .post(`/api/quantity-tables/${target.quantityTableId}/groups`)
        .set(...auth(readAll))
        .send({ name: 'link', surveyImageId: other.surveyImageId })
        .expect(400);
      expect(group.body.code).toBe('QUANTITY_TABLE_VALIDATION_ERROR');

      const fromSurvey = await request(app)
        .post(`/api/quantity-tables/${target.quantityTableId}/groups/from-survey`)
        .set(...auth(readAll))
        .send({ siteSurveyId: other.surveyId })
        .expect(403);
      expect(fromSurvey.body.code).toBe('SITE_SURVEY_PROJECT_MISMATCH');
    });
  });
});
