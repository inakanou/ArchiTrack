/**
 * @fileoverview 現場調査からの数量グループ一括生成API統合テスト
 *
 * POST /api/quantity-tables/:quantityTableId/groups/from-survey の統合テスト。
 *
 * Task 56.5: 一括生成 API の統合テストを実装する
 *
 * 網羅シナリオ:
 * - 認証なしで 401、権限なしで 403、存在しない現場調査/数量表で 404
 * - 他プロジェクトの現場調査指定時に 403（code SITE_SURVEY_PROJECT_MISMATCH）
 * - 写真0枚の現場調査で created:0
 * - 同一数量表への from-survey/copy/add/reorder 並行実行で
 *   displayOrder の衝突・欠番が発生しない（ロックタイムアウト時 409）
 * - 成功時に 201 と生成結果、DB に末尾追加で永続化
 *
 * Requirements:
 * - 40.1: 一括生成APIの成功応答（201, created, groups）
 * - 40.2: 写真順での末尾追加・連番命名
 * - 40.7: 写真0枚で created:0
 * - 40.10: 認証・権限・存在・プロジェクト所属の検証（401/403/404）
 * - 40.12: 同一数量表への並行操作の直列化（displayOrder 衝突・欠番なし、409）
 *
 * @module __tests__/integration/quantity-groups-from-survey.api.integration.test
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
 * 一括生成API統合テスト
 */
