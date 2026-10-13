/**
 * @fileoverview 数量グループの並び順の個別 API が displayOrder を重ねないことの統合検証（Task 92.1）
 *
 * 対象は数量グループの displayOrder を書く個別 API の3経路である。いずれも
 * 「同一数量表の2つのグループが同じ displayOrder を持つ状態」を作らせない。
 *
 * 1. POST /api/quantity-tables/:quantityTableId/groups        （新規作成）
 * 2. PUT  /api/quantity-tables/:quantityTableId/groups/order  （並び順の一括更新）
 * 3. PUT  /api/quantity-groups/:id                            （単体更新）
 *
 * いずれも画面からは到達しない（永続化は PUT /api/quantity-tables/:id/save に畳まれる。
 * Task 88.1 の実測）。到達するのは認証済みの HTTP クライアントだけである。
 *
 * 重なりの原因は並行ではなく呼び出し側が渡す値そのものであるため、行ロックでは防げない
 * （Task 88.1 の決着）。本検証は逐次の要求だけで構成する。
 *
 * 採番の既定は「件数」ではなく「最大値 + 1」である。削除は採番を詰めないため、
 * 件数を既定にすると空き番号のある数量表で既存と重なる。
 *
 * @module __tests__/integration/quantity-group-display-order.api.integration.test
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { validateEnv } from '../../config/env.js';
import type { PrismaClient } from '../../generated/prisma/client.js';

// 環境変数を初期化（モジュールインポート前に実行）
validateEnv();

import app from '../../app.js';
import getPrismaClient from '../../db.js';
import redis, { initRedis } from '../../redis.js';
import { seedRoles, seedPermissions, seedRolePermissions } from '../../utils/seed-helpers.js';

const TEST_EMAIL = 'test-qg-display-order-integration@example.com';
const PASSWORD = 'TestPassword123!';

describe('数量グループの並び順の個別 API の displayOrder 重複（Task 92.1）', () => {
  let prisma: PrismaClient;
  let accessToken: string;
  let testUserId: string;
  let testProjectId: string;

  const loginTestUser = async (): Promise<{ token: string; userId: string }> => {
    const passwordHash = await (
      await import('@node-rs/argon2')
    ).hash(PASSWORD, {
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4,
    });

    const user = await prisma.user.create({
      data: {
        email: TEST_EMAIL,
        displayName: 'Quantity Group Display Order Test User',
        passwordHash,
      },
    });

    const userRole = await prisma.role.findUnique({ where: { name: 'user' } });

    if (userRole) {
      await prisma.userRole.create({
        data: { userId: user.id, roleId: userRole.id },
      });
    }

    await prisma.permission.createMany({
      data: [
        { resource: 'quantity_table', action: 'create', description: '数量表の作成' },
        { resource: 'quantity_table', action: 'read', description: '数量表の閲覧' },
        { resource: 'quantity_table', action: 'update', description: '数量表の更新' },
        { resource: 'quantity_table', action: 'delete', description: '数量表の削除' },
      ],
      skipDuplicates: true,
    });

    const permissions = await prisma.permission.findMany({
      where: {
        OR: [
          { resource: 'project', action: { in: ['create', 'read', 'update', 'delete'] } },
          { resource: 'quantity_table', action: { in: ['create', 'read', 'update', 'delete'] } },
        ],
      },
    });

    if (userRole && permissions.length > 0) {
      await prisma.rolePermission.createMany({
        data: permissions.map((permission) => ({
          roleId: userRole.id,
          permissionId: permission.id,
        })),
        skipDuplicates: true,
      });
    }

    const response = await request(app).post('/api/v1/auth/login').send({
      email: TEST_EMAIL,
      password: PASSWORD,
    });

    return { token: response.body.accessToken, userId: user.id };
  };

  /** 数量表を1件作る（グループは0件） */
  const createQuantityTable = async (name: string): Promise<string> => {
    const table = await prisma.quantityTable.create({
      data: { projectId: testProjectId, name },
    });
    return table.id;
  };

  /** POST /groups でグループを1件作る（body をそのまま送る） */
  const postGroup = async (
    quantityTableId: string,
    body: Record<string, unknown>
  ): Promise<request.Response> =>
    await request(app)
      .post(`/api/quantity-tables/${quantityTableId}/groups`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send(body);

  /** 当該数量表のグループを displayOrder 昇順で読む */
  const readOrders = async (
    quantityTableId: string
  ): Promise<Array<{ name: string | null; displayOrder: number }>> =>
    await prisma.quantityGroup.findMany({
      where: { quantityTableId },
      select: { name: true, displayOrder: true },
      orderBy: { displayOrder: 'asc' },
    });

  /** displayOrder に重なりが無いこと（母集団が空でないことも同時に主張する） */
  const expectNoOverlap = (rows: Array<{ displayOrder: number }>): void => {
    expect(rows.length).toBeGreaterThan(0);
    const orders = rows.map((r) => r.displayOrder);
    expect(new Set(orders).size).toBe(orders.length);
  };

  beforeAll(async () => {
    prisma = getPrismaClient();
    await initRedis();
    await seedRoles(prisma);
    await seedPermissions(prisma);
    await seedRolePermissions(prisma);

    const auth = await loginTestUser();
    accessToken = auth.token;
    testUserId = auth.userId;

    const project = await prisma.project.create({
      data: {
        name: 'テスト用プロジェクト_グループ並び順重複',
        status: 'PREPARING',
        salesPersonId: testUserId,
        createdById: testUserId,
      },
    });
    testProjectId = project.id;
  });

  afterAll(async () => {
    if (testProjectId) {
      await prisma.project.deleteMany({ where: { id: testProjectId } });
    }
    await prisma.user.deleteMany({ where: { email: TEST_EMAIL } });
    await prisma.$disconnect();
    redis.disconnect();
  });

  beforeEach(async () => {
    if (testProjectId) {
      await prisma.quantityTable.deleteMany({ where: { projectId: testProjectId } });
    }
  });

  describe('POST /api/quantity-tables/:quantityTableId/groups', () => {
    it('displayOrder を省いた作成は末尾へ採番され、既存の先頭と重ならない', async () => {
      const tableId = await createQuantityTable('省略時の採番');
      expect((await postGroup(tableId, { name: 'A', displayOrder: 0 })).status).toBe(201);
      expect((await postGroup(tableId, { name: 'B', displayOrder: 1 })).status).toBe(201);

      // displayOrder を省く（既定の採番に委ねる）
      const response = await postGroup(tableId, { name: 'C' });

      expect(response.status).toBe(201);
      expect(response.body.displayOrder).toBe(2);
      expectNoOverlap(await readOrders(tableId));
    });

    it('空の数量表への省略した作成は 0 から始まる（対照）', async () => {
      const tableId = await createQuantityTable('空の数量表への採番');

      const response = await postGroup(tableId, { name: 'A' });

      expect(response.status).toBe(201);
      expect(response.body.displayOrder).toBe(0);
    });

    it('途中を削除して空き番号が生じた後でも、省略した作成は既存と重ならない', async () => {
      const tableId = await createQuantityTable('空き番号のある数量表への採番');
      expect((await postGroup(tableId, { name: 'A', displayOrder: 0 })).status).toBe(201);
      const middle = await postGroup(tableId, { name: 'B', displayOrder: 1 });
      expect(middle.status).toBe(201);
      expect((await postGroup(tableId, { name: 'C', displayOrder: 2 })).status).toBe(201);

      // 中間の 1 を削除する。削除は後続の採番を詰めないので 0 と 2 が残る
      const deleteResponse = await request(app)
        .delete(`/api/quantity-groups/${middle.body.id}`)
        .set('Authorization', `Bearer ${accessToken}`);
      expect(deleteResponse.status).toBe(204);
      expect((await readOrders(tableId)).map((r) => r.displayOrder)).toEqual([0, 2]);

      // 残存2件に対し、件数を既定にすると 2 になり末尾の 2 と重なる
      const response = await postGroup(tableId, { name: 'D' });

      expect(response.status).toBe(201);
      expect(response.body.displayOrder).toBe(3);
      expectNoOverlap(await readOrders(tableId));
    });

    it('既存グループと同じ displayOrder を明示した作成は 400 で拒まれ、作成されない', async () => {
      const tableId = await createQuantityTable('明示した重複の作成');
      expect((await postGroup(tableId, { name: 'A', displayOrder: 0 })).status).toBe(201);

      const response = await postGroup(tableId, { name: 'B', displayOrder: 0 });

      expect(response.status).toBe(400);
      expect(response.body.code).toBe('QUANTITY_TABLE_VALIDATION_ERROR');

      expect(await readOrders(tableId)).toEqual([{ name: 'A', displayOrder: 0 }]);
    });

    it('既存と重ならない displayOrder を明示した作成は従来どおり 201（対照）', async () => {
      const tableId = await createQuantityTable('明示した非重複の作成');
      expect((await postGroup(tableId, { name: 'A', displayOrder: 0 })).status).toBe(201);

      const response = await postGroup(tableId, { name: 'B', displayOrder: 5 });

      expect(response.status).toBe(201);
      expect(response.body.displayOrder).toBe(5);
      expectNoOverlap(await readOrders(tableId));
    });
  });

  describe('PUT /api/quantity-tables/:quantityTableId/groups/order', () => {
    /** displayOrder を明示してグループを1件作り、ID を返す */
    const createGroup = async (
      tableId: string,
      name: string,
      displayOrder: number
    ): Promise<string> => {
      const response = await postGroup(tableId, { name, displayOrder });
      expect(response.status).toBe(201);
      return response.body.id;
    };

    const putOrder = async (
      tableId: string,
      orderUpdates: Array<{ id: string; displayOrder: number }>
    ): Promise<request.Response> =>
      await request(app)
        .put(`/api/quantity-tables/${tableId}/groups/order`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ orderUpdates });

    it('同じ displayOrder を2件送る並び替えは 400 で拒まれ、並びは変わらない', async () => {
      const tableId = await createQuantityTable('要求内の重複');
      const idA = await createGroup(tableId, 'A', 0);
      const idB = await createGroup(tableId, 'B', 1);

      const response = await putOrder(tableId, [
        { id: idA, displayOrder: 0 },
        { id: idB, displayOrder: 0 },
      ]);

      expect(response.status).toBe(400);
      expect(response.body.code).toBe('QUANTITY_TABLE_VALIDATION_ERROR');
      expect(await readOrders(tableId)).toEqual([
        { name: 'A', displayOrder: 0 },
        { name: 'B', displayOrder: 1 },
      ]);
    });

    it('要求に含めなかった既存グループと重なる並び替えも 400 で拒まれる', async () => {
      const tableId = await createQuantityTable('要求外との重複');
      const idA = await createGroup(tableId, 'A', 0);
      await createGroup(tableId, 'B', 1);
      await createGroup(tableId, 'C', 2);

      // A だけを 1 へ動かすと、要求に含めていない B（=1）と重なる
      const response = await putOrder(tableId, [{ id: idA, displayOrder: 1 }]);

      expect(response.status).toBe(400);
      expect(response.body.code).toBe('QUANTITY_TABLE_VALIDATION_ERROR');
      expect(await readOrders(tableId)).toEqual([
        { name: 'A', displayOrder: 0 },
        { name: 'B', displayOrder: 1 },
        { name: 'C', displayOrder: 2 },
      ]);
    });

    it('重ならない入れ替えは従来どおり 204 で反映される（対照）', async () => {
      const tableId = await createQuantityTable('重ならない入れ替え');
      const idA = await createGroup(tableId, 'A', 0);
      const idB = await createGroup(tableId, 'B', 1);

      const response = await putOrder(tableId, [
        { id: idA, displayOrder: 1 },
        { id: idB, displayOrder: 0 },
      ]);

      expect(response.status).toBe(204);
      expect(await readOrders(tableId)).toEqual([
        { name: 'B', displayOrder: 0 },
        { name: 'A', displayOrder: 1 },
      ]);
    });
  });

  describe('PUT /api/quantity-groups/:id', () => {
    it('他のグループと同じ displayOrder への更新は 400 で拒まれ、値は変わらない', async () => {
      const tableId = await createQuantityTable('単体更新の重複');
      const created = await postGroup(tableId, { name: 'A', displayOrder: 0 });
      expect(created.status).toBe(201);
      expect((await postGroup(tableId, { name: 'B', displayOrder: 1 })).status).toBe(201);

      const response = await request(app)
        .put(`/api/quantity-groups/${created.body.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ displayOrder: 1, expectedUpdatedAt: created.body.updatedAt });

      expect(response.status).toBe(400);
      expect(response.body.code).toBe('QUANTITY_TABLE_VALIDATION_ERROR');
      expect(await readOrders(tableId)).toEqual([
        { name: 'A', displayOrder: 0 },
        { name: 'B', displayOrder: 1 },
      ]);
    });

    it('空いている displayOrder への更新は従来どおり 200（対照）', async () => {
      const tableId = await createQuantityTable('単体更新の非重複');
      const created = await postGroup(tableId, { name: 'A', displayOrder: 0 });
      expect(created.status).toBe(201);
      expect((await postGroup(tableId, { name: 'B', displayOrder: 1 })).status).toBe(201);

      const response = await request(app)
        .put(`/api/quantity-groups/${created.body.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ displayOrder: 2, expectedUpdatedAt: created.body.updatedAt });

      expect(response.status).toBe(200);
      expect(response.body.displayOrder).toBe(2);
      expectNoOverlap(await readOrders(tableId));
    });

    it('自分自身の現在の displayOrder を指す更新は 200（自己重複と判定しない）', async () => {
      const tableId = await createQuantityTable('単体更新の自己参照');
      const created = await postGroup(tableId, { name: 'A', displayOrder: 0 });
      expect(created.status).toBe(201);

      const response = await request(app)
        .put(`/api/quantity-groups/${created.body.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'A2', displayOrder: 0, expectedUpdatedAt: created.body.updatedAt });

      expect(response.status).toBe(200);
      expect(response.body.name).toBe('A2');
      expect(response.body.displayOrder).toBe(0);
    });
  });
});
