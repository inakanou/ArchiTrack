/**
 * @fileoverview 工事写真 非合成原本画像API統合テスト
 *
 * Task 10.1: 非合成原本エンドポイント＋サービス
 *
 * Requirements coverage:
 * - 14.6: ビューアで表示する原本画像を必要時にのみ取得する
 * - 15.4: ZIPの「アップロード原本そのまま」モードを成立させる非合成原本の取得元
 * - 13.2, 13.4: プロジェクト境界の検証・署名付きURLではなく専用エンドポイント経由の配信
 *
 * Scope:
 * - flat マウント GET /api/construction-photos/images/:imageId/original
 * - 実ストレージ（STORAGE_TYPE=local）
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

describe('Construction Photo Original Image API Integration Tests', () => {
  let prisma: PrismaClient;
  let testUserId: string;
  let projectId: string;
  let albumId: string;
  let signboardId: string;
  let accessToken: string;
  let outsiderToken: string;
  let noPermissionToken: string;

  let plainPhotoId: string; // 看板なし
  let signboardPhotoId: string; // 看板配置済み

  const TEST_EMAIL = 'test-construction-original-image-integration@example.com';
  const OUTSIDER_EMAIL = 'test-construction-original-image-outsider@example.com';
  const NO_PERMISSION_EMAIL = 'test-construction-original-image-noperm@example.com';
  const PROJECT_NAME = 'Construction Photo Original Image Integration Test Project';

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

  const uploadPhoto = async (jpeg: Buffer, filename: string): Promise<string> => {
    const res = await request(app)
      .post(`/api/construction-photos/${albumId}/images`)
      .set('Authorization', `Bearer ${accessToken}`)
      .attach('images', jpeg, { filename, contentType: 'image/jpeg' });
    expect(res.status).toBe(201);
    return res.body.successful[0].id as string;
  };

  beforeAll(async () => {
    prisma = getPrismaClient();
    await initRedis();
    await initializeConstructionPhotoImageServices();

    await seedRoles(prisma);
    await seedPermissions(prisma);
    await seedRolePermissions(prisma);

    // construction_photo / construction_signboard 権限を用意し user ロールへ付与
    const perms = [
      { resource: 'construction_photo', action: 'create' },
      { resource: 'construction_photo', action: 'read' },
      { resource: 'construction_photo', action: 'update' },
      { resource: 'construction_photo', action: 'delete' },
      { resource: 'construction_signboard', action: 'create' },
      { resource: 'construction_signboard', action: 'read' },
      { resource: 'construction_signboard', action: 'update' },
      { resource: 'construction_signboard', action: 'delete' },
    ];
    for (const perm of perms) {
      const existing = await prisma.permission.findUnique({
        where: { resource_action: { resource: perm.resource, action: perm.action } },
      });
      if (!existing) {
        await prisma.permission.create({
          data: {
            resource: perm.resource,
            action: perm.action,
            description: `${perm.resource} ${perm.action}`,
          },
        });
      }
    }
    const userRole = await prisma.role.findUnique({ where: { name: 'user' } });
    if (userRole) {
      for (const perm of perms) {
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
      'Construction Original Image Test User',
      ['user']
    );
    testUserId = testUserData.userId;
    accessToken = testUserData.accessToken;

    const outsider = await createAuthenticatedUser(
      OUTSIDER_EMAIL,
      'Construction Original Image Outsider',
      ['user']
    );
    outsiderToken = outsider.accessToken;

    // construction_photo:read 権限を持たない未昇格ロール（権限なし=403 検証用）。
    // ロール割当を一切行わない生ユーザーを作成しログインする。
    {
      const { hash } = await import('@node-rs/argon2');
      const passwordHash = await hash('TestPassword123!@#', {
        memoryCost: 65536,
        timeCost: 3,
        parallelism: 4,
      });
      await prisma.user.create({
        data: {
          email: NO_PERMISSION_EMAIL,
          displayName: 'Construction Original Image No Permission User',
          passwordHash,
        },
      });
      const loginResponse = await request(app).post('/api/v1/auth/login').send({
        email: NO_PERMISSION_EMAIL,
        password: 'TestPassword123!@#',
      });
      noPermissionToken = loginResponse.body.accessToken;
    }

    const project = await prisma.project.create({
      data: { name: PROJECT_NAME, salesPersonId: testUserId, createdById: testUserId },
    });
    projectId = project.id;

    const album = await prisma.constructionPhotoAlbum.create({
      data: { projectId, name: '非合成原本テスト用アルバム' },
    });
    albumId = album.id;

    const sharp = (await import('sharp')).default;
    const jpeg = await sharp({
      create: { width: 200, height: 150, channels: 3, background: { r: 90, g: 90, b: 90 } },
    })
      .jpeg()
      .toBuffer();

    plainPhotoId = await uploadPhoto(jpeg, 'plain.jpg');
    signboardPhotoId = await uploadPhoto(jpeg, 'with-signboard.jpg');

    // 看板マスタ作成
    const signboard = await prisma.constructionSignboard.create({
      data: {
        projectId,
        workName: '外壁改修工事',
        workLocation: '東京都千代田区',
        freeItems: [{ label: '施工者', value: '株式会社アークン' }],
        footerText: '施工状況',
      },
    });
    signboardId = signboard.id;

    // 看板配置済み写真に看板と配置を設定
    const placement = { left: 10, top: 10, width: 120, height: 80 };
    await prisma.constructionPhoto.update({
      where: { id: signboardPhotoId },
      data: { signboardId, signboardPlacement: placement },
    });
  });

  afterAll(async () => {
    await prisma.constructionPhoto.deleteMany({ where: { albumId } });
    await prisma.constructionSignboard.deleteMany({ where: { projectId } });
    await prisma.constructionPhotoAlbum.deleteMany({ where: { projectId } });
    await prisma.project.deleteMany({ where: { name: PROJECT_NAME } });
    await prisma.user.deleteMany({
      where: { email: { in: [TEST_EMAIL, OUTSIDER_EMAIL, NO_PERMISSION_EMAIL] } },
    });

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

  it('看板なし写真の原本を非合成でストリーム返却する（Requirements: 14.6, 15.4）', async () => {
    const res = await request(app)
      .get(`/api/construction-photos/images/${plainPhotoId}/original`)
      .set('Authorization', `Bearer ${accessToken}`)
      .responseType('blob');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('image/');
    expect(res.body).toBeInstanceOf(Buffer);
    expect((res.body as Buffer).length).toBeGreaterThan(0);
  });

  it('看板配置済み写真でも合成せず原本のバイト列をそのまま返す（Requirements: 14.6, 15.4）', async () => {
    const original = await request(app)
      .get(`/api/construction-photos/images/${plainPhotoId}/original`)
      .set('Authorization', `Bearer ${accessToken}`)
      .responseType('blob');

    const withSignboard = await request(app)
      .get(`/api/construction-photos/images/${signboardPhotoId}/original`)
      .set('Authorization', `Bearer ${accessToken}`)
      .responseType('blob');

    expect(withSignboard.status).toBe(200);
    expect((withSignboard.body as Buffer).length).toBeGreaterThan(0);
    // 両写真は同一のアップロード元バイト列（同一JPEGバッファ）から作成しており、
    // 看板配置済みでも合成されず、原本と同一バイト列がそのまま返る
    expect(Buffer.compare(withSignboard.body as Buffer, original.body as Buffer)).toBe(0);

    // print-image（オンデマンド合成）とはバイト列が異なることも確認する
    const printImage = await request(app)
      .get(`/api/construction-photos/images/${signboardPhotoId}/print-image`)
      .set('Authorization', `Bearer ${accessToken}`)
      .responseType('blob');
    expect(printImage.status).toBe(200);
    expect(Buffer.compare(withSignboard.body as Buffer, printImage.body as Buffer)).not.toBe(0);
  });

  it('一覧DTOに originalUrl は現れない（Requirements: 13.4）', async () => {
    const res = await request(app)
      .get(`/api/construction-photos/${albumId}/images`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
    for (const photo of res.body) {
      expect(Object.keys(photo)).not.toContain('originalUrl');
    }
  });

  it('認証なしの原本取得は401を返す（Requirements: 13.1）', async () => {
    const res = await request(app).get(`/api/construction-photos/images/${plainPhotoId}/original`);
    expect(res.status).toBe(401);
  });

  it('construction_photo:read 権限を持たないユーザーは403を返す', async () => {
    const res = await request(app)
      .get(`/api/construction-photos/images/${plainPhotoId}/original`)
      .set('Authorization', `Bearer ${noPermissionToken}`);
    expect(res.status).toBe(403);
  });

  it('存在しない写真の原本取得は404を返す', async () => {
    const res = await request(app)
      .get('/api/construction-photos/images/99999999-9999-4999-8999-999999999999/original')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(404);
  });

  it('アクセス権のないプロジェクトの写真の原本取得は404を返す（Requirements: 13.2）', async () => {
    const res = await request(app)
      .get(`/api/construction-photos/images/${plainPhotoId}/original`)
      .set('Authorization', `Bearer ${outsiderToken}`);
    expect(res.status).toBe(404);
  });
});
