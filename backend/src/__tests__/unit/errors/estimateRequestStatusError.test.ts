/**
 * @fileoverview 見積依頼ステータスエラークラスのユニットテスト
 *
 * @module tests/unit/errors/estimateRequestStatusError
 */

import { describe, it, expect } from 'vitest';
import {
  EstimateRequestStatusNotFoundError,
  InvalidEstimateRequestStatusTransitionError,
} from '../../../errors/estimateRequestStatusError.js';
import { ApiError, NotFoundError } from '../../../errors/apiError.js';
import { PROBLEM_TYPES } from '../../../types/problem-details.js';

describe('estimateRequestStatusError', () => {
  describe('EstimateRequestStatusNotFoundError', () => {
    it('正しいプロパティを持つ', () => {
      const error = new EstimateRequestStatusNotFoundError('er-001');

      expect(error).toBeInstanceOf(NotFoundError);
      expect(error).toBeInstanceOf(ApiError);
      expect(error.name).toBe('EstimateRequestStatusNotFoundError');
      expect(error.statusCode).toBe(404);
      expect(error.code).toBe('ESTIMATE_REQUEST_STATUS_NOT_FOUND');
      expect(error.message).toContain('er-001');
      expect(error.message).toContain('見積依頼が見つかりません');
    });
  });

  describe('InvalidEstimateRequestStatusTransitionError', () => {
    it('許可された遷移がある場合、正しいプロパティを持つ', () => {
      const error = new InvalidEstimateRequestStatusTransitionError(
        'BEFORE_REQUEST',
        'QUOTATION_RECEIVED',
        [{ status: 'REQUESTED' }]
      );

      expect(error).toBeInstanceOf(ApiError);
      expect(error.name).toBe('InvalidEstimateRequestStatusTransitionError');
      expect(error.statusCode).toBe(400);
      expect(error.code).toBe('INVALID_STATUS_TRANSITION');
      expect(error.message).toContain('BEFORE_REQUEST');
      expect(error.message).toContain('QUOTATION_RECEIVED');
      expect(error.message).toContain('REQUESTED');
      expect(error.details).toEqual({
        fromStatus: 'BEFORE_REQUEST',
        toStatus: 'QUOTATION_RECEIVED',
        allowedTransitions: ['REQUESTED'],
      });
      expect(error.problemType).toBe(PROBLEM_TYPES.BUSINESS_RULE_VIOLATION);
    });

    it('許可された遷移が複数ある場合、すべて表示される', () => {
      const error = new InvalidEstimateRequestStatusTransitionError('REQUESTED', 'BEFORE_REQUEST', [
        { status: 'QUOTATION_RECEIVED' },
        { status: 'REQUESTED' },
      ]);

      expect(error.message).toContain('QUOTATION_RECEIVED');
      expect(error.message).toContain('REQUESTED');
      expect(error.details).toEqual({
        fromStatus: 'REQUESTED',
        toStatus: 'BEFORE_REQUEST',
        allowedTransitions: ['QUOTATION_RECEIVED', 'REQUESTED'],
      });
    });

    it('許可された遷移がない場合、「なし」と表示される', () => {
      const error = new InvalidEstimateRequestStatusTransitionError(
        'QUOTATION_RECEIVED',
        'BEFORE_REQUEST',
        []
      );

      expect(error.message).toContain('なし');
      expect(error.details).toEqual({
        fromStatus: 'QUOTATION_RECEIVED',
        toStatus: 'BEFORE_REQUEST',
        allowedTransitions: [],
      });
    });
  });
});
