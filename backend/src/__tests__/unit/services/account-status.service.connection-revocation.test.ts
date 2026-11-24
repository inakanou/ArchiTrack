/**
 * @fileoverview 無効化（手動・自動）による外部アプリの接続の失効の単体テスト（user-authentication タスク76.2）
 *
 * Requirements (user-authentication):
 * - REQ-50.3: 利用者のアカウントが無効化される（自動を含む）と、全ての接続を直ちに失効させる
 * - REQ-51.7: 失効の監査に実行者と送信元 IP を残す。要求の無い自動の無効化は送信元を渡さない（IP は null）
 *
 * Design: Requirements 46-51 > Modified Files（account-status.service.ts: 無効化のトランザクションで接続を失効させる）
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { PrismaClient } from '../../../generated/prisma/client.js';
import { AccountStatusService } from '../../../services/account-status.service.js';
import type { UserConnectionRevoker } from '../../../services/external-app-connection.service.js';

vi.mock('../../../utils/sentry.js', () => ({
  captureException: vi.fn(),
}));

/** 呼び出しの順序の記録 */
const calls: string[] = [];

const tx = {
  user: {
    findUnique: vi.fn(),
    findUniqueOrThrow: vi.fn(),
    findMany: vi.fn(),
    updateMany: vi.fn(async () => {
      calls.push('user.updateMany');
      return { count: 1 };
    }),
    count: vi.fn(),
  },
  role: { findUnique: vi.fn() },
  refreshToken: {
    deleteMany: vi.fn(async () => {
      calls.push('refreshToken.deleteMany');
      return { count: 1 };
    }),
  },
  auditLog: {
    create: vi.fn(async (args: { data: { action: string } }) => {
      calls.push(`audit:${args.data.action}`);
      return {};
    }),
  },
  $executeRaw: vi.fn(async () => {
    calls.push('advisory-lock');
    return 1;
  }),
  $queryRaw: vi.fn(async () => []),
};

const prisma = { ...tx, $transaction: vi.fn() };

const TARGET = {
  id: 'target-1',
  email: 'target@example.com',
  displayName: '対象者',
  isActive: true,
  userRoles: [{ roleId: 'role-user' }],
};
const ACTOR = { email: 'admin@example.com', displayName: '管理者' };
const SOURCE = { ipAddress: '203.0.113.76', userAgent: 'vitest-762' };

