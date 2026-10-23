/**
 * 使用済み・期限切れのトークンの消去の単体検証（user-authentication タスク44.9）
 *
 * データベースへの条件（招待はトークンだけを消して行を残す、リセットとリフレッシュトークンは
 * 行を消す）を確かめる。実データベースでの結果は統合検証
 * （integration/expired-token-cleanup.integration.test.ts）で確かめる。
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import type { PrismaClient } from '../../../generated/prisma/client.js';
import {
  cleanupExpiredTokens,
  EXPIRED_TOKEN_CLEANUP_CRON,
  EXPIRED_TOKEN_CLEANUP_JOB_NAME,
} from '../../../jobs/expired-token-cleanup.job.js';

function prismaMock() {
  const invitationUpdateMany = vi.fn().mockResolvedValue({ count: 3 });
  const passwordResetDeleteMany = vi.fn().mockResolvedValue({ count: 2 });
  const refreshTokenDeleteMany = vi.fn().mockResolvedValue({ count: 1 });
  const prisma = {
    invitation: { updateMany: invitationUpdateMany },
    passwordResetToken: { deleteMany: passwordResetDeleteMany },
    refreshToken: { deleteMany: refreshTokenDeleteMany },
  } as unknown as PrismaClient;
  return { prisma, invitationUpdateMany, passwordResetDeleteMany, refreshTokenDeleteMany };
}

describe('cleanupExpiredTokens', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('ジョブ名と周期（毎時 15 分）を持つ', () => {
    expect(EXPIRED_TOKEN_CLEANUP_JOB_NAME).toBe('expired-token-cleanup');
    expect(EXPIRED_TOKEN_CLEANUP_CRON).toBe('15 * * * *');
  });

  it('使用済み・取り消し・期限切れの招待のトークンだけを NULL にし、リセットとリフレッシュトークンの行を消す', async () => {
    const mock = prismaMock();
    const now = new Date('2026-10-18T03:15:00.000Z');

    const result = await cleanupExpiredTokens(mock.prisma, now);

    expect(mock.invitationUpdateMany).toHaveBeenCalledWith({
      where: {
        tokenHash: { not: null },
        OR: [{ status: { in: ['used', 'revoked'] } }, { expiresAt: { lt: now } }],
      },
      data: { tokenHash: null },
    });
    expect(mock.passwordResetDeleteMany).toHaveBeenCalledWith({
      where: { OR: [{ usedAt: { not: null } }, { expiresAt: { lt: now } }] },
    });
    expect(mock.refreshTokenDeleteMany).toHaveBeenCalledWith({
      where: { expiresAt: { lt: now } },
    });
    expect(result).toEqual({
      invitationTokensCleared: 3,
      passwordResetTokensDeleted: 2,
      refreshTokensDeleted: 1,
    });
  });

  it('基準の時刻を省くと現在の時刻で判定する', async () => {
    vi.useFakeTimers();
    const now = new Date('2026-10-18T04:15:00.000Z');
    vi.setSystemTime(now);
    const mock = prismaMock();

    await cleanupExpiredTokens(mock.prisma);

    expect(mock.refreshTokenDeleteMany).toHaveBeenCalledWith({
      where: { expiresAt: { lt: now } },
    });
  });
});
