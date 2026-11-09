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

/**
 * ファイルまたは明細行必須エラー
 * 400 Bad Request
 *
 * Requirements: 11.22, 11.24
 */
export class FileOrLineItemsRequiredError extends ApiError {
  constructor() {
    super(
      400,
      'ファイルのアップロードまたは明細行データの入力が必要です',
      'FILE_OR_LINE_ITEMS_REQUIRED',
      {},
      PROBLEM_TYPES.VALIDATION_ERROR
    );
    this.name = 'FileOrLineItemsRequiredError';
  }
}

/**
 * 同じ原本の二重登録の誤りの文言（estimate-request の Requirement 48.3）
 */
export const DUPLICATE_ORIGINAL_MESSAGE = '同じ原本の受領見積書が既に登録されています';

/**
 * 同じ原本の二重登録の誤りが示す既存の受領見積書（48.3）。提出日は ISO 8601 の文字列
 */
export interface DuplicateOriginalExisting {
  name: string;
  vendorName: string;
  submittedAt: string;
}

/**
 * 同じ案件に、原本の指紋と見積の区別がともに同じ受領見積書が既にあるエラー
 * 409 Conflict（`code: 'DUPLICATE_ORIGINAL'`）
 *
 * design の Requirements 43-50 の章の D6、タスク113.4。既存の受領見積書の名前・業者名・提出日を持つ。
 * 同じ案件の受領見積書だけを示し、他の案件の受領見積書の有無は含めない（48.7）
 */
export class DuplicateOriginalError extends ApiError {
  readonly existing: DuplicateOriginalExisting;

  constructor(existing: DuplicateOriginalExisting) {
    super(
      409,
      DUPLICATE_ORIGINAL_MESSAGE,
      'DUPLICATE_ORIGINAL',
      { existing },
      PROBLEM_TYPES.CONFLICT
    );
    this.name = 'DuplicateOriginalError';
    this.existing = existing;
  }
}
