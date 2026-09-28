/**
 * @fileoverview パスワードと二要素認証の経路が DB 接続のタイムアウトを自前のエラーへ飲み込まず投げ直すことの単体検証（タスク36.3）
 *
 * 対象は PasswordService の catch（3 か所）、TwoFactorService の catch（7 か所）と、
 * AuthService の 2FA のログインの検証（TOTP・バックアップコード）で失敗回数を加算する経路。
 * - 接続のタイムアウト（pg-pool の素の Error、P1008）は同じエラーのまま投げ直す
 * - それ以外の DB 例外（一般の Error、P1001）はこれまでどおり各サービスの自前のエラーを返す
 * - 2FA のログインの検証は、検証の途中の接続のタイムアウトで失敗回数を加算しない
 * - 対話型トランザクション（6 か所）は、接続の再試行の予算を覆う maxWait を渡す（タスク35.12 と同じ）。
 *   先行の問い合わせの後に接続が失われると、トランザクションの開始が新しい接続の確立を待ち、
 *   Prisma の既定の maxWait（2000ms）が先に切れて P2028 になるため
 *
 * 実エンドポイントが 503 を返すことは統合検証
 * （password-two-factor-db-connection-timeout-503.integration.test.ts）で確かめる。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Prisma, type PrismaClient } from '../../../generated/prisma/client.js';
import { PasswordService } from '../../../services/password.service.js';
import { TwoFactorService } from '../../../services/two-factor.service.js';
import { AuthService } from '../../../services/auth.service.js';
import type { EmailService } from '../../../services/email.service.js';
import type { InvitationService } from '../../../services/invitation.service.js';
import type { SessionService } from '../../../services/session.service.js';
import type { TokenService } from '../../../services/token.service.js';
import type { IAuditLogService } from '../../../types/audit-log.types.js';
import { Ok } from '../../../types/result.js';
import { connectBudgetTransactionOptions } from '../../../utils/db-connect-budget.js';

vi.mock('../../../utils/sentry.js', () => ({
  captureException: vi.fn(),
  addBreadcrumb: vi.fn(),
}));

/** TwoFactorService はコンストラクタで getPrismaClient を呼ぶため、呼ばれた時点の代役を返す */
let currentPrisma: PrismaClient;
vi.mock('../../../db.js', () => ({
  default: () => currentPrisma,
}));

/** 再試行を使い切った pg-pool の接続タイムアウト（Prisma から素の Error として届く） */
const poolConnectionTimeout = () => new Error('Connection terminated due to connection timeout');

/** @prisma/adapter-pg が SocketTimeout へ包んだ ETIMEDOUT を Prisma が変換したもの */
const p1008 = () =>
  new Prisma.PrismaClientKnownRequestError('Operations timed out', {
    code: 'P1008',
    clientVersion: 'test',
  });

/** 接続のタイムアウトではない DB 例外（接続拒否） */
const p1001 = () =>
  new Prisma.PrismaClientKnownRequestError("Can't reach database server", {
    code: 'P1001',
    clientVersion: 'test',
  });

/** 投げ直すべき接続のタイムアウト */
const timeouts: Array<[string, () => unknown]> = [
  ['pg-pool の接続タイムアウト', poolConnectionTimeout],
  ['P1008', p1008],
];

/** これまでどおり自前のエラーへ変える DB 例外 */
const nonTimeouts: Array<[string, () => unknown]> = [
  ['一般の Error', () => new Error('Database connection failed')],
  ['P1001', p1001],
];

/**
 * すべてのモデル操作と $transaction が同じエラーで失敗する PrismaClient の代役
 */
function rejectingPrisma(error: unknown): PrismaClient {
  const delegate = new Proxy(
    {},
    {
      get: (_target, prop) => (prop === 'then' ? undefined : vi.fn().mockRejectedValue(error)),
    }
  );
  return new Proxy(
    {},
    {
      get: (_target, prop) => {
        if (prop === 'then') {
          return undefined;
        }
        if (prop === '$transaction') {
          return vi.fn().mockRejectedValue(error);
        }
        return delegate;
      },
    }
  ) as unknown as PrismaClient;
}

