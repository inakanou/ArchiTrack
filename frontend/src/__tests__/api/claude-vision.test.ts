/**
 * @fileoverview Claude Vision APIクライアントのユニットテスト
 *
 * Task 53.1: api/claude-vision.tsクライアントモジュールの実装
 *
 * Requirements:
 * - 24.4: Base64エンコード・バックエンド送信
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { apiClient, ApiError } from '../../api/client';

// Mock apiClient
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
  ClaudeVisionApiError,
  isClaudeVisionApiError,
} from '../../api/claude-vision';
import type {
  ClaudeVisionImageInput,
  ClaudeVisionExtractResponse,
  ClaudeVisionQuantityExtractResponse,
} from '../../api/claude-vision';

describe('claude-vision API client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('extractWithClaudeVision()', () => {
    it('should call apiClient.post with correct path and body', async () => {
      const mockResponse: ClaudeVisionExtractResponse = {
        lineItems: [
          {
            customCategory: null,
            workType: '土工',
            name: '掘削工',
            specification: 'バックホウ',
            unit: 'm3',
            quantity: 100,
            unitPrice: 2500,
            amount: 250000,
            remarks: null,
          },
        ],
        pageCount: 1,
      };

      vi.mocked(apiClient.post).mockResolvedValueOnce(mockResponse);

      const images: ClaudeVisionImageInput[] = [{ base64Data: 'dGVzdA==', mediaType: 'image/png' }];

      const result = await extractWithClaudeVision(images);

      expect(apiClient.post).toHaveBeenCalledWith(
        '/api/claude-vision/extract',
        { images },
        expect.any(Object)
      );
      expect(result.lineItems).toHaveLength(1);
      expect(result.lineItems[0]!.name).toBe('掘削工');
      expect(result.pageCount).toBe(1);
    });

    it('should convert ApiError with errorType to ClaudeVisionApiError', async () => {
      const errorResponse = {
        errorType: 'timeout',
        message: 'Claude Vision APIリクエストがタイムアウトしました',
      };
      vi.mocked(apiClient.post).mockRejectedValueOnce(new ApiError(504, 'timeout', errorResponse));

      const images: ClaudeVisionImageInput[] = [{ base64Data: 'dGVzdA==', mediaType: 'image/png' }];

      try {
        await extractWithClaudeVision(images);
        expect.fail('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(ClaudeVisionApiError);
        const err = e as ClaudeVisionApiError;
        expect(err.errorType).toBe('timeout');
        expect(err.statusCode).toBe(504);
      }
    });

    it('should convert 503 service unavailable error', async () => {
      const errorResponse = {
        errorType: 'service_unavailable',
        message: 'Claude Vision機能は無効です',
      };
      vi.mocked(apiClient.post).mockRejectedValueOnce(
        new ApiError(503, 'service unavailable', errorResponse)
      );

      const images: ClaudeVisionImageInput[] = [{ base64Data: 'dGVzdA==', mediaType: 'image/png' }];

      try {
        await extractWithClaudeVision(images);
        expect.fail('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(ClaudeVisionApiError);
        const err = e as ClaudeVisionApiError;
        expect(err.errorType).toBe('service_unavailable');
        expect(err.statusCode).toBe(503);
      }
    });

    it('should convert 429 rate limit error', async () => {
      const errorResponse = { errorType: 'rate_limit' };
      vi.mocked(apiClient.post).mockRejectedValueOnce(
        new ApiError(429, 'rate limited', errorResponse)
      );

      const images: ClaudeVisionImageInput[] = [{ base64Data: 'dGVzdA==', mediaType: 'image/png' }];

      try {
        await extractWithClaudeVision(images);
        expect.fail('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(ClaudeVisionApiError);
        expect((e as ClaudeVisionApiError).errorType).toBe('rate_limit');
      }
    });

    it('should set shouldFallback to true for all error types', async () => {
      const errorTypes = [
        { statusCode: 503, errorType: 'service_unavailable' },
        { statusCode: 504, errorType: 'timeout' },
        { statusCode: 429, errorType: 'rate_limit' },
        { statusCode: 401, errorType: 'auth_error' },
        { statusCode: 422, errorType: 'parse_error' },
        { statusCode: 500, errorType: 'unknown' },
      ];

      for (const { statusCode, errorType } of errorTypes) {
        vi.mocked(apiClient.post).mockRejectedValueOnce(
          new ApiError(statusCode, errorType, { errorType })
        );

        const images: ClaudeVisionImageInput[] = [
          { base64Data: 'dGVzdA==', mediaType: 'image/png' },
        ];

        try {
          await extractWithClaudeVision(images);
          expect.fail(`Should have thrown for ${errorType}`);
        } catch (e) {
          expect(e).toBeInstanceOf(ClaudeVisionApiError);
          expect((e as ClaudeVisionApiError).shouldFallback).toBe(true);
        }
      }
    });

    it('should handle non-ApiError and wrap as ClaudeVisionApiError with unknown type', async () => {
      vi.mocked(apiClient.post).mockRejectedValueOnce(new Error('Network failed'));

      const images: ClaudeVisionImageInput[] = [{ base64Data: 'dGVzdA==', mediaType: 'image/png' }];

      try {
        await extractWithClaudeVision(images);
        expect.fail('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(ClaudeVisionApiError);
        expect((e as ClaudeVisionApiError).errorType).toBe('unknown');
        expect((e as ClaudeVisionApiError).shouldFallback).toBe(true);
      }
    });
  });

  describe('isClaudeVisionApiError()', () => {
    it('should return true for ClaudeVisionApiError instances', () => {
      const err = new ClaudeVisionApiError('test', 'timeout', 504);
      expect(isClaudeVisionApiError(err)).toBe(true);
    });

    it('should return false for regular Error', () => {
      expect(isClaudeVisionApiError(new Error('test'))).toBe(false);
    });

    it('should return false for ApiError', () => {
      expect(isClaudeVisionApiError(new ApiError(500, 'test'))).toBe(false);
    });

    it('should return false for non-Error values', () => {
      expect(isClaudeVisionApiError(null)).toBe(false);
      expect(isClaudeVisionApiError(undefined)).toBe(false);
      expect(isClaudeVisionApiError('string')).toBe(false);
    });
  });

  describe('extractWithClaudeVisionForQuantityTable()', () => {
    it('should call apiClient.post with mode quantity-table', async () => {
      const mockResponse: ClaudeVisionQuantityExtractResponse = {
        lineItems: [
          {
            majorCategory: '共通仮設',
            middleCategory: null,
            minorCategory: null,
            customCategory: null,
            workType: '土工',
            name: '掘削工',
            specification: 'バックホウ',
            quantity: 100,
            unit: 'm3',
            remarks: null,
          },
        ],
        pageCount: 1,
      };

      vi.mocked(apiClient.post).mockResolvedValueOnce(mockResponse);

      const images: ClaudeVisionImageInput[] = [{ base64Data: 'dGVzdA==', mediaType: 'image/png' }];

      const result = await extractWithClaudeVisionForQuantityTable(images);

      expect(apiClient.post).toHaveBeenCalledWith(
        '/api/claude-vision/extract',
        { images, mode: 'quantity-table' },
        expect.any(Object)
      );
      expect(result.lineItems).toHaveLength(1);
      expect(result.lineItems[0]!.workType).toBe('土工');
      expect(result.pageCount).toBe(1);
    });

    it('should convert ApiError to ClaudeVisionApiError', async () => {
      const errorResponse = {
        errorType: 'timeout',
        message: 'タイムアウト',
      };
      vi.mocked(apiClient.post).mockRejectedValueOnce(new ApiError(504, 'timeout', errorResponse));

      const images: ClaudeVisionImageInput[] = [{ base64Data: 'dGVzdA==', mediaType: 'image/png' }];

      try {
        await extractWithClaudeVisionForQuantityTable(images);
        expect.fail('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(ClaudeVisionApiError);
        const err = e as ClaudeVisionApiError;
        expect(err.errorType).toBe('timeout');
        expect(err.statusCode).toBe(504);
        expect(err.shouldFallback).toBe(true);
      }
    });

    it('should handle ApiError without errorType in response', async () => {
      vi.mocked(apiClient.post).mockRejectedValueOnce(new ApiError(500, 'server error'));

      const images: ClaudeVisionImageInput[] = [{ base64Data: 'dGVzdA==', mediaType: 'image/png' }];

      try {
        await extractWithClaudeVisionForQuantityTable(images);
        expect.fail('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(ClaudeVisionApiError);
        expect((e as ClaudeVisionApiError).errorType).toBe('unknown');
      }
    });

    it('should wrap non-ApiError as ClaudeVisionApiError', async () => {
      vi.mocked(apiClient.post).mockRejectedValueOnce(new Error('Network failed'));

      const images: ClaudeVisionImageInput[] = [{ base64Data: 'dGVzdA==', mediaType: 'image/png' }];

      try {
        await extractWithClaudeVisionForQuantityTable(images);
        expect.fail('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(ClaudeVisionApiError);
        expect((e as ClaudeVisionApiError).errorType).toBe('unknown');
        expect((e as ClaudeVisionApiError).statusCode).toBe(0);
      }
    });

    it('should wrap non-Error thrown values as ClaudeVisionApiError', async () => {
      vi.mocked(apiClient.post).mockRejectedValueOnce('string error');

      const images: ClaudeVisionImageInput[] = [{ base64Data: 'dGVzdA==', mediaType: 'image/png' }];

      try {
        await extractWithClaudeVisionForQuantityTable(images);
        expect.fail('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(ClaudeVisionApiError);
        expect((e as ClaudeVisionApiError).message).toBe('Unknown error');
        expect((e as ClaudeVisionApiError).statusCode).toBe(0);
      }
    });
  });

  describe('ClaudeVisionApiError', () => {
    it('should have errorType, statusCode, and shouldFallback properties', () => {
      const err = new ClaudeVisionApiError('test error', 'timeout', 504);
      expect(err.errorType).toBe('timeout');
      expect(err.statusCode).toBe(504);
      expect(err.shouldFallback).toBe(true);
      expect(err.message).toBe('test error');
      expect(err.name).toBe('ClaudeVisionApiError');
    });

    it('should return shouldFallback true for all error types', () => {
      const types = [
        'timeout',
        'rate_limit',
        'auth_error',
        'parse_error',
        'service_unavailable',
        'unknown',
      ] as const;
      for (const type of types) {
        const err = new ClaudeVisionApiError('test', type, 500);
        expect(err.shouldFallback).toBe(true);
      }
    });
  });
});
