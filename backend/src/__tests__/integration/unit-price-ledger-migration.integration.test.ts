/**
 * @fileoverview 単価台帳の migration の統合検証（unit-price-ledger タスク 1.2）
 *
 * テスト用の実データベース（移行 `20261116000000_unit_price_ledger` が適用済み）で、
 * 台帳の欄・索引・拡張・権限が入っていることを確かめる。
 *
 * 確かめること:
 * - 10.3: 権限 `unit_price_ledger:manage`（台帳の管理）があり、既定のロールでは
 *   システム管理者（`admin` の `*:*`）だけが持ち、一般ユーザー（`user`）は持たない
 * - 2.14: カードの ID（ledger_card_id）は、論理削除されていない受領見積書の中で一意。
 *   論理削除された行と同じ ID は登録できる
 * - 名称の近さの検索（要件 7）のため、pg_trgm が有効で、明細行の名称に GIN の 3 文字組の索引がある
 * - migration は動いている環境へやり直して入れられる（IF NOT EXISTS・ON CONFLICT DO NOTHING）
 *
 * Design: Components > UnitPriceLedgerPermissionMigration、Data Models > Physical Data Model
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import pg from 'pg';
import { validateEnv } from '../../config/env.js';
import { Prisma, type PrismaClient } from '../../generated/prisma/client.js';

// 環境変数を初期化（サービスのインポート前に実行）
validateEnv();

import getPrismaClient from '../../db.js';
import { getSharedRBACService } from '../../services/rbac.service.js';
import { seedPermissions, seedRolePermissions, seedRoles } from '../../utils/seed-helpers.js';
import { createTestUser } from './test-user-factory.js';

const MARK = 'test-upl12-migration';
const MIGRATION_NAME = '20261116000000_unit_price_ledger';
const LEDGER_PERMISSION = 'unit_price_ledger:manage';

/** migration の SQL を文ごとに分ける（コメント行を除く） */
function readMigrationStatements(): string[] {
  const sql = readFileSync(
    resolve(__dirname, '../../../prisma/migrations', MIGRATION_NAME, 'migration.sql'),
    'utf-8'
  );
  return sql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n')
    .split(';')
    .map((statement) => statement.trim())
    .filter((statement) => statement !== '');
}

