/**
 * 見積依頼機能関連のエラークラス
 *
 * Requirements:
 * - 3.8: 協力業者の取引先が存在しない場合
 * - 3.9: プロジェクトに内訳書が存在しない場合
 * - 4.13: 参照内訳書に項目が存在しない場合
 * - 5.3: 項目が1つも選択されていない場合
 * - 6.4, 6.5: 連絡先が未登録の場合
 * - 8.5: 楽観的排他制御エラー
 *
 * @module errors/estimateRequestError
 */
import { ApiError, NotFoundError } from './apiError.js';
import { PROBLEM_TYPES } from '../types/problem-details.js';

/**
 * 見積依頼が見つからないエラー
 * 404 Not Found
 */
export class EstimateRequestNotFoundError extends NotFoundError {
  constructor(estimateRequestId: string) {
    super(`見積依頼が見つかりません: ${estimateRequestId}`, 'ESTIMATE_REQUEST_NOT_FOUND');
    this.name = 'EstimateRequestNotFoundError';
  }
}

/**
 * 見積依頼楽観的排他制御エラー
 * 409 Conflict
 *
 * Requirements: 8.5
 */
export class EstimateRequestConflictError extends ApiError {
  constructor(conflictDetails?: Record<string, unknown>) {
    super(
      409,
      '他のユーザーにより更新されました。画面を再読み込みしてください',
      'ESTIMATE_REQUEST_CONFLICT',
      conflictDetails,
      PROBLEM_TYPES.CONFLICT
    );
    this.name = 'EstimateRequestConflictError';
  }
}

/**
 * 協力業者取引先が存在しないエラー
 * 422 Unprocessable Entity
 *
 * Requirements: 3.8
 */
export class NoSubcontractorTradingPartnerError extends ApiError {
  constructor() {
    super(
      422,
      '協力業者が登録されていません',
      'NO_SUBCONTRACTOR_TRADING_PARTNER',
      undefined,
      PROBLEM_TYPES.BUSINESS_RULE_VIOLATION
    );
    this.name = 'NoSubcontractorTradingPartnerError';
  }
}

/**
 * 取引先が協力業者ではないエラー
 * 422 Unprocessable Entity
 *
 * Requirements: 3.4
 */
export class TradingPartnerNotSubcontractorError extends ApiError {
  constructor(tradingPartnerId: string) {
    super(
      422,
      '指定された取引先は協力業者ではありません',
      'TRADING_PARTNER_NOT_SUBCONTRACTOR',
      { tradingPartnerId },
      PROBLEM_TYPES.BUSINESS_RULE_VIOLATION
    );
    this.name = 'TradingPartnerNotSubcontractorError';
  }
}

/**
 * プロジェクトに内訳書が存在しないエラー
 * 422 Unprocessable Entity
 *
 * Requirements: 3.9
 */
export class NoItemizedStatementInProjectError extends ApiError {
  constructor(projectId: string) {
    super(
      422,
      '内訳書が登録されていません',
      'NO_ITEMIZED_STATEMENT_IN_PROJECT',
      { projectId },
      PROBLEM_TYPES.BUSINESS_RULE_VIOLATION
    );
    this.name = 'NoItemizedStatementInProjectError';
  }
}

/**
 * 内訳書に項目がないエラー（見積依頼作成時）
 * 422 Unprocessable Entity
 *
 * Requirements: 4.13
 */
export class EmptyItemizedStatementItemsError extends ApiError {
  constructor(itemizedStatementId: string) {
    super(
      422,
      '内訳書に項目がありません',
      'EMPTY_ITEMIZED_STATEMENT_ITEMS',
      { itemizedStatementId },
      PROBLEM_TYPES.BUSINESS_RULE_VIOLATION
    );
    this.name = 'EmptyItemizedStatementItemsError';
  }
}

/**
 * 項目が選択されていないエラー（Excel出力時）
 * 422 Unprocessable Entity
 *
 * Requirements: 5.3
 */
export class NoItemsSelectedError extends ApiError {
  constructor(estimateRequestId: string) {
    super(
      422,
      '項目が選択されていません',
      'NO_ITEMS_SELECTED',
      { estimateRequestId },
      PROBLEM_TYPES.BUSINESS_RULE_VIOLATION
    );
    this.name = 'NoItemsSelectedError';
  }
}

/**
 * 連絡先未登録エラー（見積依頼文生成時）
 * 422 Unprocessable Entity
 *
 * Requirements: 6.4, 6.5
 */
export class MissingContactInfoError extends ApiError {
  constructor(
    public readonly contactType: 'email' | 'fax',
    public readonly tradingPartnerId: string
  ) {
    const message =
      contactType === 'email'
        ? 'メールアドレスが登録されていません'
        : 'FAX番号が登録されていません';
    super(
      422,
      message,
      'MISSING_CONTACT_INFO',
      { contactType, tradingPartnerId },
      PROBLEM_TYPES.BUSINESS_RULE_VIOLATION
    );
    this.name = 'MissingContactInfoError';
  }
}

/**
 * 見積依頼が紐付いている内訳書の削除制限エラー
 * 409 Conflict
 *
 * Requirements: 内訳書削除制約
 */
export class ItemizedStatementHasEstimateRequestsError extends ApiError {
  constructor(itemizedStatementId: string, estimateRequestCount: number) {
    super(
      409,
      'この内訳書は見積依頼で使用されているため、削除できません',
      'ITEMIZED_STATEMENT_HAS_ESTIMATE_REQUESTS',
      { itemizedStatementId, estimateRequestCount },
      PROBLEM_TYPES.CONFLICT
    );
    this.name = 'ItemizedStatementHasEstimateRequestsError';
  }
}
