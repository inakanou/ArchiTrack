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
  ConfirmedAmountRequiredError,
  InvalidOrderStatusTransitionError,
  NoCheckedItemsError,
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
      update: vi.fn(),
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

  // ========================================
  // Task 3.2: 発注金額確定・案分計算・発注取消サービス
  // Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8, 8.9, 18.1, 18.3
  // ========================================

  describe('updateStatus - 発注ステータス変更', () => {
    // ========================================
    // 8.1, 8.2: 確定発注金額の入力必須チェック
    // ========================================

    it('ステータスを「発注済」に変更する際、確定発注金額が未入力の場合はConfirmedAmountRequiredErrorをスローする', async () => {
      // Arrange
      const existingOrder = {
        ...sampleOrder,
        status: 'UNDER_REVIEW',
      };
      mockTx.order.findUnique.mockResolvedValue(existingOrder);

      // Act & Assert
      await expect(service.updateStatus(orderId, 'ORDERED')).rejects.toThrow(
        ConfirmedAmountRequiredError
      );
    });

    it('ステータスを「発注済」に変更する際、confirmedAmountが空文字の場合はConfirmedAmountRequiredErrorをスローする', async () => {
      // Arrange
      const existingOrder = {
        ...sampleOrder,
        status: 'UNDER_REVIEW',
      };
      mockTx.order.findUnique.mockResolvedValue(existingOrder);

      // Act & Assert
      await expect(service.updateStatus(orderId, 'ORDERED', '')).rejects.toThrow(
        ConfirmedAmountRequiredError
      );
    });

    it('ステータスを「発注済」に変更する際、confirmedAmountが0の場合もConfirmedAmountRequiredErrorをスローする', async () => {
      // Arrange
      const existingOrder = {
        ...sampleOrder,
        status: 'UNDER_REVIEW',
      };
      mockTx.order.findUnique.mockResolvedValue(existingOrder);

      // Act & Assert
      await expect(service.updateStatus(orderId, 'ORDERED', '0')).rejects.toThrow(
        ConfirmedAmountRequiredError
      );
    });

    it('発注が存在しない場合はOrderNotFoundErrorをスローする', async () => {
      // Arrange
      mockTx.order.findUnique.mockResolvedValue(null);

      // Act & Assert
      await expect(service.updateStatus(orderId, 'ORDERED', '300000')).rejects.toThrow(
        OrderNotFoundError
      );
    });

    it('論理削除済みの発注はOrderNotFoundErrorをスローする', async () => {
      // Arrange
      mockTx.order.findUnique.mockResolvedValue({
        ...sampleOrder,
        deletedAt: new Date(),
      });

      // Act & Assert
      await expect(service.updateStatus(orderId, 'ORDERED', '300000')).rejects.toThrow(
        OrderNotFoundError
      );
    });

    // ========================================
    // ステータス遷移バリデーション
    // ========================================

    it('BEFORE_ORDER → UNDER_REVIEW への遷移を許可する', async () => {
      // Arrange
      const existingOrder = { ...sampleOrder, status: 'BEFORE_ORDER' };
      mockTx.order.findUnique.mockResolvedValue(existingOrder);
      mockTx.order.update.mockResolvedValue({
        ...existingOrder,
        status: 'UNDER_REVIEW',
      });

      // Act
      const result = await service.updateStatus(orderId, 'UNDER_REVIEW');

      // Assert
      expect(result.status).toBe('UNDER_REVIEW');
    });

    it('UNDER_REVIEW → BEFORE_ORDER への遷移を許可する', async () => {
      // Arrange
      const existingOrder = { ...sampleOrder, status: 'UNDER_REVIEW' };
      mockTx.order.findUnique.mockResolvedValue(existingOrder);
      mockTx.order.update.mockResolvedValue({
        ...existingOrder,
        status: 'BEFORE_ORDER',
      });

      // Act
      const result = await service.updateStatus(orderId, 'BEFORE_ORDER');

      // Assert
      expect(result.status).toBe('BEFORE_ORDER');
    });

    it('CANCELLED → ORDERED への遷移は許可しない', async () => {
      // Arrange
      mockTx.order.findUnique.mockResolvedValue({
        ...sampleOrder,
        status: 'CANCELLED',
      });

      // Act & Assert
      await expect(service.updateStatus(orderId, 'ORDERED', '300000')).rejects.toThrow(
        InvalidOrderStatusTransitionError
      );
    });

    // ========================================
    // 8.3, 8.4, 8.5, 18.1, 18.3: 案分計算
    // ========================================

    it('確定発注金額をチェック済み項目の実行金額比率で案分する', async () => {
      // Arrange
      // 項目1: executionAmount=100000, 項目2: executionAmount=200000
      // 確定発注金額: 270000
      // 案分: 100000/300000 * 270000 = 90000, 200000/300000 * 270000 = 180000
      const existingOrder = {
        ...sampleOrder,
        status: 'UNDER_REVIEW',
      };
      mockTx.order.findUnique.mockResolvedValue(existingOrder);

      mockTx.orderItem.findMany.mockResolvedValue([
        {
          id: 'oi-1',
          orderId,
          executionBudgetItemId: itemId1,
          checked: true,
          orderAmount: null,
          executionBudgetItem: {
            id: itemId1,
            executionAmount: { toString: () => '100000' },
          },
        },
        {
          id: 'oi-2',
          orderId,
          executionBudgetItemId: itemId2,
          checked: true,
          orderAmount: null,
          executionBudgetItem: {
            id: itemId2,
            executionAmount: { toString: () => '200000' },
          },
        },
        {
          id: 'oi-3',
          orderId,
          executionBudgetItemId: itemId3,
          checked: false,
          orderAmount: null,
          executionBudgetItem: {
            id: itemId3,
            executionAmount: { toString: () => '300000' },
          },
        },
      ]);

      mockTx.orderItem.update = vi.fn().mockResolvedValue({});
      mockTx.order.update.mockResolvedValue({
        ...existingOrder,
        status: 'ORDERED',
        confirmedAmount: { toString: () => '270000' },
      });

      // Act
      const result = await service.updateStatus(orderId, 'ORDERED', '270000');

      // Assert
      expect(result.status).toBe('ORDERED');
      // 案分結果の検証: orderItem.updateが2回（チェック済み項目のみ）呼ばれる
      expect(mockTx.orderItem.update).toHaveBeenCalledTimes(2);
      // floor(100000/300000 * 270000) = floor(89999.999...) = 89999
      // floor(200000/300000 * 270000) = floor(179999.999...) = 179999
      // 残り: 270000 - 89999 - 179999 = 2 → 項目2(最大金額)に加算 → 180001
      expect(mockTx.orderItem.update).toHaveBeenCalledWith({
        where: { id: 'oi-1' },
        data: { orderAmount: '89999' },
      });
      expect(mockTx.orderItem.update).toHaveBeenCalledWith({
        where: { id: 'oi-2' },
        data: { orderAmount: '180001' },
      });
      // 合計確認: 89999 + 180001 = 270000
      const calls = (mockTx.orderItem.update as ReturnType<typeof vi.fn>).mock.calls;
      const total = calls.reduce(
        (sum: number, call: unknown[]) =>
          sum + parseInt((call[0] as { data: { orderAmount: string } }).data.orderAmount, 10),
        0
      );
      expect(total).toBe(270000);
    });

    it('案分端数処理: 1円未満の端数を最も金額の大きい項目に加算する', async () => {
      // Arrange
      // 項目1: executionAmount=100000, 項目2: executionAmount=200000
      // 確定発注金額: 100000
      // 案分: 100000/300000 * 100000 = 33333.333..., 200000/300000 * 100000 = 66666.666...
      // 端数切捨て: 33333 + 66666 = 99999, 残り1円 → 項目2(最大金額)に加算 → 66667
      const existingOrder = {
        ...sampleOrder,
        status: 'UNDER_REVIEW',
      };
      mockTx.order.findUnique.mockResolvedValue(existingOrder);

      mockTx.orderItem.findMany.mockResolvedValue([
        {
          id: 'oi-1',
          orderId,
          executionBudgetItemId: itemId1,
          checked: true,
          orderAmount: null,
          executionBudgetItem: {
            id: itemId1,
            executionAmount: { toString: () => '100000' },
          },
        },
        {
          id: 'oi-2',
          orderId,
          executionBudgetItemId: itemId2,
          checked: true,
          orderAmount: null,
          executionBudgetItem: {
            id: itemId2,
            executionAmount: { toString: () => '200000' },
          },
        },
      ]);

      mockTx.orderItem.update = vi.fn().mockResolvedValue({});
      mockTx.order.update.mockResolvedValue({
        ...existingOrder,
        status: 'ORDERED',
        confirmedAmount: { toString: () => '100000' },
      });

      // Act
      const result = await service.updateStatus(orderId, 'ORDERED', '100000');

      // Assert
      expect(result.status).toBe('ORDERED');
      expect(mockTx.orderItem.update).toHaveBeenCalledTimes(2);
      // 項目1(小さい方): 33333
      expect(mockTx.orderItem.update).toHaveBeenCalledWith({
        where: { id: 'oi-1' },
        data: { orderAmount: '33333' },
      });
      // 項目2(大きい方): 66666 + 端数1 = 66667
      expect(mockTx.orderItem.update).toHaveBeenCalledWith({
        where: { id: 'oi-2' },
        data: { orderAmount: '66667' },
      });
    });

    it('案分合計が確定発注金額と一致することを保証する（3項目の端数テスト）', async () => {
      // Arrange
      // 3項目: 10000, 20000, 30000 = 合計60000
      // 確定発注金額: 10000
      // 案分: 10000/60000*10000=1666.66..., 20000/60000*10000=3333.33..., 30000/60000*10000=5000
      // 切捨て: 1666 + 3333 + 5000 = 9999, 残り1円 → 項目3(最大)に加算 → 5001
      const existingOrder = {
        ...sampleOrder,
        status: 'UNDER_REVIEW',
      };
      mockTx.order.findUnique.mockResolvedValue(existingOrder);

      mockTx.orderItem.findMany.mockResolvedValue([
        {
          id: 'oi-1',
          orderId,
          executionBudgetItemId: itemId1,
          checked: true,
          orderAmount: null,
          executionBudgetItem: {
            id: itemId1,
            executionAmount: { toString: () => '10000' },
          },
        },
        {
          id: 'oi-2',
          orderId,
          executionBudgetItemId: itemId2,
          checked: true,
          orderAmount: null,
          executionBudgetItem: {
            id: itemId2,
            executionAmount: { toString: () => '20000' },
          },
        },
        {
          id: 'oi-3',
          orderId,
          executionBudgetItemId: itemId3,
          checked: true,
          orderAmount: null,
          executionBudgetItem: {
            id: itemId3,
            executionAmount: { toString: () => '30000' },
          },
        },
      ]);

      mockTx.orderItem.update = vi.fn().mockResolvedValue({});
      mockTx.order.update.mockResolvedValue({
        ...existingOrder,
        status: 'ORDERED',
        confirmedAmount: { toString: () => '10000' },
      });

      // Act
      await service.updateStatus(orderId, 'ORDERED', '10000');

      // Assert
      expect(mockTx.orderItem.update).toHaveBeenCalledTimes(3);

      // 案分結果を取得して合計を検証
      const updateCalls = (mockTx.orderItem.update as ReturnType<typeof vi.fn>).mock.calls;
      let totalProrated = 0;
      for (const call of updateCalls) {
        totalProrated += parseInt(call[0].data.orderAmount, 10);
      }
      // 合計が確定発注金額と完全に一致する
      expect(totalProrated).toBe(10000);
    });

    it('チェック済み項目が1つのみの場合は確定発注金額をそのまま設定する', async () => {
      // Arrange
      const existingOrder = {
        ...sampleOrder,
        status: 'UNDER_REVIEW',
      };
      mockTx.order.findUnique.mockResolvedValue(existingOrder);

      mockTx.orderItem.findMany.mockResolvedValue([
        {
          id: 'oi-1',
          orderId,
          executionBudgetItemId: itemId1,
          checked: true,
          orderAmount: null,
          executionBudgetItem: {
            id: itemId1,
            executionAmount: { toString: () => '100000' },
          },
        },
      ]);

      mockTx.orderItem.update = vi.fn().mockResolvedValue({});
      mockTx.order.update.mockResolvedValue({
        ...existingOrder,
        status: 'ORDERED',
        confirmedAmount: { toString: () => '80000' },
      });

      // Act
      await service.updateStatus(orderId, 'ORDERED', '80000');

      // Assert
      expect(mockTx.orderItem.update).toHaveBeenCalledTimes(1);
      expect(mockTx.orderItem.update).toHaveBeenCalledWith({
        where: { id: 'oi-1' },
        data: { orderAmount: '80000' },
      });
    });

    it('チェック済み項目がない場合はNoCheckedItemsErrorをスローする', async () => {
      // Arrange
      const existingOrder = {
        ...sampleOrder,
        status: 'UNDER_REVIEW',
      };
      mockTx.order.findUnique.mockResolvedValue(existingOrder);

      mockTx.orderItem.findMany.mockResolvedValue([
        {
          id: 'oi-1',
          orderId,
          executionBudgetItemId: itemId1,
          checked: false,
          orderAmount: null,
          executionBudgetItem: {
            id: itemId1,
            executionAmount: { toString: () => '100000' },
          },
        },
      ]);

      // Act & Assert
      await expect(service.updateStatus(orderId, 'ORDERED', '300000')).rejects.toThrow(
        NoCheckedItemsError
      );
    });

    // ========================================
    // 8.6, 8.7: 発注済ステータスでの編集禁止
    // ========================================

    it('発注済ステータスでのORDERED以外への遷移を禁止する（UNDER_REVIEWへの戻り）', async () => {
      // Arrange
      mockTx.order.findUnique.mockResolvedValue({
        ...sampleOrder,
        status: 'ORDERED',
      });

      // Act & Assert - ORDERED → UNDER_REVIEW は不可
      await expect(service.updateStatus(orderId, 'UNDER_REVIEW')).rejects.toThrow(
        InvalidOrderStatusTransitionError
      );
    });
  });

  // ========================================
  // Task 3.2: cancelOrder - 発注取消
  // Requirements: 8.8, 8.9
  // ========================================

  describe('cancelOrder - 発注取消', () => {
    it('発注取消時に案分済みの各項目のorderAmountをクリアする', async () => {
      // Arrange
      const orderedOrder = {
        ...sampleOrder,
        status: 'ORDERED',
        confirmedAmount: { toString: () => '300000' },
      };
      mockTx.order.findUnique.mockResolvedValue(orderedOrder);

      mockTx.orderItem.findMany.mockResolvedValue([
        {
          id: 'oi-1',
          orderId,
          executionBudgetItemId: itemId1,
          checked: true,
          orderAmount: { toString: () => '100000' },
        },
        {
          id: 'oi-2',
          orderId,
          executionBudgetItemId: itemId2,
          checked: true,
          orderAmount: { toString: () => '200000' },
        },
      ]);

      mockTx.orderItem.updateMany.mockResolvedValue({ count: 2 });
      mockTx.order.update.mockResolvedValue({
        ...orderedOrder,
        status: 'CANCELLED',
        confirmedAmount: null,
      });

      // Act
      const result = await service.cancelOrder(orderId);

      // Assert
      expect(result.status).toBe('CANCELLED');
      // 全項目のorderAmountがnullにクリアされる
      expect(mockTx.orderItem.updateMany).toHaveBeenCalledWith({
        where: { orderId },
        data: { orderAmount: null },
      });
    });

    it('発注取消時にステータスを「発注取消」に変更する', async () => {
      // Arrange
      const orderedOrder = {
        ...sampleOrder,
        status: 'ORDERED',
        confirmedAmount: { toString: () => '300000' },
      };
      mockTx.order.findUnique.mockResolvedValue(orderedOrder);
      mockTx.orderItem.findMany.mockResolvedValue([]);
      mockTx.orderItem.updateMany.mockResolvedValue({ count: 0 });
      mockTx.order.update.mockResolvedValue({
        ...orderedOrder,
        status: 'CANCELLED',
        confirmedAmount: null,
      });

      // Act
      const result = await service.cancelOrder(orderId);

      // Assert
      expect(result.status).toBe('CANCELLED');
      expect(mockTx.order.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: orderId },
          data: expect.objectContaining({
            status: 'CANCELLED',
            confirmedAmount: null,
          }),
        })
      );
    });

    it('発注済以外のステータスの発注を取消しようとするとInvalidOrderStatusTransitionErrorをスローする', async () => {
      // Arrange
      mockTx.order.findUnique.mockResolvedValue({
        ...sampleOrder,
        status: 'BEFORE_ORDER',
      });

      // Act & Assert
      await expect(service.cancelOrder(orderId)).rejects.toThrow(InvalidOrderStatusTransitionError);
    });

    it('UNDER_REVIEW状態の発注を取消しようとするとInvalidOrderStatusTransitionErrorをスローする', async () => {
      // Arrange
      mockTx.order.findUnique.mockResolvedValue({
        ...sampleOrder,
        status: 'UNDER_REVIEW',
      });

      // Act & Assert
      await expect(service.cancelOrder(orderId)).rejects.toThrow(InvalidOrderStatusTransitionError);
    });

    it('存在しない発注の取消はOrderNotFoundErrorをスローする', async () => {
      // Arrange
      mockTx.order.findUnique.mockResolvedValue(null);

      // Act & Assert
      await expect(service.cancelOrder(orderId)).rejects.toThrow(OrderNotFoundError);
    });
  });

  // ========================================
  // Task 3.2: 案分計算の精度テスト (decimal.js)
  // Requirements: 18.1, 18.3
  // ========================================

  describe('案分計算の精度テスト', () => {
    it('大きな金額での案分計算の精度が保たれる', async () => {
      // Arrange
      // 項目1: 12345678, 項目2: 87654322 = 合計100000000
      // 確定発注金額: 99999999
      const existingOrder = {
        ...sampleOrder,
        status: 'UNDER_REVIEW',
      };
      mockTx.order.findUnique.mockResolvedValue(existingOrder);

      mockTx.orderItem.findMany.mockResolvedValue([
        {
          id: 'oi-1',
          orderId,
          executionBudgetItemId: itemId1,
          checked: true,
          orderAmount: null,
          executionBudgetItem: {
            id: itemId1,
            executionAmount: { toString: () => '12345678' },
          },
        },
        {
          id: 'oi-2',
          orderId,
          executionBudgetItemId: itemId2,
          checked: true,
          orderAmount: null,
          executionBudgetItem: {
            id: itemId2,
            executionAmount: { toString: () => '87654322' },
          },
        },
      ]);

      mockTx.orderItem.update = vi.fn().mockResolvedValue({});
      mockTx.order.update.mockResolvedValue({
        ...existingOrder,
        status: 'ORDERED',
        confirmedAmount: { toString: () => '99999999' },
      });

      // Act
      await service.updateStatus(orderId, 'ORDERED', '99999999');

      // Assert - 合計が確定発注金額と完全一致
      const updateCalls = (mockTx.orderItem.update as ReturnType<typeof vi.fn>).mock.calls;
      let totalProrated = 0;
      for (const call of updateCalls) {
        totalProrated += parseInt(call[0].data.orderAmount, 10);
      }
      expect(totalProrated).toBe(99999999);
    });

    it('全項目の実行金額が同じ場合の均等案分', async () => {
      // Arrange
      // 3項目とも100000、確定発注金額: 100000
      // 案分: 33333, 33333, 33334(端数加算)
      const existingOrder = {
        ...sampleOrder,
        status: 'UNDER_REVIEW',
      };
      mockTx.order.findUnique.mockResolvedValue(existingOrder);

      mockTx.orderItem.findMany.mockResolvedValue([
        {
          id: 'oi-1',
          orderId,
          executionBudgetItemId: itemId1,
          checked: true,
          orderAmount: null,
          executionBudgetItem: {
            id: itemId1,
            executionAmount: { toString: () => '100000' },
          },
        },
        {
          id: 'oi-2',
          orderId,
          executionBudgetItemId: itemId2,
          checked: true,
          orderAmount: null,
          executionBudgetItem: {
            id: itemId2,
            executionAmount: { toString: () => '100000' },
          },
        },
        {
          id: 'oi-3',
          orderId,
          executionBudgetItemId: itemId3,
          checked: true,
          orderAmount: null,
          executionBudgetItem: {
            id: itemId3,
            executionAmount: { toString: () => '100000' },
          },
        },
      ]);

      mockTx.orderItem.update = vi.fn().mockResolvedValue({});
      mockTx.order.update.mockResolvedValue({
        ...existingOrder,
        status: 'ORDERED',
        confirmedAmount: { toString: () => '100000' },
      });

      // Act
      await service.updateStatus(orderId, 'ORDERED', '100000');

      // Assert - 合計が100000であること
      const updateCalls = (mockTx.orderItem.update as ReturnType<typeof vi.fn>).mock.calls;
      let totalProrated = 0;
      for (const call of updateCalls) {
        totalProrated += parseInt(call[0].data.orderAmount, 10);
      }
      expect(totalProrated).toBe(100000);
    });
  });
});
