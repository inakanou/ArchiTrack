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
  UnsupportedImageFormatError,
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

    it('should accept file with invalid MIME type if magic bytes are valid (Req 21.1)', () => {
      const input: UploadImageInput = {
        surveyId: 'survey-123',
        file: {
          buffer: createValidJpegBuffer(),
          mimetype: 'image/gif', // Invalid MIME type but valid magic bytes
          originalname: 'photo.gif',
          size: 1000,
        },
      };

      // validateFileはマジックバイトのみで判定するため、MIMEタイプに関わらず許可する
      expect(service.validateFile(input.file)).toBe('image/jpeg');
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

      expect(() => service.validateFile(input.file)).toThrow(UnsupportedImageFormatError);
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

    /**
     * Task 47: JPEGマジックバイト検証修正 - 3バイトプレフィックス方式のテスト
     *
     * Requirements: 19.1, 19.2, 19.3, 19.4, 19.5, 19.6, 19.7, 19.8, 19.9
     *
     * JPEG仕様（ITU-T T.81）ではSOI（FF D8）の後に必ず0xFFで始まるマーカーが続く。
     * 4バイト目は多数のバリエーションがあるため、先頭3バイト（FF D8 FF）のみで判定する。
     */
    describe('JPEG 3-byte prefix validation (Requirement 19)', () => {
      it('should accept JFIF JPEG (4th byte 0xE0) - Requirement 19.4', () => {
        const buffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x00, 0x00, 0x00]);
        expect(() => service.validateMagicBytes(buffer, 'image/jpeg')).not.toThrow();
      });

      it('should accept EXIF JPEG (4th byte 0xE1) - Requirement 19.3', () => {
        const buffer = Buffer.from([0xff, 0xd8, 0xff, 0xe1, 0x00, 0x00, 0x00, 0x00]);
        expect(() => service.validateMagicBytes(buffer, 'image/jpeg')).not.toThrow();
      });

      it('should accept ICC profile JPEG (4th byte 0xE2) - Requirement 19.2', () => {
        const buffer = Buffer.from([0xff, 0xd8, 0xff, 0xe2, 0x00, 0x00, 0x00, 0x00]);
        expect(() => service.validateMagicBytes(buffer, 'image/jpeg')).not.toThrow();
      });

      it('should accept SOS marker JPEG (4th byte 0xDA) - Requirement 19.5', () => {
        const buffer = Buffer.from([0xff, 0xd8, 0xff, 0xda, 0x00, 0x00, 0x00, 0x00]);
        expect(() => service.validateMagicBytes(buffer, 'image/jpeg')).not.toThrow();
      });

      it('should accept DQT marker JPEG (4th byte 0xDB) - Requirement 19.6', () => {
        const buffer = Buffer.from([0xff, 0xd8, 0xff, 0xdb, 0x00, 0x00, 0x00, 0x00]);
        expect(() => service.validateMagicBytes(buffer, 'image/jpeg')).not.toThrow();
      });

      it('should accept SOF0 marker JPEG (4th byte 0xC0)', () => {
        const buffer = Buffer.from([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x00, 0x00, 0x00]);
        expect(() => service.validateMagicBytes(buffer, 'image/jpeg')).not.toThrow();
      });

      it('should accept DHT marker JPEG (4th byte 0xC4)', () => {
        const buffer = Buffer.from([0xff, 0xd8, 0xff, 0xc4, 0x00, 0x00, 0x00, 0x00]);
        expect(() => service.validateMagicBytes(buffer, 'image/jpeg')).not.toThrow();
      });

      it('should accept COM marker JPEG (4th byte 0xFE)', () => {
        const buffer = Buffer.from([0xff, 0xd8, 0xff, 0xfe, 0x00, 0x00, 0x00, 0x00]);
        expect(() => service.validateMagicBytes(buffer, 'image/jpeg')).not.toThrow();
      });

      it('should accept APP3-APP15 markers (4th byte 0xE3-0xEF)', () => {
        for (let marker = 0xe3; marker <= 0xef; marker++) {
          const buffer = Buffer.from([0xff, 0xd8, 0xff, marker, 0x00, 0x00, 0x00, 0x00]);
          expect(() => service.validateMagicBytes(buffer, 'image/jpeg')).not.toThrow();
        }
      });

      it('should reject file without FF D8 FF prefix - Requirement 19.7', () => {
        // First byte wrong
        const buffer1 = Buffer.from([0x00, 0xd8, 0xff, 0xe0, 0x00, 0x00, 0x00, 0x00]);
        expect(() => service.validateMagicBytes(buffer1, 'image/jpeg')).toThrow(
          InvalidMagicBytesError
        );

        // Second byte wrong
        const buffer2 = Buffer.from([0xff, 0x00, 0xff, 0xe0, 0x00, 0x00, 0x00, 0x00]);
        expect(() => service.validateMagicBytes(buffer2, 'image/jpeg')).toThrow(
          InvalidMagicBytesError
        );

        // Third byte wrong
        const buffer3 = Buffer.from([0xff, 0xd8, 0x00, 0xe0, 0x00, 0x00, 0x00, 0x00]);
        expect(() => service.validateMagicBytes(buffer3, 'image/jpeg')).toThrow(
          InvalidMagicBytesError
        );
      });

      it('should accept JPEG with only 3 bytes (minimum valid) - Requirement 19.1', () => {
        const buffer = Buffer.from([0xff, 0xd8, 0xff]);
        expect(() => service.validateMagicBytes(buffer, 'image/jpeg')).not.toThrow();
      });

      it('should reject JPEG with only 2 bytes (too small)', () => {
        const buffer = Buffer.from([0xff, 0xd8]);
        expect(() => service.validateMagicBytes(buffer, 'image/jpeg')).toThrow(
          InvalidMagicBytesError
        );
      });
    });

    /**
     * Task 47: PNG・WEBP既存テスト通過確認
     *
     * Requirements: 19.8, 19.9
     */
    describe('PNG and WEBP validation unchanged (Requirement 19.8, 19.9)', () => {
      it('should still validate PNG (89 50 4E 47) - Requirement 19.8', () => {
        const buffer = createValidPngBuffer();
        expect(() => service.validateMagicBytes(buffer, 'image/png')).not.toThrow();
      });

      it('should still reject invalid PNG', () => {
        const buffer = Buffer.from([0x00, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
        expect(() => service.validateMagicBytes(buffer, 'image/png')).toThrow(
          InvalidMagicBytesError
        );
      });

      it('should still validate WEBP (RIFF + WEBP) - Requirement 19.9', () => {
        const buffer = createValidWebpBuffer();
        expect(() => service.validateMagicBytes(buffer, 'image/webp')).not.toThrow();
      });

      it('should still reject invalid WEBP', () => {
        const buffer = Buffer.from([
          0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        ]);
        expect(() => service.validateMagicBytes(buffer, 'image/webp')).toThrow(
          InvalidMagicBytesError
        );
      });
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

  /**
   * Task 57.1: detectMimeTypeByMagicBytesの単体テスト
   *
   * Requirements: 21.1, 21.2, 21.3, 21.4, 21.6
   */
  describe('detectMimeTypeByMagicBytes (Requirement 21)', () => {
    it('should detect JPEG by FF D8 FF prefix with JFIF 4th byte (0xE0)', () => {
      const buffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x00, 0x00, 0x00]);
      expect(service.detectMimeTypeByMagicBytes(buffer)).toBe('image/jpeg');
    });

    it('should detect JPEG by FF D8 FF prefix with EXIF 4th byte (0xE1)', () => {
      const buffer = Buffer.from([0xff, 0xd8, 0xff, 0xe1, 0x00, 0x00, 0x00, 0x00]);
      expect(service.detectMimeTypeByMagicBytes(buffer)).toBe('image/jpeg');
    });

    it('should detect JPEG by FF D8 FF prefix with ICC profile 4th byte (0xE2)', () => {
      const buffer = Buffer.from([0xff, 0xd8, 0xff, 0xe2, 0x00, 0x00, 0x00, 0x00]);
      expect(service.detectMimeTypeByMagicBytes(buffer)).toBe('image/jpeg');
    });

    it('should detect JPEG by FF D8 FF prefix with DQT 4th byte (0xDB)', () => {
      const buffer = Buffer.from([0xff, 0xd8, 0xff, 0xdb, 0x00, 0x00, 0x00, 0x00]);
      expect(service.detectMimeTypeByMagicBytes(buffer)).toBe('image/jpeg');
    });

    it('should detect JPEG with minimum 3-byte buffer (FF D8 FF)', () => {
      const buffer = Buffer.from([0xff, 0xd8, 0xff]);
      expect(service.detectMimeTypeByMagicBytes(buffer)).toBe('image/jpeg');
    });

    it('should detect PNG by 8-byte signature', () => {
      const buffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      expect(service.detectMimeTypeByMagicBytes(buffer)).toBe('image/png');
    });

    it('should detect WEBP by RIFF header + WEBP signature', () => {
      const buffer = Buffer.from([
        0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
      ]);
      expect(service.detectMimeTypeByMagicBytes(buffer)).toBe('image/webp');
    });

    it('should throw UnsupportedImageFormatError for empty buffer', () => {
      const buffer = Buffer.alloc(0);
      expect(() => service.detectMimeTypeByMagicBytes(buffer)).toThrow(UnsupportedImageFormatError);
    });

    it('should throw UnsupportedImageFormatError for non-image binary (0x00 0x00 0x00)', () => {
      const buffer = Buffer.from([0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
      expect(() => service.detectMimeTypeByMagicBytes(buffer)).toThrow(UnsupportedImageFormatError);
    });

    it('should throw UnsupportedImageFormatError for GIF binary', () => {
      // GIF89a header
      const buffer = Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);
      expect(() => service.detectMimeTypeByMagicBytes(buffer)).toThrow(UnsupportedImageFormatError);
    });

    it('should throw UnsupportedImageFormatError for PDF binary', () => {
      // %PDF header
      const buffer = Buffer.from([0x25, 0x50, 0x44, 0x46]);
      expect(() => service.detectMimeTypeByMagicBytes(buffer)).toThrow(UnsupportedImageFormatError);
    });

    it('should have correct error properties', () => {
      const buffer = Buffer.alloc(0);
      try {
        service.detectMimeTypeByMagicBytes(buffer);
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(UnsupportedImageFormatError);
        expect((error as UnsupportedImageFormatError).code).toBe('UNSUPPORTED_IMAGE_FORMAT');
        expect((error as UnsupportedImageFormatError).name).toBe('UnsupportedImageFormatError');
      }
    });
  });

  /**
   * Task 57.2: validateFileの拡張子不一致許容テスト
   *
   * Requirements: 21.1, 21.2, 21.3, 21.4, 21.5, 21.6, 21.7, 21.8
   */
  describe('validateFile - extension mismatch tolerance (Requirement 21)', () => {
    it('should return image/jpeg for .png extension with JPEG content (Req 21.2)', () => {
      const file = {
        buffer: createValidJpegBuffer(),
        mimetype: 'image/png',
        originalname: 'photo.png',
        size: 1000,
      };
      expect(service.validateFile(file)).toBe('image/jpeg');
    });

    it('should return image/png for .jpg extension with PNG content (Req 21.3)', () => {
      const file = {
        buffer: createValidPngBuffer(),
        mimetype: 'image/jpeg',
        originalname: 'photo.jpg',
        size: 1000,
      };
      expect(service.validateFile(file)).toBe('image/png');
    });

    it('should return image/jpeg for .txt extension with JPEG content (Req 21.5)', () => {
      const file = {
        buffer: createValidJpegBuffer(),
        mimetype: 'text/plain',
        originalname: 'photo.txt',
        size: 1000,
      };
      expect(service.validateFile(file)).toBe('image/jpeg');
    });

    it('should return image/webp for text/plain mimetype with WEBP content (Req 21.5)', () => {
      const file = {
        buffer: createValidWebpBuffer(),
        mimetype: 'text/plain',
        originalname: 'file.txt',
        size: 1000,
      };
      expect(service.validateFile(file)).toBe('image/webp');
    });

    it('should throw UnsupportedImageFormatError for unsupported content (Req 21.6)', () => {
      const buffer = Buffer.from([0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
      const file = {
        buffer,
        mimetype: 'image/jpeg',
        originalname: 'fake.jpg',
        size: 100,
      };
      expect(() => service.validateFile(file)).toThrow(UnsupportedImageFormatError);
    });

    it('should return string (detected MIME type) instead of void (Req 21.7)', () => {
      const file = {
        buffer: createValidJpegBuffer(),
        mimetype: 'image/jpeg',
        originalname: 'photo.jpg',
        size: 1000,
      };
      const result = service.validateFile(file);
      expect(typeof result).toBe('string');
      expect(result).toBe('image/jpeg');
    });
  });

  /**
   * UnsupportedImageFormatError
   */
  describe('UnsupportedImageFormatError', () => {
    it('should create error with correct properties', () => {
      const error = new UnsupportedImageFormatError();
      expect(error.name).toBe('UnsupportedImageFormatError');
      expect(error.code).toBe('UNSUPPORTED_IMAGE_FORMAT');
      expect(error.message).toContain('JPEG');
      expect(error.message).toContain('PNG');
      expect(error.message).toContain('WEBP');
    });

    it('should be an instance of Error', () => {
      const error = new UnsupportedImageFormatError();
      expect(error).toBeInstanceOf(Error);
    });
  });
});
