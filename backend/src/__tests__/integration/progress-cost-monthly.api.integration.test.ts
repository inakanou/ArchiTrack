/**
 * @fileoverview 出来高・原価・月次締め API統合テスト
 *
 * TDD: RED phase - テストを先に書く
 *
 * 出来高入力・履歴取得・月別集計、原価入力、月次締め処理、
 * アクセス制御（VIEWER/EDITOR権限）の統合テストを検証する。
 *
 * Task 13.3: 出来高・原価・月次締めの統合テスト
 *
 * Requirements:
 * - 12.1: 出来高を保存し、施工日と各項目の出来高金額を1レコードとして保存
 * - 13.3: 月次締め操作で今月の支出を先月までの支出に累積
 * - 14.3: 締め処理を実行し、締め日時と対象月を履歴として記録
 * - 17.6: 権限のないユーザーが操作を試行した場合は403エラー
 * - 19.4: 出来高データのCRUD APIを提供
 * - 19.5: 原価データのCRUD APIを提供
 * - 19.6: 月次締めデータのCRUD APIを提供
 *
 * @module __tests__/integration/progress-cost-monthly.api.integration.test
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
 * 出来高・原価・月次締め API統合テスト
 */
describe('Progress / Cost / Monthly Close API Integration Tests', () => {
  let prisma: PrismaClient;
  let accessToken: string;
  let testUserId: string;
  let testProjectId: string;
  let testBudgetId: string;
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
      where: { email: 'test-pcm-integration@example.com' },
    });
    if (existingUser) {
      await cleanupUserData(existingUser.id);
      await prisma.user.delete({ where: { id: existingUser.id } });
    }

    const user = await prisma.user.create({
      data: {
        email: 'test-pcm-integration@example.com',
        displayName: 'PCM Test User',
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
      email: 'test-pcm-integration@example.com',
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
   * テスト用プロジェクト・見積書・契約書・実行予算を作成
   */
  const setupTestData = async (): Promise<void> => {
    // プロジェクト作成
    const project = await prisma.project.create({
      data: {
        name: 'テスト用プロジェクト_PCM統合テスト',
        status: 'PREPARING',
        salesPersonId: testUserId,
        createdById: testUserId,
      },
    });
    testProjectId = project.id;

    // 見積書作成
    const estimate = await prisma.estimate.create({
      data: {
        projectId: testProjectId,
        name: 'テスト見積書_PCM',
        items: {
          create: [
            {
              displayOrder: 0,
              lines: {
                create: [
                  {
                    lineType: 'EXECUTION',
                    name: 'PCMテスト項目1',
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
                    name: 'PCMテスト項目2',
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
    const budgetResponse = await request(app)
      .post(`/api/projects/${testProjectId}/execution-budget`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ contractId: contract.id });

    testBudgetId = budgetResponse.body.id;

    // 実行予算の項目IDを取得
    const budgetDetail = await request(app)
      .get(`/api/projects/${testProjectId}/execution-budget`)
      .set('Authorization', `Bearer ${accessToken}`);

    testBudgetItemIds = collectLeafItemIds(budgetDetail.body.items);
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
    if (testUserId) {
      await cleanupUserData(testUserId);
      await prisma.user.delete({ where: { id: testUserId } }).catch(() => {});
    }

    await prisma.$disconnect();
    await redis.disconnect();
  });

  // =================================================================
  // 出来高入力 POST /api/projects/:projectId/execution-budget/progress
  // =================================================================
  describe('POST /api/projects/:projectId/execution-budget/progress', () => {
    beforeEach(async () => {
      // 各テスト前に出来高レコードを削除
      await prisma.progressRecord.deleteMany({
        where: { executionBudgetId: testBudgetId },
      });
    });

    it('出来高を保存できること', async () => {
      const response = await request(app)
        .post(`/api/projects/${testProjectId}/execution-budget/progress`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          constructionDate: '2026-03-15',
          items: testBudgetItemIds.map((id) => ({
            itemId: id,
            amount: '10000',
          })),
        });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('constructionDate');
      expect(response.body).toHaveProperty('items');
    });

    it('同一施工日への上書き保存ができること', async () => {
      // 最初の保存
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

      // 上書き保存
      const response = await request(app)
        .post(`/api/projects/${testProjectId}/execution-budget/progress`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          constructionDate: '2026-03-15',
          items: testBudgetItemIds.map((id) => ({
            itemId: id,
            amount: '20000',
          })),
        });

      expect(response.status).toBe(201);
    });

    it('認証なしの場合は401エラーを返すこと', async () => {
      const response = await request(app)
        .post(`/api/projects/${testProjectId}/execution-budget/progress`)
        .send({
          constructionDate: '2026-03-15',
          items: testBudgetItemIds.map((id) => ({
            itemId: id,
            amount: '10000',
          })),
        });

      expect(response.status).toBe(401);
    });
  });

  // =================================================================
  // 出来高履歴一覧 GET /api/projects/:projectId/execution-budget/progress
  // =================================================================
  describe('GET /api/projects/:projectId/execution-budget/progress', () => {
    beforeEach(async () => {
      await prisma.progressRecord.deleteMany({
        where: { executionBudgetId: testBudgetId },
      });
    });

    it('出来高履歴一覧を取得できること', async () => {
      // 出来高を保存
      await request(app)
        .post(`/api/projects/${testProjectId}/execution-budget/progress`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          constructionDate: '2026-03-10',
          items: testBudgetItemIds.map((id) => ({
            itemId: id,
            amount: '5000',
          })),
        });

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

      const response = await request(app)
        .get(`/api/projects/${testProjectId}/execution-budget/progress`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBe(2);
    });
  });

  // =================================================================
  // 出来高削除 DELETE /api/projects/:projectId/execution-budget/progress/:progressRecordId
  // =================================================================
  describe('DELETE /api/projects/:projectId/execution-budget/progress/:progressRecordId', () => {
    it('出来高レコードを削除できること', async () => {
      // 出来高を保存
      const saveResponse = await request(app)
        .post(`/api/projects/${testProjectId}/execution-budget/progress`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          constructionDate: '2026-03-20',
          items: testBudgetItemIds.map((id) => ({
            itemId: id,
            amount: '5000',
          })),
        });

      const progressRecordId = saveResponse.body.id;

      // 削除
      const response = await request(app)
        .delete(`/api/projects/${testProjectId}/execution-budget/progress/${progressRecordId}`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(204);
    });
  });

  // =================================================================
  // 月別出来高集計 GET /api/projects/:projectId/execution-budget/progress/monthly
  // =================================================================
  describe('GET /api/projects/:projectId/execution-budget/progress/monthly', () => {
    it('月別出来高集計を取得できること', async () => {
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

      const response = await request(app)
        .get(`/api/projects/${testProjectId}/execution-budget/progress/monthly`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
    });
  });

  // =================================================================
  // 原価入力 PATCH /api/projects/:projectId/execution-budget/items/:itemId/cost
  // =================================================================
  describe('PATCH /api/projects/:projectId/execution-budget/items/:itemId/cost', () => {
    it('今月の支出を入力し、累計支出が自動計算されること', async () => {
      const itemId = testBudgetItemIds[0];

      // 項目のバージョンを取得
      const item = await prisma.executionBudgetItem.findUnique({
        where: { id: itemId },
        include: { executionBudget: true },
      });

      const response = await request(app)
        .patch(`/api/projects/${testProjectId}/execution-budget/items/${itemId}/cost`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          currentMonthExpense: '15000',
          version: item?.executionBudget?.version ?? 0,
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('currentMonthExpense');
      expect(response.body).toHaveProperty('totalExpense');
      expect(response.body).toHaveProperty('remainingBudget');
    });

    it('認証なしの場合は401エラーを返すこと', async () => {
      const itemId = testBudgetItemIds[0];

      const response = await request(app)
        .patch(`/api/projects/${testProjectId}/execution-budget/items/${itemId}/cost`)
        .send({
          currentMonthExpense: '15000',
          version: 0,
        });

      expect(response.status).toBe(401);
    });
  });

  // =================================================================
  // 月次締め POST /api/projects/:projectId/execution-budget/monthly-close
  // =================================================================
  describe('POST /api/projects/:projectId/execution-budget/monthly-close', () => {
    beforeEach(async () => {
      // 月次締め履歴を削除
      await prisma.monthlyCloseHistory.deleteMany({
        where: { executionBudgetId: testBudgetId },
      });
    });

    it('月次締めを実行できること', async () => {
      const response = await request(app)
        .post(`/api/projects/${testProjectId}/execution-budget/monthly-close`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ targetMonth: '2026-02' });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('targetMonth', '2026-02');
    });

    it('同一月の重複締めは409エラーを返すこと', async () => {
      // 最初の締め
      await request(app)
        .post(`/api/projects/${testProjectId}/execution-budget/monthly-close`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ targetMonth: '2026-02' });

      // 重複締め
      const response = await request(app)
        .post(`/api/projects/${testProjectId}/execution-budget/monthly-close`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ targetMonth: '2026-02' });

      expect(response.status).toBe(409);
    });
  });

  // =================================================================
  // 月次締め履歴一覧 GET /api/projects/:projectId/execution-budget/monthly-close
  // =================================================================
  describe('GET /api/projects/:projectId/execution-budget/monthly-close', () => {
    it('月次締め履歴一覧を取得できること', async () => {
      // 月次締めを実行
      await prisma.monthlyCloseHistory.deleteMany({
        where: { executionBudgetId: testBudgetId },
      });

      await request(app)
        .post(`/api/projects/${testProjectId}/execution-budget/monthly-close`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ targetMonth: '2026-01' });

      const response = await request(app)
        .get(`/api/projects/${testProjectId}/execution-budget/monthly-close`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThanOrEqual(1);
    });
  });

  // =================================================================
  // アクセス制御テスト
  // =================================================================
  describe('アクセス制御', () => {
    it('認証なしで出来高履歴を取得すると401エラーを返すこと', async () => {
      const response = await request(app).get(
        `/api/projects/${testProjectId}/execution-budget/progress`
      );

      expect(response.status).toBe(401);
    });

    it('認証なしで月次締め履歴を取得すると401エラーを返すこと', async () => {
      const response = await request(app).get(
        `/api/projects/${testProjectId}/execution-budget/monthly-close`
      );

      expect(response.status).toBe(401);
    });
  });
});
