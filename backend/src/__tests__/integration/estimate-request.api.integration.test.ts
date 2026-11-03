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

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
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
import { EstimateRequestService } from '../../services/estimate-request.service.js';
import { EstimateRequestStatusService } from '../../services/estimate-request-status.service.js';
import { AuditLogService } from '../../services/audit-log.service.js';
import type { IAuditLogService } from '../../types/audit-log.types.js';

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
    const user = await createTestUser(prisma, {
      email: 'test-estimate-request-integration@example.com',
      displayName: 'Estimate Request Test User',
      passwordHash,
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
      await prisma.rolePermission.createMany({
        data: permissions.map((permission) => ({
          roleId: userRole.id,
          permissionId: permission.id,
        })),
        skipDuplicates: true,
      });
    }

    // ログインしてトークンを取得
    const accessToken = await loginForAccessToken(app, {
      email: 'test-estimate-request-integration@example.com',
      password: 'TestPassword123!',
    });

    return {
      token: accessToken,
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
    const user = await createTestUser(prisma, {
      email: 'test-estimate-request-no-permission@example.com',
      displayName: 'No Permission Test User',
      passwordHash,
    });

    // ログインしてトークンを取得
    const accessToken = await loginForAccessToken(app, {
      email: 'test-estimate-request-no-permission@example.com',
      password: 'TestPassword123!',
    });

    return {
      token: accessToken,
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
          .query({ updatedAt: new Date().toISOString() });

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
        // 存在しない ID は案件の閲覧範囲の判定部品が汎用の 404（NOT_FOUND）にする。範囲外と区別しない
        // （estimate-request の Requirement 42.2・42.3、タスク103.1）
        expect(response.body.code).toBe('NOT_FOUND');
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

      // Requirements: 39.1, 39.2, 39.4 - itemizedStatementId は任意項目（Requirement 39 内訳書任意化）
      // design.md Backend Integration Tests（追記7, line 5635-5637）で要請されたカバレッジ
      it('itemizedStatementId を省略しても作成でき、レスポンスでは null となる (Req 39.2, 39.4)', async () => {
        const response = await request(app)
          .post(`/api/projects/${testProjectId}/estimate-requests`)
          .set('Authorization', `Bearer ${accessToken}`)
          .send({
            name: '内訳書なし作成テスト_省略',
            tradingPartnerId: testTradingPartnerId,
            // itemizedStatementId を意図的に省略
          });

        expect(response.status).toBe(201);
        expect(response.body).toMatchObject({
          name: '内訳書なし作成テスト_省略',
          projectId: testProjectId,
          tradingPartnerId: testTradingPartnerId,
          itemizedStatementId: null,
          method: 'EMAIL',
        });
        expect(response.body.id).toBeDefined();
      });

      it('itemizedStatementId に空文字を送信すると null に変換されて作成成功する (Req 39.1)', async () => {
        const response = await request(app)
          .post(`/api/projects/${testProjectId}/estimate-requests`)
          .set('Authorization', `Bearer ${accessToken}`)
          .send({
            name: '内訳書なし作成テスト_空文字',
            tradingPartnerId: testTradingPartnerId,
            itemizedStatementId: '',
          });

        expect(response.status).toBe(201);
        expect(response.body).toMatchObject({
          name: '内訳書なし作成テスト_空文字',
          projectId: testProjectId,
          tradingPartnerId: testTradingPartnerId,
          itemizedStatementId: null,
        });
      });

      // tasks.md line 1905 / design.md line 5637 では "422" と記述されているが、
      // 実装では Zod バリデーション失敗は ValidationError(statusCode=400) で返却される
      // （backend/src/errors/apiError.ts ValidationError、backend/src/middleware/validate.middleware.ts）。
      // 実装に合わせて 400 で検証する（不正 UUID のみエラーとなる挙動自体の確認が本質）。
      it('itemizedStatementId に不正な UUID 文字列を送ると 400（バリデーションエラー）を返す (Req 39.1)', async () => {
        const response = await request(app)
          .post(`/api/projects/${testProjectId}/estimate-requests`)
          .set('Authorization', `Bearer ${accessToken}`)
          .send({
            name: '不正 UUID テスト',
            tradingPartnerId: testTradingPartnerId,
            itemizedStatementId: 'invalid-uuid',
          });

        expect(response.status).toBe(400);
        // ValidationError 形式: code = 'VALIDATION_ERROR'
        expect(response.body.code).toBe('VALIDATION_ERROR');
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
        // 存在しない ID は案件の閲覧範囲の判定部品が汎用の 404（NOT_FOUND）にする。範囲外と区別しない
        // （estimate-request の Requirement 42.2・42.3、タスク103.1）
        expect(response.body.code).toBe('NOT_FOUND');
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
        // 存在しない ID は案件の閲覧範囲の判定部品が汎用の 404（NOT_FOUND）にする。範囲外と区別しない
        // （estimate-request の Requirement 42.2・42.3、タスク103.1）
        expect(response.body.code).toBe('NOT_FOUND');
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

      // 楽観的排他制御の基準時刻はクエリで送る（画面の deleteEstimateRequest と同じ形。HTTP は DELETE の
      // 本文に意味を定めず中継で落ちうるため。2026-10-31 の是正、Requirement 8.4・8.5）
      it('基準時刻をクエリで送って見積依頼を削除できる', async () => {
        const response = await request(app)
          .delete(`/api/estimate-requests/${testEstimateRequestId}`)
          .set('Authorization', `Bearer ${accessToken}`)
          .query({ updatedAt: testEstimateRequestUpdatedAt });

        expect(response.status).toBe(204);

        // 削除後は取得できないことを確認
        const getResponse = await request(app)
          .get(`/api/estimate-requests/${testEstimateRequestId}`)
          .set('Authorization', `Bearer ${accessToken}`);

        expect(getResponse.status).toBe(404);
      });

      it('基準時刻を本文だけに載せた削除は 400 を返し、見積依頼を削除しない', async () => {
        const response = await request(app)
          .delete(`/api/estimate-requests/${testEstimateRequestId}`)
          .set('Authorization', `Bearer ${accessToken}`)
          .send({ updatedAt: testEstimateRequestUpdatedAt });

        expect(response.status).toBe(400);

        const stored = await prisma.estimateRequest.findUniqueOrThrow({
          where: { id: testEstimateRequestId },
        });
        expect(stored.deletedAt).toBeNull();
      });

      it('基準時刻の無い削除は 400 を返し、見積依頼を削除しない', async () => {
        const response = await request(app)
          .delete(`/api/estimate-requests/${testEstimateRequestId}`)
          .set('Authorization', `Bearer ${accessToken}`);

        expect(response.status).toBe(400);

        const stored = await prisma.estimateRequest.findUniqueOrThrow({
          where: { id: testEstimateRequestId },
        });
        expect(stored.deletedAt).toBeNull();
      });

      it('存在しない見積依頼を削除しようとすると404を返す', async () => {
        const response = await request(app)
          .delete('/api/estimate-requests/12345678-1234-4234-a234-123456789012')
          .set('Authorization', `Bearer ${accessToken}`)
          .query({ updatedAt: new Date().toISOString() });

        expect(response.status).toBe(404);
        // 存在しない ID は案件の閲覧範囲の判定部品が汎用の 404（NOT_FOUND）にする。範囲外と区別しない
        // （estimate-request の Requirement 42.2・42.3、タスク103.1）
        expect(response.body.code).toBe('NOT_FOUND');
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
        .query({ updatedAt: '2020-01-01T00:00:00.000Z' }); // 過去のタイムスタンプ

      expect(response.status).toBe(409);
      expect(response.body.code).toBe('ESTIMATE_REQUEST_CONFLICT');

      // 競合した削除は見積依頼を取り除かない
      const stored = await prisma.estimateRequest.findUniqueOrThrow({
        where: { id: testEstimateRequestId },
      });
      expect(stored.deletedAt).toBeNull();
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
      // 存在しない ID は案件の閲覧範囲の判定部品が汎用の 404（NOT_FOUND）にする。範囲外と区別しない
      // （estimate-request の Requirement 42.2・42.3、タスク103.1）
      expect(response.body.code).toBe('NOT_FOUND');
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
      // 存在しない ID は案件の閲覧範囲の判定部品が汎用の 404（NOT_FOUND）にする。範囲外と区別しない
      // （estimate-request の Requirement 42.2・42.3、タスク103.1）
      expect(response.body.code).toBe('NOT_FOUND');
    });
  });
  // ==========================================
  // 監査ログをトランザクションの中で書く（タスク109.1）
  // ==========================================

  /**
   * 見積依頼の作成・更新・論理削除・項目の選択の保存・ステータスの変更の監査ログは、
   * 見積依頼の変更と同じトランザクションの中で書く。
   * 経路はモジュールの読み込み時にサービスを組み立てて依存を差し替えられないため、
   * サービスを直接組み立てて、記録の後にトランザクションを巻き戻す状況を作る。
   * 監査ログの数は、テスト用の DB の既存の記録に引っ張られないよう、このテストが作った対象の
   * targetId と操作の種別で数える。
   *
   * @requirement estimate-request/REQ-8.6
   */
  describe('見積依頼の監査ログとトランザクション（Requirement 8.6）', () => {
    const FAILURE_AFTER_LOG = '監査ログの記録の後の失敗（巻き戻しの検証）';
    let realAuditLogService: AuditLogService;
    let committingService: EstimateRequestService;
    let committingStatusService: EstimateRequestStatusService;
    let rollingBackService: EstimateRequestService;
    let rollingBackStatusService: EstimateRequestStatusService;
    let loggedTargetIds: string[];

    beforeAll(() => {
      realAuditLogService = new AuditLogService({ prisma });
      committingService = new EstimateRequestService({
        prisma,
        auditLogService: realAuditLogService,
      });
      committingStatusService = new EstimateRequestStatusService({
        prisma,
        auditLogService: realAuditLogService,
      });
    });

    beforeEach(() => {
      loggedTargetIds = [];
      // 本物の createLog(input, tx) で記録してから例外を投げ、トランザクションを巻き戻させる包み
      const failingAfterLog: IAuditLogService = {
        createLog: async (input, tx) => {
          loggedTargetIds.push(input.targetId);
          await realAuditLogService.createLog(input, tx);
          throw new Error(FAILURE_AFTER_LOG);
        },
        getLogs: (filter) => realAuditLogService.getLogs(filter),
        exportLogs: (filter) => realAuditLogService.exportLogs(filter),
      };
      rollingBackService = new EstimateRequestService({
        prisma,
        auditLogService: failingAfterLog,
      });
      rollingBackStatusService = new EstimateRequestStatusService({
        prisma,
        auditLogService: failingAfterLog,
      });
    });

    afterEach(async () => {
      await prisma.estimateRequest.deleteMany({
        where: { projectId: testProjectId },
      });
    });

    const uniqueName = (label: string): string =>
      `監査ログ検証_${label}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const countLogs = (action: string, targetId: string): Promise<number> =>
      prisma.auditLog.count({ where: { action, targetType: 'EstimateRequest', targetId } });

    /** 確定する経路で内訳書ありの見積依頼を作る（更新・論理削除・項目の選択・ステータスの対象） */
    const createCommitted = (label: string) =>
      committingService.create(
        {
          projectId: testProjectId,
          tradingPartnerId: testTradingPartnerId,
          itemizedStatementId: testItemizedStatementId,
          name: uniqueName(label),
          method: 'EMAIL',
        },
        testUserId
      );

    it('記録の後に作成が巻き戻ると、見積依頼も項目も ESTIMATE_REQUEST_CREATED の監査ログも残らない', async () => {
      const name = uniqueName('作成の巻き戻し');

      await expect(
        rollingBackService.create(
          {
            projectId: testProjectId,
            tradingPartnerId: testTradingPartnerId,
            itemizedStatementId: testItemizedStatementId,
            name,
            method: 'EMAIL',
          },
          testUserId
        )
      ).rejects.toThrow(FAILURE_AFTER_LOG);

      expect(loggedTargetIds).toHaveLength(1);
      const targetId = String(loggedTargetIds[0]);
      expect(await prisma.estimateRequest.count({ where: { id: targetId } })).toBe(0);
      expect(
        await prisma.estimateRequest.count({ where: { projectId: testProjectId, name } })
      ).toBe(0);
      expect(
        await prisma.estimateRequestItem.count({ where: { estimateRequestId: targetId } })
      ).toBe(0);
      expect(await countLogs('ESTIMATE_REQUEST_CREATED', targetId)).toBe(0);
    });

    it('記録の後に更新が巻き戻ると、名前は変わらず ESTIMATE_REQUEST_UPDATED の監査ログも残らない', async () => {
      const created = await createCommitted('更新の対象');

      await expect(
        rollingBackService.update(
          created.id,
          { name: uniqueName('更新の巻き戻し') },
          testUserId,
          new Date(created.updatedAt)
        )
      ).rejects.toThrow(FAILURE_AFTER_LOG);

      expect(loggedTargetIds).toEqual([created.id]);
      const stored = await prisma.estimateRequest.findUnique({ where: { id: created.id } });
      expect(stored?.name).toBe(created.name);
      expect(stored?.updatedAt.getTime()).toBe(new Date(created.updatedAt).getTime());
      expect(await countLogs('ESTIMATE_REQUEST_UPDATED', created.id)).toBe(0);
    });

    it('記録の後に論理削除が巻き戻ると、見積依頼は論理削除されず ESTIMATE_REQUEST_DELETED の監査ログも残らない', async () => {
      const created = await createCommitted('論理削除の対象');

      await expect(
        rollingBackService.delete(created.id, testUserId, new Date(created.updatedAt))
      ).rejects.toThrow(FAILURE_AFTER_LOG);

      expect(loggedTargetIds).toEqual([created.id]);
      const stored = await prisma.estimateRequest.findUnique({ where: { id: created.id } });
      expect(stored).not.toBeNull();
      expect(stored?.deletedAt).toBeNull();
      expect(await countLogs('ESTIMATE_REQUEST_DELETED', created.id)).toBe(0);
    });

    it('記録の後に項目の選択の保存が巻き戻ると、選択は変わらず ESTIMATE_REQUEST_ITEMS_UPDATED の監査ログも残らない', async () => {
      const created = await createCommitted('項目の選択の対象');
      const items = await prisma.estimateRequestItem.findMany({
        where: { estimateRequestId: created.id },
        orderBy: { id: 'asc' },
      });
      expect(items.length).toBeGreaterThan(0);
      expect(items.every((item) => item.selected === false)).toBe(true);

      await expect(
        rollingBackService.updateItemSelection(
          created.id,
          items.map((item) => ({ itemId: item.id, selected: true })),
          testUserId
        )
      ).rejects.toThrow(FAILURE_AFTER_LOG);

      expect(loggedTargetIds).toEqual([created.id]);
      const stored = await prisma.estimateRequestItem.findMany({
        where: { estimateRequestId: created.id },
      });
      expect(stored).toHaveLength(items.length);
      expect(stored.every((item) => item.selected === false)).toBe(true);
      expect(await countLogs('ESTIMATE_REQUEST_ITEMS_UPDATED', created.id)).toBe(0);
    });

    it('記録の後にステータスの変更が巻き戻ると、ステータスも履歴も変わらず ESTIMATE_REQUEST_STATUS_CHANGED の監査ログも残らない', async () => {
      const created = await createCommitted('ステータスの対象');
      expect(created.status).toBe('BEFORE_REQUEST');
      const historyBefore = await prisma.estimateRequestStatusHistory.count({
        where: { estimateRequestId: created.id },
      });

      await expect(
        rollingBackStatusService.transitionStatus(created.id, 'REQUESTED', testUserId)
      ).rejects.toThrow(FAILURE_AFTER_LOG);

      expect(loggedTargetIds).toEqual([created.id]);
      const stored = await prisma.estimateRequest.findUnique({ where: { id: created.id } });
      expect(stored?.status).toBe('BEFORE_REQUEST');
      expect(
        await prisma.estimateRequestStatusHistory.count({
          where: { estimateRequestId: created.id },
        })
      ).toBe(historyBefore);
      expect(await countLogs('ESTIMATE_REQUEST_STATUS_CHANGED', created.id)).toBe(0);
    });

    it('確定した作成・更新・項目の選択の保存・ステータスの変更・論理削除は、それぞれの監査ログを 1 件ずつ記録する（対照）', async () => {
      const created = await createCommitted('確定の作成');
      expect(await prisma.estimateRequest.count({ where: { id: created.id } })).toBe(1);
      expect(await countLogs('ESTIMATE_REQUEST_CREATED', created.id)).toBe(1);

      const renamed = uniqueName('確定の更新');
      await committingService.update(
        created.id,
        { name: renamed },
        testUserId,
        new Date(created.updatedAt)
      );
      expect((await prisma.estimateRequest.findUnique({ where: { id: created.id } }))?.name).toBe(
        renamed
      );
      expect(await countLogs('ESTIMATE_REQUEST_UPDATED', created.id)).toBe(1);

      const items = await prisma.estimateRequestItem.findMany({
        where: { estimateRequestId: created.id },
      });
      expect(items.length).toBeGreaterThan(0);
      await committingService.updateItemSelection(
        created.id,
        items.map((item) => ({ itemId: item.id, selected: true })),
        testUserId
      );
      const selected = await prisma.estimateRequestItem.findMany({
        where: { estimateRequestId: created.id },
      });
      expect(selected.every((item) => item.selected === true)).toBe(true);
      expect(await countLogs('ESTIMATE_REQUEST_ITEMS_UPDATED', created.id)).toBe(1);

      const transitioned = await committingStatusService.transitionStatus(
        created.id,
        'REQUESTED',
        testUserId
      );
      expect((await prisma.estimateRequest.findUnique({ where: { id: created.id } }))?.status).toBe(
        'REQUESTED'
      );
      expect(await countLogs('ESTIMATE_REQUEST_STATUS_CHANGED', created.id)).toBe(1);

      await committingService.delete(created.id, testUserId, new Date(transitioned.updatedAt));
      expect(
        (await prisma.estimateRequest.findUnique({ where: { id: created.id } }))?.deletedAt
      ).not.toBeNull();
      expect(await countLogs('ESTIMATE_REQUEST_DELETED', created.id)).toBe(1);
    });
  });
});
