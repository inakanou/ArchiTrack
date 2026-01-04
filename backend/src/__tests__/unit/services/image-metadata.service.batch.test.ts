/**
 * @fileoverview ImageMetadataService 一括更新機能のユニットテスト
 *
 * TDD: RED phase - テストを先に書く
 *
 * Task 33.1: 写真一覧管理パネルを手動保存方式に変更する
 *
 * Requirements:
 * - 10.8: 保存ボタンで一括保存
 *
 * 処理フロー:
 * 1. 複数の画像メタデータを一括で受け取る
 * 2. トランザクション内で一括更新
 * 3. 更新結果を返却
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  ImageMetadataService,
  ImageNotFoundError,
  CommentTooLongError,
} from '../../../services/image-metadata.service.js';
import type { PrismaClient } from '../../../generated/prisma/client.js';

// テスト用モック
function createMockPrisma() {
  const mockPrisma = {
    surveyImage: {
      findUnique: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
    $transaction: vi.fn(),
  };

  // $transactionのデフォルト実装
  mockPrisma.$transaction.mockImplementation(
    (callback: (tx: typeof mockPrisma) => Promise<unknown>) => {
      return callback({
        ...mockPrisma,
        surveyImage: {
          ...mockPrisma.surveyImage,
          update: vi.fn().mockImplementation((args: { where: { id: string }; data?: unknown }) => ({
            id: args.where.id,
            ...(args.data || {}),
            fileName: 'test.jpg',
            surveyId: 'survey-123',
            displayOrder: 1,
            originalPath: 'original/path.jpg',
            thumbnailPath: 'thumb/path.jpg',
            fileSize: 1024,
            width: 800,
            height: 600,
            comment: null,
            includeInReport: false,
            createdAt: new Date(),
          })),
          findUnique: vi.fn(),
        },
      });
    }
  );

  return mockPrisma as unknown as PrismaClient;
}

// テスト用サンプルデータ
const mockImages = [
  {
    id: 'image-1',
    surveyId: 'survey-123',
    fileName: 'test1.jpg',
    comment: null,
    includeInReport: false,
    displayOrder: 1,
  },
  {
    id: 'image-2',
    surveyId: 'survey-123',
    fileName: 'test2.jpg',
    comment: 'existing comment',
    includeInReport: true,
    displayOrder: 2,
  },
  {
    id: 'image-3',
    surveyId: 'survey-123',
    fileName: 'test3.jpg',
    comment: null,
    includeInReport: false,
    displayOrder: 3,
  },
];

describe('ImageMetadataService - 一括更新', () => {
  let service: ImageMetadataService;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockPrisma: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma = createMockPrisma();
    service = new ImageMetadataService({ prisma: mockPrisma });
  });

  describe('updateMetadataBatch', () => {
    it('複数の画像メタデータを一括で更新できる（Requirements: 10.8）', async () => {
      // Arrange
      const updates = [
        { id: 'image-1', comment: 'new comment 1', includeInReport: true },
        { id: 'image-2', comment: 'updated comment 2' },
        { id: 'image-3', includeInReport: true },
      ];

      mockPrisma.surveyImage.findMany = vi.fn().mockResolvedValue(mockImages);

      const transactionCalls: unknown[] = [];
      mockPrisma.$transaction = vi.fn((callback: (tx: unknown) => Promise<unknown>) => {
        const mockTx = {
          surveyImage: {
            update: vi.fn().mockImplementation((args) => {
              transactionCalls.push(args);
              const original = mockImages.find((img) => img.id === args.where.id);
              return {
                ...original,
                ...args.data,
              };
            }),
          },
        };
        return callback(mockTx);
      });

      // Act
      const results = await service.updateMetadataBatch(updates);

      // Assert
      expect(results).toHaveLength(3);
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
      expect(transactionCalls).toHaveLength(3);
    });

    it('存在しない画像IDが含まれる場合はエラーをスローする', async () => {
      // Arrange
      const updates = [
        { id: 'image-1', comment: 'new comment' },
        { id: 'non-existent', comment: 'invalid' },
      ];

      mockPrisma.surveyImage.findMany = vi.fn().mockResolvedValue([mockImages[0]]);

      // Act & Assert
      await expect(service.updateMetadataBatch(updates)).rejects.toThrow(ImageNotFoundError);
    });

    it('コメントが2000文字を超える場合はエラーをスローする', async () => {
      // Arrange
      const longComment = 'a'.repeat(2001);
      const updates = [{ id: 'image-1', comment: longComment }];

      mockPrisma.surveyImage.findMany = vi.fn().mockResolvedValue([mockImages[0]]);

      // Act & Assert
      await expect(service.updateMetadataBatch(updates)).rejects.toThrow(CommentTooLongError);
    });

    it('空の配列を渡した場合は空の結果を返す', async () => {
      // Act
      const results = await service.updateMetadataBatch([]);

      // Assert
      expect(results).toHaveLength(0);
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it('commentのみの更新が可能', async () => {
      // Arrange
      const updates = [{ id: 'image-1', comment: 'only comment update' }];

      mockPrisma.surveyImage.findMany = vi.fn().mockResolvedValue([mockImages[0]]);

      let updateArgs: unknown = null;
      mockPrisma.$transaction = vi.fn((callback: (tx: unknown) => Promise<unknown>) => {
        const mockTx = {
          surveyImage: {
            update: vi.fn().mockImplementation((args) => {
              updateArgs = args;
              return { ...mockImages[0], comment: args.data.comment };
            }),
          },
        };
        return callback(mockTx);
      });

      // Act
      const results = await service.updateMetadataBatch(updates);

      // Assert
      expect(results).toHaveLength(1);
      expect((updateArgs as { data: { comment: string } }).data.comment).toBe(
        'only comment update'
      );
    });

    it('includeInReportのみの更新が可能', async () => {
      // Arrange
      const updates = [{ id: 'image-1', includeInReport: true }];

      mockPrisma.surveyImage.findMany = vi.fn().mockResolvedValue([mockImages[0]]);

      let updateArgs: unknown = null;
      mockPrisma.$transaction = vi.fn((callback: (tx: unknown) => Promise<unknown>) => {
        const mockTx = {
          surveyImage: {
            update: vi.fn().mockImplementation((args) => {
              updateArgs = args;
              return { ...mockImages[0], includeInReport: args.data.includeInReport };
            }),
          },
        };
        return callback(mockTx);
      });

      // Act
      const results = await service.updateMetadataBatch(updates);

      // Assert
      expect(results).toHaveLength(1);
      expect((updateArgs as { data: { includeInReport: boolean } }).data.includeInReport).toBe(
        true
      );
    });

    it('commentをnullに設定できる', async () => {
      // Arrange
      const updates = [{ id: 'image-2', comment: null }];

      mockPrisma.surveyImage.findMany = vi.fn().mockResolvedValue([mockImages[1]]);

      let updateArgs: unknown = null;
      mockPrisma.$transaction = vi.fn((callback: (tx: unknown) => Promise<unknown>) => {
        const mockTx = {
          surveyImage: {
            update: vi.fn().mockImplementation((args) => {
              updateArgs = args;
              return { ...mockImages[1], comment: null };
            }),
          },
        };
        return callback(mockTx);
      });

      // Act
      const results = await service.updateMetadataBatch(updates);

      // Assert
      expect(results).toHaveLength(1);
      expect((updateArgs as { data: { comment: null } }).data.comment).toBeNull();
    });

    it('トランザクション内でエラーが発生した場合はロールバックされる', async () => {
      // Arrange
      const updates = [
        { id: 'image-1', comment: 'first update' },
        { id: 'image-2', comment: 'second update' },
      ];

      mockPrisma.surveyImage.findMany = vi.fn().mockResolvedValue(mockImages.slice(0, 2));

      mockPrisma.$transaction = vi.fn().mockRejectedValue(new Error('Transaction failed'));

      // Act & Assert
      await expect(service.updateMetadataBatch(updates)).rejects.toThrow('Transaction failed');
    });
  });
});
