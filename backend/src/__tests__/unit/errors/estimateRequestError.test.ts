/**
 * @fileoverview 見積依頼エラークラスのユニットテスト
 *
 * @module tests/unit/errors/estimateRequestError
 */

import { describe, it, expect } from 'vitest';
import {
  EstimateRequestNotFoundError,
  EstimateRequestConflictError,
  NoSubcontractorTradingPartnerError,
  TradingPartnerNotSubcontractorError,
  NoItemizedStatementInProjectError,
  EmptyItemizedStatementItemsError,
  NoItemsSelectedError,
  MissingContactInfoError,
  ItemizedStatementHasEstimateRequestsError,
} from '../../../errors/estimateRequestError.js';
import { ApiError, NotFoundError } from '../../../errors/apiError.js';

describe('estimateRequestError', () => {
  describe('EstimateRequestNotFoundError', () => {
    it('正しいプロパティを持つ', () => {
      const error = new EstimateRequestNotFoundError('er-001');

      expect(error).toBeInstanceOf(NotFoundError);
      expect(error).toBeInstanceOf(ApiError);
      expect(error.name).toBe('EstimateRequestNotFoundError');
      expect(error.statusCode).toBe(404);
      expect(error.code).toBe('ESTIMATE_REQUEST_NOT_FOUND');
      expect(error.message).toContain('er-001');
    });
  });

  describe('EstimateRequestConflictError', () => {
    it('正しいプロパティを持つ', () => {
      const error = new EstimateRequestConflictError({
        expectedUpdatedAt: '2024-01-01T00:00:00Z',
        actualUpdatedAt: '2024-01-02T00:00:00Z',
      });

      expect(error).toBeInstanceOf(ApiError);
      expect(error.name).toBe('EstimateRequestConflictError');
      expect(error.statusCode).toBe(409);
      expect(error.code).toBe('ESTIMATE_REQUEST_CONFLICT');
      expect(error.details).toEqual({
        expectedUpdatedAt: '2024-01-01T00:00:00Z',
        actualUpdatedAt: '2024-01-02T00:00:00Z',
      });
    });

    it('詳細なしでも作成できる', () => {
      const error = new EstimateRequestConflictError();

      expect(error.statusCode).toBe(409);
      expect(error.code).toBe('ESTIMATE_REQUEST_CONFLICT');
    });
  });

  describe('NoSubcontractorTradingPartnerError', () => {
    it('正しいプロパティを持つ', () => {
      const error = new NoSubcontractorTradingPartnerError();

      expect(error).toBeInstanceOf(ApiError);
      expect(error.name).toBe('NoSubcontractorTradingPartnerError');
      expect(error.statusCode).toBe(422);
      expect(error.code).toBe('NO_SUBCONTRACTOR_TRADING_PARTNER');
      expect(error.message).toContain('協力業者');
    });
  });

  describe('TradingPartnerNotSubcontractorError', () => {
    it('正しいプロパティを持つ', () => {
      const error = new TradingPartnerNotSubcontractorError('tp-001');

      expect(error).toBeInstanceOf(ApiError);
      expect(error.name).toBe('TradingPartnerNotSubcontractorError');
      expect(error.statusCode).toBe(422);
      expect(error.code).toBe('TRADING_PARTNER_NOT_SUBCONTRACTOR');
      expect(error.details).toEqual({ tradingPartnerId: 'tp-001' });
    });
  });

  describe('NoItemizedStatementInProjectError', () => {
    it('正しいプロパティを持つ', () => {
      const error = new NoItemizedStatementInProjectError('proj-001');

      expect(error).toBeInstanceOf(ApiError);
      expect(error.name).toBe('NoItemizedStatementInProjectError');
      expect(error.statusCode).toBe(422);
      expect(error.code).toBe('NO_ITEMIZED_STATEMENT_IN_PROJECT');
      expect(error.details).toEqual({ projectId: 'proj-001' });
    });
  });

  describe('EmptyItemizedStatementItemsError', () => {
    it('正しいプロパティを持つ', () => {
      const error = new EmptyItemizedStatementItemsError('is-001');

      expect(error).toBeInstanceOf(ApiError);
      expect(error.name).toBe('EmptyItemizedStatementItemsError');
      expect(error.statusCode).toBe(422);
      expect(error.code).toBe('EMPTY_ITEMIZED_STATEMENT_ITEMS');
      expect(error.details).toEqual({ itemizedStatementId: 'is-001' });
    });
  });

  describe('NoItemsSelectedError', () => {
    it('正しいプロパティを持つ', () => {
      const error = new NoItemsSelectedError('er-001');

      expect(error).toBeInstanceOf(ApiError);
      expect(error.name).toBe('NoItemsSelectedError');
      expect(error.statusCode).toBe(422);
      expect(error.code).toBe('NO_ITEMS_SELECTED');
      expect(error.details).toEqual({ estimateRequestId: 'er-001' });
    });
  });

  describe('MissingContactInfoError', () => {
    it('メール未登録の場合、正しいプロパティを持つ', () => {
      const error = new MissingContactInfoError('email', 'tp-001');

      expect(error).toBeInstanceOf(ApiError);
      expect(error.name).toBe('MissingContactInfoError');
      expect(error.statusCode).toBe(422);
      expect(error.code).toBe('MISSING_CONTACT_INFO');
      expect(error.contactType).toBe('email');
      expect(error.tradingPartnerId).toBe('tp-001');
      expect(error.message).toContain('メールアドレス');
    });

    it('FAX番号未登録の場合、正しいプロパティを持つ', () => {
      const error = new MissingContactInfoError('fax', 'tp-002');

      expect(error.contactType).toBe('fax');
      expect(error.tradingPartnerId).toBe('tp-002');
      expect(error.message).toContain('FAX番号');
    });
  });

  describe('ItemizedStatementHasEstimateRequestsError', () => {
    it('正しいプロパティを持つ', () => {
      const error = new ItemizedStatementHasEstimateRequestsError('is-001', 3);

      expect(error).toBeInstanceOf(ApiError);
      expect(error.name).toBe('ItemizedStatementHasEstimateRequestsError');
      expect(error.statusCode).toBe(409);
      expect(error.code).toBe('ITEMIZED_STATEMENT_HAS_ESTIMATE_REQUESTS');
      expect(error.details).toEqual({
        itemizedStatementId: 'is-001',
        estimateRequestCount: 3,
      });
    });
  });
});
