/**
 * @fileoverview 使用済み・期限切れのトークンの消去の統合検証（タスク44.9）
 *
 * 実データベースに対して、定期処理 `expired-token-cleanup` の処理の関数（cleanupExpiredTokens）を
 * 直接呼び、使用済み・取り消し・期限切れの招待のトークンだけが消えて行が状態とともに残ること、
 * 使用済み・期限切れのリセットのトークンと期限切れのリフレッシュトークンの行が消えること、
 * 未使用で期限内のものが残ることを確かめる。
 *
 * あわせて実 Redis に対して、定期処理の実行基盤が起動のたびに同じ識別子で登録し直し、
 * 繰り返しの定義を重複させないことを確かめる。
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import crypto from 'crypto';
import Redis from 'ioredis';
import type { PrismaClient } from '../../generated/prisma/client.js';
import getPrismaClient from '../../db.js';
import { cleanupExpiredTokens } from '../../jobs/expired-token-cleanup.job.js';
import {
  ScheduledJobRunner,
  createScheduledJobDefinitions,
  createScheduledJobsQueue,
} from '../../jobs/scheduled-job-runner.js';
import { createRuntimeMode } from '../../config/runtime-mode.js';
import { InvitationService } from '../../services/invitation.service.js';
import { InvitationStatus } from '../../types/invitation.types.js';
import { createStoredRefreshToken } from './refresh-token-fixture.js';
import { createTestUser } from './test-user-factory.js';

const EMAIL_MARK = 'test-expired-token-cleanup';
const HOUR_MS = 60 * 60 * 1000;

function newToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

describe('使用済み・期限切れのトークンの消去（統合・実 DB）', () => {
  let prisma: PrismaClient;
  let inviterId: string;
  let userId: string;

  async function cleanup(): Promise<void> {
    const users = await prisma.user.findMany({
      where: { email: { contains: EMAIL_MARK } },
      select: { id: true },
    });
    const userIds = users.map((u) => u.id);
    await prisma.refreshToken.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.passwordResetToken.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.invitation.deleteMany({ where: { email: { contains: EMAIL_MARK } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  }

  beforeAll(() => {
    prisma = getPrismaClient();
  });

  beforeEach(async () => {
    await cleanup();
    const inviter = await createTestUser(prisma, {
      email: `${EMAIL_MARK}-inviter@example.com`,
      displayName: 'Token Cleanup Inviter',
      passwordHash: 'not-used-in-this-test',
    });
    inviterId = inviter.id;
    const user = await createTestUser(prisma, {
      email: `${EMAIL_MARK}-user@example.com`,
      displayName: 'Token Cleanup User',
      passwordHash: 'not-used-in-this-test',
    });
    userId = user.id;
  });

  afterAll(async () => {
    await cleanup();
  });

  /**
   * 招待を作る（トークンは原文を返す）
   */
  async function createInvitation(
    label: string,
    status: InvitationStatus,
    expiresAt: Date
  ): Promise<{ id: string; token: string; expiresAt: Date }> {
    const token = newToken();
    const invitation = await prisma.invitation.create({
      data: {
        email: `${EMAIL_MARK}-${label}@example.com`,
        token,
        inviterId,
        status,
        expiresAt,
        ...(status === InvitationStatus.USED && { usedAt: new Date(Date.now() - HOUR_MS) }),
      },
    });
    return { id: invitation.id, token, expiresAt: invitation.expiresAt };
  }

  /**
   * @requirement user-authentication/REQ-37.4: 使用済み・取り消し・期限切れになった招待のトークンを定期処理（毎時）で削除し、招待の行は状態・期限・作成者とともに残して一覧に出す
   */
  it('使用済み・取り消し・期限切れの招待はトークンだけが消え、行は状態とともに残り一覧に出る。未使用で期限内の招待のトークンは残る', async () => {
    const now = new Date();
    const inSevenDays = new Date(now.getTime() + 7 * 24 * HOUR_MS);
    const pending = await createInvitation('pending', InvitationStatus.PENDING, inSevenDays);
    const expired = await createInvitation(
      'expired',
      InvitationStatus.PENDING,
      new Date(now.getTime() - HOUR_MS)
    );
    const used = await createInvitation('used', InvitationStatus.USED, inSevenDays);
    const revoked = await createInvitation('revoked', InvitationStatus.REVOKED, inSevenDays);

    const result = await cleanupExpiredTokens(prisma, now);

    expect(result.invitationTokensCleared).toBeGreaterThanOrEqual(3);
    const rows = await prisma.invitation.findMany({
      where: { email: { contains: EMAIL_MARK } },
    });
    const byId = new Map(rows.map((row) => [row.id, row]));
    expect(byId.get(pending.id)).toMatchObject({ token: pending.token, status: 'pending' });
    expect(byId.get(expired.id)).toMatchObject({
      token: null,
      status: 'pending',
      expiresAt: expired.expiresAt,
      inviterId,
    });
    expect(byId.get(used.id)).toMatchObject({ token: null, status: 'used', inviterId });
    expect(byId.get(revoked.id)).toMatchObject({ token: null, status: 'revoked', inviterId });

    // 招待一覧（GET /api/v1/invitations の処理）に、対象の招待が状態とともに出る（要件1.7・13.2）
    const invitationService = new InvitationService(prisma);
    const listed = (await invitationService.listInvitations()).filter((invitation) =>
      invitation.email.includes(EMAIL_MARK)
    );
    expect(
      listed.map(({ id, status }) => ({ id, status })).sort((a, b) => a.id.localeCompare(b.id))
    ).toEqual(
      [
        { id: pending.id, status: 'pending' },
        { id: expired.id, status: 'pending' },
        { id: used.id, status: 'used' },
        { id: revoked.id, status: 'revoked' },
      ].sort((a, b) => a.id.localeCompare(b.id))
    );

    // トークンの空の招待は、消す前のトークンとも一致しない（無効なトークンとして扱う）
    await expect(invitationService.validateInvitation(expired.token)).resolves.toEqual({
      ok: false,
      error: { type: 'INVALID_TOKEN' },
    });
    await expect(invitationService.validateInvitation(used.token)).resolves.toEqual({
      ok: false,
      error: { type: 'INVALID_TOKEN' },
    });
    await expect(invitationService.validateInvitation(pending.token)).resolves.toMatchObject({
      ok: true,
      value: { id: pending.id },
    });
  });

  /**
   * @requirement user-authentication/REQ-37.4: 使用済み・期限切れになったパスワードリセットのトークンを定期処理（毎時）で削除する
   */
  it('使用済み・期限切れのパスワードリセットのトークンは行が消え、未使用で期限内のものは残る', async () => {
    const now = new Date();
    const valid = await prisma.passwordResetToken.create({
      data: { userId, token: newToken(), expiresAt: new Date(now.getTime() + HOUR_MS) },
    });
    const used = await prisma.passwordResetToken.create({
      data: {
        userId,
        token: newToken(),
        expiresAt: new Date(now.getTime() + HOUR_MS),
        usedAt: new Date(now.getTime() - 60 * 1000),
      },
    });
    const expired = await prisma.passwordResetToken.create({
      data: { userId, token: newToken(), expiresAt: new Date(now.getTime() - 60 * 1000) },
    });

    const result = await cleanupExpiredTokens(prisma, now);

    expect(result.passwordResetTokensDeleted).toBeGreaterThanOrEqual(2);
    const remaining = await prisma.passwordResetToken.findMany({ where: { userId } });
    expect(remaining.map((row) => row.id)).toEqual([valid.id]);
    expect(remaining.map((row) => row.id)).not.toContain(used.id);
    expect(remaining.map((row) => row.id)).not.toContain(expired.id);
  });

  /**
   * @requirement user-authentication/REQ-37.8: 有効期限の切れたリフレッシュトークンを定期処理（毎時）で削除する
   */
  it('期限切れのリフレッシュトークンは行が消え、期限内のものは残る', async () => {
    const now = new Date();
    const { row: valid } = await createStoredRefreshToken(prisma, {
      userId,
      expiresAt: new Date(now.getTime() + 7 * 24 * HOUR_MS),
    });
    await createStoredRefreshToken(prisma, {
      userId,
      expiresAt: new Date(now.getTime() - 60 * 1000),
    });
    // 同じ系列の置き換え済みで期限切れの行も消え、系列の現行の行は残る
    await createStoredRefreshToken(prisma, {
      userId,
      familyId: valid.familyId,
      replacedAt: new Date(now.getTime() - 2 * HOUR_MS),
      expiresAt: new Date(now.getTime() - HOUR_MS),
    });

    const result = await cleanupExpiredTokens(prisma, now);

    expect(result.refreshTokensDeleted).toBeGreaterThanOrEqual(2);
    const remaining = await prisma.refreshToken.findMany({ where: { userId } });
    expect(remaining.map((row) => row.id)).toEqual([valid.id]);
  });

  it('二度目の実行は、残った行を変えない（冪等）', async () => {
    const now = new Date();
    const expired = await createInvitation(
      'idempotent',
      InvitationStatus.PENDING,
      new Date(now.getTime() - HOUR_MS)
    );
    await createStoredRefreshToken(prisma, {
      userId,
      expiresAt: new Date(now.getTime() + HOUR_MS),
    });

    await cleanupExpiredTokens(prisma, now);
    const afterFirst = await prisma.invitation.findUnique({ where: { id: expired.id } });
    await cleanupExpiredTokens(prisma, now);

    await expect(prisma.invitation.findUnique({ where: { id: expired.id } })).resolves.toEqual(
      afterFirst
    );
    await expect(prisma.refreshToken.count({ where: { userId } })).resolves.toBe(1);
  });
});

