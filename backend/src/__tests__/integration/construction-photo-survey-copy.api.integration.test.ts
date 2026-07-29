/**
 * @fileoverview 工事写真 現調写真コピーAPI統合テスト
 *
 * Task 2.3: 現調写真コピー機能（addFromSurveyImage / POST /:id/images/from-surveys）
 *
 * Requirements coverage:
 * - 6.1: 同一プロジェクトの現場調査写真を選択候補として扱う
 * - 6.2: 選択画像を独立した写真項目として複製（storage.copy で original+thumbnail）
 * - 6.3: 複製後はコピー元の現場調査写真の変更・削除の影響を受けない（独立性）
 * - 6.4: 参照対象を同一プロジェクトの現場調査写真に限定する（13.2）
 *
 * Scope:
 * - flat/nested マウント（POST `/api/construction-photos/:id/images/from-surveys`）
 * - 実ストレージ（STORAGE_TYPE=local）による storage.copy
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
import { getStorageProvider } from '../../storage/index.js';
import { seedRoles, seedPermissions, seedRolePermissions } from '../../utils/seed-helpers.js';
import { initializeConstructionPhotoImageServices } from '../../routes/construction-photo-images.routes.js';

describe('Construction Photo Survey Copy API Integration Tests', () => {
  let prisma: PrismaClient;
  let testUserId: string;
  let projectId: string;
  let otherProjectId: string;
  let albumId: string;
  let accessToken: string;

  // 同一プロジェクトの現調写真
  let surveyImageId: string;
  let surveyOriginalKey: string;
  let surveyThumbKey: string;
  // 他プロジェクトの現調写真（拒否対象）
  let otherSurveyImageId: string;

  const originalBytes = Buffer.from('ORIGINAL-BYTES-payload-original');
  const thumbBytes = Buffer.from('THUMB-BYTES-payload-thumbnail');

  const TEST_EMAIL = 'test-construction-photo-survey-copy@example.com';
  const PROJECT_NAME = 'Construction Photo Survey Copy Test Project';
  const OTHER_PROJECT_NAME = 'Construction Photo Survey Copy Other Project';

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
    await initializeConstructionPhotoImageServices();

    await seedRoles(prisma);
    await seedPermissions(prisma);
    await seedRolePermissions(prisma);

    // construction_photo 権限を user ロールへ付与
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
      'Construction Photo Survey Copy Test User',
      ['user']
    );
    testUserId = testUserData.userId;
    accessToken = testUserData.accessToken;

    const project = await prisma.project.create({
      data: { name: PROJECT_NAME, salesPersonId: testUserId, createdById: testUserId },
    });
    projectId = project.id;

    const otherProject = await prisma.project.create({
      data: { name: OTHER_PROJECT_NAME, salesPersonId: testUserId, createdById: testUserId },
    });
    otherProjectId = otherProject.id;

    const album = await prisma.constructionPhotoAlbum.create({
      data: { projectId, name: '現調コピー用アルバム' },
    });
    albumId = album.id;

    // 同一プロジェクトの現調写真: 実ストレージへ original/thumbnail を保存
    const storage = getStorageProvider();
    if (!storage) {
      throw new Error('Storage provider is not configured for integration test');
    }
    surveyOriginalKey = `survey-images/copy-test/${Date.now()}_orig.jpg`;
    surveyThumbKey = `survey-images/copy-test/${Date.now()}_thumb.jpg`;
    await storage.upload(surveyOriginalKey, originalBytes, { contentType: 'image/jpeg' });
    await storage.upload(surveyThumbKey, thumbBytes, { contentType: 'image/jpeg' });

    const survey = await prisma.siteSurvey.create({
      data: { projectId, name: 'コピー元現場調査', surveyDate: new Date('2024-05-01') },
    });
    const surveyImage = await prisma.surveyImage.create({
      data: {
        surveyId: survey.id,
        originalPath: surveyOriginalKey,
        thumbnailPath: surveyThumbKey,
        fileName: 'survey-source.jpg',
        fileSize: 543210,
        width: 1600,
        height: 1200,
        displayOrder: 1,
      },
    });
    surveyImageId = surveyImage.id;

    // 他プロジェクトの現調写真（拒否対象）
    const otherSurvey = await prisma.siteSurvey.create({
      data: {
        projectId: otherProjectId,
        name: '他プロジェクト現場調査',
        surveyDate: new Date('2024-05-01'),
      },
    });
    const otherSurveyImage = await prisma.surveyImage.create({
      data: {
        surveyId: otherSurvey.id,
        originalPath: 'survey-images/other/orig.jpg',
        thumbnailPath: 'survey-images/other/thumb.jpg',
        fileName: 'other.jpg',
        fileSize: 100,
        width: 100,
        height: 100,
        displayOrder: 1,
      },
    });
    otherSurveyImageId = otherSurveyImage.id;
  });

  afterAll(async () => {
    await prisma.constructionPhoto.deleteMany({ where: { albumId } });
    await prisma.constructionPhotoAlbum.deleteMany({ where: { projectId } });
    await prisma.surveyImage.deleteMany({
      where: { survey: { projectId: { in: [projectId, otherProjectId] } } },
    });
    await prisma.siteSurvey.deleteMany({
      where: { projectId: { in: [projectId, otherProjectId] } },
    });
    await prisma.project.deleteMany({
      where: { name: { in: [PROJECT_NAME, OTHER_PROJECT_NAME] } },
    });
    await prisma.user.deleteMany({ where: { email: TEST_EMAIL } });

    const storage = getStorageProvider();
    if (storage) {
      await storage.delete(surveyOriginalKey).catch(() => undefined);
      await storage.delete(surveyThumbKey).catch(() => undefined);
    }

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

  it('認証なしのコピーは401を返す', async () => {
    const res = await request(app)
      .post(`/api/construction-photos/${albumId}/images/from-surveys`)
      .send({ surveyImageIds: [surveyImageId] });
    expect(res.status).toBe(401);
  });

  it('同一プロジェクトの現調写真を独立写真項目として複製する（REQ 6.1, 6.2, 6.3, 6.4）', async () => {
    const res = await request(app)
      .post(`/api/construction-photos/${albumId}/images/from-surveys`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ surveyImageIds: [surveyImageId] });

    expect(res.status).toBe(201);
    expect(res.body.failed).toHaveLength(0);
    expect(res.body.successful).toHaveLength(1);

    const copied = res.body.successful[0];
    expect(copied.albumId).toBe(albumId);
    // 寸法/サイズは複製元から流用（REQ 6.2）
    expect(copied.width).toBe(1600);
    expect(copied.height).toBe(1200);
    expect(copied.fileSize).toBe(543210);
    expect(copied.thumbnailUrl).toBeTruthy();
    expect(copied.printImageUrl).toBe(`/api/construction-photos/images/${copied.id}/print-image`);

    // DBに独立行が作られ sourceSurveyImageId が記録される（REQ 6.3）
    const row = await prisma.constructionPhoto.findUnique({ where: { id: copied.id } });
    expect(row).not.toBeNull();
    expect(row!.sourceSurveyImageId).toBe(surveyImageId);
    // 新キーは construction-photos/${albumId}/ 配下
    expect(row!.originalPath).toMatch(new RegExp(`^construction-photos/${albumId}/`));
    expect(row!.thumbnailPath).toMatch(new RegExp(`^construction-photos/${albumId}/`));
    // 複製元とは別キー（共有参照ではない）
    expect(row!.originalPath).not.toBe(surveyOriginalKey);
    expect(row!.thumbnailPath).not.toBe(surveyThumbKey);

    // storage.copy によりバイトが実際に複製されている
    const storage = getStorageProvider();
    const copiedOriginal = await storage!.get(row!.originalPath);
    const copiedThumb = await storage!.get(row!.thumbnailPath);
    expect(copiedOriginal?.equals(originalBytes)).toBe(true);
    expect(copiedThumb?.equals(thumbBytes)).toBe(true);
  });

  it('コピー元の現調写真を削除してもコピーは残る（独立性 REQ 6.3）', async () => {
    // 独立性検証用に別途1件コピー
    const res = await request(app)
      .post(`/api/construction-photos/${albumId}/images/from-surveys`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ surveyImageIds: [surveyImageId] });
    expect(res.status).toBe(201);
    const copiedId = res.body.successful[0].id;
    const copiedRow = await prisma.constructionPhoto.findUnique({ where: { id: copiedId } });

    // コピー元 SurveyImage を削除（DBレコードとストレージ原本）
    await prisma.surveyImage.delete({ where: { id: surveyImageId } });
    const storage = getStorageProvider();
    await storage!.delete(surveyOriginalKey).catch(() => undefined);
    await storage!.delete(surveyThumbKey).catch(() => undefined);

    // コピーは影響を受けず残っており、複製されたバイトも健在
    const stillThere = await prisma.constructionPhoto.findUnique({ where: { id: copiedId } });
    expect(stillThere).not.toBeNull();
    const copiedOriginal = await storage!.get(copiedRow!.originalPath);
    expect(copiedOriginal?.equals(originalBytes)).toBe(true);
  });

  it('他プロジェクトの現調写真は404で拒否する（REQ 6.4, 13.2）', async () => {
    const res = await request(app)
      .post(`/api/construction-photos/${albumId}/images/from-surveys`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ surveyImageIds: [otherSurveyImageId] });

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('SURVEY_IMAGE_NOT_ALLOWED');

    // 他プロジェクト現調写真は複製されていない
    const count = await prisma.constructionPhoto.count({
      where: { albumId, sourceSurveyImageId: otherSurveyImageId },
    });
    expect(count).toBe(0);
  });

  it('存在しないアルバムへのコピーは404を返す', async () => {
    const res = await request(app)
      .post('/api/construction-photos/99999999-9999-4999-8999-999999999999/images/from-surveys')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ surveyImageIds: [otherSurveyImageId] });
    expect(res.status).toBe(404);
  });
});

/**
 * Requirements coverage (construction-photo) — requirement-coverage tags.
 * 各IDは本ファイル内の対応テストが検証する受入基準（監査でエビデンス確認済み）。
 * @requirement construction-photo/REQ-6.2
 * @requirement construction-photo/REQ-6.3
 * @requirement construction-photo/REQ-6.4
 */
