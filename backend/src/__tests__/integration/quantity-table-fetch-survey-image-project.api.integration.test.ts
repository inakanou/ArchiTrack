/**
 * @fileoverview 数量表の取得経路における現調画像の所属の検査（統合検証）
 *
 * 対象は `GET /api/quantity-tables/:id`（数量表詳細取得）である。当該数量表と別の
 * プロジェクトの現調画像を指す紐付けが既に永続化されている場合、取得は**その紐付けだけを
 * 落として**数量表を返す。数量表そのものは従来どおり開ける。
 *
 * **前提の作り方**: Task 86.1 が保存経路を塞いだため、API 経由では所属違反の紐付けを
 * 作れない。本検証の前提はいずれも `prisma.quantityGroup.create` による直接の書き込みで
 * 用意する（86.1 より前に永続化された既存の紐付けを模す）。条件付きスキップは行わない。
 *
 * **落としたことは、当該グループのIDだけで利用者へ伝える（Task 86.5）。** Task 86.3 の時点では
 * サーバ側のログにのみ残していた。応答の `droppedSurveyImageLinkGroupIds` が落とした紐付けを
 * 持つグループを名指し、編集画面が告げる。名指すのは当該数量表のグループIDだけで、
 * 他プロジェクトの画像IDは返さない——「他プロジェクトの画像が紐付いていた」ことを告げる
 * こと自体が、利用者の権限の外にある資源の存在を示唆するためである。
 *
 * **拒む向きに倒さなかった理由**: 取得を 4xx で拒むと、既存の所属違反の紐付けを持つ
 * 利用者は数量表を開けなくなる。Task 86.1 が保存を 400 で拒んでいるため、表示も保存も
 * できず解除もできない袋小路になる（tasks.md の Task 86.4 が「86.3 と本節はこの一つの
 * 詰まりの両側」と書いているのはこのためである）。落とす向きに倒し、かつ `surveyImageId`
 * ごと落とすことで、86.4 が未着手の時点でも利用者は数量表を開いて保存でき、その保存で
 * 違反の紐付けが解除される。本ファイルの「取得の応答をそのまま保存できる」検証がその出口を
 * 実測する。
 *
 * Task 86.3: 数量表の取得経路が現調画像の所属を検めない状態を解消する
 *
 * 本ファイルは受入基準番号を名乗らない。守るのはテナント境界であり、本スペックの受入基準
 * として条文化されていないためである（tasks.md の Task 86 節末尾に明記）。
 *
 * @module __tests__/integration/quantity-table-fetch-survey-image-project.api.integration.test
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

describe('Quantity Table Fetch Survey Image Project Boundary Integration Tests', () => {
  let prisma: PrismaClient;

  const PERMITTED_EMAIL = 'test-qt-fetch-image-project@example.com';
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
        displayName: 'QT Fetch Image Project User',
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

  /**
   * 所属違反の紐付けを直接の書き込みで用意する。
   *
   * Task 86.1 以降、保存経路（PUT /:id/save）も数量グループの紐付け経路も同じ条件を
   * 400 で拒むため、API 経由ではこの状態を作れない。86.1 より前に永続化された既存の
   * 紐付けが取得経路で今も返ることを確かめるのが本ファイルの主題であり、その前提は
   * DB へ直接書く以外に作りようがない。
   */
  const linkSurveyImageDirectly = async (
    quantityTableId: string,
    surveyImageId: string,
    name: string,
    displayOrder = 0
  ): Promise<string> => {
    const group = await prisma.quantityGroup.create({
      data: { quantityTableId, name, surveyImageId, displayOrder },
    });
    return group.id;
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

    ownerProjectId = await createProject('取得経路の所属検査テスト：数量表側プロジェクト');
    foreignProjectId = await createProject('取得経路の所属検査テスト：画像側プロジェクト');
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

  describe('GET /api/quantity-tables/:id', () => {
    it('他プロジェクトの現調画像を指す既存の紐付けは写真サマリと surveyImageId を落として返す', async () => {
      const quantityTableId = await createQuantityTable('取得の所属検査');
      const foreignImageId = await createSurveyImageIn(
        foreignProjectId,
        '別プロジェクトの現場調査'
      );
      const groupId = await linkSurveyImageDirectly(quantityTableId, foreignImageId, 'グループ');

      const response = await request(app)
        .get(`/api/quantity-tables/${quantityTableId}`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(200);
      expect(response.body.groups).toHaveLength(1);
      expect(response.body.groups[0].id).toBe(groupId);
      expect(response.body.groups[0].surveyImage).toBeNull();
      expect(response.body.groups[0].surveyImageId).toBeNull();

      // 永続化された紐付けそのものは残っている（落としているのは応答だけである）
      const persisted = await prisma.quantityGroup.findUnique({
        where: { id: groupId },
        select: { surveyImageId: true },
      });
      expect(persisted?.surveyImageId).toBe(foreignImageId);
    });

    it('落とすのは当該の紐付けだけで、数量表は開ける（グループ名・項目・同一プロジェクトの写真は残る）', async () => {
      const quantityTableId = await createQuantityTable('取得の所属検査：部分該当');
      const ownImageId = await createSurveyImageIn(ownerProjectId, '同一プロジェクトの現場調査');
      const foreignImageId = await createSurveyImageIn(
        foreignProjectId,
        '部分該当の別プロジェクト現場調査'
      );
      await linkSurveyImageDirectly(quantityTableId, ownImageId, '自プロジェクト', 0);
      await linkSurveyImageDirectly(quantityTableId, foreignImageId, '他プロジェクト', 1);

      const response = await request(app)
        .get(`/api/quantity-tables/${quantityTableId}`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(200);
      expect(response.body.groups).toHaveLength(2);

      // 同一プロジェクトの写真は従来どおり返る（対照）
      expect(response.body.groups[0].name).toBe('自プロジェクト');
      expect(response.body.groups[0].surveyImageId).toBe(ownImageId);
      expect(response.body.groups[0].surveyImage).not.toBeNull();
      expect(response.body.groups[0].surveyImage.id).toBe(ownImageId);

      // 他プロジェクトの写真だけが落ちる。グループ自体は残る
      expect(response.body.groups[1].name).toBe('他プロジェクト');
      expect(response.body.groups[1].surveyImageId).toBeNull();
      expect(response.body.groups[1].surveyImage).toBeNull();
    });

    // Task 86.5: 落としたことを画面が利用者へ告げられるよう、落とした紐付けを持つグループを
    // 応答で名指す。名指すのは当該数量表のグループIDだけで、他プロジェクトの画像IDは返さない。
    it('落とした紐付けを持つグループを droppedSurveyImageLinkGroupIds で名指し、他プロジェクトの画像IDは返さない（Task 86.5）', async () => {
      const quantityTableId = await createQuantityTable('取得の所属検査：名指し');
      const ownImageId = await createSurveyImageIn(ownerProjectId, '名指しの同一プロジェクト');
      const foreignImageId = await createSurveyImageIn(foreignProjectId, '名指しの別プロジェクト');
      const ownGroupId = await linkSurveyImageDirectly(
        quantityTableId,
        ownImageId,
        '自プロジェクト',
        0
      );
      const foreignGroupId = await linkSurveyImageDirectly(
        quantityTableId,
        foreignImageId,
        '他プロジェクト',
        1
      );

      const response = await request(app)
        .get(`/api/quantity-tables/${quantityTableId}`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(200);
      // 名指すのは落とした側だけ。同一プロジェクトのグループは名指さない
      expect(response.body.droppedSurveyImageLinkGroupIds).toEqual([foreignGroupId]);
      expect(response.body.droppedSurveyImageLinkGroupIds).not.toContain(ownGroupId);
      // 他プロジェクトの画像IDは応答のどこにも現れない（86.3 の不変条件）。
      // 同一プロジェクトの画像IDは現れる（観測器が働いていることの非空証明）
      expect(JSON.stringify(response.body)).not.toContain(foreignImageId);
      expect(JSON.stringify(response.body)).toContain(ownImageId);
    });

    it('取得の応答をそのまま保存すると紐付けが解除され、以後の取得も保存の応答も名指しを持たない（Task 86.5）', async () => {
      const quantityTableId = await createQuantityTable('取得の所属検査：名指しの解消');
      const foreignImageId = await createSurveyImageIn(foreignProjectId, '解消の別プロジェクト');
      const groupId = await linkSurveyImageDirectly(quantityTableId, foreignImageId, 'グループ');

      const fetched = await request(app)
        .get(`/api/quantity-tables/${quantityTableId}`)
        .set('Authorization', `Bearer ${accessToken}`);
      // 前提: 保存前は名指しがある（下の空配列が恒真でないことの非空証明）
      expect(fetched.body.droppedSurveyImageLinkGroupIds).toEqual([groupId]);

      const saved = await request(app)
        .put(`/api/quantity-tables/${quantityTableId}/save`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          expectedUpdatedAt: fetched.body.updatedAt,
          name: fetched.body.name,
          groups: [
            { id: groupId, name: 'グループ', surveyImageId: null, displayOrder: 0, items: [] },
          ],
        });

      expect(saved.status).toBe(200);
      expect(saved.body.droppedSurveyImageLinkGroupIds).toEqual([]);

      const refetched = await request(app)
        .get(`/api/quantity-tables/${quantityTableId}`)
        .set('Authorization', `Bearer ${accessToken}`);
      expect(refetched.body.droppedSurveyImageLinkGroupIds).toEqual([]);
    });

    it('取得の応答をそのまま保存でき、その保存で所属違反の紐付けが解除される（袋小路にならない）', async () => {
      const quantityTableId = await createQuantityTable('取得の所属検査：出口');
      const foreignImageId = await createSurveyImageIn(
        foreignProjectId,
        '出口確認の別プロジェクト現場調査'
      );
      const groupId = await linkSurveyImageDirectly(quantityTableId, foreignImageId, 'グループ');

      const fetched = await request(app)
        .get(`/api/quantity-tables/${quantityTableId}`)
        .set('Authorization', `Bearer ${accessToken}`);
      expect(fetched.status).toBe(200);

      // 画面が行うのと同じく、取得した内容をそのまま保存へ送り返す
      const saved = await request(app)
        .put(`/api/quantity-tables/${quantityTableId}/save`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          expectedUpdatedAt: fetched.body.updatedAt,
          name: fetched.body.name,
          groups: fetched.body.groups.map(
            (group: { id: string; name: string; surveyImageId: string | null }) => ({
              id: group.id,
              name: group.name,
              surveyImageId: group.surveyImageId,
              displayOrder: 0,
              items: [],
            })
          ),
        });

      // Task 86.1 の 400 に阻まれない
      expect(saved.status).toBe(200);

      // 所属違反の紐付けは永続化の側でも解除されている
      const persisted = await prisma.quantityGroup.findUnique({
        where: { id: groupId },
        select: { surveyImageId: true },
      });
      expect(persisted?.surveyImageId).toBeNull();
    });

    it('保存の経路は所属違反を先に拒むため、保存後の再読込が所属違反に出会うことはない', async () => {
      const quantityTableId = await createQuantityTable('取得の所属検査：非対称');
      const foreignImageId = await createSurveyImageIn(
        foreignProjectId,
        '非対称確認の別プロジェクト現場調査'
      );
      const groupId = await linkSurveyImageDirectly(quantityTableId, foreignImageId, 'グループ');
      const expectedUpdatedAt = (
        await prisma.quantityTable.findUniqueOrThrow({
          where: { id: quantityTableId },
          select: { updatedAt: true },
        })
      ).updatedAt.toISOString();

      // 所属違反を保存へ載せると Task 86.1 の検査が書き込み前に中断する。
      // `enrichQuantityTableSignedUrls` を呼ぶ保存後の再読込には到達しない。
      const rejected = await request(app)
        .put(`/api/quantity-tables/${quantityTableId}/save`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          expectedUpdatedAt,
          name: '取得の所属検査：非対称',
          groups: [
            {
              id: groupId,
              name: 'グループ',
              surveyImageId: foreignImageId,
              displayOrder: 0,
              items: [],
            },
          ],
        });

      expect(rejected.status).toBe(400);
      expect(rejected.body.code).toBe('QUANTITY_TABLE_VALIDATION_ERROR');
      expect(rejected.body.detail).toBe('異なるプロジェクトの現場調査画像は紐付けできません');

      // 保存が通る唯一の道は紐付けを外すことであり、その応答（= 保存後の再読込）には
      // 所属違反が含まれ得ない。取得経路の検査が実際に効くのは GET の側だけである。
      const accepted = await request(app)
        .put(`/api/quantity-tables/${quantityTableId}/save`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          expectedUpdatedAt,
          name: '取得の所属検査：非対称',
          groups: [
            { id: groupId, name: 'グループ', surveyImageId: null, displayOrder: 0, items: [] },
          ],
        });

      expect(accepted.status).toBe(200);
      expect(accepted.body.groups[0].surveyImageId).toBeNull();
      expect(accepted.body.groups[0].surveyImage).toBeNull();
    });
  });
});
