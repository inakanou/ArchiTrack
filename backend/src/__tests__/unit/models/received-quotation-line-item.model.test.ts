/**
 * @fileoverview ReceivedQuotationLineItemモデルのスキーマ定義テスト
 *
 * TDD: RED Phase - Prismaスキーマで定義するReceivedQuotationLineItemモデルの型検証
 *
 * Requirements (estimate-request):
 * - REQ-11.9: 構造化データ入力エリアに明細行を表示
 * - REQ-11.10: 名称、規格、単位、数量、単価、金額、備考フィールド
 * - REQ-14.2: 受領見積書の明細行データをデータベースに永続化
 *
 * Design Specification:
 * - ReceivedQuotationLineItemテーブル: 受領見積書明細行データの永続化
 * - 名称、規格、単位、数量、単価、金額、備考の各フィールド
 * - 表示順序（sortOrder）による行順序管理
 * - 数値フィールドにDecimal型（高精度）を適用
 * - 受領見積書へのリレーションとカスケード削除
 * - インデックス設定（receivedQuotationId、sortOrder）
 *
 * Task 20.1: ReceivedQuotationLineItemモデルの定義
 */

import { describe, it, expect } from 'vitest';
import { Prisma } from '../../../generated/prisma/client.js';

describe('ReceivedQuotationLineItem Model Schema', () => {
  describe('ReceivedQuotationLineItem CreateInput type structure', () => {
    it('should require mandatory fields for line item creation', () => {
      // REQ-11.10: 明細行の必須フィールドの検証
      const validInput: Prisma.ReceivedQuotationLineItemCreateInput = {
        sortOrder: 0,
        name: '外壁塗装',
        receivedQuotation: { connect: { id: 'received-quotation-id' } },
      };

      expect(validInput.sortOrder).toBe(0);
      expect(validInput.name).toBe('外壁塗装');
      expect(validInput.receivedQuotation).toBeDefined();
    });

    it('should accept all optional fields for line item creation', () => {
      // REQ-11.10: 明細行の全フィールド（名称、規格、単位、数量、単価、金額、備考）
      const validInput: Prisma.ReceivedQuotationLineItemCreateInput = {
        sortOrder: 1,
        name: '外壁塗装',
        specification: 'シリコン樹脂塗料',
        unit: 'm2',
        quantity: 150.5,
        unitPrice: 3500,
        amount: 526750,
        remarks: '2回塗り',
        receivedQuotation: { connect: { id: 'received-quotation-id' } },
      };

      expect(validInput.name).toBe('外壁塗装');
      expect(validInput.specification).toBe('シリコン樹脂塗料');
      expect(validInput.unit).toBe('m2');
      expect(validInput.quantity).toBe(150.5);
      expect(validInput.unitPrice).toBe(3500);
      expect(validInput.amount).toBe(526750);
      expect(validInput.remarks).toBe('2回塗り');
    });

    it('should accept Decimal type for numeric fields', () => {
      // Design: 数値フィールドにDecimal型（高精度）を適用
      const validInput: Prisma.ReceivedQuotationLineItemCreateInput = {
        sortOrder: 0,
        name: '配管工事',
        quantity: new Prisma.Decimal('123.4567'),
        unitPrice: new Prisma.Decimal('45000.50'),
        amount: new Prisma.Decimal('5556161.68'),
        receivedQuotation: { connect: { id: 'received-quotation-id' } },
      };

      expect(validInput.quantity).toBeDefined();
      expect(validInput.unitPrice).toBeDefined();
      expect(validInput.amount).toBeDefined();
    });
  });

  describe('ReceivedQuotationLineItem fields validation', () => {
    it('should have id field as UUID', () => {
      const lineItemSelect: Prisma.ReceivedQuotationLineItemSelect = {
        id: true,
      };
      expect(lineItemSelect.id).toBe(true);
    });

    it('should have receivedQuotationId field', () => {
      // 受領見積書IDフィールド（外部キー）
      const lineItemSelect: Prisma.ReceivedQuotationLineItemSelect = {
        receivedQuotationId: true,
      };
      expect(lineItemSelect.receivedQuotationId).toBe(true);
    });

    it('should have sortOrder field for display ordering', () => {
      // Design: 表示順序（sortOrder）による行順序管理
      const lineItemSelect: Prisma.ReceivedQuotationLineItemSelect = {
        sortOrder: true,
      };
      expect(lineItemSelect.sortOrder).toBe(true);
    });

    it('should have name field (required)', () => {
      // REQ-11.10, Design: 名称フィールド（必須）
      const lineItemSelect: Prisma.ReceivedQuotationLineItemSelect = {
        name: true,
      };
      expect(lineItemSelect.name).toBe(true);
    });

    it('should have specification field (optional)', () => {
      // REQ-11.10: 規格フィールド
      const lineItemSelect: Prisma.ReceivedQuotationLineItemSelect = {
        specification: true,
      };
      expect(lineItemSelect.specification).toBe(true);
    });

    it('should have unit field (optional)', () => {
      // REQ-11.10: 単位フィールド
      const lineItemSelect: Prisma.ReceivedQuotationLineItemSelect = {
        unit: true,
      };
      expect(lineItemSelect.unit).toBe(true);
    });

    it('should have quantity field (Decimal, optional)', () => {
      // REQ-11.10, Design: 数量フィールド Decimal(15, 4)
      const lineItemSelect: Prisma.ReceivedQuotationLineItemSelect = {
        quantity: true,
      };
      expect(lineItemSelect.quantity).toBe(true);
    });

    it('should have unitPrice field (Decimal, optional)', () => {
      // REQ-11.10, Design: 単価フィールド Decimal(15, 2)
      const lineItemSelect: Prisma.ReceivedQuotationLineItemSelect = {
        unitPrice: true,
      };
      expect(lineItemSelect.unitPrice).toBe(true);
    });

    it('should have amount field (Decimal, optional)', () => {
      // REQ-11.10, Design: 金額フィールド Decimal(15, 2)（数量 x 単価、自動計算）
      const lineItemSelect: Prisma.ReceivedQuotationLineItemSelect = {
        amount: true,
      };
      expect(lineItemSelect.amount).toBe(true);
    });

    it('should have remarks field (optional)', () => {
      // REQ-11.10: 備考フィールド
      const lineItemSelect: Prisma.ReceivedQuotationLineItemSelect = {
        remarks: true,
      };
      expect(lineItemSelect.remarks).toBe(true);
    });
  });

  describe('ReceivedQuotationLineItem relations', () => {
    it('should have receivedQuotation relation', () => {
      // Design: 受領見積書へのリレーション
      const lineItemSelect: Prisma.ReceivedQuotationLineItemSelect = {
        receivedQuotation: true,
        receivedQuotationId: true,
      };
      expect(lineItemSelect.receivedQuotation).toBe(true);
      expect(lineItemSelect.receivedQuotationId).toBe(true);
    });
  });

  describe('ReceivedQuotationLineItem filter and sort fields', () => {
    it('should allow filtering by receivedQuotationId', () => {
      // Design: インデックス設定（receivedQuotationId）
      const where: Prisma.ReceivedQuotationLineItemWhereInput = {
        receivedQuotationId: 'received-quotation-id',
      };
      expect(where.receivedQuotationId).toBeDefined();
    });

    it('should allow sorting by sortOrder', () => {
      // Design: インデックス設定（sortOrder）
      const orderBy: Prisma.ReceivedQuotationLineItemOrderByWithRelationInput = {
        sortOrder: 'asc',
      };
      expect(orderBy.sortOrder).toBe('asc');
    });

    it('should allow sorting by name', () => {
      const orderBy: Prisma.ReceivedQuotationLineItemOrderByWithRelationInput = {
        name: 'asc',
      };
      expect(orderBy.name).toBe('asc');
    });

    it('should allow createMany without relation for nested creation', () => {
      // Design: カスケード作成のためのcreateMany対応
      const createManyInput: Prisma.ReceivedQuotationLineItemCreateManyReceivedQuotationInput = {
        sortOrder: 0,
        name: '外壁塗装',
        specification: 'シリコン樹脂塗料',
        unit: 'm2',
        quantity: 150.5,
        unitPrice: 3500,
        amount: 526750,
        remarks: '2回塗り',
      };

      expect(createManyInput.sortOrder).toBe(0);
      expect(createManyInput.name).toBe('外壁塗装');
    });
  });

  describe('ReceivedQuotation has lineItems relation', () => {
    it('should allow including lineItems in ReceivedQuotation queries', () => {
      // REQ-11.9, Design: ReceivedQuotationにlineItemsリレーションを追加
      const select: Prisma.ReceivedQuotationSelect = {
        id: true,
        lineItems: true,
      };
      expect(select.lineItems).toBe(true);
    });

    it('should allow creating ReceivedQuotation with nested lineItems', () => {
      // Design: ReceivedQuotationLineItemリレーションを追加
      const input: Prisma.ReceivedQuotationCreateInput = {
        name: 'テスト受領見積書',
        submittedAt: new Date('2026-01-20'),
        estimateRequest: { connect: { id: 'estimate-request-id' } },
        lineItems: {
          create: [
            {
              sortOrder: 0,
              name: '外壁塗装',
              specification: 'シリコン樹脂塗料',
              unit: 'm2',
              quantity: 150.5,
              unitPrice: 3500,
              amount: 526750,
            },
          ],
        },
      };

      expect(input.lineItems).toBeDefined();
    });
  });
});
