/**
 * @fileoverview ProjectPurgeService の単体テスト
 *
 * Task 81.1: 完全削除の対象と、ファイルのキー・種類ごとの件数を集める
 *
 * Requirements (project-management):
 * - 46.1: 論理削除の日時から 90 日間は保持する（89 日は対象外、90 日を過ぎたものは対象）
 * - 46.8: 導入の前に論理削除されたプロジェクトにも同じ保持期間を当てる
 */

import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import type { PrismaClient } from '../../../generated/prisma/client.js';
import type { StorageProvider } from '../../../storage/storage-provider.interface.js';

vi.mock('../../../utils/logger.js', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import {
  ProjectPurgeService,
  PROJECT_PURGE_BATCH_SIZE,
  PROJECT_PURGE_RETENTION_DAYS,
} from '../../../services/project-purge.service.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-11-10T03:30:00.000Z');

/** now から days 日（と ms ミリ秒）前の日時 */
function daysAgo(days: number, ms = 0): Date {
  return new Date(NOW.getTime() - days * DAY_MS - ms);
}

type ProjectRow = { id: string; deletedAt: Date | null };

/** where の deletedAt の条件で絞る（lt / lte / not: null だけを解す） */
function matchDeletedAt(
  row: ProjectRow,
  cond: { lt?: Date; lte?: Date; not?: null } | null | undefined
): boolean {
  if (cond === undefined) return true;
  if (cond === null) return row.deletedAt === null;
  if (row.deletedAt === null) return false;
  if (cond.lt && !(row.deletedAt.getTime() < cond.lt.getTime())) return false;
  if (cond.lte && !(row.deletedAt.getTime() <= cond.lte.getTime())) return false;
  return true;
}

/** プロジェクトの行を持つ偽の prisma（findMany と count が where・orderBy・take を解す） */
function createProjectTable(rows: ProjectRow[]) {
  const filter = (args: { where?: { deletedAt?: never } } | undefined) =>
    rows.filter((r) => matchDeletedAt(r, args?.where?.deletedAt));
  return {
    findMany: vi.fn(
      async (args: { where?: { deletedAt?: never }; orderBy?: unknown; take?: number }) => {
        const orders = Array.isArray(args.orderBy) ? args.orderBy : [args.orderBy];
        const sorted = [...filter(args)].sort((a, b) => {
          for (const o of orders as Array<Record<string, 'asc' | 'desc'>>) {
            if (!o) continue;
            const [key, dir] = Object.entries(o)[0] as ['deletedAt' | 'id', 'asc' | 'desc'];
            const av = key === 'deletedAt' ? (a.deletedAt?.getTime() ?? 0) : a.id;
            const bv = key === 'deletedAt' ? (b.deletedAt?.getTime() ?? 0) : b.id;
            if (av < bv) return dir === 'asc' ? -1 : 1;
            if (av > bv) return dir === 'asc' ? 1 : -1;
          }
          return 0;
        });
        const taken = args.take === undefined ? sorted : sorted.slice(0, args.take);
        return taken.map((r) => ({ id: r.id, deletedAt: r.deletedAt }));
      }
    ),
    count: vi.fn(async (args: { where?: { deletedAt?: never } }) => filter(args).length),
  };
}

function createMockPrisma(projects: ProjectRow[] = []) {
  return {
    project: createProjectTable(projects),
    siteSurvey: { count: vi.fn().mockResolvedValue(0) },
    surveyImage: { findMany: vi.fn().mockResolvedValue([]) },
    quantityTable: { count: vi.fn().mockResolvedValue(0) },
    itemizedStatement: { count: vi.fn().mockResolvedValue(0) },
    estimateRequest: { count: vi.fn().mockResolvedValue(0) },
    receivedQuotation: { findMany: vi.fn().mockResolvedValue([]) },
    estimate: { count: vi.fn().mockResolvedValue(0) },
    contract: { count: vi.fn().mockResolvedValue(0) },
    constructionSchedule: { count: vi.fn().mockResolvedValue(0) },
    executionBudget: { count: vi.fn().mockResolvedValue(0) },
    constructionPhotoAlbum: { count: vi.fn().mockResolvedValue(0) },
    constructionPhoto: { findMany: vi.fn().mockResolvedValue([]) },
  };
}

type MockPrisma = ReturnType<typeof createMockPrisma>;

function createService(prisma: MockPrisma) {
  const storageProvider = { type: 'local', delete: vi.fn() } as unknown as StorageProvider;
  return new ProjectPurgeService({
    prisma: prisma as unknown as PrismaClient,
    storageProvider,
  });
}

