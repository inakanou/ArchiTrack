/**
 * @fileoverview ロールの作成・更新・削除と割り当ての削除の監査ログの統合検証（タスク36.4）
 *
 * 実データベースで次を確かめる。
 * - ロールの作成・更新（版なし・版つき）・削除が、それぞれ ROLE_CREATED / ROLE_UPDATED / ROLE_DELETED を
 *   実行者・対象・変更前後の値とともに記録すること（要件22.1）
 * - ユーザーからのロールの削除（1件・一括）が USER_ROLE_REVOKED を記録すること（要件22.3）
 * - 監査ログの保存を PostgreSQL のトリガーで失敗させると、元の書き込みもロールバックされること（要件25.5）
 *
 * 失敗は JavaScript 側の差し替えではなくデータベース自身に起こさせるため、サービスが監査ログを
 * 書き込みのトランザクションの外で記録した場合は、先に済んだ書き込みが残って赤くなる。
 * 監査ログが最後の書き込みである経路は、監査ログをトランザクションの外で記録しても監査ログの失敗で
 * 書き込みが巻き戻るため、コミットの時点で失敗する遅延制約トリガーも使い、取り消された書き込みの
 * 監査ログが残らないこと（監査ログが書き込みと同じトランザクションにあること）を確かめる。
 *
 * トリガーは本ファイル専用の名前（接頭辞 ua364_）で作り、各検証の後に必ず外す。
 * 統合検証は1ワーカーで逐次に走る（vitest.config.ts の maxWorkers: 1）ため、
 * 注入が他のファイルの検証へ漏れることはない。
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import type { PrismaClient } from '../../generated/prisma/client.js';
import getPrismaClient from '../../db.js';
import { AuditLogService } from '../../services/audit-log.service.js';
import { RoleService } from '../../services/role.service.js';
import { UserRoleService } from '../../services/user-role.service.js';

const MARK = 'test-ua364-role-audit';
const INJECTED_MESSAGE = 'ua364 injected failure';
const FAILURE_FUNCTION = 'ua364_inject_failure';
const TRIGGERS = [
  { name: 'ua364_fail_audit_logs_insert', table: 'audit_logs' },
  { name: 'ua364_fail_user_roles_delete', table: 'user_roles' },
  { name: 'ua364_fail_roles_commit', table: 'roles' },
  { name: 'ua364_fail_user_roles_commit', table: 'user_roles' },
] as const;

type TriggerName = (typeof TRIGGERS)[number]['name'];

describe('ロールの作成・更新・削除と割り当ての削除の監査ログ（統合・失敗注入）', () => {
  let prisma: PrismaClient;
  let auditLogService: AuditLogService;
  let roleService: RoleService;
  let userRoleService: UserRoleService;

  let actorId: string;
  let targetUserId: string;
  let targetUserEmail: string;
  let roleAId: string;
  let roleBId: string;

  /** 失敗を注入するトリガーを作る。`when` はトリガーの WHEN 句（NEW / OLD を参照できる） */
  async function injectFailure(name: TriggerName, timing: string, when: string): Promise<void> {
    const table = TRIGGERS.find((t) => t.name === name)?.table;
    await prisma.$executeRawUnsafe(
      `CREATE TRIGGER ${name} BEFORE ${timing} ON ${table} FOR EACH ROW WHEN (${when}) EXECUTE FUNCTION ${FAILURE_FUNCTION}()`
    );
  }

  /**
   * コミットの時点で失敗するトリガーを作る（遅延制約トリガー）。
   * トランザクション内の書き込みはすべて成功し、COMMIT だけが失敗する状況を作る。
   */
  async function injectCommitFailure(
    name: TriggerName,
    event: 'INSERT' | 'UPDATE' | 'DELETE',
    when: string
  ): Promise<void> {
    const table = TRIGGERS.find((t) => t.name === name)?.table;
    await prisma.$executeRawUnsafe(
      `CREATE CONSTRAINT TRIGGER ${name} AFTER ${event} ON ${table} DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN (${when}) EXECUTE FUNCTION ${FAILURE_FUNCTION}()`
    );
  }

  /** 本ファイルの実行者が記録する指定のアクションの監査ログの保存を失敗させる */
  async function failAuditLogOf(action: string): Promise<void> {
    await injectFailure(
      'ua364_fail_audit_logs_insert',
      'INSERT',
      `NEW."actorId" = '${actorId}' AND NEW."action" = '${action}'`
    );
  }

  async function removeInjections(): Promise<void> {
    for (const { name, table } of TRIGGERS) {
      await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS ${name} ON ${table}`);
    }
  }

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
    return prisma.auditLog.findMany({
      where: { actorId, action },
      orderBy: { createdAt: 'asc' },
    });
  }

  async function userRoleIdsOf(userId: string): Promise<string[]> {
    const rows = await prisma.userRole.findMany({ where: { userId }, select: { roleId: true } });
    return rows.map((r) => r.roleId).sort();
  }

  beforeAll(async () => {
    prisma = getPrismaClient();
    await prisma.$executeRawUnsafe(
      `CREATE OR REPLACE FUNCTION ${FAILURE_FUNCTION}() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION '${INJECTED_MESSAGE} on %', TG_TABLE_NAME; END; $$ LANGUAGE plpgsql`
    );
  });

  beforeEach(async () => {
    await removeInjections();
    await cleanup();

    const actor = await prisma.user.create({
      data: {
        email: `${MARK}-actor@example.com`,
        displayName: 'Role Audit Actor',
        passwordHash: 'not-used-in-this-test',
      },
    });
    actorId = actor.id;
    targetUserEmail = `${MARK}-target@example.com`;
    const target = await prisma.user.create({
      data: {
        email: targetUserEmail,
        displayName: 'Role Audit Target',
        passwordHash: 'not-used-in-this-test',
      },
    });
    targetUserId = target.id;

    const roleA = await prisma.role.create({
      data: { name: `${MARK}-role-a`, description: 'role audit a', priority: 10 },
    });
    const roleB = await prisma.role.create({
      data: { name: `${MARK}-role-b`, description: 'role audit b', priority: 20 },
    });
    roleAId = roleA.id;
    roleBId = roleB.id;

    auditLogService = new AuditLogService({ prisma });
    roleService = new RoleService(prisma, auditLogService);
    userRoleService = new UserRoleService(prisma, undefined, auditLogService);
  });

  afterEach(async () => {
    await removeInjections();
  });

  afterAll(async () => {
    await removeInjections();
    await cleanup();
    await prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS ${FAILURE_FUNCTION}()`);
    await prisma.$disconnect();
  });

  describe('ロールの作成・更新・削除の監査ログ（要件22.1）', () => {
    /**
     * @requirement user-authentication/REQ-22.1
     */
    it('ロールの作成は ROLE_CREATED を実行者・対象・作成後の値とともに記録する', async () => {
      const result = await roleService.createRole(
        { name: `${MARK}-created`, description: 'created role', priority: 5 },
        actorId
      );

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const logs = await auditLogsOf('ROLE_CREATED');
      expect(logs).toHaveLength(1);
      expect(logs[0]).toMatchObject({
        actorId,
        targetType: 'role',
        targetId: result.value.id,
        before: null,
        after: {
          id: result.value.id,
          name: `${MARK}-created`,
          description: 'created role',
          priority: 5,
        },
      });
    });

    /**
     * @requirement user-authentication/REQ-22.1
     */
    it('ロールの更新（版なし）は ROLE_UPDATED を変更前後の値とともに記録する', async () => {
      const result = await roleService.updateRole(
        roleAId,
        { description: 'updated a', priority: 11 },
        actorId
      );

      expect(result.ok).toBe(true);
      const logs = await auditLogsOf('ROLE_UPDATED');
      expect(logs).toHaveLength(1);
      expect(logs[0]).toMatchObject({
        actorId,
        targetType: 'role',
        targetId: roleAId,
        before: { id: roleAId, name: `${MARK}-role-a`, description: 'role audit a', priority: 10 },
        after: { id: roleAId, name: `${MARK}-role-a`, description: 'updated a', priority: 11 },
      });
    });

    /**
     * @requirement user-authentication/REQ-22.1
     */
    it('ロールの更新（版つき）は ROLE_UPDATED を変更前後の値とともに記録する', async () => {
      const current = await prisma.role.findUniqueOrThrow({ where: { id: roleAId } });

      const result = await roleService.updateRole(
        roleAId,
        { name: `${MARK}-role-a-renamed`, expectedUpdatedAt: current.updatedAt },
        actorId
      );

      expect(result.ok).toBe(true);
      const logs = await auditLogsOf('ROLE_UPDATED');
      expect(logs).toHaveLength(1);
      expect(logs[0]).toMatchObject({
        actorId,
        targetType: 'role',
        targetId: roleAId,
        before: { name: `${MARK}-role-a`, description: 'role audit a', priority: 10 },
        after: { name: `${MARK}-role-a-renamed`, description: 'role audit a', priority: 10 },
      });
    });

    /**
     * @requirement user-authentication/REQ-22.1
     */
    it('版が古く更新しなかったときは ROLE_UPDATED を記録しない', async () => {
      const result = await roleService.updateRole(
        roleAId,
        { description: 'stale', expectedUpdatedAt: new Date('2000-01-01T00:00:00.000Z') },
        actorId
      );

      expect(result).toMatchObject({ ok: false, error: { type: 'ROLE_CONFLICT' } });
      expect(await auditLogsOf('ROLE_UPDATED')).toHaveLength(0);
    });

    /**
     * @requirement user-authentication/REQ-22.1
     */
    it('ロールの削除は ROLE_DELETED を実行者・対象・削除前の値とともに記録する', async () => {
      const result = await roleService.deleteRole(roleBId, actorId);

      expect(result).toEqual({ ok: true, value: undefined });
      const logs = await auditLogsOf('ROLE_DELETED');
      expect(logs).toHaveLength(1);
      expect(logs[0]).toMatchObject({
        actorId,
        targetType: 'role',
        targetId: roleBId,
        before: { id: roleBId, name: `${MARK}-role-b`, description: 'role audit b', priority: 20 },
        after: null,
      });
    });
  });

  describe('ユーザーからのロールの削除の監査ログ（要件22.3）', () => {
    /**
     * @requirement user-authentication/REQ-22.3
     */
    it('ロールの削除は USER_ROLE_REVOKED を実行者・対象・削除前の紐付けとともに記録する', async () => {
      await prisma.userRole.create({ data: { userId: targetUserId, roleId: roleAId } });

      const result = await userRoleService.removeRoleFromUser(targetUserId, roleAId, actorId);

      expect(result).toEqual({ ok: true, value: undefined });
      expect(await userRoleIdsOf(targetUserId)).toEqual([]);
      const logs = await auditLogsOf('USER_ROLE_REVOKED');
      expect(logs).toHaveLength(1);
      expect(logs[0]).toMatchObject({
        actorId,
        targetType: 'user-role',
        targetId: targetUserId,
        before: {
          userId: targetUserId,
          userEmail: targetUserEmail,
          roleId: roleAId,
          roleName: `${MARK}-role-a`,
        },
        after: null,
      });
    });

    /**
     * @requirement user-authentication/REQ-22.3
     */
    it('一括の削除はロールごとに USER_ROLE_REVOKED を記録する', async () => {
      await prisma.userRole.createMany({
        data: [roleAId, roleBId].map((roleId) => ({ userId: targetUserId, roleId })),
      });

      const result = await userRoleService.removeRolesFromUser(
        targetUserId,
        [roleAId, roleBId],
        actorId
      );

      expect(result).toEqual({ ok: true, value: undefined });
      const logs = await auditLogsOf('USER_ROLE_REVOKED');
      expect(logs.map((l) => (l.before as { roleId: string }).roleId).sort()).toEqual(
        [roleAId, roleBId].sort()
      );
    });
  });

  describe('監査ログの保存失敗で書き込みごとロールバックする（要件25.5）', () => {
    /**
     * @requirement user-authentication/REQ-25.5
     */
    it('ROLE_CREATED が保存できないと、ロールは作成されない', async () => {
      await failAuditLogOf('ROLE_CREATED');

      const result = await roleService.createRole(
        { name: `${MARK}-rolled-back`, description: 'must not remain' },
        actorId
      );

      expect(result).toMatchObject({ ok: false, error: { type: 'DATABASE_ERROR' } });
      expect((result as { error: { message: string } }).error.message).toContain(INJECTED_MESSAGE);
      expect(await prisma.role.findUnique({ where: { name: `${MARK}-rolled-back` } })).toBeNull();
    });

    /**
     * @requirement user-authentication/REQ-25.5
     */
    it('ROLE_UPDATED が保存できないと、ロールの更新（版なし）は取り消される', async () => {
      await failAuditLogOf('ROLE_UPDATED');

      const result = await roleService.updateRole(
        roleAId,
        { description: 'must not remain' },
        actorId
      );

      expect(result).toMatchObject({ ok: false, error: { type: 'DATABASE_ERROR' } });
      const stored = await prisma.role.findUniqueOrThrow({ where: { id: roleAId } });
      expect(stored.description).toBe('role audit a');
    });

    /**
     * @requirement user-authentication/REQ-25.5
     */
    it('ROLE_UPDATED が保存できないと、ロールの更新（版つき）は取り消され版も進まない', async () => {
      const current = await prisma.role.findUniqueOrThrow({ where: { id: roleAId } });
      await failAuditLogOf('ROLE_UPDATED');

      const result = await roleService.updateRole(
        roleAId,
        { description: 'must not remain', expectedUpdatedAt: current.updatedAt },
        actorId
      );

      expect(result).toMatchObject({ ok: false, error: { type: 'DATABASE_ERROR' } });
      const stored = await prisma.role.findUniqueOrThrow({ where: { id: roleAId } });
      expect(stored.description).toBe('role audit a');
      expect(stored.updatedAt).toEqual(current.updatedAt);
    });

    /**
     * @requirement user-authentication/REQ-25.5
     */
    it('ROLE_DELETED が保存できないと、ロールの削除は取り消される', async () => {
      await failAuditLogOf('ROLE_DELETED');

      const result = await roleService.deleteRole(roleBId, actorId);

      expect(result).toMatchObject({ ok: false, error: { type: 'DATABASE_ERROR' } });
      expect(await prisma.role.findUnique({ where: { id: roleBId } })).not.toBeNull();
    });

    /**
     * @requirement user-authentication/REQ-25.5
     */
    it('USER_ROLE_REVOKED が保存できないと、ロールの削除は取り消される', async () => {
      await prisma.userRole.create({ data: { userId: targetUserId, roleId: roleAId } });
      await failAuditLogOf('USER_ROLE_REVOKED');

      const result = await userRoleService.removeRoleFromUser(targetUserId, roleAId, actorId);

      expect(result).toMatchObject({ ok: false, error: { type: 'DATABASE_ERROR' } });
      expect((result as { error: { message: string } }).error.message).toContain(INJECTED_MESSAGE);
      expect(await userRoleIdsOf(targetUserId)).toEqual([roleAId]);
    });

    /**
     * @requirement user-authentication/REQ-25.5
     */
    it('一括の削除で2件目の USER_ROLE_REVOKED が保存できないと、全ての削除が取り消される', async () => {
      await prisma.userRole.createMany({
        data: [roleAId, roleBId].map((roleId) => ({ userId: targetUserId, roleId })),
      });
      await injectFailure(
        'ua364_fail_audit_logs_insert',
        'INSERT',
        `NEW."actorId" = '${actorId}' AND NEW."action" = 'USER_ROLE_REVOKED' AND NEW."before"->>'roleId' = '${roleBId}'`
      );

      const result = await userRoleService.removeRolesFromUser(
        targetUserId,
        [roleAId, roleBId],
        actorId
      );

      expect(result).toMatchObject({ ok: false, error: { type: 'DATABASE_ERROR' } });
      expect(await userRoleIdsOf(targetUserId)).toEqual([roleAId, roleBId].sort());
      expect(await auditLogsOf('USER_ROLE_REVOKED')).toHaveLength(0);
    });

    /**
     * @requirement user-authentication/REQ-25.5
     */
    it('一括の削除で2件目の紐付けの削除が失敗すると、先に記録した USER_ROLE_REVOKED も残らない', async () => {
      await prisma.userRole.createMany({
        data: [roleAId, roleBId].map((roleId) => ({ userId: targetUserId, roleId })),
      });
      await injectFailure('ua364_fail_user_roles_delete', 'DELETE', `OLD."roleId" = '${roleBId}'`);

      const result = await userRoleService.removeRolesFromUser(
        targetUserId,
        [roleAId, roleBId],
        actorId
      );

      expect(result).toMatchObject({ ok: false, error: { type: 'DATABASE_ERROR' } });
      expect(await userRoleIdsOf(targetUserId)).toEqual([roleAId, roleBId].sort());
      // 監査ログが元の操作と別に書き込まれていれば、取り消された削除の記録が残る
      expect(await auditLogsOf('USER_ROLE_REVOKED')).toHaveLength(0);
    });
  });
  describe('書き込みがコミットの時点で失敗すると監査ログも残らない（要件25.5）', () => {
    /**
     * @requirement user-authentication/REQ-25.5
     */
    it('ロールの作成のコミットが失敗すると、ROLE_CREATED も残らない', async () => {
      await injectCommitFailure(
        'ua364_fail_roles_commit',
        'INSERT',
        `NEW."name" = '${MARK}-commit-fails'`
      );

      const result = await roleService.createRole(
        { name: `${MARK}-commit-fails`, description: 'must not remain' },
        actorId
      );

      expect(result).toMatchObject({ ok: false, error: { type: 'DATABASE_ERROR' } });
      expect(await prisma.role.findUnique({ where: { name: `${MARK}-commit-fails` } })).toBeNull();
      expect(await auditLogsOf('ROLE_CREATED')).toHaveLength(0);
    });

    /**
     * @requirement user-authentication/REQ-25.5
     */
    it('ロールの更新（版なし）のコミットが失敗すると、ROLE_UPDATED も残らない', async () => {
      await injectCommitFailure('ua364_fail_roles_commit', 'UPDATE', `NEW."id" = '${roleAId}'`);

      const result = await roleService.updateRole(
        roleAId,
        { description: 'must not remain' },
        actorId
      );

      expect(result).toMatchObject({ ok: false, error: { type: 'DATABASE_ERROR' } });
      const stored = await prisma.role.findUniqueOrThrow({ where: { id: roleAId } });
      expect(stored.description).toBe('role audit a');
      expect(await auditLogsOf('ROLE_UPDATED')).toHaveLength(0);
    });

    /**
     * @requirement user-authentication/REQ-25.5
     */
    it('ロールの更新（版つき）のコミットが失敗すると、ROLE_UPDATED も残らない', async () => {
      const current = await prisma.role.findUniqueOrThrow({ where: { id: roleAId } });
      await injectCommitFailure('ua364_fail_roles_commit', 'UPDATE', `NEW."id" = '${roleAId}'`);

      const result = await roleService.updateRole(
        roleAId,
        { description: 'must not remain', expectedUpdatedAt: current.updatedAt },
        actorId
      );

      expect(result).toMatchObject({ ok: false, error: { type: 'DATABASE_ERROR' } });
      const stored = await prisma.role.findUniqueOrThrow({ where: { id: roleAId } });
      expect(stored.description).toBe('role audit a');
      expect(await auditLogsOf('ROLE_UPDATED')).toHaveLength(0);
    });

    /**
     * @requirement user-authentication/REQ-25.5
     */
    it('ロールの削除のコミットが失敗すると、ROLE_DELETED も残らない', async () => {
      await injectCommitFailure('ua364_fail_roles_commit', 'DELETE', `OLD."id" = '${roleBId}'`);

      const result = await roleService.deleteRole(roleBId, actorId);

      expect(result).toMatchObject({ ok: false, error: { type: 'DATABASE_ERROR' } });
      expect(await prisma.role.findUnique({ where: { id: roleBId } })).not.toBeNull();
      expect(await auditLogsOf('ROLE_DELETED')).toHaveLength(0);
    });

    /**
     * @requirement user-authentication/REQ-25.5
     */
    it('ユーザーからのロールの削除のコミットが失敗すると、USER_ROLE_REVOKED も残らない', async () => {
      await prisma.userRole.create({ data: { userId: targetUserId, roleId: roleAId } });
      await injectCommitFailure(
        'ua364_fail_user_roles_commit',
        'DELETE',
        `OLD."userId" = '${targetUserId}'`
      );

      const result = await userRoleService.removeRoleFromUser(targetUserId, roleAId, actorId);

      expect(result).toMatchObject({ ok: false, error: { type: 'DATABASE_ERROR' } });
      expect(await userRoleIdsOf(targetUserId)).toEqual([roleAId]);
      expect(await auditLogsOf('USER_ROLE_REVOKED')).toHaveLength(0);
    });
  });
});
