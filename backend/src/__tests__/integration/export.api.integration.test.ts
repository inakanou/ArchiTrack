/**
 * @fileoverview エクスポートAPI統合テスト
 *
 * TDD: RED phase - テストを先に書く
 *
 * 発注一覧のExcel/PDFエクスポート、月別出来高のExcel/PDFエクスポートを検証する。
 *
 * Task 13.4: エクスポートの統合テスト
 *
 * Requirements:
 * - 10.1: チェック済み項目一覧をExcelファイル（.xlsx形式）で出力
 * - 10.2: チェック済み項目一覧をPDFファイルで出力
 * - 16.4: 月別出来高データをExcelファイル（.xlsx形式）で出力
 * - 16.5: 月別出来高データをPDFファイルで出力
 *
 * @module __tests__/integration/export.api.integration.test
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
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
 * エクスポートAPI統合テスト
 */
describe('Export API Integration Tests', () => {
  let prisma: PrismaClient;
  let accessToken: string;
  let testUserId: string;
  let testProjectId: string;
  let testOrderId: string;
  let testTradingPartnerId: string;
  let testBudgetItemIds: string[];

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

    // 前回のテストデータ残留を除去
    const existingUser = await prisma.user.findUnique({
      where: { email: 'test-export-integration@example.com' },
    });
    if (existingUser) {
      await cleanupUserData(existingUser.id);
      await prisma.user.delete({ where: { id: existingUser.id } });
    }

    const user = await prisma.user.create({
      data: {
        email: 'test-export-integration@example.com',
        displayName: 'Export Test User',
        passwordHash,
      },
    });

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

    const response = await request(app).post('/api/v1/auth/login').send({
      email: 'test-export-integration@example.com',
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
   * ツリー構造から末端項目IDを再帰的に収集する
   */
  const collectLeafItemIds = (
    items: Array<{ id: string; children?: Array<{ id: string; children?: unknown[] }> }>
  ): string[] => {
    const ids: string[] = [];
    for (const item of items) {
      if (!item.children || item.children.length === 0) {
        ids.push(item.id);
      } else {
        ids.push(
          ...collectLeafItemIds(
            item.children as Array<{
              id: string;
              children?: Array<{ id: string; children?: unknown[] }>;
            }>
          )
        );
      }
    }
    return ids;
  };

  /**
   * テスト用データをフルセットアップ
   * プロジェクト・見積書・契約書・実行予算・取引先・発注・出来高を作成
   */
  const setupTestData = async (): Promise<void> => {
    // プロジェクト作成
    const project = await prisma.project.create({
      data: {
        name: 'テスト用プロジェクト_エクスポート統合テスト',
        status: 'PREPARING',
        salesPersonId: testUserId,
        createdById: testUserId,
      },
    });
    testProjectId = project.id;

    // 取引先作成
    const tradingPartner = await prisma.tradingPartner.create({
      data: {
        name: 'エクスポートテスト業者',
        nameKana: 'エクスポートテストギョウシャ',
        address: '東京都千代田区1-1-1',
        types: {
          create: [{ type: 'SUBCONTRACTOR' }],
        },
      },
    });
    testTradingPartnerId = tradingPartner.id;

    // 見積書作成
    const estimate = await prisma.estimate.create({
      data: {
        projectId: testProjectId,
        name: 'テスト見積書_エクスポート',
        items: {
          create: [
            {
              displayOrder: 0,
              lines: {
                create: [
                  {
                    lineType: 'EXECUTION',
                    name: 'エクスポートテスト項目1',
                    specification: '規格A',
                    unit: 'm2',
                    quantity: 100,
                    unitPrice: 500,
                    amount: 50000,
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
                    name: 'エクスポートテスト項目2',
                    specification: '規格B',
                    unit: 'm3',
                    quantity: 50,
                    unitPrice: 600,
                    amount: 30000,
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
        contractAmount: 80000,
        constructionPrice: 72727,
        taxAmount: 7273,
      },
    });

    // 実行予算をAPIで作成
    await request(app)
      .post(`/api/projects/${testProjectId}/execution-budget`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ contractId: contract.id });

    // 実行予算の項目IDを取得
    const budgetDetail = await request(app)
      .get(`/api/projects/${testProjectId}/execution-budget`)
      .set('Authorization', `Bearer ${accessToken}`);

    testBudgetItemIds = collectLeafItemIds(budgetDetail.body.items);

    // 発注を作成
    const orderResponse = await request(app)
      .post(`/api/projects/${testProjectId}/execution-budget/orders`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ tradingPartnerId: testTradingPartnerId });

    testOrderId = orderResponse.body.id;

    // 全項目をチェック
    await request(app)
      .put(`/api/projects/${testProjectId}/execution-budget/orders/${testOrderId}/items`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ itemIds: testBudgetItemIds });

    // 出来高を保存
    await request(app)
      .post(`/api/projects/${testProjectId}/execution-budget/progress`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        constructionDate: '2026-03-15',
        items: testBudgetItemIds.map((id) => ({
          itemId: id,
          amount: '10000',
        })),
      });
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

  // =================================================================
  // 発注一覧エクスポート GET /api/projects/:projectId/execution-budget/orders/:orderId/export
  // =================================================================
  describe('GET /api/projects/:projectId/execution-budget/orders/:orderId/export', () => {
    it('発注一覧をExcel（.xlsx）形式でエクスポートできること', async () => {
      const response = await request(app)
        .get(
          `/api/projects/${testProjectId}/execution-budget/orders/${testOrderId}/export?format=xlsx`
        )
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain(
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      expect(response.headers['content-disposition']).toContain('attachment');
      // バイナリデータが返ってくることを確認
      expect(response.body).toBeTruthy();
    });

    it('発注一覧をPDF形式でエクスポートできること', async () => {
      const response = await request(app)
        .get(
          `/api/projects/${testProjectId}/execution-budget/orders/${testOrderId}/export?format=pdf`
        )
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain('application/pdf');
      expect(response.headers['content-disposition']).toContain('attachment');
      expect(response.body).toBeTruthy();
    });

    it('存在しない発注IDの場合は404エラーを返すこと', async () => {
      const fakeOrderId = '00000000-0000-0000-0000-000000000000';
      const response = await request(app)
        .get(
          `/api/projects/${testProjectId}/execution-budget/orders/${fakeOrderId}/export?format=xlsx`
        )
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(404);
    });

    it('認証なしの場合は401エラーを返すこと', async () => {
      const response = await request(app).get(
        `/api/projects/${testProjectId}/execution-budget/orders/${testOrderId}/export?format=xlsx`
      );

      expect(response.status).toBe(401);
    });
  });

  // =================================================================
  // 月別出来高エクスポート GET /api/projects/:projectId/execution-budget/progress/monthly/export
  // =================================================================
  describe('GET /api/projects/:projectId/execution-budget/progress/monthly/export', () => {
    it('月別出来高をExcel（.xlsx）形式でエクスポートできること', async () => {
      const response = await request(app)
        .get(`/api/projects/${testProjectId}/execution-budget/progress/monthly/export?format=xlsx`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain(
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      expect(response.headers['content-disposition']).toContain('attachment');
      expect(response.body).toBeTruthy();
    });

    it('月別出来高をPDF形式でエクスポートできること', async () => {
      const response = await request(app)
        .get(`/api/projects/${testProjectId}/execution-budget/progress/monthly/export?format=pdf`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain('application/pdf');
      expect(response.headers['content-disposition']).toContain('attachment');
      expect(response.body).toBeTruthy();
    });

    it('認証なしの場合は401エラーを返すこと', async () => {
      const response = await request(app).get(
        `/api/projects/${testProjectId}/execution-budget/progress/monthly/export?format=xlsx`
      );

      expect(response.status).toBe(401);
    });
  });
});
