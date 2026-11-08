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
  deleteReceivedQuotationQuerySchema,
  statusTransitionSchema,
  RECEIVED_QUOTATION_VALIDATION_MESSAGES,
  LINE_ITEM_VALIDATION_MESSAGES,
  lineItemSchema,
  parseLineItemsFromMultipart,
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
          expect(result.data.netAmount).toBeNull();
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
            netAmount: null,
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
      const input = { quotationId: validUUID };

      const result = receivedQuotationIdParamSchema.safeParse(input);

      expect(result.success).toBe(true);
    });

    it('should reject invalid UUID', () => {
      const input = { quotationId: 'invalid-uuid' };

      const result = receivedQuotationIdParamSchema.safeParse(input);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]!.message).toBe(
          RECEIVED_QUOTATION_VALIDATION_MESSAGES.ID_INVALID_UUID
        );
      }
    });

    it('should reject empty id', () => {
      const input = { quotationId: '' };

      const result = receivedQuotationIdParamSchema.safeParse(input);

      expect(result.success).toBe(false);
    });
  });

  // 削除の基準時刻はクエリ（`?updatedAt=`）で受け取る（2026-10-31 の是正。見積依頼の削除と同じ形）
  describe('deleteReceivedQuotationQuerySchema', () => {
    it('should accept valid updatedAt', () => {
      const input = { updatedAt: '2024-01-15T00:00:00.000Z' };

      const result = deleteReceivedQuotationQuerySchema.safeParse(input);

      expect(result.success).toBe(true);
    });

    it('should reject missing updatedAt', () => {
      const input = {};

      const result = deleteReceivedQuotationQuerySchema.safeParse(input);

      expect(result.success).toBe(false);
    });

    it('should reject invalid datetime format', () => {
      const input = { updatedAt: 'not-a-date' };

      const result = deleteReceivedQuotationQuerySchema.safeParse(input);

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

    /**
     * @requirement estimate-request/REQ-14.2: The システム shall 受領見積書の明細行データ（任意分類、工種、名称、規格、単位、数量、単価、金額、備考）をデータベースに永続化する
     *
     * 本群は当該条文のうち**永続化される欄の構成**を機構として観測する。条文が挙げる九つの
     * 欄（任意分類=customCategory、工種=workType、名称=name、規格=specification、
     * 単位=unit、数量=quantity、単価=unitPrice、金額=amount、備考=remarks）をすべて備えた
     * 明細行を `lineItemSchema` が受理し、解析後の値として取り出せることを主張している。
     * zod は宣言に無い欄を落とすため、欄が一つでもスキーマから欠ければ本群は落ちる。
     * 観測の対象は本番モジュール backend/src/schemas/received-quotation.schema.ts の
     * `lineItemSchema` であり、当該スキーマは
     * backend/src/routes/received-quotation.routes.ts が取り込むため本番の経路に乗る。
     *
     * 実際の書き込み（DELETE + INSERT）を観測するのは
     * backend/src/__tests__/unit/services/received-quotation.service.test.ts の
     * 「明細行の全量置換でDELETE + INSERTが実行される」であり、そちらにも同じ番号を付けた。
     * 本群はその入口の欄構成を、あちらは書き込みの実行を担う。
     *
     * 空振りでないことの実測: `lineItemSchema` から `workType` の宣言を外すと、本群の
     * 「customCategoryとworkTypeを含む完全な明細行を受け入れること (Task 36.4)」を含む
     * 57件中3件が落ちる（2026-09-07 実測。採取は
     * `npm --prefix backend run test -- src/__tests__/unit/schemas/received-quotation.schema.test.ts`。
     * 変異は復元済み）。
     *
     * 従前この条文を名乗っていたのは
     * backend/src/__tests__/unit/models/received-quotation-line-item.model.test.ts と
     * 同 received-quotation-revised.model.test.ts の前書きだけで、いずれも生成された Prisma
     * クライアントのみを取り込むため
     * `npm run check:req-coverage` は「到達しない被覆源のみの受入基準」へ分類していた。
     */
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

/**
 * 受領見積書の台帳の項目と明細行の新しい欄の検証（タスク112.2）
 *
 * 業者名（44.1）、見積の情報（46.1〜46.3）、見積の区別（48.2）、明細行の区分（45.1）・
 * 条件（45.7）・換算（45.8・45.9）・分類キー（47.1）・数量表の行のキー（47.4）・
 * 参考の印と理由（46.4・46.5）・値引きの行の金額（45.4）の境界を主張する。
 * 観測の対象は本番モジュール backend/src/schemas/received-quotation.schema.ts。
 */
describe('received-quotation.schema の台帳の項目（タスク112.2）', () => {
  const baseCreate = {
    name: '受領見積書A',
    submittedAt: '2026-11-08T00:00:00.000Z',
    netAmount: '',
  };
  const baseUpdate = {
    expectedUpdatedAt: '2026-11-08T00:00:00.000Z',
    netAmount: '',
  };
  const baseLine = { name: '項目1', sortOrder: 0, quantity: 1, unitPrice: 100, amount: 100 };
  const fullConversion = {
    quantity: 2.5,
    unit: 'm2',
    unitPrice: 4000,
    basis: '一式を面積で割った',
  };

  const parseLines = (lines: unknown[]) => parseLineItemsFromMultipart(JSON.stringify(lines));

  describe.each([
    ['createReceivedQuotationSchema', createReceivedQuotationSchema, baseCreate],
    ['updateReceivedQuotationSchema', updateReceivedQuotationSchema, baseUpdate],
  ] as const)('%s の台帳の項目', (_label, schema, base) => {
    const parse = (fields: Record<string, unknown>) => schema.safeParse({ ...base, ...fields });
    const field = (fields: Record<string, unknown>, key: string): unknown => {
      const r = parse(fields);
      return r.success ? (r.data as Record<string, unknown>)[key] : 'PARSE_FAILED';
    };
    const firstMessage = (fields: Record<string, unknown>) => {
      const r = parse(fields);
      return r.success ? undefined : r.error.issues[0]?.message;
    };

    it('台帳の項目が無くても従来の入力のまま通ること', () => {
      const r = parse({});
      expect(r.success).toBe(true);
      for (const key of [
        'vendorName',
        'tradingPartnerId',
        'quoteNumber',
        'constructionPrice',
        'distanceKm',
        'adoption',
        'readingStatus',
        'quoteDiscriminator',
      ]) {
        expect(field({}, key)).toBeUndefined();
      }
    });

    it('業者名は1文字と200文字を通し、空と201文字を拒むこと（44.1）', () => {
      expect(RECEIVED_QUOTATION_VALIDATION_MESSAGES.VENDOR_NAME_REQUIRED).toBe(
        '業者名を入力してください'
      );
      expect(field({ vendorName: 'あ' }, 'vendorName')).toBe('あ');
      expect(field({ vendorName: 'あ'.repeat(200) }, 'vendorName')).toBe('あ'.repeat(200));
      expect(firstMessage({ vendorName: '' })).toBe(
        RECEIVED_QUOTATION_VALIDATION_MESSAGES.VENDOR_NAME_REQUIRED
      );
      expect(firstMessage({ vendorName: '   ' })).toBe(
        RECEIVED_QUOTATION_VALIDATION_MESSAGES.VENDOR_NAME_REQUIRED
      );
      expect(firstMessage({ vendorName: 'あ'.repeat(201) })).toBe(
        RECEIVED_QUOTATION_VALIDATION_MESSAGES.VENDOR_NAME_TOO_LONG
      );
    });

    it('業者名の前後の空白を除いて受けること', () => {
      expect(field({ vendorName: '  山田設備  ' }, 'vendorName')).toBe('山田設備');
    });

    it('取引先の ID は UUID か空（null）を受け、それ以外を拒むこと', () => {
      const id = '550e8400-e29b-41d4-a716-446655440000';
      expect(field({ tradingPartnerId: id }, 'tradingPartnerId')).toBe(id);
      expect(field({ tradingPartnerId: '' }, 'tradingPartnerId')).toBeNull();
      expect(parse({ tradingPartnerId: 'not-a-uuid' }).success).toBe(false);
    });

    it.each([
      ['quoteNumber', 100],
      ['overallConditions', 2000],
      ['siteLocation', 100],
      ['useType', 100],
      ['workConditions', 200],
    ])('%s は %i 文字を通し、1文字超えを拒み、空を null にすること（46.1・46.2）', (key, max) => {
      expect(field({ [key]: 'a'.repeat(max) }, key)).toBe('a'.repeat(max));
      const over = parse({ [key]: 'a'.repeat(max + 1) });
      expect(over.success).toBe(false);
      expect(over.success ? undefined : over.error.issues[0]?.path).toEqual([key]);
      expect(field({ [key]: '' }, key)).toBeNull();
    });

    it('改修／新営の区分は RENOVATION・NEW_CONSTRUCTION・空（null）だけを受けること（46.2）', () => {
      expect(field({ constructionKind: 'RENOVATION' }, 'constructionKind')).toBe('RENOVATION');
      expect(field({ constructionKind: 'NEW_CONSTRUCTION' }, 'constructionKind')).toBe(
        'NEW_CONSTRUCTION'
      );
      expect(field({ constructionKind: '' }, 'constructionKind')).toBeNull();
      expect(parse({ constructionKind: 'REPAIR' }).success).toBe(false);
    });

    it.each(['constructionPrice', 'confirmedAmount'])(
      '%s は 0 以上の整数円を FormData の文字から受け、負・小数・数でない文字を拒むこと（46.2・46.3）',
      (key) => {
        expect(field({ [key]: '0' }, key)).toBe(0);
        expect(field({ [key]: '999999999999999' }, key)).toBe(999999999999999);
        expect(field({ [key]: 1500 }, key)).toBe(1500);
        expect(field({ [key]: '' }, key)).toBeNull();
        expect(parse({ [key]: '-1' }).success).toBe(false);
        expect(parse({ [key]: '1.5' }).success).toBe(false);
        expect(parse({ [key]: 'abc' }).success).toBe(false);
        expect(parse({ [key]: '1000000000000000' }).success).toBe(false);
      }
    );

    it('距離は 0 以上の小数第1位までを受け、負と小数第2位を拒むこと（46.2）', () => {
      expect(field({ distanceKm: '0' }, 'distanceKm')).toBe(0);
      expect(field({ distanceKm: '12.3' }, 'distanceKm')).toBe(12.3);
      expect(field({ distanceKm: '99999.9' }, 'distanceKm')).toBe(99999.9);
      expect(field({ distanceKm: '' }, 'distanceKm')).toBeNull();
      expect(parse({ distanceKm: '-0.1' }).success).toBe(false);
      expect(parse({ distanceKm: '1.25' }).success).toBe(false);
      expect(parse({ distanceKm: '100000' }).success).toBe(false);
      expect(parse({ distanceKm: 'abc' }).success).toBe(false);
    });

    it('採否は ADOPTED・REJECTED・UNKNOWN だけを受けること（46.3）', () => {
      for (const v of ['ADOPTED', 'REJECTED', 'UNKNOWN']) {
        expect(field({ adoption: v }, 'adoption')).toBe(v);
      }
      expect(parse({ adoption: 'MAYBE' }).success).toBe(false);
    });

    it('読取の確認は UNCONFIRMED・CONFIRMED だけを受けること（46.6）', () => {
      for (const v of ['UNCONFIRMED', 'CONFIRMED']) {
        expect(field({ readingStatus: v }, 'readingStatus')).toBe(v);
      }
      expect(parse({ readingStatus: 'DONE' }).success).toBe(false);
    });

    /**
     * @requirement estimate-request/REQ-48.2: The システム shall 受領見積書ごとに、見積の区別（同じ原本の中の別の範囲・別案の見積を見分ける文字。前後に空白を持たない100文字まで。既定は空）を保持する
     */
    it('見積の区別は空と100文字を通し、101文字と前後の空白を拒むこと（48.2）', () => {
      expect(field({ quoteDiscriminator: '' }, 'quoteDiscriminator')).toBe('');
      expect(field({ quoteDiscriminator: 'a'.repeat(100) }, 'quoteDiscriminator')).toBe(
        'a'.repeat(100)
      );
      expect(field({ quoteDiscriminator: '別案 B' }, 'quoteDiscriminator')).toBe('別案 B');
      expect(firstMessage({ quoteDiscriminator: 'a'.repeat(101) })).toBe(
        RECEIVED_QUOTATION_VALIDATION_MESSAGES.QUOTE_DISCRIMINATOR_TOO_LONG
      );
      expect(firstMessage({ quoteDiscriminator: ' 別案' })).toBe(
        RECEIVED_QUOTATION_VALIDATION_MESSAGES.QUOTE_DISCRIMINATOR_WHITESPACE
      );
      expect(firstMessage({ quoteDiscriminator: '別案\n' })).toBe(
        RECEIVED_QUOTATION_VALIDATION_MESSAGES.QUOTE_DISCRIMINATOR_WHITESPACE
      );
    });

    it('既存の欄（NET金額）の検証は変わらないこと', () => {
      expect(field({ netAmount: '1000' }, 'netAmount')).toBe(1000);
      expect(field({ netAmount: '' }, 'netAmount')).toBeNull();
    });
  });

  describe('明細行の新しい欄', () => {
    it('新しい欄の無い従来の明細行は、区分を直接工事・参考の印を無・換算を null として通ること（45.1・45.3・46.4）', () => {
      const result = parseLines([baseLine]);
      expect(result![0]).toMatchObject({
        category: 'DIRECT',
        isReference: false,
        conversion: null,
        referenceReason: null,
      });
    });

    it('区分は7つの値を受け、それ以外を拒むこと（45.1）', () => {
      for (const category of [
        'DIRECT',
        'OVERHEAD',
        'TRAVEL',
        'WASTE',
        'DISCOUNT',
        'LEGAL_WELFARE',
        'EXCLUDED',
      ]) {
        const line = { ...baseLine, category, amount: category === 'DISCOUNT' ? -100 : 100 };
        const r = lineItemSchema.safeParse(line);
        expect(r.success && r.data.category).toBe(category);
      }
      expect(lineItemSchema.safeParse({ ...baseLine, category: 'OTHER' }).success).toBe(false);
    });

    it.each([
      ['condition', 500],
      ['classificationKey', 50],
      ['quantityRowKey', 1000],
    ])('%s は %i 文字を通し、1文字超えを拒むこと（45.7・47.1・47.4）', (key, max) => {
      const ok = lineItemSchema.safeParse({ ...baseLine, [key]: 'a'.repeat(max) });
      expect(ok.success && (ok.data as Record<string, unknown>)[key]).toBe('a'.repeat(max));
      expect(lineItemSchema.safeParse({ ...baseLine, [key]: 'a'.repeat(max + 1) }).success).toBe(
        false
      );
      const empty = lineItemSchema.safeParse({ ...baseLine, [key]: null });
      expect(empty.success && (empty.data as Record<string, unknown>)[key]).toBeNull();
    });

    it('分類キーを入力された文字のまま保持すること（47.3）', () => {
      const r = lineItemSchema.safeParse({ ...baseLine, classificationKey: ' A-01.x ' });
      expect(r.success && r.data.classificationKey).toBe(' A-01.x ');
    });

    it('参考の印が有の行は200文字の参考の理由を通し、201文字を拒むこと（46.4）', () => {
      const ok = lineItemSchema.safeParse({
        ...baseLine,
        isReference: true,
        referenceReason: 'a'.repeat(200),
      });
      expect(ok.success && ok.data.referenceReason).toBe('a'.repeat(200));
      expect(
        lineItemSchema.safeParse({
          ...baseLine,
          isReference: true,
          referenceReason: 'a'.repeat(201),
        }).success
      ).toBe(false);
      expect(lineItemSchema.safeParse({ ...baseLine, isReference: 'yes' }).success).toBe(false);
    });

    /**
     * @requirement estimate-request/REQ-46.5: If 参考の印が無の明細行に参考の理由が入力されている場合, then the システム shall 「参考の理由は参考の印を付けた行にだけ入力できます」というバリデーションエラーを表示し、保存しない
     */
    it('参考の印が無の行の参考の理由を、逐語の文言と行の番号つきで拒むこと（46.5）', () => {
      expect(LINE_ITEM_VALIDATION_MESSAGES.REFERENCE_REASON_WITHOUT_REFERENCE).toBe(
        '参考の理由は参考の印を付けた行にだけ入力できます'
      );
      expect(() =>
        parseLines([baseLine, { ...baseLine, sortOrder: 1, referenceReason: '過去の単価' }])
      ).toThrow('明細行の2行目: 参考の理由は参考の印を付けた行にだけ入力できます');
      expect(() =>
        parseLines([{ ...baseLine, isReference: false, referenceReason: '理由' }])
      ).toThrow('明細行の1行目: 参考の理由は参考の印を付けた行にだけ入力できます');
      // 参考の印が無の行で理由が空なら通り、理由は null になる
      expect(parseLines([{ ...baseLine, referenceReason: '' }])![0]!.referenceReason).toBeNull();
    });

    /**
     * @requirement estimate-request/REQ-45.4: If 区分が値引きの明細行の金額が正の値である場合, then the システム shall 「値引きの金額は0以下で入力してください」というバリデーションエラーを表示し、保存しない
     */
    it('値引きの行の正の金額を、逐語の文言と行の番号つきで拒み、0以下は通すこと（45.4）', () => {
      expect(LINE_ITEM_VALIDATION_MESSAGES.DISCOUNT_AMOUNT_POSITIVE).toBe(
        '値引きの金額は0以下で入力してください'
      );
      expect(() =>
        parseLines([
          baseLine,
          baseLine,
          { ...baseLine, category: 'DISCOUNT', quantity: null, unitPrice: null, amount: 1 },
        ])
      ).toThrow('明細行の3行目: 値引きの金額は0以下で入力してください');
      // 金額が空で数量×単価が正になる値引きの行も拒む（サーバーが金額を求めるため。45.12）
      expect(() =>
        parseLines([
          { ...baseLine, category: 'DISCOUNT', quantity: 1, unitPrice: 500, amount: null },
        ])
      ).toThrow('明細行の1行目: 値引きの金額は0以下で入力してください');
      expect(
        parseLines([
          { ...baseLine, category: 'DISCOUNT', quantity: 1, unitPrice: -500, amount: -500 },
        ])
      ).toHaveLength(1);
      expect(parseLines([{ ...baseLine, category: 'DISCOUNT', amount: 0 }])).toHaveLength(1);
      // 値引き以外の区分は正の金額を通す
      expect(parseLines([{ ...baseLine, category: 'OVERHEAD', amount: 100 }])).toHaveLength(1);
    });

    /**
     * @requirement estimate-request/REQ-45.9: If 換算の数量・単位・単価・根拠の一部だけが入力されている、または換算の数量が0以下である場合, then the システム shall 「換算は数量・単位・単価・根拠をすべて入力してください（数量は0より大きい値）」というバリデーションエラーを表示し、保存しない
     */
    it('換算の一部だけと数量0以下を、逐語の文言と行の番号つきで拒むこと（45.9）', () => {
      const message = '換算は数量・単位・単価・根拠をすべて入力してください（数量は0より大きい値）';
      expect(LINE_ITEM_VALIDATION_MESSAGES.CONVERSION_INCOMPLETE).toBe(message);
      for (const missing of ['quantity', 'unit', 'unitPrice', 'basis'] as const) {
        const blank = missing === 'unit' || missing === 'basis' ? '' : null;
        const conversion = { ...fullConversion, [missing]: blank };
        expect(() => parseLines([baseLine, { ...baseLine, conversion }])).toThrow(
          `明細行の2行目: ${message}`
        );
      }
      // 根拠が空白だけのものは入力が無いとみる
      expect(() =>
        parseLines([{ ...baseLine, conversion: { ...fullConversion, basis: '   ' } }])
      ).toThrow(`明細行の1行目: ${message}`);
      expect(() =>
        parseLines([{ ...baseLine, conversion: { ...fullConversion, quantity: 0 } }])
      ).toThrow(`明細行の1行目: ${message}`);
      expect(() =>
        parseLines([{ ...baseLine, conversion: { ...fullConversion, quantity: -1 } }])
      ).toThrow(`明細行の1行目: ${message}`);
    });

    it('換算は4つすべてあれば通り、すべて無ければ null になること（45.8）', () => {
      const [full] = parseLines([{ ...baseLine, conversion: fullConversion }])!;
      expect(full!.conversion).toEqual(fullConversion);
      const [none] = parseLines([
        { ...baseLine, conversion: { quantity: null, unit: '', unitPrice: null, basis: '' } },
      ])!;
      expect(none!.conversion).toBeNull();
      const [absent] = parseLines([{ ...baseLine, conversion: null }])!;
      expect(absent!.conversion).toBeNull();
    });

    it('換算の単位は50文字・根拠は500文字までを通し、超えると拒むこと（45.8）', () => {
      const atMax = { ...fullConversion, unit: 'a'.repeat(50), basis: 'a'.repeat(500) };
      const ok = lineItemSchema.safeParse({ ...baseLine, conversion: atMax });
      expect(ok.success && ok.data.conversion).toEqual(atMax);
      expect(
        lineItemSchema.safeParse({
          ...baseLine,
          conversion: { ...fullConversion, unit: 'a'.repeat(51) },
        }).success
      ).toBe(false);
      expect(
        lineItemSchema.safeParse({
          ...baseLine,
          conversion: { ...fullConversion, basis: 'a'.repeat(501) },
        }).success
      ).toBe(false);
    });

    it('換算の数量・単価は DB の桁（Decimal(15,4)・Decimal(15,2)）に収まる値まで通し、超えると拒むこと（タスク113.3）', () => {
      const maxQuantity = 99_999_999_999.9999;
      const maxUnitPrice = 9_999_999_999_999.99;
      const atMax = { ...fullConversion, quantity: maxQuantity, unitPrice: maxUnitPrice };
      const ok = lineItemSchema.safeParse({ ...baseLine, conversion: atMax });
      expect(ok.success && ok.data.conversion).toEqual(atMax);
      const negativeAtMax = { ...fullConversion, unitPrice: -maxUnitPrice };
      expect(lineItemSchema.safeParse({ ...baseLine, conversion: negativeAtMax }).success).toBe(
        true
      );

      expect(() =>
        parseLines([{ ...baseLine, conversion: { ...fullConversion, quantity: 100_000_000_000 } }])
      ).toThrow(`明細行の1行目: ${LINE_ITEM_VALIDATION_MESSAGES.CONVERSION_QUANTITY_OUT_OF_RANGE}`);
      for (const unitPrice of [10_000_000_000_000, -10_000_000_000_000]) {
        expect(() =>
          parseLines([{ ...baseLine, conversion: { ...fullConversion, unitPrice } }])
        ).toThrow(
          `明細行の1行目: ${LINE_ITEM_VALIDATION_MESSAGES.CONVERSION_UNIT_PRICE_OUT_OF_RANGE}`
        );
      }
    });

    it('明細行の検証のエラーに行の番号を添えること', () => {
      expect(() => parseLines([baseLine, { sortOrder: 1 }])).toThrow(/^明細行の2行目: /);
    });
  });
});
