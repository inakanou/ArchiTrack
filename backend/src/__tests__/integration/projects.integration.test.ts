/**
 * @fileoverview プロジェクトAPI統合テスト
 *
 * プロジェクト管理機能のEnd-to-End統合テストを実装します。
 *
 * Requirements:
 * - 12.4: 監査ログ連携（PROJECT_CREATED, PROJECT_UPDATED, PROJECT_DELETED）
 * - 12.6: 監査ログにアクション記録
 * - 19.3: CRUD操作のAPI応答時間（500ミリ秒以内）
 *
 * テストカバレッジ:
 * - プロジェクトCRUDフローの統合テスト
 * - ステータス遷移フローの統合テスト
 * - 楽観的排他制御の統合テスト
 * - 監査ログ記録の検証
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
 * プロジェクトAPI統合テスト
 */
describe('Project API Integration Tests', () => {
  let prisma: PrismaClient;
  let accessToken: string;
  let testUserId: string;
  let testSalesPersonId: string;
  let testConstructionPersonId: string;

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
        email: 'test-project-integration@example.com',
        displayName: 'Project Test User',
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

    // プロジェクト関連権限を割り当て
    const projectPermissions = await prisma.permission.findMany({
      where: {
        resource: 'project',
        action: {
          in: ['create', 'read', 'update', 'delete'],
        },
      },
    });

    if (userRole && projectPermissions.length > 0) {
      for (const permission of projectPermissions) {
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

    // ログイン
    const response = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: 'test-project-integration@example.com',
        password: 'TestPassword123!',
      })
      .expect(200);

    return {
      token: response.body.accessToken,
      userId: user.id,
    };
  };

  /**
   * 担当者候補ユーザーを作成
   */
  const createAssignableUsers = async (): Promise<{
    salesPersonId: string;
    constructionPersonId: string;
  }> => {
    const passwordHash = await (
      await import('@node-rs/argon2')
    ).hash('DummyPass123!', {
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4,
    });

    // 営業担当者
    const salesPerson = await prisma.user.create({
      data: {
        email: 'test-sales-person@example.com',
        displayName: '営業太郎',
        passwordHash,
      },
    });

    // userロールを割り当て
    const userRole = await prisma.role.findUnique({
      where: { name: 'user' },
    });

    if (userRole) {
      await prisma.userRole.create({
        data: {
          userId: salesPerson.id,
          roleId: userRole.id,
        },
      });
    }

    // 工事担当者
    const constructionPerson = await prisma.user.create({
      data: {
        email: 'test-construction-person@example.com',
        displayName: '工事次郎',
        passwordHash,
      },
    });

    if (userRole) {
      await prisma.userRole.create({
        data: {
          userId: constructionPerson.id,
          roleId: userRole.id,
        },
      });
    }

    return {
      salesPersonId: salesPerson.id,
      constructionPersonId: constructionPerson.id,
    };
  };

  beforeAll(async () => {
    // Prismaクライアントの初期化
    prisma = getPrismaClient();

    // Redisの初期化
    await initRedis();

    // シードデータを投入（CIでシードが実行されていない場合に備える）
    await seedRoles(prisma);
    await seedPermissions(prisma);
    await seedRolePermissions(prisma);
  });

  afterAll(async () => {
    // テストデータのクリーンアップ（依存関係の順序に注意）
    // 1. プロジェクトステータス履歴を削除
    await prisma.projectStatusHistory.deleteMany({
      where: {
        project: {
          name: {
            contains: 'test-project-integration',
          },
        },
      },
    });

    // 2. プロジェクトを削除
    await prisma.project.deleteMany({
      where: {
        name: {
          contains: 'test-project-integration',
        },
      },
    });

    // 3. 監査ログを削除
    await prisma.auditLog.deleteMany({
      where: {
        actorId: {
          in: [testUserId, testSalesPersonId, testConstructionPersonId].filter(Boolean),
        },
      },
    });

    // 4. ユーザーロールを削除
    await prisma.userRole.deleteMany({
      where: {
        user: {
          email: {
            contains: 'test-project-integration',
          },
        },
      },
    });

    await prisma.userRole.deleteMany({
      where: {
        user: {
          email: {
            in: ['test-sales-person@example.com', 'test-construction-person@example.com'],
          },
        },
      },
    });

    // 5. ユーザーを削除
    await prisma.user.deleteMany({
      where: {
        email: {
          contains: 'test-project-integration',
        },
      },
    });

    await prisma.user.deleteMany({
      where: {
        email: {
          in: ['test-sales-person@example.com', 'test-construction-person@example.com'],
        },
      },
    });

    // Redis クリーンアップ
    const client = redis.getClient();
    if (client) {
      const keys = await client.keys('test-project-integration:*');
      if (keys.length > 0) {
        await client.del(...keys);
      }
    }

    // 接続を切断
    await prisma.$disconnect();
    await redis.disconnect();
  });

  beforeEach(async () => {
    // 各テスト前にテストデータをクリーンアップ
    await prisma.projectStatusHistory.deleteMany({
      where: {
        project: {
          name: {
            contains: 'test-project-integration',
          },
        },
      },
    });

    await prisma.project.deleteMany({
      where: {
        name: {
          contains: 'test-project-integration',
        },
      },
    });

    await prisma.auditLog.deleteMany({
      where: {
        OR: [
          { action: 'PROJECT_CREATED' },
          { action: 'PROJECT_UPDATED' },
          { action: 'PROJECT_DELETED' },
          { action: 'PROJECT_STATUS_CHANGED' },
        ],
        actorId: {
          in: [testUserId, testSalesPersonId, testConstructionPersonId].filter(Boolean),
        },
      },
    });

    await prisma.userRole.deleteMany({
      where: {
        user: {
          email: {
            contains: 'test-project-integration',
          },
        },
      },
    });

    await prisma.userRole.deleteMany({
      where: {
        user: {
          email: {
            in: ['test-sales-person@example.com', 'test-construction-person@example.com'],
          },
        },
      },
    });

    await prisma.user.deleteMany({
      where: {
        email: {
          contains: 'test-project-integration',
        },
      },
    });

    await prisma.user.deleteMany({
      where: {
        email: {
          in: ['test-sales-person@example.com', 'test-construction-person@example.com'],
        },
      },
    });

    // Rate limitキーをクリア
    const client = redis.getClient();
    if (client) {
      const rateLimitKeys = await client.keys('rl:*');
      if (rateLimitKeys.length > 0) {
        await client.del(...rateLimitKeys);
      }
    }

    // テストユーザーの作成とログイン
    const loginResult = await loginTestUser();
    accessToken = loginResult.token;
    testUserId = loginResult.userId;

    // 担当者候補ユーザーの作成
    const assignableUsers = await createAssignableUsers();
    testSalesPersonId = assignableUsers.salesPersonId;
    testConstructionPersonId = assignableUsers.constructionPersonId;
  });

  describe('Project CRUD Flow Integration Tests', () => {
    /**
     * プロジェクト作成フローの統合テスト
     * 要件: 1.7, 1.8, 1.14, 1.15, 12.4
     * 注: customerNameはtradingPartnerIdへ移行済み（2025-12-12）
     */
    it('プロジェクトを作成し、詳細を取得できること', async () => {
      // 1. プロジェクト作成（tradingPartnerIdは任意）
      const createResponse = await request(app)
        .post('/api/projects')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'test-project-integration-create',
          // tradingPartnerIdは任意（取引先連携はtradingPartner管理機能経由）
          salesPersonId: testSalesPersonId,
          constructionPersonId: testConstructionPersonId,
          siteAddress: '東京都渋谷区神宮前1-1-1',
          description: '統合テスト用プロジェクト',
        })
        .expect(201);

      const projectId = createResponse.body.id;

      // 検証: レスポンス構造
      expect(createResponse.body).toMatchObject({
        id: expect.any(String),
        name: 'test-project-integration-create',
        status: 'PREPARING',
        statusLabel: '準備中',
        salesPerson: {
          id: testSalesPersonId,
          displayName: '営業太郎',
        },
        constructionPerson: {
          id: testConstructionPersonId,
          displayName: '工事次郎',
        },
      });

      // 2. 詳細取得
      const getResponse = await request(app)
        .get(`/api/projects/${projectId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(getResponse.body).toMatchObject({
        id: projectId,
        name: 'test-project-integration-create',
        status: 'PREPARING',
        siteAddress: '東京都渋谷区神宮前1-1-1',
        description: '統合テスト用プロジェクト',
      });

      // 3. 監査ログの検証
      const auditLog = await prisma.auditLog.findFirst({
        where: {
          action: 'PROJECT_CREATED',
          targetId: projectId,
        },
      });

      expect(auditLog).not.toBeNull();
      expect(auditLog?.actorId).toBe(testUserId);
      expect(auditLog?.targetType).toBe('Project');

      // 4. 初期ステータス履歴の検証
      const statusHistory = await prisma.projectStatusHistory.findFirst({
        where: {
          projectId,
          transitionType: 'initial',
        },
      });

      expect(statusHistory).not.toBeNull();
      expect(statusHistory?.fromStatus).toBeNull();
      expect(statusHistory?.toStatus).toBe('PREPARING');
    });

    /**
     * プロジェクト一覧取得フローの統合テスト
     * 要件: 2.1, 3.1, 4.1, 5.1, 6.1
     */
    it('プロジェクト一覧をページネーション・検索・フィルタ付きで取得できること', async () => {
      // 複数プロジェクトを作成
      for (let i = 1; i <= 3; i++) {
        await request(app)
          .post('/api/projects')
          .set('Authorization', `Bearer ${accessToken}`)
          .send({
            name: `test-project-integration-list-${i}`,
            // tradingPartnerIdは任意（顧客連携はtradingPartner管理機能経由）
            salesPersonId: testSalesPersonId,
          })
          .expect(201);
      }

      // 1. ページネーション付き一覧取得
      const listResponse = await request(app)
        .get('/api/projects?page=1&limit=2')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(listResponse.body).toHaveProperty('data');
      expect(listResponse.body).toHaveProperty('pagination');
      expect(listResponse.body.pagination.page).toBe(1);
      expect(listResponse.body.pagination.limit).toBe(2);
      expect(listResponse.body.pagination.total).toBeGreaterThanOrEqual(3);

      // 2. 検索付き一覧取得
      const searchResponse = await request(app)
        .get('/api/projects?search=list-1')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(
        searchResponse.body.data.some((p: { name: string }) =>
          p.name.includes('test-project-integration-list-1')
        )
      ).toBe(true);

      // 3. ステータスフィルタ付き一覧取得
      const filterResponse = await request(app)
        .get('/api/projects?status=PREPARING')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(
        filterResponse.body.data.every((p: { status: string }) => p.status === 'PREPARING')
      ).toBe(true);
    });

    /**
     * プロジェクト更新フローの統合テスト（楽観的排他制御含む）
     * 要件: 8.2, 8.3, 8.6, 12.4
     */
    it('プロジェクトを更新でき、楽観的排他制御が機能すること', async () => {
      // プロジェクト作成
      const createResponse = await request(app)
        .post('/api/projects')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'test-project-integration-update',
          // tradingPartnerIdは任意
          salesPersonId: testSalesPersonId,
        })
        .expect(201);

      const projectId = createResponse.body.id;
      const updatedAt = createResponse.body.updatedAt;

      // 1. 正常な更新
      const updateResponse = await request(app)
        .put(`/api/projects/${projectId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'test-project-integration-update-modified',
          expectedUpdatedAt: updatedAt,
        })
        .expect(200);

      expect(updateResponse.body.name).toBe('test-project-integration-update-modified');

      // 2. 監査ログの検証
      const auditLog = await prisma.auditLog.findFirst({
        where: {
          action: 'PROJECT_UPDATED',
          targetId: projectId,
        },
      });

      expect(auditLog).not.toBeNull();
      expect(auditLog?.before).toMatchObject({
        name: 'test-project-integration-update',
      });
      expect(auditLog?.after).toMatchObject({
        name: 'test-project-integration-update-modified',
      });

      // 3. 楽観的排他制御エラー（古いupdatedAtで更新を試みる）
      const conflictResponse = await request(app)
        .put(`/api/projects/${projectId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'test-project-integration-update-conflict',
          expectedUpdatedAt: updatedAt, // 古いタイムスタンプ
        })
        .expect(409);

      expect(conflictResponse.body.code).toBe('PROJECT_CONFLICT');
    });

    /**
     * プロジェクト削除フローの統合テスト
     * 要件: 9.2, 9.6, 12.4
     */
    it('プロジェクトを論理削除でき、削除後は取得できないこと', async () => {
      // プロジェクト作成
      const createResponse = await request(app)
        .post('/api/projects')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'test-project-integration-delete',
          // tradingPartnerIdは任意
          salesPersonId: testSalesPersonId,
        })
        .expect(201);

      const projectId = createResponse.body.id;

      // 1. 論理削除
      await request(app)
        .delete(`/api/projects/${projectId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(204);

      // 2. 削除後は404
      await request(app)
        .get(`/api/projects/${projectId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);

      // 3. 監査ログの検証
      const auditLog = await prisma.auditLog.findFirst({
        where: {
          action: 'PROJECT_DELETED',
          targetId: projectId,
        },
      });

      expect(auditLog).not.toBeNull();
      expect(auditLog?.before).toMatchObject({
        name: 'test-project-integration-delete',
      });
      expect(auditLog?.after).toBeNull();

      // 4. データベース確認（deletedAtがセットされている）
      const deletedProject = await prisma.project.findUnique({
        where: { id: projectId },
      });

      expect(deletedProject).not.toBeNull();
      expect(deletedProject?.deletedAt).not.toBeNull();
    });
  });

  describe('Status Transition Flow Integration Tests', () => {
    /**
     * 順方向ステータス遷移フローの統合テスト
     * 要件: 10.8, 10.10, 10.11, 12.6
     */
    it('順方向にステータス遷移でき、履歴が記録されること', async () => {
      // プロジェクト作成
      const createResponse = await request(app)
        .post('/api/projects')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'test-project-integration-status-forward',
          // tradingPartnerIdは任意
          salesPersonId: testSalesPersonId,
        })
        .expect(201);

      const projectId = createResponse.body.id;

      // 1. PREPARING → SURVEYING（順方向遷移）
      const transitionResponse = await request(app)
        .patch(`/api/projects/${projectId}/status`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          status: 'SURVEYING',
        })
        .expect(200);

      expect(transitionResponse.body.status).toBe('SURVEYING');

      // 2. ステータス履歴の検証
      const historyResponse = await request(app)
        .get(`/api/projects/${projectId}/status-history`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(historyResponse.body.length).toBeGreaterThanOrEqual(2);

      const forwardTransition = historyResponse.body.find(
        (h: { transitionType: string }) => h.transitionType === 'forward'
      );
      expect(forwardTransition).toMatchObject({
        fromStatus: 'PREPARING',
        toStatus: 'SURVEYING',
        transitionType: 'forward',
      });

      // 3. 監査ログの検証
      const auditLog = await prisma.auditLog.findFirst({
        where: {
          action: 'PROJECT_STATUS_CHANGED',
          targetId: projectId,
        },
        orderBy: {
          createdAt: 'desc',
        },
      });

      expect(auditLog).not.toBeNull();
      expect(auditLog?.before).toMatchObject({ status: 'PREPARING' });
      expect(auditLog?.after).toMatchObject({ status: 'SURVEYING' });
    });

    /**
     * 差し戻しステータス遷移フローの統合テスト
     * 要件: 10.14, 10.15, 12.6
     */
    it('差し戻し遷移時に理由が必須であり、履歴に記録されること', async () => {
      // プロジェクト作成
      const createResponse = await request(app)
        .post('/api/projects')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'test-project-integration-status-backward',
          // tradingPartnerIdは任意
          salesPersonId: testSalesPersonId,
        })
        .expect(201);

      const projectId = createResponse.body.id;

      // 1. まず順方向遷移
      await request(app)
        .patch(`/api/projects/${projectId}/status`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ status: 'SURVEYING' })
        .expect(200);

      // 2. 差し戻し遷移（理由なし）→ エラー
      const errorResponse = await request(app)
        .patch(`/api/projects/${projectId}/status`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ status: 'PREPARING' })
        .expect(422);

      expect(errorResponse.body.code).toBe('REASON_REQUIRED');

      // 3. 差し戻し遷移（理由あり）→ 成功
      const backwardResponse = await request(app)
        .patch(`/api/projects/${projectId}/status`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          status: 'PREPARING',
          reason: '調査内容の見直しが必要',
        })
        .expect(200);

      expect(backwardResponse.body.status).toBe('PREPARING');

      // 4. 履歴に理由が記録されていることを確認
      const historyResponse = await request(app)
        .get(`/api/projects/${projectId}/status-history`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const backwardTransition = historyResponse.body.find(
        (h: { transitionType: string }) => h.transitionType === 'backward'
      );
      expect(backwardTransition).toMatchObject({
        fromStatus: 'SURVEYING',
        toStatus: 'PREPARING',
        transitionType: 'backward',
        reason: '調査内容の見直しが必要',
      });
    });

    /**
     * 無効なステータス遷移のエラーハンドリング
     * 要件: 10.9
     */
    it('無効なステータス遷移は422エラーを返すこと', async () => {
      // プロジェクト作成
      const createResponse = await request(app)
        .post('/api/projects')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'test-project-integration-status-invalid',
          // tradingPartnerIdは任意
          salesPersonId: testSalesPersonId,
        })
        .expect(201);

      const projectId = createResponse.body.id;

      // PREPARING → CONSTRUCTING（スキップ遷移は不可）
      const errorResponse = await request(app)
        .patch(`/api/projects/${projectId}/status`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ status: 'CONSTRUCTING' })
        .expect(422);

      expect(errorResponse.body.code).toBe('INVALID_STATUS_TRANSITION');
      expect(errorResponse.body.fromStatus).toBe('PREPARING');
      expect(errorResponse.body.toStatus).toBe('CONSTRUCTING');
      expect(errorResponse.body.allowed).toBeDefined();
    });

    /**
     * 終端ステータス遷移のテスト
     * 要件: 10.6, 10.7
     */
    it('終端ステータスに遷移でき、そこからの遷移は不可となること', async () => {
      // プロジェクト作成
      const createResponse = await request(app)
        .post('/api/projects')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'test-project-integration-status-terminal',
          // tradingPartnerIdは任意
          salesPersonId: testSalesPersonId,
        })
        .expect(201);

      const projectId = createResponse.body.id;

      // 1. PREPARING → CANCELLED（終端遷移）
      await request(app)
        .patch(`/api/projects/${projectId}/status`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ status: 'CANCELLED' })
        .expect(200);

      // 2. CANCELLED → 他のステータスへの遷移は不可
      const errorResponse = await request(app)
        .patch(`/api/projects/${projectId}/status`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ status: 'PREPARING' })
        .expect(422);

      expect(errorResponse.body.code).toBe('INVALID_STATUS_TRANSITION');
      expect(errorResponse.body.allowed).toEqual([]);
    });
  });

  describe('Optimistic Locking Integration Tests', () => {
    /**
     * 同時更新時の楽観的排他制御
     * 要件: 8.6
     */
    it('同時更新時に後の更新が競合エラーになること', async () => {
      // プロジェクト作成
      const createResponse = await request(app)
        .post('/api/projects')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'test-project-integration-concurrent',
          // tradingPartnerIdは任意
          salesPersonId: testSalesPersonId,
        })
        .expect(201);

      const projectId = createResponse.body.id;
      const originalUpdatedAt = createResponse.body.updatedAt;

      // 1. 最初の更新（成功）
      const firstUpdate = await request(app)
        .put(`/api/projects/${projectId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'test-project-integration-concurrent-first',
          expectedUpdatedAt: originalUpdatedAt,
        })
        .expect(200);

      expect(firstUpdate.body.name).toBe('test-project-integration-concurrent-first');

      // 2. 同じoriginalUpdatedAtで2回目の更新を試みる（競合エラー）
      const secondUpdate = await request(app)
        .put(`/api/projects/${projectId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'test-project-integration-concurrent-second',
          expectedUpdatedAt: originalUpdatedAt, // 古いタイムスタンプ
        })
        .expect(409);

      expect(secondUpdate.body.code).toBe('PROJECT_CONFLICT');
      expect(secondUpdate.body.expectedUpdatedAt).toBe(originalUpdatedAt);
      expect(secondUpdate.body.actualUpdatedAt).not.toBe(originalUpdatedAt);
    });
  });

  describe('Audit Log Integration Tests', () => {
    /**
     * 全CRUD操作の監査ログ記録
     * 要件: 12.4, 12.6
     */
    it('全CRUD操作で監査ログが正しく記録されること', async () => {
      // 1. 作成
      const createResponse = await request(app)
        .post('/api/projects')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'test-project-integration-audit',
          // tradingPartnerIdは任意
          salesPersonId: testSalesPersonId,
        })
        .expect(201);

      const projectId = createResponse.body.id;
      const updatedAt = createResponse.body.updatedAt;

      // 2. 更新
      await request(app)
        .put(`/api/projects/${projectId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'test-project-integration-audit-updated',
          expectedUpdatedAt: updatedAt,
        })
        .expect(200);

      // 3. ステータス変更
      await request(app)
        .patch(`/api/projects/${projectId}/status`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ status: 'SURVEYING' })
        .expect(200);

      // 4. 削除
      await request(app)
        .delete(`/api/projects/${projectId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(204);

      // 5. 監査ログを検証
      const auditLogs = await prisma.auditLog.findMany({
        where: {
          targetId: projectId,
        },
        orderBy: {
          createdAt: 'asc',
        },
      });

      expect(auditLogs.length).toBe(4);
      expect(auditLogs[0]?.action).toBe('PROJECT_CREATED');
      expect(auditLogs[1]?.action).toBe('PROJECT_UPDATED');
      expect(auditLogs[2]?.action).toBe('PROJECT_STATUS_CHANGED');
      expect(auditLogs[3]?.action).toBe('PROJECT_DELETED');

      // 全ての監査ログにactorIdが記録されていること
      auditLogs.forEach((log) => {
        expect(log.actorId).toBe(testUserId);
        expect(log.targetType).toBe('Project');
      });
    });
  });

  describe('Performance Requirements', () => {
    /**
     * API応答時間の検証
     * 要件: 19.3
     */
    it('CRUD操作のAPI応答時間が500ミリ秒以内であること', async () => {
      // 作成
      const createStart = Date.now();
      const createResponse = await request(app)
        .post('/api/projects')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'test-project-integration-perf',
          // tradingPartnerIdは任意
          salesPersonId: testSalesPersonId,
        })
        .expect(201);
      const createTime = Date.now() - createStart;
      expect(createTime).toBeLessThan(500);

      const projectId = createResponse.body.id;
      const updatedAt = createResponse.body.updatedAt;

      // 詳細取得
      const getStart = Date.now();
      await request(app)
        .get(`/api/projects/${projectId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      const getTime = Date.now() - getStart;
      expect(getTime).toBeLessThan(500);

      // 一覧取得
      const listStart = Date.now();
      await request(app)
        .get('/api/projects')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      const listTime = Date.now() - listStart;
      expect(listTime).toBeLessThan(500);

      // 更新
      const updateStart = Date.now();
      await request(app)
        .put(`/api/projects/${projectId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'test-project-integration-perf-updated',
          expectedUpdatedAt: updatedAt,
        })
        .expect(200);
      const updateTime = Date.now() - updateStart;
      expect(updateTime).toBeLessThan(500);

      // 削除
      const deleteStart = Date.now();
      await request(app)
        .delete(`/api/projects/${projectId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(204);
      const deleteTime = Date.now() - deleteStart;
      expect(deleteTime).toBeLessThan(500);
    });
  });
});
