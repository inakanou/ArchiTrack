/**
 * @fileoverview 工程表管理機能のカスタムエラークラス
 *
 * Requirements:
 * - 1.5: 工程表削除時の未検出エラー
 * - 5.4: 楽観的排他制御の競合エラー
 * - 2.3: 数量表バリデーションエラー
 *
 * Design Reference: design.md - Error Handling セクション
 */

import { ApiError } from './apiError.js';
import { PROBLEM_TYPES } from '../types/problem-details.js';

/**
 * 工程表未検出エラー
 * 404 Not Found
 */
export class ScheduleNotFoundError extends ApiError {
  constructor(message?: string) {
    super(
      404,
      message || '工程表が見つかりません',
      'SCHEDULE_NOT_FOUND',
      undefined,
      PROBLEM_TYPES.NOT_FOUND
    );
    this.name = 'ScheduleNotFoundError';
  }
}

/**
 * 工程表バリデーションエラー
 * 422 Unprocessable Entity
 */
export class ScheduleValidationError extends ApiError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(422, message, 'SCHEDULE_VALIDATION_ERROR', details, PROBLEM_TYPES.VALIDATION_ERROR);
    this.name = 'ScheduleValidationError';
  }
}

/**
 * 工程表競合エラー（楽観的排他制御エラー）
 * 409 Conflict
 */
export class ScheduleConflictError extends ApiError {
  constructor(message?: string, conflictDetails?: Record<string, unknown>) {
    super(
      409,
      message || '他のユーザーによって更新されました。画面を更新してください',
      'SCHEDULE_CONFLICT',
      conflictDetails,
      PROBLEM_TYPES.CONFLICT
    );
    this.name = 'ScheduleConflictError';
  }
}

/**
 * 項目数上限超過エラー（数量表からの作成）
 * 400 Bad Request
 *
 * 数量表から工程表を作成するとき、数量表の項目数が 1 つの工程表あたりの上限
 * （`MAX_SCHEDULE_ITEMS`）を超えている場合に投げる（Req 12.1）。
 * 422 の {@link ScheduleValidationError} とは別のクラスとし、ルートは捕まえずに
 * エラーハンドラーへ渡して Problem Details の 400 を返す。
 */
export class ScheduleItemLimitExceededError extends ApiError {
  constructor(message: string, details: { itemCount: number; maxItemCount: number }) {
    super(400, message, 'SCHEDULE_ITEMS_LIMIT_EXCEEDED', details, PROBLEM_TYPES.VALIDATION_ERROR);
    this.name = 'ScheduleItemLimitExceededError';
  }
}
