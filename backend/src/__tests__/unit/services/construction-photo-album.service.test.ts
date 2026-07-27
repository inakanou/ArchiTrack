/**
 * @fileoverview ConstructionPhotoAlbumService ユニットテスト
 *
 * TDD: RED phase - テストを先に書く
 *
 * Requirements:
 * - 1.1: プロジェクトに紐付く新規アルバムレコードを作成する
 * - 1.2: アルバムの基本情報を取得する
 * - 1.3: 楽観的排他制御を用いてアルバムレコードを更新する
 * - 1.4: アルバムを論理削除する
 * - 1.5: 同時編集による競合が検出される場合、競合エラーを返す
 * - 1.6: プロジェクトが存在しない場合、アルバムの作成を許可しない
 * - 3.1: プロジェクト単位でのページネーション
 * - 3.3: アルバム名での部分一致検索
 * - 3.4: ソート機能（作成日・更新日）
 * - 11.1: 一覧は最大50件のページネーション（既定limit=50）
 * - 13.2: 取得系は対象が要求プロジェクト配下であることを検証する
 *
 * Task 2.1: アルバムCRUD・一覧サービス
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  ConstructionPhotoAlbumService,
  ProjectNotFoundForAlbumError,
  ConstructionPhotoAlbumNotFoundError,
  ConstructionPhotoAlbumConflictError,
  type ConstructionPhotoAlbumServiceDependencies,
} from '../../../services/construction-photo-album.service.js';
import type { PrismaClient } from '../../../generated/prisma/client.js';

function createMockPrisma() {
  return {
    project: {
      findUnique: vi.fn(),
    },
    constructionPhotoAlbum: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    $transaction: vi.fn((fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        project: { findUnique: vi.fn() },
        constructionPhotoAlbum: {
          findUnique: vi.fn(),
          create: vi.fn(),
          update: vi.fn(),
        },
      })
    ),
  } as unknown as PrismaClient;
}

const mockProject = {
  id: 'project-123',
  name: 'テストプロジェクト',
  deletedAt: null,
};

const mockAlbum = {
  id: 'album-123',
  projectId: 'project-123',
  name: '基礎工事アルバム',
  memo: 'メモ内容',
  createdAt: new Date('2024-01-01T00:00:00.000Z'),
  updatedAt: new Date('2024-01-02T10:00:00.000Z'),
  deletedAt: null,
};

describe('ConstructionPhotoAlbumService', () => {
  let service: ConstructionPhotoAlbumService;
  let mockPrisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    mockPrisma = createMockPrisma();
    const deps: ConstructionPhotoAlbumServiceDependencies = { prisma: mockPrisma };
    service = new ConstructionPhotoAlbumService(deps);
  });

  describe('create', () => {
    const validInput = { projectId: 'project-123', name: '基礎工事アルバム', memo: 'メモ内容' };

    it('正常にアルバムを作成する（Requirements: 1.1）', async () => {
      mockPrisma.$transaction = vi.fn().mockImplementation(async (fn) => {
        const tx = {
          project: { findUnique: vi.fn().mockResolvedValue(mockProject) },
          constructionPhotoAlbum: { create: vi.fn().mockResolvedValue(mockAlbum) },
        };
        return fn(tx);
      });

      const result = await service.create(validInput);

      expect(result.id).toBe('album-123');
      expect(result.name).toBe('基礎工事アルバム');
      expect(result.projectId).toBe('project-123');
      expect(result.memo).toBe('メモ内容');
      // DTOは createdAt/updatedAt を ISO 文字列で返す
      expect(result.createdAt).toBe('2024-01-01T00:00:00.000Z');
      expect(result.updatedAt).toBe('2024-01-02T10:00:00.000Z');
    });

    it('プロジェクトが存在しない場合はエラーを返す（Requirements: 1.6）', async () => {
      mockPrisma.$transaction = vi.fn().mockImplementation(async (fn) => {
        const tx = {
          project: { findUnique: vi.fn().mockResolvedValue(null) },
          constructionPhotoAlbum: { create: vi.fn() },
        };
        return fn(tx);
      });

      await expect(service.create(validInput)).rejects.toThrow(ProjectNotFoundForAlbumError);
    });

    it('プロジェクトが論理削除されている場合はエラーを返す（Requirements: 1.6）', async () => {
      mockPrisma.$transaction = vi.fn().mockImplementation(async (fn) => {
        const tx = {
          project: {
            findUnique: vi.fn().mockResolvedValue({ ...mockProject, deletedAt: new Date() }),
          },
          constructionPhotoAlbum: { create: vi.fn() },
        };
        return fn(tx);
      });

      await expect(service.create(validInput)).rejects.toThrow(ProjectNotFoundForAlbumError);
    });

    it('メモが省略された場合も正常に作成する', async () => {
      const createMock = vi.fn().mockResolvedValue({ ...mockAlbum, memo: null });
      mockPrisma.$transaction = vi.fn().mockImplementation(async (fn) => {
        const tx = {
          project: { findUnique: vi.fn().mockResolvedValue(mockProject) },
          constructionPhotoAlbum: { create: createMock },
        };
        return fn(tx);
      });

      const result = await service.create({ projectId: 'project-123', name: 'アルバム' });

      expect(result.memo).toBeNull();
      expect(createMock).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ projectId: 'project-123', name: 'アルバム', memo: null }),
        })
      );
    });
  });

  describe('update', () => {
    it('正常にアルバムを更新する（Requirements: 1.3）', async () => {
      const updated = {
        ...mockAlbum,
        name: '更新後アルバム',
        memo: '更新メモ',
        updatedAt: new Date('2024-01-03T10:00:00.000Z'),
      };
      mockPrisma.$transaction = vi.fn().mockImplementation(async (fn) => {
        const tx = {
          constructionPhotoAlbum: {
            findUnique: vi.fn().mockResolvedValue(mockAlbum),
            update: vi.fn().mockResolvedValue(updated),
          },
        };
        return fn(tx);
      });

      const result = await service.update('album-123', {
        name: '更新後アルバム',
        memo: '更新メモ',
        updatedAt: '2024-01-02T10:00:00.000Z',
      });

      expect(result.name).toBe('更新後アルバム');
      expect(result.memo).toBe('更新メモ');
      expect(result.updatedAt).toBe('2024-01-03T10:00:00.000Z');
    });

    it('名前のみ更新できる', async () => {
      const updateMock = vi.fn().mockResolvedValue({ ...mockAlbum, name: '新名称' });
      mockPrisma.$transaction = vi.fn().mockImplementation(async (fn) => {
        const tx = {
          constructionPhotoAlbum: {
            findUnique: vi.fn().mockResolvedValue(mockAlbum),
            update: updateMock,
          },
        };
        return fn(tx);
      });

      await service.update('album-123', { name: '新名称', updatedAt: '2024-01-02T10:00:00.000Z' });

      expect(updateMock).toHaveBeenCalledWith({
        where: { id: 'album-123' },
        data: { name: '新名称' },
      });
    });

    it('楽観的排他制御: updatedAtが一致しない場合はコンフリクトエラーを返す（Requirements: 1.5）', async () => {
      mockPrisma.$transaction = vi.fn().mockImplementation(async (fn) => {
        const tx = {
          constructionPhotoAlbum: {
            findUnique: vi.fn().mockResolvedValue(mockAlbum),
            update: vi.fn(),
          },
        };
        return fn(tx);
      });

      await expect(
        service.update('album-123', {
          name: '新名称',
          updatedAt: '2024-01-01T00:00:00.000Z', // 古い値
        })
      ).rejects.toThrow(ConstructionPhotoAlbumConflictError);
    });

    it('存在しないアルバムを更新しようとするとエラーを返す', async () => {
      mockPrisma.$transaction = vi.fn().mockImplementation(async (fn) => {
        const tx = {
          constructionPhotoAlbum: {
            findUnique: vi.fn().mockResolvedValue(null),
            update: vi.fn(),
          },
        };
        return fn(tx);
      });

      await expect(
        service.update('nope', { name: 'x', updatedAt: '2024-01-02T10:00:00.000Z' })
      ).rejects.toThrow(ConstructionPhotoAlbumNotFoundError);
    });

    it('論理削除されたアルバムを更新しようとするとエラーを返す', async () => {
      mockPrisma.$transaction = vi.fn().mockImplementation(async (fn) => {
        const tx = {
          constructionPhotoAlbum: {
            findUnique: vi.fn().mockResolvedValue({ ...mockAlbum, deletedAt: new Date() }),
            update: vi.fn(),
          },
        };
        return fn(tx);
      });

      await expect(
        service.update('album-123', { name: 'x', updatedAt: '2024-01-02T10:00:00.000Z' })
      ).rejects.toThrow(ConstructionPhotoAlbumNotFoundError);
    });
  });

  describe('softDelete', () => {
    it('正常にアルバムを論理削除する（Requirements: 1.4）', async () => {
      const updateMock = vi.fn().mockResolvedValue({ ...mockAlbum, deletedAt: new Date() });
      mockPrisma.$transaction = vi.fn().mockImplementation(async (fn) => {
        const tx = {
          constructionPhotoAlbum: {
            findUnique: vi.fn().mockResolvedValue(mockAlbum),
            update: updateMock,
          },
        };
        return fn(tx);
      });

      await service.softDelete('album-123');

      expect(updateMock).toHaveBeenCalledWith({
        where: { id: 'album-123' },
        data: { deletedAt: expect.any(Date) },
      });
    });

    it('存在しないアルバムを削除しようとするとエラーを返す', async () => {
      mockPrisma.$transaction = vi.fn().mockImplementation(async (fn) => {
        const tx = {
          constructionPhotoAlbum: {
            findUnique: vi.fn().mockResolvedValue(null),
            update: vi.fn(),
          },
        };
        return fn(tx);
      });

      await expect(service.softDelete('nope')).rejects.toThrow(ConstructionPhotoAlbumNotFoundError);
    });

    it('既に論理削除されたアルバムを削除しようとするとエラーを返す', async () => {
      mockPrisma.$transaction = vi.fn().mockImplementation(async (fn) => {
        const tx = {
          constructionPhotoAlbum: {
            findUnique: vi.fn().mockResolvedValue({ ...mockAlbum, deletedAt: new Date() }),
            update: vi.fn(),
          },
        };
        return fn(tx);
      });

      await expect(service.softDelete('album-123')).rejects.toThrow(
        ConstructionPhotoAlbumNotFoundError
      );
    });
  });

  describe('findById', () => {
    it('正常にアルバム詳細を取得する（Requirements: 1.2）', async () => {
      mockPrisma.constructionPhotoAlbum.findUnique = vi.fn().mockResolvedValue(mockAlbum);

      const result = await service.findById('album-123');

      expect(result.id).toBe('album-123');
      expect(result.name).toBe('基礎工事アルバム');
    });

    it('論理削除済みを除外して取得する', async () => {
      mockPrisma.constructionPhotoAlbum.findUnique = vi.fn().mockResolvedValue(null);

      await expect(service.findById('album-123')).rejects.toThrow(
        ConstructionPhotoAlbumNotFoundError
      );
      expect(mockPrisma.constructionPhotoAlbum.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'album-123', deletedAt: null } })
      );
    });

    it('存在しないアルバムIDはNotFoundを返す', async () => {
      mockPrisma.constructionPhotoAlbum.findUnique = vi.fn().mockResolvedValue(null);

      await expect(service.findById('nope')).rejects.toThrow(ConstructionPhotoAlbumNotFoundError);
    });

    it('要求プロジェクト配下でないアルバムは取得できない（Requirements: 13.2）', async () => {
      // アルバムは project-123 配下だが、project-999 の配下として要求
      mockPrisma.constructionPhotoAlbum.findUnique = vi.fn().mockResolvedValue(mockAlbum);

      await expect(service.findById('album-123', 'project-999')).rejects.toThrow(
        ConstructionPhotoAlbumNotFoundError
      );
    });

    it('要求プロジェクト配下のアルバムは取得できる（Requirements: 13.2）', async () => {
      mockPrisma.constructionPhotoAlbum.findUnique = vi.fn().mockResolvedValue(mockAlbum);

      const result = await service.findById('album-123', 'project-123');

      expect(result.id).toBe('album-123');
    });
  });

  describe('findByProject', () => {
    const mockAlbums = [
      { ...mockAlbum, id: 'album-001', name: '基礎工事' },
      { ...mockAlbum, id: 'album-002', name: '外構工事' },
    ];

    it('プロジェクト単位で一覧を取得する（Requirements: 3.1）', async () => {
      mockPrisma.constructionPhotoAlbum.findMany = vi.fn().mockResolvedValue(mockAlbums);
      mockPrisma.constructionPhotoAlbum.count = vi.fn().mockResolvedValue(2);

      const result = await service.findByProject('project-123', {});

      expect(result.data).toHaveLength(2);
      expect(result.data[0]!.id).toBe('album-001');
    });

    it('既定のlimitは50件（Requirements: 11.1）', async () => {
      mockPrisma.constructionPhotoAlbum.findMany = vi.fn().mockResolvedValue([]);
      mockPrisma.constructionPhotoAlbum.count = vi.fn().mockResolvedValue(0);

      const result = await service.findByProject('project-123', {});

      expect(result.pagination.limit).toBe(50);
      expect(mockPrisma.constructionPhotoAlbum.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 50, skip: 0 })
      );
    });

    it('ページネーション情報を正しく返す（Requirements: 3.1）', async () => {
      mockPrisma.constructionPhotoAlbum.findMany = vi.fn().mockResolvedValue(mockAlbums);
      mockPrisma.constructionPhotoAlbum.count = vi.fn().mockResolvedValue(120);

      const result = await service.findByProject('project-123', { page: 2, limit: 50 });

      expect(result.pagination.page).toBe(2);
      expect(result.pagination.limit).toBe(50);
      expect(result.pagination.total).toBe(120);
      expect(result.pagination.totalPages).toBe(3);
      expect(mockPrisma.constructionPhotoAlbum.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 50, take: 50 })
      );
    });

    it('アルバム名で部分一致検索する（Requirements: 3.3）', async () => {
      mockPrisma.constructionPhotoAlbum.findMany = vi.fn().mockResolvedValue([mockAlbums[0]]);
      mockPrisma.constructionPhotoAlbum.count = vi.fn().mockResolvedValue(1);

      await service.findByProject('project-123', { filter: { search: '基礎' } });

      expect(mockPrisma.constructionPhotoAlbum.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            name: expect.objectContaining({ contains: '基礎', mode: 'insensitive' }),
          }),
        })
      );
    });

    it('作成日でソートする（Requirements: 3.4）', async () => {
      mockPrisma.constructionPhotoAlbum.findMany = vi.fn().mockResolvedValue(mockAlbums);
      mockPrisma.constructionPhotoAlbum.count = vi.fn().mockResolvedValue(2);

      await service.findByProject('project-123', { sort: 'createdAt', order: 'asc' });

      expect(mockPrisma.constructionPhotoAlbum.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { createdAt: 'asc' } })
      );
    });

    it('更新日でソートする（Requirements: 3.4）', async () => {
      mockPrisma.constructionPhotoAlbum.findMany = vi.fn().mockResolvedValue(mockAlbums);
      mockPrisma.constructionPhotoAlbum.count = vi.fn().mockResolvedValue(2);

      await service.findByProject('project-123', { sort: 'updatedAt', order: 'desc' });

      expect(mockPrisma.constructionPhotoAlbum.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { updatedAt: 'desc' } })
      );
    });

    it('論理削除済みを除外し、プロジェクトIDで絞り込む（Requirements: 13.2）', async () => {
      mockPrisma.constructionPhotoAlbum.findMany = vi.fn().mockResolvedValue([]);
      mockPrisma.constructionPhotoAlbum.count = vi.fn().mockResolvedValue(0);

      await service.findByProject('project-abc', {});

      expect(mockPrisma.constructionPhotoAlbum.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ projectId: 'project-abc', deletedAt: null }),
        })
      );
      expect(mockPrisma.constructionPhotoAlbum.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ projectId: 'project-abc', deletedAt: null }),
        })
      );
    });

    it('他プロジェクトのアルバムは一覧に含まれない（Requirements: 13.2）', async () => {
      // project-123 のアルバムのみが返る（DBフィルタの結果）
      mockPrisma.constructionPhotoAlbum.findMany = vi.fn().mockResolvedValue([]);
      mockPrisma.constructionPhotoAlbum.count = vi.fn().mockResolvedValue(0);

      const result = await service.findByProject('project-other', {});

      expect(result.data).toHaveLength(0);
      expect(result.pagination.total).toBe(0);
    });
  });
});
