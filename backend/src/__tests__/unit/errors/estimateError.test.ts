/**
 * @fileoverview 見積書エラークラスのユニットテスト
 *
 * @module tests/unit/errors/estimateError
 */

import { describe, it, expect } from 'vitest';
import {
  EstimateNotFoundError,
  EstimateItemNotFoundError,
  EstimateConflictError,
  DuplicateEstimateNameError,
  EstimateItemHasChildrenError,
  ReceivedQuotationLineItemNotFoundError,
  EstimateItemNotBelongToEstimateError,
} from '../../../errors/estimateError.js';
import { ApiError, NotFoundError } from '../../../errors/apiError.js';

describe('estimateError', () => {
  describe('EstimateNotFoundError', () => {
    it('正しいプロパティを持つ', () => {
      const error = new EstimateNotFoundError('est-001');

      expect(error).toBeInstanceOf(NotFoundError);
      expect(error).toBeInstanceOf(ApiError);
      expect(error.name).toBe('EstimateNotFoundError');
      expect(error.statusCode).toBe(404);
      expect(error.code).toBe('ESTIMATE_NOT_FOUND');
      expect(error.message).toContain('est-001');
    });
  });

  describe('EstimateItemNotFoundError', () => {
    it('正しいプロパティを持つ', () => {
      const error = new EstimateItemNotFoundError('item-001');

      expect(error).toBeInstanceOf(NotFoundError);
      expect(error).toBeInstanceOf(ApiError);
      expect(error.name).toBe('EstimateItemNotFoundError');
      expect(error.statusCode).toBe(404);
      expect(error.code).toBe('ESTIMATE_ITEM_NOT_FOUND');
      expect(error.message).toContain('item-001');
    });
  });

  describe('EstimateConflictError', () => {
    it('正しいプロパティを持つ', () => {
      const conflictDetails = {
        expectedUpdatedAt: '2024-01-01T00:00:00Z',
        actualUpdatedAt: '2024-01-02T00:00:00Z',
      };
      const error = new EstimateConflictError(conflictDetails);

      expect(error).toBeInstanceOf(ApiError);
      expect(error.name).toBe('EstimateConflictError');
      expect(error.statusCode).toBe(409);
      expect(error.code).toBe('ESTIMATE_CONFLICT');
      expect(error.details).toEqual(conflictDetails);
    });

    it('詳細なしでも作成できる', () => {
      const error = new EstimateConflictError();

      expect(error.statusCode).toBe(409);
      expect(error.code).toBe('ESTIMATE_CONFLICT');
    });
  });

  describe('DuplicateEstimateNameError', () => {
    it('正しいプロパティを持つ', () => {
      const error = new DuplicateEstimateNameError('重複見積書', 'proj-001');

      expect(error).toBeInstanceOf(ApiError);
      expect(error.name).toBe('DuplicateEstimateNameError');
      expect(error.statusCode).toBe(409);
      expect(error.code).toBe('DUPLICATE_ESTIMATE_NAME');
      expect(error.duplicateName).toBe('重複見積書');
      expect(error.projectId).toBe('proj-001');
      expect(error.details).toEqual({
        name: '重複見積書',
        projectId: 'proj-001',
      });
    });
  });

  describe('EstimateItemHasChildrenError', () => {
    it('正しいプロパティを持つ', () => {
      const error = new EstimateItemHasChildrenError('item-001', 5);

      expect(error).toBeInstanceOf(ApiError);
      expect(error.name).toBe('EstimateItemHasChildrenError');
      expect(error.statusCode).toBe(422);
      expect(error.code).toBe('ESTIMATE_ITEM_HAS_CHILDREN');
      expect(error.message).toContain('5件');
      expect(error.details).toEqual({
        estimateItemId: 'item-001',
        childCount: 5,
      });
    });
  });

  describe('ReceivedQuotationLineItemNotFoundError', () => {
    it('正しいプロパティを持つ', () => {
      const error = new ReceivedQuotationLineItemNotFoundError('line-001');

      expect(error).toBeInstanceOf(NotFoundError);
      expect(error).toBeInstanceOf(ApiError);
      expect(error.name).toBe('ReceivedQuotationLineItemNotFoundError');
      expect(error.statusCode).toBe(404);
      expect(error.code).toBe('RECEIVED_QUOTATION_LINE_ITEM_NOT_FOUND');
      expect(error.message).toContain('line-001');
    });
  });

  describe('EstimateItemNotBelongToEstimateError', () => {
    it('正しいプロパティを持つ', () => {
      const error = new EstimateItemNotBelongToEstimateError('item-001', 'est-001');

      expect(error).toBeInstanceOf(ApiError);
      expect(error.name).toBe('EstimateItemNotBelongToEstimateError');
      expect(error.statusCode).toBe(400);
      expect(error.code).toBe('ESTIMATE_ITEM_NOT_BELONG_TO_ESTIMATE');
      expect(error.details).toEqual({
        estimateItemId: 'item-001',
        estimateId: 'est-001',
      });
    });
  });
});
