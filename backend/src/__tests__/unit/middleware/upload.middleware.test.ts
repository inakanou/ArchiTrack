/**
 * @fileoverview ファイルアップロードミドルウェアの単体テスト
 *
 * Task 4.1: 画像アップロード機能を実装する
 * - Multerによるファイル受信（メモリストレージ）
 * - ファイル形式バリデーション（JPEG、PNG、WEBP）
 *
 * Requirements: 4.1, 4.5, 4.6, 4.7, 4.8
 */

import { describe, it, expect } from 'vitest';
import multer from 'multer';
import {
  MAX_FILE_SIZE,
  MAX_FILES_PER_REQUEST,
  FileSizeExceededError,
  TooManyFilesError,
  handleMulterError,
  imageUpload,
} from '../../../middleware/upload.middleware.js';

describe('upload.middleware', () => {
  describe('constants', () => {
    it('should have MAX_FILE_SIZE set to 10MB (Requirements: 4.6)', () => {
      expect(MAX_FILE_SIZE).toBe(10 * 1024 * 1024);
    });

    it('should have MAX_FILES_PER_REQUEST set to 10 (Requirements: 4.7)', () => {
      expect(MAX_FILES_PER_REQUEST).toBe(10);
    });
  });

  describe('FileSizeExceededError', () => {
    it('should create error with correct message in MB', () => {
      const error = new FileSizeExceededError(10 * 1024 * 1024);
      expect(error.message).toContain('10MB');
      expect(error.code).toBe('FILE_SIZE_EXCEEDED');
      expect(error.maxSize).toBe(10 * 1024 * 1024);
    });

    it('should have correct name', () => {
      const error = new FileSizeExceededError(MAX_FILE_SIZE);
      expect(error.name).toBe('FileSizeExceededError');
    });
  });

  describe('TooManyFilesError', () => {
    it('should create error with correct message', () => {
      const error = new TooManyFilesError(10);
      expect(error.message).toContain('10枚');
      expect(error.code).toBe('TOO_MANY_FILES');
      expect(error.maxFiles).toBe(10);
    });

    it('should have correct name', () => {
      const error = new TooManyFilesError(MAX_FILES_PER_REQUEST);
      expect(error.name).toBe('TooManyFilesError');
    });
  });

  describe('handleMulterError', () => {
    it('should convert LIMIT_FILE_SIZE error to FileSizeExceededError', () => {
      const multerError = new multer.MulterError('LIMIT_FILE_SIZE');
      const result = handleMulterError(multerError);

      expect(result).toBeInstanceOf(FileSizeExceededError);
      expect((result as FileSizeExceededError).maxSize).toBe(MAX_FILE_SIZE);
    });

    it('should convert LIMIT_FILE_COUNT error to TooManyFilesError', () => {
      const multerError = new multer.MulterError('LIMIT_FILE_COUNT');
      const result = handleMulterError(multerError);

      expect(result).toBeInstanceOf(TooManyFilesError);
      expect((result as TooManyFilesError).maxFiles).toBe(MAX_FILES_PER_REQUEST);
    });

    it('should handle LIMIT_UNEXPECTED_FILE with field name', () => {
      const multerError = new multer.MulterError('LIMIT_UNEXPECTED_FILE', 'wrongField');
      const result = handleMulterError(multerError);

      expect(result.message).toContain('wrongField');
    });

    it('should return original error for other Multer errors', () => {
      const multerError = new multer.MulterError('LIMIT_FIELD_KEY');
      const result = handleMulterError(multerError);

      expect(result).toBe(multerError);
    });
  });

  describe('imageUpload configuration', () => {
    it('should be a Multer instance', () => {
      expect(imageUpload).toBeDefined();
      expect(typeof imageUpload.single).toBe('function');
      expect(typeof imageUpload.array).toBe('function');
    });
  });
});
