/**
 * @fileoverview EstimateRequestItemモデルのスキーマ定義テスト
 *
 * TDD: RED Phase - Prismaスキーマで定義するEstimateRequestItemモデルの型検証
 *
 * Requirements (estimate-request):
 * - 8.2: 見積依頼に選択された項目リストを保存する
 * - 4.4, 4.5: 項目の選択状態を記録
 *
 * Task 1.2 Specification:
 * - EstimateRequestItemテーブル: 見積依頼と内訳書項目へのリレーション
 * - 選択状態（selected）フラグを実装
 * - ユニーク制約（estimateRequestId + itemizedStatementItemId）を設定
 */
import { describe, it, expect } from 'vitest';
import type { Prisma } from '../../../generated/prisma/client.js';

describe('EstimateRequestItem Model Schema', () => {
  describe('EstimateRequestItem CreateInput type structure', () => {
    it('should require mandatory fields', () => {
      // Requirements: 8.2 - 見積依頼項目の必須フィールドの検証
      const validInput: Prisma.EstimateRequestItemCreateInput = {
        estimateRequest: { connect: { id: 'estimate-request-id' } },
        itemizedStatementItem: { connect: { id: 'item-id' } },
      };

      expect(validInput.estimateRequest).toBeDefined();
      expect(validInput.itemizedStatementItem).toBeDefined();
    });

    it('should allow selected field with default false', () => {
      // Requirements: 4.4, 4.5 - 項目の選択状態
      const inputWithSelected: Prisma.EstimateRequestItemCreateInput = {
        selected: true,
        estimateRequest: { connect: { id: 'estimate-request-id' } },
        itemizedStatementItem: { connect: { id: 'item-id' } },
      };

      expect(inputWithSelected.selected).toBe(true);
    });
  });

  describe('EstimateRequestItem fields validation', () => {
    it('should have id field as UUID', () => {
      const select: Prisma.EstimateRequestItemSelect = {
        id: true,
      };
      expect(select.id).toBe(true);
    });

    it('should have estimateRequestId field', () => {
      // Requirements: 8.2 - 見積依頼との関連付け
      const select: Prisma.EstimateRequestItemSelect = {
        estimateRequestId: true,
      };
      expect(select.estimateRequestId).toBe(true);
    });

    it('should have itemizedStatementItemId field', () => {
      // Requirements: 8.2 - 内訳書項目との関連付け
      const select: Prisma.EstimateRequestItemSelect = {
        itemizedStatementItemId: true,
      };
      expect(select.itemizedStatementItemId).toBe(true);
    });

    it('should have selected field', () => {
      // Requirements: 4.4, 4.5 - 選択状態フィールド
      const select: Prisma.EstimateRequestItemSelect = {
        selected: true,
      };
      expect(select.selected).toBe(true);
    });
  });

  describe('EstimateRequestItem relations', () => {
    it('should have estimateRequest relation', () => {
      // 見積依頼へのリレーション
      const select: Prisma.EstimateRequestItemSelect = {
        estimateRequest: true,
        estimateRequestId: true,
      };
      expect(select.estimateRequest).toBe(true);
      expect(select.estimateRequestId).toBe(true);
    });

    it('should have itemizedStatementItem relation', () => {
      // 内訳書項目へのリレーション
      const select: Prisma.EstimateRequestItemSelect = {
        itemizedStatementItem: true,
        itemizedStatementItemId: true,
      };
      expect(select.itemizedStatementItem).toBe(true);
      expect(select.itemizedStatementItemId).toBe(true);
    });
  });

  describe('EstimateRequestItem filter fields', () => {
    it('should allow filtering by estimateRequestId', () => {
      const where: Prisma.EstimateRequestItemWhereInput = {
        estimateRequestId: 'estimate-request-id',
      };
      expect(where.estimateRequestId).toBeDefined();
    });

    it('should allow filtering by itemizedStatementItemId', () => {
      const where: Prisma.EstimateRequestItemWhereInput = {
        itemizedStatementItemId: 'item-id',
      };
      expect(where.itemizedStatementItemId).toBeDefined();
    });

    it('should allow filtering by selected', () => {
      // Requirements: 4.4, 4.5 - 選択状態でフィルタリング
      const where: Prisma.EstimateRequestItemWhereInput = {
        selected: true,
      };
      expect(where.selected).toBe(true);
    });
  });

  describe('EstimateRequestItem unique constraint', () => {
    it('should support unique constraint on estimateRequestId + itemizedStatementItemId', () => {
      // 複合ユニーク制約のテスト
      // 同じ見積依頼に同じ内訳書項目を重複して追加できないことを検証
      const uniqueInput: Prisma.EstimateRequestItemWhereUniqueInput = {
        estimateRequestId_itemizedStatementItemId: {
          estimateRequestId: 'estimate-request-id',
          itemizedStatementItemId: 'item-id',
        },
      };
      expect(uniqueInput.estimateRequestId_itemizedStatementItemId).toBeDefined();
    });
  });
});
