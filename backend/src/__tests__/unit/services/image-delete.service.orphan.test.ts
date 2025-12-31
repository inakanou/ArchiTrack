/**
 * @fileoverview ImageDeleteService 孤立ファイル処理のユニットテスト
 *
 * TDD: RED phase - テストを先に書く
 *
 * Task 32.1: ImageDeleteServiceに孤立ファイル移動ロジックを追加する
 *
 * Requirements:
 * - 4.8: R2削除失敗時の孤立ファイルをorphaned/プレフィックスに移動する
 *
 * 処理フロー:
 * 1. R2削除失敗時
 * 2. CopyObjectCommandで orphaned/{original_path} にコピー
 * 3. コピー成功時: ログ記録（警告レベル）
 * 4. コピー失敗時: エラーログ記録（Sentryアラート）
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ImageDeleteService } from '../../../services/image-delete.service.js';
import type { PrismaClient } from '../../../generated/prisma/client.js';
import type { StorageProvider } from '../../../storage/storage-provider.interface.js';

// モックの設定
vi.mock('../../../utils/logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// テスト用モック
function createMockPrisma() {
  return {
    surveyImage: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
    imageAnnotation: {
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
    $transaction: vi.fn((fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        surveyImage: {
          delete: vi.fn().mockResolvedValue({}),
          deleteMany: vi.fn().mockResolvedValue({ count: 2 }),
        },
        imageAnnotation: {
          delete: vi.fn().mockResolvedValue({}),
          deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
        },
      })
    ),
  } as unknown as PrismaClient;
}

function createMockStorageProvider(): StorageProvider {
  return {
    type: 'local' as const,
    upload: vi.fn(),
    get: vi.fn(),
    getSignedUrl: vi.fn(),
    getPublicUrl: vi.fn(),
    delete: vi.fn(),
    copy: vi.fn(),
    exists: vi.fn(),
    testConnection: vi.fn(),
    disconnect: vi.fn(),
  };
}

// テスト用サンプルデータ
const mockImage = {
  id: 'image-123',
  surveyId: 'survey-123',
  originalPath: 'images/survey-123/original-123.jpg',
  thumbnailPath: 'images/survey-123/thumb-123.jpg',
  fileName: 'test.jpg',
  fileSize: 1024,
  width: 800,
  height: 600,
  displayOrder: 1,
  comment: null,
  includeInReport: false,
  createdAt: new Date(),
  annotation: null,
};

describe('ImageDeleteService - 孤立ファイル処理', () => {
  let service: ImageDeleteService;
  let mockPrisma: ReturnType<typeof createMockPrisma>;
  let mockStorageProvider: StorageProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma = createMockPrisma();
    mockStorageProvider = createMockStorageProvider();

    service = new ImageDeleteService({
      prisma: mockPrisma,
      storageProvider: mockStorageProvider,
    });
  });

  describe('削除失敗時の孤立ファイル移動', () => {
    it('削除失敗時にorphaned/プレフィックスにファイルをコピーする（Requirements: 4.8）', async () => {
      // Arrange
      mockPrisma.surveyImage.findUnique = vi.fn().mockResolvedValue(mockImage);

      // 削除は失敗するがコピーは成功
      (mockStorageProvider.delete as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Delete failed')
      );
      (mockStorageProvider.copy as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      // Act
      await service.delete('image-123');

      // Assert
      // orphaned/プレフィックスへのコピーが呼ばれること
      expect(mockStorageProvider.copy).toHaveBeenCalledWith(
        mockImage.originalPath,
        `orphaned/${mockImage.originalPath}`
      );
      expect(mockStorageProvider.copy).toHaveBeenCalledWith(
        mockImage.thumbnailPath,
        `orphaned/${mockImage.thumbnailPath}`
      );
    });

    it('コピー成功時に警告レベルでログを記録する（Requirements: 4.8）', async () => {
      // Arrange
      const logger = await import('../../../utils/logger.js');
      mockPrisma.surveyImage.findUnique = vi.fn().mockResolvedValue(mockImage);

      (mockStorageProvider.delete as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Delete failed')
      );
      (mockStorageProvider.copy as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      // Act
      await service.delete('image-123');

      // Assert
      expect(logger.default.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          path: expect.stringContaining('orphaned/'),
        }),
        expect.stringContaining('孤立ファイル')
      );
    });

    it('コピー失敗時にエラーレベルでログを記録する（Requirements: 4.8）', async () => {
      // Arrange
      const logger = await import('../../../utils/logger.js');
      mockPrisma.surveyImage.findUnique = vi.fn().mockResolvedValue(mockImage);

      // 削除もコピーも失敗
      (mockStorageProvider.delete as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Delete failed')
      );
      (mockStorageProvider.copy as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Copy failed')
      );

      // Act
      await service.delete('image-123');

      // Assert
      expect(logger.default.error).toHaveBeenCalledWith(
        expect.objectContaining({
          originalPath: mockImage.originalPath,
          error: 'Copy failed',
        }),
        expect.stringContaining('孤立ファイルの移動に失敗')
      );
    });

    it('一括削除時も孤立ファイル移動が実行される（Requirements: 4.8）', async () => {
      // Arrange
      const images = [
        { ...mockImage, id: 'image-1', originalPath: 'img1.jpg', thumbnailPath: 'thumb1.jpg' },
        { ...mockImage, id: 'image-2', originalPath: 'img2.jpg', thumbnailPath: 'thumb2.jpg' },
      ];
      mockPrisma.surveyImage.findMany = vi.fn().mockResolvedValue(images);

      // 最初の画像の削除だけ失敗
      (mockStorageProvider.delete as ReturnType<typeof vi.fn>)
        .mockRejectedValueOnce(new Error('Delete failed'))
        .mockResolvedValue(undefined);
      (mockStorageProvider.copy as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      // Act
      const result = await service.deleteBySurveyId('survey-123');

      // Assert
      expect(mockStorageProvider.copy).toHaveBeenCalledWith('img1.jpg', 'orphaned/img1.jpg');
      expect(result.orphanedFiles).toContain('img1.jpg');
    });

    it('削除成功時はコピーを実行しない', async () => {
      // Arrange
      mockPrisma.surveyImage.findUnique = vi.fn().mockResolvedValue(mockImage);
      (mockStorageProvider.delete as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      // Act
      await service.delete('image-123');

      // Assert
      expect(mockStorageProvider.copy).not.toHaveBeenCalled();
    });
  });

  describe('孤立ファイルパスの生成', () => {
    it('orphaned/プレフィックスが正しく付与される', async () => {
      // Arrange
      const testPath = 'some/nested/path/file.jpg';
      const imageWithNestedPath = {
        ...mockImage,
        originalPath: testPath,
        thumbnailPath: 'thumb.jpg',
      };
      mockPrisma.surveyImage.findUnique = vi.fn().mockResolvedValue(imageWithNestedPath);

      (mockStorageProvider.delete as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Delete failed')
      );
      (mockStorageProvider.copy as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      // Act
      await service.delete('image-123');

      // Assert
      expect(mockStorageProvider.copy).toHaveBeenCalledWith(testPath, `orphaned/${testPath}`);
    });
  });
});
