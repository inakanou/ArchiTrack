/**
 * @fileoverview 権限付与の上限（PrivilegeCeilingPolicy）の単体テスト（user-authentication タスク51.1・58.1）
 *
 * Requirements (user-authentication):
 * - REQ-38.1: 実行者の保有ロールの優先度の最大値を超えるロールの割り当てを拒否する
 * - REQ-38.2: システム管理者ロールを持たない実行者による全権限の追加と管理者ロールの割り当てを拒否する
 * - REQ-38.3: システムロールの名前の変更を拒否する
 * - REQ-38.6: 既存のロールの優先度を、保有ロールの最高の優先度より高い値へ変更することを拒否する
 * - REQ-38.7: 保有ロールの最高の優先度より高い優先度のロールの作成を拒否する
 * - REQ-38.8: システム管理者ロールを持たない実行者による、保有しない権限の追加を拒否する
 * - REQ-38.9: 保有ロールの最高の優先度より高い優先度のロールの割り当てを他のユーザーから外すことを拒否する
 * - REQ-38.10: システム管理者ロールの優先度を超える優先度の指定を 400 の検証エラーにする（スキーマ）
 * - REQ-38.11: 現在の優先度が上限より高いロールの変更（優先度・権限の追加と削除）と削除を拒否する
 * - REQ-38.12: システムロールの優先度の変更を拒否する
 * - REQ-38.13: 保有ロールの最高の優先度より高い優先度のロールを持つ他のユーザーの管理（削除・無効化・
 *   再有効化・2FA の再設定）を拒否する
 *
 * 判定に使う読み出し（実行者の保有ロール・対象のロール）は Prisma の偽物で与える。
 * サービスの共通処理からの呼び出しと監査の記録は各サービスの単体テストで確かめる。
 */

import { describe, it, expect, vi } from 'vitest';
import type { PrismaClient } from '../../../generated/prisma/client.js';
import {
  PrivilegeCeilingPolicy,
  SYSTEM_ADMIN_ROLE_PRIORITY,
  permissionCovers,
} from '../../../services/privilege-ceiling.js';
import { updateRoleSchema, rolePrioritySchema } from '../../../schemas/auth-update.schema.js';
import { Err, Ok } from '../../../types/result.js';

interface HeldRole {
  name: string;
  priority: number;
}

interface TargetRole {
  name: string;
  priority: number;
  isSystem: boolean;
}

interface HeldPermission {
  resource: string;
  action: string;
}

/** 実行者の保有ロール・保有ロールの権限と対象のロールを返す Prisma の偽物 */
function fakeDb(
  actorRoles: HeldRole[],
  target: TargetRole | null,
  heldPermissions: HeldPermission[] = []
) {
  return {
    userRole: {
      findMany: vi.fn().mockResolvedValue(actorRoles.map((role) => ({ role }))),
    },
    rolePermission: {
      findMany: vi.fn().mockResolvedValue(heldPermissions.map((permission) => ({ permission }))),
    },
    role: {
      findUnique: vi.fn().mockResolvedValue(target),
    },
  };
}

function policyWith(db: ReturnType<typeof fakeDb>): PrivilegeCeilingPolicy {
  return new PrivilegeCeilingPolicy(db as unknown as PrismaClient);
}

const ADMIN: HeldRole = { name: 'admin', priority: 100 };
const MANAGER: HeldRole = { name: 'manager', priority: 50 };
const LEAD: HeldRole = { name: 'lead', priority: 70 };

