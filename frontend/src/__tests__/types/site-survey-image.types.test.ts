/**
 * @fileoverview 画像管理型定義のタイプガードテスト
 *
 * Task 7.2: 画像管理APIクライアントの型定義テスト
 *
 * Requirements:
 * - 4.5: ファイル形式エラーレスポンス
 * - 4.7: 画像未発見エラーレスポンス
 */

import { describe, it, expect } from 'vitest';
import {
  isImageNotFoundErrorResponse,
  isUnsupportedFileTypeErrorResponse,
} from '../../types/site-survey.types';

describe('Image Management Type Guards', () => {
  // ==========================================================================
  // isImageNotFoundErrorResponse Tests
  // ==========================================================================
  describe('isImageNotFoundErrorResponse', () => {
    it('有効なImageNotFoundErrorResponseを正しく識別できること', () => {
      const validResponse = {
        type: 'about:blank',
        title: 'Not Found',
        status: 404,
        detail: '画像が見つかりません。',
        code: 'IMAGE_NOT_FOUND',
      };

      expect(isImageNotFoundErrorResponse(validResponse)).toBe(true);
    });

    it('imageIdを含む場合も正しく識別できること', () => {
      const responseWithImageId = {
        type: 'about:blank',
        title: 'Not Found',
        status: 404,
        detail: '画像が見つかりません。',
        code: 'IMAGE_NOT_FOUND',
        imageId: 'image-123',
      };

      expect(isImageNotFoundErrorResponse(responseWithImageId)).toBe(true);
    });

    it('nullの場合falseを返すこと', () => {
      expect(isImageNotFoundErrorResponse(null)).toBe(false);
    });

    it('undefinedの場合falseを返すこと', () => {
      expect(isImageNotFoundErrorResponse(undefined)).toBe(false);
    });

    it('文字列の場合falseを返すこと', () => {
      expect(isImageNotFoundErrorResponse('error')).toBe(false);
    });

    it('異なるstatusの場合falseを返すこと', () => {
      const wrongStatus = {
        type: 'about:blank',
        title: 'Not Found',
        status: 400,
        detail: '画像が見つかりません。',
        code: 'IMAGE_NOT_FOUND',
      };

      expect(isImageNotFoundErrorResponse(wrongStatus)).toBe(false);
    });

    it('異なるcodeの場合falseを返すこと', () => {
      const wrongCode = {
        type: 'about:blank',
        title: 'Not Found',
        status: 404,
        detail: '画像が見つかりません。',
        code: 'SITE_SURVEY_NOT_FOUND',
      };

      expect(isImageNotFoundErrorResponse(wrongCode)).toBe(false);
    });

    it('必須フィールドが欠落している場合falseを返すこと', () => {
      const missingDetail = {
        type: 'about:blank',
        title: 'Not Found',
        status: 404,
        code: 'IMAGE_NOT_FOUND',
      };

      expect(isImageNotFoundErrorResponse(missingDetail)).toBe(false);
    });
  });

  // ==========================================================================
  // isUnsupportedFileTypeErrorResponse Tests
  // ==========================================================================
  describe('isUnsupportedFileTypeErrorResponse', () => {
    it('有効なUnsupportedFileTypeErrorResponseを正しく識別できること', () => {
      const validResponse = {
        type: 'about:blank',
        title: 'Unsupported Media Type',
        status: 415,
        detail: 'サポートされていないファイル形式です。',
        code: 'UNSUPPORTED_FILE_TYPE',
        allowedTypes: ['image/jpeg', 'image/png', 'image/webp'],
      };

      expect(isUnsupportedFileTypeErrorResponse(validResponse)).toBe(true);
    });

    it('nullの場合falseを返すこと', () => {
      expect(isUnsupportedFileTypeErrorResponse(null)).toBe(false);
    });

    it('undefinedの場合falseを返すこと', () => {
      expect(isUnsupportedFileTypeErrorResponse(undefined)).toBe(false);
    });

    it('文字列の場合falseを返すこと', () => {
      expect(isUnsupportedFileTypeErrorResponse('error')).toBe(false);
    });

    it('異なるstatusの場合falseを返すこと', () => {
      const wrongStatus = {
        type: 'about:blank',
        title: 'Unsupported Media Type',
        status: 400,
        detail: 'サポートされていないファイル形式です。',
        code: 'UNSUPPORTED_FILE_TYPE',
        allowedTypes: ['image/jpeg', 'image/png', 'image/webp'],
      };

      expect(isUnsupportedFileTypeErrorResponse(wrongStatus)).toBe(false);
    });

    it('異なるcodeの場合falseを返すこと', () => {
      const wrongCode = {
        type: 'about:blank',
        title: 'Unsupported Media Type',
        status: 415,
        detail: 'サポートされていないファイル形式です。',
        code: 'VALIDATION_ERROR',
        allowedTypes: ['image/jpeg', 'image/png', 'image/webp'],
      };

      expect(isUnsupportedFileTypeErrorResponse(wrongCode)).toBe(false);
    });

    it('allowedTypesが配列でない場合falseを返すこと', () => {
      const notArray = {
        type: 'about:blank',
        title: 'Unsupported Media Type',
        status: 415,
        detail: 'サポートされていないファイル形式です。',
        code: 'UNSUPPORTED_FILE_TYPE',
        allowedTypes: 'image/jpeg',
      };

      expect(isUnsupportedFileTypeErrorResponse(notArray)).toBe(false);
    });

    it('allowedTypesが欠落している場合falseを返すこと', () => {
      const missingAllowedTypes = {
        type: 'about:blank',
        title: 'Unsupported Media Type',
        status: 415,
        detail: 'サポートされていないファイル形式です。',
        code: 'UNSUPPORTED_FILE_TYPE',
      };

      expect(isUnsupportedFileTypeErrorResponse(missingAllowedTypes)).toBe(false);
    });

    it('空の配列でもtrueを返すこと', () => {
      const emptyArray = {
        type: 'about:blank',
        title: 'Unsupported Media Type',
        status: 415,
        detail: 'サポートされていないファイル形式です。',
        code: 'UNSUPPORTED_FILE_TYPE',
        allowedTypes: [],
      };

      expect(isUnsupportedFileTypeErrorResponse(emptyArray)).toBe(true);
    });
  });
});
