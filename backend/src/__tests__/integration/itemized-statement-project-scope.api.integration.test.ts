/**
 * @fileoverview 内訳書の API への案件の閲覧範囲の適用の統合検証（itemized-statement-generation タスク27.1）
 *
 * 本物のアプリ（app.ts のルート・authenticate・requirePermission・requireProjectScope・共有の
 * ProjectScopeService と RBACService）と、テスト用の実データベースを通す。
 *
 * 被覆する受入基準（itemized-statement-generation の Requirement 18.1〜18.6）は各 it の `@requirement` の印が名乗る。
 * 出力の記録（18.7・18.8）はタスク27.2 の担当で、本ファイルは扱わない。
 *
 * 利用者（いずれもテストで作るロール。ロール名は admin ではない）:
 * - MEMBER: 内訳書の閲覧・作成・更新・削除の権限だけを持ち、全案件閲覧の権限を持たない
 * - READ_ALL: MEMBER の権限に全案件閲覧の権限（project:read_all）を加えたもの
 * - 案件 target の営業担当者・工事担当者・作成者（関係者）、担当外の利用者、全案件閲覧の利用者、権限なしの利用者
 * - 案件 other の営業担当者・作成者は担当外の利用者（範囲外の数量表・内訳書・内訳項目を用意するため）
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

const MARK = 'test-is27-scope';
const MEMBER_ROLE = `${MARK}-member`;
const READ_ALL_ROLE = `${MARK}-read-all`;
const NO_PERMISSION_ROLE = `${MARK}-no-permission`;
/** 版 4・変種 8 の整った UUID（ID の形式の検査を通り、どの行としても存在しない） */
const MISSING_ID = '00000000-0000-4000-8000-000000027100';

interface TestUser {
  id: string;
  token: string;
}

interface Fixture {
  projectId: string;
  quantityTableId: string;
  statementId: string;
  statementName: string;
  itemIds: string[];
}

