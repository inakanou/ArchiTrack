/**
 * @fileoverview ExecutionBudget（実行予算）関連モデルのスキーマ定義テスト
 *
 * TDD: RED Phase - Prismaスキーマで定義する実行予算関連モデルの型検証
 *
 * Requirements (execution-budget-management):
 * - REQ-19.1: 実行予算データをPostgreSQLデータベースに永続化する
 * - REQ-19.8: 実行予算の論理削除をサポートする
 *
 * Task 1.1 Specification:
 * - ExecutionBudget、ExecutionBudgetItem、Order、OrderItem、ProgressRecord、ProgressRecordItem、MonthlyCloseHistoryの各モデル
 * - OrderStatusとAmendmentStatusのenum型
 * - 各テーブルのインデックス、ユニーク制約、外部キー制約、カスケード削除設定
 * - 金額フィールドにDecimal(15,0)、単価にDecimal(15,2)、数量にDecimal(15,4)
 * - 楽観的排他制御用のversionフィールド、論理削除用のdeletedAtフィールド
 */

import { describe, it, expect } from 'vitest';
import type { Prisma } from '../../../generated/prisma/client.js';
import { OrderStatus, AmendmentStatus } from '../../../generated/prisma/client.js';

describe('Execution Budget Model Schema', () => {
  // ===== Enum Tests =====

  describe('OrderStatus Enum', () => {
    it('should have BEFORE_ORDER value', () => {
      expect(OrderStatus.BEFORE_ORDER).toBe('BEFORE_ORDER');
    });

    it('should have UNDER_REVIEW value', () => {
      expect(OrderStatus.UNDER_REVIEW).toBe('UNDER_REVIEW');
    });

    it('should have ORDERED value', () => {
      expect(OrderStatus.ORDERED).toBe('ORDERED');
    });

    it('should have CANCELLED value', () => {
      expect(OrderStatus.CANCELLED).toBe('CANCELLED');
    });

    it('should have exactly 4 values', () => {
      const values = Object.values(OrderStatus);
      expect(values).toHaveLength(4);
    });
  });

  describe('AmendmentStatus Enum', () => {
    it('should have AMENDMENT_DELETED value', () => {
      expect(AmendmentStatus.AMENDMENT_DELETED).toBe('AMENDMENT_DELETED');
    });

    it('should have exactly 1 value', () => {
      const values = Object.values(AmendmentStatus);
      expect(values).toHaveLength(1);
    });
  });

  // ===== ExecutionBudget Model =====

  describe('ExecutionBudget CreateInput type structure', () => {
    it('should require project and contract relations', () => {
      const input: Prisma.ExecutionBudgetCreateInput = {
        project: { connect: { id: 'project-id' } },
        contract: { connect: { id: 'contract-id' } },
      };
      expect(input.project).toBeDefined();
      expect(input.contract).toBeDefined();
    });

    it('should allow version field for optimistic locking', () => {
      const input: Prisma.ExecutionBudgetCreateInput = {
        project: { connect: { id: 'project-id' } },
        contract: { connect: { id: 'contract-id' } },
        version: 0,
      };
      expect(input.version).toBe(0);
    });
  });

  describe('ExecutionBudget fields validation via Select', () => {
    it('should have id field', () => {
      const select: Prisma.ExecutionBudgetSelect = { id: true };
      expect(select.id).toBe(true);
    });

    it('should have projectId field', () => {
      const select: Prisma.ExecutionBudgetSelect = { projectId: true };
      expect(select.projectId).toBe(true);
    });

    it('should have contractId field', () => {
      const select: Prisma.ExecutionBudgetSelect = { contractId: true };
      expect(select.contractId).toBe(true);
    });

    it('should have version field', () => {
      const select: Prisma.ExecutionBudgetSelect = { version: true };
      expect(select.version).toBe(true);
    });

    it('should have timestamp fields', () => {
      const select: Prisma.ExecutionBudgetSelect = {
        createdAt: true,
        updatedAt: true,
      };
      expect(select.createdAt).toBe(true);
      expect(select.updatedAt).toBe(true);
    });

    it('should have deletedAt field for soft delete', () => {
      // REQ-19.8: 論理削除
      const select: Prisma.ExecutionBudgetSelect = { deletedAt: true };
      expect(select.deletedAt).toBe(true);
    });
  });

  describe('ExecutionBudget relations', () => {
    it('should have project relation', () => {
      const select: Prisma.ExecutionBudgetSelect = { project: true };
      expect(select.project).toBe(true);
    });

    it('should have contract relation', () => {
      const select: Prisma.ExecutionBudgetSelect = { contract: true };
      expect(select.contract).toBe(true);
    });

    it('should have items relation', () => {
      const select: Prisma.ExecutionBudgetSelect = { items: true };
      expect(select.items).toBe(true);
    });

    it('should have orders relation', () => {
      const select: Prisma.ExecutionBudgetSelect = { orders: true };
      expect(select.orders).toBe(true);
    });

    it('should have progressRecords relation', () => {
      const select: Prisma.ExecutionBudgetSelect = { progressRecords: true };
      expect(select.progressRecords).toBe(true);
    });

    it('should have monthlyCloseHistories relation', () => {
      const select: Prisma.ExecutionBudgetSelect = { monthlyCloseHistories: true };
      expect(select.monthlyCloseHistories).toBe(true);
    });
  });

  describe('ExecutionBudget WhereInput for index-based queries', () => {
    it('should support filtering by projectId (unique)', () => {
      const where: Prisma.ExecutionBudgetWhereInput = {
        projectId: 'project-id',
      };
      expect(where.projectId).toBe('project-id');
    });

    it('should support filtering by contractId', () => {
      const where: Prisma.ExecutionBudgetWhereInput = {
        contractId: 'contract-id',
      };
      expect(where.contractId).toBe('contract-id');
    });

    it('should support filtering by deletedAt for soft delete', () => {
      const where: Prisma.ExecutionBudgetWhereInput = {
        deletedAt: null,
      };
      expect(where.deletedAt).toBeNull();
    });
  });

  describe('ExecutionBudget UpdateInput type structure', () => {
    it('should allow updating version for optimistic locking', () => {
      const input: Prisma.ExecutionBudgetUpdateInput = {
        version: { increment: 1 },
      };
      expect(input.version).toBeDefined();
    });

    it('should allow soft delete via deletedAt', () => {
      const input: Prisma.ExecutionBudgetUpdateInput = {
        deletedAt: new Date(),
      };
      expect(input.deletedAt).toBeDefined();
    });
  });

  // ===== ExecutionBudgetItem Model =====

  describe('ExecutionBudgetItem CreateInput type structure', () => {
    it('should require executionBudget relation and displayOrder', () => {
      const input: Prisma.ExecutionBudgetItemCreateInput = {
        displayOrder: 1,
        executionBudget: { connect: { id: 'eb-id' } },
      };
      expect(input.displayOrder).toBe(1);
      expect(input.executionBudget).toBeDefined();
    });

    it('should allow optional fields for budget item', () => {
      const input: Prisma.ExecutionBudgetItemCreateInput = {
        displayOrder: 1,
        name: '仮設工事',
        specification: '一式',
        unit: '式',
        quantity: 1.0,
        estimateUnitPrice: 100000,
        estimateAmount: 100000,
        executionUnitPrice: 90000,
        executionAmount: 90000,
        remarks: '備考テスト',
        executionBudget: { connect: { id: 'eb-id' } },
      };
      expect(input.name).toBe('仮設工事');
      expect(input.specification).toBe('一式');
      expect(input.unit).toBe('式');
      expect(input.quantity).toBe(1.0);
      expect(input.estimateUnitPrice).toBe(100000);
      expect(input.estimateAmount).toBe(100000);
      expect(input.executionUnitPrice).toBe(90000);
      expect(input.executionAmount).toBe(90000);
      expect(input.remarks).toBe('備考テスト');
    });

    it('should allow cost tracking fields with defaults', () => {
      const input: Prisma.ExecutionBudgetItemCreateInput = {
        displayOrder: 1,
        amendmentAmount: 0,
        previousMonthExpense: 0,
        currentMonthExpense: 0,
        executionBudget: { connect: { id: 'eb-id' } },
      };
      expect(input.amendmentAmount).toBe(0);
      expect(input.previousMonthExpense).toBe(0);
      expect(input.currentMonthExpense).toBe(0);
    });
  });

  describe('ExecutionBudgetItem fields validation via Select', () => {
    it('should have id field', () => {
      const select: Prisma.ExecutionBudgetItemSelect = { id: true };
      expect(select.id).toBe(true);
    });

    it('should have executionBudgetId field', () => {
      const select: Prisma.ExecutionBudgetItemSelect = { executionBudgetId: true };
      expect(select.executionBudgetId).toBe(true);
    });

    it('should have estimateItemId field', () => {
      const select: Prisma.ExecutionBudgetItemSelect = { estimateItemId: true };
      expect(select.estimateItemId).toBe(true);
    });

    it('should have parentId field for hierarchy', () => {
      const select: Prisma.ExecutionBudgetItemSelect = { parentId: true };
      expect(select.parentId).toBe(true);
    });

    it('should have displayOrder field', () => {
      const select: Prisma.ExecutionBudgetItemSelect = { displayOrder: true };
      expect(select.displayOrder).toBe(true);
    });

    it('should have name, specification, unit fields', () => {
      const select: Prisma.ExecutionBudgetItemSelect = {
        name: true,
        specification: true,
        unit: true,
      };
      expect(select.name).toBe(true);
      expect(select.specification).toBe(true);
      expect(select.unit).toBe(true);
    });

    it('should have quantity field (Decimal 15,4)', () => {
      const select: Prisma.ExecutionBudgetItemSelect = { quantity: true };
      expect(select.quantity).toBe(true);
    });

    it('should have estimate amount fields (Decimal 15,0 / 15,2)', () => {
      const select: Prisma.ExecutionBudgetItemSelect = {
        estimateUnitPrice: true,
        estimateAmount: true,
      };
      expect(select.estimateUnitPrice).toBe(true);
      expect(select.estimateAmount).toBe(true);
    });

    it('should have execution amount fields (Decimal 15,0 / 15,2)', () => {
      const select: Prisma.ExecutionBudgetItemSelect = {
        executionUnitPrice: true,
        executionAmount: true,
      };
      expect(select.executionUnitPrice).toBe(true);
      expect(select.executionAmount).toBe(true);
    });

    it('should have amendmentAmount field', () => {
      const select: Prisma.ExecutionBudgetItemSelect = { amendmentAmount: true };
      expect(select.amendmentAmount).toBe(true);
    });

    it('should have cost tracking fields', () => {
      const select: Prisma.ExecutionBudgetItemSelect = {
        previousMonthExpense: true,
        currentMonthExpense: true,
      };
      expect(select.previousMonthExpense).toBe(true);
      expect(select.currentMonthExpense).toBe(true);
    });

    it('should have plannedVendorId field', () => {
      const select: Prisma.ExecutionBudgetItemSelect = { plannedVendorId: true };
      expect(select.plannedVendorId).toBe(true);
    });

    it('should have amendmentStatus field', () => {
      const select: Prisma.ExecutionBudgetItemSelect = { amendmentStatus: true };
      expect(select.amendmentStatus).toBe(true);
    });

    it('should have remarks field', () => {
      const select: Prisma.ExecutionBudgetItemSelect = { remarks: true };
      expect(select.remarks).toBe(true);
    });

    it('should have timestamp fields', () => {
      const select: Prisma.ExecutionBudgetItemSelect = {
        createdAt: true,
        updatedAt: true,
      };
      expect(select.createdAt).toBe(true);
      expect(select.updatedAt).toBe(true);
    });
  });

  describe('ExecutionBudgetItem relations', () => {
    it('should have executionBudget relation', () => {
      const select: Prisma.ExecutionBudgetItemSelect = { executionBudget: true };
      expect(select.executionBudget).toBe(true);
    });

    it('should have estimateItem relation', () => {
      const select: Prisma.ExecutionBudgetItemSelect = { estimateItem: true };
      expect(select.estimateItem).toBe(true);
    });

    it('should have parent self-reference relation', () => {
      const select: Prisma.ExecutionBudgetItemSelect = { parent: true };
      expect(select.parent).toBe(true);
    });

    it('should have children self-reference relation', () => {
      const select: Prisma.ExecutionBudgetItemSelect = { children: true };
      expect(select.children).toBe(true);
    });

    it('should have plannedVendor relation', () => {
      const select: Prisma.ExecutionBudgetItemSelect = { plannedVendor: true };
      expect(select.plannedVendor).toBe(true);
    });

    it('should have orderItems relation', () => {
      const select: Prisma.ExecutionBudgetItemSelect = { orderItems: true };
      expect(select.orderItems).toBe(true);
    });

    it('should have progressRecordItems relation', () => {
      const select: Prisma.ExecutionBudgetItemSelect = { progressRecordItems: true };
      expect(select.progressRecordItems).toBe(true);
    });
  });

  // ===== Order Model =====

  describe('Order CreateInput type structure', () => {
    it('should require executionBudget and tradingPartner relations', () => {
      const input: Prisma.OrderCreateInput = {
        executionBudget: { connect: { id: 'eb-id' } },
        tradingPartner: { connect: { id: 'tp-id' } },
      };
      expect(input.executionBudget).toBeDefined();
      expect(input.tradingPartner).toBeDefined();
    });

    it('should allow status and confirmedAmount fields', () => {
      const input: Prisma.OrderCreateInput = {
        status: OrderStatus.BEFORE_ORDER,
        confirmedAmount: 1000000,
        executionBudget: { connect: { id: 'eb-id' } },
        tradingPartner: { connect: { id: 'tp-id' } },
      };
      expect(input.status).toBe('BEFORE_ORDER');
      expect(input.confirmedAmount).toBe(1000000);
    });

    it('should allow version field for optimistic locking', () => {
      const input: Prisma.OrderCreateInput = {
        version: 0,
        executionBudget: { connect: { id: 'eb-id' } },
        tradingPartner: { connect: { id: 'tp-id' } },
      };
      expect(input.version).toBe(0);
    });
  });

  describe('Order fields validation via Select', () => {
    it('should have id field', () => {
      const select: Prisma.OrderSelect = { id: true };
      expect(select.id).toBe(true);
    });

    it('should have executionBudgetId field', () => {
      const select: Prisma.OrderSelect = { executionBudgetId: true };
      expect(select.executionBudgetId).toBe(true);
    });

    it('should have tradingPartnerId field', () => {
      const select: Prisma.OrderSelect = { tradingPartnerId: true };
      expect(select.tradingPartnerId).toBe(true);
    });

    it('should have status field', () => {
      const select: Prisma.OrderSelect = { status: true };
      expect(select.status).toBe(true);
    });

    it('should have confirmedAmount field (Decimal 15,0)', () => {
      const select: Prisma.OrderSelect = { confirmedAmount: true };
      expect(select.confirmedAmount).toBe(true);
    });

    it('should have version field', () => {
      const select: Prisma.OrderSelect = { version: true };
      expect(select.version).toBe(true);
    });

    it('should have timestamp fields', () => {
      const select: Prisma.OrderSelect = {
        createdAt: true,
        updatedAt: true,
      };
      expect(select.createdAt).toBe(true);
      expect(select.updatedAt).toBe(true);
    });

    it('should have deletedAt field for soft delete', () => {
      const select: Prisma.OrderSelect = { deletedAt: true };
      expect(select.deletedAt).toBe(true);
    });
  });

  describe('Order relations', () => {
    it('should have executionBudget relation', () => {
      const select: Prisma.OrderSelect = { executionBudget: true };
      expect(select.executionBudget).toBe(true);
    });

    it('should have tradingPartner relation', () => {
      const select: Prisma.OrderSelect = { tradingPartner: true };
      expect(select.tradingPartner).toBe(true);
    });

    it('should have items relation', () => {
      const select: Prisma.OrderSelect = { items: true };
      expect(select.items).toBe(true);
    });
  });

  describe('Order WhereInput for index-based queries', () => {
    it('should support filtering by executionBudgetId', () => {
      const where: Prisma.OrderWhereInput = {
        executionBudgetId: 'eb-id',
      };
      expect(where.executionBudgetId).toBe('eb-id');
    });

    it('should support filtering by tradingPartnerId', () => {
      const where: Prisma.OrderWhereInput = {
        tradingPartnerId: 'tp-id',
      };
      expect(where.tradingPartnerId).toBe('tp-id');
    });

    it('should support filtering by status', () => {
      const where: Prisma.OrderWhereInput = {
        status: OrderStatus.ORDERED,
      };
      expect(where.status).toBe('ORDERED');
    });

    it('should support filtering by deletedAt', () => {
      const where: Prisma.OrderWhereInput = {
        deletedAt: null,
      };
      expect(where.deletedAt).toBeNull();
    });
  });

  // ===== OrderItem Model =====

  describe('OrderItem CreateInput type structure', () => {
    it('should require order and executionBudgetItem relations', () => {
      const input: Prisma.OrderItemCreateInput = {
        order: { connect: { id: 'order-id' } },
        executionBudgetItem: { connect: { id: 'ebi-id' } },
      };
      expect(input.order).toBeDefined();
      expect(input.executionBudgetItem).toBeDefined();
    });

    it('should allow checked and orderAmount fields', () => {
      const input: Prisma.OrderItemCreateInput = {
        checked: true,
        orderAmount: 500000,
        order: { connect: { id: 'order-id' } },
        executionBudgetItem: { connect: { id: 'ebi-id' } },
      };
      expect(input.checked).toBe(true);
      expect(input.orderAmount).toBe(500000);
    });
  });

  describe('OrderItem fields validation via Select', () => {
    it('should have id field', () => {
      const select: Prisma.OrderItemSelect = { id: true };
      expect(select.id).toBe(true);
    });

    it('should have orderId field', () => {
      const select: Prisma.OrderItemSelect = { orderId: true };
      expect(select.orderId).toBe(true);
    });

    it('should have executionBudgetItemId field', () => {
      const select: Prisma.OrderItemSelect = { executionBudgetItemId: true };
      expect(select.executionBudgetItemId).toBe(true);
    });

    it('should have checked field', () => {
      const select: Prisma.OrderItemSelect = { checked: true };
      expect(select.checked).toBe(true);
    });

    it('should have orderAmount field (Decimal 15,0)', () => {
      const select: Prisma.OrderItemSelect = { orderAmount: true };
      expect(select.orderAmount).toBe(true);
    });

    it('should have timestamp fields', () => {
      const select: Prisma.OrderItemSelect = {
        createdAt: true,
        updatedAt: true,
      };
      expect(select.createdAt).toBe(true);
      expect(select.updatedAt).toBe(true);
    });
  });

  describe('OrderItem relations', () => {
    it('should have order relation', () => {
      const select: Prisma.OrderItemSelect = { order: true };
      expect(select.order).toBe(true);
    });

    it('should have executionBudgetItem relation', () => {
      const select: Prisma.OrderItemSelect = { executionBudgetItem: true };
      expect(select.executionBudgetItem).toBe(true);
    });
  });

  // ===== ProgressRecord Model =====

  describe('ProgressRecord CreateInput type structure', () => {
    it('should require executionBudget relation and constructionDate', () => {
      const input: Prisma.ProgressRecordCreateInput = {
        constructionDate: new Date('2026-04-01'),
        executionBudget: { connect: { id: 'eb-id' } },
      };
      expect(input.constructionDate).toBeInstanceOf(Date);
      expect(input.executionBudget).toBeDefined();
    });
  });

  describe('ProgressRecord fields validation via Select', () => {
    it('should have id field', () => {
      const select: Prisma.ProgressRecordSelect = { id: true };
      expect(select.id).toBe(true);
    });

    it('should have executionBudgetId field', () => {
      const select: Prisma.ProgressRecordSelect = { executionBudgetId: true };
      expect(select.executionBudgetId).toBe(true);
    });

    it('should have constructionDate field', () => {
      const select: Prisma.ProgressRecordSelect = { constructionDate: true };
      expect(select.constructionDate).toBe(true);
    });

    it('should have timestamp fields', () => {
      const select: Prisma.ProgressRecordSelect = {
        createdAt: true,
        updatedAt: true,
      };
      expect(select.createdAt).toBe(true);
      expect(select.updatedAt).toBe(true);
    });
  });

  describe('ProgressRecord relations', () => {
    it('should have executionBudget relation', () => {
      const select: Prisma.ProgressRecordSelect = { executionBudget: true };
      expect(select.executionBudget).toBe(true);
    });

    it('should have items relation', () => {
      const select: Prisma.ProgressRecordSelect = { items: true };
      expect(select.items).toBe(true);
    });
  });

  // ===== ProgressRecordItem Model =====

  describe('ProgressRecordItem CreateInput type structure', () => {
    it('should require progressRecord and executionBudgetItem relations', () => {
      const input: Prisma.ProgressRecordItemCreateInput = {
        progressRecord: { connect: { id: 'pr-id' } },
        executionBudgetItem: { connect: { id: 'ebi-id' } },
      };
      expect(input.progressRecord).toBeDefined();
      expect(input.executionBudgetItem).toBeDefined();
    });

    it('should allow amount field with default 0', () => {
      const input: Prisma.ProgressRecordItemCreateInput = {
        amount: 500000,
        progressRecord: { connect: { id: 'pr-id' } },
        executionBudgetItem: { connect: { id: 'ebi-id' } },
      };
      expect(input.amount).toBe(500000);
    });
  });

  describe('ProgressRecordItem fields validation via Select', () => {
    it('should have id field', () => {
      const select: Prisma.ProgressRecordItemSelect = { id: true };
      expect(select.id).toBe(true);
    });

    it('should have progressRecordId field', () => {
      const select: Prisma.ProgressRecordItemSelect = { progressRecordId: true };
      expect(select.progressRecordId).toBe(true);
    });

    it('should have executionBudgetItemId field', () => {
      const select: Prisma.ProgressRecordItemSelect = { executionBudgetItemId: true };
      expect(select.executionBudgetItemId).toBe(true);
    });

    it('should have amount field (Decimal 15,0)', () => {
      const select: Prisma.ProgressRecordItemSelect = { amount: true };
      expect(select.amount).toBe(true);
    });

    it('should have timestamp fields', () => {
      const select: Prisma.ProgressRecordItemSelect = {
        createdAt: true,
        updatedAt: true,
      };
      expect(select.createdAt).toBe(true);
      expect(select.updatedAt).toBe(true);
    });
  });

  describe('ProgressRecordItem relations', () => {
    it('should have progressRecord relation', () => {
      const select: Prisma.ProgressRecordItemSelect = { progressRecord: true };
      expect(select.progressRecord).toBe(true);
    });

    it('should have executionBudgetItem relation', () => {
      const select: Prisma.ProgressRecordItemSelect = { executionBudgetItem: true };
      expect(select.executionBudgetItem).toBe(true);
    });
  });

  // ===== MonthlyCloseHistory Model =====

  describe('MonthlyCloseHistory CreateInput type structure', () => {
    it('should require executionBudget relation, targetMonth, and closedBy', () => {
      const input: Prisma.MonthlyCloseHistoryCreateInput = {
        targetMonth: '2026-03',
        executionBudget: { connect: { id: 'eb-id' } },
        closedBy: { connect: { id: 'user-id' } },
      };
      expect(input.targetMonth).toBe('2026-03');
      expect(input.executionBudget).toBeDefined();
      expect(input.closedBy).toBeDefined();
    });
  });

  describe('MonthlyCloseHistory fields validation via Select', () => {
    it('should have id field', () => {
      const select: Prisma.MonthlyCloseHistorySelect = { id: true };
      expect(select.id).toBe(true);
    });

    it('should have executionBudgetId field', () => {
      const select: Prisma.MonthlyCloseHistorySelect = { executionBudgetId: true };
      expect(select.executionBudgetId).toBe(true);
    });

    it('should have targetMonth field', () => {
      const select: Prisma.MonthlyCloseHistorySelect = { targetMonth: true };
      expect(select.targetMonth).toBe(true);
    });

    it('should have closedById field', () => {
      const select: Prisma.MonthlyCloseHistorySelect = { closedById: true };
      expect(select.closedById).toBe(true);
    });

    it('should have closedAt field', () => {
      const select: Prisma.MonthlyCloseHistorySelect = { closedAt: true };
      expect(select.closedAt).toBe(true);
    });
  });

  describe('MonthlyCloseHistory relations', () => {
    it('should have executionBudget relation', () => {
      const select: Prisma.MonthlyCloseHistorySelect = { executionBudget: true };
      expect(select.executionBudget).toBe(true);
    });

    it('should have closedBy (user) relation', () => {
      const select: Prisma.MonthlyCloseHistorySelect = { closedBy: true };
      expect(select.closedBy).toBe(true);
    });
  });

  // ===== Existing Model Reverse Relations =====

  describe('Existing models reverse relations', () => {
    it('should allow executionBudgets relation in Project select', () => {
      const select: Prisma.ProjectSelect = {
        executionBudgets: true,
      };
      expect(select.executionBudgets).toBe(true);
    });

    it('should allow executionBudgets relation in Contract select', () => {
      const select: Prisma.ContractSelect = {
        executionBudgets: true,
      };
      expect(select.executionBudgets).toBe(true);
    });

    it('should allow executionBudgetItems relation in EstimateItem select', () => {
      const select: Prisma.EstimateItemSelect = {
        executionBudgetItems: true,
      };
      expect(select.executionBudgetItems).toBe(true);
    });

    it('should allow plannedVendorExecutionBudgetItems relation in TradingPartner select', () => {
      const select: Prisma.TradingPartnerSelect = {
        plannedVendorExecutionBudgetItems: true,
      };
      expect(select.plannedVendorExecutionBudgetItems).toBe(true);
    });

    it('should allow orders relation in TradingPartner select', () => {
      const select: Prisma.TradingPartnerSelect = {
        orders: true,
      };
      expect(select.orders).toBe(true);
    });

    it('should allow monthlyCloseHistories relation in User select', () => {
      const select: Prisma.UserSelect = {
        monthlyCloseHistories: true,
      };
      expect(select.monthlyCloseHistories).toBe(true);
    });
  });
});
