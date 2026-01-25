/**
 * @fileoverview 見積依頼バリデーションスキーマのテスト
 *
 * TDD: RED phase - テストを先に書く
 *
 * Requirements:
 * - 3.7: バリデーションエラー表示
 * - 4.8: 見積依頼方法のラジオボタン（メール/FAX）
 *
 * @module __tests__/unit/schemas/estimate-request.schema
 */

import { describe, it, expect } from 'vitest';
import {
  createEstimateRequestSchema,
  updateEstimateRequestSchema,
  updateItemSelectionSchema,
  estimateRequestIdParamSchema,
  estimateRequestListQuerySchema,
  ESTIMATE_REQUEST_VALIDATION_MESSAGES,
  ESTIMATE_REQUEST_METHODS,
} from '../../../schemas/estimate-request.schema.js';

describe('estimate-request.schema', () => {
  describe('ESTIMATE_REQUEST_METHODS', () => {
    it('should define EMAIL and FAX methods', () => {
      expect(ESTIMATE_REQUEST_METHODS).toEqual(['EMAIL', 'FAX']);
    });
  });

  describe('createEstimateRequestSchema', () => {
    const validInput = {
      name: '見積依頼テスト',
      tradingPartnerId: '550e8400-e29b-41d4-a716-446655440000',
      itemizedStatementId: '550e8400-e29b-41d4-a716-446655440001',
    };

    describe('name field', () => {
      it('should accept valid name', () => {
        const result = createEstimateRequestSchema.safeParse(validInput);
        expect(result.success).toBe(true);
      });

      it('should reject empty name', () => {
        const result = createEstimateRequestSchema.safeParse({
          ...validInput,
          name: '',
        });
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0]!.message).toBe(
            ESTIMATE_REQUEST_VALIDATION_MESSAGES.NAME_REQUIRED
          );
        }
      });

      it('should reject whitespace-only name', () => {
        const result = createEstimateRequestSchema.safeParse({
          ...validInput,
          name: '   ',
        });
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0]!.message).toBe(
            ESTIMATE_REQUEST_VALIDATION_MESSAGES.NAME_REQUIRED
          );
        }
      });

      it('should reject name exceeding 200 characters', () => {
        const result = createEstimateRequestSchema.safeParse({
          ...validInput,
          name: 'a'.repeat(201),
        });
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0]!.message).toBe(
            ESTIMATE_REQUEST_VALIDATION_MESSAGES.NAME_TOO_LONG
          );
        }
      });

      it('should accept name with exactly 200 characters', () => {
        const result = createEstimateRequestSchema.safeParse({
          ...validInput,
          name: 'a'.repeat(200),
        });
        expect(result.success).toBe(true);
      });
    });

    describe('tradingPartnerId field', () => {
      it('should accept valid UUID', () => {
        const result = createEstimateRequestSchema.safeParse(validInput);
        expect(result.success).toBe(true);
      });

      it('should reject invalid UUID format', () => {
        const result = createEstimateRequestSchema.safeParse({
          ...validInput,
          tradingPartnerId: 'invalid-uuid',
        });
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0]!.message).toBe(
            ESTIMATE_REQUEST_VALIDATION_MESSAGES.TRADING_PARTNER_ID_INVALID_UUID
          );
        }
      });

      it('should reject missing tradingPartnerId', () => {
        const { tradingPartnerId: _unused, ...withoutTradingPartnerId } = validInput;
        const result = createEstimateRequestSchema.safeParse(withoutTradingPartnerId);
        expect(result.success).toBe(false);
      });
    });

    describe('itemizedStatementId field', () => {
      it('should accept valid UUID', () => {
        const result = createEstimateRequestSchema.safeParse(validInput);
        expect(result.success).toBe(true);
      });

      it('should reject invalid UUID format', () => {
        const result = createEstimateRequestSchema.safeParse({
          ...validInput,
          itemizedStatementId: 'invalid-uuid',
        });
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0]!.message).toBe(
            ESTIMATE_REQUEST_VALIDATION_MESSAGES.ITEMIZED_STATEMENT_ID_INVALID_UUID
          );
        }
      });

      it('should reject missing itemizedStatementId', () => {
        const { itemizedStatementId: _unused, ...withoutItemizedStatementId } = validInput;
        const result = createEstimateRequestSchema.safeParse(withoutItemizedStatementId);
        expect(result.success).toBe(false);
      });
    });

    describe('method field', () => {
      it('should default to EMAIL when not provided', () => {
        const result = createEstimateRequestSchema.safeParse(validInput);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.method).toBe('EMAIL');
        }
      });

      it('should accept EMAIL method', () => {
        const result = createEstimateRequestSchema.safeParse({
          ...validInput,
          method: 'EMAIL',
        });
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.method).toBe('EMAIL');
        }
      });

      it('should accept FAX method', () => {
        const result = createEstimateRequestSchema.safeParse({
          ...validInput,
          method: 'FAX',
        });
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.method).toBe('FAX');
        }
      });

      it('should reject invalid method', () => {
        const result = createEstimateRequestSchema.safeParse({
          ...validInput,
          method: 'INVALID',
        });
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0]!.message).toBe(
            ESTIMATE_REQUEST_VALIDATION_MESSAGES.METHOD_INVALID
          );
        }
      });
    });

    describe('includeBreakdownInBody field', () => {
      it('should default to false when not provided', () => {
        const result = createEstimateRequestSchema.safeParse(validInput);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.includeBreakdownInBody).toBe(false);
        }
      });

      it('should accept true value', () => {
        const result = createEstimateRequestSchema.safeParse({
          ...validInput,
          includeBreakdownInBody: true,
        });
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.includeBreakdownInBody).toBe(true);
        }
      });

      it('should accept false value', () => {
        const result = createEstimateRequestSchema.safeParse({
          ...validInput,
          includeBreakdownInBody: false,
        });
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.includeBreakdownInBody).toBe(false);
        }
      });
    });
  });

  describe('updateEstimateRequestSchema', () => {
    const validUpdate = {
      name: '更新後の見積依頼名',
      expectedUpdatedAt: '2024-01-01T00:00:00.000Z',
    };

    describe('name field', () => {
      it('should accept valid name', () => {
        const result = updateEstimateRequestSchema.safeParse(validUpdate);
        expect(result.success).toBe(true);
      });

      it('should accept update without name (optional)', () => {
        const result = updateEstimateRequestSchema.safeParse({
          expectedUpdatedAt: '2024-01-01T00:00:00.000Z',
        });
        expect(result.success).toBe(true);
      });

      it('should reject name exceeding 200 characters', () => {
        const result = updateEstimateRequestSchema.safeParse({
          ...validUpdate,
          name: 'a'.repeat(201),
        });
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0]!.message).toBe(
            ESTIMATE_REQUEST_VALIDATION_MESSAGES.NAME_TOO_LONG
          );
        }
      });
    });

    describe('method field', () => {
      it('should accept EMAIL method', () => {
        const result = updateEstimateRequestSchema.safeParse({
          ...validUpdate,
          method: 'EMAIL',
        });
        expect(result.success).toBe(true);
      });

      it('should accept FAX method', () => {
        const result = updateEstimateRequestSchema.safeParse({
          ...validUpdate,
          method: 'FAX',
        });
        expect(result.success).toBe(true);
      });

      it('should reject invalid method', () => {
        const result = updateEstimateRequestSchema.safeParse({
          ...validUpdate,
          method: 'INVALID',
        });
        expect(result.success).toBe(false);
      });
    });

    describe('includeBreakdownInBody field', () => {
      it('should accept true value', () => {
        const result = updateEstimateRequestSchema.safeParse({
          ...validUpdate,
          includeBreakdownInBody: true,
        });
        expect(result.success).toBe(true);
      });
    });

    describe('expectedUpdatedAt field', () => {
      it('should require expectedUpdatedAt', () => {
        const result = updateEstimateRequestSchema.safeParse({ name: 'test' });
        expect(result.success).toBe(false);
      });

      it('should accept valid ISO8601 datetime', () => {
        const result = updateEstimateRequestSchema.safeParse({
          expectedUpdatedAt: '2024-01-01T00:00:00.000Z',
        });
        expect(result.success).toBe(true);
      });

      it('should reject invalid datetime format', () => {
        const result = updateEstimateRequestSchema.safeParse({
          expectedUpdatedAt: 'invalid-date',
        });
        expect(result.success).toBe(false);
      });
    });
  });

  describe('updateItemSelectionSchema', () => {
    it('should accept valid item selections', () => {
      const result = updateItemSelectionSchema.safeParse({
        items: [
          { itemId: '550e8400-e29b-41d4-a716-446655440000', selected: true },
          { itemId: '550e8400-e29b-41d4-a716-446655440001', selected: false },
        ],
      });
      expect(result.success).toBe(true);
    });

    it('should reject empty items array', () => {
      const result = updateItemSelectionSchema.safeParse({ items: [] });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]!.message).toBe(
          ESTIMATE_REQUEST_VALIDATION_MESSAGES.ITEMS_REQUIRED
        );
      }
    });

    it('should reject invalid item UUID', () => {
      const result = updateItemSelectionSchema.safeParse({
        items: [{ itemId: 'invalid-uuid', selected: true }],
      });
      expect(result.success).toBe(false);
    });

    it('should reject non-boolean selected value', () => {
      const result = updateItemSelectionSchema.safeParse({
        items: [{ itemId: '550e8400-e29b-41d4-a716-446655440000', selected: 'yes' }],
      });
      expect(result.success).toBe(false);
    });
  });

  describe('estimateRequestIdParamSchema', () => {
    it('should accept valid UUID', () => {
      const result = estimateRequestIdParamSchema.safeParse({
        id: '550e8400-e29b-41d4-a716-446655440000',
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid UUID', () => {
      const result = estimateRequestIdParamSchema.safeParse({
        id: 'invalid-uuid',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]!.message).toBe(
          ESTIMATE_REQUEST_VALIDATION_MESSAGES.ID_INVALID_UUID
        );
      }
    });

    it('should reject missing id', () => {
      const result = estimateRequestIdParamSchema.safeParse({});
      expect(result.success).toBe(false);
    });
  });

  describe('estimateRequestListQuerySchema', () => {
    it('should accept empty query (use defaults)', () => {
      const result = estimateRequestListQuerySchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.page).toBe(1);
        expect(result.data.limit).toBe(20);
      }
    });

    it('should accept valid pagination parameters', () => {
      const result = estimateRequestListQuerySchema.safeParse({
        page: '2',
        limit: '10',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.page).toBe(2);
        expect(result.data.limit).toBe(10);
      }
    });

    it('should reject page less than 1', () => {
      const result = estimateRequestListQuerySchema.safeParse({
        page: '0',
      });
      expect(result.success).toBe(false);
    });

    it('should reject limit greater than 100', () => {
      const result = estimateRequestListQuerySchema.safeParse({
        limit: '101',
      });
      expect(result.success).toBe(false);
    });
  });
});
