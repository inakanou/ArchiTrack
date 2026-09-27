/**
 * @fileoverview 認証系のサービスの対話型トランザクションが、接続の再試行の予算を覆う maxWait を渡すことの単体検証（タスク35.12）
 *
 * Prisma の maxWait（既定 2000ms）が接続の再試行の予算より短いと、DB に到達できないとき
 * トランザクションの開始が P2028 で打ち切られ、接続のタイムアウト（要件24.1 の 503）として扱えない。
 * - 予算の式（再試行の間隔の総和 + 試行回数 × 接続タイムアウト）と、maxWait = 予算 + 2000ms
 * - 認証系の 4 サービスの対話型トランザクション 7 か所がすべてその maxWait を渡すこと
 *
 * 実エンドポイントが 503 を返すことは統合検証（auth-transaction-db-connection-timeout-503.integration.test.ts）で確かめる。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { PrismaClient } from '../../../generated/prisma/client.js';
import { AuthService } from '../../../services/auth.service.js';
import { RolePermissionService } from '../../../services/role-permission.service.js';
import { RoleService } from '../../../services/role.service.js';
import { SessionService } from '../../../services/session.service.js';
import { UserRoleService } from '../../../services/user-role.service.js';
import type { InvitationService } from '../../../services/invitation.service.js';
import type { PasswordService } from '../../../services/password.service.js';
import type { TokenService } from '../../../services/token.service.js';
import type { TwoFactorService } from '../../../services/two-factor.service.js';
import { Ok } from '../../../types/result.js';
import {
  connectBudgetTransactionOptions,
  dbConnectBudgetMs,
} from '../../../utils/db-connect-budget.js';

vi.mock('../../../utils/sentry.js', () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  addBreadcrumb: vi.fn(),
}));

/** トランザクションの開始で止めるための目印のエラー */
const STOP = new Error('stop at $transaction');

/**
 * モデル操作は findUnique だけ findUniqueResult を返し、他は null を返す。
 * $transaction は受け取った引数を記録して STOP で失敗する PrismaClient の代役
 */
function recordingPrisma(findUniqueResult: unknown = null) {
  const transaction = vi.fn().mockRejectedValue(STOP);
  const delegate = new Proxy(
    {},
    {
      get: (_target, prop) => {
        if (prop === 'then') {
          return undefined;
        }
        return vi.fn().mockResolvedValue(prop === 'findUnique' ? findUniqueResult : null);
      },
    }
  );
  const prisma = new Proxy(
    {},
    {
      get: (_target, prop) => {
        if (prop === 'then') {
          return undefined;
        }
        if (prop === '$transaction') {
          return transaction;
        }
        return delegate;
      },
    }
  ) as unknown as PrismaClient;
  return { prisma, transaction };
}

function authService(prisma: PrismaClient): AuthService {
  const invitationService = {
    validateInvitation: vi.fn().mockResolvedValue(Ok({ email: 'invitee@example.com' })),
  } as unknown as InvitationService;
  const passwordService = {
    validatePasswordStrength: vi.fn().mockResolvedValue(Ok(undefined)),
    hashPassword: vi.fn().mockResolvedValue('hashed'),
  } as unknown as PasswordService;
  return new AuthService(
    prisma,
    invitationService,
    passwordService,
    {} as TokenService,
    {} as TwoFactorService,
    new SessionService(prisma)
  );
}

