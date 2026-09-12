/**
 * @fileoverview 複製の2経路における現調画像の所属の検査（統合検証）
 *
 * 対象は複製の2経路である。
 * - `POST /api/quantity-tables/:id/copy`（数量表のディープコピー。画面から到達する）
 * - `POST /api/quantity-groups/:id/copy`（数量グループのコピー。画面からは到達せず、
 *   認証済みの HTTP クライアントからのみ到達する）
 *
 * どちらも、元のグループが他プロジェクトの現調画像を指していた場合、その紐付けを
 * 複製先へ写さない（`surveyImageId` は `null` になる）。複製そのものは 201 で成功する。
 *
 * **拒む向きを採らない理由**は取得経路（Task 86.3）と同じである。所属違反の紐付けは
 * 取得の時点で `surveyImageId` ごと落ちるため、利用者から見て「紐づけられている写真」
 * ではない。複製全体を拒むと、利用者は開いて編集できる数量表を複製だけできなくなる。
 *
 * **親の現場調査が論理削除された画像の紐付けは、落とさずに写す**（Task 81.1 の不変条件）。
 * 取得経路は所属違反だけを落とし、論理削除の紐付けは落とさない（design.md の
 * `### Error Categories and Responses` の採らなかった案 (h)）。利用者には当該の写真が
 * 見えており、画面には紐付けの解除の導線がある（Task 90.2）。複製で黙って落とすと、
 * 利用者が見ている写真が理由もなく消えることになる。
 *
 * Task 91.1: 複製の2経路で所属違反の紐付けを複製先へ写さないようにする
 *
 * @module __tests__/integration/quantity-table-copy-survey-image-project.api.integration.test
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

describe('Quantity Table / Group Copy Survey Image Project Boundary Integration Tests', () => {
  let prisma: PrismaClient;

  const PERMITTED_EMAIL = 'test-qt-copy-image-project@example.com';
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
        displayName: 'QT Copy Image Project User',
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

  /**
   * 指定プロジェクトの配下に現調画像を1件用意する
   *
   * @param projectId - 現場調査を置くプロジェクト
   * @param name - 現場調査名（検証ごとに一意にする）
   * @param options.surveyDeletedAt - 親の現場調査の論理削除時刻（既定は生存）
   */
  const createSurveyImageIn = async (
    projectId: string,
    name: string,
    options: { surveyDeletedAt?: Date } = {}
  ): Promise<string> => {
    const survey = await prisma.siteSurvey.create({
      data: {
        projectId,
        name,
        surveyDate: new Date('2025-01-15'),
        deletedAt: options.surveyDeletedAt ?? null,
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

  /**
   * 現調画像を紐付けた数量グループを1件持つ数量表を用意する
   *
   * 所属違反の紐付けは Task 86.1 以降 API からは作れないため、データベースへ直接書く。
   *
   * @param name - 数量表名
   * @param surveyImageId - 紐付ける現調画像ID
   */
  const createQuantityTableWithLinkedGroup = async (
    name: string,
    surveyImageId: string
  ): Promise<{ quantityTableId: string; quantityGroupId: string }> => {
    const quantityTable = await prisma.quantityTable.create({
      data: { projectId: ownerProjectId, name },
    });
    const quantityGroup = await prisma.quantityGroup.create({
      data: {
        quantityTableId: quantityTable.id,
        name: '写真を持つグループ',
        surveyImageId,
        displayOrder: 0,
      },
    });
    return { quantityTableId: quantityTable.id, quantityGroupId: quantityGroup.id };
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

    ownerProjectId = await createProject('複製の所属検査テスト：数量表側プロジェクト');
    foreignProjectId = await createProject('複製の所属検査テスト：画像側プロジェクト');
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

  describe('POST /api/quantity-tables/:id/copy', () => {
    it('他プロジェクトの現調画像の紐付けは複製先へ写さず、複製自体は 201 で成功する', async () => {
      const foreignImageId = await createSurveyImageIn(
        foreignProjectId,
        '数量表コピーの別プロジェクト現場調査'
      );
      const { quantityTableId, quantityGroupId } = await createQuantityTableWithLinkedGroup(
        '所属違反を含む数量表',
        foreignImageId
      );

      const response = await request(app)
        .post(`/api/quantity-tables/${quantityTableId}/copy`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: '所属違反を含む数量表のコピー' });

      expect(response.status).toBe(201);

      // 複製先には所属違反の行が1件も書き込まれていない
      const copiedGroups = await prisma.quantityGroup.findMany({
        where: { quantityTableId: response.body.id },
        select: { name: true, surveyImageId: true },
      });
      expect(copiedGroups).toEqual([{ name: '写真を持つグループ', surveyImageId: null }]);

      // 元の数量表は書き換えない（複製は元に触れない）
      const sourceGroup = await prisma.quantityGroup.findUniqueOrThrow({
        where: { id: quantityGroupId },
        select: { surveyImageId: true },
      });
      expect(sourceGroup.surveyImageId).toBe(foreignImageId);
    });

    it('同一プロジェクトの現調画像の紐付けは複製先でも維持する（REQ-17.7 の対照）', async () => {
      const ownImageId = await createSurveyImageIn(
        ownerProjectId,
        '数量表コピーの同一プロジェクト現場調査'
      );
      const { quantityTableId } = await createQuantityTableWithLinkedGroup(
        '同一プロジェクトの写真を含む数量表',
        ownImageId
      );

      const response = await request(app)
        .post(`/api/quantity-tables/${quantityTableId}/copy`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: '同一プロジェクトの写真を含む数量表のコピー' });

      expect(response.status).toBe(201);

      const copiedGroups = await prisma.quantityGroup.findMany({
        where: { quantityTableId: response.body.id },
        select: { surveyImageId: true },
      });
      expect(copiedGroups).toEqual([{ surveyImageId: ownImageId }]);
    });

    it('親の現場調査が論理削除された現調画像の紐付けは、落とさずに複製する（Task 81.1 の不変条件）', async () => {
      // 論理削除は所属違反と違い、利用者の権限の内側で起きた出来事である。取得経路は
      // これを落とさず、画面には紐付けの解除の導線がある（Task 90.2）。複製で黙って
      // 落とすと、利用者が見ている写真が理由もなく消える
      const deletedSurveyImageId = await createSurveyImageIn(
        ownerProjectId,
        '数量表コピーの論理削除済み現場調査',
        { surveyDeletedAt: new Date('2026-01-06T00:00:00.000Z') }
      );
      const { quantityTableId } = await createQuantityTableWithLinkedGroup(
        '論理削除済み現場調査の写真を含む数量表',
        deletedSurveyImageId
      );

      const response = await request(app)
        .post(`/api/quantity-tables/${quantityTableId}/copy`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: '論理削除済み現場調査の写真を含む数量表のコピー' });

      expect(response.status).toBe(201);

      const copiedGroups = await prisma.quantityGroup.findMany({
        where: { quantityTableId: response.body.id },
        select: { surveyImageId: true },
      });
      expect(copiedGroups).toEqual([{ surveyImageId: deletedSurveyImageId }]);
    });
  });

  describe('POST /api/quantity-groups/:id/copy', () => {
    it('他プロジェクトの現調画像の紐付けは複製先へ写さず、複製自体は 201 で成功する', async () => {
      const foreignImageId = await createSurveyImageIn(
        foreignProjectId,
        'グループコピーの別プロジェクト現場調査'
      );
      const { quantityTableId, quantityGroupId } = await createQuantityTableWithLinkedGroup(
        '所属違反を含む数量表（グループコピー）',
        foreignImageId
      );

      const response = await request(app)
        .post(`/api/quantity-groups/${quantityGroupId}/copy`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({});

      expect(response.status).toBe(201);
      expect(response.body.surveyImageId).toBeNull();

      // 複製先の永続化値も所属違反を持たない
      const copiedGroup = await prisma.quantityGroup.findUniqueOrThrow({
        where: { id: response.body.id },
        select: { quantityTableId: true, surveyImageId: true },
      });
      expect(copiedGroup.quantityTableId).toBe(quantityTableId);
      expect(copiedGroup.surveyImageId).toBeNull();

      // 元グループは書き換えない
      const sourceGroup = await prisma.quantityGroup.findUniqueOrThrow({
        where: { id: quantityGroupId },
        select: { surveyImageId: true },
      });
      expect(sourceGroup.surveyImageId).toBe(foreignImageId);
    });

    it('同一プロジェクトの現調画像の紐付けは複製先でも維持する（REQ-38.4 の対照）', async () => {
      const ownImageId = await createSurveyImageIn(
        ownerProjectId,
        'グループコピーの同一プロジェクト現場調査'
      );
      const { quantityGroupId } = await createQuantityTableWithLinkedGroup(
        '同一プロジェクトの写真を含む数量表（グループコピー）',
        ownImageId
      );

      const response = await request(app)
        .post(`/api/quantity-groups/${quantityGroupId}/copy`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({});

      expect(response.status).toBe(201);
      expect(response.body.surveyImageId).toBe(ownImageId);
    });

    it('親の現場調査が論理削除された現調画像の紐付けは、落とさずに複製する（Task 81.1 の不変条件）', async () => {
      const deletedSurveyImageId = await createSurveyImageIn(
        ownerProjectId,
        'グループコピーの論理削除済み現場調査',
        { surveyDeletedAt: new Date('2026-01-06T00:00:00.000Z') }
      );
      const { quantityGroupId } = await createQuantityTableWithLinkedGroup(
        '論理削除済み現場調査の写真を含む数量表（グループコピー）',
        deletedSurveyImageId
      );

      const response = await request(app)
        .post(`/api/quantity-groups/${quantityGroupId}/copy`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({});

      expect(response.status).toBe(201);
      expect(response.body.surveyImageId).toBe(deletedSurveyImageId);
    });
  });
});
