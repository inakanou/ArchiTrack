/**
 * @fileoverview 実行予算APIクライアント
 *
 * Task 8.1: 実行予算の作成・表示・削除UI実装
 * Task 8.2: 実行予算項目一覧のツリー表示と編集UI実装
 * Task 8.3: 発注一覧セクションと原価入力UI実装
 * Task 8.4: 月次締めUIと変更契約反映UI実装
 *
 * Requirements:
 * - REQ-1.1-1.7: 実行予算の作成
 * - REQ-2.1-2.3: 実行予算の削除
 * - REQ-3.1-3.10: 実行予算項目の一覧表示
 * - REQ-4.1-4.5: 実行予算項目の編集
 * - REQ-5.1-5.3: 発注一覧表示
 * - REQ-13.1-13.8: 原価管理
 * - REQ-14.1-14.5: 月次締め処理
 * - REQ-15.1-15.8: 契約変更への対応
 *
 * @module api/execution-budget
 */

import { apiClient } from './client';

// ============================================================================
// 型定義
// ============================================================================

/**
 * 発注ステータス
 */
export type OrderStatus = 'BEFORE_ORDER' | 'UNDER_REVIEW' | 'ORDERED' | 'CANCELLED';

/**
 * 変更ステータス
 */
export type AmendmentStatus = 'AMENDMENT_DELETED';

/**
 * 実行予算項目
 */
export interface ExecutionBudgetItem {
  id: string;
  executionBudgetId: string;
  estimateItemId: string | null;
  parentId: string | null;
  displayOrder: number;
  name: string | null;
  specification: string | null;
  unit: string | null;
  quantity: string | null;
  estimateUnitPrice: string | null;
  estimateAmount: string | null;
  executionUnitPrice: string | null;
  executionAmount: string | null;
  amendmentAmount: string;
  previousMonthExpense: string;
  currentMonthExpense: string;
  plannedVendorId: string | null;
  plannedVendorName: string | null;
  amendmentStatus: AmendmentStatus | null;
  remarks: string | null;
  createdAt: string;
  updatedAt: string;
  children?: ExecutionBudgetItem[];
  /** 発注関連情報（バックエンドで計算） */
  orderStatus: OrderStatus | null;
  orderAmount: string | null;
  /** 出来高関連情報 */
  progressAmount: string | null;
  progressRate: string | null;
}

/**
 * 実行予算
 */
export interface ExecutionBudget {
  id: string;
  projectId: string;
  contractId: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  contract: {
    id: string;
    contractDate: string;
    contractAmount: number;
    estimate: {
      id: string;
      name: string;
    } | null;
  };
}

/**
 * 実行予算（項目付き）
 */
export interface ExecutionBudgetWithItems extends ExecutionBudget {
  items: ExecutionBudgetItem[];
  summary: {
    totalEstimateAmount: string;
    totalExecutionAmount: string;
    totalAmendmentAmount: string;
    totalOrderAmount: string;
    totalExpense: string;
    totalRemainingBudget: string;
    totalProgressAmount: string;
    profitForecast: string;
    orderProgressRate: string;
  };
}

/**
 * 実行予算作成入力
 */
export interface CreateExecutionBudgetInput {
  contractId: string;
}

/**
 * 実行予算項目更新入力
 */
export interface UpdateExecutionBudgetItemInput {
  executionUnitPrice?: string;
  remarks?: string;
  version: number;
}

/**
 * 原価入力
 */
export interface UpdateCostInput {
  currentMonthExpense: string;
}

/**
 * 発注サマリー
 */
export interface OrderSummary {
  id: string;
  tradingPartnerName: string;
  status: OrderStatus;
  checkedItemCount: number;
  totalExecutionAmount: string;
  confirmedAmount: string | null;
  createdAt: string;
}

/**
 * 月次締め履歴
 */
export interface MonthlyCloseHistory {
  id: string;
  executionBudgetId: string;
  targetMonth: string;
  closedById: string;
  closedByName: string;
  closedAt: string;
}

/**
 * 月次締め入力
 */
export interface MonthlyCloseInput {
  targetMonth: string;
}

/**
 * 変更契約反映の差分情報
 */
