/**
 * @fileoverview 注釈管理APIクライアントの単体テスト
 *
 * Task 7.3: 注釈管理APIクライアントを実装する
 *
 * Requirements:
 * - 9.1: 注釈データの保存
 * - 9.2: 注釈データの取得
 * - 9.6: 注釈データのJSONエクスポート
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { apiClient, ApiError } from '../../api/client';
import {
  getAnnotation,
  saveAnnotation,
  exportAnnotationJson,
  updateThumbnail,
} from '../../api/survey-annotations';
import type {
  AnnotationInfo,
  AnnotationData,
  SaveAnnotationInput,
} from '../../types/site-survey.types';

// apiClientをモック
vi.mock('../../api/client', async () => {
  const actual = await vi.importActual<typeof import('../../api/client')>('../../api/client');
  return {
    ...actual,
    apiClient: {
      get: vi.fn(),
      put: vi.fn(),
      patch: vi.fn(),
    },
  };
});

describe('survey-annotations API client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ===========================================================================
  // getAnnotation テスト
  // ===========================================================================

  describe('getAnnotation', () => {
    const mockImageId = '123e4567-e89b-12d3-a456-426614174000';

    it('注釈データが存在する場合、注釈情報を返す', async () => {
      // Arrange
      const mockAnnotation: AnnotationInfo = {
        id: '456e7890-e89b-12d3-a456-426614174000',
        imageId: mockImageId,
        data: {
          version: '1.0',
          objects: [
            {
              type: 'rect',
              left: 100,
              top: 100,
              width: 200,
              height: 150,
            },
          ],
        },
        version: '1.0',
        createdAt: '2025-01-15T00:00:00.000Z',
        updatedAt: '2025-01-15T12:00:00.000Z',
      };

      vi.mocked(apiClient.get).mockResolvedValueOnce(mockAnnotation);

      // Act
      const result = await getAnnotation(mockImageId);

      // Assert
      expect(apiClient.get).toHaveBeenCalledWith(
        `/api/site-surveys/images/${mockImageId}/annotations`
      );
      expect(result).toEqual(mockAnnotation);
    });

    it('注釈データが存在しない場合、nullを返す', async () => {
      // Arrange
      vi.mocked(apiClient.get).mockResolvedValueOnce({ data: null });

      // Act
      const result = await getAnnotation(mockImageId);

      // Assert
      expect(apiClient.get).toHaveBeenCalledWith(
        `/api/site-surveys/images/${mockImageId}/annotations`
      );
      expect(result).toBeNull();
    });

    it('画像が見つからない場合、ApiErrorをスロー', async () => {
      // Arrange
      const error = new ApiError(404, '画像が見つかりません。', {
        type: 'https://architrack.example.com/problems/annotation-image-not-found',
        title: 'Image Not Found',
        status: 404,
        detail: '画像が見つかりません。',
        code: 'ANNOTATION_IMAGE_NOT_FOUND',
        imageId: mockImageId,
      });
      vi.mocked(apiClient.get).mockRejectedValue(error);

      // Act & Assert
      await expect(getAnnotation(mockImageId)).rejects.toThrow(ApiError);
      await expect(getAnnotation(mockImageId)).rejects.toMatchObject({
        statusCode: 404,
      });
    });

    it('認証エラーの場合、ApiErrorをスロー', async () => {
      // Arrange
      const error = new ApiError(401, '認証が必要です。');
      vi.mocked(apiClient.get).mockRejectedValue(error);

      // Act & Assert
      await expect(getAnnotation(mockImageId)).rejects.toThrow(ApiError);
      await expect(getAnnotation(mockImageId)).rejects.toMatchObject({
        statusCode: 401,
      });
    });

    it('権限不足の場合、ApiErrorをスロー', async () => {
      // Arrange
      const error = new ApiError(403, '権限がありません。');
      vi.mocked(apiClient.get).mockRejectedValue(error);

      // Act & Assert
      await expect(getAnnotation(mockImageId)).rejects.toThrow(ApiError);
      await expect(getAnnotation(mockImageId)).rejects.toMatchObject({
        statusCode: 403,
      });
    });
  });

  // ===========================================================================
  // saveAnnotation テスト
  // ===========================================================================

  describe('saveAnnotation', () => {
    const mockImageId = '123e4567-e89b-12d3-a456-426614174000';
    const mockAnnotationData: AnnotationData = {
      version: '1.0',
      objects: [
        {
          type: 'rect',
          left: 100,
          top: 100,
          width: 200,
          height: 150,
        },
      ],
    };

    it('楽観的排他制御なしで注釈を保存できる', async () => {
      // Arrange
      const mockResult: AnnotationInfo = {
        id: '456e7890-e89b-12d3-a456-426614174000',
        imageId: mockImageId,
        data: mockAnnotationData,
        version: '1.0',
        createdAt: '2025-01-15T00:00:00.000Z',
        updatedAt: '2025-01-15T12:00:00.000Z',
      };

      vi.mocked(apiClient.put).mockResolvedValueOnce(mockResult);

      // Act
      const input: SaveAnnotationInput = {
        data: mockAnnotationData,
      };
      const result = await saveAnnotation(mockImageId, input);

      // Assert
      expect(apiClient.put).toHaveBeenCalledWith(
        `/api/site-surveys/images/${mockImageId}/annotations`,
        { data: mockAnnotationData }
      );
      expect(result).toEqual(mockResult);
    });

    it('楽観的排他制御ありで注釈を保存できる', async () => {
      // Arrange
      const expectedUpdatedAt = '2025-01-15T10:00:00.000Z';
      const mockResult: AnnotationInfo = {
        id: '456e7890-e89b-12d3-a456-426614174000',
        imageId: mockImageId,
        data: mockAnnotationData,
        version: '1.0',
        createdAt: '2025-01-15T00:00:00.000Z',
        updatedAt: '2025-01-15T12:00:00.000Z',
      };

      vi.mocked(apiClient.put).mockResolvedValueOnce(mockResult);

      // Act
      const input: SaveAnnotationInput = {
        data: mockAnnotationData,
        expectedUpdatedAt,
      };
      const result = await saveAnnotation(mockImageId, input);

      // Assert
      expect(apiClient.put).toHaveBeenCalledWith(
        `/api/site-surveys/images/${mockImageId}/annotations`,
        { data: mockAnnotationData, expectedUpdatedAt }
      );
      expect(result).toEqual(mockResult);
    });

    it('画像が見つからない場合、ApiErrorをスロー', async () => {
      // Arrange
      const error = new ApiError(404, '画像が見つかりません。', {
        type: 'https://architrack.example.com/problems/annotation-image-not-found',
        title: 'Image Not Found',
        status: 404,
        detail: '画像が見つかりません。',
        code: 'ANNOTATION_IMAGE_NOT_FOUND',
        imageId: mockImageId,
      });
      vi.mocked(apiClient.put).mockRejectedValue(error);

      // Act & Assert
      const input: SaveAnnotationInput = { data: mockAnnotationData };
      await expect(saveAnnotation(mockImageId, input)).rejects.toThrow(ApiError);
      await expect(saveAnnotation(mockImageId, input)).rejects.toMatchObject({
        statusCode: 404,
      });
    });

    it('楽観的排他制御エラー（競合）の場合、ApiErrorをスロー', async () => {
      // Arrange
      const error = new ApiError(409, 'データが更新されています。再読み込みしてください。', {
        type: 'https://architrack.example.com/problems/annotation-conflict',
        title: 'Conflict',
        status: 409,
        detail: 'データが更新されています。再読み込みしてください。',
        code: 'ANNOTATION_CONFLICT',
        expectedUpdatedAt: '2025-01-15T10:00:00.000Z',
        actualUpdatedAt: '2025-01-15T11:00:00.000Z',
      });
      vi.mocked(apiClient.put).mockRejectedValue(error);

      // Act & Assert
      const input: SaveAnnotationInput = {
        data: mockAnnotationData,
        expectedUpdatedAt: '2025-01-15T10:00:00.000Z',
      };
      await expect(saveAnnotation(mockImageId, input)).rejects.toThrow(ApiError);
      await expect(saveAnnotation(mockImageId, input)).rejects.toMatchObject({
        statusCode: 409,
      });
    });

    it('無効な注釈データ形式の場合、ApiErrorをスロー', async () => {
      // Arrange
      const error = new ApiError(400, '無効な注釈データ形式です。', {
        type: 'https://architrack.example.com/problems/invalid-annotation-data',
        title: 'Invalid Annotation Data',
        status: 400,
        detail: '無効な注釈データ形式です。',
        code: 'INVALID_ANNOTATION_DATA',
      });
      vi.mocked(apiClient.put).mockRejectedValue(error);

      // Act & Assert
      const input: SaveAnnotationInput = { data: mockAnnotationData };
      await expect(saveAnnotation(mockImageId, input)).rejects.toThrow(ApiError);
      await expect(saveAnnotation(mockImageId, input)).rejects.toMatchObject({
        statusCode: 400,
      });
    });

    it('認証エラーの場合、ApiErrorをスロー', async () => {
      // Arrange
      const error = new ApiError(401, '認証が必要です。');
      vi.mocked(apiClient.put).mockRejectedValue(error);

      // Act & Assert
      const input: SaveAnnotationInput = { data: mockAnnotationData };
      await expect(saveAnnotation(mockImageId, input)).rejects.toThrow(ApiError);
      await expect(saveAnnotation(mockImageId, input)).rejects.toMatchObject({
        statusCode: 401,
      });
    });

    it('権限不足の場合、ApiErrorをスロー', async () => {
      // Arrange
      const error = new ApiError(403, '権限がありません。');
      vi.mocked(apiClient.put).mockRejectedValue(error);

      // Act & Assert
      const input: SaveAnnotationInput = { data: mockAnnotationData };
      await expect(saveAnnotation(mockImageId, input)).rejects.toThrow(ApiError);
      await expect(saveAnnotation(mockImageId, input)).rejects.toMatchObject({
        statusCode: 403,
      });
    });
  });

  // ===========================================================================
  // exportAnnotationJson テスト
  // ===========================================================================

  describe('exportAnnotationJson', () => {
    const mockImageId = '123e4567-e89b-12d3-a456-426614174000';

    it('注釈データをJSON文字列としてエクスポートできる', async () => {
      // Arrange
      const mockJsonString = JSON.stringify({
        version: '1.0',
        objects: [{ type: 'rect', left: 100, top: 100 }],
      });

      vi.mocked(apiClient.get).mockResolvedValueOnce(mockJsonString);

      // Act
      const result = await exportAnnotationJson(mockImageId);

      // Assert
      expect(apiClient.get).toHaveBeenCalledWith(
        `/api/site-surveys/images/${mockImageId}/annotations/export`
      );
      expect(result).toBe(mockJsonString);
    });

    it('画像が見つからない場合、ApiErrorをスロー', async () => {
      // Arrange
      const error = new ApiError(404, '画像が見つかりません。', {
        type: 'https://architrack.example.com/problems/annotation-image-not-found',
        title: 'Image Not Found',
        status: 404,
        detail: '画像が見つかりません。',
        code: 'ANNOTATION_IMAGE_NOT_FOUND',
        imageId: mockImageId,
      });
      vi.mocked(apiClient.get).mockRejectedValue(error);

      // Act & Assert
      await expect(exportAnnotationJson(mockImageId)).rejects.toThrow(ApiError);
      await expect(exportAnnotationJson(mockImageId)).rejects.toMatchObject({
        statusCode: 404,
      });
    });

    it('注釈データが見つからない場合、ApiErrorをスロー', async () => {
      // Arrange
      const error = new ApiError(404, '注釈データが見つかりません。', {
        type: 'https://architrack.example.com/problems/annotation-not-found',
        title: 'Annotation Not Found',
        status: 404,
        detail: '注釈データが見つかりません。',
        code: 'ANNOTATION_NOT_FOUND',
        imageId: mockImageId,
      });
      vi.mocked(apiClient.get).mockRejectedValue(error);

      // Act & Assert
      await expect(exportAnnotationJson(mockImageId)).rejects.toThrow(ApiError);
      await expect(exportAnnotationJson(mockImageId)).rejects.toMatchObject({
        statusCode: 404,
      });
    });

    it('認証エラーの場合、ApiErrorをスロー', async () => {
      // Arrange
      const error = new ApiError(401, '認証が必要です。');
      vi.mocked(apiClient.get).mockRejectedValue(error);

      // Act & Assert
      await expect(exportAnnotationJson(mockImageId)).rejects.toThrow(ApiError);
      await expect(exportAnnotationJson(mockImageId)).rejects.toMatchObject({
        statusCode: 401,
      });
    });

    it('権限不足の場合、ApiErrorをスロー', async () => {
      // Arrange
      const error = new ApiError(403, '権限がありません。');
      vi.mocked(apiClient.get).mockRejectedValue(error);

      // Act & Assert
      await expect(exportAnnotationJson(mockImageId)).rejects.toThrow(ApiError);
      await expect(exportAnnotationJson(mockImageId)).rejects.toMatchObject({
        statusCode: 403,
      });
    });
  });

  // ===========================================================================
  // updateThumbnail テスト
  // ===========================================================================

  describe('updateThumbnail', () => {
    const mockImageId = '123e4567-e89b-12d3-a456-426614174000';
    const mockImageData = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD...';

    it('サムネイルを正常に更新できる', async () => {
      // Arrange
      const mockResponse = {
        success: true,
        thumbnailPath: '/uploads/thumbnails/new-thumbnail.jpg',
      };

      vi.mocked(apiClient.patch).mockResolvedValueOnce(mockResponse);

      // Act
      const result = await updateThumbnail(mockImageId, mockImageData);

      // Assert
      expect(apiClient.patch).toHaveBeenCalledWith(
        `/api/site-surveys/images/${mockImageId}/thumbnail`,
        { imageData: mockImageData }
      );
      expect(result).toEqual(mockResponse);
    });

    it('画像が見つからない場合、ApiErrorをスロー', async () => {
      // Arrange
      const error = new ApiError(404, '画像が見つかりません。', {
        type: 'https://architrack.example.com/problems/image-not-found',
        title: 'Image Not Found',
        status: 404,
        detail: '画像が見つかりません。',
        code: 'IMAGE_NOT_FOUND',
        imageId: mockImageId,
      });
      vi.mocked(apiClient.patch).mockRejectedValue(error);

      // Act & Assert
      await expect(updateThumbnail(mockImageId, mockImageData)).rejects.toThrow(ApiError);
      await expect(updateThumbnail(mockImageId, mockImageData)).rejects.toMatchObject({
        statusCode: 404,
      });
    });

    it('バリデーションエラーの場合、ApiErrorをスロー', async () => {
      // Arrange
      const error = new ApiError(400, '無効な画像データ形式です。', {
        type: 'https://architrack.example.com/problems/invalid-image-data',
        title: 'Invalid Image Data',
        status: 400,
        detail: '無効な画像データ形式です。',
        code: 'INVALID_IMAGE_DATA',
      });
      vi.mocked(apiClient.patch).mockRejectedValue(error);

      // Act & Assert
      await expect(updateThumbnail(mockImageId, mockImageData)).rejects.toThrow(ApiError);
      await expect(updateThumbnail(mockImageId, mockImageData)).rejects.toMatchObject({
        statusCode: 400,
      });
    });

    it('認証エラーの場合、ApiErrorをスロー', async () => {
      // Arrange
      const error = new ApiError(401, '認証が必要です。');
      vi.mocked(apiClient.patch).mockRejectedValue(error);

      // Act & Assert
      await expect(updateThumbnail(mockImageId, mockImageData)).rejects.toThrow(ApiError);
      await expect(updateThumbnail(mockImageId, mockImageData)).rejects.toMatchObject({
        statusCode: 401,
      });
    });

    it('権限不足の場合、ApiErrorをスロー', async () => {
      // Arrange
      const error = new ApiError(403, '権限がありません。');
      vi.mocked(apiClient.patch).mockRejectedValue(error);

      // Act & Assert
      await expect(updateThumbnail(mockImageId, mockImageData)).rejects.toThrow(ApiError);
      await expect(updateThumbnail(mockImageId, mockImageData)).rejects.toMatchObject({
        statusCode: 403,
      });
    });
  });
});
