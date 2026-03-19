/**
 * @fileoverview 契約書管理機能のカスタムエラークラス
 *
 * Requirements:
 * - 7.1: 作成時のバリデーションエラー
 * - 8.3: ステータス遷移エラー
 * - 9.2: 楽観的排他制御の競合エラー
 * - 12.1: 子契約存在時の削除拒否
 * - 12.2: 契約済ステータス時の削除拒否
 *
 * Design Reference: design.md - Error Handling セクション
 */

import { ApiError } from './apiError.js';
import { PROBLEM_TYPES } from '../types/problem-details.js';

/**
 * 契約書未検出エラー
 * 404 Not Found
 */
export class ContractNotFoundError extends ApiError {
  constructor(message?: string) {
    super(
      404,
      message || '契約書が見つかりません',
      'CONTRACT_NOT_FOUND',
      undefined,
      PROBLEM_TYPES.NOT_FOUND
    );
    this.name = 'ContractNotFoundError';
  }
}

/**
 * 契約書バリデーションエラー
 * 422 Unprocessable Entity
 */
export class ContractValidationError extends ApiError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(422, message, 'CONTRACT_VALIDATION_ERROR', details, PROBLEM_TYPES.VALIDATION_ERROR);
    this.name = 'ContractValidationError';
  }
}

/**
 * 契約書削除制約エラー
 * 422 Unprocessable Entity
 *
 * Requirements:
 * - 12.1: 子契約が存在する場合の削除拒否
 * - 12.2: ステータスが契約済の場合の削除拒否
 */
export class ContractDeletionConstraintError extends ApiError {
  constructor(message: string) {
    super(422, message, 'CONTRACT_DELETION_CONSTRAINT', undefined, PROBLEM_TYPES.VALIDATION_ERROR);
    this.name = 'ContractDeletionConstraintError';
  }
}

/**
 * 契約書競合エラー（楽観的排他制御エラー）
 * 409 Conflict
 *
 * Requirements:
 * - 9.2: version不一致時の競合エラー
 */
export class ContractConflictError extends ApiError {
  constructor(message?: string, conflictDetails?: Record<string, unknown>) {
    super(
      409,
      message || '他のユーザーによって更新されました。画面を更新してください',
      'CONTRACT_CONFLICT',
      conflictDetails,
      PROBLEM_TYPES.CONFLICT
    );
    this.name = 'ContractConflictError';
  }
}
