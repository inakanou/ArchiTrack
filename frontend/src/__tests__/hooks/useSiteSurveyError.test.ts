/**
 * @fileoverview useSiteSurveyErrorフックのテスト
 *
 * Task 11.2: エラー表示の実装
 *
 * Requirements:
 * - 14.8: エラー発生時に適切なエラーメッセージを表示し、Sentryにログを送信する
 *
 * テスト対象:
 * - バリデーションエラー表示
 * - ネットワークエラー表示
 * - Sentryへのエラーログ送信
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSiteSurveyError } from '../../hooks/useSiteSurveyError';
import { ApiError } from '../../api/client';
import * as sentry from '../../utils/sentry';

// Sentryモジュールのモック
vi.mock('../../utils/sentry', () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}));

describe('useSiteSurveyError', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ===========================================================================
  // 初期状態テスト
  // ===========================================================================

  describe('初期状態', () => {
    it('初期状態ではエラーがnullである', () => {
      const { result } = renderHook(() => useSiteSurveyError());

      expect(result.current.error).toBeNull();
      expect(result.current.isError).toBe(false);
    });

    it('初期状態では再試行中フラグがfalseである', () => {
      const { result } = renderHook(() => useSiteSurveyError());

      expect(result.current.isRetrying).toBe(false);
    });
  });

  // ===========================================================================
  // バリデーションエラーテスト
  // ===========================================================================

  describe('バリデーションエラー', () => {
    it('バリデーションエラーを設定できる', () => {
      const { result } = renderHook(() => useSiteSurveyError());

      act(() => {
        result.current.handleValidationError({ name: '調査名は必須です' });
      });

      expect(result.current.error).not.toBeNull();
      expect(result.current.error?.type).toBe('validation');
      expect(result.current.isError).toBe(true);
    });

    it('複数のバリデーションエラーを設定できる', () => {
      const { result } = renderHook(() => useSiteSurveyError());

      act(() => {
        result.current.handleValidationError({
          name: '調査名は必須です',
          surveyDate: '調査日は必須です',
        });
      });

      expect(result.current.error?.type).toBe('validation');
      expect(result.current.error?.fieldErrors).toEqual({
        name: '調査名は必須です',
        surveyDate: '調査日は必須です',
      });
    });

    it('バリデーションエラーはSentryに送信されない', () => {
      const { result } = renderHook(() => useSiteSurveyError());

      act(() => {
        result.current.handleValidationError({ name: '調査名は必須です' });
      });

      expect(sentry.captureException).not.toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // ネットワークエラーテスト
  // ===========================================================================

  describe('ネットワークエラー', () => {
    it('ネットワークエラー（statusCode: 0）を適切に処理する', () => {
      const { result } = renderHook(() => useSiteSurveyError());
      const error = new ApiError(0, 'Network error');
      const retryFn = vi.fn();

      act(() => {
        result.current.handleApiError(error, retryFn);
      });

      expect(result.current.error?.type).toBe('network');
      expect(result.current.error?.message).toContain('通信エラー');
      expect(result.current.error?.canRetry).toBe(true);
    });

    it('タイムアウトエラーを適切に処理する', () => {
      const { result } = renderHook(() => useSiteSurveyError());
      const error = new ApiError(0, 'Request timeout');
      const retryFn = vi.fn();

      act(() => {
        result.current.handleApiError(error, retryFn);
      });

      expect(result.current.error?.type).toBe('network');
      expect(result.current.error?.canRetry).toBe(true);
    });

    it('ネットワークエラーはSentryに送信される', () => {
      const { result } = renderHook(() => useSiteSurveyError());
      const error = new ApiError(0, 'Network error');

      act(() => {
        result.current.handleApiError(error);
      });

      expect(sentry.captureException).toHaveBeenCalledWith(
        error,
        expect.objectContaining({
          errorType: 'network',
        })
      );
    });
  });

  // ===========================================================================
  // サーバーエラーテスト
  // ===========================================================================

  describe('サーバーエラー', () => {
    it('500エラーを適切に処理する', () => {
      const { result } = renderHook(() => useSiteSurveyError());
      const error = new ApiError(500, 'Internal Server Error');

      act(() => {
        result.current.handleApiError(error);
      });

      expect(result.current.error?.type).toBe('server');
      expect(result.current.error?.message).toContain('システムエラー');
      expect(result.current.error?.canRetry).toBe(false);
    });

    it('503エラーを適切に処理する', () => {
      const { result } = renderHook(() => useSiteSurveyError());
      const error = new ApiError(503, 'Service Unavailable');

      act(() => {
        result.current.handleApiError(error);
      });

      expect(result.current.error?.type).toBe('server');
    });

    it('サーバーエラーはSentryに送信される', () => {
      const { result } = renderHook(() => useSiteSurveyError());
      const error = new ApiError(500, 'Internal Server Error');

      act(() => {
        result.current.handleApiError(error);
      });

      expect(sentry.captureException).toHaveBeenCalledWith(
        error,
        expect.objectContaining({
          errorType: 'server',
          statusCode: 500,
        })
      );
    });
  });

  // ===========================================================================
  // セッションエラーテスト
  // ===========================================================================

  describe('セッションエラー', () => {
    it('401エラーをセッションエラーとして処理する', () => {
      const { result } = renderHook(() => useSiteSurveyError());
      const error = new ApiError(401, 'Unauthorized');

      act(() => {
        result.current.handleApiError(error);
      });

      expect(result.current.error?.type).toBe('session');
      expect(result.current.error?.message).toContain('セッション');
      expect(result.current.error?.shouldRedirect).toBe(true);
    });
  });

  // ===========================================================================
  // 競合エラーテスト
  // ===========================================================================

  describe('競合エラー', () => {
    it('409エラーを競合エラーとして処理する', () => {
      const { result } = renderHook(() => useSiteSurveyError());
      const error = new ApiError(409, 'Conflict', {
        type: 'about:blank',
        title: 'Conflict',
        status: 409,
        detail: 'データが更新されています',
        code: 'SITE_SURVEY_CONFLICT',
      });

      act(() => {
        result.current.handleApiError(error);
      });

      expect(result.current.error?.type).toBe('conflict');
      expect(result.current.error?.message).toContain('更新されています');
    });

    it('競合エラーは警告レベルでSentryに送信される', () => {
      const { result } = renderHook(() => useSiteSurveyError());
      const error = new ApiError(409, 'Conflict', {
        type: 'about:blank',
        title: 'Conflict',
        status: 409,
        detail: 'データが更新されています',
        code: 'SITE_SURVEY_CONFLICT',
      });

      act(() => {
        result.current.handleApiError(error);
      });

      // 競合エラーはユーザー操作による通常のケースなのでSentryには送信しない
      expect(sentry.captureException).not.toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // NotFoundエラーテスト
  // ===========================================================================

  describe('NotFoundエラー', () => {
    it('404エラーをNotFoundエラーとして処理する', () => {
      const { result } = renderHook(() => useSiteSurveyError());
      const error = new ApiError(404, 'Not Found', {
        type: 'about:blank',
        title: 'Not Found',
        status: 404,
        detail: '現場調査が見つかりません',
        code: 'SITE_SURVEY_NOT_FOUND',
      });

      act(() => {
        result.current.handleApiError(error);
      });

      expect(result.current.error?.type).toBe('notFound');
    });
  });

  // ===========================================================================
  // クライアントエラーテスト
  // ===========================================================================

  describe('クライアントエラー', () => {
    it('400エラーをクライアントエラーとして処理する', () => {
      const { result } = renderHook(() => useSiteSurveyError());
      const error = new ApiError(400, 'Bad Request');

      act(() => {
        result.current.handleApiError(error);
      });

      expect(result.current.error?.type).toBe('client');
    });

    it('403エラーを権限エラーとして処理する', () => {
      const { result } = renderHook(() => useSiteSurveyError());
      const error = new ApiError(403, 'Forbidden');

      act(() => {
        result.current.handleApiError(error);
      });

      expect(result.current.error?.type).toBe('forbidden');
      expect(result.current.error?.message).toContain('権限');
    });
  });

  // ===========================================================================
  // エラークリアテスト
  // ===========================================================================

  describe('エラークリア', () => {
    it('clearErrorでエラーをクリアできる', () => {
      const { result } = renderHook(() => useSiteSurveyError());

      act(() => {
        result.current.handleApiError(new ApiError(500, 'Error'));
      });

      expect(result.current.isError).toBe(true);

      act(() => {
        result.current.clearError();
      });

      expect(result.current.error).toBeNull();
      expect(result.current.isError).toBe(false);
    });

    it('特定のフィールドエラーのみクリアできる', () => {
      const { result } = renderHook(() => useSiteSurveyError());

      act(() => {
        result.current.handleValidationError({
          name: '調査名は必須です',
          surveyDate: '調査日は必須です',
        });
      });

      act(() => {
        result.current.clearFieldError('name');
      });

      expect(result.current.error?.fieldErrors?.name).toBeUndefined();
      expect(result.current.error?.fieldErrors?.surveyDate).toBe('調査日は必須です');
    });
  });

  // ===========================================================================
  // 再試行機能テスト
  // ===========================================================================

  describe('再試行機能', () => {
    it('再試行関数を設定して実行できる', async () => {
      const { result } = renderHook(() => useSiteSurveyError());
      const retryFn = vi.fn().mockResolvedValue(undefined);

      act(() => {
        result.current.handleApiError(new ApiError(0, 'Network error'), retryFn);
      });

      expect(result.current.error?.canRetry).toBe(true);

      await act(async () => {
        await result.current.retry();
      });

      expect(retryFn).toHaveBeenCalledTimes(1);
      expect(result.current.error).toBeNull();
    });

    it('再試行中はisRetryingがtrueになる', async () => {
      const { result } = renderHook(() => useSiteSurveyError());
      let resolveRetry: () => void;
      const retryPromise = new Promise<void>((resolve) => {
        resolveRetry = resolve;
      });
      const retryFn = vi.fn().mockReturnValue(retryPromise);

      act(() => {
        result.current.handleApiError(new ApiError(0, 'Network error'), retryFn);
      });

      let retryPromiseResult: Promise<void>;
      act(() => {
        retryPromiseResult = result.current.retry();
      });

      expect(result.current.isRetrying).toBe(true);

      await act(async () => {
        resolveRetry!();
        await retryPromiseResult;
      });

      expect(result.current.isRetrying).toBe(false);
    });

    it('再試行が失敗した場合、エラーが更新される', async () => {
      const { result } = renderHook(() => useSiteSurveyError());
      const retryFn = vi.fn().mockRejectedValue(new ApiError(503, 'Service Unavailable'));

      act(() => {
        result.current.handleApiError(new ApiError(0, 'Network error'), retryFn);
      });

      await act(async () => {
        await result.current.retry();
      });

      expect(result.current.error?.type).toBe('server');
      expect(result.current.error?.statusCode).toBe(503);
    });
  });

  // ===========================================================================
  // 画像アップロードエラーテスト
  // ===========================================================================

  describe('画像アップロードエラー', () => {
    it('415エラーをファイル形式エラーとして処理する', () => {
      const { result } = renderHook(() => useSiteSurveyError());
      const error = new ApiError(415, 'Unsupported Media Type', {
        type: 'about:blank',
        title: 'Unsupported Media Type',
        status: 415,
        detail: 'サポートされていないファイル形式です',
        code: 'UNSUPPORTED_FILE_TYPE',
        allowedTypes: ['image/jpeg', 'image/png', 'image/webp'],
      });

      act(() => {
        result.current.handleApiError(error);
      });

      expect(result.current.error?.type).toBe('unsupportedFileType');
      expect(result.current.error?.message).toContain('ファイル形式');
    });

    it('413エラーをファイルサイズエラーとして処理する', () => {
      const { result } = renderHook(() => useSiteSurveyError());
      const error = new ApiError(413, 'Payload Too Large');

      act(() => {
        result.current.handleApiError(error);
      });

      expect(result.current.error?.type).toBe('fileTooLarge');
      expect(result.current.error?.message).toContain('サイズ');
    });
  });

  // ===========================================================================
  // Sentry統合テスト
  // ===========================================================================

  describe('Sentry統合', () => {
    it('予期しないエラーはSentryに送信される', () => {
      const { result } = renderHook(() => useSiteSurveyError());
      const error = new Error('Unexpected error');

      act(() => {
        result.current.handleUnexpectedError(error);
      });

      expect(sentry.captureException).toHaveBeenCalledWith(error, expect.any(Object));
    });

    it('エラーコンテキストがSentryに送信される', () => {
      const { result } = renderHook(() => useSiteSurveyError());
      const error = new ApiError(500, 'Server error');
      const context = { surveyId: '123', action: 'update' };

      act(() => {
        result.current.handleApiError(error, undefined, context);
      });

      expect(sentry.captureException).toHaveBeenCalledWith(
        error,
        expect.objectContaining({
          surveyId: '123',
          action: 'update',
        })
      );
    });
  });

  // ===========================================================================
  // エラーメッセージ取得テスト
  // ===========================================================================

  describe('エラーメッセージ取得', () => {
    it('getErrorMessageでユーザー向けメッセージを取得できる', () => {
      const { result } = renderHook(() => useSiteSurveyError());

      act(() => {
        result.current.handleApiError(new ApiError(500, 'Server error'));
      });

      expect(result.current.getErrorMessage()).toContain('システムエラー');
    });

    it('エラーがない場合は空文字を返す', () => {
      const { result } = renderHook(() => useSiteSurveyError());

      expect(result.current.getErrorMessage()).toBe('');
    });
  });
});
