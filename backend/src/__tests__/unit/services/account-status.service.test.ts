/**
 * @fileoverview AccountStatusService の無効化・再有効化・90 日の自動無効化の単体テスト（タスク49.2、49.4）
 *
 * Requirements (user-authentication):
 * - REQ-36.1: 無効化で全リフレッシュトークンを失効させる
 * - REQ-36.3: 再有効化でログインを再び許可する
 * - REQ-36.4: 無効化・再有効化を全システム管理者へ通知し、監査に実行者・対象・理由を記録する
 * - REQ-36.5: 自分自身と最後の有効なシステム管理者の無効化を拒否する
 * - REQ-36.8: 最終ログイン・作成・最後の再有効化のうち最も新しい日時から 90 日で自動無効化する
 * - REQ-36.9: 自動無効化を一通の通知で全システム管理者へ送り、監査に自動無効化であることを記録する
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { PrismaClient } from '../../../generated/prisma/client.js';
import {
  AccountStatusService,
  AUTO_DEACTIVATION_REASON,
  INACTIVE_USER_BATCH_SIZE,
  inactiveUserWhere,
} from '../../../services/account-status.service.js';

vi.mock('../../../utils/sentry.js', () => ({
  captureException: vi.fn(),
}));

/** 呼び出しの順序の記録（コミットの後の無効化・通知の確認用） */
const calls: string[] = [];

const tx = {
  user: {
    findUnique: vi.fn(),
    findUniqueOrThrow: vi.fn(),
    findMany: vi.fn(),
    updateMany: vi.fn(),
    count: vi.fn(),
  },
  role: {
    findUnique: vi.fn(),
  },
  refreshToken: {
    deleteMany: vi.fn(),
  },
  auditLog: {
    create: vi.fn(),
  },
  $executeRaw: vi.fn(),
  $queryRaw: vi.fn(),
};

const prisma = {
  ...tx,
  $transaction: vi.fn(),
};

const TARGET = {
  id: 'target-1',
  email: 'target@example.com',
  displayName: '対象者',
  isActive: true,
  userRoles: [{ roleId: 'role-user' }],
};
const ACTOR = { email: 'admin@example.com', displayName: '管理者' };

