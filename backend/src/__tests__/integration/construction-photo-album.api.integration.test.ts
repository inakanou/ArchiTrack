/**
 * @fileoverview 工事写真アルバムAPI統合テスト
 *
 * Task 2.1: アルバムCRUD・一覧サービス＋ルート（二重マウント）
 *
 * Requirements coverage:
 * - 1.1: アルバム作成
 * - 1.2: アルバム詳細取得
 * - 1.3, 1.5: 楽観的排他制御を用いた更新と競合検出
 * - 1.4: アルバム論理削除
 * - 1.6: プロジェクト不在時の作成拒否
 * - 3.1, 3.3, 3.4: 一覧のページネーション・検索・ソート
 * - 11.1: 一覧は最大50件ページング
 * - 13.1, 13.3: 認証・認可（401/403）
 * - 13.2: 他プロジェクトのアルバムは取得できない
 *
 * Scope:
 * - 二重マウント（nested `/api/projects/:projectId/construction-photos` ＋ flat `/api/construction-photos`）
 * - 認証・認可フロー
 * - プロジェクト境界（データ分離）
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

describe('Construction Photo Album API Integration Tests', () => {
  let prisma: PrismaClient;
  let testUserId: string;
  let projectAId: string;
  let projectBId: string;
  let accessToken: string;
  // 認証済みだが construction_photo 権限を一切持たないユーザー（403検証用, REQ 13.3）
  let noPermissionToken: string;

  const TEST_EMAIL = 'test-construction-photo-integration@example.com';
  const NO_PERMISSION_EMAIL = 'test-construction-photo-noperm@example.com';

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

    const user = await prisma.user.create({
      data: { email, displayName, passwordHash },
    });

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

    await seedRoles(prisma);
    await seedPermissions(prisma);
    await seedRolePermissions(prisma);

    // construction_photo 権限を確実に用意し user ロールへ全アクション付与（delete含む）
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

    const testUserData = await createAuthenticatedUser(TEST_EMAIL, 'Construction Photo Test User', [
      'user',
    ]);
    testUserId = testUserData.userId;
    accessToken = testUserData.accessToken;

    // 認証は通るが construction_photo 権限を持たないユーザー（ロール未割当）
    const noPermUser = await createAuthenticatedUser(
      NO_PERMISSION_EMAIL,
      'Construction Photo No Permission User',
      []
    );
    noPermissionToken = noPermUser.accessToken;

    const projectA = await prisma.project.create({
      data: {
        name: 'Construction Photo Integration Test Project A',
        salesPersonId: testUserId,
        createdById: testUserId,
      },
    });
    projectAId = projectA.id;

    const projectB = await prisma.project.create({
      data: {
        name: 'Construction Photo Integration Test Project B',
        salesPersonId: testUserId,
        createdById: testUserId,
      },
    });
    projectBId = projectB.id;
  });

  afterAll(async () => {
    await prisma.constructionPhotoAlbum.deleteMany({
      where: { projectId: { in: [projectAId, projectBId] } },
    });
    await prisma.project.deleteMany({
      where: {
        name: {
          in: [
            'Construction Photo Integration Test Project A',
            'Construction Photo Integration Test Project B',
          ],
        },
      },
    });
    await prisma.user.deleteMany({
      where: { email: { in: [TEST_EMAIL, NO_PERMISSION_EMAIL] } },
    });

    const client = redis.getClient();
    if (client) {
      const keys = await client.keys('test-construction-photo-*');
      if (keys.length > 0) {
        await client.del(...keys);
      }
    }

    await prisma.$disconnect();
    await redis.disconnect();
  });

  beforeEach(async () => {
    await prisma.constructionPhotoAlbum.deleteMany({
      where: { projectId: { in: [projectAId, projectBId] } },
    });

    const client = redis.getClient();
    if (client) {
      const rateLimitKeys = await client.keys('rl:*');
      if (rateLimitKeys.length > 0) {
        await client.del(...rateLimitKeys);
      }
    }
  });

  describe('Authentication (REQ 13.1, 13.3)', () => {
    it('GET nested list - 認証なしで401を返す', async () => {
      const res = await request(app).get(`/api/projects/${projectAId}/construction-photos`);
      expect(res.status).toBe(401);
    });

    it('POST nested create - 認証なしで401を返す', async () => {
      const res = await request(app)
        .post(`/api/projects/${projectAId}/construction-photos`)
        .send({ name: 'x' });
      expect(res.status).toBe(401);
    });

    it('GET flat detail - 認証なしで401を返す', async () => {
      const res = await request(app).get(
        '/api/construction-photos/00000000-0000-4000-8000-000000000000'
      );
      expect(res.status).toBe(401);
    });

    it('PATCH flat update - 認証なしで401を返す', async () => {
      const res = await request(app)
        .patch('/api/construction-photos/00000000-0000-4000-8000-000000000000')
        .send({ updatedAt: new Date().toISOString() });
      expect(res.status).toBe(401);
    });

    it('DELETE flat - 認証なしで401を返す', async () => {
      const res = await request(app).delete(
        '/api/construction-photos/00000000-0000-4000-8000-000000000000'
      );
      expect(res.status).toBe(401);
    });
  });

  describe('Authorization - 権限なし403 (REQ 13.3)', () => {
    it('認証済みだが construction_photo:read 権限なしの一覧取得は403を返す', async () => {
      const res = await request(app)
        .get(`/api/projects/${projectAId}/construction-photos`)
        .set('Authorization', `Bearer ${noPermissionToken}`);
      expect(res.status).toBe(403);
      expect(res.body.required).toBe('construction_photo:read');
    });

    it('認証済みだが construction_photo:create 権限なしの作成は403を返す', async () => {
      const res = await request(app)
        .post(`/api/projects/${projectAId}/construction-photos`)
        .set('Authorization', `Bearer ${noPermissionToken}`)
        .send({ name: '権限なし作成' });
      expect(res.status).toBe(403);
      expect(res.body.required).toBe('construction_photo:create');
    });
  });

  describe('CRUD (nested + flat)', () => {
    it('アルバムを作成できる（nested POST, REQ 1.1）', async () => {
      const res = await request(app)
        .post(`/api/projects/${projectAId}/construction-photos`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: '基礎工事アルバム', memo: 'メモ' });

      expect(res.status).toBe(201);
      expect(res.body.id).toBeDefined();
      expect(res.body.projectId).toBe(projectAId);
      expect(res.body.name).toBe('基礎工事アルバム');
      expect(res.body.memo).toBe('メモ');
      expect(typeof res.body.createdAt).toBe('string');
      expect(typeof res.body.updatedAt).toBe('string');
    });

    it('名前なしで作成すると400を返す', async () => {
      const res = await request(app)
        .post(`/api/projects/${projectAId}/construction-photos`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ memo: 'メモのみ' });
      expect(res.status).toBe(400);
    });

    it('存在しないプロジェクトへの作成で404を返す（REQ 1.6）', async () => {
      const res = await request(app)
        .post('/api/projects/11111111-1111-4111-8111-111111111111/construction-photos')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'アルバム' });
      expect(res.status).toBe(404);
    });

    it('詳細を取得できる（flat GET, REQ 1.2）', async () => {
      const created = await request(app)
        .post(`/api/projects/${projectAId}/construction-photos`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: '詳細取得用' });

      const res = await request(app)
        .get(`/api/construction-photos/${created.body.id}`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(created.body.id);
      expect(res.body.name).toBe('詳細取得用');
    });

    it('存在しないアルバムの取得で404を返す', async () => {
      const res = await request(app)
        .get('/api/construction-photos/22222222-2222-4222-8222-222222222222')
        .set('Authorization', `Bearer ${accessToken}`);
      expect(res.status).toBe(404);
    });

    it('楽観的排他制御で更新できる（flat PATCH, REQ 1.3）', async () => {
      const created = await request(app)
        .post(`/api/projects/${projectAId}/construction-photos`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: '更新前' });

      const res = await request(app)
        .patch(`/api/construction-photos/${created.body.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: '更新後', updatedAt: created.body.updatedAt });

      expect(res.status).toBe(200);
      expect(res.body.name).toBe('更新後');
    });

    it('更新時の競合で409を返す（REQ 1.5）', async () => {
      const created = await request(app)
        .post(`/api/projects/${projectAId}/construction-photos`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: '競合テスト' });

      const staleUpdatedAt = new Date(
        new Date(created.body.updatedAt).getTime() - 60_000
      ).toISOString();

      const res = await request(app)
        .patch(`/api/construction-photos/${created.body.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: '競合更新', updatedAt: staleUpdatedAt });

      expect(res.status).toBe(409);
    });

    it('アルバムを論理削除できる（flat DELETE, REQ 1.4）', async () => {
      const created = await request(app)
        .post(`/api/projects/${projectAId}/construction-photos`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: '削除対象' });

      const del = await request(app)
        .delete(`/api/construction-photos/${created.body.id}`)
        .set('Authorization', `Bearer ${accessToken}`);
      expect(del.status).toBe(204);

      const getAfter = await request(app)
        .get(`/api/construction-photos/${created.body.id}`)
        .set('Authorization', `Bearer ${accessToken}`);
      expect(getAfter.status).toBe(404);
    });
  });

  describe('一覧・ページネーション（REQ 3.1, 3.3, 3.4, 11.1）', () => {
    it('一覧は最大50件ページングで返る（REQ 11.1）', async () => {
      // 51件を投入して1ページ目に50件・全2ページとなることを確認
      await prisma.constructionPhotoAlbum.createMany({
        data: Array.from({ length: 51 }, (_, i) => ({
          projectId: projectAId,
          name: `アルバム-${String(i).padStart(3, '0')}`,
        })),
      });

      const res = await request(app)
        .get(`/api/projects/${projectAId}/construction-photos`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(50);
      expect(res.body.pagination.limit).toBe(50);
      expect(res.body.pagination.total).toBe(51);
      expect(res.body.pagination.totalPages).toBe(2);

      const page2 = await request(app)
        .get(`/api/projects/${projectAId}/construction-photos?page=2`)
        .set('Authorization', `Bearer ${accessToken}`);
      expect(page2.body.data).toHaveLength(1);
    });

    it('アルバム名で部分一致検索できる（REQ 3.3）', async () => {
      await prisma.constructionPhotoAlbum.createMany({
        data: [
          { projectId: projectAId, name: '基礎工事アルバム' },
          { projectId: projectAId, name: '外構工事アルバム' },
        ],
      });

      const res = await request(app)
        .get(`/api/projects/${projectAId}/construction-photos?search=基礎`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].name).toBe('基礎工事アルバム');
    });

    it('作成日で昇順ソートできる（REQ 3.4）', async () => {
      const first = await prisma.constructionPhotoAlbum.create({
        data: { projectId: projectAId, name: '先に作成' },
      });
      await new Promise((r) => setTimeout(r, 10));
      const second = await prisma.constructionPhotoAlbum.create({
        data: { projectId: projectAId, name: '後に作成' },
      });

      const res = await request(app)
        .get(`/api/projects/${projectAId}/construction-photos?sort=createdAt&order=asc`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data[0].id).toBe(first.id);
      expect(res.body.data[1].id).toBe(second.id);
    });
  });

  describe('代表サムネイル署名URL（REQ 3.5, 11.3）', () => {
    it('代表写真ありのアルバムは thumbnailUrl に署名付きサムネURLを返す', async () => {
      const album = await prisma.constructionPhotoAlbum.create({
        data: { projectId: projectAId, name: '代表サムネあり' },
      });
      // displayOrder 0 が代表（昇順先頭）
      await prisma.constructionPhoto.createMany({
        data: [
          {
            albumId: album.id,
            originalPath: 'construction-photos/rep/orig-0.jpg',
            thumbnailPath: 'construction-photos/rep/thumb-0.jpg',
            fileName: 'photo-0.jpg',
            fileSize: 111,
            width: 800,
            height: 600,
            displayOrder: 0,
          },
          {
            albumId: album.id,
            originalPath: 'construction-photos/rep/orig-1.jpg',
            thumbnailPath: 'construction-photos/rep/thumb-1.jpg',
            fileName: 'photo-1.jpg',
            fileSize: 222,
            width: 800,
            height: 600,
            displayOrder: 1,
          },
        ],
      });

      const res = await request(app)
        .get(`/api/projects/${projectAId}/construction-photos`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      const item = res.body.data.find((a: { id: string }) => a.id === album.id);
      expect(item).toBeDefined();
      expect(typeof item.thumbnailUrl).toBe('string');
      // 代表（displayOrder 0）のサムネパスが署名対象になっている
      expect(item.thumbnailUrl).toContain('construction-photos/rep/thumb-0.jpg');
    });

    it('写真なしのアルバムは thumbnailUrl が null', async () => {
      const album = await prisma.constructionPhotoAlbum.create({
        data: { projectId: projectAId, name: '代表サムネなし' },
      });

      const res = await request(app)
        .get(`/api/projects/${projectAId}/construction-photos`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      const item = res.body.data.find((a: { id: string }) => a.id === album.id);
      expect(item).toBeDefined();
      expect(item.thumbnailUrl).toBeNull();
    });
  });

  describe('プロジェクト境界・データ分離（REQ 13.2）', () => {
    it('他プロジェクトのアルバムは一覧に含まれない', async () => {
      await prisma.constructionPhotoAlbum.create({
        data: { projectId: projectAId, name: 'A専用アルバム' },
      });

      const res = await request(app)
        .get(`/api/projects/${projectBId}/construction-photos`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(0);
      expect(res.body.pagination.total).toBe(0);
    });

    it('要求プロジェクト外のアルバムはnested詳細取得で404を返す', async () => {
      const albumInA = await prisma.constructionPhotoAlbum.create({
        data: { projectId: projectAId, name: 'A配下' },
      });

      // projectB 配下として projectA のアルバムを要求 → 404（配下検証）
      const res = await request(app)
        .get(`/api/projects/${projectBId}/construction-photos/${albumInA.id}`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(404);
    });

    it('要求プロジェクト配下のアルバムはnested詳細取得で200を返す', async () => {
      const albumInA = await prisma.constructionPhotoAlbum.create({
        data: { projectId: projectAId, name: 'A配下2' },
      });

      const res = await request(app)
        .get(`/api/projects/${projectAId}/construction-photos/${albumInA.id}`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(albumInA.id);
    });
  });
});
