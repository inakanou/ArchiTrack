/**
 * 内訳書機能関連のエラークラス
 *
 * Requirements:
 * - 1.9: 選択された数量表の項目数が0件の場合、エラーメッセージを表示し作成を中止する
 * - 1.10: 同一プロジェクト内に同名の内訳書が既に存在する場合、エラーメッセージを表示し作成を中止する
 * - 2.5: 数量の合計結果が許容範囲を超える場合、オーバーフローエラーを発生させる
 * - 10.3: 楽観的排他制御エラー（updatedAtが一致しない場合）
 *
 * @module errors/itemizedStatementError
 */
import { ApiError, NotFoundError } from './apiError.js';
import { PROBLEM_TYPES } from '../types/problem-details.js';

/**
 * 内訳書が見つからないエラー
 * 404 Not Found
 */
export class ItemizedStatementNotFoundError extends NotFoundError {
  constructor(itemizedStatementId: string) {
    super(`内訳書が見つかりません: ${itemizedStatementId}`, 'ITEMIZED_STATEMENT_NOT_FOUND');
    this.name = 'ItemizedStatementNotFoundError';
  }
}

/**
 * 数量表が見つからないエラー（内訳書作成時）
 * 404 Not Found
 */
export class QuantityTableNotFoundForItemizedStatementError extends NotFoundError {
  constructor(public readonly quantityTableId: string) {
    super(`数量表が見つかりません: ${quantityTableId}`, 'QUANTITY_TABLE_NOT_FOUND');
    this.name = 'QuantityTableNotFoundForItemizedStatementError';
  }
}

/**
 * 数量表に項目がないエラー
 * 400 Bad Request
 *
 * Requirements: 1.9
 */
export class EmptyQuantityItemsError extends ApiError {
  constructor(public readonly quantityTableId: string) {
    super(
      400,
      '選択された数量表に項目がありません',
      'EMPTY_QUANTITY_ITEMS',
      { quantityTableId },
      PROBLEM_TYPES.VALIDATION_ERROR
    );
    this.name = 'EmptyQuantityItemsError';
  }
}

/**
 * 内訳書名重複エラー
 * 409 Conflict
 *
 * Requirements: 1.10
 */
export class DuplicateItemizedStatementNameError extends ApiError {
  public readonly duplicateName: string;
  public readonly projectId: string;

  constructor(duplicateName: string, projectId: string) {
    super(
      409,
      '同名の内訳書が既に存在します',
      'DUPLICATE_ITEMIZED_STATEMENT_NAME',
      { name: duplicateName, projectId },
      PROBLEM_TYPES.CONFLICT
    );
    this.name = 'DuplicateItemizedStatementNameError';
    this.duplicateName = duplicateName;
    this.projectId = projectId;
  }
}

/**
 * 数量オーバーフローエラー
 * 422 Unprocessable Entity
 *
 * Requirements: 2.5
 */
export class QuantityOverflowError extends ApiError {
  constructor(
    public readonly actualValue: string,
    public readonly minAllowed: string = '-999999.99',
    public readonly maxAllowed: string = '9999999.99'
  ) {
    super(
      422,
      `数量の合計が許容範囲を超えています（許容範囲: ${minAllowed} 〜 ${maxAllowed}、実際の値: ${actualValue}）`,
      'QUANTITY_OVERFLOW',
      { actualValue, minAllowed, maxAllowed },
      PROBLEM_TYPES.BUSINESS_RULE_VIOLATION
    );
    this.name = 'QuantityOverflowError';
  }
}

/**
 * 内訳書楽観的排他制御エラー
 * 409 Conflict
 *
 * Requirements: 10.3
 */
export class ItemizedStatementConflictError extends ApiError {
  constructor(conflictDetails?: Record<string, unknown>) {
    super(
      409,
      '他のユーザーにより更新されました。画面を再読み込みしてください',
      'ITEMIZED_STATEMENT_CONFLICT',
      conflictDetails,
      PROBLEM_TYPES.CONFLICT
    );
    this.name = 'ItemizedStatementConflictError';
  }
}

/**
 * 内訳書項目数上限超過エラー
 * 422 Unprocessable Entity
 */
export class ItemizedStatementItemLimitExceededError extends ApiError {
  constructor(
    public readonly actualCount: number,
    public readonly maxLimit: number = 2000
  ) {
    super(
      422,
      `内訳項目数が上限を超えています（上限: ${maxLimit}件、実際: ${actualCount}件）`,
      'ITEMIZED_STATEMENT_ITEM_LIMIT_EXCEEDED',
      { actualCount, maxLimit },
      PROBLEM_TYPES.BUSINESS_RULE_VIOLATION
    );
    this.name = 'ItemizedStatementItemLimitExceededError';
  }
}