describe('AccountStatusService の接続の失効（タスク76.2）', () => {
  const invalidate = vi.fn(async () => {
    calls.push('invalidate');
  });
  const notifyAllAdmins = vi.fn(async () => {
    calls.push('notify');
  });
  const revokeAllForUser = vi.fn<UserConnectionRevoker['revokeAllForUser']>(async () => {
    calls.push('revokeAllForUser');
    return 2;
  });
  let service: AccountStatusService;

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
    tx.user.count.mockResolvedValue(1);
    tx.user.findUnique.mockImplementation(async (args: { where: { id?: string } }) =>
      args.where.id === 'target-1' ? { ...TARGET } : ACTOR
    );
    service = new AccountStatusService({
      prisma: prisma as unknown as PrismaClient,
      userStateService: { invalidate },
      adminNotificationService: { notifyAllAdmins },
      connectionRevoker: { revokeAllForUser },
    });
  });

  describe('管理者による無効化', () => {
    /**
     * @requirement user-authentication/REQ-50.3
     * @requirement user-authentication/REQ-51.7
     */
    it('状態の更新の後、同じ取引の中で理由 ACCOUNT_DEACTIVATED・実行者・送信元を渡して全ての接続を失効させる', async () => {
      const result = await service.deactivate('admin-1', 'target-1', '退職', SOURCE);

      expect(result).toEqual({ ok: true, value: undefined });
      expect(revokeAllForUser).toHaveBeenCalledTimes(1);
      expect(revokeAllForUser).toHaveBeenCalledWith(
        'target-1',
        'ACCOUNT_DEACTIVATED',
        { userId: 'admin-1', source: SOURCE },
        tx
      );
      // 取引の中（begin と commit の間）で、状態の更新の後に失効し、コミットの後に無効化と通知を行う
      const begin = calls.indexOf('begin');
      const revoke = calls.indexOf('revokeAllForUser');
      expect(begin).toBeGreaterThanOrEqual(0);
      expect(revoke).toBeGreaterThan(calls.indexOf('user.updateMany'));
      expect(revoke).toBeLessThan(calls.indexOf('commit'));
      expect(calls.indexOf('invalidate')).toBeGreaterThan(calls.indexOf('commit'));
    });

    it('失効が失敗すると取引ごと失敗し、コミットの後の無効化と通知を行わない', async () => {
      revokeAllForUser.mockRejectedValueOnce(new Error('revocation failed'));

      await expect(service.deactivate('admin-1', 'target-1', '退職', SOURCE)).rejects.toThrow(
        'revocation failed'
      );
      expect(calls).not.toContain('commit');
      expect(invalidate).not.toHaveBeenCalled();
      expect(notifyAllAdmins).not.toHaveBeenCalled();
    });

    it('既に無効な利用者（並行する変更に先を越された場合を含む）では失効させない', async () => {
      tx.user.updateMany.mockResolvedValueOnce({ count: 0 });

      const result = await service.deactivate('admin-1', 'target-1', '退職', SOURCE);

      expect(result).toEqual({ ok: false, error: { type: 'ALREADY_IN_STATE' } });
      expect(revokeAllForUser).not.toHaveBeenCalled();
    });

    it('再有効化では接続を失効させず、復元もしない', async () => {
      tx.user.findUnique.mockImplementation(async (args: { where: { id?: string } }) =>
        args.where.id === 'target-1' ? { ...TARGET, isActive: false } : ACTOR
      );

      const result = await service.reactivate('admin-1', 'target-1', '復職', SOURCE);

      expect(result).toEqual({ ok: true, value: undefined });
      expect(revokeAllForUser).not.toHaveBeenCalled();
    });
  });

  describe('90 日の自動無効化', () => {
    const NOW = new Date('2026-10-22T00:00:00.000Z');

    beforeEach(() => {
      tx.user.findUniqueOrThrow.mockImplementation(async (args: { where: { id: string } }) => ({
        email: `${args.where.id}@example.com`,
        displayName: `利用者 ${args.where.id}`,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        lastLoginAt: new Date('2026-05-01T00:00:00.000Z'),
        reactivatedAt: null,
      }));
    });

    /**
     * @requirement user-authentication/REQ-50.3
     * @requirement user-authentication/REQ-51.7
     */
    it('利用者ごとの取引の中で、実行者なし・送信元なしで理由 ACCOUNT_DEACTIVATED の失効を行う', async () => {
      tx.user.findMany.mockResolvedValueOnce([{ id: 'u1' }, { id: 'u2' }]);

      const result = await service.deactivateInactiveUsers(NOW);

      expect(result).toEqual({ deactivatedUserIds: ['u1', 'u2'] });
      expect(revokeAllForUser.mock.calls).toEqual([
        ['u1', 'ACCOUNT_DEACTIVATED', { userId: null }, tx],
        ['u2', 'ACCOUNT_DEACTIVATED', { userId: null }, tx],
      ]);
      // 偽の送信元を作らない（監査の IP は null になる）
      for (const [, , actor] of revokeAllForUser.mock.calls) {
        expect(actor.source).toBeUndefined();
      }
      // 各利用者の失効はその利用者の取引の中で、状態の更新の後に行う
      const segments = calls.join(',').split('commit').slice(0, 2);
      for (const segment of segments) {
        const parts = segment.split(',').filter((part) => part !== '');
        expect(parts).toContain('begin');
        expect(parts.indexOf('revokeAllForUser')).toBeGreaterThan(parts.indexOf('user.updateMany'));
      }
    });

    it('一人の失効の失敗はその利用者だけを戻し、他の利用者の無効化と失効を続ける', async () => {
      tx.user.findMany.mockResolvedValueOnce([{ id: 'u1' }, { id: 'u2' }]);
      revokeAllForUser.mockRejectedValueOnce(new Error('revocation failed'));

      const result = await service.deactivateInactiveUsers(NOW);

      expect(result).toEqual({ deactivatedUserIds: ['u2'] });
      expect(revokeAllForUser).toHaveBeenCalledTimes(2);
      expect(invalidate).toHaveBeenCalledTimes(1);
      expect(invalidate).toHaveBeenCalledWith('u2');
    });

    it('条件を満たさなくなった利用者では失効させない', async () => {
      tx.user.findMany.mockResolvedValueOnce([{ id: 'u1' }]);
      tx.user.updateMany.mockResolvedValueOnce({ count: 0 });

      expect(await service.deactivateInactiveUsers(NOW)).toEqual({ deactivatedUserIds: [] });
      expect(revokeAllForUser).not.toHaveBeenCalled();
    });
  });
});
