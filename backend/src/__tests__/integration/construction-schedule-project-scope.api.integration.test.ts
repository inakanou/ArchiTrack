/**
 * @fileoverview 工程表の API への案件の閲覧範囲の適用の統合検証（construction-schedule タスク22.1）
 *
 * 本物のアプリ（app.ts のルート・authenticate・requirePermission・requireProjectScope・共有の
 * ProjectScopeService と RBACService）と、テスト用の実データベースを通す。
 *
 * 被覆する受入基準（construction-schedule の Requirement 13.1〜13.5）は各 it の `@requirement` の印が名乗る。
 * 出力の記録（13.6・13.7）はタスク22.2 の担当で、本ファイルは扱わない（出力の経路の範囲の判定は 13.2 として扱う）。
 *
 * 利用者（いずれもテストで作るロール。ロール名は admin ではない）:
 * - MEMBER: 工程表の閲覧・作成・更新・削除の権限だけを持ち、全案件閲覧の権限を持たない
 * - READ_ALL: MEMBER の権限に全案件閲覧の権限（project:read_all）を加えたもの
 * - 案件 target の営業担当者・工事担当者・作成者（関係者）、担当外の利用者、全案件閲覧の利用者、権限なしの利用者
 * - 案件 other の営業担当者・作成者は担当外の利用者（範囲外の数量表・工程表を用意するため）
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

const MARK = 'test-cs22-scope';
const MEMBER_ROLE = `${MARK}-member`;
const READ_ALL_ROLE = `${MARK}-read-all`;
const NO_PERMISSION_ROLE = `${MARK}-no-permission`;
/** 版 4・変種 8 の整った UUID（ID の形式の検査を通り、どの行としても存在しない） */
const MISSING_ID = '00000000-0000-4000-8000-000000022100';

interface TestUser {
  id: string;
  token: string;
}

interface Fixture {
  projectId: string;
  quantityTableId: string;
  quantityItemName: string;
  scheduleId: string;
  scheduleName: string;
  itemIds: string[];
}