/** 認証系の対話型トランザクション（7 か所）へ到達する呼び出し。[名前, findUnique の戻り値, 呼び出し] */
const cases: Array<[string, unknown, (prisma: PrismaClient) => Promise<unknown>]> = [
  [
    'AuthService.register',
    null,
    (p) => authService(p).register('invitation-token', { displayName: 'x', password: 'p' }),
  ],
  [
    'RoleService.updateRole（版つき）',
    { id: 'role-1', name: 'r' },
    (p) =>
      new RoleService(p).updateRole('role-1', {
        description: 'd',
        expectedUpdatedAt: new Date('2026-09-27T00:00:00.000Z'),
      }),
  ],
  [
    'RolePermissionService.addPermissionToRole',
    null,
    (p) => new RolePermissionService(p).addPermissionToRole('role-1', 'perm-1'),
  ],
  [
    'RolePermissionService.removePermissionFromRole',
    null,
    (p) => new RolePermissionService(p).removePermissionFromRole('role-1', 'perm-1'),
  ],
  [
    'UserRoleService.addRoleToUser',
    null,
    (p) => new UserRoleService(p).addRoleToUser('user-1', 'role-1'),
  ],
  [
    'UserRoleService.removeRoleFromUser',
    null,
    (p) => new UserRoleService(p).removeRoleFromUser('user-1', 'role-1'),
  ],
  ['UserRoleService.deleteUser', null, (p) => new UserRoleService(p).deleteUser('user-1')],
];

describe('接続の再試行の予算（タスク35.12）', () => {
  it.each([
    // [再試行回数, 接続タイムアウト, 予算]
    [3, 5000, 1000 + 2000 + 4000 + 5000 * 4],
    [0, 200, 200],
    [1, 1000, 1000 + 1000 * 2],
    [10, 5000, 1023000 + 5000 * 11],
  ])('再試行 %i 回・接続タイムアウト %ims の予算は %ims', (retryCount, timeoutMs, expected) => {
    expect(dbConnectBudgetMs(retryCount, timeoutMs)).toBe(expected);
  });

  it('環境変数が未設定なら既定（3 回・5000ms）の予算 27000ms に 2000ms を足した maxWait を返す', () => {
    expect(connectBudgetTransactionOptions({})).toEqual({ maxWait: 29000 });
  });

  it('DATABASE_RETRY_COUNT と DATABASE_CONNECTION_TIMEOUT から maxWait を求める', () => {
    expect(
      connectBudgetTransactionOptions({
        DATABASE_RETRY_COUNT: '1',
        DATABASE_CONNECTION_TIMEOUT: '1000ms',
      })
    ).toEqual({ maxWait: 3000 + 2000 });
    expect(
      connectBudgetTransactionOptions({
        DATABASE_RETRY_COUNT: '10',
        DATABASE_CONNECTION_TIMEOUT: '5000',
      })
    ).toEqual({ maxWait: 1078000 + 2000 });
  });

  it('範囲外の値は DB クライアントの生成と同じく拒否する', () => {
    expect(() => connectBudgetTransactionOptions({ DATABASE_RETRY_COUNT: '11' })).toThrow();
    expect(() => connectBudgetTransactionOptions({ DATABASE_CONNECTION_TIMEOUT: '5s' })).toThrow();
  });
});

describe('認証系の対話型トランザクションは再試行の予算を覆う maxWait を渡す（タスク35.12）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe.each(cases)('%s', (_name, findUniqueResult, invoke) => {
    it('既定（3 回・5000ms）では maxWait 29000ms を渡す', async () => {
      vi.stubEnv('DATABASE_RETRY_COUNT', '3');
      vi.stubEnv('DATABASE_CONNECTION_TIMEOUT', '5000');
      const { prisma, transaction } = recordingPrisma(findUniqueResult);

      await invoke(prisma).catch(() => undefined);

      expect(transaction).toHaveBeenCalledTimes(1);
      expect(transaction.mock.calls[0]?.[0]).toBeTypeOf('function');
      expect(transaction.mock.calls[0]?.[1]).toStrictEqual({ maxWait: 29000 });
    });

    it('環境変数（1 回・1000ms）から呼び出しの時点で maxWait 5000ms を求めて渡す', async () => {
      vi.stubEnv('DATABASE_RETRY_COUNT', '1');
      vi.stubEnv('DATABASE_CONNECTION_TIMEOUT', '1000');
      const { prisma, transaction } = recordingPrisma(findUniqueResult);

      await invoke(prisma).catch(() => undefined);

      expect(transaction).toHaveBeenCalledTimes(1);
      expect(transaction.mock.calls[0]?.[1]).toStrictEqual({ maxWait: 5000 });
    });
  });
});
