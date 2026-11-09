/**
 * @fileoverview 受領見積書の台帳の項目のスキーマと migration の検証テスト
 *
 * TDD: Prisma スキーマの ReceivedQuotation・ReceivedQuotationLineItem・SystemSetting の定義と、
 * migration の SQL（列・enum・CHECK・索引・埋め戻し・権限の付与）が設計に沿うことを検証する。
 *
 * Requirements (estimate-request):
 * - 14.1: 受領見積書を見積依頼または案件に紐づけて永続化する（見積依頼を任意にする）
 * - 44.1, 44.9: 業者名を持ち、既存の受領見積書は見積依頼の宛先の取引先の名前で埋める
 * - 45.1, 45.7, 45.8, 45.13: 明細行の区分・条件・換算。既存の明細行は直接工事
 * - 46.1, 46.2, 46.3, 46.4, 46.6: 見積の情報・参考の印と理由・読取の確認
 * - 47.1, 47.4: 分類キー・数量表の行のキー
 * - 48.2: 見積の区別
 * - 49.6: 外部の AI での読み取りの専用の権限（既存の estimate_request:read のロールへ付与）
 *
 * Design (estimate-request / Requirements 43-50):
 * - Data Models > Physical Data Model・埋め戻し（migration の SQL）
 * - 決定 D1（案件の列を全員に持たせる）・D7（専用の権限）・D8（SystemSetting）
 *
 * Task 112.1
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { resolve } from 'path';

const prismaDir = resolve(__dirname, '../../../../prisma');
const schemaPrisma = readFileSync(resolve(prismaDir, 'schema.prisma'), 'utf-8');

const MIGRATION_NAME = '20261108000000_received_quotation_ledger_fields';

/** migration の SQL を読む（未作成なら例外でテストを失敗させる） */
function readLedgerMigrationSql(): string {
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

describe('ReceivedQuotation のスキーマ（14.1, 44.1, 46.1〜46.3, 46.6, 48.2, D1）', () => {
  it('見積依頼を任意にし、削除の連鎖（Cascade）は残す（14.1）', () => {
    expect(getField('ReceivedQuotation', 'estimateRequestId')).toMatch(
      /^estimateRequestId\s+String\?/
    );
    expect(getField('ReceivedQuotation', 'estimateRequest')).toMatch(
      /^estimateRequest\s+EstimateRequest\?\s+@relation\(fields: \[estimateRequestId\], references: \[id\], onDelete: Cascade\)/
    );
  });

  it('案件を任意の列として持ち、Project へ onDelete: Restrict で紐づく（D1）', () => {
    expect(getField('ReceivedQuotation', 'projectId')).toMatch(
      /^projectId\s+String\?\s+@map\("project_id"\)/
    );
    expect(getField('ReceivedQuotation', 'project')).toMatch(
      /^project\s+Project\?\s+@relation\(fields: \[projectId\], references: \[id\], onDelete: Restrict\)/
    );
  });

  it('業者名を必須の VarChar(200) で持ち、取引先へ onDelete: SetNull で紐づく（44.1）', () => {
    const vendorName = getField('ReceivedQuotation', 'vendorName');
    expect(vendorName).toMatch(/^vendorName\s+String\s/);
    expect(vendorName).toContain('@db.VarChar(200)');
    expect(vendorName).not.toContain('@default');
    expect(getField('ReceivedQuotation', 'tradingPartnerId')).toMatch(
      /^tradingPartnerId\s+String\?/
    );
    expect(getField('ReceivedQuotation', 'tradingPartner')).toMatch(
      /^tradingPartner\s+TradingPartner\?\s+@relation\(fields: \[tradingPartnerId\], references: \[id\], onDelete: SetNull\)/
    );
  });

  it.each([
    ['quoteNumber', /^quoteNumber\s+String\?/, '@db.VarChar(100)'],
    ['overallConditions', /^overallConditions\s+String\?/, '@db.VarChar(2000)'],
    ['siteLocation', /^siteLocation\s+String\?/, '@db.VarChar(100)'],
    ['useType', /^useType\s+String\?/, '@db.VarChar(100)'],
    ['constructionPrice', /^constructionPrice\s+Decimal\?/, '@db.Decimal(15, 0)'],
    ['workConditions', /^workConditions\s+String\?/, '@db.VarChar(200)'],
    ['distanceKm', /^distanceKm\s+Decimal\?/, '@db.Decimal(6, 1)'],
    ['confirmedAmount', /^confirmedAmount\s+Decimal\?/, '@db.Decimal(15, 0)'],
    ['fileSha256', /^fileSha256\s+String\?/, '@db.Char(64)'],
  ])('見積の情報 %s を任意の列として持つ（46.1〜46.3, 48.1）', (field, typePattern, dbType) => {
    const line = getField('ReceivedQuotation', field);
    expect(line).toMatch(typePattern);
    expect(line).toContain(dbType);
  });

  it('工事の種別・採否・読取の状態を enum で持ち、採否は UNKNOWN、読取は UNCONFIRMED が既定（46.2, 46.3, 46.6）', () => {
    expect(getField('ReceivedQuotation', 'constructionKind')).toMatch(
      /^constructionKind\s+ReceivedQuotationConstructionKind\?/
    );
    expect(getField('ReceivedQuotation', 'adoption')).toMatch(
      /^adoption\s+ReceivedQuotationAdoption\s+@default\(UNKNOWN\)/
    );
    expect(getField('ReceivedQuotation', 'readingStatus')).toMatch(
      /^readingStatus\s+ReceivedQuotationReadingStatus\s+@default\(UNCONFIRMED\)/
    );
    expect(getEnumBlock('ReceivedQuotationConstructionKind')).toMatch(
      /RENOVATION[\s\S]*NEW_CONSTRUCTION/
    );
    expect(getEnumBlock('ReceivedQuotationAdoption')).toMatch(
      /ADOPTED[\s\S]*REJECTED[\s\S]*UNKNOWN/
    );
    expect(getEnumBlock('ReceivedQuotationReadingStatus')).toMatch(/UNCONFIRMED[\s\S]*CONFIRMED/);
  });

  it('読取の確認者を User へ onDelete: SetNull で、確認の日時を任意で持つ（46.6）', () => {
    expect(getField('ReceivedQuotation', 'readingConfirmedById')).toMatch(
      /^readingConfirmedById\s+String\?/
    );
    expect(getField('ReceivedQuotation', 'readingConfirmedAt')).toMatch(
      /^readingConfirmedAt\s+DateTime\?/
    );
    expect(getField('ReceivedQuotation', 'readingConfirmedBy')).toMatch(
      /^readingConfirmedBy\s+User\?\s+@relation\("ReceivedQuotationReadingConfirmedBy", fields: \[readingConfirmedById\], references: \[id\], onDelete: SetNull\)/
    );
  });

  it('見積の区別を VarChar(100)・既定の空文字で持つ（48.2）', () => {
    const line = getField('ReceivedQuotation', 'quoteDiscriminator');
    expect(line).toMatch(/^quoteDiscriminator\s+String\s+@default\(""\)/);
    expect(line).toContain('@db.VarChar(100)');
  });

  it('案件と、案件と指紋の組の索引を持つ（D6）', () => {
    const block = getModelBlock('ReceivedQuotation');
    expect(block).toMatch(/@@index\(\[projectId\]\)/);
    expect(block).toMatch(/@@index\(\[projectId, fileSha256\]\)/);
  });
});

describe('ReceivedQuotationLineItem のスキーマ（45.1, 45.7, 45.8, 46.4, 47.1, 47.4）', () => {
  it('区分を enum で持ち、既定は直接工事（45.1, 45.13）', () => {
    expect(getField('ReceivedQuotationLineItem', 'category')).toMatch(
      /^category\s+ReceivedQuotationLineCategory\s+@default\(DIRECT\)/
    );
    expect(getEnumBlock('ReceivedQuotationLineCategory')).toMatch(
      /DIRECT[\s\S]*OVERHEAD[\s\S]*TRAVEL[\s\S]*WASTE[\s\S]*DISCOUNT[\s\S]*LEGAL_WELFARE[\s\S]*EXCLUDED/
    );
  });

  it.each([
    ['condition', /^condition\s+String\?/, '@db.VarChar(500)'],
    ['conversionQuantity', /^conversionQuantity\s+Decimal\?/, '@db.Decimal(15, 4)'],
    ['conversionUnit', /^conversionUnit\s+String\?/, '@db.VarChar(50)'],
    ['conversionUnitPrice', /^conversionUnitPrice\s+Decimal\?/, '@db.Decimal(15, 2)'],
    ['conversionBasis', /^conversionBasis\s+String\?/, '@db.VarChar(500)'],
    ['classificationKey', /^classificationKey\s+String\?/, '@db.VarChar(50)'],
    ['quantityRowKey', /^quantityRowKey\s+String\?/, '@db.VarChar(1000)'],
    ['referenceReason', /^referenceReason\s+String\?/, '@db.VarChar(200)'],
  ])('%s を任意の列として持つ', (field, typePattern, dbType) => {
    const line = getField('ReceivedQuotationLineItem', field);
    expect(line).toMatch(typePattern);
    expect(line).toContain(dbType);
  });

  it('参考の印を既定 false で持つ（46.4）', () => {
    expect(getField('ReceivedQuotationLineItem', 'isReference')).toMatch(
      /^isReference\s+Boolean\s+@default\(false\)/
    );
  });
});

describe('SystemSetting のスキーマ（D8）', () => {
  it('key を主キー、value を Json、version を既定 0、更新者と更新日時を持つ', () => {
    expect(getModelBlock('SystemSetting')).not.toBe('');
    expect(getField('SystemSetting', 'key')).toMatch(/^key\s+String\s+@id/);
    expect(getField('SystemSetting', 'value')).toMatch(/^value\s+Json/);
    expect(getField('SystemSetting', 'version')).toMatch(/^version\s+Int\s+@default\(0\)/);
    expect(getField('SystemSetting', 'updatedById')).toMatch(/^updatedById\s+String\?/);
    expect(getField('SystemSetting', 'updatedAt')).toMatch(/^updatedAt\s+DateTime\s+@updatedAt/);
  });
});

describe('20261108000000_received_quotation_ledger_fields の migration', () => {
  it('enum を 4 つ作る', () => {
    const sql = readLedgerMigrationSql();
    for (const name of [
      'ReceivedQuotationConstructionKind',
      'ReceivedQuotationAdoption',
      'ReceivedQuotationReadingStatus',
      'ReceivedQuotationLineCategory',
    ]) {
      expect(sql).toMatch(new RegExp(`CREATE TYPE "${name}" AS ENUM`));
    }
    expect(sql).toMatch(
      /CREATE TYPE "ReceivedQuotationLineCategory" AS ENUM \('DIRECT', 'OVERHEAD', 'TRAVEL', 'WASTE', 'DISCOUNT', 'LEGAL_WELFARE', 'EXCLUDED'\)/
    );
  });

  it('見積依頼の列の NOT NULL を外す（14.1）', () => {
    expect(readLedgerMigrationSql()).toMatch(
      /ALTER TABLE "received_quotations" ALTER COLUMN "estimateRequestId" DROP NOT NULL/
    );
  });

  it('業者名は NULL 許容で足し、埋め戻しの後に NOT NULL にする（44.9）', () => {
    const statements = splitStatements(readLedgerMigrationSql());
    const addIndex = statements.findIndex((s) =>
      /ADD COLUMN\s+"vendor_name" VARCHAR\(200\)/.test(s)
    );
    const backfillIndex = statements.findIndex(
      (s) => /^UPDATE "received_quotations"/.test(s) && /"vendor_name"\s*=/.test(s)
    );
    const notNullIndex = statements.findIndex((s) =>
      /ALTER COLUMN "vendor_name" SET NOT NULL/.test(s)
    );

    expect(addIndex).toBeGreaterThanOrEqual(0);
    expect(statements[addIndex]).not.toMatch(/"vendor_name" VARCHAR\(200\) NOT NULL/);
    expect(backfillIndex).toBeGreaterThan(addIndex);
    expect(notNullIndex).toBeGreaterThan(backfillIndex);
  });

  it('既存の受領見積書の案件を見積依頼の案件で埋める（D1）', () => {
    const backfill = splitStatements(readLedgerMigrationSql()).find(
      (s) => /^UPDATE "received_quotations"/.test(s) && /"project_id"\s*=/.test(s)
    );
    expect(backfill).toBeDefined();
    expect(backfill).toMatch(/"project_id"\s*=\s*er\."projectId"/);
    expect(backfill).toMatch(/FROM "estimate_requests"/);
  });

  it('既存の受領見積書の業者名と取引先を見積依頼の宛先の取引先で埋める（44.9）', () => {
    const backfill = splitStatements(readLedgerMigrationSql()).find(
      (s) => /^UPDATE "received_quotations"/.test(s) && /"vendor_name"\s*=/.test(s)
    );
    expect(backfill).toBeDefined();
    expect(backfill).toMatch(/"trading_partner_id"\s*=\s*tp\."id"/);
    expect(backfill).toMatch(/JOIN "trading_partners" tp ON tp\."id" = er\."tradingPartnerId"/);
  });

  it('見積依頼に紐づくものは案件を持つ CHECK を置く（D1）', () => {
    expect(readLedgerMigrationSql()).toMatch(
      /ADD CONSTRAINT "received_quotations_estimate_request_project_check" CHECK \("estimateRequestId" IS NULL OR "project_id" IS NOT NULL\)/
    );
  });

  it('明細行の区分は NOT NULL・既定 DIRECT で足し、既存の明細行は直接工事になる（45.13）', () => {
    const statement = splitStatements(readLedgerMigrationSql()).find((s) =>
      /ADD COLUMN\s+"category"/.test(s)
    );
    expect(statement).toMatch(
      /ALTER TABLE "received_quotation_line_items" ADD COLUMN\s+"category" "ReceivedQuotationLineCategory" NOT NULL DEFAULT 'DIRECT'$/
    );
  });

  it('案件と、案件と指紋の組の索引を作る', () => {
    const sql = readLedgerMigrationSql();
    expect(sql).toMatch(
      /CREATE INDEX "received_quotations_project_id_idx" ON "received_quotations"\("project_id"\)/
    );
    expect(sql).toMatch(
      /CREATE INDEX "received_quotations_project_id_file_sha256_idx" ON "received_quotations"\("project_id", "file_sha256"\)/
    );
  });

  it('system_settings の表を作る（D8）', () => {
    expect(readLedgerMigrationSql()).toMatch(/CREATE TABLE "system_settings"/);
  });

  it('権限 claude_vision:use を ON CONFLICT DO NOTHING で足す（49.6, D7）', () => {
    const insert = splitStatements(readLedgerMigrationSql()).find((s) =>
      /^INSERT INTO "permissions"/.test(s)
    );
    expect(insert).toBeDefined();
    expect(insert).toMatch(/'claude_vision', 'use'/);
    expect(insert).toMatch(/ON CONFLICT \("resource", "action"\) DO NOTHING$/);
  });

  it('estimate_request:read を持つロールへ INSERT ... SELECT で claude_vision:use を付与する（49.6, D7）', () => {
    const grant = splitStatements(readLedgerMigrationSql()).find((s) =>
      /^INSERT INTO "role_permissions"/.test(s)
    );
    expect(grant).toBeDefined();
    expect(grant).toMatch(/SELECT/);
    expect(grant).toMatch(/"resource" = 'estimate_request'/);
    expect(grant).toMatch(/"action" = 'read'/);
    expect(grant).toMatch(/"resource" = 'claude_vision'/);
    expect(grant).toMatch(/ON CONFLICT \("roleId", "permissionId"\) DO NOTHING$/);
  });

  it('既存のデータを消す文を含まない', () => {
    for (const statement of splitStatements(readLedgerMigrationSql())) {
      expect(statement).not.toMatch(/^(DELETE|TRUNCATE|DROP TABLE)\b/i);
      expect(statement).not.toMatch(/DROP COLUMN/i);
    }
  });
});
