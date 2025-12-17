/**
 * @fileoverview 現場調査機能用エラーハンドリングフック
 *
 * Task 11.2: エラー表示の実装
 *
 * Requirements:
 * - 14.8: エラー発生時に適切なエラーメッセージを表示し、Sentryにログを送信する
 *
 * 機能:
 * - バリデーションエラー表示
 * - ネットワークエラー表示
 * - Sentryへのエラーログ送信
 * - 再試行機能
 */

import { useState, useCallback } from 'react';
import { ApiError } from '../api/client';
import { captureException } from '../utils/sentry';
import {
  isSiteSurveyConflictErrorResponse,
  isSiteSurveyNotFoundErrorResponse,
  isUnsupportedFileTypeErrorResponse,
} from '../types/site-survey.types';

// ============================================================================
// 型定義
// ============================================================================

/**
 * エラーの種類
 */
export type SiteSurveyErrorType =
  | 'validation'
  | 'network'
  | 'server'
  | 'session'
  | 'conflict'
  | 'notFound'
  | 'forbidden'
  | 'client'
  | 'unsupportedFileType'
  | 'fileTooLarge'
  | 'unknown';

/**
 * フィールドエラーの型
 */
export interface FieldErrors {
  [fieldName: string]: string;
}

/**
 * 現場調査エラー状態
 */
export interface SiteSurveyErrorState {
  /** エラータイプ */
  type: SiteSurveyErrorType;
  /** エラーメッセージ */
  message: string;
  /** HTTPステータスコード（ネットワークエラーの場合は0） */
  statusCode: number;
  /** 再試行可能かどうか */
  canRetry: boolean;
  /** リダイレクトが必要かどうか（セッション期限切れ時） */
  shouldRedirect: boolean;
  /** フィールドごとのエラー（バリデーションエラー時） */
  fieldErrors?: FieldErrors;
  /** 元のエラーオブジェクト */
  originalError?: unknown;
}

/**
 * 再試行関数の型
 */
export type RetryFunction = () => Promise<unknown>;

/**
 * エラーコンテキストの型
 */
export interface ErrorContext {
  [key: string]: unknown;
}

/**
 * useSiteSurveyErrorフックの戻り値
 */
export interface UseSiteSurveyErrorReturn {
  /** 現在のエラー状態 */
  error: SiteSurveyErrorState | null;
  /** エラーが発生しているか */
  isError: boolean;
  /** 再試行中かどうか */
  isRetrying: boolean;
  /** APIエラーをハンドリングする関数 */
  handleApiError: (error: unknown, retryFn?: RetryFunction, context?: ErrorContext) => void;
  /** バリデーションエラーを設定する関数 */
  handleValidationError: (fieldErrors: FieldErrors) => void;
  /** 予期しないエラーをハンドリングする関数 */
  handleUnexpectedError: (error: Error, context?: ErrorContext) => void;
  /** 再試行を実行する関数 */
  retry: () => Promise<void>;
  /** エラーをクリアする関数 */
  clearError: () => void;
  /** 特定のフィールドエラーをクリアする関数 */
  clearFieldError: (fieldName: string) => void;
  /** ユーザー向けエラーメッセージを取得する関数 */
  getErrorMessage: () => string;
}

// ============================================================================
// 定数
// ============================================================================

/**
 * エラーメッセージの定数
 */
const ERROR_MESSAGES: Record<SiteSurveyErrorType, string> = {
  validation: '入力内容に誤りがあります。確認してください。',
  network: '通信エラーが発生しました。ネットワーク接続を確認して再試行してください。',
  server: 'システムエラーが発生しました。しばらくしてからお試しください。',
  session: 'セッションが期限切れになりました。再度ログインしてください。',
  conflict: 'データが他のユーザーによって更新されています。再読み込みしてください。',
  notFound: '指定されたデータが見つかりません。',
  forbidden: 'この操作を実行する権限がありません。',
  client: 'リクエストに問題があります。',
  unsupportedFileType: 'サポートされていないファイル形式です。JPEG、PNG、WEBPのみ対応しています。',
  fileTooLarge: 'ファイルサイズが大きすぎます。50MB以下のファイルを選択してください。',
  unknown: '予期せぬエラーが発生しました。',
} as const;

// ============================================================================
// ヘルパー関数
// ============================================================================

/**
 * ステータスコードからエラータイプを判定する
 */
