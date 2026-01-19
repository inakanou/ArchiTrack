/**
 * @fileoverview 内訳書API統合テスト
 *
 * TDD: RED phase - テストを先に書く
 *
 * 内訳書作成API、一覧取得、削除、楽観的排他制御、スナップショット独立性の統合テストを実装します。
 *
 * Task 13.1: バックエンド統合テスト
 *
 * Requirements:
 * - 1.3: 内訳書作成（数量表選択→集計→保存）
 * - 3.2: 内訳書一覧取得のページネーション・ソート
 * - 7.3: 内訳書削除
 * - 8.1, 8.2, 8.3: スナップショット独立性
 * - 10.2, 10.3: 楽観的排他制御
 *
 * @module __tests__/integration/itemized-statement.api.integration.test
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
 * 内訳書API統合テスト
 */
describe('Itemized Statement API Integration Tests', () => {
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
        email: 'test-itemized-statement-integration@example.com',
        displayName: 'Itemized Statement Test User',
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

    // 内訳書関連の権限を作成
    const itemizedStatementPermissions = [
      { resource: 'itemized_statement', action: 'create', description: '内訳書の作成' },
      { resource: 'itemized_statement', action: 'read', description: '内訳書の閲覧' },
      { resource: 'itemized_statement', action: 'update', description: '内訳書の更新' },
      { resource: 'itemized_statement', action: 'delete', description: '内訳書の削除' },
    ];

    await prisma.permission.createMany({
      data: itemizedStatementPermissions,
      skipDuplicates: true,
    });

    // 必要な権限を割り当て（プロジェクト、数量表、内訳書関連）
    const permissions = await prisma.permission.findMany({
      where: {
        OR: [
          { resource: 'project', action: { in: ['create', 'read', 'update', 'delete'] } },
          { resource: 'quantity_table', action: { in: ['create', 'read', 'update', 'delete'] } },
          {
            resource: 'itemized_statement',
            action: { in: ['create', 'read', 'update', 'delete'] },
          },
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
      email: 'test-itemized-statement-integration@example.com',
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
        name: 'テスト用プロジェクト_内訳書統合テスト',
        status: 'PREPARING',
        salesPersonId: testUserId,
        createdById: testUserId,
      },
    });
    return project.id;
  };

  /**
   * テスト用数量表と項目を作成
   */
  const createTestQuantityTableWithItems = async (
    name: string,
    itemCount: number
  ): Promise<{ tableId: string; groupId: string }> => {
    const quantityTable = await prisma.quantityTable.create({
      data: {
        projectId: testProjectId,
        name,
      },
    });

    const quantityGroup = await prisma.quantityGroup.create({
      data: {
        quantityTableId: quantityTable.id,
        name: 'テストグループ',
        displayOrder: 0,
      },
    });

    // 指定された数量項目を作成
    const itemsData = Array.from({ length: itemCount }, (_, i) => ({
      quantityGroupId: quantityGroup.id,
      customCategory: `任意分類${i % 3}`, // 3種類の任意分類
      workType: `工種${i % 2}`, // 2種類の工種
      name: `名称${i}`,
      specification: `規格${i % 4}`, // 4種類の規格
      unit: i % 2 === 0 ? 'm2' : 'm3',
      quantity: 10 + i,
      majorCategory: '大項目',
      calculationMethod: 'STANDARD' as const,
      adjustmentFactor: 1.0,
      roundingUnit: 0.01,
      displayOrder: i,
    }));

    await prisma.quantityItem.createMany({ data: itemsData });

    return {
      tableId: quantityTable.id,
      groupId: quantityGroup.id,
    };
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
    testProjectId = await createTestProject();

    // テスト用数量表を作成
    const result = await createTestQuantityTableWithItems('テスト数量表', 10);
    testQuantityTableId = result.tableId;
    testQuantityGroupId = result.groupId;
  });

  afterAll(async () => {
    // テストデータのクリーンアップ
    if (testProjectId) {
      await prisma.itemizedStatement.deleteMany({
        where: { projectId: testProjectId },
      });
      await prisma.quantityTable.deleteMany({
        where: { projectId: testProjectId },
      });
      await prisma.project.deleteMany({
        where: { id: testProjectId },
      });
    }

    await prisma.user.deleteMany({
      where: { email: 'test-itemized-statement-integration@example.com' },
    });

    await prisma.$disconnect();
    redis.disconnect();
  });

  describe('内訳書作成フロー (Req 1.3)', () => {
    beforeEach(async () => {
      // 各テスト前に内訳書をクリーンアップ
      await prisma.itemizedStatement.deleteMany({
        where: { projectId: testProjectId },
      });
    });

    it('数量表を選択して内訳書を作成できる', async () => {
      const response = await request(app)
        .post(`/api/projects/${testProjectId}/itemized-statements`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'テスト内訳書',
          quantityTableId: testQuantityTableId,
        });

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        name: 'テスト内訳書',
        projectId: testProjectId,
        sourceQuantityTableId: testQuantityTableId,
      });
      expect(response.body.id).toBeDefined();
      expect(response.body.sourceQuantityTableName).toBe('テスト数量表');
      expect(response.body.createdAt).toBeDefined();
      expect(response.body.updatedAt).toBeDefined();
    });

    it('数量表の項目が集計されて内訳書項目が作成される', async () => {
      // 内訳書を作成
      const createResponse = await request(app)
        .post(`/api/projects/${testProjectId}/itemized-statements`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: '集計確認用内訳書',
          quantityTableId: testQuantityTableId,
        });

      expect(createResponse.status).toBe(201);
      const itemizedStatementId = createResponse.body.id;

      // 詳細を取得して項目を確認
      const detailResponse = await request(app)
        .get(`/api/itemized-statements/${itemizedStatementId}`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(detailResponse.status).toBe(200);
      expect(detailResponse.body.items).toBeInstanceOf(Array);
      expect(detailResponse.body.items.length).toBeGreaterThan(0);

      // 集計された項目が正しい形式を持っているか確認
      detailResponse.body.items.forEach(
        (item: {
          customCategory: string | null;
          workType: string | null;
          name: string | null;
          specification: string | null;
          unit: string | null;
          quantity: number;
        }) => {
          expect(item).toHaveProperty('customCategory');
          expect(item).toHaveProperty('workType');
          expect(item).toHaveProperty('name');
          expect(item).toHaveProperty('specification');
          expect(item).toHaveProperty('unit');
          expect(item).toHaveProperty('quantity');
          expect(typeof item.quantity).toBe('number');
        }
      );
    });

    it('存在しない数量表IDで作成しようとすると404エラー', async () => {
      const response = await request(app)
        .post(`/api/projects/${testProjectId}/itemized-statements`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'エラーテスト内訳書',
          quantityTableId: '12345678-1234-4234-a234-123456789012',
        });

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('code', 'QUANTITY_TABLE_NOT_FOUND');
    });

    it('空の数量表で作成しようとすると400エラー (Req 1.9)', async () => {
      // 項目なしの数量表を作成
      const emptyTable = await prisma.quantityTable.create({
        data: {
          projectId: testProjectId,
          name: '空の数量表',
        },
      });

      const response = await request(app)
        .post(`/api/projects/${testProjectId}/itemized-statements`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: '空の数量表から作成',
          quantityTableId: emptyTable.id,
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('code', 'EMPTY_QUANTITY_ITEMS');

      // クリーンアップ
      await prisma.quantityTable.delete({ where: { id: emptyTable.id } });
    });

    it('同名の内訳書が存在する場合は409エラー (Req 1.10)', async () => {
      // 既存の内訳書を作成
      await request(app)
        .post(`/api/projects/${testProjectId}/itemized-statements`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: '重複テスト内訳書',
          quantityTableId: testQuantityTableId,
        });

      // 同名で再度作成を試行
      const response = await request(app)
        .post(`/api/projects/${testProjectId}/itemized-statements`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: '重複テスト内訳書',
          quantityTableId: testQuantityTableId,
        });

      expect(response.status).toBe(409);
      expect(response.body).toHaveProperty('code', 'DUPLICATE_ITEMIZED_STATEMENT_NAME');
    });

    it('認証なしでは401を返す', async () => {
      const response = await request(app)
        .post(`/api/projects/${testProjectId}/itemized-statements`)
        .send({
          name: 'テスト内訳書',
          quantityTableId: testQuantityTableId,
        });

      expect(response.status).toBe(401);
    });
  });

  describe('内訳書一覧取得 (Req 3.2)', () => {
    beforeAll(async () => {
      // テスト用の内訳書を複数作成
      for (let i = 0; i < 5; i++) {
        const { tableId } = await createTestQuantityTableWithItems(`一覧テスト数量表${i}`, 5);
        await request(app)
          .post(`/api/projects/${testProjectId}/itemized-statements`)
          .set('Authorization', `Bearer ${accessToken}`)
          .send({
            name: `一覧テスト内訳書${i}`,
            quantityTableId: tableId,
          });
      }
    });

    it('ページネーション付きで一覧を取得できる', async () => {
      const response = await request(app)
        .get(`/api/projects/${testProjectId}/itemized-statements`)
        .query({ page: 1, limit: 3 })
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data).toBeInstanceOf(Array);
      expect(response.body.data.length).toBeLessThanOrEqual(3);
      expect(response.body.pagination).toMatchObject({
        page: 1,
        limit: 3,
        total: expect.any(Number),
        totalPages: expect.any(Number),
      });
    });

    it('作成日時の降順でソートされている', async () => {
      const response = await request(app)
        .get(`/api/projects/${testProjectId}/itemized-statements`)
        .query({ sort: 'createdAt', order: 'desc' })
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(200);
      const data = response.body.data;

      // 日付が降順になっているか確認
      for (let i = 0; i < data.length - 1; i++) {
        const current = new Date(data[i].createdAt).getTime();
        const next = new Date(data[i + 1].createdAt).getTime();
        expect(current).toBeGreaterThanOrEqual(next);
      }
    });

    it('名前でソートできる', async () => {
      const response = await request(app)
        .get(`/api/projects/${testProjectId}/itemized-statements`)
        .query({ sort: 'name', order: 'asc' })
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(200);
      const data = response.body.data;

      // 名前が昇順になっているか確認
      for (let i = 0; i < data.length - 1; i++) {
        expect(data[i].name <= data[i + 1].name).toBe(true);
      }
    });

    it('検索フィルターが動作する', async () => {
      const response = await request(app)
        .get(`/api/projects/${testProjectId}/itemized-statements`)
        .query({ search: '一覧テスト' })
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data.length).toBeGreaterThan(0);
      response.body.data.forEach((item: { name: string }) => {
        expect(item.name).toContain('一覧テスト');
      });
    });
  });

  describe('内訳書削除と楽観的排他制御 (Req 7.3, 10.2, 10.3)', () => {
    let deleteTargetId: string;
    let deleteTargetUpdatedAt: string;

    beforeEach(async () => {
      // 削除用の内訳書を作成
      const response = await request(app)
        .post(`/api/projects/${testProjectId}/itemized-statements`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: `削除テスト内訳書_${Date.now()}`,
          quantityTableId: testQuantityTableId,
        });

      deleteTargetId = response.body.id;
      deleteTargetUpdatedAt = response.body.updatedAt;
    });

    it('内訳書を削除できる', async () => {
      const response = await request(app)
        .delete(`/api/itemized-statements/${deleteTargetId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ updatedAt: deleteTargetUpdatedAt });

      expect(response.status).toBe(204);

      // 削除後は取得できないことを確認
      const getResponse = await request(app)
        .get(`/api/itemized-statements/${deleteTargetId}`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(getResponse.status).toBe(404);
    });

    it('楽観的排他制御エラー - 古いupdatedAtで409を返す', async () => {
      const response = await request(app)
        .delete(`/api/itemized-statements/${deleteTargetId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ updatedAt: '2020-01-01T00:00:00.000Z' });

      expect(response.status).toBe(409);
      expect(response.body).toHaveProperty('code', 'ITEMIZED_STATEMENT_CONFLICT');
    });

    it('存在しない内訳書の削除は404を返す', async () => {
      const response = await request(app)
        .delete('/api/itemized-statements/12345678-1234-4234-a234-123456789012')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ updatedAt: new Date().toISOString() });

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('code', 'ITEMIZED_STATEMENT_NOT_FOUND');
    });
  });

  describe('スナップショット独立性 (Req 8.1, 8.2, 8.3)', () => {
    it('元データ変更後も内訳書が影響を受けない', async () => {
      // 内訳書を作成
      const createResponse = await request(app)
        .post(`/api/projects/${testProjectId}/itemized-statements`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'スナップショットテスト内訳書',
          quantityTableId: testQuantityTableId,
        });

      expect(createResponse.status).toBe(201);
      const itemizedStatementId = createResponse.body.id;

      // 作成時の項目を取得
      const beforeResponse = await request(app)
        .get(`/api/itemized-statements/${itemizedStatementId}`)
        .set('Authorization', `Bearer ${accessToken}`);

      const beforeItems = beforeResponse.body.items;

      // 元の数量表の項目を更新
      const quantityItems = await prisma.quantityItem.findMany({
        where: { quantityGroupId: testQuantityGroupId },
      });

      if (quantityItems.length > 0 && quantityItems[0]) {
        await prisma.quantityItem.update({
          where: { id: quantityItems[0].id },
          data: { quantity: 99999 }, // 大きく変更
        });
      }

      // 再度取得して変更されていないことを確認
      const afterResponse = await request(app)
        .get(`/api/itemized-statements/${itemizedStatementId}`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(afterResponse.body.items).toEqual(beforeItems);
    });

    it('元の数量表が削除されても内訳書は影響を受けない (Req 8.3)', async () => {
      // 新しい数量表と項目を作成
      const { tableId } = await createTestQuantityTableWithItems('削除テスト用数量表', 3);

      // 内訳書を作成
      const createResponse = await request(app)
        .post(`/api/projects/${testProjectId}/itemized-statements`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'スナップショット削除テスト内訳書',
          quantityTableId: tableId,
        });

      expect(createResponse.status).toBe(201);
      const itemizedStatementId = createResponse.body.id;
      const sourceQuantityTableName = createResponse.body.sourceQuantityTableName;

      // 元の数量表を論理削除
      await prisma.quantityTable.update({
        where: { id: tableId },
        data: { deletedAt: new Date() },
      });

      // 内訳書が影響を受けていないことを確認
      const afterResponse = await request(app)
        .get(`/api/itemized-statements/${itemizedStatementId}`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(afterResponse.status).toBe(200);
      expect(afterResponse.body.sourceQuantityTableName).toBe(sourceQuantityTableName);
      expect(afterResponse.body.items.length).toBeGreaterThan(0);
    });

    it('内訳書にスナップショットとして数量表名が保存される (Req 8.1)', async () => {
      const response = await request(app)
        .post(`/api/projects/${testProjectId}/itemized-statements`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'スナップショット確認内訳書',
          quantityTableId: testQuantityTableId,
        });

      expect(response.status).toBe(201);
      expect(response.body.sourceQuantityTableId).toBe(testQuantityTableId);
      expect(response.body.sourceQuantityTableName).toBe('テスト数量表');
    });
  });

  describe('最新内訳書サマリー取得', () => {
    it('プロジェクトの最新内訳書サマリーを取得できる', async () => {
      const response = await request(app)
        .get(`/api/projects/${testProjectId}/itemized-statements/latest`)
        .query({ limit: 2 })
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('totalCount');
      expect(response.body).toHaveProperty('latestStatements');
      expect(response.body.latestStatements).toBeInstanceOf(Array);
      expect(response.body.latestStatements.length).toBeLessThanOrEqual(2);
    });
  });
});
