/**
 * @fileoverview 工事看板マスタAPI統合テスト
 *
 * Task 3.1: 看板マスタCRUD・一覧サービス＋ルート（二重マウント）
 *
 * Requirements coverage:
 * - 8.1: 看板作成
 * - 8.2, 8.3, 8.4: 工事件名/工事場所・自由項目・固定テキストの保持
 * - 8.6: 楽観的排他制御を用いた更新と競合検出
 * - 8.7, 8.8: 論理削除と使用件数（inUseCount）の返却
 * - 8.9, 8.10: 当該プロジェクト配下でのみ選択・参照可能／一覧表示
 * - 13.1, 13.3: 認証・認可（401/403）
 * - 13.2: 他プロジェクトの看板は参照・更新・削除できない
 *
 * Scope:
 * - 二重マウント（nested `/api/projects/:projectId/construction-signboards` ＋ flat `/api/construction-signboards`）
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

describe('Construction Signboard API Integration Tests', () => {
  let prisma: PrismaClient;
  let testUserId: string;
  let projectAId: string;
  let projectBId: string;
  let albumAId: string;
  let accessToken: string;

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

    // construction_signboard 権限を確実に用意し user ロールへ全アクション付与
    const signboardPermissions = [
      { resource: 'construction_signboard', action: 'create' },
      { resource: 'construction_signboard', action: 'read' },
      { resource: 'construction_signboard', action: 'update' },
      { resource: 'construction_signboard', action: 'delete' },
    ];
    for (const perm of signboardPermissions) {
      const existing = await prisma.permission.findUnique({
        where: { resource_action: { resource: perm.resource, action: perm.action } },
      });
      if (!existing) {
        await prisma.permission.create({
          data: {
            resource: perm.resource,
            action: perm.action,
            description: `工事看板 ${perm.action}`,
          },
        });
      }
    }
    const userRole = await prisma.role.findUnique({ where: { name: 'user' } });
    if (userRole) {
      for (const perm of signboardPermissions) {
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
      'test-construction-signboard-integration@example.com',
      'Construction Signboard Test User',
      ['user']
    );
    testUserId = testUserData.userId;
    accessToken = testUserData.accessToken;

    const projectA = await prisma.project.create({
      data: {
        name: 'Construction Signboard Integration Test Project A',
        salesPersonId: testUserId,
        createdById: testUserId,
      },
    });
    projectAId = projectA.id;

    const projectB = await prisma.project.create({
      data: {
        name: 'Construction Signboard Integration Test Project B',
        salesPersonId: testUserId,
        createdById: testUserId,
      },
    });
    projectBId = projectB.id;

    // 使用中削除テスト用のアルバム（projectA配下）
    const albumA = await prisma.constructionPhotoAlbum.create({
      data: { projectId: projectAId, name: '看板使用中テスト用アルバム' },
    });
    albumAId = albumA.id;
  });

  afterAll(async () => {
    await prisma.constructionPhoto.deleteMany({ where: { albumId: albumAId } });
    await prisma.constructionSignboard.deleteMany({
      where: { projectId: { in: [projectAId, projectBId] } },
    });
    await prisma.constructionPhotoAlbum.deleteMany({
      where: { projectId: { in: [projectAId, projectBId] } },
    });
    await prisma.project.deleteMany({
      where: {
        name: {
          in: [
            'Construction Signboard Integration Test Project A',
            'Construction Signboard Integration Test Project B',
          ],
        },
      },
    });
    await prisma.user.deleteMany({
      where: { email: 'test-construction-signboard-integration@example.com' },
    });

    const client = redis.getClient();
    if (client) {
      const keys = await client.keys('test-construction-signboard-*');
      if (keys.length > 0) {
        await client.del(...keys);
      }
    }

    await prisma.$disconnect();
    await redis.disconnect();
  });

  beforeEach(async () => {
    await prisma.constructionPhoto.deleteMany({ where: { albumId: albumAId } });
    await prisma.constructionSignboard.deleteMany({
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

  const createPhotoUsingSignboard = async (signboardId: string): Promise<string> => {
    const photo = await prisma.constructionPhoto.create({
      data: {
        albumId: albumAId,
        originalPath: 'construction-photos/original/test.jpg',
        thumbnailPath: 'construction-photos/thumbnail/test.jpg',
        fileName: 'test.jpg',
        fileSize: 1024,
        width: 800,
        height: 600,
        displayOrder: 1,
        signboardId,
      },
    });
    return photo.id;
  };

  describe('Authentication (REQ 13.1, 13.3)', () => {
    it('GET nested list - 認証なしで401を返す', async () => {
      const res = await request(app).get(`/api/projects/${projectAId}/construction-signboards`);
      expect(res.status).toBe(401);
    });

    it('POST nested create - 認証なしで401を返す', async () => {
      const res = await request(app)
        .post(`/api/projects/${projectAId}/construction-signboards`)
        .send({ workName: 'x', workLocation: 'y' });
      expect(res.status).toBe(401);
    });

    it('PATCH flat update - 認証なしで401を返す', async () => {
      const res = await request(app)
        .patch('/api/construction-signboards/00000000-0000-4000-8000-000000000000')
        .send({ updatedAt: new Date().toISOString() });
      expect(res.status).toBe(401);
    });

    it('DELETE flat - 認証なしで401を返す', async () => {
      const res = await request(app).delete(
        '/api/construction-signboards/00000000-0000-4000-8000-000000000000'
      );
      expect(res.status).toBe(401);
    });
  });

  describe('CRUD (nested + flat)', () => {
    it('看板を作成できる（nested POST, REQ 8.1, 8.2, 8.3, 8.4）', async () => {
      const res = await request(app)
        .post(`/api/projects/${projectAId}/construction-signboards`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          workName: '○○邸新築工事',
          workLocation: '東京都港区',
          freeItems: [
            { label: '天候', value: '晴れ' },
            { label: '施工者', value: '△△建設' },
          ],
          footerText: '状況・摘要欄',
        });

      expect(res.status).toBe(201);
      expect(res.body.id).toBeDefined();
      expect(res.body.projectId).toBe(projectAId);
      expect(res.body.workName).toBe('○○邸新築工事');
      expect(res.body.workLocation).toBe('東京都港区');
      // freeItems / footerText が保持される
      expect(res.body.freeItems).toEqual([
        { label: '天候', value: '晴れ' },
        { label: '施工者', value: '△△建設' },
      ]);
      expect(res.body.footerText).toBe('状況・摘要欄');
      expect(typeof res.body.createdAt).toBe('string');
      expect(typeof res.body.updatedAt).toBe('string');
    });

    it('freeItems省略時は空配列で作成できる（REQ 8.3）', async () => {
      const res = await request(app)
        .post(`/api/projects/${projectAId}/construction-signboards`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ workName: '工事', workLocation: '場所' });

      expect(res.status).toBe(201);
      expect(res.body.freeItems).toEqual([]);
      expect(res.body.footerText).toBeNull();
    });

    it('工事件名なしで作成すると400を返す', async () => {
      const res = await request(app)
        .post(`/api/projects/${projectAId}/construction-signboards`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ workLocation: '場所のみ' });
      expect(res.status).toBe(400);
    });

    it('存在しないプロジェクトへの作成で404を返す（REQ 8.9）', async () => {
      const res = await request(app)
        .post('/api/projects/11111111-1111-4111-8111-111111111111/construction-signboards')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ workName: '工事', workLocation: '場所' });
      expect(res.status).toBe(404);
    });

    it('楽観的排他制御で更新できる（flat PATCH, REQ 8.6）', async () => {
      const created = await request(app)
        .post(`/api/projects/${projectAId}/construction-signboards`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ workName: '更新前', workLocation: '場所' });

      const res = await request(app)
        .patch(`/api/construction-signboards/${created.body.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          workName: '更新後',
          freeItems: [{ label: '気温', value: '20℃' }],
          updatedAt: created.body.updatedAt,
        });

      expect(res.status).toBe(200);
      expect(res.body.workName).toBe('更新後');
      expect(res.body.freeItems).toEqual([{ label: '気温', value: '20℃' }]);
    });

    it('更新時の競合で409を返す（REQ 8.6）', async () => {
      const created = await request(app)
        .post(`/api/projects/${projectAId}/construction-signboards`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ workName: '競合テスト', workLocation: '場所' });

      const staleUpdatedAt = new Date(
        new Date(created.body.updatedAt).getTime() - 60_000
      ).toISOString();

      const res = await request(app)
        .patch(`/api/construction-signboards/${created.body.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ workName: '競合更新', updatedAt: staleUpdatedAt });

      expect(res.status).toBe(409);
    });

    it('未使用の看板を削除でき inUseCount=0 を返す（flat DELETE, REQ 8.7, 8.8）', async () => {
      const created = await request(app)
        .post(`/api/projects/${projectAId}/construction-signboards`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ workName: '削除対象', workLocation: '場所' });

      const del = await request(app)
        .delete(`/api/construction-signboards/${created.body.id}`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(del.status).toBe(200);
      expect(del.body.inUseCount).toBe(0);

      // 論理削除済みは一覧に出ない
      const list = await request(app)
        .get(`/api/projects/${projectAId}/construction-signboards`)
        .set('Authorization', `Bearer ${accessToken}`);
      expect(list.body.find((s: { id: string }) => s.id === created.body.id)).toBeUndefined();
    });

    it('使用中の看板削除で使用件数（inUseCount>0）を返す（REQ 8.8）', async () => {
      const created = await request(app)
        .post(`/api/projects/${projectAId}/construction-signboards`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ workName: '使用中看板', workLocation: '場所' });

      // 当該看板を参照する写真項目を2件作成
      await createPhotoUsingSignboard(created.body.id);
      await createPhotoUsingSignboard(created.body.id);

      const del = await request(app)
        .delete(`/api/construction-signboards/${created.body.id}`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(del.status).toBe(200);
      expect(del.body.inUseCount).toBe(2);
    });
  });

  describe('一覧（REQ 8.10）', () => {
    it('当該プロジェクトの看板一覧を返す', async () => {
      await request(app)
        .post(`/api/projects/${projectAId}/construction-signboards`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ workName: '看板1', workLocation: '場所1' });
      await request(app)
        .post(`/api/projects/${projectAId}/construction-signboards`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ workName: '看板2', workLocation: '場所2' });

      const res = await request(app)
        .get(`/api/projects/${projectAId}/construction-signboards`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body).toHaveLength(2);
    });

    it('各看板の inUseCount を返す（未使用=0, 参照写真あり=件数）（REQ 8.8）', async () => {
      const used = await request(app)
        .post(`/api/projects/${projectAId}/construction-signboards`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ workName: '使用中看板', workLocation: '場所' });
      const unused = await request(app)
        .post(`/api/projects/${projectAId}/construction-signboards`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ workName: '未使用看板', workLocation: '場所' });

      // used 看板を参照する写真項目を2件作成
      await createPhotoUsingSignboard(used.body.id);
      await createPhotoUsingSignboard(used.body.id);

      const res = await request(app)
        .get(`/api/projects/${projectAId}/construction-signboards`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      const usedItem = res.body.find((s: { id: string }) => s.id === used.body.id);
      const unusedItem = res.body.find((s: { id: string }) => s.id === unused.body.id);
      expect(usedItem.inUseCount).toBe(2);
      expect(unusedItem.inUseCount).toBe(0);
    });
  });

  describe('プロジェクト境界・データ分離（REQ 8.9, 13.2）', () => {
    it('他プロジェクトの看板は一覧に含まれない', async () => {
      await request(app)
        .post(`/api/projects/${projectAId}/construction-signboards`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ workName: 'A専用看板', workLocation: '場所' });

      const res = await request(app)
        .get(`/api/projects/${projectBId}/construction-signboards`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(0);
    });

    it('要求プロジェクト外の看板はnested更新で404を返す（REQ 13.2）', async () => {
      const created = await request(app)
        .post(`/api/projects/${projectAId}/construction-signboards`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ workName: 'A配下看板', workLocation: '場所' });

      // projectB 配下として projectA の看板を更新要求 → 404（配下検証）
      const res = await request(app)
        .patch(`/api/projects/${projectBId}/construction-signboards/${created.body.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ workName: '越境更新', updatedAt: created.body.updatedAt });

      expect(res.status).toBe(404);
    });

    it('要求プロジェクト外の看板はnested削除で404を返す（REQ 13.2）', async () => {
      const created = await request(app)
        .post(`/api/projects/${projectAId}/construction-signboards`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ workName: 'A配下看板2', workLocation: '場所' });

      const res = await request(app)
        .delete(`/api/projects/${projectBId}/construction-signboards/${created.body.id}`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(404);
    });

    it('要求プロジェクト配下の看板はnested更新で200を返す（REQ 13.2）', async () => {
      const created = await request(app)
        .post(`/api/projects/${projectAId}/construction-signboards`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ workName: 'A配下看板3', workLocation: '場所' });

      const res = await request(app)
        .patch(`/api/projects/${projectAId}/construction-signboards/${created.body.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ workName: '正常更新', updatedAt: created.body.updatedAt });

      expect(res.status).toBe(200);
      expect(res.body.workName).toBe('正常更新');
    });
  });
});
