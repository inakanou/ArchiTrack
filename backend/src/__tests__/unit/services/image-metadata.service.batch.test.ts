/**
 * @fileoverview ImageMetadataService 一括更新機能のユニットテスト
 *
 * TDD: RED phase - テストを先に書く
 *
 * Task 33.1: 写真一覧管理パネルを手動保存方式に変更する
 * Task 38.1: バッチ更新APIでdisplayOrderを連番に再計算する
 * Task 38.2: displayOrder正規化の単体テストを実装する
 *
 * Requirements:
 * - 10.8: 保存ボタンで一括保存
 * - 10.9: displayOrderの正規化（連番に再計算）
 *
 * 処理フロー:
 * 1. 複数の画像メタデータを一括で受け取る
 * 2. displayOrderが含まれる場合は相対順序を1, 2, 3...の連番に正規化
 * 3. トランザクション内で一括更新
 * 4. 更新結果を返却
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

    // Task 38.2: displayOrder正規化の単体テスト
    describe('displayOrder正規化（Requirements: 10.9）', () => {
      it('displayOrderを1から始まる連番に正規化する', async () => {
        // Arrange: 送信された順序は100, 200, 300のような大きな値
        const updates = [
          { id: 'image-1', displayOrder: 100 },
          { id: 'image-2', displayOrder: 200 },
          { id: 'image-3', displayOrder: 300 },
        ];

        mockPrisma.surveyImage.findMany = vi.fn().mockResolvedValue(mockImages);

        const updateCalls: Array<{ where: { id: string }; data: { displayOrder?: number } }> = [];
        mockPrisma.$transaction = vi.fn((callback: (tx: unknown) => Promise<unknown>) => {
          const mockTx = {
            surveyImage: {
              update: vi.fn().mockImplementation((args) => {
                updateCalls.push(args);
                const original = mockImages.find((img) => img.id === args.where.id);
                return {
                  ...original,
                  ...args.data,
                };
              }),
              findUnique: vi.fn(),
            },
          };
          return callback(mockTx);
        });

        // Act
        const results = await service.updateMetadataBatch(updates);

        // Assert: displayOrderが1, 2, 3に正規化される
        expect(results).toHaveLength(3);
        const displayOrders = updateCalls.map((call) => call.data.displayOrder);
        expect(displayOrders).toEqual([1, 2, 3]);
      });

      it('重複したdisplayOrderがある場合も正しくソート・正規化される', async () => {
        // Arrange: 重複するdisplayOrder（すべて同じ値）
        const updates = [
          { id: 'image-1', displayOrder: 5 },
          { id: 'image-2', displayOrder: 5 },
          { id: 'image-3', displayOrder: 5 },
        ];

        mockPrisma.surveyImage.findMany = vi.fn().mockResolvedValue(mockImages);

        const updateCalls: Array<{ where: { id: string }; data: { displayOrder?: number } }> = [];
        mockPrisma.$transaction = vi.fn((callback: (tx: unknown) => Promise<unknown>) => {
          const mockTx = {
            surveyImage: {
              update: vi.fn().mockImplementation((args) => {
                updateCalls.push(args);
                const original = mockImages.find((img) => img.id === args.where.id);
                return {
                  ...original,
                  ...args.data,
                };
              }),
              findUnique: vi.fn(),
            },
          };
          return callback(mockTx);
        });

        // Act
        const results = await service.updateMetadataBatch(updates);

        // Assert: displayOrderが1, 2, 3に正規化される（元の順序を保持）
        expect(results).toHaveLength(3);
        const displayOrders = updateCalls.map((call) => call.data.displayOrder);
        expect(displayOrders).toEqual([1, 2, 3]);
      });

      it('欠番があるdisplayOrderも正しくソート・正規化される', async () => {
        // Arrange: 欠番のあるdisplayOrder（5, 10, 15）
        const updates = [
          { id: 'image-1', displayOrder: 5 },
          { id: 'image-2', displayOrder: 15 },
          { id: 'image-3', displayOrder: 10 },
        ];

        mockPrisma.surveyImage.findMany = vi.fn().mockResolvedValue(mockImages);

        const updateCalls: Array<{ where: { id: string }; data: { displayOrder?: number } }> = [];
        mockPrisma.$transaction = vi.fn((callback: (tx: unknown) => Promise<unknown>) => {
          const mockTx = {
            surveyImage: {
              update: vi.fn().mockImplementation((args) => {
                updateCalls.push(args);
                const original = mockImages.find((img) => img.id === args.where.id);
                return {
                  ...original,
                  ...args.data,
                };
              }),
              findUnique: vi.fn(),
            },
          };
          return callback(mockTx);
        });

        // Act
        const results = await service.updateMetadataBatch(updates);

        // Assert: ソート後に1, 2, 3に正規化（image-1: 5→1, image-3: 10→2, image-2: 15→3）
        expect(results).toHaveLength(3);
        // updateCallsは正規化された順序で呼ばれる
        const sortedUpdates = updateCalls.sort(
          (a, b) => (a.data.displayOrder ?? 0) - (b.data.displayOrder ?? 0)
        );
        expect(sortedUpdates[0]!.where.id).toBe('image-1'); // displayOrder: 5 → 1
        expect(sortedUpdates[0]!.data.displayOrder).toBe(1);
        expect(sortedUpdates[1]!.where.id).toBe('image-3'); // displayOrder: 10 → 2
        expect(sortedUpdates[1]!.data.displayOrder).toBe(2);
        expect(sortedUpdates[2]!.where.id).toBe('image-2'); // displayOrder: 15 → 3
        expect(sortedUpdates[2]!.data.displayOrder).toBe(3);
      });

      it('displayOrderとコメント/フラグを同時に更新できる', async () => {
        // Arrange: displayOrderと他のフィールドを同時に更新
        const updates = [
          { id: 'image-1', displayOrder: 2, comment: 'new comment' },
          { id: 'image-2', displayOrder: 1, includeInReport: true },
        ];

        mockPrisma.surveyImage.findMany = vi.fn().mockResolvedValue(mockImages.slice(0, 2));

        const updateCalls: Array<{
          where: { id: string };
          data: { displayOrder?: number; comment?: string | null; includeInReport?: boolean };
        }> = [];
        mockPrisma.$transaction = vi.fn((callback: (tx: unknown) => Promise<unknown>) => {
          const mockTx = {
            surveyImage: {
              update: vi.fn().mockImplementation((args) => {
                updateCalls.push(args);
                const original = mockImages.find((img) => img.id === args.where.id);
                return {
                  ...original,
                  ...args.data,
                };
              }),
              findUnique: vi.fn(),
            },
          };
          return callback(mockTx);
        });

        // Act
        const results = await service.updateMetadataBatch(updates);

        // Assert: displayOrderが正規化され、他のフィールドも更新される
        expect(results).toHaveLength(2);

        // image-2がdisplayOrder: 1なので先に処理される
        const image2Call = updateCalls.find((c) => c.where.id === 'image-2');
        expect(image2Call?.data.displayOrder).toBe(1);
        expect(image2Call?.data.includeInReport).toBe(true);

        // image-1がdisplayOrder: 2なので後に処理される
        const image1Call = updateCalls.find((c) => c.where.id === 'image-1');
        expect(image1Call?.data.displayOrder).toBe(2);
        expect(image1Call?.data.comment).toBe('new comment');
      });

      it('一部の画像のみdisplayOrderを更新する場合も正規化される', async () => {
        // Arrange: 一部のみdisplayOrderを指定
        const updates = [
          { id: 'image-1', displayOrder: 3 },
          { id: 'image-2', comment: 'only comment' }, // displayOrder未指定
          { id: 'image-3', displayOrder: 1 },
        ];

        mockPrisma.surveyImage.findMany = vi.fn().mockResolvedValue(mockImages);

        const updateCalls: Array<{
          where: { id: string };
          data: { displayOrder?: number; comment?: string | null };
        }> = [];
        mockPrisma.$transaction = vi.fn((callback: (tx: unknown) => Promise<unknown>) => {
          const mockTx = {
            surveyImage: {
              update: vi.fn().mockImplementation((args) => {
                updateCalls.push(args);
                const original = mockImages.find((img) => img.id === args.where.id);
                return {
                  ...original,
                  ...args.data,
                };
              }),
              findUnique: vi.fn(),
            },
          };
          return callback(mockTx);
        });

        // Act
        const results = await service.updateMetadataBatch(updates);

        // Assert
        expect(results).toHaveLength(3);

        // displayOrderが指定されたものだけ正規化される
        const image1Call = updateCalls.find((c) => c.where.id === 'image-1');
        expect(image1Call?.data.displayOrder).toBe(2); // 3→2（正規化後）

        const image3Call = updateCalls.find((c) => c.where.id === 'image-3');
        expect(image3Call?.data.displayOrder).toBe(1); // 1→1

        // displayOrder未指定のimage-2はコメントのみ更新
        const image2Call = updateCalls.find((c) => c.where.id === 'image-2');
        expect(image2Call?.data.comment).toBe('only comment');
        expect(image2Call?.data.displayOrder).toBeUndefined();
      });

      it('displayOrderの相対順序が保持される', async () => {
        // Arrange: 逆順で指定
        const updates = [
          { id: 'image-1', displayOrder: 30 },
          { id: 'image-2', displayOrder: 20 },
          { id: 'image-3', displayOrder: 10 },
        ];

        mockPrisma.surveyImage.findMany = vi.fn().mockResolvedValue(mockImages);

        const updateCalls: Array<{ where: { id: string }; data: { displayOrder?: number } }> = [];
        mockPrisma.$transaction = vi.fn((callback: (tx: unknown) => Promise<unknown>) => {
          const mockTx = {
            surveyImage: {
              update: vi.fn().mockImplementation((args) => {
                updateCalls.push(args);
                const original = mockImages.find((img) => img.id === args.where.id);
                return {
                  ...original,
                  ...args.data,
                };
              }),
              findUnique: vi.fn(),
            },
          };
          return callback(mockTx);
        });

        // Act
        const results = await service.updateMetadataBatch(updates);

        // Assert: 相対順序が保持される（10 < 20 < 30 → 1, 2, 3）
        expect(results).toHaveLength(3);
        const sortedCalls = updateCalls.sort(
          (a, b) => (a.data.displayOrder ?? 0) - (b.data.displayOrder ?? 0)
        );
        expect(sortedCalls[0]!.where.id).toBe('image-3'); // 10 → 1
        expect(sortedCalls[1]!.where.id).toBe('image-2'); // 20 → 2
        expect(sortedCalls[2]!.where.id).toBe('image-1'); // 30 → 3
      });
    });
  });
});
