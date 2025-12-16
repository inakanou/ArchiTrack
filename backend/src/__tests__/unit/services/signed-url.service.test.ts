/**
 * 署名付きURL生成・検証サービステスト
 *
 * Requirements: 4.1, 12.4, 14.6
 * - 署名付きURL生成（有効期限15分）
 * - オリジナル画像用とサムネイル用の両方に対応
 * - 署名付きURLの有効期限検証
 * - リクエストユーザーのプロジェクトアクセス権限検証
 */
import { describe, it, expect, beforeEach, vi, Mock } from 'vitest';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import type { PrismaClient } from '../../../generated/prisma/client.js';

// AWS SDKのモック
vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn(),
}));

vi.mock('@aws-sdk/client-s3', () => ({
  GetObjectCommand: vi.fn(),
  S3Client: vi.fn(),
}));

// S3Clientのモック
vi.mock('../../../config/storage.js', () => ({
  getS3Client: vi.fn(() => ({
    send: vi.fn(),
  })),
  getStorageConfig: vi.fn(() => ({
    bucketName: 'test-bucket',
    endpoint: 'https://test.r2.cloudflarestorage.com',
    publicUrl: null,
    region: 'auto',
  })),
}));

// loggerのモック
vi.mock('../../../utils/logger.js', () => ({
  default: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('SignedUrlService', () => {
  let signedUrlService: typeof import('../../../services/signed-url.service.js').SignedUrlService.prototype;
  let mockPrisma: {
    surveyImage: {
      findUnique: Mock;
    };
    siteSurvey: {
      findUnique: Mock;
    };
    project: {
      findUnique: Mock;
    };
    userRole: {
      findMany: Mock;
    };
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    // Prismaモックの作成
    mockPrisma = {
      surveyImage: {
        findUnique: vi.fn(),
      },
      siteSurvey: {
        findUnique: vi.fn(),
      },
      project: {
        findUnique: vi.fn(),
      },
      userRole: {
        findMany: vi.fn(),
      },
    };

    // getSignedUrlのモック
    (getSignedUrl as Mock).mockResolvedValue(
      'https://test-bucket.r2.cloudflarestorage.com/images/test.jpg?X-Amz-Signature=abc123&X-Amz-Expires=900'
    );

    // GetObjectCommandのモック
    (GetObjectCommand as unknown as Mock).mockImplementation(function (
      this: unknown,
      params: unknown
    ) {
      return { input: params };
    });

    // サービスをインポート
    const { SignedUrlService } = await import('../../../services/signed-url.service.js');
    signedUrlService = new SignedUrlService({
      prisma: mockPrisma as unknown as PrismaClient,
    });
  });

  describe('generateSignedUrl', () => {
    it('should generate a signed URL for an original image', async () => {
      // Arrange
      const imageId = 'test-image-id';
      const type: 'original' | 'thumbnail' = 'original';

      mockPrisma.surveyImage.findUnique.mockResolvedValue({
        id: imageId,
        surveyId: 'test-survey-id',
        originalPath: 'surveys/test-survey-id/images/test.jpg',
        thumbnailPath: 'surveys/test-survey-id/thumbnails/test_thumb.jpg',
      });

      // Act
      const result = await signedUrlService.generateSignedUrl(imageId, type);

      // Assert
      expect(result).toContain('https://');
      expect(getSignedUrl).toHaveBeenCalled();
      expect(GetObjectCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          Bucket: 'test-bucket',
          Key: 'surveys/test-survey-id/images/test.jpg',
        })
      );
    });

    it('should generate a signed URL for a thumbnail image', async () => {
      // Arrange
      const imageId = 'test-image-id';
      const type: 'original' | 'thumbnail' = 'thumbnail';

      mockPrisma.surveyImage.findUnique.mockResolvedValue({
        id: imageId,
        surveyId: 'test-survey-id',
        originalPath: 'surveys/test-survey-id/images/test.jpg',
        thumbnailPath: 'surveys/test-survey-id/thumbnails/test_thumb.jpg',
      });

      // Act
      const result = await signedUrlService.generateSignedUrl(imageId, type);

      // Assert
      expect(result).toContain('https://');
      expect(GetObjectCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          Bucket: 'test-bucket',
          Key: 'surveys/test-survey-id/thumbnails/test_thumb.jpg',
        })
      );
    });

    it('should generate URL with 15 minutes expiration by default', async () => {
      // Arrange
      const imageId = 'test-image-id';

      mockPrisma.surveyImage.findUnique.mockResolvedValue({
        id: imageId,
        surveyId: 'test-survey-id',
        originalPath: 'surveys/test-survey-id/images/test.jpg',
        thumbnailPath: 'surveys/test-survey-id/thumbnails/test_thumb.jpg',
      });

      // Act
      await signedUrlService.generateSignedUrl(imageId, 'original');

      // Assert
      expect(getSignedUrl).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.objectContaining({ expiresIn: 900 }) // 15 minutes = 900 seconds
      );
    });

    it('should throw ImageNotFoundError when image does not exist', async () => {
      // Arrange
      const imageId = 'non-existent-image-id';

      mockPrisma.surveyImage.findUnique.mockResolvedValue(null);

      // Act & Assert
      await expect(signedUrlService.generateSignedUrl(imageId, 'original')).rejects.toThrow(
        'Image not found'
      );
    });

    it('should allow custom expiration time', async () => {
      // Arrange
      const imageId = 'test-image-id';
      const customExpiresIn = 3600; // 1 hour

      mockPrisma.surveyImage.findUnique.mockResolvedValue({
        id: imageId,
        surveyId: 'test-survey-id',
        originalPath: 'surveys/test-survey-id/images/test.jpg',
        thumbnailPath: 'surveys/test-survey-id/thumbnails/test_thumb.jpg',
      });

      // Act
      await signedUrlService.generateSignedUrl(imageId, 'original', customExpiresIn);

      // Assert
      expect(getSignedUrl).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.objectContaining({ expiresIn: 3600 })
      );
    });
  });

  describe('validateSignedUrlAccess', () => {
    it('should return true when user has project access', async () => {
      // Arrange
      const imageId = 'test-image-id';
      const userId = 'test-user-id';

      // 画像が存在し、現場調査に紐付いている
      mockPrisma.surveyImage.findUnique.mockResolvedValue({
        id: imageId,
        surveyId: 'test-survey-id',
        survey: {
          id: 'test-survey-id',
          projectId: 'test-project-id',
        },
      });

      // プロジェクトが存在し、ユーザーがアクセス権を持っている
      mockPrisma.project.findUnique.mockResolvedValue({
        id: 'test-project-id',
        deletedAt: null,
        createdById: userId, // ユーザーがプロジェクト作成者
      });

      // Act
      const result = await signedUrlService.validateSignedUrlAccess(imageId, userId);

      // Assert
      expect(result).toBe(true);
    });

    it('should return true when user has admin role', async () => {
      // Arrange
      const imageId = 'test-image-id';
      const userId = 'admin-user-id';

      mockPrisma.surveyImage.findUnique.mockResolvedValue({
        id: imageId,
        surveyId: 'test-survey-id',
        survey: {
          id: 'test-survey-id',
          projectId: 'test-project-id',
        },
      });

      mockPrisma.project.findUnique.mockResolvedValue({
        id: 'test-project-id',
        deletedAt: null,
        createdById: 'other-user-id', // 別のユーザーが作成
      });

      // ユーザーがadminロールを持っている
      mockPrisma.userRole.findMany.mockResolvedValue([
        {
          role: { name: 'admin' },
        },
      ]);

      // Act
      const result = await signedUrlService.validateSignedUrlAccess(imageId, userId);

      // Assert
      expect(result).toBe(true);
    });

    it('should return false when image does not exist', async () => {
      // Arrange
      const imageId = 'non-existent-image-id';
      const userId = 'test-user-id';

      mockPrisma.surveyImage.findUnique.mockResolvedValue(null);

      // Act
      const result = await signedUrlService.validateSignedUrlAccess(imageId, userId);

      // Assert
      expect(result).toBe(false);
    });

    it('should return false when project is deleted', async () => {
      // Arrange
      const imageId = 'test-image-id';
      const userId = 'test-user-id';

      mockPrisma.surveyImage.findUnique.mockResolvedValue({
        id: imageId,
        surveyId: 'test-survey-id',
        survey: {
          id: 'test-survey-id',
          projectId: 'test-project-id',
        },
      });

      mockPrisma.project.findUnique.mockResolvedValue({
        id: 'test-project-id',
        deletedAt: new Date(), // プロジェクトが削除されている
        createdById: userId,
      });

      // Act
      const result = await signedUrlService.validateSignedUrlAccess(imageId, userId);

      // Assert
      expect(result).toBe(false);
    });

    it('should return false when user has no project access and no admin role', async () => {
      // Arrange
      const imageId = 'test-image-id';
      const userId = 'unauthorized-user-id';

      mockPrisma.surveyImage.findUnique.mockResolvedValue({
        id: imageId,
        surveyId: 'test-survey-id',
        survey: {
          id: 'test-survey-id',
          projectId: 'test-project-id',
        },
      });

      mockPrisma.project.findUnique.mockResolvedValue({
        id: 'test-project-id',
        deletedAt: null,
        createdById: 'other-user-id', // 別のユーザーが作成
        salesPersonId: 'another-user-id',
        constructionPersonId: 'yet-another-user-id',
      });

      // ユーザーがadminロールを持っていない
      mockPrisma.userRole.findMany.mockResolvedValue([
        {
          role: { name: 'user' },
        },
      ]);

      // Act
      const result = await signedUrlService.validateSignedUrlAccess(imageId, userId);

      // Assert
      expect(result).toBe(false);
    });

    it('should return true when user is project sales person', async () => {
      // Arrange
      const imageId = 'test-image-id';
      const userId = 'sales-person-id';

      mockPrisma.surveyImage.findUnique.mockResolvedValue({
        id: imageId,
        surveyId: 'test-survey-id',
        survey: {
          id: 'test-survey-id',
          projectId: 'test-project-id',
        },
      });

      mockPrisma.project.findUnique.mockResolvedValue({
        id: 'test-project-id',
        deletedAt: null,
        createdById: 'other-user-id',
        salesPersonId: userId, // ユーザーが営業担当者
        constructionPersonId: 'another-user-id',
      });

      // Act
      const result = await signedUrlService.validateSignedUrlAccess(imageId, userId);

      // Assert
      expect(result).toBe(true);
    });

    it('should return true when user is project construction person', async () => {
      // Arrange
      const imageId = 'test-image-id';
      const userId = 'construction-person-id';

      mockPrisma.surveyImage.findUnique.mockResolvedValue({
        id: imageId,
        surveyId: 'test-survey-id',
        survey: {
          id: 'test-survey-id',
          projectId: 'test-project-id',
        },
      });

      mockPrisma.project.findUnique.mockResolvedValue({
        id: 'test-project-id',
        deletedAt: null,
        createdById: 'other-user-id',
        salesPersonId: 'another-user-id',
        constructionPersonId: userId, // ユーザーが工事担当者
      });

      // Act
      const result = await signedUrlService.validateSignedUrlAccess(imageId, userId);

      // Assert
      expect(result).toBe(true);
    });
  });

  describe('getSignedUrlWithValidation', () => {
    it('should return signed URL when user has access', async () => {
      // Arrange
      const imageId = 'test-image-id';
      const userId = 'test-user-id';
      const type: 'original' | 'thumbnail' = 'original';

      mockPrisma.surveyImage.findUnique
        .mockResolvedValueOnce({
          id: imageId,
          surveyId: 'test-survey-id',
          survey: {
            id: 'test-survey-id',
            projectId: 'test-project-id',
          },
        })
        .mockResolvedValueOnce({
          id: imageId,
          surveyId: 'test-survey-id',
          originalPath: 'surveys/test-survey-id/images/test.jpg',
          thumbnailPath: 'surveys/test-survey-id/thumbnails/test_thumb.jpg',
        });

      mockPrisma.project.findUnique.mockResolvedValue({
        id: 'test-project-id',
        deletedAt: null,
        createdById: userId,
      });

      // Act
      const result = await signedUrlService.getSignedUrlWithValidation(imageId, userId, type);

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.url).toContain('https://');
      }
    });

    it('should return error when user has no access', async () => {
      // Arrange
      const imageId = 'test-image-id';
      const userId = 'unauthorized-user-id';
      const type: 'original' | 'thumbnail' = 'original';

      mockPrisma.surveyImage.findUnique.mockResolvedValue({
        id: imageId,
        surveyId: 'test-survey-id',
        survey: {
          id: 'test-survey-id',
          projectId: 'test-project-id',
        },
      });

      mockPrisma.project.findUnique.mockResolvedValue({
        id: 'test-project-id',
        deletedAt: null,
        createdById: 'other-user-id',
        salesPersonId: 'another-user-id',
        constructionPersonId: 'yet-another-user-id',
      });

      // ユーザーがadminロールを持っていない
      mockPrisma.userRole.findMany.mockResolvedValue([
        {
          role: { name: 'user' },
        },
      ]);

      // Act
      const result = await signedUrlService.getSignedUrlWithValidation(imageId, userId, type);

      // Assert
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('ACCESS_DENIED');
      }
    });

    it('should return error when image does not exist', async () => {
      // Arrange
      const imageId = 'non-existent-image-id';
      const userId = 'test-user-id';
      const type: 'original' | 'thumbnail' = 'original';

      mockPrisma.surveyImage.findUnique.mockResolvedValue(null);

      // Act
      const result = await signedUrlService.getSignedUrlWithValidation(imageId, userId, type);

      // Assert
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('IMAGE_NOT_FOUND');
      }
    });
  });

  describe('generateBatchSignedUrls', () => {
    it('should generate signed URLs for multiple images', async () => {
      // Arrange
      const imageIds = ['image-1', 'image-2', 'image-3'];
      const userId = 'test-user-id';

      // 各画像に対してモックを設定
      mockPrisma.surveyImage.findUnique.mockImplementation(async ({ where }) => {
        const id = where?.id;
        if (!id) return null;
        return {
          id,
          surveyId: 'test-survey-id',
          originalPath: `surveys/test-survey-id/images/${id}.jpg`,
          thumbnailPath: `surveys/test-survey-id/thumbnails/${id}_thumb.jpg`,
          survey: {
            id: 'test-survey-id',
            projectId: 'test-project-id',
          },
        };
      });

      mockPrisma.project.findUnique.mockResolvedValue({
        id: 'test-project-id',
        deletedAt: null,
        createdById: userId,
      });

      // Act
      const results = await signedUrlService.generateBatchSignedUrls(imageIds, userId, 'original');

      // Assert
      expect(results).toHaveLength(3);
      results.forEach((result) => {
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.url).toContain('https://');
        }
      });
    });

    it('should handle partial failures in batch', async () => {
      // Arrange
      const imageIds = ['image-1', 'non-existent-image', 'image-3'];
      const userId = 'test-user-id';

      mockPrisma.surveyImage.findUnique.mockImplementation(async ({ where }) => {
        const id = where?.id;
        if (id === 'non-existent-image') return null;
        return {
          id,
          surveyId: 'test-survey-id',
          originalPath: `surveys/test-survey-id/images/${id}.jpg`,
          thumbnailPath: `surveys/test-survey-id/thumbnails/${id}_thumb.jpg`,
          survey: {
            id: 'test-survey-id',
            projectId: 'test-project-id',
          },
        };
      });

      mockPrisma.project.findUnique.mockResolvedValue({
        id: 'test-project-id',
        deletedAt: null,
        createdById: userId,
      });

      // Act
      const results = await signedUrlService.generateBatchSignedUrls(imageIds, userId, 'original');

      // Assert
      expect(results).toHaveLength(3);
      const [result0, result1, result2] = results;
      expect(result0).toBeDefined();
      expect(result1).toBeDefined();
      expect(result2).toBeDefined();
      expect(result0!.success).toBe(true);
      expect(result1!.success).toBe(false);
      if (!result1!.success) {
        expect(result1!.error).toBe('IMAGE_NOT_FOUND');
      }
      expect(result2!.success).toBe(true);
    });
  });
});
