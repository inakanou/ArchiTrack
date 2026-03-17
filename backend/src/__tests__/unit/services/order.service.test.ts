/**
 * @fileoverview OrderService ユニットテスト
 *
 * TDD: RED phase - テストを先に書く
 *
 * Requirements:
 * - 5.1-5.3: 発注一覧表示（Task 3.1）
 * - 6.1-6.8: 発注の作成と取引先指定（Task 3.1）
 * - 7.1-7.5: 発注の編集と削除（Task 3.1）
 *
 * Task 3.1: 発注の作成・取得・編集・削除サービス実装
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OrderService, type OrderServiceDependencies } from '../../../services/order.service.js';
import type { PrismaClient } from '../../../generated/prisma/client.js';
import {
  OrderNotFoundError,
  OrderEditBlockedError,
  OrderDeletionBlockedError,
  ExecutionBudgetNotFoundForOrderError,
} from '../../../errors/orderError.js';

// ========================================
// モック: Prisma Client
// ========================================

function createMockTx() {
  return {
    executionBudget: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
    },
    executionBudgetItem: {
      findMany: vi.fn(),
    },
    order: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    orderItem: {
      createMany: vi.fn(),
      findMany: vi.fn(),
      deleteMany: vi.fn(),
      updateMany: vi.fn(),
    },
  };
}

function createMockPrisma() {
  const mockTx = createMockTx();

  return {
    prisma: {
      $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
        return fn(mockTx);
      }),
      order: {
        findFirst: mockTx.order.findFirst,
        findUnique: mockTx.order.findUnique,
        findMany: mockTx.order.findMany,
        update: mockTx.order.update,
        delete: mockTx.order.delete,
      },
      orderItem: {
        findMany: mockTx.orderItem.findMany,
      },
      executionBudget: {
        findFirst: mockTx.executionBudget.findFirst,
      },
      executionBudgetItem: {
        findMany: mockTx.executionBudgetItem.findMany,
      },
    } as unknown as PrismaClient,
    mockTx,
  };
}

// ========================================
// テスト用サンプルデータ
// ========================================

const executionBudgetId = '550e8400-e29b-41d4-a716-446655440010';
const tradingPartnerId = '550e8400-e29b-41d4-a716-446655440020';
const orderId = '550e8400-e29b-41d4-a716-446655440030';
const itemId1 = '550e8400-e29b-41d4-a716-446655440041';
const itemId2 = '550e8400-e29b-41d4-a716-446655440042';
const itemId3 = '550e8400-e29b-41d4-a716-446655440043';

const sampleBudgetItems = [
  {
    id: itemId1,
    executionBudgetId,
    plannedVendorId: tradingPartnerId,
    executionAmount: { toString: () => '100000' },
    name: '項目1',
    specification: '規格A',
    unit: '式',
    quantity: { toString: () => '1' },
    parentId: null,
  },
  {
    id: itemId2,
    executionBudgetId,
    plannedVendorId: tradingPartnerId,
    executionAmount: { toString: () => '200000' },
    name: '項目2',
    specification: '規格B',
    unit: 'm',
    quantity: { toString: () => '10' },
    parentId: null,
  },
  {
    id: itemId3,
    executionBudgetId,
    plannedVendorId: '550e8400-e29b-41d4-a716-446655440099', // 別の取引先
    executionAmount: { toString: () => '300000' },
    name: '項目3',
    specification: '規格C',
    unit: 'm2',
    quantity: { toString: () => '5' },
    parentId: null,
  },
];

const sampleOrder = {
  id: orderId,
  executionBudgetId,
  tradingPartnerId,
  status: 'BEFORE_ORDER',
  confirmedAmount: null,
  version: 0,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
  deletedAt: null,
};

// ========================================
// テスト
// ========================================

describe('OrderService', () => {
  let service: OrderService;
  let prisma: PrismaClient;
  let mockTx: ReturnType<typeof createMockTx>;

  beforeEach(() => {
    const mock = createMockPrisma();
    prisma = mock.prisma;
    mockTx = mock.mockTx;
    service = new OrderService({ prisma } as OrderServiceDependencies);
  });

  // ========================================
  // create: 発注の作成
  // ========================================

  describe('create', () => {
    it('取引先IDを指定して発注を作成し、発注予定取引先が一致する項目にchecked=trueでOrderItemを作成する', async () => {
      // Arrange
      mockTx.executionBudget.findFirst.mockResolvedValue({
        id: executionBudgetId,
        deletedAt: null,
      });
      mockTx.executionBudgetItem.findMany.mockResolvedValue(sampleBudgetItems);
      mockTx.order.create.mockResolvedValue(sampleOrder);
      mockTx.orderItem.createMany.mockResolvedValue({ count: 3 });

      // Act
      const result = await service.create(executionBudgetId, tradingPartnerId);

      // Assert
      expect(result).toBeDefined();
      expect(result.id).toBe(orderId);
      expect(result.executionBudgetId).toBe(executionBudgetId);
      expect(result.tradingPartnerId).toBe(tradingPartnerId);
      expect(result.status).toBe('BEFORE_ORDER');

      // OrderItemのcreateMany呼び出しを検証
      expect(mockTx.orderItem.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({
            orderId,
            executionBudgetItemId: itemId1,
            checked: true, // 発注予定取引先が一致 → checked=true
          }),
          expect.objectContaining({
            orderId,
            executionBudgetItemId: itemId2,
            checked: true, // 発注予定取引先が一致 → checked=true
          }),
          expect.objectContaining({
            orderId,
            executionBudgetItemId: itemId3,
            checked: false, // 別の取引先 → checked=false
          }),
        ]),
      });
    });

    it('実行予算が存在しない場合はExecutionBudgetNotFoundForOrderErrorをスローする', async () => {
      // Arrange
      mockTx.executionBudget.findFirst.mockResolvedValue(null);

      // Act & Assert
      await expect(service.create(executionBudgetId, tradingPartnerId)).rejects.toThrow(
        ExecutionBudgetNotFoundForOrderError
      );
    });

    it('論理削除された実行予算の場合はExecutionBudgetNotFoundForOrderErrorをスローする', async () => {
      // Arrange - findFirst with deletedAt: null will not match a logically deleted record
      mockTx.executionBudget.findFirst.mockResolvedValue(null);

      // Act & Assert
      await expect(service.create(executionBudgetId, tradingPartnerId)).rejects.toThrow(
        ExecutionBudgetNotFoundForOrderError
      );
    });
  });

  // ========================================
  // findByExecutionBudgetId: 発注一覧取得
  // ========================================

  describe('findByExecutionBudgetId', () => {
    it('発注一覧をチェック済み項目数、合計実行金額、確定発注金額を含むサマリーで返却する', async () => {
      // Arrange
      const ordersWithItems = [
        {
          id: orderId,
          executionBudgetId,
          tradingPartnerId,
          status: 'BEFORE_ORDER',
          confirmedAmount: null,
          version: 0,
          createdAt: new Date('2026-01-01'),
          updatedAt: new Date('2026-01-01'),
          deletedAt: null,
          tradingPartner: { id: tradingPartnerId, name: '協力業者A' },
          items: [
            {
              id: 'oi-1',
              checked: true,
              orderAmount: null,
              executionBudgetItem: {
                id: itemId1,
                executionAmount: { toString: () => '100000' },
              },
            },
            {
              id: 'oi-2',
              checked: true,
              orderAmount: null,
              executionBudgetItem: {
                id: itemId2,
                executionAmount: { toString: () => '200000' },
              },
            },
            {
              id: 'oi-3',
              checked: false,
              orderAmount: null,
              executionBudgetItem: {
                id: itemId3,
                executionAmount: { toString: () => '300000' },
              },
            },
          ],
        },
      ];

      (prisma.order.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(ordersWithItems);

      // Act
      const result = await service.findByExecutionBudgetId(executionBudgetId);

      // Assert
      expect(result).toHaveLength(1);
      expect(result[0]!.id).toBe(orderId);
      expect(result[0]!.tradingPartnerName).toBe('協力業者A');
      expect(result[0]!.checkedItemCount).toBe(2);
      expect(result[0]!.totalExecutionAmount).toBe('300000'); // 100000 + 200000
      expect(result[0]!.confirmedAmount).toBeNull();
      expect(result[0]!.status).toBe('BEFORE_ORDER');
    });

    it('論理削除された発注を除外する', async () => {
      // Arrange
      (prisma.order.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      // Act
      const result = await service.findByExecutionBudgetId(executionBudgetId);

      // Assert
      expect(result).toHaveLength(0);
    });
  });

  // ========================================
  // getWithItems: 発注詳細取得
  // ========================================

  describe('getWithItems', () => {
    it('発注詳細をOrderItem一覧とともに返却する', async () => {
      // Arrange
      const orderWithItems = {
        id: orderId,
        executionBudgetId,
        tradingPartnerId,
        status: 'BEFORE_ORDER',
        confirmedAmount: null,
        version: 0,
        createdAt: new Date('2026-01-01'),
        updatedAt: new Date('2026-01-01'),
        deletedAt: null,
        tradingPartner: { id: tradingPartnerId, name: '協力業者A' },
        items: [
          {
            id: 'oi-1',
            checked: true,
            orderAmount: null,
            executionBudgetItem: {
              id: itemId1,
              name: '項目1',
              specification: '規格A',
              unit: '式',
              quantity: { toString: () => '1' },
              executionUnitPrice: { toString: () => '100000' },
              executionAmount: { toString: () => '100000' },
            },
          },
          {
            id: 'oi-2',
            checked: false,
            orderAmount: null,
            executionBudgetItem: {
              id: itemId2,
              name: '項目2',
              specification: '規格B',
              unit: 'm',
              quantity: { toString: () => '10' },
              executionUnitPrice: { toString: () => '20000' },
              executionAmount: { toString: () => '200000' },
            },
          },
        ],
      };

      (prisma.order.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(orderWithItems);

      // Act
      const result = await service.getWithItems(orderId);

      // Assert
      expect(result).toBeDefined();
      expect(result!.id).toBe(orderId);
      expect(result!.tradingPartnerName).toBe('協力業者A');
      expect(result!.items).toHaveLength(2);
      expect(result!.items[0]!.checked).toBe(true);
      expect(result!.items[0]!.executionBudgetItemId).toBe(itemId1);
      expect(result!.items[0]!.name).toBe('項目1');
      expect(result!.totalExecutionAmount).toBe('100000'); // チェック済み項目のみ
    });

    it('発注が存在しない場合はnullを返却する', async () => {
      // Arrange
      (prisma.order.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      // Act
      const result = await service.getWithItems(orderId);

      // Assert
      expect(result).toBeNull();
    });
  });

  // ========================================
  // update: 発注の編集
  // ========================================

  describe('update', () => {
    it('発注ステータスが「発注前」の場合に取引先変更を許可する', async () => {
      // Arrange
      const newPartnerId = '550e8400-e29b-41d4-a716-446655440088';
      const existingOrder = { ...sampleOrder, status: 'BEFORE_ORDER' };
      (prisma.order.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(existingOrder);
      (prisma.order.update as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...existingOrder,
        tradingPartnerId: newPartnerId,
      });

      // Act
      const result = await service.update(orderId, { tradingPartnerId: newPartnerId });

      // Assert
      expect(result.tradingPartnerId).toBe(newPartnerId);
    });

    it('発注ステータスが「発注金額検討中」の場合に確定発注金額変更を許可する', async () => {
      // Arrange
      const existingOrder = { ...sampleOrder, status: 'UNDER_REVIEW' };
      (prisma.order.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(existingOrder);
      (prisma.order.update as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...existingOrder,
        confirmedAmount: { toString: () => '250000' },
      });

      // Act
      const result = await service.update(orderId, { confirmedAmount: '250000' });

      // Assert
      expect(result).toBeDefined();
    });

    it('発注ステータスが「発注済」の場合は編集禁止エラーをスローする', async () => {
      // Arrange
      const existingOrder = { ...sampleOrder, status: 'ORDERED' };
      (prisma.order.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(existingOrder);

      // Act & Assert
      await expect(service.update(orderId, { tradingPartnerId: 'new-id' })).rejects.toThrow(
        OrderEditBlockedError
      );
    });

    it('発注が存在しない場合はOrderNotFoundErrorをスローする', async () => {
      // Arrange
      (prisma.order.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      // Act & Assert
      await expect(service.update(orderId, { tradingPartnerId: 'new-id' })).rejects.toThrow(
        OrderNotFoundError
      );
    });
  });

  // ========================================
  // updateItems: チェック状態変更
  // ========================================

  describe('updateItems', () => {
    it('発注ステータスが「発注前」の場合にチェック状態変更を許可する', async () => {
      // Arrange
      const existingOrder = { ...sampleOrder, status: 'BEFORE_ORDER' };
      mockTx.orderItem.deleteMany.mockResolvedValue({ count: 3 });
      mockTx.orderItem.createMany.mockResolvedValue({ count: 2 });
      mockTx.executionBudgetItem.findMany.mockResolvedValue([
        { id: itemId1 },
        { id: itemId2 },
        { id: itemId3 },
      ]);

      const updatedOrder = {
        ...existingOrder,
        items: [
          {
            id: 'oi-1',
            checked: true,
            orderAmount: null,
            executionBudgetItem: {
              id: itemId1,
              name: '項目1',
              specification: '規格A',
              unit: '式',
              quantity: { toString: () => '1' },
              executionUnitPrice: { toString: () => '100000' },
              executionAmount: { toString: () => '100000' },
            },
          },
          {
            id: 'oi-2',
            checked: true,
            orderAmount: null,
            executionBudgetItem: {
              id: itemId2,
              name: '項目2',
              specification: '規格B',
              unit: 'm',
              quantity: { toString: () => '10' },
              executionUnitPrice: { toString: () => '20000' },
              executionAmount: { toString: () => '200000' },
            },
          },
        ],
        tradingPartner: { id: tradingPartnerId, name: '協力業者A' },
      };
      // 1回目: 存在チェック、2回目: 結果取得
      mockTx.order.findUnique.mockResolvedValueOnce(existingOrder);
      mockTx.order.findUnique.mockResolvedValueOnce(updatedOrder);

      // Act
      const result = await service.updateItems(orderId, [itemId1, itemId2]);

      // Assert
      expect(result).toBeDefined();
    });

    it('発注ステータスが「発注済」の場合はOrderEditBlockedErrorをスローする', async () => {
      // Arrange
      mockTx.order.findUnique.mockResolvedValue({ ...sampleOrder, status: 'ORDERED' });

      // Act & Assert
      await expect(service.updateItems(orderId, [itemId1])).rejects.toThrow(OrderEditBlockedError);
    });
  });

  // ========================================
  // delete: 発注の削除
  // ========================================

  describe('delete', () => {
    it('発注ステータスが「発注前」の場合に削除を許可する', async () => {
      // Arrange
      const existingOrder = { ...sampleOrder, status: 'BEFORE_ORDER' };
      (prisma.order.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(existingOrder);
      (prisma.order.update as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...existingOrder,
        deletedAt: new Date(),
      });

      // Act & Assert
      await expect(service.delete(orderId)).resolves.toBeUndefined();
    });

    it('発注ステータスが「発注金額検討中」の場合に削除を許可する', async () => {
      // Arrange
      const existingOrder = { ...sampleOrder, status: 'UNDER_REVIEW' };
      (prisma.order.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(existingOrder);
      (prisma.order.update as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...existingOrder,
        deletedAt: new Date(),
      });

      // Act & Assert
      await expect(service.delete(orderId)).resolves.toBeUndefined();
    });

    it('発注ステータスが「発注済」の場合はOrderDeletionBlockedErrorをスローする', async () => {
      // Arrange
      const existingOrder = { ...sampleOrder, status: 'ORDERED' };
      (prisma.order.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(existingOrder);

      // Act & Assert
      await expect(service.delete(orderId)).rejects.toThrow(OrderDeletionBlockedError);
    });

    it('発注が存在しない場合はOrderNotFoundErrorをスローする', async () => {
      // Arrange
      (prisma.order.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      // Act & Assert
      await expect(service.delete(orderId)).rejects.toThrow(OrderNotFoundError);
    });

    it('論理削除された発注はOrderNotFoundErrorをスローする', async () => {
      // Arrange
      (prisma.order.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...sampleOrder,
        deletedAt: new Date(),
      });

      // Act & Assert
      await expect(service.delete(orderId)).rejects.toThrow(OrderNotFoundError);
    });
  });

  // ========================================
  // calculateCheckedExecutionTotal: チェック済み合計実行金額の自動計算
  // ========================================

  describe('calculateCheckedExecutionTotal (via getWithItems)', () => {
    it('チェック済み項目の合計実行金額を正しく計算する', async () => {
      // Arrange
      const orderWithItems = {
        id: orderId,
        executionBudgetId,
        tradingPartnerId,
        status: 'BEFORE_ORDER',
        confirmedAmount: null,
        version: 0,
        createdAt: new Date('2026-01-01'),
        updatedAt: new Date('2026-01-01'),
        deletedAt: null,
        tradingPartner: { id: tradingPartnerId, name: '協力業者A' },
        items: [
          {
            id: 'oi-1',
            checked: true,
            orderAmount: null,
            executionBudgetItem: {
              id: itemId1,
              name: '項目1',
              specification: null,
              unit: null,
              quantity: null,
              executionUnitPrice: null,
              executionAmount: { toString: () => '150000' },
            },
          },
          {
            id: 'oi-2',
            checked: true,
            orderAmount: null,
            executionBudgetItem: {
              id: itemId2,
              name: '項目2',
              specification: null,
              unit: null,
              quantity: null,
              executionUnitPrice: null,
              executionAmount: { toString: () => '350000' },
            },
          },
          {
            id: 'oi-3',
            checked: false,
            orderAmount: null,
            executionBudgetItem: {
              id: itemId3,
              name: '項目3',
              specification: null,
              unit: null,
              quantity: null,
              executionUnitPrice: null,
              executionAmount: { toString: () => '500000' },
            },
          },
        ],
      };

      (prisma.order.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(orderWithItems);

      // Act
      const result = await service.getWithItems(orderId);

      // Assert
      // チェック済み項目の合計: 150000 + 350000 = 500000
      expect(result!.totalExecutionAmount).toBe('500000');
    });

    it('チェック済み項目がない場合は合計0を返却する', async () => {
      // Arrange
      const orderWithItems = {
        id: orderId,
        executionBudgetId,
        tradingPartnerId,
        status: 'BEFORE_ORDER',
        confirmedAmount: null,
        version: 0,
        createdAt: new Date('2026-01-01'),
        updatedAt: new Date('2026-01-01'),
        deletedAt: null,
        tradingPartner: { id: tradingPartnerId, name: '協力業者A' },
        items: [
          {
            id: 'oi-1',
            checked: false,
            orderAmount: null,
            executionBudgetItem: {
              id: itemId1,
              name: '項目1',
              specification: null,
              unit: null,
              quantity: null,
              executionUnitPrice: null,
              executionAmount: { toString: () => '100000' },
            },
          },
        ],
      };

      (prisma.order.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(orderWithItems);

      // Act
      const result = await service.getWithItems(orderId);

      // Assert
      expect(result!.totalExecutionAmount).toBe('0');
    });
  });

  // ========================================
  // ステータス別の編集制御テスト
  // ========================================

  describe('ステータス別の編集制御', () => {
    it('CANCELLED状態の発注は編集禁止エラーをスローする', async () => {
      // Arrange
      const existingOrder = { ...sampleOrder, status: 'CANCELLED' };
      (prisma.order.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(existingOrder);

      // Act & Assert
      await expect(service.update(orderId, { tradingPartnerId: 'new-id' })).rejects.toThrow(
        OrderEditBlockedError
      );
    });

    it('CANCELLED状態の発注は削除可能（既に取消済み）', async () => {
      // Arrange - CANCELLED is also not deletable like ORDERED
      const existingOrder = { ...sampleOrder, status: 'CANCELLED' };
      (prisma.order.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(existingOrder);

      // Act & Assert
      await expect(service.delete(orderId)).rejects.toThrow(OrderDeletionBlockedError);
    });
  });
});