function getErrorTypeFromStatusCode(statusCode: number, response?: unknown): SiteSurveyErrorType {
  if (statusCode === 0) {
    return 'network';
  }
  if (statusCode === 401) {
    return 'session';
  }
  if (statusCode === 403) {
    return 'forbidden';
  }
  if (statusCode === 404) {
    if (isSiteSurveyNotFoundErrorResponse(response)) {
      return 'notFound';
    }
    return 'notFound';
  }
  if (statusCode === 409) {
    if (isSiteSurveyConflictErrorResponse(response)) {
      return 'conflict';
    }
    return 'conflict';
  }
  if (statusCode === 413) {
    return 'fileTooLarge';
  }
  if (statusCode === 415) {
    if (isUnsupportedFileTypeErrorResponse(response)) {
      return 'unsupportedFileType';
    }
    return 'unsupportedFileType';
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
 * エラーオブジェクトからSiteSurveyErrorStateを生成する
 */
function createErrorState(error: unknown, retryFn?: RetryFunction): SiteSurveyErrorState {
  // ApiErrorの場合
  if (error instanceof ApiError) {
    const type = getErrorTypeFromStatusCode(error.statusCode, error.response);
    const message = ERROR_MESSAGES[type];

    let canRetry = false;
    let shouldRedirect = false;

    switch (type) {
      case 'network':
        canRetry = true;
        break;
      case 'session':
        shouldRedirect = true;
        break;
      case 'conflict':
      case 'notFound':
      case 'forbidden':
      case 'server':
      case 'client':
      case 'unsupportedFileType':
      case 'fileTooLarge':
        canRetry = false;
        break;
      default:
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
 * エラーをSentryに送信するかどうかを判定する
 */
function shouldSendToSentry(type: SiteSurveyErrorType): boolean {
  // バリデーションエラーと競合エラーはユーザー操作による通常のケースなので送信しない
  return !['validation', 'conflict'].includes(type);
}

// ============================================================================
// フック実装
// ============================================================================

/**
 * 現場調査機能用エラーハンドリングフック
 *
 * @example
 * ```tsx
 * const {
 *   error,
 *   isError,
 *   handleApiError,
 *   handleValidationError,
 *   clearError,
 *   retry,
 * } = useSiteSurveyError();
 *
 * const handleSubmit = async (data: FormData) => {
 *   try {
 *     await createSiteSurvey(projectId, data);
 *   } catch (err) {
 *     handleApiError(err, () => handleSubmit(data), { projectId });
 *   }
 * };
 * ```
 */
export function useSiteSurveyError(): UseSiteSurveyErrorReturn {
  const [error, setError] = useState<SiteSurveyErrorState | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);
  const [retryFunction, setRetryFunction] = useState<RetryFunction | null>(null);

  /**
   * APIエラーをハンドリングする
   */
  const handleApiError = useCallback(
    (err: unknown, retryFn?: RetryFunction, context?: ErrorContext) => {
      const errorState = createErrorState(err, retryFn);
      setError(errorState);

      if (retryFn) {
        setRetryFunction(() => retryFn);
      } else {
        setRetryFunction(null);
      }

      // Sentryへの送信
      if (shouldSendToSentry(errorState.type) && err instanceof Error) {
        captureException(err, {
          errorType: errorState.type,
          statusCode: errorState.statusCode,
          ...context,
        });
      }
    },
    []
  );

  /**
   * バリデーションエラーを設定する
   */
  const handleValidationError = useCallback((fieldErrors: FieldErrors) => {
    setError({
      type: 'validation',
      message: ERROR_MESSAGES.validation,
      statusCode: 0,
      canRetry: false,
      shouldRedirect: false,
      fieldErrors,
    });
    setRetryFunction(null);
  }, []);

  /**
   * 予期しないエラーをハンドリングする
   */
  const handleUnexpectedError = useCallback((err: Error, context?: ErrorContext) => {
    setError({
      type: 'unknown',
      message: err.message || ERROR_MESSAGES.unknown,
      statusCode: 0,
      canRetry: false,
      shouldRedirect: false,
      originalError: err,
    });
    setRetryFunction(null);

    // Sentryへの送信
    captureException(err, {
      errorType: 'unknown',
      ...context,
    });
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

      // Sentryへの送信
      if (shouldSendToSentry(newErrorState.type) && err instanceof Error) {
        captureException(err, {
          errorType: newErrorState.type,
          statusCode: newErrorState.statusCode,
          retryAttempt: true,
        });
      }
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

  /**
   * 特定のフィールドエラーをクリアする
   */
  const clearFieldError = useCallback((fieldName: string) => {
    setError((prevError) => {
      if (!prevError || prevError.type !== 'validation' || !prevError.fieldErrors) {
        return prevError;
      }

      const newFieldErrors = { ...prevError.fieldErrors };
      delete newFieldErrors[fieldName];

      // フィールドエラーがすべてクリアされた場合はエラー自体をクリア
      if (Object.keys(newFieldErrors).length === 0) {
        return null;
      }

      return {
        ...prevError,
        fieldErrors: newFieldErrors,
      };
    });
  }, []);

  /**
   * ユーザー向けエラーメッセージを取得する
   */
  const getErrorMessage = useCallback(() => {
    if (!error) {
      return '';
    }
    return error.message;
  }, [error]);

  return {
    error,
    isError: error !== null,
    isRetrying,
    handleApiError,
    handleValidationError,
    handleUnexpectedError,
    retry,
    clearError,
    clearFieldError,
    getErrorMessage,
  };
}

export default useSiteSurveyError;
