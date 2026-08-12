/**
 * @fileoverview 注釈付きサムネイルのバックフィルのテスト
 *
 * Task 113.3: 合成済みサムネイルを持たない既存注釈を解消する手段を用意する
 *
 * Requirements:
 * - 38.6: 注釈付きサムネイルが利用できない場合の代替手段を維持する
 *
 * @module tests/unit/scripts/backfill-annotated-thumbnails
 */

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { backfillAnnotatedThumbnails } from '../../../../scripts/backfill-annotated-thumbnails.js';

// ============================================================================
// モック
// ============================================================================

const mockPrisma = {
  surveyImage: {
    findMany: vi.fn(),
  },
  imageAnnotation: {
    findMany: vi.fn(),
  },
};

const mockAnnotatedThumbnailService = {
  generateAnnotatedThumbnail: vi.fn(),
};

/** 対象画像（注釈あり・サムネイル未生成）を組み立てる */
function targets(...ids: string[]) {
  return ids.map((id) => ({ id }));
}

/** 注釈レコードを組み立てる */
function annotations(...entries: Array<[string, number]>) {
  return entries.map(([imageId, objectCount]) => ({
    imageId,
    data: { objects: Array.from({ length: objectCount }, () => ({ type: 'rect' })) },
  }));
}

function run(options?: { batchSize?: number; dryRun?: boolean }) {
  return backfillAnnotatedThumbnails(
    {
      prisma: mockPrisma as never,
      annotatedThumbnailService: mockAnnotatedThumbnailService as never,
    },
    options
  );
}

describe('backfillAnnotatedThumbnails', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (mockAnnotatedThumbnailService.generateAnnotatedThumbnail as Mock).mockResolvedValue(
      'annotated-thumbnails/generated.jpg'
    );
  });

  describe('対象の抽出', () => {
    it('注釈があり合成済みサムネイルを持たない画像のみを対象とする', async () => {
      mockPrisma.surveyImage.findMany.mockResolvedValue(targets('img-1'));
      mockPrisma.imageAnnotation.findMany.mockResolvedValue(annotations(['img-1', 2]));

      await run();

      const where = mockPrisma.surveyImage.findMany.mock.calls[0]?.[0]?.where;
      expect(where).toMatchObject({ annotatedThumbnailPath: null });
      // 注釈レコードが存在する画像に限定されていること
      expect(JSON.stringify(where)).toContain('annotation');
    });

    it('対象が0件の場合は生成を行わない', async () => {
      mockPrisma.surveyImage.findMany.mockResolvedValue([]);

      const result = await run();

      expect(result.targeted).toBe(0);
      expect(result.regenerated).toBe(0);
      expect(mockAnnotatedThumbnailService.generateAnnotatedThumbnail).not.toHaveBeenCalled();
    });
  });

  describe('生成', () => {
    it('対象ごとにサムネイルを再生成し件数を返す', async () => {
      mockPrisma.surveyImage.findMany.mockResolvedValue(targets('img-1', 'img-2'));
      mockPrisma.imageAnnotation.findMany.mockResolvedValue(
        annotations(['img-1', 2], ['img-2', 1])
      );

      const result = await run();

      expect(result.targeted).toBe(2);
      expect(result.regenerated).toBe(2);
      expect(result.skippedEmpty).toBe(0);
      expect(result.failures).toEqual([]);
      expect(mockAnnotatedThumbnailService.generateAnnotatedThumbnail).toHaveBeenCalledTimes(2);
    });

    it('生成対象外（空の注釈）は再生成件数へ数えない', async () => {
      mockPrisma.surveyImage.findMany.mockResolvedValue(targets('img-1'));
      mockPrisma.imageAnnotation.findMany.mockResolvedValue(annotations(['img-1', 0]));
      (mockAnnotatedThumbnailService.generateAnnotatedThumbnail as Mock).mockResolvedValue(null);

      const result = await run();

      expect(result.targeted).toBe(1);
      expect(result.regenerated).toBe(0);
      expect(result.skippedEmpty).toBe(1);
    });

    it('件数を区切って処理する', async () => {
      mockPrisma.surveyImage.findMany.mockResolvedValue(targets('img-1', 'img-2', 'img-3'));
      mockPrisma.imageAnnotation.findMany.mockImplementation(
        ({ where }: { where: { imageId: { in: string[] } } }) =>
          Promise.resolve(annotations(...where.imageId.in.map((id) => [id, 1] as [string, number])))
      );

      const result = await run({ batchSize: 2 });

      expect(result.regenerated).toBe(3);
      // 3件を2件ずつ、2回に分けて注釈を取得する
      expect(mockPrisma.imageAnnotation.findMany).toHaveBeenCalledTimes(2);
    });
  });

  describe('部分失敗', () => {
    it('個別の失敗を記録し残りの処理を継続する', async () => {
      mockPrisma.surveyImage.findMany.mockResolvedValue(targets('img-1', 'img-2'));
      mockPrisma.imageAnnotation.findMany.mockResolvedValue(
        annotations(['img-1', 1], ['img-2', 1])
      );
      (mockAnnotatedThumbnailService.generateAnnotatedThumbnail as Mock)
        .mockRejectedValueOnce(new Error('storage unavailable'))
        .mockResolvedValueOnce('annotated-thumbnails/img-2.jpg');

      const result = await run();

      expect(result.regenerated).toBe(1);
      expect(result.failures).toHaveLength(1);
      expect(result.failures[0]).toMatchObject({ imageId: 'img-1' });
      expect(result.failures[0]?.reason).toContain('storage unavailable');
    });

    it('注釈レコードが取得できない画像は失敗として記録する', async () => {
      mockPrisma.surveyImage.findMany.mockResolvedValue(targets('img-1'));
      mockPrisma.imageAnnotation.findMany.mockResolvedValue([]);

      const result = await run();

      expect(result.regenerated).toBe(0);
      expect(result.failures).toHaveLength(1);
      expect(result.failures[0]).toMatchObject({ imageId: 'img-1' });
    });
  });

  describe('集計のみの実行', () => {
    it('dryRun では対象件数のみを集計し生成を行わない', async () => {
      mockPrisma.surveyImage.findMany.mockResolvedValue(targets('img-1', 'img-2'));

      const result = await run({ dryRun: true });

      expect(result.targeted).toBe(2);
      expect(result.regenerated).toBe(0);
      expect(mockAnnotatedThumbnailService.generateAnnotatedThumbnail).not.toHaveBeenCalled();
      expect(mockPrisma.imageAnnotation.findMany).not.toHaveBeenCalled();
    });
  });

  describe('冪等性', () => {
    it('生成済みの画像は次回の対象に含まれない', async () => {
      // 1回目: 対象1件を生成。サービスが annotatedThumbnailPath を永続化するため、
      // 2回目の抽出条件（annotatedThumbnailPath: null）には合致しなくなる
      mockPrisma.surveyImage.findMany.mockResolvedValueOnce(targets('img-1'));
      mockPrisma.imageAnnotation.findMany.mockResolvedValueOnce(annotations(['img-1', 1]));
      const first = await run();
      expect(first.regenerated).toBe(1);

      mockPrisma.surveyImage.findMany.mockResolvedValueOnce([]);
      const second = await run();

      expect(second.targeted).toBe(0);
      expect(mockAnnotatedThumbnailService.generateAnnotatedThumbnail).toHaveBeenCalledTimes(1);
    });
  });
});
