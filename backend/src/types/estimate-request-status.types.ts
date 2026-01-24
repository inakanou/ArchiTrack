/**
 * 見積依頼ステータス関連の型定義
 *
 * Requirements:
 * - 12.2: ステータスは「依頼前」「依頼済」「見積受領済」の3種類
 * - 12.11: ステータス変更履歴
 *
 * @module types/estimate-request-status.types
 */

/**
 * 見積依頼ステータス
 *
 * - BEFORE_REQUEST: 依頼前
 * - REQUESTED: 依頼済
 * - QUOTATION_RECEIVED: 見積受領済
 */
export type EstimateRequestStatus = 'BEFORE_REQUEST' | 'REQUESTED' | 'QUOTATION_RECEIVED';

/**
 * 許可されたステータス遷移情報
 */
export interface AllowedStatusTransition {
  status: EstimateRequestStatus;
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

/**
 * ステータス遷移結果
 */
export interface StatusTransitionResult {
  id: string;
  status: EstimateRequestStatus;
  updatedAt: Date;
}
