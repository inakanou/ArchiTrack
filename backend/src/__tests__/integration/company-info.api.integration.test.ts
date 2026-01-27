/**
 * @fileoverview 自社情報API統合テスト
 *
 * TDD Task 4.1: APIエンドポイントの統合テスト
 * - 認証・認可ミドルウェアの動作確認
 * - 各エンドポイントのレスポンス検証
 * - エラーレスポンスの検証（401, 403, 409）
 *
 * Requirements (company-info):
 * - 6.1: 認証済みユーザーのみに自社情報ページへのアクセスを許可
 * - 6.4: 未認証ユーザーが自社情報ページにアクセスした場合、401エラーを返却
 * - 6.7: 自社情報の閲覧に「company_info:read」権限を要求
 * - 6.8: 自社情報の保存に「company_info:update」権限を要求
 * - 6.9: 権限のないユーザーが操作を試みた場合、403 Forbiddenエラーを返却
 * - 9.1: GET /api/company-info エンドポイントで自社情報取得機能を提供
 * - 9.2: 自社情報が登録されている場合、自社情報オブジェクトを返却
 * - 9.3: 自社情報が未登録の場合、空オブジェクト {} とHTTPステータス200 OKを返却
 * - 9.4: PUT /api/company-info エンドポイントで自社情報の作成・更新機能を提供
 * - 9.5: 自社情報が存在しない状態でPUTリクエストを受信したとき、新規レコードを作成
 * - 9.6: 自社情報が存在する状態でPUTリクエストを受信したとき、既存レコードを更新
 * - 9.7: APIレスポンスに必要なフィールドを含める
 * - 9.8: PUTリクエストのボディにversionフィールドを含め、楽観的排他制御を実行
 * - 9.9: versionが一致しない場合、409 Conflictエラーを返却
 * - 9.10: 自社情報の削除APIを提供しない
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
 * 自社情報API統合テスト
 */
