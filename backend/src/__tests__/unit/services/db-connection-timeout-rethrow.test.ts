/**
 * @fileoverview 認証系の 6 サービスが DB 接続のタイムアウトを DATABASE_ERROR へ飲み込まず投げ直すことの単体検証（タスク35.11）
 *
 * 対象は auth / permission / role-permission / role / session / user-role の各サービスで、
 * DB 例外を `Err({ type: 'DATABASE_ERROR' })` へ変える catch のすべて（24 か所）。
 * - 接続のタイムアウト（pg-pool の素の Error、ETIMEDOUT、P1008）は同じエラーのまま投げ直す
 * - それ以外の DB 例外（一般の Error、P1001 など）はこれまでどおり DATABASE_ERROR を返す
 *
 * 実エンドポイントが 503 を返すことは統合検証（auth-db-connection-timeout-503.integration.test.ts）で確かめる。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Prisma, type PrismaClient } from '../../../generated/prisma/client.js';
import { AuthService } from '../../../services/auth.service.js';
import { PermissionService } from '../../../services/permission.service.js';
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
  isDatabaseConnectionTimeout,
  rethrowIfDatabaseConnectionTimeout,
} from '../../../utils/db-connection-timeout.js';

vi.mock('../../../utils/sentry.js', () => ({
  captureException: vi.fn(),
  addBreadcrumb: vi.fn(),
}));

/** 再試行を使い切った pg-pool の接続タイムアウト（Prisma から素の Error として届く） */
const poolConnectionTimeout = () => new Error('Connection terminated due to connection timeout');

/** @prisma/adapter-pg が SocketTimeout へ包んだ ETIMEDOUT を Prisma が変換したもの */
const p1008 = () =>
  new Prisma.PrismaClientKnownRequestError('Operations timed out', {
    code: 'P1008',
    clientVersion: 'test',
  });

/** 接続タイムアウトではない DB 例外（接続拒否） */
const p1001 = () =>
  new Prisma.PrismaClientKnownRequestError("Can't reach database server", {
    code: 'P1001',
    clientVersion: 'test',
  });

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

function authService(prisma: PrismaClient): AuthService {
  const invitationService = {
    validateInvitation: vi.fn().mockResolvedValue(Ok({ email: 'invitee@example.com' })),
  } as unknown as InvitationService;
  const tokenService = {
    verifyToken: vi.fn().mockResolvedValue(Ok({ userId: 'user-1' })),
  } as unknown as TokenService;
  return new AuthService(
    prisma,
    invitationService,
    {} as PasswordService,
    tokenService,
    {} as TwoFactorService,
    new SessionService(prisma)
  );
}

/** DB 例外を DATABASE_ERROR へ変える catch へ到達する呼び出し（24 か所） */
const cases: Array<[string, (prisma: PrismaClient) => Promise<unknown>]> = [
  [
    'AuthService.register',
    (p) => authService(p).register('invitation-token', { displayName: 'x', password: 'p' }),
  ],
  ['AuthService.login', (p) => authService(p).login('user@example.com', 'password')],
  ['AuthService.verify2FA', (p) => authService(p).verify2FA('user-1', '123456')],
  [
    'AuthService.verify2FABackupCode',
    (p) => authService(p).verify2FABackupCode('user-1', 'ABCD1234'),
  ],
  ['AuthService.logout', (p) => authService(p).logout('user-1', 'refresh-token')],
  ['AuthService.logoutAll', (p) => authService(p).logoutAll('user-1')],
  ['AuthService.getCurrentUser', (p) => authService(p).getCurrentUser('user-1')],
  ['AuthService.refreshToken', (p) => authService(p).refreshToken('refresh-token')],
  [
    'PermissionService.createPermission',
    (p) =>
      new PermissionService(p).createPermission({
        resource: 'project',
        action: 'read',
        description: 'd',
      }),
  ],
  ['PermissionService.getPermissionById', (p) => new PermissionService(p).getPermissionById('x')],
  ['PermissionService.deletePermission', (p) => new PermissionService(p).deletePermission('x')],
  [
    'RolePermissionService.getRolePermissions',
    (p) => new RolePermissionService(p).getRolePermissions('role-1'),
  ],
  [
    'RolePermissionService.addPermissionToRole',
    (p) => new RolePermissionService(p).addPermissionToRole('role-1', 'perm-1'),
  ],
  [
    'RolePermissionService.removePermissionFromRole',
    (p) => new RolePermissionService(p).removePermissionFromRole('role-1', 'perm-1'),
  ],
  ['RoleService.createRole', (p) => new RoleService(p).createRole({ name: 'r', description: 'd' })],
  ['RoleService.updateRole', (p) => new RoleService(p).updateRole('role-1', { name: 'r2' })],
  ['RoleService.deleteRole', (p) => new RoleService(p).deleteRole('role-1')],
  ['RoleService.getRoleById', (p) => new RoleService(p).getRoleById('role-1')],
  ['SessionService.deleteSession', (p) => new SessionService(p).deleteSession('refresh-token')],
  ['SessionService.verifySession', (p) => new SessionService(p).verifySession('refresh-token')],
  ['SessionService.extendSession', (p) => new SessionService(p).extendSession('refresh-token')],
  ['UserRoleService.getUserRoles', (p) => new UserRoleService(p).getUserRoles('user-1')],
  [
    'UserRoleService.addRoleToUser',
    (p) => new UserRoleService(p).addRoleToUser('user-1', 'role-1'),
  ],
  [
    'UserRoleService.removeRoleFromUser',
    (p) => new UserRoleService(p).removeRoleFromUser('user-1', 'role-1'),
  ],
];

