/**
 * 見積書機能関連のエラークラス
 *
 * Requirements (estimate-creation):
 * - REQ-11.4: 確認ダイアログを表示後に削除を実行する
 * - REQ-11.6: 楽観的排他制御により競合を検出する
 * - REQ-3.3: 内訳書を選択せずに作成した場合、空の見積書を作成する
 * - REQ-4.1: 指定した見積項目行の業者金額行に受領見積書の内容を転記する
 * - REQ-12.4: 親項目を削除した場合、子項目も含めて削除するか確認する
 *
 * Task 2.1: EstimateServiceの実装
 * Task 2.2: EstimateItemServiceの実装
 * Task 2.3: 受領見積書転記機能の実装
 *
 * @module errors/estimateError
 */
import { ApiError, NotFoundError } from './apiError.js';
import { PROBLEM_TYPES } from '../types/problem-details.js';

/**
 * 見積書が見つからないエラー
 * 404 Not Found
 */
export class EstimateNotFoundError extends NotFoundError {
  constructor(estimateId: string) {
    super(`見積書が見つかりません: ${estimateId}`, 'ESTIMATE_NOT_FOUND');
    this.name = 'EstimateNotFoundError';
  }
}

/**
 * 見積項目が見つからないエラー
 * 404 Not Found
 */
export class EstimateItemNotFoundError extends NotFoundError {
  constructor(estimateItemId: string) {
    super(`見積項目が見つかりません: ${estimateItemId}`, 'ESTIMATE_ITEM_NOT_FOUND');
    this.name = 'EstimateItemNotFoundError';
  }
}

/**
 * 見積書楽観的排他制御エラー
 * 409 Conflict
 *
 * Requirements: REQ-11.6
 */
export class EstimateConflictError extends ApiError {
  constructor(conflictDetails?: Record<string, unknown>) {
    super(
      409,
      '他のユーザーにより更新されました。画面を再読み込みしてください',
      'ESTIMATE_CONFLICT',
      conflictDetails,
      PROBLEM_TYPES.CONFLICT
    );
    this.name = 'EstimateConflictError';
  }
}

/**
 * 見積書名重複エラー
 * 409 Conflict
 */
export class DuplicateEstimateNameError extends ApiError {
  public readonly duplicateName: string;
  public readonly projectId: string;

  constructor(duplicateName: string, projectId: string) {
    super(
      409,
      '同名の見積書が既に存在します',
      'DUPLICATE_ESTIMATE_NAME',
      { name: duplicateName, projectId },
      PROBLEM_TYPES.CONFLICT
    );
    this.name = 'DuplicateEstimateNameError';
    this.duplicateName = duplicateName;
    this.projectId = projectId;
  }
}

/**
 * 見積項目に子項目が存在するエラー（削除時）
 * 422 Unprocessable Entity
 *
 * Requirements: REQ-12.4
 */
export class EstimateItemHasChildrenError extends ApiError {
  constructor(estimateItemId: string, childCount: number) {
    super(
      422,
      `見積項目に${childCount}件の子項目が存在します。子項目も含めて削除するか確認してください`,
      'ESTIMATE_ITEM_HAS_CHILDREN',
      { estimateItemId, childCount },
      PROBLEM_TYPES.BUSINESS_RULE_VIOLATION
    );
    this.name = 'EstimateItemHasChildrenError';
  }
}

/**
 * 受領見積書明細行が見つからないエラー
 * 404 Not Found
 */
export class ReceivedQuotationLineItemNotFoundError extends NotFoundError {
  constructor(lineItemId: string) {
    super(
      `受領見積書明細行が見つかりません: ${lineItemId}`,
      'RECEIVED_QUOTATION_LINE_ITEM_NOT_FOUND'
    );
    this.name = 'ReceivedQuotationLineItemNotFoundError';
  }
}

/**
 * 転記対象の見積項目が見積書に属していないエラー
 * 400 Bad Request
 */
export class EstimateItemNotBelongToEstimateError extends ApiError {
  constructor(estimateItemId: string, estimateId: string) {
    super(
      400,
      '指定された見積項目は対象の見積書に属していません',
      'ESTIMATE_ITEM_NOT_BELONG_TO_ESTIMATE',
      { estimateItemId, estimateId },
      PROBLEM_TYPES.VALIDATION_ERROR
    );
    this.name = 'EstimateItemNotBelongToEstimateError';
  }
}

/**
 * 内訳書が見つからないエラー（見積書作成時）
 * 404 Not Found
 */
export class ItemizedStatementNotFoundForEstimateError extends NotFoundError {
  constructor(public readonly itemizedStatementId: string) {
    super(`内訳書が見つかりません: ${itemizedStatementId}`, 'ITEMIZED_STATEMENT_NOT_FOUND');
    this.name = 'ItemizedStatementNotFoundForEstimateError';
  }
}

/**
 * 明細一括保存の検証エラー
 * 422 Unprocessable Entity
 *
 * design.md「Error Handling」の「保存前の検証NG（必須項目・循環参照・孤児ノード・件数上限）」に
 * 対応する。トランザクション開始前の全件検証で検出したため、書き込みは一切発生していない。
 *
 * Requirements (estimate-creation): 42.4, 42.8
 */
export class EstimateDraftValidationError extends ApiError {
  constructor(public readonly issues: readonly { path: string; message: string }[]) {
    super(
      422,
      '見積明細の入力内容に不備があるため保存できません',
      'ESTIMATE_DRAFT_VALIDATION_ERROR',
      { issues },
      PROBLEM_TYPES.VALIDATION_ERROR
    );
    this.name = 'EstimateDraftValidationError';
  }
}

/**
 * 明細一括保存のトランザクション制限時間超過エラー
 * 500 Internal Server Error
 *
 * Prisma のインタラクティブトランザクションが `timeout` または `maxWait` を超えると
 * `P2028` を投げる。これをそのまま流すと `errorHandler` の汎用 Prisma 分岐に落ちて
 * 400「Database operation failed」になり、利用者には「入力が悪いらしい」としか伝わらない。
 *
 * design.md「Error Handling / Error Strategy」の「トランザクション途中の失敗 → 500、
 * 全ロールバック」に合わせて 500 とし、メッセージで
 * 「制限時間内に完了しなかったこと」と「変更が一切保存されていないこと」を伝える。
 *
 * Requirements (estimate-creation): 42.1, 42.3
 * Task 57.6: 一括保存の上限件数とトランザクション制限時間の確定
 */
export class EstimateSaveTimeoutError extends ApiError {
  constructor(context: { timeoutMs: number; maxItems: number }) {
    super(
      500,
      '保存処理が制限時間内に完了しなかったため、変更は保存されていません。' +
        '見積書は保存前の状態のまま変更されていません。' +
        '明細の件数を減らして保存し直すか、時間をおいて再度お試しください',
      'ESTIMATE_SAVE_TIMEOUT',
      { timeoutMs: context.timeoutMs, maxItems: context.maxItems },
      PROBLEM_TYPES.INTERNAL_SERVER_ERROR
    );
    this.name = 'EstimateSaveTimeoutError';
  }
}

/**
 * 循環参照エラー（見積項目の親子関係）
 * 400 Bad Request
 */
export class EstimateItemCircularReferenceError extends ApiError {
  constructor(estimateItemId: string, targetParentId: string) {
    super(
      400,
      '循環参照が発生します。この親項目には設定できません',
      'ESTIMATE_ITEM_CIRCULAR_REFERENCE',
      { estimateItemId, targetParentId },
      PROBLEM_TYPES.VALIDATION_ERROR
    );
    this.name = 'EstimateItemCircularReferenceError';
  }
}
