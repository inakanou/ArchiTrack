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
import { readFileSync } from 'fs';
import { resolve } from 'path';
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
import { ReceivedQuotationService } from '../../services/received-quotation.service.js';
import { AuditLogService } from '../../services/audit-log.service.js';
import type { IAuditLogService } from '../../types/audit-log.types.js';
import type { StorageProvider } from '../../storage/storage-provider.interface.js';

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
    const user = await createTestUser(prisma, {
      email: 'test-received-quotation-integration@example.com',
      displayName: 'Received Quotation Test User',
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
      email: 'test-received-quotation-integration@example.com',
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
      email: 'test-quotation-no-permission@example.com',
      displayName: 'No Permission Test User',
      passwordHash,
    });

    // ログインしてトークンを取得
    const accessToken = await loginForAccessToken(app, {
      email: 'test-quotation-no-permission@example.com',
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
          .field('submittedAt', new Date().toISOString());

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
          .field('submittedAt', new Date().toISOString());

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
      it('受領見積書を正常に作成できる（ファイルなし、明細行あり）', async () => {
        // Requirements 11.22, 11.24: ファイルまたは明細行のいずれかが必須
        const lineItems = JSON.stringify([
          {
            name: 'テスト明細行',
            sortOrder: 0,
            quantity: 10,
            unitPrice: 1000,
          },
        ]);

        const response = await request(app)
          .post(`/api/estimate-requests/${testEstimateRequestId}/quotations`)
          .set('Authorization', `Bearer ${accessToken}`)
          .field('name', 'テスト受領見積書')
          .field('submittedAt', '2026-01-23T00:00:00.000Z')
          .field('lineItems', lineItems);

        expect(response.status).toBe(201);
        expect(response.body).toMatchObject({
          name: 'テスト受領見積書',
        });
        expect(response.body.id).toBeDefined();
        expect(response.body.createdAt).toBeDefined();
        expect(response.body.updatedAt).toBeDefined();
        expect(response.body.lineItems).toHaveLength(1);
        expect(response.body.totalAmount).toBe(10000);

        testQuotationId = response.body.id;
        testQuotationUpdatedAt = response.body.updatedAt;
      });

      it('ファイル付きで受領見積書を作成できる（multipart/form-data）', async () => {
        const pdfBuffer = Buffer.from('%PDF-1.4 test content');

        const response = await request(app)
          .post(`/api/estimate-requests/${testEstimateRequestId}/quotations`)
          .set('Authorization', `Bearer ${accessToken}`)
          .field('name', 'PDF受領見積書')
          .field('submittedAt', '2026-01-23T00:00:00.000Z')
          .attach('file', pdfBuffer, {
            filename: 'quotation.pdf',
            contentType: 'application/pdf',
          });

        expect(response.status).toBe(201);
        expect(response.body).toMatchObject({
          name: 'PDF受領見積書',
          fileName: 'quotation.pdf',
          fileMimeType: 'application/pdf',
        });
      });

      it('存在しない見積依頼IDで作成しようとすると404を返す', async () => {
        // Requirements 11.22, 11.24: ファイルまたは明細行のいずれかが必須
        const lineItems = JSON.stringify([
          {
            name: 'テスト明細行',
            sortOrder: 0,
            quantity: 1,
            unitPrice: 100,
          },
        ]);

        const response = await request(app)
          .post('/api/estimate-requests/12345678-1234-4234-a234-123456789012/quotations')
          .set('Authorization', `Bearer ${accessToken}`)
          .field('name', 'テスト受領見積書')
          .field('submittedAt', '2026-01-23T00:00:00.000Z')
          .field('lineItems', lineItems);

        expect(response.status).toBe(404);
        // 存在しない ID は案件の閲覧範囲の判定部品が汎用の 404（NOT_FOUND）にする。範囲外と区別しない
        // （estimate-request の Requirement 42.2・42.3、タスク103.1）
        expect(response.body.code).toBe('NOT_FOUND');
      });

      it('許可されていないファイル形式の場合は415を返す（Requirements: 11.8）', async () => {
        const exeBuffer = Buffer.from('MZ executable content');

        const response = await request(app)
          .post(`/api/estimate-requests/${testEstimateRequestId}/quotations`)
          .set('Authorization', `Bearer ${accessToken}`)
          .field('name', 'テスト受領見積書')
          .field('submittedAt', '2026-01-23T00:00:00.000Z')
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
            projectId: testProjectId,
            vendorName: 'テスト協力業者',
            name: '受領見積書1',
            submittedAt: new Date('2026-01-23'),
          },
        });
        await prisma.receivedQuotation.create({
          data: {
            estimateRequestId: testEstimateRequestId,
            projectId: testProjectId,
            vendorName: 'テスト協力業者',
            name: '受領見積書2',
            submittedAt: new Date('2026-01-24'),
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
            projectId: testProjectId,
            vendorName: 'テスト協力業者',
            name: '詳細取得テスト',
            submittedAt: new Date('2026-01-23'),
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
        });
      });

      it('存在しない受領見積書を取得しようとすると404を返す', async () => {
        const response = await request(app)
          .get('/api/quotations/12345678-1234-4234-a234-123456789012')
          .set('Authorization', `Bearer ${accessToken}`);

        expect(response.status).toBe(404);
        // 存在しない ID は案件の閲覧範囲の判定部品が汎用の 404（NOT_FOUND）にする。範囲外と区別しない
        // （estimate-request の Requirement 42.2・42.3、タスク103.1）
        expect(response.body.code).toBe('NOT_FOUND');
      });
    });

    describe('受領見積書更新 (PUT /api/quotations/:id)', () => {
      beforeEach(async () => {
        const quotation = await prisma.receivedQuotation.create({
          data: {
            estimateRequestId: testEstimateRequestId,
            projectId: testProjectId,
            vendorName: 'テスト協力業者',
            name: '更新テスト',
            submittedAt: new Date('2026-01-23'),
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
        // 存在しない ID は案件の閲覧範囲の判定部品が汎用の 404（NOT_FOUND）にする。範囲外と区別しない
        // （estimate-request の Requirement 42.2・42.3、タスク103.1）
        expect(response.body.code).toBe('NOT_FOUND');
      });
    });

    describe('受領見積書削除 (DELETE /api/quotations/:id)', () => {
      beforeEach(async () => {
        const quotation = await prisma.receivedQuotation.create({
          data: {
            estimateRequestId: testEstimateRequestId,
            projectId: testProjectId,
            vendorName: 'テスト協力業者',
            name: '削除テスト',
            submittedAt: new Date('2026-01-23'),
          },
        });
        testQuotationId = quotation.id;
        testQuotationUpdatedAt = quotation.updatedAt.toISOString();
      });

      // 楽観的排他制御の基準時刻はクエリで送る（画面の deleteReceivedQuotation と同じ形。HTTP は DELETE の
      // 本文に意味を定めず中継で落ちうるため。2026-10-31 の是正、Requirement 11.30・14.5・14.6）
      it('基準時刻をクエリで送って受領見積書を削除できる', async () => {
        const response = await request(app)
          .delete(`/api/quotations/${testQuotationId}`)
          .set('Authorization', `Bearer ${accessToken}`)
          .query({ updatedAt: testQuotationUpdatedAt });

        expect(response.status).toBe(204);

        // 削除後は取得できないことを確認
        const getResponse = await request(app)
          .get(`/api/quotations/${testQuotationId}`)
          .set('Authorization', `Bearer ${accessToken}`);

        expect(getResponse.status).toBe(404);
      });

      it('削除後もレコードが DB に残り deletedAt が設定される（Req 14.5）', async () => {
        const response = await request(app)
          .delete(`/api/quotations/${testQuotationId}`)
          .set('Authorization', `Bearer ${accessToken}`)
          .query({ updatedAt: testQuotationUpdatedAt });

        expect(response.status).toBe(204);

        const stored = await prisma.receivedQuotation.findUnique({
          where: { id: testQuotationId },
        });

        expect(stored).not.toBeNull();
        expect(stored?.deletedAt).not.toBeNull();
      });

      it('基準時刻を本文だけに載せた削除は 400 を返し、受領見積書を削除しない', async () => {
        const response = await request(app)
          .delete(`/api/quotations/${testQuotationId}`)
          .set('Authorization', `Bearer ${accessToken}`)
          .send({ updatedAt: testQuotationUpdatedAt });

        expect(response.status).toBe(400);

        const stored = await prisma.receivedQuotation.findUniqueOrThrow({
          where: { id: testQuotationId },
        });
        expect(stored.deletedAt).toBeNull();
      });

      it('基準時刻の無い削除は 400 を返し、受領見積書を削除しない', async () => {
        const response = await request(app)
          .delete(`/api/quotations/${testQuotationId}`)
          .set('Authorization', `Bearer ${accessToken}`);

        expect(response.status).toBe(400);

        const stored = await prisma.receivedQuotation.findUniqueOrThrow({
          where: { id: testQuotationId },
        });
        expect(stored.deletedAt).toBeNull();
      });

      it('存在しない受領見積書を削除しようとすると404を返す', async () => {
        const response = await request(app)
          .delete('/api/quotations/12345678-1234-4234-a234-123456789012')
          .set('Authorization', `Bearer ${accessToken}`)
          .query({ updatedAt: new Date().toISOString() });

        expect(response.status).toBe(404);
        // 存在しない ID は案件の閲覧範囲の判定部品が汎用の 404（NOT_FOUND）にする。範囲外と区別しない
        // （estimate-request の Requirement 42.2・42.3、タスク103.1）
        expect(response.body.code).toBe('NOT_FOUND');
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
          projectId: testProjectId,
          vendorName: 'テスト協力業者',
          name: '楽観的排他制御テスト',
          submittedAt: new Date('2026-01-23'),
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
        .query({ updatedAt: '2020-01-01T00:00:00.000Z' }); // 過去のタイムスタンプ

      expect(response.status).toBe(409);
      expect(response.body.code).toBe('RECEIVED_QUOTATION_CONFLICT');

      // 競合した削除は受領見積書を取り除かない
      const stored = await prisma.receivedQuotation.findUniqueOrThrow({
        where: { id: testQuotationId },
      });
      expect(stored.deletedAt).toBeNull();
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
        // 存在しない ID は案件の閲覧範囲の判定部品が汎用の 404（NOT_FOUND）にする。範囲外と区別しない
        // （estimate-request の Requirement 42.2・42.3、タスク103.1）
        expect(response.body.code).toBe('NOT_FOUND');
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
        // 存在しない ID は案件の閲覧範囲の判定部品が汎用の 404（NOT_FOUND）にする。範囲外と区別しない
        // （estimate-request の Requirement 42.2・42.3、タスク103.1）
        expect(response.body.code).toBe('NOT_FOUND');
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
          projectId: testProjectId,
          vendorName: 'テスト協力業者',
          name: 'ファイルプレビューテスト',
          submittedAt: new Date('2026-01-23'),
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

    it('ファイルなしの受領見積書の場合は422を返す', async () => {
      // ファイルなしの受領見積書を作成
      const noFileQuotation = await prisma.receivedQuotation.create({
        data: {
          estimateRequestId: testEstimateRequestId,
          projectId: testProjectId,
          vendorName: 'テスト協力業者',
          name: 'ファイルなしプレビューテスト',
          submittedAt: new Date('2026-01-23'),
        },
      });

      const response = await request(app)
        .get(`/api/quotations/${noFileQuotation.id}/preview`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(422);
      expect(response.body.code).toBe('INVALID_CONTENT_TYPE');
    });
  });

  /**
   * Task 27.2: 受領見積書API統合テストの明細行対応追加
   *
   * Requirements:
   * - 11.9: 構造化データ入力エリア
   * - 11.22: ファイルまたは明細行データのいずれかが必須
   * - 11.24: ファイルも明細行もない場合のバリデーションエラー
   * - 14.2: 明細行データをDBに永続化
   */
  describe('受領見積書API統合テスト - 明細行対応（Task 27.2）', () => {
    beforeEach(async () => {
      // 各テスト前に受領見積書をクリーンアップ
      await prisma.receivedQuotation.deleteMany({
        where: { estimateRequestId: testEstimateRequestId },
      });
    });

    describe('明細行データを含むmultipartリクエストの統合テスト', () => {
      it('明細行データを含む受領見積書を正常に作成できる（Requirements: 11.9, 14.2）', async () => {
        const lineItems = JSON.stringify([
          {
            name: '外壁塗装工事',
            sortOrder: 0,
            specification: 'シリコン系',
            unit: 'm2',
            quantity: 150,
            unitPrice: 3500,
            amount: 525000,
            remarks: '足場込み',
          },
          {
            name: '防水工事',
            sortOrder: 1,
            specification: 'ウレタン防水',
            unit: 'm2',
            quantity: 50,
            unitPrice: 8000,
            amount: 400000,
            remarks: null,
          },
        ]);

        const response = await request(app)
          .post(`/api/estimate-requests/${testEstimateRequestId}/quotations`)
          .set('Authorization', `Bearer ${accessToken}`)
          .field('name', '明細付き受領見積書')
          .field('submittedAt', '2026-02-01T00:00:00.000Z')
          .field('lineItems', lineItems);

        expect(response.status).toBe(201);
        expect(response.body).toMatchObject({
          name: '明細付き受領見積書',
        });
        expect(response.body.lineItems).toBeDefined();
        expect(response.body.lineItems).toHaveLength(2);
        expect(response.body.lineItems[0].name).toBe('外壁塗装工事');
        expect(response.body.lineItems[1].name).toBe('防水工事');
        expect(response.body.totalAmount).toBe(925000);
      });

      it('ファイルと明細行の両方を含む受領見積書を作成できる', async () => {
        const lineItems = JSON.stringify([
          {
            name: '設備工事',
            sortOrder: 0,
            specification: '電気設備',
            unit: '式',
            quantity: 1,
            unitPrice: 500000,
            amount: 500000,
          },
        ]);

        const pdfBuffer = Buffer.from('%PDF-1.4 test content');

        const response = await request(app)
          .post(`/api/estimate-requests/${testEstimateRequestId}/quotations`)
          .set('Authorization', `Bearer ${accessToken}`)
          .field('name', 'ファイル+明細受領見積書')
          .field('submittedAt', '2026-02-01T00:00:00.000Z')
          .field('lineItems', lineItems)
          .attach('file', pdfBuffer, {
            filename: 'quotation.pdf',
            contentType: 'application/pdf',
          });

        expect(response.status).toBe(201);
        expect(response.body.fileName).toBe('quotation.pdf');
        expect(response.body.lineItems).toHaveLength(1);
        expect(response.body.totalAmount).toBe(500000);
      });
    });

    describe('明細行バリデーションエラーの統合テスト', () => {
      it('ファイルも明細行もない場合は400を返す（Requirements: 11.22, 11.24）', async () => {
        const response = await request(app)
          .post(`/api/estimate-requests/${testEstimateRequestId}/quotations`)
          .set('Authorization', `Bearer ${accessToken}`)
          .field('name', 'バリデーションエラーテスト')
          .field('submittedAt', '2026-02-01T00:00:00.000Z');
        // ファイルも明細行も送信しない

        expect(response.status).toBe(400);
        expect(response.body.message).toContain(
          'ファイルのアップロードまたは明細行データの入力が必要です'
        );
      });

      it('空の明細行配列の場合も400を返す', async () => {
        const response = await request(app)
          .post(`/api/estimate-requests/${testEstimateRequestId}/quotations`)
          .set('Authorization', `Bearer ${accessToken}`)
          .field('name', '空配列バリデーションエラーテスト')
          .field('submittedAt', '2026-02-01T00:00:00.000Z')
          .field('lineItems', '[]'); // 空配列

        expect(response.status).toBe(400);
        expect(response.body.message).toContain(
          'ファイルのアップロードまたは明細行データの入力が必要です'
        );
      });

      it('明細行のnameが空の場合はバリデーションエラーを返す', async () => {
        const lineItems = JSON.stringify([
          {
            name: '', // 名称が空
            sortOrder: 0,
            quantity: 10,
            unitPrice: 1000,
          },
        ]);

        const response = await request(app)
          .post(`/api/estimate-requests/${testEstimateRequestId}/quotations`)
          .set('Authorization', `Bearer ${accessToken}`)
          .field('name', '名称空バリデーションエラーテスト')
          .field('submittedAt', '2026-02-01T00:00:00.000Z')
          .field('lineItems', lineItems);

        expect(response.status).toBe(400);
      });
    });

    describe('明細行全量置換の統合テスト', () => {
      it('受領見積書更新時に明細行が全量置換される', async () => {
        // まず受領見積書を作成
        const initialLineItems = JSON.stringify([
          { name: '初期項目A', sortOrder: 0, quantity: 1, unitPrice: 10000, amount: 10000 },
          { name: '初期項目B', sortOrder: 1, quantity: 2, unitPrice: 20000, amount: 40000 },
        ]);

        const createResponse = await request(app)
          .post(`/api/estimate-requests/${testEstimateRequestId}/quotations`)
          .set('Authorization', `Bearer ${accessToken}`)
          .field('name', '全量置換テスト見積書')
          .field('submittedAt', '2026-02-01T00:00:00.000Z')
          .field('lineItems', initialLineItems);

        expect(createResponse.status).toBe(201);
        const createdId = createResponse.body.id;
        const updatedAt = createResponse.body.updatedAt;
        expect(createResponse.body.lineItems).toHaveLength(2);

        // 新しい明細行で更新
        const newLineItems = JSON.stringify([
          { name: '新項目X', sortOrder: 0, quantity: 5, unitPrice: 5000, amount: 25000 },
          { name: '新項目Y', sortOrder: 1, quantity: 3, unitPrice: 15000, amount: 45000 },
          { name: '新項目Z', sortOrder: 2, quantity: 1, unitPrice: 100000, amount: 100000 },
        ]);

        const updateResponse = await request(app)
          .put(`/api/quotations/${createdId}`)
          .set('Authorization', `Bearer ${accessToken}`)
          .field('expectedUpdatedAt', updatedAt)
          .field('lineItems', newLineItems);

        expect(updateResponse.status).toBe(200);
        expect(updateResponse.body.lineItems).toHaveLength(3);
        expect(updateResponse.body.lineItems[0].name).toBe('新項目X');
        expect(updateResponse.body.lineItems[1].name).toBe('新項目Y');
        expect(updateResponse.body.lineItems[2].name).toBe('新項目Z');
        expect(updateResponse.body.totalAmount).toBe(170000);
      });
    });

    describe('レスポンスに明細行データと合計金額が含まれることの検証', () => {
      it('受領見積書詳細取得時に明細行と合計金額が含まれる', async () => {
        // 受領見積書を作成
        const lineItems = JSON.stringify([
          { name: '工事A', sortOrder: 0, quantity: 10, unitPrice: 10000, amount: 100000 },
          { name: '工事B', sortOrder: 1, quantity: 5, unitPrice: 20000, amount: 100000 },
        ]);

        const createResponse = await request(app)
          .post(`/api/estimate-requests/${testEstimateRequestId}/quotations`)
          .set('Authorization', `Bearer ${accessToken}`)
          .field('name', '詳細取得テスト見積書')
          .field('submittedAt', '2026-02-01T00:00:00.000Z')
          .field('lineItems', lineItems);

        expect(createResponse.status).toBe(201);
        const createdId = createResponse.body.id;

        // 詳細取得
        const getResponse = await request(app)
          .get(`/api/quotations/${createdId}`)
          .set('Authorization', `Bearer ${accessToken}`);

        expect(getResponse.status).toBe(200);
        expect(getResponse.body.lineItems).toBeDefined();
        expect(getResponse.body.lineItems).toHaveLength(2);
        expect(getResponse.body.totalAmount).toBe(200000);
      });

      it('受領見積書一覧取得時に明細行と合計金額が含まれる', async () => {
        // 複数の受領見積書を作成
        const lineItems1 = JSON.stringify([
          { name: '項目1', sortOrder: 0, quantity: 1, unitPrice: 50000, amount: 50000 },
        ]);
        const lineItems2 = JSON.stringify([
          { name: '項目2', sortOrder: 0, quantity: 2, unitPrice: 30000, amount: 60000 },
          { name: '項目3', sortOrder: 1, quantity: 3, unitPrice: 10000, amount: 30000 },
        ]);

        await request(app)
          .post(`/api/estimate-requests/${testEstimateRequestId}/quotations`)
          .set('Authorization', `Bearer ${accessToken}`)
          .field('name', '一覧テスト見積書1')
          .field('submittedAt', '2026-02-01T00:00:00.000Z')
          .field('lineItems', lineItems1);

        await request(app)
          .post(`/api/estimate-requests/${testEstimateRequestId}/quotations`)
          .set('Authorization', `Bearer ${accessToken}`)
          .field('name', '一覧テスト見積書2')
          .field('submittedAt', '2026-02-02T00:00:00.000Z')
          .field('lineItems', lineItems2);

        // 一覧取得
        const listResponse = await request(app)
          .get(`/api/estimate-requests/${testEstimateRequestId}/quotations`)
          .set('Authorization', `Bearer ${accessToken}`);

        expect(listResponse.status).toBe(200);
        expect(listResponse.body).toBeInstanceOf(Array);
        expect(listResponse.body.length).toBe(2);

        // 各レコードに明細行と合計金額が含まれていることを確認
        const quotation1 = listResponse.body.find(
          (q: { name: string }) => q.name === '一覧テスト見積書1'
        );
        const quotation2 = listResponse.body.find(
          (q: { name: string }) => q.name === '一覧テスト見積書2'
        );

        expect(quotation1.lineItems).toHaveLength(1);
        expect(quotation1.totalAmount).toBe(50000);
        expect(quotation2.lineItems).toHaveLength(2);
        expect(quotation2.totalAmount).toBe(90000);
      });
    });
  });

  // ==========================================
  // 監査ログをトランザクションの中で書く（タスク111.1）
  // ==========================================

  /**
   * 受領見積書の作成・更新・論理削除が確定したときに、その操作の監査ログを 1 件記録し、
   * 確定しなかった操作（記録の後の巻き戻し、不在・競合による拒否）の監査ログを残さない。
   * 確定の対照は経路（`req.user` の利用者の受け渡しと組み立てを含む）を通して確かめる。
   * 巻き戻しは経路の組み立てでは依存を差し替えられないため、サービスを直接組み立てて、
   * 本物の `createLog(input, tx)` で記録してから例外を投げる包みを注入する（タスク109.1 と同じ形）。
   * 監査ログの数は、テスト用の DB の既存の記録に引っ張られないよう、このテストが作った対象の
   * targetId と操作の種別で数える。
   *
   * @requirement estimate-request/REQ-14.7
   */
  describe('受領見積書の監査ログとトランザクション（Requirement 14.7）', () => {
    const FAILURE_AFTER_LOG = '監査ログの記録の後の失敗（巻き戻しの検証）';
    const NET_AMOUNT = 7_654_321;
    let realAuditLogService: AuditLogService;
    let rollingBackService: ReceivedQuotationService;
    let loggedTargetIds: string[];

    /** 巻き戻しの検証はファイルを扱わないため、ストレージは呼ばれたら失敗させる */
    const unusedStorage = {
      upload: () => Promise.reject(new Error('ストレージは呼ばれない前提')),
      delete: () => Promise.reject(new Error('ストレージは呼ばれない前提')),
      getSignedUrl: () => Promise.reject(new Error('ストレージは呼ばれない前提')),
    } as unknown as StorageProvider;

    beforeAll(() => {
      realAuditLogService = new AuditLogService({ prisma });
    });

    beforeEach(async () => {
      await prisma.receivedQuotation.deleteMany({
        where: { estimateRequestId: testEstimateRequestId },
      });
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
      rollingBackService = new ReceivedQuotationService({
        prisma,
        storageProvider: unusedStorage,
        auditLogService: failingAfterLog,
      });
    });

    const uniqueName = (label: string): string =>
      `監査ログ検証_${label}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const countLogs = (action: string, targetId: string): Promise<number> =>
      prisma.auditLog.count({ where: { action, targetType: 'ReceivedQuotation', targetId } });

    const createStored = async (label: string) =>
      prisma.receivedQuotation.create({
        data: {
          estimateRequestId: testEstimateRequestId,
          projectId: testProjectId,
          vendorName: 'テスト協力業者',
          name: uniqueName(label),
          submittedAt: new Date('2026-01-23T00:00:00.000Z'),
          netAmount: NET_AMOUNT,
        },
      });

    it('確定した作成・更新・論理削除は、それぞれの監査ログを操作した利用者で 1 件ずつ記録し、金額を入れない（対照）', async () => {
      const name = uniqueName('確定の作成');
      const createResponse = await request(app)
        .post(`/api/estimate-requests/${testEstimateRequestId}/quotations`)
        .set('Authorization', `Bearer ${accessToken}`)
        .field('name', name)
        .field('submittedAt', '2026-01-23T00:00:00.000Z')
        .field('netAmount', String(NET_AMOUNT))
        .field(
          'lineItems',
          JSON.stringify([{ name: '明細', sortOrder: 0, quantity: 3, unitPrice: 1000 }])
        );
      expect(createResponse.status).toBe(201);
      const quotationId: string = createResponse.body.id;
      expect(await countLogs('RECEIVED_QUOTATION_CREATED', quotationId)).toBe(1);
      const createdLog = await prisma.auditLog.findFirstOrThrow({
        where: {
          action: 'RECEIVED_QUOTATION_CREATED',
          targetType: 'ReceivedQuotation',
          targetId: quotationId,
        },
      });
      expect(createdLog.actorId).toBe(testUserId);
      expect(createdLog.before).toBeNull();
      expect(createdLog.after).toEqual({
        estimateRequestId: testEstimateRequestId,
        name,
        submittedAt: '2026-01-23T00:00:00.000Z',
        fileName: null,
        lineItemCount: 1,
      });
      expect(JSON.stringify(createdLog.after)).not.toContain(String(NET_AMOUNT));

      const renamed = uniqueName('確定の更新');
      const updateResponse = await request(app)
        .put(`/api/quotations/${quotationId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .field('name', renamed)
        .field('expectedUpdatedAt', createResponse.body.updatedAt);
      expect(updateResponse.status).toBe(200);
      expect(await countLogs('RECEIVED_QUOTATION_UPDATED', quotationId)).toBe(1);
      const updatedLog = await prisma.auditLog.findFirstOrThrow({
        where: {
          action: 'RECEIVED_QUOTATION_UPDATED',
          targetType: 'ReceivedQuotation',
          targetId: quotationId,
        },
      });
      expect(updatedLog.actorId).toBe(testUserId);
      expect(updatedLog.before).toEqual({
        name,
        submittedAt: '2026-01-23T00:00:00.000Z',
        fileName: null,
      });
      expect(updatedLog.after).toEqual({
        name: renamed,
        submittedAt: '2026-01-23T00:00:00.000Z',
        fileName: null,
      });

      const deleteResponse = await request(app)
        .delete(`/api/quotations/${quotationId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .query({ updatedAt: updateResponse.body.updatedAt });
      expect(deleteResponse.status).toBe(204);
      expect(await countLogs('RECEIVED_QUOTATION_DELETED', quotationId)).toBe(1);
      const deletedLog = await prisma.auditLog.findFirstOrThrow({
        where: {
          action: 'RECEIVED_QUOTATION_DELETED',
          targetType: 'ReceivedQuotation',
          targetId: quotationId,
        },
      });
      expect(deletedLog.actorId).toBe(testUserId);
      expect(deletedLog.after).toBeNull();
      expect(deletedLog.before).toEqual({
        estimateRequestId: testEstimateRequestId,
        name: renamed,
        submittedAt: '2026-01-23T00:00:00.000Z',
        fileName: null,
      });
    });

    it('記録の後に作成が巻き戻ると、受領見積書も明細行も RECEIVED_QUOTATION_CREATED の監査ログも残らない', async () => {
      const name = uniqueName('作成の巻き戻し');

      await expect(
        rollingBackService.create(
          { kind: 'estimateRequest', estimateRequestId: testEstimateRequestId },
          {
            name,
            submittedAt: new Date('2026-01-23T00:00:00.000Z'),
            lineItems: [{ name: '明細', sortOrder: 0, quantity: 1, unitPrice: 1000 }],
          },
          testUserId
        )
      ).rejects.toThrow(FAILURE_AFTER_LOG);

      expect(loggedTargetIds).toHaveLength(1);
      const targetId = String(loggedTargetIds[0]);
      expect(await prisma.receivedQuotation.count({ where: { id: targetId } })).toBe(0);
      expect(
        await prisma.receivedQuotation.count({
          where: { estimateRequestId: testEstimateRequestId, name },
        })
      ).toBe(0);
      expect(
        await prisma.receivedQuotationLineItem.count({ where: { receivedQuotationId: targetId } })
      ).toBe(0);
      expect(await countLogs('RECEIVED_QUOTATION_CREATED', targetId)).toBe(0);
    });

    it('記録の後に更新が巻き戻ると、名前は変わらず RECEIVED_QUOTATION_UPDATED の監査ログも残らない', async () => {
      const stored = await createStored('更新の対象');

      await expect(
        rollingBackService.update(
          stored.id,
          { name: uniqueName('更新の巻き戻し') },
          stored.updatedAt,
          testUserId
        )
      ).rejects.toThrow(FAILURE_AFTER_LOG);

      expect(loggedTargetIds).toEqual([stored.id]);
      const after = await prisma.receivedQuotation.findUniqueOrThrow({ where: { id: stored.id } });
      expect(after.name).toBe(stored.name);
      expect(after.updatedAt.getTime()).toBe(stored.updatedAt.getTime());
      expect(await countLogs('RECEIVED_QUOTATION_UPDATED', stored.id)).toBe(0);
    });

    it('記録の後に論理削除が巻き戻ると、受領見積書は論理削除されず RECEIVED_QUOTATION_DELETED の監査ログも残らない', async () => {
      const stored = await createStored('論理削除の対象');

      await expect(
        rollingBackService.delete(stored.id, stored.updatedAt, testUserId)
      ).rejects.toThrow(FAILURE_AFTER_LOG);

      expect(loggedTargetIds).toEqual([stored.id]);
      const after = await prisma.receivedQuotation.findUniqueOrThrow({ where: { id: stored.id } });
      expect(after.deletedAt).toBeNull();
      expect(await countLogs('RECEIVED_QUOTATION_DELETED', stored.id)).toBe(0);
    });

    it('楽観的排他制御の競合で拒否された更新と論理削除は監査ログを残さない', async () => {
      const stored = await createStored('競合の対象');
      const staleUpdatedAt = '2020-01-01T00:00:00.000Z';

      const updateResponse = await request(app)
        .put(`/api/quotations/${stored.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .field('name', uniqueName('競合の更新'))
        .field('expectedUpdatedAt', staleUpdatedAt);
      expect(updateResponse.status).toBe(409);

      const deleteResponse = await request(app)
        .delete(`/api/quotations/${stored.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .query({ updatedAt: staleUpdatedAt });
      expect(deleteResponse.status).toBe(409);

      expect(await countLogs('RECEIVED_QUOTATION_UPDATED', stored.id)).toBe(0);
      expect(await countLogs('RECEIVED_QUOTATION_DELETED', stored.id)).toBe(0);
    });
  });

  /**
   * 台帳の項目の migration の埋め戻しと権限の付与（Task 112.1）
   *
   * 適用済みの DB に対し、トランザクションの中で migration の前の形（案件・業者名・取引先が空、
   * 明細行に区分の列が無い、claude_vision:use が無い）を作り直し、migration.sql から取り出した
   * 埋め戻し・NOT NULL・CHECK・区分の列の追加・権限の追加と付与の文を流して結果を主張する。
   * 最後に例外でトランザクションを巻き戻し、共有のテスト DB を元の形へ戻す。
   *
   * 対象の受入基準は estimate-request の 14.1・44.9・45.13・49.6（design: Data Models の埋め戻し、D1、D7）
   */
  describe('台帳の項目の migration の埋め戻しと権限の付与（Task 112.1）', () => {
    const MIGRATION_SQL_PATH = resolve(
      __dirname,
      '../../../prisma/migrations/20261108000000_received_quotation_ledger_fields/migration.sql'
    );
    const ROLLBACK = '検証の後に巻き戻す';

    /** コメント行を除き、文ごとに分ける */
    const migrationStatements = (): string[] =>
      readFileSync(MIGRATION_SQL_PATH, 'utf-8')
        .split('\n')
        .filter((line) => !line.trim().startsWith('--'))
        .join('\n')
        .split(';')
        .map((statement) => statement.trim())
        .filter((statement) => statement !== '');

    /** 条件に合う文を取り出す（一つも無ければ失敗させる） */
    const pick = (statements: string[], pattern: RegExp): string[] => {
      const picked = statements.filter((statement) => pattern.test(statement));
      expect(picked, `migration.sql に ${pattern} の文が無い`).not.toHaveLength(0);
      return picked;
    };

    /** トランザクションの中で検証し、最後に巻き戻す */
    const inRolledBackTransaction = async (
      verify: (tx: Parameters<Parameters<PrismaClient['$transaction']>[0]>[0]) => Promise<void>
    ): Promise<void> => {
      await expect(
        prisma.$transaction(
          async (tx) => {
            await verify(tx);
            throw new Error(ROLLBACK);
          },
          { timeout: 30_000 }
        )
      ).rejects.toThrow(ROLLBACK);
    };

    it('案件・業者名・取引先が空の既存の受領見積書は、見積依頼の案件と宛先の取引先の名前と ID で埋まり、業者名が NOT NULL になる（44.9、D1）', async () => {
      const statements = migrationStatements();
      const backfill = pick(statements, /^UPDATE "received_quotations"/);
      const notNull = pick(statements, /ALTER COLUMN "vendor_name" SET NOT NULL/);
      const check = pick(statements, /ADD CONSTRAINT "[^"]+" CHECK/);
      const tradingPartner = await prisma.tradingPartner.findUniqueOrThrow({
        where: { id: testTradingPartnerId },
      });

      await inRolledBackTransaction(async (tx) => {
        // migration の前の形: 列は足されたが値が無い（NOT NULL と CHECK は埋め戻しの後に置かれる）
        await tx.$executeRawUnsafe(
          'ALTER TABLE "received_quotations" DROP CONSTRAINT "received_quotations_estimate_request_project_check"'
        );
        await tx.$executeRawUnsafe(
          'ALTER TABLE "received_quotations" ALTER COLUMN "vendor_name" DROP NOT NULL'
        );
        const legacyId = `legacy-${Date.now()}`;
        await tx.$executeRaw`
          INSERT INTO "received_quotations" ("id", "estimateRequestId", "name", "submittedAt", "updatedAt")
          VALUES (${legacyId}, ${testEstimateRequestId}, '移行前の受領見積書', DATE '2026-01-23', CURRENT_TIMESTAMP)`;
        const before = await tx.$queryRaw<
          Array<{
            project_id: string | null;
            vendor_name: string | null;
            trading_partner_id: string | null;
          }>
        >`SELECT "project_id", "vendor_name", "trading_partner_id" FROM "received_quotations" WHERE "id" = ${legacyId}`;
        expect(before).toEqual([{ project_id: null, vendor_name: null, trading_partner_id: null }]);

        for (const statement of [...backfill, ...notNull, ...check]) {
          await tx.$executeRawUnsafe(statement);
        }

        const after = await tx.$queryRaw<
          Array<{
            project_id: string | null;
            vendor_name: string | null;
            trading_partner_id: string | null;
          }>
        >`SELECT "project_id", "vendor_name", "trading_partner_id" FROM "received_quotations" WHERE "id" = ${legacyId}`;
        expect(after).toEqual([
          {
            project_id: testProjectId,
            vendor_name: tradingPartner.name,
            trading_partner_id: testTradingPartnerId,
          },
        ]);
        const nullable = await tx.$queryRaw<Array<{ is_nullable: string }>>`
          SELECT "is_nullable" FROM information_schema.columns
          WHERE table_name = 'received_quotations' AND column_name = 'vendor_name'`;
        expect(nullable).toEqual([{ is_nullable: 'NO' }]);
      });
    });

    it('見積依頼に紐づく受領見積書は案件を持たなければ保存できない（CHECK、D1）', async () => {
      await inRolledBackTransaction(async (tx) => {
        await expect(
          tx.$executeRaw`
            INSERT INTO "received_quotations" ("id", "estimateRequestId", "name", "submittedAt", "updatedAt", "vendor_name")
            VALUES (${`check-${Date.now()}`}, ${testEstimateRequestId}, '案件の無い受領見積書', DATE '2026-01-23', CURRENT_TIMESTAMP, '業者')`
        ).rejects.toThrow(/received_quotations_estimate_request_project_check/);
      });
    });

    it('既存の明細行は、migration の区分の列の追加で直接工事（DIRECT）になる（45.13）', async () => {
      const addCategory = pick(migrationStatements(), /ADD COLUMN\s+"category"/);

      await inRolledBackTransaction(async (tx) => {
        const quotationId = `line-${Date.now()}`;
        await tx.$executeRaw`
          INSERT INTO "received_quotations" ("id", "estimateRequestId", "project_id", "vendor_name", "name", "submittedAt", "updatedAt")
          VALUES (${quotationId}, ${testEstimateRequestId}, ${testProjectId}, '業者', '明細行の区分の検証', DATE '2026-01-23', CURRENT_TIMESTAMP)`;
        // migration の前の形: 明細行に区分の列が無い
        await tx.$executeRawUnsafe(
          'ALTER TABLE "received_quotation_line_items" DROP COLUMN "category"'
        );
        await tx.$executeRaw`
          INSERT INTO "received_quotation_line_items" ("id", "receivedQuotationId", "sortOrder", "name")
          VALUES (${`${quotationId}-item`}, ${quotationId}, 0, '既存の明細行')`;

        for (const statement of addCategory) {
          await tx.$executeRawUnsafe(statement);
        }

        const rows = await tx.$queryRaw<Array<{ category: string }>>`
          SELECT "category"::text AS "category" FROM "received_quotation_line_items"
          WHERE "receivedQuotationId" = ${quotationId}`;
        expect(rows).toEqual([{ category: 'DIRECT' }]);
      });
    });

    it('estimate_request:read を持つロールは migration の付与で claude_vision:use を持ち、持たないロールは持たない（49.6、D7）', async () => {
      const statements = migrationStatements();
      const definePermission = pick(statements, /^INSERT INTO "permissions"/);
      const grant = pick(statements, /^INSERT INTO "role_permissions"/);

      await inRolledBackTransaction(async (tx) => {
        // migration の前の形: 専用の権限が無い（割り当ても連鎖して消える）
        await tx.permission.deleteMany({ where: { resource: 'claude_vision', action: 'use' } });
        const estimateRead = await tx.permission.findUniqueOrThrow({
          where: { resource_action: { resource: 'estimate_request', action: 'read' } },
        });
        const suffix = Date.now();
        const viewer = await tx.role.create({
          data: { name: `vision-migration-viewer-${suffix}`, description: '見積依頼を閲覧できる' },
        });
        const outsider = await tx.role.create({
          data: {
            name: `vision-migration-outsider-${suffix}`,
            description: '見積依頼を閲覧できない',
          },
        });
        await tx.rolePermission.create({
          data: { roleId: viewer.id, permissionId: estimateRead.id },
        });

        for (const statement of [...definePermission, ...grant]) {
          await tx.$executeRawUnsafe(statement);
        }

        const holders = await tx.rolePermission.findMany({
          where: { permission: { resource: 'claude_vision', action: 'use' } },
          select: { roleId: true },
        });
        const holderIds = holders.map((holder) => holder.roleId);
        expect(holderIds).toContain(viewer.id);
        expect(holderIds).not.toContain(outsider.id);
        const userRole = await tx.role.findUniqueOrThrow({ where: { name: 'user' } });
        expect(holderIds).toContain(userRole.id);

        // 付与の文は二度流しても重複しない
        for (const statement of [...definePermission, ...grant]) {
          await tx.$executeRawUnsafe(statement);
        }
        const viewerGrants = await tx.rolePermission.count({
          where: { roleId: viewer.id, permission: { resource: 'claude_vision', action: 'use' } },
        });
        expect(viewerGrants).toBe(1);
      });
    });
  });
});
