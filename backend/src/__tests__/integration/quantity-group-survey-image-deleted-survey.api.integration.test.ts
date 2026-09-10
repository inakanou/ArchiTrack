/**
 * @fileoverview 数量グループの現調画像紐付けにおける親の現場調査の論理削除の検査（統合検証）
 *
 * 対象は数量グループの現調画像紐付けを行う3経路である。いずれも親の現場調査が
 * 論理削除済みの現調画像を指した場合は 410（code: SURVEY_DELETED）で拒む。
 *
 * 1. POST /api/quantity-tables/:quantityTableId/groups （数量グループの新規作成）
 * 2. PUT  /api/quantity-groups/:id                     （数量グループの更新）
 * 3. PUT  /api/quantity-tables/:id/save                （編集画面のフル状態同期保存）
 *
 * 1と2は QuantityGroupService.validateSurveyImage を、3は
 * QuantityTableService.saveDraft の紐付け検査を通る。3が編集画面から実際に叩かれる
 * 経路であり、1と2は画面からは使われていない。
 *
 * 応答の形は backend/src/utils/survey-deleted-guard.ts の sendSurveyDeletedProblem に
 * 由来し、site-survey スペックが同じ機構で塞いでいる5経路と同一である。
 *
 * Task 81.1: 数量グループの現調画像の検証に親の論理削除の検査を加える
 *
 * @module __tests__/integration/quantity-group-survey-image-deleted-survey.api.integration.test
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

describe('Quantity Group Survey Image Deleted Survey Guard Integration Tests', () => {
  let prisma: PrismaClient;

  const PERMITTED_EMAIL = 'test-qg-deleted-survey-permitted@example.com';
  const PASSWORD = 'TestPassword123!';

  let accessToken: string;
  let testUserId: string;
  let testProjectId: string;

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
        displayName: 'QG Deleted Survey Permitted User',
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

  const createSurvey = async (name: string): Promise<string> => {
    const survey = await prisma.siteSurvey.create({
      data: {
        projectId: testProjectId,
        name,
        surveyDate: new Date('2025-01-15'),
      },
    });
    return survey.id;
  };

  const createSurveyImage = async (surveyId: string): Promise<string> => {
    const image = await prisma.surveyImage.create({
      data: {
        surveyId,
        originalPath: `surveys/test/${surveyId}.jpg`,
        thumbnailPath: `surveys/test/${surveyId}-thumb.jpg`,
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
      data: { projectId: testProjectId, name },
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

  /** 親を論理削除済みにした現調画像を用意する */
  const createImageUnderDeletedSurvey = async (
    name: string
  ): Promise<{ surveyId: string; imageId: string }> => {
    const surveyId = await createSurvey(name);
    const imageId = await createSurveyImage(surveyId);
    await prisma.siteSurvey.update({
      where: { id: surveyId },
      data: { deletedAt: new Date() },
    });
    return { surveyId, imageId };
  };

  /** 親が生きている現調画像を用意する（対照） */
  const createImageUnderLiveSurvey = async (name: string): Promise<string> => {
    const surveyId = await createSurvey(name);
    return await createSurveyImage(surveyId);
  };

  /** SURVEY_DELETED の応答本文（survey-deleted-guard の形） */
  const expectedProblem = (surveyId: string): Record<string, unknown> => ({
    type: 'https://architrack.example.com/problems/survey-deleted',
    title: 'SURVEY DELETED',
    status: 410,
    detail: `削除された現場調査の画像は紐付けできません: ${surveyId}`,
    code: 'SURVEY_DELETED',
    surveyId,
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
        name: '現調画像紐付けの論理削除検査テストプロジェクト',
        status: 'PREPARING',
        salesPersonId: testUserId,
        createdById: testUserId,
      },
    });
    testProjectId = project.id;
  });

  afterAll(async () => {
    if (testProjectId) {
      await prisma.project.deleteMany({ where: { id: testProjectId } });
    }
    await prisma.user.deleteMany({ where: { email: PERMITTED_EMAIL } });

    await prisma.$disconnect();
    redis.disconnect();
  });

  beforeEach(async () => {
    await prisma.quantityTable.deleteMany({ where: { projectId: testProjectId } });
    await prisma.siteSurvey.deleteMany({ where: { projectId: testProjectId } });
  });

  describe('POST /api/quantity-tables/:quantityTableId/groups', () => {
    it('親の現場調査が論理削除済みの現調画像を指すと 410（SURVEY_DELETED）が返る', async () => {
      const quantityTableId = await createQuantityTable('新規作成の論理削除検査');
      const { surveyId, imageId } = await createImageUnderDeletedSurvey('新規作成対象の現場調査');

      const response = await request(app)
        .post(`/api/quantity-tables/${quantityTableId}/groups`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'グループ', surveyImageId: imageId, displayOrder: 0 });

      expect(response.status).toBe(410);
      expect(response.body).toEqual(expectedProblem(surveyId));

      const persisted = await prisma.quantityGroup.count({ where: { quantityTableId } });
      expect(persisted).toBe(0);
    });

    it('親の現場調査が生きている現調画像は従来どおり 201 で紐付けできる（対照）', async () => {
      const quantityTableId = await createQuantityTable('新規作成の対照');
      const imageId = await createImageUnderLiveSurvey('新規作成対照の現場調査');

      const response = await request(app)
        .post(`/api/quantity-tables/${quantityTableId}/groups`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'グループ', surveyImageId: imageId, displayOrder: 0 });

      expect(response.status).toBe(201);
      expect(response.body.surveyImageId).toBe(imageId);
    });
  });

  describe('PUT /api/quantity-groups/:id', () => {
    it('親の現場調査が論理削除済みの現調画像への差し替えは 410（SURVEY_DELETED）が返る', async () => {
      const quantityTableId = await createQuantityTable('更新の論理削除検査');
      const { surveyId, imageId } = await createImageUnderDeletedSurvey('更新対象の現場調査');

      const group = await prisma.quantityGroup.create({
        data: { quantityTableId, name: '既存グループ', displayOrder: 0 },
      });

      const response = await request(app)
        .put(`/api/quantity-groups/${group.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          surveyImageId: imageId,
          expectedUpdatedAt: group.updatedAt.toISOString(),
        });

      expect(response.status).toBe(410);
      expect(response.body).toEqual(expectedProblem(surveyId));

      const persisted = await prisma.quantityGroup.findUnique({ where: { id: group.id } });
      expect(persisted?.surveyImageId).toBeNull();
    });

    it('親の現場調査が生きている現調画像への差し替えは従来どおり 200 で通る（対照）', async () => {
      const quantityTableId = await createQuantityTable('更新の対照');
      const imageId = await createImageUnderLiveSurvey('更新対照の現場調査');

      const group = await prisma.quantityGroup.create({
        data: { quantityTableId, name: '既存グループ', displayOrder: 0 },
      });

      const response = await request(app)
        .put(`/api/quantity-groups/${group.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          surveyImageId: imageId,
          expectedUpdatedAt: group.updatedAt.toISOString(),
        });

      expect(response.status).toBe(200);
      expect(response.body.surveyImageId).toBe(imageId);
    });
  });

  describe('PUT /api/quantity-tables/:id/save', () => {
    it('親の現場調査が論理削除済みの現調画像を含む保存は 410（SURVEY_DELETED）で中断する', async () => {
      const quantityTableId = await createQuantityTable('フル状態同期保存の論理削除検査');
      const { surveyId, imageId } = await createImageUnderDeletedSurvey('保存対象の現場調査');
      const expectedUpdatedAt = await getExpectedUpdatedAt(quantityTableId);

      const response = await request(app)
        .put(`/api/quantity-tables/${quantityTableId}/save`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          expectedUpdatedAt,
          name: 'フル状態同期保存の論理削除検査',
          groups: [
            {
              id: null,
              name: 'グループ',
              surveyImageId: imageId,
              displayOrder: 0,
              items: [],
            },
          ],
        });

      expect(response.status).toBe(410);
      expect(response.body).toEqual(expectedProblem(surveyId));

      // 書き込み前に中断しており、グループは1件も永続化されていない
      const persisted = await prisma.quantityGroup.count({ where: { quantityTableId } });
      expect(persisted).toBe(0);
    });

    it('複数グループのうち1件だけが該当しても保存全体が中断する', async () => {
      const quantityTableId = await createQuantityTable('フル状態同期保存の部分該当');
      const liveImageId = await createImageUnderLiveSurvey('保存対象の生存する現場調査');
      const { surveyId, imageId } =
        await createImageUnderDeletedSurvey('保存対象の削除済み現場調査');
      const expectedUpdatedAt = await getExpectedUpdatedAt(quantityTableId);

      const response = await request(app)
        .put(`/api/quantity-tables/${quantityTableId}/save`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          expectedUpdatedAt,
          name: 'フル状態同期保存の部分該当',
          groups: [
            { id: null, name: '生存', surveyImageId: liveImageId, displayOrder: 0, items: [] },
            { id: null, name: '該当', surveyImageId: imageId, displayOrder: 1, items: [] },
          ],
        });

      expect(response.status).toBe(410);
      expect(response.body).toEqual(expectedProblem(surveyId));

      const persisted = await prisma.quantityGroup.count({ where: { quantityTableId } });
      expect(persisted).toBe(0);
    });

    it('親の現場調査が生きている現調画像は従来どおり 200 で保存できる（対照）', async () => {
      const quantityTableId = await createQuantityTable('フル状態同期保存の対照');
      const imageId = await createImageUnderLiveSurvey('保存対照の現場調査');
      const expectedUpdatedAt = await getExpectedUpdatedAt(quantityTableId);

      const response = await request(app)
        .put(`/api/quantity-tables/${quantityTableId}/save`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          expectedUpdatedAt,
          name: 'フル状態同期保存の対照',
          groups: [
            { id: null, name: 'グループ', surveyImageId: imageId, displayOrder: 0, items: [] },
          ],
        });

      expect(response.status).toBe(200);
      expect(response.body.groups).toHaveLength(1);
      expect(response.body.groups[0].surveyImageId).toBe(imageId);
    });

    it('現調画像を紐付けないグループだけの保存は従来どおり 200 で通る（対照）', async () => {
      const quantityTableId = await createQuantityTable('フル状態同期保存の未紐付け対照');
      const expectedUpdatedAt = await getExpectedUpdatedAt(quantityTableId);

      const response = await request(app)
        .put(`/api/quantity-tables/${quantityTableId}/save`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          expectedUpdatedAt,
          name: 'フル状態同期保存の未紐付け対照',
          groups: [{ id: null, name: 'グループ', surveyImageId: null, displayOrder: 0, items: [] }],
        });

      expect(response.status).toBe(200);
      expect(response.body.groups).toHaveLength(1);
      expect(response.body.groups[0].surveyImageId).toBeNull();
    });
  });
});
