/**
 * @fileoverview SecondFactorVerifier の単体検証（タスク74.1）
 *
 * ログインと同意で共通の、コードの照合・失敗の計数・ロック・監査を確かめる。
 * 同意の成功は失敗の連続を断ち切る（要件27A.4）が、最終ログインは変えず、資格も発行しない。
 *
 * @requirement user-authentication/REQ-47.2
 * @requirement user-authentication/REQ-47.3
 */

import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest';
import type { PrismaClient } from '../../../generated/prisma/client.js';
import { SecondFactorVerifier } from '../../../services/second-factor-verifier.service.js';
import type { TwoFactorService } from '../../../services/two-factor.service.js';
import { Err, Ok } from '../../../types/result.js';

const anomaly = vi.hoisted(() => ({ observe: vi.fn() }));
vi.mock('../../../services/security-anomaly-monitor.service.js', () => ({
  observeSecurityAnomaly: anomaly.observe,
}));
vi.mock('../../../utils/sentry.js', () => ({
  captureException: vi.fn(),
  addBreadcrumb: vi.fn(),
}));

const NOW = new Date('2026-11-24T00:00:00.000Z');
const LOCKED_UNTIL = new Date(NOW.getTime() + 5 * 60 * 1000);
const USER_ID = 'user-1';
const EMAIL = 'user@example.com';
const CTX = { ipAddress: '203.0.113.1', userAgent: 'vitest' };
const SECRET_CODE = '654321';
const SECRET_BACKUP = 'QWER5678';

