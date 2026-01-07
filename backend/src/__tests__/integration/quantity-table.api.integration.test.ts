/**
 * @fileoverview 数量表API統合テスト
 *
 * TDD: RED phase - テストを先に書く
 *
 * 数量表、数量グループ、数量項目のAPI統合テストを実装します。
 *
 * Task 9.3: APIエンドポイントの統合テストを実装する
 *
 * Requirements:
 * - 2.1: 数量表一覧画面で新規作成操作を行う
 * - 4.1: 数量表編集画面で数量グループ追加操作を行う
 * - 5.1: 数量グループ内で行追加操作を行う
 * - 7.1: オートコンプリート候補の取得
 *
 * @module __tests__/integration/quantity-table.api.integration.test
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

/**
 * 数量表API統合テスト
 */
describe('Quantity Table API Integration Tests', () => {
  let prisma: PrismaClient;
  let accessToken: string;
  let testUserId: string;
  let testProjectId: string;
  let testQuantityTableId: string;
  let testQuantityGroupId: string;

  /**
   * テスト用認証情報でログインしてアクセストークンを取得
   */
  const loginTestUser = async (): Promise<{ token: string; userId: string }> => {
    const passwordHash = await (
      await import('@node-rs/argon2')
    ).hash('TestPassword123!', {
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4,
    });

    // テストユーザーを作成
    const user = await prisma.user.create({
      data: {
        email: 'test-quantity-table-integration@example.com',
        displayName: 'Quantity Table Test User',
        passwordHash,
      },
    });

    // userロールを取得して割り当て
    const userRole = await prisma.role.findUnique({
      where: { name: 'user' },
    });

    if (userRole) {
      await prisma.userRole.create({
        data: {
          userId: user.id,
          roleId: userRole.id,
        },
      });
    }

    // 数量表関連の権限を作成（seedPermissionsに含まれていないため）
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

    // 必要な権限を割り当て（プロジェクト、数量表関連）
    const permissions = await prisma.permission.findMany({
      where: {
        OR: [
          { resource: 'project', action: { in: ['create', 'read', 'update', 'delete'] } },
          { resource: 'quantity_table', action: { in: ['create', 'read', 'update', 'delete'] } },
        ],
      },
    });

    if (userRole && permissions.length > 0) {
      for (const permission of permissions) {
        await prisma.rolePermission.upsert({
          where: {
            roleId_permissionId: {
              roleId: userRole.id,
              permissionId: permission.id,
            },
          },
          update: {},
          create: {
            roleId: userRole.id,
            permissionId: permission.id,
          },
        });
      }
    }

    // ログインしてトークンを取得
    const response = await request(app).post('/api/v1/auth/login').send({
      email: 'test-quantity-table-integration@example.com',
      password: 'TestPassword123!',
    });

    return {
      token: response.body.accessToken,
      userId: user.id,
    };
  };

  /**
   * テスト用プロジェクトを作成
   */
  const createTestProject = async (): Promise<string> => {
    const project = await prisma.project.create({
      data: {
        name: 'テスト用プロジェクト_数量表統合テスト',
        status: 'PREPARING',
        salesPersonId: testUserId,
        createdById: testUserId,
      },
    });
    return project.id;
  };

  beforeAll(async () => {
    prisma = getPrismaClient();
    await initRedis();
    await seedRoles(prisma);
    await seedPermissions(prisma);
    await seedRolePermissions(prisma);
  });

  afterAll(async () => {
    // テストデータのクリーンアップ
    if (testProjectId) {
      await prisma.project.deleteMany({
        where: { id: testProjectId },
      });
    }

    await prisma.user.deleteMany({
      where: { email: 'test-quantity-table-integration@example.com' },
    });

    await prisma.$disconnect();
    redis.disconnect();
  });

  describe('数量表API', () => {
    beforeAll(async () => {
      const auth = await loginTestUser();
      accessToken = auth.token;
      testUserId = auth.userId;
      testProjectId = await createTestProject();
    });

    beforeEach(async () => {
      // 各テスト前にクリーンアップ（数量表APIのテストのみ）
      if (testProjectId) {
        await prisma.quantityTable.deleteMany({
          where: { projectId: testProjectId },
        });
      }
    });

    describe('POST /api/projects/:projectId/quantity-tables', () => {
      it('数量表を作成できる (Req 2.1, 2.2)', async () => {
        const response = await request(app)
          .post(`/api/projects/${testProjectId}/quantity-tables`)
          .set('Authorization', `Bearer ${accessToken}`)
          .send({ name: 'テスト数量表' });

        expect(response.status).toBe(201);
        expect(response.body).toMatchObject({
          name: 'テスト数量表',
          projectId: testProjectId,
          groupCount: 0,
          itemCount: 0,
        });
        expect(response.body.id).toBeDefined();

        testQuantityTableId = response.body.id;
      });

      it('プロジェクトが存在しない場合は404を返す', async () => {
        const response = await request(app)
          .post('/api/projects/12345678-1234-4234-a234-123456789012/quantity-tables')
          .set('Authorization', `Bearer ${accessToken}`)
          .send({ name: 'テスト数量表' });

        expect(response.status).toBe(404);
        expect(response.body).toHaveProperty('code', 'PROJECT_NOT_FOUND');
      });

      it('認証なしでは401を返す', async () => {
        const response = await request(app)
          .post(`/api/projects/${testProjectId}/quantity-tables`)
          .send({ name: 'テスト数量表' });

        expect(response.status).toBe(401);
      });

      it('名前が空の場合は400を返す', async () => {
        const response = await request(app)
          .post(`/api/projects/${testProjectId}/quantity-tables`)
          .set('Authorization', `Bearer ${accessToken}`)
          .send({ name: '' });

        expect(response.status).toBe(400);
      });
    });

    describe('GET /api/projects/:projectId/quantity-tables', () => {
      it('数量表一覧を取得できる (Req 2.3)', async () => {
        // テストデータを作成
        await prisma.quantityTable.create({
          data: {
            projectId: testProjectId,
            name: 'テスト数量表1',
          },
        });
        await prisma.quantityTable.create({
          data: {
            projectId: testProjectId,
            name: 'テスト数量表2',
          },
        });

        const response = await request(app)
          .get(`/api/projects/${testProjectId}/quantity-tables`)
          .set('Authorization', `Bearer ${accessToken}`);

        expect(response.status).toBe(200);
        expect(response.body.data).toBeInstanceOf(Array);
        expect(response.body.data.length).toBeGreaterThanOrEqual(2);
        expect(response.body.pagination).toBeDefined();
      });

      it('検索フィルターが動作する', async () => {
        // テストデータを作成
        await prisma.quantityTable.create({
          data: {
            projectId: testProjectId,
            name: 'ユニークな検索キーワード',
          },
        });

        const response = await request(app)
          .get(`/api/projects/${testProjectId}/quantity-tables`)
          .query({ search: 'ユニークな検索' })
          .set('Authorization', `Bearer ${accessToken}`);

        expect(response.status).toBe(200);
        expect(response.body.data.length).toBe(1);
        expect(response.body.data[0].name).toBe('ユニークな検索キーワード');
      });
    });

    describe('GET /api/quantity-tables/:id', () => {
      it('数量表詳細を取得できる', async () => {
        const quantityTable = await prisma.quantityTable.create({
          data: {
            projectId: testProjectId,
            name: '詳細取得テスト',
          },
        });

        const response = await request(app)
          .get(`/api/quantity-tables/${quantityTable.id}`)
          .set('Authorization', `Bearer ${accessToken}`);

        expect(response.status).toBe(200);
        expect(response.body).toMatchObject({
          id: quantityTable.id,
          name: '詳細取得テスト',
          projectId: testProjectId,
        });
        expect(response.body.project).toBeDefined();
        expect(response.body.groups).toBeInstanceOf(Array);
      });

      it('存在しない数量表の場合は404を返す', async () => {
        const response = await request(app)
          .get('/api/quantity-tables/12345678-1234-4234-a234-123456789012')
          .set('Authorization', `Bearer ${accessToken}`);

        expect(response.status).toBe(404);
        expect(response.body).toHaveProperty('code', 'QUANTITY_TABLE_NOT_FOUND');
      });
    });

    describe('PUT /api/quantity-tables/:id', () => {
      it('数量表名を更新できる (Req 2.5)', async () => {
        const quantityTable = await prisma.quantityTable.create({
          data: {
            projectId: testProjectId,
            name: '更新前の名前',
          },
        });

        const response = await request(app)
          .put(`/api/quantity-tables/${quantityTable.id}`)
          .set('Authorization', `Bearer ${accessToken}`)
          .send({
            name: '更新後の名前',
            expectedUpdatedAt: quantityTable.updatedAt.toISOString(),
          });

        expect(response.status).toBe(200);
        expect(response.body.name).toBe('更新後の名前');
      });

      it('楽観的排他制御でタイムスタンプが一致しない場合は409を返す', async () => {
        const quantityTable = await prisma.quantityTable.create({
          data: {
            projectId: testProjectId,
            name: '競合テスト',
          },
        });

        const response = await request(app)
          .put(`/api/quantity-tables/${quantityTable.id}`)
          .set('Authorization', `Bearer ${accessToken}`)
          .send({
            name: '競合更新',
            expectedUpdatedAt: new Date('2020-01-01').toISOString(), // 過去のタイムスタンプ
          });

        expect(response.status).toBe(409);
        expect(response.body).toHaveProperty('code', 'QUANTITY_TABLE_CONFLICT');
      });
    });

    describe('DELETE /api/quantity-tables/:id', () => {
      it('数量表を削除できる (Req 2.4)', async () => {
        const quantityTable = await prisma.quantityTable.create({
          data: {
            projectId: testProjectId,
            name: '削除テスト',
          },
        });

        const response = await request(app)
          .delete(`/api/quantity-tables/${quantityTable.id}`)
          .set('Authorization', `Bearer ${accessToken}`);

        expect(response.status).toBe(204);

        // 論理削除されたことを確認
        const deleted = await prisma.quantityTable.findUnique({
          where: { id: quantityTable.id },
        });
        expect(deleted?.deletedAt).not.toBeNull();
      });

      it('存在しない数量表の削除は404を返す', async () => {
        const response = await request(app)
          .delete('/api/quantity-tables/12345678-1234-4234-a234-123456789012')
          .set('Authorization', `Bearer ${accessToken}`);

        expect(response.status).toBe(404);
      });
    });
  });

  describe('数量グループAPI', () => {
    beforeAll(async () => {
      // 数量表を作成（前のテストでクリーンアップされている可能性があるため常に新規作成）
      const qt = await prisma.quantityTable.create({
        data: {
          projectId: testProjectId,
          name: 'グループテスト用数量表',
        },
      });
      testQuantityTableId = qt.id;
    });

    describe('POST /api/quantity-tables/:quantityTableId/groups', () => {
      it('数量グループを作成できる (Req 4.1)', async () => {
        const response = await request(app)
          .post(`/api/quantity-tables/${testQuantityTableId}/groups`)
          .set('Authorization', `Bearer ${accessToken}`)
          .send({ name: 'テストグループ' });

        expect(response.status).toBe(201);
        expect(response.body).toMatchObject({
          name: 'テストグループ',
          quantityTableId: testQuantityTableId,
        });
        expect(response.body.id).toBeDefined();

        testQuantityGroupId = response.body.id;
      });

      it('数量表が存在しない場合は404を返す', async () => {
        const response = await request(app)
          .post('/api/quantity-tables/12345678-1234-4234-a234-123456789012/groups')
          .set('Authorization', `Bearer ${accessToken}`)
          .send({ name: 'テストグループ' });

        expect(response.status).toBe(404);
      });
    });

    describe('GET /api/quantity-tables/:quantityTableId/groups', () => {
      it('数量グループ一覧を取得できる', async () => {
        const response = await request(app)
          .get(`/api/quantity-tables/${testQuantityTableId}/groups`)
          .set('Authorization', `Bearer ${accessToken}`);

        expect(response.status).toBe(200);
        expect(response.body).toBeInstanceOf(Array);
      });
    });

    describe('DELETE /api/quantity-groups/:id', () => {
      it('数量グループを削除できる (Req 4.5)', async () => {
        // 削除用グループを作成
        const group = await prisma.quantityGroup.create({
          data: {
            quantityTableId: testQuantityTableId,
            name: '削除対象グループ',
            displayOrder: 99,
          },
        });

        const response = await request(app)
          .delete(`/api/quantity-groups/${group.id}`)
          .set('Authorization', `Bearer ${accessToken}`);

        expect(response.status).toBe(204);

        // 削除されたことを確認
        const deleted = await prisma.quantityGroup.findUnique({
          where: { id: group.id },
        });
        expect(deleted).toBeNull();
      });
    });
  });

  describe('数量項目API', () => {
    beforeAll(async () => {
      // 数量グループを作成（確実に存在するようにする）
      const group = await prisma.quantityGroup.create({
        data: {
          quantityTableId: testQuantityTableId,
          name: '項目テスト用グループ',
          displayOrder: 0,
        },
      });
      testQuantityGroupId = group.id;
    });

    describe('POST /api/quantity-groups/:groupId/items', () => {
      it('数量項目を作成できる (Req 5.1, 5.2)', async () => {
        const response = await request(app)
          .post(`/api/quantity-groups/${testQuantityGroupId}/items`)
          .set('Authorization', `Bearer ${accessToken}`)
          .send({
            majorCategory: '建築工事',
            workType: '足場工事',
            name: '外部足場',
            unit: 'm2',
            quantity: 100.5,
            calculationMethod: 'STANDARD',
            adjustmentFactor: 1.0,
            roundingUnit: 0.01,
          });

        expect(response.status).toBe(201);
        expect(response.body).toMatchObject({
          majorCategory: '建築工事',
          workType: '足場工事',
          name: '外部足場',
          unit: 'm2',
          quantity: 100.5,
          quantityGroupId: testQuantityGroupId,
        });
        expect(response.body.id).toBeDefined();
      });

      it('必須フィールドが欠けている場合は400を返す (Req 5.3)', async () => {
        const response = await request(app)
          .post(`/api/quantity-groups/${testQuantityGroupId}/items`)
          .set('Authorization', `Bearer ${accessToken}`)
          .send({
            // majorCategory, workType, name, unit が欠けている
            quantity: 100,
          });

        expect(response.status).toBe(400);
      });
    });

    describe('GET /api/quantity-groups/:groupId/items', () => {
      it('数量項目一覧を取得できる', async () => {
        const response = await request(app)
          .get(`/api/quantity-groups/${testQuantityGroupId}/items`)
          .set('Authorization', `Bearer ${accessToken}`);

        expect(response.status).toBe(200);
        expect(response.body).toBeInstanceOf(Array);
      });
    });

    describe('DELETE /api/quantity-items/:id', () => {
      it('数量項目を削除できる (Req 5.4)', async () => {
        // 削除用項目を作成
        const item = await prisma.quantityItem.create({
          data: {
            quantityGroupId: testQuantityGroupId,
            majorCategory: '削除テスト',
            workType: 'テスト工種',
            name: '削除対象項目',
            unit: 'm2',
            quantity: 100,
            calculationMethod: 'STANDARD',
            adjustmentFactor: 1.0,
            roundingUnit: 0.01,
            displayOrder: 99,
          },
        });

        const response = await request(app)
          .delete(`/api/quantity-items/${item.id}`)
          .set('Authorization', `Bearer ${accessToken}`);

        expect(response.status).toBe(204);

        // 削除されたことを確認
        const deleted = await prisma.quantityItem.findUnique({
          where: { id: item.id },
        });
        expect(deleted).toBeNull();
      });
    });
  });

  describe('オートコンプリートAPI', () => {
    beforeAll(async () => {
      // テスト用の数量項目を作成（オートコンプリート候補用）
      await prisma.quantityItem.createMany({
        data: [
          {
            quantityGroupId: testQuantityGroupId,
            majorCategory: '建築工事',
            workType: '足場工事',
            name: 'オートコンプリートテスト1',
            unit: 'm2',
            quantity: 100,
            calculationMethod: 'STANDARD',
            adjustmentFactor: 1.0,
            roundingUnit: 0.01,
            displayOrder: 100,
          },
          {
            quantityGroupId: testQuantityGroupId,
            majorCategory: '建設工事',
            workType: '足場工事',
            name: 'オートコンプリートテスト2',
            unit: 'm3',
            quantity: 200,
            calculationMethod: 'STANDARD',
            adjustmentFactor: 1.0,
            roundingUnit: 0.01,
            displayOrder: 101,
          },
        ],
      });
    });

    describe('GET /api/autocomplete/major-categories', () => {
      it('大項目の候補を取得できる (Req 7.1)', async () => {
        const response = await request(app)
          .get('/api/autocomplete/major-categories')
          .query({ q: '建' })
          .set('Authorization', `Bearer ${accessToken}`);

        expect(response.status).toBe(200);
        expect(response.body).toBeInstanceOf(Array);
        expect(response.body.some((item: string) => item.includes('建'))).toBe(true);
      });

      it('最大100件まで返す', async () => {
        const response = await request(app)
          .get('/api/autocomplete/major-categories')
          .query({ q: '' })
          .set('Authorization', `Bearer ${accessToken}`);

        expect(response.status).toBe(200);
        expect(response.body.length).toBeLessThanOrEqual(100);
      });
    });

    describe('GET /api/autocomplete/units', () => {
      it('単位の候補を取得できる', async () => {
        const response = await request(app)
          .get('/api/autocomplete/units')
          .query({ q: 'm' })
          .set('Authorization', `Bearer ${accessToken}`);

        expect(response.status).toBe(200);
        expect(response.body).toBeInstanceOf(Array);
      });
    });
  });
});
