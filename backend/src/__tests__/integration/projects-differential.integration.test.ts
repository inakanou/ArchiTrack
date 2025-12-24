/**
 * @fileoverview プロジェクト差分実装の統合テスト
 *
 * 2025-12-13要件更新に対応した差分実装の統合テストを実装します。
 *
 * Task: 26.1 差分実装の統合テスト
 *
 * Requirements:
 * - 1.15, 1.16: プロジェクト名の一意性チェック（作成時）
 * - 2.2: 一覧表示の列構成変更（ID列削除、営業担当者・工事担当者列追加）
 * - 4.1a, 4.1b: 検索対象の拡張（営業担当者・工事担当者）
 * - 6.5: ソートフィールドの拡張（営業担当者・工事担当者）
 * - 8.7, 8.8: プロジェクト名の一意性チェック（更新時）
 * - 16.3, 22.5: フリガナ検索のひらがな・カタカナ両対応
 *
 * テストカバレッジ:
 * - バックエンドAPIの一貫性確認（検索、ソート、一意性チェック）
 * - フロントエンドUIの整合性確認（API経由でデータ取得）
 * - 既存機能への影響がないことの確認
 * - エラーハンドリングの動作確認
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
 * プロジェクト差分実装の統合テスト
 */
describe('Project Differential Implementation Integration Tests (Task 26.1)', () => {
  let prisma: PrismaClient;
  let accessToken: string;
  let testUserId: string;
  let salesPerson1Id: string;
  let salesPerson2Id: string;
  let constructionPerson1Id: string;
  let constructionPerson2Id: string;

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
        email: 'test-differential-integration@example.com',
        displayName: 'Differential Test User',
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
      await prisma.rolePermission.createMany({
        data: projectPermissions.map((permission) => ({
          roleId: userRole.id,
          permissionId: permission.id,
        })),
        skipDuplicates: true,
      });
    }

    // ログイン
    const response = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: 'test-differential-integration@example.com',
        password: 'TestPassword123!',
      })
      .expect(200);

    return {
      token: response.body.accessToken,
      userId: user.id,
    };
  };

  /**
   * 担当者候補ユーザーを作成（テスト用に複数）
   */
  const createAssignableUsers = async (): Promise<{
    salesPerson1Id: string;
    salesPerson2Id: string;
    constructionPerson1Id: string;
    constructionPerson2Id: string;
  }> => {
    const passwordHash = await (
      await import('@node-rs/argon2')
    ).hash('DummyPass123!', {
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4,
    });

    // userロールを取得
    const userRole = await prisma.role.findUnique({
      where: { name: 'user' },
    });

    // 営業担当者1
    const salesPerson1 = await prisma.user.create({
      data: {
        email: 'test-diff-sales1@example.com',
        displayName: '山田太郎', // 検索テスト用
        passwordHash,
      },
    });

    if (userRole) {
      await prisma.userRole.create({
        data: { userId: salesPerson1.id, roleId: userRole.id },
      });
    }

    // 営業担当者2
    const salesPerson2 = await prisma.user.create({
      data: {
        email: 'test-diff-sales2@example.com',
        displayName: '佐藤花子', // 検索テスト用
        passwordHash,
      },
    });

    if (userRole) {
      await prisma.userRole.create({
        data: { userId: salesPerson2.id, roleId: userRole.id },
      });
    }

    // 工事担当者1
    const constructionPerson1 = await prisma.user.create({
      data: {
        email: 'test-diff-constr1@example.com',
        displayName: '鈴木一郎', // 検索テスト用
        passwordHash,
      },
    });

    if (userRole) {
      await prisma.userRole.create({
        data: { userId: constructionPerson1.id, roleId: userRole.id },
      });
    }

    // 工事担当者2
    const constructionPerson2 = await prisma.user.create({
      data: {
        email: 'test-diff-constr2@example.com',
        displayName: '田中次郎', // 検索テスト用
        passwordHash,
      },
    });

    if (userRole) {
      await prisma.userRole.create({
        data: { userId: constructionPerson2.id, roleId: userRole.id },
      });
    }

    return {
      salesPerson1Id: salesPerson1.id,
      salesPerson2Id: salesPerson2.id,
      constructionPerson1Id: constructionPerson1.id,
      constructionPerson2Id: constructionPerson2.id,
    };
  };

  /**
   * テストデータをクリーンアップ
   */
  const cleanupTestData = async () => {
    // 1. プロジェクトステータス履歴を削除
    await prisma.projectStatusHistory.deleteMany({
      where: {
        project: {
          name: {
            startsWith: 'test-diff-',
          },
        },
      },
    });

    // 2. プロジェクトを削除
    await prisma.project.deleteMany({
      where: {
        name: {
          startsWith: 'test-diff-',
        },
      },
    });

    // 3. 監査ログを削除
    const userIds = [
      testUserId,
      salesPerson1Id,
      salesPerson2Id,
      constructionPerson1Id,
      constructionPerson2Id,
    ].filter(Boolean);

    if (userIds.length > 0) {
      await prisma.auditLog.deleteMany({
        where: {
          actorId: { in: userIds },
        },
      });
    }

    // 4. ユーザーロールを削除
    await prisma.userRole.deleteMany({
      where: {
        user: {
          email: {
            in: [
              'test-differential-integration@example.com',
              'test-diff-sales1@example.com',
              'test-diff-sales2@example.com',
              'test-diff-constr1@example.com',
              'test-diff-constr2@example.com',
            ],
          },
        },
      },
    });

    // 5. ユーザーを削除
    await prisma.user.deleteMany({
      where: {
        email: {
          in: [
            'test-differential-integration@example.com',
            'test-diff-sales1@example.com',
            'test-diff-sales2@example.com',
            'test-diff-constr1@example.com',
            'test-diff-constr2@example.com',
          ],
        },
      },
    });
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
    await cleanupTestData();

    // Redis クリーンアップ
    const client = redis.getClient();
    if (client) {
      const keys = await client.keys('test-diff-*');
      if (keys.length > 0) {
        await client.del(...keys);
      }
    }

    // 接続を切断
    await prisma.$disconnect();
    await redis.disconnect();
  });

  beforeEach(async () => {
    await cleanupTestData();

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
    salesPerson1Id = assignableUsers.salesPerson1Id;
    salesPerson2Id = assignableUsers.salesPerson2Id;
    constructionPerson1Id = assignableUsers.constructionPerson1Id;
    constructionPerson2Id = assignableUsers.constructionPerson2Id;
  });

  /**
   * プロジェクト名一意性チェックの統合テスト
   * Requirements: 1.15, 1.16, 8.7, 8.8
   */
  describe('Project Name Uniqueness Check (Requirements: 1.15, 1.16, 8.7, 8.8)', () => {
    it('プロジェクト作成時に重複するプロジェクト名で409エラーを返すこと', async () => {
      // 1. 最初のプロジェクトを作成
      await request(app)
        .post('/api/projects')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'test-diff-duplicate-name',
          salesPersonId: salesPerson1Id,
        })
        .expect(201);

      // 2. 同じ名前で2つ目のプロジェクトを作成しようとする
      const duplicateResponse = await request(app)
        .post('/api/projects')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'test-diff-duplicate-name',
          salesPersonId: salesPerson2Id,
        })
        .expect(409);

      // エラーレスポンスの検証
      expect(duplicateResponse.body.code).toBe('PROJECT_NAME_DUPLICATE');
      expect(duplicateResponse.body.status).toBe(409);
      expect(duplicateResponse.body.detail).toBe('このプロジェクト名は既に使用されています');
    });

    it('プロジェクト更新時に他のプロジェクトと重複する名前で409エラーを返すこと', async () => {
      // 1. 2つのプロジェクトを作成
      const project1Response = await request(app)
        .post('/api/projects')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'test-diff-project-1',
          salesPersonId: salesPerson1Id,
        })
        .expect(201);

      await request(app)
        .post('/api/projects')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'test-diff-project-2',
          salesPersonId: salesPerson1Id,
        })
        .expect(201);

      // 2. project1の名前をproject2と同じ名前に変更しようとする
      const updateResponse = await request(app)
        .put(`/api/projects/${project1Response.body.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'test-diff-project-2',
          expectedUpdatedAt: project1Response.body.updatedAt,
        })
        .expect(409);

      expect(updateResponse.body.code).toBe('PROJECT_NAME_DUPLICATE');
    });

    it('プロジェクト更新時に自身と同じ名前は許可されること', async () => {
      // プロジェクトを作成
      const createResponse = await request(app)
        .post('/api/projects')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'test-diff-same-name',
          salesPersonId: salesPerson1Id,
          description: '説明1',
        })
        .expect(201);

      // 同じ名前で他のフィールドのみ変更
      const updateResponse = await request(app)
        .put(`/api/projects/${createResponse.body.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'test-diff-same-name', // 同じ名前
          description: '説明2', // 説明のみ変更
          expectedUpdatedAt: createResponse.body.updatedAt,
        })
        .expect(200);

      expect(updateResponse.body.name).toBe('test-diff-same-name');
      expect(updateResponse.body.description).toBe('説明2');
    });

    it('論理削除されたプロジェクト名は重複チェックの対象外であること', async () => {
      // 1. プロジェクトを作成
      const createResponse = await request(app)
        .post('/api/projects')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'test-diff-deleted-project',
          salesPersonId: salesPerson1Id,
        })
        .expect(201);

      // 2. プロジェクトを削除
      await request(app)
        .delete(`/api/projects/${createResponse.body.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(204);

      // 3. 同じ名前で新しいプロジェクトを作成できること
      const newProjectResponse = await request(app)
        .post('/api/projects')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'test-diff-deleted-project',
          salesPersonId: salesPerson2Id,
        })
        .expect(201);

      expect(newProjectResponse.body.name).toBe('test-diff-deleted-project');
    });
  });

  /**
   * 検索対象拡張の統合テスト
   * Requirements: 4.1a, 4.1b
   */
  describe('Extended Search Scope (Requirements: 4.1a, 4.1b)', () => {
    beforeEach(async () => {
      // テスト用プロジェクトを作成
      // 営業担当者: 山田太郎、工事担当者: 鈴木一郎
      await request(app)
        .post('/api/projects')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'test-diff-search-project-1',
          salesPersonId: salesPerson1Id, // 山田太郎
          constructionPersonId: constructionPerson1Id, // 鈴木一郎
        })
        .expect(201);

      // 営業担当者: 佐藤花子、工事担当者: 田中次郎
      await request(app)
        .post('/api/projects')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'test-diff-search-project-2',
          salesPersonId: salesPerson2Id, // 佐藤花子
          constructionPersonId: constructionPerson2Id, // 田中次郎
        })
        .expect(201);
    });

    it('営業担当者名で検索できること', async () => {
      // 「山田」で検索（山田太郎が営業担当者）
      const searchResponse = await request(app)
        .get('/api/projects?search=山田')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(searchResponse.body.data.length).toBeGreaterThanOrEqual(1);
      expect(
        searchResponse.body.data.some(
          (p: { name: string }) => p.name === 'test-diff-search-project-1'
        )
      ).toBe(true);
    });

    it('工事担当者名で検索できること', async () => {
      // 「鈴木」で検索（鈴木一郎が工事担当者）
      const searchResponse = await request(app)
        .get('/api/projects?search=鈴木')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(searchResponse.body.data.length).toBeGreaterThanOrEqual(1);
      expect(
        searchResponse.body.data.some(
          (p: { name: string }) => p.name === 'test-diff-search-project-1'
        )
      ).toBe(true);
    });

    it('複数フィールドにまたがる検索ができること（プロジェクト名・営業担当者・工事担当者）', async () => {
      // 「佐藤」で検索（佐藤花子が営業担当者のproject-2がヒット）
      const searchResponse = await request(app)
        .get('/api/projects?search=佐藤')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(searchResponse.body.data.length).toBeGreaterThanOrEqual(1);
      expect(
        searchResponse.body.data.some(
          (p: { name: string }) => p.name === 'test-diff-search-project-2'
        )
      ).toBe(true);
    });
  });

  /**
   * ソートフィールド拡張の統合テスト
   * Requirements: 6.5
   */
  describe('Extended Sort Fields (Requirements: 6.5)', () => {
    beforeEach(async () => {
      // テスト用プロジェクトを作成（担当者名でソート順が異なるように設定）
      await request(app)
        .post('/api/projects')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'test-diff-sort-project-A',
          salesPersonId: salesPerson2Id, // 佐藤花子
          constructionPersonId: constructionPerson1Id, // 鈴木一郎
        })
        .expect(201);

      await request(app)
        .post('/api/projects')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'test-diff-sort-project-B',
          salesPersonId: salesPerson1Id, // 山田太郎
          constructionPersonId: constructionPerson2Id, // 田中次郎
        })
        .expect(201);
    });

    it('営業担当者名で昇順ソートできること', async () => {
      const response = await request(app)
        .get('/api/projects?sort=salesPersonName&order=asc&search=test-diff-sort')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const projects = response.body.data;
      expect(projects.length).toBe(2);

      // 「佐藤花子」< 「山田太郎」（50音順）
      expect(projects[0].salesPerson.displayName).toBe('佐藤花子');
      expect(projects[1].salesPerson.displayName).toBe('山田太郎');
    });

    it('営業担当者名で降順ソートできること', async () => {
      const response = await request(app)
        .get('/api/projects?sort=salesPersonName&order=desc&search=test-diff-sort')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const projects = response.body.data;
      expect(projects.length).toBe(2);

      // 降順: 「山田太郎」> 「佐藤花子」
      expect(projects[0].salesPerson.displayName).toBe('山田太郎');
      expect(projects[1].salesPerson.displayName).toBe('佐藤花子');
    });

    it('工事担当者名で昇順ソートできること', async () => {
      const response = await request(app)
        .get('/api/projects?sort=constructionPersonName&order=asc&search=test-diff-sort')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const projects = response.body.data;
      expect(projects.length).toBe(2);

      // Unicode順で昇順: 「田中次郎」< 「鈴木一郎」（'田' U+7530 < '鈴' U+9234）
      expect(projects[0].constructionPerson.displayName).toBe('田中次郎');
      expect(projects[1].constructionPerson.displayName).toBe('鈴木一郎');
    });

    it('工事担当者名で降順ソートできること', async () => {
      const response = await request(app)
        .get('/api/projects?sort=constructionPersonName&order=desc&search=test-diff-sort')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const projects = response.body.data;
      expect(projects.length).toBe(2);

      // Unicode順で降順: 「鈴木一郎」> 「田中次郎」
      expect(projects[0].constructionPerson.displayName).toBe('鈴木一郎');
      expect(projects[1].constructionPerson.displayName).toBe('田中次郎');
    });
  });

  /**
   * APIレスポンス構造の検証（一覧表示での営業担当者・工事担当者情報）
   * Requirements: 2.2
   */
  describe('API Response Structure (Requirements: 2.2)', () => {
    it('一覧取得APIで営業担当者・工事担当者情報が含まれること', async () => {
      // プロジェクト作成
      await request(app)
        .post('/api/projects')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'test-diff-response-structure',
          salesPersonId: salesPerson1Id,
          constructionPersonId: constructionPerson1Id,
        })
        .expect(201);

      // 一覧取得
      const listResponse = await request(app)
        .get('/api/projects?search=test-diff-response-structure')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(listResponse.body.data.length).toBe(1);
      const project = listResponse.body.data[0];

      // 営業担当者情報の検証
      expect(project.salesPerson).toBeDefined();
      expect(project.salesPerson.id).toBe(salesPerson1Id);
      expect(project.salesPerson.displayName).toBe('山田太郎');

      // 工事担当者情報の検証
      expect(project.constructionPerson).toBeDefined();
      expect(project.constructionPerson.id).toBe(constructionPerson1Id);
      expect(project.constructionPerson.displayName).toBe('鈴木一郎');
    });

    it('工事担当者が未設定の場合はnullまたはundefinedが返ること', async () => {
      // 工事担当者なしでプロジェクト作成
      await request(app)
        .post('/api/projects')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'test-diff-no-construction',
          salesPersonId: salesPerson1Id,
          // constructionPersonIdは未設定
        })
        .expect(201);

      // 一覧取得
      const listResponse = await request(app)
        .get('/api/projects?search=test-diff-no-construction')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(listResponse.body.data.length).toBe(1);
      const project = listResponse.body.data[0];

      // 工事担当者が未設定であることを検証（nullまたはundefined）
      expect(project.constructionPerson == null).toBe(true);
    });
  });

  /**
   * エラーハンドリングの検証
   */
  describe('Error Handling Validation', () => {
    it('409エラー（重複）のレスポンス形式がRFC 7807に準拠すること', async () => {
      // 最初のプロジェクトを作成
      await request(app)
        .post('/api/projects')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'test-diff-rfc7807-check',
          salesPersonId: salesPerson1Id,
        })
        .expect(201);

      // 重複エラーを発生させる
      const errorResponse = await request(app)
        .post('/api/projects')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'test-diff-rfc7807-check',
          salesPersonId: salesPerson2Id,
        })
        .expect(409);

      // RFC 7807形式の検証
      expect(errorResponse.body).toHaveProperty('type');
      expect(errorResponse.body).toHaveProperty('title');
      expect(errorResponse.body).toHaveProperty('status', 409);
      expect(errorResponse.body).toHaveProperty('detail');
      expect(errorResponse.body).toHaveProperty('code', 'PROJECT_NAME_DUPLICATE');
    });

    it('無効なソートフィールドで400エラーを返すこと', async () => {
      const response = await request(app)
        .get('/api/projects?sort=invalidField&order=asc')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(400);

      expect(response.body.status).toBe(400);
    });
  });

  /**
   * 既存機能への影響確認（リグレッションテスト）
   */
  describe('Regression Tests - Existing Functionality', () => {
    it('プロジェクト名での検索が引き続き動作すること', async () => {
      await request(app)
        .post('/api/projects')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'test-diff-regression-search',
          salesPersonId: salesPerson1Id,
        })
        .expect(201);

      const searchResponse = await request(app)
        .get('/api/projects?search=regression-search')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(searchResponse.body.data.length).toBe(1);
      expect(searchResponse.body.data[0].name).toBe('test-diff-regression-search');
    });

    it('ステータスフィルターが引き続き動作すること', async () => {
      await request(app)
        .post('/api/projects')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'test-diff-regression-status',
          salesPersonId: salesPerson1Id,
        })
        .expect(201);

      const filterResponse = await request(app)
        .get('/api/projects?status=PREPARING&search=test-diff-regression')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(filterResponse.body.data.length).toBe(1);
      expect(filterResponse.body.data[0].status).toBe('PREPARING');
    });

    it('作成日時でのソートが引き続き動作すること', async () => {
      // 2つのプロジェクトを作成
      await request(app)
        .post('/api/projects')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'test-diff-regression-sort-1',
          salesPersonId: salesPerson1Id,
        })
        .expect(201);

      // 少し待ってから2つ目を作成（タイムスタンプが異なるように）
      await new Promise((resolve) => setTimeout(resolve, 100));

      await request(app)
        .post('/api/projects')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'test-diff-regression-sort-2',
          salesPersonId: salesPerson1Id,
        })
        .expect(201);

      // 作成日時の昇順ソート
      const ascResponse = await request(app)
        .get('/api/projects?sort=createdAt&order=asc&search=test-diff-regression-sort')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(ascResponse.body.data.length).toBe(2);
      expect(ascResponse.body.data[0].name).toBe('test-diff-regression-sort-1');
      expect(ascResponse.body.data[1].name).toBe('test-diff-regression-sort-2');

      // 作成日時の降順ソート
      const descResponse = await request(app)
        .get('/api/projects?sort=createdAt&order=desc&search=test-diff-regression-sort')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(descResponse.body.data.length).toBe(2);
      expect(descResponse.body.data[0].name).toBe('test-diff-regression-sort-2');
      expect(descResponse.body.data[1].name).toBe('test-diff-regression-sort-1');
    });

    it('ページネーションが引き続き動作すること', async () => {
      // 3つのプロジェクトを作成
      for (let i = 1; i <= 3; i++) {
        await request(app)
          .post('/api/projects')
          .set('Authorization', `Bearer ${accessToken}`)
          .send({
            name: `test-diff-regression-page-${i}`,
            salesPersonId: salesPerson1Id,
          })
          .expect(201);
      }

      // 1ページ目（2件）
      const page1Response = await request(app)
        .get('/api/projects?page=1&limit=2&search=test-diff-regression-page')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(page1Response.body.data.length).toBe(2);
      expect(page1Response.body.pagination.page).toBe(1);
      expect(page1Response.body.pagination.limit).toBe(2);
      expect(page1Response.body.pagination.total).toBe(3);
      expect(page1Response.body.pagination.totalPages).toBe(2);

      // 2ページ目（1件）
      const page2Response = await request(app)
        .get('/api/projects?page=2&limit=2&search=test-diff-regression-page')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(page2Response.body.data.length).toBe(1);
      expect(page2Response.body.pagination.page).toBe(2);
    });

    it('楽観的排他制御が引き続き動作すること', async () => {
      // プロジェクト作成
      const createResponse = await request(app)
        .post('/api/projects')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'test-diff-regression-optimistic',
          salesPersonId: salesPerson1Id,
        })
        .expect(201);

      const projectId = createResponse.body.id;
      const originalUpdatedAt = createResponse.body.updatedAt;

      // 1回目の更新（成功）
      await request(app)
        .put(`/api/projects/${projectId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'test-diff-regression-optimistic-updated',
          expectedUpdatedAt: originalUpdatedAt,
        })
        .expect(200);

      // 2回目の更新（古いタイムスタンプで競合エラー）
      const conflictResponse = await request(app)
        .put(`/api/projects/${projectId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'test-diff-regression-optimistic-conflict',
          expectedUpdatedAt: originalUpdatedAt, // 古いタイムスタンプ
        })
        .expect(409);

      expect(conflictResponse.body.code).toBe('PROJECT_CONFLICT');
    });
  });

  /**
   * パフォーマンス検証
   */
  describe('Performance Verification', () => {
    it('検索・ソート操作のAPI応答時間が500ミリ秒以内であること', async () => {
      // テストデータを作成
      await request(app)
        .post('/api/projects')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'test-diff-perf-project',
          salesPersonId: salesPerson1Id,
          constructionPersonId: constructionPerson1Id,
        })
        .expect(201);

      // 検索操作の時間計測
      const searchStart = Date.now();
      await request(app)
        .get('/api/projects?search=山田')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      const searchTime = Date.now() - searchStart;
      expect(searchTime).toBeLessThan(500);

      // ソート操作の時間計測
      const sortStart = Date.now();
      await request(app)
        .get('/api/projects?sort=salesPersonName&order=asc')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      const sortTime = Date.now() - sortStart;
      expect(sortTime).toBeLessThan(500);

      // プロジェクト名一意性チェック込みの作成時間計測
      const createStart = Date.now();
      await request(app)
        .post('/api/projects')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'test-diff-perf-create',
          salesPersonId: salesPerson1Id,
        })
        .expect(201);
      const createTime = Date.now() - createStart;
      expect(createTime).toBeLessThan(500);
    });
  });
});
