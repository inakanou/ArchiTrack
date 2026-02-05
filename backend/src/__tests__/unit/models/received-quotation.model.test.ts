/**
 * @fileoverview ReceivedQuotationモデルのスキーマ定義テスト（改訂版: Task 20.2）
 *
 * TDD: Prismaスキーマで定義するReceivedQuotationモデルの型検証
 *
 * Requirements (estimate-request):
 * - REQ-11.1-11.30: 受領見積書登録機能
 *   - 見積依頼に対する返答として協力業者から届いた受領見積書を登録
 *   - ファイルアップロードと構造化データ入力の共存モデル
 *
 * Design Specification:
 * - ReceivedQuotationテーブル: 見積依頼との関連付け、受領見積書名、提出日
 * - ファイルアップロード（任意）と構造化明細行データ（任意）の共存を許可
 * - ファイルまたは明細行データのいずれか一方は必須
 * - ファイル情報フィールド（パス、名前、MIMEタイプ、サイズ）
 * - 論理削除（deletedAt）と楽観的排他制御（updatedAt）
 * - インデックス設定（estimateRequestId、deletedAt、createdAt）
 * - lineItemsリレーション（ReceivedQuotationLineItem）
 */

import { describe, it, expect } from 'vitest';
import { Prisma } from '../../../generated/prisma/client.js';

