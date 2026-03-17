/**
 * @fileoverview 発注サービス
 *
 * 発注のライフサイクル管理（作成・取得・編集・削除）を担当します。
 *
 * Requirements (execution-budget-management):
 * - 5.1-5.3: 発注一覧表示
 * - 6.1-6.8: 発注の作成と取引先指定
 * - 7.1-7.5: 発注の編集と削除
 *
 * Task 3.1: 発注の作成・取得・編集・削除サービス実装
 *
 * @module services/order
 */

import Decimal from 'decimal.js';
import type { PrismaClient } from '../generated/prisma/client.js';
import {
  OrderNotFoundError,
  OrderEditBlockedError,
  OrderDeletionBlockedError,
  ExecutionBudgetNotFoundForOrderError,
} from '../errors/orderError.js';

/**
 * OrderService依存関係
 */
export interface OrderServiceDependencies {
  prisma: PrismaClient;
}

/**
 * 発注一覧サマリー
 */
export interface OrderSummary {
  id: string;
  executionBudgetId: string;
  tradingPartnerId: string;
  tradingPartnerName: string;
  status: string;
  confirmedAmount: string | null;
  checkedItemCount: number;
  totalExecutionAmount: string;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * 発注詳細項目
 */
export interface OrderItemDetail {
  id: string;
  executionBudgetItemId: string;
  checked: boolean;
  orderAmount: string | null;
  name: string | null;
  specification: string | null;
  unit: string | null;
  quantity: string | null;
  executionUnitPrice: string | null;
  executionAmount: string | null;
}

/**
 * 発注詳細（OrderItem一覧含む）
 */
export interface OrderWithItemsResult {
  id: string;
  executionBudgetId: string;
  tradingPartnerId: string;
  tradingPartnerName: string;
  status: string;
  confirmedAmount: string | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  items: OrderItemDetail[];
  totalExecutionAmount: string;
}

/**
 * 発注更新入力
 */
export interface UpdateOrderInput {
  tradingPartnerId?: string;
  confirmedAmount?: string;
}

/**
 * Prismaトランザクションクライアント型
 */
type PrismaTransactionClient = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

/**
 * 編集可能なステータス（発注前、発注金額検討中）
 */
const EDITABLE_STATUSES = ['BEFORE_ORDER', 'UNDER_REVIEW'] as const;

/**
 * 削除可能なステータス（発注前、発注金額検討中）
 */
const DELETABLE_STATUSES = ['BEFORE_ORDER', 'UNDER_REVIEW'] as const;

/**
 * 発注サービス
 *
 * 発注のCRUD操作を担当します。
 */
export class OrderService {
  private readonly prisma: PrismaClient;

  constructor(deps: OrderServiceDependencies) {
    this.prisma = deps.prisma;
  }

  /**
   * 発注を作成する
   *
   * 取引先IDを指定して発注を作成し、発注予定取引先が一致する
   * ExecutionBudgetItemにchecked=trueでOrderItemを作成する。
   *
   * Requirements: 6.1, 6.2, 6.3, 6.8
   *
   * @param executionBudgetId - 実行予算ID
   * @param tradingPartnerId - 取引先ID
   * @returns 作成された発注
   * @throws ExecutionBudgetNotFoundForOrderError 実行予算が存在しない場合
   */
  async create(
    executionBudgetId: string,
    tradingPartnerId: string
  ): Promise<{
    id: string;
    executionBudgetId: string;
    tradingPartnerId: string;
    status: string;
    confirmedAmount: string | null;
    version: number;
    createdAt: Date;
    updatedAt: Date;
  }> {
    return await this.prisma.$transaction(async (tx: PrismaTransactionClient) => {
      // 1. 実行予算の存在チェック
      const budget = await tx.executionBudget.findFirst({
        where: { id: executionBudgetId, deletedAt: null },
      });

      if (!budget) {
        throw new ExecutionBudgetNotFoundForOrderError();
      }

      // 2. 実行予算の全項目を取得（リーフ項目のみ：子を持たない項目）
      const budgetItems = await tx.executionBudgetItem.findMany({
        where: { executionBudgetId },
        select: {
          id: true,
          plannedVendorId: true,
          executionAmount: true,
        },
      });

      // 3. 発注を作成
      const order = await tx.order.create({
        data: {
          executionBudgetId,
          tradingPartnerId,
          status: 'BEFORE_ORDER',
        },
      });

      // 4. 全項目に対してOrderItemを作成
      // 発注予定取引先が一致する項目はchecked=true、それ以外はchecked=false
      if (budgetItems.length > 0) {
        const orderItemsData = budgetItems.map((item) => ({
          orderId: order.id,
          executionBudgetItemId: item.id,
          checked: item.plannedVendorId === tradingPartnerId,
        }));

        await tx.orderItem.createMany({
          data: orderItemsData,
        });
      }

      return {
        id: order.id,
        executionBudgetId: order.executionBudgetId,
        tradingPartnerId: order.tradingPartnerId,
        status: order.status as string,
        confirmedAmount: order.confirmedAmount?.toString() ?? null,
        version: order.version,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
      };
    });
  }

