/**
 * @fileoverview 実行予算CRUD API統合テスト
 *
 * TDD: RED phase - テストを先に書く
 *
 * 実行予算の作成・取得・編集・削除のAPI統合テスト。
 * Contract → Estimate連携、楽観的排他制御、契約変更反映を検証する。
 *
 * Task 13.1: 実行予算CRUD APIの統合テスト
 *
 * Requirements:
 * - 1.3: 契約書から見積項目を取得し実行予算項目として初期化
 * - 2.2: 実行予算の論理削除
 * - 4.4: 楽観的排他制御の適用
 * - 15.3: 契約変更反映
 * - 19.2: 実行予算のCRUD APIを提供
 *
 * @module __tests__/integration/execution-budget.api.integration.test
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
 * 実行予算CRUD API統合テスト
 */
describe('Execution Budget API Integration Tests', () => {
  let prisma: PrismaClient;
  let accessToken: string;
  let testUserId: string;
  let testProjectId: string;
  let testContractId: string;

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
      where: { email: 'test-eb-integration@example.com' },
    });
    if (existingUser) {
      await cleanupUserData(existingUser.id);
      await prisma.user.delete({ where: { id: existingUser.id } });
    }

    // テストユーザーを作成
    const user = await prisma.user.create({
      data: {
        email: 'test-eb-integration@example.com',
        displayName: 'EB Test User',
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
      email: 'test-eb-integration@example.com',
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
      // FK制約を考慮した順序で削除
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
   * テスト用プロジェクトを作成
   */
  const createTestProject = async (): Promise<string> => {
    const project = await prisma.project.create({
      data: {
        name: 'テスト用プロジェクト_実行予算統合テスト',
        status: 'PREPARING',
        salesPersonId: testUserId,
        createdById: testUserId,
      },
    });
    return project.id;
  };

  /**
   * テスト用見積書と契約書を作成
   */
  const createTestEstimateAndContract = async (): Promise<{
    estimateId: string;
    contractId: string;
    estimateItemIds: string[];
  }> => {
    // 見積書を作成
    const estimate = await prisma.estimate.create({
      data: {
        projectId: testProjectId,
        name: 'テスト見積書',
        items: {
          create: [
            {
              displayOrder: 0,
              lines: {
                create: [
                  {
                    lineType: 'ESTIMATE',
                    name: '見積項目1',
                    specification: '規格A',
                    unit: 'm2',
                    quantity: 100,
                    unitPrice: 500,
                    amount: 50000,
                  },
                  {
                    lineType: 'EXECUTION',
                    name: '見積項目1',
                    specification: '規格A',
                    unit: 'm2',
                    quantity: 100,
                    unitPrice: 450,
                    amount: 45000,
                  },
                  {
                    lineType: 'VENDOR',
                    name: '見積項目1',
                    specification: '規格A',
                    unit: 'm2',
                    quantity: 100,
                    unitPrice: 400,
                    amount: 40000,
                    sourceVendorName: 'テスト業者A',
                  },
                ],
              },
            },
            {
              displayOrder: 1,
              lines: {
                create: [
                  {
                    lineType: 'ESTIMATE',
                    name: '見積項目2',
                    specification: '規格B',
                    unit: 'm3',
                    quantity: 50,
                    unitPrice: 1000,
                    amount: 50000,
                  },
                  {
                    lineType: 'EXECUTION',
                    name: '見積項目2',
                    specification: '規格B',
                    unit: 'm3',
                    quantity: 50,
                    unitPrice: 900,
                    amount: 45000,
                  },
                  {
                    lineType: 'VENDOR',
                    name: '見積項目2',
                    specification: '規格B',
                    unit: 'm3',
                    quantity: 50,
                    unitPrice: 800,
                    amount: 40000,
                    sourceVendorName: 'テスト業者B',
                  },
                ],
              },
            },
          ],
        },
      },
      include: {
        items: true,
      },
    });

    // 契約書を作成
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
        contractAmount: 100000,
        constructionPrice: 90909,
        taxAmount: 9091,
      },
    });

    return {
      estimateId: estimate.id,
      contractId: contract.id,
      estimateItemIds: estimate.items.map((item) => item.id),
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

    const data = await createTestEstimateAndContract();
    testContractId = data.contractId;
  });

  afterAll(async () => {
    // テストデータのクリーンアップ
    if (testUserId) {
      await cleanupUserData(testUserId);
      await prisma.user.delete({ where: { id: testUserId } }).catch(() => {});
    }

    await prisma.$disconnect();
    await redis.disconnect();
  });

  beforeEach(async () => {
    // 各テスト前に実行予算を削除（FK制約を考慮した順序で削除）
    const budgets = await prisma.executionBudget.findMany({
      where: { projectId: testProjectId },
      select: { id: true },
    });
    const budgetIds = budgets.map((b) => b.id);
    if (budgetIds.length > 0) {
      // Order → OrderItem のカスケード削除を先に実行
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
        where: { projectId: testProjectId },
      });
    }
  });

  // =================================================================
  // POST /api/projects/:projectId/execution-budget（作成）
  // =================================================================
  describe('POST /api/projects/:projectId/execution-budget', () => {
    it('契約書IDを指定して実行予算を作成できること', async () => {
      const response = await request(app)
        .post(`/api/projects/${testProjectId}/execution-budget`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ contractId: testContractId });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('id');
      expect(response.body.projectId).toBe(testProjectId);
      expect(response.body.contractId).toBe(testContractId);
      expect(response.body.version).toBe(0);
    });

    it('既に実行予算が存在する場合は409エラーを返すこと', async () => {
      // 最初に実行予算を作成
      await request(app)
        .post(`/api/projects/${testProjectId}/execution-budget`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ contractId: testContractId });

      // 2回目の作成は409エラー
      const response = await request(app)
        .post(`/api/projects/${testProjectId}/execution-budget`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ contractId: testContractId });

      expect(response.status).toBe(409);
    });

    it('存在しない契約書IDを指定した場合は404エラーを返すこと', async () => {
      // UUID v4形式の存在しないID（Zodバリデーションを通過するが実在しない）
      const fakeContractId = 'a0000000-0000-4000-a000-000000000000';
      const response = await request(app)
        .post(`/api/projects/${testProjectId}/execution-budget`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ contractId: fakeContractId });

      expect(response.status).toBe(404);
    });

    it('認証なしの場合は401エラーを返すこと', async () => {
      const response = await request(app)
        .post(`/api/projects/${testProjectId}/execution-budget`)
        .send({ contractId: testContractId });

      expect(response.status).toBe(401);
    });
  });

  // =================================================================
  // GET /api/projects/:projectId/execution-budget（取得）
  // =================================================================
  describe('GET /api/projects/:projectId/execution-budget', () => {
    it('実行予算を項目一覧含めて取得できること', async () => {
      // 先に実行予算を作成
      await request(app)
        .post(`/api/projects/${testProjectId}/execution-budget`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ contractId: testContractId });

      const response = await request(app)
        .get(`/api/projects/${testProjectId}/execution-budget`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('items');
      expect(response.body).toHaveProperty('totals');
      expect(response.body).toHaveProperty('orderProgressRate');
      expect(Array.isArray(response.body.items)).toBe(true);
      expect(response.body.items.length).toBeGreaterThan(0);
    });

    it('実行予算が存在しない場合は404エラーを返すこと', async () => {
      const response = await request(app)
        .get(`/api/projects/${testProjectId}/execution-budget`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(404);
    });

    it('合計行データに見積金額・実行金額・利益見込額が含まれること', async () => {
      await request(app)
        .post(`/api/projects/${testProjectId}/execution-budget`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ contractId: testContractId });

      const response = await request(app)
        .get(`/api/projects/${testProjectId}/execution-budget`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(200);
      expect(response.body.totals).toHaveProperty('estimateAmount');
      expect(response.body.totals).toHaveProperty('executionAmount');
      expect(response.body.totals).toHaveProperty('expectedProfit');
    });
  });

  // =================================================================
  // PATCH /api/projects/:projectId/execution-budget/items/:itemId（編集）
  // =================================================================
  describe('PATCH /api/projects/:projectId/execution-budget/items/:itemId', () => {
    it('実行単価を更新し、実行金額が自動計算されること', async () => {
      // 実行予算を作成
      await request(app)
        .post(`/api/projects/${testProjectId}/execution-budget`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ contractId: testContractId });

      // 実行予算を取得して項目IDを得る
      const getResponse = await request(app)
        .get(`/api/projects/${testProjectId}/execution-budget`)
        .set('Authorization', `Bearer ${accessToken}`);

      // 末端項目（子を持たない項目）を取得
      const allItems = getResponse.body.items;
      const leafItem = findLeafItem(allItems);
      expect(leafItem).toBeTruthy();

      // 実行単価を更新
      const response = await request(app)
        .patch(`/api/projects/${testProjectId}/execution-budget/items/${leafItem!.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          executionUnitPrice: '600',
          version: 0,
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('id', leafItem!.id);
      expect(response.body).toHaveProperty('version');
      // バージョンがインクリメントされていること
      expect(response.body.version).toBe(1);
    });

    it('楽観的排他制御: バージョン不一致の場合は409エラーを返すこと', async () => {
      // 実行予算を作成
      await request(app)
        .post(`/api/projects/${testProjectId}/execution-budget`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ contractId: testContractId });

      // 実行予算を取得して項目IDを得る
      const getResponse = await request(app)
        .get(`/api/projects/${testProjectId}/execution-budget`)
        .set('Authorization', `Bearer ${accessToken}`);

      const allItems = getResponse.body.items;
      const leafItem = findLeafItem(allItems);

      // 正常に更新（version 0 → 1）
      await request(app)
        .patch(`/api/projects/${testProjectId}/execution-budget/items/${leafItem!.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          executionUnitPrice: '600',
          version: 0,
        });

      // 古いバージョンで更新を試行（version 0だが既に1）
      const response = await request(app)
        .patch(`/api/projects/${testProjectId}/execution-budget/items/${leafItem!.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          executionUnitPrice: '700',
          version: 0,
        });

      expect(response.status).toBe(409);
    });

    it('備考を更新できること', async () => {
      // 実行予算を作成
      await request(app)
        .post(`/api/projects/${testProjectId}/execution-budget`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ contractId: testContractId });

      const getResponse = await request(app)
        .get(`/api/projects/${testProjectId}/execution-budget`)
        .set('Authorization', `Bearer ${accessToken}`);

      const allItems = getResponse.body.items;
      const leafItem = findLeafItem(allItems);

      const response = await request(app)
        .patch(`/api/projects/${testProjectId}/execution-budget/items/${leafItem!.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          remarks: 'テスト備考',
          version: 0,
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('id', leafItem!.id);
      expect(response.body).toHaveProperty('version');
    });
  });

  // =================================================================
  // DELETE /api/projects/:projectId/execution-budget（削除）
  // =================================================================
  describe('DELETE /api/projects/:projectId/execution-budget', () => {
    it('実行予算を削除できること', async () => {
      // 実行予算を作成
      await request(app)
        .post(`/api/projects/${testProjectId}/execution-budget`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ contractId: testContractId });

      // 削除
      const response = await request(app)
        .delete(`/api/projects/${testProjectId}/execution-budget`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(204);

      // 削除後は取得できない
      const getResponse = await request(app)
        .get(`/api/projects/${testProjectId}/execution-budget`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(getResponse.status).toBe(404);
    });

    it('存在しない実行予算の削除は404エラーを返すこと', async () => {
      const response = await request(app)
        .delete(`/api/projects/${testProjectId}/execution-budget`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(404);
    });

    it('発注済みの発注が存在する場合は削除が阻止されること', async () => {
      // 実行予算を作成
      const createResponse = await request(app)
        .post(`/api/projects/${testProjectId}/execution-budget`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ contractId: testContractId });

      const budgetId = createResponse.body.id;

      // 取引先を作成
      const tradingPartner = await prisma.tradingPartner.create({
        data: {
          name: 'テスト発注先_EB削除テスト',
          nameKana: 'テストハッチュウサキ',
          address: '東京都千代田区1-1-1',
          types: {
            create: [{ type: 'SUBCONTRACTOR' }],
          },
        },
      });

      // 発注を直接DB作成（ORDERED状態で）
      const budget = await prisma.executionBudget.findUnique({
        where: { id: budgetId },
        include: { items: true },
      });

      if (budget && budget.items.length > 0) {
        await prisma.order.create({
          data: {
            executionBudgetId: budgetId,
            tradingPartnerId: tradingPartner.id,
            status: 'ORDERED',
            confirmedAmount: 10000,
            items: {
              create: [
                {
                  executionBudgetItemId: budget.items[0]!.id,
                  checked: true,
                  orderAmount: 10000,
                },
              ],
            },
          },
        });
      }

      // 削除を試行
      const response = await request(app)
        .delete(`/api/projects/${testProjectId}/execution-budget`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(422);

      // クリーンアップ
      await prisma.tradingPartner.delete({ where: { id: tradingPartner.id } }).catch(() => {});
    });
  });

  // =================================================================
  // POST /api/projects/:projectId/execution-budget/apply-amendment（契約変更反映）
  // =================================================================
  describe('POST /api/projects/:projectId/execution-budget/apply-amendment', () => {
    it('変更契約を実行予算に反映できること', async () => {
      // 実行予算を作成
      await request(app)
        .post(`/api/projects/${testProjectId}/execution-budget`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ contractId: testContractId });

      // 変更用の新しい見積書を作成
      const amendmentEstimate = await prisma.estimate.create({
        data: {
          projectId: testProjectId,
          name: '変更見積書',
          items: {
            create: [
              {
                displayOrder: 0,
                lines: {
                  create: [
                    {
                      lineType: 'EXECUTION',
                      name: '変更追加項目',
                      specification: '規格X',
                      unit: '式',
                      quantity: 1,
                      unitPrice: 30000,
                      amount: 30000,
                    },
                  ],
                },
              },
            ],
          },
        },
      });

      // 変更契約を作成
      const amendmentContract = await prisma.contract.create({
        data: {
          projectId: testProjectId,
          contractType: 'AMENDMENT',
          status: 'CONTRACTED',
          parentContractId: testContractId,
          estimateId: amendmentEstimate.id,
          contractDate: new Date('2026-06-01'),
          constructionStartDate: new Date('2026-02-01'),
          constructionEndDate: new Date('2026-12-31'),
          deliveryDate: new Date('2027-01-15'),
          taxRate: 0.1,
          contractAmount: 130000,
          constructionPrice: 118182,
          taxAmount: 11818,
        },
      });

      // 契約変更反映
      const response = await request(app)
        .post(`/api/projects/${testProjectId}/execution-budget/apply-amendment`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ contractId: amendmentContract.id });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('addedCount');
    });

    it('実行予算が存在しない場合は404エラーを返すこと', async () => {
      // UUID v4形式の存在しないID
      const fakeContractId = 'a0000000-0000-4000-a000-000000000001';
      const response = await request(app)
        .post(`/api/projects/${testProjectId}/execution-budget/apply-amendment`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ contractId: fakeContractId });

      expect(response.status).toBe(404);
    });
  });

  /**
   * ツリー構造から末端項目（子を持たない項目）を再帰的に探す
   */
  function findLeafItem(
    items: Array<{ id: string; children?: Array<{ id: string; children?: unknown[] }> }>
  ): { id: string } | null {
    for (const item of items) {
      if (!item.children || item.children.length === 0) {
        return item;
      }
      const found = findLeafItem(
        item.children as Array<{
          id: string;
          children?: Array<{ id: string; children?: unknown[] }>;
        }>
      );
      if (found) return found;
    }
    return null;
  }
});