describe('SecondFactorVerifier', () => {
  let row: {
    id: string;
    email: string;
    displayName: string;
    isActive: boolean;
    twoFactorFailures: number;
    twoFactorLockedUntil: Date | null;
  } | null;
  let update: ReturnType<typeof vi.fn>;
  let updateMany: ReturnType<typeof vi.fn>;
  let auditCreate: ReturnType<typeof vi.fn>;
  let verifyTOTP: ReturnType<typeof vi.fn>;
  let verifyBackupCode: ReturnType<typeof vi.fn>;
  let verifier: SecondFactorVerifier;

  const auditCalls = () =>
    auditCreate.mock.calls.map(([arg]) => arg.data as Record<string, unknown>);

  beforeEach(() => {
    vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
    anomaly.observe.mockReset();
    row = {
      id: USER_ID,
      email: EMAIL,
      displayName: '利用者',
      isActive: true,
      twoFactorFailures: 0,
      twoFactorLockedUntil: null,
    };
    update = vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      if (row && typeof data.twoFactorFailures === 'object') {
        row = { ...row, twoFactorFailures: row.twoFactorFailures + 1 };
        return { twoFactorFailures: row.twoFactorFailures };
      }
      return row;
    });
    updateMany = vi.fn(async () => ({ count: 1 }));
    auditCreate = vi.fn(async () => ({}));
    verifyTOTP = vi.fn(async () => Ok(true));
    verifyBackupCode = vi.fn(async () => Ok(true));
    const prisma = {
      user: { findUnique: vi.fn(async () => row), update, updateMany },
      auditLog: { create: auditCreate },
    } as unknown as PrismaClient;
    verifier = new SecondFactorVerifier(prisma, {
      verifyTOTP,
      verifyBackupCode,
    } as unknown as TwoFactorService);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('同意の成功', () => {
    it('TOTP の照合を通し、purpose 付きで成功を監査する', async () => {
      const result = await verifier.verify(
        USER_ID,
        { type: 'totp', code: SECRET_CODE },
        'oauth_consent',
        CTX
      );

      expect(result).toEqual(Ok(undefined));
      expect(verifyTOTP).toHaveBeenCalledWith(USER_ID, SECRET_CODE);
      expect(auditCalls()).toHaveLength(1);
      expect(auditCalls()[0]).toMatchObject({
        action: 'TWO_FACTOR_VERIFIED',
        actorId: USER_ID,
        targetId: USER_ID,
        metadata: {
          result: 'success',
          method: 'totp',
          email: EMAIL,
          purpose: 'oauth_consent',
          ipAddress: CTX.ipAddress,
        },
      });
    });

    it('バックアップコードの照合を通す', async () => {
      const result = await verifier.verify(
        USER_ID,
        { type: 'backup', code: SECRET_BACKUP },
        'oauth_consent',
        CTX
      );

      expect(result).toEqual(Ok(undefined));
      expect(verifyBackupCode).toHaveBeenCalledWith(USER_ID, SECRET_BACKUP);
      expect(auditCalls()[0]).toMatchObject({
        action: 'TWO_FACTOR_VERIFIED',
        metadata: { method: 'backup', purpose: 'oauth_consent' },
      });
    });

    it('失敗の回数だけを、ロックされていない行に限って 0 へ戻す（最終ログインは変えない）', async () => {
      row = { ...row!, twoFactorFailures: 3 };

      await verifier.verify(USER_ID, { type: 'totp', code: SECRET_CODE }, 'oauth_consent', CTX);

      expect(updateMany).toHaveBeenCalledTimes(1);
      expect(updateMany).toHaveBeenCalledWith({
        where: { id: USER_ID, twoFactorLockedUntil: null },
        data: { twoFactorFailures: 0 },
      });
      expect(update).not.toHaveBeenCalled();
    });

    it('リセットの接続タイムアウトは投げ直し、成功を監査しない', async () => {
      const timeout = new Error('Connection terminated due to connection timeout');
      updateMany.mockRejectedValue(timeout);

      await expect(
        verifier.verify(USER_ID, { type: 'totp', code: SECRET_CODE }, 'oauth_consent', CTX)
      ).rejects.toBe(timeout);
      expect(auditCreate).not.toHaveBeenCalled();
    });

    it('タイムアウト以外のリセットの失敗では検証の成功を保つ', async () => {
      updateMany.mockRejectedValue(new Error('update failed'));

      const result = await verifier.verify(
        USER_ID,
        { type: 'totp', code: SECRET_CODE },
        'oauth_consent',
        CTX
      );

      expect(result).toEqual(Ok(undefined));
      expect(auditCalls()[0]).toMatchObject({ action: 'TWO_FACTOR_VERIFIED' });
    });

    it('照合に失敗したらリセットしない', async () => {
      verifyTOTP.mockResolvedValue(Ok(false));

      await verifier.verify(USER_ID, { type: 'totp', code: SECRET_CODE }, 'oauth_consent', CTX);

      expect(updateMany).not.toHaveBeenCalled();
    });

    it('読み込み済みの行を渡す入口は login に限る', () => {
      expectTypeOf<
        Parameters<SecondFactorVerifier['verifyLoadedUser']>[2]
      >().toEqualTypeOf<'login'>();
    });
  });

  describe('ログインの目的', () => {
    it('成功の監査・最終ログインの更新・リセットをログインへ任せる', async () => {
      const result = await verifier.verify(
        USER_ID,
        { type: 'totp', code: SECRET_CODE },
        'login',
        CTX
      );

      expect(result).toEqual(Ok(undefined));
      expect(update).not.toHaveBeenCalled();
      expect(updateMany).not.toHaveBeenCalled();
      expect(auditCreate).not.toHaveBeenCalled();
    });

    it('失敗の監査に purpose を載せない（既存の出力を変えない）', async () => {
      verifyTOTP.mockResolvedValue(Ok(false));

      const result = await verifier.verify(
        USER_ID,
        { type: 'totp', code: SECRET_CODE },
        'login',
        CTX
      );

      expect(result).toEqual(Err({ type: 'INVALID_CODE' }));
      expect(auditCalls()[0]?.metadata).not.toHaveProperty('purpose');
    });
  });

  describe('失敗', () => {
    it.each(['login', 'oauth_consent'] as const)('%s: 誤りのコードは 1 回数える', async (p) => {
      verifyTOTP.mockResolvedValue(Ok(false));

      const result = await verifier.verify(USER_ID, { type: 'totp', code: SECRET_CODE }, p, CTX);

      expect(result).toEqual(Err({ type: 'INVALID_CODE' }));
      expect(update).toHaveBeenCalledTimes(1);
      expect(update.mock.calls[0]?.[0].data).toEqual({ twoFactorFailures: { increment: 1 } });
      expect(anomaly.observe).toHaveBeenCalledWith(
        expect.objectContaining({ signal: 'login_failed', userId: USER_ID })
      );
      expect(auditCalls()[0]).toMatchObject({
        action: 'TWO_FACTOR_FAILED',
        actorId: null,
        metadata: { result: 'failure', reason: 'invalid_code', method: 'totp' },
      });
    });

    it('同意の失敗の監査に purpose を載せる', async () => {
      verifyBackupCode.mockResolvedValue(Ok(false));

      await verifier.verify(USER_ID, { type: 'backup', code: SECRET_BACKUP }, 'oauth_consent', CTX);

      expect(auditCalls()[0]).toMatchObject({
        action: 'TWO_FACTOR_FAILED',
        metadata: { reason: 'invalid_code', method: 'backup', purpose: 'oauth_consent' },
      });
    });

    it('同じ時間ステップの再利用は replay として数える', async () => {
      verifyTOTP.mockResolvedValue(Err({ type: 'CODE_ALREADY_USED' }));

      const result = await verifier.verify(
        USER_ID,
        { type: 'totp', code: SECRET_CODE },
        'oauth_consent',
        CTX
      );

      expect(result).toEqual(Err({ type: 'INVALID_CODE' }));
      expect(update).toHaveBeenCalledTimes(1);
      expect(auditCalls()[0]).toMatchObject({
        metadata: { reason: 'replay', purpose: 'oauth_consent' },
      });
    });

    it('5 回目の失敗でロックし、失敗とロックを監査する', async () => {
      row = { ...row!, twoFactorFailures: 4 };
      verifyTOTP.mockResolvedValue(Ok(false));

      const result = await verifier.verify(
        USER_ID,
        { type: 'totp', code: SECRET_CODE },
        'oauth_consent',
        CTX
      );

      expect(result).toEqual(Err({ type: 'ACCOUNT_LOCKED', unlockAt: LOCKED_UNTIL }));
      expect(update.mock.calls[1]?.[0].data).toEqual({ twoFactorLockedUntil: LOCKED_UNTIL });
      expect(auditCalls().map((a) => a.action)).toEqual(['TWO_FACTOR_FAILED', 'LOGIN_LOCKED']);
      expect(auditCalls()[1]).toMatchObject({
        metadata: {
          trigger: 'two_factor_failures',
          lockedUntil: LOCKED_UNTIL.toISOString(),
          purpose: 'oauth_consent',
        },
      });
    });

    it('ロック中はコードを照合せず、数えない', async () => {
      row = { ...row!, twoFactorFailures: 5, twoFactorLockedUntil: LOCKED_UNTIL };

      const result = await verifier.verify(
        USER_ID,
        { type: 'totp', code: SECRET_CODE },
        'oauth_consent',
        CTX
      );

      expect(result).toEqual(Err({ type: 'ACCOUNT_LOCKED', unlockAt: LOCKED_UNTIL }));
      expect(verifyTOTP).not.toHaveBeenCalled();
      expect(update).not.toHaveBeenCalled();
      expect(auditCalls()[0]).toMatchObject({
        metadata: { reason: 'account_locked', purpose: 'oauth_consent' },
      });
    });

    it('ロックの期限が切れていれば解除してから照合する', async () => {
      row = { ...row!, twoFactorFailures: 5, twoFactorLockedUntil: NOW };

      const result = await verifier.verify(
        USER_ID,
        { type: 'totp', code: SECRET_CODE },
        'oauth_consent',
        CTX
      );

      expect(result).toEqual(Ok(undefined));
      expect(update.mock.calls[0]?.[0].data).toEqual({
        twoFactorFailures: 0,
        twoFactorLockedUntil: null,
      });
      expect(update.mock.invocationCallOrder[0]).toBeLessThan(
        verifyTOTP.mock.invocationCallOrder[0]!
      );
    });

    it('存在しない利用者は照合せず INVALID_CODE を返す', async () => {
      row = null;

      const result = await verifier.verify(
        USER_ID,
        { type: 'totp', code: SECRET_CODE },
        'oauth_consent',
        CTX
      );

      expect(result).toEqual(Err({ type: 'INVALID_CODE' }));
      expect(verifyTOTP).not.toHaveBeenCalled();
      expect(update).not.toHaveBeenCalled();
      expect(auditCalls()[0]).toMatchObject({
        metadata: { reason: 'user_not_found', purpose: 'oauth_consent' },
      });
    });

    it('無効化された利用者は照合せず、数えず INVALID_CODE を返す', async () => {
      row = { ...row!, isActive: false };

      const result = await verifier.verify(
        USER_ID,
        { type: 'backup', code: SECRET_BACKUP },
        'oauth_consent',
        CTX
      );

      expect(result).toEqual(Err({ type: 'INVALID_CODE' }));
      expect(verifyBackupCode).not.toHaveBeenCalled();
      expect(update).not.toHaveBeenCalled();
      expect(auditCalls()[0]).toMatchObject({
        metadata: { reason: 'account_disabled', purpose: 'oauth_consent' },
      });
    });

    it('監査にコードを書かない', async () => {
      verifyTOTP.mockResolvedValue(Ok(false));
      await verifier.verify(USER_ID, { type: 'totp', code: SECRET_CODE }, 'oauth_consent', CTX);
      verifyBackupCode.mockResolvedValue(Ok(false));
      await verifier.verify(USER_ID, { type: 'backup', code: SECRET_BACKUP }, 'oauth_consent', CTX);

      const written = JSON.stringify(auditCalls());
      expect(written).not.toContain(SECRET_CODE);
      expect(written).not.toContain(SECRET_BACKUP);
    });
  });
});
