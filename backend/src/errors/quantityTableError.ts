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
 * 楽観ロック失敗エラー（並行制御競合）
 * 409 Conflict
 *
 * Requirements: 38.10
 *
 * 数量グループのコピー処理など、`SELECT ... FOR UPDATE` による行ロックを
 * 用いる並行制御パスで、ロック取得失敗・タイムアウト、またはロック取得後に
 * 対象行（親数量表・元グループ）が削除済みであることを検出した場合に投げる。
 * API 層では 409 Conflict にマップする。
 */
export class OptimisticLockError extends ApiError {
  constructor(
    message = '並行操作との競合が発生しました。再試行してください。',
    details?: Record<string, unknown>
  ) {
    super(409, message, 'OPTIMISTIC_LOCK_ERROR', details, PROBLEM_TYPES.CONFLICT);
    this.name = 'OptimisticLockError';
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
 * 数量表の保存がロック待ちの上限を超えたエラー
 * 503 Service Unavailable
 *
 * Task 92.5。`saveDraft` は同一数量表への保存を直列化するため数量表の行を
 * `SELECT ... FOR UPDATE` で握る（Task 88.1）。先行の保存が長引くと後発はその行のロックを
 * 待つが、Task 92.2 の実測では待機に上限が無く、所要時間の上限を決めるのは先行の長さで
 * あった。Task 92.5 が `SET LOCAL lock_timeout` で待機を打ち切る上限を入れ、その打ち切りを
 * 本エラーで表す。
 *
 * 409（`QuantityTableConflictError`）と書き分けるのは、**上限超過の時点では誰も何も
 * 確定していない**ためである。先行が巻き戻った場合も後発は同じ上限超過になるので、
 * 「他の利用者が更新しました」は起きていない更新を告げる偽の案内になる（Task 92.2 の裁定）。
 * 一方、上限を入れた後は「混雑しており、時間をおけば解消する」が真になるため、
 * 恒久的な失敗（500）とは別のコードで表し、運用側が両者を見分けられるようにする。
 * 先例は `estimateError.ts` の `EstimateSaveTimeoutError`（500 / `ESTIMATE_SAVE_TIMEOUT`）だが、
 * あちらは「件数を減らさない限り再送しても成功しない」終局的な失敗であり、本エラーは
 * 時間をおけば解消する一時的な失敗なので、状態コードは 503 とする。
 */
export class QuantityTableSaveBusyError extends ApiError {
  constructor(lockTimeoutMs?: number) {
    super(
      503,
      '他の保存処理と競合したため保存できませんでした。時間をおいて再度お試しください。',
      'QUANTITY_TABLE_SAVE_BUSY',
      lockTimeoutMs === undefined ? undefined : { lockTimeoutMs },
      PROBLEM_TYPES.INTERNAL_SERVER_ERROR
    );
    this.name = 'QuantityTableSaveBusyError';
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
