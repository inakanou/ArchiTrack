/**
 * @fileoverview 外部アプリの接続の migration の統合検証（user-authentication タスク 71.1）
 *
 * 確かめること:
 * - 46.2: 権限 `external_app:connect` があり、既定ではシステム管理者だけが `*:*` で持つ
 * - 47.8: 利用者とアプリの組で接続は一意（置き換えの土台）
 * - 48.7: 認可サーバーの保存データの行を、設計の列で保存できる
 * - migration を空の DB と既存のデータのある DB の両方へ適用でき、やり直せる
 *
 * Design: Requirements 46-51 > Data Models
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { randomUUID } from 'crypto';
import { readdirSync, readFileSync } from 'fs';
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

const MARK = 'test-oauth711-migration';
const MIGRATION_NAME = '20261123000000_external_app_connections';
const CONNECT_PERMISSION = 'external_app:connect';
const MIGRATIONS_DIR = resolve(__dirname, '../../../prisma/migrations');

function migrationNames(): string[] {
  return readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

function migrationSql(name: string): string {
  return readFileSync(resolve(MIGRATIONS_DIR, name, 'migration.sql'), 'utf-8');
}

function databaseUrl(databaseName: string): string {
  const url = new URL(process.env.DATABASE_URL as string);
  url.pathname = `/${databaseName}`;
  return url.toString();
}

/** 一時的な DB を作り、終わったら必ず消す */
async function withTemporaryDatabase(
  admin: pg.Pool,
  run: (client: pg.Client) => Promise<void>
): Promise<void> {
  const databaseName = `oauth711_${randomUUID().replaceAll('-', '')}`;
  await admin.query(`CREATE DATABASE "${databaseName}"`);
  const client = new pg.Client({ connectionString: databaseUrl(databaseName) });
  try {
    await client.connect();
    await run(client);
  } finally {
    await client.end().catch(() => undefined);
    await admin.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`);
  }
}

async function countConnectPermission(client: pg.Client): Promise<string> {
  const result = await client.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM "permissions"
     WHERE "resource" = 'external_app' AND "action" = 'connect'`
  );
  return result.rows[0]!.count;
}

