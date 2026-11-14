/**
 * @fileoverview SessionServiceの単体テスト
 *
 * Requirements:
 * - 8.1-8.5: セッション管理（マルチデバイス対応）
 *
 * リフレッシュトークンのハッシュ保存と、系列による失効・再利用の検知（要件33.4〜33.7）と、
 * 置き換えの直後の猶予（要件33.13）も確かめる。
 */

import { createHash } from 'crypto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  REFRESH_REUSE_GRACE_MS,
  SessionService,
  hashRefreshToken,
} from '../../../services/session.service.js';
import type { TokenService } from '../../../services/token.service.js';
import type { PrismaClient, RefreshToken } from '../../../generated/prisma/client.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-11-14T03:00:00.000Z');

// Prisma Clientのモック（$transaction は同じモックを取引のクライアントとして渡す）
const mockPrismaClient = {
  refreshToken: {
    create: vi.fn(),
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    deleteMany: vi.fn(),
    findMany: vi.fn(),
    updateMany: vi.fn(),
    count: vi.fn(),
  },
  $executeRaw: vi.fn(),
  $transaction: vi.fn(),
} as unknown as PrismaClient;

const executeRawMock = (mockPrismaClient as unknown as { $executeRaw: ReturnType<typeof vi.fn> })
  .$executeRaw;

/** 利用者単位の取引ロック（pg_advisory_xact_lock）を、その利用者で取ったこと */
function expectUserLockTaken(userId: string): void {
  expect(executeRawMock).toHaveBeenCalledTimes(1);
  const [strings, ...values] = executeRawMock.mock.calls[0]!;
  expect((strings as string[]).join('?')).toContain('pg_advisory_xact_lock');
  expect(values).toContain(userId);
}

const mockTokenService = {
  generateRefreshToken: vi.fn(),
} as unknown as TokenService;

const refreshTokenMock = mockPrismaClient.refreshToken as unknown as Record<
  'create' | 'findUnique' | 'findFirst' | 'deleteMany' | 'findMany' | 'updateMany' | 'count',
  ReturnType<typeof vi.fn>
>;

function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function storedRow(overrides: Partial<RefreshToken> = {}): RefreshToken {
  return {
    id: 'session-1',
    userId: 'user-1',
    tokenHash: sha256Hex('presented-token'),
    familyId: 'family-1',
    replacedAt: null,
    parentId: null,
    deviceInfo: 'Chrome on Windows',
    expiresAt: new Date(Date.now() + 7 * DAY_MS),
    createdAt: new Date(),
    ...overrides,
  };
}

