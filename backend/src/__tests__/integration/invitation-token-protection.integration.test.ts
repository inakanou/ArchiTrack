/**
 * @fileoverview 招待のトークンのハッシュ保存・一覧・取り消し・再送信・監査の統合検証（user-authentication タスク50.1）
 *
 * Requirements (user-authentication):
 * - REQ-37.1: 招待トークンを、保存された値だけからは元のトークンを復元できない形式（SHA-256）で保存する
 * - REQ-37.2: 招待一覧の応答に招待トークンと招待 URL を含めない
 * - REQ-37.5: 招待の作成者でない管理者による未使用の招待の取り消しを受け付ける
 * - REQ-40.5: 招待の作成・取り消し・再送信と招待経由のアカウント作成を、実行者と対象のメールアドレスとともに監査ログへ記録する
 *
 * モックを使わず、本物のアプリ（認証ミドルウェア・権限の確認・ルート）と実 PostgreSQL・実 Redis を通す。
 * 共有の DB には他の試験の招待が居るため、本試験が作った印の付いたメールアドレスで結果を確かめる。
 */

import { createHash, randomBytes } from 'crypto';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import type Redis from 'ioredis';
import { validateEnv } from '../../config/env.js';
import type { PrismaClient } from '../../generated/prisma/client.js';

// 環境変数を初期化（モジュールインポート前に実行）
validateEnv();

import app from '../../app.js';
import getPrismaClient from '../../db.js';
import redis, { initRedis } from '../../redis.js';
import tokenService from '../../services/token.service.js';
import { seedRoles, seedPermissions, seedRolePermissions } from '../../utils/seed-helpers.js';
import { authUserStateCacheKey } from '../../services/authenticated-user-state-cache.js';
import { cleanupExpiredTokens } from '../../jobs/expired-token-cleanup.job.js';
import { createTestUser } from './test-user-factory.js';
import { createStoredInvitation } from './invitation-fixture.js';

const MARK = 'test-50-1-invitation-token';
const DAY_MS = 24 * 60 * 60 * 1000;
const INVITATIONS_PATH = '/api/v1/invitations';

/** 作成と再送信の応答の招待 URL からトークンの原文を取り出す（50.3 からフラグメントの形） */
function tokenFromInvitationUrl(invitationUrl: string): string {
  const url = new URL(invitationUrl);
  expect(url.pathname).toBe('/register');
  expect(url.search).toBe('');
  const token = new URLSearchParams(url.hash.slice(1)).get('token');
  expect(token, `招待 URL にトークンが無い: ${invitationUrl}`).toMatch(/^[0-9a-f]{64}$/);
  return token!;
}

function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

