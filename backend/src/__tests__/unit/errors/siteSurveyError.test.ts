/**
 * 現場調査関連エラークラスのテスト
 *
 * Requirements: 4.1, 12.4
 */
import { describe, it, expect } from 'vitest';
import {
  SiteSurveyNotFoundError,
  SurveyImageNotFoundError,
  SurveyImageAccessDeniedError,
  SignedUrlGenerationError,
  ImageUploadError,
  ImageValidationError,
} from '../../../errors/siteSurveyError.js';

describe('SiteSurveyError', () => {
  describe('SiteSurveyNotFoundError', () => {
    it('should create error with survey ID in message', () => {
      const surveyId = 'test-survey-id';
      const error = new SiteSurveyNotFoundError(surveyId);

      expect(error.message).toBe(`Site survey not found: ${surveyId}`);
      expect(error.statusCode).toBe(404);
      expect(error.code).toBe('SITE_SURVEY_NOT_FOUND');
      expect(error.name).toBe('SiteSurveyNotFoundError');
    });
  });

  describe('SurveyImageNotFoundError', () => {
    it('should create error with image ID in message', () => {
      const imageId = 'test-image-id';
      const error = new SurveyImageNotFoundError(imageId);

      expect(error.message).toBe(`Survey image not found: ${imageId}`);
      expect(error.statusCode).toBe(404);
      expect(error.code).toBe('SURVEY_IMAGE_NOT_FOUND');
      expect(error.name).toBe('SurveyImageNotFoundError');
    });
  });

  describe('SurveyImageAccessDeniedError', () => {
    it('should create error with image ID in message', () => {
      const imageId = 'test-image-id';
      const userId = 'test-user-id';
      const error = new SurveyImageAccessDeniedError(imageId, userId);

      expect(error.message).toBe(`Access denied to survey image: ${imageId}`);
      expect(error.statusCode).toBe(403);
      expect(error.code).toBe('SURVEY_IMAGE_ACCESS_DENIED');
      expect(error.name).toBe('SurveyImageAccessDeniedError');
    });
  });

  describe('SignedUrlGenerationError', () => {
    it('should create error with image ID and reason', () => {
      const imageId = 'test-image-id';
      const reason = 'S3 connection failed';
      const error = new SignedUrlGenerationError(imageId, reason);

      expect(error.message).toBe(`Failed to generate signed URL for image ${imageId}: ${reason}`);
      expect(error.statusCode).toBe(500);
      expect(error.code).toBe('SIGNED_URL_GENERATION_FAILED');
      expect(error.name).toBe('SignedUrlGenerationError');
      expect(error.details).toEqual({ imageId, reason });
    });
  });

  describe('ImageUploadError', () => {
    it('should create error with reason', () => {
      const reason = 'File too large';
      const error = new ImageUploadError(reason);

      expect(error.message).toBe(`Image upload failed: ${reason}`);
      expect(error.statusCode).toBe(500);
      expect(error.code).toBe('IMAGE_UPLOAD_FAILED');
      expect(error.name).toBe('ImageUploadError');
    });

    it('should include details when provided', () => {
      const reason = 'File too large';
      const details = { maxSize: 10485760, actualSize: 20971520 };
      const error = new ImageUploadError(reason, details);

      expect(error.details).toEqual(details);
    });
  });

  describe('ImageValidationError', () => {
    it('should create validation error with message', () => {
      const message = 'Invalid image format';
      const error = new ImageValidationError(message);

      expect(error.message).toBe(message);
      expect(error.statusCode).toBe(400);
      expect(error.code).toBe('IMAGE_VALIDATION_ERROR');
      expect(error.name).toBe('ImageValidationError');
    });

    it('should include details when provided', () => {
      const message = 'Invalid image format';
      const details = { allowedFormats: ['jpg', 'png'], receivedFormat: 'bmp' };
      const error = new ImageValidationError(message, details);

      expect(error.details).toEqual(details);
    });
  });
});