describe('DB 接続のタイムアウトの判定と投げ直し（タスク35.11）', () => {
  it.each([
    ['pg-pool の接続タイムアウト（接続の確立中）', poolConnectionTimeout()],
    [
      'pg-pool の接続タイムアウト（プールからの取得）',
      new Error('timeout exceeded when trying to connect'),
    ],
    ['ETIMEDOUT', Object.assign(new Error('connect ETIMEDOUT'), { code: 'ETIMEDOUT' })],
    ['P1008', p1008()],
  ])('%s は接続のタイムアウトとして投げ直す', (_label, error) => {
    expect(isDatabaseConnectionTimeout(error)).toBe(true);
    expect(() => rethrowIfDatabaseConnectionTimeout(error)).toThrow(error);
  });

  it.each([
    ['一般の Error', new Error('Database connection failed')],
    ['文言の部分一致', new Error('Connection terminated due to connection timeout, retrying')],
    ['ECONNREFUSED', Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' })],
    ['P1001', p1001()],
    [
      'P2002',
      new Prisma.PrismaClientKnownRequestError('Unique', { code: 'P2002', clientVersion: 'test' }),
    ],
    ['Error でない値', 'Connection terminated due to connection timeout'],
  ])('%s は接続のタイムアウトとせず、投げ直さない', (_label, error) => {
    expect(isDatabaseConnectionTimeout(error)).toBe(false);
    expect(() => rethrowIfDatabaseConnectionTimeout(error)).not.toThrow();
  });
});

describe('認証系のサービスは DB 接続のタイムアウトを DATABASE_ERROR へ飲み込まない（タスク35.11）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe.each(cases)('%s', (_name, invoke) => {
    it('pg-pool の接続タイムアウトを同じエラーのまま投げ直す', async () => {
      const error = poolConnectionTimeout();
      await expect(invoke(rejectingPrisma(error))).rejects.toBe(error);
    });

    it('P1008 を同じエラーのまま投げ直す', async () => {
      const error = p1008();
      await expect(invoke(rejectingPrisma(error))).rejects.toBe(error);
    });

    it('接続のタイムアウトでない DB 例外はこれまでどおり DATABASE_ERROR を返す', async () => {
      const error = new Error('Database connection failed');
      await expect(invoke(rejectingPrisma(error))).resolves.toEqual({
        ok: false,
        error: { type: 'DATABASE_ERROR', message: 'Database connection failed' },
      });
    });

    it('P1001（接続拒否）はこれまでどおり DATABASE_ERROR を返す', async () => {
      const error = p1001();
      await expect(invoke(rejectingPrisma(error))).resolves.toEqual({
        ok: false,
        error: { type: 'DATABASE_ERROR', message: error.message },
      });
    });
  });
});
