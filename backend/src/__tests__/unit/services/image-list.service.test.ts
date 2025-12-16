/**
 * @fileoverview 画像一覧取得サービスのテスト
 *
 * Task 6.2: 画像管理エンドポイントを実装する
 * - GET /api/site-surveys/:id/images（一覧）
 *
 * Requirements:
 * - 4.9: 画像一覧を固定の表示順序で表示する
 *
 * @module tests/unit/services/image-list.service
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Prismaモック
const mockPrisma = {
  surveyImage: {
    findMany: vi.fn(),
    count: vi.fn(),
  },
  siteSurvey: {
    findUnique: vi.fn(),
  },
};

// SignedUrlServiceモック
const mockSignedUrlService = {
  generateSignedUrl: vi.fn(),
  generateBatchSignedUrls: vi.fn(),
};

vi.mock('../../../generated/prisma/client.js', () => ({
  PrismaClient: vi.fn(() => mockPrisma),
}));

import { ImageListService } from '../../../services/image-list.service.js';

describe('ImageListService', () => {
  let service: ImageListService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new ImageListService({
      prisma: mockPrisma as never,
      signedUrlService: mockSignedUrlService as never,
    });
  });

  describe('findBySurveyId', () => {
    it('現場調査に紐付く画像一覧をdisplayOrderでソートして返すこと', async () => {
      const surveyId = '123e4567-e89b-12d3-a456-426614174000';
      const mockImages = [
        {
          id: 'img-1',
          surveyId,
          fileName: 'image1.jpg',
          fileSize: 1024,
          width: 800,
          height: 600,
          displayOrder: 1,
          originalPath: 'surveys/123/original1.jpg',
          thumbnailPath: 'surveys/123/thumb1.jpg',
          createdAt: new Date('2024-01-01'),
        },
        {
          id: 'img-2',
          surveyId,
          fileName: 'image2.jpg',
          fileSize: 2048,
          width: 1024,
          height: 768,
          displayOrder: 2,
          originalPath: 'surveys/123/original2.jpg',
          thumbnailPath: 'surveys/123/thumb2.jpg',
          createdAt: new Date('2024-01-02'),
        },
      ];

      mockPrisma.surveyImage.findMany.mockResolvedValue(mockImages);

      const result = await service.findBySurveyId(surveyId);

      expect(result).toHaveLength(2);
      expect(result[0]?.id).toBe('img-1');
      expect(result[1]?.id).toBe('img-2');
      expect(mockPrisma.surveyImage.findMany).toHaveBeenCalledWith({
        where: { surveyId },
        orderBy: { displayOrder: 'asc' },
        select: expect.any(Object),
      });
    });

    it('画像がない場合は空配列を返すこと', async () => {
      const surveyId = '123e4567-e89b-12d3-a456-426614174000';
      mockPrisma.surveyImage.findMany.mockResolvedValue([]);

      const result = await service.findBySurveyId(surveyId);

      expect(result).toEqual([]);
    });
  });

  describe('findBySurveyIdWithUrls', () => {
    it('署名付きURLを含む画像一覧を返すこと', async () => {
      const surveyId = '123e4567-e89b-12d3-a456-426614174000';
      const userId = 'user-123';
      const mockImages = [
        {
          id: 'img-1',
          surveyId,
          fileName: 'image1.jpg',
          fileSize: 1024,
          width: 800,
          height: 600,
          displayOrder: 1,
          originalPath: 'surveys/123/original1.jpg',
          thumbnailPath: 'surveys/123/thumb1.jpg',
          createdAt: new Date('2024-01-01'),
        },
      ];

      mockPrisma.surveyImage.findMany.mockResolvedValue(mockImages);
      mockSignedUrlService.generateBatchSignedUrls.mockResolvedValue([
        { success: true, url: 'https://r2.example.com/original1', imageId: 'img-1' },
      ]);
      mockSignedUrlService.generateSignedUrl.mockResolvedValue('https://r2.example.com/thumbnail1');

      const result = await service.findBySurveyIdWithUrls(surveyId, userId);

      expect(result).toHaveLength(1);
      expect(result[0]?.originalUrl).toBeDefined();
      expect(result[0]?.thumbnailUrl).toBeDefined();
    });

    it('署名付きURL生成に失敗した画像にはnullを設定すること', async () => {
      const surveyId = '123e4567-e89b-12d3-a456-426614174000';
      const userId = 'user-123';
      const mockImages = [
        {
          id: 'img-1',
          surveyId,
          fileName: 'image1.jpg',
          fileSize: 1024,
          width: 800,
          height: 600,
          displayOrder: 1,
          originalPath: 'surveys/123/original1.jpg',
          thumbnailPath: 'surveys/123/thumb1.jpg',
          createdAt: new Date('2024-01-01'),
        },
      ];

      mockPrisma.surveyImage.findMany.mockResolvedValue(mockImages);
      mockSignedUrlService.generateBatchSignedUrls.mockResolvedValue([
        { success: false, error: 'GENERATION_FAILED', imageId: 'img-1' },
      ]);
      mockSignedUrlService.generateSignedUrl.mockRejectedValue(new Error('URL generation failed'));

      const result = await service.findBySurveyIdWithUrls(surveyId, userId);

      expect(result).toHaveLength(1);
      expect(result[0]?.originalUrl).toBeNull();
      expect(result[0]?.thumbnailUrl).toBeNull();
    });
  });

  describe('countBySurveyId', () => {
    it('現場調査に紐付く画像数を返すこと', async () => {
      const surveyId = '123e4567-e89b-12d3-a456-426614174000';
      mockPrisma.surveyImage.count.mockResolvedValue(5);

      const result = await service.countBySurveyId(surveyId);

      expect(result).toBe(5);
      expect(mockPrisma.surveyImage.count).toHaveBeenCalledWith({
        where: { surveyId },
      });
    });
  });
});
