/**
 * 数量表機能関連のエラークラス
 *
 * Requirements:
 * - 2.4: 数量表を選択して削除操作を行う（確認後カスケード削除）
 * - 2.5: 数量表名を編集する（楽観的排他制御）
 * - 4.5: 数量グループの削除操作を行う
 * - 5.3: 必須フィールドが未入力で保存を試行する
 * - 5.4: 数量項目を選択して削除操作を行う
 *
 * @module errors/quantityTableError
 */
import { ApiError, NotFoundError } from './apiError.js';
import { PROBLEM_TYPES } from '../types/problem-details.js';

/**
 * 数量表が見つからないエラー
 */
export class QuantityTableNotFoundError extends NotFoundError {
  constructor(quantityTableId: string) {
    super(`数量表が見つかりません: ${quantityTableId}`, 'QUANTITY_TABLE_NOT_FOUND');
    this.name = 'QuantityTableNotFoundError';
  }
}

/**
 * 数量グループが見つからないエラー
 */
export class QuantityGroupNotFoundError extends NotFoundError {
  constructor(groupId: string) {
    super(`数量グループが見つかりません: ${groupId}`, 'QUANTITY_GROUP_NOT_FOUND');
    this.name = 'QuantityGroupNotFoundError';
  }
}

/**
 * 数量項目が見つからないエラー
 */
export class QuantityItemNotFoundError extends NotFoundError {
  constructor(itemId: string) {
    super(`数量項目が見つかりません: ${itemId}`, 'QUANTITY_ITEM_NOT_FOUND');
    this.name = 'QuantityItemNotFoundError';
  }
}

/**
 * プロジェクトが見つからない場合のエラー（数量表作成時）
 * 404 Not Found
 */
export class ProjectNotFoundForQuantityTableError extends NotFoundError {
  constructor(public readonly projectId: string) {
    super(`プロジェクトが見つかりません: ${projectId}`, 'PROJECT_NOT_FOUND');
    this.name = 'ProjectNotFoundForQuantityTableError';
  }
}

/**
 * 数量表競合エラー（楽観的排他制御エラー）
 * 409 Conflict
 *
 * Requirements: 2.5
 */
export class QuantityTableConflictError extends ApiError {
  constructor(message: string, conflictDetails?: Record<string, unknown>) {
    super(409, message, 'QUANTITY_TABLE_CONFLICT', conflictDetails, PROBLEM_TYPES.CONFLICT);
    this.name = 'QuantityTableConflictError';
  }
}

/**
 * 数量グループ競合エラー（楽観的排他制御エラー）
 * 409 Conflict
 */
export class QuantityGroupConflictError extends ApiError {
  constructor(message: string, conflictDetails?: Record<string, unknown>) {
    super(409, message, 'QUANTITY_GROUP_CONFLICT', conflictDetails, PROBLEM_TYPES.CONFLICT);
    this.name = 'QuantityGroupConflictError';
  }
}

/**
 * 数量項目競合エラー（楽観的排他制御エラー）
 * 409 Conflict
 */
export class QuantityItemConflictError extends ApiError {
  constructor(message: string, conflictDetails?: Record<string, unknown>) {
    super(409, message, 'QUANTITY_ITEM_CONFLICT', conflictDetails, PROBLEM_TYPES.CONFLICT);
    this.name = 'QuantityItemConflictError';
  }
}

/**
 * 数量表バリデーションエラー
 * 400 Bad Request
 *
 * Requirements: 5.3
 */
export class QuantityTableValidationError extends ApiError {
  constructor(
    message: string,
    public readonly validationErrors?: Record<string, string>
  ) {
    super(
      400,
      message,
      'QUANTITY_TABLE_VALIDATION_ERROR',
      validationErrors,
      PROBLEM_TYPES.VALIDATION_ERROR
    );
    this.name = 'QuantityTableValidationError';
  }
}

/**
 * 計算パラメータ不整合エラー
 * 400 Bad Request
 *
 * Requirements: 8.3, 8.4, 8.7, 8.10
 */
export class CalculationParamsError extends ApiError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(400, message, 'CALCULATION_PARAMS_ERROR', details, PROBLEM_TYPES.VALIDATION_ERROR);
    this.name = 'CalculationParamsError';
  }
}

/**
 * 計算警告（0以下の調整係数や負の値など）
 *
 * Requirements: 9.3, 9.4, 10.3, 10.4
 */
export interface CalculationWarning {
  field: string;
  message: string;
  value: number;
}