  /**
   * 発注一覧を取得する
   *
   * チェック済み項目数、合計実行金額、確定発注金額を含むサマリーを返却する。
   *
   * Requirements: 5.1, 5.2, 5.3
   *
   * @param executionBudgetId - 実行予算ID
   * @returns 発注一覧サマリー
   */
  async findByExecutionBudgetId(executionBudgetId: string): Promise<OrderSummary[]> {
    const orders = await this.prisma.order.findMany({
      where: {
        executionBudgetId,
        deletedAt: null,
      },
      include: {
        tradingPartner: {
          select: { id: true, name: true },
        },
        items: {
          include: {
            executionBudgetItem: {
              select: { id: true, executionAmount: true },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return orders.map((order) => {
      const checkedItems = order.items.filter((item: { checked: boolean }) => item.checked);
      const totalExecutionAmount = checkedItems.reduce(
        (
          sum: Decimal,
          item: { executionBudgetItem: { executionAmount: { toString(): string } | null } }
        ) => {
          const amount = item.executionBudgetItem.executionAmount;
          return amount ? sum.add(new Decimal(amount.toString())) : sum;
        },
        new Decimal(0)
      );

      return {
        id: order.id,
        executionBudgetId: order.executionBudgetId,
        tradingPartnerId: order.tradingPartnerId,
        tradingPartnerName: (order as unknown as { tradingPartner: { name: string } })
          .tradingPartner.name,
        status: order.status as string,
        confirmedAmount: order.confirmedAmount?.toString() ?? null,
        checkedItemCount: checkedItems.length,
        totalExecutionAmount: totalExecutionAmount.toFixed(0),
        version: order.version,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
      };
    });
  }

  /**
   * 発注詳細を取得する
   *
   * OrderItem一覧を含む詳細データを返却する。
   *
   * Requirements: 5.3, 6.3, 6.5
   *
   * @param orderId - 発注ID
   * @returns 発注詳細（存在しない場合はnull）
   */
  async getWithItems(orderId: string): Promise<OrderWithItemsResult | null> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        tradingPartner: {
          select: { id: true, name: true },
        },
        items: {
          include: {
            executionBudgetItem: {
              select: {
                id: true,
                name: true,
                specification: true,
                unit: true,
                quantity: true,
                executionUnitPrice: true,
                executionAmount: true,
              },
            },
          },
        },
      },
    });

    if (!order || order.deletedAt !== null) {
      return null;
    }

    const items: OrderItemDetail[] = order.items.map(
      (item: {
        id: string;
        checked: boolean;
        orderAmount: { toString(): string } | null;
        executionBudgetItem: {
          id: string;
          name: string | null;
          specification: string | null;
          unit: string | null;
          quantity: { toString(): string } | null;
          executionUnitPrice: { toString(): string } | null;
          executionAmount: { toString(): string } | null;
        };
      }) => ({
        id: item.id,
        executionBudgetItemId: item.executionBudgetItem.id,
        checked: item.checked,
        orderAmount: item.orderAmount?.toString() ?? null,
        name: item.executionBudgetItem.name,
        specification: item.executionBudgetItem.specification,
        unit: item.executionBudgetItem.unit,
        quantity: item.executionBudgetItem.quantity?.toString() ?? null,
        executionUnitPrice: item.executionBudgetItem.executionUnitPrice?.toString() ?? null,
        executionAmount: item.executionBudgetItem.executionAmount?.toString() ?? null,
      })
    );

    // チェック済み項目の合計実行金額を自動計算
    const totalExecutionAmount = this.calculateCheckedExecutionTotal(items);

    return {
      id: order.id,
      executionBudgetId: order.executionBudgetId,
      tradingPartnerId: order.tradingPartnerId,
      tradingPartnerName: (order as unknown as { tradingPartner: { name: string } }).tradingPartner
        .name,
      status: order.status as string,
      confirmedAmount: order.confirmedAmount?.toString() ?? null,
      version: order.version,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      items,
      totalExecutionAmount,
    };
  }

  /**
   * 発注を更新する
   *
   * 発注ステータスが「発注前」「発注金額検討中」の場合のみ、
   * 取引先変更・確定発注金額変更を許可する。
   *
   * Requirements: 7.1, 7.2
   *
   * @param orderId - 発注ID
   * @param data - 更新データ
   * @returns 更新された発注
   * @throws OrderNotFoundError 発注が存在しない場合
   * @throws OrderEditBlockedError 発注済/取消ステータスの場合
   */
  async update(
    orderId: string,
    data: UpdateOrderInput
  ): Promise<{
    id: string;
    tradingPartnerId: string;
    status: string;
    confirmedAmount: string | null;
    version: number;
  }> {
    // 1. 発注の存在チェック
    const existing = await this.prisma.order.findUnique({
      where: { id: orderId },
    });

    if (!existing || existing.deletedAt !== null) {
      throw new OrderNotFoundError();
    }

    // 2. ステータスチェック: 編集可能か確認
    if (!EDITABLE_STATUSES.includes(existing.status as (typeof EDITABLE_STATUSES)[number])) {
      throw new OrderEditBlockedError();
    }

    // 3. 更新データの構築
    const updateData: Record<string, unknown> = {};

    if (data.tradingPartnerId !== undefined) {
      updateData.tradingPartnerId = data.tradingPartnerId;
    }

    if (data.confirmedAmount !== undefined) {
      updateData.confirmedAmount = data.confirmedAmount;
    }

    // 4. 更新
    const updated = await this.prisma.order.update({
      where: { id: orderId },
      data: updateData,
    });

    return {
      id: updated.id,
      tradingPartnerId: updated.tradingPartnerId,
      status: updated.status as string,
      confirmedAmount: updated.confirmedAmount?.toString() ?? null,
      version: updated.version,
    };
  }

  /**
   * 発注項目のチェック状態を更新する
   *
   * 指定されたitemIdsをchecked=trueとし、それ以外をchecked=falseにする。
   * 発注ステータスが「発注前」「発注金額検討中」の場合のみ許可する。
   *
   * Requirements: 6.4, 7.2
   *
   * @param orderId - 発注ID
   * @param checkedItemIds - チェック対象の実行予算項目IDの配列
   * @returns 更新後の発注詳細
   * @throws OrderNotFoundError 発注が存在しない場合
   * @throws OrderEditBlockedError 発注済/取消ステータスの場合
   */
  async updateItems(orderId: string, checkedItemIds: string[]): Promise<OrderWithItemsResult> {
    return await this.prisma.$transaction(async (tx: PrismaTransactionClient) => {
      // 1. 発注の存在チェック
      const existing = await tx.order.findUnique({
        where: { id: orderId },
      });

      if (!existing || existing.deletedAt !== null) {
        throw new OrderNotFoundError();
      }

      // 2. ステータスチェック
      if (!EDITABLE_STATUSES.includes(existing.status as (typeof EDITABLE_STATUSES)[number])) {
        throw new OrderEditBlockedError();
      }

      // 3. 既存のOrderItemを削除し、新しいチェック状態で再作成
      await tx.orderItem.deleteMany({
        where: { orderId },
      });

      // 4. 実行予算の全項目を取得
      const budgetItems = await tx.executionBudgetItem.findMany({
        where: { executionBudgetId: existing.executionBudgetId },
        select: { id: true },
      });

      // 5. 新しいOrderItemを作成
      const checkedSet = new Set(checkedItemIds);
      const orderItemsData = budgetItems.map((item: { id: string }) => ({
        orderId,
        executionBudgetItemId: item.id,
        checked: checkedSet.has(item.id),
      }));

      await tx.orderItem.createMany({
        data: orderItemsData,
      });

      // 6. 更新後の発注詳細を取得
      const updated = await tx.order.findUnique({
        where: { id: orderId },
        include: {
          tradingPartner: {
            select: { id: true, name: true },
          },
          items: {
            include: {
              executionBudgetItem: {
                select: {
                  id: true,
                  name: true,
                  specification: true,
                  unit: true,
                  quantity: true,
                  executionUnitPrice: true,
                  executionAmount: true,
                },
              },
            },
          },
        },
      });

      if (!updated) {
        throw new OrderNotFoundError();
      }

      const items: OrderItemDetail[] = updated.items.map(
        (item: {
          id: string;
          checked: boolean;
          orderAmount: { toString(): string } | null;
          executionBudgetItem: {
            id: string;
            name: string | null;
            specification: string | null;
            unit: string | null;
            quantity: { toString(): string } | null;
            executionUnitPrice: { toString(): string } | null;
            executionAmount: { toString(): string } | null;
          };
        }) => ({
          id: item.id,
          executionBudgetItemId: item.executionBudgetItem.id,
          checked: item.checked,
          orderAmount: item.orderAmount?.toString() ?? null,
          name: item.executionBudgetItem.name,
          specification: item.executionBudgetItem.specification,
          unit: item.executionBudgetItem.unit,
          quantity: item.executionBudgetItem.quantity?.toString() ?? null,
          executionUnitPrice: item.executionBudgetItem.executionUnitPrice?.toString() ?? null,
          executionAmount: item.executionBudgetItem.executionAmount?.toString() ?? null,
        })
      );

      const totalExecutionAmount = this.calculateCheckedExecutionTotal(items);

      return {
        id: updated.id,
        executionBudgetId: updated.executionBudgetId,
        tradingPartnerId: updated.tradingPartnerId,
        tradingPartnerName: (updated as unknown as { tradingPartner: { name: string } })
          .tradingPartner.name,
        status: updated.status as string,
        confirmedAmount: updated.confirmedAmount?.toString() ?? null,
        version: updated.version,
        createdAt: updated.createdAt,
        updatedAt: updated.updatedAt,
        items,
        totalExecutionAmount,
      };
    });
  }

  /**
   * 発注を論理削除する
   *
   * 「発注前」「発注金額検討中」のみ許可し、「発注済」「発注取消」の場合はエラーを返却する。
   *
   * Requirements: 7.3, 7.4, 7.5
   *
   * @param orderId - 発注ID
   * @throws OrderNotFoundError 発注が存在しない場合
   * @throws OrderDeletionBlockedError 発注済/取消ステータスの場合
   */
  async delete(orderId: string): Promise<void> {
    // 1. 発注の存在チェック
    const existing = await this.prisma.order.findUnique({
      where: { id: orderId },
    });

    if (!existing || existing.deletedAt !== null) {
      throw new OrderNotFoundError();
    }

    // 2. ステータスチェック: 削除可能か確認
    if (!DELETABLE_STATUSES.includes(existing.status as (typeof DELETABLE_STATUSES)[number])) {
      throw new OrderDeletionBlockedError();
    }

    // 3. 論理削除
    await this.prisma.order.update({
      where: { id: orderId },
      data: { deletedAt: new Date() },
    });
  }

  /**
   * チェック済み項目の合計実行金額を計算する
   *
   * Requirements: 6.5
   *
   * @param items - 発注項目一覧
   * @returns チェック済み項目の合計実行金額
   * @private
   */
  private calculateCheckedExecutionTotal(items: OrderItemDetail[]): string {
    let total = new Decimal(0);
    for (const item of items) {
      if (item.checked && item.executionAmount) {
        total = total.add(new Decimal(item.executionAmount));
      }
    }
    return total.toFixed(0);
  }
}
