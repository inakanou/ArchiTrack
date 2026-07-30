/**
 * @fileoverview EstimateItemType への NOTE（注記行）追加のスキーマ／マイグレーション検証テスト
 *
 * TDD: Prisma スキーマの enum 定義とマイグレーションSQLが設計仕様に沿うことを検証する。
 *
 * Requirements (estimate-creation):
 * - REQ-55.1: 名称のみを持ち規格・単位・数量・単価・金額を持たない注記行を明細に追加可能とする
 *
 * Design (estimate-creation / 追加設計（REQ-42〜56対応）):
 * - Data Models > 物理データモデル（マイグレーション2件）> 2. add_estimate_item_note_type（55.1）
 *   - EstimateItemType に NOTE を追加する
 *   - @default(STANDARD) のため既存データは無変更で後方互換
 *   - NOTE 項目は EstimateItemLine を ESTIMATE の1件のみ持ち、name 以外は NULL とする
 * - Boundary Commitments > This Spec Owns > 明細の種別
 *
 * Task 52.1 Specification:
 * - 見積項目の種別に注記行を表す値を追加する
 * - 既定値は通常項目のままとし、既存データを変更せずに適用できる
 * - 注記行は見積金額行のみを持ち、名称以外の項目を持たない構造とする
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { resolve } from 'path';
import { EstimateItemType } from '../../../generated/prisma/client.js';
import type { Prisma } from '../../../generated/prisma/client.js';

const prismaDir = resolve(__dirname, '../../../../prisma');
const schemaPrisma = readFileSync(resolve(prismaDir, 'schema.prisma'), 'utf-8');

const MIGRATION_SUFFIX = '_add_estimate_item_note_type';

/** タイムスタンプ接頭辞に依存せずマイグレーションディレクトリを解決する */
function findNoteTypeMigrationDir(): string | undefined {
  return readdirSync(resolve(prismaDir, 'migrations'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .find((name) => name.endsWith(MIGRATION_SUFFIX));
}

/** マイグレーションSQLを読み込む（未作成なら例外でテストを失敗させる） */
function readNoteTypeMigrationSql(): string {
  const dir = findNoteTypeMigrationDir();
  if (dir === undefined) {
    throw new Error(`*${MIGRATION_SUFFIX} マイグレーションが存在しない`);
  }
  return readFileSync(resolve(prismaDir, 'migrations', dir, 'migration.sql'), 'utf-8');
}

describe('EstimateItemType に NOTE を追加するスキーマ定義（55.1）', () => {
  const enumBlock = /enum EstimateItemType \{([\s\S]*?)\n\}/.exec(schemaPrisma)?.[1] ?? '';

  it('schema.prisma の EstimateItemType が NOTE を含む', () => {
    // REQ-55.1: 注記行を表す種別を明細の種別に追加する
    expect(enumBlock).not.toBe('');
    expect(enumBlock).toMatch(/^\s*NOTE\b/m);
  });

  it('schema.prisma の EstimateItemType が既存の STANDARD / DISCOUNT を保持する', () => {
    expect(enumBlock).toMatch(/^\s*STANDARD\b/m);
    expect(enumBlock).toMatch(/^\s*DISCOUNT\b/m);
  });

  it('EstimateItem.itemType の既定値が STANDARD のままである', () => {
    // Task 52.1: 既定値は通常項目のまま（既存データの後方互換）
    const itemTypeField = /^\s*itemType\s+EstimateItemType.*$/m.exec(schemaPrisma)?.[0] ?? '';
    expect(itemTypeField).toContain('@default(STANDARD)');
  });

  it('生成された Prisma クライアントの EstimateItemType が3種別を公開する', () => {
    expect(EstimateItemType.NOTE).toBe('NOTE');
    expect(Object.values(EstimateItemType)).toEqual(['STANDARD', 'DISCOUNT', 'NOTE']);
  });

  it('EstimateItemCreateInput の itemType に NOTE を指定できる', () => {
    // 型レベルで NOTE が受け入れられることの検証
    const input: Prisma.EstimateItemCreateInput = {
      itemType: 'NOTE',
      displayOrder: 0,
      estimate: { connect: { id: 'estimate-id' } },
    };

    expect(input.itemType).toBe(EstimateItemType.NOTE);
  });

  it('注記行は見積金額行1件のみを持ち名称以外を省略した構造で表現できる', () => {
    // 設計: NOTE 項目は EstimateItemLine を ESTIMATE の1件のみ持ち name 以外は NULL
    const input: Prisma.EstimateItemCreateInput = {
      itemType: EstimateItemType.NOTE,
      displayOrder: 0,
      estimate: { connect: { id: 'estimate-id' } },
      lines: {
        create: [{ lineType: 'ESTIMATE', name: '※ 支給材は別途' }],
      },
    };

    const lines = (
      input.lines as { create: Prisma.EstimateItemLineCreateWithoutEstimateItemInput[] }
    ).create;
    expect(lines).toHaveLength(1);

    const [estimateLine] = lines;
    expect(estimateLine).toBeDefined();
    expect(estimateLine?.lineType).toBe('ESTIMATE');
    expect(estimateLine?.name).toBe('※ 支給材は別途');
    expect(estimateLine?.specification).toBeUndefined();
    expect(estimateLine?.unit).toBeUndefined();
    expect(estimateLine?.quantity).toBeUndefined();
    expect(estimateLine?.unitPrice).toBeUndefined();
    expect(estimateLine?.amount).toBeUndefined();
  });
});

describe('add_estimate_item_note_type マイグレーション（55.1）', () => {
  it('マイグレーションディレクトリが存在する', () => {
    expect(findNoteTypeMigrationDir()).toBeDefined();
  });

  it('EstimateItemType に NOTE を追加するSQLである', () => {
    expect(readNoteTypeMigrationSql()).toMatch(/ALTER TYPE "EstimateItemType" ADD VALUE 'NOTE'/);
  });

  it('既存データを変更するSQLを含まない', () => {
    // Task 52.1: 既存データを変更せずに適用できること
    const sql = readNoteTypeMigrationSql();

    // コメント行を除いた実行文のみを検査する
    const statements = sql
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line !== '' && !line.startsWith('--'));

    expect(statements.length).toBeGreaterThan(0);
    for (const statement of statements) {
      expect(statement).toMatch(/^ALTER TYPE "EstimateItemType" ADD VALUE 'NOTE';?$/);
    }
  });
});
