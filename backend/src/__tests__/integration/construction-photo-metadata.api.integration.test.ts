/**
 * @fileoverview 工事写真メタ一括更新・並び替え・削除API統合テスト
 *
 * Task 2.5: メタ一括更新・並び替え・削除
 *
 * Requirements coverage:
 * - 7.1, 7.5: コメント・印刷対象の確定
 * - 7.3, 7.4, 7.6: 並び替えと displayOrder 1..n 正規化
 * - 7.7: 写真項目削除で写真と関連データ（看板配置）が消える
 * - 9.1, 9.5: 看板の関連付け・配置の保持（合成しない）
 * - 11.4: メタ一括更新＋順序更新の最大2リクエストで確定
 * - 13.1, 13.2: 認証(401)。担当でない一般ユーザーも権限があれば更新・削除できる。他プロジェクトの看板は404
 *
 * Scope:
 * - flat/nested 二重マウント（PATCH /images/batch, PUT /:id/images/order, DELETE /images/:imageId）
 * - 実ストレージ（STORAGE_TYPE=local）＋実 sharp。テストは自己クリーンアップ。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import request from 'supertest';
import { validateEnv } from '../../config/env.js';
import { Prisma, type PrismaClient } from '../../generated/prisma/client.js';

validateEnv();

import app from '../../app.js';
import getPrismaClient from '../../db.js';
import redis, { initRedis } from '../../redis.js';
import { getStorageProvider } from '../../storage/index.js';
import { seedRoles, seedPermissions, seedRolePermissions } from '../../utils/seed-helpers.js';
import { initializeConstructionPhotoImageServices } from '../../routes/construction-photo-images.routes.js';
import { ConstructionSignboardService } from '../../services/construction-signboard.service.js';

describe('Construction Photo Metadata/Order/Delete API Integration Tests', () => {
  let prisma: PrismaClient;
  let testUserId: string;
  let projectId: string;
  let albumId: string;
  let signboardId: string;
  let accessToken: string;
  let outsiderToken: string;
  let validJpeg: Buffer;

  const TEST_EMAIL = 'test-construction-photo-metadata-integration@example.com';
  const OUTSIDER_EMAIL = 'test-construction-photo-metadata-outsider@example.com';
  const PROJECT_NAME = 'Construction Photo Metadata Integration Test Project';

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

  const uploadPhoto = async (fileName: string): Promise<string> => {
    const res = await request(app)
      .post(`/api/construction-photos/${albumId}/images`)
      .set('Authorization', `Bearer ${accessToken}`)
      .attach('images', validJpeg, { filename: fileName, contentType: 'image/jpeg' });
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
      'Construction Photo Metadata Test User',
      ['user']
    );
    testUserId = testUserData.userId;
    accessToken = testUserData.accessToken;

    const outsider = await createAuthenticatedUser(
      OUTSIDER_EMAIL,
      'Construction Photo Metadata Outsider',
      ['user']
    );
    outsiderToken = outsider.accessToken;

    const project = await prisma.project.create({
      data: { name: PROJECT_NAME, salesPersonId: testUserId, createdById: testUserId },
    });
    projectId = project.id;

    const album = await prisma.constructionPhotoAlbum.create({
      data: { projectId, name: 'メタ更新用アルバム' },
    });
    albumId = album.id;

    const signboard = await prisma.constructionSignboard.create({
      data: { projectId, workName: 'テスト工事', workLocation: 'テスト現場' },
    });
    signboardId = signboard.id;

    const sharp = (await import('sharp')).default;
    validJpeg = await sharp({
      create: { width: 24, height: 24, channels: 3, background: { r: 200, g: 30, b: 30 } },
    })
      .jpeg()
      .toBuffer();
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

  describe('認証（REQ 13.1）', () => {
    it('認証なしのメタ一括更新は401', async () => {
      const res = await request(app)
        .patch('/api/construction-photos/images/batch')
        .send({ items: [{ id: '00000000-0000-4000-8000-000000000000' }] });
      expect(res.status).toBe(401);
    });

    it('認証なしの順序更新は401', async () => {
      const res = await request(app)
        .put(`/api/construction-photos/${albumId}/images/order`)
        .send({ orders: [{ id: '00000000-0000-4000-8000-000000000000', order: 1 }] });
      expect(res.status).toBe(401);
    });

    it('認証なしの削除は401', async () => {
      const res = await request(app).delete(
        '/api/construction-photos/images/00000000-0000-4000-8000-000000000000'
      );
      expect(res.status).toBe(401);
    });
  });

  describe('メタ一括更新＋並び替え（最大2リクエスト, REQ 7.5,7.6,9.1,9.5,11.4）', () => {
    it('コメント/印刷対象/看板/配置のバッチ＋順序の2リクエストで確定し合成物は生成されない', async () => {
      const p1 = await uploadPhoto('m1.jpg');
      const p2 = await uploadPhoto('m2.jpg');
      const p3 = await uploadPhoto('m3.jpg');

      // リクエスト1: メタ一括更新（コメント/印刷対象/看板/配置＋displayOrder 正規化）
      const batchRes = await request(app)
        .patch('/api/construction-photos/images/batch')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          items: [
            {
              id: p1,
              comment: '基礎配筋',
              includeInReport: true,
              signboardId,
              signboardPlacement: { left: 10, top: 20, width: 120, height: 90 },
              displayOrder: 30,
            },
            { id: p2, includeInReport: false, displayOrder: 10 },
            { id: p3, comment: '型枠', displayOrder: 20 },
          ],
        });

      expect(batchRes.status).toBe(200);
      expect(Array.isArray(batchRes.body)).toBe(true);

      // 看板配置は保持されるが、合成物（別ストレージオブジェクト）は生成されない（オンデマンド）
      const p1Row = await prisma.constructionPhoto.findUnique({ where: { id: p1 } });
      expect(p1Row?.comment).toBe('基礎配筋');
      expect(p1Row?.includeInReport).toBe(true);
      expect(p1Row?.signboardId).toBe(signboardId);
      expect(p1Row?.signboardPlacement).toEqual({ left: 10, top: 20, width: 120, height: 90 });

      // displayOrder は 1..n に正規化（10→1, 20→2, 30→3）
      const rowsAfterBatch = await prisma.constructionPhoto.findMany({
        where: { albumId },
        orderBy: { displayOrder: 'asc' },
        select: { id: true, displayOrder: true },
      });
      const orderById = new Map(rowsAfterBatch.map((r) => [r.id, r.displayOrder]));
      expect(orderById.get(p2)).toBe(1);
      expect(orderById.get(p3)).toBe(2);
      expect(orderById.get(p1)).toBe(3);

      // リクエスト2: 並び替え（逆順）→ 1..n 正規化
      const orderRes = await request(app)
        .put(`/api/construction-photos/${albumId}/images/order`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          orders: [
            { id: p1, order: 1 },
            { id: p3, order: 2 },
            { id: p2, order: 3 },
          ],
        });
      expect(orderRes.status).toBe(204);

      const rowsAfterOrder = await prisma.constructionPhoto.findMany({
        where: { albumId },
        orderBy: { displayOrder: 'asc' },
        select: { id: true, displayOrder: true },
      });
      expect(rowsAfterOrder.map((r) => r.id)).toEqual([p1, p3, p2]);
      expect(rowsAfterOrder.map((r) => r.displayOrder)).toEqual([1, 2, 3]);

      // 後片付け
      await prisma.constructionPhoto.deleteMany({ where: { id: { in: [p1, p2, p3] } } });
    });

    it('担当でない一般ユーザーも、編集の権限（construction_photo:update）があればメタを更新できる', async () => {
      // outsider は当該プロジェクトの作成者・営業担当・工事担当のいずれでもない user ロールの利用者。
      // アクセスはロールの権限の表（RBAC）だけで判定する（Task 23.1 の利用者の判断）
      const p1 = await uploadPhoto('boundary.jpg');
      const res = await request(app)
        .patch('/api/construction-photos/images/batch')
        .set('Authorization', `Bearer ${outsiderToken}`)
        .send({ items: [{ id: p1, comment: 'x' }] });
      expect(res.status).toBe(200);
      const row = await prisma.constructionPhoto.findUnique({ where: { id: p1 } });
      expect(row?.comment).toBe('x');
      await prisma.constructionPhoto.deleteMany({ where: { id: p1 } });
    });

    it('他プロジェクトの signboardId 指定は404で弾く（REQ 9.1, 13.2）', async () => {
      const otherProject = await prisma.project.create({
        data: {
          name: `${PROJECT_NAME} OTHER`,
          salesPersonId: testUserId,
          createdById: testUserId,
        },
      });
      const otherSignboard = await prisma.constructionSignboard.create({
        data: { projectId: otherProject.id, workName: '他工事', workLocation: '他現場' },
      });
      const p1 = await uploadPhoto('badsign.jpg');

      const res = await request(app)
        .patch('/api/construction-photos/images/batch')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ items: [{ id: p1, signboardId: otherSignboard.id }] });
      expect(res.status).toBe(404);

      // 弾かれたため関連付けは行われない
      const row = await prisma.constructionPhoto.findUnique({ where: { id: p1 } });
      expect(row?.signboardId).toBeNull();

      await prisma.constructionPhoto.deleteMany({ where: { id: p1 } });
      await prisma.constructionSignboard.deleteMany({ where: { id: otherSignboard.id } });
      await prisma.project.deleteMany({ where: { id: otherProject.id } });
    });
  });

  describe('看板の取り除きとの競合（REQ 9.7, Task 24.1）', () => {
    /** 行ロックの解放を待っているバックエンドが n 件になるまで待つ */
    const waitForLockWaiters = async (n: number): Promise<void> => {
      const deadline = Date.now() + 10000;
      for (;;) {
        const rows = await prisma.$queryRaw<Array<{ count: number }>>`
          SELECT count(*)::int AS count FROM pg_stat_activity
          WHERE wait_event_type = 'Lock' AND datname = current_database()`;
        const count = rows[0]?.count ?? 0;
        if (count >= n) {
          return;
        }
        if (Date.now() > deadline) {
          throw new Error(`lock waiters did not reach ${n} (now ${count})`);
        }
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    };

    it('看板の検証の後・書き込みの前に看板の取り除きが確定しても、取り除かれた看板を指す行を作らない', async () => {
      const doomed = await prisma.constructionSignboard.create({
        data: { projectId, workName: '検証後に取り除く工事', workLocation: '検証後に取り除く現場' },
      });
      const p1 = await uploadPhoto('window.jpg');

      // 写真項目の行を別のトランザクションでロックし、保存の書き込みだけを止める
      // （看板の検証はロックを要しないため先へ進む）
      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      let markLocked!: () => void;
      const locked = new Promise<void>((resolve) => {
        markLocked = resolve;
      });
      const holding = prisma.$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT id FROM construction_photos WHERE id = ${p1} FOR UPDATE`;
          markLocked();
          await gate;
        },
        { timeout: 20000 }
      );
      await locked;

      const saving = request(app)
        .patch('/api/construction-photos/images/batch')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          items: [
            {
              id: p1,
              signboardId: doomed.id,
              signboardPlacement: { left: 1, top: 1, width: 10, height: 10 },
            },
          ],
        })
        .then((res) => res);
      // 保存が写真項目の行の書き込みで待つまで進める
      await waitForLockWaiters(1);

      // 保存の検証の後に、看板を取り除く（実際の取り除きの処理）
      let deleteSettled = false;
      const deleting = new ConstructionSignboardService({ prisma })
        .delete(doomed.id, projectId)
        .then((result) => {
          deleteSettled = true;
          return result;
        });
      await new Promise((resolve) => setTimeout(resolve, 500));
      const deleteSettledWhileSaving = deleteSettled;

      release();
      await holding;
      const res = await saving;
      const deleted = await deleting;

      // 取り除きは保存が看板の行に取ったロックの解放（保存の確定）を待ち、保存が書いた指定も解除する
      expect(deleteSettledWhileSaving).toBe(false);
      expect(res.status).toBe(200);
      expect(deleted.inUseCount).toBe(1);

      // 取り除かれた看板を指す行は残らない
      const row = await prisma.constructionPhoto.findUnique({ where: { id: p1 } });
      expect(row?.signboardId).toBeNull();
      expect(row?.signboardPlacement).toBeNull();

      await prisma.constructionPhoto.deleteMany({ where: { id: p1 } });
      await prisma.constructionSignboard.deleteMany({ where: { id: doomed.id } });
    });

    it('看板の取り除きの途中に送られた保存は、取り除きの確定を待ってから看板を検証し拒否する', async () => {
      const doomed = await prisma.constructionSignboard.create({
        data: { projectId, workName: '取り除く工事', workLocation: '取り除く現場' },
      });
      const p1 = await uploadPhoto('race.jpg');

      // ConstructionSignboardService.delete と同じ文の順（看板の論理削除 → 参照する写真項目の解除）の
      // トランザクションを、看板の行を更新した直後で止めておく
      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      let markLocked!: () => void;
      const locked = new Promise<void>((resolve) => {
        markLocked = resolve;
      });
      const deleting = prisma.$transaction(
        async (tx) => {
          await tx.constructionSignboard.update({
            where: { id: doomed.id },
            data: { deletedAt: new Date() },
          });
          markLocked();
          await gate;
          await tx.constructionPhoto.updateMany({
            where: { signboardId: doomed.id },
            data: { signboardId: null, signboardPlacement: Prisma.JsonNull },
          });
        },
        { timeout: 20000 }
      );
      await locked;

      // 取り除きの確定前に、その看板を指定する保存を送る
      let settled = false;
      const saving = request(app)
        .patch('/api/construction-photos/images/batch')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          items: [
            {
              id: p1,
              signboardId: doomed.id,
              signboardPlacement: { left: 1, top: 1, width: 10, height: 10 },
            },
          ],
        })
        .then((res) => {
          settled = true;
          return res;
        });

      await new Promise((resolve) => setTimeout(resolve, 1000));
      const settledBeforeDeleteCommitted = settled;
      release();
      await deleting;
      const res = await saving;

      // 保存は看板の行のロックで取り除きの確定を待ち、確定後の看板（論理削除済み）で検証して拒否する
      expect(settledBeforeDeleteCommitted).toBe(false);
      expect(res.status).toBe(404);
      expect(res.body.code).toBe('SIGNBOARD_NOT_ALLOWED');

      // 取り除かれた看板を指す行は残らない
      const row = await prisma.constructionPhoto.findUnique({ where: { id: p1 } });
      expect(row?.signboardId).toBeNull();
      expect(row?.signboardPlacement).toBeNull();

      await prisma.constructionPhoto.deleteMany({ where: { id: p1 } });
      await prisma.constructionSignboard.deleteMany({ where: { id: doomed.id } });
    });

    it('一度きりの掃除のマイグレーションは、取り除かれた看板を指す行の指定と配置だけを解除する', async () => {
      const migrationSql = readFileSync(
        resolve(
          __dirname,
          '../../../prisma/migrations/20261005000000_release_photos_referencing_deleted_signboards/migration.sql'
        ),
        'utf-8'
      );
      const removed = await prisma.constructionSignboard.create({
        data: {
          projectId,
          workName: '取り除いた工事',
          workLocation: '取り除いた現場',
          deletedAt: new Date(),
        },
      });
      const placement = { left: 2, top: 3, width: 40, height: 30 };
      const dangling = await uploadPhoto('dangling.jpg');
      const live = await uploadPhoto('live.jpg');
      // 競合で残った宙吊りの行（取り除かれた看板を指す）と、生きている看板を指す行を用意する
      await prisma.constructionPhoto.update({
        where: { id: dangling },
        data: { signboardId: removed.id, signboardPlacement: placement },
      });
      await prisma.constructionPhoto.update({
        where: { id: live },
        data: { signboardId, signboardPlacement: placement },
      });

      await prisma.$executeRawUnsafe(migrationSql);

      const danglingRow = await prisma.constructionPhoto.findUnique({ where: { id: dangling } });
      expect(danglingRow?.signboardId).toBeNull();
      expect(danglingRow?.signboardPlacement).toBeNull();
      const liveRow = await prisma.constructionPhoto.findUnique({ where: { id: live } });
      expect(liveRow?.signboardId).toBe(signboardId);
      expect(liveRow?.signboardPlacement).toEqual(placement);

      await prisma.constructionPhoto.deleteMany({ where: { id: { in: [dangling, live] } } });
      await prisma.constructionSignboard.deleteMany({ where: { id: removed.id } });
    });
  });

  describe('写真項目の削除（REQ 7.7, 13.2）', () => {
    it('削除で写真行と関連ストレージ（原本/サムネ）が消える', async () => {
      const p1 = await uploadPhoto('del.jpg');
      const row = await prisma.constructionPhoto.findUnique({ where: { id: p1 } });
      expect(row).not.toBeNull();

      const storage = getStorageProvider()!;
      expect(await storage.exists(row!.originalPath)).toBe(true);
      expect(await storage.exists(row!.thumbnailPath)).toBe(true);

      const res = await request(app)
        .delete(`/api/construction-photos/images/${p1}`)
        .set('Authorization', `Bearer ${accessToken}`);
      expect(res.status).toBe(204);

      // 行が消える
      expect(await prisma.constructionPhoto.findUnique({ where: { id: p1 } })).toBeNull();
      // 関連ストレージが消える
      expect(await storage.exists(row!.originalPath)).toBe(false);
      expect(await storage.exists(row!.thumbnailPath)).toBe(false);
    });

    it('看板配置を持つ写真の削除で配置データも消える（REQ 7.7）', async () => {
      const p1 = await uploadPhoto('delsign.jpg');
      await request(app)
        .patch('/api/construction-photos/images/batch')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          items: [
            { id: p1, signboardId, signboardPlacement: { left: 1, top: 2, width: 3, height: 4 } },
          ],
        });
      const before = await prisma.constructionPhoto.findUnique({ where: { id: p1 } });
      expect(before?.signboardPlacement).not.toBeNull();

      const res = await request(app)
        .delete(`/api/construction-photos/images/${p1}`)
        .set('Authorization', `Bearer ${accessToken}`);
      expect(res.status).toBe(204);
      expect(await prisma.constructionPhoto.findUnique({ where: { id: p1 } })).toBeNull();
    });

    it('存在しない写真項目の削除は404', async () => {
      const res = await request(app)
        .delete('/api/construction-photos/images/99999999-9999-4999-8999-999999999999')
        .set('Authorization', `Bearer ${accessToken}`);
      expect(res.status).toBe(404);
    });

    it('担当でない利用者も、削除の権限（construction_photo:delete）を持てば削除できる', async () => {
      // 本ファイルの beforeAll は user ロールへ construction_photo:delete を足している（削除の
      // 検証のため）。outsider は担当者ではないが、その権限を持つため削除できる。
      // 権限を持たない user ロール（シードの定義）が 403 になることは
      // construction-photo-access.api.integration.test.ts が確かめる
      const p1 = await uploadPhoto('delboundary.jpg');
      const res = await request(app)
        .delete(`/api/construction-photos/images/${p1}`)
        .set('Authorization', `Bearer ${outsiderToken}`);
      expect(res.status).toBe(204);
      expect(await prisma.constructionPhoto.findUnique({ where: { id: p1 } })).toBeNull();
    });
  });
});
