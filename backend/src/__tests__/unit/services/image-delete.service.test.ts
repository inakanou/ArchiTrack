/**
 * @fileoverview ImageDeleteServiceの単体テスト
 *
 * Task 4.5: 画像削除機能を実装する
 * - データベースからのメタデータ削除
 * - R2からのファイル削除（原画像・サムネイル両方）
 * - 関連する注釈データの削除
 * - 削除失敗時の孤立ファイルログ記録
 *
 * Requirements:
 * - 4.7: ユーザーが画像を削除すると、画像と関連する注釈データを削除する
 */

import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import type {
  PrismaClient,
  SurveyImage,
  ImageAnnotation,
} from '../../../generated/prisma/client.js';
import type { S3Client } from '@aws-sdk/client-s3';

// モックのLoggerをvi.hoisted()で定義
const mockLogger = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
}));

vi.mock('../../../utils/logger.js', () => ({
  default: mockLogger,
}));

import {
  ImageDeleteService,
  ImageNotFoundError,
  StorageDeletionFailedError,
  type ImageDeleteServiceDependencies,
} from '../../../services/image-delete.service.js';

describe('ImageDeleteService', () => {
  let service: ImageDeleteService;
  let mockPrisma: {
    surveyImage: {
      findUnique: Mock;
      delete: Mock;
    };
    imageAnnotation: {
      delete: Mock;
      findUnique: Mock;
    };
    $transaction: Mock;
  };
  let mockS3Client: {
    send: Mock;
  };

  const testImage: SurveyImage = {
    id: 'image-123',
    surveyId: 'survey-456',
    originalPath: 'surveys/survey-456/1234567890_test.jpg',
    thumbnailPath: 'surveys/survey-456/1234567890_test_thumb.jpg',
    fileName: 'test.jpg',
    fileSize: 150000,
    width: 1920,
    height: 1080,
    displayOrder: 1,
    comment: null,
    includeInReport: false,
    createdAt: new Date('2025-01-01'),
  };

  const testAnnotation: ImageAnnotation = {
    id: 'annotation-789',
    imageId: 'image-123',
    data: { version: '1.0', objects: [] },
    version: '1.0',
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-02'),
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockPrisma = {
      surveyImage: {
        findUnique: vi.fn(),
        delete: vi.fn(),
      },
      imageAnnotation: {
        delete: vi.fn(),
        findUnique: vi.fn(),
      },
      $transaction: vi.fn(),
    };

    mockS3Client = {
      send: vi.fn(),
    };

    const deps: ImageDeleteServiceDependencies = {
      prisma: mockPrisma as unknown as PrismaClient,
      s3Client: mockS3Client as unknown as S3Client,
      bucketName: 'test-bucket',
    };

    service = new ImageDeleteService(deps);
  });

  describe('delete', () => {
    describe('successful deletion (Requirements: 4.7)', () => {
      it('should delete image from database and R2 storage', async () => {
        // Arrange
        mockPrisma.surveyImage.findUnique.mockResolvedValue(testImage);
        mockPrisma.$transaction.mockImplementation(
          async (fn: (tx: unknown) => Promise<unknown>) => {
            return fn(mockPrisma);
          }
        );
        mockPrisma.surveyImage.delete.mockResolvedValue(testImage);
        mockS3Client.send.mockResolvedValue({});

        // Act
        await service.delete('image-123');

        // Assert
        expect(mockPrisma.surveyImage.findUnique).toHaveBeenCalledWith({
          where: { id: 'image-123' },
          include: { annotation: true },
        });
        expect(mockPrisma.surveyImage.delete).toHaveBeenCalledWith({
          where: { id: 'image-123' },
        });
        // S3 delete should be called for both original and thumbnail
        expect(mockS3Client.send).toHaveBeenCalledTimes(2);
      });

      it('should delete related annotation data when it exists', async () => {
        // Arrange
        const imageWithAnnotation = {
          ...testImage,
          annotation: testAnnotation,
        };
        mockPrisma.surveyImage.findUnique.mockResolvedValue(imageWithAnnotation);
        mockPrisma.$transaction.mockImplementation(
          async (fn: (tx: unknown) => Promise<unknown>) => {
            return fn(mockPrisma);
          }
        );
        mockPrisma.imageAnnotation.delete.mockResolvedValue(testAnnotation);
        mockPrisma.surveyImage.delete.mockResolvedValue(testImage);
        mockS3Client.send.mockResolvedValue({});

        // Act
        await service.delete('image-123');

        // Assert
        expect(mockPrisma.imageAnnotation.delete).toHaveBeenCalledWith({
          where: { imageId: 'image-123' },
        });
      });

      it('should not call annotation delete when no annotation exists', async () => {
        // Arrange
        const imageWithoutAnnotation = {
          ...testImage,
          annotation: null,
        };
        mockPrisma.surveyImage.findUnique.mockResolvedValue(imageWithoutAnnotation);
        mockPrisma.$transaction.mockImplementation(
          async (fn: (tx: unknown) => Promise<unknown>) => {
            return fn(mockPrisma);
          }
        );
        mockPrisma.surveyImage.delete.mockResolvedValue(testImage);
        mockS3Client.send.mockResolvedValue({});

        // Act
        await service.delete('image-123');

        // Assert
        expect(mockPrisma.imageAnnotation.delete).not.toHaveBeenCalled();
      });

      it('should delete both original and thumbnail from R2', async () => {
        // Arrange
        mockPrisma.surveyImage.findUnique.mockResolvedValue(testImage);
        mockPrisma.$transaction.mockImplementation(
          async (fn: (tx: unknown) => Promise<unknown>) => {
            return fn(mockPrisma);
          }
        );
        mockPrisma.surveyImage.delete.mockResolvedValue(testImage);
        mockS3Client.send.mockResolvedValue({});

        // Act
        await service.delete('image-123');

        // Assert
        const calls = mockS3Client.send.mock.calls;
        expect(calls.length).toBe(2);
        // Verify that DeleteObjectCommand was called with correct keys
        const firstCall = calls[0]![0];
        const secondCall = calls[1]![0];
        expect(firstCall.input.Bucket).toBe('test-bucket');
        expect(firstCall.input.Key).toBe(testImage.originalPath);
        expect(secondCall.input.Bucket).toBe('test-bucket');
        expect(secondCall.input.Key).toBe(testImage.thumbnailPath);
      });
    });

    describe('error handling', () => {
      it('should throw ImageNotFoundError when image does not exist', async () => {
        // Arrange
        mockPrisma.surveyImage.findUnique.mockResolvedValue(null);

        // Act & Assert
        await expect(service.delete('non-existent-id')).rejects.toThrow(ImageNotFoundError);
        expect(mockS3Client.send).not.toHaveBeenCalled();
      });

      it('should log orphaned file warning when R2 deletion fails for original image', async () => {
        // Arrange
        mockPrisma.surveyImage.findUnique.mockResolvedValue(testImage);
        mockPrisma.$transaction.mockImplementation(
          async (fn: (tx: unknown) => Promise<unknown>) => {
            return fn(mockPrisma);
          }
        );
        mockPrisma.surveyImage.delete.mockResolvedValue(testImage);
        // First call fails (original), second succeeds (thumbnail)
        mockS3Client.send
          .mockRejectedValueOnce(new Error('S3 deletion failed'))
          .mockResolvedValueOnce({});

        // Act
        await service.delete('image-123');

        // Assert - should log warning for orphaned file
        expect(mockLogger.warn).toHaveBeenCalledWith(
          expect.objectContaining({
            path: testImage.originalPath,
          }),
          expect.stringContaining('孤立ファイル')
        );
      });

      it('should log orphaned file warning when R2 deletion fails for thumbnail', async () => {
        // Arrange
        mockPrisma.surveyImage.findUnique.mockResolvedValue(testImage);
        mockPrisma.$transaction.mockImplementation(
          async (fn: (tx: unknown) => Promise<unknown>) => {
            return fn(mockPrisma);
          }
        );
        mockPrisma.surveyImage.delete.mockResolvedValue(testImage);
        // First call succeeds (original), second fails (thumbnail)
        mockS3Client.send
          .mockResolvedValueOnce({})
          .mockRejectedValueOnce(new Error('S3 deletion failed'));

        // Act
        await service.delete('image-123');

        // Assert - should log warning for orphaned file
        expect(mockLogger.warn).toHaveBeenCalledWith(
          expect.objectContaining({
            path: testImage.thumbnailPath,
          }),
          expect.stringContaining('孤立ファイル')
        );
      });

      it('should continue even if both R2 deletions fail (database deletion was successful)', async () => {
        // Arrange
        mockPrisma.surveyImage.findUnique.mockResolvedValue(testImage);
        mockPrisma.$transaction.mockImplementation(
          async (fn: (tx: unknown) => Promise<unknown>) => {
            return fn(mockPrisma);
          }
        );
        mockPrisma.surveyImage.delete.mockResolvedValue(testImage);
        // Both calls fail
        mockS3Client.send
          .mockRejectedValueOnce(new Error('S3 deletion failed'))
          .mockRejectedValueOnce(new Error('S3 deletion failed'));

        // Act - should not throw
        await expect(service.delete('image-123')).resolves.not.toThrow();

        // Assert - should log warnings for both orphaned files
        expect(mockLogger.warn).toHaveBeenCalledTimes(2);
      });

      it('should throw error when database deletion fails', async () => {
        // Arrange
        mockPrisma.surveyImage.findUnique.mockResolvedValue(testImage);
        mockPrisma.$transaction.mockRejectedValue(new Error('Database error'));

        // Act & Assert
        await expect(service.delete('image-123')).rejects.toThrow();
        // R2 deletion should not be attempted
        expect(mockS3Client.send).not.toHaveBeenCalled();
      });
    });
  });

  describe('deleteBySurveyId', () => {
    const testImages: SurveyImage[] = [
      {
        id: 'image-1',
        surveyId: 'survey-456',
        originalPath: 'surveys/survey-456/img1.jpg',
        thumbnailPath: 'surveys/survey-456/img1_thumb.jpg',
        fileName: 'img1.jpg',
        fileSize: 100000,
        width: 800,
        height: 600,
        displayOrder: 1,
        comment: null,
        includeInReport: false,
        createdAt: new Date('2025-01-01'),
      },
      {
        id: 'image-2',
        surveyId: 'survey-456',
        originalPath: 'surveys/survey-456/img2.jpg',
        thumbnailPath: 'surveys/survey-456/img2_thumb.jpg',
        fileName: 'img2.jpg',
        fileSize: 120000,
        width: 1024,
        height: 768,
        displayOrder: 2,
        comment: null,
        includeInReport: false,
        createdAt: new Date('2025-01-02'),
      },
    ];

    beforeEach(() => {
      // Add findMany mock for deleteBySurveyId tests
      (mockPrisma.surveyImage as unknown as { findMany: Mock }).findMany = vi.fn();
      (mockPrisma.surveyImage as unknown as { deleteMany: Mock }).deleteMany = vi.fn();
      (mockPrisma.imageAnnotation as unknown as { deleteMany: Mock }).deleteMany = vi.fn();
    });

    it('should delete all images for a survey', async () => {
      // Arrange
      const findManyMock = mockPrisma.surveyImage as unknown as { findMany: Mock };
      const deleteManyMock = mockPrisma.surveyImage as unknown as { deleteMany: Mock };
      const annotationDeleteManyMock = mockPrisma.imageAnnotation as unknown as {
        deleteMany: Mock;
      };

      findManyMock.findMany.mockResolvedValue(testImages);
      mockPrisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
        return fn(mockPrisma);
      });
      annotationDeleteManyMock.deleteMany.mockResolvedValue({ count: 2 });
      deleteManyMock.deleteMany.mockResolvedValue({ count: 2 });
      mockS3Client.send.mockResolvedValue({});

      // Act
      const result = await service.deleteBySurveyId('survey-456');

      // Assert
      expect(result.deletedCount).toBe(2);
      expect(findManyMock.findMany).toHaveBeenCalledWith({
        where: { surveyId: 'survey-456' },
      });
      // 4 S3 calls: 2 originals + 2 thumbnails
      expect(mockS3Client.send).toHaveBeenCalledTimes(4);
    });

    it('should return 0 when no images exist for survey', async () => {
      // Arrange
      const findManyMock = mockPrisma.surveyImage as unknown as { findMany: Mock };
      findManyMock.findMany.mockResolvedValue([]);

      // Act
      const result = await service.deleteBySurveyId('survey-456');

      // Assert
      expect(result.deletedCount).toBe(0);
      expect(mockS3Client.send).not.toHaveBeenCalled();
    });

    it('should log orphaned files when some R2 deletions fail', async () => {
      // Arrange
      const findManyMock = mockPrisma.surveyImage as unknown as { findMany: Mock };
      const deleteManyMock = mockPrisma.surveyImage as unknown as { deleteMany: Mock };
      const annotationDeleteManyMock = mockPrisma.imageAnnotation as unknown as {
        deleteMany: Mock;
      };

      findManyMock.findMany.mockResolvedValue(testImages);
      mockPrisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
        return fn(mockPrisma);
      });
      annotationDeleteManyMock.deleteMany.mockResolvedValue({ count: 0 });
      deleteManyMock.deleteMany.mockResolvedValue({ count: 2 });

      // First image original fails, rest succeed
      mockS3Client.send.mockRejectedValueOnce(new Error('S3 error')).mockResolvedValue({});

      // Act
      const result = await service.deleteBySurveyId('survey-456');

      // Assert
      expect(result.deletedCount).toBe(2);
      expect(result.orphanedFiles).toContain(testImages[0]!.originalPath);
      expect(mockLogger.warn).toHaveBeenCalled();
    });
  });

  describe('ImageNotFoundError', () => {
    it('should create error with correct properties', () => {
      const error = new ImageNotFoundError('test-id');

      expect(error.name).toBe('ImageNotFoundError');
      expect(error.code).toBe('IMAGE_NOT_FOUND');
      expect(error.imageId).toBe('test-id');
      expect(error.message).toContain('test-id');
    });
  });

  describe('StorageDeletionFailedError', () => {
    it('should create error with correct properties', () => {
      const originalError = new Error('S3 error');
      const error = new StorageDeletionFailedError('path/to/file', originalError);

      expect(error.name).toBe('StorageDeletionFailedError');
      expect(error.code).toBe('STORAGE_DELETION_FAILED');
      expect(error.path).toBe('path/to/file');
      expect(error.cause).toBe(originalError);
    });
  });

  describe('constructor validation', () => {
    it('should throw error when neither storageProvider nor s3Client+bucketName is provided', () => {
      const invalidDeps: ImageDeleteServiceDependencies = {
        prisma: mockPrisma as unknown as PrismaClient,
        // Neither storageProvider nor s3Client+bucketName
      };

      expect(() => new ImageDeleteService(invalidDeps)).toThrow(
        'Either storageProvider or s3Client+bucketName is required'
      );
    });

    it('should throw error when only s3Client is provided without bucketName', () => {
      const invalidDeps: ImageDeleteServiceDependencies = {
        prisma: mockPrisma as unknown as PrismaClient,
        s3Client: mockS3Client as unknown as S3Client,
        // Missing bucketName
      };

      expect(() => new ImageDeleteService(invalidDeps)).toThrow(
        'Either storageProvider or s3Client+bucketName is required'
      );
    });

    it('should throw error when only bucketName is provided without s3Client', () => {
      const invalidDeps: ImageDeleteServiceDependencies = {
        prisma: mockPrisma as unknown as PrismaClient,
        bucketName: 'test-bucket',
        // Missing s3Client
      };

      expect(() => new ImageDeleteService(invalidDeps)).toThrow(
        'Either storageProvider or s3Client+bucketName is required'
      );
    });
  });

  describe('storageProvider', () => {
    let mockStorageProvider: {
      delete: Mock;
    };

    beforeEach(() => {
      mockStorageProvider = {
        delete: vi.fn(),
      };
    });

    it('should use storageProvider.delete when storageProvider is provided', async () => {
      // Arrange
      const serviceWithStorageProvider = new ImageDeleteService({
        prisma: mockPrisma as unknown as PrismaClient,
        storageProvider:
          mockStorageProvider as unknown as import('../../../storage/storage-provider.interface.js').StorageProvider,
      });

      mockPrisma.surveyImage.findUnique.mockResolvedValue(testImage);
      mockPrisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
        return fn(mockPrisma);
      });
      mockPrisma.surveyImage.delete.mockResolvedValue(testImage);
      mockStorageProvider.delete.mockResolvedValue(undefined);

      // Act
      await serviceWithStorageProvider.delete('image-123');

      // Assert
      expect(mockStorageProvider.delete).toHaveBeenCalledWith(testImage.originalPath);
      expect(mockStorageProvider.delete).toHaveBeenCalledWith(testImage.thumbnailPath);
      expect(mockS3Client.send).not.toHaveBeenCalled();
    });

    it('should log warning when storageProvider.delete fails', async () => {
      // Arrange
      const serviceWithStorageProvider = new ImageDeleteService({
        prisma: mockPrisma as unknown as PrismaClient,
        storageProvider:
          mockStorageProvider as unknown as import('../../../storage/storage-provider.interface.js').StorageProvider,
      });

      mockPrisma.surveyImage.findUnique.mockResolvedValue(testImage);
      mockPrisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
        return fn(mockPrisma);
      });
      mockPrisma.surveyImage.delete.mockResolvedValue(testImage);
      mockStorageProvider.delete.mockRejectedValue(new Error('Storage error'));

      // Act
      await serviceWithStorageProvider.delete('image-123');

      // Assert - should log warning for orphaned files
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          path: testImage.originalPath,
        }),
        expect.stringContaining('孤立ファイル')
      );
    });
  });

  describe('deleteBySurveyId - thumbnail deletion failures', () => {
    const testImagesForThumbnailTest: SurveyImage[] = [
      {
        id: 'image-1',
        surveyId: 'survey-456',
        originalPath: 'surveys/survey-456/img1.jpg',
        thumbnailPath: 'surveys/survey-456/img1_thumb.jpg',
        fileName: 'img1.jpg',
        fileSize: 100000,
        width: 800,
        height: 600,
        displayOrder: 1,
        comment: null,
        includeInReport: false,
        createdAt: new Date('2025-01-01'),
      },
    ];

    beforeEach(() => {
      (mockPrisma.surveyImage as unknown as { findMany: Mock }).findMany = vi.fn();
      (mockPrisma.surveyImage as unknown as { deleteMany: Mock }).deleteMany = vi.fn();
      (mockPrisma.imageAnnotation as unknown as { deleteMany: Mock }).deleteMany = vi.fn();
    });

    it('should track orphaned files when thumbnail deletion fails', async () => {
      // Arrange
      const findManyMock = mockPrisma.surveyImage as unknown as { findMany: Mock };
      const deleteManyMock = mockPrisma.surveyImage as unknown as { deleteMany: Mock };
      const annotationDeleteManyMock = mockPrisma.imageAnnotation as unknown as {
        deleteMany: Mock;
      };

      findManyMock.findMany.mockResolvedValue(testImagesForThumbnailTest);
      mockPrisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
        return fn(mockPrisma);
      });
      annotationDeleteManyMock.deleteMany.mockResolvedValue({ count: 0 });
      deleteManyMock.deleteMany.mockResolvedValue({ count: 1 });

      // Original succeeds, thumbnail fails
      mockS3Client.send.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error('S3 error'));

      // Act
      const result = await service.deleteBySurveyId('survey-456');

      // Assert
      expect(result.deletedCount).toBe(1);
      expect(result.orphanedFiles).toContain(testImagesForThumbnailTest[0]!.thumbnailPath);
    });
  });
});
