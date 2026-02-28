/**
 * @fileoverview 数量表 並び順管理・グループ名前変更 統合テスト
 *
 * Task 42.2: 並び順管理の統合テストを実装する
 *
 * Requirements:
 * - 22.2: 数量グループ名前変更APIで名前が正しく更新される
 * - 23.1: 数量グループ並び順変更APIで並び順が正しく更新される
 * - 23.7: 数量表詳細取得APIでグループがdisplayOrder順で返却される
 * - 24.1: 数量項目並び順変更APIで並び順が正しく更新される
 * - 24.7: 数量表詳細取得APIで項目がdisplayOrder順で返却される
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { validateEnv } from '../../config/env.js';
import type { PrismaClient } from '../../generated/prisma/client.js';

// 環境変数を初期化
validateEnv();

import app from '../../app.js';
import getPrismaClient from '../../db.js';
import redis, { initRedis } from '../../redis.js';
import { seedRoles, seedPermissions, seedRolePermissions } from '../../utils/seed-helpers.js';

describe('数量表 並び順管理・グループ名前変更 統合テスト (Task 42.2)', () => {
  let prisma: PrismaClient;
  let accessToken: string;
  let testUserId: string;
  let testProjectId: string;

  const loginTestUser = async (): Promise<{ token: string; userId: string }> => {
    const passwordHash = await (
      await import('@node-rs/argon2')
    ).hash('TestPassword123!', {
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4,
    });

    const user = await prisma.user.create({
      data: {
        email: 'test-sort-order-integration@example.com',
        displayName: 'Sort Order Test User',
        passwordHash,
      },
    });

    const userRole = await prisma.role.findUnique({
      where: { name: 'user' },
    });

    if (userRole) {
      await prisma.userRole.create({
        data: { userId: user.id, roleId: userRole.id },
      });
    }

    // 数量表関連の権限を作成
    const quantityTablePermissions = [
      { resource: 'quantity_table', action: 'create', description: '数量表の作成' },
      { resource: 'quantity_table', action: 'read', description: '数量表の閲覧' },
      { resource: 'quantity_table', action: 'update', description: '数量表の更新' },
      { resource: 'quantity_table', action: 'delete', description: '数量表の削除' },
    ];

    await prisma.permission.createMany({
      data: quantityTablePermissions,
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
      email: 'test-sort-order-integration@example.com',
      password: 'TestPassword123!',
    });

    return { token: response.body.accessToken, userId: user.id };
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
        name: 'テスト用プロジェクト_並び順統合テスト',
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
    await prisma.user.deleteMany({
      where: { email: 'test-sort-order-integration@example.com' },
    });
    await prisma.$disconnect();
    redis.disconnect();
  });

  beforeEach(async () => {
    if (testProjectId) {
      await prisma.quantityTable.deleteMany({ where: { projectId: testProjectId } });
    }
  });

  describe('数量グループ並び順変更 (REQ-23.1, 23.7)', () => {
    it('PUT /api/quantity-tables/:tableId/groups/order で並び順が正しく更新される', async () => {
      // 数量表を作成
      const tableRes = await request(app)
        .post(`/api/projects/${testProjectId}/quantity-tables`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: '並び順テスト数量表' });
      const tableId = tableRes.body.id;

      // グループを2つ作成
      const group1Res = await request(app)
        .post(`/api/quantity-tables/${tableId}/groups`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'グループA', displayOrder: 0 });
      const group1Id = group1Res.body.id;

      const group2Res = await request(app)
        .post(`/api/quantity-tables/${tableId}/groups`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'グループB', displayOrder: 1 });
      const group2Id = group2Res.body.id;

      // 並び順を入れ替える
      const orderRes = await request(app)
        .put(`/api/quantity-tables/${tableId}/groups/order`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          orderUpdates: [
            { id: group1Id, displayOrder: 1 },
            { id: group2Id, displayOrder: 0 },
          ],
        });

      expect(orderRes.status).toBe(204);

      // 数量表詳細を取得してグループの順序を確認
      const detailRes = await request(app)
        .get(`/api/quantity-tables/${tableId}`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(detailRes.status).toBe(200);
      const groups = detailRes.body.groups;
      expect(groups.length).toBe(2);
      // displayOrder順でソートされているはず
      expect(groups[0].name).toBe('グループB');
      expect(groups[0].displayOrder).toBe(0);
      expect(groups[1].name).toBe('グループA');
      expect(groups[1].displayOrder).toBe(1);
    });
  });

  describe('数量項目並び順変更 (REQ-24.1, 24.7)', () => {
    it('PUT /api/quantity-groups/:groupId/items/order で並び順が正しく更新される', async () => {
      // 数量表とグループを作成
      const tableRes = await request(app)
        .post(`/api/projects/${testProjectId}/quantity-tables`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: '項目並び順テスト数量表' });
      const tableId = tableRes.body.id;

      const groupRes = await request(app)
        .post(`/api/quantity-tables/${tableId}/groups`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'テストグループ', displayOrder: 0 });
      const groupId = groupRes.body.id;

      // 項目を2つ作成
      const item1Res = await request(app)
        .post(`/api/quantity-groups/${groupId}/items`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          majorCategory: '建築',
          workType: '仮設',
          name: '項目A',
          unit: '式',
          calculationMethod: 'STANDARD',
          displayOrder: 0,
          adjustmentFactor: 1.0,
          roundingUnit: 0.01,
          quantity: 1.0,
        });
      const item1Id = item1Res.body.id;

      const item2Res = await request(app)
        .post(`/api/quantity-groups/${groupId}/items`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          majorCategory: '建築',
          workType: '仮設',
          name: '項目B',
          unit: '式',
          calculationMethod: 'STANDARD',
          displayOrder: 1,
          adjustmentFactor: 1.0,
          roundingUnit: 0.01,
          quantity: 2.0,
        });
      const item2Id = item2Res.body.id;

      // 並び順を入れ替える
      const orderRes = await request(app)
        .put(`/api/quantity-groups/${groupId}/items/order`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          orderUpdates: [
            { id: item1Id, displayOrder: 1 },
            { id: item2Id, displayOrder: 0 },
          ],
        });

      expect(orderRes.status).toBe(204);

      // 数量表詳細を取得して項目の順序を確認
      const detailRes = await request(app)
        .get(`/api/quantity-tables/${tableId}`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(detailRes.status).toBe(200);
      const items = detailRes.body.groups[0].items;
      expect(items.length).toBe(2);
      // displayOrder順でソートされているはず
      expect(items[0].name).toBe('項目B');
      expect(items[0].displayOrder).toBe(0);
      expect(items[1].name).toBe('項目A');
      expect(items[1].displayOrder).toBe(1);
    });
  });

  describe('数量グループ名前変更 (REQ-22.2)', () => {
    it('PUT /api/quantity-groups/:id で名前が正しく更新される', async () => {
      // 数量表とグループを作成
      const tableRes = await request(app)
        .post(`/api/projects/${testProjectId}/quantity-tables`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: '名前変更テスト数量表' });
      const tableId = tableRes.body.id;

      const groupRes = await request(app)
        .post(`/api/quantity-tables/${tableId}/groups`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: '元の名前', displayOrder: 0 });
      const groupId = groupRes.body.id;
      const groupUpdatedAt = groupRes.body.updatedAt;

      // グループ名を変更
      const updateRes = await request(app)
        .put(`/api/quantity-groups/${groupId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: '新しい名前',
          expectedUpdatedAt: groupUpdatedAt,
        });

      expect(updateRes.status).toBe(200);
      expect(updateRes.body.name).toBe('新しい名前');

      // 数量表詳細で確認
      const detailRes = await request(app)
        .get(`/api/quantity-tables/${tableId}`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(detailRes.status).toBe(200);
      expect(detailRes.body.groups[0].name).toBe('新しい名前');
    });
  });

  describe('数量表詳細取得のdisplayOrder順返却 (REQ-23.7, 24.7)', () => {
    it('数量表詳細取得APIでグループおよび項目がdisplayOrder順で返却される', async () => {
      // 数量表を作成
      const tableRes = await request(app)
        .post(`/api/projects/${testProjectId}/quantity-tables`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: '順序確認テスト' });
      const tableId = tableRes.body.id;

      // グループを逆順で作成（displayOrder: 1 -> 0）
      await request(app)
        .post(`/api/quantity-tables/${tableId}/groups`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: '2番目のグループ', displayOrder: 1 });

      const group0Res = await request(app)
        .post(`/api/quantity-tables/${tableId}/groups`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: '1番目のグループ', displayOrder: 0 });
      const group0Id = group0Res.body.id;

      // グループ0に項目を逆順で作成
      await request(app)
        .post(`/api/quantity-groups/${group0Id}/items`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          majorCategory: '建築',
          workType: '仮設',
          name: '2番目の項目',
          unit: '式',
          calculationMethod: 'STANDARD',
          displayOrder: 1,
          adjustmentFactor: 1.0,
          roundingUnit: 0.01,
          quantity: 2.0,
        });

      await request(app)
        .post(`/api/quantity-groups/${group0Id}/items`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          majorCategory: '建築',
          workType: '仮設',
          name: '1番目の項目',
          unit: '式',
          calculationMethod: 'STANDARD',
          displayOrder: 0,
          adjustmentFactor: 1.0,
          roundingUnit: 0.01,
          quantity: 1.0,
        });

      // 数量表詳細を取得
      const detailRes = await request(app)
        .get(`/api/quantity-tables/${tableId}`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(detailRes.status).toBe(200);
      const groups = detailRes.body.groups;

      // グループがdisplayOrder順で返却されること
      expect(groups[0].name).toBe('1番目のグループ');
      expect(groups[0].displayOrder).toBe(0);
      expect(groups[1].name).toBe('2番目のグループ');
      expect(groups[1].displayOrder).toBe(1);

      // 項目がdisplayOrder順で返却されること
      const items = groups[0].items;
      expect(items[0].name).toBe('1番目の項目');
      expect(items[0].displayOrder).toBe(0);
      expect(items[1].name).toBe('2番目の項目');
      expect(items[1].displayOrder).toBe(1);
    });
  });
});
