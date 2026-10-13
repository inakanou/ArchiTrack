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

    it('チェック済み項目の合計実行金額を浮動小数点誤差なく計算する (Req 18.1)', async () => {
      // Arrange
      // 999999999999999 × 10 + 1 = 9999999999999991。Number で積み上げると 2^53 を超えた
      // 最後の +1 が丸められて 9999999999999992 になる。未チェック項目は合計に含めない。
      const bigItems = Array.from({ length: 10 }, (_, i) => ({
        id: `oi-big-${i}`,
        checked: true,
        orderAmount: null,
        executionBudgetItem: {
          id: `ebi-big-${i}`,
          executionAmount: { toString: () => '999999999999999' },
        },
      }));
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
            ...bigItems,
            {
              id: 'oi-unchecked',
              checked: false,
              orderAmount: null,
              executionBudgetItem: {
                id: 'ebi-unchecked',
                executionAmount: { toString: () => '5' },
              },
            },
            {
              id: 'oi-last',
              checked: true,
              orderAmount: null,
              executionBudgetItem: {
                id: 'ebi-last',
                executionAmount: { toString: () => '1' },
              },
            },
          ],
        },
      ];

      (prisma.order.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(ordersWithItems);

      // Act
      const result = await service.findByExecutionBudgetId(executionBudgetId);

      // Assert
      expect(result[0]!.checkedItemCount).toBe(11);
      expect(result[0]!.totalExecutionAmount).toBe('9999999999999991');
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

    it('チェック済み項目の合計実行金額を浮動小数点誤差なく計算する (Req 18.1)', async () => {
      // Arrange
      // 999999999999999 × 10 + 1 = 9999999999999991（Number では 9999999999999992 になる）
      const detailItem = (id: string, checked: boolean, executionAmount: string) => ({
        id: `oi-${id}`,
        checked,
        orderAmount: null,
        executionBudgetItem: {
          id: `ebi-${id}`,
          name: `項目${id}`,
          specification: null,
          unit: null,
          quantity: null,
          executionUnitPrice: null,
          executionAmount: { toString: () => executionAmount },
        },
      });
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
          ...Array.from({ length: 10 }, (_, i) => detailItem(`big-${i}`, true, '999999999999999')),
          detailItem('unchecked', false, '5'),
          detailItem('last', true, '1'),
        ],
      };

      (prisma.order.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(orderWithItems);

      // Act
      const result = await service.getWithItems(orderId);

      // Assert
      expect(result!.totalExecutionAmount).toBe('9999999999999991');
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
      // 100000 × 270000 ÷ 300000 = 90000（割り切れる）
      // 200000 × 270000 ÷ 300000 = 180000（割り切れる）
      // 端数は生じないため、比率を先に丸めた誤差（89999 / 180001）が出てはならない
      expect(mockTx.orderItem.update).toHaveBeenCalledWith({
        where: { id: 'oi-1' },
        data: { orderAmount: '90000' },
      });
      expect(mockTx.orderItem.update).toHaveBeenCalledWith({
        where: { id: 'oi-2' },
        data: { orderAmount: '180000' },
      });
      // 合計確認: 90000 + 180000 = 270000
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
      // 案分: 33334(端数加算: 同額のときは先頭の項目), 33333, 33333
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

    // ========================================
    // Task 16.2: 比率を先に丸めず、掛けてから割る案分
    // ========================================

    /**
     * チェック済み項目の実行金額と確定発注金額から案分を実行し、項目ごとの発注金額を返す
     */
    async function prorate(executionAmounts: string[], confirmedAmount: string) {
      const itemIds = [itemId1, itemId2, itemId3];
      const existingOrder = { ...sampleOrder, status: 'UNDER_REVIEW' };
      mockTx.order.findUnique.mockResolvedValue(existingOrder);
      mockTx.orderItem.findMany.mockResolvedValue(
        executionAmounts.map((amount, i) => ({
          id: `oi-${i + 1}`,
          orderId,
          executionBudgetItemId: itemIds[i],
          checked: true,
          orderAmount: null,
          executionBudgetItem: {
            id: itemIds[i],
            executionAmount: { toString: () => amount },
          },
        }))
      );
      mockTx.orderItem.update = vi.fn().mockResolvedValue({});
      mockTx.order.update.mockResolvedValue({
        ...existingOrder,
        status: 'ORDERED',
        confirmedAmount: { toString: () => confirmedAmount },
      });

      await service.updateStatus(orderId, 'ORDERED', confirmedAmount);

      const calls = (mockTx.orderItem.update as ReturnType<typeof vi.fn>).mock.calls;
      const byId = new Map<string, string>(
        calls.map((call: unknown[]) => {
          const arg = call[0] as { where: { id: string }; data: { orderAmount: string } };
          return [arg.where.id, arg.data.orderAmount];
        })
      );
      const amounts = executionAmounts.map((_, i) => byId.get(`oi-${i + 1}`));
      // 2^53 を超える金額でも正確に合計するため BigInt で足す
      const total = amounts.reduce((sum, a) => sum + BigInt(a ?? 'NaN'), 0n);
      return { amounts, total };
    }

    it('全項目の実行金額が同じ場合は、割り切れる確定発注金額を均等に案分する (Req 8.3)', async () => {
      // 300000 × 100000 ÷ 300000 = 100000（各項目とも割り切れる）
      const { amounts, total } = await prorate(['100000', '100000', '100000'], '300000');

      expect(amounts).toEqual(['100000', '100000', '100000']);
      expect(total).toBe(300000n);
    });

    it('全項目の実行金額が同じで確定発注金額が項目数と同じ小額の場合も、1円ずつ案分する (Req 8.3)', async () => {
      // 100000 × 3 ÷ 300000 = 1（各項目とも割り切れる）
      const { amounts, total } = await prorate(['100000', '100000', '100000'], '3');

      expect(amounts).toEqual(['1', '1', '1']);
      expect(total).toBe(3n);
    });

    it('3項目の端数は、先頭でも末尾でもない最大の実行金額の項目に加算され、合計が一致する (Req 8.4, Req 18.3)', async () => {
      // 10000 × 27 ÷ 60000 = 4.5 → 4
      // 30000 × 27 ÷ 60000 = 13.5 → 13
      // 20000 × 27 ÷ 60000 = 9（割り切れる）
      // 切捨ての合計 26、残り 1 円 → 最大の項目2 に加算 → 14
      const { amounts, total } = await prorate(['10000', '30000', '20000'], '27');

      expect(amounts).toEqual(['4', '14', '9']);
      expect(total).toBe(27n);
    });

    it('負の実行金額を含む場合も、実行金額の比率で正確に案分する (Req 8.3, Req 18.3)', async () => {
      // 合計実行金額 = 50000 + 20000 - 10000 = 60000
      // 50000 × 30000 ÷ 60000 = 25000
      // 20000 × 30000 ÷ 60000 = 10000
      // -10000 × 30000 ÷ 60000 = -5000（いずれも割り切れる）
      const { amounts, total } = await prorate(['50000', '20000', '-10000'], '30000');

      expect(amounts).toEqual(['25000', '10000', '-5000']);
      expect(total).toBe(30000n);
    });

    it('負の実行金額を含み割り切れない場合は、負の案分額も切り捨てて端数を最大の項目に加算する (Req 8.4, Req 18.3)', async () => {
      // 合計実行金額 = 60000
      // 50000 × 100000 ÷ 60000 = 83333.33... → 83333
      // 20000 × 100000 ÷ 60000 = 33333.33... → 33333
      // -10000 × 100000 ÷ 60000 = -16666.66... → -16667（切捨て = 負の無限大方向）
      // 切捨ての合計 99999、残り 1 円 → 最大の項目1 に加算 → 83334
      const { amounts, total } = await prorate(['50000', '20000', '-10000'], '100000');

      expect(amounts).toEqual(['83334', '33333', '-16667']);
      expect(total).toBe(100000n);
    });

    it('確定発注金額が1円の場合も、各項目の比率どおりに案分し合計が一致する (Req 8.3, Req 18.3)', async () => {
      // 合計実行金額 = 30000 + 10000 - 10000 = 30000
      // 30000 × 1 ÷ 30000 = 1、10000 × 1 ÷ 30000 = 0.33... → 0、-10000 × 1 ÷ 30000 = -0.33... → -1
      // 切捨ての合計 0、残り 1 円 → 最大の項目1 に加算 → 2
      const { amounts, total } = await prorate(['30000', '10000', '-10000'], '1');

      expect(amounts).toEqual(['2', '0', '-1']);
      expect(total).toBe(1n);
    });

    it('確定発注金額が3円の場合、比率の丸めで端数の行き先が変わらない (Req 8.3, Req 8.4)', async () => {
      // 30000 × 3 ÷ 30000 = 3、10000 × 3 ÷ 30000 = 1、-10000 × 3 ÷ 30000 = -1（割り切れる）
      const { amounts, total } = await prorate(['30000', '10000', '-10000'], '3');

      expect(amounts).toEqual(['3', '1', '-1']);
      expect(total).toBe(3n);
    });

    it('15桁の金額でも、積と商を丸めずに案分する (Req 18.1, Req 18.3)', async () => {
      // 実行金額と確定発注金額は DECIMAL(15,0)。積は 30 桁に達し、既定の有効桁 20 では丸められる
      // 合計実行金額 = 753365973027208
      // 314952022589505 × 998866395654771 ÷ 753365973027208 = 417585878406532.70... → 417585878406532
      // 291682994220352 × 998866395654771 ÷ 753365973027208 = 386734139239060.29... → 386734139239060
      // 146730956217351 × 998866395654771 ÷ 753365973027208 = 194546378009177.99999... → 194546378009177
      // 切捨ての合計は 998866395654769、残り 2 円 → 最大の項目1 に加算 → 417585878406534
      // （既定の Decimal（有効桁 20・四捨五入）で比率を丸めると、項目3 が 194546378009178 に
      //   繰り上がり、端数の行き先が変わる）
      const { amounts, total } = await prorate(
        ['314952022589505', '291682994220352', '146730956217351'],
        '998866395654771'
      );

      expect(amounts).toEqual(['417585878406534', '386734139239060', '194546378009177']);
      expect(total).toBe(998866395654771n);
    });

    it('15桁の同額の3項目は、途中を切り捨てても端数を生まずに均等に案分する (Req 18.1, Req 18.3)', async () => {
      // 999999999999999 × 999999999999999 ÷ 2999999999999997 = 333333333333333（割り切れる）
      // 積（30 桁）や比率を有効桁 20 で切り捨てると、商が 333333333333332 に落ち、
      // 残り 3 円が先頭の項目に寄って 333333333333335 になってしまう
      const { amounts, total } = await prorate(
        ['999999999999999', '999999999999999', '999999999999999'],
        '999999999999999'
      );

      expect(amounts).toEqual(['333333333333333', '333333333333333', '333333333333333']);
      expect(total).toBe(999999999999999n);
    });

    it('15桁の同額の2項目で確定発注金額が割り切れる場合は、端数を生まずに半分ずつ案分する (Req 18.1, Req 18.3)', async () => {
      // 41341574795842 × 468103502234220 ÷ 82683149591684 = 234051751117110（割り切れる）
      // 積を有効桁 20 で切り捨てると 234051751117109 に落ち、残り 1 円が先頭の項目に寄る
      const { amounts, total } = await prorate(
        ['41341574795842', '41341574795842'],
        '468103502234220'
      );

      expect(amounts).toEqual(['234051751117110', '234051751117110']);
      expect(total).toBe(468103502234220n);
    });

    it('確定発注金額に小数がある場合、端数を加えた項目は従来どおり四捨五入で整数にする (Req 8.4, Req 18.3)', async () => {
      // 1 × 100.5 ÷ 2 = 50.25 → 50、1 × 100.5 ÷ 2 = 50.25 → 50
      // 残り 0.5 → 同額のため先頭の項目に加算 → 50.5 → 四捨五入で 51
      // 確定発注金額の列は DECIMAL(15,0) で 100.5 は 101 として保存されるため、合計 101 と一致する
      const { amounts } = await prorate(['1', '1'], '100.5');

      expect(amounts).toEqual(['51', '50']);
    });

    it('確定発注金額に小数がある場合、実行金額の比率で案分し端数を最大の項目で四捨五入する (Req 8.4)', async () => {
      // 1 × 100.7 ÷ 3 = 33.56... → 33、2 × 100.7 ÷ 3 = 67.13... → 67
      // 残り 0.7 → 最大の項目2 に加算 → 67.7 → 四捨五入で 68
      const { amounts } = await prorate(['1', '2'], '100.7');

      expect(amounts).toEqual(['33', '68']);
    });
  });
});