describe('Company Info API Integration Tests', () => {
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
        email: 'test-company-info-integration@example.com',
        displayName: 'Company Info Test User',
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
        email: 'test-company-info-integration@example.com',
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

    // 権限を持たないロールを作成
    let noPermRole = await prisma.role.findUnique({
      where: { name: 'no-perm-company-info' },
    });

    if (!noPermRole) {
      noPermRole = await prisma.role.create({
        data: {
          name: 'no-perm-company-info',
          description: 'No permissions for company info',
        },
      });
    }

    // テストユーザーを作成（権限なし）
    const user = await prisma.user.create({
      data: {
        email: 'test-company-info-no-perm@example.com',
        displayName: 'No Permission User',
        passwordHash,
      },
    });

    // 権限なしロールを割り当て
    await prisma.userRole.create({
      data: {
        userId: user.id,
        roleId: noPermRole.id,
      },
    });

    // ログイン
    const response = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: 'test-company-info-no-perm@example.com',
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

    // 1. 監査ログを削除
    if (testUserId || noPermissionUserId) {
      await prisma.auditLog.deleteMany({
        where: {
          actorId: {
            in: [testUserId, noPermissionUserId].filter(Boolean),
          },
        },
      });
    }

    // 2. ユーザーロールを削除
    await prisma.userRole.deleteMany({
      where: {
        user: {
          email: {
            in: [
              'test-company-info-integration@example.com',
              'test-company-info-no-perm@example.com',
            ],
          },
        },
      },
    });

    // 3. ユーザーを削除
    await prisma.user.deleteMany({
      where: {
        email: {
          in: [
            'test-company-info-integration@example.com',
            'test-company-info-no-perm@example.com',
          ],
        },
      },
    });

    // 4. テスト用ロールを削除
    await prisma.role.deleteMany({
      where: {
        name: 'no-perm-company-info',
      },
    });

    // 5. 自社情報を削除
    await prisma.companyInfo.deleteMany({});

    // 接続を切断
    await prisma.$disconnect();
    await redis.disconnect();
  });

  beforeEach(async () => {
    // 各テスト前に自社情報をクリア
    await prisma.companyInfo.deleteMany({});
  });

  describe('Authentication Tests', () => {
    /**
     * REQ-6.1, REQ-6.4: 未認証アクセス時の401テスト
     */
    describe('GET /api/company-info - Unauthenticated Access', () => {
      it('should return 401 when accessing without authentication', async () => {
        const response = await request(app).get('/api/company-info').expect(401);

        expect(response.body).toHaveProperty('error', 'MISSING_TOKEN');
      });
    });

    describe('PUT /api/company-info - Unauthenticated Access', () => {
      it('should return 401 when updating without authentication', async () => {
        const response = await request(app)
          .put('/api/company-info')
          .send({
            companyName: 'Test Company',
            address: 'Test Address',
            representative: 'Test Representative',
          })
          .expect(401);

        expect(response.body).toHaveProperty('error', 'MISSING_TOKEN');
      });
    });
  });

  describe('Authorization Tests', () => {
    beforeAll(async () => {
      // 権限なしユーザーでログイン
      const noPermResult = await loginTestUserWithoutPermissions();
      noPermissionAccessToken = noPermResult.token;
      noPermissionUserId = noPermResult.userId;
    });

    /**
     * REQ-6.7, REQ-6.9: company_info:read権限チェックテスト
     */
    describe('GET /api/company-info - Permission Check', () => {
      it('should return 403 when user lacks company_info:read permission', async () => {
        const response = await request(app)
          .get('/api/company-info')
          .set('Authorization', `Bearer ${noPermissionAccessToken}`)
          .expect(403);

        expect(response.body).toHaveProperty('error', 'FORBIDDEN');
      });
    });

    /**
     * REQ-6.8, REQ-6.9: company_info:update権限チェックテスト
     */
    describe('PUT /api/company-info - Permission Check', () => {
      it('should return 403 when user lacks company_info:update permission', async () => {
        const response = await request(app)
          .put('/api/company-info')
          .set('Authorization', `Bearer ${noPermissionAccessToken}`)
          .send({
            companyName: 'Test Company',
            address: 'Test Address',
            representative: 'Test Representative',
          })
          .expect(403);

        expect(response.body).toHaveProperty('error', 'FORBIDDEN');
      });
    });
  });

  describe('GET /api/company-info', () => {
    beforeAll(async () => {
      // 権限ありユーザーでログイン
      const result = await loginTestUserWithPermissions();
      accessToken = result.token;
      testUserId = result.userId;
    });

    /**
     * REQ-9.3: 未登録時に空オブジェクトを返却
     */
    it('should return empty object when company info is not registered', async () => {
      const response = await request(app)
        .get('/api/company-info')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body).toEqual({});
    });

    /**
     * REQ-9.2, REQ-9.7: 登録済みデータを返却（全フィールド含む）
     */
    it('should return company info when registered', async () => {
      // 事前に自社情報を登録
      await prisma.companyInfo.create({
        data: {
          companyName: 'テスト株式会社',
          address: '東京都渋谷区テスト町1-2-3',
          representative: 'テスト太郎',
          phone: '03-1234-5678',
          fax: '03-1234-5679',
          email: 'info@test-company.co.jp',
          invoiceRegistrationNumber: 'T1234567890123',
          version: 1,
        },
      });

      const response = await request(app)
        .get('/api/company-info')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('companyName', 'テスト株式会社');
      expect(response.body).toHaveProperty('address', '東京都渋谷区テスト町1-2-3');
      expect(response.body).toHaveProperty('representative', 'テスト太郎');
      expect(response.body).toHaveProperty('phone', '03-1234-5678');
      expect(response.body).toHaveProperty('fax', '03-1234-5679');
      expect(response.body).toHaveProperty('email', 'info@test-company.co.jp');
      expect(response.body).toHaveProperty('invoiceRegistrationNumber', 'T1234567890123');
      expect(response.body).toHaveProperty('version', 1);
      expect(response.body).toHaveProperty('createdAt');
      expect(response.body).toHaveProperty('updatedAt');
    });
  });

  describe('PUT /api/company-info', () => {
    /**
     * REQ-9.4, REQ-9.5: 新規作成成功
     */
    it('should create new company info when not exists', async () => {
      const response = await request(app)
        .put('/api/company-info')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          companyName: '新規テスト株式会社',
          address: '東京都新宿区テスト町4-5-6',
          representative: '新規太郎',
          phone: '03-9876-5432',
          fax: '03-9876-5433',
          email: 'contact@new-test.co.jp',
          invoiceRegistrationNumber: 'T9876543210987',
        })
        .expect(200);

      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('companyName', '新規テスト株式会社');
      expect(response.body).toHaveProperty('address', '東京都新宿区テスト町4-5-6');
      expect(response.body).toHaveProperty('representative', '新規太郎');
      expect(response.body).toHaveProperty('phone', '03-9876-5432');
      expect(response.body).toHaveProperty('fax', '03-9876-5433');
      expect(response.body).toHaveProperty('email', 'contact@new-test.co.jp');
      expect(response.body).toHaveProperty('invoiceRegistrationNumber', 'T9876543210987');
      expect(response.body).toHaveProperty('version', 1);
      expect(response.body).toHaveProperty('createdAt');
      expect(response.body).toHaveProperty('updatedAt');
    });

    /**
     * REQ-9.6, REQ-9.8: 更新成功（楽観的排他制御）
     */
    it('should update existing company info with correct version', async () => {
      // 事前に自社情報を登録
      await prisma.companyInfo.create({
        data: {
          companyName: '更新前会社',
          address: '更新前住所',
          representative: '更新前代表者',
          version: 1,
        },
      });

      const response = await request(app)
        .put('/api/company-info')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          companyName: '更新後会社',
          address: '更新後住所',
          representative: '更新後代表者',
          version: 1,
        })
        .expect(200);

      expect(response.body).toHaveProperty('companyName', '更新後会社');
      expect(response.body).toHaveProperty('address', '更新後住所');
      expect(response.body).toHaveProperty('representative', '更新後代表者');
      expect(response.body).toHaveProperty('version', 2);
    });

    /**
     * REQ-9.9: 楽観的排他制御競合時の409テスト
     */
    it('should return 409 when version does not match', async () => {
      // 事前に自社情報を登録
      await prisma.companyInfo.create({
        data: {
          companyName: '競合テスト会社',
          address: '競合テスト住所',
          representative: '競合テスト代表者',
          version: 2,
        },
      });

      const response = await request(app)
        .put('/api/company-info')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          companyName: '更新しようとした会社',
          address: '更新しようとした住所',
          representative: '更新しようとした代表者',
          version: 1, // 古いバージョン
        })
        .expect(409);

      expect(response.body).toHaveProperty('status', 409);
      expect(response.body).toHaveProperty('code', 'COMPANY_INFO_CONFLICT');
    });

    /**
     * バリデーションエラーテスト（400）
     */
    it('should return 400 when required fields are missing', async () => {
      const response = await request(app)
        .put('/api/company-info')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          companyName: '', // 空の必須フィールド
          address: 'テスト住所',
          representative: 'テスト代表者',
        })
        .expect(400);

      expect(response.body).toHaveProperty('status', 400);
    });

    /**
     * 電話番号形式バリデーションエラーテスト
     */
    it('should return 400 when phone format is invalid', async () => {
      const response = await request(app)
        .put('/api/company-info')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          companyName: 'テスト会社',
          address: 'テスト住所',
          representative: 'テスト代表者',
          phone: 'invalid-phone-ABC', // 不正な形式
        })
        .expect(400);

      expect(response.body).toHaveProperty('status', 400);
    });

    /**
     * メールアドレス形式バリデーションエラーテスト
     */
    it('should return 400 when email format is invalid', async () => {
      const response = await request(app)
        .put('/api/company-info')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          companyName: 'テスト会社',
          address: 'テスト住所',
          representative: 'テスト代表者',
          email: 'invalid-email', // 不正な形式
        })
        .expect(400);

      expect(response.body).toHaveProperty('status', 400);
    });

    /**
     * 適格請求書発行事業者登録番号形式バリデーションエラーテスト
     */
    it('should return 400 when invoice registration number format is invalid', async () => {
      const response = await request(app)
        .put('/api/company-info')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          companyName: 'テスト会社',
          address: 'テスト住所',
          representative: 'テスト代表者',
          invoiceRegistrationNumber: '12345', // T + 13桁でない
        })
        .expect(400);

      expect(response.body).toHaveProperty('status', 400);
    });
  });

  /**
   * REQ-9.10: 削除APIを提供しない
   */
  describe('DELETE /api/company-info', () => {
    it('should return 404 for DELETE request (not implemented)', async () => {
      const response = await request(app)
        .delete('/api/company-info')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);

      expect(response.body).toHaveProperty('status', 404);
    });
  });
});
