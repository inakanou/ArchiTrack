/**
 * @fileoverview EstimateEditSessionService ユニットテスト
 *
 * 見積書の編集セッション（在席情報）の記録と、編集中の他の利用者の取得を検証する。
 *
 * Requirements (estimate-creation):
 * - REQ-11.7: 見積書が他のユーザーによって編集中の場合、編集中であることを警告表示する
 *   （本ファイルは警告の材料となる「編集中の他の利用者」の判定を検める）
 *
 * Task 61.1: REQ-11.7 の実装
 *
 * @module tests/unit/services/estimate-edit-session.service
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  EstimateEditSessionService,
  ESTIMATE_EDIT_SESSION_TTL_SECONDS,
  ESTIMATE_EDIT_SESSION_HEARTBEAT_INTERVAL_SECONDS,
} from '../../../services/estimate-edit-session.service.js';
import { EstimateNotFoundError } from '../../../errors/estimateError.js';
import type { PrismaClient } from '../../../generated/prisma/client.js';

const NOW = new Date('2026-10-10T03:00:00.000Z');

const createMockPrisma = () => ({
  estimate: {
    findFirst: vi.fn(),
  },
  estimateEditSession: {
    upsert: vi.fn(),
    deleteMany: vi.fn(),
    findMany: vi.fn(),
  },
});

describe('EstimateEditSessionService', () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let service: EstimateEditSessionService;

  beforeEach(() => {
    prisma = createMockPrisma();
    prisma.estimate.findFirst.mockResolvedValue({ id: 'est-1' });
    prisma.estimateEditSession.upsert.mockResolvedValue({});
    prisma.estimateEditSession.deleteMany.mockResolvedValue({ count: 0 });
    prisma.estimateEditSession.findMany.mockResolvedValue([]);
    service = new EstimateEditSessionService({
      prisma: prisma as unknown as PrismaClient,
      now: () => NOW,
    });
  });

  it('TTL は通知間隔の 3 倍以上である（間引かれたタイマーでも在席が途切れない）', () => {
    expect(ESTIMATE_EDIT_SESSION_TTL_SECONDS).toBeGreaterThanOrEqual(
      ESTIMATE_EDIT_SESSION_HEARTBEAT_INTERVAL_SECONDS * 3
    );
  });

  describe('heartbeat', () => {
    it('自分の在席を現在時刻で記録する (REQ-11.7)', async () => {
      await service.heartbeat('est-1', 'user-a');

      expect(prisma.estimateEditSession.upsert).toHaveBeenCalledWith({
        where: { estimateId_userId: { estimateId: 'est-1', userId: 'user-a' } },
        create: { estimateId: 'est-1', userId: 'user-a', lastSeenAt: NOW },
        update: { lastSeenAt: NOW },
      });
    });

    it('自分以外で TTL 以内に通知のあった利用者だけを問い合わせる (REQ-11.7)', async () => {
      await service.heartbeat('est-1', 'user-a');

      const threshold = new Date(NOW.getTime() - ESTIMATE_EDIT_SESSION_TTL_SECONDS * 1000);
      expect(prisma.estimateEditSession.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            estimateId: 'est-1',
            userId: { not: 'user-a' },
            lastSeenAt: { gte: threshold },
          },
        })
      );
    });

    it('編集中の他の利用者を表示名つきで返す (REQ-11.7)', async () => {
      const seen = new Date(NOW.getTime() - 5000);
      prisma.estimateEditSession.findMany.mockResolvedValue([
        { userId: 'user-b', lastSeenAt: seen, user: { displayName: '山田 太郎' } },
      ]);

      const result = await service.heartbeat('est-1', 'user-a');

      expect(result).toEqual([{ userId: 'user-b', displayName: '山田 太郎', lastSeenAt: seen }]);
    });

    it('期限切れの行を掃除する', async () => {
      await service.heartbeat('est-1', 'user-a');

      const threshold = new Date(NOW.getTime() - ESTIMATE_EDIT_SESSION_TTL_SECONDS * 1000);
      expect(prisma.estimateEditSession.deleteMany).toHaveBeenCalledWith({
        where: { estimateId: 'est-1', lastSeenAt: { lt: threshold } },
      });
    });

    it('見積書が無い（論理削除を含む）場合は EstimateNotFoundError を投げ、在席を記録しない', async () => {
      prisma.estimate.findFirst.mockResolvedValue(null);

      await expect(service.heartbeat('est-x', 'user-a')).rejects.toBeInstanceOf(
        EstimateNotFoundError
      );
      expect(prisma.estimate.findFirst).toHaveBeenCalledWith({
        where: { id: 'est-x', deletedAt: null },
        select: { id: true },
      });
      expect(prisma.estimateEditSession.upsert).not.toHaveBeenCalled();
    });

    it('現在時刻を差し替えないときは、呼び出しの時点のシステム時刻で在席を記録する', async () => {
      vi.useFakeTimers();
      try {
        vi.setSystemTime(NOW);
        const defaultClockService = new EstimateEditSessionService({
          prisma: prisma as unknown as PrismaClient,
        });

        await defaultClockService.heartbeat('est-1', 'user-a');

        expect(prisma.estimateEditSession.upsert).toHaveBeenCalledWith({
          where: { estimateId_userId: { estimateId: 'est-1', userId: 'user-a' } },
          create: { estimateId: 'est-1', userId: 'user-a', lastSeenAt: NOW },
          update: { lastSeenAt: NOW },
        });
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('leave', () => {
    it('自分の在席だけを消す', async () => {
      await service.leave('est-1', 'user-a');

      expect(prisma.estimateEditSession.deleteMany).toHaveBeenCalledWith({
        where: { estimateId: 'est-1', userId: 'user-a' },
      });
    });
  });
});
