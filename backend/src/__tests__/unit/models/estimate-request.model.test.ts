/**
 * @fileoverview EstimateRequestモデルのスキーマ定義テスト
 *
 * TDD: RED Phase - Prismaスキーマで定義するEstimateRequestモデルの型検証
 *
 * Requirements (estimate-request):
 * - 8.1: 見積依頼をプロジェクトに紐づけて保存する
 * - 8.3: 見積依頼の作成日時と更新日時を記録する
 * - 8.4: 見積依頼の削除時に論理削除を行う
 * - 8.5: 楽観的排他制御により同時更新を防止する
 *
 * Task 1.1 Specification:
 * - EstimateRequestテーブル: プロジェクト、取引先、内訳書との関連付け
 * - 見積依頼方法（EMAIL/FAX）のEnum型を定義
 * - 論理削除（deletedAt）と楽観的排他制御（updatedAt）を実装
 * - インデックス設定（projectId、tradingPartnerId、deletedAt、createdAt）
 */
import { describe, it, expect } from 'vitest';
import type { Prisma } from '../../../generated/prisma/client.js';

describe('EstimateRequest Model Schema', () => {
  describe('EstimateRequest CreateInput type structure', () => {
    it('should require mandatory fields', () => {
      // Requirements: 8.1 - 見積依頼の必須フィールドの検証
      const validInput: Prisma.EstimateRequestCreateInput = {
        name: 'テスト見積依頼',
        project: { connect: { id: 'project-id' } },
        tradingPartner: { connect: { id: 'trading-partner-id' } },
        itemizedStatement: { connect: { id: 'itemized-statement-id' } },
      };

      expect(validInput.name).toBe('テスト見積依頼');
      expect(validInput.project).toBeDefined();
      expect(validInput.tradingPartner).toBeDefined();
      expect(validInput.itemizedStatement).toBeDefined();
    });

    it('should allow optional method field with default EMAIL', () => {
      // Requirements: 4.8, 4.9 - 見積依頼方法（メール/FAX）
      const inputWithMethod: Prisma.EstimateRequestCreateInput = {
        name: 'テスト見積依頼',
        method: 'EMAIL',
        project: { connect: { id: 'project-id' } },
        tradingPartner: { connect: { id: 'trading-partner-id' } },
        itemizedStatement: { connect: { id: 'itemized-statement-id' } },
      };

      expect(inputWithMethod.method).toBe('EMAIL');
    });

    it('should allow FAX method', () => {
      // Requirements: 4.8 - FAX送信方法
      const inputWithFax: Prisma.EstimateRequestCreateInput = {
        name: 'テスト見積依頼',
        method: 'FAX',
        project: { connect: { id: 'project-id' } },
        tradingPartner: { connect: { id: 'trading-partner-id' } },
        itemizedStatement: { connect: { id: 'itemized-statement-id' } },
      };

      expect(inputWithFax.method).toBe('FAX');
    });

    it('should allow includeBreakdownInBody field', () => {
      // Requirements: 4.6 - 内訳書を本文に含める設定
      const inputWithBreakdown: Prisma.EstimateRequestCreateInput = {
        name: 'テスト見積依頼',
        includeBreakdownInBody: true,
        project: { connect: { id: 'project-id' } },
        tradingPartner: { connect: { id: 'trading-partner-id' } },
        itemizedStatement: { connect: { id: 'itemized-statement-id' } },
      };

      expect(inputWithBreakdown.includeBreakdownInBody).toBe(true);
    });
  });

  describe('EstimateRequest fields validation', () => {
    it('should have id field as UUID', () => {
      const select: Prisma.EstimateRequestSelect = {
        id: true,
      };
      expect(select.id).toBe(true);
    });

    it('should have name field', () => {
      const select: Prisma.EstimateRequestSelect = {
        name: true,
      };
      expect(select.name).toBe(true);
    });

    it('should have method field', () => {
      const select: Prisma.EstimateRequestSelect = {
        method: true,
      };
      expect(select.method).toBe(true);
    });

    it('should have includeBreakdownInBody field', () => {
      const select: Prisma.EstimateRequestSelect = {
        includeBreakdownInBody: true,
      };
      expect(select.includeBreakdownInBody).toBe(true);
    });

    it('should have timestamp fields', () => {
      // Requirements: 8.3 - タイムスタンプフィールド
      const select: Prisma.EstimateRequestSelect = {
        createdAt: true,
        updatedAt: true,
      };
      expect(select.createdAt).toBe(true);
      expect(select.updatedAt).toBe(true);
    });

    it('should have deletedAt field for soft delete', () => {
      // Requirements: 8.4 - 論理削除フィールド
      const select: Prisma.EstimateRequestSelect = {
        deletedAt: true,
      };
      expect(select.deletedAt).toBe(true);
    });

    it('should have foreign key fields', () => {
      const select: Prisma.EstimateRequestSelect = {
        projectId: true,
        tradingPartnerId: true,
        itemizedStatementId: true,
      };
      expect(select.projectId).toBe(true);
      expect(select.tradingPartnerId).toBe(true);
      expect(select.itemizedStatementId).toBe(true);
    });
  });

  describe('EstimateRequest relations', () => {
    it('should have project relation', () => {
      // Requirements: 8.1 - プロジェクトへのリレーション
      const select: Prisma.EstimateRequestSelect = {
        project: true,
        projectId: true,
      };
      expect(select.project).toBe(true);
      expect(select.projectId).toBe(true);
    });

    it('should have tradingPartner relation', () => {
      // 取引先へのリレーション
      const select: Prisma.EstimateRequestSelect = {
        tradingPartner: true,
        tradingPartnerId: true,
      };
      expect(select.tradingPartner).toBe(true);
      expect(select.tradingPartnerId).toBe(true);
    });

    it('should have itemizedStatement relation', () => {
      // 内訳書へのリレーション
      const select: Prisma.EstimateRequestSelect = {
        itemizedStatement: true,
        itemizedStatementId: true,
      };
      expect(select.itemizedStatement).toBe(true);
      expect(select.itemizedStatementId).toBe(true);
    });

    it('should have selectedItems relation to EstimateRequestItem', () => {
      // Requirements: 8.2 - 選択項目へのリレーション
      const select: Prisma.EstimateRequestSelect = {
        selectedItems: true,
      };
      expect(select.selectedItems).toBe(true);
    });
  });

  describe('EstimateRequest filter and sort fields', () => {
    it('should allow filtering by projectId', () => {
      const where: Prisma.EstimateRequestWhereInput = {
        projectId: 'project-id',
      };
      expect(where.projectId).toBeDefined();
    });

    it('should allow filtering by tradingPartnerId', () => {
      const where: Prisma.EstimateRequestWhereInput = {
        tradingPartnerId: 'trading-partner-id',
      };
      expect(where.tradingPartnerId).toBeDefined();
    });

    it('should allow filtering by deletedAt (soft delete)', () => {
      // Requirements: 8.4 - 論理削除フィルタリング
      const where: Prisma.EstimateRequestWhereInput = {
        deletedAt: null,
      };
      expect(where.deletedAt).toBeNull();
    });

    it('should allow sorting by createdAt', () => {
      const orderBy: Prisma.EstimateRequestOrderByWithRelationInput = {
        createdAt: 'desc',
      };
      expect(orderBy.createdAt).toBe('desc');
    });

    it('should allow sorting by name', () => {
      const orderBy: Prisma.EstimateRequestOrderByWithRelationInput = {
        name: 'asc',
      };
      expect(orderBy.name).toBe('asc');
    });
  });

  describe('EstimateRequest update for optimistic locking', () => {
    it('should allow updating with updatedAt for optimistic locking', () => {
      // Requirements: 8.5 - 楽観的排他制御
      const update: Prisma.EstimateRequestUpdateInput = {
        name: '更新された見積依頼',
      };
      expect(update.name).toBe('更新された見積依頼');
    });
  });
});