/**
 * 開始前の問い合わせは成り立ち、$transaction（対話型・配列のどちらも）だけが失敗する PrismaClient の代役
 */
function transactionRejectingPrisma(error: unknown, found: Record<string, unknown>): PrismaClient {
  return {
    user: {
      findUnique: vi.fn().mockResolvedValue(found.user ?? null),
      update: vi.fn().mockResolvedValue({}),
    },
    passwordResetToken: {
      findUnique: vi.fn().mockResolvedValue(found.passwordResetToken ?? null),
    },
    passwordHistory: { findMany: vi.fn().mockResolvedValue([]) },
    twoFactorBackupCode: {
      findMany: vi.fn().mockResolvedValue([]),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    refreshToken: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
    $transaction: vi.fn().mockRejectedValue(error),
  } as unknown as PrismaClient;
}

function passwordService(prisma: PrismaClient): PasswordService {
  const service = new PasswordService(
    prisma,
    { sendPasswordResetEmail: vi.fn() } as unknown as EmailService,
    { createLog: vi.fn() } as unknown as IAuditLogService
  );
  // Argon2id のハッシュ化と検証は本検証の関心の外のため、結果だけを与える
  vi.spyOn(service, 'hashPassword').mockResolvedValue('new-hash');
  vi.spyOn(service, 'verifyPassword').mockResolvedValue(true);
  return service;
}

function twoFactorService(prisma: PrismaClient): TwoFactorService {
  currentPrisma = prisma;
  return new TwoFactorService();
}

const NEW_PASSWORD = 'Str0ng!Passphrase-2026';

/** DB 例外を自前のエラーへ変える catch へ、最初の問い合わせで到達する呼び出しと、その自前のエラー */
const firstQueryCases: Array<[string, (prisma: PrismaClient) => Promise<unknown>, string]> = [
  [
    'PasswordService.requestPasswordReset',
    (p) => passwordService(p).requestPasswordReset('user@example.com'),
    'RESET_TOKEN_INVALID',
  ],
  [
    'PasswordService.resetPassword',
    (p) => passwordService(p).resetPassword('reset-token', NEW_PASSWORD),
    'RESET_TOKEN_INVALID',
  ],
  [
    'PasswordService.changePassword',
    (p) => passwordService(p).changePassword('user-1', 'current-password', NEW_PASSWORD),
    'RESET_TOKEN_INVALID',
  ],
  [
    'TwoFactorService.setupTwoFactor',
    (p) => twoFactorService(p).setupTwoFactor('user-1'),
    'USER_NOT_FOUND',
  ],
  [
    'TwoFactorService.verifyTOTP',
    (p) => twoFactorService(p).verifyTOTP('user-1', '000000'),
    'INVALID_TOTP_CODE',
  ],
  [
    'TwoFactorService.verifyBackupCode',
    (p) => twoFactorService(p).verifyBackupCode('user-1', 'ZZZZ9999'),
    'INVALID_BACKUP_CODE',
  ],
  [
    'TwoFactorService.enableTwoFactor',
    (p) => twoFactorService(p).enableTwoFactor('user-1', '000000'),
    'INVALID_TOTP_CODE',
  ],
  [
    'TwoFactorService.disableTwoFactor',
    (p) => twoFactorService(p).disableTwoFactor('user-1', 'password'),
    'INVALID_PASSWORD',
  ],
  [
    'TwoFactorService.getBackupCodesStatus',
    (p) => twoFactorService(p).getBackupCodesStatus('user-1'),
    'USER_NOT_FOUND',
  ],
  [
    'TwoFactorService.regenerateBackupCodes',
    (p) => twoFactorService(p).regenerateBackupCodes('user-1'),
    'USER_NOT_FOUND',
  ],
];

/** 開始前の問い合わせが成り立った後、トランザクションの失敗で同じ catch へ到達する呼び出し */
const transactionCases: Array<
  [string, (prisma: PrismaClient) => Promise<unknown>, Record<string, unknown>, string]
> = [
  [
    'PasswordService.requestPasswordReset',
    (p) => passwordService(p).requestPasswordReset('user@example.com'),
    { user: { id: 'user-1', email: 'user@example.com' } },
    'RESET_TOKEN_INVALID',
  ],
  [
    'PasswordService.resetPassword',
    (p) => passwordService(p).resetPassword('reset-token', NEW_PASSWORD),
    {
      passwordResetToken: {
        id: 'token-1',
        userId: 'user-1',
        usedAt: null,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    },
    'RESET_TOKEN_INVALID',
  ],
  [
    'PasswordService.changePassword',
    (p) => passwordService(p).changePassword('user-1', 'current-password', NEW_PASSWORD),
    { user: { id: 'user-1', passwordHash: 'current-hash' } },
    'RESET_TOKEN_INVALID',
  ],
  [
    'TwoFactorService.setupTwoFactor',
    (p) => twoFactorService(p).setupTwoFactor('user-1'),
    {
      user: {
        id: 'user-1',
        email: 'user@example.com',
        twoFactorEnabled: false,
        twoFactorSecret: null,
      },
    },
    'USER_NOT_FOUND',
  ],
  [
    'TwoFactorService.enableTwoFactor',
    // NODE_ENV が production でないとき固定コード 123456 を受け入れ、トランザクションへ進む
    (p) => twoFactorService(p).enableTwoFactor('user-1', '123456'),
    { user: { twoFactorEnabled: false, twoFactorSecret: 'encrypted' } },
    'INVALID_TOTP_CODE',
  ],
  [
    'TwoFactorService.regenerateBackupCodes',
    (p) => twoFactorService(p).regenerateBackupCodes('user-1'),
    { user: { twoFactorEnabled: true } },
    'USER_NOT_FOUND',
  ],
];

beforeEach(() => {
  vi.clearAllMocks();
  process.env.TWO_FACTOR_ENCRYPTION_KEY =
    'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789';
});

describe('パスワードと二要素認証のサービスは DB 接続のタイムアウトを自前のエラーへ飲み込まない（タスク36.3）', () => {
  describe.each(firstQueryCases)('%s（最初の問い合わせ）', (_name, invoke, ownError) => {
    it.each(timeouts)('%s を同じエラーのまま投げ直す', async (_label, make) => {
      const error = make();
      await expect(invoke(rejectingPrisma(error))).rejects.toBe(error);
    });

    it.each(nonTimeouts)('%s はこれまでどおり自前のエラーを返す', async (_label, make) => {
      await expect(invoke(rejectingPrisma(make()))).resolves.toEqual({
        ok: false,
        error: { type: ownError },
      });
    });
  });

  describe.each(transactionCases)('%s（トランザクション）', (_name, invoke, found, ownError) => {
    it.each(timeouts)('%s を同じエラーのまま投げ直す', async (_label, make) => {
      const error = make();
      await expect(invoke(transactionRejectingPrisma(error, found))).rejects.toBe(error);
    });

    it('一般の Error はこれまでどおり自前のエラーを返す', async () => {
      await expect(
        invoke(transactionRejectingPrisma(new Error('Database connection failed'), found))
      ).resolves.toEqual({ ok: false, error: { type: ownError } });
    });

    it('接続の再試行の予算を覆う maxWait を渡す（開始の待ちが P2028 で先に切れないように）', async () => {
      const prisma = transactionRejectingPrisma(poolConnectionTimeout(), found);
      await invoke(prisma).catch(() => undefined);

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.$transaction).toHaveBeenCalledWith(
        expect.any(Function),
        connectBudgetTransactionOptions()
      );
      expect(connectBudgetTransactionOptions().maxWait).toBeGreaterThan(2000);
    });
  });

  describe('TwoFactorService.disableTwoFactor（配列のトランザクション）', () => {
    it('パスワードの確認の後の接続のタイムアウトを同じエラーのまま投げ直す', async () => {
      const { hash } = await import('@node-rs/argon2');
      const passwordHash = await hash('password');
      const error = poolConnectionTimeout();
      const prisma = transactionRejectingPrisma(error, {
        user: { twoFactorEnabled: true, passwordHash },
      });
      await expect(twoFactorService(prisma).disableTwoFactor('user-1', 'password')).rejects.toBe(
        error
      );
    });
  });
});

/** 2FA のログインの検証で使う、ロックされていないユーザー */
const twoFactorUser = {
  id: 'user-1',
  email: 'user@example.com',
  displayName: 'User',
  createdAt: new Date('2026-01-01T00:00:00Z'),
  twoFactorEnabled: true,
  twoFactorFailures: 2,
  twoFactorLockedUntil: null,
  userRoles: [],
};

function authServiceWith(prisma: PrismaClient, twoFactor: TwoFactorService): AuthService {
  return new AuthService(
    prisma,
    {} as InvitationService,
    {} as PasswordService,
    {} as TokenService,
    twoFactor,
    {} as SessionService
  );
}

/**
 * verify2FA / verify2FABackupCode の最初のユーザーの取得は成り立ち、
 * TwoFactorService の検証の中のユーザーの取得（2 回目）が失敗する PrismaClient の代役
 */
function failingOnVerificationPrisma(error: unknown): PrismaClient {
  return {
    user: {
      findUnique: vi.fn().mockResolvedValueOnce(twoFactorUser).mockRejectedValueOnce(error),
      update: vi.fn().mockResolvedValue({}),
    },
  } as unknown as PrismaClient;
}

const loginVerifications: Array<
  [string, (auth: AuthService) => Promise<unknown>, 'verifyTOTP' | 'verifyBackupCode', string]
> = [
  [
    'AuthService.verify2FA',
    (a) => a.verify2FA('user-1', '000000'),
    'verifyTOTP',
    'INVALID_2FA_CODE',
  ],
  [
    'AuthService.verify2FABackupCode',
    (a) => a.verify2FABackupCode('user-1', 'ZZZZ9999'),
    'verifyBackupCode',
    'INVALID_BACKUP_CODE',
  ],
];

describe('2FA のログインの検証は DB 接続のタイムアウトで失敗回数を加算しない（タスク36.3）', () => {
  describe.each(loginVerifications)('%s', (_name, invoke, verifier, invalidCode) => {
    it.each(timeouts)('検証の中の %s を投げ直し、失敗回数を更新しない', async (_label, make) => {
      const error = make();
      const prisma = failingOnVerificationPrisma(error);
      const auth = authServiceWith(prisma, twoFactorService(prisma));

      await expect(invoke(auth)).rejects.toBe(error);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('検証の中の一般の Error はこれまでどおり検証の失敗として失敗回数を加算する', async () => {
      const prisma = failingOnVerificationPrisma(new Error('Database connection failed'));
      const auth = authServiceWith(prisma, twoFactorService(prisma));

      await expect(invoke(auth)).resolves.toEqual({ ok: false, error: { type: invalidCode } });
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { twoFactorFailures: 3 },
      });
    });

    it.each(timeouts)(
      '失敗回数の更新の %s を投げ直す（検証の失敗の 401 にしない）',
      async (_label, make) => {
        const error = make();
        const prisma = {
          user: {
            findUnique: vi.fn().mockResolvedValue(twoFactorUser),
            update: vi.fn().mockRejectedValue(error),
          },
        } as unknown as PrismaClient;
        const twoFactor = {
          [verifier]: vi.fn().mockResolvedValue(Ok(false)),
        } as unknown as TwoFactorService;

        await expect(invoke(authServiceWith(prisma, twoFactor))).rejects.toBe(error);
      }
    );

    it('失敗回数の更新の一般の Error はこれまでどおり検証の失敗を返す', async () => {
      const prisma = {
        user: {
          findUnique: vi.fn().mockResolvedValue(twoFactorUser),
          update: vi.fn().mockRejectedValue(new Error('Database connection failed')),
        },
      } as unknown as PrismaClient;
      const twoFactor = {
        [verifier]: vi.fn().mockResolvedValue(Ok(false)),
      } as unknown as TwoFactorService;

      await expect(invoke(authServiceWith(prisma, twoFactor))).resolves.toEqual({
        ok: false,
        error: { type: invalidCode },
      });
    });
  });
});
