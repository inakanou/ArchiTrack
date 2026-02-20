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

import { describe, it, expect, beforeAll } from 'vitest';
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

    // ================================================================
    // Task 61.1: createReceivedQuotationSchemaにnetAmountフィールドを追加
    // Requirements: 28.7 (NET金額は任意入力), 28.10 (NET金額のDB永続化)
    // ================================================================
    describe('netAmount field (Task 61.1)', () => {
      it('should accept netAmount as number', () => {
        const input = {
          name: 'テスト受領見積書',
          submittedAt: '2024-01-15T00:00:00.000Z',
          netAmount: 500000,
        };

        const result = createReceivedQuotationSchema.safeParse(input);

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.netAmount).toBe(500000);
        }
      });

      it('should accept netAmount as null', () => {
        const input = {
          name: 'テスト受領見積書',
          submittedAt: '2024-01-15T00:00:00.000Z',
          netAmount: null,
        };

        const result = createReceivedQuotationSchema.safeParse(input);

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.netAmount).toBeNull();
        }
      });

      it('should accept omitted netAmount (optional)', () => {
        const input = {
          name: 'テスト受領見積書',
          submittedAt: '2024-01-15T00:00:00.000Z',
        };

        const result = createReceivedQuotationSchema.safeParse(input);

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.netAmount).toBeUndefined();
        }
      });

      it('should reject netAmount as non-number string', () => {
        const input = {
          name: 'テスト受領見積書',
          submittedAt: '2024-01-15T00:00:00.000Z',
          netAmount: 'abc',
        };

        const result = createReceivedQuotationSchema.safeParse(input);

        expect(result.success).toBe(false);
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

    // ================================================================
    // Task 61.1: updateReceivedQuotationSchemaにnetAmountフィールドを追加
    // Requirements: 28.7 (NET金額は任意入力), 28.10 (NET金額のDB永続化)
    // ================================================================
    it('should accept netAmount in update schema (Task 61.1)', () => {
      const input = {
        netAmount: 300000,
        expectedUpdatedAt: '2024-01-15T00:00:00.000Z',
      };

      const result = updateReceivedQuotationSchema.safeParse(input);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.netAmount).toBe(300000);
      }
    });

    it('should accept null netAmount in update schema (Task 61.1)', () => {
      const input = {
        netAmount: null,
        expectedUpdatedAt: '2024-01-15T00:00:00.000Z',
      };

      const result = updateReceivedQuotationSchema.safeParse(input);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.netAmount).toBeNull();
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

  /**
   * Task 21.2: 明細行バリデーションスキーマのテスト
   *
   * Requirements:
   * - 11.10: 明細行データのバリデーション
   * - 11.22: ファイルまたは明細行データのいずれかが必須
   * - 11.23: 必須項目バリデーション
   * - 11.24: ファイルも明細行もない場合のバリデーションエラー
   */
  describe('lineItemSchema (Task 21.2)', () => {
    // lineItemSchemaをインポートするため、テスト内で動的にインポート
    let lineItemSchema: (typeof import('../../../schemas/received-quotation.schema.js'))['lineItemSchema'];
    let lineItemsArraySchema: (typeof import('../../../schemas/received-quotation.schema.js'))['lineItemsArraySchema'];
    let parseLineItemsFromMultipart: (typeof import('../../../schemas/received-quotation.schema.js'))['parseLineItemsFromMultipart'];
    let validateFileOrLineItemsRequired: (typeof import('../../../schemas/received-quotation.schema.js'))['validateFileOrLineItemsRequired'];
    let LINE_ITEM_VALIDATION_MESSAGES: (typeof import('../../../schemas/received-quotation.schema.js'))['LINE_ITEM_VALIDATION_MESSAGES'];

    beforeAll(async () => {
      const mod = await import('../../../schemas/received-quotation.schema.js');
      lineItemSchema = mod.lineItemSchema;
      lineItemsArraySchema = mod.lineItemsArraySchema;
      parseLineItemsFromMultipart = mod.parseLineItemsFromMultipart;
      validateFileOrLineItemsRequired = mod.validateFileOrLineItemsRequired;
      LINE_ITEM_VALIDATION_MESSAGES = mod.LINE_ITEM_VALIDATION_MESSAGES;
    });

    describe('lineItemSchema', () => {
      it('名称が必須であること（Requirements: 11.10）', () => {
        const input = {
          sortOrder: 0,
          specification: '規格A',
          unit: '個',
          quantity: 10,
          unitPrice: 1000,
          amount: 10000,
        };

        const result = lineItemSchema.safeParse(input);

        expect(result.success).toBe(false);
      });

      it('名称が空文字の場合にバリデーションエラーとなること', () => {
        const input = {
          name: '',
          sortOrder: 0,
        };

        const result = lineItemSchema.safeParse(input);

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0]!.message).toBe(LINE_ITEM_VALIDATION_MESSAGES.NAME_REQUIRED);
        }
      });

      it('有効な明細行データを受け入れること', () => {
        const input = {
          name: 'テスト項目',
          sortOrder: 0,
          specification: '規格A',
          unit: '個',
          quantity: 10,
          unitPrice: 1000,
          amount: 10000,
          remarks: '備考',
        };

        const result = lineItemSchema.safeParse(input);

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.name).toBe('テスト項目');
          expect(result.data.quantity).toBe(10);
          expect(result.data.unitPrice).toBe(1000);
          expect(result.data.amount).toBe(10000);
        }
      });

      it('任意フィールドが省略可能であること', () => {
        const input = {
          name: 'テスト項目',
          sortOrder: 0,
        };

        const result = lineItemSchema.safeParse(input);

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.specification).toBeUndefined();
          expect(result.data.unit).toBeUndefined();
          expect(result.data.quantity).toBeUndefined();
          expect(result.data.unitPrice).toBeUndefined();
          expect(result.data.amount).toBeUndefined();
          expect(result.data.remarks).toBeUndefined();
        }
      });

      it('数量が数値型であること（Requirements: 11.10）', () => {
        const input = {
          name: 'テスト項目',
          sortOrder: 0,
          quantity: 'abc',
        };

        const result = lineItemSchema.safeParse(input);

        expect(result.success).toBe(false);
      });

      it('単価が数値型であること（Requirements: 11.10）', () => {
        const input = {
          name: 'テスト項目',
          sortOrder: 0,
          unitPrice: 'abc',
        };

        const result = lineItemSchema.safeParse(input);

        expect(result.success).toBe(false);
      });

      it('金額が数値型であること（Requirements: 11.10）', () => {
        const input = {
          name: 'テスト項目',
          sortOrder: 0,
          amount: 'abc',
        };

        const result = lineItemSchema.safeParse(input);

        expect(result.success).toBe(false);
      });

      it('sortOrderが0以上の整数であること', () => {
        const input = {
          name: 'テスト項目',
          sortOrder: -1,
        };

        const result = lineItemSchema.safeParse(input);

        expect(result.success).toBe(false);
      });

      it('nullの任意フィールドを受け入れること', () => {
        const input = {
          name: 'テスト項目',
          sortOrder: 0,
          specification: null,
          unit: null,
          quantity: null,
          unitPrice: null,
          amount: null,
          remarks: null,
        };

        const result = lineItemSchema.safeParse(input);

        expect(result.success).toBe(true);
      });

      // ================================================================
      // Task 36.4: 任意分類・工種フィールドのバリデーションテスト
      // Requirements: 11.10, 14.2
      // ================================================================
      it('customCategoryフィールドを文字列として受け入れること (Task 36.4)', () => {
        const input = {
          name: 'テスト項目',
          sortOrder: 0,
          customCategory: '仮設工事',
        };

        const result = lineItemSchema.safeParse(input);

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.customCategory).toBe('仮設工事');
        }
      });

      it('workTypeフィールドを文字列として受け入れること (Task 36.4)', () => {
        const input = {
          name: 'テスト項目',
          sortOrder: 0,
          workType: '鉄筋工事',
        };

        const result = lineItemSchema.safeParse(input);

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.workType).toBe('鉄筋工事');
        }
      });

      it('customCategoryとworkTypeがnullの場合を受け入れること (Task 36.4)', () => {
        const input = {
          name: 'テスト項目',
          sortOrder: 0,
          customCategory: null,
          workType: null,
        };

        const result = lineItemSchema.safeParse(input);

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.customCategory).toBeNull();
          expect(result.data.workType).toBeNull();
        }
      });

      it('customCategoryとworkTypeが未指定の場合を受け入れること (Task 36.4)', () => {
        const input = {
          name: 'テスト項目',
          sortOrder: 0,
        };

        const result = lineItemSchema.safeParse(input);

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.customCategory).toBeUndefined();
          expect(result.data.workType).toBeUndefined();
        }
      });

      // ================================================================
      // Task 61.1: lineItemSchemaからnetAmountフィールドが削除されたことの確認
      // Requirements: 28.5 (明細行にNET金額列を含めない)
      // ================================================================
      it('lineItemSchemaにnetAmountフィールドが含まれないこと (Task 61.1)', () => {
        // netAmountは受領見積書レベルで管理するため、明細行スキーマには含まない
        const input = {
          name: 'テスト項目',
          sortOrder: 0,
          netAmount: 50000,
        };

        const result = lineItemSchema.safeParse(input);

        // Zod strips unknown fields by default, so parse succeeds but netAmount is stripped
        expect(result.success).toBe(true);
        if (result.success) {
          expect((result.data as Record<string, unknown>)['netAmount']).toBeUndefined();
        }
      });

      it('customCategoryとworkTypeを含む完全な明細行を受け入れること (Task 36.4)', () => {
        const input = {
          name: '鉄筋D10',
          sortOrder: 0,
          customCategory: '躯体',
          workType: '鉄筋工事',
          specification: 'D10',
          unit: 'kg',
          quantity: 500,
          unitPrice: 120,
          amount: 60000,
          remarks: null,
        };

        const result = lineItemSchema.safeParse(input);

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.customCategory).toBe('躯体');
          expect(result.data.workType).toBe('鉄筋工事');
          expect(result.data.name).toBe('鉄筋D10');
        }
      });
    });

    describe('lineItemsArraySchema', () => {
      it('有効な明細行配列を受け入れること', () => {
        const input = [
          { name: '項目1', sortOrder: 0, quantity: 10, unitPrice: 1000, amount: 10000 },
          { name: '項目2', sortOrder: 1, quantity: 5, unitPrice: 2000, amount: 10000 },
        ];

        const result = lineItemsArraySchema.safeParse(input);

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data).toHaveLength(2);
        }
      });

      it('空配列を受け入れること', () => {
        const input: unknown[] = [];

        const result = lineItemsArraySchema.safeParse(input);

        expect(result.success).toBe(true);
      });

      it('無効な明細行を含む配列を拒否すること', () => {
        const input = [
          { name: '', sortOrder: 0 }, // 名称が空
        ];

        const result = lineItemsArraySchema.safeParse(input);

        expect(result.success).toBe(false);
      });
    });

    describe('parseLineItemsFromMultipart', () => {
      it('有効なJSON文字列をパースできること', () => {
        const jsonString = JSON.stringify([
          { name: '項目1', sortOrder: 0, quantity: 10, unitPrice: 1000, amount: 10000 },
        ]);

        const result = parseLineItemsFromMultipart(jsonString);

        expect(result).toHaveLength(1);
        expect(result![0]!.name).toBe('項目1');
      });

      it('undefinedの場合はundefinedを返すこと', () => {
        const result = parseLineItemsFromMultipart(undefined);

        expect(result).toBeUndefined();
      });

      it('空文字列の場合はundefinedを返すこと', () => {
        const result = parseLineItemsFromMultipart('');

        expect(result).toBeUndefined();
      });

      it('無効なJSON文字列の場合にエラーをスローすること', () => {
        expect(() => parseLineItemsFromMultipart('invalid json')).toThrow();
      });

      it('JSONパース後のバリデーションエラーでスローすること', () => {
        const jsonString = JSON.stringify([
          { sortOrder: 0 }, // 名称が欠落
        ]);

        expect(() => parseLineItemsFromMultipart(jsonString)).toThrow();
      });
    });

    describe('validateFileOrLineItemsRequired', () => {
      it('ファイルがある場合はバリデーションを通過すること（Requirements: 11.22）', () => {
        const hasFile = true;
        const lineItems = undefined;

        expect(() => validateFileOrLineItemsRequired(hasFile, lineItems)).not.toThrow();
      });

      it('明細行がある場合はバリデーションを通過すること（Requirements: 11.22）', () => {
        const hasFile = false;
        const lineItems = [{ name: '項目1', sortOrder: 0 }];

        expect(() => validateFileOrLineItemsRequired(hasFile, lineItems)).not.toThrow();
      });

      it('ファイルと明細行の両方がある場合はバリデーションを通過すること', () => {
        const hasFile = true;
        const lineItems = [{ name: '項目1', sortOrder: 0 }];

        expect(() => validateFileOrLineItemsRequired(hasFile, lineItems)).not.toThrow();
      });

      it('ファイルも明細行もない場合にエラーをスローすること（Requirements: 11.24）', () => {
        const hasFile = false;
        const lineItems = undefined;

        expect(() => validateFileOrLineItemsRequired(hasFile, lineItems)).toThrow(
          LINE_ITEM_VALIDATION_MESSAGES.FILE_OR_LINE_ITEMS_REQUIRED
        );
      });

      it('空の明細行配列の場合にエラーをスローすること（Requirements: 11.24）', () => {
        const hasFile = false;
        const lineItems: Parameters<typeof validateFileOrLineItemsRequired>[1] = [];

        expect(() => validateFileOrLineItemsRequired(hasFile, lineItems)).toThrow(
          LINE_ITEM_VALIDATION_MESSAGES.FILE_OR_LINE_ITEMS_REQUIRED
        );
      });
    });
  });
});
