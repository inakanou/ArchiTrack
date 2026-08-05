/**
 * @fileoverview 見積書への帳票用追加項目（提出日・有効期限・別途工事）のスキーマ／マイグレーション検証テスト
 *
 * TDD: Prisma スキーマの Estimate モデル定義とマイグレーションSQLが設計仕様に沿うことを検証する。
 *
 * Requirements (estimate-creation):
 * - REQ-54.1: 見積書に別途工事の記載を5件まで入力可能とする
 * - REQ-54.2: 見積書に見積の有効期限を入力可能とする
 * - REQ-54.3: 見積書に提出日を入力可能とする
 * - REQ-54.7: これらの項目が未入力の場合、帳票の該当欄を空欄として出力し出力自体は継続する
 *
 * Design (estimate-creation / 追加設計（REQ-42〜56対応）):
 * - Data Models > 物理データモデル（マイグレーション2件）> 1. add_estimate_report_fields（54.1〜54.3）
 *   | submission_date | DATE          | NULL 許容                   |
 *   | validity_period | VARCHAR(100)  | NULL 許容                   |
 *   | separate_works  | TEXT[]        | NOT NULL DEFAULT '{}'       |
 *   最大5件はアプリ側で検証する（DB制約は置かない）。順序を保持する。
 * - Data Models > 論理データモデルの差分（ER図の Estimate 3列）
 * - Boundary Commitments > This Spec Owns > 見積書の帳票用追加項目
 *
 * Task 52.2 Specification:
 * - 見積書に提出日・有効期限・別途工事の記載を保持する項目を追加する
 * - 別途工事は順序を保持でき5件まで格納できる形とする
 * - いずれも未入力を許容し、既定値で既存データに影響を与えない
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { resolve } from 'path';
import type { Prisma } from '../../../generated/prisma/client.js';

const prismaDir = resolve(__dirname, '../../../../prisma');
const schemaPrisma = readFileSync(resolve(prismaDir, 'schema.prisma'), 'utf-8');

const MIGRATION_SUFFIX = '_add_estimate_report_fields';

/** タイムスタンプ接頭辞に依存せずマイグレーションディレクトリを解決する */
function findReportFieldsMigrationDir(): string | undefined {
  return readdirSync(resolve(prismaDir, 'migrations'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .find((name) => name.endsWith(MIGRATION_SUFFIX));
}

/** マイグレーションSQLを読み込む（未作成なら例外でテストを失敗させる） */
function readReportFieldsMigrationSql(): string {
  const dir = findReportFieldsMigrationDir();
  if (dir === undefined) {
    throw new Error(`*${MIGRATION_SUFFIX} マイグレーションが存在しない`);
  }
  return readFileSync(resolve(prismaDir, 'migrations', dir, 'migration.sql'), 'utf-8');
}

/** Estimate モデルのブロック本体を取り出す */
function getEstimateModelBlock(): string {
  return /^model Estimate \{([\s\S]*?)^\}/m.exec(schemaPrisma)?.[1] ?? '';
}

/** Estimate モデル内の指定フィールド行を取り出す */
function getEstimateField(fieldName: string): string {
  const block = getEstimateModelBlock();
  return new RegExp(`^\\s*${fieldName}\\s+.*$`, 'm').exec(block)?.[0] ?? '';
}

describe('Estimate に帳票用追加項目を持たせるスキーマ定義（54.1〜54.3）', () => {
  it('Estimate モデルのブロックを取得できる', () => {
    expect(getEstimateModelBlock()).not.toBe('');
  });

  it('提出日を DATE 型・NULL 許容の submission_date 列として持つ（54.3）', () => {
    const field = getEstimateField('submissionDate');

    expect(field).not.toBe('');
    // NULL 許容（未入力を許容し既存レコードは NULL）
    expect(field).toMatch(/^\s*submissionDate\s+DateTime\?/);
    // 物理型は DATE（時刻を持たない提出日）
    expect(field).toContain('@db.Date');
    // 物理列名は設計の列定義表どおり
    expect(field).toContain('@map("submission_date")');
  });

  it('有効期限を VARCHAR(100)・NULL 許容の validity_period 列として持つ（54.2）', () => {
    const field = getEstimateField('validityPeriod');

    expect(field).not.toBe('');
    // 「提出日より1ヶ月間」等の自由文を NULL 許容で保持する
    expect(field).toMatch(/^\s*validityPeriod\s+String\?/);
    expect(field).toContain('@db.VarChar(100)');
    expect(field).toContain('@map("validity_period")');
  });

  it('別途工事を順序保持の文字列配列・既定値空配列の separate_works 列として持つ（54.1）', () => {
    const field = getEstimateField('separateWorks');

    expect(field).not.toBe('');
    // TEXT[]（順序を保持できる配列）。NULL 許容ではなく既定値で未入力を表現する
    expect(field).toMatch(/^\s*separateWorks\s+String\[\]/);
    expect(field).not.toMatch(/String\[\]\?/);
    // 既定値で既存データに影響を与えない（NOT NULL DEFAULT '{}'）
    expect(field).toContain('@default([])');
    expect(field).toContain('@map("separate_works")');
  });

  it('5件上限をDB制約ではなくアプリ側で検証する（設計: 最大5件はアプリ側で検証）', () => {
    const block = getEstimateModelBlock();

    // 配列長を縛る固定列（separateWork1..5 等）を作らない
    expect(block).not.toMatch(/separateWork[1-5]\b/);
  });

  it('既存の見積書項目（name / updatedAt / deletedAt）を保持する', () => {
    const block = getEstimateModelBlock();

    expect(block).toMatch(/^\s*name\s+String\b/m);
    expect(block).toMatch(/^\s*updatedAt\s+DateTime\s+@updatedAt/m);
    expect(block).toMatch(/^\s*deletedAt\s+DateTime\?/m);
  });
});

describe('生成された Prisma クライアントの型（54.1〜54.3, 54.7）', () => {
  it('3項目を未指定のまま見積書を作成できる（既存の作成経路に影響しない）', () => {
    const input: Prisma.EstimateCreateInput = {
      name: '見積書A',
      project: { connect: { id: 'project-id' } },
    };

    expect(input.submissionDate).toBeUndefined();
    expect(input.validityPeriod).toBeUndefined();
    expect(input.separateWorks).toBeUndefined();
  });

  it('提出日・有効期限・別途工事を指定して見積書を作成できる', () => {
    const submissionDate = new Date('2026-07-30T00:00:00.000Z');
    const input: Prisma.EstimateCreateInput = {
      name: '見積書B',
      project: { connect: { id: 'project-id' } },
      submissionDate,
      validityPeriod: '提出日より1ヶ月間',
      separateWorks: { set: ['電気設備工事', '給排水衛生設備工事'] },
    };

    expect(input.submissionDate).toBe(submissionDate);
    expect(input.validityPeriod).toBe('提出日より1ヶ月間');
    expect(input.separateWorks).toEqual({ set: ['電気設備工事', '給排水衛生設備工事'] });
  });

  it('提出日・有効期限を NULL に戻せる（未入力を許容する）', () => {
    const input: Prisma.EstimateUpdateInput = {
      submissionDate: null,
      validityPeriod: null,
      separateWorks: { set: [] },
    };

    expect(input.submissionDate).toBeNull();
    expect(input.validityPeriod).toBeNull();
  });

  it('別途工事は入力順を保持したまま5件まで格納できる（54.1）', () => {
    const separateWorks = [
      '電気設備工事',
      '給排水衛生設備工事',
      '空調設備工事',
      '外構工事',
      '什器備品',
    ];
    const input: Prisma.EstimateUpdateInput = {
      separateWorks: { set: separateWorks },
    };

    const stored = (input.separateWorks as { set: string[] }).set;
    expect(stored).toHaveLength(5);
    // 配列型のため順序がそのまま保持される
    expect(stored).toEqual(separateWorks);
  });
});

describe('add_estimate_report_fields マイグレーション（54.1〜54.3）', () => {
  it('マイグレーションディレクトリが存在する', () => {
    expect(findReportFieldsMigrationDir()).toBeDefined();
  });

  it('estimates テーブルへ3列を追加するSQLである', () => {
    const sql = readReportFieldsMigrationSql();

    expect(sql).toMatch(/ADD COLUMN\s+"submission_date"\s+DATE/i);
    expect(sql).toMatch(/ADD COLUMN\s+"validity_period"\s+VARCHAR\(100\)/i);
    expect(sql).toMatch(/ADD COLUMN\s+"separate_works"\s+TEXT\[\]/i);
    expect(sql).toMatch(/ALTER TABLE\s+"estimates"/i);
  });

  it('提出日・有効期限に NOT NULL を付けない（未入力を許容する）', () => {
    const sql = readReportFieldsMigrationSql();

    const submission = /ADD COLUMN\s+"submission_date"[^,;]*/i.exec(sql)?.[0] ?? '';
    const validity = /ADD COLUMN\s+"validity_period"[^,;]*/i.exec(sql)?.[0] ?? '';

    expect(submission).not.toMatch(/NOT NULL/i);
    expect(validity).not.toMatch(/NOT NULL/i);
  });

  it('別途工事は NOT NULL かつ空配列の既定値を持つ（既存行を無変更で適用できる）', () => {
    const sql = readReportFieldsMigrationSql();
    const separate = /ADD COLUMN\s+"separate_works"[^,;]*/i.exec(sql)?.[0] ?? '';

    expect(separate).toMatch(/NOT NULL/i);
    // '{}' もしくは ARRAY[]::TEXT[] のいずれの表記でも空配列既定値とみなす
    expect(separate).toMatch(/DEFAULT\s+(ARRAY\[\]::TEXT\[\]|'\{\}')/i);
  });

  it('5件上限のDB制約（CHECK）を置かない（アプリ側で検証する）', () => {
    const sql = readReportFieldsMigrationSql();

    expect(sql).not.toMatch(/CHECK\s*\(/i);
  });

  it('既存データを変更するSQLを含まない', () => {
    const sql = readReportFieldsMigrationSql();

    // コメント行を除いた実行文のみを検査する
    const statements = sql
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line !== '' && !line.startsWith('--'));

    expect(statements.length).toBeGreaterThan(0);
    for (const statement of statements) {
      expect(statement).not.toMatch(/^\s*(UPDATE|DELETE|INSERT|TRUNCATE|DROP)\b/i);
    }
    // ALTER TABLE "estimates" 以外のテーブルへ波及しない
    expect(sql).not.toMatch(/ALTER TABLE\s+"(?!estimates")/i);
  });
});
