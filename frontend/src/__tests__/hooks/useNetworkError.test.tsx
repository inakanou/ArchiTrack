/**
 * @fileoverview useNetworkError フックのテスト
 *
 * Task 13.2: ネットワークエラー対応
 *
 * Requirements:
 * - 18.1: ネットワークエラー時のエラーメッセージ表示を実装
 * - 18.2: 再試行ボタンの表示と機能を実装
 * - 18.3: サーバーエラー（5xx）時のメッセージ表示を実装
 * - 18.6: セッション期限切れ時のリダイレクトを実装
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useNetworkError, ErrorType } from '../../hooks/useNetworkError';
import { ApiError } from '../../api/client';

describe('useNetworkError', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('初期状態', () => {
    it('初期状態ではエラーがないこと', () => {
      const { result } = renderHook(() => useNetworkError());

      expect(result.current.error).toBeNull();
      expect(result.current.isError).toBe(false);
      expect(result.current.isRetrying).toBe(false);
    });
  });

  describe('handleError - ネットワークエラー', () => {
    it('ネットワークエラー（statusCode: 0）を正しく処理すること', () => {
      const { result } = renderHook(() => useNetworkError());
      const networkError = new ApiError(0, 'Network error');
      const mockRetryFn = vi.fn().mockResolvedValue(undefined);

      act(() => {
        result.current.handleError(networkError, mockRetryFn);
      });

      expect(result.current.error).not.toBeNull();
      expect(result.current.error?.type).toBe('network');
      expect(result.current.error?.message).toBe('通信エラーが発生しました。再試行してください。');
      expect(result.current.error?.canRetry).toBe(true);
      expect(result.current.isError).toBe(true);
    });

    it('タイムアウトエラーを正しく処理すること', () => {
      const { result } = renderHook(() => useNetworkError());
      const timeoutError = new ApiError(0, 'Request timeout');
      const mockRetryFn = vi.fn().mockResolvedValue(undefined);

      act(() => {
        result.current.handleError(timeoutError, mockRetryFn);
      });

      expect(result.current.error?.type).toBe('network');
      expect(result.current.error?.message).toBe('通信エラーが発生しました。再試行してください。');
      expect(result.current.error?.canRetry).toBe(true);
    });

    it('再試行関数がない場合、canRetryはfalseになること', () => {
      const { result } = renderHook(() => useNetworkError());
      const networkError = new ApiError(0, 'Network error');

      act(() => {
        result.current.handleError(networkError);
      });

      expect(result.current.error?.type).toBe('network');
      expect(result.current.error?.canRetry).toBe(false);
    });
  });

  describe('handleError - サーバーエラー（5xx）', () => {
    it('500エラーを正しく処理すること', () => {
      const { result } = renderHook(() => useNetworkError());
      const serverError = new ApiError(500, 'Internal Server Error');

      act(() => {
        result.current.handleError(serverError);
      });

      expect(result.current.error?.type).toBe('server');
      expect(result.current.error?.message).toBe(
        'システムエラーが発生しました。しばらくしてからお試しください。'
      );
      expect(result.current.error?.canRetry).toBe(false);
    });

    it('502エラーを正しく処理すること', () => {
      const { result } = renderHook(() => useNetworkError());
      const serverError = new ApiError(502, 'Bad Gateway');

      act(() => {
        result.current.handleError(serverError);
      });

      expect(result.current.error?.type).toBe('server');
      expect(result.current.error?.message).toBe(
        'システムエラーが発生しました。しばらくしてからお試しください。'
      );
    });

    it('503エラーを正しく処理すること', () => {
      const { result } = renderHook(() => useNetworkError());
      const serverError = new ApiError(503, 'Service Unavailable');

      act(() => {
        result.current.handleError(serverError);
      });

      expect(result.current.error?.type).toBe('server');
      expect(result.current.error?.canRetry).toBe(false);
    });

    it('504エラーを正しく処理すること', () => {
      const { result } = renderHook(() => useNetworkError());
      const serverError = new ApiError(504, 'Gateway Timeout');

      act(() => {
        result.current.handleError(serverError);
      });

      expect(result.current.error?.type).toBe('server');
    });
  });

  describe('handleError - セッション期限切れ', () => {
    it('401エラーをセッション期限切れとして処理すること', () => {
      const { result } = renderHook(() => useNetworkError());
      const authError = new ApiError(401, 'Unauthorized');

      act(() => {
        result.current.handleError(authError);
      });

      expect(result.current.error?.type).toBe('session');
      expect(result.current.error?.message).toBe(
        'セッションが期限切れになりました。再度ログインしてください。'
      );
      expect(result.current.error?.canRetry).toBe(false);
      expect(result.current.error?.shouldRedirect).toBe(true);
    });
  });

  describe('handleError - その他のクライアントエラー', () => {
    it('400エラーを汎用エラーとして処理すること', () => {
      const { result } = renderHook(() => useNetworkError());
      const badRequestError = new ApiError(400, 'Bad Request');

      act(() => {
        result.current.handleError(badRequestError);
      });

      expect(result.current.error?.type).toBe('client');
      expect(result.current.error?.message).toBe('Bad Request');
      expect(result.current.error?.canRetry).toBe(false);
    });

    it('403エラーを権限エラーとして処理すること', () => {
      const { result } = renderHook(() => useNetworkError());
      const forbiddenError = new ApiError(403, 'Forbidden');

      act(() => {
        result.current.handleError(forbiddenError);
      });

      expect(result.current.error?.type).toBe('client');
      expect(result.current.error?.canRetry).toBe(false);
    });

    it('404エラーをそのまま処理すること', () => {
      const { result } = renderHook(() => useNetworkError());
      const notFoundError = new ApiError(404, 'Not Found');

      act(() => {
        result.current.handleError(notFoundError);
      });

      expect(result.current.error?.type).toBe('client');
      expect(result.current.error?.message).toBe('Not Found');
    });
  });

  describe('handleError - 非ApiError', () => {
    it('一般的なErrorオブジェクトを処理すること', () => {
      const { result } = renderHook(() => useNetworkError());
      const genericError = new Error('Something went wrong');
      const mockRetryFn = vi.fn().mockResolvedValue(undefined);

      act(() => {
        result.current.handleError(genericError, mockRetryFn);
      });

      expect(result.current.error?.type).toBe('unknown');
      expect(result.current.error?.message).toBe('Something went wrong');
      expect(result.current.error?.canRetry).toBe(true);
    });

    it('再試行関数がない場合、canRetryはfalseになること', () => {
      const { result } = renderHook(() => useNetworkError());
      const genericError = new Error('Something went wrong');

      act(() => {
        result.current.handleError(genericError);
      });

      expect(result.current.error?.type).toBe('unknown');
      expect(result.current.error?.canRetry).toBe(false);
    });

    it('文字列エラーを処理すること', () => {
      const { result } = renderHook(() => useNetworkError());

      act(() => {
        result.current.handleError('String error');
      });

      expect(result.current.error?.type).toBe('unknown');
      expect(result.current.error?.message).toBe('予期せぬエラーが発生しました。');
    });

    it('nullやundefinedを処理すること', () => {
      const { result } = renderHook(() => useNetworkError());

      act(() => {
        result.current.handleError(null);
      });

      expect(result.current.error?.type).toBe('unknown');
      expect(result.current.error?.message).toBe('予期せぬエラーが発生しました。');
    });
  });

  describe('retry - 再試行機能', () => {
    it('再試行関数を呼び出せること', async () => {
      const mockRetryFn = vi.fn().mockResolvedValue({ success: true });
      const { result } = renderHook(() => useNetworkError());

      const networkError = new ApiError(0, 'Network error');

      act(() => {
        result.current.handleError(networkError, mockRetryFn);
      });

      expect(result.current.error?.canRetry).toBe(true);
      expect(result.current.isRetrying).toBe(false);

      await act(async () => {
        await result.current.retry();
      });

      expect(mockRetryFn).toHaveBeenCalledTimes(1);
    });

    it('再試行中はisRetryingがtrueになること', async () => {
      let resolveRetry: () => void;
      const mockRetryFn = vi.fn().mockImplementation(
        () =>
          new Promise<void>((resolve) => {
            resolveRetry = resolve;
          })
      );
      const { result } = renderHook(() => useNetworkError());

      const networkError = new ApiError(0, 'Network error');

      act(() => {
        result.current.handleError(networkError, mockRetryFn);
      });

      let retryPromise: Promise<void>;

      act(() => {
        retryPromise = result.current.retry();
      });

      // 再試行中はisRetryingがtrue
      await waitFor(() => {
        expect(result.current.isRetrying).toBe(true);
      });

      // 再試行完了
      act(() => {
        resolveRetry!();
      });

      await retryPromise!;

      await waitFor(() => {
        expect(result.current.isRetrying).toBe(false);
      });
    });

    it('再試行成功時にエラーがクリアされること', async () => {
      const mockRetryFn = vi.fn().mockResolvedValue({ success: true });
      const { result } = renderHook(() => useNetworkError());

      const networkError = new ApiError(0, 'Network error');

      act(() => {
        result.current.handleError(networkError, mockRetryFn);
      });

      expect(result.current.error).not.toBeNull();

      await act(async () => {
        await result.current.retry();
      });

      expect(result.current.error).toBeNull();
      expect(result.current.isError).toBe(false);
    });

    it('再試行失敗時にエラーが更新されること', async () => {
      const newError = new ApiError(500, 'Server still down');
      const mockRetryFn = vi.fn().mockRejectedValue(newError);
      const { result } = renderHook(() => useNetworkError());

      const networkError = new ApiError(0, 'Network error');

      act(() => {
        result.current.handleError(networkError, mockRetryFn);
      });

      expect(result.current.error?.type).toBe('network');

      await act(async () => {
        await result.current.retry();
      });

      // エラーが更新されている
      expect(result.current.error?.type).toBe('server');
      expect(result.current.isRetrying).toBe(false);
    });

    it('再試行関数がない場合、retryを呼んでも何も起こらないこと', async () => {
      const { result } = renderHook(() => useNetworkError());

      const serverError = new ApiError(500, 'Server Error');

      act(() => {
        result.current.handleError(serverError); // retryFnなし
      });

      expect(result.current.error?.canRetry).toBe(false);

      await act(async () => {
        await result.current.retry();
      });

      // 何も変わらない
      expect(result.current.error?.type).toBe('server');
    });
  });

  describe('clearError - エラークリア機能', () => {
    it('エラーをクリアできること', () => {
      const { result } = renderHook(() => useNetworkError());

      const networkError = new ApiError(0, 'Network error');

      act(() => {
        result.current.handleError(networkError);
      });

      expect(result.current.error).not.toBeNull();

      act(() => {
        result.current.clearError();
      });

      expect(result.current.error).toBeNull();
      expect(result.current.isError).toBe(false);
    });
  });

  describe('getErrorType ユーティリティ', () => {
    it('statusCodeからエラータイプを正しく判定すること', () => {
      const { result } = renderHook(() => useNetworkError());

      // 各エラータイプをテスト
      const testCases: Array<{ statusCode: number; expectedType: ErrorType }> = [
        { statusCode: 0, expectedType: 'network' },
        { statusCode: 401, expectedType: 'session' },
        { statusCode: 400, expectedType: 'client' },
        { statusCode: 403, expectedType: 'client' },
        { statusCode: 404, expectedType: 'client' },
        { statusCode: 500, expectedType: 'server' },
        { statusCode: 502, expectedType: 'server' },
        { statusCode: 503, expectedType: 'server' },
      ];

      testCases.forEach(({ statusCode, expectedType }) => {
        const error = new ApiError(statusCode, 'Test');
        act(() => {
          result.current.handleError(error);
        });
        expect(result.current.error?.type).toBe(expectedType);
        act(() => {
          result.current.clearError();
        });
      });
    });
  });
});
