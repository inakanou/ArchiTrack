/**
 * @fileoverview AuthService のプロフィール更新の楽観的ロックの単体検証
 *
 * updateProfileIfUnchanged は条件付きの更新（updateMany の where に updatedAt）で競合を検出し、
 * 0 件のときは読み直して不在（USER_NOT_FOUND）と競合（PROFILE_CONFLICT）を区別する。
 * getCurrentUser は版を送り返せるよう updatedAt を返す。
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AuthService } from '../../../services/auth.service.js';
import type { InvitationService } from '../../../services/invitation.service.js';
import type { PasswordService } from '../../../services/password.service.js';
import type { TokenService } from '../../../services/token.service.js';
import type { TwoFactorService } from '../../../services/two-factor.service.js';
import type { SessionService } from '../../../services/session.service.js';
import type { PrismaClient } from '../../../generated/prisma/client.js';
import { Ok, Err } from '../../../types/result.js';

const userId = 'user-1';
const expected = new Date('2026-09-27T01:00:00.000Z');
const actual = new Date('2026-09-27T01:00:05.000Z');

describe('AuthService のプロフィール更新の楽観的ロック', () => {
  let prisma: {
    user: {
      update: ReturnType<typeof vi.fn>;
      updateMany: ReturnType<typeof vi.fn>;
      findUnique: ReturnType<typeof vi.fn>;
    };
  };
  let service: AuthService;

  beforeEach(() => {
    prisma = { user: { update: vi.fn(), updateMany: vi.fn(), findUnique: vi.fn() } };
    service = new AuthService(
      prisma as unknown as PrismaClient,
      {} as unknown as InvitationService,
      {} as unknown as PasswordService,
      {} as unknown as TokenService,
      {} as unknown as TwoFactorService,
      {} as unknown as SessionService
    );
  });

  /**
   * @requirement user-authentication/REQ-25.8
   */
  it('版が一致すれば updatedAt を条件に含めて更新し、成功を返す', async () => {
    prisma.user.updateMany.mockResolvedValue({ count: 1 });

    const result = await service.updateProfileIfUnchanged(userId, { displayName: 'N' }, expected);

    expect(result).toEqual(Ok(undefined));
    expect(prisma.user.updateMany).toHaveBeenCalledWith({
      where: { id: userId, updatedAt: expected },
      data: { displayName: 'N' },
    });
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  /**
   * @requirement user-authentication/REQ-25.8
   */
  it('条件に合う行が無く、ユーザーが残っていれば PROFILE_CONFLICT（期待と実際の版）を返す', async () => {
    prisma.user.updateMany.mockResolvedValue({ count: 0 });
    prisma.user.findUnique.mockResolvedValue({ updatedAt: actual });

    const result = await service.updateProfileIfUnchanged(userId, { displayName: 'N' }, expected);

    expect(result).toEqual(
      Err({ type: 'PROFILE_CONFLICT', expectedUpdatedAt: expected, actualUpdatedAt: actual })
    );
  });

  /**
   * @requirement user-authentication/REQ-25.8
   */
  it('条件に合う行が無く、ユーザーも無ければ USER_NOT_FOUND を返す', async () => {
    prisma.user.updateMany.mockResolvedValue({ count: 0 });
    prisma.user.findUnique.mockResolvedValue(null);

    const result = await service.updateProfileIfUnchanged(userId, { displayName: 'N' }, expected);

    expect(result).toEqual(Err({ type: 'USER_NOT_FOUND' }));
  });

  /**
   * @requirement user-authentication/REQ-25.8
   */
  it('getCurrentUser は版として送り返す updatedAt を返す', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: userId,
      email: 'u@example.com',
      displayName: 'U',
      createdAt: expected,
      updatedAt: actual,
      twoFactorEnabled: false,
      userRoles: [],
    });

    const result = await service.getCurrentUser(userId);

    expect(result.ok && result.value.updatedAt).toEqual(actual);
    expect(prisma.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ select: expect.objectContaining({ updatedAt: true }) })
    );
  });
});
