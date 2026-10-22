/**
 * @fileoverview AccountStatusService の無効化と再有効化の単体テスト（タスク49.2）
 *
 * Requirements (user-authentication):
 * - REQ-36.1: 無効化で全リフレッシュトークンを失効させる
 * - REQ-36.3: 再有効化でログインを再び許可する
 * - REQ-36.4: 無効化・再有効化を全システム管理者へ通知し、監査に実行者・対象・理由を記録する
 * - REQ-36.5: 自分自身と最後の有効なシステム管理者の無効化を拒否する
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { PrismaClient } from '../../../generated/prisma/client.js';
import { AccountStatusService } from '../../../services/account-status.service.js';

/** 呼び出しの順序の記録（コミットの後の無効化・通知の確認用） */
const calls: string[] = [];

const tx = {
  user: {
    findUnique: vi.fn(),
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
    tx.user.findUnique.mockImplementation(async (args: { where: { id: string } }) => {
      if (args.where.id === 'target-1') {
        return target === null ? null : { ...TARGET, ...target };
      }
      return ACTOR;
    });
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
      expect(tx.user.updateMany).toHaveBeenCalledWith({
        where: { id: 'target-1', isActive: false },
        data: { isActive: true, deactivatedAt: null, deactivationReason: null },
      });
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
});
