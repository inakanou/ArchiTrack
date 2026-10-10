/**
 * @fileoverview 見積書の編集セッション（在席情報）API 統合テスト
 *
 * `PUT /api/estimates/:id/edit-session`（在席通知）と `DELETE /api/estimates/:id/edit-session`
 * （退出）を、実データベース・実認証・実 RBAC で検証する。2 人の利用者が同じ見積書を
 * 開いている状況を作り、相手が編集中として返ること、退出・期限切れで返らなくなることを確かめる。
 *
 * Requirements (estimate-creation):
 * - REQ-11.7: 見積書が他のユーザーによって編集中の場合、編集中であることを警告表示する
 *   （本ファイルは警告の材料を返す API を検める。画面の警告は E2E
 *   `e2e/specs/estimate/estimate-edit-presence-e2e.spec.ts` が検める）
 * - REQ-11.6: 楽観的排他制御により競合を検出する（在席通知が `updatedAt` を進めず、
 *   保存の競合判定を変えないことの確認）
 *
 * Task 61.1: REQ-11.7 の実装
 *
 * @module __tests__/integration/estimate-edit-session.api.integration.test
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
import { ESTIMATE_EDIT_SESSION_TTL_SECONDS } from '../../services/estimate-edit-session.service.js';

const PASSWORD = 'TestPassword123!';

interface TestAccount {
  email: string;
  displayName: string;
  roleName: string;
}

const EDITOR_A: TestAccount = {
  email: 'test-edit-session-a@example.com',
  displayName: '編集セッション利用者A',
  roleName: 'user',
};
const EDITOR_B: TestAccount = {
  email: 'test-edit-session-b@example.com',
  displayName: '編集セッション利用者B',
  roleName: 'user',
};
/** ロールを持たない利用者（estimate:update を持たない） */
const NO_ROLE: TestAccount = {
  email: 'test-edit-session-norole@example.com',
  displayName: '編集セッション権限なし',
  roleName: '',
};

