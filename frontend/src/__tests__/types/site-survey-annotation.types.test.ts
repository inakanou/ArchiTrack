/**
 * @fileoverview 注釈関連型定義のタイプガードテスト
 *
 * Task 7.3: 注釈管理APIクライアントの型定義テスト
 *
 * Requirements:
 * - 9.1: 注釈データの型定義
 * - 9.4: 楽観的排他制御エラー型
 */

import { describe, it, expect } from 'vitest';
import {
  isAnnotationImageNotFoundErrorResponse,
  isAnnotationNotFoundErrorResponse,
  isAnnotationConflictErrorResponse,
  isInvalidAnnotationDataErrorResponse,
  isNoAnnotationResponse,
} from '../../types/site-survey.types';

describe('annotation type guards', () => {
  // ===========================================================================
  // isAnnotationImageNotFoundErrorResponse テスト
  // ===========================================================================

  describe('isAnnotationImageNotFoundErrorResponse', () => {
    it('有効なAnnotationImageNotFoundErrorResponseの場合、trueを返す', () => {
      const validResponse = {
        type: 'https://architrack.example.com/problems/annotation-image-not-found',
        title: 'Image Not Found',
        status: 404,
        detail: '画像が見つかりません。',
        code: 'ANNOTATION_IMAGE_NOT_FOUND',
        imageId: '123e4567-e89b-12d3-a456-426614174000',
      };

      expect(isAnnotationImageNotFoundErrorResponse(validResponse)).toBe(true);
    });

    it('コードが異なる場合、falseを返す', () => {
      const invalidResponse = {
        type: 'https://architrack.example.com/problems/annotation-image-not-found',
        title: 'Image Not Found',
        status: 404,
        detail: '画像が見つかりません。',
        code: 'IMAGE_NOT_FOUND', // 異なるコード
        imageId: '123e4567-e89b-12d3-a456-426614174000',
      };

      expect(isAnnotationImageNotFoundErrorResponse(invalidResponse)).toBe(false);
    });

    it('imageIdがない場合、falseを返す', () => {
      const invalidResponse = {
        type: 'https://architrack.example.com/problems/annotation-image-not-found',
        title: 'Image Not Found',
        status: 404,
        detail: '画像が見つかりません。',
        code: 'ANNOTATION_IMAGE_NOT_FOUND',
        // imageIdがない
      };

      expect(isAnnotationImageNotFoundErrorResponse(invalidResponse)).toBe(false);
    });

    it('nullの場合、falseを返す', () => {
      expect(isAnnotationImageNotFoundErrorResponse(null)).toBe(false);
    });

    it('undefinedの場合、falseを返す', () => {
      expect(isAnnotationImageNotFoundErrorResponse(undefined)).toBe(false);
    });

    it('文字列の場合、falseを返す', () => {
      expect(isAnnotationImageNotFoundErrorResponse('error')).toBe(false);
    });
  });

  // ===========================================================================
  // isAnnotationNotFoundErrorResponse テスト
  // ===========================================================================

  describe('isAnnotationNotFoundErrorResponse', () => {
    it('有効なAnnotationNotFoundErrorResponseの場合、trueを返す', () => {
      const validResponse = {
        type: 'https://architrack.example.com/problems/annotation-not-found',
        title: 'Annotation Not Found',
        status: 404,
        detail: '注釈データが見つかりません。',
        code: 'ANNOTATION_NOT_FOUND',
        imageId: '123e4567-e89b-12d3-a456-426614174000',
      };

      expect(isAnnotationNotFoundErrorResponse(validResponse)).toBe(true);
    });

    it('コードが異なる場合、falseを返す', () => {
      const invalidResponse = {
        type: 'https://architrack.example.com/problems/annotation-not-found',
        title: 'Annotation Not Found',
        status: 404,
        detail: '注釈データが見つかりません。',
        code: 'ANNOTATION_IMAGE_NOT_FOUND', // 異なるコード
        imageId: '123e4567-e89b-12d3-a456-426614174000',
      };

      expect(isAnnotationNotFoundErrorResponse(invalidResponse)).toBe(false);
    });

    it('nullの場合、falseを返す', () => {
      expect(isAnnotationNotFoundErrorResponse(null)).toBe(false);
    });

    it('undefinedの場合、falseを返す', () => {
      expect(isAnnotationNotFoundErrorResponse(undefined)).toBe(false);
    });
  });

  // ===========================================================================
  // isAnnotationConflictErrorResponse テスト
  // ===========================================================================

  describe('isAnnotationConflictErrorResponse', () => {
    it('有効なAnnotationConflictErrorResponseの場合、trueを返す', () => {
      const validResponse = {
        type: 'https://architrack.example.com/problems/annotation-conflict',
        title: 'Conflict',
        status: 409,
        detail: 'データが更新されています。再読み込みしてください。',
        code: 'ANNOTATION_CONFLICT',
        expectedUpdatedAt: '2025-01-15T10:00:00.000Z',
        actualUpdatedAt: '2025-01-15T11:00:00.000Z',
      };

      expect(isAnnotationConflictErrorResponse(validResponse)).toBe(true);
    });

    it('オプショナルフィールドがなくても有効', () => {
      const validResponse = {
        type: 'https://architrack.example.com/problems/annotation-conflict',
        title: 'Conflict',
        status: 409,
        detail: 'データが更新されています。再読み込みしてください。',
        code: 'ANNOTATION_CONFLICT',
        // expectedUpdatedAt, actualUpdatedAtはオプショナル
      };

      expect(isAnnotationConflictErrorResponse(validResponse)).toBe(true);
    });

    it('ステータスが409以外の場合、falseを返す', () => {
      const invalidResponse = {
        type: 'https://architrack.example.com/problems/annotation-conflict',
        title: 'Conflict',
        status: 400, // 409ではない
        detail: 'データが更新されています。再読み込みしてください。',
        code: 'ANNOTATION_CONFLICT',
      };

      expect(isAnnotationConflictErrorResponse(invalidResponse)).toBe(false);
    });

    it('コードが異なる場合、falseを返す', () => {
      const invalidResponse = {
        type: 'https://architrack.example.com/problems/annotation-conflict',
        title: 'Conflict',
        status: 409,
        detail: 'データが更新されています。再読み込みしてください。',
        code: 'SITE_SURVEY_CONFLICT', // 異なるコード
      };

      expect(isAnnotationConflictErrorResponse(invalidResponse)).toBe(false);
    });

    it('nullの場合、falseを返す', () => {
      expect(isAnnotationConflictErrorResponse(null)).toBe(false);
    });

    it('undefinedの場合、falseを返す', () => {
      expect(isAnnotationConflictErrorResponse(undefined)).toBe(false);
    });
  });

  // ===========================================================================
  // isInvalidAnnotationDataErrorResponse テスト
  // ===========================================================================

  describe('isInvalidAnnotationDataErrorResponse', () => {
    it('有効なInvalidAnnotationDataErrorResponseの場合、trueを返す', () => {
      const validResponse = {
        type: 'https://architrack.example.com/problems/invalid-annotation-data',
        title: 'Invalid Annotation Data',
        status: 400,
        detail: '無効な注釈データ形式です。',
        code: 'INVALID_ANNOTATION_DATA',
      };

      expect(isInvalidAnnotationDataErrorResponse(validResponse)).toBe(true);
    });

    it('ステータスが400以外の場合、falseを返す', () => {
      const invalidResponse = {
        type: 'https://architrack.example.com/problems/invalid-annotation-data',
        title: 'Invalid Annotation Data',
        status: 422, // 400ではない
        detail: '無効な注釈データ形式です。',
        code: 'INVALID_ANNOTATION_DATA',
      };

      expect(isInvalidAnnotationDataErrorResponse(invalidResponse)).toBe(false);
    });

    it('コードが異なる場合、falseを返す', () => {
      const invalidResponse = {
        type: 'https://architrack.example.com/problems/invalid-annotation-data',
        title: 'Invalid Annotation Data',
        status: 400,
        detail: '無効な注釈データ形式です。',
        code: 'VALIDATION_ERROR', // 異なるコード
      };

      expect(isInvalidAnnotationDataErrorResponse(invalidResponse)).toBe(false);
    });

    it('nullの場合、falseを返す', () => {
      expect(isInvalidAnnotationDataErrorResponse(null)).toBe(false);
    });

    it('undefinedの場合、falseを返す', () => {
      expect(isInvalidAnnotationDataErrorResponse(undefined)).toBe(false);
    });
  });

  // ===========================================================================
  // isNoAnnotationResponse テスト
  // ===========================================================================

  describe('isNoAnnotationResponse', () => {
    it('data: nullの場合、trueを返す', () => {
      const validResponse = { data: null };

      expect(isNoAnnotationResponse(validResponse)).toBe(true);
    });

    it('dataがnullでない場合、falseを返す', () => {
      const invalidResponse = {
        data: {
          version: '1.0',
          objects: [],
        },
      };

      expect(isNoAnnotationResponse(invalidResponse)).toBe(false);
    });

    it('dataプロパティがない場合、falseを返す', () => {
      const invalidResponse = { id: '123' };

      expect(isNoAnnotationResponse(invalidResponse)).toBe(false);
    });

    it('nullの場合、falseを返す', () => {
      expect(isNoAnnotationResponse(null)).toBe(false);
    });

    it('undefinedの場合、falseを返す', () => {
      expect(isNoAnnotationResponse(undefined)).toBe(false);
    });

    it('文字列の場合、falseを返す', () => {
      expect(isNoAnnotationResponse('response')).toBe(false);
    });
  });
});
