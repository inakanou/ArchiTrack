/**
 * @fileoverview 利用者の削除の削除前の監査の統合検証（user-authentication タスク53.2）
 *
 * Requirements (user-authentication):
 * - REQ-40.6: 削除の完了前に実行者と削除対象を監査ログに記録し、記録に失敗した場合は削除を中止する
 *
 * design.md「監査」の AuditLogService の節のとおり、`UserRoleService.deleteUser` は削除のトランザクションの
 * 中で、削除の書き込みの前に `USER_DELETED`（実行者・削除対象のメールアドレスと表示名）を記録し、
 * 記録の失敗でトランザクションごと中止する。本物のアプリ（app.ts のルート・authenticate・
 * requirePermission・ルートが組み立てる UserRoleService と AuditLogService）と実データベースを通す。
 *
 * 記録の失敗は、ルートが使う AuditLogService の createLog を USER_DELETED のときだけ失敗させて起こす
 * （書き込みの前に投げる場合と、同じトランザクションへ行を書いた後に投げる場合）。監査ログは削除できない
 * （トリガー audit_logs_immutable）ため、行は削除対象の利用者の ID で数える。
 */

import { randomBytes } from 'crypto';
import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll, vi } from 'vitest';
import request from 'supertest';
import { validateEnv } from '../../config/env.js';
import type { Prisma, PrismaClient } from '../../generated/prisma/client.js';

// 環境変数を初期化（トークン発行の鍵を読むため、アプリとサービスのインポート前に実行）
validateEnv();

import app from '../../app.js';
import getPrismaClient from '../../db.js';
import redis, { initRedis } from '../../redis.js';
import tokenService from '../../services/token.service.js';
import { AuditLogService } from '../../services/audit-log.service.js';
import type { CreateAuditLogInput } from '../../types/audit-log.types.js';
import { deleteAuditLogsWithArchivePermission } from '../../utils/audit-log-archive-permission.js';
import { createTestUser } from './test-user-factory.js';

const MARK = 'test-ua532-user-delete-audit';