describe('外部アプリの接続の migration（統合・実 DB）', () => {
  let prisma: PrismaClient;
  let pool: pg.Pool;
  let regularUserId: string;
  let otherUserId: string;
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
    await prisma.externalAppConnection.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.userRole.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
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

  function createConnection(userId: string, clientId: string) {
    return prisma.externalAppConnection.create({
      data: {
        userId,
        clientId,
        grantId: `${MARK}-${randomUUID()}`,
        scopes: ['read'],
        consentedAt: new Date('2026-11-23T00:00:00Z'),
        expiresAt: new Date('2027-02-21T00:00:00Z'),
      },
    });
  }

  beforeAll(async () => {
    prisma = getPrismaClient();
    pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    await cleanupUsers();
    // 移行の後に seed を流した状態（本番・試験の起動と同じ順序）で確かめる
    await seedRoles(prisma);
    await seedPermissions(prisma);
    await seedRolePermissions(prisma);
    regularUserId = await createUserWithRole('regular', 'user');
    otherUserId = await createUserWithRole('other', 'user');
    adminUserId = await createUserWithRole('admin', 'admin');
  });

  afterEach(async () => {
    await prisma.externalAppConnection.deleteMany({
      where: { userId: { in: [regularUserId, otherUserId, adminUserId] } },
    });
    await prisma.oAuthStoreRecord.deleteMany({ where: { id: { startsWith: MARK } } });
  });

  afterAll(async () => {
    await prisma.oAuthStoreRecord.deleteMany({ where: { id: { startsWith: MARK } } });
    await cleanupUsers();
    await pool.end();
  });

  describe('権限（46.2）', () => {
    /**
     * @requirement user-authentication/REQ-46.2
     */
    it('システム管理者は *:* で接続の権限を持ち、一般ユーザーは持たない', async () => {
      const permission = await prisma.permission.findUnique({
        where: { resource_action: { resource: 'external_app', action: 'connect' } },
      });
      expect(permission).not.toBeNull();

      const rbac = getSharedRBACService();
      await rbac.invalidateUserPermissionsCache(adminUserId);
      await rbac.invalidateUserPermissionsCache(regularUserId);
      expect(await rbac.hasPermission(adminUserId, CONNECT_PERMISSION)).toBe(true);
      expect(await rbac.hasPermission(regularUserId, CONNECT_PERMISSION)).toBe(false);
      // 前提: 一般ユーザーには既定の権限がある（空なら判定が素通りになる）
      expect(await rbac.hasPermission(regularUserId, 'estimate:update')).toBe(true);
    });
  });

  describe('接続の制約（47.8）', () => {
    /**
     * @requirement user-authentication/REQ-47.8
     */
    it('同じ利用者とアプリの組は二つ作れない', async () => {
      await createConnection(regularUserId, 'client-a');

      const error = await createConnection(regularUserId, 'client-a').catch((e: unknown) => e);
      expect(error).toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
      expect((error as Prisma.PrismaClientKnownRequestError).code).toBe('P2002');
    });

    /**
     * @requirement user-authentication/REQ-47.8
     */
    it('利用者かアプリが違えば接続を作れる', async () => {
      await createConnection(regularUserId, 'client-a');
      await expect(createConnection(regularUserId, 'client-b')).resolves.toBeDefined();
      await expect(createConnection(otherUserId, 'client-a')).resolves.toBeDefined();
    });

    it('同じ Grant を二つの接続に持たせられない', async () => {
      const first = await createConnection(regularUserId, 'client-a');
      const error = await prisma.externalAppConnection
        .create({
          data: {
            userId: otherUserId,
            clientId: 'client-a',
            grantId: first.grantId,
            scopes: ['read'],
            consentedAt: new Date(),
            expiresAt: new Date(),
          },
        })
        .catch((e: unknown) => e);
      expect((error as Prisma.PrismaClientKnownRequestError).code).toBe('P2002');
    });

    it.each<[string[] | null]>([[['write']], [[]], [null]])(
      '範囲に read を含まない接続は拒まれる: %j',
      async (scopes) => {
        const error = await pool
          .query(
            `INSERT INTO "external_app_connections"
             ("id", "user_id", "client_id", "grant_id", "scopes", "consented_at", "expires_at")
           VALUES ($1, $2, 'client-a', $3, $4::text[], now(), now())`,
            [randomUUID(), regularUserId, `${MARK}-${randomUUID()}`, scopes]
          )
          .catch((e: unknown) => e);
        expect((error as { code?: string }).code).toBe('23514');
      }
    );

    it('利用者を消すと接続も消える', async () => {
      const user = await createTestUser(prisma, {
        email: `${MARK}-cascade@example.com`,
        displayName: `${MARK}-cascade`,
        passwordHash: 'not-used',
      });
      const connection = await createConnection(user.id, 'client-a');

      await prisma.user.delete({ where: { id: user.id } });

      expect(
        await prisma.externalAppConnection.findUnique({ where: { id: connection.id } })
      ).toBeNull();
    });
  });

  describe('認可サーバーの保存データ（48.7）', () => {
    /**
     * @requirement user-authentication/REQ-48.7
     */
    it('設計の列で行を保存し、任意の列は空にできる', async () => {
      const id = `${MARK}:RefreshToken:hmac-value`;
      const consumedAt = new Date('2026-11-23T01:00:00Z');
      await prisma.oAuthStoreRecord.create({
        data: {
          id,
          kind: 'RefreshToken',
          grantId: 'grant-1',
          uid: 'uid-1',
          payload: { kind: 'RefreshToken', accountId: 'user-1' },
          consumedAt,
          expiresAt: new Date('2026-12-23T00:00:00Z'),
        },
      });
      const minimalId = `${MARK}:Interaction:minimal`;
      await prisma.oAuthStoreRecord.create({
        data: { id: minimalId, kind: 'Interaction', payload: {} },
      });

      const stored = await prisma.oAuthStoreRecord.findUniqueOrThrow({ where: { id } });
      expect(stored.payload).toEqual({ kind: 'RefreshToken', accountId: 'user-1' });
      expect(stored.consumedAt).toEqual(consumedAt);
      const minimal = await prisma.oAuthStoreRecord.findUniqueOrThrow({
        where: { id: minimalId },
      });
      expect(minimal.grantId).toBeNull();
      expect(minimal.uid).toBeNull();
      expect(minimal.consumedAt).toBeNull();
      expect(minimal.expiresAt).toBeNull();
    });

    it('検索に使う列に索引がある', async () => {
      const rows = await prisma.$queryRaw<{ indexname: string }[]>`
        SELECT indexname FROM pg_indexes
        WHERE tablename IN ('external_app_connections', 'oauth_store_records')`;
      const names = rows.map((row) => row.indexname);
      expect(names).toEqual(
        expect.arrayContaining([
          'external_app_connections_user_id_client_id_key',
          'external_app_connections_grant_id_key',
          'external_app_connections_client_id_idx',
          'external_app_connections_last_used_at_idx',
          'external_app_connections_expires_at_idx',
          'oauth_store_records_grant_id_idx',
          'oauth_store_records_uid_idx',
          'oauth_store_records_expires_at_idx',
        ])
      );
    });
  });

  describe('migration の適用', () => {
    it('空の DB へ全ての migration を順に適用でき、権限が入る', async () => {
      await withTemporaryDatabase(pool, async (client) => {
        for (const name of migrationNames()) {
          await client.query(migrationSql(name));
        }
        expect(await countConnectPermission(client)).toBe('1');
      });
    }, 120_000);

    it('既存のデータのある DB へ適用でき、既存の行を変えず、やり直せる', async () => {
      const names = migrationNames();
      // 本 migration より前までを「既存の環境」として作る（後続の migration が増えても変わらない）
      const index = names.indexOf(MIGRATION_NAME);
      expect(index).toBeGreaterThan(0);

      await withTemporaryDatabase(pool, async (client) => {
        for (const name of names.slice(0, index)) {
          await client.query(migrationSql(name));
        }
        const userId = randomUUID();
        await client.query(
          `INSERT INTO "users" ("id", "email", "displayName", "passwordHash", "updatedAt")
           VALUES ($1, $2, '既存の利用者', 'not-used', now())`,
          [userId, `${MARK}-existing@example.com`]
        );
        const before = await client.query(`SELECT * FROM "users" WHERE "id" = $1`, [userId]);
        const permissionsBefore = await client.query<{ count: string }>(
          `SELECT COUNT(*)::text AS count FROM "permissions"`
        );

        await client.query(migrationSql(MIGRATION_NAME));

        const after = await client.query(`SELECT * FROM "users" WHERE "id" = $1`, [userId]);
        expect(after.rows).toEqual(before.rows);
        expect(await countConnectPermission(client)).toBe('1');
        const permissionsAfter = await client.query<{ count: string }>(
          `SELECT COUNT(*)::text AS count FROM "permissions"`
        );
        expect(Number(permissionsAfter.rows[0]!.count)).toBe(
          Number(permissionsBefore.rows[0]!.count) + 1
        );

        // もう一度流しても失敗せず、権限は 1 行のまま
        await client.query(migrationSql(MIGRATION_NAME));
        expect(await countConnectPermission(client)).toBe('1');
      });
    }, 120_000);
  });
});
