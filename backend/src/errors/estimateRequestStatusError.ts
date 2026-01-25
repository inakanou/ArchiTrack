/**
 * 見積依頼ステータス機能関連のエラークラス
 *
 * Requirements:
 * - 12.7: 依頼済から依頼前への遷移は不可
 * - 12.9, 12.10: 無効なステータス遷移の拒否
 *
 * @module errors/estimateRequestStatusError
 */
import { ApiError, NotFoundError } from './apiError.js';
import { PROBLEM_TYPES } from '../types/problem-details.js';
import type { EstimateRequestStatus } from '../types/estimate-request-status.types.js';

/**
 * 見積依頼ステータスが見つからないエラー
 * 404 Not Found
 */
export class EstimateRequestStatusNotFoundError extends NotFoundError {
  constructor(estimateRequestId: string) {
    super(`見積依頼が見つかりません: ${estimateRequestId}`, 'ESTIMATE_REQUEST_STATUS_NOT_FOUND');
    this.name = 'EstimateRequestStatusNotFoundError';
  }
}

/**
 * 許可された遷移情報
 */
export interface AllowedStatusTransition {
  status: EstimateRequestStatus;
}

/**
 * 無効なステータス遷移エラー
 * 400 Bad Request
 *
 * Requirements: 12.7, 12.9, 12.10
 */
export class InvalidEstimateRequestStatusTransitionError extends ApiError {
  constructor(
    fromStatus: EstimateRequestStatus,
    toStatus: EstimateRequestStatus,
    allowedTransitions: AllowedStatusTransition[]
  ) {
    const allowedStatusList =
      allowedTransitions.length > 0 ? allowedTransitions.map((t) => t.status).join(', ') : 'なし';

    super(
      400,
      `「${fromStatus}」から「${toStatus}」への遷移は許可されていません。許可された遷移先: ${allowedStatusList}`,
      'INVALID_STATUS_TRANSITION',
      {
        fromStatus,
        toStatus,
        allowedTransitions: allowedTransitions.map((t) => t.status),
      },
      PROBLEM_TYPES.BUSINESS_RULE_VIOLATION
    );
    this.name = 'InvalidEstimateRequestStatusTransitionError';
  }
}
