/**
 * @fileoverview ファイルアップロードミドルウェアの単体テスト
 *
 * Task 4.1: 画像アップロード機能を実装する
 * - Multerによるファイル受信（メモリストレージ）
 * - ファイル形式バリデーション（JPEG、PNG、WEBP）
 *
 * Requirements: 4.1, 4.5, 4.6, 4.7, 4.8
 */

import { describe, it, expect, vi } from 'vitest';
import multer from 'multer';
import type { Request } from 'express';
import type { FileFilterCallback } from 'multer';
import {
  MAX_FILE_SIZE,
  MAX_FILES_PER_REQUEST,
  FileSizeExceededError,
  TooManyFilesError,
  handleMulterError,
  imageUpload,
} from '../../../middleware/upload.middleware.js';
import { InvalidFileTypeError } from '../../../services/survey-image.service.js';

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

    it('should return original error for LIMIT_FIELD_KEY', () => {
      const multerError = new multer.MulterError('LIMIT_FIELD_KEY');
      const result = handleMulterError(multerError);

      expect(result).toBe(multerError);
    });

    it('should return original error for LIMIT_PART_COUNT', () => {
      const multerError = new multer.MulterError('LIMIT_PART_COUNT');
      const result = handleMulterError(multerError);

      expect(result).toBe(multerError);
    });

    it('should return original error for LIMIT_FIELD_VALUE', () => {
      const multerError = new multer.MulterError('LIMIT_FIELD_VALUE');
      const result = handleMulterError(multerError);

      expect(result).toBe(multerError);
    });

    it('should return original error for LIMIT_FIELD_COUNT', () => {
      const multerError = new multer.MulterError('LIMIT_FIELD_COUNT');
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

    it('should have fields method', () => {
      expect(typeof imageUpload.fields).toBe('function');
    });

    it('should have none method', () => {
      expect(typeof imageUpload.none).toBe('function');
    });

    it('should have any method', () => {
      expect(typeof imageUpload.any).toBe('function');
    });
  });

  describe('uploadSingleImage', () => {
    it('should be a function (middleware)', async () => {
      const { uploadSingleImage } = await import('../../../middleware/upload.middleware.js');
      expect(uploadSingleImage).toBeDefined();
      expect(typeof uploadSingleImage).toBe('function');
    });
  });

  describe('uploadMultipleImages', () => {
    it('should be a function (middleware)', async () => {
      const { uploadMultipleImages } = await import('../../../middleware/upload.middleware.js');
      expect(uploadMultipleImages).toBeDefined();
      expect(typeof uploadMultipleImages).toBe('function');
    });
  });

  describe('FileSizeExceededError edge cases', () => {
    it('should handle small file sizes correctly', () => {
      const error = new FileSizeExceededError(1024);
      expect(error.maxSize).toBe(1024);
      // 0.0009765625 MB
      expect(error.message).toContain('0.');
    });

    it('should handle 5MB', () => {
      const error = new FileSizeExceededError(5 * 1024 * 1024);
      expect(error.message).toContain('5MB');
      expect(error.code).toBe('FILE_SIZE_EXCEEDED');
    });
  });

  describe('TooManyFilesError edge cases', () => {
    it('should handle 1 file limit', () => {
      const error = new TooManyFilesError(1);
      expect(error.message).toContain('1枚');
      expect(error.maxFiles).toBe(1);
    });

    it('should handle 100 files limit', () => {
      const error = new TooManyFilesError(100);
      expect(error.message).toContain('100枚');
      expect(error.maxFiles).toBe(100);
    });

    it('should be an instance of Error', () => {
      const error = new TooManyFilesError(10);
      expect(error).toBeInstanceOf(Error);
    });
  });

  describe('fileFilter integration tests', () => {
    // multerの内部fileFilterをテスト
    // imageUploadの設定にアクセスしてfileFilterをテスト
    const getFileFilter = () => {
      // multerインスタンスの内部設定にアクセス
      const multerInstance = imageUpload as unknown as {
        fileFilter: (req: Request, file: Express.Multer.File, callback: FileFilterCallback) => void;
      };
      return multerInstance.fileFilter;
    };

    it('should accept JPEG files', () => {
      const fileFilter = getFileFilter();
      const mockReq = {} as Request;
      const mockFile = {
        mimetype: 'image/jpeg',
        originalname: 'test.jpg',
      } as Express.Multer.File;
      const callback = vi.fn();

      fileFilter(mockReq, mockFile, callback);

      expect(callback).toHaveBeenCalledWith(null, true);
    });

    it('should accept PNG files', () => {
      const fileFilter = getFileFilter();
      const mockReq = {} as Request;
      const mockFile = {
        mimetype: 'image/png',
        originalname: 'test.png',
      } as Express.Multer.File;
      const callback = vi.fn();

      fileFilter(mockReq, mockFile, callback);

      expect(callback).toHaveBeenCalledWith(null, true);
    });

    it('should accept WEBP files', () => {
      const fileFilter = getFileFilter();
      const mockReq = {} as Request;
      const mockFile = {
        mimetype: 'image/webp',
        originalname: 'test.webp',
      } as Express.Multer.File;
      const callback = vi.fn();

      fileFilter(mockReq, mockFile, callback);

      expect(callback).toHaveBeenCalledWith(null, true);
    });

    it('should reject GIF files with InvalidFileTypeError', () => {
      const fileFilter = getFileFilter();
      const mockReq = {} as Request;
      const mockFile = {
        mimetype: 'image/gif',
        originalname: 'test.gif',
      } as Express.Multer.File;
      const callback = vi.fn();

      fileFilter(mockReq, mockFile, callback);

      expect(callback).toHaveBeenCalledWith(expect.any(InvalidFileTypeError));
    });

    it('should reject BMP files with InvalidFileTypeError', () => {
      const fileFilter = getFileFilter();
      const mockReq = {} as Request;
      const mockFile = {
        mimetype: 'image/bmp',
        originalname: 'test.bmp',
      } as Express.Multer.File;
      const callback = vi.fn();

      fileFilter(mockReq, mockFile, callback);

      expect(callback).toHaveBeenCalledWith(expect.any(InvalidFileTypeError));
    });

    it('should reject PDF files with InvalidFileTypeError', () => {
      const fileFilter = getFileFilter();
      const mockReq = {} as Request;
      const mockFile = {
        mimetype: 'application/pdf',
        originalname: 'document.pdf',
      } as Express.Multer.File;
      const callback = vi.fn();

      fileFilter(mockReq, mockFile, callback);

      expect(callback).toHaveBeenCalledWith(expect.any(InvalidFileTypeError));
    });

    it('should reject text files with InvalidFileTypeError', () => {
      const fileFilter = getFileFilter();
      const mockReq = {} as Request;
      const mockFile = {
        mimetype: 'text/plain',
        originalname: 'readme.txt',
      } as Express.Multer.File;
      const callback = vi.fn();

      fileFilter(mockReq, mockFile, callback);

      expect(callback).toHaveBeenCalledWith(expect.any(InvalidFileTypeError));
    });
  });
});
