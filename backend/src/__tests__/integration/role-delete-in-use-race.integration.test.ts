/**
 * @fileoverview ロールの削除と並行する割り当ての直列化の統合検証（タスク37.1）
 *
 * 実データベースで、ロールの削除の使用中の確認（要件17.5）と削除の間に割り当てが割り込む競合を
 * 決定的に再現し、次を確かめる。
 * - 使用中の確認の直後・削除の前に割り当てを始めると、削除が先に済み、割り当ての側は
 *   ROLE_NOT_FOUND で失敗する。割り当ても USER_ROLE_ASSIGNED の監査ログも残らない
 * - 未コミットの割り当てがあるうちに削除を始めると、削除は割り当てのコミットを待ってから
 *   件数を数え、ROLE_IN_USE で拒否する。割り当てと監査ログは残る
 *
 * 使用中の確認をトランザクションの外で行うと、前者では割り当てがコミットされた後に削除の
 * カスケードで黙って消え（USER_ROLE_REVOKED の監査ログ（要件22.3）も権限キャッシュの無効化
 * （要件21.8）も伴わない）、後者では削除が割り当てを消して成功する。どちらも赤くなる。
 *
 * 割り込みの時点は、削除のサービスへ渡す PrismaClient の `userRole.count`（トランザクションの
 * 中の `tx.userRole.count` を含む）を包み、件数が返った直後に割り当てを始めることで決める。
 * 割り当てが待ちに入ったか（またはすでに終わったか）は pg_stat_activity のロック待ちで確かめる。
 * 待ちの観測が期限内に成立しなければ検証を失敗させる（前提が崩れたときに素通りさせない）。
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { PrismaClient } from '../../generated/prisma/client.js';
import getPrismaClient from '../../db.js';
import { AuditLogService } from '../../services/audit-log.service.js';
import { RoleService } from '../../services/role.service.js';
import { UserRoleService } from '../../services/user-role.service.js';
import type { CreateAuditLogInput, IAuditLogService } from '../../types/audit-log.types.js';

const MARK = 'test-ua371-role-delete-race';
const WAIT_LIMIT_MS = 10_000;
const POLL_INTERVAL_MS = 20;

/** 並行する他の接続のうち、ロックを待っているものの数 */
async function countLockWaiters(prisma: PrismaClient): Promise<number> {
  const rows = await prisma.$queryRaw<Array<{ waiting: number }>>`
    SELECT count(*)::int AS waiting FROM pg_stat_activity
    WHERE datname = current_database() AND wait_event_type = 'Lock' AND pid <> pg_backend_pid()`;
  return rows[0]?.waiting ?? 0;
}

/**
 * 条件が成り立つまで待つ。期限を過ぎたら失敗させる
 */