describe('AccountStatusService', () => {
  const invalidate = vi.fn(async (_userId: string) => {
    calls.push('invalidate');
  });
  const notifyAllAdmins = vi.fn(async (_notification: unknown) => {
    calls.push('notify');
  });
  let service: AccountStatusService;

  function givenTarget(target: Partial<typeof TARGET> | null): void {
    tx.user.findUnique.mockImplementation(
      async (args: { where: { id?: string; email?: string } }) => {
        if (args.where.id === 'target-1' || args.where.email === TARGET.email) {
          return target === null ? null : { ...TARGET, ...target };
        }
        if (args.where.email !== undefined) {
          return null;
        }
        return ACTOR;
      }
    );
  }

  beforeEach(() => {
    vi.clearAllMocks();
    calls.length = 0;
    prisma.$transaction.mockImplementation(async (callback: (t: typeof tx) => Promise<unknown>) => {
      calls.push('begin');
      const value = await callback(tx);
      calls.push('commit');
      return value;
    });
    tx.role.findUnique.mockResolvedValue({ id: 'role-admin' });
    tx.refreshToken.deleteMany.mockResolvedValue({ count: 3 });
    tx.user.updateMany.mockResolvedValue({ count: 1 });
    tx.user.count.mockResolvedValue(1);
    givenTarget({});
    service = new AccountStatusService({
      prisma: prisma as unknown as PrismaClient,
      userStateService: { invalidate },
      adminNotificationService: { notifyAllAdmins },
    });
  });

  describe('deactivate()', () => {
    /**
     * @requirement user-authentication/REQ-36.1
     * @requirement user-authentication/REQ-36.4
     */
    it('状態の記録・全リフレッシュトークンの失効・監査を一つの取引で行い、コミットの後に状態のキャッシュを無効化し全管理者へ通知する', async () => {
      const result = await service.deactivate('admin-1', 'target-1', '退職', {
        ipAddress: '203.0.113.5',
        userAgent: 'vitest',
      });

      expect(result).toEqual({ ok: true, value: undefined });
      // 最後の管理者の判定を直列化するロックと、失効の前の利用者単位の取引ロックを取る
      expect(tx.$queryRaw).toHaveBeenCalled();
      expect(tx.$executeRaw).toHaveBeenCalled();
      expect(tx.refreshToken.deleteMany).toHaveBeenCalledWith({ where: { userId: 'target-1' } });
      expect(tx.user.updateMany).toHaveBeenCalledWith({
        where: { id: 'target-1', isActive: true },
        data: { isActive: false, deactivatedAt: expect.any(Date), deactivationReason: '退職' },
      });
      expect(tx.auditLog.create).toHaveBeenCalledWith({
        data: {
          action: 'USER_DEACTIVATED',
          actorId: 'admin-1',
          actorEmail: 'admin@example.com',
          actorDisplayName: '管理者',
          targetType: 'User',
          targetId: 'target-1',
          before: { isActive: true },
          after: { isActive: false },
          metadata: {
            reason: '退職',
            targetEmail: 'target@example.com',
            revokedRefreshTokens: 3,
            ipAddress: '203.0.113.5',
            userAgent: 'vitest',
          },
        },
      });
      expect(invalidate).toHaveBeenCalledWith('target-1');
      expect(notifyAllAdmins).toHaveBeenCalledWith({
        kind: 'USER_DEACTIVATED',
        subject: expect.stringContaining('対象者'),
        lines: expect.arrayContaining([
          expect.stringContaining('target@example.com'),
          expect.stringContaining('admin@example.com'),
          expect.stringContaining('退職'),
        ]),
      });
      expect(calls).toEqual(['begin', 'commit', 'invalidate', 'notify']);
    });

    /**
     * @requirement user-authentication/REQ-36.5
     */
    it('自分自身の無効化を取引の前に SELF_DEACTIVATION_FORBIDDEN で拒否する', async () => {
      const result = await service.deactivate('target-1', 'target-1', '理由', {});

      expect(result).toEqual({ ok: false, error: { type: 'SELF_DEACTIVATION_FORBIDDEN' } });
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(invalidate).not.toHaveBeenCalled();
      expect(notifyAllAdmins).not.toHaveBeenCalled();
    });

    /**
     * @requirement user-authentication/REQ-36.5
     */
    it('対象が最後の有効なシステム管理者なら LAST_ACTIVE_ADMIN_PROTECTED で拒否し、何も書かない', async () => {
      givenTarget({ userRoles: [{ roleId: 'role-admin' }] });
      tx.user.count.mockResolvedValue(0);

      const result = await service.deactivate('admin-1', 'target-1', '理由', {});

      expect(result).toEqual({ ok: false, error: { type: 'LAST_ACTIVE_ADMIN_PROTECTED' } });
      // 対象を除く有効な管理者の数で判定する
      expect(tx.user.count).toHaveBeenCalledWith({
        where: {
          id: { not: 'target-1' },
          isActive: true,
          userRoles: { some: { roleId: 'role-admin' } },
        },
      });
      expect(tx.user.updateMany).not.toHaveBeenCalled();
      expect(tx.refreshToken.deleteMany).not.toHaveBeenCalled();
      expect(tx.auditLog.create).not.toHaveBeenCalled();
      expect(invalidate).not.toHaveBeenCalled();
      expect(notifyAllAdmins).not.toHaveBeenCalled();
    });

    it('他に有効なシステム管理者がいれば管理者も無効化できる', async () => {
      givenTarget({ userRoles: [{ roleId: 'role-admin' }] });
      tx.user.count.mockResolvedValue(1);

      const result = await service.deactivate('admin-1', 'target-1', '理由', {});

      expect(result.ok).toBe(true);
      expect(tx.user.updateMany).toHaveBeenCalled();
    });

    it('対象者の不在を USER_NOT_FOUND で返す', async () => {
      givenTarget(null);

      const result = await service.deactivate('admin-1', 'target-1', '理由', {});

      expect(result).toEqual({ ok: false, error: { type: 'USER_NOT_FOUND' } });
      expect(invalidate).not.toHaveBeenCalled();
    });

    it('既に無効な対象者を ALREADY_IN_STATE で返す', async () => {
      givenTarget({ isActive: false });

      const result = await service.deactivate('admin-1', 'target-1', '理由', {});

      expect(result).toEqual({ ok: false, error: { type: 'ALREADY_IN_STATE' } });
      expect(tx.auditLog.create).not.toHaveBeenCalled();
    });

    it('並行する変更で状態が先に変わっていれば ALREADY_IN_STATE で返し、失効も監査も行わない', async () => {
      tx.user.updateMany.mockResolvedValue({ count: 0 });

      const result = await service.deactivate('admin-1', 'target-1', '理由', {});

      expect(result).toEqual({ ok: false, error: { type: 'ALREADY_IN_STATE' } });
      expect(tx.refreshToken.deleteMany).not.toHaveBeenCalled();
      expect(tx.auditLog.create).not.toHaveBeenCalled();
      expect(invalidate).not.toHaveBeenCalled();
    });

    it('コミットの後の無効化と通知の失敗は結果を変えない', async () => {
      invalidate.mockRejectedValueOnce(new Error('redis down'));
      notifyAllAdmins.mockRejectedValueOnce(new Error('queue down'));

      const result = await service.deactivate('admin-1', 'target-1', '理由', {});

      expect(result).toEqual({ ok: true, value: undefined });
    });
  });

  describe('reactivate()', () => {
    /**
     * @requirement user-authentication/REQ-36.3
     * @requirement user-authentication/REQ-36.4
     */
    it('状態と監査を一つの取引で記録し、コミットの後に状態のキャッシュを無効化し全管理者へ通知する', async () => {
      givenTarget({ isActive: false });

      const result = await service.reactivate('admin-1', 'target-1', '復職', {
        userAgent: 'vitest',
      });

      expect(result).toEqual({ ok: true, value: undefined });
      // 最後の再有効化の日時を書き、最終ログイン日時は変えない（要件36.8 の起点）
      expect(tx.user.updateMany).toHaveBeenCalledWith({
        where: { id: 'target-1', isActive: false },
        data: {
          isActive: true,
          deactivatedAt: null,
          deactivationReason: null,
          reactivatedAt: expect.any(Date),
        },
      });
      const data = tx.user.updateMany.mock.calls[0]?.[0]?.data as Record<string, unknown>;
      expect(data).not.toHaveProperty('lastLoginAt');
      expect(tx.refreshToken.deleteMany).not.toHaveBeenCalled();
      expect(tx.auditLog.create).toHaveBeenCalledWith({
        data: {
          action: 'USER_REACTIVATED',
          actorId: 'admin-1',
          actorEmail: 'admin@example.com',
          actorDisplayName: '管理者',
          targetType: 'User',
          targetId: 'target-1',
          before: { isActive: false },
          after: { isActive: true },
          metadata: { reason: '復職', targetEmail: 'target@example.com', userAgent: 'vitest' },
        },
      });
      expect(notifyAllAdmins).toHaveBeenCalledWith(
        expect.objectContaining({ kind: 'USER_REACTIVATED' })
      );
      expect(calls).toEqual(['begin', 'commit', 'invalidate', 'notify']);
    });

    it('有効な対象者を ALREADY_IN_STATE で、不在を USER_NOT_FOUND で返す', async () => {
      expect(await service.reactivate('admin-1', 'target-1', '理由', {})).toEqual({
        ok: false,
        error: { type: 'ALREADY_IN_STATE' },
      });
      givenTarget(null);
      expect(await service.reactivate('admin-1', 'target-1', '理由', {})).toEqual({
        ok: false,
        error: { type: 'USER_NOT_FOUND' },
      });
      expect(tx.auditLog.create).not.toHaveBeenCalled();
      expect(notifyAllAdmins).not.toHaveBeenCalled();
    });
  });
  describe('reactivateByOperatorScript()', () => {
    /**
     * @requirement user-authentication/REQ-36.3
     * @requirement user-authentication/REQ-36.4
     * @requirement user-authentication/REQ-36.8
     */
    it('メールアドレスで対象を引き、最後の再有効化の日時を書き、実行者の無い監査を operator_script として記録し、コミットの後に無効化と通知を行う', async () => {
      givenTarget({ isActive: false });

      const result = await service.reactivateByOperatorScript('target@example.com', '復旧');

      expect(result).toEqual({ ok: true, value: { userId: 'target-1' } });
      expect(tx.user.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { email: 'target@example.com' } })
      );
      expect(tx.user.updateMany).toHaveBeenCalledWith({
        where: { id: 'target-1', isActive: false },
        data: {
          isActive: true,
          deactivatedAt: null,
          deactivationReason: null,
          reactivatedAt: expect.any(Date),
        },
      });
      expect(tx.auditLog.create).toHaveBeenCalledWith({
        data: {
          action: 'USER_REACTIVATED',
          actorId: null,
          actorEmail: null,
          actorDisplayName: null,
          targetType: 'User',
          targetId: 'target-1',
          before: { isActive: false },
          after: { isActive: true },
          metadata: {
            reason: '復旧',
            targetEmail: 'target@example.com',
            trigger: 'operator_script',
          },
        },
      });
      expect(invalidate).toHaveBeenCalledWith('target-1');
      expect(notifyAllAdmins).toHaveBeenCalledWith({
        kind: 'USER_REACTIVATED',
        subject: expect.stringContaining('対象者'),
        lines: expect.arrayContaining([
          expect.stringContaining('target@example.com'),
          '実行者: サーバー上の復旧スクリプト',
          '理由: 復旧',
        ]),
      });
      expect(calls).toEqual(['begin', 'commit', 'invalidate', 'notify']);
    });

    it('不在のメールアドレスを USER_NOT_FOUND で、有効な利用者を ALREADY_IN_STATE で返し、何も書かない', async () => {
      expect(await service.reactivateByOperatorScript('nobody@example.com', '復旧')).toEqual({
        ok: false,
        error: { type: 'USER_NOT_FOUND' },
      });
      expect(await service.reactivateByOperatorScript('target@example.com', '復旧')).toEqual({
        ok: false,
        error: { type: 'ALREADY_IN_STATE' },
      });
      expect(tx.user.updateMany).not.toHaveBeenCalled();
      expect(tx.auditLog.create).not.toHaveBeenCalled();
      expect(invalidate).not.toHaveBeenCalled();
      expect(notifyAllAdmins).not.toHaveBeenCalled();
    });
  });

  describe('deactivateInactiveUsers()', () => {
    const NOW = new Date('2026-10-22T00:00:00.000Z');
    const CUTOFF = new Date('2026-07-24T00:00:00.000Z'); // NOW の 90 日前

    function storedUser(id: string, overrides: Record<string, unknown> = {}) {
      return {
        email: `${id}@example.com`,
        displayName: `利用者 ${id}`,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        lastLoginAt: new Date('2026-05-01T00:00:00.000Z'),
        reactivatedAt: null,
        ...overrides,
      };
    }

    beforeEach(() => {
      tx.user.findUniqueOrThrow.mockImplementation(async (args: { where: { id: string } }) =>
        storedUser(args.where.id)
      );
    });

    it('無活動の条件は GREATEST(作成, 最終ログイン, 最後の再有効化) < 基準 と同値で、空の日時を無視する', () => {
      expect(inactiveUserWhere(CUTOFF)).toEqual({
        isActive: true,
        createdAt: { lt: CUTOFF },
        AND: [
          { OR: [{ lastLoginAt: null }, { lastLoginAt: { lt: CUTOFF } }] },
          { OR: [{ reactivatedAt: null }, { reactivatedAt: { lt: CUTOFF } }] },
        ],
      });
    });

    /**
     * @requirement user-authentication/REQ-36.8
     * @requirement user-authentication/REQ-36.9
     */
    it('対象者ごとの取引で条件を再判定して無効化し、全リフレッシュトークンを失効させ、実行者の無い監査を記録し、コミットの後に無効化してから一覧を一通で通知する', async () => {
      tx.user.findMany.mockResolvedValueOnce([{ id: 'u1' }, { id: 'u2' }]);
      tx.user.findUniqueOrThrow.mockImplementation(async (args: { where: { id: string } }) =>
        args.where.id === 'u2'
          ? storedUser('u2', {
              lastLoginAt: null,
              reactivatedAt: new Date('2026-06-01T00:00:00.000Z'),
            })
          : storedUser(args.where.id)
      );

      const result = await service.deactivateInactiveUsers(NOW);

      expect(result).toEqual({ deactivatedUserIds: ['u1', 'u2'] });
      expect(tx.user.findMany).toHaveBeenCalledWith({
        where: inactiveUserWhere(CUTOFF),
        select: { id: true },
        orderBy: { id: 'asc' },
        take: INACTIVE_USER_BATCH_SIZE,
      });
      // 取引の中の条件付きの更新で再判定する（並行するログイン・再有効化に先を越されたら書かない）
      expect(tx.user.updateMany).toHaveBeenCalledWith({
        where: { id: 'u1', ...inactiveUserWhere(CUTOFF) },
        data: {
          isActive: false,
          deactivatedAt: expect.any(Date),
          deactivationReason: AUTO_DEACTIVATION_REASON,
        },
      });
      expect(tx.refreshToken.deleteMany).toHaveBeenCalledWith({ where: { userId: 'u1' } });
      expect(tx.refreshToken.deleteMany).toHaveBeenCalledWith({ where: { userId: 'u2' } });
      expect(tx.auditLog.create).toHaveBeenCalledWith({
        data: {
          action: 'USER_AUTO_DEACTIVATED',
          actorId: null,
          actorEmail: null,
          actorDisplayName: null,
          targetType: 'User',
          targetId: 'u2',
          before: { isActive: true },
          after: { isActive: false },
          metadata: {
            trigger: 'inactivity',
            reason: AUTO_DEACTIVATION_REASON,
            targetEmail: 'u2@example.com',
            // 最終ログインが空でも、作成と最後の再有効化のうち新しい方を最後の利用とする
            lastActivityAt: '2026-06-01T00:00:00.000Z',
            inactivityDays: 90,
            revokedRefreshTokens: 3,
          },
        },
      });
      expect(invalidate.mock.calls.map(([id]) => id)).toEqual(['u1', 'u2']);
      expect(notifyAllAdmins).toHaveBeenCalledTimes(1);
      expect(notifyAllAdmins).toHaveBeenCalledWith({
        kind: 'USERS_AUTO_DEACTIVATED',
        subject: expect.stringContaining('2 名'),
        lines: expect.arrayContaining([
          expect.stringContaining('u1@example.com'),
          expect.stringContaining('u2@example.com'),
          expect.stringContaining('npm run user:reactivate'),
        ]),
      });
      expect(calls).toEqual([
        'begin',
        'commit',
        'invalidate',
        'begin',
        'commit',
        'invalidate',
        'notify',
      ]);
    });

    it('対象が無ければ何も書かず通知しない（冪等）', async () => {
      tx.user.findMany.mockResolvedValueOnce([]);

      expect(await service.deactivateInactiveUsers(NOW)).toEqual({ deactivatedUserIds: [] });
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(notifyAllAdmins).not.toHaveBeenCalled();
    });

    it('取引の中の再判定で条件を満たさなくなった利用者は失効も監査も通知も行わない', async () => {
      tx.user.findMany.mockResolvedValueOnce([{ id: 'u1' }]);
      tx.user.updateMany.mockResolvedValueOnce({ count: 0 });

      expect(await service.deactivateInactiveUsers(NOW)).toEqual({ deactivatedUserIds: [] });
      expect(tx.refreshToken.deleteMany).not.toHaveBeenCalled();
      expect(tx.auditLog.create).not.toHaveBeenCalled();
      expect(invalidate).not.toHaveBeenCalled();
      expect(notifyAllAdmins).not.toHaveBeenCalled();
    });

    it('件数の上限ごとに続きの ID から読み直し、一人の失敗で他の対象者を止めない', async () => {
      const firstPage = Array.from({ length: INACTIVE_USER_BATCH_SIZE }, (_, i) => ({
        id: `u${String(i).padStart(3, '0')}`,
      }));
      tx.user.findMany.mockResolvedValueOnce(firstPage).mockResolvedValueOnce([{ id: 'u999' }]);
      prisma.$transaction.mockImplementationOnce(async () => {
        throw new Error('deadlock');
      });

      const result = await service.deactivateInactiveUsers(NOW);

      expect(tx.user.findMany).toHaveBeenCalledTimes(2);
      expect(tx.user.findMany.mock.calls[1]?.[0]).toMatchObject({
        where: { id: { gt: firstPage.at(-1)?.id } },
      });
      // 最初の一人は失敗し、残りの全員が無効化される
      expect(result.deactivatedUserIds).toHaveLength(INACTIVE_USER_BATCH_SIZE);
      expect(result.deactivatedUserIds).not.toContain('u000');
      expect(result.deactivatedUserIds).toContain('u999');
      expect(notifyAllAdmins).toHaveBeenCalledTimes(1);
    });

    it('続きの読み出しが失敗しても、それまでに無効化した利用者を通知してから失敗を投げる', async () => {
      const firstPage = Array.from({ length: INACTIVE_USER_BATCH_SIZE }, (_, i) => ({
        id: `u${String(i).padStart(3, '0')}`,
      }));
      tx.user.findMany.mockResolvedValueOnce(firstPage).mockRejectedValueOnce(new Error('db down'));

      await expect(service.deactivateInactiveUsers(NOW)).rejects.toThrow('db down');

      // 無効化はコミット済みで再実行では対象から外れるため、ここで通知しないと失われる
      expect(notifyAllAdmins).toHaveBeenCalledTimes(1);
      const notification = notifyAllAdmins.mock.calls[0]?.[0] as { lines: string[] };
      expect(notification.lines).toContain(`対象: ${INACTIVE_USER_BATCH_SIZE} 名`);
    });

    it('コミットの後の状態のキャッシュの無効化と通知の失敗は結果を変えない', async () => {
      tx.user.findMany.mockResolvedValueOnce([{ id: 'u1' }]);
      invalidate.mockRejectedValueOnce(new Error('redis down'));
      notifyAllAdmins.mockRejectedValueOnce(new Error('queue down'));

      expect(await service.deactivateInactiveUsers(NOW)).toEqual({ deactivatedUserIds: ['u1'] });
    });
  });
});
