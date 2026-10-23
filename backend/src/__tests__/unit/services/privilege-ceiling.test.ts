/**
 * @fileoverview 権限付与の上限（PrivilegeCeilingPolicy）の単体テスト（user-authentication タスク51.1）
 *
 * Requirements (user-authentication):
 * - REQ-38.1: 実行者の保有ロールの優先度の最大値を超えるロールの割り当てを拒否する
 * - REQ-38.2: システム管理者ロールを持たない実行者による全権限の追加と管理者ロールの割り当てを拒否する
 * - REQ-38.3: システムロールの名前の変更を拒否する
 *
 * 判定に使う読み出し（実行者の保有ロール・対象のロール）は Prisma の偽物で与える。
 * サービスの共通処理からの呼び出しと監査の記録は各サービスの単体テストで確かめる。
 */

import { describe, it, expect, vi } from 'vitest';
import type { PrismaClient } from '../../../generated/prisma/client.js';
import { PrivilegeCeilingPolicy } from '../../../services/privilege-ceiling.js';
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

/** 実行者の保有ロールと対象のロールを返す Prisma の偽物 */
function fakeDb(actorRoles: HeldRole[], target: TargetRole | null) {
  return {
    userRole: {
      findMany: vi.fn().mockResolvedValue(actorRoles.map((role) => ({ role }))),
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
     */
    it('全権限でない権限は admin ロールを持たない実行者でも追加できる', async () => {
      const db = fakeDb([MANAGER], null);

      const result = await policyWith(db).assertCanGrantPermission('actor-1', {
        resource: 'project',
        action: 'read',
      });

      expect(result).toEqual(Ok(undefined));
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