describe('ProjectPurgeService', () => {
  describe('定数', () => {
    it('保持期間は 90 日、1 回の件数は 20 件である（46.1、D7）', () => {
      expect(PROJECT_PURGE_RETENTION_DAYS).toBe(90);
      expect(PROJECT_PURGE_BATCH_SIZE).toBe(20);
    });
  });

  describe('selectTargets（完全削除の対象）', () => {
    it('論理削除から 90 日を過ぎたものだけを選び、89 日・ちょうど 90 日・未削除は選ばない（46.1）', async () => {
      const prisma = createMockPrisma([
        { id: 'p-89', deletedAt: daysAgo(89) },
        { id: 'p-89-23h', deletedAt: daysAgo(89, 23 * 60 * 60 * 1000) },
        { id: 'p-90-exact', deletedAt: daysAgo(90) },
        { id: 'p-90-plus-1ms', deletedAt: daysAgo(90, 1) },
        { id: 'p-91', deletedAt: daysAgo(91) },
        { id: 'p-alive', deletedAt: null },
      ]);
      const service = createService(prisma);

      const result = await service.selectTargets(NOW);

      expect(result.targets.map((t) => t.id)).toEqual(['p-91', 'p-90-plus-1ms']);
      expect(result.remainingCandidates).toBe(0);
    });

    it('導入の前に論理削除された古いものも同じ条件で選ぶ（46.8）', async () => {
      const prisma = createMockPrisma([
        { id: 'p-old', deletedAt: new Date('2024-01-15T00:00:00.000Z') },
        { id: 'p-recent', deletedAt: daysAgo(10) },
      ]);
      const service = createService(prisma);

      const result = await service.selectTargets(NOW);

      expect(result.targets).toEqual([
        { id: 'p-old', deletedAt: new Date('2024-01-15T00:00:00.000Z') },
      ]);
    });

    it('論理削除の古い順に最大 20 件を選び、残りの件数を数える（D7）', async () => {
      // 25 件を古さがばらばらの順で並べる
      const rows: ProjectRow[] = Array.from({ length: 25 }, (_, i) => {
        const order = (i * 7) % 25; // 0..24 の並べ替え
        return { id: `p-${String(order).padStart(2, '0')}`, deletedAt: daysAgo(200 - order) };
      });
      rows.push({ id: 'p-young', deletedAt: daysAgo(30) });
      const prisma = createMockPrisma(rows);
      const service = createService(prisma);

      const result = await service.selectTargets(NOW);

      expect(result.targets).toHaveLength(20);
      expect(result.targets.map((t) => t.id)).toEqual(
        Array.from({ length: 20 }, (_, i) => `p-${String(i).padStart(2, '0')}`)
      );
      expect(result.remainingCandidates).toBe(5);
    });

    it('対象の条件と件数の条件は同じで、締めの日時は now の 90 日前である', async () => {
      const prisma = createMockPrisma([]);
      const service = createService(prisma);

      await service.selectTargets(NOW);

      const cutoff = new Date(NOW.getTime() - 90 * DAY_MS);
      const findArgs = prisma.project.findMany.mock.calls[0]![0];
      const countArgs = prisma.project.count.mock.calls[0]![0];
      expect(findArgs.where).toEqual({ deletedAt: { not: null, lt: cutoff } });
      expect(countArgs.where).toEqual(findArgs.where);
      expect(findArgs.take).toBe(20);
    });
  });

  describe('collectProjectAssets（ファイルのキーと種類ごとの件数）', () => {
    let prisma: MockPrisma;

    beforeEach(() => {
      prisma = createMockPrisma();
    });

    it('現場調査の画像・工事写真・受領見積書のキーを重複なく集め、空のキーは除く', async () => {
      prisma.surveyImage.findMany.mockResolvedValue([
        {
          originalPath: 'surveys/a/original.jpg',
          thumbnailPath: 'surveys/a/thumb.jpg',
          annotatedThumbnailPath: 'surveys/a/annotated.jpg',
        },
        {
          originalPath: 'surveys/b/original.jpg',
          thumbnailPath: 'surveys/b/thumb.jpg',
          annotatedThumbnailPath: null,
        },
      ]);
      prisma.constructionPhoto.findMany.mockResolvedValue([
        // 現調からの写しで同じキーを指すことがある
        { originalPath: 'surveys/a/original.jpg', thumbnailPath: 'photos/c/thumb.jpg' },
        { originalPath: 'photos/d/original.jpg', thumbnailPath: 'photos/d/thumb.jpg' },
      ]);
      prisma.receivedQuotation.findMany.mockResolvedValue([
        { filePath: 'quotations/e.pdf' },
        { filePath: null },
        { filePath: 'quotations/e.pdf' },
        { filePath: '' },
      ]);
      const service = createService(prisma);

      const result = await service.collectProjectAssets('project-1');

      expect(result.fileKeys).toEqual([
        'surveys/a/original.jpg',
        'surveys/a/thumb.jpg',
        'surveys/a/annotated.jpg',
        'surveys/b/original.jpg',
        'surveys/b/thumb.jpg',
        'photos/c/thumb.jpg',
        'photos/d/original.jpg',
        'photos/d/thumb.jpg',
        'quotations/e.pdf',
      ]);
      expect(result.counts.files).toBe(9);
      expect(result.counts.surveyImages).toBe(2);
      expect(result.counts.constructionPhotos).toBe(2);
      expect(result.counts.receivedQuotations).toBe(4);
    });

    it('個別に論理削除された関連データも含めて集める（deletedAt で絞らない）', async () => {
      const service = createService(prisma);

      await service.collectProjectAssets('project-1');

      expect(prisma.surveyImage.findMany).toHaveBeenCalledWith({
        where: { survey: { projectId: 'project-1' } },
        select: { originalPath: true, thumbnailPath: true, annotatedThumbnailPath: true },
      });
      expect(prisma.constructionPhoto.findMany).toHaveBeenCalledWith({
        where: { album: { projectId: 'project-1' } },
        select: { originalPath: true, thumbnailPath: true },
      });
      // 受領見積書は両方の文脈（案件に直接・見積依頼を通して）
      expect(prisma.receivedQuotation.findMany).toHaveBeenCalledWith({
        where: {
          OR: [{ projectId: 'project-1' }, { estimateRequest: { projectId: 'project-1' } }],
        },
        select: { filePath: true },
      });
      const countModels = [
        prisma.siteSurvey,
        prisma.quantityTable,
        prisma.itemizedStatement,
        prisma.estimateRequest,
        prisma.estimate,
        prisma.contract,
        prisma.constructionSchedule,
        prisma.executionBudget,
        prisma.constructionPhotoAlbum,
      ];
      for (const model of countModels) {
        expect(model.count).toHaveBeenCalledWith({ where: { projectId: 'project-1' } });
      }
      // どの条件にも deletedAt が無い
      const allArgs = [
        ...prisma.surveyImage.findMany.mock.calls,
        ...prisma.constructionPhoto.findMany.mock.calls,
        ...prisma.receivedQuotation.findMany.mock.calls,
        ...countModels.flatMap((m) => (m.count as Mock).mock.calls),
      ];
      expect(JSON.stringify(allArgs)).not.toContain('deletedAt');
    });

    it('種類ごとの件数を返す', async () => {
      prisma.siteSurvey.count.mockResolvedValue(3);
      prisma.surveyImage.findMany.mockResolvedValue([
        { originalPath: 'o1', thumbnailPath: 't1', annotatedThumbnailPath: null },
      ]);
      prisma.quantityTable.count.mockResolvedValue(4);
      prisma.itemizedStatement.count.mockResolvedValue(5);
      prisma.estimateRequest.count.mockResolvedValue(6);
      prisma.receivedQuotation.findMany.mockResolvedValue([{ filePath: null }, { filePath: null }]);
      prisma.estimate.count.mockResolvedValue(7);
      prisma.contract.count.mockResolvedValue(8);
      prisma.constructionSchedule.count.mockResolvedValue(9);
      prisma.executionBudget.count.mockResolvedValue(1);
      prisma.constructionPhotoAlbum.count.mockResolvedValue(10);
      prisma.constructionPhoto.findMany.mockResolvedValue([
        { originalPath: 'po1', thumbnailPath: 'pt1' },
        { originalPath: 'po2', thumbnailPath: 'pt2' },
        { originalPath: 'po3', thumbnailPath: 'pt3' },
      ]);
      const service = createService(prisma);

      const result = await service.collectProjectAssets('project-1');

      expect(result.counts).toEqual({
        siteSurveys: 3,
        surveyImages: 1,
        quantityTables: 4,
        itemizedStatements: 5,
        estimateRequests: 6,
        receivedQuotations: 2,
        estimates: 7,
        contracts: 8,
        schedules: 9,
        executionBudgets: 1,
        constructionPhotoAlbums: 10,
        constructionPhotos: 3,
        files: 8,
      });
    });

    it('関連データが無ければ件数はすべて 0 でキーは空である', async () => {
      const service = createService(prisma);

      const result = await service.collectProjectAssets('project-1');

      expect(result.fileKeys).toEqual([]);
      expect(Object.values(result.counts).every((n) => n === 0)).toBe(true);
      expect(Object.keys(result.counts)).toHaveLength(13);
    });
  });
});
