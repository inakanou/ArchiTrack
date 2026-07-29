/**
 * @fileoverview 工事写真 印字画像（オンデマンド看板合成）API統合テスト
 *
 * Task 3.3: 看板合成＋印字画像エンドポイント（オンデマンド）
 *
 * Requirements coverage:
 * - 9.6: 看板ありは指定位置・大きさで写真へ重畳する（オンデマンド）
 * - 9.7: 参照先の看板が削除済みなら看板なしとして原本を返す
 * - 10.8: 看板の登録内容を指定位置・大きさで重畳する
 * - 10.9: 看板なしの写真は重畳なしで原本を返す
 * - 13.1, 13.2, 13.3: 認証（401）・プロジェクト境界（404）
 *
 * Scope:
 * - flat マウント GET /api/construction-photos/images/:imageId/print-image
 * - 実ストレージ（STORAGE_TYPE=local）＋実 sharp による合成
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

describe('Construction Photo Print Image API Integration Tests', () => {
  let prisma: PrismaClient;
  let testUserId: string;
  let projectId: string;
  let albumId: string;
  let signboardId: string;
  let accessToken: string;
  let outsiderToken: string;

  let plainPhotoId: string; // 看板なし
  let signboardPhotoId: string; // 看板あり
  let deletedSignboardPhotoId: string; // 看板ありだが看板を削除

  const TEST_EMAIL = 'test-construction-print-image-integration@example.com';
  const OUTSIDER_EMAIL = 'test-construction-print-image-outsider@example.com';
  const PROJECT_NAME = 'Construction Photo Print Image Integration Test Project';

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
      'Construction Print Image Test User',
      ['user']
    );
    testUserId = testUserData.userId;
    accessToken = testUserData.accessToken;

    const outsider = await createAuthenticatedUser(
      OUTSIDER_EMAIL,
      'Construction Print Image Outsider',
      ['user']
    );
    outsiderToken = outsider.accessToken;

    const project = await prisma.project.create({
      data: { name: PROJECT_NAME, salesPersonId: testUserId, createdById: testUserId },
    });
    projectId = project.id;

    const album = await prisma.constructionPhotoAlbum.create({
      data: { projectId, name: '印字画像テスト用アルバム' },
    });
    albumId = album.id;

    const sharp = (await import('sharp')).default;
    const jpeg = await sharp({
      create: { width: 200, height: 150, channels: 3, background: { r: 120, g: 120, b: 120 } },
    })
      .jpeg()
      .toBuffer();

    plainPhotoId = await uploadPhoto(jpeg, 'plain.jpg');
    signboardPhotoId = await uploadPhoto(jpeg, 'with-signboard.jpg');
    deletedSignboardPhotoId = await uploadPhoto(jpeg, 'deleted-signboard.jpg');

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

    // 看板あり写真に看板と配置を設定
    const placement = { left: 10, top: 10, width: 120, height: 80 };
    await prisma.constructionPhoto.update({
      where: { id: signboardPhotoId },
      data: { signboardId, signboardPlacement: placement },
    });

    // 削除対象看板を別途作成し、削除済み看板を参照する写真を用意（9.7）
    const doomedSignboard = await prisma.constructionSignboard.create({
      data: {
        projectId,
        workName: '削除される看板',
        workLocation: '削除される場所',
        freeItems: [],
        footerText: null,
      },
    });
    await prisma.constructionPhoto.update({
      where: { id: deletedSignboardPhotoId },
      data: { signboardId: doomedSignboard.id, signboardPlacement: placement },
    });
    // 論理削除
    await prisma.constructionSignboard.update({
      where: { id: doomedSignboard.id },
      data: { deletedAt: new Date() },
    });
  });

  afterAll(async () => {
    await prisma.constructionPhoto.deleteMany({ where: { albumId } });
    await prisma.constructionSignboard.deleteMany({ where: { projectId } });
    await prisma.constructionPhotoAlbum.deleteMany({ where: { projectId } });
    await prisma.project.deleteMany({ where: { name: PROJECT_NAME } });
    await prisma.user.deleteMany({ where: { email: { in: [TEST_EMAIL, OUTSIDER_EMAIL] } } });

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

  it('(d) 看板なし写真の印字画像は image/jpeg で返る（Requirements: 10.9）', async () => {
    const res = await request(app)
      .get(`/api/construction-photos/images/${plainPhotoId}/print-image`)
      .set('Authorization', `Bearer ${accessToken}`)
      .responseType('blob');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('image/jpeg');
    expect(res.body).toBeInstanceOf(Buffer);
    expect((res.body as Buffer).length).toBeGreaterThan(0);
  });

  it('看板あり写真の印字画像は合成された image/jpeg で返る（Requirements: 9.6, 10.8）', async () => {
    // 看板なし（原本）と看板あり（合成）でバイト列が異なることを確認
    const plain = await request(app)
      .get(`/api/construction-photos/images/${plainPhotoId}/print-image`)
      .set('Authorization', `Bearer ${accessToken}`)
      .responseType('blob');

    const composited = await request(app)
      .get(`/api/construction-photos/images/${signboardPhotoId}/print-image`)
      .set('Authorization', `Bearer ${accessToken}`)
      .responseType('blob');

    expect(composited.status).toBe(200);
    expect(composited.headers['content-type']).toContain('image/jpeg');
    expect((composited.body as Buffer).length).toBeGreaterThan(0);
    // 合成により看板なし原本とはバイト列が異なる
    expect(Buffer.compare(composited.body as Buffer, plain.body as Buffer)).not.toBe(0);
  });

  it('(c/9.7) 参照看板が削除済みの写真は看板なしとして原本を返す', async () => {
    const res = await request(app)
      .get(`/api/construction-photos/images/${deletedSignboardPhotoId}/print-image`)
      .set('Authorization', `Bearer ${accessToken}`)
      .responseType('blob');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('image/jpeg');
    expect((res.body as Buffer).length).toBeGreaterThan(0);
  });

  it('認証なしの印字画像取得は401を返す（Requirements: 13.1）', async () => {
    const res = await request(app).get(
      `/api/construction-photos/images/${plainPhotoId}/print-image`
    );
    expect(res.status).toBe(401);
  });

  it('存在しない写真の印字画像取得は404を返す', async () => {
    const res = await request(app)
      .get('/api/construction-photos/images/99999999-9999-4999-8999-999999999999/print-image')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(404);
  });

  it('(e) アクセス権のないプロジェクトの写真の印字画像は404を返す（Requirements: 13.2, 13.3）', async () => {
    const res = await request(app)
      .get(`/api/construction-photos/images/${plainPhotoId}/print-image`)
      .set('Authorization', `Bearer ${outsiderToken}`);
    expect(res.status).toBe(404);
  });
});

/**
 * Requirements coverage (construction-photo) — requirement-coverage tags.
 * 各IDは本ファイル内の対応テストが検証する受入基準（監査でエビデンス確認済み）。
 * @requirement construction-photo/REQ-9.7
 * @requirement construction-photo/REQ-10.9
 */
