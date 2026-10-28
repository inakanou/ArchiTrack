/**
 * @fileoverview 契約書の API への案件の閲覧範囲の適用の統合検証（contract-management タスク19.1）
 *
 * 本物のアプリ（app.ts のルート・authenticate・requirePermission・requireProjectScope・共有の
 * ProjectScopeService と RBACService）と、テスト用の実データベースを通す。
 *
 * 被覆する受入基準（contract-management の Requirement 13.1・13.2・13.4、14.1〜14.7）は各 it の
 * `@requirement` の印が名乗る。
 *
 * 利用者（いずれもテストで作るロール。ロール名は admin ではない）:
 * - MEMBER: 契約書の閲覧・作成・更新・削除の権限だけを持ち、全案件閲覧の権限を持たない
 * - READ_ALL: MEMBER の権限に全案件閲覧の権限（project:read_all）を加えたもの
 * - 案件 target の営業担当者・工事担当者・作成者（関係者）、担当外の利用者、全案件閲覧の利用者、権限なしの利用者
 * - 案件 other の営業担当者・作成者は担当外の利用者（範囲外の見積書・契約書を用意するため）
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
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

const MARK = 'test-cm19-scope';
const MEMBER_ROLE = `${MARK}-member`;
const READ_ALL_ROLE = `${MARK}-read-all`;
const NO_PERMISSION_ROLE = `${MARK}-no-permission`;
/** 版 4・変種 8 の整った UUID（ID の形式の検査を通り、どの行としても存在しない） */
const MISSING_ID = '00000000-0000-4000-8000-000000019100';

interface TestUser {
  id: string;
  token: string;
}

interface Fixture {
  projectId: string;
  estimateId: string;
  estimateName: string;
  contractId: string;
}