async function waitUntil(label: string, condition: () => Promise<boolean>): Promise<void> {
  const deadline = Date.now() + WAIT_LIMIT_MS;
  while (Date.now() < deadline) {
    if (await condition()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  throw new Error(`timed out waiting for: ${label}`);
}

/**
 * `userRole.count` の結果が返った直後（呼び出し元へ返す前）に、一度だけ hook を実行する
 * PrismaClient の包み。`$transaction` のコールバックへ渡るクライアントも同じく包む
 */
function withHookAfterFirstUserRoleCount(
  prisma: PrismaClient,
  hook: () => Promise<void>
): PrismaClient {
  let fired = false;
  const wrap = <T extends object>(client: T): T =>
    new Proxy(client, {
      get(target, prop) {
        const value = Reflect.get(target, prop) as unknown;
        if (prop === 'userRole') {
          const delegate = value as Record<string, unknown>;
          return new Proxy(delegate, {
            get(dTarget, dProp) {
              const dValue = Reflect.get(dTarget, dProp) as unknown;
              if (dProp === 'count' && typeof dValue === 'function') {
                return async (...args: unknown[]) => {
                  const result = await (dValue as (...a: unknown[]) => Promise<unknown>).apply(
                    dTarget,
                    args
                  );
                  if (!fired) {
                    fired = true;
                    await hook();
                  }
                  return result;
                };
              }
              return typeof dValue === 'function'
                ? (dValue as (...a: unknown[]) => unknown).bind(dTarget)
                : dValue;
            },
          });
        }
        if (prop === '$transaction' && typeof value === 'function') {
          return (fn: (tx: object) => Promise<unknown>, options?: unknown) =>
            (value as (f: unknown, o?: unknown) => Promise<unknown>).call(
              target,
              (tx: object) => fn(wrap(tx)),
              options
            );
        }
        return typeof value === 'function'
          ? (value as (...a: unknown[]) => unknown).bind(target)
          : value;
      },
    });
  return wrap(prisma);
}

describe('ロールの削除と並行する割り当ての直列化（統合・競合の再現）', () => {
  let prisma: PrismaClient;
  let auditLogService: AuditLogService;

  let actorId: string;
  let targetUserId: string;
  let roleId: string;

  async function cleanup(): Promise<void> {
    const users = await prisma.user.findMany({
      where: { email: { contains: MARK } },
      select: { id: true },
    });
    const userIds = users.map((u) => u.id);
    const roles = await prisma.role.findMany({
      where: { name: { startsWith: MARK } },
      select: { id: true },
    });
    const roleIds = roles.map((r) => r.id);
    await prisma.auditLog.deleteMany({ where: { actorId: { in: userIds } } });
    await prisma.userRole.deleteMany({
      where: { OR: [{ userId: { in: userIds } }, { roleId: { in: roleIds } }] },
    });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.role.deleteMany({ where: { id: { in: roleIds } } });
  }

  async function auditLogsOf(action: string) {
    return prisma.auditLog.findMany({ where: { actorId, action } });
  }

  beforeAll(() => {
    prisma = getPrismaClient();
  });

  beforeEach(async () => {
    await cleanup();
    const actor = await prisma.user.create({
      data: {
        email: `${MARK}-actor@example.com`,
        displayName: 'Role Delete Race Actor',
        passwordHash: 'not-used-in-this-test',
      },
    });
    actorId = actor.id;
    const target = await prisma.user.create({
      data: {
        email: `${MARK}-target@example.com`,
        displayName: 'Role Delete Race Target',
        passwordHash: 'not-used-in-this-test',
      },
    });
    targetUserId = target.id;
    const role = await prisma.role.create({
      data: { name: `${MARK}-role`, description: 'role delete race', priority: 10 },
    });
    roleId = role.id;
    auditLogService = new AuditLogService({ prisma });
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  /**
   * @requirement user-authentication/REQ-17.5
   */
  it('使用中の確認の直後に始まった割り当ては、削除の後に ROLE_NOT_FOUND で失敗し、割り当ても監査ログも残らない', async () => {
    const userRoleService = new UserRoleService(prisma, undefined, auditLogService);
    let assignment: ReturnType<UserRoleService['addRoleToUser']> | undefined;
    let settled = false;

    // 使用中の件数（0 件）が返った直後に割り当てを始め、それが終わるかロック待ちに入るまで削除を進めない
    const hookedPrisma = withHookAfterFirstUserRoleCount(prisma, async () => {
      assignment = userRoleService.addRoleToUser(targetUserId, roleId, actorId);
      void assignment.finally(() => {
        settled = true;
      });
      await waitUntil(
        'assignment to settle or to wait for a lock',
        async () => settled || (await countLockWaiters(prisma)) > 0
      );
    });
    const roleService = new RoleService(hookedPrisma, auditLogService);

    const deleteResult = await roleService.deleteRole(roleId, actorId);
    expect(assignment).toBeDefined();
    const assignResult = await assignment!;

    // 削除は使用中の確認の時点の 0 件のとおり成功し、割り当ての側が負ける
    expect(deleteResult).toEqual({ ok: true, value: undefined });
    expect(assignResult).toEqual({ ok: false, error: { type: 'ROLE_NOT_FOUND' } });
    expect(await prisma.role.findUnique({ where: { id: roleId } })).toBeNull();
    expect(await prisma.userRole.findMany({ where: { userId: targetUserId } })).toEqual([]);
    // 削除のカスケードで黙って消えた割り当ての監査ログ（USER_ROLE_REVOKED の無い USER_ROLE_ASSIGNED）が残らない
    expect(await auditLogsOf('USER_ROLE_ASSIGNED')).toEqual([]);
    expect(await auditLogsOf('ROLE_DELETED')).toHaveLength(1);
  });

  /**
   * @requirement user-authentication/REQ-17.5
   */
  it('未コミットの割り当てがあるうちに始めた削除は、割り当てのコミットを待って ROLE_IN_USE で拒否する', async () => {
    // 割り当ての監査ログの記録（割り当てのトランザクションの最後の文）の後で止め、コミットを遅らせる
    let releaseAssignment!: () => void;
    const gate = new Promise<void>((resolve) => {
      releaseAssignment = resolve;
    });
    let assignmentHeld!: () => void;
    const held = new Promise<void>((resolve) => {
      assignmentHeld = resolve;
    });
    const gatedAuditLogService: IAuditLogService = new Proxy(auditLogService, {
      get(target, prop) {
        const value = Reflect.get(target, prop) as unknown;
        if (prop === 'createLog' && typeof value === 'function') {
          return async (input: CreateAuditLogInput, tx?: unknown) => {
            const log = await (value as (i: unknown, t?: unknown) => Promise<unknown>).call(
              target,
              input,
              tx
            );
            if (input.action === 'USER_ROLE_ASSIGNED') {
              assignmentHeld();
              await gate;
            }
            return log;
          };
        }
        return typeof value === 'function'
          ? (value as (...a: unknown[]) => unknown).bind(target)
          : value;
      },
    });
    const userRoleService = new UserRoleService(prisma, undefined, gatedAuditLogService);
    const roleService = new RoleService(prisma, auditLogService);

    const assignment = userRoleService.addRoleToUser(targetUserId, roleId, actorId);
    try {
      await held;
      const deletion = roleService.deleteRole(roleId, actorId);
      let deletionSettled = false;
      void deletion.finally(() => {
        deletionSettled = true;
      });
      await waitUntil(
        'deletion to wait for the assignment',
        async () => deletionSettled || (await countLockWaiters(prisma)) > 0
      );
      releaseAssignment();

      const assignResult = await assignment;
      const deleteResult = await deletion;

      expect(assignResult).toEqual({ ok: true, value: undefined });
      expect(deleteResult).toEqual({ ok: false, error: { type: 'ROLE_IN_USE', userCount: 1 } });
      expect(await prisma.role.findUnique({ where: { id: roleId } })).not.toBeNull();
      const userRoles = await prisma.userRole.findMany({ where: { userId: targetUserId } });
      expect(userRoles.map((ur) => ur.roleId)).toEqual([roleId]);
      expect(await auditLogsOf('USER_ROLE_ASSIGNED')).toHaveLength(1);
      expect(await auditLogsOf('ROLE_DELETED')).toEqual([]);
    } finally {
      releaseAssignment();
      await assignment.catch(() => undefined);
    }
  });
});
