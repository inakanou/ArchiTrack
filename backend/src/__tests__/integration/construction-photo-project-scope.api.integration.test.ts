/**
 * @fileoverview 工事写真アルバム・写真項目・工事看板の API への案件の閲覧範囲の適用の統合検証
 * （construction-photo タスク30.1・30.2）
 *
 * 本物のアプリ（app.ts のルート・authenticate・requirePermission・requireProjectScope・共有の
 * ProjectScopeService と RBACService）と、テスト用の実データベース・実ストレージ（STORAGE_TYPE=local）を通す。
 *
 * Requirements (construction-photo):
 * - 21.1: 範囲内（営業担当者・工事担当者・作成者、全案件閲覧の権限）は従来どおり使える
 * - 21.2: 範囲外の ID 指定は不在と同じ 404 になり、データベースとストレージを変えない
 * - 21.3: 404 の本文は不在の場合と区別できず、案件 ID を含めない
 * - 21.4: 一括の要求（メタデータの一括更新・表示順序の更新）は 1 件でも範囲外なら全体を 404 にし、書き込まない
 * - 21.5: 現調コピーはコピー先のアルバムとコピー元の現場調査写真の両方の案件を判定する
 * - 21.6: 一覧（アルバム・工事看板・写真項目）は範囲内だけ
 * - 21.7: 署名付きURL（写真項目一覧・代表サムネイル・一括更新の応答）と原本・印字画像は範囲内に限る
 *
 * 利用者（いずれもテストで作るロール。ロール名は admin ではない）:
 * - MEMBER: 工事写真・工事看板の閲覧・作成・編集・削除の権限だけを持ち、全案件閲覧の権限を持たない
 * - READ_ALL: MEMBER の権限に全案件閲覧の権限（project:read_all）を加えたもの
 * - 案件 target の営業担当者・工事担当者・作成者（関係者）、担当外の利用者、全案件閲覧の利用者、権限なしの利用者
 * - 案件 other の営業担当者・作成者は担当外の利用者（一括・現調コピーで範囲外の対象を混ぜるため）
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
import { initializeConstructionPhotoImageServices } from '../../routes/construction-photo-images.routes.js';
import { createTestUser } from './test-user-factory.js';

const MARK = 'test-cp30-photo-scope';
const MEMBER_ROLE = `${MARK}-member`;
const READ_ALL_ROLE = `${MARK}-read-all`;
const NO_PERMISSION_ROLE = `${MARK}-no-permission`;
/** 版 4・変種 8 の整った UUID（ID の形式の検査を通り、どの行としても存在しない） */
const MISSING_ID = '00000000-0000-4000-8000-000000030200';

interface TestUser {
  id: string;
  token: string;
}

interface Fixture {
  projectId: string;
  albumId: string;
  signboardId: string;
  photoId: string;
  surveyImageId: string;
}

