/**
 * 現場調査機能関連のエラークラス
 *
 * Requirements:
 * - 4.1: 画像ファイルの一時的なアクセスURL生成
 * - 12.4: 署名付きURLの有効期限とアクセス権限を検証
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
 */
export class SurveyImageNotFoundError extends NotFoundError {
  constructor(imageId: string) {
    super(`Survey image not found: ${imageId}`, 'SURVEY_IMAGE_NOT_FOUND');
    this.name = 'SurveyImageNotFoundError';
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
