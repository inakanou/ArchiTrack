/**
 * @fileoverview ネットワークエラーハンドリングフック
 *
 * Task 13.2: ネットワークエラー対応
 *
 * Requirements:
 * - 18.1: ネットワークエラー時のエラーメッセージ表示を実装
 * - 18.2: 再試行ボタンの表示と機能を実装
 * - 18.3: サーバーエラー（5xx）時のメッセージ表示を実装
 * - 18.6: セッション期限切れ時のリダイレクトを実装
 */

import { useState, useCallback } from 'react';
import { ApiError } from '../api/client';

/**
 * エラーの種類
 */
export type ErrorType = 'network' | 'server' | 'session' | 'client' | 'unknown';

/**
 * ネットワークエラー状態
 */
export interface NetworkErrorState {
  /** エラータイプ */
  type: ErrorType;
  /** エラーメッセージ */
  message: string;
  /** HTTPステータスコード（ネットワークエラーの場合は0） */
  statusCode: number;
  /** 再試行可能かどうか */
  canRetry: boolean;
  /** リダイレクトが必要かどうか（セッション期限切れ時） */
  shouldRedirect: boolean;
  /** 元のエラーオブジェクト */
  originalError?: unknown;
}

/**
 * 再試行関数の型
 */
export type RetryFunction = () => Promise<unknown>;

/**
 * useNetworkErrorフックの戻り値
 */
export interface UseNetworkErrorReturn {
  /** 現在のエラー状態 */
  error: NetworkErrorState | null;
  /** エラーが発生しているか */
  isError: boolean;
  /** 再試行中かどうか */
  isRetrying: boolean;
  /** エラーをハンドリングする関数 */
  handleError: (error: unknown, retryFn?: RetryFunction) => void;
  /** 再試行を実行する関数 */
  retry: () => Promise<void>;
  /** エラーをクリアする関数 */
  clearError: () => void;
}

/**
 * エラーメッセージの定数
 */
const ERROR_MESSAGES = {
  network: '通信エラーが発生しました。再試行してください。',
  server: 'システムエラーが発生しました。しばらくしてからお試しください。',
  session: 'セッションが期限切れになりました。再度ログインしてください。',
  unknown: '予期せぬエラーが発生しました。',
} as const;

/**
 * ステータスコードからエラータイプを判定する
 */
function getErrorTypeFromStatusCode(statusCode: number): ErrorType {
  if (statusCode === 0) {
    return 'network';
  }
  if (statusCode === 401) {
    return 'session';
  }
  if (statusCode >= 500 && statusCode < 600) {
    return 'server';
  }
  if (statusCode >= 400 && statusCode < 500) {
    return 'client';
  }
  return 'unknown';
}

/**
 * エラーオブジェクトからNetworkErrorStateを生成する
 */
function createErrorState(error: unknown, retryFn?: RetryFunction): NetworkErrorState {
  // ApiErrorの場合
  if (error instanceof ApiError) {
    const type = getErrorTypeFromStatusCode(error.statusCode);

    let message: string;
    let canRetry: boolean;
    let shouldRedirect = false;

    switch (type) {
      case 'network':
        message = ERROR_MESSAGES.network;
        canRetry = true;
        break;
      case 'server':
        message = ERROR_MESSAGES.server;
        canRetry = false;
        break;
      case 'session':
        message = ERROR_MESSAGES.session;
        canRetry = false;
        shouldRedirect = true;
        break;
      case 'client':
        message = error.message;
        canRetry = false;
        break;
      default:
        message = error.message || ERROR_MESSAGES.unknown;
        canRetry = !!retryFn;
    }

    return {
      type,
      message,
      statusCode: error.statusCode,
      canRetry: canRetry && !!retryFn,
      shouldRedirect,
      originalError: error,
    };
  }

  // 一般的なErrorの場合
  if (error instanceof Error) {
    return {
      type: 'unknown',
      message: error.message || ERROR_MESSAGES.unknown,
      statusCode: 0,
      canRetry: !!retryFn,
      shouldRedirect: false,
      originalError: error,
    };
  }

  // その他（文字列、null、undefined等）
  return {
    type: 'unknown',
    message: ERROR_MESSAGES.unknown,
    statusCode: 0,
    canRetry: !!retryFn,
    shouldRedirect: false,
    originalError: error,
  };
}

/**
 * ネットワークエラーハンドリングフック
 *
 * @example
 * ```tsx
 * const { error, isError, isRetrying, handleError, retry, clearError } = useNetworkError();
 *
 * const fetchData = useCallback(async () => {
 *   try {
 *     const data = await apiClient.get('/api/data');
 *     return data;
 *   } catch (err) {
 *     handleError(err, fetchData);
 *   }
 * }, [handleError]);
 *
 * if (isError) {
 *   return (
 *     <NetworkErrorDisplay
 *       error={error}
 *       onRetry={retry}
 *       onDismiss={clearError}
 *       isRetrying={isRetrying}
 *     />
 *   );
 * }
 * ```
 */
export function useNetworkError(): UseNetworkErrorReturn {
  const [error, setError] = useState<NetworkErrorState | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);
  const [retryFunction, setRetryFunction] = useState<RetryFunction | null>(null);

  /**
   * エラーをハンドリングする
   */
  const handleError = useCallback((err: unknown, retryFn?: RetryFunction) => {
    const errorState = createErrorState(err, retryFn);
    setError(errorState);

    if (retryFn) {
      // 関数を状態として保存するために、関数を返す関数でラップ
      setRetryFunction(() => retryFn);
    } else {
      setRetryFunction(null);
    }
  }, []);

  /**
   * 再試行を実行する
   */
  const retry = useCallback(async () => {
    if (!retryFunction || !error?.canRetry) {
      return;
    }

    setIsRetrying(true);

    try {
      await retryFunction();
      // 成功したらエラーをクリア
      setError(null);
      setRetryFunction(null);
    } catch (err) {
      // 失敗したらエラーを更新
      const newErrorState = createErrorState(err, retryFunction);
      setError(newErrorState);
    } finally {
      setIsRetrying(false);
    }
  }, [retryFunction, error?.canRetry]);

  /**
   * エラーをクリアする
   */
  const clearError = useCallback(() => {
    setError(null);
    setRetryFunction(null);
  }, []);

  return {
    error,
    isError: error !== null,
    isRetrying,
    handleError,
    retry,
    clearError,
  };
}

export default useNetworkError;
