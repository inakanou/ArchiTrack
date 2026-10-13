/**
 * 現場調査機能関連のエラークラス
 *
 * Requirements:
 * - 1.6: 同時編集による競合エラー（SiteSurveyConflictError）
 * - 1.7: プロジェクトが存在しない場合の現場調査作成不可エラー（ProjectNotFoundForSurveyError）
 * - 4.1: 画像ファイルの一時的なアクセスURL生成
 * - 14.4: 署名付きURLの有効期限とアクセス権限を検証
 *
 * @module errors/siteSurveyError
 */
import { ApiError, NotFoundError, ForbiddenError } from './apiError.js';
import { PROBLEM_TYPES } from '../types/problem-details.js';

/**
 * 現場調査が見つからないエラー
 */
export class SiteSurveyNotFoundError extends NotFoundError {
  constructor(surveyId: string) {
    super(`Site survey not found: ${surveyId}`, 'SITE_SURVEY_NOT_FOUND');
    this.name = 'SiteSurveyNotFoundError';
  }
}

/**
 * 現場調査画像が見つからないエラー
 *
 * 数量グループへ現調画像を紐付ける3経路（`PUT /api/quantity-tables/:id/save`、
 * `POST /api/quantity-tables/:quantityTableId/groups`、`PUT /api/quantity-groups/:id`）が
 * 404 へ写す。3経路は応答本文の全項目を揃えている（Task 86.2）。
 *
 * 文言は同じ検査の兄弟判定（所属違反・親の論理削除）と同じく日本語とし、生の画像IDを
 * 文言に含めない。画像IDは `surveyImageId` で持ち、各経路が応答本文の同名の項目へ写す。
 * 編集画面はこの項目で原因のグループを引き当てる（Task 86.5）。以前の文言は英語で
 * 画像IDを文言に含んでいた。
 */
export class SurveyImageNotFoundError extends NotFoundError {
  /** 見つからなかった現調画像のID */
  readonly surveyImageId: string;

  constructor(imageId: string) {
    super('現場調査画像が見つかりません', 'SURVEY_IMAGE_NOT_FOUND');
    this.name = 'SurveyImageNotFoundError';
    this.surveyImageId = imageId;
  }
}

/**
 * 現場調査画像へのアクセス権限がないエラー
 */
export class SurveyImageAccessDeniedError extends ForbiddenError {
  constructor(imageId: string, _userId: string) {
    super(`Access denied to survey image: ${imageId}`, 'SURVEY_IMAGE_ACCESS_DENIED');
    this.name = 'SurveyImageAccessDeniedError';
  }
}

/**
 * プロジェクト内の現場調査写真へのアクセス権限がないエラー
 *
 * プロジェクト内の写真をまとめて扱う経路は、写真ごと・現場調査ごとではなく
 * プロジェクト単位で1回だけ可否を判定する。判定が否であれば一覧そのものを返さない。
 *
 * Requirements (quantity-table-generation): 49.9
 */
export class ProjectSurveyImagesAccessDeniedError extends ForbiddenError {
  constructor(projectId: string, _userId: string) {
    super(
      `Access denied to project survey images: ${projectId}`,
      'PROJECT_SURVEY_IMAGES_ACCESS_DENIED'
    );
    this.name = 'ProjectSurveyImagesAccessDeniedError';
  }
}

/**
 * 署名付きURL生成エラー
 */
export class SignedUrlGenerationError extends ApiError {
  constructor(imageId: string, reason: string) {
    super(
      500,
      `Failed to generate signed URL for image ${imageId}: ${reason}`,
      'SIGNED_URL_GENERATION_FAILED',
      { imageId, reason },
      PROBLEM_TYPES.INTERNAL_SERVER_ERROR
    );
    this.name = 'SignedUrlGenerationError';
  }
}

/**
 * 画像アップロードエラー
 */
export class ImageUploadError extends ApiError {
  constructor(reason: string, details?: unknown) {
    super(
      500,
      `Image upload failed: ${reason}`,
      'IMAGE_UPLOAD_FAILED',
      details,
      PROBLEM_TYPES.INTERNAL_SERVER_ERROR
    );
    this.name = 'ImageUploadError';
  }
}

/**
 * 画像バリデーションエラー
 */
export class ImageValidationError extends ApiError {
  constructor(message: string, details?: unknown) {
    super(400, message, 'IMAGE_VALIDATION_ERROR', details, PROBLEM_TYPES.VALIDATION_ERROR);
    this.name = 'ImageValidationError';
  }
}

/**
 * 現場調査バリデーションエラー
 * 400 Bad Request
 */
export class SiteSurveyValidationError extends ApiError {
  constructor(public readonly validationErrors: Record<string, string>) {
    super(
      400,
      'Validation failed',
      'SITE_SURVEY_VALIDATION_ERROR',
      validationErrors,
      PROBLEM_TYPES.VALIDATION_ERROR
    );
    this.name = 'SiteSurveyValidationError';
  }
}

/**
 * 現場調査競合エラー（楽観的排他制御エラー）
 * 409 Conflict
 *
 * Requirements: 1.6
 */
export class SiteSurveyConflictError extends ApiError {
  constructor(message: string, conflictDetails?: Record<string, unknown>) {
    super(409, message, 'SITE_SURVEY_CONFLICT', conflictDetails, PROBLEM_TYPES.CONFLICT);
    this.name = 'SiteSurveyConflictError';
  }
}

/**
 * プロジェクトが見つからない場合のエラー（現場調査作成時）
 * 404 Not Found
 *
 * Requirements: 1.7
 */
export class ProjectNotFoundForSurveyError extends NotFoundError {
  constructor(public readonly projectId: string) {
    super(`Project not found: ${projectId}`, 'PROJECT_NOT_FOUND');
    this.name = 'ProjectNotFoundForSurveyError';
  }
}
