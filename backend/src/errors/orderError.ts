/**
 * @fileoverview 発注管理機能のカスタムエラークラス
 *
 * Requirements:
 * - 5.1-5.3: 発注一覧表示
 * - 6.1-6.8: 発注の作成と取引先指定
 * - 7.1-7.5: 発注の編集と削除
 *
 * Design Reference: design.md - Error Handling セクション
 */

import { ApiError } from './apiError.js';
import { PROBLEM_TYPES } from '../types/problem-details.js';

/**
 * 発注未検出エラー
 * 404 Not Found
 */
export class OrderNotFoundError extends ApiError {
  constructor(message?: string) {
    super(
      404,
      message || '発注が見つかりません',
      'ORDER_NOT_FOUND',
      undefined,
      PROBLEM_TYPES.NOT_FOUND
    );
    this.name = 'OrderNotFoundError';
  }
}

/**
 * 発注編集不可エラー（発注済ステータスでの編集禁止）
 * 422 Unprocessable Entity
 */
export class OrderEditBlockedError extends ApiError {
  constructor(message?: string) {
    super(
      422,
      message || '発注済みの発注は編集できません。取消のみ可能です',
      'ORDER_EDIT_BLOCKED',
      undefined,
      PROBLEM_TYPES.BUSINESS_RULE_VIOLATION
    );
    this.name = 'OrderEditBlockedError';
  }
}

/**
 * 発注削除不可エラー（発注済ステータスでの削除禁止）
 * 422 Unprocessable Entity
 */
export class OrderDeletionBlockedError extends ApiError {
  constructor(message?: string) {
    super(
      422,
      message || '発注済みの発注は削除できません',
      'ORDER_DELETION_BLOCKED',
      undefined,
      PROBLEM_TYPES.BUSINESS_RULE_VIOLATION
    );
    this.name = 'OrderDeletionBlockedError';
  }
}

/**
 * 実行予算未検出エラー（発注作成時）
 * 404 Not Found
 */
export class ExecutionBudgetNotFoundForOrderError extends ApiError {
  constructor(message?: string) {
    super(
      404,
      message || '実行予算が見つかりません',
      'EXECUTION_BUDGET_NOT_FOUND_FOR_ORDER',
      undefined,
      PROBLEM_TYPES.NOT_FOUND
    );
    this.name = 'ExecutionBudgetNotFoundForOrderError';
  }
}
