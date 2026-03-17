/**
 * @fileoverview 実行予算管理機能のカスタムエラークラス
 *
 * Requirements:
 * - 1.5: プロジェクトに対して実行予算を1つだけ作成可能
 * - 1.6: 既に実行予算が存在する場合のエラー
 *
 * Design Reference: design.md - Error Handling セクション
 */

import { ApiError } from './apiError.js';
import { PROBLEM_TYPES } from '../types/problem-details.js';

/**
 * 実行予算未検出エラー
 * 404 Not Found
 */
export class ExecutionBudgetNotFoundError extends ApiError {
  constructor(message?: string) {
    super(
      404,
      message || '実行予算が見つかりません',
      'EXECUTION_BUDGET_NOT_FOUND',
      undefined,
      PROBLEM_TYPES.NOT_FOUND
    );
    this.name = 'ExecutionBudgetNotFoundError';
  }
}

/**
 * 実行予算重複エラー
 * 409 Conflict - プロジェクトに対して既に実行予算が存在する場合
 */
export class ExecutionBudgetAlreadyExistsError extends ApiError {
  constructor(projectId: string) {
    super(
      409,
      'このプロジェクトには既に実行予算が存在します',
      'EXECUTION_BUDGET_ALREADY_EXISTS',
      { projectId },
      PROBLEM_TYPES.CONFLICT
    );
    this.name = 'ExecutionBudgetAlreadyExistsError';
  }
}

/**
 * 契約書未検出エラー（実行予算作成時）
 * 404 Not Found
 */
export class ContractNotFoundForBudgetError extends ApiError {
  constructor(contractId: string) {
    super(
      404,
      '指定された契約書が見つかりません',
      'CONTRACT_NOT_FOUND_FOR_BUDGET',
      { contractId },
      PROBLEM_TYPES.NOT_FOUND
    );
    this.name = 'ContractNotFoundForBudgetError';
  }
}

/**
 * 実行予算競合エラー（楽観的排他制御エラー）
 * 409 Conflict
 */
export class ExecutionBudgetConflictError extends ApiError {
  constructor(message?: string, conflictDetails?: Record<string, unknown>) {
    super(
      409,
      message || '他のユーザーによって更新されました。画面を更新してください',
      'EXECUTION_BUDGET_CONFLICT',
      conflictDetails,
      PROBLEM_TYPES.CONFLICT
    );
    this.name = 'ExecutionBudgetConflictError';
  }
}

/**
 * 実行予算削除不可エラー（発注済み発注が存在する場合）
 * 422 Unprocessable Entity
 */
export class ExecutionBudgetDeletionBlockedError extends ApiError {
  constructor() {
    super(
      422,
      '発注済みの発注が存在するため、実行予算を削除できません',
      'EXECUTION_BUDGET_DELETION_BLOCKED',
      undefined,
      PROBLEM_TYPES.BUSINESS_RULE_VIOLATION
    );
    this.name = 'ExecutionBudgetDeletionBlockedError';
  }
}
