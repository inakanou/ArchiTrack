/**
 * @fileoverview 発注CRUD + ステータス遷移 + 案分計算 API統合テスト
 *
 * TDD: RED phase - テストを先に書く
 *
 * 発注の作成・取得・編集・削除、ステータス遷移、案分計算、発注取消を検証する。
 *
 * Task 13.2: 発注CRUD + ステータス遷移 + 案分計算の統合テスト
 *
 * Requirements:
 * - 6.3: 発注予定取引先が一致する項目に自動チェック
 * - 8.3: 確定発注金額をチェック済み項目の実行金額比率で案分
 * - 8.9: 発注取消時にorderAmountをクリア
 * - 19.3: 発注のCRUD APIを提供
 *
 * @module __tests__/integration/order.api.integration.test
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
 * 発注API統合テスト
 */
describe('Order API Integration Tests', () => {
  let prisma: PrismaClient;
  let accessToken: string;
  let testUserId: string;
  let testProjectId: string;
  let testContractId: string;
  let testTradingPartnerId: string;
  let testBudgetId: string;

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

    // 前回の失敗によるテストデータ残留を除去
    const existingUser = await prisma.user.findUnique({
      where: { email: 'test-order-integration@example.com' },
    });
    if (existingUser) {
      await cleanupUserData(existingUser.id);
      await prisma.user.delete({ where: { id: existingUser.id } });
    }

    // テストユーザーを作成
    const user = await prisma.user.create({
      data: {
        email: 'test-order-integration@example.com',
        displayName: 'Order Test User',
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

    // ログインしてトークンを取得
    const response = await request(app).post('/api/v1/auth/login').send({
      email: 'test-order-integration@example.com',
      password: 'TestPassword123!',
    });

    return {
      token: response.body.accessToken,
      userId: user.id,
    };
  };

  /**
   * ユーザーに紐づくデータのクリーンアップ
   */
  const cleanupUserData = async (userId: string): Promise<void> => {
    const projects = await prisma.project.findMany({
      where: { createdById: userId },
      select: { id: true },
    });
    const projectIds = projects.map((p) => p.id);

    if (projectIds.length > 0) {
      const budgets = await prisma.executionBudget.findMany({
        where: { projectId: { in: projectIds } },
        select: { id: true },
      });
      const budgetIds = budgets.map((b) => b.id);

      if (budgetIds.length > 0) {
        await prisma.order.deleteMany({
          where: { executionBudgetId: { in: budgetIds } },
        });
        await prisma.progressRecord.deleteMany({
          where: { executionBudgetId: { in: budgetIds } },
        });
        await prisma.monthlyCloseHistory.deleteMany({
          where: { executionBudgetId: { in: budgetIds } },
        });
        await prisma.amendmentApplyHistory.deleteMany({
          where: { executionBudgetId: { in: budgetIds } },
        });
        await prisma.executionBudget.deleteMany({
          where: { projectId: { in: projectIds } },
        });
      }
      await prisma.estimate.deleteMany({
        where: { projectId: { in: projectIds } },
      });
      await prisma.contract.deleteMany({
        where: { projectId: { in: projectIds } },
      });
      await prisma.project.deleteMany({
        where: { id: { in: projectIds } },
      });
    }
    await prisma.userRole.deleteMany({ where: { userId } });
  };

  /**
   * テスト用プロジェクト・見積書・契約書・取引先・実行予算を作成
   */
  const setupTestData = async (): Promise<void> => {
    // プロジェクト作成
    const project = await prisma.project.create({
      data: {
        name: 'テスト用プロジェクト_発注統合テスト',
        status: 'PREPARING',
        salesPersonId: testUserId,
        createdById: testUserId,
      },
    });
    testProjectId = project.id;

    // 取引先作成
    const tradingPartner = await prisma.tradingPartner.create({
      data: {
        name: 'テスト業者A_発注テスト',
        nameKana: 'テストギョウシャエー',
        address: '東京都千代田区1-1-1',
        types: {
          create: [{ type: 'SUBCONTRACTOR' }],
        },
      },
    });
    testTradingPartnerId = tradingPartner.id;

    // 見積書作成（2つの項目、それぞれ異なる実行金額）
    const estimate = await prisma.estimate.create({
      data: {
        projectId: testProjectId,
        name: 'テスト見積書_発注テスト',
        items: {
          create: [
            {
              displayOrder: 0,
              lines: {
                create: [
                  {
                    lineType: 'EXECUTION',
                    name: '発注テスト項目1',
                    specification: '規格A',
                    unit: 'm2',
                    quantity: 100,
                    unitPrice: 300,
                    amount: 30000,
                  },
                ],
              },
            },
            {
              displayOrder: 1,
              lines: {
                create: [
                  {
                    lineType: 'EXECUTION',
                    name: '発注テスト項目2',
                    specification: '規格B',
                    unit: 'm3',
                    quantity: 200,
                    unitPrice: 200,
                    amount: 40000,
                  },
                ],
              },
            },
          ],
        },
      },
    });

    // 契約書作成
    const contract = await prisma.contract.create({
      data: {
        projectId: testProjectId,
        contractType: 'NEW',
        status: 'CONTRACTED',
        estimateId: estimate.id,
        contractDate: new Date('2026-01-01'),
        constructionStartDate: new Date('2026-02-01'),
        constructionEndDate: new Date('2026-12-31'),
        deliveryDate: new Date('2027-01-15'),
        taxRate: 0.1,
        contractAmount: 70000,
        constructionPrice: 63636,
        taxAmount: 6364,
      },
    });
    testContractId = contract.id;

    // 実行予算をAPIで作成
    const budgetResponse = await request(app)
      .post(`/api/projects/${testProjectId}/execution-budget`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ contractId: testContractId });

    testBudgetId = budgetResponse.body.id;
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
    await setupTestData();
  });

  afterAll(async () => {
    // テストデータのクリーンアップ
    if (testTradingPartnerId) {
      await prisma.tradingPartner.delete({ where: { id: testTradingPartnerId } }).catch(() => {});
    }
    if (testUserId) {
      await cleanupUserData(testUserId);
      await prisma.user.delete({ where: { id: testUserId } }).catch(() => {});
    }

    await prisma.$disconnect();
    await redis.disconnect();
  });

  beforeEach(async () => {
    // 各テスト前に発注を削除（実行予算は保持）
    await prisma.order.deleteMany({
      where: { executionBudgetId: testBudgetId },
    });
  });

  // =================================================================
  // POST /api/projects/:projectId/execution-budget/orders（発注作成）
  // =================================================================
  describe('POST /api/projects/:projectId/execution-budget/orders', () => {
    it('取引先を指定して発注を作成できること', async () => {
      const response = await request(app)
        .post(`/api/projects/${testProjectId}/execution-budget/orders`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ tradingPartnerId: testTradingPartnerId });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('id');
      expect(response.body.tradingPartnerId).toBe(testTradingPartnerId);
      expect(response.body.status).toBe('BEFORE_ORDER');
    });

    it('認証なしの場合は401エラーを返すこと', async () => {
      const response = await request(app)
        .post(`/api/projects/${testProjectId}/execution-budget/orders`)
        .send({ tradingPartnerId: testTradingPartnerId });

      expect(response.status).toBe(401);
    });
  });

  // =================================================================
  // GET /api/projects/:projectId/execution-budget/orders（発注一覧）
  // =================================================================
  describe('GET /api/projects/:projectId/execution-budget/orders', () => {
    it('発注一覧を取得できること', async () => {
      // 発注を作成
      await request(app)
        .post(`/api/projects/${testProjectId}/execution-budget/orders`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ tradingPartnerId: testTradingPartnerId });

      const response = await request(app)
        .get(`/api/projects/${testProjectId}/execution-budget/orders`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThanOrEqual(1);
      expect(response.body[0]).toHaveProperty('tradingPartnerName');
      expect(response.body[0]).toHaveProperty('status');
      expect(response.body[0]).toHaveProperty('checkedItemCount');
    });
  });

  // =================================================================
  // GET /api/projects/:projectId/execution-budget/orders/:orderId（発注詳細）
  // =================================================================
  describe('GET /api/projects/:projectId/execution-budget/orders/:orderId', () => {
    it('発注詳細を取得できること', async () => {
      const createResponse = await request(app)
        .post(`/api/projects/${testProjectId}/execution-budget/orders`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ tradingPartnerId: testTradingPartnerId });

      const orderId = createResponse.body.id;

      const response = await request(app)
        .get(`/api/projects/${testProjectId}/execution-budget/orders/${orderId}`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('id', orderId);
      expect(response.body).toHaveProperty('items');
      expect(Array.isArray(response.body.items)).toBe(true);
    });

    it('存在しない発注の場合は404エラーを返すこと', async () => {
      const fakeOrderId = '00000000-0000-0000-0000-000000000000';
      const response = await request(app)
        .get(`/api/projects/${testProjectId}/execution-budget/orders/${fakeOrderId}`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(404);
    });
  });

  // =================================================================
  // ステータス遷移と案分計算
  // =================================================================
  describe('ステータス遷移と案分計算', () => {
    it('BEFORE_ORDER → UNDER_REVIEW → ORDEREDのステータス遷移と案分計算が正しく動作すること', async () => {
      // 発注を作成
      const createResponse = await request(app)
        .post(`/api/projects/${testProjectId}/execution-budget/orders`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ tradingPartnerId: testTradingPartnerId });

      const orderId = createResponse.body.id;

      // 発注詳細を取得してチェック済み項目を確認
      const detailResponse = await request(app)
        .get(`/api/projects/${testProjectId}/execution-budget/orders/${orderId}`)
        .set('Authorization', `Bearer ${accessToken}`);

      // チェック済み項目のIDを取得
      const checkedItemIds = detailResponse.body.items
        .filter((item: { checked: boolean }) => item.checked)
        .map((item: { executionBudgetItemId: string }) => item.executionBudgetItemId);

      // チェック済み項目がない場合は全項目をチェック
      if (checkedItemIds.length === 0) {
        const allItemIds = detailResponse.body.items.map(
          (item: { executionBudgetItemId: string }) => item.executionBudgetItemId
        );
        await request(app)
          .put(`/api/projects/${testProjectId}/execution-budget/orders/${orderId}/items`)
          .set('Authorization', `Bearer ${accessToken}`)
          .send({ itemIds: allItemIds });
      }

      // ステータスをUNDER_REVIEWに変更
      const reviewResponse = await request(app)
        .patch(`/api/projects/${testProjectId}/execution-budget/orders/${orderId}/status`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ status: 'UNDER_REVIEW' });

      expect(reviewResponse.status).toBe(200);
      expect(reviewResponse.body.status).toBe('UNDER_REVIEW');

      // ステータスをORDEREDに変更（確定発注金額必須）
      const orderedResponse = await request(app)
        .patch(`/api/projects/${testProjectId}/execution-budget/orders/${orderId}/status`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          status: 'ORDERED',
          confirmedAmount: '50000',
        });

      expect(orderedResponse.status).toBe(200);
      expect(orderedResponse.body.status).toBe('ORDERED');

      // 発注詳細を取得して案分結果を確認
      const afterOrderResponse = await request(app)
        .get(`/api/projects/${testProjectId}/execution-budget/orders/${orderId}`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(afterOrderResponse.status).toBe(200);
      // チェック済み項目にorderAmountが設定されていることを確認
      const checkedItems = afterOrderResponse.body.items.filter(
        (item: { checked: boolean }) => item.checked
      );
      for (const item of checkedItems) {
        expect(item.orderAmount).not.toBeNull();
      }
    });

    it('確定発注金額なしでORDEREDに変更するとエラーになること', async () => {
      // 発注を作成
      const createResponse = await request(app)
        .post(`/api/projects/${testProjectId}/execution-budget/orders`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ tradingPartnerId: testTradingPartnerId });

      const orderId = createResponse.body.id;

      // 全項目をチェック
      const detailResponse = await request(app)
        .get(`/api/projects/${testProjectId}/execution-budget/orders/${orderId}`)
        .set('Authorization', `Bearer ${accessToken}`);

      const allItemIds = detailResponse.body.items.map(
        (item: { executionBudgetItemId: string }) => item.executionBudgetItemId
      );
      await request(app)
        .put(`/api/projects/${testProjectId}/execution-budget/orders/${orderId}/items`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ itemIds: allItemIds });

      // UNDER_REVIEWに変更
      await request(app)
        .patch(`/api/projects/${testProjectId}/execution-budget/orders/${orderId}/status`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ status: 'UNDER_REVIEW' });

      // 確定発注金額なしでORDEREDに変更
      const response = await request(app)
        .patch(`/api/projects/${testProjectId}/execution-budget/orders/${orderId}/status`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ status: 'ORDERED' });

      // 422エラーまたは400エラーが返ること
      expect([400, 422]).toContain(response.status);
    });

    it('発注取消により案分済みの発注金額がクリアされること', async () => {
      // 発注を作成して確定まで進める
      const createResponse = await request(app)
        .post(`/api/projects/${testProjectId}/execution-budget/orders`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ tradingPartnerId: testTradingPartnerId });

      const orderId = createResponse.body.id;

      // 全項目をチェック
      const detailResponse = await request(app)
        .get(`/api/projects/${testProjectId}/execution-budget/orders/${orderId}`)
        .set('Authorization', `Bearer ${accessToken}`);

      const allItemIds = detailResponse.body.items.map(
        (item: { executionBudgetItemId: string }) => item.executionBudgetItemId
      );
      await request(app)
        .put(`/api/projects/${testProjectId}/execution-budget/orders/${orderId}/items`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ itemIds: allItemIds });

      // UNDER_REVIEW → ORDERED
      await request(app)
        .patch(`/api/projects/${testProjectId}/execution-budget/orders/${orderId}/status`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ status: 'UNDER_REVIEW' });

      await request(app)
        .patch(`/api/projects/${testProjectId}/execution-budget/orders/${orderId}/status`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ status: 'ORDERED', confirmedAmount: '50000' });

      // 発注取消
      const cancelResponse = await request(app)
        .patch(`/api/projects/${testProjectId}/execution-budget/orders/${orderId}/status`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ status: 'CANCELLED' });

      expect(cancelResponse.status).toBe(200);
      expect(cancelResponse.body.status).toBe('CANCELLED');

      // 発注詳細を取得してorderAmountがクリアされていることを確認
      const afterCancelResponse = await request(app)
        .get(`/api/projects/${testProjectId}/execution-budget/orders/${orderId}`)
        .set('Authorization', `Bearer ${accessToken}`);

      const checkedItems = afterCancelResponse.body.items.filter(
        (item: { checked: boolean }) => item.checked
      );
      for (const item of checkedItems) {
        expect(item.orderAmount).toBeNull();
      }
    });
  });

  // =================================================================
  // DELETE /api/projects/:projectId/execution-budget/orders/:orderId（発注削除）
  // =================================================================
  describe('DELETE /api/projects/:projectId/execution-budget/orders/:orderId', () => {
    it('発注前ステータスの発注を削除できること', async () => {
      const createResponse = await request(app)
        .post(`/api/projects/${testProjectId}/execution-budget/orders`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ tradingPartnerId: testTradingPartnerId });

      const orderId = createResponse.body.id;

      const response = await request(app)
        .delete(`/api/projects/${testProjectId}/execution-budget/orders/${orderId}`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(204);
    });

    it('発注済ステータスの発注は削除できないこと', async () => {
      // 発注を作成して確定まで進める
      const createResponse = await request(app)
        .post(`/api/projects/${testProjectId}/execution-budget/orders`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ tradingPartnerId: testTradingPartnerId });

      const orderId = createResponse.body.id;

      // 全項目をチェック
      const detailResponse = await request(app)
        .get(`/api/projects/${testProjectId}/execution-budget/orders/${orderId}`)
        .set('Authorization', `Bearer ${accessToken}`);

      const allItemIds = detailResponse.body.items.map(
        (item: { executionBudgetItemId: string }) => item.executionBudgetItemId
      );
      await request(app)
        .put(`/api/projects/${testProjectId}/execution-budget/orders/${orderId}/items`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ itemIds: allItemIds });

      // UNDER_REVIEW → ORDERED
      await request(app)
        .patch(`/api/projects/${testProjectId}/execution-budget/orders/${orderId}/status`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ status: 'UNDER_REVIEW' });

      await request(app)
        .patch(`/api/projects/${testProjectId}/execution-budget/orders/${orderId}/status`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ status: 'ORDERED', confirmedAmount: '50000' });

      // 発注済ステータスで削除を試行
      const response = await request(app)
        .delete(`/api/projects/${testProjectId}/execution-budget/orders/${orderId}`)
        .set('Authorization', `Bearer ${accessToken}`);

      // 422または400エラー
      expect([400, 422]).toContain(response.status);
    });
  });
});
