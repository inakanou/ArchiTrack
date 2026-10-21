/**
 * @fileoverview パスワード変更による初回の変更の要否の解除の単体テスト（user-authentication タスク47.6）
 *
 * 初回のパスワード変更を要する利用者（初期管理者）はパスワード変更の完了で要否が解け、コミットの後に
 * 利用者の状態のキャッシュを無効化する（design.md「AuthenticateMiddleware と AuthenticatedUserStateService」:
 * 状態を変える処理はコミットの後に invalidate を呼ぶ）。無効化をしないと、認証ミドルウェアが TTL の間
 * 古い「変更を要する」状態で要求を拒否し続ける。
 *
 * @requirement user-authentication/REQ-37.7
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PasswordService } from '../../../services/password.service.js';
import type { PrismaClient, User } from '../../../generated/prisma/client.js';
import type { EmailService } from '../../../services/email.service.js';

const USER_ID = 'user-must-change-1';
const CURRENT_PASSWORD = 'InitialAdminPass123!';
const NEW_PASSWORD = 'ChangedAdminPass456!';

describe('PasswordService（初回のパスワード変更の要否の解除）', () => {
  let service: PasswordService;
  let invalidate: ReturnType<typeof vi.fn<(userId: string) => Promise<void>>>;
  let txUserUpdate: ReturnType<typeof vi.fn>;
  let transactionCommitted: boolean;
  let prisma: PrismaClient;

  beforeEach(async () => {
    invalidate = vi.fn<(userId: string) => Promise<void>>().mockResolvedValue(undefined);
    txUserUpdate = vi.fn().mockResolvedValue({ id: USER_ID });
    transactionCommitted = false;

    const tx = {
      user: { update: txUserUpdate },
      passwordHistory: {
        create: vi.fn(),
        findMany: vi.fn().mockResolvedValue([]),
        deleteMany: vi.fn(),
      },
      passwordResetToken: { update: vi.fn() },
      refreshToken: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
      $executeRaw: vi.fn().mockResolvedValue(1),
    };

    prisma = {
      user: { findUnique: vi.fn() },
      passwordHistory: { findMany: vi.fn().mockResolvedValue([]) },
      passwordResetToken: { findUnique: vi.fn() },
      $transaction: vi.fn(async (callback: (t: unknown) => Promise<unknown>) => {
        const result = await callback(tx);
        transactionCommitted = true;
        return result;
      }),
    } as unknown as PrismaClient;

    service = new PasswordService(prisma, {} as EmailService, undefined, { invalidate });

    const passwordHash = await service.hashPassword(CURRENT_PASSWORD);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: USER_ID,
      passwordHash,
      mustChangePassword: true,
      twoFactorEnabled: false,
      isActive: true,
    } as User);
  });

  it('パスワード変更で初回の変更の要否を解く', async () => {
    const result = await service.changePassword(USER_ID, CURRENT_PASSWORD, NEW_PASSWORD);

    expect(result.ok).toBe(true);
    expect(txUserUpdate).toHaveBeenCalledWith({
      where: { id: USER_ID },
      data: { passwordHash: expect.any(String), mustChangePassword: false },
    });
  });

  it('パスワード変更のコミットの後に利用者の状態のキャッシュを無効化する', async () => {
    invalidate.mockImplementation(async () => {
      // 無効化はコミットの後（コミット前に消すと、並行する取得が古い状態を書き戻しうる）
      expect(transactionCommitted).toBe(true);
    });

    const result = await service.changePassword(USER_ID, CURRENT_PASSWORD, NEW_PASSWORD);

    expect(result.ok).toBe(true);
    expect(invalidate).toHaveBeenCalledWith(USER_ID);
    expect(invalidate).toHaveBeenCalledTimes(1);
  });

  it('現在のパスワードの誤りでは要否を変えず、無効化もしない', async () => {
    const result = await service.changePassword(USER_ID, 'WrongPassword999!', NEW_PASSWORD);

    expect(result.ok).toBe(false);
    expect(txUserUpdate).not.toHaveBeenCalled();
    expect(invalidate).not.toHaveBeenCalled();
  });

  it('パスワードのリセットでも初回の変更の要否を解き、コミットの後に無効化する', async () => {
    vi.mocked(prisma.passwordResetToken.findUnique).mockResolvedValue({
      id: 'reset-1',
      userId: USER_ID,
      token: 'reset-token',
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      createdAt: new Date(),
      usedAt: null,
    } as never);

    const result = await service.resetPassword('reset-token', NEW_PASSWORD);

    expect(result.ok).toBe(true);
    expect(txUserUpdate).toHaveBeenCalledWith({
      where: { id: USER_ID },
      data: { passwordHash: expect.any(String), mustChangePassword: false },
    });
    expect(invalidate).toHaveBeenCalledWith(USER_ID);
  });

  it('無効化の失敗はパスワード変更の結果を変えない（変更はコミット済み）', async () => {
    invalidate.mockRejectedValue(new Error('redis is down'));

    const result = await service.changePassword(USER_ID, CURRENT_PASSWORD, NEW_PASSWORD);

    expect(result.ok).toBe(true);
  });
});