describe('招待のトークンの保護と招待の操作の監査（統合）', () => {
  let prisma: PrismaClient;
  let redisClient: Redis;

  async function cleanup(): Promise<void> {
    const users = await prisma.user.findMany({
      where: { email: { contains: MARK } },
      select: { id: true },
    });
    const ids = users.map((u) => u.id);
    if (ids.length > 0) {
      await redisClient.del(...ids.map(authUserStateCacheKey));
    }
    // 招待は作成者（inviterId）と登録した利用者（userId）を参照するため、利用者より先に消す
    await prisma.invitation.deleteMany({ where: { email: { contains: MARK } } });
    await prisma.refreshToken.deleteMany({ where: { userId: { in: ids } } });
    await prisma.userRole.deleteMany({ where: { userId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
  }

  async function createUser(label: string, roleName: string) {
    const user = await createTestUser(prisma, {
      email: `${MARK}-${label}-${randomBytes(4).toString('hex')}@example.com`,
      displayName: `${MARK}-${label}`,
      passwordHash: 'not-used-for-login',
    });
    const role = await prisma.role.findUniqueOrThrow({ where: { name: roleName } });
    await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });
    return user;
  }

  async function bearerFor(
    user: { id: string; email: string },
    role: string
  ): Promise<[string, string]> {
    const accessToken = await tokenService.generateAccessToken({
      accessTokenGeneration: 0,
      userId: user.id,
      email: user.email,
      roles: [role],
    });
    return ['Authorization', `Bearer ${accessToken}`];
  }

  function inviteeEmail(label: string): string {
    return `${MARK}-${label}-${randomBytes(4).toString('hex')}@example.com`;
  }

  async function auditLogsFor(action: string, targetId: string) {
    return prisma.auditLog.findMany({
      where: { action, targetId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async function verify(token: string) {
    return request(app).post(`${INVITATIONS_PATH}/verify`).send({ token });
  }

  beforeAll(async () => {
    prisma = getPrismaClient();
    await initRedis();
    const client = redis.getClient();
    // 前提: 実 Redis に接続できていること（できなければ赤にする。読み飛ばさない）
    expect(client, 'REDIS_URL の Redis クライアントが初期化されていない').not.toBeNull();
    expect(client!.status, '実 Redis に接続できていない').toBe('ready');
    redisClient = client!;
    await seedRoles(prisma);
    await seedPermissions(prisma);
    await seedRolePermissions(prisma);
    await cleanup();
  });

  afterAll(async () => {
    await cleanup();
    await redis.disconnect();
  });

  beforeEach(async () => {
    await cleanup();
  });

  /**
   * @requirement user-authentication/REQ-37.1
   * @requirement user-authentication/REQ-40.5
   */
  it('作成は原文の SHA-256 だけを保存し、作成直後の応答だけに招待 URL を載せ、作成を実行者と対象のメールアドレスとともに監査する', async () => {
    const admin = await createUser('creator', 'admin');
    const email = inviteeEmail('created');

    const response = await request(app)
      .post(INVITATIONS_PATH)
      .set(...(await bearerFor(admin, 'admin')))
      .send({ email });

    expect(response.status, JSON.stringify(response.body)).toBe(201);
    expect(Object.keys(response.body).sort()).toEqual(
      ['createdAt', 'email', 'expiresAt', 'id', 'invitationUrl', 'inviter', 'status'].sort()
    );
    expect(response.body).toMatchObject({
      email,
      status: 'pending',
      inviter: { id: admin.id, displayName: admin.displayName },
    });
    const rawToken = tokenFromInvitationUrl(response.body.invitationUrl);

    // 保存されているのは原文の SHA-256 で、原文そのものはどの列にも無い
    const stored = await prisma.invitation.findUniqueOrThrow({ where: { id: response.body.id } });
    expect(stored.tokenHash).toBe(sha256Hex(rawToken));
    expect(stored.tokenHash).not.toBe(rawToken);
    const rawRows = await prisma.$queryRaw<Array<Record<string, unknown>>>`
      SELECT * FROM "invitations" WHERE "id" = ${response.body.id}
    `;
    expect(rawRows).toHaveLength(1);
    expect(Object.keys(rawRows[0]!)).not.toContain('token');
    expect(Object.values(rawRows[0]!)).not.toContain(rawToken);

    // 招待 URL のトークンで検証できる（保存したハッシュで引く）
    const verified = await verify(rawToken);
    expect(verified.status).toBe(200);
    expect(verified.body).toEqual({ email });

    const logs = await auditLogsFor('INVITATION_CREATED', response.body.id);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      actorId: admin.id,
      actorEmail: admin.email,
      targetType: 'Invitation',
      targetId: response.body.id,
    });
    expect(logs[0]!.metadata).toMatchObject({ email });
    expect(JSON.stringify(logs[0])).not.toContain(rawToken);
  });

  /**
   * @requirement user-authentication/REQ-37.2
   */
  it('招待一覧の応答は招待トークン・トークンのハッシュ・招待 URL を含まず、状態・期限・作成者を返す', async () => {
    const admin = await createUser('list-admin', 'admin');
    const bearer = await bearerFor(admin, 'admin');
    const created = await request(app)
      .post(INVITATIONS_PATH)
      .set(...bearer)
      .send({ email: inviteeEmail('listed') });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    const rawToken = tokenFromInvitationUrl(created.body.invitationUrl);
    const { invitation: stored } = await createStoredInvitation(prisma, {
      email: inviteeEmail('listed-stored'),
      inviterId: admin.id,
      expiresAt: new Date(Date.now() + 7 * DAY_MS),
    });

    const response = await request(app)
      .get(INVITATIONS_PATH)
      .set(...bearer);

    expect(response.status, JSON.stringify(response.body)).toBe(200);
    const marked = (response.body as Array<Record<string, unknown>>).filter((item) =>
      String(item.email).includes(MARK)
    );
    expect(marked.map((item) => item.id).sort()).toEqual([created.body.id, stored.id].sort());
    for (const item of marked) {
      expect(Object.keys(item).sort()).toEqual(
        ['createdAt', 'email', 'expiresAt', 'id', 'inviter', 'status'].sort()
      );
      expect(item.inviter).toEqual({ id: admin.id, displayName: admin.displayName });
      expect(item.status).toBe('pending');
    }
    const body = JSON.stringify(response.body);
    expect(body).not.toContain(rawToken);
    expect(body).not.toContain(sha256Hex(rawToken));
    expect(body).not.toContain(stored.tokenHash!);
    expect(body).not.toContain('/register');
  });

  /**
   * @requirement user-authentication/REQ-37.5
   * @requirement user-authentication/REQ-40.5
   */
  it('作成者でない管理者が未使用の招待を取り消せ、取り消しを実行者と対象のメールアドレスとともに監査する', async () => {
    const creator = await createUser('revoke-creator', 'admin');
    const otherAdmin = await createUser('revoke-other', 'admin');
    const email = inviteeEmail('revoked');
    const created = await request(app)
      .post(INVITATIONS_PATH)
      .set(...(await bearerFor(creator, 'admin')))
      .send({ email });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    const rawToken = tokenFromInvitationUrl(created.body.invitationUrl);

    const response = await request(app)
      .delete(`${INVITATIONS_PATH}/${created.body.id}`)
      .set(...(await bearerFor(otherAdmin, 'admin')));

    expect(response.status, JSON.stringify(response.body)).toBe(204);
    const stored = await prisma.invitation.findUniqueOrThrow({ where: { id: created.body.id } });
    expect(stored.status).toBe('revoked');
    const verified = await verify(rawToken);
    expect(verified.status).toBe(400);
    expect(verified.body.error).toBe('Invitation has been revoked');

    const logs = await auditLogsFor('INVITATION_REVOKED', created.body.id);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      actorId: otherAdmin.id,
      actorEmail: otherAdmin.email,
      targetType: 'Invitation',
      targetId: created.body.id,
    });
    expect(logs[0]!.metadata).toMatchObject({ email, inviterId: creator.id });
  });

  it('使用済みの招待の取り消しは 400、存在しない招待は 404、招待の権限の無い一般ユーザーは 403 で、いずれも監査に残さない', async () => {
    const admin = await createUser('revoke-reject-admin', 'admin');
    const regular = await createUser('revoke-reject-user', 'user');
    const { invitation: used } = await createStoredInvitation(prisma, {
      email: inviteeEmail('revoke-used'),
      inviterId: admin.id,
      expiresAt: new Date(Date.now() + 7 * DAY_MS),
      status: 'used',
      usedAt: new Date(),
    });
    const { invitation: pending } = await createStoredInvitation(prisma, {
      email: inviteeEmail('revoke-forbidden'),
      inviterId: admin.id,
      expiresAt: new Date(Date.now() + 7 * DAY_MS),
    });
    const adminBearer = await bearerFor(admin, 'admin');

    const usedResponse = await request(app)
      .delete(`${INVITATIONS_PATH}/${used.id}`)
      .set(...adminBearer);
    expect(usedResponse.status).toBe(400);
    const missingResponse = await request(app)
      .delete(`${INVITATIONS_PATH}/00000000-0000-4000-8000-000000000000`)
      .set(...adminBearer);
    expect(missingResponse.status).toBe(404);
    const forbiddenResponse = await request(app)
      .delete(`${INVITATIONS_PATH}/${pending.id}`)
      .set(...(await bearerFor(regular, 'user')));
    expect(forbiddenResponse.status).toBe(403);

    await expect(
      prisma.invitation.findUniqueOrThrow({ where: { id: pending.id } })
    ).resolves.toMatchObject({ status: 'pending' });
    expect(await auditLogsFor('INVITATION_REVOKED', used.id)).toHaveLength(0);
    expect(await auditLogsFor('INVITATION_REVOKED', pending.id)).toHaveLength(0);
  });

  /**
   * @requirement user-authentication/REQ-37.1
   * @requirement user-authentication/REQ-40.5
   */
  it('再送信は同じ招待の行のハッシュと期限を新しいトークンのもので置き換え、古いトークンを無効にし、再送信を監査する', async () => {
    const creator = await createUser('resend-creator', 'admin');
    const otherAdmin = await createUser('resend-other', 'admin');
    const email = inviteeEmail('resent');
    const created = await request(app)
      .post(INVITATIONS_PATH)
      .set(...(await bearerFor(creator, 'admin')))
      .send({ email });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    const oldToken = tokenFromInvitationUrl(created.body.invitationUrl);
    // 期限を 1 日後へ縮め、再送信で延びることを確かめられるようにする
    const shortened = new Date(Date.now() + DAY_MS);
    await prisma.invitation.update({
      where: { id: created.body.id },
      data: { expiresAt: shortened },
    });

    const before = Date.now();
    const response = await request(app)
      .post(`${INVITATIONS_PATH}/${created.body.id}/resend`)
      .set(...(await bearerFor(otherAdmin, 'admin')));

    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(Object.keys(response.body).sort()).toEqual(
      ['createdAt', 'email', 'expiresAt', 'id', 'invitationUrl', 'inviter', 'status'].sort()
    );
    expect(response.body).toMatchObject({ id: created.body.id, email, status: 'pending' });
    const newToken = tokenFromInvitationUrl(response.body.invitationUrl);
    expect(newToken).not.toBe(oldToken);

    // 同じ行のハッシュと期限が置き換わり、行は増えない
    const rows = await prisma.invitation.findMany({ where: { email } });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.id).toBe(created.body.id);
    expect(rows[0]!.tokenHash).toBe(sha256Hex(newToken));
    expect(rows[0]!.expiresAt.getTime()).toBeGreaterThan(shortened.getTime());
    expect(rows[0]!.expiresAt.getTime()).toBeGreaterThanOrEqual(before + 7 * DAY_MS - 60_000);
    expect(rows[0]!.expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + 7 * DAY_MS + 60_000);

    // 古いトークンは無効、新しいトークンは有効
    const oldVerified = await verify(oldToken);
    expect(oldVerified.status).toBe(400);
    expect(oldVerified.body.error).toBe('Invalid invitation token');
    const newVerified = await verify(newToken);
    expect(newVerified.status).toBe(200);
    expect(newVerified.body).toEqual({ email });

    const logs = await auditLogsFor('INVITATION_RESENT', created.body.id);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      actorId: otherAdmin.id,
      actorEmail: otherAdmin.email,
      targetType: 'Invitation',
      targetId: created.body.id,
    });
    expect(logs[0]!.metadata).toMatchObject({ email });
    expect(JSON.stringify(logs[0])).not.toContain(newToken);
  });

  it('掃除でハッシュの列が空になった期限切れの招待も再送信でき、新しいトークンで登録へ進める', async () => {
    const admin = await createUser('resend-expired-admin', 'admin');
    const email = inviteeEmail('resent-expired');
    const { rawToken: oldToken, invitation } = await createStoredInvitation(prisma, {
      email,
      inviterId: admin.id,
      expiresAt: new Date(Date.now() - DAY_MS),
      status: 'expired',
    });

    // 定期処理の掃除がハッシュの列を空にし、行を残す（要件37.4）
    await cleanupExpiredTokens(prisma);
    const cleaned = await prisma.invitation.findUniqueOrThrow({ where: { id: invitation.id } });
    expect(cleaned.tokenHash).toBeNull();
    expect(cleaned.status).toBe('expired');

    const response = await request(app)
      .post(`${INVITATIONS_PATH}/${invitation.id}/resend`)
      .set(...(await bearerFor(admin, 'admin')));

    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(response.body).toMatchObject({ id: invitation.id, email, status: 'pending' });
    const newToken = tokenFromInvitationUrl(response.body.invitationUrl);
    const stored = await prisma.invitation.findUniqueOrThrow({ where: { id: invitation.id } });
    expect(stored.tokenHash).toBe(sha256Hex(newToken));
    expect(stored.status).toBe('pending');
    expect(stored.expiresAt.getTime()).toBeGreaterThan(Date.now() + 6 * DAY_MS);
    expect((await verify(oldToken)).status).toBe(400);
    expect((await verify(newToken)).status).toBe(200);
    expect(await auditLogsFor('INVITATION_RESENT', invitation.id)).toHaveLength(1);
  });

  it('使用済み・取り消し済みの招待の再送信は 400、存在しない招待は 404、一般ユーザーは 403 で、行を変えず監査に残さない', async () => {
    const admin = await createUser('resend-reject-admin', 'admin');
    const regular = await createUser('resend-reject-user', 'user');
    const expiresAt = new Date(Date.now() + 7 * DAY_MS);
    const { invitation: used } = await createStoredInvitation(prisma, {
      email: inviteeEmail('resend-used'),
      inviterId: admin.id,
      expiresAt,
      status: 'used',
      usedAt: new Date(),
    });
    const { invitation: revoked } = await createStoredInvitation(prisma, {
      email: inviteeEmail('resend-revoked'),
      inviterId: admin.id,
      expiresAt,
      status: 'revoked',
    });
    const { invitation: pending } = await createStoredInvitation(prisma, {
      email: inviteeEmail('resend-forbidden'),
      inviterId: admin.id,
      expiresAt,
    });
    const adminBearer = await bearerFor(admin, 'admin');

    const usedResponse = await request(app)
      .post(`${INVITATIONS_PATH}/${used.id}/resend`)
      .set(...adminBearer);
    expect(usedResponse.status).toBe(400);
    const revokedResponse = await request(app)
      .post(`${INVITATIONS_PATH}/${revoked.id}/resend`)
      .set(...adminBearer);
    expect(revokedResponse.status).toBe(400);
    const missingResponse = await request(app)
      .post(`${INVITATIONS_PATH}/00000000-0000-4000-8000-000000000000/resend`)
      .set(...adminBearer);
    expect(missingResponse.status).toBe(404);
    const forbiddenResponse = await request(app)
      .post(`${INVITATIONS_PATH}/${pending.id}/resend`)
      .set(...(await bearerFor(regular, 'user')));
    expect(forbiddenResponse.status).toBe(403);

    for (const original of [used, revoked, pending]) {
      const stored = await prisma.invitation.findUniqueOrThrow({ where: { id: original.id } });
      expect(stored.tokenHash).toBe(original.tokenHash);
      expect(stored.expiresAt.getTime()).toBe(original.expiresAt.getTime());
      expect(await auditLogsFor('INVITATION_RESENT', original.id)).toHaveLength(0);
    }
  });

  /**
   * @requirement user-authentication/REQ-40.5
   */
  it('招待経由のアカウント作成を、作成された利用者を実行者とし対象のメールアドレスと招待者とともに監査する', async () => {
    const admin = await createUser('accept-admin', 'admin');
    const email = inviteeEmail('accepted');
    const created = await request(app)
      .post(INVITATIONS_PATH)
      .set(...(await bearerFor(admin, 'admin')))
      .send({ email });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    const rawToken = tokenFromInvitationUrl(created.body.invitationUrl);

    const registered = await request(app)
      .post('/api/v1/auth/register')
      .send({
        invitationToken: rawToken,
        password: 'StrongPass123!@#',
        displayName: `${MARK}-accepted-user`,
      });

    expect(registered.status, JSON.stringify(registered.body)).toBe(201);
    const newUserId = registered.body.user.id as string;
    const logs = await auditLogsFor('INVITATION_ACCEPTED', created.body.id);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      actorId: newUserId,
      actorEmail: email,
      targetType: 'Invitation',
      targetId: created.body.id,
    });
    expect(logs[0]!.metadata).toMatchObject({ email, userId: newUserId, inviterId: admin.id });
    expect(JSON.stringify(logs[0])).not.toContain(rawToken);
  });
});
