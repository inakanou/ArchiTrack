/**
 * @fileoverview 内訳書スキーマの統合テスト
 *
 * Task 1 検証:
 * - ItemizedStatementテーブルの作成とリレーション
 * - ItemizedStatementItemテーブルの作成とリレーション
 * - 部分一意制約（同一プロジェクト内での内訳書名重複防止）
 * - カスケード削除
 * - インデックス
 *
 * Requirements:
 * - REQ-8.1: スナップショット独立性
 * - REQ-10.1: 楽観的排他制御用updatedAt
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { PrismaClient, Prisma } from '../../generated/prisma/client.js';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

const { Pool } = pg;

describe('ItemizedStatement Schema Integration Tests', () => {
  let prisma: PrismaClient;
  let pool: pg.Pool;

  // テストデータ用のID
  let testProjectId: string;
  let testUserId: string;

  beforeAll(async () => {
    const connectionString =
      process.env.DATABASE_URL || 'postgresql://postgres:test@localhost:5433/architrack_test';
    pool = new Pool({ connectionString });
    const adapter = new PrismaPg(pool);
    prisma = new PrismaClient({ adapter });

    // テスト用ユーザーを作成
    const user = await prisma.user.create({
      data: {
        email: `itemized-test-${Date.now()}@example.com`,
        displayName: 'Itemized Test User',
        passwordHash: 'test-hash',
      },
    });
    testUserId = user.id;

    // テスト用プロジェクトを作成
    const project = await prisma.project.create({
      data: {
        name: `テストプロジェクト-${Date.now()}`,
        salesPersonId: testUserId,
        createdById: testUserId,
      },
    });
    testProjectId = project.id;
  });

  afterAll(async () => {
    // クリーンアップ: プロジェクト削除でカスケード削除される
    await prisma.project.deleteMany({
      where: { createdById: testUserId },
    });
    await prisma.user.delete({
      where: { id: testUserId },
    });
    await prisma.$disconnect();
    await pool.end();
  });

  afterEach(async () => {
    // 各テスト後に内訳書データをクリーンアップ
    await prisma.itemizedStatement.deleteMany({
      where: { projectId: testProjectId },
    });
  });

  describe('ItemizedStatement CRUD operations', () => {
    it('should create an itemized statement with all required fields', async () => {
      const statement = await prisma.itemizedStatement.create({
        data: {
          projectId: testProjectId,
          name: 'テスト内訳書',
          sourceQuantityTableId: 'quantity-table-uuid-001',
          sourceQuantityTableName: 'テスト数量表',
        },
      });

      expect(statement.id).toBeDefined();
      expect(statement.projectId).toBe(testProjectId);
      expect(statement.name).toBe('テスト内訳書');
      expect(statement.sourceQuantityTableId).toBe('quantity-table-uuid-001');
      expect(statement.sourceQuantityTableName).toBe('テスト数量表');
      expect(statement.createdAt).toBeInstanceOf(Date);
      expect(statement.updatedAt).toBeInstanceOf(Date);
      expect(statement.deletedAt).toBeNull();
    });

    it('should include items relation when fetched', async () => {
      const statement = await prisma.itemizedStatement.create({
        data: {
          projectId: testProjectId,
          name: 'テスト内訳書（項目付き）',
          sourceQuantityTableId: 'quantity-table-uuid-002',
          sourceQuantityTableName: 'テスト数量表2',
          items: {
            create: [
              {
                customCategory: '分類A',
                workType: '工種1',
                name: '名称1',
                specification: '規格1',
                unit: 'm',
                quantity: new Prisma.Decimal('123.45'),
                displayOrder: 1,
              },
              {
                customCategory: '分類B',
                workType: '工種2',
                name: '名称2',
                specification: '規格2',
                unit: 'm2',
                quantity: new Prisma.Decimal('67.89'),
                displayOrder: 2,
              },
            ],
          },
        },
        include: { items: true },
      });

      expect(statement.items).toHaveLength(2);
      expect(statement.items[0]!.quantity.toString()).toBe('123.45');
      expect(statement.items[1]!.quantity.toString()).toBe('67.89');
    });

    it('should soft delete an itemized statement', async () => {
      const statement = await prisma.itemizedStatement.create({
        data: {
          projectId: testProjectId,
          name: '削除予定内訳書',
          sourceQuantityTableId: 'quantity-table-uuid-003',
          sourceQuantityTableName: 'テスト数量表3',
        },
      });

      const deletedAt = new Date();
      await prisma.itemizedStatement.update({
        where: { id: statement.id },
        data: { deletedAt },
      });

      const softDeleted = await prisma.itemizedStatement.findUnique({
        where: { id: statement.id },
      });

      expect(softDeleted?.deletedAt).not.toBeNull();
    });
  });

  describe('Partial unique constraint (name uniqueness within project)', () => {
    it('should prevent duplicate names within the same project for non-deleted records', async () => {
      const statementName = '重複テスト内訳書';

      await prisma.itemizedStatement.create({
        data: {
          projectId: testProjectId,
          name: statementName,
          sourceQuantityTableId: 'quantity-table-uuid-004',
          sourceQuantityTableName: 'テスト数量表4',
        },
      });

      // 同じプロジェクト内で同じ名前の内訳書を作成しようとするとエラー
      await expect(
        prisma.itemizedStatement.create({
          data: {
            projectId: testProjectId,
            name: statementName,
            sourceQuantityTableId: 'quantity-table-uuid-005',
            sourceQuantityTableName: 'テスト数量表5',
          },
        })
      ).rejects.toThrow();
    });

    it('should allow same name after soft delete', async () => {
      const statementName = '再利用可能名前';

      const statement1 = await prisma.itemizedStatement.create({
        data: {
          projectId: testProjectId,
          name: statementName,
          sourceQuantityTableId: 'quantity-table-uuid-006',
          sourceQuantityTableName: 'テスト数量表6',
        },
      });

      // 論理削除
      await prisma.itemizedStatement.update({
        where: { id: statement1.id },
        data: { deletedAt: new Date() },
      });

      // 同じ名前で新しい内訳書を作成できる
      const statement2 = await prisma.itemizedStatement.create({
        data: {
          projectId: testProjectId,
          name: statementName,
          sourceQuantityTableId: 'quantity-table-uuid-007',
          sourceQuantityTableName: 'テスト数量表7',
        },
      });

      expect(statement2.name).toBe(statementName);
      expect(statement2.id).not.toBe(statement1.id);
    });
  });

  describe('Cascade delete behavior', () => {
    it('should cascade delete items when statement is deleted', async () => {
      const statement = await prisma.itemizedStatement.create({
        data: {
          projectId: testProjectId,
          name: 'カスケード削除テスト',
          sourceQuantityTableId: 'quantity-table-uuid-008',
          sourceQuantityTableName: 'テスト数量表8',
          items: {
            create: [
              {
                customCategory: '分類',
                workType: '工種',
                name: '名称',
                specification: '規格',
                unit: 'm',
                quantity: new Prisma.Decimal('100.00'),
                displayOrder: 1,
              },
            ],
          },
        },
        include: { items: true },
      });

      const itemId = statement.items[0]!.id;

      // 内訳書を削除
      await prisma.itemizedStatement.delete({
        where: { id: statement.id },
      });

      // 項目も削除されていることを確認
      const item = await prisma.itemizedStatementItem.findUnique({
        where: { id: itemId },
      });

      expect(item).toBeNull();
    });

    it('should cascade delete statements when project is deleted', async () => {
      // 新しいプロジェクトを作成
      const tempProject = await prisma.project.create({
        data: {
          name: `一時プロジェクト-${Date.now()}`,
          salesPersonId: testUserId,
          createdById: testUserId,
        },
      });

      const statement = await prisma.itemizedStatement.create({
        data: {
          projectId: tempProject.id,
          name: 'プロジェクト削除テスト内訳書',
          sourceQuantityTableId: 'quantity-table-uuid-009',
          sourceQuantityTableName: 'テスト数量表9',
          items: {
            create: [
              {
                quantity: new Prisma.Decimal('50.00'),
                displayOrder: 1,
              },
            ],
          },
        },
      });

      // プロジェクトを削除
      await prisma.project.delete({
        where: { id: tempProject.id },
      });

      // 内訳書も削除されていることを確認
      const deletedStatement = await prisma.itemizedStatement.findUnique({
        where: { id: statement.id },
      });

      expect(deletedStatement).toBeNull();
    });
  });

  describe('ItemizedStatementItem precision', () => {
    it('should store quantity with 2 decimal places precision', async () => {
      const statement = await prisma.itemizedStatement.create({
        data: {
          projectId: testProjectId,
          name: '精度テスト内訳書',
          sourceQuantityTableId: 'quantity-table-uuid-010',
          sourceQuantityTableName: 'テスト数量表10',
          items: {
            create: [
              {
                quantity: new Prisma.Decimal('123.45'),
                displayOrder: 1,
              },
              {
                quantity: new Prisma.Decimal('99999999.99'), // 最大値に近い値
                displayOrder: 2,
              },
              {
                quantity: new Prisma.Decimal('0.01'), // 最小単位
                displayOrder: 3,
              },
            ],
          },
        },
        include: { items: { orderBy: { displayOrder: 'asc' } } },
      });

      expect(statement.items[0]!.quantity.toString()).toBe('123.45');
      expect(statement.items[1]!.quantity.toString()).toBe('99999999.99');
      expect(statement.items[2]!.quantity.toString()).toBe('0.01');
    });

    it('should round quantity to 2 decimal places', async () => {
      const statement = await prisma.itemizedStatement.create({
        data: {
          projectId: testProjectId,
          name: '丸めテスト内訳書',
          sourceQuantityTableId: 'quantity-table-uuid-011',
          sourceQuantityTableName: 'テスト数量表11',
          items: {
            create: [
              {
                quantity: new Prisma.Decimal('123.456'), // 3桁目は切り捨て/四捨五入
                displayOrder: 1,
              },
            ],
          },
        },
        include: { items: true },
      });

      // PostgreSQLのDECIMAL(10,2)は2桁に丸められる
      const qty = statement.items[0]!.quantity.toString();
      expect(qty).toMatch(/^\d+\.\d{2}$/);
    });
  });

  describe('Filtering and sorting', () => {
    it('should filter by projectId and exclude soft-deleted records', async () => {
      await prisma.itemizedStatement.create({
        data: {
          projectId: testProjectId,
          name: 'フィルタテスト1',
          sourceQuantityTableId: 'qt-1',
          sourceQuantityTableName: '数量表1',
        },
      });

      await prisma.itemizedStatement.create({
        data: {
          projectId: testProjectId,
          name: 'フィルタテスト2（削除済）',
          sourceQuantityTableId: 'qt-2',
          sourceQuantityTableName: '数量表2',
          deletedAt: new Date(),
        },
      });

      const activeStatements = await prisma.itemizedStatement.findMany({
        where: {
          projectId: testProjectId,
          deletedAt: null,
        },
      });

      expect(activeStatements.every((s) => s.deletedAt === null)).toBe(true);
    });

    it('should sort by createdAt descending', async () => {
      const s1 = await prisma.itemizedStatement.create({
        data: {
          projectId: testProjectId,
          name: 'ソートテスト1',
          sourceQuantityTableId: 'qt-sort-1',
          sourceQuantityTableName: '数量表ソート1',
        },
      });

      // 少し待ってから2つ目を作成
      await new Promise((resolve) => setTimeout(resolve, 10));

      const s2 = await prisma.itemizedStatement.create({
        data: {
          projectId: testProjectId,
          name: 'ソートテスト2',
          sourceQuantityTableId: 'qt-sort-2',
          sourceQuantityTableName: '数量表ソート2',
        },
      });

      const sorted = await prisma.itemizedStatement.findMany({
        where: { projectId: testProjectId, deletedAt: null },
        orderBy: { createdAt: 'desc' },
      });

      expect(sorted[0]!.id).toBe(s2.id);
      expect(sorted[1]!.id).toBe(s1.id);
    });
  });
});
