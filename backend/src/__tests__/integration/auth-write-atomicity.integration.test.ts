/**
 * @fileoverview 認証系の書き込みの原子性の統合検証（タスク35.5）
 *
 * 実データベースに PostgreSQL のトリガーで失敗を注入し、各フローの途中の書き込み
 * （監査ログを含む）が失敗したとき、そのフローの全変更がロールバックされることを確かめる。
 * 失敗は JavaScript 側の差し替えではなくデータベース自身に起こさせるため、
 * サービスがトランザクションを外れて書き込んだ場合は、先に済んだ書き込みが残って赤くなる。
 *
 * トリガーは本ファイル専用の名前（接頭辞 ua355_）で作り、各検証の後に必ず外す。
 * 統合検証は1ワーカーで逐次に走る（vitest.config.ts の maxWorkers: 1）ため、
 * 注入が他のファイルの検証へ漏れることはない。
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { randomBytes } from 'crypto';
import type { Queue } from 'bull';
import type { Transporter } from 'nodemailer';
import { validateEnv } from '../../config/env.js';
import type { PrismaClient } from '../../generated/prisma/client.js';

// 環境変数を初期化（トークン発行の鍵を読むため、サービスのインポート前に実行）
validateEnv();

import getPrismaClient from '../../db.js';
import { AuthService } from '../../services/auth.service.js';
import { AuditLogService } from '../../services/audit-log.service.js';
import { UserRoleService } from '../../services/user-role.service.js';
import { RolePermissionService } from '../../services/role-permission.service.js';
import { PasswordService } from '../../services/password.service.js';
import { EmailService } from '../../services/email.service.js';
import { seedRoles } from '../../utils/seed-helpers.js';

const MARK = 'test-ua355-atomicity';
const INJECTED_MESSAGE = 'ua355 injected failure';
const FAILURE_FUNCTION = 'ua355_inject_failure';
const TRIGGER_NAMES = [
  { name: 'ua355_fail_user_roles_insert', table: 'user_roles' },
  { name: 'ua355_fail_user_roles_delete', table: 'user_roles' },
  { name: 'ua355_fail_role_permissions_insert', table: 'role_permissions' },
  { name: 'ua355_fail_role_permissions_delete', table: 'role_permissions' },
  { name: 'ua355_fail_audit_logs_insert', table: 'audit_logs' },
  { name: 'ua355_fail_password_reset_tokens_commit', table: 'password_reset_tokens' },
] as const;

type TriggerName = (typeof TRIGGER_NAMES)[number]['name'];

describe('認証系の書き込みの原子性（統合・失敗注入）', () => {
  let prisma: PrismaClient;
  let auditLogService: AuditLogService;
  let userRoleService: UserRoleService;
  let rolePermissionService: RolePermissionService;

  let actorId: string;
  let targetUserId: string;
  let roleAId: string;
  let roleBId: string;
  let roleCId: string;
  let permAId: string;
  let permBId: string;
  let permCId: string;

  /**
   * 失敗を注入するトリガーを作る。
   * `when` はトリガーの WHEN 句（NEW / OLD を参照できる）。
   */
  async function injectFailure(name: TriggerName, timing: string, when: string): Promise<void> {
    const table = TRIGGER_NAMES.find((t) => t.name === name)?.table;
    await prisma.$executeRawUnsafe(
      `CREATE TRIGGER ${name} BEFORE ${timing} ON ${table} FOR EACH ROW WHEN (${when}) EXECUTE FUNCTION ${FAILURE_FUNCTION}()`
    );
  }

  /**
   * コミットの時点で失敗するトリガーを作る（遅延制約トリガー）。
   * トランザクション内の書き込みはすべて成功し、COMMIT だけが失敗する状況を作る。
   */
  async function injectCommitFailure(name: TriggerName, when: string): Promise<void> {
    const table = TRIGGER_NAMES.find((t) => t.name === name)?.table;
    await prisma.$executeRawUnsafe(
      `CREATE CONSTRAINT TRIGGER ${name} AFTER INSERT ON ${table} DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN (${when}) EXECUTE FUNCTION ${FAILURE_FUNCTION}()`
    );
  }

  async function removeInjections(): Promise<void> {
    for (const { name, table } of TRIGGER_NAMES) {
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
    await prisma.refreshToken.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.passwordResetToken.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.userRole.deleteMany({
      where: { OR: [{ userId: { in: userIds } }, { roleId: { in: roleIds } }] },
    });
    await prisma.rolePermission.deleteMany({ where: { roleId: { in: roleIds } } });
    await prisma.invitation.deleteMany({ where: { email: { contains: MARK } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.role.deleteMany({ where: { id: { in: roleIds } } });
    await prisma.permission.deleteMany({ where: { resource: MARK } });
  }

  async function userRoleIdsOf(userId: string): Promise<string[]> {
    const rows = await prisma.userRole.findMany({ where: { userId }, select: { roleId: true } });
    return rows.map((r) => r.roleId).sort();
  }

  async function permissionIdsOf(roleId: string): Promise<string[]> {
    const rows = await prisma.rolePermission.findMany({
      where: { roleId },
      select: { permissionId: true },
    });
    return rows.map((r) => r.permissionId).sort();
  }

  async function auditLogCountFor(targetId: string): Promise<number> {
    return prisma.auditLog.count({ where: { targetId } });
  }

  beforeAll(async () => {
    prisma = getPrismaClient();
    await seedRoles(prisma);
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
        displayName: 'Atomicity Actor',
        passwordHash: 'not-used-in-this-test',
      },
    });
    actorId = actor.id;
    const target = await prisma.user.create({
      data: {
        email: `${MARK}-target@example.com`,
        displayName: 'Atomicity Target',
        passwordHash: 'not-used-in-this-test',
      },
    });
    targetUserId = target.id;

    const [roleA, roleB, roleC] = await Promise.all(
      ['a', 'b', 'c'].map((suffix) =>
        prisma.role.create({
          data: { name: `${MARK}-role-${suffix}`, description: `atomicity ${suffix}` },
        })
      )
    );
    roleAId = roleA!.id;
    roleBId = roleB!.id;
    roleCId = roleC!.id;

    const [permA, permB, permC] = await Promise.all(
      ['a', 'b', 'c'].map((action) =>
        prisma.permission.create({
          data: { resource: MARK, action, description: `atomicity ${action}` },
        })
      )
    );
    permAId = permA!.id;
    permBId = permB!.id;
    permCId = permC!.id;

    auditLogService = new AuditLogService({ prisma });
    userRoleService = new UserRoleService(prisma, undefined, auditLogService);
    rolePermissionService = new RolePermissionService(prisma, undefined, auditLogService);
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

  describe('ユーザー登録（要件25.1 / 25.2）', () => {
    /**
     * @requirement user-authentication/REQ-25.1
     * @requirement user-authentication/REQ-25.2
     */
    it('ロール割り当ての書き込みが失敗すると、ユーザー作成と招待の使用済み化もロールバックされる', async () => {
      const inviteeEmail = `${MARK}-invitee@example.com`;
      const token = randomBytes(32).toString('hex');
      const invitation = await prisma.invitation.create({
        data: {
          email: inviteeEmail,
          token,
          inviterId: actorId,
          expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        },
      });
      const defaultRole = await prisma.role.findUniqueOrThrow({ where: { name: 'user' } });
      // 登録トランザクションの最後の書き込み（既定ロールの割り当て）を失敗させる
      await injectFailure(
        'ua355_fail_user_roles_insert',
        'INSERT',
        `NEW."roleId" = '${defaultRole.id}'`
      );

      const authService = new AuthService(prisma);
      const result = await authService.register(token, {
        password: 'Atom1city!Pass#2026',
        displayName: 'Atomicity Invitee',
      });

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toMatchObject({ type: 'DATABASE_ERROR' });
      expect((result.error as { message: string }).message).toContain(INJECTED_MESSAGE);

      // 先に済んだユーザー作成は残らない
      expect(await prisma.user.findUnique({ where: { email: inviteeEmail } })).toBeNull();
      // 先に済んだ招待の使用済み化も残らない
      const stored = await prisma.invitation.findUniqueOrThrow({ where: { id: invitation.id } });
      expect(stored.status).toBe('pending');
      expect(stored.usedAt).toBeNull();
      expect(stored.userId).toBeNull();
    });
  });

  describe('ロールの一括割り当て・一括削除（要件25.3）', () => {
    /**
     * @requirement user-authentication/REQ-25.3
     */
    it('2件目の割り当ての書き込みが失敗すると、1件目の割り当ても残らずエラーを返す', async () => {
      await injectFailure('ua355_fail_user_roles_insert', 'INSERT', `NEW."roleId" = '${roleBId}'`);

      const result = await userRoleService.addRolesToUser(targetUserId, [
        roleAId,
        roleBId,
        roleCId,
      ]);

      expect(result).toMatchObject({ ok: false, error: { type: 'DATABASE_ERROR' } });
      expect(await userRoleIdsOf(targetUserId)).toEqual([]);
    });

    /**
     * @requirement user-authentication/REQ-25.3
     */
    it('途中のロールが存在しないと、先に割り当てたロールも残らず ROLE_NOT_FOUND を返す', async () => {
      const result = await userRoleService.addRolesToUser(targetUserId, [
        roleAId,
        '00000000-0000-0000-0000-000000000000',
        roleCId,
      ]);

      expect(result).toMatchObject({ ok: false, error: { type: 'ROLE_NOT_FOUND' } });
      expect(await userRoleIdsOf(targetUserId)).toEqual([]);
    });

    /**
     * @requirement user-authentication/REQ-25.3
     */
    it('2件目の削除の書き込みが失敗すると、1件目の削除も取り消されエラーを返す', async () => {
      await prisma.userRole.createMany({
        data: [roleAId, roleBId].map((roleId) => ({ userId: targetUserId, roleId })),
      });
      await injectFailure('ua355_fail_user_roles_delete', 'DELETE', `OLD."roleId" = '${roleBId}'`);

      const result = await userRoleService.removeRolesFromUser(targetUserId, [roleAId, roleBId]);

      expect(result).toMatchObject({ ok: false, error: { type: 'DATABASE_ERROR' } });
      expect(await userRoleIdsOf(targetUserId)).toEqual([roleAId, roleBId].sort());
    });

    /**
     * @requirement user-authentication/REQ-25.3
     */
    it('失敗が無ければ全ロールが割り当てられ、ロールごとに監査ログが残る', async () => {
      const result = await userRoleService.addRolesToUser(
        targetUserId,
        [roleAId, roleBId, roleCId],
        actorId
      );

      expect(result).toEqual({ ok: true, value: undefined });
      expect(await userRoleIdsOf(targetUserId)).toEqual([roleAId, roleBId, roleCId].sort());
      expect(await auditLogCountFor(targetUserId)).toBe(3);
    });
  });

  describe('監査ログの保存失敗（要件25.5）', () => {
    /**
     * @requirement user-authentication/REQ-25.5
     */
    it('ロール割り当ての監査ログが保存できないと、割り当てがロールバックされる', async () => {
      await injectFailure(
        'ua355_fail_audit_logs_insert',
        'INSERT',
        `NEW."targetId" = '${targetUserId}'`
      );

      const result = await userRoleService.addRoleToUser(targetUserId, roleAId, actorId);

      expect(result).toMatchObject({ ok: false, error: { type: 'DATABASE_ERROR' } });
      expect((result as { error: { message: string } }).error.message).toContain(INJECTED_MESSAGE);
      expect(await userRoleIdsOf(targetUserId)).toEqual([]);
    });

    /**
     * @requirement user-authentication/REQ-25.5
     */
    it('一括割り当ての監査ログが保存できないと、全ての割り当てがロールバックされる', async () => {
      await injectFailure(
        'ua355_fail_audit_logs_insert',
        'INSERT',
        `NEW."targetId" = '${targetUserId}' AND NEW."after"->>'roleId' = '${roleBId}'`
      );

      const result = await userRoleService.addRolesToUser(
        targetUserId,
        [roleAId, roleBId],
        actorId
      );

      expect(result).toMatchObject({ ok: false, error: { type: 'DATABASE_ERROR' } });
      expect(await userRoleIdsOf(targetUserId)).toEqual([]);
      expect(await auditLogCountFor(targetUserId)).toBe(0);
    });

    /**
     * @requirement user-authentication/REQ-25.5
     */
    it('権限割り当ての監査ログが保存できないと、権限の割り当てがロールバックされる', async () => {
      await injectFailure(
        'ua355_fail_audit_logs_insert',
        'INSERT',
        `NEW."targetId" = '${roleAId}'`
      );

      const result = await rolePermissionService.addPermissionToRole(roleAId, permAId, actorId);

      expect(result).toMatchObject({ ok: false, error: { type: 'DATABASE_ERROR' } });
      expect((result as { error: { message: string } }).error.message).toContain(INJECTED_MESSAGE);
      expect(await permissionIdsOf(roleAId)).toEqual([]);
    });

    /**
     * @requirement user-authentication/REQ-25.5
     */
    it('権限削除の監査ログが保存できないと、権限の削除が取り消される', async () => {
      await prisma.rolePermission.create({ data: { roleId: roleAId, permissionId: permAId } });
      await injectFailure(
        'ua355_fail_audit_logs_insert',
        'INSERT',
        `NEW."targetId" = '${roleAId}'`
      );

      const result = await rolePermissionService.removePermissionFromRole(
        roleAId,
        permAId,
        actorId
      );

      expect(result).toMatchObject({ ok: false, error: { type: 'DATABASE_ERROR' } });
      expect(await permissionIdsOf(roleAId)).toEqual([permAId]);
    });

    /**
     * @requirement user-authentication/REQ-25.5
     */
    it('後続のロール割り当てが失敗すると、先に記録した監査ログも残らない', async () => {
      // 1件目（ロールA）の割り当てと監査ログは成功し、2件目（ロールB）の割り当てで失敗する
      await injectFailure('ua355_fail_user_roles_insert', 'INSERT', `NEW."roleId" = '${roleBId}'`);

      const result = await userRoleService.addRolesToUser(
        targetUserId,
        [roleAId, roleBId],
        actorId
      );

      expect(result).toMatchObject({ ok: false, error: { type: 'DATABASE_ERROR' } });
      expect(await userRoleIdsOf(targetUserId)).toEqual([]);
      // 監査ログが元の操作と別に書き込まれていれば、取り消された割り当ての記録が残る
      expect(await auditLogCountFor(targetUserId)).toBe(0);
    });

    /**
     * @requirement user-authentication/REQ-25.5
     */
    it('後続の権限割り当てが失敗すると、先に記録した監査ログも残らない', async () => {
      await injectFailure(
        'ua355_fail_role_permissions_insert',
        'INSERT',
        `NEW."permissionId" = '${permBId}'`
      );

      const result = await rolePermissionService.addPermissionsToRole(
        roleAId,
        [permAId, permBId],
        actorId
      );

      expect(result).toMatchObject({ ok: false, error: { type: 'DATABASE_ERROR' } });
      expect(await permissionIdsOf(roleAId)).toEqual([]);
      expect(await auditLogCountFor(roleAId)).toBe(0);
    });
  });

  describe('ロール・権限の紐付け変更の整合性（要件25.7）', () => {
    /**
     * @requirement user-authentication/REQ-25.7
     */
    it('途中の権限が存在しないと、ロールの権限は変更前のまま PERMISSION_NOT_FOUND を返す', async () => {
      await prisma.rolePermission.create({ data: { roleId: roleAId, permissionId: permCId } });

      const result = await rolePermissionService.addPermissionsToRole(
        roleAId,
        [permAId, '00000000-0000-0000-0000-000000000000', permBId],
        actorId
      );

      expect(result).toMatchObject({ ok: false, error: { type: 'PERMISSION_NOT_FOUND' } });
      expect(await permissionIdsOf(roleAId)).toEqual([permCId]);
      expect(await auditLogCountFor(roleAId)).toBe(0);
    });

    /**
     * @requirement user-authentication/REQ-25.7
     */
    it('2件目の割り当ての書き込みが失敗すると、ロールの権限は変更前のままエラーを返す', async () => {
      await injectFailure(
        'ua355_fail_role_permissions_insert',
        'INSERT',
        `NEW."permissionId" = '${permBId}'`
      );

      const result = await rolePermissionService.addPermissionsToRole(roleAId, [permAId, permBId]);

      expect(result).toMatchObject({ ok: false, error: { type: 'DATABASE_ERROR' } });
      expect(await permissionIdsOf(roleAId)).toEqual([]);
    });

    /**
     * @requirement user-authentication/REQ-25.7
     */
    it('割り当てのない権限を含む一括削除は、先の削除も取り消し ASSIGNMENT_NOT_FOUND を返す', async () => {
      await prisma.rolePermission.createMany({
        data: [permAId, permBId].map((permissionId) => ({ roleId: roleAId, permissionId })),
      });

      const result = await rolePermissionService.removePermissionsFromRole(roleAId, [
        permAId,
        permCId,
      ]);

      expect(result).toMatchObject({ ok: false, error: { type: 'ASSIGNMENT_NOT_FOUND' } });
      expect(await permissionIdsOf(roleAId)).toEqual([permAId, permBId].sort());
    });

    /**
     * @requirement user-authentication/REQ-25.7
     */
    it('2件目の削除の書き込みが失敗すると、ロールの権限は変更前のままエラーを返す', async () => {
      await prisma.rolePermission.createMany({
        data: [permAId, permBId].map((permissionId) => ({ roleId: roleAId, permissionId })),
      });
      await injectFailure(
        'ua355_fail_role_permissions_delete',
        'DELETE',
        `OLD."permissionId" = '${permBId}'`
      );

      const result = await rolePermissionService.removePermissionsFromRole(
        roleAId,
        [permAId, permBId],
        actorId
      );

      expect(result).toMatchObject({ ok: false, error: { type: 'DATABASE_ERROR' } });
      expect(await permissionIdsOf(roleAId)).toEqual([permAId, permBId].sort());
      // 1件目の削除の監査ログも、取り消された削除とともに残らない
      expect(await auditLogCountFor(roleAId)).toBe(0);
    });

    /**
     * @requirement user-authentication/REQ-25.7
     */
    it('失敗が無ければ全権限が割り当てられ、権限ごとに監査ログが残る', async () => {
      const result = await rolePermissionService.addPermissionsToRole(
        roleAId,
        [permAId, permBId, permCId],
        actorId
      );

      expect(result).toEqual({ ok: true, value: undefined });
      expect(await permissionIdsOf(roleAId)).toEqual([permAId, permBId, permCId].sort());
      expect(await auditLogCountFor(roleAId)).toBe(3);
    });
  });

  describe('パスワードリセット要求（要件25.6）', () => {
    let queueAdd: ReturnType<typeof vi.fn>;
    let passwordService: PasswordService;
    const targetEmail = `${MARK}-target@example.com`;

    beforeEach(() => {
      // メールのキューだけを差し替え、EmailService・PasswordService・AuditLogService は本物を使う
      queueAdd = vi.fn().mockResolvedValue(undefined);
      const queue = { add: queueAdd, process: vi.fn() } as unknown as Queue;
      const unusedTransporter = { sendMail: vi.fn() } as unknown as Transporter;
      passwordService = new PasswordService(
        prisma,
        new EmailService(unusedTransporter, queue),
        auditLogService
      );
    });

    async function resetTokensOf(userId: string): Promise<string[]> {
      const rows = await prisma.passwordResetToken.findMany({
        where: { userId },
        select: { token: true },
      });
      return rows.map((r) => r.token);
    }

    async function resetAuditLogsOf(userId: string) {
      return prisma.auditLog.findMany({
        where: { targetId: userId, action: 'PASSWORD_RESET_REQUESTED' },
      });
    }

    /**
     * @requirement user-authentication/REQ-25.6
     */
    it('成功するとリセットトークンと監査ログが両方残り、コミット後にそのトークンでメールが投入される', async () => {
      const result = await passwordService.requestPasswordReset(targetEmail);

      expect(result).toEqual({ ok: true, value: undefined });
      const tokens = await resetTokensOf(targetUserId);
      expect(tokens).toHaveLength(1);
      const logs = await resetAuditLogsOf(targetUserId);
      expect(logs).toHaveLength(1);
      expect(logs[0]).toMatchObject({ actorId: targetUserId, targetType: 'user' });
      expect(queueAdd).toHaveBeenCalledTimes(1);
      expect(queueAdd).toHaveBeenCalledWith(
        'password-reset-email',
        { to: targetEmail, resetToken: tokens[0] },
        expect.any(Object)
      );
    });

    /**
     * @requirement user-authentication/REQ-25.6
     */
    it('監査ログの保存が失敗すると、トークンも監査ログも残らずメールも投入されない', async () => {
      await injectFailure(
        'ua355_fail_audit_logs_insert',
        'INSERT',
        `NEW."targetId" = '${targetUserId}'`
      );

      const result = await passwordService.requestPasswordReset(targetEmail);

      expect(result).toEqual({ ok: false, error: { type: 'RESET_TOKEN_INVALID' } });
      expect(await resetTokensOf(targetUserId)).toEqual([]);
      expect(await resetAuditLogsOf(targetUserId)).toEqual([]);
      expect(queueAdd).not.toHaveBeenCalled();
    });

    /**
     * @requirement user-authentication/REQ-25.6
     */
    it('コミットが失敗すると、トークンも監査ログも残らずメールも投入されない', async () => {
      // トランザクション内の書き込みはすべて成功し、COMMIT の時点で失敗する
      await injectCommitFailure(
        'ua355_fail_password_reset_tokens_commit',
        `NEW."userId" = '${targetUserId}'`
      );

      const result = await passwordService.requestPasswordReset(targetEmail);

      expect(result).toEqual({ ok: false, error: { type: 'RESET_TOKEN_INVALID' } });
      expect(await resetTokensOf(targetUserId)).toEqual([]);
      expect(await resetAuditLogsOf(targetUserId)).toEqual([]);
      // 投入がコミットの前にあれば、取り消されたトークンのメールが送られてしまう
      expect(queueAdd).not.toHaveBeenCalled();
    });

    /**
     * @requirement user-authentication/REQ-25.6
     */
    it('キューへの投入が失敗しても Ok を返し、トークンと監査ログはコミット済みで残る', async () => {
      queueAdd.mockRejectedValue(new Error('Redis connection refused'));

      const result = await passwordService.requestPasswordReset(targetEmail);

      expect(result).toEqual({ ok: true, value: undefined });
      expect(await resetTokensOf(targetUserId)).toHaveLength(1);
      expect(await resetAuditLogsOf(targetUserId)).toHaveLength(1);
      expect(queueAdd).toHaveBeenCalledTimes(1);
    });
  });
});
