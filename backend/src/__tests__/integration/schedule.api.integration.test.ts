/**
 * @fileoverview 工程表API統合テスト
 *
 * TDD: RED phase - テストを先に書く
 *
 * Task 5.3: APIルートの統合テスト
 * - 全エンドポイント（GET/POST/PUT/DELETE）の統合テスト
 * - 認証・認可エラーケースのテスト
 * - 数量表連携を含む作成フローの統合テスト
 * - バルク保存の統合テスト
 *
 * Requirements:
 * - 1.1: 工程表一覧表示
 * - 1.2: 工程表新規作成
 * - 1.3: 工程表保存
 * - 1.4: 工程表詳細表示
 * - 1.5: 工程表削除
 * - 1.6: 保存失敗時エラー表示
 * - 2.1: 数量表選択肢表示
 * - 2.2: 数量表なしで空の工程表作成
 * - 2.3: 数量表指定時の項目自動取得
 * - 2.4: 数量表項目の着工日・日数入力欄
 *
 * @module __tests__/integration/schedule.api.integration.test
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
 * 工程表API統合テスト
 */
describe('Schedule API Integration Tests', () => {
  let prisma: PrismaClient;
  let accessToken: string;
  let testUserId: string;
  let testProjectId: string;

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
      where: { email: 'test-schedule-integration@example.com' },
    });
    if (existingUser) {
      // 関連プロジェクト配下の工程表・数量表を先に削除
      const existingProjects = await prisma.project.findMany({
        where: { createdById: existingUser.id },
        select: { id: true },
      });
      const projectIds = existingProjects.map((p) => p.id);
      if (projectIds.length > 0) {
        await prisma.constructionSchedule.deleteMany({
          where: { projectId: { in: projectIds } },
        });
        await prisma.quantityTable.deleteMany({
          where: { projectId: { in: projectIds } },
        });
        await prisma.project.deleteMany({
          where: { id: { in: projectIds } },
        });
      }
      await prisma.user.delete({ where: { id: existingUser.id } });
    }

    // テストユーザーを作成
    const user = await prisma.user.create({
      data: {
        email: 'test-schedule-integration@example.com',
        displayName: 'Schedule Test User',
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

    // 工程表関連の権限を作成
    const schedulePermissions = [
      { resource: 'schedule', action: 'create', description: '工程表の作成' },
      { resource: 'schedule', action: 'read', description: '工程表の閲覧' },
      { resource: 'schedule', action: 'update', description: '工程表の更新' },
      { resource: 'schedule', action: 'delete', description: '工程表の削除' },
    ];

    await prisma.permission.createMany({
      data: schedulePermissions,
      skipDuplicates: true,
    });

    // 必要な権限を割り当て（プロジェクト、工程表関連）
    const permissions = await prisma.permission.findMany({
      where: {
        OR: [
          { resource: 'project', action: { in: ['create', 'read', 'update', 'delete'] } },
          { resource: 'schedule', action: { in: ['create', 'read', 'update', 'delete'] } },
          { resource: 'quantity_table', action: { in: ['create', 'read', 'update', 'delete'] } },
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
    const response = await request(app).post('/api/v1/auth/login').send({
      email: 'test-schedule-integration@example.com',
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
        name: 'テスト用プロジェクト_工程表統合テスト',
        status: 'PREPARING',
        salesPersonId: testUserId,
        createdById: testUserId,
      },
    });
    return project.id;
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
  });

  afterAll(async () => {
    // テストデータのクリーンアップ（FK制約を考慮した順序で削除）
    if (testUserId) {
      // testUserId配下の全プロジェクトを取得（testProjectId以外にテスト中に作成されたものも含む）
      const allProjects = await prisma.project.findMany({
        where: { createdById: testUserId },
        select: { id: true },
      });
      const projectIds = allProjects.map((p) => p.id);

      if (projectIds.length > 0) {
        // 工程表と関連項目のカスケード削除
        await prisma.constructionSchedule.deleteMany({
          where: { projectId: { in: projectIds } },
        });
        await prisma.quantityTable.deleteMany({
          where: { projectId: { in: projectIds } },
        });
        await prisma.project.deleteMany({
          where: { id: { in: projectIds } },
        });
      }

      await prisma.user.deleteMany({
        where: { id: testUserId },
      });
    }

    await prisma.$disconnect();
    redis.disconnect();
  });

  beforeEach(async () => {
    // 各テスト前に工程表をクリーンアップ
    if (testProjectId) {
      await prisma.constructionSchedule.deleteMany({
        where: { projectId: testProjectId },
      });
    }
  });

  // =================================================================
  // 認証・認可エラーケース
  // =================================================================
  describe('認証・認可エラーケース', () => {
    it('認証なしでGET /api/projects/:projectId/schedulesにアクセスすると401を返す (Req 1.1)', async () => {
      const response = await request(app).get(`/api/projects/${testProjectId}/schedules`);

      expect(response.status).toBe(401);
    });

    it('認証なしでPOST /api/projects/:projectId/schedulesにアクセスすると401を返す (Req 1.2)', async () => {
      const response = await request(app)
        .post(`/api/projects/${testProjectId}/schedules`)
        .send({ name: 'テスト工程表' });

      expect(response.status).toBe(401);
    });

    it('認証なしでGET /api/schedules/:idにアクセスすると401を返す (Req 1.4)', async () => {
      const response = await request(app).get(
        '/api/schedules/12345678-1234-4234-a234-123456789012'
      );

      expect(response.status).toBe(401);
    });

    it('認証なしでPUT /api/schedules/:idにアクセスすると401を返す', async () => {
      const response = await request(app)
        .put('/api/schedules/12345678-1234-4234-a234-123456789012')
        .send({ name: 'テスト', version: 0 });

      expect(response.status).toBe(401);
    });

    it('認証なしでPUT /api/schedules/:id/bulk-saveにアクセスすると401を返す', async () => {
      const response = await request(app)
        .put('/api/schedules/12345678-1234-4234-a234-123456789012/bulk-save')
        .send({ version: 0, items: [] });

      expect(response.status).toBe(401);
    });

    it('認証なしでDELETE /api/schedules/:idにアクセスすると401を返す (Req 1.5)', async () => {
      const response = await request(app).delete(
        '/api/schedules/12345678-1234-4234-a234-123456789012'
      );

      expect(response.status).toBe(401);
    });

    it('認証なしでGET /api/schedules/:id/exportにアクセスすると401を返す', async () => {
      const response = await request(app).get(
        '/api/schedules/12345678-1234-4234-a234-123456789012/export?format=xlsx'
      );

      expect(response.status).toBe(401);
    });
  });

  // =================================================================
  // POST /api/projects/:projectId/schedules - 工程表作成
  // =================================================================
  describe('POST /api/projects/:projectId/schedules', () => {
    it('数量表なしで工程表を作成できる (Req 1.3, 2.2)', async () => {
      const response = await request(app)
        .post(`/api/projects/${testProjectId}/schedules`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'テスト工程表A' });

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        name: 'テスト工程表A',
        projectId: testProjectId,
        quantityTableId: null,
        quantityTableName: null,
        version: 0,
      });
      expect(response.body.id).toBeDefined();
      expect(response.body.items).toEqual([]);
      expect(response.body.createdAt).toBeDefined();
      expect(response.body.updatedAt).toBeDefined();
    });

    it('nameが空文字の場合400を返す (Req 1.6)', async () => {
      const response = await request(app)
        .post(`/api/projects/${testProjectId}/schedules`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: '' });

      expect(response.status).toBe(400);
    });

    it('nameが201文字以上の場合400を返す (Req 1.6)', async () => {
      const response = await request(app)
        .post(`/api/projects/${testProjectId}/schedules`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'A'.repeat(201) });

      expect(response.status).toBe(400);
    });

    it('quantityTableIdが不正なUUIDの場合400を返す (Req 1.6)', async () => {
      const response = await request(app)
        .post(`/api/projects/${testProjectId}/schedules`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'テスト', quantityTableId: 'invalid-uuid' });

      expect(response.status).toBe(400);
    });
  });

  // =================================================================
  // 数量表連携を含む作成フローの統合テスト
  // =================================================================
  describe('数量表連携を含む作成フロー', () => {
    let quantityTableId: string;

    beforeEach(async () => {
      // テスト用の数量表と項目を作成
      const quantityTable = await prisma.quantityTable.create({
        data: {
          projectId: testProjectId,
          name: 'テスト用数量表',
        },
      });
      quantityTableId = quantityTable.id;

      // 数量グループと数量項目を作成
      const group = await prisma.quantityGroup.create({
        data: {
          quantityTableId: quantityTable.id,
          name: 'テストグループ',
          displayOrder: 0,
        },
      });

      await prisma.quantityItem.createMany({
        data: [
          {
            quantityGroupId: group.id,
            name: 'コンクリート工',
            workType: 'コンクリート',
            unit: 'm3',
            quantity: 100,
            displayOrder: 0,
          },
          {
            quantityGroupId: group.id,
            name: '鉄筋工',
            workType: '鉄筋',
            unit: 'ton',
            quantity: 50,
            displayOrder: 1,
          },
        ],
      });
    });

    it('数量表指定時にQuantityItemからScheduleItemを生成する (Req 2.3)', async () => {
      const response = await request(app)
        .post(`/api/projects/${testProjectId}/schedules`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: '数量表連携工程表',
          quantityTableId,
        });

      expect(response.status).toBe(201);
      expect(response.body.quantityTableId).toBe(quantityTableId);
      expect(response.body.quantityTableName).toBe('テスト用数量表');
      expect(response.body.items).toHaveLength(2);
      expect(response.body.items[0].sourceType).toBe('QUANTITY_TABLE');
      expect(response.body.items[0].itemName).toBe('コンクリート工');
      expect(response.body.items[0].isExportTarget).toBe(true);
      expect(response.body.items[0].displayOrder).toBe(0);
      expect(response.body.items[1].itemName).toBe('鉄筋工');
      expect(response.body.items[1].displayOrder).toBe(1);
    });

    it('存在しない数量表を指定した場合422を返す (Req 2.1)', async () => {
      const response = await request(app)
        .post(`/api/projects/${testProjectId}/schedules`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: '不正な数量表',
          quantityTableId: '12345678-1234-4234-a234-123456789012',
        });

      expect(response.status).toBe(422);
      expect(response.body.code).toBe('SCHEDULE_VALIDATION_ERROR');
    });

    it('別プロジェクトの数量表を指定した場合422を返す (Req 2.1)', async () => {
      // 別プロジェクトを作成
      const otherProject = await prisma.project.create({
        data: {
          name: '別プロジェクト',
          status: 'PREPARING',
          salesPersonId: testUserId,
          createdById: testUserId,
        },
      });

      const otherQt = await prisma.quantityTable.create({
        data: {
          projectId: otherProject.id,
          name: '別プロジェクトの数量表',
        },
      });

      const response = await request(app)
        .post(`/api/projects/${testProjectId}/schedules`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: '不正な数量表参照',
          quantityTableId: otherQt.id,
        });

      expect(response.status).toBe(422);
      expect(response.body.code).toBe('SCHEDULE_VALIDATION_ERROR');

      // クリーンアップ
      await prisma.quantityTable.deleteMany({ where: { projectId: otherProject.id } });
      await prisma.project.delete({ where: { id: otherProject.id } });
    });
  });

  // =================================================================
  // GET /api/projects/:projectId/schedules - 工程表一覧取得
  // =================================================================
  describe('GET /api/projects/:projectId/schedules', () => {
    it('工程表一覧を取得できる (Req 1.1)', async () => {
      // テストデータを作成
      await prisma.constructionSchedule.create({
        data: {
          projectId: testProjectId,
          name: '工程表1',
          version: 0,
        },
      });
      await prisma.constructionSchedule.create({
        data: {
          projectId: testProjectId,
          name: '工程表2',
          version: 0,
        },
      });

      const response = await request(app)
        .get(`/api/projects/${testProjectId}/schedules`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(200);
      expect(response.body.schedules).toBeInstanceOf(Array);
      expect(response.body.schedules.length).toBeGreaterThanOrEqual(2);
      expect(response.body.total).toBeGreaterThanOrEqual(2);
    });

    it('ページネーションが機能する (Req 1.1)', async () => {
      // テストデータを3つ作成
      for (let i = 0; i < 3; i++) {
        await prisma.constructionSchedule.create({
          data: {
            projectId: testProjectId,
            name: `ページネーション工程表${i}`,
            version: 0,
          },
        });
      }

      const response = await request(app)
        .get(`/api/projects/${testProjectId}/schedules`)
        .query({ page: 1, limit: 2 })
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(200);
      expect(response.body.schedules.length).toBeLessThanOrEqual(2);
      expect(response.body.total).toBeGreaterThanOrEqual(3);
    });

    it('ソートが機能する (Req 1.1)', async () => {
      const response = await request(app)
        .get(`/api/projects/${testProjectId}/schedules`)
        .query({ sortBy: 'name', sortOrder: 'asc' })
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(200);
    });

    it('論理削除された工程表は一覧に含まれない (Req 1.1)', async () => {
      await prisma.constructionSchedule.create({
        data: {
          projectId: testProjectId,
          name: '削除済み工程表',
          version: 0,
          deletedAt: new Date(),
        },
      });

      const response = await request(app)
        .get(`/api/projects/${testProjectId}/schedules`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(200);
      const names = response.body.schedules.map((s: { name: string }) => s.name);
      expect(names).not.toContain('削除済み工程表');
    });

    it('無効なsortByの場合400を返す', async () => {
      const response = await request(app)
        .get(`/api/projects/${testProjectId}/schedules`)
        .query({ sortBy: 'invalid' })
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(400);
    });
  });

  // =================================================================
  // GET /api/schedules/:id - 工程表詳細取得
  // =================================================================
  describe('GET /api/schedules/:id', () => {
    it('工程表詳細を取得できる (Req 1.4)', async () => {
      const schedule = await prisma.constructionSchedule.create({
        data: {
          projectId: testProjectId,
          name: '詳細取得テスト工程表',
          version: 0,
        },
      });

      // 項目を追加
      await prisma.scheduleItem.createMany({
        data: [
          {
            scheduleId: schedule.id,
            sourceType: 'MANUAL',
            itemName: '基礎工事',
            labelText: '基礎',
            detailText: 'コンクリート打設',
            startDate: new Date('2026-04-01'),
            duration: 10,
            displayOrder: 0,
            isExportTarget: true,
          },
          {
            scheduleId: schedule.id,
            sourceType: 'MANUAL',
            itemName: '鉄骨工事',
            labelText: '鉄骨',
            detailText: '組立',
            startDate: new Date('2026-04-15'),
            duration: 20,
            displayOrder: 1,
            isExportTarget: false,
          },
        ],
      });

      const response = await request(app)
        .get(`/api/schedules/${schedule.id}`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        id: schedule.id,
        projectId: testProjectId,
        name: '詳細取得テスト工程表',
        version: 0,
      });
      expect(response.body.items).toHaveLength(2);
      expect(response.body.items[0].itemName).toBe('基礎工事');
      expect(response.body.items[0].startDate).toBe('2026-04-01');
      expect(response.body.items[0].duration).toBe(10);
      expect(response.body.items[0].isExportTarget).toBe(true);
      expect(response.body.items[1].itemName).toBe('鉄骨工事');
      expect(response.body.items[1].displayOrder).toBe(1);
    });

    it('存在しない工程表の場合404を返す (Req 1.4)', async () => {
      const response = await request(app)
        .get('/api/schedules/12345678-1234-4234-a234-123456789012')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(404);
    });

    it('論理削除された工程表の場合404を返す (Req 1.4)', async () => {
      const schedule = await prisma.constructionSchedule.create({
        data: {
          projectId: testProjectId,
          name: '削除済み詳細テスト',
          version: 0,
          deletedAt: new Date(),
        },
      });

      const response = await request(app)
        .get(`/api/schedules/${schedule.id}`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(404);
    });
  });

  // =================================================================
  // PUT /api/schedules/:id - 工程表更新
  // =================================================================
  describe('PUT /api/schedules/:id', () => {
    it('工程表の名称を更新できる (Req 1.3)', async () => {
      const schedule = await prisma.constructionSchedule.create({
        data: {
          projectId: testProjectId,
          name: '更新前の工程表',
          version: 0,
        },
      });

      const response = await request(app)
        .put(`/api/schedules/${schedule.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: '更新後の工程表', version: 0 });

      expect(response.status).toBe(200);
      expect(response.body.name).toBe('更新後の工程表');
      expect(response.body.version).toBe(1);
    });

    it('存在しない工程表の更新は404を返す', async () => {
      const response = await request(app)
        .put('/api/schedules/12345678-1234-4234-a234-123456789012')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: '更新', version: 0 });

      expect(response.status).toBe(404);
      expect(response.body.code).toBe('SCHEDULE_NOT_FOUND');
    });

    it('バージョン競合時は409を返す（楽観的排他制御）', async () => {
      const schedule = await prisma.constructionSchedule.create({
        data: {
          projectId: testProjectId,
          name: '競合テスト工程表',
          version: 5,
        },
      });

      const response = await request(app)
        .put(`/api/schedules/${schedule.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: '更新', version: 0 });

      expect(response.status).toBe(409);
      expect(response.body.code).toBe('SCHEDULE_CONFLICT');
    });

    it('nameが空の場合400を返す (Req 1.6)', async () => {
      const schedule = await prisma.constructionSchedule.create({
        data: {
          projectId: testProjectId,
          name: 'バリデーションテスト',
          version: 0,
        },
      });

      const response = await request(app)
        .put(`/api/schedules/${schedule.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: '', version: 0 });

      expect(response.status).toBe(400);
    });

    it('versionが未指定の場合400を返す (Req 1.6)', async () => {
      const schedule = await prisma.constructionSchedule.create({
        data: {
          projectId: testProjectId,
          name: 'version未指定テスト',
          version: 0,
        },
      });

      const response = await request(app)
        .put(`/api/schedules/${schedule.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: '更新' });

      expect(response.status).toBe(400);
    });
  });

  // =================================================================
  // PUT /api/schedules/:id/bulk-save - バルク保存
  // =================================================================
  describe('PUT /api/schedules/:id/bulk-save', () => {
    it('新規項目をバルク保存できる (Req 2.4)', async () => {
      const schedule = await prisma.constructionSchedule.create({
        data: {
          projectId: testProjectId,
          name: 'バルク保存テスト',
          version: 0,
        },
      });

      const response = await request(app)
        .put(`/api/schedules/${schedule.id}/bulk-save`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          version: 0,
          items: [
            {
              id: null,
              itemName: '基礎工事',
              labelText: '基礎',
              detailText: 'コンクリート打設',
              startDate: '2026-04-01',
              duration: 10,
              displayOrder: 0,
              isExportTarget: true,
            },
            {
              id: null,
              itemName: '鉄骨工事',
              labelText: '鉄骨',
              detailText: '組立',
              startDate: '2026-04-15',
              duration: 20,
              displayOrder: 1,
              isExportTarget: false,
            },
          ],
        });

      expect(response.status).toBe(200);
      expect(response.body.updatedItemCount).toBe(2);
      expect(response.body.updatedAt).toBeDefined();

      // 保存後の確認
      const detail = await request(app)
        .get(`/api/schedules/${schedule.id}`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(detail.body.items).toHaveLength(2);
      expect(detail.body.items[0].itemName).toBe('基礎工事');
      expect(detail.body.items[0].startDate).toBe('2026-04-01');
      expect(detail.body.items[0].duration).toBe(10);
      expect(detail.body.items[0].isExportTarget).toBe(true);
      expect(detail.body.items[1].itemName).toBe('鉄骨工事');
      expect(detail.body.items[1].isExportTarget).toBe(false);
      expect(detail.body.version).toBe(1);
    });

    it('空の項目配列で全項目を削除できる', async () => {
      const schedule = await prisma.constructionSchedule.create({
        data: {
          projectId: testProjectId,
          name: '全削除テスト',
          version: 0,
        },
      });

      // まず項目を追加
      await prisma.scheduleItem.create({
        data: {
          scheduleId: schedule.id,
          sourceType: 'MANUAL',
          itemName: '削除される項目',
          displayOrder: 0,
        },
      });

      const response = await request(app)
        .put(`/api/schedules/${schedule.id}/bulk-save`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ version: 0, items: [] });

      expect(response.status).toBe(200);
      expect(response.body.updatedItemCount).toBe(0);

      // 項目が削除されたことを確認
      const detail = await request(app)
        .get(`/api/schedules/${schedule.id}`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(detail.body.items).toHaveLength(0);
    });

    it('バルク保存でバージョン競合時は409を返す', async () => {
      const schedule = await prisma.constructionSchedule.create({
        data: {
          projectId: testProjectId,
          name: 'バルク競合テスト',
          version: 3,
        },
      });

      const response = await request(app)
        .put(`/api/schedules/${schedule.id}/bulk-save`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ version: 0, items: [] });

      expect(response.status).toBe(409);
      expect(response.body.code).toBe('SCHEDULE_CONFLICT');
    });

    it('存在しない工程表のバルク保存は404を返す', async () => {
      const response = await request(app)
        .put('/api/schedules/12345678-1234-4234-a234-123456789012/bulk-save')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ version: 0, items: [] });

      expect(response.status).toBe(404);
      expect(response.body.code).toBe('SCHEDULE_NOT_FOUND');
    });

    it('バリデーションエラー: itemNameが空 (Req 1.6)', async () => {
      const schedule = await prisma.constructionSchedule.create({
        data: {
          projectId: testProjectId,
          name: 'バリデーションテスト',
          version: 0,
        },
      });

      const response = await request(app)
        .put(`/api/schedules/${schedule.id}/bulk-save`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          version: 0,
          items: [
            {
              id: null,
              itemName: '',
              labelText: '',
              detailText: '',
              startDate: null,
              duration: null,
              displayOrder: 0,
              isExportTarget: true,
            },
          ],
        });

      expect(response.status).toBe(400);
    });

    it('バリデーションエラー: durationが0以下 (Req 1.6)', async () => {
      const schedule = await prisma.constructionSchedule.create({
        data: {
          projectId: testProjectId,
          name: 'duration検証テスト',
          version: 0,
        },
      });

      const response = await request(app)
        .put(`/api/schedules/${schedule.id}/bulk-save`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          version: 0,
          items: [
            {
              id: null,
              itemName: '工事',
              labelText: '',
              detailText: '',
              startDate: '2026-04-01',
              duration: 0,
              displayOrder: 0,
              isExportTarget: true,
            },
          ],
        });

      expect(response.status).toBe(400);
    });

    it('バリデーションエラー: startDateが不正な形式 (Req 1.6)', async () => {
      const schedule = await prisma.constructionSchedule.create({
        data: {
          projectId: testProjectId,
          name: 'startDate検証テスト',
          version: 0,
        },
      });

      const response = await request(app)
        .put(`/api/schedules/${schedule.id}/bulk-save`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          version: 0,
          items: [
            {
              id: null,
              itemName: '工事',
              labelText: '',
              detailText: '',
              startDate: 'invalid-date',
              duration: 5,
              displayOrder: 0,
              isExportTarget: true,
            },
          ],
        });

      expect(response.status).toBe(400);
    });
  });

  // =================================================================
  // DELETE /api/schedules/:id - 工程表削除
  // =================================================================
  describe('DELETE /api/schedules/:id', () => {
    it('工程表を論理削除できる (Req 1.5)', async () => {
      const schedule = await prisma.constructionSchedule.create({
        data: {
          projectId: testProjectId,
          name: '削除テスト工程表',
          version: 0,
        },
      });

      const response = await request(app)
        .delete(`/api/schedules/${schedule.id}`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(204);

      // 削除後にGETで404を返すことを確認
      const getResponse = await request(app)
        .get(`/api/schedules/${schedule.id}`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(getResponse.status).toBe(404);
    });

    it('存在しない工程表の削除は404を返す', async () => {
      const response = await request(app)
        .delete('/api/schedules/12345678-1234-4234-a234-123456789012')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(404);
      expect(response.body.code).toBe('SCHEDULE_NOT_FOUND');
    });

    it('既に論理削除済みの工程表の削除は404を返す', async () => {
      const schedule = await prisma.constructionSchedule.create({
        data: {
          projectId: testProjectId,
          name: '二重削除テスト',
          version: 0,
          deletedAt: new Date(),
        },
      });

      const response = await request(app)
        .delete(`/api/schedules/${schedule.id}`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(404);
    });
  });

  // =================================================================
  // GET /api/schedules/:id/export - エクスポート
  // =================================================================
  describe('GET /api/schedules/:id/export', () => {
    it('xlsx形式でExcelファイルをダウンロードできる', async () => {
      const schedule = await prisma.constructionSchedule.create({
        data: {
          projectId: testProjectId,
          name: 'エクスポートテスト',
          version: 0,
          items: {
            create: [
              {
                itemName: 'テスト項目',
                labelText: 'ラベル',
                detailText: '詳細',
                startDate: new Date('2026-04-01'),
                duration: 5,
                displayOrder: 0,
                isExportTarget: true,
              },
            ],
          },
        },
      });

      const response = await request(app)
        .get(`/api/schedules/${schedule.id}/export`)
        .query({ format: 'xlsx' })
        .set('Authorization', `Bearer ${accessToken}`)
        .buffer(true)
        .parse((res, callback) => {
          const chunks: Buffer[] = [];
          res.on('data', (chunk: Buffer) => chunks.push(chunk));
          res.on('end', () => callback(null, Buffer.concat(chunks)));
        });

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain(
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      expect(response.headers['content-disposition']).toContain('.xlsx');
      // レスポンスボディがBufferであることを確認
      expect(response.body).toBeInstanceOf(Buffer);
      expect(response.body.length).toBeGreaterThan(0);
    });

    it('存在しない工程表のエクスポートは404を返す', async () => {
      const response = await request(app)
        .get('/api/schedules/12345678-1234-4234-a234-123456789012/export')
        .query({ format: 'xlsx' })
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(404);
    });

    it('無効なformat指定は400を返す', async () => {
      const schedule = await prisma.constructionSchedule.create({
        data: {
          projectId: testProjectId,
          name: 'エクスポート形式テスト',
          version: 0,
        },
      });

      const response = await request(app)
        .get(`/api/schedules/${schedule.id}/export`)
        .query({ format: 'csv' })
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(400);
    });

    it('format未指定は400を返す', async () => {
      const schedule = await prisma.constructionSchedule.create({
        data: {
          projectId: testProjectId,
          name: 'format未指定テスト',
          version: 0,
        },
      });

      const response = await request(app)
        .get(`/api/schedules/${schedule.id}/export`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(400);
    });
  });

  // =================================================================
  // 工程表CRUD統合フロー
  // =================================================================
  describe('工程表CRUD統合フロー (Req 1.1-1.5)', () => {
    it('作成 → 一覧取得 → 詳細取得 → 更新 → バルク保存 → 削除の一連のフロー', async () => {
      // Step 1: 工程表作成
      const createResponse = await request(app)
        .post(`/api/projects/${testProjectId}/schedules`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: '統合フローテスト工程表' });

      expect(createResponse.status).toBe(201);
      const scheduleId = createResponse.body.id;

      // Step 2: 一覧取得で作成した工程表が含まれることを確認
      const listResponse = await request(app)
        .get(`/api/projects/${testProjectId}/schedules`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(listResponse.status).toBe(200);
      const found = listResponse.body.schedules.find((s: { id: string }) => s.id === scheduleId);
      expect(found).toBeDefined();
      expect(found.name).toBe('統合フローテスト工程表');

      // Step 3: 詳細取得
      const detailResponse = await request(app)
        .get(`/api/schedules/${scheduleId}`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(detailResponse.status).toBe(200);
      expect(detailResponse.body.id).toBe(scheduleId);

      // Step 4: 名称更新
      const updateResponse = await request(app)
        .put(`/api/schedules/${scheduleId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: '更新済み工程表', version: 0 });

      expect(updateResponse.status).toBe(200);
      expect(updateResponse.body.name).toBe('更新済み工程表');
      expect(updateResponse.body.version).toBe(1);

      // Step 5: バルク保存で項目追加
      const bulkResponse = await request(app)
        .put(`/api/schedules/${scheduleId}/bulk-save`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          version: 1,
          items: [
            {
              id: null,
              itemName: '仮設工事',
              labelText: '仮設',
              detailText: '足場設置',
              startDate: '2026-04-01',
              duration: 5,
              displayOrder: 0,
              isExportTarget: true,
            },
          ],
        });

      expect(bulkResponse.status).toBe(200);
      expect(bulkResponse.body.updatedItemCount).toBe(1);

      // Step 6: バルク保存後の詳細確認
      const afterBulk = await request(app)
        .get(`/api/schedules/${scheduleId}`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(afterBulk.body.items).toHaveLength(1);
      expect(afterBulk.body.items[0].itemName).toBe('仮設工事');
      expect(afterBulk.body.version).toBe(2);

      // Step 7: 削除
      const deleteResponse = await request(app)
        .delete(`/api/schedules/${scheduleId}`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(deleteResponse.status).toBe(204);

      // Step 8: 削除後にGETで404
      const afterDelete = await request(app)
        .get(`/api/schedules/${scheduleId}`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(afterDelete.status).toBe(404);

      // Step 9: 一覧にも含まれないことを確認
      const afterDeleteList = await request(app)
        .get(`/api/projects/${testProjectId}/schedules`)
        .set('Authorization', `Bearer ${accessToken}`);

      const deletedFound = afterDeleteList.body.schedules.find(
        (s: { id: string }) => s.id === scheduleId
      );
      expect(deletedFound).toBeUndefined();
    });
  });
});
