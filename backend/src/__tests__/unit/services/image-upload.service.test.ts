/**
 * @fileoverview 画像アップロードサービスのテスト
 *
 * Task 24.2: ImageServiceの単体テストを実装する
 * - 画像アップロードのテスト
 * - 圧縮・サムネイル生成のテスト
 * - ファイル形式バリデーションのテスト
 * - バッチアップロードのキュー処理テスト
 *
 * Requirements:
 * - 4.1: 画像をストレージに保存し現場調査に紐付ける
 * - 4.2: バッチアップロードを実行する
 * - 4.3: 5件を超える場合は5件ずつキュー処理
 * - 4.4: 画像アップロード完了時にサムネイルを自動生成する
 * - 4.5: 許可されない形式の場合エラーメッセージを表示してアップロードを拒否する
 * - 4.6: ファイルサイズが上限を超える場合、圧縮した上で登録する
 * - 4.7: ユーザーが画像を削除すると、画像と関連する注釈データを削除する
 * - 4.8: JPEG、PNG、WEBP形式の画像ファイルをサポートする
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

  describe('upload (Requirements: 4.1, 4.4, 4.6)', () => {
    it('アップロード時にサムネイルが自動生成されること (Req 4.4)', async () => {
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
      mockPrisma.surveyImage.count.mockResolvedValue(0);
      mockSurveyImageService.validateFile.mockReturnValue(undefined);
      mockSurveyImageService.sanitizeFileName.mockReturnValue('test.jpg');
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
        displayOrder: 1,
        originalPath: 'surveys/123/test.jpg',
        thumbnailPath: 'surveys/123/thumb_test.jpg',
        createdAt: new Date(),
      });

      await service.upload(input);

      // processImageが呼ばれていることでサムネイル生成を確認
      expect(mockImageProcessorService.processImage).toHaveBeenCalledWith(file.buffer);
      // S3に原画像とサムネイルの両方がアップロードされること
      expect(mockS3Client.send).toHaveBeenCalledTimes(2);
    });

    it('指定されたdisplayOrderを使用すること', async () => {
      const surveyId = '123e4567-e89b-12d3-a456-426614174000';
      const file = {
        buffer: Buffer.from('test'),
        mimetype: 'image/jpeg',
        originalname: 'test.jpg',
        size: 1024,
      };
      const input: UploadInput = { surveyId, file, displayOrder: 5 };

      mockPrisma.siteSurvey.findUnique.mockResolvedValue({
        id: surveyId,
        deletedAt: null,
      });
      mockPrisma.surveyImage.count.mockResolvedValue(10);
      mockSurveyImageService.validateFile.mockReturnValue(undefined);
      mockSurveyImageService.sanitizeFileName.mockReturnValue('test.jpg');
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
        displayOrder: 5, // 指定された値
        originalPath: 'surveys/123/test.jpg',
        thumbnailPath: 'surveys/123/thumb_test.jpg',
        createdAt: new Date(),
      });

      const result = await service.upload(input);

      expect(result.displayOrder).toBe(5);
      expect(mockPrisma.surveyImage.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            displayOrder: 5,
          }),
        })
      );
    });

    it('displayOrderが未指定の場合は自動計算すること', async () => {
      const surveyId = '123e4567-e89b-12d3-a456-426614174000';
      const file = {
        buffer: Buffer.from('test'),
        mimetype: 'image/jpeg',
        originalname: 'test.jpg',
        size: 1024,
      };
      const input: UploadInput = { surveyId, file }; // displayOrder未指定

      mockPrisma.siteSurvey.findUnique.mockResolvedValue({
        id: surveyId,
        deletedAt: null,
      });
      // 現在3件の画像がある
      mockPrisma.surveyImage.count.mockResolvedValue(3);
      mockSurveyImageService.validateFile.mockReturnValue(undefined);
      mockSurveyImageService.sanitizeFileName.mockReturnValue('test.jpg');
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
        displayOrder: 4, // 3 + 1 = 4
        originalPath: 'surveys/123/test.jpg',
        thumbnailPath: 'surveys/123/thumb_test.jpg',
        createdAt: new Date(),
      });

      const result = await service.upload(input);

      expect(result.displayOrder).toBe(4);
    });

    it('バリデーションエラー時はアップロードを拒否すること (Req 4.5)', async () => {
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
      mockPrisma.surveyImage.count.mockResolvedValue(0);
      // バリデーションエラーをスロー
      mockSurveyImageService.validateFile.mockImplementation(() => {
        throw new Error('サポートされていないファイル形式です');
      });

      await expect(service.upload(input)).rejects.toThrow('サポートされていないファイル形式です');
      // S3アップロードは呼ばれていないこと
      expect(mockS3Client.send).not.toHaveBeenCalled();
    });
  });

  describe('uploadBatch (Requirements: 4.2, 4.3)', () => {
    it('複数画像を正常にバッチアップロードすること (Req 4.2)', async () => {
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
          mimetype: 'image/png',
          originalname: 'test2.png',
          size: 2048,
        },
        {
          buffer: Buffer.from('test3'),
          mimetype: 'image/webp',
          originalname: 'test3.webp',
          size: 3072,
        },
      ];

      mockPrisma.siteSurvey.findUnique.mockResolvedValue({
        id: surveyId,
        deletedAt: null,
      });
      mockPrisma.surveyImage.count.mockResolvedValue(0);
      mockSurveyImageService.validateFile.mockReturnValue(undefined);
      mockSurveyImageService.sanitizeFileName.mockImplementation((name: string) => name);
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

      let imageIndex = 0;
      mockPrisma.surveyImage.create.mockImplementation(() => {
        imageIndex++;
        return Promise.resolve({
          id: `img-${imageIndex}`,
          surveyId,
          fileName: files[imageIndex - 1]!.originalname,
          fileSize: files[imageIndex - 1]!.size,
          width: 800,
          height: 600,
          displayOrder: imageIndex,
          originalPath: `surveys/${surveyId}/test${imageIndex}.jpg`,
          thumbnailPath: `surveys/${surveyId}/thumb_test${imageIndex}.jpg`,
          createdAt: new Date(),
        });
      });

      const result = await service.uploadBatch(surveyId, files);

      expect(result.successful).toHaveLength(3);
      expect(result.failed).toHaveLength(0);
      expect(result.successful[0]!.displayOrder).toBe(1);
      expect(result.successful[1]!.displayOrder).toBe(2);
      expect(result.successful[2]!.displayOrder).toBe(3);
    });

    it('一部のファイルが失敗しても他は成功すること', async () => {
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
      mockPrisma.surveyImage.count.mockResolvedValue(0);

      // 最初のファイルはバリデーション失敗、2番目は成功
      let validateCallCount = 0;
      mockSurveyImageService.validateFile.mockImplementation(() => {
        validateCallCount++;
        if (validateCallCount === 1) {
          throw new Error('Invalid file');
        }
      });
      mockSurveyImageService.sanitizeFileName.mockImplementation((name: string) => name);
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
        id: 'img-2',
        surveyId,
        fileName: 'test2.jpg',
        fileSize: 2048,
        width: 800,
        height: 600,
        displayOrder: 2,
        originalPath: `surveys/${surveyId}/test2.jpg`,
        thumbnailPath: `surveys/${surveyId}/thumb_test2.jpg`,
        createdAt: new Date(),
      });

      const result = await service.uploadBatch(surveyId, files);

      expect(result.successful).toHaveLength(1);
      expect(result.failed).toHaveLength(1);
      expect(result.failed[0]!.fileName).toBe('test1.jpg');
      expect(result.failed[0]!.error).toContain('Invalid file');
    });

    it('アップロード中に上限に達した場合、残りのファイルは失敗すること', async () => {
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
        {
          buffer: Buffer.from('test3'),
          mimetype: 'image/jpeg',
          originalname: 'test3.jpg',
          size: 3072,
        },
      ];

      mockPrisma.siteSurvey.findUnique.mockResolvedValue({
        id: surveyId,
        deletedAt: null,
      });
      // 現在49件（あと1件で上限）
      mockPrisma.surveyImage.count.mockResolvedValue(49);
      mockSurveyImageService.validateFile.mockReturnValue(undefined);
      mockSurveyImageService.sanitizeFileName.mockImplementation((name: string) => name);
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
        id: 'img-50',
        surveyId,
        fileName: 'test1.jpg',
        fileSize: 1024,
        width: 800,
        height: 600,
        displayOrder: 50,
        originalPath: `surveys/${surveyId}/test1.jpg`,
        thumbnailPath: `surveys/${surveyId}/thumb_test1.jpg`,
        createdAt: new Date(),
      });

      const result = await service.uploadBatch(surveyId, files);

      // 1件成功（50件目）、2件失敗（上限超過）
      expect(result.successful).toHaveLength(1);
      expect(result.failed).toHaveLength(2);
      expect(result.failed[0]!.error).toContain('上限');
      expect(result.failed[1]!.error).toContain('上限');
    });

    it('バッチアップロードで表示順序が連続して設定されること', async () => {
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
      // 現在5件の画像がある
      mockPrisma.surveyImage.count.mockResolvedValue(5);
      mockSurveyImageService.validateFile.mockReturnValue(undefined);
      mockSurveyImageService.sanitizeFileName.mockImplementation((name: string) => name);
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

      let imageCount = 5;
      mockPrisma.surveyImage.create.mockImplementation(() => {
        imageCount++;
        return Promise.resolve({
          id: `img-${imageCount}`,
          surveyId,
          fileName: `test${imageCount - 5}.jpg`,
          fileSize: 1024,
          width: 800,
          height: 600,
          displayOrder: imageCount, // 6, 7, ...
          originalPath: `surveys/${surveyId}/test.jpg`,
          thumbnailPath: `surveys/${surveyId}/thumb_test.jpg`,
          createdAt: new Date(),
        });
      });

      const result = await service.uploadBatch(surveyId, files);

      expect(result.successful).toHaveLength(2);
      // 既存5件 + 新規1件目 = 6, 既存5件 + 新規2件目 = 7
      expect(result.successful[0]!.displayOrder).toBe(6);
      expect(result.successful[1]!.displayOrder).toBe(7);
    });
  });

  describe('constants', () => {
    it('MAX_IMAGES_PER_SURVEYが50であること', () => {
      expect(ImageUploadService.MAX_IMAGES_PER_SURVEY).toBe(50);
    });
  });

  describe('error classes', () => {
    it('SurveyNotFoundErrorが正しいプロパティを持つこと', () => {
      const error = new SurveyNotFoundError('survey-123');
      expect(error.name).toBe('SurveyNotFoundError');
      expect(error.code).toBe('SURVEY_NOT_FOUND');
      expect(error.surveyId).toBe('survey-123');
      expect(error.message).toContain('survey-123');
    });

    it('MaxImagesExceededErrorが正しいプロパティを持つこと', () => {
      const error = new MaxImagesExceededError(50, 50);
      expect(error.name).toBe('MaxImagesExceededError');
      expect(error.code).toBe('MAX_IMAGES_EXCEEDED');
      expect(error.currentCount).toBe(50);
      expect(error.maxCount).toBe(50);
      expect(error.message).toContain('50');
    });
  });
});
