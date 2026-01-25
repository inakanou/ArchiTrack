/**
 * @fileoverview 受領見積書・ステータス管理API統合テスト
 *
 * TDD: RED phase - テストを先に書く
 *
 * 受領見積書とステータス管理APIの認証・認可、CRUD操作、楽観的排他制御の統合テストを実装します。
 *
 * Task 18.3: 受領見積書・ステータスAPI統合テスト
 *
 * Requirements:
 * - 11.9, 11.10: ファイルバリデーション
 * - 12.9, 12.10: ステータス遷移
 *
 * @module __tests__/integration/received-quotation-status.api.integration.test
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
 * 受領見積書・ステータス管理API統合テスト
 */
describe('Received Quotation & Status API Integration Tests', () => {
  let prisma: PrismaClient;
  let accessToken: string;
  let testUserId: string;
  let testProjectId: string;
  let testTradingPartnerId: string;
  let testItemizedStatementId: string;
  let testEstimateRequestId: string;

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
        email: 'test-received-quotation-integration@example.com',
        displayName: 'Received Quotation Test User',
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

    // 受領見積書・ステータス関連の権限を作成
    const additionalPermissions = [
      { resource: 'received_quotation', action: 'create', description: '受領見積書の作成' },
      { resource: 'received_quotation', action: 'read', description: '受領見積書の閲覧' },
      { resource: 'received_quotation', action: 'update', description: '受領見積書の更新' },
      { resource: 'received_quotation', action: 'delete', description: '受領見積書の削除' },
    ];

    await prisma.permission.createMany({
      data: additionalPermissions,
      skipDuplicates: true,
    });

    // 必要な権限を割り当て
    const permissions = await prisma.permission.findMany({
      where: {
        OR: [
          { resource: 'project', action: { in: ['create', 'read', 'update', 'delete'] } },
          {
            resource: 'itemized_statement',
            action: { in: ['create', 'read', 'update', 'delete'] },
          },
          { resource: 'estimate_request', action: { in: ['create', 'read', 'update', 'delete'] } },
          {
            resource: 'received_quotation',
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
      email: 'test-received-quotation-integration@example.com',
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
        email: 'test-quotation-no-permission@example.com',
        displayName: 'No Permission Test User',
        passwordHash,
      },
    });

    // ログインしてトークンを取得
    const response = await request(app).post('/api/v1/auth/login').send({
      email: 'test-quotation-no-permission@example.com',
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
        name: 'テスト用プロジェクト_受領見積書統合テスト',
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
        name: `テスト協力業者_受領見積書_${Date.now()}`,
        nameKana: 'テストキョウリョクギョウシャ',
        address: '東京都千代田区1-1-1',
        phoneNumber: '03-1234-5678',
        email: 'test-quotation@example.com',
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
        name: 'テスト内訳書_受領見積書統合テスト',
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
          ],
        },
      },
    });
    return statement.id;
  };

  /**
   * テスト用見積依頼を作成
   */
  const createTestEstimateRequest = async (): Promise<string> => {
    const itemizedStatement = await prisma.itemizedStatement.findUnique({
      where: { id: testItemizedStatementId },
      include: { items: true },
    });

    const estimateRequest = await prisma.estimateRequest.create({
      data: {
        projectId: testProjectId,
        tradingPartnerId: testTradingPartnerId,
        itemizedStatementId: testItemizedStatementId,
        name: 'テスト見積依頼_受領見積書統合テスト',
        status: 'BEFORE_REQUEST',
        selectedItems: {
          create: itemizedStatement!.items.map((item) => ({
            itemizedStatementItemId: item.id,
            selected: true,
          })),
        },
      },
    });
    return estimateRequest.id;
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
    testEstimateRequestId = await createTestEstimateRequest();
  });

  afterAll(async () => {
    // テストデータのクリーンアップ
    if (testEstimateRequestId) {
      await prisma.receivedQuotation.deleteMany({
        where: { estimateRequestId: testEstimateRequestId },
      });
      await prisma.estimateRequestStatusHistory.deleteMany({
        where: { estimateRequestId: testEstimateRequestId },
      });
      await prisma.estimateRequest.deleteMany({
        where: { id: testEstimateRequestId },
      });
    }

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
            'test-received-quotation-integration@example.com',
            'test-quotation-no-permission@example.com',
          ],
        },
      },
    });

    await prisma.$disconnect();
    redis.disconnect();
  });

  describe('受領見積書API認証・認可テスト', () => {
    describe('認証なしでのアクセス', () => {
      it('認証なしで受領見積書一覧にアクセスすると401を返す', async () => {
        const response = await request(app).get(
          `/api/estimate-requests/${testEstimateRequestId}/quotations`
        );

        expect(response.status).toBe(401);
      });

      it('認証なしで受領見積書を作成しようとすると401を返す', async () => {
        const response = await request(app)
          .post(`/api/estimate-requests/${testEstimateRequestId}/quotations`)
          .field('name', 'テスト受領見積書')
          .field('submittedAt', new Date().toISOString())
          .field('contentType', 'TEXT')
          .field('textContent', 'テスト内容');

        expect(response.status).toBe(401);
      });
    });

    describe('権限不足でのアクセス', () => {
      let noPermissionToken: string;

      beforeAll(async () => {
        const auth = await createUserWithoutPermissions();
        noPermissionToken = auth.token;
      });

      afterAll(async () => {
        await prisma.user.deleteMany({
          where: { email: 'test-quotation-no-permission@example.com' },
        });
      });

      it('権限のないユーザーが受領見積書一覧にアクセスすると403を返す', async () => {
        const response = await request(app)
          .get(`/api/estimate-requests/${testEstimateRequestId}/quotations`)
          .set('Authorization', `Bearer ${noPermissionToken}`);

        expect(response.status).toBe(403);
      });

      it('権限のないユーザーが受領見積書を作成しようとすると403を返す', async () => {
        const response = await request(app)
          .post(`/api/estimate-requests/${testEstimateRequestId}/quotations`)
          .set('Authorization', `Bearer ${noPermissionToken}`)
          .field('name', 'テスト受領見積書')
          .field('submittedAt', new Date().toISOString())
          .field('contentType', 'TEXT')
          .field('textContent', 'テスト内容');

        expect(response.status).toBe(403);
      });
    });
  });

  describe('受領見積書CRUD操作の統合テスト', () => {
    let testQuotationId: string;
    let testQuotationUpdatedAt: string;

    beforeEach(async () => {
      // 各テスト前に受領見積書をクリーンアップ
      await prisma.receivedQuotation.deleteMany({
        where: { estimateRequestId: testEstimateRequestId },
      });
    });

    describe('受領見積書作成 (POST /api/estimate-requests/:id/quotations)', () => {
      it('テキストコンテンツで受領見積書を正常に作成できる', async () => {
        const response = await request(app)
          .post(`/api/estimate-requests/${testEstimateRequestId}/quotations`)
          .set('Authorization', `Bearer ${accessToken}`)
          .field('name', 'テスト受領見積書')
          .field('submittedAt', '2026-01-23T00:00:00.000Z')
          .field('contentType', 'TEXT')
          .field('textContent', '見積金額: 1,000,000円');

        expect(response.status).toBe(201);
        expect(response.body).toMatchObject({
          name: 'テスト受領見積書',
          contentType: 'TEXT',
          textContent: '見積金額: 1,000,000円',
        });
        expect(response.body.id).toBeDefined();
        expect(response.body.createdAt).toBeDefined();
        expect(response.body.updatedAt).toBeDefined();

        testQuotationId = response.body.id;
        testQuotationUpdatedAt = response.body.updatedAt;
      });

      it('ファイルコンテンツで受領見積書を作成できる（multipart/form-data）', async () => {
        const pdfBuffer = Buffer.from('%PDF-1.4 test content');

        const response = await request(app)
          .post(`/api/estimate-requests/${testEstimateRequestId}/quotations`)
          .set('Authorization', `Bearer ${accessToken}`)
          .field('name', 'PDF受領見積書')
          .field('submittedAt', '2026-01-23T00:00:00.000Z')
          .field('contentType', 'FILE')
          .attach('file', pdfBuffer, {
            filename: 'quotation.pdf',
            contentType: 'application/pdf',
          });

        expect(response.status).toBe(201);
        expect(response.body).toMatchObject({
          name: 'PDF受領見積書',
          contentType: 'FILE',
          fileName: 'quotation.pdf',
          fileMimeType: 'application/pdf',
        });
      });

      it('存在しない見積依頼IDで作成しようとすると404を返す', async () => {
        const response = await request(app)
          .post('/api/estimate-requests/12345678-1234-4234-a234-123456789012/quotations')
          .set('Authorization', `Bearer ${accessToken}`)
          .field('name', 'テスト受領見積書')
          .field('submittedAt', '2026-01-23T00:00:00.000Z')
          .field('contentType', 'TEXT')
          .field('textContent', 'テスト');

        expect(response.status).toBe(404);
        expect(response.body.code).toBe('ESTIMATE_REQUEST_NOT_FOUND');
      });

      it('TEXTタイプでテキストがない場合は422を返す', async () => {
        const response = await request(app)
          .post(`/api/estimate-requests/${testEstimateRequestId}/quotations`)
          .set('Authorization', `Bearer ${accessToken}`)
          .field('name', 'テスト受領見積書')
          .field('submittedAt', '2026-01-23T00:00:00.000Z')
          .field('contentType', 'TEXT');

        expect(response.status).toBe(422);
        expect(response.body.code).toBe('INVALID_CONTENT_TYPE');
      });

      it('FILEタイプでファイルがない場合は422を返す', async () => {
        const response = await request(app)
          .post(`/api/estimate-requests/${testEstimateRequestId}/quotations`)
          .set('Authorization', `Bearer ${accessToken}`)
          .field('name', 'テスト受領見積書')
          .field('submittedAt', '2026-01-23T00:00:00.000Z')
          .field('contentType', 'FILE');

        expect(response.status).toBe(422);
        expect(response.body.code).toBe('INVALID_CONTENT_TYPE');
      });

      it('許可されていないファイル形式の場合は415を返す（Requirements: 11.8）', async () => {
        const exeBuffer = Buffer.from('MZ executable content');

        const response = await request(app)
          .post(`/api/estimate-requests/${testEstimateRequestId}/quotations`)
          .set('Authorization', `Bearer ${accessToken}`)
          .field('name', 'テスト受領見積書')
          .field('submittedAt', '2026-01-23T00:00:00.000Z')
          .field('contentType', 'FILE')
          .attach('file', exeBuffer, {
            filename: 'test.exe',
            contentType: 'application/x-msdownload',
          });

        expect(response.status).toBe(415);
        expect(response.body.code).toBe('INVALID_FILE_TYPE');
      });
    });

    describe('受領見積書一覧取得 (GET /api/estimate-requests/:id/quotations)', () => {
      beforeEach(async () => {
        // テストデータを複数作成
        await prisma.receivedQuotation.create({
          data: {
            estimateRequestId: testEstimateRequestId,
            name: '受領見積書1',
            submittedAt: new Date('2026-01-23'),
            contentType: 'TEXT',
            textContent: 'テスト1',
          },
        });
        await prisma.receivedQuotation.create({
          data: {
            estimateRequestId: testEstimateRequestId,
            name: '受領見積書2',
            submittedAt: new Date('2026-01-24'),
            contentType: 'TEXT',
            textContent: 'テスト2',
          },
        });
      });

      it('受領見積書一覧を取得できる', async () => {
        const response = await request(app)
          .get(`/api/estimate-requests/${testEstimateRequestId}/quotations`)
          .set('Authorization', `Bearer ${accessToken}`);

        expect(response.status).toBe(200);
        expect(response.body).toBeInstanceOf(Array);
        expect(response.body.length).toBe(2);
      });
    });

    describe('受領見積書詳細取得 (GET /api/quotations/:id)', () => {
      beforeEach(async () => {
        const quotation = await prisma.receivedQuotation.create({
          data: {
            estimateRequestId: testEstimateRequestId,
            name: '詳細取得テスト',
            submittedAt: new Date('2026-01-23'),
            contentType: 'TEXT',
            textContent: 'テスト内容',
          },
        });
        testQuotationId = quotation.id;
        testQuotationUpdatedAt = quotation.updatedAt.toISOString();
      });

      it('受領見積書詳細を取得できる', async () => {
        const response = await request(app)
          .get(`/api/quotations/${testQuotationId}`)
          .set('Authorization', `Bearer ${accessToken}`);

        expect(response.status).toBe(200);
        expect(response.body).toMatchObject({
          id: testQuotationId,
          name: '詳細取得テスト',
          contentType: 'TEXT',
        });
      });

      it('存在しない受領見積書を取得しようとすると404を返す', async () => {
        const response = await request(app)
          .get('/api/quotations/12345678-1234-4234-a234-123456789012')
          .set('Authorization', `Bearer ${accessToken}`);

        expect(response.status).toBe(404);
        expect(response.body.code).toBe('RECEIVED_QUOTATION_NOT_FOUND');
      });
    });

    describe('受領見積書更新 (PUT /api/quotations/:id)', () => {
      beforeEach(async () => {
        const quotation = await prisma.receivedQuotation.create({
          data: {
            estimateRequestId: testEstimateRequestId,
            name: '更新テスト',
            submittedAt: new Date('2026-01-23'),
            contentType: 'TEXT',
            textContent: '更新前テスト内容',
          },
        });
        testQuotationId = quotation.id;
        testQuotationUpdatedAt = quotation.updatedAt.toISOString();
      });

      it('受領見積書を更新できる', async () => {
        const response = await request(app)
          .put(`/api/quotations/${testQuotationId}`)
          .set('Authorization', `Bearer ${accessToken}`)
          .field('name', '更新後の名前')
          .field('expectedUpdatedAt', testQuotationUpdatedAt);

        expect(response.status).toBe(200);
        expect(response.body.name).toBe('更新後の名前');
      });

      it('存在しない受領見積書を更新しようとすると404を返す', async () => {
        const response = await request(app)
          .put('/api/quotations/12345678-1234-4234-a234-123456789012')
          .set('Authorization', `Bearer ${accessToken}`)
          .field('name', '更新テスト')
          .field('expectedUpdatedAt', new Date().toISOString());

        expect(response.status).toBe(404);
        expect(response.body.code).toBe('RECEIVED_QUOTATION_NOT_FOUND');
      });
    });

    describe('受領見積書削除 (DELETE /api/quotations/:id)', () => {
      beforeEach(async () => {
        const quotation = await prisma.receivedQuotation.create({
          data: {
            estimateRequestId: testEstimateRequestId,
            name: '削除テスト',
            submittedAt: new Date('2026-01-23'),
            contentType: 'TEXT',
            textContent: '削除テスト内容',
          },
        });
        testQuotationId = quotation.id;
        testQuotationUpdatedAt = quotation.updatedAt.toISOString();
      });

      it('受領見積書を削除できる', async () => {
        const response = await request(app)
          .delete(`/api/quotations/${testQuotationId}`)
          .set('Authorization', `Bearer ${accessToken}`)
          .send({ updatedAt: testQuotationUpdatedAt });

        expect(response.status).toBe(204);

        // 削除後は取得できないことを確認
        const getResponse = await request(app)
          .get(`/api/quotations/${testQuotationId}`)
          .set('Authorization', `Bearer ${accessToken}`);

        expect(getResponse.status).toBe(404);
      });

      it('存在しない受領見積書を削除しようとすると404を返す', async () => {
        const response = await request(app)
          .delete('/api/quotations/12345678-1234-4234-a234-123456789012')
          .set('Authorization', `Bearer ${accessToken}`)
          .send({ updatedAt: new Date().toISOString() });

        expect(response.status).toBe(404);
        expect(response.body.code).toBe('RECEIVED_QUOTATION_NOT_FOUND');
      });
    });
  });

  describe('受領見積書の楽観的排他制御テスト（409エラー）', () => {
    let testQuotationId: string;
    let testQuotationUpdatedAt: string;

    beforeEach(async () => {
      await prisma.receivedQuotation.deleteMany({
        where: { estimateRequestId: testEstimateRequestId },
      });

      const quotation = await prisma.receivedQuotation.create({
        data: {
          estimateRequestId: testEstimateRequestId,
          name: '楽観的排他制御テスト',
          submittedAt: new Date('2026-01-23'),
          contentType: 'TEXT',
          textContent: 'テスト内容',
        },
      });
      testQuotationId = quotation.id;
      testQuotationUpdatedAt = quotation.updatedAt.toISOString();
    });

    it('更新時に古いupdatedAtを使用すると409を返す', async () => {
      // 別のリクエストで先に更新
      await request(app)
        .put(`/api/quotations/${testQuotationId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .field('name', '先行更新')
        .field('expectedUpdatedAt', testQuotationUpdatedAt);

      // 古いupdatedAtで更新しようとする
      const response = await request(app)
        .put(`/api/quotations/${testQuotationId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .field('name', '競合更新')
        .field('expectedUpdatedAt', testQuotationUpdatedAt);

      expect(response.status).toBe(409);
      expect(response.body.code).toBe('RECEIVED_QUOTATION_CONFLICT');
    });

    it('削除時に古いupdatedAtを使用すると409を返す', async () => {
      const response = await request(app)
        .delete(`/api/quotations/${testQuotationId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ updatedAt: '2020-01-01T00:00:00.000Z' }); // 過去のタイムスタンプ

      expect(response.status).toBe(409);
      expect(response.body.code).toBe('RECEIVED_QUOTATION_CONFLICT');
    });
  });

  describe('ステータス遷移API統合テスト', () => {
    let statusTestEstimateRequestId: string;

    beforeEach(async () => {
      // ステータステスト用の新しい見積依頼を作成
      const itemizedStatement = await prisma.itemizedStatement.findUnique({
        where: { id: testItemizedStatementId },
        include: { items: true },
      });

      const estimateRequest = await prisma.estimateRequest.create({
        data: {
          projectId: testProjectId,
          tradingPartnerId: testTradingPartnerId,
          itemizedStatementId: testItemizedStatementId,
          name: `ステータステスト_${Date.now()}`,
          status: 'BEFORE_REQUEST',
          selectedItems: {
            create: itemizedStatement!.items.map((item) => ({
              itemizedStatementItemId: item.id,
              selected: true,
            })),
          },
        },
      });
      statusTestEstimateRequestId = estimateRequest.id;
    });

    afterEach(async () => {
      if (statusTestEstimateRequestId) {
        await prisma.estimateRequestStatusHistory.deleteMany({
          where: { estimateRequestId: statusTestEstimateRequestId },
        });
        await prisma.estimateRequest.deleteMany({
          where: { id: statusTestEstimateRequestId },
        });
      }
    });

    describe('ステータス遷移 (PATCH /api/estimate-requests/:id/status)', () => {
      it('依頼前から依頼済に遷移できる（Requirements: 12.9, 12.10）', async () => {
        const response = await request(app)
          .patch(`/api/estimate-requests/${statusTestEstimateRequestId}/status`)
          .set('Authorization', `Bearer ${accessToken}`)
          .send({ status: 'REQUESTED' });

        expect(response.status).toBe(200);
        expect(response.body.status).toBe('REQUESTED');
      });

      it('依頼済から見積受領済に遷移できる', async () => {
        // まず依頼済に遷移
        await request(app)
          .patch(`/api/estimate-requests/${statusTestEstimateRequestId}/status`)
          .set('Authorization', `Bearer ${accessToken}`)
          .send({ status: 'REQUESTED' });

        // 見積受領済に遷移
        const response = await request(app)
          .patch(`/api/estimate-requests/${statusTestEstimateRequestId}/status`)
          .set('Authorization', `Bearer ${accessToken}`)
          .send({ status: 'QUOTATION_RECEIVED' });

        expect(response.status).toBe(200);
        expect(response.body.status).toBe('QUOTATION_RECEIVED');
      });

      it('見積受領済から依頼済に戻せる', async () => {
        // まず依頼済に遷移
        await request(app)
          .patch(`/api/estimate-requests/${statusTestEstimateRequestId}/status`)
          .set('Authorization', `Bearer ${accessToken}`)
          .send({ status: 'REQUESTED' });

        // 見積受領済に遷移
        await request(app)
          .patch(`/api/estimate-requests/${statusTestEstimateRequestId}/status`)
          .set('Authorization', `Bearer ${accessToken}`)
          .send({ status: 'QUOTATION_RECEIVED' });

        // 依頼済に戻す
        const response = await request(app)
          .patch(`/api/estimate-requests/${statusTestEstimateRequestId}/status`)
          .set('Authorization', `Bearer ${accessToken}`)
          .send({ status: 'REQUESTED' });

        expect(response.status).toBe(200);
        expect(response.body.status).toBe('REQUESTED');
      });

      it('無効なステータス遷移（依頼済から依頼前）は400を返す', async () => {
        // まず依頼済に遷移
        await request(app)
          .patch(`/api/estimate-requests/${statusTestEstimateRequestId}/status`)
          .set('Authorization', `Bearer ${accessToken}`)
          .send({ status: 'REQUESTED' });

        // 依頼前に戻そうとする（無効な遷移）
        const response = await request(app)
          .patch(`/api/estimate-requests/${statusTestEstimateRequestId}/status`)
          .set('Authorization', `Bearer ${accessToken}`)
          .send({ status: 'BEFORE_REQUEST' });

        expect(response.status).toBe(400);
        expect(response.body.code).toBe('INVALID_STATUS_TRANSITION');
      });

      it('存在しない見積依頼のステータスを変更しようとすると404を返す', async () => {
        const response = await request(app)
          .patch('/api/estimate-requests/12345678-1234-4234-a234-123456789012/status')
          .set('Authorization', `Bearer ${accessToken}`)
          .send({ status: 'REQUESTED' });

        expect(response.status).toBe(404);
        expect(response.body.code).toBe('ESTIMATE_REQUEST_STATUS_NOT_FOUND');
      });
    });

    describe('ステータス変更履歴取得 (GET /api/estimate-requests/:id/status-history)', () => {
      it('ステータス変更履歴を取得できる', async () => {
        // ステータスを変更して履歴を作成
        await request(app)
          .patch(`/api/estimate-requests/${statusTestEstimateRequestId}/status`)
          .set('Authorization', `Bearer ${accessToken}`)
          .send({ status: 'REQUESTED' });

        const response = await request(app)
          .get(`/api/estimate-requests/${statusTestEstimateRequestId}/status-history`)
          .set('Authorization', `Bearer ${accessToken}`);

        expect(response.status).toBe(200);
        expect(response.body).toBeInstanceOf(Array);
        expect(response.body.length).toBeGreaterThan(0);
        expect(response.body[0]).toHaveProperty('fromStatus');
        expect(response.body[0]).toHaveProperty('toStatus');
        expect(response.body[0]).toHaveProperty('changedAt');
      });

      it('存在しない見積依頼の履歴を取得しようとすると404を返す', async () => {
        const response = await request(app)
          .get('/api/estimate-requests/12345678-1234-4234-a234-123456789012/status-history')
          .set('Authorization', `Bearer ${accessToken}`);

        expect(response.status).toBe(404);
        expect(response.body.code).toBe('ESTIMATE_REQUEST_STATUS_NOT_FOUND');
      });
    });
  });

  describe('ファイルプレビューURL取得 (GET /api/quotations/:id/preview)', () => {
    let fileQuotationId: string;

    beforeEach(async () => {
      await prisma.receivedQuotation.deleteMany({
        where: { estimateRequestId: testEstimateRequestId },
      });

      const quotation = await prisma.receivedQuotation.create({
        data: {
          estimateRequestId: testEstimateRequestId,
          name: 'ファイルプレビューテスト',
          submittedAt: new Date('2026-01-23'),
          contentType: 'FILE',
          filePath: 'quotations/test/file.pdf',
          fileName: 'file.pdf',
          fileMimeType: 'application/pdf',
          fileSize: 1024,
        },
      });
      fileQuotationId = quotation.id;
    });

    it('ファイルの署名付きURLを取得できる', async () => {
      const response = await request(app)
        .get(`/api/quotations/${fileQuotationId}/preview`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('url');
    });

    it('テキストコンテンツの受領見積書の場合は422を返す', async () => {
      // テキストコンテンツの受領見積書を作成
      const textQuotation = await prisma.receivedQuotation.create({
        data: {
          estimateRequestId: testEstimateRequestId,
          name: 'テキストプレビューテスト',
          submittedAt: new Date('2026-01-23'),
          contentType: 'TEXT',
          textContent: 'テスト内容',
        },
      });

      const response = await request(app)
        .get(`/api/quotations/${textQuotation.id}/preview`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(422);
      expect(response.body.code).toBe('INVALID_CONTENT_TYPE');
    });
  });
});
