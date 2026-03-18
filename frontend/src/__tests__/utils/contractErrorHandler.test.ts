/**
 * @fileoverview 契約書エラーハンドリングユーティリティのテスト
 *
 * Task 14.2: エラー種別に応じたフィードバックを全画面に実装する
 *
 * Requirements (contract-management):
 * - REQ-11.1: ネットワークエラー時のメッセージと再試行可能フラグ
 * - REQ-11.2: サーバーエラー（5xx）時のメッセージ
 * - REQ-11.3: セッション期限切れ（401）時の分類
 * - REQ-11.4: 楽観的排他制御競合（409）時のメッセージ
 *
 * @module __tests__/utils/contractErrorHandler.test
 */

import { describe, it, expect } from 'vitest';
import { ApiError } from '../../api/client';
import {
  classifyContractError,
  NETWORK_ERROR_MESSAGE,
  SERVER_ERROR_MESSAGE,
  CONFLICT_ERROR_MESSAGE,
  FORBIDDEN_ERROR_MESSAGE,
} from '../../utils/contractErrorHandler';

describe('classifyContractError', () => {
  // ==========================================================================
  // REQ-11.1: ネットワークエラー
  // ==========================================================================
  describe('ネットワークエラー（REQ-11.1）', () => {
    it('ApiError statusCode=0 をネットワークエラーとして分類する', () => {
      const error = new ApiError(0, 'Network error');

      const result = classifyContractError(error);

      expect(result.type).toBe('network');
      expect(result.message).toBe(NETWORK_ERROR_MESSAGE);
      expect(result.retryable).toBe(true);
    });

    it('TypeErrorをネットワークエラーとして分類する（fetch失敗時）', () => {
      const error = new TypeError('Failed to fetch');

      const result = classifyContractError(error);

      expect(result.type).toBe('network');
      expect(result.message).toBe(NETWORK_ERROR_MESSAGE);
      expect(result.retryable).toBe(true);
    });

    it('ネットワークエラーメッセージは「通信エラーが発生しました。再試行してください。」である', () => {
      expect(NETWORK_ERROR_MESSAGE).toBe('通信エラーが発生しました。再試行してください。');
    });
  });

  // ==========================================================================
  // REQ-11.2: サーバーエラー（5xx）
  // ==========================================================================
  describe('サーバーエラー 5xx（REQ-11.2）', () => {
    it('ApiError statusCode=500 をサーバーエラーとして分類する', () => {
      const error = new ApiError(500, 'Internal Server Error');

      const result = classifyContractError(error);

      expect(result.type).toBe('server');
      expect(result.message).toBe(SERVER_ERROR_MESSAGE);
      expect(result.retryable).toBe(true);
    });

    it('ApiError statusCode=502 をサーバーエラーとして分類する', () => {
      const error = new ApiError(502, 'Bad Gateway');

      const result = classifyContractError(error);

      expect(result.type).toBe('server');
      expect(result.message).toBe(SERVER_ERROR_MESSAGE);
    });

    it('ApiError statusCode=503 をサーバーエラーとして分類する', () => {
      const error = new ApiError(503, 'Service Unavailable');

      const result = classifyContractError(error);

      expect(result.type).toBe('server');
      expect(result.message).toBe(SERVER_ERROR_MESSAGE);
    });

    it('サーバーエラーメッセージは「システムエラーが発生しました。しばらくしてからお試しください。」である', () => {
      expect(SERVER_ERROR_MESSAGE).toBe(
        'システムエラーが発生しました。しばらくしてからお試しください。'
      );
    });
  });

  // ==========================================================================
  // REQ-11.3: セッション期限切れ（401）
  // ==========================================================================
  describe('セッション期限切れ 401（REQ-11.3）', () => {
    it('ApiError statusCode=401 をセッション期限切れとして分類する', () => {
      const error = new ApiError(401, 'Unauthorized');

      const result = classifyContractError(error);

      expect(result.type).toBe('session_expired');
      expect(result.retryable).toBe(false);
    });
  });

  // ==========================================================================
  // REQ-11.4: 楽観的排他制御競合（409）
  // ==========================================================================
  describe('楽観的排他制御競合 409（REQ-11.4）', () => {
    it('ApiError statusCode=409 を競合エラーとして分類する', () => {
      const error = new ApiError(409, 'Conflict');

      const result = classifyContractError(error);

      expect(result.type).toBe('conflict');
      expect(result.message).toBe(CONFLICT_ERROR_MESSAGE);
      expect(result.retryable).toBe(false);
    });

    it('競合エラーメッセージは「他のユーザーがこの契約書を更新しました。最新データを確認してください。」である', () => {
      expect(CONFLICT_ERROR_MESSAGE).toBe(
        '他のユーザーがこの契約書を更新しました。最新データを確認してください。'
      );
    });
  });

  // ==========================================================================
  // その他のエラー
  // ==========================================================================
  describe('その他のエラー', () => {
    it('ApiError statusCode=403 を権限エラーとして分類する', () => {
      const error = new ApiError(403, 'Forbidden');

      const result = classifyContractError(error);

      expect(result.type).toBe('forbidden');
      expect(result.message).toBe(FORBIDDEN_ERROR_MESSAGE);
      expect(result.retryable).toBe(false);
    });

    it('ApiError statusCode=400 をバリデーションエラーとして分類する', () => {
      const error = new ApiError(400, '入力に誤りがあります');

      const result = classifyContractError(error);

      expect(result.type).toBe('validation');
      expect(result.message).toBe('入力に誤りがあります');
      expect(result.retryable).toBe(false);
    });

    it('ApiError statusCode=422 をビジネスエラーとして分類する', () => {
      const error = new ApiError(422, 'この契約書は変更契約の基となっているため削除できません');

      const result = classifyContractError(error);

      expect(result.type).toBe('business');
      expect(result.message).toBe('この契約書は変更契約の基となっているため削除できません');
      expect(result.retryable).toBe(false);
    });

    it('不明なエラーをunknownとして分類する', () => {
      const error = new Error('Something unexpected');

      const result = classifyContractError(error);

      expect(result.type).toBe('unknown');
      expect(result.retryable).toBe(false);
    });

    it('元のエラーオブジェクトを保持する', () => {
      const error = new ApiError(500, 'Server Error');

      const result = classifyContractError(error);

      expect(result.originalError).toBe(error);
    });
  });
});
