/**
 * @fileoverview 現場調査・画像・注釈の API への案件の閲覧範囲の適用の統合検証（site-survey タスク119.1）
 *
 * 本物のアプリ（app.ts のルート・authenticate・requirePermission・requireProjectScope・共有の
 * ProjectScopeService と RBACService）と、テスト用の実データベースを通す。画像の実体は置かず、
 * 画像の行だけを作る（テスト環境のローカルストレージは実体の有無を問わず表示元の URL を発行する）。
 *
 * Requirements (site-survey):
 * - 39.1: 範囲内（営業担当者・工事担当者・作成者、全案件閲覧の権限）は従来どおり使える
 * - 39.2: 範囲外の ID 指定は不在と同じ 404 になり、データを変えない
 * - 39.3: 404 の本文は不在の場合と区別できず、案件 ID を含めない
 * - 39.4: 一括の要求の対象に範囲外の画像が含まれると、そのデータを返さず変えない
 * - 39.5: 一覧・件数は範囲内の案件のものだけ
 * - 39.6: 署名付き URL（原画像・サムネイル・注釈付きサムネイル）は範囲内に限って発行する
 *
 * 利用者（いずれもテストで作るロール。全案件閲覧の権限 project:read_all を持たない MEMBER と、
 * site_survey の権限に加えて project:read_all を持つ READ_ALL。ロール名は admin ではない）:
 * - 案件 A の営業担当者・工事担当者・作成者（関係者）、担当外の利用者、全案件閲覧の利用者
 * - 案件 B の作成者は担当外の利用者（一括の要求で範囲外の画像を混ぜるため）
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { validateEnv } from '../../config/env.js';
import type { PrismaClient } from '../../generated/prisma/client.js';

// 環境変数を初期化（トークン発行の鍵を読むため、アプリとサービスのインポート前に実行）
validateEnv();

import app from '../../app.js';
import getPrismaClient from '../../db.js';
import tokenService from '../../services/token.service.js';
import { getSharedRBACService } from '../../services/rbac.service.js';
import { seedPermissions, seedRolePermissions, seedRoles } from '../../utils/seed-helpers.js';
import { deleteAuditLogsWithArchivePermission } from '../../utils/audit-log-archive-permission.js';
import { createTestUser } from './test-user-factory.js';

const MARK = 'test-ss1191-survey-scope';
const MEMBER_ROLE = `${MARK}-member`;
const READ_ALL_ROLE = `${MARK}-read-all`;
const NO_PERMISSION_ROLE = `${MARK}-no-permission`;
/** 版 4・変種 8 の整った UUID（ID の形式の検査を通り、どの行としても存在しない） */
const MISSING_ID = '00000000-0000-4000-8000-000000119100';
/** 1x1 の PNG（注釈付きサムネイルの更新の本文の形式を満たすため） */
const TINY_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

interface TestUser {
  id: string;
  token: string;
}

interface Fixture {
  projectId: string;
  surveyId: string;
  imageId: string;
}

