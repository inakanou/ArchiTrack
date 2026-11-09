/**
 * @fileoverview 外部の AI での読み取りの状態の取得と誤りの判別の単体テスト
 *
 * タスク117.1（estimate-request の design.md の章「Requirements 43-50」の D7）。
 * 状態の API の呼び出しと、管理者の停止・利用者の上限・外部のサービスの上限・記録の失敗を `code` で
 * 分けられること、従来の端末の読み取りへの切り替え（shouldFallback）を保つことを確かめる。
 *
 * @requirement estimate-request/REQ-49.4 管理者の停止を状態と 503 の code で判別する
 * @requirement estimate-request/REQ-49.8 利用者の上限の 429 を外部のサービスの 429 と分けて判別する
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { apiClient, ApiError } from '../../api/client';

vi.mock('../../api/client', async () => {
  const actual = await vi.importActual<typeof import('../../api/client')>('../../api/client');
  return {
    ...actual,
    apiClient: {
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
      patch: vi.fn(),
      delete: vi.fn(),
    },
  };
});

import {
  extractWithClaudeVision,
  extractWithClaudeVisionForQuantityTable,
  getClaudeVisionStatus,
  ClaudeVisionApiError,
  CLAUDE_VISION_ERROR_CODES,
} from '../../api/claude-vision';
import type { ClaudeVisionImageInput, ClaudeVisionStatus } from '../../api/claude-vision';

const images: ClaudeVisionImageInput[] = [{ base64Data: 'dGVzdA==', mediaType: 'image/png' }];

async function extractError(body: unknown, status: number): Promise<ClaudeVisionApiError> {
  vi.mocked(apiClient.post).mockRejectedValueOnce(new ApiError(status, 'failed', body));
  const error = await extractWithClaudeVision(images).catch((e: unknown) => e);
  expect(error).toBeInstanceOf(ClaudeVisionApiError);
  return error as ClaudeVisionApiError;
}

describe('claude-vision API client: 状態の取得と誤りの判別（タスク117.1）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getClaudeVisionStatus()', () => {
    it('状態の API を GET で呼び、使える状態を返す', async () => {
      const status: ClaudeVisionStatus = { available: true, reason: null };
      vi.mocked(apiClient.get).mockResolvedValueOnce(status);

      const result = await getClaudeVisionStatus();

      expect(apiClient.get).toHaveBeenCalledWith('/api/claude-vision/status');
      expect(result).toEqual({ available: true, reason: null });
    });

    it.each(['disabled_by_admin', 'no_permission', 'not_configured'] as const)(
      '使えない理由 %s をそのまま返す',
      async (reason) => {
        vi.mocked(apiClient.get).mockResolvedValueOnce({ available: false, reason });

        const result = await getClaudeVisionStatus();

        expect(result.available).toBe(false);
        expect(result.reason).toBe(reason);
      }
    );

    it('状態の取得の失敗は ApiError のまま投げる', async () => {
      vi.mocked(apiClient.get).mockRejectedValueOnce(new ApiError(401, 'unauthorized'));

      await expect(getClaudeVisionStatus()).rejects.toBeInstanceOf(ApiError);
    });
  });

  describe('extract の誤りの判別', () => {
    it('利用者の上限の 429（code: CLAUDE_VISION_USER_RATE_LIMITED）を外部のサービスの上限と分ける', async () => {
      const error = await extractError(
        {
          error: 'Too many external AI reading requests, please try again later.',
          retryAfter: 3600,
          code: 'CLAUDE_VISION_USER_RATE_LIMITED',
        },
        429
      );

      expect(error.statusCode).toBe(429);
      expect(error.code).toBe(CLAUDE_VISION_ERROR_CODES.USER_RATE_LIMITED);
      expect(error.isUserRateLimited).toBe(true);
      expect(error.isUpstreamRateLimited).toBe(false);
      expect(error.errorType).not.toBe('rate_limit');
      expect(error.shouldFallback).toBe(true);
    });

    it('外部のサービスの 429（errorType: rate_limit）は利用者の上限としない', async () => {
      const error = await extractError(
        { errorType: 'rate_limit', code: 'CLAUDE_VISION_RATE_LIMIT', status: 429 },
        429
      );

      expect(error.errorType).toBe('rate_limit');
      expect(error.code).toBe(CLAUDE_VISION_ERROR_CODES.UPSTREAM_RATE_LIMIT);
      expect(error.isUpstreamRateLimited).toBe(true);
      expect(error.isUserRateLimited).toBe(false);
      expect(error.shouldFallback).toBe(true);
    });

    it('管理者の停止の 503 を code で判別し、従来の機能無効と同じ種別と切り替えを保つ', async () => {
      const error = await extractError(
        {
          errorType: 'service_unavailable',
          code: 'CLAUDE_VISION_DISABLED_BY_ADMIN',
          status: 503,
        },
        503
      );

      expect(error.errorType).toBe('service_unavailable');
      expect(error.isDisabledByAdmin).toBe(true);
      expect(error.shouldFallback).toBe(true);
    });

    it('API キーの未設定の 503 は管理者の停止としない', async () => {
      const error = await extractError(
        {
          errorType: 'service_unavailable',
          code: 'CLAUDE_VISION_SERVICE_UNAVAILABLE',
          status: 503,
        },
        503
      );

      expect(error.errorType).toBe('service_unavailable');
      expect(error.isDisabledByAdmin).toBe(false);
    });

    it('記録の失敗の 500 を code で判別する', async () => {
      const error = await extractError(
        { errorType: 'unknown', code: 'CLAUDE_VISION_AUDIT_FAILED', status: 500 },
        500
      );

      expect(error.isAuditFailed).toBe(true);
      expect(error.errorType).toBe('unknown');
      expect(error.shouldFallback).toBe(true);
    });

    it('知らない errorType と code の無い本文は unknown・code null とする', async () => {
      const error = await extractError({ errorType: 'something_new' }, 500);

      expect(error.errorType).toBe('unknown');
      expect(error.code).toBeNull();
      expect(error.isUserRateLimited).toBe(false);
      expect(error.isDisabledByAdmin).toBe(false);
      expect(error.isAuditFailed).toBe(false);
    });

    it('数量表の取り込みでも利用者の上限と管理者の停止を判別する', async () => {
      vi.mocked(apiClient.post).mockRejectedValueOnce(
        new ApiError(429, 'too many', { code: 'CLAUDE_VISION_USER_RATE_LIMITED' })
      );
      const limited = await extractWithClaudeVisionForQuantityTable(images).catch(
        (e: unknown) => e
      );
      vi.mocked(apiClient.post).mockRejectedValueOnce(
        new ApiError(503, 'disabled', {
          errorType: 'service_unavailable',
          code: 'CLAUDE_VISION_DISABLED_BY_ADMIN',
        })
      );
      const disabled = await extractWithClaudeVisionForQuantityTable(images).catch(
        (e: unknown) => e
      );

      expect(limited).toBeInstanceOf(ClaudeVisionApiError);
      expect((limited as ClaudeVisionApiError).isUserRateLimited).toBe(true);
      expect(disabled).toBeInstanceOf(ClaudeVisionApiError);
      expect((disabled as ClaudeVisionApiError).isDisabledByAdmin).toBe(true);
    });
  });
});
