/**
 * @fileoverview 監査ログの実行者の写しと改変の禁止の統合検証（タスク44.2）
 *
 * design.md「監査」の AuditLogService の節と Physical Data Model のとおり、
 * - `audit_logs.actor_id` は利用者への外部キーを持たず、記録時に実行者のメールアドレスと表示名を写す（要件40.7）
 * - トリガー `audit_logs_immutable` が UPDATE を常に拒否し、DELETE はセッション変数
 *   `architrack.audit_archive` が `'on'` のトランザクションの中でだけ許す（要件40.8）
 * ことを実データベースで確かめる。
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import type { PrismaClient } from '../../generated/prisma/client.js';
import getPrismaClient from '../../db.js';
import { AuditLogService } from '../../services/audit-log.service.js';
import { UserRoleService } from '../../services/user-role.service.js';
import {
  AUDIT_ARCHIVE_SETTING,
  deleteAuditLogsWithArchivePermission,
} from '../../utils/audit-log-archive-permission.js';
import { createTestUser } from './test-user-factory.js';

const MARK = 'test-ua442-audit-protection';

describe('監査ログの実行者の写しと改変の禁止（統合）', () => {
  let prisma: PrismaClient;
  let auditLogService: AuditLogService;
  let actorId: string;

  async function cleanup(): Promise<void> {
    const users = await prisma.user.findMany({
      where: { email: { contains: MARK } },
      select: { id: true },
    });
    const userIds = users.map((u) => u.id);
    await deleteAuditLogsWithArchivePermission(prisma, {
      OR: [{ actorId: { in: userIds } }, { targetType: MARK }],
    });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  }

  async function createLog(): Promise<string> {
    const log = await auditLogService.createLog({
      action: 'USER_UPDATED',
      actorId,
      targetType: MARK,
      targetId: 'target-1',
      before: { displayName: 'before' },
      after: { displayName: 'after' },
    });
    return log.id;
  }

  beforeAll(() => {
    prisma = getPrismaClient();
    auditLogService = new AuditLogService({ prisma });
  });

  beforeEach(async () => {
    await cleanup();
    const actor = await createTestUser(prisma, {
      email: `${MARK}-actor@example.com`,
      displayName: '監査 実行者',
      passwordHash: 'not-used-in-this-test',
    });
    actorId = actor.id;
  });

  afterAll(async () => {
    await cleanup();
  });

  describe('実行者の写し', () => {
    /**
     * @requirement user-authentication/REQ-40.7: 記録時に実行者のメールアドレスと表示名を写す
     */
    it('記録が実行者のメールアドレスと表示名の写しを書き、一覧が写しを返す', async () => {
      const id = await createLog();

      const row = await prisma.auditLog.findUniqueOrThrow({
        where: { id },
        select: { actorId: true, actorEmail: true, actorDisplayName: true },
      });
      expect(row).toEqual({
        actorId,
        actorEmail: `${MARK}-actor@example.com`,
        actorDisplayName: '監査 実行者',
      });

      const logs = await auditLogService.getLogs({ actorId });
      expect(logs).toHaveLength(1);
      expect(logs[0]).toMatchObject({
        id,
        actorId,
        actorEmail: `${MARK}-actor@example.com`,
        actorDisplayName: '監査 実行者',
      });
    });

    /**
     * @requirement user-authentication/REQ-40.7: 実行者の利用者を削除しても監査ログを削除せず、実行者を識別できる情報を保持する
     */
    it('実行者の利用者を削除しても監査ログが写しとともに残る', async () => {
      const id = await createLog();
      // 削除する利用者を管理者以外にしておく（最後の管理者の保護に当たらない）
      const userRoleService = new UserRoleService(prisma);

      const result = await userRoleService.deleteUser(actorId);

      expect(result.ok).toBe(true);
      expect(await prisma.user.findUnique({ where: { id: actorId } })).toBeNull();
      const logs = await auditLogService.getLogs({ actorId });
      expect(logs).toHaveLength(1);
      expect(logs[0]).toMatchObject({
        id,
        actorId,
        actorEmail: `${MARK}-actor@example.com`,
        actorDisplayName: '監査 実行者',
      });
    });
  });

  describe('改変の禁止', () => {
    /**
     * @requirement user-authentication/REQ-40.8: 監査ログの更新を拒否する
     */
    it('監査ログの更新は失敗し、行は変わらない', async () => {
      const id = await createLog();

      await expect(
        prisma.auditLog.update({ where: { id }, data: { action: 'USER_DELETED' } })
      ).rejects.toThrow(/audit_logs/);
      await expect(
        prisma.$executeRaw`UPDATE "audit_logs" SET "targetId" = 'tampered' WHERE "id" = ${id}`
      ).rejects.toThrow(/audit_logs/);

      const row = await prisma.auditLog.findUniqueOrThrow({ where: { id } });
      expect(row.action).toBe('USER_UPDATED');
      expect(row.targetId).toBe('target-1');
    });

    /**
     * @requirement user-authentication/REQ-40.8: アーカイブの許可の設定の無い取引でも、許可の取引の中でも、更新は拒否する
     */
    it('アーカイブの許可の設定の中でも更新は失敗する', async () => {
      const id = await createLog();

      await expect(
        prisma.$transaction(async (tx) => {
          await tx.$queryRaw`SELECT set_config(${AUDIT_ARCHIVE_SETTING}, 'on', true)`;
          await tx.auditLog.update({ where: { id }, data: { action: 'USER_DELETED' } });
        })
      ).rejects.toThrow(/audit_logs/);

      const row = await prisma.auditLog.findUniqueOrThrow({ where: { id } });
      expect(row.action).toBe('USER_UPDATED');
    });

    /**
     * @requirement user-authentication/REQ-40.8: アーカイブの許可の設定の無い監査ログの削除を拒否する
     */
    it('許可の設定の無い削除は失敗し、行が残る', async () => {
      const id = await createLog();

      await expect(prisma.auditLog.delete({ where: { id } })).rejects.toThrow(/audit_logs/);
      await expect(prisma.auditLog.deleteMany({ where: { id } })).rejects.toThrow(/audit_logs/);
      await expect(prisma.$executeRaw`DELETE FROM "audit_logs" WHERE "id" = ${id}`).rejects.toThrow(
        /audit_logs/
      );
      // 許可の値が 'on' 以外なら拒否する
      await expect(
        prisma.$transaction(async (tx) => {
          await tx.$queryRaw`SELECT set_config(${AUDIT_ARCHIVE_SETTING}, 'off', true)`;
          await tx.auditLog.deleteMany({ where: { id } });
        })
      ).rejects.toThrow(/audit_logs/);

      expect(await prisma.auditLog.count({ where: { id } })).toBe(1);
    });

    /**
     * @requirement user-authentication/REQ-40.8: アーカイブによる移動（許可の設定の取引）の削除だけを許す
     */
    it('アーカイブの許可の設定の取引の中では削除でき、許可は取引の外へ漏れない', async () => {
      const kept = await createLog();
      const removed = await createLog();

      const count = await deleteAuditLogsWithArchivePermission(prisma, { id: removed });

      expect(count).toBe(1);
      expect(await prisma.auditLog.count({ where: { id: removed } })).toBe(0);
      // 取引の後の同じクライアントの削除は再び拒否される（set_config の第3引数 true で取引に閉じる）
      await expect(prisma.auditLog.deleteMany({ where: { id: kept } })).rejects.toThrow(
        /audit_logs/
      );
      expect(await prisma.auditLog.count({ where: { id: kept } })).toBe(1);
    });
  });
});
