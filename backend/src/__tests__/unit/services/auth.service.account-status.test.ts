/**
 * @fileoverview ログインでの無効化の確認と最終ログイン日時の記録の単体テスト（タスク49.3）
 *
 * Requirements (user-authentication):
 * - REQ-36.2: 無効化された利用者のログインはパスワードの正否に関わらず通常の認証エラーと同じ結果で拒否する
 * - REQ-36.7: ログインの成功（トークンを発行した時点）で最終ログイン日時を記録する
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
import * as timingModule from '../../../utils/timing.js';

const findUnique = vi.fn();
const update = vi.fn();
const prisma = { user: { findUnique, update } } as unknown as PrismaClient;

const verifyPassword = vi.fn();
const passwordService = { verifyPassword } as unknown as PasswordService;
const tokenService = {
  generateAccessToken: vi.fn(async () => 'access-token'),
  verifyToken: vi.fn(),
} as unknown as TokenService;
const verifyTOTP = vi.fn();
const verifyBackupCode = vi.fn();
const twoFactorService = { verifyTOTP, verifyBackupCode } as unknown as TwoFactorService;
const createSession = vi.fn();
const rotate = vi.fn();
const sessionService = { createSession, rotate } as unknown as SessionService;
const issue = vi.fn();
const peek = vi.fn();
const consume = vi.fn();
const challengeService = { issue, peek, consume } as unknown as TwoFactorChallengeService;
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
  passwordHash: 'stored-hash',
  loginFailures: 0,
  isLocked: false,
  lockedUntil: null as Date | null,
  isActive: true,
  twoFactorEnabled: false,
  twoFactorFailures: 0,
  twoFactorLockedUntil: null,
  mustChangePassword: false,
  createdAt: new Date('2026-10-01T00:00:00Z'),
  userRoles: [{ role: { name: 'user' } }],
};

/** 更新の呼び出しのうち最終ログイン日時を書いたもの */
function lastLoginWrites(): unknown[] {
  return update.mock.calls.filter(
    ([args]) => (args as { data?: Record<string, unknown> }).data?.lastLoginAt !== undefined
  );
}

