/**
 * @fileoverview 受領見積書・ステータス管理バリデーションスキーマのテスト（改訂版: Task 20.2）
 *
 * TDD: RED phase - テストを先に書く
 *
 * Requirements:
 * - 11.10: バリデーションエラー表示
 * - 12.9: ステータス遷移のバリデーション
 *
 * Task 13.1: Zodバリデーションスキーマの定義
 * Task 20.2: contentType/textContent廃止対応
 *
 * @module __tests__/unit/schemas/received-quotation.schema
 */

import { describe, it, expect } from 'vitest';
import {
  createReceivedQuotationSchema,
  updateReceivedQuotationSchema,
  receivedQuotationIdParamSchema,
  deleteReceivedQuotationBodySchema,
  statusTransitionSchema,
  RECEIVED_QUOTATION_VALIDATION_MESSAGES,
} from '../../../schemas/received-quotation.schema.js';

describe('received-quotation.schema', () => {
  const validUUID = '550e8400-e29b-41d4-a716-446655440000';

  describe('createReceivedQuotationSchema', () => {
    describe('name field', () => {
      it('should accept valid name', () => {
        const input = {
          name: 'テスト受領見積書',
          submittedAt: '2024-01-15T00:00:00.000Z',
        };

        const result = createReceivedQuotationSchema.safeParse(input);

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.name).toBe('テスト受領見積書');
        }
      });

      it('should reject empty name', () => {
        const input = {
          name: '',
          submittedAt: '2024-01-15T00:00:00.000Z',
        };

        const result = createReceivedQuotationSchema.safeParse(input);

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0]!.message).toBe(
            RECEIVED_QUOTATION_VALIDATION_MESSAGES.NAME_REQUIRED
          );
        }
      });

      it('should reject name exceeding 200 characters', () => {
        const input = {
          name: 'a'.repeat(201),
          submittedAt: '2024-01-15T00:00:00.000Z',
        };

        const result = createReceivedQuotationSchema.safeParse(input);

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0]!.message).toBe(
            RECEIVED_QUOTATION_VALIDATION_MESSAGES.NAME_TOO_LONG
          );
        }
      });

      it('should reject whitespace-only name', () => {
        const input = {
          name: '   ',
          submittedAt: '2024-01-15T00:00:00.000Z',
        };

        const result = createReceivedQuotationSchema.safeParse(input);

        expect(result.success).toBe(false);
      });
    });

    describe('submittedAt field', () => {
      it('should accept valid ISO datetime', () => {
        const input = {
          name: 'テスト受領見積書',
          submittedAt: '2024-01-15T00:00:00.000Z',
        };

        const result = createReceivedQuotationSchema.safeParse(input);

        expect(result.success).toBe(true);
      });

      it('should reject invalid datetime format', () => {
        const input = {
          name: 'テスト受領見積書',
          submittedAt: 'not-a-date',
        };

        const result = createReceivedQuotationSchema.safeParse(input);

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0]!.message).toBe(
            RECEIVED_QUOTATION_VALIDATION_MESSAGES.SUBMITTED_AT_INVALID
          );
        }
      });
    });

    describe('simplified schema (Task 20.2: contentType/textContent removed)', () => {
      it('should accept input without contentType or textContent', () => {
        const input = {
          name: 'テスト受領見積書',
          submittedAt: '2024-01-15T00:00:00.000Z',
        };

        const result = createReceivedQuotationSchema.safeParse(input);

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data).toEqual({
            name: 'テスト受領見積書',
            submittedAt: '2024-01-15T00:00:00.000Z',
          });
        }
      });

      it('should strip unknown fields like contentType', () => {
        const input = {
          name: 'テスト受領見積書',
          submittedAt: '2024-01-15T00:00:00.000Z',
          contentType: 'TEXT',
          textContent: 'テスト内容',
        };

        const result = createReceivedQuotationSchema.safeParse(input);

        // Zod strips unknown fields by default
        expect(result.success).toBe(true);
        if (result.success) {
          expect('contentType' in result.data).toBe(false);
          expect('textContent' in result.data).toBe(false);
        }
      });
    });
  });

  describe('updateReceivedQuotationSchema', () => {
    it('should accept partial update with only name', () => {
      const input = {
        name: '更新後の名前',
        expectedUpdatedAt: '2024-01-15T00:00:00.000Z',
      };

      const result = updateReceivedQuotationSchema.safeParse(input);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBe('更新後の名前');
      }
    });

    it('should accept partial update with only submittedAt', () => {
      const input = {
        submittedAt: '2024-01-20T00:00:00.000Z',
        expectedUpdatedAt: '2024-01-15T00:00:00.000Z',
      };

      const result = updateReceivedQuotationSchema.safeParse(input);

      expect(result.success).toBe(true);
    });

    it('should require expectedUpdatedAt for optimistic locking', () => {
      const input = {
        name: '更新後の名前',
      };

      const result = updateReceivedQuotationSchema.safeParse(input);

      expect(result.success).toBe(false);
    });

    it('should accept removeFile flag (Task 20.2)', () => {
      const input = {
        removeFile: true,
        expectedUpdatedAt: '2024-01-15T00:00:00.000Z',
      };

      const result = updateReceivedQuotationSchema.safeParse(input);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.removeFile).toBe(true);
      }
    });
  });

  describe('receivedQuotationIdParamSchema', () => {
    it('should accept valid UUID', () => {
      const input = { id: validUUID };

      const result = receivedQuotationIdParamSchema.safeParse(input);

      expect(result.success).toBe(true);
    });

    it('should reject invalid UUID', () => {
      const input = { id: 'invalid-uuid' };

      const result = receivedQuotationIdParamSchema.safeParse(input);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]!.message).toBe(
          RECEIVED_QUOTATION_VALIDATION_MESSAGES.ID_INVALID_UUID
        );
      }
    });

    it('should reject empty id', () => {
      const input = { id: '' };

      const result = receivedQuotationIdParamSchema.safeParse(input);

      expect(result.success).toBe(false);
    });
  });

  describe('deleteReceivedQuotationBodySchema', () => {
    it('should accept valid updatedAt', () => {
      const input = { updatedAt: '2024-01-15T00:00:00.000Z' };

      const result = deleteReceivedQuotationBodySchema.safeParse(input);

      expect(result.success).toBe(true);
    });

    it('should reject missing updatedAt', () => {
      const input = {};

      const result = deleteReceivedQuotationBodySchema.safeParse(input);

      expect(result.success).toBe(false);
    });

    it('should reject invalid datetime format', () => {
      const input = { updatedAt: 'not-a-date' };

      const result = deleteReceivedQuotationBodySchema.safeParse(input);

      expect(result.success).toBe(false);
    });
  });

  describe('statusTransitionSchema', () => {
    it('should accept valid status BEFORE_REQUEST', () => {
      const input = { status: 'BEFORE_REQUEST' };

      const result = statusTransitionSchema.safeParse(input);

      expect(result.success).toBe(true);
    });

    it('should accept valid status REQUESTED', () => {
      const input = { status: 'REQUESTED' };

      const result = statusTransitionSchema.safeParse(input);

      expect(result.success).toBe(true);
    });

    it('should accept valid status QUOTATION_RECEIVED', () => {
      const input = { status: 'QUOTATION_RECEIVED' };

      const result = statusTransitionSchema.safeParse(input);

      expect(result.success).toBe(true);
    });

    it('should reject invalid status', () => {
      const input = { status: 'INVALID_STATUS' };

      const result = statusTransitionSchema.safeParse(input);

      expect(result.success).toBe(false);
    });

    it('should reject empty status', () => {
      const input = { status: '' };

      const result = statusTransitionSchema.safeParse(input);

      expect(result.success).toBe(false);
    });
  });
});
