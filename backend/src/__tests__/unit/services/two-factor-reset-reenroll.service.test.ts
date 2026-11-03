/**
 * @fileoverview TwoFactorService の管理者による再設定と利用者による再登録の単体テスト（タスク47.8）
 *
 * Requirements (user-authentication):
 * - 34.7, 34.9, 34.10: 管理者による 2FA の再設定・自己の再設定の拒否・監査
 * - 34.11: 現在の TOTP による再登録（確認までは既存の秘密鍵が有効）
 * - 38.13: 実行者の上限を超えるロールを持つ利用者の再設定の拒否（タスク62.1）
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { authenticator } from 'otplib';
import { TwoFactorService } from '../../../services/two-factor.service.js';
import { PrivilegeCeilingPolicy } from '../../../services/privilege-ceiling.js';
import type { PrismaClient } from '../../../generated/prisma/client.js';

/** 呼び出しの順序の記録（コミットの後の無効化の確認用） */
const calls: string[] = [];

const mockPrismaClient = {
  user: {
    findUnique: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
  twoFactorBackupCode: {
    deleteMany: vi.fn(),
    create: vi.fn(),
  },
  refreshToken: {
    deleteMany: vi.fn(),
  },
  auditLog: {
    create: vi.fn(),
  },
  userRole: {
    findMany: vi.fn(),
  },
  $executeRaw: vi.fn(),
  $queryRaw: vi.fn(),
  $transaction: vi.fn(),
};

vi.mock('../../../db', () => ({
  default: () => mockPrismaClient,
}));

vi.mock('@node-rs/argon2', () => ({
  hash: vi.fn(async (value: string) => `hashed:${value}`),
  verify: vi.fn(),
}));

describe('TwoFactorService 管理者による再設定と利用者による再登録', () => {
  const invalidate = vi.fn(async (_userId: string) => {
    calls.push('invalidate');
  });
  let service: TwoFactorService;

  beforeEach(() => {
    vi.clearAllMocks();
    calls.length = 0;
    process.env.TWO_FACTOR_ENCRYPTION_KEY =
      'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789';
    mockPrismaClient.$transaction.mockImplementation(
      async (callback: (tx: typeof mockPrismaClient) => Promise<unknown>) => {
        calls.push('begin');
        const value = await callback(mockPrismaClient);
        calls.push('commit');
        return value;
      }
    );
    mockPrismaClient.refreshToken.deleteMany.mockResolvedValue({ count: 2 });
    mockPrismaClient.user.updateMany.mockResolvedValue({ count: 1 });
    service = new TwoFactorService({ invalidate });
  });

  describe('resetByAdmin()', () => {
    /**
     * @requirement user-authentication/REQ-34.7
     * @requirement user-authentication/REQ-34.10
     */
    it('対象者の秘密鍵・バックアップコード・全リフレッシュトークンを消してアクセストークンの世代を進め、監査に実行者と対象者を記録し、コミットの後に状態のキャッシュを無効化する', async () => {
      mockPrismaClient.user.findUnique.mockImplementation(
        async (args: { where: { id: string } }) =>
          args.where.id === 'target-1'
            ? { id: 'target-1', email: 'target@example.com' }
            : { email: 'admin@example.com', displayName: '管理者' }
      );

      const result = await service.resetByAdmin('admin-1', 'target-1', {
        ipAddress: '203.0.113.5',
        userAgent: 'vitest',
      });

      expect(result).toEqual({ ok: true, value: undefined });
      // 失効の前に利用者単位の取引ロックを取る
      expect(mockPrismaClient.$executeRaw).toHaveBeenCalled();
      expect(mockPrismaClient.refreshToken.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'target-1' },
      });
      expect(mockPrismaClient.twoFactorBackupCode.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'target-1' },
      });
      expect(mockPrismaClient.user.update).toHaveBeenCalledWith({
        where: { id: 'target-1' },
        data: {
          twoFactorEnabled: false,
          twoFactorSecret: null,
          twoFactorPendingSecret: null,
          // 再設定より前のアクセストークンを拒否するため、同じ取引で世代を進める（要件34.7）
          accessTokenGeneration: { increment: 1 },
        },
      });
      expect(mockPrismaClient.auditLog.create).toHaveBeenCalledWith({
        data: {
          action: 'TWO_FACTOR_RESET_BY_ADMIN',
          actorId: 'admin-1',
          actorEmail: 'admin@example.com',
          actorDisplayName: '管理者',
          targetType: 'User',
          targetId: 'target-1',
          metadata: {
            targetEmail: 'target@example.com',
            revokedRefreshTokens: 2,
            ipAddress: '203.0.113.5',
            userAgent: 'vitest',
          },
        },
      });
      expect(invalidate).toHaveBeenCalledWith('target-1');
      expect(calls).toEqual(['begin', 'commit', 'invalidate']);
    });

    /**
     * @requirement user-authentication/REQ-34.9
     */
    it('自分自身の再設定を SELF_RESET_FORBIDDEN で拒否し、何も書かない', async () => {
      const result = await service.resetByAdmin('admin-1', 'admin-1');

      expect(result).toEqual({ ok: false, error: { type: 'SELF_RESET_FORBIDDEN' } });
      expect(mockPrismaClient.$transaction).not.toHaveBeenCalled();
      expect(mockPrismaClient.user.update).not.toHaveBeenCalled();
      expect(mockPrismaClient.auditLog.create).not.toHaveBeenCalled();
      expect(invalidate).not.toHaveBeenCalled();
    });

    it('対象者が存在しなければ USER_NOT_FOUND を返し、無効化しない', async () => {
      mockPrismaClient.user.findUnique.mockResolvedValue(null);

      const result = await service.resetByAdmin('admin-1', 'missing');

      expect(result).toEqual({ ok: false, error: { type: 'USER_NOT_FOUND' } });
      expect(mockPrismaClient.refreshToken.deleteMany).not.toHaveBeenCalled();
      expect(mockPrismaClient.auditLog.create).not.toHaveBeenCalled();
      expect(invalidate).not.toHaveBeenCalled();
    });

    it('コミットの後の無効化の失敗は、再設定の成功を変えない', async () => {
      mockPrismaClient.user.findUnique.mockResolvedValue({ id: 'target-1', email: 't@e.com' });
      invalidate.mockRejectedValueOnce(new Error('redis down'));

      const result = await service.resetByAdmin('admin-1', 'target-1');

      expect(result.ok).toBe(true);
    });
  });

  /**
   * 他のユーザーの管理の上限（要件38.13。タスク62.1）。実際の PrivilegeCeilingPolicy を同じ取引の
   * クライアントで動かし、保有ロールは利用者ごとに偽物で与える
   */
  describe('resetByAdmin() の他のユーザーの管理の上限（要件38.13）', () => {
    const createLog = vi.fn(async (_input: unknown) => {
      calls.push('audit');
      return {};
    });
    let ceilingService: TwoFactorService;

    function givenRoles(actor: number[], target: number[]): void {
      const toRows = (priorities: number[]) =>
        priorities.map((priority, i) => ({ role: { name: `role-${priority}-${i}`, priority } }));
      mockPrismaClient.userRole.findMany.mockImplementation(
        async (args: { where: { userId: string } }) =>
          args.where.userId === 'admin-1' ? toRows(actor) : toRows(target)
      );
    }

    beforeEach(() => {
      mockPrismaClient.user.findUnique.mockImplementation(
        async (args: { where: { id: string } }) =>
          args.where.id === 'target-1'
            ? { id: 'target-1', email: 'target@example.com' }
            : { email: 'admin@example.com', displayName: '管理者' }
      );
      ceilingService = new TwoFactorService(
        { invalidate },
        {
          privilegeCeiling: new PrivilegeCeilingPolicy(mockPrismaClient as unknown as PrismaClient),
          auditLogService: { createLog: createLog as never },
        }
      );
    });

    /**
     * @requirement user-authentication/REQ-38.13
     */
    it('上限を超えるロールを持つ利用者の再設定を TARGET_USER_EXCEEDS_ACTOR で拒否し、2FA・トークンを変えず、取引の外で監査に記録する', async () => {
      givenRoles([50], [70]);

      const result = await ceilingService.resetByAdmin('admin-1', 'target-1', {});

      expect(result).toEqual({
        ok: false,
        error: { type: 'TARGET_USER_EXCEEDS_ACTOR', targetPriority: 70 },
      });
      expect(mockPrismaClient.refreshToken.deleteMany).not.toHaveBeenCalled();
      expect(mockPrismaClient.twoFactorBackupCode.deleteMany).not.toHaveBeenCalled();
      expect(mockPrismaClient.user.update).not.toHaveBeenCalled();
      expect(mockPrismaClient.auditLog.create).not.toHaveBeenCalled();
      expect(invalidate).not.toHaveBeenCalled();
      // 判定の前に対象の users の行をロックする
      const lock = (mockPrismaClient.$queryRaw.mock.calls[0]![0] as TemplateStringsArray).join('?');
      expect(lock).toContain('FROM users');
      expect(lock).toContain('FOR UPDATE');
      expect(createLog).toHaveBeenCalledTimes(1);
      expect(createLog).toHaveBeenCalledWith({
        action: 'PERMISSION_CHECK_FAILED',
        actorId: 'admin-1',
        targetType: 'user',
        targetId: 'target-1',
        before: null,
        after: null,
        metadata: {
          reason: 'TARGET_USER_EXCEEDS_ACTOR',
          operation: 'two_factor_reset',
          targetPriority: '70',
        },
      });
      expect(calls).toEqual(['begin', 'commit', 'audit']);
    });

    /**
     * @requirement user-authentication/REQ-38.13
     */
    it('上限ちょうどのロールを持つ利用者とロールを持たない利用者は再設定できる', async () => {
      givenRoles([50], [50]);
      expect(await ceilingService.resetByAdmin('admin-1', 'target-1', {})).toEqual({
        ok: true,
        value: undefined,
      });
      givenRoles([50], []);
      expect(await ceilingService.resetByAdmin('admin-1', 'target-1', {})).toEqual({
        ok: true,
        value: undefined,
      });
      expect(mockPrismaClient.user.update).toHaveBeenCalledTimes(2);
      expect(createLog).not.toHaveBeenCalled();
    });

    /**
     * @requirement user-authentication/REQ-38.13
     */
    it('自分自身の再設定は従来どおり SELF_RESET_FORBIDDEN で、上限を判定しない', async () => {
      givenRoles([50], [70]);

      const result = await ceilingService.resetByAdmin('admin-1', 'admin-1', {});

      expect(result).toEqual({ ok: false, error: { type: 'SELF_RESET_FORBIDDEN' } });
      expect(mockPrismaClient.userRole.findMany).not.toHaveBeenCalled();
      expect(createLog).not.toHaveBeenCalled();
    });
  });

  describe('startReenrollment()', () => {
    async function enrolledUser(secret: string) {
      return {
        email: 'user@example.com',
        twoFactorEnabled: true,
        twoFactorSecret: await service.encryptSecret(secret),
      };
    }

    /**
     * @requirement user-authentication/REQ-34.11
     */
    it('現在のコードを確かめた後、新しい秘密鍵を再登録中の秘密鍵として置き、既存の秘密鍵は変えない', async () => {
      const currentSecret = authenticator.generateSecret();
      mockPrismaClient.user.findUnique.mockResolvedValue(await enrolledUser(currentSecret));

      const result = await service.startReenrollment(
        'user-1',
        authenticator.generate(currentSecret)
      );

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.secretForManualEntry).toMatch(/^[A-Z2-7]+=*$/);
      expect(result.value.qrCodeDataUrl).toMatch(/^data:image\/png;base64,/);
      expect(mockPrismaClient.user.update).toHaveBeenCalledTimes(1);
      const update = mockPrismaClient.user.update.mock.calls[0]![0] as {
        data: Record<string, unknown>;
      };
      expect(Object.keys(update.data)).toEqual(['twoFactorPendingSecret']);
      expect(await service.decryptSecret(update.data.twoFactorPendingSecret as string)).toBe(
        result.value.secretForManualEntry
      );
    });

    /**
     * @requirement user-authentication/REQ-34.11
     */
    it('現在のコードが誤っていれば INVALID_TOTP_CODE を返し、新しい秘密鍵を置かない', async () => {
      const currentSecret = authenticator.generateSecret();
      mockPrismaClient.user.findUnique.mockResolvedValue(await enrolledUser(currentSecret));
      const otherCode = authenticator.generate(authenticator.generateSecret());
      const wrong = otherCode === authenticator.generate(currentSecret) ? '000000' : otherCode;

      const result = await service.startReenrollment('user-1', wrong);

      expect(result).toEqual({ ok: false, error: { type: 'INVALID_TOTP_CODE' } });
      expect(mockPrismaClient.user.update).not.toHaveBeenCalled();
    });

    it('2FA 未登録の利用者は TWO_FACTOR_NOT_ENABLED になる', async () => {
      mockPrismaClient.user.findUnique.mockResolvedValue({
        email: 'user@example.com',
        twoFactorEnabled: false,
        twoFactorSecret: null,
      });

      const result = await service.startReenrollment('user-1', '123456');

      expect(result).toEqual({ ok: false, error: { type: 'TWO_FACTOR_NOT_ENABLED' } });
    });
  });

  describe('confirmReenrollment()', () => {
    /**
     * @requirement user-authentication/REQ-34.11
     */
    it('新しいコードの確認で再登録中の秘密鍵を本採用し、バックアップコードを作り直し、監査に記録する', async () => {
      const newSecret = authenticator.generateSecret();
      const pending = await service.encryptSecret(newSecret);
      mockPrismaClient.user.findUnique.mockImplementation(
        async (args: { select: Record<string, boolean> }) =>
          args.select.twoFactorPendingSecret
            ? { twoFactorEnabled: true, twoFactorPendingSecret: pending }
            : { email: 'user@example.com', displayName: '利用者' }
      );

      const result = await service.confirmReenrollment(
        'user-1',
        authenticator.generate(newSecret),
        { ipAddress: '198.51.100.7' }
      );

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.backupCodes).toHaveLength(10);
      const updateArgs = mockPrismaClient.user.updateMany.mock.calls[0]![0] as {
        where: Record<string, unknown>;
        data: Record<string, unknown>;
      };
      expect(updateArgs.where).toEqual({
        id: 'user-1',
        twoFactorEnabled: true,
        twoFactorPendingSecret: pending,
      });
      expect(updateArgs.data).toMatchObject({
        twoFactorSecret: pending,
        twoFactorPendingSecret: null,
      });
      expect(typeof updateArgs.data.twoFactorLastUsedStep).toBe('number');
      expect(mockPrismaClient.twoFactorBackupCode.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
      });
      expect(mockPrismaClient.twoFactorBackupCode.create).toHaveBeenCalledTimes(10);
      expect(mockPrismaClient.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'TWO_FACTOR_REENROLLED',
          actorId: 'user-1',
          targetType: 'User',
          targetId: 'user-1',
          metadata: { ipAddress: '198.51.100.7' },
        }),
      });
    });

    /**
     * @requirement user-authentication/REQ-34.11
     */
    it('新しいコードが誤っていれば INVALID_TOTP_CODE を返し、既存の秘密鍵を置き換えない', async () => {
      const newSecret = authenticator.generateSecret();
      mockPrismaClient.user.findUnique.mockResolvedValue({
        twoFactorEnabled: true,
        twoFactorPendingSecret: await service.encryptSecret(newSecret),
      });
      const otherCode = authenticator.generate(authenticator.generateSecret());
      const wrong = otherCode === authenticator.generate(newSecret) ? '000000' : otherCode;

      const result = await service.confirmReenrollment('user-1', wrong);

      expect(result).toEqual({ ok: false, error: { type: 'INVALID_TOTP_CODE' } });
      expect(mockPrismaClient.$transaction).not.toHaveBeenCalled();
      expect(mockPrismaClient.user.updateMany).not.toHaveBeenCalled();
    });

    it('再登録を開始していなければ REENROLLMENT_NOT_STARTED になる', async () => {
      mockPrismaClient.user.findUnique.mockResolvedValue({
        twoFactorEnabled: true,
        twoFactorPendingSecret: null,
      });

      const result = await service.confirmReenrollment('user-1', '123456');

      expect(result).toEqual({ ok: false, error: { type: 'REENROLLMENT_NOT_STARTED' } });
    });

    it('確認の間に再登録中の秘密鍵が変わっていれば置き換えず REENROLLMENT_NOT_STARTED になる', async () => {
      const newSecret = authenticator.generateSecret();
      mockPrismaClient.user.findUnique.mockResolvedValue({
        twoFactorEnabled: true,
        twoFactorPendingSecret: await service.encryptSecret(newSecret),
      });
      mockPrismaClient.user.updateMany.mockResolvedValue({ count: 0 });

      const result = await service.confirmReenrollment('user-1', authenticator.generate(newSecret));

      expect(result).toEqual({ ok: false, error: { type: 'REENROLLMENT_NOT_STARTED' } });
      expect(mockPrismaClient.twoFactorBackupCode.deleteMany).not.toHaveBeenCalled();
      expect(mockPrismaClient.auditLog.create).not.toHaveBeenCalled();
    });
  });
});
