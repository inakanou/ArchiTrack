/**
 * @fileoverview フル状態同期保存における現調画像の所属の検査（統合検証）
 *
 * 対象は `PUT /api/quantity-tables/:id/save`（編集画面のフル状態同期保存）である。
 * payload が当該数量表と別のプロジェクトの現調画像を指した場合、保存は書き込み前に
 * 中断し 400（code: QUANTITY_TABLE_VALIDATION_ERROR）で拒む。
 *
 * 応答は `QuantityGroupService.validateSurveyImage` を通る2経路
 * （POST /api/quantity-tables/:quantityTableId/groups と PUT /api/quantity-groups/:id）へ
 * 揃える。ただし**揃っているのは `status` / `code` / `detail` の3項目に限る**。
 *
 * `type` のみ経路間で異なる。グループ経路は
 * `https://architrack.example.com/problems/validation-error`、保存経路は
 * `https://architrack.example.com/problems/quantity-table-validation-error` を返す。
 *
 * この `type` の差は本タスク（Task 86.1）以前からの既存差である。リポジトリルートで
 * `git log -S'problems/validation-error' -- backend/src/routes/quantity-groups.routes.ts` の
 * 初出は `0ee7c796`（2026-01-16）、
 * `git log -S'problems/quantity-table-validation-error' -- backend/src/routes/quantity-tables.routes.ts`
 * の初出は `628fbe96`（2026-06-06）である（いずれもコミット `c557cfa2` の作業木で
 * 2026-09-11 に実測）。所属の検査を加えた本タスクが持ち込んだ差ではない。
 *
 * 揃えなかった理由: 保存経路の `type` は同一のハンドラが捕まえる**全ての**
 * `QuantityTableValidationError`（文字数・数値範囲・計算整合・所属検証・重複検証）に
 * 掛かる共通の写しである。所属という一つの不変条件のために動かすと、無関係な検証の
 * 応答まで変わる。よって `type` の統一は本タスクの `_Boundary:`（数量表の保存経路に
 * おける現調画像の所属の検査）の外であり、未解決の論点として残る。
 *
 * Task 86.1: 保存経路の現調画像に所属の検査を加える
 *
 * @module __tests__/integration/quantity-table-save-survey-image-project.api.integration.test
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

describe('Quantity Table Save Survey Image Project Boundary Integration Tests', () => {
  let prisma: PrismaClient;

  const PERMITTED_EMAIL = 'test-qt-save-image-project@example.com';
  const PASSWORD = 'TestPassword123!';

  let accessToken: string;
  let testUserId: string;
  /** 数量表を置くプロジェクト */
  let ownerProjectId: string;
  /** 現調画像だけを置く別プロジェクト（所属違反の供給元） */
  let foreignProjectId: string;

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
        displayName: 'QT Save Image Project User',
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

  const createProject = async (name: string): Promise<string> => {
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

  /** 指定プロジェクトの配下に現調画像を1件用意する */
  const createSurveyImageIn = async (projectId: string, name: string): Promise<string> => {
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
      data: { projectId: ownerProjectId, name },
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

  /** 所属違反の応答本文（QuantityTableValidationError の形） */
  const expectedProblem = (): Record<string, unknown> => ({
    type: 'https://architrack.example.com/problems/quantity-table-validation-error',
    title: 'Validation Error',
    status: 400,
    detail: '異なるプロジェクトの現場調査画像は紐付けできません',
    code: 'QUANTITY_TABLE_VALIDATION_ERROR',
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

    ownerProjectId = await createProject('現調画像の所属検査テスト：数量表側プロジェクト');
    foreignProjectId = await createProject('現調画像の所属検査テスト：画像側プロジェクト');
  });

  afterAll(async () => {
    for (const projectId of [ownerProjectId, foreignProjectId]) {
      if (projectId) {
        await prisma.project.deleteMany({ where: { id: projectId } });
      }
    }
    await prisma.user.deleteMany({ where: { email: PERMITTED_EMAIL } });

    await prisma.$disconnect();
    redis.disconnect();
  });

  beforeEach(async () => {
    await prisma.quantityTable.deleteMany({ where: { projectId: ownerProjectId } });
    await prisma.siteSurvey.deleteMany({
      where: { projectId: { in: [ownerProjectId, foreignProjectId] } },
    });
  });

  describe('PUT /api/quantity-tables/:id/save', () => {
    it('他プロジェクトの現調画像を含む保存は 400 で中断し、グループを永続化しない', async () => {
      const quantityTableId = await createQuantityTable('所属検査');
      const foreignImageId = await createSurveyImageIn(
        foreignProjectId,
        '別プロジェクトの現場調査'
      );
      const expectedUpdatedAt = await getExpectedUpdatedAt(quantityTableId);

      const response = await request(app)
        .put(`/api/quantity-tables/${quantityTableId}/save`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          expectedUpdatedAt,
          name: '所属検査',
          groups: [
            {
              id: null,
              name: 'グループ',
              surveyImageId: foreignImageId,
              displayOrder: 0,
              items: [],
            },
          ],
        });

      expect(response.status).toBe(400);
      expect(response.body).toEqual(expectedProblem());

      // 書き込み前に中断しており、グループは1件も永続化されていない
      const persisted = await prisma.quantityGroup.findMany({
        where: { quantityTableId },
        select: { id: true, surveyImageId: true },
      });
      expect(persisted).toEqual([]);
    });

    it('複数グループのうち1件だけが他プロジェクトの画像でも保存全体が中断する', async () => {
      const quantityTableId = await createQuantityTable('所属検査の部分該当');
      const ownImageId = await createSurveyImageIn(ownerProjectId, '同一プロジェクトの現場調査');
      const foreignImageId = await createSurveyImageIn(
        foreignProjectId,
        '部分該当の別プロジェクト現場調査'
      );
      const expectedUpdatedAt = await getExpectedUpdatedAt(quantityTableId);

      const response = await request(app)
        .put(`/api/quantity-tables/${quantityTableId}/save`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          expectedUpdatedAt,
          name: '所属検査の部分該当',
          groups: [
            {
              id: null,
              name: '自プロジェクト',
              surveyImageId: ownImageId,
              displayOrder: 0,
              items: [],
            },
            {
              id: null,
              name: '他プロジェクト',
              surveyImageId: foreignImageId,
              displayOrder: 1,
              items: [],
            },
          ],
        });

      expect(response.status).toBe(400);
      expect(response.body).toEqual(expectedProblem());

      const persisted = await prisma.quantityGroup.count({ where: { quantityTableId } });
      expect(persisted).toBe(0);
    });

    it('同一プロジェクトの現調画像は従来どおり 200 で保存できる（対照）', async () => {
      const quantityTableId = await createQuantityTable('所属検査の対照');
      const ownImageId = await createSurveyImageIn(ownerProjectId, '対照の現場調査');
      const expectedUpdatedAt = await getExpectedUpdatedAt(quantityTableId);

      const response = await request(app)
        .put(`/api/quantity-tables/${quantityTableId}/save`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          expectedUpdatedAt,
          name: '所属検査の対照',
          groups: [
            { id: null, name: 'グループ', surveyImageId: ownImageId, displayOrder: 0, items: [] },
          ],
        });

      expect(response.status).toBe(200);
      expect(response.body.groups).toHaveLength(1);
      expect(response.body.groups[0].surveyImageId).toBe(ownImageId);
    });

    it('所属違反の応答は数量グループの紐付け経路（作成・更新）と status・code・detail が一致する（type のみ既存差で異なる）', async () => {
      const quantityTableId = await createQuantityTable('経路間の応答の一致');
      const foreignImageId = await createSurveyImageIn(
        foreignProjectId,
        '経路比較の別プロジェクト現場調査'
      );
      const expectedUpdatedAt = await getExpectedUpdatedAt(quantityTableId);

      const existingGroup = await prisma.quantityGroup.create({
        data: { quantityTableId, name: '既存グループ', displayOrder: 0 },
      });

      const createResponse = await request(app)
        .post(`/api/quantity-tables/${quantityTableId}/groups`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'グループ', surveyImageId: foreignImageId, displayOrder: 1 });

      const updateResponse = await request(app)
        .put(`/api/quantity-groups/${existingGroup.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          surveyImageId: foreignImageId,
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
              surveyImageId: foreignImageId,
              displayOrder: 0,
              items: [],
            },
          ],
        });

      // 同じ不変条件に対して、3経路が同じ状態コード・code・文言で拒む。
      // `type` は突き合わせない。グループ経路は problems/validation-error、保存経路は
      // problems/quantity-table-validation-error を返しており、本タスク以前からの
      // 既存差である（由来のコミットは本ファイル冒頭の @fileoverview に実測を記した）。
      expect(createResponse.status).toBe(400);
      expect(updateResponse.status).toBe(400);
      expect(saveResponse.status).toBe(400);
      for (const body of [createResponse.body, updateResponse.body, saveResponse.body]) {
        expect(body.status).toBe(400);
        expect(body.code).toBe('QUANTITY_TABLE_VALIDATION_ERROR');
        expect(body.detail).toBe('異なるプロジェクトの現場調査画像は紐付けできません');
      }

      // 保存経路が中断しているため、既存グループの紐付けは変わらない
      const persisted = await prisma.quantityGroup.findUnique({
        where: { id: existingGroup.id },
        select: { surveyImageId: true },
      });
      expect(persisted?.surveyImageId).toBeNull();
    });
  });
});
