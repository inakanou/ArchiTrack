/**
 * @fileoverview 見積書API統合テスト
 *
 * TDD: RED phase - テストを先に書く
 *
 * 見積書CRUD API、内訳書連携、楽観的排他制御の統合テストを実装します。
 *
 * Task 13.1: バックエンド統合テスト
 *
 * Requirements:
 * - 3.1: 新規作成を選択した場合、プロジェクトに紐付く内訳書の選択画面を表示する
 * - 3.2: 選択した内訳書の項目を見積金額行の初期値として設定する
 * - 3.3: 内訳書を選択せずに作成した場合、空の見積書を作成する
 * - 3.4: 見積書をプロジェクトに紐付けて保存する
 * - 3.5: 内訳書が選択された場合、内訳書の名称・規格・単位・数量を見積金額行に転記する
 * - 11.1: プロジェクトに紐付く見積書の一覧を表示する
 * - 11.2: 見積書を選択した場合、見積書の詳細を表示する
 * - 11.3: 見積書を編集した場合、変更内容を保存する
 * - 11.4: 確認ダイアログを表示後に削除を実行する
 * - 11.5: 見積書に見積名称を設定可能とする
 * - 11.6: 楽観的排他制御により競合を検出する
 * - 11.7: 見積書が他のユーザーによって編集中の場合、編集中であることを警告表示する
 *
 * @module __tests__/integration/estimate.api.integration.test
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
 * 見積書API統合テスト
 */
