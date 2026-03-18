/**
 * @fileoverview 契約書API統合テスト（削除制約・権限チェック）
 *
 * TDD: RED phase - テストを先に書く
 *
 * Task 16.1: バックエンド削除制約と権限の単体テスト・統合テストを作成する
 *
 * 実際のDBにアクセスして、削除制約チェックと権限チェックの統合テストを実行します。
 *
 * Requirements:
 * - 8.11: 契約書論理削除
 * - 12.1: 子契約が存在する場合の削除拒否
 * - 12.2: ステータスが契約済の場合の削除拒否
 * - 13.1: 認証済みユーザー限定閲覧
 * - 13.2: 権限チェック実行
 * - 13.3: 権限定義（contract:create/read/update/delete）
 * - 13.4: 403 Forbidden返却
 *
 * @module __tests__/integration/contract.api.integration.test
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
 * 契約書API統合テスト（削除制約・権限チェック）
 */
describe('Contract API Integration Tests - Deletion Constraints & Permissions', () => {
  let prisma: PrismaClient;
  let accessToken: string;
  let testUserId: string;
  let testProjectId: string;
  let testEstimateId: string;

  // 権限テスト用のトークン（contract:deleteなし）
  let limitedAccessToken: string;
  let limitedUserId: string;

  /**
   * テスト用認証情報でログインしてアクセストークンを取得（全権限あり）
   */
  const loginAdminTestUser = async (): Promise<{ token: string; userId: string }> => {
    const passwordHash = await (
      await import('@node-rs/argon2')
    ).hash('TestPassword123!', {
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4,
    });

    // 前回のテストデータ残留を除去
    const existingUser = await prisma.user.findUnique({
      where: { email: 'test-contract-admin-integration@example.com' },
    });
    if (existingUser) {
      await cleanupUserData(existingUser.id);
      await prisma.user.delete({ where: { id: existingUser.id } });
    }

    // テストユーザーを作成
    const user = await prisma.user.create({
      data: {
        email: 'test-contract-admin-integration@example.com',
        displayName: 'Contract Admin Test User',
        passwordHash,
      },
    });

    // adminロールを取得して割り当て
    const adminRole = await prisma.role.findUnique({
      where: { name: 'admin' },
    });

    if (adminRole) {
      await prisma.userRole.create({
        data: {
          userId: user.id,
          roleId: adminRole.id,
        },
      });
    }

    // ログインしてトークンを取得
    const response = await request(app).post('/api/v1/auth/login').send({
      email: 'test-contract-admin-integration@example.com',
      password: 'TestPassword123!',
    });

    return {
      token: response.body.accessToken,
      userId: user.id,
    };
  };

  /**
   * テスト用認証情報でログイン（contract:deleteなし = userロール）
   */
  const loginLimitedTestUser = async (): Promise<{ token: string; userId: string }> => {
    const passwordHash = await (
      await import('@node-rs/argon2')
    ).hash('TestPassword123!', {
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4,
    });

    // 前回のテストデータ残留を除去
    const existingUser = await prisma.user.findUnique({
      where: { email: 'test-contract-limited-integration@example.com' },
    });
    if (existingUser) {
      await cleanupUserData(existingUser.id);
      await prisma.user.delete({ where: { id: existingUser.id } });
    }

    // テストユーザーを作成
    const user = await prisma.user.create({
      data: {
        email: 'test-contract-limited-integration@example.com',
        displayName: 'Contract Limited Test User',
        passwordHash,
      },
    });

    // userロールを取得して割り当て（contract:deleteなし）
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
      email: 'test-contract-limited-integration@example.com',
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
      // FK制約を考慮した順序で削除（子契約→親契約の順序で処理）
      // まず実行予算系のデータを削除
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
      // 子契約を先に削除（parentContractId参照制約）
      await prisma.contract.updateMany({
        where: {
          projectId: { in: projectIds },
          parentContractId: { not: null },
        },
        data: { parentContractId: null },
      });
      await prisma.contract.deleteMany({
        where: { projectId: { in: projectIds } },
      });
      await prisma.estimate.deleteMany({
        where: { projectId: { in: projectIds } },
      });
      await prisma.project.deleteMany({
        where: { id: { in: projectIds } },
      });
    }
    await prisma.userRole.deleteMany({ where: { userId } });
  };

  /**
   * テスト用プロジェクトと見積書を作成
   */
  const createTestProjectAndEstimate = async (): Promise<{
    projectId: string;
    estimateId: string;
  }> => {
    const project = await prisma.project.create({
      data: {
        name: 'テスト用プロジェクト_契約書統合テスト',
        status: 'PREPARING',
        salesPersonId: testUserId,
        createdById: testUserId,
      },
    });

    const estimate = await prisma.estimate.create({
      data: {
        projectId: project.id,
        name: 'テスト見積書_契約書統合テスト',
      },
    });

    return {
      projectId: project.id,
      estimateId: estimate.id,
    };
  };

  /**
   * テスト用契約書を作成するヘルパー
   */
  const createTestContract = async (overrides: Record<string, unknown> = {}): Promise<string> => {
    const contract = await prisma.contract.create({
      data: {
        projectId: testProjectId,
        contractType: 'NEW',
        status: 'BEFORE_CONTRACT',
        estimateId: testEstimateId,
        contractDate: new Date('2026-04-01'),
        constructionStartDate: new Date('2026-05-01'),
        constructionEndDate: new Date('2026-12-31'),
        deliveryDate: new Date('2027-01-15'),
        taxRate: 0.1,
        contractAmount: 11000000,
        constructionPrice: 10000000,
        taxAmount: 1000000,
        ...overrides,
      },
    });
    return contract.id;
  };

  /**
   * テスト実行前にクリーンアップしてから契約書を削除
   */
  const cleanupContracts = async (): Promise<void> => {
    // 子契約のparentContractIdをnullにしてから全削除
    await prisma.contract.updateMany({
      where: { projectId: testProjectId, parentContractId: { not: null } },
      data: { parentContractId: null },
    });
    await prisma.contract.deleteMany({
      where: { projectId: testProjectId },
    });
  };

  beforeAll(async () => {
    prisma = getPrismaClient();
    await initRedis();
    await seedRoles(prisma);
    await seedPermissions(prisma);
    await seedRolePermissions(prisma);

    // 管理者ユーザー（全権限あり）
    const adminAuth = await loginAdminTestUser();
    accessToken = adminAuth.token;
    testUserId = adminAuth.userId;

    // 制限ユーザー（contract:deleteなし）
    const limitedAuth = await loginLimitedTestUser();
    limitedAccessToken = limitedAuth.token;
    limitedUserId = limitedAuth.userId;

    // テストプロジェクトと見積書を作成
    const testData = await createTestProjectAndEstimate();
    testProjectId = testData.projectId;
    testEstimateId = testData.estimateId;
  });

  afterAll(async () => {
    // テストデータのクリーンアップ
    if (testUserId) {
      await cleanupUserData(testUserId);
      await prisma.user.delete({ where: { id: testUserId } }).catch(() => {});
    }
    if (limitedUserId) {
      await cleanupUserData(limitedUserId);
      await prisma.user.delete({ where: { id: limitedUserId } }).catch(() => {});
    }

    await prisma.$disconnect();
    await redis.disconnect();
  });

  beforeEach(async () => {
    // 各テスト前に契約書をクリーンアップ
    await cleanupContracts();
  });

  // =================================================================
  // DELETE /api/contracts/:id - 削除制約テスト
  // Requirements: 8.11, 12.1, 12.2
  // =================================================================
  describe('DELETE /api/contracts/:id - 削除制約テスト', () => {
    it('制約なしの場合、契約書を正常に論理削除できること（204レスポンス）', async () => {
      // ステータスがBEFORE_CONTRACT、子契約なしの契約書を作成
      const contractId = await createTestContract();

      const response = await request(app)
        .delete(`/api/contracts/${contractId}`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(204);

      // DBで論理削除されていることを確認
      const deletedContract = await prisma.contract.findUnique({
        where: { id: contractId },
      });
      expect(deletedContract).not.toBeNull();
      expect(deletedContract!.deletedAt).not.toBeNull();
    });

    it('子契約が存在する場合、422エラーが返ること', async () => {
      // 親契約を作成
      const parentContractId = await createTestContract();

      // 子契約（変更契約）を作成
      await createTestContract({
        contractType: 'AMENDMENT',
        parentContractId,
      });

      const response = await request(app)
        .delete(`/api/contracts/${parentContractId}`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(422);
      expect(response.body.detail).toBe('この契約書は変更契約の基となっているため削除できません');
      expect(response.body.code).toBe('CONTRACT_DELETION_CONSTRAINT');

      // 親契約が削除されていないことを確認
      const parentContract = await prisma.contract.findUnique({
        where: { id: parentContractId },
      });
      expect(parentContract!.deletedAt).toBeNull();
    });

    it('ステータスがCONTRACTEDの場合、422エラーが返ること', async () => {
      // CONTRACTED状態の契約書を作成
      const contractId = await createTestContract({
        status: 'CONTRACTED',
      });

      const response = await request(app)
        .delete(`/api/contracts/${contractId}`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(422);
      expect(response.body.detail).toBe(
        '契約済の契約書は削除できません。ステータスを契約前に戻してから削除してください'
      );
      expect(response.body.code).toBe('CONTRACT_DELETION_CONSTRAINT');

      // 契約書が削除されていないことを確認
      const contract = await prisma.contract.findUnique({
        where: { id: contractId },
      });
      expect(contract!.deletedAt).toBeNull();
    });

    it('子契約が全て論理削除済みの場合、正常に削除できること', async () => {
      // 親契約を作成
      const parentContractId = await createTestContract();

      // 子契約を作成して論理削除
      const childContractId = await createTestContract({
        contractType: 'AMENDMENT',
        parentContractId,
      });
      await prisma.contract.update({
        where: { id: childContractId },
        data: { deletedAt: new Date() },
      });

      const response = await request(app)
        .delete(`/api/contracts/${parentContractId}`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(204);

      // 論理削除されていることを確認
      const deletedContract = await prisma.contract.findUnique({
        where: { id: parentContractId },
      });
      expect(deletedContract!.deletedAt).not.toBeNull();
    });

    it('存在しない契約書の削除で404エラーが返ること', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';

      const response = await request(app)
        .delete(`/api/contracts/${fakeId}`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(404);
    });
  });

  // =================================================================
  // 権限チェック統合テスト
  // Requirements: 13.1, 13.2, 13.3, 13.4
  // =================================================================
  describe('権限チェック統合テスト', () => {
    it('contract:delete権限のないユーザーがDELETEを実行すると403が返ること', async () => {
      const contractId = await createTestContract();

      const response = await request(app)
        .delete(`/api/contracts/${contractId}`)
        .set('Authorization', `Bearer ${limitedAccessToken}`);

      expect(response.status).toBe(403);

      // 契約書が削除されていないことを確認
      const contract = await prisma.contract.findUnique({
        where: { id: contractId },
      });
      expect(contract!.deletedAt).toBeNull();
    });

    it('未認証ユーザーがGET一覧を実行すると401が返ること', async () => {
      const response = await request(app).get(`/api/projects/${testProjectId}/contracts`);

      expect(response.status).toBe(401);
    });

    it('未認証ユーザーがGET詳細を実行すると401が返ること', async () => {
      const contractId = await createTestContract();

      const response = await request(app).get(`/api/contracts/${contractId}`);

      expect(response.status).toBe(401);
    });

    it('未認証ユーザーがPOSTを実行すると401が返ること', async () => {
      const response = await request(app).post(`/api/projects/${testProjectId}/contracts`).send({
        contractType: 'NEW',
        parentContractId: null,
        estimateId: testEstimateId,
        contractDate: '2026-04-01',
        constructionStartDate: '2026-05-01',
        constructionEndDate: '2026-12-31',
        deliveryDate: '2027-01-15',
        taxRate: 0.1,
        paymentTerms: '',
        separateConstruction: '',
        otherNotes: '',
        supervisorTradingPartnerId: null,
        contractAmount: 11000000,
        constructionPrice: 10000000,
        taxAmount: 1000000,
      });

      expect(response.status).toBe(401);
    });

    it('未認証ユーザーがDELETEを実行すると401が返ること', async () => {
      const contractId = await createTestContract();

      const response = await request(app).delete(`/api/contracts/${contractId}`);

      expect(response.status).toBe(401);
    });

    it('認証済みユーザー（userロール）がGET一覧を実行できること', async () => {
      const response = await request(app)
        .get(`/api/projects/${testProjectId}/contracts`)
        .set('Authorization', `Bearer ${limitedAccessToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('contracts');
      expect(response.body).toHaveProperty('total');
    });

    it('認証済みユーザー（userロール）がPOSTで契約書を作成できること', async () => {
      const response = await request(app)
        .post(`/api/projects/${testProjectId}/contracts`)
        .set('Authorization', `Bearer ${limitedAccessToken}`)
        .send({
          contractType: 'NEW',
          parentContractId: null,
          estimateId: testEstimateId,
          contractDate: '2026-04-01',
          constructionStartDate: '2026-05-01',
          constructionEndDate: '2026-12-31',
          deliveryDate: '2027-01-15',
          taxRate: 0.1,
          paymentTerms: '',
          separateConstruction: '',
          otherNotes: '',
          supervisorTradingPartnerId: null,
          contractAmount: 11000000,
          constructionPrice: 10000000,
          taxAmount: 1000000,
        });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('id');
    });
  });
});
