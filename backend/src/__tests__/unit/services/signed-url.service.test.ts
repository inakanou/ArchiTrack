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
import type { PrismaClient } from '../../../generated/prisma/client.js';

// ストレージモジュールのモック
const mockStorageProvider = {
  type: 'r2' as const,
  getSignedUrl: vi
    .fn()
    .mockResolvedValue(
      'https://test-bucket.r2.cloudflarestorage.com/images/test.jpg?X-Amz-Signature=abc123&X-Amz-Expires=900'
    ),
  upload: vi.fn(),
  delete: vi.fn(),
  exists: vi.fn(),
  testConnection: vi.fn().mockResolvedValue(true),
  disconnect: vi.fn(),
};

vi.mock('../../../storage/index.js', () => ({
  isStorageConfigured: vi.fn(() => true),
  getStorageProvider: vi.fn(() => mockStorageProvider),
  getStorageType: vi.fn(() => 'r2'),
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

    // mockStorageProviderのモックをリセット
    mockStorageProvider.getSignedUrl.mockClear();
    mockStorageProvider.getSignedUrl.mockResolvedValue(
      'https://test-bucket.r2.cloudflarestorage.com/images/test.jpg?X-Amz-Signature=abc123&X-Amz-Expires=900'
    );

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
      expect(mockStorageProvider.getSignedUrl).toHaveBeenCalledWith(
        'surveys/test-survey-id/images/test.jpg',
        expect.objectContaining({ expiresIn: 900 })
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
      expect(mockStorageProvider.getSignedUrl).toHaveBeenCalledWith(
        'surveys/test-survey-id/thumbnails/test_thumb.jpg',
        expect.objectContaining({ expiresIn: 900 })
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
      expect(mockStorageProvider.getSignedUrl).toHaveBeenCalledWith(
        'surveys/test-survey-id/images/test.jpg',
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
      expect(mockStorageProvider.getSignedUrl).toHaveBeenCalledWith(
        'surveys/test-survey-id/images/test.jpg',
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

  describe('validateSurveyAccess', () => {
    it('should return true when user has project access', async () => {
      // Arrange
      const surveyId = 'test-survey-id';
      const userId = 'test-user-id';

      mockPrisma.siteSurvey.findUnique.mockResolvedValue({
        id: surveyId,
        projectId: 'test-project-id',
      });

      mockPrisma.project.findUnique.mockResolvedValue({
        id: 'test-project-id',
        deletedAt: null,
        createdById: userId,
        salesPersonId: null,
        constructionPersonId: null,
      });

      // Act
      const result = await signedUrlService.validateSurveyAccess(surveyId, userId);

      // Assert
      expect(result).toBe(true);
      // 画像単位の照会を行わずに現場調査から直接プロジェクトを解決する
      expect(mockPrisma.surveyImage.findUnique).not.toHaveBeenCalled();
    });

    it('should return true when user has admin role', async () => {
      // Arrange
      const surveyId = 'test-survey-id';
      const userId = 'admin-user-id';

      mockPrisma.siteSurvey.findUnique.mockResolvedValue({
        id: surveyId,
        projectId: 'test-project-id',
      });

      mockPrisma.project.findUnique.mockResolvedValue({
        id: 'test-project-id',
        deletedAt: null,
        createdById: 'other-user-id',
        salesPersonId: 'another-user-id',
        constructionPersonId: 'yet-another-user-id',
      });

      mockPrisma.userRole.findMany.mockResolvedValue([{ role: { name: 'admin' } }]);

      // Act
      const result = await signedUrlService.validateSurveyAccess(surveyId, userId);

      // Assert
      expect(result).toBe(true);
    });

    it('should return false when survey does not exist', async () => {
      // Arrange
      mockPrisma.siteSurvey.findUnique.mockResolvedValue(null);

      // Act
      const result = await signedUrlService.validateSurveyAccess('missing-survey-id', 'user-id');

      // Assert
      expect(result).toBe(false);
      expect(mockPrisma.project.findUnique).not.toHaveBeenCalled();
    });

    it('should return false when project is deleted', async () => {
      // Arrange
      const surveyId = 'test-survey-id';
      const userId = 'test-user-id';

      mockPrisma.siteSurvey.findUnique.mockResolvedValue({
        id: surveyId,
        projectId: 'test-project-id',
      });

      mockPrisma.project.findUnique.mockResolvedValue({
        id: 'test-project-id',
        deletedAt: new Date(),
        createdById: userId,
        salesPersonId: null,
        constructionPersonId: null,
      });

      // Act
      const result = await signedUrlService.validateSurveyAccess(surveyId, userId);

      // Assert
      expect(result).toBe(false);
    });

    it('should return false when user has no project access and no admin role', async () => {
      // Arrange
      const surveyId = 'test-survey-id';
      const userId = 'unrelated-user-id';

      mockPrisma.siteSurvey.findUnique.mockResolvedValue({
        id: surveyId,
        projectId: 'test-project-id',
      });

      mockPrisma.project.findUnique.mockResolvedValue({
        id: 'test-project-id',
        deletedAt: null,
        createdById: 'other-user-id',
        salesPersonId: 'another-user-id',
        constructionPersonId: 'yet-another-user-id',
      });

      mockPrisma.userRole.findMany.mockResolvedValue([{ role: { name: 'user' } }]);

      // Act
      const result = await signedUrlService.validateSurveyAccess(surveyId, userId);

      // Assert
      expect(result).toBe(false);
    });
  });

  /**
   * プロジェクト単位のアクセス可否判定（公開された入口）
   *
   * 現場調査単位ではなくプロジェクト単位で1回だけ可否を判定する入口を検証する。
   * プロジェクト内の写真をまとめて扱う経路では、写真ごと・現場調査ごとに判定を
   * 繰り返すと問い合わせ回数が枚数に比例する。現場調査機能の Requirement 38 が
   * 定める「枚数に比例させない」規約を満たすため、判定の入口をプロジェクト単位で
   * 公開する。判定基準（プロジェクト関係者または admin ロール）は変更しない。
   *
   * Requirements (quantity-table-generation): 49.9
   */
  describe('validateProjectAccess', () => {
    const projectId = 'test-project-id';

    it('プロジェクトの作成者にはアクセスを許可し、現場調査・画像の照会を行わない', async () => {
      // Arrange
      const userId = 'creator-user-id';
      mockPrisma.project.findUnique.mockResolvedValue({
        id: projectId,
        deletedAt: null,
        createdById: userId,
        salesPersonId: null,
        constructionPersonId: null,
      });

      // Act
      const result = await signedUrlService.validateProjectAccess(projectId, userId);

      // Assert
      expect(result).toBe(true);
      // プロジェクト単位で1回だけ判定する（写真枚数・現場調査数に比例させない）
      expect(mockPrisma.project.findUnique).toHaveBeenCalledTimes(1);
      expect(mockPrisma.surveyImage.findUnique).not.toHaveBeenCalled();
      expect(mockPrisma.siteSurvey.findUnique).not.toHaveBeenCalled();
    });

    it('プロジェクトの営業担当者にはアクセスを許可する', async () => {
      // Arrange
      const userId = 'sales-user-id';
      mockPrisma.project.findUnique.mockResolvedValue({
        id: projectId,
        deletedAt: null,
        createdById: 'other-user-id',
        salesPersonId: userId,
        constructionPersonId: null,
      });

      // Act & Assert
      await expect(signedUrlService.validateProjectAccess(projectId, userId)).resolves.toBe(true);
    });

    it('プロジェクトの工事担当者にはアクセスを許可する', async () => {
      // Arrange
      const userId = 'construction-user-id';
      mockPrisma.project.findUnique.mockResolvedValue({
        id: projectId,
        deletedAt: null,
        createdById: 'other-user-id',
        salesPersonId: 'another-user-id',
        constructionPersonId: userId,
      });

      // Act & Assert
      await expect(signedUrlService.validateProjectAccess(projectId, userId)).resolves.toBe(true);
    });

    it('関係者でなくても admin ロール保持者にはアクセスを許可する', async () => {
      // Arrange
      const userId = 'admin-user-id';
      mockPrisma.project.findUnique.mockResolvedValue({
        id: projectId,
        deletedAt: null,
        createdById: 'other-user-id',
        salesPersonId: 'another-user-id',
        constructionPersonId: 'yet-another-user-id',
      });
      mockPrisma.userRole.findMany.mockResolvedValue([{ role: { name: 'admin' } }]);

      // Act & Assert
      await expect(signedUrlService.validateProjectAccess(projectId, userId)).resolves.toBe(true);
    });

    it('関係者でも admin でもないユーザーのアクセスを拒否する', async () => {
      // Arrange
      const userId = 'unrelated-user-id';
      mockPrisma.project.findUnique.mockResolvedValue({
        id: projectId,
        deletedAt: null,
        createdById: 'other-user-id',
        salesPersonId: 'another-user-id',
        constructionPersonId: 'yet-another-user-id',
      });
      mockPrisma.userRole.findMany.mockResolvedValue([{ role: { name: 'user' } }]);

      // Act & Assert
      await expect(signedUrlService.validateProjectAccess(projectId, userId)).resolves.toBe(false);
    });

    it('プロジェクトが存在しない場合はアクセスを拒否する', async () => {
      // Arrange
      mockPrisma.project.findUnique.mockResolvedValue(null);

      // Act
      const result = await signedUrlService.validateProjectAccess('missing-project-id', 'user-id');

      // Assert
      expect(result).toBe(false);
      expect(mockPrisma.userRole.findMany).not.toHaveBeenCalled();
    });

    it('論理削除済みのプロジェクトはアクセスを拒否する', async () => {
      // Arrange
      const userId = 'creator-user-id';
      mockPrisma.project.findUnique.mockResolvedValue({
        id: projectId,
        deletedAt: new Date(),
        createdById: userId,
        salesPersonId: null,
        constructionPersonId: null,
      });

      // Act & Assert
      await expect(signedUrlService.validateProjectAccess(projectId, userId)).resolves.toBe(false);
    });

    it('現場調査単位の判定は公開されたプロジェクト単位の判定へ委譲する（判定基準を複製しない）', async () => {
      // Arrange
      const surveyId = 'test-survey-id';
      const userId = 'creator-user-id';
      const spy = vi.spyOn(signedUrlService, 'validateProjectAccess');
      mockPrisma.siteSurvey.findUnique.mockResolvedValue({
        id: surveyId,
        projectId,
      });
      mockPrisma.project.findUnique.mockResolvedValue({
        id: projectId,
        deletedAt: null,
        createdById: userId,
        salesPersonId: null,
        constructionPersonId: null,
      });

      // Act
      const result = await signedUrlService.validateSurveyAccess(surveyId, userId);

      // Assert
      expect(result).toBe(true);
      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy).toHaveBeenCalledWith(projectId, userId);
    });

    it('画像単位の判定も公開されたプロジェクト単位の判定へ委譲する（判定基準を複製しない）', async () => {
      // Arrange
      const imageId = 'test-image-id';
      const userId = 'creator-user-id';
      const spy = vi.spyOn(signedUrlService, 'validateProjectAccess');
      mockPrisma.surveyImage.findUnique.mockResolvedValue({
        id: imageId,
        surveyId: 'test-survey-id',
        survey: {
          id: 'test-survey-id',
          projectId,
        },
      });
      mockPrisma.project.findUnique.mockResolvedValue({
        id: projectId,
        deletedAt: null,
        createdById: userId,
        salesPersonId: null,
        constructionPersonId: null,
      });

      // Act
      const result = await signedUrlService.validateSignedUrlAccess(imageId, userId);

      // Assert
      expect(result).toBe(true);
      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy).toHaveBeenCalledWith(projectId, userId);
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