describe('Estimate API Integration Tests', () => {
  let prisma: PrismaClient;
  let accessToken: string;
  let testUserId: string;
  let testProjectId: string;
  let testQuantityTableId: string;
  let testItemizedStatementId: string;

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

    // 既存のテストユーザーをクリーンアップ（外部キー制約を考慮）
    const existingUser = await prisma.user.findUnique({
      where: { email: 'test-estimate-integration@example.com' },
    });

    if (existingUser) {
      // 関連するプロジェクトのデータをクリーンアップ
      const projects = await prisma.project.findMany({
        where: {
          OR: [{ salesPersonId: existingUser.id }, { createdById: existingUser.id }],
        },
      });

      for (const project of projects) {
        await prisma.estimate.deleteMany({ where: { projectId: project.id } });
        await prisma.itemizedStatement.deleteMany({ where: { projectId: project.id } });
        await prisma.quantityTable.deleteMany({ where: { projectId: project.id } });
      }
      await prisma.project.deleteMany({
        where: {
          OR: [{ salesPersonId: existingUser.id }, { createdById: existingUser.id }],
        },
      });
      await prisma.userRole.deleteMany({ where: { userId: existingUser.id } });
      await prisma.user.delete({ where: { id: existingUser.id } });
    }

    // テストユーザーを作成
    const user = await prisma.user.create({
      data: {
        email: 'test-estimate-integration@example.com',
        displayName: 'Estimate Test User',
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

    // 見積書関連の権限を作成
    const estimatePermissions = [
      { resource: 'estimate', action: 'create', description: '見積書の作成' },
      { resource: 'estimate', action: 'read', description: '見積書の閲覧' },
      { resource: 'estimate', action: 'update', description: '見積書の更新' },
      { resource: 'estimate', action: 'delete', description: '見積書の削除' },
    ];

    await prisma.permission.createMany({
      data: estimatePermissions,
      skipDuplicates: true,
    });

    // 必要な権限を割り当て（プロジェクト、内訳書、見積書関連）
    const permissions = await prisma.permission.findMany({
      where: {
        OR: [
          { resource: 'project', action: { in: ['create', 'read', 'update', 'delete'] } },
          { resource: 'quantity_table', action: { in: ['create', 'read', 'update', 'delete'] } },
          {
            resource: 'itemized_statement',
            action: { in: ['create', 'read', 'update', 'delete'] },
          },
          { resource: 'estimate', action: { in: ['create', 'read', 'update', 'delete'] } },
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

    // ログインしてトークンを取得
    const response = await request(app).post('/api/v1/auth/login').send({
      email: 'test-estimate-integration@example.com',
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
        name: 'テスト用プロジェクト_見積書統合テスト',
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
      customCategory: `任意分類${i % 3}`,
      workType: `工種${i % 2}`,
      name: `名称${i}`,
      specification: `規格${i % 4}`,
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

  /**
   * テスト用内訳書を作成
   */
  const createTestItemizedStatement = async (): Promise<string> => {
    const itemizedStatement = await prisma.itemizedStatement.create({
      data: {
        projectId: testProjectId,
        name: 'テスト内訳書',
        sourceQuantityTableId: testQuantityTableId,
        sourceQuantityTableName: 'テスト数量表',
        items: {
          create: [
            {
              customCategory: '任意分類1',
              workType: '工種1',
              name: '内訳書項目1',
              specification: '規格A',
              unit: 'm2',
              quantity: 100,
              displayOrder: 0,
            },
            {
              customCategory: '任意分類2',
              workType: '工種2',
              name: '内訳書項目2',
              specification: '規格B',
              unit: 'm3',
              quantity: 200,
              displayOrder: 1,
            },
            {
              customCategory: '任意分類3',
              workType: '工種1',
              name: '内訳書項目3',
              specification: '規格C',
              unit: '式',
              quantity: 1,
              displayOrder: 2,
            },
          ],
        },
      },
    });
    return itemizedStatement.id;
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

    // テスト用内訳書を作成
    testItemizedStatementId = await createTestItemizedStatement();
  });

  afterAll(async () => {
    // テストデータのクリーンアップ
    if (testProjectId) {
      await prisma.estimate.deleteMany({
        where: { projectId: testProjectId },
      });
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

    if (testUserId) {
      await prisma.userRole.deleteMany({
        where: { userId: testUserId },
      });
      await prisma.user.deleteMany({
        where: { email: 'test-estimate-integration@example.com' },
      });
    }

    await prisma.$disconnect();
    redis.disconnect();
  });

  // ==========================================
  // 見積書作成テスト (Req 3.1, 3.2, 3.3, 3.4, 3.5)
  // ==========================================

  describe('見積書作成 POST /api/projects/:projectId/estimates', () => {
    beforeEach(async () => {
      // 各テスト前に見積書をクリーンアップ
      await prisma.estimate.deleteMany({
        where: { projectId: testProjectId },
      });
    });

    it('内訳書を選択せずに空の見積書を作成できる (Req 3.3)', async () => {
      const response = await request(app)
        .post(`/api/projects/${testProjectId}/estimates`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: '空の見積書',
        });

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        name: '空の見積書',
        projectId: testProjectId,
        sourceItemizedStatementId: null,
        sourceItemizedStatementName: null,
      });
      expect(response.body.id).toBeDefined();
      expect(response.body.itemCount).toBe(0);
      expect(response.body.createdAt).toBeDefined();
      expect(response.body.updatedAt).toBeDefined();
    });

    it('内訳書を参照して見積書を作成できる (Req 3.1, 3.2, 3.4)', async () => {
      const response = await request(app)
        .post(`/api/projects/${testProjectId}/estimates`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: '内訳書参照見積書',
          sourceItemizedStatementId: testItemizedStatementId,
        });

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        name: '内訳書参照見積書',
        projectId: testProjectId,
        sourceItemizedStatementId: testItemizedStatementId,
        sourceItemizedStatementName: 'テスト内訳書',
      });
      expect(response.body.id).toBeDefined();
      expect(response.body.itemCount).toBe(3); // 内訳書の項目数
    });

    it('内訳書から見積金額行に名称・規格・単位・数量が転記される (Req 3.5)', async () => {
      // 内訳書参照で見積書を作成
      const createResponse = await request(app)
        .post(`/api/projects/${testProjectId}/estimates`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: '転記確認用見積書',
          sourceItemizedStatementId: testItemizedStatementId,
        });

      expect(createResponse.status).toBe(201);
      const estimateId = createResponse.body.id;

      // 見積書詳細を取得して項目を確認
      const detailResponse = await request(app)
        .get(`/api/estimates/${estimateId}`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(detailResponse.status).toBe(200);
      expect(detailResponse.body.items).toBeInstanceOf(Array);
      expect(detailResponse.body.items.length).toBe(3);

      // 各項目の見積金額行（ESTIMATE）に内訳書の情報が転記されていることを確認
      detailResponse.body.items.forEach(
        (
          item: {
            lines: Array<{
              lineType: string;
              name: string | null;
              specification: string | null;
              unit: string | null;
              quantity: number | null;
            }>;
          },
          index: number
        ) => {
          const estimateLine = item.lines.find(
            (line: { lineType: string }) => line.lineType === 'ESTIMATE'
          );
          expect(estimateLine).toBeDefined();
          expect(estimateLine!.name).toBe(`内訳書項目${index + 1}`);
          expect(estimateLine!.specification).toBeDefined();
          expect(estimateLine!.unit).toBeDefined();
          expect(typeof estimateLine!.quantity).toBe('number');
        }
      );
    });

    it('存在しない内訳書IDで作成しようとすると404エラー', async () => {
      const response = await request(app)
        .post(`/api/projects/${testProjectId}/estimates`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'エラーテスト見積書',
          sourceItemizedStatementId: '12345678-1234-4234-a234-123456789012',
        });

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('code', 'ITEMIZED_STATEMENT_NOT_FOUND');
    });

    it('存在しないプロジェクトIDで作成しようとすると404エラー', async () => {
      const response = await request(app)
        .post(`/api/projects/12345678-1234-4234-a234-123456789012/estimates`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'エラーテスト見積書',
        });

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('code', 'PROJECT_NOT_FOUND');
    });

    it('同名の見積書が存在する場合は409エラー', async () => {
      // 既存の見積書を作成
      await request(app)
        .post(`/api/projects/${testProjectId}/estimates`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: '重複テスト見積書',
        });

      // 同名で再度作成を試行
      const response = await request(app)
        .post(`/api/projects/${testProjectId}/estimates`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: '重複テスト見積書',
        });

      expect(response.status).toBe(409);
      expect(response.body).toHaveProperty('code', 'DUPLICATE_ESTIMATE_NAME');
    });

    it('認証なしでは401を返す', async () => {
      const response = await request(app).post(`/api/projects/${testProjectId}/estimates`).send({
        name: 'テスト見積書',
      });

      expect(response.status).toBe(401);
    });

    it('名称が空の場合は400エラー', async () => {
      const response = await request(app)
        .post(`/api/projects/${testProjectId}/estimates`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: '',
        });

      expect(response.status).toBe(400);
    });

    it('名称が200文字を超える場合は400エラー', async () => {
      const response = await request(app)
        .post(`/api/projects/${testProjectId}/estimates`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'a'.repeat(201),
        });

      expect(response.status).toBe(400);
    });
  });

  // ==========================================
  // 見積書一覧取得テスト (Req 11.1)
  // ==========================================

  describe('見積書一覧取得 GET /api/projects/:projectId/estimates', () => {
    beforeAll(async () => {
      // テスト用の見積書を複数作成
      for (let i = 0; i < 5; i++) {
        await request(app)
          .post(`/api/projects/${testProjectId}/estimates`)
          .set('Authorization', `Bearer ${accessToken}`)
          .send({
            name: `一覧テスト見積書${i}`,
          });
      }
    });

    it('プロジェクトに紐付く見積書一覧を取得できる (Req 11.1)', async () => {
      const response = await request(app)
        .get(`/api/projects/${testProjectId}/estimates`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data).toBeInstanceOf(Array);
      expect(response.body.data.length).toBeGreaterThan(0);
      expect(response.body.pagination).toMatchObject({
        page: 1,
        limit: expect.any(Number),
        total: expect.any(Number),
        totalPages: expect.any(Number),
      });
    });

    it('ページネーション付きで一覧を取得できる', async () => {
      const response = await request(app)
        .get(`/api/projects/${testProjectId}/estimates`)
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

    it('作成日時の降順でソートできる', async () => {
      const response = await request(app)
        .get(`/api/projects/${testProjectId}/estimates`)
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
        .get(`/api/projects/${testProjectId}/estimates`)
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
        .get(`/api/projects/${testProjectId}/estimates`)
        .query({ search: '一覧テスト' })
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data.length).toBeGreaterThan(0);
      response.body.data.forEach((item: { name: string }) => {
        expect(item.name).toContain('一覧テスト');
      });
    });
  });

  // ==========================================
  // 見積書詳細取得テスト (Req 11.2)
  // ==========================================

  describe('見積書詳細取得 GET /api/estimates/:id', () => {
    let testEstimateId: string;

    beforeAll(async () => {
      const response = await request(app)
        .post(`/api/projects/${testProjectId}/estimates`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: '詳細テスト見積書',
          sourceItemizedStatementId: testItemizedStatementId,
        });
      testEstimateId = response.body.id;
    });

    it('見積書の詳細を取得できる (Req 11.2)', async () => {
      const response = await request(app)
        .get(`/api/estimates/${testEstimateId}`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        id: testEstimateId,
        name: '詳細テスト見積書',
        projectId: testProjectId,
      });
      expect(response.body.project).toBeDefined();
      expect(response.body.project.id).toBe(testProjectId);
      expect(response.body.items).toBeInstanceOf(Array);
    });

    it('見積項目に3行1セット（ESTIMATE/EXECUTION/VENDOR）が含まれる', async () => {
      const response = await request(app)
        .get(`/api/estimates/${testEstimateId}`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(200);
      expect(response.body.items.length).toBeGreaterThan(0);

      // 各項目に3行が含まれていることを確認
      response.body.items.forEach((item: { lines: Array<{ lineType: string }> }) => {
        expect(item.lines.length).toBe(3);
        const lineTypes = item.lines.map((line: { lineType: string }) => line.lineType);
        expect(lineTypes).toContain('ESTIMATE');
        expect(lineTypes).toContain('EXECUTION');
        expect(lineTypes).toContain('VENDOR');
      });
    });

    it('存在しない見積書IDでは404エラー', async () => {
      const response = await request(app)
        .get('/api/estimates/12345678-1234-4234-a234-123456789012')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('code', 'ESTIMATE_NOT_FOUND');
    });
  });

  // ==========================================
  // 見積書更新テスト (Req 11.3, 11.5, 11.6)
  // ==========================================

  describe('見積書更新 PUT /api/estimates/:id', () => {
    let updateTargetId: string;
    let updateTargetUpdatedAt: string;

    beforeEach(async () => {
      // 更新用の見積書を作成
      const response = await request(app)
        .post(`/api/projects/${testProjectId}/estimates`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: `更新テスト見積書_${Date.now()}`,
        });

      updateTargetId = response.body.id;
      updateTargetUpdatedAt = response.body.updatedAt;
    });

    it('見積書名を更新できる (Req 11.3, 11.5)', async () => {
      const response = await request(app)
        .put(`/api/estimates/${updateTargetId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: '更新後の見積書名',
          expectedUpdatedAt: updateTargetUpdatedAt,
        });

      expect(response.status).toBe(200);
      expect(response.body.name).toBe('更新後の見積書名');
      expect(response.body.id).toBe(updateTargetId);
    });

    it('楽観的排他制御エラー - 古いupdatedAtで409を返す (Req 11.6)', async () => {
      const response = await request(app)
        .put(`/api/estimates/${updateTargetId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: '更新後の見積書名',
          expectedUpdatedAt: '2020-01-01T00:00:00.000Z',
        });

      expect(response.status).toBe(409);
      expect(response.body).toHaveProperty('code', 'ESTIMATE_CONFLICT');
    });

    it('存在しない見積書の更新は404を返す', async () => {
      const response = await request(app)
        .put('/api/estimates/12345678-1234-4234-a234-123456789012')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: '更新後の見積書名',
          expectedUpdatedAt: new Date().toISOString(),
        });

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('code', 'ESTIMATE_NOT_FOUND');
    });

    it('名前が空の場合は400エラー', async () => {
      const response = await request(app)
        .put(`/api/estimates/${updateTargetId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: '',
          expectedUpdatedAt: updateTargetUpdatedAt,
        });

      expect(response.status).toBe(400);
    });

    it('同名の見積書が存在する場合は409エラー', async () => {
      // 別の見積書を作成
      await request(app)
        .post(`/api/projects/${testProjectId}/estimates`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: '既存の見積書名',
        });

      // 既存の名前に更新しようとする
      const response = await request(app)
        .put(`/api/estimates/${updateTargetId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: '既存の見積書名',
          expectedUpdatedAt: updateTargetUpdatedAt,
        });

      expect(response.status).toBe(409);
      expect(response.body).toHaveProperty('code', 'DUPLICATE_ESTIMATE_NAME');
    });
  });

  // ==========================================
  // 見積書削除テスト (Req 11.4, 11.6)
  // ==========================================

  describe('見積書削除 DELETE /api/estimates/:id', () => {
    let deleteTargetId: string;
    let deleteTargetUpdatedAt: string;

    beforeEach(async () => {
      // 削除用の見積書を作成
      const response = await request(app)
        .post(`/api/projects/${testProjectId}/estimates`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: `削除テスト見積書_${Date.now()}`,
        });

      deleteTargetId = response.body.id;
      deleteTargetUpdatedAt = response.body.updatedAt;
    });

    it('見積書を削除できる (Req 11.4)', async () => {
      const response = await request(app)
        .delete(`/api/estimates/${deleteTargetId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ updatedAt: deleteTargetUpdatedAt });

      expect(response.status).toBe(204);

      // 削除後は取得できないことを確認
      const getResponse = await request(app)
        .get(`/api/estimates/${deleteTargetId}`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(getResponse.status).toBe(404);
    });

    it('楽観的排他制御エラー - 古いupdatedAtで409を返す (Req 11.6)', async () => {
      const response = await request(app)
        .delete(`/api/estimates/${deleteTargetId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ updatedAt: '2020-01-01T00:00:00.000Z' });

      expect(response.status).toBe(409);
      expect(response.body).toHaveProperty('code', 'ESTIMATE_CONFLICT');
    });

    it('存在しない見積書の削除は404を返す', async () => {
      const response = await request(app)
        .delete('/api/estimates/12345678-1234-4234-a234-123456789012')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ updatedAt: new Date().toISOString() });

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('code', 'ESTIMATE_NOT_FOUND');
    });
  });

  // ==========================================
  // 最新見積書サマリー取得テスト (Req 16)
  // ==========================================

  describe('最新見積書サマリー取得 GET /api/projects/:projectId/estimates/latest', () => {
    it('プロジェクトの最新見積書サマリーを取得できる', async () => {
      const response = await request(app)
        .get(`/api/projects/${testProjectId}/estimates/latest`)
        .query({ limit: 2 })
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('totalCount');
      expect(response.body).toHaveProperty('latestEstimates');
      expect(response.body.latestEstimates).toBeInstanceOf(Array);
      expect(response.body.latestEstimates.length).toBeLessThanOrEqual(2);
    });

    it('最新の見積書が作成日時の降順で取得される', async () => {
      const response = await request(app)
        .get(`/api/projects/${testProjectId}/estimates/latest`)
        .query({ limit: 5 })
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(200);
      const estimates = response.body.latestEstimates;

      // 日付が降順になっているか確認
      for (let i = 0; i < estimates.length - 1; i++) {
        const current = new Date(estimates[i].createdAt).getTime();
        const next = new Date(estimates[i + 1].createdAt).getTime();
        expect(current).toBeGreaterThanOrEqual(next);
      }
    });
  });

  // ==========================================
  // Task 13.2: 見積項目API統合テスト
  // ==========================================
  // Requirements:
  // - 1.1-1.6: 見積書基本構造
  // - 2.1-2.6: 見積項目ネスト構造
  // - 12.1-12.6: 見積項目操作

  describe('見積項目API統合テスト', () => {
    let itemTestEstimateId: string;

    beforeAll(async () => {
      // テスト用見積書を作成
      const response = await request(app)
        .post(`/api/projects/${testProjectId}/estimates`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: '見積項目テスト用見積書',
        });
      itemTestEstimateId = response.body.id;
    });

    describe('見積項目一覧取得 GET /api/estimates/:id/items', () => {
      it('見積項目一覧を取得できる (Req 12.1)', async () => {
        const response = await request(app)
          .get(`/api/estimates/${itemTestEstimateId}/items`)
          .set('Authorization', `Bearer ${accessToken}`);

        expect(response.status).toBe(200);
        expect(response.body).toBeInstanceOf(Array);
      });
    });

    describe('見積項目作成 POST /api/estimates/:id/items', () => {
      it('3行1セット（ESTIMATE/EXECUTION/VENDOR）で見積項目を作成できる (Req 1.2, 2.1)', async () => {
        const response = await request(app)
          .post(`/api/estimates/${itemTestEstimateId}/items`)
          .set('Authorization', `Bearer ${accessToken}`)
          .send({
            displayOrder: 0,
            lines: [
              {
                lineType: 'ESTIMATE',
                name: 'テスト項目',
                specification: '規格A',
                unit: 'm2',
                quantity: 100,
                unitPrice: 1000,
              },
              {
                lineType: 'EXECUTION',
                name: 'テスト項目',
                specification: '規格A',
                unit: 'm2',
                quantity: 100,
                unitPrice: 800,
              },
              {
                lineType: 'VENDOR',
                name: 'テスト項目',
                specification: '規格A',
                unit: 'm2',
                quantity: 100,
                unitPrice: 700,
              },
            ],
          });

        expect(response.status).toBe(201);
        expect(response.body.id).toBeDefined();
        expect(response.body.lines).toBeInstanceOf(Array);
        expect(response.body.lines.length).toBe(3);

        // 3行の行タイプを確認
        const lineTypes = response.body.lines.map((line: { lineType: string }) => line.lineType);
        expect(lineTypes).toContain('ESTIMATE');
        expect(lineTypes).toContain('EXECUTION');
        expect(lineTypes).toContain('VENDOR');
      });

      it('親項目を指定して子項目を作成できる (Req 2.2, 2.3)', async () => {
        // 親項目を作成
        const parentResponse = await request(app)
          .post(`/api/estimates/${itemTestEstimateId}/items`)
          .set('Authorization', `Bearer ${accessToken}`)
          .send({
            displayOrder: 1,
            lines: [
              { lineType: 'ESTIMATE', name: '親項目' },
              { lineType: 'EXECUTION' },
              { lineType: 'VENDOR' },
            ],
          });

        const parentId = parentResponse.body.id;

        // 子項目を作成
        const childResponse = await request(app)
          .post(`/api/estimates/${itemTestEstimateId}/items`)
          .set('Authorization', `Bearer ${accessToken}`)
          .send({
            parentId,
            displayOrder: 0,
            lines: [
              { lineType: 'ESTIMATE', name: '子項目' },
              { lineType: 'EXECUTION' },
              { lineType: 'VENDOR' },
            ],
          });

        expect(childResponse.status).toBe(201);
        expect(childResponse.body.parentId).toBe(parentId);
      });

      it('存在しない見積書に項目を追加しようとすると404エラー', async () => {
        const response = await request(app)
          .post('/api/estimates/12345678-1234-4234-a234-123456789012/items')
          .set('Authorization', `Bearer ${accessToken}`)
          .send({
            displayOrder: 0,
            lines: [
              { lineType: 'ESTIMATE', name: 'テスト' },
              { lineType: 'EXECUTION' },
              { lineType: 'VENDOR' },
            ],
          });

        expect(response.status).toBe(404);
        expect(response.body).toHaveProperty('code', 'ESTIMATE_NOT_FOUND');
      });
    });

    describe('見積項目複製 POST /api/estimates/:id/items/:itemId/duplicate', () => {
      let sourceItemId: string;

      beforeAll(async () => {
        // 複製元の項目を作成
        const response = await request(app)
          .post(`/api/estimates/${itemTestEstimateId}/items`)
          .set('Authorization', `Bearer ${accessToken}`)
          .send({
            displayOrder: 10,
            lines: [
              {
                lineType: 'ESTIMATE',
                name: '複製元項目',
                specification: '規格X',
                unit: 'm2',
                quantity: 50,
                unitPrice: 2000,
              },
              { lineType: 'EXECUTION', unitPrice: 1800 },
              { lineType: 'VENDOR', unitPrice: 1500 },
            ],
          });
        sourceItemId = response.body.id;
      });

      it('見積項目を複製できる (Req 12.5)', async () => {
        const response = await request(app)
          .post(`/api/estimates/${itemTestEstimateId}/items/${sourceItemId}/duplicate`)
          .set('Authorization', `Bearer ${accessToken}`);

        expect(response.status).toBe(201);
        expect(response.body.id).toBeDefined();
        expect(response.body.id).not.toBe(sourceItemId);
        expect(response.body.lines).toBeInstanceOf(Array);
        expect(response.body.lines.length).toBe(3);

        // 元の項目の情報が複製されているか確認
        const estimateLine = response.body.lines.find(
          (line: { lineType: string }) => line.lineType === 'ESTIMATE'
        );
        expect(estimateLine.name).toBe('複製元項目');
        expect(estimateLine.specification).toBe('規格X');
      });

      it('存在しない項目を複製しようとすると404エラー', async () => {
        const response = await request(app)
          .post(
            `/api/estimates/${itemTestEstimateId}/items/12345678-1234-4234-a234-123456789012/duplicate`
          )
          .set('Authorization', `Bearer ${accessToken}`);

        expect(response.status).toBe(404);
        expect(response.body).toHaveProperty('code', 'ESTIMATE_ITEM_NOT_FOUND');
      });
    });

    describe('見積項目並び替え PUT /api/estimates/:id/items/reorder', () => {
      const reorderItemIds: string[] = [];

      beforeAll(async () => {
        // 並び替えテスト用の項目を作成
        for (let i = 0; i < 3; i++) {
          const response = await request(app)
            .post(`/api/estimates/${itemTestEstimateId}/items`)
            .set('Authorization', `Bearer ${accessToken}`)
            .send({
              displayOrder: i + 100,
              lines: [
                { lineType: 'ESTIMATE', name: `並び替えテスト${i}` },
                { lineType: 'EXECUTION' },
                { lineType: 'VENDOR' },
              ],
            });
          reorderItemIds.push(response.body.id);
        }
      });

      it('見積項目の並び替えができる (Req 12.2)', async () => {
        // 逆順に並び替え
        const itemOrders = reorderItemIds.map((id, index) => ({
          id,
          displayOrder: reorderItemIds.length - 1 - index,
        }));

        const response = await request(app)
          .put(`/api/estimates/${itemTestEstimateId}/items/reorder`)
          .set('Authorization', `Bearer ${accessToken}`)
          .send({ itemOrders });

        expect(response.status).toBe(204);

        // 並び替え結果を確認
        const itemsResponse = await request(app)
          .get(`/api/estimates/${itemTestEstimateId}/items`)
          .set('Authorization', `Bearer ${accessToken}`);

        expect(itemsResponse.status).toBe(200);
      });

      it('空の並び替え配列でも204を返す（現在の実装動作）', async () => {
        const response = await request(app)
          .put(`/api/estimates/${itemTestEstimateId}/items/reorder`)
          .set('Authorization', `Bearer ${accessToken}`)
          .send({ itemOrders: [] });

        // 現在の実装では空配列を許容して成功を返す
        expect(response.status).toBe(204);
      });
    });

    describe('見積項目削除 DELETE /api/estimates/:id/items/:itemId', () => {
      let deleteTargetId: string;

      beforeEach(async () => {
        // 削除用の項目を作成
        const response = await request(app)
          .post(`/api/estimates/${itemTestEstimateId}/items`)
          .set('Authorization', `Bearer ${accessToken}`)
          .send({
            displayOrder: 200,
            lines: [
              { lineType: 'ESTIMATE', name: '削除テスト項目' },
              { lineType: 'EXECUTION' },
              { lineType: 'VENDOR' },
            ],
          });
        deleteTargetId = response.body.id;
      });

      it('見積項目を削除できる (Req 12.3)', async () => {
        const response = await request(app)
          .delete(`/api/estimates/${itemTestEstimateId}/items/${deleteTargetId}`)
          .set('Authorization', `Bearer ${accessToken}`);

        expect(response.status).toBe(204);
      });

      it('存在しない項目の削除は404を返す', async () => {
        const response = await request(app)
          .delete(`/api/estimates/${itemTestEstimateId}/items/12345678-1234-4234-a234-123456789012`)
          .set('Authorization', `Bearer ${accessToken}`);

        expect(response.status).toBe(404);
        expect(response.body).toHaveProperty('code', 'ESTIMATE_ITEM_NOT_FOUND');
      });

      it('子項目がある場合はforceDelete=falseで422エラー (Req 12.4)', async () => {
        // 親項目を作成
        const parentResponse = await request(app)
          .post(`/api/estimates/${itemTestEstimateId}/items`)
          .set('Authorization', `Bearer ${accessToken}`)
          .send({
            displayOrder: 300,
            lines: [
              { lineType: 'ESTIMATE', name: '削除テスト親項目' },
              { lineType: 'EXECUTION' },
              { lineType: 'VENDOR' },
            ],
          });
        const parentId = parentResponse.body.id;

        // 子項目を作成
        await request(app)
          .post(`/api/estimates/${itemTestEstimateId}/items`)
          .set('Authorization', `Bearer ${accessToken}`)
          .send({
            parentId,
            displayOrder: 0,
            lines: [
              { lineType: 'ESTIMATE', name: '削除テスト子項目' },
              { lineType: 'EXECUTION' },
              { lineType: 'VENDOR' },
            ],
          });

        // 親項目の削除を試行（forceDelete=false）
        const response = await request(app)
          .delete(`/api/estimates/${itemTestEstimateId}/items/${parentId}`)
          .set('Authorization', `Bearer ${accessToken}`)
          .send({ forceDelete: false });

        expect(response.status).toBe(422);
        expect(response.body).toHaveProperty('code', 'ESTIMATE_ITEM_HAS_CHILDREN');
      });

      it('子項目がある場合でもforceDelete=trueで削除できる (Req 12.6)', async () => {
        // 親項目を作成
        const parentResponse = await request(app)
          .post(`/api/estimates/${itemTestEstimateId}/items`)
          .set('Authorization', `Bearer ${accessToken}`)
          .send({
            displayOrder: 400,
            lines: [
              { lineType: 'ESTIMATE', name: '強制削除テスト親項目' },
              { lineType: 'EXECUTION' },
              { lineType: 'VENDOR' },
            ],
          });
        const parentId = parentResponse.body.id;

        // 子項目を作成
        await request(app)
          .post(`/api/estimates/${itemTestEstimateId}/items`)
          .set('Authorization', `Bearer ${accessToken}`)
          .send({
            parentId,
            displayOrder: 0,
            lines: [
              { lineType: 'ESTIMATE', name: '強制削除テスト子項目' },
              { lineType: 'EXECUTION' },
              { lineType: 'VENDOR' },
            ],
          });

        // 親項目を強制削除
        const response = await request(app)
          .delete(`/api/estimates/${itemTestEstimateId}/items/${parentId}`)
          .set('Authorization', `Bearer ${accessToken}`)
          .send({ forceDelete: true });

        expect(response.status).toBe(204);
      });
    });
  });

  // ==========================================
  // Task 13.3: 計算・転記API統合テスト
  // ==========================================
  // Requirements:
  // - 4.1-4.5: 受領見積書転記
  // - 5.1-5.7: NET金額計算と案分
  // - 6.1-6.6: 利益率による見積金額反映
  // - 7.1-9.6: 諸経費自動計算

  describe('計算・転記API統合テスト', () => {
    let calcTestEstimateId: string;

    beforeAll(async () => {
      // テスト用見積書を作成
      const response = await request(app)
        .post(`/api/projects/${testProjectId}/estimates`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: '計算・転記テスト用見積書',
        });
      calcTestEstimateId = response.body.id;
    });

    describe('諸経費計算 POST /api/estimates/:id/calculate-overhead', () => {
      it('共通仮設費を計算できる (Req 7.1, 7.2, 7.3)', async () => {
        const response = await request(app)
          .post(`/api/estimates/${calcTestEstimateId}/calculate-overhead`)
          .set('Authorization', `Bearer ${accessToken}`)
          .send({
            costType: 'COMMON_TEMPORARY',
            directCost: '100000', // 1億円（千円単位）
            constructionPeriod: 12, // 12ヶ月
            isRenovation: false,
          });

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('costType', 'COMMON_TEMPORARY');
        expect(response.body).toHaveProperty('rate');
        expect(response.body).toHaveProperty('amount');
        expect(response.body).toHaveProperty('formula');
        expect(parseFloat(response.body.rate)).toBeGreaterThan(0);
        expect(parseFloat(response.body.amount)).toBeGreaterThan(0);
      });

      it('現場管理費を計算できる (Req 8.1, 8.2, 8.3)', async () => {
        const response = await request(app)
          .post(`/api/estimates/${calcTestEstimateId}/calculate-overhead`)
          .set('Authorization', `Bearer ${accessToken}`)
          .send({
            costType: 'SITE_MANAGEMENT',
            directCost: '100000',
            pureConstructionCost: '120000', // 1.2億円（千円単位）
            isRenovation: false,
          });

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('costType', 'SITE_MANAGEMENT');
        expect(response.body).toHaveProperty('rate');
        expect(response.body).toHaveProperty('amount');
        expect(parseFloat(response.body.rate)).toBeGreaterThan(0);
      });

      it('一般管理費を計算できる (Req 9.1, 9.2, 9.3)', async () => {
        const response = await request(app)
          .post(`/api/estimates/${calcTestEstimateId}/calculate-overhead`)
          .set('Authorization', `Bearer ${accessToken}`)
          .send({
            costType: 'GENERAL_ADMIN',
            directCost: '100000',
            constructionCost: '150000', // 1.5億円（千円単位）
            isRenovation: false,
          });

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('costType', 'GENERAL_ADMIN');
        expect(response.body).toHaveProperty('rate');
        expect(response.body).toHaveProperty('amount');
        expect(parseFloat(response.body.rate)).toBeGreaterThan(0);
      });

      it('改修工事フラグを指定できる (Req 7.5)', async () => {
        const response = await request(app)
          .post(`/api/estimates/${calcTestEstimateId}/calculate-overhead`)
          .set('Authorization', `Bearer ${accessToken}`)
          .send({
            costType: 'COMMON_TEMPORARY',
            directCost: '100000',
            constructionPeriod: 12,
            isRenovation: true,
          });

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('costType', 'COMMON_TEMPORARY');
      });

      it('工期なしで共通仮設費を計算しようとすると400エラー', async () => {
        const response = await request(app)
          .post(`/api/estimates/${calcTestEstimateId}/calculate-overhead`)
          .set('Authorization', `Bearer ${accessToken}`)
          .send({
            costType: 'COMMON_TEMPORARY',
            directCost: '100000',
            isRenovation: false,
          });

        expect(response.status).toBe(400);
      });

      it('純工事費なしで現場管理費を計算しようとすると400エラー', async () => {
        const response = await request(app)
          .post(`/api/estimates/${calcTestEstimateId}/calculate-overhead`)
          .set('Authorization', `Bearer ${accessToken}`)
          .send({
            costType: 'SITE_MANAGEMENT',
            directCost: '100000',
            isRenovation: false,
          });

        expect(response.status).toBe(400);
      });

      it('工事原価なしで一般管理費を計算しようとすると400エラー', async () => {
        const response = await request(app)
          .post(`/api/estimates/${calcTestEstimateId}/calculate-overhead`)
          .set('Authorization', `Bearer ${accessToken}`)
          .send({
            costType: 'GENERAL_ADMIN',
            directCost: '100000',
            isRenovation: false,
          });

        expect(response.status).toBe(400);
      });
    });

    describe('諸経費行追加 POST /api/estimates/:id/overhead-items', () => {
      it('共通仮設費のプリセット行を追加できる (Req 7.6)', async () => {
        const response = await request(app)
          .post(`/api/estimates/${calcTestEstimateId}/overhead-items`)
          .set('Authorization', `Bearer ${accessToken}`)
          .send({
            costType: 'COMMON_TEMPORARY',
          });

        expect(response.status).toBe(201);
        expect(response.body.lines).toBeInstanceOf(Array);
        expect(response.body.lines.length).toBe(3);

        // プリセット値の確認
        const estimateLine = response.body.lines.find(
          (line: { lineType: string }) => line.lineType === 'ESTIMATE'
        );
        expect(estimateLine.name).toBe('共通仮設費');
        expect(estimateLine.unit).toBe('式');
        expect(parseFloat(estimateLine.quantity)).toBe(1);
      });

      it('現場管理費のプリセット行を追加できる', async () => {
        const response = await request(app)
          .post(`/api/estimates/${calcTestEstimateId}/overhead-items`)
          .set('Authorization', `Bearer ${accessToken}`)
          .send({
            costType: 'SITE_MANAGEMENT',
          });

        expect(response.status).toBe(201);
        const estimateLine = response.body.lines.find(
          (line: { lineType: string }) => line.lineType === 'ESTIMATE'
        );
        expect(estimateLine.name).toBe('現場管理費');
      });

      it('一般管理費のプリセット行を追加できる', async () => {
        const response = await request(app)
          .post(`/api/estimates/${calcTestEstimateId}/overhead-items`)
          .set('Authorization', `Bearer ${accessToken}`)
          .send({
            costType: 'GENERAL_ADMIN',
          });

        expect(response.status).toBe(201);
        const estimateLine = response.body.lines.find(
          (line: { lineType: string }) => line.lineType === 'ESTIMATE'
        );
        expect(estimateLine.name).toBe('一般管理費');
      });

      it('単価を指定して諸経費行を追加できる', async () => {
        const response = await request(app)
          .post(`/api/estimates/${calcTestEstimateId}/overhead-items`)
          .set('Authorization', `Bearer ${accessToken}`)
          .send({
            costType: 'COMMON_TEMPORARY',
            unitPrice: 5000000, // 500万円
          });

        expect(response.status).toBe(201);
        const estimateLine = response.body.lines.find(
          (line: { lineType: string }) => line.lineType === 'ESTIMATE'
        );
        expect(parseFloat(estimateLine.unitPrice)).toBe(5000000);
      });

      it('存在しない見積書に諸経費行を追加しようとすると404エラー', async () => {
        const response = await request(app)
          .post('/api/estimates/12345678-1234-4234-a234-123456789012/overhead-items')
          .set('Authorization', `Bearer ${accessToken}`)
          .send({
            costType: 'COMMON_TEMPORARY',
          });

        expect(response.status).toBe(404);
        expect(response.body).toHaveProperty('code', 'ESTIMATE_NOT_FOUND');
      });
    });

    describe('NET金額計算・案分 POST /api/estimates/:id/calculate-net', () => {
      const vendorLineIds: string[] = [];

      beforeAll(async () => {
        // NET金額計算テスト用にVENDOR行を持つ見積項目を3つ作成
        const items = [
          { name: 'NET項目A', quantity: 100, unitPrice: 3000 },
          { name: 'NET項目B', quantity: 200, unitPrice: 4000 },
          { name: 'NET項目C', quantity: 50, unitPrice: 2000 },
        ];
        for (const item of items) {
          const res = await request(app)
            .post(`/api/estimates/${calcTestEstimateId}/items`)
            .set('Authorization', `Bearer ${accessToken}`)
            .send({
              displayOrder: 0,
              lines: [
                {
                  lineType: 'ESTIMATE',
                  name: item.name,
                  unit: 'm2',
                  quantity: item.quantity,
                  unitPrice: item.unitPrice,
                },
                { lineType: 'EXECUTION', name: item.name, unit: 'm2', quantity: item.quantity },
                {
                  lineType: 'VENDOR',
                  name: item.name,
                  unit: 'm2',
                  quantity: item.quantity,
                  unitPrice: item.unitPrice,
                },
              ],
            });
          const vendorLine = res.body.lines.find(
            (line: { lineType: string }) => line.lineType === 'VENDOR'
          );
          vendorLineIds.push(vendorLine.id);
        }
      });

      it('NET金額の案分計算ができる (Req 5.1, 5.2, 5.3)', async () => {
        const response = await request(app)
          .post(`/api/estimates/${calcTestEstimateId}/calculate-net`)
          .set('Authorization', `Bearer ${accessToken}`)
          .send({
            vendorName: 'テスト業者',
            targetLineIds: vendorLineIds,
            excludeLineIds: [],
            netAmount: '1000000',
          });

        expect(response.status).toBe(200);
        expect(response.body).toBeInstanceOf(Array);
        expect(response.body.length).toBeGreaterThan(0);

        // 各行の結果を確認
        response.body.forEach(
          (item: { lineId: string; allocatedAmount: string; ratio: string }) => {
            expect(item).toHaveProperty('lineId');
            expect(item).toHaveProperty('allocatedAmount');
            expect(item).toHaveProperty('ratio');
          }
        );
      });

      it('除外行を指定してNET金額計算ができる (Req 5.4)', async () => {
        const response = await request(app)
          .post(`/api/estimates/${calcTestEstimateId}/calculate-net`)
          .set('Authorization', `Bearer ${accessToken}`)
          .send({
            vendorName: 'テスト業者',
            targetLineIds: vendorLineIds,
            excludeLineIds: [vendorLineIds[0]],
            netAmount: '1000000',
          });

        expect(response.status).toBe(200);
        expect(response.body).toBeInstanceOf(Array);
      });
    });

    describe('利益率適用 POST /api/estimates/:id/apply-profit-rate', () => {
      it('利益率を適用できる (Req 6.1, 6.2)', async () => {
        const response = await request(app)
          .post(`/api/estimates/${calcTestEstimateId}/apply-profit-rate`)
          .set('Authorization', `Bearer ${accessToken}`)
          .send({
            profitRate: '15.00',
            overwriteOption: 'all',
          });

        expect(response.status).toBe(200);
        expect(response.body).toBeInstanceOf(Array);
      });

      it('上書きオプションempty_onlyで利益率を適用できる (Req 6.4)', async () => {
        const response = await request(app)
          .post(`/api/estimates/${calcTestEstimateId}/apply-profit-rate`)
          .set('Authorization', `Bearer ${accessToken}`)
          .send({
            profitRate: '20.00',
            overwriteOption: 'empty_only',
          });

        expect(response.status).toBe(200);
      });

      it('上書きオプションunit_price_onlyで利益率を適用できる (Req 6.5)', async () => {
        const response = await request(app)
          .post(`/api/estimates/${calcTestEstimateId}/apply-profit-rate`)
          .set('Authorization', `Bearer ${accessToken}`)
          .send({
            profitRate: '25.00',
            overwriteOption: 'unit_price_only',
          });

        expect(response.status).toBe(200);
      });

      it('利益率が範囲外（0未満）の場合は400エラー (Req 6.3)', async () => {
        const response = await request(app)
          .post(`/api/estimates/${calcTestEstimateId}/apply-profit-rate`)
          .set('Authorization', `Bearer ${accessToken}`)
          .send({
            profitRate: '-10.00',
            overwriteOption: 'all',
          });

        expect(response.status).toBe(400);
      });

      it('利益率が範囲外（500超）の場合は400エラー', async () => {
        const response = await request(app)
          .post(`/api/estimates/${calcTestEstimateId}/apply-profit-rate`)
          .set('Authorization', `Bearer ${accessToken}`)
          .send({
            profitRate: '501.00',
            overwriteOption: 'all',
          });

        expect(response.status).toBe(400);
      });
    });

    describe('見積書出力 GET /api/estimates/:id/export', () => {
      it('PDF形式で見積書を出力できる (Req 10.1)', async () => {
        const response = await request(app)
          .get(`/api/estimates/${calcTestEstimateId}/export`)
          .query({ format: 'pdf' })
          .set('Authorization', `Bearer ${accessToken}`);

        expect(response.status).toBe(200);
        expect(response.headers['content-type']).toBe('application/pdf');
        expect(response.headers['content-disposition']).toContain('attachment');
        expect(response.body).toBeDefined();
      });

      it('Excel形式で見積書を出力できる (Req 10.2)', async () => {
        const response = await request(app)
          .get(`/api/estimates/${calcTestEstimateId}/export`)
          .query({ format: 'xlsx' })
          .set('Authorization', `Bearer ${accessToken}`);

        expect(response.status).toBe(200);
        expect(response.headers['content-type']).toBe(
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        );
        expect(response.headers['content-disposition']).toContain('attachment');
      });

      it('存在しない見積書を出力しようとすると404エラー', async () => {
        const response = await request(app)
          .get('/api/estimates/12345678-1234-4234-a234-123456789012/export')
          .query({ format: 'pdf' })
          .set('Authorization', `Bearer ${accessToken}`);

        expect(response.status).toBe(404);
        expect(response.body).toHaveProperty('code', 'ESTIMATE_NOT_FOUND');
      });

      it('不正な出力形式を指定すると400エラー', async () => {
        const response = await request(app)
          .get(`/api/estimates/${calcTestEstimateId}/export`)
          .query({ format: 'invalid' })
          .set('Authorization', `Bearer ${accessToken}`);

        expect(response.status).toBe(400);
      });
    });
  });
});