describe('工事写真アルバム・写真項目・工事看板の API の閲覧範囲（統合・実 DB）', () => {
  let prisma: PrismaClient;
  let sales: TestUser;
  let construction: TestUser;
  let creator: TestUser;
  let outsider: TestUser;
  let readAll: TestUser;
  let noPermission: TestUser;
  let target: Fixture;
  let other: Fixture;
  let validJpeg: Buffer;

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
    await deleteAuditLogsWithArchivePermission(prisma, {
      OR: [
        { actorId: { in: userIds } },
        { targetId: { in: userIds } },
        { targetId: { in: projectIds } },
      ],
    });
    await prisma.constructionPhoto.deleteMany({
      where: { album: { projectId: { in: projectIds } } },
    });
    await prisma.constructionSignboard.deleteMany({ where: { projectId: { in: projectIds } } });
    await prisma.constructionPhotoAlbum.deleteMany({ where: { projectId: { in: projectIds } } });
    await prisma.projectStatusHistory.deleteMany({ where: { projectId: { in: projectIds } } });
    // 現場調査・画像は案件の削除に連なって消える
    await prisma.project.deleteMany({ where: { id: { in: projectIds } } });
    await prisma.userRole.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    const roleNames = [MEMBER_ROLE, READ_ALL_ROLE, NO_PERMISSION_ROLE];
    await prisma.rolePermission.deleteMany({ where: { role: { name: { in: roleNames } } } });
    await prisma.role.deleteMany({ where: { name: { in: roleNames } } });
  }

  async function createRole(name: string, permissions: Array<[string, string]>): Promise<void> {
    const role = await prisma.role.create({
      data: { name, description: 'construction-photo タスク30 の検証用' },
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

  function auth(user: TestUser): [string, string] {
    return ['Authorization', `Bearer ${user.token}`];
  }

  function withoutInstance(body: Record<string, unknown>): Record<string, unknown> {
    const { instance: _instance, ...rest } = body;
    return rest;
  }

  async function createFixture(
    suffix: string,
    people: { salesPersonId: string; constructionPersonId?: string; createdById: string },
    uploader: TestUser
  ): Promise<Fixture> {
    const project = await prisma.project.create({
      data: { name: `${MARK}-${suffix}`, ...people },
      select: { id: true },
    });
    const album = await prisma.constructionPhotoAlbum.create({
      data: { projectId: project.id, name: `${MARK}-${suffix}-album`, memo: 'before' },
      select: { id: true },
    });
    const signboard = await prisma.constructionSignboard.create({
      data: { projectId: project.id, workName: `${suffix}工事`, workLocation: `${suffix}現場` },
      select: { id: true },
    });
    // 写真項目は実ストレージへアップロードして作る（原本・印字画像・サムネイルの署名付きURLを検証するため）
    const uploaded = await request(app)
      .post(`/api/construction-photos/${album.id}/images`)
      .set(...auth(uploader))
      .attach('images', validJpeg, { filename: `${suffix}.jpg`, contentType: 'image/jpeg' });
    expect(uploaded.status, `前提: ${suffix} の写真項目のアップロード`).toBe(201);
    const photoId = uploaded.body.successful[0].id as string;
    // 看板を配置して印字画像の経路を通す
    await prisma.constructionPhoto.update({
      where: { id: photoId },
      data: {
        signboardId: signboard.id,
        signboardPlacement: { left: 10, top: 10, width: 120, height: 80 },
        comment: 'before',
      },
    });
    const survey = await prisma.siteSurvey.create({
      data: { projectId: project.id, name: `${MARK}-${suffix}-survey`, surveyDate: new Date() },
      select: { id: true },
    });
    const surveyImage = await prisma.surveyImage.create({
      data: {
        surveyId: survey.id,
        originalPath: `surveys/${survey.id}/original.jpg`,
        thumbnailPath: `surveys/${survey.id}/thumbnail.jpg`,
        fileName: `${suffix}-survey.jpg`,
        fileSize: 1024,
        width: 100,
        height: 100,
        displayOrder: 1,
      },
      select: { id: true },
    });
    return {
      projectId: project.id,
      albumId: album.id,
      signboardId: signboard.id,
      photoId,
      surveyImageId: surveyImage.id,
    };
  }

  /** 対象の案件の工事写真のデータの状態（範囲外の要求の前後で変わらないことを比べる） */
  async function snapshot(fixture: Fixture): Promise<unknown> {
    return {
      albums: await prisma.constructionPhotoAlbum.findMany({
        where: { projectId: fixture.projectId },
        select: { id: true, name: true, memo: true, deletedAt: true, updatedAt: true },
        orderBy: { id: 'asc' },
      }),
      photos: await prisma.constructionPhoto.findMany({
        where: { album: { projectId: fixture.projectId } },
        select: {
          id: true,
          comment: true,
          displayOrder: true,
          includeInReport: true,
          signboardId: true,
          originalPath: true,
        },
        orderBy: { id: 'asc' },
      }),
      signboards: await prisma.constructionSignboard.findMany({
        where: { projectId: fixture.projectId },
        select: { id: true, workName: true, deletedAt: true, updatedAt: true },
        orderBy: { id: 'asc' },
      }),
    };
  }

  beforeAll(async () => {
    prisma = getPrismaClient();
    await initializeConstructionPhotoImageServices();
    await cleanup();
    await seedRoles(prisma);
    await seedPermissions(prisma);
    await seedRolePermissions(prisma);

    const photoPermissions: Array<[string, string]> = [
      ['construction_photo', 'create'],
      ['construction_photo', 'read'],
      ['construction_photo', 'update'],
      ['construction_photo', 'delete'],
      ['construction_signboard', 'create'],
      ['construction_signboard', 'read'],
      ['construction_signboard', 'update'],
      ['construction_signboard', 'delete'],
    ];
    await createRole(MEMBER_ROLE, photoPermissions);
    await createRole(READ_ALL_ROLE, [...photoPermissions, ['project', 'read_all']]);
    await createRole(NO_PERMISSION_ROLE, []);

    sales = await createUser('sales', MEMBER_ROLE);
    construction = await createUser('construction', MEMBER_ROLE);
    creator = await createUser('creator', MEMBER_ROLE);
    outsider = await createUser('outsider', MEMBER_ROLE);
    readAll = await createUser('read-all', READ_ALL_ROLE);
    noPermission = await createUser('no-permission', NO_PERMISSION_ROLE);

    const sharp = (await import('sharp')).default;
    validJpeg = await sharp({
      create: { width: 200, height: 150, channels: 3, background: { r: 30, g: 120, b: 200 } },
    })
      .jpeg()
      .toBuffer();

    target = await createFixture(
      'target',
      { salesPersonId: sales.id, constructionPersonId: construction.id, createdById: creator.id },
      sales
    );
    other = await createFixture(
      'other',
      { salesPersonId: outsider.id, createdById: outsider.id },
      outsider
    );
  });

  afterAll(async () => {
    await cleanup();
  });

  describe('範囲内の利用者（21.1・21.6・21.7）', () => {
    /**
     * @requirement construction-photo/REQ-21.1
     * @requirement construction-photo/REQ-21.6
     * @requirement construction-photo/REQ-21.7
     */
    it('営業担当者・工事担当者・作成者・全案件閲覧の権限の利用者は、一覧・取得・原本・印字画像を得られ、サムネイルの署名付きURLが発行される', async () => {
      for (const user of [sales, construction, creator, readAll]) {
        const albums = await request(app)
          .get(`/api/projects/${target.projectId}/construction-photos`)
          .set(...auth(user))
          .expect(200);
        expect(albums.body.data.map((a: { id: string }) => a.id)).toEqual([target.albumId]);
        expect(albums.body.data[0].thumbnailUrl, '代表サムネイルの署名付きURL').toBeTruthy();

        const album = await request(app)
          .get(`/api/construction-photos/${target.albumId}`)
          .set(...auth(user))
          .expect(200);
        expect(album.body.id).toBe(target.albumId);

        const photos = await request(app)
          .get(`/api/construction-photos/${target.albumId}/images`)
          .set(...auth(user))
          .expect(200);
        expect(photos.body.map((p: { id: string }) => p.id)).toEqual([target.photoId]);
        expect(photos.body[0].thumbnailUrl, '写真項目のサムネイルの署名付きURL').toBeTruthy();

        const signboards = await request(app)
          .get(`/api/projects/${target.projectId}/construction-signboards`)
          .set(...auth(user))
          .expect(200);
        expect(JSON.stringify(signboards.body)).toContain(target.signboardId);

        const original = await request(app)
          .get(`/api/construction-photos/images/${target.photoId}/original`)
          .set(...auth(user))
          .responseType('blob')
          .expect(200);
        expect((original.body as Buffer).length).toBeGreaterThan(0);
        const printImage = await request(app)
          .get(`/api/construction-photos/images/${target.photoId}/print-image`)
          .set(...auth(user))
          .responseType('blob')
          .expect(200);
        expect(printImage.headers['content-type']).toContain('image/jpeg');
      }
    });

    /**
     * @requirement construction-photo/REQ-21.1
     * @requirement construction-photo/REQ-21.7
     */
    it('関係者はアルバム・看板の作成・更新・削除、写真項目のアップロード・メタデータの一括更新・並び替え・削除を行え、一括更新の応答に署名付きURLが含まれる', async () => {
      const createdAlbum = await request(app)
        .post(`/api/projects/${target.projectId}/construction-photos`)
        .set(...auth(construction))
        .send({ name: `${MARK}-created-album` })
        .expect(201);
      const renamed = await request(app)
        .patch(`/api/construction-photos/${createdAlbum.body.id}`)
        .set(...auth(creator))
        .send({ name: `${MARK}-renamed`, updatedAt: createdAlbum.body.updatedAt })
        .expect(200);
      expect(renamed.body.name).toBe(`${MARK}-renamed`);

      const uploaded = await request(app)
        .post(`/api/construction-photos/${createdAlbum.body.id}/images`)
        .set(...auth(sales))
        .attach('images', validJpeg, { filename: 'member.jpg', contentType: 'image/jpeg' })
        .expect(201);
      const uploadedId = uploaded.body.successful[0].id as string;

      const batch = await request(app)
        .patch('/api/construction-photos/images/batch')
        .set(...auth(construction))
        .send({ items: [{ id: uploadedId, comment: 'member' }] })
        .expect(200);
      expect(batch.body[0]).toMatchObject({ id: uploadedId, comment: 'member' });
      expect(batch.body[0].thumbnailUrl, '一括更新の応答の署名付きURL').toBeTruthy();

      await request(app)
        .put(`/api/construction-photos/${createdAlbum.body.id}/images/order`)
        .set(...auth(creator))
        .send({ orders: [{ id: uploadedId, order: 1 }] })
        .expect(204);
      await request(app)
        .delete(`/api/construction-photos/images/${uploadedId}`)
        .set(...auth(readAll))
        .expect(204);
      await request(app)
        .delete(`/api/construction-photos/${createdAlbum.body.id}`)
        .set(...auth(sales))
        .expect(204);

      const createdSignboard = await request(app)
        .post(`/api/projects/${target.projectId}/construction-signboards`)
        .set(...auth(creator))
        .send({ workName: `${MARK}-created-signboard`, workLocation: '現場' })
        .expect(201);
      await request(app)
        .patch(`/api/construction-signboards/${createdSignboard.body.id}`)
        .set(...auth(construction))
        .send({ workName: `${MARK}-renamed-signboard`, updatedAt: createdSignboard.body.updatedAt })
        .expect(200);
      await request(app)
        .delete(`/api/construction-signboards/${createdSignboard.body.id}`)
        .set(...auth(sales))
        .expect(200);
    });

    /**
     * 解決関数は論理削除されたアルバムからも案件 ID を引く。範囲内の利用者には本体の所属の判定の 404
     * （アルバムの不在の符号）がそのまま届き、範囲外の利用者には不在と同じ汎用の 404 が返る。
     *
     * @requirement construction-photo/REQ-21.1
     * @requirement construction-photo/REQ-21.2
     */
    it('論理削除されたアルバムは、範囲内の利用者には本体の 404、範囲外の利用者には汎用の 404 を返す', async () => {
      const deleted = await prisma.constructionPhotoAlbum.create({
        data: { projectId: target.projectId, name: `${MARK}-deleted`, deletedAt: new Date() },
        select: { id: true },
      });
      const inScope = await request(app)
        .get(`/api/construction-photos/${deleted.id}`)
        .set(...auth(sales))
        .expect(404);
      expect(inScope.body.code).toBe('CONSTRUCTION_PHOTO_ALBUM_NOT_FOUND');

      const outOfScope = await request(app)
        .get(`/api/construction-photos/${deleted.id}`)
        .set(...auth(outsider))
        .expect(404);
      expect(outOfScope.body.code).toBe('NOT_FOUND');
      expect(JSON.stringify(withoutInstance(outOfScope.body))).not.toContain(deleted.id);
      await prisma.constructionPhotoAlbum.delete({ where: { id: deleted.id } });
    });
  });

  describe('範囲外の ID 指定（21.2・21.3・21.6・21.7）', () => {
    /**
     * @requirement construction-photo/REQ-21.2
     * @requirement construction-photo/REQ-21.3
     * @requirement construction-photo/REQ-21.6
     * @requirement construction-photo/REQ-21.7
     */
    it('担当外の利用者の読み取り（一覧・取得・原本・印字画像）は、存在しない ID と同じ 404 の本文になり、署名付きURLも画像も案件 ID も返らない', async () => {
      const readPaths: Array<[string, string]> = [
        [
          `/api/projects/${target.projectId}/construction-photos`,
          `/api/projects/${MISSING_ID}/construction-photos`,
        ],
        [`/api/construction-photos/${target.albumId}`, `/api/construction-photos/${MISSING_ID}`],
        [
          `/api/projects/${target.projectId}/construction-photos/${target.albumId}`,
          `/api/projects/${target.projectId}/construction-photos/${MISSING_ID}`,
        ],
        [
          `/api/construction-photos/${target.albumId}/images`,
          `/api/construction-photos/${MISSING_ID}/images`,
        ],
        [
          `/api/projects/${target.projectId}/construction-signboards`,
          `/api/projects/${MISSING_ID}/construction-signboards`,
        ],
        [
          `/api/construction-photos/images/${target.photoId}/original`,
          `/api/construction-photos/images/${MISSING_ID}/original`,
        ],
        [
          `/api/construction-photos/images/${target.photoId}/print-image`,
          `/api/construction-photos/images/${MISSING_ID}/print-image`,
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

        expect(outOfScope.headers['content-type'], outOfScopePath).not.toContain('image/');
        expect(outOfScope.body.code, outOfScopePath).toBe('NOT_FOUND');
        expect(withoutInstance(outOfScope.body), outOfScopePath).toEqual(
          withoutInstance(missing.body)
        );
        const exposed = JSON.stringify(withoutInstance(outOfScope.body));
        expect(exposed, outOfScopePath).not.toContain(target.projectId);
        expect(exposed, outOfScopePath).not.toContain(target.albumId);
        expect(JSON.stringify(outOfScope.body), outOfScopePath).not.toContain('thumbnail');
        expect(JSON.stringify(outOfScope.body), outOfScopePath).not.toContain('storage');
      }
    });

    /**
     * @requirement construction-photo/REQ-21.2
     * @requirement construction-photo/REQ-21.3
     */
    it('担当外の利用者の作成・更新・削除・アップロードは、存在しない ID と同じ 404 の本文になり、データベースとストレージを変えない', async () => {
      const before = await snapshot(target);
      const album = await prisma.constructionPhotoAlbum.findUniqueOrThrow({
        where: { id: target.albumId },
      });
      const signboard = await prisma.constructionSignboard.findUniqueOrThrow({
        where: { id: target.signboardId },
      });
      const original = await request(app)
        .get(`/api/construction-photos/images/${target.photoId}/original`)
        .set(...auth(sales))
        .responseType('blob')
        .expect(200);

      type Ids = { project: string; album: string; photo: string; signboard: string };
      type Call = (id: Ids) => request.Test;
      const writes: Array<[string, Call]> = [
        [
          'POST construction-photos',
          (id) =>
            request(app)
              .post(`/api/projects/${id.project}/construction-photos`)
              .send({ name: `${MARK}-intrusion` }),
        ],
        [
          'PATCH construction-photos/:id',
          (id) =>
            request(app)
              .patch(`/api/construction-photos/${id.album}`)
              .send({ name: `${MARK}-intrusion`, updatedAt: album.updatedAt.toISOString() }),
        ],
        [
          'DELETE construction-photos/:id',
          (id) => request(app).delete(`/api/construction-photos/${id.album}`),
        ],
        [
          'POST images',
          (id) =>
            request(app)
              .post(`/api/construction-photos/${id.album}/images`)
              .attach('images', validJpeg, {
                filename: 'intrusion.jpg',
                contentType: 'image/jpeg',
              }),
        ],
        [
          'POST images/from-surveys',
          (id) =>
            request(app)
              .post(`/api/construction-photos/${id.album}/images/from-surveys`)
              .send({ surveyImageIds: [target.surveyImageId] }),
        ],
        [
          'PATCH images/batch',
          (id) =>
            request(app)
              .patch('/api/construction-photos/images/batch')
              .send({ items: [{ id: id.photo, comment: 'intrusion' }] }),
        ],
        [
          'PUT images/order',
          (id) =>
            request(app)
              .put(`/api/construction-photos/${id.album}/images/order`)
              .send({ orders: [{ id: target.photoId, order: 2 }] }),
        ],
        [
          'DELETE images/:imageId',
          (id) => request(app).delete(`/api/construction-photos/images/${id.photo}`),
        ],
        [
          'POST construction-signboards',
          (id) =>
            request(app)
              .post(`/api/projects/${id.project}/construction-signboards`)
              .send({ workName: `${MARK}-intrusion`, workLocation: '現場' }),
        ],
        [
          'PATCH construction-signboards/:id',
          (id) =>
            request(app)
              .patch(`/api/construction-signboards/${id.signboard}`)
              .send({
                workName: `${MARK}-intrusion`,
                updatedAt: signboard.updatedAt.toISOString(),
              }),
        ],
        [
          'DELETE construction-signboards/:id',
          (id) => request(app).delete(`/api/construction-signboards/${id.signboard}`),
        ],
      ];

      for (const [label, call] of writes) {
        const missing = await call({
          project: MISSING_ID,
          album: MISSING_ID,
          photo: MISSING_ID,
          signboard: MISSING_ID,
        })
          .set(...auth(outsider))
          .expect(404);
        const outOfScope = await call({
          project: target.projectId,
          album: target.albumId,
          photo: target.photoId,
          signboard: target.signboardId,
        })
          .set(...auth(outsider))
          .expect(404);
        expect(outOfScope.body.code, label).toBe('NOT_FOUND');
        expect(withoutInstance(outOfScope.body), label).toEqual(withoutInstance(missing.body));
        expect(JSON.stringify(withoutInstance(outOfScope.body)), label).not.toContain(
          target.projectId
        );
      }

      // データベースは変わらない（写真項目の原本のパスを含む）
      expect(await snapshot(target)).toEqual(before);
      // ストレージの原本も変わらない（同じバイト列を返す）
      const after = await request(app)
        .get(`/api/construction-photos/images/${target.photoId}/original`)
        .set(...auth(sales))
        .responseType('blob')
        .expect(200);
      expect(Buffer.compare(after.body as Buffer, original.body as Buffer)).toBe(0);
    });

    /**
     * @requirement construction-photo/REQ-21.2
     */
    it('範囲外のアクセスは PROJECT_SCOPE_DENIED として記録される', async () => {
      await request(app)
        .get(`/api/construction-photos/${target.albumId}`)
        .set(...auth(outsider))
        .expect(404);

      const denied = await prisma.auditLog.findMany({
        where: { action: 'PROJECT_SCOPE_DENIED', actorId: outsider.id },
      });
      expect(denied.length).toBeGreaterThan(0);
      expect(denied.every((log) => log.targetId === target.projectId)).toBe(true);
    });

    it('権限を持たない利用者には、範囲の判定より先に権限なしの 403 を返す', async () => {
      for (const path of [
        `/api/construction-photos/${target.albumId}`,
        `/api/construction-photos/${MISSING_ID}`,
        `/api/construction-photos/images/${target.photoId}/original`,
      ]) {
        const response = await request(app)
          .get(path)
          .set(...auth(noPermission))
          .expect(403);
        expect(response.body.code, path).not.toBe('NOT_FOUND');
      }
    });
  });

  describe('一括の要求（21.4）', () => {
    /**
     * @requirement construction-photo/REQ-21.4
     */
    it('メタデータの一括更新・表示順序の更新の対象に範囲外の写真項目が混じると、要求全体が存在しない写真項目と同じ 404 になり、どの写真項目も変わらない', async () => {
      const beforeTarget = await snapshot(target);
      const beforeOther = await snapshot(other);

      const batchMissing = await request(app)
        .patch('/api/construction-photos/images/batch')
        .set(...auth(sales))
        .send({
          items: [
            { id: target.photoId, comment: 'mixed' },
            { id: MISSING_ID, comment: 'mixed' },
          ],
        })
        .expect(404);
      const batchMixed = await request(app)
        .patch('/api/construction-photos/images/batch')
        .set(...auth(sales))
        .send({
          items: [
            { id: target.photoId, comment: 'mixed' },
            { id: other.photoId, comment: 'mixed' },
          ],
        })
        .expect(404);
      expect(batchMixed.body.code).toBe('NOT_FOUND');
      expect(withoutInstance(batchMixed.body)).toEqual(withoutInstance(batchMissing.body));

      const orderMissing = await request(app)
        .put(`/api/construction-photos/${target.albumId}/images/order`)
        .set(...auth(sales))
        .send({
          orders: [
            { id: target.photoId, order: 2 },
            { id: MISSING_ID, order: 1 },
          ],
        })
        .expect(404);
      const orderMixed = await request(app)
        .put(`/api/construction-photos/${target.albumId}/images/order`)
        .set(...auth(sales))
        .send({
          orders: [
            { id: target.photoId, order: 2 },
            { id: other.photoId, order: 1 },
          ],
        })
        .expect(404);
      expect(orderMixed.body.code).toBe('NOT_FOUND');
      expect(withoutInstance(orderMixed.body)).toEqual(withoutInstance(orderMissing.body));

      for (const body of [batchMixed.body, orderMixed.body]) {
        const exposed = JSON.stringify(withoutInstance(body));
        expect(exposed).not.toContain(other.projectId);
        expect(exposed).not.toContain(other.photoId);
      }

      expect(await snapshot(target)).toEqual(beforeTarget);
      expect(await snapshot(other)).toEqual(beforeOther);
    });
  });

  describe('現調コピー（21.5）', () => {
    /**
     * @requirement construction-photo/REQ-21.5
     */
    it('コピー元の現場調査写真が範囲外の案件に属すると、存在しない現場調査写真と同じ 404 になり、写真項目を作成しない', async () => {
      const beforeTarget = await snapshot(target);

      const missing = await request(app)
        .post(`/api/construction-photos/${target.albumId}/images/from-surveys`)
        .set(...auth(sales))
        .send({ surveyImageIds: [MISSING_ID] })
        .expect(404);
      const foreign = await request(app)
        .post(`/api/construction-photos/${target.albumId}/images/from-surveys`)
        .set(...auth(sales))
        .send({ surveyImageIds: [other.surveyImageId] })
        .expect(404);
      const mixed = await request(app)
        .post(`/api/construction-photos/${target.albumId}/images/from-surveys`)
        .set(...auth(sales))
        .send({ surveyImageIds: [target.surveyImageId, other.surveyImageId] })
        .expect(404);

      for (const response of [foreign, mixed]) {
        expect(response.body.code).toBe('NOT_FOUND');
        expect(withoutInstance(response.body)).toEqual(withoutInstance(missing.body));
        const exposed = JSON.stringify(withoutInstance(response.body));
        expect(exposed).not.toContain(other.projectId);
        expect(exposed).not.toContain(other.surveyImageId);
      }

      expect(await snapshot(target)).toEqual(beforeTarget);
    });

    /**
     * @requirement construction-photo/REQ-21.5
     */
    it('コピー先のアルバムが範囲外の案件に属すると、範囲内のコピー元を指定しても 404 になり、写真項目を作成しない', async () => {
      const beforeOther = await snapshot(other);

      const response = await request(app)
        .post(`/api/construction-photos/${other.albumId}/images/from-surveys`)
        .set(...auth(sales))
        .send({ surveyImageIds: [target.surveyImageId] })
        .expect(404);
      expect(response.body.code).toBe('NOT_FOUND');
      expect(JSON.stringify(withoutInstance(response.body))).not.toContain(other.projectId);

      expect(await snapshot(other)).toEqual(beforeOther);
    });
  });
});