describe('現場調査・画像・注釈の API の閲覧範囲（統合・実 DB）', () => {
  let prisma: PrismaClient;
  let sales: TestUser;
  let construction: TestUser;
  let creator: TestUser;
  let outsider: TestUser;
  let readAll: TestUser;
  let noPermission: TestUser;
  let target: Fixture;
  let other: Fixture;

  async function cleanup(): Promise<void> {
    const users = await prisma.user.findMany({
      where: { email: { contains: MARK } },
      select: { id: true },
    });
    const userIds = users.map((u) => u.id);
    const rbac = getSharedRBACService();
    for (const id of userIds) {
      await rbac.invalidateUserPermissionsCache(id);
    }
    const projects = await prisma.project.findMany({
      where: { name: { contains: MARK } },
      select: { id: true },
    });
    const projectIds = projects.map((p) => p.id);
    const surveys = await prisma.siteSurvey.findMany({
      where: { projectId: { in: projectIds } },
      select: { id: true },
    });
    const surveyIds = surveys.map((s) => s.id);
    await deleteAuditLogsWithArchivePermission(prisma, {
      OR: [
        { actorId: { in: userIds } },
        { targetId: { in: userIds } },
        { targetId: { in: projectIds } },
        { targetId: { in: surveyIds } },
      ],
    });
    // 現場調査・画像・注釈は案件の削除に連なって消える
    await prisma.projectStatusHistory.deleteMany({ where: { projectId: { in: projectIds } } });
    await prisma.project.deleteMany({ where: { id: { in: projectIds } } });
    await prisma.userRole.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    const roleNames = [MEMBER_ROLE, READ_ALL_ROLE, NO_PERMISSION_ROLE];
    await prisma.rolePermission.deleteMany({ where: { role: { name: { in: roleNames } } } });
    await prisma.role.deleteMany({ where: { name: { in: roleNames } } });
  }

  async function createRole(name: string, permissions: Array<[string, string]>): Promise<void> {
    const role = await prisma.role.create({
      data: { name, description: 'site-survey タスク119.1 の検証用' },
    });
    const records = await prisma.permission.findMany({
      where: { OR: permissions.map(([resource, action]) => ({ resource, action })) },
    });
    expect(records, `前提の欠落: ロール ${name} の権限が試験 DB に揃っていない`).toHaveLength(
      permissions.length
    );
    if (records.length > 0) {
      await prisma.rolePermission.createMany({
        data: records.map((p) => ({ roleId: role.id, permissionId: p.id })),
      });
    }
  }

  async function createUser(suffix: string, roleName: string): Promise<TestUser> {
    const role = await prisma.role.findUnique({ where: { name: roleName } });
    if (!role) {
      throw new Error(`前提の欠落: ロール ${roleName} が試験 DB に無い`);
    }
    const email = `${MARK}-${suffix}@example.com`;
    const user = await createTestUser(prisma, {
      email,
      displayName: `${MARK}-${suffix}`,
      passwordHash: 'not-used',
    });
    await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });
    const token = await tokenService.generateAccessToken({
      accessTokenGeneration: 0,
      userId: user.id,
      email,
      roles: [roleName],
    });
    return { id: user.id, token };
  }

  async function createFixture(
    suffix: string,
    people: { salesPersonId: string; constructionPersonId?: string; createdById: string }
  ): Promise<Fixture> {
    const project = await prisma.project.create({
      data: { name: `${MARK}-${suffix}`, ...people },
      select: { id: true },
    });
    const survey = await prisma.siteSurvey.create({
      data: {
        projectId: project.id,
        name: `${MARK}-${suffix}-survey`,
        surveyDate: new Date('2026-10-27'),
        memo: 'before',
      },
      select: { id: true },
    });
    const image = await prisma.surveyImage.create({
      data: {
        surveyId: survey.id,
        originalPath: `surveys/${survey.id}/original.jpg`,
        thumbnailPath: `surveys/${survey.id}/thumbnail.jpg`,
        annotatedThumbnailPath: `annotated-thumbnails/${survey.id}.jpg`,
        fileName: `${suffix}.jpg`,
        fileSize: 1024,
        width: 100,
        height: 100,
        displayOrder: 1,
        comment: 'before',
      },
      select: { id: true },
    });
    await prisma.imageAnnotation.create({
      data: {
        imageId: image.id,
        data: { version: '6.0.0', objects: [] },
        hasDrawnAnnotations: false,
      },
    });
    return { projectId: project.id, surveyId: survey.id, imageId: image.id };
  }

  function auth(user: TestUser): [string, string] {
    return ['Authorization', `Bearer ${user.token}`];
  }

  function withoutInstance(body: Record<string, unknown>): Record<string, unknown> {
    const { instance: _instance, ...rest } = body;
    return rest;
  }

  /** 対象の行の状態（範囲外の要求の前後で変わらないことを比べる） */
  async function snapshot(fixture: Fixture): Promise<unknown> {
    const survey = await prisma.siteSurvey.findUniqueOrThrow({
      where: { id: fixture.surveyId },
      select: { name: true, memo: true, deletedAt: true, updatedAt: true },
    });
    const surveyCount = await prisma.siteSurvey.count({ where: { projectId: fixture.projectId } });
    const images = await prisma.surveyImage.findMany({
      where: { surveyId: fixture.surveyId },
      select: {
        id: true,
        comment: true,
        includeInReport: true,
        displayOrder: true,
        annotatedThumbnailPath: true,
      },
      orderBy: { id: 'asc' },
    });
    const annotation = await prisma.imageAnnotation.findUnique({
      where: { imageId: fixture.imageId },
      select: { data: true, updatedAt: true },
    });
    return { survey, surveyCount, images, annotation };
  }

  beforeAll(async () => {
    prisma = getPrismaClient();
    await cleanup();
    await seedRoles(prisma);
    await seedPermissions(prisma);
    await seedRolePermissions(prisma);

    const surveyPermissions: Array<[string, string]> = [
      ['site_survey', 'create'],
      ['site_survey', 'read'],
      ['site_survey', 'update'],
      ['site_survey', 'delete'],
    ];
    await createRole(MEMBER_ROLE, surveyPermissions);
    await createRole(READ_ALL_ROLE, [...surveyPermissions, ['project', 'read_all']]);
    await createRole(NO_PERMISSION_ROLE, []);

    sales = await createUser('sales', MEMBER_ROLE);
    construction = await createUser('construction', MEMBER_ROLE);
    creator = await createUser('creator', MEMBER_ROLE);
    outsider = await createUser('outsider', MEMBER_ROLE);
    readAll = await createUser('read-all', READ_ALL_ROLE);
    noPermission = await createUser('no-permission', NO_PERMISSION_ROLE);

    target = await createFixture('target', {
      salesPersonId: sales.id,
      constructionPersonId: construction.id,
      createdById: creator.id,
    });
    other = await createFixture('other', {
      salesPersonId: outsider.id,
      createdById: outsider.id,
    });
  });

  afterAll(async () => {
    await cleanup();
  });

  describe('範囲内の利用者（39.1・39.6）', () => {
    /**
     * @requirement site-survey/REQ-39.1
     * @requirement site-survey/REQ-39.6
     */
    it('営業担当者・工事担当者・作成者・全案件閲覧の権限の利用者は、現場調査・画像・注釈を取得でき、3 種の表示元 URL が発行される', async () => {
      for (const user of [sales, construction, creator, readAll]) {
        const detail = await request(app)
          .get(`/api/site-surveys/${target.surveyId}`)
          .set(...auth(user))
          .expect(200);
        expect(detail.body.id).toBe(target.surveyId);
        expect(detail.body.images[0].originalUrl).toBeTruthy();
        expect(detail.body.images[0].thumbnailUrl).toBeTruthy();
        expect(detail.body.images[0].annotatedThumbnailUrl).toBeTruthy();

        const images = await request(app)
          .get(`/api/site-surveys/${target.surveyId}/images`)
          .set(...auth(user))
          .expect(200);
        expect(images.body).toHaveLength(1);
        expect(images.body[0].originalUrl).toBeTruthy();
        expect(images.body[0].thumbnailUrl).toBeTruthy();
        expect(images.body[0].annotatedThumbnailUrl).toBeTruthy();

        const list = await request(app)
          .get(`/api/projects/${target.projectId}/site-surveys`)
          .set(...auth(user))
          .expect(200);
        expect(list.body.data.map((s: { id: string }) => s.id)).toEqual([target.surveyId]);
        expect(list.body.data[0].thumbnailUrl).toBeTruthy();

        const latest = await request(app)
          .get(`/api/projects/${target.projectId}/site-surveys/latest`)
          .set(...auth(user))
          .expect(200);
        expect(latest.body.totalCount).toBe(1);

        const projectImages = await request(app)
          .get(`/api/projects/${target.projectId}/survey-images`)
          .set(...auth(user))
          .expect(200);
        expect(projectImages.body.images.map((i: { id: string }) => i.id)).toEqual([
          target.imageId,
        ]);
        expect(projectImages.body.images[0].displayUrl).toBeTruthy();
        expect(projectImages.body.images[0].originalUrl).toBeTruthy();

        await request(app)
          .get(`/api/site-surveys/images/${target.imageId}/annotations`)
          .set(...auth(user))
          .expect(200);
        await request(app)
          .get(`/api/site-surveys/images/${target.imageId}/annotations/export`)
          .set(...auth(user))
          .expect(200);
        const batch = await request(app)
          .post('/api/site-surveys/annotations/batch')
          .set(...auth(user))
          .send({ surveyId: target.surveyId, imageIds: [target.imageId] })
          .expect(200);
        expect(batch.body.annotations[target.imageId]).not.toBeNull();
      }
    });

    /**
     * @requirement site-survey/REQ-39.1
     */
    it('関係者は現場調査の作成・更新・画像の情報の更新・削除を行える', async () => {
      const created = await request(app)
        .post(`/api/projects/${target.projectId}/site-surveys`)
        .set(...auth(construction))
        .send({ name: `${MARK}-created`, surveyDate: '2026-10-27' })
        .expect(201);

      const current = await prisma.siteSurvey.findUniqueOrThrow({
        where: { id: created.body.id },
      });
      await request(app)
        .put(`/api/site-surveys/${created.body.id}`)
        .set(...auth(creator))
        .send({ memo: 'updated', expectedUpdatedAt: current.updatedAt.toISOString() })
        .expect(200);

      await request(app)
        .patch('/api/site-surveys/images/batch')
        .set(...auth(sales))
        .send({ updates: [{ id: target.imageId, includeInReport: true }] })
        .expect(200);
      const image = await prisma.surveyImage.findUniqueOrThrow({ where: { id: target.imageId } });
      expect(image.includeInReport).toBe(true);
      await prisma.surveyImage.update({
        where: { id: target.imageId },
        data: { includeInReport: false },
      });

      await request(app)
        .delete(`/api/site-surveys/${created.body.id}`)
        .set(...auth(readAll))
        .expect(204);
      const deleted = await prisma.siteSurvey.findUniqueOrThrow({
        where: { id: created.body.id },
      });
      expect(deleted.deletedAt).not.toBeNull();
    });

    /**
     * 解決関数は論理削除された現場調査からも案件 ID を引く。範囲内の利用者には
     * 各経路の 410 がそのまま届き、範囲外の利用者には不在と同じ 404 が返る。
     *
     * @requirement site-survey/REQ-39.1
     * @requirement site-survey/REQ-39.2
     */
    it('論理削除された現場調査の画像は、範囲内の利用者には 410、範囲外の利用者には 404 を返し、行を変えない', async () => {
      const deletedFixture = await createFixture('deleted', {
        salesPersonId: sales.id,
        createdById: creator.id,
      });
      await prisma.siteSurvey.update({
        where: { id: deletedFixture.surveyId },
        data: { deletedAt: new Date() },
      });

      const gone = await request(app)
        .patch(`/api/site-surveys/images/${deletedFixture.imageId}`)
        .set(...auth(sales))
        .send({ comment: 'after' })
        .expect(410);
      expect(gone.body.code).toBe('SURVEY_DELETED');

      // outsider の範囲外の記録を別の主張が数えるため、この検証には専用の担当外の利用者を使う
      const deletedOutsider = await createUser('deleted-outsider', MEMBER_ROLE);
      const missing = await request(app)
        .patch(`/api/site-surveys/images/${deletedFixture.imageId}`)
        .set(...auth(deletedOutsider))
        .send({ comment: 'after' })
        .expect(404);
      expect(missing.body.code).toBe('NOT_FOUND');
      expect(JSON.stringify(missing.body)).not.toContain(deletedFixture.projectId);

      const image = await prisma.surveyImage.findUniqueOrThrow({
        where: { id: deletedFixture.imageId },
      });
      expect(image.comment).toBe('before');
    });
  });

  describe('範囲外の ID 指定（39.2・39.3・39.5・39.6）', () => {
    /**
     * @requirement site-survey/REQ-39.2
     * @requirement site-survey/REQ-39.3
     * @requirement site-survey/REQ-39.5
     * @requirement site-survey/REQ-39.6
     */
    it('担当外の利用者の読み取りは、存在しない ID と同じ 404 の本文になり、表示元 URL も案件 ID も返らない', async () => {
      const readPaths: Array<[string, string]> = [
        [`/api/site-surveys/${target.surveyId}`, `/api/site-surveys/${MISSING_ID}`],
        [
          `/api/projects/${target.projectId}/site-surveys/${target.surveyId}`,
          `/api/projects/${target.projectId}/site-surveys/${MISSING_ID}`,
        ],
        [`/api/site-surveys/${target.surveyId}/images`, `/api/site-surveys/${MISSING_ID}/images`],
        [
          `/api/projects/${target.projectId}/site-surveys`,
          `/api/projects/${MISSING_ID}/site-surveys`,
        ],
        [
          `/api/projects/${target.projectId}/site-surveys/latest`,
          `/api/projects/${MISSING_ID}/site-surveys/latest`,
        ],
        [
          `/api/projects/${target.projectId}/survey-images`,
          `/api/projects/${MISSING_ID}/survey-images`,
        ],
        [
          `/api/site-surveys/images/${target.imageId}/annotations`,
          `/api/site-surveys/images/${MISSING_ID}/annotations`,
        ],
        [
          `/api/site-surveys/images/${target.imageId}/annotations/export`,
          `/api/site-surveys/images/${MISSING_ID}/annotations/export`,
        ],
      ];

      for (const [outOfScopePath, missingPath] of readPaths) {
        const missing = await request(app)
          .get(missingPath)
          .set(...auth(outsider))
          .expect(404);
        const outOfScope = await request(app)
          .get(outOfScopePath)
          .set(...auth(outsider))
          .expect(404);

        expect(outOfScope.body.code, outOfScopePath).toBe('NOT_FOUND');
        expect(withoutInstance(outOfScope.body), outOfScopePath).toEqual(
          withoutInstance(missing.body)
        );
        const exposed = JSON.stringify(withoutInstance(outOfScope.body));
        expect(exposed, outOfScopePath).not.toContain(target.projectId);
        expect(exposed, outOfScopePath).not.toContain(target.surveyId);
        // 表示元 URL（ローカルストレージの配信元・保存先のキー）を含めない
        expect(JSON.stringify(outOfScope.body), outOfScopePath).not.toContain('storage');
        expect(JSON.stringify(outOfScope.body), outOfScopePath).not.toContain('thumbnail');
      }

      const batchMissing = await request(app)
        .post('/api/site-surveys/annotations/batch')
        .set(...auth(outsider))
        .send({ surveyId: MISSING_ID, imageIds: [target.imageId] })
        .expect(404);
      const batch = await request(app)
        .post('/api/site-surveys/annotations/batch')
        .set(...auth(outsider))
        .send({ surveyId: target.surveyId, imageIds: [target.imageId] })
        .expect(404);
      expect(withoutInstance(batch.body)).toEqual(withoutInstance(batchMissing.body));
      expect(batch.body.annotations).toBeUndefined();
    });

    /**
     * @requirement site-survey/REQ-39.2
     * @requirement site-survey/REQ-39.3
     */
    it('担当外の利用者の作成・更新・削除は、存在しない ID と同じ 404 の本文になり、データを変えない', async () => {
      const before = await snapshot(target);
      const survey = await prisma.siteSurvey.findUniqueOrThrow({
        where: { id: target.surveyId },
      });
      const annotation = await prisma.imageAnnotation.findUniqueOrThrow({
        where: { imageId: target.imageId },
      });

      type Call = (id: { project: string; survey: string; image: string }) => request.Test;
      const writes: Array<[string, Call]> = [
        [
          'POST site-surveys',
          (id) =>
            request(app)
              .post(`/api/projects/${id.project}/site-surveys`)
              .send({ name: `${MARK}-intrusion`, surveyDate: '2026-10-27' }),
        ],
        [
          'PUT site-surveys/:id',
          (id) =>
            request(app)
              .put(`/api/site-surveys/${id.survey}`)
              .send({ memo: 'intrusion', expectedUpdatedAt: survey.updatedAt.toISOString() }),
        ],
        ['DELETE site-surveys/:id', (id) => request(app).delete(`/api/site-surveys/${id.survey}`)],
        [
          'POST images',
          (id) =>
            request(app)
              .post(`/api/site-surveys/${id.survey}/images`)
              .attach('images', Buffer.from('not-an-image'), 'intrusion.jpg'),
        ],
        [
          'PUT images/order',
          (id) =>
            request(app)
              .put(`/api/site-surveys/${id.survey}/images/order`)
              .send({ orders: [{ id: target.imageId, order: 2 }] }),
        ],
        [
          'PATCH images/:imageId',
          (id) =>
            request(app)
              .patch(`/api/site-surveys/images/${id.image}`)
              .send({ comment: 'intrusion' }),
        ],
        [
          'DELETE images/:imageId',
          (id) => request(app).delete(`/api/site-surveys/images/${id.image}`),
        ],
        [
          'PATCH annotated-thumbnail',
          (id) =>
            request(app)
              .patch(`/api/site-surveys/images/${id.image}/annotated-thumbnail`)
              .send({ imageData: TINY_PNG }),
        ],
        [
          'DELETE annotated-thumbnail',
          (id) => request(app).delete(`/api/site-surveys/images/${id.image}/annotated-thumbnail`),
        ],
        [
          'PUT annotations',
          (id) =>
            request(app)
              .put(`/api/site-surveys/images/${id.image}/annotations`)
              .send({
                data: { version: '6.0.0', objects: [] },
                expectedUpdatedAt: annotation.updatedAt.toISOString(),
              }),
        ],
      ];

      for (const [label, call] of writes) {
        const missing = await call({ project: MISSING_ID, survey: MISSING_ID, image: MISSING_ID })
          .set(...auth(outsider))
          .expect(404);
        const outOfScope = await call({
          project: target.projectId,
          survey: target.surveyId,
          image: target.imageId,
        })
          .set(...auth(outsider))
          .expect(404);
        expect(outOfScope.body.code, label).toBe('NOT_FOUND');
        expect(withoutInstance(outOfScope.body), label).toEqual(withoutInstance(missing.body));
        expect(JSON.stringify(withoutInstance(outOfScope.body)), label).not.toContain(
          target.projectId
        );
      }

      expect(await snapshot(target)).toEqual(before);
    });

    /**
     * @requirement site-survey/REQ-39.2
     */
    it('範囲外のアクセスは PROJECT_SCOPE_DENIED として記録される', async () => {
      await request(app)
        .get(`/api/site-surveys/${target.surveyId}`)
        .set(...auth(outsider))
        .expect(404);

      const denied = await prisma.auditLog.findMany({
        where: { action: 'PROJECT_SCOPE_DENIED', actorId: outsider.id },
      });
      expect(denied.length).toBeGreaterThan(0);
      expect(denied.every((log) => log.targetId === target.projectId)).toBe(true);
    });

    it('権限を持たない利用者には、範囲の判定より先に権限なしの 403 を返す', async () => {
      const response = await request(app)
        .get(`/api/site-surveys/${target.surveyId}`)
        .set(...auth(noPermission))
        .expect(403);
      expect(response.body.code).not.toBe('NOT_FOUND');
    });
  });

  describe('一括の要求（39.4）', () => {
    /**
     * @requirement site-survey/REQ-39.4
     */
    it('画像の一括更新の対象に範囲外の画像が混じると、要求全体が存在しない画像と同じ 404 になり、どの画像も変わらない', async () => {
      const beforeTarget = await snapshot(target);
      const beforeOther = await snapshot(other);

      const missing = await request(app)
        .patch('/api/site-surveys/images/batch')
        .set(...auth(sales))
        .send({
          updates: [
            { id: target.imageId, comment: 'mixed' },
            { id: MISSING_ID, comment: 'mixed' },
          ],
        })
        .expect(404);
      const mixed = await request(app)
        .patch('/api/site-surveys/images/batch')
        .set(...auth(sales))
        .send({
          updates: [
            { id: target.imageId, comment: 'mixed' },
            { id: other.imageId, comment: 'mixed' },
          ],
        })
        .expect(404);

      expect(mixed.body.code).toBe('NOT_FOUND');
      expect(withoutInstance(mixed.body)).toEqual(withoutInstance(missing.body));
      const exposed = JSON.stringify(withoutInstance(mixed.body));
      expect(exposed).not.toContain(other.projectId);
      expect(exposed).not.toContain(other.imageId);

      expect(await snapshot(target)).toEqual(beforeTarget);
      expect(await snapshot(other)).toEqual(beforeOther);
    });

    /**
     * @requirement site-survey/REQ-39.4
     */
    it('注釈の一括取得に範囲外の画像の ID を混ぜても、その画像の注釈は返らない', async () => {
      const response = await request(app)
        .post('/api/site-surveys/annotations/batch')
        .set(...auth(sales))
        .send({ surveyId: target.surveyId, imageIds: [target.imageId, other.imageId] })
        .expect(200);

      expect(response.body.annotations[target.imageId]).not.toBeNull();
      expect(response.body.annotations[other.imageId]).toBeNull();
      expect(JSON.stringify(response.body)).not.toContain(other.projectId);
    });
  });
});