describe('AuthService のログインでの無効化の確認と最終ログイン日時の記録', () => {
  let delaySpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    update.mockResolvedValue({});
    createSession.mockResolvedValue({ refreshToken: 'refresh-token', familyId: 'family-1' });
    issue.mockResolvedValue(Ok({ challengeToken: 'challenge-1', expiresIn: 300 }));
    peek.mockResolvedValue(Ok({ userId: baseUser.id }));
    consume.mockResolvedValue(Ok(undefined));
    verifyTOTP.mockResolvedValue(Ok(true));
    verifyBackupCode.mockResolvedValue(Ok(true));
    getState.mockResolvedValue(
      Ok({ isActive: true, twoFactorEnabled: false, mustChangePassword: false })
    );
    delaySpy = vi.spyOn(timingModule, 'addTimingAttackDelay').mockResolvedValue(undefined);
  });

  describe('無効化された利用者のログイン（36.2）', () => {
    /**
     * @requirement user-authentication/REQ-36.2
     */
    it.each([
      ['2FA 未登録', false],
      ['2FA 登録済み', true],
    ])(
      '%s: 正しいパスワードでも、有効な利用者のパスワードの誤りと同じ結果で拒否し、トークンも資格も発行しない',
      async (_, twoFactorEnabled) => {
        // 対照: 有効な利用者のパスワードの誤り
        findUnique.mockResolvedValueOnce({ ...baseUser, twoFactorEnabled });
        verifyPassword.mockResolvedValueOnce(false);
        const wrongPassword = await createService().login(baseUser.email, 'wrong');

        vi.clearAllMocks();
        update.mockResolvedValue({});
        findUnique.mockResolvedValueOnce({ ...baseUser, twoFactorEnabled, isActive: false });
        verifyPassword.mockResolvedValue(true);
        const deactivated = await createService().login(baseUser.email, 'correct');

        expect(deactivated).toEqual(wrongPassword);
        expect(deactivated).toEqual({ ok: false, error: { type: 'INVALID_CREDENTIALS' } });
        expect(tokenService.generateAccessToken).not.toHaveBeenCalled();
        expect(createSession).not.toHaveBeenCalled();
        expect(issue).not.toHaveBeenCalled();
        // 失敗回数のリセットも最終ログイン日時の記録もしない
        expect(update).not.toHaveBeenCalled();
      }
    );

    /**
     * @requirement user-authentication/REQ-36.2
     */
    it('誤ったパスワードでも同じ結果で拒否し、ログイン失敗の回数を数えない（無効化はロックと別の状態）', async () => {
      findUnique.mockResolvedValueOnce({ ...baseUser, isActive: false });
      verifyPassword.mockResolvedValue(false);

      const result = await createService().login(baseUser.email, 'wrong');

      expect(result).toEqual({ ok: false, error: { type: 'INVALID_CREDENTIALS' } });
      expect(update).not.toHaveBeenCalled();
    });

    /**
     * @requirement user-authentication/REQ-36.2
     */
    it('ロック中でも ACCOUNT_LOCKED ではなく通常の認証エラーを返す（状態を推測させない）', async () => {
      findUnique.mockResolvedValueOnce({
        ...baseUser,
        isActive: false,
        isLocked: true,
        lockedUntil: new Date(Date.now() + 60_000),
      });
      verifyPassword.mockResolvedValue(true);

      const result = await createService().login(baseUser.email, 'correct');

      expect(result).toEqual({ ok: false, error: { type: 'INVALID_CREDENTIALS' } });
    });

    /**
     * @requirement user-authentication/REQ-36.2
     */
    it('応答時間をパスワードの誤りとそろえるため、パスワードのハッシュの照合と遅延を同じく行う', async () => {
      findUnique.mockResolvedValueOnce({ ...baseUser, isActive: false });
      verifyPassword.mockResolvedValue(true);

      await createService().login(baseUser.email, 'correct');

      expect(verifyPassword).toHaveBeenCalledWith('correct', baseUser.passwordHash);
      expect(delaySpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('2FA の検証の時点で無効化されている利用者（36.2）', () => {
    /**
     * @requirement user-authentication/REQ-36.2
     */
    it.each([
      ['TOTP', { kind: 'totp', code: '123456' } as const],
      ['バックアップコード', { kind: 'backup', backupCode: 'ABCD1234' } as const],
    ])(
      '%s: パスワードの段階の後に無効化された利用者は資格の不正と同じ CHALLENGE_INVALID で拒否し、コードを検証せず失敗も数えない',
      async (_, proof) => {
        findUnique.mockResolvedValueOnce({ ...baseUser, twoFactorEnabled: true, isActive: false });

        const result = await createService().completeTwoFactorLogin('challenge-1', proof);

        expect(result).toEqual({ ok: false, error: { type: 'CHALLENGE_INVALID' } });
        expect(verifyTOTP).not.toHaveBeenCalled();
        expect(verifyBackupCode).not.toHaveBeenCalled();
        expect(consume).not.toHaveBeenCalled();
        expect(createSession).not.toHaveBeenCalled();
        expect(update).not.toHaveBeenCalled();
      }
    );
  });

  describe('最終ログイン日時の記録（36.7）', () => {
    /**
     * @requirement user-authentication/REQ-36.7
     */
    it('2FA 未登録の利用者のログインの成功で、トークンを発行するとともに最終ログイン日時を記録する', async () => {
      findUnique.mockResolvedValueOnce({ ...baseUser });
      verifyPassword.mockResolvedValue(true);
      const before = Date.now();

      const result = await createService().login(baseUser.email, 'correct');

      expect(result.ok && result.value.type).toBe('SUCCESS');
      const writes = lastLoginWrites();
      expect(writes).toHaveLength(1);
      const [args] = writes[0] as [{ where: { id: string }; data: { lastLoginAt: Date } }];
      expect(args.where).toEqual({ id: baseUser.id });
      expect(args.data.lastLoginAt).toBeInstanceOf(Date);
      expect(args.data.lastLoginAt.getTime()).toBeGreaterThanOrEqual(before);
      expect(args.data.lastLoginAt.getTime()).toBeLessThanOrEqual(Date.now());
    });

    /**
     * @requirement user-authentication/REQ-36.7
     */
    it('2FA 登録済みの利用者はパスワードの段階（資格の発行）では記録しない', async () => {
      findUnique.mockResolvedValueOnce({ ...baseUser, twoFactorEnabled: true });
      verifyPassword.mockResolvedValue(true);

      const result = await createService().login(baseUser.email, 'correct');

      expect(result.ok && result.value.type).toBe('2FA_REQUIRED');
      expect(lastLoginWrites()).toHaveLength(0);
    });

    /**
     * @requirement user-authentication/REQ-36.7
     */
    it.each([
      ['TOTP', { kind: 'totp', code: '123456' } as const],
      ['バックアップコード', { kind: 'backup', backupCode: 'ABCD1234' } as const],
    ])('%s: 2FA の検証の成功で最終ログイン日時を記録する', async (_, proof) => {
      findUnique.mockResolvedValueOnce({ ...baseUser, twoFactorEnabled: true });
      const before = Date.now();

      const result = await createService().completeTwoFactorLogin('challenge-1', proof);

      expect(result.ok).toBe(true);
      const writes = lastLoginWrites();
      expect(writes).toHaveLength(1);
      const [args] = writes[0] as [{ where: { id: string }; data: { lastLoginAt: Date } }];
      expect(args.where).toEqual({ id: baseUser.id });
      expect(args.data.lastLoginAt.getTime()).toBeGreaterThanOrEqual(before);
    });

    /**
     * @requirement user-authentication/REQ-36.7
     */
    it('パスワードの誤り・2FA のコードの誤りでは記録しない', async () => {
      findUnique.mockResolvedValueOnce({ ...baseUser });
      verifyPassword.mockResolvedValue(false);
      await createService().login(baseUser.email, 'wrong');

      findUnique.mockResolvedValueOnce({ ...baseUser, twoFactorEnabled: true });
      verifyTOTP.mockResolvedValue(Ok(false));
      await createService().completeTwoFactorLogin('challenge-1', { kind: 'totp', code: '000000' });

      expect(lastLoginWrites()).toHaveLength(0);
    });

    /**
     * @requirement user-authentication/REQ-36.7
     */
    it('リフレッシュはログインではないため記録しない', async () => {
      (tokenService.verifyToken as ReturnType<typeof vi.fn>).mockResolvedValue(
        Ok({ userId: baseUser.id, email: baseUser.email, roles: ['user'] })
      );
      rotate.mockResolvedValue(Ok({ userId: baseUser.id, refreshToken: 'rotated' }));
      findUnique.mockResolvedValue({ ...baseUser });

      const result = await createService().refreshToken('refresh-token');

      expect(result.ok).toBe(true);
      expect(lastLoginWrites()).toHaveLength(0);
    });
  });
});
