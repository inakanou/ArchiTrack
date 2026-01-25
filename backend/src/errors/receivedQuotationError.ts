/**
 * 受領見積書機能関連のエラークラス
 *
 * Requirements:
 * - 11.7: テキストとファイルの排他的選択
 * - 11.8: ファイル形式バリデーション
 * - 11.9: ファイルサイズバリデーション
 * - 11.10: バリデーションエラー表示
 * - 11.16: 楽観的排他制御エラー
 *
 * @module errors/receivedQuotationError
 */
import { ApiError, NotFoundError } from './apiError.js';
import { PROBLEM_TYPES } from '../types/problem-details.js';

/**
 * 受領見積書が見つからないエラー
 * 404 Not Found
 */
export class ReceivedQuotationNotFoundError extends NotFoundError {
  constructor(quotationId: string) {
    super(`受領見積書が見つかりません: ${quotationId}`, 'RECEIVED_QUOTATION_NOT_FOUND');
    this.name = 'ReceivedQuotationNotFoundError';
  }
}

/**
 * 受領見積書楽観的排他制御エラー
 * 409 Conflict
 *
 * Requirements: 11.16
 */
export class ReceivedQuotationConflictError extends ApiError {
  constructor(conflictDetails?: Record<string, unknown>) {
    super(
      409,
      '他のユーザーにより更新されました。画面を再読み込みしてください',
      'RECEIVED_QUOTATION_CONFLICT',
      conflictDetails,
      PROBLEM_TYPES.CONFLICT
    );
    this.name = 'ReceivedQuotationConflictError';
  }
}

/**
 * コンテンツタイプ不整合エラー
 * 422 Unprocessable Entity
 *
 * Requirements: 11.7
 */
export class InvalidContentTypeError extends ApiError {
  constructor(contentType: 'TEXT' | 'FILE', message?: string) {
    const defaultMessage =
      contentType === 'TEXT'
        ? 'テキストコンテンツを指定してください'
        : 'ファイルを指定してください';
    super(
      422,
      message ?? defaultMessage,
      'INVALID_CONTENT_TYPE',
      { contentType },
      PROBLEM_TYPES.BUSINESS_RULE_VIOLATION
    );
    this.name = 'InvalidContentTypeError';
  }
}

/**
 * ファイル形式エラー
 * 415 Unsupported Media Type
 *
 * Requirements: 11.8
 */
export class InvalidFileTypeError extends ApiError {
  constructor(providedMimeType: string, allowedMimeTypes: string[]) {
    super(
      415,
      'このファイル形式は許可されていません。PDF、Excel、または画像ファイルをアップロードしてください',
      'INVALID_FILE_TYPE',
      { providedMimeType, allowedMimeTypes },
      PROBLEM_TYPES.BUSINESS_RULE_VIOLATION
    );
    this.name = 'InvalidFileTypeError';
  }
}

/**
 * ファイルサイズ上限超過エラー
 * 413 Payload Too Large
 *
 * Requirements: 11.9
 */
export class FileSizeLimitExceededError extends ApiError {
  constructor(providedSize: number, maxSize: number) {
    super(
      413,
      `ファイルサイズが上限を超えています。最大サイズ: ${Math.round(maxSize / 1024 / 1024)}MB`,
      'FILE_SIZE_LIMIT_EXCEEDED',
      { providedSize, maxSize },
      PROBLEM_TYPES.BUSINESS_RULE_VIOLATION
    );
    this.name = 'FileSizeLimitExceededError';
  }
}

/**
 * ファイルプレビュー不可エラー
 * 422 Unprocessable Entity
 *
 * Requirements: 11.14
 */
export class FilePreviewNotAvailableError extends ApiError {
  constructor(quotationId: string) {
    super(
      422,
      'この受領見積書にはプレビュー可能なファイルがありません',
      'FILE_PREVIEW_NOT_AVAILABLE',
      { quotationId },
      PROBLEM_TYPES.BUSINESS_RULE_VIOLATION
    );
    this.name = 'FilePreviewNotAvailableError';
  }
}