describe('SessionService', () => {
  let sessionService: SessionService;
  let issued: number;

  beforeEach(() => {
    vi.clearAllMocks();
    issued = 0;
    (mockTokenService.generateRefreshToken as ReturnType<typeof vi.fn>).mockImplementation(
      async (userId: string, familyId: string) => `refresh-${userId}-${familyId}-${++issued}`
    );
    (mockPrismaClient.$transaction as ReturnType<typeof vi.fn>).mockImplementation(
      async (fn: (tx: PrismaClient) => Promise<unknown>) => fn(mockPrismaClient)
    );
    refreshTokenMock.create.mockResolvedValue({});
    refreshTokenMock.deleteMany.mockResolvedValue({ count: 0 });
    executeRawMock.mockResolvedValue(1);
    sessionService = new SessionService(mockPrismaClient, mockTokenService);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('hashRefreshToken()', () => {
    it('SHA-256 の 16 進を返し、原文と異なる', () => {
      expect(hashRefreshToken('raw-token')).toBe(sha256Hex('raw-token'));
      expect(hashRefreshToken('raw-token')).not.toBe('raw-token');
      expect(hashRefreshToken('raw-token')).toMatch(/^[0-9a-f]{64}$/);
    });
  });

  describe('createSession()', () => {
    it('新しい系列でトークンを発行し、原文でなくハッシュを保存する', async () => {
      const deviceInfo = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)';

      const result = await sessionService.createSession('user-123', deviceInfo);

      expect(mockTokenService.generateRefreshToken).toHaveBeenCalledWith(
        'user-123',
        result.familyId
      );
      expect(result.familyId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
      );
      const { data } = refreshTokenMock.create.mock.calls[0]![0] as {
        data: Record<string, unknown>;
      };
      expect(data).toEqual({
        userId: 'user-123',
        tokenHash: sha256Hex(result.refreshToken),
        familyId: result.familyId,
        // SessionServiceはUser-Agentをパースして"Browser on OS"形式に変換する
        deviceInfo: 'Unknown Browser on Windows',
        expiresAt: expect.any(Date),
      });
      expect(data.tokenHash).not.toBe(result.refreshToken);
      expect(Object.values(data)).not.toContain(result.refreshToken);
    });

    it('ログインのたびに別の系列を作る（デバイスごとに独立したセッション）', async () => {
      const first = await sessionService.createSession('user-1');
      const second = await sessionService.createSession('user-1');

      expect(first.familyId).not.toBe(second.familyId);
      expect(refreshTokenMock.create).toHaveBeenNthCalledWith(1, {
        data: expect.objectContaining({ deviceInfo: undefined }),
      });
    });

    it('データベースエラー時にエラーをスローする', async () => {
      refreshTokenMock.create.mockRejectedValue(new Error('Database connection lost'));

      await expect(sessionService.createSession('user-error')).rejects.toThrow(
        'Database connection lost'
      );
    });
  });

  describe('rotate()', () => {
    it('有効なトークンは置き換えの日時を記録し、同じ系列の後継を一つの取引で作る', async () => {
      refreshTokenMock.findUnique.mockResolvedValue(storedRow());
      refreshTokenMock.updateMany.mockResolvedValue({ count: 1 });

      const result = await sessionService.rotate('presented-token');

      expect(result).toEqual({
        ok: true,
        value: {
          userId: 'user-1',
          familyId: 'family-1',
          refreshToken: 'refresh-user-1-family-1-1',
        },
      });
      expect(mockPrismaClient.$transaction).toHaveBeenCalledTimes(1);
      expect(refreshTokenMock.findUnique).toHaveBeenCalledWith({
        where: { tokenHash: sha256Hex('presented-token') },
      });
      // 置き換えの記録は、まだ置き換えられていない行に限る（同時の提示の一方だけが通る）
      expect(refreshTokenMock.updateMany).toHaveBeenCalledWith({
        where: { id: 'session-1', replacedAt: null },
        data: { replacedAt: expect.any(Date) },
      });
      expect(refreshTokenMock.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-1',
          tokenHash: sha256Hex('refresh-user-1-family-1-1'),
          familyId: 'family-1',
          parentId: 'session-1',
          deviceInfo: 'Chrome on Windows',
          expiresAt: expect.any(Date),
        },
      });
      expect(refreshTokenMock.deleteMany).not.toHaveBeenCalled();
      // 利用者単位の取引ロックを、行を変える前に取り、その後に行を読み直す
      expectUserLockTaken('user-1');
      expect(executeRawMock.mock.invocationCallOrder[0]!).toBeLessThan(
        refreshTokenMock.updateMany.mock.invocationCallOrder[0]!
      );
      expect(refreshTokenMock.findUnique).toHaveBeenCalledTimes(2);
      expect(refreshTokenMock.findUnique.mock.invocationCallOrder[1]!).toBeGreaterThan(
        executeRawMock.mock.invocationCallOrder[0]!
      );
    });

    it('ロックを待つ間に行が消されていたら NOT_FOUND で、後継を作らない', async () => {
      refreshTokenMock.findUnique.mockResolvedValueOnce(storedRow()).mockResolvedValueOnce(null);

      await expect(sessionService.rotate('presented-token')).resolves.toEqual({
        ok: false,
        error: { type: 'NOT_FOUND' },
      });
      expectUserLockTaken('user-1');
      expect(refreshTokenMock.updateMany).not.toHaveBeenCalled();
      expect(refreshTokenMock.create).not.toHaveBeenCalled();
    });

    it('保存の無いトークンは NOT_FOUND', async () => {
      refreshTokenMock.findUnique.mockResolvedValue(null);

      await expect(sessionService.rotate('unknown')).resolves.toEqual({
        ok: false,
        error: { type: 'NOT_FOUND' },
      });
      expect(refreshTokenMock.create).not.toHaveBeenCalled();
    });

    it('有効期限の切れたトークンは EXPIRED で、後継を作らない', async () => {
      refreshTokenMock.findUnique.mockResolvedValue(
        storedRow({ expiresAt: new Date(Date.now() - 1000) })
      );

      await expect(sessionService.rotate('presented-token')).resolves.toEqual({
        ok: false,
        error: { type: 'EXPIRED' },
      });
      expect(refreshTokenMock.updateMany).not.toHaveBeenCalled();
      expect(refreshTokenMock.create).not.toHaveBeenCalled();
    });

    /**
     * @requirement user-authentication/REQ-33.6: 猶予を過ぎた置き換え済みのトークンの再提示は系列の全行を消す
     */
    it('置き換えから 10 秒を過ぎたトークンの再提示は系列の全行を消して REUSE_DETECTED', async () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(NOW);
      refreshTokenMock.findUnique.mockResolvedValue(
        storedRow({ replacedAt: new Date(NOW.getTime() - REFRESH_REUSE_GRACE_MS - 1) })
      );
      refreshTokenMock.deleteMany.mockResolvedValue({ count: 3 });

      const result = await sessionService.rotate('presented-token');

      expect(result).toEqual({
        ok: false,
        error: { type: 'REUSE_DETECTED', userId: 'user-1', familyId: 'family-1' },
      });
      expect(refreshTokenMock.deleteMany).toHaveBeenCalledWith({
        where: { familyId: 'family-1' },
      });
      expect(refreshTokenMock.updateMany).not.toHaveBeenCalled();
      expect(refreshTokenMock.create).not.toHaveBeenCalled();
      expect(mockTokenService.generateRefreshToken).not.toHaveBeenCalled();
    });

    describe('置き換えの直後の猶予（要件33.13）', () => {
      /** 置き換え済みの行と、その後継の一覧・後継の後継の数を返すように整える */
      function arrangeReplaced(ageMs: number, successorIds: string[], usedCount: number): void {
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(NOW);
        refreshTokenMock.findUnique.mockResolvedValue(
          storedRow({ replacedAt: new Date(NOW.getTime() - ageMs) })
        );
        refreshTokenMock.findMany.mockResolvedValue(successorIds.map((id) => ({ id })));
        refreshTokenMock.count.mockResolvedValue(usedCount);
        refreshTokenMock.updateMany.mockResolvedValue({ count: successorIds.length });
      }

      /**
       * @requirement user-authentication/REQ-33.13: 置き換えから10秒以内で後継が未使用の再提示は、系列を失効させずに新しい後継を発行し、未使用の後継を置き換え済みにする
       */
      it('10 秒以内で後継が未使用なら、系列を消さずに届かなかった後継を置き換え済みにし、新しい後継を返す', async () => {
        arrangeReplaced(1000, ['session-2'], 0);

        const result = await sessionService.rotate('presented-token');

        expect(result).toEqual({
          ok: true,
          value: {
            userId: 'user-1',
            familyId: 'family-1',
            refreshToken: 'refresh-user-1-family-1-1',
          },
        });
        expect(refreshTokenMock.deleteMany).not.toHaveBeenCalled();
        // 後継は、提示された行を親に持つ行で引き、その後継の後継の有無で使われたかを見る
        expect(refreshTokenMock.findMany).toHaveBeenCalledWith({
          where: { familyId: 'family-1', parentId: 'session-1' },
          select: { id: true },
        });
        expect(refreshTokenMock.count).toHaveBeenCalledWith({
          where: { familyId: 'family-1', parentId: { in: ['session-2'] } },
        });
        // 系列の未置き換えの行（届かなかった後継）を置き換え済みにしてから、新しい後継を作る
        expect(refreshTokenMock.updateMany).toHaveBeenCalledTimes(1);
        expect(refreshTokenMock.updateMany).toHaveBeenCalledWith({
          where: { familyId: 'family-1', replacedAt: null },
          data: { replacedAt: NOW },
        });
        expect(refreshTokenMock.create).toHaveBeenCalledWith({
          data: {
            userId: 'user-1',
            tokenHash: sha256Hex('refresh-user-1-family-1-1'),
            familyId: 'family-1',
            parentId: 'session-1',
            deviceInfo: 'Chrome on Windows',
            expiresAt: new Date(NOW.getTime() + 7 * DAY_MS),
          },
        });
        expect(refreshTokenMock.updateMany.mock.invocationCallOrder[0]!).toBeLessThan(
          refreshTokenMock.create.mock.invocationCallOrder[0]!
        );
        expectUserLockTaken('user-1');
      });

      it('置き換えからちょうど 10 秒の再提示は猶予に含める', async () => {
        arrangeReplaced(REFRESH_REUSE_GRACE_MS, ['session-2'], 0);

        const result = await sessionService.rotate('presented-token');

        expect(result.ok).toBe(true);
        expect(refreshTokenMock.deleteMany).not.toHaveBeenCalled();
        expect(refreshTokenMock.create).toHaveBeenCalledTimes(1);
      });

      /**
       * @requirement user-authentication/REQ-33.6: 後継が既にローテーションに使われていれば、10秒以内でも系列の全行を消す
       */
      it('10 秒以内でも、後継が既にローテーションに使われていれば系列の全行を消して REUSE_DETECTED', async () => {
        arrangeReplaced(1000, ['session-2'], 1);

        const result = await sessionService.rotate('presented-token');

        expect(result).toEqual({
          ok: false,
          error: { type: 'REUSE_DETECTED', userId: 'user-1', familyId: 'family-1' },
        });
        expect(refreshTokenMock.deleteMany).toHaveBeenCalledWith({
          where: { familyId: 'family-1' },
        });
        expect(refreshTokenMock.updateMany).not.toHaveBeenCalled();
        expect(refreshTokenMock.create).not.toHaveBeenCalled();
      });

      it('10 秒以内で後継の行が無ければ（後継の後継を数えずに）猶予に当たる', async () => {
        arrangeReplaced(1000, [], 0);

        const result = await sessionService.rotate('presented-token');

        expect(result.ok).toBe(true);
        expect(refreshTokenMock.count).not.toHaveBeenCalled();
        expect(refreshTokenMock.deleteMany).not.toHaveBeenCalled();
        expect(refreshTokenMock.create).toHaveBeenCalledTimes(1);
      });

      it('猶予に当たっても有効期限の切れたトークンは EXPIRED で、系列を消さず後継も作らない', async () => {
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(NOW);
        refreshTokenMock.findUnique.mockResolvedValue(
          storedRow({
            replacedAt: new Date(NOW.getTime() - 1000),
            expiresAt: new Date(NOW.getTime() - 1),
          })
        );
        refreshTokenMock.findMany.mockResolvedValue([]);

        await expect(sessionService.rotate('presented-token')).resolves.toEqual({
          ok: false,
          error: { type: 'EXPIRED' },
        });
        expect(refreshTokenMock.deleteMany).not.toHaveBeenCalled();
        expect(refreshTokenMock.updateMany).not.toHaveBeenCalled();
        expect(refreshTokenMock.create).not.toHaveBeenCalled();
      });
    });

    it('同時の提示で先に置き換えられていたとき（条件付きの更新が 0 件）は再利用として系列を消す', async () => {
      refreshTokenMock.findUnique.mockResolvedValue(storedRow());
      refreshTokenMock.updateMany.mockResolvedValue({ count: 0 });

      const result = await sessionService.rotate('presented-token');

      expect(result).toEqual({
        ok: false,
        error: { type: 'REUSE_DETECTED', userId: 'user-1', familyId: 'family-1' },
      });
      expect(refreshTokenMock.deleteMany).toHaveBeenCalledWith({
        where: { familyId: 'family-1' },
      });
      expect(refreshTokenMock.create).not.toHaveBeenCalled();
    });

    it('後継の作成の失敗は取引ごと失敗させる（例外を投げる）', async () => {
      refreshTokenMock.findUnique.mockResolvedValue(storedRow());
      refreshTokenMock.updateMany.mockResolvedValue({ count: 1 });
      refreshTokenMock.create.mockRejectedValue(new Error('insert failed'));

      await expect(sessionService.rotate('presented-token')).rejects.toThrow('insert failed');
    });
  });

  describe('revokeByToken()', () => {
    it('提示したトークンの系列の全行を消す（ログアウトはそのセッションの系列だけ）', async () => {
      refreshTokenMock.findUnique.mockResolvedValue(storedRow());
      refreshTokenMock.deleteMany.mockResolvedValue({ count: 2 });

      await expect(sessionService.revokeByToken('presented-token', 'user-1')).resolves.toBe(2);

      expect(refreshTokenMock.findUnique).toHaveBeenCalledWith({
        where: { tokenHash: sha256Hex('presented-token') },
      });
      expect(refreshTokenMock.deleteMany).toHaveBeenCalledWith({
        where: { familyId: 'family-1', userId: 'user-1' },
      });
      // ローテーションと直列化してから、一つの取引で系列を消す
      expect(mockPrismaClient.$transaction).toHaveBeenCalledTimes(1);
      expectUserLockTaken('user-1');
      expect(executeRawMock.mock.invocationCallOrder[0]!).toBeLessThan(
        refreshTokenMock.deleteMany.mock.invocationCallOrder[0]!
      );
    });

    it('他の利用者のトークンは消さない', async () => {
      refreshTokenMock.findUnique.mockResolvedValue(storedRow({ userId: 'someone-else' }));

      await expect(sessionService.revokeByToken('presented-token', 'user-1')).resolves.toBe(0);
      expect(refreshTokenMock.deleteMany).not.toHaveBeenCalled();
    });

    it('保存の無いトークンは何も消さない', async () => {
      refreshTokenMock.findUnique.mockResolvedValue(null);

      await expect(sessionService.revokeByToken('unknown')).resolves.toBe(0);
      expect(refreshTokenMock.deleteMany).not.toHaveBeenCalled();
    });
  });

  describe('revokeAllForUser()', () => {
    it('利用者の全てのリフレッシュトークンを消し、消した数を返す', async () => {
      refreshTokenMock.deleteMany.mockResolvedValue({ count: 5 });

      await expect(sessionService.revokeAllForUser('user-1')).resolves.toBe(5);
      expect(refreshTokenMock.deleteMany).toHaveBeenCalledWith({ where: { userId: 'user-1' } });
      expect(mockPrismaClient.$transaction).toHaveBeenCalledTimes(1);
      expectUserLockTaken('user-1');
      expect(executeRawMock.mock.invocationCallOrder[0]!).toBeLessThan(
        refreshTokenMock.deleteMany.mock.invocationCallOrder[0]!
      );
    });

    it('取引を渡すと取引のクライアントでロックを取ってから消す', async () => {
      const tx = {
        refreshToken: { deleteMany: vi.fn().mockResolvedValue({ count: 1 }) },
        $executeRaw: vi.fn().mockResolvedValue(1),
      };

      await expect(
        sessionService.revokeAllForUser(
          'user-1',
          tx as unknown as Parameters<SessionService['revokeAllForUser']>[1]
        )
      ).resolves.toBe(1);
      expect(tx.refreshToken.deleteMany).toHaveBeenCalledWith({ where: { userId: 'user-1' } });
      expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
      expect(refreshTokenMock.deleteMany).not.toHaveBeenCalled();
      expect(mockPrismaClient.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('revokeSessionById()', () => {
    it('自分のセッションの系列を消す', async () => {
      refreshTokenMock.findFirst.mockResolvedValue(storedRow());
      refreshTokenMock.deleteMany.mockResolvedValue({ count: 1 });

      await expect(sessionService.revokeSessionById('user-1', 'session-1')).resolves.toEqual({
        ok: true,
        value: undefined,
      });
      expect(refreshTokenMock.findFirst).toHaveBeenCalledWith({
        where: { id: 'session-1', userId: 'user-1' },
      });
      expect(refreshTokenMock.deleteMany).toHaveBeenCalledWith({
        where: { familyId: 'family-1', userId: 'user-1' },
      });
      expectUserLockTaken('user-1');
      expect(executeRawMock.mock.invocationCallOrder[0]!).toBeLessThan(
        refreshTokenMock.deleteMany.mock.invocationCallOrder[0]!
      );
    });

    it('自分のものでない・存在しないセッションは SESSION_NOT_FOUND', async () => {
      refreshTokenMock.findFirst.mockResolvedValue(null);

      await expect(sessionService.revokeSessionById('user-1', 'other')).resolves.toEqual({
        ok: false,
        error: { type: 'SESSION_NOT_FOUND' },
      });
      expect(refreshTokenMock.deleteMany).not.toHaveBeenCalled();
    });

    it('データベースエラーで DATABASE_ERROR を返す（Error でない値は文字列にする）', async () => {
      refreshTokenMock.findFirst.mockRejectedValue('String error');

      await expect(sessionService.revokeSessionById('user-1', 'session-1')).resolves.toEqual({
        ok: false,
        error: { type: 'DATABASE_ERROR', message: 'String error' },
      });
    });
  });

  describe('listSessions()', () => {
    it('系列ごとの現行の行（置き換えられていない行）だけを一覧にする', async () => {
      const userId = 'user-multi-device';
      refreshTokenMock.findMany.mockResolvedValue([
        storedRow({ id: 'session-device-1', userId, deviceInfo: 'Chrome on Windows' }),
        storedRow({
          id: 'session-device-2',
          userId,
          familyId: 'family-2',
          deviceInfo: null,
        }),
      ]);

      const sessions = await sessionService.listSessions(userId);

      expect(sessions).toHaveLength(2);
      expect(sessions[0]!.deviceInfo).toBe('Chrome on Windows');
      expect(sessions[1]!.deviceInfo).toBeUndefined();
      expect(sessions[0]).not.toHaveProperty('tokenHash');
      expect(refreshTokenMock.findMany).toHaveBeenCalledWith({
        where: { userId, replacedAt: null },
        orderBy: { createdAt: 'desc' },
      });
    });

    it('データベースエラー時にエラーをスローする', async () => {
      refreshTokenMock.findMany.mockRejectedValue(new Error('Database query failed'));

      await expect(sessionService.listSessions('user-list-error')).rejects.toThrow(
        'Database query failed'
      );
    });
  });
});
