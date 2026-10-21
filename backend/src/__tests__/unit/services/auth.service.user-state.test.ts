/**
 * @fileoverview AuthService が応答に載せる利用者の状態の単体テスト（タスク47.5）
 *
 * ログイン・2FA の検証・リフレッシュの応答の利用者に初回のパスワード変更の要否が載ること、
 * `getCurrentUser` と `getAuthUserView` が状態を AuthenticatedUserStateService から読むことを確かめる。
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AuthService } from '../../../services/auth.service.js';
import type { InvitationService } from '../../../services/invitation.service.js';
import type { PasswordService } from '../../../services/password.service.js';
import type { TokenService } from '../../../services/token.service.js';
import type { TwoFactorService } from '../../../services/two-factor.service.js';
import type { SessionService } from '../../../services/session.service.js';
import type { TwoFactorChallengeService } from '../../../services/two-factor-challenge.service.js';
import type { AuthenticatedUserStateService } from '../../../services/authenticated-user-state.service.js';
import type { PrismaClient } from '../../../generated/prisma/client.js';
import { Ok } from '../../../types/result.js';

const findUnique = vi.fn();
const update = vi.fn();
const prisma = { user: { findUnique, update } } as unknown as PrismaClient;

const passwordService = { verifyPassword: vi.fn() } as unknown as PasswordService;
const tokenService = {
  generateAccessToken: vi.fn(async () => 'access-token'),
  verifyToken: vi.fn(),
} as unknown as TokenService;
const twoFactorService = { verifyTOTP: vi.fn() } as unknown as TwoFactorService;
const sessionService = {
  createSession: vi.fn(async () => ({ refreshToken: 'refresh-token' })),
  rotate: vi.fn(),
} as unknown as SessionService;
const challengeService = {
  issue: vi.fn(),
  peek: vi.fn(),
  consume: vi.fn(async () => Ok(undefined)),
} as unknown as TwoFactorChallengeService;
const getState = vi.fn();
const userStateService = {
  getState,
  invalidate: vi.fn(),
} as unknown as AuthenticatedUserStateService;

function createService(): AuthService {
  return new AuthService(
    prisma,
    {} as InvitationService,
    passwordService,
    tokenService,
    twoFactorService,
    sessionService,
    challengeService,
    userStateService
  );
}

const baseUser = {
  id: 'user-1',
  email: 'user@example.com',
  displayName: 'User',
  passwordHash: 'hash',
  loginFailures: 0,
  isLocked: false,
  lockedUntil: null,
  twoFactorEnabled: false,
  twoFactorFailures: 0,
  twoFactorLockedUntil: null,
  mustChangePassword: true,
  createdAt: new Date('2026-10-01T00:00:00Z'),
  updatedAt: new Date('2026-10-02T00:00:00Z'),
  userRoles: [{ role: { name: 'user', rolePermissions: [] } }],
};

describe('AuthService の応答の利用者の状態', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    update.mockResolvedValue(baseUser);
  });

  it('2FA 未登録の利用者のログインの応答は初回のパスワード変更の要否を載せる', async () => {
    findUnique.mockResolvedValue(baseUser);
    vi.mocked(passwordService.verifyPassword).mockResolvedValue(true);

    const result = await createService().login('user@example.com', 'pw');

    expect(result.ok).toBe(true);
    if (result.ok && result.value.type === 'SUCCESS') {
      expect(result.value.user).toMatchObject({
        twoFactorEnabled: false,
        mustChangePassword: true,
      });
    } else {
      throw new Error('ログインがトークンを返さなかった');
    }
    expect(findUnique.mock.calls[0]![0].select).toMatchObject({ mustChangePassword: true });
  });

  it('2FA の検証の応答は初回のパスワード変更の要否を載せる', async () => {
    findUnique.mockResolvedValue({ ...baseUser, twoFactorEnabled: true });
    vi.mocked(challengeService.peek).mockResolvedValue(Ok({ userId: 'user-1' }));
    vi.mocked(twoFactorService.verifyTOTP).mockResolvedValue(Ok(true));

    const result = await createService().completeTwoFactorLogin('challenge', {
      kind: 'totp',
      code: '123456',
    });

    expect(result.ok && result.value.user).toMatchObject({
      twoFactorEnabled: true,
      mustChangePassword: true,
    });
    expect(findUnique.mock.calls[0]![0].select).toMatchObject({ mustChangePassword: true });
  });

  it('リフレッシュの応答は初回のパスワード変更の要否を載せる', async () => {
    findUnique.mockResolvedValue(baseUser);
    vi.mocked(tokenService.verifyToken).mockResolvedValue(
      Ok({ userId: 'user-1', email: 'user@example.com', roles: ['user'] })
    );
    vi.mocked(sessionService.rotate).mockResolvedValue(
      Ok({ userId: 'user-1', refreshToken: 'next' }) as never
    );

    const result = await createService().refreshToken('refresh-token');

    expect(result.ok && result.value.user).toMatchObject({ mustChangePassword: true });
  });

  /**
   * 無効化された利用者のリフレッシュは拒否する（要件36.1。design.md「利用者の状態の照合」の Deactivated は
   * ログイン・リフレッシュも拒否する）。ローテーションの前に拒否し、後継のトークンを作らない（タスク47.6）
   * @requirement user-authentication/REQ-36.1
   */
  it('無効化された利用者のリフレッシュは ACCOUNT_DISABLED で拒否し、ローテーションしない', async () => {
    findUnique.mockResolvedValue({ ...baseUser, isActive: false });
    vi.mocked(tokenService.verifyToken).mockResolvedValue(
      Ok({ userId: 'user-1', email: 'user@example.com', roles: ['user'] })
    );

    const result = await createService().refreshToken('refresh-token');

    expect(!result.ok && result.error).toEqual({ type: 'ACCOUNT_DISABLED' });
    expect(sessionService.rotate).not.toHaveBeenCalled();
    expect(tokenService.generateAccessToken).not.toHaveBeenCalled();
  });

  it('getCurrentUser は 2FA の登録と初回の変更の要否を状態の取得から読む', async () => {
    findUnique.mockResolvedValue({
      ...baseUser,
      twoFactorEnabled: false,
      mustChangePassword: false,
    });
    getState.mockResolvedValue({
      isActive: true,
      twoFactorEnabled: true,
      mustChangePassword: true,
    });

    const result = await createService().getCurrentUser('user-1');

    expect(getState).toHaveBeenCalledWith('user-1');
    expect(result.ok && result.value).toMatchObject({
      twoFactorEnabled: true,
      mustChangePassword: true,
    });
  });

  it('getCurrentUser は状態の取得が利用者の不在を返せば USER_NOT_FOUND を返す', async () => {
    findUnique.mockResolvedValue(baseUser);
    getState.mockResolvedValue(null);

    const result = await createService().getCurrentUser('user-1');

    expect(!result.ok && result.error.type).toBe('USER_NOT_FOUND');
  });

  describe('getAuthUserView', () => {
    it('利用者と、状態の取得から読んだ状態を返す', async () => {
      findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'user@example.com',
        displayName: 'User',
        userRoles: [{ role: { name: 'user' } }, { role: { name: 'admin' } }],
      });
      getState.mockResolvedValue({
        isActive: true,
        twoFactorEnabled: true,
        mustChangePassword: false,
      });

      const result = await createService().getAuthUserView('user-1');

      expect(result).toEqual(
        Ok({
          id: 'user-1',
          email: 'user@example.com',
          displayName: 'User',
          roles: ['user', 'admin'],
          twoFactorEnabled: true,
          mustChangePassword: false,
        })
      );
    });

    it('利用者が無ければ USER_NOT_FOUND を返し、状態を読まない', async () => {
      findUnique.mockResolvedValue(null);

      const result = await createService().getAuthUserView('user-1');

      expect(!result.ok && result.error.type).toBe('USER_NOT_FOUND');
      expect(getState).not.toHaveBeenCalled();
    });

    it('状態の取得が利用者の不在を返せば USER_NOT_FOUND を返す', async () => {
      findUnique.mockResolvedValue({ ...baseUser, userRoles: [] });
      getState.mockResolvedValue(null);

      const result = await createService().getAuthUserView('user-1');

      expect(!result.ok && result.error.type).toBe('USER_NOT_FOUND');
    });

    it('DB の失敗は DATABASE_ERROR を返す', async () => {
      findUnique.mockRejectedValue(new Error('db down'));

      const result = await createService().getAuthUserView('user-1');

      expect(result.ok).toBe(false);
      expect(!result.ok && result.error).toEqual({ type: 'DATABASE_ERROR', message: 'db down' });
    });

    it('DB の失敗が Error でなくても DATABASE_ERROR を返す', async () => {
      findUnique.mockRejectedValue('boom');

      const result = await createService().getAuthUserView('user-1');

      expect(!result.ok && result.error).toEqual({
        type: 'DATABASE_ERROR',
        message: 'Unknown error',
      });
    });
  });
});
