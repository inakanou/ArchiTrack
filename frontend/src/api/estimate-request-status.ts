/**
 * @fileoverview ステータス管理APIクライアント
 *
 * Task 17.2: ステータス管理APIクライアントの実装
 *
 * Requirements:
 * - 12.9: ステータス遷移
 * - 12.11: ステータス変更履歴
 */

import { apiClient } from './client';

// ============================================================================
// 型定義
// ============================================================================

/**
 * 見積依頼ステータス
 */
export type EstimateRequestStatus = 'BEFORE_REQUEST' | 'REQUESTED' | 'QUOTATION_RECEIVED';

/**
 * ステータス遷移結果
 */
export interface StatusTransitionResult {
  id: string;
  status: EstimateRequestStatus;
  updatedAt: Date;
}

/**
 * ステータス変更履歴
 */
export interface EstimateRequestStatusHistory {
  id: string;
  estimateRequestId: string;
  fromStatus: EstimateRequestStatus | null;
  toStatus: EstimateRequestStatus;
  changedById: string;
  changedAt: Date;
  changedBy?: {
    id: string;
    displayName: string;
  };
}

// ============================================================================
// APIクライアント関数
// ============================================================================

/**
 * ステータスを遷移する
 *
 * @param estimateRequestId - 見積依頼ID
 * @param newStatus - 新しいステータス
 * @returns ステータス遷移結果
 */
export async function transitionStatus(
  estimateRequestId: string,
  newStatus: EstimateRequestStatus
): Promise<StatusTransitionResult> {
  const response = await apiClient.patch<StatusTransitionResult>(
    `/api/estimate-requests/${estimateRequestId}/status`,
    { status: newStatus }
  );
  return {
    ...response,
    updatedAt: new Date(response.updatedAt),
  };
}

/**
 * ステータス変更履歴を取得する
 *
 * @param estimateRequestId - 見積依頼ID
 * @returns ステータス変更履歴一覧
 */
export async function getStatusHistory(
  estimateRequestId: string
): Promise<EstimateRequestStatusHistory[]> {
  const response = await apiClient.get<EstimateRequestStatusHistory[]>(
    `/api/estimate-requests/${estimateRequestId}/status-history`
  );
  return response.map((h) => ({
    ...h,
    changedAt: new Date(h.changedAt),
  }));
}

// ============================================================================
// ヘルパー関数
// ============================================================================

/**
 * ステータスの日本語表示名を取得する
 */
export function getStatusLabel(status: EstimateRequestStatus): string {
  const labels: Record<EstimateRequestStatus, string> = {
    BEFORE_REQUEST: '依頼前',
    REQUESTED: '依頼済',
    QUOTATION_RECEIVED: '見積受領済',
  };
  return labels[status];
}

/**
 * 次のステータス遷移先を取得する
 */
export function getAllowedTransitions(
  currentStatus: EstimateRequestStatus
): EstimateRequestStatus[] {
  const transitions: Record<EstimateRequestStatus, EstimateRequestStatus[]> = {
    BEFORE_REQUEST: ['REQUESTED'],
    REQUESTED: ['QUOTATION_RECEIVED'],
    QUOTATION_RECEIVED: ['REQUESTED'],
  };
  return transitions[currentStatus] || [];
}
