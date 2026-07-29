/**
 * @fileoverview 工事写真アップロード・一覧取得API統合テスト
 *
 * Task 2.2: 写真アップロード（ローカル/カメラ）サービス＋ルート
 * Task 2.4: 写真一覧取得（署名URL一括）サービス＋ルート
 *
 * Requirements coverage:
 * - 4.1, 4.2, 4.3: multipart で複数画像を写真項目として登録しサムネ生成
 * - 4.7: 追加した写真項目は末尾の表示順に配置
 * - 5.1, 5.2: カメラ撮影もサーバ側は同一の multipart 経路
 * - 7.8, 11.2: 一覧は写真項目＋署名付きURLを1リクエストでまとめて返す（N+1回避）
 * - 11.3: 一覧はサムネ優先（原本URLを返さない）
 * - 12.1, 12.3: 件数上限（10件）超過を拒否
 * - 12.2, 12.3: サイズ上限（10MB）超過を拒否
 * - 12.4, 4.5: 不正な画像形式（マジックバイト不一致）を拒否
 * - 12.5: 部分失敗時、成功分は登録を維持
 * - 13.1, 13.2, 13.3: 認証・認可（401）・プロジェクト境界（404）
 *
 * Scope:
 * - 二重マウント（nested `/api/construction-photos/:id/images`）
 * - 実ストレージ（STORAGE_TYPE=local）＋実 sharp による処理
 * - テストは自己クリーンアップ
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { validateEnv } from '../../config/env.js';
import type { PrismaClient } from '../../generated/prisma/client.js';

validateEnv();

import app from '../../app.js';
import getPrismaClient from '../../db.js';
import redis, { initRedis } from '../../redis.js';
import { seedRoles, seedPermissions, seedRolePermissions } from '../../utils/seed-helpers.js';
import { initializeConstructionPhotoImageServices } from '../../routes/construction-photo-images.routes.js';

describe('Construction Photo Image Upload API Integration Tests', () => {
  let prisma: PrismaClient;
  let testUserId: string;
  let projectId: string;
  let albumId: string;
  let accessToken: string;

  let validJpeg: Buffer;
  let validPng: Buffer;

  const TEST_EMAIL = 'test-construction-photo-image-integration@example.com';
  const PROJECT_NAME = 'Construction Photo Image Integration Test Project';

  const createAuthenticatedUser = async (
    email: string,
    displayName: string,
    roles: string[] = ['user']
  ): Promise<{ userId: string; accessToken: string }> => {
    const { hash } = await import('@node-rs/argon2');
    const passwordHash = await hash('TestPassword123!@#', {
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4,
    });

    const user = await prisma.user.create({ data: { email, displayName, passwordHash } });

    for (const roleName of roles) {
      const role = await prisma.role.findUnique({ where: { name: roleName } });
      if (role) {
        await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });
      }
    }

    const loginResponse = await request(app).post('/api/v1/auth/login').send({
      email,
      password: 'TestPassword123!@#',
    });

    return { userId: user.id, accessToken: loginResponse.body.accessToken };
  };

  beforeAll(async () => {
    prisma = getPrismaClient();
    await initRedis();
    // ストレージ依存サービスの初期化を保証（モジュール読み込み時初期化のレース回避）
    await initializeConstructionPhotoImageServices();

    await seedRoles(prisma);
    await seedPermissions(prisma);
    await seedRolePermissions(prisma);

    // construction_photo 権限を確実に用意し user ロールへ付与
    const photoPermissions = [
      { resource: 'construction_photo', action: 'create' },
      { resource: 'construction_photo', action: 'read' },
      { resource: 'construction_photo', action: 'update' },
      { resource: 'construction_photo', action: 'delete' },
    ];
    for (const perm of photoPermissions) {
      const existing = await prisma.permission.findUnique({
        where: { resource_action: { resource: perm.resource, action: perm.action } },
      });
      if (!existing) {
        await prisma.permission.create({
          data: {
            resource: perm.resource,
            action: perm.action,
            description: `工事写真 ${perm.action}`,
          },
        });
      }
    }
    const userRole = await prisma.role.findUnique({ where: { name: 'user' } });
    if (userRole) {
      for (const perm of photoPermissions) {
        const permRecord = await prisma.permission.findUnique({
          where: { resource_action: { resource: perm.resource, action: perm.action } },
        });
        if (permRecord) {
          const existing = await prisma.rolePermission.findFirst({
            where: { roleId: userRole.id, permissionId: permRecord.id },
          });
          if (!existing) {
            await prisma.rolePermission.create({
              data: { roleId: userRole.id, permissionId: permRecord.id },
            });
          }
        }
      }
    }

    const testUserData = await createAuthenticatedUser(
      TEST_EMAIL,
      'Construction Photo Image Test User',
      ['user']
    );
    testUserId = testUserData.userId;
    accessToken = testUserData.accessToken;

    const project = await prisma.project.create({
      data: { name: PROJECT_NAME, salesPersonId: testUserId, createdById: testUserId },
    });
    projectId = project.id;

    const album = await prisma.constructionPhotoAlbum.create({
      data: { projectId, name: 'アップロード用アルバム' },
    });
    albumId = album.id;

    // 実 sharp で有効な小さい画像を生成
    const sharp = (await import('sharp')).default;
    validJpeg = await sharp({
      create: { width: 24, height: 24, channels: 3, background: { r: 200, g: 30, b: 30 } },
    })
      .jpeg()
      .toBuffer();
    validPng = await sharp({
      create: {
        width: 24,
        height: 24,
        channels: 4,
        background: { r: 30, g: 200, b: 30, alpha: 1 },
      },
    })
      .png()
      .toBuffer();
  });

  afterAll(async () => {
    await prisma.constructionPhoto.deleteMany({ where: { albumId } });
    await prisma.constructionPhotoAlbum.deleteMany({ where: { projectId } });
    await prisma.project.deleteMany({ where: { name: PROJECT_NAME } });
    await prisma.user.deleteMany({ where: { email: TEST_EMAIL } });

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

  describe('認証（REQ 13.1, 13.3）', () => {
    it('認証なしのアップロードは401を返す', async () => {
      const res = await request(app)
        .post(`/api/construction-photos/${albumId}/images`)
        .attach('images', validJpeg, { filename: 'a.jpg', contentType: 'image/jpeg' });
      expect(res.status).toBe(401);
    });
  });

  describe('アップロード（REQ 4.1, 4.2, 4.3, 4.7, 5.1, 5.2）', () => {
    it('複数画像を写真項目として登録しサムネ生成・末尾表示順で返す', async () => {
      const res = await request(app)
        .post(`/api/construction-photos/${albumId}/images`)
        .set('Authorization', `Bearer ${accessToken}`)
        .attach('images', validJpeg, { filename: 'first.jpg', contentType: 'image/jpeg' })
        .attach('images', validPng, { filename: 'second.png', contentType: 'image/png' });

      expect(res.status).toBe(201);
      expect(res.body.failed).toHaveLength(0);
      expect(res.body.successful).toHaveLength(2);

      const [p1, p2] = res.body.successful;
      expect(p1.albumId).toBe(albumId);
      expect(p1.width).toBeGreaterThan(0);
      expect(p1.height).toBeGreaterThan(0);
      // サムネ用の署名付き（またはローカル公開）URL が付く（REQ 4.3, 11.6）
      expect(p1.thumbnailUrl).toBeTruthy();
      // 印字画像エンドポイントURL（REQ 10 用の土台）
      expect(p1.printImageUrl).toBe(`/api/construction-photos/images/${p1.id}/print-image`);
      // 末尾表示順に連番配置（REQ 4.7）
      expect(p2.displayOrder).toBe(p1.displayOrder + 1);

      // DBに登録されている
      const count = await prisma.constructionPhoto.count({ where: { albumId } });
      expect(count).toBe(2);
    });

    it('追加アップロードは既存の末尾より後ろに配置される（REQ 4.7）', async () => {
      const before = await prisma.constructionPhoto.findFirst({
        where: { albumId },
        orderBy: { displayOrder: 'desc' },
        select: { displayOrder: true },
      });
      const prevMax = before?.displayOrder ?? 0;

      const res = await request(app)
        .post(`/api/construction-photos/${albumId}/images`)
        .set('Authorization', `Bearer ${accessToken}`)
        .attach('images', validJpeg, { filename: 'third.jpg', contentType: 'image/jpeg' });

      expect(res.status).toBe(201);
      expect(res.body.successful[0].displayOrder).toBe(prevMax + 1);
    });
  });

  describe('制約・バリデーション（REQ 12.1〜12.5）', () => {
    it('不正な画像形式（マジックバイト不一致）は failed で拒否し成功分は維持（REQ 4.5, 12.4, 12.5）', async () => {
      const bogus = Buffer.from('this is definitely not an image');

      const res = await request(app)
        .post(`/api/construction-photos/${albumId}/images`)
        .set('Authorization', `Bearer ${accessToken}`)
        .attach('images', validJpeg, { filename: 'ok.jpg', contentType: 'image/jpeg' })
        .attach('images', bogus, { filename: 'bad.jpg', contentType: 'image/jpeg' });

      // 部分失敗 → 207
      expect(res.status).toBe(207);
      expect(res.body.successful).toHaveLength(1);
      expect(res.body.successful[0].fileName).toContain('ok');
      expect(res.body.failed).toHaveLength(1);
      expect(res.body.failed[0].fileName).toBe('bad.jpg');
    });

    it('ファイル数上限（10件）を超えると拒否する（REQ 12.1, 12.3）', async () => {
      let req = request(app)
        .post(`/api/construction-photos/${albumId}/images`)
        .set('Authorization', `Bearer ${accessToken}`);
      for (let i = 0; i < 11; i++) {
        req = req.attach('images', validJpeg, { filename: `f${i}.jpg`, contentType: 'image/jpeg' });
      }
      const res = await req;
      expect(res.status).toBe(400);
    });

    it('ファイルサイズ上限（10MB）を超えると413で拒否する（REQ 12.2, 12.3）', async () => {
      const tooLarge = Buffer.alloc(10 * 1024 * 1024 + 1, 0xff);
      const res = await request(app)
        .post(`/api/construction-photos/${albumId}/images`)
        .set('Authorization', `Bearer ${accessToken}`)
        .attach('images', tooLarge, { filename: 'big.jpg', contentType: 'image/jpeg' });
      expect(res.status).toBe(413);
    });

    it('存在しないアルバムへのアップロードは404を返す', async () => {
      const res = await request(app)
        .post('/api/construction-photos/99999999-9999-4999-8999-999999999999/images')
        .set('Authorization', `Bearer ${accessToken}`)
        .attach('images', validJpeg, { filename: 'a.jpg', contentType: 'image/jpeg' });
      expect(res.status).toBe(404);
    });
  });

  // 一覧取得（署名URL一括） Task 2.4（REQ 7.8, 11.2, 11.3, 13.2）
  describe('一覧取得（署名URL一括, REQ 7.8, 11.2, 11.3, 13.2）', () => {
    const OUTSIDER_EMAIL = 'test-construction-photo-image-outsider@example.com';
    let outsiderToken: string;

    beforeAll(async () => {
      // 当該プロジェクトの関係者でなく admin でもないユーザー（プロジェクト境界検証用）
      const outsider = await createAuthenticatedUser(
        OUTSIDER_EMAIL,
        'Construction Photo Image Outsider',
        ['user']
      );
      outsiderToken = outsider.accessToken;
    });

    afterAll(async () => {
      await prisma.user.deleteMany({ where: { email: OUTSIDER_EMAIL } });
    });

    it('詳細1リクエストで全写真項目＋署名付きURLを displayOrder 昇順で返す（REQ 7.8, 11.2, 11.3）', async () => {
      const res = await request(app)
        .get(`/api/construction-photos/${albumId}/images`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);

      // これまでのアップロードで登録済みの写真項目がすべて返る
      const dbCount = await prisma.constructionPhoto.count({ where: { albumId } });
      expect(res.body).toHaveLength(dbCount);
      expect(dbCount).toBeGreaterThan(1);

      // displayOrder 昇順
      const orders = res.body.map((p: { displayOrder: number }) => p.displayOrder);
      expect(orders).toEqual([...orders].sort((a, b) => a - b));

      // サムネ優先: thumbnailUrl 同梱・印字画像URL・原本URLは含まない（REQ 11.3）
      for (const photo of res.body) {
        expect(photo.albumId).toBe(albumId);
        expect(photo.thumbnailUrl).toBeTruthy();
        expect(photo.printImageUrl).toBe(`/api/construction-photos/images/${photo.id}/print-image`);
        expect(photo.originalUrl).toBeUndefined();
      }
    });

    it('認証なしの一覧取得は401を返す（REQ 13.1）', async () => {
      const res = await request(app).get(`/api/construction-photos/${albumId}/images`);
      expect(res.status).toBe(401);
    });

    it('存在しないアルバムの一覧取得は404を返す', async () => {
      const res = await request(app)
        .get('/api/construction-photos/99999999-9999-4999-8999-999999999999/images')
        .set('Authorization', `Bearer ${accessToken}`);
      expect(res.status).toBe(404);
    });

    it('アクセス権のないプロジェクトのアルバム一覧は404を返す（REQ 13.2, 13.3）', async () => {
      const res = await request(app)
        .get(`/api/construction-photos/${albumId}/images`)
        .set('Authorization', `Bearer ${outsiderToken}`);
      expect(res.status).toBe(404);
    });
  });
});

/**
 * Requirements coverage (construction-photo) — requirement-coverage tags.
 * 各IDは本ファイル内の対応テストが検証する受入基準（監査でエビデンス確認済み）。
 * @requirement construction-photo/REQ-4.2
 * @requirement construction-photo/REQ-12.2
 * @requirement construction-photo/REQ-12.3
 * @requirement construction-photo/REQ-12.4
 */
