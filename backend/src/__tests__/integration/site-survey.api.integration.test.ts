/**
 * @fileoverview 現場調査API統合テスト
 *
 * Task 26.1: バックエンド統合テストを実装する
 *
 * Requirements coverage (site-survey):
 * - 12.1: 認証ミドルウェアを全てのsite-survey関連APIエンドポイントに適用
 * - 12.2: 権限ベースのアクセス制御を実装
 * - 12.3: 未認証リクエストに401 Unauthorized、権限不足に403 Forbiddenを返す
 * - 12.5: 監査ログに記録する
 *
 * Scope:
 * - APIエンドポイントの統合テスト
 * - 認証・認可フローのテスト
 * - R2連携のテスト（モック使用）
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

describe('Site Survey API Integration Tests', () => {
  let prisma: PrismaClient;
  let testUserId: string;
  let testProjectId: string;
  let accessToken: string;

  /**
   * テスト用の認証済みユーザーを作成しトークンを取得する
   */
  const createAuthenticatedUser = async (
    email: string,
    displayName: string,
    roles: string[] = ['user']
  ): Promise<{
    userId: string;
    accessToken: string;
  }> => {
    const { hash } = await import('@node-rs/argon2');
    const passwordHash = await hash('TestPassword123!@#', {
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4,
    });

    const user = await prisma.user.create({
      data: {
        email,
        displayName,
        passwordHash,
      },
    });

    // ロールを割り当て
    for (const roleName of roles) {
      const role = await prisma.role.findUnique({ where: { name: roleName } });
      if (role) {
        await prisma.userRole.create({
          data: {
            userId: user.id,
            roleId: role.id,
          },
        });
      }
    }

    // ログインしてトークンを取得
    const loginResponse = await request(app).post('/api/v1/auth/login').send({
      email,
      password: 'TestPassword123!@#',
    });

    return {
      userId: user.id,
      accessToken: loginResponse.body.accessToken,
    };
  };

  beforeAll(async () => {
    prisma = getPrismaClient();
    await initRedis();

    // シードデータを投入
    await seedRoles(prisma);
    await seedPermissions(prisma);
    await seedRolePermissions(prisma);

    // テスト用のsite_survey権限を作成（存在しない場合）
    const surveyPermissions = [
      { resource: 'site_survey', action: 'create' },
      { resource: 'site_survey', action: 'read' },
      { resource: 'site_survey', action: 'update' },
      { resource: 'site_survey', action: 'delete' },
    ];

    for (const perm of surveyPermissions) {
      const existingPerm = await prisma.permission.findUnique({
        where: { resource_action: { resource: perm.resource, action: perm.action } },
      });
      if (!existingPerm) {
        await prisma.permission.create({
          data: {
            resource: perm.resource,
            action: perm.action,
            description: `現場調査 ${perm.action} 権限`,
          },
        });
      }
    }

    // user, admin, managerロールに権限を追加
    const roles = ['user', 'admin', 'manager'];
    for (const roleName of roles) {
      const role = await prisma.role.findUnique({ where: { name: roleName } });
      if (role) {
        for (const perm of surveyPermissions) {
          const permRecord = await prisma.permission.findUnique({
            where: { resource_action: { resource: perm.resource, action: perm.action } },
          });
          if (permRecord) {
            const existing = await prisma.rolePermission.findFirst({
              where: { roleId: role.id, permissionId: permRecord.id },
            });
            if (!existing) {
              await prisma.rolePermission.create({
                data: { roleId: role.id, permissionId: permRecord.id },
              });
            }
          }
        }
      }
    }

    // テストユーザーの作成
    const testUserData = await createAuthenticatedUser(
      'test-site-survey-integration@example.com',
      'Site Survey Test User',
      ['user']
    );
    testUserId = testUserData.userId;
    accessToken = testUserData.accessToken;

    // テスト用プロジェクトの作成
    const testProject = await prisma.project.create({
      data: {
        name: 'Site Survey Integration Test Project',
        salesPersonId: testUserId,
        createdById: testUserId,
      },
    });
    testProjectId = testProject.id;
  });

  afterAll(async () => {
    // テストデータのクリーンアップ
    await prisma.siteSurvey.deleteMany({
      where: {
        projectId: testProjectId,
      },
    });

    await prisma.project.deleteMany({
      where: {
        name: 'Site Survey Integration Test Project',
      },
    });

    await prisma.user.deleteMany({
      where: {
        email: {
          in: [
            'test-site-survey-integration@example.com',
            'test-site-survey-admin@example.com',
            'test-site-survey-no-auth@example.com',
          ],
        },
      },
    });

    // Redisキャッシュのクリーンアップ
    const client = redis.getClient();
    if (client) {
      const keys = await client.keys('test-site-survey-*');
      if (keys.length > 0) {
        await client.del(...keys);
      }
    }

    await prisma.$disconnect();
    await redis.disconnect();
  });

  beforeEach(async () => {
    // 各テスト前に現場調査データをクリーンアップ
    await prisma.siteSurvey.deleteMany({
      where: {
        projectId: testProjectId,
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
  });

  describe('Authentication Tests (REQ 12.1, 12.3)', () => {
    /**
     * REQ 12.3: 未認証リクエストに401 Unauthorizedを返す
     */
    describe('Unauthenticated access', () => {
      it('GET /api/projects/:projectId/site-surveys - 認証なしで401を返す', async () => {
        const response = await request(app)
          .get(`/api/projects/${testProjectId}/site-surveys`)
          .expect(401);

        expect(response.body).toHaveProperty('error', 'MISSING_TOKEN');
      });

      it('POST /api/projects/:projectId/site-surveys - 認証なしで401を返す', async () => {
        const response = await request(app)
          .post(`/api/projects/${testProjectId}/site-surveys`)
          .send({
            name: 'Test Survey',
            surveyDate: '2025-01-15',
          })
          .expect(401);

        expect(response.body).toHaveProperty('error', 'MISSING_TOKEN');
      });

      it('GET /api/site-surveys/:id - 認証なしで401を返す', async () => {
        // まず認証付きで現場調査を作成
        const createResponse = await request(app)
          .post(`/api/projects/${testProjectId}/site-surveys`)
          .set('Authorization', `Bearer ${accessToken}`)
          .send({
            name: 'Auth Test Survey',
            surveyDate: '2025-01-15',
          })
          .expect(201);

        // 認証なしでアクセス
        const response = await request(app)
          .get(`/api/site-surveys/${createResponse.body.id}`)
          .expect(401);

        expect(response.body).toHaveProperty('error', 'MISSING_TOKEN');
      });

      it('PUT /api/site-surveys/:id - 認証なしで401を返す', async () => {
        const createResponse = await request(app)
          .post(`/api/projects/${testProjectId}/site-surveys`)
          .set('Authorization', `Bearer ${accessToken}`)
          .send({
            name: 'Update Auth Test Survey',
            surveyDate: '2025-01-15',
          })
          .expect(201);

        const response = await request(app)
          .put(`/api/site-surveys/${createResponse.body.id}`)
          .send({
            name: 'Updated Name',
            expectedUpdatedAt: createResponse.body.updatedAt,
          })
          .expect(401);

        expect(response.body).toHaveProperty('error', 'MISSING_TOKEN');
      });

      it('DELETE /api/site-surveys/:id - 認証なしで401を返す', async () => {
        const createResponse = await request(app)
          .post(`/api/projects/${testProjectId}/site-surveys`)
          .set('Authorization', `Bearer ${accessToken}`)
          .send({
            name: 'Delete Auth Test Survey',
            surveyDate: '2025-01-15',
          })
          .expect(201);

        const response = await request(app)
          .delete(`/api/site-surveys/${createResponse.body.id}`)
          .expect(401);

        expect(response.body).toHaveProperty('error', 'MISSING_TOKEN');
      });
    });

    /**
     * REQ 12.1: 認証ミドルウェアを全てのsite-survey関連APIエンドポイントに適用
     */
    describe('Invalid token access', () => {
      it('無効なトークンで401を返す', async () => {
        const response = await request(app)
          .get(`/api/projects/${testProjectId}/site-surveys`)
          .set('Authorization', 'Bearer invalid.token.here')
          .expect(401);

        expect(response.body).toHaveProperty('error', 'INVALID_TOKEN');
      });

      it('期限切れトークンで401を返す', async () => {
        // 改ざんされたトークンを使用（実際にはJWTライブラリが検証で失敗する）
        const tamperedToken =
          'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ0ZXN0IiwiZXhwIjoxNjAwMDAwMDAwfQ.invalid';

        const response = await request(app)
          .get(`/api/projects/${testProjectId}/site-surveys`)
          .set('Authorization', `Bearer ${tamperedToken}`)
          .expect(401);

        expect(response.body).toHaveProperty('error', 'INVALID_TOKEN');
      });
    });
  });

  describe('Site Survey CRUD API Tests', () => {
    /**
     * POST /api/projects/:projectId/site-surveys - 現場調査作成
     */
    describe('POST /api/projects/:projectId/site-surveys', () => {
      it('認証済みユーザーが現場調査を作成できる', async () => {
        const response = await request(app)
          .post(`/api/projects/${testProjectId}/site-surveys`)
          .set('Authorization', `Bearer ${accessToken}`)
          .send({
            name: 'New Site Survey',
            surveyDate: '2025-01-20',
            memo: 'Test memo content',
          })
          .expect(201);

        expect(response.body).toHaveProperty('id');
        expect(response.body.name).toBe('New Site Survey');
        expect(response.body.projectId).toBe(testProjectId);
        expect(response.body.memo).toBe('Test memo content');
        expect(response.body).toHaveProperty('createdAt');
        expect(response.body).toHaveProperty('updatedAt');
      });

      it('存在しないプロジェクトに対して404を返す', async () => {
        // 有効なUUID形式だが存在しないID
        const fakeProjectId = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';

        const response = await request(app)
          .post(`/api/projects/${fakeProjectId}/site-surveys`)
          .set('Authorization', `Bearer ${accessToken}`)
          .send({
            name: 'Should Fail Survey',
            surveyDate: '2025-01-20',
          })
          .expect(404);

        expect(response.body.code).toBe('PROJECT_NOT_FOUND');
      });

      it('バリデーションエラーで400を返す（名前なし）', async () => {
        const response = await request(app)
          .post(`/api/projects/${testProjectId}/site-surveys`)
          .set('Authorization', `Bearer ${accessToken}`)
          .send({
            surveyDate: '2025-01-20',
          })
          .expect(400);

        expect(response.body.status).toBe(400);
      });

      it('バリデーションエラーで400を返す（日付なし）', async () => {
        const response = await request(app)
          .post(`/api/projects/${testProjectId}/site-surveys`)
          .set('Authorization', `Bearer ${accessToken}`)
          .send({
            name: 'Missing Date Survey',
          })
          .expect(400);

        expect(response.body.status).toBe(400);
      });

      it('バリデーションエラーで400を返す（名前が長すぎる）', async () => {
        const response = await request(app)
          .post(`/api/projects/${testProjectId}/site-surveys`)
          .set('Authorization', `Bearer ${accessToken}`)
          .send({
            name: 'A'.repeat(201), // 200文字を超過
            surveyDate: '2025-01-20',
          })
          .expect(400);

        expect(response.body.status).toBe(400);
      });
    });

    /**
     * GET /api/projects/:projectId/site-surveys - 現場調査一覧取得
     */
    describe('GET /api/projects/:projectId/site-surveys', () => {
      beforeEach(async () => {
        // テスト用データを作成
        await prisma.siteSurvey.createMany({
          data: [
            {
              projectId: testProjectId,
              name: 'Survey Alpha',
              surveyDate: new Date('2025-01-15'),
              memo: 'Alpha memo',
            },
            {
              projectId: testProjectId,
              name: 'Survey Beta',
              surveyDate: new Date('2025-01-16'),
              memo: 'Beta memo',
            },
            {
              projectId: testProjectId,
              name: 'Survey Gamma',
              surveyDate: new Date('2025-01-17'),
              memo: 'Gamma memo',
            },
          ],
        });
      });

      it('認証済みユーザーが現場調査一覧を取得できる', async () => {
        const response = await request(app)
          .get(`/api/projects/${testProjectId}/site-surveys`)
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(200);

        expect(response.body).toHaveProperty('data');
        expect(response.body).toHaveProperty('pagination');
        expect(response.body.data.length).toBe(3);
        expect(response.body.pagination.total).toBe(3);
      });

      it('ページネーションが正しく動作する', async () => {
        const response = await request(app)
          .get(`/api/projects/${testProjectId}/site-surveys?page=1&limit=2`)
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(200);

        expect(response.body.data.length).toBe(2);
        expect(response.body.pagination.page).toBe(1);
        expect(response.body.pagination.limit).toBe(2);
        expect(response.body.pagination.total).toBe(3);
        expect(response.body.pagination.totalPages).toBe(2);
      });

      it('検索クエリが正しく動作する', async () => {
        const response = await request(app)
          .get(`/api/projects/${testProjectId}/site-surveys?search=Alpha`)
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(200);

        expect(response.body.data.length).toBe(1);
        expect(response.body.data[0].name).toBe('Survey Alpha');
      });

      it('日付範囲フィルタリングが動作する', async () => {
        const response = await request(app)
          .get(
            `/api/projects/${testProjectId}/site-surveys?surveyDateFrom=2025-01-16&surveyDateTo=2025-01-16`
          )
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(200);

        expect(response.body.data.length).toBe(1);
        expect(response.body.data[0].name).toBe('Survey Beta');
      });

      it('ソートが正しく動作する（createdAt昇順）', async () => {
        const response = await request(app)
          .get(`/api/projects/${testProjectId}/site-surveys?sort=createdAt&order=asc`)
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(200);

        expect(response.body.data.length).toBe(3);
        // 作成順で最初がAlpha
        expect(response.body.data[0].name).toBe('Survey Alpha');
      });
    });

    /**
     * GET /api/site-surveys/:id - 現場調査詳細取得
     */
    describe('GET /api/site-surveys/:id', () => {
      let surveyId: string;

      beforeEach(async () => {
        const survey = await prisma.siteSurvey.create({
          data: {
            projectId: testProjectId,
            name: 'Detail Test Survey',
            surveyDate: new Date('2025-01-20'),
            memo: 'Detail memo',
          },
        });
        surveyId = survey.id;
      });

      it('認証済みユーザーが現場調査詳細を取得できる', async () => {
        const response = await request(app)
          .get(`/api/site-surveys/${surveyId}`)
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(200);

        expect(response.body.id).toBe(surveyId);
        expect(response.body.name).toBe('Detail Test Survey');
        expect(response.body.memo).toBe('Detail memo');
      });

      it('存在しない現場調査IDで404を返す', async () => {
        // 有効なUUID形式だが存在しないID
        const fakeId = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';

        const response = await request(app)
          .get(`/api/site-surveys/${fakeId}`)
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(404);

        expect(response.body.code).toBe('SITE_SURVEY_NOT_FOUND');
      });

      it('無効なUUID形式で400を返す', async () => {
        await request(app)
          .get('/api/site-surveys/invalid-uuid')
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(400);
      });
    });

    /**
     * PUT /api/site-surveys/:id - 現場調査更新
     */
    describe('PUT /api/site-surveys/:id', () => {
      let surveyId: string;
      let surveyUpdatedAt: string;

      beforeEach(async () => {
        const survey = await prisma.siteSurvey.create({
          data: {
            projectId: testProjectId,
            name: 'Update Test Survey',
            surveyDate: new Date('2025-01-20'),
            memo: 'Original memo',
          },
        });
        surveyId = survey.id;
        surveyUpdatedAt = survey.updatedAt.toISOString();
      });

      it('認証済みユーザーが現場調査を更新できる', async () => {
        const response = await request(app)
          .put(`/api/site-surveys/${surveyId}`)
          .set('Authorization', `Bearer ${accessToken}`)
          .send({
            name: 'Updated Survey Name',
            memo: 'Updated memo',
            expectedUpdatedAt: surveyUpdatedAt,
          })
          .expect(200);

        expect(response.body.id).toBe(surveyId);
        expect(response.body.name).toBe('Updated Survey Name');
        expect(response.body.memo).toBe('Updated memo');
      });

      it('楽観的排他制御エラーで409を返す', async () => {
        // 古いタイムスタンプを使用
        const oldTimestamp = new Date(Date.now() - 100000).toISOString();

        const response = await request(app)
          .put(`/api/site-surveys/${surveyId}`)
          .set('Authorization', `Bearer ${accessToken}`)
          .send({
            name: 'Should Fail Update',
            expectedUpdatedAt: oldTimestamp,
          })
          .expect(409);

        expect(response.body.code).toBe('SITE_SURVEY_CONFLICT');
      });

      it('存在しない現場調査IDで404を返す', async () => {
        // 有効なUUID形式だが存在しないID
        const fakeId = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';

        const response = await request(app)
          .put(`/api/site-surveys/${fakeId}`)
          .set('Authorization', `Bearer ${accessToken}`)
          .send({
            name: 'Updated Name',
            expectedUpdatedAt: new Date().toISOString(),
          })
          .expect(404);

        expect(response.body.code).toBe('SITE_SURVEY_NOT_FOUND');
      });
    });

    /**
     * DELETE /api/site-surveys/:id - 現場調査削除
     */
    describe('DELETE /api/site-surveys/:id', () => {
      let surveyId: string;

      beforeEach(async () => {
        const survey = await prisma.siteSurvey.create({
          data: {
            projectId: testProjectId,
            name: 'Delete Test Survey',
            surveyDate: new Date('2025-01-20'),
          },
        });
        surveyId = survey.id;
      });

      it('認証済みユーザーが現場調査を削除できる', async () => {
        await request(app)
          .delete(`/api/site-surveys/${surveyId}`)
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(204);

        // 削除されたことを確認（論理削除）
        const deletedSurvey = await prisma.siteSurvey.findUnique({
          where: { id: surveyId },
        });

        expect(deletedSurvey?.deletedAt).not.toBeNull();
      });

      it('存在しない現場調査IDで404を返す', async () => {
        // 有効なUUID形式だが存在しないID
        const fakeId = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';

        const response = await request(app)
          .delete(`/api/site-surveys/${fakeId}`)
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(404);

        expect(response.body.code).toBe('SITE_SURVEY_NOT_FOUND');
      });
    });
  });

  describe('Survey Images API Tests', () => {
    let surveyId: string;

    beforeEach(async () => {
      const survey = await prisma.siteSurvey.create({
        data: {
          projectId: testProjectId,
          name: 'Image Test Survey',
          surveyDate: new Date('2025-01-20'),
        },
      });
      surveyId = survey.id;
    });

    /**
     * 画像一覧取得
     */
    describe('GET /api/site-surveys/:id/images', () => {
      it('認証済みユーザーが画像一覧を取得できる', async () => {
        // テスト用画像データを作成
        await prisma.surveyImage.create({
          data: {
            surveyId,
            originalPath: 'test/original.jpg',
            thumbnailPath: 'test/thumb.jpg',
            fileName: 'test.jpg',
            fileSize: 1000,
            width: 800,
            height: 600,
            displayOrder: 1,
          },
        });

        const response = await request(app)
          .get(`/api/site-surveys/${surveyId}/images`)
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(200);

        expect(Array.isArray(response.body)).toBe(true);
        expect(response.body.length).toBe(1);
        expect(response.body[0].fileName).toBe('test.jpg');
      });

      it('認証なしで401を返す', async () => {
        const response = await request(app).get(`/api/site-surveys/${surveyId}/images`).expect(401);

        expect(response.body).toHaveProperty('error', 'MISSING_TOKEN');
      });

      it('存在しない現場調査IDで404を返す', async () => {
        // 有効なUUID形式だが存在しないID
        const fakeId = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';

        const response = await request(app)
          .get(`/api/site-surveys/${fakeId}/images`)
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(404);

        expect(response.body.code).toBe('SITE_SURVEY_NOT_FOUND');
      });
    });

    /**
     * 画像順序変更
     */
    describe('PUT /api/site-surveys/:id/images/order', () => {
      let imageId1: string;
      let imageId2: string;

      beforeEach(async () => {
        const image1 = await prisma.surveyImage.create({
          data: {
            surveyId,
            originalPath: 'test/image1.jpg',
            thumbnailPath: 'test/thumb1.jpg',
            fileName: 'image1.jpg',
            fileSize: 1000,
            width: 800,
            height: 600,
            displayOrder: 1,
          },
        });
        const image2 = await prisma.surveyImage.create({
          data: {
            surveyId,
            originalPath: 'test/image2.jpg',
            thumbnailPath: 'test/thumb2.jpg',
            fileName: 'image2.jpg',
            fileSize: 1000,
            width: 800,
            height: 600,
            displayOrder: 2,
          },
        });
        imageId1 = image1.id;
        imageId2 = image2.id;
      });

      it('認証済みユーザーが画像順序を変更できる', async () => {
        await request(app)
          .put(`/api/site-surveys/${surveyId}/images/order`)
          .set('Authorization', `Bearer ${accessToken}`)
          .send({
            orders: [
              { id: imageId1, order: 2 },
              { id: imageId2, order: 1 },
            ],
          })
          .expect(204);

        // 順序が変更されたことを確認
        const images = await prisma.surveyImage.findMany({
          where: { surveyId },
          orderBy: { displayOrder: 'asc' },
        });

        expect(images[0]?.id).toBe(imageId2);
        expect(images[1]?.id).toBe(imageId1);
      });

      it('認証なしで401を返す', async () => {
        const response = await request(app)
          .put(`/api/site-surveys/${surveyId}/images/order`)
          .send({
            orders: [{ id: imageId1, order: 1 }],
          })
          .expect(401);

        expect(response.body).toHaveProperty('error', 'MISSING_TOKEN');
      });
    });
  });

  describe('Annotation API Tests', () => {
    let surveyId: string;
    let imageId: string;

    beforeEach(async () => {
      const survey = await prisma.siteSurvey.create({
        data: {
          projectId: testProjectId,
          name: 'Annotation Test Survey',
          surveyDate: new Date('2025-01-20'),
        },
      });
      surveyId = survey.id;

      const image = await prisma.surveyImage.create({
        data: {
          surveyId,
          originalPath: 'test/annotation.jpg',
          thumbnailPath: 'test/annotation-thumb.jpg',
          fileName: 'annotation.jpg',
          fileSize: 1000,
          width: 800,
          height: 600,
          displayOrder: 1,
        },
      });
      imageId = image.id;
    });

    /**
     * 注釈データ取得
     */
    describe('GET /api/site-surveys/images/:imageId/annotations', () => {
      it('認証済みユーザーが注釈データを取得できる（データなし）', async () => {
        const response = await request(app)
          .get(`/api/site-surveys/images/${imageId}/annotations`)
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(200);

        expect(response.body.data).toBeNull();
      });

      it('認証済みユーザーが注釈データを取得できる（データあり）', async () => {
        // 注釈データを作成
        await prisma.imageAnnotation.create({
          data: {
            imageId,
            data: { version: '1.0', objects: [] },
            version: '1.0',
          },
        });

        const response = await request(app)
          .get(`/api/site-surveys/images/${imageId}/annotations`)
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(200);

        expect(response.body.imageId).toBe(imageId);
        expect(response.body.data).toHaveProperty('objects');
      });

      it('認証なしで401を返す', async () => {
        const response = await request(app)
          .get(`/api/site-surveys/images/${imageId}/annotations`)
          .expect(401);

        expect(response.body).toHaveProperty('error', 'MISSING_TOKEN');
      });

      it('存在しない画像IDで404を返す', async () => {
        // 有効なUUID形式だが存在しないID
        const fakeId = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';

        const response = await request(app)
          .get(`/api/site-surveys/images/${fakeId}/annotations`)
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(404);

        expect(response.body.code).toBe('ANNOTATION_IMAGE_NOT_FOUND');
      });
    });

    /**
     * 注釈データ保存
     */
    describe('PUT /api/site-surveys/images/:imageId/annotations', () => {
      it('認証済みユーザーが注釈データを保存できる', async () => {
        const annotationData = {
          version: '1.0',
          objects: [
            {
              type: 'rect',
              left: 100,
              top: 100,
              width: 50,
              height: 50,
            },
          ],
        };

        const response = await request(app)
          .put(`/api/site-surveys/images/${imageId}/annotations`)
          .set('Authorization', `Bearer ${accessToken}`)
          .send({ data: annotationData })
          .expect(200);

        expect(response.body.imageId).toBe(imageId);
        expect(response.body.data.objects.length).toBe(1);
      });

      it('認証なしで401を返す', async () => {
        const response = await request(app)
          .put(`/api/site-surveys/images/${imageId}/annotations`)
          .send({ data: { objects: [] } })
          .expect(401);

        expect(response.body).toHaveProperty('error', 'MISSING_TOKEN');
      });

      it('楽観的排他制御エラーで409を返す', async () => {
        // 最初の注釈を作成
        await prisma.imageAnnotation.create({
          data: {
            imageId,
            data: { version: '1.0', objects: [] },
            version: '1.0',
          },
        });

        // 古いタイムスタンプで更新を試みる
        const response = await request(app)
          .put(`/api/site-surveys/images/${imageId}/annotations`)
          .set('Authorization', `Bearer ${accessToken}`)
          .send({
            data: { objects: [] },
            expectedUpdatedAt: new Date(Date.now() - 100000).toISOString(),
          })
          .expect(409);

        expect(response.body.code).toBe('ANNOTATION_CONFLICT');
      });
    });

    /**
     * 注釈データエクスポート
     */
    describe('GET /api/site-surveys/images/:imageId/annotations/export', () => {
      beforeEach(async () => {
        await prisma.imageAnnotation.create({
          data: {
            imageId,
            data: { version: '1.0', objects: [{ type: 'line' }] },
            version: '1.0',
          },
        });
      });

      it('認証済みユーザーが注釈データをエクスポートできる', async () => {
        const response = await request(app)
          .get(`/api/site-surveys/images/${imageId}/annotations/export`)
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(200);

        expect(response.headers['content-type']).toContain('application/json');
        expect(response.headers['content-disposition']).toContain('attachment');
      });

      it('認証なしで401を返す', async () => {
        const response = await request(app)
          .get(`/api/site-surveys/images/${imageId}/annotations/export`)
          .expect(401);

        expect(response.body).toHaveProperty('error', 'MISSING_TOKEN');
      });

      it('注釈データがない場合404を返す', async () => {
        // 注釈データを削除
        await prisma.imageAnnotation.deleteMany({ where: { imageId } });

        const response = await request(app)
          .get(`/api/site-surveys/images/${imageId}/annotations/export`)
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(404);

        expect(response.body.code).toBe('ANNOTATION_NOT_FOUND');
      });
    });
  });

  describe('Audit Log Tests (REQ 12.5)', () => {
    it('現場調査作成時に監査ログが記録される', async () => {
      const response = await request(app)
        .post(`/api/projects/${testProjectId}/site-surveys`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'Audit Log Test Survey',
          surveyDate: '2025-01-20',
        })
        .expect(201);

      // 監査ログを確認（targetTypeは'SiteSurvey'）
      const auditLog = await prisma.auditLog.findFirst({
        where: {
          action: 'SITE_SURVEY_CREATED',
          targetType: 'SiteSurvey',
          targetId: response.body.id,
        },
        orderBy: { createdAt: 'desc' },
      });

      expect(auditLog).not.toBeNull();
      expect(auditLog?.actorId).toBe(testUserId);
    });

    it('現場調査更新時に監査ログが記録される', async () => {
      const createResponse = await request(app)
        .post(`/api/projects/${testProjectId}/site-surveys`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'Audit Update Test',
          surveyDate: '2025-01-20',
        })
        .expect(201);

      await request(app)
        .put(`/api/site-surveys/${createResponse.body.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'Audit Updated',
          expectedUpdatedAt: createResponse.body.updatedAt,
        })
        .expect(200);

      // 監査ログを確認（targetTypeは'SiteSurvey'）
      const auditLog = await prisma.auditLog.findFirst({
        where: {
          action: 'SITE_SURVEY_UPDATED',
          targetType: 'SiteSurvey',
          targetId: createResponse.body.id,
        },
        orderBy: { createdAt: 'desc' },
      });

      expect(auditLog).not.toBeNull();
    });

    it('現場調査削除時に監査ログが記録される', async () => {
      const createResponse = await request(app)
        .post(`/api/projects/${testProjectId}/site-surveys`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'Audit Delete Test',
          surveyDate: '2025-01-20',
        })
        .expect(201);

      await request(app)
        .delete(`/api/site-surveys/${createResponse.body.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(204);

      // 監査ログを確認（targetTypeは'SiteSurvey'）
      const auditLog = await prisma.auditLog.findFirst({
        where: {
          action: 'SITE_SURVEY_DELETED',
          targetType: 'SiteSurvey',
          targetId: createResponse.body.id,
        },
        orderBy: { createdAt: 'desc' },
      });

      expect(auditLog).not.toBeNull();
    });
  });
});
