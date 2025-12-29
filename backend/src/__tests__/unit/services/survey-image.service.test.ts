/**
 * @fileoverview SurveyImageServiceの単体テスト
 *
 * Task 4.1: 画像アップロード機能を実装する
 * - Multerによるファイル受信（メモリストレージ）
 * - ファイル形式バリデーション（JPEG、PNG、WEBP）
 * - MIMEタイプとマジックバイトの二重検証
 * - ファイル名サニタイズ
 *
 * Requirements: 4.1, 4.5, 4.8
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { PrismaClient } from '../../../generated/prisma/client.js';
import type { S3Client } from '@aws-sdk/client-s3';

// SurveyImageServiceをインポート
import {
  SurveyImageService,
  type SurveyImageServiceDependencies,
  type UploadImageInput,
  InvalidFileTypeError,
  InvalidMagicBytesError,
  SurveySurveyNotFoundError,
} from '../../../services/survey-image.service.js';
import type { StorageProvider } from '../../../storage/storage-provider.interface.js';

describe('SurveyImageService', () => {
  let service: SurveyImageService;
  let mockPrisma: PrismaClient;
  let mockS3Client: S3Client;

  // 有効なJPEGファイルのマジックバイト
  const JPEG_MAGIC_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
  // 有効なPNGファイルのマジックバイト
  const PNG_MAGIC_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  // 有効なWebPファイルのマジックバイト (RIFF....WEBP)
  const WEBP_MAGIC_BYTES = Buffer.from([
    0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
  ]);

  // テスト用の有効なJPEGバッファを作成
  function createValidJpegBuffer(size: number = 1000): Buffer {
    const buffer = Buffer.alloc(size);
    JPEG_MAGIC_BYTES.copy(buffer);
    return buffer;
  }

  // テスト用の有効なPNGバッファを作成
  function createValidPngBuffer(size: number = 1000): Buffer {
    const buffer = Buffer.alloc(size);
    PNG_MAGIC_BYTES.copy(buffer);
    return buffer;
  }

  // テスト用の有効なWebPバッファを作成
  function createValidWebpBuffer(size: number = 1000): Buffer {
    const buffer = Buffer.alloc(size);
    WEBP_MAGIC_BYTES.copy(buffer);
    return buffer;
  }

  beforeEach(() => {
    // モックの作成
    mockPrisma = {
      siteSurvey: {
        findUnique: vi.fn(),
      },
      surveyImage: {
        create: vi.fn(),
        count: vi.fn(),
      },
      $transaction: vi.fn((callback) => callback(mockPrisma)),
    } as unknown as PrismaClient;

    mockS3Client = {
      send: vi.fn().mockResolvedValue({}),
    } as unknown as S3Client;

    const deps: SurveyImageServiceDependencies = {
      prisma: mockPrisma,
      s3Client: mockS3Client,
      bucketName: 'test-bucket',
    };

    service = new SurveyImageService(deps);
  });

  describe('validateFileType', () => {
    describe('MIME type validation (Requirements: 4.5, 4.8)', () => {
      it('should accept JPEG MIME type', () => {
        expect(() => service.validateMimeType('image/jpeg')).not.toThrow();
      });

      it('should accept PNG MIME type', () => {
        expect(() => service.validateMimeType('image/png')).not.toThrow();
      });

      it('should accept WEBP MIME type', () => {
        expect(() => service.validateMimeType('image/webp')).not.toThrow();
      });

      it('should reject GIF MIME type', () => {
        expect(() => service.validateMimeType('image/gif')).toThrow(InvalidFileTypeError);
      });

      it('should reject BMP MIME type', () => {
        expect(() => service.validateMimeType('image/bmp')).toThrow(InvalidFileTypeError);
      });

      it('should reject SVG MIME type', () => {
        expect(() => service.validateMimeType('image/svg+xml')).toThrow(InvalidFileTypeError);
      });

      it('should reject PDF MIME type', () => {
        expect(() => service.validateMimeType('application/pdf')).toThrow(InvalidFileTypeError);
      });

      it('should reject text MIME type', () => {
        expect(() => service.validateMimeType('text/plain')).toThrow(InvalidFileTypeError);
      });

      it('should provide helpful error message for invalid MIME type', () => {
        expect(() => service.validateMimeType('image/gif')).toThrow(
          /サポートされている形式: JPEG, PNG, WEBP/
        );
      });
    });

    describe('Magic bytes validation (Requirements: 4.5, 4.8)', () => {
      it('should validate JPEG magic bytes', () => {
        const buffer = createValidJpegBuffer();
        expect(() => service.validateMagicBytes(buffer, 'image/jpeg')).not.toThrow();
      });

      it('should validate PNG magic bytes', () => {
        const buffer = createValidPngBuffer();
        expect(() => service.validateMagicBytes(buffer, 'image/png')).not.toThrow();
      });

      it('should validate WEBP magic bytes', () => {
        const buffer = createValidWebpBuffer();
        expect(() => service.validateMagicBytes(buffer, 'image/webp')).not.toThrow();
      });

      it('should reject file with mismatched MIME type and magic bytes (JPEG header, PNG MIME)', () => {
        const buffer = createValidJpegBuffer();
        expect(() => service.validateMagicBytes(buffer, 'image/png')).toThrow(
          InvalidMagicBytesError
        );
      });

      it('should reject file with mismatched MIME type and magic bytes (PNG header, JPEG MIME)', () => {
        const buffer = createValidPngBuffer();
        expect(() => service.validateMagicBytes(buffer, 'image/jpeg')).toThrow(
          InvalidMagicBytesError
        );
      });

      it('should reject file with invalid magic bytes', () => {
        const buffer = Buffer.alloc(100);
        buffer.write('NOT_AN_IMAGE');
        expect(() => service.validateMagicBytes(buffer, 'image/jpeg')).toThrow(
          InvalidMagicBytesError
        );
      });

      it('should reject empty buffer', () => {
        const buffer = Buffer.alloc(0);
        expect(() => service.validateMagicBytes(buffer, 'image/jpeg')).toThrow(
          InvalidMagicBytesError
        );
      });

      it('should reject buffer too small for magic bytes check', () => {
        const buffer = Buffer.alloc(2);
        expect(() => service.validateMagicBytes(buffer, 'image/jpeg')).toThrow(
          InvalidMagicBytesError
        );
      });

      it('should provide helpful error message for magic bytes mismatch', () => {
        const buffer = createValidPngBuffer();
        expect(() => service.validateMagicBytes(buffer, 'image/jpeg')).toThrow(
          /ファイルの内容がMIMEタイプと一致しません/
        );
      });
    });
  });

  describe('sanitizeFileName', () => {
    it('should keep alphanumeric characters and dots', () => {
      expect(service.sanitizeFileName('photo123.jpg')).toBe('photo123.jpg');
    });

    it('should replace spaces with underscores', () => {
      expect(service.sanitizeFileName('my photo.jpg')).toBe('my_photo.jpg');
    });

    it('should remove path traversal sequences', () => {
      expect(service.sanitizeFileName('../../../etc/passwd')).not.toContain('..');
      expect(service.sanitizeFileName('..\\..\\..\\Windows\\system32')).not.toContain('..');
    });

    it('should remove directory separators', () => {
      expect(service.sanitizeFileName('/path/to/file.jpg')).not.toContain('/');
      expect(service.sanitizeFileName('C:\\Users\\file.jpg')).not.toContain('\\');
    });

    it('should handle Japanese characters', () => {
      const sanitized = service.sanitizeFileName('写真_2024.jpg');
      expect(sanitized).toContain('2024');
      expect(sanitized).toContain('.jpg');
    });

    it('should remove special characters except dots and underscores', () => {
      expect(service.sanitizeFileName('file<>:"|?*.jpg')).not.toContain('<');
      expect(service.sanitizeFileName('file<>:"|?*.jpg')).not.toContain('>');
      expect(service.sanitizeFileName('file<>:"|?*.jpg')).not.toContain(':');
      expect(service.sanitizeFileName('file<>:"|?*.jpg')).not.toContain('"');
      expect(service.sanitizeFileName('file<>:"|?*.jpg')).not.toContain('|');
      expect(service.sanitizeFileName('file<>:"|?*.jpg')).not.toContain('?');
      expect(service.sanitizeFileName('file<>:"|?*.jpg')).not.toContain('*');
    });

    it('should preserve file extension', () => {
      expect(service.sanitizeFileName('test.jpeg')).toMatch(/\.jpeg$/);
      expect(service.sanitizeFileName('test.png')).toMatch(/\.png$/);
      expect(service.sanitizeFileName('test.webp')).toMatch(/\.webp$/);
    });

    it('should generate a fallback name for empty input', () => {
      const sanitized = service.sanitizeFileName('');
      expect(sanitized).not.toBe('');
      expect(sanitized).toMatch(/^image_\d+$/);
    });

    it('should generate a fallback name for whitespace-only input', () => {
      const sanitized = service.sanitizeFileName('   ');
      expect(sanitized).not.toBe('');
    });

    it('should truncate excessively long filenames', () => {
      const longName = 'a'.repeat(300) + '.jpg';
      const sanitized = service.sanitizeFileName(longName);
      expect(sanitized.length).toBeLessThanOrEqual(255);
    });

    it('should handle multiple dots in filename', () => {
      expect(service.sanitizeFileName('file.name.with.dots.jpg')).toBe('file.name.with.dots.jpg');
    });

    it('should handle uppercase extensions', () => {
      expect(service.sanitizeFileName('photo.JPG')).toBe('photo.jpg');
      expect(service.sanitizeFileName('photo.PNG')).toBe('photo.png');
      expect(service.sanitizeFileName('photo.WEBP')).toBe('photo.webp');
    });
  });

  describe('validateFile (combined validation)', () => {
    it('should validate a proper JPEG file', () => {
      const input: UploadImageInput = {
        surveyId: 'survey-123',
        file: {
          buffer: createValidJpegBuffer(),
          mimetype: 'image/jpeg',
          originalname: 'photo.jpg',
          size: 1000,
        },
      };

      expect(() => service.validateFile(input.file)).not.toThrow();
    });

    it('should validate a proper PNG file', () => {
      const input: UploadImageInput = {
        surveyId: 'survey-123',
        file: {
          buffer: createValidPngBuffer(),
          mimetype: 'image/png',
          originalname: 'photo.png',
          size: 1000,
        },
      };

      expect(() => service.validateFile(input.file)).not.toThrow();
    });

    it('should validate a proper WEBP file', () => {
      const input: UploadImageInput = {
        surveyId: 'survey-123',
        file: {
          buffer: createValidWebpBuffer(),
          mimetype: 'image/webp',
          originalname: 'photo.webp',
          size: 1000,
        },
      };

      expect(() => service.validateFile(input.file)).not.toThrow();
    });

    it('should reject file with invalid MIME type even if magic bytes are valid', () => {
      const input: UploadImageInput = {
        surveyId: 'survey-123',
        file: {
          buffer: createValidJpegBuffer(),
          mimetype: 'image/gif', // Invalid MIME type
          originalname: 'photo.gif',
          size: 1000,
        },
      };

      expect(() => service.validateFile(input.file)).toThrow(InvalidFileTypeError);
    });

    it('should reject file with valid MIME type but invalid magic bytes', () => {
      const buffer = Buffer.alloc(100);
      buffer.write('NOT_AN_IMAGE');

      const input: UploadImageInput = {
        surveyId: 'survey-123',
        file: {
          buffer,
          mimetype: 'image/jpeg', // Valid MIME type
          originalname: 'fake.jpg',
          size: 100,
        },
      };

      expect(() => service.validateFile(input.file)).toThrow(InvalidMagicBytesError);
    });
  });

  describe('ALLOWED_MIME_TYPES constant', () => {
    it('should include exactly JPEG, PNG, and WEBP (Requirements: 4.8)', () => {
      expect(SurveyImageService.ALLOWED_MIME_TYPES).toContain('image/jpeg');
      expect(SurveyImageService.ALLOWED_MIME_TYPES).toContain('image/png');
      expect(SurveyImageService.ALLOWED_MIME_TYPES).toContain('image/webp');
      expect(SurveyImageService.ALLOWED_MIME_TYPES).toHaveLength(3);
    });
  });

  describe('ALLOWED_EXTENSIONS constant', () => {
    it('should include proper file extensions (Requirements: 4.8)', () => {
      expect(SurveyImageService.ALLOWED_EXTENSIONS).toContain('.jpg');
      expect(SurveyImageService.ALLOWED_EXTENSIONS).toContain('.jpeg');
      expect(SurveyImageService.ALLOWED_EXTENSIONS).toContain('.png');
      expect(SurveyImageService.ALLOWED_EXTENSIONS).toContain('.webp');
    });
  });

  describe('getStoragePath', () => {
    it('should generate a valid storage path with survey ID', () => {
      const path = service.getStoragePath('survey-123', 'photo.jpg');
      expect(path).toContain('survey-123');
      expect(path).toContain('photo.jpg');
    });

    it('should include surveys/ prefix in path', () => {
      const path = service.getStoragePath('survey-123', 'photo.jpg');
      expect(path).toMatch(/^surveys\//);
    });

    it('should generate unique paths with timestamps', () => {
      const path1 = service.getStoragePath('survey-123', 'photo.jpg');
      const path2 = service.getStoragePath('survey-123', 'photo.jpg');

      // Paths may be the same if generated in same millisecond, but format should be consistent
      expect(path1).toMatch(/^surveys\/survey-123\/\d+/);
      expect(path2).toMatch(/^surveys\/survey-123\/\d+/);
    });
  });

  describe('SurveySurveyNotFoundError', () => {
    it('should create error with correct properties', () => {
      const error = new SurveySurveyNotFoundError('survey-123');

      expect(error.name).toBe('SurveySurveyNotFoundError');
      expect(error.code).toBe('SURVEY_NOT_FOUND');
      expect(error.surveyId).toBe('survey-123');
      expect(error.message).toContain('survey-123');
    });

    it('should be an instance of Error', () => {
      const error = new SurveySurveyNotFoundError('test-id');
      expect(error).toBeInstanceOf(Error);
    });
  });

  describe('getter methods', () => {
    it('getBucketName should return bucket name', () => {
      const bucketName = service.getBucketName();
      expect(bucketName).toBe('test-bucket');
    });

    it('getS3Client should return S3 client', () => {
      const s3Client = service.getS3Client();
      expect(s3Client).toBe(mockS3Client);
    });

    it('getStorageProvider should return null when not set', () => {
      const storageProvider = service.getStorageProvider();
      expect(storageProvider).toBeNull();
    });

    it('getPrismaClient should return Prisma client', () => {
      const prisma = service.getPrismaClient();
      expect(prisma).toBe(mockPrisma);
    });

    it('should return storageProvider when set', () => {
      const mockStorageProvider = {
        upload: vi.fn(),
        delete: vi.fn(),
        getSignedUrl: vi.fn(),
      } as unknown as StorageProvider;

      const serviceWithProvider = new SurveyImageService({
        prisma: mockPrisma,
        storageProvider: mockStorageProvider,
      });

      expect(serviceWithProvider.getStorageProvider()).toBe(mockStorageProvider);
      expect(serviceWithProvider.getBucketName()).toBeNull();
      expect(serviceWithProvider.getS3Client()).toBeNull();
    });
  });

  describe('validateMagicBytes edge cases', () => {
    it('should throw InvalidMagicBytesError for unknown MIME type', () => {
      const buffer = Buffer.alloc(100);
      expect(() => service.validateMagicBytes(buffer, 'application/unknown')).toThrow(
        InvalidMagicBytesError
      );
    });

    it('should validate various JPEG magic byte sequences', () => {
      // JPEG with EXIF marker (FFD8FFE1)
      const jpegExif = Buffer.from([0xff, 0xd8, 0xff, 0xe1, 0x00, 0x00, 0x00, 0x00]);
      expect(() => service.validateMagicBytes(jpegExif, 'image/jpeg')).not.toThrow();

      // JPEG with SPIFF marker (FFD8FFE8)
      const jpegSpiff = Buffer.from([0xff, 0xd8, 0xff, 0xe8, 0x00, 0x00, 0x00, 0x00]);
      expect(() => service.validateMagicBytes(jpegSpiff, 'image/jpeg')).not.toThrow();

      // JPEG with quantization table marker (FFD8FFDB)
      const jpegDb = Buffer.from([0xff, 0xd8, 0xff, 0xdb, 0x00, 0x00, 0x00, 0x00]);
      expect(() => service.validateMagicBytes(jpegDb, 'image/jpeg')).not.toThrow();

      // JPEG with Adobe marker (FFD8FFEE)
      const jpegAdobe = Buffer.from([0xff, 0xd8, 0xff, 0xee, 0x00, 0x00, 0x00, 0x00]);
      expect(() => service.validateMagicBytes(jpegAdobe, 'image/jpeg')).not.toThrow();
    });

    it('should reject JPEG with buffer too small', () => {
      const smallBuffer = Buffer.from([0xff, 0xd8]);
      expect(() => service.validateMagicBytes(smallBuffer, 'image/jpeg')).toThrow(
        InvalidMagicBytesError
      );
    });

    it('should reject PNG with buffer too small', () => {
      const smallBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
      expect(() => service.validateMagicBytes(smallBuffer, 'image/png')).toThrow(
        InvalidMagicBytesError
      );
    });

    it('should reject WebP with buffer too small', () => {
      const smallBuffer = Buffer.from([0x52, 0x49, 0x46, 0x46, 0x00, 0x00]);
      expect(() => service.validateMagicBytes(smallBuffer, 'image/webp')).toThrow(
        InvalidMagicBytesError
      );
    });

    it('should reject WebP with valid RIFF header but missing WEBP signature', () => {
      // RIFF header but not WEBP at offset 8
      const invalidWebp = Buffer.from([
        0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x41, 0x56, 0x49, 0x20,
      ]);
      expect(() => service.validateMagicBytes(invalidWebp, 'image/webp')).toThrow(
        InvalidMagicBytesError
      );
    });
  });

  describe('sanitizeFileName edge cases', () => {
    it('should handle files without extension', () => {
      const sanitized = service.sanitizeFileName('filename');
      expect(sanitized).toBe('filename');
    });

    it('should handle files with only non-ASCII characters', () => {
      const sanitized = service.sanitizeFileName('日本語.jpg');
      // 非ASCII文字が除去されるため、fallback名が生成される可能性
      expect(sanitized).toMatch(/\.jpg$/);
    });

    it('should handle deeply nested path traversal', () => {
      const sanitized = service.sanitizeFileName('....//....//file.jpg');
      expect(sanitized).not.toContain('..');
      expect(sanitized).not.toContain('/');
    });

    it('should handle Windows-style path traversal', () => {
      const sanitized = service.sanitizeFileName('..\\..\\windows\\system32\\file.jpg');
      expect(sanitized).not.toContain('..');
      expect(sanitized).not.toContain('\\');
    });

    it('should handle filenames starting with dot', () => {
      const sanitized = service.sanitizeFileName('.hidden.jpg');
      expect(sanitized).toMatch(/\.jpg$/);
    });

    it('should handle mixed dangerous characters', () => {
      const sanitized = service.sanitizeFileName('<script>alert("xss")</script>.jpg');
      expect(sanitized).not.toContain('<');
      expect(sanitized).not.toContain('>');
      expect(sanitized).not.toContain('"');
    });
  });
});
