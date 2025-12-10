/**
 * @fileoverview 取引先管理機能のカスタムエラークラス
 *
 * Requirements:
 * - 2.11: 同一の取引先名が既に存在する場合のエラー（DuplicatePartnerNameError）
 * - 4.8: 別の取引先と重複する取引先名に変更しようとした場合のエラー（DuplicatePartnerNameError）
 * - 4.10: 楽観的排他制御で競合が検出された場合のエラー（TradingPartnerConflictError）
 * - 5.5: 取引先がプロジェクトに紐付いている場合の削除拒否エラー（PartnerInUseError）
 * - 8.1, 8.2: ネットワークエラー、サーバーエラー時の適切なエラー表示
 */

import { ApiError } from './apiError.js';
import { PROBLEM_TYPES } from '../types/problem-details.js';

/**
 * 取引先が見つからない場合のエラー
 * 404 Not Found
 */
export class TradingPartnerNotFoundError extends ApiError {
  constructor(public readonly partnerId: string) {
    super(
      404,
      `取引先が見つかりません: ${partnerId}`,
      'TRADING_PARTNER_NOT_FOUND',
      { partnerId },
      PROBLEM_TYPES.NOT_FOUND
    );
    this.name = 'TradingPartnerNotFoundError';
  }
}

/**
 * 取引先バリデーションエラー
 * 400 Bad Request
 */
export class TradingPartnerValidationError extends ApiError {
  constructor(public readonly validationErrors: Record<string, string>) {
    super(
      400,
      'バリデーションに失敗しました',
      'TRADING_PARTNER_VALIDATION_ERROR',
      validationErrors,
      PROBLEM_TYPES.VALIDATION_ERROR
    );
    this.name = 'TradingPartnerValidationError';
  }
}

/**
 * 取引先名重複エラー
 * 409 Conflict
 */
export class DuplicatePartnerNameError extends ApiError {
  constructor(public readonly partnerName: string) {
    super(
      409,
      'この取引先名は既に登録されています',
      'DUPLICATE_PARTNER_NAME',
      { name: partnerName },
      PROBLEM_TYPES.CONFLICT
    );
    this.name = 'DuplicatePartnerNameError';
  }
}

/**
 * プロジェクト紐付け中の削除拒否エラー
 * 409 Conflict
 */
export class PartnerInUseError extends ApiError {
  constructor(
    public readonly partnerId: string,
    projectIds?: string[]
  ) {
    const details: Record<string, unknown> = { partnerId };
    if (projectIds && projectIds.length > 0) {
      details.projectIds = projectIds;
    }

    super(
      409,
      'この取引先は現在プロジェクトに使用されているため削除できません',
      'PARTNER_IN_USE',
      details,
      PROBLEM_TYPES.CONFLICT
    );
    this.name = 'PartnerInUseError';
  }
}

/**
 * 取引先競合エラー（楽観的排他制御エラー）
 * 409 Conflict
 */
export class TradingPartnerConflictError extends ApiError {
  constructor(message?: string, conflictDetails?: Record<string, unknown>) {
    super(
      409,
      message || '他のユーザーによって更新されました。画面を更新してください',
      'TRADING_PARTNER_CONFLICT',
      conflictDetails,
      PROBLEM_TYPES.CONFLICT
    );
    this.name = 'TradingPartnerConflictError';
  }
}
