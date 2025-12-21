/**
 * @fileoverview 画像管理APIクライアントのテスト
 *
 * Task 7.2: 画像管理APIクライアントのテスト
 *
 * Requirements:
 * - 4.1: 画像アップロード（FormData対応）
 * - 4.2: バッチアップロード対応
 * - 4.7: 画像削除
 * - 4.10: 画像順序変更
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Mock } from 'vitest';
import {
  uploadSurveyImage,
  uploadSurveyImages,
  getSurveyImages,
  deleteSurveyImage,
  updateSurveyImageOrder,
  type BatchUploadProgress,
} from '../../api/survey-images';
import type { SurveyImageInfo } from '../../types/site-survey.types';
import { ApiError } from '../../api/client';

// モック用のレスポンスデータ
const mockImageInfo: SurveyImageInfo = {
  id: 'image-1',
  surveyId: 'survey-1',
  originalPath: '/images/original/image-1.jpg',
  thumbnailPath: '/images/thumbnails/image-1.jpg',
  fileName: 'photo.jpg',
  fileSize: 102400,
  width: 1920,
  height: 1080,
  displayOrder: 1,
  createdAt: '2025-01-15T10:00:00.000Z',
};

// fetchをモック
const mockFetch = vi.fn() as Mock;
globalThis.fetch = mockFetch;

describe('Survey Images API Client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // uploadSurveyImage Tests
  // ==========================================================================
  describe('uploadSurveyImage', () => {
    it('単一画像をアップロードできること', async () => {
      // Arrange
      const file = new File(['test content'], 'photo.jpg', { type: 'image/jpeg' });
      const surveyId = 'survey-1';

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => mockImageInfo,
      });

      // Act
      const result = await uploadSurveyImage(surveyId, file);

      // Assert
      expect(result).toEqual(mockImageInfo);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toContain(`/api/site-surveys/${surveyId}/images`);
      expect(options.method).toBe('POST');
      expect(options.body).toBeInstanceOf(FormData);

      const formData = options.body as FormData;
      expect(formData.get('images')).toBeInstanceOf(File);
    });

    it('表示順序を指定してアップロードできること', async () => {
      // Arrange
      const file = new File(['test content'], 'photo.jpg', { type: 'image/jpeg' });
      const surveyId = 'survey-1';
      const displayOrder = 3;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ ...mockImageInfo, displayOrder }),
      });

      // Act
      const result = await uploadSurveyImage(surveyId, file, { displayOrder });

      // Assert
      expect(result.displayOrder).toBe(displayOrder);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
      const formData = options.body as FormData;
      expect(formData.get('displayOrder')).toBe(String(displayOrder));
    });

    it('サポートされていない形式の場合、415エラーを返すこと', async () => {
      // Arrange
      const file = new File(['test content'], 'document.pdf', { type: 'application/pdf' });
      const surveyId = 'survey-1';

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 415,
        statusText: 'Unsupported Media Type',
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          type: 'about:blank',
          title: 'Unsupported Media Type',
          status: 415,
          detail: 'サポートされていないファイル形式です。JPEG、PNG、WEBP形式のみ対応しています。',
          code: 'UNSUPPORTED_FILE_TYPE',
          allowedTypes: ['image/jpeg', 'image/png', 'image/webp'],
        }),
      });

      // Act & Assert
      try {
        await uploadSurveyImage(surveyId, file);
        // エラーがスローされなかった場合はテスト失敗
        expect.fail('ApiError should have been thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).statusCode).toBe(415);
      }
    });

    it('現場調査が見つからない場合、404エラーを返すこと', async () => {
      // Arrange
      const file = new File(['test content'], 'photo.jpg', { type: 'image/jpeg' });
      const surveyId = 'non-existent';

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          type: 'about:blank',
          title: 'Not Found',
          status: 404,
          detail: '現場調査が見つかりません。',
          code: 'SITE_SURVEY_NOT_FOUND',
        }),
      });

      // Act & Assert
      await expect(uploadSurveyImage(surveyId, file)).rejects.toThrow(ApiError);
    });
  });

  // ==========================================================================
  // uploadSurveyImages (Batch Upload) Tests
  // ==========================================================================
  describe('uploadSurveyImages', () => {
    it('複数の画像をバッチアップロードできること', async () => {
      // Arrange
      const files = [
        new File(['content1'], 'photo1.jpg', { type: 'image/jpeg' }),
        new File(['content2'], 'photo2.jpg', { type: 'image/jpeg' }),
        new File(['content3'], 'photo3.jpg', { type: 'image/jpeg' }),
      ];
      const surveyId = 'survey-1';

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          status: 201,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ ...mockImageInfo, id: 'image-1', displayOrder: 1 }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 201,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ ...mockImageInfo, id: 'image-2', displayOrder: 2 }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 201,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ ...mockImageInfo, id: 'image-3', displayOrder: 3 }),
        });

      // Act
      const result = await uploadSurveyImages(surveyId, files);

      // Assert
      expect(result.length).toBe(3);
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('進捗コールバックが正しく呼び出されること', async () => {
      // Arrange
      const files = [
        new File(['content1'], 'photo1.jpg', { type: 'image/jpeg' }),
        new File(['content2'], 'photo2.jpg', { type: 'image/jpeg' }),
      ];
      const surveyId = 'survey-1';
      const progressCallback = vi.fn();

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          status: 201,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ ...mockImageInfo, id: 'image-1' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 201,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ ...mockImageInfo, id: 'image-2' }),
        });

      // Act
      await uploadSurveyImages(surveyId, files, { onProgress: progressCallback });

      // Assert
      expect(progressCallback).toHaveBeenCalled();

      // 進捗コールバックの呼び出しを検証
      const calls = progressCallback.mock.calls as [BatchUploadProgress][];
      expect(calls.length).toBeGreaterThan(0);

      // 最後の呼び出しでは completed === total であること
      const lastCallArray = calls[calls.length - 1];
      if (!lastCallArray) {
        throw new Error('Expected progress callback to be called at least once');
      }
      const lastCall = lastCallArray[0];
      expect(lastCall.completed).toBe(lastCall.total);
    });

    it('一部のアップロードが失敗しても他は継続すること', async () => {
      // Arrange
      const files = [
        new File(['content1'], 'photo1.jpg', { type: 'image/jpeg' }),
        new File(['content2'], 'bad.gif', { type: 'image/gif' }), // unsupported
        new File(['content3'], 'photo3.jpg', { type: 'image/jpeg' }),
      ];
      const surveyId = 'survey-1';

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          status: 201,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ ...mockImageInfo, id: 'image-1' }),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 415,
          statusText: 'Unsupported Media Type',
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({
            type: 'about:blank',
            title: 'Unsupported Media Type',
            status: 415,
            detail: 'サポートされていないファイル形式です。',
            code: 'UNSUPPORTED_FILE_TYPE',
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 201,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ ...mockImageInfo, id: 'image-3' }),
        });

      // Act
      const result = await uploadSurveyImages(surveyId, files);

      // Assert
      expect(result.length).toBe(2); // 成功した2件のみ
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('5件を超える場合、5件ずつキュー処理されること', async () => {
      // Arrange
      const files = Array.from(
        { length: 7 },
        (_, i) => new File([`content${i}`], `photo${i}.jpg`, { type: 'image/jpeg' })
      );
      const surveyId = 'survey-1';
      const progressCallback = vi.fn();

      // 7回のリクエストを設定
      for (let i = 0; i < 7; i++) {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          status: 201,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ ...mockImageInfo, id: `image-${i}`, displayOrder: i + 1 }),
        });
      }

      // Act
      const result = await uploadSurveyImages(surveyId, files, {
        onProgress: progressCallback,
        batchSize: 5,
      });

      // Assert
      expect(result.length).toBe(7);
      expect(mockFetch).toHaveBeenCalledTimes(7);
    });
  });

  // ==========================================================================
  // getSurveyImages Tests
  // ==========================================================================
  describe('getSurveyImages', () => {
    it('現場調査の画像一覧を取得できること', async () => {
      // Arrange
      const surveyId = 'survey-1';
      const mockImages: SurveyImageInfo[] = [
        { ...mockImageInfo, id: 'image-1', displayOrder: 1 },
        { ...mockImageInfo, id: 'image-2', displayOrder: 2 },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => mockImages,
      });

      // Act
      const result = await getSurveyImages(surveyId);

      // Assert
      expect(result).toEqual(mockImages);
      expect(result.length).toBe(2);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      const [url] = mockFetch.mock.calls[0] as [string];
      expect(url).toContain(`/api/site-surveys/${surveyId}/images`);
    });
  });

  // ==========================================================================
  // deleteSurveyImage Tests
  // ==========================================================================
  describe('deleteSurveyImage', () => {
    it('画像を削除できること', async () => {
      // Arrange
      const imageId = 'image-1';

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
        headers: new Headers(),
        text: async () => '',
      });

      // Act
      await deleteSurveyImage(imageId);

      // Assert
      expect(mockFetch).toHaveBeenCalledTimes(1);

      const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toContain(`/api/site-surveys/images/${imageId}`);
      expect(options.method).toBe('DELETE');
    });

    it('存在しない画像を削除しようとすると404エラーを返すこと', async () => {
      // Arrange
      const imageId = 'non-existent';

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          type: 'about:blank',
          title: 'Not Found',
          status: 404,
          detail: '画像が見つかりません。',
          code: 'IMAGE_NOT_FOUND',
        }),
      });

      // Act & Assert
      await expect(deleteSurveyImage(imageId)).rejects.toThrow(ApiError);
    });
  });

  // ==========================================================================
  // updateSurveyImageOrder Tests
  // ==========================================================================
  describe('updateSurveyImageOrder', () => {
    it('画像の表示順序を更新できること', async () => {
      // Arrange
      const surveyId = 'survey-1';
      const imageOrders = [
        { id: 'image-1', order: 2 },
        { id: 'image-2', order: 1 },
        { id: 'image-3', order: 3 },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
        headers: new Headers(),
        text: async () => '',
      });

      // Act
      await updateSurveyImageOrder(surveyId, imageOrders);

      // Assert
      expect(mockFetch).toHaveBeenCalledTimes(1);

      const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toContain(`/api/site-surveys/${surveyId}/images/order`);
      expect(options.method).toBe('PUT');

      const body = JSON.parse(options.body as string) as { imageOrders: typeof imageOrders };
      expect(body.imageOrders).toEqual(imageOrders);
    });

    it('現場調査が見つからない場合、404エラーを返すこと', async () => {
      // Arrange
      const surveyId = 'non-existent';
      const imageOrders = [{ id: 'image-1', order: 1 }];

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          type: 'about:blank',
          title: 'Not Found',
          status: 404,
          detail: '現場調査が見つかりません。',
          code: 'SITE_SURVEY_NOT_FOUND',
        }),
      });

      // Act & Assert
      await expect(updateSurveyImageOrder(surveyId, imageOrders)).rejects.toThrow(ApiError);
    });
  });
});
