/**
 * @fileoverview ロールの解除とロールの権限の解除による外部アプリの接続の失効の単体テスト（user-authentication タスク76.3）
 *
 * Requirements (user-authentication):
 * - REQ-50.4: 利用者が権限「外部アプリの接続」を失うと（ロールの変更とロールの権限の変更を含む）、接続を直ちに失効させる
 * - REQ-51.7: 失効の監査に実行者・送信元 IP を残す
 *
 * Design: Requirements 46-51 > Modified Files（user-role.service.ts: ロールの解除のトランザクションで接続を失効させる、
 * role-permission.service.ts: 権限の解除のトランザクションで接続を失効させる）、ExternalAppConnectionService の
 * Implementation Notes（権限の喪失はロールと権限の変更のトランザクションの中で DB の現在の値から判定する）
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { PrismaClient } from '../../../generated/prisma/client.js';
import type { IAuditLogService } from '../../../types/audit-log.types.js';
import { UserRoleService } from '../../../services/user-role.service.js';
import {
  ROLE_PERMISSION_REMOVAL_TRANSACTION_TIMEOUT_MS,
  RolePermissionService,
} from '../../../services/role-permission.service.js';
import type { PermissionLossRevoker } from '../../../services/external-app-connection.service.js';

vi.mock('../../../utils/sentry.js', () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}));

const USER_ID = 'user-763';
const ROLE_ID = 'role-763';
const ACTOR_ID = 'admin-763';
const SOURCE = { ipAddress: '198.51.100.63', userAgent: 'vitest-763' };

type Revoke = PermissionLossRevoker['revokeForUsersWithoutPermission'];

/** 呼び出しの順序を記録する取引のクライアントと、それを包む PrismaClient を作る */
function createPrisma(tx: Record<string, unknown>, calls: string[]) {
  const transaction = vi.fn(async (callback: (t: unknown) => Promise<unknown>) => {
    calls.push('begin');
    const value = await callback(tx);
    calls.push('commit');
    return value;
  });
  return { prisma: { ...tx, $transaction: transaction } as unknown as PrismaClient, transaction };
}

describe('ロールの解除による接続の失効（UserRoleService・タスク76.3）', () => {
  const calls: string[] = [];
  let tx: Record<string, unknown>;
  let rolePermissions: { permission: { resource: string; action: string } }[];
  let revoke: ReturnType<typeof vi.fn<Revoke>>;
  let service: UserRoleService;

  beforeEach(() => {
    calls.length = 0;
    rolePermissions = [];
    tx = {
      user: {
        findUnique: vi.fn().mockResolvedValue({
          id: USER_ID,
          email: 'u@example.com',
          displayName: 'U',
          isActive: true,
        }),
      },
      role: {
        findFirst: vi.fn().mockResolvedValue(null),
        findUnique: vi.fn(async ({ where }: { where: { id: string } }) => ({
          id: where.id,
          name: 'developer',
        })),
      },
      userRole: {
        findFirst: vi.fn().mockResolvedValue({ id: 'ur-1' }),
        delete: vi.fn(async () => {
          calls.push('userRole.delete');
          return {};
        }),
      },
      rolePermission: {
        findMany: vi.fn(async () => {
          calls.push('rolePermission.findMany');
          return rolePermissions;
        }),
      },
      $queryRaw: vi.fn(async (strings: TemplateStringsArray) => {
        if (/FROM users WHERE id = .* FOR NO KEY UPDATE/.test(strings.join('?'))) {
          calls.push('users-row-lock');
        }
        return [];
      }),
    };
    const { prisma } = createPrisma(tx, calls);
    const auditLogService = {
      createLog: vi.fn(async () => {
        calls.push('audit:USER_ROLE_REVOKED');
        return {};
      }),
    } as unknown as IAuditLogService;
    revoke = vi.fn<Revoke>(async () => {
      calls.push('revokeForUsersWithoutPermission');
      return 1;
    });
    service = new UserRoleService(
      prisma,
      undefined,
      auditLogService,
      undefined,
      undefined,
      undefined,
      { revokeAllForUser: vi.fn() },
      { revokeForUsersWithoutPermission: revoke }
    );
  });

  /**
   * @requirement user-authentication/REQ-50.4
   * @requirement user-authentication/REQ-51.7
   */
  it.each([
    ['external_app', 'connect'],
    ['external_app', '*'],
    ['*', 'connect'],
    ['*', '*'],
  ])(
    '外したロールが %s:%s を持てば、同じ取引の中で削除の後に利用者を判定へ渡す',
    async (resource, action) => {
      rolePermissions = [{ permission: { resource, action } }];

      const result = await service.removeRoleFromUser(
        USER_ID,
        ROLE_ID,
        ACTOR_ID,
        undefined,
        SOURCE
      );

      expect(result.ok).toBe(true);
      expect(revoke).toHaveBeenCalledTimes(1);
      expect(revoke).toHaveBeenCalledWith([USER_ID], { userId: ACTOR_ID, source: SOURCE }, tx);
      // 利用者の行を紐付けの削除より前にロックし、判定は削除の後・コミットの前に行う
      expect(calls).toEqual([
        'begin',
        'users-row-lock',
        'userRole.delete',
        'audit:USER_ROLE_REVOKED',
        'rolePermission.findMany',
        'revokeForUsersWithoutPermission',
        'commit',
      ]);
      expect((tx.rolePermission as { findMany: ReturnType<typeof vi.fn> }).findMany).toBeCalledWith(
        expect.objectContaining({ where: { roleId: { in: [ROLE_ID] } } })
      );
    }
  );

  /** @requirement user-authentication/REQ-50.4 */
  it('外したロールが権限「外部アプリの接続」を包含しなければ判定へ渡さない（世代を進めない）', async () => {
    rolePermissions = [{ permission: { resource: 'external_app', action: 'read' } }];

    const result = await service.removeRoleFromUser(USER_ID, ROLE_ID, ACTOR_ID);

    expect(result.ok).toBe(true);
    expect(revoke).not.toHaveBeenCalled();
  });

  /** @requirement user-authentication/REQ-50.4 */
  it('一括の解除は全件の削除の後に 1 回だけ判定へ渡し、失効の失敗で全体を失敗にする', async () => {
    rolePermissions = [{ permission: { resource: 'external_app', action: 'connect' } }];
    revoke.mockImplementationOnce(async () => {
      calls.push('revokeForUsersWithoutPermission');
      throw new Error('revocation failed');
    });

    const result = await service.removeRolesFromUser(
      USER_ID,
      ['role-a', 'role-b'],
      ACTOR_ID,
      undefined,
      SOURCE
    );

    expect(result.ok).toBe(false);
    expect(revoke).toHaveBeenCalledTimes(1);
    expect(calls.filter((call) => call === 'userRole.delete')).toHaveLength(2);
    expect(calls.indexOf('revokeForUsersWithoutPermission')).toBeGreaterThan(
      calls.lastIndexOf('userRole.delete')
    );
    expect(calls).not.toContain('commit');
  });
});

