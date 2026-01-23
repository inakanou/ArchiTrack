/**
 * @fileoverview 見積依頼スキーマの統合テスト
 *
 * Task 1.3 検証:
 * - EstimateRequestテーブルの作成とリレーション
 * - EstimateRequestItemテーブルの作成とリレーション
 * - ユニーク制約（estimateRequestId + itemizedStatementItemId）
 * - カスケード削除
 * - インデックス
 *
 * Requirements:
 * - 8.1: 見積依頼をプロジェクトに紐づけて保存する
 * - 8.2: 見積依頼に選択された項目リストを保存する
 * - 8.3: タイムスタンプ記録
 * - 8.4: 論理削除
 * - 8.5: 楽観的排他制御
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { PrismaClient } from '../../generated/prisma/client.js';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

const { Pool } = pg;

describe('EstimateRequest Schema Integration Tests', () => {
  let prisma: PrismaClient;
  let pool: pg.Pool;

  // テストデータ用のID
  let testProjectId: string;
  let testUserId: string;
  let testTradingPartnerId: string;
  let testItemizedStatementId: string;
  let testItemizedStatementItemId: string;

  beforeAll(async () => {
    const connectionString =
      process.env.DATABASE_URL || 'postgresql://postgres:test@localhost:5433/architrack_test';
    pool = new Pool({ connectionString });
    const adapter = new PrismaPg(pool);
    prisma = new PrismaClient({ adapter });

    // テスト用ユーザーを作成
    const user = await prisma.user.create({
      data: {
        email: `estimate-request-test-${Date.now()}@example.com`,
        displayName: 'Estimate Request Test User',
        passwordHash: 'test-hash',
      },
    });
    testUserId = user.id;

    // テスト用取引先を作成
    const tradingPartner = await prisma.tradingPartner.create({
      data: {
        name: `テスト取引先-${Date.now()}`,
        nameKana: 'テストトリヒキサキ',
        address: '東京都千代田区1-1-1',
        phoneNumber: '03-1234-5678',
        email: 'test@example.com',
        types: {
          create: [{ type: 'SUBCONTRACTOR' }],
        },
      },
    });
    testTradingPartnerId = tradingPartner.id;

    // テスト用プロジェクトを作成
    const project = await prisma.project.create({
      data: {
        name: `テストプロジェクト-${Date.now()}`,
        salesPersonId: testUserId,
        createdById: testUserId,
      },
    });
    testProjectId = project.id;

    // テスト用内訳書を作成
    const statement = await prisma.itemizedStatement.create({
      data: {
        projectId: testProjectId,
        name: 'テスト内訳書',
        sourceQuantityTableId: 'quantity-table-uuid-001',
        sourceQuantityTableName: 'テスト数量表',
        items: {
          create: [
            {
              customCategory: '任意分類1',
              workType: '工種1',
              name: '名称1',
              specification: '規格1',
              unit: '式',
              quantity: 10.5,
              displayOrder: 1,
            },
            {
              customCategory: '任意分類2',
              workType: '工種2',
              name: '名称2',
              specification: '規格2',
              unit: 'm',
              quantity: 20.0,
              displayOrder: 2,
            },
          ],
        },
      },
      include: {
        items: true,
      },
    });
    testItemizedStatementId = statement.id;
    testItemizedStatementItemId = statement.items[0]!.id;
  });

  afterAll(async () => {
    // クリーンアップ: 見積依頼 -> 内訳書 -> プロジェクト -> 取引先 -> ユーザー の順で削除
    await prisma.estimateRequest.deleteMany({
      where: { projectId: testProjectId },
    });
    await prisma.itemizedStatement.deleteMany({
      where: { projectId: testProjectId },
    });
    await prisma.project.deleteMany({
      where: { createdById: testUserId },
    });
    await prisma.tradingPartner.delete({
      where: { id: testTradingPartnerId },
    });
    await prisma.user.delete({
      where: { id: testUserId },
    });
    await prisma.$disconnect();
    await pool.end();
  });

  afterEach(async () => {
    // 各テスト後に見積依頼データをクリーンアップ
    await prisma.estimateRequest.deleteMany({
      where: { projectId: testProjectId },
    });
  });

  describe('EstimateRequest CRUD operations', () => {
    it('should create an estimate request with all required fields', async () => {
      // Requirements: 8.1 - 見積依頼をプロジェクトに紐づけて保存する
      const estimateRequest = await prisma.estimateRequest.create({
        data: {
          projectId: testProjectId,
          tradingPartnerId: testTradingPartnerId,
          itemizedStatementId: testItemizedStatementId,
          name: 'テスト見積依頼',
        },
      });

      expect(estimateRequest.id).toBeDefined();
      expect(estimateRequest.projectId).toBe(testProjectId);
      expect(estimateRequest.tradingPartnerId).toBe(testTradingPartnerId);
      expect(estimateRequest.itemizedStatementId).toBe(testItemizedStatementId);
      expect(estimateRequest.name).toBe('テスト見積依頼');
      expect(estimateRequest.method).toBe('EMAIL'); // デフォルト値
      expect(estimateRequest.includeBreakdownInBody).toBe(false); // デフォルト値
    });

    it('should create an estimate request with EMAIL method', async () => {
      // Requirements: 4.8, 4.9 - メール送信方法
      const estimateRequest = await prisma.estimateRequest.create({
        data: {
          projectId: testProjectId,
          tradingPartnerId: testTradingPartnerId,
          itemizedStatementId: testItemizedStatementId,
          name: 'メール見積依頼',
          method: 'EMAIL',
        },
      });

      expect(estimateRequest.method).toBe('EMAIL');
    });

    it('should create an estimate request with FAX method', async () => {
      // Requirements: 4.8 - FAX送信方法
      const estimateRequest = await prisma.estimateRequest.create({
        data: {
          projectId: testProjectId,
          tradingPartnerId: testTradingPartnerId,
          itemizedStatementId: testItemizedStatementId,
          name: 'FAX見積依頼',
          method: 'FAX',
        },
      });

      expect(estimateRequest.method).toBe('FAX');
    });

    it('should have timestamp fields', async () => {
      // Requirements: 8.3 - タイムスタンプ記録
      const estimateRequest = await prisma.estimateRequest.create({
        data: {
          projectId: testProjectId,
          tradingPartnerId: testTradingPartnerId,
          itemizedStatementId: testItemizedStatementId,
          name: 'タイムスタンプテスト',
        },
      });

      expect(estimateRequest.createdAt).toBeInstanceOf(Date);
      expect(estimateRequest.updatedAt).toBeInstanceOf(Date);
      expect(estimateRequest.deletedAt).toBeNull();
    });

    it('should support soft delete with deletedAt', async () => {
      // Requirements: 8.4 - 論理削除
      const estimateRequest = await prisma.estimateRequest.create({
        data: {
          projectId: testProjectId,
          tradingPartnerId: testTradingPartnerId,
          itemizedStatementId: testItemizedStatementId,
          name: '論理削除テスト',
        },
      });

      const deletedRequest = await prisma.estimateRequest.update({
        where: { id: estimateRequest.id },
        data: { deletedAt: new Date() },
      });

      expect(deletedRequest.deletedAt).toBeInstanceOf(Date);
    });

    it('should update and change updatedAt for optimistic locking', async () => {
      // Requirements: 8.5 - 楽観的排他制御
      const estimateRequest = await prisma.estimateRequest.create({
        data: {
          projectId: testProjectId,
          tradingPartnerId: testTradingPartnerId,
          itemizedStatementId: testItemizedStatementId,
          name: '楽観的排他制御テスト',
        },
      });

      const originalUpdatedAt = estimateRequest.updatedAt;

      // 少し待機してから更新
      await new Promise((resolve) => setTimeout(resolve, 10));

      const updatedRequest = await prisma.estimateRequest.update({
        where: { id: estimateRequest.id },
        data: { name: '更新された見積依頼' },
      });

      expect(updatedRequest.updatedAt.getTime()).toBeGreaterThan(originalUpdatedAt.getTime());
    });
  });

  describe('EstimateRequest relations', () => {
    it('should include project relation', async () => {
      const estimateRequest = await prisma.estimateRequest.create({
        data: {
          projectId: testProjectId,
          tradingPartnerId: testTradingPartnerId,
          itemizedStatementId: testItemizedStatementId,
          name: 'リレーションテスト',
        },
        include: {
          project: true,
        },
      });

      expect(estimateRequest.project).toBeDefined();
      expect(estimateRequest.project.id).toBe(testProjectId);
    });

    it('should include tradingPartner relation', async () => {
      const estimateRequest = await prisma.estimateRequest.create({
        data: {
          projectId: testProjectId,
          tradingPartnerId: testTradingPartnerId,
          itemizedStatementId: testItemizedStatementId,
          name: '取引先リレーションテスト',
        },
        include: {
          tradingPartner: true,
        },
      });

      expect(estimateRequest.tradingPartner).toBeDefined();
      expect(estimateRequest.tradingPartner.id).toBe(testTradingPartnerId);
    });

    it('should include itemizedStatement relation', async () => {
      const estimateRequest = await prisma.estimateRequest.create({
        data: {
          projectId: testProjectId,
          tradingPartnerId: testTradingPartnerId,
          itemizedStatementId: testItemizedStatementId,
          name: '内訳書リレーションテスト',
        },
        include: {
          itemizedStatement: true,
        },
      });

      expect(estimateRequest.itemizedStatement).toBeDefined();
      expect(estimateRequest.itemizedStatement.id).toBe(testItemizedStatementId);
    });

    it('should cascade delete estimate request when project is deleted', async () => {
      // 別のプロジェクトを作成
      const tempProject = await prisma.project.create({
        data: {
          name: `一時プロジェクト-${Date.now()}`,
          salesPersonId: testUserId,
          createdById: testUserId,
        },
      });

      // 別の内訳書を作成
      const tempStatement = await prisma.itemizedStatement.create({
        data: {
          projectId: tempProject.id,
          name: '一時内訳書',
          sourceQuantityTableId: 'temp-qt-id',
          sourceQuantityTableName: '一時数量表',
        },
      });

      // 見積依頼を作成
      const estimateRequest = await prisma.estimateRequest.create({
        data: {
          projectId: tempProject.id,
          tradingPartnerId: testTradingPartnerId,
          itemizedStatementId: tempStatement.id,
          name: 'カスケード削除テスト',
        },
      });

      const estimateRequestId = estimateRequest.id;

      // プロジェクトを削除
      await prisma.project.delete({
        where: { id: tempProject.id },
      });

      // 見積依頼もカスケード削除されていることを確認
      const deletedRequest = await prisma.estimateRequest.findUnique({
        where: { id: estimateRequestId },
      });

      expect(deletedRequest).toBeNull();
    });
  });

  describe('EstimateRequestItem CRUD operations', () => {
    it('should create estimate request items', async () => {
      // Requirements: 8.2 - 見積依頼に選択された項目リストを保存する
      const estimateRequest = await prisma.estimateRequest.create({
        data: {
          projectId: testProjectId,
          tradingPartnerId: testTradingPartnerId,
          itemizedStatementId: testItemizedStatementId,
          name: '項目テスト見積依頼',
          selectedItems: {
            create: [
              {
                itemizedStatementItemId: testItemizedStatementItemId,
                selected: true,
              },
            ],
          },
        },
        include: {
          selectedItems: true,
        },
      });

      expect(estimateRequest.selectedItems).toHaveLength(1);
      expect(estimateRequest.selectedItems[0]!.itemizedStatementItemId).toBe(
        testItemizedStatementItemId
      );
      expect(estimateRequest.selectedItems[0]!.selected).toBe(true);
    });

    it('should default selected to false', async () => {
      const estimateRequest = await prisma.estimateRequest.create({
        data: {
          projectId: testProjectId,
          tradingPartnerId: testTradingPartnerId,
          itemizedStatementId: testItemizedStatementId,
          name: 'デフォルト選択テスト',
          selectedItems: {
            create: [
              {
                itemizedStatementItemId: testItemizedStatementItemId,
              },
            ],
          },
        },
        include: {
          selectedItems: true,
        },
      });

      expect(estimateRequest.selectedItems[0]!.selected).toBe(false);
    });

    it('should enforce unique constraint on estimateRequestId + itemizedStatementItemId', async () => {
      const estimateRequest = await prisma.estimateRequest.create({
        data: {
          projectId: testProjectId,
          tradingPartnerId: testTradingPartnerId,
          itemizedStatementId: testItemizedStatementId,
          name: 'ユニーク制約テスト',
          selectedItems: {
            create: [
              {
                itemizedStatementItemId: testItemizedStatementItemId,
                selected: true,
              },
            ],
          },
        },
      });

      // 同じ組み合わせで再度追加しようとするとエラー
      await expect(
        prisma.estimateRequestItem.create({
          data: {
            estimateRequestId: estimateRequest.id,
            itemizedStatementItemId: testItemizedStatementItemId,
            selected: false,
          },
        })
      ).rejects.toThrow();
    });

    it('should cascade delete items when estimate request is deleted', async () => {
      const estimateRequest = await prisma.estimateRequest.create({
        data: {
          projectId: testProjectId,
          tradingPartnerId: testTradingPartnerId,
          itemizedStatementId: testItemizedStatementId,
          name: '項目カスケード削除テスト',
          selectedItems: {
            create: [
              {
                itemizedStatementItemId: testItemizedStatementItemId,
                selected: true,
              },
            ],
          },
        },
        include: {
          selectedItems: true,
        },
      });

      const itemId = estimateRequest.selectedItems[0]!.id;

      // 見積依頼を削除
      await prisma.estimateRequest.delete({
        where: { id: estimateRequest.id },
      });

      // 項目もカスケード削除されていることを確認
      const deletedItem = await prisma.estimateRequestItem.findUnique({
        where: { id: itemId },
      });

      expect(deletedItem).toBeNull();
    });
  });

  describe('EstimateRequest filtering and sorting', () => {
    it('should filter by projectId', async () => {
      await prisma.estimateRequest.create({
        data: {
          projectId: testProjectId,
          tradingPartnerId: testTradingPartnerId,
          itemizedStatementId: testItemizedStatementId,
          name: 'フィルタテスト',
        },
      });

      const requests = await prisma.estimateRequest.findMany({
        where: { projectId: testProjectId },
      });

      expect(requests.length).toBeGreaterThanOrEqual(1);
      expect(requests.every((r) => r.projectId === testProjectId)).toBe(true);
    });

    it('should filter by tradingPartnerId', async () => {
      await prisma.estimateRequest.create({
        data: {
          projectId: testProjectId,
          tradingPartnerId: testTradingPartnerId,
          itemizedStatementId: testItemizedStatementId,
          name: '取引先フィルタテスト',
        },
      });

      const requests = await prisma.estimateRequest.findMany({
        where: { tradingPartnerId: testTradingPartnerId },
      });

      expect(requests.length).toBeGreaterThanOrEqual(1);
      expect(requests.every((r) => r.tradingPartnerId === testTradingPartnerId)).toBe(true);
    });

    it('should filter by deletedAt for active records only', async () => {
      // 有効なレコードを作成
      await prisma.estimateRequest.create({
        data: {
          projectId: testProjectId,
          tradingPartnerId: testTradingPartnerId,
          itemizedStatementId: testItemizedStatementId,
          name: '有効レコード',
        },
      });

      // 削除済みレコードを作成
      await prisma.estimateRequest.create({
        data: {
          projectId: testProjectId,
          tradingPartnerId: testTradingPartnerId,
          itemizedStatementId: testItemizedStatementId,
          name: '削除済みレコード',
          deletedAt: new Date(),
        },
      });

      const activeRequests = await prisma.estimateRequest.findMany({
        where: {
          projectId: testProjectId,
          deletedAt: null,
        },
      });

      const allRequests = await prisma.estimateRequest.findMany({
        where: { projectId: testProjectId },
      });

      expect(activeRequests.length).toBeLessThan(allRequests.length);
      expect(activeRequests.every((r) => r.deletedAt === null)).toBe(true);
    });

    it('should sort by createdAt', async () => {
      await prisma.estimateRequest.create({
        data: {
          projectId: testProjectId,
          tradingPartnerId: testTradingPartnerId,
          itemizedStatementId: testItemizedStatementId,
          name: 'ソートテスト1',
        },
      });

      await new Promise((resolve) => setTimeout(resolve, 10));

      await prisma.estimateRequest.create({
        data: {
          projectId: testProjectId,
          tradingPartnerId: testTradingPartnerId,
          itemizedStatementId: testItemizedStatementId,
          name: 'ソートテスト2',
        },
      });

      const requests = await prisma.estimateRequest.findMany({
        where: { projectId: testProjectId },
        orderBy: { createdAt: 'desc' },
      });

      expect(requests.length).toBeGreaterThanOrEqual(2);
      expect(requests[0]!.createdAt.getTime()).toBeGreaterThanOrEqual(
        requests[1]!.createdAt.getTime()
      );
    });
  });
});