describe('単価台帳の migration（統合・実 DB）', () => {
  let prisma: PrismaClient;
  let pool: pg.Pool;
  let regularUserId: string;
  let adminUserId: string;

  async function cleanupUsers(): Promise<void> {
    const users = await prisma.user.findMany({
      where: { email: { contains: MARK } },
      select: { id: true },
    });
    const userIds = users.map((u) => u.id);
    const rbac = getSharedRBACService();
    for (const id of userIds) {
      await rbac.invalidateUserPermissionsCache(id);
    }
    await prisma.userRole.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  }

  async function cleanupQuotations(): Promise<void> {
    await prisma.receivedQuotation.deleteMany({
      where: { ledgerCardId: { startsWith: MARK } },
    });
  }

  async function createUserWithRole(suffix: string, roleName: 'user' | 'admin'): Promise<string> {
    const role = await prisma.role.findUnique({ where: { name: roleName } });
    if (!role) {
      throw new Error(`前提の欠落: システムロール ${roleName} が試験 DB に無い`);
    }
    const user = await createTestUser(prisma, {
      email: `${MARK}-${suffix}@example.com`,
      displayName: `${MARK}-${suffix}`,
      passwordHash: 'not-used',
    });
    await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });
    return user.id;
  }

  async function rolePermissionKeys(roleName: string): Promise<string[]> {
    const role = await prisma.role.findUnique({
      where: { name: roleName },
      include: { rolePermissions: { include: { permission: true } } },
    });
    if (!role) {
      throw new Error(`前提の欠落: システムロール ${roleName} が試験 DB に無い`);
    }
    return role.rolePermissions.map((rp) => `${rp.permission.resource}:${rp.permission.action}`);
  }

  function createLedgerQuotation(ledgerCardId: string) {
    return prisma.receivedQuotation.create({
      data: {
        vendorName: `${MARK}-業者`,
        name: `${MARK}-見積`,
        submittedAt: new Date('2026-11-01'),
        ledgerCardId,
        ledgerSourcePath: `${MARK}/原本.pdf`,
        ledgerProjectName: `${MARK}-案件`,
      },
    });
  }

  beforeAll(async () => {
    prisma = getPrismaClient();
    pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    await cleanupUsers();
    await cleanupQuotations();
    // 移行の後に seed を流した状態（本番・試験の起動と同じ順序）で確かめる
    await seedRoles(prisma);
    await seedPermissions(prisma);
    await seedRolePermissions(prisma);
    regularUserId = await createUserWithRole('regular', 'user');
    adminUserId = await createUserWithRole('admin', 'admin');
  });

  afterEach(async () => {
    await cleanupQuotations();
  });

  afterAll(async () => {
    await cleanupQuotations();
    await cleanupUsers();
    await pool.end();
  });

  describe('権限（10.3）', () => {
    /**
     * @requirement unit-price-ledger/REQ-10.3
     */
    it('台帳の管理の権限 unit_price_ledger:manage がある', async () => {
      const permission = await prisma.permission.findUnique({
        where: { resource_action: { resource: 'unit_price_ledger', action: 'manage' } },
      });
      expect(permission).not.toBeNull();
    });

    /**
     * @requirement unit-price-ledger/REQ-10.3
     */
    it('一般ユーザーロールは台帳の管理の権限を持たない', async () => {
      const keys = await rolePermissionKeys('user');
      // 前提: 一般ユーザーロールに既定の権限が割り当てられている（空なら判定が素通りになる）
      expect(keys).toContain('estimate:update');
      expect(keys).not.toContain(LEDGER_PERMISSION);
    });

    /**
     * @requirement unit-price-ledger/REQ-10.3
     */
    it('システム管理者は *:* で台帳の管理の権限を持ち、一般ユーザーは持たない', async () => {
      const rbac = getSharedRBACService();
      await rbac.invalidateUserPermissionsCache(adminUserId);
      await rbac.invalidateUserPermissionsCache(regularUserId);
      expect(await rbac.hasPermission(adminUserId, LEDGER_PERMISSION)).toBe(true);
      expect(await rbac.hasPermission(regularUserId, LEDGER_PERMISSION)).toBe(false);
      // 前提: 一般ユーザーは見積の編集の権限は持つ（似た単価の問い合わせ。10.2）
      expect(await rbac.hasPermission(regularUserId, 'estimate:update')).toBe(true);
    });
  });

  describe('カードの ID の一意（2.14）', () => {
    it('論理削除されていない受領見積書と同じカードの ID は拒まれる', async () => {
      const cardId = `${MARK}-dup`;
      await createLedgerQuotation(cardId);

      const error = await createLedgerQuotation(cardId).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
      expect((error as Prisma.PrismaClientKnownRequestError).code).toBe('P2002');
    });

    it('論理削除された受領見積書と同じカードの ID は登録できる', async () => {
      const cardId = `${MARK}-soft-deleted`;
      const first = await createLedgerQuotation(cardId);
      await prisma.receivedQuotation.update({
        where: { id: first.id },
        data: { deletedAt: new Date() },
      });

      const second = await createLedgerQuotation(cardId);
      expect(second.ledgerCardId).toBe(cardId);
      expect(second.ledgerSourcePath).toBe(`${MARK}/原本.pdf`);
      expect(second.ledgerProjectName).toBe(`${MARK}-案件`);
      // 論理削除されていない行が 1 つ増えた後は、また拒まれる
      const error = await createLedgerQuotation(cardId).catch((e: unknown) => e);
      expect((error as Prisma.PrismaClientKnownRequestError).code).toBe('P2002');
    });

    it('カードの ID の一意の索引は論理削除されていない行だけの部分索引である', async () => {
      const rows = await prisma.$queryRaw<{ indexdef: string }[]>`
        SELECT indexdef FROM pg_indexes
        WHERE tablename = 'received_quotations'
          AND indexname = 'received_quotations_ledger_card_id_unique_not_deleted'`;
      expect(rows).toHaveLength(1);
      expect(rows[0]!.indexdef).toContain('CREATE UNIQUE INDEX');
      expect(rows[0]!.indexdef).toContain('(ledger_card_id)');
      expect(rows[0]!.indexdef).toContain('WHERE ("deletedAt" IS NULL)');
    });
  });

  describe('名称の 3 文字組の索引（要件 7 の近さの検索）', () => {
    it('pg_trgm が有効である', async () => {
      const rows = await prisma.$queryRaw<{ extname: string }[]>`
        SELECT extname FROM pg_extension WHERE extname = 'pg_trgm'`;
      expect(rows).toHaveLength(1);
    });

    it('明細行の名称に GIN の 3 文字組の索引がある', async () => {
      const rows = await prisma.$queryRaw<{ indexdef: string }[]>`
        SELECT indexdef FROM pg_indexes
        WHERE tablename = 'received_quotation_line_items'
          AND indexname = 'received_quotation_line_items_name_idx'`;
      expect(rows).toHaveLength(1);
      expect(rows[0]!.indexdef).toContain('USING gin (name gin_trgm_ops)');
    });
  });

  describe('やり直し（Batch / Job Contract の Idempotency）', () => {
    it('適用済みの DB へ migration をもう一度流しても失敗せず、権限が無ければ足す', async () => {
      const statements = readMigrationStatements();
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        // 権限が無い環境を作る（admin は *:* のため割り当ての行は無い）
        await client.query(
          `DELETE FROM "permissions" WHERE "resource" = 'unit_price_ledger' AND "action" = 'manage'`
        );
        for (const statement of statements) {
          await client.query(statement);
        }
        const result = await client.query<{ count: string }>(
          `SELECT COUNT(*)::text AS count FROM "permissions"
           WHERE "resource" = 'unit_price_ledger' AND "action" = 'manage'`
        );
        expect(result.rows[0]!.count).toBe('1');
        // もう一度流しても失敗せず、権限は 1 行のまま
        for (const statement of statements) {
          await client.query(statement);
        }
        const again = await client.query<{ count: string }>(
          `SELECT COUNT(*)::text AS count FROM "permissions"
           WHERE "resource" = 'unit_price_ledger' AND "action" = 'manage'`
        );
        expect(again.rows[0]!.count).toBe('1');
      } finally {
        await client.query('ROLLBACK');
        client.release();
      }
    });
  });
});