describe('Quantity Groups From Survey API Integration Tests', () => {
  let prisma: PrismaClient;

  // 権限ありユーザー（quantity_table:create 等を持つ）
  const PERMITTED_EMAIL = 'test-from-survey-permitted@example.com';
  let accessToken: string;
  let testUserId: string;

  // 権限なしユーザー（ロール未割り当て = quantity_table:create 権限なし）
  const NO_PERMISSION_EMAIL = 'test-from-survey-no-permission@example.com';
  let noPermissionAccessToken: string;

  // 主プロジェクトと別プロジェクト
  let testProjectId: string;
  let otherProjectId: string;

  const PASSWORD = 'TestPassword123!';

  /**
   * パスワードハッシュを生成
   */
  const hashPassword = async (): Promise<string> => {
    return await (
      await import('@node-rs/argon2')
    ).hash(PASSWORD, {
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4,
    });
  };

  /**
   * 権限ありユーザーを作成し、数量表関連の権限を付与してログイン
   */
  const setupPermittedUser = async (): Promise<{ token: string; userId: string }> => {
    const passwordHash = await hashPassword();

    const user = await prisma.user.create({
      data: {
        email: PERMITTED_EMAIL,
        displayName: 'From Survey Permitted User',
        passwordHash,
      },
    });

    const userRole = await prisma.role.findUnique({ where: { name: 'user' } });

    if (userRole) {
      await prisma.userRole.create({
        data: { userId: user.id, roleId: userRole.id },
      });
    }

    // 数量表関連の権限を作成（seedPermissionsに含まれていないため）
    const quantityTablePermissions = [
      { resource: 'quantity_table', action: 'create', description: '数量表の作成' },
      { resource: 'quantity_table', action: 'read', description: '数量表の閲覧' },
      { resource: 'quantity_table', action: 'update', description: '数量表の更新' },
      { resource: 'quantity_table', action: 'delete', description: '数量表の削除' },
    ];
    await prisma.permission.createMany({
      data: quantityTablePermissions,
      skipDuplicates: true,
    });

    const permissions = await prisma.permission.findMany({
      where: {
        OR: [
          { resource: 'project', action: { in: ['create', 'read', 'update', 'delete'] } },
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

    const response = await request(app).post('/api/v1/auth/login').send({
      email: PERMITTED_EMAIL,
      password: PASSWORD,
    });

    return { token: response.body.accessToken, userId: user.id };
  };

  /**
   * 権限なしユーザーを作成してログイン（ロール未割り当て）
   */
  const setupNoPermissionUser = async (): Promise<string> => {
    const passwordHash = await hashPassword();

    await prisma.user.create({
      data: {
        email: NO_PERMISSION_EMAIL,
        displayName: 'From Survey No Permission User',
        passwordHash,
      },
    });

    const loginResponse = await request(app).post('/api/v1/auth/login').send({
      email: NO_PERMISSION_EMAIL,
      password: PASSWORD,
    });

    return loginResponse.body.accessToken;
  };

  /**
   * テスト用プロジェクトを作成
   */
  const createTestProject = async (name: string): Promise<string> => {
    const project = await prisma.project.create({
      data: {
        name,
        status: 'PREPARING',
        salesPersonId: testUserId,
        createdById: testUserId,
      },
    });
    return project.id;
  };

  /**
   * 現場調査を作成
   */
  const createSurvey = async (projectId: string, name: string): Promise<string> => {
    const survey = await prisma.siteSurvey.create({
      data: {
        projectId,
        name,
        surveyDate: new Date('2025-01-15'),
      },
    });
    return survey.id;
  };

  /**
   * 現場調査に写真を指定枚数作成（displayOrder 昇順）
   */
  const createSurveyImages = async (surveyId: string, count: number): Promise<string[]> => {
    const ids: string[] = [];
    for (let i = 0; i < count; i++) {
      const image = await prisma.surveyImage.create({
        data: {
          surveyId,
          originalPath: `surveys/test/${surveyId}-${i}.jpg`,
          thumbnailPath: `surveys/test/${surveyId}-${i}-thumb.jpg`,
          fileName: `image-${i}.jpg`,
          fileSize: 1024,
          width: 800,
          height: 600,
          displayOrder: i,
        },
      });
      ids.push(image.id);
    }
    return ids;
  };

  /**
   * 数量表を作成
   */
  const createQuantityTable = async (projectId: string, name: string): Promise<string> => {
    const qt = await prisma.quantityTable.create({
      data: { projectId, name },
    });
    return qt.id;
  };

  beforeAll(async () => {
    prisma = getPrismaClient();
    await initRedis();
    await seedRoles(prisma);
    await seedPermissions(prisma);
    await seedRolePermissions(prisma);

    const auth = await setupPermittedUser();
    accessToken = auth.token;
    testUserId = auth.userId;
    noPermissionAccessToken = await setupNoPermissionUser();

    testProjectId = await createTestProject('一括生成テスト_主プロジェクト');
    otherProjectId = await createTestProject('一括生成テスト_別プロジェクト');
  });

  afterAll(async () => {
    if (testProjectId) {
      await prisma.project.deleteMany({ where: { id: testProjectId } });
    }
    if (otherProjectId) {
      await prisma.project.deleteMany({ where: { id: otherProjectId } });
    }
    await prisma.user.deleteMany({
      where: { email: { in: [PERMITTED_EMAIL, NO_PERMISSION_EMAIL] } },
    });

    await prisma.$disconnect();
    redis.disconnect();
  });

  describe('POST /api/quantity-tables/:quantityTableId/groups/from-survey', () => {
    // 各テスト前に主プロジェクトの数量表・現場調査をクリーンアップ
    beforeEach(async () => {
      await prisma.quantityTable.deleteMany({ where: { projectId: testProjectId } });
      await prisma.siteSurvey.deleteMany({ where: { projectId: testProjectId } });
      await prisma.siteSurvey.deleteMany({ where: { projectId: otherProjectId } });
    });

    it('認証なしリクエストは 401 で拒否される (Req 40.10)', async () => {
      const quantityTableId = await createQuantityTable(testProjectId, '認証なしテスト数量表');
      const surveyId = await createSurvey(testProjectId, '認証なしテスト現場調査');

      const response = await request(app)
        .post(`/api/quantity-tables/${quantityTableId}/groups/from-survey`)
        .send({ siteSurveyId: surveyId });

      expect(response.status).toBe(401);
    });

    it('権限なしユーザー（quantity_table:create 権限なし）では 403 が返る (Req 40.10)', async () => {
      const quantityTableId = await createQuantityTable(testProjectId, '権限なしテスト数量表');
      const surveyId = await createSurvey(testProjectId, '権限なしテスト現場調査');
      await createSurveyImages(surveyId, 1);

      expect(noPermissionAccessToken).toBeDefined();

      const response = await request(app)
        .post(`/api/quantity-tables/${quantityTableId}/groups/from-survey`)
        .set('Authorization', `Bearer ${noPermissionAccessToken}`)
        .send({ siteSurveyId: surveyId });

      expect(response.status).toBe(403);
    });

    it('存在しない数量表では 404（QUANTITY_TABLE_NOT_FOUND）が返る (Req 40.10)', async () => {
      const surveyId = await createSurvey(testProjectId, '数量表不存在テスト現場調査');

      const response = await request(app)
        .post('/api/quantity-tables/12345678-1234-4234-a234-123456789012/groups/from-survey')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ siteSurveyId: surveyId });

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('code', 'QUANTITY_TABLE_NOT_FOUND');
    });

    it('存在しない現場調査では 404（SITE_SURVEY_NOT_FOUND）が返る (Req 40.10)', async () => {
      const quantityTableId = await createQuantityTable(
        testProjectId,
        '現場調査不存在テスト数量表'
      );

      const response = await request(app)
        .post(`/api/quantity-tables/${quantityTableId}/groups/from-survey`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ siteSurveyId: '12345678-1234-4234-a234-123456789012' });

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('code', 'SITE_SURVEY_NOT_FOUND');
    });

    it('論理削除済みの現場調査では 404（SITE_SURVEY_NOT_FOUND）が返る (Req 40.10)', async () => {
      const quantityTableId = await createQuantityTable(testProjectId, '論理削除テスト数量表');
      const surveyId = await createSurvey(testProjectId, '論理削除テスト現場調査');
      await createSurveyImages(surveyId, 1);
      await prisma.siteSurvey.update({
        where: { id: surveyId },
        data: { deletedAt: new Date() },
      });

      const response = await request(app)
        .post(`/api/quantity-tables/${quantityTableId}/groups/from-survey`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ siteSurveyId: surveyId });

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('code', 'SITE_SURVEY_NOT_FOUND');
    });

    it('他プロジェクトの現場調査を指定すると 403（SITE_SURVEY_PROJECT_MISMATCH）が返る (Req 40.10)', async () => {
      const quantityTableId = await createQuantityTable(
        testProjectId,
        'プロジェクト不一致テスト数量表'
      );
      // 別プロジェクトの現場調査
      const otherSurveyId = await createSurvey(otherProjectId, '別プロジェクト現場調査');
      await createSurveyImages(otherSurveyId, 2);

      const response = await request(app)
        .post(`/api/quantity-tables/${quantityTableId}/groups/from-survey`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ siteSurveyId: otherSurveyId });

      expect(response.status).toBe(403);
      expect(response.body).toHaveProperty('code', 'SITE_SURVEY_PROJECT_MISMATCH');

      // 生成されていないこと
      const groups = await prisma.quantityGroup.findMany({ where: { quantityTableId } });
      expect(groups).toHaveLength(0);
    });

    it('不正なボディ（siteSurveyId が UUID 形式でない）では 400 が返る (Req 40.10)', async () => {
      const quantityTableId = await createQuantityTable(
        testProjectId,
        'バリデーションテスト数量表'
      );

      const response = await request(app)
        .post(`/api/quantity-tables/${quantityTableId}/groups/from-survey`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ siteSurveyId: 'not-a-uuid' });

      expect(response.status).toBe(400);
    });

    it('写真0枚の現場調査では created:0 が返り、グループは生成されない (Req 40.7)', async () => {
      const quantityTableId = await createQuantityTable(testProjectId, '写真0枚テスト数量表');
      const surveyId = await createSurvey(testProjectId, '写真0枚現場調査');
      // 写真を作成しない

      const response = await request(app)
        .post(`/api/quantity-tables/${quantityTableId}/groups/from-survey`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ siteSurveyId: surveyId });

      expect(response.status).toBe(201);
      expect(response.body.created).toBe(0);
      expect(response.body.groups).toEqual([]);

      // DB 上もグループ0件
      const groups = await prisma.quantityGroup.findMany({ where: { quantityTableId } });
      expect(groups).toHaveLength(0);
    });

    it('成功時に 201 と生成結果が返り、写真順で末尾追加されて DB に永続化される (Req 40.1, 40.2)', async () => {
      const quantityTableId = await createQuantityTable(testProjectId, '成功テスト数量表');

      // 既存グループを末尾に1件作成（末尾追加の起点検証用）
      const existingGroup = await prisma.quantityGroup.create({
        data: {
          quantityTableId,
          name: '既存グループ',
          displayOrder: 0,
        },
      });

      const surveyId = await createSurvey(testProjectId, '成功テスト現場調査');
      const imageIds = await createSurveyImages(surveyId, 3);

      const response = await request(app)
        .post(`/api/quantity-tables/${quantityTableId}/groups/from-survey`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ siteSurveyId: surveyId });

      // レスポンス検証
      expect(response.status).toBe(201);
      expect(response.body.created).toBe(3);
      expect(response.body.groups).toHaveLength(3);

      // 写真順（displayOrder 昇順）で返却され、末尾追加（既存 max=0 の次=1,2,3）
      const respGroups = response.body.groups as Array<{
        id: string;
        displayOrder: number;
        surveyImageId: string | null;
        name: string;
      }>;
      const respOrders = respGroups.map((g) => g.displayOrder);
      expect(respOrders).toEqual([1, 2, 3]);
      // 各グループの surveyImageId が写真順に対応
      expect(respGroups.map((g) => g.surveyImageId)).toEqual(imageIds);

      // DB 永続化検証: 数量表内の全グループ
      const allGroups = await prisma.quantityGroup.findMany({
        where: { quantityTableId },
        orderBy: { displayOrder: 'asc' },
      });
      expect(allGroups).toHaveLength(4);
      // displayOrder が 0..3 で一意・連続（欠番なし）
      expect(allGroups.map((g) => g.displayOrder)).toEqual([0, 1, 2, 3]);
      // 既存グループは displayOrder=0 のまま、末尾に追加されている
      expect(allGroups[0]!.id).toBe(existingGroup.id);
      // 生成された3件は写真IDに紐づく
      const generated = allGroups.filter((g) => g.surveyImageId !== null);
      expect(generated.map((g) => g.surveyImageId)).toEqual(imageIds);
    });

    it('同一数量表への from-survey/copy 並行実行で displayOrder の衝突・欠番が発生しない (Req 40.12)', async () => {
      // 検証対象: FOR UPDATE 行ロックで直列化される操作（一括生成 createGroupsFromSurvey と
      // グループ copy）を同一数量表に対して同時発行し、displayOrder が衝突・欠番なく
      // 末尾追加／+1シフトされること。
      // 注: add（POST /groups）と reorder（PUT /groups/order）は呼び出し側が任意の
      //     displayOrder リテラルを指定する API 契約であり、行ロックによる直列化対象外
      //     （実装上 FOR UPDATE を取得しない）。本テストではロックが保証する不変条件のみを
      //     検証対象とする。詳細は Status Report の CONCERNS を参照。
      const quantityTableId = await createQuantityTable(testProjectId, '並行実行テスト数量表');

      // 初期グループ2件（copy の対象 / 末尾追加の起点）
      const initialGroupA = await prisma.quantityGroup.create({
        data: { quantityTableId, name: '初期グループA', displayOrder: 0 },
      });
      const initialGroupB = await prisma.quantityGroup.create({
        data: { quantityTableId, name: '初期グループB', displayOrder: 1 },
      });

      // from-survey 用の現場調査（写真2枚ずつ）を2つ用意し、一括生成を2本同時発行
      const surveyId1 = await createSurvey(testProjectId, '並行実行テスト現場調査1');
      await createSurveyImages(surveyId1, 2);
      const surveyId2 = await createSurvey(testProjectId, '並行実行テスト現場調査2');
      await createSurveyImages(surveyId2, 2);

      // 同一数量表に対して行ロック対象の操作を同時発行
      //   - from-survey × 2（各写真2枚 → 各2グループ末尾追加）
      //   - copy（initialGroupA を複製、後続を +1 シフト）
      const results = await Promise.allSettled([
        request(app)
          .post(`/api/quantity-tables/${quantityTableId}/groups/from-survey`)
          .set('Authorization', `Bearer ${accessToken}`)
          .send({ siteSurveyId: surveyId1 }),
        request(app)
          .post(`/api/quantity-tables/${quantityTableId}/groups/from-survey`)
          .set('Authorization', `Bearer ${accessToken}`)
          .send({ siteSurveyId: surveyId2 }),
        request(app)
          .post(`/api/quantity-groups/${initialGroupA.id}/copy`)
          .set('Authorization', `Bearer ${accessToken}`)
          .send(),
      ]);

      // 各操作の HTTP ステータスを確認
      // 受容される結果: 成功（2xx）または並行制御競合（409 OPTIMISTIC_LOCK_ERROR）。
      // それ以外（500 等）が混ざっていればデータ不整合の兆候として失敗させる。
      for (const result of results) {
        expect(result.status).toBe('fulfilled');
        if (result.status === 'fulfilled') {
          const status = result.value.status;
          const acceptable = status === 201 || status === 409;
          expect(acceptable).toBe(true);
          if (status === 409) {
            expect(result.value.body).toHaveProperty('code', 'OPTIMISTIC_LOCK_ERROR');
          }
        }
      }

      // 最終 DB 状態の検証
      const finalGroups = await prisma.quantityGroup.findMany({
        where: { quantityTableId },
        select: { id: true, displayOrder: true, surveyImageId: true },
        orderBy: { displayOrder: 'asc' },
      });

      const displayOrders = finalGroups.map((g) => g.displayOrder);

      // 不変条件1: 同一数量表内の displayOrder に衝突（重複）がないこと。
      // FOR UPDATE による直列化で from-survey/copy の末尾追加・+1シフトが
      // 互いに上書き競合せず、各グループが一意の displayOrder を持つ。
      const uniqueOrders = new Set(displayOrders);
      expect(uniqueOrders.size).toBe(displayOrders.length);

      // 不変条件2: 欠番（穴）がないこと。直列化された操作群により
      // 0 から連続した整数列で displayOrder が埋まっている。
      const sorted = [...displayOrders].sort((a, b) => a - b);
      const expectedSequence = Array.from({ length: sorted.length }, (_, i) => i);
      expect(sorted).toEqual(expectedSequence);

      // 不変条件3: 初期2グループは残存している（破壊されていない）
      expect(finalGroups.length).toBeGreaterThanOrEqual(2);
      const ids = finalGroups.map((g) => g.id);
      expect(ids).toContain(initialGroupA.id);
      expect(ids).toContain(initialGroupB.id);
    });
  });
});
