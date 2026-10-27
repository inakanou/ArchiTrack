/**
 * @fileoverview 工事写真のアクセスの判定の API 統合テスト（担当でない一般ユーザー）
 *
 * Task 23.1: プロジェクトへのアクセスの判定が機能の中で食い違う状態を解消する
 * Task 30.1: Task 23.1 の判断を要件39（本スペックの Requirement 21）の判定へ置き換える
 *
 * 利用者の判断（2026-10-03）により、工事写真・工事看板のアクセスはロールの権限の表（RBAC）
 * だけで判定していた（Task 23.1）。同判断は、2026-10-24 の判断 A（user-authentication の要件39）と
 * 2026-10-27 の判断（本スペックの Requirement 21 の新設と要件 1.2・13.2・13.3・17.1 の改訂）で
 * 置き換えられた。閲覧範囲（営業担当者・工事担当者・作成者、または全案件閲覧の権限）の外は
 * 存在しない場合と同じ 404 になる。範囲内での操作ごとの許否は従来どおりロールの権限の表で決める。
 *
 * 本ファイルが確かめること:
 * - 担当でない一般ユーザー（user ロール）の他の利用者のプロジェクトの工事写真への要求（写真一覧・
 *   メタの一括更新・並び替え・原本・印字画像・アップロード）は、存在しない id と同じ 404 で、
 *   データベースとストレージが変わらない（Task 23.1 の「行える」の主張を書き換えた）
 * - 同じ利用者を工事担当者・営業担当者・作成者に設定すると、同じ要求が通る
 * - 権限の表が許さない操作（user ロールの写真項目の削除）は 403 で、行は残る（範囲の判定より先）
 * - 判定を広げていないこと: 未認証は 401、権限なしは 403、取り除かれたプロジェクト・
 *   論理削除済みのアルバム・存在しない id は 404、別のプロジェクトの id を混ぜた要求は拒否
 *   （これらは範囲内の一般ユーザーで要求する）
 *
 * Scope:
 * - 実ストレージ（STORAGE_TYPE=local）＋実 sharp。テストは自己クリーンアップ
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import request from 'supertest';
import { validateEnv } from '../../config/env.js';
import type { PrismaClient } from '../../generated/prisma/client.js';

validateEnv();

import app from '../../app.js';
import getPrismaClient from '../../db.js';
import redis, { initRedis } from '../../redis.js';
import { seedRoles, seedPermissions, seedRolePermissions } from '../../utils/seed-helpers.js';
import { initializeConstructionPhotoImageServices } from '../../routes/construction-photo-images.routes.js';
import { loginForAccessToken } from './auth-login-client.js';
import { createTestUser } from './test-user-factory.js';

describe('Construction Photo Access API Integration Tests（担当でない一般ユーザー）', () => {
  let prisma: PrismaClient;

  // 利用者
  let ownerId: string;
  let ownerToken: string;
  let outsiderId: string;
  let outsiderToken: string;
  let adminOutsiderToken: string;
  let noPermissionToken: string;

  // owner が作成者・営業担当のプロジェクト A（主対象）
  let projectAId: string;
  let albumAId: string;
  let signboardAId: string;
  let photoA1: string;
  let photoA2: string;
  // owner の別プロジェクト B（プロジェクトの境界の検証用）
  let projectBId: string;
  let albumBId: string;
  let signboardBId: string;
  let photoB1: string;
  // 取り除かれた（論理削除済みの）プロジェクト C
  let projectCId: string;
  let albumCId: string;
  let signboardCId: string;
  let surveyImageCId: string;
  let photoC1: string;
  // プロジェクト A のアルバム E（プロジェクトの配下として指すアルバムの更新・削除の境界の検証用）
  let albumEId: string;
  // プロジェクト A の論理削除済みアルバム D
  let albumDId: string;
  let photoD1: string;

  let validJpeg: Buffer;

  const OWNER_EMAIL = 'test-construction-photo-access-owner@example.com';
  const OUTSIDER_EMAIL = 'test-construction-photo-access-outsider@example.com';
  const ADMIN_OUTSIDER_EMAIL = 'test-construction-photo-access-admin@example.com';
  const NO_PERMISSION_EMAIL = 'test-construction-photo-access-noperm@example.com';
  const ALL_EMAILS = [OWNER_EMAIL, OUTSIDER_EMAIL, ADMIN_OUTSIDER_EMAIL, NO_PERMISSION_EMAIL];
  const PROJECT_NAME_PREFIX = 'Construction Photo Access Integration Test Project';
  const MISSING_ID = '99999999-9999-4999-8999-999999999999';

  /** 利用者を作り、指定のロールを割り当ててログインする。ロールが空なら権限を持たない */
  const createAuthenticatedUser = async (
    email: string,
    displayName: string,
    roles: string[]
  ): Promise<{ userId: string; accessToken: string }> => {
    const { hash } = await import('@node-rs/argon2');
    const passwordHash = await hash('TestPassword123!@#', {
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4,
    });

    const user = await createTestUser(prisma, { email, displayName, passwordHash });

    for (const roleName of roles) {
      const role = await prisma.role.findUniqueOrThrow({ where: { name: roleName } });
      await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });
    }

    const accessToken = await loginForAccessToken(app, {
      email,
      password: 'TestPassword123!@#',
    });

    return { userId: user.id, accessToken };
  };

  /** 指定の利用者でアルバムへ写真を1枚アップロードし、写真項目の id を返す */
  const uploadPhoto = async (token: string, albumId: string, fileName: string): Promise<string> => {
    const res = await request(app)
      .post(`/api/construction-photos/${albumId}/images`)
      .set('Authorization', `Bearer ${token}`)
      .attach('images', validJpeg, { filename: fileName, contentType: 'image/jpeg' });
    expect(res.status).toBe(201);
    return res.body.successful[0].id as string;
  };

  /** ローカルストレージにあるアルバムの配下のファイル名を昇順で返す（無ければ空） */
  const storedFilesOfAlbum = (albumId: string): string[] => {
    const dir = path.join(process.env.LOCAL_STORAGE_PATH ?? '', 'construction-photos', albumId);
    expect(process.env.LOCAL_STORAGE_PATH, '前提: ローカルストレージのパス').toBeTruthy();
    return fs.existsSync(dir) ? fs.readdirSync(dir).sort() : [];
  };

  /** ロールが持つ権限のうち、指定のリソースの操作を昇順で返す */
  const actionsOfRole = async (roleName: string, resource: string): Promise<string[]> => {
    const rows = await prisma.rolePermission.findMany({
      where: { role: { name: roleName }, permission: { resource } },
      select: { permission: { select: { action: true } } },
    });
    return rows.map((r) => r.permission.action).sort();
  };

  beforeAll(async () => {
    prisma = getPrismaClient();
    await initRedis();
    await initializeConstructionPhotoImageServices();

    await seedRoles(prisma);
    await seedPermissions(prisma);
    await seedRolePermissions(prisma);

    // 共有のテスト DB では、他の統合テストが user ロールへ工事写真・工事看板の delete を足したまま
    // 残す（各ファイルは自分の beforeAll で足し直すため、ここで外しても影響しない。統合テストは
    // ファイル単位で逐次に走る）。シードの定義（＝要件 17 の権限の表）へ戻してから主張する
    await prisma.rolePermission.deleteMany({
      where: {
        role: { name: 'user' },
        permission: {
          resource: { in: ['construction_photo', 'construction_signboard'] },
          action: 'delete',
        },
      },
    });

    const owner = await createAuthenticatedUser(OWNER_EMAIL, 'Construction Photo Access Owner', [
      'user',
    ]);
    ownerId = owner.userId;
    ownerToken = owner.accessToken;

    const outsider = await createAuthenticatedUser(
      OUTSIDER_EMAIL,
      'Construction Photo Access Outsider',
      ['user']
    );
    outsiderId = outsider.userId;
    outsiderToken = outsider.accessToken;

    const adminOutsider = await createAuthenticatedUser(
      ADMIN_OUTSIDER_EMAIL,
      'Construction Photo Access Admin',
      ['admin']
    );
    adminOutsiderToken = adminOutsider.accessToken;

    const noPermission = await createAuthenticatedUser(
      NO_PERMISSION_EMAIL,
      'Construction Photo Access No Permission',
      []
    );
    noPermissionToken = noPermission.accessToken;

    const sharp = (await import('sharp')).default;
    validJpeg = await sharp({
      create: { width: 200, height: 150, channels: 3, background: { r: 30, g: 120, b: 200 } },
    })
      .jpeg()
      .toBuffer();

    const createProject = async (suffix: string): Promise<string> => {
      const project = await prisma.project.create({
        data: {
          name: `${PROJECT_NAME_PREFIX} ${suffix}`,
          salesPersonId: ownerId,
          createdById: ownerId,
        },
      });
      return project.id;
    };

    // プロジェクト A: アルバム・看板・写真2枚（片方に看板を配置する）
    projectAId = await createProject('A');
    albumAId = (
      await prisma.constructionPhotoAlbum.create({
        data: { projectId: projectAId, name: 'アクセス判定用アルバムA' },
      })
    ).id;
    signboardAId = (
      await prisma.constructionSignboard.create({
        data: { projectId: projectAId, workName: 'A工事', workLocation: 'A現場' },
      })
    ).id;
    photoA1 = await uploadPhoto(ownerToken, albumAId, 'a1.jpg');
    photoA2 = await uploadPhoto(ownerToken, albumAId, 'a2.jpg');
    await prisma.constructionPhoto.update({
      where: { id: photoA2 },
      data: {
        signboardId: signboardAId,
        signboardPlacement: { left: 10, top: 10, width: 120, height: 80 },
      },
    });

    // プロジェクト B: 境界の検証用
    projectBId = await createProject('B');
    albumBId = (
      await prisma.constructionPhotoAlbum.create({
        data: { projectId: projectBId, name: 'アクセス判定用アルバムB' },
      })
    ).id;
    signboardBId = (
      await prisma.constructionSignboard.create({
        data: { projectId: projectBId, workName: 'B工事', workLocation: 'B現場' },
      })
    ).id;
    photoB1 = await uploadPhoto(ownerToken, albumBId, 'b1.jpg');

    // プロジェクト C: アルバム・看板・写真（看板を配置）・現場調査写真を入れてから取り除く
    // （論理削除する）。プロジェクトの論理削除は配下のアルバム・看板へ波及しない
    projectCId = await createProject('C');
    albumCId = (
      await prisma.constructionPhotoAlbum.create({
        data: { projectId: projectCId, name: 'アクセス判定用アルバムC' },
      })
    ).id;
    signboardCId = (
      await prisma.constructionSignboard.create({
        data: { projectId: projectCId, workName: 'C工事', workLocation: 'C現場' },
      })
    ).id;
    photoC1 = await uploadPhoto(ownerToken, albumCId, 'c1.jpg');
    await prisma.constructionPhoto.update({
      where: { id: photoC1 },
      data: {
        signboardId: signboardCId,
        signboardPlacement: { left: 5, top: 5, width: 100, height: 60 },
      },
    });
    const surveyC = await prisma.siteSurvey.create({
      data: { projectId: projectCId, name: 'アクセス判定用現場調査C', surveyDate: new Date() },
    });
    surveyImageCId = (
      await prisma.surveyImage.create({
        data: {
          surveyId: surveyC.id,
          originalPath: 'survey-images/access-test/c-orig.jpg',
          thumbnailPath: 'survey-images/access-test/c-thumb.jpg',
          fileName: 'c-survey.jpg',
          fileSize: 100,
          width: 100,
          height: 100,
          displayOrder: 1,
        },
      })
    ).id;
    await prisma.project.update({ where: { id: projectCId }, data: { deletedAt: new Date() } });

    // アルバム E: プロジェクト A の中の、プロジェクトの配下として指すアルバムの境界の検証用
    albumEId = (
      await prisma.constructionPhotoAlbum.create({
        data: { projectId: projectAId, name: 'アクセス判定用アルバムE' },
      })
    ).id;

    // アルバム D: プロジェクト A の中で、写真を入れてから論理削除する
    albumDId = (
      await prisma.constructionPhotoAlbum.create({
        data: { projectId: projectAId, name: 'アクセス判定用アルバムD' },
      })
    ).id;
    photoD1 = await uploadPhoto(ownerToken, albumDId, 'd1.jpg');
    await prisma.constructionPhotoAlbum.update({
      where: { id: albumDId },
      data: { deletedAt: new Date() },
    });
  });

  afterAll(async () => {
    const projects = await prisma.project.findMany({
      where: { name: { startsWith: PROJECT_NAME_PREFIX } },
      select: { id: true },
    });
    const projectIds = projects.map((p) => p.id);
    await prisma.constructionPhoto.deleteMany({
      where: { album: { projectId: { in: projectIds } } },
    });
    await prisma.constructionSignboard.deleteMany({ where: { projectId: { in: projectIds } } });
    await prisma.constructionPhotoAlbum.deleteMany({ where: { projectId: { in: projectIds } } });
    await prisma.surveyImage.deleteMany({ where: { survey: { projectId: { in: projectIds } } } });
    await prisma.siteSurvey.deleteMany({ where: { projectId: { in: projectIds } } });
    await prisma.project.deleteMany({ where: { id: { in: projectIds } } });
    await prisma.user.deleteMany({ where: { email: { in: ALL_EMAILS } } });

    const client = redis.getClient();
    if (client) {
      const keys = await client.keys('rl:*');
      if (keys.length > 0) {
        await client.del(...keys);
      }
    }

    await prisma.$disconnect();
    await redis.disconnect();
  });

  describe('前提: 利用者とロールの権限', () => {
    it('outsider はプロジェクト A の作成者・営業担当・工事担当のいずれでもなく、ロールは user だけである', async () => {
      const project = await prisma.project.findUniqueOrThrow({
        where: { id: projectAId },
        select: { createdById: true, salesPersonId: true, constructionPersonId: true },
      });
      expect(project).toEqual({
        createdById: ownerId,
        salesPersonId: ownerId,
        constructionPersonId: null,
      });
      expect(outsiderId).not.toBe(ownerId);

      const roles = await prisma.userRole.findMany({
        where: { userId: outsiderId },
        select: { role: { select: { name: true } } },
      });
      expect(roles.map((r) => r.role.name)).toEqual(['user']);
    });

    it('シードの権限の表は要件 17 のとおり、user へ閲覧・作成・編集を与え、削除を与えない', async () => {
      expect(await actionsOfRole('user', 'construction_photo')).toEqual([
        'create',
        'read',
        'update',
      ]);
      expect(await actionsOfRole('user', 'construction_signboard')).toEqual([
        'create',
        'read',
        'update',
      ]);
      // admin は全権限（閲覧・作成・編集・削除を含む）を 1 つの権限で持つ
      expect(await actionsOfRole('admin', '*')).toEqual(['*']);
    });
  });

  // Task 23.1 の利用者の判断（2026-10-03、ロールの権限の表だけで判定する）のもとで、本区間は
  // 「担当でない一般ユーザーは、権限の表が許す操作を他の利用者のプロジェクトに行える」を主張していた。
  // 同判断は 2026-10-24 の判断 A（user-authentication の要件39）と 2026-10-27 の判断（本スペックの
  // Requirement 21、要件 1.2・13.2・13.3・17.1 の改訂）で置き換えられた（タスク30.1）。主張は消さずに、
  // 担当外は不在と同じ 404 でデータベースとストレージが変わらないこと（21.2・21.3）と、工事担当者・
  // 営業担当者・作成者に設定すると同じ操作が通ること（21.1）へ書き換えた
  describe('担当でない一般ユーザーには、他の利用者のプロジェクトの工事写真が不在と同じ 404 になり、データベースとストレージは変わらない', () => {
    it('写真一覧・メタの一括更新・並び替え・原本・印字画像・アップロードはいずれも存在しない id と同じ 404 で、案件の id を返さず、書き込みも起きない', async () => {
      const auth = { Authorization: `Bearer ${outsiderToken}` };
      const before = await prisma.constructionPhoto.findMany({
        where: { albumId: albumAId },
        select: { id: true, comment: true, displayOrder: true, originalPath: true },
        orderBy: { id: 'asc' },
      });
      const filesBefore = storedFilesOfAlbum(albumAId);

      const missing = await request(app)
        .get(`/api/construction-photos/${MISSING_ID}/images`)
        .set(auth);
      expect(missing.status).toBe(404);

      const list = await request(app).get(`/api/construction-photos/${albumAId}/images`).set(auth);
      const batch = await request(app)
        .patch('/api/construction-photos/images/batch')
        .set(auth)
        .send({ items: [{ id: photoA1, comment: '担当でない利用者のコメント' }] });
      const order = await request(app)
        .put(`/api/construction-photos/${albumAId}/images/order`)
        .set(auth)
        .send({
          orders: [
            { id: photoA2, order: 1 },
            { id: photoA1, order: 2 },
          ],
        });
      const original = await request(app)
        .get(`/api/construction-photos/images/${photoA1}/original`)
        .set(auth);
      const printImage = await request(app)
        .get(`/api/construction-photos/images/${photoA2}/print-image`)
        .set(auth);
      const upload = await request(app)
        .post(`/api/construction-photos/${albumAId}/images`)
        .set(auth)
        .attach('images', validJpeg, {
          filename: 'outsider-upload.jpg',
          contentType: 'image/jpeg',
        });

      const responses = { list, batch, order, original, printImage, upload };
      expect(
        Object.fromEntries(Object.entries(responses).map(([key, res]) => [key, res.status]))
      ).toEqual({ list: 404, batch: 404, order: 404, original: 404, printImage: 404, upload: 404 });
      for (const [label, res] of Object.entries(responses)) {
        expect(res.headers['content-type'], label).not.toContain('image/');
        expect(res.body.code, label).toBe('NOT_FOUND');
        expect(res.body.detail, label).toBe(missing.body.detail);
        expect(JSON.stringify(res.body), label).not.toContain(projectAId);
      }

      const after = await prisma.constructionPhoto.findMany({
        where: { albumId: albumAId },
        select: { id: true, comment: true, displayOrder: true, originalPath: true },
        orderBy: { id: 'asc' },
      });
      expect(after).toEqual(before);
      expect(storedFilesOfAlbum(albumAId)).toEqual(filesBefore);
    });
  });

  describe('工事担当者・営業担当者・作成者に設定すると、権限の表が許す操作を他の利用者のプロジェクトに行える', () => {
    const assignments: ReadonlyArray<
      readonly [string, 'constructionPersonId' | 'salesPersonId' | 'createdById']
    > = [
      ['工事担当者', 'constructionPersonId'],
      ['営業担当者', 'salesPersonId'],
      ['作成者', 'createdById'],
    ];

    it.each(assignments)(
      '%s に設定すると、写真一覧・メタの一括更新・並び替え・原本・印字画像・アップロードが通る',
      async (_label, field) => {
        const original = await prisma.project.findUniqueOrThrow({
          where: { id: projectAId },
          select: { salesPersonId: true, constructionPersonId: true, createdById: true },
        });
        await prisma.project.update({ where: { id: projectAId }, data: { [field]: outsiderId } });
        try {
          // 写真一覧は 200 で、アルバムの写真項目を返す
          const list = await request(app)
            .get(`/api/construction-photos/${albumAId}/images`)
            .set('Authorization', `Bearer ${outsiderToken}`);
          expect(list.status).toBe(200);
          expect((list.body as Array<{ id: string }>).map((p) => p.id).sort()).toEqual(
            [photoA1, photoA2].sort()
          );

          // メタの一括更新は 200 で、コメントが書き込まれる
          const comment = `${field} に設定した利用者のコメント`;
          const batch = await request(app)
            .patch('/api/construction-photos/images/batch')
            .set('Authorization', `Bearer ${outsiderToken}`)
            .send({ items: [{ id: photoA1, comment }] });
          expect(batch.status).toBe(200);
          expect((batch.body as Array<{ id: string; comment: string | null }>)[0]).toMatchObject({
            id: photoA1,
            comment,
          });
          const row = await prisma.constructionPhoto.findUniqueOrThrow({ where: { id: photoA1 } });
          expect(row.comment).toBe(comment);

          // 並び替えは 204 で、表示順が書き込まれる
          const order = await request(app)
            .put(`/api/construction-photos/${albumAId}/images/order`)
            .set('Authorization', `Bearer ${outsiderToken}`)
            .send({
              orders: [
                { id: photoA2, order: 1 },
                { id: photoA1, order: 2 },
              ],
            });
          expect(order.status).toBe(204);
          const rows = await prisma.constructionPhoto.findMany({
            where: { albumId: albumAId },
            orderBy: { displayOrder: 'asc' },
            select: { id: true },
          });
          expect(rows.map((r) => r.id)).toEqual([photoA2, photoA1]);

          // 原本は 200 で、作成者が取得する原本と同じバイト列を返す
          const asOwner = await request(app)
            .get(`/api/construction-photos/images/${photoA1}/original`)
            .set('Authorization', `Bearer ${ownerToken}`)
            .responseType('blob');
          expect(asOwner.status).toBe(200);
          const originalImage = await request(app)
            .get(`/api/construction-photos/images/${photoA1}/original`)
            .set('Authorization', `Bearer ${outsiderToken}`)
            .responseType('blob');
          expect(originalImage.status).toBe(200);
          expect(originalImage.headers['content-type']).toContain('image/');
          expect(Buffer.compare(originalImage.body as Buffer, asOwner.body as Buffer)).toBe(0);

          // 印字画像は 200 で、看板を配置した写真項目では看板を重畳した画像を返す
          const originalA2 = await request(app)
            .get(`/api/construction-photos/images/${photoA2}/original`)
            .set('Authorization', `Bearer ${outsiderToken}`)
            .responseType('blob');
          expect(originalA2.status).toBe(200);
          const printImage = await request(app)
            .get(`/api/construction-photos/images/${photoA2}/print-image`)
            .set('Authorization', `Bearer ${outsiderToken}`)
            .responseType('blob');
          expect(printImage.status).toBe(200);
          expect(printImage.headers['content-type']).toContain('image/jpeg');
          // 空の応答でも原本と異なるため、中身があることを先に主張する
          expect((originalA2.body as Buffer).length).toBeGreaterThan(0);
          expect((printImage.body as Buffer).length).toBeGreaterThan(0);
          expect(Buffer.compare(printImage.body as Buffer, originalA2.body as Buffer)).not.toBe(0);

          // アップロードは 201 で、写真項目が一覧に加わる
          const uploadedId = await uploadPhoto(outsiderToken, albumAId, `outsider-${field}.jpg`);
          const listAfter = await request(app)
            .get(`/api/construction-photos/${albumAId}/images`)
            .set('Authorization', `Bearer ${outsiderToken}`);
          expect(listAfter.status).toBe(200);
          expect((listAfter.body as Array<{ id: string }>).map((p) => p.id)).toContain(uploadedId);
          await prisma.constructionPhoto.deleteMany({ where: { id: uploadedId } });
        } finally {
          await prisma.project.update({ where: { id: projectAId }, data: original });
        }
      }
    );
  });

  describe('権限の表が許さない操作は拒否する（写真項目の削除）', () => {
    it('user ロールは construction_photo:delete を持たないため、写真項目の削除は 403 で、行は残る', async () => {
      const res = await request(app)
        .delete(`/api/construction-photos/images/${photoA1}`)
        .set('Authorization', `Bearer ${outsiderToken}`);

      expect(res.status).toBe(403);
      expect(await prisma.constructionPhoto.findUnique({ where: { id: photoA1 } })).not.toBeNull();
    });

    it('担当者（作成者・営業担当）でも user ロールなら写真項目の削除は 403 で、行は残る', async () => {
      const res = await request(app)
        .delete(`/api/construction-photos/images/${photoA1}`)
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(res.status).toBe(403);
      expect(await prisma.constructionPhoto.findUnique({ where: { id: photoA1 } })).not.toBeNull();
    });

    it('担当でない admin は削除の権限を持つため、写真項目の削除は 204 で、行が消える', async () => {
      const target = await uploadPhoto(ownerToken, albumAId, 'admin-delete.jpg');

      const res = await request(app)
        .delete(`/api/construction-photos/images/${target}`)
        .set('Authorization', `Bearer ${adminOutsiderToken}`);

      expect(res.status).toBe(204);
      expect(await prisma.constructionPhoto.findUnique({ where: { id: target } })).toBeNull();
    });
  });

  describe('未認証は 401（判定を広げていない）', () => {
    // パスはテストの実行時に組み立てる（id は beforeAll で決まる）
    const cases: ReadonlyArray<
      readonly [string, 'get' | 'patch' | 'put' | 'delete', () => string]
    > = [
      ['写真一覧', 'get', (): string => `/api/construction-photos/${albumAId}/images`],
      ['メタの一括更新', 'patch', (): string => '/api/construction-photos/images/batch'],
      ['並び替え', 'put', (): string => `/api/construction-photos/${albumAId}/images/order`],
      ['原本', 'get', (): string => `/api/construction-photos/images/${photoA1}/original`],
      ['印字画像', 'get', (): string => `/api/construction-photos/images/${photoA1}/print-image`],
      ['写真項目の削除', 'delete', (): string => `/api/construction-photos/images/${photoA1}`],
    ];
    it.each(cases)('%s は認証が無いと 401', async (_label, method, path) => {
      const res = await request(app)[method](path());
      expect(res.status).toBe(401);
    });
  });

  describe('権限なしは 403（判定を広げていない）', () => {
    it('ロールを持たない利用者は、写真一覧・メタの一括更新・並び替え・原本・印字画像・削除のいずれも 403 で、書き込みも起きない', async () => {
      const before = await prisma.constructionPhoto.findUniqueOrThrow({ where: { id: photoA1 } });
      const auth = { Authorization: `Bearer ${noPermissionToken}` };

      const list = await request(app).get(`/api/construction-photos/${albumAId}/images`).set(auth);
      const batch = await request(app)
        .patch('/api/construction-photos/images/batch')
        .set(auth)
        .send({ items: [{ id: photoA1, comment: '権限なしの書き込み' }] });
      const order = await request(app)
        .put(`/api/construction-photos/${albumAId}/images/order`)
        .set(auth)
        .send({ orders: [{ id: photoA1, order: 1 }] });
      const original = await request(app)
        .get(`/api/construction-photos/images/${photoA1}/original`)
        .set(auth);
      const printImage = await request(app)
        .get(`/api/construction-photos/images/${photoA1}/print-image`)
        .set(auth);
      const del = await request(app).delete(`/api/construction-photos/images/${photoA1}`).set(auth);

      expect({
        list: list.status,
        batch: batch.status,
        order: order.status,
        original: original.status,
        printImage: printImage.status,
        delete: del.status,
      }).toEqual({
        list: 403,
        batch: 403,
        order: 403,
        original: 403,
        printImage: 403,
        delete: 403,
      });

      const after = await prisma.constructionPhoto.findUniqueOrThrow({ where: { id: photoA1 } });
      expect({ comment: after.comment, displayOrder: after.displayOrder }).toEqual({
        comment: before.comment,
        displayOrder: before.displayOrder,
      });
    });
  });

  // 以降の区間は、プロジェクトの境界・取り除かれたプロジェクト・論理削除の扱い（Task 23.1 の所属の判定、
  // construction-photo-availability）を主張する。主張の対象は案件の閲覧範囲ではないため、範囲内の
  // 一般ユーザー（プロジェクト A・B・C の作成者・営業担当の owner）で要求する（タスク30.1 で前提を整えた。
  // 担当外の利用者では閲覧範囲の判定が先に 404 を返し、所属の判定へ届かない）
  describe('プロジェクトの境界は保つ（別のプロジェクトの id を混ぜた要求は拒否する）', () => {
    it('別のプロジェクトのアルバムを指す並び替えに他プロジェクトの写真項目を渡すと 404 で、表示順は変わらない', async () => {
      const before = await prisma.constructionPhoto.findUniqueOrThrow({ where: { id: photoA1 } });

      const res = await request(app)
        .put(`/api/construction-photos/${albumBId}/images/order`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          orders: [
            { id: photoB1, order: 2 },
            { id: photoA1, order: 1 },
          ],
        });

      expect(res.status).toBe(404);
      const after = await prisma.constructionPhoto.findUniqueOrThrow({ where: { id: photoA1 } });
      expect(after.displayOrder).toBe(before.displayOrder);
    });

    it('別のプロジェクトの看板を指定するメタの一括更新は 404 で、看板は指定されない', async () => {
      const res = await request(app)
        .patch('/api/construction-photos/images/batch')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ items: [{ id: photoA1, signboardId: signboardBId }] });

      expect(res.status).toBe(404);
      expect(res.body.code).toBe('SIGNBOARD_NOT_ALLOWED');
      const row = await prisma.constructionPhoto.findUniqueOrThrow({ where: { id: photoA1 } });
      expect(row.signboardId).toBeNull();
    });

    it('2 つのプロジェクトの写真項目を混ぜたメタの一括更新は 400 で、どちらにも書き込まない', async () => {
      const res = await request(app)
        .patch('/api/construction-photos/images/batch')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          items: [
            { id: photoA1, comment: '混在A' },
            { id: photoB1, comment: '混在B' },
          ],
        });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('CONSTRUCTION_PHOTO_BATCH_ALBUM_MISMATCH');
      const rows = await prisma.constructionPhoto.findMany({
        where: { id: { in: [photoA1, photoB1] } },
        select: { comment: true },
      });
      expect(rows).toHaveLength(2);
      expect(rows.map((r) => r.comment)).not.toContain('混在A');
      expect(rows.map((r) => r.comment)).not.toContain('混在B');
    });

    it('別のプロジェクトの配下としてアルバムを取得すると 404（自プロジェクトの配下なら 200）', async () => {
      const wrong = await request(app)
        .get(`/api/projects/${projectBId}/construction-photos/${albumAId}`)
        .set('Authorization', `Bearer ${ownerToken}`);
      const right = await request(app)
        .get(`/api/projects/${projectAId}/construction-photos/${albumAId}`)
        .set('Authorization', `Bearer ${ownerToken}`);

      expect({ wrong: wrong.status, right: right.status }).toEqual({ wrong: 404, right: 200 });
    });

    it('写真項目を別のプロジェクトのアルバムの配下として指すと、原本・印字画像・メタの一括更新・削除は 404 で、書き込みも起きない', async () => {
      // 写真項目の操作は /api/construction-photos/images/... で提供するが、同じルーターをアルバムの
      // 配下（/api/construction-photos/:id/images/...）にも載せている。アルバムの配下として指した
      // ときは、写真項目がそのアルバムに属さなければ解決しない
      const before = await prisma.constructionPhoto.findUniqueOrThrow({ where: { id: photoA1 } });
      const base = `/api/construction-photos/${albumBId}/images`;

      const original = await request(app)
        .get(`${base}/${photoA1}/original`)
        .set('Authorization', `Bearer ${ownerToken}`);
      const printImage = await request(app)
        .get(`${base}/${photoA1}/print-image`)
        .set('Authorization', `Bearer ${ownerToken}`);
      const batch = await request(app)
        .patch(`${base}/batch`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ items: [{ id: photoA1, comment: '別のアルバムの配下からの書き込み' }] });
      const del = await request(app)
        .delete(`${base}/${photoA1}`)
        .set('Authorization', `Bearer ${adminOutsiderToken}`);

      expect({
        original: original.status,
        printImage: printImage.status,
        batch: batch.status,
        delete: del.status,
      }).toEqual({ original: 404, printImage: 404, batch: 404, delete: 404 });

      const after = await prisma.constructionPhoto.findUnique({ where: { id: photoA1 } });
      expect(after?.comment).toBe(before.comment);
    });

    it('写真項目を自身のアルバムの配下として指すときは、原本を返す（対照）', async () => {
      const res = await request(app)
        .get(`/api/construction-photos/${albumAId}/images/${photoA1}/original`)
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(res.status).toBe(200);
    });

    it('別のプロジェクトの配下として看板を更新すると 404 で、看板は書き換わらない', async () => {
      const signboard = await prisma.constructionSignboard.findUniqueOrThrow({
        where: { id: signboardAId },
      });

      const res = await request(app)
        .patch(`/api/projects/${projectBId}/construction-signboards/${signboardAId}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ workName: '境界を越えた書き換え', updatedAt: signboard.updatedAt.toISOString() });

      expect(res.status).toBe(404);
      const after = await prisma.constructionSignboard.findUniqueOrThrow({
        where: { id: signboardAId },
      });
      expect(after.workName).toBe('A工事');
    });
  });

  describe('取り除かれたプロジェクト・論理削除済みのアルバム・存在しない id は 404', () => {
    it('取り除かれたプロジェクトの写真一覧・メタの一括更新・並び替え・原本・印字画像は 404 で、書き込みも起きない', async () => {
      const auth = { Authorization: `Bearer ${ownerToken}` };

      const list = await request(app).get(`/api/construction-photos/${albumCId}/images`).set(auth);
      const batch = await request(app)
        .patch('/api/construction-photos/images/batch')
        .set(auth)
        .send({ items: [{ id: photoC1, comment: '取り除かれたプロジェクトへの書き込み' }] });
      const order = await request(app)
        .put(`/api/construction-photos/${albumCId}/images/order`)
        .set(auth)
        .send({ orders: [{ id: photoC1, order: 5 }] });
      const original = await request(app)
        .get(`/api/construction-photos/images/${photoC1}/original`)
        .set(auth);
      const printImage = await request(app)
        .get(`/api/construction-photos/images/${photoC1}/print-image`)
        .set(auth);

      expect({
        list: list.status,
        batch: batch.status,
        order: order.status,
        original: original.status,
        printImage: printImage.status,
      }).toEqual({ list: 404, batch: 404, order: 404, original: 404, printImage: 404 });

      const row = await prisma.constructionPhoto.findUniqueOrThrow({ where: { id: photoC1 } });
      expect({ comment: row.comment, displayOrder: row.displayOrder }).toEqual({
        comment: null,
        displayOrder: 1,
      });
    });

    it('取り除かれたプロジェクトのアルバムへのアップロードは 404 で、写真項目は増えない', async () => {
      const res = await request(app)
        .post(`/api/construction-photos/${albumCId}/images`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .attach('images', validJpeg, { filename: 'removed.jpg', contentType: 'image/jpeg' });

      expect(res.status).toBe(404);
      expect(await prisma.constructionPhoto.count({ where: { albumId: albumCId } })).toBe(1);
    });

    it('取り除かれたプロジェクトの写真項目の削除は、削除の権限を持つ admin でも 404 で、行は残る', async () => {
      const res = await request(app)
        .delete(`/api/construction-photos/images/${photoC1}`)
        .set('Authorization', `Bearer ${adminOutsiderToken}`);

      expect(res.status).toBe(404);
      expect(await prisma.constructionPhoto.findUnique({ where: { id: photoC1 } })).not.toBeNull();
    });

    it('論理削除済みのアルバムの写真一覧・メタの一括更新・並び替え・原本・印字画像・削除は 404', async () => {
      const auth = { Authorization: `Bearer ${adminOutsiderToken}` };

      const list = await request(app).get(`/api/construction-photos/${albumDId}/images`).set(auth);
      const batch = await request(app)
        .patch('/api/construction-photos/images/batch')
        .set(auth)
        .send({ items: [{ id: photoD1, comment: '論理削除済みのアルバムへの書き込み' }] });
      const order = await request(app)
        .put(`/api/construction-photos/${albumDId}/images/order`)
        .set(auth)
        .send({ orders: [{ id: photoD1, order: 5 }] });
      const original = await request(app)
        .get(`/api/construction-photos/images/${photoD1}/original`)
        .set(auth);
      const printImage = await request(app)
        .get(`/api/construction-photos/images/${photoD1}/print-image`)
        .set(auth);
      const del = await request(app).delete(`/api/construction-photos/images/${photoD1}`).set(auth);

      expect({
        list: list.status,
        batch: batch.status,
        order: order.status,
        original: original.status,
        printImage: printImage.status,
        delete: del.status,
      }).toEqual({
        list: 404,
        batch: 404,
        order: 404,
        original: 404,
        printImage: 404,
        delete: 404,
      });

      const row = await prisma.constructionPhoto.findUniqueOrThrow({ where: { id: photoD1 } });
      expect({ comment: row.comment, displayOrder: row.displayOrder }).toEqual({
        comment: null,
        displayOrder: 1,
      });
    });

    it('存在しないアルバム・写真項目の id は 404', async () => {
      const auth = { Authorization: `Bearer ${ownerToken}` };

      const list = await request(app)
        .get(`/api/construction-photos/${MISSING_ID}/images`)
        .set(auth);
      const batch = await request(app)
        .patch('/api/construction-photos/images/batch')
        .set(auth)
        .send({ items: [{ id: MISSING_ID, comment: 'x' }] });
      const order = await request(app)
        .put(`/api/construction-photos/${albumAId}/images/order`)
        .set(auth)
        .send({ orders: [{ id: MISSING_ID, order: 1 }] });
      const original = await request(app)
        .get(`/api/construction-photos/images/${MISSING_ID}/original`)
        .set(auth);
      const printImage = await request(app)
        .get(`/api/construction-photos/images/${MISSING_ID}/print-image`)
        .set(auth);

      expect({
        list: list.status,
        batch: batch.status,
        order: order.status,
        original: original.status,
        printImage: printImage.status,
      }).toEqual({ list: 404, batch: 404, order: 404, original: 404, printImage: 404 });
    });
  });
  describe('取り除かれたプロジェクトのアルバム・看板は、一覧・取得・更新・削除のいずれも 404', () => {
    it('取り除かれたプロジェクトのアルバムの一覧は 404 で、アルバムも署名付き URL も返さない', async () => {
      const res = await request(app)
        .get(`/api/projects/${projectCId}/construction-photos`)
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(res.status).toBe(404);
      expect(res.body.data).toBeUndefined();
      const body = JSON.stringify(res.body);
      expect(body).not.toContain(albumCId);
      expect(body).not.toContain('thumbnailUrl');
      expect(body).not.toContain('construction-photos/');
    });

    it('取り除かれたプロジェクトのアルバムの取得は、flat でもプロジェクトの配下でも 404', async () => {
      const flat = await request(app)
        .get(`/api/construction-photos/${albumCId}`)
        .set('Authorization', `Bearer ${ownerToken}`);
      const nested = await request(app)
        .get(`/api/projects/${projectCId}/construction-photos/${albumCId}`)
        .set('Authorization', `Bearer ${ownerToken}`);

      expect({ flat: flat.status, nested: nested.status }).toEqual({ flat: 404, nested: 404 });
      expect(JSON.stringify(flat.body)).not.toContain('アクセス判定用アルバムC');
    });

    it('取り除かれたプロジェクトのアルバムの更新は 404 で、名前は書き換わらない', async () => {
      const album = await prisma.constructionPhotoAlbum.findUniqueOrThrow({
        where: { id: albumCId },
      });

      const res = await request(app)
        .patch(`/api/construction-photos/${albumCId}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          name: '取り除かれたプロジェクトへの書き換え',
          updatedAt: album.updatedAt.toISOString(),
        });

      expect(res.status).toBe(404);
      const after = await prisma.constructionPhotoAlbum.findUniqueOrThrow({
        where: { id: albumCId },
      });
      expect(after.name).toBe('アクセス判定用アルバムC');
      expect(after.updatedAt.getTime()).toBe(album.updatedAt.getTime());
    });

    it('取り除かれたプロジェクトのアルバムの削除は、削除の権限を持つ admin でも 404 で、論理削除されない', async () => {
      const res = await request(app)
        .delete(`/api/construction-photos/${albumCId}`)
        .set('Authorization', `Bearer ${adminOutsiderToken}`);

      expect(res.status).toBe(404);
      const after = await prisma.constructionPhotoAlbum.findUniqueOrThrow({
        where: { id: albumCId },
      });
      expect(after.deletedAt).toBeNull();
    });

    it('取り除かれたプロジェクトの看板の一覧は 404 で、看板を返さない', async () => {
      const res = await request(app)
        .get(`/api/projects/${projectCId}/construction-signboards`)
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(res.status).toBe(404);
      expect(Array.isArray(res.body)).toBe(false);
      expect(JSON.stringify(res.body)).not.toContain(signboardCId);
    });

    it('取り除かれたプロジェクトの看板の更新は、flat でもプロジェクトの配下でも 404 で、書き換わらない', async () => {
      const signboard = await prisma.constructionSignboard.findUniqueOrThrow({
        where: { id: signboardCId },
      });
      const body = {
        workName: '取り除かれたプロジェクトへの書き換え',
        updatedAt: signboard.updatedAt.toISOString(),
      };

      const flat = await request(app)
        .patch(`/api/construction-signboards/${signboardCId}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send(body);
      const nested = await request(app)
        .patch(`/api/projects/${projectCId}/construction-signboards/${signboardCId}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send(body);

      expect({ flat: flat.status, nested: nested.status }).toEqual({ flat: 404, nested: 404 });
      const after = await prisma.constructionSignboard.findUniqueOrThrow({
        where: { id: signboardCId },
      });
      expect(after.workName).toBe('C工事');
      expect(after.updatedAt.getTime()).toBe(signboard.updatedAt.getTime());
    });

    it('取り除かれたプロジェクトの看板の削除は admin でも 404 で、看板は残り、写真項目の看板の指定も解除されない', async () => {
      const res = await request(app)
        .delete(`/api/construction-signboards/${signboardCId}`)
        .set('Authorization', `Bearer ${adminOutsiderToken}`);

      expect(res.status).toBe(404);
      const signboard = await prisma.constructionSignboard.findUniqueOrThrow({
        where: { id: signboardCId },
      });
      expect(signboard.deletedAt).toBeNull();
      const photo = await prisma.constructionPhoto.findUniqueOrThrow({ where: { id: photoC1 } });
      expect(photo.signboardId).toBe(signboardCId);
      expect(photo.signboardPlacement).toEqual({ left: 5, top: 5, width: 100, height: 60 });
    });

    it('取り除かれたプロジェクトのアルバムへの現調写真のコピーは 404 で、写真項目は増えない', async () => {
      const res = await request(app)
        .post(`/api/construction-photos/${albumCId}/images/from-surveys`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ surveyImageIds: [surveyImageCId] });

      expect(res.status).toBe(404);
      expect(await prisma.constructionPhoto.count({ where: { albumId: albumCId } })).toBe(1);
    });
  });

  describe('プロジェクトの配下として指したアルバムの更新・削除は、そのプロジェクトのアルバムに限る', () => {
    it('別のプロジェクトの配下としてアルバムを更新すると 404 で、名前は書き換わらない', async () => {
      const album = await prisma.constructionPhotoAlbum.findUniqueOrThrow({
        where: { id: albumEId },
      });

      const res = await request(app)
        .patch(`/api/projects/${projectBId}/construction-photos/${albumEId}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: '境界を越えた書き換え', updatedAt: album.updatedAt.toISOString() });

      expect(res.status).toBe(404);
      const after = await prisma.constructionPhotoAlbum.findUniqueOrThrow({
        where: { id: albumEId },
      });
      expect(after.name).toBe('アクセス判定用アルバムE');
      expect(after.updatedAt.getTime()).toBe(album.updatedAt.getTime());
    });

    it('存在しないプロジェクトの配下としてアルバムを更新すると、版の照合（409）より先に 404 になる', async () => {
      const res = await request(app)
        .patch(`/api/projects/${MISSING_ID}/construction-photos/${albumEId}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          name: '存在しないプロジェクトからの書き換え',
          updatedAt: '2000-01-01T00:00:00.000Z',
        });

      expect(res.status).toBe(404);
      const after = await prisma.constructionPhotoAlbum.findUniqueOrThrow({
        where: { id: albumEId },
      });
      expect(after.name).toBe('アクセス判定用アルバムE');
    });

    it('別のプロジェクトの配下としてアルバムを削除すると admin でも 404 で、論理削除されない', async () => {
      const res = await request(app)
        .delete(`/api/projects/${projectBId}/construction-photos/${albumEId}`)
        .set('Authorization', `Bearer ${adminOutsiderToken}`);

      expect(res.status).toBe(404);
      const after = await prisma.constructionPhotoAlbum.findUniqueOrThrow({
        where: { id: albumEId },
      });
      expect(after.deletedAt).toBeNull();
    });

    it('自身のプロジェクトの配下として、また flat に指せば、更新・削除できる（対照）', async () => {
      const album = await prisma.constructionPhotoAlbum.findUniqueOrThrow({
        where: { id: albumEId },
      });

      const nested = await request(app)
        .patch(`/api/projects/${projectAId}/construction-photos/${albumEId}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: 'アルバムE（配下から更新）', updatedAt: album.updatedAt.toISOString() });
      expect(nested.status).toBe(200);
      expect(nested.body.name).toBe('アルバムE（配下から更新）');

      const flat = await request(app)
        .patch(`/api/construction-photos/${albumEId}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: 'アルバムE（flat で更新）', updatedAt: nested.body.updatedAt as string });
      expect(flat.status).toBe(200);
      expect(flat.body.name).toBe('アルバムE（flat で更新）');

      const del = await request(app)
        .delete(`/api/projects/${projectAId}/construction-photos/${albumEId}`)
        .set('Authorization', `Bearer ${adminOutsiderToken}`);
      expect(del.status).toBe(204);
      const after = await prisma.constructionPhotoAlbum.findUniqueOrThrow({
        where: { id: albumEId },
      });
      expect(after.deletedAt).not.toBeNull();
    });
  });
});

/**
 * 被覆印（construction-photo）。本ファイルの検証が確かめる受入基準。
 * 13.2 は「リソースが、実在し取り除かれていないプロジェクトに属することの確認」
 * （取り除かれたプロジェクト・別のプロジェクトの id の拒否）、13.3 は「アクセス権のない
 * プロジェクトのリソースへのアクセスの拒否」（権限なしの 403、取り除かれたプロジェクトの 404）。
 * @requirement construction-photo/REQ-13.2
 * @requirement construction-photo/REQ-13.3
 */
