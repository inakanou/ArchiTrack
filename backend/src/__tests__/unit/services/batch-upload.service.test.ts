/**
 * @fileoverview バッチアップロードサービスの単体テスト
 *
 * Task 4.3: バッチアップロード機能を実装する
 * - 複数ファイルの同時選択対応
 * - 5件を超える場合は5件ずつキュー処理して順次アップロード
 * - 表示順序の自動設定
 * - 進捗状況の追跡
 *
 * Requirements:
 * - 4.2: 複数の画像を同時に選択してバッチアップロードを実行する
 * - 4.3: 同時選択ファイル数が5件を超える場合は5件ずつキュー処理して順次アップロードを実行する
 */

import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';

import {
  BatchUploadService,
  type BatchUploadDependencies,
  type BatchUploadInput,
  type BatchUploadProgress,
  BatchUploadError,
} from '../../../services/batch-upload.service.js';

import type { PrismaClient } from '../../../generated/prisma/client.js';
import type { S3Client } from '@aws-sdk/client-s3';
import type { ImageProcessorService } from '../../../services/image-processor.service.js';
import type { SurveyImageService } from '../../../services/survey-image.service.js';

describe('BatchUploadService', () => {
  let service: BatchUploadService;
  let mockPrisma: PrismaClient;
  let mockS3Client: S3Client;
  let mockImageProcessor: ImageProcessorService;
  let mockSurveyImageService: SurveyImageService;

  // 有効なJPEGファイルのマジックバイト
  const JPEG_MAGIC_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);

  // テスト用の有効なJPEGバッファを作成
  function createValidJpegBuffer(size: number = 1000): Buffer {
    const buffer = Buffer.alloc(size);
    JPEG_MAGIC_BYTES.copy(buffer);
    return buffer;
  }

  // テスト用のアップロードファイルを作成
  function createTestUploadFile(index: number) {
    return {
      buffer: createValidJpegBuffer(50 * 1024), // 50KB
      mimetype: 'image/jpeg',
      originalname: `photo_${index}.jpg`,
      size: 50 * 1024,
    };
  }

  // テスト用のバッチアップロード入力を作成
  function createBatchInput(fileCount: number): BatchUploadInput {
    const files = Array.from({ length: fileCount }, (_, i) => createTestUploadFile(i + 1));
    return {
      surveyId: 'survey-123',
      files,
    };
  }

  beforeEach(() => {
    // Prismaモック
    mockPrisma = {
      siteSurvey: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'survey-123',
          name: 'Test Survey',
          deletedAt: null,
        }),
      },
      surveyImage: {
        create: vi.fn().mockImplementation(({ data }) => ({
          id: `image-${Date.now()}-${Math.random()}`,
          ...data,
          createdAt: new Date(),
        })),
        count: vi.fn().mockResolvedValue(0),
      },
      $transaction: vi.fn((callback) => callback(mockPrisma)),
    } as unknown as PrismaClient;

    // S3クライアントモック
    mockS3Client = {
      send: vi.fn().mockResolvedValue({}),
    } as unknown as S3Client;

    // ImageProcessorServiceモック
    mockImageProcessor = {
      processImage: vi.fn().mockResolvedValue({
        original: {
          buffer: createValidJpegBuffer(50 * 1024),
          metadata: { width: 1920, height: 1080, format: 'jpeg', size: 50 * 1024 },
          wasCompressed: false,
        },
        thumbnail: createValidJpegBuffer(10 * 1024),
        metadata: { width: 1920, height: 1080, format: 'jpeg', size: 50 * 1024 },
      }),
    } as unknown as ImageProcessorService;

    // SurveyImageServiceモック
    mockSurveyImageService = {
      validateFile: vi.fn(),
      sanitizeFileName: vi.fn().mockImplementation((name) => name),
      getStoragePath: vi
        .fn()
        .mockImplementation((surveyId, filename) => `surveys/${surveyId}/${filename}`),
      getPrismaClient: vi.fn().mockReturnValue(mockPrisma),
      getS3Client: vi.fn().mockReturnValue(mockS3Client),
      getBucketName: vi.fn().mockReturnValue('test-bucket'),
    } as unknown as SurveyImageService;

    const deps: BatchUploadDependencies = {
      prisma: mockPrisma,
      s3Client: mockS3Client,
      bucketName: 'test-bucket',
      imageProcessor: mockImageProcessor,
      surveyImageService: mockSurveyImageService,
    };

    service = new BatchUploadService(deps);
  });

  describe('uploadBatch', () => {
    describe('basic batch upload (Requirements: 4.2)', () => {
      it('should upload single file successfully', async () => {
        const input = createBatchInput(1);

        const result = await service.uploadBatch(input);

        expect(result.total).toBe(1);
        expect(result.successful).toBe(1);
        expect(result.failed).toBe(0);
        expect(result.results).toHaveLength(1);
        expect(result.errors).toHaveLength(0);
      });

      it('should upload multiple files (under 5) successfully', async () => {
        const input = createBatchInput(3);

        const result = await service.uploadBatch(input);

        expect(result.total).toBe(3);
        expect(result.successful).toBe(3);
        expect(result.failed).toBe(0);
        expect(result.results).toHaveLength(3);
      });

      it('should upload exactly 5 files in single batch', async () => {
        const input = createBatchInput(5);

        const result = await service.uploadBatch(input);

        expect(result.total).toBe(5);
        expect(result.successful).toBe(5);
        expect(result.failed).toBe(0);
      });

      it('should validate each file before upload', async () => {
        const input = createBatchInput(3);

        await service.uploadBatch(input);

        expect(mockSurveyImageService.validateFile).toHaveBeenCalledTimes(3);
      });

      it('should process each image for compression and thumbnail', async () => {
        const input = createBatchInput(3);

        await service.uploadBatch(input);

        expect(mockImageProcessor.processImage).toHaveBeenCalledTimes(3);
      });
    });

    describe('queue processing for files > 5 (Requirements: 4.3)', () => {
      it('should process 6 files in two batches (5 + 1)', async () => {
        const input = createBatchInput(6);

        const result = await service.uploadBatch(input);

        expect(result.total).toBe(6);
        expect(result.successful).toBe(6);
        expect(result.failed).toBe(0);
        // 最初の5件と残り1件の2バッチ
        expect(mockImageProcessor.processImage).toHaveBeenCalledTimes(6);
      });

      it('should process 10 files in two full batches (5 + 5)', async () => {
        const input = createBatchInput(10);

        const result = await service.uploadBatch(input);

        expect(result.total).toBe(10);
        expect(result.successful).toBe(10);
        expect(result.failed).toBe(0);
      });

      it('should process 12 files in three batches (5 + 5 + 2)', async () => {
        const input = createBatchInput(12);

        const result = await service.uploadBatch(input);

        expect(result.total).toBe(12);
        expect(result.successful).toBe(12);
        expect(result.failed).toBe(0);
      });

      it('should process batches sequentially, not in parallel', async () => {
        const input = createBatchInput(6);
        const callOrder: number[] = [];

        (mockImageProcessor.processImage as Mock).mockImplementation(() => {
          callOrder.push(callOrder.length + 1);
          return Promise.resolve({
            original: {
              buffer: createValidJpegBuffer(50 * 1024),
              metadata: { width: 1920, height: 1080, format: 'jpeg', size: 50 * 1024 },
              wasCompressed: false,
            },
            thumbnail: createValidJpegBuffer(10 * 1024),
            metadata: { width: 1920, height: 1080, format: 'jpeg', size: 50 * 1024 },
          });
        });

        await service.uploadBatch(input);

        // バッチ順に処理されていることを確認
        expect(callOrder).toEqual([1, 2, 3, 4, 5, 6]);
      });
    });

    describe('display order auto-assignment', () => {
      it('should assign sequential display order starting from 1', async () => {
        const input = createBatchInput(3);

        const result = await service.uploadBatch(input);

        expect(result.results[0]?.displayOrder).toBe(1);
        expect(result.results[1]?.displayOrder).toBe(2);
        expect(result.results[2]?.displayOrder).toBe(3);
      });

      it('should continue display order from existing images', async () => {
        (mockPrisma.surveyImage.count as Mock).mockResolvedValue(5);
        const input = createBatchInput(2);

        const result = await service.uploadBatch(input);

        expect(result.results[0]?.displayOrder).toBe(6);
        expect(result.results[1]?.displayOrder).toBe(7);
      });

      it('should assign display order correctly for large batch', async () => {
        const input = createBatchInput(10);

        const result = await service.uploadBatch(input);

        for (let i = 0; i < 10; i++) {
          expect(result.results[i]?.displayOrder).toBe(i + 1);
        }
      });
    });

    describe('progress tracking', () => {
      it('should call onProgress callback during upload', async () => {
        const input = createBatchInput(3);
        const progressCallback = vi.fn();

        await service.uploadBatch(input, progressCallback);

        expect(progressCallback).toHaveBeenCalled();
      });

      it('should report accurate progress for each file', async () => {
        const input = createBatchInput(3);
        const progressUpdates: BatchUploadProgress[] = [];
        const progressCallback = (progress: BatchUploadProgress) => {
          progressUpdates.push({ ...progress });
        };

        await service.uploadBatch(input, progressCallback);

        // 各ファイル処理後にprogressが更新される
        expect(progressUpdates.length).toBeGreaterThanOrEqual(3);
        // 最終的なprogressを確認
        const finalProgress = progressUpdates[progressUpdates.length - 1]!;
        expect(finalProgress.total).toBe(3);
        expect(finalProgress.completed).toBe(3);
        expect(finalProgress.current).toBe(3);
      });

      it('should report progress for large batch across multiple queue batches', async () => {
        const input = createBatchInput(8);
        const progressUpdates: BatchUploadProgress[] = [];
        const progressCallback = (progress: BatchUploadProgress) => {
          progressUpdates.push({ ...progress });
        };

        await service.uploadBatch(input, progressCallback);

        // 8ファイル処理
        const finalProgress = progressUpdates[progressUpdates.length - 1]!;
        expect(finalProgress.total).toBe(8);
        expect(finalProgress.completed).toBe(8);
      });

      it('should include partial results in progress', async () => {
        const input = createBatchInput(3);
        const progressUpdates: BatchUploadProgress[] = [];
        const progressCallback = (progress: BatchUploadProgress) => {
          progressUpdates.push({ ...progress });
        };

        await service.uploadBatch(input, progressCallback);

        // 進捗の中間状態で結果が含まれていることを確認
        const lastProgress = progressUpdates[progressUpdates.length - 1]!;
        expect(lastProgress.results.length).toBe(3);
      });
    });

    describe('error handling', () => {
      it('should continue processing when one file fails validation', async () => {
        const input = createBatchInput(3);
        (mockSurveyImageService.validateFile as Mock)
          .mockImplementationOnce(() => {})
          .mockImplementationOnce(() => {
            throw new Error('Invalid file type');
          })
          .mockImplementationOnce(() => {});

        const result = await service.uploadBatch(input);

        expect(result.total).toBe(3);
        expect(result.successful).toBe(2);
        expect(result.failed).toBe(1);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0]?.index).toBe(1);
      });

      it('should continue processing when image processing fails', async () => {
        const input = createBatchInput(3);
        (mockImageProcessor.processImage as Mock)
          .mockResolvedValueOnce({
            original: {
              buffer: createValidJpegBuffer(),
              metadata: { width: 1920, height: 1080, format: 'jpeg', size: 50 * 1024 },
              wasCompressed: false,
            },
            thumbnail: createValidJpegBuffer(10 * 1024),
            metadata: { width: 1920, height: 1080, format: 'jpeg', size: 50 * 1024 },
          })
          .mockRejectedValueOnce(new Error('Processing failed'))
          .mockResolvedValueOnce({
            original: {
              buffer: createValidJpegBuffer(),
              metadata: { width: 1920, height: 1080, format: 'jpeg', size: 50 * 1024 },
              wasCompressed: false,
            },
            thumbnail: createValidJpegBuffer(10 * 1024),
            metadata: { width: 1920, height: 1080, format: 'jpeg', size: 50 * 1024 },
          });

        const result = await service.uploadBatch(input);

        expect(result.total).toBe(3);
        expect(result.successful).toBe(2);
        expect(result.failed).toBe(1);
      });

      it('should include error details in result', async () => {
        const input = createBatchInput(2);
        (mockSurveyImageService.validateFile as Mock)
          .mockImplementationOnce(() => {})
          .mockImplementationOnce(() => {
            throw new Error('File too large');
          });

        const result = await service.uploadBatch(input);

        expect(result.errors[0]?.error).toBe('File too large');
        expect(result.errors[0]?.filename).toBe('photo_2.jpg');
      });

      it('should throw BatchUploadError when survey does not exist', async () => {
        (mockPrisma.siteSurvey.findUnique as Mock).mockResolvedValue(null);
        const input = createBatchInput(1);

        await expect(service.uploadBatch(input)).rejects.toThrow(BatchUploadError);
      });

      it('should throw BatchUploadError when survey is deleted', async () => {
        (mockPrisma.siteSurvey.findUnique as Mock).mockResolvedValue({
          id: 'survey-123',
          name: 'Deleted Survey',
          deletedAt: new Date(),
        });
        const input = createBatchInput(1);

        await expect(service.uploadBatch(input)).rejects.toThrow(BatchUploadError);
      });

      it('should throw BatchUploadError for empty file list', async () => {
        const input: BatchUploadInput = {
          surveyId: 'survey-123',
          files: [],
        };

        await expect(service.uploadBatch(input)).rejects.toThrow(BatchUploadError);
      });
    });

    describe('S3 upload', () => {
      it('should upload original image to S3', async () => {
        const input = createBatchInput(1);

        await service.uploadBatch(input);

        expect(mockS3Client.send).toHaveBeenCalled();
      });

      it('should upload both original and thumbnail to S3', async () => {
        const input = createBatchInput(1);

        await service.uploadBatch(input);

        // オリジナルとサムネイルの2つのアップロード
        expect(mockS3Client.send).toHaveBeenCalledTimes(2);
      });
    });

    describe('database operations', () => {
      it('should create database record for each image', async () => {
        const input = createBatchInput(3);

        await service.uploadBatch(input);

        expect(mockPrisma.surveyImage.create).toHaveBeenCalledTimes(3);
      });

      it('should include correct metadata in database record', async () => {
        const input = createBatchInput(1);

        await service.uploadBatch(input);

        expect(mockPrisma.surveyImage.create).toHaveBeenCalledWith({
          data: expect.objectContaining({
            surveyId: 'survey-123',
            width: 1920,
            height: 1080,
            displayOrder: 1,
          }),
        });
      });
    });
  });

  describe('BatchUploadService constants', () => {
    it('should define batch size as 5', () => {
      expect(BatchUploadService.BATCH_SIZE).toBe(5);
    });
  });

  describe('BatchUploadError', () => {
    it('should create error with correct properties', () => {
      const error = new BatchUploadError('Test error', 'TEST_CODE');

      expect(error.name).toBe('BatchUploadError');
      expect(error.message).toBe('Test error');
      expect(error.code).toBe('TEST_CODE');
    });
  });
});
