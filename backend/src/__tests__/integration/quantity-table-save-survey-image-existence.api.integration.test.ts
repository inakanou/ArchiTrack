/**
 * @fileoverview フル状態同期保存における現調画像の存在の検査（統合検証）
 *
 * 対象は `PUT /api/quantity-tables/:id/save`（編集画面のフル状態同期保存）である。
 * payload が実在しない現調画像IDを指した場合、保存は書き込み前に中断し
 * 404（code: SURVEY_IMAGE_NOT_FOUND）で拒む。
 *
 * 本タスク以前は、この要求が外部キー制約違反として書き込み時に表面化し
 * 500（code: QUANTITY_TABLE_SAVE_ERROR / detail: 保存処理中にエラーが発生しました）に
 * なっていた。トランザクションは ROLLBACK されるためデータは壊れないが、
 * クライアントの誤りに対する応答としては妥当でない。本タスクが変えるのは応答だけである。
 *
 * 応答は `QuantityGroupService.validateSurveyImage` を通る2経路
 * （POST /api/quantity-tables/:quantityTableId/groups と PUT /api/quantity-groups/:id）へ
 * 揃える。同経路は同じ不変条件（指した現調画像が存在すること）を
 * `SurveyImageNotFoundError`（404 / SURVEY_IMAGE_NOT_FOUND）で拒んでおり、保存経路だけ
 * 別の応答を返さない。ここでは `type` / `title` / `status` / `detail` / `code` の
 * **応答本文の全項目**を突き合わせる（Task 86.1 の所属違反と異なり、本タスクは保存経路に
 * 専用の写しを新設するため `type` も揃えられる）。
 *
 * 存在しない画像IDには RFC4122 準拠のUUID（バリアント桁が 8/9/a/b）を用いる。
 * 不正バリアントはスキーマ段階で 400（VALIDATION_ERROR）となり、別の欠陥と取り違える。
 *
 * Task 86.2: 保存経路が存在しない現調画像を拒むようにする
 *
 * @module __tests__/integration/quantity-table-save-survey-image-existence.api.integration.test
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

describe('Quantity Table Save Survey Image Existence Integration Tests', () => {
  let prisma: PrismaClient;

  const PERMITTED_EMAIL = 'test-qt-save-image-existence@example.com';
  const PASSWORD = 'TestPassword123!';

  /** 実在しない現調画像ID（RFC4122 準拠。バリアント桁は 'a'） */
  const MISSING_IMAGE_ID = '123e4567-e89b-42d3-a456-426614174099';
  /** 実在しない現調画像ID（2件目。複数欠落の検証用） */
  const ANOTHER_MISSING_IMAGE_ID = '123e4567-e89b-42d3-b456-426614174098';

  let accessToken: string;
  let testUserId: string;
  let projectId: string;

  const hashPassword = async (): Promise<string> => {
    return await (
      await import('@node-rs/argon2')
    ).hash(PASSWORD, {
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4,
    });
  };

  const setupPermittedUser = async (): Promise<{ token: string; userId: string }> => {
    const passwordHash = await hashPassword();

    const user = await prisma.user.create({
      data: {
        email: PERMITTED_EMAIL,
        displayName: 'QT Save Image Existence User',
        passwordHash,
      },
    });

    const userRole = await prisma.role.findUnique({ where: { name: 'user' } });

    if (userRole) {
      await prisma.userRole.create({
        data: { userId: user.id, roleId: userRole.id },
      });
    }

    // 数量表関連の権限を作成（seedPermissions に含まれていないため）
    await prisma.permission.createMany({
      data: [
        { resource: 'quantity_table', action: 'create', description: '数量表の作成' },
        { resource: 'quantity_table', action: 'read', description: '数量表の閲覧' },
        { resource: 'quantity_table', action: 'update', description: '数量表の更新' },
        { resource: 'quantity_table', action: 'delete', description: '数量表の削除' },
      ],
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

  /** 当該プロジェクトの配下に現調画像を1件用意する */
  const createSurveyImage = async (name: string): Promise<string> => {
    const survey = await prisma.siteSurvey.create({
      data: {
        projectId,
        name,
        surveyDate: new Date('2025-01-15'),
      },
    });
    const image = await prisma.surveyImage.create({
      data: {
        surveyId: survey.id,
        originalPath: `surveys/test/${survey.id}.jpg`,
        thumbnailPath: `surveys/test/${survey.id}-thumb.jpg`,
        fileName: 'image.jpg',
        fileSize: 1024,
        width: 800,
        height: 600,
        displayOrder: 0,
      },
    });
    return image.id;
  };

  const createQuantityTable = async (name: string): Promise<string> => {
    const quantityTable = await prisma.quantityTable.create({
      data: { projectId, name },
    });
    return quantityTable.id;
  };

  /** フル状態同期保存が要求する楽観ロック値を取り出す */
  const getExpectedUpdatedAt = async (quantityTableId: string): Promise<string> => {
    const quantityTable = await prisma.quantityTable.findUniqueOrThrow({
      where: { id: quantityTableId },
      select: { updatedAt: true },
    });
    return quantityTable.updatedAt.toISOString();
  };

  /** 存在しない現調画像の応答本文（SurveyImageNotFoundError の形） */
  const expectedProblem = (imageId: string): Record<string, unknown> => ({
    type: 'https://architrack.example.com/problems/survey-image-not-found',
    title: 'Survey Image Not Found',
    status: 404,
    detail: `Survey image not found: ${imageId}`,
    code: 'SURVEY_IMAGE_NOT_FOUND',
  });

  beforeAll(async () => {
    prisma = getPrismaClient();
    await initRedis();
    await seedRoles(prisma);
    await seedPermissions(prisma);
    await seedRolePermissions(prisma);

    const auth = await setupPermittedUser();
    accessToken = auth.token;
    testUserId = auth.userId;

    const project = await prisma.project.create({
      data: {
        name: '現調画像の存在検査テスト：プロジェクト',
        status: 'PREPARING',
        salesPersonId: testUserId,
        createdById: testUserId,
      },
    });
    projectId = project.id;
  });

  afterAll(async () => {
    if (projectId) {
      await prisma.project.deleteMany({ where: { id: projectId } });
    }
    await prisma.user.deleteMany({ where: { email: PERMITTED_EMAIL } });

    await prisma.$disconnect();
    redis.disconnect();
  });

  beforeEach(async () => {
    await prisma.quantityTable.deleteMany({ where: { projectId } });
    await prisma.siteSurvey.deleteMany({ where: { projectId } });
  });

  describe('PUT /api/quantity-tables/:id/save', () => {
    it('存在しない現調画像を含む保存は 404 で中断し、グループを永続化しない', async () => {
      const quantityTableId = await createQuantityTable('存在検査');
      const expectedUpdatedAt = await getExpectedUpdatedAt(quantityTableId);

      const response = await request(app)
        .put(`/api/quantity-tables/${quantityTableId}/save`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          expectedUpdatedAt,
          name: '存在検査',
          groups: [
            {
              id: null,
              name: 'グループ',
              surveyImageId: MISSING_IMAGE_ID,
              displayOrder: 0,
              items: [],
            },
          ],
        });

      expect(response.status).toBe(404);
      expect(response.body).toEqual(expectedProblem(MISSING_IMAGE_ID));

      // 書き込み前に中断しており、グループは1件も永続化されていない
      const persisted = await prisma.quantityGroup.findMany({
        where: { quantityTableId },
        select: { id: true, surveyImageId: true },
      });
      expect(persisted).toEqual([]);
    });

    it('複数グループのうち1件だけが存在しない画像でも保存全体が中断する', async () => {
      const quantityTableId = await createQuantityTable('存在検査の部分該当');
      const existingImageId = await createSurveyImage('部分該当の現場調査');
      const expectedUpdatedAt = await getExpectedUpdatedAt(quantityTableId);

      const response = await request(app)
        .put(`/api/quantity-tables/${quantityTableId}/save`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          expectedUpdatedAt,
          name: '存在検査の部分該当',
          groups: [
            {
              id: null,
              name: '実在する画像',
              surveyImageId: existingImageId,
              displayOrder: 0,
              items: [],
            },
            {
              id: null,
              name: '存在しない画像',
              surveyImageId: MISSING_IMAGE_ID,
              displayOrder: 1,
              items: [],
            },
          ],
        });

      expect(response.status).toBe(404);
      expect(response.body).toEqual(expectedProblem(MISSING_IMAGE_ID));

      const persisted = await prisma.quantityGroup.count({ where: { quantityTableId } });
      expect(persisted).toBe(0);
    });

    it('存在しない画像が複数あるときは payload で先に現れたものを名指す', async () => {
      const quantityTableId = await createQuantityTable('存在検査の複数欠落');
      const expectedUpdatedAt = await getExpectedUpdatedAt(quantityTableId);

      const response = await request(app)
        .put(`/api/quantity-tables/${quantityTableId}/save`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          expectedUpdatedAt,
          name: '存在検査の複数欠落',
          groups: [
            {
              id: null,
              name: '欠落1',
              surveyImageId: MISSING_IMAGE_ID,
              displayOrder: 0,
              items: [],
            },
            {
              id: null,
              name: '欠落2',
              surveyImageId: ANOTHER_MISSING_IMAGE_ID,
              displayOrder: 1,
              items: [],
            },
          ],
        });

      expect(response.status).toBe(404);
      expect(response.body).toEqual(expectedProblem(MISSING_IMAGE_ID));
    });

    it('実在する現調画像は従来どおり 200 で保存できる（対照）', async () => {
      const quantityTableId = await createQuantityTable('存在検査の対照');
      const existingImageId = await createSurveyImage('対照の現場調査');
      const expectedUpdatedAt = await getExpectedUpdatedAt(quantityTableId);

      const response = await request(app)
        .put(`/api/quantity-tables/${quantityTableId}/save`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          expectedUpdatedAt,
          name: '存在検査の対照',
          groups: [
            {
              id: null,
              name: 'グループ',
              surveyImageId: existingImageId,
              displayOrder: 0,
              items: [],
            },
          ],
        });

      expect(response.status).toBe(200);
      expect(response.body.groups).toHaveLength(1);
      expect(response.body.groups[0].surveyImageId).toBe(existingImageId);
    });

    it('存在しない画像の応答は数量グループの紐付け経路（作成・更新）と本文の全項目が一致する', async () => {
      const quantityTableId = await createQuantityTable('経路間の応答の一致');
      const expectedUpdatedAt = await getExpectedUpdatedAt(quantityTableId);

      const existingGroup = await prisma.quantityGroup.create({
        data: { quantityTableId, name: '既存グループ', displayOrder: 0 },
      });

      const createResponse = await request(app)
        .post(`/api/quantity-tables/${quantityTableId}/groups`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'グループ', surveyImageId: MISSING_IMAGE_ID, displayOrder: 1 });

      const updateResponse = await request(app)
        .put(`/api/quantity-groups/${existingGroup.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          surveyImageId: MISSING_IMAGE_ID,
          expectedUpdatedAt: existingGroup.updatedAt.toISOString(),
        });

      const saveResponse = await request(app)
        .put(`/api/quantity-tables/${quantityTableId}/save`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          expectedUpdatedAt,
          name: '経路間の応答の一致',
          groups: [
            {
              id: existingGroup.id,
              name: '既存グループ',
              surveyImageId: MISSING_IMAGE_ID,
              displayOrder: 0,
              items: [],
            },
          ],
        });

      // 同じ不変条件に対して、3経路が同じ応答本文で拒む。突き合わせるのは
      // type / title / status / detail / code の5項目（= 応答本文の全項目）である。
      for (const body of [createResponse.body, updateResponse.body, saveResponse.body]) {
        expect(body).toEqual(expectedProblem(MISSING_IMAGE_ID));
      }
      expect(createResponse.status).toBe(404);
      expect(updateResponse.status).toBe(404);
      expect(saveResponse.status).toBe(404);

      // 保存経路が中断しているため、既存グループの紐付けは変わらない
      const persisted = await prisma.quantityGroup.findUnique({
        where: { id: existingGroup.id },
        select: { surveyImageId: true },
      });
      expect(persisted?.surveyImageId).toBeNull();
    });
  });
});
