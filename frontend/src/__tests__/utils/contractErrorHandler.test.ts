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
 * - REQ-11.8, REQ-11.9: 404 を見つからない種別に分類する（Task 21.1）
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
  CONTRACT_NOT_FOUND_MESSAGE,
  PROJECT_NOT_FOUND_MESSAGE,
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

// ============================================================================
// REQ-11.8, REQ-11.9: 見つからない（404）。Task 21.1
// ============================================================================
describe('classifyContractError の 404（REQ-11.8, REQ-11.9）', () => {
  it('404 を見つからない種別に分類し、既定では契約書が見つからない旨を返す', () => {
    const error = new ApiError(404, 'Not found', { code: 'NOT_FOUND' });

    const result = classifyContractError(error);

    expect(result.type).toBe('not_found');
    expect(result.message).toBe(CONTRACT_NOT_FOUND_MESSAGE);
    expect(result.message).not.toBe('予期しないエラーが発生しました。');
    expect(result.retryable).toBe(false);
    expect(result.originalError).toBe(error);
  });

  it('見つからない対象にプロジェクトを指定すると、プロジェクトが見つからない旨を返す', () => {
    const error = new ApiError(404, 'Not found', { code: 'NOT_FOUND' });

    const result = classifyContractError(error, { notFoundTarget: 'project' });

    expect(result.type).toBe('not_found');
    expect(result.message).toBe(PROJECT_NOT_FOUND_MESSAGE);
    expect(result.retryable).toBe(false);
  });

  it('見積書の不在（ESTIMATE_NOT_FOUND）はサーバーの本文を表示する', () => {
    const serverMessage = '見積書が見つかりません: est-001';
    const error = new ApiError(404, serverMessage, {
      status: 404,
      detail: serverMessage,
      code: 'ESTIMATE_NOT_FOUND',
    });

    const result = classifyContractError(error, { notFoundTarget: 'project' });

    expect(result.type).toBe('not_found');
    expect(result.message).toBe(serverMessage);
    expect(result.retryable).toBe(false);
  });

  it('文言は日本語で見つからない対象を告げ、閲覧範囲や権限に触れない', () => {
    expect(CONTRACT_NOT_FOUND_MESSAGE).toBe(
      '契約書が見つかりません。存在しないか、削除されています。'
    );
    expect(PROJECT_NOT_FOUND_MESSAGE).toBe(
      'プロジェクトが見つかりません。存在しないか、削除されています。'
    );
    for (const message of [CONTRACT_NOT_FOUND_MESSAGE, PROJECT_NOT_FOUND_MESSAGE]) {
      expect(message).not.toMatch(/権限|範囲|担当/);
    }
  });
});
