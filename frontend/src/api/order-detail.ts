/**
 * @fileoverview 発注詳細APIクライアント
 *
 * Task 9.1: 発注の作成・編集・削除UI実装
 * Task 9.2: 発注エクスポートUI実装
 *
 * Requirements:
 * - REQ-6.1-6.8: 発注の作成と取引先指定
 * - REQ-7.1-7.5: 発注の編集と削除
 * - REQ-8.1-8.9: 発注金額の確定と案分
 * - REQ-10.1-10.4: 発注一覧のエクスポート
 *
 * @module api/order-detail
 */

import { apiClient } from './client';
import type { OrderStatus } from './execution-budget';

// ============================================================================
// 型定義
// ============================================================================

/**
 * 発注項目に含まれる実行予算項目の情報
 */
export interface OrderItemBudgetInfo {
  id: string;
  name: string | null;
  specification: string | null;
  unit: string | null;
  quantity: string | null;
  executionUnitPrice: string | null;
  executionAmount: string | null;
  plannedVendorId: string | null;
  plannedVendorName: string | null;
}

/**
 * 発注項目
 */
export interface OrderItem {
  id: string;
  orderId: string;
  executionBudgetItemId: string;
  checked: boolean;
  orderAmount: string | null;
  executionBudgetItem: OrderItemBudgetInfo;
}

/**
 * 発注詳細（項目付き）
 */
export interface OrderWithItems {
  id: string;
  executionBudgetId: string;
  tradingPartnerId: string;
  tradingPartnerName: string;
  status: OrderStatus;
  confirmedAmount: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  items: OrderItem[];
  totalExecutionAmount: string;
  checkedItemCount: number;
}

/**
 * 発注作成入力
 */
export interface CreateOrderInput {
  tradingPartnerId: string;
}

/**
 * 発注更新入力
 */
export interface UpdateOrderInput {
  tradingPartnerId?: string;
  confirmedAmount?: string;
}

/**
 * 発注項目更新入力
 */
export interface UpdateOrderItemsInput {
  itemIds: string[];
}

/**
 * 発注ステータス変更入力
 */
export interface UpdateOrderStatusInput {
  status: OrderStatus;
  confirmedAmount?: string;
}

/**
 * エクスポート形式
 */
export type ExportFormat = 'xlsx' | 'pdf';

// ============================================================================
// 発注詳細API
// ============================================================================

/**
 * 発注詳細を取得
 */
export async function getOrderDetail(projectId: string, orderId: string): Promise<OrderWithItems> {
  return apiClient.get<OrderWithItems>(
    `/api/projects/${projectId}/execution-budget/orders/${orderId}`
  );
}

/**
 * 発注を作成
 */
export async function createOrder(
  projectId: string,
  input: CreateOrderInput
): Promise<OrderWithItems> {
  return apiClient.post<OrderWithItems>(
    `/api/projects/${projectId}/execution-budget/orders`,
    input
  );
}

/**
 * 発注を更新（取引先変更、確定発注金額変更）
 */
export async function updateOrder(
  projectId: string,
  orderId: string,
  input: UpdateOrderInput
): Promise<OrderWithItems> {
  return apiClient.patch<OrderWithItems>(
    `/api/projects/${projectId}/execution-budget/orders/${orderId}`,
    input
  );
}

/**
 * 発注項目を更新（チェック状態の変更）
 */
export async function updateOrderItems(
  projectId: string,
  orderId: string,
  input: UpdateOrderItemsInput
): Promise<OrderWithItems> {
  return apiClient.put<OrderWithItems>(
    `/api/projects/${projectId}/execution-budget/orders/${orderId}/items`,
    input
  );
}

/**
 * 発注ステータスを変更
 */
export async function updateOrderStatus(
  projectId: string,
  orderId: string,
  input: UpdateOrderStatusInput
): Promise<OrderWithItems> {
  return apiClient.patch<OrderWithItems>(
    `/api/projects/${projectId}/execution-budget/orders/${orderId}/status`,
    input
  );
}

/**
 * 発注を削除
 */
export async function deleteOrder(projectId: string, orderId: string): Promise<void> {
  await apiClient.delete(`/api/projects/${projectId}/execution-budget/orders/${orderId}`);
}

/**
 * 発注をエクスポート
 * REQ-10.1-10.4: 発注一覧のエクスポート
 */
export async function exportOrder(
  projectId: string,
  orderId: string,
  format: ExportFormat
): Promise<Blob> {
  return apiClient.get<Blob>(
    `/api/projects/${projectId}/execution-budget/orders/${orderId}/export?format=${format}`
  );
}
