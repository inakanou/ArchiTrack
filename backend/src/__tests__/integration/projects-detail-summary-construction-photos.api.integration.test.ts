/**
 * @fileoverview プロジェクト詳細サマリ 工事写真セクション統合テスト
 *
 * Task 4.1: detail-summary に工事写真セクションを追加
 *
 * Requirements coverage:
 * - 2.3: プロジェクト詳細サマリに工事写真の登録件数などのサマリ情報を含める
 *
 * Scope:
 * - `GET /api/projects/:id/detail-summary` の応答に
 *   `sections.constructionPhotos:{totalCount, latestAlbums}` が既存セクションと同型で含まれる。
 * - アルバム未登録時のフォールバック（totalCount=0, latestAlbums=[]）。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { validateEnv } from '../../config/env.js';
import type { PrismaClient } from '../../generated/prisma/client.js';

// 環境変数を初期化（モジュールインポート前に実行）
validateEnv();

import app from '../../app.js';
import getPrismaClient from '../../db.js';
import redis, { initRedis } from '../../redis.js';
import { seedRoles, seedPermissions, seedRolePermissions } from '../../utils/seed-helpers.js';

describe('Project Detail Summary - Construction Photos Section Integration Tests', () => {
  let prisma: PrismaClient;
  let testUserId: string;
  let projectWithPhotosId: string;
  let projectEmptyId: string;
  let accessToken: string;

  const PROJECT_WITH_PHOTOS = 'Detail Summary CP Project With Photos';
  const PROJECT_EMPTY = 'Detail Summary CP Project Empty';
  const TEST_EMAIL = 'test-detail-summary-cp-integration@example.com';

  const createAuthenticatedUser = async (): Promise<{ userId: string; accessToken: string }> => {
    const { hash } = await import('@node-rs/argon2');
    const passwordHash = await hash('TestPassword123!@#', {
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4,
    });

    const user = await prisma.user.create({
      data: { email: TEST_EMAIL, displayName: 'Detail Summary CP Test User', passwordHash },
    });

    const role = await prisma.role.findUnique({ where: { name: 'user' } });
    if (role) {
      await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });
    }

    const loginResponse = await request(app).post('/api/v1/auth/login').send({
      email: TEST_EMAIL,
      password: 'TestPassword123!@#',
    });

    return { userId: user.id, accessToken: loginResponse.body.accessToken };
  };

  beforeAll(async () => {
    prisma = getPrismaClient();
    await initRedis();

    await seedRoles(prisma);
    await seedPermissions(prisma);
    await seedRolePermissions(prisma);

    const userData = await createAuthenticatedUser();
    testUserId = userData.userId;
    accessToken = userData.accessToken;

    const projectWithPhotos = await prisma.project.create({
      data: { name: PROJECT_WITH_PHOTOS, salesPersonId: testUserId, createdById: testUserId },
    });
    projectWithPhotosId = projectWithPhotos.id;

    const projectEmpty = await prisma.project.create({
      data: { name: PROJECT_EMPTY, salesPersonId: testUserId, createdById: testUserId },
    });
    projectEmptyId = projectEmpty.id;

    // アルバム2件 + 代表写真を投入
    const album1 = await prisma.constructionPhotoAlbum.create({
      data: { projectId: projectWithPhotosId, name: '基礎工事アルバム' },
    });
    await prisma.constructionPhotoAlbum.create({
      data: { projectId: projectWithPhotosId, name: '外構工事アルバム' },
    });

    // album1 に代表サムネ用の写真を2件（displayOrder 0 が代表）
    await prisma.constructionPhoto.createMany({
      data: [
        {
          albumId: album1.id,
          originalPath: 'construction-photos/album1/orig-0.jpg',
          thumbnailPath: 'construction-photos/album1/thumb-0.jpg',
          fileName: 'photo-0.jpg',
          fileSize: 12345,
          width: 800,
          height: 600,
          displayOrder: 0,
        },
        {
          albumId: album1.id,
          originalPath: 'construction-photos/album1/orig-1.jpg',
          thumbnailPath: 'construction-photos/album1/thumb-1.jpg',
          fileName: 'photo-1.jpg',
          fileSize: 23456,
          width: 800,
          height: 600,
          displayOrder: 1,
        },
      ],
    });
  });

  afterAll(async () => {
    await prisma.constructionPhotoAlbum.deleteMany({
      where: { projectId: { in: [projectWithPhotosId, projectEmptyId] } },
    });
    await prisma.project.deleteMany({
      where: { name: { in: [PROJECT_WITH_PHOTOS, PROJECT_EMPTY] } },
    });
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

  it('detail-summary の sections に constructionPhotos:{totalCount, latestAlbums} が同型で含まれる（REQ 2.3）', async () => {
    const res = await request(app)
      .get(`/api/projects/${projectWithPhotosId}/detail-summary`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.sections).toHaveProperty('constructionPhotos');

    const section = res.body.sections.constructionPhotos;
    expect(section.totalCount).toBe(2);
    expect(Array.isArray(section.latestAlbums)).toBe(true);
    expect(section.latestAlbums.length).toBe(2);

    // 代表写真を持つアルバムのサマリ形状を検証（既存セクションと同型のフィールド）
    const withPhotos = section.latestAlbums.find(
      (a: { name: string }) => a.name === '基礎工事アルバム'
    );
    expect(withPhotos).toBeDefined();
    expect(withPhotos.projectId).toBe(projectWithPhotosId);
    expect(withPhotos.photoCount).toBe(2);
    expect(withPhotos.representativeImageId).not.toBeNull();
    expect(withPhotos).toHaveProperty('thumbnailUrl');
  });

  it('アルバム未登録プロジェクトは constructionPhotos がフォールバック（totalCount=0）（REQ 2.3）', async () => {
    const res = await request(app)
      .get(`/api/projects/${projectEmptyId}/detail-summary`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.sections.constructionPhotos).toEqual({
      totalCount: 0,
      latestAlbums: [],
    });
    // 既存セクションが壊れていないこと（回帰）
    expect(res.body.sections).toHaveProperty('siteSurveys');
    expect(res.body.sections).toHaveProperty('schedules');
  });
});
