/**
 * @fileoverview 受領見積書の読取の確認の経路の列と、明細行の区分「端数調整」のスキーマと migration の検証テスト
 *
 * TDD: Prisma スキーマの ReceivedQuotation の経路の列・enum と区分の enum の値、
 * migration の SQL（enum の新設・列の追加・CHECK・区分の値の追加）が設計に沿うことを検証する。
 *
 * Requirements (estimate-request):
 * - 45.1: 明細行の区分に端数調整を持つ
 * - 46.12: 確認済みの受領見積書は読取の確認の経路を持ち、未確認は持たない
 *
 * Design (estimate-request / Requirements 45.14〜45.16・46.12〜46.21・48.9〜48.11):
 * - Data Models > Physical Data Model（列・enum・CHECK・区分の値の足し方。埋め戻しは行わない）
 * - 決定 D20（区分「端数調整」）
 *
 * Task 123.1
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { resolve } from 'path';

const prismaDir = resolve(__dirname, '../../../../prisma');
const schemaPrisma = readFileSync(resolve(prismaDir, 'schema.prisma'), 'utf-8');

const MIGRATION_NAME = '20261121000000_received_quotation_reading_route_and_rounding';

/** migration の SQL を読む（未作成なら例外でテストを失敗させる） */
function readMigrationSql(): string {
  const dirs = readdirSync(resolve(prismaDir, 'migrations'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
  if (!dirs.includes(MIGRATION_NAME)) {
    throw new Error(`${MIGRATION_NAME} の migration が存在しない`);
  }
  return readFileSync(resolve(prismaDir, 'migrations', MIGRATION_NAME, 'migration.sql'), 'utf-8');
}

/** コメント行を除き、文（`;` で終わる）ごとに分ける */
function splitStatements(sql: string): string[] {
  return sql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n')
    .split(';')
    .map((statement) => statement.trim())
    .filter((statement) => statement !== '');
}

function getModelBlock(modelName: string): string {
  return new RegExp(`^model ${modelName} \\{([\\s\\S]*?)^\\}`, 'm').exec(schemaPrisma)?.[1] ?? '';
}

function getEnumBlock(enumName: string): string {
  return new RegExp(`^enum ${enumName} \\{([\\s\\S]*?)^\\}`, 'm').exec(schemaPrisma)?.[1] ?? '';
}

function getField(modelName: string, fieldName: string): string {
  return (
    new RegExp(`^\\s*${fieldName}\\s+.*$`, 'm').exec(getModelBlock(modelName))?.[0] ?? ''
  ).trim();
}

/** enum のブロックから値の名前だけを順に取り出す */
function enumValues(enumName: string): string[] {
  return getEnumBlock(enumName)
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, '').trim())
    .filter((line) => line !== '');
}

describe('ReceivedQuotation のスキーマの読取の確認の経路（46.12）', () => {
  /**
   * @requirement estimate-request/REQ-46.12: The システム shall 確認済みの受領見積書ごとに、読取の確認の経路（画面・台帳の取り込み・ArchiBench のいずれか）を保持し、未確認の受領見積書には経路を持たせない
   */
  it('経路を任意の enum の列 reading_confirmation_route として持ち、既定を持たない', () => {
    const field = getField('ReceivedQuotation', 'readingConfirmationRoute');
    expect(field).toMatch(
      /^readingConfirmationRoute\s+ReceivedQuotationReadingRoute\?\s+@map\("reading_confirmation_route"\)/
    );
    expect(field).not.toContain('@default');
  });

  it('経路の enum は画面・台帳の取り込み・ArchiBench の 3 つの値だけを持つ', () => {
    expect(enumValues('ReceivedQuotationReadingRoute')).toEqual([
      'SCREEN',
      'LEDGER_IMPORT',
      'ARCHIBENCH',
    ]);
  });
});

describe('ReceivedQuotationLineItem のスキーマの区分「端数調整」（45.1、D20）', () => {
  /**
   * @requirement estimate-request/REQ-45.1: The システム shall 受領見積書の明細行ごとに、区分（直接工事・諸経費・交通費・産廃・値引き・法定福利費・別途・端数調整のいずれか）を保持し、既定を直接工事とする（2026-11-20 改訂）
   */
  it('区分の enum は既存の 7 つの値の後に ROUNDING を持ち、既定は直接工事のまま', () => {
    expect(enumValues('ReceivedQuotationLineCategory')).toEqual([
      'DIRECT',
      'OVERHEAD',
      'TRAVEL',
      'WASTE',
      'DISCOUNT',
      'LEGAL_WELFARE',
      'EXCLUDED',
      'ROUNDING',
    ]);
    expect(getField('ReceivedQuotationLineItem', 'category')).toMatch(
      /^category\s+ReceivedQuotationLineCategory\s+@default\(DIRECT\)/
    );
  });
});

describe(`migration ${MIGRATION_NAME} の SQL`, () => {
  it('経路の enum を 3 つの値で新設する', () => {
    const statements = splitStatements(readMigrationSql());
    expect(statements).toContain(
      `CREATE TYPE "ReceivedQuotationReadingRoute" AS ENUM ('SCREEN', 'LEDGER_IMPORT', 'ARCHIBENCH')`
    );
  });

  it('経路の列を NULL 許容・既定なしで足す', () => {
    const addColumn = splitStatements(readMigrationSql()).filter((statement) =>
      /ADD COLUMN\s+"reading_confirmation_route"/.test(statement)
    );
    expect(addColumn).toHaveLength(1);
    expect(addColumn[0]).toMatch(
      /^ALTER TABLE "received_quotations" ADD COLUMN\s+"reading_confirmation_route" "ReceivedQuotationReadingRoute"$/
    );
    expect(addColumn[0]).not.toMatch(/NOT NULL|DEFAULT/);
  });

  it('未確認は経路を持たない CHECK を足し、確認済みで経路が null の行は許す（46.12）', () => {
    const check = splitStatements(readMigrationSql()).filter((statement) =>
      /ADD CONSTRAINT "received_quotations_reading_route_check"/.test(statement)
    );
    expect(check).toHaveLength(1);
    expect(check[0]!.replace(/\s+/g, ' ')).toBe(
      'ALTER TABLE "received_quotations" ADD CONSTRAINT "received_quotations_reading_route_check" ' +
        `CHECK ("reading_status" = 'CONFIRMED' OR "reading_confirmation_route" IS NULL)`
    );
  });

  it('区分の値 ROUNDING を ALTER TYPE ... ADD VALUE で足す（45.1）', () => {
    expect(splitStatements(readMigrationSql())).toContain(
      `ALTER TYPE "ReceivedQuotationLineCategory" ADD VALUE 'ROUNDING'`
    );
  });

  it('足した区分の値を同じ migration の中で使わず、埋め戻しも行わない', () => {
    const statements = splitStatements(readMigrationSql());
    // 'ROUNDING' を含む文は ADD VALUE の 1 つだけ（同じトランザクションの中では使えない）
    expect(statements.filter((statement) => statement.includes('ROUNDING'))).toHaveLength(1);
    // 追補の前の確認済みの行は経路 null のままにする（46.20）
    expect(statements.filter((statement) => /^(UPDATE|INSERT|DELETE)\b/i.test(statement))).toEqual(
      []
    );
  });
});
