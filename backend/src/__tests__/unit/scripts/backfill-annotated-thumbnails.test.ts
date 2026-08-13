/**
 * @fileoverview 注釈付きサムネイルのバックフィルが起動できないことのテスト
 *
 * Task 113.3 で導入したバックフィルは、サーバー側の注釈描画器を用いる。
 * Task 115.6 で当該描画器の位置づけが「本番データを生成してはならない」に確定したため、
 * バックフィルも「注釈が欠落した画像を生成しないことが保証されない限り実行してはならない」
 * 手段となった。本テストは、その起動が明示的な失敗で封じられていることを固定する。
 *
 * Requirements:
 * - 20.4: 注釈をレンダリングしたサムネイル画像の生成契機
 * - 38.6: 注釈付きサムネイルが利用できない場合の代替手段を維持する
 *
 * @module tests/unit/scripts/backfill-annotated-thumbnails
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { backfillAnnotatedThumbnails } from '../../../../scripts/backfill-annotated-thumbnails.js';
import { ServerSideAnnotatedThumbnailDisabledError } from '../../../services/annotated-thumbnail.service.js';

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

function run(options?: { batchSize?: number; dryRun?: boolean }) {
  return backfillAnnotatedThumbnails(
    {
      prisma: mockPrisma as never,
      annotatedThumbnailService: mockAnnotatedThumbnailService as never,
    },
    options
  );
}

describe('backfillAnnotatedThumbnails: 起動の封鎖 (Task 115.6)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // 抽出が実行されてしまった場合に処理が進めるだけの応答を用意しておく。
    // これにより「起動できない」ことがモックの不足による失敗ではないと言える。
    mockPrisma.surveyImage.findMany.mockResolvedValue([{ id: 'img-1' }]);
    mockPrisma.imageAnnotation.findMany.mockResolvedValue([
      { imageId: 'img-1', data: { objects: [{ type: 'rect' }] } },
    ]);
    mockAnnotatedThumbnailService.generateAnnotatedThumbnail.mockResolvedValue(
      'annotated-thumbnails/generated.jpg'
    );
  });

  it('起動しようとすると明示的な失敗で拒否される', async () => {
    await expect(run()).rejects.toBeInstanceOf(ServerSideAnnotatedThumbnailDisabledError);
  });

  it('集計のみの実行（dryRun）でも起動できない', async () => {
    await expect(run({ dryRun: true })).rejects.toBeInstanceOf(
      ServerSideAnnotatedThumbnailDisabledError
    );
  });

  it('対象の抽出も注釈の読み込みも生成も一切行わない', async () => {
    await expect(run()).rejects.toThrow();

    expect(mockPrisma.surveyImage.findMany).not.toHaveBeenCalled();
    expect(mockPrisma.imageAnnotation.findMany).not.toHaveBeenCalled();
    expect(mockAnnotatedThumbnailService.generateAnnotatedThumbnail).not.toHaveBeenCalled();
  });

  it('失敗は判別可能な code を持ち、実行してはならない理由を伝える', async () => {
    const caught = await run().catch((error: unknown) => error);

    expect(caught).toBeInstanceOf(ServerSideAnnotatedThumbnailDisabledError);
    const error = caught as ServerSideAnnotatedThumbnailDisabledError;
    expect(error.code).toBe('SERVER_SIDE_ANNOTATED_THUMBNAIL_DISABLED');
    expect(error.message).toContain('矢印');
    expect(error.message).toContain('座標');
    expect(error.message).toContain('回転');
    expect(error.message).toContain('design.md');
  });
});