describe('ReceivedQuotation Model Schema', () => {
  describe('ReceivedQuotation CreateInput type structure', () => {
    it('should require mandatory fields for creation without file', () => {
      // REQ-11.3, 11.4: 受領見積書の必須フィールドの検証
      const validInput: Prisma.ReceivedQuotationCreateInput = {
        name: 'テスト受領見積書',
        submittedAt: new Date('2026-01-20'),
        estimateRequest: { connect: { id: 'estimate-request-id' } },
      };

      expect(validInput.name).toBe('テスト受領見積書');
      expect(validInput.submittedAt).toBeInstanceOf(Date);
    });

    it('should accept file information fields', () => {
      // REQ-11.6, 11.8: ファイルアップロード
      const validInput: Prisma.ReceivedQuotationCreateInput = {
        name: 'テスト受領見積書',
        submittedAt: new Date('2026-01-20'),
        filePath: 'quotations/uuid/filename.pdf',
        fileName: 'quotation.pdf',
        fileMimeType: 'application/pdf',
        fileSize: 1024000,
        estimateRequest: { connect: { id: 'estimate-request-id' } },
      };

      expect(validInput.name).toBe('テスト受領見積書');
      expect(validInput.filePath).toBe('quotations/uuid/filename.pdf');
      expect(validInput.fileName).toBe('quotation.pdf');
      expect(validInput.fileMimeType).toBe('application/pdf');
      expect(validInput.fileSize).toBe(1024000);
    });

    it('should have estimateRequest relation', () => {
      // 見積依頼との関連付け
      const input: Prisma.ReceivedQuotationCreateInput = {
        name: 'テスト受領見積書',
        submittedAt: new Date(),
        estimateRequest: { connect: { id: 'estimate-request-id' } },
      };

      expect(input.estimateRequest).toBeDefined();
    });

    it('should accept nested lineItems creation', () => {
      // REQ-11.9: 構造化データ入力エリア
      const input: Prisma.ReceivedQuotationCreateInput = {
        name: 'テスト受領見積書',
        submittedAt: new Date(),
        estimateRequest: { connect: { id: 'estimate-request-id' } },
        lineItems: {
          create: [
            {
              sortOrder: 0,
              name: '外壁塗装',
              specification: 'シリコン樹脂塗料',
              unit: 'm2',
              quantity: 150.5,
              unitPrice: 3500,
              amount: 526750,
            },
          ],
        },
      };

      expect(input.lineItems).toBeDefined();
    });
  });

  describe('ReceivedQuotation fields validation', () => {
    it('should have id field as UUID', () => {
      // 受領見積書の一意ID
      const quotationSelect: Prisma.ReceivedQuotationSelect = {
        id: true,
      };
      expect(quotationSelect.id).toBe(true);
    });

    it('should have name field', () => {
      // REQ-11.3: 受領見積書名フィールド（必須、最大200文字）
      const quotationSelect: Prisma.ReceivedQuotationSelect = {
        name: true,
      };
      expect(quotationSelect.name).toBe(true);
    });

    it('should have submittedAt field', () => {
      // REQ-11.4: 提出日フィールド
      const quotationSelect: Prisma.ReceivedQuotationSelect = {
        submittedAt: true,
      };
      expect(quotationSelect.submittedAt).toBe(true);
    });

    it('should have file information fields', () => {
      // REQ-11.6, 11.8: ファイルアップロードフィールド
      const quotationSelect: Prisma.ReceivedQuotationSelect = {
        filePath: true,
        fileName: true,
        fileMimeType: true,
        fileSize: true,
      };
      expect(quotationSelect.filePath).toBe(true);
      expect(quotationSelect.fileName).toBe(true);
      expect(quotationSelect.fileMimeType).toBe(true);
      expect(quotationSelect.fileSize).toBe(true);
    });

    it('should have timestamp fields', () => {
      // 楽観的排他制御用のタイムスタンプ
      const quotationSelect: Prisma.ReceivedQuotationSelect = {
        createdAt: true,
        updatedAt: true,
      };
      expect(quotationSelect.createdAt).toBe(true);
      expect(quotationSelect.updatedAt).toBe(true);
    });

    it('should have deletedAt field for soft delete', () => {
      // 論理削除フィールド
      const quotationSelect: Prisma.ReceivedQuotationSelect = {
        deletedAt: true,
      };
      expect(quotationSelect.deletedAt).toBe(true);
    });

    it('should have estimateRequestId field', () => {
      // 見積依頼IDフィールド（外部キー）
      const quotationSelect: Prisma.ReceivedQuotationSelect = {
        estimateRequestId: true,
      };
      expect(quotationSelect.estimateRequestId).toBe(true);
    });

    it('should have lineItems relation', () => {
      // REQ-11.9: 明細行リレーション
      const quotationSelect: Prisma.ReceivedQuotationSelect = {
        lineItems: true,
      };
      expect(quotationSelect.lineItems).toBe(true);
    });
  });

  describe('ReceivedQuotation relations', () => {
    it('should have estimateRequest relation', () => {
      // 見積依頼へのリレーション
      const quotationSelect: Prisma.ReceivedQuotationSelect = {
        estimateRequest: true,
        estimateRequestId: true,
      };
      expect(quotationSelect.estimateRequest).toBe(true);
      expect(quotationSelect.estimateRequestId).toBe(true);
    });
  });

  describe('ReceivedQuotation filter and sort fields', () => {
    it('should allow filtering by estimateRequestId', () => {
      // 見積依頼IDでのフィルタリング
      const where: Prisma.ReceivedQuotationWhereInput = {
        estimateRequestId: 'estimate-request-id',
      };
      expect(where.estimateRequestId).toBeDefined();
    });

    it('should allow filtering by name', () => {
      // 受領見積書名でのフィルタリング
      const where: Prisma.ReceivedQuotationWhereInput = {
        name: { contains: 'テスト' },
      };
      expect(where.name).toBeDefined();
    });

    it('should allow filtering by file presence', () => {
      // ファイルの有無でのフィルタリング
      const where: Prisma.ReceivedQuotationWhereInput = {
        filePath: { not: null },
      };
      expect(where.filePath).toBeDefined();
    });

    it('should allow filtering by deletedAt (soft delete)', () => {
      // 論理削除されていないレコードのフィルタリング
      const where: Prisma.ReceivedQuotationWhereInput = {
        deletedAt: null,
      };
      expect(where.deletedAt).toBeNull();
    });

    it('should allow sorting by createdAt', () => {
      // 作成日時でのソート
      const orderBy: Prisma.ReceivedQuotationOrderByWithRelationInput = {
        createdAt: 'desc',
      };
      expect(orderBy.createdAt).toBe('desc');
    });

    it('should allow sorting by submittedAt', () => {
      // 提出日でのソート
      const orderBy: Prisma.ReceivedQuotationOrderByWithRelationInput = {
        submittedAt: 'asc',
      };
      expect(orderBy.submittedAt).toBe('asc');
    });

    it('should allow sorting by name', () => {
      // 受領見積書名でのソート
      const orderBy: Prisma.ReceivedQuotationOrderByWithRelationInput = {
        name: 'asc',
      };
      expect(orderBy.name).toBe('asc');
    });
  });
});