/** 稼働中の試験の backend と混ざらない、この検証の専用の論理 DB */
const ISOLATED_REDIS_DB = 13;

function isolatedRedisUrl(): string {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    throw new Error('REDIS_URL is required for the scheduled jobs integration test');
  }
  const url = new URL(redisUrl);
  url.pathname = `/${ISOLATED_REDIS_DB}`;
  return url.toString();
}

describe('定期処理の実行基盤の登録（統合・実 Redis）', () => {
  const redisUrl = isolatedRedisUrl();
  let redis: Redis;

  async function deleteQueueKeys(): Promise<void> {
    const keys = await redis.keys('bull:scheduled-jobs:*');
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  }

  beforeAll(async () => {
    redis = new Redis(redisUrl);
    await deleteQueueKeys();
  });

  afterAll(async () => {
    await deleteQueueKeys();
    await redis.quit();
  });

  it('起動のたびに同じ識別子で登録し直し、繰り返しの定義を重複させない', async () => {
    const definitions = createScheduledJobDefinitions(getPrismaClient());
    const development = createRuntimeMode({ NODE_ENV: 'development' } as NodeJS.ProcessEnv);

    for (let boot = 0; boot < 3; boot++) {
      const runner = new ScheduledJobRunner(
        () => createScheduledJobsQueue(redisUrl),
        definitions,
        development
      );
      await expect(runner.start()).resolves.toBe(true);
      await runner.stop();
    }

    const inspector = createScheduledJobsQueue(redisUrl);
    try {
      const repeatables = await inspector.getRepeatableJobs();
      expect(repeatables).toHaveLength(3);
      expect(repeatables).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: 'expired-token-cleanup',
            id: 'expired-token-cleanup',
            cron: '15 * * * *',
            tz: 'Asia/Tokyo',
          }),
          expect.objectContaining({
            name: 'failed-email-job-cleanup',
            id: 'failed-email-job-cleanup',
            cron: '45 * * * *',
            tz: 'Asia/Tokyo',
          }),
          expect.objectContaining({
            name: 'inactive-user-deactivation',
            id: 'inactive-user-deactivation',
            cron: '0 3 * * *',
            tz: 'Asia/Tokyo',
          }),
        ])
      );
      // 次の実行は毎時 15 分・45 分（Asia/Tokyo は分の境界が UTC と同じ）
      for (const [name, minute] of [
        ['expired-token-cleanup', 15],
        ['failed-email-job-cleanup', 45],
      ] as const) {
        const next = new Date(repeatables.find((job) => job.name === name)?.next ?? 0);
        expect(next.getUTCMinutes()).toBe(minute);
        expect(next.getTime() - Date.now()).toBeLessThanOrEqual(HOUR_MS);
      }
      // 90 日の自動無効化（タスク49.4）の次の実行は毎日 03:00 Asia/Tokyo（UTC の 18:00）
      const nextDeactivation = new Date(
        repeatables.find((job) => job.name === 'inactive-user-deactivation')?.next ?? 0
      );
      expect(nextDeactivation.getUTCHours()).toBe(18);
      expect(nextDeactivation.getUTCMinutes()).toBe(0);
      expect(nextDeactivation.getTime() - Date.now()).toBeLessThanOrEqual(24 * HOUR_MS);
      expect(await inspector.getDelayedCount()).toBe(3);
    } finally {
      await inspector.close();
    }
  });

  it('試験の実行環境では Redis に繰り返しの定義を登録しない', async () => {
    await deleteQueueKeys();
    const runner = new ScheduledJobRunner(
      () => createScheduledJobsQueue(redisUrl),
      createScheduledJobDefinitions(getPrismaClient()),
      createRuntimeMode({ NODE_ENV: 'test' } as NodeJS.ProcessEnv)
    );

    await expect(runner.start()).resolves.toBe(false);
    await runner.stop();

    expect(await redis.keys('bull:scheduled-jobs:*')).toEqual([]);
  });
});
