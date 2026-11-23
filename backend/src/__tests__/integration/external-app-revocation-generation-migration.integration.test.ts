/**
 * @fileoverview 失効の世代の migration の統合検証（user-authentication タスク 72.3）
 *
 * 確かめること:
 * - 50.1〜50.4: `users.external_app_revocation_generation` が NOT NULL・既定 0 で存在する
 * - migration を空の DB と既存のデータのある DB の両方へ適用でき、既存の列を変えず、やり直せる
 *
 * Design: Requirements 46-51 > ExternalAppConnectionService の Invariants（失効の世代）、Data Models
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'crypto';
import { readdirSync, readFileSync } from 'fs';
import { resolve } from 'path';
import pg from 'pg';
import { validateEnv } from '../../config/env.js';

// 環境変数を初期化
validateEnv();

const MARK = 'test-oauth723-migration';
const MIGRATION_NAME = '20261124000000_external_app_revocation_generation';
const COLUMN = 'external_app_revocation_generation';
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
  const databaseName = `oauth723_${randomUUID().replaceAll('-', '')}`;
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

async function insertUser(client: pg.Client): Promise<string> {
  const userId = randomUUID();
  await client.query(
    `INSERT INTO "users" ("id", "email", "displayName", "passwordHash", "updatedAt")
     VALUES ($1, $2, '既存の利用者', 'not-used', now())`,
    [userId, `${MARK}-${userId}@example.com`]
  );
  return userId;
}

async function columnDefinition(client: pg.Client) {
  const result = await client.query<{
    data_type: string;
    is_nullable: string;
    column_default: string | null;
  }>(
    `SELECT data_type, is_nullable, column_default FROM information_schema.columns
     WHERE table_name = 'users' AND column_name = $1`,
    [COLUMN]
  );
  return result.rows;
}

describe('失効の世代の migration（統合・実 DB）', () => {
  let pool: pg.Pool;

  beforeAll(() => {
    pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  });

  afterAll(async () => {
    await pool.end();
  });

  it('空の DB へ全ての migration を順に適用でき、列が NOT NULL・既定 0 になる', async () => {
    expect(migrationNames()).toContain(MIGRATION_NAME);

    await withTemporaryDatabase(pool, async (client) => {
      for (const name of migrationNames()) {
        await client.query(migrationSql(name));
      }
      expect(await columnDefinition(client)).toEqual([
        { data_type: 'integer', is_nullable: 'NO', column_default: '0' },
      ]);
      const userId = await insertUser(client);
      const row = await client.query(`SELECT "${COLUMN}" AS value FROM "users" WHERE "id" = $1`, [
        userId,
      ]);
      expect(row.rows).toEqual([{ value: 0 }]);
    });
  }, 120_000);

  it('既存のデータのある DB へ適用でき、既存の列を変えず、やり直せる', async () => {
    const names = migrationNames();
    // 本 migration より前までを「既存の環境」として作る（後続の migration が増えても変わらない）
    const index = names.indexOf(MIGRATION_NAME);
    expect(index).toBeGreaterThan(0);

    await withTemporaryDatabase(pool, async (client) => {
      for (const name of names.slice(0, index)) {
        await client.query(migrationSql(name));
      }
      const userId = await insertUser(client);
      const before = await client.query(`SELECT * FROM "users" WHERE "id" = $1`, [userId]);

      await client.query(migrationSql(MIGRATION_NAME));

      const after = await client.query(`SELECT * FROM "users" WHERE "id" = $1`, [userId]);
      expect(after.rows).toEqual([{ ...before.rows[0], [COLUMN]: 0 }]);

      // 進めた世代は、やり直しで戻らない
      await client.query(`UPDATE "users" SET "${COLUMN}" = 3 WHERE "id" = $1`, [userId]);
      await client.query(migrationSql(MIGRATION_NAME));
      const again = await client.query(`SELECT "${COLUMN}" AS value FROM "users" WHERE "id" = $1`, [
        userId,
      ]);
      expect(again.rows).toEqual([{ value: 3 }]);
    });
  }, 120_000);
});