describe('ロールの権限の解除による接続の失効（RolePermissionService・タスク76.3）', () => {
  const calls: string[] = [];
  let tx: Record<string, unknown>;
  let transaction: ReturnType<typeof vi.fn>;
  let revoke: ReturnType<typeof vi.fn<Revoke>>;
  let service: RolePermissionService;
  let permissions: Record<string, { id: string; resource: string; action: string }>;

  beforeEach(() => {
    calls.length = 0;
    permissions = {
      connect: { id: 'connect', resource: 'external_app', action: 'connect' },
      any: { id: 'any', resource: 'external_app', action: '*' },
      starConnect: { id: 'starConnect', resource: '*', action: 'connect' },
      all: { id: 'all', resource: '*', action: '*' },
      read: { id: 'read', resource: 'project', action: 'read' },
    };
    tx = {
      role: { findUnique: vi.fn().mockResolvedValue({ id: ROLE_ID, name: 'developer' }) },
      permission: {
        findUnique: vi.fn(async ({ where }: { where: { id: string } }) => permissions[where.id]),
      },
      rolePermission: {
        findFirst: vi.fn().mockResolvedValue({ id: 'rp-1' }),
        delete: vi.fn(async () => {
          calls.push('rolePermission.delete');
          return {};
        }),
      },
      userRole: {
        findMany: vi.fn(async () => {
          calls.push('userRole.findMany');
          return [{ userId: 'holder-b' }, { userId: 'holder-a' }];
        }),
      },
    };
    const created = createPrisma(tx, calls);
    transaction = created.transaction;
    revoke = vi.fn<Revoke>(async () => {
      calls.push('revokeForUsersWithoutPermission');
      return 2;
    });
    service = new RolePermissionService(created.prisma, undefined, undefined, undefined, {
      revokeForUsersWithoutPermission: revoke,
    });
  });

  /**
   * @requirement user-authentication/REQ-50.4
   * @requirement user-authentication/REQ-51.7
   */
  it.each(['connect', 'any', 'starConnect', 'all'])(
    '外す権限（%s）が権限「外部アプリの接続」を包含すれば、同じ取引の中でロールの保有者を判定へ渡す',
    async (id) => {
      const result = await service.removePermissionFromRole(ROLE_ID, id, ACTOR_ID, SOURCE);

      expect(result.ok).toBe(true);
      expect(revoke).toHaveBeenCalledWith(
        ['holder-b', 'holder-a'],
        { userId: ACTOR_ID, source: SOURCE },
        tx
      );
      expect((tx.userRole as { findMany: ReturnType<typeof vi.fn> }).findMany).toBeCalledWith({
        where: { roleId: ROLE_ID },
        select: { userId: true },
      });
      expect(calls).toEqual([
        'begin',
        'rolePermission.delete',
        'userRole.findMany',
        'revokeForUsersWithoutPermission',
        'commit',
      ]);
    }
  );

  /** @requirement user-authentication/REQ-50.4 */
  it('包含しない権限だけを外すときは保有者を読まず判定へ渡さない', async () => {
    const result = await service.removePermissionsFromRole(ROLE_ID, ['read'], ACTOR_ID, SOURCE);

    expect(result.ok).toBe(true);
    expect(revoke).not.toHaveBeenCalled();
    expect(calls).not.toContain('userRole.findMany');
  });

  /** @requirement user-authentication/REQ-50.4 */
  it('一括の解除は全件の削除の後に 1 回だけ判定へ渡し、取引の上限を明示する', async () => {
    const result = await service.removePermissionsFromRole(
      ROLE_ID,
      ['read', 'connect', 'any'],
      ACTOR_ID,
      SOURCE
    );

    expect(result.ok).toBe(true);
    expect(revoke).toHaveBeenCalledTimes(1);
    expect(calls.indexOf('revokeForUsersWithoutPermission')).toBeGreaterThan(
      calls.lastIndexOf('rolePermission.delete')
    );
    expect(transaction).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({ timeout: ROLE_PERMISSION_REMOVAL_TRANSACTION_TIMEOUT_MS })
    );
  });

  /** @requirement user-authentication/REQ-50.4 */
  it('失効の失敗は取引ごと失敗にし、コミットしない', async () => {
    revoke.mockRejectedValueOnce(new Error('revocation failed'));

    const result = await service.removePermissionFromRole(ROLE_ID, 'connect', ACTOR_ID, SOURCE);

    expect(result.ok).toBe(false);
    expect(calls).not.toContain('commit');
  });
});