describe('工程表の API の閲覧範囲（統合・実 DB）', () => {
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
    await deleteAuditLogsWithArchivePermission(prisma, {
      OR: [
        { actorId: { in: userIds } },
        { targetId: { in: userIds } },
        { targetId: { in: projectIds } },
      ],
    });
    // 数量表・工程表・工程項目は案件の削除に連なって消える
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
      data: { name, description: 'construction-schedule タスク22 の検証用' },
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

  /** 工程表（工程項目 2 件）を DB に作る */
  async function createSchedule(
    projectId: string,
    name: string
  ): Promise<{ scheduleId: string; itemIds: string[] }> {
    const schedule = await prisma.constructionSchedule.create({
      data: {
        projectId,
        name,
        version: 0,
        items: {
          create: [
            { itemName: `${name}-工程1`, displayOrder: 0, duration: 3 },
            { itemName: `${name}-工程2`, displayOrder: 1, duration: 5 },
          ],
        },
      },
      select: { id: true, items: { select: { id: true }, orderBy: { displayOrder: 'asc' } } },
    });
    return { scheduleId: schedule.id, itemIds: schedule.items.map((i) => i.id) };
  }

  async function createFixture(
    label: string,
    people: { salesPersonId: string; constructionPersonId?: string; createdById: string }
  ): Promise<Fixture> {
    const project = await prisma.project.create({
      data: { name: `${MARK}-${label}`, ...people },
      select: { id: true },
    });
    const quantityItemName = `${MARK}-${label}-数量項目`;
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
                    name: quantityItemName,
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
    const scheduleName = `${MARK}-${label}-schedule`;
    const { scheduleId, itemIds } = await createSchedule(project.id, scheduleName);
    return {
      projectId: project.id,
      quantityTableId: quantityTable.id,
      quantityItemName,
      scheduleId,
      scheduleName,
      itemIds,
    };
  }

  /** 案件の工程表まわりのデータの状態（範囲外の要求の前後で変わらないことを比べる） */
  async function snapshot(fixture: Fixture): Promise<unknown> {
    return {
      schedules: await prisma.constructionSchedule.findMany({
        where: { projectId: fixture.projectId },
        select: { id: true, name: true, version: true, deletedAt: true, updatedAt: true },
        orderBy: { id: 'asc' },
      }),
      items: await prisma.scheduleItem.findMany({
        where: { schedule: { projectId: fixture.projectId } },
        select: {
          id: true,
          scheduleId: true,
          itemName: true,
          displayOrder: true,
          duration: true,
          updatedAt: true,
        },
        orderBy: { id: 'asc' },
      }),
    };
  }

  async function deniedCount(actorId: string, targetId?: string): Promise<number> {
    return prisma.auditLog.count({
      where: { action: 'PROJECT_SCOPE_DENIED', actorId, ...(targetId ? { targetId } : {}) },
    });
  }

  /** 一括保存の要求の本文（既存の工程項目の名前を変え、1 件を足す） */
  function bulkSaveBody(fixture: Fixture, version: number): Record<string, unknown> {
    return {
      version,
      items: [
        ...fixture.itemIds.map((id, index) => ({
          id,
          itemName: `書き換えの試み-${index}`,
          labelText: '',
          detailText: '',
          startDate: null,
          duration: 9,
          displayOrder: index,
          isExportTarget: true,
        })),
        {
          id: null,
          itemName: '追加の試み',
          labelText: '',
          detailText: '',
          startDate: null,
          duration: null,
          displayOrder: fixture.itemIds.length,
          isExportTarget: true,
        },
      ],
    };
  }

  beforeAll(async () => {
    prisma = getPrismaClient();
    await cleanup();
    await seedRoles(prisma);
    await seedPermissions(prisma);
    await seedRolePermissions(prisma);

    const memberPermissions: Array<[string, string]> = [
      ['schedule', 'create'],
      ['schedule', 'read'],
      ['schedule', 'update'],
      ['schedule', 'delete'],
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

  describe('範囲内の利用者（13.1・13.5）', () => {
    /**
     * @requirement construction-schedule/REQ-13.1
     * @requirement construction-schedule/REQ-13.5
     */
    it('営業担当者・工事担当者・作成者・全案件閲覧の権限の利用者は、一覧・詳細・出力を従来どおり得られ、一覧には当該案件のものだけが載る', async () => {
      for (const user of [sales, construction, creator, readAll]) {
        const list = await request(app)
          .get(`/api/projects/${target.projectId}/schedules`)
          .set(...auth(user))
          .expect(200);
        const listedIds = list.body.schedules.map((s: { id: string }) => s.id);
        expect(listedIds).toEqual([target.scheduleId]);
        expect(listedIds).not.toContain(other.scheduleId);
        expect(list.body.total).toBe(1);

        const detail = await request(app)
          .get(`/api/schedules/${target.scheduleId}`)
          .set(...auth(user))
          .expect(200);
        expect(detail.body.name).toBe(target.scheduleName);
        expect(detail.body.items.map((i: { id: string }) => i.id)).toEqual(target.itemIds);

        // 二重マウントでも、経路の案件と工程表の案件が一致すれば従来どおり
        await request(app)
          .get(`/api/projects/${target.projectId}/schedules/${target.scheduleId}`)
          .set(...auth(user))
          .expect(200);

        const exported = await request(app)
          .get(`/api/schedules/${target.scheduleId}/export`)
          .query({ format: 'xlsx' })
          .set(...auth(user))
          .expect(200);
        expect(exported.headers['content-disposition']).toContain('.xlsx');
      }
    });

    /**
     * @requirement construction-schedule/REQ-13.1
     */
    it('関係者と全案件閲覧の権限の利用者は、自案件の数量表からの工程表の作成・更新・一括保存・削除を行える', async () => {
      const created = await request(app)
        .post(`/api/projects/${target.projectId}/schedules`)
        .set(...auth(construction))
        .send({ name: `${MARK}-created`, quantityTableId: target.quantityTableId })
        .expect(201);
      const createdId = created.body.id as string;
      expect(created.body.quantityTableId).toBe(target.quantityTableId);
      expect(created.body.items.map((i: { itemName: string }) => i.itemName)).toEqual([
        target.quantityItemName,
      ]);

      const renamed = await request(app)
        .put(`/api/schedules/${createdId}`)
        .set(...auth(creator))
        .send({ name: `${MARK}-renamed`, version: 0 })
        .expect(200);
      expect(renamed.body.version).toBe(1);

      const saved = await request(app)
        .put(`/api/schedules/${createdId}/bulk-save`)
        .set(...auth(sales))
        .send({
          version: 1,
          items: [
            {
              id: null,
              itemName: '手入力の工程',
              labelText: '',
              detailText: '',
              startDate: null,
              duration: 2,
              displayOrder: 0,
              isExportTarget: true,
            },
          ],
        })
        .expect(200);
      expect(saved.body.updatedItemCount).toBe(1);

      await request(app)
        .delete(`/api/schedules/${createdId}`)
        .set(...auth(readAll))
        .expect(204);
      const deleted = await prisma.constructionSchedule.findUniqueOrThrow({
        where: { id: createdId },
      });
      expect(deleted.deletedAt).toBeInstanceOf(Date);
      await prisma.constructionSchedule.delete({ where: { id: createdId } });
    });

    /**
     * 解決関数は論理的に取り除かれた工程表に案件 ID を返さない（design.md の「案件IDの解決関数」）。
     * 範囲の内外を問わず、存在しない工程表と同じ汎用の 404 になり、範囲外の拒否としては記録しない。
     *
     * @requirement construction-schedule/REQ-13.2
     * @requirement construction-schedule/REQ-13.3
     */
    it('論理的に取り除かれた工程表は、範囲の内外を問わず存在しない工程表と同じ汎用の 404 を返す', async () => {
      const { scheduleId: deletedId } = await createSchedule(target.projectId, `${MARK}-deleted`);
      await prisma.constructionSchedule.update({
        where: { id: deletedId },
        data: { deletedAt: new Date() },
      });

      const missing = await request(app)
        .get(`/api/schedules/${MISSING_ID}`)
        .set(...auth(sales))
        .expect(404);
      const deniedBefore = await deniedCount(outsider.id);
      for (const user of [sales, outsider]) {
        const response = await request(app)
          .get(`/api/schedules/${deletedId}`)
          .set(...auth(user))
          .expect(404);
        expect(response.body.code).toBe('NOT_FOUND');
        expect(withoutInstance(response.body)).toEqual(withoutInstance(missing.body));
      }
      expect((await deniedCount(outsider.id)) - deniedBefore).toBe(0);
      await prisma.constructionSchedule.delete({ where: { id: deletedId } });
    });
  });

  describe('範囲外の ID 指定（13.2・13.3・13.5）', () => {
    /**
     * @requirement construction-schedule/REQ-13.2
     * @requirement construction-schedule/REQ-13.3
     * @requirement construction-schedule/REQ-13.5
     */
    it('担当外の利用者の一覧・詳細・出力は、存在しない ID と同じ 404 の本文になり、案件 ID も工程表 ID も返らず、ファイルを返さない', async () => {
      const readPaths: Array<[string, string]> = [
        [`/api/projects/${target.projectId}/schedules`, `/api/projects/${MISSING_ID}/schedules`],
        [`/api/schedules/${target.scheduleId}`, `/api/schedules/${MISSING_ID}`],
        [
          `/api/projects/${target.projectId}/schedules/${target.scheduleId}`,
          `/api/projects/${target.projectId}/schedules/${MISSING_ID}`,
        ],
        [
          `/api/schedules/${target.scheduleId}/export?format=xlsx`,
          `/api/schedules/${MISSING_ID}/export?format=xlsx`,
        ],
        [
          `/api/schedules/${target.scheduleId}/export?format=pdf`,
          `/api/schedules/${MISSING_ID}/export?format=pdf`,
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
        expect(outOfScope.headers['content-disposition'], outOfScopePath).toBeUndefined();
        expect(outOfScope.headers['content-type'], outOfScopePath).toContain('json');
        const exposed = JSON.stringify(withoutInstance(outOfScope.body));
        expect(exposed, outOfScopePath).not.toContain(target.projectId);
        expect(exposed, outOfScopePath).not.toContain(target.scheduleId);
        expect(exposed, outOfScopePath).not.toContain(target.scheduleName);
      }
    });

    /**
     * プロジェクトの配下でないマウント（`/api/schedules`）から届く一覧と作成は、
     * 経路に案件が無いため ID の形式の検査の 400 で終わり、工程表を返さず作らない。
     *
     * @requirement construction-schedule/REQ-13.5
     */
    it('プロジェクトを指定しない一覧と作成は 400 で終わり、どの案件の工程表も返さず作らない', async () => {
      const before = await snapshot(target);
      const list = await request(app)
        .get('/api/schedules')
        .set(...auth(readAll))
        .expect(400);
      const exposed = JSON.stringify(list.body);
      expect(exposed).not.toContain(target.scheduleId);
      expect(exposed).not.toContain(other.scheduleId);

      await request(app)
        .post('/api/schedules')
        .set(...auth(readAll))
        .send({ name: `${MARK}-no-project` })
        .expect(400);
      expect(
        await prisma.constructionSchedule.count({ where: { name: `${MARK}-no-project` } })
      ).toBe(0);
      expect(await snapshot(target)).toEqual(before);
    });

    /**
     * @requirement construction-schedule/REQ-13.2
     * @requirement construction-schedule/REQ-13.3
     */
    it('担当外の利用者の作成・更新・一括保存・削除は、存在しない ID と同じ 404 の本文になり、データベースを変えない', async () => {
      const before = await snapshot(target);
      const schedule = await prisma.constructionSchedule.findUniqueOrThrow({
        where: { id: target.scheduleId },
      });

      type Ids = { project: string; schedule: string };
      type Call = (id: Ids) => request.Test;
      const writes: Array<[string, Call]> = [
        [
          'POST schedules',
          (id) =>
            request(app)
              .post(`/api/projects/${id.project}/schedules`)
              .send({ name: `${MARK}-intrusion`, quantityTableId: target.quantityTableId }),
        ],
        [
          'PUT schedules/:id',
          (id) =>
            request(app)
              .put(`/api/schedules/${id.schedule}`)
              .send({ name: `${MARK}-intrusion`, version: schedule.version }),
        ],
        [
          'PUT schedules/:id/bulk-save',
          (id) =>
            request(app)
              .put(`/api/schedules/${id.schedule}/bulk-save`)
              .send(bulkSaveBody(target, schedule.version)),
        ],
        ['DELETE schedules/:id', (id) => request(app).delete(`/api/schedules/${id.schedule}`)],
      ];

      for (const [label, call] of writes) {
        const missing = await call({ project: MISSING_ID, schedule: MISSING_ID })
          .set(...auth(outsider))
          .expect(404);
        const outOfScope = await call({ project: target.projectId, schedule: target.scheduleId })
          .set(...auth(outsider))
          .expect(404);
        expect(outOfScope.body.code, label).toBe('NOT_FOUND');
        expect(withoutInstance(outOfScope.body), label).toEqual(withoutInstance(missing.body));
        const exposed = JSON.stringify(withoutInstance(outOfScope.body));
        expect(exposed, label).not.toContain(target.projectId);
        expect(exposed, label).not.toContain(target.scheduleId);
      }

      expect(await snapshot(target)).toEqual(before);
      expect(
        await prisma.constructionSchedule.count({ where: { name: `${MARK}-intrusion` } })
      ).toBe(0);
    });

    /**
     * @requirement construction-schedule/REQ-13.2
     */
    it('範囲外のアクセスは要求ごとに PROJECT_SCOPE_DENIED として記録され、不在の ID の要求は記録されない', async () => {
      const before = await deniedCount(outsider.id, target.projectId);
      const paths = [
        `/api/projects/${target.projectId}/schedules`,
        `/api/schedules/${target.scheduleId}`,
        `/api/schedules/${target.scheduleId}/export?format=xlsx`,
      ];
      for (const path of paths) {
        await request(app)
          .get(path)
          .set(...auth(outsider))
          .expect(404);
      }
      expect((await deniedCount(outsider.id, target.projectId)) - before).toBe(paths.length);

      const deniedBefore = await deniedCount(outsider.id);
      await request(app)
        .get(`/api/schedules/${MISSING_ID}`)
        .set(...auth(outsider))
        .expect(404);
      expect((await deniedCount(outsider.id)) - deniedBefore).toBe(0);
    });

    /**
     * @requirement construction-schedule/REQ-13.2
     */
    it('閲覧範囲内でも権限を持たない利用者には、範囲の判定より先に権限なしの 403 を返し、範囲外の拒否としては記録しない', async () => {
      const paths = [
        `/api/projects/${target.projectId}/schedules`,
        `/api/schedules/${target.scheduleId}`,
        `/api/schedules/${MISSING_ID}`,
        `/api/schedules/${target.scheduleId}/export?format=xlsx`,
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
     * @requirement construction-schedule/REQ-13.2
     */
    it('二重マウントの経路で、経路の案件と工程表の案件が食い違うと工程表の不在と同じ 404 にし、データを変えず、記録しない', async () => {
      const deniedBefore = await deniedCount(readAll.id);
      const missing = await request(app)
        .get(`/api/projects/${other.projectId}/schedules/${MISSING_ID}`)
        .set(...auth(readAll))
        .expect(404);
      const mismatched = await request(app)
        .get(`/api/projects/${other.projectId}/schedules/${target.scheduleId}`)
        .set(...auth(readAll))
        .expect(404);
      expect(mismatched.body.code).toBe('NOT_FOUND');
      expect(withoutInstance(mismatched.body)).toEqual(withoutInstance(missing.body));

      const before = await snapshot(target);
      const schedule = await prisma.constructionSchedule.findUniqueOrThrow({
        where: { id: target.scheduleId },
      });
      const base = `/api/projects/${other.projectId}/schedules/${target.scheduleId}`;
      const responses = [
        await request(app)
          .put(base)
          .set(...auth(readAll))
          .send({ name: `${MARK}-mismatch`, version: schedule.version }),
        await request(app)
          .put(`${base}/bulk-save`)
          .set(...auth(readAll))
          .send(bulkSaveBody(target, schedule.version)),
        await request(app)
          .delete(base)
          .set(...auth(readAll)),
        await request(app)
          .get(`${base}/export?format=xlsx`)
          .set(...auth(readAll)),
      ];
      for (const response of responses) {
        expect(response.status).toBe(404);
        expect(response.body.code).toBe('NOT_FOUND');
        expect(response.headers['content-disposition']).toBeUndefined();
      }
      expect(await snapshot(target)).toEqual(before);
      // 食い違いは不在の扱いのため、範囲外の拒否としては記録しない
      expect((await deniedCount(readAll.id)) - deniedBefore).toBe(0);
    });
  });

  describe('作成の要求が指す数量表（13.4）', () => {
    /**
     * @requirement construction-schedule/REQ-13.4
     */
    it('作成の要求が範囲外の案件の数量表を指すと、存在しない数量表と同じ 422 の本文になり、工程表も工程項目も作成せず、範囲外の拒否として記録する', async () => {
      const beforeTarget = await snapshot(target);
      const beforeOther = await snapshot(other);
      const deniedBefore = await deniedCount(sales.id, other.projectId);

      const missing = await request(app)
        .post(`/api/projects/${target.projectId}/schedules`)
        .set(...auth(sales))
        .send({ name: `${MARK}-cross`, quantityTableId: MISSING_ID })
        .expect(422);
      const foreign = await request(app)
        .post(`/api/projects/${target.projectId}/schedules`)
        .set(...auth(sales))
        .send({ name: `${MARK}-cross`, quantityTableId: other.quantityTableId })
        .expect(422);

      expect(missing.body.code).toBe('SCHEDULE_VALIDATION_ERROR');
      expect(foreign.body).toEqual(missing.body);
      const exposed = JSON.stringify(foreign.body);
      expect(exposed).not.toContain(other.projectId);
      expect(exposed).not.toContain(other.quantityTableId);
      expect(exposed).not.toContain(other.quantityItemName);

      expect(await snapshot(target)).toEqual(beforeTarget);
      expect(await snapshot(other)).toEqual(beforeOther);
      expect(await prisma.constructionSchedule.count({ where: { name: `${MARK}-cross` } })).toBe(0);
      expect(
        (await deniedCount(sales.id, other.projectId)) - deniedBefore,
        '範囲外の案件の数量表は範囲外の拒否として 1 回記録する'
      ).toBe(1);
    });

    /**
     * 照合は閲覧範囲でなく作成先のプロジェクトへの所属で行う。全案件閲覧の権限の利用者でも、
     * 他のプロジェクトの数量表からは工程表を作れない（範囲内のため範囲外の拒否としては記録しない）。
     *
     * @requirement construction-schedule/REQ-13.4
     */
    it('作成の要求が範囲内の他のプロジェクトの数量表を指しても、存在しない数量表と同じ 422 の本文になり、工程表を作成せず、範囲外の拒否としては記録しない', async () => {
      const beforeTarget = await snapshot(target);
      const deniedBefore = await deniedCount(readAll.id);

      const missing = await request(app)
        .post(`/api/projects/${target.projectId}/schedules`)
        .set(...auth(readAll))
        .send({ name: `${MARK}-cross-in-scope`, quantityTableId: MISSING_ID })
        .expect(422);
      const foreign = await request(app)
        .post(`/api/projects/${target.projectId}/schedules`)
        .set(...auth(readAll))
        .send({ name: `${MARK}-cross-in-scope`, quantityTableId: other.quantityTableId })
        .expect(422);

      expect(foreign.body.code).toBe('SCHEDULE_VALIDATION_ERROR');
      expect(foreign.body).toEqual(missing.body);
      expect(await snapshot(target)).toEqual(beforeTarget);
      expect(
        await prisma.constructionSchedule.count({ where: { name: `${MARK}-cross-in-scope` } })
      ).toBe(0);
      expect((await deniedCount(readAll.id)) - deniedBefore).toBe(0);
    });
  });
});