describe('Estimate Edit Session API Integration Tests (REQ-11.7)', () => {
  let prisma: PrismaClient;
  const tokens: Record<string, string> = {};
  const userIds: Record<string, string> = {};
  let projectId: string;
  let estimateId: string;

  const cleanupAccount = async (email: string): Promise<void> => {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (!existing) return;
    const projects = await prisma.project.findMany({
      where: { OR: [{ salesPersonId: existing.id }, { createdById: existing.id }] },
      select: { id: true },
    });
    for (const project of projects) {
      await prisma.estimate.deleteMany({ where: { projectId: project.id } });
    }
    await prisma.project.deleteMany({
      where: { OR: [{ salesPersonId: existing.id }, { createdById: existing.id }] },
    });
    await prisma.userRole.deleteMany({ where: { userId: existing.id } });
    await prisma.user.delete({ where: { id: existing.id } });
  };

  const createAndLogin = async (account: TestAccount): Promise<void> => {
    await cleanupAccount(account.email);
    const passwordHash = await (
      await import('@node-rs/argon2')
    ).hash(PASSWORD, { memoryCost: 65536, timeCost: 3, parallelism: 4 });
    const user = await prisma.user.create({
      data: { email: account.email, displayName: account.displayName, passwordHash },
    });
    if (account.roleName) {
      const role = await prisma.role.findUnique({ where: { name: account.roleName } });
      expect(role).not.toBeNull();
      await prisma.userRole.create({ data: { userId: user.id, roleId: role!.id } });
    }
    const response = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: account.email, password: PASSWORD });
    expect(response.status).toBe(200);
    tokens[account.email] = response.body.accessToken;
    userIds[account.email] = user.id;
  };

  const heartbeat = (account: TestAccount, id = estimateId) =>
    request(app)
      .put(`/api/estimates/${id}/edit-session`)
      .set('Authorization', `Bearer ${tokens[account.email]}`);

  const leave = (account: TestAccount, id = estimateId) =>
    request(app)
      .delete(`/api/estimates/${id}/edit-session`)
      .set('Authorization', `Bearer ${tokens[account.email]}`);

  beforeAll(async () => {
    prisma = getPrismaClient();
    await initRedis();
    await seedRoles(prisma);
    await seedPermissions(prisma);
    await seedRolePermissions(prisma);

    await createAndLogin(EDITOR_A);
    await createAndLogin(EDITOR_B);
    await createAndLogin(NO_ROLE);

    const project = await prisma.project.create({
      data: {
        name: 'テスト用プロジェクト_編集セッション統合テスト',
        status: 'PREPARING',
        salesPersonId: userIds[EDITOR_A.email]!,
        createdById: userIds[EDITOR_A.email]!,
      },
    });
    projectId = project.id;
  });

  beforeEach(async () => {
    if (estimateId) {
      await prisma.estimate.deleteMany({ where: { id: estimateId } });
    }
    const estimate = await prisma.estimate.create({
      data: { projectId, name: `編集セッション統合テスト_${Date.now()}` },
    });
    estimateId = estimate.id;
  });

  afterAll(async () => {
    if (projectId) {
      await prisma.estimate.deleteMany({ where: { projectId } });
      await prisma.project.deleteMany({ where: { id: projectId } });
    }
    for (const account of [EDITOR_A, EDITOR_B, NO_ROLE]) {
      await cleanupAccount(account.email);
    }
    await prisma.$disconnect();
    redis.disconnect();
  });

  it('最初に開いた利用者には編集中の他の利用者がいない', async () => {
    const response = await heartbeat(EDITOR_A);

    expect(response.status).toBe(200);
    expect(response.body.otherEditors).toEqual([]);
    expect(response.body.ttlSeconds).toBe(ESTIMATE_EDIT_SESSION_TTL_SECONDS);
    expect(typeof response.body.heartbeatIntervalSeconds).toBe('number');
  });

  it('他の利用者が開いている間、その利用者を表示名つきで返す（自分は含めない） (REQ-11.7)', async () => {
    await heartbeat(EDITOR_A).expect(200);

    const responseB = await heartbeat(EDITOR_B);
    expect(responseB.status).toBe(200);
    expect(responseB.body.otherEditors).toHaveLength(1);
    expect(responseB.body.otherEditors[0]).toMatchObject({
      userId: userIds[EDITOR_A.email],
      displayName: EDITOR_A.displayName,
    });
    expect(Number.isNaN(Date.parse(responseB.body.otherEditors[0].lastSeenAt))).toBe(false);

    const responseA = await heartbeat(EDITOR_A);
    expect(responseA.body.otherEditors).toEqual([
      expect.objectContaining({
        userId: userIds[EDITOR_B.email],
        displayName: EDITOR_B.displayName,
      }),
    ]);
  });

  it('同じ利用者が通知を繰り返しても在席は 1 行のまま', async () => {
    await heartbeat(EDITOR_A).expect(200);
    await heartbeat(EDITOR_A).expect(200);

    const count = await prisma.estimateEditSession.count({
      where: { estimateId, userId: userIds[EDITOR_A.email]! },
    });
    expect(count).toBe(1);
  });

  it('退出した利用者は編集中として返らない (REQ-11.7)', async () => {
    await heartbeat(EDITOR_A).expect(200);
    await heartbeat(EDITOR_B).expect(200);

    await leave(EDITOR_A).expect(204);

    const responseB = await heartbeat(EDITOR_B);
    expect(responseB.body.otherEditors).toEqual([]);
  });

  it('退出は冪等（在席が無くても 204）', async () => {
    await leave(EDITOR_A).expect(204);
    await leave(EDITOR_A).expect(204);
  });

  it('TTL を過ぎた在席は編集中として返らず、掃除される (REQ-11.7)', async () => {
    await heartbeat(EDITOR_A).expect(200);
    // 退出が届かなかった状況（タブを閉じた等）を、最終通知時刻を TTL より前へ戻して作る
    await prisma.estimateEditSession.updateMany({
      where: { estimateId, userId: userIds[EDITOR_A.email]! },
      data: { lastSeenAt: new Date(Date.now() - (ESTIMATE_EDIT_SESSION_TTL_SECONDS + 5) * 1000) },
    });

    const responseB = await heartbeat(EDITOR_B);
    expect(responseB.body.otherEditors).toEqual([]);

    const remaining = await prisma.estimateEditSession.count({
      where: { estimateId, userId: userIds[EDITOR_A.email]! },
    });
    expect(remaining).toBe(0);
  });

  it('TTL 以内の在席は編集中として返る（期限の境界の内側）', async () => {
    await heartbeat(EDITOR_A).expect(200);
    await prisma.estimateEditSession.updateMany({
      where: { estimateId, userId: userIds[EDITOR_A.email]! },
      data: { lastSeenAt: new Date(Date.now() - (ESTIMATE_EDIT_SESSION_TTL_SECONDS - 10) * 1000) },
    });

    const responseB = await heartbeat(EDITOR_B);
    expect(responseB.body.otherEditors).toEqual([
      expect.objectContaining({ userId: userIds[EDITOR_A.email] }),
    ]);
  });

  it('在席通知は見積書の updatedAt を進めず、保存の競合判定に影響しない (REQ-11.6)', async () => {
    const before = await prisma.estimate.findUniqueOrThrow({ where: { id: estimateId } });

    await heartbeat(EDITOR_A).expect(200);
    await heartbeat(EDITOR_B).expect(200);
    await leave(EDITOR_A).expect(204);

    const after = await prisma.estimate.findUniqueOrThrow({ where: { id: estimateId } });
    expect(after.updatedAt.toISOString()).toBe(before.updatedAt.toISOString());

    // 開いた時点の updatedAt で保存すると成功する（在席通知が競合を起こさない）
    const save = await request(app)
      .put(`/api/estimates/${estimateId}/save`)
      .set('Authorization', `Bearer ${tokens[EDITOR_B.email]}`)
      .send({
        expectedUpdatedAt: before.updatedAt.toISOString(),
        reportFields: { submissionDate: null, validityPeriod: null, separateWorks: [] },
        items: [],
      });
    expect(save.status).toBe(200);
  });

  it('存在しない見積書は 404', async () => {
    const response = await heartbeat(EDITOR_A, '00000000-0000-4000-8000-000000000000');
    expect(response.status).toBe(404);
  });

  it('論理削除済みの見積書は 404', async () => {
    await prisma.estimate.update({ where: { id: estimateId }, data: { deletedAt: new Date() } });

    const response = await heartbeat(EDITOR_A);
    expect(response.status).toBe(404);
  });

  it('不正な ID は 400', async () => {
    const response = await heartbeat(EDITOR_A, 'not-a-uuid');
    expect(response.status).toBe(400);
  });

  it('未認証は 401', async () => {
    const response = await request(app).put(`/api/estimates/${estimateId}/edit-session`);
    expect(response.status).toBe(401);
  });

  it('estimate:update を持たない利用者は 403 で、在席は記録されない', async () => {
    const response = await heartbeat(NO_ROLE);
    expect(response.status).toBe(403);

    const count = await prisma.estimateEditSession.count({ where: { estimateId } });
    expect(count).toBe(0);
  });

  it('見積書を削除すると在席の行も消える（外部キーの連鎖）', async () => {
    await heartbeat(EDITOR_A).expect(200);
    await prisma.estimate.delete({ where: { id: estimateId } });

    const count = await prisma.estimateEditSession.count({ where: { estimateId } });
    expect(count).toBe(0);
  });
});