describe('PrivilegeCeilingPolicy', () => {
  describe('assertCanAssignRole', () => {
    /**
     * @requirement user-authentication/REQ-38.1
     */
    it('priority 50 の実行者は priority 100 のロールを割り当てられない', async () => {
      const db = fakeDb([MANAGER], { name: 'director', priority: 100, isSystem: false });

      const result = await policyWith(db).assertCanAssignRole('actor-1', 'role-director');

      expect(result).toEqual(Err({ type: 'ROLE_PRIORITY_EXCEEDS_ACTOR' }));
      // 実行者の保有ロールと対象のロールを読んで判定する
      expect(db.userRole.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 'actor-1' } })
      );
      expect(db.role.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'role-director' } })
      );
    });

    /**
     * @requirement user-authentication/REQ-38.1
     */
    it('上限は保有ロールの priority の最大値で、上限ちょうどと上限より低いロールは割り当てられる', async () => {
      const equal = await policyWith(
        fakeDb([MANAGER, LEAD], { name: 'peer', priority: 70, isSystem: false })
      ).assertCanAssignRole('actor-1', 'role-peer');
      const lower = await policyWith(
        fakeDb([MANAGER, LEAD], { name: 'member', priority: 10, isSystem: false })
      ).assertCanAssignRole('actor-1', 'role-member');
      const above = await policyWith(
        fakeDb([MANAGER, LEAD], { name: 'senior', priority: 71, isSystem: false })
      ).assertCanAssignRole('actor-1', 'role-senior');

      expect(equal).toEqual(Ok(undefined));
      expect(lower).toEqual(Ok(undefined));
      expect(above).toEqual(Err({ type: 'ROLE_PRIORITY_EXCEEDS_ACTOR' }));
    });

    /**
     * @requirement user-authentication/REQ-38.1
     */
    it('ロールを一つも持たない実行者はどのロールも割り当てられない', async () => {
      const result = await policyWith(
        fakeDb([], { name: 'user', priority: 0, isSystem: true })
      ).assertCanAssignRole('actor-1', 'role-user');

      expect(result).toEqual(Err({ type: 'ROLE_PRIORITY_EXCEEDS_ACTOR' }));
    });

    /**
     * @requirement user-authentication/REQ-38.2
     */
    it('admin ロールを持たない実行者は、優先度が足りていても admin ロールを割り当てられない', async () => {
      const result = await policyWith(
        fakeDb([{ name: 'deputy', priority: 100 }], {
          name: 'admin',
          priority: 100,
          isSystem: true,
        })
      ).assertCanAssignRole('actor-1', 'role-admin');

      expect(result).toEqual(Err({ type: 'SYSTEM_ADMIN_REQUIRED' }));
    });

    /**
     * @requirement user-authentication/REQ-38.2
     */
    it('admin ロールを持つ実行者は admin ロールを割り当てられる', async () => {
      const result = await policyWith(
        fakeDb([ADMIN], { name: 'admin', priority: 100, isSystem: true })
      ).assertCanAssignRole('actor-1', 'role-admin');

      expect(result).toEqual(Ok(undefined));
    });

    it('対象のロールが無いときは判定せず、不在の判定を呼び出し側に委ねる', async () => {
      const result = await policyWith(fakeDb([], null)).assertCanAssignRole('actor-1', 'missing');

      expect(result).toEqual(Ok(undefined));
    });

    it('渡されたトランザクションのクライアントで読む', async () => {
      const unused = fakeDb([], null);
      const tx = fakeDb([MANAGER], { name: 'director', priority: 100, isSystem: false });

      const result = await policyWith(unused).assertCanAssignRole(
        'actor-1',
        'role-director',
        tx as never
      );

      expect(result).toEqual(Err({ type: 'ROLE_PRIORITY_EXCEEDS_ACTOR' }));
      expect(unused.userRole.findMany).not.toHaveBeenCalled();
      expect(unused.role.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('assertCanGrantPermission', () => {
    /**
     * @requirement user-authentication/REQ-38.2
     */
    it('admin ロールを持たない実行者は全権限（*:*）を追加できない', async () => {
      const result = await policyWith(
        fakeDb([{ name: 'deputy', priority: 100 }], null)
      ).assertCanGrantPermission('actor-1', { resource: '*', action: '*' });

      expect(result).toEqual(Err({ type: 'SYSTEM_ADMIN_REQUIRED' }));
    });

    /**
     * @requirement user-authentication/REQ-38.2
     */
    it('admin ロールを持つ実行者は全権限（*:*）を追加できる', async () => {
      const result = await policyWith(fakeDb([ADMIN], null)).assertCanGrantPermission('actor-1', {
        resource: '*',
        action: '*',
      });

      expect(result).toEqual(Ok(undefined));
    });

    /**
     * @requirement user-authentication/REQ-38.2
     * @requirement user-authentication/REQ-38.8
     */
    it('全権限でない権限は、admin ロールを持たない実行者でも保有していれば追加できる', async () => {
      const db = fakeDb([MANAGER], null, [{ resource: 'project', action: 'read' }]);

      const result = await policyWith(db).assertCanGrantPermission('actor-1', {
        resource: 'project',
        action: 'read',
      });

      expect(result).toEqual(Ok(undefined));
      // 保有する権限は実行者の保有ロールの権限を DB から読む
      expect(db.rolePermission.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { role: { userRoles: { some: { userId: 'actor-1' } } } },
        })
      );
    });

    /**
     * @requirement user-authentication/REQ-38.8
     */
    it('admin ロールを持たない実行者は、保有しない権限を追加できない', async () => {
      const result = await policyWith(
        fakeDb([MANAGER], null, [{ resource: 'project', action: 'read' }])
      ).assertCanGrantPermission('actor-1', { resource: 'project', action: 'update' });

      expect(result).toEqual(Err({ type: 'PERMISSION_NOT_HELD_BY_ACTOR' }));
    });

    /**
     * @requirement user-authentication/REQ-38.8
     */
    it('保有する権限はワイルドカードの照合で判定する（project:* は project:update を包含し *:update は包含しない）', async () => {
      const held = [{ resource: 'project', action: '*' }];
      const concrete = await policyWith(fakeDb([MANAGER], null, held)).assertCanGrantPermission(
        'actor-1',
        { resource: 'project', action: 'update' }
      );
      const sameWildcard = await policyWith(fakeDb([MANAGER], null, held)).assertCanGrantPermission(
        'actor-1',
        { resource: 'project', action: '*' }
      );
      const crossResource = await policyWith(
        fakeDb([MANAGER], null, held)
      ).assertCanGrantPermission('actor-1', { resource: '*', action: 'update' });

      expect(concrete).toEqual(Ok(undefined));
      expect(sameWildcard).toEqual(Ok(undefined));
      expect(crossResource).toEqual(Err({ type: 'PERMISSION_NOT_HELD_BY_ACTOR' }));
    });

    /**
     * @requirement user-authentication/REQ-38.8
     */
    it('具体の権限だけを持つ実行者はワイルドカードの権限（project:*）を追加できない', async () => {
      const result = await policyWith(
        fakeDb([MANAGER], null, [
          { resource: 'project', action: 'read' },
          { resource: 'project', action: 'update' },
        ])
      ).assertCanGrantPermission('actor-1', { resource: 'project', action: '*' });

      expect(result).toEqual(Err({ type: 'PERMISSION_NOT_HELD_BY_ACTOR' }));
    });

    /**
     * @requirement user-authentication/REQ-38.8
     */
    it('admin ロールを持つ実行者は保有の照合なしに任意の権限を追加できる', async () => {
      const db = fakeDb([ADMIN], null, []);

      const result = await policyWith(db).assertCanGrantPermission('actor-1', {
        resource: 'project',
        action: 'update',
      });

      expect(result).toEqual(Ok(undefined));
      expect(db.rolePermission.findMany).not.toHaveBeenCalled();
    });

    /**
     * @requirement user-authentication/REQ-38.8
     */
    it('渡されたトランザクションのクライアントで保有する権限を読む', async () => {
      const unused = fakeDb([], null);
      const tx = fakeDb([MANAGER], null, []);

      const result = await policyWith(unused).assertCanGrantPermission(
        'actor-1',
        { resource: 'project', action: 'update' },
        tx as never
      );

      expect(result).toEqual(Err({ type: 'PERMISSION_NOT_HELD_BY_ACTOR' }));
      expect(tx.rolePermission.findMany).toHaveBeenCalled();
      expect(unused.rolePermission.findMany).not.toHaveBeenCalled();
      expect(unused.userRole.findMany).not.toHaveBeenCalled();
    });
  });

  describe('permissionCovers（要件21 のワイルドカードの照合）', () => {
    /**
     * @requirement user-authentication/REQ-38.8
     */
    it('*:*・*:action・resource:*・完全一致で包含し、それ以外は包含しない', () => {
      const update = { resource: 'project', action: 'update' };
      expect(permissionCovers({ resource: '*', action: '*' }, update)).toBe(true);
      expect(permissionCovers({ resource: '*', action: 'update' }, update)).toBe(true);
      expect(permissionCovers({ resource: 'project', action: '*' }, update)).toBe(true);
      expect(permissionCovers({ resource: 'project', action: 'update' }, update)).toBe(true);
      expect(permissionCovers({ resource: 'project', action: 'read' }, update)).toBe(false);
      expect(permissionCovers({ resource: 'estimate', action: '*' }, update)).toBe(false);
      expect(permissionCovers({ resource: '*', action: 'read' }, update)).toBe(false);
    });
  });

  describe('assertCanSetRolePriority', () => {
    /**
     * @requirement user-authentication/REQ-38.6
     * @requirement user-authentication/REQ-38.7
     */
    it('priority 50 の実行者は 51 を指定できず、上限ちょうどの 50 と上限より低い値は指定できる', async () => {
      const above = await policyWith(fakeDb([MANAGER], null)).assertCanSetRolePriority(
        'actor-1',
        51
      );
      const equal = await policyWith(fakeDb([MANAGER], null)).assertCanSetRolePriority(
        'actor-1',
        50
      );
      const lower = await policyWith(fakeDb([MANAGER], null)).assertCanSetRolePriority(
        'actor-1',
        40
      );

      expect(above).toEqual(Err({ type: 'ROLE_PRIORITY_EXCEEDS_ACTOR' }));
      expect(equal).toEqual(Ok(undefined));
      expect(lower).toEqual(Ok(undefined));
    });

    /**
     * @requirement user-authentication/REQ-38.7
     */
    it('上限は保有ロールの priority の最大値で、ロールを持たない実行者は 0 も指定できない', async () => {
      const multi = await policyWith(fakeDb([MANAGER, LEAD], null)).assertCanSetRolePriority(
        'actor-1',
        70
      );
      const none = await policyWith(fakeDb([], null)).assertCanSetRolePriority('actor-1', 0);

      expect(multi).toEqual(Ok(undefined));
      expect(none).toEqual(Err({ type: 'ROLE_PRIORITY_EXCEEDS_ACTOR' }));
    });

    /**
     * @requirement user-authentication/REQ-38.6
     */
    it('渡されたトランザクションのクライアントで実行者の保有ロールを読む', async () => {
      const unused = fakeDb([], null);
      const tx = fakeDb([MANAGER], null);

      const result = await policyWith(unused).assertCanSetRolePriority('actor-1', 51, tx as never);

      expect(result).toEqual(Err({ type: 'ROLE_PRIORITY_EXCEEDS_ACTOR' }));
      expect(tx.userRole.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 'actor-1' } })
      );
      expect(unused.userRole.findMany).not.toHaveBeenCalled();
    });
  });

  describe('assertCanModifyRole', () => {
    /**
     * @requirement user-authentication/REQ-38.11
     */
    it('priority 50 の実行者は現在の priority が 80 のロールを変更・削除できず、50 のロールはできる', async () => {
      const higherDb = fakeDb([MANAGER], { name: 'director', priority: 80, isSystem: false });
      const higher = await policyWith(higherDb).assertCanModifyRole('actor-1', 'role-director');
      const equal = await policyWith(
        fakeDb([MANAGER], { name: 'peer', priority: 50, isSystem: false })
      ).assertCanModifyRole('actor-1', 'role-peer');

      expect(higher).toEqual(Err({ type: 'ROLE_PRIORITY_EXCEEDS_ACTOR' }));
      expect(higherDb.role.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'role-director' } })
      );
      expect(equal).toEqual(Ok(undefined));
    });

    /**
     * @requirement user-authentication/REQ-38.11
     */
    it('admin ロールを持つ実行者は admin ロール（100）を変更できる', async () => {
      const result = await policyWith(
        fakeDb([ADMIN], { name: 'admin', priority: 100, isSystem: true })
      ).assertCanModifyRole('actor-1', 'role-admin');

      expect(result).toEqual(Ok(undefined));
    });

    it('対象のロールが無いときは判定せず、不在の判定を呼び出し側に委ねる', async () => {
      const result = await policyWith(fakeDb([], null)).assertCanModifyRole('actor-1', 'missing');

      expect(result).toEqual(Ok(undefined));
    });
  });

  describe('assertCanChangeRolePriority', () => {
    /**
     * @requirement user-authentication/REQ-38.12
     */
    it('システムロールの優先度の変更を拒否する', async () => {
      const db = fakeDb([ADMIN], { name: 'admin', priority: 100, isSystem: true });

      const result = await policyWith(db).assertCanChangeRolePriority('role-admin');

      expect(result).toEqual(Err({ type: 'SYSTEM_ROLE_PRIORITY_CHANGE_FORBIDDEN' }));
      expect(db.role.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'role-admin' } })
      );
      // 実行者によらず拒否する（実行者の保有ロールを読まない）
      expect(db.userRole.findMany).not.toHaveBeenCalled();
    });

    /**
     * @requirement user-authentication/REQ-38.12
     */
    it('システムロールでないロールの優先度の変更は許す', async () => {
      const result = await policyWith(
        fakeDb([], { name: 'developer', priority: 50, isSystem: false })
      ).assertCanChangeRolePriority('role-developer');

      expect(result).toEqual(Ok(undefined));
    });
  });

  describe('assertCanRevokeRole', () => {
    /**
     * @requirement user-authentication/REQ-38.9
     */
    it('priority 50 の実行者は他の利用者から 51 のロールを外せず、上限ちょうどの 50 は外せる', async () => {
      const above = await policyWith(
        fakeDb([MANAGER], { name: 'senior', priority: 51, isSystem: false })
      ).assertCanRevokeRole('actor-1', 'user-2', 'role-senior');
      const equal = await policyWith(
        fakeDb([MANAGER], { name: 'peer', priority: 50, isSystem: false })
      ).assertCanRevokeRole('actor-1', 'user-2', 'role-peer');

      expect(above).toEqual(Err({ type: 'ROLE_PRIORITY_EXCEEDS_ACTOR' }));
      expect(equal).toEqual(Ok(undefined));
    });

    /**
     * @requirement user-authentication/REQ-38.9
     */
    it('自分からの解除は判定しない', async () => {
      const db = fakeDb([MANAGER], { name: 'senior', priority: 51, isSystem: false });

      const result = await policyWith(db).assertCanRevokeRole('actor-1', 'actor-1', 'role-senior');

      expect(result).toEqual(Ok(undefined));
      expect(db.role.findUnique).not.toHaveBeenCalled();
    });

    it('対象のロールが無いときは判定せず、不在の判定を呼び出し側に委ねる', async () => {
      const result = await policyWith(fakeDb([], null)).assertCanRevokeRole(
        'actor-1',
        'user-2',
        'missing'
      );

      expect(result).toEqual(Ok(undefined));
    });
  });

  describe('assertCanManageUser', () => {
    /** 利用者ごとの保有ロール（実行者・対象）と、ロックの呼び出しを記録する Prisma の偽物 */
    function fakeUsersDb(rolesByUser: Record<string, HeldRole[]>) {
      const order: string[] = [];
      const db = {
        userRole: {
          findMany: vi.fn(async (args: { where: { userId: string } }) => {
            order.push(`roles:${args.where.userId}`);
            return (rolesByUser[args.where.userId] ?? []).map((role) => ({ role }));
          }),
        },
        $executeRaw: vi.fn(async (strings: TemplateStringsArray) => {
          order.push(strings.join('?').includes('pg_advisory_xact_lock') ? 'advisory' : 'execute');
          return 1;
        }),
        $queryRaw: vi.fn(async (strings: TemplateStringsArray) => {
          order.push(strings.join('?'));
          return [];
        }),
      };
      return { db, order };
    }

    function manageWith(db: ReturnType<typeof fakeUsersDb>['db']): PrivilegeCeilingPolicy {
      return new PrivilegeCeilingPolicy(db as unknown as PrismaClient);
    }

    /**
     * @requirement user-authentication/REQ-38.13
     */
    it('対象の保有ロールの優先度の最大値が実行者の上限を超えると TARGET_USER_EXCEEDS_ACTOR で拒否する', async () => {
      const { db } = fakeUsersDb({
        'actor-1': [MANAGER],
        'user-2': [{ name: 'member', priority: 10 }, LEAD],
      });

      const result = await manageWith(db).assertCanManageUser('actor-1', 'user-2');

      expect(result).toEqual(Err({ type: 'TARGET_USER_EXCEEDS_ACTOR', targetPriority: 70 }));
    });

    /**
     * @requirement user-authentication/REQ-38.13
     */
    it('上限より低い・上限ちょうどの対象と、ロールを持たない対象は許す', async () => {
      const below = await manageWith(
        fakeUsersDb({ 'actor-1': [MANAGER], 'user-2': [{ name: 'member', priority: 10 }] }).db
      ).assertCanManageUser('actor-1', 'user-2');
      const equal = await manageWith(
        fakeUsersDb({ 'actor-1': [MANAGER], 'user-2': [{ name: 'peer', priority: 50 }] }).db
      ).assertCanManageUser('actor-1', 'user-2');
      const noRoles = await manageWith(
        fakeUsersDb({ 'actor-1': [MANAGER], 'user-2': [] }).db
      ).assertCanManageUser('actor-1', 'user-2');

      expect(below).toEqual(Ok(undefined));
      expect(equal).toEqual(Ok(undefined));
      expect(noRoles).toEqual(Ok(undefined));
    });

    /**
     * @requirement user-authentication/REQ-38.13
     */
    it('ロールを持たない実行者は、ロールを持つ対象を管理できず、ロールを持たない対象は管理できる', async () => {
      const withRole = await manageWith(
        fakeUsersDb({ 'actor-1': [], 'user-2': [{ name: 'user', priority: 0 }] }).db
      ).assertCanManageUser('actor-1', 'user-2');
      const withoutRole = await manageWith(
        fakeUsersDb({ 'actor-1': [], 'user-2': [] }).db
      ).assertCanManageUser('actor-1', 'user-2');

      expect(withRole).toEqual(Err({ type: 'TARGET_USER_EXCEEDS_ACTOR', targetPriority: 0 }));
      expect(withoutRole).toEqual(Ok(undefined));
    });

    it('admin 同士の操作は許す', async () => {
      const result = await manageWith(
        fakeUsersDb({ 'actor-1': [ADMIN], 'user-2': [ADMIN, MANAGER] }).db
      ).assertCanManageUser('actor-1', 'user-2');

      expect(result).toEqual(Ok(undefined));
    });

    /**
     * @requirement user-authentication/REQ-38.13
     */
    it('対象が実行者自身のときは判定せず、ロックも読み出しもしない', async () => {
      const { db } = fakeUsersDb({ 'actor-1': [MANAGER] });

      const result = await manageWith(db).assertCanManageUser('actor-1', 'actor-1');

      expect(result).toEqual(Ok(undefined));
      expect(db.$queryRaw).not.toHaveBeenCalled();
      expect(db.$executeRaw).not.toHaveBeenCalled();
      expect(db.userRole.findMany).not.toHaveBeenCalled();
    });

    it('渡されたクライアントで、取引ロック → 対象の users の行の FOR UPDATE → 保有ロールの順に読む', async () => {
      const { db, order } = fakeUsersDb({ 'actor-1': [MANAGER], 'user-2': [LEAD] });
      const unused = fakeUsersDb({});

      await manageWith(unused.db).assertCanManageUser('actor-1', 'user-2', db as never);

      expect(unused.db.$queryRaw).not.toHaveBeenCalled();
      expect(order[0]).toBe('advisory');
      expect(order[1]).toMatch(/SELECT id FROM users WHERE id = \? FOR UPDATE/);
      expect(db.$queryRaw.mock.calls[0]!.slice(1)).toEqual(['user-2']);
      expect(db.$executeRaw.mock.calls[0]!.slice(1)).toContain('user-2');
      expect(order.slice(2).sort()).toEqual(['roles:actor-1', 'roles:user-2']);
    });
  });

  describe('優先度の範囲の検証（ロールの作成・変更のスキーマ）', () => {
    /**
     * @requirement user-authentication/REQ-38.10
     */
    it('システム管理者ロールの優先度（100）を超える値は検証エラーになり、等しい値は通る', () => {
      expect(SYSTEM_ADMIN_ROLE_PRIORITY).toBe(100);
      expect(rolePrioritySchema.safeParse(101).success).toBe(false);
      expect(rolePrioritySchema.safeParse(100).success).toBe(true);
      expect(updateRoleSchema.safeParse({ priority: 101 }).success).toBe(false);
      expect(updateRoleSchema.safeParse({ priority: 100 }).success).toBe(true);
    });
  });

  describe('assertCanRenameRole', () => {
    /**
     * @requirement user-authentication/REQ-38.3
     */
    it('システムロールの名前の変更を拒否する', async () => {
      const db = fakeDb([], { name: 'user', priority: 0, isSystem: true });

      const result = await policyWith(db).assertCanRenameRole('role-user');

      expect(result).toEqual(Err({ type: 'SYSTEM_ROLE_RENAME_FORBIDDEN' }));
      expect(db.role.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'role-user' } })
      );
    });

    /**
     * @requirement user-authentication/REQ-38.3
     */
    it('システムロールでないロールの名前の変更は許す', async () => {
      const result = await policyWith(
        fakeDb([], { name: 'developer', priority: 50, isSystem: false })
      ).assertCanRenameRole('role-developer');

      expect(result).toEqual(Ok(undefined));
    });
  });
});