describe('契約書の API の閲覧範囲（統合・実 DB）', () => {
  let prisma: PrismaClient;
  let sales: TestUser;
  let construction: TestUser;
  let creator: TestUser;
  let outsider: TestUser;
  let readAll: TestUser;
  let noPermission: TestUser;
  /** 権限なしのロールで、案件 npOwn の営業担当者・作成者（範囲内の権限なし） */
  let noPermissionInScope: TestUser;
  let target: Fixture;
  let other: Fixture;
  let npOwn: Fixture;

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
    // 見積書・契約書は案件の削除に連なって消える
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
      data: { name, description: 'contract-management タスク19 の検証用' },
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

  /** 本文の中の要求が指した ID を置き換える（不在の応答と ID 以外が同じことを比べるため） */
  function maskId(body: Record<string, unknown>, id: string): Record<string, unknown> {
    return JSON.parse(JSON.stringify(withoutInstance(body)).split(id).join('<requested-id>'));
  }

  /** 契約書を DB に作る */
  async function createContract(
    projectId: string,
    estimateId: string,
    overrides: Record<string, unknown> = {}
  ): Promise<string> {
    const contract = await prisma.contract.create({
      data: {
        projectId,
        contractType: 'NEW',
        status: 'BEFORE_CONTRACT',
        estimateId,
        contractDate: new Date('2026-04-01'),
        constructionStartDate: new Date('2026-05-01'),
        constructionEndDate: new Date('2026-12-31'),
        deliveryDate: new Date('2027-01-15'),
        taxRate: 0.1,
        paymentTerms: `${MARK}-当初の支払条件`,
        contractAmount: 11000000,
        constructionPrice: 10000000,
        taxAmount: 1000000,
        ...overrides,
      },
      select: { id: true },
    });
    return contract.id;
  }

  async function createFixture(
    label: string,
    people: { salesPersonId: string; constructionPersonId?: string; createdById: string }
  ): Promise<Fixture> {
    const project = await prisma.project.create({
      data: { name: `${MARK}-${label}`, ...people },
      select: { id: true },
    });
    const estimateName = `${MARK}-${label}-見積書`;
    const estimate = await prisma.estimate.create({
      data: { projectId: project.id, name: estimateName },
      select: { id: true },
    });
    const contractId = await createContract(project.id, estimate.id);
    return { projectId: project.id, estimateId: estimate.id, estimateName, contractId };
  }

  /** 作成の要求の本文 */
  function createBody(
    estimateId: string,
    amendment?: { parentContractId: string }
  ): Record<string, unknown> {
    return {
      contractType: amendment ? 'AMENDMENT' : 'NEW',
      parentContractId: amendment ? amendment.parentContractId : null,
      estimateId,
      contractDate: '2026-04-01',
      constructionStartDate: '2026-05-01',
      constructionEndDate: '2026-12-31',
      deliveryDate: '2027-01-15',
      taxRate: 0.1,
      paymentTerms: `${MARK}-侵入の試み`,
      separateConstruction: '',
      otherNotes: '',
      supervisorTradingPartnerId: null,
      contractAmount: 11000000,
      constructionPrice: 10000000,
      taxAmount: 1000000,
    };
  }

  /** 更新の要求の本文 */
  function updateBody(estimateId: string, version: number): Record<string, unknown> {
    const { contractType: _t, parentContractId: _p, ...rest } = createBody(estimateId);
    return { ...rest, version };
  }

  /** 案件の契約書の状態（範囲外の要求の前後で変わらないことを比べる） */
  async function snapshot(fixture: Fixture): Promise<unknown> {
    return prisma.contract.findMany({
      where: { projectId: fixture.projectId },
      select: {
        id: true,
        estimateId: true,
        status: true,
        paymentTerms: true,
        version: true,
        deletedAt: true,
        updatedAt: true,
      },
      orderBy: { id: 'asc' },
    });
  }

  /**
   * 書き込みの拒否を確かめる使い捨ての契約書を作る（各テストの後に afterEach が片付ける）。
   * 共有の契約書（fixture.contractId）を破壊的な経路に晒さず、ガードが外れても後ろのテストへ波及させない
   */
  async function disposable(fixture: Fixture): Promise<string> {
    return createContract(fixture.projectId, fixture.estimateId, {
      paymentTerms: `${MARK}-使い捨て`,
    });
  }

  async function intrusionCount(): Promise<number> {
    return prisma.contract.count({ where: { paymentTerms: `${MARK}-侵入の試み` } });
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
      ['contract', 'create'],
      ['contract', 'read'],
      ['contract', 'update'],
      ['contract', 'delete'],
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
    noPermissionInScope = await createUser('no-permission-in-scope', NO_PERMISSION_ROLE);

    target = await createFixture('target', {
      salesPersonId: sales.id,
      constructionPersonId: construction.id,
      createdById: creator.id,
    });
    other = await createFixture('other', { salesPersonId: outsider.id, createdById: outsider.id });
    npOwn = await createFixture('np-own', {
      salesPersonId: noPermissionInScope.id,
      createdById: noPermissionInScope.id,
    });
  });

  afterEach(async () => {
    // 各テストが作った契約書（使い捨て・作成の成功・ガードが外れたときの侵入）を片付け、
    // 各案件を beforeAll の時点の契約書 1 件へ戻す（テストの独立性）
    for (const fixture of [target, other, npOwn]) {
      await prisma.contract.updateMany({
        where: { projectId: fixture.projectId, parentContractId: { not: null } },
        data: { parentContractId: null },
      });
      await prisma.contract.deleteMany({
        where: { projectId: fixture.projectId, id: { not: fixture.contractId } },
      });
    }
  });

  afterAll(async () => {
    await cleanup();
  });

  describe('範囲内の利用者（13.1・13.2・14.1・14.7）', () => {
    /**
     * @requirement contract-management/REQ-13.1
     * @requirement contract-management/REQ-14.1
     * @requirement contract-management/REQ-14.7
     */
    it('営業担当者・工事担当者・作成者・全案件閲覧の権限の利用者は、一覧と詳細を従来どおり得られ、一覧には当該案件の契約書だけが載る', async () => {
      for (const user of [sales, construction, creator, readAll]) {
        const list = await request(app)
          .get(`/api/projects/${target.projectId}/contracts`)
          .set(...auth(user))
          .expect(200);
        const listedIds = list.body.contracts.map((c: { id: string }) => c.id);
        expect(listedIds).toEqual([target.contractId]);
        expect(listedIds).not.toContain(other.contractId);
        expect(list.body.total).toBe(1);

        const detail = await request(app)
          .get(`/api/contracts/${target.contractId}`)
          .set(...auth(user))
          .expect(200);
        expect(detail.body.projectId).toBe(target.projectId);
        expect(detail.body.estimate.name).toBe(target.estimateName);

        // 二重マウントでも、経路の案件と契約書の案件が一致すれば従来どおり
        await request(app)
          .get(`/api/projects/${target.projectId}/contracts/${target.contractId}`)
          .set(...auth(user))
          .expect(200);
      }
    });

    /**
     * @requirement contract-management/REQ-13.2
     * @requirement contract-management/REQ-14.1
     */
    it('関係者と全案件閲覧の権限の利用者は、自案件の見積書からの契約書の作成・更新・ステータスの変更・削除を行える', async () => {
      const created = await request(app)
        .post(`/api/projects/${target.projectId}/contracts`)
        .set(...auth(construction))
        .send({ ...createBody(target.estimateId), paymentTerms: `${MARK}-作成` })
        .expect(201);
      const createdId = created.body.id as string;
      expect(created.body.estimateId).toBe(target.estimateId);

      const updated = await request(app)
        .put(`/api/contracts/${createdId}`)
        .set(...auth(creator))
        .send({ ...updateBody(target.estimateId, 0), paymentTerms: `${MARK}-更新` })
        .expect(200);
      expect(updated.body.version).toBe(1);
      expect(updated.body.paymentTerms).toBe(`${MARK}-更新`);

      // 二重マウントでも、経路の案件と契約書の案件が一致すれば従来どおり
      const statusChanged = await request(app)
        .patch(`/api/projects/${target.projectId}/contracts/${createdId}/status`)
        .set(...auth(sales))
        .send({ status: 'CONTRACTED' })
        .expect(200);
      expect(statusChanged.body.status).toBe('CONTRACTED');
      await request(app)
        .patch(`/api/contracts/${createdId}/status`)
        .set(...auth(sales))
        .send({ status: 'BEFORE_CONTRACT' })
        .expect(200);

      await request(app)
        .delete(`/api/contracts/${createdId}`)
        .set(...auth(readAll))
        .expect(204);
      const deleted = await prisma.contract.findUniqueOrThrow({ where: { id: createdId } });
      expect(deleted.deletedAt).toBeInstanceOf(Date);
      await prisma.contract.delete({ where: { id: createdId } });
    });

    /**
     * 解決関数は論理的に取り除かれた契約書に案件 ID を返さない（design.md の「案件IDの解決関数」）。
     * 範囲の内外を問わず、存在しない契約書と同じ汎用の 404 になり、範囲外の拒否としては記録しない。
     *
     * @requirement contract-management/REQ-14.2
     * @requirement contract-management/REQ-14.3
     */
    it('論理的に取り除かれた契約書は、範囲の内外を問わず存在しない契約書と同じ汎用の 404 を返す', async () => {
      const deletedId = await createContract(target.projectId, target.estimateId, {
        deletedAt: new Date(),
      });

      const missing = await request(app)
        .get(`/api/contracts/${MISSING_ID}`)
        .set(...auth(sales))
        .expect(404);
      const deniedBefore = await deniedCount(outsider.id);
      for (const user of [sales, outsider]) {
        const response = await request(app)
          .get(`/api/contracts/${deletedId}`)
          .set(...auth(user))
          .expect(404);
        expect(response.body.code).toBe('NOT_FOUND');
        expect(withoutInstance(response.body)).toEqual(withoutInstance(missing.body));
      }
      expect((await deniedCount(outsider.id)) - deniedBefore).toBe(0);
      await prisma.contract.delete({ where: { id: deletedId } });
    });
  });

  describe('範囲外の ID 指定（13.1・13.2・13.4・14.2・14.3・14.7）', () => {
    /**
     * @requirement contract-management/REQ-13.1
     * @requirement contract-management/REQ-14.2
     * @requirement contract-management/REQ-14.3
     * @requirement contract-management/REQ-14.7
     */
    it('担当外の利用者の一覧・詳細は、存在しない ID と同じ 404 の本文になり、案件 ID も契約書 ID も返らない', async () => {
      const readPaths: Array<[string, string]> = [
        [`/api/projects/${target.projectId}/contracts`, `/api/projects/${MISSING_ID}/contracts`],
        [`/api/contracts/${target.contractId}`, `/api/contracts/${MISSING_ID}`],
        [
          `/api/projects/${target.projectId}/contracts/${target.contractId}`,
          `/api/projects/${target.projectId}/contracts/${MISSING_ID}`,
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
        expect(exposed, outOfScopePath).not.toContain(target.contractId);
        expect(exposed, outOfScopePath).not.toContain(target.estimateName);
      }
    });

    /**
     * プロジェクトの配下でないマウント（`/api/contracts`）から届く一覧と作成は、
     * 経路に案件が無いため ID の形式の検査の 400 で終わり、契約書を返さず作らない。
     *
     * @requirement contract-management/REQ-14.7
     */
    it('プロジェクトを指定しない一覧と作成は 400 で終わり、どの案件の契約書も返さず作らない', async () => {
      const intrusionBefore = await intrusionCount();
      const before = await snapshot(target);
      const list = await request(app)
        .get('/api/contracts')
        .set(...auth(readAll))
        .expect(400);
      const exposed = JSON.stringify(list.body);
      expect(exposed).not.toContain(target.contractId);
      expect(exposed).not.toContain(other.contractId);

      await request(app)
        .post('/api/contracts')
        .set(...auth(readAll))
        .send(createBody(target.estimateId))
        .expect(400);
      expect((await intrusionCount()) - intrusionBefore).toBe(0);
      expect(await snapshot(target)).toEqual(before);
    });

    /**
     * @requirement contract-management/REQ-13.2
     * @requirement contract-management/REQ-13.4
     * @requirement contract-management/REQ-14.2
     * @requirement contract-management/REQ-14.3
     */
    it('担当外の利用者の作成・更新・ステータスの変更・削除は、存在しない ID と同じ 404 の本文になり、データベースを変えない', async () => {
      const victimId = await disposable(target);
      const intrusionBefore = await intrusionCount();
      const before = await snapshot(target);
      const contract = await prisma.contract.findUniqueOrThrow({ where: { id: victimId } });

      type Ids = { project: string; contract: string };
      type Call = (id: Ids) => request.Test;
      const writes: Array<[string, Call]> = [
        [
          'POST contracts',
          (id) =>
            request(app)
              .post(`/api/projects/${id.project}/contracts`)
              .send(createBody(target.estimateId)),
        ],
        [
          'PUT contracts/:id',
          (id) =>
            request(app)
              .put(`/api/contracts/${id.contract}`)
              .send(updateBody(target.estimateId, contract.version)),
        ],
        [
          'PATCH contracts/:id/status',
          (id) =>
            request(app)
              .patch(`/api/contracts/${id.contract}/status`)
              .send({ status: 'CONTRACTED' }),
        ],
        ['DELETE contracts/:id', (id) => request(app).delete(`/api/contracts/${id.contract}`)],
      ];

      for (const [label, call] of writes) {
        const missing = await call({ project: MISSING_ID, contract: MISSING_ID })
          .set(...auth(outsider))
          .expect(404);
        const outOfScope = await call({ project: target.projectId, contract: victimId })
          .set(...auth(outsider))
          .expect(404);
        expect(outOfScope.body.code, label).toBe('NOT_FOUND');
        expect(withoutInstance(outOfScope.body), label).toEqual(withoutInstance(missing.body));
        const exposed = JSON.stringify(withoutInstance(outOfScope.body));
        expect(exposed, label).not.toContain(target.projectId);
        expect(exposed, label).not.toContain(victimId);
      }

      expect(await snapshot(target)).toEqual(before);
      expect((await intrusionCount()) - intrusionBefore).toBe(0);
    });

    /**
     * @requirement contract-management/REQ-14.2
     */
    it('範囲外のアクセスは要求ごとに PROJECT_SCOPE_DENIED として記録され、不在の ID の要求は記録されない', async () => {
      const before = await deniedCount(outsider.id, target.projectId);
      const paths = [
        `/api/projects/${target.projectId}/contracts`,
        `/api/contracts/${target.contractId}`,
        `/api/projects/${target.projectId}/contracts/${target.contractId}`,
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
        .get(`/api/contracts/${MISSING_ID}`)
        .set(...auth(outsider))
        .expect(404);
      await request(app)
        .get(`/api/projects/${MISSING_ID}/contracts`)
        .set(...auth(outsider))
        .expect(404);
      expect((await deniedCount(outsider.id)) - deniedBefore).toBe(0);
    });

    /**
     * 範囲外の権限なしの利用者（noPermission）と、自分が営業担当者・作成者である案件の範囲内の権限なしの利用者
     * （noPermissionInScope）の両方で、範囲の判定より先に 403 になることを確かめる。
     *
     * @requirement contract-management/REQ-13.4
     */
    it('権限を持たない利用者には、範囲の内外にかかわらず範囲の判定より先に権限なしの 403 を返し、データを変えず、範囲外の拒否としては記録しない', async () => {
      const cases: Array<[string, TestUser, Fixture]> = [
        ['範囲外の権限なし', noPermission, target],
        ['範囲内の権限なし', noPermissionInScope, npOwn],
      ];
      for (const [label, user, fixture] of cases) {
        const victimId = await disposable(fixture);
        const intrusionBefore = await intrusionCount();
        const before = await snapshot(fixture);
        const deniedBefore = await deniedCount(user.id);
        const responses = [
          await request(app)
            .get(`/api/projects/${fixture.projectId}/contracts`)
            .set(...auth(user)),
          await request(app)
            .get(`/api/contracts/${victimId}`)
            .set(...auth(user)),
          await request(app)
            .get(`/api/contracts/${MISSING_ID}`)
            .set(...auth(user)),
          await request(app)
            .post(`/api/projects/${fixture.projectId}/contracts`)
            .set(...auth(user))
            .send(createBody(fixture.estimateId)),
          await request(app)
            .put(`/api/contracts/${victimId}`)
            .set(...auth(user))
            .send(updateBody(fixture.estimateId, 0)),
          await request(app)
            .patch(`/api/contracts/${victimId}/status`)
            .set(...auth(user))
            .send({ status: 'CONTRACTED' }),
          await request(app)
            .delete(`/api/contracts/${victimId}`)
            .set(...auth(user)),
        ];
        for (const response of responses) {
          expect(response.status, label).toBe(403);
          expect(response.body.code, label).not.toBe('NOT_FOUND');
        }
        expect(await snapshot(fixture), label).toEqual(before);
        expect((await intrusionCount()) - intrusionBefore, label).toBe(0);
        // 権限なしは範囲の判定に届かないため、範囲外の拒否としては記録しない
        expect((await deniedCount(user.id)) - deniedBefore, label).toBe(0);
      }
    });
  });

  describe('プロジェクトの配下の経路の所属の照合（14.4）', () => {
    /**
     * @requirement contract-management/REQ-14.4
     */
    it('経路の案件と契約書の案件が食い違うと、範囲内どうしでも契約書の不在と同じ 404 にし、データを変えず、記録しない', async () => {
      const deniedBefore = await deniedCount(readAll.id);
      const missing = await request(app)
        .get(`/api/projects/${other.projectId}/contracts/${MISSING_ID}`)
        .set(...auth(readAll))
        .expect(404);
      const mismatched = await request(app)
        .get(`/api/projects/${other.projectId}/contracts/${target.contractId}`)
        .set(...auth(readAll))
        .expect(404);
      expect(mismatched.body.code).toBe('NOT_FOUND');
      expect(withoutInstance(mismatched.body)).toEqual(withoutInstance(missing.body));
      const exposed = JSON.stringify(withoutInstance(mismatched.body));
      expect(exposed).not.toContain(target.projectId);
      expect(exposed).not.toContain(target.contractId);

      const victimId = await disposable(target);
      const before = await snapshot(target);
      const contract = await prisma.contract.findUniqueOrThrow({ where: { id: victimId } });
      const base = `/api/projects/${other.projectId}/contracts/${victimId}`;
      const responses = [
        await request(app)
          .put(base)
          .set(...auth(readAll))
          .send(updateBody(target.estimateId, contract.version)),
        await request(app)
          .patch(`${base}/status`)
          .set(...auth(readAll))
          .send({ status: 'CONTRACTED' }),
        await request(app)
          .delete(base)
          .set(...auth(readAll)),
      ];
      for (const response of responses) {
        expect(response.status).toBe(404);
        expect(response.body.code).toBe('NOT_FOUND');
      }
      expect(await snapshot(target)).toEqual(before);
      // 食い違いは不在の扱いのため、範囲外の拒否としては記録しない
      expect((await deniedCount(readAll.id)) - deniedBefore).toBe(0);
    });

    /**
     * 経路の案件が実行者の範囲内でも、範囲外の案件の契約書を経路に載せて読み書きできない。
     *
     * @requirement contract-management/REQ-14.4
     */
    it('範囲内の案件の配下の経路で範囲外の案件の契約書を指すと、契約書の不在と同じ 404 にし、データを変えず、記録しない', async () => {
      const victimId = await disposable(other);
      const beforeOther = await snapshot(other);
      const deniedBefore = await deniedCount(sales.id);
      const missing = await request(app)
        .get(`/api/projects/${target.projectId}/contracts/${MISSING_ID}`)
        .set(...auth(sales))
        .expect(404);
      const base = `/api/projects/${target.projectId}/contracts/${victimId}`;
      const contract = await prisma.contract.findUniqueOrThrow({ where: { id: victimId } });
      const responses = [
        await request(app)
          .get(base)
          .set(...auth(sales)),
        await request(app)
          .put(base)
          .set(...auth(sales))
          .send(updateBody(target.estimateId, contract.version)),
        await request(app)
          .patch(`${base}/status`)
          .set(...auth(sales))
          .send({ status: 'CONTRACTED' }),
        await request(app)
          .delete(base)
          .set(...auth(sales)),
      ];
      for (const response of responses) {
        expect(response.status).toBe(404);
        expect(withoutInstance(response.body)).toEqual(withoutInstance(missing.body));
      }
      expect(await snapshot(other)).toEqual(beforeOther);
      expect((await deniedCount(sales.id)) - deniedBefore).toBe(0);
    });
  });

  describe('作成・更新の要求が指す見積書（14.5）', () => {
    /**
     * @requirement contract-management/REQ-14.5
     */
    it('作成の要求が範囲外の案件の見積書を指すと、存在しない見積書と同じ 404 の本文になり、契約書を作成せず、範囲外の拒否として記録する', async () => {
      const intrusionBefore = await intrusionCount();
      const beforeTarget = await snapshot(target);
      const beforeOther = await snapshot(other);
      const deniedBefore = await deniedCount(sales.id, other.projectId);

      const missing = await request(app)
        .post(`/api/projects/${target.projectId}/contracts`)
        .set(...auth(sales))
        .send(createBody(MISSING_ID))
        .expect(404);
      const foreign = await request(app)
        .post(`/api/projects/${target.projectId}/contracts`)
        .set(...auth(sales))
        .send(createBody(other.estimateId))
        .expect(404);

      expect(missing.body.code).toBe('ESTIMATE_NOT_FOUND');
      expect(foreign.body.code).toBe('ESTIMATE_NOT_FOUND');
      // 本文は要求が指した見積書の ID を写すため、それを置き換えて比べる
      expect(maskId(foreign.body, other.estimateId)).toEqual(maskId(missing.body, MISSING_ID));
      const exposed = JSON.stringify(foreign.body);
      expect(exposed).not.toContain(other.projectId);
      expect(exposed).not.toContain(other.estimateName);

      expect(await snapshot(target)).toEqual(beforeTarget);
      expect(await snapshot(other)).toEqual(beforeOther);
      expect((await intrusionCount()) - intrusionBefore).toBe(0);
      expect(
        (await deniedCount(sales.id, other.projectId)) - deniedBefore,
        '範囲外の案件の見積書は範囲外の拒否として 1 回記録する'
      ).toBe(1);
    });

    /**
     * 照合は閲覧範囲でなく契約書のプロジェクトへの所属で行う。全案件閲覧の権限の利用者でも、
     * 他のプロジェクトの見積書からは契約書を作れない（範囲内のため範囲外の拒否としては記録しない）。
     * 他のプロジェクトの論理削除済みの見積書も同じ 404 にする（同じプロジェクトの論理削除済みの 422 と分ける）。
     *
     * @requirement contract-management/REQ-14.5
     */
    it('作成の要求が範囲内の他のプロジェクトの見積書（論理削除済みを含む）を指しても、存在しない見積書と同じ 404 の本文になり、契約書を作成せず、記録しない', async () => {
      const deletedForeign = await prisma.estimate.create({
        data: { projectId: other.projectId, name: `${MARK}-other-削除済み`, deletedAt: new Date() },
        select: { id: true },
      });
      const intrusionBefore = await intrusionCount();
      const beforeTarget = await snapshot(target);
      const deniedBefore = await deniedCount(readAll.id);

      const missing = await request(app)
        .post(`/api/projects/${target.projectId}/contracts`)
        .set(...auth(readAll))
        .send(createBody(MISSING_ID))
        .expect(404);
      for (const foreignId of [other.estimateId, deletedForeign.id]) {
        const foreign = await request(app)
          .post(`/api/projects/${target.projectId}/contracts`)
          .set(...auth(readAll))
          .send(createBody(foreignId))
          .expect(404);
        expect(foreign.body.code).toBe('ESTIMATE_NOT_FOUND');
        expect(maskId(foreign.body, foreignId)).toEqual(maskId(missing.body, MISSING_ID));
      }

      expect(await snapshot(target)).toEqual(beforeTarget);
      expect((await intrusionCount()) - intrusionBefore).toBe(0);
      expect((await deniedCount(readAll.id)) - deniedBefore).toBe(0);
      await prisma.estimate.delete({ where: { id: deletedForeign.id } });
    });

    /**
     * @requirement contract-management/REQ-14.5
     */
    it('更新の要求が範囲外の案件の見積書を指すと、存在しない見積書と同じ 404 の本文になり、契約書を更新せず、範囲外の拒否として記録する', async () => {
      const victimId = await disposable(target);
      const contract = await prisma.contract.findUniqueOrThrow({ where: { id: victimId } });
      const beforeTarget = await snapshot(target);
      const deniedBefore = await deniedCount(creator.id, other.projectId);

      const missing = await request(app)
        .put(`/api/contracts/${victimId}`)
        .set(...auth(creator))
        .send(updateBody(MISSING_ID, contract.version))
        .expect(404);
      const foreign = await request(app)
        .put(`/api/contracts/${victimId}`)
        .set(...auth(creator))
        .send(updateBody(other.estimateId, contract.version))
        .expect(404);

      expect(foreign.body.code).toBe('ESTIMATE_NOT_FOUND');
      expect(maskId(foreign.body, other.estimateId)).toEqual(maskId(missing.body, MISSING_ID));
      expect(JSON.stringify(foreign.body)).not.toContain(other.projectId);
      expect(await snapshot(target)).toEqual(beforeTarget);
      expect((await deniedCount(creator.id, other.projectId)) - deniedBefore).toBe(1);
    });

    /**
     * @requirement contract-management/REQ-14.5
     */
    it('更新の要求が範囲内の他のプロジェクトの見積書を指しても、存在しない見積書と同じ 404 の本文になり、契約書を更新せず、記録しない', async () => {
      const victimId = await disposable(target);
      const contract = await prisma.contract.findUniqueOrThrow({ where: { id: victimId } });
      const beforeTarget = await snapshot(target);
      const deniedBefore = await deniedCount(readAll.id);

      const missing = await request(app)
        .put(`/api/contracts/${victimId}`)
        .set(...auth(readAll))
        .send(updateBody(MISSING_ID, contract.version))
        .expect(404);
      const foreign = await request(app)
        .put(`/api/contracts/${victimId}`)
        .set(...auth(readAll))
        .send(updateBody(other.estimateId, contract.version))
        .expect(404);

      expect(maskId(foreign.body, other.estimateId)).toEqual(maskId(missing.body, MISSING_ID));
      expect(await snapshot(target)).toEqual(beforeTarget);
      expect((await deniedCount(readAll.id)) - deniedBefore).toBe(0);
    });
  });

  describe('変更契約の作成の要求が指す基となる契約書（14.6）', () => {
    /**
     * 基となる契約書の不在と他のプロジェクトの契約書は、従来から同じ 422 と同じ本文である。
     * これを受入基準として固定する（応答の形は変えない）。範囲外の案件の契約書のときだけ範囲外の拒否として記録する。
     *
     * @requirement contract-management/REQ-14.6
     */
    it('変更契約の作成の要求が範囲外の案件の契約書を基に指すと、存在しない基となる契約書と同じ 422 の本文になり、契約書を作成せず、範囲外の拒否として記録する', async () => {
      const intrusionBefore = await intrusionCount();
      const beforeTarget = await snapshot(target);
      const beforeOther = await snapshot(other);
      const deniedBefore = await deniedCount(sales.id, other.projectId);

      const missing = await request(app)
        .post(`/api/projects/${target.projectId}/contracts`)
        .set(...auth(sales))
        .send(createBody(target.estimateId, { parentContractId: MISSING_ID }))
        .expect(422);
      const foreign = await request(app)
        .post(`/api/projects/${target.projectId}/contracts`)
        .set(...auth(sales))
        .send(createBody(target.estimateId, { parentContractId: other.contractId }))
        .expect(422);

      expect(missing.body.code).toBe('CONTRACT_VALIDATION_ERROR');
      expect(foreign.body).toEqual(missing.body);
      const exposed = JSON.stringify(foreign.body);
      expect(exposed).not.toContain(other.projectId);
      expect(exposed).not.toContain(other.contractId);

      expect(await snapshot(target)).toEqual(beforeTarget);
      expect(await snapshot(other)).toEqual(beforeOther);
      expect((await intrusionCount()) - intrusionBefore).toBe(0);
      expect((await deniedCount(sales.id, other.projectId)) - deniedBefore).toBe(1);
    });

    /**
     * @requirement contract-management/REQ-14.6
     */
    it('変更契約の作成の要求が範囲内の他のプロジェクトの契約書を基に指しても、存在しない基となる契約書と同じ 422 の本文になり、契約書を作成せず、記録しない', async () => {
      const intrusionBefore = await intrusionCount();
      const beforeTarget = await snapshot(target);
      const deniedBefore = await deniedCount(readAll.id);

      const missing = await request(app)
        .post(`/api/projects/${target.projectId}/contracts`)
        .set(...auth(readAll))
        .send(createBody(target.estimateId, { parentContractId: MISSING_ID }))
        .expect(422);
      const foreign = await request(app)
        .post(`/api/projects/${target.projectId}/contracts`)
        .set(...auth(readAll))
        .send(createBody(target.estimateId, { parentContractId: other.contractId }))
        .expect(422);

      expect(foreign.body).toEqual(missing.body);
      expect(await snapshot(target)).toEqual(beforeTarget);
      expect((await intrusionCount()) - intrusionBefore).toBe(0);
      expect((await deniedCount(readAll.id)) - deniedBefore).toBe(0);
    });
  });
});
