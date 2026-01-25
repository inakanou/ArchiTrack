/**
 * @fileoverview 見積依頼API統合テスト
 *
 * TDD: RED phase - テストを先に書く
 *
 * 見積依頼APIの認証・認可、CRUD操作、楽観的排他制御の統合テストを実装します。
 *
 * Task 9.3: API統合テスト
 *
 * Requirements:
 * - 10.1: プロジェクトの閲覧権限を持つユーザーのみに見積依頼の閲覧を許可
 * - 10.2: プロジェクトの編集権限を持つユーザーのみに見積依頼の作成・編集・削除を許可
 * - 10.3: 権限のないユーザーが見積依頼にアクセスした場合アクセス拒否エラーを表示
 * - 10.4: 権限のないユーザーが見積依頼を操作しようとした場合操作拒否エラーを表示
 *
 * @module __tests__/integration/estimate-request.api.integration.test
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
 * 見積依頼API統合テスト
 */
describe('Estimate Request API Integration Tests', () => {
  let prisma: PrismaClient;
  let accessToken: string;
  let testUserId: string;
  let testProjectId: string;
  let testTradingPartnerId: string;
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

    // テストユーザーを作成
    const user = await prisma.user.create({
      data: {
        email: 'test-estimate-request-integration@example.com',
        displayName: 'Estimate Request Test User',
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

    // 見積依頼関連の権限を作成
    const estimateRequestPermissions = [
      { resource: 'estimate_request', action: 'create', description: '見積依頼の作成' },
      { resource: 'estimate_request', action: 'read', description: '見積依頼の閲覧' },
      { resource: 'estimate_request', action: 'update', description: '見積依頼の更新' },
      { resource: 'estimate_request', action: 'delete', description: '見積依頼の削除' },
    ];

    await prisma.permission.createMany({
      data: estimateRequestPermissions,
      skipDuplicates: true,
    });

    // 必要な権限を割り当て（プロジェクト、内訳書、見積依頼関連）
    const permissions = await prisma.permission.findMany({
      where: {
        OR: [
          { resource: 'project', action: { in: ['create', 'read', 'update', 'delete'] } },
          {
            resource: 'itemized_statement',
            action: { in: ['create', 'read', 'update', 'delete'] },
          },
          { resource: 'estimate_request', action: { in: ['create', 'read', 'update', 'delete'] } },
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
      email: 'test-estimate-request-integration@example.com',
      password: 'TestPassword123!',
    });

    return {
      token: response.body.accessToken,
      userId: user.id,
    };
  };

  /**
   * 権限のないテストユーザーを作成
   */
  const createUserWithoutPermissions = async (): Promise<{ token: string; userId: string }> => {
    const passwordHash = await (
      await import('@node-rs/argon2')
    ).hash('TestPassword123!', {
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4,
    });

    // 権限なしのテストユーザーを作成
    const user = await prisma.user.create({
      data: {
        email: 'test-estimate-request-no-permission@example.com',
        displayName: 'No Permission Test User',
        passwordHash,
      },
    });

    // ログインしてトークンを取得
    const response = await request(app).post('/api/v1/auth/login').send({
      email: 'test-estimate-request-no-permission@example.com',
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
        name: 'テスト用プロジェクト_見積依頼統合テスト',
        status: 'PREPARING',
        salesPersonId: testUserId,
        createdById: testUserId,
      },
    });
    return project.id;
  };

  /**
   * テスト用取引先（協力業者）を作成
   */
  const createTestTradingPartner = async (): Promise<string> => {
    const tradingPartner = await prisma.tradingPartner.create({
      data: {
        name: `テスト協力業者_${Date.now()}`,
        nameKana: 'テストキョウリョクギョウシャ',
        address: '東京都千代田区1-1-1',
        phoneNumber: '03-1234-5678',
        email: 'test-subcontractor@example.com',
        faxNumber: '03-1234-5679',
        types: {
          create: [{ type: 'SUBCONTRACTOR' }],
        },
      },
    });
    return tradingPartner.id;
  };

  /**
   * テスト用内訳書と項目を作成
   */
  const createTestItemizedStatement = async (): Promise<string> => {
    const statement = await prisma.itemizedStatement.create({
      data: {
        projectId: testProjectId,
        name: 'テスト内訳書_見積依頼統合テスト',
        sourceQuantityTableId: 'quantity-table-uuid-001',
        sourceQuantityTableName: 'テスト数量表',
        items: {
          create: [
            {
              customCategory: '任意分類1',
              workType: '工種1',
              name: '名称1',
              specification: '規格1',
              unit: '式',
              quantity: 10.5,
              displayOrder: 1,
            },
            {
              customCategory: '任意分類2',
              workType: '工種2',
              name: '名称2',
              specification: '規格2',
              unit: 'm',
              quantity: 20.0,
              displayOrder: 2,
            },
          ],
        },
      },
    });
    return statement.id;
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
    testTradingPartnerId = await createTestTradingPartner();
    testItemizedStatementId = await createTestItemizedStatement();
  });

  afterAll(async () => {
    // テストデータのクリーンアップ
    if (testProjectId) {
      await prisma.estimateRequest.deleteMany({
        where: { projectId: testProjectId },
      });
      await prisma.itemizedStatement.deleteMany({
        where: { projectId: testProjectId },
      });
      await prisma.project.deleteMany({
        where: { id: testProjectId },
      });
    }

    if (testTradingPartnerId) {
      await prisma.tradingPartner.delete({
        where: { id: testTradingPartnerId },
      });
    }

    await prisma.user.deleteMany({
      where: {
        email: {
          in: [
            'test-estimate-request-integration@example.com',
            'test-estimate-request-no-permission@example.com',
          ],
        },
      },
    });

    await prisma.$disconnect();
    redis.disconnect();
  });

  describe('認証・認可フローのテスト (Req 10.1, 10.2, 10.3, 10.4)', () => {
    describe('認証なしでのアクセス', () => {
      it('認証なしで見積依頼一覧にアクセスすると401を返す', async () => {
        const response = await request(app).get(`/api/projects/${testProjectId}/estimate-requests`);

        expect(response.status).toBe(401);
      });

      it('認証なしで見積依頼を作成しようとすると401を返す', async () => {
        const response = await request(app)
          .post(`/api/projects/${testProjectId}/estimate-requests`)
          .send({
            name: 'テスト見積依頼',
            tradingPartnerId: testTradingPartnerId,
            itemizedStatementId: testItemizedStatementId,
          });

        expect(response.status).toBe(401);
      });

      it('認証なしで見積依頼詳細にアクセスすると401を返す', async () => {
        const response = await request(app).get(
          '/api/estimate-requests/12345678-1234-4234-a234-123456789012'
        );

        expect(response.status).toBe(401);
      });

      it('認証なしで見積依頼を更新しようとすると401を返す', async () => {
        const response = await request(app)
          .put('/api/estimate-requests/12345678-1234-4234-a234-123456789012')
          .send({
            name: '更新テスト',
            expectedUpdatedAt: new Date().toISOString(),
          });

        expect(response.status).toBe(401);
      });

      it('認証なしで見積依頼を削除しようとすると401を返す', async () => {
        const response = await request(app)
          .delete('/api/estimate-requests/12345678-1234-4234-a234-123456789012')
          .send({ updatedAt: new Date().toISOString() });

        expect(response.status).toBe(401);
      });
    });

    describe('権限不足でのアクセス (Req 10.3, 10.4)', () => {
      let noPermissionToken: string;

      beforeAll(async () => {
        const auth = await createUserWithoutPermissions();
        noPermissionToken = auth.token;
      });

      afterAll(async () => {
        await prisma.user.deleteMany({
          where: { email: 'test-estimate-request-no-permission@example.com' },
        });
      });

      it('権限のないユーザーが見積依頼一覧にアクセスすると403を返す (Req 10.3)', async () => {
        const response = await request(app)
          .get(`/api/projects/${testProjectId}/estimate-requests`)
          .set('Authorization', `Bearer ${noPermissionToken}`);

        expect(response.status).toBe(403);
      });

      it('権限のないユーザーが見積依頼を作成しようとすると403を返す (Req 10.4)', async () => {
        const response = await request(app)
          .post(`/api/projects/${testProjectId}/estimate-requests`)
          .set('Authorization', `Bearer ${noPermissionToken}`)
          .send({
            name: 'テスト見積依頼',
            tradingPartnerId: testTradingPartnerId,
            itemizedStatementId: testItemizedStatementId,
          });

        expect(response.status).toBe(403);
      });
    });
  });

  describe('CRUD操作の統合テスト', () => {
    let testEstimateRequestId: string;
    let testEstimateRequestUpdatedAt: string;

    beforeEach(async () => {
      // 各テスト前に見積依頼をクリーンアップ
      await prisma.estimateRequest.deleteMany({
        where: { projectId: testProjectId },
      });
    });

    describe('見積依頼作成 (POST /api/projects/:projectId/estimate-requests)', () => {
      it('見積依頼を正常に作成できる', async () => {
        const response = await request(app)
          .post(`/api/projects/${testProjectId}/estimate-requests`)
          .set('Authorization', `Bearer ${accessToken}`)
          .send({
            name: 'テスト見積依頼',
            tradingPartnerId: testTradingPartnerId,
            itemizedStatementId: testItemizedStatementId,
          });

        expect(response.status).toBe(201);
        expect(response.body).toMatchObject({
          name: 'テスト見積依頼',
          projectId: testProjectId,
          tradingPartnerId: testTradingPartnerId,
          itemizedStatementId: testItemizedStatementId,
          method: 'EMAIL', // デフォルト値
        });
        expect(response.body.id).toBeDefined();
        expect(response.body.createdAt).toBeDefined();
        expect(response.body.updatedAt).toBeDefined();

        testEstimateRequestId = response.body.id;
        testEstimateRequestUpdatedAt = response.body.updatedAt;
      });

      it('見積依頼方法をFAXで作成できる', async () => {
        const response = await request(app)
          .post(`/api/projects/${testProjectId}/estimate-requests`)
          .set('Authorization', `Bearer ${accessToken}`)
          .send({
            name: 'FAX見積依頼',
            tradingPartnerId: testTradingPartnerId,
            itemizedStatementId: testItemizedStatementId,
            method: 'FAX',
          });

        expect(response.status).toBe(201);
        expect(response.body.method).toBe('FAX');
      });

      it('存在しない内訳書IDで作成しようとすると404を返す', async () => {
        const response = await request(app)
          .post(`/api/projects/${testProjectId}/estimate-requests`)
          .set('Authorization', `Bearer ${accessToken}`)
          .send({
            name: 'エラーテスト',
            tradingPartnerId: testTradingPartnerId,
            itemizedStatementId: '12345678-1234-4234-a234-123456789012',
          });

        expect(response.status).toBe(404);
        expect(response.body.code).toBe('ITEMIZED_STATEMENT_NOT_FOUND');
      });

      it('存在しない取引先IDで作成しようとすると404を返す', async () => {
        const response = await request(app)
          .post(`/api/projects/${testProjectId}/estimate-requests`)
          .set('Authorization', `Bearer ${accessToken}`)
          .send({
            name: 'エラーテスト',
            tradingPartnerId: '12345678-1234-4234-a234-123456789012',
            itemizedStatementId: testItemizedStatementId,
          });

        expect(response.status).toBe(404);
      });

      it('協力業者ではない取引先で作成しようとすると422を返す', async () => {
        // 顧客タイプの取引先を作成
        const customerPartner = await prisma.tradingPartner.create({
          data: {
            name: `テスト顧客_${Date.now()}`,
            nameKana: 'テストコキャク',
            address: '東京都千代田区2-2-2',
            types: {
              create: [{ type: 'CUSTOMER' }],
            },
          },
        });

        const response = await request(app)
          .post(`/api/projects/${testProjectId}/estimate-requests`)
          .set('Authorization', `Bearer ${accessToken}`)
          .send({
            name: 'エラーテスト',
            tradingPartnerId: customerPartner.id,
            itemizedStatementId: testItemizedStatementId,
          });

        expect(response.status).toBe(422);
        expect(response.body.code).toBe('TRADING_PARTNER_NOT_SUBCONTRACTOR');

        // クリーンアップ
        await prisma.tradingPartner.delete({ where: { id: customerPartner.id } });
      });

      it('名前が空の場合は400を返す', async () => {
        const response = await request(app)
          .post(`/api/projects/${testProjectId}/estimate-requests`)
          .set('Authorization', `Bearer ${accessToken}`)
          .send({
            name: '',
            tradingPartnerId: testTradingPartnerId,
            itemizedStatementId: testItemizedStatementId,
          });

        expect(response.status).toBe(400);
      });
    });

    describe('見積依頼一覧取得 (GET /api/projects/:projectId/estimate-requests)', () => {
      beforeEach(async () => {
        // テストデータを複数作成
        for (let i = 0; i < 3; i++) {
          await prisma.estimateRequest.create({
            data: {
              projectId: testProjectId,
              tradingPartnerId: testTradingPartnerId,
              itemizedStatementId: testItemizedStatementId,
              name: `一覧テスト見積依頼${i}`,
            },
          });
        }
      });

      it('見積依頼一覧を取得できる', async () => {
        const response = await request(app)
          .get(`/api/projects/${testProjectId}/estimate-requests`)
          .set('Authorization', `Bearer ${accessToken}`);

        expect(response.status).toBe(200);
        expect(response.body.data).toBeInstanceOf(Array);
        expect(response.body.data.length).toBe(3);
        expect(response.body.pagination).toMatchObject({
          page: 1,
          limit: expect.any(Number),
          total: 3,
          totalPages: expect.any(Number),
        });
      });

      it('ページネーションが動作する', async () => {
        const response = await request(app)
          .get(`/api/projects/${testProjectId}/estimate-requests`)
          .query({ page: 1, limit: 2 })
          .set('Authorization', `Bearer ${accessToken}`);

        expect(response.status).toBe(200);
        expect(response.body.data.length).toBe(2);
        expect(response.body.pagination).toMatchObject({
          page: 1,
          limit: 2,
          total: 3,
          totalPages: 2,
        });
      });
    });

    describe('見積依頼詳細取得 (GET /api/estimate-requests/:id)', () => {
      beforeEach(async () => {
        const estimateRequest = await prisma.estimateRequest.create({
          data: {
            projectId: testProjectId,
            tradingPartnerId: testTradingPartnerId,
            itemizedStatementId: testItemizedStatementId,
            name: '詳細取得テスト',
          },
        });
        testEstimateRequestId = estimateRequest.id;
        testEstimateRequestUpdatedAt = estimateRequest.updatedAt.toISOString();
      });

      it('見積依頼詳細を取得できる', async () => {
        const response = await request(app)
          .get(`/api/estimate-requests/${testEstimateRequestId}`)
          .set('Authorization', `Bearer ${accessToken}`);

        expect(response.status).toBe(200);
        expect(response.body).toMatchObject({
          id: testEstimateRequestId,
          name: '詳細取得テスト',
          projectId: testProjectId,
          tradingPartnerId: testTradingPartnerId,
          itemizedStatementId: testItemizedStatementId,
        });
      });

      it('存在しない見積依頼を取得しようとすると404を返す', async () => {
        const response = await request(app)
          .get('/api/estimate-requests/12345678-1234-4234-a234-123456789012')
          .set('Authorization', `Bearer ${accessToken}`);

        expect(response.status).toBe(404);
        expect(response.body.code).toBe('ESTIMATE_REQUEST_NOT_FOUND');
      });
    });

    describe('見積依頼更新 (PUT /api/estimate-requests/:id)', () => {
      beforeEach(async () => {
        const estimateRequest = await prisma.estimateRequest.create({
          data: {
            projectId: testProjectId,
            tradingPartnerId: testTradingPartnerId,
            itemizedStatementId: testItemizedStatementId,
            name: '更新テスト',
          },
        });
        testEstimateRequestId = estimateRequest.id;
        testEstimateRequestUpdatedAt = estimateRequest.updatedAt.toISOString();
      });

      it('見積依頼を更新できる', async () => {
        const response = await request(app)
          .put(`/api/estimate-requests/${testEstimateRequestId}`)
          .set('Authorization', `Bearer ${accessToken}`)
          .send({
            name: '更新後の名前',
            expectedUpdatedAt: testEstimateRequestUpdatedAt,
          });

        expect(response.status).toBe(200);
        expect(response.body.name).toBe('更新後の名前');
      });

      it('見積依頼方法を更新できる', async () => {
        const response = await request(app)
          .put(`/api/estimate-requests/${testEstimateRequestId}`)
          .set('Authorization', `Bearer ${accessToken}`)
          .send({
            method: 'FAX',
            expectedUpdatedAt: testEstimateRequestUpdatedAt,
          });

        expect(response.status).toBe(200);
        expect(response.body.method).toBe('FAX');
      });

      it('存在しない見積依頼を更新しようとすると404を返す', async () => {
        const response = await request(app)
          .put('/api/estimate-requests/12345678-1234-4234-a234-123456789012')
          .set('Authorization', `Bearer ${accessToken}`)
          .send({
            name: '更新テスト',
            expectedUpdatedAt: new Date().toISOString(),
          });

        expect(response.status).toBe(404);
        expect(response.body.code).toBe('ESTIMATE_REQUEST_NOT_FOUND');
      });
    });

    describe('見積依頼削除 (DELETE /api/estimate-requests/:id)', () => {
      beforeEach(async () => {
        const estimateRequest = await prisma.estimateRequest.create({
          data: {
            projectId: testProjectId,
            tradingPartnerId: testTradingPartnerId,
            itemizedStatementId: testItemizedStatementId,
            name: '削除テスト',
          },
        });
        testEstimateRequestId = estimateRequest.id;
        testEstimateRequestUpdatedAt = estimateRequest.updatedAt.toISOString();
      });

      it('見積依頼を削除できる', async () => {
        const response = await request(app)
          .delete(`/api/estimate-requests/${testEstimateRequestId}`)
          .set('Authorization', `Bearer ${accessToken}`)
          .send({ updatedAt: testEstimateRequestUpdatedAt });

        expect(response.status).toBe(204);

        // 削除後は取得できないことを確認
        const getResponse = await request(app)
          .get(`/api/estimate-requests/${testEstimateRequestId}`)
          .set('Authorization', `Bearer ${accessToken}`);

        expect(getResponse.status).toBe(404);
      });

      it('存在しない見積依頼を削除しようとすると404を返す', async () => {
        const response = await request(app)
          .delete('/api/estimate-requests/12345678-1234-4234-a234-123456789012')
          .set('Authorization', `Bearer ${accessToken}`)
          .send({ updatedAt: new Date().toISOString() });

        expect(response.status).toBe(404);
        expect(response.body.code).toBe('ESTIMATE_REQUEST_NOT_FOUND');
      });
    });
  });

  describe('楽観的排他制御のテスト（409エラー）', () => {
    let testEstimateRequestId: string;
    let testEstimateRequestUpdatedAt: string;

    beforeEach(async () => {
      // テスト用の見積依頼を作成
      const estimateRequest = await prisma.estimateRequest.create({
        data: {
          projectId: testProjectId,
          tradingPartnerId: testTradingPartnerId,
          itemizedStatementId: testItemizedStatementId,
          name: '楽観的排他制御テスト',
        },
      });
      testEstimateRequestId = estimateRequest.id;
      testEstimateRequestUpdatedAt = estimateRequest.updatedAt.toISOString();
    });

    afterEach(async () => {
      await prisma.estimateRequest.deleteMany({
        where: { projectId: testProjectId },
      });
    });

    it('更新時に古いupdatedAtを使用すると409を返す', async () => {
      // 別のリクエストで先に更新
      await request(app)
        .put(`/api/estimate-requests/${testEstimateRequestId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: '先行更新',
          expectedUpdatedAt: testEstimateRequestUpdatedAt,
        });

      // 古いupdatedAtで更新しようとする
      const response = await request(app)
        .put(`/api/estimate-requests/${testEstimateRequestId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: '競合更新',
          expectedUpdatedAt: testEstimateRequestUpdatedAt, // 古いタイムスタンプ
        });

      expect(response.status).toBe(409);
      expect(response.body.code).toBe('ESTIMATE_REQUEST_CONFLICT');
    });

    it('削除時に古いupdatedAtを使用すると409を返す', async () => {
      const response = await request(app)
        .delete(`/api/estimate-requests/${testEstimateRequestId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ updatedAt: '2020-01-01T00:00:00.000Z' }); // 過去のタイムスタンプ

      expect(response.status).toBe(409);
      expect(response.body.code).toBe('ESTIMATE_REQUEST_CONFLICT');
    });
  });

  describe('項目選択更新テスト (PATCH /api/estimate-requests/:id/items)', () => {
    let testEstimateRequestId: string;
    let testEstimateRequestItemId: string;

    beforeEach(async () => {
      // テスト用の見積依頼と項目を作成
      const itemizedStatement = await prisma.itemizedStatement.findUnique({
        where: { id: testItemizedStatementId },
        include: { items: true },
      });

      const estimateRequest = await prisma.estimateRequest.create({
        data: {
          projectId: testProjectId,
          tradingPartnerId: testTradingPartnerId,
          itemizedStatementId: testItemizedStatementId,
          name: '項目選択テスト',
          selectedItems: {
            create: itemizedStatement!.items.map((item) => ({
              itemizedStatementItemId: item.id,
              selected: false,
            })),
          },
        },
        include: {
          selectedItems: true,
        },
      });

      testEstimateRequestId = estimateRequest.id;
      testEstimateRequestItemId = estimateRequest.selectedItems[0]!.id;
    });

    afterEach(async () => {
      await prisma.estimateRequest.deleteMany({
        where: { projectId: testProjectId },
      });
    });

    it('項目の選択状態を更新できる', async () => {
      const response = await request(app)
        .patch(`/api/estimate-requests/${testEstimateRequestId}/items`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          items: [{ itemId: testEstimateRequestItemId, selected: true }],
        });

      expect(response.status).toBe(204);

      // 更新後の状態を確認
      const updatedItem = await prisma.estimateRequestItem.findUnique({
        where: { id: testEstimateRequestItemId },
      });
      expect(updatedItem!.selected).toBe(true);
    });

    it('存在しない見積依頼の項目を更新しようとすると404を返す', async () => {
      const response = await request(app)
        .patch('/api/estimate-requests/12345678-1234-4234-a234-123456789012/items')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          items: [{ itemId: testEstimateRequestItemId, selected: true }],
        });

      expect(response.status).toBe(404);
      expect(response.body.code).toBe('ESTIMATE_REQUEST_NOT_FOUND');
    });
  });

  describe('他の見積依頼での選択状態取得テスト (GET /api/estimate-requests/:id/items-with-status)', () => {
    let testEstimateRequestId: string;

    beforeEach(async () => {
      // テスト用の見積依頼と項目を作成
      const itemizedStatement = await prisma.itemizedStatement.findUnique({
        where: { id: testItemizedStatementId },
        include: { items: true },
      });

      const estimateRequest = await prisma.estimateRequest.create({
        data: {
          projectId: testProjectId,
          tradingPartnerId: testTradingPartnerId,
          itemizedStatementId: testItemizedStatementId,
          name: '選択状態取得テスト',
          selectedItems: {
            create: itemizedStatement!.items.map((item) => ({
              itemizedStatementItemId: item.id,
              selected: false,
            })),
          },
        },
      });

      testEstimateRequestId = estimateRequest.id;
    });

    afterEach(async () => {
      await prisma.estimateRequest.deleteMany({
        where: { projectId: testProjectId },
      });
    });

    it('項目一覧（他の見積依頼での選択状態を含む）を取得できる', async () => {
      const response = await request(app)
        .get(`/api/estimate-requests/${testEstimateRequestId}/items-with-status`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toBeInstanceOf(Array);
      expect(response.body.length).toBeGreaterThan(0);

      // 各項目が期待される構造を持つか確認
      const firstItem = response.body[0];
      expect(firstItem).toHaveProperty('id');
      expect(firstItem).toHaveProperty('estimateRequestItemId');
      expect(firstItem).toHaveProperty('customCategory');
      expect(firstItem).toHaveProperty('workType');
      expect(firstItem).toHaveProperty('name');
      expect(firstItem).toHaveProperty('specification');
      expect(firstItem).toHaveProperty('unit');
      expect(firstItem).toHaveProperty('quantity');
      expect(firstItem).toHaveProperty('selected');
      expect(firstItem).toHaveProperty('otherRequests');
      expect(firstItem.otherRequests).toBeInstanceOf(Array);
    });

    it('存在しない見積依頼の項目を取得しようとすると404を返す', async () => {
      const response = await request(app)
        .get('/api/estimate-requests/12345678-1234-4234-a234-123456789012/items-with-status')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(404);
      expect(response.body.code).toBe('ESTIMATE_REQUEST_NOT_FOUND');
    });
  });
});
