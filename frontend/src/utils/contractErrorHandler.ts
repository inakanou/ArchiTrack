/**
 * @fileoverview 契約書画面のエラーハンドリングユーティリティ
 *
 * Task 14.2: エラー種別に応じたフィードバックを全画面に実装する
 *
 * Requirements (contract-management):
 * - REQ-11.1: ネットワークエラー時にトースト通知と再試行ボタンを表示する
 * - REQ-11.2: サーバーエラー（5xx）時にトースト通知を表示する
 * - REQ-11.3: セッション期限切れ（401）時にログインページにリダイレクトする
 * - REQ-11.4: 楽観的排他制御競合（409）時にトースト通知と再読込の誘導を表示する
 *
 * @module utils/contractErrorHandler
 */

import { ApiError } from '../api/client';

// ============================================================================
// 型定義
// ============================================================================

/**
 * エラー種別
 */
export type ContractErrorType =
  | 'network'
  | 'server'
  | 'session_expired'
  | 'conflict'
  | 'validation'
  | 'forbidden'
  | 'business'
  | 'unknown';

/**
 * 分類されたエラー情報
 */
export interface ClassifiedError {
  /** エラー種別 */
  type: ContractErrorType;
  /** ユーザーに表示するメッセージ */
  message: string;
  /** 再試行可能かどうか */
  retryable: boolean;
  /** 元のエラーオブジェクト */
  originalError: unknown;
}

// ============================================================================
// 定数
// ============================================================================

/** ネットワークエラーのトーストメッセージ */
export const NETWORK_ERROR_MESSAGE = '通信エラーが発生しました。再試行してください。';

/** サーバーエラーのトーストメッセージ */
export const SERVER_ERROR_MESSAGE =
  'システムエラーが発生しました。しばらくしてからお試しください。';

/** 楽観的排他制御競合のトーストメッセージ */
export const CONFLICT_ERROR_MESSAGE =
  '他のユーザーがこの契約書を更新しました。最新データを確認してください。';

/** 権限エラーのトーストメッセージ */
export const FORBIDDEN_ERROR_MESSAGE = 'この操作を行う権限がありません。';

// ============================================================================
// メイン関数
// ============================================================================

/**
 * エラーを分類し、適切なメッセージとメタデータを返す
 *
 * @param error - キャッチしたエラーオブジェクト
 * @returns 分類されたエラー情報
 */
export function classifyContractError(error: unknown): ClassifiedError {
  // ApiErrorの場合はstatusCodeで分類
  if (error instanceof ApiError) {
    const statusCode = error.statusCode;

    // ネットワークエラー（statusCode = 0）
    if (statusCode === 0) {
      return {
        type: 'network',
        message: NETWORK_ERROR_MESSAGE,
        retryable: true,
        originalError: error,
      };
    }

    // セッション期限切れ（401）
    // 注: AuthContextのsessionExpiredCallbackが先に処理するため、
    // ここに到達することは稀だが、安全のため分類しておく
    if (statusCode === 401) {
      return {
        type: 'session_expired',
        message: 'セッションが期限切れです。再ログインしてください。',
        retryable: false,
        originalError: error,
      };
    }

    // 権限エラー（403）
    if (statusCode === 403) {
      return {
        type: 'forbidden',
        message: FORBIDDEN_ERROR_MESSAGE,
        retryable: false,
        originalError: error,
      };
    }

    // 楽観的排他制御競合（409）
    if (statusCode === 409) {
      return {
        type: 'conflict',
        message: CONFLICT_ERROR_MESSAGE,
        retryable: false,
        originalError: error,
      };
    }

    // ビジネスエラー（422）
    if (statusCode === 422) {
      return {
        type: 'business',
        message: error.message || 'ビジネスルールエラーが発生しました。',
        retryable: false,
        originalError: error,
      };
    }

    // バリデーションエラー（400）
    if (statusCode === 400) {
      return {
        type: 'validation',
        message: error.message || '入力内容に誤りがあります。',
        retryable: false,
        originalError: error,
      };
    }

    // サーバーエラー（5xx）
    if (statusCode >= 500) {
      return {
        type: 'server',
        message: SERVER_ERROR_MESSAGE,
        retryable: true,
        originalError: error,
      };
    }
  }

  // TypeError等のネットワーク関連例外（fetch失敗時）
  if (error instanceof TypeError) {
    return {
      type: 'network',
      message: NETWORK_ERROR_MESSAGE,
      retryable: true,
      originalError: error,
    };
  }

  // その他の不明なエラー
  return {
    type: 'unknown',
    message: '予期しないエラーが発生しました。',
    retryable: false,
    originalError: error,
  };
}