describe('内訳書の API の閲覧範囲（統合・実 DB）', () => {
  let prisma: PrismaClient;
  let sales: TestUser;
  let construction: TestUser;
  let creator: TestUser;
  let outsider: TestUser;
  let readAll: TestUser;
  let noPermission: TestUser;
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
    const statements = await prisma.itemizedStatement.findMany({
      where: { projectId: { in: projectIds } },
      select: { id: true },
    });
    await deleteAuditLogsWithArchivePermission(prisma, {
      OR: [
        { actorId: { in: userIds } },
        { targetId: { in: userIds } },
        { targetId: { in: projectIds } },
        { targetId: { in: statements.map((s) => s.id) } },
      ],
    });
    // 数量表・内訳書・内訳項目は案件の削除に連なって消える
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
      data: { name, description: 'itemized-statement-generation タスク27 の検証用' },
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

  /** 内訳書（内訳項目 2 件）を DB に作る */
  async function createStatement(
    projectId: string,
    quantityTableId: string,
    name: string
  ): Promise<{ statementId: string; itemIds: string[] }> {
    const statement = await prisma.itemizedStatement.create({
      data: {
        projectId,
        name,
        sourceQuantityTableId: quantityTableId,
        sourceQuantityTableName: `${name} の数量表`,
        items: {
          create: [
            { workType: '工種1', name: `${name}-内訳1`, unit: '式', quantity: 1, displayOrder: 0 },
            { workType: '工種2', name: `${name}-内訳2`, unit: 'm', quantity: 2, displayOrder: 1 },
          ],
        },
      },
      select: { id: true, items: { select: { id: true }, orderBy: { displayOrder: 'asc' } } },
    });
    return { statementId: statement.id, itemIds: statement.items.map((i) => i.id) };
  }

  async function createFixture(
    label: string,
    people: { salesPersonId: string; constructionPersonId?: string; createdById: string }
  ): Promise<Fixture> {
    const project = await prisma.project.create({
      data: { name: `${MARK}-${label}`, ...people },
      select: { id: true },
    });
    const quantityTable = await prisma.quantityTable.create({
      data: {
        projectId: project.id,
        name: `${MARK}-${label}-qt`,
        groups: {
          create: [
            {
              name: `${label}-グループ`,
              displayOrder: 0,
              items: {
                create: [
                  {
                    workType: `${label}-工種`,
                    name: `${label}-数量項目`,
                    unit: 'm2',
                    quantity: 12.5,
                    displayOrder: 0,
                  },
                ],
              },
            },
          ],
        },
      },
      select: { id: true },
    });
    const statementName = `${MARK}-${label}-statement`;
    const { statementId, itemIds } = await createStatement(
      project.id,
      quantityTable.id,
      statementName
    );
    return {
      projectId: project.id,
      quantityTableId: quantityTable.id,
      statementId,
      statementName,
      itemIds,
    };
  }

  /** 案件の内訳書まわりのデータの状態（範囲外の要求の前後で変わらないことを比べる） */
  async function snapshot(fixture: Fixture): Promise<unknown> {
    return {
      statements: await prisma.itemizedStatement.findMany({
        where: { projectId: fixture.projectId },
        select: { id: true, name: true, deletedAt: true, updatedAt: true },
        orderBy: { id: 'asc' },
      }),
      items: await prisma.itemizedStatementItem.findMany({
        where: { itemizedStatement: { projectId: fixture.projectId } },
        select: { id: true, itemizedStatementId: true, displayOrder: true, name: true },
        orderBy: { id: 'asc' },
      }),
    };
  }

  async function deniedCount(actorId: string, targetId?: string): Promise<number> {
    return prisma.auditLog.count({
      where: { action: 'PROJECT_SCOPE_DENIED', actorId, ...(targetId ? { targetId } : {}) },
    });
  }

  beforeAll(async () => {
    prisma = getPrismaClient();
    await cleanup();
    await seedRoles(prisma);
    await seedPermissions(prisma);
    await seedRolePermissions(prisma);

    const memberPermissions: Array<[string, string]> = [
      ['itemized_statement', 'create'],
      ['itemized_statement', 'read'],
      ['itemized_statement', 'update'],
      ['itemized_statement', 'delete'],
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

  describe('範囲内の利用者（18.1・18.6）', () => {
    /**
     * @requirement itemized-statement-generation/REQ-18.1
     * @requirement itemized-statement-generation/REQ-18.6
     */
    it('営業担当者・工事担当者・作成者・全案件閲覧の権限の利用者は、一覧・直近の内訳書の要約・詳細を従来どおり得られ、一覧には当該案件のものだけが載る', async () => {
      for (const user of [sales, construction, creator, readAll]) {
        const list = await request(app)
          .get(`/api/projects/${target.projectId}/itemized-statements`)
          .set(...auth(user))
          .expect(200);
        const listedIds = list.body.data.map((s: { id: string }) => s.id);
        expect(listedIds).toEqual([target.statementId]);
        expect(listedIds).not.toContain(other.statementId);

        const latest = await request(app)
          .get(`/api/projects/${target.projectId}/itemized-statements/latest`)
          .set(...auth(user))
          .expect(200);
        expect(latest.body.latestStatements.map((s: { id: string }) => s.id)).toEqual([
          target.statementId,
        ]);

        const detail = await request(app)
          .get(`/api/itemized-statements/${target.statementId}`)
          .set(...auth(user))
          .expect(200);
        expect(detail.body.name).toBe(target.statementName);
        expect(detail.body.items.map((i: { id: string }) => i.id)).toEqual(target.itemIds);

        // 二重マウントでも、経路の案件と内訳書の案件が一致すれば従来どおり
        await request(app)
          .get(`/api/projects/${target.projectId}/itemized-statements/${target.statementId}`)
          .set(...auth(user))
          .expect(200);
      }
    });

    /**
     * @requirement itemized-statement-generation/REQ-18.1
     */
    it('関係者と全案件閲覧の権限の利用者は、自案件の数量表からの内訳書の作成・並び順の保存・削除を行える', async () => {
      const created = await request(app)
        .post(`/api/projects/${target.projectId}/itemized-statements`)
        .set(...auth(construction))
        .send({ name: `${MARK}-created`, quantityTableId: target.quantityTableId })
        .expect(201);
      const createdId = created.body.id as string;
      expect(created.body.sourceQuantityTableId).toBe(target.quantityTableId);
      expect(created.body.itemCount).toBe(1);

      const detail = await request(app)
        .get(`/api/itemized-statements/${createdId}`)
        .set(...auth(creator))
        .expect(200);
      const reordered = await request(app)
        .patch(`/api/itemized-statements/${createdId}/items/order`)
        .set(...auth(creator))
        .send({
          // 並び順は 0 からの連番で全項目を送る（作成した内訳書の内訳項目は 1 件）
          items: [{ id: detail.body.items[0].id, displayOrder: 0 }],
          updatedAt: detail.body.updatedAt,
        })
        .expect(200);
      expect(reordered.body.items.map((i: { id: string }) => i.id)).toEqual([
        detail.body.items[0].id,
      ]);
      expect(reordered.body.updatedAt).not.toBe(detail.body.updatedAt);

      await request(app)
        .delete(`/api/itemized-statements/${createdId}`)
        .set(...auth(readAll))
        .send({ updatedAt: reordered.body.updatedAt })
        .expect(204);
      const deleted = await prisma.itemizedStatement.findUniqueOrThrow({
        where: { id: createdId },
      });
      expect(deleted.deletedAt).toBeInstanceOf(Date);
      await prisma.itemizedStatement.delete({ where: { id: createdId } });
    });

    /**
     * 解決関数は論理削除された内訳書からも案件 ID を引く。範囲内の利用者には本体の 404
     * （内訳書の不在の符号）がそのまま届き、範囲外の利用者には不在と同じ汎用の 404 が返る。
     *
     * @requirement itemized-statement-generation/REQ-18.1
     * @requirement itemized-statement-generation/REQ-18.2
     */
    it('論理削除された内訳書は、範囲内の利用者には本体の 404、範囲外の利用者には汎用の 404 を返す', async () => {
      const { statementId: deletedId } = await createStatement(
        target.projectId,
        target.quantityTableId,
        `${MARK}-deleted`
      );
      await prisma.itemizedStatement.update({
        where: { id: deletedId },
        data: { deletedAt: new Date() },
      });

      const inScope = await request(app)
        .get(`/api/itemized-statements/${deletedId}`)
        .set(...auth(sales))
        .expect(404);
      expect(inScope.body.code).toBe('ITEMIZED_STATEMENT_NOT_FOUND');

      const outOfScope = await request(app)
        .get(`/api/itemized-statements/${deletedId}`)
        .set(...auth(outsider))
        .expect(404);
      expect(outOfScope.body.code).toBe('NOT_FOUND');
      expect(JSON.stringify(withoutInstance(outOfScope.body))).not.toContain(deletedId);
      await prisma.itemizedStatement.delete({ where: { id: deletedId } });
    });
  });

  describe('範囲外の ID 指定（18.2・18.3・18.6）', () => {
    /**
     * @requirement itemized-statement-generation/REQ-18.2
     * @requirement itemized-statement-generation/REQ-18.3
     * @requirement itemized-statement-generation/REQ-18.6
     */
    it('担当外の利用者の一覧・直近の内訳書の要約・詳細は、存在しない ID と同じ 404 の本文になり、案件 ID も内訳書 ID も返らない', async () => {
      const readPaths: Array<[string, string]> = [
        [
          `/api/projects/${target.projectId}/itemized-statements`,
          `/api/projects/${MISSING_ID}/itemized-statements`,
        ],
        [
          `/api/projects/${target.projectId}/itemized-statements/latest`,
          `/api/projects/${MISSING_ID}/itemized-statements/latest`,
        ],
        [
          `/api/itemized-statements/${target.statementId}`,
          `/api/itemized-statements/${MISSING_ID}`,
        ],
        [
          `/api/projects/${target.projectId}/itemized-statements/${target.statementId}`,
          `/api/projects/${target.projectId}/itemized-statements/${MISSING_ID}`,
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
        expect(exposed, outOfScopePath).not.toContain(target.projectId);
        expect(exposed, outOfScopePath).not.toContain(target.statementId);
        expect(exposed, outOfScopePath).not.toContain(target.statementName);
      }
    });

    /**
     * プロジェクトの配下でないマウント（`/api/itemized-statements`）から届く一覧と直近の内訳書の要約は、
     * 経路に案件が無いため ID の形式の検査の 400 で終わり、内訳書を返さない。
     *
     * @requirement itemized-statement-generation/REQ-18.6
     */
    it('プロジェクトを指定しない一覧と直近の内訳書の要約は 400 で終わり、どの案件の内訳書も返さない', async () => {
      for (const path of ['/api/itemized-statements', '/api/itemized-statements/latest']) {
        const response = await request(app)
          .get(path)
          .set(...auth(readAll))
          .expect(400);
        const exposed = JSON.stringify(response.body);
        expect(exposed, path).not.toContain(target.statementId);
        expect(exposed, path).not.toContain(other.statementId);
      }
    });

    /**
     * @requirement itemized-statement-generation/REQ-18.2
     * @requirement itemized-statement-generation/REQ-18.3
     */
    it('担当外の利用者の作成・並び順の保存・削除は、存在しない ID と同じ 404 の本文になり、データベースを変えない', async () => {
      const before = await snapshot(target);
      const statement = await prisma.itemizedStatement.findUniqueOrThrow({
        where: { id: target.statementId },
      });
      const updatedAt = statement.updatedAt.toISOString();

      type Ids = { project: string; statement: string };
      type Call = (id: Ids) => request.Test;
      const writes: Array<[string, Call]> = [
        [
          'POST itemized-statements',
          (id) =>
            request(app)
              .post(`/api/projects/${id.project}/itemized-statements`)
              .send({ name: `${MARK}-intrusion`, quantityTableId: target.quantityTableId }),
        ],
        [
          'PATCH itemized-statements/:id/items/order',
          (id) =>
            request(app)
              .patch(`/api/itemized-statements/${id.statement}/items/order`)
              .send({
                items: target.itemIds.map((itemId, index) => ({
                  id: itemId,
                  displayOrder: 10 - index,
                })),
                updatedAt,
              }),
        ],
        [
          'DELETE itemized-statements/:id',
          (id) =>
            request(app).delete(`/api/itemized-statements/${id.statement}`).send({ updatedAt }),
        ],
      ];

      for (const [label, call] of writes) {
        const missing = await call({ project: MISSING_ID, statement: MISSING_ID })
          .set(...auth(outsider))
          .expect(404);
        const outOfScope = await call({ project: target.projectId, statement: target.statementId })
          .set(...auth(outsider))
          .expect(404);
        expect(outOfScope.body.code, label).toBe('NOT_FOUND');
        expect(withoutInstance(outOfScope.body), label).toEqual(withoutInstance(missing.body));
        const exposed = JSON.stringify(withoutInstance(outOfScope.body));
        expect(exposed, label).not.toContain(target.projectId);
        expect(exposed, label).not.toContain(target.statementId);
      }

      expect(await snapshot(target)).toEqual(before);
    });

    /**
     * @requirement itemized-statement-generation/REQ-18.2
     */
    it('範囲外のアクセスは PROJECT_SCOPE_DENIED として記録される', async () => {
      const before = await deniedCount(outsider.id, target.projectId);
      await request(app)
        .get(`/api/itemized-statements/${target.statementId}`)
        .set(...auth(outsider))
        .expect(404);
      expect(await deniedCount(outsider.id, target.projectId)).toBe(before + 1);
    });

    /**
     * @requirement itemized-statement-generation/REQ-18.2
     */
    it('閲覧範囲内でも権限を持たない利用者には、範囲の判定より先に権限なしの 403 を返し、範囲外の拒否としては記録しない', async () => {
      const paths = [
        `/api/projects/${target.projectId}/itemized-statements`,
        `/api/projects/${target.projectId}/itemized-statements/latest`,
        `/api/itemized-statements/${target.statementId}`,
        `/api/itemized-statements/${MISSING_ID}`,
      ];
      const deniedBefore = await deniedCount(noPermission.id);
      for (const path of paths) {
        const response = await request(app)
          .get(path)
          .set(...auth(noPermission))
          .expect(403);
        expect(response.body.code, path).not.toBe('NOT_FOUND');
      }
      // 権限なしは範囲の判定に届かないため、範囲外の拒否としては記録しない
      expect((await deniedCount(noPermission.id)) - deniedBefore).toBe(0);
    });

    /**
     * @requirement itemized-statement-generation/REQ-18.2
     */
    it('二重マウントの経路で、経路の案件と内訳書の案件が食い違うと内訳書の不在と同じ 404 にし、記録しない', async () => {
      const deniedBefore = await deniedCount(readAll.id);
      const missing = await request(app)
        .get(`/api/projects/${other.projectId}/itemized-statements/${MISSING_ID}`)
        .set(...auth(readAll))
        .expect(404);
      const mismatched = await request(app)
        .get(`/api/projects/${other.projectId}/itemized-statements/${target.statementId}`)
        .set(...auth(readAll))
        .expect(404);
      expect(mismatched.body.code).toBe('NOT_FOUND');
      expect(withoutInstance(mismatched.body)).toEqual(withoutInstance(missing.body));

      const before = await snapshot(target);
      const statement = await prisma.itemizedStatement.findUniqueOrThrow({
        where: { id: target.statementId },
      });
      const updatedAt = statement.updatedAt.toISOString();
      const mismatchedOrder = await request(app)
        .patch(
          `/api/projects/${other.projectId}/itemized-statements/${target.statementId}/items/order`
        )
        .set(...auth(readAll))
        .send({ items: [{ id: target.itemIds[0], displayOrder: 9 }], updatedAt })
        .expect(404);
      expect(mismatchedOrder.body.code).toBe('NOT_FOUND');
      const mismatchedDelete = await request(app)
        .delete(`/api/projects/${other.projectId}/itemized-statements/${target.statementId}`)
        .set(...auth(readAll))
        .send({ updatedAt })
        .expect(404);
      expect(mismatchedDelete.body.code).toBe('NOT_FOUND');
      expect(await snapshot(target)).toEqual(before);
      // 全案件閲覧の権限の利用者には内訳書の案件も範囲内であり、範囲内どうしの食い違い（経路の誤り）は
      // 範囲外の拒否としては記録しない（18.11）
      expect((await deniedCount(readAll.id)) - deniedBefore).toBe(0);
    });

    /**
     * 応答は不在と同じ 404 のまま、内訳書の実際の案件が範囲外なら範囲外の拒否として記録する
     * （itemized-statement-generation タスク28.2。user-authentication の要件39.8 の本機能への適用）。
     * 不在の内訳書は記録しない（範囲内の他の案件の内訳書は直前のテストが記録しないことを確かめる）。
     *
     * @requirement itemized-statement-generation/REQ-18.11
     */
    it('二重マウントの経路で、範囲外の案件の内訳書を範囲内の案件の経路で指すと、不在と同じ 404 になり、内訳書の案件を対象に記録が 1 件増え、データを変えない', async () => {
      const beforeTarget = await snapshot(target);
      const beforeOther = await snapshot(other);
      const nested = `/api/projects/${target.projectId}/itemized-statements`;

      // 不在の内訳書: 404 で記録しない
      const missingBefore = await deniedCount(sales.id);
      const missing = await request(app)
        .get(`${nested}/${MISSING_ID}`)
        .set(...auth(sales))
        .expect(404);
      expect((await deniedCount(sales.id)) - missingBefore, '不在の内訳書は記録しない').toBe(0);

      const statement = await prisma.itemizedStatement.findUniqueOrThrow({
        where: { id: other.statementId },
      });
      const updatedAt = statement.updatedAt.toISOString();

      // 範囲外の案件の内訳書を、範囲内の案件の経路で読む・並べ替える・削除する:
      // 要求ごとに 1 件、内訳書の案件を対象に記録する
      const calls: Array<[string, () => request.Test]> = [
        ['GET', () => request(app).get(`${nested}/${other.statementId}`)],
        [
          'PATCH items/order',
          () =>
            request(app)
              .patch(`${nested}/${other.statementId}/items/order`)
              .send({
                items: other.itemIds.map((itemId, index) => ({
                  id: itemId,
                  displayOrder: 10 - index,
                })),
                updatedAt,
              }),
        ],
        ['DELETE', () => request(app).delete(`${nested}/${other.statementId}`).send({ updatedAt })],
      ];
      for (const [label, call] of calls) {
        const allBefore = await deniedCount(sales.id);
        const foreignBefore = await deniedCount(sales.id, other.projectId);
        const response = await call()
          .set(...auth(sales))
          .expect(404);
        expect(response.body.code, label).toBe('NOT_FOUND');
        expect(withoutInstance(response.body), `${label}: 内訳書の不在と同じ本文`).toEqual(
          withoutInstance(missing.body)
        );
        const exposed = JSON.stringify(withoutInstance(response.body));
        expect(exposed, label).not.toContain(other.projectId);
        expect(exposed, label).not.toContain(other.statementId);
        expect((await deniedCount(sales.id)) - allBefore, `${label}: 記録は 1 件だけ増える`).toBe(
          1
        );
        expect(
          (await deniedCount(sales.id, other.projectId)) - foreignBefore,
          `${label}: 記録の対象は内訳書の実際の案件`
        ).toBe(1);
      }

      expect(await snapshot(target)).toEqual(beforeTarget);
      expect(await snapshot(other)).toEqual(beforeOther);
    });

    /**
     * 内訳書の論理削除は区別しない（design.md の 2026-10-29 の追加の章の 18.11 の決定）。範囲外の案件の
     * 論理削除済みの内訳書を範囲内の案件の経路で指しても、不在と同じ 404 で内訳書の案件を対象に記録する。
     *
     * @requirement itemized-statement-generation/REQ-18.11
     */
    it('二重マウントの経路で、範囲外の案件の論理削除済みの内訳書を範囲内の案件の経路で指しても、不在と同じ 404 になり、内訳書の案件を対象に記録が 1 件増え、データを変えない', async () => {
      const { statementId: deletedId } = await createStatement(
        other.projectId,
        other.quantityTableId,
        `${MARK}-deleted-foreign`
      );
      await prisma.itemizedStatement.update({
        where: { id: deletedId },
        data: { deletedAt: new Date() },
      });
      try {
        const beforeTarget = await snapshot(target);
        const beforeOther = await snapshot(other);
        const nested = `/api/projects/${target.projectId}/itemized-statements`;

        const missing = await request(app)
          .get(`${nested}/${MISSING_ID}`)
          .set(...auth(sales))
          .expect(404);

        const allBefore = await deniedCount(sales.id);
        const foreignBefore = await deniedCount(sales.id, other.projectId);
        const response = await request(app)
          .get(`${nested}/${deletedId}`)
          .set(...auth(sales))
          .expect(404);
        expect(response.body.code).toBe('NOT_FOUND');
        expect(withoutInstance(response.body), '内訳書の不在と同じ本文').toEqual(
          withoutInstance(missing.body)
        );
        expect(JSON.stringify(withoutInstance(response.body))).not.toContain(deletedId);
        expect((await deniedCount(sales.id)) - allBefore, '記録は 1 件だけ増える').toBe(1);
        expect(
          (await deniedCount(sales.id, other.projectId)) - foreignBefore,
          '記録の対象は内訳書の実際の案件'
        ).toBe(1);

        expect(await snapshot(target)).toEqual(beforeTarget);
        expect(await snapshot(other)).toEqual(beforeOther);
      } finally {
        await prisma.itemizedStatement.delete({ where: { id: deletedId } });
      }
    });
  });

  describe('作成の要求が指す数量表（18.4）', () => {
    /** 数量表の不在の応答と比べるため、本文に写る要求の数量表 ID を伏せる */
    function maskTableId(body: Record<string, unknown>, tableId: string): string {
      return JSON.stringify(withoutInstance(body)).split(tableId).join('<table-id>');
    }

    /**
     * @requirement itemized-statement-generation/REQ-18.4
     */
    it('作成の要求が範囲外の案件の数量表を指すと、存在しない数量表と同じ 404 になり、内訳書を作成せず、範囲外の拒否として記録する', async () => {
      const beforeTarget = await snapshot(target);
      const beforeOther = await snapshot(other);
      const deniedBefore = await deniedCount(sales.id, other.projectId);

      const missing = await request(app)
        .post(`/api/projects/${target.projectId}/itemized-statements`)
        .set(...auth(sales))
        .send({ name: `${MARK}-cross`, quantityTableId: MISSING_ID })
        .expect(404);
      const foreign = await request(app)
        .post(`/api/projects/${target.projectId}/itemized-statements`)
        .set(...auth(sales))
        .send({ name: `${MARK}-cross`, quantityTableId: other.quantityTableId })
        .expect(404);

      expect(missing.body.code).toBe('QUANTITY_TABLE_NOT_FOUND');
      expect(foreign.body.code).toBe('QUANTITY_TABLE_NOT_FOUND');
      expect(maskTableId(foreign.body, other.quantityTableId)).toBe(
        maskTableId(missing.body, MISSING_ID)
      );
      const exposed = JSON.stringify(withoutInstance(foreign.body));
      expect(exposed).not.toContain(other.projectId);
      expect(exposed).not.toContain('other-数量項目');

      expect(await snapshot(target)).toEqual(beforeTarget);
      expect(await snapshot(other)).toEqual(beforeOther);
      expect(
        (await deniedCount(sales.id, other.projectId)) - deniedBefore,
        '範囲外の案件の数量表は範囲外の拒否として 1 回記録する'
      ).toBe(1);
    });

    /**
     * 照合は閲覧範囲でなく作成先のプロジェクトへの所属で行う。全案件閲覧の権限の利用者でも、
     * 他のプロジェクトの数量表からは内訳書を作れない（範囲内のため範囲外の拒否としては記録しない）。
     *
     * @requirement itemized-statement-generation/REQ-18.4
     */
    it('作成の要求が範囲内の他のプロジェクトの数量表を指しても、存在しない数量表と同じ 404 になり、内訳書を作成せず、範囲外の拒否としては記録しない', async () => {
      const beforeTarget = await snapshot(target);
      const deniedBefore = await deniedCount(readAll.id);

      const missing = await request(app)
        .post(`/api/projects/${target.projectId}/itemized-statements`)
        .set(...auth(readAll))
        .send({ name: `${MARK}-cross-in-scope`, quantityTableId: MISSING_ID })
        .expect(404);
      const foreign = await request(app)
        .post(`/api/projects/${target.projectId}/itemized-statements`)
        .set(...auth(readAll))
        .send({ name: `${MARK}-cross-in-scope`, quantityTableId: other.quantityTableId })
        .expect(404);

      expect(foreign.body.code).toBe('QUANTITY_TABLE_NOT_FOUND');
      expect(maskTableId(foreign.body, other.quantityTableId)).toBe(
        maskTableId(missing.body, MISSING_ID)
      );
      expect(await snapshot(target)).toEqual(beforeTarget);
      expect((await deniedCount(readAll.id)) - deniedBefore).toBe(0);
    });
  });

  describe('並び順の保存の内訳項目の所属（18.5）', () => {
    /**
     * 既存の検証（Requirement 17.10 の 400）が要求全体を書き込みの前に拒否する振る舞いを固定する。
     * 応答は存在しない内訳項目の ID を含む場合と同じで、他の案件の内訳項目の実在を推測させない。
     *
     * @requirement itemized-statement-generation/REQ-18.5
     */
    it('自案件の内訳書の並び順の保存に他の案件の内訳書の内訳項目の ID が一つでも混じると、存在しない ID と同じ 400 で要求全体を拒否し、どの内訳項目にも書き込まない', async () => {
      const beforeTarget = await snapshot(target);
      const beforeOther = await snapshot(other);
      const statement = await prisma.itemizedStatement.findUniqueOrThrow({
        where: { id: target.statementId },
      });

      const save = (foreignOrMissingId: string): request.Test =>
        request(app)
          .patch(`/api/itemized-statements/${target.statementId}/items/order`)
          .set(...auth(sales))
          .send({
            updatedAt: statement.updatedAt.toISOString(),
            // 自分の内訳項目の並べ替えを含め、部分適用されないことを確かめる
            items: [
              { id: target.itemIds[1], displayOrder: 0 },
              { id: target.itemIds[0], displayOrder: 1 },
              { id: foreignOrMissingId, displayOrder: 2 },
            ],
          });

      const missing = await save(MISSING_ID).expect(400);
      const foreign = await save(other.itemIds[0]!).expect(400);

      expect(foreign.body.code).toBe('ITEM_NOT_BELONG_TO_STATEMENT');
      expect(
        JSON.stringify(withoutInstance(foreign.body)).split(other.itemIds[0]!).join('<id>')
      ).toBe(JSON.stringify(withoutInstance(missing.body)).split(MISSING_ID).join('<id>'));
      const exposed = JSON.stringify(withoutInstance(foreign.body));
      expect(exposed).not.toContain(other.statementId);
      expect(exposed).not.toContain(other.projectId);

      expect(await snapshot(target)).toEqual(beforeTarget);
      expect(await snapshot(other)).toEqual(beforeOther);
    });
  });
});
