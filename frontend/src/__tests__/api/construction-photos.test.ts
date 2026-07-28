/**
 * @fileoverview 工事写真アルバムAPIクライアントのユニットテスト
 *
 * Task 5.1: フロントAPIクライアントと型（アルバムCRUD・一覧）
 * TDD: RED Phase - テストを最初に書く
 *
 * Requirements:
 * - 1.1: POST /api/projects/:projectId/construction-photos アルバム作成
 * - 3.1: GET /api/projects/:projectId/construction-photos アルバム一覧（ページング）
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { apiClient, ApiError } from '../../api/client';
import {
  getConstructionPhotoAlbums,
  getConstructionPhotoAlbum,
  createConstructionPhotoAlbum,
  updateConstructionPhotoAlbum,
  deleteConstructionPhotoAlbum,
} from '../../api/construction-photos';
import {
  isConstructionPhotoAlbumConflictErrorResponse,
  type ConstructionPhotoAlbum,
  type PaginatedConstructionPhotoAlbums,
  type CreateConstructionPhotoAlbumInput,
  type UpdateConstructionPhotoAlbumInput,
} from '../../types/construction-photo.types';

vi.mock('../../api/client', async () => {
  const actual = await vi.importActual<typeof import('../../api/client')>('../../api/client');
  return {
    ...actual,
    apiClient: {
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
      patch: vi.fn(),
      delete: vi.fn(),
      getAccessToken: vi.fn(() => null),
    },
  };
});

describe('construction-photos API client (アルバム)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const mockAlbum: ConstructionPhotoAlbum = {
    id: 'album-1',
    projectId: 'project-1',
    name: '工事写真アルバム1',
    memo: 'メモ1',
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-02T00:00:00.000Z',
  };

  const mockPaginated: PaginatedConstructionPhotoAlbums = {
    data: [
      mockAlbum,
      {
        id: 'album-2',
        projectId: 'project-1',
        name: '工事写真アルバム2',
        memo: null,
        createdAt: '2025-01-03T00:00:00.000Z',
        updatedAt: '2025-01-03T00:00:00.000Z',
      },
    ],
    pagination: { page: 1, limit: 50, total: 2, totalPages: 1 },
  };

  describe('getConstructionPhotoAlbums', () => {
    it('デフォルトパラメータで一覧を取得できること', async () => {
      vi.mocked(apiClient.get).mockResolvedValueOnce(mockPaginated);

      const result = await getConstructionPhotoAlbums('project-1');

      expect(apiClient.get).toHaveBeenCalledWith('/api/projects/project-1/construction-photos');
      expect(result).toEqual(mockPaginated);
    });

    it('ページング・検索・ソートパラメータを付与できること', async () => {
      vi.mocked(apiClient.get).mockResolvedValueOnce(mockPaginated);

      await getConstructionPhotoAlbums('project-1', {
        page: 2,
        limit: 20,
        search: 'アル',
        sort: 'updatedAt',
        order: 'asc',
      });

      expect(apiClient.get).toHaveBeenCalledWith(
        '/api/projects/project-1/construction-photos?page=2&limit=20&search=%E3%82%A2%E3%83%AB&sort=updatedAt&order=asc'
      );
    });

    it('認証エラー時に401 ApiErrorがスローされること', async () => {
      vi.mocked(apiClient.get).mockRejectedValue(new ApiError(401, '認証が必要です'));
      await expect(getConstructionPhotoAlbums('project-1')).rejects.toThrow(ApiError);
    });
  });

  describe('getConstructionPhotoAlbum', () => {
    it('flatパスで詳細を取得できること', async () => {
      vi.mocked(apiClient.get).mockResolvedValueOnce(mockAlbum);

      const result = await getConstructionPhotoAlbum('album-1');

      expect(apiClient.get).toHaveBeenCalledWith('/api/construction-photos/album-1');
      expect(result).toEqual(mockAlbum);
    });
  });

  describe('createConstructionPhotoAlbum', () => {
    it('nestedパスでアルバムを作成できること', async () => {
      vi.mocked(apiClient.post).mockResolvedValueOnce(mockAlbum);

      const input: CreateConstructionPhotoAlbumInput = { name: '工事写真アルバム1', memo: 'メモ1' };
      const result = await createConstructionPhotoAlbum('project-1', input);

      expect(apiClient.post).toHaveBeenCalledWith(
        '/api/projects/project-1/construction-photos',
        input
      );
      expect(result).toEqual(mockAlbum);
    });
  });

  describe('updateConstructionPhotoAlbum', () => {
    it('flatパスでupdatedAt(楽観排他)を付与して更新できること', async () => {
      vi.mocked(apiClient.patch).mockResolvedValueOnce(mockAlbum);

      const input: UpdateConstructionPhotoAlbumInput = { name: '更新後' };
      const expectedUpdatedAt = '2025-01-02T00:00:00.000Z';
      const result = await updateConstructionPhotoAlbum('album-1', input, expectedUpdatedAt);

      expect(apiClient.patch).toHaveBeenCalledWith('/api/construction-photos/album-1', {
        name: '更新後',
        updatedAt: expectedUpdatedAt,
      });
      expect(result).toEqual(mockAlbum);
    });

    it('楽観排他競合(409)を型ガードで識別できること', async () => {
      const response = {
        type: 'https://architrack.example.com/problems/construction-photo-album-conflict',
        title: 'Conflict',
        status: 409,
        detail: 'アルバムは他のユーザーによって更新されました。',
        code: 'CONSTRUCTION_PHOTO_ALBUM_CONFLICT',
      };
      vi.mocked(apiClient.patch).mockRejectedValue(new ApiError(409, response.detail, response));

      try {
        await updateConstructionPhotoAlbum('album-1', { name: 'x' }, '2025-01-02T00:00:00.000Z');
        expect.fail('エラーがスローされるべきです');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).statusCode).toBe(409);
        expect(isConstructionPhotoAlbumConflictErrorResponse((error as ApiError).response)).toBe(
          true
        );
      }
    });
  });

  describe('deleteConstructionPhotoAlbum', () => {
    it('flatパスで削除できること', async () => {
      vi.mocked(apiClient.delete).mockResolvedValueOnce(undefined);

      await deleteConstructionPhotoAlbum('album-1');

      expect(apiClient.delete).toHaveBeenCalledWith('/api/construction-photos/album-1');
    });
  });

  describe('isConstructionPhotoAlbumConflictErrorResponse', () => {
    it('code不一致でfalseを返すこと', () => {
      expect(isConstructionPhotoAlbumConflictErrorResponse({ code: 'OTHER', status: 409 })).toBe(
        false
      );
    });

    it('nullでfalseを返すこと', () => {
      expect(isConstructionPhotoAlbumConflictErrorResponse(null)).toBe(false);
    });
  });
});
