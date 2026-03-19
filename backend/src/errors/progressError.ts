/**
 * @fileoverview 出来高管理機能のカスタムエラークラス
 *
 * Requirements:
 * - 11.1-11.11: 出来高入力機能
 * - 12.1-12.7: 出来高の履歴管理
 *
 * Design Reference: design.md - Error Handling セクション
 */

import { ApiError } from './apiError.js';
import { PROBLEM_TYPES } from '../types/problem-details.js';

/**
 * 出来高レコード未検出エラー
 * 404 Not Found
 */
export class ProgressRecordNotFoundError extends ApiError {
  constructor(message?: string) {
    super(
      404,
      message || '出来高レコードが見つかりません',
      'PROGRESS_RECORD_NOT_FOUND',
      undefined,
      PROBLEM_TYPES.NOT_FOUND
    );
    this.name = 'ProgressRecordNotFoundError';
  }
}

/**
 * 実行予算未検出エラー（出来高操作時）
 * 404 Not Found
 */
export class ExecutionBudgetNotFoundForProgressError extends ApiError {
  constructor(message?: string) {
    super(
      404,
      message || '実行予算が見つかりません',
      'EXECUTION_BUDGET_NOT_FOUND_FOR_PROGRESS',
      undefined,
      PROBLEM_TYPES.NOT_FOUND
    );
    this.name = 'ExecutionBudgetNotFoundForProgressError';
  }
}

/**
 * 出来高金額バリデーションエラー（0円未満）
 * 400 Bad Request
 */
export class ProgressAmountNegativeError extends ApiError {
  constructor(message?: string) {
    super(
      400,
      message || '出来高金額は0円以上で入力してください',
      'PROGRESS_AMOUNT_NEGATIVE',
      undefined,
      PROBLEM_TYPES.VALIDATION_ERROR
    );
    this.name = 'ProgressAmountNegativeError';
  }
}
