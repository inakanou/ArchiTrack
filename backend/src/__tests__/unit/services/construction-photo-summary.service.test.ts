/**
 * @fileoverview ConstructionPhotoSummaryService ユニットテスト
 *
 * TDD: RED phase - テストを先に書く
 *
 * Requirements:
 * - 2.3: プロジェクト詳細画面の工事写真パネルに登録件数などのサマリ情報を表示する
 *
 * Task 4.1: detail-summary に工事写真セクションを追加
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  ConstructionPhotoSummaryService,
  type ConstructionPhotoSummaryServiceDependencies,
} from '../../../services/construction-photo-summary.service.js';
import type { PrismaClient } from '../../../generated/prisma/client.js';

function createMockPrisma() {
  return {
    constructionPhotoAlbum: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
  } as unknown as PrismaClient;
}

const PROJECT_ID = 'project-123';

/**
 * findMany が返すアルバム（代表写真＋写真数を include した形）
 */
const mockAlbumRecords = [
  {
    id: 'album-2',
    projectId: PROJECT_ID,
    name: '外構工事アルバム',
    memo: null,
    createdAt: new Date('2024-02-01T00:00:00.000Z'),
    updatedAt: new Date('2024-02-02T00:00:00.000Z'),
    photos: [{ id: 'photo-20', thumbnailPath: 'construction-photos/album-2/thumb-20.jpg' }],
    _count: { photos: 4 },
  },
  {
    id: 'album-1',
    projectId: PROJECT_ID,
    name: '基礎工事アルバム',
    memo: 'メモ',
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
    updatedAt: new Date('2024-01-05T00:00:00.000Z'),
    photos: [], // 写真なし → 代表サムネなし
    _count: { photos: 0 },
  },
];

describe('ConstructionPhotoSummaryService.findLatestByProjectId', () => {
  let service: ConstructionPhotoSummaryService;
  let prisma: PrismaClient;

  beforeEach(() => {
    prisma = createMockPrisma();
    const deps: ConstructionPhotoSummaryServiceDependencies = { prisma };
    service = new ConstructionPhotoSummaryService(deps);
  });

  it('当該プロジェクトの最新N件アルバムと totalCount を返す（REQ 2.3）', async () => {
    (prisma.constructionPhotoAlbum.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockAlbumRecords
    );
    (prisma.constructionPhotoAlbum.count as ReturnType<typeof vi.fn>).mockResolvedValue(5);

    const result = await service.findLatestByProjectId(PROJECT_ID);

    expect(result.totalCount).toBe(5);
    expect(result.latestAlbums).toHaveLength(2);
    expect(result.latestAlbums[0]).toMatchObject({
      id: 'album-2',
      projectId: PROJECT_ID,
      name: '外構工事アルバム',
      thumbnailUrl: 'construction-photos/album-2/thumb-20.jpg',
      representativeImageId: 'photo-20',
      photoCount: 4,
    });
    // 写真なしアルバムは代表サムネ null
    expect(result.latestAlbums[1]).toMatchObject({
      id: 'album-1',
      thumbnailUrl: null,
      representativeImageId: null,
      photoCount: 0,
    });
  });

  it('論理削除除外・プロジェクト境界・件数制限で問い合わせる（REQ 2.3, 13.2）', async () => {
    const findMany = prisma.constructionPhotoAlbum.findMany as ReturnType<typeof vi.fn>;
    findMany.mockResolvedValue([]);
    (prisma.constructionPhotoAlbum.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);

    await service.findLatestByProjectId(PROJECT_ID, 2);

    const arg = findMany.mock.calls[0]![0];
    expect(arg.where).toMatchObject({ projectId: PROJECT_ID, deletedAt: null });
    expect(arg.take).toBe(2);
  });

  it('アルバムが存在しない場合は totalCount=0・空配列を返す', async () => {
    (prisma.constructionPhotoAlbum.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (prisma.constructionPhotoAlbum.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);

    const result = await service.findLatestByProjectId(PROJECT_ID);

    expect(result).toEqual({ totalCount: 0, latestAlbums: [] });
  });
});
