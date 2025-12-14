/**
 * @fileoverview 取引先API統合テスト
 *
 * TDD Task 14.1: APIエンドポイントの統合テスト
 * - 認証・認可ミドルウェアの動作確認
 * - 各エンドポイントのレスポンス検証
 * - エラーレスポンスの検証（401, 403, 404, 409）
 *
 * Requirements (trading-partner-management):
 * - REQ-7.1: 認証済みユーザーのみに取引先一覧・詳細の閲覧を許可
 * - REQ-7.2: 取引先の作成・編集・削除操作に対して適切な権限チェックを実行
 * - REQ-7.3: 権限のないユーザーが操作を試みた場合、403 Forbiddenエラーを返却
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
 * 取引先API統合テスト
 */
describe('Trading Partner API Integration Tests', () => {
  let prisma: PrismaClient;
  let accessToken: string;
  let testUserId: string;
  let noPermissionAccessToken: string;
  let noPermissionUserId: string;

  /**
   * テスト用認証情報でログインしてアクセストークンを取得（全権限あり - adminロール）
   */
  const loginTestUserWithPermissions = async (): Promise<{ token: string; userId: string }> => {
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
        email: 'test-trading-partner-integration@example.com',
        displayName: 'Trading Partner Test User',
        passwordHash,
      },
    });

    // adminロールを取得して割り当て（全権限を持つ）
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

    // ログイン
    const response = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: 'test-trading-partner-integration@example.com',
        password: 'TestPassword123!',
      })
      .expect(200);

    return {
      token: response.body.accessToken,
      userId: user.id,
    };
  };

  /**
   * テスト用認証情報でログインしてアクセストークンを取得（権限なし）
   */
  const loginTestUserWithoutPermissions = async (): Promise<{ token: string; userId: string }> => {
    const passwordHash = await (
      await import('@node-rs/argon2')
    ).hash('TestPassword123!', {
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4,
    });

    // テストユーザーを作成（権限なし）
    const user = await prisma.user.create({
      data: {
        email: 'test-trading-partner-no-perm@example.com',
        displayName: 'No Permission User',
        passwordHash,
      },
    });

    // userロールを取得して割り当て（権限は付与しない）
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

    // ログイン
    const response = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: 'test-trading-partner-no-perm@example.com',
        password: 'TestPassword123!',
      })
      .expect(200);

    return {
      token: response.body.accessToken,
      userId: user.id,
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
    // 1. 取引先種別マッピングを削除
    await prisma.tradingPartnerTypeMapping.deleteMany({
      where: {
        tradingPartner: {
          name: {
            startsWith: 'test-api-integration-',
          },
        },
      },
    });

    // 2. 取引先を削除
    await prisma.tradingPartner.deleteMany({
      where: {
        name: {
          startsWith: 'test-api-integration-',
        },
      },
    });

    // 3. 監査ログを削除
    await prisma.auditLog.deleteMany({
      where: {
        actorId: {
          in: [testUserId, noPermissionUserId].filter(Boolean),
        },
      },
    });

    // 4. ユーザーロールを削除
    await prisma.userRole.deleteMany({
      where: {
        user: {
          email: {
            in: [
              'test-trading-partner-integration@example.com',
              'test-trading-partner-no-perm@example.com',
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
            'test-trading-partner-integration@example.com',
            'test-trading-partner-no-perm@example.com',
          ],
        },
      },
    });

    // Redis クリーンアップ
    const client = redis.getClient();
    if (client) {
      const keys = await client.keys('test-api-integration:*');
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
    await prisma.tradingPartnerTypeMapping.deleteMany({
      where: {
        tradingPartner: {
          name: {
            startsWith: 'test-api-integration-',
          },
        },
      },
    });

    await prisma.tradingPartner.deleteMany({
      where: {
        name: {
          startsWith: 'test-api-integration-',
        },
      },
    });

    await prisma.auditLog.deleteMany({
      where: {
        OR: [
          { action: 'TRADING_PARTNER_CREATED' },
          { action: 'TRADING_PARTNER_UPDATED' },
          { action: 'TRADING_PARTNER_DELETED' },
        ],
        actorId: {
          in: [testUserId, noPermissionUserId].filter(Boolean),
        },
      },
    });

    await prisma.userRole.deleteMany({
      where: {
        user: {
          email: {
            in: [
              'test-trading-partner-integration@example.com',
              'test-trading-partner-no-perm@example.com',
            ],
          },
        },
      },
    });

    await prisma.user.deleteMany({
      where: {
        email: {
          in: [
            'test-trading-partner-integration@example.com',
            'test-trading-partner-no-perm@example.com',
          ],
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

    // テストユーザーの作成とログイン（権限あり）
    const loginResult = await loginTestUserWithPermissions();
    accessToken = loginResult.token;
    testUserId = loginResult.userId;

    // テストユーザーの作成とログイン（権限なし）
    const noPermResult = await loginTestUserWithoutPermissions();
    noPermissionAccessToken = noPermResult.token;
    noPermissionUserId = noPermResult.userId;
  });

  describe('Authentication Tests (REQ-7.1)', () => {
    /**
     * 未認証ユーザーによるアクセス拒否
     */
    it('未認証ユーザーは取引先一覧にアクセスできないこと', async () => {
      const response = await request(app).get('/api/trading-partners').expect(401);

      expect(response.body).toHaveProperty('error', 'MISSING_TOKEN');
    });

    it('未認証ユーザーは取引先詳細にアクセスできないこと', async () => {
      const response = await request(app)
        .get('/api/trading-partners/00000000-0000-0000-0000-000000000001')
        .expect(401);

      expect(response.body).toHaveProperty('error', 'MISSING_TOKEN');
    });

    it('未認証ユーザーは取引先検索にアクセスできないこと', async () => {
      const response = await request(app).get('/api/trading-partners/search?q=test').expect(401);

      expect(response.body).toHaveProperty('error', 'MISSING_TOKEN');
    });

    it('未認証ユーザーは取引先を作成できないこと', async () => {
      const response = await request(app)
        .post('/api/trading-partners')
        .send({
          name: 'test-api-integration-unauth',
          nameKana: 'テストエーピーアイ',
          address: '東京都渋谷区1-1-1',
          types: ['CUSTOMER'],
        })
        .expect(401);

      expect(response.body).toHaveProperty('error', 'MISSING_TOKEN');
    });

    it('未認証ユーザーは取引先を更新できないこと', async () => {
      const response = await request(app)
        .put('/api/trading-partners/00000000-0000-0000-0000-000000000001')
        .send({
          name: 'test-api-integration-updated',
          expectedUpdatedAt: new Date().toISOString(),
        })
        .expect(401);

      expect(response.body).toHaveProperty('error', 'MISSING_TOKEN');
    });

    it('未認証ユーザーは取引先を削除できないこと', async () => {
      const response = await request(app)
        .delete('/api/trading-partners/00000000-0000-0000-0000-000000000001')
        .expect(401);

      expect(response.body).toHaveProperty('error', 'MISSING_TOKEN');
    });

    it('無効なトークンでアクセスできないこと', async () => {
      const response = await request(app)
        .get('/api/trading-partners')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('Authorization Tests (REQ-7.2, REQ-7.3)', () => {
    /**
     * 権限のないユーザーによる操作拒否
     *
     * Note: userロールには trading-partner:create, trading-partner:read, trading-partner:update が付与済み
     * trading-partner:delete のみ付与されていないため、削除操作のみ403になる
     */

    /**
     * 削除権限チェック (trading-partner:delete)
     * userロールには削除権限が付与されていないため、403が返される
     */
    it('削除権限のないユーザーは取引先を削除できないこと (403)', async () => {
      // まず取引先を作成（認可ありユーザーで）
      const createResponse = await request(app)
        .post('/api/trading-partners')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'test-api-integration-delete-auth',
          nameKana: 'テストデリートオース',
          address: '東京都渋谷区1-1-1',
          types: ['CUSTOMER'],
        })
        .expect(201);

      const partnerId = createResponse.body.id;

      // userロール（削除権限なし）で削除を試みる
      const response = await request(app)
        .delete(`/api/trading-partners/${partnerId}`)
        .set('Authorization', `Bearer ${noPermissionAccessToken}`)
        .expect(403);

      expect(response.body).toHaveProperty('error', 'FORBIDDEN');
      expect(response.body).toHaveProperty('required', 'trading-partner:delete');
    });

    /**
     * 読み取り権限チェック (trading-partner:read)
     * userロールには読み取り権限が付与されているため、一覧・詳細・検索は成功
     */
    it('userロールは取引先一覧を取得できること (200)', async () => {
      const response = await request(app)
        .get('/api/trading-partners')
        .set('Authorization', `Bearer ${noPermissionAccessToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('data');
      expect(response.body).toHaveProperty('pagination');
    });

    it('userロールは取引先検索を実行できること (200)', async () => {
      const response = await request(app)
        .get('/api/trading-partners/search?q=test')
        .set('Authorization', `Bearer ${noPermissionAccessToken}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });

    /**
     * 作成権限チェック (trading-partner:create)
     * userロールには作成権限が付与されているため、作成は成功
     */
    it('userロールは取引先を作成できること (201)', async () => {
      const response = await request(app)
        .post('/api/trading-partners')
        .set('Authorization', `Bearer ${noPermissionAccessToken}`)
        .send({
          name: 'test-api-integration-user-create',
          nameKana: 'テストユーザークリエイト',
          address: '東京都渋谷区1-1-1',
          types: ['CUSTOMER'],
        })
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body.name).toBe('test-api-integration-user-create');
    });

    /**
     * 更新権限チェック (trading-partner:update)
     * userロールには更新権限が付与されているため、更新は成功
     */
    it('userロールは取引先を更新できること (200)', async () => {
      // まず取引先を作成
      const createResponse = await request(app)
        .post('/api/trading-partners')
        .set('Authorization', `Bearer ${noPermissionAccessToken}`)
        .send({
          name: 'test-api-integration-user-update',
          nameKana: 'テストユーザーアップデート',
          address: '東京都渋谷区1-1-1',
          types: ['CUSTOMER'],
        })
        .expect(201);

      const partnerId = createResponse.body.id;
      const updatedAt = createResponse.body.updatedAt;

      // 更新
      const response = await request(app)
        .put(`/api/trading-partners/${partnerId}`)
        .set('Authorization', `Bearer ${noPermissionAccessToken}`)
        .send({
          name: 'test-api-integration-user-update-modified',
          expectedUpdatedAt: updatedAt,
        })
        .expect(200);

      expect(response.body.name).toBe('test-api-integration-user-update-modified');
    });
  });

  describe('Trading Partner CRUD Integration Tests', () => {
    /**
     * 取引先作成テスト
     */
    it('認証済みユーザーは取引先を作成できること (201)', async () => {
      const response = await request(app)
        .post('/api/trading-partners')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'test-api-integration-create',
          nameKana: 'テストエーピーアイインテグレーションクリエイト',
          address: '東京都渋谷区1-1-1',
          types: ['CUSTOMER'],
        })
        .expect(201);

      expect(response.body).toMatchObject({
        id: expect.any(String),
        name: 'test-api-integration-create',
        nameKana: 'テストエーピーアイインテグレーションクリエイト',
        address: '東京都渋谷区1-1-1',
        types: expect.arrayContaining(['CUSTOMER']),
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      });

      // 監査ログの検証
      const auditLog = await prisma.auditLog.findFirst({
        where: {
          action: 'TRADING_PARTNER_CREATED',
          targetId: response.body.id,
        },
      });

      expect(auditLog).not.toBeNull();
      expect(auditLog?.actorId).toBe(testUserId);
    });

    /**
     * 取引先一覧取得テスト
     */
    it('認証済みユーザーは取引先一覧を取得できること (200)', async () => {
      // テストデータを作成
      await request(app)
        .post('/api/trading-partners')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'test-api-integration-list-1',
          nameKana: 'テストリストイチ',
          address: '東京都渋谷区1-1-1',
          types: ['CUSTOMER'],
        })
        .expect(201);

      await request(app)
        .post('/api/trading-partners')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'test-api-integration-list-2',
          nameKana: 'テストリストニ',
          address: '東京都新宿区2-2-2',
          types: ['SUBCONTRACTOR'],
        })
        .expect(201);

      const response = await request(app)
        .get('/api/trading-partners?page=1&limit=10')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('data');
      expect(response.body).toHaveProperty('pagination');
      expect(response.body.pagination).toMatchObject({
        page: 1,
        limit: 10,
        total: expect.any(Number),
        totalPages: expect.any(Number),
      });
    });

    /**
     * 取引先詳細取得テスト
     */
    it('認証済みユーザーは取引先詳細を取得できること (200)', async () => {
      // テストデータを作成
      const createResponse = await request(app)
        .post('/api/trading-partners')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'test-api-integration-detail',
          nameKana: 'テストディテール',
          address: '東京都渋谷区1-1-1',
          types: ['CUSTOMER', 'SUBCONTRACTOR'],
          branchName: '渋谷支店',
          representativeName: '山田太郎',
          phoneNumber: '03-1234-5678',
        })
        .expect(201);

      const partnerId = createResponse.body.id;

      const response = await request(app)
        .get(`/api/trading-partners/${partnerId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body).toMatchObject({
        id: partnerId,
        name: 'test-api-integration-detail',
        nameKana: 'テストディテール',
        address: '東京都渋谷区1-1-1',
        types: expect.arrayContaining(['CUSTOMER', 'SUBCONTRACTOR']),
        branchName: '渋谷支店',
        representativeName: '山田太郎',
        phoneNumber: '03-1234-5678',
      });
    });

    /**
     * 取引先更新テスト
     */
    it('認証済みユーザーは取引先を更新できること (200)', async () => {
      // テストデータを作成
      const createResponse = await request(app)
        .post('/api/trading-partners')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'test-api-integration-update',
          nameKana: 'テストアップデート',
          address: '東京都渋谷区1-1-1',
          types: ['CUSTOMER'],
        })
        .expect(201);

      const partnerId = createResponse.body.id;
      const updatedAt = createResponse.body.updatedAt;

      const response = await request(app)
        .put(`/api/trading-partners/${partnerId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'test-api-integration-update-modified',
          nameKana: 'テストアップデートモディファイド',
          expectedUpdatedAt: updatedAt,
        })
        .expect(200);

      expect(response.body.name).toBe('test-api-integration-update-modified');
      expect(response.body.nameKana).toBe('テストアップデートモディファイド');

      // 監査ログの検証
      const auditLog = await prisma.auditLog.findFirst({
        where: {
          action: 'TRADING_PARTNER_UPDATED',
          targetId: partnerId,
        },
      });

      expect(auditLog).not.toBeNull();
      expect(auditLog?.before).toMatchObject({
        name: 'test-api-integration-update',
      });
      expect(auditLog?.after).toMatchObject({
        name: 'test-api-integration-update-modified',
      });
    });

    /**
     * 取引先削除テスト
     */
    it('認証済みユーザーは取引先を削除できること (204)', async () => {
      // テストデータを作成
      const createResponse = await request(app)
        .post('/api/trading-partners')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'test-api-integration-delete',
          nameKana: 'テストデリート',
          address: '東京都渋谷区1-1-1',
          types: ['CUSTOMER'],
        })
        .expect(201);

      const partnerId = createResponse.body.id;

      await request(app)
        .delete(`/api/trading-partners/${partnerId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(204);

      // 削除後は404
      await request(app)
        .get(`/api/trading-partners/${partnerId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);

      // 監査ログの検証
      const auditLog = await prisma.auditLog.findFirst({
        where: {
          action: 'TRADING_PARTNER_DELETED',
          targetId: partnerId,
        },
      });

      expect(auditLog).not.toBeNull();
    });

    /**
     * 取引先検索テスト
     */
    it('認証済みユーザーは取引先を検索できること (200)', async () => {
      // テストデータを作成
      await request(app)
        .post('/api/trading-partners')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'test-api-integration-search-abc',
          nameKana: 'テストサーチエービーシー',
          address: '東京都渋谷区1-1-1',
          types: ['CUSTOMER'],
        })
        .expect(201);

      const response = await request(app)
        .get('/api/trading-partners/search?q=search-abc')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThanOrEqual(1);
      expect(response.body[0]).toMatchObject({
        id: expect.any(String),
        name: expect.stringContaining('search-abc'),
        nameKana: expect.any(String),
        types: expect.any(Array),
      });
    });
  });

  describe('Error Response Tests (404, 409)', () => {
    // 有効なUUIDv4形式で存在しないID（バージョン4、バリアントbitが正しい）
    const nonExistentUuid = '12345678-1234-4123-8123-123456789abc';

    /**
     * 存在しない取引先へのアクセス (404)
     */
    it('存在しない取引先を取得しようとすると404が返ること', async () => {
      const response = await request(app)
        .get(`/api/trading-partners/${nonExistentUuid}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);

      expect(response.body).toMatchObject({
        status: 404,
        code: 'TRADING_PARTNER_NOT_FOUND',
      });
    });

    it('存在しない取引先を更新しようとすると404が返ること', async () => {
      const response = await request(app)
        .put(`/api/trading-partners/${nonExistentUuid}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'test-api-integration-not-found',
          expectedUpdatedAt: new Date().toISOString(),
        })
        .expect(404);

      expect(response.body).toMatchObject({
        status: 404,
        code: 'TRADING_PARTNER_NOT_FOUND',
      });
    });

    it('存在しない取引先を削除しようとすると404が返ること', async () => {
      const response = await request(app)
        .delete(`/api/trading-partners/${nonExistentUuid}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);

      expect(response.body).toMatchObject({
        status: 404,
        code: 'TRADING_PARTNER_NOT_FOUND',
      });
    });

    /**
     * 取引先名重複 (409)
     */
    it('重複する取引先名で作成しようとすると409が返ること', async () => {
      // 最初の取引先を作成
      await request(app)
        .post('/api/trading-partners')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'test-api-integration-duplicate',
          nameKana: 'テストデュプリケート',
          address: '東京都渋谷区1-1-1',
          types: ['CUSTOMER'],
        })
        .expect(201);

      // 同じ名前で再度作成を試みる
      const response = await request(app)
        .post('/api/trading-partners')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'test-api-integration-duplicate',
          nameKana: 'テストデュプリケートニ',
          address: '東京都新宿区2-2-2',
          types: ['SUBCONTRACTOR'],
        })
        .expect(409);

      expect(response.body).toMatchObject({
        status: 409,
        code: 'DUPLICATE_PARTNER_NAME',
      });
    });

    /**
     * 複合一意制約テスト（取引先名＋部課/支店/支社名）
     * TDD Task 25.1: APIエンドポイント経由での複合重複チェックテスト
     *
     * Requirements:
     * - 2.11: 同一の取引先名+支店名が既に存在する場合のエラー
     * - 4.8: 別の取引先と重複する取引先名+支店名に変更しようとした場合のエラー
     */
    describe('Composite Uniqueness Constraint (name + branchName)', () => {
      /**
       * POST /api/trading-partnersでの複合重複チェック
       */
      describe('POST /api/trading-partners - Composite Duplicate Check', () => {
        it('同一取引先名＋同一支店名で作成しようとすると409が返ること', async () => {
          // 最初の取引先を作成（支店名あり）
          await request(app)
            .post('/api/trading-partners')
            .set('Authorization', `Bearer ${accessToken}`)
            .send({
              name: 'test-api-integration-composite-dup',
              nameKana: 'テストコンポジットダップ',
              branchName: '渋谷支店',
              address: '東京都渋谷区1-1-1',
              types: ['CUSTOMER'],
            })
            .expect(201);

          // 同じ名前＋同じ支店名で再度作成を試みる
          const response = await request(app)
            .post('/api/trading-partners')
            .set('Authorization', `Bearer ${accessToken}`)
            .send({
              name: 'test-api-integration-composite-dup',
              nameKana: 'テストコンポジットダップニ',
              branchName: '渋谷支店',
              address: '東京都新宿区2-2-2',
              types: ['SUBCONTRACTOR'],
            })
            .expect(409);

          // 409 Conflictレスポンスフォーマット検証
          expect(response.body).toMatchObject({
            status: 409,
            code: 'DUPLICATE_PARTNER_NAME',
            detail: 'この取引先名と部課/支店/支社名の組み合わせは既に登録されています',
          });

          // detailsに name と branchName が含まれることを検証
          expect(response.body.details).toMatchObject({
            name: 'test-api-integration-composite-dup',
            branchName: '渋谷支店',
          });
        });

        it('同一取引先名でも支店名が異なれば作成できること', async () => {
          // 最初の取引先を作成（渋谷支店）
          await request(app)
            .post('/api/trading-partners')
            .set('Authorization', `Bearer ${accessToken}`)
            .send({
              name: 'test-api-integration-composite-ok',
              nameKana: 'テストコンポジットオーケー',
              branchName: '渋谷支店',
              address: '東京都渋谷区1-1-1',
              types: ['CUSTOMER'],
            })
            .expect(201);

          // 同じ名前だが異なる支店名で作成
          const response = await request(app)
            .post('/api/trading-partners')
            .set('Authorization', `Bearer ${accessToken}`)
            .send({
              name: 'test-api-integration-composite-ok',
              nameKana: 'テストコンポジットオーケー',
              branchName: '新宿支店',
              address: '東京都新宿区2-2-2',
              types: ['CUSTOMER'],
            })
            .expect(201);

          expect(response.body).toMatchObject({
            name: 'test-api-integration-composite-ok',
            branchName: '新宿支店',
          });
        });

        it('同一取引先名＋支店名なし（null）同士で重複エラーになること', async () => {
          // 最初の取引先を作成（支店名なし）
          await request(app)
            .post('/api/trading-partners')
            .set('Authorization', `Bearer ${accessToken}`)
            .send({
              name: 'test-api-integration-composite-null',
              nameKana: 'テストコンポジットナル',
              address: '東京都渋谷区1-1-1',
              types: ['CUSTOMER'],
            })
            .expect(201);

          // 同じ名前＋支店名なしで再度作成を試みる
          const response = await request(app)
            .post('/api/trading-partners')
            .set('Authorization', `Bearer ${accessToken}`)
            .send({
              name: 'test-api-integration-composite-null',
              nameKana: 'テストコンポジットナルニ',
              address: '東京都新宿区2-2-2',
              types: ['SUBCONTRACTOR'],
            })
            .expect(409);

          expect(response.body).toMatchObject({
            status: 409,
            code: 'DUPLICATE_PARTNER_NAME',
          });

          // branchNameがnullであることを検証
          expect(response.body.details).toMatchObject({
            name: 'test-api-integration-composite-null',
            branchName: null,
          });
        });

        it('支店名ありの取引先と同名だが支店名なしなら作成できること', async () => {
          // 最初の取引先を作成（支店名あり）
          await request(app)
            .post('/api/trading-partners')
            .set('Authorization', `Bearer ${accessToken}`)
            .send({
              name: 'test-api-integration-composite-mixed',
              nameKana: 'テストコンポジットミックスド',
              branchName: '大阪支店',
              address: '大阪府大阪市1-1-1',
              types: ['CUSTOMER'],
            })
            .expect(201);

          // 同じ名前だが支店名なしで作成
          const response = await request(app)
            .post('/api/trading-partners')
            .set('Authorization', `Bearer ${accessToken}`)
            .send({
              name: 'test-api-integration-composite-mixed',
              nameKana: 'テストコンポジットミックスド',
              address: '東京都渋谷区1-1-1',
              types: ['CUSTOMER'],
            })
            .expect(201);

          expect(response.body).toMatchObject({
            name: 'test-api-integration-composite-mixed',
            branchName: null,
          });
        });
      });

      /**
       * PUT /api/trading-partners/:idでの複合重複チェック
       */
      describe('PUT /api/trading-partners/:id - Composite Duplicate Check', () => {
        it('既存の取引先と同一の取引先名＋支店名への変更は409が返ること', async () => {
          // 最初の取引先を作成
          await request(app)
            .post('/api/trading-partners')
            .set('Authorization', `Bearer ${accessToken}`)
            .send({
              name: 'test-api-integration-update-target',
              nameKana: 'テストアップデートターゲット',
              branchName: '横浜支店',
              address: '神奈川県横浜市1-1-1',
              types: ['CUSTOMER'],
            })
            .expect(201);

          // 2番目の取引先を作成
          const createResponse = await request(app)
            .post('/api/trading-partners')
            .set('Authorization', `Bearer ${accessToken}`)
            .send({
              name: 'test-api-integration-update-source',
              nameKana: 'テストアップデートソース',
              branchName: '名古屋支店',
              address: '愛知県名古屋市1-1-1',
              types: ['CUSTOMER'],
            })
            .expect(201);

          const partnerId = createResponse.body.id;
          const updatedAt = createResponse.body.updatedAt;

          // 2番目の取引先を1番目と同じ名前＋支店名に変更しようとする
          const response = await request(app)
            .put(`/api/trading-partners/${partnerId}`)
            .set('Authorization', `Bearer ${accessToken}`)
            .send({
              name: 'test-api-integration-update-target',
              branchName: '横浜支店',
              expectedUpdatedAt: updatedAt,
            })
            .expect(409);

          // 409 Conflictレスポンスフォーマット検証
          expect(response.body).toMatchObject({
            status: 409,
            code: 'DUPLICATE_PARTNER_NAME',
            detail: 'この取引先名と部課/支店/支社名の組み合わせは既に登録されています',
          });

          // detailsに name と branchName が含まれることを検証
          expect(response.body.details).toMatchObject({
            name: 'test-api-integration-update-target',
            branchName: '横浜支店',
          });
        });

        it('自分自身と同じ名前＋支店名への更新は成功すること', async () => {
          // 取引先を作成
          const createResponse = await request(app)
            .post('/api/trading-partners')
            .set('Authorization', `Bearer ${accessToken}`)
            .send({
              name: 'test-api-integration-update-self',
              nameKana: 'テストアップデートセルフ',
              branchName: '福岡支店',
              address: '福岡県福岡市1-1-1',
              types: ['CUSTOMER'],
            })
            .expect(201);

          const partnerId = createResponse.body.id;
          const updatedAt = createResponse.body.updatedAt;

          // 自分自身と同じ名前＋支店名で更新（他のフィールドのみ変更）
          const response = await request(app)
            .put(`/api/trading-partners/${partnerId}`)
            .set('Authorization', `Bearer ${accessToken}`)
            .send({
              name: 'test-api-integration-update-self',
              branchName: '福岡支店',
              address: '福岡県福岡市2-2-2', // アドレスのみ変更
              expectedUpdatedAt: updatedAt,
            })
            .expect(200);

          expect(response.body).toMatchObject({
            name: 'test-api-integration-update-self',
            branchName: '福岡支店',
            address: '福岡県福岡市2-2-2',
          });
        });

        it('名前は同じでも支店名を変更すれば更新できること', async () => {
          // 最初の取引先を作成
          const createResponse = await request(app)
            .post('/api/trading-partners')
            .set('Authorization', `Bearer ${accessToken}`)
            .send({
              name: 'test-api-integration-update-branch',
              nameKana: 'テストアップデートブランチ',
              branchName: '札幌支店',
              address: '北海道札幌市1-1-1',
              types: ['CUSTOMER'],
            })
            .expect(201);

          const partnerId = createResponse.body.id;
          const updatedAt = createResponse.body.updatedAt;

          // 支店名を変更
          const response = await request(app)
            .put(`/api/trading-partners/${partnerId}`)
            .set('Authorization', `Bearer ${accessToken}`)
            .send({
              branchName: '仙台支店',
              expectedUpdatedAt: updatedAt,
            })
            .expect(200);

          expect(response.body).toMatchObject({
            name: 'test-api-integration-update-branch',
            branchName: '仙台支店',
          });
        });

        it('既存取引先と同一の取引先名＋支店名null への変更は409が返ること', async () => {
          // 最初の取引先を作成（支店名なし）
          await request(app)
            .post('/api/trading-partners')
            .set('Authorization', `Bearer ${accessToken}`)
            .send({
              name: 'test-api-integration-update-null-target',
              nameKana: 'テストアップデートナルターゲット',
              address: '東京都渋谷区1-1-1',
              types: ['CUSTOMER'],
            })
            .expect(201);

          // 2番目の取引先を作成（支店名あり）
          const createResponse = await request(app)
            .post('/api/trading-partners')
            .set('Authorization', `Bearer ${accessToken}`)
            .send({
              name: 'test-api-integration-update-null-source',
              nameKana: 'テストアップデートナルソース',
              branchName: '本社',
              address: '東京都新宿区1-1-1',
              types: ['CUSTOMER'],
            })
            .expect(201);

          const partnerId = createResponse.body.id;
          const updatedAt = createResponse.body.updatedAt;

          // 2番目の取引先を1番目と同じ名前＋支店名なしに変更しようとする
          const response = await request(app)
            .put(`/api/trading-partners/${partnerId}`)
            .set('Authorization', `Bearer ${accessToken}`)
            .send({
              name: 'test-api-integration-update-null-target',
              branchName: null,
              expectedUpdatedAt: updatedAt,
            })
            .expect(409);

          expect(response.body).toMatchObject({
            status: 409,
            code: 'DUPLICATE_PARTNER_NAME',
          });

          expect(response.body.details).toMatchObject({
            name: 'test-api-integration-update-null-target',
            branchName: null,
          });
        });
      });

      /**
       * 409 Conflictレスポンスフォーマット検証
       */
      describe('409 Conflict Response Format', () => {
        it('重複エラーレスポンスがRFC 7807形式であること', async () => {
          // 最初の取引先を作成
          await request(app)
            .post('/api/trading-partners')
            .set('Authorization', `Bearer ${accessToken}`)
            .send({
              name: 'test-api-integration-rfc7807',
              nameKana: 'テストアールエフシーナナハチゼロナナ',
              branchName: '本社',
              address: '東京都渋谷区1-1-1',
              types: ['CUSTOMER'],
            })
            .expect(201);

          // 同じ名前＋支店名で再度作成を試みる
          const response = await request(app)
            .post('/api/trading-partners')
            .set('Authorization', `Bearer ${accessToken}`)
            .send({
              name: 'test-api-integration-rfc7807',
              nameKana: 'テストアールエフシーナナハチゼロナナニ',
              branchName: '本社',
              address: '東京都新宿区2-2-2',
              types: ['SUBCONTRACTOR'],
            })
            .expect(409);

          // RFC 7807 Problem Details形式の検証
          expect(response.body).toMatchObject({
            type: expect.stringContaining('conflict'),
            status: 409,
            code: 'DUPLICATE_PARTNER_NAME',
            detail: expect.any(String),
            details: expect.objectContaining({
              name: expect.any(String),
              branchName: expect.any(String),
            }),
          });

          // Content-Typeヘッダー検証
          expect(response.headers['content-type']).toMatch(/application\/json/);
        });
      });
    });

    /**
     * 楽観的排他制御エラー (409)
     */
    it('古いupdatedAtで更新しようとすると409が返ること', async () => {
      // 取引先を作成
      const createResponse = await request(app)
        .post('/api/trading-partners')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'test-api-integration-conflict',
          nameKana: 'テストコンフリクト',
          address: '東京都渋谷区1-1-1',
          types: ['CUSTOMER'],
        })
        .expect(201);

      const partnerId = createResponse.body.id;
      const originalUpdatedAt = createResponse.body.updatedAt;

      // 最初の更新
      await request(app)
        .put(`/api/trading-partners/${partnerId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'test-api-integration-conflict-first',
          expectedUpdatedAt: originalUpdatedAt,
        })
        .expect(200);

      // 古いタイムスタンプで2回目の更新を試みる
      const response = await request(app)
        .put(`/api/trading-partners/${partnerId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'test-api-integration-conflict-second',
          expectedUpdatedAt: originalUpdatedAt, // 古いタイムスタンプ
        })
        .expect(409);

      expect(response.body).toMatchObject({
        status: 409,
        code: 'TRADING_PARTNER_CONFLICT',
      });
    });
  });

  describe('Validation Error Tests (400)', () => {
    /**
     * バリデーションエラー (400)
     */
    it('必須項目がない場合400が返ること', async () => {
      const response = await request(app)
        .post('/api/trading-partners')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          // nameが欠落
          nameKana: 'テスト',
          address: '東京都渋谷区1-1-1',
          types: ['CUSTOMER'],
        })
        .expect(400);

      expect(response.body).toHaveProperty('status', 400);
    });

    it('無効なUUID形式のIDで404が返ること', async () => {
      const response = await request(app)
        .get('/api/trading-partners/invalid-uuid')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(400);

      expect(response.body).toHaveProperty('status', 400);
    });

    it('フリガナがカタカナ以外の場合400が返ること', async () => {
      const response = await request(app)
        .post('/api/trading-partners')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'test-api-integration-invalid-kana',
          nameKana: 'ひらがな', // カタカナではない
          address: '東京都渋谷区1-1-1',
          types: ['CUSTOMER'],
        })
        .expect(400);

      expect(response.body).toHaveProperty('status', 400);
    });

    it('無効なメールアドレス形式の場合400が返ること', async () => {
      const response = await request(app)
        .post('/api/trading-partners')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'test-api-integration-invalid-email',
          nameKana: 'テストインバリッドイーメール',
          address: '東京都渋谷区1-1-1',
          types: ['CUSTOMER'],
          email: 'invalid-email', // 無効なメールアドレス
        })
        .expect(400);

      expect(response.body).toHaveProperty('status', 400);
    });

    it('種別が空配列の場合400が返ること', async () => {
      const response = await request(app)
        .post('/api/trading-partners')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'test-api-integration-empty-types',
          nameKana: 'テストエンプティタイプス',
          address: '東京都渋谷区1-1-1',
          types: [], // 空配列
        })
        .expect(400);

      expect(response.body).toHaveProperty('status', 400);
    });
  });

  describe('Performance Tests', () => {
    /**
     * API応答時間の検証
     * Requirements: 9.3
     */
    it('CRUD操作のAPI応答時間が500ミリ秒以内であること', async () => {
      // 作成
      const createStart = Date.now();
      const createResponse = await request(app)
        .post('/api/trading-partners')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'test-api-integration-perf',
          nameKana: 'テストパフォーマンス',
          address: '東京都渋谷区1-1-1',
          types: ['CUSTOMER'],
        })
        .expect(201);
      const createTime = Date.now() - createStart;
      expect(createTime).toBeLessThan(500);

      const partnerId = createResponse.body.id;
      const updatedAt = createResponse.body.updatedAt;

      // 詳細取得
      const getStart = Date.now();
      await request(app)
        .get(`/api/trading-partners/${partnerId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      const getTime = Date.now() - getStart;
      expect(getTime).toBeLessThan(500);

      // 一覧取得
      const listStart = Date.now();
      await request(app)
        .get('/api/trading-partners')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      const listTime = Date.now() - listStart;
      expect(listTime).toBeLessThan(500);

      // 検索
      const searchStart = Date.now();
      await request(app)
        .get('/api/trading-partners/search?q=perf')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      const searchTime = Date.now() - searchStart;
      expect(searchTime).toBeLessThan(500);

      // 更新
      const updateStart = Date.now();
      await request(app)
        .put(`/api/trading-partners/${partnerId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'test-api-integration-perf-updated',
          expectedUpdatedAt: updatedAt,
        })
        .expect(200);
      const updateTime = Date.now() - updateStart;
      expect(updateTime).toBeLessThan(500);

      // 削除
      const deleteStart = Date.now();
      await request(app)
        .delete(`/api/trading-partners/${partnerId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(204);
      const deleteTime = Date.now() - deleteStart;
      expect(deleteTime).toBeLessThan(500);
    });
  });
});
