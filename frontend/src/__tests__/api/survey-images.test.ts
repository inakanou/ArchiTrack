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
import { ApiError, apiClient } from '../../api/client';
import { classifyUploadFailure } from '../../utils/upload-failure';

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
  // multipart 送信のエッジケース（共通クライアント経由）
  // ==========================================================================
  describe('multipart送信のエッジケース', () => {
    it('非JSONレスポンスでもテキストとして処理できること', async () => {
      // Arrange
      const file = new File(['test content'], 'photo.jpg', { type: 'image/jpeg' });
      const surveyId = 'survey-1';

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'text/plain' }),
        text: async () => 'Success',
      });

      // Act - 非JSONレスポンスでも動作確認
      const result = await uploadSurveyImage(surveyId, file);

      // Assert
      expect(result).toBe('Success');
    });

    it('エラーレスポンスでerrorフィールドを使用すること', async () => {
      // Arrange
      const file = new File(['test content'], 'photo.jpg', { type: 'image/jpeg' });
      const surveyId = 'survey-1';

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          error: 'カスタムエラーメッセージ',
        }),
      });

      // Act & Assert
      try {
        await uploadSurveyImage(surveyId, file);
        expect.fail('ApiError should have been thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).message).toBe('カスタムエラーメッセージ');
      }
    });

    it('エラーレスポンスでstatusTextをフォールバックとして使用すること', async () => {
      // Arrange
      const file = new File(['test content'], 'photo.jpg', { type: 'image/jpeg' });
      const surveyId = 'survey-1';

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({}), // detailもerrorもない
      });

      // Act & Assert
      try {
        await uploadSurveyImage(surveyId, file);
        expect.fail('ApiError should have been thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).message).toBe('Internal Server Error');
      }
    });

    it('認証トークンがない場合もリクエストが送信されること', async () => {
      // Arrange
      const file = new File(['test content'], 'photo.jpg', { type: 'image/jpeg' });
      const surveyId = 'survey-1';

      // アクセストークン未設定の状態にする
      apiClient.setAccessToken(null);

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
      const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(options.headers).toBeDefined();
      // Authorizationヘッダーがないことを確認
      expect((options.headers as Record<string, string>)['Authorization']).toBeUndefined();
    });

    it('アクセストークンがある場合はAuthorizationヘッダーが付与されること', async () => {
      // Arrange
      const file = new File(['test content'], 'photo.jpg', { type: 'image/jpeg' });
      apiClient.setAccessToken('test-access-token');

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => mockImageInfo,
      });

      try {
        // Act
        await uploadSurveyImage('survey-1', file);

        // Assert
        const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
        expect((options.headers as Record<string, string>)['Authorization']).toBe(
          'Bearer test-access-token'
        );
        // multipart では boundary をブラウザに委ねるため Content-Type を設定しない
        expect((options.headers as Record<string, string>)['Content-Type']).toBeUndefined();
      } finally {
        apiClient.setAccessToken(null);
      }
    });
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
      expect(result.results.length).toBe(3);
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
      expect(result.results.length).toBe(2); // 成功した2件のみ
      expect(result.errors.length).toBe(1); // エラー1件
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
      expect(result.results.length).toBe(7);
      expect(mockFetch).toHaveBeenCalledTimes(7);
    });

    it('startDisplayOrderを指定して表示順序をカスタマイズできること', async () => {
      // Arrange
      const files = [
        new File(['content1'], 'photo1.jpg', { type: 'image/jpeg' }),
        new File(['content2'], 'photo2.jpg', { type: 'image/jpeg' }),
      ];
      const surveyId = 'survey-1';
      const startDisplayOrder = 10;

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          status: 201,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ ...mockImageInfo, id: 'image-1', displayOrder: 10 }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 201,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ ...mockImageInfo, id: 'image-2', displayOrder: 11 }),
        });

      // Act
      const result = await uploadSurveyImages(surveyId, files, { startDisplayOrder });

      // Assert
      expect(result.results.length).toBe(2);
      expect(mockFetch).toHaveBeenCalledTimes(2);

      // FormDataに正しいdisplayOrderが設定されていることを確認
      const [, firstOptions] = mockFetch.mock.calls[0] as [string, RequestInit];
      const firstFormData = firstOptions.body as FormData;
      expect(firstFormData.get('displayOrder')).toBe('10');

      const [, secondOptions] = mockFetch.mock.calls[1] as [string, RequestInit];
      const secondFormData = secondOptions.body as FormData;
      expect(secondFormData.get('displayOrder')).toBe('11');
    });

    // Task 107.1: 送信を共通クライアントへ委譲したことで、fetch が投げた素の例外は
    // ApiError(0, 'Network error') へ正規化される。呼び出し元にはサーバー由来の失敗と
    // 同じ形で失敗理由が渡ること（`ApiError` 以外が渡った場合の汎用文言へのフォールバックは
    // Task 107.1 のテスト群で検証する）
    it('通信エラーがApiErrorへ正規化され失敗理由が記録されること', async () => {
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
        .mockRejectedValueOnce(new Error('Network error')); // 非ApiError

      // Act
      const result = await uploadSurveyImages(surveyId, files, { onProgress: progressCallback });

      // Assert
      expect(result.results.length).toBe(1); // 1件のみ成功
      expect(result.errors.length).toBe(1); // エラー1件

      // 進捗コールバックでエラー情報が記録されていることを確認
      const lastCall = progressCallback.mock.calls[progressCallback.mock.calls.length - 1] as [
        BatchUploadProgress,
      ];
      expect(lastCall[0].errors.length).toBe(1);
      expect(lastCall[0].errors[0]?.error).toBe('Network error');
      expect(lastCall[0].errors[0]?.file).toBe(files[1]);
    });

    it('onProgressが未定義でもエラーなく動作すること', async () => {
      // Arrange
      const files = [new File(['content1'], 'photo1.jpg', { type: 'image/jpeg' })];
      const surveyId = 'survey-1';

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => mockImageInfo,
      });

      // Act - onProgressなしで呼び出し
      const result = await uploadSurveyImages(surveyId, files);

      // Assert
      expect(result.results.length).toBe(1);
    });
  });

  // ==========================================================================
  // Task 48.1: uploadSurveyImagesの戻り値がBatchUploadResultであることを検証
  // Requirements: 19.10, 19.12, 19.16
  // ==========================================================================
  describe('uploadSurveyImages returns BatchUploadResult (Task 48.1)', () => {
    it('全件成功時にresultsとerrorsの両方を含むBatchUploadResultを返すこと', async () => {
      // Arrange
      const files = [
        new File(['content1'], 'photo1.jpg', { type: 'image/jpeg' }),
        new File(['content2'], 'photo2.jpg', { type: 'image/jpeg' }),
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
          ok: true,
          status: 201,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ ...mockImageInfo, id: 'image-2' }),
        });

      // Act
      const result = await uploadSurveyImages(surveyId, files);

      // Assert - BatchUploadResult型であること
      expect(result).toHaveProperty('results');
      expect(result).toHaveProperty('errors');
      expect(result.results).toHaveLength(2);
      expect(result.errors).toHaveLength(0);
    });

    it('部分失敗時にresultsとerrorsの両方が返却されること - Requirement 19.12', async () => {
      // Arrange
      const files = [
        new File(['content1'], 'photo1.jpg', { type: 'image/jpeg' }),
        new File(['content2'], 'bad.gif', { type: 'image/gif' }),
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

      // Assert - 成功分とエラー分の両方が含まれること
      expect(result.results).toHaveLength(2);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]?.fileName).toBe('bad.gif');
      expect(result.errors[0]?.error).toContain('サポートされていないファイル形式です');
    });

    it('全件失敗時にresultsが空でerrorsが全件分であること', async () => {
      // Arrange
      const files = [
        new File(['content1'], 'bad1.gif', { type: 'image/gif' }),
        new File(['content2'], 'bad2.gif', { type: 'image/gif' }),
      ];
      const surveyId = 'survey-1';

      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 415,
          statusText: 'Unsupported Media Type',
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({
            detail: 'サポートされていないファイル形式です。',
          }),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          statusText: 'Internal Server Error',
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({
            detail: 'サーバーエラーが発生しました。',
          }),
        });

      // Act
      const result = await uploadSurveyImages(surveyId, files);

      // Assert
      expect(result.results).toHaveLength(0);
      expect(result.errors).toHaveLength(2);
    });
  });

  // ==========================================================================
  // Task 107.1: 共通クライアントへの委譲と部分失敗（207）の是正
  // Requirements: 37.1, 37.16, 37.21
  // ==========================================================================
  describe('共通クライアント委譲と部分失敗の扱い (Task 107.1)', () => {
    /** 207（部分失敗）レスポンスのモックを組み立てる */
    const mockPartialFailure = (fileName: string, error: string) => ({
      ok: true,
      status: 207,
      statusText: 'Multi-Status',
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({
        successful: [],
        failed: [{ fileName, error }],
      }),
    });

    it('multipart送信が共通クライアントのsendFormDataへ委譲されること - Requirement 37.1', async () => {
      // Arrange
      const file = new File(['test content'], 'photo.jpg', { type: 'image/jpeg' });
      const sendFormDataSpy = vi.spyOn(apiClient, 'sendFormData');

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => mockImageInfo,
      });

      // Act
      await uploadSurveyImage('survey-1', file, { displayOrder: 2 });

      // Assert
      expect(sendFormDataSpy).toHaveBeenCalledTimes(1);
      const call = sendFormDataSpy.mock.calls[0];
      if (!call) {
        throw new Error('Expected sendFormData to be called');
      }
      const [path, formData] = call;
      expect(path).toBe('/api/site-surveys/survey-1/images');
      expect(formData).toBeInstanceOf(FormData);
      expect(formData.get('images')).toBeInstanceOf(File);
      expect(formData.get('displayOrder')).toBe('2');
    });

    it('ストレージ障害による部分失敗が207として返り再送可能に分類されること - Requirement 37.21', async () => {
      // Arrange
      const file = new File(['test content'], 'photo.jpg', { type: 'image/jpeg' });

      mockFetch.mockResolvedValueOnce(
        mockPartialFailure('photo.jpg', '画像の保存に失敗しました: ストレージへの書き込みエラー')
      );

      // Act & Assert
      try {
        await uploadSurveyImage('survey-1', file);
        expect.fail('ApiError should have been thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).statusCode).toBe(207);
        expect((error as ApiError).message).toBe(
          '画像の保存に失敗しました: ストレージへの書き込みエラー'
        );
        // 一時的な障害のため再送で解消しうる
        expect(classifyUploadFailure(error)).toBe('retriable');
      }
    });

    it('枚数上限による部分失敗も再送可能に分類されること - Requirement 37.21', async () => {
      // Arrange
      const file = new File(['test content'], 'photo.jpg', { type: 'image/jpeg' });

      mockFetch.mockResolvedValueOnce(
        mockPartialFailure('photo.jpg', '画像数の上限（10枚）に達しました')
      );

      // Act & Assert
      try {
        await uploadSurveyImage('survey-1', file);
        expect.fail('ApiError should have been thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).statusCode).toBe(207);
        expect(classifyUploadFailure(error)).toBe('retriable');
      }
    });

    it('画像形式の非対応による部分失敗は再送不可に分類されること - Requirement 37.16', async () => {
      // Arrange
      const file = new File(['test content'], 'document.pdf', { type: 'application/pdf' });

      mockFetch.mockResolvedValueOnce(
        mockPartialFailure(
          'document.pdf',
          'サポートされていない画像形式です。JPEG、PNG、WEBP形式のみ対応しています。'
        )
      );

      // Act & Assert
      try {
        await uploadSurveyImage('survey-1', file);
        expect.fail('ApiError should have been thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).statusCode).toBe(207);
        // 受入条件違反は再送しても解消しない
        expect(classifyUploadFailure(error)).toBe('permanent');
      }
    });

    it('バッチアップロードの失敗情報に対象画像の実体が含まれること - Requirement 37.1', async () => {
      // Arrange
      const files = [
        new File(['content1'], 'photo1.jpg', { type: 'image/jpeg' }),
        new File(['content2'], 'photo2.jpg', { type: 'image/jpeg' }),
      ];

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          status: 201,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ ...mockImageInfo, id: 'image-1' }),
        })
        .mockResolvedValueOnce(
          mockPartialFailure('photo2.jpg', '画像の保存に失敗しました: ストレージへの書き込みエラー')
        );

      // Act
      const result = await uploadSurveyImages('survey-1', files);

      // Assert
      expect(result.results).toHaveLength(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]?.index).toBe(1);
      expect(result.errors[0]?.fileName).toBe('photo2.jpg');
      // 再送に用いるため File 実体そのものが返ること（再圧縮しない）
      expect(result.errors[0]?.file).toBe(files[1]);
    });

    it('共通クライアントがApiError以外を投げた場合も汎用文言と画像実体を記録すること', async () => {
      // Arrange
      const files = [new File(['content1'], 'photo1.jpg', { type: 'image/jpeg' })];
      vi.spyOn(apiClient, 'sendFormData').mockRejectedValue(new TypeError('unexpected failure'));

      // Act
      const result = await uploadSurveyImages('survey-1', files);

      // Assert
      expect(result.results).toHaveLength(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]?.error).toBe('アップロードに失敗しました。');
      expect(result.errors[0]?.file).toBe(files[0]);
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

      const body = JSON.parse(options.body as string) as { orders: typeof imageOrders };
      expect(body.orders).toEqual(imageOrders);
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

  // ==========================================================================
  // updateImageMetadata Tests (Task 27.3)
  // ==========================================================================
  describe('updateImageMetadata', () => {
    it('コメントを更新できること', async () => {
      // Arrange
      const imageId = 'image-1';
      const updateData = { comment: 'テストコメント' };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          id: imageId,
          surveyId: 'survey-1',
          fileName: 'photo.jpg',
          comment: 'テストコメント',
          includeInReport: false,
          displayOrder: 1,
        }),
      });

      // 動的インポートを使用して updateImageMetadata を取得
      const { updateImageMetadata } = await import('../../api/survey-images');

      // Act
      const result = await updateImageMetadata(imageId, updateData);

      // Assert
      expect(result.comment).toBe('テストコメント');
      expect(mockFetch).toHaveBeenCalledTimes(1);

      const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toContain(`/api/site-surveys/images/${imageId}`);
      expect(options.method).toBe('PATCH');

      const body = JSON.parse(options.body as string) as typeof updateData;
      expect(body.comment).toBe('テストコメント');
    });

    it('報告書出力フラグを更新できること', async () => {
      // Arrange
      const imageId = 'image-1';
      const updateData = { includeInReport: true };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          id: imageId,
          surveyId: 'survey-1',
          fileName: 'photo.jpg',
          comment: null,
          includeInReport: true,
          displayOrder: 1,
        }),
      });

      const { updateImageMetadata } = await import('../../api/survey-images');

      // Act
      const result = await updateImageMetadata(imageId, updateData);

      // Assert
      expect(result.includeInReport).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(options.body as string) as typeof updateData;
      expect(body.includeInReport).toBe(true);
    });

    it('コメントと報告書出力フラグを同時に更新できること', async () => {
      // Arrange
      const imageId = 'image-1';
      const updateData = { comment: '新しいコメント', includeInReport: true };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          id: imageId,
          surveyId: 'survey-1',
          fileName: 'photo.jpg',
          comment: '新しいコメント',
          includeInReport: true,
          displayOrder: 1,
        }),
      });

      const { updateImageMetadata } = await import('../../api/survey-images');

      // Act
      const result = await updateImageMetadata(imageId, updateData);

      // Assert
      expect(result.comment).toBe('新しいコメント');
      expect(result.includeInReport).toBe(true);
    });

    it('コメントをnullでクリアできること', async () => {
      // Arrange
      const imageId = 'image-1';
      const updateData = { comment: null };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          id: imageId,
          surveyId: 'survey-1',
          fileName: 'photo.jpg',
          comment: null,
          includeInReport: false,
          displayOrder: 1,
        }),
      });

      const { updateImageMetadata } = await import('../../api/survey-images');

      // Act
      const result = await updateImageMetadata(imageId, updateData);

      // Assert
      expect(result.comment).toBeNull();
    });

    it('存在しない画像を更新しようとすると404エラーを返すこと', async () => {
      // Arrange
      const imageId = 'non-existent';
      const updateData = { comment: 'テスト' };

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          type: 'https://architrack.example.com/problems/image-not-found',
          title: 'Image Not Found',
          status: 404,
          detail: '画像が見つかりません。',
          code: 'IMAGE_NOT_FOUND',
          imageId: imageId,
        }),
      });

      const { updateImageMetadata } = await import('../../api/survey-images');

      // Act & Assert
      await expect(updateImageMetadata(imageId, updateData)).rejects.toThrow(ApiError);
    });

    it('コメントが2000文字を超える場合、400エラーを返すこと', async () => {
      // Arrange
      const imageId = 'image-1';
      const longComment = 'あ'.repeat(2001);
      const updateData = { comment: longComment };

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          type: 'https://architrack.example.com/problems/validation-error',
          title: 'Validation Error',
          status: 400,
          detail: 'コメントは2000文字以内で入力してください。',
          code: 'COMMENT_TOO_LONG',
          length: 2001,
          maxLength: 2000,
        }),
      });

      const { updateImageMetadata } = await import('../../api/survey-images');

      // Act & Assert
      await expect(updateImageMetadata(imageId, updateData)).rejects.toThrow(ApiError);
    });
  });
});