describe('利用者の削除の削除前の監査（統合・実 DB）', () => {
  let prisma: PrismaClient;
  let deleterRoleId: string;
  let memberRoleId: string;
  let actor: { id: string; email: string; displayName: string; token: string };

  async function cleanup(): Promise<void> {
    const users = await prisma.user.findMany({
      where: { email: { contains: MARK } },
      select: { id: true },
    });
    const ids = users.map((u) => u.id);
    await deleteAuditLogsWithArchivePermission(prisma, {
      OR: [{ actorId: { in: ids } }, { targetId: { in: ids } }],
    });
    await prisma.userRole.deleteMany({ where: { userId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await prisma.rolePermission.deleteMany({ where: { role: { name: { startsWith: MARK } } } });
    await prisma.role.deleteMany({ where: { name: { startsWith: MARK } } });
  }

  async function createUserWithRole(
    label: string,
    roleId: string
  ): Promise<{ id: string; email: string; displayName: string }> {
    const email = `${MARK}-${label}-${randomBytes(4).toString('hex')}@example.com`;
    const displayName = `${MARK} ${label}`;
    const user = await createTestUser(prisma, { email, displayName, passwordHash: 'not-used' });
    await prisma.userRole.create({ data: { userId: user.id, roleId } });
    return { id: user.id, email, displayName };
  }

  function deleteUserAsActor(userId: string): request.Test {
    return request(app)
      .delete(`/api/v1/users/${userId}`)
      .set('Authorization', `Bearer ${actor.token}`);
  }

  function countDeletionRecords(userId: string): Promise<number> {
    return prisma.auditLog.count({ where: { action: 'USER_DELETED', targetId: userId } });
  }

  /** ルートの AuditLogService の記録を、USER_DELETED のときだけ失敗させる（他の記録は本物を通す） */
  function failDeletionRecord(writeRowBeforeFailing: boolean): void {
    const original = AuditLogService.prototype.createLog;
    vi.spyOn(AuditLogService.prototype, 'createLog').mockImplementation(async function (
      this: AuditLogService,
      input: CreateAuditLogInput,
      tx?: Prisma.TransactionClient
    ) {
      if (input.action !== 'USER_DELETED') {
        return original.call(this, input, tx);
      }
      if (writeRowBeforeFailing) {
        // 同じトランザクションへ行を書いた後に失敗する（行もロールバックされなければならない）
        await original.call(this, input, tx);
      }
      throw new Error('injected audit write failure');
    });
  }

  beforeAll(async () => {
    prisma = getPrismaClient();
    await initRedis();
    await cleanup();

    const deletePermission = await prisma.permission.upsert({
      where: { resource_action: { resource: 'user', action: 'delete' } },
      update: {},
      create: { resource: 'user', action: 'delete', description: 'user:delete' },
    });
    const deleterRole = await prisma.role.create({
      data: { name: `${MARK}-deleter`, description: MARK, priority: 0, isSystem: false },
    });
    deleterRoleId = deleterRole.id;
    await prisma.rolePermission.create({
      data: { roleId: deleterRoleId, permissionId: deletePermission.id },
    });
    const memberRole = await prisma.role.create({
      data: { name: `${MARK}-member`, description: MARK, priority: 0, isSystem: false },
    });
    memberRoleId = memberRole.id;

    const created = await createUserWithRole('actor', deleterRoleId);
    const token = await tokenService.generateAccessToken({
      userId: created.id,
      email: created.email,
      roles: [],
      accessTokenGeneration: 0,
    });
    actor = { ...created, token };
  });

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await cleanup();
    await redis.disconnect();
  });

  /**
   * @requirement user-authentication/REQ-40.6: 削除の完了前に実行者と削除対象を監査ログに記録する
   */
  it('削除すると、実行者と削除対象のメールアドレス・表示名を持つ USER_DELETED が残る', async () => {
    const target = await createUserWithRole('target', memberRoleId);

    const response = await deleteUserAsActor(target.id);

    expect(response.status).toBe(204);
    expect(await prisma.user.findUnique({ where: { id: target.id } })).toBeNull();
    const records = await prisma.auditLog.findMany({
      where: { action: 'USER_DELETED', targetId: target.id },
    });
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      actorId: actor.id,
      actorEmail: actor.email,
      actorDisplayName: actor.displayName,
      targetType: 'User',
      targetId: target.id,
      before: { id: target.id, email: target.email, displayName: target.displayName },
    });
  });

  /**
   * @requirement user-authentication/REQ-40.6: 記録に失敗した場合は削除を中止する
   */
  it.each([
    ['書き込みの前に失敗する', false],
    ['同じトランザクションへ行を書いた後に失敗する', true],
  ] as const)(
    '記録が%sと、削除は中止され、利用者とロールの割り当てが残り、削除の記録も残らない',
    async (_label, writeRowBeforeFailing) => {
      const target = await createUserWithRole('kept', memberRoleId);
      failDeletionRecord(writeRowBeforeFailing);

      const response = await deleteUserAsActor(target.id);

      expect(response.status).toBe(500);
      expect(AuditLogService.prototype.createLog).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'USER_DELETED', targetId: target.id }),
        expect.anything()
      );
      expect(await prisma.user.findUnique({ where: { id: target.id } })).toMatchObject({
        id: target.id,
        email: target.email,
      });
      expect(
        await prisma.userRole.count({ where: { userId: target.id, roleId: memberRoleId } })
      ).toBe(1);
      expect(await countDeletionRecords(target.id)).toBe(0);
    }
  );

  /**
   * @requirement user-authentication/REQ-40.6: 削除しないときは削除の記録を残さない
   */
  it('存在しない利用者の削除は 404 となり、削除の記録を残さない', async () => {
    const missingId = `${MARK}-missing-${randomBytes(4).toString('hex')}`;

    const response = await deleteUserAsActor(missingId);

    expect(response.status).toBe(404);
    expect(await countDeletionRecords(missingId)).toBe(0);
  });
});
