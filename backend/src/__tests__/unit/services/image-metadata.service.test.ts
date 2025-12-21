/**
 * @fileoverview ImageMetadataServiceの単体テスト
 *
 * 画像メタデータ（コメント、報告書出力フラグ）の管理機能をテストします。
 *
 * Task 27.1: 画像メタデータサービスを実装する
 * - 画像単位でのコメント保存・取得機能
 * - 報告書出力フラグ（includeInReport）の管理機能
 * - コメント最大2000文字のバリデーション
 * - includeInReportのデフォルト値をfalseに設定
 *
 * Task 28.1: 報告書出力対象画像の取得機能を実装する
 * - includeInReport=trueの画像のみを取得するサービスメソッドを追加
 * - 表示順序（displayOrder）の昇順でソート
 * - 画像に紐付けられたコメントを取得
 *
 * Requirements: 10.4, 10.8, 11.2, 11.3
 *
 * @module tests/unit/services/image-metadata.service
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PrismaClient } from '../../../generated/prisma/client.js';
import {
  ImageMetadataService,
  type UpdateImageMetadataInput,
  ImageNotFoundError,
  CommentTooLongError,
} from '../../../services/image-metadata.service.js';

// Prismaモック
const createMockPrisma = () => {
  return {
    surveyImage: {
      findUnique: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
    },
  } as unknown as PrismaClient;
};

describe('ImageMetadataService', () => {
  let service: ImageMetadataService;
  let mockPrisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    mockPrisma = createMockPrisma();
    service = new ImageMetadataService({ prisma: mockPrisma });
  });

  describe('updateMetadata', () => {
    const mockImageId = 'test-image-id';
    const mockSurveyImage = {
      id: mockImageId,
      surveyId: 'test-survey-id',
      originalPath: 'surveys/test/original.jpg',
      thumbnailPath: 'surveys/test/thumb.jpg',
      fileName: 'test.jpg',
      fileSize: 1024,
      width: 800,
      height: 600,
      displayOrder: 1,
      comment: null,
      includeInReport: false,
      createdAt: new Date('2025-01-01'),
    };

    describe('コメント更新', () => {
      it('コメントを正常に更新できる', async () => {
        const input: UpdateImageMetadataInput = {
          comment: 'テストコメント',
        };
        const updatedImage = {
          ...mockSurveyImage,
          comment: input.comment,
        };

        (mockPrisma.surveyImage.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
          mockSurveyImage
        );
        (mockPrisma.surveyImage.update as ReturnType<typeof vi.fn>).mockResolvedValue(updatedImage);

        const result = await service.updateMetadata(mockImageId, input);

        expect(result.comment).toBe('テストコメント');
        expect(mockPrisma.surveyImage.update).toHaveBeenCalledWith({
          where: { id: mockImageId },
          data: { comment: input.comment },
        });
      });

      it('コメントをnullに更新できる（クリア）', async () => {
        const input: UpdateImageMetadataInput = {
          comment: null,
        };
        const updatedImage = {
          ...mockSurveyImage,
          comment: null,
        };

        (mockPrisma.surveyImage.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
          ...mockSurveyImage,
          comment: '既存コメント',
        });
        (mockPrisma.surveyImage.update as ReturnType<typeof vi.fn>).mockResolvedValue(updatedImage);

        const result = await service.updateMetadata(mockImageId, input);

        expect(result.comment).toBeNull();
      });

      it('空文字のコメントを設定できる', async () => {
        const input: UpdateImageMetadataInput = {
          comment: '',
        };
        const updatedImage = {
          ...mockSurveyImage,
          comment: '',
        };

        (mockPrisma.surveyImage.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
          mockSurveyImage
        );
        (mockPrisma.surveyImage.update as ReturnType<typeof vi.fn>).mockResolvedValue(updatedImage);

        const result = await service.updateMetadata(mockImageId, input);

        expect(result.comment).toBe('');
      });

      it('2000文字のコメントを設定できる', async () => {
        const longComment = 'あ'.repeat(2000);
        const input: UpdateImageMetadataInput = {
          comment: longComment,
        };
        const updatedImage = {
          ...mockSurveyImage,
          comment: longComment,
        };

        (mockPrisma.surveyImage.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
          mockSurveyImage
        );
        (mockPrisma.surveyImage.update as ReturnType<typeof vi.fn>).mockResolvedValue(updatedImage);

        const result = await service.updateMetadata(mockImageId, input);

        expect(result.comment).toBe(longComment);
        expect(result.comment?.length).toBe(2000);
      });

      it('2001文字以上のコメントはエラーになる', async () => {
        const tooLongComment = 'あ'.repeat(2001);
        const input: UpdateImageMetadataInput = {
          comment: tooLongComment,
        };

        (mockPrisma.surveyImage.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
          mockSurveyImage
        );

        await expect(service.updateMetadata(mockImageId, input)).rejects.toThrow(
          CommentTooLongError
        );
        expect(mockPrisma.surveyImage.update).not.toHaveBeenCalled();
      });
    });

    describe('報告書出力フラグ更新', () => {
      it('includeInReportをtrueに更新できる', async () => {
        const input: UpdateImageMetadataInput = {
          includeInReport: true,
        };
        const updatedImage = {
          ...mockSurveyImage,
          includeInReport: true,
        };

        (mockPrisma.surveyImage.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
          mockSurveyImage
        );
        (mockPrisma.surveyImage.update as ReturnType<typeof vi.fn>).mockResolvedValue(updatedImage);

        const result = await service.updateMetadata(mockImageId, input);

        expect(result.includeInReport).toBe(true);
        expect(mockPrisma.surveyImage.update).toHaveBeenCalledWith({
          where: { id: mockImageId },
          data: { includeInReport: true },
        });
      });

      it('includeInReportをfalseに更新できる', async () => {
        const input: UpdateImageMetadataInput = {
          includeInReport: false,
        };
        const updatedImage = {
          ...mockSurveyImage,
          includeInReport: false,
        };

        (mockPrisma.surveyImage.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
          ...mockSurveyImage,
          includeInReport: true,
        });
        (mockPrisma.surveyImage.update as ReturnType<typeof vi.fn>).mockResolvedValue(updatedImage);

        const result = await service.updateMetadata(mockImageId, input);

        expect(result.includeInReport).toBe(false);
      });
    });

    describe('複合更新', () => {
      it('コメントとincludeInReportを同時に更新できる', async () => {
        const input: UpdateImageMetadataInput = {
          comment: '新しいコメント',
          includeInReport: true,
        };
        const updatedImage = {
          ...mockSurveyImage,
          comment: input.comment,
          includeInReport: input.includeInReport,
        };

        (mockPrisma.surveyImage.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
          mockSurveyImage
        );
        (mockPrisma.surveyImage.update as ReturnType<typeof vi.fn>).mockResolvedValue(updatedImage);

        const result = await service.updateMetadata(mockImageId, input);

        expect(result.comment).toBe('新しいコメント');
        expect(result.includeInReport).toBe(true);
        expect(mockPrisma.surveyImage.update).toHaveBeenCalledWith({
          where: { id: mockImageId },
          data: {
            comment: input.comment,
            includeInReport: input.includeInReport,
          },
        });
      });
    });

    describe('エラーハンドリング', () => {
      it('画像が存在しない場合はImageNotFoundErrorをスローする', async () => {
        const input: UpdateImageMetadataInput = {
          comment: 'テスト',
        };

        (mockPrisma.surveyImage.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

        await expect(service.updateMetadata(mockImageId, input)).rejects.toThrow(
          ImageNotFoundError
        );
        expect(mockPrisma.surveyImage.update).not.toHaveBeenCalled();
      });

      it('空の更新データの場合は何も更新せず現在の値を返す', async () => {
        const input: UpdateImageMetadataInput = {};

        (mockPrisma.surveyImage.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
          mockSurveyImage
        );

        const result = await service.updateMetadata(mockImageId, input);

        expect(result).toEqual(
          expect.objectContaining({
            id: mockImageId,
            comment: null,
            includeInReport: false,
          })
        );
        expect(mockPrisma.surveyImage.update).not.toHaveBeenCalled();
      });
    });
  });

  /**
   * Task 28.1: 報告書出力対象画像の取得機能を実装する
   * Requirements: 11.2, 11.3
   */
  describe('findForReport', () => {
    const mockSurveyId = 'test-survey-id';

    it('報告書出力対象の画像のみを取得する（Req 11.2）', async () => {
      const mockImages = [
        {
          id: 'image-1',
          surveyId: mockSurveyId,
          originalPath: 'path/1.jpg',
          thumbnailPath: 'path/thumb1.jpg',
          fileName: 'image1.jpg',
          fileSize: 1024,
          width: 800,
          height: 600,
          displayOrder: 1,
          comment: 'コメント1',
          includeInReport: true,
          createdAt: new Date('2025-01-01'),
        },
        {
          id: 'image-3',
          surveyId: mockSurveyId,
          originalPath: 'path/3.jpg',
          thumbnailPath: 'path/thumb3.jpg',
          fileName: 'image3.jpg',
          fileSize: 2048,
          width: 1200,
          height: 900,
          displayOrder: 3,
          comment: null,
          includeInReport: true,
          createdAt: new Date('2025-01-03'),
        },
      ];

      (mockPrisma.surveyImage.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(mockImages);

      const result = await service.findForReport(mockSurveyId);

      expect(result).toHaveLength(2);
      expect(result[0]?.id).toBe('image-1');
      expect(result[1]?.id).toBe('image-3');
      expect(mockPrisma.surveyImage.findMany).toHaveBeenCalledWith({
        where: {
          surveyId: mockSurveyId,
          includeInReport: true,
        },
        orderBy: {
          displayOrder: 'asc',
        },
      });
    });

    it('報告書出力対象の画像がない場合は空配列を返す', async () => {
      (mockPrisma.surveyImage.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      const result = await service.findForReport(mockSurveyId);

      expect(result).toHaveLength(0);
    });

    it('表示順序（displayOrder）の昇順でソートされる（Req 11.3）', async () => {
      const mockImages = [
        {
          id: 'image-3',
          surveyId: mockSurveyId,
          originalPath: 'path/3.jpg',
          thumbnailPath: 'path/thumb3.jpg',
          fileName: 'image3.jpg',
          fileSize: 2048,
          width: 1200,
          height: 900,
          displayOrder: 3,
          comment: null,
          includeInReport: true,
          createdAt: new Date('2025-01-03'),
        },
        {
          id: 'image-1',
          surveyId: mockSurveyId,
          originalPath: 'path/1.jpg',
          thumbnailPath: 'path/thumb1.jpg',
          fileName: 'image1.jpg',
          fileSize: 1024,
          width: 800,
          height: 600,
          displayOrder: 1,
          comment: 'コメント1',
          includeInReport: true,
          createdAt: new Date('2025-01-01'),
        },
      ];

      (mockPrisma.surveyImage.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(mockImages);

      await service.findForReport(mockSurveyId);

      expect(mockPrisma.surveyImage.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: {
            displayOrder: 'asc',
          },
        })
      );
    });

    it('画像に紐付けられたコメントを取得できる（Task 28.1）', async () => {
      const mockImages = [
        {
          id: 'image-1',
          surveyId: mockSurveyId,
          originalPath: 'path/1.jpg',
          thumbnailPath: 'path/thumb1.jpg',
          fileName: 'image1.jpg',
          fileSize: 1024,
          width: 800,
          height: 600,
          displayOrder: 1,
          comment: 'これは写真1のコメントです',
          includeInReport: true,
          createdAt: new Date('2025-01-01'),
        },
        {
          id: 'image-2',
          surveyId: mockSurveyId,
          originalPath: 'path/2.jpg',
          thumbnailPath: 'path/thumb2.jpg',
          fileName: 'image2.jpg',
          fileSize: 2048,
          width: 1200,
          height: 900,
          displayOrder: 2,
          comment: null, // コメントなし
          includeInReport: true,
          createdAt: new Date('2025-01-02'),
        },
        {
          id: 'image-3',
          surveyId: mockSurveyId,
          originalPath: 'path/3.jpg',
          thumbnailPath: 'path/thumb3.jpg',
          fileName: 'image3.jpg',
          fileSize: 3072,
          width: 1600,
          height: 1200,
          displayOrder: 3,
          comment: '日本語コメントも正しく取得できる：現場状況確認用写真です。',
          includeInReport: true,
          createdAt: new Date('2025-01-03'),
        },
      ];

      (mockPrisma.surveyImage.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(mockImages);

      const result = await service.findForReport(mockSurveyId);

      expect(result).toHaveLength(3);
      expect(result[0]?.comment).toBe('これは写真1のコメントです');
      expect(result[1]?.comment).toBeNull();
      expect(result[2]?.comment).toBe('日本語コメントも正しく取得できる：現場状況確認用写真です。');
    });
  });

  describe('getMetadata', () => {
    const mockImageId = 'test-image-id';
    const mockSurveyImage = {
      id: mockImageId,
      surveyId: 'test-survey-id',
      originalPath: 'surveys/test/original.jpg',
      thumbnailPath: 'surveys/test/thumb.jpg',
      fileName: 'test.jpg',
      fileSize: 1024,
      width: 800,
      height: 600,
      displayOrder: 1,
      comment: 'テストコメント',
      includeInReport: true,
      createdAt: new Date('2025-01-01'),
    };

    it('画像のメタデータを取得できる', async () => {
      (mockPrisma.surveyImage.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockSurveyImage
      );

      const result = await service.getMetadata(mockImageId);

      expect(result).toEqual(
        expect.objectContaining({
          id: mockImageId,
          comment: 'テストコメント',
          includeInReport: true,
        })
      );
      expect(mockPrisma.surveyImage.findUnique).toHaveBeenCalledWith({
        where: { id: mockImageId },
      });
    });

    it('画像が存在しない場合はnullを返す', async () => {
      (mockPrisma.surveyImage.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const result = await service.getMetadata(mockImageId);

      expect(result).toBeNull();
    });
  });

  describe('定数とバリデーション', () => {
    it('MAX_COMMENT_LENGTHが2000であること', () => {
      expect(ImageMetadataService.MAX_COMMENT_LENGTH).toBe(2000);
    });
  });
});
