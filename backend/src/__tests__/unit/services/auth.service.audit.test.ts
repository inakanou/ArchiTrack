/**
 * @fileoverview 認証の監査の記録の失敗がログイン・ログアウトの結果を変えないことの単体テスト（user-authentication タスク53.1）
 *
 * Requirements (user-authentication):
 * - REQ-40.1: ログインの成功と失敗の監査の記録（記録の失敗は結果を変えずエラー監視へ送る）
 * - REQ-40.3: 2FA 検証の成功と失敗の監査の記録
 * - REQ-40.4: ログアウトと全デバイスのログアウトの監査の記録
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../../utils/sentry.js', () => ({
  captureException: vi.fn(),
}));
vi.mock('../../../utils/timing.js', () => ({
  addTimingAttackDelay: vi.fn().mockResolvedValue(undefined),
}));

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
import { captureException } from '../../../utils/sentry.js';

const CTX = { ipAddress: '198.51.100.7', userAgent: 'audit-unit-test' };

const baseUser = {
  id: 'user-1',
  email: 'audit@example.com',
  passwordHash: 'hash',
  displayName: '監査',
  loginFailures: 0,
  isLocked: false,
  lockedUntil: null,
  isActive: true,
  twoFactorEnabled: false,
  mustChangePassword: false,
  accessTokenGeneration: 0,
  twoFactorFailures: 0,
  twoFactorLockedUntil: null,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  userRoles: [{ role: { name: 'user' } }],
};

describe('AuthService の認証の監査', () => {
  const auditCreate = vi.fn();
  const prisma = {
    user: { findUnique: vi.fn(), update: vi.fn() },
    auditLog: { create: auditCreate },
  } as unknown as PrismaClient;
  const passwordService = { verifyPassword: vi.fn() } as unknown as PasswordService;
  const tokenService = {
    generateAccessToken: vi.fn().mockResolvedValue('access-token'),
  } as unknown as TokenService;
  const twoFactorService = {
    verifyTOTP: vi.fn(),
    verifyBackupCode: vi.fn(),
  } as unknown as TwoFactorService;
  const sessionService = {
    createSession: vi.fn().mockResolvedValue({ refreshToken: 'refresh-token' }),
    revokeByToken: vi.fn().mockResolvedValue(undefined),
    revokeAllForUser: vi.fn().mockResolvedValue(undefined),
  } as unknown as SessionService;
  const challengeService = {
    issue: vi.fn(),
    peek: vi.fn(),
    consume: vi.fn(),
  } as unknown as TwoFactorChallengeService;

  function createService(): AuthService {
    return new AuthService(
      prisma,
      {} as InvitationService,
      passwordService,
      tokenService,
      twoFactorService,
      sessionService,
      challengeService,
      {} as AuthenticatedUserStateService
    );
  }

  function recordedActions(): string[] {
    return auditCreate.mock.calls.map(([arg]) => (arg as { data: { action: string } }).data.action);
  }

  beforeEach(() => {
    vi.clearAllMocks();
    auditCreate.mockResolvedValue({});
    vi.mocked(prisma.user.update).mockResolvedValue({} as never);
    vi.mocked(challengeService.consume).mockResolvedValue(Ok(undefined));
    vi.mocked(tokenService.generateAccessToken).mockResolvedValue('access-token');
    vi.mocked(sessionService.createSession).mockResolvedValue({
      refreshToken: 'refresh-token',
    } as never);
  });

  /**
   * @requirement user-authentication/REQ-40.1
   */
  it('ログインの成功の監査を送信元 IP とユーザーエージェントとともに書き、書き込みの失敗はログインの成功を変えずエラー監視へ送る', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(baseUser as never);
    vi.mocked(passwordService.verifyPassword).mockResolvedValue(true);
    auditCreate.mockRejectedValue(new Error('audit write failed'));

    const result = await createService().login(baseUser.email, 'correct', CTX);

    expect(result.ok).toBe(true);
    expect(result.ok && result.value.type).toBe('SUCCESS');
    expect(auditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'LOGIN_SUCCESS',
        actorId: baseUser.id,
        actorEmail: baseUser.email,
        metadata: expect.objectContaining({
          result: 'success',
          email: baseUser.email,
          ipAddress: CTX.ipAddress,
          userAgent: CTX.userAgent,
        }),
      }),
    });
    expect(captureException).toHaveBeenCalledTimes(1);
    expect(vi.mocked(captureException).mock.calls[0]![0]).toBeInstanceOf(Error);
  });

  /**
   * @requirement user-authentication/REQ-40.1
   */
  it.each([
    ['存在しないメールアドレス', null, 'unknown_email'],
    ['パスワードの誤り', baseUser, 'invalid_password'],
  ])(
    '%s: 書き込みの失敗はログインの失敗の結果（INVALID_CREDENTIALS）を変えずエラー監視へ送る',
    async (_, user, reason) => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(user as never);
      vi.mocked(passwordService.verifyPassword).mockResolvedValue(false);
      auditCreate.mockRejectedValue(new Error('audit write failed'));

      const result = await createService().login('audit@example.com', 'wrong', CTX);

      expect(result).toEqual({ ok: false, error: { type: 'INVALID_CREDENTIALS' } });
      expect(auditCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'LOGIN_FAILED',
          actorId: null,
          metadata: expect.objectContaining({ result: 'failure', reason }),
        }),
      });
      expect(captureException).toHaveBeenCalledTimes(1);
    }
  );

  /**
   * @requirement user-authentication/REQ-40.3
   */
  it('2FA の検証の成功の書き込みの失敗はトークンの発行を変えずエラー監視へ送る', async () => {
    vi.mocked(challengeService.peek).mockResolvedValue(Ok({ userId: baseUser.id }));
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      ...baseUser,
      twoFactorEnabled: true,
    } as never);
    vi.mocked(twoFactorService.verifyTOTP).mockResolvedValue(Ok(true));
    auditCreate.mockRejectedValue(new Error('audit write failed'));

    const result = await createService().completeTwoFactorLogin(
      'challenge',
      { kind: 'totp', code: '123456' },
      CTX
    );

    expect(result.ok).toBe(true);
    expect(recordedActions()).toEqual(['TWO_FACTOR_VERIFIED', 'LOGIN_SUCCESS']);
    expect(captureException).toHaveBeenCalledTimes(2);
  });

  /**
   * @requirement user-authentication/REQ-40.4
   */
  it('ログアウトと全デバイスのログアウトの書き込みの失敗は成功を変えずエラー監視へ送る', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      email: baseUser.email,
      displayName: baseUser.displayName,
    } as never);
    auditCreate.mockRejectedValue(new Error('audit write failed'));
    const service = createService();

    expect(await service.logout(baseUser.id, 'refresh-token', CTX)).toEqual({
      ok: true,
      value: undefined,
    });
    expect(await service.logoutAll(baseUser.id, CTX)).toEqual({ ok: true, value: undefined });

    expect(recordedActions()).toEqual(['LOGOUT', 'LOGOUT_ALL']);
    expect(captureException).toHaveBeenCalledTimes(2);
  });
});
