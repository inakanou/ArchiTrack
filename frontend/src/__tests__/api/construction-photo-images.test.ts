/**
 * @fileoverview 工事写真 画像管理APIクライアントのユニットテスト
 *
 * Task 5.1: フロントAPIクライアントと型（アップロード/現調コピー/一覧/メタ更新/並び替え/削除/印字画像）
 * Task 107.2: multipart送信の共通クライアント統一（返却形式は不変）
 * TDD: RED Phase - テストを最初に書く
 *
 * Requirements:
 * - 4.1: multipart アップロード（{successful, failed}）
 * - 6.1: 現調写真コピー（{successful, failed}）
 * - 7.1: メタデータ一括更新・並び替え
 * - 37.1: multipart 送信を共通クライアント（apiClient.sendFormData）経由へ統一する
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Mock } from 'vitest';
import { ApiError } from '../../api/client';
import {
  getConstructionPhotos,
  uploadConstructionPhotos,
  addConstructionPhotosFromSurveys,
  updateConstructionPhotoMetadataBatch,
  updateConstructionPhotoOrder,
  deleteConstructionPhoto,
  getConstructionPhotoPrintImage,
  getConstructionPhotoOriginalImage,
} from '../../api/construction-photo-images';
import type {
  ConstructionPhotoWithUrls,
  BatchUpdatePhotoMetadataItem,
  PhotoOrderItem,
} from '../../types/construction-photo.types';
import { apiClient } from '../../api/client';

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
      sendFormData: vi.fn(),
      getAccessToken: vi.fn(() => 'test-token'),
    },
  };
});

const mockPhoto: ConstructionPhotoWithUrls = {
  id: 'photo-1',
  albumId: 'album-1',
  fileName: 'photo.jpg',
  fileSize: 102400,
  width: 1920,
  height: 1080,
  displayOrder: 1,
  comment: null,
  includeInReport: false,
  signboardId: null,
  signboardPlacement: null,
  thumbnailUrl: '/signed/thumb.jpg',
  printImageUrl: '/api/construction-photos/images/photo-1/print-image',
  createdAt: '2025-01-01T00:00:00.000Z',
};

const mockFetch = vi.fn() as Mock;
globalThis.fetch = mockFetch;

describe('construction-photo-images API client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
    vi.mocked(apiClient.getAccessToken).mockReturnValue('test-token');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // getConstructionPhotos - 一覧（署名URL同梱）
  // ==========================================================================
  describe('getConstructionPhotos', () => {
    it('nestedパスで写真項目一覧を取得できること', async () => {
      const list: ConstructionPhotoWithUrls[] = [mockPhoto, { ...mockPhoto, id: 'photo-2' }];
      vi.mocked(apiClient.get).mockResolvedValueOnce(list);

      const result = await getConstructionPhotos('album-1');

      expect(apiClient.get).toHaveBeenCalledWith('/api/construction-photos/album-1/images');
      expect(result).toEqual(list);
    });
  });

  // ==========================================================================
  // uploadConstructionPhotos - multipart（{successful, failed}）
  // Task 107.2: 共通クライアント（apiClient.sendFormData）へ委譲する
  // ==========================================================================
  describe('uploadConstructionPhotos', () => {
    it('複数ファイルを1リクエストのmultipartで送信し{successful,failed}を返すこと', async () => {
      const files = [
        new File(['a'], 'p1.jpg', { type: 'image/jpeg' }),
        new File(['b'], 'p2.jpg', { type: 'image/jpeg' }),
      ];

      vi.mocked(apiClient.sendFormData).mockResolvedValueOnce({
        successful: [mockPhoto, { ...mockPhoto, id: 'photo-2' }],
        failed: [],
      });

      const result = await uploadConstructionPhotos('album-1', files);

      expect(apiClient.sendFormData).toHaveBeenCalledTimes(1);
      const [path, formData] = vi.mocked(apiClient.sendFormData).mock.calls[0] as [
        string,
        FormData,
      ];
      expect(path).toBe('/api/construction-photos/album-1/images');
      expect(formData).toBeInstanceOf(FormData);
      expect(formData.getAll('images')).toHaveLength(2);

      expect(result.successful).toHaveLength(2);
      expect(result.failed).toHaveLength(0);
    });

    it('素のfetchを使わず共通クライアント経由で送信すること', async () => {
      const files = [new File(['a'], 'p1.jpg', { type: 'image/jpeg' })];
      vi.mocked(apiClient.sendFormData).mockResolvedValueOnce({
        successful: [mockPhoto],
        failed: [],
      });

      await uploadConstructionPhotos('album-1', files);

      expect(mockFetch).not.toHaveBeenCalled();
      expect(apiClient.sendFormData).toHaveBeenCalledTimes(1);
    });

    it('部分失敗(207)でも例外を投げず{successful,failed}をそのまま返すこと', async () => {
      const files = [
        new File(['a'], 'p1.jpg', { type: 'image/jpeg' }),
        new File(['b'], 'bad.gif', { type: 'image/gif' }),
      ];

      const partialResult = {
        successful: [mockPhoto],
        failed: [{ fileName: 'bad.gif', error: '許可されていない画像形式です' }],
      };
      vi.mocked(apiClient.sendFormData).mockResolvedValueOnce(partialResult);

      const result = await uploadConstructionPhotos('album-1', files);

      expect(result).toEqual(partialResult);
      expect(result.successful).toHaveLength(1);
      expect(result.failed).toHaveLength(1);
      expect(result.failed[0]?.fileName).toBe('bad.gif');
    });

    it('413(ファイルサイズ超過)でApiErrorをスローすること', async () => {
      const files = [new File(['a'], 'big.jpg', { type: 'image/jpeg' })];
      vi.mocked(apiClient.sendFormData).mockRejectedValueOnce(
        new ApiError(413, 'ファイルサイズが上限を超えています', {
          detail: 'ファイルサイズが上限を超えています',
          code: 'FILE_SIZE_EXCEEDED',
        })
      );

      await expect(uploadConstructionPhotos('album-1', files)).rejects.toThrow(ApiError);
    });
  });

  // ==========================================================================
  // addConstructionPhotosFromSurveys - 現調コピー（{successful, failed}）
  // ==========================================================================
  describe('addConstructionPhotosFromSurveys', () => {
    it('surveyImageIdsをJSONで送信し{successful,failed}を返すこと', async () => {
      const copyResult = {
        successful: [mockPhoto],
        failed: [{ surveyImageId: 'survey-image-2', error: '他プロジェクトの写真です' }],
      };
      vi.mocked(apiClient.post).mockResolvedValueOnce(copyResult);

      const result = await addConstructionPhotosFromSurveys('album-1', [
        'survey-image-1',
        'survey-image-2',
      ]);

      expect(apiClient.post).toHaveBeenCalledWith(
        '/api/construction-photos/album-1/images/from-surveys',
        { surveyImageIds: ['survey-image-1', 'survey-image-2'] }
      );
      expect(result.successful).toHaveLength(1);
      expect(result.failed[0]?.surveyImageId).toBe('survey-image-2');
    });
  });

  // ==========================================================================
  // updateConstructionPhotoMetadataBatch - flat /images/batch
  // ==========================================================================
  describe('updateConstructionPhotoMetadataBatch', () => {
    it('itemsをPATCHで送信し更新後の写真項目配列を返すこと', async () => {
      const updated: ConstructionPhotoWithUrls[] = [
        { ...mockPhoto, comment: 'コメント', includeInReport: true },
      ];
      vi.mocked(apiClient.patch).mockResolvedValueOnce(updated);

      const items: BatchUpdatePhotoMetadataItem[] = [
        {
          id: 'photo-1',
          comment: 'コメント',
          includeInReport: true,
          signboardId: 'signboard-1',
          signboardPlacement: { left: 10, top: 20, width: 100, height: 80 },
          displayOrder: 1,
        },
      ];
      const result = await updateConstructionPhotoMetadataBatch(items);

      expect(apiClient.patch).toHaveBeenCalledWith('/api/construction-photos/images/batch', {
        items,
      });
      expect(result[0]?.comment).toBe('コメント');
    });
  });

  // ==========================================================================
  // updateConstructionPhotoOrder - nested /images/order
  // ==========================================================================
  describe('updateConstructionPhotoOrder', () => {
    it('ordersをPUTで送信すること', async () => {
      vi.mocked(apiClient.put).mockResolvedValueOnce(undefined);

      const orders: PhotoOrderItem[] = [
        { id: 'photo-1', order: 2 },
        { id: 'photo-2', order: 1 },
      ];
      await updateConstructionPhotoOrder('album-1', orders);

      expect(apiClient.put).toHaveBeenCalledWith('/api/construction-photos/album-1/images/order', {
        orders,
      });
    });
  });

  // ==========================================================================
  // deleteConstructionPhoto - flat /images/:imageId
  // ==========================================================================
  describe('deleteConstructionPhoto', () => {
    it('flatパスで写真項目を削除すること', async () => {
      vi.mocked(apiClient.delete).mockResolvedValueOnce(undefined);

      await deleteConstructionPhoto('photo-1');

      expect(apiClient.delete).toHaveBeenCalledWith('/api/construction-photos/images/photo-1');
    });
  });

  // ==========================================================================
  // getConstructionPhotoPrintImage - Blob(image/jpeg)
  // ==========================================================================
  describe('getConstructionPhotoPrintImage', () => {
    it('印字画像をBlobとして取得すること', async () => {
      const blob = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'image/jpeg' }),
        blob: async () => blob,
      });

      const result = await getConstructionPhotoPrintImage('photo-1');

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toContain('/api/construction-photos/images/photo-1/print-image');
      expect(options.method).toBe('GET');
      expect((options.headers as Record<string, string>)['Authorization']).toBe(
        'Bearer test-token'
      );
      expect(result).toBeInstanceOf(Blob);
      expect(result.type).toBe('image/jpeg');
    });

    it('404時にApiErrorをスローすること', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          detail: '写真項目が見つかりません',
          code: 'CONSTRUCTION_PHOTO_NOT_FOUND',
        }),
      });

      await expect(getConstructionPhotoPrintImage('non-existent')).rejects.toThrow(ApiError);
    });
  });

  // ==========================================================================
  // getConstructionPhotoOriginalImage - Blob（非合成原本, task 10.2）
  // ==========================================================================
  describe('getConstructionPhotoOriginalImage', () => {
    it('非合成原本をBlobとして取得すること', async () => {
      const blob = new Blob([new Uint8Array([4, 5, 6])], { type: 'image/jpeg' });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'image/jpeg' }),
        blob: async () => blob,
      });

      const result = await getConstructionPhotoOriginalImage('photo-1');

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toContain('/api/construction-photos/images/photo-1/original');
      expect(options.method).toBe('GET');
      expect((options.headers as Record<string, string>)['Authorization']).toBe(
        'Bearer test-token'
      );
      expect(result).toBeInstanceOf(Blob);
      expect(result.type).toBe('image/jpeg');
    });

    it('看板配置済みでも非合成原本(print-imageとは別エンドポイント)を取得すること', async () => {
      const blob = new Blob([new Uint8Array([7, 8, 9])], { type: 'image/png' });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'image/png' }),
        blob: async () => blob,
      });

      await getConstructionPhotoOriginalImage('photo-with-signboard');

      const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).not.toContain('print-image');
      expect(url).toContain('/original');
    });

    it('403時にApiErrorをスローすること', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ detail: '権限がありません', code: 'FORBIDDEN' }),
      });

      await expect(getConstructionPhotoOriginalImage('photo-1')).rejects.toThrow(ApiError);
    });

    it('404時にApiErrorをスローすること', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          detail: '写真項目が見つかりません',
          code: 'CONSTRUCTION_PHOTO_NOT_FOUND',
        }),
      });

      await expect(getConstructionPhotoOriginalImage('non-existent')).rejects.toThrow(ApiError);
    });
  });
});
