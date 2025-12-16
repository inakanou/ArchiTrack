/**
 * @fileoverview 画像アップロードサービスのテスト
 *
 * Task 6.2: 画像管理エンドポイントを実装する
 * - POST /api/site-surveys/:id/images（アップロード、multipart/form-data）
 *
 * Requirements:
 * - 4.1: 画像をストレージに保存し現場調査に紐付ける
 * - 4.2: バッチアップロードを実行する
 *
 * @module tests/unit/services/image-upload.service
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Prismaモック
const mockPrisma = {
  siteSurvey: {
    findUnique: vi.fn(),
  },
  surveyImage: {
    create: vi.fn(),
    count: vi.fn(),
  },
  $transaction: vi.fn(),
};

// S3クライアントモック
const mockS3Client = {
  send: vi.fn(),
};

// SurveyImageServiceモック
const mockSurveyImageService = {
  validateFile: vi.fn(),
  getStoragePath: vi.fn(),
  sanitizeFileName: vi.fn(),
};

// ImageProcessorServiceモック
const mockImageProcessorService = {
  processImage: vi.fn(),
  getMetadata: vi.fn(),
};

vi.mock('@aws-sdk/client-s3', () => ({
  PutObjectCommand: class PutObjectCommand {
    constructor(public params: unknown) {}
  },
}));

import {
  ImageUploadService,
  SurveyNotFoundError,
  MaxImagesExceededError,
  type UploadInput,
} from '../../../services/image-upload.service.js';

describe('ImageUploadService', () => {
  let service: ImageUploadService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new ImageUploadService({
      prisma: mockPrisma as never,
      s3Client: mockS3Client as never,
      bucketName: 'test-bucket',
      surveyImageService: mockSurveyImageService as never,
      imageProcessorService: mockImageProcessorService as never,
    });
  });

  describe('upload', () => {
    it('正常に画像をアップロードしてデータベースに登録すること', async () => {
      const surveyId = '123e4567-e89b-12d3-a456-426614174000';
      const file = {
        buffer: Buffer.from('test'),
        mimetype: 'image/jpeg',
        originalname: 'test.jpg',
        size: 1024,
      };
      const input: UploadInput = { surveyId, file };

      mockPrisma.siteSurvey.findUnique.mockResolvedValue({
        id: surveyId,
        deletedAt: null,
      });
      mockPrisma.surveyImage.count.mockResolvedValue(5);
      mockSurveyImageService.validateFile.mockReturnValue(undefined);
      mockSurveyImageService.sanitizeFileName.mockReturnValue('test.jpg');
      mockSurveyImageService.getStoragePath.mockReturnValue('surveys/123/test.jpg');
      mockImageProcessorService.processImage.mockResolvedValue({
        original: {
          buffer: Buffer.from('processed'),
          metadata: { width: 800, height: 600, size: 1024, format: 'jpeg' },
          wasCompressed: false,
        },
        thumbnail: Buffer.from('thumbnail'),
        metadata: { width: 800, height: 600, size: 1024, format: 'jpeg' },
      });
      mockS3Client.send.mockResolvedValue({});
      mockPrisma.surveyImage.create.mockResolvedValue({
        id: 'img-new',
        surveyId,
        fileName: 'test.jpg',
        fileSize: 1024,
        width: 800,
        height: 600,
        displayOrder: 6,
        originalPath: 'surveys/123/test.jpg',
        thumbnailPath: 'surveys/123/thumb_test.jpg',
        createdAt: new Date(),
      });

      const result = await service.upload(input);

      expect(result.id).toBe('img-new');
      expect(result.fileName).toBe('test.jpg');
      expect(mockSurveyImageService.validateFile).toHaveBeenCalledWith(file);
      expect(mockImageProcessorService.processImage).toHaveBeenCalled();
      expect(mockS3Client.send).toHaveBeenCalledTimes(2); // 原画像 + サムネイル
    });

    it('現場調査が存在しない場合はSurveyNotFoundErrorをスローすること', async () => {
      const surveyId = '123e4567-e89b-12d3-a456-426614174000';
      const file = {
        buffer: Buffer.from('test'),
        mimetype: 'image/jpeg',
        originalname: 'test.jpg',
        size: 1024,
      };
      const input: UploadInput = { surveyId, file };

      mockPrisma.siteSurvey.findUnique.mockResolvedValue(null);

      await expect(service.upload(input)).rejects.toThrow(SurveyNotFoundError);
    });

    it('現場調査が削除済みの場合はSurveyNotFoundErrorをスローすること', async () => {
      const surveyId = '123e4567-e89b-12d3-a456-426614174000';
      const file = {
        buffer: Buffer.from('test'),
        mimetype: 'image/jpeg',
        originalname: 'test.jpg',
        size: 1024,
      };
      const input: UploadInput = { surveyId, file };

      mockPrisma.siteSurvey.findUnique.mockResolvedValue({
        id: surveyId,
        deletedAt: new Date(),
      });

      await expect(service.upload(input)).rejects.toThrow(SurveyNotFoundError);
    });

    it('画像数上限に達している場合はMaxImagesExceededErrorをスローすること', async () => {
      const surveyId = '123e4567-e89b-12d3-a456-426614174000';
      const file = {
        buffer: Buffer.from('test'),
        mimetype: 'image/jpeg',
        originalname: 'test.jpg',
        size: 1024,
      };
      const input: UploadInput = { surveyId, file };

      mockPrisma.siteSurvey.findUnique.mockResolvedValue({
        id: surveyId,
        deletedAt: null,
      });
      mockPrisma.surveyImage.count.mockResolvedValue(50); // 上限

      await expect(service.upload(input)).rejects.toThrow(MaxImagesExceededError);
    });
  });

  describe('uploadBatch', () => {
    it('現場調査が存在しない場合はSurveyNotFoundErrorをスローすること', async () => {
      const surveyId = '123e4567-e89b-12d3-a456-426614174000';
      const files = [
        {
          buffer: Buffer.from('test1'),
          mimetype: 'image/jpeg',
          originalname: 'test1.jpg',
          size: 1024,
        },
      ];

      mockPrisma.siteSurvey.findUnique.mockResolvedValue(null);

      await expect(service.uploadBatch(surveyId, files)).rejects.toThrow(SurveyNotFoundError);
    });

    it('現場調査が削除済みの場合はSurveyNotFoundErrorをスローすること', async () => {
      const surveyId = '123e4567-e89b-12d3-a456-426614174000';
      const files = [
        {
          buffer: Buffer.from('test1'),
          mimetype: 'image/jpeg',
          originalname: 'test1.jpg',
          size: 1024,
        },
      ];

      mockPrisma.siteSurvey.findUnique.mockResolvedValue({
        id: surveyId,
        deletedAt: new Date(),
      });

      await expect(service.uploadBatch(surveyId, files)).rejects.toThrow(SurveyNotFoundError);
    });

    it('画像数が既に上限に達している場合は全てのファイルが失敗すること', async () => {
      const surveyId = '123e4567-e89b-12d3-a456-426614174000';
      const files = [
        {
          buffer: Buffer.from('test1'),
          mimetype: 'image/jpeg',
          originalname: 'test1.jpg',
          size: 1024,
        },
        {
          buffer: Buffer.from('test2'),
          mimetype: 'image/jpeg',
          originalname: 'test2.jpg',
          size: 2048,
        },
      ];

      mockPrisma.siteSurvey.findUnique.mockResolvedValue({
        id: surveyId,
        deletedAt: null,
      });
      mockPrisma.surveyImage.count.mockResolvedValue(50); // 上限

      const results = await service.uploadBatch(surveyId, files);

      // 既に上限なので全て失敗
      expect(results.successful).toHaveLength(0);
      expect(results.failed).toHaveLength(2);
      expect(results.failed[0]?.error).toContain('上限');
      expect(results.failed[1]?.error).toContain('上限');
    });
  });

  describe('getNextDisplayOrder', () => {
    it('現在の画像数+1を返すこと', async () => {
      const surveyId = '123e4567-e89b-12d3-a456-426614174000';
      mockPrisma.surveyImage.count.mockResolvedValue(5);

      const result = await service.getNextDisplayOrder(surveyId);

      expect(result).toBe(6);
    });
  });
});