export interface AmendmentDiff {
  contractId: string;
  contractName: string;
  addedItems: Array<{
    name: string;
    amount: string;
  }>;
  updatedItems: Array<{
    name: string;
    beforeAmount: string;
    afterAmount: string;
  }>;
  deletedItems: Array<{
    name: string;
    amount: string;
  }>;
  beforeContractAmount: number;
  afterContractAmount: number;
}

/**
 * 未反映変更契約
 */
export interface UnreflectedAmendment {
  id: string;
  contractDate: string;
  contractAmount: number;
  estimateName: string | null;
}

// ============================================================================
// 実行予算API
// ============================================================================

/**
 * 実行予算を取得（項目付き）
 */
export async function getExecutionBudget(
  projectId: string
): Promise<ExecutionBudgetWithItems | null> {
  try {
    return await apiClient.get<ExecutionBudgetWithItems>(
      `/api/projects/${projectId}/execution-budget`
    );
  } catch (error) {
    // 404の場合はnullを返す（実行予算が存在しない）
    if (error && typeof error === 'object' && 'statusCode' in error && error.statusCode === 404) {
      return null;
    }
    throw error;
  }
}

/**
 * 実行予算を作成
 */
export async function createExecutionBudget(
  projectId: string,
  input: CreateExecutionBudgetInput
): Promise<ExecutionBudgetWithItems> {
  return apiClient.post<ExecutionBudgetWithItems>(
    `/api/projects/${projectId}/execution-budget`,
    input
  );
}

/**
 * 実行予算を削除
 */
export async function deleteExecutionBudget(projectId: string): Promise<void> {
  await apiClient.delete(`/api/projects/${projectId}/execution-budget`);
}

/**
 * 実行予算項目を更新
 */
export async function updateExecutionBudgetItem(
  projectId: string,
  itemId: string,
  input: UpdateExecutionBudgetItemInput
): Promise<ExecutionBudgetItem> {
  return apiClient.patch<ExecutionBudgetItem>(
    `/api/projects/${projectId}/execution-budget/items/${itemId}`,
    input
  );
}

/**
 * 原価を入力
 */
export async function updateItemCost(
  projectId: string,
  itemId: string,
  input: UpdateCostInput
): Promise<ExecutionBudgetItem> {
  return apiClient.patch<ExecutionBudgetItem>(
    `/api/projects/${projectId}/execution-budget/items/${itemId}/cost`,
    input
  );
}

/**
 * 発注一覧を取得
 */
export async function getOrders(projectId: string): Promise<OrderSummary[]> {
  return apiClient.get<OrderSummary[]>(`/api/projects/${projectId}/execution-budget/orders`);
}

/**
 * 月次締めを実行
 */
export async function executeMonthlyClose(
  projectId: string,
  input: MonthlyCloseInput
): Promise<MonthlyCloseHistory> {
  return apiClient.post<MonthlyCloseHistory>(
    `/api/projects/${projectId}/execution-budget/monthly-close`,
    input
  );
}

/**
 * 月次締め履歴を取得
 */
export async function getMonthlyCloseHistory(projectId: string): Promise<MonthlyCloseHistory[]> {
  return apiClient.get<MonthlyCloseHistory[]>(
    `/api/projects/${projectId}/execution-budget/monthly-close`
  );
}

/**
 * 未反映変更契約一覧を取得
 */
export async function getUnreflectedAmendments(projectId: string): Promise<UnreflectedAmendment[]> {
  return apiClient.get<UnreflectedAmendment[]>(
    `/api/projects/${projectId}/execution-budget/unreflected-amendments`
  );
}

/**
 * 変更契約の差分を取得
 */
export async function getAmendmentDiff(
  projectId: string,
  contractId: string
): Promise<AmendmentDiff> {
  return apiClient.get<AmendmentDiff>(
    `/api/projects/${projectId}/execution-budget/amendment-diff/${contractId}`
  );
}

/**
 * 変更契約を反映
 */
export async function applyAmendment(
  projectId: string,
  contractId: string
): Promise<ExecutionBudgetWithItems> {
  return apiClient.post<ExecutionBudgetWithItems>(
    `/api/projects/${projectId}/execution-budget/apply-amendment`,
    { contractId }
  );
}
