/**
 * @fileoverview 数量項目の並び順の個別 API が displayOrder を重ねないことの統合検証（Task 92.3）
 *
 * 対象は数量項目の displayOrder を書く個別 API である。いずれも「同一グループの2つの項目が
 * 同じ displayOrder を持つ状態」を作らせない。
 *
 * 1. POST   /api/quantity-groups/:groupId/items       （新規作成）
 * 2. PUT    /api/quantity-groups/:groupId/items/order （並び順の一括更新）
 * 3. PUT    /api/quantity-items/:id                   （単体更新）
 * 4. POST   /api/quantity-items/:id/copy              （複製。採番のみ）
 * 5. POST   /api/quantity-items/:id/move              （移動）
 *
 * いずれも画面からは到達しない（永続化は PUT /api/quantity-tables/:id/save に畳まれる。
 * Task 92.3 が再実測し、本番の呼び出し元は 0 ファイルである）。到達するのは認証済みの
 * HTTP クライアントと受入検証の前提条件だけである。
 *
 * 重なりの原因は並行ではなく呼び出し側が渡す値と件数による採番である（Task 88.1 / 92.1 の
 * 決着）。本検証は逐次の要求だけで構成する。
 *
 * 採番の既定は「件数」ではなく「最大値 + 1」である。削除は採番を詰めないため、件数を既定に
 * すると空き番号のあるグループで既存と重なる。
 *
 * @module __tests__/integration/quantity-item-display-order.api.integration.test
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
import { loginForAccessToken } from './auth-login-client.js';
import { createTestUser } from './test-user-factory.js';

const TEST_EMAIL = 'test-qi-display-order-integration@example.com';
const PASSWORD = 'TestPassword123!';

describe('数量項目の並び順の個別 API の displayOrder 重複（Task 92.3）', () => {
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

    const user = await createTestUser(prisma, {
      email: TEST_EMAIL,
      displayName: 'Quantity Item Display Order Test User',
      passwordHash,
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

    const accessToken = await loginForAccessToken(app, {
      email: TEST_EMAIL,
      password: PASSWORD,
    });

    return { token: accessToken, userId: user.id };
  };

  /** 数量表と数量グループを1件ずつ作る（項目は0件）。返すのはグループIDである */
  const createGroup = async (name: string): Promise<{ tableId: string; groupId: string }> => {
    const table = await prisma.quantityTable.create({
      data: { projectId: testProjectId, name },
    });
    const group = await prisma.quantityGroup.create({
      data: { quantityTableId: table.id, name: `${name}のグループ`, displayOrder: 0 },
    });
    return { tableId: table.id, groupId: group.id };
  };

  /** POST /items で項目を1件作る（body の必須欄を補って送る） */
  const postItem = async (
    groupId: string,
    body: Record<string, unknown>
  ): Promise<request.Response> =>
    await request(app)
      .post(`/api/quantity-groups/${groupId}/items`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        majorCategory: '土工事',
        workType: '掘削',
        unit: 'm3',
        quantity: 1,
        calculationMethod: 'STANDARD',
        adjustmentFactor: 1.0,
        roundingUnit: 0.01,
        ...body,
      });

  /** 当該グループの項目を displayOrder 昇順で読む */
  const readOrders = async (
    groupId: string
  ): Promise<Array<{ name: string; displayOrder: number }>> =>
    await prisma.quantityItem.findMany({
      where: { quantityGroupId: groupId },
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
        name: 'テスト用プロジェクト_項目並び順重複',
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

  describe('POST /api/quantity-groups/:groupId/items', () => {
    it('displayOrder を省いた作成は末尾へ採番され、既存の先頭と重ならない', async () => {
      const { groupId } = await createGroup('省略時の採番');
      expect((await postItem(groupId, { name: 'A', displayOrder: 0 })).status).toBe(201);
      expect((await postItem(groupId, { name: 'B', displayOrder: 1 })).status).toBe(201);

      // displayOrder を省く（既定の採番に委ねる）
      const response = await postItem(groupId, { name: 'C' });

      expect(response.status).toBe(201);
      expect(response.body.displayOrder).toBe(2);
      expectNoOverlap(await readOrders(groupId));
    });

    it('空のグループへの省略した作成は 0 から始まる（対照）', async () => {
      const { groupId } = await createGroup('空のグループへの採番');

      const response = await postItem(groupId, { name: 'A' });

      expect(response.status).toBe(201);
      expect(response.body.displayOrder).toBe(0);
    });

    it('途中を削除して空き番号が生じた後でも、省略した作成は既存と重ならない', async () => {
      const { groupId } = await createGroup('空き番号のあるグループへの採番');
      expect((await postItem(groupId, { name: 'A', displayOrder: 0 })).status).toBe(201);
      const middle = await postItem(groupId, { name: 'B', displayOrder: 1 });
      expect(middle.status).toBe(201);
      expect((await postItem(groupId, { name: 'C', displayOrder: 2 })).status).toBe(201);

      // 中間の 1 を削除する。削除は後続の採番を詰めないので 0 と 2 が残る
      const deleteResponse = await request(app)
        .delete(`/api/quantity-items/${middle.body.id}`)
        .set('Authorization', `Bearer ${accessToken}`);
      expect(deleteResponse.status).toBe(204);
      expect((await readOrders(groupId)).map((r) => r.displayOrder)).toEqual([0, 2]);

      // 残存2件に対し、件数を既定にすると 2 になり末尾の 2 と重なる
      const response = await postItem(groupId, { name: 'D' });

      expect(response.status).toBe(201);
      expect(response.body.displayOrder).toBe(3);
      expectNoOverlap(await readOrders(groupId));
    });

    it('既存項目と同じ displayOrder を明示した作成は 400 で拒まれ、作成されない', async () => {
      const { groupId } = await createGroup('明示した重複の作成');
      expect((await postItem(groupId, { name: 'A', displayOrder: 0 })).status).toBe(201);

      const response = await postItem(groupId, { name: 'B', displayOrder: 0 });

      expect(response.status).toBe(400);
      expect(response.body.code).toBe('QUANTITY_TABLE_VALIDATION_ERROR');

      expect(await readOrders(groupId)).toEqual([{ name: 'A', displayOrder: 0 }]);
    });

    it('既存と重ならない displayOrder を明示した作成は従来どおり 201（対照）', async () => {
      const { groupId } = await createGroup('明示した非重複の作成');
      expect((await postItem(groupId, { name: 'A', displayOrder: 0 })).status).toBe(201);

      const response = await postItem(groupId, { name: 'B', displayOrder: 5 });

      expect(response.status).toBe(201);
      expect(response.body.displayOrder).toBe(5);
      expectNoOverlap(await readOrders(groupId));
    });
  });

  describe('PUT /api/quantity-groups/:groupId/items/order', () => {
    const putOrder = async (
      groupId: string,
      orderUpdates: Array<{ id: string; displayOrder: number }>
    ): Promise<request.Response> =>
      await request(app)
        .put(`/api/quantity-groups/${groupId}/items/order`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ orderUpdates });

    const createItem = async (
      groupId: string,
      name: string,
      displayOrder: number
    ): Promise<string> => {
      const response = await postItem(groupId, { name, displayOrder });
      expect(response.status).toBe(201);
      return response.body.id;
    };

    it('同じ displayOrder を2件送る並び替えは 400 で拒まれ、並びは変わらない', async () => {
      const { groupId } = await createGroup('要求内の重複');
      const idA = await createItem(groupId, 'A', 0);
      const idB = await createItem(groupId, 'B', 1);

      const response = await putOrder(groupId, [
        { id: idA, displayOrder: 0 },
        { id: idB, displayOrder: 0 },
      ]);

      expect(response.status).toBe(400);
      expect(response.body.code).toBe('QUANTITY_TABLE_VALIDATION_ERROR');
      expect(await readOrders(groupId)).toEqual([
        { name: 'A', displayOrder: 0 },
        { name: 'B', displayOrder: 1 },
      ]);
    });

    it('要求に含めなかった既存項目と重なる並び替えも 400 で拒まれる', async () => {
      const { groupId } = await createGroup('要求外との重複');
      const idA = await createItem(groupId, 'A', 0);
      await createItem(groupId, 'B', 1);
      await createItem(groupId, 'C', 2);

      // A だけを 1 へ動かすと、要求に含めていない B（=1）と重なる
      const response = await putOrder(groupId, [{ id: idA, displayOrder: 1 }]);

      expect(response.status).toBe(400);
      expect(response.body.code).toBe('QUANTITY_TABLE_VALIDATION_ERROR');
      expect(await readOrders(groupId)).toEqual([
        { name: 'A', displayOrder: 0 },
        { name: 'B', displayOrder: 1 },
        { name: 'C', displayOrder: 2 },
      ]);
    });

    it('重ならない入れ替えは従来どおり 204 で反映される（対照）', async () => {
      const { groupId } = await createGroup('重ならない入れ替え');
      const idA = await createItem(groupId, 'A', 0);
      const idB = await createItem(groupId, 'B', 1);

      const response = await putOrder(groupId, [
        { id: idA, displayOrder: 1 },
        { id: idB, displayOrder: 0 },
      ]);

      expect(response.status).toBe(204);
      expect(await readOrders(groupId)).toEqual([
        { name: 'B', displayOrder: 0 },
        { name: 'A', displayOrder: 1 },
      ]);
    });

    /**
     * `orderUpdates` の件数の上限（quantity-table-generation タスク110.2）。上限を 1 件超えた要求は
     * 本文の検証の 400 になり、表示順は変わらず、並び替えの監査記録も残らない。送る並びは上限が
     * 無ければ通る（重ならない逆順）ものにして、上限だけが拒む理由であることを保つ。
     *
     * @requirement quantity-table-generation/REQ-42.14
     */
    it('上限（2000件）を1件超える並び替えは本文の検証の 400 で拒まれ、並びは変わらない', async () => {
      const { groupId } = await createGroup('件数の上限を超える並び替え');
      const count = 2001;
      await prisma.quantityItem.createMany({
        data: Array.from({ length: count }, (_, index) => ({
          quantityGroupId: groupId,
          majorCategory: '土工事',
          workType: '掘削',
          name: `I${index}`,
          unit: 'm3',
          calculationMethod: 'STANDARD' as const,
          adjustmentFactor: 1,
          roundingUnit: 0.01,
          quantity: 1,
          displayOrder: index,
        })),
      });
      const before = await readOrders(groupId);
      expect(before).toHaveLength(count);
      const items = await prisma.quantityItem.findMany({
        where: { quantityGroupId: groupId },
        select: { id: true, displayOrder: true },
      });

      const response = await putOrder(
        groupId,
        items.map((item) => ({ id: item.id, displayOrder: count - 1 - item.displayOrder }))
      );

      expect(response.status).toBe(400);
      expect(response.body.code).toBe('VALIDATION_ERROR');
      expect(response.body.message).toBe('数量項目は2000件以内で指定してください');
      expect(response.body.details).toEqual([
        expect.objectContaining({ path: 'orderUpdates', code: 'too_big' }),
      ]);
      expect(await readOrders(groupId)).toEqual(before);
      expect(
        await prisma.auditLog.count({
          where: {
            targetType: 'QuantityGroup',
            targetId: groupId,
            action: 'QUANTITY_ITEM_UPDATED',
          },
        })
      ).toBe(0);
    });
  });

  describe('PUT /api/quantity-items/:id', () => {
    it('他の項目と同じ displayOrder への更新は 400 で拒まれ、値は変わらない', async () => {
      const { groupId } = await createGroup('単体更新の重複');
      const created = await postItem(groupId, { name: 'A', displayOrder: 0 });
      expect(created.status).toBe(201);
      expect((await postItem(groupId, { name: 'B', displayOrder: 1 })).status).toBe(201);

      const response = await request(app)
        .put(`/api/quantity-items/${created.body.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ displayOrder: 1, expectedUpdatedAt: created.body.updatedAt });

      expect(response.status).toBe(400);
      expect(response.body.code).toBe('QUANTITY_TABLE_VALIDATION_ERROR');
      expect(await readOrders(groupId)).toEqual([
        { name: 'A', displayOrder: 0 },
        { name: 'B', displayOrder: 1 },
      ]);
    });

    it('空いている displayOrder への更新は従来どおり 200（対照）', async () => {
      const { groupId } = await createGroup('単体更新の非重複');
      const created = await postItem(groupId, { name: 'A', displayOrder: 0 });
      expect(created.status).toBe(201);
      expect((await postItem(groupId, { name: 'B', displayOrder: 1 })).status).toBe(201);

      const response = await request(app)
        .put(`/api/quantity-items/${created.body.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ displayOrder: 2, expectedUpdatedAt: created.body.updatedAt });

      expect(response.status).toBe(200);
      expect(response.body.displayOrder).toBe(2);
      expectNoOverlap(await readOrders(groupId));
    });

    it('自分自身の現在の displayOrder を指す更新は 200（自己重複と判定しない）', async () => {
      const { groupId } = await createGroup('単体更新の自己参照');
      const created = await postItem(groupId, { name: 'A', displayOrder: 0 });
      expect(created.status).toBe(201);

      const response = await request(app)
        .put(`/api/quantity-items/${created.body.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'A2', displayOrder: 0, expectedUpdatedAt: created.body.updatedAt });

      expect(response.status).toBe(200);
      expect(response.body.name).toBe('A2');
      expect(response.body.displayOrder).toBe(0);
    });
  });

  describe('POST /api/quantity-items/:id/copy', () => {
    it('空き番号のあるグループでの複製は末尾へ採番され、既存と重ならない', async () => {
      const { groupId } = await createGroup('複製の採番');
      const source = await postItem(groupId, { name: 'A', displayOrder: 0 });
      expect(source.status).toBe(201);
      const middle = await postItem(groupId, { name: 'B', displayOrder: 1 });
      expect(middle.status).toBe(201);
      expect((await postItem(groupId, { name: 'C', displayOrder: 2 })).status).toBe(201);

      const deleteResponse = await request(app)
        .delete(`/api/quantity-items/${middle.body.id}`)
        .set('Authorization', `Bearer ${accessToken}`);
      expect(deleteResponse.status).toBe(204);

      // 残存2件（0 と 2）。件数を採番に使うと 2 になり末尾と重なる
      const response = await request(app)
        .post(`/api/quantity-items/${source.body.id}/copy`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(201);
      expect(response.body.displayOrder).toBe(3);
      expectNoOverlap(await readOrders(groupId));
    });
  });

  describe('POST /api/quantity-items/:id/move', () => {
    it('移動先グループで使われている displayOrder への移動は 400 で拒まれ、所属も並びも変わらない', async () => {
      const { tableId, groupId } = await createGroup('移動元');
      const targetGroup = await prisma.quantityGroup.create({
        data: { quantityTableId: tableId, name: '移動先', displayOrder: 1 },
      });
      const source = await postItem(groupId, { name: 'A', displayOrder: 0 });
      expect(source.status).toBe(201);
      expect((await postItem(targetGroup.id, { name: 'X', displayOrder: 0 })).status).toBe(201);

      const response = await request(app)
        .post(`/api/quantity-items/${source.body.id}/move`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ targetGroupId: targetGroup.id, displayOrder: 0 });

      expect(response.status).toBe(400);
      expect(response.body.code).toBe('QUANTITY_TABLE_VALIDATION_ERROR');
      expect(await readOrders(groupId)).toEqual([{ name: 'A', displayOrder: 0 }]);
      expect(await readOrders(targetGroup.id)).toEqual([{ name: 'X', displayOrder: 0 }]);
    });

    it('移動先で空いている displayOrder への移動は従来どおり 200（対照）', async () => {
      const { tableId, groupId } = await createGroup('移動元（非重複）');
      const targetGroup = await prisma.quantityGroup.create({
        data: { quantityTableId: tableId, name: '移動先', displayOrder: 1 },
      });
      const source = await postItem(groupId, { name: 'A', displayOrder: 0 });
      expect(source.status).toBe(201);
      expect((await postItem(targetGroup.id, { name: 'X', displayOrder: 0 })).status).toBe(201);

      const response = await request(app)
        .post(`/api/quantity-items/${source.body.id}/move`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ targetGroupId: targetGroup.id, displayOrder: 1 });

      expect(response.status).toBe(200);
      expect(response.body.quantityGroupId).toBe(targetGroup.id);
      expectNoOverlap(await readOrders(targetGroup.id));
      expect(await readOrders(targetGroup.id)).toEqual([
        { name: 'X', displayOrder: 0 },
        { name: 'A', displayOrder: 1 },
      ]);
    });
  });

  /**
   * 一括コピー・一括移動の `itemIds` の件数の上限（quantity-table-generation タスク111.1。
   * タスク110.2 の 1000 件を 2026-11-01 の利用者の決定で 500 件へ下げた）。上限を 1 件超えた要求は
   * 本文の検証の 400 になり、数量項目も監査記録も増えず所属も変わらない。上限の内側の要求
   * （10 件）は従来どおり全件を書き込む（対照）。送る ID はいずれも実在し実行者の範囲内のもので、
   * 上限だけが拒む理由であることを保つ。上限ちょうど（500 件）は所要が制限時間（5 秒）に迫りうる
   * ため常設せず（タスク111.1 の実測で平常は最悪 2801 ms、テストの backend の再起動の直後は 5618 ms
   * で超過）、上限ちょうどで通ることは経路の単体が主張する。
   *
   * @requirement quantity-table-generation/REQ-42.14
   */
  describe('POST /api/quantity-items/bulk-copy・bulk-move の itemIds の件数の上限', () => {
    const LIMIT = 500;
    /** 対照の上限の内側の件数 */
    const WITHIN = 10;

    /** 当該グループへ数量項目を count 件まとめて作り、displayOrder 昇順の ID を返す */
    const seedItems = async (groupId: string, count: number): Promise<string[]> => {
      await prisma.quantityItem.createMany({
        data: Array.from({ length: count }, (_, index) => ({
          quantityGroupId: groupId,
          majorCategory: '土工事',
          workType: '掘削',
          name: `I${index}`,
          unit: 'm3',
          calculationMethod: 'STANDARD' as const,
          adjustmentFactor: 1,
          roundingUnit: 0.01,
          quantity: 1,
          displayOrder: index,
        })),
      });
      const items = await prisma.quantityItem.findMany({
        where: { quantityGroupId: groupId },
        select: { id: true },
        orderBy: { displayOrder: 'asc' },
      });
      return items.map((item) => item.id);
    };

    const countItems = async (groupId: string): Promise<number> =>
      await prisma.quantityItem.count({ where: { quantityGroupId: groupId } });

    const countAudit = async (action: string): Promise<number> =>
      await prisma.auditLog.count({ where: { actorId: testUserId, action } });

    const bulkCopy = async (itemIds: string[]): Promise<request.Response> =>
      await request(app)
        .post('/api/quantity-items/bulk-copy')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ itemIds });

    const bulkMove = async (itemIds: string[], targetGroupId: string): Promise<request.Response> =>
      await request(app)
        .post('/api/quantity-items/bulk-move')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ itemIds, targetGroupId });

    const expectLimitRejection = (response: request.Response): void => {
      expect(response.status).toBe(400);
      expect(response.body.code).toBe('VALIDATION_ERROR');
      expect(response.body.message).toBe('数量項目は500件以内で選択してください');
      expect(response.body.details).toEqual([
        expect.objectContaining({ path: 'itemIds', code: 'too_big' }),
      ]);
    };

    it('一括コピーの itemIds が上限（500件）を1件超えると 400 で拒まれ、数量項目も監査記録も増えない', async () => {
      const { groupId } = await createGroup('一括コピーの上限超過');
      const itemIds = await seedItems(groupId, LIMIT + 1);
      expect(itemIds).toHaveLength(LIMIT + 1);
      const auditBefore = await countAudit('QUANTITY_ITEM_COPIED');

      const response = await bulkCopy(itemIds);

      expectLimitRejection(response);
      expect(await countItems(groupId)).toBe(LIMIT + 1);
      expect(await countAudit('QUANTITY_ITEM_COPIED')).toBe(auditBefore);
    });

    it('一括コピーの itemIds が上限の内側（10件）なら全件が複製される（対照）', async () => {
      const { groupId } = await createGroup('一括コピーの上限の内側');
      const itemIds = await seedItems(groupId, WITHIN);
      const auditBefore = await countAudit('QUANTITY_ITEM_COPIED');

      const response = await bulkCopy(itemIds);

      expect(response.status).toBe(201);
      expect(response.body).toHaveLength(WITHIN);
      expect(await countItems(groupId)).toBe(WITHIN * 2);
      expect(await countAudit('QUANTITY_ITEM_COPIED')).toBe(auditBefore + WITHIN);
      expectNoOverlap(await readOrders(groupId));
    });

    it('一括移動の itemIds が上限（500件）を1件超えると 400 で拒まれ、所属も監査記録も変わらない', async () => {
      const { tableId, groupId } = await createGroup('一括移動の上限超過');
      const targetGroup = await prisma.quantityGroup.create({
        data: { quantityTableId: tableId, name: '移動先', displayOrder: 1 },
      });
      const itemIds = await seedItems(groupId, LIMIT + 1);
      const auditBefore = await countAudit('QUANTITY_ITEM_MOVED');

      const response = await bulkMove(itemIds, targetGroup.id);

      expectLimitRejection(response);
      expect(await countItems(groupId)).toBe(LIMIT + 1);
      expect(await countItems(targetGroup.id)).toBe(0);
      expect(await countAudit('QUANTITY_ITEM_MOVED')).toBe(auditBefore);
    });

    it('一括移動の itemIds が上限の内側（10件）なら全件が移動する（対照）', async () => {
      const { tableId, groupId } = await createGroup('一括移動の上限の内側');
      const targetGroup = await prisma.quantityGroup.create({
        data: { quantityTableId: tableId, name: '移動先', displayOrder: 1 },
      });
      const itemIds = await seedItems(groupId, WITHIN);
      const auditBefore = await countAudit('QUANTITY_ITEM_MOVED');

      const response = await bulkMove(itemIds, targetGroup.id);

      expect(response.status).toBe(204);
      expect(await countItems(groupId)).toBe(0);
      expect(await countItems(targetGroup.id)).toBe(WITHIN);
      expect(await countAudit('QUANTITY_ITEM_MOVED')).toBe(auditBefore + WITHIN);
      expectNoOverlap(await readOrders(targetGroup.id));
    });
  });
});
